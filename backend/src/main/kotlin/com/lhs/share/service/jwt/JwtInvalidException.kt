package com.lhs.share.service.jwt

/**
 * JWT 不符合要求(签名错误/格式错误/类型不符等)
 */
class JwtInvalidException : RuntimeException("invalid jwt")
