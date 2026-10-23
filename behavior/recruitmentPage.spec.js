// Keep the existing tutorial implementation covered through explicit opt-in.
vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', 'true'))
afterAll(() => vi.unstubAllEnvs())
const tutorialFeature = vi.hoisted(() => ({ enabled: true }))
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub, DOMWrapper } from '@vue/test-utils'
import { routeLocationKey } from 'vue-router'
import RecruitmentPage from '../src/pages/recruitment/RecruitmentWorkspace.vue'
import * as api from '../src/api/recruitment.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'
import { deferred, recruitmentCatalog, recruitmentEvent, recruitmentFixture } from '../test-support/recruitment.js'
import { isFeatureEnabled } from '../src/config/features.js'
import { entryInput } from '../src/pages/recruitment/rules.js'
import { installViewport } from '../test-support/viewport.js'

vi.mock('../src/config/features.js', async original => ({ ...(await original()), get TUTORIALS_ENABLED() { return tutorialFeature.enabled }, isFeatureEnabled: vi.fn(() => true) }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'user-a' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/api/recruitment.js', () => ({ getRecruitmentArchive: vi.fn(), listRecruitmentEvents: vi.fn(), listRecruitmentBatches: vi.fn(), getRecruitmentCatalog: vi.fn(), recruitmentCommand: vi.fn(), exportRecruitment: vi.fn(), previewRecruitmentImport: vi.fn(), commitRecruitmentImport: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: vi.fn(() => vi.fn()) }))

let archives, records
function render(stubs = {}) { return mount(RecruitmentPage, { attachTo: document.body, global: { provide: { [routeLocationKey]: { fullPath: '/recruitment' } }, stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true, RecruitmentExchange: true, Teleport: false, RouterLink: RouterLinkStub, ...stubs } } }) }
async function selectPool(wrapper, index = 0) { await wrapper.findAll('.entry-label')[index].trigger('click'); await flushPromises() }
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
beforeEach(() => {
  tutorialFeature.enabled = true
  // These tests exercise editing; preview visibility is exercised separately below.
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
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

it('平均出绝密使用账号摘要，刷新和切换账号更新且不请求明细', async () => {
  archives['acc-a'].summary.average_gold_pulls = 26.73
  archives['acc-b'].summary.average_gold_pulls = 12
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.summary-average').text()).toContain('平均出绝密抽数')
  expect(wrapper.get('.summary-average strong').text()).toBe('26.73')
  archives['acc-a'].summary.average_gold_pulls = 28.5
  await wrapper.get('.archive-refresh').trigger('click'); await flushPromises()
  expect(wrapper.get('.summary-average strong').text()).toBe('28.50')
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.get('.summary-average strong').text()).toBe('12.00')
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  expect(api.listRecruitmentBatches).not.toHaveBeenCalled()
  wrapper.unmount()
})

it.each([null, undefined])('平均出绝密无有效样本或旧摘要字段缺失（%s）显示未知', async value => {
  archives['acc-a'].summary.average_gold_pulls = value
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.summary-average strong').text()).toBe('—')
  wrapper.unmount()
})

it('普池抽数与绝密排行保留并列，并随刷新及账号切换更新', async () => {
  Object.assign(archives['acc-a'].summary, {
    permanent_known_total_pulls: 1234,
    most_obtained_gold_agents: [{ agent_id: 'char-a', name: '旧名字', count: 8 }, { agent_id: 'char-b', name: '并列绝密', count: 8 }],
    most_non_up_gold_agents: [{ agent_id: 'char-c', name: '歪卡绝密', count: 3 }, { agent_id: 'char-d', name: '并列歪卡', count: 3 }],
    most_permanent_gold_agents: [{ agent_id: 'char-a', name: '旧名字', count: 2 }, { agent_id: 'char-b', name: '常驻并列绝密', count: 2 }]
  })
  Object.assign(archives['acc-b'].summary, { permanent_known_total_pulls: 0, most_obtained_gold_agents: [], most_non_up_gold_agents: [], most_permanent_gold_agents: [] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.summary-permanent strong').text()).toBe((1234).toLocaleString())
  expect(wrapper.get('.summary-most-obtained').text()).toContain('测试绝密8 次')
  expect(wrapper.get('.summary-most-obtained').findAll('li')).toHaveLength(2)
  expect(wrapper.get('.summary-most-obtained').text()).toContain('并列绝密8 次')
  expect(wrapper.get('.summary-most-non-up').text()).toContain('歪卡绝密3 次')
  expect(wrapper.get('.summary-most-non-up').text()).toContain('并列歪卡3 次')
  expect(wrapper.get('.summary-most-permanent').text()).toContain('常驻池抽中最多的绝密')
  expect(wrapper.get('.summary-most-permanent').text()).toContain('测试绝密2 次')
  expect(wrapper.get('.summary-most-permanent').text()).toContain('常驻并列绝密2 次')
  expect(wrapper.get('.summary-most-permanent summary').text()).toBe('常驻榜说明')
  expect(wrapper.get('.summary-most-permanent details').attributes('open')).toBeUndefined()
  await wrapper.get('.summary-most-permanent summary').trigger('click')
  expect(wrapper.get('.summary-most-permanent details').attributes('open')).toBeDefined()
  expect(wrapper.get('.summary-most-permanent details').text()).toContain('无结束日期且类型明确为常驻')
  expect(wrapper.get('.summary-most-permanent details').text()).toContain('未分类：卡池类型未确认的记录不计入常驻榜')
  archives['acc-a'].summary.permanent_known_total_pulls = 1250
  archives['acc-a'].summary.most_non_up_gold_agents[0].count = 4
  archives['acc-a'].summary.most_permanent_gold_agents = [{ agent_id: 'char-b', name: '常驻并列绝密', count: 2 }]
  await wrapper.get('.archive-refresh').trigger('click'); await flushPromises()
  expect(wrapper.get('.summary-permanent strong').text()).toBe((1250).toLocaleString())
  expect(wrapper.get('.summary-most-non-up').text()).toContain('歪卡绝密4 次')
  expect(wrapper.get('.summary-most-permanent').findAll('li')).toHaveLength(1)
  expect(wrapper.get('.summary-most-permanent').text()).not.toContain('测试绝密')
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.get('.summary-permanent strong').text()).toBe('0')
  expect(wrapper.get('.summary-most-obtained').text()).toContain('暂无记录')
  expect(wrapper.get('.summary-most-non-up').text()).toContain('暂无记录')
  expect(wrapper.get('.summary-most-permanent').text()).toContain('暂无记录')
  expect(wrapper.text()).not.toContain('并列绝密')
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  expect(api.listRecruitmentBatches).not.toHaveBeenCalled()
  wrapper.unmount()
})

for (const [key, field] of [['most-obtained', 'most_obtained_gold_agents'], ['most-permanent', 'most_permanent_gold_agents']]) {
it.each([0, 1, 3])(`${key} 有 %i 位并列时全部展示且不提供展开按钮`, async count => {
  archives['acc-a'].summary[field] = Array.from({ length: count }, (_, index) => ({ agent_id: `gold-${index}`, name: `绝密${index}`, count: 5 }))
  const wrapper = render(); await flushPromises()
  const highlight = wrapper.get(`.summary-${key}`)
  expect(highlight.findAll('li')).toHaveLength(count)
  expect(highlight.find('button').exists()).toBe(false)
  if (!count) expect(highlight.text()).toContain('暂无记录')
  wrapper.unmount()
})

it.each([4, 5])(`${key} 有 %i 位并列时默认三位，可展开收起，切账号后恢复折叠`, async count => {
  const leaders = Array.from({ length: count }, (_, index) => ({ agent_id: `gold-${index}`, name: `绝密${index}`, count: 5 }))
  archives['acc-a'].summary[field] = leaders
  archives['acc-b'].summary[field] = leaders
  const wrapper = render(); await flushPromises()
  const highlight = () => wrapper.get(`.summary-${key}`)
  const names = () => highlight().findAll('li strong').map(item => item.text())
  expect(names()).toEqual(['绝密0', '绝密1', '绝密2'])
  expect(highlight().get('button').text()).toBe(`另有 ${count - 3} 位并列 · 展开全部`)
  expect(highlight().get('button').attributes('aria-expanded')).toBe('false')
  expect(highlight().get('button').attributes('aria-controls')).toBe(highlight().get('ul').attributes('id'))
  await highlight().get('button').trigger('click')
  expect(names()).toEqual(leaders.map(agent => agent.name))
  expect(highlight().findAll('li small').map(item => item.text())).toEqual(leaders.map(() => '5 次'))
  expect(highlight().get('button').text()).toBe('收起')
  expect(highlight().get('button').attributes('aria-expanded')).toBe('true')
  await highlight().get('button').trigger('click')
  expect(names()).toEqual(['绝密0', '绝密1', '绝密2'])
  await highlight().get('button').trigger('click')
  activeAccount.set('acc-b'); await flushPromises()
  expect(names()).toEqual(['绝密0', '绝密1', '绝密2'])
  expect(highlight().get('button').attributes('aria-expanded')).toBe('false')
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  expect(api.listRecruitmentBatches).not.toHaveBeenCalled()
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  wrapper.unmount()
})
}

it('两个折叠榜独立展开，非UP榜继续显示所有并列', async () => {
  const leaders = Array.from({ length: 5 }, (_, index) => ({ agent_id: `gold-${index}`, name: `完整长名字绝密${index}`, count: 2 }))
  Object.assign(archives['acc-a'].summary, { most_obtained_gold_agents: leaders, most_permanent_gold_agents: leaders, most_non_up_gold_agents: leaders })
  const wrapper = render(); await flushPromises()
  await wrapper.get('.summary-most-permanent button').trigger('click')
  expect(wrapper.get('.summary-most-permanent').findAll('li')).toHaveLength(5)
  expect(wrapper.get('.summary-most-obtained').findAll('li')).toHaveLength(3)
  expect(wrapper.get('.summary-most-non-up').findAll('li')).toHaveLength(5)
  expect(wrapper.get('.summary-most-non-up').find('button').exists()).toBe(false)
  await wrapper.get('.summary-most-obtained button').trigger('click')
  await wrapper.get('.summary-most-permanent button').trigger('click')
  expect(wrapper.get('.summary-most-obtained').findAll('li')).toHaveLength(5)
  expect(wrapper.get('.summary-most-permanent').findAll('li')).toHaveLength(3)
  expect(wrapper.get('.summary-most-permanent button').attributes('aria-label')).toContain('常驻池抽中最多的绝密')
  wrapper.unmount()
})

it.each([null, undefined])('普池抽数与绝密排行在字段缺失或null（%s）时显示未知', async value => {
  archives['acc-a'].summary.most_permanent_gold_agents = value
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.summary-permanent strong').text()).toBe('—')
  expect(wrapper.get('.summary-most-obtained').text()).toContain('—')
  expect(wrapper.get('.summary-most-non-up').text()).toContain('—')
  expect(wrapper.get('.summary-most-permanent .summary-empty').text()).toBe('—')
  expect(wrapper.find('.summary-agent-toggle').exists()).toBe(false)
  wrapper.unmount()
})

it('首次读取失败保留错误，不将常驻榜伪装成空记录', async () => {
  api.getRecruitmentArchive.mockRejectedValue(new Error('档案读取失败'))
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('档案读取失败')
  expect(wrapper.find('.summary-most-permanent').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('暂无记录')
  wrapper.unmount()
})

it('关闭教程保留真实卡池与出货录入表单，编辑器不会自动进入引导', async () => {
  tutorialFeature.enabled = false
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  const panel = editor(wrapper)
  expect(wrapper.find('.recruitment-tutorial-entry').exists()).toBe(false)
  expect(panel.find('.guide-entry, .guide-choice, .guide-hint, .guide-exit').exists()).toBe(false)
  expect(panel.find('.daily-entry').exists()).toBe(false)
  expect(panel.get('.progress-card').isVisible()).toBe(true)
  expect(panel.get('.entry-shortcuts').isVisible()).toBe(true)
  expect(panel.get('footer').isVisible()).toBe(true)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

function firstRecordAccount() {
  records['acc-a'] = []
  archives['acc-a'].summary.event_count = 0
  const catalog = recruitmentCatalog()
  catalog.pools[0].up_agents = [{ id: 'slot-up', operator_id: 'char-a', name: '测试绝密', active: true }]
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
}

async function startEditorGuide(wrapper, branch = 'record') {
  if (editor(wrapper).find('.guide-exit').exists()) await button(editor(wrapper), '退出教程').trigger('click')
  await button(editor(wrapper), '使用教程').trigger('click')
  await editor(wrapper).get('.guide-choice button').trigger('click')
  const choice = button(editor(wrapper), branch === 'progress' ? '还没出绝密' : '记录密探')
  if (['record', 'progress'].includes(branch) && !choice.element.disabled) await choice.trigger('click')
  await flushPromises()
}
const beginGuide = wrapper => startEditorGuide(wrapper)
async function saveGuidedRecord(wrapper) {
  const calls = api.recruitmentCommand.mock.calls.length
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(calls)
  await editor(wrapper).get('form').trigger('submit')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(calls + 1)
  await flushPromises()
}
const confirmed = wrapper => editor(wrapper).get('.footer-state').text().includes('已保存并核对')
const hintTarget = wrapper => editor(wrapper).get('.guide-hint').attributes('data-guide-for')
function persistSubmittedRecord(summaryValues = {}) {
  api.recruitmentCommand.mockImplementation(async ({ accountId, data }) => {
    for (const entry of data.entries) {
      const event = { ...recruitmentEvent(entry.event_id, entry.pull_span, data.pool_id), up_status: entry.up_status, acquired_date: entry.acquired_date, note: entry.note, agent_snapshot: { agent_id: entry.agent_id, name: '测试绝密', rarity: 5 } }
      const index = records[accountId].findIndex(item => item.event_id === entry.event_id)
      if (index < 0) records[accountId].push(event)
      else records[accountId][index] = event
    }
    records[accountId] = records[accountId].filter(event => !data.deleted_event_ids.includes(event.event_id))
    const pool = archives[accountId].pools.find(pool => pool.pool_id === data.pool_id)
    if (data.remaining_pulls != null) pool.progress = 40 - data.remaining_pulls
    archives[accountId].summary.event_count = records[accountId].length
    const poolEvents = records[accountId].filter(event => event.pool_id === data.pool_id)
    const poolSummary = { known_total_pulls: poolEvents.filter(event => !event.batch_id).reduce((sum, event) => sum + (event.pull_span ?? 0), 0) + (pool.progress ?? 0), event_count: poolEvents.length, up_agent_counts: {} }
    for (const event of poolEvents) if (event.up_status === 'up') poolSummary.up_agent_counts[event.agent_snapshot.agent_id] = (poolSummary.up_agent_counts[event.agent_snapshot.agent_id] || 0) + 1
    archives[accountId].pool_summaries = { ...archives[accountId].pool_summaries, [data.pool_id]: { ...poolSummary, ...summaryValues } }
    archives[accountId].archive_revision++
    return { archive_revision: archives[accountId].archive_revision }
  })
}

it('只提供真实记录、练习、关闭；选真实卡池才能进入结果选择', async () => {
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('.guide-hint').exists()).toBe(false)
  await wrapper.get('.recruitment-tutorial-entry').trigger('click')
  expect(wrapper.findAll('.guide-choice button')).toHaveLength(3)
  expect(wrapper.find('[data-guide-topic]').exists()).toBe(false)
  await wrapper.get('.guide-choice button').trigger('click')
  expect(wrapper.get('.guide-hint').attributes('data-guide-for')).toBe('pool-cards')
  expect(new DOMWrapper(document.body).find('.pool-editor[role=dialog]').exists()).toBe(false)
  await selectPool(wrapper); expect(hintTarget(wrapper)).toBe('result')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('UP真实选择、未知间隔确认与保底核对推进到保存；同ID读回后才确认', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  expect(hintTarget(wrapper)).toBe('agents')
  await editor(wrapper).get('.quick-up-button').trigger('click'); expect(hintTarget(wrapper)).toBe('pulls')
  await editor(wrapper).get('.unknown-pulls').trigger('click'); expect(hintTarget(wrapper)).toBe('progress')
  await editor(wrapper).get('.remaining-field input').trigger('blur'); expect(hintTarget(wrapper)).toBe('save-record')
  const reading = deferred(); api.listRecruitmentEvents.mockReturnValueOnce(reading.promise)
  await saveGuidedRecord(wrapper); expect(confirmed(wrapper)).toBe(false)
  expect(api.recruitmentCommand.mock.calls[0][0].data.entries[0]).toMatchObject({ agent_id: 'slot-up', pull_span: null })
  reading.resolve({ items: structuredClone(records['acc-a']), archive_revision: 4, next_cursor: null }); await flushPromises()
  expect(confirmed(wrapper)).toBe(true); expect(hintTarget(wrapper)).toBe('guide-record')
  await button(editor(wrapper), '密探视图').trigger('click'); expect(editor(wrapper).get('.agent-pull-badge').text()).toBe('未知')
})
it('搜索与真实输入推进；保存失败保留草稿，重试读回才确认', async () => {
  firstRecordAccount(); api.recruitmentCommand.mockRejectedValueOnce(new Error('保存失败'))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await button(editor(wrapper), '其他密探').trigger('click'); expect(hintTarget(wrapper)).toBe('agent-search')
  await composer(wrapper).get('.agent-search input').setValue('测试绝密'); expect(hintTarget(wrapper)).toBe('agent-results')
  await composer(wrapper).get('.agent-choice').trigger('click'); expect(hintTarget(wrapper)).toBe('pulls')
  await composer(wrapper).get('.pull-count-field input').setValue('20'); await composer(wrapper).get('.pull-count-field input').trigger('blur')
  expect(hintTarget(wrapper)).toBe('progress')
  await saveGuidedRecord(wrapper); expect(confirmed(wrapper)).toBe(false)
  expect(editor(wrapper).get('.pull-result b').text()).toBe('20')
  persistSubmittedRecord(); await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(confirmed(wrapper)).toBe(true)
})
it('没有业务动作无法成功；响应未读到相同记录也不确认', async () => {
  firstRecordAccount(); const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  expect(button(editor(wrapper), '下一步')).toBeUndefined(); expect(button(editor(wrapper), '知道了')).toBeUndefined()
  await editor(wrapper).get('form').trigger('submit'); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editor(wrapper).get('.quick-up-button').trigger('click'); await saveGuidedRecord(wrapper)
  expect(confirmed(wrapper)).toBe(false); expect(hintTarget(wrapper)).toBe('readback')
})
it('Esc只退出教学，保留编辑器、搜索、抽数与焦点；重入使用现有草稿', async () => {
  firstRecordAccount(); const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  const input = composer(wrapper).get('.pull-count-field input'); await input.setValue('20'); input.element.focus()
  expect(document.activeElement).toBe(input.element)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(editor(wrapper).find('.guide-exit').exists()).toBe(false); expect(input.element.value).toBe('20'); expect(document.activeElement).toBe(input.element)
  await startEditorGuide(wrapper); expect(input.element.value).toBe('20'); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('保存期间退出不取消请求，也不重新弹教学', async () => {
  firstRecordAccount(); const saving = deferred(); api.recruitmentCommand.mockReturnValueOnce(saving.promise)
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click'); await saveGuidedRecord(wrapper)
  await button(editor(wrapper), '退出教程').trigger('click')
  saving.resolve({ archive_revision: 4 }); await flushPromises()
  expect(editor(wrapper).find('.guide-hint').exists()).toBe(false); expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})
it('已有记录直接切换视图学习，不造记录；重新挂载也不主动打扰', async () => {
  let wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'view')
  await button(editor(wrapper), '密探视图').trigger('click'); expect(hintTarget(wrapper)).toBe('guide-record')
  expect(editor(wrapper).get('footer').isVisible()).toBe(false)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  wrapper.unmount(); wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(editor(wrapper).find('.guide-hint').exists()).toBe(false)
})
it('读回失败不能完成，重新读取才能确认且只写一次', async () => {
  firstRecordAccount(); persistSubmittedRecord(); const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  api.listRecruitmentEvents.mockRejectedValueOnce(new Error('读回失败'))
  await editor(wrapper).get('.quick-up-button').trigger('click'); await saveGuidedRecord(wrapper); expect(confirmed(wrapper)).toBe(false)
  await button(editor(wrapper), '重新读取').trigger('click'); await flushPromises(); expect(confirmed(wrapper)).toBe(true)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})
it('档案读回失败或重试进行中不能提前确认', async () => {
  firstRecordAccount(); persistSubmittedRecord(); const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click'); api.getRecruitmentArchive.mockRejectedValueOnce(new Error('档案回读失败'))
  await saveGuidedRecord(wrapper); expect(confirmed(wrapper)).toBe(false)
  const reading = deferred(); api.getRecruitmentArchive.mockReturnValueOnce(reading.promise)
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises(); expect(confirmed(wrapper)).toBe(false)
  reading.reject(new Error('仍失败')); await flushPromises(); expect(confirmed(wrapper)).toBe(false)
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises(); expect(confirmed(wrapper)).toBe(true)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})
it('搜索没有结果提示回到真实输入，退出保留关键词；读取期间也可立即退出', async () => {
  firstRecordAccount()
  let wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await button(editor(wrapper), '其他密探').trigger('click'); await composer(wrapper).get('.agent-search input').setValue('不存在的名字')
  expect(hintTarget(wrapper)).toBe('agent-search'); expect(editor(wrapper).get('.guide-hint').text()).toContain('换个关键词')
  await button(editor(wrapper), '退出教程').trigger('click'); await flushPromises()
  expect(composer(wrapper).get('.agent-search input').element.value).toBe('不存在的名字')
  expect(document.activeElement).toBe(composer(wrapper).get('.agent-search input').element)
  wrapper.unmount()
  const reading = deferred(); api.listRecruitmentEvents.mockReturnValueOnce(reading.promise)
  wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper)
  expect(hintTarget(wrapper)).toBe('read-state'); await button(editor(wrapper), '退出教程').trigger('click')
  expect(editor(wrapper).find('.guide-hint').exists()).toBe(false)
  reading.resolve({ items: [], archive_revision: 3, next_cursor: null }); await flushPromises()
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('未出绝密主题只保存真实保底，读回进度一致才完成；不新增记录', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'progress')
  expect(editor(wrapper).text()).toContain('不会新增密探记录')
  await editor(wrapper).get('.remaining-field input').setValue('33')
  expect(editor(wrapper).get('.progress-number strong').text()).toBe('33')
  expect(confirmed(wrapper)).toBe(false)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[0][0].data).toEqual({ pool_id: 'pool-a', entries: [], deleted_event_ids: [], remaining_pulls: 33 })
  expect(editor(wrapper).get('.footer-state').text()).toContain('已保存并核对')
  expect(editor(wrapper).get('.progress-card').classes()).toContain('is-saved')
  expect(confirmed(wrapper)).toBe(true)
  expect(records['acc-a']).toHaveLength(2)
  expect(editor(wrapper).find('.pending-mark').exists()).toBe(false)
  expect(editor(wrapper).get('footer button[type=submit]').element.disabled).toBe(true)
})

it('保底保存失败或回读值不同不完成，重新核对后完成且不重复发送', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'progress')
  await editor(wrapper).get('.remaining-field input').setValue('25')
  api.recruitmentCommand.mockRejectedValueOnce(new Error('进度保存失败'))
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(confirmed(wrapper)).toBe(false)
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('25')
  api.recruitmentCommand.mockImplementationOnce(async () => { archives['acc-a'].archive_revision++; return { archive_revision: 4 } })
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(confirmed(wrapper)).toBe(false)
  expect(editor(wrapper).text()).toContain('结果尚未确认')
  archives['acc-a'].pools[0].progress = 15
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises()
  expect(confirmed(wrapper)).toBe(true)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(2)
})

it('教程允许未知保底与未知间隔直接保存，原子请求与读回均保留未知', async () => {
  firstRecordAccount(); archives['acc-a'].pools[0].progress = null
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('')
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await editor(wrapper).get('.unknown-pulls').trigger('click')
  expect(hintTarget(wrapper)).toBe('save-record')
  expect(editor(wrapper).text()).toContain('保底选填，留空保留原进度')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(editor(wrapper).text()).toContain('待保存')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  expect(api.recruitmentCommand.mock.calls[0][0].data).toMatchObject({ remaining_pulls: null, entries: [{ pull_span: null }] })
  expect(confirmed(wrapper)).toBe(true)
  expect(archives['acc-a'].pools[0].progress).toBeNull()
  expect(editor(wrapper).get('.pull-result b').text()).toBe('未知')
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('')
})

it('未知保底的待保存记录退出教程后保留草稿和字段焦点，不提前写入', async () => {
  firstRecordAccount(); archives['acc-a'].pools[0].progress = null
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await editor(wrapper).get('.unknown-pulls').trigger('click')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  editor(wrapper).get('.remaining-field input').element.focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(document.activeElement).toBe(editor(wrapper).get('.remaining-field input').element)
  expect(editor(wrapper).get('.pull-result b').text()).toBe('未知')
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('')
  expect(editor(wrapper).text()).toContain('待保存')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('回访用户出货主题允许同一密探再新增，保存这笔与普通相同；同ID字段不一致不完成', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper)
  await button(editor(wrapper), '新增记录').trigger('click')
  await composer(wrapper).get('.agent-choice').trigger('click')
  expect(composer(wrapper).get('.composer-actions .primary').text()).toBe('加入')
  await composer(wrapper).get('.pull-count-field input').setValue('20')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  api.listRecruitmentEvents.mockImplementationOnce(async () => {
    const data = structuredClone(records['acc-a']); data.at(-1).pull_span = 19
    return { items: data, next_cursor: null, archive_revision: archives['acc-a'].archive_revision }
  })
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(records['acc-a']).toHaveLength(3)
  expect(confirmed(wrapper)).toBe(false)
  expect(editor(wrapper).text()).toContain('结果尚未确认')
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises()
  expect(confirmed(wrapper)).toBe(true)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  expect(editor(wrapper).findAll('.gacha-record')).toHaveLength(3)
  expect(editor(wrapper).find('.pending-mark').exists()).toBe(false)
})

it('历史维护主题必须修改原记录并读回目标字段；仅浏览或完成编辑不算保存', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'maintain')
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(confirmed(wrapper)).toBe(false)
  await editor(wrapper).findAll('.agent-record-detail').at(-1).trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('')
  expect(composer(wrapper).get('.composer-actions .primary').text()).toBe('完成')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  expect(confirmed(wrapper)).toBe(false)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[0][0].data.entries).toEqual([expect.objectContaining({ event_id: 'A', pull_span: null })])
  expect(records['acc-a']).toHaveLength(2)
  expect(confirmed(wrapper)).toBe(true)
  expect(confirmed(wrapper)).toBe(true)
  expect(editor(wrapper).find('.is-pending').exists()).toBe(false)
  await editor(wrapper).get('.close-button').trigger('click'); await selectPool(wrapper); await startEditorGuide(wrapper, 'maintain')
  expect(editor(wrapper).text()).not.toContain('修改已保存并读回确认')
  expect(editor(wrapper).findAll('.agent-record-card')).toHaveLength(2)
})

