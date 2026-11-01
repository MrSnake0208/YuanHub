package com.lhs.share.config.external

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.NestedConfigurationProperty
import org.springframework.stereotype.Component

/**
 * 应用自定义配置,前缀 share
 *
 * 对应 application.yml 中的 share.* 配置段
 */
@Component
@ConfigurationProperties("share")
data class ShareProperties(
    @NestedConfigurationProperty
    var jwt: Jwt = Jwt(),
    @NestedConfigurationProperty
    var info: Info = Info(),
    @NestedConfigurationProperty
    var cache: Cache = Cache(),
    @NestedConfigurationProperty
    var vcode: Vcode = Vcode(),
    @NestedConfigurationProperty
    var mails: List<Mail> = emptyList(),
    @NestedConfigurationProperty
    var mongo: Mongo = Mongo(),
    @NestedConfigurationProperty
    var ledger: Ledger = Ledger(),
    @NestedConfigurationProperty
    var avatar: Avatar = Avatar(),
    @NestedConfigurationProperty
    var media: Media = Media(),
    @NestedConfigurationProperty
    var starCapture: StarCapture = StarCapture(),
) {
    /**
     * JWT 配置
     */
    data class Jwt(
        /**
         * 携带 token 的请求头名称
         */
        var header: String = "Authorization",
        /**
         * JWT 签名密钥,生产环境务必更换
         */
        var secret: String = "please-change-me-to-a-long-random-secret",
        /**
         * AccessToken 过期时间,单位秒
         */
        var expire: Long = 21600,
        /**
         * RefreshToken 过期时间,单位秒
         */
        var refreshExpire: Long = 604800,
    )

    /**
     * 系统信息配置(用于 /version 等接口)
     */
    data class Info(
        var title: String = "Share Backend API",
        var description: String = "Share Backend API",
        /**
         * 后端自身版本,与 YuanHub 产品版本无关;可由环境变量 YUANHUB_BACKEND_VERSION 覆盖。
         */
        var version: String = "v0.1.0",
        /**
         * YuanHub 产品版本。后端不硬编码该值,生产环境通过 YUANHUB_PRODUCT_VERSION 注入。
         */
        var productVersion: String = "",
        var publicBaseUrl: String = "https://hub.maayuan.fun:16666",
        var domain: String = "",
        var frontendDomain: String = "",
    )

    /**
     * 缓存配置
     */
    data class Cache(
        /**
         * 缓存默认过期时间,单位秒
         */
        var defaultExpire: Long = 60,
    )

    /**
     * 验证码配置
     */
    data class Vcode(
        /**
         * 验证码失效时间,单位秒
         */
        var expire: Long = 600,
    )

    /**
     * MongoDB 多库配置
     */
    data class Mongo(
        /**
         * Hub 库连接串,留空则复用主库连接(同一实例仅切换库名)
         */
        var hubUri: String = "",
    )

    /**
     * 广陵账房配置
     */
    data class Ledger(
        /**
         * 每用户方案数上限,超出后创建返回 429
         */
        var maxPlansPerUser: Long = 50,
    )

    /**
     * 邮件服务器配置(可配置多个,发送时轮询)
     */
    data class Mail(
        var host: String = "smtp.qq.com",
        var port: Int = 465,
        var from: String = "",
        var user: String = "",
        var pass: String = "",
        var starttls: Boolean = true,
        var ssl: Boolean = false,
    )

    /**
     * 密探头像配置
     */
    data class Avatar(
        /**
         * 头像文件目录({operatorId}.webp 直接存在该目录),
         * 生产用环境变量 SHARE_AVATAR_DIR / Docker volume 覆盖
         */
        var dir: String = "./data/avatar",
    )

    /**
     * 媒体文件上传配置
     */
    data class Media(
        /**
         * 媒体文件存储目录,生产用环境变量 SHARE_MEDIA_DIR / Docker volume 覆盖
         */
        var dir: String = "./data/media",
        /**
         * 单文件业务大小上限(字节),默认 10 MiB
         */
        var maxSize: Long = 10 * 1024 * 1024,
        /**
         * 私有附件存储目录,生产用环境变量 SHARE_PRIVATE_MEDIA_DIR / Docker volume 覆盖
         */
        var privateDir: String = "./data/private-media",
    )

    /** MaaYuan 星石采集的短期私有中转目录。 */
    data class StarCapture(
        /** 不映射到任何静态 URL 的运行时目录。 */
        var dir: String = "./data/star-captures",
        /** 未消费采集的保留时间，单位分钟。 */
        var ttlMinutes: Long = 30,
    )
}
