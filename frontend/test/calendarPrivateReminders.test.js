import test from 'node:test'
import assert from 'node:assert/strict'
import { privateItemReminder, reminderStorageKey, readReminderDismissals, dismissPrivateReminders } from '../src/data/calendarPrivateReminders.js'

const item = patch => ({ id: 'private-1', start_date: '2026-10-15', end_date: '2026-10-20', reminder_on: 'START', reminder_days_before: 0, time: '23:59', ...patch })

test('reminders use exact Shanghai calendar days and ignore optional start time', () => {
  assert.equal(privateItemReminder(item(), '2026-10-14'), null)
  assert.equal(privateItemReminder(item(), '2026-10-15').label, '今天开始')
  assert.equal(privateItemReminder(item(), '2026-10-16'), null)
  const end = item({ reminder_on: 'END', reminder_days_before: 1 })
  assert.equal(privateItemReminder(end, '2026-10-19').label, '明天截止')
  assert.equal(privateItemReminder(end, '2026-10-20').label, '今天截止')
  assert.equal(privateItemReminder(end, '2026-10-15'), null)
  assert.equal(privateItemReminder(item({ reminder_on: null }), '2026-10-15'), null)
  assert.equal(privateItemReminder(item({ reminder_on: 'OTHER' }), '2026-10-15'), null)
  assert.equal(privateItemReminder(item({ reminder_days_before: 2 }), '2026-10-15'), null)
  assert.equal(privateItemReminder(item({ start_date: '2026-02-30' }), '2026-02-28'), null)
  for (const [target, previous] of [['2027-01-01', '2026-12-31'], ['2028-03-01', '2028-02-29']]) {
    assert.equal(privateItemReminder(item({ start_date: target, reminder_days_before: 1 }), previous).label, '明天开始')
  }
})

test('dismissals isolate users/accounts, merge tabs, roll over days and preserve fallback on write failure', () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }
  try {
    const key = reminderStorageKey('owner', 'account-a'), day = '2026-10-15'
    const reminder = privateItemReminder(item({ start_date: '2026-10-16', reminder_days_before: 1 }), day)
    assert.deepEqual(dismissPrivateReminders(key, day, [reminder, reminder]), [reminder.key])
    assert.deepEqual(readReminderDismissals(key, day), [reminder.key])
    assert.deepEqual(readReminderDismissals(reminderStorageKey('other', 'account-a'), day), [])
    assert.deepEqual(readReminderDismissals(reminderStorageKey('owner', 'account-b'), day), [])
    const titleChange = privateItemReminder(item({ start_date: '2026-10-16', reminder_days_before: 1, title: 'new', version: 9 }), day)
    assert.equal(titleChange.key, reminder.key)
    assert.notEqual(privateItemReminder(item({ start_date: '2026-10-15' }), day).key, reminder.key)
    values.set(key, JSON.stringify({ day, keys: ['another-tab'] }))
    assert.deepEqual(new Set(readReminderDismissals(key, day)), new Set([reminder.key, 'another-tab']))
    localStorage.setItem = () => { throw new Error('quota') }
    const second = { key: 'new-item' }
    dismissPrivateReminders(key, day, [second])
    assert.ok(readReminderDismissals(key, day).includes(second.key))
    localStorage.getItem = () => { throw new Error('disabled') }
    assert.ok(readReminderDismissals(key, day).includes(second.key))
    assert.deepEqual(readReminderDismissals(key, '2026-10-16'), [])
    assert.equal(privateItemReminder(item({ start_date: '2026-10-16', reminder_days_before: 1 }), '2026-10-16').label, '今天开始')
  } finally { delete globalThis.localStorage }
})

test('corrupt storage never breaks reminders or exposes unrelated entries', () => {
  const key = reminderStorageKey('corrupt-owner', 'a'), day = '2026-10-15'
  for (const raw of ['{', 'null', '[]', '{"day":"2026-10-15","keys":null}', '{"day":"2026-10-15","keys":[42,null]}']) {
    globalThis.localStorage = { getItem: () => raw }
    assert.deepEqual(readReminderDismissals(key, day), [])
  }
  delete globalThis.localStorage
})

