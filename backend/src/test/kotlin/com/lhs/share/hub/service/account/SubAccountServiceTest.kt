package com.lhs.share.hub.service.account

import com.lhs.share.hub.repository.ActivityCalendarSubscriptionRepository
import com.lhs.share.hub.repository.CalendarPrivateItemRepository
import com.lhs.share.hub.repository.InventoryAgentFavoriteRepository
import com.lhs.share.hub.repository.InventoryCurrentRepository
import com.lhs.share.hub.repository.InventoryDeletedRecordRepository
import com.lhs.share.hub.repository.InventoryRecordRepository
import com.lhs.share.hub.repository.InventoryRevisionRepository
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.OperatorCorrectionRecordRepository
import com.lhs.share.hub.repository.OperatorCurrentRepository
import com.lhs.share.hub.repository.OperatorDailyTasksRepository
import com.lhs.share.hub.repository.OperatorGrowthTargetRepository
import com.lhs.share.hub.repository.OperatorMilestoneRepository
import com.lhs.share.hub.repository.OperatorOrganizationRepository
import com.lhs.share.hub.repository.OperatorPlannerImportRepository
import com.lhs.share.hub.repository.OperatorRecordRepository
import com.lhs.share.hub.repository.OperatorRelationshipRepository
import com.lhs.share.hub.repository.OperatorScanReviewRepository
import com.lhs.share.hub.repository.OperatorStaminaScheduleRepository
import com.lhs.share.hub.repository.OperatorTrainingWorkspaceRepository
import com.lhs.share.hub.repository.OperatorUpgradeTransactionRepository
import com.lhs.share.hub.repository.OperatorV3ImportRecordRepository
import com.lhs.share.hub.repository.RecruitmentRepository
import com.lhs.share.hub.repository.StarCompletionRepository
import com.lhs.share.hub.repository.StarLoadoutCurrentRepository
import com.lhs.share.hub.repository.StarRecoveryPointRepository
import com.lhs.share.hub.repository.StarScanRecordRepository
import com.lhs.share.hub.repository.StarStateCurrentRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.openapi.OpenApiTokenService
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.SimpleTransactionStatus
import org.springframework.transaction.support.TransactionTemplate

