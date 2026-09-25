import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import VersionUpdateBanner from '../src/components/VersionUpdateBanner.vue'
import { getFrontendDeployMeta } from '../src/api/system.js'
import { MIN_VERSION_CHECK_GAP_MS, VERSION_CHECK_INTERVAL_MS } from '../src/utils/versionCheck.js'

vi.mock('../src/api/system.js', () => ({ getFrontendDeployMeta: vi.fn() }))
vi.mock('../src/config/buildInfo.js', () => ({
  productVersion: '0.0.1-beta.4',
  FALLBACK_PRODUCT_VERSION: '0.0.0-dev'
}))

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

async function mountBanner() {
  const wrapper = mount(VersionUpdateBanner)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.stubEnv('VITE_ENABLE_VERSION_CHECK', 'true')
  getFrontendDeployMeta.mockReset()
  setVisibility('visible')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('VersionUpdateBanner 全局更新提示', () => {
  it('服务器版本与当前构建一致时不显示横幅', async () => {
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.4' })
    const wrapper = await mountBanner()
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.version-update').exists()).toBe(false)
  })

  it('版本不同时只显示一个横幅，包含文案、版本对比与刷新按钮', async () => {
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.5' })
    const wrapper = await mountBanner()

    const banners = wrapper.findAll('.version-update')
    expect(banners).toHaveLength(1)
    const banner = banners[0]
    expect(banner.attributes('role')).toBe('status')
    expect(banner.attributes('aria-live')).toBe('polite')
    expect(banner.text()).toContain('YuanHub 已发布新版本')
    expect(banner.text()).toContain('请刷新页面')
    expect(banner.text()).toContain('0.0.1-beta.4 → 0.0.1-beta.5')
    expect(wrapper.get('.version-update__action').text()).toBe('立即刷新')
  })

  it('缺少 version 时不提示，之后接口恢复正常再提示', async () => {
    getFrontendDeployMeta.mockResolvedValue({ commit: 'abc1234' })
    const wrapper = await mountBanner()
    expect(wrapper.find('.version-update').exists()).toBe(false)

    // 后续服务器又发布新版本时，已显示的横幅可更新为最新版本号，但仍只有一个横幅。
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.6' })
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS)
    const banner = wrapper.get('.version-update')
    expect(banner.text()).toContain('0.0.1-beta.4 → 0.0.1-beta.6')
    expect(wrapper.findAll('.version-update')).toHaveLength(1)
  })

  it('版本接口失败时静默：不显示横幅、不抛错，业务其他部分不受影响', async () => {
    getFrontendDeployMeta.mockRejectedValue(new Error('503 deploy-meta 暂不可用'))
    const wrapper = await mountBanner()
    expect(wrapper.find('.version-update').exists()).toBe(false)
    // 下一次轮询会重新检查。
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS)
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(2)
  })

  it('点击“立即刷新”只调用 location.reload，不清除本地数据', async () => {
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.5' })
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    localStorage.setItem('yuanhub:test-key', 'keep-me')
    const wrapper = await mountBanner()

    await wrapper.get('.version-update__action').trigger('click')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('yuanhub:test-key')).toBe('keep-me')
  })

  it('页面保持打开时每 60 秒检查一次', async () => {
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.4' })
    await mountBanner()
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS)
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS)
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(3)
  })

  it('页面从后台恢复可见时补检一次，快速重复触发不产生重复请求', async () => {
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.4' })
    await mountBanner()
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(MIN_VERSION_CHECK_GAP_MS)
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(2)

    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(2)
  })

  it('检测到新版本后停止轮询，避免无意义的周期请求', async () => {
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.5' })
    const wrapper = await mountBanner()
    expect(wrapper.find('.version-update').exists()).toBe(true)
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS * 3)
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(1)
  })

  it('组件卸载后清除轮询与监听，不再请求', async () => {
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.4' })
    const wrapper = await mountBanner()
    const before = getFrontendDeployMeta.mock.calls.length

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(VERSION_CHECK_INTERVAL_MS * 2)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(getFrontendDeployMeta).toHaveBeenCalledTimes(before)
  })

  it('显式关闭版本检测时不发请求也不显示横幅', async () => {
    vi.stubEnv('VITE_ENABLE_VERSION_CHECK', 'false')
    getFrontendDeployMeta.mockResolvedValue({ version: '0.0.1-beta.5' })
    const wrapper = await mountBanner()
    expect(getFrontendDeployMeta).not.toHaveBeenCalled()
    expect(wrapper.find('.version-update').exists()).toBe(false)
  })
})
