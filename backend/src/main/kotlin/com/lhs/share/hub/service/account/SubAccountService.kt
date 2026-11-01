package com.lhs.share.hub.service.account

import com.lhs.share.hub.controller.account.response.SubAccountResponse
import com.lhs.share.hub.repository.AchievementRepository
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
import com.lhs.share.hub.repository.OperatorReserveWorkspaceRepository
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
import com.lhs.share.hub.service.achievement.AchievementImportPreviews
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.hub.service.recruitment.RecruitmentService
import com.lhs.share.openapi.OpenApiTokenService
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

/**
 * 统一子账号服务(库存 × 密探共用)
 *
 * 一个子账号 = 用户的某个游戏登录账号。删除 = 整账号级联:库存 current/records、
 * 密探 current/records、特别关注、全部绑定的 token 一起删除。
 */
@Service
class SubAccountService(
    private val accountRepository: SubAccountRepository,
    private val inventoryCurrentRepository: InventoryCurrentRepository,
    private val inventoryRecordRepository: InventoryRecordRepository,
    private val inventoryDeletedRecordRepository: InventoryDeletedRecordRepository,
    private val favoriteRepository: InventoryAgentFavoriteRepository,
    private val operatorCurrentRepository: OperatorCurrentRepository,
    private val operatorRecordRepository: OperatorRecordRepository,
    private val operatorCorrectionRecordRepository: OperatorCorrectionRecordRepository,
    private val operatorV3ImportRecordRepository: OperatorV3ImportRecordRepository,
    private val operatorScanReviewRepository: OperatorScanReviewRepository,
    private val tokenService: OpenApiTokenService,
    @param:Qualifier("hubTransactionTemplate") private val transactionTemplate: TransactionTemplate,
    private val operatorAnnotationRepository: OperatorAnnotationRepository? = null,
    private val operatorGrowthTargetRepository: OperatorGrowthTargetRepository? = null,
    private val operatorUpgradeTransactionRepository: OperatorUpgradeTransactionRepository? = null,
    private val inventoryRevisionRepository: InventoryRevisionRepository? = null,
    private val trainingWorkspaceRepository: OperatorTrainingWorkspaceRepository? = null,
    private val staminaScheduleRepository: OperatorStaminaScheduleRepository? = null,
    private val plannerImportRepository: OperatorPlannerImportRepository? = null,
    private val starLoadoutCurrentRepository: StarLoadoutCurrentRepository? = null,
    private val starStateCurrentRepository: StarStateCurrentRepository? = null,
    private val starRecoveryPointRepository: StarRecoveryPointRepository? = null,
    private val recruitmentRepository: RecruitmentRepository? = null,
    private val accountEvents: AccountEventService? = null,
    private val calendarSubscriptions: ActivityCalendarSubscriptionRepository? = null,
    private val calendarPrivateItems: CalendarPrivateItemRepository? = null,
    private val starCompletionRepository: StarCompletionRepository? = null,
    private val operatorOrganizationRepository: OperatorOrganizationRepository? = null,
    private val operatorDailyTasksRepository: OperatorDailyTasksRepository? = null,
    private val operatorMilestoneRepository: OperatorMilestoneRepository? = null,
    private val achievements: AchievementRepository? = null,
    private val achievementPreviews: AchievementImportPreviews? = null,
    private val operatorRelationships: OperatorRelationshipRepository? = null,
    private val bonds: com.lhs.share.hub.repository.BondRepository? = null,
    private val bondPreviews: com.lhs.share.hub.service.bond.BondImportPreviews? = null,
    private val starScanRecords: StarScanRecordRepository? = null,
    private val reserveWorkspaces: OperatorReserveWorkspaceRepository? = null,
    private val mailboxHistory: com.lhs.share.hub.repository.MailboxReserveHistoryRepository? = null,
    private val operatorResets: com.lhs.share.hub.repository.OperatorResetTransactionRepository? = null,
    private val mailboxDeliveries: com.lhs.share.hub.repository.MailboxDeliveryRepository? = null,
) {
    fun create(userId: String, name: String, game: String? = null): SubAccountResponse {
        val normalizedGame = normalizeGame(game ?: DEFAULT_GAME)
        if (accountRepository.countByUserId(userId) >= MAX_ACCOUNTS_PER_USER) {
            throw InventoryApiException(
                HttpStatus.CONFLICT,
                "account_limit_reached",
                "Account limit reached (maximum $MAX_ACCOUNTS_PER_USER)",
            )
        }
        val now = Instant.now()
        return try {
            SubAccountResponse.of(
                accountRepository.save(
                    SubAccount(
                        userId = userId,
                        accountId = "acc_${UUID.randomUUID().toString().replace("-", "")}",
                        name = name,
                        game = normalizedGame,
                        createdAt = now,
                        updatedAt = now,
                    ),
                ),
            )
        } catch (e: DuplicateKeyException) {
            throw nameConflict()
        }
    }

    fun list(userId: String): List<SubAccountResponse> =
        accountRepository.findAllByUserIdOrderByCreatedAtAsc(userId).map(SubAccountResponse::of)

    fun dailyZhuyuPreference(userId: String, accountId: String): Map<String, String?> {
        val account = requireAccount(userId, accountId)
        return mapOf("account_id" to account.accountId, "game" to account.game, "preference" to account.dailyZhuyuPreference)
    }

    fun saveDailyZhuyuPreference(userId: String, accountId: String, game: String, expected: String?, value: String): Map<String, String?> {
        if (game !in SUPPORTED_GAMES || value !in setOf("zhuyu", "baijinbi") || expected !in setOf(null, "zhuyu", "baijinbi")) {
            throw InventoryApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "茱萸记账设置无效")
        }
        requireAccount(userId, accountId)
        val account = accountRepository.updateDailyZhuyuPreference(userId, accountId, game, expected, value)
            ?: throw InventoryApiException(HttpStatus.CONFLICT, "preference_conflict", "设置已变更，请重新读取")
        return mapOf("account_id" to account.accountId, "game" to account.game, "preference" to account.dailyZhuyuPreference)
    }

    fun update(
        userId: String,
        accountId: String,
        name: String?,
        game: String?,
        operatorPanelAutoFill: Boolean? = null,
    ): SubAccountResponse {
        if (name == null && game == null && operatorPanelAutoFill == null) {
            throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                "name、game 或 operator_panel_auto_fill 至少提供一项",
            )
        }
        return try {
            checkNotNull(
                transactionTemplate.execute {
                    val account = requireAccount(userId, accountId)
                    val nextGame = game?.let(::normalizeGame) ?: account.game
                    fenceAccount(account)
                    if (nextGame != account.game) {
                        if (operatorRelationships?.hasSubstantiveData(userId, accountId) == true) {
                            throw InventoryApiException(HttpStatus.CONFLICT, "operator_relationship_game_locked", "已有信赖与传闻记录，不能修改所属游戏")
                        }
                        operatorRelationships?.deleteAccount(userId, accountId)
                        if (bonds?.hasSubstantiveData(userId, accountId) == true) {
                            throw InventoryApiException(HttpStatus.CONFLICT, "bond_game_locked", "已有羁绊档案，不能修改所属游戏；请使用另一个游戏账号")
                        }
                        if (achievements?.hasSubstantiveData(userId, accountId) == true) {
                            throw InventoryApiException(HttpStatus.CONFLICT, "achievement_game_locked", "已有成就档案，不能修改所属游戏；请使用另一个游戏账号")
                        }
                        if (calendarPrivateItems?.exists(userId, accountId) == true) {
                            throw InventoryApiException(HttpStatus.CONFLICT, "calendar_private_game_locked", "已有私人日历事项，不能修改所属游戏；请使用另一个游戏账号")
                        }
                        if (calendarSubscriptions?.exists(userId, accountId) == true) {
                            throw InventoryApiException(
                                HttpStatus.CONFLICT,
                                "activity_calendar_game_locked",
                                "已有活动订阅历史，不能修改所属游戏；请使用另一个游戏账号",
                            )
                        }
                        if (recruitmentRepository?.hasSubstantiveData(userId, accountId) == true) {
                            throw InventoryApiException(HttpStatus.CONFLICT, "recruitment_game_locked", "已有招募档案，不能修改所属游戏；请使用另一个游戏账号")
                        }
                        recruitmentRepository?.removeEmptyPreferences(userId, accountId)
                        achievements?.deleteAccount(userId, accountId)
                        achievementPreviews?.deleteAccount(userId, accountId)
                        bonds?.deleteAccount(userId, accountId)
                        bondPreviews?.deleteAccount(userId, accountId)
                        if (account.dailyZhuyuPreference != null || account.dailyZhuyuPreferencesByGame.isNotEmpty()) {
                            val preferences = account.dailyZhuyuPreferencesByGame.toMutableMap()
                            account.dailyZhuyuPreference?.let { preferences[account.game] = it }
                            accountRepository.switchDailyZhuyuPreference(userId, accountId, preferences, preferences[nextGame])
                        }
                    }
                    val now = Instant.now()
                    accountRepository.updateDetails(userId, accountId, name ?: account.name, nextGame, now)
                    if (operatorPanelAutoFill != null) {
                        accountRepository.updateOperatorPanelAutoFill(userId, accountId, operatorPanelAutoFill)
                    }
                    accountEvents?.publishChange(userId, accountId, "account_updated", mapOf("game" to nextGame))
                    SubAccountResponse.of(
                        account.copy(
                            name = name ?: account.name,
                            game = nextGame,
                            updatedAt = now,
                            operatorPanelAutoFill = operatorPanelAutoFill ?: account.operatorPanelAutoFill,
                        ),
                    )
                },
            )
        } catch (e: DuplicateKeyException) {
            throw nameConflict()
        } catch (e: RuntimeException) {
            if (RecruitmentService.isWriteConflict(e)) throw accountConflict()
            throw e
        }
    }

    private fun normalizeGame(game: String): String {
        if (game !in SUPPORTED_GAMES) {
            throw InventoryApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid_game",
                "game 只允许 代号鸢 或 如鸢",
            )
        }
        return game
    }

    fun delete(userId: String, accountId: String) {
        try {
            transactionTemplate.executeWithoutResult {
                val account = requireAccount(userId, accountId)
                fenceAccount(account)
                mailboxHistory?.deleteAllByUserIdAndAccountId(userId, accountId)
                mailboxDeliveries?.deleteAllByUserIdAndAccountId(userId, accountId)
                inventoryCurrentRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                inventoryRecordRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                inventoryDeletedRecordRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                favoriteRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorCurrentRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorRecordRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorCorrectionRecordRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorV3ImportRecordRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorScanReviewRepository.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorAnnotationRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorGrowthTargetRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorUpgradeTransactionRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorResets?.deleteAllByUserIdAndAccountId(userId, accountId)
                starCompletionRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                starScanRecords?.deleteByUserIdAndAccountId(userId, accountId)
                inventoryRevisionRepository?.deleteByUserIdAndAccountId(userId, accountId)
                trainingWorkspaceRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                reserveWorkspaces?.deleteAllByUserIdAndAccountId(userId, accountId)
                staminaScheduleRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorDailyTasksRepository?.deleteAccount(userId, accountId)
                operatorMilestoneRepository?.deleteAccount(userId, accountId)
                operatorRelationships?.deleteAccount(userId, accountId)
                plannerImportRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                operatorOrganizationRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                starLoadoutCurrentRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                starStateCurrentRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                starRecoveryPointRepository?.deleteAllByUserIdAndAccountId(userId, accountId)
                recruitmentRepository?.deleteAccount(userId, accountId)
                calendarSubscriptions?.deleteAccount(userId, accountId)
                calendarPrivateItems?.deleteAccount(userId, accountId)
                achievements?.deleteAccount(userId, accountId)
                achievementPreviews?.deleteAccount(userId, accountId)
                bonds?.deleteAccount(userId, accountId)
                bondPreviews?.deleteAccount(userId, accountId)
                tokenService.revokeByAccount(userId, accountId)
                accountRepository.deleteById(checkNotNull(account.id))
                accountEvents?.publishChange(userId, accountId, "account_deleted")
            }
        } catch (e: RuntimeException) {
            if (RecruitmentService.isWriteConflict(e)) throw accountConflict()
            throw e
        }
    }

    private fun fenceAccount(account: SubAccount) {
        if (!accountRepository.fenceRecruitmentWrite(account.userId, account.accountId, account.game)) throw accountConflict()
    }

    private fun accountConflict() = InventoryApiException(HttpStatus.CONFLICT, "account_changed", "账号正在被修改，请刷新后重试")

    fun requireAccount(userId: String, accountId: String): SubAccount = accountRepository.findByUserIdAndAccountId(userId, accountId)
        ?: throw InventoryApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")

    private fun nameConflict() = InventoryApiException(
        HttpStatus.CONFLICT,
        "account_name_conflict",
        "An account with this name already exists",
    )

    companion object {
        const val MAX_ACCOUNTS_PER_USER = 10
        const val DEFAULT_GAME = "代号鸢"
        val SUPPORTED_GAMES = setOf(DEFAULT_GAME, "如鸢")
    }
}
