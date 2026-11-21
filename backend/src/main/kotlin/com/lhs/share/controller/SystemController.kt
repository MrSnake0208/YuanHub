package com.lhs.share.controller

import com.fasterxml.jackson.annotation.JsonInclude
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResult
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.info.GitProperties
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.security.MessageDigest

/**
 * 系统管理接口
 */
@Tag(name = "System", description = "系统管理接口")
@RequestMapping("")
@RestController
class SystemController(
    private val properties: ShareProperties,
    @param:Value("\${YUANHUB_RELEASE_METADATA_TOKEN:}") private val releaseToken: String,
    private val gitPropertiesProvider: ObjectProvider<GitProperties>,
) {
    /**
     * 测试服务是否就绪
     */
    @Operation(summary = "测试服务是否就绪")
    @GetMapping("/")
    fun test(): ApiResult<Nothing> = ApiResult.success("Share Server is Running", null)

    /** 产品及后端版本公开。仅发布校验凭据可以读取构建元数据。 */
    @Operation(summary = "获取当前版本信息")
    @GetMapping("/version")
    fun getSystemVersion(
        @RequestHeader("X-Release-Metadata", required = false) credential: String?,
        response: HttpServletResponse,
    ): ApiResult<SystemInfo> {
        val info = properties.info
        response.setHeader("Cache-Control", "private, no-store")
        val authorized = releaseToken.isNotBlank() && credential != null &&
            MessageDigest.isEqual(releaseToken.toByteArray(), credential.toByteArray())
        val git = if (authorized) gitPropertiesProvider.getIfAvailable() else null
        val systemInfo = SystemInfo(
            title = info.title,
            description = info.description,
            version = info.version,
            git = git,
            productVersion = info.productVersion,
            backendVersion = info.version,
            backendCommit = git?.commitId,
            branch = git?.branch,
            commitTime = git?.commitTime?.toString(),
        )
        return ApiResult.success(systemInfo)
    }

    /**
     * 系统信息
     *
     * @property title 服务标题
     * @property description 服务描述
     * @property version 旧字段:后端版本,等价于 backendVersion
     * @property git 构建时写入的 Git 信息(无 git.properties 时为 null)
     * @property productVersion YuanHub 产品版本(生产环境由 YUANHUB_PRODUCT_VERSION 注入,未配置时为空字符串)
     * @property backendVersion 后端自身版本
     * @property backendCommit 后端构建完整 SHA
     * @property branch 构建分支
     * @property commitTime 构建提交时间(ISO-8601)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    data class SystemInfo(
        val title: String,
        val description: String,
        val version: String,
        val git: GitProperties?,
        val productVersion: String,
        val backendVersion: String,
        val backendCommit: String?,
        val branch: String?,
        val commitTime: String?,
    )
}
