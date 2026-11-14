package com.lhs.share.hub.service.operator

import com.lhs.share.config.external.ShareProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import javax.imageio.ImageIO

@Component
class PortraitStorage(private val properties: ShareProperties) {
    private fun requireSafeOperatorId(operatorId: String) {
        if (!OPERATOR_ID_PATTERN.matches(operatorId)) invalid("Invalid operator id: $operatorId")
    }

    fun relativePath(operatorId: String): String = "/portraits/$operatorId.png"

    @Synchronized
    fun save(operatorId: String, file: MultipartFile): Pair<String, String> {
        requireSafeOperatorId(operatorId)
        if (file.size > MAX_SIZE) invalid("Portrait must not exceed 2MB")
        val bytes = file.inputStream.use { it.readNBytes(MAX_SIZE + 1) }
        if (bytes.size > MAX_SIZE) invalid("Portrait must not exceed 2MB")
        if (!bytes.take(PNG_HEADER.size).toByteArray().contentEquals(PNG_HEADER)) invalid("Portrait must be a PNG image")
        try {
            ImageIO.createImageInputStream(bytes.inputStream()).use { input ->
                val readers = ImageIO.getImageReaders(input)
                if (!readers.hasNext()) invalid("Portrait must be a valid PNG image")
                val reader = readers.next()
                try {
                    reader.input = input
                    // 解码前限制尺寸，避免小文件声明巨幅图片而耗尽内存。
                    if (reader.getWidth(0) !in 300..2048 || reader.getHeight(0) !in 300..2048) {
                        invalid("Portrait width and height must each be between 300 and 2048 pixels")
                    }
                    if (!reader.read(0).colorModel.hasAlpha()) invalid("Portrait must have an alpha channel")
                } finally {
                    reader.dispose()
                }
            }
        } catch (_: IOException) {
            invalid("Portrait must be a valid PNG image")
        }
        Files.createDirectories(directory())
        val tmp = directory().resolve("$operatorId.png.tmp")
        try {
            Files.write(tmp, bytes)
            Files.move(tmp, directory().resolve("$operatorId.png"), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } finally {
            Files.deleteIfExists(tmp)
        }
        return relativePath(operatorId) to digest(bytes)
    }

    @Synchronized
    fun delete(operatorId: String) {
        requireSafeOperatorId(operatorId)
        Files.deleteIfExists(directory().resolve("$operatorId.png"))
    }

    fun sha256(operatorId: String): String {
        requireSafeOperatorId(operatorId)
        return digest(Files.readAllBytes(directory().resolve("$operatorId.png")))
    }

    fun existingOperatorIds(): Set<String> {
        if (!Files.isDirectory(directory())) return emptySet()
        Files.newDirectoryStream(directory(), "*.png").use { files ->
            return files.map { it.fileName.toString().removeSuffix(".png") }
                .filter { OPERATOR_ID_PATTERN.matches(it) }.toSet()
        }
    }

    private fun directory(): Path = Path.of(properties.portrait.dir).toAbsolutePath()

    private fun digest(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun invalid(message: String): Nothing =
        throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message)

    companion object {
        private val OPERATOR_ID_PATTERN = Regex("^char_[A-Za-z0-9_]+$")
        private const val MAX_SIZE = 2 * 1024 * 1024
        private val PNG_HEADER = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    }
}
