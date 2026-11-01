package com.lhs.share.openapi

import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.ActivityCalendarExceptionHandler
import com.lhs.share.hub.controller.calendar.ActivityCalendarController
import com.lhs.share.hub.controller.calendar.AdminActivityCalendarController
import com.lhs.share.hub.repository.ActivityCalendarRepository
import com.lhs.share.hub.repository.RecruitmentCatalogRepository
import com.lhs.share.hub.repository.entity.ActivityCalendarCategory
import com.lhs.share.hub.repository.entity.ActivityCalendarEvent
import com.lhs.share.hub.repository.entity.RecruitmentCatalogPool
import com.lhs.share.hub.repository.entity.RecruitmentUpAgent
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.calendar.ActivityCalendarService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.LocalDate

class ActivityCalendarControllerContractTest {
    private val repository = mockk<ActivityCalendarRepository>()
    private val recruitment = mockk<RecruitmentCatalogRepository>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val service = ActivityCalendarService(repository, recruitment)
    private val mapper = jacksonObjectMapper().registerModule(JavaTimeModule())
        .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private lateinit var mvc: MockMvc
    private val path = "/v1/admin/activity-calendar"
    private val body = """
        {"game":"如鸢","title":"活动","category":"ACTIVITY","start_date":"2026-10-03","end_date":"2026-10-10"}
    """.trimIndent()
    private val date = LocalDate.parse("2026-10-03")
    private val event = ActivityCalendarEvent(
        "evt_test", "如鸢", "活动", ActivityCalendarCategory.ACTIVITY, date, date.plusDays(7),
        createdBy = "creator", createdAt = Instant.EPOCH, updatedBy = "creator", updatedAt = Instant.EPOCH, version = 0,
    )

    @BeforeEach
    fun setup() {
        mvc = MockMvcBuilders.standaloneSetup(
            ActivityCalendarController(service, helper),
            AdminActivityCalendarController(
                service,
                helper,
                authorization,
                mapper,
                com.lhs.share.hub.service.calendar.ActivityCalendarImportService(service, repository, mapper),
                mockk(),
            ),
        ).setControllerAdvice(ActivityCalendarExceptionHandler()).setMessageConverters(MappingJackson2HttpMessageConverter(mapper)).build()
        every { helper.requireUserId() } returns "editor"
        every { repository.list(any(), any(), any(), any(), any()) } returns listOf(event)
        every { recruitment.all() } returns listOf(RecruitmentCatalogPool("pool", "如鸢", "卡池", date, date.plusDays(1)))
    }

    private fun editor() {
        every { helper.requireUserId() } returns "editor"
        every { authorization.hasPermission("editor", AdminPermission.ACTIVITY_CALENDAR_WRITE) } returns true
    }

