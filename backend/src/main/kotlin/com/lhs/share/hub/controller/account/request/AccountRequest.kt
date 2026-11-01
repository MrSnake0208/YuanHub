package com.lhs.share.hub.controller.account.request

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

data class AccountCreateRequest(
    @field:NotBlank(message = "name 不能为空")
    @field:Size(min = 1, max = 64, message = "name 长度须在 1..64")
    val name: String,
    @field:Schema(
        description = "账号游戏版本；缺省保存为代号鸢",
        allowableValues = ["代号鸢", "如鸢"],
        defaultValue = "代号鸢",
    )
    val game: String? = null,
)

data class AccountPatchRequest(
    @field:Size(min = 1, max = 64, message = "name 长度须在 1..64")
    @field:Pattern(regexp = ".*\\S.*", message = "name 不能为空")
    val name: String? = null,
    @field:Schema(description = "账号游戏版本", allowableValues = ["代号鸢", "如鸢"])
    val game: String? = null,
    @field:Schema(description = "自动补全未填写的密探面板；默认开启，已有手填/采集值优先，缺失或null保留设置")
    val operatorPanelAutoFill: Boolean? = null,
)
