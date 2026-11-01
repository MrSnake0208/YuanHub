package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.controller.operator.request.OperatorCatalogDiscRequest
import com.lhs.share.hub.controller.operator.request.OperatorCatalogStarStoneRequest
import com.lhs.share.hub.controller.operator.request.OperatorCatalogWriteRequest
import com.lhs.share.hub.controller.operator.response.OperatorOddityRules
import com.lhs.share.hub.repository.OperatorCatalogRepository
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.OperatorDiscCatalog
import com.lhs.share.hub.repository.entity.OperatorStarStoneCatalog
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.multipart.MultipartFile
import java.time.Instant

/**
 * 密探公共图鉴管理（管理员）核心业务单测：目录的增删改查、校验与头像上传/清理。
 * 权限校验本身在控制器层（AdminOperatorCatalogController），由契约测试覆盖。
 */
class OperatorCatalogServiceTest {
    private val repository = mockk<OperatorCatalogRepository>()
    private val avatarStorage = mockk<AvatarStorage>(relaxed = true)
    private val service = OperatorCatalogService(repository, ObjectMapper(), avatarStorage)

    private fun seed(existing: List<OperatorCatalogEntity> = emptyList()) {
        every { repository.count() } returns 1L // 跳过资源文件整体播种，走"老库回填"路径
        // 回填扫描：老库行一律视为不存在 => 不产生任何 save
        every { repository.findByOperatorId(any()) } returns null
        every { repository.findAllByOrderByOperatorIdAsc() } returns existing
    }

    private fun writeRequest() = OperatorCatalogWriteRequest(
        id = "char_090_new",
        name = "新密探",
        alias = "new alias",
        rarity = 5,
        specialOddityName = "增伤值",
        prof = listOf("阳"),
        subProf = listOf("shenji"),
        games = listOf("如鸢", "代号鸢"),
        discs = listOf(OperatorCatalogDiscRequest(otName = "初始能量+1")),
        starStones = listOf(OperatorCatalogStarStoneRequest("主星石", "main")),
        spOf = null,
    )

    @Test
    fun `read only lookup does not initialize or backfill the catalog`() {
        every { repository.findByOperatorId("missing") } returns null
        assertNull(service.getOperatorReadOnly("missing"))
        verify(exactly = 0) { repository.count() }
        verify(exactly = 0) { repository.save(any()) }
        verify(exactly = 0) { avatarStorage.delete(any()) }
    }

    @Test
    fun `create saves a new operator with a fresh catalog version`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        val entity = service.create(writeRequest())

