package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.Instant
import java.util.concurrent.TimeUnit

interface StarCaptureStateStore {
    fun find(key: StarCaptureKey): StoredStarCapture?

    /**
     * Atomically claims a capture id for its TTL. Returns false when another instance already owns it.
     */
    fun create(capture: StoredStarCapture, ttlSeconds: Long): Boolean

    fun latestPending(userId: String, accountId: String, now: Instant): StoredStarCapture?

    fun markConsumed(capture: StoredStarCapture): StoredStarCapture

    fun dueCleanup(now: Instant, limit: Long = 200): List<StarCaptureCleanupRecord>

    fun claimCleanup(record: StarCaptureCleanupRecord): Boolean

    fun completeCleanup(record: StarCaptureCleanupRecord)
}

data class StarCaptureKey(
    val userId: String,
    val accountId: String,
    val captureId: String,
)

data class StoredStarCaptureImage(
    val sourceImageId: String,
    val sourceOrder: Int,
    val fileName: String,
    val path: String,
)

data class StoredStarCapture(
    val key: StarCaptureKey,
    val manifest: StarCaptureManifest,
    val images: List<StoredStarCaptureImage>,
    val directory: String,
    val createdAt: Instant,
    val expiresAt: Instant,
    val consumed: Boolean = false,
) {
    fun toUploadResponse() = StarCaptureUploadResponse(manifest.captureId, manifest.section, manifest.images.size, createdAt)

    fun toPendingResponse() = StarCapturePendingResponse(manifest.captureId, manifest.section, manifest.images.size, createdAt, expiresAt)

    fun toManifestResponse() = StarCaptureManifestResponse(
        captureId = manifest.captureId,
        gameVersion = manifest.gameVersion,
        section = manifest.section,
        stopReason = manifest.stopReason,
        images = manifest.images,
        adjacentRelations = manifest.adjacentRelations,
        source = manifest.source,
        sections = manifest.sections,
    )
}

data class StarCaptureCleanupEntry(
    val key: StarCaptureKey,
    val directory: String,
)

data class StarCaptureCleanupRecord(
    val redisMember: String,
    val entry: StarCaptureCleanupEntry,
)

@Component
class RedisStarCaptureStateStore(
    private val redis: StringRedisTemplate,
    private val objectMapper: ObjectMapper,
) : StarCaptureStateStore {
    override fun find(key: StarCaptureKey): StoredStarCapture? {
        val json = redis.opsForValue()[metadataKey(key)] ?: return null
        return objectMapper.readValue(json, StoredStarCapture::class.java)
    }

    override fun create(capture: StoredStarCapture, ttlSeconds: Long): Boolean {
        val key = metadataKey(capture.key)
        val ttl = ttlSeconds.coerceAtLeast(1)
        val json = objectMapper.writeValueAsString(capture)
        val inserted = java.lang.Boolean.TRUE == redis.opsForValue().setIfAbsent(key, json, ttl, TimeUnit.SECONDS)
        if (!inserted) return false

        val cleanup = StarCaptureCleanupEntry(capture.key, capture.directory)
        val cleanupMember = objectMapper.writeValueAsString(cleanup)
        try {
            redis.opsForZSet().add(
                accountIndexKey(capture.key.userId, capture.key.accountId),
                capture.key.captureId,
                capture.createdAt.toEpochMilli().toDouble(),
            )
            redis.opsForZSet().add(EXPIRY_INDEX_KEY, cleanupMember, capture.expiresAt.toEpochMilli().toDouble())
        } catch (exception: Exception) {
            redis.delete(key)
            redis.opsForZSet().remove(accountIndexKey(capture.key.userId, capture.key.accountId), capture.key.captureId)
            redis.opsForZSet().remove(EXPIRY_INDEX_KEY, cleanupMember)
            throw exception
        }
        return true
    }

    override fun latestPending(userId: String, accountId: String, now: Instant): StoredStarCapture? {
        val indexKey = accountIndexKey(userId, accountId)
        val captureIds = redis.opsForZSet().reverseRange(indexKey, 0, 19).orEmpty()
        for (captureId in captureIds) {
            val key = StarCaptureKey(userId, accountId, captureId)
            val capture = find(key)
            if (capture == null || capture.consumed || !now.isBefore(capture.expiresAt)) {
                redis.opsForZSet().remove(indexKey, captureId)
                continue
            }
            return capture
        }
        return null
    }

    override fun markConsumed(capture: StoredStarCapture): StoredStarCapture {
        val key = metadataKey(capture.key)
        val updated = capture.copy(consumed = true)
        val ttlSeconds = redis.getExpire(key, TimeUnit.SECONDS)
        if (ttlSeconds > 0) {
            redis.opsForValue().set(key, objectMapper.writeValueAsString(updated), ttlSeconds, TimeUnit.SECONDS)
        }
        redis.opsForZSet().remove(accountIndexKey(capture.key.userId, capture.key.accountId), capture.key.captureId)
        return updated
    }

    override fun dueCleanup(now: Instant, limit: Long): List<StarCaptureCleanupRecord> {
        val members =
            redis.opsForZSet().rangeByScore(
                EXPIRY_INDEX_KEY,
                0.0,
                now.toEpochMilli().toDouble(),
                0,
                limit.coerceAtLeast(1),
            ).orEmpty()
        return members.map { member ->
            StarCaptureCleanupRecord(member, objectMapper.readValue(member, StarCaptureCleanupEntry::class.java))
        }
    }

    override fun claimCleanup(record: StarCaptureCleanupRecord): Boolean = java.lang.Boolean.TRUE ==
        redis.opsForValue().setIfAbsent(
            cleanupLockKey(record.entry.key),
            record.entry.directory,
            CLEANUP_LOCK_SECONDS,
            TimeUnit.SECONDS,
        )

    override fun completeCleanup(record: StarCaptureCleanupRecord) {
        val current = find(record.entry.key)
        if (current == null || current.directory == record.entry.directory) {
            redis.delete(metadataKey(record.entry.key))
            redis.opsForZSet().remove(
                accountIndexKey(record.entry.key.userId, record.entry.key.accountId),
                record.entry.key.captureId,
            )
        }
        redis.opsForZSet().remove(EXPIRY_INDEX_KEY, record.redisMember)
        redis.delete(cleanupLockKey(record.entry.key))
    }

    private fun metadataKey(key: StarCaptureKey): String = "$METADATA_PREFIX:${key.userId}:${key.accountId}:${key.captureId}"

    private fun accountIndexKey(userId: String, accountId: String): String = "$ACCOUNT_INDEX_PREFIX:$userId:$accountId"

    private fun cleanupLockKey(key: StarCaptureKey): String = "$CLEANUP_LOCK_PREFIX:${key.userId}:${key.accountId}:${key.captureId}"

    private companion object {
        const val METADATA_PREFIX = "star-capture:metadata:v1"
        const val ACCOUNT_INDEX_PREFIX = "star-capture:account:v1"
        const val EXPIRY_INDEX_KEY = "star-capture:expiry:v1"
        const val CLEANUP_LOCK_PREFIX = "star-capture:cleanup-lock:v1"
        const val CLEANUP_LOCK_SECONDS = 60L
    }
}
