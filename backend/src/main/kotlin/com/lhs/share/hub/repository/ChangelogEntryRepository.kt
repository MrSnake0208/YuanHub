package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.ChangelogEntry
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.mongodb.repository.MongoRepository

interface ChangelogEntryRepository : MongoRepository<ChangelogEntry, String> {
    fun findByPublishedRevisionIsNotNullAndWithdrawnAtIsNull(pageable: Pageable): Page<ChangelogEntry>
}
