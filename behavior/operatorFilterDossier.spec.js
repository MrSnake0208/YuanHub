import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorFilterDossier from '../src/components/operator/OperatorFilterDossier.vue'
import OperatorGrowthFilters from '../src/components/operator/OperatorGrowthFilters.vue'

const empty = {
  levelMin: '', levelMax: '', levelEnabled: false,
  eliteMin: '', eliteMax: '', eliteEnabled: false,
  starMin: '', starMax: '', starEnabled: false
}

it('填写数值不自动启用，开关保留输入，预设可一键启用或关闭', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { growthFilters: { ...empty }, showGrowthFilters: true } })
  await wrapper.get('summary').trigger('click')
  await wrapper.get('[aria-label="等级至少"]').setValue('80')
  const draft = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(draft).toMatchObject({ levelMin: '80', levelEnabled: false })
  await wrapper.setProps({ growthFilters: draft })
  expect(wrapper.get('summary').text()).toContain('已保存')
  await wrapper.get('[aria-label="启用等级筛选"]').setValue(true)
  const enabled = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(enabled).toMatchObject({ levelMin: '80', levelEnabled: true })
  await wrapper.setProps({ growthFilters: enabled })
  await wrapper.get('[aria-label="启用等级筛选"]').setValue(false)
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ levelMin: '80', levelEnabled: false })

  const levelPreset = wrapper.findAll('.growth-filter-presets button').find(button => button.text() === '等级 100')
  await levelPreset.trigger('click')
  const preset = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(preset).toMatchObject({ levelMin: '100', levelMax: '100', levelEnabled: true })
  await wrapper.setProps({ growthFilters: preset })
  expect(levelPreset.attributes('aria-pressed')).toBe('true')
  await levelPreset.trigger('click')
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ levelMin: '100', levelMax: '100', levelEnabled: false })
  wrapper.unmount()
})

it('觉醒是星数第 6 档，预设启用或关闭后可继续修改星数范围', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { growthFilters: { ...empty, starMin: '2', starEnabled: true }, showGrowthFilters: true } })
  const awakenedPreset = wrapper.findAll('.growth-filter-presets button').find(button => button.text() === '只看觉醒')
  await awakenedPreset.trigger('click')
  const awakened = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(awakened).toMatchObject({ starMin: '6', starMax: '6', starEnabled: true })
  await wrapper.setProps({ growthFilters: awakened })
  expect(awakenedPreset.attributes('aria-pressed')).toBe('true')
  await awakenedPreset.trigger('click')
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ starMin: '6', starMax: '6', starEnabled: false })
  await wrapper.get('summary').trigger('click')
  expect(wrapper.get('[aria-label="星数至少"]').attributes('max')).toBe('6')
  expect(wrapper.find('.growth-awakened').exists()).toBe(false)
  await wrapper.get('[aria-label="星数至多"]').setValue('5')
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ starMax: '5' })
  await wrapper.findAll('.growth-filter-presets button').find(button => button.text() === '四星以上').trigger('click')
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ starMin: '4', starMax: '', starEnabled: true })
  wrapper.unmount()
})

it('范围颠倒仅在对应筛选启用时提示错误', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { growthFilters: { ...empty, eliteMin: '12', eliteMax: '10' }, showGrowthFilters: true } })
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  await wrapper.setProps({ growthFilters: { ...empty, eliteMin: '12', eliteMax: '10', eliteEnabled: true } })
  expect(wrapper.get('[role="alert"]').text()).toBe('修为下限不能大于上限')
  wrapper.unmount()
})

it('图鉴复用的养成筛选同时提供预设与可独立启用的自定义范围', async () => {
  const wrapper = mount(OperatorGrowthFilters, { props: { modelValue: { ...empty } } })
  expect(wrapper.get('[aria-label="养成快捷预设"]').exists()).toBe(true)
  expect(wrapper.get('summary').text()).toContain('自定义范围')
  await wrapper.get('summary').trigger('click')
  await wrapper.get('[aria-label="修为至少"]').setValue('12')
  const draft = wrapper.emitted('update:modelValue').at(-1)[0]
  expect(draft).toMatchObject({ eliteMin: '12', eliteEnabled: false })
  await wrapper.setProps({ modelValue: draft })
  expect(wrapper.get('summary').text()).toContain('已保存')
  await wrapper.get('[aria-label="启用修为筛选"]').setValue(true)
  expect(wrapper.emitted('update:modelValue').at(-1)[0]).toMatchObject({ eliteMin: '12', eliteEnabled: true })
  wrapper.unmount()
})

it('同一筛选组件呈现在册、独立弃置和显式全部的计数与选中语义', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: {
    totalCount: 4, statusFilter: 'registered', statusCounts: { registered: 3, growing: 1, graduated: 1, inactive: 1, discarded: 1 },
    statusOptions: [
      { value: 'registered', label: '在册' }, { value: 'growing', label: '养成中' },
      { value: 'graduated', label: '已毕业' }, { value: 'inactive', label: '养老中' },
      { value: 'discarded', label: '已弃置', separateGroup: true }, { value: 'all', label: '全部（含已弃置）' },
    ],
  } })
  expect(wrapper.get('.status-registered').text()).toBe('在册3')
  expect(wrapper.get('.status-registered').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('.status-discarded').text()).toBe('已弃置1')
  expect(wrapper.get('.status-all').text()).toBe('全部（含已弃置）4')
  await wrapper.get('.status-discarded').trigger('click')
  expect(wrapper.emitted('update:statusFilter')).toEqual([['discarded']])
  wrapper.unmount()
})
