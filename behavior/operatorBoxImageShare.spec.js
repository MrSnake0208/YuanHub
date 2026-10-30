import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ImageShare from '../src/components/operator/OperatorBoxImageShare.vue'
import { renderOperatorBoxImage } from '../src/utils/operatorBoxImage.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/utils/operatorBoxImage.js', async original => ({ ...await original(), renderOperatorBoxImage: vi.fn() }))
const entry = id => ({ id: 'op' + id, name: '密探' + id, level: 100, elite: 17, huaji: '5★已觉醒', attack: '1,234', hp: '9,876', loadouts: [[], []] })
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text().includes(text))
let captures
const wrappers = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })
beforeEach(() => {
  captures = []
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:preview-' + captures.length), revokeObjectURL: vi.fn() }))
  renderOperatorBoxImage.mockReset().mockImplementation(async element => {
    captures.push({ names: [...element.querySelectorAll('h3')].map(node => node.textContent), text: element.textContent })
    return new Blob(['image'], { type: 'image/png' })
  })
})
function render(count = 105, extra = {}) {
  const entries = Array.from({ length: count }, (_, i) => entry(i))
  const wrapper = mount(ImageShare, { props: { accountId: 'account-a', open: true, game: '如鸢', ready: true, entries, filteredIds: entries.map(e => e.id), ...extra } })
  wrappers.push(wrapper)
  return wrapper
}

it('105 entries produce four independently downloadable pages with correct ranges', async () => {
  const wrapper = render()
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  expect(captures.map(c => c.names.length)).toEqual([30, 30, 30, 15])
  expect(captures.flatMap(c => c.names)).toEqual(Array.from({ length: 105 }, (_, i) => '密探' + i))
  expect(captures[3].text).toContain('第 4 / 4 张 · 第 91—105 位')
  expect(captures[0].text).toContain('Lv 100')
  expect(captures[0].text).not.toContain('账号名')
  expect(wrapper.findAll('.box-image-pages button')).toHaveLength(4)
  await wrapper.findAll('.box-image-pages button')[3].trigger('click')
  expect(wrapper.get('a[download]').attributes('download')).toBe('YuanHub-BOX-如鸢-4-4.png')
  expect(wrapper.get('.box-image-save').text()).toContain('15 位密探')
  expect(wrapper.text()).toContain('已生成 4 张图片')
})

it('current filters retain their order; all owned and complete-image export are explicit choices', async () => {
  const wrapper = render(40, { filteredIds: ['op23', 'op2'] })
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  expect(captures[0].names).toEqual(['密探23', '密探2'])
  await wrapper.get('select').setValue('all')
  expect(wrapper.find('.box-image-preview').exists()).toBe(false)
  await button(wrapper, '生成完整长图').trigger('click'); await flushPromises()
  expect(captures[1].names).toHaveLength(40)
  expect(wrapper.findAll('.box-image-pages button')).toHaveLength(1)
  expect(wrapper.get('a[download]').attributes('download')).toContain('完整长图')
})

it.each([{ accountId: 'account-b' }, { game: '代号鸢' }, { open: false }])('late rendering cannot publish images after context changes: %j', async change => {
  const pending = deferred()
  renderOperatorBoxImage.mockReturnValueOnce(pending.promise)
  const wrapper = render(2)
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  expect(wrapper.attributes('aria-busy')).toBe('true')
  await wrapper.setProps(change)
  pending.resolve(new Blob(['old-account']))
  await flushPromises()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(wrapper.find('.box-image-preview').exists()).toBe(false)
  expect(wrapper.attributes('aria-busy')).toBe('false')
})

it('generated URLs are revoked on close and unmount', async () => {
  const wrapper = render(2)
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  await wrapper.setProps({ open: false })
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  await wrapper.setProps({ open: true })
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  wrapper.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})

it('a failed later page keeps completed images and permits a clean retry', async () => {
  renderOperatorBoxImage.mockResolvedValueOnce(new Blob(['first'])).mockRejectedValueOnce(new Error('内存不足，请使用分段图片'))
  const wrapper = render(40)
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('已生成的 1 张仍可保存')
  expect(wrapper.findAll('a[download]')).toHaveLength(1)
  expect(wrapper.attributes('aria-busy')).toBe('false')
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.findAll('.box-image-pages button')).toHaveLength(2)
})

it('failed or empty source data cannot generate a misleading image', async () => {
  const wrapper = render(2, { ready: false, sourceError: '档案读取失败' })
  expect(wrapper.text()).toContain('档案读取失败')
  expect(button(wrapper, '生成分段图片').attributes('disabled')).toBeDefined()
  await wrapper.setProps({ ready: true, filteredIds: [] })
  expect(wrapper.text()).toContain('当前范围没有密探')
  expect(button(wrapper, '生成完整长图').attributes('disabled')).toBeDefined()
  expect(renderOperatorBoxImage).not.toHaveBeenCalled()
})
