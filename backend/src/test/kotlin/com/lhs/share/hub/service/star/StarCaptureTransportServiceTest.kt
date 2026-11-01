package com.lhs.share.hub.service.star

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.account.AccountEventService
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.inventory.InventoryApiException
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

class StarCaptureTransportServiceTest {
    @TempDir
    lateinit var temporaryDirectory: Path

    private val accountService = mockk<SubAccountService>()
    private val eventService = mockk<AccountEventService>(relaxed = true)
    private lateinit var stateStore: FakeStarCaptureStateStore
    private lateinit var uploadSessions: FakeStarCaptureUploadSessionStore
    private lateinit var service: StarCaptureTransportService

    @BeforeEach
    fun setUp() {
        every { accountService.requireAccount(any(), any()) } answers {
            SubAccount(userId = firstArg(), accountId = secondArg(), name = "账号")
        }
        val properties = ShareProperties().apply {
            starCapture.dir = temporaryDirectory.resolve("captures").toString()
            starCapture.ttlMinutes = 30
        }
        stateStore = FakeStarCaptureStateStore()
        uploadSessions = FakeStarCaptureUploadSessionStore()
        service = StarCaptureTransportService(jacksonObjectMapper(), properties, accountService, eventService, stateStore, uploadSessions)
    }

    @Test
    fun `init is private idempotent and rejects conflicting or incomplete manifests`() {
        assertEquals(4, service.initUpload("u1", "acc1", fullManifest()).imageCount)
        val session = uploadSessions.find(fullKey())!!
        service.initUpload("u1", "acc1", fullManifest())
        assertEquals(session, uploadSessions.find(fullKey()))
        assertEquals(null, service.pending("u1", "acc1"))
        assertThrows(InventoryApiException::class.java) { service.manifest("u1", "acc1", "capture-full") }
        assertThrows(InventoryApiException::class.java) { service.image("u1", "acc1", "capture-full", "capture-full:main:000") }
        assertEquals(
            409,
            assertThrows(InventoryApiException::class.java) {
                service.initUpload("u1", "acc1", fullManifest().replace("如鸢", "代号鸢"))
            }.status.value(),
        )
        assertEquals(
            422,
            assertThrows(InventoryApiException::class.java) {
                service.initUpload("u1", "acc1", fullManifest().replace("\"complete\":true", "\"complete\":false"))
            }.status.value(),
        )
        verify(exactly = 0) { eventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `single image is immutable idempotent and account scoped`() {
        service.initUpload("u1", "acc1", fullManifest())
        val file = fullFiles().first()
        repeat(2) { service.uploadImage("u1", "acc1", "capture-full", "capture-full:main:000", file) }
        val stored = uploadSessions.image(fullKey(), "capture-full:main:000")!!
        assertTrue(file.bytes.contentEquals(Files.readAllBytes(Path.of(stored.path))))
        assertEquals(1L, Files.list(Path.of(uploadSessions.find(fullKey())!!.directory)).use { it.count() })
        assertEquals(
            409,
            assertThrows(InventoryApiException::class.java) {
                service.uploadImage("u1", "acc1", "capture-full", "capture-full:main:000", fullFile("main-000.png", "changed"))
            }.status.value(),
        )
        assertThrows(InventoryApiException::class.java) {
            service.uploadImage("u2", "acc1", "capture-full", "capture-full:main:000", file)
        }
        assertThrows(InventoryApiException::class.java) {
            service.uploadImage("u1", "acc2", "capture-full", "capture-full:main:000", file)
        }
        assertEquals(null, service.pending("u1", "acc1"))
        verify(exactly = 0) { eventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `single image rejects unknown id wrong filename and invalid PNG`() {
        service.initUpload("u1", "acc1", fullManifest())
        for ((id, file) in listOf(
            "unknown" to fullFiles().first(),
            "capture-full:main:000" to fullFiles()[1],
            "capture-full:main:000" to MockMultipartFile("file", "main-000.png", "image/png", "invalid".toByteArray()),
        )) {
            assertEquals(
                422,
                assertThrows(InventoryApiException::class.java) {
                    service.uploadImage("u1", "acc1", "capture-full", id, file)
                }.status.value(),
            )
        }
        assertEquals(null, uploadSessions.image(fullKey(), "capture-full:main:000"))
    }

    @Test
    fun `interrupted file write never registers an image or leaves a partial file`() {
        service.initUpload("u1", "acc1", fullManifest())
        var reads = 0
        val file = object : MockMultipartFile("file", "main-000.png", "image/png", PNG_SIGNATURE + byteArrayOf(1)) {
            override fun getInputStream(): InputStream {
                if (++reads == 1) return super.getInputStream()
                return object : InputStream() {
                    override fun read(): Int = throw IOException("disconnected")
                }
            }
        }
        assertThrows(IOException::class.java) {
            service.uploadImage("u1", "acc1", "capture-full", "capture-full:main:000", file)
        }
        assertEquals(null, uploadSessions.image(fullKey(), "capture-full:main:000"))
        assertEquals(0L, Files.list(Path.of(uploadSessions.find(fullKey())!!.directory)).use { it.count() })
    }

    @Test
    fun `finalize missing images stays private and reports exactly the missing ids`() {
        service.initUpload("u1", "acc1", fullManifest())
        service.uploadImage("u1", "acc1", "capture-full", "capture-full:main:000", fullFiles().first())
        val result = service.finalizeUpload("u1", "acc1", "capture-full")
        assertEquals(null, result.capture)
        assertEquals(
            listOf("capture-full:main:001", "capture-full:support:000", "capture-full:experience:000"),
            result.missingSourceImageIds,
        )
        assertEquals(null, service.pending("u1", "acc1"))
        verify(exactly = 0) { eventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `finalize reuses the formal capture contract and duplicate finalize publishes once`() {
        uploadFullSession()
        val first = service.finalizeUpload("u1", "acc1", "capture-full").capture!!
        assertEquals(first, service.finalizeUpload("u1", "acc1", "capture-full").capture)
        assertEquals("capture-full", service.pending("u1", "acc1")!!.captureId)
        val expected = service.manifest("u1", "acc1", "capture-full")
        assertEquals("full", expected.section)
        assertEquals(listOf(1, 2, 3, 4), expected.images.map { it.sourceOrder })
        assertEquals(listOf("main", "support", "experience"), expected.sections!!.keys.toList())
        val sessionDirectory = uploadSessions.find(fullKey())!!.directory
        assertFalse(stateStore.find(fullKey())!!.directory == sessionDirectory)
        fullFiles().zip(expected.images).forEach { (file, image) ->
            assertTrue(file.bytes.contentEquals(service.image("u1", "acc1", "capture-full", image.sourceImageId).inputStream.readBytes()))
        }
        service.upload("u1", "acc2", fullManifest(), fullFiles())
        assertEquals(service.manifest("u1", "acc2", "capture-full"), expected)
        assertEquals(
            409,
            assertThrows(InventoryApiException::class.java) {
                service.uploadImage("u1", "acc1", "capture-full", "capture-full:main:000", fullFiles().first())
            }.status.value(),
        )
        assertThrows(InventoryApiException::class.java) { service.initUpload("u1", "acc1", fullManifest()) }
        verify(exactly = 1) { eventService.publish("u1", "acc1", any(), any(), any()) }
        repeat(2) { assertTrue(service.consume("u1", "acc1", "capture-full").consumed) }
        assertThrows(InventoryApiException::class.java) { service.finalizeUpload("u1", "acc1", "capture-full") }
        assertThrows(InventoryApiException::class.java) {
            service.uploadImage("u1", "acc1", "capture-full", "capture-full:main:000", fullFiles().first())
        }
        assertEquals(null, service.pending("u1", "acc1"))
    }

    @Test
    fun `session expiry deletes incomplete files and temporary files using the existing TTL`() {
        uploadFullSession()
        val session = uploadSessions.find(fullKey())!!
        Files.writeString(Path.of(session.directory).resolve("abandoned.part"), "partial")
        service.cleanupExpired(session.expiresAt.plusSeconds(1))
        assertFalse(Files.exists(Path.of(session.directory)))
        assertEquals(null, uploadSessions.find(fullKey()))
        assertEquals(null, uploadSessions.image(fullKey(), "capture-full:main:000"))
        assertEquals(null, service.pending("u1", "acc1"))
    }

    @Test
    fun `session cleanup cannot delete a finalized capture`() {
        uploadFullSession()
        service.finalizeUpload("u1", "acc1", "capture-full")
        val session = uploadSessions.find(fullKey())!!
        // Expire only the temporary session; formal capture has its own existing cleanup record.
        uploadSessions.expireAll()
        service.cleanupExpired()
        assertFalse(Files.exists(Path.of(session.directory)))
        assertTrue(service.image("u1", "acc1", "capture-full", "capture-full:main:000").exists())
        assertEquals("capture-full", service.finalizeUpload("u1", "acc1", "capture-full").capture!!.captureId)
    }

    @Test
    fun `ready publish failure does not roll back formal files and finalize retry stays idempotent`() {
        uploadFullSession()
        every { eventService.publish(any(), any(), any(), any(), any()) } throws IllegalStateException("SSE failure")
        assertEquals("capture-full", service.finalizeUpload("u1", "acc1", "capture-full").capture!!.captureId)
        assertEquals("capture-full", service.pending("u1", "acc1")!!.captureId)
        assertTrue(service.image("u1", "acc1", "capture-full", "capture-full:main:000").exists())
        service.finalizeUpload("u1", "acc1", "capture-full")
        verify(exactly = 1) { eventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `finalize losing the existing atomic capture claim returns the winner without deleting its files`() {
        uploadFullSession()
        stateStore.beforeCreate = {
            stateStore.beforeCreate = null
            service.upload("u1", "acc1", fullManifest(), fullFiles())
        }
        assertEquals("capture-full", service.finalizeUpload("u1", "acc1", "capture-full").capture!!.captureId)
        assertTrue(service.image("u1", "acc1", "capture-full", "capture-full:main:000").exists())
        assertEquals("capture-full", service.pending("u1", "acc1")!!.captureId)
        verify(exactly = 1) { eventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `stale expiry entry cannot delete a newer session for the same capture id`() {
        service.initUpload("u1", "acc1", fullManifest())
        val stale = uploadSessions.find(fullKey())!!
        // A retry of the same capture id replaces the expired session before the reader reaps the stale entry.
        uploadSessions.replaceWithEmptySession(fullKey())
        val current = uploadSessions.find(fullKey())!!
        assertFalse(stale.directory == current.directory)
        val staleRecord = StarCaptureUploadCleanupRecord(
            redisMember = "",
            entry = StarCaptureUploadCleanup(fullKey(), stale.directory, emptyList()),
        )
        assertTrue(uploadSessions.claimCleanup(staleRecord))
        uploadSessions.completeCleanup(staleRecord)
        assertTrue(uploadSessions.find(fullKey()) != null)
        service.uploadImage("u1", "acc1", "capture-full", "capture-full:main:000", fullFiles().first())
        assertEquals(3, service.finalizeUpload("u1", "acc1", "capture-full").missingSourceImageIds.size)
    }

    private fun fullKey() = StarCaptureKey("u1", "acc1", "capture-full")

    private fun uploadFullSession() {
        service.initUpload("u1", "acc1", fullManifest())
        fullFiles().zip(listOf("main:000", "main:001", "support:000", "experience:000")).forEach { (file, suffix) ->
            service.uploadImage("u1", "acc1", "capture-full", "capture-full:$suffix", file)
        }
    }

    @Test
    fun `upload keeps six PNGs private publishes a small account event and reads them only for the bound account`() {
        val event = slot<Any>()
        val upload = service.upload("u1", "acc1", manifest(), files())

        assertEquals("capture-a", upload.captureId)
        assertEquals(6, upload.imageCount)
        assertEquals("capture-a", service.pending("u1", "acc1")?.captureId)
        val loadedManifest = service.manifest("u1", "acc1", "capture-a")
        assertEquals(6, loadedManifest.images.size)
        assertEquals("overlap", loadedManifest.adjacentRelations.single().relation)
        assertTrue(
            service.image("u1", "acc1", "capture-a", "capture-a:main:000").inputStream.readBytes().decodeToString().endsWith("png-0"),
        )
        assertThrows(InventoryApiException::class.java) { service.manifest("u2", "acc1", "capture-a") }
        verify(exactly = 1) { eventService.publish("u1", "acc1", "star_capture_ready", any(), capture(event)) }
        val payload = event.captured as StarCaptureReadyEvent
        assertEquals("capture-a", payload.captureId)
        assertEquals(6, payload.imageCount)
        assertFalse(payload.toString().contains("png-0"))
    }

    @Test
    fun `same capture id is idempotent only for identical manifest and images`() {
        service.upload("u1", "acc1", manifest(), files())
        assertEquals("capture-a", service.upload("u1", "acc1", manifest(), files()).captureId)

        val error = assertThrows(InventoryApiException::class.java) {
            service.upload("u1", "acc1", manifest(), files(changeFirst = true))
        }
        assertEquals(409, error.status.value())
        verify(exactly = 1) { eventService.publish(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `full CaptureBatchV1 keeps all three sections, global order and account isolation`() {
        val event = slot<Any>()
        val upload = service.upload("u1", "acc1", fullManifest(), fullFiles())

        assertEquals("full", upload.section)
        assertEquals(4, upload.imageCount)
        val loaded = service.manifest("u1", "acc1", "capture-full")
        assertEquals("maayuan", loaded.source)
        assertEquals(listOf("main", "support", "experience"), loaded.sections!!.keys.toList())
        assertEquals(listOf(1, 2, 3, 4), loaded.images.map { it.sourceOrder })
        assertEquals("overlap", loaded.sections.getValue("main").adjacentRelations.single().relation)
        assertTrue(
            service.image(
                "u1",
                "acc1",
                "capture-full",
                "capture-full:support:000",
            ).inputStream.readBytes().decodeToString().endsWith("support"),
        )
        assertThrows(InventoryApiException::class.java) { service.manifest("u1", "acc2", "capture-full") }
        verify(exactly = 1) { eventService.publish("u1", "acc1", "star_capture_ready", any(), capture(event)) }
        val payload = event.captured as StarCaptureReadyEvent
        assertEquals("full", payload.section)
        assertEquals(4, payload.imageCount)
    }

    @Test
    fun `full CaptureBatchV1 rejects malformed experience and duplicate file names`() {
        assertInvalid(fullManifest().replace("\"stop_reason\":\"single_capture\"", "\"stop_reason\":\"bottom_no_move\""), fullFiles())
        assertInvalid(fullManifest().replace("support-000.png", "main-000.png"), fullFiles())
    }

    @Test
    fun `manifest rejects missing files duplicate ids invalid relations and traversal names`() {
        assertInvalid(manifest(), files().dropLast(1))
        assertInvalid(manifest(sourceIds = listOf("duplicate", "duplicate", "id2", "id3", "id4", "id5")), files())
        assertInvalid(manifest(relationPrevious = "unknown"), files())
        assertInvalid(
            manifest(
                fileNames = listOf(
                    "../capture-00.png",
                    "capture-01.png",
                    "capture-02.png",
                    "capture-03.png",
                    "capture-04.png",
                    "capture-05.png",
                ),
            ),
            files(),
        )
        assertInvalid(
            manifest(),
            files().toMutableList().also {
                it[0] =
                    MockMultipartFile("files", "capture-00.png", MediaType.IMAGE_PNG_VALUE, "not-a-png".toByteArray())
            },
        )
    }

    @Test
    fun `consume is idempotent deletes files and prevents later reads`() {
        service.upload("u1", "acc1", manifest(), files())
        assertTrue(service.consume("u1", "acc1", "capture-a").consumed)
        assertTrue(service.consume("u1", "acc1", "capture-a").consumed)
        assertThrows(InventoryApiException::class.java) { service.image("u1", "acc1", "capture-a", "capture-a:main:000") }
    }

    @Test
    fun `expired capture is removed by cleanup`() {
        service.upload("u1", "acc1", manifest(), files())
        service.cleanupExpired(Instant.now().plusSeconds(31 * 60))
        assertEquals(null, service.pending("u1", "acc1"))
    }

    private fun assertInvalid(manifest: String, files: List<MockMultipartFile>) {
        val error = assertThrows(InventoryApiException::class.java) { service.upload("u1", "acc1", manifest, files) }
        assertEquals(422, error.status.value())
    }

    private fun files(changeFirst: Boolean = false): List<MockMultipartFile> = (0..5).map { index ->
        MockMultipartFile(
            "files",
            "capture-${index.toString().padStart(2, '0')}.png",
            MediaType.IMAGE_PNG_VALUE,
            PNG_SIGNATURE + (if (changeFirst && index == 0) "different" else "png-$index").toByteArray(),
        )
    }

    private fun manifest(
        sourceIds: List<String> = (0..5).map { "capture-a:main:${it.toString().padStart(3, '0')}" },
        fileNames: List<String> = (0..5).map { "capture-${it.toString().padStart(2, '0')}.png" },
        relationPrevious: String = "capture-a:main:004",
    ): String = buildString {
        append(
            "{\"schema_version\":1,\"capture_id\":\"capture-a\",\"game_version\":\"如鸢\",\"section\":\"main\",\"stop_reason\":\"bottom_no_move\",\"images\":[",
        )
        sourceIds.forEachIndexed { index, sourceId ->
            if (index > 0) append(',')
            append(
                "{\"source_image_id\":\"",
            ).append(
                sourceId,
            ).append("\",\"source_order\":").append(index + 1).append(",\"file_name\":\"").append(fileNames[index]).append("\"}")
        }
        append(
            "],\"adjacent_relations\":[{\"previous_source_image_id\":\"",
        ).append(relationPrevious).append("\",\"current_source_image_id\":\"capture-a:main:005\",\"relation\":\"overlap\"}]}")
    }

    private fun fullFiles(): List<MockMultipartFile> = listOf(
        fullFile("main-000.png", "main-0"),
        fullFile("main-001.png", "main-1"),
        fullFile("support-000.png", "support"),
        fullFile("experience-000.png", "experience"),
    )

    private fun fullFile(name: String, contents: String) = MockMultipartFile(
        "files",
        name,
        MediaType.IMAGE_PNG_VALUE,
        PNG_SIGNATURE + contents.toByteArray(),
    )

    private fun fullManifest(): String = """
        {"schema_version":1,"capture_id":"capture-full","source":"maayuan","game_version":"如鸢","sections":{
          "main":{"images":[
            {"source_image_id":"capture-full:main:000","source_order":1,"file_name":"main-000.png"},
            {"source_image_id":"capture-full:main:001","source_order":2,"file_name":"main-001.png"}],
            "adjacent_relations":[{"previous_source_image_id":"capture-full:main:000","current_source_image_id":"capture-full:main:001","relation":"overlap"}],"complete":true,"stop_reason":"bottom_no_move"},
          "support":{"images":[{"source_image_id":"capture-full:support:000","source_order":3,"file_name":"support-000.png"}],"adjacent_relations":[],"complete":true,"stop_reason":"bottom_no_move"},
          "experience":{"images":[{"source_image_id":"capture-full:experience:000","source_order":4,"file_name":"experience-000.png"}],"adjacent_relations":[],"complete":true,"stop_reason":"single_capture"}}}
    """.trimIndent()

    companion object {
        private val PNG_SIGNATURE = byteArrayOf(
            0x89.toByte(),
            0x50,
            0x4E,
            0x47,
            0x0D,
            0x0A,
            0x1A,
            0x0A,
        )
    }
}

private class FakeStarCaptureStateStore : StarCaptureStateStore {
    private val captures = linkedMapOf<StarCaptureKey, StoredStarCapture>()
    var beforeCreate: (() -> Unit)? = null

    override fun find(key: StarCaptureKey): StoredStarCapture? = captures[key]

    override fun create(capture: StoredStarCapture, ttlSeconds: Long): Boolean {
        beforeCreate?.invoke()
        if (captures.containsKey(capture.key)) return false
        captures[capture.key] = capture
        return true
    }

    override fun latestPending(userId: String, accountId: String, now: Instant): StoredStarCapture? = captures.values
        .asSequence()
        .filter {
            it.key.userId == userId &&
                it.key.accountId == accountId &&
                !it.consumed &&
                now.isBefore(it.expiresAt)
        }
        .maxByOrNull { it.createdAt }

    override fun markConsumed(capture: StoredStarCapture): StoredStarCapture {
        val updated = capture.copy(consumed = true)
        captures[capture.key] = updated
        return updated
    }

    override fun dueCleanup(now: Instant, limit: Long): List<StarCaptureCleanupRecord> = captures.values
        .asSequence()
        .filter { !now.isBefore(it.expiresAt) }
        .take(limit.toInt())
        .map {
            StarCaptureCleanupRecord(
                redisMember = it.key.captureId,
                entry = StarCaptureCleanupEntry(it.key, it.directory),
            )
        }
        .toList()

    override fun claimCleanup(record: StarCaptureCleanupRecord): Boolean = true

    override fun completeCleanup(record: StarCaptureCleanupRecord) {
        val current = captures[record.entry.key]
        if (current == null || current.directory == record.entry.directory) captures.remove(record.entry.key)
    }
}

private class FakeStarCaptureUploadSessionStore : StarCaptureUploadSessionStore {
    private val sessions = linkedMapOf<StarCaptureKey, StarCaptureUploadSession>()
    private val images = linkedMapOf<Pair<StarCaptureKey, String>, StoredStarCaptureImage>()

    /** Mirrors the real expiry index: 条目独立于会话键存活, 直到被回收。 */
    private val index = linkedMapOf<StarCaptureUploadCleanupRecord, Instant>()
    private val locks = linkedSetOf<StarCaptureKey>()

    override fun find(key: StarCaptureKey): StarCaptureUploadSession? = sessions[key]
    override fun create(session: StarCaptureUploadSession, ttlSeconds: Long): Boolean {
        if (sessions.containsKey(session.key)) return false
        sessions[session.key] = session
        index[recordOf(session)] = session.expiresAt
        return true
    }

    override fun image(key: StarCaptureKey, sourceImageId: String): StoredStarCaptureImage? = images[key to sourceImageId]
    override fun putImage(key: StarCaptureKey, image: StoredStarCaptureImage): Long {
        val session = sessions[key] ?: return -1
        if (!Instant.now().isBefore(session.expiresAt)) return -1
        if (images.containsKey(key to image.sourceImageId)) return 0
        images[key to image.sourceImageId] = image
        return 1
    }

    override fun dueCleanup(now: Instant): List<StarCaptureUploadCleanupRecord> = index.filterValues { !now.isBefore(it) }.keys.toList()

    override fun claimCleanup(record: StarCaptureUploadCleanupRecord): Boolean = locks.add(record.entry.key)

    override fun completeCleanup(record: StarCaptureUploadCleanupRecord) {
        val current = sessions[record.entry.key]
        if (current == null || current.directory == record.entry.directory) {
            sessions.remove(record.entry.key)
            record.entry.sourceImageIds.forEach { images.remove(record.entry.key to it) }
        }
        index.remove(record)
        locks.remove(record.entry.key)
    }

    private fun recordOf(session: StarCaptureUploadSession) = StarCaptureUploadCleanupRecord(
        redisMember = "",
        entry = StarCaptureUploadCleanup(session.key, session.directory, session.manifest.images.map { it.sourceImageId }),
    )

    fun expireAll() {
        sessions.replaceAll { _, session -> session.copy(expiresAt = Instant.EPOCH) }
        index.replaceAll { _, _ -> Instant.EPOCH }
    }

    /** Same capture id, new directory: the previous generation's files are gone. */
    fun replaceWithEmptySession(key: StarCaptureKey) {
        val previous = sessions.getValue(key)
        sessions[key] = previous.copy(directory = previous.directory + "-next", expiresAt = Instant.now().plusSeconds(600))
        images.keys.removeIf { it.first == key }
        index.clear()
        index[recordOf(sessions.getValue(key))] = sessions.getValue(key).expiresAt
    }
}
