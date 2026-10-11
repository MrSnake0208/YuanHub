import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { mountYuanStar } from '../public/yuanstar-embed/yuanstar-embed.js'
import RecognitionTutorial from '../src/pages/star/RecognitionTutorial.vue'
import { mountStarCompletionDemo } from '../src/pages/star/dev/starCompletionDemo.js'
import { DEMO_ACCOUNT, DEMO_USER, completionFixture } from '../src/pages/star/dev/starCompletionMock.js'

const workbook = readFileSync('public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx')
const pendingKey = 'yuanhub.star-completion:v1:' + [DEMO_USER, DEMO_ACCOUNT, '如鸢'].map(encodeURIComponent).join(':')
let root, handle
const settle = async () => { await flushPromises(); await new Promise(resolve => setTimeout(resolve, 80)); await flushPromises() }
const server = () => JSON.parse(localStorage.getItem('yuanhub.p3b-demo-server:v1') || 'null')
const dialog = () => root.querySelector('.star-completion-dialog')
const change = (color, value) => {
  const field = dialog().querySelector(`[data-completion-experience="${color}"]`)
  field.value = value; field.dispatchEvent(new Event('input', { bubbles: true }))
}
beforeEach(() => {
  URL.createObjectURL ||= () => 'blob:completion-test'
  URL.revokeObjectURL ||= () => {}
  window.scrollTo = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (!String(url).endsWith('.xlsx')) throw Error('No network allowed in completion regression')
    return { ok: true, arrayBuffer: async () => { const bytes = new Uint8Array(workbook.length); bytes.set(workbook); return bytes.buffer } }
  }))
  root = document.createElement('div'); root.id = 'product-root'; document.body.append(root)
})
afterEach(async () => { await handle?.dispose(); root?.remove(); handle = null })
async function setup() {
  handle = await mountStarCompletionDemo({ mountYuanStar }, root, () => {})
  await settle()
}
async function openCompletion() {
  const select = root.querySelector('[data-growth-select-id="demo.tianfu.1"]')
  select.checked = true; select.dispatchEvent(new Event('change', { bubbles: true }))
  root.querySelector('[data-growth-complete]').click(); await settle()
  expect(dialog(), root.textContent.slice(-1200)).not.toBeNull()
}

it('real vendored completion dialog edits only drafts, retains bottle costs and yields the tutorial overlay', async () => {
  await setup()
  mount(RecognitionTutorial, { props: { open: true, mode: 'plan', root }, attachTo: document.body }); await settle()
  await openCompletion()
  expect(dialog().textContent).toContain('隔离演示')
  expect(document.querySelector('.recognition-tour').style.display).toBe('none')
  expect(dialog().querySelector('[data-completion-bottle="jiezheping"]').textContent).toBe('50')
  expect(dialog().querySelector('[data-completion-bottle="jieyangping"]').textContent).toBe('20')
  change('orange', '67'); change('purple', '0'); change('white', '0')
  expect(dialog().querySelector('[data-experience-balance="orange"]').textContent).toBe('200 → 133')
  expect(dialog().querySelector('[data-completion-confirm]').disabled).toBe(false)
  expect(server()).toBeNull()
  expect((await handle.getCloudBusinessSnapshot()).planTargets['demo.tianfu.1']).toBe(50)
  dialog().querySelector('[data-completion-close]').click(); await settle()
  expect(dialog()).toBeNull()
  expect(document.querySelector('.recognition-tour').style.display).toBe('')
  expect(server()).toBeNull()
})

it('isolated confirmation preserves actual quantity and CAS protocol in the existing port', async () => {
  await setup(); await openCompletion()
  change('orange', '67'); change('purple', '0'); change('white', '0')
  dialog().querySelector('[data-completion-confirm]').click(); await settle()
  expect(dialog()).toBeNull()
  const stored = server(), receipts = Object.values(stored.receipts)
  expect(receipts).toHaveLength(1)
  const request = JSON.parse(receipts[0].request_identity)
  expect(request).toMatchObject({ account_id: DEMO_ACCOUNT, game: '如鸢', expected_generation: 2, expected_star_revision: 3, expected_inventory_revision: 7,
    experience_consumed: { orange: 67, purple: 0, white: 0 }, bottles_consumed: { jiezhuping: 0, jiezheping: 50, jieyangping: 20 } })
  expect(stored.context.state.experience.orange).toBe(133)
  expect(stored.context.bottle_balances.jiezheping).toBe(350)
  expect(stored.context.state.inventory.find(star => star.instance_id === 'demo.tianfu.1').level).toBe(50)
  expect(stored.context.state.plan_targets['demo.tianfu.1']).toBeUndefined()
  expect(localStorage.getItem(pendingKey)).toBeNull()
})

it('response loss freezes the original command; remount recovers its receipt without a second deduction', async () => {
  await setup(); await openCompletion()
  change('orange', '67'); change('purple', '0'); change('white', '0')
  root.querySelector('.star-completion-demo-controls button').click()
  dialog().querySelector('[data-completion-confirm]').click(); await settle()
  expect(dialog().querySelector('[data-completion-close]').disabled).toBe(true)
  expect(dialog().querySelector('[data-completion-confirm]').textContent).toBe('按原请求重试')
  expect(localStorage.getItem(pendingKey)).not.toBeNull()
  const before = server()
  await handle.dispose(); handle = null; root.replaceChildren()
  await setup()
  expect(dialog()).toBeNull()
  expect(localStorage.getItem(pendingKey)).toBeNull()
  expect(server().context).toEqual(before.context)
  expect(Object.values(server().receipts)).toHaveLength(1)
  expect(server().context.state.experience.orange).toBe(completionFixture().state.experience.orange - 67)
})
