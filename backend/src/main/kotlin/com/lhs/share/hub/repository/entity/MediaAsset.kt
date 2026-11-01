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
 * 存储用户上传的媒体文件元数据。图片位于公开目录,普通文件位于私有目录。
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
     * 存储路径(相对媒体目录,如 /media/med_xxx.webp)
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
) : Serializable

enum class MediaKind {
    IMAGE,
    FILE,
}

fun MediaAsset.effectiveKind(): MediaKind = kind ?: if (mime.startsWith("image/")) MediaKind.IMAGE else MediaKind.FILE
