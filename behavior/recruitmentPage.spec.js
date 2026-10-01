import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
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
function render(stubs = {}) { return mount(RecruitmentPage, { attachTo: document.body, global: { provide: { [routeLocationKey]: { fullPath: '/recruitment' } }, stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true, RecruitmentExchange: true, Teleport: true, RouterLink: RouterLinkStub, ...stubs } } }) }
async function selectPool(wrapper, index = 0) { if (wrapper.find('.current-card').exists()) return; await wrapper.findAll('.pool-card')[index].trigger('click'); await flushPromises() }
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
  const wrapper = render({ DataAccountContextBar: false }); await flushPromises()
  expect(wrapper.text()).toContain('先创建游戏账号'); expect(api.getRecruitmentArchive).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  expect(wrapper.find('.archive-toggle').exists()).toBe(false)
})
it('备份入口位于账号栏，面板就近展开；收起保留输入，换账号关闭并清空', async () => {
  const wrapper = render({ DataAccountContextBar: false, RecruitmentExchange: false }); await flushPromises()
  const context = wrapper.get('.data-account-context-bar'), toggle = context.get('.context-actions .archive-toggle'), exchange = wrapper.get('.exchange-card')
  expect(context.get('.context-action').text()).toBe('管理游戏账号'); expect(context.find('select').exists()).toBe(false)
  expect(toggle.text()).toBe('备份与恢复'); expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(toggle.attributes('aria-controls')).toBe(exchange.attributes('id')); expect(context.element.nextElementSibling).toBe(exchange.element); expect(exchange.isVisible()).toBe(false)
  await toggle.trigger('click')
  expect(toggle.text()).toBe('收起备份与恢复'); expect(toggle.attributes('aria-expanded')).toBe('true'); expect(exchange.isVisible()).toBe(true)
  const input = exchange.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'backup.json', size: 100, text: async () => JSON.stringify({ schema: 'yuanhub.recruitment.v1', game: '代号鸢', source_account: { account_id: 'acc-a' }, events: [], batches: [], pools: [], temporary_agents: [] }) }] })
  await input.trigger('change'); await flushPromises(); await exchange.get('select').setValue('use_backup')
  await toggle.trigger('click'); expect(exchange.isVisible()).toBe(false)
  await toggle.trigger('click'); expect(exchange.text()).toContain('backup.json'); expect(exchange.get('select').element.value).toBe('use_backup')
  expect(api.exportRecruitment).not.toHaveBeenCalled(); expect(api.previewRecruitmentImport).not.toHaveBeenCalled(); expect(api.commitRecruitmentImport).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.get('.context-actions .archive-toggle').attributes('aria-expanded')).toBe('false'); expect(wrapper.get('.exchange-card').isVisible()).toBe(false); expect(wrapper.get('.exchange-card').text()).not.toContain('backup.json')
})
it('游戏快照不一致时仍能从账号栏展开备份，允许导出但禁止导入', async () => {
  archives['acc-a'].game_mismatch = true
  const wrapper = render({ DataAccountContextBar: false, RecruitmentExchange: false }); await flushPromises()
  await wrapper.get('.context-actions .archive-toggle').trigger('click')
  const exchange = wrapper.get('.exchange-card')
  expect(exchange.isVisible()).toBe(true); expect(button(exchange, '导出完整 JSON').attributes('disabled')).toBeUndefined(); expect(exchange.get('input[type=file]').attributes('disabled')).toBeDefined()
})
it('当前游戏无公共目录时提示管理员，基准和导入仍可展开聚焦，不发起隐式写入', async () => {
  archives['acc-a'].pools = []; archives['acc-a'].current_pool_id = null; events['acc-a'] = []
  api.getRecruitmentCatalog.mockResolvedValue({ pools: [] })
  const wrapper = render({ RecruitmentExchange: false }); await flushPromises()
  const maintenance = wrapper.get('.maintenance'), exchange = wrapper.get('.exchange-card')
  expect(wrapper.text()).toContain('当前游戏暂无公共卡池'); expect(wrapper.text()).not.toContain('添加卡池')
  expect(maintenance.element.open).toBe(false); expect(exchange.isVisible()).toBe(false)
  await button(wrapper, '补历史总抽数').trigger('click'); await flushPromises()
  expect(maintenance.element.open).toBe(true); expect(document.activeElement).toBe(maintenance.get('input').element)
  await button(wrapper, '导入备份').trigger('click'); await flushPromises()
  expect(exchange.isVisible()).toBe(true); expect(document.activeElement).toBe(exchange.get('input[type=file]').element)
  expect(api.recruitmentCommand).not.toHaveBeenCalled(); expect(api.exportRecruitment).not.toHaveBeenCalled(); expect(api.previewRecruitmentImport).not.toHaveBeenCalled(); expect(api.commitRecruitmentImport).not.toHaveBeenCalled()
})
it('已知批次总量保留累计，未知单条间隔不虚称累计缺失', async () => {
  archives['acc-a'].summary = { ...archives['acc-a'].summary, known_total_pulls: 120, batch_pulls: 120, recorded_pulls: 0, event_count: 1, exact_event_count: 0, unknown_event_count: 1, has_unknown: true }
  archives['acc-a'].pool_summaries = { 'pool-a': archives['acc-a'].summary }
  events['acc-a'] = [{ ...recruitmentEvent('未知间隔', null), batch_id: 'batch-120' }]
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(wrapper.get('.summary strong').text()).toBe('120'); expect(wrapper.get('.summary').text()).toContain('部分出货间隔或当前进度未知；累计按已记录的抽数计算'); expect(wrapper.text()).not.toContain('累计不是完整总抽数')
  expect(wrapper.get('.current-card').text()).toContain('仍有未知间隔或进度'); expect(wrapper.get('.pool-card').text()).toContain('120'); expect(wrapper.get('.pool-card').text()).toContain('部分出货间隔或进度未知')
})
it('A17+B31+C17 删除B后显示34，保留C17与当前进度，撤销使用删除revision', async () => {
  api.recruitmentCommand.mockImplementation(async command => {
    if (command.operation === 'event_delete') { events['acc-a'] = events['acc-a'].filter(event => event.event_id !== 'B'); archives['acc-a'].archive_revision = 4; archives['acc-a'].summary.known_total_pulls = 34 }
    return { archive_revision: 4 }
  })
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await wrapper.findAll('.event-row')[1].find('.danger').trigger('click'); await flushPromises()
  expect(wrapper.get('.summary strong').text()).toBe('34'); expect(wrapper.findAll('.event-row')).toHaveLength(2); expect(wrapper.findAll('.event-row')[0].text()).toContain('17 抽出货'); expect(wrapper.get('.current-progress').text()).toContain('0')
  await button(wrapper, '撤销删除').trigger('click'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'event_restore', expectedRevision: 4, data: { event_id: 'B' } })
})
it('A读取晚返回不能覆盖B；切换账号关闭旧草稿', async () => {
  const late = deferred(); api.getRecruitmentArchive.mockImplementation(accountId => accountId === 'acc-a' ? late.promise : Promise.resolve(archives['acc-b']))
  const wrapper = render(); await flushPromises(); activeAccount.set('acc-b'); await flushPromises(); late.resolve(archives['acc-a']); await flushPromises()
  expect(wrapper.get('.summary strong').text()).toBe('999'); expect(wrapper.text()).toContain('B账号记录')
  await selectPool(wrapper); await button(wrapper, '记录绝密').trigger('click'); expect(wrapper.find('[role=dialog]').exists()).toBe(true)
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
  await selectPool(wrapper); await button(wrapper, '记录绝密').trigger('click'); late.resolve({ archive_revision: 4 }); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(true); expect(wrapper.text()).not.toContain('已保存'); expect(wrapper.get('.summary strong').text()).toBe('999')
})
it('409保留真实编辑器输入，重新读取；临时网络失败重试使用同request_id', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await button(wrapper, '记录绝密').trigger('click')
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
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(wrapper.text()).toContain('暂不能修改或导入'); expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined()
  auth.accessToken = ''; auth.userInfo = null; await flushPromises(); expect(wrapper.find('.event-row').exists()).toBe(false); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('目录失败保留历史但禁新增；连续revision不一致有界退出可刷新', async () => {
  api.getRecruitmentCatalog.mockRejectedValue(new Error('catalog unavailable'))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(wrapper.find('.summary').exists()).toBe(true); expect(wrapper.text()).toContain('新增需等待目录恢复'); expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined()
  api.listRecruitmentEvents.mockResolvedValue({ items: [], next_cursor: null, archive_revision: 88 })
  const before = api.getRecruitmentArchive.mock.calls.length; await button(wrapper, '刷新档案').trigger('click'); await flushPromises()
  expect(api.getRecruitmentArchive.mock.calls.length - before).toBe(2); expect(wrapper.text()).toContain('请稍后刷新')
})

it('disabled flag或无内测资格不初始化个人读写', async () => {
  isFeatureEnabled.mockReturnValue(false); const closed = render(); await flushPromises(); expect(closed.text()).toContain('暂未开放'); expect(listAccounts).not.toHaveBeenCalled(); expect(api.getRecruitmentArchive).not.toHaveBeenCalled(); closed.unmount()
  isFeatureEnabled.mockReturnValue(true); beta.canUseBetaFeatures = false; const denied = render(); await flushPromises(); expect(denied.text()).toContain('需要内测资格'); expect(listAccounts).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('手填N换算为21，时间线使用服务端全池累计且选池复用筛选和分页', async () => {
  archives['acc-a'].pool_summaries = { 'pool-a': { ...archives['acc-a'].summary, known_total_pulls: 1234, event_count: 50 } }
  api.listRecruitmentEvents.mockImplementation(({ accountId, cursor }) => Promise.resolve({ items: cursor ? [recruitmentEvent('older', 12)] : events[accountId], next_cursor: cursor ? null : 'page-2', archive_revision: archives[accountId].archive_revision }))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await wrapper.get('.current-card details select').setValue('remaining'); await wrapper.get('.current-card details input').setValue('19'); await button(wrapper, '保存进度').trigger('click'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'progress_set', data: { progress: 21, pool_id: 'pool-a' } })
  expect(wrapper.get('.pool-card').findAll('.pool-metrics b').map(item => item.text())).toEqual(['1,234', '50', '0'])
  await selectPool(wrapper); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].poolId).toBe('pool-a')
  await wrapper.get('.load-more').trigger('click'); await flushPromises(); expect(wrapper.findAll('.event-row')).toHaveLength(4); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0]).toMatchObject({ cursor: 'page-2', poolId: 'pool-a' })
  await wrapper.get('.filters input[type=date]').setValue('2026-01-01'); await wrapper.get('.filters').trigger('submit'); await flushPromises(); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].dateFrom).toBe('2026-01-01')
  api.listRecruitmentEvents.mockRejectedValueOnce(Object.assign(new Error('old cursor'), { status: 409 })); await wrapper.get('.load-more').trigger('click'); await flushPromises(); expect(wrapper.text()).toContain('已重新读取最近记录')
})

