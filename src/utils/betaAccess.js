export const BETA_INTENTS = Object.freeze([
  { key: 'MAAYUAN_SYNC', label: 'MaaYuan 数据同步' },
  { key: 'INVENTORY_REWARDS', label: '背包与奖励统计' },
  { key: 'GROWTH_PLANNER', label: '养成规划' },
  { key: 'BOX_SHARE', label: 'BOX 分享' },
  { key: 'MOBILE_VIEW', label: '手机端体验' }
])

export function safeBetaRedirect(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\u0000-\u001f]/.test(value)) return fallback
  try {
    const decoded = decodeURIComponent(value)
    if (decoded.startsWith('//') || /[\\\u0000-\u001f]/.test(decoded)) return fallback
    const url = new URL(value, 'https://yuanhub.invalid')
    if (url.origin !== 'https://yuanhub.invalid' || ['/login', '/register', '/forgot'].includes(url.pathname)) return fallback
    return url.pathname + url.search + url.hash
  } catch (_) { return fallback }
}

export function betaEntryTarget(value) {
  const path = safeBetaRedirect(value)
  return /^\/beta(?:[/?#]|$)/.test(path) ? '/' : path
}

export function betaLandingFor(value) {
  return { path: '/beta', query: { redirect: betaEntryTarget(value) } }
}

export function requiresBetaApi(method, rawPath) {
  const path = String(rawPath || '').split('?')[0]
  const verb = String(method || 'GET').toUpperCase()
  if (verb === 'OPTIONS') return false
  if (verb === 'GET' && ['/v1/inventory/catalog', '/v1/operator/catalog'].includes(path)) return false
  if (verb === 'GET' && path.startsWith('/v1/operator/share/view/')) return false
  if (verb === 'POST' && path === '/user/open-api/token') return true
  if (verb === 'PATCH' && path.startsWith('/user/open-api/tokens/') && path.endsWith('/scopes')) return true
  return ['/v1/accounts', '/v1/inventory', '/v1/operator', '/v1/star-state', '/v1/star-loadout', '/v1/star-loadout-presets', '/v1/star/captures', '/hub/ledger/plan']
    .some(prefix => path === prefix || path.startsWith(prefix + '/'))
}

export function isBetaAccessError(error) {
  return !!error && (error.status === 403 || error.status === 503) && String(error.code || '').startsWith('beta_')
}

export function betaAccessError(state) {
  const unavailable = !!(state.personalError || state.publicError)
  const closed = state.campaign?.accessMode === 'CLOSED' || state.campaign?.publicState === 'NOT_STARTED'
  const error = new Error(unavailable ? '暂时无法确认体验资格，请联网后重试。' : closed ? '内测功能暂未开放或正在维护。' : '请先前往内测页面报名；名额已满时可登记候补。')
  error.status = unavailable ? 503 : 403
  error.code = unavailable ? 'beta_temporarily_unavailable' : closed ? 'beta_service_closed' : 'beta_access_required'
  return error
}

export function betaStatusCopy(campaign, mine, error = '') {
  if (error) return { title: '当前状态暂时无法读取', description: '请联网后重试。这不代表名额已满，也不会影响作业站账号注册。' }
  if (!campaign) return { title: '正在读取内测状态', description: '请先了解参与规则；注册账号本身不会占用体验名额。' }
  if (campaign.accessMode === 'CLOSED') return { title: '内测功能暂未开放或正在维护', description: '账号、公开作业及反馈入口仍可使用。' }
  if (campaign.publicState === 'NOT_STARTED') return { title: '本轮报名尚未开始', description: '请按下方公告时间参与，不需要提前注册多个账号。' }
  if (campaign.accessMode === 'OPEN') return { title: 'YuanHub 已正式开放', description: '无需内测资格，个人云数据仍需登录后使用。' }
  if (mine?.canUseBetaFeatures) return { title: '你已获得本轮内测资格', description: campaign.admissionsPaused ? '本轮暂缓新增，但你可以继续体验。' : '欢迎开始体验；一次正常使用的结果，也值得反馈。' }
  if (campaign.admissionsPaused) return { title: '本轮暂缓新增体验', description: campaign.pauseReason || '正在处理测试反馈，仍可登记候补，恢复后按顺序开通。' }
  if (mine?.enrollmentStatus === 'WAITING') return { title: '已登记候补，无需重复报名', description: campaign.publicState === 'ALLOCATION_PENDING' ? '系统正在按顺序开通，请稍后刷新状态。' : '后续释放或增加名额时将按规则自动递补；不保证在正式开放前获邀。' }
  if (mine?.shareSnapshotEligible && campaign.reservedRemaining > 0) {
    if (campaign.localTestMode) return { title: '本地模拟预留可用', description: '本地模式把已激活账号模拟为 Share 快照用户，用于测试预留名额流程。' }
    return { title: '你符合 Share 存量预留条件', description: '预留名额由符合条件的老用户共同领取，按报名顺序分配，并非每人保证一份。' }
  }
  const copy = {
    OPEN_REGISTRATION: ['本轮支持自助报名', '无需人工审核，名额已满时自动进入候补。'],
    PUBLIC_FULL_RESERVED_REMAIN: ['当前公开报名名额已满', '符合快照条件的 Share 老用户仍可领取剩余预留，其他用户可登记候补。'],
    FULL: ['当前批次体验名额已满', '你仍可登记候补；后续释放或扩容时按顺序开通。'],
    ALLOCATION_PENDING: ['系统正在按顺序开通', '已有候补优先，新增报名不会越过队列。']
  }[campaign.publicState] || ['查看内测说明', '以服务器当前状态与公告为准。']
  return { title: copy[0], description: copy[1] }
}

export function formatBetaTime(value, timeZone = 'Asia/Shanghai') {
  if (!value || !Number.isFinite(Date.parse(value))) return '尚未配置'
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + '（' + timeZone + '）'
  } catch (_) { return value }
}

export function betaAuditSnapshotParts(value) {
  if (!value || typeof value !== 'object') return []
  const parts = []
  if (value.access_mode) parts.push('开放模式：' + value.access_mode)
  if (value.capacity != null) parts.push('当前容量：' + value.capacity)
  if (value.admissions_paused != null) parts.push('新增资格：' + (String(value.admissions_paused) === 'true' ? '暂停' : '开放'))
  if (value.config_version != null) parts.push('配置版本：' + value.config_version)
  if (value.reason) parts.push('变更原因：' + value.reason)
  return parts
}
