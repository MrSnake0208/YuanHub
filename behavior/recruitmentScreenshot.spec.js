import { afterEach, expect, it, vi } from 'vitest'
import { DOMWrapper, mount, flushPromises } from '@vue/test-utils'
import PoolEditor from '../src/pages/recruitment/PoolEditor.vue'
import { dialog } from '../src/utils/dialog.js'
import { recruitmentCatalog, recruitmentEvent, recruitmentFixture } from '../test-support/recruitment.js'

const render = (props = {}, teleport = true) => mount(PoolEditor, {
  attachTo: document.body,
  props: {
    open: true, pool: recruitmentFixture().pools[0], recordsRevision: 3, canRecord: true,
    records: [
      { ...recruitmentEvent('A', 17), agent_snapshot: { agent_id: 'a', name: '甲' }, up_status: 'non_up' },
      { ...recruitmentEvent('B', null), agent_snapshot: { agent_id: 'b', name: '乙' } },
    ],
    catalog: recruitmentCatalog().pools, agents: [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], ...props,
  },
  global: { stubs: { Teleport: teleport } },
})
afterEach(() => dialog._cancel())
const isScreenshot = wrapper => wrapper.get('.pool-editor').classes().includes('is-screenshot')

it.each(['progress', 'agents'])('截图模式保留%s结果样式，隐藏编辑工具且阻止编辑与排序', async view => {
  const wrapper = render()
  await flushPromises()
  if (view === 'agents') await wrapper.get('[aria-label="密探视图"]').trigger('click')
  const selector = view === 'progress' ? '.record-bar' : '.agent-pull-badge'
  const results = () => wrapper.findAll(selector).map(node => ({ text: node.text(), classes: node.classes(), style: node.attributes('style') }))
  const before = results()
  await wrapper.get('.screenshot-entry').trigger('click')
  expect(isScreenshot(wrapper)).toBe(true)
  expect(results()).toEqual(before)
  expect(wrapper.get('.non-up-stamp').text()).toBe('歪')
  for (const selector of ['.entry-section', '.record-search', '.sort-help', '.remaining-guide', '.record-view-switch', 'footer', '.close-button', '.screenshot-entry']) {
    expect(wrapper.get(selector).isVisible()).toBe(false)
  }
  expect(document.activeElement).toBe(wrapper.get('.screenshot-exit').element)
  const handle = wrapper.get('.record-handle')
  expect(handle.element.disabled).toBe(true)
  expect(handle.attributes('aria-label')).not.toContain('编辑')
  await handle.trigger('keydown', { key: 'ArrowDown' })
  await wrapper.get(view === 'progress' ? '.record-detail' : '.agent-record-detail').trigger('click')
  await wrapper.get('form').trigger('submit')
  expect(wrapper.find('.entry-composer').exists()).toBe(false)
  expect(wrapper.vm.hasDraft()).toBe(false)
  expect(wrapper.emitted('save')).toBeUndefined()
  expect(results()).toEqual(before)
  await wrapper.get('.screenshot-exit').trigger('click')
  expect(isScreenshot(wrapper)).toBe(false)
  expect(wrapper.get('.entry-section').isVisible()).toBe(true)
  expect(wrapper.get(`[aria-label="${view === 'progress' ? '进度条' : '密探'}视图"]`).attributes('aria-pressed')).toBe('true')
})

it('截图展示全部已加载记录，退出恢复搜索、滚动和入口焦点，Escape不关闭档案', async () => {
  const wrapper = render({}, false)
  const ui = new DOMWrapper(document.body)
  await flushPromises()
  await ui.get('.record-search input').setValue('甲')
  expect(ui.findAll('.gacha-record')).toHaveLength(1)
  ui.get('.editor-body').element.scrollTop = 160
  await ui.get('.editor-body').trigger('scroll')
  await ui.get('.screenshot-entry').trigger('click')
  expect(ui.findAll('.gacha-record')).toHaveLength(2)
  expect(ui.get('.editor-body').element.scrollTop).toBe(0)
  expect(ui.get('.pool-editor').classes()).not.toContain('is-header-compact')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await flushPromises()
  expect(isScreenshot(ui)).toBe(false)
  expect(ui.findAll('.gacha-record')).toHaveLength(1)
  expect(ui.get('.record-search input').element.value).toBe('甲')
  expect(ui.get('.editor-body').element.scrollTop).toBe(160)
  expect(document.activeElement).toBe(ui.get('.screenshot-entry').element)
  expect(wrapper.emitted('close')).toBeUndefined()
  expect(wrapper.emitted('save')).toBeUndefined()
})

it.each(['progress', 'entry', 'edit', 'delete', 'order'])('%s未保存时提示返回编辑，不进入截图、不保存或丢弃', async action => {
  const alert = vi.spyOn(dialog, 'alert').mockResolvedValue(true)
  const wrapper = render()
  await flushPromises()
  if (action === 'progress') await wrapper.get('.remaining-field input').setValue('12')
  else if (action === 'entry') {
    await wrapper.get('.add-record').trigger('click')
    await wrapper.get('.agent-choice[data-agent-id="a"]').trigger('click')
  } else if (action === 'order') await wrapper.get('.record-handle').trigger('keydown', { key: 'ArrowDown' })
  else {
    await wrapper.get('.record-detail').trigger('click')
    if (action === 'edit') await wrapper.get('.pull-count-field input').setValue('20')
    else await wrapper.get('.entry-delete').trigger('click')
  }
  expect(wrapper.vm.hasDraft()).toBe(true)
  await wrapper.get('.screenshot-entry').trigger('click')
  expect(alert).toHaveBeenCalledWith(expect.objectContaining({ confirmText: '返回编辑' }))
  expect(isScreenshot(wrapper)).toBe(false)
  expect(wrapper.vm.hasDraft()).toBe(true)
  expect(wrapper.emitted('save')).toBeUndefined()
  expect(wrapper.emitted('close')).toBeUndefined()
})

it.each([{ busy: true }, { recordsLoading: true }, { recordsError: '读取失败' }, { saveReceipt: { requestId: 'unconfirmed', entries: [] } }])('读取或保存状态未就绪时禁止进入截图：%j', async props => {
  const wrapper = render(props)
  expect(wrapper.get('.screenshot-entry').element.disabled).toBe(true)
  await wrapper.get('.screenshot-entry').trigger('click')
  expect(isScreenshot(wrapper)).toBe(false)
})

it('只读档案可截图，分页未读完保留提示与加载入口，重新打开恢复编辑布局', async () => {
  const wrapper = render({ readOnly: true, hasMore: true })
  await wrapper.get('.screenshot-entry').trigger('click')
  expect(isScreenshot(wrapper)).toBe(true)
  expect(wrapper.get('.records-heading').text()).toContain('尚未读完')
  await wrapper.get('.load-more').trigger('click')
  expect(wrapper.emitted('load-more')).toHaveLength(1)
  await wrapper.setProps({ open: false })
  await wrapper.setProps({ open: true })
  expect(isScreenshot(wrapper)).toBe(false)
  expect(wrapper.emitted('save')).toBeUndefined()
})
