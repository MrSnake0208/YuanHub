package com.lhs.share.hub.controller.account.response

import com.lhs.share.hub.repository.entity.SubAccount
import io.swagger.v3.oas.annotations.media.Schema
import java.time.Instant

/**
 * 统一子账号响应(id = accountId，game 是库存与密探共用的账号级权威版本)
 */
data class SubAccountResponse(
    val id: String,
    val name: String,
    @field:Schema(description = "账号级权威游戏版本", allowableValues = ["代号鸢", "如鸢"])
    val game: String,
    val createdAt: Instant,
    val updatedAt: Instant,
    val operatorPanelAutoFill: Boolean = true,
) {
    companion object {
        fun of(account: SubAccount) = SubAccountResponse(
            id = account.accountId,
            name = account.name,
            game = account.game,
            createdAt = account.createdAt,
            updatedAt = account.updatedAt,
            operatorPanelAutoFill = account.operatorPanelAutoFill,
        )
    }
}
