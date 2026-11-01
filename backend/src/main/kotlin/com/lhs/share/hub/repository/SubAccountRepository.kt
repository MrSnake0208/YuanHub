package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.MailboxReserve
import com.lhs.share.hub.repository.entity.SubAccount
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.data.mongodb.repository.MongoRepository
import java.time.Instant

/**
 * 统一子账号仓储(HubBackend.sub_accounts)
 *
 * 由 HubMongoConfig 路由到 hubMongoTemplate。铁律:本接口必须位于
 * com.lhs.share.hub.repository 顶层包,否则不被扫描而落入主库(MaaBackend)。
 */
interface SubAccountRepository : MongoRepository<SubAccount, String>, SubAccountRepositoryCustom {
    fun countByUserId(userId: String): Long

    fun findByUserIdAndAccountId(userId: String, accountId: String): SubAccount?

    fun findByShareToken(shareToken: String): SubAccount?

    fun findAllByUserIdOrderByCreatedAtAsc(userId: String): List<SubAccount>

    fun findAllByUserIdAndAccountIdIn(userId: String, accountIds: Collection<String>): List<SubAccount>
}

interface SubAccountRepositoryCustom {
    fun replaceMailboxReserve(userId: String, accountId: String, expected: Long, reserve: MailboxReserve): SubAccount?
    fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean
    fun updateDetails(userId: String, accountId: String, name: String, game: String, now: Instant)
    fun updateOperatorPanelAutoFill(userId: String, accountId: String, enabled: Boolean)
    fun updateDailyZhuyuPreference(userId: String, accountId: String, game: String, expected: String?, value: String): SubAccount?
    fun switchDailyZhuyuPreference(userId: String, accountId: String, preferences: Map<String, String>, current: String?)
    fun updateShareToken(userId: String, accountId: String, expectedToken: String?, newToken: String?, now: Instant): SubAccount?
    fun updateShareAuthorization(
        userId: String,
        accountId: String,
        expectedToken: String?,
        expectedScopes: List<String>?,
        newToken: String?,
        newScopes: List<String>,
        now: Instant,
    ): SubAccount?
}

class SubAccountRepositoryImpl(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) : SubAccountRepositoryCustom {
    override fun switchDailyZhuyuPreference(userId: String, accountId: String, preferences: Map<String, String>, current: String?) {
        template.updateFirst(
            owner(userId, accountId),
            Update().set("dailyZhuyuPreferencesByGame", preferences).set("dailyZhuyuPreference", current),
            SubAccount::class.java,
        )
    }

    override fun updateDailyZhuyuPreference(
        userId: String,
        accountId: String,
        game: String,
        expected: String?,
        value: String,
    ): SubAccount? = template.findAndModify(
        owner(userId, accountId).addCriteria(Criteria.where("dailyZhuyuPreference").`is`(expected)).addCriteria(
            if (game == "代号鸢") {
                Criteria().orOperator(Criteria.where("game").`is`(game), Criteria.where("game").`is`(null))
            } else {
                Criteria.where("game").`is`(game)
            },
        ),
        Update().set("dailyZhuyuPreference", value),
        FindAndModifyOptions.options().returnNew(true),
        SubAccount::class.java,
    )
    override fun replaceMailboxReserve(userId: String, accountId: String, expected: Long, reserve: MailboxReserve): SubAccount? {
        val version = if (expected == 0L) {
            Criteria().orOperator(Criteria.where("mailboxReserve").`is`(null), Criteria.where("mailboxReserve.version").`is`(0L))
        } else {
            Criteria.where("mailboxReserve.version").`is`(expected)
        }
        return template.findAndModify(
            owner(userId, accountId).addCriteria(version),
            Update().set("mailboxReserve", reserve),
            FindAndModifyOptions.options().returnNew(true),
            SubAccount::class.java,
        )
    }

    override fun updateOperatorPanelAutoFill(userId: String, accountId: String, enabled: Boolean) {
        template.updateFirst(owner(userId, accountId), Update().set("operatorPanelAutoFill", enabled), SubAccount::class.java)
    }

    override fun fenceRecruitmentWrite(userId: String, accountId: String, expectedGame: String): Boolean = template.updateFirst(
        owner(userId, accountId).addCriteria(
            if (expectedGame ==
                "代号鸢"
            ) {
                Criteria().orOperator(Criteria.where("game").`is`(expectedGame), Criteria.where("game").`is`(null))
            } else {
                Criteria.where("game").`is`(expectedGame)
            },
        ),
        Update().inc("recruitmentFence", 1),
        SubAccount::class.java,
    ).matchedCount == 1L

    override fun updateDetails(userId: String, accountId: String, name: String, game: String, now: Instant) {
        template.updateFirst(
            owner(userId, accountId),
            Update().set("name", name).set("game", game).set("updatedAt", now),
            SubAccount::class.java,
        )
    }

    override fun updateShareToken(userId: String, accountId: String, expectedToken: String?, newToken: String?, now: Instant): SubAccount? {
        val update = Update().set("updatedAt", now)
        if (newToken == null) update.unset("shareToken") else update.set("shareToken", newToken)
        return template.findAndModify(
            owner(userId, accountId).addCriteria(Criteria.where("shareToken").`is`(expectedToken)),
            update,
            FindAndModifyOptions.options().returnNew(true),
            SubAccount::class.java,
        )
    }

    override fun updateShareAuthorization(
        userId: String,
        accountId: String,
        expectedToken: String?,
        expectedScopes: List<String>?,
        newToken: String?,
        newScopes: List<String>,
        now: Instant,
    ): SubAccount? {
        val update = Update().set("updatedAt", now).set("shareScopes", newScopes)
        if (newToken == null) update.unset("shareToken") else update.set("shareToken", newToken)
        return template.findAndModify(
            owner(userId, accountId)
                .addCriteria(Criteria.where("shareToken").`is`(expectedToken))
                .addCriteria(Criteria.where("shareScopes").`is`(expectedScopes)),
            update,
            FindAndModifyOptions.options().returnNew(true),
            SubAccount::class.java,
        )
    }

    private fun owner(userId: String, accountId: String) =
        Query.query(Criteria.where("userId").`is`(userId).and("accountId").`is`(accountId))
}
