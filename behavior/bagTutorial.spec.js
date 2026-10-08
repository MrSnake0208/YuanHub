// Keep the existing tutorial implementation covered through explicit opt-in.
vi.hoisted(() => vi.stubEnv('VITE_TUTORIALS_ENABLED', 'true'))
afterAll(() => vi.unstubAllEnvs())
import { afterAll, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import RecognitionTutorial from '../src/pages/star/RecognitionTutorial.vue'
import StarHelpModal from '../src/pages/star/StarHelpModal.vue'
import { bagGuidance } from '../src/pages/star/bagTutorial.js'

let root
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('scrollTo', vi.fn()); vi.stubGlobal('matchMedia', () => ({ matches: false }))
  root = document.createElement('div'); root.tabIndex = -1
  root.innerHTML = '<section class="ocr-review"><button id="toggle-ocr-review" class="ocr-summary">识别结果核对</button><section data-review-image="image"><button>查看整页</button></section></section><article class="current-editor"><button>新增当前行</button></article>'
  document.body.append(root)
  for (const element of root.querySelectorAll('*')) element.getBoundingClientRect = () => ({ left: 20, top: 80, right: 220, bottom: 124, width: 200, height: 44 })
})
async function settle() { await flushPromises(); await vi.advanceTimersByTimeAsync(100); await flushPromises() }
const button = (panel, text) => [...panel.querySelectorAll('button')].find(button => button.textContent === text)

it('bag offers one anomaly check, no seven-page tour, and explicit completion', async () => {
  const wrapper = mount(RecognitionTutorial, { props: { open: true, step: bagGuidance, root }, attachTo: document.body }); await settle()
  const card = document.querySelector('.recognition-tour-card')
  expect(card.textContent).toContain('正常结果不用逐条确认')
  for (const old of ['1 / 7', '下一步', 'Ctrl', '新增当前行']) expect(card.textContent).not.toContain(old)
  root.querySelector('.current-editor button').click(); await settle()
  expect(card.textContent).toContain('先检查识别异常')
  expect(window.scrollTo).not.toHaveBeenCalled()
  button(card, '完成引导').click(); expect(wrapper.emitted('close')).toEqual([['complete']])
})
it('reveals the review heading once only when it is completely below the viewport', async () => {
  const heading = root.querySelector('#toggle-ocr-review')
  heading.getBoundingClientRect = () => ({ left: 20, top: 1600, right: 220, bottom: 1644, width: 200, height: 44 })
  mount(RecognitionTutorial, { props: { open: true, step: bagGuidance, root }, attachTo: document.body }); await settle()
  expect(window.scrollTo).toHaveBeenCalledTimes(1)
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 1588, behavior: 'smooth' })
  heading.getBoundingClientRect = () => ({ left: 20, top: 100, right: 220, bottom: 144, width: 200, height: 44 })
  root.append(document.createElement('p')); window.dispatchEvent(new Event('resize')); await settle()
  expect(window.scrollTo).toHaveBeenCalledTimes(1)
})
it('help groups advanced techniques on demand and example Escape restores the parent before tutorial', async () => {
  const Host = defineComponent({ components: { RecognitionTutorial, StarHelpModal }, setup() {
    const help = ref(false), topic = ref('review')
    return { help, topic, root, bagGuidance }
  }, template: '<RecognitionTutorial :open="true" :step="bagGuidance" :root="root" :paused="help" @help="topic = $event; help = true"/><StarHelpModal :open="help" :topic="topic" @close="help = false"/>' })
  mount(Host, { attachTo: document.body }); await settle()
  const card = document.querySelector('.recognition-tour-card'), opener = button(card, '帮助与示例')
  opener.focus(); opener.click(); await settle()
  const help = () => document.querySelector('[aria-labelledby="star-help-title"]')
  expect(help().textContent).toContain('立即写回当前背包')
  expect(help().querySelectorAll('details')).toHaveLength(4)
  expect(help().querySelectorAll('details')[2].open).toBe(false)
  help().querySelector('details').open = true
  const exampleOpener = button(help(), '查看截图重点示例'); exampleOpener.focus(); exampleOpener.click(); await settle()
  const modal = () => document.querySelector('[aria-labelledby="recognition-example-title"]')
  expect(modal().querySelector('.recognition-example-crop')).not.toBeNull()
  expect(modal().textContent).toContain('实际上传请使用完整原图')
  expect(modal().querySelector('.recognition-example-full')).toBeNull()
  button(modal(), '查看完整截图').click(); await settle()
  expect(modal().querySelector('.recognition-example-full')).not.toBeNull()
  button(modal(), '返回重点标注').click(); await settle()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await settle()
  expect(modal().contains(document.activeElement)).toBe(true)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle()
  expect(modal()).toBeNull(); expect(help()).not.toBeNull(); expect(document.activeElement).toBe(exampleOpener)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle()
  expect(help()).toBeNull(); expect(document.activeElement).toBe(opener)
  expect(document.querySelector('.recognition-tour-card')).not.toBeNull()
})
it('local crop examples paginate, reset to annotations, handle failed images and show overlap row comparison', async () => {
  const Host = defineComponent({ components: { StarHelpModal }, setup: () => ({ open: ref(true) }), template: '<StarHelpModal :open="open" @close="open = false"/>' })
  mount(Host, { attachTo: document.body }); await settle()
  const help = document.querySelector('[aria-labelledby="star-help-title"]')
  button(help, '查看截图重点示例').click(); await settle()
  const modal = () => document.querySelector('[aria-labelledby="recognition-example-title"]')
  button(modal(), '查看完整截图').click(); button(modal(), '下一张').click(); await settle()
  expect(modal().querySelector('.recognition-example-full')).toBeNull()
  expect(modal().querySelector('img').src).toContain('recognition-support-example.jpg')
  button(modal(), '下一张').click(); await settle()
  expect(modal().textContent).toContain('数量')
  modal().querySelector('img').dispatchEvent(new Event('error')); await settle()
  expect(modal().textContent).toContain('暂时无法加载')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle()
  button(help, '查看重复整行对照').click(); await settle()
  expect(modal().querySelectorAll('.recognition-example-crop')).toHaveLength(2)
  expect(modal().textContent).toContain('前图'); expect(modal().textContent).toContain('后图')
})