it('教程409保留修改草稿并重读版本，核对后提交同一原event_id才完成', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'maintain')
  await editRow(wrapper); await composer(wrapper).get('.pull-count-field input').setValue('22')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  archives['acc-a'].archive_revision++
  api.recruitmentCommand.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 }))
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(confirmed(wrapper)).toBe(false)
  expect(editor(wrapper).text()).toContain('草稿已保留')
  expect(editor(wrapper).findAll('.pull-result b').at(-1).text()).toBe('22')
  persistSubmittedRecord()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ expectedRevision: 4, data: { entries: [expect.objectContaining({ event_id: 'A', pull_span: 22 })] } })
  expect(confirmed(wrapper)).toBe(true)
})

it('新增记录在回读第二页才出现时继续分页核验，不丢草稿或重复创建', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [], next_cursor: 'after-first', archive_revision: 4 })
  const second = deferred(); api.listRecruitmentEvents.mockReturnValueOnce(second.promise)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(confirmed(wrapper)).toBe(false)
  expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].cursor).toBe('after-first')
  second.resolve({ items: structuredClone(records['acc-a']), next_cursor: null, archive_revision: 4 }); await flushPromises()
  expect(confirmed(wrapper)).toBe(true)
  expect(editor(wrapper).findAll('.gacha-record')).toHaveLength(1)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('新增ID已回读但字段不同，重新核对同一ID，不再次提交或新增', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('20')
  api.listRecruitmentEvents.mockImplementationOnce(async () => {
    const data = structuredClone(records['acc-a']); data[0].pull_span = 19
    return { items: data, next_cursor: null, archive_revision: 4 }
  })
  await saveGuidedRecord(wrapper)
  expect(confirmed(wrapper)).toBe(false)
  const id = api.recruitmentCommand.mock.calls[0][0].data.entries[0].event_id
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises()
  expect(records['acc-a']).toHaveLength(1)
  expect(records['acc-a'][0].event_id).toBe(id)
  expect(confirmed(wrapper)).toBe(true)
})

