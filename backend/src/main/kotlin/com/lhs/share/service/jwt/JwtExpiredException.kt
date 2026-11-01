package com.lhs.share.service.jwt

/**
 * JWT 未生效或已过期
 */
class JwtExpiredException : RuntimeException {
    constructor() : super("expired jwt")

    constructor(message: String?) : super(message)
}
