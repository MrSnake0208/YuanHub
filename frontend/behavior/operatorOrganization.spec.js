import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOperatorOrganization } from '../src/composables/useOperatorOrganization.js'
import { emptyOperatorOrganization } from '../src/utils/operatorOrganization.js'
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
async function openManager(props = managerProps(), options = {}) {
  const wrapper = mount(OperatorOrganizationManager, { props, ...options }); wrappers.push(wrapper)
  wrapper.get('details').element.open = true; await wrapper.get('details').trigger('toggle'); return wrapper
}
const clickText = async (wrapper, text) => wrapper.findAll('button').find(button => button.text() === text).trigger('click')

it('标签新增/重命名/删除与分组调整只在显式保存时提交，失败保留草稿', async () => {
  const props = managerProps(), wrapper = await openManager(props)
  await clickText(wrapper, '新增标签'); await wrapper.get('input[aria-label="标签名称 1"]').setValue('主力')
  await wrapper.get('button[aria-label="上移养老中"]').trigger('click')
  expect(props.save).not.toHaveBeenCalled()
  await wrapper.get('form').trigger('submit'); await flushPromises()
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

it('云端更新保留脏草稿和旧revision，用户可显式放弃后重新编辑', async () => {
  const props = managerProps(), wrapper = await openManager(props)
  await clickText(wrapper, '新增标签'); await wrapper.get('input[aria-label="标签名称 1"]').setValue('草稿')
  await wrapper.setProps({ value: { ...remote('a', 2), tags: [{ id: 'remote', name: '云端', operator_ids: [] }] } })
  expect(wrapper.text()).toContain('云端分类已有更新'); expect(wrapper.get('input[aria-label="标签名称 1"]').element.value).toBe('草稿')
  await wrapper.get('form').trigger('submit'); expect(props.save).toHaveBeenLastCalledWith(expect.anything(), 0)
  await clickText(wrapper, '放弃修改'); expect(wrapper.get('input[aria-label="标签名称 1"]').element.value).toBe('云端')
})

it('新增标签自动聚焦；空白与重复名称就地提示、关联字段并阻止提交', async () => {
  const props = managerProps(), wrapper = await openManager(props, { attachTo: document.body })
  await clickText(wrapper, '新增标签')
  const first = wrapper.get('input[aria-label="标签名称 1"]')
  expect(document.activeElement).toBe(first.element)
  expect(wrapper.get(`label[for="${first.attributes('id')}"]`).text()).toBe('标签名称 1')
  expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true)
  await first.trigger('blur')
  expect(first.attributes('aria-invalid')).toBe('true')
  expect(document.getElementById(first.attributes('aria-describedby')).textContent).toContain('请输入标签名称')
  await first.setValue('主力'); await clickText(wrapper, '新增标签')
  const second = wrapper.get('input[aria-label="标签名称 2"]')
  await second.setValue(' 主力 ')
  expect(wrapper.findAll('.organization-field-error').some(node => node.text().includes('重复'))).toBe(true)
  expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true)
  await wrapper.get('form').trigger('submit')
  expect(document.activeElement).toBe(first.element); expect(props.save).not.toHaveBeenCalled()
  await second.setValue('备用')
  expect(wrapper.get('button[type="submit"]').element.disabled).toBe(false)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(props.save).toHaveBeenCalledWith(expect.objectContaining({ tags: [expect.objectContaining({ name: '主力' }), expect.objectContaining({ name: '备用' })] }), 0)
})

it('折叠时保留并向外暴露未保存状态；放弃修改恢复已保存分类且不触发写入', async () => {
  const props = managerProps(), wrapper = await openManager(props)
  await clickText(wrapper, '新增标签')
  expect(wrapper.vm.changed).toBe(true)
  wrapper.get('details').element.open = false; await wrapper.get('details').trigger('toggle')
  expect(wrapper.vm.open).toBe(false); expect(wrapper.vm.changed).toBe(true)
  expect(wrapper.find('.organization-filters').exists()).toBe(false)
  wrapper.get('details').element.open = true; await wrapper.get('details').trigger('toggle')
  await clickText(wrapper, '放弃修改')
  expect(wrapper.vm.changed).toBe(false); expect(wrapper.find('[data-tag-name]').exists()).toBe(false)
  expect(props.save).not.toHaveBeenCalled()
})

it('成功反馈紧邻保存操作，后续编辑清理旧成功状态；加载失败可在折叠状态重试', async () => {
  const props = managerProps(); let wrapper
  props.save.mockImplementation(async content => {
    await wrapper.setProps({ value: { ...content, account_id: 'a', revision: 1 } }); return true
  })
  wrapper = await openManager(props)
  expect(wrapper.text()).toContain('还没有置顶密探')
  await clickText(wrapper, '新增标签'); await wrapper.get('[data-tag-name]').setValue('主力')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.organization-actions').text()).toContain('分类设置已保存')
  expect(wrapper.vm.changed).toBe(false)
  await wrapper.get('[data-tag-name]').setValue('备用')
  expect(wrapper.get('.organization-actions').text()).not.toContain('分类设置已保存')
  await wrapper.setProps({ error: 'offline' })
  expect(wrapper.get('.organization-save-area [role="alert"]').text()).toContain('offline')
  wrapper.get('details').element.open = false; await wrapper.get('details').trigger('toggle')
  await clickText(wrapper, '重新读取分类'); expect(props.reload).toHaveBeenCalledTimes(1)
})

