// YuanHub 前端版本检测的纯逻辑：归一化、比较与开关判定。
// 不依赖 Vue / DOM，便于用 node:test 直接覆盖。
import { FALLBACK_PRODUCT_VERSION } from '../config/buildInfo.js'

/** 页面保持打开时的版本检查间隔：60 秒，避免高频请求。 */
export const VERSION_CHECK_INTERVAL_MS = 60 * 1000

/** 初始 / interval / visibilitychange 之间的最小检查间隔，避免同一时刻重复请求。 */
export const MIN_VERSION_CHECK_GAP_MS = 10 * 1000

/**
 * 版本号归一化：去掉首尾空白与可选的 v 前缀。
 * 缺失 / 空串返回 ''，调用方据此判定“不可比较”。
 */
export function normalizeVersion(value) {
  if (value == null) return ''
  return String(value).trim().replace(/^v/i, '')
}

/**
 * 是否检测到新版本。
 * 只要 current !== latest 即视为当前页面已过期，不做 semver 大小判断。
 * current / latest 任一为空，或 current 仍是“无 VERSION 构建”的占位值时，
 * 都不提示，避免构建异常导致全站永久显示更新提示。
 */
export function hasNewVersion(current, latest) {
  const currentText = normalizeVersion(current)
  const latestText = normalizeVersion(latest)
  if (!currentText || !latestText) return false
  if (currentText === FALLBACK_PRODUCT_VERSION) return false
  return currentText !== latestText
}

/**
 * 版本检测开关：
 * - VITE_ENABLE_VERSION_CHECK === 'true' 显式开启（可在本地手工验证）
 * - VITE_ENABLE_VERSION_CHECK === 'false' 显式关闭
 * - 其余情况只在生产构建（import.meta.env.PROD）开启，避免本地 dev 一直提示
 */
export function isVersionCheckEnabled(env) {
  const source = env && typeof env === 'object' ? env : import.meta.env || {}
  if (source.VITE_ENABLE_VERSION_CHECK === 'true') return true
  if (source.VITE_ENABLE_VERSION_CHECK === 'false') return false
  return source.PROD === true
}
