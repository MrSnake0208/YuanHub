package com.lhs.share.service

import cn.hutool.extra.mail.MailAccount
import cn.hutool.extra.mail.MailUtil
import com.lhs.share.common.utils.FreeMarkerUtils
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.repository.RedisCache
import io.github.oshai.kotlinlogging.KotlinLogging
import org.apache.commons.lang3.RandomStringUtils
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.util.Locale
import java.util.concurrent.atomic.AtomicInteger

/**
 * 邮件服务:发送/校验邮箱验证码
 *
 * 验证码存 Redis(key = vCodeEmail:{email}),校验通过即消耗(防重放);
 * 支持多 SMTP 账号轮询发送;flagNoSend 调试开关可在本地把验证码打到日志
 */
@Service
class EmailService(
    private val shareProperties: ShareProperties,
    private val redisCache: RedisCache,
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

    /**
     * 发送验证码
     * 以 email 作为 redis key,vcode(验证码)作为 redis value
     *
     * @param email 邮箱
     */
    fun sendVCode(email: String) {
        // 一个过期周期最多重发十条,记录已发送的邮箱以及间隔时间
        val timeout = shareProperties.vcode.expire / 10
        if (!redisCache.setCacheIfAbsent("HasBeenSentVCode:$email", timeout, timeout)) {
            // 设置失败,说明 key 已存在
            throw ApiResultException(HttpStatus.FORBIDDEN.value(), "发送验证码的请求至少需要间隔 $timeout 秒")
        }
        doSendVCode(email)
    }

    private fun doSendVCode(email: String) {
        // 6位随机数验证码
        val vCode = RandomStringUtils.insecure().next(6, true, true).uppercase(Locale.getDefault())
        if (flagNoSend) {
            log.warn { "Email not sent, no-send enabled, vcode is $vCode" }
        } else {
            val subject = "Share Backend 验证码"
            val dataModel = mapOf(
                "content" to "mail-vCode.ftlh",
                "obj" to vCode,
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
        // 存 redis
        redisCache.setCache("vCodeEmail:$email", vCode, shareProperties.vcode.expire)
    }

    /**
     * 校验验证码并抛出异常
     *
     * @param email 邮箱
     * @param vcode 验证码
     * @throws ApiResultException 验证码错误
     */
    fun verifyVCode(email: String, vcode: String) {
        if (!redisCache.removeKVIfEquals("vCodeEmail:$email", vcode.uppercase(Locale.getDefault()))) {
            throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), "验证码错误")
        }
    }
}
