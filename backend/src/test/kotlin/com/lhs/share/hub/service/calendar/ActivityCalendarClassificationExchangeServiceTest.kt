package com.lhs.share.hub.service.calendar

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtype
import com.lhs.share.hub.repository.entity.ActivityCalendarSubtypeDetail
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.time.LocalDate

class ActivityCalendarClassificationExchangeServiceTest {
    private val repository = mockk<ActivityCalendarRepository>()
    private val recruitment = mockk<RecruitmentCatalogRepository>()
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
    private val calendar = ActivityCalendarService(repository, recruitment)
    private val exchange =
        ActivityCalendarClassificationExchangeService(calendar, repository, mapper, TransactionTemplate(mockk(relaxed = true)))
    private val event =
        ActivityCalendarEvent(
            "fixture", "如鸢", "资料", ActivityCalendarCategory.ACTIVITY,
            LocalDate.parse(
                "2026-10-01",
            ),
            createdBy = "creator", createdAt = Instant.EPOCH, updatedBy = "creator", updatedAt = Instant.EPOCH, version = 0,
        )

    init {
        every { repository.list(any(), any(), any(), any(), any()) } returns listOf(event)
        every { repository.findAll(any()) } answers { if (event.id in firstArg<Collection<String>>()) listOf(event) else emptyList() }
        every { recruitment.all() } returns emptyList()
    }

    @Test
    fun `eight manual targets and twelve displayed choices preserve unconfirmed legacy`() {
        val exported = exchange.export()
        assertEquals(listOf("活动", "常驻", "卡池", "其他"), exported.classificationOptions.keys.toList())
        assertEquals(12, exported.classificationOptions.values.sumOf { it.size })
        val json: ObjectNode = mapper.valueToTree(exported)
        for ((group, types) in exported.classificationOptions.filterKeys { it != "卡池" }) {
            for (type in types) {
                (json["items"][0] as ObjectNode).putObject("classification").put("level1", group).put("level2", type)
                assertEquals(1, exchange.preview(json.toString()).ready, "$group/$type")
            }
        }
        assertNull(exchange.classification(event.copy(subtype = ActivityCalendarSubtype.MEDIUM_EVENT)))
        assertNull(exchange.classification(event.copy(subtype = ActivityCalendarSubtype.TAISHAN_FU)))
        assertNull(exchange.classification(event.copy(subtype = ActivityCalendarSubtype.FURNITURE)))
        assertEquals(
            "历练/洞窟",
            exchange.classification(
                event.copy(subtype = ActivityCalendarSubtype.FURNITURE, subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE),
            )!!.level2,
        )
        verify(exactly = 0) { repository.updateClassification(any(), any(), any(), any()) }
    }

    @Test
    fun `reference fields never define writable values and omitted rows are not deletes`() {
        val json: ObjectNode = mapper.valueToTree(exchange.export())
        (json["items"][0] as ObjectNode).putObject("original").put("title", "不能覆盖标题")
        json.putObject("classification_options").put("伪造", "伪造")
        (json["items"][0] as ObjectNode).putObject("classification").put("level1", "卡池").put("level2", "限定")
        assertEquals(1, exchange.preview(json.toString()).invalid)
        (json["items"][0] as ObjectNode).putObject("classification").put("level1", "其他").put("level2", "其他")
        assertEquals(1, exchange.preview(json.toString()).ready)
        json.putArray("items")
        assertEquals(0, exchange.preview(json.toString()).total)
        verify(exactly = 0) { repository.save(any()) }
        verify(exactly = 0) { repository.updateClassification(any(), any(), any(), any()) }
    }

