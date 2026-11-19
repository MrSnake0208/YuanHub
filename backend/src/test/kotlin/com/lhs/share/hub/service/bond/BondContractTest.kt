package com.lhs.share.hub.service.bond

import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.handler.InventoryExceptionHandler
import com.lhs.share.hub.controller.bond.BondCatalogAdminController
import com.lhs.share.hub.controller.bond.BondController
import com.lhs.share.hub.repository.BondRepository
import com.lhs.share.hub.repository.SubAccountRepository
import com.lhs.share.hub.repository.entity.BondPublication
import com.lhs.share.hub.repository.entity.BondRecord
import com.lhs.share.hub.repository.entity.SubAccount
import com.lhs.share.hub.service.admin.AdminAuthorizationService
import com.lhs.share.hub.service.admin.AdminPermission
import io.mockk.Called
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
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
import org.springframework.transaction.support.TransactionTemplate
import java.net.URI
import java.time.Instant

class BondContractTest {
    private val mapper = bondMapper()
    private val service = mockk<BondService>()
    private val catalog = mockk<BondCatalogService>()
    private val helper = mockk<AuthenticationHelper>()
    private val authorization = mockk<AdminAuthorizationService>()
    private val battleId = "battle:char_004_guojia+all:combo"
    private lateinit var mvc: MockMvc

    @BeforeEach
    fun setup() {
        every { helper.obtainUserId() } returns "owner"
        mvc = mvcWith(service)
    }

    private fun mvcWith(bonds: BondService) = MockMvcBuilders.standaloneSetup(
        BondController(bonds, catalog, helper, mapper),
        BondCatalogAdminController(catalog, authorization, helper, mapper),
    ).setControllerAdvice(InventoryExceptionHandler())
        .setMessageConverters(ByteArrayHttpMessageConverter(), MappingJackson2HttpMessageConverter(mapper)).build()

    private fun battleBatchBody(revision: Long, records: List<Pair<String, Boolean>>) = mapper.writeValueAsString(
        mapOf(
            "account_id" to "a",
            "expected_revision" to revision,
            "catalog_version" to "v",
            "records" to records.map { (id, triggered) -> mapOf("bond_id" to id, "triggered" to triggered) },
        ),
    )

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
    fun `battle catalog is shared by both games and keeps published fields`() {
        val battleLists = listOf("代号鸢", "如鸢").map { game ->
            val entry = bondEntry(game = game)
            every { catalog.catalog(game) } returns BondPublication("v-$game", game, listOf(entry), achievementTargets = listOf(5L))
            val response = mvc.perform(get("/v1/bonds/catalog").param("game", game)).andExpect(status().isOk)
                .andExpect(jsonPath("$.data.catalog_version").value("v-$game"))
                .andExpect(jsonPath("$.data.game").value(game))
                .andExpect(jsonPath("$.data.entries[0].bond_id").value(entry.bondId))
                .andExpect(jsonPath("$.data.achievement_targets[0]").value(5))
                .andExpect(jsonPath("$.data.battle.length()").value(21))
                .andExpect(jsonPath("$.data.battle[0].bond_id").value(battleId))
                .andExpect(jsonPath("$.data.battle[0].members.length()").value(1))
                .andExpect(jsonPath("$.data.battle[0].members[0]").value("char_004_guojia"))
                .andExpect(jsonPath("$.data.battle[0].type").value("combo"))
                .andExpect(jsonPath("$.data.battle[0].display_name").value("郭嘉 × 全体密探"))
                .andExpect(jsonPath("$.data.battle[0].upstream_key").value("郭嘉_全体密探_合击"))
                .andReturn().response
            mapper.readTree(response.contentAsByteArray).path("data").path("battle")
        }
        assertEquals(battleLists[0], battleLists[1])
    }