test('snooze is tab-session scoped, isolated from daily acknowledgement, and expires at midnight', async () => {
  const localValues = new Map(), sessionValues = new Map()
  const storage = values => ({ getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) })
  globalThis.localStorage = storage(localValues)
  globalThis.sessionStorage = storage(sessionValues)
  try {
    const key = reminderStorageKey('session-owner', 'account-a'), day = '2026-10-15'
    const reminder = privateItemReminder(item(), day)
    dismissPrivateReminders(key, day, [reminder], 'sessionStorage')
    assert.deepEqual(JSON.parse(sessionValues.get(key)), { day, keys: [reminder.key] })
    assert.deepEqual(readReminderDismissals(key, day, 'sessionStorage'), [reminder.key])
    assert.deepEqual(readReminderDismissals(key, day), [])
    assert.deepEqual(readReminderDismissals(reminderStorageKey('other', 'account-a'), day, 'sessionStorage'), [])
    assert.deepEqual(readReminderDismissals(reminderStorageKey('session-owner', 'account-b'), day, 'sessionStorage'), [])
    assert.equal(localValues.size, 0)
    const reloaded = await import('../src/data/calendarPrivateReminders.js?session-reload')
    assert.deepEqual(reloaded.readReminderDismissals(key, day, 'sessionStorage'), [reminder.key])
    assert.deepEqual(reloaded.readReminderDismissals(key, '2026-10-16', 'sessionStorage'), [])
    dismissPrivateReminders(key, day, [{ key: 'acknowledged' }])
    sessionValues.clear()
    const newSession = await import('../src/data/calendarPrivateReminders.js?next-session')
    assert.deepEqual(newSession.readReminderDismissals(key, day, 'sessionStorage'), [])
    assert.deepEqual(newSession.readReminderDismissals(key, day), ['acknowledged'])
  } finally { delete globalThis.localStorage; delete globalThis.sessionStorage }
})

test('unavailable session storage retains snooze in memory without creating a daily acknowledgement', () => {
  const key = reminderStorageKey('session-failure-owner', 'a'), day = '2026-10-15'
  globalThis.sessionStorage = { getItem: () => '{', setItem: () => { throw new Error('disabled') } }
  try {
    assert.deepEqual(readReminderDismissals(key, day, 'sessionStorage'), [])
    dismissPrivateReminders(key, day, [{ key: 'snoozed' }], 'sessionStorage')
    sessionStorage.getItem = () => { throw new Error('disabled') }
    assert.deepEqual(readReminderDismissals(key, day, 'sessionStorage'), ['snoozed'])
    assert.deepEqual(readReminderDismissals(key, day), [])
    assert.deepEqual(readReminderDismissals(key, '2026-10-16', 'sessionStorage'), [])
  } finally { delete globalThis.sessionStorage }
})

test('monthly instance reminders use actual cross-month dates and dismiss each period independently', () => {
  const november = item({ id: 'series@2026-11-01', start_date: '2026-11-01', end_date: '2026-11-01', reminder_days_before: 1 })
  const december = item({ id: 'series@2026-12-01', start_date: '2026-12-01', end_date: '2026-12-01', reminder_days_before: 1 })
  const advance = privateItemReminder(november, '2026-10-31')
  const sameDay = privateItemReminder(november, '2026-11-01')
  const next = privateItemReminder(december, '2026-11-30')
  assert.equal(advance.label, '明天开始')
  assert.equal(sameDay.label, '今天开始')
  assert.notEqual(advance.key, next.key)
  const key = reminderStorageKey('monthly-owner', 'monthly-account')
  dismissPrivateReminders(key, '2026-10-31', [advance])
  assert.ok(readReminderDismissals(key, '2026-10-31').includes(advance.key))
  assert.ok(!readReminderDismissals(key, '2026-11-01').includes(sameDay.key))
  assert.ok(!readReminderDismissals(key, '2026-11-30').includes(next.key))
})
