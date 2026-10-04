import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CartPage from '../src/pages/tools/cart.vue'
import PlanListDialog from '../src/components/cart/PlanListDialog.vue'
import PlanSaveDialog from '../src/components/cart/PlanSaveDialog.vue'
import { packagesDaihao, packagesRu } from '../src/data/packages.js'
import { auth } from '../src/store/auth.js'
import * as ledger from '../src/api/ledger.js'
import html2canvas from 'html2canvas'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: false, userInfo: null }) }
})
vi.mock('../src/api/ledger.js', () => ({ createPlan: vi.fn(), updatePlan: vi.fn(), getPlan: vi.fn(), listPlans: vi.fn(), deletePlan: vi.fn() }))
vi.mock('html2canvas', () => ({ default: vi.fn() }))

const render = () => mount(CartPage, { attachTo: document.body, global: {
  stubs: { IslandSidebar: true, SiteFooter: true }, directives: { reveal: () => {} },
} })
function plan(version = 'daihao', { missing = false, localId = `${version}-local` } = {}) {
  const pkg = version === 'daihao' ? packagesDaihao[0] : packagesRu[0]
  return {
    id: `${version}-cloud`, _localId: localId, name: `${version}旧方案`, version,
    exchange_rate: version === 'daihao' ? 7 : null, initial_points: 4,
    cart_items: [{ content_id: missing ? 99001 : pkg.id, quantity: 3, package_snapshot: {
      name: `${version}存档礼包`, category: '存档', points: 5, draws: 2, limit: 10,
      ...(version === 'daihao' ? { price_usd: 2 } : { price_cny: 3 }),
    } }], custom_packages: [],
  }
}
async function loadLocal(wrapper, fixture) {
  await wrapper.get('.cart-plan-list').trigger('click')
  wrapper.getComponent(PlanListDialog).vm.$emit('load-guest', fixture)
  await flushPromises()
}
async function save(wrapper, name, overwrite = false) {
  await wrapper.get('.cart-plan-save').trigger('click')
  wrapper.getComponent(PlanSaveDialog).vm.$emit('save', { name, overwrite })
  await flushPromises()
}
const total = wrapper => wrapper.get('.receipt .grand-total .v').text()
const switchGame = (wrapper, index) => wrapper.findAll('.cart-switch button')[index].trigger('click')
function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.isLoggedIn = false
  auth.userInfo = null
  ledger.listPlans.mockResolvedValue([])
})

it('existing catalog IDs use saved price, points and draws and preserve the snapshot on resave', async () => {
  const wrapper = render()
  await loadLocal(wrapper, plan())
  expect(total(wrapper)).toBe('¥42.00')
  expect(wrapper.get('.receipt').text()).toContain('6.0 抽')
  expect(wrapper.get('.receipt').text()).toContain('19 分')
  expect(wrapper.get('.receipt').text()).toContain('daihao存档礼包')
  expect(wrapper.findAll('.pkg-card').some(card => card.text().includes('方案快照'))).toBe(true)
  await save(wrapper, '快照再次保存')
  const saved = JSON.parse(localStorage.getItem('yh_ledger_plans'))[0]
  expect(saved.cart_items[0].package_snapshot).toMatchObject({ price_usd: 2, points: 5, draws: 2 })
  expect(saved.cart_items[0].quantity).toBe(3)
})

it('loading the other game retains removed packages and each game owns its overwrite identity', async () => {
  const daihao = plan('daihao', { missing: true }), ru = plan('ru', { missing: true })
  localStorage.setItem('yh_ledger_plans', JSON.stringify([daihao, ru]))
  const wrapper = render()
  await loadLocal(wrapper, daihao)
  await loadLocal(wrapper, ru)
  expect(total(wrapper)).toBe('¥9.00')
  await switchGame(wrapper, 0)
  expect(total(wrapper)).toBe('¥42.00')
  expect(wrapper.get('.receipt').text()).toContain('daihao存档礼包')
  await save(wrapper, '代号鸢覆盖', true)
  const records = JSON.parse(localStorage.getItem('yh_ledger_plans'))
  expect(records).toHaveLength(2)
  expect(records.find(p => p._localId === daihao._localId)).toMatchObject({ name: '代号鸢覆盖', version: 'daihao' })
  expect(records.find(p => p._localId === ru._localId)).toMatchObject({ name: ru.name, version: 'ru' })
})

it('switching to a game without an active plan creates a new plan instead of overwriting the other game', async () => {
  const daihao = plan()
  localStorage.setItem('yh_ledger_plans', JSON.stringify([daihao]))
  const wrapper = render()
  await loadLocal(wrapper, daihao)
  await switchGame(wrapper, 1)
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  await wrapper.get('.cart-plan-save').trigger('click')
  expect(wrapper.getComponent(PlanSaveDialog).props('existing')).toBe(false)
  wrapper.getComponent(PlanSaveDialog).vm.$emit('save', { name: '如鸢新方案', overwrite: true })
  await flushPromises()
  const records = JSON.parse(localStorage.getItem('yh_ledger_plans'))
  expect(records).toHaveLength(2)
  expect(records.find(p => p._localId === daihao._localId).version).toBe('daihao')
})

