import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bagTutorialSteps, bagReviewInfo, createBagTutorialGate } from '../src/pages/star/bagTutorial.js'
import { tutorialStepIndex, tutorialStorageKey, tutorialSeen, markTutorialSeen, shouldRevealTutorialTarget, tutorialSheetBounds, tutorialElementRect } from '../src/pages/star/recognitionTutorial.js'

test('bag tutorial has exactly seven manually navigated steps and independent persistence', () => {
  assert.equal(bagTutorialSteps.length, 7)
  let step = 0
  for (let i = 1; i < 7; i++) { step = tutorialStepIndex(step, 1, 7); assert.equal(step, i) }
  assert.equal(tutorialStepIndex(step, 1, 7), 6)
  for (let i = 5; i >= 0; i--) { step = tutorialStepIndex(step, -1, 7); assert.equal(step, i) }
  assert.equal(tutorialStepIndex(step, -1, 7), 0)
  const bag = tutorialStorageKey('bag-helper-user', 'bag'), recognition = tutorialStorageKey('bag-helper-user')
  assert.notEqual(bag, recognition)
  markTutorialSeen(bag, null)
  assert.equal(tutorialSeen(bag, null), true)
  assert.equal(tutorialSeen(recognition, null), false)
})
test('Step 1 actively reveals review on entry and replay regardless of pending content', () => {
  const step = bagTutorialSteps[0]
  assert.equal(step.target, '.ocr-review')
  assert.equal(step.exampleLabel, '查看核对说明')
  assert.match(step.body, /识别完成后，可以在这里回看识别结果/)
  for (const rect of [{ top: 80, bottom: 600 }, { top: 1200, bottom: 2200 }]) {
    assert.equal(shouldRevealTutorialTarget(step, rect, { top: 0, height: 844 }), true)
  }
  assert.equal(shouldRevealTutorialTarget(step, null, { top: 0, height: 844 }), false)
})
test('find/edit/experience/history content and primary/related targets stay scoped', () => {
  assert.match(bagTutorialSteps[2].body, /在视图「名称汇总」里，双击某组星石的名称/)
  assert.equal(bagTutorialSteps[2].target, '.review-toolbar')
  assert.equal(bagTutorialSteps[3].paragraphs.length, 2)
  assert.match(bagTutorialSteps[3].paragraphs[1], /再点「新增当前行」，原来的星石会保留。\n如果不改内容直接新增/)
  for (const step of bagTutorialSteps) {
    for (const paragraph of step.paragraphs || [step.body]) assert.doesNotMatch(paragraph, /\n\n/)
  }
  assert.equal(bagTutorialSteps[3].target, '.current-editor')
  assert.match(bagTutorialSteps[3].relatedTargets, /#current-rows/)
  assert.equal(bagTutorialSteps[4].target, '.plan-editor')
  assert.equal(bagTutorialSteps[4].relatedTargets, '.pending-only-toggle')
  assert.match(bagTutorialSteps[5].body, /当前视图内所有待养成星石/)
  assert.doesNotMatch(bagTutorialSteps[5].body, /全部养成计划/)
  assert.equal(bagTutorialSteps[6].target, '.review-workspace-tools')
  assert.equal(bagTutorialSteps[6].mobileAvoidTarget, true)
})
test('review explanation documents keep/ignore/edit and immediate writeback', () => {
  assert.equal(bagReviewInfo.title, '怎么看识别结果')
  assert.deepEqual(bagReviewInfo.sections.map(s => s.title), ['查看整页', '查看全部候选', '保留', '忽略', '修改'])
  assert.match(bagReviewInfo.sections[2].body, /一般不需要再点这个按钮/)
  assert.match(bagReviewInfo.sections[2].body, /「保留」恢复/)
  assert.match(bagReviewInfo.sections[4].body, /确认修改后会立即写回当前背包/)
})
test('first successful OCR can auto start only after local review appears; old users remain quiet', () => {
  const gate = createBagTutorialGate(), ready = { reviewing: true, ready: true, seen: false, hasEvidence: true }
  assert.equal(gate.loaded('new', false), true)
  assert.equal(gate.shouldStart('new', ready), false)
  gate.ocrCompleted('new')
  assert.equal(gate.loaded('new', true), true, 'new OCR history does not turn its owner into an old user')
  assert.equal(gate.shouldStart('new', ready), true)
  for (const override of [{ reviewing: false }, { ready: false }, { seen: true }, { hasEvidence: false }]) {
    assert.equal(gate.shouldStart('new', { ...ready, ...override }), false)
  }
  assert.equal(gate.loaded('old', true), false)
  gate.ocrCompleted('old')
  assert.equal(gate.shouldStart('old', ready), false)
  assert.equal(gate.shouldStart('new', ready), false, 'account switch discards pending intro')
  gate.reset(); gate.ocrCompleted('old')
  assert.equal(gate.shouldStart('old', ready), false)
})
test('mobile history sheet reserves floating tools and respects a short viewport/safe areas', () => {
  for (const height of [420, 844]) {
    const view = { top: 48, height }, tools = { top: 48 + height - 54 }
    const bounds = tutorialSheetBounds(view, 900, { top: 20, bottom: 34 }, tools)
    assert.equal(900 - bounds.bottom, tools.top - 12)
    assert.equal(900 - bounds.bottom - bounds.maxHeight, view.top + 32)
  }
})
test('selected-row related highlight is clipped to the internal table viewport', () => {
  const view = { left: 0, top: 0, width: 390, height: 844 }
  const container = { getBoundingClientRect: () => ({ left: 10, right: 200, top: 100, bottom: 300 }) }
  const row = { closest: () => container, getBoundingClientRect: () => ({ left: 10, right: 200, top: 310, bottom: 340, width: 190, height: 30 }) }
  assert.equal(tutorialElementRect(row, view), null)
  row.getBoundingClientRect = () => ({ left: 10, right: 200, top: 280, bottom: 320, width: 190, height: 40 })
  assert.equal(tutorialElementRect(row, view).bottom, 300)
})
