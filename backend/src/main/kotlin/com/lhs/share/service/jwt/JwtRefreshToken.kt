package com.lhs.share.service.jwt

import java.time.Instant

/**
 * 基于 JWT 的 RefreshToken
 */
class JwtRefreshToken : JwtToken {
    /**
     * 从 jwt 字符串构建 token
     *
     * @param token jwt 字符串
     * @param key   签名密钥
     * @throws JwtInvalidException jwt 未通过签名验证或不符合要求
     */
    constructor(token: String, key: ByteArray) : super(token, TYPE, key)

    constructor(
        sub: String,
        jti: String?,
        iat: Instant,
        exp: Instant,
        nbf: Instant,
        key: ByteArray,
    ) : super(sub, jti, iat, exp, nbf, TYPE, key)

    companion object {
        /**
         * RefreshToken 类型值
         */
        const val TYPE: String = "refresh"
    }
}
