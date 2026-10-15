import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOperatorOrganization } from '../src/composables/useOperatorOrganization.js'
import { emptyOperatorOrganization, operatorOrganizationBackup } from '../src/utils/operatorOrganization.js'
import OperatorOrganizationManager from '../src/components/operator/OperatorOrganizationManager.vue'
import OperatorOrganizationCard from '../src/components/operator/OperatorOrganizationCard.vue'
import { getOperatorOrganization, putOperatorOrganization } from '../src/api/operator.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/api/operator.js', () => ({ getOperatorOrganization: vi.fn(), putOperatorOrganization: vi.fn() }))
const remote = (account = 'a', revision = 0) => ({ ...emptyOperatorOrganization(), account_id: account, revision })
const wrappers = []
let state, account, enabled
const harness = () => {
  const wrapper = mount(defineComponent({ setup() {
    account = ref('a'); enabled = ref(true); state = useOperatorOrganization(account, enabled); return {}
  }, template: '<div />' }))
  wrappers.push(wrapper); return wrapper
}
beforeEach(() => { vi.clearAllMocks(); getOperatorOrganization.mockImplementation(async id => remote(id)) })
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

it('初始化只读；读取失败禁用保存，重试后恢复', async () => {
  getOperatorOrganization.mockRejectedValueOnce(new Error('offline'))
  harness(); await flushPromises()
  expect(state.error.value).toContain('offline'); expect(state.ready.value).toBe(false)
  expect(await state.save(emptyOperatorOrganization())).toBe(false)
  expect(putOperatorOrganization).not.toHaveBeenCalled()
  await state.reload(); expect(state.ready.value).toBe(true)
  expect(putOperatorOrganization).not.toHaveBeenCalled()
})

it('拒绝响应账号不符；A→B→A 的迟到读取不覆盖当前数据', async () => {
  const firstA = deferred()
  getOperatorOrganization.mockImplementationOnce(() => firstA.promise)
  harness(); account.value = 'b'; await flushPromises(); account.value = 'a'; await flushPromises()
  firstA.resolve({ ...remote('a', 99), pinned_ids: ['late'] }); await flushPromises()
  expect(state.data.value.pinned_ids).toEqual([])
  getOperatorOrganization.mockResolvedValue(remote('b', 8)); await state.reload()
  expect(state.error.value).toContain('账号'); expect(state.data.value.revision).toBe(0)
})

it('保存固定账号及revision，重复点击不并发，成功前保持原分类', async () => {
  harness(); await flushPromises()
  const pending = deferred(); putOperatorOrganization.mockReturnValue(pending.promise)
  const next = { ...emptyOperatorOrganization(), pinned_ids: ['retired'] }
  const saved = state.save(next)
  expect(await state.save(next)).toBe(false)
  expect(state.data.value.pinned_ids).toEqual([])
  expect(putOperatorOrganization).toHaveBeenCalledWith('a', { ...next, expected_revision: 0 })
  pending.resolve({ ...remote('a', 1), pinned_ids: ['retired'] }); expect(await saved).toBe(true)
  expect(state.data.value.pinned_ids).toEqual(['retired'])
})

it('保存失败保留原数据；冲突须重新读取，不覆盖云端', async () => {
  harness(); await flushPromises()
  putOperatorOrganization.mockRejectedValueOnce(new Error('offline'))
  const next = { ...emptyOperatorOrganization(), pinned_ids: ['a'] }
  expect(await state.save(next)).toBe(false); expect(state.data.value.pinned_ids).toEqual([]); expect(state.ready.value).toBe(true)
  putOperatorOrganization.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  await state.save(next); expect(state.conflicted.value).toBe(true); expect(state.ready.value).toBe(false)
  getOperatorOrganization.mockResolvedValue(remote('a', 3)); await state.reload()
  expect(state.data.value.revision).toBe(3); expect(state.ready.value).toBe(true)
})

it('切账号、清账号、退出登录和卸载忽略迟到保存', async () => {
  const wrapper = harness(); await flushPromises()
  const pending = deferred(); putOperatorOrganization.mockReturnValue(pending.promise)
  const writing = state.save({ ...emptyOperatorOrganization(), pinned_ids: ['late'] })
  account.value = 'b'; await flushPromises(); account.value = 'a'; await flushPromises()
  pending.resolve({ ...remote('a', 1), pinned_ids: ['late'] }); expect(await writing).toBe(false)
  expect(state.data.value.pinned_ids).toEqual([])
  account.value = ''; await flushPromises(); expect(state.ready.value).toBe(false)
  account.value = 'a'; enabled.value = false; await flushPromises(); expect(state.data.value.tags).toEqual([])
  enabled.value = true; const read = deferred(); getOperatorOrganization.mockReturnValue(read.promise)
  const reload = state.reload(); wrapper.unmount(); read.resolve(remote('a', 9)); await reload
  expect(state.data.value.revision).toBe(0)
})

