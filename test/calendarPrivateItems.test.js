import test from 'node:test'
import assert from 'node:assert/strict'
import { privateCalendarItem, privateItemForm, validatePrivateItem } from '../src/data/calendarPrivateItems.js'
import { calendarDeadline, calendarItemsOnDay, calendarRangeLabel, calendarStatuses, groupCalendarItems, normalizeCalendarItem, summarizeCalendarDay, timelineLanes } from '../src/data/activityCalendar.js'
import { calendarDisplay } from '../src/data/activityCalendarTypes.js'

const account = { id: 'a', game: '如鸢' }
const raw = (patch = {}) => ({ id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'a', game: '如鸢', title: '领取奖励', date: '2026-10-15', time: null, note: '私人说明', version: 0, ...patch })

test('private view models retain distinct source/category and single instant without fabricated end time', () => {
  const item = privateCalendarItem(raw({ time: '23:59' }), account)
  assert.equal(item.source_type, 'PRIVATE_ITEM')
  assert.equal(item.category, 'PRIVATE_ITEM')
  assert.equal(item.start_date, item.end_date)
  assert.equal(item.end_time, null)
  assert.equal(item.end_at, null)
  assert.equal(calendarRangeLabel(item), '2026-10-15 · 23:59（上海时间）')
  assert.equal(calendarRangeLabel(privateCalendarItem(raw(), account)), '2026-10-15 · 全天')
  assert.equal(calendarDeadline(item, '2026-10-15'), '')
  assert.deepEqual(calendarStatuses(item, '2026-10-15'), ['今天'])
  assert.equal(calendarDisplay(item).color, 'tea')
  assert.equal(normalizeCalendarItem(item), null)
  assert.deepEqual(summarizeCalendarDay([item], '2026-10-15'), { starts: 0, ends: 0, ongoing: 0, total: 0 })
})

test('foreign identity invalid dates and malformed server payloads never enter a private list', () => {
  for (const patch of [{ account_id: 'b' }, { game: '代号鸢' }, { id: 'evt_public' }, { date: '2026-02-30' }, { time: '24:00' }, { time: 1234 }, { title: ' ' }, { version: -1 }, { note: null }]) {
    assert.equal(privateCalendarItem(raw(patch), account), null)
  }
  assert.equal(privateCalendarItem(raw(), null), null)
})

test('form defaults prefill selected date and validate title note leap date and time boundaries', () => {
  assert.deepEqual(privateItemForm(null, '2026-10-15'), { title: '', date: '2026-10-15', time: '', note: '' })
  const form = { title: ' 文 ', date: '2028-02-29', time: '00:00', note: '文'.repeat(1000) }
  assert.deepEqual(validatePrivateItem(form), {})
  for (const patch of [{ title: ' ' }, { title: '文'.repeat(101) }, { date: '2026-02-29' }, { time: '24:00' }, { time: '9:00' }, { note: '文'.repeat(1001) }]) assert.ok(Object.keys(validatePrivateItem({ ...form, ...patch })).length)
  assert.deepEqual(validatePrivateItem({ ...form, title: '文'.repeat(100), time: '23:59' }), {})
})

test('three views count single date exactly once, sort private times and pack single day lanes', () => {
  const later = privateCalendarItem(raw({ id: 'pci_00000000-0000-0000-0000-000000000002', time: '23:59' }), account)
  const earlier = privateCalendarItem(raw({ time: '00:00' }), account)
  const allDay = privateCalendarItem(raw({ id: 'pci_00000000-0000-0000-0000-000000000003' }), account)
  const items = [later, earlier, allDay]
  assert.deepEqual(calendarItemsOnDay(items, '2026-10-15').map(item => item.time), [null, '00:00', '23:59'])
  assert.equal(calendarItemsOnDay(items, '2026-10-16').length, 0)
  assert.equal(groupCalendarItems(items, '2026-10-15')[0].groups[0].items.length, 3)
  const lanes = timelineLanes(items, { from: '2026-10-14', to: '2026-10-16' })
  assert.equal(lanes.length, 3)
  assert.ok(lanes.flat().every(entry => entry.position.span === 1 && entry.position.column === 2))
})
