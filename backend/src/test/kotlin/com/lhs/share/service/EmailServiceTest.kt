package com.lhs.share.service

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.repository.RedisCache
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class EmailServiceTest {
    private val properties = ShareProperties().apply {
        vcode.expire = 600
    }
    private val redisCache = mockk<RedisCache>()

    // flagNoSend = true:不真实发邮件,验证码打印日志
    private val emailService = EmailService(properties, redisCache, flagNoSend = true)

    @Test
    fun `发送验证码受间隔限制`() {
        every { redisCache.setCacheIfAbsent(any(), any<String>(), any()) } returns true
        every { redisCache.setCache(any(), any<String>(), any()) } returns Unit

        emailService.sendVCode("test@test.com")

        verify { redisCache.setCache("vCodeEmail:test@test.com", any<String>(), 600) }
    }

    @Test
    fun `间隔内重复发送抛出 403`() {
        every { redisCache.setCacheIfAbsent(any(), any<String>(), any()) } returns false

        val ex = assertThrows(ApiResultException::class.java) {
            emailService.sendVCode("test@test.com")
        }
        assertEquals(403, ex.statusCode)
    }

    @Test
    fun `验证码校验失败抛出 401`() {
        every { redisCache.removeKVIfEquals(any(), any()) } returns false

        val ex = assertThrows(ApiResultException::class.java) {
            emailService.verifyVCode("test@test.com", "WRONG")
        }
        assertEquals(401, ex.statusCode)
    }

    @Test
    fun `验证码校验成功`() {
        every { redisCache.removeKVIfEquals(any(), any()) } returns true

        emailService.verifyVCode("test@test.com", "ABC123")

        verify { redisCache.removeKVIfEquals("vCodeEmail:test@test.com", "ABC123") }
    }
}
