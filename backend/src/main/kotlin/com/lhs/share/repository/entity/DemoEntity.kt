package com.lhs.share.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * 示例实体,演示 repository 层写法,接入真实业务后可删除
 *
 * 对应 MongoDB 集合 demo
 */
@Document("demo")
data class DemoEntity(
    @Id
    val id: String? = null,
    var name: String,
    var description: String? = null,
    val createdAt: Instant = Instant.now(),
) : Serializable
