export const CALENDAR_GAMES = Object.freeze(['代号鸢', '如鸢'])
export const CALENDAR_CATEGORIES = Object.freeze({ ACTIVITY: '活动', RECRUITMENT: '招募', LOGIN: '登录 / 签到', SHOP: '商店 / 兑换', MAINTENANCE: '维护', OTHER: '其它' })
export const MANUAL_CATEGORIES = Object.freeze(Object.fromEntries(Object.entries(CALENDAR_CATEGORIES).filter(([key]) => key !== 'RECRUITMENT')))
export const SERVER_TIME_ZONE = 'Asia/Shanghai'

export function serverToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: SERVER_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = type => parts.find(item => item.type === type).value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function addCalendarDays(date, days) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function millisecondsUntilServerMidnight(now = new Date()) {
  // Asia/Shanghai uses UTC+08:00; calendar dates never use the browser's local zone.
  return Date.parse(addCalendarDays(serverToday(now), 1) + 'T00:00:00+08:00') - now.getTime()
}

export function safeCalendarUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : ''
  } catch { return '' }
}

export function normalizeCalendarItem(value) {
  if (!value || typeof value.id !== 'string' || !value.id || !CALENDAR_GAMES.includes(value.game) || !Object.hasOwn(CALENDAR_CATEGORIES, value.category) || typeof value.title !== 'string' || !value.title.trim()) return null
  if (!isCalendarDate(value.start_date) || !isCalendarDate(value.end_date) || value.end_date < value.start_date) return null
  const paired = /^([01]\d|2[0-3]):[0-5]\d$/.test(value.start_time) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.end_time)
  return {
    id: value.id, source_type: value.source_type === 'RECRUITMENT_POOL' ? 'RECRUITMENT_POOL' : 'MANUAL', source_ref: value.source_ref ?? null,
    game: value.game, title: value.title.trim(), category: value.category,
    start_date: value.start_date, end_date: value.end_date, start_time: paired ? value.start_time : null, end_time: paired ? value.end_time : null,
    start_at: validCalendarInstant(value.start_at), end_at: validCalendarInstant(value.end_at),
    time_zone: value.time_zone || SERVER_TIME_ZONE, description: typeof value.description === 'string' ? value.description : '', source_url: safeCalendarUrl(value.source_url),
  }
}

export function normalizeCalendarItems(items) { return (Array.isArray(items) ? items : []).map(normalizeCalendarItem).filter(Boolean) }

// Normalized public items have stable ids. Starts and ends may overlap; total does not.
export function summarizeCalendarDay(items, today) {
  const counts = { starts: 0, ends: 0, ongoing: 0, total: 0 }
  const seen = new Set()
  for (const item of items) {
    if (seen.has(item.id) || item.start_date > today || item.end_date < today) continue
    seen.add(item.id)
    counts.total++
    if (item.start_date === today) counts.starts++
    if (item.end_date === today) counts.ends++
    if (item.start_date < today && item.end_date > today) counts.ongoing++
  }
  return counts
}

export function calendarStatuses(item, today, now = Date.now()) {
  if (item.end_at && Date.parse(item.end_at) <= now) return ['已结束']
  if (item.start_at && Date.parse(item.start_at) > now) return ['即将开始']
  if (!item.end_at && item.end_date < today) return ['已结束']
  if (!item.start_at && item.start_date > today) return ['即将开始']
  const labels = []
  if (item.end_date === today) labels.push('今日结束')
  if (item.start_date === today) labels.push('今日开始')
  return labels.length ? labels : ['进行中']
}

export function groupCalendarItems(items, today) {
  const weekEnd = addCalendarDays(today, 7)
  const sections = [{ key: 'today', title: '今天', groups: [] }, { key: 'week', title: '接下来 7 天', groups: [] }, { key: 'later', title: '更晚', groups: [] }]
  const sorted = items.filter(item => item.end_date >= today).slice().sort((a, b) => {
    const rank = item => item.end_date === today ? 0 : item.start_date === today ? 1 : item.start_date < today ? 2 : 3
    return rank(a) - rank(b) || a.start_date.localeCompare(b.start_date) || (a.start_time || '').localeCompare(b.start_time || '') || a.id.localeCompare(b.id)
  })
  for (const item of sorted) {
    const date = item.start_date <= today ? today : item.start_date
    const section = sections[date === today ? 0 : date <= weekEnd ? 1 : 2]
    let group = section.groups.find(group => group.date === date)
    if (!group) { group = { date, items: [] }; section.groups.push(group) }
    group.items.push(item)
  }
  return sections
}

