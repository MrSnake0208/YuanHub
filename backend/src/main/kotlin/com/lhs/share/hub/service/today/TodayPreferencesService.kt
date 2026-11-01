package com.lhs.share.hub.service.today

import com.fasterxml.jackson.databind.JsonNode
import com.lhs.share.hub.controller.today.response.TodayPreferencesResponse
import com.lhs.share.hub.repository.TodayPreferencesRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.web.server.ResponseStatusException
import java.time.Clock

@Service
class TodayPreferencesService(
    private val repository: TodayPreferencesRepository,
    private val clock: Clock = Clock.systemUTC(),
) {
    private val modes = setOf("desktop", "mobile")
    private val modules = setOf("highlights", "checklist", "activities", "training", "private_items")

    fun get(userId: String, mode: String): TodayPreferencesResponse {
        validateMode(mode)
        val record = repository.find(userId, mode) ?: return TodayPreferencesResponse(mode)
        return TodayPreferencesResponse(mode, record.hiddenModules, record.schemaVersion, record.version, record.updatedAt)
    }

    fun save(userId: String, mode: String, body: JsonNode): TodayPreferencesResponse {
        validateMode(mode)
        val fields = setOf("schema_version", "expected_version", "hidden_modules")
        if (!body.isObject || body.fieldNames().asSequence().toSet() != fields) invalid("请求字段不正确")
        val schema = body.path("schema_version")
        if (!schema.isIntegralNumber || schema.intValue() != 1 || !schema.canConvertToInt()) invalid("不支持的首页配置版本")
        val version = body.path("expected_version")
        if (!version.isIntegralNumber || !version.canConvertToLong() || version.longValue() !in 0L until 9007199254740991L) {
            invalid("expected_version必须为有效的非负整数")
        }
        val hidden = body.path("hidden_modules")
        if (!hidden.isArray || hidden.size() > modules.size || hidden.any { !it.isTextual || it.textValue() !in modules }) {
            invalid("隐藏模块不正确")
        }
        val ids = hidden.map { it.textValue() }
        if (ids.distinct().size != ids.size) invalid("隐藏模块不能重复")
        val record = repository.replace(userId, mode, version.longValue(), ids.sorted(), clock.instant())
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "该端设置已在另一设备更新，请读取最新设置后核对并重试")
        return TodayPreferencesResponse(mode, record.hiddenModules, record.schemaVersion, record.version, record.updatedAt)
    }

    private fun validateMode(mode: String) {
        if (mode !in modes) invalid("布局类型必须为desktop或mobile")
    }

    private fun invalid(message: String): Nothing = throw ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, message)
}
