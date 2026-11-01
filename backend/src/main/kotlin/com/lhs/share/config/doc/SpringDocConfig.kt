package com.lhs.share.config.doc

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.config.external.ShareProperties
import io.swagger.v3.core.jackson.ModelResolver
import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.media.ObjectSchema
import io.swagger.v3.oas.models.media.Schema
import io.swagger.v3.oas.models.security.SecurityScheme
import io.swagger.v3.oas.models.servers.Server
import org.springdoc.core.customizers.OpenApiCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * OpenAPI(Swagger)文档配置
 */
@Configuration
class SpringDocConfig(
    properties: ShareProperties,
) {
    private val info = properties.info
    private val jwt = properties.jwt

    @Bean
    fun shareOpenApi(): OpenAPI = OpenAPI().apply {
        info(
            Info().apply {
                title(this@SpringDocConfig.info.title)
                description(this@SpringDocConfig.info.description)
                version(this@SpringDocConfig.info.version)
            },
        )
        components(
            Components().apply {
                addSecuritySchemes(
                    SECURITY_SCHEME_JWT,
                    SecurityScheme().apply {
                        type(SecurityScheme.Type.HTTP)
                        scheme("bearer")
                        `in`(SecurityScheme.In.HEADER)
                        name(jwt.header)
                    },
                )
                addSecuritySchemes(
                    SECURITY_SCHEME_OPEN_API_TOKEN,
                    SecurityScheme().apply {
                        type(SecurityScheme.Type.HTTP)
                        scheme("bearer")
                        bearerFormat("API token")
                        `in`(SecurityScheme.In.HEADER)
                        name("Authorization")
                    },
                )
            },
        )
        servers(listOf(Server().url(this@SpringDocConfig.info.publicBaseUrl).description("Public HTTPS endpoint")))
    }

    @Bean
    fun modelResolver(objectMapper: ObjectMapper) = ModelResolver(objectMapper)

    @Bean
    fun shareNullableSchemaCustomizer(): OpenApiCustomizer = OpenApiCustomizer { openApi ->
        mapOf(
            "AccountShareResponse" to "share_code",
            "StarShareResponse" to "updated_at",
            "OperatorShareResponse" to "share_code",
            "OperatorShareViewResponse" to "updated_at",
        ).forEach { (name, property) ->
            openApi.components.schemas[name]?.properties?.get(property)?.apply {
                type = null
                types = setOf("string", "null")
            }
        }
    }

    @Bean
    fun inventoryConditionalSchemaCustomizer(): OpenApiCustomizer = OpenApiCustomizer { openApi ->
        openApi.components.addSchemas(
            INVENTORY_SNAPSHOT_SCOPE_PRESENT_SCHEMA,
            ObjectSchema()
                .addRequiredItem("snapshot_scope")
                .addProperty("snapshot_scope", Schema<Any>()),
        )
    }

    companion object {
        const val SECURITY_SCHEME_JWT: String = "Jwt"
        const val SECURITY_SCHEME_OPEN_API_TOKEN: String = "OpenApiToken"
        private const val INVENTORY_SNAPSHOT_SCOPE_PRESENT_SCHEMA: String = "InventorySnapshotScopePresent"
    }
}
