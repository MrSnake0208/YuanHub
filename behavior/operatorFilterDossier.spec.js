import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorFilterDossier from '../src/components/operator/OperatorFilterDossier.vue'
import OperatorGrowthFilters from '../src/components/operator/OperatorGrowthFilters.vue'

const empty = {
  levelMin: '', levelMax: '', levelEnabled: false,
  eliteMin: '', eliteMax: '', eliteEnabled: false,
  starMin: '', starMax: '', starEnabled: false
}

it('高级筛选底部操作随展开区显示和收起，收起不清空已有条件', async () => {
  const wrapper = mount(OperatorFilterDossier, { attachTo: document.body, props: {
    compact: true, profFilter: '阳', profOptions: ['阳'],
  }, slots: { 'extra-footer': '<button class="test-extra-reset">重置筛选</button>' } })
  const reset = wrapper.get('.dossier-extra .test-extra-reset')
  expect(reset.isVisible()).toBe(false)
  await wrapper.get('.dossier-more').trigger('click')
  expect(reset.isVisible()).toBe(true)
  expect(wrapper.get('.dossier-extra').element.lastElementChild).toBe(reset.element)
  await wrapper.get('.dossier-more').trigger('click')
  expect(reset.isVisible()).toBe(false)
  expect(wrapper.findAll('.pf-prof-row button')[1].attributes('aria-pressed')).toBe('true')
  expect(wrapper.emitted('reset')).toBeUndefined()
  wrapper.unmount()
})

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

it('觉醒独立筛选，预设启用或关闭后仍保留星数范围', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { growthFilters: { ...empty, starMin: '2', starEnabled: true }, showGrowthFilters: true } })
  const awakenedPreset = wrapper.findAll('.growth-filter-presets button').find(button => button.text() === '只看觉醒')
  await awakenedPreset.trigger('click')
  const awakened = wrapper.emitted('update:growthFilters').at(-1)[0]
  expect(awakened).toMatchObject({ awakened: 'true', starMin: '2', starEnabled: true })
  await wrapper.setProps({ growthFilters: awakened })
  expect(awakenedPreset.attributes('aria-pressed')).toBe('true')
  await awakenedPreset.trigger('click')
  expect(wrapper.emitted('update:growthFilters').at(-1)[0]).toMatchObject({ awakened: '', starMin: '2', starEnabled: true })
  await wrapper.get('summary').trigger('click')
  expect(wrapper.get('[aria-label="星数至少"]').attributes('max')).toBe('5')
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


it('紧凑模式常驻搜索和状态，更多筛选展开后可使用原有属性条件', async () => {
  const wrapper = mount(OperatorFilterDossier, { attachTo: document.body, props: {
    compact: true, searchable: true, profOptions: ['阳'], statusOptions: [{ value: 'all', label: '全部' }],
  } })
  expect(wrapper.get('.current-filter-search input').isVisible()).toBe(true)
  expect(wrapper.get('.pf-status-row').isVisible()).toBe(true)
  expect(wrapper.get('.pf-prof-row').isVisible()).toBe(false)
  await wrapper.get('.current-filter-search input').setValue('杨修')
  expect(wrapper.emitted('update:searchQuery')).toEqual([['杨修']])
  await wrapper.get('.dossier-more').trigger('click')
  expect(wrapper.get('.pf-prof-row').isVisible()).toBe(true)
  await wrapper.findAll('.pf-prof-row button')[1].trigger('click')
  expect(wrapper.emitted('update:profFilter')).toEqual([['阳']])
  await wrapper.setProps({ profFilter: '阳', hasFilters: true })
  await wrapper.get('.dossier-more').trigger('click')
  expect(wrapper.get('.dossier-more').text()).toContain('已启用')
  expect(wrapper.get('.pf-prof-row').isVisible()).toBe(false)
  expect(wrapper.props('profFilter')).toBe('阳')
})

it.each(['密探图鉴', '当前养成'])('%s 沿用共同操作顺序，专属操作排在公共入口之后', contextLabel => {
  const secondaryLabels = contextLabel === '当前养成' ? ['特别关注优先', '分类设置', '批量标注'] : []
  const wrapper = mount(OperatorFilterDossier, { props: {
    compact: true, searchable: true, contextLabel, hasFilters: true, advancedFilterCount: 0,
  }, slots: {
    'primary-tool': '<a class="btn primary" href="/operator/quick">录入密探</a>',
    ...(secondaryLabels.length ? { 'secondary-tool': secondaryLabels.map(label => `<button type="button">${label}</button>`).join('') } : {}),
  } })
  const controls = wrapper.get('.current-filter-tools').findAll('input, a, button')
  expect(controls.map(control => control.element.tagName === 'INPUT' ? '搜索' : control.text()))
    .toEqual(['搜索', '录入密探', '更多筛选', '重置', ...secondaryLabels])
  if (secondaryLabels.length) {
    expect(wrapper.get('.current-filter-secondary').findAll('button').map(button => button.text())).toEqual(secondaryLabels)
  } else {
    expect(wrapper.find('.current-filter-secondary').exists()).toBe(false)
  }
  wrapper.unmount()
})

