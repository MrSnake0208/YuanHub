package com.lhs.share.openapi.diagnostics

import com.lhs.share.hub.repository.entity.FeedbackAgentReview
import com.lhs.share.hub.repository.entity.FeedbackTicket
import com.lhs.share.hub.repository.entity.FeedbackWorkflowEvent
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticEvent
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.service.media.MediaStorageService
import com.lhs.share.openapi.OpenApiPrincipal
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.FindAndModifyOptions
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.mapping.Document
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Duration
import java.time.Instant
import javax.imageio.ImageIO
import javax.imageio.stream.MemoryCacheImageInputStream
import javax.imageio.stream.MemoryCacheImageOutputStream
import javax.mail.internet.ContentDisposition
import javax.mail.internet.ContentType
import javax.mail.internet.MimeMultipart
import javax.mail.util.ByteArrayDataSource

internal const val DIAGNOSTIC_SOURCE = "maayuan_diagnostic"
internal const val DIAGNOSTIC_IMAGE_LIMIT = 10L * 1024 * 1024 * 1024

@Document("maayuan_diagnostic_storage")
data class DiagnosticStorageBudget(@Id val id: String = "images", val bytes: Long = 0)

/** Keep only the random event key after payload retention, so old retries cannot recreate an event. */
@Document("maayuan_diagnostic_receipts")
data class DiagnosticEventReceipt(@Id val id: String)

