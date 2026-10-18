import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
const tutorialFeature = vi.hoisted(() => ({ enabled: true }))
vi.mock('../src/config/features.js', async original => ({ ...(await original()), get TUTORIALS_ENABLED() { return tutorialFeature.enabled } }))
import StarPage from '../src/pages/star/index.vue'
import { getCurrent as getCurrentInventory, importInventory } from '../src/api/inventory.js'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getCurrentStarState, rebuildStarState } from '../src/api/starState.js'
import { consumeStarCapture, getStarCaptureImage, getStarCaptureManifest } from '../src/api/starCaptures.js'
import { isStarCaptureDraftPersisted } from '../src/pages/star/captureDraftReceipt.js'
import { STAR_CAPTURE_LIFECYCLE_KEY } from '../src/pages/star/starCaptureLifecycle.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'

const navigation = vi.hoisted(() => ({ route: null, replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => navigation.route, useRouter: () => ({ replace: navigation.replace }) }))
vi.mock('../src/store/auth.js', () => ({ auth: reactive({ isLoggedIn: false }) }))
vi.mock('../src/api/inventory.js', () => ({ getCurrent: vi.fn(), importInventory: vi.fn() }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/starState.js', () => ({
  getCurrentStarState: vi.fn(), patchCurrentStarState: vi.fn(), rebuildStarState: vi.fn(),
  listStarRecoveryPoints: vi.fn(), restoreStarRecoveryPoint: vi.fn(),
}))
vi.mock('../src/api/starCaptures.js', () => ({
  consumeStarCapture: vi.fn(), getPendingStarCapture: vi.fn().mockResolvedValue(null),
  getStarCaptureImage: vi.fn(), getStarCaptureManifest: vi.fn(),
}))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: vi.fn(() => () => {}) }))
vi.mock('../src/pages/star/legacyHostAccountMigration.js', () => ({ migrateLegacyYuanStarHostAccount: vi.fn().mockResolvedValue(null) }))
vi.mock('../src/pages/star/captureDraftReceipt.js', () => ({ isStarCaptureDraftPersisted: vi.fn() }))

const emptySnapshot = {
  inventory: [], planTargets: {}, experience: { orange: null, purple: null, white: null },
  bag: { currentCount: null, capacity: null },
}
const emptyRemote = {
  generation: 0, revision: 0, inventory: [], plan_targets: {},
  experience: { orange: null, purple: null, white: null },
  bag: { current_count: null, capacity: null },
}
const nativeFunction = Function
let embedMount
afterEach(() => document.getElementById('yuanstar-embed-styles')?.remove())

function render(options = {}) {
  return mount(StarPage, { ...options, global: {
    stubs: {
      RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true,
      AccountWorkspace: true, DataAccountContextBar: true, ArchiveExchangePanel: true,
    },
    directives: { reveal: () => {} },
  } })
}

async function loadStylesheet() {
  const link = document.getElementById('yuanstar-embed-styles')
  expect(link).not.toBeNull()
  link.dispatchEvent(new Event('load'))
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  tutorialFeature.enabled = true
  navigation.route = reactive({ path: '/star', query: {}, hash: '' })
  auth.isLoggedIn = false
  auth.userInfo = null
  activeAccount.set('')
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: '测试账号', game: '如鸢' }])
  getCurrentStarState.mockResolvedValue(emptyRemote)
  isStarCaptureDraftPersisted.mockReset().mockResolvedValue(true)
  getStarCaptureManifest.mockReset().mockResolvedValue({
    capture_id: 'capture-1', game_version: '代号鸢',
    sections: Object.fromEntries(['main', 'support', 'experience'].map((section, index) => [section, {
      images: [{ source_image_id: section + '-1', source_order: index + 1, file_name: section + '.png' }],
      adjacent_relations: [], complete: true, stop_reason: section === 'experience' ? 'single_capture' : 'bottom_no_move',
    }])),
  })
  getStarCaptureImage.mockResolvedValue({ blob: new Blob(['fixture'], { type: 'image/png' }) })
  embedMount = vi.fn(() => ({
    setHostAccount: vi.fn().mockResolvedValue(undefined), setActiveTab: vi.fn(), setReviewView: vi.fn(),
    importCaptureBatch: vi.fn().mockResolvedValue(undefined),
    getCloudBusinessSnapshot: vi.fn().mockResolvedValue(emptySnapshot),
    dispose: vi.fn().mockResolvedValue(undefined),
  }))
  vi.stubGlobal('Function', (...args) => args[1] === 'return import(url)'
    ? () => Promise.resolve({ mountYuanStar: embedMount })
    : nativeFunction(...args))
})

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

it('空背包直接引导导入，养成计划只改变展示，不新增持久化页签', async () => {
  localStorage.setItem('star-tabs', 'review')
  const wrapper = render({ attachTo: document.body })
  await flushPromises()
  await loadStylesheet()
  expect(wrapper.get('.star-empty').text()).toContain('建立你的星石背包')
  expect(wrapper.get('.star-empty').text()).toContain('图片识别过程仅在本机完成')
  expect(wrapper.get('#product-root').classes()).toContain('is-empty-view')
  const root = wrapper.get('#product-root').element
  root.innerHTML = '<p class="review-overview"><span class="inconsistent-warning">未能确认截图中的背包数量或容量，请核对后填写。</span></p>'
  expect(wrapper.get('#product-root').isVisible()).toBe(false)
  expect(wrapper.get('.inconsistent-warning').isVisible()).toBe(false)
  await wrapper.get('.star-empty .link:last-child').trigger('click')
  expect(wrapper.find('.star-empty').exists()).toBe(false)
  expect(wrapper.get('#product-root').element).toBe(root)
  expect(wrapper.get('#product-root').isVisible()).toBe(true)
  expect(wrapper.get('.inconsistent-warning').isVisible()).toBe(true)
  expect(embedMount).toHaveBeenCalledTimes(1)
  expect(importInventory).not.toHaveBeenCalled()
  const options = embedMount.mock.calls[0][1]
  options.onSummaryChange({ currentCount: 3, planCount: 1, gameVersion: '如鸢' })
  await flushPromises()
  expect(wrapper.find('.star-empty').exists()).toBe(false)
  expect(wrapper.get('.star-tabs').attributes('role')).toBe('tablist')
  expect(wrapper.get('#product-root').attributes('aria-labelledby')).toBe('star-tab-bag')
  await wrapper.get('.star-tabs [role="tab"]:last-child').trigger('click')
  expect(wrapper.get('#product-root').classes()).toContain('is-plan-view')
  expect(wrapper.get('#product-root').attributes('role')).toBe('tabpanel')
  expect(wrapper.get('#product-root').attributes('aria-labelledby')).toBe('star-tab-plan')
  expect(wrapper.get('#star-tab-plan').attributes('tabindex')).toBe('0')
  expect(wrapper.find('.star-import-action').exists()).toBe(false)
  expect(wrapper.find('.star-workbench-actions').exists()).toBe(false)
  expect(wrapper.find('.star-import-heading').exists()).toBe(false)
  expect(embedMount.mock.results[0].value.setReviewView).toHaveBeenLastCalledWith('plan')
  expect(localStorage.getItem('star-tabs')).toBe('review')
  expect(embedMount.mock.results[0].value.setActiveTab).toHaveBeenLastCalledWith('review')
  await wrapper.get('.star-tabs [role="tab"]').trigger('click')
  expect(wrapper.get('#product-root').classes()).not.toContain('is-plan-view')
  expect(wrapper.get('.star-tabs [role="tab"]').text()).toBe('背包整理')
  expect(wrapper.find('.star-import-action').exists()).toBe(true)
  wrapper.unmount()
})

