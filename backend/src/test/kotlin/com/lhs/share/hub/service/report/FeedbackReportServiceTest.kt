package com.lhs.share.hub.service.report

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.controller.report.request.FeedbackDiagnosticsRequest
import com.lhs.share.hub.controller.report.request.FeedbackMessageAppendRequest
import com.lhs.share.hub.controller.report.request.FeedbackReportCreateRequest
import com.lhs.share.hub.controller.report.request.FeedbackStatusUpdateRequest
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.FeedbackWorkflowEventRepository
import com.lhs.share.hub.repository.MediaAssetRepository
import com.lhs.share.hub.repository.entity.FeedbackCategory
import com.lhs.share.hub.repository.entity.FeedbackMessage
import com.lhs.share.hub.repository.entity.FeedbackMessageFile
import com.lhs.share.hub.repository.entity.FeedbackMessageImage
import com.lhs.share.hub.repository.entity.FeedbackSpace
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.service.HubUserInfoService
import com.lhs.share.hub.service.notification.NotificationService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.data.domain.PageImpl
import java.time.Instant
import java.util.Optional

class FeedbackReportServiceTest {
    private val ticketRepository = mockk<FeedbackTicketRepository>()
    private val queryRepository = mockk<FeedbackTicketQueryRepository>()
    private val accessService = mockk<FeedbackAccessService>(relaxed = true)
    private val mediaRepository = mockk<MediaAssetRepository>()
    private val notificationService = mockk<NotificationService>(relaxed = true)
    private val workflowEvents = mockk<FeedbackWorkflowEventRepository>(relaxed = true)
    private val userInfoService = mockk<HubUserInfoService>()
    private val properties = ShareProperties().apply { info.publicBaseUrl = "https://api.example.test/" }
    private val categories = mockk<FeedbackCategoryService>()
    private val service = FeedbackReportService(
        ticketRepository,
        queryRepository,
        accessService,
        mediaRepository,
        notificationService,
        userInfoService,
        properties,
        workflowEvents,
        categories,
    )

    init {
        every { categories.spaces() } returns listOf(FeedbackSpace("yuanhub", "YuanHub（主站）"))
        every { categories.requireSpace("yuanhub", any()) } returns FeedbackSpace("yuanhub", "YuanHub（主站）")
        every { categories.requireInSpace(any(), "yuanhub") } answers {
            val key = firstArg<String>()
            if (key.trim().uppercase() !in categories.keys()) throw ApiResultException(400, "无效的反馈板块")
            key.trim().uppercase()
        }
        every { categories.list() } returns FeedbackArea.labels.map { (key, label) -> FeedbackCategory(key, label) }
        every { accessService.querySpaces(any(), any()) } returns setOf("yuanhub")
        every { workflowEvents.save(any()) } answers { firstArg<FeedbackWorkflowEvent>() }
        every { categories.keys() } returns FeedbackArea.all
        every { categories.requireValid(any()) } answers { FeedbackArea.requireValid(firstArg()) }
        every { categories.label(any()) } answers { FeedbackArea.labels[firstArg()] }
        every { queryRepository.saveIfUnchanged(any(), any()) } answers { secondArg() }
        every { accessService.managerUserIds(any()) } returns emptySet()
        every { accessService.operatorUserIds(any()) } returns emptySet()
        every { accessService.developerAreas(any()) } returns emptySet()
        every { accessService.operatorAreas(any()) } answers { accessService.manageableAreas(firstArg()) }
        every { accessService.canControlTicket(any(), any()) } answers {
            accessService.canManage(firstArg(), FeedbackWorkflow.area(secondArg()))
        }
        every { accessService.canClaimTicket(any(), any()) } answers {
            accessService.canManage(firstArg(), FeedbackWorkflow.area(secondArg()))
        }
        every { accessService.canViewTicket(any(), any()) } answers {
            accessService.canView(firstArg(), FeedbackWorkflow.area(secondArg()))
        }
    }

    private fun prepareCreate() {
        every { mediaRepository.findAllById(emptyList()) } returns emptyList()
        every { ticketRepository.save(any()) } answers { firstArg() }
        every { accessService.receiverUserIds(any()) } returns emptySet()
        every { accessService.canManage("user", any()) } returns false
        every { userInfoService.get("user") } returns MaaUserInfo("user", "用户")
    }

    @ParameterizedTest
    @ValueSource(strings = ["BUG", "EXPERIENCE", "FEATURE", "CONTENT", "ACCOUNT", "REPORT", "OTHER"])
    fun `七种类型均可提交日历并回读且不自动公开`(type: String) {
        prepareCreate()
        val response = service.create("user", FeedbackReportCreateRequest(type = type, category = "CALENDAR", content = "日历测试"))
        assertEquals(type, response.type)
        assertEquals(FeedbackArea.CALENDAR, response.category)
        verify {
            ticketRepository.save(
                match {
                    it.category == FeedbackArea.CALENDAR && it.area == FeedbackArea.CALENDAR &&
                        it.workArea == FeedbackArea.CALENDAR && it.reporterUserId == "user" && it.visibility != "PUBLIC"
                },
            )
        }
    }

    @Test
    fun `旧 FEEDBACK 体验优化请求保留日历归属`() {
        prepareCreate()
        val response = service.create(
            "user",
            FeedbackReportCreateRequest(type = "FEEDBACK", category = "EXPERIENCE", area = "CALENDAR", content = "日历测试"),
        )
        assertEquals(FeedbackType.EXPERIENCE, response.type)
        assertEquals(FeedbackArea.CALENDAR, response.category)
    }

