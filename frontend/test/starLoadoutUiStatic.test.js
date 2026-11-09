import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../test-support/readSource.js'

const editor = readSource(new URL('../src/components/operator/StarLoadoutEditor.vue', import.meta.url), 'utf8')
const modal = readSource(new URL('../src/components/operator/StarLoadoutModal.vue', import.meta.url), 'utf8')
const manager = readSource(new URL('../src/components/operator/StarPresetManager.vue', import.meta.url), 'utf8')
const softSelect = readSource(new URL('../src/components/ui/SoftSelect.vue', import.meta.url), 'utf8')
const page = readSource(new URL('../src/pages/operator/index.vue', import.meta.url), 'utf8')

test('C2S editor stays group-first and has no independent save footer', function () {
  assert.match(editor, /const activeKind = ref\('main'\)/)
  assert.match(editor, /const replacementSlot = ref\(null\)/)
  assert.match(editor, /StarPresetManager/)
  assert.doesNotMatch(editor, /\$emit\('save'\)|\$emit\('close'\)/)
})

test('all star editor dropdowns use SoftSelect instead of native select', function () {
  assert.match(softSelect, /role="option"/)
  assert.match(softSelect, /document\.addEventListener\('pointerdown'/)
  assert.match(softSelect, /@keydown\.esc/)
  assert.match(softSelect, /ArrowDown/)
  assert.match(softSelect, /:disabled="disabled"/)
})

test('preset manager is compact, validates canonical inputs and keeps cloud failures open', function () {
  assert.match(manager, /await props\.saveHandler\(next\)/)
  assert.match(manager, /draft and modal stay intact/)
})

test('external modal auto-saves only on dirty close and both editors stay 760px', function () {
  assert.match(modal, /request-close/)
  assert.match(page, /async function requestCloseStarLoadout\(\)/)
  assert.match(page, /if \(await persistStarLoadout\(\)\) closeStarLoadout\(\)/)
  assert.match(page, /function starLoadoutIsDirty\(\)/)
})

test('operator page loads user-global presets independently from account-scoped snapshots', function () {
  assert.match(page, /starLoadoutPresetStore\.load\(starPresetUserScope\(\)\)/)
  assert.match(page, /loadCatalog\(\), loadAccounts\(\), loadStarLoadoutPresets\(\)/)
  const accountWatchStart = page.indexOf('return [accountId.value, saveGame.value]')
  const accountReset = page.slice(accountWatchStart, accountWatchStart + 1000)
  assert.doesNotMatch(accountReset, /starLoadoutPresetStore\.clear/)
})

test('operator loadout loading and saving stay bound to the account that opened the editor', function () {
  assert.match(page, /<DataAccountContextBar/)
  assert.match(page, /:show-account-bar="false"/)
  assert.doesNotMatch(page, /v-model:accountId=/)
  assert.match(page, /getCurrentStarState\(targetAccount\), getCurrentStarLoadout\(targetAccount\)/)
  assert.match(page, /const targetAccount = accountId\.value;[\s\S]*?\+\+starLoadoutLoadSeq;[\s\S]*?readStarLoadoutPair\(targetAccount\)[\s\S]*?accountId\.value !== targetAccount/)
  assert.match(page, /const targetAccount = starLoadoutAccountId\.value;[\s\S]*?accountId\.value !== targetAccount[\s\S]*?putCurrentStarLoadout\(targetAccount,[\s\S]*?expected_generation: targetGeneration[\s\S]*?starLoadoutRevision\.value !== targetRevision/)
})
