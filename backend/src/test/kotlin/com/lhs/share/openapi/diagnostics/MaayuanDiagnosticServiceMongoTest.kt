package com.lhs.share.openapi.diagnostics

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.repository.FeedbackDiagnosticFilter
import com.lhs.share.hub.repository.FeedbackDiagnosticPage
import com.lhs.share.hub.repository.FeedbackTicketQueryRepository
import com.lhs.share.hub.repository.FeedbackTicketRepository
import com.lhs.share.hub.repository.MediaAssetRepository
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.hub.service.notification.NotificationService
import com.lhs.share.hub.service.report.FeedbackPublicService
import com.lhs.share.hub.service.report.FeedbackReportService
import com.lhs.share.testinfra.TestMongo
import com.lhs.share.testinfra.TestRedis
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.data.domain.PageRequest
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.web.server.ResponseStatusException
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.Optional
import java.util.UUID
import javax.imageio.ImageIO
import javax.imageio.stream.MemoryCacheImageOutputStream

@Tag("integration")
class MaayuanDiagnosticServiceMongoTest {
    @TempDir
    lateinit var directory: Path

    private val database = TestMongo.database("maayuan_diag")
    private val client = TestMongo.client()
    private val mongo = MongoTemplate(client, database)
    private val redisFactory = TestRedis.connectionFactory()
    private val redis = TestRedis.template(redisFactory)
    private val quotas = MaayuanDiagnosticQuota(redis)
    private val tickets = mockk<FeedbackTicketRepository>()
    private val assets = mockk<MediaAssetRepository>()
    private val notifications = mockk<NotificationService>(relaxed = true)
    private val queries = FeedbackTicketQueryRepository(mongo)
    private val reports = FeedbackReportService(
        tickets, queries, mockk(relaxed = true), assets, notifications, mockk(relaxed = true), ShareProperties(),
        mockk(relaxed = true), mockk(relaxed = true),
    )
    private val principal = com.lhs.share.openapi.OpenApiPrincipal("user-${UUID.randomUUID()}", "account")
    private val event = UUID.randomUUID().toString()
    private val type = "multipart/form-data; boundary=diagnostic-test"

    init {
        every { assets.save(any()) } answers { mongo.insert(firstArg<MediaAsset>()) }
        every { assets.existsById(any()) } answers {
            mongo.exists(Query(Criteria.where("_id").`is`(firstArg<String>())), MediaAsset::class.java)
        }
        every { assets.findById(any()) } answers { Optional.ofNullable(mongo.findById(firstArg<String>(), MediaAsset::class.java)) }
        every { tickets.insert(any<FeedbackTicket>()) } answers { mongo.insert(firstArg<FeedbackTicket>()) }
        every { tickets.findById(any()) } answers { Optional.ofNullable(mongo.findById(firstArg<String>(), FeedbackTicket::class.java)) }
    }

    @AfterEach
    fun cleanup() {
        TestRedis.clearOwnedKeys(redis)
        redisFactory.destroy()
        TestMongo.dropDatabase(client, database)
        client.close()
    }

