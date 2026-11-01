package com.lhs.share.hub.service.beta

import org.springframework.http.HttpStatus

class BetaApiException(val status: HttpStatus, val code: String, override val message: String) : RuntimeException(message)
