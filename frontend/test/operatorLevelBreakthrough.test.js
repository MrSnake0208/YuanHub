import test from 'node:test'
import assert from 'node:assert/strict'
import { inferredLevelBreakthroughStage, operatorLevelBreakthroughStage, validLevelBreakthroughStage } from '../src/utils/operatorGrowthRules.js'
import { calculateOperatorCombatStats, combatInputSignature } from '../src/utils/operatorCombatStats.js'

test('1–100合法阶段：整十级保留两态与未知，100只有9，0未知', () => {
  assert.equal(inferredLevelBreakthroughStage(0), null)
  for (let level = 1; level <= 100; level++) {
    const lower = Math.floor((level - 1) / 10)
    const upper = Math.min(9, Math.floor(level / 10))
    assert.equal(inferredLevelBreakthroughStage(level), lower === upper ? lower : null)
    for (let stage = -1; stage <= 10; stage++) assert.equal(validLevelBreakthroughStage(level, stage), stage >= lower && stage <= upper)
  }
  assert.equal(operatorLevelBreakthroughStage({ level: 90 }), null)
  assert.equal(operatorLevelBreakthroughStage({ level: 90, level_breakthrough_stage: 8 }), 8)
  assert.equal(operatorLevelBreakthroughStage({ level: 90, levelBreakthroughStage: 9 }), 9)
  assert.equal(operatorLevelBreakthroughStage({ level: 91 }), 9)
})

test('同级突破改变签名并使旧观测过期，不改变旧快照', () => {
  const before = { operatorName: '张辽', level: 90, levelBreakthroughStage: 8 }
  const after = { ...before, levelBreakthroughStage: 9 }
  const stored = { observed_attack: 1234, observed_hp: 5678, observed_inputs: { level: 90, level_breakthrough_stage: 8 }, observed_status: 'valid' }
  const original = structuredClone(stored)
  assert.notEqual(combatInputSignature(before), combatInputSignature(after))
  const result = calculateOperatorCombatStats({ stored, input: after, allowAutomatic: false })
  assert.equal(result.status, 'stale')
  assert.equal(result.attack, 1234)
  assert.deepEqual(stored, original)
})

test('整十级旧观测无法由今天的确认补成可靠样本', () => {
  const stored = { observed_attack: 1234, observed_inputs: { level: 90 }, observed_status: 'valid' }
  for (const stage of [null, 8, 9]) {
    const result = calculateOperatorCombatStats({ stored, input: { level: 90, levelBreakthroughStage: stage }, allowAutomatic: false })
    assert.equal(result.status, 'unverified')
    assert.equal(result.attack, 1234)
  }
  assert.equal(calculateOperatorCombatStats({ input: { operatorName: '张辽', level: 90, elite: 15 } }).automaticResultAvailable, false)
})
