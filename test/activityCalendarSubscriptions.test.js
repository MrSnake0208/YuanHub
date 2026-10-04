import test from 'node:test'
import assert from 'node:assert/strict'
import { progressDraft, subscriptionCompleted, subscriptionScope, subscriptionPending, subscriptionScopeQuery } from '../src/data/activityCalendarSubscriptions.js'
import { calendarDeadline, calendarEnded, calendarStatuses, normalizeCalendarItem } from '../src/data/activityCalendar.js'

test('whole activity and nonempty checklist completion remain distinct and drafts are copies', () => {
  assert.equal(subscriptionCompleted({ completed: false, checklist: [] }), false)
  assert.equal(subscriptionCompleted({ completed: true, checklist: [] }), true)
  const record = { completed: true, checklist: [{ id: 'a', title: '第一关', completed: true }, { id: 'b', title: '第二关', completed: false }] }
  assert.equal(subscriptionCompleted(record), false)
  const draft = progressDraft(record)
  assert.equal(draft.completed, false)
  draft.checklist[1].completed = true
  assert.equal(subscriptionCompleted(draft), true)
  assert.equal(record.checklist[1].completed, false)
})
test('scope links preserve calendar context without encoding private account', () => {
  const query = { view: 'month', date: '2026-10-05', game: '如鸢', ref: 'link', pending: '1' }
  assert.deepEqual(subscriptionScopeQuery(query, true), { ...query, scope: 'mine' })
  assert.deepEqual(subscriptionScopeQuery({ ...query, scope: 'mine' }, false), { view: 'month', date: '2026-10-05', game: '如鸢', ref: 'link' })
  assert.equal(subscriptionScope({ scope: ['mine', 'all'] }), true)
  assert.equal(subscriptionPending({ pending: ['1', '0'] }), true)
})
test('exact deadline closes at the instant while date-only never fabricates hours', () => {
  const item = { start_date: '2026-10-05', end_date: '2026-10-05', start_at: '2026-10-05T02:00:00Z', end_at: '2026-10-05T04:00:00Z' }
  const cutoff = Date.parse(item.end_at)
  assert.equal(calendarEnded(item, '2026-10-05', cutoff - 1), false)
  assert.equal(calendarDeadline(item, '2026-10-05', cutoff - 60000), '还有 1 分钟')
  assert.equal(calendarEnded(item, '2026-10-05', cutoff), true)
  assert.equal(calendarDeadline(item, '2026-10-05', cutoff), '已截止')
  assert.deepEqual(calendarStatuses(item, '2026-10-05', cutoff), ['已结束'])
  const dateOnly = { start_date: '2026-10-01', end_date: '2026-10-05' }
  assert.equal(calendarDeadline(dateOnly, '2026-10-05', cutoff), '今天结束')
  assert.equal(calendarEnded(dateOnly, '2026-10-06', cutoff), true)
})
test('only valid timezone-bearing instants survive public normalization', () => {
  const value = { id: 'evt', game: '如鸢', title: '活动', category: 'ACTIVITY', start_date: '2026-10-05', end_date: '2026-10-06', start_at: '2026-10-05T00:00:00+08:00', end_at: 'not-a-date' }
  assert.equal(normalizeCalendarItem(value).start_at, value.start_at)
  assert.equal(normalizeCalendarItem(value).end_at, null)
})
test('precise instants override source dates across timezones', () => {
  const now = Date.parse('2026-10-05T03:00:00Z')
  const item = { start_date: '2026-10-04', end_date: '2026-10-04', start_at: '2026-10-04T18:00:00-07:00', end_at: '2026-10-04T21:00:00-07:00' }
  assert.deepEqual(calendarStatuses(item, '2026-10-05', now), ['进行中'])
  assert.equal(calendarDeadline(item, '2026-10-05', now), '还有 1 小时')
  const future = { ...item, start_at: '2026-10-04T20:30:00-07:00' }
  assert.deepEqual(calendarStatuses(future, '2026-10-05', now), ['即将开始'])
  assert.equal(calendarDeadline(future, '2026-10-05', now), '今天稍后开始')
})
