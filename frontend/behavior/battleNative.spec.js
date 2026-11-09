import { chooseBattleMember, battleField, battleCell, battleDiscValue } from '../test-support/battleEditor.js'
import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
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
import { battleCloudCacheKey, battleDraftKey, decodeBattleCloudCache, decodeBattleDraft, encodeBattleDraft } from '../src/utils/battleDraft.js'
import { saveBattleDraft } from '../src/api/battleDrafts.js'
import { createBattleDraft } from '../src/utils/battleImages.js'
import { isFeatureEnabled } from '../src/config/features.js'
import { beta } from '../src/store/beta.js'
import { betaLandingFor } from '../src/utils/betaAccess.js'

const routeHooks = vi.hoisted(() => ({ replace: vi.fn(), leave: null }))
vi.mock('vue-router', () => ({ onBeforeRouteLeave: fn => { routeHooks.leave = fn }, useRouter: () => ({ replace: routeHooks.replace, currentRoute: { value: { fullPath: '/tools/battle-images' } } }) }))
vi.mock('../src/config/features.js', async importOriginal => {
  const original = await importOriginal()
  return { ...original, isFeatureEnabled: vi.fn(original.isFeatureEnabled) }
})
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: false, userInfo: null, adminAccess: null }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn(), getOperatorCurrent: vi.fn(), getCurrentOperatorPanels: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
// 云草稿接口的内存实现：按站点用户 + 游戏账号隔离，带版本号冲突与 5 份上限。
const cloudServer = vi.hoisted(() => ({ rows: new Map(), seq: 0 }))
vi.mock('../src/api/battleDrafts.js', () => {
  const owner = (user, account) => `${user}|${account}`
  const failure = code => Object.assign(new Error(code), { code })
  const view = row => ({ id: row.id, title: row.draft.title, game: row.draft.game, revision: row.revision, updated_at: String(row.at), draft: structuredClone(row.draft) })
  const rows = (user, account) => [...cloudServer.rows.values()].filter(row => row.owner === owner(user, account)).sort((x, y) => y.at - x.at)
  const find = (user, account, id) => {
    const row = cloudServer.rows.get(id)
    if (!row || row.owner !== owner(user, account)) throw failure('battle_draft_not_found')
    return row
  }
  return {
    listBattleDrafts: vi.fn(async (user, account) => ({ limit: 5, drafts: rows(user, account).map(row => { const { draft, ...summary } = view(row); return summary }) })),
    getBattleDraft: vi.fn(async (user, account, id) => view(find(user, account, id))),
    createBattleDraft: vi.fn(async (user, account, draft) => {
      if (rows(user, account).length >= 5) throw failure('battle_draft_limit')
      const row = { id: `draft-${++cloudServer.seq}`, owner: owner(user, account), revision: 1, at: ++cloudServer.seq, draft: structuredClone(draft) }
      cloudServer.rows.set(row.id, row)
      return view(row)
    }),
    saveBattleDraft: vi.fn(async (user, account, id, revision, draft) => {
      const row = find(user, account, id)
      if (row.revision !== revision) throw failure('battle_draft_revision_conflict')
      Object.assign(row, { revision: revision + 1, at: ++cloudServer.seq, draft: structuredClone(draft) })
      return view(row)
    }),
    deleteBattleDraft: vi.fn(async (user, account, id) => { find(user, account, id); cloudServer.rows.delete(id); return { deleted: true } }),
  }
})
const cloudCache = (user, account) => decodeBattleCloudCache(localStorage.getItem(battleCloudCacheKey(user, account)))
const cloudRows = (user, account) => [...cloudServer.rows.values()].filter(row => row.owner === `${user}|${account}`)

