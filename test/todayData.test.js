import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeTodayData } from '../src/data/todayData.js'

test('summarizes real Today data without counting duplicates or empty inventory', function () {
  assert.deepEqual(summarizeTodayData({
    current: [
      { entries: { char_a: { level: 80 }, char_b: { level: 40 } } },
      { entries: { char_b: { level: 50 }, char_c: { level: 1 } } }
    ],
    inventory: [
      { entries: { coin: { count: 12 }, feather: { count: 0 } } },
      { entries: { coin: { count: 15 }, scroll: { count: 2 } } }
    ],
    favorites: { agent_ids: ['char_a', 'char_a', 'char_c'] },
    notifications: { count: 2.9 }
  }), {
    operatorCount: 3,
    favoriteCount: 2,
    inventoryKindCount: 2,
    unreadCount: 2
  })
})
