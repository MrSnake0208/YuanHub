package com.lhs.share.service

import cn.hutool.crypto.digest.DigestUtil
import org.springframework.core.io.ClassPathResource
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import org.springframework.stereotype.Service
import java.time.Duration
import java.util.concurrent.TimeUnit

@Service
class AuthAttempts(private val redis: StringRedisTemplate) {
    private val increment = RedisScript.of(ClassPathResource("redis-lua/accessLimitIncrementFixedWindow.lua"), Long::class.java)

    fun check(action: String, email: String) {
        val key = key(action, email)
        val count = checkNotNull(redis.execute(increment, listOf(key), "120"))
        if (count > 16) throw AuthRateLimit(redis.getExpire(key, TimeUnit.SECONDS).coerceAtLeast(1))
    }

    fun clearLogin(email: String) {
        redis.delete(key("login", email))
    }

    fun reserveDelivery(email: String, purpose: EmailCodePurpose): Boolean =
        redis.opsForValue().setIfAbsent(key("delivery:${purpose.name}", email), "1", Duration.ofSeconds(60)) == true

    private fun key(action: String, email: String) = "auth-attempt:$action:${DigestUtil.sha256Hex(email.trim().lowercase())}"
}

class AuthRateLimit(val seconds: Long) : RuntimeException("尝试次数较多，请在 $seconds 秒后重试")
