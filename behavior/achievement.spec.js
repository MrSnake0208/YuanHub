import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter, routeLocationKey, RouterView } from 'vue-router'
import AchievementPage from '../src/pages/achievement/index.vue'
import AchievementExchange from '../src/pages/achievement/AchievementExchange.vue'
import { useAchievement } from '../src/pages/achievement/useAchievement.js'
import * as api from '../src/api/achievement.js'
import { listAccounts } from '../src/api/accounts.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'
import { achievementArchive, achievementBackup, achievementCatalog, achievementEntry, deferredAchievement } from '../test-support/achievement.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'owner' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/config/features.js', async original => ({ ...(await original()), isFeatureEnabled: vi.fn(() => true) }))
vi.mock('../src/api/achievement.js', () => ({ getAchievementCatalog: vi.fn(), getAchievementArchive: vi.fn(), writeAchievements: vi.fn(), previewAchievements: vi.fn(), importAchievements: vi.fn(), exportAchievements: vi.fn() }))
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
function model() {
  let result
  const wrapper = mount(defineComponent({ setup() { result = useAchievement(); return () => null } }))
  return { wrapper, get result() { return result } }
}
function page() { return mount(AchievementPage, { attachTo: document.body, global: { provide: { [routeLocationKey]: { fullPath: '/achievement' } }, stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true, RouterLink: RouterLinkStub } } }) }
beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner' }
  activeAccount.set('a')
  listAccounts.mockResolvedValue([{ id: 'a', name: '甲', game: '代号鸢' }, { id: 'b', name: '乙', game: '代号鸢' }])
  api.getAchievementCatalog.mockResolvedValue(achievementCatalog())
  api.getAchievementArchive.mockImplementation(id => Promise.resolve(achievementArchive(id)))
  vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
  vi.spyOn(dialog, 'choose').mockResolvedValue({ value: null, checked: false })
})

