import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { operatorScanReviewFixture } from '../test-support/operatorScanReviewFixtures.js'

const guards = vi.hoisted(() => ({ leave: [], update: [] }))
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ query: {}, path: '/operator' })
  const router = { replace: vi.fn().mockResolvedValue(), push: vi.fn() }
  return { useRouter: () => router, useRoute: () => route,
    onBeforeRouteLeave: fn => guards.leave.push(fn), onBeforeRouteUpdate: fn => guards.update.push(fn) }
})
vi.mock('../src/api/operator.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/inventory.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn().mockResolvedValue({ generation: 0, entries: [] }) }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn(), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true }) }
})
vi.mock('../src/store/activeAccount.js', async () => {
  const { reactive } = await import('vue')
  return { activeAccount: reactive({ id: 'acc-review-a', game: '如鸢', gameFor() { return this.game }, set(value) { this.id = value }, setGame(value) { this.game = value }, syncAccounts: vi.fn() }) }
})
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: () => () => {} }))

let api, activeAccount, auth, fixture, wrappers, route, router
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej }); return { promise, resolve, reject } }
function receipt(body, status = 'accepted', extra = {}) {
  const record = body.document.records[0]
  return { accepted: status === 'accepted' ? 1 : 0, partial: status === 'partial' ? 1 : 0, review: status === 'review' ? 1 : 0, rejected: status === 'rejected' ? 1 : 0, unchanged: status === 'unchanged' ? 1 : 0,
    items: [{ account_id: 'acc-review-a', operator_id: 'review-op', record_id: record.record_id, status, target_revision: 3,
      changes: { huaji: { before: fixture.current.huaji, after: record.entries[0].huaji } }, ...extra }] }
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  guards.leave = []; guards.update = []; wrappers = []
  fixture = operatorScanReviewFixture()
  const routing = await import('vue-router')
  route = routing.useRoute(); route.query = {}
  router = routing.useRouter()
  api = await import('../src/api/operator.js')
  ;({ activeAccount } = await import('../src/store/activeAccount.js'))
  ;({ auth } = await import('../src/store/auth.js'))
  activeAccount.id = 'acc-review-a'; auth.isLoggedIn = true
  api.getOperatorCatalog.mockImplementation(async () => ({ operators: [fixture.catalog] }))
  api.listOperatorAccounts.mockResolvedValue([{ id: 'acc-review-a', name: '合成账号甲', game: '如鸢' }, { id: 'acc-review-b', name: '合成账号乙', game: '如鸢' }])
  api.getOperatorCurrent.mockImplementation(async ({ accountId }) => accountId === 'acc-review-a' ? [{ entries: { 'review-op': fixture.current } }] : [])
  api.getOperatorAnnotations.mockResolvedValue({ items: [] })
  api.listOperatorScanReviews.mockImplementation(async account => account === 'acc-review-a' ? [fixture.review] : [])
  api.closeOperatorScanReview.mockResolvedValue({})
  api.previewOperatorImport.mockImplementation(async body => receipt(body))
  api.importOperator.mockImplementation(async body => receipt(body))
  const inventory = await import('../src/api/inventory.js')
  inventory.listAgentFavorites.mockResolvedValue({ agent_ids: [] })
  inventory.getCurrent.mockResolvedValue([])
  const star = await import('../src/api/starLoadout.js')
  star.getCurrentStarLoadout.mockResolvedValue({ generation: 0, revision: 0, loadouts: {} })
  const { starLoadoutPresetStore } = await import('../src/domain/starLoadoutPresets.js')
  vi.spyOn(starLoadoutPresetStore, 'load').mockResolvedValue()
  const media = new EventTarget(); media.matches = false
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => { for (const wrapper of wrappers) wrapper.unmount(); document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals() })