    @Test
    fun `新格式使用 type 和 category 保存`() {
        prepareCreate()

        val response = service.create(
            "user",
            FeedbackReportCreateRequest(type = "bug", category = "operator", content = "密探无法保存"),
        )

        assertEquals(FeedbackType.BUG, response.type)
        assertEquals(FeedbackArea.OPERATOR, response.category)
        verify {
            ticketRepository.save(
                match {
                    it.type == FeedbackType.BUG &&
                        it.category == FeedbackArea.OPERATOR &&
                        it.area == FeedbackArea.OPERATOR
                },
            )
        }
    }

    @Test
    fun `未授权反馈无需标题且默认私下保存`() {
        prepareCreate()

        val response = service.create("user", FeedbackReportCreateRequest(type = "BUG", category = "OPERATOR", content = "私下反馈"))

        assertNull(response.title)
        assertFalse(response.publicConsent)
        assertEquals(FeedbackVisibility.PRIVATE, response.visibility)
        verify { ticketRepository.save(match { !it.publicConsent && it.title == null && it.visibility == FeedbackVisibility.PRIVATE }) }
    }

    @Test
    fun `授权公开时缺少标题在附件和保存之前拒绝`() {
        prepareCreate()

        for (title in listOf(null, "   ")) {
            val error = assertThrows(ApiResultException::class.java) {
                service.create(
                    "user",
                    FeedbackReportCreateRequest(type = "BUG", category = "OPERATOR", title = title, content = "问题", publicConsent = true),
                )
            }
            assertEquals(400, error.statusCode)
        }
        verify(exactly = 0) { mediaRepository.findAllById(any()) }
        verify(exactly = 0) { ticketRepository.save(any()) }
    }

    @Test
    fun `公开授权单独保存回传且不会自动发布或开启客户端信息`() {
        prepareCreate()

        val response = service.create(
            "user",
            FeedbackReportCreateRequest(type = "BUG", category = "OPERATOR", title = " 标题 ", content = "正文", publicConsent = true),
        )

        assertTrue(response.publicConsent)
        assertEquals("标题", response.title)
        assertEquals(FeedbackVisibility.PRIVATE, response.visibility)
        assertNull(response.clientInfo)
        verify { ticketRepository.save(match { it.publicConsent && !it.clientInfoConsent && it.title == "标题" }) }
    }

    @Test
    fun `星石和麻圆可直接作为用户反馈板块`() {
        prepareCreate()

        for (area in listOf(FeedbackArea.STAR, FeedbackArea.MAAYUAN)) {
            val response = service.create("user", FeedbackReportCreateRequest(type = "BUG", category = area, content = "反馈"))
            assertEquals(area, response.category)
            verify { ticketRepository.save(match { it.category == area && it.area == area && it.workArea == area }) }
        }
    }

    @Test
    fun `新增的自定义板块可直接提交并保持三处标识一致`() {
        prepareCreate()
        every { categories.keys() } returns FeedbackArea.all + "CUSTOM_TEST"

        val response = service.create("user", FeedbackReportCreateRequest(type = "BUG", category = "CUSTOM_TEST", content = "反馈"))

        assertEquals("CUSTOM_TEST", response.category)
        verify { ticketRepository.save(match { it.category == "CUSTOM_TEST" && it.area == "CUSTOM_TEST" && it.workArea == "CUSTOM_TEST" }) }
    }

    @Test
    fun `旧 FEEDBACK category area 请求映射到新语义`() {
        prepareCreate()

        val response = service.create(
            "user",
            FeedbackReportCreateRequest(
                type = "FEEDBACK",
                category = "BUG",
                area = "OPERATOR",
                content = "旧客户端反馈",
            ),
        )

        assertEquals(FeedbackType.BUG, response.type)
        assertEquals(FeedbackArea.OPERATOR, response.category)
    }

    @Test
    fun `未同意客户端信息时应用诊断仍然保存并回传`() {
        prepareCreate()

        val response = service.create(
            "user",
            FeedbackReportCreateRequest(
                type = "BUG",
                category = "OPERATOR",
                content = "版本诊断",
                clientInfoConsent = false,
                diagnostics = FeedbackDiagnosticsRequest(
                    productVersion = " 0.9.0-beta.1 ",
                    frontendCommit = "abc1234",
                    buildTime = "2026-01-02T03:04:05Z",
                ),
            ),
        )

        // consent 只控制 IP / User-Agent，版本与 Build 属于应用诊断信息，必须记录。
        verify {
            ticketRepository.save(
                match {
                    it.clientInfoConsent.not() &&
                        it.clientInfo == null &&
                        it.diagnostics?.productVersion == "0.9.0-beta.1" &&
                        it.diagnostics?.frontendCommit == "abc1234" &&
                        it.diagnostics?.buildTime == "2026-01-02T03:04:05Z"
                },
            )
        }
        assertEquals("0.9.0-beta.1", response.diagnostics?.productVersion)
        assertEquals("abc1234", response.diagnostics?.frontendCommit)
        assertEquals("2026-01-02T03:04:05Z", response.diagnostics?.buildTime)
    }

    @Test
    fun `旧客户端缺少或全空 diagnostics 时不写入空对象`() {
        prepareCreate()

        val legacy = service.create(
            "user",
            FeedbackReportCreateRequest(type = "BUG", category = "OPERATOR", content = "旧客户端无诊断"),
        )
        verify { ticketRepository.save(match { it.diagnostics == null }) }
        assertNull(legacy.diagnostics)

        prepareCreate()
        val blank = service.create(
            "user",
            FeedbackReportCreateRequest(
                type = "BUG",
                category = "OPERATOR",
                content = "全空诊断",
                diagnostics = FeedbackDiagnosticsRequest(productVersion = "  ", frontendCommit = "", buildTime = null),
            ),
        )
        verify { ticketRepository.save(match { it.diagnostics == null }) }
        assertNull(blank.diagnostics)
    }

    @Test
    fun `只有旧 bug 类型时使用 OTHER 板块`() {
        prepareCreate()

        val response = service.create(
            "user",
            FeedbackReportCreateRequest(type = "bug", content = "没有板块信息"),
        )

        assertEquals(FeedbackType.BUG, response.type)
        assertEquals(FeedbackArea.OTHER, response.category)
    }

