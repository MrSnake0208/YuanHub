import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recognitionTutorialSteps, tutorialStepIndex, tutorialStorageKey, tutorialSeen, markTutorialSeen, shouldAutoStartTutorial, tutorialCardPosition, clipTutorialRect, clampTutorialLift } from '../src/pages/star/recognitionTutorial.js'

test('six manual steps clamp at both ends and progress text remains exact', () => {
  assert.equal(recognitionTutorialSteps.length, 6)
  assert.equal(tutorialStepIndex(0, -1), 0)
  assert.equal(tutorialStepIndex(5, 1), 5)
  assert.equal(tutorialStepIndex(2, -1), 1)
  assert.equal(tutorialStepIndex(2, 1), 3)
  assert.equal(recognitionTutorialSteps[5].body, '识别进度会显示在这里。第一次模型下载会比较缓慢。\n完成后会进入背包整理，再核对识别结果。')
})
test('automatic tutorial requires a loaded empty import workspace and unseen user', () => {
  const newUser = { ready: true, importing: true, seen: false, hasHistory: false }
  assert.equal(shouldAutoStartTutorial(newUser), true)
  for (const override of [{ ready: false }, { importing: false }, { seen: true }, { hasHistory: true }, { hasHistory: undefined }]) {
    assert.equal(shouldAutoStartTutorial({ ...newUser, ...override }), false)
  }
})
test('dismissal persists per site user, including a storage failure fallback', () => {
  const key = tutorialStorageKey('focused-unit-user')
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  assert.equal(tutorialSeen(key, storage), false)
  markTutorialSeen(key, storage)
  assert.equal(data.get(key), 'seen')
  assert.equal(tutorialSeen(key, storage), true)
  assert.notEqual(tutorialStorageKey('other-user'), key)
  const broken = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  const brokenKey = tutorialStorageKey('blocked-storage-user')
  markTutorialSeen(brokenKey, broken)
  assert.equal(tutorialSeen(brokenKey, broken), true)
})
test('desktop placement prefers right, then left, below, above and keeps collision fallback on screen', () => {
  const view = { left: 0, top: 0, width: 1440, height: 900 }, size = { width: 340, height: 250 }
  assert.equal(tutorialCardPosition({ left: 300, right: 800, top: 200, bottom: 400 }, size, view).placement, 'right')
  assert.equal(tutorialCardPosition({ left: 800, right: 1400, top: 200, bottom: 400 }, size, view).placement, 'left')
  assert.equal(tutorialCardPosition({ left: 100, right: 1300, top: 200, bottom: 400 }, size, view).placement, 'bottom')
  assert.equal(tutorialCardPosition({ left: 100, right: 1300, top: 500, bottom: 850 }, size, view).placement, 'top')
  for (const width of [320, 390, 430, 767, 768, 1024, 1440]) {
    const result = tutorialCardPosition(null, size, { ...view, width })
    assert.ok(result.left >= 12)
    assert.ok(result.left + Math.min(size.width, width - 24) <= width - 12)
    assert.ok(result.top >= 12 && result.top + size.height <= 888)
  }
})
test('spotlight clips offscreen targets and mobile drag remains bounded', () => {
  const view = { left: 0, top: 0, width: 390, height: 844 }
  assert.equal(clipTutorialRect({ left: 0, right: 200, top: 900, bottom: 1100, width: 200, height: 200 }, view), null)
  assert.deepEqual(clipTutorialRect({ left: -20, right: 400, top: 40, bottom: 900, width: 420, height: 860 }, view), { left: 0, top: 32, right: 390, bottom: 844, width: 390, height: 812 })
  assert.equal(clampTutorialLift(1000, 844, 300), 140)
  assert.equal(clampTutorialLift(-30, 844, 300), 0)
  assert.equal(clampTutorialLift(140, 360, 300), 36)
})

test('confirmation card avoids covering related confirm buttons when there is room below', () => {
  const target = { left: 600, right: 700, top: 90, bottom: 134 }
  const related = { left: 950, right: 1050, top: 90, bottom: 134 }
  const card = tutorialCardPosition(target, { width: 340, height: 200 }, { left: 0, top: 0, width: 1440, height: 900 }, [target, related])
  assert.equal(card.placement, 'right')
  assert.equal(card.top, 150)
})

test('maximum mobile lift leaves both safe areas and the top margin in a short viewport', () => {
  const height = 420, cardHeight = 330, safeArea = { top: 20, bottom: 34 }
  const lift = clampTutorialLift(1000, height, cardHeight, safeArea)
  assert.equal(lift, 12)
  assert.equal(height - (12 + safeArea.bottom + lift) - cardHeight, 12 + safeArea.top)
  assert.equal(clampTutorialLift(1000, 360, 300, { bottom: 34 }), 2)
  assert.equal(clampTutorialLift(1000, 360, 300, safeArea), 0)
})
