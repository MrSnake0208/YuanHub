package com.lhs.share.config.doc

import io.swagger.v3.oas.annotations.security.SecurityRequirement
import java.lang.annotation.Inherited

/**
 * 标注在接口上,声明该接口需要 JWT 认证(用于 OpenAPI 文档展示)
 */
@Target(
    AnnotationTarget.FUNCTION,
    AnnotationTarget.PROPERTY_GETTER,
    AnnotationTarget.PROPERTY_SETTER,
    AnnotationTarget.CLASS,
    AnnotationTarget.ANNOTATION_CLASS,
)
@Retention(
    AnnotationRetention.RUNTIME,
)
@Inherited
@SecurityRequirement(name = SpringDocConfig.SECURITY_SCHEME_JWT)
annotation class RequireJwt
