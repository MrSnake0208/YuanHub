import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { routeLocationKey } from 'vue-router'
import AchievementPage from '../src/pages/achievement/index.vue'
import AchievementDetail from '../src/pages/achievement/AchievementDetail.vue'
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
  expect(result.summary.value.pending).toBe(3)
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
it('一键完成在未完成筛选下成功才移除，撤销保持筛选与恢复原记录', async () => {
  const record = { achievement_id: 'yh_fixture_dhy_1', status: 'incomplete', favorite: false, note: '', progress: null, completed_on: null }
  api.getAchievementArchive.mockResolvedValue(achievementArchive('a', { revision: 1, records: [record] }))
  const wrapper = page(); await flushPromises()
  await wrapper.get('select[aria-label="成就状态筛选"]').setValue('incomplete')
  const wait = deferredAchievement(); api.writeAchievements.mockReturnValueOnce(wait.promise)
  await wrapper.get('.achievement-row-actions input').setValue(true)
  expect(wrapper.findAll('.achievement-row')).toHaveLength(1)
  wait.resolve(achievementArchive('a', { revision: 2, records: [{ ...record, status: 'completed' }] })); await flushPromises()
  expect(wrapper.findAll('.achievement-row')).toHaveLength(0)
  api.writeAchievements.mockResolvedValueOnce(achievementArchive('a', { revision: 3, records: [record] }))
  await button(wrapper, '撤销').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.achievement-row')).toHaveLength(1)
  expect(wrapper.get('select[aria-label="成就状态筛选"]').element.value).toBe('incomplete')
})
it('详情编辑备注只提交备注、剧透折叠、进度达标不自动完成', async () => {
  const wrapper = mount(AchievementDetail, { props: { entry: achievementEntry(1, { spoiler: '剧透', progress_kind: 'integer', target: 10, unit: '次' }), canRecord: true, record: { achievement_id: 'yh_fixture_dhy_1', status: 'pending', favorite: false, note: '', progress: null, completed_on: null } }, global: { stubs: { Teleport: true } } })
  expect(wrapper.get('details').attributes('open')).toBeUndefined()
  await wrapper.get('textarea').setValue('仅备注')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[0][0]).toEqual({ achievement_id: 'yh_fixture_dhy_1', note: '仅备注' })
  await wrapper.get('input[type="number"]').setValue('10')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('save')[1][0]).toEqual({ achievement_id: 'yh_fixture_dhy_1', note: '仅备注', progress: 10 })
  expect(wrapper.text()).toContain('不会自动标记完成')
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
