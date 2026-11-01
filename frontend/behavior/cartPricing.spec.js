import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import CustomPackageModal from '../src/components/cart/CustomPackageModal.vue'
import PlanSaveDialog from '../src/components/cart/PlanSaveDialog.vue'
import PlanListDialog from '../src/components/cart/PlanListDialog.vue'
import { resetCartDraft } from '../src/store/cartDraft.js'
import { auth } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'
import * as ledger from '../src/api/ledger.js'
import { legacyLedgerFixture } from '../test-support/ledgerCatalog.js'
import html2canvas from 'html2canvas'

vi.mock('../src/api/ledgerCatalog.js', () => ({ getLedgerCatalog: vi.fn(async () => legacyLedgerFixture()) }))
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ isLoggedIn: false, userInfo: null }) }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/api/ledger.js', () => ({ createPlan: vi.fn(), updatePlan: vi.fn(), getPlan: vi.fn(), listPlans: vi.fn(), deletePlan: vi.fn() }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))

const render = () => mount(CartPage, { attachTo: document.body, global: {
  stubs: { IslandSidebar: true, SiteFooter: true, Teleport: true }, directives: { reveal: () => {} },
} })
const total = w => w.get('.receipt .grand-total .v').text()
const customCard = w => w.findAll('.pkg-card').find(card => card.text().includes('当地充值'))
async function addCustom(w, values = {}) {
  await w.get('.pkg-add-card').trigger('click')
  w.getComponent(CustomPackageModal).vm.$emit('submit', { name: '当地充值', price: 100, currency: 'HKD', points: 10, draws: 2, ...values })
  await flushPromises()
  await customCard(w).get('.stepper button:last-child').trigger('click')
}
async function save(w, name = '新预算') {
  await w.get('.cart-plan-save').trigger('click')
  w.getComponent(PlanSaveDialog).vm.$emit('save', { name, overwrite: false })
  await flushPromises()
  return JSON.parse(localStorage.getItem('yh_ledger_plans'))?.[0]
}
async function loadGuest(w, plan) {
  await w.get('.cart-plan-list').trigger('click')
  w.getComponent(PlanListDialog).vm.$emit('load-guest', plan)
  await flushPromises()
}

beforeEach(() => {
  resetCartDraft()
  vi.clearAllMocks()
  auth.isLoggedIn = false
  auth.userInfo = null
  dialog.confirm.mockResolvedValue(true)
  ledger.listPlans.mockResolvedValue([])
})

it('HKD pricing, JPY output, discounts and custom-only mode round-trip through guest storage', async () => {
  const w = render()
  await w.get('.cart-version-selector').setValue('ru')
  await w.get('.cart-plan-new').trigger('click')
  await flushPromises()
  expect(w.findAll('.pkg-card')).toHaveLength(0)
  await addCustom(w)
  expect(total(w)).toBe('待填写汇率')
  await w.get('.cart-plan-save').trigger('click')
  expect(w.findComponent(PlanSaveDialog).exists()).toBe(false)
  await w.get('[aria-label="港币兑人民币参考汇率"]').setValue('0.9')
  await w.get('[aria-label="日元兑人民币参考汇率"]').setValue('0.05')
  await w.get('[aria-label="预算显示币种"]').setValue('JPY')
  await w.get('[aria-label="支付原价的百分比"]').setValue('95')
  expect(total(w)).toBe('JP¥1710')
  const plan = await save(w)
  expect(plan.pricing).toMatchObject({ currency: 'JPY', discount_percent: 95, custom_only: true, rates: { HKD: 0.9, JPY: 0.05 } })
  expect(plan.cart_items[0].package_snapshot).toMatchObject({ price_amount: 100, price_currency: 'HKD' })
  await w.get('[aria-label="预算显示币种"]').setValue('CNY')
  await loadGuest(w, plan)
  expect(total(w)).toBe('JP¥1710')
  expect(w.findAll('.pkg-card')).toHaveLength(1)
  expect(w.get('.receipt').text()).toContain('10 分')
})

