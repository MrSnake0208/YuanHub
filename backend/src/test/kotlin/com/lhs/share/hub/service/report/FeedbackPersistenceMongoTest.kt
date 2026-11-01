package com.lhs.share.hub.service.report

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.controller.report.request.FeedbackMessageAppendRequest
import com.lhs.share.hub.controller.report.request.FeedbackStatusUpdateRequest
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.FeedbackMessage
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.service.HubUserInfoService
import com.lhs.share.hub.service.notification.NotificationService
import com.lhs.share.testinfra.TestMongo
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.bson.Document
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Sort
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.Optional
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@Tag("integration")
class FeedbackPersistenceMongoTest {
    private val database = TestMongo.database("feedback")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(client, database)
    private val queries = FeedbackTicketQueryRepository(mongo)
    private val tickets = mockk<FeedbackTicketRepository>()
    private val access = mockk<FeedbackAccessService>(relaxed = true)
    private val notifications = mockk<NotificationService>(relaxed = true)
    private val users = mockk<HubUserInfoService>()
    private val categories = mockk<FeedbackCategoryService>()
    private val service =
        FeedbackReportService(tickets, queries, access, mockk(), notifications, users, ShareProperties(), mockk(relaxed = true), categories)

    init {
        every { categories.keys() } returns FeedbackArea.all
        every { categories.label(any()) } answers { FeedbackArea.labels[firstArg()] }
        // Production legacy repository.save is MongoTemplate.save. Reads can be
        // held at the same snapshot to deterministically reproduce overlap.
        every { tickets.save(any()) } answers { mongo.save(firstArg<FeedbackTicket>()) }
        every { tickets.findById(any()) } answers {
            Optional.ofNullable(mongo.findById(firstArg<String>(), FeedbackTicket::class.java))
        }
        every { access.canManage("admin", any()) } returns true
        every { access.canControlTicket("admin", any()) } returns true
        every { access.canClaimTicket("admin", any()) } returns true
        every { access.operatorAreas("admin") } returns FeedbackWorkflow.areas
        every { users.get(any()) } answers { MaaUserInfo(firstArg(), "Synthetic feedback user") }
    }

