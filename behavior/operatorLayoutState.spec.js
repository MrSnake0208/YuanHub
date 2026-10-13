import { expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StarLoadoutModal from '../src/components/operator/StarLoadoutModal.vue'
import StarLoadoutEditor from '../src/components/operator/StarLoadoutEditor.vue'
import { installViewport } from '../test-support/viewport.js'

it.each([390, 1440])('真实星石弹窗跨布局保留编辑器、分组、搜索和焦点：%ipx', async width => {
  const viewport = installViewport(width)
  const wrapper = mount(StarLoadoutModal, { attachTo: document.body,
    props: { open: true, targetOperator: { id: 'op', name: '测试密探' }, inventoryEntries: [], draftLoadouts: {} },
  })
  await flushPromises()
  const editor = wrapper.getComponent(StarLoadoutEditor).vm.$
  document.querySelectorAll('.star-slot-group')[1].click(); await flushPromises()
  const query = document.querySelector('.star-query input')
  query.value = '天府'; query.dispatchEvent(new Event('input', { bubbles: true })); query.focus()
  await flushPromises()
  for (const next of [640, 641, 700, 701, 900, 1080, 1081, 320, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent(StarLoadoutEditor).vm.$).toBe(editor)
    expect(document.querySelectorAll('[role="dialog"][aria-label="星石装配"]')).toHaveLength(1)
    expect(document.querySelectorAll('.star-slot-group')[1].classList.contains('active')).toBe(true)
    expect(query.value).toBe('天府')
    expect(document.activeElement).toBe(query)
    expect(wrapper.emitted('update:draftLoadouts')).toBeUndefined()
    expect(wrapper.emitted('request-close')).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  }
})
