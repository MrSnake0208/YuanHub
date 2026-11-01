package com.lhs.share

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.autoconfigure.data.mongo.MongoRepositoriesAutoConfiguration
import org.springframework.boot.context.properties.ConfigurationPropertiesScan
import org.springframework.boot.runApplication
import org.springframework.cache.annotation.EnableCaching
import org.springframework.scheduling.annotation.EnableAsync
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity

/**
 * 应用入口
 *
 * 开启异步任务、缓存抽象、定时任务和方法级安全校验
 */
@EnableAsync
@EnableCaching
@EnableScheduling
@SpringBootApplication(exclude = [MongoRepositoriesAutoConfiguration::class])
@ConfigurationPropertiesScan
@EnableMethodSecurity
class ShareApplication

fun main(args: Array<String>) {
    runApplication<ShareApplication>(*args)
}