it('已有草稿中退出重入教程，不清空输入、不引导点击禁用的底部保存', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), '新增记录').trigger('click'); await composer(wrapper).get('.agent-choice').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('12')
  await startEditorGuide(wrapper, 'progress')
  expect(hintTarget(wrapper)).toBe('pulls')
  expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined()
  await startEditorGuide(wrapper, 'maintain')
  expect(hintTarget(wrapper)).toBe('pulls')
  expect(composer(wrapper).get('.pull-count-field input').element.value).toBe('12')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('成功保存后再编辑、删除和改保底，重开教程不会用旧回执覆盖新草稿', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'maintain')
  await editRow(wrapper); await composer(wrapper).get('.pull-count-field input').setValue('22')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  await editRow(wrapper); await composer(wrapper).get('.pull-count-field input').setValue('26')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  await editor(wrapper).get('.remaining-field input').setValue('31')
  await feed(wrapper)[0].get('.record-detail').trigger('click'); await button(composer(wrapper), '删除记录').trigger('click')
  await button(editor(wrapper), '退出教程').trigger('click'); await startEditorGuide(wrapper, 'maintain')
  expect(feed(wrapper)).toHaveLength(1)
  expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('26')
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('31')
  expect(editor(wrapper).get('.footer-state strong').text()).toBe('3 项未保存')
  expect(editor(wrapper).get('footer button[type=submit]').text()).toBe('保存修改')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('成功请求回读失败后继续修改，首次核对旧回执只校准已提交基准，不覆盖后续草稿', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'maintain')
  await editRow(wrapper); await composer(wrapper).get('.pull-count-field input').setValue('22')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  api.listRecruitmentEvents.mockRejectedValueOnce(new Error('回读失败'))
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  await editRow(wrapper); await composer(wrapper).get('.pull-count-field input').setValue('26')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  await editor(wrapper).get('.remaining-field input').setValue('31')
  await feed(wrapper)[0].get('.record-detail').trigger('click'); await button(composer(wrapper), '删除记录').trigger('click')
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises()
  expect(feed(wrapper)).toHaveLength(1)
  expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('26')
  expect(editor(wrapper).get('.footer-state strong').text()).toBe('3 项未保存')
  expect(editor(wrapper).get('footer button[type=submit]').text()).toBe('保存修改')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('只读档案可以通过真实视图学习，不必造记录', async () => {
  archives['acc-a'].game_mismatch = true
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'view')
  expect(hintTarget(wrapper)).toBe('views')
  await button(editor(wrapper), '密探视图').trigger('click'); expect(hintTarget(wrapper)).toBe('guide-record')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('无游戏账号主动求助给真实创建入口，Esc恢复教程入口焦点', async () => {
  listAccounts.mockResolvedValue([])
  const wrapper = render(); await flushPromises()
  await wrapper.get('.recruitment-tutorial-entry').trigger('click'); await wrapper.get('.guide-choice button').trigger('click')
  expect(wrapper.get('.guide-hint').attributes('data-guide-for')).toBe('account-setup')
  await wrapper.get('main').trigger('keydown', { key: 'Escape' }); await flushPromises()
  expect(wrapper.find('.guide-hint').exists()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('.recruitment-tutorial-entry').element)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
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
  expect(toggle.text()).toBe('导入与导出'); expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(toggle.attributes('aria-controls')).toBe(exchange.attributes('id')); expect(header.element.nextElementSibling.firstElementChild).toBe(exchange.element); expect(exchange.isVisible()).toBe(false)
  await toggle.trigger('click')
  expect(toggle.text()).toBe('收起导入与导出'); expect(toggle.attributes('aria-expanded')).toBe('true'); expect(exchange.isVisible()).toBe(true)
  api.previewRecruitmentImport.mockResolvedValue({ target_revision: archives['acc-a'].archive_revision, expires_at: new Date(Date.now() + 60000).toISOString(), items: [], stats: { added: 0, duplicates: 0, conflicts: 0, skipped: 0 }, risks: [], can_commit: true })
  const input = exchange.get('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'backup.json', size: 100, text: async () => JSON.stringify({ schema: 'yuanhub.recruitment.v1', game: '代号鸢', source_account: { account_id: 'acc-a' }, events: [], batches: [], pools: [], temporary_agents: [] }) }] })
  await input.trigger('change'); await flushPromises()
  const importDialog = new DOMWrapper(document.body).get('.exchange-dialog')
  await importDialog.get('select').setValue('use_backup'); await flushPromises()
  await importDialog.get('.close-button').trigger('click'); await flushPromises()
  await toggle.trigger('click'); expect(exchange.isVisible()).toBe(false)
  await toggle.trigger('click'); await button(exchange, '继续导入').trigger('click'); await flushPromises()
  const resumedDialog = new DOMWrapper(document.body).get('.exchange-dialog')
  expect(resumedDialog.text()).toContain('backup.json'); expect(resumedDialog.get('select').element.value).toBe('use_backup')
  expect(api.exportRecruitment).not.toHaveBeenCalled(); expect(api.previewRecruitmentImport).toHaveBeenCalled(); expect(api.commitRecruitmentImport).not.toHaveBeenCalled(); expect(api.recruitmentCommand).not.toHaveBeenCalled()
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.get('.archive-toggle').attributes('aria-expanded')).toBe('false'); expect(wrapper.get('.exchange-card').isVisible()).toBe(false); expect(wrapper.get('.exchange-card').text()).not.toContain('backup.json')
})
it('游戏快照不一致时仍能从账号栏展开备份，允许导出但禁止导入', async () => {
  archives['acc-a'].game_mismatch = true
  const wrapper = render({ DataAccountContextBar: false, RecruitmentExchange: false }); await flushPromises()
  await wrapper.get('.archive-toggle').trigger('click')
  const exchange = wrapper.get('.exchange-card')
  expect(exchange.isVisible()).toBe(true); expect(exchange.findAll('button').find(item => item.text().startsWith('下载完整备份（JSON）')).attributes('disabled')).toBeUndefined(); expect(exchange.get('input[type=file]').attributes('disabled')).toBeDefined()
})
const editor = () => new DOMWrapper(document.body).get('.pool-editor[role=dialog]')
const composer = wrapper => editor(wrapper).get('.entry-composer')
const feed = wrapper => editor(wrapper).findAll('.gacha-record')
async function editRow(wrapper, index = 0) { await feed(wrapper).at(-1 - index).get('.record-detail').trigger('click') }
it.each([390, 1440])('真实招募工作区跨布局保持行草稿、排序与焦点，不触发写入：%ipx', async width => {
  const viewport = installViewport(width)
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await editRow(wrapper)
  const input = composer(wrapper).get('.pull-count-field input')
  await input.setValue('22'); input.element.focus()
  const instance = wrapper.getComponent({ name: 'PoolEditor' }).vm.$
  const rows = feed(wrapper).map(row => row.element)
  const reads = [api.getRecruitmentArchive.mock.calls.length, api.listRecruitmentEvents.mock.calls.length]
  for (const next of [430, 431, 520, 521, 699, 700, 767, 768, 1080, 1081, 320, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent({ name: 'PoolEditor' }).vm.$).toBe(instance)
    expect(document.querySelectorAll('.pool-editor[role="dialog"]')).toHaveLength(1)
    expect(feed(wrapper).map(row => row.element)).toEqual(rows)
    expect(input.element.value).toBe('22')
    expect(document.activeElement).toBe(input.element)
    expect([api.getRecruitmentArchive.mock.calls.length, api.listRecruitmentEvents.mock.calls.length]).toEqual(reads)
    expect(api.recruitmentCommand).not.toHaveBeenCalled()
  }
})
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
  expect(editor(wrapper).get('.record-view-switch').exists()).toBe(true)
  expect(editor(wrapper).get('.records-heading h3').text()).toContain('抽卡档案')
  expect(feed(wrapper).map(item => item.get('.pull-result b').text())).toEqual(['31', '17']); expect(feed(wrapper)[0].text()).not.toContain('测试绝密'); expect(feed(wrapper)[0].get('.record-detail').attributes('aria-label')).toContain('测试绝密'); expect(editor(wrapper).get('.entry-placeholder input').element.disabled).toBe(true)
  await button(editor(wrapper), '取消').trigger('click'); await flushPromises(); expect(new DOMWrapper(document.body).find('.pool-editor[role=dialog]').exists()).toBe(false); expect(document.activeElement).toBe(wrapper.get('.entry-label').element); expect(api.recruitmentCommand).not.toHaveBeenCalled()
})
it('本池UP可快捷登记；其他密探默认逆序并支持名册同口径的属性/职业筛选', async () => {
  const catalog = recruitmentCatalog(); catalog.pools[0].up_agents = [{ id: 'slot-up', name: '测试UP', operator_id: 'char-a', active: true }]
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
  getOperatorCatalog.mockResolvedValue({ operators: [
    { id: 'char-a', name: '测试绝密', rarity: 5, prof: '火', sub_prof: 'shenji', games: ['代号鸢'] },
    { id: 'char-b', name: '测试歪卡', avatar_url: '/other.png', rarity: 5, prof: '地', sub_prof: 'pojun', games: ['代号鸢'] },
    { id: 'char-c', name: '测试岐黄', name_pinyin: 'ceshi qihuang', rarity: 5, prof: '水', sub_prof: 'qihuang', games: ['代号鸢'] }
  ] })
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  const quick = editor(wrapper).get('.quick-up-button')
  expect(quick.attributes('aria-label')).toContain('测试绝密'); expect(button(editor(wrapper), '其他密探')).toBeTruthy()
  await quick.trigger('click'); await flushPromises()
  expect(composer(wrapper).find('.agent-picker').exists()).toBe(false); expect(editor(wrapper).get('.quick-up-button').attributes('aria-pressed')).toBe('true'); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); expect(document.activeElement).toBe(composer(wrapper).get('.pull-count-field input').element)
  await composer(wrapper).get('.pull-count-field input').setValue('12'); await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('12'); expect(feed(wrapper)[0].text()).toContain('待保存')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(confirmed(wrapper)).toBe(true)

  await button(editor(wrapper), '其他密探').trigger('click'); await flushPromises()
  const entry = () => composer(wrapper)
  expect(document.activeElement).toBe(entry().get('.agent-search input').element)
  await entry().get('.agent-search input').setValue('csqh')
  expect(entry().findAll('.agent-choice').map(item => item.attributes('data-agent-id'))).toEqual(['char-c'])
  await button(entry(), '取消').trigger('click'); await flushPromises()
  expect(editor(wrapper).get('.entry-placeholder input').element.disabled).toBe(true)

  await button(editor(wrapper), '其他密探').trigger('click'); await flushPromises()
  expect(entry().findAll('.agent-choice').map(item => item.attributes('data-agent-id'))).toEqual(['char-a', 'char-c', 'char-b', 'slot-up'])
  expect(document.activeElement).toBe(entry().get('.agent-search input').element); expect(entry().get('.pull-count-field input').element.disabled).toBe(true)

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
  expect(editor(wrapper).find('.selected-agent-summary').exists()).toBe(false); expect(editor(wrapper).get('.add-record').text()).toContain('测试歪卡'); expect(editor(wrapper).get('.add-record img').attributes('src')).toContain('/other.png'); expect(editor(wrapper).find('.add-record .quick-up-mark').exists()).toBe(false)
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
  expect(feed(wrapper)).toHaveLength(3); expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('40')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editor(wrapper).get('form').trigger('submit')
  expect(api.recruitmentCommand.mock.calls[0][0].data.entries[0].pull_span).toBe(40)
})
it('普通新增保存后留在本池，继续编辑原ID并改保底，重开回显且不重复新增', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await addRecord(wrapper, 'char-a', '17')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(editor(wrapper).get('.entry-placeholder input').element.disabled).toBe(true)
  expect(feed(wrapper)).toHaveLength(3)
  expect(feed(wrapper)[0].text()).toContain('本笔已保存')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await editRow(wrapper); await composer(wrapper).get('input').setValue('20')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  await editor(wrapper).get('.remaining-field input').setValue('19')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ expectedRevision: 4, data: { remaining_pulls: 19, entries: [expect.objectContaining({ event_id: 'A', pull_span: 20 })] } })
  await editor(wrapper).get('.close-button').trigger('click'); await selectPool(wrapper)
  expect(feed(wrapper).map(item => item.get('.pull-result b').text())).toEqual(['17', '31', '20'])
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('19')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(2)
  expect(records['acc-a']).toHaveLength(3)
})

