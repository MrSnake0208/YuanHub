package com.lhs.share.hub.service.ledger

import com.lhs.share.hub.controller.ledger.request.LedgerPlanCreateRequest
import jakarta.validation.Validation
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * 验证探针:直接使用 Hibernate Validator 校验 LedgerPlanCreateRequest,
 * 定位「接口 @Valid 不生效」是约束元数据问题还是 MVC 装配问题。
 */
class LedgerPlanValidationProbeTest {
    private val validator = Validation.buildDefaultValidatorFactory().validator

    @Test
    fun `空 name 应产生 1 条 NotBlank 违例`() {
        val violations = validator.validate(LedgerPlanCreateRequest(name = "", version = "daihao"))
        println("空name违例数: " + violations.size + " => " + violations.map { it.message })
        assertEquals(1, violations.size)
    }

    @Test
    fun `非法 version 应产生 Pattern 违例`() {
        val violations = validator.validate(LedgerPlanCreateRequest(name = "正常", version = "xxx"))
        println("非法version违例数: " + violations.size + " => " + violations.map { it.message })
        assertEquals(1, violations.size)
    }

    @Test
    fun `嵌套校验 content_id=0 应产生违例`() {
        val request = LedgerPlanCreateRequest(
            name = "正常",
            version = "daihao",
            cartItems = listOf(
                com.lhs.share.hub.controller.ledger.request.CartItemRequest(
                    contentId = 0,
                    quantity = 1,
                    packageSnapshot = com.lhs.share.hub.controller.ledger.request.PackageSnapshotRequest(
                        name = "年卡",
                        points = 2280,
                        draws = 180.0,
                        limit = 1,
                        priceUsd = 37.99,
                    ),
                ),
            ),
        )
        val violations = validator.validate(request)
        println("嵌套违例数: " + violations.size + " => " + violations.map { it.propertyPath to it.message })
        assertEquals(1, violations.size)
    }
}
