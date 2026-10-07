import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import RecognitionTutorial from '../src/pages/star/RecognitionTutorial.vue'
import { recognitionGuidance, currentRecognitionGuidance } from '../src/pages/star/recognitionTutorial.js'

let root
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('scrollTo', vi.fn())
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  root = document.createElement('div'); root.tabIndex = -1
  root.innerHTML = '<button id="file-drop-zone">上传</button><section class="import-pools"><section class="import-pool"><button data-confirm-pool>确认本池</button></section></section><button data-confirm-all-pools>确认全部</button><section class="overlap-controls"><select><option>前图</option></select><button data-add-overlap>添加关系</button></section><button data-start-ocr disabled>开始识别</button>'
  document.body.append(root)
  for (const element of root.querySelectorAll('*')) element.getBoundingClientRect = () => ({ left: 20, top: 100, right: 220, bottom: 144, width: 200, height: 44 })
})
async function settle() { await flushPromises(); await vi.advanceTimersByTimeAsync(100); await flushPromises() }
const card = () => document.querySelector('.recognition-tour-card')
const render = (props = {}) => mount(RecognitionTutorial, { props: { open: true, step: recognitionGuidance.upload, root, focusOnOpen: true, ...props }, attachTo: document.body })

it('real upload, classification confirmation and OCR status drive guidance without next buttons', async () => {
  const version = ref(0)
  const step = computed(() => { version.value; return currentRecognitionGuidance(root) })
  const Host = defineComponent({ components: { RecognitionTutorial }, setup: () => ({ root, step }), template: '<RecognitionTutorial :open="Boolean(step)" :step="step" :root="root" />' })
  const wrapper = mount(Host, { attachTo: document.body }); await settle()
  expect(card().textContent).toContain('先上传截图')
  expect(card().textContent).not.toContain('下一步')
  // Clicking the chooser alone is not a completed upload.
  root.querySelector('#file-drop-zone').click(); version.value++; await settle()
  expect(card().textContent).toContain('先上传截图')
  const pool = root.querySelector('.import-pool')
  pool.insertAdjacentHTML('beforeend', '<article class="thumbnail-card is-classifying is-unconfirmed" data-import-image="one"></article>')
  version.value++; await settle(); expect(card().textContent).toContain('正在判断截图分类')
  pool.querySelector('.thumbnail-card').classList.remove('is-classifying')
  version.value++; await settle(); expect(card().textContent).toContain('检查并确认分类')
  root.querySelector('[data-confirm-pool]').addEventListener('click', () => {
    pool.querySelector('.thumbnail-card').classList.replace('is-unconfirmed', 'is-confirmed')
    root.querySelector('[data-start-ocr]').disabled = false; version.value++
  })
  root.querySelector('[data-confirm-pool]').click(); await settle()
  expect(card().textContent).toContain('可以开始识别了')
  root.querySelector('[data-start-ocr]').textContent = '取消识别'; version.value++; await settle()
  expect(card()).toBeNull()
  root.querySelector('[data-start-ocr]').textContent = '开始识别'; version.value++; await settle()
  expect(card().textContent).toContain('可以开始识别了')
  wrapper.unmount()
})
it('overlap appears only when actual overlap controls are focused and exits after rerender', async () => {
  root.querySelector('.import-pool').insertAdjacentHTML('beforeend', '<article class="thumbnail-card is-confirmed" data-import-image="one"></article>')
  root.querySelector('[data-start-ocr]').disabled = false
  expect(currentRecognitionGuidance(root).id).toBe('start')
  root.querySelector('.overlap-controls select').focus()
  expect(currentRecognitionGuidance(root).id).toBe('overlap')
  root.querySelector('.overlap-controls').innerHTML = '<button data-add-overlap>添加关系</button>'
  expect(currentRecognitionGuidance(root).id).toBe('start')
})
it('visible targets never scroll on opening, state changes, ordinary rerenders or resize', async () => {
  const wrapper = render(); await settle()
  expect(window.scrollTo).not.toHaveBeenCalled()
  await wrapper.setProps({ step: recognitionGuidance.start }); await settle()
  root.append(document.createElement('span')); window.dispatchEvent(new Event('resize')); await settle()
  expect(window.scrollTo).not.toHaveBeenCalled()
})
it('only a fully offscreen target is revealed, respecting reduced motion', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  root.querySelector('#file-drop-zone').getBoundingClientRect = () => ({ left: 20, top: 1600, right: 220, bottom: 1644, width: 200, height: 44 })
  render(); await settle()
  expect(window.scrollTo).toHaveBeenCalledOnce()
  expect(window.scrollTo.mock.calls[0][0]).toMatchObject({ top: 1588, behavior: 'auto' })
})
it('close/replay restore the opener, removed opener falls back, and product focus is not stolen', async () => {
  const opener = root.querySelector('#file-drop-zone'); opener.focus()
  const wrapper = render(); await settle()
  expect(document.activeElement).toBe(card())
  await wrapper.setProps({ open: false }); await settle(); expect(document.activeElement).toBe(opener)
  await wrapper.setProps({ open: true }); await settle()
  expect(document.activeElement).toBe(opener) // A product-driven return after a dialog/OCR never steals focus.
  const replay = root.querySelector('[data-confirm-pool]'); replay.focus()
  await wrapper.setProps({ replayId: 1 }); await settle()
  await wrapper.setProps({ open: false }); await settle(); expect(document.activeElement).toBe(replay)
  await wrapper.setProps({ open: true, replayId: 2 }); await settle(); replay.remove()
  await wrapper.setProps({ open: false }); await settle(); expect(document.activeElement).toBe(root)
  await wrapper.setProps({ open: true }); await settle()
  root.querySelector('[data-confirm-all-pools]').focus()
  await wrapper.setProps({ open: false }); await settle()
  expect(document.activeElement).toBe(root.querySelector('[data-confirm-all-pools]'))
})
it('Escape belongs to the upper product modal; tutorial dismissal is explicitly temporary', async () => {
  const wrapper = render(); await settle()
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); root.append(dialog)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle()
  expect(wrapper.emitted('close')).toBeUndefined()
  dialog.remove()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle()
  expect(wrapper.emitted('close')).toEqual([['later']])
})
it('a short touch viewport auto collapses and offers click expansion and repositioning without dragging', async () => {
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 300)
  root.querySelector('#file-drop-zone').getBoundingClientRect = () => ({ left: 12, top: 12, right: 378, bottom: 205, width: 366, height: 193 })
  render(); await settle()
  expect(card().classList.contains('is-collapsed')).toBe(true)
  expect(card().querySelector('.recognition-tour-handle')).toBeNull()
  expect(card().querySelector('.recognition-tour-move')).not.toBeNull()
  card().querySelector('.recognition-tour-expand').click(); await settle()
  expect(card().textContent).toContain('帮助与示例')
  card().querySelector('.recognition-tour-move').click(); await settle()
  expect(window.scrollTo).not.toHaveBeenCalled()
})

it('short visual viewports and safe areas bound the card without resize scrolling', async () => {
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844)
  const view = Object.assign(new EventTarget(), { offsetLeft: 0, offsetTop: 48, width: 390, height: 420 })
  vi.stubGlobal('visualViewport', view)
  render(); await settle()
  card().style.setProperty('--tour-safe-top', '20px'); card().style.setProperty('--tour-safe-bottom', '34px')
  card().getBoundingClientRect = () => ({ width: 366, height: 200 })
  view.dispatchEvent(new Event('resize')); await settle()
  expect(parseFloat(card().style.top)).toBeGreaterThanOrEqual(80)
  expect(parseFloat(card().style.top) + 200).toBeLessThanOrEqual(422)
  expect(card().style.maxHeight).toBe('342px')
  expect(window.scrollTo).not.toHaveBeenCalled()
})
