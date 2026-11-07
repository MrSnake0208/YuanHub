import test from 'node:test'
import assert from 'node:assert/strict'
import { createBattleDraft, battleImageError } from '../src/utils/battleImages.js'
import { battleDraftKey, decodeBattleDraft, encodeBattleDraft } from '../src/utils/battleDraft.js'
import { battleAccountEntries, findBattleCatalogOperator } from '../src/utils/battleAccountSnapshot.js'

const fixture = () => ({
  account: { id: 'a', game: '如鸢' },
  catalog: [{ id: 'yangxiu', name: '杨修', alias: '杨少主', rarity: 5, games: ['如鸢'] }],
  current: [{ account_id: 'a', game: '如鸢', entries: { yangxiu: {
    level: 80, level_breakthrough_stage: 7, elite: null, star_level: 7,
    huaji: { owned: true, stage: 7, awakened: false },
    disc_loadouts: [{ discs: [{ ot_name: '实际一盘' }], target_discs: [{ ot_name: '目标盘不导入' }] }, { discs: [{ ot_name: '实际二盘' }] }],
    combat_stats: { hp: 0, attack: 1200, observed_status: 'stale', observed_inputs: { level: 70, elite: 10, star_level: 7, level_breakthrough_stage: 6 } },
    private_note: '不公开',
  } } }],
  state: { account_id: 'a', generation: 1, inventory: [{ instance_id: 's', kind: 'main', name: '天相', quality: 'orange', level: 50, breakthrough_stage: 2 }] },
  loadout: { account_id: 'a', generation: 1, loadouts: { yangxiu: { main1: 's' } } },
})

test('快照保留明确零、未知、两套实际命盘和装备实例；不泄漏目标与私密字段', () => {
  const source = fixture(), before = JSON.stringify(source)
  const [entry] = battleAccountEntries(source)
  assert.equal(entry.id, 'yangxiu')
  assert.equal(entry.hp, '0')
  assert.equal(entry.elite, '')
  assert.match(entry.huaji, /2 星/)
  assert.equal(entry.discs, '实际一盘')
  assert.deepEqual(entry.discLoadouts[1].discNames, ['实际二盘'])
  assert.match(entry.stars, /^主星1：天相 · 50级$/m)
  assert.ok(!/橙|突破/.test(entry.stars))
  assert.match(entry.panelNote, /扫描值待重算/)
  assert.ok(!JSON.stringify(entry).includes('目标盘不导入'))
  assert.ok(!JSON.stringify(entry).includes('不公开'))
  entry.discLoadouts[0].discNames.push('本攻略编辑')
  assert.equal(JSON.stringify(source), before)
})

test('自动面板复用来源选择，手动修正优先且不伪造未知数值', () => {
  const source = fixture()
  source.panels = { yangxiu: { status: 'calculated', hp: 8000, attack: 900 } }
  source.current[0].entries.yangxiu.combat_stats = { display_mode: { hp: 'auto' }, manual_attack: 0 }
  const [entry] = battleAccountEntries(source)
  assert.equal(entry.hp, '8000')
  assert.equal(entry.attack, '0')
  assert.match(entry.panelNote, /生命 自动计算；攻击 手动修正/)
  source.current[0].entries.yangxiu.combat_stats = {}
  source.panels = {}
  assert.equal(battleAccountEntries(source)[0].hp, '')
})

test('没有实例配装时兼容旧星石档案，明确空配装不回退旧数据，觉醒未知仍待确认', () => {
  const source = fixture(), raw = source.current[0].entries.yangxiu
  source.loadout.loadouts = {}
  raw.huaji = { owned: true, stage: 25, awakened: null }
  raw.star_stones = [{ type: 'assist', name: '旧辅星', level: 30 }]
  const [entry] = battleAccountEntries(source)
  assert.equal(entry.stars, '辅星1：旧辅星 · 30级')
  assert.match(entry.huaji, /觉醒待确认/)
  source.loadout.loadouts.yangxiu = {}
  assert.equal(battleAccountEntries(source)[0].stars, '')
})