const opId = 'char_001_yangxiu'
const catalog = [{ id: opId, name: '杨修', alias: '杨少主', rarity: 5, games: ['如鸢'], discs: [{ ot_name: '图鉴词条' }] }]
const current = id => [{ account_id: id, game: '如鸢', entries: { [opId]: {
  level: 80, elite: 12, huaji: { owned: true, stage: 25, awakened: true }, combat_stats: { manual_hp: 12345, manual_attack: 0 },
  disc_loadouts: [{ discs: [{ ot_name: '实际一盘' }] }, { discs: [{ ot_name: '实际二盘' }] }],
} } }]
const page = () => {
  const w = mount(BattleImages, { attachTo: document.body, global: { stubs: { IslandSidebar: true, DataAccountContextBar: true } } })
  return Object.assign(new DOMWrapper(document.body), { unmount: w.unmount.bind(w), findComponent: w.findComponent.bind(w) })
}
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text() === text)
const login = id => { auth.userInfo = { id }; auth.isLoggedIn = true }
function upload(wrapper, file) {
  const input = wrapper.get('[aria-label="选择草稿文件"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  return input.trigger('change')
}

beforeEach(async () => {
  vi.clearAllMocks()
  const original = await vi.importActual('../src/config/features.js')
  isFeatureEnabled.mockImplementation(original.isFeatureEnabled)
  auth.isLoggedIn = false; auth.userInfo = null; auth.adminAccess = null; auth.accessToken = ''
  Object.assign(beta, { campaign: { accessMode: 'OPEN' }, mine: null, userId: '', publicError: '', personalError: '' })
  activeAccount.set('a')
  dialog.confirm.mockResolvedValue(true)
  listAccounts.mockResolvedValue([{ id: 'a', game: '如鸢', name: '账号 A' }, { id: 'b', game: '如鸢', name: '账号 B' }])
  getOperatorCatalog.mockResolvedValue({ operators: catalog })
  getOperatorCurrent.mockImplementation(({ accountId }) => Promise.resolve(current(accountId)))
  getCurrentStarState.mockImplementation(id => Promise.resolve({ account_id: id, generation: 1, inventory: [{ instance_id: 'star', name: '天相', kind: 'main', quality: 'orange', level: 50, breakthrough_stage: 2 }] }))
  getCurrentStarLoadout.mockImplementation(id => Promise.resolve({ account_id: id, generation: 1, loadouts: { [opId]: { main1: 'star' } } }))
  getCurrentOperatorPanels.mockResolvedValue({})
  cloudServer.rows.clear()
})

it.each(['logout', 'revoked', 'failed'])('已打开工具在内测资格 %s 后隐藏并离开，保留已存草稿', async reason => {
  Object.assign(auth, { accessToken: 'fixture', userInfo: { id: 'u' }, isLoggedIn: true })
  Object.assign(beta, { campaign: { accessMode: 'BETA' }, userId: 'u', mine: { canUseBetaFeatures: true } })
  const wrapper = page(); await flushPromises()
  await chooseBattleMember(wrapper, '杨修', 1)
  const key = battleCloudCacheKey('u', 'a'), saved = localStorage.getItem(key)
  expect(cloudCache('u', 'a').draft.operators[0].name).toBe('杨修')
  expect(wrapper.find('.page-battle-images').exists()).toBe(true)
  await wrapper.get('[aria-label="编辑1号位"]').trigger('click')
  await wrapper.get('[aria-label="更换1号位密探"]').trigger('click')
  const input = wrapper.get('[aria-label="1号位密探"]')
  input.element.value = '未确认输入'
  await input.trigger('input')
  dialog.confirm.mockClear()
  if (reason === 'logout') auth.accessToken = ''
  if (reason === 'revoked') beta.mine = { canUseBetaFeatures: false }
  if (reason === 'failed') beta.personalError = 'failed'
  await flushPromises()
  expect(wrapper.find('.page-battle-images').exists()).toBe(false)
  expect(routeHooks.replace).toHaveBeenCalledWith(betaLandingFor('/tools/battle-images'))
  expect(routeHooks.leave()).toBe(true)
  expect(dialog.confirm).not.toHaveBeenCalled()
  expect(localStorage.getItem(key)).toBe(saved)
  wrapper.unmount()
})

it('账号密探带入、命盘二盘和图鉴要求可编辑；档案快照不随攻略改变', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  expect(button(wrapper, '从我的密探带入')).toBeUndefined()
  expect(wrapper.text()).toContain('已读取 1 位我的密探')
  expect(getOperatorCatalog).toHaveBeenCalledTimes(1)
  expect(wrapper.find('[aria-label="从我的密探选择"]').exists()).toBe(false)
  await chooseBattleMember(wrapper, '杨修', 1); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(wrapper.get('[aria-label="1号位攻击"]').element.value).toBe('0')
  await chooseBattleMember(wrapper, '杨少主', 1); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(dialog.confirm).not.toHaveBeenCalled()
  // 面板来源只在练度页说明，配队表不再常驻该行。
  expect(wrapper.get('#battle-member-detail .battle-stat-note').text()).toContain('手动修正')
  expect(wrapper.get('.battle-team-matrix').text()).not.toContain('面板来源')
  await battleField(wrapper, '星石 / 辅星')
  expect(wrapper.findAll('.battle-star-slots :is(select, input)').map(field => field.element.value)).toEqual(expect.arrayContaining(['天相', '50']))
  await battleField(wrapper, '携带命盘')
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue(); await flushPromises()
  expect(await battleDiscValue(wrapper)).toBe('实际二盘')
  expect(wrapper.get('[aria-label="带入命盘组合2"]').element.checked).toBe(true)
  // 标为必须即同时携带，必须项始终属于携带命盘。
  await wrapper.get('[aria-label="必须命盘：图鉴词条"]').trigger('click')
  expect(await battleDiscValue(wrapper)).toBe('实际二盘\n图鉴词条')
  expect(await battleDiscValue(wrapper, 'requiredDiscs')).toBe('图鉴词条')
  await wrapper.get('[aria-label="1号位生命"]').setValue('777')
  await button(wrapper, '重新读取我的密探').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('777')
  expect(getCurrentOperatorPanels).not.toHaveBeenCalled()
  const saved = cloudCache('u1', 'a').draft
  expect(saved.operators[0].id).toBe(opId)
  expect(saved.operators[0].discs).toBe('实际二盘\n图鉴词条')
  expect(saved.operators[0].requiredDiscs).toBe('图鉴词条')
})

