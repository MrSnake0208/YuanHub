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

const guideKey = account => `yuanhub:recruitment-first-record:user-a:${account}`
const preference = (account = 'acc-a') => JSON.parse(localStorage.getItem(guideKey(account)) || 'null')
function firstRecordAccount() {
  records['acc-a'] = []
  archives['acc-a'].summary.event_count = 0
  const catalog = recruitmentCatalog()
  catalog.pools[0].up_agents = [{ id: 'slot-up', operator_id: 'char-a', name: '测试绝密', active: true }]
  api.getRecruitmentCatalog.mockResolvedValue(catalog)
}

it('页面主动打开四主题，回访用户亲自选池再学维护，不创建或误判完成', async () => {
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.recruitment-tutorial-entry').text()).toBe('使用教程')
  await wrapper.get('.recruitment-tutorial-entry').trigger('click'); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(false)
  expect(wrapper.findAll('[data-guide-topic]')).toHaveLength(4)
  await wrapper.get('[data-guide-topic="maintain"]').trigger('click')
  expect(wrapper.get('.page-guide').text()).toContain('起止日期')
  await selectPool(wrapper)
  expect(editor(wrapper).text()).toContain('点下方需要修改的真实记录')
  expect(editor(wrapper).find('.editor-header .guide-entry').exists()).toBe(false)
  expect(preference().tutorialCompleted).toBe(false)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await button(editor(wrapper), '关闭教程').trigger('click')
  expect(editor(wrapper).get('.editor-header .guide-entry').text()).toBe('本池帮助')
})
async function startEditorGuide(wrapper, topic = 'record') {
  await (button(editor(wrapper), '本池帮助') || button(editor(wrapper), '选择其他主题')).trigger('click')
  await editor(wrapper).get(`[data-guide-topic="${topic}"]`).trigger('click')
  await flushPromises()
}
async function beginGuide(wrapper, topic = 'record') {
  await button(editor(wrapper), '选择教程主题').trigger('click')
  await editor(wrapper).get(`[data-guide-topic="${topic}"]`).trigger('click')
  await flushPromises()
}
async function saveGuidedRecord(wrapper) {
  const calls = api.recruitmentCommand.mock.calls.length
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(calls + 1)
  await flushPromises()
}
function persistSubmittedRecord() {
  api.recruitmentCommand.mockImplementation(async ({ accountId, data }) => {
    for (const entry of data.entries) {
      const event = { ...recruitmentEvent(entry.event_id, entry.pull_span, data.pool_id), up_status: entry.up_status, acquired_date: entry.acquired_date, note: entry.note, agent_snapshot: { agent_id: entry.agent_id, name: '测试绝密' } }
      const index = records[accountId].findIndex(item => item.event_id === entry.event_id)
      if (index < 0) records[accountId].push(event)
      else records[accountId][index] = event
    }
    records[accountId] = records[accountId].filter(event => !data.deleted_event_ids.includes(event.event_id))
    archives[accountId].pools.find(pool => pool.pool_id === data.pool_id).progress = 40 - data.remaining_pulls
    archives[accountId].summary.event_count = records[accountId].length
    const poolEvents = records[accountId].filter(event => event.pool_id === data.pool_id)
    const poolSummary = { known_total_pulls: poolEvents.filter(event => !event.batch_id).reduce((sum, event) => sum + (event.pull_span ?? 0), 0) + 40 - data.remaining_pulls, event_count: poolEvents.length, up_agent_counts: {} }
    for (const event of poolEvents) if (event.up_status === 'up') poolSummary.up_agent_counts[event.agent_snapshot.agent_id] = (poolSummary.up_agent_counts[event.agent_snapshot.agent_id] || 0) + 1
    archives[accountId].pool_summaries = { ...archives[accountId].pool_summaries, [data.pool_id]: poolSummary }
    archives[accountId].archive_revision++
    return { archive_revision: archives[accountId].archive_revision }
  })
}