it.each([false, true])('强制展开时显示所有筛选，解除后保留原展开状态（原展开=%s）', async previouslyOpen => {
  const wrapper = mount(OperatorFilterDossier, { attachTo: document.body, props: {
    compact: true, searchable: true, searchQuery: '杨修', profFilter: '阳',
    profOptions: ['阳'], subProfOptions: ['输出'], rarityOptions: [{ value: 5, label: '绝密' }],
  } })
  if (previouslyOpen) await wrapper.get('.dossier-more').trigger('click')
  await wrapper.setProps({ forceExpanded: true })
  expect(wrapper.find('.dossier-more').exists()).toBe(false)
  for (const selector of ['.pf-prof-row', '.pf-subprof-row', '.pf-rarity-row']) {
    expect(wrapper.get(selector).isVisible()).toBe(true)
  }
  expect(wrapper.get('.current-filter-search input').isVisible()).toBe(true)
  await wrapper.findAll('.pf-subprof-row button')[1].trigger('click')
  expect(wrapper.emitted('update:subProfFilter')).toEqual([['输出']])
  await wrapper.setProps({ forceExpanded: false })
  expect(wrapper.get('.dossier-extra').isVisible()).toBe(previouslyOpen)
  expect(wrapper.get('.dossier-more').attributes('aria-expanded')).toBe(String(previouslyOpen))
  expect(wrapper.get('.current-filter-search input').element.value).toBe('杨修')
  expect(wrapper.findAll('.pf-prof-row button')[1].attributes('aria-pressed')).toBe('true')
  expect(wrapper.emitted('reset')).toBeUndefined()
  wrapper.unmount()
})

it('图鉴可复用招募状态和高级筛选数量，关闭更多筛选保留附加内容', async () => {
  const wrapper = mount(OperatorFilterDossier, { attachTo: document.body, props: {
    compact: true, contextLabel: '密探图鉴', statusLabel: '招募状态', totalCount: 3,
    statusOptions: [{ value: 'all', label: '全部' }, { value: 'owned', label: '已招募' }, { value: 'missing', label: '未招募' }],
    statusCounts: { owned: 1, missing: 2 }, advancedFilterCount: 0, hasFilters: true,
  }, slots: { 'extra-filters': '<label>目录版本<input value="catalog-test" /></label>' } })
  expect(wrapper.get('.pf-status-row .pf-label').text()).toBe('招募状态')
  expect(wrapper.get('[aria-label="按招募状态筛选密探图鉴"]').exists()).toBe(true)
  expect(wrapper.findAll('.current-status-filter button').map(button => button.text())).toEqual(['全部3', '已招募1', '未招募2'])
  expect(wrapper.get('.dossier-more').text()).toBe('更多筛选')
  await wrapper.get('.status-missing').trigger('click')
  expect(wrapper.emitted('update:statusFilter')).toEqual([['missing']])
  await wrapper.setProps({ advancedFilterCount: 2 })
  expect(wrapper.get('.dossier-more').text()).toBe('更多筛选 · 2')
  await wrapper.get('.dossier-more').trigger('click')
  expect(wrapper.get('.dossier-extra').isVisible()).toBe(true)
  await wrapper.get('.dossier-more').trigger('click')
  expect(wrapper.get('.dossier-extra').isVisible()).toBe(false)
  expect(wrapper.get('.dossier-extra input').element.value).toBe('catalog-test')
})

it.each([true, false])('筛选组件可聚焦实际搜索框（compact=%s）', compact => {
  const wrapper = mount(OperatorFilterDossier, { attachTo: document.body, props: { compact, searchable: true } })
  wrapper.vm.focusSearch()
  expect(document.activeElement).toBe(wrapper.get('.current-filter-search input').element)
})

it('自定义标签复用原筛选行与选中语义；没有标签时不增加空筛选行', async () => {
  const wrapper = mount(OperatorFilterDossier, { props: { compact: true, totalCount: 6 } })
  expect(wrapper.find('.pf-tag-row').exists()).toBe(false)
  await wrapper.setProps({ tagOptions: [{ value: 'main', label: '主力', count: 2 }] })
  expect(wrapper.get('.pf-tag-row .pf-label').text()).toBe('标签')
  const buttons = wrapper.findAll('.current-tag-filter button')
  expect(buttons.map(button => button.text())).toEqual(['全部6', '主力2'])
  expect(buttons[0].attributes('aria-pressed')).toBe('true')
  await buttons[1].trigger('click')
  expect(wrapper.emitted('update:tagFilter')).toEqual([['main']])
  await wrapper.setProps({ tagFilter: 'main' })
  expect(buttons[1].attributes('aria-pressed')).toBe('true')
  expect(buttons[1].classes()).toContain('on')
  await buttons[0].trigger('click')
  expect(wrapper.emitted('update:tagFilter').at(-1)).toEqual([''])
  expect(wrapper.emitted('update:statusFilter')).toBeUndefined()
  wrapper.unmount()
})

it.each([true, false])('关闭快捷预设仍保留自定义范围，默认消费者不受影响（compact=%s）', async compact => {
  const wrapper = mount(OperatorFilterDossier, { props: { compact, forceExpanded: true, showGrowthFilters: true, showGrowthPresets: false, growthFilters: { ...empty } } })
  expect(wrapper.find('.growth-filter-presets').exists()).toBe(false)
  expect(wrapper.find('.current-growth-filter').exists()).toBe(true)
  await wrapper.setProps({ showGrowthPresets: true })
  expect(wrapper.find('.growth-filter-presets').exists()).toBe(true)
  wrapper.unmount()
})
