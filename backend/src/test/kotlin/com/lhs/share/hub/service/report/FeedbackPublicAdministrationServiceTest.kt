package com.lhs.share.hub.service.report

import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.report.request.FeedbackMergeRequest
import com.lhs.share.hub.controller.report.request.FeedbackPublicStatusRequest
import com.lhs.share.hub.controller.report.request.FeedbackPublishRequest
import com.lhs.share.hub.controller.report.request.FeedbackTypeUpdateRequest
import com.lhs.share.hub.controller.report.request.FeedbackVersionRequest
import com.lhs.share.hub.repository.ChangelogEntryRepository
import com.lhs.share.hub.repository.FeedbackSupportRepository
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.entity.ChangelogEntry
import com.lhs.share.hub.repository.entity.ChangelogPublishedRevision
import com.lhs.share.hub.repository.entity.ChangelogRevisionState
import com.lhs.share.hub.repository.entity.ChangelogWorkingRevision
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.service.notification.NotificationService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.Optional

class FeedbackPublicAdministrationServiceTest {
    private val ticketRepository = mockk<FeedbackTicketRepository>()
    private val queryRepository = mockk<FeedbackTicketQueryRepository>()
    private val supportRepository = mockk<FeedbackSupportRepository>()
    private val changelogEntryRepository = mockk<ChangelogEntryRepository>()
    private val accessService = mockk<FeedbackAccessService>(relaxed = true)
    private val notificationService = mockk<NotificationService>(relaxed = true)
    private val service = FeedbackPublicAdministrationService(
        ticketRepository,
        queryRepository,
        supportRepository,
        changelogEntryRepository,
        accessService,
        notificationService,
    )

    private fun changelogEntry(id: String, publishedLabel: String? = null, workingLabel: String? = null) = ChangelogEntry(
        id = id,
        createdBy = "author",
        createdAt = Instant.parse("2026-09-01T00:00:00Z"),
        updatedBy = "author",
        updatedAt = Instant.parse("2026-09-01T00:00:00Z"),
        publishedRevision = publishedLabel?.let { label ->
            ChangelogPublishedRevision(
                revision = 1,
                title = "版本 " + label,
                versionLabel = label,
                body = emptyMap(),
                mediaIds = emptySet(),
                authoredBy = "author",
                submittedBy = "author",
                submittedAt = Instant.parse("2026-09-01T00:00:00Z"),
                approvedBy = "reviewer",
                publishedAt = Instant.parse("2026-09-02T00:00:00Z"),
            )
        },
        workingRevision = workingLabel?.let { label ->
            ChangelogWorkingRevision(
                revision = 2,
                state = ChangelogRevisionState.DRAFT,
                title = "版本 " + label,
                versionLabel = label,
                body = emptyMap(),
                mediaIds = emptySet(),
                authoredBy = "author",
                updatedBy = "author",
                updatedAt = Instant.parse("2026-09-03T00:00:00Z"),
            )
        },
    )

    private fun ticket(
        id: String,
        visibility: String? = FeedbackVisibility.PRIVATE,
        mergedIntoId: String? = null,
        reporterUserId: String = "reporter",
        publishedAt: Instant? = null,
    ) = FeedbackTicket(
        id = id,
        type = FeedbackType.BUG,
        category = FeedbackArea.OPERATOR,
        area = FeedbackArea.OPERATOR,
        status = "OPEN",
        reporterUserId = reporterUserId,
        content = "正文",
        visibility = visibility,
        publicTitle = "已填公开标题",
        publicStatus = PublicFeedbackStatus.COLLECTING,
        mergedIntoId = mergedIntoId,
        publishedAt = publishedAt,
    )

    private fun allowManage() {
        every { accessService.canManage(any(), any()) } returns true
        every { accessService.canControlTicket(any(), any()) } returns true
    }

