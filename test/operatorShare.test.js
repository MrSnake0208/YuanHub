import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createOperatorShare,
  getOperatorShare,
  regenerateOperatorShare,
  revokeOperatorShare,
  viewOperatorShare
} from '../src/api/operator.js'
import {
  compareOperatorShareEntries,
  filterOperatorShareEntries,
  mergeOperatorShareEntries,
  operatorShareCombatSource,
  operatorShareCombatValue,
  operatorShareEliteComplete,
  operatorShareLevelComplete,
  operatorShareStarCompleteLabel,
  operatorShareStarLabel,
  parseOperatorShareToken
} from '../src/utils/operatorShare.js'

function read(rel) {
  return readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
}

const routes = read('src/router/routes.js')
const sharePage = read('src/pages/operator/share.vue')
const operatorPage = read('src/pages/operator/index.vue')
const sharedLedgerStyles = read('src/styles/operator-ledger-card.v1.css')
const ledgerV2Styles = read('src/styles/operator-ledger-card.v2.css')
const ledgerVersionConfig = read('src/config/operatorLedgerCard.js')
const manager = read('src/components/operator/OperatorShareManager.vue')
const sidebar = read('src/components/IslandSidebar.vue')

test('神秘代码输入同时支持原始代码和完整链接', () => {
  const token = '550e8400-e29b-41d4-a716-446655440000'
  assert.equal(parseOperatorShareToken(token), token)
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/share/' + token + '?from=copy#box'), token)
  assert.equal(parseOperatorShareToken('/operator/share/' + token), token)
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/not-share/' + token), '')
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/share/bad%20token'), '')
  assert.equal(parseOperatorShareToken('https://yuan.example/operator/share/%'), '')
  assert.equal(parseOperatorShareToken(''), '')
  assert.equal(parseOperatorShareToken('bad token'), '')
})

test('匿名 entries 按公共密探 ID 合并图鉴字段并保留 snake_case 养成数据', () => {
  const entries = mergeOperatorShareEntries({
    entries: {
      char_b: { level: 80, star_level: 21 },
      char_a: { level: 90, star_level: 27 },
      char_missing: { level: 70, star_level: 15 }
    }
  }, {
    operators: [
      { id: 'char_a', name: '甲', alias: '甲将', avatar: '/avatar/a.webp', prof: ['阳'], discs: [{ ot_name: '命盘甲', desp: '命盘说明' }], oddity_schema: { attack: { name: '攻击力', max: 500 } } },
      { id: 'char_b', name: '乙', sub_prof: ['辅助'] }
    ]
  })

  assert.deepEqual(entries.map((entry) => entry.id), ['char_a', 'char_b', 'char_missing'])
  assert.equal(entries[0].name, '甲')
  assert.equal(entries[0].alias, '甲将')
  assert.equal(entries[0].avatar, '/avatar/a.webp')
  assert.deepEqual(entries[0].prof, ['阳'])
  assert.equal(entries[0].discs[0].desp, '命盘说明')
  assert.equal(entries[0].oddity_schema.attack.max, 500)
  assert.equal(entries[0].growth.star_level, 27)
  assert.equal(entries[2].name, '未知密探')
  assert.notEqual(entries[2].name, entries[2].id)
})

test('分享条目筛选支持名称、别名、ID及属性职业 AND 组合并保留顺序', () => {
  const entries = [
    { id: 'char_a', name: '甲', alias: 'Alpha', prof: ['阳'], sub_prof: ['shenji'] },
    { id: 'char_b', name: '乙', alias: 'Bravo', prof: '阳', sub_prof: 'pojun' },
    { id: 'char_c', name: '丙', alias: '', prof: '阴', sub_prof: 'shenji' }
  ]

  assert.deepEqual(filterOperatorShareEntries(entries, 'alpha', 'all', 'all').map((entry) => entry.id), ['char_a'])
  assert.deepEqual(filterOperatorShareEntries(entries, 'char_c', 'all', 'all').map((entry) => entry.id), ['char_c'])
  assert.deepEqual(filterOperatorShareEntries(entries, '', '阳', '破军').map((entry) => entry.id), ['char_b'])
  assert.deepEqual(filterOperatorShareEntries(entries, '', '阳', '神纪').map((entry) => entry.id), ['char_a'])
  assert.deepEqual(filterOperatorShareEntries(entries, '', 'all', 'all'), entries)
  assert.deepEqual(filterOperatorShareEntries(entries, '没有这个', 'all', 'all'), [])
})