it('默认进入背包，导入不再显示冗余标题且保留识别教程与隐私说明', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.star-tabs [role="tab"]').attributes('aria-selected')).toBe('true')
  expect(wrapper.find('.star-availability-note').exists()).toBe(false)
  expect(wrapper.find('.star-privacy-note').exists()).toBe(false)
  expect(wrapper.find('.star-import-stage').exists()).toBe(false)
  await wrapper.get('.star-import-action').trigger('click')
  await loadStylesheet()
  expect(wrapper.find('.star-import-heading').exists()).toBe(false)
  expect(wrapper.find('.star-import-stage').exists()).toBe(false)
  expect(wrapper.get('.star-tutorial-replay').text()).toContain('重新查看识别教程')
  expect(wrapper.findAll('.star-tabs [role="tab"]')).toHaveLength(2)
  expect(wrapper.get('.star-privacy-note').text()).toContain('本机识别')
  expect(wrapper.get('.star-privacy-note').attributes('title')).toBe('图片识别在本机完成。手动截图由浏览器读取；MaaYuan 截图从临时服务器获取。登录后同步背包数据。')
  expect(wrapper.find('.star-availability-note').exists()).toBe(false)
  await wrapper.get('.star-tutorial-replay').trigger('click')
  await flushPromises()
  expect(document.querySelector('.recognition-tour-card')?.textContent).toContain('导入截图')
  wrapper.unmount()
  document.getElementById('yuanstar-embed-styles')?.remove()
})

it('手动核对空背包后切换账号，新账号重新显示导入引导', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  listAccounts.mockResolvedValue([
    { id: 'acc-1', name: '账号 A', game: '如鸢' },
    { id: 'acc-2', name: '账号 B', game: '如鸢' },
  ])
  const wrapper = render({ attachTo: document.body })
  await flushPromises(); await loadStylesheet()
  await wrapper.get('.star-empty .link:last-child').trigger('click')
  expect(wrapper.get('#product-root').isVisible()).toBe(true)
  activeAccount.set('acc-2')
  await flushPromises()
  expect(wrapper.get('.star-empty').isVisible()).toBe(true)
  expect(wrapper.get('#product-root').isVisible()).toBe(false)
  expect(embedMount).toHaveBeenCalledTimes(1)
  expect(importInventory).not.toHaveBeenCalled()
  expect(rebuildStarState).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('OCR 自动切换通知更新共享 tab 高亮，用户手动切换仍调用 embed', async () => {
  const wrapper = render({ attachTo: document.body })
  await flushPromises()
  await loadStylesheet()
  await wrapper.get('.star-import-action').trigger('click')
  wrapper.get('#product-root').element.innerHTML = '<span class="inconsistent-warning">请核对识别结果</span>'
  const options = embedMount.mock.calls[0][1]
  options.onActiveTabChange('review')
  await flushPromises()
  const backpack = wrapper.get('.star-tabs [role="tab"]')
  expect(backpack.attributes('aria-selected')).toBe('true')
  expect(backpack.classes()).toContain('on')
  expect(wrapper.find('.star-import-stage').exists()).toBe(false)
  expect(localStorage.getItem('star-tabs')).toBe('review')
  expect(wrapper.find('.star-empty').exists()).toBe(false)
  expect(wrapper.get('#product-root').isVisible()).toBe(true)
  expect(wrapper.get('.inconsistent-warning').isVisible()).toBe(true)
  const handle = embedMount.mock.results[0].value
  handle.setActiveTab.mockClear()
  await wrapper.get('.star-import-action').trigger('click')
  expect(handle.setActiveTab).toHaveBeenCalledWith('import')
  expect(wrapper.find('.star-import-heading').exists()).toBe(false)
  expect(wrapper.find('.star-import-stage').exists()).toBe(false)
  expect(wrapper.get('.star-tutorial-replay').text()).toContain('重新查看识别教程')
  expect(backpack.attributes('aria-selected')).toBe('false')
  wrapper.unmount()
})

function enableTutorialStatus(identity, hasHistory = false) {
  localStorage.setItem("star-tabs", "import")
  auth.isLoggedIn = true
  auth.userInfo = { id: identity }
  activeAccount.set('acc-1')
  embedMount.mockImplementation(() => ({
    setHostAccount: vi.fn().mockResolvedValue(undefined), setActiveTab: vi.fn(),
    getCloudBusinessSnapshot: vi.fn().mockResolvedValue(emptySnapshot),
    applyCloudBusinessSnapshot: vi.fn().mockResolvedValue(undefined),
    getRecognitionTutorialStatus: vi.fn(() => ({ ready: true, hasHistory })),
    dispose: vi.fn().mockResolvedValue(undefined),
  }))
}

it('empty user auto starts only after hydration, dismissal persists, replay ignores seen and restarts at step 1', async () => {
  function tourText(stage) {
    const element = document.querySelector('.recognition-tour-card')
    expect(element, stage).not.toBeNull()
    return element.textContent
  }
  enableTutorialStatus('recognition-new-user')
  const wrapper = render()
  await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  await loadStylesheet()
  await flushPromises()
  expect(tourText('initial automatic display')).toContain('1 / 6')
  document.querySelector('.recognition-tour-next').click()
  await flushPromises()
  expect(tourText('manual next')).toContain('2 / 6')
  await wrapper.get('.star-tutorial-replay').trigger('click')
  await flushPromises()
  expect(document.querySelector('.recognition-tour-card'), 'replay after close mounts the tutorial').not.toBeNull()
  expect(tourText('replay while open')).toContain('1 / 6')
  document.querySelector('[aria-label="关闭识别教程"]').click()
  await flushPromises()
  expect(localStorage.getItem('yuanhub:star-recognition:v1:recognition-new-user')).toBe('seen')
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  await wrapper.get('.star-tutorial-replay').trigger('click')
  await flushPromises()
  expect(tourText('replay after dismissal')).toContain('1 / 6')
  wrapper.unmount()
  document.getElementById('yuanstar-embed-styles')?.remove()
  const remount = render()
  await flushPromises(); await loadStylesheet()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  expect(remount.find('.star-tutorial-replay').exists()).toBe(true)
})

it.each([['local-history', true, 0], ['remote-history', false, 2]])('experienced %s user stays quiet but can manually replay', async (name, hasHistory, revision) => {
  enableTutorialStatus('recognition-' + name, hasHistory)
  getCurrentStarState.mockResolvedValue({ ...emptyRemote, revision })
  const wrapper = render()
  await flushPromises(); await loadStylesheet()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  await wrapper.get('.star-tutorial-replay').trigger('click')
  await flushPromises()
  expect(document.querySelector('.recognition-tour-card').textContent).toContain('1 / 6')
})

it('cloud failure does not auto introduce a potentially experienced user', async () => {
  enableTutorialStatus('recognition-cloud-failure')
  getCurrentStarState.mockRejectedValue(new Error('offline'))
  const wrapper = render()
  await flushPromises(); await loadStylesheet()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  await wrapper.get('.star-tutorial-replay').trigger('click')
  await flushPromises()
  expect(document.querySelector('.recognition-tour-card').textContent).toContain('1 / 6')
})

it('draft readiness arriving after the first summary is rechecked on embed rendering', async () => {
  vi.useFakeTimers()
  enableTutorialStatus('recognition-delayed-draft')
  const wrapper = render()
  await flushPromises()
  const link = document.getElementById('yuanstar-embed-styles')
  link.dispatchEvent(new Event('load'))
  await flushPromises()
  const handle = embedMount.mock.results[0].value
  // Close the initial test mount; delayed readiness must work for an unseen identity.
  document.querySelector('[aria-label="关闭识别教程"]')?.click()
  await flushPromises()
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: false, hasHistory: false })
  auth.userInfo = { id: 'recognition-delayed-draft-fresh' }
  await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: true, hasHistory: false })
  wrapper.get('#product-root').element.append(document.createElement('div'))
  await vi.advanceTimersByTimeAsync(100)
  await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).not.toBeNull()
})

