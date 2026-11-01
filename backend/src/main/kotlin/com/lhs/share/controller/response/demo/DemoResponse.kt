package com.lhs.share.controller.response.demo

import java.time.Instant

/**
 * 示例响应,演示 response 层写法,接入真实业务后可删除
 */
data class DemoResponse(
    val id: String,
    val name: String,
    val description: String?,
    val createdAt: Instant,
)
