package com.lhs.share.openapi.diagnostics

import com.lhs.share.hub.repository.entity.FeedbackDiagnosticIssueSummary
import com.lhs.share.hub.repository.entity.FeedbackDiagnosticSummary
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticEvent
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticImage
import com.lhs.share.hub.repository.entity.MaayuanDiagnosticIssue
import com.lhs.share.hub.repository.entity.MediaAsset
import com.lhs.share.openapi.OpenApiPrincipal
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.data.mongodb.core.MongoTemplate
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.core.query.Update
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.time.Instant

@Service
class MaayuanDiagnosticIssueRecorder(@param:Qualifier("hubMongoTemplate") private val mongo: MongoTemplate) {
    /** Called inside the ingestion transaction; a write conflict aborts the whole event for client retry. */
    fun record(principal: OpenApiPrincipal, manifest: MaayuanDiagnosticManifest, assets: List<MediaAsset>, now: Instant) {
        val specificReasons = manifest.issues.filter { it.code != "collector_exception" }.mapNotNull { it.reason }.toSet()
        val groups = manifest.issues.filterNot {
            it.code == "collector_exception" && it.reason != null && it.reason in specificReasons
        }.flatMap { issue ->
            val subjects = when {
                issue.code in setOf("identity_unresolved", "data_review") && issue.operatorIds.isNotEmpty() ->
                    issue.operatorIds.distinct().map { "operator" to it }
                issue.code == "identity_unresolved" && issue.ocrSamples.isNotEmpty() -> listOf("ocr_name" to issue.ocrSamples.first())
                else -> listOf("stage" to issue.stage)
            }
            subjects.map { (kind, subject) ->
                val reason = if (issue.code == "identity_unresolved" && (kind == "operator" || kind == "ocr_name")) {
                    issue.code
                } else {
                    issue.reason ?: issue.code
                }
                Signature(reason, kind, subject) to issue
            }
        }.groupBy({ it.first }, { it.second })
        groups.forEach { (signature, issues) ->
            val previous = mongo.findById(signature.id, MaayuanDiagnosticIssue::class.java)
            val update = Update()
                .setOnInsert("key", signature.key)
                .setOnInsert("reason", signature.reason)
                .setOnInsert("subjectKind", signature.kind)
                .setOnInsert("subject", signature.subject)
                .setOnInsert("firstSeenAt", now)
                .set("code", issues.last().code)
                .set("reasons", (previous?.reasons.orEmpty() + issues.map { it.reason ?: it.code }).distinct())
                .set("stages", (previous?.stages.orEmpty() + issues.map { it.stage }).distinct())
                .set(
                    "operatorIds",
                    if (signature.kind == "operator") {
                        listOf(signature.subject)
                    } else {
                        recent(previous?.operatorIds.orEmpty() + issues.flatMap { it.operatorIds }, 10)
                    },
                )
                .set("candidateOperatorIds", issues.lastOrNull { it.candidateOperatorIds.isNotEmpty() }?.candidateOperatorIds.orEmpty())
                .set("ocrSamples", recent(previous?.ocrSamples.orEmpty() + issues.flatMap { it.ocrSamples }, 8))
                .set("status", if (previous?.status == "IGNORED") "IGNORED" else "NEW")
                .set("lastSeenAt", now)
                .set("latestEventId", manifest.eventId)
                .set("clientVersions", recent(previous?.clientVersions.orEmpty() + manifest.client.maafwVersion, 10))
                .set("resourceVersions", recent(previous?.resourceVersions.orEmpty() + manifest.client.resourceVersion, 10))
                .set("catalogVersions", recent(previous?.catalogVersions.orEmpty() + manifest.catalog.version, 10))
                .inc("eventCount", 1L)
                .inc("resourceCounts.${manifest.client.resource}", 1L)
            manifest.client.uiScript?.let { update.inc("uiScriptCounts.$it", 1L) }
            if (previous?.status == "FIXED") update.set("regressedAt", now)
            mongo.upsert(Query(Criteria.where("_id").`is`(signature.id)), update, MaayuanDiagnosticIssue::class.java)
        }
        mongo.insert(
            MaayuanDiagnosticEvent(
                id = manifest.eventId,
                userId = principal.userId,
                accountId = principal.accountId,
                createdAt = now,
                summary = FeedbackDiagnosticSummary(
                    feature = manifest.feature,
                    outcome = manifest.outcome,
                    issueCodes = manifest.issues.map { it.code }.distinct(),
                    operatorIds = (manifest.issues.flatMap { it.operatorIds } + manifest.images.mapNotNull { it.operatorId }).distinct(),
                    resourceVersion = manifest.client.resourceVersion,
                    resource = manifest.client.resource,
                    uiScript = manifest.client.uiScript,
                    issues = manifest.issues.map {
                        FeedbackDiagnosticIssueSummary(
                            code = it.code,
                            stage = it.stage,
                            reason = it.reason,
                            errorType = it.errorType,
                            count = it.count,
                            operatorIds = it.operatorIds,
                            candidateOperatorIds = it.candidateOperatorIds,
                            ocrSamples = it.ocrSamples,
                        )
                    },
                ),
                manifestAssetId = checkNotNull(assets.first().id),
                images = assets.drop(1).mapIndexed { index, asset ->
                    MaayuanDiagnosticImage(
                        checkNotNull(asset.id),
                        manifest.images[index].role,
                        status = asset.status,
                        operatorId = manifest.images[index].operatorId,
                    )
                },
                signatures = groups.keys.map { it.id },
            ),
        )
    }

    private fun recent(values: List<String>, limit: Int): List<String> = values.asReversed().distinct().take(limit).asReversed()

    private data class Signature(val reason: String, val kind: String, val subject: String) {
        private val prefix = when (kind) {
            "operator" -> "op"
            "ocr_name" -> "ocr"
            else -> "stage"
        }
        val key = "$reason|$prefix:$subject"
        val id = MessageDigest.getInstance("SHA-1").digest(key.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }.take(24)
    }
}