it('移除只提交明确旧ID；取消单条编辑不改变记录，整个弹窗取消不写入', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper); await composer(wrapper).get('input').setValue('20'); await composer(wrapper).get('.entry-cancel').trigger('click'); expect(feed(wrapper).at(-1).get('.pull-result b').text()).toBe('17')
  expect(editor(wrapper).find('.record-feed .delete-record').exists()).toBe(false)
  await editRow(wrapper); await button(composer(wrapper), '删除记录').trigger('click')
  await button(editor(wrapper), '新增记录').trigger('click')
  await composer(wrapper).get('.agent-choice').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('12')
  await composer(wrapper).get('.entry-cancel').trigger('click')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data).toMatchObject({ entries: [], deleted_event_ids: ['A'] })
  await editor(wrapper).get('.close-button').trigger('click'); await selectPool(wrapper); expect(feed(wrapper)).toHaveLength(1)
  expect(records['acc-a'].map(row => row.event_id)).toEqual(['B'])
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})
it('409重读保留草稿，核对后追加真记录；网络重试保留请求ID与事件ID', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper)
  await composer(wrapper).get('input').setValue('19')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  archives['acc-a'].archive_revision = 4
  api.recruitmentCommand.mockRejectedValueOnce(Object.assign(new Error('revision changed'), { status: 409 }))
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(feed(wrapper).at(-1).get('.pull-result b').text()).toBe('19')
  expect(editor(wrapper).text()).toContain('草稿已保留')
  const first = api.recruitmentCommand.mock.calls.at(-1)[0].requestId
  api.recruitmentCommand.mockRejectedValueOnce(new Error('network'))
  await addRecord(wrapper)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  const retry = structuredClone(api.recruitmentCommand.mock.calls.at(-1)[0])
  expect(retry.requestId).not.toBe(first)
  expect(retry.expectedRevision).toBe(4)
  expect(retry.data.entries).toHaveLength(2)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(3)
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toEqual(retry)
  expect(records['acc-a']).toHaveLength(3)
  expect(records['acc-a'].find(event => event.event_id === 'A').pull_span).toBe(19)
})

