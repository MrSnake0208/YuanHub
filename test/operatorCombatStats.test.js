import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateOperatorCombatStats,
  combatInputSignature,
  combatStatsSourceLabel,
  fillOperatorDraftToMax,
  fillOperatorOdditiesToMax,
  normalizeOperatorCombatStats,
  normalizeOperatorOddities,
  normalizeOperatorOdditySchema,
  operatorOddityCompletion
} from '../src/utils/operatorCombatStats.js'

const completionKeys = ['attack', 'hp', 'special']
const completionSchema = limits => Object.fromEntries(completionKeys.map((key, index) => [key, { max: limits[index] }]))
const completionValues = values => Object.fromEntries(completionKeys.map((key, index) => [key, { current: values[index], max: 9999 }]))

test('漆园蝶三项按当前公共 schema 判断，不依赖等级、名称或旧 max，保留小数', () => {
  for (const limits of [[300, 1560, 9], [350, 1820, 11], [500, 2600, 15]]) {
    const schema = completionSchema(limits)
    const values = completionValues(limits)
    const original = structuredClone({ values, schema })
    assert.deepEqual(operatorOddityCompletion(values, schema), { status: 'full', reason: '' })
    for (const key of completionKeys) {
      const partial = structuredClone(values)
      partial[key].current -= 0.1
      assert.equal(operatorOddityCompletion(partial, schema).status, 'incomplete')
    }
    assert.deepEqual({ values, schema }, original)
    assert.equal(operatorOddityCompletion(completionValues(limits.map(String)), schema).status, 'full')
    schema.special.max += 1
    assert.equal(operatorOddityCompletion(values, schema).status, 'incomplete')
    schema.special.max = limits[2] - 1
    assert.equal(operatorOddityCompletion(values, schema).status, 'unknown')
  }
  assert.equal(operatorOddityCompletion(completionValues([500, 2600, 14.9]), completionSchema([500, 2600, 15])).status, 'incomplete')
})

test('明确零值与缺失补零不同；三项完整前不判未满', () => {
  const schema = completionSchema([300, 1560, 9])
  assert.equal(operatorOddityCompletion(completionValues([0, 0, 0]), schema).status, 'incomplete')
  assert.equal(operatorOddityCompletion(completionValues([0, 0, 0]), completionSchema([0, 0, 0])).status, 'full')
  const partial = completionValues([0, 0, 0])
  delete partial.special
  assert.deepEqual(operatorOddityCompletion(partial, schema), { status: 'unknown', reason: '第三项尚未记录' })
  partial.special = { max: 9 }
  assert.equal(operatorOddityCompletion(partial, schema).status, 'unknown')
  assert.equal(operatorOddityCompletion({}, schema).status, 'unknown')
})

test('各项非法值、超限或公共上限无效时待确认，不使用记录附带的 max', () => {
  const limits = [300, 1560, 9]
  const invalid = [null, undefined, '', ' ', 'bad', NaN, Infinity, -1, false, true, [], {}]
  for (const key of completionKeys) {
    for (const value of invalid) {
      const values = completionValues(limits)
      values[key].current = value
      assert.equal(operatorOddityCompletion(values, completionSchema(limits)).status, 'unknown', `${key} current ${String(value)}`)
      const schema = completionSchema(limits)
      schema[key].max = value
      assert.equal(operatorOddityCompletion(completionValues(limits), schema).status, 'unknown', `${key} max ${String(value)}`)
    }
    const schema = completionSchema(limits)
    delete schema[key]
    assert.equal(operatorOddityCompletion(completionValues(limits), schema).status, 'unknown')
    const values = completionValues(limits)
    values[key].current += 1
    assert.equal(operatorOddityCompletion(values, completionSchema(limits)).status, 'unknown')
  }
  assert.equal(operatorOddityCompletion(completionValues(limits), null).status, 'unknown')
})

test('一键拉满只把图鉴有上限的奇闻填到上限，保留其他养成字段', function () {
  const draft = {
    level: 20,
    elite: 3,
    starLevel: 8,
    combatStats: { oddities: {
      attack: { current: 10, max: 999 },
      hp: { current: 20, max: 999 },
      special: { current: 5, max: 999 }
    } }
  }
  const missing = fillOperatorDraftToMax(draft, {
    attack: { max: 350 }, hp: { max: 1820 }, special: { max: 11 }
  })
  assert.deepEqual(missing, [])
  assert.deepEqual([draft.level, draft.elite, draft.starLevel], [100, 17, 8])
  assert.deepEqual(['attack', 'hp', 'special'].map(key => draft.combatStats.oddities[key].current), [350, 1820, 11])

  draft.combatStats.oddities.special.current = 7
  assert.deepEqual(fillOperatorDraftToMax(draft, {
    attack: { max: 500 }, hp: { max: 2600 }, special: { max: null }
  }), ['special'])
  assert.equal(draft.combatStats.oddities.special.current, 7)
})

