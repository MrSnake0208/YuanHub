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

/** tone drives the on-page status colour; title/description stay plain-language for ordinary users. */
export function betaStatusCopy(campaign, mine, error = '') {
  if (error) return { tone: 'error', title: '暂时无法读取开放状态', description: '请检查网络后再点一次「刷新状态」。这不代表名额已满，也不影响注册和登录。' }
  if (!campaign) return { tone: 'loading', title: '正在读取内测状态', description: '稍等一下就好；注册账号不会占用体验名额。' }
  if (campaign.accessMode === 'CLOSED') return { tone: 'closed', title: '内测正在维护，暂时关闭', description: '本地账房和反馈入口仍可正常使用。' }
  if (campaign.publicState === 'NOT_STARTED') return { tone: 'pending', title: '本轮报名还没有开始', description: '按下方公布的时间回来报名即可，不需要提前注册多个账号。' }
  if (campaign.accessMode === 'OPEN') return { tone: 'open', title: 'YuanHub 已正式开放', description: '现在无需内测资格；登录后即可使用个人云端数据。' }
  if (mine?.canUseBetaFeatures) return { tone: 'granted', title: '你已获得本轮体验资格', description: campaign.admissionsPaused ? '本轮暂缓新增名额，但你仍可继续体验。' : '欢迎开始体验；用一次、遇到问题反馈一下，都很有帮助。' }
  if (campaign.admissionsPaused) return { tone: 'paused', title: '本轮暂时停止新增名额', description: campaign.pauseReason || '正在处理反馈，仍可登记候补，恢复后按报名顺序开通。' }
  if (mine?.enrollmentStatus === 'WAITING') return { tone: 'waiting', title: '你已在候补队列中', description: campaign.publicState === 'ALLOCATION_PENDING' ? '系统正在按顺序开通，稍后刷新状态即可。' : '一旦有释放或新增名额，会按报名顺序自动开通，不需要重复报名。' }
  if (mine?.shareSnapshotEligible && campaign.reservedRemaining > 0) {
    if (campaign.localTestMode) return { tone: 'reserved', title: '本地模拟预留名额可用', description: '本地模式把已激活账号当作 MaaYuan Share 用户，用来测试预留名额流程。' }
    return { tone: 'reserved', title: '你可以领取 MaaYuan Share 用户预留名额', description: '预留名额由符合条件的 MaaYuan Share 用户按报名顺序领取，并非每人保证一份。' }
  }
  const copy = {
    OPEN_REGISTRATION: { tone: 'join', title: '现在可以自助报名', description: '不需要人工审核，点一下就能领取资格；名额满了会自动进入候补。' },
    PUBLIC_FULL_RESERVED_REMAIN: { tone: 'reserved', title: '公开报名名额已满', description: '符合条件的 MaaYuan Share 用户仍可领取预留名额；其他用户可以登记候补。' },
    FULL: { tone: 'full', title: '本批体验名额已满', description: '你仍可以登记候补；后续释放或扩容时会按报名顺序开通。' },
    ALLOCATION_PENDING: { tone: 'waiting', title: '系统正在按顺序开通', description: '已有候补优先，新报名不会插队。' }
  }[campaign.publicState] || { tone: 'info', title: '查看内测说明', description: '以服务器当前状态与公告为准。' }
  return copy
}

export function formatBetaTime(value, timeZone = 'Asia/Shanghai') {
  if (!value || !Number.isFinite(Date.parse(value))) return '尚未配置'
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) + '（' + timeZone + '）'
  } catch (_) { return value }
}

/** Reader-facing date for the user page: "9月21日 20:00", without the timezone suffix. */
export function formatBetaDay(value, timeZone = 'Asia/Shanghai') {
  if (!value || !Number.isFinite(Date.parse(value))) return '尚未公布'
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone, month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
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
