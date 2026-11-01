package com.lhs.share.hub.repository.entity

import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.index.CompoundIndex
import org.springframework.data.mongodb.core.mapping.Document
import java.time.Instant

@Document("operator_custom_spend_templates")
data class OperatorCustomSpendTemplates(
    @Id val id: String,
    val payloadJson: String,
    val revision: Long,
    val updatedAt: Instant,
)

/** Validated JSON snapshots preserve simulator numbers, map keys and historical predictions exactly. */
@Document("operator_training_workspace")
@CompoundIndex(name = "training_workspace_owner", def = "{'userId':1,'accountId':1}", unique = true)
data class OperatorTrainingWorkspace(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val payloadJson: String,
    val revision: Long,
    val updatedAt: Instant,
)

@Document("operator_stamina_schedule")
@CompoundIndex(name = "stamina_schedule_owner", def = "{'userId':1,'accountId':1,'planId':1}", unique = true)
data class OperatorStaminaSchedule(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val planId: String,
    val payloadJson: String,
    val revision: Long,
    val updatedAt: Instant,
)

@Document("operator_planner_import")
@CompoundIndex(name = "planner_import_owner", def = "{'userId':1,'accountId':1,'migrationId':1}", unique = true)
data class OperatorPlannerImport(
    @Id val id: String,
    val userId: String,
    val accountId: String,
    val migrationId: String,
    val requestJson: String,
    val responseJson: String,
    val importedAt: Instant,
)
