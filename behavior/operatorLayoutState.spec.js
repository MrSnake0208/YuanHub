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

it('星石空状态区分库存与筛选；六槽位可聚焦选择并沿用装备草稿', async () => {
  const wrapper = mount(StarLoadoutEditor, { props: { inline: true, targetOperator: { id: 'op' } } })
  expect(wrapper.get('.star-empty-state').text()).toContain('暂无星石库存')
  expect(wrapper.findAll('.star-slot-pick')).toHaveLength(6)
  await wrapper.setProps({ inventoryEntries: [{ instance_id: 'a', name: '天府', kind: 'main', level: 10 }] })
  expect(wrapper.find('.star-empty-state').exists()).toBe(false)
  await wrapper.get('.star-query input').setValue('不存在')
  expect(wrapper.get('.star-empty-state').text()).toContain('没有符合条件的星石')
  await wrapper.get('.star-query input').setValue('')
  await wrapper.findAll('.star-slot-pick')[1].trigger('click')
  expect(wrapper.get('.star-active-slot').text()).toBe('正在选择：主星2')
  expect(wrapper.findAll('.star-slot-pick')[1].attributes('aria-pressed')).toBe('true')
  expect(wrapper.emitted('update:draftLoadouts')).toBeUndefined()
  await wrapper.get('.star-candidate').trigger('click')
  const next = wrapper.emitted('update:draftLoadouts').at(-1)[0]
  expect(next.op.main2).toBe('a')
  await wrapper.setProps({ draftLoadouts: next })
  expect(wrapper.findAll('.star-slot-pick')[1].text()).toContain('天府')
  await wrapper.get('[aria-label="卸下主星2"]').trigger('click')
  expect(wrapper.emitted('update:draftLoadouts').at(-1)[0].op.main2).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
