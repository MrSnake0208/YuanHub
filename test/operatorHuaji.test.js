import test from 'node:test'
import assert from 'node:assert/strict'
import { starCardNumber, starCardNode } from '../src/utils/operatorStarDisplay.js'
import { operatorHuaji, operatorHuajiLabel, operatorHuajiMax, operatorHuajiAction, operatorHuajiComplete, operatorHuajiDraft } from '../src/utils/operatorHuaji.js'

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

test('五星后接手动觉醒，三态不混淆，只有确认觉醒才最终完成', () => {
  for (const rarity of [4, 5]) {
    const row = { rarity, huaji: { owned: true, stage: 24, awakened: null } }
    assert.equal(operatorHuajiAction(row).kind, 'upgrade')
    for (const awakened of [false, null, true]) {
      const entry = { ...row, huaji: { ...row.huaji, stage: 25, awakened } }
      assert.equal(operatorHuajiAction(entry).kind, awakened === true ? 'complete' : 'awakening')
      assert.equal(operatorHuajiComplete(entry), awakened === true)
    }
    assert.equal(operatorHuajiAction({ ...row, starLevel: 31, huaji: null }).kind, 'unknown')
  }
})

test('隐密、SP、无资料、未拥有、历史异常均无觉醒快捷写入', () => {
  for (const row of [
    { rarity: 3, starLevel: 24 }, { rarity: 3, starLevel: 31 },
    { rarity: 5, spOf: 'base', starLevel: 5 }, { starLevel: 25 },
    { rarity: 4, starLevel: 0 }, { rarity: 4, huaji: { owned: true, stage: null, awakened: true } },
    { rarity: 4, huaji_capabilities: { awakening_supported: false }, starLevel: 25 },
  ]) {
    assert.equal(operatorHuajiAction(row).disabled, true)
    assert.notEqual(operatorHuajiAction(row).kind, 'awakening')
  }
  assert.doesNotMatch(operatorHuajiLabel({ rarity: 4, starLevel: 7 }), /觉醒待确认/)
  assert.match(operatorHuajiLabel({ rarity: 4, starLevel: 31 }), /化极待确认.*已觉醒（历史确认）/)
})

test('草稿阶段与独立事实同步，旧31只在明确补stage时变化且保留觉醒', () => {
  const history = { rarity: 4, starLevel: 31, huaji: { owned: true, stage: null, awakened: true } }
  assert.deepEqual(operatorHuajiDraft(history, 31), history.huaji)
  assert.deepEqual(operatorHuajiDraft(history, 25), { owned: true, stage: 25, awakened: true })
  for (const awakened of [null, false, true]) {
    assert.deepEqual(operatorHuajiDraft({ rarity: 4, starLevel: 19, huaji: { owned: true, stage: 19, awakened } }, 25), { owned: true, stage: 25, awakened })
  }
  assert.deepEqual(operatorHuajiDraft({ rarity: 4, starLevel: 30 }, 25), operatorHuaji({ rarity: 4, starLevel: 30 }))
  assert.deepEqual(operatorHuajiDraft({ spOf: 'base', starLevel: 2, huaji: { owned: true, stage: 7, awakened: true } }, 3), { owned: true, stage: 13, awakened: true })
  assert.deepEqual(operatorHuajiDraft(history, 0), { owned: false, stage: 0, awakened: null })
})
