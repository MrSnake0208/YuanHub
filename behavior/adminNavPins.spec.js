import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { auth } from '../src/store/auth.js'
import { isFeatureEnabled } from '../src/config/features.js'
vi.mock('../src/config/features.js', async original => ({ ...await original(), isFeatureEnabled: vi.fn(() => true) }))
import { useAdminNavPins } from '../src/composables/useAdminNavPins.js'
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({}) }
})
let serial = 0
const key = id => `yh_admin_nav_pins:${encodeURIComponent(id)}`
beforeEach(() => {
  localStorage.clear()
  isFeatureEnabled.mockReturnValue(true)
  Object.assign(auth, { accessToken: 'fixture', userInfo: { id: `pin-user-${++serial}` }, adminAccessLoaded: true, adminAccessLoading: false, adminAccessError: '', adminAccess: { operatorAreas: ['UI'] } })
})
function render() {
  let pins
  const wrapper = mount({ setup() { pins = useAdminNavPins(); return () => null } })
  return { pins, wrapper }
}
it('初始化只读、默认空；多消费者共享切换并持久保存工具 key', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem')
  const a = render(), b = render()
  expect(write).not.toHaveBeenCalled()
  expect(a.pins.pinnedTools.value).toEqual([])
  a.pins.togglePin('feedback-manage')
  expect(b.pins.pinnedTools.value.map(tool => tool.to)).toEqual(['/feedback/manage'])
  expect(JSON.parse(localStorage.getItem(key(auth.userInfo.id)))).toEqual(['feedback-manage'])
  b.pins.togglePin('feedback-manage')
  expect(a.pins.pinnedTools.value).toEqual([])
  a.wrapper.unmount(); b.wrapper.unmount(); write.mockRestore()
})
it('恢复合法偏好，忽略未知、无权限与非法值；不能固定未授权工具', () => {
  localStorage.setItem(key(auth.userInfo.id), JSON.stringify(['feedback-manage', 'feedback-manage', 'feedback-access', 'unknown', null]))
  const { pins, wrapper } = render()
  expect(pins.pinnedTools.value.map(tool => tool.key)).toEqual(['feedback-manage'])
  const saved = localStorage.getItem(key(auth.userInfo.id))
  pins.togglePin('feedback-access'); pins.togglePin('unknown')
  expect(localStorage.getItem(key(auth.userInfo.id))).toBe(saved)
  wrapper.unmount()
})
it('A → B → 退出 → A 隔离，B 操作不改写 A；空身份禁止写入', async () => {
  const idA = auth.userInfo.id
  const idB = `${idA}-b`
  const { pins, wrapper } = render()
  pins.togglePin('feedback-manage')
  auth.userInfo = { id: idB }; await nextTick()
  expect(pins.pinnedTools.value).toEqual([])
  pins.togglePin('feedback-manage'); pins.togglePin('feedback-manage')
  expect(JSON.parse(localStorage.getItem(key(idA)))).toEqual(['feedback-manage'])
  auth.accessToken = ''; await nextTick()
  pins.togglePin('feedback-manage')
  expect(pins.pinnedTools.value).toEqual([])
  expect(localStorage.getItem(key(''))).toBeNull()
  auth.userInfo = { id: idA }; auth.accessToken = 'fixture'; await nextTick()
  expect(pins.pinnedTools.value).toHaveLength(1)
  wrapper.unmount()
})
it.each([
  { adminAccessLoaded: false }, { adminAccessLoading: true }, { adminAccessError: 'failed' }, { adminAccess: { permissions: [] } }
])('权限不就绪或撤权时隐藏且禁止改写：%j', async state => {
  const { pins, wrapper } = render()
  pins.togglePin('feedback-manage')
  Object.assign(auth, state); await nextTick()
  expect(pins.pinnedTools.value).toEqual([])
  pins.togglePin('feedback-manage')
  expect(JSON.parse(localStorage.getItem(key(auth.userInfo.id)))).toEqual(['feedback-manage'])
  Object.assign(auth, { adminAccessLoaded: true, adminAccessLoading: false, adminAccessError: '', adminAccess: { operatorAreas: ['UI'] } })
  await nextTick()
  expect(pins.pinnedTools.value).toHaveLength(1)
  wrapper.unmount()
})
it.each(['{invalid', '{}', 'null'])('损坏存储安全回退：%s', saved => {
  localStorage.setItem(key(auth.userInfo.id), saved)
  const { pins, wrapper } = render()
  expect(pins.pinnedTools.value).toEqual([])
  pins.togglePin('feedback-manage')
  expect(pins.pinnedTools.value).toHaveLength(1)
  wrapper.unmount()
})
it('存储读写失败仍能在会话内使用并显示错误，恢复写入后清除错误', () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  const a = render(), b = render()
  expect(a.pins.storageError.value).toContain('无法读取')
  a.pins.togglePin('feedback-manage')
  expect(b.pins.pinnedTools.value).toHaveLength(1)
  expect(a.pins.storageError.value).toContain('本次会话')
  write.mockRestore(); read.mockRestore()
  b.pins.togglePin('feedback-manage')
  expect(a.pins.storageError.value).toBe('')
  a.wrapper.unmount(); b.wrapper.unmount()
})

it('关闭功能开关后已固定工具消失，卸载的消费者不再响应账号变化', async () => {
  auth.adminAccess = { permissions: ['activity_calendar:write'] }
  const { pins, wrapper } = render()
  pins.togglePin('activity-calendar')
  expect(pins.pinnedTools.value.map(tool => tool.to)).toContain('/calendar/admin')
  isFeatureEnabled.mockReturnValue(false)
  auth.adminAccess = { permissions: ['activity_calendar:write'] }; await nextTick()
  expect(pins.pinnedTools.value).toEqual([])
  wrapper.unmount()
  const read = vi.spyOn(Storage.prototype, 'getItem')
  auth.userInfo = { id: 'unmounted-user' }; await nextTick()
  expect(read).not.toHaveBeenCalled()
  read.mockRestore()
})
