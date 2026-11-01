import test from 'node:test'
import assert from 'node:assert/strict'
import { validateReserveDemand, reserveDemandCost, reservePlanRequirements } from '../src/data/operatorReservePlans.js'
import { getMaxEliteForLevel } from '../src/utils/operatorGrowthRules.js'

const ID = '00000000-0000-4000-8000-000000000001'
const OTHER_ID = '00000000-0000-4000-8000-000000000002'
const demand = (overrides = {}) => ({
  id: ID, count: 1, attribute: '阴', profession: '破军',
  current: { level: 100, elite: 13, breakthrough_stage: 9 },
  target: { level: 100, elite: 17 }, ...overrides
})
const plan = (...demands) => ({ demands })
const assertUnknown = result => {
  assert.equal(result.items, null)
  assert.equal(result.experience, null)
  assert.equal(result.money, null)
  assert.ok(result.unsupportedReasons.length > 0)
}

test('阴阳修为 13→17 固定样例，人数只对单人成本乘一次', () => {
  for (const attribute of ['阴', '阳']) {
    assert.deepEqual(validateReserveDemand(demand({ attribute })), { valid: true, errors: {} })
    for (const count of [1, 2, 999]) {
      assert.deepEqual(reserveDemandCost(demand({ attribute, count })), {
        items: { baoshijing: 940 * count, shuijing: 2760 * count, xinghanjing: 2100 * count },
        experience: 0, money: 1250000 * count, unsupportedReasons: []
      })
    }
  }
})

test('属性组使用明确的风火、地水、阴阳映射', () => {
  for (const [attribute, material] of [['风', 'juanshan'], ['火', 'juanshan'], ['地', 'zhuojiu'], ['水', 'zhuojiu'], ['阴', 'tongjing'], ['阳', 'tongjing']]) {
    const result = reserveDemandCost(demand({ attribute,
      current: { level: 100, elite: 1 }, target: { level: 100, elite: 2 } }))
    assert.deepEqual(result.items, { [material]: 20 })
    assert.equal(result.money, 30000)
  }
})

test('严格人数范围，不截断、不强制转换、不以默认值替代缺失', () => {
  for (const count of [undefined, null, 0, -1, 1000, 1.5, '2', NaN, Infinity, true]) {
    const value = demand({ count })
    assert.ok(validateReserveDemand(value).errors[ID].count)
    assertUnknown(reserveDemandCost(value))
  }
})

test('缺失职业的 70→71 明确报职业错误，拒绝未知属性和职业', () => {
  const value = demand({ profession: undefined, current: { level: 70, elite: 1, breakthrough_stage: 6 }, target: { level: 71, elite: 1 } })
  assert.ok(validateReserveDemand(value).errors[ID].profession)
  assertUnknown(reserveDemandCost(value))
  for (const [field, values] of [['attribute', ['fh', '未知', '', null, {}]], ['profession', ['未知', '', null, {}]]]) {
    for (const input of values) assert.ok(validateReserveDemand(demand({ [field]: input })).errors[ID][field])
  }
})

test('五种职业的 70/80 突破专属材料均完整计算', () => {
  for (const [profession, at70, at80] of [
    ['破军', 'tietaigong', 'xijiaogong'], ['龙盾', 'caiwendun', 'yuguidun'],
    ['岐黄', 'qingtongdao', 'yinwendao'], ['神纪', 'zhentiangu', 'panlonggu'], ['诡道', 'menghunlan', 'fujunhaitang']
  ]) {
    const result = reserveDemandCost(demand({ profession,
      current: { level: 70, elite: 1, breakthrough_stage: 6 }, target: { level: 81, elite: 1 } }))
    assert.equal(result.items[at70], 30)
    assert.equal(result.items[at80], 30)
    assert.equal(result.money, 600000)
    assert.deepEqual(result.unsupportedReasons, [])
  }
})

test('混沌合法可保存但暂无规则，未知费用不变为零', () => {
  const value = demand({ attribute: '混沌' })
  assert.equal(validateReserveDemand(value).valid, true)
  const result = reserveDemandCost(value)
  assertUnknown(result)
  assert.deepEqual(result.unsupportedReasons, [{ demandId: ID, field: 'attribute', code: 'unsupported_attribute', message: '混沌暂无规则' }])
})

test('整十突破未知仅在越过当前节点时阻止确定计费', () => {
  for (let level = 10; level <= 90; level += 10) {
    for (const breakthrough_stage of [null, undefined]) {
      const value = demand({ current: { level, elite: 1, breakthrough_stage }, target: { level: level + 1, elite: 1 } })
      assert.equal(validateReserveDemand(value).valid, true)
      assertUnknown(reserveDemandCost(value))
      assert.equal(reserveDemandCost(value).unsupportedReasons[0].code, 'unconfirmed_breakthrough')
      assert.deepEqual(reserveDemandCost({ ...value, target: { level, elite: 1 } }), { items: {}, experience: 0, money: 0, unsupportedReasons: [] })
    }
  }
})

