import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import PlanListDialog from '../src/components/cart/PlanListDialog.vue'
import * as api from '../src/api/ledgerCatalog.js'
import { ledgerFixture } from '../test-support/ledgerCatalog.js'
import { LEDGER_CACHE_KEY } from '../src/utils/ledgerCatalog.js'
import { packagesDaihao } from '../src/data/packages.js'
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: false } }))
vi.mock('../src/api/ledgerCatalog.js', () => ({ getLedgerCatalog: vi.fn() }))
const render = () => mount(CartPage, { global: { stubs: { IslandSidebar: true, SiteFooter: true }, directives: { reveal: () => {} } } })
const deferred = () => { let resolve; const promise = new Promise(ok => { resolve = ok }); return { promise, resolve } }
const total = w => w.get('.receipt .grand-total .v').text()
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-11T00:00:00Z')); api.getLedgerCatalog.mockResolvedValue(ledgerFixture()) })

it('published catalog supports both games same numeric ID decimal draws and dynamic arbitrary campaigns', async () => {
  const w = render(); await flushPromises()
  expect(w.findAll('.pkg-card')).toHaveLength(1)
  await w.get('.pkg-card .stepper button:last-child').trigger('click')
  expect(total(w)).toBe('¥16.00')
  expect(w.get('.receipt').text()).toContain('0.6 抽')
  expect(w.get('.milestone').text()).toContain('动态活动0')
  expect(w.get('.milestone').text()).toContain('动态活动1')
  expect(w.get('.milestone').text()).not.toContain('动态活动2')
  await w.get('.cart-version-selector').setValue('ru')
  await w.get('.pkg-card .stepper button:last-child').trigger('click')
  expect(total(w)).toBe('¥6.00')
  expect(w.get('.milestone').text()).toContain('动态活动2')
  await w.get('.cart-version-selector').setValue('daihao')
  expect(total(w)).toBe('¥16.00')
})

it('late config preserves user rate and selected price points and draws from before replacement', async () => {
  const d = deferred(); api.getLedgerCatalog.mockReturnValue(d.promise)
  const w = render()
  const first = packagesDaihao[0]
  await w.get('.pkg-card .stepper button:last-child').trigger('click')
  await w.get('input[aria-label="美元兑人民币汇率"]').setValue('7')
  d.resolve(ledgerFixture()); await flushPromises()
  expect(total(w)).toBe(`¥${(first.priceUsd * 7).toFixed(2)}`)
  expect(w.get('.receipt').text()).toContain(first.name)
  expect(w.get('input[aria-label="美元兑人民币汇率"]').element.value).toBe('7')
})

it('late config cannot overwrite historical plan rate or removed snapshot and resave still works', async () => {
  const d = deferred(); api.getLedgerCatalog.mockReturnValue(d.promise)
  const w = render()
  await w.get('.cart-plan-list').trigger('click')
  w.getComponent(PlanListDialog).vm.$emit('load-guest', { version: 'daihao', name: '旧', exchange_rate: 9,
    cart_items: [{ content_id: 99, quantity: 2, package_snapshot: { name: '下架旧礼包', points: 4, draws: 0.6, price_usd: 3, limit: 2 } }], custom_packages: [] })
  await flushPromises(); d.resolve(ledgerFixture()); await flushPromises()
  expect(total(w)).toBe('¥54.00')
  expect(w.get('.receipt').text()).toContain('下架旧礼包')
  expect(w.get('input[aria-label="美元兑人民币汇率"]').element.value).toBe('9')
})

it('network failure uses visibly dated cache and retry with empty published catalog retains selected snapshot', async () => {
  localStorage.setItem(LEDGER_CACHE_KEY, JSON.stringify({ savedAt: '2026-10-10T00:00:00Z', data: ledgerFixture() }))
  api.getLedgerCatalog.mockRejectedValueOnce(new Error('断网'))
  const w = render(); await flushPromises()
  expect(w.get('.cart-catalog-status').text()).toContain('上次成功缓存')
  expect(w.get('.cart-catalog-status').text()).toContain('不是最新发布数据')
  await w.get('.pkg-card .stepper button:last-child').trigger('click')
  api.getLedgerCatalog.mockResolvedValue({ ...ledgerFixture(), packages: [] })
  await w.get('.cart-catalog-status button').trigger('click'); await flushPromises()
  expect(total(w)).toBe('¥16.00')
  expect(w.get('.cart-catalog-status').text()).toContain('尚未发布可售礼包')
  w.unmount()
  const fresh = render(); await flushPromises()
  expect(fresh.findAll('.pkg-card')).toHaveLength(0)
})

it('bad response keeps bundled catalog and exposes migration fallback rather than claiming freshness', async () => {
  api.getLedgerCatalog.mockResolvedValue(null)
  const w = render(); await flushPromises()
  expect(w.get('.cart-catalog-status').text()).toContain('使用备用礼包资料，价格可能不是最新')
  expect(w.findAll('.pkg-card')).toHaveLength(packagesDaihao.length)
})
