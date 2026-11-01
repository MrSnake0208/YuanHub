package com.lhs.share.hub.service.bond

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.repository.entity.SubAccount
import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

data class BondImportRequest(
    val accountId: String,
    val document: JsonNode,
    val strategy: String = "merge",
    val sourceAccount: String? = null,
    val sourceGame: String? = null,
    val expectedRevision: Long? = null,
    val catalogVersion: String? = null,
    val previewToken: String? = null,
    val skipUnknown: Boolean = false,
)

@Component
class BondImportPreviews {
    private data class Binding(
        val user: String,
        val account: String,
        val game: String,
        val revision: Long,
        val catalog: String,
        val strategy: String,
        val source: String?,
        val sourceGame: String?,
        val digest: String,
        val expires: Instant,
    )

    // shortcut: 预览只在本进程保留10分钟，多实例时改为共享预览存储或粘性路由。
    private val bindings = LinkedHashMap<String, Binding>()

    @Synchronized
    fun issue(owner: SubAccount, request: BondImportRequest, revision: Long, catalog: String): String {
        bindings.entries.removeIf {
            !it.value.expires.isAfter(Instant.now()) ||
                it.value.user == owner.userId && it.value.account == owner.accountId
        }
        if (bindings.size >= 512) bindings.remove(bindings.keys.first())
        val token = "bond_preview_${UUID.randomUUID()}"
        bindings[token] = Binding(
            owner.userId, owner.accountId, owner.game, revision, catalog, request.strategy,
            request.sourceAccount, request.sourceGame, digest(request.document), Instant.now().plusSeconds(600),
        )
        return token
    }

    @Synchronized
    fun requireMatch(owner: SubAccount, request: BondImportRequest) {
        val value = bindings[request.previewToken]
        if (value == null || !value.expires.isAfter(Instant.now()) || value.user != owner.userId || value.account != owner.accountId ||
            value.game != owner.game || value.revision != request.expectedRevision || value.catalog != request.catalogVersion ||
            value.strategy != request.strategy || value.source != request.sourceAccount || value.sourceGame != request.sourceGame ||
            value.digest != digest(request.document)
        ) {
            BondRules.conflict("预览已过期或文件、来源、账号、策略已变化，请重新预览")
        }
    }

    @Synchronized
    fun deleteAccount(userId: String, accountId: String) {
        bindings.entries.removeIf { it.value.user == userId && it.value.account == accountId }
    }

    // 摘要替代缓存最多8MiB私人文件，并阻止确认时换文件。
    private fun digest(document: JsonNode) = MessageDigest.getInstance("SHA-256")
        .digest(document.toString().toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
