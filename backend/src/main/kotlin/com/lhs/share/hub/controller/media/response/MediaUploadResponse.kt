package com.lhs.share.hub.controller.media.response

import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.repository.entity.effectiveKind
import java.time.Instant

/**
 * 媒体文件上传响应
 *
 * @param id 媒体资产 id(med_xxx)
 * @param url 可访问的完整 URL
 * @param mime 文件 MIME 类型
 * @param size 文件大小(字节)
 * @param createdAt 上传时间
 */
data class MediaUploadResponse(
    val id: String,
    val kind: String,
    val name: String,
    val url: String?,
    val mime: String,
    val size: Long,
    val createdAt: Instant,
) {
    companion object {
        /**
         * 从 [MediaAsset] 和基础 URL 构造响应
         *
         * @param asset 持久化后的媒体资产
         * @param baseUrl 应用基础 URL(如 https://hub.maayuan.fun:16666),用于拼接完整访问地址
         */
        fun of(asset: MediaAsset, baseUrl: String): MediaUploadResponse {
            val kind = asset.effectiveKind()
            return MediaUploadResponse(
                id = checkNotNull(asset.id) { "实体未持久化" },
                kind = kind.name,
                name = asset.originalName,
                url = if (kind == MediaKind.IMAGE && !asset.privateStorage) "${baseUrl.trimEnd('/')}${asset.storagePath}" else null,
                mime = asset.mime,
                size = asset.size,
                createdAt = asset.createdAt,
            )
        }
    }
}