it('首次教程自愿进入，真实选择UP、留空抽数、保存API成功并读回同一ID才完成，两种视图可见', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(editor(wrapper).text()).toContain('第一次使用？可按你现在的情况选择教程')
  expect(button(editor(wrapper), '直接使用 / 暂时关闭')).toBeDefined()
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await beginGuide(wrapper)
  expect(preference()).toMatchObject({ tutorialStarted: true, tutorialCompleted: false, dismissedForNow: null, disableAutoGuide: false })
  await editor(wrapper).get('.quick-up-button').trigger('click')
  expect(editor(wrapper).get('.pull-count-field input').element.value).toBe('')
  expect(preference().tutorialCompleted).toBe(false)
  const readback = deferred()
  api.listRecruitmentEvents.mockReturnValueOnce(readback.promise)
  await saveGuidedRecord(wrapper)
  const request = api.recruitmentCommand.mock.calls[0][0]
  expect(request.data.entries[0]).toMatchObject({ agent_id: 'slot-up', pull_span: null })
  expect(preference().tutorialCompleted).toBe(false)
  expect(button(editor(wrapper), '关闭教程').attributes('disabled')).toBeUndefined()
  readback.resolve({ items: structuredClone(records['acc-a']), archive_revision: 4, next_cursor: null }); await flushPromises()
  expect(editor(wrapper).text()).toContain('这条出货记录已保存并读回确认。')
  expect(preference().tutorialCompleted).toBe(true)
  expect(editor(wrapper).findAll('.gacha-record')).toHaveLength(1)
  expect(editor(wrapper).find('.pending-mark').exists()).toBe(false)
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(editor(wrapper).get('.agent-pull-badge').text()).toBe('未知')
})

it('其他密探通过真实搜索选择；保存失败保留草稿和阶段，重试成功再完成', async () => {
  firstRecordAccount()
  api.recruitmentCommand.mockRejectedValueOnce(new Error('保存失败'))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await button(editor(wrapper), '其他密探').trigger('click')
  await composer(wrapper).get('.agent-search input').setValue('测试绝密')
  await composer(wrapper).get('.agent-choice').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('20')
  await saveGuidedRecord(wrapper)
  expect(editor(wrapper).text()).toContain('保存未成功或回读尚未确认，真实草稿已保留')
  expect(editor(wrapper).get('.pull-result b').text()).toBe('20')
  expect(preference().tutorialCompleted).toBe(false)
  expect(editor(wrapper).find('.guide-exit').exists()).toBe(true)
  persistSubmittedRecord()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(editor(wrapper).text()).toContain('这条出货记录已保存并读回确认。')
})

it('仅加入草稿、只保存保底、API成功但未读到同一真实记录，均不完成教程', async () => {
  firstRecordAccount()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(preference().tutorialCompleted).toBe(false)
  await selectPool(wrapper)
  await startEditorGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('12')
  await saveGuidedRecord(wrapper)
  expect(preference().tutorialCompleted).toBe(false)
  expect(editor(wrapper).text()).toContain('结果尚未确认时不必重复登记')
  expect(editor(wrapper).text()).not.toContain('这条出货记录已保存并读回确认。')
})

it('Esc只退出教学，正在填写的密探与抽数、编辑器和焦点均保留，不写业务或完成状态', async () => {
  firstRecordAccount()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  const input = composer(wrapper).get('.pull-count-field input')
  await input.setValue('20'); composer(wrapper).get('.pull-count-field input').element.focus()
  expect(document.activeElement).toBe(composer(wrapper).get('.pull-count-field input').element)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(editor(wrapper).find('.guide-exit').exists()).toBe(false)
  expect(composer(wrapper).get('.selected-agent-summary').text()).toContain('测试绝密')
  expect(composer(wrapper).get('.pull-count-field input').element.value).toBe('20')
  expect(document.activeElement).toBe(composer(wrapper).get('.pull-count-field input').element)
  expect(preference()).toMatchObject({ tutorialCompleted: false, disableAutoGuide: false })
  expect(preference().dismissedForNow).toEqual(expect.any(Number))
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('保存过程中立即关闭教程，真实请求继续；保存与读回成功也不把退出算成完成', async () => {
  firstRecordAccount()
  const saving = deferred()
  api.recruitmentCommand.mockReturnValueOnce(saving.promise)
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await saveGuidedRecord(wrapper)
  expect(button(editor(wrapper), '关闭教程').attributes('disabled')).toBeUndefined()
  await button(editor(wrapper), '关闭教程').trigger('click')
  const request = api.recruitmentCommand.mock.calls[0][0]
  records['acc-a'] = [{ ...recruitmentEvent(request.data.entries[0].event_id, null), agent_snapshot: { agent_id: 'slot-up', name: '测试绝密' } }]
  saving.resolve({ archive_revision: 4 }); await flushPromises()
  expect(editor(wrapper).findAll('.gacha-record')).toHaveLength(1)
  expect(preference().tutorialCompleted).toBe(false)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it.each(['直接使用 / 暂时关闭', '以后不自动提示'])('%s不新增记录，不反复自动推荐，帮助入口仍可重新进入', async choice => {
  firstRecordAccount()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), choice).trigger('click')
  expect(preference()).toMatchObject({ tutorialCompleted: false, disableAutoGuide: choice === '以后不自动提示' })
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  await editor(wrapper).get('.close-button').trigger('click'); await selectPool(wrapper)
  expect(button(editor(wrapper), '选择教程主题')).toBeUndefined()
  await startEditorGuide(wrapper)
  expect(editor(wrapper).text()).toContain('点击这次出货的 UP 密探快捷按钮')
})

it('已有记录账号在空池也不自动推荐；手动进入重读真实记录并复用成果，不要求再登记', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(button(editor(wrapper), '选择教程主题')).toBeUndefined()
  const calls = api.listRecruitmentEvents.mock.calls.length
  await startEditorGuide(wrapper)
  expect(api.listRecruitmentEvents).toHaveBeenCalledTimes(calls + 1)
  expect(editor(wrapper).text()).toContain('已有记录不妨碍学习')
  expect(preference().tutorialCompleted).toBe(false)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper)
  expect(button(editor(wrapper), '选择教程主题')).toBeUndefined()
})

