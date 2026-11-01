package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.OperatorCatalogEntity
import org.springframework.data.mongodb.repository.MongoRepository

interface OperatorCatalogRepository : MongoRepository<OperatorCatalogEntity, String> {
    fun findByOperatorId(operatorId: String): OperatorCatalogEntity?
    fun findAllByOrderByOperatorIdAsc(): List<OperatorCatalogEntity>
}
