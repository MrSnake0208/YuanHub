import test from 'node:test'
import assert from 'node:assert/strict'
import { routes } from '../src/router/routes.js'
import { FEATURE_KEYS } from '../src/config/features.js'
import { isFeatureAccessible } from '../src/utils/featureAccess.js'
import { battleFileName, battleHuajiProgress, battleImageError, battleStarStones, battleTargetShortName, buildBattleImageModel, createBattleDraft, sameBattleOperator } from '../src/utils/battleImages.js'

test('独立工具使用专属发布开关和内测准入，不依赖作业系统', () => {
  const route = routes.find(route => route.path === '/tools/battle-images')
  assert.ok(route)
  assert.equal(route.meta.feature, FEATURE_KEYS.BATTLE_IMAGES)
  assert.equal(route.meta.requiresBeta, true)
  for (const key of ['requiresAuth', 'requiredPermission']) assert.equal(route.meta[key], undefined)
})

test('发布开关开启后不依赖管理员角色', () => {
  const session = { accessToken: 'fixture', userInfo: { id: 'u' }, adminAccessLoaded: true }
  for (const role of ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'CHANGELOG_EDITOR', 'ACTIVITY_CALENDAR_EDITOR', 'ARCHIVE_USER', '']) {
    const state = { ...session, adminAccess: { roles: [role] } }
    assert.equal(isFeatureAccessible(FEATURE_KEYS.BATTLE_IMAGES, state), true)
  }
  const admin = { ...session, adminAccess: { roles: ['SUPER_ADMIN'] } }
  for (const override of [{ accessToken: '' }, { userInfo: null }, { adminAccessLoaded: false }, { adminAccessLoading: true }, { adminAccessError: 'failed' }]) {
    assert.equal(isFeatureAccessible(FEATURE_KEYS.BATTLE_IMAGES, { ...admin, ...override }), true)
  }
  assert.equal(isFeatureAccessible(FEATURE_KEYS.WORK_SYSTEM, admin), false)
  assert.equal(isFeatureAccessible('unknown', admin), false)
})

test('出图按槽位归组但保留跨密探出手顺序、多动、目标与备注', () => {
  const draft = createBattleDraft()
  draft.rounds = [{ remark: '第二动后检查血量', actions: [
    { slot: 4, type: 'attack', target: 0 }, { slot: 1, type: 'ultimate', target: 2 },
    { slot: 4, type: 'sp', target: 3 }, { slot: 0, type: 'defense', target: 2 },
  ] }, { actions: [], remark: '等待敌方回合' }]
  const model = buildBattleImageModel(draft)
  assert.deepEqual(model.rows[0].slots[4], [{ order: 1, symbol: 'A', target: 0 }, { order: 3, symbol: '特', target: 3 }])
  assert.equal(model.rows[0].slots[1][0].order, 2)
  assert.equal(model.rows[0].slots[0][0].symbol, '↓')
  assert.equal(model.rows[1].round, 2)
  assert.equal(model.rows[1].remark, '等待敌方回合')
  draft.rounds[0].actions[0].target = 4
  assert.equal(model.rows[0].slots[4][0].target, 0)
})

test('箱（关卡互动）挂在紧邻其前出手的密探格内，开头跟随其后密探，只有箱时放第一位已选密探；序号连续且出图不要求槽位', () => {
  const draft = createBattleDraft()
  draft.operators[1].name = '杨修'; draft.operators[3].name = '张辽'
  const box = { type: 'interaction' }
  draft.rounds = [
    { remark: '', actions: [{ slot: 3, type: 'attack', target: 2 }, box, { slot: 1, type: 'ultimate', target: 1 }, box] },
    { remark: '', actions: [box, box, { slot: 3, type: 'sp', target: 0 }] },
    { remark: '', actions: [box] },
  ]
  const [first, second, third] = buildBattleImageModel(draft).rows
  const orders = row => row.slots.map(entries => entries.map(entry => entry.order + entry.symbol))
  assert.deepEqual(orders(first), [[], ['3↑', '4互'], [], ['1A', '2互'], []])
  assert.deepEqual(orders(second), [[], [], [], ['1互', '2互', '3特'], []])
  assert.deepEqual(orders(third), [[], ['1互'], [], [], []])
  assert.deepEqual(first.slots[3][1], { order: 2, symbol: '互', target: null, box: true })
  assert.equal(battleImageError(draft, 'actions'), '')
})

test('未知练度不变成零，明确的零和自定义密探名保留，未授权字段不出图', () => {
  const draft = createBattleDraft()
  Object.assign(draft.operators[0], { name: ' 杨修 ', hp: 0, privateNote: '秘密', requiredDiscs: '技能额外效果' })
  draft.operators[1].name = '<script>自定义</script>'
  const { operators } = buildBattleImageModel(draft)
  assert.equal(operators[0].id, 'char_001_yangxiu')
  assert.equal(operators[0].hp, '0')
  assert.equal(operators[0].level, '')
  assert.equal(operators[0].requiredDiscs, '技能额外效果')
  assert.equal(operators[0].privateNote, undefined)
  assert.equal(operators[1].id, '')
  assert.equal(operators[1].name, '<script>自定义</script>')
  assert.equal(operators.length, 5)
})