it('游客和空账号只读公开目录，退出登录清空所有私人记录', async () => {
  auth.accessToken = ''; auth.userInfo = null
  const { result } = model(); await flushPromises()
  expect(api.getAchievementArchive).not.toHaveBeenCalled(); expect(listAccounts).not.toHaveBeenCalled()
  expect(result.entries.value).toHaveLength(3); expect(result.writable.value).toBe(false)
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner' }; await flushPromises()
  expect(result.state.archive.account_id).toBe('a')
  auth.accessToken = ''; await flushPromises()
  expect(result.state.archive).toBeNull(); expect(result.records.value).toEqual([])
})
it('账号 A 迟到读取和保存不会覆盖 B，新用户不能接收旧用户账号列表', async () => {
  const pending = deferredAchievement()
  api.getAchievementArchive.mockImplementation(id => id === 'a' ? pending.promise : Promise.resolve(achievementArchive(id, { revision: 7 })))
  const { result } = model(); await flushPromises()
  activeAccount.set('b'); await flushPromises()
  pending.resolve(achievementArchive('a', { revision: 99 })); await flushPromises()
  expect(result.state.archive.account_id).toBe('b'); expect(result.state.archive.revision).toBe(7)
  const write = deferredAchievement(); api.writeAchievements.mockReturnValue(write.promise)
  const saving = result.save([{ achievement_id: 'yh_fixture_dhy_1', status: 'completed' }])
  activeAccount.set('a'); await flushPromises()
  write.resolve(achievementArchive('b', { revision: 8 })); await saving
  expect(result.state.archive.account_id).toBe('a')
  const oldAccounts = deferredAchievement(); listAccounts.mockReturnValueOnce(oldAccounts.promise)
  const loading = result.loadAccounts()
  auth.userInfo = { id: 'new-owner' }; listAccounts.mockResolvedValue([]); await flushPromises()
  oldAccounts.resolve([{ id: 'private-old', game: '代号鸢' }]); await loading
  expect(result.state.accounts.some(item => item.id === 'private-old')).toBe(false)
})
it('成功后才更新、失败不假保存，撤销恢复待核对而不改成未完成', async () => {
  const { result } = model(); await flushPromises()
  const wait = deferredAchievement(); api.writeAchievements.mockReturnValueOnce(wait.promise)
  const saving = result.save([{ achievement_id: 'yh_fixture_dhy_1', status: 'completed' }])
  expect(result.recordFor('yh_fixture_dhy_1').status).toBe('pending')
  wait.resolve(achievementArchive('a', { revision: 1, records: [{ achievement_id: 'yh_fixture_dhy_1', status: 'completed', favorite: false, note: '', progress: null, completed_on: null }] }))
  await saving
  expect(result.summary.value.completed).toBe(1)
  api.writeAchievements.mockResolvedValueOnce(achievementArchive('a', { revision: 2 }))
  await result.undo()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 1, [{ achievement_id: 'yh_fixture_dhy_1', status: 'pending', completed_on: null }])
  expect(result.summary.value.incomplete).toBe(3)
  api.writeAchievements.mockRejectedValueOnce(new Error('网络断开'))
  expect(await result.save([{ achievement_id: 'yh_fixture_dhy_1', status: 'completed' }])).toBe(false)
  expect(result.summary.value.completed).toBe(0); expect(result.state.notice).toBe(''); expect(result.state.error).toBe('网络断开')
})
it('revision 冲突重新读取，不继续采用旧版撤销', async () => {
  const { result } = model(); await flushPromises()
  api.writeAchievements.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 }))
  api.getAchievementArchive.mockResolvedValue(achievementArchive('a', { revision: 9 }))
  await result.save([{ achievement_id: 'yh_fixture_dhy_1', status: 'completed' }])
  expect(result.state.archive.revision).toBe(9); expect(result.state.undo).toBeNull(); expect(result.state.error).toContain('已变化')
})
it('选择本页只含50条，过滤清空选择，确认期间切账号不写入', async () => {
  api.getAchievementCatalog.mockResolvedValue(achievementCatalog(55))
  const wrapper = page(); await flushPromises()
  await button(wrapper, '批量记录').trigger('click'); await button(wrapper, '选择本页（50 条）').trigger('click')
  api.writeAchievements.mockResolvedValue(achievementArchive('a', { revision: 1 }))
  await button(wrapper, '标记已完成').trigger('click'); await flushPromises()
  expect(api.writeAchievements.mock.calls[0][3]).toHaveLength(50)
  expect(api.writeAchievements.mock.calls[0][3].some(row => row.achievement_id === 'yh_fixture_dhy_51')).toBe(false)
  await button(wrapper, '选择本页（50 条）').trigger('click')
  await wrapper.get('input[type="search"]').setValue('成就 1'); await flushPromises()
  expect(wrapper.get('.achievement-batch').text()).toContain('已选 0 条')
  await button(wrapper, '选择本页（11 条）').trigger('click')
  const confirmation = deferredAchievement(); dialog.confirm.mockReturnValueOnce(confirmation.promise)
  await button(wrapper, '标记已完成').trigger('click'); activeAccount.set('b'); await flushPromises()
  confirmation.resolve(true); await flushPromises()
  expect(api.writeAchievements).toHaveBeenCalledTimes(1)
})
it('导入预览不提交、未知需确认、revision 变化使预览失效', async () => {
  const wrapper = mount(AchievementExchange, { props: { open: true, accountId: 'a', accountName: '甲', identity: 'owner', game: '代号鸢', revision: 0, contextVersion: 1, canRecord: true }, global: { stubs: { Teleport: true } } })
  const plan = { account_id: 'a', game: '代号鸢', strategy: 'keep_current', expected_revision: 0, catalog_version: 'fixture-v1', affected: 1, stats: { add: 1, same: 0, conflict: 0, invalid: 0, unknown: 1 }, items: [] }
  api.previewAchievements.mockResolvedValue(plan)
  Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { value: [{ size: 100, name: 'backup.json', text: async () => JSON.stringify(achievementBackup([])) }], configurable: true })
  await wrapper.get('input[type="file"]').trigger('change'); await flushPromises()
  expect(api.importAchievements).not.toHaveBeenCalled()
  expect(button(wrapper, '确认导入到此账号').element.disabled).toBe(true)
  await wrapper.get('input[type="checkbox"]').setValue(true)
  expect(button(wrapper, '确认导入到此账号').element.disabled).toBe(false)
  await wrapper.setProps({ revision: 1 }); await flushPromises()
  expect(wrapper.find('[aria-label="成就导入预览"]').exists()).toBe(false)
})

