package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.IntegrationExceptionHandler
import com.lhs.share.hub.repository.entity.FeedbackDiagnosticSummary
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticEvent
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticImage
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticIssue
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticLog
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.report.FeedbackAccessService
import com.lhs.share.hub.service.report.FeedbackArea
import com.lhs.share.openapi.OpenApiPrincipal
import com.mongodb.client.result.UpdateResult
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.bson.Document
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.core.io.ByteArrayResource
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Update
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.server.ResponseStatusException
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.util.stream.Stream
import java.util.zip.GZIPOutputStream

class MaayuanDiagnosticOwnershipTest {
    private val mapper = jacksonObjectMapper()
    private val parser = MaayuanDiagnosticParser(mapper)
    private val now = Instant.now()

    @Test
    fun `operator groups replace mixed historical IDs with only their own subject`() {
        val manifest = parser.parse(diagnosticManifest()).copy(
            issues = listOf(DiagnosticIssue("data_review", "disc", operatorIds = listOf("char_a", "char_b"))),
        )
        val mongo = mockk<MongoTemplate>()
        val updates = mutableListOf<Update>()
        every { mongo.findById(any(), MaayuanDiagnosticIssue::class.java) } returns MaayuanDiagnosticIssue(
            "old", "old", "data_review", "data_review", "operator", "char_a",
            firstSeenAt = now, lastSeenAt = now, latestEventId = "old", operatorIds = listOf("char_a", "char_b"),
        )
        every { mongo.upsert(any(), capture(updates), MaayuanDiagnosticIssue::class.java) } returns UpdateResult.acknowledged(1, 1, null)
        every { mongo.insert(any<MaayuanDiagnosticEvent>()) } answers { firstArg() }

        MaayuanDiagnosticIssueRecorder(mongo).record(OpenApiPrincipal("user", "account"), manifest, listOf(asset("manifest")), now)

        assertEquals(
            listOf(listOf("char_a"), listOf("char_b")),
            updates.map { it.updateObject.get("\$set", Document::class.java)["operatorIds"] },
        )
    }

    @Test
    fun `shared recorder preserves owners for ready and pending uploads including unknown identity`() {
        val original = parser.parse(diagnosticManifest())
        val manifest = original.copy(images = original.images + original.images.single().copy(index = 1, operatorId = null))
        for (status in listOf("ready", "pending")) {
            val mongo = mockk<MongoTemplate>()
            val saved = slot<MaayuanDiagnosticEvent>()
            every { mongo.findById(any(), MaayuanDiagnosticIssue::class.java) } returns null
            every { mongo.upsert(any(), any<Update>(), MaayuanDiagnosticIssue::class.java) } returns UpdateResult.acknowledged(1, 1, null)
            every { mongo.insert(capture(saved)) } answers { firstArg() }

            MaayuanDiagnosticIssueRecorder(mongo).record(
                OpenApiPrincipal("user", "account"),
                manifest,
                listOf(asset("manifest"), asset("image", status), asset("unknown", status)),
                now,
            )

            assertEquals(listOf("char_test", null), saved.captured.images.map { it.operatorId })
            assertEquals(listOf(status, status), saved.captured.images.map { it.status })
        }
    }

