package com.lhs.share.config.mongo

import com.mongodb.ConnectionString
import com.mongodb.client.MongoClient
import com.mongodb.client.MongoClients
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Primary
import org.springframework.data.mongodb.MongoDatabaseFactory
import org.springframework.data.mongodb.MongoTransactionManager
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.SimpleMongoClientDatabaseFactory
import org.springframework.data.mongodb.core.convert.MongoConverter
import org.springframework.data.mongodb.repository.config.EnableMongoRepositories
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.util.StringUtils

/**
 * 主库(MaaBackend)配置:用户系统,连接串来自 spring.data.mongodb.uri
 *
 * 仓储扫描范围:com.lhs.share.repository(与自动配置语义一致,但显式绑定本模板)
 */
@Configuration
@EnableMongoRepositories(
    basePackages = ["com.lhs.share.repository"],
    mongoTemplateRef = "mongoTemplate",
)
class MaaMongoConfig {
    /**
     * 主库 MongoClient(与原来自动配置等价,显式声明以配合双库)
     */
    @Bean
    @Primary
    fun mongoClient(@Value("\${spring.data.mongodb.uri}") uri: String): MongoClient {
        return MongoClients.create(uri)
    }

    /**
     * 主库连接工厂,库名从连接串解析(兼容 uri 中不写库名的情况)
     */
    @Bean
    @Primary
    fun mongoDatabaseFactory(
        @Qualifier("mongoClient") client: MongoClient,
        @Value("\${spring.data.mongodb.uri}") uri: String,
    ): MongoDatabaseFactory {
        val dbName = ConnectionString(uri).database ?: "MaaBackend"
        return SimpleMongoClientDatabaseFactory(client, dbName)
    }

    /**
     * 主库模板,与自动配置同名,现有代码注入 MongoTemplate 不受影响
     */
    @Bean
    @Primary
    fun mongoTemplate(@Qualifier("mongoDatabaseFactory") factory: MongoDatabaseFactory, converter: MongoConverter): MongoTemplate {
        return MongoTemplate(factory, converter)
    }
}

/**
 * Hub 库(HubBackend)配置:其他业务数据
 *
 * 仓储扫描范围:com.lhs.share.hub.repository(独立顶层包,避免与主库仓储互相包含)
 *
 * hub-uri 配置项 share.mongo.hub-uri:
 * - 不配置(空)时复用主库连接(同一 MongoDB 实例,仅切换库名)
 * - 配置时使用独立连接(不同实例/不同账号)
 */
@Configuration
@EnableMongoRepositories(
    basePackages = ["com.lhs.share.hub.repository"],
    mongoTemplateRef = "hubMongoTemplate",
)
class HubMongoConfig {
    /**
     * Hub 库 MongoClient,uri 为空时复用主库连接
     */
    @Bean
    fun hubMongoClient(
        @Value("\${spring.data.mongodb.uri}") maaUri: String,
        @Value("\${share.mongo.hub-uri:}") hubUri: String,
    ): MongoClient {
        return MongoClients.create(if (StringUtils.hasText(hubUri)) hubUri else maaUri)
    }

    /**
     * Hub 库连接工厂,固定库名 HubBackend
     */
    @Bean
    fun hubMongoDatabaseFactory(
        @Qualifier("hubMongoClient") client: MongoClient,
        @Value("\${share.mongo.hub-uri:}") hubUri: String,
    ): MongoDatabaseFactory {
        val dbName = if (StringUtils.hasText(hubUri)) {
            ConnectionString(hubUri).database ?: "HubBackend"
        } else {
            "HubBackend"
        }
        return SimpleMongoClientDatabaseFactory(client, dbName)
    }

    /**
     * Hub 库模板
     */
    @Bean
    fun hubMongoTemplate(@Qualifier("hubMongoDatabaseFactory") factory: MongoDatabaseFactory, converter: MongoConverter): MongoTemplate {
        return MongoTemplate(factory, converter)
    }

    @Bean
    fun hubTransactionManager(@Qualifier("hubMongoDatabaseFactory") factory: MongoDatabaseFactory): MongoTransactionManager =
        MongoTransactionManager(factory)

    @Bean
    fun hubTransactionTemplate(@Qualifier("hubTransactionManager") transactionManager: MongoTransactionManager): TransactionTemplate =
        TransactionTemplate(transactionManager)
}