it('手机更多筛选使用同一集合，确认期间换账号丢弃选择', async () => {
  api.getAchievementCatalog.mockResolvedValue(achievementCatalog(3))
  const wrapper = page(); await flushPromises()
  dialog.choose.mockResolvedValueOnce({ value: 'hidden' })
  await wrapper.get('.achievement-mobile-filters').trigger('click'); await flushPromises()
  expect(wrapper.get('.achievement-results').text()).toContain('命中 1 条')
  expect(wrapper.get('.achievement-title').text()).toBe('测试成就 2')
  await button(wrapper, '清除筛选').trigger('click'); await flushPromises()
  const waiting = deferredAchievement(); dialog.choose.mockReturnValueOnce(waiting.promise)
  await wrapper.get('.achievement-mobile-filters').trigger('click')
  activeAccount.set('b'); await flushPromises()
  waiting.resolve({ value: 'hidden' }); await flushPromises()
  expect(wrapper.get('.achievement-results').text()).toContain('命中 3 条')
})

it('导入成功才发出已保存事件，409保留文件并要求重新预览', async () => {
  const wrapper = mount(AchievementExchange, { props: { open: true, accountId: 'a', accountName: '甲', identity: 'owner', game: '代号鸢', revision: 0, contextVersion: 1, canRecord: true }, global: { stubs: { Teleport: true } } })
  const plan = { account_id: 'a', game: '代号鸢', strategy: 'keep_current', expected_revision: 0, catalog_version: 'fixture-v1', preview_token: 'fixture-token', affected: 1, stats: { add: 1, same: 0, conflict: 0, invalid: 0, unknown: 0 }, items: [] }
  api.previewAchievements.mockResolvedValue(plan)
  Object.defineProperty(wrapper.get('input[type="file"]').element, 'files', { value: [{ size: 100, name: 'backup.json', text: async () => JSON.stringify(achievementBackup([])) }], configurable: true })
  await wrapper.get('input[type="file"]').trigger('change'); await flushPromises()
  api.importAchievements.mockRejectedValueOnce(Object.assign(new Error('档案已变化，请重新预览'), { status: 409 }))
  await button(wrapper, '确认导入到此账号').trigger('click'); await flushPromises()
  expect(wrapper.emitted('committed')).toBeUndefined()
  expect(wrapper.find('[aria-label="成就导入预览"]').exists()).toBe(false)
  expect(wrapper.text()).toContain('backup.json')
  await button(wrapper, '生成导入预览').trigger('click'); await flushPromises()
  const waiting = deferredAchievement(); api.importAchievements.mockReturnValueOnce(waiting.promise)
  await button(wrapper, '确认导入到此账号').trigger('click'); await flushPromises()
  expect(wrapper.emitted('committed')).toBeUndefined()
  waiting.resolve(achievementArchive('a', { revision: 1 })); await flushPromises()
  expect(wrapper.emitted('committed')[0][0].revision).toBe(1)
  expect(api.importAchievements).toHaveBeenLastCalledWith('a', 'owner', expect.any(Object), plan, false)
})