async function render() {
  const { default: OperatorPage } = await import('../src/pages/operator/index.vue')
  const { default: AppDialog } = await import('../src/components/AppDialog.vue')
  const host = mount({ components: { OperatorPage, AppDialog }, template: '<OperatorPage /><AppDialog />' }, { attachTo: document.body, global: {
    plugins: [createPinia()], directives: { reveal: () => {} }, stubs: { IslandSidebar: true, SiteFooter: true, OnboardingGuide: true, DataAccountContextBar: true,
      AccountWorkspace: { template: '<div><slot /><slot name="summary-actions" /></div>' }, OperatorShareManager: true, OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true, RouterLink: true },
  } })
  wrappers.push(host)
  await flushPromises()
  const page = host.getComponent(OperatorPage)
  await page.get('.scan-review-panel button').trigger('click')
  await flushPromises()
  return page
}
const button = (page, text) => page.findAll('button').find(item => item.text() === text)
const setStage = async (page, value = 13) => { await page.get('[aria-label="复核化极星级与节点"]').setValue(value); await flushPromises() }
const preview = async page => { await button(page, '校验并预览').trigger('submit'); await flushPromises() }
const save = async page => { await button(page, '确认保存').trigger('click'); await flushPromises() }

it('安全：正常字段修正不接触 JSON，只预览而不写入，可靠等级/修为不重传', async () => {
  const page = await render()
  expect(page.find('#operator-import-json').exists()).toBe(false)
  expect(page.get('#scan-review-field-level').attributes('disabled')).toBeDefined()
  expect(page.get('#scan-review-field-huaji .values').text()).toContain('现值：2 星 · 0 节点')
  expect(page.get('.technical').attributes('open')).toBeUndefined()
  await setStage(page)
  await preview(page)
  expect(api.previewOperatorImport).toHaveBeenCalledOnce()
  expect(api.importOperator).not.toHaveBeenCalled()
  const body = api.previewOperatorImport.mock.calls[0][0]
  expect(body.document.records[0].entries).toEqual([{ operator_id: 'review-op', huaji: { owned: true, stage: 13, awakened: false } }])
  expect(body.account_mapping).toEqual({ 'local-synthetic': 'acc-review-a' })
  expect(page.text()).toContain('尚未保存')
})

it('全部明确成功后才关闭原提醒；写入回执与预览分开', async () => {
  const page = await render(); await setStage(page); await preview(page); await save(page)
  expect(api.importOperator).toHaveBeenCalledOnce()
  expect(api.previewOperatorImport).toHaveBeenCalledTimes(2)
  expect(api.closeOperatorScanReview).toHaveBeenCalledWith({ accountId: 'acc-review-a', recordId: 'scan:synthetic', operatorId: 'review-op' })
  expect(page.find('.scan-review-form').exists()).toBe(false)
  expect(page.text()).toContain('服务器保存回执')
  expect(page.text()).toContain('已保存')
})

it('蓝卡按已保存的满阶现值复核，无变化也能确认并关闭提醒', async () => {
  fixture.catalog.rarity = 3
  fixture.current.huaji = { owned: true, stage: 19, awakened: false }
  fixture.review.warnings = [{ code: 'legacy_huaji_requires_review', field: 'star_level' }]
  api.previewOperatorImport.mockImplementation(async body => receipt(body, 'unchanged', { changes: {} }))
  api.importOperator.mockImplementation(async body => receipt(body, 'unchanged', { changes: {} }))
  const page = await render(); await setStage(page, 19); await preview(page)
  expect(button(page, '确认保存').attributes('disabled')).toBeUndefined()
  await save(page)
  expect(api.previewOperatorImport).toHaveBeenCalledTimes(2)
  expect(api.importOperator.mock.calls[0][0].document.records[0].entries).toEqual([
    { operator_id: 'review-op', huaji: { owned: true, stage: 19, awakened: false } },
  ])
  expect(api.closeOperatorScanReview).toHaveBeenCalledOnce()
  expect(page.find('.scan-review-form').exists()).toBe(false)
  expect(page.text()).toContain('已收到无变化回执，档案未改写')
})