export function calendarFilters(query = {}) {
  const first = value => Array.isArray(value) ? value[0] : value
  const game = first(query.game), category = first(query.category)
  return { game: CALENDAR_GAMES.includes(game) ? game : '', category: Object.hasOwn(CALENDAR_CATEGORIES, category) ? category : '' }
}

export function calendarFilterQuery(query, patch) {
  const filters = calendarFilters({ ...calendarFilters(query), ...patch })
  const result = { ...query }
  for (const key of ['game', 'category']) {
    if (filters[key]) result[key] = filters[key]
    else delete result[key]
  }
  return result
}

export const CALENDAR_VIEWS = Object.freeze({ agenda: '日程', timeline: '时间轴', month: '月历' })
export const CALENDAR_VIEW_STORAGE_KEY = 'yuanhub.activity-calendar.view.v1'
const firstQueryValue = value => Array.isArray(value) ? value[0] : value

export function calendarView(query = {}, preference = '', wide = false) {
  const value = firstQueryValue(query.view)
  if (Object.hasOwn(CALENDAR_VIEWS, value)) return value
  return Object.hasOwn(CALENDAR_VIEWS, preference) ? preference : wide ? 'timeline' : 'agenda'
}

export function calendarAnchorDate(query, today) {
  const value = firstQueryValue(query.date)
  return isCalendarDate(value) ? value : today
}

export function calendarViewQuery(query, patch, today) {
  const result = { ...query }
  if (Object.hasOwn(patch, 'view')) {
    if (Object.hasOwn(CALENDAR_VIEWS, patch.view)) result.view = patch.view
    else delete result.view
  }
  if (Object.hasOwn(patch, 'date')) {
    if (isCalendarDate(patch.date) && patch.date !== today) result.date = patch.date
    else delete result.date
  }
  return result
}

export function calendarDayDistance(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)
}

export function calendarDates(range) {
  return Array.from({ length: calendarDayDistance(range.from, range.to) + 1 }, (_, index) => addCalendarDays(range.from, index))
}

export function shiftCalendarMonth(date, offset) {
  const value = new Date(date + 'T00:00:00Z')
  const day = value.getUTCDate()
  value.setUTCDate(1)
  value.setUTCMonth(value.getUTCMonth() + offset)
  const last = new Date(value)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  value.setUTCDate(Math.min(day, last.getUTCDate()))
  return value.toISOString().slice(0, 10)
}

export function monthGridRange(date) {
  const first = date.slice(0, 7) + '-01'
  const from = addCalendarDays(first, -((new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7))
  const last = addCalendarDays(shiftCalendarMonth(first, 1), -1)
  const count = Math.max(35, Math.ceil((calendarDayDistance(from, last) + 1) / 7) * 7)
  return { from, to: addCalendarDays(from, count - 1) }
}

export function timelineRange(date) { return { from: addCalendarDays(date, -7), to: addCalendarDays(date, 27) } }

export function calendarRequestRange(view, date, today) {
  if (view === 'month') return monthGridRange(date)
  if (view === 'timeline') return timelineRange(date)
  return { from: today, to: addCalendarDays(today, 90) }
}

export function timelineItemPosition(item, range) {
  if (item.end_date < range.from || item.start_date > range.to) return null
  const start = item.start_date < range.from ? range.from : item.start_date
  const end = item.end_date > range.to ? range.to : item.end_date
  return {
    column: calendarDayDistance(range.from, start) + 1,
    span: calendarDayDistance(start, end) + 1,
    clippedStart: item.start_date < range.from,
    clippedEnd: item.end_date > range.to,
  }
}

export function calendarItemsOnDay(items, date) {
  const seen = new Set()
  return items.filter(item => {
    if (seen.has(item.id) || item.start_date > date || item.end_date < date) return false
    seen.add(item.id)
    return true
  }).sort((a, b) => Number(b.end_date === date) - Number(a.end_date === date) || a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id))
}

export function monthCalendarDays(items, date) {
  return calendarDates(monthGridRange(date)).map(day => ({ date: day, inMonth: day.slice(0, 7) === date.slice(0, 7), items: calendarItemsOnDay(items, day) }))
}