class SubAccountServiceTest {
    private val mailboxDeliveries = mockk<com.lhs.share.hub.repository.MailboxDeliveryRepository>(relaxed = true)
    private val mailboxHistory = mockk<com.lhs.share.hub.repository.MailboxReserveHistoryRepository>(relaxed = true)
    private val accountRepository = mockk<SubAccountRepository>()
    private val inventoryCurrentRepository = mockk<InventoryCurrentRepository>()
    private val inventoryRecordRepository = mockk<InventoryRecordRepository>()
    private val inventoryDeletedRecordRepository = mockk<InventoryDeletedRecordRepository>()
    private val favoriteRepository = mockk<InventoryAgentFavoriteRepository>()
    private val operatorCurrentRepository = mockk<OperatorCurrentRepository>()
    private val operatorRecordRepository = mockk<OperatorRecordRepository>()
    private val operatorCorrectionRecordRepository = mockk<OperatorCorrectionRecordRepository>()
    private val operatorV3ImportRecordRepository = mockk<OperatorV3ImportRecordRepository>()
    private val operatorScanReviewRepository = mockk<OperatorScanReviewRepository>(relaxed = true)
    private val tokenService = mockk<OpenApiTokenService>()
    private val annotationRepository = mockk<OperatorAnnotationRepository>()
    private val targetRepository = mockk<OperatorGrowthTargetRepository>()
    private val upgradeRepository = mockk<OperatorUpgradeTransactionRepository>()
    private val resetRepository = mockk<com.lhs.share.hub.repository.OperatorResetTransactionRepository>(relaxed = true)
    private val completionRepository = mockk<StarCompletionRepository>(relaxed = true)
    private val revisionRepository = mockk<InventoryRevisionRepository>()
    private val trainingWorkspaceRepository = mockk<OperatorTrainingWorkspaceRepository>(relaxed = true)
    private val organizationRepository = mockk<OperatorOrganizationRepository>(relaxed = true)
    private val staminaScheduleRepository = mockk<OperatorStaminaScheduleRepository>(relaxed = true)
    private val relationships = mockk<OperatorRelationshipRepository>(relaxed = true)
    private val milestoneRepository = mockk<OperatorMilestoneRepository>(relaxed = true)
    private val dailyTasksRepository = mockk<OperatorDailyTasksRepository>(relaxed = true)
    private val plannerImportRepository = mockk<OperatorPlannerImportRepository>(relaxed = true)
    private val starScanRecords = mockk<StarScanRecordRepository>(relaxed = true)
    private val starStateRepository = mockk<StarStateCurrentRepository>(relaxed = true)
    private val starRecoveryRepository = mockk<StarRecoveryPointRepository>(relaxed = true)
    private val starLoadoutRepository = mockk<StarLoadoutCurrentRepository>(relaxed = true)
    private val calendarSubscriptions = mockk<ActivityCalendarSubscriptionRepository>()
    private val calendarPrivateItems = mockk<CalendarPrivateItemRepository>()
    private val recruitmentRepository = mockk<RecruitmentRepository>()
    init {
        every { calendarSubscriptions.exists(any(), any()) } returns false
        every { calendarPrivateItems.exists(any(), any()) } returns false
        every { calendarPrivateItems.deleteAccount(any(), any()) } just runs
        every { calendarSubscriptions.deleteAccount(any(), any()) } just runs
        every { accountRepository.fenceRecruitmentWrite(any(), any(), any()) } returns true
        every { recruitmentRepository.hasSubstantiveData(any(), any()) } returns false
        every { recruitmentRepository.removeEmptyPreferences(any(), any()) } just runs
        every { recruitmentRepository.deleteAccount(any(), any()) } just runs
    }
    private val transactionTemplate = TransactionTemplate(
        object : PlatformTransactionManager {
            override fun getTransaction(definition: TransactionDefinition?): TransactionStatus = SimpleTransactionStatus()
            override fun commit(status: TransactionStatus) = Unit
            override fun rollback(status: TransactionStatus) = Unit
        },
    )
    private val service = SubAccountService(
        accountRepository,
        inventoryCurrentRepository,
        inventoryRecordRepository,
        inventoryDeletedRecordRepository,
        favoriteRepository,
        operatorCurrentRepository,
        operatorRecordRepository,
        operatorCorrectionRecordRepository,
        operatorV3ImportRecordRepository,
        operatorScanReviewRepository,
        tokenService,
        transactionTemplate,
        annotationRepository,
        targetRepository,
        upgradeRepository,
        revisionRepository,
        trainingWorkspaceRepository,
        staminaScheduleRepository,
        plannerImportRepository,
        starLoadoutRepository,
        starStateRepository,
        starRecoveryRepository,
        recruitmentRepository,
        calendarSubscriptions = calendarSubscriptions,
        calendarPrivateItems = calendarPrivateItems,
        starCompletionRepository = completionRepository,
        operatorOrganizationRepository = organizationRepository,
        operatorDailyTasksRepository = dailyTasksRepository,
        operatorMilestoneRepository = milestoneRepository,
        operatorRelationships = relationships,
        starScanRecords = starScanRecords,
        operatorResets = resetRepository,
        mailboxHistory = mailboxHistory,
        mailboxDeliveries = mailboxDeliveries,
    )

    @Test
    fun `subaccount deletion cannot cascade user global star loadout presets`() {
        assertFalse(
            SubAccountService::class.java.declaredFields.any {
                it.type.simpleName == "StarLoadoutPresetCurrentRepository"
            },
        )
    }