    @Test
    fun `single and batch battle writes return the shared archive`() {
        val record = BondRecord(battleId, true, "manual", Instant.parse("2026-11-19T00:00:00Z"))
        val archive = BondArchiveResponse(
            "a", "代号鸢", 1, "v", emptyList(), BondSummary(0, 1, 0), listOf(record), BattleBondSummary(1, 21),
        )
        val secondId = "battle:char_029_xiuqiu+char_030_feiyun:combo"
        val changes = listOf(battleId to false, secondId to true)
        every { service.updateBattle("owner", "a", 0, "v", listOf(battleId to true)) } returns archive
        every { service.updateBattle("owner", "a", 1, "v", changes) } returns
            archive.copy(revision = 2, battleRecords = listOf(record.copy(triggered = false), record.copy(bondId = secondId)))

        mvc.perform(
            patch(URI.create("/v1/bonds/battle/records/battle%3Achar_004_guojia%2Ball%3Acombo")).contentType(MediaType.APPLICATION_JSON)
                .content("""{"account_id":"a","expected_revision":0,"catalog_version":"v","triggered":true}"""),
        ).andExpect(status().isOk)
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.data.revision").value(1))
            .andExpect(jsonPath("$.data.battle_records[0].bond_id").value(battleId))
            .andExpect(jsonPath("$.data.battle_records[0].triggered").value(true))
        mvc.perform(post("/v1/bonds/battle/batch").contentType(MediaType.APPLICATION_JSON).content(battleBatchBody(1, changes)))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.data.account_id").value("a"))
            .andExpect(jsonPath("$.data.revision").value(2))
            .andExpect(jsonPath("$.data.catalog_version").value("v"))
            .andExpect(jsonPath("$.data.records.length()").value(0))
            .andExpect(jsonPath("$.data.summary.triggered_count").value(0))
            .andExpect(jsonPath("$.data.battle_records[0].triggered").value(false))
            .andExpect(jsonPath("$.data.battle_records[1].bond_id").value(secondId))
            .andExpect(jsonPath("$.data.battle_records[1].triggered").value(true))
            .andExpect(jsonPath("$.data.battle_summary.triggered_count").value(1))
            .andExpect(jsonPath("$.data.battle_summary.available_total").value(21))
    }

    @Test
    fun `battle writes reject invalid IDs and empty oversized or duplicate batches`() {
        val accounts = mockk<SubAccountRepository>()
        val repository = mockk<BondRepository>()
        val transactions = TransactionTemplate(mockk(relaxed = true))
        val bonds = BondService(repository, accounts, catalog, mockk(), BondImportPreviews(), mapper, transactions)
        val mvc = mvcWith(bonds)
        every { accounts.findByUserIdAndAccountId("owner", "a") } returns
            SubAccount(id = "a-doc", userId = "owner", accountId = "a", name = "账号", game = "代号鸢")
        every { repository.find("owner", "a") } returns null
        every { catalog.catalog("代号鸢") } returns BondPublication("v", "代号鸢")

        for (records in listOf(emptyList(), List(51) { "battle:fixture_$it:combo" to true })) {
            mvc.perform(post("/v1/bonds/battle/batch").contentType(MediaType.APPLICATION_JSON).content(battleBatchBody(0, records)))
                .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("invalid_bond_request"))
        }
        verify { accounts wasNot Called }

        val missingId = "battle:char_029_xiuqiu+char_030_feiyun:guard"
        for (id in listOf("not-a-bond", missingId)) {
            mvc.perform(
                patch("/v1/bonds/battle/records/{id}", id).contentType(MediaType.APPLICATION_JSON)
                    .content("""{"account_id":"a","expected_revision":0,"catalog_version":"v","triggered":true}"""),
            ).andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("invalid_bond_request"))
        }
        for (records in listOf(
            listOf(battleId to true, battleId to false),
            listOf(battleId to true, missingId to true),
        )) {
            mvc.perform(post("/v1/bonds/battle/batch").contentType(MediaType.APPLICATION_JSON).content(battleBatchBody(0, records)))
                .andExpect(status().isUnprocessableEntity).andExpect(jsonPath("$.error.code").value("invalid_bond_request"))
        }
        verify(exactly = 0) { repository.save(any()) }
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