test('已突破只跳过起始节点，后续突破仍收费，经验不受突破状态影响', () => {
  const before = demand({ current: { level: 70, elite: 1, breakthrough_stage: 6 }, target: { level: 81, elite: 1 } })
  const after = { ...before, current: { ...before.current, breakthrough_stage: 7 } }
  const beforeCost = reserveDemandCost(before)
  const afterCost = reserveDemandCost(after)
  assert.equal(beforeCost.money - afterCost.money, 300000)
  assert.equal(beforeCost.items.tietaigong, 30)
  assert.equal(afterCost.items.tietaigong, undefined)
  assert.equal(afterCost.items.xijiaogong, 30)
  assert.equal(beforeCost.experience, afterCost.experience)
  const crossing = reserveDemandCost(demand({ current: { level: 69, elite: 1 }, target: { level: 71, elite: 1 } }))
  assert.equal(crossing.items.tietaigong, 30)
  assert.equal(crossing.experience, 29500 + 30700)
})

test('突破状态必须匹配等级，拒绝字符串与小数', () => {
  for (const [level, stages] of [[0, [0]], [10, [-1, 2, '1', 0.5]], [71, [6, 8]], [100, [8, 10]]]) {
    for (const breakthrough_stage of stages) {
      const value = demand({ current: { level, elite: 0, breakthrough_stage }, target: { level: 100, elite: 0 } })
      assert.ok(validateReserveDemand(value).errors[ID]['current.breakthrough_stage'])
    }
  }
})

test('当前及目标等级、修为严格校验，目标不得倒退', () => {
  for (const key of ['current', 'target']) {
    for (const [field, values] of [['level', [-1, 101, 1.5, '100', null, undefined, Infinity]], ['elite', [-1, 18, 1.5, '17', null, undefined, NaN]]]) {
      for (const value of values) {
        const input = demand()
        input[key][field] = value
        assert.ok(validateReserveDemand(input).errors[ID][`${key}.${field}`])
        assertUnknown(reserveDemandCost(input))
      }
    }
  }
  for (const target of [{ level: 99, elite: 13 }, { level: 100, elite: 12 }]) {
    assert.equal(validateReserveDemand(demand({ target })).valid, false)
  }
})

test('0–100 每级遵守现有修为上限，含等级 0 与修为 0', () => {
  for (let level = 0; level <= 100; level += 1) {
    const elite = getMaxEliteForLevel(level)
    const value = demand({ current: { level, elite, breakthrough_stage: null }, target: { level, elite } })
    assert.equal(validateReserveDemand(value).valid, true)
    assert.deepEqual(reserveDemandCost(value), { items: {}, experience: 0, money: 0, unsupportedReasons: [] })
    for (const key of ['current', 'target']) {
      const invalid = structuredClone(value)
      invalid[key].elite += 1
      assert.ok(validateReserveDemand(invalid).errors[ID][`${key}.elite`])
    }
  }
})

test('严格字段模型拒绝 operatorId、心纸/化极/觉醒及未知字段，不静默裁剪', () => {
  for (const field of ['operatorId', 'operator_id', 'heart', 'starLevel', 'huaji', 'awakening', '__proto__']) {
    const value = { ...demand(), [field]: 'fake' }
    assert.ok(Object.hasOwn(validateReserveDemand(value).errors[ID], field))
    assertUnknown(reserveDemandCost(value))
  }
  for (const [key, field] of [['current', 'starLevel'], ['target', 'breakthrough_stage']]) {
    const value = demand()
    value[key][field] = 1
    assert.ok(validateReserveDemand(value).errors[ID][`${key}.${field}`])
  }
})

test('需求 ID 必须为 UUID；缺失/非对象形状均返回字段错误而不抛异常', () => {
  for (const id of ['', 'fake-operator', 1, null, undefined]) assert.equal(validateReserveDemand(demand({ id })).valid, false)
  for (const value of [null, undefined, [], 1, 'x', {}, demand({ current: null }), demand({ target: [] })]) {
    assert.equal(validateReserveDemand(value).valid, false)
    assertUnknown(reserveDemandCost(value))
  }
})

test('同方案两组各需同材料 100，库存 100 只抵一次，铜钱独立汇总', () => {
  const first = demand({ attribute: '风', current: { level: 100, elite: 6 }, target: { level: 100, elite: 7 } })
  const result = reservePlanRequirements(plan(first, { ...first, id: OTHER_ID }), { cuishan: 100 })
  assert.deepEqual(result.items, { cuishan: 200, jinsishan: 300 })
  assert.deepEqual(result.shortage, { items: { cuishan: 100, jinsishan: 300 }, experience: 0 })
  assert.equal(result.money, 200000)
  assert.deepEqual(result.unsupportedReasons, [])
})