function managerProps() {
  return { value: remote('a'), accountId: 'a', game: '如鸢', catalog: { a: { name: '甲', games: ['如鸢'] } }, ready: true,
    save: vi.fn().mockResolvedValue(false), reload: vi.fn() }
}
async function openManager(props = managerProps()) {
  const wrapper = mount(OperatorOrganizationManager, { props }); wrappers.push(wrapper)
  wrapper.get('details').element.open = true; await wrapper.get('details').trigger('toggle'); return wrapper
}
const clickText = async (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text).trigger('click')

it('标签新增/重命名/删除与分组调整只在显式保存时提交，失败保留草稿', async () => {
  const props = managerProps(), wrapper = await openManager(props)
  await clickText(wrapper, '新增标签'); await wrapper.get('input[aria-label="标签名称 1"]').setValue('主力')
  await wrapper.get('button[aria-label="上移养老中"]').trigger('click')
  expect(props.save).not.toHaveBeenCalled()
  await clickText(wrapper, '保存分类设置'); await flushPromises()
  expect(props.save).toHaveBeenCalledWith(expect.objectContaining({ tags: [expect.objectContaining({ name: '主力' })], status_order: ['active', 'skip', 'graduated', 'discarded'] }), 0)
  expect(wrapper.get('input[aria-label="标签名称 1"]').element.value).toBe('主力')
  await wrapper.get('button[aria-label="删除标签主力"]').trigger('click')
  expect(wrapper.find('input[aria-label="标签名称 1"]').exists()).toBe(false)
  expect(props.save).toHaveBeenCalledTimes(1)
})

it('批量标签一次提交固定成员，删除标签不操作密探', async () => {
  const props = managerProps(); props.value.tags = [{ id: 'team', name: '主力', operator_ids: ['a'] }]; props.selectedIds = ['a', 'b']
  const wrapper = await openManager(props)
  await wrapper.get('select').setValue('team'); await clickText(wrapper, '添加标签')
  expect(props.save).toHaveBeenCalledWith(expect.objectContaining({ tags: [{ id: 'team', name: '主力', operator_ids: ['a', 'b'] }] }))
  await clickText(wrapper, '移除标签')
  expect(props.save).toHaveBeenLastCalledWith(expect.objectContaining({ tags: [{ id: 'team', name: '主力', operator_ids: [] }] }))
})

it('备份先预览，确认仅替换草稿，再保存；切账号清理旧草稿', async () => {
  const props = managerProps(), wrapper = await openManager(props)
  const backup = operatorOrganizationBackup({ ...emptyOperatorOrganization(), pinned_ids: ['a'] }, '如鸢')
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ size: 100, text: async () => JSON.stringify(backup) }] })
  await input.trigger('change'); await flushPromises()
  expect(wrapper.text()).toContain('备份预览：1 位置顶'); expect(props.save).not.toHaveBeenCalled()
  await clickText(wrapper, '用备份替换分类草稿'); expect(props.save).not.toHaveBeenCalled()
  await clickText(wrapper, '保存分类设置'); expect(props.save).toHaveBeenCalledWith(expect.objectContaining({ pinned_ids: ['a'] }), 0)
  await wrapper.setProps({ accountId: 'b', value: remote('b') }); expect(wrapper.find('input[aria-label="标签名称 1"]').exists()).toBe(false)
})

it('云端更新保留脏草稿和旧revision，用户可显式放弃后重新编辑', async () => {
  const props = managerProps(), wrapper = await openManager(props)
  await clickText(wrapper, '新增标签'); await wrapper.get('input[aria-label="标签名称 1"]').setValue('草稿')
  await wrapper.setProps({ value: { ...remote('a', 2), tags: [{ id: 'remote', name: '云端', operator_ids: [] }] } })
  expect(wrapper.text()).toContain('云端分类已有更新'); expect(wrapper.get('input[aria-label="标签名称 1"]').element.value).toBe('草稿')
  await clickText(wrapper, '保存分类设置'); expect(props.save).toHaveBeenLastCalledWith(expect.anything(), 0)
  await clickText(wrapper, '放弃草稿，使用已读取分类'); expect(wrapper.get('input[aria-label="标签名称 1"]').element.value).toBe('云端')
})

it('卡片置顶独立于特别关注，标签点击等待保存结果，不假装写入成功', async () => {
  const wrapper = mount(OperatorOrganizationCard, { props: { operatorId: 'a', name: '甲', pinned: true,
    tags: [{ id: 'team', name: '主力', operator_ids: [] }] } }); wrappers.push(wrapper)
  await wrapper.get('button').trigger('click'); expect(wrapper.emitted('pin')).toHaveLength(1)
  await wrapper.get('input').setValue(true)
  expect(wrapper.emitted('tag')[0]).toEqual(['team', true]); expect(wrapper.get('input').element.checked).toBe(false)
  await wrapper.setProps({ disabled: true }); expect(wrapper.get('button').element.disabled).toBe(true)
})