it('回到可见页面重新核对账号；账号删除事件关闭草稿并切到剩余真实账号', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await button(wrapper, '记录绝密').trigger('click')
  const before = listAccounts.mock.calls.length
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); await flushPromises(); expect(listAccounts.mock.calls.length).toBe(before + 1)
  listAccounts.mockResolvedValue([{ id: 'acc-b', name: '小号', game: '代号鸢' }]); subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_deleted', data: { account_id: 'acc-a' } }); await flushPromises()
  expect(activeAccount.id).toBe('acc-b'); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(wrapper.text()).toContain('B账号记录')
})

it('断线期间换游戏后重连，先读取真实账号游戏再读取目录并关闭旧草稿', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await button(wrapper, '记录绝密').trigger('click')
  archives['acc-a'].game_snapshot = '如鸢'; listAccounts.mockResolvedValue([{ id: 'acc-a', name: '账号', game: '如鸢' }])
  subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_stream_open', data: { account_id: 'acc-a', reconnected: true } }); await flushPromises()
  expect(activeAccount.gameFor('acc-a')).toBe('如鸢'); expect(api.getRecruitmentCatalog.mock.calls.at(-1)[0]).toBe('如鸢'); expect(wrapper.find('[role=dialog]').exists()).toBe(false)
})

