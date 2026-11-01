package com.lhs.share.fixtures

import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import com.lhs.share.hub.repository.entity.BetaEnrollment
import com.lhs.share.hub.repository.entity.BetaEnrollmentStatus
import com.lhs.share.hub.repository.entity.BetaSlotPool
import com.lhs.share.hub.repository.entity.BetaSnapshotEntry
import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import com.lhs.share.hub.repository.entity.SubAccount
import org.bson.Document
import java.time.Instant
import java.util.Date

/** Fresh values on every call. All IDs/email domains are synthetic, never copied from a live user. */
object TestFixtures {
    val instant: Instant = Instant.parse("2026-09-19T10:00:00Z")
    const val USER_A = "yuanhub_test_user_a"
    const val USER_B = "yuanhub_test_user_b"

    fun user(id: String = USER_A, activated: Boolean = true) = MaaUserInfo(id, "tester", activated = activated)

    fun account(userId: String = USER_A, accountId: String = "acc_test_a", name: String = "大号", game: String = "如鸢") = SubAccount(
        id = "mongo_$accountId",
        userId = userId,
        accountId = accountId,
        name = name,
        game = game,
        createdAt = instant,
        updatedAt = instant,
    )

    data class UserScenario(val user: MaaUserInfo, val accounts: List<SubAccount>, val roleBinding: AdminRoleBinding? = null)

    fun emptyUser() = UserScenario(user(), emptyList())
    fun multiAccountUser() = UserScenario(user(), listOf(account(), account(accountId = "acc_test_b", name = "小号", game = "代号鸢")))
    fun admin(superAdmin: Boolean = false): UserScenario {
        val binding = AdminRoleBinding(
            USER_A,
            setOf(if (superAdmin) AdminRole.SUPER_ADMIN else AdminRole.PLATFORM_ADMIN),
            "test-admin",
            instant,
            "test-admin",
            instant,
        )
        return UserScenario(user(), emptyList(), binding)
    }

    fun betaUser(userId: String = USER_A, shareEligible: Boolean = false) = BetaEnrollment(
        campaignId = "yuanhub_test_beta", userId = userId, status = BetaEnrollmentStatus.ACTIVE,
        shareSnapshotEligible = shareEligible, snapshotId = if (shareEligible) "test-share-snapshot" else null,
        queueSequence = 1, joinedAt = instant, grantedAt = instant,
        slotPool = if (shareEligible) BetaSlotPool.SHARE_RESERVED else BetaSlotPool.PUBLIC,
        grantTrigger = "test", acceptedRulesVersion = "v1",
    )

    fun shareSnapshot(userId: String = USER_A) = BetaSnapshotEntry(
        campaignId = "yuanhub_test_beta",
        snapshotId = "test-share-snapshot",
        userId = userId,
        capturedAt = instant,
    )

    fun operator(id: String = "char_test", prof: String = "火", subProf: String = "pojun") = OperatorCatalogEntity(
        operatorId = id, name = "测试密探", rarity = 5, prof = listOf(prof), subProf = listOf(subProf),
        games = listOf("如鸢", "代号鸢"), discs = emptyList(), starStones = emptyList(), catalogVersion = "test-v1", createdAt = instant,
    )

    fun inventoryRecord(userId: String = USER_A, accountId: String = "acc_test_a", recordId: String = "test-record-1", count: Long = 12) =
        Document(
            mapOf(
                "userId" to userId,
                "accountId" to accountId,
                "recordId" to recordId,
                "recordType" to "reward_delta",
                "entityType" to "item",
                "effectiveAt" to Date.from(instant),
                "entries" to listOf(Document(mapOf("id" to "baijinbi", "count" to count))),
            ),
        )

    fun starSnapshot(accountId: String = "acc_test_a", revision: Long = 0) = Document(
        mapOf(
            "schemaVersion" to 1,
            "accountId" to accountId,
            "gameVersion" to "如鸢",
            "revision" to revision,
            "inventory" to emptyList<Any>(),
            "loadouts" to emptyMap<String, Any>(),
            "planTargets" to emptyMap<String, Any>(),
        ),
    )
}
