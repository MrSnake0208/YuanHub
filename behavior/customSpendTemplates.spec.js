import { beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { useCustomSpendTemplates } from '../src/composables/useCustomSpendTemplates.js'
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('../src/api/customSpendTemplates.js', () => ({ getCustomSpendTemplates: api.get, putCustomSpendTemplates: api.put }))
const template = { id: 'custom-spend-lantai', label: '兰台扫荡', costPer: 10, yield: { __xp__: 1000 } }
const wire = (items = [], revision = 0) => ({ schema_version: 1, revision, templates: items.map(({ costPer, ...item }) => ({ ...item, cost_per: costPer })) })
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
function setup() {
  let state
  const wrapper = mount(defineComponent({ props: ['account'], setup() { state = useCustomSpendTemplates(); return () => h('span', state.templates.value.map(item => item.label).join(',')) } }), { props: { account: 'child-a' } })
  return { wrapper, state }
}
beforeEach(() => {
  auth.accessToken = 'token'; auth.userInfo = { id: 'main-a' }
  api.get.mockReset().mockResolvedValue(wire())
  api.put.mockReset().mockImplementation(async (body) => ({ ...body, revision: body.expected_revision + 1 }))
})

it('共享模板以大账号读写，切换子账号不重新加载或清空，也不携带每日次数', async () => {
  api.get.mockResolvedValue(wire([template], 1))
  const { wrapper, state } = setup(); await flushPromises()
  expect(api.get).toHaveBeenCalledWith('main-a')
  await wrapper.setProps({ account: 'different-game-child' })
  expect(wrapper.text()).toBe('兰台扫荡'); expect(api.get).toHaveBeenCalledTimes(1)
  expect(await state.save([{ ...template, label: '兰台每日' }])).toBe(true)
  expect(api.put).toHaveBeenCalledWith(expect.objectContaining({ expected_revision: 1, templates: [{ id: template.id, label: '兰台每日', cost_per: 10, yield: { __xp__: 1000 } }] }), 'main-a')
  expect(api.put.mock.calls[0][0].templates[0]).not.toHaveProperty('count')
})

it('大账号切换清空旧模板，迟到GET和PUT不能污染新账号', async () => {
  const get = pending(), put = pending()
  api.get.mockImplementationOnce(() => get.promise).mockResolvedValue(wire([], 0))
  const { state } = setup()
  auth.userInfo = { id: 'main-b' }; await flushPromises()
  get.resolve(wire([template], 1)); await flushPromises()
  expect(state.templates.value).toEqual([])
  api.put.mockImplementationOnce(() => put.promise)
  const saved = state.save([template]); await flushPromises()
  auth.userInfo = { id: 'main-c' }; await flushPromises()
  put.resolve(wire([template], 1)); expect(await saved).toBe(false)
  expect(state.templates.value).toEqual([])
  auth.accessToken = ''; await flushPromises()
  expect(state.templates.value).toEqual([]); expect(state.blocked.value).toBe(true)
})

it('丢失响应的已提交保存可对账恢复，不重复写入，草稿按大账号隔离', async () => {
  let server = wire()
  api.get.mockImplementation(async () => server)
  api.put.mockImplementationOnce(async body => { server = { ...body, revision: 1 }; throw new Error('响应中断') })
  const first = setup(); await flushPromises()
  expect(await first.state.save([template])).toBe(false)
  expect(first.state.error.value).toContain('响应中断')
  expect(localStorage.getItem('yuanhub:custom-spend-templates:draft:v1:main-a')).toContain('兰台扫荡')
  first.wrapper.unmount()
  const second = setup(); await flushPromises()
  expect(second.state.templates.value).toEqual([template])
  expect(await second.state.retry()).toBe(true)
  expect(api.put).toHaveBeenCalledTimes(1)
  expect(second.state.error.value).toBe('')
  expect(localStorage.getItem('yuanhub:custom-spend-templates:draft:v1:main-a')).toBeNull()
})

it('冲突保留待保存内容，放弃后采用云端配置', async () => {
  const { state } = setup(); await flushPromises()
  api.put.mockRejectedValueOnce(Object.assign(new Error('另一设备已更新'), { status: 409 }))
  expect(await state.save([template])).toBe(false)
  expect(state.templates.value).toEqual([template])
  api.get.mockResolvedValue(wire([{ ...template, label: '云端项目' }], 2))
  expect(await state.retry()).toBe(false)
  expect(state.templates.value[0].label).toBe('兰台扫荡')
  expect(await state.discard()).toBe(true)
  expect(state.templates.value[0].label).toBe('云端项目')
})