it('first OCR waits for persisted review, auto starts bag, dismissal stays seen and both replay entries work', async () => {
  vi.useFakeTimers()
  enableTutorialStatus('bag-first-ocr-host')
  const wrapper = render()
  await flushPromises(); await loadStylesheet()
  const options = embedMount.mock.calls[0][1], handle = embedMount.mock.results[0].value
  rebuildStarState.mockResolvedValue({ state: { ...emptyRemote, revision: 1, generation: 1 } })
  await options.onOcrRebuild(emptySnapshot, null)
  options.onSummaryChange({ currentCount: 1, planCount: 0, gameVersion: '如鸢' })
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: true, hasHistory: true })
  options.onActiveTabChange('review')
  await flushPromises()
  expect(document.querySelector('[aria-label="使用教程"]')).toBeNull()
  wrapper.get('#product-root').element.innerHTML = '<section class="ocr-review"><button class="ocr-summary"><em>已保存识别结果，可再次核对</em></button><section data-review-image="first-ocr"></section></section>'
  await vi.advanceTimersByTimeAsync(100); await flushPromises()
  expect(document.querySelector('[aria-label="使用教程"]').textContent).toContain('1 / 6')
  expect(wrapper.get('.star-tutorial-replay').text()).toContain('重新查看使用教程')
  await wrapper.get('.compact-tool-help').trigger('click');await flushPromises()
  expect(wrapper.get('.star-help-tutorial').text()).toContain('重新查看使用教程')
  document.querySelector('[aria-label="关闭使用教程"]').click(); await flushPromises()
  expect(localStorage.getItem('yuanhub:star-bag:v1:bag-first-ocr-host')).toBe('seen')
  wrapper.get('#product-root').element.append(document.createElement('span'))
  await vi.advanceTimersByTimeAsync(100); await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  await wrapper.get('.star-help-tutorial').trigger('click'); await flushPromises()
  expect(document.querySelector('.recognition-tour-card').textContent).toContain('1 / 6')
  document.querySelector('[aria-label="关闭使用教程"]').click(); await flushPromises()
  await wrapper.get('.star-import-action').trigger('click'); await flushPromises()
  expect(wrapper.get('.star-tutorial-replay').text()).toContain('重新查看识别教程')
  await wrapper.get('.star-tutorial-replay').trigger('click'); await flushPromises()
  expect(document.querySelector('.recognition-tour-card').textContent).toContain('1 / 6')
})

it.each(['empty', 'failed-ocr', 'json', 'local-restore', 'unpersisted-review', 'after-ocr-json', 'after-ocr-local-restore', 'after-ocr-history-restore'])('%s cannot substitute for a saved first OCR', async source => {
  vi.useFakeTimers()
  const user = 'bag-non-ocr-' + source
  enableTutorialStatus(user)
  localStorage.setItem('star-tabs', 'review')
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const options = embedMount.mock.calls[0][1], handle = embedMount.mock.results[0].value
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  rebuildStarState.mockResolvedValue({ state: { ...emptyRemote, revision: 1, generation: 1 } })
  // The cloud callback precedes the local OCR commit. A later import/restore must
  // not reuse its pending signal if that local commit never reached review.
  if (source.startsWith('after-ocr-')) await options.onOcrRebuild(emptySnapshot, null)
  if (source === 'failed-ocr') {
    rebuildStarState.mockRejectedValueOnce(Error('save failed'))
    await expect(options.onOcrRebuild(emptySnapshot, null)).rejects.toThrow('还无法确认新背包是否保存成功')
  } else if (source === 'json' || source === 'after-ocr-json') await options.onReplacementImport(emptySnapshot)
  else if (source === 'local-restore' || source === 'after-ocr-local-restore') await options.onRestoreLocalPoint(emptySnapshot)
  else if (source === 'after-ocr-history-restore') {
    const { restoreStarRecoveryPoint } = await import('../src/api/starState.js')
    restoreStarRecoveryPoint.mockResolvedValueOnce({ state: { ...emptyRemote, revision: 2, generation: 2 } })
    await options.onRestoreRecoveryPoint('fixture-point')
  }
  else if (source === 'unpersisted-review') await options.onOcrRebuild(emptySnapshot, null)
  if (source !== 'empty') {
    options.onSummaryChange({ currentCount: 1, planCount: 0, gameVersion: '如鸢' })
    handle.getRecognitionTutorialStatus.mockReturnValue({ ready: true, hasHistory: true })
    wrapper.get('#product-root').element.innerHTML = `<section class="ocr-review"><button class="ocr-summary"><em>${source === 'unpersisted-review' ? '识别后补充检查' : '已保存识别结果，可再次核对'}</em></button><section data-review-image="fixture"></section></section>`
  }
  await vi.advanceTimersByTimeAsync(100); await flushPromises()
  expect(document.querySelector('[aria-label="使用教程"]')).toBeNull()
  expect(localStorage.getItem(`yuanhub:star-bag:v1:${user}`)).toBeNull()
  expect(localStorage.getItem(`yuanhub:star-plan:v1:${user}`)).toBeNull()
})

it('recognition keeps ownership until review handoff; only the dismissed tour is marked seen', async () => {
  vi.useFakeTimers()
  enableTutorialStatus('bag-no-stacked-tours')
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const options = embedMount.mock.calls[0][1], handle = embedMount.mock.results[0].value
  expect(document.querySelector('[aria-label="识别教程"]')).not.toBeNull()
  rebuildStarState.mockResolvedValue({ state: { ...emptyRemote, revision: 1, generation: 1 } })
  await options.onOcrRebuild(emptySnapshot, null)
  options.onSummaryChange({ currentCount: 1, planCount: 0, gameVersion: '如鸢' })
  wrapper.get('#product-root').element.innerHTML = '<section class="ocr-review"><button class="ocr-summary"><em>已保存识别结果，可再次核对</em></button><section data-review-image="fixture"></section></section>'
  await vi.advanceTimersByTimeAsync(100); await flushPromises()
  expect(document.querySelectorAll('.recognition-tour-card')).toHaveLength(1)
  expect(document.querySelector('[aria-label="识别教程"]')).not.toBeNull()
  expect(localStorage.getItem('yuanhub:star-recognition:v1:bag-no-stacked-tours')).toBeNull()
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: true, hasHistory: true })
  options.onActiveTabChange('review')
  await vi.advanceTimersByTimeAsync(100); await flushPromises()
  expect(document.querySelectorAll('.recognition-tour-card')).toHaveLength(1)
  expect(document.querySelector('[aria-label="使用教程"]').textContent).toContain('1 / 6')
  expect(localStorage.getItem('yuanhub:star-recognition:v1:bag-no-stacked-tours')).toBe('seen')
  for (const mode of ['bag', 'plan']) expect(localStorage.getItem(`yuanhub:star-${mode}:v1:bag-no-stacked-tours`)).toBeNull()
})