test('仅拉满奇闻遵循各稀有度图鉴上限，保留练度、装备及缺失上限的原值', function () {
  const draft = {
    level: 90, elite: 15, starLevel: 8,
    discLoadouts: [{ id: 'disc_1', discs: [{ ot_name: '测试命盘' }] }],
    stones: { main1: { name: '测试星石', level: 10 } },
    combatStats: { manualAttack: 123, oddities: {
      attack: { current: 10, max: 999 },
      hp: { current: 20, max: 999 },
      special: { current: 7, max: 999 }
    } }
  }
  const original = structuredClone(draft)
  for (const limits of [[300, 1560, 9], [350, 1820, 11], [500, 2600, 15]]) {
    const schema = Object.fromEntries(['attack', 'hp', 'special'].map((key, index) => [key, { max: limits[index] }]))
    assert.deepEqual(fillOperatorOdditiesToMax(draft, schema), [])
    assert.deepEqual(['attack', 'hp', 'special'].map(key => draft.combatStats.oddities[key].current), limits)
    const expected = structuredClone(original)
    for (const [index, key] of ['attack', 'hp', 'special'].entries()) expected.combatStats.oddities[key].current = limits[index]
    assert.deepEqual(draft, expected)
  }
  assert.deepEqual(fillOperatorOdditiesToMax(draft, {
    attack: { max: 0 }, hp: { max: null }, special: { max: -1 }
  }), ['hp', 'special'])
  assert.deepEqual(['attack', 'hp', 'special'].map(key => draft.combatStats.oddities[key].current), [0, 2600, 15])
})

test('兼容根级、stats 和 snake_case 扫描属性', function () {
  assert.deepEqual(normalizeOperatorCombatStats({ attack: 1200, hp: 3400 }), {
    attack: 1200,
    hp: 3400,
    manualAttack: null,
    manualHp: null,
    curios: [],
    oddities: {
      attack: { current: 0, max: null },
      hp: { current: 0, max: null },
      special: { current: 0, max: null }
    },
    source: 'scan',
    observedInputs: null,
    observedAt: '',
    rulesVersion: '',
    version: 2
  })
  const nested = normalizeOperatorCombatStats({ combat_stats: { attack: 100, health: 200, curios: [{ name: '奇闻一', attackFlat: 3, hpFlat: 4 }] } })
  assert.equal(nested.attack, 100)
  assert.equal(nested.hp, 200)
  assert.deepEqual(nested.curios[0], { id: 'curio_1', name: '奇闻一', attack: 3, hp: 4 })
  assert.deepEqual(nested.oddities, {
    attack: { current: 3, max: null },
    hp: { current: 4, max: null },
    special: { current: 0, max: null }
  })
})

test('服务器显示偏好使用稳定枚举，并区分字段缺失', function () {
  const stats = normalizeOperatorCombatStats({
    combat_stats: {
      display_mode: { attack: 'auto', hp: 'manual', ignored: 'bad' }
    }
  })
  assert.equal(stats.displayModePresent, true)
  assert.deepEqual(stats.displayMode, { attack: 'auto', hp: 'manual' })
  const legacy = normalizeOperatorCombatStats({ combat_stats: {} })
  assert.equal(legacy.displayModePresent, undefined)
})

test('旧奇闻名称会迁移到稳定键，上限只信任公共图鉴 schema', function () {
  const schema = {
    attack: { name: '攻击力', max: 350 },
    hp: { name: '生命值', max: 1820 },
    special: { name: '治疗加成', max: 11 }
  }
  assert.deepEqual(normalizeOperatorOddities({
    '攻击力': { current: 0, max: 999 },
    '生命值': { current: 0, max: 9999 },
    '治疗加成': { current: 15, max: 99 },
    '不会保留的第四项': { current: 1, max: 1 }
  }, [], schema), {
    attack: { current: 0, max: 350 },
    hp: { current: 0, max: 1820 },
    special: { current: 15, max: 11 }
  })

  assert.deepEqual(normalizeOperatorOddities({
    '攻击': { current: 12 },
    '生命力': { current: 34 }
  }), {
    attack: { current: 12, max: null },
    hp: { current: 34, max: null },
    special: { current: 0, max: null }
  })
})

