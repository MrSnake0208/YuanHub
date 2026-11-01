package com.lhs.share.hub.service.star

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Temporary uploads are deliberately separate from the formal capture/pending store. */
interface StarCaptureUploadSessionStore {
    fun find(key: StarCaptureKey): StarCaptureUploadSession?
    fun create(session: StarCaptureUploadSession, ttlSeconds: Long): Boolean
    fun image(key: StarCaptureKey, sourceImageId: String): StoredStarCaptureImage?

    /** 1 = inserted, 0 = already uploaded, -1 = expired session. */
    fun putImage(key: StarCaptureKey, image: StoredStarCaptureImage): Long
    fun dueCleanup(now: Instant): List<StarCaptureUploadCleanupRecord>
    fun claimCleanup(record: StarCaptureUploadCleanupRecord): Boolean
    fun completeCleanup(record: StarCaptureUploadCleanupRecord)
}

data class StarCaptureUploadSession(
    val key: StarCaptureKey,
    val rawManifest: String,
    val manifest: StarCaptureManifest,
    val directory: String,
    val expiresAt: Instant,
)

data class StarCaptureUploadCleanup(
    val key: StarCaptureKey,
    val directory: String,
    val sourceImageIds: List<String>,
)

/**
 * 到期索引成员原样带回, 回收时用它精确 ZREM; 与 [StarCaptureUploadCleanup.directory] 一起构成目录代际。
 *
 * 同一个 captureId 的旧会话到期后, 客户端会立刻重试并建立新会话, 而旧条目仍可能留在清理者
 * 手中的快照里, 所以删键前必须比对代际 — 与 [StarCaptureStateStore] 的 claim 语义保持一致。
 */
data class StarCaptureUploadCleanupRecord(
    val redisMember: String,
    val entry: StarCaptureUploadCleanup,
)

@Component
class RedisStarCaptureUploadSessionStore(
    private val redis: StringRedisTemplate,
    private val objectMapper: ObjectMapper,
) : StarCaptureUploadSessionStore {
    override fun find(key: StarCaptureKey): StarCaptureUploadSession? =
        redis.opsForValue()[sessionKey(key)]?.let { objectMapper.readValue(it, StarCaptureUploadSession::class.java) }

    override fun create(session: StarCaptureUploadSession, ttlSeconds: Long): Boolean {
        val cleanup = StarCaptureUploadCleanup(session.key, session.directory, session.manifest.images.map { it.sourceImageId })
        return redis.execute(
            CREATE,
            listOf(sessionKey(session.key), EXPIRY_INDEX),
            objectMapper.writeValueAsString(session),
            ttlSeconds.coerceAtLeast(1).toString(),
            objectMapper.writeValueAsString(cleanup),
            session.expiresAt.toEpochMilli().toString(),
        ) == 1L
    }

    override fun image(key: StarCaptureKey, sourceImageId: String): StoredStarCaptureImage? =
        redis.opsForValue()[imageKey(key, sourceImageId)]?.let { objectMapper.readValue(it, StoredStarCaptureImage::class.java) }

    override fun putImage(key: StarCaptureKey, image: StoredStarCaptureImage): Long = redis.execute(
        PUT_IMAGE,
        listOf(sessionKey(key), imageKey(key, image.sourceImageId)),
        objectMapper.writeValueAsString(image),
    ) ?: -1L

    override fun dueCleanup(now: Instant): List<StarCaptureUploadCleanupRecord> =
        redis.opsForZSet().rangeByScore(EXPIRY_INDEX, 0.0, now.toEpochMilli().toDouble(), 0, 200).orEmpty()
            .map { StarCaptureUploadCleanupRecord(it, objectMapper.readValue(it, StarCaptureUploadCleanup::class.java)) }

    override fun claimCleanup(record: StarCaptureUploadCleanupRecord): Boolean = java.lang.Boolean.TRUE ==
        redis.opsForValue().setIfAbsent(
            cleanupLockKey(record.entry.key),
            record.entry.directory,
            CLEANUP_LOCK_SECONDS,
            TimeUnit.SECONDS,
        )

    override fun completeCleanup(record: StarCaptureUploadCleanupRecord) {
        val current = find(record.entry.key)
        if (current == null || current.directory == record.entry.directory) {
            redis.delete(listOf(sessionKey(record.entry.key)) + record.entry.sourceImageIds.map { imageKey(record.entry.key, it) })
        }
        redis.opsForZSet().remove(EXPIRY_INDEX, record.redisMember)
        redis.delete(cleanupLockKey(record.entry.key))
    }

    private fun sessionKey(key: StarCaptureKey) = "star-capture:upload:v1:${key.userId}:${key.accountId}:${key.captureId}"
    private fun imageKey(key: StarCaptureKey, sourceImageId: String) = "${sessionKey(key)}:image:$sourceImageId"
    private fun cleanupLockKey(key: StarCaptureKey) = "star-capture:upload-cleanup-lock:v1:${key.userId}:${key.accountId}:${key.captureId}"

    private companion object {
        const val EXPIRY_INDEX = "star-capture:upload-expiry:v1"
        const val CLEANUP_LOCK_SECONDS = 60L

        /**
         * 索引先于会话键写入: 抢占失败时移除自己那条成员, 不覆盖赢家的条目;
         * 任何一半失败后残留的形态(有成员无会话)都能被下一次清理自行收尾。
         */
        val CREATE = DefaultRedisScript(
            """
            redis.call('ZADD', KEYS[2], ARGV[4], ARGV[3])
            if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) then
                return 1
            end
            redis.call('ZREM', KEYS[2], ARGV[3])
            return 0
            """.trimIndent(),
            Long::class.javaObjectType,
        )
        val PUT_IMAGE = DefaultRedisScript(
            """
            local ttl = redis.call('PTTL', KEYS[1])
            if ttl <= 0 then return -1 end
            if redis.call('SET', KEYS[2], ARGV[1], 'NX', 'PX', ttl) then return 1 end
            return 0
            """.trimIndent(),
            Long::class.javaObjectType,
        )
    }
}