    @Test
    fun `event responses backfill missing owners from manifest without changing the stored event`() {
        val manifest = parser.parse(diagnosticManifest())
        val json = parser.bytes(
            manifest.copy(
                images = listOf(
                    manifest.images.single(),
                    manifest.images.single().copy(index = 1, operatorId = "char_b"),
                    manifest.images.single().copy(index = 2, operatorId = null),
                ),
            ),
        )
        val stored = MaayuanDiagnosticEvent(
            manifest.eventId,
            "user",
            "account",
            now,
            FeedbackDiagnosticSummary("operator_info_collection", "failed", emptyList(), listOf("char_test", "char_b"), "1"),
            "manifest",
            listOf(
                MaayuanDiagnosticImage("new", "disc_cells", operatorId = "char_saved"),
                MaayuanDiagnosticImage("legacy", "name_area"),
                MaayuanDiagnosticImage("unknown", "name_area"),
            ),
            emptyList(),
        )
        val mongo = mockk<MongoTemplate>()
        val media = mockk<MediaStorageService>()
        val manifestAsset = asset("manifest").copy(diagnosticEventId = stored.id)
        every { mongo.findById(stored.id, MaayuanDiagnosticEvent::class.java) } returns stored
        every { mongo.findById(any(), MediaAsset::class.java) } answers { if (firstArg<String>() == "manifest") manifestAsset else null }
        every { media.loadAuthorizedAsset(manifestAsset) } returns ByteArrayResource(json)
        val service = MaayuanDiagnosticCenterService(mongo, mockk(), mockk(), media, mapper)

        for (includeUrls in listOf(false, true)) {
            val response = service.event(stored.id, includeUrls)
            assertEquals(listOf("char_saved", "char_b", null), response.images.map { it.operatorId })
            val snakeJson = mapper.copy().setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
                .valueToTree<JsonNode>(response.images)
            assertEquals("char_b", snakeJson.at("/1/operator_id").asText())
        }
        assertNull(stored.images[1].operatorId)
    }

    @Test
    fun `intents combine image and log quotas and reserve neither upload when storage is full`() {
        val mongo = mockk<MongoTemplate>(relaxed = true)
        val media = mockk<MediaStorageService>(relaxed = true)
        val quotas = mockk<MaayuanDiagnosticQuota>(relaxed = true)
        val events = mutableListOf<MaayuanDiagnosticEvent>()
        val principal = OpenApiPrincipal("user", "account")
        val manifest = parser.parse(diagnosticManifest())
        val image = asset("image", "pending").copy(mime = "image/jpeg", kind = MediaKind.IMAGE)
        val log = logAsset(manifest.eventId, gzip("运行完成".toByteArray()))
        every { mongo.exists(any(), DiagnosticEventReceipt::class.java) } returns false
        every { mongo.findById(any(), MaayuanDiagnosticIssue::class.java) } returns null
        every { mongo.insert(capture(events)) } answers { firstArg() }
        every { mongo.findAndModify(any(), any<Update>(), any<FindAndModifyOptions>(), DiagnosticStorageBudget::class.java) } returns
            DiagnosticStorageBudget(bytes = 100)
        every { media.cosStorage.enabled } returns true
        every { media.cosStorage.putUrlTtlSeconds } returns 600
        every { media.cosStorage.presignPut(any(), any()) } returns "https://signed"
        every { media.upload(any(), any(), any(), any(), any()) } returns asset("manifest")
        every { media.createPendingDiagnosticImage(any(), any(), any(), any()) } returns image
        every { media.createPendingDiagnosticLog(any(), any(), any(), any()) } returns log
        val service = ingestion(mongo, media, quotas)
        val intent = mapper.createObjectNode().apply {
            set<JsonNode>("manifest", mapper.readTree(parser.bytes(manifest)))
            putArray("uploads").addObject().put("size", 100).put("content_md5", "AAAAAAAAAAAAAAAAAAAAAA==")
        }
        val old = service.intents(principal, mapper.writeValueAsBytes(intent))
        assertNull(old.logUpload)
        assertNull(events.last().log)
        intent.putObject("log").put("size", log.size).put("content_md5", "AAAAAAAAAAAAAAAAAAAAAA==")
        val receipt = service.intents(principal, mapper.writeValueAsBytes(intent))
        assertEquals("application/gzip", receipt.logUpload?.headers?.get("Content-Type"))
        assertEquals(log.size.toString(), receipt.logUpload?.headers?.get("Content-Length"))
        assertEquals("AAAAAAAAAAAAAAAAAAAAAA==", receipt.logUpload?.headers?.get("Content-MD5"))
        assertEquals(MaayuanDiagnosticLog("log", "pending", log.size), events.last().log)
        assertEquals(listOf("image"), events.last().images.map { it.assetId })
        verify { quotas.packet(principal, 100, any()) }
        verify { quotas.packet(principal, 100 + log.size, any()) }
        every { mongo.findAndModify(any(), any<Update>(), any<FindAndModifyOptions>(), DiagnosticStorageBudget::class.java) } returns null
        val refused = service.intents(principal, mapper.writeValueAsBytes(intent))
        assertEquals("accepted_without_images", refused.status)
        assertTrue(refused.uploads.isEmpty())
        assertNull(refused.logUpload)
        assertNull(events.last().log)
        verify(exactly = 1) { media.createPendingDiagnosticLog(any(), any(), any(), any()) }
        verify {
            mongo.findAndModify(
                match { it.queryObject.get("bytes", Document::class.java)["\$lte"] == DIAGNOSTIC_IMAGE_LIMIT - 100 - log.size },
                any<Update>(),
                any<FindAndModifyOptions>(),
                DiagnosticStorageBudget::class.java,
            )
        }
    }

