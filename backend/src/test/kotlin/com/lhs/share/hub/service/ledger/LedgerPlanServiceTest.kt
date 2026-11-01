package com.lhs.share.hub.service.ledger

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.hub.controller.ledger.request.CartItemRequest
import com.lhs.share.hub.controller.ledger.request.CustomPackageRequest
import com.lhs.share.hub.controller.ledger.request.LedgerPlanCreateRequest
import com.lhs.share.hub.controller.ledger.request.PackageSnapshotRequest
import com.lhs.share.hub.repository.LedgerPlanRepository
import com.lhs.share.hub.repository.entity.LedgerPlan
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class LedgerPlanServiceTest {
    private val repository = mockk<LedgerPlanRepository>()
    private val properties = ShareProperties()
    private val service = LedgerPlanService(repository, properties)

    private val created = Instant.parse("2024-01-15T10:00:00Z")

    private fun snapshot(
        name: String = "年卡",
        points: Int = 2280,
        draws: Double = 180.0,
        priceUsd: Double? = 37.99,
        priceCny: Double? = null,
    ) = PackageSnapshotRequest(
        name = name,
        category = "超值",
        points = points,
        draws = draws,
        limit = 1,
        priceUsd = priceUsd,
        priceCny = priceCny,
        sortId = 10,
    )

    private fun daihaoRequest(): LedgerPlanCreateRequest = LedgerPlanCreateRequest(
        name = "周年庆-代号鸢",
        version = "daihao",
        exchangeRate = 7.2,
        initialPoints = 100,
        cartItems = listOf(
            CartItemRequest(contentId = 1, quantity = 2, packageSnapshot = snapshot()),
            CartItemRequest(
                contentId = 999,
                quantity = 1,
                packageSnapshot = snapshot(name = "我的礼包", points = 500, draws = 40.0, priceUsd = 9.99),
            ),
        ),
        customPackages = listOf(
            CustomPackageRequest(id = 999, name = "我的礼包", category = "自定义", points = 500, draws = 40.0, limit = 999, priceUsd = 9.99),
        ),
    )

    private fun existingPlan(id: String = "p1", version: String = "daihao") = LedgerPlan(
        id = id,
        userId = "u1",
        name = "旧方案",
        version = version,
        exchangeRate = 7.2,
        initialPoints = 0,
        createdAt = created,
        updatedAt = created,
    )

    @Test
    fun `创建成功 自定义礼包 id 重生成 快照归一化 摘要正确`() {
        every { repository.countByUserId("u1") } returns 0
        val saved = slot<LedgerPlan>()
        every { repository.save(capture(saved)) } answers { saved.captured.copy(id = "new-id") }

        val rsp = service.create("u1", daihaoRequest())

        assertEquals("new-id", rsp.id)
        assertEquals("u1", rsp.userId)

        // 自定义礼包 id 已被服务端重生成(不再是前端 999),购物车引用同步回写
        val custom = rsp.customPackages.single()
        assertTrue(custom.id != 999L)
        val customCartItem = rsp.cartItems.first { it.contentId == custom.id }
        assertEquals(1, customCartItem.quantity)
        assertTrue(customCartItem.packageSnapshot.custom)

        // 非本版本价格字段置 null(daihao 方案 price_cny 恒为 null)
        assertNull(custom.priceCny)
        assertNull(rsp.cartItems.first { it.contentId == 1L }.packageSnapshot.priceCny)

        // 摘要: (37.99*7.2*2 + 9.99*7.2*1), 积分 2280*2+500, 抽数 180*2+40
        val summary = rsp.summary!!
        assertEquals(547.056 + 71.928, summary.totalCny, 0.0001)
        assertEquals(5060L, summary.totalPoints)
        assertEquals(400.0, summary.totalDraws, 0.0001)

        // 汇率仅在 daihao 方案保留
        assertEquals(7.2, saved.captured.exchangeRate!!, 0.0001)
    }

    @Test
    fun `创建成功 ru 方案 price_usd 置空且汇率强制 null`() {
        every { repository.countByUserId("u1") } returns 0
        val saved = slot<LedgerPlan>()
        every { repository.save(capture(saved)) } answers { saved.captured.copy(id = "new-id") }

        val request = LedgerPlanCreateRequest(
            name = "如鸢方案",
            version = "ru",
            exchangeRate = 9.9,
            initialPoints = 0,
            cartItems = listOf(
                CartItemRequest(contentId = 1, quantity = 1, packageSnapshot = snapshot(priceUsd = null, priceCny = 248.0)),
            ),
            customPackages = emptyList(),
        )

        val rsp = service.create("u1", request)

        assertNull(rsp.exchangeRate)
        assertNull(rsp.cartItems.single().packageSnapshot.priceUsd)
        assertEquals(248.0, rsp.cartItems.single().packageSnapshot.priceCny!!, 0.0001)
        assertEquals(248.0, rsp.summary!!.totalCny, 0.0001)
    }

    @Test
    fun `创建超出每用户上限抛 429`() {
        every { repository.countByUserId("u1") } returns properties.ledger.maxPlansPerUser

        val ex = assertThrows(ApiResultException::class.java) {
            service.create("u1", daihaoRequest())
        }
        assertEquals(429, ex.statusCode)
    }

    @Test
    fun `daihao 自定义礼包缺 price_usd 抛 400`() {
        every { repository.countByUserId("u1") } returns 0
        val request = LedgerPlanCreateRequest(
            name = "x",
            version = "daihao",
            cartItems = emptyList(),
            customPackages = listOf(CustomPackageRequest(id = 1, name = "缺价", priceUsd = null)),
        )

        val ex = assertThrows(ApiResultException::class.java) {
            service.create("u1", request)
        }
        assertEquals(400, ex.statusCode)
    }

    @Test
    fun `ru 礼包快照缺 price_cny 抛 400`() {
        every { repository.countByUserId("u1") } returns 0
        val request = LedgerPlanCreateRequest(
            name = "x",
            version = "ru",
            cartItems = listOf(CartItemRequest(contentId = 1, quantity = 1, packageSnapshot = snapshot(priceUsd = null, priceCny = null))),
            customPackages = emptyList(),
        )

        val ex = assertThrows(ApiResultException::class.java) {
            service.create("u1", request)
        }
        assertEquals(400, ex.statusCode)
    }

    @Test
    fun `购物车同 id 条目合并数量`() {
        every { repository.countByUserId("u1") } returns 0
        val saved = slot<LedgerPlan>()
        every { repository.save(capture(saved)) } answers { saved.captured.copy(id = "new-id") }

        val request = LedgerPlanCreateRequest(
            name = "x",
            version = "daihao",
            cartItems = listOf(
                CartItemRequest(contentId = 1, quantity = 1, packageSnapshot = snapshot()),
                CartItemRequest(contentId = 1, quantity = 2, packageSnapshot = snapshot()),
            ),
            customPackages = emptyList(),
        )

        val rsp = service.create("u1", request)

        val item = rsp.cartItems.single()
        assertEquals(1L, item.contentId)
        assertEquals(3, item.quantity)
    }

    @Test
    fun `更新不存在或非本人方案抛 404`() {
        every { repository.findByIdAndUserId("p1", "u1") } returns null

        val ex = assertThrows(ApiResultException::class.java) {
            service.update("u1", "p1", daihaoRequest())
        }
        assertEquals(404, ex.statusCode)
    }

    @Test
    fun `更新成功保留原 id 与 createdAt`() {
        val existing = existingPlan()
        every { repository.findByIdAndUserId("p1", "u1") } returns existing
        val saved = slot<LedgerPlan>()
        every { repository.save(capture(saved)) } answers { saved.captured }

        val rsp = service.update("u1", "p1", daihaoRequest())

        assertEquals("p1", rsp.id)
        assertEquals(created, rsp.createdAt)
        assertEquals("周年庆-代号鸢", rsp.name)
    }

    @Test
    fun `详情成功与 404`() {
        every { repository.findByIdAndUserId("p1", "u1") } returns existingPlan()

        val rsp = service.getById("u1", "p1")
        assertEquals("p1", rsp.id)

        every { repository.findByIdAndUserId("p2", "u1") } returns null
        val ex = assertThrows(ApiResultException::class.java) {
            service.getById("u1", "p2")
        }
        assertEquals(404, ex.statusCode)
    }

    @Test
    fun `列表按 version 过滤且返回轻量字段`() {
        every { repository.findByUserIdOrderByUpdatedAtDesc("u1") } returns listOf(
            existingPlan(id = "p1", version = "daihao"),
            existingPlan(id = "p2", version = "ru"),
        )

        val all = service.list("u1", null)
        assertEquals(2, all.size)

        val daihao = service.list("u1", "daihao")
        assertEquals(1, daihao.size)
        assertEquals("p1", daihao.single().id)
    }

    @Test
    fun `删除不存在抛 404`() {
        every { repository.findByIdAndUserId("p1", "u1") } returns null

        val ex = assertThrows(ApiResultException::class.java) {
            service.delete("u1", "p1")
        }
        assertEquals(404, ex.statusCode)
    }

    @Test
    fun `删除成功调用 deleteById`() {
        every { repository.findByIdAndUserId("p1", "u1") } returns existingPlan()
        every { repository.deleteById("p1") } just Runs

        service.delete("u1", "p1")

        verify(exactly = 1) { repository.deleteById("p1") }
    }
}
