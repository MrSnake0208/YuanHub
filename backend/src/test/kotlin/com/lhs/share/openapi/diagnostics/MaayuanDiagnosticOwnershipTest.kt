package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.hub.repository.entity.FeedbackDiagnosticSummary
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticEvent
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticImage
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticIssue
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.openapi.OpenApiPrincipal
import com.mongodb.client.result.UpdateResult
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import org.bson.Document
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.core.io.ByteArrayResource
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Update
import java.time.Instant

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

    private fun asset(id: String, status: String = "ready") = MediaAsset(
        id = id, ownerUserId = "user", originalName = id, mime = "application/json", size = 1, storagePath = id,
        privateStorage = true, diagnosticExpiresAt = now.plusSeconds(3600), status = status,
    )
}
