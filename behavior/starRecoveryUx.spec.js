import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import StarPage from '../src/pages/star/index.vue'
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

function render() {
  return mount(StarPage, { global: {
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
    setHostAccount: vi.fn().mockResolvedValue(undefined), setActiveTab: vi.fn(),
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
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  expect(wrapper.get('.star-empty').text()).toContain('建立你的星石背包')
  expect(wrapper.get('.star-empty').text()).toContain('图片识别过程仅在本机完成')
  expect(wrapper.get('#product-root').classes()).toContain('is-empty-view')
  expect(wrapper.get('#product-root').isVisible()).toBe(true)
  const options = embedMount.mock.calls[0][1]
  options.onSummaryChange({ currentCount: 3, planCount: 1, gameVersion: '如鸢' })
  await flushPromises()
  expect(wrapper.find('.star-empty').exists()).toBe(false)
  await wrapper.get('.star-tabs [role="tab"]:last-child').trigger('click')
  expect(wrapper.get('#product-root').classes()).toContain('is-plan-view')
  expect(localStorage.getItem('star-tabs')).toBe('review')
  expect(embedMount.mock.results[0].value.setActiveTab).toHaveBeenLastCalledWith('review')
  await wrapper.get('.star-tabs [role="tab"]').trigger('click')
  expect(wrapper.get('#product-root').classes()).not.toContain('is-plan-view')
  wrapper.unmount()
})

it('默认直接进入背包，截图识别阶段与隐私说明仅在导入流程出现', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.star-tabs [role="tab"]').attributes('aria-selected')).toBe('true')
  expect(wrapper.find('.star-availability-note').exists()).toBe(false)
  expect(wrapper.find('.star-privacy-note').exists()).toBe(false)
  expect(wrapper.find('.star-import-stage').exists()).toBe(false)
  await wrapper.get('.star-import-action').trigger('click')
  expect(wrapper.get('.star-import-stage').text()).toBe('截图识别')
  expect(wrapper.findAll('.star-tabs [role="tab"]')).toHaveLength(2)
  expect(wrapper.get('.star-privacy-note').text()).toContain('本机识别与保存')
  expect(wrapper.get('.star-privacy-note').attributes('title')).toBe('截图在本机识别与保存；登录后同步背包数据。')
  await wrapper.get('.star-help-trigger').trigger('click')
  const panel = document.querySelector('[aria-labelledby="star-help-title"]')
  expect(panel.textContent).toContain('手机和电脑网页端均可手动上传')
  expect(panel.textContent).toContain('MaaYuan 星石自动采集仍在接入中')
  expect(wrapper.find('.star-availability-note').exists()).toBe(false)
  wrapper.unmount()
  document.getElementById('yuanstar-embed-styles')?.remove()
})

it('OCR 自动切换通知更新共享 tab 高亮，用户手动切换仍调用 embed', async () => {
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  await wrapper.get('.star-import-action').trigger('click')
  const options = embedMount.mock.calls[0][1]
  options.onActiveTabChange('review')
  await flushPromises()
  const backpack = wrapper.get('.star-tabs [role="tab"]')
  expect(backpack.attributes('aria-selected')).toBe('true')
  expect(backpack.classes()).toContain('on')
  expect(wrapper.find('.star-import-stage').exists()).toBe(false)
  expect(localStorage.getItem('star-tabs')).toBe('review')
  const handle = embedMount.mock.results[0].value
  handle.setActiveTab.mockClear()
  await wrapper.get('.star-import-action').trigger('click')
  expect(handle.setActiveTab).toHaveBeenCalledWith('import')
  expect(wrapper.get('.star-import-stage').text()).toBe('截图识别')
  expect(backpack.attributes('aria-selected')).toBe('false')
  wrapper.unmount()
})

function enableTutorialStatus(identity, hasHistory = false) {
  localStorage.setItem('star-tabs', 'import')
  auth.isLoggedIn = true; auth.userInfo = { id: identity }; activeAccount.set('acc-1')
  embedMount.mockImplementation(root => ({
    setHostAccount: vi.fn().mockResolvedValue(undefined),
    importCaptureBatch: vi.fn().mockResolvedValue(undefined),
    setActiveTab: vi.fn(tab => { if (tab === 'import' && !root.querySelector('[data-start-ocr]')) root.innerHTML = '<button id="file-drop-zone">上传</button><section class="import-pool"><button data-confirm-pool>确认本池</button></section><button data-confirm-all-pools>确认全部</button><button data-start-ocr disabled>开始识别</button>' }),
    getCloudBusinessSnapshot: vi.fn().mockResolvedValue(emptySnapshot),
    applyCloudBusinessSnapshot: vi.fn().mockResolvedValue(undefined),
    getRecognitionTutorialStatus: vi.fn(() => ({ ready: true, hasHistory })),
    dispose: vi.fn().mockResolvedValue(undefined),
  }))
}
const tour = () => document.querySelector('.recognition-tour-card')
const help = () => document.querySelector('[aria-labelledby="star-help-title"]')
function clickText(panel, text) { const button = [...panel.querySelectorAll('button')].find(button => button.textContent === text); expect(button).toBeTruthy(); button.click() }
async function replay(wrapper) {
  await wrapper.get('.star-help-trigger').trigger('click'); await flushPromises()
  help().querySelectorAll('.star-help-content > details')[3].open = true
  clickText(help(), '重新查看当前引导'); await flushPromises()
}
function addUnconfirmed(root) { root.querySelector('.import-pool').insertAdjacentHTML('beforeend', '<article data-import-image="one" class="thumbnail-card is-unconfirmed"></article>') }
async function tick() { await vi.advanceTimersByTimeAsync(100); await flushPromises() }

it.each([
  ['import', 0, '重新查看识别教程', '先上传截图'],
  ['review', 0, '重新查看使用教程', '先上传截图'],
  ['review', 1, '重新查看使用教程', '先检查识别异常'],
])('独立教程入口在 %s、%i 颗星石时直接呼出当前引导，不经过帮助或改变已读偏好', async (tab, count, label, title) => {
  vi.useFakeTimers(); enableTutorialStatus('direct-tutorial', true)
  localStorage.setItem('star-tabs', tab)
  const key = 'yuanhub:star-onboarding:v2:direct-tutorial'
  localStorage.setItem(key, 'seen')
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.star-tutorial-replay').attributes('disabled')).toBeDefined()
  await loadStylesheet(); await tick()
  if (count) {
    embedMount.mock.calls[0][1].onSummaryChange({ currentCount: count, planCount: 0, gameVersion: '如鸢' })
    wrapper.get('#product-root').element.innerHTML = '<section class="ocr-review"><button id="toggle-ocr-review">识别结果核对</button></section>'
    await tick()
  }
  const button = wrapper.get('.star-tutorial-replay')
  expect(button.isVisible()).toBe(true)
  expect(button.text()).toBe('使用教程')
  expect(tour()).toBeNull()
  await button.trigger('click'); await tick()
  expect(help()).toBeNull()
  expect(tour().textContent).toContain(title)
  expect(localStorage.getItem(key)).toBe('seen')
  expect(embedMount.mock.results[0].value.importCaptureBatch).not.toHaveBeenCalled()
  const api = await import('../src/api/starState.js')
  for (const write of [api.patchCurrentStarState, api.rebuildStarState, api.restoreStarRecoveryPoint]) expect(write).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('hydration gates auto start; real confirmation advances; later does not persist or immediately reopen', async () => {
  vi.useFakeTimers(); enableTutorialStatus('recognition-new-user')
  const wrapper = render(); await flushPromises(); expect(tour()).toBeNull()
  await loadStylesheet(); await tick(); expect(tour().textContent).toContain('先上传截图')
  const root = wrapper.get('#product-root').element
  root.querySelector('#file-drop-zone').click(); await tick(); expect(tour().textContent).toContain('先上传截图')
  addUnconfirmed(root); await tick(); expect(tour().textContent).toContain('检查并确认分类')
  root.querySelector('[data-confirm-pool]').addEventListener('click', () => {
    root.querySelector('.thumbnail-card').classList.replace('is-unconfirmed', 'is-confirmed'); root.querySelector('[data-start-ocr]').disabled = false
  })
  root.querySelector('[data-confirm-pool]').click(); await tick(); expect(tour().textContent).toContain('可以开始识别了')
  tour().querySelector('.recognition-tour-close').click(); await tick()
  expect(localStorage.getItem('yuanhub:star-onboarding:v2:recognition-new-user')).toBeNull()
  root.append(document.createElement('span')); await tick(); expect(tour()).toBeNull()
  await replay(wrapper); await tick(); expect(tour().textContent).toContain('可以开始识别了')
  tour().querySelector('.recognition-tour-close').click(); await tick()
  wrapper.unmount(); document.getElementById('yuanstar-embed-styles')?.remove()
  const remount = render(); await flushPromises(); await loadStylesheet(); await tick()
  expect(tour().textContent).toContain('先上传截图'); remount.unmount()
})
it('skip hides only this phase; next real phase appears; explicit opt-out persists and replay still works', async () => {
  vi.useFakeTimers(); enableTutorialStatus('recognition-skip-user')
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick()
  clickText(tour(), '跳过此提示'); await tick(); expect(tour()).toBeNull()
  addUnconfirmed(wrapper.get('#product-root').element); await tick()
  expect(tour().textContent).toContain('检查并确认分类')
  await wrapper.get('.star-help-trigger').trigger('click'); await flushPromises()
  help().querySelectorAll('.star-help-content > details')[3].open = true; clickText(help(), '不再自动提示'); await tick()
  expect(localStorage.getItem('yuanhub:star-onboarding:v2:recognition-skip-user')).toBe('seen')
  expect(tour()).toBeNull(); expect(help().textContent).toContain('已关闭自动提示')
  clickText(help(), '重新查看当前引导'); await tick(); expect(tour().textContent).toContain('检查并确认分类')
})
it.each([['local-history', true, 0], ['remote-history', false, 2]])('experienced %s user stays quiet without a seen write and can replay from unified help', async (name, hasHistory, revision) => {
  enableTutorialStatus('recognition-' + name, hasHistory); getCurrentStarState.mockResolvedValue({ ...emptyRemote, revision })
  const wrapper = render(); await flushPromises(); await loadStylesheet()
  expect(tour()).toBeNull(); expect(localStorage.getItem('yuanhub:star-onboarding:v2:recognition-' + name)).toBeNull()
  await replay(wrapper); expect(tour().textContent).toContain('先上传截图')
})
it('cloud failure cannot auto introduce a potentially experienced user but help replay remains available', async () => {
  enableTutorialStatus('recognition-cloud-failure'); getCurrentStarState.mockRejectedValue(new Error('offline'))
  const wrapper = render(); await flushPromises(); await loadStylesheet(); expect(tour()).toBeNull()
  await replay(wrapper); expect(tour().textContent).toContain('先上传截图')
})
it('late draft readiness is rechecked on embed rendering for the current identity', async () => {
  vi.useFakeTimers(); enableTutorialStatus('recognition-delayed-draft')
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick()
  const handle = embedMount.mock.results[0].value
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: false, hasHistory: false })
  auth.userInfo = { id: 'recognition-delayed-draft-fresh' }; await tick(); expect(tour()).toBeNull()
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: true, hasHistory: false })
  wrapper.get('#product-root').element.append(document.createElement('div')); await tick(); expect(tour()).not.toBeNull()
})
it('OCR yields to progress, waits for persisted review, then offers one anomaly check and completion', async () => {
  vi.useFakeTimers(); enableTutorialStatus('bag-first-ocr-host')
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick()
  const root = wrapper.get('#product-root').element, options = embedMount.mock.calls[0][1], handle = embedMount.mock.results[0].value
  root.querySelector('[data-start-ocr]').textContent = '取消识别'; await tick(); expect(tour()).toBeNull()
  rebuildStarState.mockResolvedValue({ state: { ...emptyRemote, revision: 1, generation: 1 } })
  await options.onOcrRebuild(emptySnapshot, null)
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: true, hasHistory: true }); options.onActiveTabChange('review'); await tick()
  expect(tour()).toBeNull()
  root.innerHTML = '<section class="ocr-review"><button id="toggle-ocr-review">识别结果核对</button><section data-review-image="first-ocr"></section></section>'; await tick()
  expect(tour().textContent).toContain('正常结果不用逐条确认'); expect(tour().textContent).not.toContain('1 / 7')
  clickText(tour(), '完成引导'); await tick()
  expect(localStorage.getItem('yuanhub:star-onboarding:v2:bag-first-ocr-host')).toBe('seen'); expect(tour()).toBeNull()
  await replay(wrapper); expect(tour().textContent).toContain('先检查识别异常')
})
it("closing before OCR suppresses this visit's review hint without marking seen", async () => {
  vi.useFakeTimers(); enableTutorialStatus('bag-later-host')
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick()
  tour().querySelector('.recognition-tour-close').click(); await tick()
  rebuildStarState.mockResolvedValue({ state: { ...emptyRemote, revision: 1, generation: 1 } })
  const options = embedMount.mock.calls[0][1]; await options.onOcrRebuild(emptySnapshot, null)
  wrapper.get('#product-root').element.innerHTML = '<section class="ocr-review"><button id="toggle-ocr-review">识别结果核对</button><section data-review-image="first-ocr"></section></section>'
  options.onActiveTabChange('review'); await tick()
  expect(tour()).toBeNull(); expect(localStorage.getItem('yuanhub:star-onboarding:v2:bag-later-host')).toBeNull()
})
it('historical bag owner stays quiet after OCR and advanced help does not switch away from the plan', async () => {
  vi.useFakeTimers(); enableTutorialStatus('bag-historical-host', true)
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick()
  rebuildStarState.mockResolvedValue({ state: { ...emptyRemote, revision: 1, generation: 1 } })
  const options = embedMount.mock.calls[0][1]; await options.onOcrRebuild(emptySnapshot, null)
  wrapper.get('#product-root').element.innerHTML = '<section class="ocr-review"><button id="toggle-ocr-review">识别结果核对</button><section data-review-image="old-ocr"></section></section>'
  options.onActiveTabChange('review'); await tick(); expect(tour()).toBeNull()
  await wrapper.findAll('[role="tab"]')[1].trigger('click'); await tick()
  await wrapper.get('.star-help-trigger').trigger('click'); await flushPromises()
  help().querySelectorAll('.star-help-content > details')[2].open = true
  expect(help().textContent).toContain('Ctrl+Z'); expect(wrapper.get('#product-root').classes()).toContain('is-plan-view')
})
it('empty-bag help preserves the read-only example without replacing the real workspace or writing data', async () => {
  vi.useFakeTimers(); enableTutorialStatus('bag-demo-help', true)
  localStorage.setItem('star-tabs', 'review')
  listAccounts.mockResolvedValue([{ id: 'acc-1', game: '如鸢' }, { id: 'acc-2', game: '如鸢' }])
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick()
  const product = wrapper.get('#product-root').element, handle = embedMount.mock.results[0].value
  const reads = handle.getCloudBusinessSnapshot.mock.calls.length
  await wrapper.get('.star-help-trigger').trigger('click'); await flushPromises()
  expect(help().querySelector('.star-help-demo').open).toBe(false)
  help().querySelectorAll('.star-help-content > details')[2].open = true
  help().querySelector('.star-help-demo summary').click(); await flushPromises()
  expect(help().querySelectorAll('.bag-tutorial-demo tbody tr')).toHaveLength(3)
  clickText(help(), '养成计划示例'); await flushPromises()
  expect(help().querySelector('.plan-editor')).not.toBeNull()
  expect(wrapper.get('#product-root').element).toBe(product)
  expect(wrapper.get('#product-root').isVisible()).toBe(true)
  expect(wrapper.get('#product-root').classes()).not.toContain('is-plan-view')
  expect(wrapper.get('.star-empty').exists()).toBe(true)
  expect(wrapper.get('.tool-summary').text()).toContain('当前背包 0 颗')
  expect(handle.getCloudBusinessSnapshot).toHaveBeenCalledTimes(reads)
  expect(handle.importCaptureBatch).not.toHaveBeenCalled()
  const api = await import('../src/api/starState.js')
  for (const write of [api.patchCurrentStarState, api.rebuildStarState, api.restoreStarRecoveryPoint]) expect(write).not.toHaveBeenCalled()
  expect(localStorage.getItem('star-tabs')).toBe('review')
  document.querySelector('[aria-label="关闭星石帮助"]').click(); await flushPromises()
  expect(help()).toBeNull(); expect(wrapper.get('.star-empty').exists()).toBe(true)
  await wrapper.get('.star-help-trigger').trigger('click'); await flushPromises()
  expect(help().querySelector('.star-help-demo').open).toBe(false)
  expect(help().querySelector('.bag-tutorial-demo .current-editor')).not.toBeNull()
  activeAccount.set('acc-2'); await tick()
  expect(help()).toBeNull()
  expect(localStorage.getItem('yuanhub:star-onboarding:v2:bag-demo-help')).toBeNull()
})
it('replaying an empty bag with no OCR evidence opens the actual upload task', async () => {
  vi.useFakeTimers(); enableTutorialStatus('bag-empty-replay', true)
  localStorage.setItem('star-tabs', 'review')
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick()
  await replay(wrapper); await tick()
  expect(help()).toBeNull()
  expect(tour().textContent).toContain('先上传截图')
  expect(tour().textContent).not.toContain('结果已进入背包')
  expect(wrapper.get('.star-import-stage').text()).toBe('截图识别')
  expect(wrapper.get('#product-root').isVisible()).toBe(true)
  expect(embedMount.mock.results[0].value.setActiveTab).toHaveBeenLastCalledWith('import')
  expect(localStorage.getItem('yuanhub:star-onboarding:v2:bag-empty-replay')).toBeNull()
})
it('manual Tab/account switch closes the old hint without seen; late status cannot open an old account', async () => {
  vi.useFakeTimers(); enableTutorialStatus('recognition-context-user')
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: '测试账号', game: '如鸢' }, { id: 'acc-2', name: '另一个', game: '如鸢' }])
  const wrapper = render(); await flushPromises(); await loadStylesheet(); await tick(); expect(tour()).not.toBeNull()
  await wrapper.findAll('[role="tab"]')[0].trigger('click'); await tick(); expect(tour()).toBeNull()
  expect(localStorage.getItem('yuanhub:star-onboarding:v2:recognition-context-user')).toBeNull()
  await replay(wrapper); expect(tour()).not.toBeNull()
  const pending = deferred(), handle = embedMount.mock.results[0].value
  handle.getRecognitionTutorialStatus.mockReturnValue(pending.promise)
  wrapper.get('#product-root').element.append(document.createElement('span')); await tick()
  handle.getRecognitionTutorialStatus.mockReturnValue({ ready: false, hasHistory: false })
  activeAccount.set('acc-2'); await tick(); pending.resolve({ ready: true, hasHistory: false }); await tick()
  expect(tour()).toBeNull(); expect(localStorage.getItem('yuanhub:star-onboarding:v2:recognition-context-user')).toBeNull()
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
  expect(wrapper.get('.star-sync-state').text()).toContain('星石云端状态加载失败')
  expect(wrapper.get('.star-sync-state').classes()).toContain('is-error')
  expect(wrapper.get('.star-sync-retry').text()).toBe('重试')

  await wrapper.get('.star-sync-retry').trigger('click')
  await flushPromises()
  expect(getCurrentStarState).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.star-sync-state.is-error').exists()).toBe(false)
  expect(wrapper.get('.star-sync-meta[role="status"]').text()).toBe('✓ 已同步')
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
  expect(wrapper.get('.star-sync-state').text()).toContain('三段截图已导入')
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
    expect(wrapper.get('.star-sync-state').text()).toContain('已恢复本地待识别截图')
    expect(getStarCaptureManifest).not.toHaveBeenCalled()
    expect(navigation.replace).toHaveBeenCalledTimes(1)
  } else {
    expect(wrapper.text()).not.toContain('已恢复本地待识别截图')
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
