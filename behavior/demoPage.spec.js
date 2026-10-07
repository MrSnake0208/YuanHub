import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DemoPage from '../src/pages/demo/index.vue'
import { useRoute } from 'vue-router'

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ query: {} })
  return { useRoute: () => route, useRouter: () => ({ replace: vi.fn(async location => { route.query = location.query }) }) }
})

beforeEach(() => { useRoute().query = {}; vi.clearAllMocks() })
const render = () => mount(DemoPage, { global: { stubs: { IslandSidebar: true } } })

it('演示保留样例标识且不承诺当天完成，未知材料优先提醒补记录', () => {
  const wrapper = render()
  expect(wrapper.text()).toContain('示例存档')
  expect(wrapper.get('#overview-title').text()).toBe('今天优先推进杨修')
  expect(wrapper.get('.demo-priority-foot').text()).toContain('预计约 15 天')
  expect(wrapper.get('.demo-estimate-note').text()).toContain('心纸按密探分别核算')
  expect(wrapper.text()).toContain('待补记录')
  expect(wrapper.text()).not.toContain('暂无 ETA')
  expect(fetch).not.toHaveBeenCalled()
})

it('目标以星阶和节点展示，调整后更新且恢复演示不写真实账号', async () => {
  useRoute().query = { view: 'targets' }
  const wrapper = render()
  const first = wrapper.findAll('.demo-target-row')[0]
  expect(first.get('.demo-target-values').text()).toContain('5 星 · 0 节点')
  expect(first.get('.demo-target-values').text()).toContain('5 星 · 4 节点')
  const select = first.get('select')
  expect(select.find('option[value="24"]').attributes('disabled')).toBeDefined()
  await select.setValue('31')
  expect(first.get('.demo-target-values').text()).toContain('觉醒')
  await wrapper.get('.demo-reset').trigger('click')
  useRoute().query = { view: 'targets' }; await flushPromises()
  expect(wrapper.findAll('.demo-target-row')[0].get('select').element.value).toBe('29')
  expect(fetch).not.toHaveBeenCalled()
})

it('目标增加导致缺少功过格速度时，完整耗时显示无法估算', async () => {
  useRoute().query = { view: 'targets' }
  const wrapper = render()
  const inputs = wrapper.findAll('.demo-target-row')[0].findAll('input')
  await inputs[1].setValue('17')
  await inputs[1].trigger('change')
  useRoute().query = { view: 'overview' }; await flushPromises()
  expect(wrapper.get('.demo-priority-foot').text()).toContain('完整耗时暂无法估算')
  expect(wrapper.get('.demo-estimate-note').text()).toContain('功过格缺少收集记录')
  expect(fetch).not.toHaveBeenCalled()
})