    @Test
    fun `a report is private reencoded and idempotent across users and payload retention`() {
        val service = service()
        val packet = packet(diagnosticManifest(event), listOf(jpegWithComment()))
        assertEquals("accepted", service.receive(principal, packet, type).status)
        assertEquals("duplicate", service.receive(principal, packet, type).status)
        val other = principal.copy(userId = "other-user")
        assertEquals("duplicate", service.receive(other, packet, type).status)
        val ticket = ticket()
        assertEquals(principal.userId, ticket.reporterUserId)
        assertEquals(principal.accountId, ticket.diagnosticAccountId)
        assertEquals(listOf("collector_exception"), ticket.diagnosticReport!!.issueCodes)
        assertFalse(ticket.publicConsent)
        assertEquals("PRIVATE", ticket.visibility)
        val stored = mongo.findAll(MediaAsset::class.java)
        assertEquals(2, stored.size)
        stored.forEach {
            assertTrue(it.privateStorage)
            assertFalse(Files.exists(directory.resolve("public").resolve(it.storagePath)))
            assertTrue(Files.exists(directory.resolve("private").resolve(it.storagePath)))
        }
        val image = stored.single { it.kind == MediaKind.IMAGE }
        val bytes = Files.readAllBytes(directory.resolve("private").resolve(image.storagePath))
        assertFalse(bytes.toString(Charsets.ISO_8859_1).contains("private-metadata"))
        assertEquals(4, ImageIO.read(bytes.inputStream()).width)
        verify(exactly = 0) { notifications.create(any(), any(), any(), any(), any(), any(), any()) }
        service.cleanupAt(Instant.now().plus(Duration.ofDays(91)))
        assertEquals(0, mongo.findAll(FeedbackTicket::class.java).size)
        assertEquals("duplicate", service.receive(principal, packet, type).status)
    }

    @Test
    fun `other users cannot read attachments and public feedback cannot expose diagnostic tickets`() {
        service().receive(principal, packet(diagnosticManifest(event), listOf(jpegWithComment())), type)
        val ticket = ticket()
        val mediaId = ticket.messages.first().images.first().id
        val denied = assertThrows(ApiResultException::class.java) { reports.getAttachment("unrelated-user", ticket.id!!, mediaId) }
        assertEquals(403, denied.statusCode)
        assertEquals(mediaId, reports.getAttachment(principal.userId, ticket.id!!, mediaId).id)
        val public = FeedbackPublicService(tickets, queries, mockk(), mockk(relaxed = true))
        assertEquals(404, assertThrows(ApiResultException::class.java) { public.getById(null, ticket.id!!) }.statusCode)
        assertEquals(0, queries.publicSearch(null, null, null, null, "latest", PageRequest.of(0, 20)).totalElements)
    }

    @Test
    fun `retention deletes real files and references after 14 days then deletes the summary and manifest after 90 days`() {
        val service = service()
        service.receive(principal, packet(diagnosticManifest(event), listOf(jpegWithComment())), type)
        val stored = mongo.findAll(MediaAsset::class.java)
        val image = stored.single { it.kind == MediaKind.IMAGE }
        val manifest = stored.single { it.kind == MediaKind.FILE }
        service.cleanupAt(Instant.now().plus(Duration.ofDays(15)))
        assertFalse(Files.exists(directory.resolve("private").resolve(image.storagePath)))
        assertTrue(Files.exists(directory.resolve("private").resolve(manifest.storagePath)))
        assertTrue(ticket().messages.all { it.images.isEmpty() })
        assertEquals(0L, (mongo.findById("images", DiagnosticStorageBudget::class.java)?.bytes ?: 0L))
        service.cleanupAt(Instant.now().plus(Duration.ofDays(91)))
        assertFalse(Files.exists(directory.resolve("private").resolve(manifest.storagePath)))
        assertTrue(mongo.findAll(MediaAsset::class.java).isEmpty())
        assertTrue(mongo.findAll(FeedbackTicket::class.java).isEmpty())
    }

    @Test
    fun `the global image budget accepts text without storing any image`() {
        mongo.insert(DiagnosticStorageBudget(bytes = DIAGNOSTIC_IMAGE_LIMIT))
        val response = service().receive(principal, packet(diagnosticManifest(event), listOf(jpegWithComment())), type)
        assertEquals("accepted_without_images", response.status)
        assertTrue(ticket().messages.first().images.isEmpty())
        assertEquals(1, mongo.findAll(MediaAsset::class.java).size)
    }

