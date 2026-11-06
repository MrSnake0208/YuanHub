import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import BattleImages from '../src/pages/tools/battle-images.vue'
import DataAccountContextBar from '../src/components/DataAccountContextBar.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCatalog, getOperatorCurrent, getCurrentOperatorPanels } from '../src/api/operator.js'
import { getCurrentStarState } from '../src/api/starState.js'
import { getCurrentStarLoadout } from '../src/api/starLoadout.js'
import { dialog } from '../src/utils/dialog.js'
import { useBattleDraft } from '../src/composables/useBattleDraft.js'
import { battleDraftKey, decodeBattleDraft, encodeBattleDraft } from '../src/utils/battleDraft.js'
import { createBattleDraft } from '../src/utils/battleImages.js'

vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: false, userInfo: null, adminAccess: null }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn(), getOperatorCurrent: vi.fn(), getCurrentOperatorPanels: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const opId = 'char_001_yangxiu'
const catalog = [{ id: opId, name: '杨修', alias: '杨少主', rarity: 5, games: ['如鸢'], discs: [{ ot_name: '图鉴词条' }] }]
const current = id => [{ account_id: id, game: '如鸢', entries: { [opId]: {
  level: 80, elite: 12, huaji: { owned: true, stage: 25, awakened: true }, combat_stats: { manual_hp: 12345, manual_attack: 0 },
  disc_loadouts: [{ discs: [{ ot_name: '实际一盘' }] }, { discs: [{ ot_name: '实际二盘' }] }],
} } }]
const page = () => mount(BattleImages, { global: { stubs: { IslandSidebar: true, DataAccountContextBar: true } } })
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text() === text)
const login = id => { auth.userInfo = { id }; auth.isLoggedIn = true }
function upload(wrapper, file) {
  const input = wrapper.get('[aria-label="选择草稿文件"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  return input.trigger('change')
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.isLoggedIn = false; auth.userInfo = null; auth.adminAccess = null
  activeAccount.set('a')
  dialog.confirm.mockResolvedValue(true)
  listAccounts.mockResolvedValue([{ id: 'a', game: '如鸢', name: '账号 A' }, { id: 'b', game: '如鸢', name: '账号 B' }])
  getOperatorCatalog.mockResolvedValue({ operators: catalog })
  getOperatorCurrent.mockImplementation(({ accountId }) => Promise.resolve(current(accountId)))
  getCurrentStarState.mockImplementation(id => Promise.resolve({ account_id: id, generation: 1, inventory: [{ instance_id: 'star', name: '天相', kind: 'main', quality: 'orange', level: 50, breakthrough_stage: 2 }] }))
  getCurrentStarLoadout.mockImplementation(id => Promise.resolve({ account_id: id, generation: 1, loadouts: { [opId]: { main1: 'star' } } }))
  getCurrentOperatorPanels.mockResolvedValue({})
})

it('账号密探带入、命盘二盘和图鉴要求可编辑；档案快照不随攻略改变', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  expect(wrapper.find('[aria-label="从我的密探选择"]').exists()).toBe(false)
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(wrapper.get('[aria-label="1号位攻击"]').element.value).toBe('0')
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨少主'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(dialog.confirm).not.toHaveBeenCalled()
  expect(wrapper.get('[aria-label="1号位星石 / 辅星"]').element.value).toContain('橙 · 50级 · 突破2')
  expect(wrapper.get('.battle-preview-paper').text()).toContain('手动修正')
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue(); await flushPromises()
  expect(wrapper.get('[aria-label="1号位携带命盘"]').element.value).toBe('实际二盘')
  expect(wrapper.get('[aria-label="带入命盘组合2"]').element.checked).toBe(true)
  await wrapper.get('[aria-label="命盘填写位置"]').setValue('requiredDiscs')
  await button(wrapper, '图鉴词条').trigger('click')
  expect(wrapper.get('[aria-label="1号位必须命盘"]').element.value).toBe('图鉴词条')
  await wrapper.get('[aria-label="1号位生命"]').setValue('777')
  await button(wrapper, '重新读取我的密探').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('777')
  expect(getCurrentOperatorPanels).not.toHaveBeenCalled()
  const saved = decodeBattleDraft(localStorage.getItem(battleDraftKey('u1', 'a')))
  expect(saved.operators[0].id).toBe(opId)
  expect(saved.operators[0].requiredDiscs).toBe('图鉴词条')
})

