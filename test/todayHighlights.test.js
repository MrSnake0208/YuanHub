import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateTodayHighlights, highlightDateLabel } from '../src/data/todayHighlights.js'

const now = Date.parse('2026-10-16T04:00:00Z')
const activity = (id = 'event', patch = {}, item = {}) => ({ event_id: id, subscribed: true, manual_completed: false,
  checklist: [], item: { title: id, start_date: '2026-10-01', end_date: '2026-10-16', ...item }, ...patch })
const privateItem = (patch = {}) => ({ id: 'private', title: '私人事项', start_date: '2026-10-16', end_date: '2026-10-18', reminder_on: 'START', reminder_days_before: 0, ...patch })
const aggregate = (subscriptions = [], privateItems = [], time = now) => aggregateTodayHighlights({ subscriptions, privateItems, now: time, game: '如鸢' })

test('merge an activity with three real pending Checklist entries into one; do not manufacture Checklist', () => {
  const checklist = [1, 2, 3].map(id => ({ id: String(id), completed: false }))
  const record = activity('event', { checklist })
  const result = aggregate([record, record, activity('empty')])
  assert.equal(result.length, 2)
  assert.equal(result.find(entry => entry.title === 'event').pending, 3)
  assert.equal(result.find(entry => entry.title === 'empty').pending, 0)
  assert.equal(result[0].to.query.game, '如鸢')
})

test('Checklist and manual period completion remain independent', () => {
  const allChecked = activity('checked', { checklist: [{ id: 'one', completed: true }] })
  const manualWithPending = activity('manual', { manual_completed: true, checklist: [{ id: 'one', completed: false }] })
  const manualNoPending = activity('done', { manual_completed: true, checklist: [{ id: 'one', completed: true }] })
  const result = aggregate([allChecked, manualWithPending, manualNoPending])
  assert.deepEqual(result.map(entry => entry.title), ['checked', 'manual'])
  assert.equal(result[0].pending, 0)
  assert.equal(result[1].pending, 1)
  assert.equal(result[1].to.query.task, 'all')
})

test('only subscribed, available, not-ended deadlines inside 72 hours enter the summary', () => {
  const exact = new Date(now + 72 * 3600000).toISOString()
  const result = aggregate([
    activity('edge', {}, { end_at: exact }),
    activity('outside', {}, { end_at: new Date(now + 72 * 3600000 + 1).toISOString() }),
    activity('ended', {}, { end_at: new Date(now).toISOString() }),
    activity('public', { subscribed: false }), activity('unavailable', { item: null }),
    activity('long', {}, { end_date: null }), activity('far', { checklist: [{ id: 'one', completed: false }] }, { end_date: '2026-11-01' })
  ])
  assert.deepEqual(result.map(entry => entry.title), ['edge'])
})

test('date-only end includes the whole Beijing day, exact end is exclusive, display converts offsets', () => {
  const records = [activity('date'), activity('exact', {}, { end_at: '2026-10-16T23:30:00-07:00' })]
  const before = Date.parse('2026-10-16T15:59:59.999Z')
  assert.equal(aggregate(records, [], before).length, 2)
  assert.deepEqual(aggregate(records, [], before + 1).map(entry => entry.title), ['exact'])
  const entry = aggregate(records)[1]
  assert.equal(entry.date, '2026-10-17')
  assert.equal(highlightDateLabel(entry), '10月17日 14:30')
  assert.equal(highlightDateLabel(aggregate(records)[0]), '10月16日')
  assert.equal(aggregate(records, [], Date.parse('2026-10-17T06:30:00Z')).length, 0)
})

for (const [name, patch, label] of [
  ['off', { reminder_on: null }, null],
  ['today start', {}, '今天提醒 · 今天开始'],
  ['tomorrow same day', { start_date: '2026-10-17' }, '明天提醒 · 明天开始'],
  ['today advance', { start_date: '2026-10-17', reminder_days_before: 1 }, '今天提醒 · 明天开始'],
  ['tomorrow advance', { start_date: '2026-10-18', reminder_days_before: 1 }, '明天提醒 · 10月18日开始'],
  ['today end', { reminder_on: 'END', end_date: '2026-10-16' }, '今天提醒 · 今天截止'],
  ['advance end', { reminder_on: 'END', end_date: '2026-10-17', reminder_days_before: 1 }, '今天提醒 · 明天截止'],
  ['future', { start_date: '2026-10-19', reminder_days_before: 1 }, null],
  ['past', { start_date: '2026-10-15' }, null],
]) test('private eligibility: ' + name, () => {
  const result = aggregate([], [privateItem(patch)])
  assert.equal(result.length, label ? 1 : 0)
  if (label) assert.equal(result[0].label, label)
})

test('private dedup uses item ID and reminder arrangement; one advance arrangement does not appear twice', () => {
  const item = privateItem({ reminder_days_before: 1, start_date: '2026-10-17' })
  const result = aggregate([], [item, { ...item, title: '改名', version: 2 }])
  assert.equal(result.length, 1)
  assert.equal(result[0].today, true)
  assert.equal(result[0].title, '改名')
  assert.equal(aggregate([], [item, { ...item, id: 'another' }]).length, 2)
  assert.notEqual(result[0].id, aggregate([], [{ ...item, reminder_on: 'END' }])[0].id)
})

test('sort today first, then real date/time and stable ID; do not cap the aggregate at three', () => {
  const subscriptions = [activity('z'), activity('a'), activity('later', {}, { end_date: '2026-10-18' })]
  const privateItems = [privateItem({ id: 'tomorrow', start_date: '2026-10-17' }), privateItem({ id: 'today' })]
  const result = aggregate(subscriptions, privateItems)
  assert.deepEqual(result.map(entry => entry.title === '私人事项' ? entry.to.query.event : entry.title), ['today', 'a', 'z', 'tomorrow', 'later'])
  assert.deepEqual(aggregate([...subscriptions].reverse(), [...privateItems].reverse()), result)
})

test('Beijing cross-day updates activity and reminder eligibility without relying on host timezone', () => {
  const item = privateItem({ reminder_days_before: 1, start_date: '2026-10-18' })
  const before = aggregate([activity()], [item], Date.parse('2026-10-16T15:59:59Z'))
  assert.equal(before.find(entry => entry.kind === 'private').today, false)
  const after = aggregate([activity()], [item], Date.parse('2026-10-16T16:00:00Z'))
  assert.equal(after.length, 1)
  assert.equal(after[0].label, '今天提醒 · 明天开始')
})

test('next-month private occurrence enters highlights on the previous month last day', () => {
  const item = { id: 'series@2026-11-01', title: '月度事项', start_date: '2026-11-01', end_date: '2026-11-01', reminder_on: 'START', reminder_days_before: 1 }
  const result = aggregateTodayHighlights({ privateItems: [item], now: Date.parse('2026-10-31T12:00:00+08:00'), game: '如鸢' })
  assert.equal(result.length, 1)
  assert.equal(result[0].today, true)
  assert.equal(result[0].date, '2026-11-01')
  assert.equal(result[0].to.query.event, item.id)
})
