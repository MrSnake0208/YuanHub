package com.lhs.share.service

import com.lhs.share.config.external.ShareProperties
import com.lhs.share.controller.request.user.LoginDTO
import com.lhs.share.controller.request.user.PasswordResetDTO
import com.lhs.share.controller.request.user.RegisterDTO
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.repository.UserRepository
import com.lhs.share.repository.entity.MaaUser
import com.lhs.share.service.jwt.JwtService
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import java.time.Instant

class UserServiceTest {
    private val userRepository = mockk<UserRepository>()
    private val emailService = mockk<EmailService>()
    private val passwordEncoder = BCryptPasswordEncoder()
    private val userDetailService = UserDetailServiceImpl(userRepository)
    private val jwtService = JwtService(
        ShareProperties().apply { jwt.secret = "test-secret-test-secret-test-secret-test-secret" },
    )

    private val userService = UserService(
        userRepository,
        emailService,
        passwordEncoder,
        userDetailService,
        jwtService,
    )

    private fun user(
        id: String = "u1",
        name: String = "user-$id",
        email: String = "$id@test.com",
        status: Int = 1,
        password: String? = null,
    ) = MaaUser(
        userId = id,
        userName = name,
        email = email,
        password = password ?: passwordEncoder.encode("password123"),
        status = status,
        pwdUpdateTime = Instant.now(),
    )

    @Test
    fun `登录成功返回 token`() {
        val u = user()
        every { userRepository.findByEmail("u1@test.com") } returns u

        val rsp = userService.login(LoginDTO(email = "u1@test.com", password = "password123"))

        assertEquals("u1", rsp.userInfo.id)
        assertTrue(rsp.token.isNotBlank())
        assertTrue(rsp.refreshToken.isNotBlank())
    }

    @Test
    fun `登录密码错误抛出 401`() {
        val u = user()
        every { userRepository.findByEmail("u1@test.com") } returns u

        val ex = assertThrows(ApiResultException::class.java) {
            userService.login(LoginDTO(email = "u1@test.com", password = "wrong-password"))
        }
        assertEquals(401, ex.statusCode)
    }

    @Test
    fun `未激活用户登录抛出 401`() {
        val u = user(status = 0)
        every { userRepository.findByEmail("u1@test.com") } returns u

        val ex = assertThrows(ApiResultException::class.java) {
            userService.login(LoginDTO(email = "u1@test.com", password = "password123"))
        }
        assertEquals(401, ex.statusCode)
    }

    @Test
    fun `注册成功写入用户`() {
        val dto = RegisterDTO(
            email = "new@test.com",
            userName = "newuser",
            password = "password123",
            registrationToken = "ABC123",
        )
        every { userRepository.existsByUserName("newuser") } returns false
        every { emailService.verifyVCode("new@test.com", "ABC123") } returns Unit
        every { userRepository.save(any()) } answers { firstArg<MaaUser>().copy(userId = "new-id") }

        val info = userService.register(dto)

        assertEquals("new-id", info.id)
        assertEquals("newuser", info.userName)
        assertTrue(info.activated)
    }

    @Test
    fun `用户名已存在注册抛出异常`() {
        val dto = RegisterDTO(
            email = "new@test.com",
            userName = "taken",
            password = "password123",
            registrationToken = "ABC123",
        )
        every { userRepository.existsByUserName("taken") } returns true

        assertThrows(IllegalStateException::class.java) {
            userService.register(dto)
        }
    }

    @Test
    fun `重置密码通过验证码`() {
        val u = user()
        val dto = PasswordResetDTO(
            email = "u1@test.com",
            activeCode = "ABC123",
            password = "newpassword123",
        )
        every { emailService.verifyVCode("u1@test.com", "ABC123") } returns Unit
        every { userRepository.findByEmail("u1@test.com") } returns u
        every { userRepository.findById("u1") } returns java.util.Optional.of(u)
        every { userRepository.save(any()) } answers { firstArg() }

        userService.modifyPasswordByActiveCode(dto)

        assertTrue(passwordEncoder.matches("newpassword123", u.password))
    }

    @Test
    fun `查不到用户返回 UNKNOWN 哨兵`() {
        every { userRepository.findByUserId("ghost") } returns null

        assertEquals("未知用户:(", userService.findByUserIdOrDefault("ghost").userName)
    }

    @Test
    fun `禁用用户不能刷新 token`() {
        val refreshToken = jwtService.issueRefreshToken("u1", null).value
        every { userRepository.findById("u1") } returns java.util.Optional.of(user(status = 0))

        val ex = assertThrows(ApiResultException::class.java) {
            userService.refreshToken(refreshToken)
        }

        assertEquals(401, ex.statusCode)
        assertEquals("用户未启用", ex.message)
    }

    @Test
    fun `批量查询 UserDict`() {
        val users = listOf(user("u1"), user("u2"))
        every { userRepository.findAllById(any()) } returns users

        val dict = userService.findByUsersId(listOf("u1", "u2", "u3"))

        assertEquals("user-u1", dict["u1"]?.userName)
        assertNull(dict["u3"])
        assertEquals("未知用户:(", dict.getOrDefault("u3").userName)
    }
}
