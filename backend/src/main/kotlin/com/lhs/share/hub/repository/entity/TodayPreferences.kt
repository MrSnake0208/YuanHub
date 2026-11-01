package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("hub_user_today_preferences")
data class TodayPreferences(
    @Id val id: String,
    val userId: String,
    val layoutMode: String,
    val hiddenModules: List<String>,
    val schemaVersion: Int = 1,
    val version: Long = 1,
    val updatedAt: Instant,
)