it('historical bag owner never auto starts even after another OCR, but manual bag replay ignores seen', async () => {
  vi.useFakeTimers()
  enableTutorialStatus('bag-historical-host', true)
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const options = embedMount.mock.calls[0][1]
  options.onSummaryChange({ currentCount: 1, planCount: 0, gameVersion: '如鸢' })
  rebuildStarState.mockResolvedValue({ state: { ...emptyRemote, revision: 1, generation: 1 } })
  await options.onOcrRebuild(emptySnapshot, null)
  wrapper.get('#product-root').element.innerHTML = '<section class="ocr-review"><button class="ocr-summary"><em>已保存识别结果，可再次核对</em></button><section data-review-image="old-ocr"></section></section>'
  options.onActiveTabChange('review')
  await vi.advanceTimersByTimeAsync(100); await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  await wrapper.get('.compact-tool-help').trigger('click');await flushPromises()
  await wrapper.get('.star-help-tutorial').trigger('click'); await flushPromises()
  expect(document.querySelector('.recognition-tour-card').textContent).toContain('1 / 6')
})

it('bag replay reveals the current workspace and filters, and account changes close the old tour', async () => {
  enableTutorialStatus('bag-current-workspace', true)
  localStorage.setItem('star-tabs', 'review')
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: '测试账号', game: '如鸢' }, { id: 'acc-2', name: '另一个', game: '如鸢' }])
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  embedMount.mock.calls[0][1].onSummaryChange({ currentCount: 1, planCount: 0, gameVersion: '如鸢' }); await flushPromises()
  await wrapper.findAll('[role="tab"]')[1].trigger('click')
  expect(wrapper.get('#product-root').classes()).toContain('is-plan-view')
  await wrapper.get('.compact-tool-help').trigger('click');await flushPromises()
  await wrapper.get('.star-help-tutorial').trigger('click'); await flushPromises()
  expect(wrapper.get('#product-root').classes()).not.toContain('is-plan-view')
  expect(wrapper.get('#product-root').classes()).not.toContain('is-empty-view')
  for (let index = 0; index < 2; index++) {
    document.querySelector('.recognition-tour-next').click(); await flushPromises()
  }
  expect(wrapper.get('#product-root').classes()).toContain('filters-open')
  activeAccount.set('acc-2'); await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  expect(localStorage.getItem('yuanhub:star-bag:v1:bag-current-workspace')).toBe('seen')
})

it('bag replay sits beside import; recognition remains in import and growth replay stays in its tab row',async()=>{
  enableTutorialStatus('growth-replay-host',true)
  localStorage.setItem('star-tabs','review')
  const wrapper=render();await flushPromises();await loadStylesheet()
  const options=embedMount.mock.calls[0][1]
  options.onSummaryChange({currentCount:3,planCount:2,gameVersion:'如鸢'});await flushPromises()
  expect(wrapper.get('.star-workbench-header .star-tabs').exists()).toBe(true)
  expect(wrapper.find('.star-workbench-header .star-tutorial-replay').exists()).toBe(false)
  expect(wrapper.get('.star-workbench-actions .star-tutorial-replay').text()).toBe('重新查看使用教程')
  expect(wrapper.findAll('.star-tutorial-replay').map(button=>button.text())).toEqual(['重新查看使用教程'])
  await wrapper.get('.star-workbench-actions .star-tutorial-replay').trigger('click');await flushPromises()
  expect(document.querySelector('[aria-label="使用教程"]')).not.toBeNull()
  expect(embedMount.mock.results[0].value.setActiveTab).toHaveBeenLastCalledWith('review')
  document.querySelector('[aria-label="关闭使用教程"]').click();await flushPromises()
  await wrapper.findAll('.star-tabs [role="tab"]')[1].trigger('click');await flushPromises()
  expect(wrapper.get('.star-workbench-header .star-tutorial-replay').text()).toBe('重新查看养成教程')
  expect(wrapper.find('.star-workbench-actions').exists()).toBe(false)
  await wrapper.get('.star-tutorial-replay').trigger('click');await flushPromises()
  expect(document.querySelector('[aria-label="养成教程"]').textContent).toContain('1 / 6')
  expect(wrapper.get('#product-root').classes()).toContain('is-plan-view')
  document.querySelector('.recognition-tour-next').click();await flushPromises()
  expect(document.querySelector('[aria-label="养成教程"]').textContent).toContain('核对现有资源')
  expect(wrapper.get('#product-root').classes()).toContain('is-plan-view')
  await wrapper.findAll('.star-tabs [role="tab"]')[0].trigger('click');await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  expect(localStorage.getItem('yuanhub:star-plan:v1:growth-replay-host')).toBe('seen')
  await wrapper.get('.star-import-action').trigger('click');await flushPromises()
  expect(wrapper.get('.star-workbench-header .star-tutorial-replay').text()).toBe('重新查看识别教程')
  expect(wrapper.find('.star-workbench-actions').exists()).toBe(false)
  await wrapper.get('.star-tutorial-replay').trigger('click');await flushPromises()
  expect(document.querySelector('[aria-label="识别教程"]').textContent).toContain('1 / 6')
})

it('a tutorial status resolved after an account switch cannot open the old account tour', async () => {
  enableTutorialStatus('recognition-stale-account')
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: '测试账号', game: '如鸢' }, { id: 'acc-2', name: '另一个', game: '如鸢' }])
  const pending = deferred(), status = vi.fn(() => pending.promise)
  const createHandle = embedMount.getMockImplementation()
  embedMount.mockImplementation(() => ({ ...createHandle(), getRecognitionTutorialStatus: status }))
  const wrapper = render(); await flushPromises()
  await loadStylesheet()
  status.mockReturnValue({ ready: false, hasHistory: false })
  activeAccount.set('acc-2'); await flushPromises()
  pending.resolve({ ready: true, hasHistory: false }); await flushPromises()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
})

