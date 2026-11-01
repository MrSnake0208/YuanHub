package com.lhs.share.openapi

import com.lhs.share.config.doc.RequireOpenApiToken
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.star.StarCaptureImageUploadResponse
import com.lhs.share.hub.service.star.StarCaptureMissingImagesResponse
import com.lhs.share.hub.service.star.StarCaptureTransportService
import com.lhs.share.hub.service.star.StarCaptureUploadResponse
import com.lhs.share.hub.service.star.StarCaptureUploadSessionResponse
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

@Tag(name = "OpenAPI 星石采集", description = "MaaYuan 星石背包临时截图上传")
@RequestMapping("/open-api/star", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class OpenApiStarCaptureController(
    private val tokenService: OpenApiTokenService,
    private val captureService: StarCaptureTransportService,
) {
    @RequireOpenApiToken
    @PostMapping("/captures/init", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun initUpload(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestBody manifest: String,
    ): ApiResult<StarCaptureUploadSessionResponse> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.STAR_CAPTURE_WRITE)
        return success(captureService.initUpload(principal.userId, principal.accountId, manifest))
    }

    @RequireOpenApiToken
    @PostMapping("/captures/{captureId}/images/{sourceImageId}", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun uploadImage(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable captureId: String,
        @PathVariable sourceImageId: String,
        @RequestPart("file") file: MultipartFile,
    ): ApiResult<StarCaptureImageUploadResponse> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.STAR_CAPTURE_WRITE)
        return success(captureService.uploadImage(principal.userId, principal.accountId, captureId, sourceImageId, file))
    }

    @RequireOpenApiToken
    @PostMapping("/captures/{captureId}/finalize")
    fun finalizeUpload(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @PathVariable captureId: String,
    ): ResponseEntity<ApiResult<*>> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.STAR_CAPTURE_WRITE)
        val result = captureService.finalizeUpload(principal.userId, principal.accountId, captureId)
        if (result.missingSourceImageIds.isNotEmpty()) {
            return ResponseEntity.status(409).body(
                ApiResult(409, "CaptureBatch 缺少图片", StarCaptureMissingImagesResponse(captureId, result.missingSourceImageIds)),
            )
        }
        return ResponseEntity.ok(success(requireNotNull(result.capture)))
    }

    @Operation(summary = "上传星石背包临时采集")
    @RequireOpenApiToken
    @PostMapping("/captures", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(
        @RequestHeader(value = "Authorization", required = false) authorization: String?,
        @RequestPart("manifest") manifest: String,
        @RequestPart("files") files: List<MultipartFile>,
    ): ApiResult<StarCaptureUploadResponse> {
        val principal = tokenService.validateAuthorization(authorization, OpenApiPermission.STAR_CAPTURE_WRITE)
        return success(captureService.upload(principal.userId, principal.accountId, manifest, files))
    }
}
