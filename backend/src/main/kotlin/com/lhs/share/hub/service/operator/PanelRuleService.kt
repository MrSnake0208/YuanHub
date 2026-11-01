package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.github.benmanes.caffeine.cache.Caffeine
import com.lhs.share.hub.repository.PanelRulesRepository
import com.lhs.share.hub.repository.entity.PanelRuleBundle
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.nio.file.Files
import java.nio.file.Path

/** Internal maintenance operations only: no HTTP import, public table endpoint, or startup writes. */
@Service
class PanelRuleService(
    private val repository: PanelRulesRepository,
    @param:Qualifier("hubTransactionTemplate") private val transaction: TransactionTemplate,
) {
    private val cache = Caffeine.newBuilder().maximumSize(4).build<String, PanelRuleBundle>()

    fun importBundle(bundle: PanelRuleBundle) {
        PanelRuleValidation.validate(bundle)
        repository.ensureIndexes()
        // Versions are insert-only; duplicate versions fail without replacing rules in use.
        transaction.executeWithoutResult { repository.insert(bundle) }
    }

    fun activate(game: String, version: String) {
        require(game in PanelRuleValidation.games)
        val bundle = checkNotNull(repository.load(version)) { "Panel rule version is unavailable" }
        PanelRuleValidation.validate(bundle)
        require(game in bundle.ruleSet.games) { "Panel rule version does not support this game" }
        repository.activate(game, version)
    }

    /** The caller keeps this snapshot for the whole request, including batch calculations. */
    fun snapshot(game: String): PanelRuleBundle? {
        require(game in PanelRuleValidation.games)
        val version = repository.activeVersion(game) ?: return null
        val bundle = cache.get(version) {
            checkNotNull(repository.load(it)) { "Active panel rule version is unavailable" }
                .also(PanelRuleValidation::validate)
        }
        check(game in bundle.ruleSet.games) { "Active panel rule version does not support this game" }
        return bundle
    }
}

object PanelRuleFile {
    private val mapper = jacksonObjectMapper()
        .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)

    fun read(path: Path): PanelRuleBundle {
        require(Files.size(path) in 1..10_000_000) { "Panel rule file exceeds supported size" }
        return Files.newInputStream(path).use { mapper.readValue<PanelRuleBundle>(it) }.also(PanelRuleValidation::validate)
    }
}
