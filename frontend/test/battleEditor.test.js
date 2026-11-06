import test from 'node:test'
import assert from 'node:assert/strict'
import { battleStarFields, updateBattleStar, moveBattleAction } from '../src/utils/battleEditor.js'
import { createBattleDraft } from '../src/utils/battleImages.js'
import { encodeBattleDraft, decodeBattleDraft } from '../src/utils/battleDraft.js'

test('星石编辑保留旧自由文本、其它槽位和明确的零，仍可往返 v1 草稿', () => {
  const original = '旧说明：天府50，别删\n主星1：太阳 · 橙 · 40级 · 突破0\n辅星2：右弼 · 品质未知 · 未知级 · 突破未知'
  const fields = battleStarFields(original)
  assert.equal(fields[0].level, '40')
  assert.equal(fields[0].breakthrough, '0')
  assert.equal(fields[4].level, '')
  const changed = updateBattleStar(original, 0, 'level', '50')
  assert.equal(changed, original.replace('40级', '50级'))
  const withSupport = updateBattleStar(changed, 3, 'name', '文曲')
  assert.ok(withSupport.endsWith('辅星1：文曲 · 品质未知 · 未知级 · 突破未知'))
  const draft = createBattleDraft(); draft.operators[0].stars = withSupport
  assert.equal(decodeBattleDraft(encodeBattleDraft(draft)).operators[0].stars, withSupport)
})

test('无法可靠识别与重复槽位不被猜测覆盖，非法数据拒绝写入', () => {
  const legacy = '主星1：旧版随意填写\n主星1：太阳 · 橙 · 40级 · 突破0\n主星1：天府 · 橙 · 50级 · 突破1'
  assert.equal(battleStarFields(legacy)[0].line, -1)
  assert.throws(() => updateBattleStar(legacy, 0, 'name', '太阳'), /原文本中整理/)
  assert.ok(updateBattleStar(legacy, 1, 'name', '武曲').startsWith(legacy))
  assert.throws(() => updateBattleStar('', 0, 'level', '40'), /先填写星石名称/)
  assert.throws(() => updateBattleStar('', 0, 'name', '太阳\n辅星1：错误'), /分隔符/)
  assert.throws(() => updateBattleStar('旧'.repeat(299), 0, 'name', '太阳'), /300/)
  assert.throws(() => updateBattleStar('主星1：太阳 · 橙 · 40级 · 突破0', 0, 'level', '-1'), /非负整数/)
})

test('清空名称只移除选中的星石，不改其它槽位和旧说明', () => {
  const before = '主星1：太阳 · 橙 · 40级 · 突破0\n辅星1：文曲 · 紫 · 0级 · 突破未知\n保留说明'
  assert.equal(updateBattleStar(before, 0, 'name', ''), '\n辅星1：文曲 · 紫 · 0级 · 突破未知\n保留说明')
})

test('全队重排移动单个动作而不覆盖同回合其他密探动作', () => {
  const actions = [{ slot: 0, type: 'attack' }, { slot: 1, type: 'ultimate' }, { slot: 0, type: 'defense' }]
  const original = [...actions]
  assert.equal(moveBattleAction(actions, 2, 0), true)
  assert.deepEqual(actions, [original[2], original[0], original[1]])
  assert.equal(new Set(actions).size, 3)
  assert.equal(moveBattleAction(actions, 0, 3), false)
  assert.equal(moveBattleAction(actions, 0, 1.5), false)
  assert.deepEqual(actions, [original[2], original[0], original[1]])
})