    @Test
    fun `confirmed legacy displays new labels while unmodified full exports do not rewrite codes`() {
        val legacy = listOf(
            event.copy(id = "trial", subtype = ActivityCalendarSubtype.FURNITURE_TRIAL),
            event.copy(id = "cave", subtype = ActivityCalendarSubtype.MYSTERIOUS_CAVE),
            event.copy(
                id = "detail",
                subtype = ActivityCalendarSubtype.FURNITURE,
                subtypeDetail = ActivityCalendarSubtypeDetail.MYSTERIOUS_CAVE,
            ),
            event.copy(id = "star", category = ActivityCalendarCategory.OTHER, subtype = ActivityCalendarSubtype.STAR_POOL),
        )
        every { repository.list(any(), any(), any(), any(), any()) } returns legacy
        every { repository.findAll(any()) } returns legacy
        val exported = exchange.export()
        assertTrue(exported.items.filter { it.id != "star" }.all { it.classification?.level2 == "历练/洞窟" })
        assertNull(exported.items.single { it.id == "star" }.classification)
        val report = exchange.preview(mapper.writeValueAsString(exported))
        assertEquals(3, report.unchanged)
        assertEquals(1, report.skipped)
        assertEquals(0, report.ready)
        assertEquals(0, report.invalid)
        verify(exactly = 0) { repository.updateClassification(any(), any(), any(), any()) }
    }

    @Test
    fun `old v1 confirmed target labels normalize and unconfirmed targets only preserve matching records`() {
        val json: ObjectNode = mapper.valueToTree(exchange.export())
        val row = json["items"][0] as ObjectNode
        for ((level1, level2, expected) in listOf(
            Triple("活动", "大型/周年", "活动/周年"),
            Triple("活动", "地宫", "地宫/鸢会"),
            Triple("活动", "签到/楼主查岗", "签到/查岗"),
            Triple("家具", "历练", "历练/洞窟"),
            Triple("家具", "神秘洞窟", "历练/洞窟"),
        )) {
            row.putObject("classification").put("level1", level1).put("level2", level2)
            val report = exchange.preview(json.toString())
            assertEquals(1, report.ready)
            assertEquals(expected, report.rows.single().after!!.level2)
        }
        for ((category, subtype, level1, level2) in listOf(
            listOf("ACTIVITY", "FIRST_MEETING_ROULETTE", "活动", "初见日/转盘"),
            listOf("OTHER", "STAR_POOL", "其他", "星池"),
            listOf("MAINTENANCE", null, "其他", "维护"),
            listOf("SHOP", "ACTIVITY_SHOP", "其他", "商店"),
        )) {
            row.putObject("classification").put("level1", level1).put("level2", level2)
            every { repository.findAll(any()) } returns listOf(event)
            assertEquals(1, exchange.preview(json.toString()).invalid)
            val historical = event.copy(
                category = ActivityCalendarCategory.valueOf(category!!),
                subtype = subtype?.let(ActivityCalendarSubtype::valueOf),
            )
            every { repository.findAll(any()) } returns listOf(historical)
            assertEquals(1, exchange.preview(json.toString()).unchanged)
        }
        verify(exactly = 0) { repository.updateClassification(any(), any(), any(), any()) }
    }

    @Test
    fun `empty export and row or UTF8 size overflow fail without truncation or writes`() {
        every { repository.list(any(), any(), any(), any(), any()) } returns emptyList()
        assertTrue(exchange.export().items.isEmpty())
        val json: ObjectNode = mapper.valueToTree(exchange.export())
        val rows = json.putArray("reference_items")
        repeat(10_001) { rows.addNull() }
        assertThrows(ActivityCalendarApiException::class.java) { exchange.preview(json.toString()) }
        assertThrows(ActivityCalendarApiException::class.java) {
            exchange.preview(
                "中".repeat(
                    ActivityCalendarClassificationExchangeService.MAX_BYTES / 3 + 1,
                ),
            )
        }
        every { repository.list(any(), any(), any(), any(), any()) } returns List(10_001) { event }
        assertThrows(ActivityCalendarApiException::class.java) { exchange.export() }
        verify(exactly = 0) { repository.save(any()) }
    }
}