export function calendarDateLabel(date, options = { month: 'long', day: 'numeric', weekday: 'short' }) {
  return new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'))
}

function validCalendarInstant(value) {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null
}
export function calendarEnded(item, today, now = Date.now()) {
  return item.end_at ? Date.parse(item.end_at) <= now : item.end_date < today
}
export function calendarDeadline(item, today, now = Date.now()) {
  if (item.end_at && Date.parse(item.end_at) <= now) return '已截止'
  if (item.start_at && Date.parse(item.start_at) > now) {
    const startDay = serverToday(new Date(item.start_at))
    return startDay === today ? '今天稍后开始' : `${calendarDayDistance(today, startDay)} 天后开始`
  }
  if (item.end_at && (item.start_at || item.start_date <= today)) {
    const minutes = Math.ceil((Date.parse(item.end_at) - now) / 60000)
    if (minutes < 1440) return minutes < 60 ? `还有 ${minutes} 分钟` : `还有 ${Math.ceil(minutes / 60)} 小时`
    return `还有 ${Math.ceil(minutes / 1440)} 天`
  }
  if (item.start_date > today) return `${calendarDayDistance(today, item.start_date)} 天后开始`
  if (item.end_date < today) return ''
  const days = calendarDayDistance(today, item.end_date)
  return days === 0 ? '今天结束' : days === 1 ? '明天结束' : `还有 ${days} 天`
}

export function calendarRangeLabel(item) {
  const start = item.start_date + (item.start_time ? ' ' + item.start_time : '')
  const end = item.end_date + (item.end_time ? ' ' + item.end_time : '')
  return `${start} — ${end}`
}

export function calendarForm(entry = null) {
  const item = entry?.item || {}
  return { id: item.id || '', version: entry?.version ?? null, game: item.game || CALENDAR_GAMES[0], title: item.title || '', category: item.category || 'ACTIVITY', start_date: item.start_date || '', end_date: item.end_date || '', precise: !!(item.start_time || item.end_time), start_time: item.start_time || '', end_time: item.end_time || '', time_zone: item.time_zone || SERVER_TIME_ZONE, description: item.description || '', source_url: item.source_url || '', source_note: entry?.source_note || '', enabled: entry?.enabled !== false }
}

export function validateCalendarForm(form) {
  const errors = {}
  if (!CALENDAR_GAMES.includes(form.game)) errors.game = '请选择游戏。'
  if (!form.title.trim() || form.title.trim().length > 120) errors.title = '请填写 1–120 字的标题。'
  if (!Object.hasOwn(MANUAL_CATEGORIES, form.category)) errors.category = '请选择手工活动类型；招募在卡池管理维护。'
  for (const key of ['start_date', 'end_date']) if (!isCalendarDate(form[key])) errors[key] = '请填写有效日期。'
  if (!errors.start_date && !errors.end_date && form.end_date < form.start_date) errors.end_date = '结束日期不能早于开始日期。'
  if (form.precise) {
    for (const key of ['start_time', 'end_time']) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form[key])) errors[key] = '请成对填写开始和结束时间。'
    if (!errors.start_time && !errors.end_time && form.start_date === form.end_date && form.end_time < form.start_time) errors.end_time = '同日结束时间不能早于开始时间。'
  }
  for (const key of ['description', 'source_note']) if (form[key].length > 1000) errors[key] = '最多填写 1000 字。'
  const sourceUrl = safeCalendarUrl(form.source_url)
  if (form.source_url && (form.source_url.length > 2048 || !sourceUrl || sourceUrl.length > 2048)) errors.source_url = '请填写完整的 http/https 来源链接，最多 2048 字。'
  if (form.id && (!Number.isInteger(form.version) || form.version < 0)) errors.version = '版本信息缺失，请返回列表刷新后重试。'
  return errors
}

export function calendarPayload(form) {
  const body = { game: form.game, title: form.title.trim(), category: form.category, start_date: form.start_date, end_date: form.end_date, start_time: form.precise ? form.start_time : null, end_time: form.precise ? form.end_time : null, time_zone: form.time_zone, description: form.description.trim() || null, source_url: safeCalendarUrl(form.source_url) || null, source_note: form.source_note.trim() || null, enabled: form.enabled }
  if (form.id) body.expected_version = form.version
  return body
}
