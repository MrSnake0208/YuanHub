// 统一的 fetch 请求封装
// - 统一 baseURL（VITE_API_BASE，默认为本地后端）
// - 自动 JSON 序列化 / 反序列化
// - auth=true 时自动附带 'Authorization: Bearer <accessToken>' 头
// - 解析后端统一响应 { statusCode, message, data }
//   - statusCode===200 → 返回 data
//   - 否则 throw new Error(message || '请求失败')
// - 401 且 auth=true：用 refreshToken 静默刷新一次并重放原请求（仅一次）；
//   刷新失败（或无 refreshToken）则清登录态并跳转 /login
//
// 为避免与 store/auth.js 产生模块循环依赖，这里通过「动态 import」在真正
// 需要时才加载 store（仅读取 token / 调用 refresh() / logout()）。

const API_BASE = import.meta.env.VITE_API_BASE || "http://192.168.31.55:8080";

export async function request(
  path,
  { method = "GET", body, auth = false } = {},
) {
  let refreshed = false;

  async function doRequest() {
    const headers = { "Content-Type": "application/json" };

    let store = null;
    if (auth) {
      const mod = await import("../store/auth.js");
      store = mod.auth;
      if (store && store.accessToken) {
        headers["Authorization"] = `Bearer ${store.accessToken}`;
      }
    }

    const opts = { method, headers };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${path}`, opts);

    // 反序列化统一响应包装
    let payload = null;
    try {
      payload = await res.json();
    } catch (_e) {
      payload = null;
    }

    // 后端 Jackson SNAKE_CASE：业务状态码字段为 status_code（兼容 statusCode 写法）
    const statusCode =
      payload && payload.status_code != null
        ? payload.status_code
        : payload && payload.statusCode != null
          ? payload.statusCode
          : res.status;
    const message =
      payload && payload.message != null
        ? payload.message
        : res.statusText || "请求失败";

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