it('重新带入账号配置与命盘切换均保留取消保护，确认后只替换相应内容', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  expect(wrapper.find('select[aria-label="游戏"]').exists()).toBe(false)
  expect(wrapper.get('.battle-game-context').text()).toContain('如鸢')
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨少主'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位密探"]').element.value).toBe('杨修')
  await wrapper.get('[aria-label="1号位生命"]').setValue('777')
  await wrapper.get('[aria-label="1号位必须命盘"]').setValue('保留要求')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue(); await flushPromises()
  expect(wrapper.get('[aria-label="带入命盘组合1"]').element.checked).toBe(true)
  expect(wrapper.get('[aria-label="带入命盘组合2"]').element.checked).toBe(false)
  expect(wrapper.get('[aria-label="1号位携带命盘"]').element.value).toBe('实际一盘')
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue(); await flushPromises()
  expect(wrapper.get('[aria-label="1号位携带命盘"]').element.value).toBe('实际二盘')
  expect(wrapper.get('[aria-label="1号位必须命盘"]').element.value).toBe('保留要求')
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('777')
  dialog.confirm.mockResolvedValueOnce(false)
  await button(wrapper, '重新带入账号配置').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('777')
  await button(wrapper, '重新带入账号配置').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(wrapper.get('[aria-label="1号位携带命盘"]').element.value).toBe('实际一盘')
})

it('命盘确认期间切换槽位不会将组合写入另一位密探', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修'); await flushPromises()
  let finish
  dialog.confirm.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue()
  await wrapper.get('[aria-label="编辑2号位"]').trigger('click')
  await wrapper.get('[aria-label="2号位密探"]').setValue('自定义密探'); await flushPromises()
  finish(true); await flushPromises()
  expect(wrapper.get('[aria-label="2号位携带命盘"]').element.value).toBe('')
  await wrapper.get('[aria-label="编辑1号位"]').trigger('click')
  expect(wrapper.get('[aria-label="1号位携带命盘"]').element.value).toBe('实际一盘')
})

it('恢复分别属于游客、两个账号与不同站点用户的草稿，切换前说明影响', async () => {
  let wrapper = page(); await flushPromises()
  await wrapper.get('[aria-label="标题或关卡"]').setValue('游客草稿')
  wrapper.unmount()
  login('u1'); wrapper = page(); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('')
  await wrapper.get('[aria-label="标题或关卡"]').setValue('A 的草稿')
  expect(await wrapper.findComponent(DataAccountContextBar).props('beforeSwitch')()).toBe(true)
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('独立草稿') }))
  activeAccount.set('b'); await flushPromises()
  await wrapper.get('[aria-label="标题或关卡"]').setValue('B 的草稿')
  activeAccount.set('a'); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('A 的草稿')
  auth.userInfo = { id: 'u2' }; await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('')
  auth.isLoggedIn = false; await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('游客草稿')
})

it('账号请求未结束时切换账号，旧数据不能重新出现或写入新草稿', async () => {
  login('u1')
  let finish
  getOperatorCurrent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const wrapper = page(); await flushPromises()
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  activeAccount.set('b'); await flushPromises()
  finish(current('a')); await flushPromises()
  expect(wrapper.get('#battle-operator-names option[value="杨修"]').text()).toBe('手动填写练度')
  expect(wrapper.get('[aria-label="1号位密探"]').element.value).toBe('')
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  expect(wrapper.get('#battle-operator-names option[value="杨修"]').text()).toContain('我的密探')
})

it('读取失败不伪装成没有密探，重试后可继续', async () => {
  login('u1')
  getCurrentStarState.mockRejectedValueOnce(new Error('星石暂时不可读'))
  const wrapper = page(); await flushPromises()
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('星石暂时不可读')
  expect(wrapper.text()).not.toContain('暂无已拥有的密探')
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  expect(wrapper.get('#battle-operator-names option[value="杨修"]').text()).toContain('我的密探')
})

it('自动面板按既有权限读取，失败回退记录值并注明，不影响草稿继续编辑', async () => {
  login('u1'); auth.adminAccess = { permissions: ['operator_panel:use'] }
  getCurrentOperatorPanels.mockRejectedValueOnce(new Error('panel unavailable'))
  const wrapper = page(); await flushPromises()
  await button(wrapper, '从我的密探带入').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨修'); await flushPromises()
  expect(getCurrentOperatorPanels).toHaveBeenCalledWith('a', [opId])
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(wrapper.get('.battle-preview-paper').text()).toContain('自动面板读取失败')
})

it('公开图鉴失败仍能游客手填，按游戏和别名解析稳定身份', async () => {
  getOperatorCatalog.mockRejectedValueOnce(new Error('offline'))
  const wrapper = page(); await flushPromises()
  expect(wrapper.text()).toContain('暂用本地名称目录')
  await wrapper.get('[aria-label="1号位密探"]').setValue('自定义攻略角色'); await flushPromises()
  expect(wrapper.get('.battle-preview-paper').text()).toContain('自定义攻略角色')
  await button(wrapper, '重试图鉴').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="1号位密探"]').setValue('杨少主'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位密探"]').element.value).toBe('杨修')
  expect(decodeBattleDraft(localStorage.getItem(battleDraftKey('', ''))).operators[0].id).toBe(opId)
  await wrapper.get('[aria-label="游戏"]').setValue('代号鸢')
  expect(wrapper.findAll('datalist option')).toHaveLength(0)
})

