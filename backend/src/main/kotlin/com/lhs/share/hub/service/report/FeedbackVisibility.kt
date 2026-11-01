package com.lhs.share.hub.service.report

/**
 * 反馈公开可见性。
 *
 * 历史工单没有 visibility 字段,或字段为空白/未知值时,一律按 [PRIVATE] 处理,
 * 绝不因为上线共创中心而自动公开旧反馈。
 */
object FeedbackVisibility {
    const val PRIVATE = "PRIVATE"
    const val PUBLIC = "PUBLIC"

    val all = linkedSetOf(PRIVATE, PUBLIC)

    /** 只有明确为 PUBLIC 的才视为公开,其余(含 null / 空白 / 未知)全部视为 PRIVATE。 */
    fun normalize(value: String?): String {
        val normalized = value?.trim()?.uppercase()
        return if (normalized == PUBLIC) PUBLIC else PRIVATE
    }

    fun isPublic(value: String?): Boolean = normalize(value) == PUBLIC
}
