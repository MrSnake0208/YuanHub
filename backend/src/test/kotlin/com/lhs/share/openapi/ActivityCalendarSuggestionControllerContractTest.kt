package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.ActivityCalendarExceptionHandler
import com.lhs.share.hub.controller.calendar.ActivityCalendarSuggestionController
import com.lhs.share.hub.controller.calendar.AdminActivityCalendarSuggestionController
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.ActivityCalendarSuggestionRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestion
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionOriginal
import com.lhs.share.hub.repository.entity.ActivityCalendarSuggestionStatus
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import com.lhs.share.hub.service.calendar.ActivityCalendarSuggestionService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.LocalDate

class ActivityCalendarSuggestionControllerContractTest {
    private val repository = mockk<ActivityCalendarSuggestionRepository>()
    private val events = mockk<ActivityCalendarRepository>()
    private val transactions = mockk<TransactionTemplate>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val service =
        ActivityCalendarSuggestionService(
            repository,
            ActivityCalendarService(events, mockk<RecruitmentCatalogRepository>()),
            events,
            transactions,
        )
    private val mapper = jacksonObjectMapper().registerModule(
        JavaTimeModule(),
    ).setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
        .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private lateinit var mvc: MockMvc
    private val path = "/v1/activity-calendar/suggestions"
    private val admin = "/v1/admin/activity-calendar/suggestions"
    private val body = """
        {"game":"如鸢","title":"活动","category":"ACTIVITY",
        "start_date":"2026-10-03","end_date":"2026-10-10","source_url":"https://example.com/source",
        "submission_note":"私人","client_request_id":"request-one"}
    """.trimIndent()
    private val day = LocalDate.parse("2026-10-03")
    private val original =
        ActivityCalendarSuggestionOriginal(
            "如鸢",
            "活动",
            ActivityCalendarCategory.ACTIVITY,
            day,
            day.plusDays(7),
            sourceUrl = "https://example.com/source",
        )
    private val pending = ActivityCalendarSuggestion("sug_one", "owner", "request-one", Instant.EPOCH, original, "私人")