it('incomplete and negative FX retain the effective amount and block persistence/export until corrected', async () => {
  const wrapper = render()
  await loadLocal(wrapper, plan())
  const input = wrapper.get('[aria-label="美元兑人民币汇率"]')
  await input.setValue('')
  expect(total(wrapper)).toBe('¥42.00')
  expect(input.attributes('aria-invalid')).toBe('true')
  await wrapper.get('.cart-plan-save').trigger('click')
  expect(wrapper.findComponent(PlanSaveDialog).exists()).toBe(false)
  await wrapper.get('.cart-mbar .mbtn.accent').trigger('click')
  expect(html2canvas).not.toHaveBeenCalled()
  await input.setValue('-1')
  expect(total(wrapper)).toBe('¥42.00')
  await input.setValue('8')
  expect(total(wrapper)).toBe('¥48.00')
  expect(wrapper.find('#cart-rate-error').exists()).toBe(false)
  await input.setValue('0')
  expect(total(wrapper)).toBe('¥0.00')
})

it('search and optional ordering do not affect full receipt, quantity or persisted content', async () => {
  const wrapper = render()
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  const before = total(wrapper)
  expect(wrapper.findAll('.pkg-card').some(card => card.text().includes('每抽成本不适用'))).toBe(true)
  expect(wrapper.text()).not.toContain('Infinity')
  await wrapper.get('input[type="search"]').setValue('不存在的礼包')
  await wrapper.get('.cart-sort select').setValue('drawCost')
  await wrapper.get('.cart-selected input').setValue(true)
  expect(wrapper.findAll('.pkg-card')).toHaveLength(0)
  expect(wrapper.get('.cart-filter-empty').text()).toContain('没有已选礼包')
  expect(total(wrapper)).toBe(before)
  await save(wrapper, '筛选不丢数量')
  expect(JSON.parse(localStorage.getItem('yh_ledger_plans'))[0].cart_items).toHaveLength(1)
  await wrapper.get('.cart-filter-empty button').trigger('click')
  expect(wrapper.findAll('.pkg-card').length).toBeGreaterThan(1)
})

it('export captures explicit click-time receipt values even when the game changes during generation', async () => {
  const pending = deferred()
  const wrapper = render()
  await loadLocal(wrapper, plan())
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  html2canvas.mockImplementationOnce(element => {
    expect(element.textContent).toContain('daihao存档礼包')
    expect(element.textContent).toContain('¥42.00')
    expect(element.querySelector('input')).toBeNull()
    return pending.promise
  })
  await wrapper.get('.cart-mbar .mbtn.accent').trigger('click')
  await flushPromises()
  await switchGame(wrapper, 1)
  await wrapper.get('.cart-mbar .mbtn.accent').trigger('click')
  expect(html2canvas).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.cart-export-view').textContent).toContain('¥42.00')
  pending.resolve({ toDataURL: () => 'data:image/png;base64,AA' })
  await flushPromises()
  expect(download).toHaveBeenCalledTimes(1)
  expect(download.mock.instances[0].download).toBe('shopping-receipt-daihao.png')
  expect(document.querySelector('.cart-export-view')).toBeNull()
})

it('cloud overwrite targets only the active game', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'user-a' }
  const wrapper = render()
  const fixture = plan()
  ledger.getPlan.mockResolvedValue(fixture)
  await wrapper.get('.cart-plan-list').trigger('click')
  await flushPromises()
  wrapper.getComponent(PlanListDialog).vm.$emit('load', fixture)
  await flushPromises()
  await switchGame(wrapper, 1)
  ledger.createPlan.mockResolvedValue({ ...plan('ru'), name: '如鸢云方案' })
  await save(wrapper, '如鸢云方案', true)
  expect(ledger.createPlan).toHaveBeenCalledWith(expect.objectContaining({ version: 'ru' }))
  expect(ledger.updatePlan).not.toHaveBeenCalled()
  await switchGame(wrapper, 0)
  ledger.updatePlan.mockResolvedValue(fixture)
  await save(wrapper, '代号鸢覆盖', true)
  expect(ledger.updatePlan).toHaveBeenCalledWith(fixture.id, expect.objectContaining({ version: 'daihao', cartItems: [expect.objectContaining({ package_snapshot: expect.objectContaining({ price_usd: 2 }) })] }))
})

