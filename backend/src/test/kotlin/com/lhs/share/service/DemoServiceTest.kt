package com.lhs.share.service

import com.lhs.share.controller.request.demo.DemoCreateRequest
import com.lhs.share.repository.DemoRepository
import com.lhs.share.repository.entity.DemoEntity
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

class DemoServiceTest {
    private val demoRepository = mockk<DemoRepository>()
    private val demoService = DemoService(demoRepository)

    @Test
    fun `创建示例资源`() {
        every { demoRepository.save(any()) } answers {
            firstArg<DemoEntity>().copy(id = "demo-1")
        }

        val response = demoService.create(DemoCreateRequest(name = "test", description = "desc"))

        assertEquals("demo-1", response.id)
        assertEquals("test", response.name)
        assertNotNull(response.createdAt)
    }

    @Test
    fun `按 id 查询不存在的资源时抛出异常`() {
        every { demoRepository.findById("not-exist") } returns java.util.Optional.empty()

        org.junit.jupiter.api.Assertions.assertThrows(com.lhs.share.controller.response.ApiResultException::class.java) {
            demoService.getById("not-exist")
        }
    }
}
