package com.lhs.share.hub.service.bond

import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.bond.BondCatalogAdminController
import com.lhs.share.hub.controller.bond.BondController
import com.lhs.share.hub.repository.entity.BondPublication
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.http.converter.ByteArrayHttpMessageConverter
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class BondContractTest {
    private val mapper = bondMapper()
    private val service = mockk<BondService>()
    private val catalog = mockk<BondCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setup() {
        every { helper.obtainUserId() } returns "owner"
        mvc =
            MockMvcBuilders.standaloneSetup(
                BondController(service, catalog, helper, mapper),
                BondCatalogAdminController(catalog, authorization, helper, mapper),
            )
                .setControllerAdvice(InventoryExceptionHandler())
                .setMessageConverters(ByteArrayHttpMessageConverter(), MappingJackson2HttpMessageConverter(mapper)).build()
    }

    @Test
    fun `public catalogue and private archive no-store snake case and no hidden ownership`() {
        every { catalog.catalog("代号鸢") } returns BondPublication("v", "代号鸢", listOf(bondEntry()))
        mvc.perform(get("/v1/bonds/catalog").param("game", "代号鸢")).andExpect(status().isOk)
            .andExpect(
                header().string("Cache-Control", "no-store"),
            ).andExpect(jsonPath("$.data.entries[0].bond_id").value(bondEntry().bondId))
            .andExpect(jsonPath("$.data.draft").doesNotExist())
        verify(exactly = 0) { helper.obtainUserId() }
        every { service.archive("owner", "a") } returns BondArchiveResponse("a", "代号鸢", 0, "v", emptyList(), BondSummary(0, 1, 0))
        mvc.perform(get("/v1/bonds/archive").param("account_id", "a")).andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.data.account_id").value("a"))
            .andExpect(jsonPath("$.data.user_id").doesNotExist()).andExpect(jsonPath("$.data.summary.triggered_count").value(0))
        every { helper.obtainUserId() } returns null
        mvc.perform(get("/v1/bonds/archive").param("account_id", "a")).andExpect(status().isUnauthorized)
    }

    @Test
    fun `strict writes reject totals ownership source timestamp and coercion`() {
        val base = """{"account_id":"a","expected_revision":0,"catalog_version":"v","triggered":true}"""
        for (bad in listOf(
            base.dropLast(1) + ",\"total\":10}",
            base.dropLast(1) + ",\"source\":\"import\"}",
            base.dropLast(1) + ",\"game\":\"如鸢\"}",
            base.dropLast(1) + ",\"updated_at\":\"today\"}",
            base.replace(":true", ":1"),
            base.replace(":0", ":0.5"),
            base.replace(":0", ":-1"),
        )) {
            mvc.perform(
                patch("/v1/bonds/records/x").contentType(MediaType.APPLICATION_JSON).content(bad),
            ).andExpect(status().isUnprocessableEntity)
        }
        mvc.perform(post("/v1/bonds/batch").contentType(MediaType.APPLICATION_JSON).content("{bad")).andExpect(status().isBadRequest)
        mvc.perform(
            patch("/v1/bonds/records/x").contentType(MediaType.APPLICATION_JSON).content(base.dropLast(1) + ",\"triggered\":false}"),
        ).andExpect(status().isBadRequest)
        verify { service wasNot Called }
    }

    @Test
    fun `every administrative read and action rejects ordinary user before service`() {
        for (user in listOf(null, "ordinary")) {
            every { helper.obtainUserId() } returns user
            if (user != null) every { authorization.hasPermission(user, AdminPermission.BOND_CATALOG_WRITE) } returns false
            val expected = if (user == null) 401 else 403
            mvc.perform(get("/v1/admin/bonds/catalog").param("game", "代号鸢")).andExpect(status().`is`(expected))
            mvc.perform(
                get("/v1/admin/bonds/catalog/export").param("game", "代号鸢").param("scope", "draft"),
            ).andExpect(status().`is`(expected))
            for (action in listOf("draft", "preview", "publish", "discard")) {
                mvc.perform(
                    post("/v1/admin/bonds/catalog/$action").param("game", "代号鸢").contentType(MediaType.APPLICATION_JSON).content("{}"),
                )
                    .andExpect(status().`is`(expected))
            }
        }
        verify { catalog wasNot Called }
    }
}
