package com.lhs.share.hub.controller.request

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 发布帖子请求(Hub 库示例业务)
 */
data class HubPostCreateRequest(
    @field:NotBlank(message = "标题不能为空")
    @field:Size(max = 100, message = "标题最长 100 个字符")
    val title: String,
    @field:NotBlank(message = "内容不能为空")
    @field:Size(max = 5000, message = "内容最长 5000 个字符")
    val content: String,
)