it('disabled tutorials preserve all read records, initialize no tutorial observer and leave the business workspace usable', async () => {
  tutorialFeature.enabled = false
  enableTutorialStatus('tutorials-disabled-owner')
  const records = ['recognition:v1', 'bag:v1', 'plan:v1', 'onboarding:v2'].map(kind => `yuanhub:star-${kind}:tutorials-disabled-owner`)
  for (const key of records) localStorage.setItem(key, 'seen')
  const observers = vi.spyOn(globalThis, 'MutationObserver')
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const handle = embedMount.mock.results[0].value
  expect(handle.getRecognitionTutorialStatus).not.toHaveBeenCalled()
  expect(observers).not.toHaveBeenCalled()
  expect(wrapper.find('.star-tutorial-replay, .star-help-tutorial').exists()).toBe(false)
  await wrapper.get('.compact-tool-help').trigger('click')
  expect(wrapper.get('.compact-tool-help-content').text()).toContain('核对识别结果')
  expect(wrapper.get('.compact-tool-help-content').text()).toContain('同一账号、同一次背包查看过程的完整原始截图')
  const examples = wrapper.findAll('.star-help-examples button')
  document.body.append(wrapper.element)
  examples[0].element.closest('details').open = true
  examples[0].element.focus()
  await examples[0].trigger('click'); await flushPromises()
  expect(document.querySelector('.recognition-example-panel img').getAttribute('src')).toBe('/tutorial/star/recognition-main-example.jpg')
  document.querySelector('[aria-label="关闭示例图片"]').click(); await flushPromises()
  expect(document.activeElement).toBe(examples[0].element)
  await examples[1].trigger('click'); await flushPromises()
  expect(document.querySelector('.recognition-example-panel').textContent).toContain('重复出现的同一整行')
  document.querySelector('[aria-label="关闭示例图片"]').click(); await flushPromises()
  await wrapper.findAll('[role="tab"]')[0].trigger('click')
  await wrapper.get('.star-import-action').trigger('click')
  expect(handle.setActiveTab).toHaveBeenLastCalledWith('import')
  expect(document.querySelector('.recognition-tour, .bag-tutorial-demo')).toBeNull()
  for (const key of records) expect(localStorage.getItem(key)).toBe('seen')
  expect(embedMount.mock.calls[0][1].completion.enabled).toBe(true)
})

it('empty bag replay explains import without creating fixtures, changing pages or performing writes', async () => {
  enableTutorialStatus('empty-bag-replay', true)
  localStorage.setItem('star-tabs', 'review')
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const handle = embedMount.mock.results[0].value
  const switches = handle.setActiveTab.mock.calls.length
  await wrapper.get('.compact-tool-help').trigger('click')
  await wrapper.get('.star-help-tutorial').trigger('click')
  expect(wrapper.get('.star-empty-tutorial').text()).toContain('可以先导入截图')
  expect(wrapper.get('.star-empty').isVisible()).toBe(true)
  expect(document.querySelector('.recognition-tour-card, .bag-tutorial-demo')).toBeNull()
  expect(handle.setActiveTab).toHaveBeenCalledTimes(switches)
  expect(wrapper.get('.tool-summary').text()).toContain('当前背包 0 颗')
  expect(rebuildStarState).not.toHaveBeenCalled()
  expect(importInventory).not.toHaveBeenCalled()
  const api = await import('../src/api/starState.js')
  expect(api.patchCurrentStarState).not.toHaveBeenCalled()
  expect(api.restoreStarRecoveryPoint).not.toHaveBeenCalled()
  await wrapper.get('.star-empty-tutorial .link').trigger('click')
  expect(wrapper.find('.star-empty-tutorial').exists()).toBe(false)
  await wrapper.get('.star-help-tutorial').trigger('click')
  expect(wrapper.find('.star-empty-tutorial').exists()).toBe(true)
  await wrapper.get('.star-empty-tutorial .primary').trigger('click')
  expect(handle.setActiveTab).toHaveBeenLastCalledWith('import')
})

it('legacy main recognition preference suppresses auto replay without marking bag or plan read', async () => {
  enableTutorialStatus('main-preference-owner')
  localStorage.setItem('yuanhub:star-onboarding:v2:main-preference-owner', 'seen')
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  for (const mode of ['recognition', 'bag', 'plan']) expect(localStorage.getItem(`yuanhub:star-${mode}:v1:main-preference-owner`)).toBeNull()
  await wrapper.get('.star-tutorial-replay').trigger('click')
  expect(document.querySelector('.recognition-tour-card').textContent).toContain('1 / 6')
})

it.each(['throw', 'unknown-history', 'running'])('unsafe %s status never auto opens a tutorial and explicit manual paging stays available', async kind => {
  enableTutorialStatus('unsafe-status-' + kind)
  const createHandle = embedMount.getMockImplementation()
  embedMount.mockImplementation(root => ({ ...createHandle(),
    setActiveTab: vi.fn(() => { if (kind === 'running') root.innerHTML = '<button data-start-ocr>取消识别</button>' }),
    getRecognitionTutorialStatus: vi.fn(() => {
      if (kind === 'throw') throw Error('status unavailable')
      return { ready: true, ...(kind === 'unknown-history' ? {} : { hasHistory: false }) }
    }),
  }))
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  expect(document.querySelector('.recognition-tour-card')).toBeNull()
  if (kind !== 'running') {
    await wrapper.get('.star-tutorial-replay').trigger('click')
    expect(document.querySelector('.recognition-tour-card').textContent).toContain('1 / 6')
  }
})

it('样式加载失败可重试，失败链接不会阻挡下一次加载', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.findComponent({ name: 'DataAccountContextBar' }).props('isLoggedIn')).toBe(false)
  document.getElementById('yuanstar-embed-styles').dispatchEvent(new Event('error'))
  await flushPromises()
  expect(document.getElementById('yuanstar-embed-styles')).toBeNull()
  expect(wrapper.get('.yuanstar-mount-error[role="alert"]').text()).toContain('重试加载')

  await wrapper.get('.yuanstar-mount-error button').trigger('click')
  await loadStylesheet()
  expect(embedMount).toHaveBeenCalledTimes(1)
  expect(wrapper.find('.yuanstar-mount-error').exists()).toBe(false)
  wrapper.unmount()
})

it('首次云端读取失败后显示重试，重试成功后清除错误', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  getCurrentStarState.mockRejectedValueOnce(new Error('offline'))
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(wrapper.get('.star-sync-state').text()).toContain('暂时无法读取云端背包')
  expect(wrapper.get('.star-sync-state').classes()).toContain('is-error')
  expect(wrapper.get('.star-sync-retry').text()).toBe('重试')

  await wrapper.get('.star-sync-retry').trigger('click')
  await flushPromises()
  expect(getCurrentStarState).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.star-sync-state.is-error').exists()).toBe(false)
  expect(wrapper.get('.star-sync-meta[role="status"]').text()).toBe('已同步')
  expect(wrapper.get('.star-sync-meta svg').attributes('aria-hidden')).toBe('true')
  expect(wrapper.get('.star-sync-meta').attributes('title')).toBe('星石云端状态已保存')
  wrapper.unmount()
})

