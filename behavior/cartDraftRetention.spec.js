import { beforeEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import CustomPackageModal from '../src/components/cart/CustomPackageModal.vue'
import PlanListDialog from '../src/components/cart/PlanListDialog.vue'
import PlanSaveDialog from '../src/components/cart/PlanSaveDialog.vue'
import ReceiptPanel from '../src/components/cart/ReceiptPanel.vue'
import { resetCartDraft } from '../src/store/cartDraft.js'
import { auth } from '../src/store/auth.js'
import * as catalog from '../src/api/ledgerCatalog.js'
import * as ledger from '../src/api/ledger.js'
import { dialog } from '../src/utils/dialog.js'
import { ledgerFixture } from '../test-support/ledgerCatalog.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: false, userInfo: null }) }
})
vi.mock('../src/api/ledgerCatalog.js', () => ({ getLedgerCatalog: vi.fn() }))
vi.mock('../src/api/ledger.js', () => ({ createPlan: vi.fn(), updatePlan: vi.fn(), getPlan: vi.fn(), listPlans: vi.fn(), deletePlan: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const render = () => mount(CartPage, { attachTo: document.body, global: {
  stubs: { IslandSidebar: true, SiteFooter: true }, directives: { reveal: () => {} },
} })
const total = w => w.get('.cart-mbar .sum .v').text()
const add = w => w.get('.pkg-card .stepper button:last-child').trigger('click')
const switchGame = (w, game) => w.get('.cart-version-selector').setValue(game)
const localPlan = () => ({
  _localId: 'local-one', name: '本机旧方案', version: 'daihao', exchange_rate: 7,
  initial_points: 13, custom_packages: [],
  cart_items: [{ content_id: 99, quantity: 2, package_snapshot: {
    name: '历史礼包', category: '存档', points: 3, draws: 2, limit: 9, price_usd: 3,
  } }],
})
function deferred() {
  let resolve
  const promise = new Promise(ok => { resolve = ok })
  return { resolve, promise }
}
beforeEach(() => {
  resetCartDraft()
  vi.resetAllMocks()
  auth.isLoggedIn = false
  auth.userInfo = null
  catalog.getLedgerCatalog.mockResolvedValue(ledgerFixture())
  ledger.listPlans.mockResolvedValue([])
  dialog.confirm.mockResolvedValue(true)
})

it('leaving and returning retains both unsaved game carts, customs, points, FX and selected snapshots', async () => {
  const w = render()
  await flushPromises()
  await add(w)
  await w.get('[aria-label="美元兑人民币汇率"]').setValue('7')
  w.getComponent(ReceiptPanel).vm.$emit('update-initial', 13)
  w.getComponent(CustomPackageModal).vm.$emit('submit', { name: '测试自定义', price: 3, points: 5, draws: 1, limit: 9 })
  await flushPromises()
  await w.findAll('.pkg-card').find(card => card.text().includes('测试自定义')).get('.stepper button:last-child').trigger('click')
  expect(total(w)).toBe('¥35.00')
  await switchGame(w, 'ru')
  await add(w)
  w.getComponent(ReceiptPanel).vm.$emit('update-initial', 4)
  await flushPromises()
  w.unmount()
  // 重新进页时目录已清空，已选快照仍须完整计价。
  catalog.getLedgerCatalog.mockResolvedValue({ ...ledgerFixture(), packages: [] })
  const back = render()
  await flushPromises()
  expect(back.get('.cart-version-selector').element.value).toBe('ru')
  expect(total(back)).toBe('¥6.00')
  expect(back.getComponent(ReceiptPanel).props('initialPoints')).toBe(4)
  await switchGame(back, 'daihao')
  expect(total(back)).toBe('¥35.00')
  expect(back.getComponent(ReceiptPanel).props('initialPoints')).toBe(13)
  expect(back.get('[aria-label="美元兑人民币汇率"]').element.value).toBe('7')
  expect(back.get('.receipt').text()).toContain('测试自定义')
  expect(localStorage.getItem('yh_ledger_plans')).toBeNull()
  expect(ledger.createPlan).not.toHaveBeenCalled()
  expect(ledger.updatePlan).not.toHaveBeenCalled()
})

it('returning retains invalid FX input and the last valid total until corrected', async () => {
  const w = render()
  await flushPromises()
  await add(w)
  await w.get('[aria-label="美元兑人民币汇率"]').setValue('7')
  await w.get('[aria-label="美元兑人民币汇率"]').setValue('')
  w.unmount()
  const back = render()
  await flushPromises()
  expect(total(back)).toBe('¥14.00')
  expect(back.get('[aria-label="美元兑人民币汇率"]').element.value).toBe('')
  expect(back.get('#cart-rate-error').text()).toContain('请输入')
  await back.get('.cart-plan-save').trigger('click')
  expect(back.findComponent(PlanSaveDialog).exists()).toBe(false)
})

it('a changed public default rate cannot reprice an already selected budget after returning', async () => {
  const w = render()
  await flushPromises()
  await add(w)
  w.unmount()
  const changed = ledgerFixture()
  changed.settings.exchange_rate = 9
  catalog.getLedgerCatalog.mockResolvedValue(changed)
  const back = render()
  await flushPromises()
  expect(total(back)).toBe('¥16.00')
  expect(back.get('[aria-label="美元兑人民币汇率"]').element.value).toBe('8')
})

it('visible save and explicit local load preserve the active overwrite identity after returning', async () => {
  localStorage.setItem('yh_ledger_plans', JSON.stringify([localPlan()]))
  const w = render()
  await flushPromises()
  expect(w.get('.cart-plan-save').text()).toBe('保存方案')
  expect(w.get('.cart-plan-save').element.closest('details')).toBeNull()
  expect(w.text()).toContain('刷新、关闭或切换账号前')
  await w.get('.cart-plan-list').trigger('click')
  await new DOMWrapper(document.querySelector('.plan-load')).trigger('click')
  await flushPromises()
  expect(total(w)).toBe('¥42.00')
  expect(w.findComponent(PlanListDialog).exists()).toBe(false)
  w.unmount()
  const back = render()
  await flushPromises()
  await back.get('.cart-plan-save').trigger('click')
  expect(back.getComponent(PlanSaveDialog).props()).toMatchObject({ existing: true, name: '本机旧方案' })
  back.getComponent(PlanSaveDialog).vm.$emit('save', { name: '覆盖后', overwrite: true })
  await flushPromises()
  const records = JSON.parse(localStorage.getItem('yh_ledger_plans'))
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ _localId: 'local-one', name: '覆盖后' })
})

it('explicit cloud load uses the existing detail API and retains cloud overwrite identity on returning', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'a' }
  const plan = { ...localPlan(), id: 'cloud-one', name: '云端旧方案' }
  ledger.listPlans.mockResolvedValue([plan])
  ledger.getPlan.mockResolvedValue(plan)
  ledger.updatePlan.mockResolvedValue({ ...plan, name: '云端覆盖' })
  const w = render()
  await flushPromises()
  await w.get('.cart-plan-list').trigger('click')
  await flushPromises()
  await new DOMWrapper(document.querySelector('.plan-load')).trigger('click')
  await flushPromises()
  expect(ledger.getPlan).toHaveBeenCalledWith('cloud-one')
  expect(total(w)).toBe('¥42.00')
  w.unmount()
  const back = render()
  await flushPromises()
  await back.get('.cart-plan-save').trigger('click')
  back.getComponent(PlanSaveDialog).vm.$emit('save', { name: '云端覆盖', overwrite: true })
  await flushPromises()
  expect(ledger.updatePlan).toHaveBeenCalledWith('cloud-one', expect.objectContaining({ name: '云端覆盖' }))
  expect(ledger.createPlan).not.toHaveBeenCalled()
})

