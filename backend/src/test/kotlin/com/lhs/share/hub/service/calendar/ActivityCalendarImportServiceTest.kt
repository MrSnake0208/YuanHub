package com.lhs.share.hub.service.calendar

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException

class ActivityCalendarImportServiceTest {
    private val repository = mockk<ActivityCalendarRepository>()
    private val recruitment = mockk<RecruitmentCatalogRepository>()
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val calendar = ActivityCalendarService(repository, recruitment)
    private val importer = ActivityCalendarImportService(calendar, repository, mapper)
    private val item = """{"game":"如鸢","title":" 活动 ","category":"ACTIVITY","start_date":"2026-10-10","end_date":"2026-10-20"}"""
    private fun batch(vararg items: String) = """{"schema_version":1,"items":[${items.joinToString(",") }]}"""

    @BeforeEach
    fun setup() {
        every { repository.list(null, null, null, emptySet(), null) } returns emptyList()
        every { repository.insert(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
    }

    @Test
    fun `mixed games and all manual types share create validation defaults and audit with read only preview`() {
        val items = listOf("ACTIVITY", "LOGIN", "SHOP", "MAINTENANCE", "OTHER").mapIndexed { i, category ->
            item.replace("ACTIVITY", category).replace("如鸢", if (i % 2 == 0) "代号鸢" else "如鸢")
        } + (item.dropLast(1) + ",\"start_time\":\"05:00\",\"end_time\":\"23:59\",\"enabled\":false}")
        val json = batch(*items.toTypedArray())
        val preview = importer.preview(json)
        assertEquals(6, preview.ready)
        assertEquals(5, preview.publicCount)
        assertEquals("活动", preview.rows[0].data!!.title)
        assertEquals("Asia/Shanghai", preview.rows[0].data!!.timeZone)
        verify(exactly = 0) {
            repository.insert(any())
            repository.save(any())
        }
        val result = importer.commit("editor", json, preview.previewToken)
        assertEquals(6, result.created)
        verify(exactly = 6) {
            repository.insert(
                match {
                    it.createdBy == "editor" && it.updatedBy == "editor" &&
                        it.id.startsWith("evt_import_")
                },
            )
        }
        verify { recruitment wasNot io.mockk.Called }
    }

    @Test
    fun `invalid row errors identify field and block all writes`() {
        val badFields = mapOf(
            "game" to "\"其他游戏\"", "title" to "\" \"", "category" to "\"RECRUITMENT\"",
            "start_date" to "\"2026-02-30\"", "end_date" to "\"2026-01-01\"", "enabled" to "\"true\"",
            "time_zone" to "\"Not/AZone\"", "source_url" to "\"javascript:alert(1)\"", "description" to "123",
        )
        badFields.forEach { (field, value) ->
            val node = mapper.readTree(item).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
            node.set<com.fasterxml.jackson.databind.JsonNode>(field, mapper.readTree(value))
            val json = batch(item, node.toString())
            val report = importer.preview(json)
            assertEquals(1, report.invalid, field)
            assertEquals(2, report.rows[1].row)
            assertEquals(field, report.rows[1].issues.single().field)
            assertThrows(ActivityCalendarApiException::class.java) { importer.commit("editor", json, report.previewToken) }
        }
        verify(exactly = 0) {
            repository.save(any())
            repository.insert(any())
        }
    }

    @Test
    fun `unknown managed fields scalar coercion dates times enums lengths and required values rejected`() {
        val invalid = listOf(
            "id" to "\"x\"", "version" to "0", "expected_version" to "null", "source_type" to "\"MANUAL\"",
            "source_ref" to "null", "extra" to "true", "category" to "0", "category" to "\"UNKNOWN\"",
            "title" to "123", "title" to "null", "title" to mapper.writeValueAsString("a".repeat(121)),
            "start_date" to "\"2026-1-01\"", "end_date" to "123", "time_zone" to "null", "enabled" to "null",
            "source_note" to mapper.writeValueAsString("a".repeat(1001)),
            "description" to mapper.writeValueAsString("a".repeat(1001)),
            "source_url" to mapper.writeValueAsString("https://example.com/" + "a".repeat(2049)),
            "start_time" to "\"25:00\"", "end_time" to "\"05:00\"",
        )
        invalid.forEach { (field, value) ->
            val node = mapper.readTree(item).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
            node.set<com.fasterxml.jackson.databind.JsonNode>(field, mapper.readTree(value))
            assertEquals("INVALID", importer.preview(batch(node.toString())).rows.single().status, field)
        }
        for (field in listOf("game", "title", "category", "start_date")) {
            val node = mapper.readTree(item).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
            node.remove(field)
            assertEquals(field, importer.preview(batch(node.toString())).rows.single().issues.single().field)
        }
        val sameDay = item.replace("2026-10-20", "2026-10-10").dropLast(1) + ",\"start_time\":\"20:00\",\"end_time\":\"05:00\"}"
        assertEquals("end_time", importer.preview(batch(sameDay)).rows.single().issues.single().field)
        val badTime = item.dropLast(1) + ",\"start_time\":\"25:00\",\"end_time\":\"23:59\"}"
        assertEquals("start_time", importer.preview(batch(badTime)).rows.single().issues.single().field)
    }

    @Test
    fun `source syntax version item size UTF8 transport and trailing tokens enforced`() {
        listOf(
            "", "{", "[]", "{}", "null", "{\"schema_version\":2,\"items\":[$item]}",
            "{\"schema_version\":1.0,\"items\":[$item]}", "{\"schema_version\":1,\"items\":[$item],\"extra\":1}",
            "[$item] []", "{\"schema_version\":1,\"schema_version\":1,\"items\":[$item]}",
            batch(*Array(201) { item }), " ".repeat(ActivityCalendarImportService.MAX_BYTES + 1),
            "好".repeat(ActivityCalendarImportService.MAX_BYTES / 3 + 1),
        ).forEach { json -> assertThrows(ActivityCalendarApiException::class.java) { importer.preview(json) } }
        assertEquals(200, importer.preview(batch(*Array(200) { item })).total)
        assertEquals(1, importer.preview("[$item]").ready)
        assertThrows(ActivityCalendarApiException::class.java) { importer.envelope(byteArrayOf(0xff.toByte())) }
        assertThrows(ActivityCalendarApiException::class.java) {
            importer.envelope(
                ByteArray(
                    ActivityCalendarImportService.MAX_ENVELOPE_BYTES + 1,
                ),
            )
        }
        assertThrows(ActivityCalendarApiException::class.java) { importer.envelope("{\"json\":[]}".toByteArray()) }
    }

    @Test
    fun `file duplicates conflict on content but other games and periods remain separate`() {
        val json = batch(item, item, item.replace("如鸢", "代号鸢"), item.replace("2026-10-10", "2026-10-11"))
        val preview = importer.preview(json)
        assertEquals(3, preview.ready)
        assertEquals(1, preview.duplicates)
        assertEquals(3, importer.commit("actor", json, preview.previewToken).created)
        val conflict = importer.preview(batch(item, item.dropLast(1) + ",\"description\":\"不同说明\"}"))
        assertEquals(1, conflict.conflicts)
        assertEquals("description", conflict.rows[1].issues.single().field)
    }

    @Test
    fun `disabled legacy duplicates skip with explicit differences and preview expires on changed content`() {
        var saved: ActivityCalendarEvent? = null
        every { repository.insert(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0).also { saved = it } }
        val preview = importer.preview(batch(item))
        importer.commit("actor", batch(item), preview.previewToken)
        every { repository.list(null, null, null, emptySet(), null) } answers
            { listOf(saved!!.copy(id = "legacy", enabled = false, description = "原说明")) }
        val changed = importer.preview(batch(item))
        assertEquals(1, changed.existing)
        assertEquals(0, changed.publicCount)
        assertEquals(setOf("description", "enabled"), changed.rows.single().issues.map { it.field }.toSet())
        assertEquals(0, importer.commit("actor", batch(item), changed.previewToken).created)
        assertEquals(
            409,
            assertThrows(ActivityCalendarApiException::class.java) {
                importer.commit("actor", batch(item), preview.previewToken)
            }.status.value(),
        )
        assertThrows(ActivityCalendarApiException::class.java) {
            importer.commit("actor", batch(item.replace("活动", "另一个")), changed.previewToken)
        }
    }

    @Test
    fun `partial failures and duplicate insert are reported without overwriting and edited IDs conflict`() {
        val json = batch(item, item.replace("ACTIVITY", "LOGIN"))
        val preview = importer.preview(json)
        every { repository.insert(any()) } answers {
            if (firstArg<ActivityCalendarEvent>().category.name == "LOGIN") throw IllegalStateException("synthetic failure")
            firstArg<ActivityCalendarEvent>().copy(version = 0)
        }
        val result = importer.commit("actor", json, preview.previewToken)
        assertEquals(1, result.created)
        assertEquals(1, result.failed)
        assertEquals(2, result.rows[1].row)
        var event: ActivityCalendarEvent? = null
        every { repository.insert(any()) } answers {
            event = firstArg()
            throw DuplicateKeyException("race")
        }
        every { repository.find(any()) } answers { event!!.copy(version = 0) }
        assertEquals(1, importer.commit("actor", batch(item), importer.preview(batch(item)).previewToken).existing)
        every { repository.find(any()) } answers { event!!.copy(description = "并发差异") }
        assertEquals(1, importer.commit("actor", batch(item), importer.preview(batch(item)).previewToken).failed)
        every { repository.list(null, null, null, emptySet(), null) } answers { listOf(event!!.copy(title = "已编辑")) }
        assertEquals(1, importer.preview(batch(item)).conflicts)
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `classification imports preserve original natural keys and surface differences rather than create duplicates`() {
        val cave = item.dropLast(1) + ",\"subtype\":\"FURNITURE\",\"subtype_detail\":\"MYSTERIOUS_CAVE\"}"
        val json = batch(cave)
        val preview = importer.preview(json)
        assertEquals(1, preview.ready)
        assertEquals(ActivityCalendarSubtype.FURNITURE, preview.rows.single().data!!.subtype)
        assertEquals(ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE, preview.rows.single().data!!.subtypeDetail)
        var saved: ActivityCalendarEvent? = null
        every { repository.insert(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0).also { saved = it } }
        assertEquals(1, importer.commit("editor", json, preview.previewToken).created)
        every { repository.list(null, null, null, emptySet(), null) } answers { listOf(saved!!) }
        val legacy = importer.preview(batch(item))
        assertEquals(1, legacy.existing)
        assertEquals(setOf("subtype", "subtype_detail"), legacy.rows.single().issues.map { it.field }.toSet())
        assertEquals(0, importer.commit("editor", batch(item), legacy.previewToken).created)
        every { repository.list(null, null, null, emptySet(), null) } returns emptyList()
        val conflicting = importer.preview(batch(item, cave))
        assertEquals(1, conflicting.conflicts)
        assertEquals(setOf("subtype", "subtype_detail"), conflicting.rows[1].issues.map { it.field }.toSet())
        assertThrows(ActivityCalendarApiException::class.java) { importer.commit("editor", batch(item, cave), conflicting.previewToken) }
        verify(exactly = 1) { repository.insert(any()) }
    }

    @Test
    fun `classification rejects unknown enum ordinal and cross group values at strict import boundary`() {
        for ((field, value) in listOf(
            "subtype" to "123",
            "subtype" to "\"0\"",
            "subtype" to "\"UNKNOWN\"",
            "subtype" to "\"STAR_POOL\"",
            "subtype_detail" to "\"MYSTERIOUS_CAVE\"",
            "subtype_detail" to "false",
            "pool_type" to "\"限定\"",
        )) {
            val json = batch(item.dropLast(1) + ",\"$field\":$value}")
            val report = importer.preview(json)
            assertEquals(1, report.invalid)
            assertEquals(field, report.rows.single().issues.single().field)
        }
        assertEquals(1, importer.preview(batch(item.dropLast(1) + ",\"subtype\":null,\"subtype_detail\":null}")).ready)
        verify(exactly = 0) { repository.insert(any()) }
    }

    @Test
    fun `开放结束日期与省略结束日期按同键判重且可导入持续活动`() {
        val explicit = item.replace("\"2026-10-20\"", "null")
        val omitted = explicit.replace(",\"end_date\":null", "")
        val json = batch(explicit, omitted)
        val preview = importer.preview(json)
        assertEquals(1, preview.ready)
        assertEquals("DUPLICATE", preview.rows[1].status)
        assertEquals(null, preview.rows[0].data!!.endDate)
        assertEquals(1, importer.commit("editor", json, preview.previewToken).created)
        verify(exactly = 1) { repository.insert(match { it.endDate == null && it.endTime == null }) }
        val invalid = explicit.dropLast(1) + ",\"end_time\":\"05:00\"}"
        assertEquals("end_time", importer.preview(batch(invalid)).rows.single().issues.single().field)
    }
}
