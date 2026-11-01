package com.lhs.share.hub.controller.bond

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import com.lhs.share.hub.service.bond.BondCatalogService
import com.lhs.share.hub.service.bond.BondRules
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
@Tag(name = "Bond Catalog Admin")
@RestController
@RequestMapping("/v1/admin/bonds/catalog", produces = [MediaType.APPLICATION_JSON_VALUE])
class BondCatalogAdminController(
    private val catalog: BondCatalogService,
    private val authorization: AdminAuthorizationService,
    private val helper: AuthenticationHelper,
    private val mapper: ObjectMapper,
) {
    private fun actor(): String {
        val user = helper.obtainUserId() ?: throw InventoryApiException(HttpStatus.UNAUTHORIZED, "bond_unauthorized", "请先登录")
        if (!authorization.hasPermission(user, AdminPermission.BOND_CATALOG_WRITE)) {
            throw InventoryApiException(HttpStatus.FORBIDDEN, "bond_catalog_forbidden", "需要羁绊目录管理权限")
        }
        return user
    }

    @GetMapping
    fun read(@RequestParam game: String): ResponseEntity<*> {
        actor()
        return result(catalog.read(game))
    }

    @GetMapping("/export")
    fun export(@RequestParam game: String, @RequestParam scope: String): ResponseEntity<*> {
        actor()
        val value = catalog.read(game)
        val entries = when (scope) {
            "draft" -> value.draft
            "published" -> value.published.entries
            else -> BondRules.invalid("scope 只允许 draft 或 published")
        }
        return result(mapOf("format" to "yuanhub-bond-catalog", "schema_version" to 1, "game" to game, "entries" to entries))
    }

    @PostMapping("/{action}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun action(@PathVariable action: String, @RequestParam game: String, @RequestBody bytes: ByteArray): ResponseEntity<*> {
        val actor = actor()
        val node = readBondBody(bytes, mapper, 2 * 1024 * 1024)
        val extra = when (action) {
            "draft" -> setOf("entries")
            "preview", "publish" -> setOf("restore_version")
            "discard" -> emptySet()
            else -> BondRules.invalid("未知目录操作")
        }
        BondRules.fields(node, extra + "expected_revision")
        val revision = BondRules.revision(node)
        val restore = node["restore_version"]?.takeUnless { it.isNull }?.let { BondRules.text(node, "restore_version") }
        return result(
            when (action) {
                "draft" -> catalog.save(game, revision, catalog.decode(node.path("entries"), game))
                "preview" -> catalog.preview(game, revision, restore)
                "publish" -> catalog.publish(game, revision, actor, restore)
                else -> catalog.discard(game, revision)
            },
        )
    }
    private fun result(value: Any) = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(success(value))
}
