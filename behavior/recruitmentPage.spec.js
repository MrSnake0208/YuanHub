import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import RecruitmentPage from '../src/pages/recruitment/index.vue'
import * as api from '../src/api/recruitment.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { beta } from '../src/store/beta.js'
import { dialog } from '../src/utils/dialog.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'
import { deferred, recruitmentCatalog, recruitmentEvent, recruitmentFixture } from '../test-support/recruitment.js'
import { isFeatureEnabled } from '../src/config/features.js'

vi.mock('../src/config/features.js', () => ({ FEATURE_KEYS: { RECRUITMENT_ARCHIVE: 'recruitmentArchive' }, isFeatureEnabled: vi.fn(() => true) }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'user-a' } }) }))
vi.mock('../src/store/beta.js', async () => ({ beta: (await import('vue')).reactive({ canUseBetaFeatures: true }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/api/recruitment.js', () => ({ getRecruitmentArchive: vi.fn(), listRecruitmentEvents: vi.fn(), listRecruitmentBatches: vi.fn(), getRecruitmentCatalog: vi.fn(), recruitmentCommand: vi.fn(), exportRecruitment: vi.fn(), previewRecruitmentImport: vi.fn(), commitRecruitmentImport: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: vi.fn(() => vi.fn()) }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

let archives, events
function render(stubs = {}) { return mount(RecruitmentPage, { attachTo: document.body, global: { stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true, RecruitmentExchange: true, Teleport: true, RouterLink: RouterLinkStub, ...stubs } } }) }
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
beforeEach(() => {
  vi.clearAllMocks(); isFeatureEnabled.mockReturnValue(true); auth.accessToken = 'synthetic'; auth.userInfo = { id: 'user-a' }; beta.canUseBetaFeatures = true
  activeAccount.set('acc-a'); activeAccount.setGame('代号鸢', 'acc-a'); activeAccount.setGame('代号鸢', 'acc-b')
  archives = { 'acc-a': recruitmentFixture(), 'acc-b': { ...recruitmentFixture('acc-b'), summary: { ...recruitmentFixture().summary, known_total_pulls: 999 } } }
  events = { 'acc-a': [recruitmentEvent('C', 17), recruitmentEvent('B', 31), recruitmentEvent('A', 17)], 'acc-b': [recruitmentEvent('B账号记录', 999)] }
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }, { id: 'acc-b', name: '小号', game: '代号鸢' }])
  api.getRecruitmentArchive.mockImplementation(accountId => Promise.resolve(structuredClone(archives[accountId])))
  api.listRecruitmentEvents.mockImplementation(({ accountId }) => Promise.resolve({ items: structuredClone(events[accountId]), next_cursor: null, archive_revision: archives[accountId].archive_revision }))
  api.listRecruitmentBatches.mockImplementation(({ accountId }) => Promise.resolve({ items: [], next_cursor: null, archive_revision: archives[accountId].archive_revision })); api.getRecruitmentCatalog.mockResolvedValue(recruitmentCatalog()); getOperatorCatalog.mockResolvedValue({ format: 'myshare-operator-catalog', version: 1, catalog_version: 'test-v1', operators: [{ id: 'char-a', name: '测试绝密', rarity: 5, games: ['代号鸢'] }] }); dialog.confirm.mockResolvedValue(true)
  api.recruitmentCommand.mockResolvedValue({ archive_revision: 4 })
})

