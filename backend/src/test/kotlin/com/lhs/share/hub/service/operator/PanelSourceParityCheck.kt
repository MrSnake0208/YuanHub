package com.lhs.share.hub.service.operator

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import java.nio.file.Path

/** Explicit offline check; private reference data is external, never a CI resource or an optional test skip. */
object PanelSourceParityCheck {
    data class Case(val operatorId: String, val input: PanelCultivation, val stones: List<PanelStone>, val expected: OperatorPanelValues)

    @JvmStatic fun main(args: Array<String>) {
        require(args.size == 2) { "Expected private bundle and cases paths" }
        val bundle = PanelRuleFile.read(Path.of(args[0]))
        val cases = jacksonObjectMapper().readValue<List<Case>>(Path.of(args[1]).toFile())
        require(cases.isNotEmpty())
        cases.forEachIndexed { index, case ->
            val actual = OperatorPanelCalculator.calculate(bundle, case.operatorId, case.input, case.stones)
            check(actual == case.expected) { "Source comparison failed at case $index (${case.operatorId})" }
        }
        println(
            "PASS: ${cases.size} JS/Kotlin comparisons; ${bundle.operators.size} operator and ${bundle.stars.size} star rules validated",
        )
    }
}
