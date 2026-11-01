package com.lhs.share.hub.controller.admin.request

data class AdminRoleUpdateRequest(
    val roles: Set<String> = emptySet(),
)
