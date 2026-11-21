package com.lhs.share.service

import cn.hutool.extra.mail.MailAccount
import cn.hutool.extra.mail.MailUtil
import com.lhs.share.common.utils.FreeMarkerUtils
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicInteger

/**
 * 邮件服务:发送/校验邮箱验证码
 *
 * 验证码按用途和邮箱保存，校验通过或错满五次即消耗。
 * 支持多 SMTP 账号轮询发送;flagNoSend 调试开关可在本地把验证码打到日志
 */
@Service
class EmailService(
    private val shareProperties: ShareProperties,
    private val codes: EmailCodes,
    // 测试用 flag,本地测试时可以开启并在控制台查看验证码
    @param:Value("\${debug.email.no-send:false}")
    private val flagNoSend: Boolean = false,
) {
    private val log = KotlinLogging.logger { }
    private val mails = shareProperties.mails
    private val currentMailIdx = AtomicInteger()
    private val mailAccounts = mails.map {
        MailAccount()
            .setHost(it.host)
            .setPort(it.port)
            .setFrom(it.from)
            .setUser(it.user)
            .setPass(it.pass)
            .setSslEnable(it.ssl)
            .setStarttlsEnable(it.starttls)
    }

    private fun nextMailAccount() = mailAccounts[currentMailIdx.getAndIncrement() % mailAccounts.size]

    private val random = SecureRandom()
    private val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

    fun sendVCode(email: String, purpose: EmailCodePurpose) {
        val code = CharArray(6) { alphabet[random.nextInt(alphabet.length)] }.concatToString()
        codes.issue(email, purpose, code, shareProperties.vcode.expire)
        if (flagNoSend) {
            log.warn { "Email not sent, no-send enabled, vcode is $code" }
        } else {
            val subject = "Share Backend 验证码"
            val dataModel = mapOf(
                "content" to "mail-vCode.ftlh",
                "obj" to code,
            )
            val content = FreeMarkerUtils.parseData("mail-includeHtml.ftlh", dataModel)
            log.info { "try send email to $email" }
            try {
                MailUtil.send(nextMailAccount(), listOf(email), subject, content, true)
                log.info { "send email to $email successfully" }
            } catch (e: Exception) {
                log.error(e) { "send email failed, msg: ${e.message}" }
                throw IllegalStateException("邮件服务异常,请稍后再试或联系管理员")
            }
        }
    }

    fun verifyVCode(email: String, purpose: EmailCodePurpose, code: String) {
        if (!codes.verify(email, purpose, code)) throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), "验证码错误")
    }
}
