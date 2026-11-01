package com.lhs.share.hub.service.media

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.hub.repository.MediaAssetRepository
import com.lhs.share.hub.repository.entity.MediaKind
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockMultipartFile
import org.springframework.web.server.ResponseStatusException
import java.nio.file.Files
import java.nio.file.Path

class MediaStorageServiceTest {
    @TempDir
    lateinit var tempDir: Path

    private lateinit var repository: MediaAssetRepository

    @BeforeEach
    fun setUp() {
        repository = mockk()
    }

    @Test
    fun `supported image signatures are stored with generated metadata`() {
        every { repository.save(any()) } answers { firstArg() }
        val cases = listOf(
            Triple("screen.jpg", "image/jpeg", jpegBytes()),
            Triple("screen.png", "image/png", pngBytes()),
            Triple("screen.webp", "image/webp", webpBytes()),
        )

        cases.forEach { (name, mime, bytes) ->
            val asset = storage().upload("user-1", file(name, mime, bytes))

            assertTrue(asset.id!!.matches(Regex("med_[0-9a-f]{16}")))
            assertEquals("user-1", asset.ownerUserId)
            assertEquals(name, asset.originalName)
            assertEquals(mime, asset.mime)
            assertEquals(MediaKind.IMAGE, asset.kind)
            assertEquals(bytes.size.toLong(), asset.size)
            assertTrue(asset.storagePath.endsWith(".${name.substringAfterLast('.')}"))
            assertArrayEquals(bytes, Files.readAllBytes(publicDir().resolve(asset.storagePath.substringAfterLast('/'))))
        }
    }

    @Test
    fun `feedback images use private storage and authorized reads only`() {
        every { repository.save(any()) } answers { firstArg() }
        val service = storage()
        val bytes = pngBytes()
        val asset = service.upload("user-1", file("private.png", "image/png", bytes), privateStorage = true)
        assertTrue(asset.privateStorage)
        assertFalse(asset.storagePath.startsWith("/media/"))
        assertFalse(Files.exists(publicDir().resolve(asset.storagePath)))
        assertArrayEquals(bytes, service.loadAuthorizedAsset(asset).inputStream.use { it.readBytes() })
        assertEquals(null, com.lhs.share.hub.controller.media.response.MediaUploadResponse.of(asset, "https://example.test").url)
    }

    @Test
    fun `supported files are normalized and stored only in private directory`() {
        every { repository.save(any()) } answers { firstArg() }
        val cases = listOf(
            Triple("note.txt", "text/plain", "plain text".toByteArray()),
            Triple("error.log", "application/octet-stream", "log text".toByteArray()),
            Triple("trace.log", "text/x-log", "trace text".toByteArray()),
            Triple("sample.json", "application/json", "{truncated".toByteArray()),
            Triple("guide.pdf", "application/pdf", "%PDF-1.7\n".toByteArray()),
            Triple("bundle.zip", "application/x-zip-compressed", zipBytes()),
        )

        cases.forEach { (name, mime, bytes) ->
            val asset = storage().upload("user-1", file(name, mime, bytes))

            assertEquals(MediaKind.FILE, asset.kind)
            assertEquals(
                if (name.endsWith(".zip")) {
                    "application/zip"
                } else if (name.endsWith(".log")) {
                    "text/plain"
                } else {
                    mime
                },
                asset.mime,
            )
            assertFalse(asset.storagePath.startsWith('/'))
            assertArrayEquals(bytes, Files.readAllBytes(privateDir().resolve(asset.storagePath)))
            assertFalse(Files.exists(publicDir().resolve(asset.storagePath)))
        }
    }