test('分享卡片按当前养成的状态、稀有度、等级、化极、属性与实装顺序排序', () => {
  const entries = [
    { id: 'char_003', name: '丙', rarity: 5, prof: ['阴'], growth: { growth_state: 'skip', level: 100, star_level: 31 } },
    { id: 'char_005', name: '戊', rarity: 4, prof: ['阳'], growth: { growth_state: 'active', level: 100, star_level: 31 } },
    { id: 'char_004', name: '丁', rarity: 5, prof: ['阴'], growth: { growth_state: 'active', level: 90, star_level: 27 } },
    { id: 'char_002', name: '乙', rarity: 5, prof: ['阳'], growth: { growth_state: 'graduated', level: 100, star_level: 31 } },
    { id: 'char_001', name: '甲', rarity: 5, prof: ['地'], growth: { growth_state: 'active', level: 90, star_level: 27 } }
  ]
  entries.sort(compareOperatorShareEntries)
  assert.deepEqual(entries.map((entry) => entry.id), ['char_001', 'char_004', 'char_005', 'char_002', 'char_003'])
})

test('化极文案区分普通密探、SP 密探与觉醒', () => {
  assert.equal(operatorShareStarLabel(27, false), '5 星 · 2 节点')
  assert.equal(operatorShareStarLabel(3, true), '3 星')
  assert.equal(operatorShareStarLabel(31, false), '觉醒')
})

test('分享养成完成态保留数值并单独判断已满级和已觉醒标签', () => {
  assert.equal(operatorShareLevelComplete(99), false)
  assert.equal(operatorShareLevelComplete(100), true)
  assert.equal(operatorShareEliteComplete(90, 14), false)
  assert.equal(operatorShareEliteComplete(90, 15), true)
  assert.equal(operatorShareEliteComplete(100, 17), true)
  assert.equal(operatorShareStarLabel(31, false), '觉醒')
  assert.equal(operatorShareStarCompleteLabel(31, false), '已觉醒')
  assert.equal(operatorShareStarCompleteLabel(5, true), '')
})

test('分享页攻击生命复用当前养成 Wiki 自动计算', () => {
  const entry = {
    name: '杨修',
    oddity_schema: {
      attack: { name: '攻击力', max: 500 },
      hp: { name: '生命值', max: 2600 },
      special: { name: '增伤值', max: 15 }
    },
    growth: {
      level: 100,
      elite: 17,
      star_level: 3,
      star_stones: [],
      combat_stats: {
        oddities: {
          attack: { current: 10 },
          hp: { current: 20 },
          special: { current: 0 }
        }
      }
    }
  }
  assert.notEqual(operatorShareCombatValue(entry, 'attack'), '—')
  assert.notEqual(operatorShareCombatValue(entry, 'hp'), '—')
  assert.equal(operatorShareCombatSource(entry, 'attack'), '自动计算')
  assert.equal(operatorShareCombatSource(entry, 'hp'), '自动计算')
})