it('挂载后账号同步失败会释放旧实例，重试只保留一个产品实例', async () => {
  const first = {
    setHostAccount: vi.fn().mockRejectedValue(new Error('账号初始化失败')),
    setActiveTab: vi.fn(), dispose: vi.fn().mockResolvedValue(undefined),
  }
  const second = {
    setHostAccount: vi.fn().mockResolvedValue(undefined), setActiveTab: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  embedMount.mockReturnValueOnce(first).mockReturnValueOnce(second)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(wrapper.get('.yuanstar-mount-error').text()).toContain('账号初始化失败')
  expect(first.dispose).toHaveBeenCalledTimes(1)

  await wrapper.get('.yuanstar-mount-error button').trigger('click')
  await flushPromises()
  expect(embedMount).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.yuanstar-mount-error').exists()).toBe(false)
  wrapper.unmount()
})

it('持久 review 等待账号准备，加载中切页只保留最新偏好', async () => {
  localStorage.setItem('star-tabs', 'review')
  const gate = deferred()
  const createHandle = embedMount.getMockImplementation()
  const handle = createHandle()
  handle.setHostAccount.mockReturnValue(gate.promise)
  embedMount.mockReturnValue(handle)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(handle.setActiveTab).not.toHaveBeenCalled()
  const tabs = wrapper.findAll('.star-tabs [role="tab"]')
  await wrapper.get('.star-import-action').trigger('click')
  expect(localStorage.getItem('star-tabs')).toBe('import')
  await tabs[0].trigger('click')
  expect(handle.setActiveTab).not.toHaveBeenCalled()
  gate.resolve()
  await flushPromises()
  expect(handle.setActiveTab).toHaveBeenCalledTimes(1)
  expect(handle.setActiveTab).toHaveBeenCalledWith('review')
  expect(tabs[0].attributes('aria-selected')).toBe('true')
  wrapper.unmount()
})

it('恢复期间真实切账号只为最新账号读取云状态并应用页签', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  listAccounts.mockResolvedValue([
    { id: 'acc-1', name: '账号 A', game: '如鸢' },
    { id: 'acc-2', name: '账号 B', game: '代号鸢' },
  ])
  localStorage.setItem('star-tabs', 'review')
  const gate = deferred()
  const handle = embedMount.getMockImplementation()()
  handle.setHostAccount.mockImplementation(host => host.accountId === 'acc-1' ? gate.promise : Promise.resolve())
  embedMount.mockReturnValue(handle)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  activeAccount.set('acc-2')
  await flushPromises()
  gate.resolve()
  await flushPromises()
  expect(handle.setHostAccount).toHaveBeenLastCalledWith({ accountId: 'acc-2', displayName: '账号 B', gameVersion: '代号鸢' })
  expect(getCurrentStarState).toHaveBeenCalledTimes(1)
  expect(getCurrentStarState).toHaveBeenCalledWith('acc-2')
  expect(handle.setActiveTab).toHaveBeenCalledTimes(1)
  expect(handle.setActiveTab).toHaveBeenCalledWith('review')
  wrapper.unmount()
})

it('卸载期间账号准备晚到不会切页或继续读取云状态', async () => {
  const gate = deferred()
  const handle = embedMount.getMockImplementation()()
  handle.setHostAccount.mockReturnValue(gate.promise)
  embedMount.mockReturnValue(handle)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  wrapper.unmount()
  gate.resolve()
  await flushPromises()
  expect(handle.dispose).toHaveBeenCalledTimes(1)
  expect(handle.setActiveTab).not.toHaveBeenCalled()
  expect(handle.getCloudBusinessSnapshot).not.toHaveBeenCalled()
  expect(getCurrentStarState).not.toHaveBeenCalled()
})

it('没有持久化证明时保留路由和重试入口，重试成功后展示跨版本告警', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  navigation.route.query = { account_id: 'acc-1', capture_id: 'capture-1', tab: 'import' }
  isStarCaptureDraftPersisted.mockResolvedValueOnce(false).mockResolvedValue(true)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  const handle = embedMount.mock.results[0].value
  expect(wrapper.get('.star-sync-state').text()).toContain('未保存或已被其他操作替换')
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(localStorage.getItem(STAR_CAPTURE_LIFECYCLE_KEY)).toBeNull()
  expect(consumeStarCapture).not.toHaveBeenCalled()
  expect(wrapper.get('.star-sync-retry').text()).toBe('重试导入')
  await wrapper.get('.star-sync-retry').trigger('click')
  await flushPromises()
  expect(handle.importCaptureBatch).toHaveBeenCalledTimes(2)
  expect(getStarCaptureManifest).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.star-sync-state').text()).not.toContain('三段截图已导入')
  expect(wrapper.get('.star-sync-state').text()).toContain('截图版本为“代号鸢”')
  expect(wrapper.get('.star-sync-state').text()).toContain('当前工作区为“如鸢”')
  expect(JSON.parse(localStorage.getItem(STAR_CAPTURE_LIFECYCLE_KEY)).records['acc-1'].state).toBe('imported')
  expect(navigation.replace).toHaveBeenCalledWith({ path: '/star', query: { tab: 'import' }, hash: '' })
  expect(consumeStarCapture).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('存储核对晚到成功时已换账号，不标记旧批次、不清路由也不误报成功', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  listAccounts.mockResolvedValue([
    { id: 'acc-1', name: '账号 A', game: '如鸢' },
    { id: 'acc-2', name: '账号 B', game: '如鸢' },
  ])
  navigation.route.query = { account_id: 'acc-1', capture_id: 'capture-1' }
  const gate = deferred()
  isStarCaptureDraftPersisted.mockReturnValue(gate.promise)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(isStarCaptureDraftPersisted).toHaveBeenCalledTimes(1)
  activeAccount.set('acc-2')
  await flushPromises()
  gate.resolve(true)
  await flushPromises()
  expect(localStorage.getItem(STAR_CAPTURE_LIFECYCLE_KEY)).toBeNull()
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('三段截图已导入')
  expect(wrapper.text()).not.toContain('截图版本为')
  expect(consumeStarCapture).not.toHaveBeenCalled()
  wrapper.unmount()
})

it.each([true, false])('旧 imported 缓存仍需 Draft 证明（持久化=%s）才能报告恢复', async persisted => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  navigation.route.query = { account_id: 'acc-1', capture_id: 'capture-1' }
  localStorage.setItem(STAR_CAPTURE_LIFECYCLE_KEY, JSON.stringify({ version: 1, records: {
    'acc-1': { accountId: 'acc-1', captureId: 'capture-1', state: 'imported', updatedAt: 123 },
  } }))
  isStarCaptureDraftPersisted.mockResolvedValue(persisted)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(isStarCaptureDraftPersisted).toHaveBeenCalledWith('acc-1', { captureId: 'capture-1' })
  if (persisted) {
    expect(wrapper.get('.star-sync-state').text()).toContain('已找回上次待识别的截图')
    expect(getStarCaptureManifest).not.toHaveBeenCalled()
    expect(navigation.replace).toHaveBeenCalledTimes(1)
  } else {
    expect(wrapper.text()).not.toContain('已找回上次待识别的截图')
    expect(wrapper.get('.star-sync-retry').text()).toBe('重试导入')
    expect(getStarCaptureManifest).toHaveBeenCalledTimes(1)
    expect(navigation.replace).not.toHaveBeenCalled()
  }
  expect(consumeStarCapture).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('持久化核对在卸载后返回不标记 imported、不清路由、不 consume', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  navigation.route.query = { account_id: 'acc-1', capture_id: 'capture-1' }
  const gate = deferred()
  isStarCaptureDraftPersisted.mockReturnValue(gate.promise)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(isStarCaptureDraftPersisted).toHaveBeenCalledTimes(1)
  wrapper.unmount()
  gate.resolve(true)
  await flushPromises()
  expect(localStorage.getItem(STAR_CAPTURE_LIFECYCLE_KEY)).toBeNull()
  expect(navigation.replace).not.toHaveBeenCalled()
  expect(consumeStarCapture).not.toHaveBeenCalled()
})

it('账号列表在卸载后晚到不覆盖全局账号、不订阅事件、不启动 embed', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  const gate = deferred()
  listAccounts.mockReturnValueOnce(gate.promise)
  const wrapper = render()
  await flushPromises()
  wrapper.unmount()
  activeAccount.set('acc-2')
  gate.resolve([{ id: 'acc-1', name: '旧账号', game: '如鸢' }])
  await flushPromises()
  expect(activeAccount.id).toBe('acc-2')
  expect(subscribeAccountEvents).not.toHaveBeenCalled()
  expect(embedMount).not.toHaveBeenCalled()
  expect(getCurrentStarState).not.toHaveBeenCalled()
})

