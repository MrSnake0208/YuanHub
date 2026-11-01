package com.lhs.share.hub.controller.star

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.star.StarCaptureConsumeResponse
import com.lhs.share.hub.service.star.StarCaptureManifestResponse
import com.lhs.share.hub.service.star.StarCapturePendingResponse
import com.lhs.share.hub.service.star.StarCaptureTransportService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.core.io.Resource
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@Tag(name = "星石采集", description = "私有临时 MaaYuan 星石截图读取")
@RequestMapping("/v1/star/captures", produces = [MediaType.APPLICATION_JSON_VALUE])
@RestController
class StarCaptureController(
    private val captureService: StarCaptureTransportService,
    private val helper: AuthenticationHelper,
) {
    @Operation(summary = "读取当前账号最新待导入星石采集")
    @RequireJwt
    @GetMapping("/pending")
    fun pending(@RequestParam(name = "account_id") accountId: String): ApiResult<StarCapturePendingResponse?> =
        success(captureService.pending(helper.requireUserId(), accountId))

    @Operation(summary = "读取星石采集 manifest")
    @RequireJwt
    @GetMapping("/{captureId}")
    fun manifest(
        @RequestParam(name = "account_id") accountId: String,
        @PathVariable captureId: String,
    ): ApiResult<StarCaptureManifestResponse> = success(captureService.manifest(helper.requireUserId(), accountId, captureId))

    @Operation(summary = "读取私有星石截图")
    @RequireJwt
    @GetMapping("/{captureId}/images/{sourceImageId}", produces = [MediaType.IMAGE_PNG_VALUE])
    fun image(
        @RequestParam(name = "account_id") accountId: String,
        @PathVariable captureId: String,
        @PathVariable sourceImageId: String,
    ): ResponseEntity<Resource> {
        val image = captureService.image(helper.requireUserId(), accountId, captureId, sourceImageId)
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).contentLength(image.contentLength()).body(image)
    }

    @Operation(summary = "消费已成功导入的星石采集")
    @RequireJwt
    @PostMapping("/{captureId}/consume")
    fun consume(
        @RequestParam(name = "account_id") accountId: String,
        @PathVariable captureId: String,
    ): ApiResult<StarCaptureConsumeResponse> = success(captureService.consume(helper.requireUserId(), accountId, captureId))
}
