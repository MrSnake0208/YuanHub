package com.lhs.share.hub.controller.star

import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.star.StarShareService
import io.swagger.v3.oas.annotations.Operation
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/v1/star/share", produces = [MediaType.APPLICATION_JSON_VALUE])
class StarShareController(private val service: StarShareService) {
    @Operation(summary = "匿名查看已授权账号最新保存的星石背包")
    @GetMapping("/view/{code}")
    fun view(@PathVariable code: String) = ResponseEntity.ok().header("Cache-Control", "no-store").body(success(service.view(code)))
}