test('分享 API 方法、路径、参数与认证边界符合固定契约', async () => {
  const previousFetch = globalThis.fetch
  const { auth } = await import('../src/store/auth.js')
  const previousToken = auth.accessToken
  const calls = []
  auth.accessToken = 'share-test-token'
  globalThis.fetch = async function (url, options) {
    calls.push({ url: String(url), options: options || {} })
    return new Response(JSON.stringify({ status_code: 200, data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    await getOperatorShare('acc one')
    await createOperatorShare('acc one')
    await regenerateOperatorShare('acc one')
    await revokeOperatorShare('acc one')
    await viewOperatorShare('code/one')
  } finally {
    globalThis.fetch = previousFetch
    auth.accessToken = previousToken
  }

  assert.deepEqual(calls.map(function (call) { return [call.options.method, call.url] }), [
    ['GET', '/v1/operator/share?account_id=acc+one'],
    ['PUT', '/v1/operator/share?account_id=acc+one'],
    ['POST', '/v1/operator/share/regenerate?account_id=acc+one'],
    ['DELETE', '/v1/operator/share?account_id=acc+one'],
    ['GET', '/v1/operator/share/view/code%2Fone']
  ])
  calls.slice(0, 4).forEach(function (call) {
    assert.equal(call.options.headers.Authorization, 'Bearer share-test-token')
  })
  assert.equal(calls[4].options.headers.Authorization, undefined)
})

test('公开分享路由懒加载且不要求登录', () => {
  const route = routes.match(/\{\s*path: '\/operator\/share\/:token\?'[\s\S]*?\n\s*\},/)
  assert.ok(route)
  assert.match(route[0], /component: \(\) => import\('\/src\/pages\/operator\/share\.vue'\)/)
  assert.doesNotMatch(route[0], /requiresAuth/)
})

test('匿名页仅读：只请求匿名数据和公共图鉴，不引入写操作', () => {
  assert.match(sharePage, /Promise\.all\(\[\s*viewOperatorShare\(token\),\s*getOperatorCatalog\(\)/)
  assert.match(sharePage, /status\.value = err && \(err\.status === 404 \|\| err\.code === 'share_not_found'\)/)
  assert.match(sharePage, /status\.value = entries\.value\.length \? 'ready' : 'empty'/)
  assert.doesNotMatch(sharePage, /getOperatorCurrent|patchOperatorCurrent|importOperator|exportOperator|putOperatorAnnotation|GrowthTarget/)
  assert.doesNotMatch(sharePage, /localStorage|sessionStorage|navigator\.clipboard|method:\s*['"](?:POST|PUT|PATCH|DELETE)/)
  assert.doesNotMatch(sharePage, /<code>\s*\{\{\s*entry\.id\s*\}\}\s*<\/code>/)
})

test('分享页概览使用 v2 只读卡片，不提供点击详情弹窗', () => {
  const card = sharePage.match(/<article[\s\S]*?<\/article>/)
  assert.ok(card)
  assert.match(card[0], /class="operator-card agent-ledger-card agent-ledger-card--share"/)
  assert.match(card[0], /role="listitem"/)
  assert.doesNotMatch(card[0], /tabindex="0"|role="button"|openDetail|@click=/)
  assert.doesNotMatch(card[0], /rarity-r|class="rarity"|entry\.rarity|ledger-step-actions|ledger-smart-action|ledger-next-action/)
  assert.doesNotMatch(card[0], /operatorShareLevelComplete|operatorShareEliteComplete|已满级/)
  assert.match(card[0], /<span class="ledger-status-button share-ledger-status"/)
  assert.doesNotMatch(card[0], /<strong v-if="entry\.rarity" class="rarity"/)
  assert.match(card[0], /class="ledger-combat" aria-label="战斗面板与奇闻属性"/)
  assert.match(card[0], /class="stat-icon"/)
  assert.match(card[0], /v-for="kind in \['attack', 'hp'\]"/)
  assert.match(card[0], /<Swords v-if="kind === 'attack'"/)
  assert.match(card[0], /<Heart v-else/)
  assert.match(card[0], /<ButterflyIcon class="ledger-oddity-icon"/)
  assert.match(card[0], /class="ledger-oddity"/)
  assert.match(card[0], /oddityValue\(entry, kind\)/)
  assert.match(card[0], /class="ledger-growth share-ledger-growth" aria-label="核心养成"/)
  assert.match(card[0], /<Star :size="12" fill="currentColor" aria-hidden="true" \/>/)
  assert.match(card[0], /starCardNumber\(entry\.growth\.star_level, entry\.sp_of\)/)
  assert.match(operatorPage, /from "\.\.\/\.\.\/utils\/operatorStarDisplay\.js"/)
  assert.match(sharePage, /from '\.\.\/\.\.\/utils\/operatorStarDisplay\.js'/)
  assert.match(card[0], /class="ledger-destiny fate-trait-style-a" aria-label="双命盘"/)
  assert.match(card[0], /v-for="\(loadout, index\) in loadouts\(entry\)"/)
  assert.match(card[0], /loadoutDiscEntries\(entry, loadout\)/)
  assert.match(card[0], /discRarityClass\(disc\)/)
  assert.match(card[0], /@mouseenter\.stop="showDiscTooltip\(\$event, disc\.description\)"/)
  assert.match(sharePage, /class="disc-floating-tooltip"/)
  assert.match(sharePage, /window\.addEventListener\('scroll', hideDiscTooltip, true\)/)
  assert.match(card[0], /class="ledger-stones" aria-label="已装备星石"/)
  assert.match(card[0], /starStoneSlots\(entry\)/)
  assert.match(sharePage, /const STONE_SLOT_TYPES = \['main1', 'main2', 'main3', 'assist1', 'assist2', 'assist3'\]/)
  assert.match(sharePage, /const typed = source\.some\(function \(stone\) \{ return stone && stone\.type \}\)/)
  assert.doesNotMatch(card[0], /ledger-favorite|ledger-status-menu|ledger-card-footer|<input\b|<textarea\b|<button\b|保存|取消|完整编辑|导入|导出|关注|状态下拉/)

  assert.match(sharePage, /v-for="entry in filteredEntries"/)
  assert.match(sharePage, /<div v-else class="current-ledger share-ledger">/)
  assert.match(card[0], /class="operator-card agent-ledger-card agent-ledger-card--share"/)
  assert.match(card[0], /class="ledger-card-head"/)
  assert.match(card[0], /'status-' \+ shareStatusClass\(entry\)/)
  assert.match(card[0], /shareStatusLabel\(entry\)/)
  assert.match(card[0], /class="ledger-combat"/)
  assert.match(card[0], /class="ledger-growth share-ledger-growth"/)
  assert.match(sharePage, /v-model="searchQuery"/)
  assert.match(sharePage, /v-model="profFilter"/)
  assert.match(sharePage, /v-model="subProfFilter"/)
  assert.match(sharePage, /filterOperatorShareEntries\(entries\.value, searchQuery\.value, profFilter\.value, subProfFilter\.value\)/)
  assert.match(sharePage, /AGENT_PROFS/)
  assert.match(sharePage, /deriveSubProfOptions\(entries\.value\)/)
  assert.match(sharePage, /\.share-ledger \{[^\n]*background: linear-gradient\(145deg, var\(--tea\), var\(--tea-deep\)\)/)
  assert.match(sharePage, /<style scoped src="\.\.\/\.\.\/styles\/operator-ledger-card\.v1\.css"><\/style>/)
  assert.match(sharePage, /<style scoped src="\.\.\/\.\.\/styles\/operator-ledger-card\.v2\.css"><\/style>/)
  assert.match(operatorPage, /<style scoped src="\.\.\/\.\.\/styles\/operator-ledger-card\.v1\.css"><\/style>/)
  assert.match(operatorPage, /<style scoped src="\.\.\/\.\.\/styles\/operator-ledger-card\.v2\.css"><\/style>/)
  assert.match(operatorPage, /ledgerCardVersionClass/)
  assert.match(sharePage, /ledgerCardVersionClass/)
  assert.match(ledgerVersionConfig, /ACTIVE_OPERATOR_LEDGER_CARD_VERSION = OPERATOR_LEDGER_CARD_VERSIONS\.V2/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card:is\(\.agent-ledger-card--editable, \.agent-ledger-card--share\)\.agent-ledger-card--v2/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.stat-icon \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.stat-icon svg \{\s*display: block;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-stat \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 14px max-content minmax\(0, 1fr\);[\s\S]*?column-gap: 8px;[\s\S]*?padding: 6px 7px;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-head \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;[\s\S]*?width: 14px;[\s\S]*?justify-content: center;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-head > \.stat-icon,[\s\S]*?\.ledger-oddity > \.stat-icon \{\s*align-self: center;\s*\}/)
  assert.doesNotMatch(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-head > \.stat-icon,[^{]*\{[^}]*transform:/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-oddity \{\s*display: contents;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-oddity > \.stat-icon \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 2;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-oddity > span:last-child \{[\s\S]*?grid-column: 3;[\s\S]*?grid-row: 2;[\s\S]*?justify-self: center;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-value \{[\s\S]*?line-height: 1;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-value \{[\s\S]*?grid-column: 3;[\s\S]*?grid-row: 1;[\s\S]*?display: flex;[\s\S]*?justify-content: center;/)
  assert.match(ledgerV2Styles, /\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-value \{[\s\S]*?border-bottom: 0;/)
  assert.match(ledgerV2Styles, /@media \(max-width: 640px\)[\s\S]*?\.agent-ledger-card--share\.agent-ledger-card--v2 \.ledger-combat-stat \{\s*padding: 8px;/)
  assert.match(sharedLedgerStyles, /\.agent-ledger-grid \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(sharedLedgerStyles, /\.agent-ledger-card \{[\s\S]*?--ledger-rarity-accent: #99b5cf/)
  assert.match(sharedLedgerStyles, /@media \(max-width: 1080px\)[\s\S]*?\.agent-ledger-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/)
  assert.match(sharedLedgerStyles, /@media \(max-width: 640px\)[\s\S]*?\.agent-ledger-grid \{ grid-template-columns: 1fr; gap: 12px; \}/)
  assert.match(sharedLedgerStyles, /\.ledger-combat \{ display: grid; grid-template-columns: 1fr 1fr; gap: 7px; \}/)
  assert.match(sharedLedgerStyles, /\.ledger-destiny-row em\.empty/)
  assert.match(sharedLedgerStyles, /\.ledger-stones \{[\s\S]*?grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/)

  assert.doesNotMatch(sharePage, /detailEntry|detailCloseButton|openDetail|closeDetail|share-detail-mask|role="dialog"/)
  assert.match(sharePage, /watch\(function \(\) \{ return route\.params\.token \}, function \(\) \{\s+clearFilters\(\)\s+loadShare\(\)/)
})

test('当前子账号工作区提供分享管理，账号切换会使旧请求失效', () => {
  assert.match(operatorPage, /<OperatorShareManager[\s\S]*v-if="auth\.isLoggedIn && accountId"[\s\S]*:account-id="accountId"/)
  assert.match(manager, /watch\(function \(\) \{ return props\.accountId \}, loadShare, \{ immediate: true, flush: 'sync' \}\)/)
  assert.match(manager, /props\.accountId === accountId && seq === requestSeq/)
  assert.equal((manager.match(/const seq = requestSeq\s+const ok = await dialog\.confirm/g) || []).length, 2)
  assert.equal((manager.match(/ok && current\(accountId, seq\)/g) || []).length, 2)
  assert.match(manager, /window\.location\.origin \+ '\/operator\/share\/'/)
  assert.match(manager, /<a class="share-button visit" :href="shareLink">访问我的分享<\/a>/)
  assert.match(operatorPage, /to="\/operator\/share"/)
  assert.match(operatorPage, /查看他人 BOX<\/router-link\s*>/)
  assert.equal((sidebar.match(/!\$route\.path\.startsWith\('\/operator\/share'\)/g) || []).length, 2)
  assert.match(manager, /dialog\.confirm/)
  assert.match(manager, /createOperatorShare|regenerateOperatorShare|revokeOperatorShare/)
  const operationButtons = manager.split('\n').filter(function (line) {
    return line.includes('<button') && line.includes('@click')
  })
  assert.equal(operationButtons.length, 6)
  for (const button of operationButtons) {
    assert.match(button, /:disabled="loading \|\| busy"/)
  }
  assert.match(manager, /const loadRequestSeq = \+\+loadSeq/)
  assert.match(manager, /if \(loadRequestSeq === loadSeq\) loading\.value = false/)
})
