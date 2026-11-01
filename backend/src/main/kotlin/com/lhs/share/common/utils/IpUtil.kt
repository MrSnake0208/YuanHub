package com.lhs.share.common.utils

import jakarta.servlet.http.HttpServletRequest
import java.net.InetAddress
import java.net.UnknownHostException

/**
 * 获取客户端 IP 的工具类
 */
object IpUtil {
    /**
     * 获取登录用户 IP 地址
     *
     * @param request 请求
     * @return IP 地址
     */
    fun getIpAddr(request: HttpServletRequest): String {
        var ip = request.getHeader("x-forwarded-for")
        if (ip.isNullOrEmpty() || "unknown".equals(ip, ignoreCase = true)) {
            ip = request.getHeader("Proxy-Client-IP")
        }
        if (ip.isNullOrEmpty() || "unknown".equals(ip, ignoreCase = true)) {
            ip = request.getHeader("WL-Proxy-Client-IP")
        }
        if (ip.isNullOrEmpty() || "unknown".equals(ip, ignoreCase = true)) {
            ip = request.remoteAddr
            if (ip == "127.0.0.1") {
                // 根据网卡取本机配置的 IP
                try {
                    val inet: InetAddress? = InetAddress.getLocalHost()
                    ip = inet?.hostAddress
                } catch (ignored: UnknownHostException) {
                }
            }
        }
        // 对于通过多个代理的情况,第一个 IP 为客户端真实 IP,多个 IP 按照 ',' 分割
        if (ip != null && ip.length > 15 && ip.indexOf(",") > 0) {
            ip = ip.substring(0, ip.indexOf(","))
        }
        return ip
    }
}
