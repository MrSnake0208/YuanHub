package com.lhs.share.service

import com.lhs.share.controller.request.user.LoginDTO
import com.lhs.share.controller.request.user.PasswordResetDTO
import com.lhs.share.controller.request.user.RegisterDTO
import com.lhs.share.controller.request.user.UserInfoUpdateDTO
import com.lhs.share.controller.response.ApiResultException
import com.lhs.share.controller.response.user.MaaLoginRsp
import com.lhs.share.controller.response.user.MaaUserInfo
import com.lhs.share.repository.UserRepository
import com.lhs.share.repository.entity.MaaUser
import com.lhs.share.service.jwt.JwtAuthToken
import com.lhs.share.service.jwt.JwtExpiredException
import com.lhs.share.service.jwt.JwtInvalidException
import com.lhs.share.service.jwt.JwtService
import com.lhs.share.service.jwt.LoginSessions
import org.springframework.dao.DuplicateKeyException
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.repository.findByIdOrNull
import org.springframework.http.HttpStatus
import org.springframework.scheduling.annotation.Async
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

/**
 * 用户服务:注册/登录/改密/重置/改名/刷新 token + 只读查询
 *
 * 与 MaaYuan-Share-Backend 共用 maa_user 集合,业务语义与原项目保持一致
 */