test('两人阴阳固定样例先乘人数再扣库存，不按人数重用库存', () => {
  const result = reservePlanRequirements(plan(demand({ count: 2 })), { baoshijing: 940, shuijing: 2760, xinghanjing: 2100 })
  assert.equal(result.money, 2500000)
  assert.deepEqual(result.items, { baoshijing: 1880, shuijing: 5520, xinghanjing: 4200 })
  assert.deepEqual(result.shortage, { items: { baoshijing: 940, shuijing: 2760, xinghanjing: 2100 }, experience: 0 })
})

test('三种兵书折算同一个经验余额，跨组抵扣一次且不成为重复材料需求', () => {
  const value = demand({ current: { level: 69, elite: 1 }, target: { level: 70, elite: 1 } })
  const result = reservePlanRequirements(plan(value, { ...value, id: OTHER_ID }), {
    bingshucanjuan: 1, bingshuquanjuan: 1, liutaobingshu: 1, __xp__: 999999
  })
  assert.equal(result.experience, 59000)
  assert.deepEqual(result.items, {})
  assert.deepEqual(result.shortage, { items: {}, experience: 47900 })
  assert.equal(result.money, 0)
})

test('库存缺失/读取失败/无效数量时总需求仍保留，但不输出确定缺口', () => {
  for (const stock of [undefined, null, [], 'failed', { shuijing: null }, { shuijing: '1' }, { shuijing: -1 }, { shuijing: 1.5 }, { bingshuquanjuan: NaN }, { liutaobingshu: Number.MAX_SAFE_INTEGER }]) {
    const result = reservePlanRequirements(plan(demand()), stock)
    assert.deepEqual(result.items, { baoshijing: 940, shuijing: 2760, xinghanjing: 2100 })
    assert.equal(result.money, 1250000)
    assert.equal(result.shortage, null)
    assert.equal(result.unsupportedReasons[0].code, 'inventory_unavailable')
  }
  const emptyStock = reservePlanRequirements(plan(demand()), {})
  assert.deepEqual(emptyStock.shortage.items, emptyStock.items)
  assert.deepEqual(emptyStock.unsupportedReasons, [])
})

test('方案中任一需求非法/未知时不给部分确定总额，原因保留需求 ID', () => {
  for (const second of [demand({ id: OTHER_ID, attribute: '混沌' }), demand({ id: OTHER_ID, profession: '' })]) {
    const result = reservePlanRequirements(plan(demand(), second), {})
    assertUnknown(result)
    assert.equal(result.shortage, null)
    assert.equal(result.unsupportedReasons[0].demandId, OTHER_ID)
  }
})

test('重复需求 ID、非法方案和超出 50 组均拒绝，空方案为零需求', () => {
  const duplicate = reservePlanRequirements(plan(demand(), demand()), {})
  assertUnknown(duplicate)
  assert.equal(duplicate.unsupportedReasons[0].code, 'duplicate_demand')
  for (const input of [null, [], {}, { demands: null }, plan(...Array(51).fill(demand()))]) assertUnknown(reservePlanRequirements(input, {}))
  const fifty = Array.from({ length: 50 }, (_, index) => demand({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }))
  assert.equal(reservePlanRequirements(plan(...fifty), {}).money, 62500000)
  assert.deepEqual(reservePlanRequirements(plan(), {}), { items: {}, experience: 0, money: 0, unsupportedReasons: [], shortage: { items: {}, experience: 0 } })
})

test('稀疏和重复空需求仍返回错误，不漏算为零或抛异常', () => {
  assertUnknown(reservePlanRequirements({ demands: Array(1) }, {}))
  for (const values of [[null, null], [undefined, undefined], [{}, {}]]) {
    assertUnknown(reservePlanRequirements(plan(...values), {}))
  }
})

test('每个独立方案重算同一库存，不修改输入、不预留库存，返回值互不污染', () => {
  const input = plan(demand())
  const stock = { baoshijing: 1000, shuijing: 9999, xinghanjing: 9999 }
  const before = structuredClone({ input, stock })
  const first = reservePlanRequirements(input, stock)
  const second = reservePlanRequirements(input, stock)
  assert.deepEqual(first.shortage, { items: { baoshijing: 0, shuijing: 0, xinghanjing: 0 }, experience: 0 })
  assert.deepEqual(first, second)
  first.items.baoshijing = 0
  first.shortage.items.shuijing = 42
  assert.equal(second.items.baoshijing, 940)
  assert.equal(second.shortage.items.shuijing, 0)
  assert.deepEqual({ input, stock }, before)
})
