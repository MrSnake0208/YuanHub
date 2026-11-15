package com.lhs.share.hub.service.recruitment

import com.lhs.share.config.external.ShareProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile
import java.awt.image.BufferedImage
import java.awt.image.DataBufferInt
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import javax.imageio.ImageIO

@Component
class RecruitmentBannerStorage(private val properties: ShareProperties) {
    fun save(file: MultipartFile): String {
        if (file.size > MAX_SIZE) invalid("Banner 不能超过 2MB")
        val bytes = file.inputStream.use { it.readNBytes(MAX_SIZE + 1) }
        if (bytes.size > MAX_SIZE) invalid("Banner 不能超过 2MB")
        val extension = when {
            bytes.take(PNG_HEADER.size).toByteArray().contentEquals(PNG_HEADER) -> "png"
            bytes.size >= 3 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte() && bytes[2] == 0xff.toByte() -> "jpg"
            else -> invalid("Banner 必须是有效的 PNG 或 JPEG 图片")
        }
        val storedBytes = try {
            ImageIO.createImageInputStream(bytes.inputStream()).use { input ->
                val readers = ImageIO.getImageReaders(input)
                if (!readers.hasNext()) invalid("Banner 图片无法读取，请选择有效的 PNG 或 JPEG")
                val reader = readers.next()
                try {
                    reader.input = input
                    val width = reader.getWidth(0)
                    val height = reader.getHeight(0)
                    if (width !in 600..2048 || height !in 150..1024 || width.toDouble() / height !in 3.0..4.5) {
                        invalid("Banner 宽须为 600–2048px，高须为 150–1024px，宽高比须为 3.0–4.5，建议 992×274px")
                    }
                    val image = reader.read(0) ?: invalid("Banner 图片无法读取，请选择有效的 PNG 或 JPEG")
                    if (extension == "png" && image.colorModel.hasAlpha()) normalizePng(image, bytes) else bytes
                } finally {
                    reader.dispose()
                }
            }
        } catch (_: IOException) {
            invalid("Banner 图片无法读取，请选择有效的 PNG 或 JPEG")
        } catch (exception: RuntimeException) {
            if (exception is RecruitmentApiException) throw exception
            invalid("Banner 图片无法读取，请选择有效的 PNG 或 JPEG")
        }
        val digest = MessageDigest.getInstance("SHA-256").digest(storedBytes).joinToString("") { "%02x".format(it) }
        val filename = "$digest.$extension"
        val directory = directory()
        Files.createDirectories(directory)
        val temporary = Files.createTempFile(directory, "banner-", ".tmp")
        try {
            Files.write(temporary, storedBytes)
            Files.move(temporary, directory.resolve(filename), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        } finally {
            Files.deleteIfExists(temporary)
        }
        return "/recruitment-banners/$filename"
    }

    private fun normalizePng(image: BufferedImage, original: ByteArray): ByteArray {
        val width = image.width
        val height = image.height
        val normalized = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB)
        val pixels = (normalized.raster.dataBuffer as DataBufferInt).data
        image.getRGB(0, 0, width, height, pixels, 0, width)
        val queue = IntArray(pixels.size)
        var head = 0
        var tail = 0

        fun enqueue(index: Int) {
            val pixel = pixels[index]
            if (pixel ushr 24 !in 40..70 || (pixel ushr 16 and 0xff) > 16 ||
                (pixel ushr 8 and 0xff) > 16 || (pixel and 0xff) > 16
            ) {
                return
            }
            pixels[index] = 0
            queue[tail++] = index
        }

        for (y in 0 until height) {
            for (x in 0 until width) {
                if (x <= 4 || y <= 4 || x >= width - 5 || y >= height - 5) enqueue(y * width + x)
            }
        }
        while (head < tail) {
            val index = queue[head++]
            val x = index % width
            if (x > 0) enqueue(index - 1)
            if (x < width - 1) enqueue(index + 1)
            if (index >= width) enqueue(index - width)
            if (index < pixels.size - width) enqueue(index + width)
        }
        if (tail * 100 < pixels.size) return original

        for (y in 0 until height) {
            for (x in 0 until width) {
                if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) pixels[y * width + x] = 0
            }
        }
        fun inEdgeBand(x: Int, y: Int) = x <= 16 || y <= 16 || x >= width - 17 || y >= height - 17

        // 横纵扫描仅标记，共享外环清除后的同一份像素状态，避免连锁误删。
        val removePixels = BooleanArray(pixels.size)
        for (y in 0 until height) {
            var x = 0
            while (x < width) {
                if (pixels[y * width + x] ushr 24 == 0) {
                    x++
                    continue
                }
                val start = x
                while (x < width && pixels[y * width + x] ushr 24 > 0) x++
                if (start > 0 && x < width && x - start <= 2 && (start until x).all { inEdgeBand(it, y) }) {
                    for (segmentX in start until x) removePixels[y * width + segmentX] = true
                }
            }
        }
        for (x in 0 until width) {
            var y = 0
            while (y < height) {
                if (pixels[y * width + x] ushr 24 == 0) {
                    y++
                    continue
                }
                val start = y
                while (y < height && pixels[y * width + x] ushr 24 > 0) y++
                if (start > 0 && y < height && y - start <= 2 && (start until y).all { inEdgeBand(x, it) }) {
                    for (segmentY in start until y) removePixels[segmentY * width + x] = true
                }
            }
        }
        for (index in pixels.indices) {
            if (removePixels[index]) pixels[index] = 0
        }
        return ByteArrayOutputStream().use { output ->
            if (!ImageIO.write(normalized, "png", output)) invalid("Banner 图片无法读取，请选择有效的 PNG 或 JPEG")
            output.toByteArray()
        }
    }

    fun delete(banner: String) {
        if (!BANNER_PATH.matches(banner)) return
        Files.deleteIfExists(directory().resolve(banner.substringAfterLast('/')))
    }

    private fun directory(): Path = Path.of(properties.recruitmentBanner.dir).toAbsolutePath()

    private fun invalid(message: String): Nothing =
        throw RecruitmentApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", message)

    private companion object {
        const val MAX_SIZE = 2 * 1024 * 1024
        val PNG_HEADER = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        val BANNER_PATH = Regex("^/recruitment-banners/[a-f0-9]{64}\\.(png|jpg)$")
    }
}