test('公共图鉴 schema 保留稳定键，不在前端按稀有度推导上限', function () {
  assert.deepEqual(normalizeOperatorOdditySchema({
    attack: { name: '攻击力', max: 300 },
    hp: { name: '生命值', max: 1560 },
    special: { name: '免伤值', max: 9 }
  }), {
    attack: { name: '攻击力', max: 300 },
    hp: { name: '生命值', max: 1560 },
    special: { name: '免伤值', max: 9 }
  })
  assert.equal(normalizeOperatorOdditySchema().special.max, null)

  const backendSchemas = [
    [300, 1560, 9],
    [350, 1820, 11],
    [500, 2600, 15]
  ]
  backendSchemas.forEach(function (limits) {
    const normalized = normalizeOperatorOdditySchema({
      attack: { max: limits[0] },
      hp: { max: limits[1] },
      special: { name: '第三属性（图鉴待维护）', max: limits[2] }
    })
    assert.deepEqual([normalized.attack.max, normalized.hp.max, normalized.special.max], limits)
    assert.equal(normalized.special.name, '第三属性（图鉴待维护）')
  })
})

test('等级、星级、星石和奇闻变化会改变计算输入指纹', function () {
  const base = {
    level: 100,
    elite: 17,
    starLevel: 31,
    stones: { main1: { name: '天府', level: 60 } },
    oddities: {
      attack: { current: 0, max: 500 },
      hp: { current: 0, max: 2600 },
      special: { current: 0, max: 15 }
    }
  }
  assert.notEqual(combatInputSignature(base), combatInputSignature(Object.assign({}, base, { level: 99 })))
  assert.notEqual(combatInputSignature(base), combatInputSignature(Object.assign({}, base, {
    oddities: Object.assign({}, base.oddities, { attack: { current: 1, max: 500 } })
  })))
  assert.notEqual(combatInputSignature(base), combatInputSignature(Object.assign({}, base, {
    oddities: Object.assign({}, base.oddities, { special: { current: 1, max: 15 } })
  })))
})

test('第三奇闻改名不会让已采集面板失效', function () {
  const values = { attack: { current: 1 }, hp: { current: 2 }, special: { current: 3 } }
  const before = normalizeOperatorOddities(values, [], { special: { name: '免伤值', max: 15 } })
  const after = normalizeOperatorOddities(values, [], { special: { name: '增伤值', max: 15 } })
  assert.equal(combatInputSignature({ oddities: before }), combatInputSignature({ oddities: after }))
})

test('没有正式规则时保留扫描值并标记为待重算，不伪造数值', function () {
  const stats = calculateOperatorCombatStats({
    stored: { attack: 1200, hp: 3400, observedInputs: { signature: 'old' } },
    input: { level: 100 }
  })
  assert.equal(stats.attack, 1200)
  assert.equal(stats.hp, 3400)
  assert.equal(stats.status, 'stale')
  assert.equal(combatStatsSourceLabel(stats.source, stats.status), '扫描值待重算')
})

test('接入计算器后返回自动计算结果', function () {
  const stats = calculateOperatorCombatStats({
    stored: {},
    input: { level: 100 },
    calculator: function ({ input }) { return { attack: input.level * 10, hp: input.level * 20 } }
  })
  assert.equal(stats.attack, 1000)
  assert.equal(stats.hp, 2000)
  assert.equal(stats.status, 'calculated')
})

test('使用 Wiki 规则根据等级、修为、化极、星石和奇闻自动计算', function () {
  const stats = calculateOperatorCombatStats({
    stored: {},
    input: {
      operatorName: '杨修',
      level: 100,
      elite: 17,
      starLevel: 31,
      stones: {
        main1: { name: '太阳', level: 60 },
        main2: { name: '武曲', level: 60 },
        main3: { name: '天府', level: 60 }
      },
      oddities: {
        attack: { current: 10, max: 500 },
        hp: { current: 20, max: 2600 },
        special: { current: 15, max: 15 }
      }
    }
  })
  assert.equal(stats.status, 'calculated')
  assert.ok(stats.attack > 0)
  assert.ok(stats.hp > 0)
  assert.ok(stats.breakdown.curiosAttack === 10)
  assert.ok(stats.breakdown.curiosHp === 20)
})

test('职业或特殊奇闻属性不会误计入攻击力和生命值', function () {
  const base = calculateOperatorCombatStats({
    stored: {},
    input: {
      operatorName: '杨修',
      level: 100,
      elite: 17,
      starLevel: 0,
      oddities: {
        attack: { current: 10, max: 500 },
        hp: { current: 20, max: 2600 },
        special: { current: 0, max: 15 }
      }
    }
  })
  const changedThirdStat = calculateOperatorCombatStats({
    stored: {},
    input: {
      operatorName: '杨修',
      level: 100,
      elite: 17,
      starLevel: 0,
      oddities: {
        attack: { current: 10, max: 500 },
        hp: { current: 20, max: 2600 },
        special: { current: 15, max: 15 }
      }
    }
  })
  assert.equal(changedThirdStat.attack, base.attack)
  assert.equal(changedThirdStat.hp, base.hp)
})