it('读回失败不完成且允许退出；重新读取成功后才显示完成', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  api.listRecruitmentEvents.mockRejectedValueOnce(new Error('读回失败'))
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await saveGuidedRecord(wrapper)
  expect(preference().tutorialCompleted).toBe(false)
  expect(editor(wrapper).text()).toContain('读回失败')
  expect(button(editor(wrapper), '关闭教程').attributes('disabled')).toBeUndefined()
  await button(editor(wrapper), '重新读取').trigger('click'); await flushPromises()
  expect(preference().tutorialCompleted).toBe(true)
})

it('档案回读失败不完成；重试开始清掉错误也不能提前当成成功', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  api.getRecruitmentArchive.mockRejectedValueOnce(new Error('档案回读失败'))
  await composer(wrapper).get('.composer-actions .primary').trigger('click'); await flushPromises()
  expect(preference().tutorialCompleted).toBe(false)
  const refreshing = deferred(); api.getRecruitmentArchive.mockReturnValueOnce(refreshing.promise)
  await button(editor(wrapper), '重新核对保存结果').trigger('click'); await flushPromises()
  expect(preference().tutorialCompleted).toBe(false)
  refreshing.reject(new Error('再次回读失败')); await flushPromises()
  expect(preference().tutorialCompleted).toBe(false)
  await button(editor(wrapper), '重新核对保存结果').trigger('click'); await flushPromises()
  expect(preference().tutorialCompleted).toBe(true)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('搜索密探时关闭教学保留真实搜索输入；加载时关闭也无需等待读取结果', async () => {
  firstRecordAccount()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await button(editor(wrapper), '其他密探').trigger('click')
  await composer(wrapper).get('.agent-search input').setValue('测试')
  await button(editor(wrapper), '关闭教程').trigger('click')
  expect(composer(wrapper).get('.agent-search input').element.value).toBe('测试')
  const reading = deferred()
  api.listRecruitmentEvents.mockReturnValueOnce(reading.promise)
  await startEditorGuide(wrapper)
  await button(editor(wrapper), '关闭教程').trigger('click')
  expect(editor(wrapper).find('.guide-exit').exists()).toBe(false)
  expect(composer(wrapper).get('.agent-search input').element.value).toBe('测试')
  reading.resolve({ items: [], archive_revision: 3, next_cursor: null }); await flushPromises()
  expect(preference().tutorialCompleted).toBe(false)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('暂时关闭在重新挂载后仍不自动打扰；账号切换隔离偏好和迟到保存证据', async () => {
  firstRecordAccount()
  let wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), '直接使用 / 暂时关闭').trigger('click'); wrapper.unmount()
  wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(button(editor(wrapper), '选择教程主题')).toBeUndefined()
  await startEditorGuide(wrapper)
  const saving = deferred()
  api.recruitmentCommand.mockReturnValueOnce(saving.promise)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await saveGuidedRecord(wrapper)
  activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper)
  saving.resolve({ archive_revision: 4 }); await flushPromises()
  expect(editor(wrapper).find('.guide-exit').exists()).toBe(false)
  expect(preference('acc-a').tutorialCompleted).toBe(false)
  expect(preference('acc-b')).toBe(null)
})

