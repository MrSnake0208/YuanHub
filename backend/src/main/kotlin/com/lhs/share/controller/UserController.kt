package com.lhs.share.controller

import com.lhs.share.config.doc.RequireJwt
import com.lhs.share.config.security.AuthenticationHelper
import com.lhs.share.controller.request.user.LoginDTO
import com.lhs.share.controller.request.user.PasswordResetDTO
import com.lhs.share.controller.request.user.PasswordResetVCodeDTO
import com.lhs.share.controller.request.user.PasswordUpdateDTO
import com.lhs.share.controller.request.user.RefreshReq
import com.lhs.share.controller.request.user.RegisterDTO
import com.lhs.share.controller.request.user.SendRegistrationTokenDTO
import com.lhs.share.controller.request.user.UserInfoUpdateDTO
import com.lhs.share.controller.response.ApiResult
import com.lhs.share.controller.response.ApiResult.Companion.success
import com.lhs.share.controller.response.user.MaaLoginRsp
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.service.EmailService
import com.lhs.share.service.UserService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import org.springframework.data.domain.PageRequest
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

/**
 * 用户接口:注册/登录/改密/重置/改名/刷新 token + 只读查询
 *
 * 与 MaaYuan-Share-Backend 共用 maa_user 集合,路由与语义对齐原项目
 */
@Tag(name = "User", description = "用户管理")
@RequestMapping("/user")
@Validated
@RestController
class UserController(
    private val userService: UserService,
    private val emailService: EmailService,
    private val helper: AuthenticationHelper,
) {
    /**
     * 修改当前用户密码(根据原密码)
     */
    @Operation(summary = "修改当前用户密码", description = "根据原密码")
    @RequireJwt
    @PostMapping("/update/password")
    fun updatePassword(@Valid @RequestBody updateDTO: PasswordUpdateDTO): ApiResult<Unit> {
        userService.modifyPassword(helper.requireUserId(), updateDTO.newPassword, updateDTO.originalPassword)
        return success()
    }

    /**
     * 更新用户详细信息
     */
    @Operation(summary = "更新用户详细信息")
    @RequireJwt
    @PostMapping("/update/info")
    fun updateInfo(@Valid @RequestBody updateDTO: UserInfoUpdateDTO): ApiResult<Unit> {
        userService.updateUserInfo(helper.requireUserId(), updateDTO)
        return success()
    }

    /**
     * 邮箱重设密码
     */
    @Operation(summary = "重置密码")
    @PostMapping("/password/reset")
    fun passwordReset(@Valid @RequestBody passwordResetDTO: PasswordResetDTO): ApiResult<Unit> {
        // 校验用户邮箱是否存在
        userService.checkUserExistByEmail(passwordResetDTO.email)
        userService.modifyPasswordByActiveCode(passwordResetDTO)
        return success()
    }

    /**
     * 发送用于重置密码的验证码
     */
    @Operation(summary = "发送用于重置密码的验证码")
    @PostMapping("/password/reset_request")
    fun passwordResetRequest(@Valid @RequestBody passwordResetVCodeDTO: PasswordResetVCodeDTO): ApiResult<Unit> {
        // 校验用户邮箱是否存在
        userService.checkUserExistByEmail(passwordResetVCodeDTO.email)
        emailService.sendVCode(passwordResetVCodeDTO.email)
        return success()
    }

    /**
     * 刷新 token
     */
    @Operation(summary = "刷新 token")
    @PostMapping("/refresh")
    fun refresh(@RequestBody request: RefreshReq): ApiResult<MaaLoginRsp> {
        return success(userService.refreshToken(request.refreshToken))
    }

    /**
     * 用户注册
     */
    @Operation(summary = "用户注册")
    @PostMapping("/register")
    fun register(@Valid @RequestBody user: RegisterDTO): ApiResult<MaaUserInfo> = success(userService.register(user))

    /**
     * 注册时发送验证码
     */
    @Operation(summary = "注册时发送验证码")
    @PostMapping("/sendRegistrationToken")
    fun sendRegistrationToken(@Valid @RequestBody regDTO: SendRegistrationTokenDTO): ApiResult<Unit> {
        userService.sendRegistrationToken(regDTO)
        return success()
    }

    /**
     * 用户登录
     */
    @Operation(summary = "用户登录")
    @PostMapping("/login")
    fun login(@Valid @RequestBody user: LoginDTO): ApiResult<MaaLoginRsp> = success(userService.login(user))

    /**
     * 按 userId 查询用户公开信息,查不到返回 404
     */
    @Operation(summary = "查询用户公开信息")
    @GetMapping("/info")
    fun getUserInfo(@RequestParam userId: String): ApiResult<MaaUserInfo> = success(userService.getRequired(userId))

    /**
     * 用户模糊搜索(仅已激活用户,分页,size 上限 50)
     */
    @Operation(summary = "用户模糊搜索")
    @GetMapping("/search")
    fun searchUsers(
        @RequestParam userName: String,
        @RequestParam page: Int = 1,
        @Max(50, message = "查询用户量不能超过50") @RequestParam size: Int = 10,
    ): ApiResult<List<MaaUserInfo>> {
        val pageable = PageRequest.of(page - 1, size)
        val resultPage = userService.search(userName, pageable)
        return success(resultPage.content)
    }
}
