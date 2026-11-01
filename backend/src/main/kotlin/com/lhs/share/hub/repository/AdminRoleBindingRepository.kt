package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.AdminRole
import com.lhs.share.hub.repository.entity.AdminRoleBinding
import org.springframework.data.mongodb.repository.MongoRepository

interface AdminRoleBindingRepository : MongoRepository<AdminRoleBinding, String> {
    fun findByRolesContaining(role: AdminRole): List<AdminRoleBinding>
}