it('已主动参与刷新不再自动邀请，开始、关闭与完成保持独立语义', async () => {
  firstRecordAccount()
  let wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  expect(preference()).toMatchObject({ tutorialStarted: true, dismissedForNow: null, tutorialCompleted: false })
  wrapper.unmount()
  wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(button(editor(wrapper), '选择教程主题')).toBeUndefined()
  expect(preference()).toMatchObject({ dismissedForNow: null, tutorialCompleted: false })
  await startEditorGuide(wrapper)
  expect(editor(wrapper).text()).toContain('点击这次出货的 UP 密探快捷按钮')
})

it('真实记录读取失败不当空池自动推荐，手动教程仍可立即退出且不提交业务', async () => {
  firstRecordAccount()
  api.listRecruitmentEvents.mockRejectedValue(new Error('记录读取失败'))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  expect(button(editor(wrapper), '选择教程主题')).toBeUndefined()
  await startEditorGuide(wrapper)
  expect(editor(wrapper).text()).toContain('读取失败时可重新读取')
  await button(editor(wrapper), '关闭教程').trigger('click')
  expect(preference().tutorialCompleted).toBe(false)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('探索主题亲自按年份选历史池并切换真实视图，只完成查看引导', async () => {
  const historical = { ...recruitmentFixture().pools[0], pool_id: 'old-pool', snapshot: { name: '旧卡池', game: '代号鸢', start_date: '2024-01-01', end_date: '2024-02-01' } }
  archives['acc-a'].pools.push(historical)
  records['acc-a'] = [{ ...records['acc-a'][0], pool_id: 'old-pool' }]
  const wrapper = render(); await flushPromises()
  await wrapper.get('.recruitment-tutorial-entry').trigger('click')
  await wrapper.get('[data-guide-topic="explore"]').trigger('click')
  await button(wrapper, '2024').trigger('click')
  expect(wrapper.findAll('.pool-card')).toHaveLength(1)
  await selectPool(wrapper)
  expect(editor(wrapper).get('h2').text()).toBe('旧卡池')
  expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].poolId).toBe('old-pool')
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(editor(wrapper).get('.agent-pull-badge').text()).toBe('17抽')
  expect(preference().viewedTopics.explore).toBeUndefined()
  await button(editor(wrapper), '进度条视图').trigger('click')
  expect(editor(wrapper).text()).toContain('查看引导完成')
  expect(preference()).toMatchObject({ tutorialCompleted: false, viewedTopics: { explore: true }, completedTopics: {} })
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('未出绝密主题只保存真实保底，读回进度一致才完成；不新增记录', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'progress')
  expect(editor(wrapper).text()).toContain('没有出绝密无需新增记录')
  await editor(wrapper).get('.remaining-field input').setValue('33')
  expect(editor(wrapper).get('.progress-number strong').text()).toBe('7')
  expect(preference().completedTopics.progress).toBeUndefined()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[0][0].data).toEqual({ pool_id: 'pool-a', entries: [], deleted_event_ids: [], remaining_pulls: 33 })
  expect(editor(wrapper).text()).toContain('当前保底进度已保存并读回确认')
  expect(preference()).toMatchObject({ tutorialCompleted: false, completedTopics: { progress: true } })
  expect(records['acc-a']).toHaveLength(2)
  expect(editor(wrapper).find('.pending-mark').exists()).toBe(false)
  expect(editor(wrapper).get('footer').text()).toContain('修改将在保存后生效')
})

it('保底保存失败或回读值不同不完成，重新核对后完成且不重复发送', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'progress')
  await editor(wrapper).get('.remaining-field input').setValue('25')
  api.recruitmentCommand.mockRejectedValueOnce(new Error('进度保存失败'))
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(preference().completedTopics.progress).toBeUndefined()
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('25')
  api.recruitmentCommand.mockImplementationOnce(async () => { archives['acc-a'].archive_revision++; return { archive_revision: 4 } })
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(preference().completedTopics.progress).toBeUndefined()
  expect(editor(wrapper).text()).toContain('结果尚未确认')
  archives['acc-a'].pools[0].progress = 15
  await button(editor(wrapper), '重新核对保存结果').trigger('click'); await flushPromises()
  expect(preference().completedTopics.progress).toBe(true)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(2)
})

it('未知保底与未知间隔分开解释，加入草稿不猜保底；关闭教程保留草稿及真实字段焦点', async () => {
  firstRecordAccount(); archives['acc-a'].pools[0].progress = null
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  expect(editor(wrapper).text()).toContain('暂不支持保底留空提交')
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('')
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(editor(wrapper).text()).toContain('待保存')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(editor(wrapper).text()).toContain('保底进度未知，暂不能保存')
  expect(preference().tutorialCompleted).toBe(false)
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  editor(wrapper).get('.remaining-field input').element.focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(document.activeElement).toBe(editor(wrapper).get('.remaining-field input').element)
  expect(editor(wrapper).get('.pull-result b').text()).toBe('未知')
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('')
})