function mockArchiveWrites(records = []) {
  let archive = achievementArchive('a', { revision: 1, records })
  api.getAchievementArchive.mockImplementation(id => Promise.resolve(id === 'a' ? archive : achievementArchive(id)))
  api.writeAchievements.mockImplementation(async (id, owner, revision, patches) => {
    const next = new Map(archive.records.map(record => [record.achievement_id, record]))
    for (const patch of patches) next.set(patch.achievement_id, { ...next.get(patch.achievement_id) || { achievement_id: patch.achievement_id, status: 'pending', favorite: false, note: '', progress: null, completed_on: null }, ...patch })
    archive = achievementArchive(id, { revision: revision + 1, records: [...next.values()] })
    return archive
  })
}
it('保存期间阻止重复提交，失败保留实际状态且不误开详情', async () => {
  const wrapper = page(); await flushPromises()
  const waiting = deferredAchievement(); api.writeAchievements.mockReturnValueOnce(waiting.promise)
  await wrapper.findAll('.achievement-row')[0].get('.status-completed').trigger('click')
  expect(wrapper.findAll('.achievement-row')[0].get('.status-incomplete').attributes('aria-pressed')).toBe('true')
  expect(wrapper.findAll('.achievement-row')[0].get('.status-completed').element.disabled).toBe(true)
  await wrapper.findAll('.achievement-row')[0].get('.status-completed').trigger('click')
  expect(api.writeAchievements).toHaveBeenCalledTimes(1)
  waiting.reject(new Error('保存失败测试')); await flushPromises()
  expect(wrapper.findAll('.achievement-row')[0].get('.status-incomplete').attributes('aria-pressed')).toBe('true')
  expect(wrapper.find('.achievement-detail').exists()).toBe(false)
  expect(wrapper.text()).toContain('保存失败测试')
})
it('奖励/分类/状态/关注组合与分组计数来自真实目录，清除恢复全部', async () => {
  const catalog = achievementCatalog(3)
  catalog.categories.push({ category_id: 'other', name: '另一测试分类' })
  catalog.entries[0].rewards = [{ item_key: 'test', name: '测试资源', quantity: 1 }]
  catalog.entries[1].rewards = [{ item_key: 'test', name: '测试资源', quantity: 2 }]
  catalog.entries[2].category_id = 'other'; catalog.entries[2].rewards = [{ item_key: 'token', name: '测试凭证', quantity: 1 }]
  api.getAchievementCatalog.mockResolvedValue(catalog)
  mockArchiveWrites([{ achievement_id: catalog.entries[0].achievement_id, status: 'completed', favorite: true, note: '', progress: null, completed_on: null }])
  const wrapper = page(); await flushPromises()
  expect(wrapper.findAll('.achievement-group-heading').map(item => item.text())).toEqual(['测试分类1 / 2', '另一测试分类0 / 1'])
  expect(wrapper.findAll('datalist option').map(item => item.attributes('value'))).toEqual(['测试资源', '测试凭证'])
  await wrapper.get('[aria-label="成就奖励筛选"]').setValue('测试资源')
  await wrapper.get('[aria-label="游戏分类筛选"]').setValue('test')
  await wrapper.get('[aria-label="成就状态筛选"]').setValue('completed')
  await wrapper.get('.achievement-toolbar input[type="checkbox"]').setValue(true)
  expect(wrapper.findAll('.achievement-row')).toHaveLength(1)
  expect(wrapper.get('.achievement-group-heading').text()).toBe('测试分类1 / 2')
  await wrapper.get('[aria-label="成就奖励筛选"]').setValue('未收录奖励')
  expect(wrapper.findAll('.achievement-row')).toHaveLength(0)
  expect(wrapper.get('.achievement-empty').text()).toContain('没有匹配')
  await button(wrapper, '清除条件并查看全部').trigger('click')
  expect(wrapper.findAll('.achievement-row')).toHaveLength(3)
})
it('游客两态和关注只读，非量化条目没有进度条，空目录不生成假成就', async () => {
  auth.accessToken = ''; auth.userInfo = null
  const wrapper = page(); await flushPromises()
  expect(wrapper.findAll('.achievement-row .achievement-status button')).toHaveLength(6)
  expect(wrapper.findAll('.achievement-row .achievement-status button').every(item => item.element.disabled)).toBe(true)
  expect(wrapper.findAll('.achievement-favorite').every(item => item.element.disabled)).toBe(true)
  expect(wrapper.find('progress').exists()).toBe(false)
  expect(api.writeAchievements).not.toHaveBeenCalled()
  wrapper.unmount()
  api.getAchievementCatalog.mockResolvedValue(achievementCatalog(0))
  const empty = page(); await flushPromises()
  expect(empty.findAll('.achievement-row')).toHaveLength(0)
  expect(empty.get('.achievement-empty').text()).toContain('暂无可发布成就资料')
  expect(empty.get('.stat-total b').text()).toBe('0')
})




it('账号档案读取失败时无伪造选中状态，所有写入控件禁用', async () => {
  api.getAchievementArchive.mockRejectedValue(new Error('档案读取失败测试'))
  const wrapper = page(); await flushPromises()
  expect(wrapper.get('.stat-completed b').text()).toBe('—')
  expect(wrapper.findAll('.achievement-row .achievement-status button').every(item => item.element.disabled && item.attributes('aria-pressed') === 'false')).toBe(true)
  await wrapper.findAll('.achievement-row')[0].get('.status-completed').trigger('click')
  expect(api.writeAchievements).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('档案读取失败测试')
})

