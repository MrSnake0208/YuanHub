package com.lhs.share.openapi.diagnostics

import org.springframework.http.HttpStatus
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.util.zip.GZIPInputStream

internal const val DIAGNOSTIC_LOG_COMPRESSED_LIMIT = 262144
internal const val DIAGNOSTIC_LOG_TEXT_LIMIT = 1048576

internal fun decodeDiagnosticLog(bytes: ByteArray): String {
    if (bytes.size !in 1..DIAGNOSTIC_LOG_COMPRESSED_LIMIT) diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid log size")
    try {
        val text = GZIPInputStream(bytes.inputStream()).use { it.readNBytes(DIAGNOSTIC_LOG_TEXT_LIMIT + 1) }
        if (text.size > DIAGNOSTIC_LOG_TEXT_LIMIT) diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Log exceeds 1 MiB")
        return Charsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(text)).toString()
    } catch (_: IOException) {
        diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid gzip or UTF-8 log")
    }
}
