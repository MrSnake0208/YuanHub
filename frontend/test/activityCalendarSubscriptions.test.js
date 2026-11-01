import test from 'node:test'
import assert from 'node:assert/strict'
import { progressDraft, subscriptionCompleted, subscriptionScope, subscriptionPending, subscriptionScopeQuery, subscriptionHasPending, subscriptionProgress, subscriptionTask, subscriptionMatchesTask } from '../src/data/activityCalendarSubscriptions.js'
import { calendarDeadline, calendarEnded, calendarStatuses, normalizeCalendarItem } from '../src/data/activityCalendar.js'

test('only explicit activity completion counts and checklist drafts are isolated copies', () => {
  assert.equal(subscriptionCompleted({ completed: false, checklist: [] }), false)
  assert.equal(subscriptionCompleted({ completed: true, checklist: [] }), false)
  const record = { subscribed: true, completed: true, checklist: [{ id: 'a', title: '第一关', completed: true }, { id: 'b', title: '第二关', completed: false }] }
  assert.equal(subscriptionCompleted(record), false)
  const draft = progressDraft(record)
  assert.deepEqual(Object.keys(draft), ['checklist'])
  draft.checklist[1].completed = true
  assert.equal(subscriptionCompleted(draft), false)
  assert.equal(subscriptionHasPending(record), true)
  assert.equal(subscriptionCompleted({ ...record, manual_completed: true }), true)
  assert.equal(subscriptionHasPending({ ...record, manual_completed: true }), false)
  assert.equal(subscriptionHasPending({ ...record, subscribed: false }), false)
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

test('explicit manual evidence is preserved without guessing from checklist or legacy fields', () => {
  for (const manual of [true, false, null, undefined]) {
    for (const checklist of [[], [{ id: 'stable', title: '旧待办', completed: true }], [{ id: 'stable', title: '旧待办', completed: false }]]) {
      const record = { subscribed: true, completed: true, checklist, manual_completed: manual, memo_title: '旧标题', memo_note: '保留\n备注' }
      const draft = progressDraft(record)
      assert.deepEqual(draft, { checklist })
      assert.equal(subscriptionCompleted(record), manual === true)
      assert.equal(subscriptionHasPending(record), manual !== true)
      assert.equal(record.memo_note, '保留\n备注')
      assert.equal(record.manual_completed, manual)
    }
  }
})
test('task links keep personal and time dimensions independent and accept old pending links', () => {
  assert.equal(subscriptionTask({}), 'todo')
  assert.equal(subscriptionTask({ pending: '1' }), 'todo')
  assert.equal(subscriptionTask({ pending: '0' }), 'all')
  assert.equal(subscriptionTask({ task: ['completed', 'todo'], status: 'ongoing' }), 'completed')
  assert.equal(subscriptionTask({ task: 'invalid' }), 'todo')
  const record = { subscribed: true, checklist: [] }
  assert.equal(subscriptionMatchesTask(record, 'todo'), true)
  assert.equal(subscriptionMatchesTask({ ...record, manual_completed: true }, 'completed'), true)
  assert.equal(subscriptionMatchesTask({ ...record, subscribed: false }, 'all'), false)
  assert.deepEqual(subscriptionScopeQuery({ scope: 'mine', pending: '0', status: 'ongoing' }, false), { task: 'all', status: 'ongoing' })
})
test('progress uses empty, partial and completed labels without overall state', () => {
  assert.equal(subscriptionProgress({ checklist: [] }), '暂无待办')
  const checklist = [true, false, false].map((completed, i) => ({ id: String(i), title: '项', completed }))
  assert.equal(subscriptionProgress({ checklist }), '待办事项 · 已完成 1/3 项')
  assert.equal(subscriptionProgress({ checklist: checklist.map(entry => ({ ...entry, completed: true })) }), '待办全部完成')
})