it('重新带入账号配置与命盘切换均保留取消保护，确认后只替换相应内容', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  expect(wrapper.find('select[aria-label="游戏"]').exists()).toBe(false)
  expect(wrapper.findComponent(DataAccountContextBar).props('game')).toBe('如鸢')
  await chooseBattleMember(wrapper, '杨少主', 1); await flushPromises()
  expect(wrapper.get('[aria-label="编辑1号位"]').text()).toContain('杨修')
  await wrapper.get('[aria-label="1号位生命"]').setValue('777')
  await battleField(wrapper, '携带命盘')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue(); await flushPromises()
  expect(wrapper.get('[aria-label="带入命盘组合1"]').element.checked).toBe(true)
  expect(wrapper.get('[aria-label="带入命盘组合2"]').element.checked).toBe(false)
  expect(await battleDiscValue(wrapper)).toBe('实际一盘')
  await wrapper.get('[aria-label="必须命盘：图鉴词条"]').trigger('click')
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue(); await flushPromises()
  // 必须项只能属于携带命盘：换组合时提示并取消不在新组合中的必须要求。
  expect(dialog.confirm.mock.lastCall[0].message).toContain('必须要求「图鉴词条」不在该组合中，将一并取消')
  expect(await battleDiscValue(wrapper)).toBe('实际二盘')
  expect(await battleDiscValue(wrapper, 'requiredDiscs')).toBe('')
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('777')
  dialog.confirm.mockResolvedValueOnce(false)
  await button(wrapper, '重新带入账号配置').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('777')
  await button(wrapper, '重新带入账号配置').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(await battleDiscValue(wrapper)).toBe('实际一盘')
  // 手动改动携带命盘后不再显示为某个组合；再次选择该组合需确认后才恢复。
  await wrapper.get('[aria-label="携带命盘：图鉴词条"]').trigger('click')
  expect(wrapper.get('[aria-label="带入命盘组合1"]').element.checked).toBe(false)
  expect(wrapper.get('.battle-loadout-options legend').text()).toContain('已手动调整')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('[aria-label="带入命盘组合1"]').setValue(); await flushPromises()
  expect(wrapper.get('[aria-label="带入命盘组合1"]').element.checked).toBe(false)
  expect(await battleDiscValue(wrapper)).toBe('实际一盘\n图鉴词条')
  await wrapper.get('[aria-label="带入命盘组合1"]').setValue(); await flushPromises()
  expect(await battleDiscValue(wrapper)).toBe('实际一盘')
  expect(wrapper.get('[aria-label="带入命盘组合1"]').element.checked).toBe(true)
})

