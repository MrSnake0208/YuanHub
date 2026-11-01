package com.lhs.share.hub.controller.inventory.request

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.annotation.JsonSetter
import com.fasterxml.jackson.annotation.Nulls
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

/**
 * 生产者平台信息(协议 3 producer 字段)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
data class ProducerDto(
    @field:NotBlank(message = "platform 不能为空")
    @field:Size(min = 1, max = 64, message = "platform 长度须在 1..64")
    @field:Pattern(regexp = "^[a-z0-9][a-z0-9._-]{0,63}$", message = "platform 格式非法")
    val platform: String,
    @field:Size(min = 1, max = 128, message = "version 长度须在 1..128")
    @field:JsonSetter(nulls = Nulls.FAIL)
    val version: String? = null,
)
