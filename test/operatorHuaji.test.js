import test from 'node:test'
import assert from 'node:assert/strict'
import { starCardNumber, starCardNode } from '../src/utils/operatorStarDisplay.js'
import { operatorHuaji, operatorHuajiLabel, operatorHuajiMax, operatorHuajiAction, operatorHuajiComplete, operatorHuajiDraft, operatorAwakeningSupported, operatorAwakeningUpgradeSupported } from '../src/utils/operatorHuaji.js'

test('旧25..30均为五星，不展示第五颗星的小节点', () => {
  for (let raw = 25; raw <= 30; raw++) {
    assert.equal(starCardNumber(raw), 5)
    assert.equal(starCardNode(raw), 0)
  }
})

test('独立记录优先，旧31表示五星觉醒，未填觉醒按未觉醒展示', () => {
  assert.deepEqual(operatorHuaji({ starLevel: 31 }), { owned: true, stage: 25, awakened: true })
  assert.deepEqual(operatorHuaji({ level: 100, elite: 17 }), { owned: false, stage: null, awakened: null })
  const facts = { owned: true, stage: null, awakened: false }
  assert.deepEqual(operatorHuaji({ starLevel: 31, huaji: facts }), facts)
  assert.match(operatorHuajiLabel({ huaji: facts }), /化极待确认/)
  assert.match(operatorHuajiLabel({ starLevel: 25 }), /5 星.*未觉醒/)
})

test('隐密异常不造合法星级，SP稀疏映射且占位不算拥有', () => {
  assert.equal(operatorHuajiMax({ rarity: 3 }), 19)
  for (const raw of [20, 21, 22, 23, 24, 25, 30, 31]) assert.deepEqual(operatorHuaji({ rarity: 3, starLevel: raw }), { owned: true, stage: null, awakened: null })
  for (let raw = 1; raw <= 5; raw++) assert.equal(operatorHuaji({ spOf: 'base', starLevel: raw }).stage, 6 * (raw - 1) + 1)
  assert.equal(operatorHuaji({ spOf: 'base', starLevel: 0, level: 100, elite: 17 }).owned, false)
})

test('三星满四星无节点，两名已核对 SP 可记录觉醒但没有扣料入口', () => {
  const low = { rarity: 3, huaji: { owned: true, stage: 19, awakened: null } }
  assert.equal(operatorHuajiLabel(low), '4 星')
  assert.equal(operatorHuajiAction(low).kind, 'complete')
  for (const id of ['char_084_chendengsp', 'char_085_shizimiaosp']) {
    const sp = { id, rarity: 5, spOf: 'base' }
    assert.equal(operatorAwakeningSupported(sp), true)
    assert.equal(operatorAwakeningUpgradeSupported(sp), false)
  }
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
    assert.equal(operatorHuajiAction({ ...row, starLevel: 31, huaji: null }).kind, 'complete')
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
  assert.match(operatorHuajiLabel({ rarity: 4, starLevel: 31 }), /5 星.*已觉醒/)
})

test('觉醒草稿按五星读取，降星清除觉醒，未拥有保持空值', () => {
  const history = { rarity: 4, starLevel: 31, huaji: { owned: true, stage: null, awakened: true } }
  assert.deepEqual(operatorHuajiDraft(history, 31), { owned: true, stage: 25, awakened: true })
  assert.deepEqual(operatorHuajiDraft(history, 25), { owned: true, stage: 25, awakened: true })
  for (const awakened of [null, false, true]) {
    assert.deepEqual(operatorHuajiDraft({ rarity: 4, starLevel: 19, huaji: { owned: true, stage: 19, awakened } }, 25), { owned: true, stage: 25, awakened })
  }
  assert.deepEqual(operatorHuajiDraft({ rarity: 4, starLevel: 30 }, 25), operatorHuaji({ rarity: 4, starLevel: 30 }))
  assert.deepEqual(operatorHuajiDraft({ spOf: 'base', starLevel: 2, huaji: { owned: true, stage: 7, awakened: true } }, 3), { owned: true, stage: 13, awakened: false })
  assert.deepEqual(operatorHuajiDraft(history, 19), { owned: true, stage: 19, awakened: false })
  assert.deepEqual(operatorHuajiDraft(history, 0), { owned: false, stage: 0, awakened: null })
})


test('快捷觉醒必须由后端能力明确开放，只支持普通紫金密探', () => {
  assert.equal(operatorAwakeningUpgradeSupported({ rarity: 5 }), false)
  assert.equal(operatorAwakeningUpgradeSupported({ rarity: 4, huajiCapabilities: { awakeningUpgradeSupported: false } }), false)
  for (const rarity of [4, 5]) assert.equal(operatorAwakeningUpgradeSupported({ rarity, huaji_capabilities: { awakening_upgrade_supported: true } }), true)
  for (const entry of [{ rarity: 3 }, { rarity: 5, spOf: 'base' }, { rarity: 4, huajiCapabilities: { awakeningSupported: false, awakeningUpgradeSupported: true } }]) {
    assert.equal(operatorAwakeningUpgradeSupported({ huajiCapabilities: { awakeningUpgradeSupported: true }, ...entry }), false)
  }
})


test('所有星级未填觉醒与false展示一致，普通和SP的已觉醒均为五星', () => {
  for (const stage of [1, 7, 13, 19, 24, 25]) {
    const entry = { rarity: 5, huaji: { owned: true, stage, awakened: false } }
    const expected = operatorHuajiLabel(entry)
    for (const awakened of [null, undefined]) {
      assert.equal(operatorHuajiLabel({ ...entry, huaji: { ...entry.huaji, awakened } }), expected)
    }
    assert.doesNotMatch(expected, /觉醒待确认/)
  }
  for (const entry of [
    { rarity: 5 },
    { rarity: 5, spOf: 'base', id: 'char_084_chendengsp' }
  ]) {
    const history = { ...entry, huaji: { owned: true, stage: null, awakened: true } }
    assert.equal(operatorHuaji(history).stage, 25)
    assert.match(operatorHuajiLabel(history), /5 星.*已觉醒/)
  }
})
