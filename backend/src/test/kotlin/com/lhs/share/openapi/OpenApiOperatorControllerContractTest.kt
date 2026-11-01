package com.lhs.share.openapi

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.hub.controller.operator.response.OperatorAnnotationListResponse
import com.lhs.share.hub.controller.operator.response.OperatorAnnotationResponse
import com.lhs.share.hub.controller.operator.response.OperatorCurrentEntryDto
import com.lhs.share.hub.controller.operator.response.OperatorCurrentResponse
import com.lhs.share.hub.controller.operator.response.OperatorV3ImportPreviewResponse
import com.lhs.share.hub.service.account.SubAccountService
import com.lhs.share.hub.service.operator.OperatorService
import com.lhs.share.hub.service.operator.OperatorSubjectiveService
import com.lhs.share.hub.service.operator.OperatorV3ImportService
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.Instant

class OpenApiOperatorControllerContractTest {
    private val tokenService = mockk<OpenApiTokenService>()
    private val service = mockk<OperatorService>()
    private val accountService = mockk<SubAccountService>()
    private val controller = OpenApiOperatorController(tokenService, service, accountService)

    @Test
    fun `annotations use read permission and token bound account`() {
        val subjective = mockk<OperatorSubjectiveService>()
        val api = OpenApiOperatorController(tokenService, service, accountService, subjectiveService = subjective)
        every { tokenService.validateAuthorization("Bearer read", OpenApiPermission.OPERATOR_READ) } returns
            OpenApiPrincipal("u1", "acc1")
        val expected = OperatorAnnotationListResponse(
            "acc1",
            listOf(OperatorAnnotationResponse("op1", "discarded", "保留备注", 3, Instant.EPOCH)),
        )
        every { subjective.annotations("u1", "acc1") } returns expected
        assertEquals(expected, api.annotations("Bearer read").data)
        verify(exactly = 1) { subjective.annotations("u1", "acc1") }
    }

    @Test
    fun `annotations reject missing read permission before querying state`() {
        val subjective = mockk<OperatorSubjectiveService>()
        val api = OpenApiOperatorController(tokenService, service, accountService, subjectiveService = subjective)
        every { tokenService.validateAuthorization("Bearer scan", OpenApiPermission.OPERATOR_READ) } throws
            IllegalArgumentException("missing read scope")
        assertThrows<IllegalArgumentException> { api.annotations("Bearer scan") }
        verify(exactly = 0) { subjective.annotations(any(), any()) }
    }

    @Test
    fun `operator read scope receives extended current response without a PATCH endpoint`() {
        every { tokenService.validateAuthorization("Bearer read", OpenApiPermission.OPERATOR_READ) } returns
            OpenApiPrincipal("u1", "acc1")
        every { service.current("u1", "acc1", "代号鸢") } returns listOf(
            OperatorCurrentResponse(
                userId = "u1",
                accountId = "acc1",
                game = "代号鸢",
                fullBaselineAt = null,
                entries = mapOf(
                    "op1" to OperatorCurrentEntryDto(
                        elite = 1,
                        starLevel = 3,
                        level = 10,
                        discs = emptyList(),
                        starStones = emptyList(),
                        discLoadouts = emptyList(),
                        combatStats = null,
                        revision = 0,
                        listedBaselineAt = null,
                        updatedAt = null,
                    ),
                ),
                updatedAt = Instant.EPOCH,
            ),
        )

        val response: ApiResult<List<OperatorCurrentResponse>> = controller.current("Bearer read", "代号鸢")

        assertEquals(0, response.data?.single()?.entries?.getValue("op1")?.revision)
        verify { tokenService.validateAuthorization("Bearer read", OpenApiPermission.OPERATOR_READ) }
        verify { service.current("u1", "acc1", "代号鸢") }
    }

    @ParameterizedTest
    @ValueSource(ints = [3, 4, 5])
    fun `scan preview requires dedicated scope and forwards token bound account`(version: Int) {
        val v3 = mockk<OperatorV3ImportService>()
        val scanController = OpenApiOperatorController(tokenService, service, accountService, v3)
        val document = jacksonObjectMapper().readTree("""{"version":$version}""")
        every { tokenService.validateAuthorization("Bearer scan", OpenApiPermission.OPERATOR_SCAN_WRITE) } returns
            OpenApiPrincipal("u1", "acc1")
        every { v3.previewScan("u1", "acc1", document) } returns
            OperatorV3ImportPreviewResponse(accepted = 0, partial = 0, review = 0, rejected = 0, unchanged = 0, items = emptyList())

        val response = scanController.previewScanImport("Bearer scan", document)

        assertEquals(0, response.data?.accepted)
        verify { tokenService.validateAuthorization("Bearer scan", OpenApiPermission.OPERATOR_SCAN_WRITE) }
        verify { v3.previewScan("u1", "acc1", document) }
    }
}