it('卡片置顶独立于特别关注，标签点击等待保存结果，不假装写入成功', async () => {
  const wrapper = mount(OperatorOrganizationCard, { props: { operatorId: 'a', name: '甲', pinned: true,
    tags: [{ id: 'team', name: '主力', operator_ids: [] }] } }); wrappers.push(wrapper)
  await wrapper.get('button').trigger('click'); expect(wrapper.emitted('pin')).toHaveLength(1)
  await wrapper.get('input').setValue(true)
  expect(wrapper.emitted('tag')[0]).toEqual(['team', true]); expect(wrapper.get('input').element.checked).toBe(false)
  await wrapper.setProps({ disabled: true }); expect(wrapper.get('button').element.disabled).toBe(true)
})

it('局域网 HTTP 缺少 randomUUID 时仍能新增标签并在保存时提交有效 ID', async () => {
  const cryptoSource = globalThis.crypto
  vi.stubGlobal('crypto', { getRandomValues: cryptoSource.getRandomValues.bind(cryptoSource) })
  try {
    const props = managerProps(), wrapper = await openManager(props)
    await clickText(wrapper, '新增标签')
    await wrapper.get('input[aria-label="标签名称 1"]').setValue('主力队')
    expect(props.save).not.toHaveBeenCalled()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const tag = props.save.mock.calls[0][0].tags[0]
    expect(tag.name).toBe('主力队')
    expect(tag.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  } finally {
    vi.unstubAllGlobals()
  }
})

it('手机分类设置关闭时保护草稿，继续编辑和放弃关闭均不写入', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  try {
    const props = { ...managerProps(), mobileSheet: true }
    const wrapper = mount(OperatorOrganizationManager, { props, attachTo: document.body }); wrappers.push(wrapper)
    wrapper.vm.toggle(); await flushPromises()
    expect(document.querySelector('[role="dialog"][aria-label="分类设置"]')).toBeTruthy()
    document.querySelector('.organization-sheet .organization-add').click(); await flushPromises()
    const input = document.querySelector('.organization-sheet [data-tag-name]')
    input.value = '手机草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises()
    document.querySelector('[aria-label="关闭分类设置"]').click(); await flushPromises()
    expect(document.querySelector('.organization-close-confirm').textContent).toContain('尚未保存')
    const find = text => [...document.querySelectorAll('.organization-close-confirm button')].find(button => button.textContent === text)
    find('继续编辑').click(); await flushPromises()
    expect(document.querySelector('.organization-sheet [data-tag-name]').value).toBe('手机草稿')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await flushPromises()
    find('放弃修改并关闭').click(); await flushPromises()
    expect(document.querySelector('.organization-sheet-mask')).toBeNull()
    expect(wrapper.vm.changed).toBe(false)
    expect(props.save).not.toHaveBeenCalled()
  } finally { vi.unstubAllGlobals() }
})

it('手机分类设置保存失败保留草稿，保存成功才关闭弹层', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  try {
    const props = { ...managerProps(), mobileSheet: true }
    props.save.mockRejectedValueOnce(new Error('网络错误')).mockResolvedValueOnce(true)
    const wrapper = mount(OperatorOrganizationManager, { props, attachTo: document.body }); wrappers.push(wrapper)
    wrapper.vm.toggle(); await flushPromises()
    document.querySelector('.organization-sheet .organization-add').click(); await flushPromises()
    const input = document.querySelector('.organization-sheet [data-tag-name]')
    input.value = '主力'; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises()
    document.querySelector('.organization-sheet form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises()
    expect(document.querySelector('.organization-sheet').textContent).toContain('网络错误')
    expect(document.querySelector('.organization-sheet [data-tag-name]').value).toBe('主力')
    document.querySelector('.organization-sheet form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises()
    expect(document.querySelector('.organization-sheet-mask')).toBeNull()
  } finally { vi.unstubAllGlobals() }
})

it('手机切换桌面移动同一表单，保留草稿并解除背景滚动锁', async () => {
  let change
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: (_, fn) => { change = fn }, removeEventListener: vi.fn() })))
  try {
    const wrapper = mount(OperatorOrganizationManager, { props: { ...managerProps(), mobileSheet: true }, attachTo: document.body }); wrappers.push(wrapper)
    const previous = document.body.style.overflow
    wrapper.vm.toggle(); await flushPromises()
    document.querySelector('.organization-sheet .organization-add').click(); await flushPromises()
    const input = document.querySelector('.organization-sheet [data-tag-name]')
    input.value = '保留草稿'; input.dispatchEvent(new Event('input', { bubbles: true })); await flushPromises()
    change({ matches: false }); await flushPromises()
    expect(document.querySelector('.organization-sheet-mask')).toBeNull()
    expect(wrapper.get('[data-tag-name]').element).toBe(input)
    expect(input.value).toBe('保留草稿')
    expect(wrapper.vm.changed).toBe(true)
    expect(document.body.style.overflow).toBe(previous)
  } finally { vi.unstubAllGlobals() }
})
