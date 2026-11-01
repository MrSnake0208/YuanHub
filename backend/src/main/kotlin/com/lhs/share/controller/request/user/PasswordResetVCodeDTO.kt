package com.lhs.share.controller.request.user

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank

data class PasswordResetVCodeDTO(
    @field:NotBlank(message = "邮箱格式错误")
    @field:Email(message = "邮箱格式错误")
    val email: String,
)