it('首次显示全部池时间线，点击才展开目标池，未知进度不伪造或自动写档案', async () => {
  const catalog = ['disabled', 'catalog-a', 'catalog-b'].map(pool_id => ({ ...recruitmentCatalog().pools[0], pool_id, name: pool_id, enabled: pool_id !== 'disabled' }))
  const pools = catalog.map(pool => ({ pool_id: 'catalog:' + pool.pool_id, snapshot: { ...pool, catalog_pool_id: pool.pool_id }, progress: null }))
  archives['acc-a'] = { ...recruitmentFixture(), archive_revision: 0, current_pool_id: null, pools, summary: { ...recruitmentFixture().summary, known_total_pulls: 0, event_count: 0 } }
  events['acc-a'] = []; api.getRecruitmentCatalog.mockResolvedValue({ pools: catalog })
  const wrapper = render(); await flushPromises()
  expect(wrapper.findAll('.pool-card')).toHaveLength(3); expect(wrapper.find('.current-card').exists()).toBe(false)
  expect(wrapper.find('.pool-card.is-current').exists()).toBe(false); expect(wrapper.get('.maintenance summary').text()).toBe('历史总抽数')
  expect(wrapper.text()).not.toContain('添加公共卡池档案')
  await selectPool(wrapper, 2)
  expect(wrapper.get('#current-title').text()).toBe('catalog-b'); expect(wrapper.get('.current-progress strong').text()).toBe('未知')
  expect(document.activeElement).toBe(wrapper.get('#current-title').element)
  expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].poolId).toBe('catalog:catalog-b'); expect(wrapper.find('.event-row').exists()).toBe(false)
  await button(wrapper, '补录历史').trigger('click'); await flushPromises()
  const editor = wrapper.findComponent({ name: 'EntryEditor' })
  expect(editor.findAll('select')[0].element.value).toBe('historical'); expect(editor.findAll('select')[1].element.value).toBe('catalog:catalog-b')
  expect(editor.findAll('select')[1].findAll('option').filter(option => option.attributes('value'))).toHaveLength(1)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('自动展示卡池的进度可以明确校正为未知、0或已知次数，无需手动添加', async () => {
  archives['acc-a'].pools[0].progress = null; archives['acc-a'].current_pool_id = null
  api.recruitmentCommand.mockImplementation(async command => {
    if (command.operation === 'progress_set') archives['acc-a'].pools[0].progress = command.data.progress
    archives['acc-a'].archive_revision++
    return { archive_revision: archives['acc-a'].archive_revision }
  })
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  const form = wrapper.get('.current-card details form')
  expect(wrapper.get('.current-progress strong').text()).toBe('未知')
  await form.get('select').setValue('unknown'); await form.trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'progress_set', data: { pool_id: 'pool-a', progress: null } })
  await form.get('select').setValue('direct'); await form.get('input').setValue('0'); await form.trigger('submit'); await flushPromises()
  expect(wrapper.get('.current-progress strong').text()).toBe('0')
  await form.get('input').setValue('21'); await form.trigger('submit'); await flushPromises()
  expect(wrapper.get('.current-progress strong').text()).toBe('21')
  expect(api.recruitmentCommand.mock.calls.every(([command]) => command.operation === 'progress_set')).toBe(true)
})