    @Test
    fun `log only completion validates gzip UTF8 and bounded expansion and releases invalid or missing reservations once`() {
        val good = gzip("运行完成\n".toByteArray())
        val cases = listOf(
            "ready" to good,
            "invalid" to gzip(ByteArray(DIAGNOSTIC_LOG_TEXT_LIMIT + 1) { 65 }),
            "invalid" to gzip(byteArrayOf(0xc3.toByte(), 0x28)),
            "invalid" to byteArrayOf(1, 2, 3),
            "missing" to null,
        )
        for ((expected, bytes) in cases) {
            val mongo = mockk<MongoTemplate>(relaxed = true)
            val media = mockk<MediaStorageService>(relaxed = true)
            val cos = media.cosStorage
            var event = logEvent()
            var stored = logAsset(event.id, bytes ?: good)
            event = event.copy(log = event.log!!.copy(size = stored.size))
            val updates = mutableListOf<Update>()
            every { mongo.findById(event.id, MaayuanDiagnosticEvent::class.java) } answers { event }
            every { mongo.findById("manifest", MediaAsset::class.java) } returns asset("manifest").copy(diagnosticEventId = event.id)
            every { mongo.findById("log", MediaAsset::class.java) } answers { stored }
            every { media.loadAuthorizedAsset(any()) } returns ByteArrayResource(diagnosticManifest(event.id, withImage = false))
            every { cos.headSize(stored.storagePath) } returns bytes?.size?.toLong()
            every { cos.load(stored.storagePath) } returns ByteArrayResource(bytes ?: good)
            every { mongo.findAndModify(any(), any<Update>(), MediaAsset::class.java) } answers {
                val previous = stored
                stored = stored.copy(status = secondArg<Update>().updateObject.get("\$set", Document::class.java).getString("status"))
                previous
            }
            every { mongo.updateFirst(any(), any<Update>(), MaayuanDiagnosticEvent::class.java) } answers {
                val state = secondArg<Update>().updateObject.get("\$set", Document::class.java).getString("log.status")
                event = event.copy(log = event.log!!.copy(status = state))
                UpdateResult.acknowledged(1, 1, null)
            }
            every { mongo.updateFirst(any(), capture(updates), DiagnosticStorageBudget::class.java) } returns
                UpdateResult.acknowledged(1, 1, null)
            val service = ingestion(mongo, media)
            repeat(2) {
                val result = service.complete(OpenApiPrincipal("user", "account"), event.id, "{}".toByteArray())
                assertTrue(result.images.isEmpty())
                assertEquals(expected, result.log?.status)
            }
            assertEquals(expected, stored.status)
            assertEquals(if (expected == "ready") 0 else 1, updates.size)
            if (updates.isNotEmpty()) assertEquals(-stored.size, updates.single().updateObject.get("\$inc", Document::class.java)["bytes"])
            verify(exactly = if (expected == "invalid") 1 else 0) { cos.delete(stored.storagePath) }
        }
        assertEquals("A".repeat(DIAGNOSTIC_LOG_TEXT_LIMIT), decodeDiagnosticLog(gzip(ByteArray(DIAGNOSTIC_LOG_TEXT_LIMIT) { 65 })))
    }

