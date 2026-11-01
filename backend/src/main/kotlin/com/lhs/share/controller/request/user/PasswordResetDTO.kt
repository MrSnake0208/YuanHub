package com.lhs.share.controller.request.user

import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank

data class PasswordResetDTO(
    @field:NotBlank(message = "邮箱格式错误")
    @field:Email(message = "邮箱格式错误")
    val email: String,
    @field:NotBlank(message = "请输入验证码")
    val activeCode: String,
    @field:NotBlank(message = "请输入用户密码")
    val password: String,
)
