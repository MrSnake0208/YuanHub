import test from 'node:test'
import assert from 'node:assert/strict'
import { CALENDAR_GAME_STORAGE_KEY, calendarGameFilter, readCalendarGamePreference, saveCalendarGamePreference } from '../src/data/calendarGamePreference.js'

test('URL priority, valid persisted games, explicit all and unavailable storage', () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  assert.equal(readCalendarGamePreference(), '')
  assert.equal(saveCalendarGamePreference('代号鸢'), true)
  assert.equal(readCalendarGamePreference(), '代号鸢')
  assert.equal(calendarGameFilter({ game: '如鸢', event: 'keep' }, readCalendarGamePreference()), '如鸢')
  assert.equal(readCalendarGamePreference(), '代号鸢')
  assert.equal(calendarGameFilter({ game: 'invalid' }, '代号鸢'), '代号鸢')
  assert.equal(calendarGameFilter({ game: ['如鸢'] }, '代号鸢'), '如鸢')
  assert.equal(saveCalendarGamePreference('invalid'), false)
  assert.equal(saveCalendarGamePreference(''), true)
  assert.equal(readCalendarGamePreference(), '')
  values.set(CALENDAR_GAME_STORAGE_KEY, 'invalid')
  assert.equal(readCalendarGamePreference(), '')
  globalThis.localStorage = { getItem() { throw Error('denied') }, setItem() { throw Error('denied') } }
  assert.equal(readCalendarGamePreference(), '')
  assert.equal(saveCalendarGamePreference('如鸢'), false)
  delete globalThis.localStorage
})
