package com.lhs.share.service

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
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
    private val codes = mockk<EmailCodes>(relaxUnitFun = true)

    // flagNoSend = true:不真实发邮件,验证码打印日志
    private val emailService = EmailService(properties, codes, flagNoSend = true)

    @Test
    fun `发送六位大写字母数字验证码并绑定注册用途和有效期`() {
        emailService.sendVCode("test@test.com", EmailCodePurpose.REGISTER)
        verify { codes.issue("test@test.com", EmailCodePurpose.REGISTER, match { Regex("[A-Z0-9]{6}").matches(it) }, 600) }
    }

    @Test
    fun `验证码校验失败抛出 401`() {
        every { codes.verify(any(), any(), any()) } returns false

        val ex = assertThrows(ApiResultException::class.java) {
            emailService.verifyVCode("test@test.com", EmailCodePurpose.RESET_PASSWORD, "WRONG")
        }
        assertEquals(401, ex.statusCode)
    }

    @Test
    fun `验证码校验成功`() {
        every { codes.verify(any(), any(), any()) } returns true

        emailService.verifyVCode("test@test.com", EmailCodePurpose.RESET_PASSWORD, "ABC123")

        verify { codes.verify("test@test.com", EmailCodePurpose.RESET_PASSWORD, "ABC123") }
    }
}