it('empty bag keeps the opt-in example read-only and switches only the example workspace', async () => {
  const wrapper = mount(StarHelpModal, { props: { open: true, emptyBag: true, topic: 'advanced' }, attachTo: document.body }); await settle()
  const help = () => document.querySelector('[aria-labelledby="star-help-title"]')
  expect(help().querySelector('.star-help-demo').open).toBe(false)
  help().querySelector('.star-help-demo summary').click(); await settle()
  const demo = () => help().querySelector('.bag-tutorial-demo')
  expect(demo().textContent).toContain('不会保存到你的背包')
  expect(demo().querySelectorAll('tbody')).toHaveLength(1)
  expect(demo().querySelectorAll('tbody tr')).toHaveLength(3)
  expect([...demo().querySelectorAll('input, select, button')].every(control => control.matches(':disabled') || control.readOnly)).toBe(true)
  button(help(), '养成计划示例').click(); await settle()
  expect(demo().querySelector('.current-editor')).toBeNull()
  expect(demo().querySelector('.plan-editor')).not.toBeNull()
  expect(demo().textContent).toContain('演示数值')
  expect(window.scrollTo).not.toHaveBeenCalled()
  await wrapper.setProps({ open: false }); await settle()
  await wrapper.setProps({ open: true }); await settle()
  expect(button(help(), '背包与核对示例').getAttribute('aria-pressed')).toBe('true')
  expect(help().querySelector('.star-help-demo').open).toBe(false)
})