it('回访用户出货主题允许同一密探再新增，保存这笔与普通相同；同ID字段不一致不完成', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper)
  await button(editor(wrapper), '新增记录').trigger('click')
  await composer(wrapper).get('.agent-choice').trigger('click')
  expect(composer(wrapper).get('.composer-actions .primary').text()).toBe('保存这笔')
  await composer(wrapper).get('.pull-count-field input').setValue('20')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  api.listRecruitmentEvents.mockImplementationOnce(async () => {
    const data = structuredClone(records['acc-a']); data.at(-1).pull_span = 19
    return { items: data, next_cursor: null, archive_revision: archives['acc-a'].archive_revision }
  })
  await composer(wrapper).get('.composer-actions .primary').trigger('click'); await flushPromises()
  expect(records['acc-a']).toHaveLength(3)
  expect(preference().tutorialCompleted).toBe(false)
  expect(editor(wrapper).text()).toContain('结果尚未确认')
  await button(editor(wrapper), '重新核对保存结果').trigger('click'); await flushPromises()
  expect(preference().tutorialCompleted).toBe(true)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  expect(editor(wrapper).findAll('.gacha-record')).toHaveLength(3)
  expect(editor(wrapper).find('.pending-mark').exists()).toBe(false)
})

it('历史维护主题必须修改原记录并读回目标字段；仅浏览或完成编辑不算保存', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'maintain')
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(preference().completedTopics.maintain).toBeUndefined()
  await editor(wrapper).findAll('.agent-record-detail').at(-1).trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('')
  expect(composer(wrapper).get('.composer-actions .primary').text()).toBe('完成')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
  expect(preference().completedTopics.maintain).toBeUndefined()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[0][0].data.entries).toEqual([expect.objectContaining({ event_id: 'A', pull_span: null })])
  expect(records['acc-a']).toHaveLength(2)
  expect(preference()).toMatchObject({ tutorialCompleted: false, completedTopics: { maintain: true } })
  expect(editor(wrapper).text()).toContain('这条已有记录的修改已保存并读回确认')
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
  expect(preference().completedTopics.maintain).toBeUndefined()
  expect(editor(wrapper).text()).toContain('草稿已保留')
  expect(editor(wrapper).findAll('.pull-result b').at(-1).text()).toBe('22')
  persistSubmittedRecord()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls.at(-1)[0]).toMatchObject({ expectedRevision: 4, data: { entries: [expect.objectContaining({ event_id: 'A', pull_span: 22 })] } })
  expect(preference().completedTopics.maintain).toBe(true)
})

it('新增记录在回读第二页才出现时继续分页核验，不丢草稿或重复创建', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await beginGuide(wrapper)
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await composer(wrapper).get('.composer-actions .primary').trigger('click')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [], next_cursor: 'after-first', archive_revision: 4 })
  const second = deferred(); api.listRecruitmentEvents.mockReturnValueOnce(second.promise)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(preference().tutorialCompleted).toBe(false)
  expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].cursor).toBe('after-first')
  second.resolve({ items: structuredClone(records['acc-a']), next_cursor: null, archive_revision: 4 }); await flushPromises()
  expect(preference().tutorialCompleted).toBe(true)
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
  expect(preference().tutorialCompleted).toBe(false)
  const id = api.recruitmentCommand.mock.calls[0][0].data.entries[0].event_id
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises()
  expect(records['acc-a']).toHaveLength(1)
  expect(records['acc-a'][0].event_id).toBe(id)
  expect(preference().tutorialCompleted).toBe(true)
})

