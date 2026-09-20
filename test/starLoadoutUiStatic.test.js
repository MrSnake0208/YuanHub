import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const editor = readFileSync(new URL('../src/components/operator/StarLoadoutEditor.vue', import.meta.url), 'utf8')
const modal = readFileSync(new URL('../src/components/operator/StarLoadoutModal.vue', import.meta.url), 'utf8')
const manager = readFileSync(new URL('../src/components/operator/StarPresetManager.vue', import.meta.url), 'utf8')
const softSelect = readFileSync(new URL('../src/components/ui/SoftSelect.vue', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/operator/index.vue', import.meta.url), 'utf8')

test('C2S editor stays group-first and has no independent save footer', function () {
  assert.match(editor, /const activeKind = ref\('main'\)/)
  assert.match(editor, /const replacementSlot = ref\(null\)/)
  assert.match(editor, /正在选择：/)
  assert.match(editor, /正在替换：/)
  assert.match(editor, /已选满，请先点上方星石选择要替换的位置/)
  assert.match(editor, /--candidate-columns:6/)
  assert.match(editor, /--candidate-columns:4/)
  assert.match(editor, /placeholder="天府 武曲 天机"/)
  assert.match(editor, /StarPresetManager/)
  assert.doesNotMatch(editor, /<footer class="star-loadout-footer"/)
  assert.doesNotMatch(editor, /\$emit\('save'\)|\$emit\('close'\)/)
})

test('all star editor dropdowns use SoftSelect instead of native select', function () {
  assert.equal((editor.match(/<SoftSelect/g) || []).length, 3)
  assert.doesNotMatch(editor, /<select[\s>]/)
  assert.match(softSelect, /class="soft-select-trigger"/)
  assert.match(softSelect, /soft-select-option-description/)
  assert.match(softSelect, /class="soft-select-listbox"/)
  assert.match(softSelect, /role="option"/)
  assert.match(softSelect, /document\.addEventListener\('pointerdown'/)
  assert.match(softSelect, /@keydown\.esc/)
  assert.match(softSelect, /ArrowDown/)
  assert.match(softSelect, /:disabled="disabled"/)
})

test('C2W keeps preset details horizontal and gives filter status its intrinsic width', function () {
  assert.match(editor, /grid-template-columns:repeat\(var\(--candidate-columns\),minmax\(0,1fr\)\)/)
  assert.match(editor, /grid-template-columns:minmax\(0,\.9fr\) minmax\(0,1\.25fr\) minmax\(0,\.8fr\)/)
  assert.match(editor, /font:800 12px/)
  assert.match(editor, /font-size:16px/)
  assert.match(editor, /description: preset\.names\.slice\(0, 3\)\.join\(' · '\)/)
  assert.equal((editor.match(/presentation="horizontal"/g) || []).length, 2)
  assert.match(editor, /--candidate-columns:6;--candidate-gap:6px/)
  assert.match(editor, /\.star-loadout-editor\.is-inline\{--candidate-columns:4;--candidate-gap:7px/)
  assert.match(editor, /\.star-hide\{display:flex!important;grid-column:span 1;align-items:center;justify-self:end/)
  assert.match(editor, /--usage-width:calc\(\(100% - \(var\(--candidate-columns\) - 1\) \* var\(--candidate-gap\)\) \/ var\(--candidate-columns\)\)/)
  assert.match(editor, /grid-template-columns:var\(--usage-width\) minmax\(0,1fr\) max-content max-content/)
  assert.match(editor, /overflow-y:auto;scrollbar-gutter:stable/)
  assert.match(editor, /\.star-candidate-scroll\{scrollbar-gutter:stable\}/)
  assert.match(editor, /\.star-filter-row>label:first-child,\.star-query,\.star-active-slot,\.star-hide\{grid-column:auto\}/)
  assert.match(editor, /\.star-filter-row\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/)
  assert.match(softSelect, /presentation: \{ type: String, default: 'stacked' \}/)
  assert.match(softSelect, /\.soft-select\.is-horizontal \.soft-select-trigger,\.soft-select\.is-horizontal \.soft-select-option\{display:flex;align-items:center;gap:10px\}/)
})

test('C2S visual states avoid group and replacement outlines while preserving quality color', function () {
  assert.match(editor, /\.star-loadout-editor\.is-inline\{--candidate-columns:4;--candidate-gap:7px;background:transparent\}/)
  assert.doesNotMatch(editor, /--query-span/)
  assert.doesNotMatch(editor, /\.star-slot-group\.active\{[^}]*border/)
  assert.doesNotMatch(editor, /\.star-loadout-slot\.replacement\{[^}]*outline/)
  assert.match(editor, /star-replacement-mark/)
  assert.match(editor, /\.quality-orange\{background:#fff1e3\}/)
  assert.match(editor, /\.quality-purple\{background:#f4edfa\}/)
  assert.match(editor, /\.quality-blue\{background:#eef4fa\}/)
  assert.match(editor, /\.quality-green\{background:#f0f5ec\}/)
  assert.match(editor, /\.star-candidate\.disabled\{cursor:not-allowed;opacity:\.5\}/)
})

test('preset manager is compact, validates canonical inputs and keeps cloud failures open', function () {
  assert.doesNotMatch(manager, /暂无\{\{ kind\.label \}\}/)
  assert.match(manager, /天府 武曲 天机/)
  assert.match(manager, /解神 文曲 天魁/)
  assert.match(manager, /await props\.saveHandler\(next\)/)
  assert.match(manager, /draft and modal stay intact/)
  assert.doesNotMatch(manager, /min-height:[^;}]*(500|600|700)px/)
  assert.match(manager, /grid-template-columns:1fr;gap:18px/)
})

test('external modal auto-saves only on dirty close and both editors stay 760px', function () {
  assert.match(modal, /request-close/)
  assert.doesNotMatch(modal, /保存装配/)
  assert.match(modal, /width:min\(760px,100%\)/)
  assert.match(modal, /height:100dvh/)
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
  assert.match(page, /:disabled="[\s\S]*?editing \|\|[\s\S]*?starLoadoutOpen \|\|[\s\S]*?starLoadoutLoading \|\|[\s\S]*?starLoadoutSaving/)
  assert.match(page, /getCurrentStarState\(targetAccount\), getCurrentStarLoadout\(targetAccount\)/)
  assert.match(page, /const targetAccount = accountId\.value;[\s\S]*?\+\+starLoadoutLoadSeq;[\s\S]*?readStarLoadoutPair\(targetAccount\)[\s\S]*?accountId\.value !== targetAccount/)
  assert.match(page, /const targetAccount = starLoadoutAccountId\.value;[\s\S]*?accountId\.value !== targetAccount[\s\S]*?putCurrentStarLoadout\(targetAccount,[\s\S]*?expected_generation: targetGeneration[\s\S]*?starLoadoutRevision\.value !== targetRevision/)
})