it('save restores canonical custom IDs from the response before the next overwrite', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'user-a' }
  const fixture = plan()
  fixture.cart_items = [{ content_id: 500001, quantity: 2, package_snapshot: {
    name: '云端自定义', category: '自定义', points: 5, draws: 1, limit: 10, price_usd: 2,
  } }]
  fixture.custom_packages = [{ id: 500001, name: '云端自定义', category: '自定义', points: 5, draws: 1, limit: 10, price_usd: 2 }]
  const wrapper = render()
  await loadLocal(wrapper, fixture)
  const normalized = JSON.parse(JSON.stringify(fixture))
  normalized.id = 'normalized-plan'
  normalized.custom_packages[0].id = 700001
  normalized.cart_items[0].content_id = 700001
  ledger.createPlan.mockResolvedValueOnce(normalized)
  await save(wrapper, '自定义规范化')
  expect(total(wrapper)).toBe('¥28.00')
  ledger.updatePlan.mockResolvedValueOnce(normalized)
  await save(wrapper, '自定义再次覆盖', true)
  expect(ledger.updatePlan).toHaveBeenCalledWith('normalized-plan', expect.objectContaining({
    cartItems: [expect.objectContaining({ content_id: 700001, quantity: 2 })],
    customPackages: [expect.objectContaining({ id: 700001 })],
  }))
})

it('edits made in the saving game are not replaced by an earlier save response', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'user-a' }
  const pending = deferred()
  ledger.createPlan.mockReturnValueOnce(pending.promise)
  const wrapper = render()
  await loadLocal(wrapper, plan())
  await save(wrapper, '保存期间仍可编辑')
  await wrapper.get('.receipt input').setValue('20')
  pending.resolve(plan())
  await flushPromises()
  expect(wrapper.get('.receipt input').element.value).toBe('20')
  expect(wrapper.get('.receipt').text()).toContain('35 分')
  expect(wrapper.get('[role="status"]').text()).toContain('当前编辑内容已保留')
})

it('duplicate cloud save is single flight and late responses retain edits or a switched game', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'user-a' }
  const pending = deferred()
  ledger.createPlan.mockReturnValue(pending.promise)
  const wrapper = render()
  await loadLocal(wrapper, plan())
  await save(wrapper, '进行中方案')
  const dialog = wrapper.getComponent(PlanSaveDialog)
  dialog.vm.$emit('save', { name: '重复方案', overwrite: false })
  await switchGame(wrapper, 1)
  await wrapper.get('.pkg-card .stepper button:last-child').trigger('click')
  const ruTotal = total(wrapper)
  pending.resolve(plan())
  await flushPromises()
  expect(ledger.createPlan).toHaveBeenCalledTimes(1)
  expect(wrapper.findAll('.cart-switch button')[1].classes()).toContain('on')
  expect(total(wrapper)).toBe(ruTotal)
  expect(wrapper.get('[role="status"]').text()).toContain('当前编辑内容已保留')
})

it('failure allows retry and a cloud response from a previous login cannot replace current state', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'user-a' }
  ledger.createPlan.mockRejectedValueOnce(new Error('保存失败样例'))
  const wrapper = render()
  await loadLocal(wrapper, plan())
  await save(wrapper, '失败后重试')
  expect(wrapper.get('[role="alert"]').text()).toContain('保存失败样例')
  const pending = deferred()
  ledger.createPlan.mockReturnValueOnce(pending.promise)
  wrapper.getComponent(PlanSaveDialog).vm.$emit('save', { name: '失败后重试', overwrite: false })
  await flushPromises()
  auth.userInfo = { id: 'user-b' }
  await flushPromises()
  auth.userInfo = { id: 'user-a' }
  await flushPromises()
  pending.resolve({ ...plan(), name: '旧账号响应' })
  await flushPromises()
  expect(total(wrapper)).toBe('¥42.00')
  expect(wrapper.findComponent(PlanSaveDialog).exists()).toBe(false)
  expect(wrapper.text()).not.toContain('旧账号响应')
  expect(ledger.createPlan).toHaveBeenCalledTimes(2)
})

it('latest detail request wins; a detail from the previous game does not switch the current game back', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'user-a' }
  const first = deferred(), second = deferred()
  ledger.getPlan.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const wrapper = render()
  await wrapper.get('.cart-plan-list').trigger('click')
  await flushPromises()
  const list = wrapper.getComponent(PlanListDialog)
  list.vm.$emit('load', { id: 'first' })
  list.vm.$emit('load', { id: 'second' })
  second.resolve(plan())
  await flushPromises()
  first.resolve(plan('ru'))
  await flushPromises()
  expect(total(wrapper)).toBe('¥42.00')
  await wrapper.get('.cart-plan-list').trigger('click')
  const late = deferred()
  ledger.getPlan.mockReturnValueOnce(late.promise)
  wrapper.getComponent(PlanListDialog).vm.$emit('load', { id: 'late' })
  await switchGame(wrapper, 1)
  late.resolve(plan())
  await flushPromises()
  expect(wrapper.findAll('.cart-switch button')[1].classes()).toContain('on')
})
