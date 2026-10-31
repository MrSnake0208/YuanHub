import { afterEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CatalogFilterSheet from '../src/components/operator/CatalogFilterSheet.vue'
import OperatorFilterDossier from '../src/components/operator/OperatorFilterDossier.vue'
const original = () => ({ search: '杨修', manifestFilter: 'owned', profFilter: 'all', subProfFilter: 'all', rarityFilter: 'all', growthFilters: { eliteEnabled: true, eliteMin: '17', eliteMax: '17', awakened: 'true' } })
let wrapper, mediaChange
function setup() {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: (_, fn) => { mediaChange = fn }, removeEventListener: vi.fn() })))
  wrapper = mount(CatalogFilterSheet, { attachTo: document.body, props: {
    modelValue: original(), profOptions: ['阳'], subProfOptions: ['神纪'], rarityOptions: [{ value: 'all', label: '全部' }, { value: 5, label: '绝密' }],
    countResults: filters => filters.profFilter === '阳' ? 1 : 3,
  } })
}
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = ''; vi.unstubAllGlobals() })
const button = text => [...document.querySelectorAll('.catalog-filter-sheet button')].find(el => el.textContent.trim() === text)
it('修改只更新预览；关闭丢弃，重新打开从当前条件开始', async () => {
  setup()
  await wrapper.get('.catalog-filter-trigger').trigger('click')
  wrapper.findComponent(OperatorFilterDossier).vm.$emit('update:profFilter', '阳')
  await nextTick()
  expect(button('查看 1 位密探')).toBeTruthy()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  document.querySelector('[aria-label="关闭筛选，不应用修改"]').click()
  await nextTick()
  await wrapper.get('.catalog-filter-trigger').trigger('click')
  expect(button('查看 3 位密探')).toBeTruthy()
  button('查看 3 位密探').click()
  await nextTick()
  expect(wrapper.emitted('update:modelValue')[0][0]).toEqual(original())
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
it('确认应用草稿；重置包含搜索和招募状态，确认前不改变列表', async () => {
  setup()
  await wrapper.get('.catalog-filter-trigger').trigger('click')
  wrapper.findComponent(OperatorFilterDossier).vm.$emit('update:profFilter', '阳')
  await nextTick()
  button('查看 1 位密探').click()
  await nextTick()
  expect(wrapper.emitted('update:modelValue')[0][0].profFilter).toBe('阳')
  await wrapper.get('.catalog-filter-trigger').trigger('click')
  button('重置筛选').click()
  await nextTick()
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  button('查看 3 位密探').click()
  expect(wrapper.emitted('update:modelValue')[1][0]).toEqual({ search: '', manifestFilter: 'all', profFilter: 'all', subProfFilter: 'all', rarityFilter: 'all', growthFilters: {} })
})
it('条件标签包括觉醒，取消一项不影响其他条件或原对象', async () => {
  setup()
  expect(wrapper.get('.catalog-filter-trigger').text()).toContain('2')
  await wrapper.get('[aria-label="取消已觉醒筛选"]').trigger('click')
  const value = wrapper.emitted('update:modelValue')[0][0]
  expect(value.growthFilters.awakened).toBe('')
  expect(value.growthFilters.eliteEnabled).toBe(true)
  expect(value.search).toBe('杨修')
  expect(wrapper.props('modelValue').growthFilters.awakened).toBe('true')
})
it('错误范围禁止确认并保留错误提示', async () => {
  setup()
  await wrapper.get('.catalog-filter-trigger').trigger('click')
  wrapper.findComponent(OperatorFilterDossier).vm.$emit('update:growthFilters', { levelEnabled: true, levelMin: '80', levelMax: '20' })
  await nextTick()
  expect(document.querySelector('.catalog-filter-sheet .apply').disabled).toBe(true)
  expect(document.querySelector('[role="alert"]').textContent).toContain('下限不能大于上限')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
it('Escape、账号上下文及桌面切换取消草稿并恢复滚动', async () => {
  setup()
  const before = document.body.style.overflow
  for (const close of [() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), () => wrapper.setProps({ contextKey: 'another-box' }), () => mediaChange({ matches: true })]) {
    await wrapper.get('.catalog-filter-trigger').trigger('click')
    expect(document.body.style.overflow).toBe('hidden')
    await close()
    await nextTick()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe(before)
  }
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})

it('养成弹层支持命盘与标签草稿，取消标签及重置沿用养成默认条件', async () => {
  setup()
  const defaults = { ...original(), search: '', statusFilter: 'registered', discStatusFilter: 'all', tagFilter: '', growthFilters: {} }
  await wrapper.setProps({ showDiscFilter: true, contextLabel: '养成总览', tagOptions: [{ value: 'main', label: '主力队', count: 1 }], modelValue: { ...defaults, tagFilter: 'main' }, resetFilters: () => defaults })
  await wrapper.get('[aria-label="取消主力队筛选"]').trigger('click')
  expect(wrapper.emitted('update:modelValue')[0][0].tagFilter).toBe('')
  await wrapper.get('.catalog-filter-trigger').trigger('click')
  const filter = wrapper.findComponent(OperatorFilterDossier)
  expect(filter.props('showDiscFilter')).toBe(true)
  expect(filter.props('tagOptions')).toHaveLength(1)
  filter.vm.$emit('update:discStatusFilter', 'perfect'); await nextTick()
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  button('重置筛选').click(); await nextTick()
  button('查看 3 位密探').click()
  expect(wrapper.emitted('update:modelValue')[1][0]).toEqual(defaults)
})

it('继承的可提升条件仍可通过标签取消，不影响其他筛选', async () => {
  setup()
  await wrapper.setProps({ modelValue: { ...original(), upgradeReadyFilter: 'huaji' } })
  await wrapper.get('[aria-label="取消可提升化极筛选"]').trigger('click')
  const value = wrapper.emitted('update:modelValue')[0][0]
  expect(value.upgradeReadyFilter).toBe('')
  expect(value.growthFilters).toEqual(original().growthFilters)
  expect(value.manifestFilter).toBe('owned')
})
