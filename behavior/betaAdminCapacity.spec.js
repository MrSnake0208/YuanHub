import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BetaAdmin from '../src/pages/admin/beta.vue'
import { getBetaAdmin, updateBetaAdmin } from '../src/api/beta.js'
import { beta } from '../src/store/beta.js'

vi.mock('../src/api/beta.js', () => ({
  getBetaAdmin: vi.fn(), updateBetaAdmin: vi.fn(), resetLocalBeta: vi.fn()
}))
vi.mock('../src/store/beta.js', () => ({ beta: { refresh: vi.fn() } }))

function adminPayload(overrides = {}) {
  return {
    configured: true,
    configVersion: 3,
    capacityHardLimit: 100000,
    waitingCount: 0,
    releasedCount: 0,
    releasedAt: null,
    publicOpenedAt: null,
    snapshotId: 'frozen-v1',
    snapshotStatus: 'READY',
    snapshotLockedAt: '2026-09-24T11:00:00Z',
    snapshotCount: 10,
    snapshotSourceNote: 'isolated fixture',
    lastMaintenanceAt: null,
    lastMaintenanceError: null,
    reservedGrantedCount: 0,
    publicGrantedCount: 0,
    campaign: {
      campaignId: 'yuanhub-beta-202609',
      accessMode: 'BETA',
      admissionsPaused: false,
      pauseReason: null,
      startsAt: '2026-09-24T12:00:00Z',
      reservedUntil: '2026-09-27T12:00:00Z',
      serverNow: '2026-09-24T13:00:00Z',
      announcementTimezone: 'Asia/Shanghai',
      snapshotAt: '2026-09-21T12:00:00Z',
      rulesVersion: 'v1',
      initialCapacity: 100,
      capacity: 100,
      reservedInitial: 25,
      reservedRemaining: 25,
      grantedCount: 0,
      publicRemaining: 75,
      publicState: 'OPEN_REGISTRATION',
      localTestMode: false,
    },
    ...overrides,
  }
}

const render = () => mount(BetaAdmin, {
  global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: true, teleport: true } },
})
const target = wrapper => wrapper.get('#beta-capacity-target')
const submit = wrapper => wrapper.get('.capacity-panel .admin-btn')
const setReason = async (wrapper, value = '同步流程稳定，开放下一批候补') => {
  await wrapper.get('#beta-admin-reason').setValue(value)
}

beforeEach(() => {
  getBetaAdmin.mockReset().mockResolvedValue(adminPayload())
  updateBetaAdmin.mockReset().mockResolvedValue(adminPayload({ configVersion: 4, campaign: { ...adminPayload().campaign, capacity: 1000 } }))
  beta.refresh.mockReset().mockResolvedValue(null)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

it('replaces the fixed 150/200 buttons with a real numeric absolute-target input', async () => {
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).not.toMatch(/扩至\s*150/)
  expect(wrapper.text()).not.toMatch(/扩至\s*200/)
  const input = target(wrapper)
  expect(input.attributes('type')).toBe('number')
  expect(input.attributes('inputmode')).toBe('numeric')
  expect(input.attributes('min')).toBe('101')
  expect(input.attributes('max')).toBe('100000')
  expect(wrapper.get('label[for="beta-capacity-target"]').text()).toContain('目标总容量')
  expect(wrapper.text()).toContain('当前容量')
})

it('keeps submit disabled and shows an inline reason while the target is missing, equal or above the safety limit', async () => {
  const wrapper = render(); await flushPromises()
  expect(submit(wrapper).attributes('disabled')).toBeDefined()

  await target(wrapper).setValue('100')
  expect(submit(wrapper).attributes('disabled')).toBeDefined()
  expect(wrapper.get('#beta-capacity-error').text()).toBe('目标容量必须大于当前容量')
  expect(window.confirm).not.toHaveBeenCalled()

  await target(wrapper).setValue('100001')
  expect(submit(wrapper).attributes('disabled')).toBeDefined()
  expect(wrapper.get('#beta-capacity-error').text()).toBe('目标容量超过系统安全上限')

  await target(wrapper).setValue('1.5')
  expect(submit(wrapper).attributes('disabled')).toBeDefined()
  expect(wrapper.get('#beta-capacity-error').text()).toBe('目标容量必须是正整数')
})

it('previews the exact number of new public slots before submit', async () => {
  const wrapper = render(); await flushPromises()
  await target(wrapper).setValue('1000')
  expect(wrapper.get('#beta-capacity-hint').text()).toContain('本次将新增')
  expect(wrapper.get('#beta-capacity-hint').text()).toContain('900')
  expect(submit(wrapper).attributes('disabled')).toBeUndefined()
})

it('confirms the absolute target, share reservation and FIFO in one dialog, then resets the field', async () => {
  const wrapper = render(); await flushPromises()
  await setReason(wrapper)
  await target(wrapper).setValue('1000')
  await submit(wrapper).trigger('click'); await flushPromises()

  expect(window.confirm).toHaveBeenCalledTimes(1)
  const message = window.confirm.mock.calls[0][0]
  expect(message).toContain('当前容量 100 → 目标容量 1000')
  expect(message).toContain('本次新增 900 个公开名额')
  expect(message).toContain('扩容不会重新按比例增加 Share 预留')
  expect(message).toContain('已有候补将按顺序自动递补')
  expect(updateBetaAdmin).toHaveBeenCalledExactlyOnceWith('capacity', {
    capacity: 1000, reason: '同步流程稳定，开放下一批候补', expected_config_version: 3,
  })
  expect(target(wrapper).element.value).toBe('')
  expect(beta.refresh).toHaveBeenCalledTimes(1)
})

it('declining the confirmation or omitting the reason never calls the backend', async () => {
  const wrapper = render(); await flushPromises()
  await setReason(wrapper)
  await target(wrapper).setValue('1000')
  window.confirm.mockReturnValue(false)
  await submit(wrapper).trigger('click'); await flushPromises()
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(updateBetaAdmin).not.toHaveBeenCalled()
  expect(target(wrapper).element.value).toBe('1000')

  window.confirm.mockReturnValue(true)
  await wrapper.get('#beta-admin-reason').setValue('')
  await submit(wrapper).trigger('click'); await flushPromises()
  expect(window.confirm).toHaveBeenCalledTimes(1)
  expect(updateBetaAdmin).not.toHaveBeenCalled()
  expect(wrapper.get('.admin-message.error').text()).toContain('变更原因')
})