it('命盘确认期间切换槽位不会将组合写入另一位密探', async () => {
  login('u1')
  const wrapper = page(); await flushPromises()
  await chooseBattleMember(wrapper, '杨修', 1); await flushPromises()
  await battleField(wrapper, '携带命盘')
  let finish
  dialog.confirm.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await wrapper.get('[aria-label="带入命盘组合2"]').setValue()
  await wrapper.get('[aria-label="编辑2号位"]').trigger('click')
  await chooseBattleMember(wrapper, '自定义密探', 2); await flushPromises()
  finish(true); await flushPromises()
  expect(await battleDiscValue(wrapper, 'discs', 2)).toBe('')
  expect(await battleDiscValue(wrapper)).toBe('实际一盘')
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
  expect(getOperatorCurrent).toHaveBeenCalledWith({ accountId: 'a', game: '如鸢' })
  activeAccount.set('b'); await flushPromises()
  expect(getOperatorCurrent).toHaveBeenLastCalledWith({ accountId: 'b', game: '如鸢' })
  const stale = current('a'); stale[0].entries[opId].combat_stats.manual_hp = 99999
  finish(stale); await flushPromises()
  expect(wrapper.get('[aria-label="编辑1号位"]').text()).toContain('选择密探')
  await chooseBattleMember(wrapper, '杨修', 1); await flushPromises()
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
})

it('读取失败不伪装成没有密探，重试后可继续', async () => {
  login('u1')
  getCurrentStarState.mockRejectedValueOnce(new Error('星石暂时不可读'))
  const wrapper = page(); await flushPromises()
  expect(wrapper.text()).toContain('星石暂时不可读')
  expect(wrapper.text()).not.toContain('暂无已拥有的密探')
  await button(wrapper, '重试读取').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="编辑1号位"]').trigger('click')
  expect(wrapper.get('[aria-label="选择杨修"]').text()).toContain('已有配置')
})

it('自动面板按既有权限读取，失败回退记录值并注明，不影响草稿继续编辑', async () => {
  login('u1'); auth.adminAccess = { permissions: ['operator_panel:use'] }
  getCurrentOperatorPanels.mockRejectedValueOnce(new Error('panel unavailable'))
  const wrapper = page(); await flushPromises()
  await chooseBattleMember(wrapper, '杨修', 1); await flushPromises()
  expect(getCurrentOperatorPanels).toHaveBeenCalledWith('a', [opId])
  expect(wrapper.get('[aria-label="1号位生命"]').element.value).toBe('12345')
  expect(wrapper.get('#battle-member-detail .battle-stat-note').text()).toContain('自动面板读取失败')
})

