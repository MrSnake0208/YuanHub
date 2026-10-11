import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import LedgerAdmin from '../src/pages/ledger/admin.vue'
import { auth } from '../src/store/auth.js'
import * as api from '../src/api/ledgerCatalog.js'
import { dialog } from '../src/utils/dialog.js'
import { ledgerFixture } from '../test-support/ledgerCatalog.js'
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ userInfo: { id: 'editor' }, accessToken: 'synthetic', adminAccess: { permissions: ['ledger_catalog:write'] } }) }
})
vi.mock('../src/api/ledgerCatalog.js', () => ({ getAdminLedgerCatalog: vi.fn(), saveLedgerPackage: vi.fn(), saveLedgerCampaign: vi.fn(), saveLedgerSettings: vi.fn(), previewLedgerCampaign: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/admin/ledger', component: LedgerAdmin }, { path: '/manage', component: { template: '<p>管理工作台</p>' } }, { path: '/cart', component: { template: '<p>账房</p>' } }] })
  await router.push('/admin/ledger'); await router.isReady()
  const w = mount({ template: '<router-view />' }, { attachTo: document.body, global: { plugins: [router], stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises(); return w
}
const button = (w, text) => w.findAll('button').find(b => b.text() === text)
beforeEach(() => {
  vi.resetAllMocks(); auth.userInfo = { id: 'editor' }; auth.accessToken = 'synthetic'; auth.adminAccess = { permissions: ['ledger_catalog:write'] }
  api.getAdminLedgerCatalog.mockResolvedValue(ledgerFixture()); dialog.confirm.mockResolvedValue(true)
})

it('permission is required and no management data is requested without it', async () => {
  auth.adminAccess = { permissions: [] }
  const w = await render()
  expect(w.text()).toContain('需要广陵账房公共数据维护权限')
  expect(api.getAdminLedgerCatalog).not.toHaveBeenCalled()
})

it('creates each game with its own currency and decimal draws then edits or disables with expected version', async () => {
  const w = await render()
  for (const game of ['daihao', 'ru']) {
    await button(w, '新增礼包').trigger('click')
    await w.get('#ledger-game').setValue(game)
    await w.get('#ledger-name').setValue(`${game}新礼包`)
    await w.get('#ledger-price').setValue('3.5')
    await w.get('#ledger-draws').setValue('0.6')
    await w.get('#ledger-points').setValue('60')
    await w.get('#ledger-category').setValue('测试')
    await w.get('form').trigger('submit'); await flushPromises()
    expect(api.saveLedgerPackage).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ game, draws: 0.6, points: 60, [game === 'daihao' ? 'price_usd' : 'price_cny']: 3.5 }))
    expect(w.text()).toContain('已保存公共数据')
  }
  await button(w, '编辑礼包').trigger('click')
  await w.get('#ledger-price').setValue('4')
  await w.get('.ledger-check input').setValue(false)
  await w.get('form').trigger('submit'); await flushPromises()
  expect(api.saveLedgerPackage).toHaveBeenLastCalledWith('daihao:1', expect.objectContaining({ price_usd: 4, enabled: false, expected_version: 0 }))
})

it('invalid fields focus error summary and edits survive version conflict', async () => {
  const w = await render()
  await button(w, '新增礼包').trigger('click')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(w.get('#ledger-name').attributes('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(w.get('[role="alert"]').element)
  expect(api.saveLedgerPackage).not.toHaveBeenCalled()
  await button(w, '返回列表').trigger('click'); await flushPromises()
  await button(w, '编辑礼包').trigger('click')
  await w.get('#ledger-name').setValue('保留编辑')
  api.saveLedgerPackage.mockRejectedValueOnce(Object.assign(new Error('数据已被其他管理员修改，请刷新'), { status: 409 }))
  await w.get('form').trigger('submit'); await flushPromises()
  expect(w.get('#ledger-name').element.value).toBe('保留编辑')
  expect(button(w, '确认预览并保存').attributes('disabled')).toBeDefined()
  expect(w.get('[role="alert"]').text()).toContain('其他管理员')
})

it('publishes arbitrary tiers after preview and confirms discard before switching workspace', async () => {
  const w = await render()
  await button(w, '累充活动').trigger('click')
  await button(w, '新增活动').trigger('click')
  await w.get('#ledger-name').setValue('新一期累充')
  await w.get('#ledger-starts_at').setValue('2026-10-11T00:00:00+08:00')
  await w.get('#ledger-ends_at').setValue('2026-10-20T23:59:59+08:00')
  await w.get('#ledger-status').setValue('published')
  await w.get('form').trigger('submit'); await flushPromises()
  await w.get('[href="#ledger-tiers"]').trigger('click')
  expect(document.activeElement.id).toBe('ledger-tiers')
  await w.get('input[aria-label="第1档奖励1名称"]').setValue('符传')
  await button(w, '添加档位').trigger('click')
  await w.get('input[aria-label="第2档积分门槛"]').setValue('200')
  await w.get('input[aria-label="第2档奖励1名称"]').setValue('五铢钱')
  expect(w.get('[aria-label="发布数据预览"]').text()).toContain('200 分')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(api.previewLedgerCampaign).toHaveBeenCalledOnce()
  expect(api.saveLedgerCampaign).toHaveBeenCalledWith(undefined, expect.objectContaining({ status: 'published', tiers: expect.arrayContaining([expect.objectContaining({ points: 200 })]) }))
  await button(w, '新增活动').trigger('click')
  await w.get('#ledger-name').setValue('未保存')
  dialog.confirm.mockResolvedValueOnce(false)
  await button(w, '默认设置').trigger('click'); await flushPromises()
  expect(w.find('#ledger-name').exists()).toBe(true)
  expect(dialog.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ title: '放弃未保存修改？' }))
})

it('updates default setting with CAS and drops late previous account responses', async () => {
  const w = await render()
  await button(w, '默认设置').trigger('click'); await button(w, '修改默认汇率').trigger('click')
  await w.get('#ledger-exchange_rate').setValue('7.5')
  await w.get('form').trigger('submit'); await flushPromises()
  expect(api.saveLedgerSettings).toHaveBeenCalledWith({ exchange_rate: 7.5, expected_version: 0 })
  let resolve
  api.getAdminLedgerCatalog.mockReturnValueOnce(new Promise(ok => { resolve = ok }))
  await button(w, '刷新').trigger('click')
  auth.userInfo = { id: 'ordinary' }; auth.adminAccess = { permissions: [] }
  await flushPromises(); resolve(ledgerFixture()); await flushPromises()
  expect(w.text()).not.toContain('修改默认汇率')
  expect(w.text()).toContain('需要广陵账房')
})
