// 统一的请求超时策略。
//
// 为什么需要：移动端 / PWA 冷启动时会遇到 Wi-Fi→蜂窝切换、DNS 半连接、
// CDN 回源挂起等情况，fetch 可能长时间 pending。首次路由一旦被这种请求
// 卡住，用户就只能看到 PWA 背景色，表现为「网站卡死」。
//
// 这里有且只有一套超时实现：api/request.js（普通接口）与 api/system.js
// （deploy-meta.json）共用，避免多处各写一套魔法数字。
export const DEFAULT_REQUEST_TIMEOUT_MS = 12000
// 上传（multipart）与文件下载天然更慢，不能被普通接口的短超时截断。
export const UPLOAD_REQUEST_TIMEOUT_MS = 120000
export const DOWNLOAD_REQUEST_TIMEOUT_MS = 60000

/**
 * 解析某次请求实际生效的超时时间（毫秒）。
 * - 未显式传入时按请求形态取默认值：上传 > 下载 / 整包导出 > 普通接口
 * - 显式传入 0 / 负数 / 非数字表示「关闭超时」（长任务、SSE 等由调用方自行管理）
 */
export function resolveRequestTimeoutMs({ timeoutMs, multipart = false, responseType = 'json', raw = false } = {}) {
  if (timeoutMs === undefined || timeoutMs === null) {
    if (multipart) return UPLOAD_REQUEST_TIMEOUT_MS
    // blob 下载与 raw 整包导出（库存 / 密探 / 图鉴）体积不可控，按下载档处理
    if (responseType === 'blob' || raw) return DOWNLOAD_REQUEST_TIMEOUT_MS
    return DEFAULT_REQUEST_TIMEOUT_MS
  }
  const value = Number(timeoutMs)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * 创建一个到点自动 abort 的 signal。
 * 环境缺少 AbortController 或超时被关闭时返回空 signal，调用方无需分支处理。
 */
export function createTimeoutSignal(timeoutMs) {
  if (!(timeoutMs > 0) || typeof AbortController === 'undefined') {
    return {
      signal: undefined,
      timeoutMs: 0,
      cancel: function () {}
    }
  }
  const controller = new AbortController()
  const timer = setTimeout(function () { controller.abort() }, timeoutMs)
  return {
    signal: controller.signal,
    timeoutMs,
    cancel: function () { clearTimeout(timer) }
  }
}

/** 把 AbortError 转成调用方与页面都能识别的超时错误（可被正常 catch / 展示）。 */
export function requestTimeoutError(timeoutMs) {
  const seconds = Math.max(1, Math.round(timeoutMs / 1000))
  const error = new Error('请求超时（' + seconds + ' 秒），请检查网络后重试。')
  error.name = 'TimeoutError'
  error.code = 'REQUEST_TIMEOUT'
  error.status = 0
  return error
}