test('出图前阻止空阵容、无动作和动作对应的空槽位', () => {
  const draft = createBattleDraft()
  assert.match(battleImageError(draft, 'team'), /密探/)
  draft.operators[0].name = '杨修'
  assert.equal(battleImageError(draft, 'team'), '')
  assert.match(battleImageError(draft, 'actions'), /至少一个动作/)
  draft.rounds[0].actions.push({ slot: 1, type: 'attack', target: 2 })
  assert.match(battleImageError(draft, 'actions'), /槽位/)
  draft.operators[1].name = '贾诩'
  assert.equal(battleImageError(draft, 'actions'), '')
})

test('下载文件名带攻略标题，去除非法字符并在无标题时回退', () => {
  assert.equal(battleFileName('  主线 7-12 / 困难  ', '配队草稿', 'json'), 'YuanHub-主线 7-12 困难-配队草稿.json')
  assert.equal(battleFileName('a:b*c?"d<e>f|g\\h', '上阵密探', 'png'), 'YuanHub-a b c d e f g h-上阵密探.png')
  assert.equal(battleFileName('', '配队草稿', 'json'), 'YuanHub-配队草稿.json')
  assert.equal(battleFileName('长'.repeat(80), 'x', 'png'), `YuanHub-${'长'.repeat(40)}-x.png`)
})

test('出图化极按导入格式画星，命盘按图鉴简称与品质色排序，未知词条保留原名', () => {
  assert.deepEqual(battleHuajiProgress('5 星 · 已觉醒'), { stars: 5, nodes: null, awakened: true, status: '已觉醒' })
  assert.deepEqual(battleHuajiProgress('3 星 · 5 节点'), { stars: 3, nodes: 5, awakened: false, status: '' })
  assert.deepEqual(battleHuajiProgress('5 星 · 觉醒待确认'), { stars: 5, nodes: null, awakened: false, status: '觉醒待确认' })
  assert.equal(battleHuajiProgress('满破'), null)
  const draft = createBattleDraft()
  Object.assign(draft.operators[0], { name: '贾诩', huaji: '4 星 · 2 节点', discs: '自定义词条\n初始能量+1\n技能伤害小幅增加' })
  const catalog = [{ id: 'char_002_jiaxu', name: '贾诩', prof: '阴', subProf: '诡道', discs: [
    { ot_name: '技能伤害小幅增加', abbreviation: '技能小幅', color: '紫' }, { ot_name: '初始能量+1', abbreviation: '初始+1', color: '金' },
  ] }]
  const [operator] = buildBattleImageModel(draft, catalog).operators
  assert.equal(operator.prof, '阴')
  assert.equal(operator.job, '诡道')
  assert.deepEqual(operator.huajiProgress, { stars: 4, nodes: 2, awakened: false, status: '' })
  assert.deepEqual(operator.discTerms.discs, [
    { name: '初始能量+1', label: '初始+1', color: '金' }, { name: '技能伤害小幅增加', label: '技能小幅', color: '紫' },
    { name: '自定义词条', label: '自定义词条', color: '' },
  ])
})

test('出图星石按主辅槽位归位并写成名字加等级，旧完整格式兼容，无法识别的行原样保留', () => {
  const stones = battleStarStones('辅星2：擎羊 · 品质未知 · 未知级 · 突破未知\n主星3：天相 · 60级\n主星1：七杀\n自定义说明')
  assert.deepEqual(stones.main, [{ name: '七杀', label: '七杀' }, null, { name: '天相', label: '天相60' }])
  assert.deepEqual(stones.support, [null, { name: '擎羊', label: '擎羊' }, null])
  assert.deepEqual(stones.other, ['自定义说明'])
})

test('手机目标短名缩短默认名，自定义名按字符截取，完整数据不变', () => {
  for (const [name, short] of [['作业目标1', '目标1'], ['作业目标12', '目标12'], ['四字目标', '四字目标'], ['自定义长目标', '自定义长…'], ['😀甲乙丙丁', '😀甲乙丙…'], ['', '']]) {
    assert.equal(battleTargetShortName(name), short)
  }
})

test('密探判定与选人状态共用：已有 ID 时只比 ID，无 ID 时按名称，空槽不匹配', () => {
  const agent = { id: 'yangxiu', name: '杨修' }
  assert.equal(sameBattleOperator({ id: 'yangxiu', name: '旧名称' }, agent), true)
  assert.equal(sameBattleOperator({ id: 'other', name: '杨修' }, agent), false)
  assert.equal(sameBattleOperator(agent, { name: '杨修' }), false)
  assert.equal(sameBattleOperator({ name: '杨修' }, agent), true)
  assert.equal(sameBattleOperator({ id: '', name: '自定义' }, { name: '自定义' }), true)
  assert.equal(sameBattleOperator({ name: '自定义' }, { name: '其他' }), false)
  assert.equal(sameBattleOperator({ id: 'yangxiu', name: '' }, agent), false)
  assert.equal(sameBattleOperator({ name: '' }, { name: '' }), false)
  assert.equal(sameBattleOperator(undefined, agent), false)
})
