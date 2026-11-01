package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import org.springframework.core.io.ClassPathResource
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

@Service
class OperatorV3SchemaValidator(objectMapper: ObjectMapper) {
    private val schema = ClassPathResource("schema/operator-growth-exchange-v3.schema.json").inputStream.use {
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(objectMapper.readTree(it))
    }

    private val v4Schema = ClassPathResource("schema/operator-growth-exchange-v4.schema.json").inputStream.use {
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(objectMapper.readTree(it))
    }

    private val v5Schema = ClassPathResource("schema/operator-growth-exchange-v5.schema.json").inputStream.use {
        JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(objectMapper.readTree(it))
    }

    fun validate(document: JsonNode) {
        // Report numeric contract failures using the same field/code as PATCH,
        // before multipleOf/type schema errors hide the actionable reason.
        document.path("records").forEach { record ->
            record.path("entries").forEach { entry ->
                val oddities = entry.path("combat_stats").path("oddities")
                if (oddities.isObject) {
                    listOf("attack", "hp", "special").forEach { key ->
                        val oddity = oddities.path(key)
                        if (oddity.isObject && oddity.has("current")) {
                            OperatorOddityValidation.requireCurrent(
                                key,
                                oddity.get("current"),
                                1_000_000,
                                entry.path("operator_id").asText(),
                                record.path("record_id").asText(),
                            )
                        }
                    }
                }
            }
        }
        val selected = when (document.path("version").asInt()) {
            5 -> v5Schema
            4 -> v4Schema
            else -> schema
        }
        val errors = selected.validate(document)
        if (errors.isNotEmpty()) {
            val first = errors.sortedBy { it.message }.first()
            throw OperatorApiException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                "schema_validation_failed",
                first.message,
                fieldPath = first.instanceLocation.toString().removePrefix("$.").removePrefix("/"),
            )
        }
    }
}