    @Test
    fun `empty unsupported and mismatched content are rejected`() {
        val service = storage()

        assertStatus(HttpStatus.BAD_REQUEST) {
            service.upload("user-1", file("empty.png", "image/png", ByteArray(0)))
        }
        assertStatus(HttpStatus.BAD_REQUEST) {
            service.upload("user-1", file("note.exe", "application/octet-stream", "not allowed".toByteArray()))
        }
        assertStatus(HttpStatus.BAD_REQUEST) {
            service.upload("user-1", file("wrong.jpg", "image/jpeg", pngBytes()))
        }
        assertStatus(HttpStatus.BAD_REQUEST) {
            service.upload("user-1", file("wrong.pdf", "application/pdf", "not pdf".toByteArray()))
        }
        assertStatus(HttpStatus.BAD_REQUEST) {
            service.upload("user-1", file("wrong.zip", "application/zip", "not zip".toByteArray()))
        }
        assertStatus(HttpStatus.BAD_REQUEST) {
            service.upload("user-1", file("binary.log", "text/plain", byteArrayOf(1, 0, 2)))
        }
    }

    @Test
    fun `configured size limit is enforced`() {
        assertStatus(HttpStatus.PAYLOAD_TOO_LARGE) {
            storage(maxSize = 3).upload("user-1", file("screen.jpg", "image/jpeg", jpegBytes()))
        }
        assertFalse(Files.exists(tempDir.resolve("screen.jpg")))
    }

    @Test
    fun `repository failure removes temporary and formal files`() {
        val failure = IllegalStateException("mongo unavailable")
        every { repository.save(any()) } throws failure

        val thrown = assertThrows(IllegalStateException::class.java) {
            storage().upload("user-1", file("screen.png", "image/png", pngBytes()))
        }

        assertSame(failure, thrown)
        Files.list(publicDir()).use { entries -> assertEquals(0, entries.count()) }
    }

    @Test
    fun `client filename never participates in the stored path`() {
        every { repository.save(any()) } answers { firstArg() }

        val asset = storage().upload(
            "user-1",
            file("../../outside.png", "image/png", pngBytes()),
        )

        assertEquals("../../outside.png", asset.originalName)
        assertTrue(asset.storagePath.matches(Regex("/media/med_[0-9a-f]{16}\\.png")))
        assertTrue(Files.exists(publicDir().resolve(asset.storagePath.substringAfterLast('/'))))
        assertFalse(Files.exists(tempDir.resolve("outside.png")))
    }

    @Test
    fun `authorized machine read resolves both image and private file inside their own roots`() {
        every { repository.save(any()) } answers { firstArg() }
        val service = storage()
        val imageBytes = pngBytes()
        val textBytes = "debug log".toByteArray()
        val image = service.upload("user-1", file("screen.png", "image/png", imageBytes))
        val attachment = service.upload("user-1", file("debug.log", "text/plain", textBytes))

        assertArrayEquals(imageBytes, service.loadAuthorizedAsset(image).inputStream.readBytes())
        assertArrayEquals(textBytes, service.loadAuthorizedAsset(attachment).inputStream.readBytes())
    }

    private fun storage(maxSize: Long = 10 * 1024 * 1024): MediaStorageService {
        val properties = ShareProperties().apply {
            media = ShareProperties.Media(publicDir().toString(), maxSize, privateDir().toString())
        }
        return MediaStorageService(repository, properties)
    }

    private fun publicDir(): Path = tempDir.resolve("public")

    private fun privateDir(): Path = tempDir.resolve("private")

    private fun file(name: String, mime: String?, bytes: ByteArray): MockMultipartFile = MockMultipartFile("file", name, mime, bytes)

    private fun assertStatus(status: HttpStatus, block: () -> Unit) {
        val exception = assertThrows(ResponseStatusException::class.java, block)
        assertEquals(status.value(), exception.statusCode.value())
    }

    private fun jpegBytes(): ByteArray = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0x00)

    private fun pngBytes(): ByteArray = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(),
        0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte(),
        0x00,
    )

    private fun webpBytes(): ByteArray = byteArrayOf(
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
    )

    private fun zipBytes(): ByteArray = byteArrayOf(0x50, 0x4B, 0x03, 0x04, 0x00)
}