it('只读初始化，不会写入空档案；无账号给出创建入口', async () => {
  listAccounts.mockResolvedValue([])
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('先创建游戏账号'); expect(api.getRecruitmentArchive).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('首次无池直接提供三条开始路径，展开并聚焦现有表单，不发起隐式读写', async () => {
  archives['acc-a'].pools = []; archives['acc-a'].current_pool_id = null; events['acc-a'] = []
  const wrapper = render({ RecruitmentExchange: false }); await flushPromises()
  const maintenance = wrapper.get('.maintenance'), exchange = wrapper.get('.exchange-card')
  expect(maintenance.element.open).toBe(false); expect(exchange.element.open).toBe(false)
  await button(wrapper, '添加卡池并开始记录').trigger('click'); await flushPromises()
  expect(maintenance.element.open).toBe(true); expect(document.activeElement).toBe(maintenance.get('select').element)
  maintenance.element.open = false
  await button(wrapper, '补历史总抽数').trigger('click'); await flushPromises()
  expect(maintenance.element.open).toBe(true); expect(document.activeElement).toBe(maintenance.findAll('section')[1].get('input').element)
  await button(wrapper, '导入备份').trigger('click'); await flushPromises()
  expect(exchange.element.open).toBe(true); expect(document.activeElement).toBe(exchange.get('input[type=file]').element)
  expect(api.recruitmentCommand).not.toHaveBeenCalled(); expect(api.exportRecruitment).not.toHaveBeenCalled(); expect(api.previewRecruitmentImport).not.toHaveBeenCalled(); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('已知批次总量保留累计，未知单条间隔不虚称累计缺失', async () => {
  archives['acc-a'].summary = { ...archives['acc-a'].summary, known_total_pulls: 120, batch_pulls: 120, recorded_pulls: 0, event_count: 1, exact_event_count: 0, unknown_event_count: 1, has_unknown: true }
  archives['acc-a'].pool_summaries = { 'pool-a': archives['acc-a'].summary }
  events['acc-a'] = [{ ...recruitmentEvent('未知间隔', null), batch_id: 'batch-120' }]
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.summary strong').text()).toBe('120'); expect(wrapper.get('.summary').text()).toContain('部分出货间隔或当前进度未知；累计按已记录的抽数计算'); expect(wrapper.text()).not.toContain('累计不是完整总抽数')
  expect(wrapper.get('.current-card').text()).toContain('仍有未知间隔或进度'); await button(wrapper, '卡池档案').trigger('click'); expect(wrapper.get('.pool-card').text()).toContain('120 抽'); expect(wrapper.get('.pool-card').text()).toContain('仍有未知间隔或进度')
})
it('A17+B31+C17 删除B后显示34，保留C17与当前进度，撤销使用删除revision', async () => {
  api.recruitmentCommand.mockImplementation(async command => {
    if (command.operation === 'event_delete') { events['acc-a'] = events['acc-a'].filter(event => event.event_id !== 'B'); archives['acc-a'].archive_revision = 4; archives['acc-a'].summary.known_total_pulls = 34 }
    return { archive_revision: 4 }
  })
  const wrapper = render(); await flushPromises()
  await wrapper.findAll('.event-row')[1].find('.danger').trigger('click'); await flushPromises()
  expect(wrapper.get('.summary strong').text()).toBe('34'); expect(wrapper.findAll('.event-row')).toHaveLength(2); expect(wrapper.findAll('.event-row')[0].text()).toContain('17 抽出货'); expect(wrapper.get('.current-progress').text()).toContain('0')
  await button(wrapper, '撤销删除').trigger('click'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'event_restore', expectedRevision: 4, data: { event_id: 'B' } })
})
it('A读取晚返回不能覆盖B；切换账号关闭旧草稿', async () => {
  const late = deferred(); api.getRecruitmentArchive.mockImplementation(accountId => accountId === 'acc-a' ? late.promise : Promise.resolve(archives['acc-b']))
  const wrapper = render(); await flushPromises(); activeAccount.set('acc-b'); await flushPromises(); late.resolve(archives['acc-a']); await flushPromises()
  expect(wrapper.get('.summary strong').text()).toBe('999'); expect(wrapper.text()).toContain('B账号记录')
  await button(wrapper, '记录绝密').trigger('click'); expect(wrapper.find('[role=dialog]').exists()).toBe(true)
  activeAccount.set('acc-a'); await flushPromises(); expect(wrapper.find('[role=dialog]').exists()).toBe(false)
})
it('在A发起删除确认后切换B，不向B或A发出旧确认写入', async () => {
  const confirmation = deferred(); dialog.confirm.mockReturnValue(confirmation.promise)
  const wrapper = render(); await flushPromises(); await wrapper.find('.event-row .danger').trigger('click'); activeAccount.set('acc-b'); await flushPromises(); confirmation.resolve(true); await flushPromises()
  expect(api.recruitmentCommand).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('B账号记录')
})
it('A写入迟到不关闭B的新草稿或显示A成功状态', async () => {
  const late = deferred(); api.recruitmentCommand.mockReturnValue(late.promise)
  const wrapper = render(); await flushPromises(); await wrapper.find('.event-row .danger').trigger('click'); await flushPromises(); activeAccount.set('acc-b'); await flushPromises()
  await button(wrapper, '记录绝密').trigger('click'); late.resolve({ archive_revision: 4 }); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(true); expect(wrapper.text()).not.toContain('已保存'); expect(wrapper.get('.summary strong').text()).toBe('999')
})
it('409保留真实编辑器输入，重新读取；临时网络失败重试使用同request_id', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '记录绝密').trigger('click')
  const editor = wrapper.findComponent({ name: 'EntryEditor' })
  await editor.get('fieldset select').setValue('char-a'); await editor.get('fieldset input[type=number]').setValue('17')
  api.recruitmentCommand.mockRejectedValueOnce(Object.assign(new Error('revision changed'), { status: 409 }))
  await editor.get('form').trigger('submit'); await flushPromises()
  expect(editor.get('fieldset input[type=number]').element.value).toBe('17'); expect(wrapper.text()).toContain('草稿已保留')
  api.recruitmentCommand.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ archive_revision: 4 })
  await editor.get('form').trigger('submit'); await flushPromises(); const retryId = api.recruitmentCommand.mock.calls.at(-1)[0].requestId
  await editor.get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].requestId).toBe(retryId)
})
it('另一设备修改后撤销入口失效；卸载关闭SSE订阅', async () => {
  archives['acc-a'].archive_revision = 4
  const wrapper = render(); await flushPromises(); await wrapper.find('.event-row .danger').trigger('click'); await flushPromises(); expect(wrapper.find('.undo').exists()).toBe(true)
  archives['acc-a'].archive_revision = 5; subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'recruitment_changed', data: { account_id: 'acc-a' } }); await flushPromises()
  expect(wrapper.find('.undo').exists()).toBe(false); const dispose = subscribeAccountEvents.mock.results.at(-1).value; wrapper.unmount(); expect(dispose).toHaveBeenCalledOnce()
})
it('游戏快照不一致仅可读；失去用户身份清除个人记录', async () => {
  archives['acc-a'].game_mismatch = true
  const wrapper = render(); await flushPromises(); expect(wrapper.text()).toContain('暂不能修改或导入'); expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined()
  auth.accessToken = ''; auth.userInfo = null; await flushPromises(); expect(wrapper.find('.event-row').exists()).toBe(false); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('目录失败保留历史但禁新增；连续revision不一致有界退出可刷新', async () => {
  api.getRecruitmentCatalog.mockRejectedValue(new Error('catalog unavailable'))
  const wrapper = render(); await flushPromises(); expect(wrapper.find('.summary').exists()).toBe(true); expect(wrapper.text()).toContain('新增需等待目录恢复'); expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined()
  api.listRecruitmentEvents.mockResolvedValue({ items: [], next_cursor: null, archive_revision: 88 })
  const before = api.getRecruitmentArchive.mock.calls.length; await button(wrapper, '刷新档案').trigger('click'); await flushPromises()
  expect(api.getRecruitmentArchive.mock.calls.length - before).toBe(2); expect(wrapper.text()).toContain('请稍后刷新')
})

it('disabled flag或无内测资格不初始化个人读写', async () => {
  isFeatureEnabled.mockReturnValue(false); const closed = render(); await flushPromises(); expect(closed.text()).toContain('暂未开放'); expect(listAccounts).not.toHaveBeenCalled(); expect(api.getRecruitmentArchive).not.toHaveBeenCalled(); closed.unmount()
  isFeatureEnabled.mockReturnValue(true); beta.canUseBetaFeatures = false; const denied = render(); await flushPromises(); expect(denied.text()).toContain('需要内测资格'); expect(listAccounts).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('手填N换算为21，卡池档案使用服务端全池累计且两视图复用筛选和分页', async () => {
  archives['acc-a'].pool_summaries = { 'pool-a': { ...archives['acc-a'].summary, known_total_pulls: 1234, event_count: 50 } }
  api.listRecruitmentEvents.mockImplementation(({ accountId, cursor }) => Promise.resolve({ items: cursor ? [recruitmentEvent('older', 12)] : events[accountId], next_cursor: cursor ? null : 'page-2', archive_revision: archives[accountId].archive_revision }))
  const wrapper = render(); await flushPromises(); await wrapper.get('.current-card details select').setValue('remaining'); await wrapper.get('.current-card details input').setValue('19'); await button(wrapper, '保存进度').trigger('click'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'progress_set', data: { progress: 21, pool_id: 'pool-a' } })
  await button(wrapper, '卡池档案').trigger('click'); expect(wrapper.get('.pool-card').text()).toContain('1234 抽'); expect(wrapper.get('.pool-card').text()).toContain('50 条')
  await button(wrapper, '查看本池记录').trigger('click'); await flushPromises(); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].poolId).toBe('pool-a')
  await wrapper.get('.load-more').trigger('click'); await flushPromises(); expect(wrapper.findAll('.event-row')).toHaveLength(4); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0]).toMatchObject({ cursor: 'page-2', poolId: 'pool-a' })
  await wrapper.get('.filters input[type=date]').setValue('2026-01-01'); await wrapper.get('.filters').trigger('submit'); await flushPromises(); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].dateFrom).toBe('2026-01-01')
  api.listRecruitmentEvents.mockRejectedValueOnce(Object.assign(new Error('old cursor'), { status: 409 })); await wrapper.get('.load-more').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('已重新读取最近记录')
})

