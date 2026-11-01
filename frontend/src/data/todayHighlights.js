import { addCalendarDays, CALENDAR_ENDING_WINDOW_MS, calendarDateLabel, calendarTimeBounds, SERVER_TIME_ZONE, serverToday } from './activityCalendar.js'
import { subscriptionCompleted } from './activityCalendarSubscriptions.js'
import { privateItemReminder } from './calendarPrivateReminders.js'

export function aggregateTodayHighlights({ subscriptions = [], privateItems = [], now = Date.now(), game = '' } = {}) {
  const today = serverToday(new Date(now)), tomorrow = addCalendarDays(today, 1)
  const entries = new Map()
  for (const record of subscriptions) {
    if (record.subscribed !== true || !record.item) continue
    const deadline = calendarTimeBounds(record.item).end
    const pending = new Set((record.checklist || []).filter(entry => !entry.completed).map(entry => entry.id)).size
    if (!Number.isFinite(deadline) || deadline <= now || deadline - now > CALENDAR_ENDING_WINDOW_MS || subscriptionCompleted(record) && !pending) continue
    const date = record.item.end_at ? serverToday(new Date(record.item.end_at)) : record.item.end_date
    const id = 'activity:' + record.event_id
    entries.set(id, {
      id, kind: 'activity', title: record.item.title, date, at: record.item.end_at || date,
      label: `${dayLabel(date, today)}截止`, pending, today: date === today, sortAt: deadline,
      to: { path: '/calendar', query: { scope: 'mine', task: subscriptionCompleted(record) ? 'all' : 'todo', game, view: 'month', date, event: record.event_id } }
    })
  }
  for (const item of privateItems) {
    const current = privateItemReminder(item, today)
    const reminder = current || privateItemReminder(item, tomorrow)
    if (!reminder) continue
    const attentionDate = current ? today : tomorrow
    const id = 'private:' + reminder.key
    entries.set(id, {
      id, kind: 'private', title: item.title, date: reminder.date, at: reminder.date,
      label: `${current ? '今天' : '明天'}提醒 · ${dayLabel(reminder.date, today)}${item.reminder_on === 'END' ? '截止' : '开始'}`,
      pending: 0, today: !!current, sortAt: Date.parse(attentionDate + 'T00:00:00+08:00'),
      to: { path: '/calendar', query: { scope: 'mine', task: 'todo', game, view: 'month', date: reminder.date, event: item.id } }
    })
  }
  return [...entries.values()].sort((a, b) => Number(b.today) - Number(a.today) || a.sortAt - b.sortAt || a.id.localeCompare(b.id, 'en'))
}

function dayLabel(date, today) {
  return date === today ? '今天' : date === addCalendarDays(today, 1) ? '明天' : calendarDateLabel(date, { month: 'long', day: 'numeric' })
}

export function highlightDateLabel(entry) {
  const date = calendarDateLabel(entry.date, { month: 'long', day: 'numeric' })
  if (entry.kind !== 'activity' || entry.at === entry.date) return date
  return date + ' ' + new Intl.DateTimeFormat('zh-CN', { timeZone: SERVER_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(entry.at))
}
