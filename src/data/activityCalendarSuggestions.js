import { CALENDAR_GAMES, calendarForm, calendarPayload, safeCalendarUrl, validateCalendarForm } from './activityCalendar.js'

export const SUGGESTION_STATUSES = Object.freeze({ PENDING: '等待审核', ACCEPTED: '已采纳', REJECTED: '未采纳' })
export const SUGGESTION_FIELD_LABELS = Object.freeze({ game: '游戏', title: '活动名称', category: '类型', start_date: '开始日期', end_date: '结束日期', start_time: '开始时间', end_time: '结束时间', description: '简短说明', source_url: '来源链接', source_note: '来源备注', submission_note: '给审核员的补充说明', review_note: '审核说明' })

export function suggestionForm(game = '') {
  return { ...calendarForm(), game: CALENDAR_GAMES.includes(game) ? game : '', submission_note: '' }
}
export function validateSuggestionForm(form) {
  const errors = validateCalendarForm(form)
  if (!safeCalendarUrl(form.source_url)) errors.source_url = '请填写可核对的 http/https 来源链接。'
  if (form.submission_note.length > 1000) errors.submission_note = '最多填写 1000 字。'
  return errors
}
export function suggestionPayload(form, requestId) {
  const { game, title, category, start_date, end_date, start_time, end_time, description, source_url } = calendarPayload(form)
  return { game, title, category, start_date, end_date, start_time, end_time, description, source_url, submission_note: form.submission_note.trim() || null, client_request_id: requestId }
}
export function suggestionEventLink(item) {
  return { path: '/calendar', query: { game: item.game, date: item.start_date, view: 'month' } }
}
export function suggestionTimestamp(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(date) + '（服务器时间）' : '暂无记录'
}
