package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.core.io.ClassPathResource

class OperatorHuajiSchemaTest {
    private val mapper = jacksonObjectMapper()
    private val validator = OperatorV3SchemaValidator(mapper)

    @Test
    fun `v4 independent and unknown stage fixtures validate while contradictory ownership fails`() {
        listOf("independent.valid.json", "legacy31.valid.json").forEach { name ->
            ClassPathResource("operator-growth-exchange-v4/$name").inputStream.use { validator.validate(mapper.readTree(it)) }
        }
        ClassPathResource("operator-growth-exchange-v4/unowned-stage.invalid.json").inputStream.use {
            val document = mapper.readTree(it)
            assertThrows(OperatorApiException::class.java) { validator.validate(document) }
        }
    }

    @Test
    fun `v5 boundary and unknown capture fixture validates and out of range fails`() {
        ClassPathResource("operator-growth-exchange-v5/boundary.valid.json").inputStream.use { validator.validate(mapper.readTree(it)) }
        ClassPathResource("operator-growth-exchange-v5/out-of-range.invalid.json").inputStream.use {
            val document = mapper.readTree(it)
            assertThrows(OperatorApiException::class.java) { validator.validate(document) }
        }
    }
}
