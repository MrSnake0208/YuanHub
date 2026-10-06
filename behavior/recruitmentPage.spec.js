import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
import RecruitmentPage from '../src/pages/recruitment/index.vue'
import * as api from '../src/api/recruitment.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'
import { deferred, recruitmentCatalog, recruitmentEvent, recruitmentFixture } from '../test-support/recruitment.js'
import { isFeatureEnabled } from '../src/config/features.js'
import { entryInput } from '../src/pages/recruitment/rules.js'

vi.mock('../src/config/features.js', () => ({ FEATURE_KEYS: { RECRUITMENT_ARCHIVE: 'recruitmentArchive' }, isFeatureEnabled: vi.fn(() => true) }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'user-a' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/api/recruitment.js', () => ({ getRecruitmentArchive: vi.fn(), listRecruitmentEvents: vi.fn(), listRecruitmentBatches: vi.fn(), getRecruitmentCatalog: vi.fn(), recruitmentCommand: vi.fn(), exportRecruitment: vi.fn(), previewRecruitmentImport: vi.fn(), commitRecruitmentImport: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: vi.fn(() => vi.fn()) }))

let archives, records
function render(stubs = {}) { return mount(RecruitmentPage, { attachTo: document.body, global: { provide: { [routeLocationKey]: { fullPath: '/recruitment' } }, stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true, RecruitmentExchange: true, Teleport: true, RouterLink: RouterLinkStub, ...stubs } } }) }
async function selectPool(wrapper, index = 0) { await wrapper.findAll('.pool-card')[index].trigger('click'); await flushPromises() }
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
beforeEach(() => {
  vi.clearAllMocks(); isFeatureEnabled.mockReturnValue(true); auth.accessToken = 'synthetic'; auth.userInfo = { id: 'user-a' }
  activeAccount.set('acc-a'); activeAccount.setGame('代号鸢', 'acc-a'); activeAccount.setGame('代号鸢', 'acc-b')
  archives = { 'acc-a': recruitmentFixture(), 'acc-b': { ...recruitmentFixture('acc-b'), summary: { ...recruitmentFixture().summary, known_total_pulls: 999 } } }
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '大号', game: '代号鸢' }, { id: 'acc-b', name: '小号', game: '代号鸢' }])
  api.getRecruitmentArchive.mockImplementation(accountId => Promise.resolve(structuredClone(archives[accountId])))
  api.getRecruitmentCatalog.mockResolvedValue(recruitmentCatalog())
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char-a', name: '测试绝密', rarity: 5, games: ['代号鸢'] }] })
  records = { 'acc-a': [{ ...recruitmentEvent('A', 17), agent_snapshot: { agent_id: 'char-a', name: '测试绝密' } }, { ...recruitmentEvent('B', 31), agent_snapshot: { agent_id: 'char-a', name: '测试绝密' } }], 'acc-b': [] }
  api.listRecruitmentEvents.mockImplementation(({ accountId }) => Promise.resolve({ items: structuredClone(records[accountId]), next_cursor: null, archive_revision: archives[accountId].archive_revision }))
  api.recruitmentCommand.mockResolvedValue({ archive_revision: 4 })
})