    @Test
    fun `other users accounts and mismatched log assets cannot complete the upload`() {
        val mongo = mockk<MongoTemplate>()
        val media = mockk<MediaStorageService>()
        val event = logEvent()
        every { mongo.findById(event.id, MaayuanDiagnosticEvent::class.java) } returns event
        val service = ingestion(mongo, media)
        for (principal in listOf(OpenApiPrincipal("other", "account"), OpenApiPrincipal("user", "other"))) {
            val error = assertThrows(ResponseStatusException::class.java) {
                service.complete(principal, event.id, "{}".toByteArray())
            }
            assertEquals(404, error.statusCode.value())
        }
        val log = logAsset(event.id, gzip("test".toByteArray()))
        every { mongo.findById("manifest", MediaAsset::class.java) } returns asset("manifest").copy(diagnosticEventId = event.id)
        every { media.loadAuthorizedAsset(any()) } returns ByteArrayResource(diagnosticManifest(event.id, withImage = false))
        val invalidAssets = listOf(log.copy(ownerUserId = "other"), log.copy(diagnosticEventId = "other"), log.copy(privateStorage = false))
        for (invalid in invalidAssets) {
            every { mongo.findById("log", MediaAsset::class.java) } returns invalid
            val error = assertThrows(ResponseStatusException::class.java) {
                service.complete(OpenApiPrincipal("user", "account"), event.id, "{}".toByteArray())
            }
            assertEquals(404, error.statusCode.value())
        }
        verify(exactly = 0) { media.cosStorage }
    }

