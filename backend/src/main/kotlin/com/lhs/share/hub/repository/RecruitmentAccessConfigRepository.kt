package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.RecruitmentAccessConfig
import org.springframework.data.mongodb.repository.MongoRepository

interface RecruitmentAccessConfigRepository : MongoRepository<RecruitmentAccessConfig, String>
