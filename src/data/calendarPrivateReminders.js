import { addCalendarDays, isCalendarDate } from './activityCalendar.js'

const memory = new Map()
export const reminderStorageKey = (userId, accountId) => 'yuanhub.calendar-reminders.v2:' + JSON.stringify([userId, accountId])

export function privateItemReminder(item, today) {
  if (!['START', 'END'].includes(item.reminder_on) || ![0, 1].includes(item.reminder_days_before)) return null
  const date = item.reminder_on === 'END' ? item.end_date : item.start_date
  if (!isCalendarDate(date) || !isCalendarDate(today)) return null
  const advance = item.reminder_days_before === 1 && date === addCalendarDays(today, 1)
  if (date !== today && !advance) return null
  return {
    item, date, key: JSON.stringify([item.id, item.reminder_on, date, item.reminder_days_before]),
    label: `${advance ? '明天' : '今天'}${item.reminder_on === 'END' ? '截止' : '开始'}`,
  }
}

export function readReminderDismissals(key, day, storageName = 'localStorage') {
  const memoryKey = JSON.stringify([storageName, key])
  const fallback = memory.get(memoryKey)
  const keys = new Set(fallback?.day === day ? fallback.keys : [])
  try {
    const stored = JSON.parse(globalThis[storageName].getItem(key))
    if (stored?.day === day && Array.isArray(stored.keys)) {
      for (const value of stored.keys) if (typeof value === 'string') keys.add(value)
    }
  } catch (_) { /* Storage unavailable: keep this session's dismissal. */ }
  memory.set(memoryKey, { day, keys: [...keys] })
  return [...keys]
}

export function dismissPrivateReminders(key, day, reminders, storageName = 'localStorage') {
  const keys = [...new Set([...readReminderDismissals(key, day, storageName), ...reminders.map(value => value.key)])]
  const state = { day, keys }
  memory.set(JSON.stringify([storageName, key]), state)
  try { globalThis[storageName].setItem(key, JSON.stringify(state)) } catch (_) { /* Memory remains authoritative for this session. */ }
  return keys
}
