package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.RecruitmentAccessGrant
import org.springframework.data.mongodb.repository.MongoRepository

interface RecruitmentAccessGrantRepository : MongoRepository<RecruitmentAccessGrant, String>