it('历史待核对、未完成和无记录映射两态，四项统计不写回旧档案', async () => {
  const catalog = achievementCatalog(4)
  api.getAchievementCatalog.mockResolvedValue(catalog)
  mockArchiveWrites([{ achievement_id: catalog.entries[0].achievement_id, status: 'pending', favorite: true }, { achievement_id: catalog.entries[1].achievement_id, status: 'incomplete' }, { achievement_id: catalog.entries[2].achievement_id, status: 'completed' }])
  const wrapper = page(); await flushPromises()
  expect(wrapper.findAll('.achievement-stat')).toHaveLength(4)
  expect(wrapper.get('.stat-incomplete b').text()).toBe('3')
  expect(wrapper.get('.stat-completed b').text()).toBe('1')
  expect(wrapper.get('.stat-favorite b').text()).toBe('1')
  expect(wrapper.findAll('[aria-label="成就状态筛选"] option').map(option => option.text())).toEqual(['全部状态', '未完成', '已完成'])
  expect(wrapper.findAll('.achievement-status button')).toHaveLength(8)
  expect(wrapper.findAll('.status-incomplete[aria-pressed="true"]')).toHaveLength(3)
  expect(wrapper.find('.achievement-detail').exists()).toBe(false)
  expect(wrapper.find('aside').exists()).toBe(false)
  expect(wrapper.find('button.achievement-title').exists()).toBe(false)
  expect(api.writeAchievements).not.toHaveBeenCalled()
  await wrapper.get('[aria-label="成就状态筛选"]').setValue('incomplete')
  expect(wrapper.findAll('.achievement-row')).toHaveLength(3)
  await wrapper.findAll('.achievement-row')[0].get('.status-incomplete').trigger('click'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 1, [{ achievement_id: catalog.entries[0].achievement_id, status: 'incomplete' }])
})

it('两态仅提交状态，关注独立，进度和备注不随状态清空或填满', async () => {
  const record = { achievement_id: 'yh_fixture_dhy_1', status: 'pending', favorite: true, note: '已有备注', progress: 3, completed_on: null }
  mockArchiveWrites([record])
  const catalog = achievementCatalog(); catalog.entries[0] = achievementEntry(1, { target: 10 })
  api.getAchievementCatalog.mockResolvedValue(catalog)
  const wrapper = page(); await flushPromises()
  const row = wrapper.findAll('.achievement-row')[0]
  for (const status of ['completed', 'incomplete']) {
    await row.get('.status-' + status).trigger('click'); await flushPromises()
    expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', expect.any(Number), [{ achievement_id: record.achievement_id, status }])
    expect(row.findAll('.achievement-status [aria-pressed="true"]')).toHaveLength(1)
    expect(row.get('.achievement-progress-edit').text()).toBe('3 / 10')
  }
  await row.get('.achievement-favorite').trigger('click'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 3, [{ achievement_id: record.achievement_id, favorite: false }])
  expect(wrapper.get('.stat-favorite b').text()).toBe('0')
  await row.get('.achievement-note-toggle').trigger('click')
  expect(row.get('textarea').element.value).toBe('已有备注')
})

it('未完成筛选中保存成功提示停留6秒后移出，撤销恢复历史待核对且不改筛选', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    api.getAchievementCatalog.mockResolvedValue(achievementCatalog(1)); mockArchiveWrites()
    const wrapper = page(); await flushPromises()
    await wrapper.get('[aria-label="成就状态筛选"]').setValue('incomplete')
    await wrapper.get('.status-completed').trigger('click'); await flushPromises()
    expect(wrapper.get('.achievement-row-feedback').text()).toContain('已标记完成')
    expect(wrapper.get('.stat-completed b').text()).toBe('1')
    expect(wrapper.get('.stat-incomplete b').text()).toBe('0')
    await vi.advanceTimersByTimeAsync(6000); await flushPromises()
    expect(wrapper.findAll('.achievement-row')).toHaveLength(0)
    await button(wrapper, '撤销').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.achievement-row')).toHaveLength(1)
    expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 2, [{ achievement_id: 'yh_fixture_dhy_1', status: 'pending', completed_on: null }])
    expect(wrapper.get('[aria-label="成就状态筛选"]').element.value).toBe('incomplete')
  } finally { vi.useRealTimers() }
})

it('历史来源、完成方法和章节不显示或留下空补充区，不保留剧透入口', async () => {
  const catalog = achievementCatalog(2)
  catalog.entries.forEach(entry => {
    entry.sources = [{ title: '历史资料来源', url: 'https://example.test/legacy', usage: '测试资料' }]
    entry.method = '历史完成方法'; entry.chapter = '历史章节'
  })
  catalog.entries[1].spoiler = '测试剧透'
  api.getAchievementCatalog.mockResolvedValue(catalog)
  const wrapper = page(); await flushPromises()
  const rows = wrapper.findAll('.achievement-row')
  expect(rows[0].find('.achievement-supplement').exists()).toBe(false)
  expect(rows[1].find('.achievement-supplement').exists()).toBe(false)
  expect(rows[1].text()).not.toContain('测试剧透')
  expect(wrapper.text()).not.toContain('历史资料来源')
  expect(wrapper.text()).not.toContain('历史完成方法')
  expect(wrapper.text()).not.toContain('历史章节')
  expect(wrapper.find('a[href="https://example.test/legacy"]').exists()).toBe(false)
})

