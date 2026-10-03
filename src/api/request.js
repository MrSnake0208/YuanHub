import { isBetaAccessError, requiresBetaApi } from '../utils/betaAccess.js'
import {
  createTimeoutSignal,
  requestTimeoutError,
  resolveRequestTimeoutMs
} from '../utils/requestTimeout.js'

// 统一的 fetch 请求封装
// - 统一 baseURL（VITE_API_BASE，未配置时使用当前站点）
// - 自动 JSON 序列化 / 反序列化
// - expectedUserId 可选：身份变化时阻止请求及 401 重放（日历管理使用）
// - auth=true 时自动附带 'Authorization: Bearer <accessToken>' 头
// - 解析后端统一响应 { status_code, message, data }
//   - statusCode===200 → 返回 data
//   - 否则 throw new Error(message || '请求失败')
// - 统一请求超时（默认 12s；上传 120s / 下载 60s；可用 timeoutMs 覆盖或传 0 关闭）
// - 兼容库存接口的两种差异：
//   - raw=true：成功时返回「完整 JSON」（如 /v1/inventory/export 直接返回交换文档，无 ApiResult 包装）
//   - 库存错误结构 { error: { code, message, record_id?, entry_id? } }（非 ApiResult），自动提取 error.message
// - 401 且 auth=true：刷新一次 token 并重放原请求（仅一次）；
//   后端明确拒绝 refresh token 才清登录态并跳转 /login，
//   超时 / 断网等临时失败只抛出错误，不能把用户直接踢下线。
//
// 超时为什么在 request 层：移动端 / PWA 冷启动会遇到网络切换与半连接，
// fetch 可能长时间 pending；没有超时则首次路由永远不结束（只剩背景色）。
// SSE 不经过本函数（见 api/accountEvents.js），因此不会被这里的超时截断。
//
// 为避免与 store/auth.js 产生模块循环依赖，这里通过「动态 import」在真正
// 需要时才加载 store（仅读取 token / 调用 refresh() / logout()）。

export const API_BASE =
  (import.meta.env && import.meta.env.VITE_API_BASE) || "";

/**
 * 把后端返回的相对资源路径拼成完整 URL。
 * 密探头像的 avatar 字段是相对路径（如 "/avatar/char_xxx.webp"），
 * 这里统一加 API_BASE；已是绝对 URL（如未来 CDN 地址）则原样返回。
 */
export function avatarUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return API_BASE + path;
}