it('教程选择在已有草稿中切换主题，不清空输入、不引导点击禁用的底部保存', async () => {
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), '新增记录').trigger('click'); await composer(wrapper).get('.agent-choice').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('12')
  await startEditorGuide(wrapper, 'progress')
  expect(editor(wrapper).text()).toContain('当前还有正在编辑的记录')
  expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined()
  await startEditorGuide(wrapper, 'maintain')
  expect(composer(wrapper).text()).toContain('当前正在整理新增草稿')
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
  await button(editor(wrapper), '关闭教程').trigger('click'); await startEditorGuide(wrapper, 'maintain')
  expect(feed(wrapper)).toHaveLength(1)
  expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('26')
  expect(editor(wrapper).get('.remaining-field input').element.value).toBe('31')
  expect(editor(wrapper).get('footer').text()).toContain('保存 3 项修改')
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
  await button(editor(wrapper), '重新核对保存结果').trigger('click'); await flushPromises()
  expect(feed(wrapper)).toHaveLength(1)
  expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('26')
  expect(editor(wrapper).get('footer').text()).toContain('保存 3 项修改')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('只读池、目录失败和无历史记录给出可行帮助，不提交假实操', async () => {
  archives['acc-a'].game_mismatch = true
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await startEditorGuide(wrapper, 'progress')
  expect(editor(wrapper).text()).toContain('当前档案只读')
  expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined()
  await startEditorGuide(wrapper, 'explore')
  await button(editor(wrapper), '密探视图').trigger('click'); await button(editor(wrapper), '进度条视图').trigger('click')
  expect(editor(wrapper).text()).toContain('查看引导完成')
  expect(preference().tutorialCompleted).toBe(false)
  wrapper.unmount()
  archives['acc-a'].game_mismatch = false; records['acc-a'] = []
  api.getRecruitmentCatalog.mockRejectedValue(new Error('目录失败'))
  const unavailable = render(); await flushPromises(); await selectPool(unavailable); await startEditorGuide(unavailable)
  expect(editor(unavailable).text()).toContain('暂不能新增出货')
  expect(editor(unavailable).get('.add-record').attributes('disabled')).toBeDefined()
  await startEditorGuide(unavailable, 'maintain')
  expect(editor(unavailable).text()).toContain('本池没有可修改记录')
  expect(api.recruitmentCommand).not.toHaveBeenCalled()
})

