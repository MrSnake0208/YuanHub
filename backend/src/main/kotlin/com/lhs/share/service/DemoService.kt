package com.lhs.share.service

import com.lhs.share.controller.request.demo.DemoCreateRequest
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.controller.response.demo.DemoResponse
import com.lhs.share.repository.DemoRepository
import com.lhs.share.repository.entity.DemoEntity
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service

/**
 * 示例服务,演示 service 层写法,接入真实业务后可删除
 */
@Service
class DemoService(private val demoRepository: DemoRepository) {
    fun create(request: DemoCreateRequest): DemoResponse {
        val entity = demoRepository.save(
            DemoEntity(
                name = request.name,
                description = request.description,
            ),
        )
        return entity.toResponse()
    }

    fun getById(id: String): DemoResponse {
        val entity = demoRepository.findById(id).orElseThrow {
            ApiResultException(HttpStatus.NOT_FOUND.value(), "资源不存在: $id")
        }
        return entity.toResponse()
    }

    fun list(): List<DemoResponse> = demoRepository.findAll().map { it.toResponse() }

    private fun DemoEntity.toResponse() = DemoResponse(
        id = checkNotNull(id) { "实体未持久化" },
        name = name,
        description = description,
        createdAt = createdAt,
    )
}
