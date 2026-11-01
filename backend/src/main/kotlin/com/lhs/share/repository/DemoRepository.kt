package com.lhs.share.repository

import com.lhs.share.repository.entity.DemoEntity
import org.springframework.data.mongodb.repository.MongoRepository

/**
 * 示例仓储,演示 Spring Data MongoDB 仓库层写法,接入真实业务后可删除
 *
 * 按方法名自动生成查询,复杂查询可加 @Query 注解或使用 MongoTemplate
 */
interface DemoRepository : MongoRepository<DemoEntity, String> {
    fun findByName(name: String): List<DemoEntity>
}
