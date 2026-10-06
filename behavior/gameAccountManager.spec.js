import { beforeEach, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import GameAccountManager from '../src/components/GameAccountManager.vue'
import AppDialog from '../src/components/AppDialog.vue'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { createAccount, updateAccount, deleteAccount } from '../src/api/accounts.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/api/accounts.js', () => ({ createAccount: vi.fn(), updateAccount: vi.fn(), deleteAccount: vi.fn() }))
vi.mock('../src/store/auth.js', async () => { const { reactive } = await import('vue'); return { auth: reactive({ userInfo: { id: 'owner-a' }, accessToken: 'synthetic-token' }) } })
const rows = [{ id: 'a', name: '大号', game: '代号鸢' }, { id: 'b', name: '小号', game: '如鸢' }]
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function render(accounts = rows) {
  const list = ref(accounts.map(item => ({ ...item })))
  const wrapper = mount(defineComponent({ setup() {
    const accountId = computed(() => activeAccount.id)
    return () => h(GameAccountManager, { accounts: list.value, accountId: accountId.value,
      'onUpdate:accounts': value => { list.value = value }, 'onUpdate:accountId': value => activeAccount.set(value) })
  } }), { attachTo: document.body })
  return { wrapper, list, manager: wrapper.findComponent(GameAccountManager) }
}
const panel = () => document.querySelector('.account-panel')
async function more(wrapper, index = 0) { await wrapper.findAll('.more-trigger')[index].trigger('click'); await flushPromises() }
async function action(index) { panel().querySelectorAll('.more-actions button')[index].click(); await flushPromises() }
async function inputName(value) { const input = panel().querySelector('.name-field input'); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick() }
async function submit() { panel().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises() }
async function escape() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises() }
beforeEach(() => {
  vi.resetAllMocks()
  auth.userInfo = { id: 'owner-a' }; auth.accessToken = 'synthetic-token'
  activeAccount.set('a'); activeAccount.games = {}; activeAccount.syncAccounts(rows)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue() } })
})

it('浏览态只有身份与更多，不提供切换、编辑表单、删除或技术编号', async () => {
  const { wrapper, manager } = render()
  expect(wrapper.findAll('.account-row')).toHaveLength(2)
  expect(wrapper.get('.account-row').text()).toContain('代号鸢 · 当前账号')
  expect(wrapper.find('input, select, .danger, code').exists()).toBe(false)
  expect(wrapper.text()).not.toMatch(/设为当前|查看账号编号|删除/)
  await more(wrapper, 1)
  expect(activeAccount.id).toBe('a'); expect(manager.emitted('update:accountId')).toBeUndefined()
  expect(panel().textContent).toContain('编辑账号')
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await nextTick()
  expect(document.activeElement.textContent).toContain('查看账号编号')
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); await nextTick()
  expect(document.activeElement.textContent).toContain('删除账号')
  await escape()
  expect(document.activeElement).toBe(wrapper.findAll('.more-trigger')[1].element)
})

it('创建失败保留输入，重复提交受保护；成功更新列表与唯一当前账号', async () => {
  const { wrapper, list } = render()
  createAccount.mockRejectedValueOnce(new Error('synthetic create failure'))
  await wrapper.get('[data-tour="account-create"]').trigger('click'); await flushPromises()
  await inputName('创建测试账号')
  const radio = panel().querySelector('input[value="如鸢"]'); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); await nextTick()
  await submit()
  expect(panel().querySelector('.name-field input').value).toBe('创建测试账号')
  expect(radio.checked).toBe(true); expect(panel().querySelector('[role="alert"]').textContent).toContain('synthetic create failure')
  const pending = deferred(); createAccount.mockReturnValueOnce(pending.promise)
  await submit(); await submit()
  expect(createAccount).toHaveBeenCalledTimes(2)
  expect(createAccount).toHaveBeenLastCalledWith('创建测试账号', '如鸢')
  expect(panel().querySelector('button[type="submit"]').disabled).toBe(true)
  pending.resolve({ id: 'c', name: '创建测试账号', game: '如鸢' }); await flushPromises()
  expect(panel()).toBeNull(); expect(list.value.map(item => item.id)).toEqual(['a', 'b', 'c'])
  expect(activeAccount.id).toBe('c'); expect(activeAccount.gameFor('c')).toBe('如鸢')
  expect(wrapper.get('[role="status"]').text()).toContain('已创建')
  expect(document.activeElement).toBe(wrapper.get('[data-tour="account-create"]').element)
})

