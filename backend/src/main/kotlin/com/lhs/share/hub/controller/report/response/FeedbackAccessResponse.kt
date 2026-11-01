package com.lhs.share.hub.controller.report.response

import com.lhs.share.hub.repository.entity.FeedbackSpace
import java.time.Instant

data class FeedbackAreaOptionResponse(
    val key: String,
    val label: String,
    val builtinKey: String? = null,
    val hidden: Boolean = false,
    val spaceId: String = "yuanhub",
)

data class FeedbackAssigneeResponse(
    val id: String,
    val userName: String,
)

data class CurrentFeedbackAccessResponse(
    val superAdmin: Boolean,
    val receiveAreas: Set<String>,
    val manageAreas: Set<String>,
    val availableAreas: List<FeedbackAreaOptionResponse>,
    val feedbackRoles: Set<String> = emptySet(),
    val operatorAreas: Set<String> = emptySet(),
    val developerAreas: Set<String> = emptySet(),
    val availableWorkAreas: List<FeedbackAreaOptionResponse> = emptyList(),
    val receiveCategories: Set<String> = receiveAreas,
    val manageCategories: Set<String> = manageAreas,
    val availableCategories: List<FeedbackAreaOptionResponse> = availableAreas,
    val categoryCatalog: List<FeedbackAreaOptionResponse> = availableAreas,
    val manageableSpaces: List<FeedbackSpace> = emptyList(),
    val spaces: List<FeedbackSpace> = emptyList(),
)

data class FeedbackAccessGrantResponse(
    val userId: String,
    val userName: String,
    val receiveAreas: Set<String>,
    val manageAreas: Set<String>,
    val updatedBy: String,
    val updatedAt: Instant,
    val feedbackRoles: Set<String> = emptySet(),
    val operatorAreas: Set<String> = emptySet(),
    val developerAreas: Set<String> = emptySet(),
    val receiveCategories: Set<String> = receiveAreas,
    val manageCategories: Set<String> = manageAreas,
)
