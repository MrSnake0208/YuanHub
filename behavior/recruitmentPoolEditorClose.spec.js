import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AppDialog from '../src/components/AppDialog.vue'
import PoolEditor from '../src/pages/recruitment/PoolEditor.vue'
import { dialog } from '../src/utils/dialog.js'
import { deferred, recruitmentCatalog, recruitmentEvent, recruitmentFixture } from '../test-support/recruitment.js'

const render = props => mount(PoolEditor, { attachTo: document.body, props: {
  open: true, pool: recruitmentFixture().pools[0], recordsRevision: 3,
  records: [{ ...recruitmentEvent('old', 17), agent_snapshot: { agent_id: 'a', name: '甲' } }],
  canRecord: true, catalog: recruitmentCatalog().pools, agents: [{ id: 'a', name: '甲' }], ...props,
}, global: { stubs: { Teleport: true } } })
const button = (wrapper, text) => wrapper.findAll('button').find(item => item.text() === text)
async function attemptClose(wrapper, via) {
  if (via === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  else await wrapper.get(via === 'mask' ? '.modal-mask' : '.close-button').trigger('click')
  await flushPromises()
}
afterEach(() => dialog._cancel())

it.each(['button', 'mask', 'escape'])('%s关闭有修改时确认，取消保留输入，确认只关闭而不写入', async via => {
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(false)
  const wrapper = render()
  await wrapper.get('.remaining-field input').setValue('33')
  await attemptClose(wrapper, via)
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', confirmText: '放弃并关闭', cancelText: '继续编辑' }))
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(wrapper.get('.remaining-field input').element.value).toBe('33')
  confirm.mockResolvedValue(true)
  await attemptClose(wrapper, via)
  expect(wrapper.emitted('close')).toHaveLength(1)
  expect(wrapper.emitted('save')).toBeUndefined()
})

it('真实确认弹窗默认聚焦继续编辑，Esc只取消确认并保留卡池草稿', async () => {
  const wrapper = render()
  const confirmation = mount(AppDialog, { attachTo: document.body, global: { stubs: { Teleport: true } } })
  await wrapper.get('.remaining-field input').setValue('33')
  await attemptClose(wrapper, 'button')
  expect(confirmation.get('.dialog-foot').text()).toContain('放弃并关闭')
  expect(document.activeElement).toBe(confirmation.get('.dlg-btn.ghost').element)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(confirmation.find('.dialog').exists()).toBe(false)
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(wrapper.get('.remaining-field input').element.value).toBe('33')
  await attemptClose(wrapper, 'button')
  await confirmation.get('.dlg-btn.primary').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('close')).toHaveLength(1)
})

it.each(['initial', 'mode', 'view-record', 'empty-search', 'reverted'])('%s没有实际修改时直接关闭', async action => {
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(false)
  const wrapper = render()
  if (action === 'mode') await button(wrapper, '已垫').trigger('click')
  if (action === 'view-record') await wrapper.get('.gacha-record .record-detail').trigger('click')
  if (action === 'empty-search') await wrapper.get('.add-record').trigger('click')
  if (action === 'reverted') {
    await wrapper.get('.remaining-field input').setValue('33')
    await wrapper.get('.remaining-field input').setValue('40')
  }
  expect(wrapper.vm.hasDraft()).toBe(false)
  await attemptClose(wrapper, 'button')
  expect(confirm).not.toHaveBeenCalled()
  expect(wrapper.emitted('close')).toHaveLength(1)
})

it.each(['new-record', 'edited-record', 'deleted-record', 'invalid-record'])('%s草稿或未完成输入受到关闭保护', async action => {
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(false)
  const wrapper = render()
  if (action === 'new-record') {
    await wrapper.get('.add-record').trigger('click')
    await wrapper.get('.agent-choice[data-agent-id="a"]').trigger('click')
  } else {
    await wrapper.get('.gacha-record .record-detail').trigger('click')
    if (action === 'deleted-record') await button(wrapper, '删除记录').trigger('click')
    else await wrapper.get('.pull-count-field input').setValue(action === 'invalid-record' ? '1.5' : '20')
  }
  expect(wrapper.vm.hasDraft()).toBe(true)
  await attemptClose(wrapper, 'button')
  expect(confirm).toHaveBeenCalledTimes(1)
  expect(wrapper.vm.hasDraft()).toBe(true)
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(wrapper.emitted('save')).toBeUndefined()
})

it.each(['reopen', 'switch-pool', 'unmount', 'busy'])('确认不重复打开，%s后旧确认不关闭当前卡池', async change => {
  const answer = deferred()
  const confirm = vi.spyOn(dialog, 'confirm').mockReturnValue(answer.promise)
  const wrapper = render()
  await wrapper.get('.remaining-field input').setValue('33')
  await attemptClose(wrapper, 'button')
  await attemptClose(wrapper, 'mask')
  expect(confirm).toHaveBeenCalledTimes(1)
  if (change === 'reopen') {
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true, pool: { ...recruitmentFixture().pools[0], progress: 12 } })
  }
  if (change === 'switch-pool') await wrapper.setProps({ pool: { ...recruitmentFixture().pools[0], pool_id: 'other-pool' } })
  if (change === 'unmount') wrapper.unmount()
  if (change === 'busy') await wrapper.setProps({ busy: true })
  answer.resolve(true)
  await flushPromises()
  expect(wrapper.emitted('close')).toBeUndefined()
  if (change === 'reopen') {
    expect(wrapper.get('.remaining-field input').element.value).toBe('28')
    await attemptClose(wrapper, 'button')
    expect(wrapper.emitted('close')).toHaveLength(1)
  }
})

it('保存读回核对完成且没有新修改时直接关闭', async () => {
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(false)
  const wrapper = render({ records: [] })
  await wrapper.get('.remaining-field input').setValue('33')
  await wrapper.get('form').trigger('submit')
  const receipt = { ...wrapper.emitted('save')[0][0].data, revision: 4 }
  await wrapper.setProps({ pool: { ...recruitmentFixture().pools[0], progress: 7 }, recordsRevision: 4, saveReceipt: receipt })
  expect(wrapper.get('.save-result.is-confirmed').exists()).toBe(true)
  expect(wrapper.vm.hasDraft()).toBe(false)
  await attemptClose(wrapper, 'button')
  expect(confirm).not.toHaveBeenCalled()
  expect(wrapper.emitted('close')).toHaveLength(1)
})
