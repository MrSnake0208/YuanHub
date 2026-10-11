import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bagTutorialSteps, bagReviewInfo, createBagTutorialGate, growthPlanTutorialSteps, historyTutorialStep } from '../src/pages/star/bagTutorial.js'
import { tutorialStepIndex, tutorialStorageKey, tutorialSeen, markTutorialSeen, shouldRevealTutorialTarget, tutorialSheetBounds, tutorialElementRect } from '../src/pages/star/recognitionTutorial.js'

test('bag tutorial has exactly six manually navigated steps and independent persistence', () => {
  assert.equal(bagTutorialSteps.length, 6)
  let step = 0
  for (let i = 1; i < 6; i++) { step = tutorialStepIndex(step, 1, 6); assert.equal(step, i) }
  assert.equal(tutorialStepIndex(step, 1, 6), 5)
  for (let i = 4; i >= 0; i--) { step = tutorialStepIndex(step, -1, 6); assert.equal(step, i) }
  assert.equal(tutorialStepIndex(step, -1, 6), 0)
  const bag = tutorialStorageKey('bag-helper-user', 'bag'), recognition = tutorialStorageKey('bag-helper-user')
  assert.notEqual(bag, recognition)
  markTutorialSeen(bag, null)
  assert.equal(tutorialSeen(bag, null), true)
  assert.equal(tutorialSeen(recognition, null), false)
})
test('growth replay has six scoped steps and separate seen state; bag history remains intact',()=>{
  assert.deepEqual(growthPlanTutorialSteps.map(step=>step.target),['.growth-inventory','.growth-resources','.growth-editor','.growth-editor','.growth-route-list','.growth-selection'])
  assert.equal(bagTutorialSteps.at(-1), historyTutorialStep)
  assert.equal(growthPlanTutorialSteps.length, 6)
  assert.doesNotMatch(growthPlanTutorialSteps.map(step=>step.title).join(' '),/撤销|撤回|重做|存档/)
  const plan=tutorialStorageKey('plan-helper','plan')
  markTutorialSeen(plan,null)
  assert.equal(tutorialSeen(plan,null),true)
  assert.equal(tutorialSeen(tutorialStorageKey('plan-helper','bag'),null),false)
  assert.equal(tutorialSeen(tutorialStorageKey('plan-helper'),null),false)
})
test('Step 1 actively reveals review on entry and replay regardless of pending content', () => {
  const step = bagTutorialSteps[0]
  assert.equal(step.target, '.ocr-review')
  assert.equal(step.exampleLabel, '查看核对说明')
  assert.equal(step.paragraphs[0], '识别完成后，可以在这里回看截图和识别结果。')
  for (const rect of [{ top: 80, bottom: 600 }, { top: 1200, bottom: 2200 }]) {
    assert.equal(shouldRevealTutorialTarget(step, rect, { top: 0, height: 844 }), true)
  }
  assert.equal(shouldRevealTutorialTarget(step, null, { top: 0, height: 844 }), false)
})
test('find/edit/experience/history content and primary/related targets stay scoped', () => {
  assert.deepEqual(bagTutorialSteps.map(step => step.title), ['检查识别结果', '认识当前背包', '查找与查看星石', '查看背包与经验星曜', '编辑或新增星石', '撤销、重做和近期存档'])
  assert.deepEqual(bagTutorialSteps.map(step => step.target), ['.ocr-review', '.bag-inventory', '.bag-filters', '.bag-summary', '.current-editor', '.review-workspace-tools'])
  assert.match(bagTutorialSteps[2].paragraphs[2], /双击某一组，即可进入这一组的逐颗明细/)
  assert.equal(bagTutorialSteps[4].paragraphs.length, 3)
  assert.match(bagTutorialSteps[4].paragraphs[1], /点击「新增当前行」，原有星石会保留/)
  for (const step of bagTutorialSteps) {
    for (const paragraph of step.paragraphs || [step.body]) assert.doesNotMatch(paragraph, /\n\n/)
  }
  assert.match(bagTutorialSteps[4].relatedTargets, /#current-rows/)
  assert.match(bagTutorialSteps[3].paragraphs[1], /查看经验星曜原图/)
  assert.equal(bagTutorialSteps[5].mobileAvoidTarget, true)
  for (const step of bagTutorialSteps) {
    assert.ok(step?.title && step.target && (step.body || step.paragraphs?.length))
    assert.doesNotMatch((step.paragraphs || [step.body]).join('\n'), /养成计划|养成目标|计划经验|资源缺口|突破瓶子|两个背包|仅看待养成/)
  }
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
  gate.cancelOcr('other')
  assert.equal(gate.shouldStart('new', ready), true, 'another account cannot cancel this owner')
  gate.cancelOcr('new')
  assert.equal(gate.shouldStart('new', ready), false, 'import/restore invalidates pending OCR handoff only')
  gate.ocrCompleted('new')
  assert.equal(gate.shouldStart('new', ready), true, 'a later real OCR can qualify without resetting read records')
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