    @Test
    fun `even administrators cannot merge tickets across spaces`() {
        allowManage()
        every { ticketRepository.findById("a") } returns Optional.of(ticket("a").copy(spaceId = "partner-a"))
        every { ticketRepository.findById("b") } returns Optional.of(ticket("b").copy(spaceId = "partner-b"))
        assertEquals(
            400,
            assertThrows(ApiResultException::class.java) {
                service.merge("admin", "a", FeedbackMergeRequest("b"))
            }.statusCode,
        )
        verify(exactly = 0) { queryRepository.setMergedInto(any(), any()) }
    }

    @Test
    fun `partner version options never expose main-site draft versions`() {
        every { accessService.querySpaces("partner", "partner-a") } returns setOf("partner-a")
        assertEquals(emptyList<Any>(), service.versionOptions("partner", "partner-a"))
        verify(exactly = 0) { changelogEntryRepository.findAll() }
    }

    @Test
    fun `举报即使授权也不能公开或改类且不会写库`() {
        allowManage()
        for (report in listOf(
            ticket("report").copy(type = FeedbackType.REPORT, publicConsent = true),
            ticket("report").copy(type = FeedbackType.LEGACY_FEEDBACK, category = "REPORT", publicConsent = true),
        )) {
            every { ticketRepository.findById("report") } returns Optional.of(report)
            assertEquals(
                403,
                assertThrows(ApiResultException::class.java) {
                    service.publish("admin", "report", FeedbackPublishRequest(publicTitle = "标题"))
                }.statusCode,
            )
            assertEquals(
                403,
                assertThrows(ApiResultException::class.java) {
                    service.updateType("admin", "report", FeedbackTypeUpdateRequest("OTHER"))
                }.statusCode,
            )
        }
        verify(exactly = 0) { queryRepository.setPublicInfo(any(), any(), any(), any(), any(), any(), any(), any()) }
        verify(exactly = 0) { queryRepository.setType(any(), any()) }
    }

    @Test
    fun `举报与普通工单双向合并均不能绕过公开或关注限制`() {
        allowManage()
        for ((sourceType, targetType) in listOf("REPORT" to "OTHER", "OTHER" to "REPORT")) {
            every { ticketRepository.findById("source") } returns Optional.of(ticket("source").copy(type = sourceType))
            every { ticketRepository.findById("target") } returns Optional.of(
                ticket("target", visibility = FeedbackVisibility.PUBLIC).copy(type = targetType),
            )
            assertEquals(
                403,
                assertThrows(ApiResultException::class.java) {
                    service.merge("admin", "source", FeedbackMergeRequest("target"))
                }.statusCode,
            )
        }
        verify(exactly = 0) { queryRepository.setMergedInto(any(), any()) }
        verify(exactly = 0) { supportRepository.save(any()) }
    }

    @Test
    fun `举报之间仍可内部合并但不自动关注历史误公开目标`() {
        allowManage()
        val source = ticket("source").copy(type = "REPORT")
        val target = ticket("target", visibility = FeedbackVisibility.PUBLIC).copy(type = "REPORT")
        every { ticketRepository.findById("source") } returns Optional.of(source)
        every { ticketRepository.findById("target") } returns Optional.of(target)
        every { queryRepository.setMergedInto("source", "target") } returns source.copy(mergedIntoId = "target")
        every { queryRepository.incrementMergedCount("target") } returns target.copy(mergedCount = 1)
        assertEquals("target", service.merge("admin", "source", FeedbackMergeRequest("target")).mergedIntoId)
        verify(exactly = 0) { supportRepository.save(any()) }
        verify(exactly = 0) { queryRepository.incrementSupportCount(any()) }
    }

    @Test
    fun `已公开普通工单不能通过改类变成公开举报`() {
        allowManage()
        every { ticketRepository.findById("public") } returns Optional.of(ticket("public", visibility = FeedbackVisibility.PUBLIC))
        assertEquals(
            403,
            assertThrows(ApiResultException::class.java) {
                service.updateType("admin", "public", FeedbackTypeUpdateRequest("REPORT"))
            }.statusCode,
        )
        verify(exactly = 0) { queryRepository.setType(any(), any()) }
    }

