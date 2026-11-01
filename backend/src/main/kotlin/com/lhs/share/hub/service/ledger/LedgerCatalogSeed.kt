package com.lhs.share.hub.service.ledger

import com.fasterxml.jackson.databind.ObjectMapper
import com.lhs.share.hub.repository.LedgerCatalogRepository
import com.lhs.share.hub.repository.entity.LedgerCampaign
import com.lhs.share.hub.repository.entity.LedgerCatalogPackage
import com.lhs.share.hub.repository.entity.LedgerCatalogSettings
import org.springframework.boot.ApplicationArguments
import org.springframework.boot.ApplicationRunner
import org.springframework.context.annotation.Profile
import org.springframework.core.io.ClassPathResource
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Component

data class LedgerCatalogSeedData(
    val packages: List<LedgerCatalogPackage>,
    val campaigns: List<LedgerCampaign>,
    val settings: LedgerCatalogSettings,
)

/** Fixed v1 seed is insert-only: restarts never overwrite edits or re-enable disabled records. */
@Component
@Profile("!test")
class LedgerCatalogSeed(private val repository: LedgerCatalogRepository, private val mapper: ObjectMapper) : ApplicationRunner {
    override fun run(args: ApplicationArguments) {
        initialize()
    }
    fun initialize() {
        val seed = ClassPathResource("ledger/catalog-v1.json").inputStream.use {
            mapper.readValue(it, LedgerCatalogSeedData::class.java)
        }
        seed.packages.forEach { value -> insertMissing { repository.insert(value) } }
        seed.campaigns.forEach { value -> insertMissing { repository.insert(value) } }
        insertMissing { repository.insert(seed.settings) }
        for (game in listOf("daihao", "ru")) insertMissing { repository.insertSequence(game) }
    }
    private fun insertMissing(insert: () -> Any) {
        try {
            insert()
        } catch (_: DuplicateKeyException) { /* Existing records are authoritative. */ }
    }
}
