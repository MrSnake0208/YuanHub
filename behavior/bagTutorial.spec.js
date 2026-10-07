import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecognitionTutorial from '../src/pages/star/RecognitionTutorial.vue'
import { bagTutorialSteps } from '../src/pages/star/bagTutorial.js'

let root
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  root = document.createElement('div')
  root.innerHTML = '<section class="ocr-review"><section class="image-review-group" data-review-image="image"></section></section><section class="inventory-grid"><div class="table-scroll"><table><tbody id="current-rows"><tr class="is-selected"><td>天府</td></tr></tbody></table></div></section><section class="review-toolbar"><button id="view">逐颗明细</button></section><article class="current-editor"><button id="add">新增当前行</button></article><article class="plan-editor"></article><label class="pending-only-toggle">仅看待养成</label><section class="experience-section"></section><div class="review-workspace-tools"><button>←</button><button>→</button><button>近期存档</button></div>'
  document.body.append(root)
  for (const element of root.querySelectorAll('*')) element.getBoundingClientRect = () => ({ left: 20, top: 80, right: 220, bottom: 124, width: 200, height: 44 })
})
const card = () => document.querySelector('.recognition-tour-card')
async function settle() { await flushPromises(); await vi.advanceTimersByTimeAsync(1800); await flushPromises() }
async function click(label) {
  const button = [...card().querySelectorAll('button')].find(button => button.textContent === label)
  expect(button).toBeTruthy(); button.click(); await settle()
}
function render() { return mount(RecognitionTutorial, { props: { open: true, mode: 'bag', root }, attachTo: document.body }) }

it('all seven steps go forward/back, real actions never advance, finish and close stay available', async () => {
  const wrapper = render(); await settle()
  expect(card().getAttribute('aria-label')).toBe('使用教程')
  expect(card().textContent).toContain('1 / 7')
  expect([...card().querySelectorAll('button')].find(b => b.textContent === '上一步').disabled).toBe(true)
  for (let index = 1; index < 7; index++) {
    await click('下一步')
    expect(card().textContent).toContain(`${index + 1} / 7`)
    expect(card().textContent).toContain(bagTutorialSteps[index].title)
    expect(card().querySelector('[aria-label="关闭使用教程"]')).toBeTruthy()
    if (index === 2) {
      root.querySelector('#view').textContent = '名称汇总'; root.querySelector('#view').click(); await settle()
      expect(card().textContent).toContain('3 / 7')
    }
    if (index === 3) {
      expect(card().querySelectorAll('.recognition-tour-body')).toHaveLength(2)
      expect(root.querySelector('#current-rows .is-selected').classList.contains('recognition-tutorial-related')).toBe(true)
      root.querySelector('#add').click(); await settle(); expect(card().textContent).toContain('4 / 7')
      root.querySelector('#current-rows tr').remove(); root.querySelector('.current-editor').remove(); await settle()
      expect(card().textContent).toContain('4 / 7')
    }
  }
  await click('上一步'); expect(card().textContent).toContain('6 / 7')
  await click('下一步'); await click('完成'); expect(wrapper.emitted('close')).toHaveLength(1)
})
it.each([true, false])('Step 1 actively scrolls to review for pending=%s and reveals it again after resize', async pending => {
  root.querySelector('.image-review-group').classList.toggle('needs-attention', pending)
  root.querySelector('.ocr-review').getBoundingClientRect = () => ({ left: 20, right: 220, top: 1600, bottom: 2200, width: 200, height: 600 })
  render(); await settle()
  expect(card().textContent).toContain('识别完成后，可以在这里回看识别结果')
  expect(window.scrollTo).toHaveBeenCalledOnce()
  expect(window.scrollTo.mock.calls[0][0]).toEqual({ top: Math.max(0, window.scrollY + 1600 - Math.max(64, window.innerHeight * 0.1)), behavior: 'smooth' })
  window.dispatchEvent(new Event('resize')); await settle()
  expect(window.scrollTo).toHaveBeenCalledTimes(2)
})
it('review info uses the existing modal shell, Escape closes only the modal and restores Step 1', async () => {
  render(); await settle(); await click('查看核对说明')
  const modal = document.querySelector('[aria-labelledby="recognition-example-title"]')
  expect(modal.textContent).toContain('怎么看识别结果')
  for (const text of ['保留', '忽略', '修改', '确认修改后会立即写回当前背包']) expect(modal.textContent).toContain(text)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(card().textContent).toContain('1 / 7')
})
it('replay starts bag at Step 1 and switching mode still replays recognition independently', async () => {
  const wrapper = render(); await settle(); await click('下一步'); await click('下一步')
  window.scrollTo.mockClear()
  await wrapper.setProps({ replayId: 1 }); await settle(); expect(card().textContent).toContain('1 / 7')
  expect(window.scrollTo).toHaveBeenCalledOnce()
  await wrapper.setProps({ mode: 'recognition', replayId: 2 }); await settle()
  expect(card().textContent).toContain('1 / 6'); expect(card().textContent).toContain('导入截图')
})
it('mobile Step 7 raises the draggable sheet above floating tools without scrolling the page', async () => {
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844)
  root.querySelector('.review-workspace-tools').getBoundingClientRect = () => ({ left: 230, right: 380, top: 790, bottom: 834, width: 150, height: 44 })
  render(); await settle()
  for (let i = 0; i < 6; i++) await click('下一步')
  expect(card().textContent).toContain('7 / 7')
  expect(parseFloat(card().style.bottom)).toBe(66)
  expect(844 - parseFloat(card().style.bottom)).toBeLessThan(790)
  const scrollCount = window.scrollTo.mock.calls.length
  const handle = card().querySelector('.recognition-tour-handle')
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
  await settle()
  expect(parseFloat(card().style.bottom)).toBe(98)
  expect(window.scrollTo.mock.calls.length).toBe(scrollCount)
})

it('只读演示持续说明数据隔离，第七步滚动到演示历史区域', async () => {
  const wrapper = mount(RecognitionTutorial, { props: { open: true, mode: 'bag', demo: true, root }, attachTo: document.body })
  await settle()
  for (let step = 0; step < 7; step++) {
    expect(card().textContent).toContain('只读演示，不会保存到你的背包')
    if (step < 6) await click('下一步')
  }
  expect(window.scrollTo).toHaveBeenCalledTimes(7)
  await wrapper.setProps({ demo: false, replayId: 1 }); await settle()
  expect(card().textContent).not.toContain('只读演示')
})
