import test from 'node:test'
import assert from 'node:assert/strict'
import { privateCalendarItem, privateItemForm, validatePrivateItem } from '../src/data/calendarPrivateItems.js'
import { calendarDeadline, calendarItemsOnDay, calendarRangeLabel, calendarStatuses, groupCalendarItems, normalizeCalendarItem, summarizeCalendarDay, timelineLanes, monthCalendarDays, serverToday } from '../src/data/activityCalendar.js'
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
  assert.equal(privateItemForm(null).start_date, serverToday())
  assert.equal(privateItemForm(null).end_date, serverToday())
  assert.deepEqual(privateItemForm(null, '2026-10-15'), { title: '', start_date: '2026-10-15', end_date: '2026-10-15', time: '', note: '', reminder_on: 'START', reminder_days_before: 0, recurrence: 'NONE' })
  const form = { title: ' 文 ', start_date: '2028-02-29', end_date: '2028-02-29', time: '00:00', note: '文'.repeat(1000) }
  assert.deepEqual(validatePrivateItem(form), {})
  for (const patch of [{ title: ' ' }, { title: '文'.repeat(101) }, { start_date: '2026-02-29' }, { end_date: '2026-02-29' }, { time: '24:00' }, { time: '9:00' }, { note: '文'.repeat(1001) }]) assert.ok(Object.keys(validatePrivateItem({ ...form, ...patch })).length)
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


test('closed private ranges cover month/year/leap boundaries, clip once and never enter public totals', () => {
  for (const [start, end, middle] of [
    ['2026-10-12', '2026-10-15', '2026-10-13'],
    ['2026-09-28', '2026-10-05', '2026-10-01'],
    ['2026-12-30', '2027-01-02', '2027-01-01'],
    ['2028-02-28', '2028-03-01', '2028-02-29'],
    ['2020-01-01', '2030-12-31', '2026-10-10'],
  ]) {
    const item = privateCalendarItem(raw({ start_date: start, end_date: end, time: '09:00' }), account)
    assert.ok(item)
    assert.deepEqual(privateItemForm(item), { title: item.title, start_date: start, end_date: end, time: '09:00', note: item.note, reminder_on: '', reminder_days_before: 0, recurrence: 'NONE' })
    assert.deepEqual(validatePrivateItem(privateItemForm(item)), {})
    for (const day of [start, middle, end]) assert.equal(calendarItemsOnDay([item, item], day).length, 1)
    assert.ok(monthCalendarDays([item], middle).find(day => day.date === middle).items.includes(item))
    const lanes = timelineLanes([item], { from: middle, to: middle })
    assert.equal(lanes.flat().length, 1)
    assert.deepEqual(lanes[0][0].position, { column: 1, span: 1, clippedStart: start < middle, clippedEnd: end > middle })
    assert.equal(groupCalendarItems([item], middle).flatMap(section => section.groups).flatMap(group => group.items).length, 1)
    assert.deepEqual(calendarStatuses(item, middle), ['日期范围内'])
    assert.equal(calendarDeadline(item, middle), '')
    assert.equal(summarizeCalendarDay([item], middle).total, 0)
    assert.equal(calendarRangeLabel(item), `${start} — ${end} · 开始日 09:00（上海时间）`)
  }
  const range = privateCalendarItem(raw({ start_date: '2026-10-12', end_date: '2026-10-15' }), account)
  assert.equal(timelineLanes([range], { from: '2026-10-10', to: '2026-10-20' })[0][0].position.span, 4)
  assert.equal(calendarItemsOnDay([range], '2026-10-16').length, 0)
  assert.deepEqual(calendarStatuses(range, '2026-10-16'), ['已过日期'])
})

test('partial or invalid new date ranges cannot fall back to the valid legacy date', () => {
  for (const patch of [
    { start_date: '2026-10-12' }, { end_date: '2026-10-15' },
    { start_date: '2026-10-15', end_date: '2026-10-12' },
    { start_date: '2026-02-30', end_date: '2026-03-01' },
    { start_date: '2026-02-28', end_date: '2026-02-29' },
    { start_date: null, end_date: null },
  ]) assert.equal(privateCalendarItem(raw(patch), account), null)
  assert.equal(validatePrivateItem({ ...privateItemForm(raw()), start_date: '2026-10-20' }).end_date, '结束日期不能早于开始日期。')
  assert.equal(privateCalendarItem({ ...raw(), date: undefined, start_date: '2026-10-12', end_date: '2026-10-15' }, account).start_date, '2026-10-12')
})

test('historical reminders stay off, new forms default today, and malformed settings fail closed', () => {
  assert.equal(privateCalendarItem(raw(), account).reminder_on, null)
  assert.equal(privateItemForm(raw()).reminder_on, '')
  const item = privateCalendarItem(raw({ reminder_on: 'END', reminder_days_before: 1 }), account)
  assert.equal(privateItemForm(item).reminder_on, 'END')
  assert.equal(privateItemForm(item).reminder_days_before, 1)
  for (const patch of [{ reminder_on: 'OTHER' }, { reminder_on: false }, { reminder_days_before: null }, { reminder_days_before: '1' }, { reminder_days_before: 2 }]) {
    assert.equal(privateCalendarItem(raw(patch), account), null)
  }
  const form = privateItemForm(null, '2026-10-15')
  assert.ok(validatePrivateItem({ ...form, title: '事项', reminder_on: 'OTHER' }).reminder_on)
  assert.ok(validatePrivateItem({ ...form, title: '事项', reminder_days_before: '1' }).reminder_days_before)
})

test('monthly instances keep unique view ids but edit the original series dates', () => {
  const series = { recurrence: 'MONTHLY', series_start_date: '2026-01-31', series_end_date: '2026-02-02', reminder_on: 'START', reminder_days_before: 1 }
  const jan = privateCalendarItem(raw({ ...series, start_date: '2026-01-31', end_date: '2026-02-02', occurrence_date: '2026-01-31' }), account)
  const feb = privateCalendarItem(raw({ ...series, start_date: '2026-02-28', end_date: '2026-03-02', occurrence_date: '2026-02-28' }), account)
  assert.notEqual(jan.id, feb.id)
  assert.equal(jan.series_id, feb.series_id)
  assert.deepEqual(privateCalendarItem(feb, account), feb)
  assert.equal(privateItemForm(feb).start_date, '2026-01-31')
  assert.equal(privateItemForm(feb).end_date, '2026-02-02')
  assert.equal(privateItemForm(feb).recurrence, 'MONTHLY')
  assert.equal(calendarItemsOnDay([jan, feb], '2026-03-01').length, 1)
  assert.equal(privateCalendarItem(raw({ recurrence: 'WEEKLY' }), account), null)
  assert.equal(privateCalendarItem(raw({ ...series, occurrence_date: '2026-10-01' }), account), null)
})