it('关闭提醒失败在复核区展示原因，重试成功后退出且不写档案', async () => {
  api.closeOperatorScanReview.mockRejectedValueOnce(new Error('连接中断'))
  const page = await render()
  const dismiss = async () => {
    await button(page, '已另行处理，关闭提醒').trigger('click'); await flushPromises()
    document.querySelector('.dlg-btn.primary').click(); await flushPromises()
  }
  await dismiss()
  expect(page.get('.import-box [role="alert"]').text()).toContain('连接中断')
  expect(page.find('.scan-review-form').exists()).toBe(true)
  await dismiss()
  expect(api.closeOperatorScanReview).toHaveBeenCalledTimes(2)
  expect(page.find('.scan-review-form').exists()).toBe(false)
  expect(page.find('.import-box').exists()).toBe(false)
  expect(api.importOperator).not.toHaveBeenCalled()
})

it.each([
  ['缺少逐项回执', () => ({ unchanged: 1 })],
  ['回执属于其他账号', body => receipt(body, 'unchanged', { account_id: 'acc-review-b' })],
  ['仍有待核原因', body => receipt(body, 'unchanged', { warnings: [{ code: 'legacy_huaji_requires_review' }] })],
  ['仍有阻断错误', body => receipt(body, 'unchanged', { blocking_errors: [{ code: 'invalid_huaji' }] })],
])('无变化但%s时不能确认保存或关闭提醒', async (_, response) => {
  api.previewOperatorImport.mockImplementation(async body => response(body))
  const page = await render(); await setStage(page); await preview(page)
  expect(button(page, '确认保存').attributes('disabled')).toBeDefined()
  await save(page)
  expect(api.importOperator).not.toHaveBeenCalled()
  expect(api.closeOperatorScanReview).not.toHaveBeenCalled()
})

it('蓝卡旧采集31与历史额外节点不自动拉满，可人工确认4星', async () => {
  fixture.catalog.rarity = 3
  fixture.current.huaji = { owned: true, stage: 24, awakened: null }
  fixture.review.document.version = 3
  delete fixture.entry.huaji
  fixture.entry.star_level = 31
  fixture.entry.section_status.huaji = 'ready'
  fixture.review.warnings = [{ code: 'legacy_huaji_requires_review', field: 'star_level' }]
  const page = await render()
  const stage = page.get('[aria-label="复核化极星级与节点"]')
  expect(stage.element.selectedOptions[0]._value).toBeNull()
  expect(stage.findAll('option').at(-1).text()).toBe('4 星')
  expect(page.text()).toContain('满星后没有小节点，也不支持觉醒')
  await setStage(page, 19); await preview(page); await save(page)
  expect(api.importOperator.mock.calls[0][0].document.records[0].entries).toEqual([
    { operator_id: 'review-op', huaji: { owned: true, stage: 19, awakened: null } },
  ])
  expect(api.closeOperatorScanReview).toHaveBeenCalledOnce()
})

it('部分成功保留未支持分区、原提醒和逐项原因', async () => {
  fixture = operatorScanReviewFixture('unsupported')
  api.importOperator.mockImplementation(async body => receipt(body, 'partial', { warnings: [{ code: 'producer_warning', message: '待补充采集证据' }] }))
  const page = await render(); await setStage(page); await preview(page); await save(page)
  expect(api.closeOperatorScanReview).not.toHaveBeenCalled()
  expect(page.text()).toContain('此项暂不支持字段表单修改')
  expect(page.text()).toContain('部分保存')
  expect(page.text()).toContain('待补充采集证据')
  expect(page.find('.scan-review-form').exists()).toBe(true)
})

it('全部拒绝禁止保存，服务端原因可直接定位控件', async () => {
  api.previewOperatorImport.mockImplementation(async body => receipt(body, 'rejected', { blocking_errors: [{ code: 'invalid_huaji', message: 'invalid_huaji', field: 'huaji.stage' }] }))
  const page = await render(); await setStage(page); await preview(page)
  expect(button(page, '确认保存').attributes('disabled')).toBeDefined()
  await page.get('.import-issue-list a').trigger('click')
  expect(document.activeElement.getAttribute('aria-label')).toBe('复核拥有状态')
  expect(api.importOperator).not.toHaveBeenCalled()
})