it('心愿草稿按账号隔离，A迟到保存不会覆盖B的心愿或显示成功', async () => {
  records['acc-a'] = []; records['acc-b'] = []
  archives['acc-b'].pools[0].wish_agent_ids = ['a', 'c']
  api.getRecruitmentCatalog.mockResolvedValue({ pools: recruitmentCatalog().pools.map(pool => ({ ...pool, allow_custom_up: true })) })
  getOperatorCatalog.mockResolvedValue({ operators: ['a', 'b', 'c'].map(id => ({ id, name: id, rarity: 5, games: ['代号鸢'] })) })
  const saving = deferred()
  api.recruitmentCommand.mockReturnValueOnce(saving.promise)
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await editor(wrapper).findAll('.is-wish-slot')[0].get('.quick-up-button').trigger('click')
  await editor(wrapper).get('.agent-choice[data-agent-id="a"]').trigger('click')
  await editor(wrapper).findAll('.is-wish-slot')[1].get('.quick-up-button').trigger('click')
  await editor(wrapper).get('.agent-choice[data-agent-id="b"]').trigger('click')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'acc-a', data: expect.objectContaining({ wish_agent_ids: ['a', 'b'] }) }))
  activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper)
  expect(editor(wrapper).findAll('.is-wish-slot .quick-up-button').map(button => button.attributes('data-agent-id'))).toEqual(['a', 'c'])
  saving.resolve({ archive_revision: 4 }); await flushPromises()
  expect(editor(wrapper).findAll('.is-wish-slot .quick-up-button').map(button => button.attributes('data-agent-id'))).toEqual(['a', 'c'])
  expect(editor(wrapper).text()).not.toContain('已保存并核对')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('A迟到读写不覆盖B记录或关闭B新弹窗，切账号清旧草稿', async () => {
  const read = deferred(); api.listRecruitmentEvents.mockImplementation(({ accountId }) => accountId === 'acc-a' ? read.promise : Promise.resolve({ items: [], next_cursor: null, archive_revision: 3 }))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper); read.resolve({ items: records['acc-a'], next_cursor: null, archive_revision: 3 }); await flushPromises(); expect(feed(wrapper)).toHaveLength(0)
  api.listRecruitmentEvents.mockImplementation(({ accountId }) => Promise.resolve({ items: records[accountId], next_cursor: null, archive_revision: archives[accountId].archive_revision })); activeAccount.set('acc-a'); await flushPromises(); await selectPool(wrapper)
  const write = deferred(); api.recruitmentCommand.mockReturnValue(write.promise); await addRecord(wrapper)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises();
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  expect(api.recruitmentCommand.mock.calls[0][0].accountId).toBe('acc-a'); activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper); write.resolve({ archive_revision: 4 }); await flushPromises()
  expect(new DOMWrapper(document.body).find('.pool-editor[role=dialog]').exists()).toBe(true); expect(wrapper.text()).not.toContain('已保存'); expect(wrapper.get('.summary strong').text()).toBe('999'); expect(feed(wrapper)).toHaveLength(0)
})
it('记录读取失败禁止保存可重试；分页不丢草稿且不混合不同版本', async () => {
  api.listRecruitmentEvents.mockRejectedValueOnce(new Error('records unavailable')); const wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); await button(editor(wrapper), '重新读取').trigger('click'); await flushPromises(); expect(feed(wrapper)).toHaveLength(2)
  await button(editor(wrapper), '取消').trigger('click'); api.listRecruitmentEvents.mockResolvedValueOnce({ items: records['acc-a'], next_cursor: 'next', archive_revision: 3 }); await selectPool(wrapper); await button(editor(wrapper), '新增记录').trigger('click'); await composer(wrapper).get('.agent-choice').trigger('click'); await composer(wrapper).get('.pull-count-field input').setValue('12')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [{ ...recruitmentEvent('C', 7), agent_snapshot: { agent_id: 'char-a', name: '测试绝密' } }], next_cursor: 'last', archive_revision: 3 }); await button(editor(wrapper), '继续加载记录').trigger('click'); await flushPromises(); expect(feed(wrapper)).toHaveLength(3); expect(composer(wrapper).get('.pull-count-field input').element.value).toBe('12'); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].cursor).toBe('next')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [], next_cursor: null, archive_revision: 4 }); await button(editor(wrapper), '继续加载记录').trigger('click'); await flushPromises(); expect(editor(wrapper).text()).toContain('档案已变化'); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined()
})
it('目录失败可编辑旧抽数和保底，禁止新出货；只选本游戏绝密，UP固定身份回显新图鉴', async () => {
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char-a', name: '正式密探', avatar: '/formal.png', rarity: 5, games: ['代号鸢'] }, { id: 'other', name: '另一游戏', rarity: 5, games: ['如鸢'] }, { id: 'r4', name: '机密', rarity: 4, games: ['代号鸢'] }] })
  const catalog = recruitmentCatalog(); catalog.pools[0].up_agents = [{ id: 'slot', name: '占位', operator_id: 'char-a', active: true }]; api.getRecruitmentCatalog.mockResolvedValue(catalog); records['acc-a'][0].agent_snapshot = { agent_id: 'slot', name: '旧名字' }
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper); expect(composer(wrapper).find('select').exists()).toBe(false); expect(editor(wrapper).get('.quick-up-button').attributes('aria-pressed')).toBe('true'); expect(editor(wrapper).get('.quick-up-button').attributes('aria-label')).toContain('正式密探'); expect(editor(wrapper).get('img').attributes('src')).toContain('/formal.png')
  await editor(wrapper).get('footer button').trigger('click'); api.getRecruitmentCatalog.mockRejectedValue(new Error('catalog unavailable')); await button(wrapper, '刷新档案').trigger('click'); await flushPromises(); await selectPool(wrapper)
  expect(editor(wrapper).get('.add-record').attributes('disabled')).toBeDefined(); await editRow(wrapper); expect(composer(wrapper).find('select').exists()).toBe(false); expect(editor(wrapper).get('.add-record').attributes('disabled')).toBeUndefined(); await composer(wrapper).get('input').setValue('20'); await button(composer(wrapper), '完成').trigger('click'); await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data.entries[0]).toMatchObject({ event_id: 'A', pull_span: 20 })
})
it('游戏错配只读；身份失效清弹窗，功能开关关闭时不读写', async () => {
  archives['acc-a'].game_mismatch = true; const wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); auth.accessToken = ''; auth.userInfo = null; await flushPromises(); expect(new DOMWrapper(document.body).find('.pool-editor[role=dialog]').exists()).toBe(false); expect(wrapper.find('.summary').exists()).toBe(false); expect(api.recruitmentCommand).not.toHaveBeenCalled(); wrapper.unmount()
  vi.clearAllMocks(); isFeatureEnabled.mockReturnValue(false); const closed = render(); await flushPromises(); expect(closed.text()).toContain('暂未开放'); expect(listAccounts).not.toHaveBeenCalled(); closed.unmount()
})
it('空目录仍可导入并聚焦导入按钮，SSE/游戏/账号删除和卸载继续保持隔离', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await addRecord(wrapper); archives['acc-a'].archive_revision++; subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'recruitment_changed', data: { account_id: 'acc-a' } }); await flushPromises(); expect(editor(wrapper).text()).toContain('待保存')
  listAccounts.mockResolvedValue([{ id: 'acc-a', name: '账号', game: '如鸢' }]); subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_stream_open', data: { account_id: 'acc-a' } }); await flushPromises(); expect(new DOMWrapper(document.body).find('.pool-editor[role=dialog]').exists()).toBe(false); expect(api.getRecruitmentCatalog.mock.calls.at(-1)[0]).toBe('如鸢')
  listAccounts.mockResolvedValue([{ id: 'acc-b', name: '小号', game: '代号鸢' }]); subscribeAccountEvents.mock.calls.at(-1)[0]({ event: 'account_deleted', data: { account_id: 'acc-a' } }); await flushPromises(); expect(activeAccount.id).toBe('acc-b'); const dispose = subscribeAccountEvents.mock.results.at(-1).value; wrapper.unmount(); expect(dispose).toHaveBeenCalledOnce()
  archives['acc-b'].pools = []; api.getRecruitmentCatalog.mockResolvedValue({ pools: [] }); const empty = render({ RecruitmentExchange: false }); await flushPromises(); expect(empty.text()).toContain('当前游戏暂无可用卡池'); await button(empty, '导入备份').trigger('click'); await flushPromises(); expect(document.activeElement).toBe(button(empty, '导入 JSON').element)
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
  archives['acc-a'].summary.most_permanent_gold_agents = [{ agent_id: 'char-a', name: 'A账号常驻绝密', count: 2 }]
  archives['acc-b'].summary.most_permanent_gold_agents = []
  const directory = recruitmentCatalog()
  directory.pools[0].up_agents = [{ id: 'slot-a', operator_id: 'char-a', name: '测试绝密' }]
  api.getRecruitmentCatalog.mockResolvedValue(directory)
  archives['acc-a'].pool_summaries = { 'pool-a': { known_total_pulls: 65, event_count: 2, up_agent_counts: { 'slot-a': 2 }, average_gold_pulls: 24, small_pity_win_rate: 66.7 } }
  archives['acc-b'].pool_summaries = { 'pool-a': { known_total_pulls: 9, event_count: 0, up_agent_counts: { 'slot-a': 0 } } }
  archives['acc-b'].pools[0].progress = 9
  archives['acc-b'].current_pool_id = 'missing-pool'
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×2')
  expect(wrapper.get('.pool-card').findAll('.pool-metrics b').map(item => item.text())).toEqual(['65', '2', '40', '24', '66.7%'])
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  const late = deferred(), pendingB = deferred()
  api.getRecruitmentArchive.mockReturnValueOnce(late.promise).mockReturnValueOnce(pendingB.promise)
  await button(wrapper, '刷新档案').trigger('click'); await flushPromises()
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.find('.up-count').exists()).toBe(false)
  expect(wrapper.find('.summary-most-permanent').exists()).toBe(false)
  pendingB.resolve(structuredClone(archives['acc-b'])); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×0')
  late.resolve(structuredClone(archives['acc-a'])); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×0')
  expect(wrapper.get('.summary-most-permanent .summary-empty').text()).toBe('暂无记录')
  expect(wrapper.get('.pool-card').findAll('.pool-metrics b').map(item => item.text())).toEqual(['9', '0', '31', '—', '—'])
  expect(wrapper.text()).not.toContain('当前卡池')
  expect(wrapper.find('.current-badge, .is-current').exists()).toBe(false)
  await button(wrapper, '刷新档案').trigger('click'); await flushPromises()
  expect(wrapper.get('.pool-card').findAll('.pool-metrics b').map(item => item.text())).toEqual(['9', '0', '31', '—', '—'])
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  api.recruitmentCommand.mockImplementation(async () => {
    archives['acc-b'].pool_summaries['pool-a'].up_agent_counts['slot-a'] = 1
    archives['acc-b'].archive_revision++
    return { archive_revision: archives['acc-b'].archive_revision }
  })
  await selectPool(wrapper); await addRecord(wrapper, 'slot-a', '17')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.up-count').text()).toBe('×1')
  expect(api.listRecruitmentEvents).toHaveBeenCalledTimes(2)
  expect(api.listRecruitmentEvents.mock.calls[0][0].accountId).toBe('acc-b')
  wrapper.unmount()
})