it('公开图鉴失败仍能游客手填，按游戏和别名解析稳定身份', async () => {
  getOperatorCatalog.mockRejectedValueOnce(new Error('offline'))
  const wrapper = page(); await flushPromises()
  expect(wrapper.text()).toContain('暂用本地名称目录')
  await chooseBattleMember(wrapper, '自定义攻略角色', 1); await flushPromises()
  expect(wrapper.get('.battle-team-matrix').text()).toContain('自定义攻略角色')
  await button(wrapper, '重试图鉴').trigger('click'); await flushPromises()
  await chooseBattleMember(wrapper, '杨少主', 1); await flushPromises()
  expect(wrapper.get('[aria-label="编辑1号位"]').text()).toContain('杨修')
  expect(decodeBattleDraft(localStorage.getItem(battleDraftKey('', ''))).operators[0].id).toBe(opId)
  await wrapper.get('[aria-label="游戏"]').setValue('代号鸢')
  await wrapper.get('[aria-label="编辑1号位"]').trigger('click')
  expect(wrapper.findAll('.battle-picker-grid button')).toHaveLength(0)
})

it('文件导入先校验再确认，取消不覆盖，恢复回合时重置编辑索引', async () => {
  const wrapper = page(); await flushPromises()
  await wrapper.get('[aria-label="标题或关卡"]').setValue('原草稿')
  const value = createBattleDraft(); value.title = '导入草稿'; value.operators[0].name = '自定义'
  const file = { size: 1000, text: async () => encodeBattleDraft(value) }
  dialog.confirm.mockResolvedValueOnce(false)
  await upload(wrapper, file); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('原草稿')
  await button(wrapper, '操作表').trigger('click'); await battleCell(wrapper)
  await button(wrapper, '新增回合').trigger('click')
  await upload(wrapper, file); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('导入草稿')
  await battleCell(wrapper)
  expect(wrapper.get('#battle-action-detail h3').text()).toBe('第 1 回合')
  expect(wrapper.get('[aria-label="编辑第1回合1号位动作"]').attributes('aria-expanded')).toBe('true')
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
  expect(cloudRows('u1', 'a').map(row => row.draft.title)).toEqual([''])
  // 云草稿导入总是另存为新草稿：读取期间的编辑先同步到原草稿，不被文件覆盖。
  await upload(wrapper, file)
  await wrapper.get('[aria-label="标题或关卡"]').setValue('读取期间编辑')
  finish(encodeBattleDraft(value)); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('账号 A 的文件')
  expect(cloudRows('u1', 'b').map(row => row.draft.title).sort()).toEqual(['读取期间编辑', '账号 A 的文件'])
  expect(dialog.confirm).not.toHaveBeenCalled()
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
  // 已登录但没有游戏账号时仍使用单份本机草稿。
  const user = ref('u'), accountId = ref(''), key = battleDraftKey('u', '')
  localStorage.setItem(key, '{broken')
  let workspace
  mount(defineComponent({ setup() { workspace = useBattleDraft(user, accountId, ref('')); return () => null } }))
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
  expect(await battleDiscValue(wrapper)).toBe('甲\n乙\n丙\n丁')
  expect(wrapper.text()).toContain('修正后自动保存，原存档未覆盖')
  expect(localStorage.getItem(key)).toBe(saved)
  await wrapper.get('[aria-label="移除携带命盘第4项：丁"]').trigger('click')
  expect(decodeBattleDraft(localStorage.getItem(key)).operators[0].discs).toBe('甲\n乙\n丙')
  expect(wrapper.text()).not.toContain('修正后自动保存，原存档未覆盖')
})