it('只读初始化，不会写入空档案；无账号给出创建入口', async () => {
  listAccounts.mockResolvedValue([])
  const wrapper = render({ DataAccountContextBar: false }); await flushPromises()
  expect(wrapper.text()).toContain('先创建游戏账号'); expect(api.getRecruitmentArchive).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  expect(wrapper.find('.archive-toggle').exists()).toBe(false)
})
it('标题与账号共用工具页头，备份面板在正文顶部展开；收起保留输入，换账号关闭并清空', async () => {
  const wrapper = render({ DataAccountContextBar: false, RecruitmentExchange: false }); await flushPromises()
  const header = wrapper.get('.compact-tool-header'), context = header.get('.data-account-context-bar'), toggle = header.get('.archive-toggle'), exchange = wrapper.get('.exchange-card')
  expect(header.get('h1').text()).toBe('招募档案'); expect(header.get('.compact-tool-account').element.contains(context.element)).toBe(true)
  expect(context.get('.context-selector').attributes('aria-label')).toContain('打开账号切换器'); expect(context.find('select').exists()).toBe(false)
  expect(toggle.text()).toBe('备份与恢复'); expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(toggle.attributes('aria-controls')).toBe(exchange.attributes('id')); expect(header.element.nextElementSibling.firstElementChild).toBe(exchange.element); expect(exchange.isVisible()).toBe(false)
  await toggle.trigger('click')
  expect(toggle.text()).toBe('收起备份与恢复'); expect(toggle.attributes('aria-expanded')).toBe('true'); expect(exchange.isVisible()).toBe(true)
  const input = exchange.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'backup.json', size: 100, text: async () => JSON.stringify({ schema: 'yuanhub.recruitment.v1', game: '代号鸢', source_account: { account_id: 'acc-a' }, events: [], batches: [], pools: [], temporary_agents: [] }) }] })
  await input.trigger('change'); await flushPromises(); await exchange.get('select').setValue('use_backup')
  await toggle.trigger('click'); expect(exchange.isVisible()).toBe(false)
  await toggle.trigger('click'); expect(exchange.text()).toContain('backup.json'); expect(exchange.get('select').element.value).toBe('use_backup')
  expect(api.exportRecruitment).not.toHaveBeenCalled(); expect(api.previewRecruitmentImport).not.toHaveBeenCalled(); expect(api.commitRecruitmentImport).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.get('.archive-toggle').attributes('aria-expanded')).toBe('false'); expect(wrapper.get('.exchange-card').isVisible()).toBe(false); expect(wrapper.get('.exchange-card').text()).not.toContain('backup.json')
})
it('游戏快照不一致时仍能从账号栏展开备份，允许导出但禁止导入', async () => {
  archives['acc-a'].game_mismatch = true
  const wrapper = render({ DataAccountContextBar: false, RecruitmentExchange: false }); await flushPromises()
  await wrapper.get('.archive-toggle').trigger('click')
  const exchange = wrapper.get('.exchange-card')
  expect(exchange.isVisible()).toBe(true); expect(button(exchange, '导出完整 JSON').attributes('disabled')).toBeUndefined(); expect(exchange.get('input[type=file]').attributes('disabled')).toBeDefined()
})
const editor = wrapper => wrapper.get('[role=dialog]')
const composer = wrapper => editor(wrapper).get('.entry-composer')
const feed = wrapper => editor(wrapper).findAll('.gacha-record')
async function editRow(wrapper, index = 0) { await feed(wrapper).at(-1 - index).get('.record-detail').trigger('click') }
async function addRecord(wrapper, agent = 'char-a', span = '12') {
  const quick = editor(wrapper).find('.quick-up-button[data-agent-id="' + agent + '"]')
  if (quick.exists()) await quick.trigger('click')
  else {
    await button(editor(wrapper), editor(wrapper).findAll('.quick-up-button').length ? '其他密探' : '新增记录').trigger('click')
    await composer(wrapper).get('.agent-choice[data-agent-id="' + agent + '"]').trigger('click')
  }
  await flushPromises()
  await composer(wrapper).get('.pull-count-field input').setValue(span); await composer(wrapper).get('.composer-actions .primary').trigger('click')
}
it('卡池封面按UP数量组合最多三张立绘，更多UP显示数量提示', async () => {
  const catalog = recruitmentCatalog()
  catalog.pools[0].up_agents = [
    { id: 'slot-1', name: '杨修', operator_id: 'char_001_yangxiu', active: true },
    { id: 'slot-2', name: '贾诩', operator_id: 'char_002_jiaxu', active: true },
    { id: 'slot-3', name: '孙尚香', operator_id: 'char_003_sunshangxiang', active: true },
    { id: 'slot-4', name: '郭嘉', operator_id: 'char_004_guojia', active: true }
  ]
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
  const wrapper = render(); await flushPromises()
  const cover = wrapper.get('.pool-cover')
  expect(cover.findAll('.cover-portrait')).toHaveLength(3)
  expect(cover.findAll('.cover-portrait').map(item => item.attributes('src'))).toEqual([
    '/assets/operator-portraits/char_001_yangxiu.webp',
    '/assets/operator-portraits/char_002_jiaxu.webp',
    '/assets/operator-portraits/char_003_sunshangxiang.webp'
  ])
  expect(cover.get('.cover-more').text()).toBe('+1')
})
it('首页仅时间线，点击读取本池抽卡记录条，头像和出货抽数回显；密探名仅保留在无障碍标签；取消不写入且恢复焦点', async () => {
  const wrapper = render(); await flushPromises(); expect(wrapper.find('.history-card').exists()).toBe(false); expect(wrapper.find('.maintenance').exists()).toBe(false)
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled(); expect(api.listRecruitmentBatches).not.toHaveBeenCalled(); await selectPool(wrapper)
  expect(wrapper.get('.pool-timeline').isVisible()).toBe(true); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0]).toMatchObject({ poolId: 'pool-a', accountId: 'acc-a', order: 'asc' })
  expect([...editor(wrapper).get('.records-section').element.children].slice(0, 2).map(item => item.className)).toEqual(['records-toolbar', 'records-heading'])
  expect(feed(wrapper).map(item => item.get('.pull-result b').text())).toEqual(['31', '17']); expect(feed(wrapper)[0].text()).not.toContain('测试绝密'); expect(feed(wrapper)[0].get('.record-detail').attributes('aria-label')).toContain('测试绝密'); expect(editor(wrapper).find('.entry-composer').exists()).toBe(false)
  await button(editor(wrapper), '取消').trigger('click'); await flushPromises(); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(document.activeElement).toBe(wrapper.get('.pool-card').element); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('本池UP可快捷登记；其他密探默认逆序并支持名册同口径的属性/职业筛选', async () => {
  const catalog = recruitmentCatalog(); catalog.pools[0].up_agents = [{ id: 'slot-up', name: '测试UP', operator_id: 'char-a', active: true }]
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
  getOperatorCatalog.mockResolvedValue({ operators: [
    { id: 'char-a', name: '测试绝密', rarity: 5, prof: '火', sub_prof: 'shenji', games: ['代号鸢'] },
    { id: 'char-b', name: '测试歪卡', avatar_url: '/other.png', rarity: 5, prof: '地', sub_prof: 'pojun', games: ['代号鸢'] },
    { id: 'char-c', name: '测试岐黄', name_pinyin: 'ceshi qihuang', rarity: 5, prof: '水', sub_prof: 'qihuang', games: ['代号鸢'] }
  ] })
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  const quick = editor(wrapper).get('.quick-up-button')
  expect(quick.attributes('aria-label')).toContain('测试绝密'); expect(button(editor(wrapper), '其他密探')).toBeTruthy()
  await quick.trigger('click'); await flushPromises()
  expect(composer(wrapper).find('.agent-picker').exists()).toBe(false); expect(editor(wrapper).get('.quick-up-button').attributes('aria-pressed')).toBe('true'); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); expect(document.activeElement).toBe(composer(wrapper).get('.pull-count-field input').element)
  await composer(wrapper).get('.pull-count-field input').setValue('12'); await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('12'); expect(button(editor(wrapper), '保存 1 项修改')).toBeTruthy()

  await button(editor(wrapper), '其他密探').trigger('click'); await flushPromises()
  const entry = () => composer(wrapper)
  expect(document.activeElement).toBe(entry().get('.agent-search input').element)
  await entry().get('.agent-search input').setValue('csqh')
  expect(entry().findAll('.agent-choice').map(item => item.attributes('data-agent-id'))).toEqual(['char-c'])
  await button(entry(), '取消').trigger('click'); await flushPromises()
  expect(editor(wrapper).find('.entry-composer').exists()).toBe(false)

  await button(editor(wrapper), '其他密探').trigger('click'); await flushPromises()
  expect(entry().findAll('.agent-choice').map(item => item.attributes('data-agent-id'))).toEqual(['char-a', 'char-c', 'char-b', 'slot-up'])
  expect(document.activeElement).toBe(entry().get('.agent-search input').element); expect(entry().find('.pull-count-field').exists()).toBe(false)

  const profButtons = entry().findAll('.agent-filter-options.is-prof button')
  await profButtons.find(item => item.text().includes('地')).trigger('click')
  expect(entry().findAll('.agent-choice').map(item => item.attributes('data-agent-id'))).toEqual(['char-b'])

  await profButtons.find(item => item.text() === '全部').trigger('click')
  const subProfButtons = entry().findAll('.agent-filter-options.is-subprof button')
  await subProfButtons.find(item => item.text() === '岐黄').trigger('click')
  expect(entry().findAll('.agent-choice').map(item => item.attributes('data-agent-id'))).toEqual(['char-c'])
  await entry().get('.agent-filter-reset').trigger('click')
  expect(entry().findAll('.agent-choice')).toHaveLength(4)

  const choice = entry().get('.agent-choice[data-agent-id="char-b"]')
  expect(choice.text()).toContain('测试歪卡'); expect(choice.get('img').attributes('src')).toContain('/other.png')
  await choice.trigger('click'); await flushPromises()
  expect(entry().find('.agent-picker').exists()).toBe(false); expect(document.activeElement).toBe(entry().get('.pull-count-field input').element)
  expect(entry().get('.selected-agent-summary').text()).toContain('已选择密探'); expect(entry().get('.selected-agent-summary').text()).toContain('测试歪卡'); expect(entry().get('.selected-agent-summary img').attributes('src')).toContain('/other.png')
})
it('密探视图不常驻删除按钮，进入记录编辑后再提供删除入口', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(editor(wrapper).findAll('.agent-record-card')).toHaveLength(2)
  expect(editor(wrapper).find('.agent-record-delete').exists()).toBe(false)
  expect(editor(wrapper).find('.agent-record-grid .delete-record').exists()).toBe(false)
  await editor(wrapper).findAll('.agent-record-detail')[0].trigger('click'); await flushPromises()
  expect(button(composer(wrapper), '删除记录')).toBeTruthy()
})
it('单次出货抽数限制为1–40，输入超限会收敛到40且共享规则拒绝绕过UI的超限值', async () => {
  expect(() => entryInput({ agent_id: 'char-a', pull_span: '41' })).toThrow('出货抽数须为 1–40')
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), '新增记录').trigger('click')
  const entry = composer(wrapper)
  await entry.get('.agent-choice[data-agent-id="char-a"]').trigger('click')
  await flushPromises()
  const pullInput = composer(wrapper).get('.pull-count-field input')
  expect(pullInput.attributes('max')).toBe('40'); expect(pullInput.attributes('step')).toBe('1')
  await pullInput.setValue('9999')
  expect(pullInput.element.value).toBe('40')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(feed(wrapper)).toHaveLength(3); expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('40'); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('单条选择密探和17抽后生成记录条，再点记录编辑；一次保存保底，重开回显且不重复新增', async () => {
  api.recruitmentCommand.mockImplementation(async command => {
    for (const entry of command.data.entries) {
      const old = records[command.accountId].find(record => record.event_id === entry.event_id)
      if (old) Object.assign(old, entry)
      else records[command.accountId].push({ ...recruitmentEvent(entry.event_id, entry.pull_span), ...entry, agent_snapshot: { agent_id: entry.agent_id, name: '测试绝密' } })
    }
    archives[command.accountId].pools[0].progress = 40 - command.data.remaining_pulls
    return { archive_revision: ++archives[command.accountId].archive_revision }
  })
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await addRecord(wrapper, 'char-a', '17')
  expect(editor(wrapper).find('.entry-composer').exists()).toBe(false); expect(feed(wrapper)).toHaveLength(3); expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('17'); expect(feed(wrapper)[0].text()).toContain('待保存'); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editRow(wrapper); await composer(wrapper).get('input').setValue('20'); await composer(wrapper).get('.composer-actions .primary').trigger('click'); await editor(wrapper).get('.remaining-field input').setValue('19'); await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  const command = api.recruitmentCommand.mock.calls.at(-1)[0]; expect(command).toMatchObject({ accountId: 'acc-a', expectedRevision: 3, operation: 'pool_records_save', data: { pool_id: 'pool-a', remaining_pulls: 19 } }); expect(command.data.entries.map(entry => entry.pull_span)).toEqual([20, 17]); expect(command.data.entries[0].event_id).toBe('A'); expect(command.data.entries.some(entry => entry.event_id === 'B')).toBe(false)
  await selectPool(wrapper); expect(feed(wrapper).map(item => item.get('.pull-result b').text())).toEqual(['17', '31', '20']); expect(editor(wrapper).get('.remaining-field input').element.value).toBe('19'); expect(archives['acc-a'].current_pool_id).toBe('pool-a')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data.entries).toEqual([])
})
it('移除只提交明确旧ID；取消单条编辑不改变记录，整个弹窗取消不写入', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper); await composer(wrapper).get('input').setValue('20'); await button(composer(wrapper), '取消').trigger('click'); expect(feed(wrapper).at(-1).get('.pull-result b').text()).toBe('17')
  expect(editor(wrapper).find('.record-feed .delete-record').exists()).toBe(false)
  await editRow(wrapper); await button(composer(wrapper), '删除记录').trigger('click')
  await addRecord(wrapper); await feed(wrapper)[0].get('.record-detail').trigger('click'); await button(composer(wrapper), '删除记录').trigger('click')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data).toMatchObject({ entries: [], deleted_event_ids: ['A'] })
  await selectPool(wrapper); expect(feed(wrapper)).toHaveLength(2)
})
it('409重读且保留记录草稿，网络重试requestId和新事件ID不变', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper); await composer(wrapper).get('input').setValue('19'); await composer(wrapper).get('.composer-actions .primary').trigger('click'); archives['acc-a'].archive_revision = 4
  api.recruitmentCommand.mockRejectedValueOnce(Object.assign(new Error('revision changed'), { status: 409 })); await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(feed(wrapper).at(-1).get('.pull-result b').text()).toBe('19'); expect(editor(wrapper).text()).toContain('草稿已保留')
  const first = api.recruitmentCommand.mock.calls.at(-1)[0].requestId; await addRecord(wrapper)
  api.recruitmentCommand.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ archive_revision: 5 }); await editor(wrapper).get('form').trigger('submit'); await flushPromises(); const retry = api.recruitmentCommand.mock.calls.at(-1)[0]; expect(retry.requestId).not.toBe(first); expect(retry.expectedRevision).toBe(4)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toEqual(retry)
})
it('A迟到读写不覆盖B记录或关闭B新弹窗，切账号清旧草稿', async () => {
  const read = deferred(); api.listRecruitmentEvents.mockImplementation(({ accountId }) => accountId === 'acc-a' ? read.promise : Promise.resolve({ items: [], next_cursor: null, archive_revision: 3 }))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper); read.resolve({ items: records['acc-a'], next_cursor: null, archive_revision: 3 }); await flushPromises(); expect(feed(wrapper)).toHaveLength(0)
  api.listRecruitmentEvents.mockImplementation(({ accountId }) => Promise.resolve({ items: records[accountId], next_cursor: null, archive_revision: archives[accountId].archive_revision })); activeAccount.set('acc-a'); await flushPromises(); await selectPool(wrapper); await addRecord(wrapper)
  const write = deferred(); api.recruitmentCommand.mockReturnValue(write.promise); await editor(wrapper).get('form').trigger('submit'); await flushPromises(); activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper); write.resolve({ archive_revision: 4 }); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(true); expect(wrapper.text()).not.toContain('已保存'); expect(wrapper.get('.summary strong').text()).toBe('999'); expect(feed(wrapper)).toHaveLength(0)
})
it('记录读取失败禁止保存可重试；分页不丢草稿且不混合不同版本', async () => {
  api.listRecruitmentEvents.mockRejectedValueOnce(new Error('records unavailable')); const wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); await button(editor(wrapper), '重新读取').trigger('click'); await flushPromises(); expect(feed(wrapper)).toHaveLength(2)
  await button(editor(wrapper), '取消').trigger('click'); api.listRecruitmentEvents.mockResolvedValueOnce({ items: records['acc-a'], next_cursor: 'next', archive_revision: 3 }); await selectPool(wrapper); await addRecord(wrapper)
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [{ ...recruitmentEvent('C', 7), agent_snapshot: { agent_id: 'char-a', name: '测试绝密' } }], next_cursor: 'last', archive_revision: 3 }); await button(editor(wrapper), '加载更早记录').trigger('click'); await flushPromises(); expect(feed(wrapper)).toHaveLength(4); expect(editor(wrapper).text()).toContain('待保存'); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].cursor).toBe('next')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [], next_cursor: null, archive_revision: 4 }); await button(editor(wrapper), '加载更早记录').trigger('click'); await flushPromises(); expect(editor(wrapper).text()).toContain('档案已变化'); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined()
})
it('目录失败可编辑旧抽数和保底，禁止新出货；只选本游戏绝密，UP固定身份回显新图鉴', async () => {
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char-a', name: '正式密探', avatar: '/formal.png', rarity: 5, games: ['代号鸢'] }, { id: 'other', name: '另一游戏', rarity: 5, games: ['如鸢'] }, { id: 'r4', name: '机密', rarity: 4, games: ['代号鸢'] }] })
  const catalog = recruitmentCatalog(); catalog.pools[0].up_agents = [{ id: 'slot', name: '占位', operator_id: 'char-a', active: true }]; api.getRecruitmentCatalog.mockResolvedValue(catalog); records['acc-a'][0].agent_snapshot = { agent_id: 'slot', name: '旧名字' }
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper); expect(composer(wrapper).find('select').exists()).toBe(false); expect(editor(wrapper).get('.quick-up-button').attributes('aria-pressed')).toBe('true'); expect(editor(wrapper).get('.quick-up-button').attributes('aria-label')).toContain('正式密探'); expect(editor(wrapper).get('img').attributes('src')).toContain('/formal.png')
  await editor(wrapper).get('footer button').trigger('click'); api.getRecruitmentCatalog.mockRejectedValue(new Error('catalog unavailable')); await button(wrapper, '刷新档案').trigger('click'); await flushPromises(); await selectPool(wrapper)
  expect(editor(wrapper).get('.add-record').attributes('disabled')).toBeDefined(); await editRow(wrapper); expect(composer(wrapper).find('select').exists()).toBe(false); expect(editor(wrapper).get('.add-record').attributes('disabled')).toBeDefined(); await composer(wrapper).get('input').setValue('20'); await button(composer(wrapper), '完成').trigger('click'); await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data.entries[0]).toMatchObject({ event_id: 'A', pull_span: 20 })
})
it('游戏错配只读；身份失效清弹窗，功能开关关闭时不读写', async () => {
  archives['acc-a'].game_mismatch = true; const wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); auth.accessToken = ''; auth.userInfo = null; await flushPromises(); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(wrapper.find('.summary').exists()).toBe(false); expect(api.recruitmentCommand).not.toHaveBeenCalled(); wrapper.unmount()
  vi.clearAllMocks(); isFeatureEnabled.mockReturnValue(false); const closed = render(); await flushPromises(); expect(closed.text()).toContain('暂未开放'); expect(listAccounts).not.toHaveBeenCalled(); closed.unmount()
})
it('空目录仍可导入并聚焦文件，SSE/游戏/账号删除和卸载继续保持隔离', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await addRecord(wrapper); archives['acc-a'].archive_revision++; subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'recruitment_changed', data: { account_id: 'acc-a' } }); await flushPromises(); expect(editor(wrapper).text()).toContain('待保存')
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '账号', game: '如鸢' }]); subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_stream_open', data: { account_id: 'acc-a' } }); await flushPromises(); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(api.getRecruitmentCatalog.mock.calls.at(-1)[0]).toBe('如鸢')
  listAccounts.mockResolvedValue([{ id: 'acc-b', name: '小号', game: '代号鸢' }]); subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_deleted', data: { account_id: 'acc-a' } }); await flushPromises(); expect(activeAccount.id).toBe('acc-b'); const dispose = subscribeAccountEvents.mock.results.at(-1).value; wrapper.unmount(); expect(dispose).toHaveBeenCalledOnce()
  archives['acc-b'].pools = []; api.getRecruitmentCatalog.mockResolvedValue({ pools: [] }); const empty = render({ RecruitmentExchange: false }); await flushPromises(); expect(empty.text()).toContain('当前游戏暂无公共卡池'); await button(empty, '导入备份').trigger('click'); await flushPromises(); expect(document.activeElement).toBe(empty.get('input[type=file]').element)
})