it.each(['pool-a', 'missing-pool'])('旧指针 %s 不影响已结束池B的读取与保存，池A保持不变', async pointer => {
  tutorialFeature.enabled = false
  const directory = recruitmentCatalog()
  directory.pools.push({ ...directory.pools[0], pool_id: 'catalog-b', name: '已结束池B', start_date: '2020-01-01', end_date: '2020-12-31' })
  api.getRecruitmentCatalog.mockResolvedValue(directory)
  archives['acc-a'].current_pool_id = pointer
  archives['acc-a'].pools.push({ pool_id: 'pool-b', snapshot: { name: '已结束池B', game: '代号鸢', catalog_pool_id: 'catalog-b' }, progress: 12 })
  archives['acc-a'].pool_summaries = { 'pool-a': { known_total_pulls: 48, event_count: 2 }, 'pool-b': { known_total_pulls: 33, event_count: 1 } }
  records['acc-a'].push({ ...recruitmentEvent('ended', 21, 'pool-b'), agent_snapshot: { agent_id: 'char-a', name: '测试绝密' } })
  api.listRecruitmentEvents.mockImplementation(({ accountId, poolId }) => Promise.resolve({ items: structuredClone(records[accountId].filter(event => event.pool_id === poolId)), next_cursor: null, archive_revision: archives[accountId].archive_revision }))
  const originalPoolA = structuredClone(archives['acc-a'].pools[0]), originalRecordsA = structuredClone(records['acc-a'].filter(event => event.pool_id === 'pool-a'))
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).not.toContain('当前卡池')
  expect(wrapper.find('.current-badge, .is-current').exists()).toBe(false)
  const card = wrapper.findAll('.pool-card').find(item => item.get('.pool-name').text() === '已结束池B')
  expect(card.get('.pool-status').text()).toBe('已结束')
  expect(card.findAll('.pool-metrics b').map(item => item.text())).toEqual(['33', '1', '28', '—', '—'])
  await card.get('.entry-label').trigger('click'); await flushPromises()
  expect(editor(wrapper).get('h2').text()).toBe('已结束池B')
  expect(feed(wrapper)).toHaveLength(1)
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('28')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await addRecord(wrapper, 'char-a', '17')
  await editor(wrapper).get('.remaining-field input').setValue('33')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  expect(api.recruitmentCommand.mock.calls[0][0]).toMatchObject({ accountId: 'acc-a', operation: 'pool_records_save', data: { pool_id: 'pool-b', remaining_pulls: 33 } })
  expect(api.listRecruitmentEvents.mock.calls.every(([query]) => query.accountId === 'acc-a' && query.poolId === 'pool-b')).toBe(true)
  expect(archives['acc-a'].current_pool_id).toBe(pointer)
  expect(archives['acc-a'].pools[0]).toEqual(originalPoolA)
  expect(records['acc-a'].filter(event => event.pool_id === 'pool-a')).toEqual(originalRecordsA)
  expect(records['acc-a'].filter(event => event.pool_id === 'pool-b')).toHaveLength(2)
  expect(card.findAll('.pool-metrics b').map(item => item.text())).toEqual(['45', '2', '33', '—', '—'])
  await editor(wrapper).get('.close-button').trigger('click'); await flushPromises()
  expect(document.activeElement).toBe(card.get('.entry-label').element)
  await card.get('.entry-label').trigger('click'); await flushPromises()
  expect(editor(wrapper).get('h2').text()).toBe('已结束池B')
  expect(feed(wrapper)).toHaveLength(2)
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('33')
  wrapper.unmount()
})

