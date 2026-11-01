package com.lhs.share.hub.controller.account.response

data class AccountShareResponse(val accountId: String, val active: Boolean, val shareCode: String?, val scopes: List<String>)
