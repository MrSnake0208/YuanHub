package com.lhs.share.config.mongo

import com.lhs.share.hub.repository.entity.StarCompletion
import io.github.oshai.kotlinlogging.KotlinLogging
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Profile
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.stereotype.Component

/** Remove only the accidental nested index; all receipts and the operation-ID unique index remain intact. */
@Component
@Profile("!test")
class StarCompletionIndexCleanup(@param:Qualifier("hubMongoTemplate") private val template: MongoTemplate) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        val indexes = template.indexOps(StarCompletion::class.java)
        val legacy = indexes.indexInfo.firstOrNull {
            it.name == "state.idx_star_state_owner" && it.isUnique &&
                it.indexFields.map { field -> field.key } == listOf("state.userId", "state.accountId")
        } ?: return
        indexes.dropIndex(legacy.name)
        KotlinLogging.logger { }.info { "Removed accidental star_completion nested owner index; receipt records preserved" }
    }
}
