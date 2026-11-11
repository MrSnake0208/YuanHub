package com.lhs.share.hub.service.media

import com.lhs.share.config.external.ShareProperties
import com.qcloud.cos.COSClient
import com.qcloud.cos.ClientConfig
import com.qcloud.cos.auth.BasicCOSCredentials
import com.qcloud.cos.endpoint.UserSpecifiedEndpointBuilder
import com.qcloud.cos.exception.CosClientException
import com.qcloud.cos.exception.CosServiceException
import com.qcloud.cos.http.HttpMethodName
import com.qcloud.cos.http.HttpProtocol
import com.qcloud.cos.model.GeneratePresignedUrlRequest
import com.qcloud.cos.model.ObjectMetadata
import com.qcloud.cos.model.ResponseHeaderOverrides
import com.qcloud.cos.region.Region
import jakarta.annotation.PreDestroy
import org.springframework.core.io.InputStreamResource
import org.springframework.core.io.Resource
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.Date

@Service
class CosMediaStorage(properties: ShareProperties) {
    private val config = properties.media.cos.apply {
        region = region.trim()
        bucket = bucket.trim()
        endpoint = endpoint.trim()
        secretId = secretId.trim()
        secretKey = secretKey.trim()
    }
    private val client: COSClient? = if (config.enabled) {
        require(config.region.isNotBlank()) { "share.media.cos.region is required when COS is enabled" }
        require(config.bucket.isNotBlank()) { "share.media.cos.bucket is required when COS is enabled" }
        require(config.secretId.isNotBlank()) { "share.media.cos.secret-id is required when COS is enabled" }
        require(config.secretKey.isNotBlank()) { "share.media.cos.secret-key is required when COS is enabled" }
        require(config.putUrlTtlSeconds > 0 && config.getUrlTtlSeconds > 0) { "COS URL TTL seconds must be positive" }
        require(
            config.endpoint.isEmpty() ||
                (
                    config.endpoint.matches(
                        Regex("[A-Za-z0-9][A-Za-z0-9.-]*"),
                    ) && config.endpoint.endsWith(".myqcloud.com", ignoreCase = true)
                    ),
        ) {
            "share.media.cos.endpoint must be a .myqcloud.com hostname without scheme, port or path"
        }
        val clientConfig = ClientConfig(Region(config.region)).apply {
            httpProtocol = HttpProtocol.https
            if (config.endpoint.isNotEmpty()) {
                endpointBuilder = UserSpecifiedEndpointBuilder(config.endpoint, config.endpoint)
            }
        }
        COSClient(BasicCOSCredentials(config.secretId, config.secretKey), clientConfig)
    } else {
        null
    }

    val enabled: Boolean get() = client != null
    val putUrlTtlSeconds: Long get() = config.putUrlTtlSeconds

    fun presignPut(key: String, headers: Map<String, String>): String = presign(
        GeneratePresignedUrlRequest(config.bucket, key, HttpMethodName.PUT).apply {
            expiration = Date.from(Instant.now().plusSeconds(config.putUrlTtlSeconds))
            headers.forEach { (name, value) -> putCustomRequestHeader(name, value) }
        },
    )

    fun presignGet(key: String): String = presign(
        GeneratePresignedUrlRequest(config.bucket, key, HttpMethodName.GET).apply {
            expiration = Date.from(Instant.now().plusSeconds(config.getUrlTtlSeconds))
            responseHeaders = ResponseHeaderOverrides().apply {
                contentType = "image/jpeg"
                contentDisposition = "inline"
                cacheControl = "no-store"
            }
        },
    )

    private fun presign(request: GeneratePresignedUrlRequest): String {
        val url = try {
            requiredClient().generatePresignedUrl(request)
        } catch (_: CosClientException) {
            throw unavailable("COS 图片签名失败")
        }
        if (url.protocol != "https" || !url.host.endsWith(".myqcloud.com", ignoreCase = true) || url.port !in setOf(-1, 443) ||
            url.userInfo != null
        ) {
            throw unavailable("COS 直传域名配置不符合要求")
        }
        return url.toString()
    }

    fun headSize(key: String): Long? = try {
        requiredClient().getObjectMetadata(config.bucket, key).contentLength
    } catch (e: CosServiceException) {
        if (e.statusCode == 404 && e.errorCode != "NoSuchBucket") null else throw unavailable("COS 图片元数据读取失败")
    } catch (_: CosClientException) {
        throw unavailable("COS 图片元数据读取失败")
    }

    fun put(key: String, path: Path, mime: String, size: Long) {
        val cos = requiredClient()
        val metadata = ObjectMetadata().apply {
            contentType = mime
            contentLength = size
        }
        try {
            Files.newInputStream(path).use { input -> cos.putObject(config.bucket, key, input, metadata) }
        } catch (_: CosClientException) {
            throw unavailable("COS 图片上传失败")
        }
    }

    fun load(key: String): Resource {
        val cos = requiredClient()
        val obj = try {
            cos.getObject(config.bucket, key)
        } catch (e: CosServiceException) {
            if (e.statusCode == 404 && e.errorCode == "NoSuchKey") {
                throw ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在")
            }
            throw unavailable("COS 图片读取失败")
        } catch (_: CosClientException) {
            throw unavailable("COS 图片读取失败")
        }
        val length = obj.objectMetadata.contentLength
        // 默认 InputStreamResource.contentLength() 会读空流;长度必须来自对象元数据。
        return object : InputStreamResource(obj.objectContent) {
            override fun contentLength(): Long = length
        }
    }

    fun delete(key: String) {
        val cos = requiredClient()
        try {
            cos.deleteObject(config.bucket, key)
        } catch (e: CosServiceException) {
            if (e.statusCode != 404 || e.errorCode != "NoSuchKey") throw unavailable("COS 图片删除失败")
        } catch (_: CosClientException) {
            throw unavailable("COS 图片删除失败")
        }
    }

    private fun requiredClient(): COSClient = client ?: throw unavailable("COS 私有图片存储未启用")

    private fun unavailable(reason: String) = ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, reason)

    @PreDestroy
    fun close() {
        client?.shutdown()
    }
}