it('回到可见页面重新核对账号；账号删除事件关闭草稿并切到剩余真实账号', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '记录绝密').trigger('click')
  const before = listAccounts.mock.calls.length
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); await flushPromises(); expect(listAccounts.mock.calls.length).toBe(before + 1)
  listAccounts.mockResolvedValue([{ id: 'acc-b', name: '小号', game: '代号鸢' }]); subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_deleted', data: { account_id: 'acc-a' } }); await flushPromises()
  expect(activeAccount.id).toBe('acc-b'); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(wrapper.text()).toContain('B账号记录')
})

it('断线期间换游戏后重连，先读取真实账号游戏再读取目录并关闭旧草稿', async () => {
  const wrapper = render(); await flushPromises(); await button(wrapper, '记录绝密').trigger('click')
  archives['acc-a'].game_snapshot = '如鸢'; listAccounts.mockResolvedValue([{ id: 'acc-a', name: '账号', game: '如鸢' }])
  subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_stream_open', data: { account_id: 'acc-a', reconnected: true } }); await flushPromises()
  expect(activeAccount.gameFor('acc-a')).toBe('如鸢'); expect(api.getRecruitmentCatalog.mock.calls.at(-1)[0]).toBe('如鸢'); expect(wrapper.find('[role=dialog]').exists()).toBe(false)
})

