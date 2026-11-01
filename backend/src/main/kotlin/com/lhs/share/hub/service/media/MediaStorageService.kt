package com.lhs.share.hub.service.media

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.hub.repository.MediaAssetRepository
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.repository.entity.effectiveKind
import org.springframework.core.io.FileSystemResource
import org.springframework.core.io.Resource
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.io.IOException
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.SecureRandom
import java.util.Locale

/**
 * Hub 库媒体文件存储服务
 *
 * 处理文件上传校验、磁盘存储及元数据持久化。
 * 普通图片映射到 /media/;反馈图片和普通文件写入私有目录,须经过工单授权读取。
 */
@Service
class MediaStorageService(
    private val mediaAssetRepository: MediaAssetRepository,
    private val properties: ShareProperties,
) {
    private val random = SecureRandom()
    private val hexChars = "0123456789abcdef"

    private data class UploadType(
        val kind: MediaKind,
        val mime: String,
        val extension: String,
    )

    /**
     * 上传文件:校验 → 临时文件 → 正式文件 → 元数据持久化。
     *
     * @param ownerUserId 上传用户 id
     * @param file 上传的 multipart 文件
     * @return 持久化后的 [MediaAsset]
     * @throws ResponseStatusException 校验失败时抛出
     */
    fun upload(ownerUserId: String, file: MultipartFile, privateStorage: Boolean = false): MediaAsset {
        // 校验文件非空
        if (file.isEmpty) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "上传文件为空")
        }

        val originalName = file.originalFilename.orEmpty()
        val uploadType = classify(originalName, file.contentType)

        // 先用 multipart 元数据快速拒绝明显超限的请求,落盘后再按实际字节数复核
        val maxSize = properties.media.maxSize
        if (file.size > maxSize) {
            throw ResponseStatusException(
                HttpStatus.PAYLOAD_TOO_LARGE,
                "文件大小超过限制(${maxSize / 1024 / 1024} MiB)",
            )
        }

        // 生成唯一 id
        val medId = generateMedId()
        val storedFileName = "$medId.${uploadType.extension}"
        val storagePath = if (uploadType.kind == MediaKind.IMAGE && !privateStorage) "/media/$storedFileName" else storedFileName

        // 确保存储目录存在
        val mediaDir = storageRoot(if (privateStorage) MediaKind.FILE else uploadType.kind)
        try {
            Files.createDirectories(mediaDir)
        } catch (e: IOException) {
            throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "无法创建存储目录")
        }

        val tempPath = try {
            Files.createTempFile(mediaDir, "$medId-", ".upload")
        } catch (e: IOException) {
            throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "无法创建临时文件", e)
        }
        val targetPath = mediaDir.resolve(storedFileName)
        try {
            file.inputStream.use { input ->
                Files.copy(input, tempPath, StandardCopyOption.REPLACE_EXISTING)
            }
            val storedSize = Files.size(tempPath)
            if (storedSize == 0L) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "上传文件为空")
            }
            if (storedSize > maxSize) {
                throw ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "文件大小超过限制(${maxSize / 1024 / 1024} MiB)",
                )
            }
            if (!hasExpectedContent(tempPath, uploadType)) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "文件内容与声明类型不匹配")
            }

            moveToTarget(tempPath, targetPath)

            // 持久化元数据;任一步失败都清理本次产生的文件
            val asset = MediaAsset(
                id = medId,
                ownerUserId = ownerUserId,
                originalName = originalName.ifBlank { storedFileName },
                mime = uploadType.mime,
                size = storedSize,
                storagePath = storagePath,
                kind = uploadType.kind,
                privateStorage = privateStorage,
            )
            return mediaAssetRepository.save(asset)
        } catch (e: ResponseStatusException) {
            cleanup(tempPath, targetPath)
            throw e
        } catch (e: IOException) {
            cleanup(tempPath, targetPath)
            throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "文件写入失败", e)
        } catch (e: Exception) {
            cleanup(tempPath, targetPath)
            throw e
        }
    }

    /** 安全读取已绑定普通文件。调用方仍需先完成工单范围权限和引用校验。 */
    fun loadPrivateFile(asset: MediaAsset): Resource {
        if (asset.effectiveKind() != MediaKind.FILE) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
        }
        val storageKey = asset.storagePath
        val relativePath = try {
            Path.of(storageKey)
        } catch (_: Exception) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
        }
        if (relativePath.isAbsolute || relativePath.nameCount != 1 || relativePath.fileName.toString() != storageKey) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
        }
        val root = storageRoot(MediaKind.FILE)
        val path = root.resolve(relativePath).normalize()
        if (!path.startsWith(root) || !Files.isRegularFile(path)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
        }
        return FileSystemResource(path)
    }

    /**
     * Safe machine-facing read for an already authorized feedback media asset.
     *
     * The caller must prove ticket ownership/reference first. This method only
     * resolves the stored asset inside the configured root for its actual kind.
     */
    fun loadAuthorizedAsset(asset: MediaAsset): Resource {
        val kind = asset.effectiveKind()
        val storageKey = when (kind) {
            MediaKind.IMAGE ->
                if (asset.privateStorage) {
                    asset.storagePath
                } else {
                    asset.storagePath
                        .takeIf { it.startsWith("/media/") }
                        ?.removePrefix("/media/")
                        ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
                }
            MediaKind.FILE -> asset.storagePath
        }
        val relativePath = try {
            Path.of(storageKey)
        } catch (_: Exception) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
        }
        if (relativePath.isAbsolute || relativePath.nameCount != 1 || relativePath.fileName.toString() != storageKey) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
        }
        val root = storageRoot(if (asset.privateStorage) MediaKind.FILE else kind)
        val path = root.resolve(relativePath).normalize()
        if (!path.startsWith(root) || !Files.isRegularFile(path)) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
        }
        return FileSystemResource(path)
    }

    private fun classify(originalName: String, contentType: String?): UploadType {
        val extension = originalName.substringAfterLast('.', "").lowercase(Locale.ROOT)
        val declaredMime = contentType
            ?.substringBefore(';')
            ?.trim()
            ?.lowercase(Locale.ROOT)
            .orEmpty()
        val type = when (extension) {
            "jpg", "jpeg" -> UploadType(MediaKind.IMAGE, "image/jpeg", "jpg")
                .takeIf { declaredMime == "image/jpeg" }
            "png" -> UploadType(MediaKind.IMAGE, "image/png", "png")
                .takeIf { declaredMime == "image/png" }
            "webp" -> UploadType(MediaKind.IMAGE, "image/webp", "webp")
                .takeIf { declaredMime == "image/webp" }
            "txt", "log" -> UploadType(MediaKind.FILE, "text/plain", extension)
                .takeIf { declaredMime in TEXT_FILE_MIMES }
            "json" -> UploadType(MediaKind.FILE, "application/json", "json")
                .takeIf { declaredMime == "application/json" }
            "pdf" -> UploadType(MediaKind.FILE, "application/pdf", "pdf")
                .takeIf { declaredMime == "application/pdf" }
            "zip" -> UploadType(MediaKind.FILE, "application/zip", "zip")
                .takeIf { declaredMime == "application/zip" || declaredMime == "application/x-zip-compressed" }
            else -> null
        }
        return type ?: throw ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "仅支持 JPG、PNG、WebP、TXT、LOG、JSON、PDF 或 ZIP",
        )
    }

    private fun storageRoot(kind: MediaKind): Path {
        val publicRoot = Path.of(properties.media.dir).toAbsolutePath().normalize()
        if (kind == MediaKind.IMAGE) return publicRoot
        val privateRoot = Path.of(properties.media.privateDir).toAbsolutePath().normalize()
        if (privateRoot == publicRoot || privateRoot.startsWith(publicRoot)) {
            throw ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "私有附件目录配置不安全")
        }
        return privateRoot
    }

    private fun moveToTarget(source: Path, target: Path) {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE)
        } catch (_: AtomicMoveNotSupportedException) {
            Files.move(source, target)
        }
    }

    private fun hasExpectedContent(path: Path, type: UploadType): Boolean {
        val header = Files.newInputStream(path).use { input -> input.readNBytes(CONTENT_PREFIX_SIZE) }
        return when (type.mime) {
            "image/jpeg" -> startsWith(header, JPEG_SIGNATURE)
            "image/png" -> startsWith(header, PNG_SIGNATURE)
            "image/webp" -> startsWith(header, RIFF_SIGNATURE) && startsWith(header, WEBP_SIGNATURE, 8)
            "application/pdf" -> startsWith(header, PDF_SIGNATURE)
            "application/zip" -> ZIP_SIGNATURES.any { startsWith(header, it) }
            "text/plain", "application/json" -> header.none { it == 0.toByte() }
            else -> false
        }
    }

    private fun startsWith(actual: ByteArray, expected: ByteArray, offset: Int = 0): Boolean {
        return actual.size >= offset + expected.size && expected.indices.all { actual[offset + it] == expected[it] }
    }

    private fun cleanup(tempPath: Path, targetPath: Path) {
        deleteQuietly(tempPath)
        deleteQuietly(targetPath)
    }

    private fun deleteQuietly(path: Path) {
        try {
            Files.deleteIfExists(path)
        } catch (_: Exception) {
            // 清理失败不能覆盖原始上传或元数据异常
        }
    }

    /**
     * 生成 med_<16位hex> 格式的唯一 id
     */
    private fun generateMedId(): String {
        val bytes = ByteArray(8)
        random.nextBytes(bytes)
        val hex = bytes.joinToString("") { b ->
            val v = b.toInt() and 0xFF
            "${hexChars[v shr 4]}${hexChars[v and 0x0F]}"
        }
        return "med_$hex"
    }

    companion object {
        private const val CONTENT_PREFIX_SIZE = 8192
        private val TEXT_FILE_MIMES = setOf("", "text/plain", "text/x-log", "application/octet-stream")
        private val JPEG_SIGNATURE = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())
        private val PNG_SIGNATURE = byteArrayOf(
            0x89.toByte(),
            0x50.toByte(),
            0x4E.toByte(),
            0x47.toByte(),
            0x0D.toByte(),
            0x0A.toByte(),
            0x1A.toByte(),
            0x0A.toByte(),
        )
        private val RIFF_SIGNATURE = byteArrayOf(0x52, 0x49, 0x46, 0x46)
            .map { it.toByte() }
            .toByteArray()
        private val WEBP_SIGNATURE = byteArrayOf(0x57, 0x45, 0x42, 0x50)
            .map { it.toByte() }
            .toByteArray()
        private val PDF_SIGNATURE = "%PDF-".toByteArray()
        private val ZIP_SIGNATURES = listOf(
            byteArrayOf(0x50, 0x4B, 0x03, 0x04),
            byteArrayOf(0x50, 0x4B, 0x05, 0x06),
            byteArrayOf(0x50, 0x4B, 0x07, 0x08),
        )
    }
}
