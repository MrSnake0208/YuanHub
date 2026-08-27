function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2 || !parts[1]) return null

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch (_e) {
    return null
  }
}

export function isAdminAccessToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload) return false

  const rawAuthorities = payload.Authorities ?? payload.authorities
  const authorities = Array.isArray(rawAuthorities)
    ? rawAuthorities
    : String(rawAuthorities || '').split(',')

  return authorities.some(function (authority) {
    const status = Number(String(authority).trim())
    return Number.isFinite(status) && status >= 2
  })
}