it('identity changes on-page clear both game drafts and prevent A→B→A resurrection', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'a' }
  const w = render()
  await flushPromises()
  await add(w)
  await switchGame(w, 'ru')
  await add(w)
  auth.userInfo = { id: 'b' }
  await flushPromises()
  expect(total(w)).toBe('¥0.00')
  await switchGame(w, 'ru')
  expect(total(w)).toBe('¥0.00')
  auth.userInfo = { id: 'a' }
  await flushPromises()
  expect(total(w)).toBe('¥0.00')
  expect(w.get('.cart-operation-message').text()).toContain('账号已变化')
})

it('identity changed while away cannot inherit the previous account draft or overwrite identity', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'a' }
  const w = render()
  await flushPromises()
  await add(w)
  w.unmount()
  auth.userInfo = { id: 'b' }
  const back = render()
  await flushPromises()
  expect(total(back)).toBe('¥0.00')
  await back.get('.cart-plan-save').trigger('click')
  expect(back.getComponent(PlanSaveDialog).props('existing')).toBe(false)
})

it('a clear confirmation from the old page cannot clear the returned page draft', async () => {
  const pending = deferred()
  dialog.confirm.mockReturnValue(pending.promise)
  const w = render()
  await flushPromises()
  await add(w)
  await w.get('.cart-mbar [aria-label="清空购物车"]').trigger('click')
  w.unmount()
  const back = render()
  await flushPromises()
  await add(back)
  pending.resolve(true)
  await flushPromises()
  expect(total(back)).toBe('¥32.00')
})

