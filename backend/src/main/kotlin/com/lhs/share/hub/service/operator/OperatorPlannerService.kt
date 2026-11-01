package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.lhs.share.hub.repository.OperatorAnnotationRepository
import com.lhs.share.hub.repository.OperatorPlannerImportRepository
import com.lhs.share.hub.repository.OperatorStaminaScheduleRepository
import com.lhs.share.hub.repository.OperatorTrainingWorkspaceRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.OperatorPlannerImport
import com.lhs.share.hub.service.account.AccountEventService
import com.mongodb.MongoException
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.dao.DataAccessException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

@Service
class OperatorPlannerService(
    private val accounts: SubAccountRepository,
    private val workspaces: OperatorTrainingWorkspaceRepository,
    private val schedules: OperatorStaminaScheduleRepository,
    private val imports: OperatorPlannerImportRepository,
    private val annotations: OperatorAnnotationRepository,
    private val subjective: OperatorSubjectiveService,
    private val validator: OperatorPlannerValidator,
    private val mapper: ObjectMapper,
    private val events: AccountEventService,
    @param:Qualifier("hubTransactionTemplate") private val transactions: TransactionTemplate,
) {
    fun workspace(userId: String, accountId: String): ObjectNode {
        requireAccount(userId, accountId)
        return readWorkspace(userId, accountId)
    }

    fun putWorkspace(userId: String, accountId: String, request: ObjectNode): ObjectNode {
        requireAccount(userId, accountId)
        val content = validator.workspace(request.deepCopy())
        val result = conflictBoundary(WORKSPACE_CONFLICT) {
            writeWorkspace(userId, accountId, validator.revision(request), content)
        }
        publish(userId, accountId, "operator_training_workspace", result.path("revision").asLong())
        return result
    }

    fun schedule(userId: String, accountId: String, planId: String): ObjectNode {
        requireAccount(userId, accountId)
        requirePlan(readWorkspace(userId, accountId), planId)
        return readSchedule(userId, accountId, planId)
    }

    fun putSchedule(userId: String, accountId: String, planId: String, request: ObjectNode): ObjectNode {
        requireAccount(userId, accountId)
        requirePlan(readWorkspace(userId, accountId), planId)
        val content = validator.schedule(request.deepCopy())
        val result = conflictBoundary(SCHEDULE_CONFLICT) {
            writeSchedule(userId, accountId, planId, validator.revision(request), content)
        }
        publish(userId, accountId, "operator_stamina_schedule", result.path("revision").asLong(), planId)
        return result
    }

    fun removeMember(userId: String, accountId: String, planId: String, operatorId: String, request: ObjectNode): ObjectNode {
        requireAccount(userId, accountId)
        validator.operator(operatorId)
        validator.fields(request, setOf("expected_revision", "graduate", "expected_annotation_revision"))
        val expected = validator.revision(request)
        if (!request.path("graduate").isBoolean) validator.invalid("graduate must be boolean", "graduate")
        val graduate = request.path("graduate").booleanValue()
        val annotationExpected = if (graduate) validator.revision(request, "expected_annotation_revision") else null
        val result = conflictBoundary(WORKSPACE_CONFLICT) {
            transactions.execute {
                val current = readWorkspace(userId, accountId)
                if (current.path("revision").asLong() != expected) conflict(WORKSPACE_CONFLICT)
                val plan = requirePlan(current, planId)
                val members = plan.path("operator_ids") as ArrayNode
                for (index in members.size() - 1 downTo 0) if (members[index].asText() == operatorId) members.remove(index)
                if (planId == "favorites") {
                    val excluded = plan.path("excluded_operator_ids") as ArrayNode
                    if (excluded.none { it.asText() == operatorId }) excluded.add(operatorId)
                }
                val saved = writeWorkspace(userId, accountId, expected, workspaceContent(current))
                val response = mapper.createObjectNode().set<ObjectNode>("workspace", saved)
                if (graduate) {
                    val annotation = annotations.findByUserIdAndAccountIdAndOperatorId(userId, accountId, operatorId)
                    if ((annotation?.revision ?: 0L) != annotationExpected) conflict("annotation_revision_conflict")
                    val patch = mapper.createObjectNode().put("growth_state", "graduated").put("expected_revision", annotationExpected!!)
                    response.set<JsonNode>("annotation", mapper.valueToTree(subjective.putAnnotation(userId, accountId, operatorId, patch)))
                }
                response
            }!!
        }
        publish(userId, accountId, "operator_training_workspace", result.path("workspace").path("revision").asLong())
        if (graduate) publish(userId, accountId, "operator_annotation", result.path("annotation").path("revision").asLong())
        return result
    }

    /** Client submits its explicitly selected workspace and schedules together. No implicit merge. */
    fun importLocal(userId: String, accountId: String, request: ObjectNode): ObjectNode {
        requireAccount(userId, accountId)
        validator.fields(request, setOf("migration_id", "workspace", "schedules"))
        val migrationId = request.path("migration_id").takeIf { it.isTextual }?.asText()
            ?.takeIf { it.length in 1..128 } ?: validator.invalid("migration_id must contain 1..128 characters", "migration_id")
        findReceipt(userId, accountId, migrationId, request)?.let { return it }
        val workspaceRequest = request.path("workspace") as? ObjectNode ?: validator.invalid("workspace is required", "workspace")
        val content = validator.workspace(workspaceRequest.deepCopy())
        val scheduleRequests = request.path("schedules") as? ObjectNode ?: validator.invalid("schedules must be a map", "schedules")
        val payloads = scheduleRequests.fields().asSequence().associate { (id, value) ->
            requirePlan(content, id)
            id to validator.schedule(value.deepCopy<JsonNode>() as? ObjectNode ?: validator.invalid("Invalid schedule", "schedules"))
        }
        val result = try {
            conflictBoundary(WORKSPACE_CONFLICT) {
                transactions.execute {
                    findReceipt(userId, accountId, migrationId, request)?.let { return@execute it }
                    val saved = writeWorkspace(userId, accountId, validator.revision(workspaceRequest), content)
                    val savedSchedules = mapper.createObjectNode()
                    payloads.forEach { (id, payload) ->
                        savedSchedules.set<JsonNode>(
                            "$id",
                            writeSchedule(userId, accountId, id, validator.revision(scheduleRequests.path(id)), payload),
                        )
                    }
                    val now = Instant.now()
                    val response = mapper.createObjectNode().put("migration_id", migrationId).put("imported_at", now.toString())
                    response.set<JsonNode>("workspace", saved)
                    response.set<JsonNode>("schedules", savedSchedules)
                    imports.insert(
                        OperatorPlannerImport(
                            "$userId:$accountId:$migrationId",
                            userId,
                            accountId,
                            migrationId,
                            request.toString(),
                            response.toString(),
                            now,
                        ),
                    )
                    response
                }!!
            }
        } catch (error: OperatorApiException) {
            if (error.status == HttpStatus.CONFLICT) findReceipt(userId, accountId, migrationId, request)?.let { return it }
            throw error
        }
        publish(userId, accountId, "operator_training_workspace", result.path("workspace").path("revision").asLong())
        return result
    }

    private fun findReceipt(userId: String, accountId: String, id: String, request: ObjectNode): ObjectNode? =
        imports.findByUserIdAndAccountIdAndMigrationId(userId, accountId, id)?.let {
            if (mapper.readTree(it.requestJson) != request) conflict("training_workspace_migration_conflict")
            mapper.readTree(it.responseJson) as ObjectNode
        }

    private fun writeWorkspace(userId: String, accountId: String, expected: Long, content: ObjectNode): ObjectNode {
        // Older clients omit account-wide sources when editing their training lists.
        if (!content.has("stamina_sources")) {
            workspaces.findByUserIdAndAccountId(userId, accountId)?.let { old ->
                mapper.readTree(old.payloadJson).get("stamina_sources")?.let { content.set<JsonNode>("stamina_sources", it) }
            }
        }
        val saved = workspaces.replace(userId, accountId, expected, content.toString(), Instant.now()) ?: conflict(WORKSPACE_CONFLICT)
        return response(saved.payloadJson, accountId, saved.revision, saved.updatedAt)
    }

    private fun writeSchedule(userId: String, accountId: String, planId: String, expected: Long, content: ObjectNode): ObjectNode {
        val old = schedules.findByUserIdAndAccountIdAndPlanId(userId, accountId, planId)
        if ((old?.revision ?: 0L) != expected) conflict(SCHEDULE_CONFLICT)
        val usesCustomRules = validator.hasCustomDailySpends(content) ||
            old?.let { validator.hasCustomDailySpends(mapper.readTree(it.payloadJson)) } == true
        if (usesCustomRules && content.path("client_features").none { it.asText() == "custom-daily-spends-v1" }) {
            throw OperatorApiException(HttpStatus.CONFLICT, "custom_daily_spends_client_outdated", "当前页面不支持持续每日安排，请更新页面后重新保存")
        }
        content.remove("client_features")
        if (old != null && mapper.readTree(old.payloadJson).path("preferences").has("source_periods") &&
            !content.path("preferences").has("source_periods")
        ) {
            conflict("stamina_sources_client_outdated")
        }
        validator.preserveHistory(old?.let { mapper.readTree(it.payloadJson) as ObjectNode }, content)
        val saved = schedules.replace(userId, accountId, planId, expected, content.toString(), Instant.now()) ?: conflict(SCHEDULE_CONFLICT)
        return response(saved.payloadJson, accountId, saved.revision, saved.updatedAt).put("plan_id", planId)
    }

    private fun readWorkspace(userId: String, accountId: String): ObjectNode = workspaces.findByUserIdAndAccountId(userId, accountId)?.let {
        response(it.payloadJson, accountId, it.revision, it.updatedAt)
    } ?: validator.emptyWorkspace().put("account_id", accountId).put("revision", 0).putNull("updated_at")

    private fun readSchedule(userId: String, accountId: String, planId: String): ObjectNode =
        schedules.findByUserIdAndAccountIdAndPlanId(userId, accountId, planId)?.let {
            response(it.payloadJson, accountId, it.revision, it.updatedAt).put("plan_id", planId)
        } ?: validator.emptySchedule().put("account_id", accountId).put("plan_id", planId).put("revision", 0).putNull("updated_at")

    private fun response(payload: String, accountId: String, revision: Long, updated: Instant): ObjectNode = (
        mapper.readTree(
            payload,
        ) as ObjectNode
        ).put("account_id", accountId).put("revision", revision).put("updated_at", updated.toString())

    private fun workspaceContent(response: ObjectNode): ObjectNode = response.deepCopy().also {
        it.remove(listOf("account_id", "revision", "updated_at"))
    }

    private fun requirePlan(workspace: ObjectNode, planId: String): ObjectNode {
        validator.planId(planId)
        return workspace.path("plans").find { it.path("id").asText() == planId } as? ObjectNode
            ?: throw OperatorApiException(HttpStatus.NOT_FOUND, "training_plan_not_found", "Training plan not found")
    }

    private fun requireAccount(userId: String, accountId: String) {
        if (accounts.findByUserIdAndAccountId(userId, accountId) == null) {
            throw OperatorApiException(HttpStatus.NOT_FOUND, "account_not_found", "Account not found")
        }
    }

    private fun publish(userId: String, accountId: String, event: String, revision: Long, planId: String? = null) {
        events.publish(
            userId,
            accountId,
            event,
            UUID.randomUUID().toString(),
            mapOf(
                "account_id" to accountId,
                "revision" to revision,
                "plan_id" to planId,
            ),
        )
    }

    private fun <T> conflictBoundary(code: String, action: () -> T): T = try {
        action()
    } catch (_: DuplicateKeyException) {
        conflict(code)
    } catch (error: DataAccessException) {
        if (generateSequence<Throwable>(error) { it.cause }.filterIsInstance<MongoException>().any {
                it.code == 112 ||
                    it.hasErrorLabel("TransientTransactionError")
            }
        ) {
            conflict(code)
        }
        throw error
    }

    private fun conflict(code: String): Nothing =
        throw OperatorApiException(HttpStatus.CONFLICT, code, "Planner data changed; reload before saving")

    companion object {
        const val WORKSPACE_CONFLICT = "training_workspace_revision_conflict"
        const val SCHEDULE_CONFLICT = "stamina_schedule_revision_conflict"
    }
}