it('旧响应缺少逐项回执时保留提醒，不能声称每个字段成功', async () => {
  api.previewOperatorImport.mockResolvedValue({ accepted: 1 })
  api.importOperator.mockResolvedValue({ accepted: 1 })
  const page = await render(); await setStage(page); await preview(page); await save(page)
  expect(api.closeOperatorScanReview).not.toHaveBeenCalled()
  expect(page.text()).toContain('不能确认每个字段已保存')
  expect(page.get('[aria-label="复核化极星级与节点"]').element.value).toBe('13')
})

it('安全：网络失败保留输入，重试沿用幂等键，重复点击只发一次提交', async () => {
  const page = await render(); await setStage(page); await preview(page)
  api.importOperator.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await save(page)
  expect(page.text()).toContain('输入已保留')
  expect(page.get('[aria-label="复核化极星级与节点"]').element.value).toBe('13')
  const firstBody = api.importOperator.mock.calls[0][0]
  const pending = deferred()
  api.importOperator.mockReturnValueOnce(pending.promise)
  await save(page)
  await button(page, '保存中…').trigger('click')
  expect(api.importOperator).toHaveBeenCalledTimes(2)
  expect(api.importOperator.mock.calls[1][0]).toEqual(firstBody)
  pending.resolve(receipt(firstBody)); await flushPromises()
})

it('冲突更新预览但保留表单，重新确认之前不写入', async () => {
  const page = await render(); await setStage(page); await preview(page)
  api.previewOperatorImport.mockImplementation(async body => receipt(body, 'accepted', { target_revision: 4 }))
  await save(page)
  expect(api.importOperator).not.toHaveBeenCalled()
  expect(page.text()).toContain('已更新预览')
  expect(page.get('[aria-label="复核化极星级与节点"]').element.value).toBe('13')
  await save(page)
  expect(api.importOperator).toHaveBeenCalledOnce()
})

it('安全：收到可靠回执的字段锁定，下一次修正不重传已保存的分区', async () => {
  fixture = operatorScanReviewFixture('oddity')
  const page = await render(); await setStage(page); await preview(page); await save(page)
  expect(api.closeOperatorScanReview).not.toHaveBeenCalled()
  expect(page.get('#scan-review-field-huaji').attributes('disabled')).toBeDefined()
  await page.get('[aria-label="修正后的攻击奇闻"]').setValue(350); await preview(page)
  const second = api.previewOperatorImport.mock.calls.at(-1)[0].document.records[0].entries[0]
  expect(second).toEqual({ operator_id: 'review-op', combat_stats: { oddities: { attack: { current: 350 } } }, section_status: { oddities: 'partial' } })
})

it('安全：网络丢失回执后，服务端幂等证明已提交时不再写入', async () => {
  const page = await render(); await setStage(page); await preview(page)
  api.importOperator.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await save(page)
  api.previewOperatorImport.mockImplementation(async body => receipt(body, 'unchanged', { warnings: [{ code: 'duplicate_record', message: 'record_id was already committed' }] }))
  await save(page)
  expect(api.importOperator).toHaveBeenCalledOnce()
  expect(api.closeOperatorScanReview).toHaveBeenCalledOnce()
  expect(page.text()).toContain('本次没有重复写入')
})

it('安全：A→B→A 的旧预览与旧提交不能污染页面或关闭提醒', async () => {
  const page = await render(); await setStage(page)
  const oldPreview = deferred(); api.previewOperatorImport.mockReturnValueOnce(oldPreview.promise)
  await preview(page)
  const body = api.previewOperatorImport.mock.calls[0][0]
  activeAccount.id = 'acc-review-b'; activeAccount.id = 'acc-review-a'; await nextTick()
  oldPreview.resolve(receipt(body)); await flushPromises()
  expect(page.find('[aria-label="v3 导入预览"]').exists()).toBe(false)
  expect(api.importOperator).not.toHaveBeenCalled()
  await page.get('.scan-review-panel button').trigger('click'); await flushPromises()
  await setStage(page); await preview(page)
  const oldCommit = deferred(); api.importOperator.mockReturnValueOnce(oldCommit.promise)
  await save(page)
  const submitted = api.importOperator.mock.calls[0][0]
  activeAccount.id = 'acc-review-b'; await nextTick(); activeAccount.id = 'acc-review-a'; await nextTick()
  oldCommit.resolve(receipt(submitted)); await flushPromises()
  expect(page.find('[aria-label="逐项保存回执"]').exists()).toBe(false)
  expect(api.closeOperatorScanReview).not.toHaveBeenCalled()
})

