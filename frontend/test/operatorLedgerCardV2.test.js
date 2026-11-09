import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../test-support/readSource.js'

function read(rel) {
  return readSource(new URL('../' + rel, import.meta.url), 'utf8')
}

const operatorPage = read('src/pages/operator/index.vue')

test('v2 战斗面板沿用紧凑布局，来源优先级由组件行为测试验证', () => {
  assert.match(operatorPage, /ledgerCardIsV2\s+\? cardCombatSimpleValue\(e, kind\)/)
})

test('v2 将等级修为并排，并用有名称的图标按钮压缩快捷操作', () => {
  assert.match(operatorPage, /:aria-label="[\s\S]*?ledgerCardIsV2[\s\S]*?等级：/)
  assert.match(operatorPage, /<CircleAlert[\s\S]*?<ChevronUp[\s\S]*?<span class="sr-only">/)
})

test('v2 将两套命盘分两列展示目录简称，每列最多容纳三条', () => {
  assert.match(operatorPage, /ledgerCardIsV2\s+\? cardDiscAbbreviation\(e, disc\)\s+: disc/)
  assert.match(operatorPage, /function cardDiscAbbreviation\(entry, name\)[\s\S]*?disc\.abbreviation\.trim\(\)[\s\S]*?return abbreviation \|\| name;/)
  assert.match(operatorPage, /v-if="cardLoadoutNeedsPlaceholder\(e, index - 1\)"/)
  assert.match(operatorPage, /function cardLoadoutNeedsPlaceholder\(entry, index\)[\s\S]*?return ledgerCardIsV2 \? count < 3 : count === 0;/)
})

test('v2 化极材料不足时显示缺少数量', () => {
  assert.match(
    operatorPage,
    /<span\s+v-if="!growthMaterialsReady\(e, 'star', 1\)"\s+class="ledger-lack-label"\s+aria-hidden="true"\s*>\{\{\s*growthShortageCount\(e, 'star', 1\) \? '缺' \+ growthShortageCount\(e, 'star', 1\) : growthActionLabel\(e, 'star', 1, '下一节点'\)\s*\}\}<\/span/,
  )
  assert.match(
    operatorPage,
    /function growthActionLabel\([\s\S]*?field === "star"[\s\S]*?const shortage = materials\.find\([\s\S]*?item\.lack > 0/,
  )
})

test('v2 保留 A 浅色回退并支持深色文字，按单个命盘条目应用稀有度', () => {
  assert.match(operatorPage, /cardDiscRarityClass\(e, disc\)/)
  assert.match(operatorPage, /const DISC_RARITY_CLASS = Object\.freeze\(/)
})
