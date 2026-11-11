package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.service.beta.BetaApiException
import com.lhs.share.hub.service.inventory.InventoryApiException
import com.lhs.share.openapi.OpenApiPrincipal
import com.lhs.share.openapi.OpenApiTokenService
import io.github.oshai.kotlinlogging.KotlinLogging
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletRequestWrapper
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.filter.OncePerRequestFilter
import org.springframework.web.server.ResponseStatusException

internal const val DIAGNOSTIC_PATH = "/open-api/maayuan/diagnostics"
internal const val DIAGNOSTIC_BODY = "maayuan.diagnostic.body"
internal const val DIAGNOSTIC_TYPE = "maayuan.diagnostic.type"
internal const val DIAGNOSTIC_PRINCIPAL = "maayuan.diagnostic.principal"

/**
 * Registered explicitly so MVC test slices do not pick it up as a scanned Filter.
 * Runs before Spring Security and DispatcherServlet's multipart resolver, including for chunked requests.
 */
@Configuration(proxyBeanMethods = false)
class MaayuanDiagnosticFilterConfiguration {
    @Bean
    fun maayuanDiagnosticFilterRegistration(
        tokens: OpenApiTokenService,
        quotas: MaayuanDiagnosticQuota,
        mapper: ObjectMapper,
    ): FilterRegistrationBean<MaayuanDiagnosticFilter> = FilterRegistrationBean(
        MaayuanDiagnosticFilter(tokens, quotas, mapper),
    ).apply {
        order = Ordered.HIGHEST_PRECEDENCE + 20
    }
}

class MaayuanDiagnosticFilter(
    private val tokens: OpenApiTokenService,
    private val quotas: MaayuanDiagnosticQuota,
    private val mapper: ObjectMapper,
) : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean {
        val path = request.requestURI.removePrefix(request.contextPath)
        val diagnostic = path == DIAGNOSTIC_PATH || path == "$DIAGNOSTIC_PATH/intents" ||
            Regex("$DIAGNOSTIC_PATH/[^/]+/complete").matches(path)
        return request.method != "POST" || !diagnostic
    }

    override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
        try {
            val principal = tokens.authenticateAuthorization(request.getHeader("Authorization"))
            quotas.request(principal)
            val multipart = request.requestURI == request.contextPath + DIAGNOSTIC_PATH
            val maxBytes = if (multipart) MAX_REQUEST_BYTES else 64 * 1024
            if (request.contentLengthLong > maxBytes) {
                diagnosticError(HttpStatus.PAYLOAD_TOO_LARGE, "Diagnostic request too large")
            }
            val contentType = request.contentType.orEmpty()
            if (multipart) {
                if (!contentType.startsWith(
                        "multipart/form-data;",
                        ignoreCase = true,
                    )
                ) {
                    diagnosticError(HttpStatus.BAD_REQUEST, "Expected multipart/form-data")
                }
            } else if (!contentType.substringBefore(';').trim().equals("application/json", ignoreCase = true)) {
                diagnosticError(HttpStatus.BAD_REQUEST, "Expected application/json")
            }
            val bytes = request.inputStream.readNBytes(maxBytes + 1)
            if (bytes.size > maxBytes) diagnosticError(HttpStatus.PAYLOAD_TOO_LARGE, "Diagnostic request too large")
            request.setAttribute(DIAGNOSTIC_PRINCIPAL, principal)
            request.setAttribute(DIAGNOSTIC_BODY, bytes)
            request.setAttribute(DIAGNOSTIC_TYPE, contentType)
        } catch (error: Exception) {
            val status = when (error) {
                is ResponseStatusException -> error.statusCode.value()
                is InventoryApiException -> error.status.value()
                is BetaApiException -> error.status.value()
                is ApiResultException -> error.statusCode
                else -> 503
            }
            response.status = status
            response.contentType = "application/json"
            response.setHeader("Cache-Control", "no-store")
            if (error is ResponseStatusException) {
                error.headers.forEach { (name, values) -> values.forEach { response.addHeader(name, it) } }
            }
            mapper.writeValue(response.outputStream, mapOf("error" to "diagnostic_request_rejected"))
            return
        }
        // The bounded body is parsed by the endpoint, not the general upload resolver.
        chain.doFilter(
            object : HttpServletRequestWrapper(request) {
                override fun getContentType(): String = "application/octet-stream"
            },
            response,
        )
    }

    companion object {
        const val MAX_REQUEST_BYTES = 2 * 1024 * 1024
    }
}

@RestController
class MaayuanDiagnosticController(private val service: MaayuanDiagnosticService) {
    @PostMapping("$DIAGNOSTIC_PATH/intents", produces = ["application/json"])
    fun intents(request: HttpServletRequest): ResponseEntity<*> = try {
        ResponseEntity.ok().header("Cache-Control", "no-store").body(
            service.intents(
                request.getAttribute(DIAGNOSTIC_PRINCIPAL) as OpenApiPrincipal,
                request.getAttribute(DIAGNOSTIC_BODY) as ByteArray,
            ),
        )
    } catch (error: ResponseStatusException) {
        if (error.statusCode.value() != 409 || error.reason != "direct_upload_unavailable") throw error
        ResponseEntity.status(409).header("Cache-Control", "no-store").body(mapOf("status" to "direct_upload_unavailable"))
    }

    @PostMapping("$DIAGNOSTIC_PATH/{eventId}/complete", produces = ["application/json"])
    fun complete(@PathVariable eventId: String, request: HttpServletRequest): ResponseEntity<DiagnosticCompleteReceipt> =
        ResponseEntity.ok()
            .header("Cache-Control", "no-store")
            .body(
                service.complete(
                    request.getAttribute(DIAGNOSTIC_PRINCIPAL) as OpenApiPrincipal,
                    eventId,
                    request.getAttribute(DIAGNOSTIC_BODY) as ByteArray,
                ),
            )

    @PostMapping(DIAGNOSTIC_PATH, produces = ["application/json"])
    fun receive(request: HttpServletRequest): ResponseEntity<DiagnosticReceipt> = ResponseEntity.ok()
        .header("Cache-Control", "no-store")
        .body(
            service.receive(
                request.getAttribute(DIAGNOSTIC_PRINCIPAL) as OpenApiPrincipal,
                request.getAttribute(DIAGNOSTIC_BODY) as ByteArray,
                request.getAttribute(DIAGNOSTIC_TYPE) as String,
            ),
        )
}

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [MaayuanDiagnosticController::class])
class MaayuanDiagnosticExceptionHandler {
    private val log = KotlinLogging.logger { }

    @ExceptionHandler(ResponseStatusException::class)
    fun rejected(error: ResponseStatusException): ResponseEntity<Map<String, String>> = ResponseEntity
        .status(error.statusCode).headers(error.headers)
        .body(mapOf("error" to (error.reason ?: "diagnostic_request_rejected")))

    @ExceptionHandler(Exception::class)
    fun unexpected(error: Exception): ResponseEntity<Map<String, String>> {
        log.error(error) { "Unexpected diagnostic request failure" }
        return ResponseEntity.status(503)
            .body(mapOf("error" to "diagnostic_temporarily_unavailable"))
    }
}
