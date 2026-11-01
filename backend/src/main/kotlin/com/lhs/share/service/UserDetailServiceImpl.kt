package com.lhs.share.service

import com.lhs.share.repository.UserRepository
import com.lhs.share.repository.entity.MaaUser
import com.lhs.share.service.model.LoginUser
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.userdetails.UserDetails
import org.springframework.security.core.userdetails.UserDetailsService
import org.springframework.security.core.userdetails.UsernameNotFoundException
import org.springframework.stereotype.Service

/**
 * Spring Security 用户详情服务,按邮箱加载用户
 */
@Service
class UserDetailServiceImpl(
    private val userRepository: UserRepository,
) : UserDetailsService {
    /**
     * 查询用户信息
     *
     * @param email 用户使用邮箱登录
     * @return 用户详细信息
     * @throws UsernameNotFoundException 用户未找到
     */
    @Throws(UsernameNotFoundException::class)
    override fun loadUserByUsername(email: String): UserDetails {
        val user = userRepository.findByEmail(email) ?: throw UsernameNotFoundException("用户不存在")
        val permissions = collectAuthoritiesFor(user)
        return LoginUser(user, permissions)
    }

    /**
     * 收集用户权限:status 为几就拥有 0..status 的所有权限(与原项目一致)
     */
    fun collectAuthoritiesFor(user: MaaUser): Collection<GrantedAuthority> {
        val authorities = ArrayList<GrantedAuthority>()
        for (i in 0..user.status) {
            authorities.add(SimpleGrantedAuthority(i.toString()))
        }
        return authorities
    }
}
