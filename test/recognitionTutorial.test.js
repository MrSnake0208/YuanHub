import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recognitionGuidance, recognitionTutorialExamples, tutorialStorageKey, tutorialSeen, finishTutorial, shouldAutoStartTutorial, tutorialCardPosition, clipTutorialRect, shouldRevealTutorialTarget } from '../src/pages/star/recognitionTutorial.js'

test('automatic guidance requires a hydrated empty workspace and an unseen user', () => {
  const newUser = { ready: true, importing: true, seen: false, hasHistory: false }
  assert.equal(shouldAutoStartTutorial(newUser), true)
  for (const override of [{ ready: false }, { importing: false }, { seen: true }, { hasHistory: true }, { hasHistory: undefined }]) assert.equal(shouldAutoStartTutorial({ ...newUser, ...override }), false)
})
test('only completion or explicit opt-out persists; v1 dismissal does not disable v2 guidance', () => {
  const key = tutorialStorageKey('unit-user'), data = new Map([['yuanhub:star-recognition:v1:unit-user', 'seen']])
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  assert.equal(tutorialSeen(key, storage), false)
  for (const reason of ['later', 'skip', 'escape', 'tab', 'account', undefined]) {
    finishTutorial(key, reason, storage)
    assert.equal(tutorialSeen(key, storage), false)
  }
  finishTutorial(key, 'complete', storage)
  assert.equal(data.get(key), 'seen')
  const optOut = tutorialStorageKey('opt-out-unit-user')
  finishTutorial(optOut, 'opt-out', storage)
  assert.equal(tutorialSeen(optOut, storage), true)
  assert.notEqual(tutorialStorageKey('another-user'), key)
  const broken = { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } }
  const fallback = tutorialStorageKey('fallback-unit-user')
  finishTutorial(fallback, 'later', broken)
  assert.equal(tutorialSeen(fallback, broken), false)
  finishTutorial(fallback, 'complete', broken)
  assert.equal(tutorialSeen(fallback, broken), true)
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw Error('storage access denied') } })
    const inaccessible = tutorialStorageKey('inaccessible-unit-user')
    finishTutorial(inaccessible, 'later')
    assert.equal(tutorialSeen(inaccessible), false)
    finishTutorial(inaccessible, 'opt-out')
    assert.equal(tutorialSeen(inaccessible), true)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor)
    else delete globalThis.localStorage
  }
})
test('targets already visible, including partially visible large targets, never request a scroll', () => {
  const viewport = { top: 64, height: 700 }
  for (const rect of [{ top: 100, bottom: 200 }, { top: 40, bottom: 90 }, { top: 700, bottom: 1200 }, { top: 0, bottom: 1000 }]) assert.equal(shouldRevealTutorialTarget(recognitionGuidance.upload, rect, viewport), false)
  for (const rect of [{ top: 0, bottom: 60 }, { top: 900, bottom: 1000 }]) assert.equal(shouldRevealTutorialTarget(recognitionGuidance.upload, rect, viewport), true)
  assert.equal(shouldRevealTutorialTarget(recognitionGuidance.overlap, { top: 900, bottom: 1000 }, viewport), false)
  assert.equal(shouldRevealTutorialTarget(recognitionGuidance.upload, null, viewport), false)
})
test('placement avoids target and related controls on phone, landscape, tablet and desktop', () => {
  for (const [width, height] of [[320, 844], [390, 844], [430, 844], [767, 900], [768, 900], [844, 390], [1024, 900], [1440, 900]]) {
    const view = { left: 0, top: 64, width, height: height - 64 }
    const target = { left: 20, right: width - 20, top: 100, bottom: 200 }
    const size = { width: width < 768 ? width - 24 : 340, height: 180 }
    let result = tutorialCardPosition(target, size, view, [{ left: 20, right: 80, top: 216, bottom: 260 }])
    if (height === 390) {
      assert.equal(result.overlaps, true, 'landscape must request compact fallback')
      size.height = 60
      result = tutorialCardPosition(target, size, view, [{ left: 20, right: 80, top: 216, bottom: 260 }])
    }
    assert.equal(result.overlaps, false, `${width}×${height}`)
    assert.ok(result.left >= 12 && result.left + size.width <= width - 12)
    assert.ok(result.top >= 76 && result.top + size.height <= height - 12)
  }
})
test('oversized geometry signals collapse; compact placement can use another edge', () => {
  const view = { left: 0, top: 64, width: 390, height: 326 }, target = { left: 12, right: 378, top: 76, bottom: 230 }
  assert.equal(tutorialCardPosition(target, { width: 366, height: 200 }, view).overlaps, true)
  assert.equal(tutorialCardPosition(target, { width: 366, height: 60 }, view).overlaps, false)
  const empty = tutorialCardPosition(null, { width: 366, height: 60 }, view, [], 'top')
  assert.equal(empty.placement, 'top')
  assert.equal(clipTutorialRect({ left: 0, right: 200, top: 900, bottom: 1100, width: 200, height: 200 }, view), null)
})
test('all local examples have explicit crops and captions; no unavailable collection promise', () => {
  for (const item of Object.values(recognitionTutorialExamples).flat()) {
    assert.match(item.src, /^\/tutorial\/star\//)
    assert.ok(item.caption && item.crops.length)
    for (const crop of item.crops) {
      assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 100 && crop.y + crop.height <= 100)
      assert.ok(crop.aspect > 0 && crop.label)
    }
  }
  for (const step of Object.values(recognitionGuidance)) assert.doesNotMatch(step.body, /MaaYuan.*自动采集/)
})
