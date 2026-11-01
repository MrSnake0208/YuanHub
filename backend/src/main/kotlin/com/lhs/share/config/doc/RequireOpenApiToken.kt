package com.lhs.share.config.doc

import io.swagger.v3.oas.annotations.security.SecurityRequirement
import java.lang.annotation.Inherited

@Target(AnnotationTarget.FUNCTION, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.RUNTIME)
@Inherited
@SecurityRequirement(name = SpringDocConfig.SECURITY_SCHEME_OPEN_API_TOKEN)
annotation class RequireOpenApiToken