    @Test
    fun `admin log endpoint returns UTF8 text and rejects unavailable expired and mismatched logs with HTTP 404`() {
        val bytes = gzip("运行日志\n".toByteArray())
        val log = logAsset("event", bytes).copy(status = "ready")
        var event = logEvent("event").copy(log = MaayuanDiagnosticLog("log", "ready", log.size))
        val mongo = mockk<MongoTemplate>()
        val media = mockk<MediaStorageService>()
        val access = mockk<FeedbackAccessService>()
        val helper = mockk<AuthenticationHelper>()
        every { helper.requireUserId() } returns "admin"
        every { access.operatorAreas("admin") } returns setOf(FeedbackArea.MAAYUAN)
        every { mongo.findById(event.id, MaayuanDiagnosticEvent::class.java) } answers { event }
        every { mongo.findById("log", MediaAsset::class.java) } returns log
        every { media.loadAuthorizedAsset(log) } returns ByteArrayResource(bytes)
        val manifest = asset("manifest").copy(diagnosticEventId = event.id)
        every { mongo.findById("manifest", MediaAsset::class.java) } returns manifest
        every { media.loadAuthorizedAsset(manifest) } returns ByteArrayResource(diagnosticManifest(withImage = false))
        val center = MaayuanDiagnosticCenterService(mongo, access, mockk(), media, mapper)
        assertEquals(DiagnosticEventLog("log", "ready", log.size, false), center.event(event.id, includeTrace = true).log)
        assertNull(center.event(event.id).log)
        val mvc = MockMvcBuilders.standaloneSetup(AdminMaayuanDiagnosticController(center, helper))
            .setControllerAdvice(IntegrationExceptionHandler()).build()
        mvc.perform(get("/v1/admin/maayuan-diagnostics/events/event/log")).andExpect(status().isOk)
            .andExpect(content().contentType("text/plain;charset=UTF-8"))
            .andExpect(content().string("运行日志\n"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
        val unavailable = listOf(
            null,
            log.copy(status = "pending"),
            log.copy(status = "invalid"),
            log.copy(status = "missing"),
            log.copy(diagnosticExpiresAt = now.minusSeconds(1)),
            log.copy(ownerUserId = "other"),
            log.copy(diagnosticEventId = "other"),
            log.copy(privateStorage = false),
        )
        for (asset in unavailable) {
            every { mongo.findById("log", MediaAsset::class.java) } returns asset
            mvc.perform(get("/v1/admin/maayuan-diagnostics/events/event/log")).andExpect(status().isNotFound)
        }
        every { mongo.findById("log", MediaAsset::class.java) } returns null
        assertTrue(center.event(event.id, includeTrace = true).log!!.expired)
        event = event.copy(log = null)
        mvc.perform(get("/v1/admin/maayuan-diagnostics/events/event/log")).andExpect(status().isNotFound)
        every { access.operatorAreas("admin") } returns emptySet()
        mvc.perform(get("/v1/admin/maayuan-diagnostics/events/event/log")).andExpect(status().isForbidden)
        verify(exactly = 1) { media.loadAuthorizedAsset(log) }
    }

    @Test
    fun `retention releases pending and ready log budgets but never releases invalid or missing twice`() {
        for (state in listOf("pending", "ready", "invalid", "missing")) {
            val mongo = mockk<MongoTemplate>(relaxed = true)
            val media = mockk<MediaStorageService>(relaxed = true)
            val asset = logAsset("event", gzip("test".toByteArray())).copy(status = state, diagnosticExpiresAt = now.minusSeconds(1))
            every { mongo.stream(any(), MediaAsset::class.java) } answers { Stream.of(asset) }
            every { mongo.stream(any(), MaayuanDiagnosticEvent::class.java) } answers { Stream.empty() }
            every { mongo.stream(any(), com.lhs.share.hub.repository.entity.FeedbackTicket::class.java) } answers { Stream.empty() }
            every { mongo.exists(any(), MediaAsset::class.java) } returns true
            every { mongo.findAndRemove(any(), MediaAsset::class.java) } returns asset
            ingestion(mongo, media).cleanupAt(now)
            verify(exactly = 1) { media.deletePrivateFile(asset) }
            verify(exactly = if (state in listOf("pending", "ready")) 1 else 0) {
                mongo.updateFirst(
                    any(),
                    match<Update> { it.updateObject.get("\$inc", Document::class.java)["bytes"] == -asset.size },
                    DiagnosticStorageBudget::class.java,
                )
            }
        }
    }

    private fun ingestion(mongo: MongoTemplate, media: MediaStorageService, quotas: MaayuanDiagnosticQuota = mockk(relaxed = true)) =
        MaayuanDiagnosticService(parser, quotas, media, MaayuanDiagnosticIssueRecorder(mongo), mongo, mockk(relaxed = true))

    private fun logEvent(id: String = "00000000-0000-0000-0000-000000000002") = MaayuanDiagnosticEvent(
        id,
        "user",
        "account",
        now,
        FeedbackDiagnosticSummary("operator_info_collection", "failed", emptyList(), emptyList(), "1"),
        "manifest",
        emptyList(),
        emptyList(),
        log = MaayuanDiagnosticLog("log", "pending", 1),
    )

    private fun logAsset(eventId: String, bytes: ByteArray) = asset("log", "pending").copy(
        mime = "application/gzip",
        kind = MediaKind.FILE,
        diagnosticEventId = eventId,
        storageBackend = "cos",
        size = bytes.size.toLong(),
        storagePath = "diagnostics/logs/log.log.gz",
    )

    private fun gzip(bytes: ByteArray): ByteArray = ByteArrayOutputStream().use { output ->
        GZIPOutputStream(output).use { it.write(bytes) }
        output.toByteArray()
    }

    private fun asset(id: String, status: String = "ready") = MediaAsset(
        id = id, ownerUserId = "user", originalName = id, mime = "application/json", size = 1, storagePath = id,
        privateStorage = true, diagnosticExpiresAt = now.plusSeconds(3600), status = status,
    )
}