        assertEquals("char_090_new", saved.captured.operatorId)
        assertEquals("新密探", saved.captured.name)
        assertEquals("增伤值", saved.captured.specialOddityName)
        assertEquals(15, entity.odditySchema.special.max)
        assertEquals(emptyList<String>(), entity.incompleteFields)
        assertEquals(saved.captured.catalogVersion, entity.catalogVersion)
        assertNotEquals("", entity.catalogVersion)
    }

    @Test
    fun `create requires a non-blank special oddity name after trimming`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null

        listOf(null, "   ", "x".repeat(33)).forEach { value ->
            val error = assertThrows(OperatorApiException::class.java) {
                service.create(writeRequest().copy(specialOddityName = value))
            }
            assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.status)
            assertEquals("schema_validation_failed", error.code)
        }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `create rejects a duplicate operator id with conflict`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns existing("char_090_new")

        val e = assertThrows(OperatorApiException::class.java) { service.create(writeRequest()) }
        assertEquals(HttpStatus.CONFLICT, e.status)
        assertEquals("operator_conflict", e.code)
    }

    @Test
    fun `update rejects path id and body id mismatch`() {
        seed()
        val e = assertThrows(OperatorApiException::class.java) { service.update("char_other", writeRequest()) }
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertEquals("schema_validation_failed", e.code)
    }

    @Test
    fun `update throws not found when operator is absent`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        val e = assertThrows(OperatorApiException::class.java) { service.update("char_090_new", writeRequest()) }
        assertEquals(HttpStatus.NOT_FOUND, e.status)
        assertEquals("operator_not_found", e.code)
    }

    @Test
    fun `update preserves mongo id and createdAt but bumps version`() {
        seed()
        val row = existing("char_090_new", createdAt = Instant.parse("2026-08-01T00:00:00Z"))
        every { repository.findByOperatorId("char_090_new") } returns row
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        service.update("char_090_new", writeRequest().copy(name = "改名"))

        val updated = saved.captured
        assertEquals(row.id, updated.id)
        assertEquals(row.createdAt, updated.createdAt)
        assertEquals("改名", updated.name)
        assertEquals("增伤值", updated.specialOddityName)
        assertNotEquals(row.catalogVersion, updated.catalogVersion)
    }

    @Test
    fun `update null preserves the old special name and explicit value is trimmed and bumps version`() {
        seed()
        val row = existing("char_090_new").copy(specialOddityName = "免伤值")
        every { repository.findByOperatorId("char_090_new") } returns row
        val saved = mutableListOf<OperatorCatalogEntity>()
        every { repository.save(any()) } answers { firstArg<OperatorCatalogEntity>().also(saved::add) }

        val preserved = service.update("char_090_new", writeRequest().copy(specialOddityName = null))
        val changed = service.update("char_090_new", writeRequest().copy(specialOddityName = "  治疗加成  "))

        assertEquals("免伤值", preserved.specialOddityName)
        assertEquals("免伤值", saved[0].specialOddityName)
        assertEquals("治疗加成", changed.specialOddityName)
        assertEquals("治疗加成", saved[1].specialOddityName)
        assertNotEquals(row.catalogVersion, saved[1].catalogVersion)
    }

    @Test
    fun `oddity rules derive exact limits for rarities three four and five`() {
        val three = OperatorOddityRules.schema(3, "增伤值")
        val four = OperatorOddityRules.schema(4, "免伤值")
        val five = OperatorOddityRules.schema(5, "治疗加成")

        assertEquals(listOf(300, 1560, 9), listOf(three.attack.max, three.hp.max, three.special.max))
        assertEquals(listOf(350, 1820, 11), listOf(four.attack.max, four.hp.max, four.special.max))
        assertEquals(listOf(500, 2600, 15), listOf(five.attack.max, five.hp.max, five.special.max))
    }

    @Test
    fun `delete removes the row and persists the version bump on a remaining row`() {
        seed(listOf(existing("char_001"), existing("char_002")))
        every { repository.findByOperatorId("char_001") } returns existing("char_001")
        every { repository.delete(any()) } returns Unit
        every { repository.findAllByOrderByOperatorIdAsc() } returns listOf(existing("char_002"))
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        service.delete("char_001")

        verify { repository.delete(any()) }
        assertEquals("char_002", saved.captured.operatorId)
    }

    @Test
    fun `delete throws not found when operator is absent`() {
        seed()
        every { repository.findByOperatorId("missing") } returns null
        val e = assertThrows(OperatorApiException::class.java) { service.delete("missing") }
        assertEquals(HttpStatus.NOT_FOUND, e.status)
    }

    @Test
    fun `listForAdmin returns full internal entities ordered by id`() {
        val rows = listOf(existing("char_002"), existing("char_001"))
        seed(rows)
        every { repository.findAllByOrderByOperatorIdAsc() } returns rows
        assertEquals(listOf("char_002", "char_001"), service.listForAdmin().map { it.id })
    }

    @Test
    fun `validate rejects unsupported game`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        val e = assertThrows(OperatorApiException::class.java) {
            service.create(writeRequest().copy(games = listOf("其他")))
        }
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertEquals("invalid_game", e.code)
    }

    @Test
    fun `validate rejects duplicate disc ot_name`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        val req = writeRequest().copy(
            discs = listOf(OperatorCatalogDiscRequest("初始能量+1"), OperatorCatalogDiscRequest("初始能量+1")),
        )
        val e = assertThrows(OperatorApiException::class.java) { service.create(req) }
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertEquals("invalid_disc", e.code)
    }

    @Test
    fun `validate rejects duplicate star stone type`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        val req = writeRequest().copy(
            starStones = listOf(
                OperatorCatalogStarStoneRequest("主星石", "main"),
                OperatorCatalogStarStoneRequest("主星石二号", "main"),
            ),
        )
        val e = assertThrows(OperatorApiException::class.java) { service.create(req) }
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertEquals("invalid_star_stone", e.code)
    }

    @Test
    fun `movie relations cannot point to another movie or delete a referenced base`() {
        seed()
        val base = existing("base")
        val movie = existing("movie").copy(spOf = "base")
        every { repository.findByOperatorId("char_090_new") } returns null
        every { repository.findByOperatorId("base") } returns base
        every { repository.findByOperatorId("movie") } returns movie
        every { repository.findAllByOrderByOperatorIdAsc() } returns listOf(base, movie)
        val error = assertThrows(OperatorApiException::class.java) { service.create(writeRequest().copy(spOf = "movie")) }
        assertEquals("invalid_sp_relation", error.code)
        val deletion = assertThrows(OperatorApiException::class.java) { service.delete("base") }
        assertEquals("operator_has_forms", deletion.code)
        io.mockk.verify(exactly = 0) { repository.delete(any()) }
    }

    @Test
    fun `validate rejects spOf referencing itself`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        val e = assertThrows(OperatorApiException::class.java) {
            service.create(writeRequest().copy(spOf = "char_090_new"))
        }
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertEquals("schema_validation_failed", e.code)
    }

    @Test
    fun `validate rejects spOf referencing an unknown base`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        every { repository.findByOperatorId("char_missing") } returns null
        val e = assertThrows(OperatorApiException::class.java) {
            service.create(writeRequest().copy(spOf = "char_missing"))
        }
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertEquals("unknown_operator_id", e.code)
    }

    @Test
    fun `already-seeded catalog is backfilled with spOf from the resource`() {
        // 模拟升级前播种的老库：目录非空、SP 行没有 spOf。
        val oldSp = existing("char_085_shizimiaosp").copy(rarity = 5, prof = listOf("混沌"), games = listOf("如鸢", "代号鸢"))
        every { repository.count() } returns 1L
        every { repository.findByOperatorId(any()) } returns null
        every { repository.findByOperatorId("char_085_shizimiaosp") } returns oldSp
        every { repository.findAllByOrderByOperatorIdAsc() } returns listOf(oldSp)
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        service.catalog() // 触发 ensureSeeded 回填

        // 资源文件中 char_085_shizimiaosp 的 spOf = char_023_shizimiao
        assertEquals("char_023_shizimiao", saved.captured.spOf)
        assertEquals(oldSp.id, saved.captured.id) // 保留 mongo _id
        assertEquals(oldSp.createdAt, saved.captured.createdAt) // 保留创建时间
        assertEquals("2026-08-16", saved.captured.catalogVersion) // 版本不重置
    }

    @Test
    fun `already-set spOf is never overwritten by backfill`() {
        val withSp = existing("char_085_shizimiaosp").copy(spOf = "char_evil")
        every { repository.count() } returns 1L
        every { repository.findByOperatorId(any()) } returns null
        every { repository.findByOperatorId("char_085_shizimiaosp") } returns withSp
        every { repository.findAllByOrderByOperatorIdAsc() } returns listOf(withSp)

        service.catalog() // 触发 ensureSeeded

        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `resource special name backfills only null and carries a detectable catalog version`() {
        val resource = ObjectMapper().readTree("""{"spOf":"char_base","specialOddityName":"  免伤值  "}""")
        val missing = existing("char_missing").copy(specialOddityName = null)
        val maintained = existing("char_maintained").copy(specialOddityName = "管理员名称")

        val backfilled = service.mergeResourceFields(missing, resource, "catalog-backfill-v2")
        val preserved = service.mergeResourceFields(maintained, resource, "catalog-backfill-v2")

        assertEquals("免伤值", backfilled.specialOddityName)
        assertEquals("catalog-backfill-v2", backfilled.catalogVersion)
        assertEquals("管理员名称", preserved.specialOddityName)
        assertEquals(maintained.catalogVersion, preserved.catalogVersion)
    }

    @Test
    fun `fresh resource parsing reads special oddity name without persisting derived schema`() {
        val resource = ObjectMapper().readTree(
            """{"id":"char_999_test","name":"测试","rarity":4,"prof":["阳"],"subProf":[],"games":["代号鸢"],"discs":[],"starStones":[],"specialOddityName":"免伤值"}""",
        )

        val entity = service.fromResource(resource, "catalog-v1")!!

        assertEquals("免伤值", entity.specialOddityName)
        assertEquals(4, entity.rarity)
    }

    @Test
    fun `runtime resource carries all high-confidence captured special oddity names`() {
        val rows = requireNotNull(javaClass.classLoader.getResourceAsStream("operator/operators.json")).use {
            ObjectMapper().readTree(it)
        }
        val maintained = rows.filter { it.path("specialOddityName").asText().isNotBlank() }
        val missingIds = rows
            .filter { it.path("specialOddityName").asText().isBlank() }
            .map { it.path("id").asText() }
            .toSet()

        assertEquals(116, maintained.size)
        assertEquals(setOf("增伤值", "免伤值", "治疗加成"), maintained.map { it.path("specialOddityName").asText() }.toSet())
        assertEquals(
            setOf(
                "char_023_shizimiao",
                "char_084_chendengsp",
                "char_102_jianyong",
                "char_119_sunjing",
                "char_122_zhangsong",
            ),
            missingIds,
        )
    }

    private fun existing(
        id: String,
        createdAt: Instant = Instant.parse("2026-08-01T00:00:00Z"),
        avatar: String? = null,
    ): OperatorCatalogEntity {
        return OperatorCatalogEntity(
            id = "mongo_" + id,
            operatorId = id,
            name = id,
            rarity = 5,
            prof = listOf("阳"),
            subProf = emptyList(),
            games = listOf("如鸢"),
            discs = listOf(OperatorDiscCatalog("初始能量+1")),
            starStones = listOf(OperatorStarStoneCatalog("主星石", "main")),
            avatar = avatar,
            specialOddityName = "增伤值",
            catalogVersion = "2026-08-16",
            createdAt = createdAt,
        )
    }

    // —— 头像上传 / 清理 ——

    @Test
    fun `update preserves the existing avatar across full overwrite`() {
        seed()
        val row = existing("char_090_new", avatar = "/avatar/char_090_new.webp")
        every { repository.findByOperatorId("char_090_new") } returns row
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        service.update("char_090_new", writeRequest().copy(name = "改名"))

        assertEquals("/avatar/char_090_new.webp", saved.captured.avatar)
        assertEquals("改名", saved.captured.name)
    }

    @Test
    fun `setAvatar stores the storage path onto the operator`() {
        seed()
        val row = existing("char_090_new")
        every { repository.findByOperatorId("char_090_new") } returns row
        every { avatarStorage.save(any(), any()) } returns "/avatar/char_090_new.webp"
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        val file = mockk<MultipartFile>()
        service.setAvatar("char_090_new", file)

        verify { avatarStorage.save("char_090_new", file) }
        assertEquals("/avatar/char_090_new.webp", saved.captured.avatar)
    }

    @Test
    fun `setAvatar does not bump the catalog version`() {
        seed()
        val row = existing("char_090_new", avatar = "/avatar/char_090_new.webp")
        every { repository.findByOperatorId("char_090_new") } returns row
        every { avatarStorage.save(any(), any()) } returns "/avatar/char_090_new.webp"
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        service.setAvatar("char_090_new", mockk())

        assertEquals(row.catalogVersion, saved.captured.catalogVersion)
    }

    @Test
    fun `setAvatar throws not found when operator is absent`() {
        seed()
        every { repository.findByOperatorId("char_090_new") } returns null
        val e = assertThrows(OperatorApiException::class.java) { service.setAvatar("char_090_new", mockk()) }
        assertEquals(HttpStatus.NOT_FOUND, e.status)
    }

    @Test
    fun `clearAvatar removes the file and nulls the avatar field`() {
        seed()
        val row = existing("char_090_new", avatar = "/avatar/char_090_new.webp")
        every { repository.findByOperatorId("char_090_new") } returns row
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        service.clearAvatar("char_090_new")

        verify { avatarStorage.delete("char_090_new") }
        assertNull(saved.captured.avatar)
    }

    @Test
    fun `delete cascades cleaning the avatar file`() {
        seed(listOf(existing("char_001"), existing("char_002")))
        every { repository.findByOperatorId("char_001") } returns existing("char_001")
        every { repository.delete(any()) } returns Unit
        every { repository.findAllByOrderByOperatorIdAsc() } returns listOf(existing("char_002"))
        every { repository.save(any()) } answers { firstArg() }

        service.delete("char_001")

        verify { avatarStorage.delete("char_001") }
    }

    // —— 存量头像回填（目录里已有的文件 → 关联 avatar 字段） ——

    @Test
    fun `existing avatars are backfilled from the directory without overwriting set ones`() {
        val rowNull = existing("char_001_yangxiu")
        val rowSet = existing("char_002_jiaxu", avatar = "/avatar/char_002_jiaxu.webp")
        every { repository.count() } returns 1L
        every { repository.findByOperatorId(any()) } returns null
        every { repository.findByOperatorId("char_001_yangxiu") } returns rowNull
        every { repository.findByOperatorId("char_002_jiaxu") } returns rowSet
        every { repository.findAllByOrderByOperatorIdAsc() } returns listOf(rowNull, rowSet)
        every { avatarStorage.existingOperatorIds() } returns setOf("char_001_yangxiu", "char_002_jiaxu", "char_999_ghost")
        every { avatarStorage.relativePath(any()) } answers { "/avatar/${firstArg<String>()}.webp" }
        val saved = slot<OperatorCatalogEntity>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        service.catalog() // 触发 ensureSeeded → 回填

        // 只回填了 avatar 为 null 的 char_001；char_002 已设置不覆盖；char_999 目录行不存在不重插
        assertEquals("/avatar/char_001_yangxiu.webp", saved.captured.avatar)
        verify(exactly = 1) { repository.save(any()) }
    }
}