it('普通新账号不看教程，按玩家问题选非UP，未知间隔真实保存并回读；重复点不重复计数', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const catalog = recruitmentCatalog()
  catalog.pools[0] = { ...catalog.pools[0], up_status: 'verified', up_agent_ids: ['slot-up'], up_agents: [{ id: 'slot-up', operator_id: 'char-a', name: '测试绝密', active: true }] }
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char-a', name: '测试绝密', rarity: 5, games: ['代号鸢'] }, { id: 'char-b', name: '非UP密探', rarity: 5, games: ['代号鸢'] }] })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.entry-label').text()).toBe('记一笔')
  await selectPool(wrapper)
  expect(editor(wrapper).find('.daily-entry').exists()).toBe(false)
  expect(editor(wrapper).get('.progress-card').isVisible()).toBe(true)
  expect(editor(wrapper).get('.entry-shortcuts').isVisible()).toBe(true)
  await button(editor(wrapper), '其他密探').trigger('click')
  await composer(wrapper).get('.agent-search input').setValue('非UP')
  await composer(wrapper).get('.agent-choice').trigger('click')
  await editor(wrapper).get('.remaining-field input').setValue('33')
  expect(composer(wrapper).get('.pull-count-field input').element.value).toBe('')
  await button(composer(wrapper), '加入').trigger('click')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  const request = api.recruitmentCommand.mock.calls[0][0]
  expect(request.data.entries).toEqual([expect.objectContaining({ agent_id: 'char-b', pull_span: null, up_status: 'non_up' })])
  expect(confirmed(wrapper)).toBe(true)
  expect(editor(wrapper).find('.save-result').exists()).toBe(false)
  expect(editor(wrapper).text()).not.toContain('服务端已读回核对')
  expect(editor(wrapper).get('.gacha-record').text()).toContain('本笔已保存')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(editor(wrapper).get('.agent-pull-badge').text()).toBe('未知')
  expect(editor(wrapper).get('.agent-record-card').text()).toContain('本笔已保存')
  expect(archives['acc-a'].pool_summaries['pool-a']).toMatchObject({ known_total_pulls: 7, event_count: 1, up_agent_counts: {} })
  expect(confirmed(wrapper)).toBe(true)
})

it('普通未出绝密仅保存游戏距保底，读回数字突出且不生成事件', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(editor(wrapper).get('.entry-shortcuts').isVisible()).toBe(true)
  expect(editor(wrapper).get('.entry-placeholder input').element.disabled).toBe(true)
  await editor(wrapper).get('.remaining-field input').setValue('31')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[0][0].data).toEqual({ pool_id: 'pool-a', entries: [], deleted_event_ids: [], remaining_pulls: 31 })
  expect(records['acc-a']).toEqual([])
  expect(confirmed(wrapper)).toBe(true)
  expect(editor(wrapper).get('.progress-number strong').text()).toBe('31')
  expect(editor(wrapper).get('.progress-card').classes()).toContain('is-saved')
  await editor(wrapper).get('.remaining-field input').setValue('29')
  expect(editor(wrapper).get('.progress-card').classes()).not.toContain('is-saved')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('普通请求成功但回读不一致时禁重复保存，重新核对后才高亮；不会显示泛泛成功', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [], archive_revision: 4, next_cursor: null })
  await button(composer(wrapper), '加入').trigger('click')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(editor(wrapper).get('.save-result').text()).toContain('结果尚未确认')
  expect(editor(wrapper).find('.saved-mark').exists()).toBe(false)
  expect(wrapper.get('.feedback').text()).not.toContain('已保存')
  expect(editor(wrapper).get('.quick-up-button').attributes('disabled')).toBeDefined()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises()
  expect(confirmed(wrapper)).toBe(true)
  expect(editor(wrapper).findAll('.saved-mark')).toHaveLength(1)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('已有记录可按密探名查找；两种视图筛选同一记录，清除筛选不重复计数', async () => {
  records['acc-a'][1].agent_snapshot = { agent_id: 'char-b', name: '另一位密探' }
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await editor(wrapper).get('.record-search input').setValue('另一位')
  expect(feed(wrapper)).toHaveLength(1)
  expect(feed(wrapper)[0].get('.record-detail').attributes('aria-label')).toContain('另一位密探')
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(editor(wrapper).findAll('.agent-record-card')).toHaveLength(1)
  await editor(wrapper).get('.record-search input').setValue('不存在')
  expect(editor(wrapper).text()).toContain('没有找到这位密探的记录')
  await editor(wrapper).get('.record-search input').setValue('')
  expect(editor(wrapper).findAll('.agent-record-card')).toHaveLength(2)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('普通新增网络失败保留稳定ID和草稿，同内容重试沿用请求ID，读回后再继续', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  api.recruitmentCommand.mockRejectedValueOnce(new Error('网络中断，保存未确认'))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('20')
  await button(composer(wrapper), '加入').trigger('click')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  const first = structuredClone(api.recruitmentCommand.mock.calls[0][0])
  expect(editor(wrapper).text()).toContain('网络中断')
  expect(editor(wrapper).find('.save-result').exists()).toBe(false)
  expect(editor(wrapper).findAll('.pending-mark')).toHaveLength(1)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[1][0]).toEqual(first)
  expect(records['acc-a']).toHaveLength(1)
  expect(confirmed(wrapper)).toBe(true)
})

it('删除保存必须读取剩余分页，第一页缺少ID不提前确认；读完才显示真实删除', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper)
  await button(composer(wrapper), '删除记录').trigger('click')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [], next_cursor: 'deletion-check', archive_revision: 4 })
  const second = deferred(); api.listRecruitmentEvents.mockReturnValueOnce(second.promise)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(editor(wrapper).get('.save-result').text()).toContain('结果尚未确认')
  expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].cursor).toBe('deletion-check')
  second.resolve({ items: structuredClone(records['acc-a']), next_cursor: null, archive_revision: 4 }); await flushPromises()
  expect(confirmed(wrapper)).toBe(true)
  expect(records['acc-a'].map(event => event.event_id)).toEqual(['B'])
  expect(feed(wrapper)).toHaveLength(1)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})


it('隐藏目录刷新后历史入口保留，切换无历史账号不留下旧卡片', async () => {
  archives['acc-a'].pool_states = { 'pool-a': 'hidden' }
  api.getRecruitmentCatalog.mockResolvedValue({ pools: [], catalog_revision: 'hidden' })
  archives['acc-b'].pools = []; archives['acc-b'].pool_states = {}
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.pool-status').text()).toContain('已隐藏')
  await selectPool(wrapper)
  expect(editor(wrapper).text()).toContain('此卡池已隐藏')
  expect(editor(wrapper).get('.add-record').element.disabled).toBe(true)
  await editor(wrapper).get('.close-button').trigger('click'); await flushPromises()
  activeAccount.set('acc-b'); await flushPromises()
  expect(wrapper.findAll('.pool-card')).toHaveLength(0)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})