it('未登录和没有游戏账号也能主动查看主题，给真实前置条件；页面Esc恢复教程入口焦点', async () => {
  auth.accessToken = ''; auth.userInfo = null
  let wrapper = render(); await flushPromises()
  await wrapper.get('.recruitment-tutorial-entry').trigger('click')
  await wrapper.get('[data-guide-topic="record"]').trigger('click')
  expect(wrapper.get('.page-guide').text()).toContain('请先登录')
  await wrapper.get('.page-guide').trigger('keydown', { key: 'Escape' }); await flushPromises()
  expect(wrapper.find('.page-guide').exists()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('.recruitment-tutorial-entry').element)
  wrapper.unmount()
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'user-a' }; listAccounts.mockResolvedValue([])
  wrapper = render(); await flushPromises()
  await wrapper.get('.recruitment-tutorial-entry').trigger('click'); await wrapper.get('[data-guide-topic="explore"]').trigger('click')
  expect(wrapper.get('.page-guide').text()).toContain('先创建游戏账号')
  expect(wrapper.find('[role=dialog]').exists()).toBe(false)
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
  expect(editor(wrapper).get('.record-view-switch').exists()).toBe(true)
  expect(editor(wrapper).get('#records-title').text()).toBe('本池抽卡进度')
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
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  const quick = editor(wrapper).get('.quick-up-button')
  expect(quick.attributes('aria-label')).toContain('测试绝密'); expect(button(editor(wrapper), '其他密探')).toBeTruthy()
  await quick.trigger('click'); await flushPromises()
  expect(composer(wrapper).find('.agent-picker').exists()).toBe(false); expect(editor(wrapper).get('.quick-up-button').attributes('aria-pressed')).toBe('true'); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); expect(document.activeElement).toBe(composer(wrapper).get('.pull-count-field input').element)
  await composer(wrapper).get('.pull-count-field input').setValue('12'); await composer(wrapper).get('.composer-actions .primary').trigger('click'); await flushPromises()
  expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('12'); expect(editor(wrapper).get('.save-result').text()).toContain('已保存：测试绝密')

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
  expect(feed(wrapper)).toHaveLength(3); expect(feed(wrapper)[0].get('.pull-result b').text()).toBe('40'); expect(api.recruitmentCommand.mock.calls[0][0].data.entries[0].pull_span).toBe(40)
})
it('普通新增保存后留在本池，继续编辑原ID并改保底，重开回显且不重复新增', async () => {
  persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await addRecord(wrapper, 'char-a', '17'); await flushPromises()
  expect(editor(wrapper).find('.entry-composer').exists()).toBe(false)
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
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); await editRow(wrapper); await composer(wrapper).get('input').setValue('20'); await button(composer(wrapper), '取消').trigger('click'); expect(feed(wrapper).at(-1).get('.pull-result b').text()).toBe('17')
  expect(editor(wrapper).find('.record-feed .delete-record').exists()).toBe(false)
  await editRow(wrapper); await button(composer(wrapper), '删除记录').trigger('click')
  await button(editor(wrapper), '新增记录').trigger('click')
  await composer(wrapper).get('.agent-choice').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('12')
  await button(composer(wrapper), '取消').trigger('click')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises(); expect(api.recruitmentCommand.mock.calls.at(-1)[0].data).toMatchObject({ entries: [], deleted_event_ids: ['A'] })
  await editor(wrapper).get('.close-button').trigger('click'); await selectPool(wrapper); expect(feed(wrapper)).toHaveLength(2)
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
  await addRecord(wrapper); await flushPromises()
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

it('A迟到读写不覆盖B记录或关闭B新弹窗，切账号清旧草稿', async () => {
  const read = deferred(); api.listRecruitmentEvents.mockImplementation(({ accountId }) => accountId === 'acc-a' ? read.promise : Promise.resolve({ items: [], next_cursor: null, archive_revision: 3 }))
  const wrapper = render(); await flushPromises(); await selectPool(wrapper); activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper); read.resolve({ items: records['acc-a'], next_cursor: null, archive_revision: 3 }); await flushPromises(); expect(feed(wrapper)).toHaveLength(0)
  api.listRecruitmentEvents.mockImplementation(({ accountId }) => Promise.resolve({ items: records[accountId], next_cursor: null, archive_revision: archives[accountId].archive_revision })); activeAccount.set('acc-a'); await flushPromises(); await selectPool(wrapper)
  const write = deferred(); api.recruitmentCommand.mockReturnValue(write.promise); await addRecord(wrapper); await flushPromises();
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  expect(api.recruitmentCommand.mock.calls[0][0].accountId).toBe('acc-a'); activeAccount.set('acc-b'); await flushPromises(); await selectPool(wrapper); write.resolve({ archive_revision: 4 }); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(true); expect(wrapper.text()).not.toContain('已保存'); expect(wrapper.get('.summary strong').text()).toBe('999'); expect(feed(wrapper)).toHaveLength(0)
})
it('记录读取失败禁止保存可重试；分页不丢草稿且不混合不同版本', async () => {
  api.listRecruitmentEvents.mockRejectedValueOnce(new Error('records unavailable')); const wrapper = render(); await flushPromises(); await selectPool(wrapper); expect(editor(wrapper).get('button[type=submit]').attributes('disabled')).toBeDefined(); await button(editor(wrapper), '重新读取').trigger('click'); await flushPromises(); expect(feed(wrapper)).toHaveLength(2)
  await button(editor(wrapper), '取消').trigger('click'); api.listRecruitmentEvents.mockResolvedValueOnce({ items: records['acc-a'], next_cursor: 'next', archive_revision: 3 }); await selectPool(wrapper); await button(editor(wrapper), '新增记录').trigger('click'); await composer(wrapper).get('.agent-choice').trigger('click'); await composer(wrapper).get('.pull-count-field input').setValue('12')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [{ ...recruitmentEvent('C', 7), agent_snapshot: { agent_id: 'char-a', name: '测试绝密' } }], next_cursor: 'last', archive_revision: 3 }); await button(editor(wrapper), '加载更早记录').trigger('click'); await flushPromises(); expect(feed(wrapper)).toHaveLength(3); expect(composer(wrapper).get('.pull-count-field input').element.value).toBe('12'); expect(api.listRecruitmentEvents.mock.calls.at(-1)[0].cursor).toBe('next')
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
  expect(api.listRecruitmentEvents).toHaveBeenCalledTimes(2)
  expect(api.listRecruitmentEvents.mock.calls[0][0].accountId).toBe('acc-b')
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
  expect(editor(wrapper).get('.daily-entry').text()).toContain('这次有没有出绝密')
  expect(editor(wrapper).get('.progress-card').isVisible()).toBe(false)
  await button(editor(wrapper), '直接使用 / 暂时关闭').trigger('click')
  await button(editor(wrapper), '抽到了绝密').trigger('click')
  await button(editor(wrapper), '其他密探').trigger('click')
  await composer(wrapper).get('.agent-search input').setValue('非UP')
  await composer(wrapper).get('.agent-choice').trigger('click')
  await editor(wrapper).get('.remaining-field input').setValue('33')
  expect(composer(wrapper).get('.pull-count-field input').element.value).toBe('')
  await button(composer(wrapper), '保存这笔').trigger('click'); await flushPromises()
  const request = api.recruitmentCommand.mock.calls[0][0]
  expect(request.data.entries).toEqual([expect.objectContaining({ agent_id: 'char-b', pull_span: null, up_status: 'non_up' })])
  expect(editor(wrapper).get('.save-result').text()).toContain('已保存：非UP密探')
  expect(editor(wrapper).get('.save-result').text()).toContain('本池已知 7 抽 · 绝密 1 条')
  expect(editor(wrapper).get('.gacha-record').text()).toContain('本笔已保存')
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await button(editor(wrapper), '密探视图').trigger('click')
  expect(editor(wrapper).get('.agent-pull-badge').text()).toBe('未知')
  expect(editor(wrapper).get('.agent-record-card').text()).toContain('本笔已保存')
  expect(archives['acc-a'].pool_summaries['pool-a']).toMatchObject({ known_total_pulls: 7, event_count: 1, up_agent_counts: {} })
  expect(preference().tutorialCompleted).toBe(false)
})

