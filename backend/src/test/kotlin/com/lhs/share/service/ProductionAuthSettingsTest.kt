package com.lhs.share.service

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.config.security.ProductionAuthSettings
import com.lhs.share.controller.DemoController
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springdoc.core.configuration.SpringDocConfiguration
import org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration
import org.springdoc.webmvc.ui.SwaggerConfig
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.boot.test.context.runner.WebApplicationContextRunner
import org.springframework.context.annotation.Profile
import org.springframework.core.env.Profiles
import org.springframework.core.io.ClassPathResource
import org.springframework.mock.env.MockEnvironment

class ProductionAuthSettingsTest {
    @Test
    fun `base production settings register neither docs nor demo controller`() {
        WebApplicationContextRunner()
            .withPropertyValues("spring.profiles.active=prod")
            .withInitializer { context ->
                val yaml = YamlPropertySourceLoader().load("base", ClassPathResource("application.yml")).single()
                context.environment.propertySources.addLast(yaml)
            }
            .withUserConfiguration(
                SpringDocConfiguration::class.java,
                SpringDocWebMvcConfiguration::class.java,
                SwaggerConfig::class.java,
                DemoController::class.java,
            )
            .run { context ->
                assertNull(context.startupFailure)
                assertTrue(context.getBeansOfType(SpringDocWebMvcConfiguration::class.java).isEmpty())
                assertTrue(context.getBeansOfType(SwaggerConfig::class.java).isEmpty())
                assertTrue(context.getBeansOfType(DemoController::class.java).isEmpty())
            }
    }

    @Test
    fun `unsafe configuration fails without changing the supplied signing key`() {
        val properties = ShareProperties()
        for (weak in listOf("", "please-change-me-to-a-long-random-secret", "x".repeat(64))) {
            properties.jwt.secret = weak
            assertThrows(IllegalArgumentException::class.java) { ProductionAuthSettings(properties, false) }
        }
        properties.jwt.secret = java.util.UUID.randomUUID().toString() + java.util.UUID.randomUUID()
        assertThrows(IllegalArgumentException::class.java) { ProductionAuthSettings(properties, true) }
        ProductionAuthSettings(properties, false)
    }

    @Test
    fun `production including mixed profiles enforces secrets and excludes demo routes`() {
        fun active(type: Class<*>, vararg profiles: String): Boolean {
            val env = MockEnvironment().apply { setActiveProfiles(*profiles) }
            return env.acceptsProfiles(Profiles.of(*type.getAnnotation(Profile::class.java).value))
        }
        for (profiles in listOf(arrayOf("prod"), arrayOf("prod", "local"))) {
            assertTrue(active(ProductionAuthSettings::class.java, *profiles))
            assertFalse(active(DemoController::class.java, *profiles))
        }
        assertTrue(active(DemoController::class.java, "local"))
    }
}