    @Test
    fun `failed ticket transactions delete uploaded media and restore the global budget`() {
        every { tickets.insert(any<FeedbackTicket>()) } throws IllegalStateException("Synthetic failure")
        assertThrows(IllegalStateException::class.java) {
            service().receive(principal, packet(diagnosticManifest(event), listOf(jpegWithComment())), type)
        }
        assertTrue(mongo.findAll(MediaAsset::class.java).isEmpty())
        assertTrue(mongo.findAll(DiagnosticEventReceipt::class.java).isEmpty())
        Files.list(directory.resolve("private")).use { assertEquals(0, it.count()) }
        assertEquals(0L, (mongo.findById("images", DiagnosticStorageBudget::class.java)?.bytes ?: 0L))
    }

    @Test
    fun `crash recovery removes only stale diagnostic orphans and preserves manual files and live diagnostic media`() {
        val service = service()
        service.receive(principal, packet(diagnosticManifest(event), listOf(jpegWithComment())), type)
        val root = directory.resolve("private")
        val orphan = root.resolve("diagnostic-med_0000000000000000.jpg")
        val temporary = root.resolve("diagnostic-med_0000000000000001-123.upload")
        val manual = root.resolve("med_0000000000000002.jpg")
        listOf(orphan, temporary, manual).forEach {
            Files.write(it, byteArrayOf(1))
            Files.setLastModifiedTime(it, java.nio.file.attribute.FileTime.from(Instant.now().minus(Duration.ofHours(2))))
        }
        service.cleanupAt(Instant.now())
        assertFalse(Files.exists(orphan))
        assertFalse(Files.exists(temporary))
        assertTrue(Files.exists(manual))
        mongo.findAll(MediaAsset::class.java).forEach { assertTrue(Files.exists(root.resolve(it.storagePath))) }
    }

    @Test
    fun `unknown multipart fields excessive files oversized images and undecodable pixels are rejected`() {
        val service = service()
        assertStatus(400) { service.receive(principal, packet(diagnosticManifest(event), emptyList(), "token"), type) }
        assertStatus(400) { service.receive(principal, packet(diagnosticManifest(event), List(4) { jpegWithComment() }), type) }
        assertStatus(413) { service.receive(principal, packet(diagnosticManifest(event), listOf(ByteArray(512 * 1024 + 1))), type) }
        assertStatus(422) { service.receive(principal, packet(diagnosticManifest(event), listOf(byteArrayOf(-1, -40, -1, -39))), type) }
        val wrongRoi = diagnosticManifest(event).toString(Charsets.UTF_8).replace("[0,0,4,4]", "[0,0,3,3]").toByteArray()
        assertStatus(422) { service.receive(principal, packet(wrongRoi, listOf(jpegWithComment())), type) }
        val bomb = jpegWithComment()
        val frame = (0 until bomb.size - 1).first { bomb[it] == (-1).toByte() && bomb[it + 1] == (-64).toByte() }
        bomb[frame + 5] = 16
        bomb[frame + 6] = 0
        bomb[frame + 7] = 16
        bomb[frame + 8] = 0
        val hugeRoi = diagnosticManifest(event).toString(Charsets.UTF_8)
            .replace("1280x720", "8192x8192").replace("[0,0,4,4]", "[0,0,4096,4096]").toByteArray()
        assertStatus(422) { service.receive(principal, packet(hugeRoi, listOf(bomb)), type) }
        assertTrue(mongo.findAll(FeedbackTicket::class.java).isEmpty())
    }

    @Test
    fun `Redis enforces user and account dimensions without charging rejected packets`() {
        repeat(6) { quotas.request(principal) }
        assertStatus(429) { quotas.request(principal) }
        repeat(30) { quotas.packet(principal, 0) }
        val retry = assertThrows(ResponseStatusException::class.java) { quotas.packet(principal, 0) }
        assertEquals(429, retry.statusCode.value())
        assertTrue(retry.headers.getFirst("Retry-After")!!.toLong() > 0)
        val second = principal.copy(accountId = "second")
        quotas.packet(second, 20L * 1024 * 1024)
        assertStatus(429) { quotas.packet(second, 1) }
        val day = Instant.now().atOffset(java.time.ZoneOffset.UTC).toLocalDate()
        assertEquals("1", redis.opsForValue().get("diag:account:${principal.userId}:second:$day:packets"))
        val another = principal.copy(userId = "daily-${UUID.randomUUID()}")
        redis.opsForValue().set("diag:user:${another.userId}:$day", "100", Duration.ofHours(1))
        assertStatus(429) { quotas.request(another) }
    }