it('创建卡池明确提交未知/0/已知初始进度，不把未填事实当0', async () => {
  api.getRecruitmentCatalog.mockResolvedValue({ pools: ['catalog-a', 'catalog-b', 'catalog-c', 'catalog-d'].map(pool_id => ({ ...recruitmentCatalog().pools[0], pool_id })) })
  const wrapper = render(); await flushPromises()
  const form = wrapper.get('.maintenance section form')
  expect(form.find('input[type=text], input:not([type])').exists()).toBe(false); expect(form.get('select').findAll('option').map(option => option.attributes('value'))).not.toContain('catalog-a')
  await form.get('select').setValue('catalog-b')
  await form.trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'pool_create', data: { progress: null } })
  expect(api.recruitmentCommand.mock.calls.at(-1)[0].data).toMatchObject({ catalog_pool_id: 'catalog-b' }); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data).not.toHaveProperty('name')
  await form.get('select').setValue('catalog-c'); await form.findAll('select')[1].setValue('zero'); await form.trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data.progress).toBe(0)
  await form.get('select').setValue('catalog-d'); await form.findAll('select')[1].setValue('known'); await form.get('input[type=number]').setValue('21'); await form.trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data.progress).toBe(21)
})

it('从早到晚排序作用于完整分页，重排提交全池最早到最新ID而不改变跨度', async () => {
  api.listRecruitmentEvents.mockImplementation(({ accountId, order, cursor }) => {
    const chronological = structuredClone(events[accountId]).reverse()
    return Promise.resolve({ items: order === 'asc' ? (cursor ? chronological.slice(2) : chronological.slice(0, 2)) : structuredClone(events[accountId]), next_cursor: order === 'asc' && !cursor ? 'asc-next' : null, archive_revision: archives[accountId].archive_revision })
  })
  api.recruitmentCommand.mockImplementation(async command => {
    if (command.operation === 'event_reorder') {
      const byId = new Map(events['acc-a'].map(event => [event.event_id, event]))
      events['acc-a'] = command.data.event_ids.map((id, index) => ({ ...byId.get(id), sort_order: index + 1 })).reverse(); archives['acc-a'].archive_revision = 4
    }
    return { archive_revision: 4 }
  })
  const wrapper = render(); await flushPromises(); await wrapper.get('.filters').findAll('select')[1].setValue('asc'); await wrapper.get('.filters').trigger('submit'); await flushPromises(); expect(wrapper.findAll('.event-row').map(row => row.get('strong').text())).toEqual(['A', 'B'])
  await wrapper.get('.load-more').trigger('click'); await flushPromises(); expect(wrapper.findAll('.event-row').map(row => row.get('strong').text())).toEqual(['A', 'B', 'C']); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0]).toMatchObject({ order: 'asc', cursor: 'asc-next' })
  const spansBefore = Object.fromEntries(wrapper.findAll('.event-row').map(row => [row.get('strong').text(), row.get('.span-number').text()])); await wrapper.findAll('.event-row')[1].findAll('button')[1].trigger('click'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'event_reorder', data: { pool_id: 'pool-a', event_ids: ['B', 'A', 'C'] } }); await wrapper.get('.load-more').trigger('click'); await flushPromises(); expect(wrapper.findAll('.event-row').map(row => row.get('strong').text())).toEqual(['B', 'A', 'C']); expect(Object.fromEntries(wrapper.findAll('.event-row').map(row => [row.get('strong').text(), row.get('.span-number').text()]))).toEqual(spansBefore)
})

