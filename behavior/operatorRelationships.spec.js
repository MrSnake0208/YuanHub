import { computed, defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOperatorRelationships } from '../src/composables/useOperatorRelationships.js'
import OperatorRelationships from '../src/pages/operator/OperatorRelationships.vue'
import { getRelationshipCatalog, getRelationships, patchRelationships } from '../src/api/operatorRelationships.js'
import { deferred } from '../test-support/factories.js'
vi.mock('../src/api/operatorRelationships.js', () => ({ getRelationshipCatalog: vi.fn(), getRelationships: vi.fn(), patchRelationships: vi.fn() }))
const confirm = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../src/utils/useUnsavedChanges.js', () => ({ useUnsavedChanges: () => confirm }))
const remote = (account = 'a', revision = 0, entries = {}) => ({ account_id: account, game: '如鸢', revision, catalog_version: 'test', entries })
const wrappers = []
let state, account, user, enabled
function harness() {
  const wrapper = mount(defineComponent({ setup() {
    account = ref('a'); user = ref('u'); enabled = ref(true)
    state = useOperatorRelationships(computed(() => ({ key: JSON.stringify([account.value, user.value, enabled.value]), accountId: account.value, game: '如鸢', enabled: enabled.value && !!account.value })))
    return {}
  }, template: '<div />' }))
  wrappers.push(wrapper); return wrapper
}
beforeEach(() => {
  vi.clearAllMocks(); confirm.mockResolvedValue(true)
  getRelationshipCatalog.mockResolvedValue({ game: '如鸢', version: 'test', operators: {} })
  getRelationships.mockImplementation(async id => remote(id))
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))
it('initialization is read-only, empty/disabled scope does not request, failures block writes', async () => {
  getRelationships.mockRejectedValueOnce(new Error('offline')); harness(); await flushPromises()
  expect(state.ready.value).toBe(false); expect(await state.save({ a: { trust: 0 } })).toBe(false)
  expect(patchRelationships).not.toHaveBeenCalled()
  await state.reload(); expect(state.ready.value).toBe(true)
  account.value = ''; await flushPromises(); expect(state.data.value).toBe(null)
  expect(getRelationships).toHaveBeenCalledTimes(2)
})
it('A to B to A and user changes ignore late reads and saves', async () => {
  const first = deferred(); getRelationships.mockImplementationOnce(() => first.promise)
  harness(); account.value = 'b'; await flushPromises(); account.value = 'a'; await flushPromises()
  first.resolve(remote('a', 99)); await flushPromises(); expect(state.data.value.revision).toBe(0)
  const pending = deferred(); patchRelationships.mockReturnValueOnce(pending.promise)
  const writing = state.save({ op: { trust: 0 } })
  user.value = 'other'; await flushPromises(); pending.resolve(remote('a', 100)); await writing
  expect(state.data.value.revision).toBe(0)
})
it('save sends exact account and versions, duplicate saves blocked, conflict requires reload', async () => {
  harness(); await flushPromises()
  const pending = deferred(); patchRelationships.mockReturnValueOnce(pending.promise)
  const write = state.save({ op: { trust: 0 } }); expect(await state.save({ op: { trust: 1 } })).toBe(false)
  expect(patchRelationships).toHaveBeenCalledWith('a', { expected_revision: 0, catalog_version: 'test', entries: { op: { trust: 0 } } })
  pending.resolve(remote('a', 1, { op: { trust: 0 } })); expect(await write).toBe(true)
  patchRelationships.mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  expect(await state.save({ op: { rumors: 1 } })).toBe(false); expect(state.ready.value).toBe(false)
  expect(state.data.value.entries.op.trust).toBe(0)
  await state.reload(); expect(state.ready.value).toBe(true)
})
it('response ownership mismatch and unmount cannot mutate the state', async () => {
  getRelationships.mockResolvedValueOnce(remote('foreign')); const wrapper = harness(); await flushPromises()
  expect(state.error.value).toContain('账号'); expect(state.ready.value).toBe(false)
  const pending = deferred(); getRelationships.mockReturnValueOnce(pending.promise)
  const reading = state.reload(); wrapper.unmount(); pending.resolve(remote('a', 8)); await reading
  expect(state.data.value).toBe(null)
})
const props = { accountId: 'a', accountName: '测试账号', game: '如鸢', userId: 'u', loggedIn: true, operators: [{ id: 'op', name: '测试密探', rarity: 5 }], allOperators: [{ id: 'op', name: '测试密探', rarity: 5 }] }
const button = (wrapper, text) => wrapper.findAll('button').find(x => x.text() === text)
it('real form preserves zero, failed drafts, null clear, and never invents rewards', async () => {
  const wrapper = mount(OperatorRelationships, { props }); wrappers.push(wrapper); await flushPromises()
  expect(wrapper.text()).toContain('奖励资料待核准'); expect(wrapper.text()).toContain('未记录')
  await button(wrapper, '编辑进度').trigger('click'); await flushPromises()
  const fields = wrapper.findAll('.relationship-editor input')
  await fields[0].setValue('0'); await fields[1].setValue('3')
  patchRelationships.mockRejectedValueOnce(new Error('offline'))
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.findAll('.relationship-editor input')[0].element.value).toBe('0'); expect(wrapper.text()).toContain('offline')
  patchRelationships.mockResolvedValueOnce(remote('a', 1, { op: { trust: 0, rumors: 3 } }))
  await wrapper.find('form').trigger('submit'); await flushPromises(); expect(wrapper.text()).toContain('进度已保存')
  await button(wrapper, '编辑进度').trigger('click'); await flushPromises()
  await wrapper.findAll('.relationship-editor input')[0].setValue('')
  patchRelationships.mockResolvedValueOnce(remote('a', 2, { op: { rumors: 3 } }))
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(patchRelationships.mock.calls.at(-1)[1].entries).toEqual({ op: { trust: null } })
})
it('restore requires preview, defaults to preserve, and account change invalidates preview', async () => {
  getRelationships.mockImplementation(async id => remote(id, 2, { op: { trust: 0 } }))
  const wrapper = mount(OperatorRelationships, { props }); wrappers.push(wrapper); await flushPromises()
  const text = JSON.stringify({ format: 'yuanhub-relationships', schema_version: 1, game: '如鸢', entries: [{ operator_id: 'op', trust: 100, rumors: 2 }] })
  await wrapper.find('textarea').setValue(text); await button(wrapper, '预览恢复').trigger('click')
  expect(patchRelationships).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('将修改 1 个进度值')
  patchRelationships.mockResolvedValueOnce(remote('a', 3, { op: { trust: 0, rumors: 2 } }))
  await button(wrapper, '确认恢复到当前账号').trigger('click'); await flushPromises()
  expect(patchRelationships.mock.calls[0][1].entries).toEqual({ op: { rumors: 2 } })
  await wrapper.find('textarea').setValue(text); await button(wrapper, '预览恢复').trigger('click')
  await wrapper.setProps({ accountId: 'b' }); await flushPromises()
  expect(wrapper.find('.relationships-preview').exists()).toBe(false); expect(wrapper.find('textarea').element.value).toBe('')
})
const sharedRules = {
  op: { trust_owner_id: 'op', trust: { max: 2000, complete: true, verified_on: '2026-10-22', source: 'fixture', milestones: Array.from({ length: 15 }, (_, i) => ({ at: i < 10 ? (i + 1) * 100 : 1200 + (i - 10) * 200, rewards: [{ item_key: 'coin', name: '测试币', quantity: 1 }] })) }, rumors: null },
  sp: { trust_owner_id: 'op', rumors: null },
}
const sharedProps = { ...props, operators: [...props.operators, { id: 'sp', name: '电影形态', rarity: 5 }], allOperators: [...props.allOperators, { id: 'sp', name: '电影形态', rarity: 5 }] }
it('legacy movie-only trust displays the common 15-level profile and counts rewards once', async () => {
  getRelationshipCatalog.mockResolvedValue({ game: '如鸢', version: 'test', operators: sharedRules })
  getRelationships.mockResolvedValue(remote('a', 1, { sp: { trust: 1800 } }))
  const wrapper = mount(OperatorRelationships, { props: sharedProps }); wrappers.push(wrapper); await flushPromises()
  expect(wrapper.text()).toContain('信赖等级 14 / 15')
  expect(wrapper.text()).toContain('信赖可计算 1 / 1 组')
  expect(wrapper.get('.relationships-summary').text()).toContain('测试币 × 1')
  expect(patchRelationships).not.toHaveBeenCalled()
  await button(wrapper, '编辑进度').trigger('click'); await flushPromises()
  expect(wrapper.find('.relationship-editor input').element.value).toBe('1800')
})
it('legacy conflicts need explicit confirmation, failed saves retain drafts, successful clear is explicit null', async () => {
  getRelationshipCatalog.mockResolvedValue({ game: '如鸢', version: 'test', operators: sharedRules })
  getRelationships.mockResolvedValue(remote('a', 1, { op: { trust: 100 }, sp: { trust: 200, rumors: 3 } }))
  const wrapper = mount(OperatorRelationships, { props: sharedProps }); wrappers.push(wrapper); await flushPromises()
  expect(wrapper.text()).toContain('历史记录冲突'); expect(wrapper.text()).toContain('测试密探 100、电影形态 200')
  expect(wrapper.text()).toContain('信赖可计算 0 / 1 组')
  await button(wrapper, '编辑进度').trigger('click'); await flushPromises()
  await wrapper.find('.relationship-editor input').setValue('150')
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(patchRelationships).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('请先勾选已核对')
  await wrapper.find('.relationship-editor input[type="checkbox"]').setValue(true)
  patchRelationships.mockRejectedValueOnce(new Error('offline'))
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('.relationship-editor input').element.value).toBe('150')
  expect(wrapper.find('.relationship-editor input[type="checkbox"]').element.checked).toBe(true)
  await wrapper.find('.relationship-editor input').setValue('')
  patchRelationships.mockResolvedValueOnce(remote('a', 2, { sp: { rumors: 3 } }))
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(patchRelationships.mock.calls.at(-1)[1].entries).toEqual({ op: { trust: null } })
  expect(wrapper.text()).not.toContain('历史记录冲突')
})