it('名称和游戏一次 PATCH 保存，锁定失败不产生部分改名，也不提前改游戏状态', async () => {
  const { wrapper, list } = render()
  await more(wrapper); await action(0); await inputName('新名字')
  const radio = panel().querySelector('input[value="如鸢"]'); radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); await nextTick()
  updateAccount.mockRejectedValueOnce(new Error('已有招募档案，不能修改所属游戏；请使用另一个游戏账号'))
  await submit()
  expect(updateAccount).toHaveBeenCalledWith('a', { name: '新名字', game: '如鸢' })
  expect(list.value[0]).toEqual(rows[0]); expect(activeAccount.gameFor('a')).toBe('代号鸢')
  expect(panel().querySelector('[role="alert"]').textContent).toContain('已有招募档案')
  expect(panel().querySelector('.name-field input').value).toBe('新名字')
  updateAccount.mockResolvedValueOnce({ id: 'a', name: '新名字', game: '如鸢' }); await submit()
  expect(list.value[0].name).toBe('新名字'); expect(activeAccount.id).toBe('a'); expect(activeAccount.gameFor('a')).toBe('如鸢')
  expect(panel()).toBeNull(); expect(wrapper.get('[role="status"]').text()).toContain('已保存')
})

it('编号只在次级面板显示，可复制并反馈复制失败，Escape 恢复 More 焦点', async () => {
  const { wrapper } = render(); await more(wrapper); await action(1)
  expect(panel().querySelector('code').textContent).toBe('a')
  expect(panel().textContent).toContain('内部账号编号')
  panel().querySelector('.secondary-action').click(); await flushPromises()
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a')
  expect(panel().querySelector('[role="status"]').textContent).toBe('已复制')
  navigator.clipboard.writeText.mockRejectedValueOnce(new Error('denied'))
  panel().querySelector('.secondary-action').click(); await flushPromises()
  expect(panel().querySelector('[role="alert"]').textContent).toContain('手动选择编号')
  await escape(); expect(document.activeElement).toBe(wrapper.get('.more-trigger').element)
})

it.each([['b', 'a'], ['a', 'b']])('删除 %s 保留或回退到 %s，复用危险确认', async (deleted, current) => {
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
  deleteAccount.mockResolvedValue()
  const { wrapper, list } = render(); await more(wrapper, deleted === 'a' ? 0 : 1); await action(2)
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', confirmText: '确认删除', message: expect.stringContaining('且不可恢复') }))
  expect(deleteAccount).toHaveBeenCalledWith(deleted)
  expect(list.value.map(item => item.id)).toEqual([current]); expect(activeAccount.id).toBe(current)
  expect(activeAccount.games[deleted]).toBeUndefined()
  expect(wrapper.get('[role="status"]').text()).toContain('已删除')
  expect(document.activeElement).toBe(wrapper.get('[data-tour="account-create"]').element)
})

it('删除最后一个账号清空当前 Context', async () => {
  vi.spyOn(dialog, 'confirm').mockResolvedValue(true); deleteAccount.mockResolvedValue()
  const { wrapper, list } = render([rows[0]]); await more(wrapper); await action(2)
  expect(list.value).toEqual([]); expect(activeAccount.id).toBe(''); expect(localStorage.getItem('yh_active_account')).toBeNull()
  expect(wrapper.text()).toContain('还没有游戏账号')
})

it('删除普通账号期间切换到该账号，返回后不能留下已删除 Context', async () => {
  vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
  const pending = deferred(); deleteAccount.mockReturnValue(pending.promise)
  const { wrapper } = render(); await more(wrapper, 1); await action(2)
  activeAccount.set('b'); pending.resolve(); await flushPromises()
  expect(activeAccount.id).toBe('a')
})

it('删除期间切到另一有效账号，完成时保留新的选择', async () => {
  vi.spyOn(dialog, 'confirm').mockResolvedValue(true)
  const pending = deferred(); deleteAccount.mockReturnValue(pending.promise)
  const { wrapper } = render([...rows, { id: 'c', name: '第三个', game: '如鸢' }]); await more(wrapper); await action(2)
  activeAccount.set('c'); pending.resolve(); await flushPromises(); expect(activeAccount.id).toBe('c')
})

it('取消与删除失败保留账号；确认期间列表移除目标不发请求', async () => {
  const confirm = vi.spyOn(dialog, 'confirm').mockResolvedValueOnce(false)
  const { wrapper, list } = render(); await more(wrapper); await action(2)
  expect(deleteAccount).not.toHaveBeenCalled(); expect(list.value).toHaveLength(2)
  confirm.mockResolvedValueOnce(true); deleteAccount.mockRejectedValueOnce(new Error('delete failed')); await action(2)
  expect(panel().querySelector('[role="alert"]').textContent).toContain('delete failed'); expect(activeAccount.id).toBe('a')
  const pending = deferred(); confirm.mockReturnValueOnce(pending.promise); await action(2)
  list.value = [rows[1]]; pending.resolve(true); await flushPromises(); expect(deleteAccount).toHaveBeenCalledTimes(1)
})

