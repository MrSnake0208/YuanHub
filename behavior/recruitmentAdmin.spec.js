import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecruitmentAdmin from '../src/pages/recruitment/admin.vue'
import * as api from '../src/api/recruitment.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { auth } from '../src/store/auth.js'
import { deferred } from '../test-support/recruitment.js'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
const dialogConfirm = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => router, onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: dialogConfirm } }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'admin-a' }, adminAccess: { permissions: ['recruitment_catalog:write'] } }) }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/api/recruitment.js', () => ({ listAdminRecruitmentCatalog: vi.fn(), createAdminRecruitmentPool: vi.fn(), importAdminRecruitmentCatalog: vi.fn(), updateAdminRecruitmentPool: vi.fn() }))

const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text().includes(text))
const input = (wrapper, label) => wrapper.findAll('label').find(item => item.text().startsWith(label)).get('input')
function render() { return mount(RecruitmentAdmin, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, AdminBackLink: true } } }) }
function pool() { return { pool_id: 'pool-public', game: '代号鸢', name: '新卡池', pool_type: '限时', enabled: true, revision: 2, up_agents: [{ id: 'pool-public:up:stable', name: 'UP 占位1', operator_id: null, active: true }] } }

beforeEach(() => {
  vi.clearAllMocks()
  dialogConfirm.mockResolvedValue(true)
  auth.accessToken = 'synthetic'
  auth.userInfo = { id: 'admin-a' }
  auth.adminAccess = { permissions: ['recruitment_catalog:write'] }
  api.listAdminRecruitmentCatalog.mockResolvedValue({ pools: [pool()] })
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'formal-a', name: '正式绝密', rarity: 5, games: ['代号鸢'], avatar: '/formal.png' }, { id: 'ru-a', name: '如鸢绝密', rarity: 5, games: ['如鸢'] }, { id: 'r4-a', name: '机密', rarity: 4, games: ['代号鸢'] }] })
  api.createAdminRecruitmentPool.mockImplementation(async body => ({ ...body, revision: 1 }))
  api.importAdminRecruitmentCatalog.mockResolvedValue({ created_count: 2, skipped_count: 1, created_pool_ids: ['legacy-a', 'legacy-b'], skipped_pool_ids: ['pool-public'] })
  api.updateAdminRecruitmentPool.mockImplementation(async (_, body) => ({ ...body, revision: body.expected_revision + 1 }))
})

it('普通用户直接挂载管理页也不读取或写入管理员接口', async () => {
  auth.adminAccess = { permissions: [] }
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('需要招募卡池管理权限')
  expect(api.listAdminRecruitmentCatalog).not.toHaveBeenCalled()
  expect(api.createAdminRecruitmentPool).not.toHaveBeenCalled()
  expect(api.updateAdminRecruitmentPool).not.toHaveBeenCalled()
})

it('批量导入旧目录JSON仍只新增不存在卡池并显示结果', async () => {
  const wrapper = render()
  await flushPromises()
  const document = { catalog_revision: 'legacy', pools: [{ pool_id: 'legacy-a', game: '代号鸢', name: '旧池', up_agent_ids: [], up_agent_names: [] }] }
  const picker = wrapper.get('input[type="file"]')
  Object.defineProperty(picker.element, 'files', { configurable: true, value: [{ text: vi.fn().mockResolvedValue(JSON.stringify(document)) }] })
  await picker.trigger('change')
  await flushPromises()
  expect(api.importAdminRecruitmentCatalog).toHaveBeenCalledWith(document)
  expect(wrapper.text()).toContain('导入完成：新增 2 个，跳过已存在 1 个')
  expect(api.listAdminRecruitmentCatalog).toHaveBeenCalledTimes(2)
})

it('新建卡池直接添加UP名额，不再经过N数量应用步骤', async () => {
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '新建卡池').trigger('click')
  await input(wrapper, '卡池名称').setValue('管理员新池')
  await button(wrapper, '添加 UP 名额').trigger('click')
  await button(wrapper, '添加 UP 名额').trigger('click')

  expect(wrapper.findAll('.up-slot-card')).toHaveLength(2)
  expect(wrapper.text()).not.toContain('UP 数量 N')
  await wrapper.findAll('.up-slot-card')[0].get('select').setValue('formal-a')
  await wrapper.findAll('.up-slot-card')[1].get('input').setValue('未实装占位')
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  const body = api.createAdminRecruitmentPool.mock.calls[0][0]
  expect(body).toMatchObject({
    game: '代号鸢',
    name: '管理员新池',
    expected_revision: 0,
    enabled: true,
    up_agents: [
      { name: '正式绝密', active: true, operator_id: 'formal-a' },
      { name: '未实装占位', active: true, operator_id: null },
    ],
  })
  expect(body.pool_id).toMatch(/^pool_/)
  expect(body.up_agents.every(slot => slot.id.startsWith(body.pool_id + ':up:'))).toBe(true)
  expect(new Set(body.up_agents.map(slot => slot.id)).size).toBe(2)
  expect(wrapper.text()).toContain('卡池已保存')
})

it('占位对应图鉴密探时保留稳定槽身份与revision，并只显示同游戏绝密', async () => {
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '管理卡池').trigger('click')

  const select = wrapper.get('.up-slot-card select')
  expect(select.element.disabled).toBe(false)
  expect(select.text()).toContain('正式绝密')
  expect(select.text()).not.toContain('如鸢绝密')
  expect(select.text()).not.toContain('机密')
  await select.setValue('formal-a')
  expect(wrapper.get('.slot-avatar img').attributes('src')).toContain('/formal.png')
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  expect(api.updateAdminRecruitmentPool.mock.calls[0]).toEqual(['pool-public', expect.objectContaining({
    expected_revision: 2,
    up_agents: [{ id: 'pool-public:up:stable', name: '正式绝密', operator_id: 'formal-a', active: true }],
  })])
})