test('旧 curios 攻生命字段仍可参与计算', function () {
  const stats = calculateOperatorCombatStats({
    stored: {},
    input: {
      operatorName: '杨修',
      level: 100,
      elite: 17,
      starLevel: 0,
      curios: [{ name: '旧奇闻', attack: 10, hp: 20 }]
    }
  })
  assert.equal(stats.breakdown.curiosAttack, 10)
  assert.equal(stats.breakdown.curiosHp, 20)
})

test('手动覆盖值优先于规则计算，可清空恢复自动计算', function () {
  const stats = calculateOperatorCombatStats({
    stored: { manualAttack: 1234, manualHp: 5678 },
    input: { operatorName: '杨修', level: 100, elite: 17, starLevel: 31 }
  })
  assert.equal(stats.attack, 1234)
  assert.equal(stats.hp, 5678)
  assert.equal(stats.status, 'manual')
  assert.equal(combatStatsSourceLabel(stats.source, stats.status), '手动修正')
})

test('手动覆盖值仍在当前输入生效时，提供自动计算切换提示', function () {
  const input = { operatorName: '杨修', level: 100, elite: 17, starLevel: 31 }
  const signature = combatInputSignature(input)
  const stats = calculateOperatorCombatStats({
    stored: {
      manualAttack: 9999,
      manualHp: 8888,
      observedInputs: { signature: signature },
      observedStatus: 'valid'
    },
    input: input
  })
  assert.equal(stats.status, 'manual')
  assert.equal(stats.automaticResultAvailable, true)
  assert.notEqual(stats.automaticAttack, 9999)
  assert.notEqual(stats.automaticHp, 8888)
  assert.equal(stats.manualFallbackAvailable, false)
})

test('养成输入变化后自动计算优先，并保留手动值回退入口', function () {
  const input = { operatorName: '杨修', level: 100, elite: 17, starLevel: 31 }
  const signature = combatInputSignature(input)
  const stats = calculateOperatorCombatStats({
    stored: {
      attack: 1200,
      hp: 3400,
      manualAttack: 9999,
      manualHp: 8888,
      observedInputs: { signature: signature },
      observedStatus: 'valid'
    },
    input: Object.assign({}, input, { level: 90, elite: 15 })
  })
  assert.equal(stats.status, 'calculated')
  assert.notEqual(stats.attack, 9999)
  assert.notEqual(stats.hp, 8888)
  assert.equal(stats.manualFallbackAvailable, true)
})

test('Wiki 修为阶段与化极节点按原页面顺序计入攻生命', function () {
  const wikiDefault = calculateOperatorCombatStats({
    stored: {},
    input: { operatorName: '庞德', level: 90, elite: 15, starLevel: 7 }
  })
  assert.equal(wikiDefault.attack, 5447.0999)
  assert.equal(wikiDefault.hp, 18381.3003)

  const tierTwo = calculateOperatorCombatStats({
    stored: {},
    input: { operatorName: '杨修', level: 60, elite: 9, starLevel: 0 }
  })
  assert.equal(tierTwo.attack, 1798.435)
  assert.equal(tierTwo.hp, 10698.45)

  const promotion = calculateOperatorCombatStats({
    stored: {},
    input: { operatorName: '杨修', level: 100, elite: 17, starLevel: 3 }
  })
  assert.equal(promotion.breakdown.promotionAttack, 23)
  assert.equal(promotion.breakdown.promotionHp, 115)
})

test('星石等级使用 Wiki 突破槽位，11级会跳过10级突破项', function () {
  const levelTen = calculateOperatorCombatStats({
    stored: {},
    input: { operatorName: '杨修', level: 100, elite: 17, starLevel: 0, stones: { main1: { name: '太阳', level: 10 } } }
  })
  const levelEleven = calculateOperatorCombatStats({
    stored: {},
    input: { operatorName: '杨修', level: 100, elite: 17, starLevel: 0, stones: { main1: { name: '太阳', level: 11 } } }
  })
  assert.equal(levelTen.breakdown.stoneAttack, 46)
  assert.equal(levelEleven.breakdown.stoneAttack, 75)
})

test('Wiki 未提供中间等级时不做伪精确插值', function () {
  const stats = calculateOperatorCombatStats({
    stored: {},
    input: { operatorName: '杨修', level: 99, elite: 17, starLevel: 0 }
  })
  assert.equal(stats.status, 'missing')
  assert.equal(stats.attack, null)
  assert.match(stats.reason, /仅提供/)
})
