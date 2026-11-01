import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getTodayDataReadiness,
  getTodayOnboardingStage,
  hasTodayAccountData,
  shouldShowTodayDataOnboarding,
  summarizeTodayData
} from '../src/data/todayData.js'

test('summarizes real Today data without counting duplicates or empty inventory', function () {
  assert.deepEqual(summarizeTodayData({
    current: [
      { entries: { char_a: { star_level: 1, level: 80 }, char_b: { star_level: 1, level: 40 } } },
      { entries: { char_b: { star_level: 1, level: 50 }, char_c: { star_level: 1, level: 1 } } }
    ],
    inventory: [
      { entries: { coin: { count: 12 }, feather: { count: 0 } } },
      { entries: { coin: { count: 15 }, scroll: { count: 2 } } }
    ],
    starState: {
      inventory: [{ instance_id: 'star_a' }, { instance_id: 'star_b' }]
    },
    favorites: { agent_ids: ['char_a', 'char_a', 'char_c'] },
    notifications: { count: 2.9 }
  }), {
    operatorCount: 3,
    favoriteCount: 2,
    inventoryKindCount: 2,
    inventoryRecorded: true,
    inventoryHasFullBaseline: false,
    starCount: 2,
    unreadCount: 2
  })
})

test('partial ready data enters daily overview without requiring all features', () => {
  assert.equal(hasTodayAccountData({ operatorCount: 2, inventoryRecorded: false, starCount: 0 }), true)
  assert.equal(hasTodayAccountData({ operatorCount: 0, inventoryRecorded: true, inventoryKindCount: 0, starCount: null }), true)
  assert.equal(hasTodayAccountData({ operatorCount: null, inventoryRecorded: null, starCount: null }), false)
  assert.equal(hasTodayAccountData({ operatorCount: 0, inventoryRecorded: false, starCount: 0 }), false)
})

test('derives three onboarding stages and checks operator inventory and star independently', function () {
  assert.equal(getTodayOnboardingStage({
    isLoggedIn: false,
    hasAccounts: false,
    summary: {}
  }), 'auth')

  assert.equal(getTodayOnboardingStage({
    isLoggedIn: true,
    hasAccounts: false,
    summary: {}
  }), 'account')

  assert.equal(getTodayOnboardingStage({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: 2, inventoryKindCount: 0, inventoryRecorded: false, starCount: 3 }
  }), 'data')

  assert.equal(getTodayOnboardingStage({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: 2, inventoryKindCount: 4, inventoryRecorded: true, starCount: 0 }
  }), 'data')

  assert.equal(getTodayOnboardingStage({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: 2, inventoryKindCount: 4, inventoryRecorded: true, starCount: 3 }
  }), 'ready')

  assert.deepEqual(getTodayDataReadiness({
    operatorCount: 1,
    inventoryKindCount: 0,
    inventoryRecorded: false,
    starCount: null
  }), {
    operator: 'ready',
    inventory: 'empty',
    star: 'unknown'
  })
})

test('does not turn read failures into fake empty data', function () {
  assert.equal(getTodayOnboardingStage({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: null, inventoryKindCount: 1, inventoryRecorded: true, starCount: 2 }
  }), 'ready')

  assert.equal(shouldShowTodayDataOnboarding({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: 1, inventoryKindCount: 0, inventoryRecorded: false, starCount: null }
  }), true)
})

test('full zero baseline is recorded independently from positive inventory count', function () {
  const summary = summarizeTodayData({ inventory: [{ full_baseline_at: '2026-10-04T08:00:00Z', entries: {} }] })
  assert.equal(summary.inventoryKindCount, 0)
  assert.equal(summary.inventoryRecorded, true)
  assert.equal(summary.inventoryHasFullBaseline, true)
  assert.equal(getTodayDataReadiness(summary).inventory, 'ready')
  assert.equal(getTodayOnboardingStage({ isLoggedIn: true, hasAccounts: true, summary: { ...summary, operatorCount: 1, starCount: 1 } }), 'ready')
})

test('listed zero and existing stock are recorded without claiming a full baseline', function () {
  for (const count of [0, 3]) {
    const summary = summarizeTodayData({ inventory: [{ full_baseline_at: null, entries: { coin: { count, listed_baseline_at: '2026-10-04T08:00:00Z' } } }] })
    assert.equal(summary.inventoryKindCount, count > 0 ? 1 : 0)
    assert.equal(summary.inventoryRecorded, true)
    assert.equal(summary.inventoryHasFullBaseline, false)
    assert.equal(getTodayDataReadiness(summary).inventory, 'ready')
  }
})

test('no records, missing evidence and failures remain distinct', function () {
  assert.equal(getTodayDataReadiness(summarizeTodayData({ inventory: [] })).inventory, 'empty')
  for (const inventory of [null, undefined, {}, [{ entries: {} }], [{ full_baseline_at: 'invalid', entries: {} }], [{ entries: { coin: { count: -1 } } }]]) {
    const summary = summarizeTodayData({ inventory })
    assert.equal(summary.inventoryRecorded, null)
    assert.equal(getTodayDataReadiness(summary).inventory, 'unknown')
  }
  assert.equal(getTodayDataReadiness({ inventoryKindCount: 0 }).inventory, 'unknown')
})

test('unowned operators do not establish data; malformed operator/star reads stay unknown', () => {
  assert.equal(summarizeTodayData({ current: [{ entries: { op: { star_level: 0 } } }] }).operatorCount, 0)
  for (const current of [null, {}, [null], [{ entries: [] }]]) assert.equal(summarizeTodayData({ current }).operatorCount, null)
  for (const starState of [null, {}, { inventory: [null] }, { inventory: [{}] }]) assert.equal(summarizeTodayData({ starState }).starCount, null)
})
