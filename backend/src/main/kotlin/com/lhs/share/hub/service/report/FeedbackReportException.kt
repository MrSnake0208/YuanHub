package com.lhs.share.hub.service.report

/**
 * 反馈工单业务异常
 */
class FeedbackReportException(
    val statusCode: Int,
    override val message: String,
) : RuntimeException(message)