it('三个读版本不一致不混合批次；后台清账号404会重新读取所有权而非保留旧档案', async () => {
  const wrapper = render(); await flushPromises(); api.listRecruitmentBatches.mockResolvedValue({ items: [{ batch_id: 'different-version', total_pull_count: 120 }], next_cursor: null, archive_revision: 99 })
  await button(wrapper, '刷新档案').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('请稍后刷新'); expect(wrapper.find('.batch-row').exists()).toBe(false)
  api.getRecruitmentArchive.mockRejectedValue(Object.assign(new Error('账号已删除'), { status: 404 })); listAccounts.mockResolvedValue([]); await button(wrapper, '刷新档案').trigger('click'); await flushPromises(); expect(activeAccount.id).toBe(''); expect(wrapper.find('.summary').exists()).toBe(false); expect(wrapper.text()).toContain('先创建游戏账号')
})

it('按真实图鉴 envelope 读取名字头像和职业，只展示当前游戏绝密', async () => {
  getOperatorCatalog.mockResolvedValue({ format: 'myshare-operator-catalog', version: 1, catalog_version: 'test-v2', operators: [
    { id: 'char-a', name: '图鉴新名字', avatar: '/test-avatar.png', rarity: 5, prof: '龙盾', games: ['代号鸢'] },
    { id: 'char-other-game', name: '另一游戏', rarity: 5, games: ['如鸢'] },
    { id: 'char-r4', name: '机密', rarity: 4, games: ['代号鸢'] }
  ] })
  events['acc-a'][0].agent_snapshot = { agent_id: 'char-a', name: '旧快照名字' }
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.event-row strong').text()).toBe('图鉴新名字'); expect(wrapper.find('.event-row img').attributes('src')).toContain('/test-avatar.png')
  await button(wrapper, '记录绝密').trigger('click'); const editor = wrapper.findComponent({ name: 'EntryEditor' })
  expect(editor.get('fieldset select').text()).toContain('图鉴新名字'); expect(editor.get('fieldset select').text()).not.toContain('另一游戏'); expect(editor.get('fieldset select').text()).not.toContain('机密')
  await editor.get('fieldset select').setValue('char-a'); expect(editor.get('.agent-preview').text()).toContain('龙盾')
})