it('进度未知无假0或进度条；行内合法进度和备注分别保存、不自动完成', async () => {
  const catalog = achievementCatalog(); catalog.entries[0] = achievementEntry(1, { target: 10, method: '测试说明', spoiler: '测试剧透' })
  api.getAchievementCatalog.mockResolvedValue(catalog); mockArchiveWrites()
  const wrapper = page(); await flushPromises()
  const row = wrapper.findAll('.achievement-row')[0]
  expect(row.get('.achievement-progress-edit').text()).toContain('进度未记录')
  expect(row.find('progress').exists()).toBe(false)
  expect(row.find('.achievement-supplement').exists()).toBe(false)
  await row.get('.achievement-progress-edit').trigger('click')
  await row.get('input[type="number"]').setValue('1.5')
  expect(row.get('[type="submit"]').element.disabled).toBe(true)
  await row.get('.achievement-progress-form').trigger('submit'); expect(api.writeAchievements).not.toHaveBeenCalled()
  await row.get('input[type="number"]').setValue('12')
  await row.get('.achievement-progress-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 1, [{ achievement_id: 'yh_fixture_dhy_1', progress: 12 }])
  expect(row.get('progress').attributes('value')).toBe('12')
  expect(row.get('.status-incomplete').attributes('aria-pressed')).toBe('true')
  await row.get('.achievement-note-toggle').trigger('click')
  await row.get('textarea').setValue('只保存备注')
  await row.get('.achievement-note-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 2, [{ achievement_id: 'yh_fixture_dhy_1', note: '只保存备注' }])
  await row.get('.achievement-progress-edit').trigger('click'); await row.get('input[type="number"]').setValue('')
  await row.get('.achievement-progress-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 3, [{ achievement_id: 'yh_fixture_dhy_1', progress: null }])
  expect(row.find('progress').exists()).toBe(false)
})

it('多个行内草稿在状态保存、筛选隐藏、翻页及恢复后仍保留，取消和切账号可拒绝', async () => {
  api.getAchievementCatalog.mockResolvedValue(achievementCatalog(55)); mockArchiveWrites()
  const wrapper = page(); await flushPromises()
  const row = wrapper.findAll('.achievement-row')[0]
  await row.get('.achievement-note-toggle').trigger('click'); await row.get('textarea').setValue('未保存备注')
  await row.get('.status-completed').trigger('click'); await flushPromises()
  expect(row.get('textarea').element.value).toBe('未保存备注')
  await wrapper.get('input[type="search"]').setValue('不存在'); await flushPromises()
  expect(wrapper.findAll('.achievement-row')).toHaveLength(0)
  await button(wrapper, '返回编辑').trigger('click'); await flushPromises()
  expect(wrapper.get('textarea').element.value).toBe('未保存备注')
  await button(wrapper, '下一页').trigger('click'); await flushPromises()
  await button(wrapper, '返回编辑').trigger('click'); await flushPromises()
  expect(wrapper.get('textarea').element.value).toBe('未保存备注')
  dialog.confirm.mockResolvedValueOnce(false)
  await button(wrapper, '取消').trigger('click'); await flushPromises()
  expect(wrapper.get('textarea').element.value).toBe('未保存备注')
  dialog.confirm.mockResolvedValueOnce(false)
  expect(await wrapper.findComponent({ name: 'DataAccountContextBar' }).props('beforeSwitch')()).toBe(false)
  await wrapper.get('.achievement-note-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 2, [{ achievement_id: 'yh_fixture_dhy_1', note: '未保存备注' }])
})

it('备注409保留草稿，目录读取失败与重试不丢草稿，重新保存使用最新revision', async () => {
  mockArchiveWrites()
  const wrapper = page(); await flushPromises()
  await wrapper.findAll('.achievement-note-toggle')[0].trigger('click')
  await wrapper.get('textarea').setValue('冲突草稿')
  api.writeAchievements.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 }))
  api.getAchievementArchive.mockResolvedValueOnce(achievementArchive('a', { revision: 9 }))
  api.getAchievementCatalog.mockRejectedValueOnce(new Error('目录暂时无法读取'))
  await wrapper.get('.achievement-note-form').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('目录暂时无法读取')
  expect(wrapper.get('.achievement-feedback').text()).toContain('未保存')
  await button(wrapper, '重新读取').trigger('click'); await flushPromises()
  expect(wrapper.get('textarea').element.value).toBe('冲突草稿')
  await wrapper.get('.achievement-note-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 1, [{ achievement_id: 'yh_fixture_dhy_1', note: '冲突草稿' }])
})

it('行内备注通过真实路由守卫阻止离开，确认放弃后才离开', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/achievement', component: AchievementPage }, { path: '/next', component: defineComponent({ template: '<p>下一页</p>' }) }] })
  await router.push('/achievement'); await router.isReady()
  const wrapper = mount(RouterView, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true } } })
  await flushPromises()
  await wrapper.findAll('.achievement-note-toggle')[0].trigger('click'); await wrapper.get('textarea').setValue('离开前的草稿')
  dialog.confirm.mockResolvedValueOnce(false); await router.push('/next'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/achievement')
  expect(wrapper.get('textarea').element.value).toBe('离开前的草稿')
  dialog.confirm.mockResolvedValueOnce(true); await router.push('/next'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/next'); expect(api.writeAchievements).not.toHaveBeenCalled()
})

