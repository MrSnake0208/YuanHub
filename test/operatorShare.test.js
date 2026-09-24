import { installBetaAccessFixture } from '../test-support/betaContractFixture.js'
installBetaAccessFixture()
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
const filterDossier = read('src/components/operator/OperatorFilterDossier.vue')
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
  assert.deepEqual(filterOperatorShareEntries([
    ...entries.slice(0, 2),
    { ...entries[2], growth: { growth_state: 'graduated' } }
  ], '', 'all', 'all', 'graduated').map((entry) => entry.id), ['char_c'])
  assert.deepEqual(filterOperatorShareEntries(entries, '', 'all', 'all'), entries)
  assert.deepEqual(filterOperatorShareEntries(entries, '没有这个', 'all', 'all'), [])
})

test('分享卡片不按养成状态分层，直接按稀有度、等级、化极、属性与实装顺序排序', () => {
  const entries = [
    { id: 'char_003', name: '丙', rarity: 5, prof: ['阴'], growth: { growth_state: 'skip', level: 100, star_level: 31 } },
    { id: 'char_005', name: '戊', rarity: 4, prof: ['阳'], growth: { growth_state: 'active', level: 100, star_level: 31 } },
    { id: 'char_004', name: '丁', rarity: 5, prof: ['阴'], growth: { growth_state: 'active', level: 90, star_level: 27 } },
    { id: 'char_002', name: '乙', rarity: 5, prof: ['阳'], growth: { growth_state: 'graduated', level: 100, star_level: 31 } },
    { id: 'char_001', name: '甲', rarity: 5, prof: ['地'], growth: { growth_state: 'active', level: 90, star_level: 27 } }
  ]
  entries.sort(compareOperatorShareEntries)
  assert.deepEqual(entries.map((entry) => entry.id), ['char_002', 'char_003', 'char_001', 'char_004', 'char_005'])
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

test('只读分享卡片不为未配置的命盘显示添加占位', () => {
  const card = sharePage.match(/<article[\s\S]*?<\/article>/)
  assert.ok(card)
  assert.match(card[0], /v-for="disc in loadoutDiscEntries\(entry, loadout\)"/)
  assert.doesNotMatch(card[0], /class="empty">\+ 命盘/)
})

test('分享页当前不向前端开放 Wiki 攻击生命自动计算', () => {
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
  assert.equal(operatorShareCombatValue(entry, 'attack'), '—')
  assert.equal(operatorShareCombatValue(entry, 'hp'), '—')
  assert.equal(operatorShareCombatSource(entry, 'attack'), '暂无可用面板数据')
  assert.equal(operatorShareCombatSource(entry, 'hp'), '暂无可用面板数据')
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

// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).


// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).

