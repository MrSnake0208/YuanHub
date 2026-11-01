package com.lhs.share.service.model

import com.fasterxml.jackson.annotation.JsonIgnore
import com.lhs.share.repository.entity.MaaUser
import org.springframework.security.core.GrantedAuthority
import org.springframework.security.core.userdetails.UserDetails

/**
 * Spring Security 登录用户封装
 */
class LoginUser(
    private val maaUser: MaaUser,
    private val authorities: Collection<GrantedAuthority>,
) : UserDetails {
    @JsonIgnore
    override fun getAuthorities(): Collection<GrantedAuthority> = authorities

    @JsonIgnore
    override fun getPassword(): String = maaUser.password

    val userId: String?
        get() = maaUser.userId

    /**
     * Spring Security 框架中的 username 即唯一身份标识(ID)
     * 效果同 getEmail
     */
    @JsonIgnore
    override fun getUsername(): String = maaUser.email

    @get:JsonIgnore
    val email: String
        get() = maaUser.email

    override fun isAccountNonExpired(): Boolean = true

    override fun isAccountNonLocked(): Boolean = true

    override fun isCredentialsNonExpired(): Boolean = true

    override fun isEnabled(): Boolean = maaUser.status != 0
}
