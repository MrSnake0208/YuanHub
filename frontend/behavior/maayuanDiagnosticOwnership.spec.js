import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MaayuanDiagnosticEvidence from '../src/components/diagnostics/MaayuanDiagnosticEvidence.vue'
import { getDiagnosticEvent, getDiagnosticMedia } from '../src/api/maayuanDiagnostics.js'

vi.mock('../src/api/maayuanDiagnostics.js', () => ({ getDiagnosticEvent: vi.fn(), getDiagnosticMedia: vi.fn() }))

const names = { char_dongfeng: '董奉', char_zhangfei: '张飞' }
const images = [
  { assetId: 'dongfeng', role: 'disc_cells', operatorId: 'char_dongfeng', status: 'ready', url: 'https://images.test/dongfeng.jpg' },
  { assetId: 'zhangfei', role: 'name_area', operatorId: 'char_zhangfei', status: 'ready', url: 'https://images.test/zhangfei.jpg' },
  { assetId: 'unknown', role: 'name_area', operatorId: null, status: 'missing' }
]

beforeEach(() => {
  getDiagnosticEvent.mockReset().mockResolvedValue({ images, manifest: {} })
  getDiagnosticMedia.mockReset()
})

const evidence = issue => mount(MaayuanDiagnosticEvidence, { props: { eventId: 'event-1', issue, operatorNames: names } })

it('密探问题组只展示本人的截图，不混入其他密探或未知归属', async () => {
  const wrapper = evidence({ subjectKind: 'operator', subject: 'char_zhangfei' })
  await flushPromises()
  expect(wrapper.findAll('figure')).toHaveLength(1)
  expect(wrapper.get('figcaption').text()).toBe('姓名区 · 张飞')
  expect(wrapper.get('img').attributes('src')).toContain('zhangfei.jpg')
  expect(wrapper.text()).not.toContain('董奉')
})

it('本组无截图时明确提示归属，仍然查看默认折叠并在切换事件后重置', async () => {
  getDiagnosticEvent.mockResolvedValue({ images: [images[0]], manifest: {} })
  const wrapper = evidence({ subjectKind: 'operator', subject: 'char_zhangfei' })
  await flushPromises()
  expect(wrapper.text()).toContain('本次截图属于 董奉（其他密探），本组密探没有截图')
  const toggle = wrapper.get('button[aria-expanded]')
  expect(toggle.text()).toBe('仍然查看')
  expect(toggle.attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('figure').exists()).toBe(false)
  await toggle.trigger('click')
  expect(wrapper.get('figcaption').text()).toBe('命盘格 · 董奉')
  expect(toggle.attributes('aria-expanded')).toBe('true')
  await wrapper.setProps({ eventId: 'event-2' })
  await flushPromises()
  expect(wrapper.get('button[aria-expanded]').attributes('aria-expanded')).toBe('false')
  expect(wrapper.find('figure').exists()).toBe(false)
})

it('非密探问题组展示全部截图并标注中文归属和未知身份，保留图片状态', async () => {
  const wrapper = evidence({ subjectKind: 'stage', subject: 'disc' })
  await flushPromises()
  expect(wrapper.findAll('figcaption').map(caption => caption.text())).toEqual(['命盘格 · 董奉', '姓名区 · 张飞', '姓名区 · 未识别密探'])
  expect(wrapper.text()).toContain('图片未上传或已丢失')
  expect(wrapper.find('button[aria-expanded]').exists()).toBe(false)
})

it('缺少图片归属时不猜测为本组截图，切换问题组后重新折叠', async () => {
  getDiagnosticEvent.mockResolvedValue({ images: [images[2]], manifest: {} })
  const wrapper = evidence({ subjectKind: 'operator', subject: 'char_dongfeng' })
  await flushPromises()
  expect(wrapper.text()).toContain('本次截图属于 未识别密探，本组密探没有截图')
  await wrapper.get('button[aria-expanded]').trigger('click')
  expect(wrapper.findAll('figure')).toHaveLength(1)
  await wrapper.setProps({ issue: { subjectKind: 'operator', subject: 'char_zhangfei' } })
  expect(wrapper.find('figure').exists()).toBe(false)
})

it('没有保存图片时保留原空态，不提供无内容的展开入口', async () => {
  getDiagnosticEvent.mockResolvedValue({ images: [], manifest: {} })
  const wrapper = evidence({ subjectKind: 'operator', subject: 'char_dongfeng' })
  await flushPromises()
  expect(wrapper.text()).toContain('本次上报未保存图片。')
  expect(wrapper.find('button[aria-expanded]').exists()).toBe(false)
})
