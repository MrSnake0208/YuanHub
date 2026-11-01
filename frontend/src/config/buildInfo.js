// YuanHub 版本 / 构建信息统一模块
//
// 产品版本唯一来源是仓库根目录的 VERSION 文件；构建时由 vite.config.js 读取，
// 连同当前前端 commit 与构建时间一起注入到 __YUANHUB_BUILD_INFO__。
// 页面只能从这里读取，不要在各处自行拼版本字符串。
//
// 无 Git 环境（例如源码压缩包构建）时 commit 降级为 "unknown"，不会让构建失败。

const UNKNOWN = 'unknown'
// 无 VERSION / 无构建注入时的占位版本；版本检测据此判定“不可比较”，避免永久提示。
export const FALLBACK_PRODUCT_VERSION = '0.0.0-dev'

function text(value) {
  if (value == null) return ''
  const normalized = String(value).trim()
  return normalized === UNKNOWN ? '' : normalized
}

/**
 * 归一化构建期注入的原始数据，缺失字段一律降级而不是抛错。
 * 纯函数，便于在无构建环境（node --test）下直接测试。
 */
export function normalizeBuildInfo(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return Object.freeze({
    productVersion: text(source.productVersion) || FALLBACK_PRODUCT_VERSION,
    frontendCommit: text(source.frontendCommit) || UNKNOWN,
    buildTime: text(source.buildTime) || UNKNOWN
  })
}

function injectedBuildInfo() {
  try {
    // vite define 在构建产物中替换成字面量对象；未注入时 typeof 为 'undefined' 而不抛错。
    return typeof __YUANHUB_BUILD_INFO__ === 'object' ? __YUANHUB_BUILD_INFO__ : null
  } catch (error) {
    return null
  }
}

/** 当前构建的版本与诊断信息 */
export const buildInfo = normalizeBuildInfo(injectedBuildInfo())

export const productVersion = buildInfo.productVersion
export const frontendCommit = buildInfo.frontendCommit
export const buildTime = buildInfo.buildTime

/** 展示用标签，例如 v0.0.1-beta.1 */
export function versionLabel(version) {
  const value = text(version) || productVersion
  return value.replace(/^v/i, '') ? 'v' + value.replace(/^v/i, '') : ''
}

export const productVersionLabel = versionLabel(productVersion)

/**
 * 低视觉权重的单行诊断文案，例如 "YuanHub v0.0.1-beta.1 · Build abc1234"。
 * 供侧边栏与反馈详情共用，保证各处格式一致。
 */
export function formatBuildInfo(info) {
  const value = info && typeof info === 'object' ? normalizeBuildInfo(info) : buildInfo
  const label = versionLabel(value.productVersion)
  const head = label ? 'YuanHub ' + label : 'YuanHub'
  return value.frontendCommit === UNKNOWN ? head : head + ' · Build ' + value.frontendCommit
}

/** 提交反馈时携带的应用诊断信息（不含 IP / UA，那部分仍由 clientInfoConsent 控制） */
export function feedbackDiagnostics(info) {
  const value = info && typeof info === 'object' ? normalizeBuildInfo(info) : buildInfo
  return {
    product_version: value.productVersion,
    frontend_commit: value.frontendCommit,
    build_time: value.buildTime
  }
}

export { UNKNOWN as UNKNOWN_BUILD_VALUE }
