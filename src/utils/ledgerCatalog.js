import { packagesDaihao, packagesRu } from '../data/packages.js'
import { track1, track2, campaignEnds } from '../data/rewards.js'

export const LEDGER_CACHE_KEY = 'yh_ledger_catalog_v1'
export const bundledLedgerCatalog = {
  packages: { daihao: packagesDaihao, ru: packagesRu },
  campaigns: ['daihao', 'ru'].flatMap(game => [track1, track2].map((tiers, i) => ({
    id: `legacy:${game}:track${i + 1}`, game, name: i ? '男主限时累充' : '周年限时累充',
    starts_at: null, ends_at: campaignEnds[`track${i + 1}`], time_zone: 'Asia/Shanghai', status: 'published',
    source_note: '历史迁移：适用版本与开始日期未记录，仅供历史参考。', tiers,
  }))),
  exchangeRate: 6.7,
}

export function formatLedgerTime(value, timeZone) {
  if (!value) return '开始时间未记录'
  try {
    return new Intl.DateTimeFormat('zh-CN', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value))
  } catch { return value }
}

// Reject malformed responses as a whole; an explicit empty published catalog remains valid.
export function normalizeLedgerCatalog(value) {
  if (!value || !Array.isArray(value.packages) || !Array.isArray(value.campaigns) ||
      !Number.isFinite(value.settings?.exchange_rate) || value.settings.exchange_rate <= 0) throw new Error('公共目录返回格式不正确')
  const packages = { daihao: [], ru: [] }, seen = new Set()
  for (const item of value.packages) {
    const key = `${item.game}:${item.content_id}`
    const price = item.game === 'daihao' ? item.price_usd : item.price_cny
    if (!packages[item.game] || !Number.isSafeInteger(item.content_id) || item.content_id < 1 || seen.has(key) ||
        typeof item.name !== 'string' || !item.name.trim() || typeof item.category !== 'string' ||
        !Number.isInteger(item.points) || item.points < 0 || !Number.isFinite(item.draws) || item.draws < 0 ||
        !Number.isInteger(item.limit) || item.limit < 1 || !Number.isFinite(price) || price < 0 || item.enabled === false) throw new Error('公共礼包数据不完整')
    seen.add(key)
    packages[item.game].push({ id: item.content_id, name: item.name, points: item.points, draws: item.draws,
      limit: item.limit, category: item.category, sortId: item.sort_id, extra: item.extra,
      priceUsd: item.price_usd, priceCny: item.price_cny })
  }
  const campaignIds = new Set()
  for (const item of value.campaigns) {
    if (!packages[item.game] || typeof item.id !== 'string' || campaignIds.has(item.id) || typeof item.name !== 'string' ||
        item.status !== 'published' || !Number.isFinite(Date.parse(item.ends_at)) ||
        (item.starts_at != null && (!Number.isFinite(Date.parse(item.starts_at)) || Date.parse(item.starts_at) >= Date.parse(item.ends_at))) ||
        !Array.isArray(item.tiers) || !item.tiers.every(t => Number.isInteger(t.points) && t.points > 0 && Array.isArray(t.rewards) &&
          t.rewards.every(r => typeof r.name === 'string' && Number.isInteger(r.count) && r.count > 0))) throw new Error('公共活动数据不完整')
    try { new Intl.DateTimeFormat('zh-CN', { timeZone: item.time_zone }).format() } catch { throw new Error('公共活动时区不正确') }
    campaignIds.add(item.id)
  }
  return { packages, campaigns: value.campaigns, exchangeRate: value.settings.exchange_rate }
}

export function ledgerCampaignProgress(campaigns, game, points, now) {
  return campaigns.filter(c => c.game === game).map(c => {
    const end = Date.parse(c.ends_at), start = c.starts_at == null ? null : Date.parse(c.starts_at)
    let label = '活动进行中', active = true
    if (c.status === 'disabled') { label = '活动已停用'; active = false }
    else if (c.status !== 'published') { label = '草稿 · 未发布'; active = false }
    else if (end <= now) { label = '活动已结束'; active = false }
    else if (start == null) { label = '历史资料 · 开始时间待核实'; active = false }
    else if (start > now) { label = '活动未开始'; active = false }
    else {
      const seconds = Math.ceil((end - now) / 1000)
      label = `剩余: ${Math.floor(seconds / 86400)}天 ${Math.floor(seconds % 86400 / 3600)}小时 ${Math.floor(seconds % 3600 / 60)}分 ${seconds % 60}秒`
    }
    const tiers = c.tiers.filter(t => t.enabled !== false).sort((a, b) => (a.sort_id || 0) - (b.sort_id || 0) || a.points - b.points)
    const thresholds = tiers.map(t => t.points).sort((a, b) => a - b)
    return { ...c, active, label, unlocked: tiers.filter(t => points >= t.points), next: active ? thresholds.find(p => p > points) ?? null : null }
  })
}
