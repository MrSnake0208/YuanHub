import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import QuickPage from '../src/pages/operator/quick.vue'
import { dialog } from '../src/utils/dialog.js'
import { getOperatorCatalog, listOperatorAccounts, getOperatorCurrent, importOperator } from '../src/api/operator.js'
import { useRouter } from 'vue-router'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'

const router = vi.hoisted(() => ({ push: vi.fn() }))
const route = vi.hoisted(() => ({ query: {} }))
const guards = vi.hoisted(() => ({ leave: null, update: null }))
vi.mock('vue-router', () => ({
  useRouter: () => router,
  useRoute: () => route,
  onBeforeRouteLeave: guard => { guards.leave = guard }, onBeforeRouteUpdate: guard => { guards.update = guard },
}))
vi.mock('../src/api/operator.js', () => ({
  getOperatorCatalog: vi.fn(), listOperatorAccounts: vi.fn(), getOperatorCurrent: vi.fn(), importOperator: vi.fn(),
}))
vi.mock('../src/api/request.js', () => ({ avatarUrl: value => value || '' }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, userInfo: { id: 'synthetic-user' } }) }
})
vi.mock('../src/store/activeAccount.js', async () => {
  const { reactive } = await import('vue')
  return { activeAccount: reactive({ id: 'acc', games: { acc: '如鸢', other: '如鸢' },
    gameFor(id) { return this.games[id] || '如鸢' }, set(id) { this.id = id }, syncAccounts: vi.fn() }) }
})
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

beforeEach(() => {
  vi.resetAllMocks()
  route.query = {}
  guards.leave = guards.update = null
  activeAccount.id = 'acc'
  activeAccount.games = { acc: '如鸢', other: '如鸢' }
  auth.isLoggedIn = true
  auth.userInfo = { id: 'synthetic-user' }
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'op', name: '测试密探', rarity: 3, games: ['如鸢'] }] })
  listOperatorAccounts.mockResolvedValue([{ id: 'acc', name: '测试账号', game: '如鸢' }, { id: 'other', name: '另一账号', game: '如鸢' }])
  getOperatorCurrent.mockResolvedValue([])
  importOperator.mockResolvedValue({ accepted: 1 })
  dialog.confirm.mockResolvedValue(true)
})

const wrappers = new Set()
afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers.clear()
  vi.useRealTimers()
})
const render = () => {
  const wrapper = mount(QuickPage, { global: {
  stubs: { IslandSidebar: true, SiteFooter: true, DataAccountContextBar: true, RouterLink: true },
  directives: { reveal: () => {} },
} })
  wrappers.add(wrapper)
  return wrapper
}

it('所有星级步骤默认1级1修为，未勾选不产生导入', async () => {
  const wrapper = render()
  await flushPromises()
  for (let index = 0; index < 6; index++) {
    const inputs = wrapper.findAll('.batch-bar input[type="number"]')
    expect(inputs.map(input => input.element.value)).toEqual(['1', '1'])
    await wrapper.get('.wiz-actions .primary').trigger('click')
    await flushPromises()
  }
  expect(importOperator).not.toHaveBeenCalled()
})

it('勾选后直接保存使用1级1修为和当前星级，保留已有命盘星石', async () => {
  getOperatorCurrent.mockResolvedValue([{ entries: {
    op: { level: 0, elite: 0, starLevel: 0, discs: [{ otName: '测试命盘' }], starStones: [] },
  } }])
  const wrapper = render()
  await flushPromises()
  expect(importOperator).not.toHaveBeenCalled()
  await wrapper.get('.op-check').setValue(true)
  await flushPromises()
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(importOperator).toHaveBeenCalledTimes(1)
  expect(importOperator.mock.calls[0][0].records[0].entries).toEqual([
    expect.objectContaining({ id: 'op', level: 1, elite: 1, starLevel: 1, discs: [{ otName: '测试命盘' }], starStones: [] }),
  ])
})