it('安全：路由已变化时，旧复核导航响应不能重新打开表单或清理新路由', async () => {
  const page = await render()
  await button(page, '取消复核').trigger('click'); await flushPromises()
  const pending = deferred(); api.listOperatorScanReviews.mockReturnValueOnce(pending.promise)
  route.query = { review_record: fixture.review.record_id, review_operator: fixture.review.operator_id, account_id: fixture.review.account_id }
  await nextTick()
  route.query = {}; await nextTick()
  pending.resolve([fixture.review]); await flushPromises()
  expect(page.find('.scan-review-form').exists()).toBe(false)
  expect(router.replace).not.toHaveBeenCalled()
  expect(api.importOperator).not.toHaveBeenCalled()
})

it('关闭未保存内容复用共享弹窗；Tab 困在上层，Esc 只取消上层并保留输入', async () => {
  const page = await render(); await setStage(page)
  await button(page, '取消复核').trigger('click'); await flushPromises()
  const dialog = document.querySelector('.dialog')
  expect(dialog.textContent).toContain('放弃未保存修改')
  const last = dialog.querySelector('.dlg-btn.primary'); last.focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(dialog.contains(document.activeElement)).toBe(true)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
  expect(document.querySelector('.dialog')).toBeNull()
  expect(page.get('[aria-label="复核化极星级与节点"]').element.value).toBe('13')
  await button(page, '取消复核').trigger('click'); await flushPromises()
  document.querySelector('.dlg-btn.primary').click(); await flushPromises()
  expect(page.find('.scan-review-form').exists()).toBe(false)
  expect(api.closeOperatorScanReview).not.toHaveBeenCalled()
  await page.get('.scan-review-panel button').trigger('click'); await flushPromises()
  const unknownStage = page.get('[aria-label="复核化极星级与节点"]').element.selectedOptions[0]
  expect(unknownStage.textContent).toBe('未知，请核对')
  expect(unknownStage._value).toBeNull()
})

it('奇闻上限和未知值使用正常控件修正，错误摘要聚焦且有定位链接', async () => {
  fixture = operatorScanReviewFixture('oddity')
  const page = await render()
  const attack = page.get('[aria-label="修正后的攻击奇闻"]')
  const missing = page.get('[aria-label="修正后的合成特殊奇闻"]')
  expect(missing.element.value).toBe('')
  await attack.setValue(351); await preview(page)
  expect(page.get('.errors').element).toBe(document.activeElement)
  expect(api.previewOperatorImport).not.toHaveBeenCalled()
  await page.get('.errors a').trigger('click')
  expect(document.activeElement).toBe(attack.element)
  await attack.setValue(350); await missing.setValue(10.1); await preview(page)
  expect(api.previewOperatorImport.mock.calls[0][0].document.records[0].entries[0].combat_stats.oddities).toEqual({ attack: { current: 350 }, special: { current: 10.1 } })
})

it('非法命盘可用原有复选控件取消并替换，预览不需要编辑 JSON', async () => {
  fixture = operatorScanReviewFixture('disc')
  const page = await render()
  const field = page.get('#scan-review-field-disc_loadouts')
  await field.findAll('label').find(label => label.text().startsWith('非法合成命盘')).get('input').setValue(false)
  await field.findAll('label').find(label => label.text() === '合成命盘甲').get('input').setValue(true)
  await preview(page)
  expect(api.previewOperatorImport.mock.calls[0][0].document.records[0].entries[0].disc_loadouts[0].discs).toEqual([{ ot_name: '合成命盘甲' }])
  expect(api.importOperator).not.toHaveBeenCalled()
})

