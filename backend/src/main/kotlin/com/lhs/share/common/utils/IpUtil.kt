package com.lhs.share.common.utils

import jakarta.servlet.http.HttpServletRequest

/** 客户端来源由 Tomcat 按可信代理配置解析。 */
object IpUtil {
    fun getIpAddr(request: HttpServletRequest): String = request.remoteAddr
}