it.each([[100, 17], [90, 15]])('练度预设 %i+%i 只填当前页草稿，保存时仅提交勾选密探', async (level, elite) => {
  getOperatorCatalog.mockResolvedValue({ operators: ['op', 'op2', 'op3'].map(id => ({
    id, name: id, rarity: 3, games: ['如鸢'],
  })) })
  const wrapper = render()
  await flushPromises()
  const checks = wrapper.findAll('.op-check')
  await checks[0].setValue(true)
  await checks[1].setValue(true)
  const selectedIds = wrapper.findAll('.op-card.on .op-name').map(name => name.text())
  await wrapper.findAll('.batch-fields button').find(button => button.text() === `${level}级 / 修为${elite}`).trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.batch-bar input[type="number"]').map(input => input.element.value)).toEqual([String(level), String(elite)])
  expect(checks.map(input => input.element.checked)).toEqual([true, true, false])
  expect(importOperator).not.toHaveBeenCalled()
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  const entries = importOperator.mock.calls[0][0].records[0].entries
  expect(entries).toHaveLength(2)
  expect(entries.map(entry => entry.id)).toEqual(selectedIds)
  expect(entries).toEqual(selectedIds.map(id => expect.objectContaining({ id, level, elite, starLevel: 1 })))
  expect(wrapper.findAll('.batch-bar input[type="number"]').map(input => input.element.value)).toEqual(['1', '1'])
  wrapper.unmount()
})

