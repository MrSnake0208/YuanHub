package com.lhs.share.repository

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.io.ClassPathResource
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import org.springframework.stereotype.Component
import java.util.concurrent.TimeUnit

private val log = KotlinLogging.logger { }

/**
 * Redis 缓存工具类
 *
 * 提供 JSON 序列化的 set/get、set-if-absent 原子写入,
 * 以及基于 Lua 脚本的"值相等才删除"原子操作(用于验证码等一次性凭证校验)
 */
@Component
class RedisCache(
    @Value("\${share.cache.default-expire}") private val defaultExpire: Long,
    private val redisTemplate: StringRedisTemplate,
) {
    // 添加 JSR310 模块,以便顺利序列化 LocalDateTime 等类型
    private val writeMapper: ObjectMapper = jacksonObjectMapper()
        .registerModules(JavaTimeModule())
    private val readMapper: ObjectMapper = jacksonObjectMapper()
        .registerModules(JavaTimeModule())
        .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    // 比较与输入的键值对是否相同,相同则删除
    private val removeKVIfEqualsScript: RedisScript<Boolean> = RedisScript.of(
        ClassPathResource("redis-lua/removeKVIfEquals.lua"),
        Boolean::class.java,
    )

    /**
     * 写入缓存,使用默认过期时间
     */
    fun <T> setCache(key: String, value: T) {
        setCache(key, value, defaultExpire, TimeUnit.SECONDS)
    }

    /**
     * 写入缓存,指定过期时间(秒)
     */
    fun <T> setCache(key: String, value: T, timeout: Long) {
        setCache(key, value, timeout, TimeUnit.SECONDS)
    }

    /**
     * 写入缓存,指定过期时间和单位
     */
    fun <T> setCache(key: String, value: T, timeout: Long, timeUnit: TimeUnit) {
        val json = getJson(value) ?: return
        if (timeout <= 0) {
            redisTemplate.opsForValue()[key] = json
        } else {
            redisTemplate.opsForValue()[key, json, timeout] = timeUnit
        }
    }

    /**
     * 当缓存不存在时写入,返回是否写入成功(用于间隔限制)
     */
    fun <T> setCacheIfAbsent(key: String, value: T): Boolean {
        return setCacheIfAbsent(key, value, defaultExpire)
    }

    /**
     * 当缓存不存在时写入,指定过期时间(秒)
     */
    fun <T> setCacheIfAbsent(key: String, value: T, timeout: Long): Boolean {
        return setCacheIfAbsent(key, value, timeout, TimeUnit.SECONDS)
    }

    /**
     * 当缓存不存在时写入,指定过期时间和单位
     */
    fun <T> setCacheIfAbsent(key: String, value: T, timeout: Long, timeUnit: TimeUnit): Boolean {
        val json = getJson(value) ?: return false
        return if (timeout <= 0) {
            java.lang.Boolean.TRUE == redisTemplate.opsForValue().setIfAbsent(key, json)
        } else {
            java.lang.Boolean.TRUE == redisTemplate.opsForValue().setIfAbsent(key, json, timeout, timeUnit)
        }
    }

    /**
     * 读取缓存,按类型反序列化
     */
    fun <T> getCache(key: String, valueType: Class<T>): T? {
        val json = redisTemplate.opsForValue()[key] ?: return null
        return try {
            readMapper.readValue(json, valueType)
        } catch (e: Exception) {
            log.error(e) { "读取缓存失败, key: $key" }
            null
        }
    }

    /**
     * 删除缓存
     */
    fun delete(key: String) {
        redisTemplate.delete(key)
    }

    /**
     * 校验缓存值:若与期望值相同则删除并返回 true,否则返回 false
     *
     * 用于验证码等一次性凭证:校验通过即消耗,防止重放
     */
    fun removeKVIfEquals(key: String, value: String): Boolean {
        // 与 setCache 对称:value 先 JSON 序列化,保证与存储格式一致
        val json = getJson(value) ?: return false
        return try {
            java.lang.Boolean.TRUE == redisTemplate.execute(
                removeKVIfEqualsScript,
                listOf(key),
                json,
            )
        } catch (e: Exception) {
            log.error(e) { "removeKVIfEquals 执行失败, key: $key" }
            false
        }
    }

    private fun <T> getJson(value: T): String? {
        return try {
            writeMapper.writeValueAsString(value)
        } catch (e: Exception) {
            log.error(e) { "序列化失败" }
            null
        }
    }
}
