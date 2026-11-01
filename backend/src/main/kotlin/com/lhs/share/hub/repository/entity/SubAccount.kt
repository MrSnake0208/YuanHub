package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.CompoundIndexes
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

/**
 * 统一子账号(HubBackend.sub_accounts)
 *
 * 库存、密探、特别关注共用这一张账号表:一个子账号 = 用户的某个游戏登录账号,
 * 库存数据与密探养成数据挂在同一个 accountId 下。OpenAPI token 绑定该 accountId,
 * 可访问的域(库存还是密探)由 token 的 scope 决定,不再按账号分域。
 */
@Document("sub_accounts")
@CompoundIndexes(
    CompoundIndex(name = "idx_sub_user_account_unique", def = "{'userId': 1, 'accountId': 1}", unique = true),
    CompoundIndex(name = "idx_sub_user_account_name_unique", def = "{'userId': 1, 'name': 1}", unique = true),
)
data class SubAccount(
    @Id
    val id: String? = null,
    val userId: String,
    val accountId: String,
    val name: String,
    val game: String = "代号鸢",
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
    @Indexed(name = "idx_sub_share_token_unique", unique = true, sparse = true)
    val shareToken: String? = null,
    /** Missing scopes on a legacy token mean operator-only; an explicit empty list grants nothing. */
    val shareScopes: List<String>? = null,
    // A write fence shared by recruitment mutations and account lifecycle transactions.
    val recruitmentFence: Long = 0,
    val operatorPanelAutoFill: Boolean = true,
    val dailyZhuyuPreference: String? = null,
    val dailyZhuyuPreferencesByGame: Map<String, String> = emptyMap(),
    val mailboxReserve: MailboxReserve? = null,
)

fun SubAccount.effectiveShareScopes(): List<String> = if (shareToken.isNullOrBlank()) {
    emptyList()
} else {
    (shareScopes ?: listOf("operator"))
        .filter { it in setOf("operator", "star") || (it == "operator_tags" && shareScopes?.contains("operator") == true) }
        .distinct().sorted()
}
