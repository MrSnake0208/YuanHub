import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getTodayDataReadiness,
  getTodayOnboardingStage,
  shouldShowTodayDataOnboarding,
  summarizeTodayData
} from '../src/data/todayData.js'

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
    starState: {
      inventory: [{ instance_id: 'star_a' }, { instance_id: 'star_b' }]
    },
    favorites: { agent_ids: ['char_a', 'char_a', 'char_c'] },
    notifications: { count: 2.9 }
  }), {
    operatorCount: 3,
    favoriteCount: 2,
    inventoryKindCount: 2,
    starCount: 2,
    unreadCount: 2
  })
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
    summary: { operatorCount: 2, inventoryKindCount: 0, starCount: 3 }
  }), 'data')

  assert.equal(getTodayOnboardingStage({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: 2, inventoryKindCount: 4, starCount: 0 }
  }), 'data')

  assert.equal(getTodayOnboardingStage({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: 2, inventoryKindCount: 4, starCount: 3 }
  }), 'ready')

  assert.deepEqual(getTodayDataReadiness({
    operatorCount: 1,
    inventoryKindCount: 0,
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
    summary: { operatorCount: null, inventoryKindCount: 1, starCount: 2 }
  }), 'ready')

  assert.equal(shouldShowTodayDataOnboarding({
    isLoggedIn: true,
    hasAccounts: true,
    summary: { operatorCount: 1, inventoryKindCount: 0, starCount: null }
  }), true)
})
