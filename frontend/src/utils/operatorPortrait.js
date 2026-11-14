import operatorPortraits from '../data/operatorPortraits.json'
import { portraitUrl } from '../api/request.js'

export function resolveOperatorPortrait(operatorId, catalogEntry) {
  const path = catalogEntry?.portrait
  const sha256 = catalogEntry?.portraitSha256 || catalogEntry?.portrait_sha256
  const versioned = path && sha256 && !/[?&]v=/.test(path)
    ? path + (path.includes('?') ? '&' : '?') + 'v=' + sha256.slice(0, 16)
    : path
  const src = path ? portraitUrl(versioned) : operatorPortraits[operatorId] || ''
  // 头像组件还会解析后端地址，统一为绝对 URL 避免重复添加 API 前缀。
  return src && typeof window !== 'undefined' ? new URL(src, window.location.origin).href : src
}