it('editing and per-item exemptions update spend without changing quantity or rewards', async () => {
  const w = render()
  await w.get('.cart-version-selector').setValue('ru')
  await addCustom(w, { price: 648, currency: 'CNY' })
  await w.get('[aria-label="支付原价的百分比"]').setValue('95')
  expect(total(w)).toBe('¥615.60')
  await customCard(w).get('input[type="checkbox"]').setValue(false)
  expect(total(w)).toBe('¥648.00')
  await customCard(w).get('.pkg-personal-actions button').trigger('click')
  const modal = w.getComponent(CustomPackageModal)
  expect(modal.props('editing')).toBe(true)
  await modal.get('#custom-price').setValue('700')
  await modal.get('form').trigger('submit')
  expect(total(w)).toBe('¥700.00')
  expect(customCard(w).get('.qty').text()).toBe('1')
  expect(w.findAll('.receipt-metrics strong')[1].text()).toBe('2.0')
  const plan = await save(w)
  expect(plan.custom_packages[0].discount_eligible).toBe(false)
  expect(plan.cart_items[0].package_snapshot.price_amount).toBe(700)
})

it('copying a public package keeps the original price and requires new local price on currency change', async () => {
  const w = render()
  await flushPromises()
  const card = w.get('.pkg-card')
  const original = card.get('.pkg-price').text()
  await card.get('.pkg-personal-actions button').trigger('click')
  const modal = w.getComponent(CustomPackageModal)
  expect(modal.props('editing')).toBe(false)
  await modal.get('#custom-price-currency').setValue('HKD')
  expect(modal.get('#custom-price').element.value).toBe('')
  await modal.get('[aria-label="礼包名称"]').setValue('当地充值')
  await modal.get('#custom-price').setValue('88')
  await modal.get('form').trigger('submit')
  expect(w.get('.pkg-card .pkg-price').text()).toBe(original)
  expect(customCard(w).text()).toContain('HK$88.00')
})

it('blank plans confirm before clearing only the active game and remove overwrite identity', async () => {
  const w = render()
  await w.get('.pkg-card .stepper button:last-child').trigger('click')
  const daihaoTotal = total(w)
  await w.get('.cart-version-selector').setValue('ru')
  await addCustom(w, { currency: 'CNY', price: 6 })
  const plan = await save(w)
  dialog.confirm.mockResolvedValueOnce(false)
  await w.get('.cart-plan-new').trigger('click')
  await flushPromises()
  expect(total(w)).toBe('¥6.00')
  await w.get('.cart-plan-new').trigger('click')
  await flushPromises()
  expect(w.find('.receipt-empty').exists()).toBe(true)
  expect(w.findAll('.pkg-card')).toHaveLength(0)
  const empty = await save(w, '空白')
  expect(empty._localId).not.toBe(plan._localId)
  expect(JSON.parse(localStorage.getItem('yh_ledger_plans'))).toHaveLength(2)
  await w.get('.cart-version-selector').setValue('daihao')
  expect(total(w)).toBe(daihaoTotal)
})

it('a late blank-plan confirmation cannot clear edits made while the dialog was pending', async () => {
  let resolve
  dialog.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const w = render()
  await w.get('.pkg-card .stepper button:last-child').trigger('click')
  await w.get('.cart-plan-new').trigger('click')
  await w.get('[aria-label="支付原价的百分比"]').setValue('95')
  const before = total(w)
  resolve(true)
  await flushPromises()
  expect(total(w)).toBe(before)
})

it('rate-only edits require confirmation and late confirmation preserves an unfinished rate', async () => {
  const w = render()
  await w.get('.cart-version-selector').setValue('ru')
  await w.get('[aria-label="港币兑人民币参考汇率"]').setValue('0.9')
  dialog.confirm.mockResolvedValueOnce(false)
  await w.get('.cart-plan-new').trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
  expect(w.get('[aria-label="港币兑人民币参考汇率"]').element.value).toBe('0.9')
  let resolve
  dialog.confirm.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await w.get('.cart-plan-new').trigger('click')
  await w.get('[aria-label="日元兑人民币参考汇率"]').setValue('0')
  resolve(true)
  await flushPromises()
  expect(w.get('[aria-label="港币兑人民币参考汇率"]').element.value).toBe('0.9')
  expect(w.get('[aria-label="日元兑人民币参考汇率"]').element.value).toBe('0')
})

it('cloud rename preserves pricing and generic price fields through full replacement', async () => {
  const w = render()
  await addCustom(w)
  await w.get('[aria-label="港币兑人民币参考汇率"]').setValue('0.9')
  const plan = { ...await save(w), id: 'cloud-plan' }
  auth.isLoggedIn = true
  auth.userInfo = { id: 'owner' }
  await flushPromises()
  ledger.getPlan.mockResolvedValue(plan)
  ledger.updatePlan.mockResolvedValue(plan)
  await w.get('.cart-plan-list').trigger('click')
  await flushPromises()
  w.getComponent(PlanListDialog).vm.$emit('rename', plan, '新名称')
  await flushPromises()
  expect(ledger.updatePlan).toHaveBeenCalledWith('cloud-plan', expect.objectContaining({
    name: '新名称', pricing: plan.pricing, customPackages: plan.custom_packages,
    cartItems: expect.arrayContaining([expect.objectContaining({ package_snapshot: expect.objectContaining({ price_currency: 'HKD', price_amount: 100 }) })]),
  }))
})

