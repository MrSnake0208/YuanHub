import { CALENDAR_GAMES, isCalendarDate, serverToday, SERVER_TIME_ZONE } from './activityCalendar.js'

export const CALENDAR_PRIVATE_ITEMS = Symbol('calendarPrivateItems')
export const CALENDAR_PRIVATE_ITEMS_UPDATED = 'yuanHub:calendar-private-items-updated'
export const isPrivateCalendarItem = item => item?.source_type === 'PRIVATE_ITEM'

export function privateCalendarItem(value, account) {
  const range = value && (Object.hasOwn(value, 'start_date') || Object.hasOwn(value, 'end_date'))
  const start = range ? value.start_date : value?.date, end = range ? value.end_date : value?.date
  const seriesId = value?.series_id || value?.id
  const monthly = value?.recurrence === 'MONTHLY'
  const occurrence = value?.occurrence_date
  if (!value || !account || value.account_id !== account.id || value.game !== account.game || !CALENDAR_GAMES.includes(value.game) ||
    typeof seriesId !== 'string' || !/^pci_[0-9a-f-]{36}$/.test(seriesId) || typeof value.title !== 'string' || !value.title.trim() || value.title.trim().length > 100 ||
    !isCalendarDate(start) || !isCalendarDate(end) || end < start || !Number.isSafeInteger(value.version) || value.version < 0 || typeof value.note !== 'string' || value.note.length > 1000 ||
    (value.time != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) ||
    (value.recurrence !== undefined && !['NONE', 'MONTHLY'].includes(value.recurrence)) ||
    (monthly && (!isCalendarDate(value.series_start_date) || !isCalendarDate(value.series_end_date) || value.series_end_date < value.series_start_date ||
      (occurrence != null && (!isCalendarDate(occurrence) || occurrence !== start || start < value.series_start_date)))) ||
    (value.reminder_on != null && !['START', 'END'].includes(value.reminder_on)) ||
    (value.reminder_days_before !== undefined && ![0, 1].includes(value.reminder_days_before))) return null
  return {
    ...value, id: monthly && occurrence ? `${seriesId}@${occurrence}` : seriesId, series_id: seriesId, recurrence: value.recurrence || 'NONE', source_type: 'PRIVATE_ITEM', category: 'PRIVATE_ITEM', title: value.title.trim(),
    start_date: start, end_date: end, start_time: value.time || null, end_time: null,
    start_at: null, end_at: null, time_zone: SERVER_TIME_ZONE, description: value.note,
    reminder_on: value.reminder_on ?? null, reminder_days_before: value.reminder_days_before ?? 0,
  }
}

export function privateItemForm(record, date) {
  const start = record?.series_start_date || record?.start_date || record?.date || date || serverToday()
  return {
    title: record?.title || '', start_date: start, end_date: record?.series_end_date || record?.end_date || record?.date || start, time: record?.time || '', note: record?.note || '',
    recurrence: record?.recurrence || 'NONE',
    reminder_on: record ? record.reminder_on || '' : 'START', reminder_days_before: record?.reminder_days_before ?? 0,
  }
}

export function validatePrivateItem(form) {
  const errors = {}
  if (form.recurrence !== undefined && !['NONE', 'MONTHLY'].includes(form.recurrence)) errors.recurrence = '请选择不重复或每月固定。'
  if (!form.title.trim() || form.title.trim().length > 100) errors.title = '内容须为1–100字。'
  for (const field of ['start_date', 'end_date']) if (!isCalendarDate(form[field])) errors[field] = '请选择有效日期。'
  if (!errors.start_date && !errors.end_date && form.end_date < form.start_date) errors.end_date = '结束日期不能早于开始日期。'
  if (form.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) errors.time = '请填写有效时间（HH:mm）。'
  if (form.note.length > 1000) errors.note = '说明最多1000字。'
  if (form.reminder_on != null && form.reminder_on !== '' && !['START', 'END'].includes(form.reminder_on)) errors.reminder_on = '请选择开始日、截止日或关闭提醒。'
  if (form.reminder_days_before !== undefined && ![0, 1].includes(form.reminder_days_before)) errors.reminder_days_before = '请选择当天或提前一天提醒。'
  return errors
}