@Service
class UserService(
    private val userRepository: UserRepository,
    private val emailService: EmailService,
    private val passwordEncoder: PasswordEncoder,
    private val userDetailService: UserDetailServiceImpl,
    private val jwtService: JwtService,
    private val sessions: LoginSessions,
) {
    // Unknown mailboxes take the same password-verification path as known ones.
    private val missingUserPassword = passwordEncoder.encode(UUID.randomUUID().toString())

    /**
     * 登录,成功返回携带 access/refresh token 的响应
     */
    fun login(loginDTO: LoginDTO): MaaLoginRsp {
        val startedAt = Instant.now()
        val user = userRepository.findByEmail(loginDTO.email)
        if (!passwordEncoder.matches(loginDTO.password, user?.password ?: missingUserPassword) || user == null) {
            throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), "用户不存在或者密码错误")
        }
        // 未激活的用户
        if (user.status <= 0) {
            throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), "用户未启用")
        }

        val authorities = userDetailService.collectAuthoritiesFor(user)
        val refreshToken = sessions.start(user.userId!!, startedAt)
        val authToken = jwtService.issueAuthToken(user.userId, refreshToken.jwtId, authorities, refreshToken.issuedAt)

        return MaaLoginRsp(
            authToken.value,
            authToken.expiresAt,
            authToken.notBefore,
            refreshToken.value,
            refreshToken.expiresAt,
            refreshToken.notBefore,
            MaaUserInfo(user),
        )
    }

    /**
     * 修改密码
     *
     * @param userId 当前用户
     * @param rawPassword 新密码
     * @param originPassword 原密码(通过邮箱验证码重置时传 null)
     * @param verifyOriginPassword 是否校验原密码
     */
    fun modifyPassword(userId: String, rawPassword: String, originPassword: String? = null, verifyOriginPassword: Boolean = true) {
        val maaUser = userRepository.findByIdOrNull(userId) ?: return
        if (verifyOriginPassword) {
            check(!originPassword.isNullOrEmpty()) { "请输入原密码" }
            check(passwordEncoder.matches(originPassword, maaUser.password)) { "原密码错误" }
            // 通过原密码修改密码不能过于频繁
            check(ChronoUnit.MINUTES.between(maaUser.pwdUpdateTime, Instant.now()) >= 10L) { "密码修改过于频繁" }
        }
        // 修改密码的逻辑,应当使用与 authentication provider 一致的编码器
        if (userRepository.changePassword(userId, maaUser.password, passwordEncoder.encode(rawPassword), Instant.now()) != 1L) {
            throw ApiResultException(409, "密码已变更，请重试")
        }
    }

    /**
     * 用户注册(邮箱验证码模式)
     */
    fun register(registerDTO: RegisterDTO): MaaUserInfo {
        val userName = registerDTO.userName.trim()
        check(userName.length >= 4) { "用户名长度应在4-24位之间" }
        check(!userRepository.existsByUserName(userName)) { "用户名已存在,请重新取个名字吧" }

        // 邮箱验证码校验
        val token = registerDTO.registrationToken?.trim().orEmpty()
        emailService.verifyVCode(registerDTO.email, EmailCodePurpose.REGISTER, token)

        val encoded = passwordEncoder.encode(registerDTO.password)

        val user = MaaUser(
            userName = userName,
            email = registerDTO.email,
            password = encoded,
            status = 1,
            pwdUpdateTime = Instant.now(),
        )
        return try {
            userRepository.save(user).run(::MaaUserInfo)
        } catch (_: DuplicateKeyException) {
            throw ApiResultException(HttpStatus.BAD_REQUEST.value(), "用户已存在")
        }
    }

    /**
     * 更新用户信息(目前只支持修改用户名)
     */
    fun updateUserInfo(userId: String, updateDTO: UserInfoUpdateDTO) {
        val maaUser = userRepository.findByIdOrNull(userId) ?: return
        val newName = updateDTO.userName.trim()
        check(newName.length >= 4) { "用户名长度应在4-24位之间" }
        if (newName == maaUser.userName) {
            // 暂时只支持修改用户名
            return
        }
        check(!userRepository.existsByUserName(newName)) { "用户名已存在,请重新取个名字吧" }
        userRepository.changeUserName(userId, newName)
    }

    /**
     * 刷新 token
     */
    fun refreshToken(token: String): MaaLoginRsp {
        try {
            val old = jwtService.verifyAndParseRefreshToken(token)

            val userId = old.subject
            val user = userRepository.findById(userId).orElseThrow()
            if (user.status <= 0) {
                throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), "用户未启用")
            }
            if (old.issuedAt.isBefore(user.pwdUpdateTime)) {
                throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), "invalid token")
            }

            val refreshToken = sessions.refresh(old, user.pwdUpdateTime)
            val authorities = userDetailService.collectAuthoritiesFor(user)
            val authToken = jwtService.issueAuthToken(userId, refreshToken.jwtId, authorities, refreshToken.issuedAt)

            return MaaLoginRsp(
                authToken.value,
                authToken.expiresAt,
                authToken.notBefore,
                refreshToken.value,
                refreshToken.expiresAt,
                refreshToken.notBefore,
                MaaUserInfo(user),
            )
        } catch (e: JwtInvalidException) {
            throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), e.message)
        } catch (e: JwtExpiredException) {
            throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), e.message)
        } catch (e: NoSuchElementException) {
            throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), e.message)
        }
    }

    fun logout(token: String, access: JwtAuthToken?) {
        val refresh = try {
            jwtService.verifyAndParseRefreshToken(token)
        } catch (_: JwtExpiredException) {
            return
        } catch (_: JwtInvalidException) {
            return
        }
        sessions.logout(refresh, access)
    }

    /**
     * 通过邮箱激活码更新密码
     */
    fun modifyPasswordByActiveCode(passwordResetDTO: PasswordResetDTO) {
        emailService.verifyVCode(passwordResetDTO.email, EmailCodePurpose.RESET_PASSWORD, passwordResetDTO.activeCode)
        val maaUser = userRepository.findByEmail(passwordResetDTO.email)
            ?: throw ApiResultException(HttpStatus.UNAUTHORIZED.value(), "验证码错误")
        modifyPassword(maaUser.userId!!, passwordResetDTO.password, verifyOriginPassword = false)
    }

    @Async
    fun deliverCode(email: String, purpose: EmailCodePurpose) {
        val exists = userRepository.findByEmail(email) != null
        if ((purpose == EmailCodePurpose.REGISTER) != exists) emailService.sendVCode(email, purpose)
    }

    // ===== 只读查询(与原项目语义一致) =====

    fun findByUserIdOrDefault(id: String): MaaUser = userRepository.findByUserId(id) ?: MaaUser.UNKNOWN

    fun findByUsersId(ids: Iterable<String>): UserDict = UserDict(userRepository.findAllById(ids).toList())

    fun get(userId: String): MaaUserInfo? = userRepository.findByUserId(userId)?.run(::MaaUserInfo)

    fun getRequired(userId: String): MaaUserInfo = get(userId) ?: throw ApiResultException(HttpStatus.NOT_FOUND.value(), "用户不存在: $userId")

    fun findFeedbackAccessUserByEmail(email: String): MaaUser? = userRepository.findByEmailIgnoreCase(email)
        ?.takeIf { it.status > 0 }

    fun search(userName: String, pageable: Pageable): Page<MaaUserInfo> {
        val term = userName.trim()
        if (term.length !in 2..48) throw ApiResultException(400, "请输入 2 至 48 个字符的用户名")
        return userRepository.searchUsers(Regex.escape(term), pageable)
    }

    fun searchFeedbackAccessUsers(query: String, pageable: Pageable): Page<MaaUser> =
        userRepository.searchFeedbackAccessUsers(query, pageable)

    class UserDict(users: List<MaaUser>) {
        private val userMap = users.associateBy { it.userId!! }

        fun entries() = userMap.entries

        operator fun get(id: String): MaaUser? = userMap[id]

        fun getOrDefault(id: String) = get(id) ?: MaaUser.UNKNOWN
    }
}