    @Test
    fun `create list and partial updates preserve account identity and fields`() {
        every { accountRepository.countByUserId("u1") } returns 0
        every { accountRepository.findAllByUserIdOrderByCreatedAtAsc("u1") } answers {
            listOf(SubAccount(id = "mongo-id", userId = "u1", accountId = "main", name = "大号", game = "如鸢"))
        }
        val stored = mutableMapOf<String, SubAccount>()
        every { accountRepository.findByUserIdAndAccountId("u1", any()) } answers {
            stored[secondArg()] ?: SubAccount(id = "mongo-id", userId = "u1", accountId = secondArg(), name = "大号", game = "如鸢")
        }
        every { accountRepository.save(any()) } answers {
            firstArg<SubAccount>().let { account ->
                val saved = if (account.id == null) account.copy(id = "mongo-id") else account
                stored[saved.accountId] = saved
                saved
            }
        }
        every { accountRepository.updateDetails("u1", any(), any(), any(), any()) } answers {
            val old = stored.getValue(secondArg())
            stored[old.accountId] = old.copy(name = thirdArg(), game = args[3] as String, updatedAt = args[4] as java.time.Instant)
            Unit
        }

        val created = service.create("u1", "新账号", "如鸢")
        val listed = service.list("u1")
        val gameOnly = service.update("u1", created.id, null, "代号鸢")
        val nameOnly = service.update("u1", created.id, "改名", null)

        assertTrue(created.id.matches(Regex("^acc_[0-9a-f]{32}$")))
        assertEquals("如鸢", created.game)
        assertEquals("main", listed.single().id)
        assertEquals("如鸢", listed.single().game)
        assertEquals(created.id, gameOnly.id)
        assertEquals("新账号", gameOnly.name)
        assertEquals("代号鸢", gameOnly.game)
        assertEquals(created.id, nameOnly.id)
        assertEquals("改名", nameOnly.name)
        assertEquals("代号鸢", nameOnly.game)
        assertEquals(created.createdAt, gameOnly.createdAt)
        assertNotEquals(created.updatedAt, nameOnly.updatedAt)
        verify(exactly = 0) { inventoryCurrentRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { inventoryRecordRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { inventoryDeletedRecordRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { favoriteRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { operatorCurrentRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { operatorRecordRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { operatorCorrectionRecordRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { operatorV3ImportRecordRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { operatorScanReviewRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { annotationRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { targetRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { upgradeRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { starStateRepository.deleteAllByUserIdAndAccountId(any(), any()) }
    }

    @Test
    fun `create defaults game to code yuan`() {
        every { accountRepository.countByUserId("u1") } returns 0
        every { accountRepository.save(any()) } answers { firstArg<SubAccount>().copy(id = "mongo-id") }

        assertEquals("代号鸢", service.create("u1", "默认账号").game)
    }

    @Test
    fun `invalid game and empty patch return stable 422 errors`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "mongo-id", userId = "u1", accountId = "main", name = "大号")

        val invalidCreate = assertThrows(InventoryApiException::class.java) { service.create("u1", "大号", "universal") }
        val invalid = assertThrows(InventoryApiException::class.java) { service.update("u1", "main", null, "all") }
        val empty = assertThrows(InventoryApiException::class.java) { service.update("u1", "main", null, null) }

        assertEquals("invalid_game", invalidCreate.code)
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, invalid.status)
        assertEquals("invalid_game", invalid.code)
        assertEquals("game 只允许 代号鸢 或 如鸢", invalid.message)
        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, empty.status)
        assertEquals("schema_validation_failed", empty.code)
        verify(exactly = 0) { accountRepository.save(any()) }
    }

    @Test
    fun `foreign account is hidden and duplicate name returns conflict`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "foreign") } returns null
        every { accountRepository.countByUserId("u1") } returns 0
        every { accountRepository.save(any()) } throws DuplicateKeyException("duplicate")

        val missing = assertThrows(InventoryApiException::class.java) { service.update("u1", "foreign", "名称", null) }
        val conflict = assertThrows(InventoryApiException::class.java) { service.create("u1", "重复") }

        assertEquals(404, missing.status.value())
        assertEquals("account_not_found", missing.code)
        assertEquals(409, conflict.status.value())
        assertEquals("account_name_conflict", conflict.code)
    }

    @Test
    fun `eleventh account is rejected`() {
        every { accountRepository.countByUserId("u1") } returns 10

        val error = assertThrows(InventoryApiException::class.java) { service.create("u1", "超额账号") }

        assertEquals(409, error.status.value())
        assertEquals("account_limit_reached", error.code)
        verify(exactly = 0) { accountRepository.save(any()) }
    }

    @Test
    fun `delete cascades all domains data favorites and tokens`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(id = "mongo-id", userId = "u1", accountId = "main", name = "大号")
        every { inventoryCurrentRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { inventoryRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { inventoryDeletedRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { favoriteRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { operatorCurrentRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { operatorRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { operatorCorrectionRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { operatorV3ImportRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { operatorScanReviewRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { annotationRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { targetRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { upgradeRepository.deleteAllByUserIdAndAccountId("u1", "main") } just runs
        every { revisionRepository.deleteByUserIdAndAccountId("u1", "main") } returns 1
        every { tokenService.revokeByAccount("u1", "main") } just runs
        every { accountRepository.deleteById("mongo-id") } just runs

        service.delete("u1", "main")
        verify(exactly = 1) { mailboxHistory.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { mailboxDeliveries.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { calendarSubscriptions.deleteAccount("u1", "main") }
        verify(exactly = 1) { calendarPrivateItems.deleteAccount("u1", "main") }

        verify(exactly = 1) { trainingWorkspaceRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { organizationRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { staminaScheduleRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { dailyTasksRepository.deleteAccount("u1", "main") }
        verify(exactly = 1) { plannerImportRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { starStateRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { starScanRecords.deleteByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { starRecoveryRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { starLoadoutRepository.deleteAllByUserIdAndAccountId("u1", "main") }

        verify(exactly = 1) { inventoryCurrentRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { inventoryRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { inventoryDeletedRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { favoriteRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { operatorCurrentRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { operatorRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { operatorCorrectionRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { operatorV3ImportRecordRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { operatorScanReviewRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { annotationRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { targetRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { upgradeRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { resetRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { completionRepository.deleteAllByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { revisionRepository.deleteByUserIdAndAccountId("u1", "main") }
        verify(exactly = 1) { tokenService.revokeByAccount("u1", "main") }
        verify(exactly = 1) { accountRepository.deleteById("mongo-id") }
        verify(exactly = 1) { recruitmentRepository.deleteAccount("u1", "main") }
        verify(exactly = 1) { relationships.deleteAccount("u1", "main") }
        verify(exactly = 1) { milestoneRepository.deleteAccount("u1", "main") }
        verify(exactly = 1) { accountRepository.fenceRecruitmentWrite("u1", "main", "代号鸢") }
    }

    @Test
    fun `empty and multi-account queries preserve identity without any repository write`() {
        val scenario = com.lhs.share.fixtures.TestFixtures.multiAccountUser()
        every { accountRepository.findAllByUserIdOrderByCreatedAtAsc(scenario.user.id) } returns scenario.accounts
        every { accountRepository.findAllByUserIdOrderByCreatedAtAsc("empty-user") } returns emptyList()
        assertEquals(emptyList<Any>(), service.list("empty-user"))
        repeat(3) {
            assertEquals(scenario.accounts.map { it.accountId }, service.list(scenario.user.id).map { it.id })
        }
        verify(exactly = 1) { accountRepository.findAllByUserIdOrderByCreatedAtAsc("empty-user") }
        verify(exactly = 3) { accountRepository.findAllByUserIdOrderByCreatedAtAsc(scenario.user.id) }
        io.mockk.confirmVerified(accountRepository)
        io.mockk.verify { tokenService wasNot io.mockk.Called }
    }

    @Test
    fun `requiring an existing canonical account is a pure owner-scoped read`() {
        val account = com.lhs.share.fixtures.TestFixtures.account()
        every { accountRepository.findByUserIdAndAccountId(account.userId, account.accountId) } returns account
        repeat(3) { assertEquals(account, service.requireAccount(account.userId, account.accountId)) }
        verify(exactly = 3) { accountRepository.findByUserIdAndAccountId(account.userId, account.accountId) }
        io.mockk.confirmVerified(accountRepository)
    }

    @Test
    fun `foreign account deletion cannot begin cascade or revoke the real owners tokens`() {
        every { accountRepository.findByUserIdAndAccountId("intruder", "victim-account") } returns null
        val error = assertThrows(InventoryApiException::class.java) { service.delete("intruder", "victim-account") }
        assertEquals(HttpStatus.NOT_FOUND, error.status)
        verify(exactly = 1) { accountRepository.findByUserIdAndAccountId("intruder", "victim-account") }
        io.mockk.confirmVerified(accountRepository)
        io.mockk.verify { tokenService wasNot io.mockk.Called }
        verify(exactly = 0) { starStateRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { completionRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { inventoryCurrentRepository.deleteAllByUserIdAndAccountId(any(), any()) }
        verify(exactly = 0) { operatorCurrentRepository.deleteAllByUserIdAndAccountId(any(), any()) }
    }

    @Test
    fun `substantive recruitment history locks game but permits rename`() {
        val account = SubAccount(id = "mongo-id", userId = "u1", accountId = "main", name = "大号")
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns account
        every { recruitmentRepository.hasSubstantiveData("u1", "main") } returns true
        every { accountRepository.updateDetails("u1", "main", "改名", "代号鸢", any()) } just runs
        val error = assertThrows(InventoryApiException::class.java) { service.update("u1", "main", null, "如鸢") }
        assertEquals("recruitment_game_locked", error.code)
        assertEquals(409, error.status.value())
        assertEquals("改名", service.update("u1", "main", "改名", null).name)
        verify(exactly = 0) { accountRepository.updateDetails(any(), any(), any(), "如鸢", any()) }
        verify(exactly = 0) { recruitmentRepository.removeEmptyPreferences(any(), any()) }
    }

    @Test
    fun `panel preference defaults on supports false and unrelated changes preserve it`() {
        val account = SubAccount(userId = "u1", accountId = "main", name = "test")
        assertTrue(account.operatorPanelAutoFill)
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns account
        every { accountRepository.updateDetails("u1", "main", any(), "代号鸢", any()) } just runs
        every { accountRepository.updateOperatorPanelAutoFill("u1", "main", false) } just runs
        val saved = service.update("u1", "main", null, null, false)
        assertFalse(saved.operatorPanelAutoFill)
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns account.copy(operatorPanelAutoFill = false)
        assertFalse(service.update("u1", "main", "renamed", null).operatorPanelAutoFill)
        verify(exactly = 1) { accountRepository.updateOperatorPanelAutoFill("u1", "main", false) }
        verify(exactly = 0) { operatorCurrentRepository.save(any()) }
        verify(exactly = 0) { accountRepository.save(any()) }
    }

    @Test
    fun `foreign panel preference cannot write or fence another account`() {
        every { accountRepository.findByUserIdAndAccountId("intruder", "main") } returns null
        val error = assertThrows(InventoryApiException::class.java) { service.update("intruder", "main", null, null, false) }
        assertEquals(HttpStatus.NOT_FOUND, error.status)
        verify(exactly = 0) { accountRepository.updateOperatorPanelAutoFill(any(), any(), any()) }
        verify(exactly = 0) { accountRepository.fenceRecruitmentWrite(any(), any(), any()) }
        verify(exactly = 0) { accountRepository.updateDetails(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `preference-only game change clears empty recruitment state and lost fence rejects lifecycle`() {
        val account = SubAccount(id = "mongo-id", userId = "u1", accountId = "main", name = "大号")
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns account
        every { accountRepository.updateDetails("u1", "main", "大号", "如鸢", any()) } just runs
        assertEquals("如鸢", service.update("u1", "main", null, "如鸢").game)
        verify(exactly = 1) { recruitmentRepository.removeEmptyPreferences("u1", "main") }
        every { accountRepository.fenceRecruitmentWrite("u1", "main", "代号鸢") } returns false
        assertEquals("account_changed", assertThrows(InventoryApiException::class.java) { service.delete("u1", "main") }.code)
        verify(exactly = 0) { recruitmentRepository.deleteAccount(any(), any()) }
    }

    @Test
    fun `game switch preserves each games zhuyu preference`() {
        val account = SubAccount(
            userId = "u1",
            accountId = "main",
            name = "大号",
            dailyZhuyuPreference = "baijinbi",
            dailyZhuyuPreferencesByGame = mapOf("如鸢" to "zhuyu"),
        )
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns account
        every { accountRepository.updateDetails("u1", "main", "大号", "如鸢", any()) } just runs
        every { accountRepository.switchDailyZhuyuPreference(any(), any(), any(), any()) } just runs
        service.update("u1", "main", null, "如鸢")
        verify(exactly = 1) {
            accountRepository.switchDailyZhuyuPreference("u1", "main", mapOf("代号鸢" to "baijinbi", "如鸢" to "zhuyu"), "zhuyu")
        }
    }

    @Test
    fun `retained calendar subscription history locks game but allows renaming`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(userId = "u1", accountId = "main", name = "大号", game = "代号鸢")
        every { calendarSubscriptions.exists("u1", "main") } returns true
        every { accountRepository.updateDetails(any(), any(), any(), any(), any()) } just runs
        val error = assertThrows(InventoryApiException::class.java) { service.update("u1", "main", null, "如鸢") }
        assertEquals("activity_calendar_game_locked", error.code)
        verify(exactly = 0) { accountRepository.updateDetails(any(), any(), any(), any(), any()) }
        assertEquals("新名", service.update("u1", "main", "新名", null).name)
    }

    @Test
    fun `private calendar items lock game but allow rename`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(userId = "u1", accountId = "main", name = "大号", game = "代号鸢")
        every { calendarPrivateItems.exists("u1", "main") } returns true
        every { accountRepository.updateDetails(any(), any(), any(), any(), any()) } just runs
        val error = assertThrows(InventoryApiException::class.java) { service.update("u1", "main", null, "如鸢") }
        assertEquals("calendar_private_game_locked", error.code)
        verify(exactly = 0) { accountRepository.updateDetails(any(), any(), any(), any(), any()) }
        assertEquals("改名", service.update("u1", "main", "改名", null).name)
    }

    @Test
    fun `relationship facts prevent switching game`() {
        every { accountRepository.findByUserIdAndAccountId("u1", "main") } returns
            SubAccount(userId = "u1", accountId = "main", name = "test", game = "如鸢")
        every { relationships.hasSubstantiveData("u1", "main") } returns true
        val error = assertThrows(InventoryApiException::class.java) { service.update("u1", "main", null, "代号鸢") }
        assertEquals("operator_relationship_game_locked", error.code)
        verify(exactly = 0) { relationships.deleteAccount(any(), any()) }
    }
}
