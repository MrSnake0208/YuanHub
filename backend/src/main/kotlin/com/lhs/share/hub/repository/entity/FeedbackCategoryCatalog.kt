package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.annotation.Version
import org.springframework.data.mongodb.core.mapping.Document

data class FeedbackCategory(
    val key: String,
    val label: String,
    val builtinKey: String? = null,
    val hidden: Boolean = false,
    val spaceId: String = "yuanhub",
)

data class FeedbackSpace(val id: String, val label: String, val active: Boolean = true)

@Document("feedback_category_catalog")
data class FeedbackCategoryCatalog(
    @Id val id: String = "feedback",
    val categories: List<FeedbackCategory>,
    @Version val version: Long? = null,
    val spaces: List<FeedbackSpace> = listOf(FeedbackSpace("yuanhub", "YuanHub（主站）")),
)
