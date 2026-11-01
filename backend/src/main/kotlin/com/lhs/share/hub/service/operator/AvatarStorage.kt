package com.lhs.share.hub.service.operator

import com.lhs.share.config.external.ShareProperties
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import org.springframework.web.multipart.MultipartFile
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * 密探头像 webp 文件的落盘与清理。
 *
 * 契约：
 * - 文件以 `{operatorId}.webp` 命名存放于 `share.avatar.dir`（默认 ./data/avatar）；
 * - 对外以 `/avatar/{operatorId}.webp` 相对路径暴露（见 [com.lhs.share.config.AvatarStaticResourceConfig]）；
 * - operatorId 经白名单正则约束决定文件名，客户端文件名一律忽略 → 路径穿越不可达。
 */
@Component
class AvatarStorage(private val properties: ShareProperties) {

    /** operatorId 命名白名单：与目录写请求 id 校验一致，同时杜绝用 id 注入路径。 */
    fun requireSafeOperatorId(operatorId: String) {
        if (!OPERATOR_ID_PATTERN.matches(operatorId)) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Invalid operator id: $operatorId")
        }
    }

    /** 头像相对路径（写入字典 avatar 字段的值）。 */
    fun relativePath(operatorId: String): String = "/avatar/$operatorId.webp"

    /**
     * 持久化头像文件。校验 webp 魔数，先写临时文件再原子 rename，
     * 避免并发读到半写文件（同 id 重传即幂等覆盖）。
     *
     * @return 头像相对路径
     */
    fun save(operatorId: String, file: MultipartFile): String {
        requireSafeOperatorId(operatorId)
        if (file.isEmpty) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Avatar file is empty")
        }
        if (!isWebp(file)) {
            throw OperatorApiException(HttpStatus.UNPROCESSABLE_ENTITY, "schema_validation_failed", "Avatar must be a WebP image")
        }
        Files.createDirectories(directory())
        val tmp = directory().resolve("$operatorId.webp.tmp")
        val target = directory().resolve("$operatorId.webp")
        file.inputStream.use { input -> Files.copy(input, tmp, StandardCopyOption.REPLACE_EXISTING) }
        Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
        return relativePath(operatorId)
    }

    /** 删除头像文件；文件不存在时静默成功。 */
    fun delete(operatorId: String) {
        requireSafeOperatorId(operatorId)
        try {
            Files.deleteIfExists(directory().resolve("$operatorId.webp"))
        } catch (_: java.io.IOException) {
            // 清理失败仅遗留孤儿文件，无害，不阻断目录操作
        }
    }

    /**
     * 列出头像目录中已有的密探 id（`{operatorId}.webp` 去扩展名）。
     * 供存量头像回填使用：把直接放进目录的文件与字典字段关联；
     * 临时文件（.webp.tmp 等）、非法命名一律忽略。
     */
    fun existingOperatorIds(): Set<String> {
        val dir = directory()
        if (!Files.isDirectory(dir)) return emptySet()
        try {
            Files.newDirectoryStream(dir, "*.webp").use { ds ->
                return ds.map { it.fileName.toString().removeSuffix(".webp") }
                    .filter { OPERATOR_ID_PATTERN.matches(it) }
                    .toSet()
            }
        } catch (_: java.io.IOException) {
            return emptySet()
        }
    }

    private fun directory(): Path = Path.of(properties.avatar.dir).toAbsolutePath()

    /** WebP 魔数：RIFF (4B) + 文件大小 (4B) + WEBP (4B)。Content-Type 头不可信，以文件头为准。 */
    private fun isWebp(file: MultipartFile): Boolean {
        val head = try {
            file.inputStream.use { input -> input.readNBytes(WEBP_HEADER_SIZE) }
        } catch (_: java.io.IOException) {
            return false
        }
        if (head.size < WEBP_HEADER_SIZE) return false
        return head[0] == RIFF[0] && head[1] == RIFF[1] && head[2] == RIFF[2] && head[3] == RIFF[3] &&
            head[8] == WEBP[0] && head[9] == WEBP[1] && head[10] == WEBP[2] && head[11] == WEBP[3]
    }

    companion object {
        private val OPERATOR_ID_PATTERN = Regex("^char_[A-Za-z0-9_]+$")
        private const val WEBP_HEADER_SIZE = 12
        private val RIFF = byteArrayOf(0x52.toByte(), 0x49.toByte(), 0x46.toByte(), 0x46.toByte())
        private val WEBP = byteArrayOf(0x57.toByte(), 0x45.toByte(), 0x42.toByte(), 0x50.toByte())
    }
}