@Service
class MaayuanDiagnosticService(
    private val parser: MaayuanDiagnosticParser,
    private val quotas: MaayuanDiagnosticQuota,
    private val media: MediaStorageService,
    private val recorder: MaayuanDiagnosticIssueRecorder,
    @param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate,
    @param:Qualifier("hubTransactionManager") transactionManager: PlatformTransactionManager,
) {
    private val log = KotlinLogging.logger { }
    private val transactions = TransactionTemplate(transactionManager)

    fun receive(principal: OpenApiPrincipal, body: ByteArray, contentType: String): DiagnosticReceipt {
        val (manifestBytes, files) = multipart(body, contentType)
        val manifest = parser.parse(manifestBytes)
        if (manifest.images.size != files.size) diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Image index/count mismatch")
        if (recorded(manifest.eventId)) {
            return DiagnosticReceipt("duplicate", manifest.eventId)
        }
        val images = files.mapIndexed { index, bytes -> decodeImage(bytes, manifest.images[index]) }
        quotas.packet(principal, files.sumOf { it.size.toLong() })
        return persist(principal, manifest, images.size, images.sumOf { it.size.toLong() }) { index, now ->
            media.upload(
                principal.userId,
                DiagnosticUpload("diagnostic-$index.jpg", "image/jpeg", images[index]),
                privateStorage = true,
                diagnosticEventId = manifest.eventId,
                diagnosticExpiresAt = now.plus(Duration.ofDays(14)),
            )
        }
    }

    fun intents(principal: OpenApiPrincipal, body: ByteArray): DiagnosticIntentReceipt {
        if (!media.cosStorage.enabled) diagnosticError(HttpStatus.CONFLICT, "direct_upload_unavailable")
        val request = parser.parseIntent(body)
        val manifest = request.manifest
        if (recorded(manifest.eventId)) return DiagnosticIntentReceipt("duplicate", manifest.eventId)
        val bytes = request.uploads.sumOf { it.size } + (request.log?.size ?: 0L)
        quotas.packet(principal, bytes)
        val uploads = mutableListOf<DiagnosticUploadIntent>()
        var logUpload: DiagnosticLogUploadIntent? = null
        val createLog: ((Instant) -> MediaAsset)? = request.log?.let { declaration ->
            { now ->
                val asset = media.createPendingDiagnosticLog(
                    principal.userId,
                    manifest.eventId,
                    declaration.size,
                    now.plus(Duration.ofDays(14)),
                )
                val headers = mapOf(
                    "Content-Type" to "application/gzip",
                    "Content-MD5" to declaration.contentMd5,
                    "Content-Length" to asset.size.toString(),
                )
                logUpload = DiagnosticLogUploadIntent(
                    "PUT",
                    media.cosStorage.presignPut(asset.storagePath, headers),
                    headers,
                    media.cosStorage.putUrlTtlSeconds,
                )
                asset
            }
        }
        val result = persist(principal, manifest, request.uploads.size, bytes, createLog) { index, now ->
            val asset = media.createPendingDiagnosticImage(
                principal.userId,
                manifest.eventId,
                request.uploads[index].size,
                now.plus(Duration.ofDays(14)),
            )
            val headers = mapOf(
                "Content-Type" to "image/jpeg",
                "Content-MD5" to request.uploads[index].contentMd5,
                "Content-Length" to asset.size.toString(),
            )
            uploads +=
                DiagnosticUploadIntent(
                    index,
                    "PUT",
                    media.cosStorage.presignPut(asset.storagePath, headers),
                    headers,
                    media.cosStorage.putUrlTtlSeconds,
                )
            asset
        }
        return DiagnosticIntentReceipt(
            result.status,
            manifest.eventId,
            if (result.status == "accepted") uploads else emptyList(),
            if (result.status == "accepted") logUpload else null,
        )
    }

    private fun persist(
        principal: OpenApiPrincipal,
        manifest: MaayuanDiagnosticManifest,
        imageCount: Int,
        imageBytes: Long,
        createLog: ((Instant) -> MediaAsset)? = null,
        createImage: (Int, Instant) -> MediaAsset,
    ): DiagnosticReceipt {
        val assets = mutableListOf<MediaAsset>()
        val now = Instant.now()
        var status = "accepted"
        try {
            transactions.executeWithoutResult {
                val reserved = imageBytes == 0L || reserveImages(imageBytes)
                status = if (reserved) "accepted" else "accepted_without_images"
                assets += media.upload(
                    principal.userId,
                    DiagnosticUpload("manifest.json", "application/json", parser.bytes(manifest)),
                    privateStorage = true,
                    diagnosticEventId = manifest.eventId,
                    diagnosticExpiresAt = now.plus(Duration.ofDays(90)),
                )
                if (reserved) {
                    repeat(imageCount) { index ->
                        assets += createImage(index, now)
                    }
                    createLog?.let { assets += it(now) }
                }
                recorder.record(principal, manifest, assets, now)
                mongo.insert(DiagnosticEventReceipt(manifest.eventId))
            }
            return DiagnosticReceipt(status, manifest.eventId)
        } catch (error: Exception) {
            // An insert may have committed before a network error; never remove its referenced evidence.
            val existing = mongo.findById(manifest.eventId, MaayuanDiagnosticEvent::class.java)
            val referenced = existing?.let {
                listOfNotNull(it.manifestAssetId, it.log?.assetId) + it.images.map { image -> image.assetId }
            }.orEmpty()
            assets.filterNot { it.id in referenced }.forEach(::deleteAsset)
            val ownsCommittedAssets = assets.isNotEmpty() && assets.all { it.id in referenced }
            if (existing != null && ownsCommittedAssets) return DiagnosticReceipt(status, manifest.eventId)
            if (recorded(manifest.eventId)) return DiagnosticReceipt("duplicate", manifest.eventId)
            throw error
        }
    }

    fun complete(principal: OpenApiPrincipal, eventId: String, body: ByteArray): DiagnosticCompleteReceipt {
        parser.requireEmptyObject(body)
        val id = eventId.lowercase()
        val event = mongo.findById(id, MaayuanDiagnosticEvent::class.java)
            ?: diagnosticError(HttpStatus.NOT_FOUND, "Diagnostic event not found")
        if (event.userId != principal.userId || event.accountId != principal.accountId ||
            !event.createdAt.isAfter(Instant.now().minus(Duration.ofDays(90)))
        ) {
            diagnosticError(HttpStatus.NOT_FOUND, "Diagnostic event not found")
        }
        if (event.images.none { it.status == "pending" } && event.log?.status != "pending") {
            return DiagnosticCompleteReceipt(
                images = event.images.mapIndexed { index, image ->
                    DiagnosticCompleteImage(index, image.status)
                },
                log = event.log?.let { DiagnosticCompleteLog(it.status) },
            )
        }
        val manifestAsset = mongo.findById(event.manifestAssetId, MediaAsset::class.java)
            ?: diagnosticError(HttpStatus.NOT_FOUND, "Diagnostic manifest expired")
        if (manifestAsset.diagnosticEventId != id || manifestAsset.ownerUserId != principal.userId || !manifestAsset.privateStorage ||
            manifestAsset.deletedAt != null || manifestAsset.diagnosticExpiresAt?.isAfter(Instant.now()) != true
        ) {
            diagnosticError(HttpStatus.NOT_FOUND, "Diagnostic manifest not found")
        }
        val manifest = media.loadAuthorizedAsset(manifestAsset).inputStream.use { parser.parse(it.readNBytes(64 * 1024 + 1)) }
        event.images.forEachIndexed { index, image ->
            if (image.status != "pending") return@forEachIndexed
            val asset = mongo.findById(image.assetId, MediaAsset::class.java)
            if (asset != null && (
                    asset.diagnosticEventId != id || asset.ownerUserId != principal.userId ||
                        !asset.privateStorage || asset.storageBackend != "cos" || asset.kind != MediaKind.IMAGE
                    )
            ) {
                diagnosticError(HttpStatus.NOT_FOUND, "Diagnostic image not found")
            }
            val status = when {
                asset == null -> "missing"
                asset.status != "pending" -> asset.status
                else -> completeImage(asset, manifest.images[index])
            }
            completeAssetStatus(id, image.assetId, asset, status, "images")
        }
        event.log?.takeIf { it.status == "pending" }?.let { log ->
            val asset = mongo.findById(log.assetId, MediaAsset::class.java)
            if (asset != null && (
                    asset.diagnosticEventId != id || asset.ownerUserId != principal.userId || !asset.privateStorage ||
                        asset.storageBackend != "cos" || asset.kind != MediaKind.FILE || asset.mime != "application/gzip"
                    )
            ) {
                diagnosticError(HttpStatus.NOT_FOUND, "Diagnostic log not found")
            }
            val status = when {
                asset == null -> "missing"
                asset.status != "pending" -> asset.status
                else -> completeLog(asset)
            }
            completeAssetStatus(id, log.assetId, asset, status, "log")
        }
        val completed = mongo.findById(id, MaayuanDiagnosticEvent::class.java)
            ?: diagnosticError(HttpStatus.NOT_FOUND, "Diagnostic event not found")
        return DiagnosticCompleteReceipt(
            images = completed.images.mapIndexed { index, image ->
                DiagnosticCompleteImage(index, image.status)
            },
            log = completed.log?.let { DiagnosticCompleteLog(it.status) },
        )
    }

    private fun completeAssetStatus(eventId: String, assetId: String, asset: MediaAsset?, status: String, field: String) {
        transactions.executeWithoutResult {
            var finalStatus = status
            if (asset != null && asset.status == "pending") {
                // A conditional transition and the budget decrement commit together, including concurrent complete calls.
                val pending = Query(Criteria.where("_id").`is`(asset.id).and("status").`is`("pending"))
                val changed = mongo.findAndModify(pending, Update().set("status", status), MediaAsset::class.java)
                if (changed == null) {
                    finalStatus = mongo.findById(assetId, MediaAsset::class.java)?.status ?: "missing"
                } else if (status in setOf("missing", "invalid")) {
                    releaseImages(changed.size)
                }
            }
            val reference = Query(Criteria.where("_id").`is`(eventId).and("$field.assetId").`is`(assetId))
            val path = if (field == "images") "images.$.status" else "log.status"
            mongo.updateFirst(reference, Update().set(path, finalStatus), MaayuanDiagnosticEvent::class.java)
        }
    }

    private fun completeLog(asset: MediaAsset): String {
        if (asset.deletedAt != null || asset.diagnosticExpiresAt?.isAfter(Instant.now()) != true) return "missing"
        val size = media.cosStorage.headSize(asset.storagePath) ?: return "missing"
        var status = "invalid"
        if (size == asset.size && size in 1..DIAGNOSTIC_LOG_COMPRESSED_LIMIT) {
            try {
                val bytes = media.cosStorage.load(asset.storagePath).inputStream.use { it.readNBytes(size.toInt() + 1) }
                if (bytes.size.toLong() == size) {
                    decodeDiagnosticLog(bytes)
                    status = "ready"
                }
            } catch (error: org.springframework.web.server.ResponseStatusException) {
                when (error.statusCode.value()) {
                    404 -> return "missing"
                    422 -> Unit
                    else -> throw error
                }
            }
        }
        if (status == "invalid") media.cosStorage.delete(asset.storagePath)
        return status
    }

    private fun completeImage(asset: MediaAsset, metadata: DiagnosticImage): String {
        if (asset.deletedAt != null || asset.diagnosticExpiresAt?.isAfter(Instant.now()) != true) return "missing"
        val size = media.cosStorage.headSize(asset.storagePath) ?: return "missing"
        var status = "invalid"
        if (size == asset.size && size in 1..524288) {
            try {
                val bytes = media.cosStorage.load(asset.storagePath).inputStream.use { it.readNBytes(size.toInt() + 1) }
                if (bytes.size.toLong() == size) {
                    decodeImage(bytes, metadata, reencode = false)
                    status = "ready"
                }
            } catch (error: org.springframework.web.server.ResponseStatusException) {
                when (error.statusCode.value()) {
                    404 -> return "missing"
                    422 -> Unit
                    else -> throw error
                }
            }
        }
        if (status == "invalid") media.cosStorage.delete(asset.storagePath)
        return status
    }

    private fun multipart(body: ByteArray, contentType: String): Pair<ByteArray, List<ByteArray>> {
        if (body.size > MaayuanDiagnosticFilter.MAX_REQUEST_BYTES) diagnosticError(HttpStatus.PAYLOAD_TOO_LARGE, "Request exceeds 2 MiB")
        try {
            val type = ContentType(contentType)
            if (!type.match("multipart/form-data") || type.getParameter("boundary").isNullOrBlank()) {
                diagnosticError(HttpStatus.BAD_REQUEST, "Invalid multipart boundary")
            }
            val multipart = MimeMultipart(ByteArrayDataSource(body, contentType))
            if (multipart.count !in 1..4 || !multipart.isComplete) diagnosticError(HttpStatus.BAD_REQUEST, "Invalid multipart parts")
            var manifest: ByteArray? = null
            val files = mutableListOf<ByteArray>()
            repeat(multipart.count) { index ->
                val part = multipart.getBodyPart(index)
                val disposition = ContentDisposition(part.getHeader("Content-Disposition")?.singleOrNull().orEmpty())
                val name = disposition.getParameter("name")
                val mime = ContentType(part.contentType).baseType.lowercase()
                val encoding = part.getHeader("Content-Transfer-Encoding")?.singleOrNull()?.lowercase()
                if (disposition.disposition != "form-data" || encoding !in listOf(null, "binary", "8bit")) {
                    diagnosticError(HttpStatus.BAD_REQUEST, "Invalid multipart disposition/encoding")
                }
                val bytes = part.inputStream.use { it.readNBytes(512 * 1024 + 1) }
                when (name) {
                    "manifest" -> {
                        if (manifest != null || mime != "application/json") diagnosticError(HttpStatus.BAD_REQUEST, "Invalid manifest part")
                        if (bytes.size > 64 * 1024) diagnosticError(HttpStatus.PAYLOAD_TOO_LARGE, "manifest exceeds 64 KiB")
                        manifest = bytes
                    }
                    "files" -> {
                        if (mime != "image/jpeg") diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Expected JPEG")
                        if (bytes.size > 512 * 1024) diagnosticError(HttpStatus.PAYLOAD_TOO_LARGE, "JPEG exceeds 512 KiB")
                        files += bytes
                    }
                    else -> diagnosticError(HttpStatus.BAD_REQUEST, "Unknown multipart field")
                }
            }
            return (manifest ?: diagnosticError(HttpStatus.BAD_REQUEST, "Missing manifest")) to files
        } catch (error: org.springframework.web.server.ResponseStatusException) {
            throw error
        } catch (_: Exception) {
            diagnosticError(HttpStatus.BAD_REQUEST, "Invalid multipart body")
        }
    }

    private fun decodeImage(bytes: ByteArray, metadata: DiagnosticImage, reencode: Boolean = true): ByteArray {
        try {
            ByteArrayInputStream(bytes).use { input ->
                MemoryCacheImageInputStream(input).use { stream ->
                    val readers = ImageIO.getImageReaders(stream)
                    if (!readers.hasNext()) diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid JPEG")
                    val reader = readers.next()
                    try {
                        reader.input = stream
                        var warning = false
                        reader.addIIOReadWarningListener { _, _ -> warning = true }
                        val width = reader.getWidth(0)
                        val height = reader.getHeight(0)
                        val boundedSides = width in 1..4096 && height in 1..4096
                        val boundedPixels = width.toLong() * height <= 4_194_304
                        val safeSize = boundedSides && boundedPixels
                        val matchesRoi = width == metadata.roi[2] && height == metadata.roi[3]
                        if (!reader.formatName.equals("JPEG", true) || !safeSize || !matchesRoi) {
                            diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid JPEG dimensions or ROI")
                        }
                        val decoded = reader.read(0) ?: diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid JPEG pixels")
                        if (warning) diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Damaged JPEG pixels")
                        if (!reencode) return bytes
                        val pixels = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
                        pixels.createGraphics().let { graphics ->
                            try {
                                graphics.drawImage(decoded, 0, 0, null)
                            } finally {
                                graphics.dispose()
                            }
                        }
                        return ByteArrayOutputStream().use { output ->
                            MemoryCacheImageOutputStream(output).use { imageOutput ->
                                if (!ImageIO.write(pixels, "jpeg", imageOutput)) {
                                    diagnosticError(HttpStatus.SERVICE_UNAVAILABLE, "JPEG encoder unavailable")
                                }
                            }
                            output.toByteArray()
                        }
                    } finally {
                        reader.dispose()
                    }
                }
            }
        } catch (error: org.springframework.web.server.ResponseStatusException) {
            throw error
        } catch (_: Exception) {
            diagnosticError(HttpStatus.UNPROCESSABLE_ENTITY, "Invalid JPEG pixels")
        }
    }

    private fun reserveImages(bytes: Long): Boolean {
        val key = Query(Criteria.where("_id").`is`("images"))
        mongo.upsert(key, Update().setOnInsert("bytes", 0L), DiagnosticStorageBudget::class.java)
        val room = Query(Criteria.where("_id").`is`("images").and("bytes").lte(DIAGNOSTIC_IMAGE_LIMIT - bytes))
        return mongo.findAndModify(
            room,
            Update().inc("bytes", bytes),
            FindAndModifyOptions.options().returnNew(true),
            DiagnosticStorageBudget::class.java,
        ) != null
    }

    private fun releaseImages(bytes: Long) {
        mongo.updateFirst(Query(Criteria.where("_id").`is`("images")), Update().inc("bytes", -bytes), DiagnosticStorageBudget::class.java)
    }

    private fun deleteAsset(asset: MediaAsset) {
        media.deletePrivateFile(asset)
        val query = Query(Criteria.where("_id").`is`(asset.id))
        if (!mongo.exists(query, MediaAsset::class.java)) return
        transactions.executeWithoutResult {
            val removed = mongo.findAndRemove(query, MediaAsset::class.java) ?: return@executeWithoutResult
            if ((removed.kind == MediaKind.IMAGE || removed.mime == "application/gzip") && removed.status !in setOf("missing", "invalid")) {
                releaseImages(removed.size)
            }
            val reference = org.bson.Document("id", asset.id)
            mongo.updateMulti(
                Query(Criteria.where("source").`is`(DIAGNOSTIC_SOURCE)),
                Update().pull("messages.$[].images", reference).pull("messages.$[].files", reference),
                FeedbackTicket::class.java,
            )
        }
    }

    @Scheduled(fixedDelay = 3_600_000, initialDelay = 60_000)
    fun cleanup() = cleanupAt(Instant.now())

    fun cleanupAt(now: Instant) {
        val expired = Criteria.where("diagnosticEventId").ne(null).and("diagnosticExpiresAt").lte(now)
        mongo.stream(Query(expired), MediaAsset::class.java).use { assets -> assets.forEach { cleanupAsset(it) } }
        val oldEvents = Query(Criteria.where("createdAt").lte(now.minus(Duration.ofDays(90))))
        mongo.stream(oldEvents, MaayuanDiagnosticEvent::class.java).use { events ->
            events.forEach { event ->
                val attachments = mongo.find(Query(Criteria.where("diagnosticEventId").`is`(event.id)), MediaAsset::class.java)
                if (attachments.map(::cleanupAsset).all { it }) {
                    mongo.remove(Query(Criteria.where("_id").`is`(event.id)), MaayuanDiagnosticEvent::class.java)
                }
            }
        }
        val oldTickets = Query(Criteria.where("source").`is`(DIAGNOSTIC_SOURCE).and("createdAt").lte(now.minus(Duration.ofDays(90))))
        mongo.stream(oldTickets, FeedbackTicket::class.java).use { tickets ->
            tickets.forEach { ticket ->
                val event = checkNotNull(ticket.id).removePrefix("rpt_diag_")
                val attachments = mongo.find(Query(Criteria.where("diagnosticEventId").`is`(event)), MediaAsset::class.java)
                if (attachments.map(::cleanupAsset).all { it }) {
                    transactions.executeWithoutResult {
                        val related = Query(Criteria.where("ticketId").`is`(ticket.id))
                        mongo.remove(related, FeedbackAgentReview::class.java)
                        mongo.remove(related, FeedbackWorkflowEvent::class.java)
                        mongo.remove(Query(Criteria.where("_id").`is`(ticket.id)), FeedbackTicket::class.java)
                    }
                }
            }
        }
        runCatching { media.deleteDiagnosticOrphans(now.minus(Duration.ofHours(1))) }
            .onFailure { log.error { "Diagnostic orphan cleanup will retry: ${it.javaClass.simpleName}" } }
    }

    private fun cleanupAsset(asset: MediaAsset): Boolean = try {
        deleteAsset(asset)
        true
    } catch (error: Exception) {
        log.error { "Diagnostic media cleanup will retry: ${asset.id}, ${error.javaClass.simpleName}" }
        false
    }

    private fun recorded(eventId: String): Boolean =
        mongo.exists(Query(Criteria.where("_id").`is`(eventId)), DiagnosticEventReceipt::class.java)
}