it('历史插入读取完整105条分页，原子提交后按完整顺序回读并在重开及两视图持续', async () => {
  records['acc-a'] = Array.from({ length: 105 }, (_, index) => ({ ...recruitmentEvent('e' + index, index === 50 ? null : 1), sort_order: index + 1, agent_snapshot: { agent_id: 'char-a', name: '测试绝密', rarity: 5 } }))
  api.listRecruitmentEvents.mockImplementation(({ accountId, cursor, order, limit }) => {
    expect(order).toBe('asc'); expect(limit).toBe(100)
    const start = cursor ? Number(cursor) : 0
    return Promise.resolve({ items: structuredClone(records[accountId].slice(start, start + 100)), next_cursor: records[accountId].length > start + 100 ? String(start + 100) : null, archive_revision: archives[accountId].archive_revision })
  })
  api.recruitmentCommand.mockImplementation(async ({ accountId, data, operation }) => {
    expect(operation).toBe('pool_records_save')
    expect(data.ordered_event_ids).toHaveLength(106)
    const entry = data.entries[0]
    const all = [...records[accountId], { ...recruitmentEvent(entry.event_id, entry.pull_span), ...entry, agent_snapshot: { agent_id: entry.agent_id, name: '测试绝密', rarity: 5 } }]
    records[accountId] = data.ordered_event_ids.map((id, index) => ({ ...all.find(event => event.event_id === id), sort_order: index + 1 }))
    archives[accountId].archive_revision++
    return { archive_revision: archives[accountId].archive_revision }
  })
  const w = render(); await flushPromises(); await selectPool(w)
  await editor(w).get('.add-record').trigger('click'); await composer(w).get('.agent-choice').trigger('click')
  await composer(w).get('.composer-actions .primary').trigger('click')
  await button(editor(w), '读取全部后排序').trigger('click'); await flushPromises()
  expect(editor(w).findAll('.record-detail')).toHaveLength(106)
  const added = editor(w).get('.record-handle')
  for (let i = 0; i < 55; i++) await added.trigger('keydown', { key: 'ArrowDown' })
  await editor(w).get('form').trigger('submit'); await flushPromises()
  expect(confirmed(w)).toBe(true)
  const ids = api.recruitmentCommand.mock.calls[0][0].data.ordered_event_ids
  expect(ids[51]).toBe('e50'); expect(records['acc-a'][51].pull_span).toBeNull()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await button(editor(w), '密探视图').trigger('click')
  expect(editor(w).findAll('.agent-record-detail')).toHaveLength(106)
  await editor(w).get('.close-button').trigger('click'); await selectPool(w)
  await button(editor(w), '继续加载记录').trigger('click'); await flushPromises()
  expect(editor(w).findAll('.agent-record-detail')).toHaveLength(106)
  await button(editor(w), '进度条视图').trigger('click')
  expect(editor(w).findAll('.record-detail')).toHaveLength(106)
  expect(records['acc-a'].map(event => event.event_id)).toEqual(ids)
  w.unmount()
})
it('全量排序分页失败保留单条输入，重试读完并加入后才允许排序；跨账号不接受旧分页', async () => {
  const next = deferred()
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: records['acc-a'], next_cursor: 'next', archive_revision: 3 }).mockReturnValueOnce(next.promise)
  const w = render(); await flushPromises(); await selectPool(w)
  await editor(w).get('.add-record').trigger('click'); await composer(w).get('.agent-choice').trigger('click')
  await composer(w).get('.pull-count-field input').setValue('12')
  await button(editor(w), '读取全部后排序').trigger('click')
  expect(editor(w).get('.record-handle').attributes('data-sort-disabled')).toBe('true')
  next.reject(new Error('synthetic offline')); await flushPromises()
  expect(composer(w).get('.pull-count-field input').element.value).toBe('12')
  expect(editor(w).text()).toContain('synthetic offline')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [{ ...recruitmentEvent('C', null), agent_snapshot: { agent_id: 'char-a', name: '测试绝密' } }], next_cursor: null, archive_revision: 3 })
  await button(editor(w), '重试读取全部记录').trigger('click'); await flushPromises()
  expect(composer(w).get('.pull-count-field input').element.value).toBe('12')
  await composer(w).get('.composer-actions .primary').trigger('click')
  expect(editor(w).get('.record-handle').attributes('data-sort-disabled')).toBe('false')
  const late = deferred()
  api.listRecruitmentEvents.mockReturnValueOnce(late.promise)
  w.findComponent({ name: 'PoolEditor' }).vm.$emit('retry'); await flushPromises()
  // Switching context externally still fences late responses; account-bar discard prompts are covered separately.
  activeAccount.set('acc-b'); await flushPromises(); await selectPool(w)
  late.resolve({ items: records['acc-a'], next_cursor: null, archive_revision: 3 }); await flushPromises()
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  expect(editor(w).findAll('.record-detail')).toHaveLength(0)
  w.unmount()
})
it('排序分页重复ID明确失败，不将当前可见集合发送重排', async () => {
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: records['acc-a'], next_cursor: 'next', archive_revision: 3 }).mockResolvedValueOnce({ items: records['acc-a'], next_cursor: null, archive_revision: 3 })
  const w = render(); await flushPromises(); await selectPool(w)
  await button(editor(w), '读取全部后排序').trigger('click'); await flushPromises()
  expect(editor(w).text()).toContain('记录分页不完整')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  expect(editor(w).findAll('.record-detail')).toHaveLength(2)
  w.unmount()
})

it('A账号全量分页迟到不阻塞B账号独立加载全部记录', async () => {
  const late = deferred()
  records['acc-b'] = Array.from({length:105}, (_, i) => ({ ...recruitmentEvent('b' + i, null), agent_snapshot:{agent_id:'char-a',name:'测试绝密'} }))
  api.listRecruitmentEvents.mockImplementation(({accountId,cursor}) => {
    if (accountId === 'acc-a' && cursor) return late.promise
    const start = cursor ? 100 : 0
    return Promise.resolve({ items:structuredClone(records[accountId].slice(start,start+100)), next_cursor:!cursor ? 'more' : null, archive_revision:3 })
  })
  const w=render(); await flushPromises(); await selectPool(w)
  await button(editor(w), '读取全部后排序').trigger('click')
  activeAccount.set('acc-b'); await flushPromises(); await selectPool(w)
  await button(editor(w), '读取全部后排序').trigger('click'); await flushPromises()
  expect(editor(w).findAll('.record-detail')).toHaveLength(105)
  expect(editor(w).get('.record-handle').attributes('data-sort-disabled')).toBe('false')
  late.resolve({items:[recruitmentEvent('foreign',7)], next_cursor:null, archive_revision:3}); await flushPromises()
  expect(editor(w).findAll('.record-detail')).toHaveLength(105)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  w.unmount()
})


it('主页面明细可见时读取已保存记录，草稿不泄露，保存后摘要和明细同步且不影响截图', async () => {
  tutorialFeature.enabled = false
  vi.stubGlobal('IntersectionObserver', class { constructor(callback) { this.callback = callback } observe() { this.callback([{ isIntersecting: true }]) } disconnect() {} })
  records['acc-a'].forEach(event => { event.agent_snapshot.rarity = 5 })
  archives['acc-a'].pool_summaries = { 'pool-a': { known_total_pulls: 48, event_count: 2, four_star_count: 0, average_gold_pulls: 24, small_pity_win_rate: 50 } }
  persistSubmittedRecord({ average_gold_pulls: 20, small_pity_win_rate: 66.7 })
  const wrapper = render(); await flushPromises()
  expect(wrapper.findAll('.preview-record')).toHaveLength(0)
  expect(api.listRecruitmentEvents).not.toHaveBeenCalled()
  expect(wrapper.get('.average-metric').text()).toContain('24')
  await wrapper.get('.preview-toggle').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.preview-record')).toHaveLength(2)
  expect(wrapper.get('.average-metric').text()).toContain('24')
  expect(wrapper.get('.small-pity-metric b').text()).toBe('50%')
  await selectPool(wrapper)
  await addRecord(wrapper, 'char-a', '12')
  expect(wrapper.findAll('.preview-record')).toHaveLength(2)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(confirmed(wrapper)).toBe(true)
  expect(wrapper.findAll('.preview-record')).toHaveLength(3)
  expect(wrapper.get('.pool-metrics').text()).toContain('60')
  expect(wrapper.get('.average-metric').text()).toContain('20')
  expect(wrapper.get('.small-pity-metric b').text()).toBe('66.7%')
  const previewIds = wrapper.findAll('.preview-record').map(item => item.attributes('data-event-id'))
  await editor(wrapper).get('.screenshot-entry').trigger('click'); await flushPromises()
  expect(editor(wrapper).classes()).toContain('is-screenshot')
  expect(wrapper.findAll('.preview-record').map(item => item.attributes('data-event-id'))).toEqual(previewIds)
  await editor(wrapper).get('.screenshot-exit').trigger('click')
  await editor(wrapper).get('.close-button').trigger('click'); await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('.entry-label').element)
})
