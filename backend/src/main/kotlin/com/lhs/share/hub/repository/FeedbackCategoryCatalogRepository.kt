package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.FeedbackCategoryCatalog
import org.springframework.data.mongodb.repository.MongoRepository

interface FeedbackCategoryCatalogRepository : MongoRepository<FeedbackCategoryCatalog, String>
