package com.lhs.share.controller.request.demo

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

/**
 * 示例创建请求,演示 request 层写法,接入真实业务后可删除
 */
data class DemoCreateRequest(
    @field:NotBlank(message = "name 不能为空")
    @field:Size(max = 50, message = "name 最长 50 个字符")
    val name: String,
    @field:Size(max = 200, message = "description 最长 200 个字符")
    val description: String? = null,
)
