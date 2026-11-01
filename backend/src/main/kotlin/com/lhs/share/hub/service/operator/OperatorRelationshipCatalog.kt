package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.time.LocalDate

@Service
class OperatorRelationshipCatalog(private val mapper: ObjectMapper, private val catalog: OperatorCatalogService) {
    private val document = ClassPathResource("operator/relationships.json").inputStream.use { mapper.readTree(it) }
    private val profiles: Map<Long, JsonNode>

    init {
        fields(document, setOf("version", "source", "verified_on", "export_sha256", "milestones", "subjects"))
        require(document.path("version").isTextual && document.path("version").asText().isNotBlank())
        require(document.path("export_sha256").asText().matches(Regex("[a-f0-9]{64}")))
        val subjects = document.path("subjects")
        require(subjects.isArray && subjects.size() in 1..1000)
        val ids = mutableSetOf<Long>()
        val names = mutableSetOf<String>()
        subjects.forEach { subject ->
            fields(subject, setOf("warrior_id", "name", "max"))
            require(subject.path("warrior_id").isIntegralNumber && subject.path("warrior_id").canConvertToLong())
            require(subject.path("warrior_id").asLong() > 0 && ids.add(subject.path("warrior_id").asLong()))
            require(
                subject.path("name").isTextual && subject.path("name").asText().isNotBlank() && names.add(subject.path("name").asText()),
            )
            require(
                subject.path("max").isIntegralNumber && subject.path("max").canConvertToLong() &&
                    subject.path("max").asLong() in setOf(2000L, 10000L),
            )
        }
        // Validate the full table before clipping profiles so invalid high thresholds cannot disappear.
        val full = profile(10000)
        validate(
            mapper.valueToTree(
                mapOf(
                    "version" to "validation",
                    "games" to mapOf(
                        "如鸢" to mapOf("base" to mapOf("trust_owner_id" to "base", "trust" to full, "rumors" to null)),
                        "代号鸢" to emptyMap<String, Any>(),
                    ),
                ),
            ),
        )
        profiles = setOf(2000L, 10000L).associateWith { cap ->
            full.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().also { rule ->
                rule.put("max", cap)
                rule.set<JsonNode>("milestones", mapper.valueToTree(document.path("milestones").filter { it.path("at").asLong() <= cap }))
            }
        }
    }

    data class Snapshot(val version: String, val operators: JsonNode)

    fun snapshot(game: String): Snapshot {
        require(game in setOf("如鸢", "代号鸢"))
        val entries = catalog.catalog().operators.filter { game in it.games }.sortedBy { it.id }
        val byId = entries.associateBy { it.id }
        val rootsByName = entries.filter { it.spOf == null }.groupBy { it.name }
        val subjectsByName = document.path("subjects").associateBy { it.path("name").asText() }
        val resolved = mapper.createObjectNode()
        for (entry in entries) {
            val owner = entry.spOf?.let { byId[it]?.takeIf { root -> root.spOf == null } } ?: entry.takeIf { it.spOf == null }
            if (owner == null) continue
            val subject = subjectsByName[owner.name]?.takeIf { rootsByName[owner.name]?.size == 1 }
            resolved.set<JsonNode>(
                entry.id,
                mapper.valueToTree(
                    mapOf(
                        "trust_owner_id" to owner.id,
                        "trust" to subject?.let { profiles[it.path("max").asLong()] },
                        "rumors" to null,
                    ),
                ),
            )
        }
        val digest = MessageDigest.getInstance("SHA-256").digest((document.toString() + resolved.toString()).toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return Snapshot(document.path("version").asText() + ":" + digest, resolved)
    }

    private fun profile(max: Long): JsonNode = mapper.valueToTree(
        mapOf(
            "max" to max,
            "complete" to true,
            "source" to document.path("source"),
            "verified_on" to document.path("verified_on"),
            "milestones" to document.path("milestones"),
        ),
    )

    companion object {
        const val MAX_VALUE = 9007199254740991L
        fun validate(document: JsonNode) {
            fields(document, setOf("version", "games"))
            require(document.path("version").isTextual && document.path("version").asText().isNotBlank())
            fields(document.path("games"), setOf("如鸢", "代号鸢"))
            for (game in document.path("games")) {
                require(game.isObject && game.size() <= 1000)
                game.fields().forEach { (id, rule) ->
                    require(id.matches(Regex("[A-Za-z0-9_-]{1,128}")))
                    fields(rule, setOf("trust_owner_id", "trust", "rumors"))
                    require(rule.path("trust_owner_id").isTextual)
                    val owner = rule.path("trust_owner_id").asText()
                    require(game.has(owner) && game.path(owner).path("trust_owner_id").asText() == owner)
                    for (kind in listOf("trust", "rumors")) {
                        val domain = rule.path(kind)
                        if (domain.isNull) continue
                        fields(domain, setOf("max", "complete", "source", "verified_on", "milestones"))
                        require(domain.path("max").isIntegralNumber && domain.path("max").canConvertToLong())
                        require(domain.path("max").asLong() in 0..MAX_VALUE)
                        require(domain.path("complete").isBoolean)
                        require(domain.path("source").isTextual && domain.path("source").asText().isNotBlank())
                        require(domain.path("verified_on").isTextual)
                        LocalDate.parse(domain.path("verified_on").asText())
                        val milestones = domain.path("milestones")
                        require(milestones.isArray && milestones.size() <= 1000)
                        var previous = -1L
                        for (milestone in milestones) {
                            fields(milestone, setOf("at", "rewards"))
                            val at = milestone.path("at")
                            require(at.isIntegralNumber && at.canConvertToLong() && at.asLong() in 0..domain.path("max").asLong())
                            require(at.asLong() > previous)
                            previous = at.asLong()
                            val rewards = milestone.path("rewards")
                            require(rewards.isArray && rewards.size() <= 100)
                            val keys = mutableSetOf<String>()
                            for (reward in rewards) {
                                fields(reward, setOf("item_key", "name", "quantity"))
                                require(reward.path("item_key").isTextual && reward.path("item_key").asText().isNotBlank())
                                require(keys.add(reward.path("item_key").asText()))
                                require(reward.path("name").isTextual && reward.path("name").asText().isNotBlank())
                                val quantity = reward.path("quantity")
                                require(quantity.isIntegralNumber && quantity.canConvertToLong() && quantity.asLong() in 1..MAX_VALUE)
                            }
                        }
                    }
                    require(owner == id || rule.path("trust") == game.path(owner).path("trust"))
                }
            }
        }
        private fun fields(node: JsonNode, keys: Set<String>) {
            require(node.isObject && node.fieldNames().asSequence().toSet() == keys)
        }
    }
}
