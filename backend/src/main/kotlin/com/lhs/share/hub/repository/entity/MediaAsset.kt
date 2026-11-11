package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.index.Indexed
import org.springframework.data.mongodb.core.mapping.Document
import java.io.Serializable
import java.time.Instant

/**
 * Hub 库媒体资产实体(HubBackend.hub_media)
 *
 * 存储媒体元数据。公开图片位于本地公开目录,私有图片可存 COS,其他附件位于本地私有目录。
 * 软删除:删除时设置 deletedAt,不物理移除文件。
 */
@Document("hub_media")
@CompoundIndex(name = "idx_owner_created", def = "{'ownerUserId': 1, 'createdAt': -1}")
data class MediaAsset(
    @Id
    val id: String? = null,

    /**
     * 上传用户 id(引用 MaaBackend.maa_user.userId)
     */
    val ownerUserId: String,

    /**
     * 原始文件名(上传时用户提供的文件名)
     */
    val originalName: String,

    /**
     * MIME 类型:image/jpeg | image/png | image/webp
     */
    val mime: String,

    /**
     * 文件大小(字节)
     */
    val size: Long,

    /**
     * 本地存储路径或 COS 对象 key,由 storageBackend 区分。
     */
    val storagePath: String,

    /**
     * 创建时间
     */
    val createdAt: Instant = Instant.now(),

    /**
     * 软删除时间,非空表示已删除
     */
    @Indexed
    val deletedAt: Instant? = null,

    /**
     * 媒体类别。历史记录没有该字段时根据 MIME 兼容推导。
     */
    val kind: MediaKind? = null,
    val privateStorage: Boolean = false,
    @Indexed
    val diagnosticEventId: String? = null,
    @Indexed
    val diagnosticExpiresAt: Instant? = null,
    /** null 兼容历史本地文件;"cos" 表示私有 COS 对象。 */
    val storageBackend: String? = null,
    /** 诊断图片状态;旧数据默认已就绪。 */
    val status: String = "ready",
) : Serializable

enum class MediaKind {
    IMAGE,
    FILE,
}

fun MediaAsset.effectiveKind(): MediaKind = kind ?: if (mime.startsWith("image/")) MediaKind.IMAGE else MediaKind.FILE