test('拒绝跨账号、跨游戏、不同代星石及丢失实例，未拥有密探不进入列表', () => {
  for (const change of [
    x => { x.current[0].account_id = 'b' }, x => { x.current[0].game = '代号鸢' },
    x => { x.state.account_id = 'b' }, x => { x.loadout.generation = 2 },
    x => { x.state.inventory = [] },
  ]) { const source = fixture(); change(source); assert.throws(() => battleAccountEntries(source), /不一致|已更新/) }
  const source = fixture()
  source.current[0].entries.yangxiu.huaji.owned = false
  assert.deepEqual(battleAccountEntries(source), [])
  assert.equal(findBattleCatalogOperator(source.catalog, '杨少主', '如鸢')?.id, 'yangxiu')
  assert.equal(findBattleCatalogOperator(source.catalog, '杨少主', '代号鸢'), undefined)
})

test('草稿完整往返并只保留编辑字段，作用域区分用户、账号和游客', () => {
  const draft = createBattleDraft()
  draft.operators[0] = battleAccountEntries(fixture())[0]
  draft.rounds[0].actions = [{ slot: 0, type: 'attack', target: 2 }]
  const expected = JSON.stringify(draft)
  draft.token = 'secret'; draft.operators[0].private_note = 'secret'
  const decoded = decodeBattleDraft(encodeBattleDraft(draft))
  assert.deepEqual(decoded, JSON.parse(expected))
  const keys = [battleDraftKey('', ''), battleDraftKey('u1', ''), battleDraftKey('u1', 'a'), battleDraftKey('u1', 'b'), battleDraftKey('u2', 'a')]
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(battleDraftKey('', 'a'), battleDraftKey('', 'b'))
})

test('拒绝损坏、超限和非法槽位动作，不截断导入内容', () => {
  const raw = JSON.parse(encodeBattleDraft(createBattleDraft()))
  for (const change of [
    x => { x.version = 2 }, x => { x.draft.operators.pop() },
    x => { x.draft.rounds = [] }, x => { x.draft.title = 'x'.repeat(121) },
    x => { x.draft.rounds[0].actions = [{ slot: 5, type: 'attack', target: 2 }] },
    x => { x.draft.rounds[0].actions = [{ slot: 0, type: 'attack', target: -1 }] },
    x => { x.draft.rounds[0].actions = [{ slot: 0, type: 'unknown', target: 2 }] },
    x => { x.draft.operators[0].hp = 0 }, x => { x.draft.operators[0].discLoadouts = [{}] },
  ]) { const value = structuredClone(raw); change(value); assert.throws(() => decodeBattleDraft(JSON.stringify(value))) }
  assert.throws(() => decodeBattleDraft('{'), /JSON/)
  assert.throws(() => decodeBattleDraft('中'.repeat(400000)), /1 MB/)
})

test('携带命盘按非空行限三项且不重复，保存与两种出图均拦截，旧草稿完整恢复供修正', () => {
  const draft = createBattleDraft()
  draft.operators[4].name = '贾诩'
  draft.rounds[0].actions = [{ slot: 4, type: 'attack', target: 0 }]
  for (const [value, message] of [
    ['甲\n乙\n丙\n丁', /5 号位（贾诩）.*最多 3 项.*当前 4 项/],
    ['甲\r\n乙\r\n丙\r\n丁', /最多 3 项/],
    ['甲\n 甲 ', /不能重复/],
  ]) {
    draft.operators[4].discs = value
    const before = JSON.stringify(draft)
    assert.throws(() => encodeBattleDraft(draft), message)
    for (const kind of ['team', 'actions']) assert.match(battleImageError(draft, kind), message)
    const restored = decodeBattleDraft(JSON.stringify({ format: 'yuanhub-battle-draft', version: 1, draft }))
    assert.equal(restored.operators[4].discs, value)
    assert.throws(() => encodeBattleDraft(restored), message)
    assert.equal(JSON.stringify(draft), before)
  }
  for (const value of ['', '甲', ' 甲 \r\n\r\n乙\r丙\n ']) {
    draft.operators[4].discs = value
    draft.operators[4].requiredDiscs = '要求一\n要求二\n要求三\n要求四'
    draft.operators[4].forbiddenDiscs = '禁用一\n禁用二\n禁用三\n禁用四'
    assert.equal(decodeBattleDraft(encodeBattleDraft(draft)).operators[4].discs, value)
    for (const kind of ['team', 'actions']) assert.equal(battleImageError(draft, kind), '')
  }
})
