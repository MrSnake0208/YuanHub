import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(rel) {
  return readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
}

const operatorPage = read('src/pages/operator/index.vue')
const v2Styles = read('src/styles/operator-ledger-card.v2.css')

test('v2 战斗面板移除模式切换与来源说明并优先展示后端最新值', () => {
  assert.match(operatorPage, /<template\s+v-if="!ledgerCardIsV2"\s*>\{\{ kind === "attack" \? "攻击" : "生命" \}\}/)
  assert.match(operatorPage, /v-if="!ledgerCardIsV2"\s+class="ledger-combat-mode"/)
  assert.match(operatorPage, /v-if="!ledgerCardIsV2"\s+class="ledger-combat-source"/)
  assert.match(operatorPage, /ledgerCardIsV2\s+\? cardCombatSimpleValue\(e, kind\)/)
  assert.match(operatorPage, /const latestValue = stats\[kind\]/)
  assert.match(operatorPage, /if \(latestValue != null\) return latestValue/)
  assert.match(operatorPage, /cardCombatEditedKeys\.value = new Set\([\s\S]*?if \(ledgerCardIsV2\) return;/)
})

test('v2 将等级修为并排，并用有名称的图标按钮压缩快捷操作', () => {
  assert.match(operatorPage, /class="agent-ledger-card agent-ledger-card--editable"/)
  assert.match(operatorPage, /:aria-label="[\s\S]*?ledgerCardIsV2[\s\S]*?等级：/)
  assert.match(operatorPage, /<CircleAlert[\s\S]*?<ChevronUp[\s\S]*?<span class="sr-only">/)
  assert.match(v2Styles, /\.ledger-growth \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(v2Styles, /\.ledger-growth-row:nth-child\(3\) \{[\s\S]*?grid-column: 1 \/ -1/)
  assert.match(v2Styles, /\.ledger-step-actions button,[\s\S]*?width: 30px;/)
  assert.match(v2Styles, /@media \(max-width: 640px\)[\s\S]*?width: 30px;/)
})

test('v2 展开并居中战斗面板值，并对齐化极内容且不显示分隔线', () => {
  assert.match(v2Styles, /\.ledger-combat-stat \{[\s\S]*?grid-template-columns: 14px minmax\(0, 1fr\) 34px;/)
  assert.match(v2Styles, /\.ledger-combat-value \{[\s\S]*?grid-column: 2 \/ -1;[\s\S]*?text-align: center;/)
  assert.match(v2Styles, /\.ledger-oddity \{[\s\S]*?grid-template-columns: 14px minmax\(0, 1fr\) 34px;/)
  assert.match(v2Styles, /--ledger-growth-column-gap: 10px;/)
  assert.match(v2Styles, /\.ledger-growth-row:nth-child\(3\) \{[\s\S]*?border-top: 0;/)
  assert.match(v2Styles, /\.ledger-huaji-value > span \{[\s\S]*?height: 14px;[\s\S]*?line-height: 14px;[\s\S]*?transform: translateY\(1px\);/)
  assert.match(v2Styles, /\.ledger-huaji-value > svg \{[\s\S]*?transform: translateY\(1px\);/)
})

test('v2 按指定偏移收紧卡片头部排版', () => {
  assert.match(v2Styles, /\.ledger-card-head \{\s*gap: 20px;/)
  assert.match(v2Styles, /\.ledger-identity \{[\s\S]*?top: -3px;/)
  assert.match(v2Styles, /\.ledger-status-menu \{\s*top: 1px;/)
})

test('v2 将两套命盘分两列展示目录简称，每列最多容纳三条', () => {
  assert.match(operatorPage, /ledgerCardIsV2\s+\? cardDiscAbbreviation\(e, disc\)\s+: disc/)
  assert.match(operatorPage, /function cardDiscAbbreviation\(entry, name\)[\s\S]*?disc\.abbreviation\.trim\(\)[\s\S]*?return abbreviation \|\| name;/)
  assert.match(v2Styles, /\.ledger-destiny \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(v2Styles, /\.ledger-destiny-row > \.ledger-destiny-values \{[\s\S]*?max-height: 80px;[\s\S]*?grid-auto-rows: 24px;/)
  assert.match(v2Styles, /\.ledger-destiny-row em \{[\s\S]*?font-size: 11px;/)
  assert.match(operatorPage, /v-if="cardLoadoutNeedsPlaceholder\(e, index - 1\)"/)
  assert.match(operatorPage, /function cardLoadoutNeedsPlaceholder\(entry, index\)[\s\S]*?return ledgerCardIsV2 \? count < 3 : count === 0;/)
})

test('v2 进一步压缩等级修为化极面板高度', () => {
  assert.match(v2Styles, /\.ledger-growth \{[\s\S]*?row-gap: 4px;[\s\S]*?padding: 5px 7px;/)
  assert.match(v2Styles, /\.ledger-growth-row \{[\s\S]*?min-height: 26px;/)
  assert.match(v2Styles, /\.ledger-inline-field,[\s\S]*?min-height: 26px;/)
  assert.match(v2Styles, /\.ledger-step-actions \{[\s\S]*?width: 26px;[\s\S]*?min-width: 26px;/)
  assert.match(v2Styles, /@media \(max-width: 640px\)[\s\S]*?min-height: 30px;[\s\S]*?width: 30px;/)
})

test('v2 战斗面板上下内边距对称，移动端蝶属性输入保留舒适宽度', () => {
  assert.match(v2Styles, /\.ledger-combat-stat \{[\s\S]*?padding: 6px 7px 9px;/)
  assert.match(v2Styles, /\.ledger-oddity input \{[\s\S]*?min-width: 48px;[\s\S]*?text-align: center;/)
  assert.match(v2Styles, /@media \(max-width: 640px\)[\s\S]*?\.ledger-combat-stat \{[\s\S]*?padding: 8px 8px 11px;/)
  assert.match(v2Styles, /@media \(max-width: 640px\)[\s\S]*?\.ledger-oddity input \{[\s\S]*?min-height: 24px;[\s\S]*?font-size: 12\.5px;/)
  assert.match(v2Styles, /@media \(max-width: 640px\)[\s\S]*?\.ledger-name-row \{\s*gap: 15px;/)
})

test('v2 桌面端给蝶属性行保留更多垂直空间', () => {
  assert.match(v2Styles, /\.ledger-oddity \{[\s\S]*?min-height: 20px;/)
  assert.match(v2Styles, /\.ledger-oddity input \{[\s\S]*?min-height: 20px;/)
})

test('v2 收紧战斗面板与养成面板的垂直间距', () => {
  assert.match(v2Styles, /\.ledger-combat \+ \.ledger-growth \{\s*margin-top: -6\.75px;/)
})

test('v2 固定使用 A 浅底色并按单个命盘条目应用稀有度', () => {
  assert.match(operatorPage, /class="ledger-destiny fate-trait-style-a"/)
  assert.doesNotMatch(operatorPage, /fateTraitStyleToggleVisible|FATE_TRAIT_STYLE_OPTIONS/)
  assert.match(operatorPage, /cardDiscRarityClass\(e, disc\)/)
  assert.match(operatorPage, /const DISC_RARITY_CLASS = Object\.freeze\(/)
  assert.match(v2Styles, /--trait-text: #55483c;/)
  assert.match(v2Styles, /--fate2-trait-text: #4e4752;/)
  assert.match(v2Styles, /--rarity-gold: #b9852d;/)
  assert.match(v2Styles, /--rarity-purple: #8c70a4;/)
  assert.match(v2Styles, /--rarity-blue: #65879f;/)
  assert.match(v2Styles, /\.fate-trait-style-a[\s\S]*em\.rarity-gold[\s\S]*box-shadow: inset 3px 0 0 var\(--rarity-gold\)/)
  assert.match(v2Styles, /\.fate-trait-style-c[\s\S]*em\.rarity-gold[\s\S]*box-shadow: inset 0 -3px 0 var\(--rarity-gold\)/)
  assert.match(v2Styles, /\.ledger-destiny-row:nth-child\(2\)[\s\S]*--fate-series-accent: var\(--fate2-accent\)/)
  assert.match(v2Styles, /\.ledger-destiny-row:nth-child\(2\)[\s\S]*color: var\(--fate2-trait-text\)/)
})
