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
  filterOperatorShareEntries,
  mergeOperatorShareEntries,
  operatorShareStarLabel,
  parseOperatorShareToken
} from '../src/utils/operatorShare.js'

function read(rel) {
  return readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
}

const routes = read('src/router/routes.js')
const sharePage = read('src/pages/operator/share.vue')
const operatorPage = read('src/pages/operator/index.vue')
const manager = read('src/components/operator/OperatorShareManager.vue')

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
      { id: 'char_a', name: '甲', alias: '甲将', avatar: '/avatar/a.webp', prof: ['阳'], oddity_schema: { attack: { name: '攻击力', max: 500 } } },
      { id: 'char_b', name: '乙', sub_prof: ['辅助'] }
    ]
  })

  assert.deepEqual(entries.map((entry) => entry.id), ['char_a', 'char_b', 'char_missing'])
  assert.equal(entries[0].name, '甲')
  assert.equal(entries[0].alias, '甲将')
  assert.equal(entries[0].avatar, '/avatar/a.webp')
  assert.deepEqual(entries[0].prof, ['阳'])
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

test('化极文案区分普通密探、SP 密探与觉醒', () => {
  assert.equal(operatorShareStarLabel(27, false), '5 星 · 2 节点')
  assert.equal(operatorShareStarLabel(3, true), '3 星')
  assert.equal(operatorShareStarLabel(31, false), '觉醒')
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

test('分享页概览完整复刻 ledger 只读区块并提供键盘可访问的筛选与详情弹窗', () => {
  const card = sharePage.match(/<article[\s\S]*?<\/article>/)
  assert.ok(card)
  assert.match(card[0], /tabindex="0"/)
  assert.match(card[0], /role="button"/)
  assert.match(card[0], /@click="openDetail\(entry, \$event\)"/)
  assert.match(card[0], /@keydown\.enter\.prevent="openDetail\(entry, \$event\)"/)
  assert.match(card[0], /@keydown\.space\.prevent="openDetail\(entry, \$event\)"/)
  assert.match(card[0], /class="ledger-combat" aria-label="战斗面板与奇闻属性"/)
  assert.match(card[0], /v-for="kind in \['attack', 'hp'\]"/)
  assert.match(card[0], /<Swords v-if="kind === 'attack'"/)
  assert.match(card[0], /<Heart v-else/)
  assert.match(card[0], /<ButterflyIcon class="ledger-oddity-icon"/)
  assert.match(card[0], /class="ledger-oddity"/)
  assert.match(card[0], /oddityValue\(entry, kind\)/)
  assert.match(card[0], /class="ledger-growth share-ledger-growth" aria-label="核心养成"/)
  assert.match(card[0], /class="ledger-destiny" aria-label="双命盘"/)
  assert.match(card[0], /v-for="\(loadout, index\) in loadouts\(entry\)"/)
  assert.match(card[0], /class="ledger-stones" aria-label="已装备星石"/)
  assert.match(card[0], /starStoneSlots\(entry\)/)
  assert.match(sharePage, /const STONE_SLOT_TYPES = \['main1', 'main2', 'main3', 'assist1', 'assist2', 'assist3'\]/)
  assert.match(sharePage, /const typed = source\.some\(function \(stone\) \{ return stone && stone\.type \}\)/)
  assert.doesNotMatch(card[0], /ledger-favorite|ledger-status-menu|ledger-card-footer|<input\b|<textarea\b|<button\b|保存|取消|完整编辑|导入|导出|关注|状态下拉/)

  assert.match(sharePage, /v-for="entry in filteredEntries"/)
  assert.match(sharePage, /<div v-else class="current-ledger share-ledger">/)
  assert.match(card[0], /class="operator-card agent-ledger-card"/)
  assert.match(card[0], /class="ledger-card-head"/)
  assert.match(card[0], /class="ledger-combat"/)
  assert.match(card[0], /class="ledger-growth share-ledger-growth"/)
  assert.match(sharePage, /v-model="searchQuery"/)
  assert.match(sharePage, /v-model="profFilter"/)
  assert.match(sharePage, /v-model="subProfFilter"/)
  assert.match(sharePage, /filterOperatorShareEntries\(entries\.value, searchQuery\.value, profFilter\.value, subProfFilter\.value\)/)
  assert.match(sharePage, /AGENT_PROFS/)
  assert.match(sharePage, /deriveSubProfOptions\(entries\.value\)/)
  assert.match(sharePage, /\.operator-grid \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); gap: 14px \}/)
  assert.match(sharePage, /\.share-ledger \{[^\n]*background: linear-gradient\(145deg, var\(--tea\), var\(--tea-deep\)\)/)
  assert.match(sharePage, /\.agent-ledger-card \{ --ledger-rarity-accent:/)
  assert.match(sharePage, /@media \(max-width: 920px\) \{\s+\.operator-grid \{ grid-template-columns: 1fr \}/)

  assert.match(sharePage, /role="dialog"/)
  assert.match(sharePage, /@click\.self="closeDetail"/)
  assert.match(sharePage, /@keydown\.esc\.prevent="closeDetail"/)
  assert.match(sharePage, /ref="detailCloseButton"/)
  assert.match(sharePage, /event\.key !== 'Escape'/)
  assert.match(sharePage, /detailCloseButton\.value\.focus\(\)/)
  assert.match(sharePage, /document\.contains\(trigger\)/)
  assert.match(sharePage, /trigger\.focus\(\)/)
  assert.match(sharePage, /watch\(function \(\) \{ return route\.params\.token \}, function \(\) \{\s+clearFilters\(\)\s+loadShare\(\)/)
  assert.match(sharePage, /<h3>奇闻<\/h3>[\s\S]*<h3>双命盘<\/h3>[\s\S]*<h3>已装备星石<\/h3>/)
  assert.match(sharePage, /\.share-detail-scroll[^\n]*overflow-y: auto/)
})

test('当前子账号工作区提供分享管理，账号切换会使旧请求失效', () => {
  assert.match(operatorPage, /<OperatorShareManager[\s\S]*v-if="auth\.isLoggedIn && accountId"[\s\S]*:account-id="accountId"/)
  assert.match(manager, /watch\(function \(\) \{ return props\.accountId \}, loadShare, \{ immediate: true, flush: 'sync' \}\)/)
  assert.match(manager, /props\.accountId === accountId && seq === requestSeq/)
  assert.equal((manager.match(/const seq = requestSeq\s+const ok = await dialog\.confirm/g) || []).length, 2)
  assert.equal((manager.match(/ok && current\(accountId, seq\)/g) || []).length, 2)
  assert.match(manager, /window\.location\.origin \+ '\/operator\/share\/'/)
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