it('普通未出绝密仅保存游戏距保底，读回数字突出且不生成事件', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), '还没出绝密').trigger('click')
  expect(editor(wrapper).get('.entry-shortcuts').isVisible()).toBe(false)
  expect(editor(wrapper).find('.entry-composer').exists()).toBe(false)
  expect(editor(wrapper).text()).toContain('不是「这次又抽了几次」')
  await editor(wrapper).get('.remaining-field input').setValue('31')
  await button(editor(wrapper), '保存保底进度').trigger('click'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[0][0].data).toEqual({ pool_id: 'pool-a', entries: [], deleted_event_ids: [], remaining_pulls: 31 })
  expect(records['acc-a']).toEqual([])
  expect(editor(wrapper).get('.save-result').text()).toContain('当前保底已保存')
  expect(editor(wrapper).get('.save-result').text()).toContain('距保底 31 抽')
  expect(editor(wrapper).get('.progress-card').classes()).toContain('is-saved')
  await editor(wrapper).get('.remaining-field input').setValue('29')
  expect(editor(wrapper).get('.progress-card').classes()).not.toContain('is-saved')
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})

it('普通请求成功但回读不一致时禁重复保存，重新核对后才高亮；不会显示泛泛成功', async () => {
  firstRecordAccount(); persistSubmittedRecord()
  const wrapper = render(); await flushPromises(); await selectPool(wrapper)
  await button(editor(wrapper), '抽到了绝密').trigger('click')
  await editor(wrapper).get('.quick-up-button').trigger('click')
  api.listRecruitmentEvents.mockResolvedValueOnce({ items: [], archive_revision: 4, next_cursor: null })
  await button(composer(wrapper), '保存这笔').trigger('click'); await flushPromises()
  expect(editor(wrapper).get('.save-result').text()).toContain('结果尚未确认')
  expect(editor(wrapper).find('.saved-mark').exists()).toBe(false)
  expect(wrapper.get('.feedback').text()).not.toContain('已保存')
  expect(editor(wrapper).get('.quick-up-button').attributes('disabled')).toBeDefined()
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
  await button(editor(wrapper), '重新核对本笔').trigger('click'); await flushPromises()
  expect(editor(wrapper).get('.save-result').text()).toContain('服务端已读回核对')
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
  await button(editor(wrapper), '抽到了绝密').trigger('click')
  await editor(wrapper).get('.quick-up-button').trigger('click')
  await composer(wrapper).get('.pull-count-field input').setValue('20')
  await button(composer(wrapper), '保存这笔').trigger('click'); await flushPromises()
  const first = structuredClone(api.recruitmentCommand.mock.calls[0][0])
  expect(editor(wrapper).text()).toContain('网络中断')
  expect(editor(wrapper).find('.save-result').exists()).toBe(false)
  expect(editor(wrapper).findAll('.pending-mark')).toHaveLength(1)
  await editor(wrapper).get('form').trigger('submit'); await flushPromises()
  expect(api.recruitmentCommand.mock.calls[1][0]).toEqual(first)
  expect(records['acc-a']).toHaveLength(1)
  expect(editor(wrapper).get('.save-result').text()).toContain('服务端已读回核对')
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
  expect(editor(wrapper).get('.save-result').text()).toContain('已移除 1 条记录')
  expect(records['acc-a'].map(event => event.event_id)).toEqual(['B'])
  expect(feed(wrapper)).toHaveLength(1)
  expect(api.recruitmentCommand).toHaveBeenCalledTimes(1)
})
