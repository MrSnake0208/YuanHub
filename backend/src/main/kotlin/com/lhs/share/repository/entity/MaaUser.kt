package com.lhs.share.repository.entity

import com.fasterxml.jackson.annotation.JsonInclude
import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Transient
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * 用户主表实体(只读)
 *
 * 与 MaaYuan-Share-Backend 共用同一个 MongoDB 数据库,该集合由原项目负责写入,
 * 本模块只读消费用户数据。
 *
 * 注意:字段与索引注解必须与原项目一字不差(Spring Data 启动时会校验/创建索引,
 * 定义冲突会导致启动失败;email 唯一索引是数据安全的根基)。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@Document("maa_user")
data class MaaUser(
    @Id
    val userId: String? = null,
    @Indexed
    var userName: String,
    @Indexed(unique = true)
    val email: String,
    var password: String,
    var status: Int = 0,
    var pwdUpdateTime: Instant = Instant.MIN,
    var followingCount: Int = 0,
    var fansCount: Int = 0,
) : Serializable {

    companion object {
        @Transient
        val UNKNOWN: MaaUser = MaaUser(
            userId = "",
            userName = "未知用户:(",
            email = "unknown@unkown.unkown",
            password = "unknown",
        )
    }
}