it('文件导入先校验再确认，取消不覆盖，恢复回合时重置编辑索引', async () => {
  const wrapper = page(); await flushPromises()
  await wrapper.get('[aria-label="标题或关卡"]').setValue('原草稿')
  const value = createBattleDraft(); value.title = '导入草稿'; value.operators[0].name = '自定义'
  const file = { size: 1000, text: async () => encodeBattleDraft(value) }
  dialog.confirm.mockResolvedValueOnce(false)
  await upload(wrapper, file); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('原草稿')
  await button(wrapper, '操作记录').trigger('click')
  await button(wrapper, '新增回合').trigger('click')
  await upload(wrapper, file); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('导入草稿')
  expect(wrapper.get('[aria-label="当前回合"]').element.value).toBe('0')
  await upload(wrapper, { size: 1, text: async () => '{' }); await flushPromises()
  expect(wrapper.text()).toContain('有效的 JSON')
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('导入草稿')
})

it('文件读取期间变更账号或编辑内容，不能用迟到文件覆盖', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  let finish
  const file = { size: 100, text: () => new Promise(resolve => { finish = resolve }) }
  await upload(wrapper, file)
  activeAccount.set('b'); await flushPromises()
  const value = createBattleDraft(); value.title = '账号 A 的文件'
  finish(encodeBattleDraft(value)); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('')
  await upload(wrapper, file)
  await wrapper.get('[aria-label="标题或关卡"]').setValue('读取期间编辑')
  finish(encodeBattleDraft(value)); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('读取期间编辑')
  expect(wrapper.text()).toContain('草稿已变化')
})

it('超限文件及其他游戏文件不覆盖当前账号草稿', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  await wrapper.get('[aria-label="标题或关卡"]').setValue('保留内容')
  const value = createBattleDraft(); value.game = '代号鸢'
  const text = vi.fn(async () => encodeBattleDraft(value))
  await upload(wrapper, { size: 1024 * 1024 + 1, text }); await flushPromises()
  expect(text).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('不能超过 1 MB')
  await upload(wrapper, { size: 100, text }); await flushPromises()
  expect(wrapper.text()).toContain('草稿游戏与当前账号不同')
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('保留内容')
  expect(dialog.confirm).not.toHaveBeenCalled()
})

it('损坏存档保留原文，存储失败不显示成功，可重试保存', () => {
  const user = ref('u'), accountId = ref('a'), key = battleDraftKey('u', 'a')
  localStorage.setItem(key, '{broken')
  let workspace
  mount(defineComponent({ setup() { workspace = useBattleDraft(user, accountId); return () => null } }))
  workspace.draft.value.title = '新内容'
  expect(localStorage.getItem(key)).toBe('{broken')
  expect(workspace.dirty.value).toBe(true)
  const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(workspace.overwrite()).toBe(false)
  expect(workspace.status.value).toBe('')
  expect(workspace.dirty.value).toBe(true)
  failure.mockRestore()
  expect(workspace.save()).toBe(true)
  expect(workspace.dirty.value).toBe(false)
  expect(decodeBattleDraft(localStorage.getItem(key)).title).toBe('新内容')
})

it('导入旧版超限携带命盘供修正，不覆盖当前本机存档，修正后才保存', async () => {
  const wrapper = page(); await flushPromises()
  await wrapper.get('[aria-label="标题或关卡"]').setValue('原草稿')
  const key = battleDraftKey('', ''), saved = localStorage.getItem(key)
  const value = createBattleDraft()
  value.operators[0].name = '杨修'
  value.operators[0].discs = '甲\n乙\n丙\n丁'
  const raw = JSON.stringify({ format: 'yuanhub-battle-draft', version: 1, draft: value })
  await upload(wrapper, { size: raw.length, text: async () => raw }); await flushPromises()
  expect(wrapper.get('[aria-label="1号位携带命盘"]').element.value).toBe('甲\n乙\n丙\n丁')
  expect(wrapper.text()).toContain('修正后自动保存，原存档未覆盖')
  expect(localStorage.getItem(key)).toBe(saved)
  await wrapper.get('[aria-label="1号位携带命盘"]').setValue('甲\n乙\n丙')
  expect(decodeBattleDraft(localStorage.getItem(key)).operators[0].discs).toBe('甲\n乙\n丙')
  expect(wrapper.text()).not.toContain('修正后自动保存，原存档未覆盖')
})
