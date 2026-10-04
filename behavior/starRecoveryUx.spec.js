import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import StarPage from '../src/pages/star/index.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getCurrentStarState } from '../src/api/starState.js'
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

it('默认直接进入背包，导入入口旁保留隐私提示，识别说明仅在导入流程出现', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.star-tabs [role="tab"]:last-child').attributes('aria-selected')).toBe('true')
  expect(wrapper.find('.star-availability-note').exists()).toBe(false)
  expect(wrapper.get('.star-privacy-note').text()).toContain('截图在本机识别与保存')
  await wrapper.get('.compact-tool-actions .primary').trigger('click')
  expect(wrapper.get('.star-tabs [role="tab"]').attributes('aria-selected')).toBe('true')
  const note = wrapper.get('.star-availability-note[role="note"]')
  expect(note.text()).toContain('手机和电脑网页端均可使用')
  expect(note.text()).toContain('导入截图、核对识别结果并整理背包')
  expect(note.text()).toContain('MaaYuan 星石自动采集仍在接入中')
  wrapper.unmount()
  document.getElementById('yuanstar-embed-styles')?.remove()
})

it('OCR 自动切换通知更新共享 tab 高亮，用户手动切换仍调用 embed', async () => {
  const wrapper = render()
  await flushPromises()
  await loadStylesheet()
  const options = embedMount.mock.calls[0][1]
  options.onActiveTabChange('review')
  await flushPromises()
  const tabs = wrapper.findAll('.star-tabs [role="tab"]')
  expect(tabs[0].attributes('aria-selected')).toBe('false')
  expect(tabs[1].attributes('aria-selected')).toBe('true')
  expect(tabs[1].classes()).toContain('on')
  expect(localStorage.getItem('star-tabs')).toBe('review')
  const handle = embedMount.mock.results[0].value
  handle.setActiveTab.mockClear()
  await tabs[0].trigger('click')
  expect(handle.setActiveTab).toHaveBeenCalledWith('import')
  expect(tabs[0].attributes('aria-selected')).toBe('true')
  wrapper.unmount()
})

it('样式加载失败可重试，失败链接不会阻挡下一次加载', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('未登录')
  expect(wrapper.text()).toContain('登录后同步')
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
  expect(wrapper.get('.star-sync-retry').text()).toBe('重试')

  await wrapper.get('.star-sync-retry').trigger('click')
  await flushPromises()
  expect(getCurrentStarState).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.star-sync-state.is-error').exists()).toBe(false)
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
  await tabs[0].trigger('click')
  expect(localStorage.getItem('star-tabs')).toBe('import')
  await tabs[1].trigger('click')
  expect(handle.setActiveTab).not.toHaveBeenCalled()
  gate.resolve()
  await flushPromises()
  expect(handle.setActiveTab).toHaveBeenCalledTimes(1)
  expect(handle.setActiveTab).toHaveBeenCalledWith('review')
  expect(tabs[1].attributes('aria-selected')).toBe('true')
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