export async function request(
  path,
  { method = "GET", body, auth = false, expectedUserId, raw = false, multipart = false, responseType = "json", headers: extraHeaders, timeoutMs } = {},
) {
  let refreshed = false;
  const effectiveTimeoutMs = resolveRequestTimeoutMs({ timeoutMs, multipart, responseType, raw });

  // Opt-in identity binding: a late 401 must not replay one user's command as another user.
  function assertIdentity(store) {
    if (expectedUserId === undefined) return
    if (!store?.accessToken || !expectedUserId || String(store.userInfo?.id || '') !== String(expectedUserId)) {
      throw requestError('登录身份已变化，请刷新后重试。', 401, { error: { code: 'request_identity_changed' } })
    }
  }

  function requestError(message, status, payload) {
    const detail = payload && payload.error
      ? payload.error
      : payload && payload.data && payload.data.error
        ? payload.data.error
        : payload && payload.data && typeof payload.data === 'object'
          ? payload.data
          : payload
    const error = new Error(message || "请求失败")
    error.status = status
    error.code = detail && (detail.code || detail.error_code || detail.errorCode)
    error.payload = payload
    return error
  }

  async function doRequest() {
    // multipart 上传时不能手动设 Content-Type（浏览器会带 boundary），仅保留认证头。
    const headers = multipart
      ? Object.assign({}, extraHeaders)
      : Object.assign({ "Content-Type": "application/json" }, extraHeaders);

    let store = null;
    // 记录本次请求实际使用的 token：用于识别「token 已被并发请求换新」，
    // 避免用已经被轮换掉的 refresh token 再刷一次。
    let usedToken = "";
    if (auth) {
      const mod = await import("../store/auth.js");
      store = mod.auth;
      assertIdentity(store);
      if (store && store.accessToken) {
        headers["Authorization"] = "Bearer " + store.accessToken;
        usedToken = store.accessToken;
      }
    }

    // Covers cloud calls from profile, local calculator and iframe bridges, not just route navigation.
    if (requiresBetaApi(method, path)) {
      const { beta } = await import('../store/beta.js')
      const { auth: currentAuth } = await import('../store/auth.js')
      beta.setIdentity(currentAuth.userInfo?.id || '')
      await beta.requireAccess()
    }
    if (auth) assertIdentity(store)
    const opts = { method, headers };
    if (multipart) {
      // body 是调用方构造的 FormData，原样透传
      opts.body = body;
    } else if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    if (path.startsWith('/v1/beta') || path.startsWith('/v1/admin/beta')) opts.cache = 'no-store'

    // 超时只包住「网络读写」这一段：响应读完即取消计时器，
    // 这样 401 重放与状态处理不会互相延长对方的超时窗口。
    const timeout = createTimeoutSignal(effectiveTimeoutMs)
    if (timeout.signal) opts.signal = timeout.signal

    let res = null
    let payload = null
    let blobResult = null
    try {
      res = await fetch(API_BASE + path, opts);

      const disposition = res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('content-disposition')
        : ''
      const contentType = res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('content-type') || ''
        : ''
      if (responseType === 'blob' && res.ok && (disposition || !/application\/json/i.test(contentType))) {
        blobResult = { blob: await res.blob(), headers: res.headers }
      } else {
        // 反序列化响应体
        try {
          payload = await res.json();
        } catch (_e) {
          payload = null;
        }
      }
    } catch (error) {
      if (error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
        throw requestTimeoutError(timeout.timeoutMs || effectiveTimeoutMs)
      }
      throw error
    } finally {
      timeout.cancel()
    }

    if (blobResult) return blobResult

    // 统一提取业务状态码与错误信息：
    // 兼容 ApiResult{ status_code, message, data } 与 库存 { error: { code, message } }。
    const statusCode =
      payload && payload.status_code != null
        ? payload.status_code
        : payload && payload.statusCode != null
          ? payload.statusCode
          : res.status;
    const message =
      payload && payload.error != null
        ? payload.error.message || payload.error.code
        : payload && payload.message != null
          ? payload.message
          : res.statusText || "请求失败";

    const betaFailure = requestError(message, statusCode, payload)
    if (isBetaAccessError(betaFailure) && !path.startsWith('/v1/beta/')) {
      const { beta } = await import('../store/beta.js')
      beta.invalidate(betaFailure.status === 503 ? betaFailure.message : '')
      throw betaFailure
    }

    async function refreshAccessAfterForbidden() {
      if (!auth || path === '/v1/admin/access/me') return
      const mod = await import('../store/auth.js')
      assertIdentity(mod.auth)
      if (mod.auth && mod.auth.refreshAdminAccess) {
        await mod.auth.refreshAdminAccess({ suppressErrors: true })
      }
    }

    /**
     * 401 恢复。返回：
     * - 'replay'   可以立刻用新 token 重放原请求
     * - 'expired'  登录态确实失效（已登出并跳转登录页）
     * - 'transient' 临时失败（超时/断网），保留登录态，由调用方抛错重试
     */
    async function recoverFromUnauthorized() {
      const mod = await import("../store/auth.js");
      store = mod.auth;
      assertIdentity(store);
      // token 已被其他并发请求换新：直接重放，不再消耗 refresh token。
      if (store && store.accessToken && usedToken && store.accessToken !== usedToken) {
        return 'replay';
      }
      if (store && store.refreshToken) {
        const ok = await store.refresh();
        assertIdentity(store);
        if (ok) return 'replay';
        if (!store.refreshRejected) return 'transient';
      }
      // 刷新失败或明确无 refreshToken：清登录态并跳转登录页
      await store.logout();
      if (typeof location !== "undefined") {
        location.href = "/login";
      }
      return 'expired';
    }

    async function handleUnauthorized() {
      const outcome = await recoverFromUnauthorized();
      if (outcome === 'replay') return doRequest(); // 用新 token 重放原请求（仅此一次）
      if (outcome === 'transient') {
        throw requestError(message || "登录态刷新失败，请检查网络后重试", statusCode, payload);
      }
      throw requestError(message || "未认证，请重新登录", statusCode, payload);
    }

    // raw：返回完整 JSON（库存导出等无包装端点）
    if (raw) {
      if (res.ok && statusCode !== 401 && statusCode !== 403) return payload;
      // 401 且需认证：静默刷新并重放一次
      if (statusCode === 401 && auth && !refreshed) {
        refreshed = true;
        return handleUnauthorized();
      }
      if (statusCode === 403) await refreshAccessAfterForbidden()
      throw requestError(message || "请求失败", statusCode, payload);
    }

    if (responseType === 'blob' && res.ok && statusCode === 200) {
      throw requestError("附件响应无效", statusCode, payload)
    }

    // 成功
    if (statusCode === 200) {
      return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : undefined;
    }

    // 401 且需要认证：静默刷新一次并重放
    if (statusCode === 401 && auth && !refreshed) {
      refreshed = true;
      return handleUnauthorized();
    }

    if (statusCode === 403) await refreshAccessAfterForbidden()

    throw requestError(message || "请求失败", statusCode, payload);
  }

  return doRequest();
}
