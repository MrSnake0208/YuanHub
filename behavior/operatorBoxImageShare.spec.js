import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ImageShare from '../src/components/operator/OperatorBoxImageShare.vue'
import { operatorBoxImageEntry, renderOperatorBoxImage } from '../src/utils/operatorBoxImage.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/utils/operatorBoxImage.js', async original => ({ ...await original(), renderOperatorBoxImage: vi.fn() }))
const entry = id => ({ id: 'op' + id, name: '密探' + id, level: 100, elite: 17, huaji: '5★ · 已觉醒', attack: '1,234', hp: '9,876', loadouts: [[], []] })
const button = (wrapper, text) => wrapper.findAll('button').find(node => node.text().includes(text))
let captures
const wrappers = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })
beforeEach(() => {
  captures = []
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => 'blob:preview-' + captures.length), revokeObjectURL: vi.fn() }))
  renderOperatorBoxImage.mockReset().mockImplementation(async element => {
    captures.push({ names: [...element.querySelectorAll('h3')].map(node => node.textContent), text: element.textContent,
      controls: element.querySelectorAll('button, input, textarea, select, [role="button"]').length })
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
  expect(captures[0].text).toContain('等级100')
  expect(captures[0].controls).toBe(0)
  expect(captures[0].text).not.toContain('账号名')
  expect(wrapper.findAll('.box-image-pages button')).toHaveLength(4)
  await wrapper.findAll('.box-image-pages button')[3].trigger('click')
  expect(wrapper.get('a[download]').attributes('download')).toBe('YuanHub-BOX-如鸢-4-4.png')
  expect(wrapper.get('.box-image-save').text()).toContain('15 位密探')
  expect(wrapper.text()).toContain('已生成 4 张图片')
})

it.each(['生成分段图片', '生成完整长图'])('%s keeps growth, both loadouts and unknown states in the rendered sheet', async action => {
  const entries = [
    operatorBoxImageEntry({ id: 'long', name: '用于排版的长姓名', level: 73, elite: 0, rarity: 5,
      huaji: { owned: true, stage: 9, awakened: false },
      discLoadouts: [{ discNames: ['第一套较长且必须完整保留的词条', '另一词条'] }, { discNames: ['第二套独立词条'] }],
    }, {}, { attackLabel: '999,999', hpLabel: '9,999,999' }),
    operatorBoxImageEntry({ id: 'unknown', name: '待核', rarity: 5, huaji: { owned: true, stage: null } }, {}, {}),
  ]
  const wrapper = render(0, { entries, filteredIds: entries.map(e => e.id) })
  await button(wrapper, action).trigger('click'); await flushPromises()
  const text = captures[0].text
  for (const value of ['用于排版的长姓名', '等级73', '修为0', '化极2★ · 2 节点',
    '999,999', '9,999,999', '命盘一', '命盘二', '第一套较长且必须完整保留的词条',
    '另一词条', '第二套独立词条', '等级—', '修为—', '化极待确认', '未配置命盘']) {
    expect(text).toContain(value)
  }
  expect(text).not.toContain('+—')
})

it('static ledger keeps combat results without oddities, calculation sources or private fields', async () => {
  const saved = { id: 'op', name: '测试', level: 90, elite: 12, starLevel: 19, rarity: 5,
    remark: '私人备忘', discLoadouts: [{ name: '私人方案', discNames: ['真实命盘'] }],
    combatStats: { oddities: { attack: { current: 500, max: 500 }, hp: { current: 0, max: 2600 } } },
  }
  const before = JSON.stringify(saved)
  const entries = [operatorBoxImageEntry(saved, {}, { attackLabel: '9,999', hpLabel: '99,999',
    attackSource: 'calculated', hpSource: 'manual', status: 'manual' })]
  const wrapper = render(0, { entries, filteredIds: ['op'] })
  await button(wrapper, '生成分段图片').trigger('click'); await flushPromises()
  const capture = captures[0]
  for (const value of ['等级90', '修为12', '4★ · 0 节点', '9,999', '99,999',
    '真实命盘', '未配置命盘']) expect(capture.text).toContain(value)
  expect(capture.controls).toBe(0)
  expect(capture.text).not.toMatch(/奇闻|自动计算|手动修正|私人|置顶|添加备忘|完整编辑|\+ 命盘/)
  expect(JSON.stringify(saved)).toBe(before)
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
