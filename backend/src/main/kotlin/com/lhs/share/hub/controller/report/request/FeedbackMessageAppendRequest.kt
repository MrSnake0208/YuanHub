package com.lhs.share.hub.controller.report.request

import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 追加反馈消息请求
 *
 * @property content 消息正文(1..1000 字符)
 * @property mediaIds 关联媒体 id 列表(最多 10 个)
 * @property actorMode 本次操作身份意图: REPORTER / ADMIN；兼容期允许缺省
 */
data class FeedbackMessageAppendRequest(
    @field:NotBlank(message = "消息不能为空")
    @field:Size(max = 1000, message = "消息长度不能超过 1000 字符")
    val content: String,
    @field:Size(max = 10, message = "附件数量不能超过 10 个")
    val mediaIds: List<String> = emptyList(),
    @field:Schema(
        description = "操作身份意图。REPORTER 要求当前用户为提交人，ADMIN 要求当前用户有板块管理权限；缺省仅在身份唯一时兼容推断",
        allowableValues = ["REPORTER", "ADMIN"],
    )
    val actorMode: String? = null,
)
