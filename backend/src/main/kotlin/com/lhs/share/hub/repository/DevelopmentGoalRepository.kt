package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.DevelopmentGoal
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository

interface DevelopmentGoalRepository : MongoRepository<DevelopmentGoal, String> {
    fun findByStage(stage: String, pageable: Pageable): Page<DevelopmentGoal>
}
