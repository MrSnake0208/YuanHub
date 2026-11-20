package com.lhs.share.hub.service.operator

import com.lhs.share.config.external.ShareProperties
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO

@Component
class PortraitStorage(private val properties: ShareProperties) {
    private val logger = LoggerFactory.getLogger(javaClass)
    private val previewSlot = Semaphore(1)

    private fun requireSafeOperatorId(operatorId: String) {
        if (!OPERATOR_ID_PATTERN.matches(operatorId)) invalid("Invalid operator id: $operatorId")
    }

    fun relativePath(operatorId: String): String = "/portraits/$operatorId.png"

    @Synchronized
    fun save(operatorId: String, file: MultipartFile): Pair<String, String> {
        requireSafeOperatorId(operatorId)
        val bytes = readPng(file)
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

    fun preview(file: MultipartFile): ByteArray {
        if (!previewSlot.tryAcquire()) unavailable("正在处理另一张立绘，请稍后重试。")
        try {
            val bytes = readPng(file)
            val workspace = Files.createTempDirectory("yuanhub-portrait-")
            try {
                val source = Files.write(workspace.resolve("source.png"), bytes)
                val result = workspace.resolve("result.png")
                val scripts = Path.of(properties.portrait.normalizerDir).toAbsolutePath().normalize()
                val process = ProcessBuilder(
                    scripts.resolve(".venv/bin/python").toString(),
                    "-I",
                    "-B",
                    scripts.resolve("normalize.py").toString(),
                    "--single-png",
                    source.toString(),
                    result.toString(),
                ).redirectError(ProcessBuilder.Redirect.INHERIT).redirectOutput(ProcessBuilder.Redirect.DISCARD).start()
                try {
                    if (!process.waitFor(20, TimeUnit.SECONDS)) unavailable("立绘处理超时，请重新选图重试。")
                    val exitCode = process.exitValue()
                    if (exitCode == FACE_UNRECOGNIZED) {
                        throw OperatorApiException(
                            HttpStatus.UNPROCESSABLE_ENTITY,
                            "portrait_face_unrecognized",
                            "未能识别出单张清晰的人脸。",
                        )
                    }
                    if (exitCode != 0 || Files.size(result) !in 1L..MAX_SIZE.toLong()) {
                        logger.warn("Portrait normalizer failed (exit {}) or returned an invalid output size", exitCode)
                        unavailable()
                    }
                    return Files.readAllBytes(result)
                } finally {
                    if (process.isAlive) process.destroyForcibly().waitFor(1, TimeUnit.SECONDS)
                }
            } finally {
                workspace.toFile().deleteRecursively()
            }
        } catch (e: IOException) {
            logger.warn("Could not prepare a portrait preview", e)
            unavailable()
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            unavailable()
        } finally {
            previewSlot.release()
        }
    }

    private fun readPng(file: MultipartFile): ByteArray {
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
        return bytes
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

    private fun unavailable(message: String = "暂时无法处理立绘，请重新选图重试。"): Nothing =
        throw OperatorApiException(HttpStatus.SERVICE_UNAVAILABLE, "portrait_processing_unavailable", message)

    companion object {
        private const val FACE_UNRECOGNIZED = 10
        private val OPERATOR_ID_PATTERN = Regex("^char_[A-Za-z0-9_]+$")
        private const val MAX_SIZE = 2 * 1024 * 1024
        private val PNG_HEADER = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    }
}
