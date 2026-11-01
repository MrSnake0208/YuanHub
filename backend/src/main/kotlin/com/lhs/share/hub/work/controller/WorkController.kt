package com.lhs.share.hub.work.controller

import com.fasterxml.jackson.databind.JsonMappingException
import com.fasterxml.jackson.databind.exc.InvalidTypeIdException
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.work.model.WorkCompatibilityResponse
import com.lhs.share.hub.work.model.WorkDetailResponse
import com.lhs.share.hub.work.model.WorkDocumentRequest
import com.lhs.share.hub.work.model.WorkPageResponse
import com.lhs.share.hub.work.model.WorkReplaceRequest
import com.lhs.share.hub.work.model.WorkRevisionConflict
import com.lhs.share.hub.work.model.WorkRevisionRequest
import com.lhs.share.hub.work.model.WorkValidationIssue
import com.lhs.share.hub.work.service.WorkApiException
import com.lhs.share.hub.work.service.WorkRevisionConflictException
import com.lhs.share.hub.work.service.WorkService
import com.lhs.share.hub.work.service.WorkValidationException
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

@RestController
@RequestMapping("/v1/works", produces = [MediaType.APPLICATION_JSON_VALUE])
class WorkController(
    private val service: WorkService,
    private val authentication: AuthenticationHelper,
) {
    @GetMapping
    fun list(@RequestParam(defaultValue = "1") page: Int, @RequestParam(defaultValue = "20") limit: Int): ApiResult<WorkPageResponse> =
        success(service.list(page, limit))

    @RequireJwt
    @GetMapping("/mine")
    fun mine(@RequestParam(defaultValue = "1") page: Int, @RequestParam(defaultValue = "20") limit: Int): ApiResult<WorkPageResponse> =
        success(service.mine(authentication.requireUserId(), page, limit))

    @GetMapping("/{id}")
    fun get(@PathVariable id: String): ApiResult<WorkDetailResponse> = success(service.get(id, authentication.obtainUserId()))

    @RequireJwt
    @PostMapping
    fun create(@RequestBody request: WorkDocumentRequest): ApiResult<WorkDetailResponse> =
        success(service.create(authentication.requireUserId(), request.document))

    @RequireJwt
    @PutMapping("/{id}")
    fun update(@PathVariable id: String, @RequestBody request: WorkReplaceRequest): ApiResult<WorkDetailResponse> =
        success(service.update(authentication.requireUserId(), id, request.expectedRevision, request.document))

    @RequireJwt
    @PostMapping("/{id}/publish")
    fun publish(@PathVariable id: String, @RequestBody request: WorkRevisionRequest): ApiResult<WorkDetailResponse> =
        success(service.publish(authentication.requireUserId(), id, request.expectedRevision))

    @RequireJwt
    @PostMapping("/{id}/unpublish")
    fun unpublish(@PathVariable id: String, @RequestBody request: WorkRevisionRequest): ApiResult<WorkDetailResponse> =
        success(service.unpublish(authentication.requireUserId(), id, request.expectedRevision))

    @RequireJwt
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: String, @RequestBody request: WorkRevisionRequest): ApiResult<Boolean> {
        service.delete(authentication.requireUserId(), id, request.expectedRevision)
        return success(true)
    }

    @PostMapping("/compatibility")
    fun preview(@RequestParam("to") target: String, @RequestBody request: WorkDocumentRequest): ApiResult<WorkCompatibilityResponse> =
        success(service.preview(request.document, target))

    @GetMapping("/{id}/compatibility")
    fun compatibility(@PathVariable id: String, @RequestParam("to") target: String): ApiResult<WorkCompatibilityResponse> =
        success(service.compatibility(id, target, authentication.obtainUserId()))
}

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [WorkController::class])
class WorkExceptionHandler {
    @ExceptionHandler(WorkApiException::class)
    fun api(e: WorkApiException): ResponseEntity<ApiResult<Nothing>> =
        ResponseEntity.status(e.status).body(ApiResult.fail(e.status.value(), e.message))

    @ExceptionHandler(WorkValidationException::class)
    fun validation(e: WorkValidationException): ResponseEntity<ApiResult<List<WorkValidationIssue>>> =
        ResponseEntity.badRequest().body(ApiResult(400, e.message, e.issues))

    @ExceptionHandler(WorkRevisionConflictException::class)
    fun revision(e: WorkRevisionConflictException): ResponseEntity<ApiResult<WorkRevisionConflict>> =
        ResponseEntity.status(409).body(ApiResult(409, e.message, WorkRevisionConflict(e.currentRevision)))

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun unreadable(e: HttpMessageNotReadableException): ResponseEntity<ApiResult<List<WorkValidationIssue>>> {
        val mapping = generateSequence<Throwable>(e) { it.cause }.filterIsInstance<JsonMappingException>().lastOrNull()
        var path = mapping?.path?.joinToString(separator = "", prefix = "$") { reference ->
            if (reference.fieldName != null) ".${reference.fieldName}" else "[${reference.index}]"
        } ?: "$"
        path = when {
            path == "$.document" -> "$"
            path.startsWith("$.document.") -> "$${path.removePrefix("$.document")}"
            else -> path
        }
        if (mapping is InvalidTypeIdException && !path.endsWith(".type")) path += ".type"
        val code = if (mapping is InvalidTypeIdException) "unknown_type" else "invalid_json"
        val issue = WorkValidationIssue(path, code, mapping?.originalMessage ?: "请求 JSON 无法解析")
        return ResponseEntity.badRequest().body(ApiResult(400, "WorkDocument 解析失败", listOf(issue)))
    }

    @ExceptionHandler(MissingServletRequestParameterException::class, MethodArgumentTypeMismatchException::class)
    fun badRequest(e: Exception): ResponseEntity<ApiResult<Nothing>> = ResponseEntity.badRequest().body(ApiResult.fail(400, e.message))
}