it('切账号先检查具体卡池草稿，取消保留记录；提交期间禁用切换', async () => {
  const { dialog } = await import('../src/utils/dialog.js')
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(false)
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await editor(wrapper).get('.remaining-field input').setValue('12')
  const context = wrapper.findComponent({ name: 'DataAccountContextBar' })
  expect(await context.props('beforeSwitch')('acc-b')).toBe(false)
  expect(confirm).toHaveBeenCalledTimes(1); expect(activeAccount.id).toBe('acc-a'); expect(editor(wrapper).exists()).toBe(true)
  const write = deferred(); api.recruitmentCommand.mockReturnValueOnce(write.promise)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(context.props('switchDisabled')).toBe(true)
  wrapper.unmount(); write.resolve({ archive_revision: 4 }); await flushPromises()
})


it('时间线只读摘要，账号切换清统计并忽略A迟到响应；保存后刷新次数', async () => {
  const directory = recruitmentCatalog()
  directory.pools[0].up_agents = [{ id: 'slot-a', operator_id: 'char-a', name: '测试绝密' }]
  api.getRecruitmentCatalog.mockResolvedValue(directory)
  archives['acc-a'].pool_summaries = { 'pool-a': { up_agent_counts: { 'slot-a': 2 } } }
  archives['acc-b'].pool_summaries = { 'pool-a': { up_agent_counts: { 'slot-a': 0 } } }
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×2')
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  const late = deferred(), pendingB = deferred()
  api.getRecruitmentArchive.mockReturnValueOnce(late.promise).mockReturnValueOnce(pendingB.promise)
  await button(wrapper, '刷新档案').trigger('click'); await flushPromises()
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.find('.up-count').exists()).toBe(false)
  pendingB.resolve(structuredClone(archives['acc-b'])); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×0')
  late.resolve(structuredClone(archives['acc-a'])); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×0')
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  api.recruitmentCommand.mockImplementation(async () => {
    archives['acc-b'].pool_summaries['pool-a'].up_agent_counts['slot-a'] = 1
    archives['acc-b'].archive_revision++
    return { archive_revision: archives['acc-b'].archive_revision }
  })
  await selectPool(wrapper); await addRecord(wrapper, 'slot-a', '17')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×1')
  expect(api.listRecruitmentEvents).toHaveBeenCalledTimes(1)
  expect(api.listRecruitmentEvents.mock.calls[0][0].accountId).toBe('acc-b')
  wrapper.unmount()
})
