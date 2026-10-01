import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecruitmentAdmin from '../src/pages/recruitment/admin.vue'
import * as api from '../src/api/recruitment.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { auth } from '../src/store/auth.js'
import { deferred } from '../test-support/recruitment.js'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'admin-a' }, adminAccess: { permissions: ['recruitment_catalog:write'] } }) }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/api/recruitment.js', () => ({ listAdminRecruitmentCatalog: vi.fn(), createAdminRecruitmentPool: vi.fn(), importAdminRecruitmentCatalog: vi.fn(), updateAdminRecruitmentPool: vi.fn() }))

const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
const input = (wrapper, label) => wrapper.findAll('label').find(item => item.text().startsWith(label)).get('input')
function render() { return mount(RecruitmentAdmin, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, AdminBackLink: true } } }) }
function pool() { return { pool_id: 'pool-public', game: '代号鸢', name: '新卡池', pool_type: '限时', enabled: true, revision: 2, up_agents: [{ id: 'pool-public:up:stable', name: 'UP 占位1', operator_id: null, active: true }] } }
beforeEach(() => {
  vi.clearAllMocks(); auth.accessToken = 'synthetic'; auth.userInfo = { id: 'admin-a' }; auth.adminAccess = { permissions: ['recruitment_catalog:write'] }
  api.listAdminRecruitmentCatalog.mockResolvedValue({ pools: [pool()] }); getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'formal-a', name: '正式绝密', rarity: 5, games: ['代号鸢'], avatar: '/formal.png' }, { id: 'ru-a', name: '如鸢绝密', rarity: 5, games: ['如鸢'] }, { id: 'r4-a', name: '机密', rarity: 4, games: ['代号鸢'] }] })
  api.createAdminRecruitmentPool.mockImplementation(async body => ({ ...body, revision: 1 })); api.importAdminRecruitmentCatalog.mockResolvedValue({ created_count: 2, skipped_count: 1, created_pool_ids: ['legacy-a', 'legacy-b'], skipped_pool_ids: ['pool-public'] }); api.updateAdminRecruitmentPool.mockImplementation(async (_, body) => ({ ...body, revision: body.expected_revision + 1 }))
})