it('图鉴失败时保留已有绑定并禁止误改映射', async () => {
  api.listAdminRecruitmentCatalog.mockResolvedValue({ pools: [{ ...pool(), up_agents: [{ ...pool().up_agents[0], name: '正式绝密', operator_id: 'formal-a' }] }] })
  getOperatorCatalog.mockRejectedValueOnce(new Error('图鉴加载失败'))
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '管理卡池').trigger('click')

  const select = wrapper.get('.up-slot-card select')
  expect(select.element.disabled).toBe(true)
  expect(select.element.value).toBe('formal-a')
  expect(wrapper.text()).toContain('图鉴加载失败')
  expect(wrapper.text()).toContain('已有绑定会保留')
  expect(wrapper.text()).toContain('当前图鉴不可用，暂时保留已有名称与绑定')
})

it('退役旧槽与新增UP是两个明确动作，旧身份保留且新槽生成新身份', async () => {
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '管理卡池').trigger('click')
  await button(wrapper, '退役').trigger('click')
  await flushPromises()

  expect(dialogConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '退役这个 UP 名额？', confirmText: '确认退役' }))
  expect(wrapper.text()).toContain('历史名额（1）')

  await button(wrapper, '添加 UP 名额').trigger('click')
  await wrapper.get('.up-slot-card input').setValue('新 UP')
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  const slots = api.updateAdminRecruitmentPool.mock.calls[0][1].up_agents
  expect(slots).toHaveLength(2)
  expect(slots[0]).toMatchObject({ id: 'pool-public:up:stable', active: false })
  expect(slots[1].id).not.toBe('pool-public:up:stable')
  expect(slots[1]).toMatchObject({ name: '新 UP', active: true })
})

it('有未保存修改时返回目录会确认，取消确认则保留编辑器', async () => {
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '管理卡池').trigger('click')
  await input(wrapper, '卡池名称').setValue('草稿名字')

  dialogConfirm.mockResolvedValueOnce(false)
  await button(wrapper, '返回卡池目录').trigger('click')
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(true)
  expect(input(wrapper, '卡池名称').element.value).toBe('草稿名字')

  dialogConfirm.mockResolvedValueOnce(true)
  await button(wrapper, '返回卡池目录').trigger('click')
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
})

it('409保留草稿聚焦错误；网络重试不会改变稳定槽ID', async () => {
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '管理卡池').trigger('click')
  await input(wrapper, '卡池名称').setValue('草稿名字')
  api.updateAdminRecruitmentPool.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 })).mockRejectedValueOnce(new Error('network'))

  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(input(wrapper, '卡池名称').element.value).toBe('草稿名字')
  expect(document.activeElement).toBe(wrapper.get('[role=alert]').element)

  await wrapper.get('form').trigger('submit')
  await flushPromises()
  const first = api.updateAdminRecruitmentPool.mock.calls[0][1].up_agents
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(api.updateAdminRecruitmentPool.mock.calls[2][1].up_agents).toEqual(first)
})

it('权限或登录身份变化清草稿，旧管理员读写迟到不能混入新身份', async () => {
  const late = deferred()
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '管理卡池').trigger('click')
  api.updateAdminRecruitmentPool.mockReturnValue(late.promise)
  await input(wrapper, '卡池名称').setValue('待提交修改')
  await wrapper.get('form').trigger('submit')

  auth.adminAccess = { permissions: [] }
  await flushPromises()
  late.resolve({ ...pool(), name: '旧身份保存结果', revision: 3 })
  await flushPromises()
  expect(wrapper.find('form').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('旧身份保存结果')
  expect(wrapper.text()).not.toContain('卡池已保存')

  const read = deferred()
  api.listAdminRecruitmentCatalog.mockReturnValue(read.promise)
  auth.adminAccess = { permissions: ['recruitment_catalog:write'] }
  await flushPromises()
  auth.userInfo = { id: 'admin-b' }
  api.listAdminRecruitmentCatalog.mockResolvedValue({ pools: [] })
  auth.accessToken = ''
  await flushPromises()
  read.resolve({ pools: [pool()] })
  await flushPromises()
  expect(wrapper.text()).not.toContain('新卡池')
})

it('重复正式UP阻止写入；停用卡池需要明确确认后才提交', async () => {
  const wrapper = render()
  await flushPromises()
  await button(wrapper, '管理卡池').trigger('click')
  await wrapper.get('.up-slot-card select').setValue('formal-a')
  await button(wrapper, '添加 UP 名额').trigger('click')
  await wrapper.findAll('.up-slot-card')[1].get('select').setValue('formal-a')

  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(api.updateAdminRecruitmentPool).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('同一个启用中的密探不能重复')

  await wrapper.findAll('.up-slot-card')[1].get('select').setValue('')
  await wrapper.findAll('.status-option input')[1].setValue()
  await wrapper.get('form').trigger('submit')
  await flushPromises()

  expect(dialogConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '停用这个卡池？', confirmText: '确认停用' }))
  expect(api.updateAdminRecruitmentPool.mock.calls[0][1].enabled).toBe(false)
})
