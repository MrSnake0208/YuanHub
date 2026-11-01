package com.lhs.share.config.accesslimit

import java.lang.annotation.Inherited

/**
 * 接口访问频率限制(基于 Redis 计数)
 *
 * 标注在 Controller 方法上,限制同一 IP 在指定时间内对该接口的访问次数
 */
@Inherited
@MustBeDocumented
@Target(
    AnnotationTarget.FIELD,
    AnnotationTarget.CLASS,
    AnnotationTarget.FUNCTION,
    AnnotationTarget.PROPERTY_GETTER,
    AnnotationTarget.PROPERTY_SETTER,
)
@Retention(
    AnnotationRetention.RUNTIME,
)
annotation class AccessLimit(
    /**
     * 指定 [second] 时间内,API 最多的请求次数
     */
    val times: Int = 30,
    /**
     * 限流时间窗口,单位秒,同时也是 redis 数据过期时间
     */
    val second: Int = 10,
)
