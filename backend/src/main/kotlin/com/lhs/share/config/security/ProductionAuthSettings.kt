package com.lhs.share.config.security

import com.lhs.share.config.external.ShareProperties
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

@Component
@Profile("!local & !test", "prod")
class ProductionAuthSettings(
    properties: ShareProperties,
    @param:Value("\${debug.email.no-send:false}") noSend: Boolean,
) {
    init {
        val secret = properties.jwt.secret
        require(
            secret.trim().length >= 48 && !secret.startsWith("please-change") &&
                !secret.startsWith("local-development") && !secret.startsWith("local-tests-only") &&
                secret.toSet().size > 1,
        ) { "Configure share.jwt.secret with a random production signing key of at least 48 characters" }
        require(!noSend) { "Production email delivery must be enabled" }
    }
}
