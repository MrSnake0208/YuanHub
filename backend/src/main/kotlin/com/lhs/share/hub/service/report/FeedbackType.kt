package com.lhs.share.hub.service.report

/** 反馈工单类型；FEEDBACK 仅用于兼容第一版数据和请求。 */
object FeedbackType {
    const val BUG = "BUG"
    const val EXPERIENCE = "EXPERIENCE"
    const val FEATURE = "FEATURE"
    const val CONTENT = "CONTENT"
    const val ACCOUNT = "ACCOUNT"
    const val REPORT = "REPORT"
    const val OTHER = "OTHER"
    const val LEGACY_FEEDBACK = "FEEDBACK"

    val all = linkedSetOf(BUG, EXPERIENCE, FEATURE, CONTENT, ACCOUNT, REPORT, OTHER)

    /** 举报身份在旧 FEEDBACK/category 记录中同样有效。 */
    fun isReport(type: String, category: String?): Boolean = type.trim().equals(REPORT, ignoreCase = true) ||
        (type.trim().equals(LEGACY_FEEDBACK, ignoreCase = true) && category?.trim().equals(REPORT, ignoreCase = true))
}