it('锁定说明可见；清空选择可取消；完成后停在摘要直到用户返回', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.step-help').text()).toContain('保存本页并下一步')
  await wrapper.get('.op-check').setValue(true)
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.findAll('.mini').find(button => button.text() === '清空本页').trigger('click')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(true)
  await wrapper.findAll('.mini').find(button => button.text() === '清空本页').trigger('click')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(false)
  for (let index = 0; index < 6; index++) {
    await wrapper.get('.wiz-actions .primary').trigger('click')
    await flushPromises()
  }
  expect(wrapper.get('.quick-complete').text()).toContain('快捷录入已完成')
  expect(useRouter().push).not.toHaveBeenCalled()
  await wrapper.get('.quick-complete button').trigger('click')
  expect(useRouter().push).toHaveBeenCalledWith('/operator')
  wrapper.unmount()
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

it('养成读取未完成或失败时不允许写入，成功重试后才可录入', async () => {
  const read = deferred()
  getOperatorCurrent.mockReturnValueOnce(read.promise)
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('正在读取已有养成')
  expect(wrapper.find('.wiz-actions .primary').exists()).toBe(false)
  read.reject(new Error('synthetic read failure'))
  await flushPromises()
  expect(wrapper.text()).toContain('synthetic read failure')
  expect(wrapper.find('.op-check').exists()).toBe(false)
  expect(importOperator).not.toHaveBeenCalled()
  await wrapper.findAll('button').find(button => button.text() === '重试读取养成').trigger('click')
  await flushPromises()
  expect(wrapper.find('.op-check').exists()).toBe(true)
})

it('快速补录直接选择5星，默认保留已有练度、双命盘兼容字段与非空星石', async () => {
  route.query = { mode: 'supplement' }
  const discs = [{ ot_name: '初始能量+2' }]
  const stones = [{ name: '太阳', type: 'main1', level: 60 }]
  getOperatorCurrent.mockResolvedValue([{ entries: {
    op: { level: 90, elite: 15, star_level: 7, discs, star_stones: stones },
  } }])
  const wrapper = render()
  await flushPromises()
  await wrapper.findAll('.step')[4].trigger('click')
  await wrapper.get('.op-check').setValue(true)
  await flushPromises()
  expect(dialog.confirm).not.toHaveBeenCalled()
  expect(wrapper.get('.quick-preview').text()).toContain('Lv90 / 修为15')
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  const record = importOperator.mock.calls[0][0].records[0]
  expect(record).toEqual(expect.objectContaining({ account_id: 'acc', snapshot_scope: 'listed' }))
  expect(record.entries).toEqual([expect.objectContaining({ level: 90, elite: 15, starLevel: 25, discs, starStones: stones })])
  expect(dialog.confirm.mock.calls[0][0].message).toContain('测试账号')
  expect(dialog.confirm.mock.calls[0][0].message).toContain('命盘二')
  expect(wrapper.get('.step.on').text()).toContain('5星')
  expect(wrapper.get('.page-save').text()).toContain('本页已保存')
})

it('补录跨星阶保留草稿，取消保存预览不写入', async () => {
  route.query = { mode: 'supplement' }
  const wrapper = render()
  await flushPromises()
  await wrapper.findAll('.step')[4].trigger('click')
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('input[name="level"]').setValue('80')
  await wrapper.findAll('.step')[1].trigger('click')
  await wrapper.findAll('.step')[4].trigger('click')
  expect(wrapper.get('.op-check').element.checked).toBe(true)
  expect(wrapper.get('input[name="level"]').element.value).toBe('80')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(importOperator).not.toHaveBeenCalled()
  expect(wrapper.get('.op-check').element.checked).toBe(true)
})

it('主动选择覆盖练度后才提交批量等级修为', async () => {
  route.query = { mode: 'supplement' }
  getOperatorCurrent.mockResolvedValue([{ entries: { op: { level: 90, elite: 15, star_level: 7 } } }])
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.supplement-option input').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(importOperator.mock.calls[0][0].records[0].entries[0]).toEqual(expect.objectContaining({ level: 1, elite: 1 }))
  expect(dialog.confirm.mock.calls[0][0].message).toContain('Lv90 / 修为15')
  expect(dialog.confirm.mock.calls[0][0].message).toContain('→ Lv1 / 修为1')
})

it('失败重试复用完整请求和record_id，草稿保持勾选', async () => {
  importOperator.mockRejectedValueOnce(new Error('synthetic response lost'))
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  const original = importOperator.mock.calls[0][0]
  expect(wrapper.get('.op-check').element.checked).toBe(true)
  await wrapper.get('.page-save button').trigger('click')
  await flushPromises()
  expect(importOperator.mock.calls[1][0]).toEqual(original)
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
})

it('失败后修改草稿必须重新确认并生成新请求', async () => {
  importOperator.mockRejectedValueOnce(new Error('synthetic failure'))
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  const original = importOperator.mock.calls[0][0]
  await wrapper.get('input[name="level"]').setValue('80')
  await wrapper.get('.page-save button').trigger('click')
  await flushPromises()
  const changed = importOperator.mock.calls[1][0]
  expect(changed.records[0].record_id).not.toBe(original.records[0].record_id)
  expect(changed.records[0].entries[0].level).toBe(80)
  expect(dialog.confirm).toHaveBeenCalledTimes(2)
})

it('重复点击在确认和写入期间只保存一次、只推进一阶', async () => {
  const confirmation = deferred(), write = deferred()
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  importOperator.mockReturnValueOnce(write.promise)
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  const button = wrapper.get('.wiz-actions .primary')
  await button.trigger('click')
  await button.trigger('click')
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
  confirmation.resolve(true)
  await flushPromises()
  await button.trigger('click')
  expect(importOperator).toHaveBeenCalledTimes(1)
  write.resolve({ accepted: 1 })
  await flushPromises()
  expect(wrapper.get('.step.on').text()).toContain('2星')
})

it.each([{ accepted: 0, superseded: 1 }, { accepted: 0 }])('未应用结果不冒充保存成功 %#', async result => {
  importOperator.mockResolvedValueOnce(result)
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(wrapper.get('.page-save').text()).toContain('未应用')
  expect(wrapper.get('.step.on').text()).toContain('1星')
  expect(wrapper.get('.op-check').element.checked).toBe(true)
})

it.each(['first', 'supplement'])('%s幂等重复返回可确认成功，warning保留展示', async mode => {
  route.query = { mode }
  importOperator.mockResolvedValueOnce({ accepted: 0, duplicates: 1, warnings: ['synthetic warning'] })
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(wrapper.get('.page-save').text()).toContain('synthetic warning')
  expect(wrapper.get('.page-save').classes()).not.toContain('err')
})

it('A→B→A隔离草稿并丢弃迟到读取', async () => {
  const readA = deferred()
  getOperatorCurrent.mockReturnValueOnce(readA.promise)
  const wrapper = render()
  await flushPromises()
  activeAccount.set('other')
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  readA.resolve([{ entries: { op: { level: 99, elite: 17, star_level: 25 } } }])
  await flushPromises()
  expect(wrapper.text()).not.toContain('已有数据 1 位')
  activeAccount.set('acc')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(false)
  activeAccount.set('other')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(true)
})

it('A的保存确认迟到不能写入B，切回A保留未保存草稿', async () => {
  const confirmation = deferred()
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  activeAccount.set('other')
  await flushPromises()
  confirmation.resolve(true)
  await flushPromises()
  expect(importOperator).not.toHaveBeenCalled()
  expect(wrapper.get('.op-check').element.checked).toBe(false)
  activeAccount.set('acc')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(true)
})

it('A的保存回调不能推进B或更新B的保存统计', async () => {
  const write = deferred()
  importOperator.mockReturnValueOnce(write.promise)
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  activeAccount.set('other')
  await flushPromises()
  write.resolve({ accepted: 1 })
  await flushPromises()
  expect(wrapper.get('.step.on').text()).toContain('1星')
  expect(wrapper.find('.page-save').exists()).toBe(false)
  expect(wrapper.findAll('.hero-stats .v')[2].text()).toBe('0位')
  expect(importOperator.mock.calls[0][0].records[0].account_id).toBe('acc')
})

it.each(['logout', 'clear', 'user', 'game', 'unmount'])('上下文%s使待确认保存失效', async action => {
  const confirmation = deferred()
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  if (action === 'logout') auth.isLoggedIn = false
  if (action === 'clear') activeAccount.set('')
  if (action === 'user') auth.userInfo = { id: 'another-synthetic-user' }
  if (action === 'game') activeAccount.games.acc = '代号鸢'
  if (action === 'unmount') wrapper.unmount()
  confirmation.resolve(true)
  await flushPromises()
  expect(importOperator).not.toHaveBeenCalled()
})

it('读取账号失败显示重试，不误报尚未创建账号', async () => {
  listOperatorAccounts.mockRejectedValueOnce(new Error('synthetic account error'))
  const wrapper = render()
  await flushPromises()
  expect(wrapper.text()).toContain('synthetic account error')
  expect(wrapper.text()).not.toContain('尚未创建游戏账号')
  expect(wrapper.find('.wiz-actions').exists()).toBe(false)
})

it('保存前刷新已有装备，刷新失败保留草稿并阻止导入', async () => {
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  getOperatorCurrent.mockRejectedValueOnce(new Error('synthetic refresh failure'))
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(importOperator).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('synthetic refresh failure')
  await wrapper.findAll('button').find(button => button.text() === '重试读取养成').trigger('click')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(true)
  const stones = [{ name: '太阳', type: 'main2', level: 80 }]
  getOperatorCurrent.mockResolvedValueOnce([{ entries: { op: { level: 80, elite: 12, star_level: 7, star_stones: stones } } }])
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(importOperator.mock.calls[0][0].records[0].entries[0].starStones).toEqual(stones)
})

it('SP补录使用独立星阶编码并提示本体联动，觉醒不提供SP', async () => {
  route.query = { mode: 'supplement' }
  getOperatorCatalog.mockResolvedValue({ operators: [
    { id: 'base', name: '本体', rarity: 3, games: ['如鸢'] },
    { id: 'opsp', name: 'SP角色', rarity: 3, games: ['如鸢'], sp_of: 'base' },
  ] })
  const wrapper = render()
  await flushPromises()
  await wrapper.findAll('.step')[4].trigger('click')
  await wrapper.findAll('.op-card').find(card => card.text().includes('SP角色')).get('.op-check').setValue(true)
  await flushPromises()
  expect(wrapper.get('.quick-preview').text()).toContain('本体')
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(importOperator.mock.calls[0][0].records[0].entries).toEqual([expect.objectContaining({ id: 'opsp', starLevel: 5 })])
  expect(dialog.confirm.mock.calls[0][0].message).toContain('本体')
  await wrapper.findAll('.step')[5].trigger('click')
  expect(wrapper.findAll('.op-card').some(card => card.text().includes('SP角色'))).toBe(false)
})

it('409失败保持草稿与当前星阶，不标记已存', async () => {
  importOperator.mockRejectedValueOnce(Object.assign(new Error('synthetic record conflict'), { status: 409 }))
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(true)
  expect(wrapper.get('.step.on').text()).toContain('1星')
  expect(wrapper.get('.step.on').text()).not.toContain('已存')
  expect(wrapper.get('.page-save').classes()).toContain('err')
})

it('其他账号仍有草稿时离开也需确认，保存后不残留旧脏标记', async () => {
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  activeAccount.set('other')
  await flushPromises()
  dialog.confirm.mockResolvedValueOnce(false)
  expect(await guards.leave()).toBe(false)
  expect(dialog.confirm.mock.calls[0][0].message).toContain('尚未保存')
  activeAccount.set('acc')
  await flushPromises()
  await wrapper.get('.wiz-actions .primary').trigger('click')
  await flushPromises()
  dialog.confirm.mockClear()
  expect(await guards.leave()).toBe(true)
  expect(dialog.confirm).not.toHaveBeenCalled()
})

it('跨星阶选择确认迟到不修改新账号的勾选', async () => {
  route.query = { mode: 'supplement' }
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.op-check').setValue(true)
  await wrapper.findAll('.step')[4].trigger('click')
  const confirmation = deferred()
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  await wrapper.get('.op-check').setValue(true)
  activeAccount.set('other')
  await flushPromises()
  confirmation.resolve(true)
  await flushPromises()
  expect(wrapper.get('.op-check').element.checked).toBe(false)
  activeAccount.set('acc')
  await flushPromises()
  expect(wrapper.get('.step.on').text()).toContain('5星')
  expect(wrapper.get('.op-check').element.checked).toBe(false)
  await wrapper.findAll('.step')[0].trigger('click')
  expect(wrapper.get('.op-check').element.checked).toBe(true)
})