it('点击另一池只切换维护目标；进度与新增指向该池，明确设置后才改变偏好，返回恢复焦点', async () => {
  const catalog = recruitmentCatalog()
  catalog.pools.push({ ...catalog.pools[0], pool_id: 'catalog-b', name: '第二卡池' })
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
  archives['acc-a'].pools.push({ pool_id: 'pool-b', snapshot: { name: '第二卡池', catalog_pool_id: 'catalog-b' }, progress: 5 })
  api.recruitmentCommand.mockImplementation(async command => {
    if (command.operation === 'progress_set') archives['acc-a'].pools.find(pool => pool.pool_id === command.data.pool_id).progress = command.data.progress
    if (command.operation === 'set_current_pool') archives['acc-a'].current_pool_id = command.data.pool_id
    archives['acc-a'].archive_revision++
    return { archive_revision: archives['acc-a'].archive_revision }
  })
  const wrapper = render(); await flushPromises(); await selectPool(wrapper, 1)
  expect(wrapper.get('#current-title').text()).toBe('第二卡池'); expect(wrapper.get('.pool-timeline').isVisible()).toBe(false)
  expect(archives['acc-a'].current_pool_id).toBe('pool-a'); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  const form = wrapper.get('.current-card details form')
  await form.get('input').setValue('8'); await form.trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'progress_set', data: { pool_id: 'pool-b', progress: 8 } })
  await button(wrapper, '记录绝密').trigger('click'); await flushPromises()
  const editor = wrapper.findComponent({ name: 'EntryEditor' })
  expect(editor.findAll('select')[1].element.value).toBe('pool-b')
  await editor.get('fieldset select').setValue('char-a'); await editor.get('fieldset input[type=number]').setValue('17'); await editor.get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'event_create', data: { pool_id: 'pool-b', mode: 'current' } })
  expect(archives['acc-a'].current_pool_id).toBe('pool-a')
  await button(wrapper, '设为当前卡池').trigger('click'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'set_current_pool', data: { pool_id: 'pool-b' } })
  await button(wrapper, '返回时间线').trigger('click'); await flushPromises()
  expect(wrapper.find('.current-card').exists()).toBe(false); expect(wrapper.get('.pool-timeline').isVisible()).toBe(true)
  expect(document.activeElement).toBe(wrapper.findAll('.pool-card')[1].element); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].poolId).toBe('')
})

