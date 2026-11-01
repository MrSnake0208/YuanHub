import test from 'node:test'
import assert from 'node:assert/strict'
import { STAR_USAGE_TAGS } from '../src/data/starUsageTags.js'
import { applySessionPreset, canonicalPresetNames, filterStarCandidates, splitStarTokens } from '../src/domain/starLoadoutUi.js'

const target = { id: 'target', prof: '地', subProf: '龙盾' }
const entry = (id, kind, name) => ({ instance_id: id, kind, name, quality: 'orange', level: 60 })

test('generated usage tags reproduce the confirmed browser-description table', function () {
  assert.deepEqual(STAR_USAGE_TAGS.武曲, ['攻击', '生命'])
  assert.deepEqual(STAR_USAGE_TAGS.紫微, ['生命'])
  assert.deepEqual(STAR_USAGE_TAGS.贪狼, ['其它'])
  assert.deepEqual(STAR_USAGE_TAGS.文昌, ['治疗'])
  assert.deepEqual(STAR_USAGE_TAGS.天刑, ['抗性'])
})

test('usage and multi-token OR filtering retain only matching candidates', function () {
  const candidates = [{ name: '天府' }, { name: '武曲' }, { name: '天同' }]
  assert.deepEqual(filterStarCandidates(candidates, { usage: '攻击' }).map(item => item.name), ['天府', '武曲'])
  assert.deepEqual(filterStarCandidates(candidates, { query: '天府,天同' }).map(item => item.name), ['天府', '天同'])
  assert.deepEqual(splitStarTokens('天府 武曲，七杀'), ['天府', '武曲', '七杀'])
})

test('preset parser accepts canonical space/comma input and rejects wrong kind', function () {
  assert.deepEqual(canonicalPresetNames('天府，武曲 七杀', 'main'), { names: ['天府', '武曲', '七杀'], invalid: [], valid: true })
  assert.equal(canonicalPresetNames('文曲', 'main').valid, false)
  assert.deepEqual(canonicalPresetNames('紫薇', 'main'), { names: [], invalid: ['紫薇'], valid: false })
  assert.equal(canonicalPresetNames('天府 天府 武曲', 'main').valid, false)
})

test('one-to-two preset fills only empty slots while three names replace the group', function () {
  const inventoryEntries = [entry('a', 'main', '天府'), entry('b', 'main', '武曲'), entry('c', 'main', '七杀'), entry('old', 'main', '太阳')]
  const base = { target: { main1: 'old', main2: null, main3: null, support1: null, support2: null, support3: null } }
  const partial = applySessionPreset({ names: ['天府', '武曲'], kind: 'main', draftLoadouts: base, targetOperator: target, inventoryEntries })
  assert.equal(partial.loadouts.target.main1, 'old')
  assert.equal(partial.loadouts.target.main2, 'a')
  assert.equal(partial.loadouts.target.main3, 'b')
  const full = applySessionPreset({ names: ['天府', '武曲', '七杀'], kind: 'main', draftLoadouts: base, targetOperator: target, inventoryEntries })
  assert.deepEqual([full.loadouts.target.main1, full.loadouts.target.main2, full.loadouts.target.main3], ['a', 'b', 'c'])
  const duplicate = applySessionPreset({ names: ['天府', '天府', '武曲'], kind: 'main', draftLoadouts: base, targetOperator: target, inventoryEntries })
  assert.equal(duplicate.message, '预设包含重复星石名称')
  assert.deepEqual(duplicate.loadouts, base)
})