it('切换账号清除旧草稿，迟到保存不关闭或覆盖新账号编辑器', async () => {
  const wrapper = page(); await flushPromises()
  await wrapper.findAll('.achievement-note-toggle')[0].trigger('click'); await wrapper.get('textarea').setValue('甲的草稿')
  const write = deferredAchievement(); api.writeAchievements.mockReturnValueOnce(write.promise)
  await wrapper.get('.achievement-note-form').trigger('submit'); await flushPromises()
  activeAccount.set('b'); await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  await wrapper.findAll('.achievement-note-toggle')[0].trigger('click'); await wrapper.get('textarea').setValue('乙的草稿')
  write.resolve(achievementArchive('a', { revision: 8, records: [{ achievement_id: 'yh_fixture_dhy_1', note: '甲的草稿' }] })); await flushPromises()
  expect(wrapper.get('textarea').element.value).toBe('乙的草稿')
  expect(wrapper.get('.stat-completed b').text()).toBe('0')
})

it('保存响应归属不匹配时拒绝更新当前账号', async () => {
  const { result } = model(); await flushPromises()
  api.writeAchievements.mockResolvedValueOnce(achievementArchive('b', { revision: 8 }))
  expect(await result.save([{ achievement_id: 'yh_fixture_dhy_1', status: 'completed' }])).toBe(false)
  expect(result.state.archive.account_id).toBe('a')
  expect(result.state.error).toContain('归属不一致')
})

it('进度保存失败保留草稿与原数值，在当前行提示错误，取消确认后返回入口焦点', async () => {
  const catalog = achievementCatalog(); catalog.entries[0] = achievementEntry(1, { target: 10 })
  api.getAchievementCatalog.mockResolvedValue(catalog)
  const wrapper = page(); await flushPromises()
  const row = wrapper.findAll('.achievement-row')[0]
  await row.get('.achievement-progress-edit').trigger('click'); await flushPromises()
  expect(document.activeElement).toBe(row.get('input[type="number"]').element)
  await row.get('input[type="number"]').setValue('2')
  api.writeAchievements.mockRejectedValueOnce(new Error('进度网络失败'))
  await row.get('form').trigger('submit'); await flushPromises()
  expect(row.get('input[type="number"]').element.value).toBe('2')
  expect(row.get('.achievement-progress-edit').text()).toContain('进度未记录')
  expect(row.get('[role="alert"]').text()).toBe('进度网络失败')
  await button(row, '取消').trigger('click'); await flushPromises()
  expect(row.find('form').exists()).toBe(false)
  expect(document.activeElement).toBe(row.get('.achievement-progress-edit').element)
})

it('进度和备注同时编辑，分别保存不会丢弃另一个字段的草稿', async () => {
  const catalog = achievementCatalog(); catalog.entries[0] = achievementEntry(1, { target: 10 })
  api.getAchievementCatalog.mockResolvedValue(catalog); mockArchiveWrites()
  const wrapper = page(); await flushPromises()
  const row = wrapper.findAll('.achievement-row')[0]
  await row.get('.achievement-progress-edit').trigger('click'); await row.get('input[type="number"]').setValue('7')
  await row.get('.achievement-note-toggle').trigger('click'); await row.get('textarea').setValue('另一字段草稿')
  await row.get('.achievement-progress-form').trigger('submit'); await flushPromises()
  expect(row.get('textarea').element.value).toBe('另一字段草稿')
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 1, [{ achievement_id: 'yh_fixture_dhy_1', progress: 7 }])
  await row.get('.achievement-note-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 2, [{ achievement_id: 'yh_fixture_dhy_1', note: '另一字段草稿' }])
  expect(row.get('.achievement-progress-edit').text()).toBe('7 / 10')
})

