import test from 'node:test'
import assert from 'node:assert/strict'
import { starCardNumber, starCardNode } from '../src/utils/operatorStarDisplay.js'
import { operatorHuaji, operatorHuajiLabel, operatorHuajiMax } from '../src/utils/operatorHuaji.js'

test('旧25..30均为五星，不展示第五颗星的小节点', () => {
  for (let raw = 25; raw <= 30; raw++) {
    assert.equal(starCardNumber(raw), 5)
    assert.equal(starCardNode(raw), 0)
  }
})

test('独立事实优先于旧值，31不猜stage，缺字段与确认false不同', () => {
  assert.deepEqual(operatorHuaji({ starLevel: 31 }), { owned: true, stage: null, awakened: true })
  assert.deepEqual(operatorHuaji({ level: 100, elite: 17 }), { owned: false, stage: null, awakened: null })
  const facts = { owned: true, stage: null, awakened: false }
  assert.deepEqual(operatorHuaji({ starLevel: 31, huaji: facts }), facts)
  assert.match(operatorHuajiLabel({ huaji: facts }), /化极待确认.*未觉醒/)
  assert.match(operatorHuajiLabel({ starLevel: 25 }), /5 星.*觉醒待确认/)
})

test('隐密异常不造合法星级，SP稀疏映射且占位不算拥有', () => {
  assert.equal(operatorHuajiMax({ rarity: 3 }), 24)
  for (const raw of [25, 30, 31]) assert.deepEqual(operatorHuaji({ rarity: 3, starLevel: raw }), { owned: true, stage: null, awakened: null })
  for (let raw = 1; raw <= 5; raw++) assert.equal(operatorHuaji({ spOf: 'base', starLevel: raw }).stage, 6 * (raw - 1) + 1)
  assert.equal(operatorHuaji({ spOf: 'base', starLevel: 0, level: 100, elite: 17 }).owned, false)
})
