package com.lhs.share.hub.controller.achievement

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder
import com.lhs.share.hub.controller.achievement.request.AchievementRequestDecoder.invalid
import com.lhs.share.hub.service.achievement.AchievementCatalogAdminService
import com.lhs.share.hub.service.achievement.AchievementCatalogDecoder
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RequireJwt
@Tag(name = "Achievement Catalog Admin")
@RestController
@RequestMapping("/v1/admin/achievement-catalogs", produces = [MediaType.APPLICATION_JSON_VALUE])
class AchievementCatalogAdminController(
    private val service: AchievementCatalogAdminService,
    private val authorization: AdminAuthorizationService,
    private val helper: AuthenticationHelper,
    private val mapper: ObjectMapper,
) {
    @GetMapping
    fun read(@RequestParam game: String): ResponseEntity<*> {
        actor()
        return result(service.read(game))
    }

    @GetMapping("/export")
    fun export(@RequestParam game: String, @RequestParam scope: String): ResponseEntity<*> {
        actor()
        if (scope ==
            "legacy"
        ) {
            return result(mapOf("format" to "yuanhub-achievement-catalog-legacy", "document" to service.legacyExport(game)))
        }
        val current = service.read(game)
        if (current.compatibilityIssues.isNotEmpty()) invalid("旧目录含待核对资料，请选择 legacy 导出原始文档；标准导出会丢失旧字段，已阻止")
        val content = when (scope) {
            "draft" -> current.draft
            "published" -> current.published.content.copy(catalogVersion = current.published.version)
            else -> invalid("scope 只允许 draft 或 published")
        }
        return result(mapOf("format" to "yuanhub-achievement-catalog", "schema_version" to 1, "catalog" to content))
    }

    @PostMapping("/{action}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun action(@PathVariable action: String, @RequestParam game: String, @RequestBody bytes: ByteArray): ResponseEntity<*> {
        val actor = actor()
        if (bytes.size > 2 * 1024 * 1024) throw InventoryApiException(HttpStatus.PAYLOAD_TOO_LARGE, "catalog_too_large", "管理请求最多2MiB")
        val node = try {
            mapper.readTree(bytes) ?: invalid("JSON 不能为空")
        } catch (_: JsonProcessingException) {
            invalid("JSON 损坏")
        }
        val extra = when (action) {
            "draft" -> setOf("catalog")
            "entries" -> setOf("category_id")
            "categories" -> setOf("name")
            "preview", "publish" -> setOf("restore_version")
            "discard" -> emptySet()
            "import-preview" -> setOf("document", "strategy")
            "import-confirm" -> setOf("document", "strategy", "preview_token")
            else -> invalid("未知的目录操作")
        }
        AchievementRequestDecoder.objectFields(node, extra + "expected_revision")
        val rev = node["expected_revision"]?.takeIf { it.isIntegralNumber && it.canConvertToLong() && it.longValue() >= 0 }?.longValue()
            ?: invalid("expected_revision 必须是非负整数")
        fun text(key: String) = AchievementRequestDecoder.text(node, key)
        val restore = node["restore_version"]?.takeUnless { it.isNull }?.let { text("restore_version") }
        return result(
            when (action) {
                "draft" -> service.save(game, rev, AchievementCatalogDecoder.content(node.path("catalog"), mapper))
                "entries" -> service.addEntry(game, rev, text("category_id"))
                "categories" -> service.addCategory(game, rev, text("name"))
                "discard" -> service.discard(game, rev)
                "preview" -> service.preview(game, rev, restore)
                "publish" -> service.publish(game, rev, actor, restore)
                "import-preview" -> service.importPreview(game, rev, actor, node.path("document"), text("strategy"))
                else -> service.importConfirm(game, rev, actor, node.path("document"), text("strategy"), text("preview_token"))
            },
        )
    }

    private fun actor(): String = (
        helper.obtainUserId() ?: throw InventoryApiException(
            HttpStatus.UNAUTHORIZED,
            "achievement_catalog_unauthorized",
            "请先登录",
        )
        ).also {
        if (!authorization.hasPermission(it, AdminPermission.ACHIEVEMENT_CATALOG_WRITE)) {
            throw InventoryApiException(HttpStatus.FORBIDDEN, "achievement_catalog_forbidden", "需要成就目录管理权限")
        }
    }
    private fun result(value: Any) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
