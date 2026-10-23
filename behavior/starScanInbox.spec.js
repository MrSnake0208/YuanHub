import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import StarScanInbox from '../src/pages/star/StarScanInbox.vue'
import StarScansPage from '../src/pages/star/scans.vue'
import { getStarScan, listStarScans } from '../src/api/starScans.js'

vi.mock('../src/api/starScans.js', () => ({ listStarScans: vi.fn(), getStarScan: vi.fn(), discardStarScan: vi.fn(), applyStarScan: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: vi.fn(() => () => {}) }))
const fixture = () => ({ status: 'needs_review', report: { record_id: 'r', entries: [{ observation_id: 'o1', kind: 'main', name: '天府', quality: 'orange', level: 20, source: 'main/1' }], warnings: [], experience: { orange: 0, purple: null, white: null }, bag: { current_count: 1, capacity: 100 } },
  state: { generation: 1, revision: 2, inventory: [{ instance_id: 'old', kind: 'main', name: '天府', quality: 'orange', level: 20, breakthrough_stage: 2 }], plan_targets: { old: 40 } }, assignments: [], loadout_revision: 1 })
beforeEach(() => {
  listStarScans.mockResolvedValue([{ record_id: 'r', captured_at: '2026-10-23T00:00:00Z', entry_count: 1, game: '如鸢' }])
  getStarScan.mockResolvedValue(fixture())
})
it('loads the review without writing, then retries the exact command after a lost response', async () => {
  expect(StarScansPage).toBeTruthy()
  const apply = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValue({})
  const wrapper = mount(StarScanInbox, { props: { accountId: 'a', apply } })
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '核对').trigger('click'); await flushPromises()
  expect(apply).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('计划 40')
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('.scan-fields').attributes('disabled')).toBeDefined()
  await wrapper.findAll('button').find(button => button.text().includes('重试确认')).trigger('click'); await flushPromises()
  expect(apply).toHaveBeenCalledTimes(2)
  expect(apply.mock.calls[0]).toEqual(apply.mock.calls[1])
  expect(wrapper.text()).toContain('已导入')
  wrapper.unmount()
})
it('an unmounted account cannot display its late review response', async () => {
  let resolve
  getStarScan.mockReturnValue(new Promise(done => { resolve = done }))
  const apply = vi.fn(), old = mount(StarScanInbox, { props: { accountId: 'a', apply } })
  await flushPromises(); await old.findAll('button').find(button => button.text() === '核对').trigger('click')
  old.unmount()
  listStarScans.mockResolvedValue([])
  const next = mount(StarScanInbox, { props: { accountId: 'b', apply } })
  resolve(fixture()); await flushPromises()
  expect(next.find('form').exists()).toBe(false)
  expect(apply).not.toHaveBeenCalled()
  next.unmount()
})
it('shows missing levels immediately and focuses each unresolved row until both are filled', async () => {
  const value = fixture()
  value.state.inventory = []
  value.report.entries = [1, 2].map(i => ({ observation_id: `o${i}`, kind: 'main', name: '天梁', quality: 'orange', level: null }))
  getStarScan.mockResolvedValue(value)
  const apply = vi.fn().mockResolvedValue({})
  const wrapper = mount(StarScanInbox, { attachTo: document.body, props: { accountId: 'a', apply } })
  await flushPromises()
  await wrapper.findAll('button').find(button => button.text() === '核对').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('还有 2 颗')
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(apply).not.toHaveBeenCalled()
  expect(wrapper.find('[role=alert]').text()).toContain('第 1 颗主星天梁')
  const levels = wrapper.findAll('[data-field=level]')
  expect(document.activeElement).toBe(levels[0].element)
  await levels[0].setValue('1')
  expect(wrapper.text()).toContain('还有 1 颗')
  await wrapper.findAll('button').find(button => button.text() === '定位第一处').trigger('click')
  expect(document.activeElement).toBe(levels[1].element)
  await levels[1].setValue('1')
  expect(wrapper.findAll('.scan-row-invalid')).toHaveLength(0)
  await wrapper.find('form').trigger('submit'); await flushPromises()
  expect(apply).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})
