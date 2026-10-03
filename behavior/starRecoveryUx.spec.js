import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { reactive } from 'vue'
import StarPage from '../src/pages/star/index.vue'
import { auth } from '../src/store/auth.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { listAccounts } from '../src/api/accounts.js'
import { getCurrentStarState } from '../src/api/starState.js'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn() }) }))
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
  auth.isLoggedIn = false
  activeAccount.set('')
  listAccounts.mockResolvedValue([{ id: 'acc-1', name: '测试账号', game: '如鸢' }])
  getCurrentStarState.mockResolvedValue(emptyRemote)
  embedMount = vi.fn(() => ({
    setHostAccount: vi.fn().mockResolvedValue(undefined), setActiveTab: vi.fn(),
    getCloudBusinessSnapshot: vi.fn().mockResolvedValue(emptySnapshot),
    dispose: vi.fn().mockResolvedValue(undefined),
  }))
  vi.stubGlobal('Function', (...args) => args[1] === 'return import(url)'
    ? () => Promise.resolve({ mountYuanStar: embedMount })
    : nativeFunction(...args))
})

it('星石页入口明确网页端可用且自动采集仍在接入中', async () => {
  const wrapper = render()
  await flushPromises()
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