    @Test
    fun `diagnostic aggregation uses the same reporter and area filters as the list`() {
        service().receive(principal, packet(diagnosticManifest(event, false), emptyList()), type)
        mongo.insert(ticket().copy(id = "other-owner", reporterUserId = "other", area = "ACCOUNT", workArea = "ACCOUNT"))
        val filter = FeedbackDiagnosticFilter(source = DIAGNOSTIC_SOURCE, issueCode = "collector_exception", includeCounts = true)
        val page = queries.search(
            principal.userId,
            null,
            null,
            null,
            null,
            null,
            PageRequest.of(0, 20),
            diagnosticFilter = filter,
        ) as FeedbackDiagnosticPage
        assertEquals(1L, page.totalElements)
        assertEquals(mapOf("collector_exception" to 1L), page.diagnosticCounts["issue_code"])
        assertEquals(mapOf("char_test" to 1L), page.diagnosticCounts["operator_id"])
        val denied = queries.search(
            null, null, null, null, null, null, PageRequest.of(0, 20), workAreas = setOf("STAR"), diagnosticFilter = filter,
        ) as FeedbackDiagnosticPage
        assertEquals(0L, denied.totalElements)
        assertTrue(denied.diagnosticCounts["source"].orEmpty().isEmpty())
    }

    private fun service(): MaayuanDiagnosticService {
        val properties = ShareProperties().apply {
            media = ShareProperties.Media(
                directory.resolve("public").toString(),
                10L * 1024 * 1024,
                directory.resolve("private").toString(),
            )
        }
        return MaayuanDiagnosticService(
            MaayuanDiagnosticParser(jacksonObjectMapper()),
            quotas,
            MediaStorageService(assets, properties),
            reports,
            mongo,
            MongoTransactionManager(mongo.mongoDatabaseFactory),
        )
    }

    private fun ticket(): FeedbackTicket = mongo.findById("rpt_diag_$event", FeedbackTicket::class.java)!!

    private fun assertStatus(status: Int, action: () -> Unit) {
        assertEquals(status, assertThrows(ResponseStatusException::class.java, action).statusCode.value())
    }

    private fun packet(manifest: ByteArray, files: List<ByteArray>, extra: String? = null): ByteArray = ByteArrayOutputStream().use { out ->
        fun part(name: String, mime: String, bytes: ByteArray) {
            out.write("--diagnostic-test\r\nContent-Disposition: form-data; name=\"$name\"; filename=\"ignored\"\r\n".toByteArray())
            out.write("Content-Type: $mime\r\n\r\n".toByteArray())
            out.write(bytes)
            out.write("\r\n".toByteArray())
        }
        part("manifest", "application/json", manifest)
        files.forEach { part("files", "image/jpeg", it) }
        extra?.let { part(it, "text/plain", "ignored".toByteArray()) }
        out.write("--diagnostic-test--\r\n".toByteArray())
        out.toByteArray()
    }

    private fun jpegWithComment(): ByteArray {
        val bytes = ByteArrayOutputStream().use { out ->
            MemoryCacheImageOutputStream(out).use { ImageIO.write(BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB), "jpeg", it) }
            out.toByteArray()
        }
        val comment = "private-metadata".toByteArray()
        return bytes.take(2).toByteArray() + byteArrayOf(-1, -2, 0, (comment.size + 2).toByte()) + comment + bytes.drop(2).toByteArray()
    }
}