it('export freezes currency discount and rates and missing target rates block it', async () => {
  const w = render()
  await addCustom(w, { price: 100, currency: 'CNY' })
  await w.get('[aria-label="预算显示币种"]').setValue('JPY')
  await w.get('.cart-actions .receipt-export').trigger('click')
  expect(html2canvas).not.toHaveBeenCalled()
  await w.get('[aria-label="日元兑人民币参考汇率"]').setValue('0.05')
  await w.get('[aria-label="支付原价的百分比"]').setValue('95')
  let resolve
  html2canvas.mockImplementationOnce(element => {
    expect(element.textContent).toContain('JP¥1900')
    expect(element.textContent).toContain('95%')
    expect(element.textContent).toContain('1 JPY = 0.05 CNY')
    return new Promise(done => { resolve = done })
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await w.get('.cart-actions .receipt-export').trigger('click')
  await flushPromises()
  await w.get('[aria-label="预算显示币种"]').setValue('HKD')
  expect(w.get('.cart-export-view').text()).toContain('JP¥1900')
  resolve({ toDataURL: () => 'data:image/png;base64,AA' })
  await flushPromises()
})

it('game pricing remains independent and account switches clear all pricing drafts', async () => {
  const w = render()
  await w.get('[aria-label="预算显示币种"]').setValue('JPY')
  await w.get('[aria-label="日元兑人民币参考汇率"]').setValue('0.05')
  await w.get('[aria-label="支付原价的百分比"]').setValue('95')
  await w.get('.cart-version-selector').setValue('ru')
  expect(w.get('[aria-label="预算显示币种"]').element.value).toBe('CNY')
  await w.get('[aria-label="预算显示币种"]').setValue('HKD')
  await w.get('[aria-label="港币兑人民币参考汇率"]').setValue('0.9')
  await w.get('.cart-version-selector').setValue('daihao')
  expect(w.get('[aria-label="预算显示币种"]').element.value).toBe('JPY')
  expect(w.get('[aria-label="支付原价的百分比"]').element.value).toBe('95')
  auth.isLoggedIn = true
  auth.userInfo = { id: 'another-owner' }
  await flushPromises()
  expect(w.get('[aria-label="预算显示币种"]').element.value).toBe('CNY')
  expect(w.get('[aria-label="支付原价的百分比"]').element.value).toBe('100')
  await w.get('.cart-version-selector').setValue('ru')
  expect(w.get('[aria-label="预算显示币种"]').element.value).toBe('CNY')
  expect(w.get('[aria-label="港币兑人民币参考汇率"]').element.value).toBe('')
})

it('guest upload and cloud overwrite retain generic prices and canonical custom IDs', async () => {
  const w = render()
  await addCustom(w, { price: 100, currency: 'JPY' })
  await w.get('[aria-label="日元兑人民币参考汇率"]').setValue('0.05')
  const local = await save(w)
  auth.isLoggedIn = true
  auth.userInfo = { id: 'owner' }
  await flushPromises()
  await loadGuest(w, local)
  const cloud = { ...local, id: 'cloud-plan', custom_packages: [{ ...local.custom_packages[0], id: 999900 }], cart_items: [{ ...local.cart_items[0], content_id: 999900 }] }
  ledger.createPlan.mockResolvedValue(cloud)
  await w.get('.cart-plan-save').trigger('click')
  w.getComponent(PlanSaveDialog).vm.$emit('save', { name: local.name, overwrite: true })
  await flushPromises()
  expect(ledger.createPlan).toHaveBeenCalledWith(expect.objectContaining({ pricing: local.pricing }))
  expect(total(w)).toBe('¥5.00')
  ledger.updatePlan.mockResolvedValue(cloud)
  await w.get('.cart-plan-save').trigger('click')
  w.getComponent(PlanSaveDialog).vm.$emit('save', { name: local.name, overwrite: true })
  await flushPromises()
  expect(ledger.updatePlan).toHaveBeenCalledWith('cloud-plan', expect.objectContaining({
    pricing: local.pricing, cartItems: [expect.objectContaining({ content_id: 999900 })],
    customPackages: [expect.objectContaining({ id: 999900, price_currency: 'JPY', price_amount: 100 })],
  }))
})
