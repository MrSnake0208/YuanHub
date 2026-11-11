package com.lhs.share.openapi.diagnostics

import com.lhs.share.openapi.OpenApiPrincipal
import org.springframework.core.io.ClassPathResource
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.RedisScript
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.time.ZoneOffset

@Service
class MaayuanDiagnosticQuota(private val redis: StringRedisTemplate) {
    private val script = RedisScript.of(ClassPathResource("redis-lua/diagnosticQuota.lua"), Long::class.java)

    fun request(principal: OpenApiPrincipal, now: Instant = Instant.now()) {
        val day = now.atOffset(ZoneOffset.UTC).toLocalDate()
        val seconds = day.plusDays(1).atStartOfDay().toEpochSecond(ZoneOffset.UTC) - now.epochSecond
        consume(
            listOf("diag:user:${principal.userId}:minute", "diag:user:${principal.userId}:$day"),
            listOf(6L, 100L),
            listOf(1L, 1L),
            listOf(60L, seconds),
        )
    }

    fun packet(principal: OpenApiPrincipal, imageBytes: Long, now: Instant = Instant.now()) {
        val day = now.atOffset(ZoneOffset.UTC).toLocalDate()
        val seconds = day.plusDays(1).atStartOfDay().toEpochSecond(ZoneOffset.UTC) - now.epochSecond
        val key = "diag:account:${principal.userId}:${principal.accountId}:$day"
        consume(listOf("$key:packets", "$key:images"), listOf(30L, 20L * 1024 * 1024), listOf(1L, imageBytes), listOf(seconds, seconds))
    }

    private fun consume(keys: List<String>, limits: List<Long>, amounts: List<Long>, ttl: List<Long>) {
        val arguments = keys.indices.flatMap { listOf(limits[it].toString(), amounts[it].toString(), ttl[it].toString()) }
        val retryAfter = redis.execute(script, keys, *arguments.toTypedArray())
            ?: diagnosticError(HttpStatus.SERVICE_UNAVAILABLE, "Quota unavailable")
        if (retryAfter > 0) {
            throw object : ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Diagnostic quota exceeded") {
                override fun getHeaders() = org.springframework.http.HttpHeaders().apply { set("Retry-After", retryAfter.toString()) }
            }
        }
    }
}
