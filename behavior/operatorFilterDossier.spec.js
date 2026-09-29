import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorFilterDossier from '../src/components/operator/OperatorFilterDossier.vue'

const empty = {
  levelMin: '', levelMax: '', levelEnabled: false,
  eliteMin: '', eliteMax: '', eliteEnabled: false,
  starMin: '', starMax: '', starEnabled: false,
  onlyAwakened: false
}

it('填写数值不自动启用，开关保留输入，预设可一键启用或关闭', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { growthFilters: { ...empty }, showGrowthFilters: true } })
  await wrapper.get('summary').trigger('click')
  await wrapper.get('[aria-label="等级至少"]').setValue('80')
  const draft = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(draft).toMatchObject({ levelMin: '80', levelEnabled: false })
  await wrapper.setProps({ growthFilters: draft, growthFilterConfigured: true })
  expect(wrapper.get('summary').text()).toContain('已保存')
  await wrapper.get('[aria-label="启用等级筛选"]').setValue(true)
  const enabled = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(enabled).toMatchObject({ levelMin: '80', levelEnabled: true })
  await wrapper.setProps({ growthFilters: enabled, growthFilterActive: true })
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

it('觉醒暂时覆盖星数条件，取消后保留原范围', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { growthFilters: { ...empty, starMin: '2', starEnabled: true }, showGrowthFilters: true } })
  await wrapper.get('summary').trigger('click')
  await wrapper.get('.growth-awakened input').setValue(true)
  const awakened = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(awakened).toMatchObject({ starMin: '2', starEnabled: true, onlyAwakened: true })
  await wrapper.setProps({ growthFilters: awakened })
  expect(wrapper.get('[aria-label="星数至少"]').attributes('disabled')).toBeDefined()
  await wrapper.get('.growth-awakened input').setValue(false)
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ starMin: '2', starEnabled: true, onlyAwakened: false })
  await wrapper.setProps({ growthFilters: awakened })
  await wrapper.findAll('.growth-filter-presets button').find(button => button.text() === '四星以上').trigger('click')
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ starMin: '4', starMax: '', starEnabled: true, onlyAwakened: false })
  wrapper.unmount()
})

it('范围颠倒仅在对应筛选启用时提示错误', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { growthFilters: { ...empty, eliteMin: '12', eliteMax: '10' }, showGrowthFilters: true } })
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  await wrapper.setProps({ growthFilters: { ...empty, eliteMin: '12', eliteMax: '10', eliteEnabled: true } })
  expect(wrapper.get('[role="alert"]').text()).toBe('修为下限不能大于上限')
  wrapper.unmount()
})
