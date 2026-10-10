import { CALENDAR_GAMES, isCalendarDate, serverToday, SERVER_TIME_ZONE } from './activityCalendar.js'

export const CALENDAR_PRIVATE_ITEMS = Symbol('calendarPrivateItems')
export const isPrivateCalendarItem = item => item?.source_type === 'PRIVATE_ITEM'

export function privateCalendarItem(value, account) {
  const range = value && (Object.hasOwn(value, 'start_date') || Object.hasOwn(value, 'end_date'))
  const start = range ? value.start_date : value?.date, end = range ? value.end_date : value?.date
  if (!value || !account || value.account_id !== account.id || value.game !== account.game || !CALENDAR_GAMES.includes(value.game) ||
    typeof value.id !== 'string' || !/^pci_[0-9a-f-]{36}$/.test(value.id) || typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 100 ||
    !isCalendarDate(start) || !isCalendarDate(end) || end < start || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.note !== 'string' || value.note.length > 1000 ||
    (value.time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) return null
  return {
    ...value, source_type: 'PRIVATE_ITEM', category: 'PRIVATE_ITEM', title: value.title.trim(),
    start_date: start, end_date: end, start_time: value.time || null, end_time: null,
    start_at: null, end_at: null, time_zone: SERVER_TIME_ZONE, description: value.note,
  }
}

export function privateItemForm(record, date) {
  const start = record?.start_date || record?.date || date || serverToday()
  return { title: record?.title || '', start_date: start, end_date: record?.end_date || record?.date || start, time: record?.time || '', note: record?.note || '' }
}

export function validatePrivateItem(form) {
  const errors = {}
  if (!form.title.trim() || form.title.trim().length > 100) errors.title = '内容须为1–100字。'
  for (const field of ['start_date', 'end_date']) if (!isCalendarDate(form[field])) errors[field] = '请选择有效日期。'
  if (!errors.start_date && !errors.end_date && form.end_date < form.start_date) errors.end_date = '结束日期不能早于开始日期。'
  if (form.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) errors.time = '请填写有效时间（HH:mm）。'
  if (form.note.length > 1000) errors.note = '说明最多1000字。'
  return errors
}
