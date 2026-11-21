package com.lhs.share.service

import cn.hutool.crypto.digest.DigestUtil
import org.springframework.core.io.ClassPathResource
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import org.springframework.stereotype.Component
import java.time.Duration

enum class EmailCodePurpose { REGISTER, RESET_PASSWORD }

@Component
class EmailCodes(private val redis: StringRedisTemplate) {
    private val consume = RedisScript.of(ClassPathResource("redis-lua/consumeEmailCode.lua"), Long::class.java)

    fun issue(email: String, purpose: EmailCodePurpose, code: String, ttl: Long) {
        redis.opsForValue().set(key(email, purpose), "5:$code", Duration.ofSeconds(ttl))
    }

    fun verify(email: String, purpose: EmailCodePurpose, code: String): Boolean =
        redis.execute(consume, listOf(key(email, purpose)), code.uppercase()) == 1L

    // Login uses exact email spelling. Distinct stored accounts must never share a recovery code.
    private fun key(email: String, purpose: EmailCodePurpose) = "email-code:${purpose.name}:${DigestUtil.sha256Hex(email)}"
}