    @Test
    fun `calendar exposes only confirmed UP names in snake case and defaults manual and legacy lists to empty`() {
        every { recruitment.all() } returns listOf(
            RecruitmentCatalogPool(
                "pool",
                "如鸢",
                "卡池",
                date,
                date.plusDays(1),
                upStatus = "verified",
                upAgents = listOf(
                    RecruitmentUpAgent("pool:up:a", "甲", "operator-a"),
                    RecruitmentUpAgent("pool:up:b", "乙", "operator-b"),
                    RecruitmentUpAgent("pool:up:c", "占位候选"),
                    RecruitmentUpAgent("pool:up:d", "退役", "operator-d", active = false),
                ),
                sourceUpAgentNames = listOf("来源候选"),
            ),
            RecruitmentCatalogPool("z-legacy", "如鸢", "旧池", date, date.plusDays(1)),
        )
        mvc.perform(get("/v1/activity-calendar"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.items[0].up_agent_names").isEmpty)
            .andExpect(jsonPath("$.data.items[1].up_agent_names.length()").value(2))
            .andExpect(jsonPath("$.data.items[1].up_agent_names[0]").value("甲"))
            .andExpect(jsonPath("$.data.items[1].up_agent_names[1]").value("乙"))
            .andExpect(jsonPath("$.data.items[1].title").value("卡池"))
            .andExpect(jsonPath("$.data.items[1].upAgentNames").doesNotExist())
            .andExpect(jsonPath("$.data.items[1].up_agents").doesNotExist())
            .andExpect(jsonPath("$.data.items[1].up_agent_ids").doesNotExist())
            .andExpect(jsonPath("$.data.items[1].source_up_agent_names").doesNotExist())
            .andExpect(jsonPath("$.data.items[2].up_agent_names").isEmpty)
        verify(exactly = 0) {
            repository.save(any())
            recruitment.save(any())
        }
    }

    @Test
    fun `calendar contract uses snake case ISO dates and explicit sources without identity or audit`() {
        mvc.perform(
            get("/v1/activity-calendar").param("game", "如鸢").param("from", "2026-10-03").param("to", "2026-10-10")
                .param("category", "ACTIVITY,RECRUITMENT", "ACTIVITY"),
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.items[0].source_type").value("MANUAL"))
            .andExpect(jsonPath("$.data.items[0].source_ref").isEmpty)
            .andExpect(jsonPath("$.data.items[0].start_date").value("2026-10-03"))
            .andExpect(jsonPath("$.data.items[0].end_date").value("2026-10-10"))
            .andExpect(jsonPath("$.data.items[0].start_time").isEmpty)
            .andExpect(jsonPath("$.data.items[0].end_time").isEmpty)
            .andExpect(jsonPath("$.data.items[0].time_zone").value("Asia/Shanghai"))
            .andExpect(jsonPath("$.data.items[0].created_by").doesNotExist())
            .andExpect(jsonPath("$.data.items[1].source_type").value("RECRUITMENT_POOL"))
            .andExpect(jsonPath("$.data.items[1].source_ref").value("pool"))
        verify {
            helper.requireUserId()
        }
        verify {
            repository.list(
                "如鸢",
                date,
                date.plusDays(7),
                setOf(ActivityCalendarCategory.ACTIVITY, ActivityCalendarCategory.RECRUITMENT),
                true,
            )
        }
        verify(exactly = 0) {
            repository.save(any())
            recruitment.save(any())
        }
    }

    @Test
    fun `all management operations require identity and calendar permission`() {
        val operations = listOf(get(path), post(path), put("$path/evt_test"))
        every { helper.requireUserId() } throws ResponseStatusException(HttpStatus.UNAUTHORIZED)
        operations.forEach { mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized) }
        every { helper.requireUserId() } returns "user"
        every { authorization.hasPermission("user", AdminPermission.ACTIVITY_CALENDAR_WRITE) } returns false
        operations.forEach {
            mvc.perform(it.contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden)
                .andExpect(jsonPath("$.error.code").value("forbidden"))
        }
        verify {
            repository wasNot io.mockk.Called
            recruitment wasNot io.mockk.Called
        }
    }

    @Test
    fun `editor may list create update disable but cannot DELETE or update recruitment`() {
        editor()
        every { repository.save(any()) } answers
            { firstArg<ActivityCalendarEvent>().copy(version = (firstArg<ActivityCalendarEvent>().version ?: -1) + 1) }
        every { repository.find("evt_test") } returns event
        mvc.perform(get(path)).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.items[0].read_only").value(false))
            .andExpect(jsonPath("$.data.items[0].version").value(0))
            .andExpect(jsonPath("$.data.items[1].read_only").value(true))
            .andExpect(jsonPath("$.data.items[1].version").isEmpty)
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.version").value(0)).andExpect(jsonPath("$.data.created_by").value("editor"))
        val update = mapper.readTree(
            body,
        ).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("expected_version", 0).put("enabled", false)
        mvc.perform(put("$path/evt_test").contentType(MediaType.APPLICATION_JSON).content(update.toString())).andExpect(status().isOk)
            .andExpect(jsonPath("$.data.version").value(1)).andExpect(jsonPath("$.data.enabled").value(false))
            .andExpect(jsonPath("$.data.created_by").value("creator")).andExpect(jsonPath("$.data.updated_by").value("editor"))
        mvc.perform(put("$path/recruitment:pool").contentType(MediaType.APPLICATION_JSON).content(update.toString()))
            .andExpect(status().isUnprocessableEntity)
        mvc.perform(delete("$path/evt_test")).andExpect(status().isMethodNotAllowed)
        verify(exactly = 0) {
            repository.find("recruitment:pool")
            recruitment.save(any())
        }
    }

    @Test
    fun `stale versions and actual optimistic save race use HTTP 409 and missing version uses 422`() {
        editor()
        every { repository.find("evt_test") } returns event
        mvc.perform(put("$path/evt_test").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnprocessableEntity)
        val update = mapper.readTree(body).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put("expected_version", 3)
        mvc.perform(put("$path/evt_test").contentType(MediaType.APPLICATION_JSON).content(update.toString()))
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("activity_calendar_version_conflict"))
        verify(exactly = 0) { repository.save(any()) }
        every { repository.save(any()) } throws OptimisticLockingFailureException("race")
        update.put("expected_version", 0)
        mvc.perform(put("$path/evt_test").contentType(MediaType.APPLICATION_JSON).content(update.toString()))
            .andExpect(status().isConflict).andExpect(jsonPath("$.error.code").value("activity_calendar_version_conflict"))
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            """{"start_date":null}""", """{"end_date":""}""", """{"start_date":"2026-02-30"}""",
            """{"start_date":[2026,10,3]}""", """{"end_date":"2026-10-01"}""", """{"title":null}""", """{"title":""}""",
            """{"title":42}""", """{"game":"other"}""", """{"category":"UNKNOWN"}""",
            """{"category":0}""", """{"category":"RECRUITMENT"}""",
            """{"description":false}""", """{"source_url":42}""", """{"time_zone":42}""",
            """{"start_time":"10:00"}""", """{"end_time":"10:00"}""", """{"start_time":"25:00","end_time":"12:00"}""",
            """{"enabled":null}""", """{"enabled":"false"}""", """{"expected_version":0.5}""", """{"expected_version":"0"}""",
            """{"source_url":"file:///tmp/test"}""", """{"unknown":true}""",
        ],
    )
    fun `invalid JSON fields return structured 422 without writes`(patch: String) {
        editor()
        val node = mapper.readTree(body).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
        node.setAll<com.fasterxml.jackson.databind.node.ObjectNode>(
            mapper.readTree(patch) as com.fasterxml.jackson.databind.node.ObjectNode,
        )
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString())).andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `missing required date malformed JSON and query failures return 422`() {
        editor()
        val node = mapper.readTree(body).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
        node.remove("start_date")
        listOf(node.toString(), "{", "[]").forEach {
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(it)).andExpect(status().isUnprocessableEntity)
        }
        listOf("from=bad-date", "from=2026-10-10&to=2026-10-01", "game=other", "category=UNKNOWN").forEach {
            mvc.perform(get("/v1/activity-calendar?$it")).andExpect(status().isUnprocessableEntity)
                .andExpect(jsonPath("$.error.code").value("schema_validation_failed"))
        }
        verify(exactly = 0) { repository.save(any()) }
    }

    @Test
    fun `optional classification round trips with snake case and pool type is response only`() {
        editor()
        every { repository.save(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
        val node = mapper.readTree(body).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
            .put("subtype", "FURNITURE").put("subtype_detail", "MYSTERIOUS_CAVE")
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.item.subtype").value("FURNITURE"))
            .andExpect(jsonPath("$.data.item.subtype_detail").value("MYSTERIOUS_CAVE"))
        every { recruitment.all() } returns listOf(RecruitmentCatalogPool("pool", "如鸢", "卡池", date, date.plusDays(1), poolType = "复刻限定"))
        mvc.perform(get("/v1/activity-calendar"))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.items[1].pool_type").value("复刻限定"))
            .andExpect(jsonPath("$.data.items[0].subtype").isEmpty)
        for ((field, value) in listOf("subtype" to "UNKNOWN", "subtype" to "0", "subtype_detail" to "0", "pool_type" to "限定")) {
            val invalid = mapper.readTree(body).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put(field, value)
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(invalid.toString()))
                .andExpect(status().isUnprocessableEntity)
        }
        node.put("category", "OTHER")
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
            .andExpect(status().isUnprocessableEntity)
    }

    @Test
    fun `new classification codes pass strict HTTP decoder with valid categories only`() {
        editor()
        every { repository.save(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
        for (subtype in listOf("SEASONAL_STAR_CHART", "WHITE_PIGEON", "AGENT_TRAINING", "TRIAL_CAVE", "OTHER")) {
            val category = if (subtype == "OTHER") "OTHER" else "ACTIVITY"
            val node = mapper.readTree(body).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
                .put("category", category).put("subtype", subtype)
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.data.item.category").value(category))
                .andExpect(jsonPath("$.data.item.subtype").value(subtype))
            node.put("category", if (category == "OTHER") "ACTIVITY" else "OTHER")
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
                .andExpect(status().isUnprocessableEntity)
        }
    }

    @Test
    fun `HTTP create accepts omitted or null end date and serializes ongoing facts`() {
        editor()
        every { repository.save(any()) } answers { firstArg<ActivityCalendarEvent>().copy(version = 0) }
        for (omit in listOf(false, true)) {
            val node = mapper.readTree(body).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
            if (omit) node.remove("end_date") else node.putNull("end_date")
            node.put("start_time", "05:00")
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(node.toString()))
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.data.item.end_date").isEmpty)
                .andExpect(jsonPath("$.data.item.end_at").isEmpty)
                .andExpect(jsonPath("$.data.item.start_time").value("05:00"))
                .andExpect(jsonPath("$.data.item.start_at").value("2026-10-02T21:00:00Z"))
        }
        verify(exactly = 2) { repository.save(match { it.endDate == null && it.endTime == null }) }
    }
}