it('a custom delete confirmation from the old page cannot delete the returned page draft', async () => {
  const pending = deferred()
  dialog.confirm.mockReturnValue(pending.promise)
  const w = render()
  await flushPromises()
  w.getComponent(CustomPackageModal).vm.$emit('submit', { name: '测试自定义', price: 3, points: 5, draws: 1, limit: 9 })
  await flushPromises()
  await w.get('[aria-label="删除自定义礼包「测试自定义」"]').trigger('click')
  w.unmount()
  const back = render()
  await flushPromises()
  pending.resolve(true)
  await flushPromises()
  expect(back.find('[aria-label="删除自定义礼包「测试自定义」"]').exists()).toBe(true)
})

it('a clear confirmation initiated on A cannot clear B after an identity change', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'a' }
  const pending = deferred()
  dialog.confirm.mockReturnValue(pending.promise)
  const w = render()
  await flushPromises()
  await add(w)
  await w.get('.cart-mbar [aria-label="清空购物车"]').trigger('click')
  auth.userInfo = { id: 'b' }
  await flushPromises()
  await add(w)
  pending.resolve(true)
  await flushPromises()
  expect(total(w)).toBe('¥16.00')
})

it('a detail response received after leaving cannot replace new edits on the returned page', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'a' }
  const pending = deferred(), plan = { ...localPlan(), id: 'cloud-one' }
  ledger.listPlans.mockResolvedValue([plan])
  ledger.getPlan.mockReturnValue(pending.promise)
  const w = render()
  await flushPromises()
  await add(w)
  await w.get('.cart-plan-list').trigger('click')
  await flushPromises()
  await new DOMWrapper(document.querySelector('.plan-load')).trigger('click')
  w.unmount()
  const back = render()
  await flushPromises()
  await add(back)
  pending.resolve(plan)
  await flushPromises()
  expect(total(back)).toBe('¥32.00')
})

it('an explicit clear stays cleared on returning and leaves the other game unchanged', async () => {
  const w = render()
  await flushPromises()
  await add(w)
  await switchGame(w, 'ru')
  await add(w)
  await w.get('.cart-mbar [aria-label="清空购物车"]').trigger('click')
  await flushPromises()
  w.unmount()
  const back = render()
  await flushPromises()
  expect(total(back)).toBe('¥0.00')
  await switchGame(back, 'daihao')
  expect(total(back)).toBe('¥16.00')
})
