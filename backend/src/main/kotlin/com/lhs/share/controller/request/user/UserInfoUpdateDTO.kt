package com.lhs.share.controller.request.user

import jakarta.validation.constraints.NotBlank
import org.hibernate.validator.constraints.Length

data class UserInfoUpdateDTO(
    @field:NotBlank(message = "用户名长度应在4-24位之间")
    @field:Length(min = 4, max = 24, message = "用户名长度应在4-24位之间")
    val userName: String,
)
