package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonProperty

data class DiagnosticIntentRequest(
    val manifest: MaayuanDiagnosticManifest,
    val uploads: List<DiagnosticUploadDeclaration>,
    val log: DiagnosticUploadDeclaration? = null,
)

data class DiagnosticUploadDeclaration(val size: Long, val contentMd5: String)

data class DiagnosticUploadIntent(
    val index: Int,
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    @get:JsonProperty("expires_in") val expiresIn: Long,
) {
    // MVC 调试日志可能调用 DTO.toString(),不能包含签名 URL。
    override fun toString(): String = "DiagnosticUploadIntent(index=$index, method=$method, expiresIn=$expiresIn)"
}

data class DiagnosticIntentReceipt(
    val status: String,
    @get:JsonProperty("event_id") val eventId: String,
    val uploads: List<DiagnosticUploadIntent> = emptyList(),
    @get:JsonInclude(JsonInclude.Include.NON_NULL)
    @get:JsonProperty("log_upload") val logUpload: DiagnosticLogUploadIntent? = null,
)

data class DiagnosticLogUploadIntent(
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    @get:JsonProperty("expires_in") val expiresIn: Long,
) {
    override fun toString(): String = "DiagnosticLogUploadIntent(method=$method, expiresIn=$expiresIn)"
}

data class DiagnosticCompleteImage(val index: Int, val status: String)

data class DiagnosticCompleteLog(val status: String)

data class DiagnosticCompleteReceipt(
    val status: String = "completed",
    val images: List<DiagnosticCompleteImage>,
    @get:JsonInclude(JsonInclude.Include.NON_NULL) val log: DiagnosticCompleteLog? = null,
)
