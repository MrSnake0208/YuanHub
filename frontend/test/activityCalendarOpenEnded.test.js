import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDeadline, calendarEnded, calendarForm, calendarItemsOnDay, calendarPayload, calendarRangeLabel, calendarStatuses, calendarTimeBounds, filterCalendarItems, groupCalendarItems, monthCalendarDays, nextCalendarBoundary, normalizeCalendarItem, summarizeCalendarDay, timelineItemPosition, validateCalendarForm } from '../src/data/activityCalendar.js'

const ongoing = (patch = {}) => ({ id: 'ongoing', source_type: 'MANUAL', game: '如鸢', title: '持续活动', category: 'ACTIVITY', start_date: '2026-10-01', end_date: null, ...patch })

test('开放结束日期规范化保留开始时刻，不伪造截止时间或丢掉活动', () => {
  const item = normalizeCalendarItem(ongoing({ start_time: '05:00', start_at: '2026-09-30T21:00:00Z' }))
  assert.equal(item.end_date, null)
  assert.equal(item.start_time, '05:00')
  assert.equal(item.end_time, null)
  assert.equal(item.end_at, null)
  assert.equal(normalizeCalendarItem(ongoing({ end_date: undefined })).end_date, null)
  assert.equal(normalizeCalendarItem(ongoing({ end_date: '' })), null)
  assert.equal(normalizeCalendarItem(ongoing({ end_date: '2026-09-30' })), null)
})

test('持续活动可跨月显示并计入今日，但不进入即将截止筛选或倒计时', () => {
  const item = normalizeCalendarItem(ongoing())
  const today = '2027-01-01', now = Date.parse('2027-01-01T04:00:00Z')
  assert.equal(calendarEnded(item, today, now), false)
  assert.deepEqual(calendarStatuses(item, today, now), ['进行中'])
  assert.deepEqual(summarizeCalendarDay([item], today), { starts: 0, ends: 0, ongoing: 1, total: 1 })
  assert.equal(groupCalendarItems([item], today)[0].groups[0].items[0].id, item.id)
  assert.equal(calendarTimeBounds(item).end, Infinity)
  assert.equal(filterCalendarItems([item], { status: 'ongoing' }, now).length, 1)
  assert.deepEqual(filterCalendarItems([item], { status: 'ending' }, now), [])
  assert.equal(nextCalendarBoundary([item], now), Infinity)
  assert.equal(calendarDeadline(item, today, now), '持续进行')
  assert.equal(calendarRangeLabel(item), '2026-10-01 — 持续进行')
  assert.deepEqual(calendarStatuses(item, '2026-09-30', Date.parse('2026-09-30T04:00:00Z')), ['即将开始'])
})

test('月历与时间线只填充当前可见范围，开放结束不产生无限日期', () => {
  const item = ongoing()
  const range = { from: '2027-01-01', to: '2027-01-07' }
  assert.deepEqual(timelineItemPosition(item, range), { column: 1, span: 7, clippedStart: true, clippedEnd: true })
  assert.equal(timelineItemPosition(ongoing({ start_date: '2027-01-08' }), range), null)
  assert.deepEqual(calendarItemsOnDay([item], '2026-09-30'), [])
  assert.equal(calendarItemsOnDay([item], '2028-02-29').length, 1)
  const days = monthCalendarDays([item], '2027-01-01')
  assert.ok(days.length <= 42)
  assert.ok(days.every(day => day.items.length === 1))
})

test('表单允许留空结束日期与单独开始时刻，补结束日期后恢复成对时间校验', () => {
  const form = calendarForm({ item: ongoing(), version: 0, enabled: true })
  assert.deepEqual(validateCalendarForm(form), {})
  assert.equal(calendarPayload(form).end_date, null)
  const precise = { ...form, precise: true, start_time: '05:00', end_time: '旧值' }
  assert.deepEqual(validateCalendarForm(precise), {})
  assert.equal(calendarPayload(precise).start_time, '05:00')
  assert.equal(calendarPayload(precise).end_time, null)
  assert.ok(validateCalendarForm({ ...precise, end_date: '2027-01-01', end_time: '' }).end_time)
  assert.deepEqual(validateCalendarForm({ ...precise, end_date: '2027-01-01', end_time: '04:59' }), {})
  assert.ok(validateCalendarForm({ ...form, start_date: '' }).start_date)
})
