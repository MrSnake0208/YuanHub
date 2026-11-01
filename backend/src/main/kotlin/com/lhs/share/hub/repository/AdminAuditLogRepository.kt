package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.AdminAuditLog
import org.springframework.data.mongodb.repository.MongoRepository

interface AdminAuditLogRepository : MongoRepository<AdminAuditLog, String>
