// 统一的 fetch 请求封装
// - 统一 baseURL（VITE_API_BASE，默认为本地后端）
// - 自动 JSON 序列化 / 反序列化
// - auth=true 时自动附带 'Authorization: Bearer <accessToken>' 头
// - 解析后端统一响应 { status_code, message, data }
//   - statusCode===200 → 返回 data
//   - 否则 throw new Error(message || '请求失败')
// - 兼容库存接口的两种差异：
//   - raw=true：成功时返回「完整 JSON」（如 /v1/inventory/export 直接返回交换文档，无 ApiResult 包装）
//   - 库存错误结构 { error: { code, message, record_id?, entry_id? } }（非 ApiResult），自动提取 error.message
// - 401 且 auth=true：用 refreshToken 静默刷新一次并重放原请求（仅一次）；
//   刷新失败（或无 refreshToken）则清登录态并跳转 /login
//
// 为避免与 store/auth.js 产生模块循环依赖，这里通过「动态 import」在真正
// 需要时才加载 store（仅读取 token / 调用 refresh() / logout()）。

export const API_BASE =
  import.meta.env.VITE_API_BASE || "https://hub.maayuan.fun:16666";

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
  { method = "GET", body, auth = false, raw = false, multipart = false } = {},
) {
  let refreshed = false;

  async function doRequest() {
    // multipart 上传时不能手动设 Content-Type（浏览器会带 boundary），仅保留认证头。
    const headers = multipart ? {} : { "Content-Type": "application/json" };

    let store = null;
    if (auth) {
      const mod = await import("../store/auth.js");
      store = mod.auth;
      if (store && store.accessToken) {
        headers["Authorization"] = "Bearer " + store.accessToken;
      }
    }

    const opts = { method, headers };
    if (multipart) {
      // body 是调用方构造的 FormData，原样透传
      opts.body = body;
    } else if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(API_BASE + path, opts);

    // 反序列化响应体
    let payload = null;
    try {
      payload = await res.json();
    } catch (_e) {
      payload = null;
    }

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

    // raw：返回完整 JSON（库存导出等无包装端点）
    if (raw) {
      if (res.ok) return payload;
      // 401 且需认证：静默刷新并重放一次
      if (res.status === 401 && auth && !refreshed) {
        refreshed = true;
        const mod = await import("../store/auth.js");
        store = mod.auth;
        if (store && store.refreshToken) {
          const ok = await store.refresh();
          if (ok) return doRequest();
        }
        await store.logout();
        if (typeof location !== "undefined") {
          location.href = "/login";
        }
      }
      throw new Error(message || "请求失败");
    }

    // 成功
    if (statusCode === 200) {
      if (payload && payload.data != null) return payload.data;
      throw new Error(message || "请求失败（返回数据为空）");
    }

    // 401 且需要认证：用 refreshToken 静默刷新一次并重放
    if (statusCode === 401 && auth && !refreshed) {
      refreshed = true;
      const mod = await import("../store/auth.js");
      store = mod.auth;
      if (store && store.refreshToken) {
        const ok = await store.refresh();
        if (ok) {
          return doRequest(); // 用新 token 重放原请求（仅此一次）
        }
      }
      // 刷新失败或无 refreshToken：清登录态并跳转登录页
      await store.logout();
      if (typeof location !== "undefined") {
        location.href = "/login";
      }
      throw new Error(message || "未认证，请重新登录");
    }

    throw new Error(message || "请求失败");
  }

  return doRequest();
}