it('已登录但没有子账号时保持本机工作区，不读取任意账号云状态', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  listAccounts.mockResolvedValueOnce([])
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(activeAccount.id).toBe('')
  const handle = embedMount.mock.results[0].value
  expect(handle.setHostAccount).toHaveBeenCalledWith(null)
  expect(getCurrentStarState).not.toHaveBeenCalled()
  await wrapper.findAll('.star-tabs [role="tab"]')[1].trigger('click')
  expect(handle.setActiveTab).toHaveBeenLastCalledWith('review')
  wrapper.unmount()
})

it('旧账号云读取晚到不得应用旧数据，最新账号准备后才切页', async () => {
  auth.isLoggedIn = true
  activeAccount.set('acc-1')
  listAccounts.mockResolvedValueOnce([
    { id: 'acc-1', name: '账号 A', game: '如鸢' },
    { id: 'acc-2', name: '账号 B', game: '如鸢' },
  ])
  const gate = deferred()
  getCurrentStarState.mockImplementation(id => id === 'acc-1' ? gate.promise : Promise.resolve(emptyRemote))
  const handle = embedMount.getMockImplementation()()
  handle.applyCloudBusinessSnapshot = vi.fn()
  embedMount.mockReturnValue(handle)
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(getCurrentStarState).toHaveBeenCalledWith('acc-1')
  expect(handle.setActiveTab).not.toHaveBeenCalled()
  activeAccount.set('acc-2')
  await flushPromises()
  gate.resolve({ ...emptyRemote, revision: 7, inventory: [{ instance_id: 'old-a', kind: 'main', name: '天府', quality: 'orange', level: 30 }] })
  await flushPromises()
  expect(getCurrentStarState).toHaveBeenCalledWith('acc-2')
  expect(handle.applyCloudBusinessSnapshot).not.toHaveBeenCalled()
  expect(handle.setHostAccount).toHaveBeenLastCalledWith({ accountId: 'acc-2', displayName: '账号 B', gameVersion: '如鸢' })
  expect(handle.setActiveTab).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('切换准备期间不显示旧背包或摘要；OCR拒绝切换会保留原账号和解释', async () => {
  auth.isLoggedIn = true; activeAccount.set('acc-1')
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: 'A', game: '如鸢' }, { id: 'acc-2', name: 'B', game: '代号鸢' }])
  const handle = embedMount.getMockImplementation()(); embedMount.mockReturnValue(handle)
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const gate = deferred(); handle.setHostAccount.mockImplementationOnce(() => gate.promise)
  activeAccount.set('acc-2'); await flushPromises()
  expect(wrapper.get('#product-root').isVisible()).toBe(false)
  expect(wrapper.get('.tool-summary').text()).not.toContain('当前背包')
  gate.resolve(); await flushPromises()
  expect(wrapper.get('.tool-summary').text()).toContain('当前背包')
  handle.setHostAccount.mockRejectedValueOnce(new Error('识别进行中，暂不能切换账号。'))
  activeAccount.set('acc-1'); await flushPromises()
  expect(activeAccount.id).toBe('acc-2')
  expect(wrapper.findComponent({ name: 'DataAccountContextBar' }).props('error')).toContain('识别进行中')
})

it('原地改名只更新导出元数据，不重入 Host 或丢失本地草稿', async () => {
  const { publishAccountList } = await import('../src/store/accountList.js')
  auth.isLoggedIn = true; auth.userInfo = { id: 'export-owner' }
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const handle = embedMount.mock.results[0].value
  const payload = { schemaVersion: 1, accountDisplayName: '测试账号', gameVersion: '如鸢', inventory: [{ name: '星石' }] }
  handle.exportDataExchange = vi.fn(() => ({ blob: { text: async () => JSON.stringify(payload) }, filename: 'YuanStar_测试账号_2026-10-06.json' }))
  const create = vi.fn(() => 'blob:synthetic-export')
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const hostCalls = handle.setHostAccount.mock.calls.length
  publishAccountList([{ id: 'acc-1', name: '原地改名', game: '如鸢' }]); await flushPromises()
  await wrapper.get('.archive-toggle').trigger('click')
  wrapper.findComponent({ name: 'ArchiveExchangePanel' }).vm.$emit('export'); await flushPromises()
  expect(handle.setHostAccount).toHaveBeenCalledTimes(hostCalls)
  expect(click).toHaveBeenCalledTimes(1)
  expect(click.mock.instances[0].download).toBe('YuanStar_原地改名_2026-10-06.json')
  // jsdom Blob is not a native browser Blob; inspect serialization with FileReader.
  const blob = create.mock.calls[0][0]
  const text = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob) })
  expect(JSON.parse(text)).toEqual({ ...payload, accountDisplayName: '原地改名' })
  // Let URL cleanup finish before the per-test globals are restored.
  await new Promise(resolve => window.setTimeout(resolve, 0))
})

it.each(['switch', 'roundtrip', 'identity', 'unmount'])('导出 Blob 等待期间 %s 不下载旧账号档案', async change => {
  auth.isLoggedIn = true; auth.userInfo = { id: 'export-owner' }
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: '测试账号', game: '如鸢' }, { id: 'acc-2', name: '另一个', game: '如鸢' }])
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const handle = embedMount.mock.results[0].value, gate = deferred()
  handle.exportDataExchange = vi.fn(() => ({ blob: { text: () => gate.promise }, filename: 'YuanStar_测试账号_2026-10-06.json' }))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await wrapper.get('.archive-toggle').trigger('click')
  wrapper.findComponent({ name: 'ArchiveExchangePanel' }).vm.$emit('export'); await flushPromises()
  if (change === 'unmount') wrapper.unmount()
  else if (change === 'identity') { auth.userInfo = { id: 'other-owner' }; auth.userInfo = { id: 'export-owner' } }
  else { activeAccount.set('acc-2'); if (change === 'roundtrip') activeAccount.set('acc-1') }
  gate.resolve(JSON.stringify({ schemaVersion: 1, accountDisplayName: '旧名', inventory: [] })); await flushPromises()
  expect(click).not.toHaveBeenCalled()
})