    @Test
    fun `非管理员发布返回 403`() {
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1").copy(publicConsent = true))
        every { accessService.canManage(any(), any()) } returns false

        val error = assertThrows(ApiResultException::class.java) {
            service.publish("user", "rpt_1", FeedbackPublishRequest(publicTitle = "公开标题"))
        }

        assertEquals(403, error.statusCode)
        verify(exactly = 0) { queryRepository.setPublicInfo(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `管理员不能发布或重新发布未授权的反馈且不会写入`() {
        allowManage()
        for (visibility in listOf(FeedbackVisibility.PRIVATE, FeedbackVisibility.PUBLIC)) {
            every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1", visibility = visibility))

            val error = assertThrows(ApiResultException::class.java) {
                service.publish("admin", "rpt_1", FeedbackPublishRequest(publicTitle = "公开标题"))
            }

            assertEquals(403, error.statusCode)
            assertEquals("用户未授权发布到反馈广场", error.message)
        }
        verify(exactly = 0) { queryRepository.setPublicInfo(any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `发布要求公开标题非空`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1").copy(publicConsent = true))

        val error = assertThrows(ApiResultException::class.java) {
            service.publish("admin", "rpt_1", FeedbackPublishRequest(publicTitle = "   "))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `发布写入公开字段并保留首次发布时间`() {
        allowManage()
        val published = Instant.parse("2026-09-01T00:00:00Z")
        every { ticketRepository.findById("rpt_1") } returns
            Optional.of(ticket("rpt_1", publishedAt = published).copy(publicConsent = true))
        every { queryRepository.setPublicInfo(any(), any(), any(), any(), any(), any(), any(), any()) } returns ticket(
            "rpt_1",
            visibility = FeedbackVisibility.PUBLIC,
            publishedAt = published,
        )

        service.publish("admin", "rpt_1", FeedbackPublishRequest(publicTitle = "公开标题", publicStatus = "planned"))

        verify(exactly = 1) {
            queryRepository.setPublicInfo(
                ticketId = "rpt_1",
                visibility = FeedbackVisibility.PUBLIC,
                publicTitle = "公开标题",
                publicSummary = null,
                publicStatus = PublicFeedbackStatus.PLANNED,
                publishedAt = published,
                publicUpdatedAt = any(),
            )
        }
    }

    @Test
    fun `取消公开不删除支持记录`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(
            ticket("rpt_1", visibility = FeedbackVisibility.PUBLIC),
        )
        every { queryRepository.setPublicInfo(any(), any(), any(), any(), any(), any(), any(), any()) } returns ticket(
            "rpt_1",
            visibility = FeedbackVisibility.PRIVATE,
        )

        service.unpublish("admin", "rpt_1")

        verify(exactly = 1) {
            queryRepository.setPublicInfo(
                ticketId = "rpt_1",
                visibility = FeedbackVisibility.PRIVATE,
                publicTitle = any(),
                publicSummary = any(),
                publicStatus = any(),
                publishedAt = any(),
                publicUpdatedAt = any(),
            )
        }
        verify(exactly = 0) { supportRepository.deleteByFeedbackIdAndUserId(any(), any()) }
    }

    @Test
    fun `修改公开状态需要先公开`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))

        val error = assertThrows(ApiResultException::class.java) {
            service.updatePublicStatus("admin", "rpt_1", FeedbackPublicStatusRequest(publicStatus = "PLANNED"))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `不能把反馈合并到自身`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))

        val error = assertThrows(ApiResultException::class.java) {
            service.merge("admin", "rpt_1", FeedbackMergeRequest(targetFeedbackId = "rpt_1"))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `合并成环被拒绝`() {
        allowManage()
        val source = ticket("rpt_a")
        val target = ticket("rpt_b", mergedIntoId = "rpt_a")
        every { ticketRepository.findById("rpt_a") } returns Optional.of(source)
        every { ticketRepository.findById("rpt_b") } returns Optional.of(target)

        val error = assertThrows(ApiResultException::class.java) {
            service.merge("admin", "rpt_a", FeedbackMergeRequest(targetFeedbackId = "rpt_b"))
        }

        assertEquals(409, error.statusCode)
    }

    @Test
    fun `不允许将反馈并入已合并来源`() {
        allowManage()
        val sourceC = ticket("rpt_c")
        val targetB = ticket("rpt_b", mergedIntoId = "rpt_a")
        val rootA = ticket("rpt_a")
        every { ticketRepository.findById("rpt_c") } returns Optional.of(sourceC)
        every { ticketRepository.findById("rpt_b") } returns Optional.of(targetB)
        every { ticketRepository.findById("rpt_a") } returns Optional.of(rootA)
        val error = assertThrows(ApiResultException::class.java) {
            service.merge("admin", "rpt_c", FeedbackMergeRequest(targetFeedbackId = "rpt_b"))
        }

        assertEquals(409, error.statusCode)
        verify(exactly = 0) { queryRepository.setMergedInto(any(), any()) }
    }

    @Test
    fun `公开反馈不能合并到未公开反馈`() {
        allowManage()
        val source = ticket("rpt_public", visibility = FeedbackVisibility.PUBLIC)
        val target = ticket("rpt_private")
        every { ticketRepository.findById("rpt_public") } returns Optional.of(source)
        every { ticketRepository.findById("rpt_private") } returns Optional.of(target)

        val error = assertThrows(ApiResultException::class.java) {
            service.merge("admin", "rpt_public", FeedbackMergeRequest(targetFeedbackId = "rpt_private"))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `合并后源提交人自动支持主反馈一次`() {
        allowManage()
        val source = ticket("rpt_source", reporterUserId = "reporter")
        val target = ticket("rpt_main", visibility = FeedbackVisibility.PUBLIC)
        every { ticketRepository.findById("rpt_source") } returns Optional.of(source)
        every { ticketRepository.findById("rpt_main") } returns Optional.of(target)
        every { queryRepository.setMergedInto("rpt_source", "rpt_main") } returns source.copy(mergedIntoId = "rpt_main")
        every { queryRepository.incrementMergedCount("rpt_main") } returns target.copy(mergedCount = 1)
        every { supportRepository.existsByFeedbackIdAndUserId("rpt_main", "reporter") } returns false
        every { supportRepository.save(any()) } answers { firstArg() }
        every { queryRepository.incrementSupportCount("rpt_main") } returns target.copy(supportCount = 1)

        service.merge("admin", "rpt_source", FeedbackMergeRequest(targetFeedbackId = "rpt_main"))

        verify(exactly = 1) { supportRepository.save(match { it.feedbackId == "rpt_main" && it.userId == "reporter" }) }
        verify(exactly = 1) { queryRepository.incrementSupportCount("rpt_main") }
    }

    @Test
    fun `合并后源提交人已支持时不重复计票`() {
        allowManage()
        val source = ticket("rpt_source", reporterUserId = "reporter")
        val target = ticket("rpt_main", visibility = FeedbackVisibility.PUBLIC)
        every { ticketRepository.findById("rpt_source") } returns Optional.of(source)
        every { ticketRepository.findById("rpt_main") } returns Optional.of(target)
        every { queryRepository.setMergedInto("rpt_source", "rpt_main") } returns source.copy(mergedIntoId = "rpt_main")
        every { queryRepository.incrementMergedCount("rpt_main") } returns target.copy(mergedCount = 1)
        every { supportRepository.existsByFeedbackIdAndUserId("rpt_main", "reporter") } returns true

        service.merge("admin", "rpt_source", FeedbackMergeRequest(targetFeedbackId = "rpt_main"))

        verify(exactly = 0) { supportRepository.save(any()) }
        verify(exactly = 0) { queryRepository.incrementSupportCount(any()) }
    }

    @Test
    fun `已有子反馈的来源不能再次合并`() {
        allowManage()
        every { ticketRepository.findById("rpt_source") } returns Optional.of(ticket("rpt_source").copy(mergedCount = 2))

        val error = assertThrows(ApiResultException::class.java) {
            service.merge("admin", "rpt_source", FeedbackMergeRequest(targetFeedbackId = "rpt_target"))
        }

        assertEquals(409, error.statusCode)
        verify(exactly = 0) { queryRepository.setMergedInto(any(), any()) }
    }

    @Test
    fun `原子合并竞争失败不会增加主单计数`() {
        allowManage()
        every { ticketRepository.findById("rpt_source") } returns Optional.of(ticket("rpt_source"))
        every { ticketRepository.findById("rpt_target") } returns Optional.of(ticket("rpt_target"))
        every { queryRepository.setMergedInto("rpt_source", "rpt_target") } returns null

        val error = assertThrows(ApiResultException::class.java) {
            service.merge("admin", "rpt_source", FeedbackMergeRequest(targetFeedbackId = "rpt_target"))
        }

        assertEquals(409, error.statusCode)
        verify(exactly = 0) { queryRepository.incrementMergedCount(any()) }
    }

    @Test
    fun `关联版本需要板块管理权限`() {
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { accessService.canManage(any(), any()) } returns false

        val error = assertThrows(ApiResultException::class.java) {
            service.updateVersions("user", "rpt_1", FeedbackVersionRequest(targetVersionId = "chg_1"))
        }

        assertEquals(403, error.statusCode)
    }

    @Test
    fun `完成版本必须是已发布更新日志`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { changelogEntryRepository.findById("chg_draft") } returns Optional.of(
            changelogEntry("chg_draft", workingLabel = "0.0.3"),
        )

        val error = assertThrows(ApiResultException::class.java) {
            service.updateVersions("admin", "rpt_1", FeedbackVersionRequest(completedVersionId = "chg_draft"))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `目标版本允许草稿并写入 id 与 label 快照`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { changelogEntryRepository.findById("chg_draft") } returns Optional.of(
            changelogEntry("chg_draft", workingLabel = "0.0.3"),
        )
        every { queryRepository.setVersions(any(), any(), any(), any(), any()) } returns ticket("rpt_1")

        service.updateVersions("admin", "rpt_1", FeedbackVersionRequest(targetVersionId = "chg_draft"))

        verify(exactly = 1) { queryRepository.setVersions("rpt_1", "chg_draft", "0.0.3", null, null) }
    }

    @Test
    fun `反馈管理员可读取草稿与已发布版本选项但看不到正文`() {
        every { accessService.operatorAreas("admin") } returns setOf(FeedbackArea.OPERATOR)
        every { changelogEntryRepository.findAll() } returns listOf(
            changelogEntry("chg_pub", publishedLabel = "0.0.1-beta.7"),
            changelogEntry("chg_draft", workingLabel = "0.0.1-beta.8"),
        )

        val options = service.versionOptions("admin")

        assertEquals(
            setOf(
                Triple("chg_pub", "0.0.1-beta.7", true),
                Triple("chg_draft", "0.0.1-beta.8", false),
            ),
            options.map { Triple(it.id, it.versionLabel, it.published) }.toSet(),
        )
    }

    @Test
    fun `无反馈管理权限不能读取版本选项`() {
        every { accessService.operatorAreas("user") } returns emptySet()

        val error = assertThrows(ApiResultException::class.java) {
            service.versionOptions("user")
        }

        assertEquals(403, error.statusCode)
    }

    @Test
    fun `关联完成版本使用已发布标签`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { changelogEntryRepository.findById("chg_pub") } returns Optional.of(
            changelogEntry("chg_pub", publishedLabel = "0.0.1-beta.5"),
        )
        every { queryRepository.setVersions(any(), any(), any(), any(), any()) } returns ticket("rpt_1")

        service.updateVersions("admin", "rpt_1", FeedbackVersionRequest(completedVersionId = "chg_pub"))

        verify(exactly = 1) { queryRepository.setVersions("rpt_1", null, null, "chg_pub", "0.0.1-beta.5") }
    }

    @Test
    fun `不存在的版本被拒绝`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { changelogEntryRepository.findById("chg_missing") } returns Optional.empty()

        val error = assertThrows(ApiResultException::class.java) {
            service.updateVersions("admin", "rpt_1", FeedbackVersionRequest(targetVersionId = "chg_missing"))
        }

        assertEquals(400, error.statusCode)
    }

    @Test
    fun `清除版本写入 null`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { queryRepository.setVersions(any(), any(), any(), any(), any()) } returns ticket("rpt_1")

        service.updateVersions("admin", "rpt_1", FeedbackVersionRequest())

        verify(exactly = 1) { queryRepository.setVersions("rpt_1", null, null, null, null) }
    }

    @Test
    fun `修改类型需要管理权限并校验枚举`() {
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { accessService.canManage(any(), any()) } returns false
        val forbidden = assertThrows(ApiResultException::class.java) {
            service.updateType("user", "rpt_1", FeedbackTypeUpdateRequest(type = "FEATURE"))
        }
        assertEquals(403, forbidden.statusCode)

        allowManage()
        val invalid = assertThrows(ApiResultException::class.java) {
            service.updateType("admin", "rpt_1", FeedbackTypeUpdateRequest(type = "UNKNOWN"))
        }
        assertEquals(400, invalid.statusCode)
    }

    @Test
    fun `修改类型写入规范化后的类型`() {
        allowManage()
        every { ticketRepository.findById("rpt_1") } returns Optional.of(ticket("rpt_1"))
        every { queryRepository.setType("rpt_1", "FEATURE") } returns ticket("rpt_1").copy(type = FeedbackType.FEATURE)

        service.updateType("admin", "rpt_1", FeedbackTypeUpdateRequest(type = "feature"))

        verify(exactly = 1) { queryRepository.setType("rpt_1", "FEATURE") }
    }

    @Test
    fun `发布面板保存完成状态维护完成时间且离开完成状态清空`() {
        allowManage()
        val completed = Instant.parse("2026-09-01T00:00:00Z")
        every { queryRepository.setPublicInfo(any(), any(), any(), any(), any(), any(), any(), any()) } returns ticket("rpt_1")
        for (oldCompleted in listOf(null, completed)) {
            val original = ticket("rpt_1", visibility = FeedbackVisibility.PUBLIC).copy(
                publicConsent = true,
                completedAt = oldCompleted,
            )
            every { ticketRepository.findById("rpt_1") } returns Optional.of(original)
            service.publish("admin", "rpt_1", FeedbackPublishRequest(publicTitle = "公开标题", publicStatus = "COMPLETED"))
            verify {
                queryRepository.setPublicInfo(
                    "rpt_1",
                    FeedbackVisibility.PUBLIC,
                    "公开标题",
                    null,
                    PublicFeedbackStatus.COMPLETED,
                    any(),
                    any(),
                    match { oldCompleted == null || it.equals(oldCompleted) },
                )
            }
        }
        every { ticketRepository.findById("rpt_1") } returns Optional.of(
            ticket("rpt_1", visibility = FeedbackVisibility.PUBLIC).copy(publicConsent = true, completedAt = completed),
        )
        service.publish("admin", "rpt_1", FeedbackPublishRequest(publicTitle = "公开标题", publicStatus = "CONFIRMED"))
        verify {
            queryRepository.setPublicInfo(
                "rpt_1",
                FeedbackVisibility.PUBLIC,
                "公开标题",
                null,
                PublicFeedbackStatus.CONFIRMED,
                any(),
                any(),
                null,
            )
        }
        service.unpublish("admin", "rpt_1")
        verify { queryRepository.setPublicInfo("rpt_1", FeedbackVisibility.PRIVATE, any(), any(), any(), any(), any(), completed) }
    }
}
