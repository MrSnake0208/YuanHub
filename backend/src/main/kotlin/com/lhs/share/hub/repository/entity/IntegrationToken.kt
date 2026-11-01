package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * Machine/integration credential for platform-level automation.
 *
 * Unlike OpenApiToken this credential is not bound to a game sub-account. The
 * plaintext secret is never persisted; only [tokenHash] is stored.
 */
@Document("integration_tokens")
data class IntegrationToken(
    @Id
    val id: String,
    @Indexed
    val ownerUserId: String,
    val name: String,
    @Indexed(unique = true)
    val tokenHash: String,
    val scopes: Set<String>,
    val feedbackAreas: Set<String>? = null,
    val enabled: Boolean = true,
    val createdAt: Instant = Instant.now(),
    val expiresAt: Instant? = null,
    val lastUsedAt: Instant? = null,
    val revokedAt: Instant? = null,
) : Serializable
