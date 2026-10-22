import { legacyLedgerFixture } from '../test-support/ledgerCatalog.js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import { resetCartDraft } from '../src/store/cartDraft.js'
import PlanSaveDialog from '../src/components/cart/PlanSaveDialog.vue'
import ReceiptPanel from '../src/components/cart/ReceiptPanel.vue'
import html2canvas from 'html2canvas'

vi.mock('../src/api/ledgerCatalog.js', () => ({ getLedgerCatalog: vi.fn(async () => legacyLedgerFixture()) }))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: false } }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))

let media, change
beforeEach(() => {
  resetCartDraft()
  vi.resetAllMocks()
  change = null
  media = {
    matches: true,
    addEventListener: vi.fn((_event, listener) => { change = listener }),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})
afterEach(() => { delete document.documentElement.dataset.theme })
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
  const saveButton = bodyElement('.cart-receipt-drawer .cart-actions .receipt-save')
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

it('a dark compact drawer exports an isolated light snapshot without changing the page theme', async () => {
  document.documentElement.dataset.theme = 'dark'
  const wrapper = render()
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  html2canvas.mockImplementationOnce(async element => {
    expect(element).toBe(document.querySelector('.cart-export-view .receipt'))
    expect(element.closest('[data-theme]').dataset.theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('dark')
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


it.each([390, 1440])('方案草稿在%s起步跨收据布局保持焦点、名称与唯一清单', async width => {
  const originalWidth = window.innerWidth
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  media.matches = width <= 1180
  const wrapper = render(); await flushPromises()
  try {
    await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
    if (media.matches) await openReceipt(wrapper)
    const receipt = wrapper.getComponent(ReceiptPanel).vm.$
    await bodyElement('.cart-actions .receipt-save').trigger('click'); await flushPromises()
    const input = document.querySelector('[aria-label="方案名称"]')
    await new DOMWrapper(input).setValue('跨布局未保存方案')
    input.focus()
    const total = document.querySelector('.receipt .grand-total .v').textContent
    for (const nextWidth of [767, 768, 1080, 1180, 1181, width]) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: nextWidth })
      media.matches = nextWidth <= 1180
      change()
      window.dispatchEvent(new Event('resize')); await flushPromises()
      expect(document.querySelector('[aria-label="方案名称"]')).toBe(input)
      expect(input.value).toBe('跨布局未保存方案')
      expect(document.activeElement).toBe(input)
      expect(wrapper.getComponent(ReceiptPanel).vm.$).toBe(receipt)
      expect(document.querySelectorAll('.receipt')).toHaveLength(1)
      expect(document.querySelector('.receipt .grand-total .v').textContent).toBe(total)
    }
    expect(localStorage.getItem('yh_ledger_plans')).toBeNull()
    expect(html2canvas).not.toHaveBeenCalled()
  } finally {
    wrapper.unmount()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
  }
})


it('budget summary stays visible for an empty cart and exports expanded pricing details', async () => {
  const wrapper = mount(ReceiptPanel)
  expect(wrapper.get('.grand-total .v').text()).toBe('¥0.00')
  expect(wrapper.findAll('.receipt-metrics strong').map(node => node.text())).toEqual(['0', '0.0'])
  expect(wrapper.get('.receipt-average').text()).toContain('不适用')
  expect(wrapper.get('.receipt-clear').attributes('disabled')).toBeDefined()
  await wrapper.get('.receipt-save').trigger('click')
  expect(wrapper.emitted('save-plan')).toHaveLength(1)
  await wrapper.setProps({
    cartItems: [{ id: 'sample', name: '示例礼包', calculatedPrice: 20, originalPrice: 25, originalCurrency: 'CNY' }],
    cart: { sample: 2 }, totalAmount: 40, totalPoints: 120, totalDraws: 4,
    displayDrawCost: 30, originalTotal: 50, discountPercent: 80,
  })
  expect(wrapper.get('.receipt-count').text()).toBe('已选 2 件')
  expect(wrapper.get('.grand-total .v').text()).toBe('¥40.00')
  expect(wrapper.get('.receipt-average').text()).toContain('¥7.50/抽')
  expect(wrapper.get('.receipt-pricing-details').element.open).toBe(false)
  await wrapper.setProps({ exportOnly: true })
  expect(wrapper.get('.receipt-pricing-details').element.open).toBe(true)
  expect(wrapper.get('.receipt-pricing-details').text()).toContain('¥50.00')
  expect(wrapper.get('.receipt-pricing-details').text()).toContain('80%')
  expect(wrapper.find('.cart-actions').exists()).toBe(false)
})