it('停用池可校正与修改历史而不能补录，切换账号重置池和年份', async () => {
  const catalog = recruitmentCatalog(); catalog.pools[0].enabled = false; catalog.pools[0].start_date = '2026-01-01'
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
  const wrapper = render(); await flushPromises()
  await wrapper.findAll('.year-filters button').find(item => item.text() === '2026').trigger('click')
  await selectPool(wrapper)
  expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined()
  expect(button(wrapper, '补录历史').attributes('disabled')).toBeDefined()
  expect(button(wrapper, '保存进度').attributes('disabled')).toBeUndefined()
  await wrapper.find('.event-row button').trigger('click'); await flushPromises(); expect(wrapper.find('[role=dialog]').exists()).toBe(true)
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.find('.current-card').exists()).toBe(false); expect(wrapper.find('[role=dialog]').exists()).toBe(false)
  expect(wrapper.get('.pool-timeline').isVisible()).toBe(true)
  expect(wrapper.findAll('.year-filters button').find(item => item.text() === '全部').attributes('aria-pressed')).toBe('true')
  expect(api.recruitmentCommand).not.toHaveBeenCalled(); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0]).toMatchObject({ accountId: 'acc-b', poolId: '' })
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
  await selectPool(wrapper); await button(wrapper, '记录绝密').trigger('click'); const editor = wrapper.findComponent({ name: 'EntryEditor' })
  expect(editor.get('fieldset select').text()).toContain('图鉴新名字'); expect(editor.get('fieldset select').text()).not.toContain('另一游戏'); expect(editor.get('fieldset select').text()).not.toContain('机密')
  await editor.get('fieldset select').setValue('char-a'); expect(editor.get('.agent-preview').text()).toContain('龙盾')
})

it('异常图鉴响应明确报错并保留历史，不导致空密探列表抛错', async () => {
  getOperatorCatalog.mockResolvedValue([{ id: 'char-a', name: '错形状' }])
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
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
  await selectPool(wrapper); await button(wrapper, '记录绝密').trigger('click'); const editor = wrapper.findComponent({ name: 'EntryEditor' }); expect(editor.get('fieldset select').findAll('option').map(option => option.attributes('value')).filter(value => value === 'char-a')).toHaveLength(0)
  await editor.get('fieldset select').setValue(slotId); await editor.get('fieldset input[type=number]').setValue('18'); await editor.get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ operation: 'event_create', data: { entries: [{ agent_id: slotId, up_status: 'up', pull_span: 18 }] } })
})

it('旧临时池保留删除修改入口，但不能新增自定义池或密探', async () => {
  archives['acc-a'].pools[0].snapshot.catalog_pool_id = null
  archives['acc-a'].pools[0].mapped_snapshot = { catalog_pool_id: 'catalog-a', name: '已对应公共卡池' }
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(wrapper.text()).toContain('保留历史与进度维护'); expect(button(wrapper, '记录绝密').attributes('disabled')).toBeDefined(); expect(wrapper.text()).not.toContain('临时卡池名称'); expect(wrapper.text()).not.toContain('添加临时密探'); expect(wrapper.text()).not.toContain('保存对应'); expect(wrapper.get('#current-title').text()).toContain('测试卡池'); expect(wrapper.get('.maintenance').text()).toContain('历史基准')
  await wrapper.find('.event-row button').trigger('click'); expect(wrapper.find('[role=dialog]').exists()).toBe(true); expect(wrapper.find('[role=dialog] button[type=submit]').attributes('disabled')).toBeUndefined()
})
