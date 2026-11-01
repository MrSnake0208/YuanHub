package com.lhs.share.hub.controller

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.request.HubPostCreateRequest
import com.lhs.share.hub.controller.response.HubPostResponse
import com.lhs.share.hub.service.HubPostService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Hub 库业务示例接口(数据存 HubBackend,用户信息跨库联查 MaaBackend)
 *
 * 安全:发布需登录(GET 之外的写接口默认 authenticated),查询公开(见 SecurityConfig.URL_PERMIT_ALL)
 */
@Tag(name = "Hub", description = "Hub 库业务示例")
@RequestMapping("/hub/post")
@RestController
class HubPostController(
    private val hubPostService: HubPostService,
    private val helper: AuthenticationHelper,
) {
    /**
     * 发布帖子(需登录,发帖人为当前用户)
     */
    @Operation(summary = "发布帖子")
    @RequireJwt
    @PostMapping
    fun create(@Valid @RequestBody request: HubPostCreateRequest): ApiResult<HubPostResponse> =
        success(hubPostService.create(helper.requireUserId(), request))

    /**
     * 帖子详情(联查发帖人信息)
     */
    @Operation(summary = "帖子详情")
    @GetMapping("/{id}")
    fun getById(@PathVariable id: String): ApiResult<HubPostResponse> = success(hubPostService.getById(id))

    /**
     * 按用户查帖子列表(批量联查用户)
     */
    @Operation(summary = "按用户查帖子列表")
    @GetMapping("/user/{userId}")
    fun listByUser(@PathVariable userId: String): ApiResult<List<HubPostResponse>> = success(hubPostService.listByUser(userId))

    /**
     * 帖子列表(最近 50 条,批量联查用户)
     */
    @Operation(summary = "帖子列表")
    @GetMapping
    fun list(): ApiResult<List<HubPostResponse>> = success(hubPostService.list())
}
