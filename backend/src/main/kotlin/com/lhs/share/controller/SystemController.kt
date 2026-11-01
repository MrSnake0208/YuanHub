package com.lhs.share.controller

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResult
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.info.GitProperties
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * 系统管理接口
 */
@Tag(name = "System", description = "系统管理接口")
@RequestMapping("")
@RestController
class SystemController(
    private val properties: ShareProperties,
    private val gitPropertiesProvider: ObjectProvider<GitProperties>,
) {
    /**
     * 测试服务是否就绪
     */
    @Operation(summary = "测试服务是否就绪")
    @GetMapping("/")
    fun test(): ApiResult<Nothing> = ApiResult.success("Share Server is Running", null)

    /**
     * 获取当前版本信息
     *
     * 同时保留旧字段(title / description / version / git)以兼容既有调用方,
     * 新增字段区分「后端自身版本」与「YuanHub 产品版本」两个独立概念:
     * - backendVersion 来自 share.info.version,可由 YUANHUB_BACKEND_VERSION 覆盖,后端自己发版时变更;
     * - productVersion 来自 YUANHUB_PRODUCT_VERSION,后端不硬编码,前端发版不强制重新发布后端。
     *
     * 响应字段沿用全局 SNAKE_CASE 命名策略(与 git.commit_id 等既有字段一致)。
     */
    @Operation(summary = "获取当前版本信息")
    @GetMapping("/version")
    fun getSystemVersion(): ApiResult<SystemInfo> {
        val info = properties.info
        val git = gitPropertiesProvider.getIfAvailable()
        val systemInfo = SystemInfo(
            title = info.title,
            description = info.description,
            version = info.version,
            git = git,
            productVersion = info.productVersion,
            backendVersion = info.version,
            backendCommit = git?.shortCommitId ?: git?.commitId,
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
     * @property backendCommit 后端构建 commit 短 SHA
     * @property branch 构建分支
     * @property commitTime 构建提交时间(ISO-8601)
     */
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