it('完成日期草稿在两态切换和备注单独保存后保留，返回已完成再保存日期', async () => {
  mockArchiveWrites([{ achievement_id: 'yh_fixture_dhy_1', status: 'completed', completed_on: null }])
  const wrapper = page(); await flushPromises()
  const row = wrapper.findAll('.achievement-row')[0]
  await row.get('.achievement-note-toggle').trigger('click')
  await row.get('input[type="date"]').setValue('2026-10-17')
  await row.get('.status-incomplete').trigger('click'); await flushPromises()
  expect(row.get('input[type="date"]').element.value).toBe('2026-10-17')
  expect(row.get('input[type="date"]').element.disabled).toBe(true)
  await row.get('textarea').setValue('只存备注')
  await row.get('.achievement-note-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 2, [{ achievement_id: 'yh_fixture_dhy_1', note: '只存备注' }])
  expect(row.get('input[type="date"]').element.value).toBe('2026-10-17')
  await row.get('.status-completed').trigger('click'); await flushPromises()
  await row.get('.achievement-note-form').trigger('submit'); await flushPromises()
  expect(api.writeAchievements).toHaveBeenLastCalledWith('a', 'owner', 4, [{ achievement_id: 'yh_fixture_dhy_1', completed_on: '2026-10-17' }])
})

it('结构化奖励三态和旧奖励文本保留，指标缺失不伪造零进度', async () => {
  const catalog = achievementCatalog(4)
  catalog.entries[0].rewards = [{ item_key: 'baijinbi', name: '白金币', quantity: 10 }]
  catalog.entries[1].rewards = []
  catalog.entries[2].target = 20; catalog.entries[2].linked_metric = 'yuan_bond_variants'
  catalog.legacy_rewards = { [catalog.entries[3].achievement_id]: '旧奖励内容' }
  api.getAchievementCatalog.mockResolvedValue(catalog)
  const w = page(); await flushPromises()
  expect(w.text()).toContain('白金币 × 10'); expect(w.text()).toContain('无奖励')
  expect(w.text()).toContain('奖励资料未补齐'); expect(w.text()).toContain('旧奖励内容（旧文本，未结构化）')
  expect(w.text()).toContain('羁绊进度未读取')
  expect(w.findAll('progress')).toHaveLength(0)
  expect(w.findAll('.achievement-progress-edit')).toHaveLength(0)
})

it('羁绊只读进度达标提示和取消不反向修改人工完成状态', async () => {
  const catalog = achievementCatalog(1)
  catalog.entries[0].target = 20; catalog.entries[0].linked_metric = 'yuan_bond_variants'
  api.getAchievementCatalog.mockResolvedValue(catalog)
  const current = { ...achievementArchive('a'), linked_metrics: [{ metric: 'yuan_bond_variants', value: 25, source_revision: 3, source_catalog_version: 'fixture-bonds' }], records: [{ achievement_id: catalog.entries[0].achievement_id, status: 'pending', progress: 7, note: '' }] }
  api.getAchievementArchive.mockResolvedValue(current)
  const w = page(); await flushPromises()
  expect(w.text()).toContain('羁绊已记录进度 20 / 20'); expect(w.text()).toContain('记录已达标，可确认完成'); expect(w.text()).toContain('历史人工进度 7')
  expect(api.writeAchievements).not.toHaveBeenCalled()
  api.writeAchievements.mockResolvedValue({ ...current, revision: 1, records: [{ ...current.records[0], status: 'completed' }] })
  await w.get('.status-completed').trigger('click'); await flushPromises()
  api.getAchievementArchive.mockResolvedValue({ ...current, revision: 1, linked_metrics: [{ ...current.linked_metrics[0], value: 19 }], records: [{ ...current.records[0], status: 'completed' }] })
  await button(w, '刷新档案').trigger('click'); await flushPromises()
  expect(w.text()).toContain('羁绊已记录进度 19 / 20'); expect(w.get('.status-completed').attributes('aria-pressed')).toBe('true')
  expect(api.writeAchievements).toHaveBeenCalledTimes(1)
})
