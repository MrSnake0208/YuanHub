package com.lhs.share.hub.service.changelog

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.MediaAssetRepository
import com.lhs.share.hub.repository.entity.MediaKind
import com.lhs.share.hub.repository.entity.effectiveKind
import org.springframework.stereotype.Component
import java.net.URI

data class ValidatedChangelogContent(
    val body: Map<String, Any?>,
    val mediaIds: Set<String>,
)

@Component
class ChangelogContentValidator(
    private val objectMapper: ObjectMapper,
    private val mediaRepository: MediaAssetRepository,
) {
    fun validate(body: JsonNode, actorUserId: String, retainedMediaIds: Set<String>): ValidatedChangelogContent {
        if (objectMapper.writeValueAsBytes(body).size > MAX_BYTES) invalid("body", "正文不能超过 200 KiB")
        val copy = body.deepCopy<JsonNode>()
        val mediaIds = linkedSetOf<String>()
        var nodes = 0
        var hasContent = false

        fun visit(node: JsonNode, path: String) {
            if (!node.isObject) invalid(path, "节点必须是对象")
            nodes += 1
            if (nodes > MAX_NODES) invalid("body", "正文节点不能超过 1000 个")
            val type = node.path("type").takeIf(JsonNode::isTextual)?.asText() ?: invalid("$path.type", "缺少节点类型")
            if (type !in ALLOWED_NODES) invalid("$path.type", "不支持的节点类型: $type")
            val allowedFields = when (type) {
                "text" -> setOf("type", "text", "marks")
                "heading", "image" -> setOf("type", "attrs", "content")
                "orderedList" -> setOf("type", "attrs", "content")
                else -> setOf("type", "content")
            }
            rejectUnknownFields(node, allowedFields, path)

            if (type == "text") {
                val text = node.path("text").takeIf(JsonNode::isTextual)?.asText() ?: invalid("$path.text", "文本节点缺少内容")
                if (text.isNotBlank()) hasContent = true
                validateMarks(node.get("marks"), "$path.marks")
            } else if (node.has("marks")) {
                invalid("$path.marks", "该节点不支持格式标记")
            }

            when (type) {
                "doc" -> if (path != "body") invalid(path, "doc 只能作为根节点")
                "heading" -> validateHeading(node.get("attrs"), "$path.attrs")
                "orderedList" -> validateOrderedList(node.get("attrs"), "$path.attrs")
                "image" -> {
                    validateImage(node as ObjectNode, actorUserId, retainedMediaIds, mediaIds, path)
                    hasContent = true
                }
            }

            val content = node.get("content")
            if (type == "image" || type == "text") {
                if (content != null && (!content.isArray || !content.isEmpty)) invalid("$path.content", "该节点不能包含子节点")
            } else {
                if (type == "doc" && (content == null || !content.isArray)) invalid("$path.content", "正文缺少内容")
                if (content != null && !content.isArray) invalid("$path.content", "content 必须是数组")
                validateChildren(type, content, path)
                content?.forEachIndexed { index, child -> visit(child, "$path.content[$index]") }
            }
        }

        visit(copy, "body")
        if (copy.path("type").asText() != "doc") invalid("body.type", "根节点必须是 doc")
        if (!hasContent) invalid("body", "正文不能为空")
        return ValidatedChangelogContent(
            objectMapper.convertValue(copy, object : TypeReference<Map<String, Any?>>() {}),
            mediaIds,
        )
    }

    private fun validateHeading(attrs: JsonNode?, path: String) {
        if (attrs == null || !attrs.isObject) invalid(path, "标题缺少属性")
        rejectUnknownFields(attrs, setOf("level"), path)
        val level = attrs.path("level")
        if (!level.isIntegralNumber || level.asInt() !in 2..3) invalid("$path.level", "只支持二级和三级标题")
    }

    private fun validateOrderedList(attrs: JsonNode?, path: String) {
        if (attrs == null || !attrs.isObject) invalid(path, "有序列表缺少属性")
        rejectUnknownFields(attrs, setOf("start", "type"), path)
        if (!attrs.path("start").isIntegralNumber || attrs.path("start").asInt() < 1) {
            invalid("$path.start", "有序列表起始序号必须是正整数")
        }
        val listType = attrs.get("type")
        if (listType != null && !listType.isNull && (!listType.isTextual || listType.asText() !in LIST_TYPES)) {
            invalid("$path.type", "有序列表编号类型无效")
        }
    }

    private fun validateChildren(type: String, content: JsonNode?, path: String) {
        val childTypes = content?.map { it.path("type").asText() }.orEmpty()
        val valid = when (type) {
            "doc", "blockquote" -> childTypes.all { it in BLOCK_NODES }
            "paragraph", "heading" -> childTypes.all { it in INLINE_NODES }
            "bulletList", "orderedList" -> childTypes.isNotEmpty() && childTypes.all { it == "listItem" }
            "listItem" -> childTypes.firstOrNull() == "paragraph" && childTypes.drop(1).all { it in BLOCK_NODES }
            "hardBreak" -> childTypes.isEmpty()
            else -> true
        }
        if (!valid) invalid("$path.content", "节点包含不支持的子节点")
    }

    private fun validateMarks(marks: JsonNode?, path: String) {
        if (marks == null) return
        if (!marks.isArray) invalid(path, "marks 必须是数组")
        marks.forEachIndexed { index, mark ->
            if (!mark.isObject) invalid("$path[$index]", "格式标记必须是对象")
            val type = mark.path("type").takeIf(JsonNode::isTextual)?.asText() ?: invalid("$path[$index].type", "缺少格式类型")
            if (type !in ALLOWED_MARKS) invalid("$path[$index].type", "不支持的格式: $type")
            rejectUnknownFields(mark, if (type == "link") setOf("type", "attrs") else setOf("type"), "$path[$index]")
            if (type == "link") validateLink(mark.get("attrs"), "$path[$index].attrs")
        }
    }

    private fun validateLink(attrs: JsonNode?, path: String) {
        if (attrs == null || !attrs.isObject) invalid(path, "链接缺少属性")
        rejectUnknownFields(attrs, setOf("href", "target", "rel", "class"), path)
        val href = attrs.path("href").takeIf(JsonNode::isTextual)?.asText()?.trim() ?: invalid("$path.href", "链接地址不能为空")
        if (href.length > 2048 || href.startsWith("//") || (!href.startsWith("/") && !isHttpUrl(href))) {
            invalid("$path.href", "链接只支持站内路径或 http/https 地址")
        }
        val target = attrs.get("target")
        if (target != null && !target.isNull && target.asText() !in setOf("_blank", "_self")) {
            invalid("$path.target", "链接打开方式无效")
        }
        val cssClass = attrs.get("class")
        if (cssClass != null && !cssClass.isNull) invalid("$path.class", "链接不支持自定义样式")
    }

    private fun validateImage(
        node: ObjectNode,
        actorUserId: String,
        retainedMediaIds: Set<String>,
        mediaIds: MutableSet<String>,
        path: String,
    ) {
        val attrs = node.get("attrs")
        if (attrs == null || !attrs.isObject) invalid("$path.attrs", "图片缺少属性")
        rejectUnknownFields(attrs, setOf("src", "alt", "title", "media_id"), "$path.attrs")
        if (!attrs.path("src").isTextual) invalid("$path.attrs.src", "图片缺少地址")
        val mediaId = attrs.path("media_id").takeIf(JsonNode::isTextual)?.asText()
            ?: invalid("$path.attrs.media_id", "图片缺少媒体 ID")
        val altNode = attrs.get("alt")
        if (altNode != null && !altNode.isNull && !altNode.isTextual) invalid("$path.attrs.alt", "图片说明必须是文本")
        val alt = altNode?.takeUnless(JsonNode::isNull)?.asText() ?: ""
        if (alt.length > 200) invalid("$path.attrs.alt", "图片说明不能超过 200 个字符")
        val title = attrs.get("title")
        if (title != null && !title.isNull) invalid("$path.attrs.title", "图片不支持 title 属性")
        val asset = mediaRepository.findById(mediaId).orElse(null)
            ?: invalid("$path.attrs.media_id", "图片不存在")
        if (asset.deletedAt != null || asset.effectiveKind() != MediaKind.IMAGE || asset.mime !in IMAGE_MIMES) {
            invalid("$path.attrs.media_id", "图片不可用")
        }
        if (mediaId !in retainedMediaIds && asset.ownerUserId != actorUserId) {
            invalid("$path.attrs.media_id", "不能引用其他用户的图片")
        }
        (attrs as ObjectNode).put("src", asset.storagePath)
        mediaIds += mediaId
    }

    private fun rejectUnknownFields(node: JsonNode, allowed: Set<String>, path: String) {
        node.fieldNames().forEachRemaining { if (it !in allowed) invalid("$path.$it", "不支持的字段") }
    }

    private fun isHttpUrl(value: String): Boolean = try {
        URI(value).scheme?.lowercase() in setOf("http", "https")
    } catch (_: Exception) {
        false
    }

    private fun invalid(field: String, message: String): Nothing = throw ChangelogApiException(
        org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
        "schema_validation_failed",
        message,
        field,
    )

    private companion object {
        const val MAX_BYTES = 200 * 1024
        const val MAX_NODES = 1000
        val ALLOWED_NODES = setOf(
            "doc",
            "paragraph",
            "heading",
            "text",
            "hardBreak",
            "bulletList",
            "orderedList",
            "listItem",
            "blockquote",
            "image",
        )
        val BLOCK_NODES = setOf("paragraph", "heading", "bulletList", "orderedList", "blockquote", "image")
        val INLINE_NODES = setOf("text", "hardBreak")
        val LIST_TYPES = setOf("1", "a", "A", "i", "I")
        val ALLOWED_MARKS = setOf("bold", "italic", "link")
        val IMAGE_MIMES = setOf("image/jpeg", "image/png", "image/webp")
    }
}