it('识别错字置顶提示，错误摘要定位异常项，手动替换后只预览修正值', async () => {
  fixture = operatorScanReviewFixture('disc')
  fixture.catalog.discs = [{ ot_name: '初始能量+3' }, { ot_name: '攻击力小幅提升' }]
  const original = fixture.entry.disc_loadouts[0]
  original.name = '命盘一'
  original.discs = [{ ot_name: '攻击力小幅提升' }, { ot_name: '初是能量+3' }]
  const page = await render()
  const field = page.get('#scan-review-field-disc_loadouts')
  const invalid = field.get('.invalid-disc input')
  expect(field.get('.loadout .check').text()).toContain('初是能量+3')
  expect(field.get('.invalid-disc-hint').text()).toContain('请取消勾选，再对照游戏选择正确命盘')
  expect(invalid.attributes('aria-invalid')).toBe('true')
  expect(invalid.element.checked).toBe(true)
  await field.get('[aria-label="确认本次保存命盘"]').setValue(true)
  await preview(page)
  expect(page.get('.errors').text()).toContain('组合 1：命盘「初是能量+3」不在该密探图鉴中')
  expect(page.get('.errors').text()).not.toContain('请填写组合名')
  expect(document.activeElement).toBe(page.get('.errors').element)
  expect(api.previewOperatorImport).not.toHaveBeenCalled()
  await page.get('.errors a').trigger('click')
  expect(document.activeElement).toBe(invalid.element)
  await invalid.setValue(false)
  expect(field.find('.invalid-disc').exists()).toBe(false)
  await field.findAll('.check').find(label => label.text() === '初始能量+3').get('input').setValue(true)
  await preview(page)
  expect(page.find('.errors').exists()).toBe(false)
  expect(api.previewOperatorImport.mock.calls[0][0].document.records[0].entries[0].disc_loadouts[0].discs).toEqual([
    { ot_name: '攻击力小幅提升' }, { ot_name: '初始能量+3' },
  ])
  expect(original.discs).toEqual([{ ot_name: '攻击力小幅提升' }, { ot_name: '初是能量+3' }])
  expect(api.importOperator).not.toHaveBeenCalled()
})

it('安全：切账号后的旧文件读取不能替换新的字段复核稿', async () => {
  const readers = []
  vi.stubGlobal('FileReader', class { constructor() { readers.push(this) } readAsText() {} })
  const page = await render()
  await button(page, '取消复核').trigger('click'); await flushPromises()
  await page.get('.archive-import').trigger('click'); await flushPromises()
  const file = page.get('input[type="file"]')
  Object.defineProperty(file.element, 'files', { value: [new File(['{}'], 'synthetic.json')] })
  await file.trigger('change')
  activeAccount.id = 'acc-review-b'; await nextTick(); activeAccount.id = 'acc-review-a'; await nextTick(); await flushPromises()
  await page.get('.scan-review-panel button').trigger('click'); await flushPromises()
  await setStage(page)
  readers[0].result = JSON.stringify(fixture.review.document); readers[0].onload(); await flushPromises()
  await preview(page)
  const record = api.previewOperatorImport.mock.calls[0][0].document.records[0]
  expect(record.record_id).toMatch(/^review:/)
  expect(record.entries).toEqual([{ operator_id: 'review-op', huaji: { owned: true, stage: 13, awakened: false } }])
})

it('安全：退出登录及卸载后旧请求不产生关闭提醒或后续写入', async () => {
  const page = await render(); await setStage(page)
  const pending = deferred(); api.previewOperatorImport.mockReturnValueOnce(pending.promise)
  await preview(page)
  const body = api.previewOperatorImport.mock.calls[0][0]
  auth.isLoggedIn = false; await nextTick(); wrappers[0].unmount(); wrappers = []
  pending.resolve(receipt(body)); await flushPromises()
  expect(api.importOperator).not.toHaveBeenCalled()
  expect(api.closeOperatorScanReview).not.toHaveBeenCalled()
})
