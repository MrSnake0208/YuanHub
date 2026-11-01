package com.lhs.share.testinfra

import org.springframework.beans.factory.config.BeanFactoryPostProcessor
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import java.net.URI
import java.nio.file.Path

/** This class is on the test classpath only. Normal component scanning installs
 * a guard BEFORE Mongo/Redis/storage beans are instantiated, including IDE runs.
 * Unlike @TestConfiguration it cannot silently be excluded from discovery. */
@Configuration(proxyBeanMethods = false)
class TestApplicationSafety {
    companion object {
        @Bean
        @JvmStatic
        fun refuseLiveTestConnections(environment: Environment): BeanFactoryPostProcessor = BeanFactoryPostProcessor {
            verify(environment)
        }

        fun verify(environment: Environment) {
            require(environment.activeProfiles.toSet() == setOf("test")) {
                "Tests require ONLY the test profile; refusing dev/prod configuration"
            }
            for (key in listOf("spring.data.mongodb.uri", "share.mongo.hub-uri")) {
                val value = requireNotNull(environment.getProperty(key)) { "Test Mongo URI must be explicit: $key" }
                val uri = URI(value)
                val deadPort = uri.scheme == "mongodb" && uri.host == "127.0.0.1" && uri.port == 1 &&
                    uri.userInfo == null && uri.path.startsWith("/yuanhub_test_")
                require(deadPort || TestMongo.isOwnedUri(value)) { "Refusing Mongo connection not allocated by this test JVM: $key" }
            }
            val redis = environment.getProperty("spring.data.redis.url", "")
            require(redis == "redis://127.0.0.1:1" || TestRedis.isOwnedUri(redis)) { "Refusing external Redis in test JVM" }
            require(environment.getProperty("debug.email.no-send", Boolean::class.java, false)) { "Tests must not send mail" }
            val base = Path.of("build/test-data").toAbsolutePath().normalize()
            for (key in listOf("share.avatar.dir", "share.media.dir", "share.media.private-dir", "share.star-capture.dir")) {
                val value = requireNotNull(environment.getProperty(key)) { "Explicit test storage required: $key" }
                require(Path.of(value).toAbsolutePath().normalize().startsWith(base)) { "Refusing storage outside build/test-data: $key" }
            }
        }
    }
}