it.each(['create', 'edit', 'delete'])('%s 的晚到响应不写入新用户的列表或 Context', async operation => {
  const { wrapper, list, manager } = render(), pending = deferred()
  if (operation === 'create') { createAccount.mockReturnValue(pending.promise); await wrapper.get('[data-tour="account-create"]').trigger('click'); await inputName('新账号'); await submit() }
  else { await more(wrapper); if (operation === 'edit') { updateAccount.mockReturnValue(pending.promise); await action(0); await inputName('新名字'); await submit() } else { vi.spyOn(dialog, 'confirm').mockResolvedValue(true); deleteAccount.mockReturnValue(pending.promise); await action(2) } }
  auth.userInfo = { id: 'owner-b' }; await nextTick(); activeAccount.set('new-owner-account')
  pending.resolve({ id: 'a', name: '旧响应', game: '如鸢' }); await flushPromises()
  expect(list.value).toEqual(rows); expect(activeAccount.id).toBe('new-owner-account'); expect(manager.emitted('changed')).toBeUndefined()
})

it.each(['identity', 'roundtrip', 'unmount'])('危险确认期间 %s 变化后不执行删除', async change => {
  const pending = deferred(); vi.spyOn(dialog, 'confirm').mockReturnValue(pending.promise)
  const { wrapper } = render(); await more(wrapper); await action(2)
  if (change === 'unmount') wrapper.unmount()
  else { auth.userInfo = { id: 'owner-b' }; if (change === 'roundtrip') auth.userInfo = { id: 'owner-a' } }
  pending.resolve(true); await flushPromises(); expect(deleteAccount).not.toHaveBeenCalled()
})

it('卸载后创建结果被忽略，滚动锁及 visual viewport 监听清理', async () => {
  const viewport = new EventTarget(); Object.assign(viewport, { height: 480, offsetTop: 12 })
  const remove = vi.spyOn(viewport, 'removeEventListener'); vi.stubGlobal('visualViewport', viewport)
  const pending = deferred(); createAccount.mockReturnValue(pending.promise)
  const { wrapper, manager } = render([])
  await wrapper.get('[data-tour="account-create"]').trigger('click'); await inputName('新账号'); await submit()
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.querySelector('.account-panel-mask').style.height).toBe('480px')
  viewport.height = 280; viewport.offsetTop = 24; viewport.dispatchEvent(new Event('resize')); await nextTick()
  expect(document.querySelector('.account-panel-mask').style.height).toBe('280px')
  expect(document.querySelector('.account-panel-mask').style.top).toBe('24px')
  wrapper.unmount(); pending.resolve({ id: 'c', name: '新账号' }); await flushPromises()
  expect(manager.emitted('changed')).toBeUndefined(); expect(activeAccount.id).toBe('a')
  expect(document.body.style.overflow).toBe(''); expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
})

it('创建面板 Tab 环绕，危险确认初始焦点在取消，Escape 只关顶层并归还焦点', async () => {
  const dialogWrapper = mount(AppDialog, { attachTo: document.body })
  const { wrapper } = render()
  await wrapper.get('[data-tour="account-create"]').trigger('click'); await flushPromises()
  expect(document.activeElement).toBe(panel().querySelector('.name-field input'))
  const cancel = panel().querySelector('button[type="button"]'); cancel.focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })); await nextTick()
  expect(document.activeElement).toBe(panel().querySelector('.modal-foot .secondary-action'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); await nextTick()
  expect(document.activeElement).toBe(panel().querySelector('.panel-close'))
  await escape(); await more(wrapper); const deletion = panel().querySelector('.danger'); deletion.click(); await flushPromises()
  expect(document.activeElement).toBe(document.querySelector('.dlg-btn.ghost'))
  await escape(); expect(dialog._state.visible).toBe(false); expect(panel()).not.toBeNull()
  expect(panel().contains(document.activeElement)).toBe(true)
  await escape(); expect(document.activeElement).toBe(wrapper.get('.more-trigger').element)
  dialogWrapper.unmount()
})

it('同用户正常刷新 token 不丢弃成功的 CRUD 响应', async () => {
  const pending = deferred(); createAccount.mockReturnValue(pending.promise)
  const { wrapper, list } = render()
  await wrapper.get('[data-tour="account-create"]').trigger('click'); await inputName('新账号'); await submit()
  auth.accessToken = 'synthetic-refreshed-token'
  pending.resolve({ id: 'c', name: '新账号', game: '代号鸢' }); await flushPromises()
  expect(list.value.at(-1).id).toBe('c'); expect(activeAccount.id).toBe('c')
})
