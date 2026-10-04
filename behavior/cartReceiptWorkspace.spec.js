import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import PlanSaveDialog from '../src/components/cart/PlanSaveDialog.vue'
import html2canvas from 'html2canvas'

vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: false } }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))

let media, change
beforeEach(() => {
  vi.resetAllMocks()
  change = null
  media = {
    matches: true,
    addEventListener: vi.fn((_event, listener) => { change = listener }),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})
const render = () => mount(CartPage, { attachTo: document.body, global: {
  stubs: { IslandSidebar: true, SiteFooter: true }, directives: { reveal: () => {} },
} })
const bodyElement = selector => new DOMWrapper(document.querySelector(selector))
async function openReceipt(wrapper) {
  const opener = wrapper.get('.cart-mbar .mbtn.primary')
  opener.element.focus()
  await opener.trigger('click')
  await flushPromises()
  return opener
}

it('one receipt is shared by drawer and desktop while resizing without reload', async () => {
  const wrapper = render()
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  await openReceipt(wrapper)
  const drawerTotal = document.querySelector('.receipt .grand-total .v').textContent
  expect(document.querySelectorAll('.receipt')).toHaveLength(1)
  expect(document.body.style.overflow).toBe('hidden')
  media.matches = false
  change()
  await flushPromises()
  expect(wrapper.get('.cart-layout .receipt .grand-total .v').text()).toBe(drawerTotal)
  expect(document.querySelector('[aria-label="关闭购物清单"]')).toBeNull()
  expect(document.querySelectorAll('.receipt')).toHaveLength(1)
  expect(document.body.style.overflow).toBe('')
  media.matches = true
  change()
  await flushPromises()
  expect(wrapper.get('.cart-mbar .mbtn.primary').attributes('aria-expanded')).toBe('false')
})

it('Escape, Tab and backdrop restore opener focus and the previous scroll-lock value', async () => {
  document.body.style.overflow = 'auto'
  const wrapper = render()
  const opener = await openReceipt(wrapper)
  const close = document.querySelector('[aria-label="关闭购物清单"]')
  expect(document.activeElement).toBe(close)
  await bodyElement('[aria-label="关闭购物清单"]').trigger('keydown', { key: 'Tab', shiftKey: true })
  expect(document.querySelector('.cart-receipt-drawer').contains(document.activeElement)).toBe(true)
  await bodyElement('.cart-receipt-drawer').trigger('keydown', { key: 'Escape' })
  await flushPromises()
  expect(document.activeElement).toBe(opener.element)
  expect(document.body.style.overflow).toBe('auto')
  expect(opener.attributes('aria-expanded')).toBe('false')
  await openReceipt(wrapper)
  await bodyElement('.cart-receipt-mask').trigger('click')
  await flushPromises()
  expect(opener.attributes('aria-expanded')).toBe('false')
  document.body.style.overflow = ''
})

it('nested save dialog owns focus and Escape closes only the top layer', async () => {
  const wrapper = render()
  await openReceipt(wrapper)
  const saveButton = bodyElement('.cart-receipt-drawer .cart-actions button:last-child')
  saveButton.element.focus()
  await saveButton.trigger('click')
  await flushPromises()
  const input = document.querySelector('[aria-label="方案名称"]')
  expect(document.activeElement).toBe(input)
  expect(wrapper.getComponent(PlanSaveDialog).exists()).toBe(true)
  expect(input.closest('.modal-mask').classList.contains('is-raised')).toBe(true)
  await bodyElement('[aria-label="方案名称"]').trigger('keydown', { key: 'Escape' })
  await flushPromises()
  expect(wrapper.findComponent(PlanSaveDialog).exists()).toBe(false)
  expect(wrapper.get('.cart-mbar .mbtn.primary').attributes('aria-expanded')).toBe('true')
  expect(document.activeElement).toBe(saveButton.element)
})

it('a closed compact drawer can export and export-only markup has no input/actions', async () => {
  const wrapper = render()
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  html2canvas.mockImplementationOnce(async element => {
    expect(element).toBe(document.querySelector('.cart-export-view .receipt'))
    expect(element.querySelector('input')).toBeNull()
    expect(element.textContent).toContain('年卡')
    expect(document.querySelector('.cart-export-view .cart-actions')).toBeNull()
    return { toDataURL: () => 'data:image/png;base64,AA' }
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await wrapper.get('.cart-mbar .mbtn.accent').trigger('click')
  await flushPromises()
  expect(html2canvas).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.cart-mbar .mbtn.primary').attributes('aria-expanded')).toBe('false')
  expect(document.querySelectorAll('.receipt')).toHaveLength(1)
})

it('unmount releases media listener and scroll lock; pending export cannot download afterward', async () => {
  const wrapper = render()
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  await openReceipt(wrapper)
  let finish
  html2canvas.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await wrapper.get('.cart-mbar .mbtn.accent').trigger('click')
  await flushPromises()
  wrapper.unmount()
  finish({ toDataURL: () => 'data:image/png;base64,AA' })
  await flushPromises()
  expect(download).not.toHaveBeenCalled()
  expect(document.body.style.overflow).toBe('')
  expect(media.removeEventListener).toHaveBeenCalledWith('change', change)
  expect(document.querySelector('.cart-export-view')).toBeNull()
})
