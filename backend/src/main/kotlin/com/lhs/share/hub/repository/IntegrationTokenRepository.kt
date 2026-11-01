package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.IntegrationToken
import org.springframework.data.mongodb.repository.MongoRepository
import org.springframework.data.mongodb.repository.Query
import org.springframework.data.mongodb.repository.Update
import java.time.Instant

/** HubBackend repository for platform integration credentials. */
interface IntegrationTokenRepository : MongoRepository<IntegrationToken, String> {
    fun findByTokenHash(tokenHash: String): IntegrationToken?

    fun findByIdAndOwnerUserId(id: String, ownerUserId: String): IntegrationToken?

    fun findByOwnerUserIdOrderByCreatedAtDesc(ownerUserId: String): List<IntegrationToken>

    @Query("{ '_id': ?0 }")
    @Update("{ '\$set': { 'lastUsedAt': ?1 } }")
    fun touchLastUsedAt(id: String, lastUsedAt: Instant)
}