async function growthHostFixture(userId) {
  auth.isLoggedIn = true; auth.userInfo = { id: userId }
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: 'A', game: '如鸢' }, { id: 'acc-2', name: 'B', game: '如鸢' }])
  let count = 3, baseline = null
  getCurrentInventory.mockImplementation(async ({ accountId }) => [{ account_id: accountId, entity_type: 'item', entries: { jiezheping: { count, listed_baseline_at: baseline }, baijinbi: { count: 999 } } }])
  importInventory.mockImplementation(async doc => { baseline = doc.records[0].effective_at; return { accepted: 1 } })
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  return { wrapper, callbacks: embedMount.mock.calls.at(-1)[1], setCount: value => { count = value } }
}
it('瓶子冲突宿主锁定切号，接受后恢复并用新记录保存明确0', async () => {
  const f = await growthHostFixture('growth-host-accept')
  await expect(f.callbacks.onSaveBreakthroughInventory('acc-1', 'jiezheping', 10)).rejects.toMatchObject({ inventoryPending: { phase: 'conflict', canAccept: true } })
  await flushPromises()
  const bar = () => f.wrapper.findComponent({ name: 'DataAccountContextBar' })
  expect(bar().props('switchDisabled')).toBe(true)
  await expect(f.callbacks.onReadBreakthroughInventory('acc-1')).rejects.toThrow('不一致')
  expect(importInventory).toHaveBeenCalledTimes(1)
  f.setCount(8)
  expect((await f.callbacks.onAcceptBreakthroughInventory('acc-1', 'jiezheping', 10)).jiezheping).toBe(8)
  await flushPromises(); expect(bar().props('switchDisabled')).toBe(false)
  f.setCount(0); await f.callbacks.onSaveBreakthroughInventory('acc-1', 'jiezheping', 0)
  expect(importInventory).toHaveBeenCalledTimes(2)
  const records = importInventory.mock.calls.map(([doc]) => doc.records[0])
  expect(records[0].record_id).not.toBe(records[1].record_id)
  expect(records[1].entries).toEqual([{ id: 'jiezheping', name: '解谪瓶', count: 0 }])
  expect(getCurrentInventory.mock.calls.at(-1)[1]).toEqual({ expectedUserId: 'growth-host-accept', fresh: true })
  f.wrapper.unmount()
})
it('未确认瓶子保存卸载重挂后保留原记录', async () => {
  const f = await growthHostFixture('growth-host-remount')
  importInventory.mockRejectedValueOnce(new TypeError('POST lost'))
  const failed = await f.callbacks.onSaveBreakthroughInventory('acc-1', 'jiezheping', 10).catch(error => error)
  expect(failed.message).toContain('库存写入结果尚未确认'); expect(failed.cause.message).toBe('POST lost')
  const original = JSON.stringify(importInventory.mock.calls[0][0])
  f.wrapper.unmount(); await flushPromises(); document.getElementById('yuanstar-embed-styles')?.remove()
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  const callbacks = embedMount.mock.calls.at(-1)[1]
  await expect(callbacks.onReadBreakthroughInventory('acc-1')).rejects.toMatchObject({ inventoryPending: { phase: 'unconfirmed' } })
  f.setCount(10)
  importInventory.mockResolvedValue({ duplicates: 1 })
  await callbacks.onSaveBreakthroughInventory('acc-1', 'jiezheping', 10)
  expect(JSON.stringify(importInventory.mock.calls.at(-1)[0])).toBe(original)
  wrapper.unmount()
})
it.each(['account', 'roundtrip', 'identity', 'unmount'])('瓶子读回期间 %s 废弃过期响应且保留已确认记录', async action => {
  const f = await growthHostFixture('growth-host-stale-' + action)
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: 'A', game: '如鸢' }, { id: 'acc-2', name: 'B', game: '如鸢' }])
  const gate = deferred(); let reads = 0
  getCurrentInventory.mockImplementation(async () => ++reads === 1 ? [{ account_id: 'acc-1', entity_type: 'item', entries: {} }] : gate.promise)
  const outcome = f.callbacks.onSaveBreakthroughInventory('acc-1', 'jiezheping', 10).catch(error => error)
  await flushPromises()
  if (action === 'unmount') f.wrapper.unmount()
  else if (action === 'identity') { auth.userInfo = { id: 'other' }; auth.userInfo = { id: 'growth-host-stale-' + action } }
  else { activeAccount.set('acc-2'); if (action === 'roundtrip') activeAccount.set('acc-1') }
  gate.resolve([{ account_id: 'acc-1', entity_type: 'item', entries: { jiezheping: { count: 10 } } }])
  expect(await outcome).toMatchObject({ inventoryPending: { phase: 'acknowledged' } })
  expect(importInventory).toHaveBeenCalledTimes(1)
  f.wrapper.unmount()
})

it('外部切到有效B账号不应用A的pending，返回A只核对原已确认记录', async () => {
  const f = await growthHostFixture('growth-host-account-isolation')
  const stock = { 'acc-1': { count: 3, baseline: null }, 'acc-2': { count: 7, baseline: null } }
  getCurrentInventory.mockImplementation(async ({ accountId }) => [{ account_id: accountId, entity_type: 'item', entries: { jiezheping: { count: stock[accountId].count, listed_baseline_at: stock[accountId].baseline }, baijinbi: { count: accountId === 'acc-1' ? 111 : 222 } } }])
  importInventory.mockImplementation(async doc => {
    const record = doc.records[0]; stock[record.account_id].baseline = record.effective_at
    if (record.account_id === 'acc-2') stock['acc-2'].count = record.entries[0].count
    return { accepted: 1 }
  })
  await expect(f.callbacks.onSaveBreakthroughInventory('acc-1', 'jiezheping', 10)).rejects.toMatchObject({ inventoryPending: { accountId: 'acc-1', phase: 'conflict' } })
  activeAccount.set('acc-2'); await flushPromises()
  expect(f.wrapper.findComponent({ name: 'DataAccountContextBar' }).props('switchDisabled')).toBe(false)
  expect((await f.callbacks.onReadBreakthroughInventory('acc-2')).jiezheping).toBe(7)
  await expect(f.callbacks.onAcceptBreakthroughInventory('acc-1', 'jiezheping', 10)).rejects.toThrow('账号已切换')
  expect((await f.callbacks.onSaveBreakthroughInventory('acc-2', 'jiezheping', 0)).jiezheping).toBe(0)
  expect(importInventory.mock.calls.map(([doc]) => doc.records[0].account_id)).toEqual(['acc-1', 'acc-2'])
  activeAccount.set('acc-1'); await flushPromises()
  await expect(f.callbacks.onReadBreakthroughInventory('acc-1')).rejects.toMatchObject({ inventoryPending: { accountId: 'acc-1', count: 10, currentCount: 3 } })
  await f.callbacks.onAcceptBreakthroughInventory('acc-1', 'jiezheping', 10)
  await flushPromises(); expect(f.wrapper.findComponent({ name: 'DataAccountContextBar' }).props('switchDisabled')).toBe(false)
  expect(importInventory).toHaveBeenCalledTimes(2); expect(stock['acc-2'].count).toBe(0)
  f.wrapper.unmount()
})

it.each([[390, 1440], [1440, 390]])('宿主 %i→%i 保持唯一嵌入、计划视图与焦点且不读写', async (from, to) => {
  const previousWidth = window.innerWidth
  window.innerWidth = from
  const wrapper = render({ attachTo: document.body })
  try {
    await flushPromises(); await loadStylesheet()
    embedMount.mock.calls[0][1].onSummaryChange({ currentCount: 3, planCount: 1, gameVersion: '如鸢' })
    await flushPromises()
    await wrapper.get('#star-tab-plan').trigger('click')
    wrapper.get('#star-tab-plan').element.focus()
    const root = wrapper.get('#product-root').element
    const handle = embedMount.mock.results[0].value
    const calls = [listAccounts, getCurrentStarState, importInventory, handle.setHostAccount, handle.setReviewView].map(fn => fn.mock.calls.length)
    window.innerWidth = to
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(embedMount).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('#product-root')).toHaveLength(1)
    expect(wrapper.get('#product-root').element).toBe(root)
    expect(wrapper.get('#product-root').classes()).toContain('is-plan-view')
    expect(wrapper.get('#star-tab-plan').attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(wrapper.get('#star-tab-plan').element)
    expect([listAccounts, getCurrentStarState, importInventory, handle.setHostAccount, handle.setReviewView].map(fn => fn.mock.calls.length)).toEqual(calls)
    expect(handle.dispose).not.toHaveBeenCalled()
  } finally { wrapper.unmount(); window.innerWidth = previousWidth }
})
