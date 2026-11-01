package com.lhs.share.controller

import com.lhs.share.controller.request.demo.DemoCreateRequest
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.controller.response.demo.DemoResponse
import com.lhs.share.service.DemoService
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
 * 示例接口,演示完整分层写法(controller → service → repository),接入真实业务后可删除
 */
@Tag(name = "Demo", description = "示例接口")
@RequestMapping("/demo")
@RestController
class DemoController(private val demoService: DemoService) {
    /**
     * 创建示例资源
     */
    @Operation(summary = "创建示例资源")
    @PostMapping
    fun create(@Valid @RequestBody request: DemoCreateRequest): ApiResult<DemoResponse> = success(demoService.create(request))

    /**
     * 按 id 查询示例资源
     */
    @Operation(summary = "按 id 查询示例资源")
    @GetMapping("/{id}")
    fun getById(@PathVariable id: String): ApiResult<DemoResponse> = success(demoService.getById(id))

    /**
     * 示例资源列表
     */
    @Operation(summary = "示例资源列表")
    @GetMapping
    fun list(): ApiResult<List<DemoResponse>> = success(demoService.list())
}