it('普通用户直接挂载管理页也不读取或写入管理员接口', async () => {
  auth.adminAccess = { permissions: [] }; const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('需要招募卡池管理权限'); expect(api.listAdminRecruitmentCatalog).not.toHaveBeenCalled(); expect(api.createAdminRecruitmentPool).not.toHaveBeenCalled(); expect(api.updateAdminRecruitmentPool).not.toHaveBeenCalled()
})
it('批量导入旧目录JSON只把文件交给导入接口并显示新增与跳过数量', async () => {
  const wrapper = render(); await flushPromises()
  const document = { catalog_revision: 'legacy', pools: [{ pool_id: 'legacy-a', game: '代号鸢', name: '旧池', up_agent_ids: [], up_agent_names: [] }] }
  const picker = wrapper.get('input[type="file"]')
  Object.defineProperty(picker.element, 'files', { configurable: true, value: [{ text: vi.fn().mockResolvedValue(JSON.stringify(document)) }] })
  await picker.trigger('change'); await flushPromises()
  expect(api.importAdminRecruitmentCatalog).toHaveBeenCalledWith(document)
  expect(wrapper.text()).toContain('导入完成：新增 2 个，跳过已存在 1 个')
  expect(api.listAdminRecruitmentCatalog).toHaveBeenCalledTimes(2)
})
it('创建N个占位，槽ID包含池身份、只提交指定snake_case契约', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '新建卡池').trigger('click'); await input(wrapper, '卡池名称').setValue('管理员新池'); await input(wrapper, 'UP 数量 N').setValue('2'); await button(wrapper, '调整 UP 数量').trigger('click')
  expect(wrapper.findAll('fieldset')).toHaveLength(2); expect(wrapper.findAll('fieldset select').every(select => !select.element.disabled)).toBe(true); await wrapper.get('form').trigger('submit'); await flushPromises()
  const body = api.createAdminRecruitmentPool.mock.calls[0][0]
  expect(body).toMatchObject({ game: '代号鸢', name: '管理员新池', expected_revision: 0, enabled: true, up_agents: [{ active: true, operator_id: null }, { active: true, operator_id: null }] }); expect(body.pool_id).toMatch(/^pool_/); expect(body.up_agents.every(slot => slot.id.startsWith(body.pool_id + ':up:'))).toBe(true); expect(new Set(body.up_agents.map(slot => slot.id)).size).toBe(2); expect(wrapper.text()).toContain('卡池已保存')
})
it('占位对应图鉴密探保留槽身份与revision，筛选同游戏绝密', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '编辑卡池').trigger('click')
  const select = wrapper.get('fieldset select'); expect(select.element.disabled).toBe(false); expect(select.text()).toContain('正式绝密'); expect(select.text()).not.toContain('如鸢绝密'); expect(select.text()).not.toContain('机密'); await select.setValue('formal-a'); await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.updateAdminRecruitmentPool.mock.calls[0]).toEqual(['pool-public', expect.objectContaining({ expected_revision: 2, up_agents: [{ id: 'pool-public:up:stable', name: '正式绝密', operator_id: 'formal-a', active: true }] })])
})
it('图鉴失败禁用选择并保留已有绑定，刷新成功后恢复选择', async () => {
  api.listAdminRecruitmentCatalog.mockResolvedValue({ pools: [{ ...pool(), up_agents: [{ ...pool().up_agents[0], name: '正式绝密', operator_id: 'formal-a' }] }] })
  getOperatorCatalog.mockRejectedValueOnce(new Error('图鉴加载失败'))
  const wrapper = render(); await flushPromises(); await button(wrapper, '编辑卡池').trigger('click')
  const select = wrapper.get('fieldset select')
  expect(select.element.disabled).toBe(true); expect(select.element.value).toBe('formal-a'); expect(wrapper.text()).toContain('图鉴加载失败'); expect(wrapper.text()).toContain('已对应图鉴，沿用已有记录身份')
  await button(wrapper, '刷新目录').trigger('click'); await flushPromises()
  expect(select.element.disabled).toBe(false); expect(select.element.value).toBe('formal-a'); expect(wrapper.text()).not.toContain('图鉴加载失败')
})
it('减少N退役旧槽，增加N使用新身份，保留旧记录引用', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '编辑卡池').trigger('click'); await input(wrapper, 'UP 数量 N').setValue('0'); await button(wrapper, '调整 UP 数量').trigger('click'); expect(wrapper.get('legend').text()).toContain('已退役')
  await input(wrapper, 'UP 数量 N').setValue('1'); await button(wrapper, '调整 UP 数量').trigger('click'); await wrapper.get('form').trigger('submit'); await flushPromises()
  const slots = api.updateAdminRecruitmentPool.mock.calls[0][1].up_agents; expect(slots).toHaveLength(2); expect(slots[0]).toMatchObject({ id: 'pool-public:up:stable', active: false }); expect(slots[1].id).not.toBe('pool-public:up:stable'); expect(slots[1].active).toBe(true)
})
it('409保留草稿聚焦错误；网络重试槽ID不变化', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '编辑卡池').trigger('click'); await input(wrapper, '卡池名称').setValue('草稿名字'); api.updateAdminRecruitmentPool.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 })).mockRejectedValueOnce(new Error('network'))
  await wrapper.get('form').trigger('submit'); await flushPromises(); expect(input(wrapper, '卡池名称').element.value).toBe('草稿名字'); expect(document.activeElement).toBe(wrapper.get('[role=alert]').element)
  await wrapper.get('form').trigger('submit'); await flushPromises(); const first = api.updateAdminRecruitmentPool.mock.calls[0][1].up_agents; await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api.updateAdminRecruitmentPool.mock.calls[2][1].up_agents).toEqual(first)
})
it('权限或登录身份变化清草稿，旧管理员读写迟到不能混入新身份', async () => {
  const late = deferred(); const wrapper = render(); await flushPromises(); await button(wrapper, '编辑卡池').trigger('click'); api.updateAdminRecruitmentPool.mockReturnValue(late.promise); await wrapper.get('form').trigger('submit')
  auth.adminAccess = { permissions: [] }; await flushPromises(); late.resolve({ ...pool(), name: '旧身份保存结果', revision: 3 }); await flushPromises(); expect(wrapper.find('form').exists()).toBe(false); expect(wrapper.text()).not.toContain('旧身份保存结果'); expect(wrapper.text()).not.toContain('卡池已保存')
  const read = deferred(); api.listAdminRecruitmentCatalog.mockReturnValue(read.promise); auth.adminAccess = { permissions: ['recruitment_catalog:write'] }; await flushPromises(); auth.userInfo = { id: 'admin-b' }; api.listAdminRecruitmentCatalog.mockResolvedValue({ pools: [] }); auth.accessToken = ''; await flushPromises(); read.resolve({ pools: [pool()] }); await flushPromises(); expect(wrapper.text()).not.toContain('新卡池')
})
it('未应用N或重复正式UP阻止写入；停用只更新同池不删除', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '编辑卡池').trigger('click'); await input(wrapper, 'UP 数量 N').setValue('2'); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api.updateAdminRecruitmentPool).not.toHaveBeenCalled()
  await button(wrapper, '调整 UP 数量').trigger('click'); for (const fieldset of wrapper.findAll('fieldset')) await fieldset.get('select').setValue('formal-a'); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api.updateAdminRecruitmentPool).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('不能重复对应')
  await wrapper.findAll('fieldset')[1].get('select').setValue(''); await wrapper.get('.check input').setValue(false); await wrapper.get('form').trigger('submit'); await flushPromises(); expect(api.updateAdminRecruitmentPool.mock.calls[0][1].enabled).toBe(false)
})
