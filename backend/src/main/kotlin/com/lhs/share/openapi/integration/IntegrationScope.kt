package com.lhs.share.openapi.integration

enum class IntegrationScope(
    val key: String,
    val description: String,
) {
    FEEDBACK_READ("feedback:read", "读取授权范围内的反馈工单"),
    FEEDBACK_ANALYSIS_WRITE("feedback:analysis:write", "写入反馈 Agent 分析"),
    ;

    companion object {
        fun byKey(key: String): IntegrationScope? = entries.firstOrNull { it.key == key }

        fun listAll(): List<IntegrationScopeResponse> = entries.map {
            IntegrationScopeResponse(it.key, it.description)
        }
    }
}

data class IntegrationScopeResponse(
    val scope: String,
    val description: String,
)