    @Test
    fun `拒绝未知类型和缺少 REPORT 板块`() {
        prepareCreate()

        assertThrows(ApiResultException::class.java) {
            service.create("user", FeedbackReportCreateRequest(type = "UNKNOWN", content = "无效"))
        }
        assertThrows(ApiResultException::class.java) {
            service.create("user", FeedbackReportCreateRequest(type = "REPORT", content = "缺少板块"))
        }
    }

    @Test
    fun `需我回复接受共享类型筛选和排序且保留岗位范围`() {
        every { accessService.operatorAreas("admin") } returns setOf(FeedbackArea.STAR)
        every { queryRepository.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            PageImpl(emptyList<FeedbackTicket>())
        every { userInfoService.getDict(emptySet()) } returns emptyMap()

        val result = service.list(
            "admin", 2, 20, null, "EXPERIENCE", "STAR", null, false, null, "保存", "createdAt", "asc", "NEEDS_REPLY",
        )

        assertEquals("createdAt", result.sortBy)
        assertEquals("asc", result.sortOrder)
        verify(exactly = 1) {
            queryRepository.search(
                null, null, null, "EXPERIENCE", "STAR", "保存",
                match { it.pageNumber == 1 && it.sort.getOrderFor("createdAt")?.isAscending == true },
                setOf(FeedbackArea.STAR), "NEEDS_REPLY", "admin", emptySet(), FeedbackArea.all, setOf("yuanhub"),
            )
        }
    }

    @Test
    fun `队列和排序非法时不执行查询`() {
        for ((queue, sortBy, sortOrder) in listOf(
            Triple("UNKNOWN", "createdAt", "asc"),
            Triple("NEEDS_REPLY", "content", "asc"),
            Triple("NEEDS_REPLY", "createdAt", "random"),
        )) {
            assertThrows(ApiResultException::class.java) {
                service.list("admin", 1, 20, null, null, null, null, false, null, null, sortBy, sortOrder, queue)
            }
        }
        verify(exactly = 0) {
            queryRepository.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        }
    }

    @Test
    fun `管理列表只从最后一条 REPORTER 消息推导边界`() {
        val firstReporter = FeedbackMessage(
            id = "rpm_initial",
            senderKind = "REPORTER",
            authorUserId = "user",
            content = "原始反馈",
            createdAt = Instant.parse("2026-09-01T10:00:00Z"),
        )
        val adminReply = FeedbackMessage(
            id = "rpm_admin",
            senderKind = "ADMIN",
            authorUserId = "admin",
            content = "已收到",
            createdAt = Instant.parse("2026-09-01T11:00:00Z"),
        )
        val latestReporter = FeedbackMessage(
            id = "rpm_latest",
            senderKind = "REPORTER",
            authorUserId = "user",
            content = "补充信息",
            createdAt = Instant.parse("2026-09-01T12:00:00Z"),
        )
        val ticket = openTicket().copy(messages = listOf(firstReporter, adminReply, latestReporter))
        every { accessService.manageableAreas("admin") } returns setOf(FeedbackArea.OPERATOR)
        every { queryRepository.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            PageImpl(listOf(ticket))
        every { userInfoService.getDict(setOf("user")) } returns mapOf("user" to MaaUserInfo("user", "用户"))

        val item = service.list(
            currentUserId = "admin",
            page = 1,
            pageSize = 20,
            status = null,
            type = null,
            category = null,
            area = null,
            mine = false,
            reporterUserId = null,
            keyword = null,
            sortBy = "updatedAt",
            sortOrder = "desc",
        ).reports.single()

        assertEquals("rpm_latest", item.lastReporterMessageId)
        assertEquals(Instant.parse("2026-09-01T12:00:00Z"), item.lastReporterMessageCreatedAt)
        assertEquals(2, item.lastReporterMessageIndex)
    }

    @Test
    fun `没有用户消息时列表边界全部为空`() {
        val ticket = openTicket().copy(
            messages = listOf(
                FeedbackMessage("rpm_admin", "ADMIN", "admin", "管理员回复"),
            ),
        )
        every { accessService.manageableAreas("admin") } returns setOf(FeedbackArea.OPERATOR)
        every { queryRepository.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            PageImpl(listOf(ticket))
        every { userInfoService.getDict(setOf("user")) } returns mapOf("user" to MaaUserInfo("user", "用户"))

        val item = service.list(
            "admin", 1, 20, null, null, null, null, false, null, null, "updatedAt", "desc",
        ).reports.single()

        assertNull(item.lastReporterMessageId)
        assertNull(item.lastReporterMessageCreatedAt)
        assertNull(item.lastReporterMessageIndex)
    }

    @Test
    fun `消息发送方无法识别时列表边界安全降级为空`() {
        val ticket = openTicket().copy(
            messages = listOf(
                FeedbackMessage("rpm_reporter", "REPORTER", "user", "用户消息"),
                FeedbackMessage("rpm_unknown", "SYSTEM", "system", "未知消息"),
            ),
        )
        every { accessService.manageableAreas("admin") } returns setOf(FeedbackArea.OPERATOR)
        every { queryRepository.search(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns
            PageImpl(listOf(ticket))
        every { userInfoService.getDict(setOf("user")) } returns mapOf("user" to MaaUserInfo("user", "用户"))

        val item = service.list(
            "admin", 1, 20, null, null, null, null, false, null, null, "updatedAt", "desc",
        ).reports.single()

        assertNull(item.lastReporterMessageId)
        assertNull(item.lastReporterMessageCreatedAt)
        assertNull(item.lastReporterMessageIndex)
    }

    @Test
    fun `创建反馈接受 10 张图片并按请求顺序返回绝对 URL`() {
        prepareCreate()
        val mediaIds = (1..10).map { "med_$it" }
        every { mediaRepository.findAllById(mediaIds) } returns mediaIds.reversed().map { media(it) }

        val response = service.create(
            "user",
            FeedbackReportCreateRequest(
                type = "BUG",
                category = "OPERATOR",
                content = "带截图的问题",
                mediaIds = mediaIds,
            ),
        )

        assertEquals(
            mediaIds,
            response.messages.single().images.map { it.id },
        )
        assertEquals(
            mediaIds.map { "https://api.example.test/media/$it.webp" },
            response.messages.single().images.map { it.url },
        )
        verify { mediaRepository.findAllById(mediaIds) }
    }

    @Test
    fun `专区拒绝公开图片引用且私有图片回读不暴露静态地址`() {
        prepareCreate()
        every { categories.requireSpace("partner-a", true) } returns FeedbackSpace("partner-a", "平台 A")
        every { categories.requireInSpace("OPERATOR", "partner-a") } returns "OPERATOR"
        val image = media("private_image", "/media/public.png")
        every { mediaRepository.findAllById(listOf("private_image")) } returns listOf(image)
        val request =
            FeedbackReportCreateRequest(
                type = "BUG",
                category = "OPERATOR",
                content = "截图",
                mediaIds = listOf("private_image"),
                spaceId = "partner-a",
            )
        assertEquals(400, assertThrows(ApiResultException::class.java) { service.create("user", request) }.statusCode)
        verify(exactly = 0) { ticketRepository.save(any()) }
        every { mediaRepository.findAllById(listOf("private_image")) } returns
            listOf(image.copy(privateStorage = true, storagePath = "private.png"))
        val response = service.create("user", request)
        assertEquals("partner-a", response.spaceId)
        assertEquals("", response.messages.single().images.single().url)
        assertTrue(response.messages.single().images.single().privateStorage)
    }

    @Test
    fun `混合附件按类别拆分并返回文件下载契约`() {
        prepareCreate()
        val image = media("med_image", "/media/med_image.png")
        val file = media(
            id = "med_log",
            path = "med_log.log",
            name = "error.log",
            mime = "text/plain",
            size = 2048,
            kind = MediaKind.FILE,
        )
        every { mediaRepository.findAllById(listOf("med_image", "med_log")) } returns listOf(file, image)

        val response = service.create(
            "user",
            FeedbackReportCreateRequest("BUG", "OPERATOR", null, null, "混合附件", listOf("med_image", "med_log")),
        )

        assertEquals(listOf("med_image"), response.messages.single().images.map { it.id })
        val responseFile = response.messages.single().files.single()
        assertEquals("med_log", responseFile.id)
        assertEquals("error.log", responseFile.name)
        assertEquals(2048, responseFile.size)
        assertTrue(responseFile.downloadUrl.matches(Regex("/v1/reports/rpt_[0-9a-f]{16}/attachments/med_log")))
    }

    @Test
    fun `附件下载要求工单查看权限和真实文件引用`() {
        val referencedFile = FeedbackMessageFile("med_log", "error.log", "text/plain", 10)
        val ticket = openTicket().copy(
            messages = openTicket().messages.map { it.copy(files = listOf(referencedFile)) },
        )
        val asset = media("med_log", "med_log.log", kind = MediaKind.FILE, mime = "text/plain")
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket)
        every { mediaRepository.findById("med_log") } returns Optional.of(asset)

        assertEquals(asset, service.getAttachment("user", "rpt_1", "med_log"))

        every { accessService.canView("admin", FeedbackArea.OPERATOR) } returns true
        assertEquals(asset, service.getAttachment("admin", "rpt_1", "med_log"))

        every { accessService.canView("outsider", FeedbackArea.OPERATOR) } returns false
        val forbidden = assertThrows(ApiResultException::class.java) {
            service.getAttachment("outsider", "rpt_1", "med_log")
        }
        assertEquals(403, forbidden.statusCode)

        val missing = assertThrows(ApiResultException::class.java) {
            service.getAttachment("user", "rpt_1", "med_unbound")
        }
        assertEquals(404, missing.statusCode)
        verify(exactly = 0) { mediaRepository.findById("med_unbound") }
    }

    @Test
    fun `用户追加接受 10 张图片并保留请求顺序`() {
        val ticket = openTicket()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket)
        every { ticketRepository.save(any()) } answers { firstArg() }
        every { accessService.canManage("user", any()) } returns false
        every { userInfoService.get("user") } returns MaaUserInfo("user", "用户")
        val mediaIds = (1..10).map { "med_$it" }
        every { mediaRepository.findAllById(mediaIds) } returns mediaIds.reversed().map { media(it) }

        val response = service.appendMessage(
            "user",
            "rpt_1",
            FeedbackMessageAppendRequest("补充截图", mediaIds),
        )

        assertEquals(
            mediaIds,
            response.messages.last().images.map { it.id },
        )
    }

    @Test
    fun `管理员回复接受 10 张图片并保存为管理员消息`() {
        val ticket = openTicket()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket)
        every { ticketRepository.save(any()) } answers { firstArg() }
        every { accessService.canManage("admin", any()) } returns true
        every { userInfoService.get("user") } returns MaaUserInfo("user", "用户")
        every { userInfoService.get("admin") } returns MaaUserInfo("admin", "管理员")
        val mediaIds = (1..10).map { "med_$it" }
        every { mediaRepository.findAllById(mediaIds) } returns mediaIds.reversed().map { media(it, owner = "admin") }

        val response = service.appendMessage(
            "admin",
            "rpt_1",
            FeedbackMessageAppendRequest("处理结果", mediaIds),
        )

        assertEquals("ADMIN", response.messages.last().senderKind)
        assertEquals(mediaIds, response.messages.last().images.map { it.id })
    }

    @Test
    fun `提交人每次追加消息都通知对应模块管理员并排除提交人`() {
        val ticket = openTicket()
        prepareTicket(ticket, "user", canManage = false)
        every { ticketRepository.findById("rpt_1") } returnsMany listOf(
            Optional.of(ticket),
            Optional.of(
                ticket.copy(
                    messages = ticket.messages + FeedbackMessage(
                        id = "rpm_previous",
                        senderKind = "REPORTER",
                        authorUserId = "user",
                        content = "第一次补充",
                    ),
                ),
            ),
        )
        every { accessService.operatorUserIds(FeedbackArea.OPERATOR) } returns setOf("manager", "user")

        service.appendMessage(
            "user",
            "rpt_1",
            FeedbackMessageAppendRequest("第一次补充", actorMode = "REPORTER"),
        )
        service.appendMessage(
            "user",
            "rpt_1",
            FeedbackMessageAppendRequest("第二次补充", actorMode = "REPORTER"),
        )

        verify(exactly = 2) {
            notificationService.create(
                userId = "manager",
                kind = "FEEDBACK_MESSAGE_FROM_REPORTER",
                title = any(),
                body = any(),
                refType = "FEEDBACK",
                refId = "rpt_1",
                messageIndex = any(),
            )
        }
        verify(exactly = 0) {
            notificationService.create(
                userId = "user",
                kind = "FEEDBACK_MESSAGE_FROM_REPORTER",
                title = any(),
                body = any(),
                refType = "FEEDBACK",
                refId = "rpt_1",
                messageIndex = any(),
            )
        }
    }

    @Test
    fun `双角色显式提交人追加只产生提交人副作用`() {
        val ticket = openTicket()
        prepareTicket(ticket, "user", canManage = true)

        val response = service.appendMessage(
            "user",
            "rpt_1",
            FeedbackMessageAppendRequest("个人补充", actorMode = " reporter "),
        )

        assertEquals("REPORTER", response.messages.last().senderKind)
        assertEquals(1, response.quota.pendingCount)
        assertTrue(response.quota.canAppend)
        verify {
            queryRepository.saveIfUnchanged(
                any(),
                match {
                    it.lastMessageSender == "REPORTER" &&
                        !it.hasAdminReply &&
                        it.adminReply == null
                },
            )
        }
        verify(exactly = 0) { notificationService.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `双角色显式管理员追加更新摘要并通知自己的反馈回复`() {
        val ticket = openTicket()
        prepareTicket(ticket, "user", canManage = true)

        val response = service.appendMessage(
            "user",
            "rpt_1",
            FeedbackMessageAppendRequest("工作台回复", actorMode = "ADMIN"),
        )

        assertEquals("ADMIN", response.messages.last().senderKind)
        verify {
            queryRepository.saveIfUnchanged(
                any(),
                match {
                    it.lastMessageSender == "ADMIN" &&
                        it.hasAdminReply &&
                        it.adminReply == "工作台回复"
                },
            )
        }
        verify {
            notificationService.create(
                userId = "user",
                kind = "FEEDBACK_REPLY",
                title = any(),
                body = any(),
                refType = "FEEDBACK",
                refId = "rpt_1",
            )
        }
    }

    @Test
    fun `消息身份非法越权和双角色缺省均拒绝写入`() {
        val ticket = openTicket()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket)
        every { accessService.canManage("admin", any()) } returns true
        every { accessService.canManage("user", any()) } returns false
        every { accessService.canManage("outsider", any()) } returns false

        val reporterForbidden = assertThrows(ApiResultException::class.java) {
            service.appendMessage("admin", "rpt_1", FeedbackMessageAppendRequest("越权", actorMode = "REPORTER"))
        }
        val adminForbidden = assertThrows(ApiResultException::class.java) {
            service.appendMessage("user", "rpt_1", FeedbackMessageAppendRequest("越权", actorMode = "ADMIN"))
        }
        val invalid = assertThrows(ApiResultException::class.java) {
            service.appendMessage("outsider", "rpt_1", FeedbackMessageAppendRequest("非法", actorMode = "OWNER"))
        }
        every { accessService.canManage("user", any()) } returns true
        val ambiguous = assertThrows(ApiResultException::class.java) {
            service.appendMessage("user", "rpt_1", FeedbackMessageAppendRequest("缺省"))
        }

        assertEquals(403, reporterForbidden.statusCode)
        assertEquals(403, adminForbidden.statusCode)
        assertEquals(400, invalid.statusCode)
        assertEquals(400, ambiguous.statusCode)
        verify(exactly = 0) { ticketRepository.save(any()) }
        verify(exactly = 0) { queryRepository.saveIfUnchanged(any(), any()) }
        verify(exactly = 0) { notificationService.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `双角色提交人达到补充上限但管理员模式仍可回复`() {
        val reporterMessages = (1..3).map { index ->
            FeedbackMessage(
                id = "rpm_pending_$index",
                senderKind = "REPORTER",
                authorUserId = "user",
                content = "补充 $index",
            )
        }
        val ticket = openTicket().copy(messages = openTicket().messages + reporterMessages)
        prepareTicket(ticket, "user", canManage = true)

        val detail = service.getById("user", "rpt_1")
        val quotaException = assertThrows(ApiResultException::class.java) {
            service.appendMessage(
                "user",
                "rpt_1",
                FeedbackMessageAppendRequest("第四次补充", actorMode = "REPORTER"),
            )
        }
        val adminResponse = service.appendMessage(
            "user",
            "rpt_1",
            FeedbackMessageAppendRequest("管理员回复", actorMode = "ADMIN"),
        )

        assertEquals(3, detail.quota.pendingCount)
        assertFalse(detail.quota.canAppend)
        assertEquals(400, quotaException.statusCode)
        assertEquals("ADMIN", adminResponse.messages.last().senderKind)
    }

    @Test
    fun `双角色以提交人关闭工单不写处理字段也不通知`() {
        val ticket = openTicket()
        prepareTicket(ticket, "user", canManage = true)

        val response = service.updateStatus(
            "user",
            "rpt_1",
            FeedbackStatusUpdateRequest("RESOLVED", actorMode = "REPORTER"),
        )

        assertEquals("RESOLVED", response.status)
        assertNull(response.handler)
        verify {
            queryRepository.saveIfUnchanged(
                any(),
                match {
                    it.status == "RESOLVED" && it.handlerUserId == null && it.handledAt == null
                },
            )
        }
        verify(exactly = 0) { notificationService.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `双角色以管理员处理自己的反馈写处理字段并收到状态通知`() {
        val ticket = openTicket()
        prepareTicket(ticket, "user", canManage = true)

        val response = service.updateStatus(
            "user",
            "rpt_1",
            FeedbackStatusUpdateRequest("DISMISSED", actorMode = "ADMIN", reason = "明显无效"),
        )

        assertEquals("DISMISSED", response.status)
        assertEquals("user", response.handler?.id)
        verify {
            queryRepository.saveIfUnchanged(
                any(),
                match {
                    it.status == "DISMISSED" && it.handlerUserId == "user" && it.handledAt != null
                },
            )
        }
        verify {
            notificationService.create(
                userId = "user",
                kind = "FEEDBACK_STATUS_UPDATED",
                title = any(),
                body = "反馈摘要：${ticket.content.take(100)}\n管理员将你的反馈状态更新为: 已忽略",
                refType = "FEEDBACK",
                refId = "rpt_1",
            )
        }
    }

    @Test
    fun `管理员处理他人工单会通知且状态不变时不重复保存`() {
        val ticket = openTicket().copy(workflowStage = FeedbackWorkflow.PROCESSING, operatorAssigneeUserId = "admin")
        prepareTicket(ticket, "admin", canManage = true)

        val response = service.updateStatus(
            "admin",
            "rpt_1",
            FeedbackStatusUpdateRequest("RESOLVED", actorMode = "ADMIN"),
        )

        assertEquals("admin", response.handler?.id)
        assertNotNull(response.updatedAt)
        verify {
            notificationService.create(
                userId = "user",
                kind = "FEEDBACK_STATUS_UPDATED",
                title = any(),
                body = "反馈摘要：${ticket.content.take(100)}\n管理员将你的反馈状态更新为: 已处理",
                refType = "FEEDBACK",
                refId = "rpt_1",
            )
        }

        val resolved = ticket.copy(status = "RESOLVED")
        every { ticketRepository.findById("rpt_1") } returns Optional.of(resolved)
        service.updateStatus("admin", "rpt_1", FeedbackStatusUpdateRequest("RESOLVED", actorMode = "ADMIN"))
        verify(exactly = 1) { queryRepository.saveIfUnchanged(any(), any()) }
        verify(exactly = 0) { ticketRepository.save(any()) }
        verify(exactly = 1) { notificationService.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `状态身份非法越权和双角色缺省与消息规则一致`() {
        val ticket = openTicket()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket)
        every { accessService.canManage("admin", any()) } returns true
        every { accessService.canManage("user", any()) } returns false
        every { accessService.canManage("outsider", any()) } returns false

        val reporterForbidden = assertThrows(ApiResultException::class.java) {
            service.updateStatus("admin", "rpt_1", FeedbackStatusUpdateRequest("RESOLVED", "REPORTER"))
        }
        val adminForbidden = assertThrows(ApiResultException::class.java) {
            service.updateStatus("user", "rpt_1", FeedbackStatusUpdateRequest("RESOLVED", "ADMIN"))
        }
        val invalid = assertThrows(ApiResultException::class.java) {
            service.updateStatus("outsider", "rpt_1", FeedbackStatusUpdateRequest("RESOLVED", "OWNER"))
        }
        every { accessService.canManage("user", any()) } returns true
        val ambiguous = assertThrows(ApiResultException::class.java) {
            service.updateStatus("user", "rpt_1", FeedbackStatusUpdateRequest("RESOLVED"))
        }

        assertEquals(403, reporterForbidden.statusCode)
        assertEquals(403, adminForbidden.statusCode)
        assertEquals(400, invalid.statusCode)
        assertEquals(400, ambiguous.statusCode)
        verify(exactly = 0) { ticketRepository.save(any()) }
        verify(exactly = 0) { queryRepository.saveIfUnchanged(any(), any()) }
        verify(exactly = 0) { notificationService.create(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `重复媒体 ID 被拒绝且不会查询仓库`() {
        prepareCreate()

        val exception = assertThrows(ApiResultException::class.java) {
            service.create(
                "user",
                FeedbackReportCreateRequest(
                    type = "BUG",
                    category = "OPERATOR",
                    content = "重复图片",
                    mediaIds = listOf("med_same", "med_same"),
                ),
            )
        }

        assertEquals(400, exception.statusCode)
        verify(exactly = 0) { mediaRepository.findAllById(any()) }
    }

    @Test
    fun `其他用户媒体和已结束工单不能通过图片追加`() {
        prepareCreate()
        every { mediaRepository.findAllById(listOf("med_other")) } returns listOf(media("med_other", owner = "other"))
        val ownershipException = assertThrows(ApiResultException::class.java) {
            service.create(
                "user",
                FeedbackReportCreateRequest("BUG", "OPERATOR", null, null, "越权图片", listOf("med_other")),
            )
        }
        assertEquals(403, ownershipException.statusCode)

        listOf("RESOLVED", "DISMISSED").forEach { status ->
            val ticketId = "rpt_${status.lowercase()}"
            every { ticketRepository.findById(ticketId) } returns Optional.of(
                openTicket().copy(id = ticketId, status = status),
            )
            val statusException = assertThrows(ApiResultException::class.java) {
                service.appendMessage(
                    "user",
                    ticketId,
                    FeedbackMessageAppendRequest("已结束", listOf("med_other")),
                )
            }
            assertEquals(400, statusException.statusCode)
        }
    }

    @Test
    fun `媒体数量、缺失媒体和已删除媒体会被拒绝`() {
        prepareCreate()

        val tooManyException = assertThrows(ApiResultException::class.java) {
            service.create(
                "user",
                FeedbackReportCreateRequest(
                    type = "BUG",
                    category = "OPERATOR",
                    content = "图片太多",
                    mediaIds = (1..11).map { "med_$it" },
                ),
            )
        }
        assertEquals(400, tooManyException.statusCode)
        verify(exactly = 0) { mediaRepository.findAllById(any()) }
        verify(exactly = 0) { ticketRepository.save(any()) }

        every { mediaRepository.findAllById(listOf("med_missing")) } returns emptyList()
        val missingException = assertThrows(ApiResultException::class.java) {
            service.create(
                "user",
                FeedbackReportCreateRequest("BUG", "OPERATOR", null, null, "媒体缺失", listOf("med_missing")),
            )
        }
        assertEquals(400, missingException.statusCode)

        every { mediaRepository.findAllById(listOf("med_deleted")) } returns listOf(
            media("med_deleted").copy(deletedAt = Instant.parse("2026-08-30T00:00:00Z")),
        )
        val deletedException = assertThrows(ApiResultException::class.java) {
            service.create(
                "user",
                FeedbackReportCreateRequest("BUG", "OPERATOR", null, null, "媒体已删除", listOf("med_deleted")),
            )
        }
        assertEquals(400, deletedException.statusCode)
    }

    @ParameterizedTest
    @ValueSource(strings = ["REPORTER", "ADMIN"])
    fun `用户追加和管理员回复超过 10 个附件时不读取媒体或写工单`(actorMode: String) {
        val userId = if (actorMode == "ADMIN") "admin" else "user"
        prepareTicket(openTicket(), userId, canManage = actorMode == "ADMIN")

        val error = assertThrows(ApiResultException::class.java) {
            service.appendMessage(
                userId,
                "rpt_1",
                FeedbackMessageAppendRequest("附件太多", (1..11).map { "med_$it" }, actorMode),
            )
        }

        assertEquals(400, error.statusCode)
        verify(exactly = 0) { mediaRepository.findAllById(any()) }
        verify(exactly = 0) { ticketRepository.save(any()) }
        verify(exactly = 0) { queryRepository.saveIfUnchanged(any(), any()) }
    }

    @Test
    fun `历史绝对图片 URL 和空 URL 不会被重复拼接或阻断响应`() {
        val ticket = openTicket().copy(
            messages = listOf(
                FeedbackMessage(
                    id = "rpm_history",
                    senderKind = "REPORTER",
                    authorUserId = "user",
                    content = "历史数据",
                    images = listOf(
                        FeedbackMessageImage("med_abs", "https://cdn.example.test/a.webp"),
                        FeedbackMessageImage("med_empty", ""),
                    ),
                    createdAt = Instant.parse("2026-08-30T00:00:00Z"),
                ),
            ),
        )
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket)
        every { accessService.canManage("user", any()) } returns false
        every { userInfoService.get("user") } returns MaaUserInfo("user", "用户")

        val response = service.getById("user", "rpt_1")

        assertEquals("https://cdn.example.test/a.webp", response.messages.single().images[0].url)
        assertEquals("", response.messages.single().images[1].url)
    }

    private fun media(
        id: String,
        path: String = "/media/$id.webp",
        owner: String = "user",
        name: String = "$id.webp",
        mime: String = "image/webp",
        size: Long = 12,
        kind: MediaKind? = null,
    ): MediaAsset = MediaAsset(id, owner, name, mime, size, path, kind = kind)

    @Test
    fun `详情响应透传目标与完成版本`() {
        val ticket = openTicket().copy(
            targetVersionId = "chg_target",
            targetVersionLabel = "0.0.2",
            completedVersionId = "chg_done",
            completedVersionLabel = "0.0.1-beta.5",
        )
        prepareTicket(ticket, "user", canManage = false)

        val detail = service.getById("user", "rpt_1")

        assertEquals("chg_target", detail.targetVersionId)
        assertEquals("0.0.2", detail.targetVersionLabel)
        assertEquals("chg_done", detail.completedVersionId)
        assertEquals("0.0.1-beta.5", detail.completedVersionLabel)
    }

    @Test
    fun `管理员回复未接单工单时原子接单并推进已处理消息边界`() {
        val ticket = openTicket()
        prepareTicket(ticket, "admin", canManage = true)

        service.appendMessage("admin", "rpt_1", FeedbackMessageAppendRequest("已收到", actorMode = "ADMIN"))

        verify {
            queryRepository.saveIfUnchanged(
                ticket,
                match {
                    it.workflowStage == FeedbackWorkflow.PROCESSING &&
                        it.operatorAssigneeUserId == "admin" &&
                        it.teamReadReporterIndex == 0
                },
            )
        }
    }

    @Test
    fun `已合并来源拒绝用户继续追加消息`() {
        val ticket = openTicket().copy(mergedIntoId = "rpt_main")
        prepareTicket(ticket, "user", canManage = false)

        val error = assertThrows(ApiResultException::class.java) {
            service.appendMessage("user", "rpt_1", FeedbackMessageAppendRequest("后续补充", actorMode = "REPORTER"))
        }

        assertEquals(409, error.statusCode)
        verify(exactly = 0) { queryRepository.saveIfUnchanged(any(), any()) }
    }

    @Test
    fun `兼任运营的提交人仅在明确后台详情中看到内部阶段`() {
        val ticket = openTicket().copy(workflowStage = FeedbackWorkflow.PROCESSING, operatorAssigneeUserId = "user")
        prepareTicket(ticket, "user", canManage = true)
        every { accessService.canView("user", FeedbackArea.OPERATOR) } returns true
        every { queryRepository.advanceTeamRead("rpt_1", 0) } returns ticket.copy(teamReadReporterIndex = 0)

        val personal = service.getById("user", "rpt_1")
        val managed = service.getById("user", "rpt_1", adminMode = true)

        assertNull(personal.operatorAssigneeUserId)
        assertFalse(personal.viewerCanManage)
        assertEquals("user", managed.operatorAssigneeUserId)
        assertTrue(managed.viewerCanManage)
    }

    @Test
    fun `历史不一致板块在用户和管理员详情中显示同一有效分类`() {
        val ticket = openTicket().copy(workArea = FeedbackArea.STAR)
        prepareTicket(ticket, "user", canManage = true)
        every { accessService.canView("user", FeedbackArea.STAR) } returns true
        every { queryRepository.advanceTeamRead("rpt_1", 0) } returns ticket.copy(teamReadReporterIndex = 0)

        assertEquals(FeedbackArea.STAR, service.getById("user", "rpt_1").category)
        val managed = service.getById("user", "rpt_1", adminMode = true)
        assertEquals(FeedbackArea.STAR, managed.category)
        assertEquals(FeedbackArea.STAR, managed.workArea)
    }

    @Test
    fun `只有管理员结案公开反馈且选择同步时更新公开完成与时间`() {
        val publicUpdatedAt = Instant.parse("2026-09-01T00:00:00Z")
        for (visibility in listOf(FeedbackVisibility.PUBLIC, FeedbackVisibility.PRIVATE)) {
            for ((actor, sync) in listOf("ADMIN" to true, "ADMIN" to false, "REPORTER" to true)) {
                val id = "${visibility}_${actor}_$sync"
                val currentUser = if (actor == "ADMIN") "admin" else "user"
                val ticket = openTicket().copy(
                    id = id,
                    visibility = visibility,
                    publicStatus = PublicFeedbackStatus.CONFIRMED,
                    publicUpdatedAt = publicUpdatedAt,
                    workflowStage = FeedbackWorkflow.PROCESSING,
                    operatorAssigneeUserId = "admin",
                )
                prepareTicket(ticket, currentUser, canManage = actor == "ADMIN")
                val response = service.updateStatus(
                    currentUser,
                    id,
                    FeedbackStatusUpdateRequest("RESOLVED", actor, completePublicFeedback = sync),
                )
                val completed = visibility == FeedbackVisibility.PUBLIC && actor == "ADMIN" && sync
                assertEquals("RESOLVED", response.status)
                assertEquals(if (completed) PublicFeedbackStatus.COMPLETED else PublicFeedbackStatus.CONFIRMED, response.publicStatus)
                if (completed) {
                    assertNotNull(response.completedAt)
                    assertEquals(response.updatedAt, response.publicUpdatedAt)
                } else {
                    assertNull(response.completedAt)
                    assertEquals(publicUpdatedAt, response.publicUpdatedAt)
                }
                verify(exactly = 1) {
                    queryRepository.saveIfUnchanged(
                        ticket,
                        match { it.status == "RESOLVED" && it.publicStatus == response.publicStatus },
                    )
                }
            }
        }
    }

    @Test
    fun `automation detail read requires backend access and never advances team read cursor`() {
        val ticket = openTicket().copy(
            category = FeedbackArea.UI,
            area = FeedbackArea.UI,
            workArea = FeedbackArea.UI,
            workflowStage = FeedbackWorkflow.PROCESSING,
            operatorAssigneeUserId = "admin",
            teamReadReporterIndex = -1,
        )
        prepareTicket(ticket, "admin", canManage = true)
        every { accessService.canView("admin", FeedbackArea.UI) } returns true

        val response = service.getByIdForAutomation("admin", "rpt_1", setOf(FeedbackArea.UI))

        assertEquals(FeedbackArea.UI, response.workArea)
        assertTrue(response.teamUnread)
        verify(exactly = 0) { queryRepository.advanceTeamRead(any(), any()) }
        verify(exactly = 0) { notificationService.clearFeedbackReminders(any(), any()) }
    }

    @Test
    fun `automation detail read enforces token area restriction even for an authorized operator`() {
        val ticket = openTicket().copy(
            category = FeedbackArea.UI,
            area = FeedbackArea.UI,
            workArea = FeedbackArea.UI,
        )
        prepareTicket(ticket, "admin", canManage = true)
        every { accessService.canView("admin", FeedbackArea.UI) } returns true

        val error = assertThrows(ApiResultException::class.java) {
            service.getByIdForAutomation("admin", "rpt_1", setOf(FeedbackArea.STAR))
        }

        assertEquals(403, error.statusCode)
    }

    private fun prepareTicket(ticket: FeedbackTicket, currentUserId: String, canManage: Boolean) {
        every { ticketRepository.findById(checkNotNull(ticket.id)) } returns Optional.of(ticket)
        every { ticketRepository.save(any()) } answers { firstArg() }
        every { accessService.canManage(currentUserId, any()) } returns canManage
        every { mediaRepository.findAllById(emptyList()) } returns emptyList()
        every { userInfoService.get(any()) } answers {
            val userId = firstArg<String>()
            MaaUserInfo(userId, userId)
        }
    }

    private fun openTicket(): FeedbackTicket = FeedbackTicket(
        id = "rpt_1",
        type = FeedbackType.BUG,
        category = FeedbackArea.OPERATOR,
        area = FeedbackArea.OPERATOR,
        reporterUserId = "user",
        content = "原始反馈",
        messages = listOf(
            FeedbackMessage(
                id = "rpm_initial",
                senderKind = "REPORTER",
                authorUserId = "user",
                content = "原始反馈",
            ),
        ),
    )
}
