package com.lhs.share.hub.controller.media

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.media.response.MediaUploadResponse
import com.lhs.share.hub.service.media.MediaStorageService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile

/**
 * 媒体文件上传接口
 *
 * 支持 JPG/PNG/WebP 图片和 TXT/LOG/JSON/PDF/ZIP 普通文件,单文件上限 10 MiB。
 * 仅图片通过 /media/{medId}.{ext} 静态资源路径公开访问。
 */
@Tag(name = "Media", description = "媒体文件上传")
@RequestMapping("/v1/media")
@RestController
class MediaController(
    private val mediaStorageService: MediaStorageService,
    private val helper: AuthenticationHelper,
    private val properties: ShareProperties,
) {
    /**
     * 上传媒体文件(需登录)
     *
     * @param file 上传的附件(multipart/form-data,字段名 file)
     * @return 上传后的文件元数据,普通文件的 URL 为空
     */
    @Operation(summary = "上传媒体文件")
    @RequireJwt
    @PostMapping("/upload", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun upload(
        @RequestPart("file") file: MultipartFile,
        @RequestParam(defaultValue = "false") feedback: Boolean = false,
    ): ApiResult<MediaUploadResponse> {
        val userId = helper.requireUserId()
        val asset = mediaStorageService.upload(userId, file, privateStorage = feedback)
        val baseUrl = properties.info.publicBaseUrl
        return success(MediaUploadResponse.of(asset, baseUrl))
    }
}