it('云草稿：迁移旧本机草稿，新建、切换与删除，按游戏账号隔离', async () => {
  const legacy = createBattleDraft(); legacy.title = '旧本机攻略'
  localStorage.setItem(battleDraftKey('u3', 'a'), encodeBattleDraft(legacy))
  login('u3')
  const wrapper = page(); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('旧本机攻略')
  expect(localStorage.getItem(battleDraftKey('u3', 'a'))).toBeNull()
  expect(wrapper.get('.battle-draft-menu summary').text()).toContain('旧本机攻略')
  await button(wrapper, '新建草稿').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('')
  await wrapper.get('[aria-label="标题或关卡"]').setValue('新攻略')
  expect(wrapper.findAll('.battle-draft-open').map(node => node.text())).toEqual(['未命名攻略', '旧本机攻略'])
  // 切换前立即同步当前草稿，再打开另一份。
  await wrapper.findAll('.battle-draft-open')[1].trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('旧本机攻略')
  expect(cloudRows('u3', 'a').map(row => row.draft.title).sort()).toEqual(['新攻略', '旧本机攻略'])
  expect(cloudRows('u3', 'b')).toHaveLength(0)
  // 删除当前草稿后打开剩余的一份；取消删除不改动。
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('[aria-label="删除草稿：旧本机攻略"]').trigger('click'); await flushPromises()
  expect(cloudRows('u3', 'a')).toHaveLength(2)
  await wrapper.get('[aria-label="删除草稿：旧本机攻略"]').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'danger', confirmText: '删除草稿' }))
  expect(cloudRows('u3', 'a').map(row => row.draft.title)).toEqual(['新攻略'])
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('新攻略')
  // 其他账号看不到这些草稿。
  activeAccount.set('b'); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('')
  expect(wrapper.findAll('.battle-draft-open')).toHaveLength(1)
  wrapper.unmount()
})

it('云草稿最多 5 份，满额时禁止新建与导入', async () => {
  login('u4')
  const wrapper = page(); await flushPromises()
  for (let i = 0; i < 4; i++) { await button(wrapper, '新建草稿').trigger('click'); await flushPromises() }
  expect(cloudRows('u4', 'a')).toHaveLength(5)
  expect(wrapper.get('.battle-draft-caption').text()).toContain('5/5')
  expect(button(wrapper, '新建草稿').element.disabled).toBe(true)
  expect(button(wrapper, '导入为新草稿').element.disabled).toBe(true)
  wrapper.unmount()
})

it('云草稿版本冲突：未同步修改不丢失，可保留本机修改覆盖或载入云端版本', async () => {
  login('u5')
  const wrapper = page(); await flushPromises()
  const [row] = cloudRows('u5', 'a')
  // 另一设备先保存了新版本。
  row.draft = { ...row.draft, title: '另一设备' }; row.revision = 2
  await wrapper.get('[aria-label="标题或关卡"]').setValue('本机修改')
  await wrapper.findComponent(DataAccountContextBar).props('beforeSwitch')(); await flushPromises()
  expect(wrapper.text()).toContain('已在其他设备更新')
  expect(cloudCache('u5', 'a').draft.title).toBe('本机修改')
  // 冲突未处理时不能切到新草稿，避免覆盖本机缓存。
  await button(wrapper, '新建草稿').trigger('click'); await flushPromises()
  expect(cloudRows('u5', 'a')).toHaveLength(1)
  await button(wrapper, '保留本机修改').trigger('click'); await flushPromises()
  expect(row.draft.title).toBe('本机修改')
  expect(row.revision).toBe(3)
  expect(wrapper.text()).not.toContain('已在其他设备更新')
  // 再次冲突时选择载入云端版本。
  row.draft = { ...row.draft, title: '另一设备第二版' }; row.revision = 4
  await wrapper.get('[aria-label="标题或关卡"]').setValue('将被丢弃')
  await wrapper.findComponent(DataAccountContextBar).props('beforeSwitch')(); await flushPromises()
  await button(wrapper, '载入云端版本').trigger('click'); await flushPromises()
  expect(wrapper.get('[aria-label="标题或关卡"]').element.value).toBe('另一设备第二版')
  expect(saveBattleDraft).toHaveBeenLastCalledWith('u5', 'a', row.id, 3, expect.objectContaining({ title: '将被丢弃' }))
  wrapper.unmount()
})
