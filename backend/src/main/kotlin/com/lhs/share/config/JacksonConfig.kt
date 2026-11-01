package com.lhs.share.config

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder

/**
 * Jackson 全局配置
 *
 * 注:字段命名策略(SNAKE_CASE)、时区等在 application.yml 的 spring.jackson 中配置
 */
@Configuration
class JacksonConfig {
    @Bean
    fun objectMapper(builder: Jackson2ObjectMapperBuilder): ObjectMapper = builder
        .modulesToInstall(JavaTimeModule())
        .featuresToDisable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .build()
}
