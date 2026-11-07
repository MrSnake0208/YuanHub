import test from 'node:test'
import assert from 'node:assert/strict'
import { battleStarFields, updateBattleStar, moveBattleAction } from '../src/utils/battleEditor.js'
import { createBattleDraft } from '../src/utils/battleImages.js'
import { encodeBattleDraft, decodeBattleDraft } from '../src/utils/battleDraft.js'

test('星石只记名称与等级，按槽位顺序重写，旧完整格式转为精简格式，旧说明与明确的零保留，仍可往返 v1 草稿', () => {
  const original = '旧说明：天府50，别删\n辅星2：右弼 · 品质未知 · 未知级 · 突破未知\n主星1：太阳 · 橙 · 40级 · 突破0'
  const fields = battleStarFields(original)
  assert.deepEqual([fields[0].name, fields[0].level], ['太阳', '40'])
  assert.deepEqual([fields[4].name, fields[4].level], ['右弼', ''])
  const changed = updateBattleStar(original, 0, 'level', '50')
  assert.equal(changed, '主星1：太阳 · 50级\n辅星2：右弼\n旧说明：天府50，别删')
  const withSupport = updateBattleStar(changed, 3, 'name', '文曲')
  assert.equal(withSupport, '主星1：太阳 · 50级\n辅星1：文曲\n辅星2：右弼\n旧说明：天府50，别删')
  assert.equal(updateBattleStar(withSupport, 3, 'level', '0').split('\n')[1], '辅星1：文曲 · 0级')
  assert.deepEqual(battleStarFields('主星3：七杀 · 40级\n主星2：天府')[2], { label: '主星3', line: 0, name: '七杀', level: '40' })
  const draft = createBattleDraft(); draft.operators[0].stars = withSupport
  assert.equal(decodeBattleDraft(encodeBattleDraft(draft)).operators[0].stars, withSupport)
})

test('无法可靠识别与重复槽位不被猜测覆盖，非法数据拒绝写入', () => {
  const legacy = '主星1：旧版 · 随意 · 填写\n主星1：太阳 · 40级\n主星1：天府 · 50级'
  assert.equal(battleStarFields(legacy)[0].line, -1)
  assert.throws(() => updateBattleStar(legacy, 0, 'name', '太阳'), /原文本中整理/)
  assert.equal(updateBattleStar(legacy, 1, 'name', '武曲'), '主星2：武曲\n' + legacy)
  assert.throws(() => updateBattleStar('', 0, 'level', '40'), /先填写星石名称/)
  assert.throws(() => updateBattleStar('', 0, 'name', '太阳\n辅星1：错误'), /分隔符/)
  assert.throws(() => updateBattleStar('旧'.repeat(299), 0, 'name', '太阳'), /300/)
  assert.throws(() => updateBattleStar('主星1：太阳 · 40级', 0, 'level', '-1'), /非负整数/)
  assert.throws(() => updateBattleStar('', 0, 'quality', '橙'), /字段无效/)
})

test('清空名称只移除选中的星石，不改其它槽位和旧说明', () => {
  const before = '主星1：太阳 · 40级\n辅星1：文曲 · 0级\n保留说明'
  assert.equal(updateBattleStar(before, 0, 'name', ''), '辅星1：文曲 · 0级\n保留说明')
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
