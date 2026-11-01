package com.lhs.share.hub.controller.today.response

import java.time.Instant

data class TodayPreferencesResponse(
    val layoutMode: String,
    val hiddenModules: List<String> = emptyList(),
    val schemaVersion: Int = 1,
    val version: Long = 0,
    val updatedAt: Instant? = null,
)
