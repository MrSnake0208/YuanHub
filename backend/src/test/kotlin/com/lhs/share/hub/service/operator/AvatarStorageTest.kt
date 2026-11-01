package com.lhs.share.hub.service.operator

import com.lhs.share.config.external.ShareProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.http.HttpStatus
import org.springframework.mock.web.MockMultipartFile
import java.nio.file.Files
import java.nio.file.Path

/**
 * 密探头像落盘组件单测：webp 魔数校验、原子写、幂等覆盖、id 白名单与清理。
 */
class AvatarStorageTest {
    @TempDir
    lateinit var tempDir: Path

    private fun storage(dir: String = tempDir.toString()): AvatarStorage {
        return AvatarStorage(ShareProperties().apply { avatar = ShareProperties.Avatar(dir) })
    }

    private fun webpBytes(): ByteArray {
        return byteArrayOf(
            0x52, 0x49, 0x46, 0x46, 0x2C, 0x00, 0x00, 0x00,
            0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
            0x00, 0x00, 0x00, 0x00,
        )
    }

    private fun webpFile(bytes: ByteArray = webpBytes()): MockMultipartFile {
        return MockMultipartFile("file", "avatar.webp", "image/webp", bytes)
    }

    @Test
    fun `save writes the webp file under the operator id and returns the relative path`() {
        val s = storage()

        val path = s.save("char_001_yangxiu", webpFile())

        assertEquals("/avatar/char_001_yangxiu.webp", path)
        val onDisk = Files.readAllBytes(tempDir.resolve("char_001_yangxiu.webp"))
        assertTrue(onDisk.contentEquals(webpBytes()))
    }

    @Test
    fun `save is idempotent across the same operator id`() {
        val s = storage()
        val first = webpBytes()
        val second = webpBytes().copyOfRange(0, 16) + byteArrayOf(0x01, 0x02, 0x03, 0x04)

        s.save("char_001_yangxiu", webpFile(first))
        s.save("char_001_yangxiu", webpFile(second))

        assertTrue(Files.readAllBytes(tempDir.resolve("char_001_yangxiu.webp")).contentEquals(second))
    }

    @Test
    fun `save rejects non-webp content`() {
        val s = storage()
        val file = MockMultipartFile("file", "avatar.png", "image/png", "not a webp".toByteArray())

        val e = assertThrows(OperatorApiException::class.java) { s.save("char_001_yangxiu", file) }

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertFalse(Files.exists(tempDir.resolve("char_001_yangxiu.webp")))
    }

    @Test
    fun `save rejects an empty file`() {
        val s = storage()

        val e = assertThrows(OperatorApiException::class.java) { s.save("char_001_yangxiu", webpFile(ByteArray(0))) }

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
    }

    @Test
    fun `save rejects an unsafe operator id`() {
        val s = storage()
        val id = "../evil" // 若白名单校验失效会把文件写到 tempDir 之外

        val e = assertThrows(OperatorApiException::class.java) { s.save(id, webpFile()) }

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, e.status)
        assertFalse(Files.exists(tempDir.resolve("$id.webp").normalize()))
    }

    @Test
    fun `delete removes the file and silently ignores a missing file`() {
        val s = storage()
        s.save("char_001_yangxiu", webpFile())

        s.delete("char_001_yangxiu")
        assertFalse(Files.exists(tempDir.resolve("char_001_yangxiu.webp")))

        // 文件不存在时静默成功，不抛异常
        s.delete("char_001_yangxiu")
    }

    @Test
    fun `existingOperatorIds lists valid webp files and ignores others`() {
        val s = storage()
        Files.write(tempDir.resolve("char_001_yangxiu.webp"), webpBytes())
        Files.write(tempDir.resolve("char_002_jiaxu.webp"), webpBytes())
        Files.write(tempDir.resolve("not_an_id.webp"), webpBytes())
        Files.write(tempDir.resolve("readme.txt"), "x".toByteArray())
        Files.write(tempDir.resolve("char_003_pending.webp.tmp"), webpBytes())

        val ids = s.existingOperatorIds()

        assertEquals(setOf("char_001_yangxiu", "char_002_jiaxu"), ids)
    }

    @Test
    fun `existingOperatorIds is empty when the directory is missing`() {
        val s = storage(tempDir.resolve("nope").toString())

        assertEquals(emptySet<String>(), s.existingOperatorIds())
    }
}