    @BeforeEach
    fun setup() {
        mvc = MockMvcBuilders.standaloneSetup(
            ActivityCalendarSuggestionController(service, helper, authorization, mapper),
            AdminActivityCalendarSuggestionController(service, helper, authorization, mapper),
        ).setControllerAdvice(ActivityCalendarExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        every { helper.requireUserId() } returns "owner"
        every { authorization.hasPermission("owner", AdminPermission.ACTIVITY_CALENDAR_WRITE) } returns false
    }

    @Test
    fun `administrator submits server identity and queries owned pagination without calendar write permission`() {
        every { repository.findRequest("owner", "request-one") } returns null
        every { repository.insert(any()) } answers { firstArg() }
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.submitter_id").value("owner"))
            .andExpect(jsonPath("$.data.status").value("PENDING"))
            .andExpect(jsonPath("$.data.version").value(0))
            .andExpect(jsonPath("$.data.original.start_date").value("2026-10-03"))
            .andExpect(jsonPath("$.data.original.enabled").doesNotExist())
            .andExpect(jsonPath("$.data.client_request_id").doesNotExist())
        every { repository.list("owner", null, null, 1, 20) } returns (listOf(pending) to 1L)
        mvc.perform(get("$path/mine")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.page").value(1)).andExpect(jsonPath("$.data.page_size").value(20))
            .andExpect(jsonPath("$.data.total").value(1)).andExpect(jsonPath("$.data.items[0].submission_note").value("私人"))
        verify {
            events wasNot io.mockk.Called
            transactions wasNot io.mockk.Called
        }
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            """{"enabled":true}""", """{"source_note":"private"}""", """{"submitter_id":"other"}""", """{"status":"ACCEPTED"}""",
            """{"version":1}""", """{"event_id":"evt_one"}""", """{"reviewed_by":"other"}""", """{"time_zone":"UTC"}""",
            """{"title":42}""", """{"title":null}""", """{"category":0}""", """{"category":"RECRUITMENT"}""",
            """{"start_date":[2026,10,3]}""", """{"start_date":"2026-02-30"}""", """{"start_date":"2026-1-01"}""",
            """{"description":false}""", """{"source_url":null}""", """{"source_url":""}""", """{"source_url":"file:///tmp/source"}""",
            """{"submission_note":42}""", """{"client_request_id":null}""", """{"client_request_id":42}""", """{"client_request_id":""}""",
        ],
    )
    fun `submission strict boundary rejects unknown server fields wrong types and invalid domain with structured 422`(patch: String) {
        val node = (mapper.readTree(body) as ObjectNode).deepCopy().apply { setAll<ObjectNode>(mapper.readTree(patch) as ObjectNode) }
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString())).andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        verify {
            repository wasNot io.mockk.Called
            events wasNot io.mockk.Called
        }
    }

    @Test
    fun `unknown and cross owner details are same 404 while historical and current projection hide admin fields`() {
        every { repository.find("missing") } returns null
        every { repository.find(pending.id) } returns pending.copy(submitterId = "other")
        listOf("missing", pending.id).forEach {
            mvc.perform(
                get("$path/$it"),
            ).andExpect(status().isNotFound).andExpect(jsonPath("$.error.code").value("activity_calendar_suggestion_not_found"))
        }
        val snapshot = ActivityCalendarEvent(
            "evt_one", "如鸢", "采纳内容", ActivityCalendarCategory.ACTIVITY, day, day.plusDays(7), sourceNote = "管理私密",
            createdBy = "editor", createdAt = Instant.EPOCH, updatedBy = "editor", updatedAt = Instant.EPOCH, version = 0,
        )
        every { repository.find(pending.id) } returns
            pending.copy(
                status = ActivityCalendarSuggestionStatus.ACCEPTED,
                version = 1,
                eventId = snapshot.id,
                acceptedSnapshot = snapshot,
            )
        every { events.find(snapshot.id) } returns snapshot.copy(title = "当前内容", enabled = false)
        mvc.perform(get("$path/${pending.id}")).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.accepted_snapshot.title").value("采纳内容"))
            .andExpect(jsonPath("$.data.accepted_snapshot.source_note").doesNotExist())
            .andExpect(jsonPath("$.data.accepted_snapshot.created_by").doesNotExist())
            .andExpect(jsonPath("$.data.current_event.item.title").value("当前内容"))
            .andExpect(jsonPath("$.data.current_event.enabled").value(false))
            .andExpect(jsonPath("$.data.current_event.source_note").doesNotExist())
        verify(exactly = 0) {
            repository.insert(any())
            repository.review(any(), any(), any(), any(), any(), any())
            events.save(any())
        }
    }

    @Test
    fun `review routes check authentication permission before decoding or service and owner submit is not gated`() {
        val operations = listOf(get(admin), post("$admin/sug_one/accept"), post("$admin/sug_one/reject"))
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        operations.forEach { mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized) }
        every { helper.requireUserId() } returns "owner"
        operations.forEach {
            mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden)
                .andExpect(jsonPath("$.error.code").value("forbidden"))
        }
        verify {
            repository wasNot io.mockk.Called
            transactions wasNot io.mockk.Called
        }
    }

    @Test
    fun `editor queue forwards bounded filters reject records reason and repeat terminal returns conflict`() {
        every { authorization.hasPermission("owner", AdminPermission.ACTIVITY_CALENDAR_WRITE) } returns true
        every { repository.list(null, ActivityCalendarSuggestionStatus.PENDING, "如鸢", 2, 10) } returns (listOf(pending) to 11L)
        mvc.perform(get(admin).param("status", "PENDING").param("game", "如鸢").param("page", "2").param("page_size", "10"))
            .andExpect(status().isOk).andExpect(jsonPath("$.data.total").value(11))
        every { repository.find(pending.id) } returns pending
        every { repository.review(pending.id, 0, ActivityCalendarSuggestionStatus.REJECTED, "owner", "重复", null) } returns
            pending.copy(status = ActivityCalendarSuggestionStatus.REJECTED, version = 1, reviewNote = "重复")
        val reason = """{"expected_version":0,"review_note":"重复"}"""
        mvc.perform(post("$admin/${pending.id}/reject").contentType(MediaType.APPLICATION_JSON).content(reason)).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.status").value("REJECTED")).andExpect(jsonPath("$.data.review_note").value("重复"))
        every { repository.find(pending.id) } returns pending.copy(status = ActivityCalendarSuggestionStatus.REJECTED, version = 1)
        mvc.perform(
            post("$admin/${pending.id}/reject").contentType(MediaType.APPLICATION_JSON).content(reason),
        ).andExpect(status().isConflict)
    }

    @Test
    fun `accept and reject strict shapes require integral version event boundary and nonblank reason`() {
        every { authorization.hasPermission("owner", AdminPermission.ACTIVITY_CALENDAR_WRITE) } returns true
        val formal = (mapper.readTree(body) as ObjectNode).deepCopy().apply { remove(listOf("submission_note", "client_request_id")) }
        val good = mapper.createObjectNode().put("expected_version", 0).set<ObjectNode>("event", formal)
        listOf(
            "{}", "[]", "{", """{"expected_version":0.5,"event":$formal}""", """{"expected_version":"0","event":$formal}""",
            """{"expected_version":null,"event":$formal}""", """{"expected_version":0,"event":[],"review_note":42}""",
            good.deepCopy().apply { (get("event") as ObjectNode).put("expected_version", 0) }.toString(),
            good.deepCopy().apply { (get("event") as ObjectNode).put("submission_note", "私密") }.toString(),
        ).forEach {
            mvc.perform(
                post("$admin/sug_one/accept").contentType(MediaType.APPLICATION_JSON).content(it),
            ).andExpect(status().isUnprocessableEntity)
        }
        listOf(
            "{}",
            """{"expected_version":0,"review_note":""}""",
            """{"expected_version":0,"review_note":42}""",
            """{"expected_version":0,"review_note":"原因","status":"PENDING"}""",
        ).forEach {
            mvc.perform(
                post("$admin/sug_one/reject").contentType(MediaType.APPLICATION_JSON).content(it),
            ).andExpect(status().isUnprocessableEntity)
        }
        listOf("page=0", "page_size=101", "page=bad", "status=BAD").forEach {
            mvc.perform(get("$path/mine?$it")).andExpect(status().isUnprocessableEntity)
        }
        every { repository.find("sug_one") } returns pending
        listOf(
            good.deepCopy().apply { (get("event") as ObjectNode).remove("source_url") },
            good.deepCopy().apply { (get("event") as ObjectNode).put("time_zone", "UTC") },
        ).forEach {
            mvc.perform(post("$admin/sug_one/accept").contentType(MediaType.APPLICATION_JSON).content(it.toString()))
                .andExpect(status().isUnprocessableEntity)
        }
        verify(exactly = 0) {
            repository.insert(any())
            repository.review(any(), any(), any(), any(), any(), any())
        }
        verify { transactions wasNot io.mockk.Called }
    }

    @Test
    fun `submission and accept decoder carry optional classification while public server fields remain forbidden`() {
        every { repository.findRequest("owner", "request-one") } returns null
        every { repository.insert(any()) } answers { firstArg() }
        val node = (mapper.readTree(body) as ObjectNode).deepCopy()
            .put("subtype", "FURNITURE").put("subtype_detail", "MYSTERIOUS_CAVE")
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.original.subtype").value("FURNITURE"))
            .andExpect(jsonPath("$.data.original.subtype_detail").value("MYSTERIOUS_CAVE"))
        val event = node.deepCopy().apply { remove(listOf("client_request_id", "submission_note")) }
        val accept = mapper.createObjectNode().put("expected_version", 0).apply { set<ObjectNode>("event", event) }
        val decoded = com.lhs.share.hub.controller.calendar.request.ActivityCalendarSuggestionRequestDecoder(mapper).accept(accept)
        org.junit.jupiter.api.Assertions.assertEquals("FURNITURE", decoded.event.subtype!!.name)
        org.junit.jupiter.api.Assertions.assertEquals("MYSTERIOUS_CAVE", decoded.event.subtypeDetail!!.name)
        node.put("subtype", "STAR_POOL")
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
            .andExpect(status().isUnprocessableEntity)
    }
}