    @AfterEach
    fun cleanup() {
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `公开查询与发布原子条件排除新旧举报并保持真实总数`() {
        val regular = ticket("ordinary").copy(type = "OTHER", visibility = "PUBLIC", publicTitle = "测试问题", publicConsent = true)
        mongo.insert(regular)
        mongo.insert(regular.copy(id = "report", type = "REPORT"))
        mongo.insert(regular.copy(id = "legacy-report", type = " feedback ", category = " report "))
        val page = queries.publicSearch(null, null, null, null, "latest", PageRequest.of(0, 20))
        assertEquals(1L, page.totalElements)
        assertEquals(listOf("ordinary"), page.content.map { it.id })
        assertEquals(listOf("ordinary"), queries.searchPublicSimilar(listOf("测试"), 40).map { it.id })
        for (id in listOf("report", "legacy-report")) {
            assertEquals(null, queries.setPublicInfo(id, "PUBLIC", "标题", null, "COLLECTING", null, Instant.now()))
            assertEquals(null, queries.setType(id, "OTHER"))
            assertTrue(queries.setPublicInfo(id, "PRIVATE", null, null, null, null, Instant.now()) != null)
        }
        assertEquals(null, queries.setType("ordinary", "REPORT"))
        assertEquals("OTHER", mongo.findById("ordinary", FeedbackTicket::class.java)!!.type)
    }

    @Test
    fun `公开授权往返保存且旧文档缺失字段默认为未授权`() {
        mongo.insert(ticket("consented").copy(publicConsent = true))
        mongo.insert(ticket("private"))
        val legacy = Document()
        mongo.converter.write(ticket("legacy"), legacy)
        legacy.remove("publicConsent")
        mongo.getCollection("feedback_tickets").insertOne(legacy)

        assertTrue(mongo.findById("consented", FeedbackTicket::class.java)!!.publicConsent)
        assertFalse(mongo.findById("private", FeedbackTicket::class.java)!!.publicConsent)
        assertFalse(mongo.findById("legacy", FeedbackTicket::class.java)!!.publicConsent)
        assertTrue(service.getById("reporter", "consented").publicConsent)
        assertFalse(service.getById("reporter", "legacy").publicConsent)
    }

    @Test
    fun `OTHER grant does not expose category-only tickets from another board`() {
        mongo.insert(ticket("operator").copy(area = null))
        mongo.insert(ticket("other").copy(type = "FEEDBACK", category = "BUG", area = null))
        assertEquals(setOf("other"), ids(setOf("OTHER")))
        assertEquals(setOf("operator"), ids(setOf("OPERATOR")))
    }

    @Test
    fun `list board precedence matches detail authorization for conflicting legacy fields`() {
        mongo.insert(ticket("conflict").copy(category = "OTHER", area = "OPERATOR"))
        assertTrue(ids(setOf("OTHER")).isEmpty())
        assertEquals(setOf("conflict"), ids(setOf("OPERATOR")))
        val denied = assertThrows(ApiResultException::class.java) { service.getById("outsider", "conflict") }
        assertEquals(403, denied.statusCode)
    }

    @Test
    fun `null and absent legacy fields fall back to OTHER without leaking known categories`() {
        val collection = mongo.getCollection("feedback_tickets")
        for (id in listOf("missing", "null")) {
            val document = Document()
            mongo.converter.write(ticket(id).copy(type = "FEEDBACK", category = "BUG", area = null), document)
            if (id == "null") document["area"] = null else document.remove("area")
            collection.insertOne(document)
        }
        assertEquals(setOf("missing", "null"), ids(setOf("OTHER")))
        assertTrue(ids(emptySet()).isEmpty())
    }

    @Test
    fun `legacy FEEDBACK filter does not return tickets normalized to a concrete type`() {
        mongo.insert(ticket("bug").copy(type = "FEEDBACK", category = "BUG"))
        mongo.insert(ticket("legacy").copy(type = "FEEDBACK", category = null))
        assertEquals(setOf("legacy"), ids(setOf("OPERATOR"), "FEEDBACK"))
        assertEquals(setOf("bug"), ids(setOf("OPERATOR"), "BUG"))
    }

    @Test
    fun `all-area management scope returns tickets when type filter is absent`() {
        mongo.insert(ticket("bug"))
        mongo.insert(ticket("feature").copy(type = "FEATURE", category = "INVENTORY", area = "INVENTORY"))

        assertEquals(setOf("bug", "feature"), ids(FeedbackArea.all))
    }

    @Test
    fun `工作队列按内部板块和阶段过滤且隐藏合并来源`() {
        mongo.insert(
            ticket("star_pool").copy(workArea = "STAR", workflowStage = FeedbackWorkflow.UNASSIGNED, operatorAssigneeUserId = null),
        )
        mongo.insert(ticket("operator_pool").copy(workflowStage = FeedbackWorkflow.UNASSIGNED, operatorAssigneeUserId = null))
        mongo.insert(
            ticket(
                "merged_pool",
            ).copy(workArea = "STAR", workflowStage = FeedbackWorkflow.UNASSIGNED, operatorAssigneeUserId = null, mergedIntoId = "main"),
        )
        mongo.insert(ticket("star_dev").copy(workArea = "STAR", workflowStage = FeedbackWorkflow.DEV_HANDOFF))
        val pageable = PageRequest.of(0, 100)

        val pool = queries.search(
            null, null, null, null, null, null, pageable,
            workAreas = setOf("STAR"), queue = "UNASSIGNED", actorUserId = "alice",
        )
        val developer = queries.search(
            null, null, null, null, null, null, pageable,
            workAreas = emptySet(), queue = "DEV", actorUserId = "dev", developerAreas = setOf("STAR"),
        )

        assertEquals(setOf("star_pool"), pool.content.mapNotNull { it.id }.toSet())
        assertEquals(setOf("star_dev"), developer.content.mapNotNull { it.id }.toSet())
    }

    @Test
    fun `用户按有效板块筛选历史改类工单`() {
        mongo.insert(ticket("reclassified").copy(workArea = FeedbackArea.STAR))
        val pageable = PageRequest.of(0, 100)

        val star = queries.search("reporter", null, null, null, FeedbackArea.STAR, null, pageable)
        val operator = queries.search("reporter", null, null, null, FeedbackArea.OPERATOR, null, pageable)

        assertEquals(setOf("reclassified"), star.content.mapNotNull { it.id }.toSet())
        assertTrue(operator.isEmpty)
    }

    @Test
    fun `需我回复按真实消息分页计数且隔离负责人板块结案和合并`() {
        val start = Instant.parse("2026-09-01T00:00:00Z")
        val base = ticket("waiting_old").copy(createdAt = start)
        mongo.insert(base.copy(lastMessageSender = "ADMIN")) // The messages, not this legacy preview, are authoritative.
        mongo.insert(base.copy(id = "waiting_new", createdAt = start.plusSeconds(60)))
        mongo.insert(base.copy(id = "answered", messages = base.messages + message("reply").copy(senderKind = "ADMIN")))
        mongo.insert(base.copy(id = "another_owner", operatorAssigneeUserId = "other"))
        mongo.insert(base.copy(id = "another_board", workArea = "STAR"))
        mongo.insert(base.copy(id = "closed", status = "RESOLVED"))
        mongo.insert(base.copy(id = "merged", mergedIntoId = "main"))
        mongo.insert(base.copy(id = "no_messages", messages = emptyList()))
        mongo.insert(base.copy(id = "developer", workflowStage = FeedbackWorkflow.DEV_HANDOFF))

        val first = queries.search(
            null, null, null, null, null, null, PageRequest.of(0, 1, Sort.Direction.ASC, "createdAt"),
            workAreas = setOf("OPERATOR"), queue = "NEEDS_REPLY", actorUserId = "admin",
        )
        val second = queries.search(
            null, null, null, null, null, null, PageRequest.of(1, 1, Sort.Direction.ASC, "createdAt"),
            workAreas = setOf("OPERATOR"), queue = "NEEDS_REPLY", actorUserId = "admin",
        )
        assertEquals(2L, first.totalElements)
        assertEquals(listOf("waiting_old"), first.content.map { it.id })
        assertEquals(listOf("waiting_new"), second.content.map { it.id })
        assertTrue(first.content.all(FeedbackWorkflow::needsReply))
    }

    @Test
    fun `程序交回队列同时支持运营和程序范围且不泄露其他板块`() {
        val returned = ticket("returned").copy(developerReturnedAt = Instant.parse("2026-09-01T00:00:00Z"))
        mongo.insert(returned)
        mongo.insert(returned.copy(id = "other_board", workArea = "STAR"))
        mongo.insert(returned.copy(id = "closed", status = "RESOLVED"))
        mongo.insert(ticket("not_returned"))
        val pageable = PageRequest.of(0, 20)
        val operator = queries.search(
            null, null, null, null, null, null, pageable,
            workAreas = setOf("OPERATOR"), queue = "RETURNED", actorUserId = "admin",
        )
        val developer = queries.search(
            null, null, null, null, null, null, pageable,
            workAreas = emptySet(), queue = "RETURNED", actorUserId = "dev", developerAreas = setOf("OPERATOR"),
        )
        assertEquals(listOf("returned"), operator.content.map { it.id })
        assertEquals(listOf("returned"), developer.content.map { it.id })
        assertTrue(
            queries.search(
                null, null, null, null, null, null, pageable,
                workAreas = emptySet(), queue = "NEEDS_REPLY", actorUserId = "dev", developerAreas = setOf("OPERATOR"),
            ).isEmpty,
        )
    }

    @Test
    fun `自定义板块的工单可按目录筛选且不会落入其他板块`() {
        mongo.insert(ticket("custom").copy(category = "CUSTOM_TEST", area = "CUSTOM_TEST", workArea = "CUSTOM_TEST"))
        val known = FeedbackArea.all + "CUSTOM_TEST"
        val pageable = PageRequest.of(0, 100)

        assertEquals(
            setOf("custom"),
            queries.search("reporter", null, null, null, "CUSTOM_TEST", null, pageable, knownAreas = known).content.mapNotNull {
                it.id
            }.toSet(),
        )
        assertTrue(queries.search("reporter", null, null, null, FeedbackArea.OTHER, null, pageable, knownAreas = known).isEmpty)
    }

    @Test
    fun `合并来源条件更新只能成功一次且拒绝已有子反馈`() {
        mongo.insert(ticket("source").copy(workflowStage = FeedbackWorkflow.UNASSIGNED, operatorAssigneeUserId = null))
        mongo.insert(ticket("has_children").copy(mergedCount = 1))

        assertEquals("target", queries.setMergedInto("source", "target")?.mergedIntoId)
        assertEquals(null, queries.setMergedInto("source", "another"))
        assertEquals(null, queries.setMergedInto("has_children", "target"))
        assertEquals("target", mongo.findById("source", FeedbackTicket::class.java)?.mergedIntoId)
    }

    @Test
    fun `团队阅读游标单调前进且旧单新增消息只标记新边界`() {
        val old = mongo.insert(ticket("read").copy(workflowStage = null, operatorAssigneeUserId = null, teamReadReporterIndex = null))
        val withNewMessage = old.copy(
            messages = old.messages + message("new"),
            teamReadReporterIndex = 0,
            updatedAt = old.updatedAt.plusSeconds(1),
        )
        assertEquals(0, queries.saveIfUnchanged(old, withNewMessage)?.teamReadReporterIndex)
        assertEquals(1, queries.advanceTeamRead("read", 1)?.teamReadReporterIndex)
        assertEquals(1, queries.advanceTeamRead("read", 0)?.teamReadReporterIndex)
    }

    @Test
    fun `合并事务失败会回滚来源指向与主单计数`() {
        mongo.insert(ticket("source").copy(workflowStage = FeedbackWorkflow.UNASSIGNED, operatorAssigneeUserId = null))
        mongo.insert(ticket("target"))
        val tx = TransactionTemplate(MongoTransactionManager(mongo.mongoDatabaseFactory))

        assertThrows(IllegalStateException::class.java) {
            tx.execute {
                queries.setMergedInto("source", "target")
                queries.incrementMergedCount("target")
                throw IllegalStateException("synthetic failure")
            }
        }

        assertEquals(null, mongo.findById("source", FeedbackTicket::class.java)?.mergedIntoId)
        assertEquals(0, mongo.findById("target", FeedbackTicket::class.java)?.mergedCount)
    }

    @Test
    fun `simultaneous reporter supplements do not silently overwrite each other or exceed quota`() {
        val initial = ticket("parallel").let { value ->
            value.copy(messages = value.messages + (1..2).map { message("pending_$it") })
        }
        mongo.insert(initial)
        val barrier = CyclicBarrier(2)
        every { tickets.findById("parallel") } answers {
            val snapshot = mongo.findById("parallel", FeedbackTicket::class.java)!!
            barrier.await(10, TimeUnit.SECONDS)
            Optional.of(snapshot)
        }
        val pool = Executors.newFixedThreadPool(2)
        val results = try {
            (1..2).map { index ->
                pool.submit(
                    Callable {
                        runCatching {
                            service.appendMessage(
                                "reporter",
                                "parallel",
                                FeedbackMessageAppendRequest("append $index", actorMode = "REPORTER"),
                            )
                        }
                    },
                )
            }.map { it.get(15, TimeUnit.SECONDS) }
        } finally {
            pool.shutdownNow()
        }
        assertEquals(1, results.count { it.isSuccess }, "One stale writer must receive a conflict, not false success")
        assertEquals(409, (results.single { it.isFailure }.exceptionOrNull() as ApiResultException).statusCode)
        val saved = mongo.findById("parallel", FeedbackTicket::class.java)!!
        assertEquals(4, saved.messages.size)
        every { tickets.findById("parallel") } returns Optional.of(saved)
        val quota = assertThrows(ApiResultException::class.java) {
            service.appendMessage("reporter", "parallel", FeedbackMessageAppendRequest("fourth", actorMode = "REPORTER"))
        }
        assertEquals(400, quota.statusCode)
    }

    @Test
    fun `stale status write cannot erase a newly saved administrator reply`() {
        val initial = mongo.insert(ticket("status"))
        every { tickets.findById("status") } returns Optional.of(initial)
        service.appendMessage("admin", "status", FeedbackMessageAppendRequest("response", actorMode = "ADMIN"))
        val error = assertThrows(ApiResultException::class.java) {
            service.updateStatus("admin", "status", FeedbackStatusUpdateRequest("RESOLVED", "ADMIN"))
        }
        assertEquals(409, error.statusCode)
        val saved = mongo.findById("status", FeedbackTicket::class.java)!!
        assertEquals(2, saved.messages.size)
        assertEquals("OPEN", saved.status)
        verify(exactly = 1) { notifications.create(any(), any(), any(), any(), any(), any()) }
        every { tickets.findById("status") } returns Optional.of(saved)
        assertEquals("RESOLVED", service.updateStatus("admin", "status", FeedbackStatusUpdateRequest("RESOLVED", "ADMIN")).status)
        assertEquals(2, mongo.findById("status", FeedbackTicket::class.java)!!.messages.size)
    }

    @Test
    fun `stale reply cannot reopen a closed ticket or send a false reply notification`() {
        val initial = mongo.insert(ticket("closed"))
        every { tickets.findById("closed") } returns Optional.of(initial)
        service.updateStatus("admin", "closed", FeedbackStatusUpdateRequest("RESOLVED", "ADMIN"))
        val error = assertThrows(ApiResultException::class.java) {
            service.appendMessage("admin", "closed", FeedbackMessageAppendRequest("late reply", actorMode = "ADMIN"))
        }
        assertEquals(409, error.statusCode)
        val saved = mongo.findById("closed", FeedbackTicket::class.java)!!
        assertEquals("RESOLVED", saved.status)
        assertEquals(1, saved.messages.size)
        verify(exactly = 1) { notifications.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `legacy ticket without messages or update timestamp remains writable`() {
        val document = Document()
        mongo.converter.write(ticket("old"), document)
        document.remove("messages")
        document.remove("updatedAt")
        mongo.getCollection("feedback_tickets").insertOne(document)
        val response = service.appendMessage("admin", "old", FeedbackMessageAppendRequest("legacy reply", actorMode = "ADMIN"))
        assertEquals("legacy reply", response.messages.single().content)
        assertTrue(response.hasAdminReply)
        assertFalse(response.quota.canAppend)
    }

    private fun ids(areas: Set<String>, type: String? = null): Set<String> = queries.search(
        null,
        areas,
        null,
        type,
        null,
        null,
        PageRequest.of(0, 100, Sort.Direction.DESC, "createdAt"),
    ).content.map { it.id!! }.toSet()

    private fun message(id: String) = FeedbackMessage(id, "REPORTER", "reporter", "Synthetic message $id")

    @Test
    fun `公开反馈结案一次写入完成状态时间且保留公开内容和消息`() {
        mongo.insert(
            ticket("public-close").copy(
                visibility = FeedbackVisibility.PUBLIC,
                publicTitle = "公开标题",
                publicStatus = PublicFeedbackStatus.CONFIRMED,
            ),
        )
        val initial = mongo.findById("public-close", FeedbackTicket::class.java)!!
        service.updateStatus("admin", "public-close", FeedbackStatusUpdateRequest("RESOLVED", "ADMIN"))
        val saved = mongo.findById("public-close", FeedbackTicket::class.java)!!
        assertEquals("RESOLVED", saved.status)
        assertEquals(PublicFeedbackStatus.COMPLETED, saved.publicStatus)
        assertTrue(saved.completedAt != null)
        assertEquals(saved.updatedAt, saved.publicUpdatedAt)
        assertEquals(initial.publicTitle, saved.publicTitle)
        assertEquals(initial.messages, saved.messages)
    }

    @Test
    fun `并发更改公开状态或取消公开时同步结案冲突且不发送完成通知`() {
        for (unpublish in listOf(false, true)) {
            val id = "public-conflict-$unpublish"
            val initial = mongo.insert(
                ticket(id).copy(
                    visibility = FeedbackVisibility.PUBLIC,
                    publicStatus = PublicFeedbackStatus.CONFIRMED,
                ),
            )
            every { tickets.findById(id) } returns Optional.of(initial)
            if (unpublish) {
                queries.setPublicInfo(id, FeedbackVisibility.PRIVATE, null, null, initial.publicStatus, null, Instant.now())
            } else {
                queries.setPublicStatus(id, PublicFeedbackStatus.IN_PROGRESS, Instant.now(), null)
            }
            val error = assertThrows(ApiResultException::class.java) {
                service.updateStatus("admin", id, FeedbackStatusUpdateRequest("RESOLVED", "ADMIN"))
            }
            assertEquals(409, error.statusCode)
            val saved = mongo.findById(id, FeedbackTicket::class.java)!!
            assertEquals("OPEN", saved.status)
            assertEquals(if (unpublish) FeedbackVisibility.PRIVATE else FeedbackVisibility.PUBLIC, saved.visibility)
            assertEquals(if (unpublish) PublicFeedbackStatus.CONFIRMED else PublicFeedbackStatus.IN_PROGRESS, saved.publicStatus)
        }
        verify(exactly = 0) { notifications.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `仅写内部字段不会覆盖新的公开进度`() {
        val initial = mongo.insert(ticket("internal-only").copy(visibility = FeedbackVisibility.PUBLIC))
        queries.setPublicStatus("internal-only", PublicFeedbackStatus.IN_PROGRESS, Instant.now(), null)
        assertTrue(queries.saveIfUnchanged(initial, initial.copy(status = "RESOLVED")) != null)
        val saved = mongo.findById("internal-only", FeedbackTicket::class.java)!!
        assertEquals("RESOLVED", saved.status)
        assertEquals(PublicFeedbackStatus.IN_PROGRESS, saved.publicStatus)
    }

    private fun ticket(id: String) = FeedbackTicket(
        id = id,
        type = "BUG",
        category = "OPERATOR",
        area = "OPERATOR",
        workflowStage = FeedbackWorkflow.PROCESSING,
        operatorAssigneeUserId = "admin",
        reporterUserId = "reporter",
        content = "Synthetic feedback",
        messages = listOf(message("initial")),
        updatedAt = Instant.parse("2026-09-01T00:00:00Z"),
    )
}