it('异常图鉴响应明确报错并保留历史，不导致空密探列表抛错', async () => {
  getOperatorCatalog.mockResolvedValue([{ id: 'char-a', name: '错形状' }])
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.summary').exists()).toBe(true); expect(wrapper.text()).toContain('公共密探图鉴响应无效'); expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined()
})

it('占位对应正式密探后同一历史结果继承名字头像，span及revision不变', async () => {
  const catalog = recruitmentCatalog(); const slotId = 'catalog-a:up:stable'
  catalog.pools[0].up_agents = [{ id: slotId, name: 'UP 占位 1', operator_id: null, active: true }]; api.getRecruitmentCatalog.mockResolvedValue(catalog)
  events['acc-a'] = [{ ...recruitmentEvent('placeholder-result', 17), agent_snapshot: { agent_id: slotId, name: 'UP 占位 1' }, up_status: 'up' }]
  const wrapper = render(); await flushPromises(); expect(wrapper.find('.event-row strong').text()).toBe('UP 占位 1')
  catalog.pools[0].up_agents[0].operator_id = 'char-a'; getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char-a', name: '正式绝密', avatar: '/formal.png', rarity: 5, games: ['代号鸢'] }] })
  await button(wrapper, '刷新档案').trigger('click'); await flushPromises()
  expect(wrapper.find('.event-row strong').text()).toBe('正式绝密'); expect(wrapper.find('.event-row img').attributes('src')).toContain('/formal.png'); expect(wrapper.find('.span-number').text()).toBe('17 抽出货'); expect(api.recruitmentCommand).not.toHaveBeenCalled(); expect(archives['acc-a'].archive_revision).toBe(3)
  await button(wrapper, '记录绝密').trigger('click'); const editor = wrapper.findComponent({ name: 'EntryEditor' }); expect(editor.get('fieldset select').findAll('option').map(option => option.attributes('value')).filter(value => value === 'char-a')).toHaveLength(0)
  await editor.get('fieldset select').setValue(slotId); await editor.get('fieldset input[type=number]').setValue('18'); await editor.get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'event_create', data: { entries: [{ agent_id: slotId, up_status: 'up', pull_span: 18 }] } })
})

it('旧临时池保留删除修改入口，但不能新增自定义池或密探', async () => {
  archives['acc-a'].pools[0].snapshot.catalog_pool_id = null
  archives['acc-a'].pools[0].mapped_snapshot = { catalog_pool_id: 'catalog-a', name: '已对应公共卡池' }
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain('保留历史与进度维护'); expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined(); expect(wrapper.text()).not.toContain('临时卡池名称'); expect(wrapper.text()).not.toContain('添加临时密探'); expect(wrapper.text()).not.toContain('保存对应'); expect(wrapper.get('.maintenance select').text()).toContain('测试卡池')
  await wrapper.find('.event-row button').trigger('click'); expect(wrapper.find('[role=dialog]').exists()).toBe(true); expect(wrapper.find('[role=dialog] button[type=submit]').attributes('disabled')).toBeUndefined()
})
