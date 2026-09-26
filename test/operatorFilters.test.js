import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  subProfList,
  canonicalSubProf,
  isOperatorOwned,
  tokens,
  matchesProfSubFilter,
  subProfOptions,
  operatorPinyinTokens,
  matchesOperatorSearch
} from '../src/utils/operatorFilters.js'

const operatorPage = readFileSync(
  new URL('../src/pages/operator/index.vue', import.meta.url),
  'utf8'
)

test('图鉴拥有状态只由 starLevel 决定', function () {
  assert.equal(isOperatorOwned({ level: 100, elite: 17, starLevel: 0 }), false)
  assert.equal(isOperatorOwned({ level: 100, elite: 17, star_level: 0 }), false)
  assert.equal(isOperatorOwned({ level: 0, elite: 0, starLevel: 1 }), true)
  assert.equal(isOperatorOwned({ level: 100 }), false)
  assert.equal(isOperatorOwned(null), false)
})

test('subProfList 兼容字符串 / 数组 / snake_case', function () {
  assert.deepEqual(subProfList({ subProf: '神纪' }), ['神纪'])
  assert.deepEqual(subProfList({ subProf: ['破军', '龙盾'] }), ['破军', '龙盾'])
  assert.deepEqual(subProfList({ sub_prof: '岐黄' }), ['岐黄'])
  assert.deepEqual(subProfList({}), [])
  assert.deepEqual(subProfList(null), [])
  // 多值字符串按 、/，切分
  assert.deepEqual(subProfList({ subProf: '神纪、破军' }), ['神纪', '破军'])
})

test('canonicalSubProf 把后端拼音 code 归一到中文，中文原样透传', function () {
  assert.equal(canonicalSubProf('shenji'), '神纪')
  assert.equal(canonicalSubProf('guidao'), '诡道')
  assert.equal(canonicalSubProf('pojun'), '破军')
  assert.equal(canonicalSubProf('qihuang'), '岐黄')
  assert.equal(canonicalSubProf('longdun'), '龙盾')
  assert.equal(canonicalSubProf('神纪'), '神纪')
  assert.equal(canonicalSubProf('未知code'), '未知code')
  // subProfList 对数组内 code 也归一
  assert.deepEqual(subProfList({ sub_prof: ['shenji', 'pojun'] }), ['神纪', '破军'])
})

test('tokens 按 、/，切分多值并去除空白', function () {
  assert.deepEqual(tokens('阳'), ['阳'])
  assert.deepEqual(tokens('阳、阴，火'), ['阳', '阴', '火'])
  assert.deepEqual(tokens(' 阳 '), ['阳'])
  assert.deepEqual(tokens(null), [])
  assert.deepEqual(tokens(''), [])
})

test('matchesProfSubFilter：all 不过滤，其他按 AND 匹配', function () {
  const op = { prof: '阳', subProf: '神纪' }
  assert.equal(matchesProfSubFilter(op, 'all', 'all'), true)
  assert.equal(matchesProfSubFilter(op, '', ''), true)
  assert.equal(matchesProfSubFilter(op, '阳', 'all'), true)
  assert.equal(matchesProfSubFilter(op, 'all', '神纪'), true)
  assert.equal(matchesProfSubFilter(op, '阳', '神纪'), true)
  assert.equal(matchesProfSubFilter(op, '阴', 'all'), false)
  assert.equal(matchesProfSubFilter(op, 'all', '破军'), false)
  // AND：两者同时满足才通过，任一不满足即不过滤
  assert.equal(matchesProfSubFilter(op, '阳', '破军'), false)
  assert.equal(matchesProfSubFilter(op, '阴', '神纪'), false)
})

test('matchesProfSubFilter 兼容多值 prof 与数组 subProf', function () {
  const multi = { prof: '阳、阴', subProf: ['神纪', '破军'] }
  assert.equal(matchesProfSubFilter(multi, '阴', 'all'), true)
  assert.equal(matchesProfSubFilter(multi, '阳', 'all'), true)
  assert.equal(matchesProfSubFilter(multi, '混沌', 'all'), false)
  assert.equal(matchesProfSubFilter(multi, 'all', '破军'), true)
  assert.equal(matchesProfSubFilter(multi, '阳', '破军'), true)
})

test('无 prof / subProf 字段时按配置的维度过滤', function () {
  const bare = { name: 'xx' }
  // prof 维度被过滤：无 prof 视为不含任何属性
  assert.equal(matchesProfSubFilter(bare, '阳', 'all'), false)
  // 不配置该维度时放行
  assert.equal(matchesProfSubFilter(bare, 'all', 'all'), true)
  assert.equal(matchesProfSubFilter(bare, 'all', '神纪'), false)
})

test('subProfOptions 从目录去重推导并保持出现顺序', function () {
  const ops = [
    { subProf: '神纪' },
    { subProf: ['破军', '龙盾'] },
    { subProf: '神纪' },
    { sub_prof: '岐黄' },
    { subProf: '' },
    { name: '无职业' }
  ]
  assert.deepEqual(subProfOptions(ops), ['神纪', '破军', '龙盾', '岐黄'])
  assert.deepEqual(subProfOptions([]), [])
  assert.deepEqual(subProfOptions(null), [])
})

test('密探搜索兼容中文、完整拼音、空格拼音与首字母缩写', function () {
  const yangxiu = { id: 'char_001_yangxiu', name: '杨修', prof: '阳', subProf: '神纪' }
  const sunshangxiang = { id: 'char_003_sunshangxiang', name: '孙尚香', prof: '火', subProf: '破军' }

  assert.deepEqual(operatorPinyinTokens(yangxiu), ['yangxiu'])
  assert.equal(matchesOperatorSearch(yangxiu, '杨修'), true)
  assert.equal(matchesOperatorSearch(yangxiu, 'yangxiu'), true)
  assert.equal(matchesOperatorSearch(yangxiu, 'yang xiu'), true)
  assert.equal(matchesOperatorSearch(yangxiu, 'yx'), true)
  assert.equal(matchesOperatorSearch(sunshangxiang, 'ssx'), true)
  assert.equal(matchesOperatorSearch(yangxiu, '神纪'), true)
  assert.equal(matchesOperatorSearch(yangxiu, 'zx'), false)
})

test('密探搜索兼容后端显式拼音字段和无目录 id 的记录', function () {
  const entry = { id: 'legacy-zhou-tai', name: '周泰', name_pinyin: 'zhou tai' }
  assert.deepEqual(operatorPinyinTokens(entry), ['zhoutai'])
  assert.equal(matchesOperatorSearch(entry, 'zhoutai'), true)
  assert.equal(matchesOperatorSearch(entry, 'zt'), true)
  assert.equal(matchesOperatorSearch(entry, ''), true)
})

test('密探图鉴在筛选激活时显示筛选后的密探数量', function () {
  assert.match(
    operatorPage,
    /v-if="hasManifestFilters"[\s\S]*?筛选出\s*<b class="bp-num">\{\{\s*manifestEntries\.length\s*\}\}<\/b>\s*位密探/
  )
  assert.match(
    operatorPage,
    /const hasManifestFilters = computed\(function \(\) \{[\s\S]*?rarityFilter\.value !== "all"[\s\S]*?profFilter\.value !== "all"[\s\S]*?subProfFilter\.value !== "all"[\s\S]*?manifestFilter\.value !== "all"[\s\S]*?Boolean\(manifestSearch\.value\.trim\(\)\)/
  )
})
