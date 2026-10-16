import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import OperatorShareManager from '../src/components/operator/OperatorShareManager.vue'
import AccountShareManager from '../src/components/AccountShareManager.vue'
import AppDialog from '../src/components/AppDialog.vue'
import * as api from '../src/api/accountShare.js'
import { dialog } from '../src/utils/dialog.js'
import { deferred } from '../test-support/factories.js'

vi.mock('../src/api/accountShare.js', () => ({
  getAccountShare: vi.fn(), setAccountShareScope: vi.fn(), regenerateAccountShare: vi.fn(), revokeAccountShare: vi.fn(),
}))
const active = (id, scopes = ['operator'], code = id + '-code') => ({ account_id: id, active: scopes.length > 0, scopes, share_code: code })
const node = selector => new DOMWrapper(document.querySelector(selector))
const panel = () => node('#operator-share-dialog')
const button = text => panel().findAll('button').find(item => item.text().includes(text))
const escape = () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
let wrapper
beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  api.getAccountShare.mockImplementation(async id => active(id))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(async () => {
  if (dialog._state.visible) dialog._cancel()
  await flushPromises()
  wrapper?.unmount()
  wrapper = null
})
async function render() {
  wrapper = mount(defineComponent({
    components: { OperatorShareManager, AppDialog },
    setup: () => ({ open: ref(false), accountId: ref('a') }),
    template: `<main><button class="opener" @click="open = true">分享 BOX</button><p class="page-content">保留正文</p>
      <OperatorShareManager ref="manager" v-model:open="open" :account-id="accountId" :account-name="accountId + '账号'" />
      <AppDialog /></main>`,
  }), { attachTo: document.body })
  await flushPromises()
  return wrapper
}
async function open() {
  const opener = wrapper.get('.opener')
  opener.element.focus()
  await opener.trigger('click'); await flushPromises()
}

it('关闭后迟到状态照常更新，重新打开保持实例、链接及读取次数，复制引用仍有效', async () => {
  const pending = deferred()
  api.getAccountShare.mockReturnValue(pending.promise)
  await render()
  const manager = wrapper.findComponent(AccountShareManager).vm.$
  await open()
  expect(panel().text()).toContain('正在读取分享状态')
  await panel().get('[aria-label="关闭分享弹窗"]').trigger('click')
  pending.resolve(active('a')); await flushPromises()
  expect(panel().isVisible()).toBe(false)
  expect(wrapper.findComponent(OperatorShareManager).emitted('share-change').at(-1)[0]).toMatchObject({ accountId: 'a', status: '已开启' })
  const writeText = vi.fn().mockResolvedValue()
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  expect(await wrapper.vm.$refs.manager.copyCurrentShare()).toBe(true)
  expect(writeText).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1/operator/share/a-code')
  await open()
  expect(panel().get('input[readonly]').element.value).toContain('a-code')
  expect(wrapper.findComponent(AccountShareManager).vm.$).toBe(manager)
  expect(api.getAccountShare).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.page-content').text()).toBe('保留正文')
  expect(api.setAccountShareScope).not.toHaveBeenCalled()
})

it('Escape、底部和遮罩关闭归还焦点与滚动锁，Tab 留在弹窗中', async () => {
  document.body.style.overflow = 'auto'
  document.documentElement.style.overflow = 'scroll'
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(320)
  await render(); await open()
  expect(document.body.style.position).toBe('fixed')
  expect(document.body.style.top).toBe('-320px')
  const close = panel().get('[aria-label="关闭分享弹窗"]')
  const done = panel().get('footer button')
  expect(document.activeElement).toBe(close.element)
  done.element.focus()
  done.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(close.element)
  escape(); await flushPromises()
  expect(panel().isVisible()).toBe(false)
  expect(document.activeElement).toBe(wrapper.get('.opener').element)
  expect(document.body.style.overflow).toBe('auto')
  expect(document.documentElement.style.overflow).toBe('scroll')
  expect(window.scrollTo).toHaveBeenLastCalledWith(0, 320)
  await open(); await panel().get('footer button').trigger('click'); await flushPromises()
  expect(panel().isVisible()).toBe(false)
  await open()
  await panel().get('input[readonly]').trigger('pointerdown')
  await node('.operator-share-mask').trigger('click')
  expect(panel().isVisible()).toBe(true)
  await node('.operator-share-mask').trigger('pointerdown')
  await node('.operator-share-mask').trigger('click'); await flushPromises()
  expect(panel().isVisible()).toBe(false)
  expect(api.setAccountShareScope).not.toHaveBeenCalled()
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

it('双权限独立切换并共用分享码，两条链接均可访问和复制', async () => {
  api.getAccountShare.mockResolvedValue(active('a', []))
  api.setAccountShareScope.mockResolvedValueOnce(active('a', ['star'])).mockResolvedValueOnce(active('a', ['operator', 'star']))
  const writeText = vi.fn().mockResolvedValue()
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await render(); await open()
  await panel().get('[aria-label="星石背包分享"]').setValue(true); await flushPromises()
  expect(api.setAccountShareScope).toHaveBeenLastCalledWith('a', 'star', true)
  expect(panel().get('[aria-label="密探 BOX分享"]').element.checked).toBe(false)
  await panel().get('[aria-label="密探 BOX分享"]').setValue(true); await flushPromises()
  expect(api.setAccountShareScope).toHaveBeenLastCalledWith('a', 'operator', true)
  expect(panel().findAll('.visit').map(link => link.attributes('href'))).toEqual([
    'http://127.0.0.1/operator/share/a-code', 'http://127.0.0.1/star/share/a-code',
  ])
  await button('复制密探').trigger('click'); await flushPromises()
  await button('复制星石').trigger('click'); await flushPromises()
  expect(writeText.mock.calls.map(([value]) => value)).toEqual(panel().findAll('input[readonly]').map(input => input.element.value))
})

it('模态中的复制回退在焦点约束内选中链接，并恢复复制按钮焦点', async () => {
  vi.stubGlobal('navigator', { clipboard: undefined })
  let selected
  document.execCommand = vi.fn(() => {
    selected = document.activeElement
    expect(panel().element.contains(selected)).toBe(true)
    expect(selected.value).toBe('http://127.0.0.1/operator/share/a-code')
    expect(selected.selectionEnd).toBe(selected.value.length)
    return true
  })
  try {
    await render(); await open()
    const copy = button('复制密探'); copy.element.focus()
    await copy.trigger('click'); await flushPromises()
    expect(document.execCommand).toHaveBeenCalledExactlyOnceWith('copy')
    expect(selected.isConnected).toBe(false)
    expect(document.activeElement).toBe(copy.element)
    expect(panel().text()).toContain('分享链接已复制')
  } finally { delete document.execCommand }
})

it.each([
  ['重新生成', 'regenerateAccountShare', active('a', ['operator', 'star'], 'new-code')],
  ['全部撤销', 'revokeAccountShare', active('a', [])],
])('%s 使用真实全局确认，取消不写入、确认后更新，Escape 只关闭最上层', async (label, action, result) => {
  api.getAccountShare.mockResolvedValue(active('a', ['operator', 'star']))
  api[action].mockResolvedValue(result)
  await render(); await open()
  button(label).element.focus()
  await button(label).trigger('click'); await flushPromises()
  expect(dialog._state.visible).toBe(true)
  expect(document.querySelector('.dialog').contains(document.activeElement)).toBe(true)
  await node('.operator-share-mask').trigger('pointerdown')
  await node('.operator-share-mask').trigger('click')
  expect(panel().isVisible()).toBe(true)
  escape(); await flushPromises()
  expect(dialog._state.visible).toBe(false)
  expect(panel().isVisible()).toBe(true)
  expect(document.activeElement).toBe(button(label).element)
  expect(api[action]).not.toHaveBeenCalled()
  await button(label).trigger('click'); await flushPromises()
  await node('.dlg-btn.primary').trigger('click'); await flushPromises()
  expect(api[action]).toHaveBeenCalledExactlyOnceWith('a')
  expect(panel().isVisible()).toBe(true)
  if (action === 'regenerateAccountShare') expect(panel().get('input[readonly]').element.value).toContain('new-code')
  else expect(panel().find('input[readonly]').exists()).toBe(false)
})

it('打开时切换账号立即清空旧链接，关闭后忽略旧账号迟到结果', async () => {
  const pending = deferred()
  api.getAccountShare.mockImplementation(id => id === 'a' ? pending.promise : Promise.resolve(active(id)))
  await render(); await open()
  wrapper.vm.accountId = 'b'; await flushPromises()
  expect(panel().text()).toContain('b账号')
  expect(panel().get('input[readonly]').element.value).toContain('b-code')
  await panel().get('footer button').trigger('click')
  pending.resolve(active('a')); await flushPromises()
  await open()
  expect(panel().get('input[readonly]').element.value).toContain('b-code')
  wrapper.vm.accountId = ''; await flushPromises()
  expect(panel().find('input[readonly]').exists()).toBe(false)
  expect(panel().text()).toContain('创建并选择账号')
})

it('卸载打开的弹窗恢复原有滚动样式', async () => {
  await render(); await open()
  wrapper.unmount(); wrapper = null
  expect(document.body.style.position).toBe('')
  expect(document.body.style.overflow).toBe('')
  expect(document.documentElement.style.overflow).toBe('')
})

it('短视口和软键盘变化只调整弹窗，链接与焦点保持且不重复读取', async () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 })
  vi.stubGlobal('visualViewport', viewport)
  await render(); await open()
  const input = panel().get('input[readonly]')
  input.element.focus()
  viewport.height = 240; viewport.offsetTop = 30
  viewport.dispatchEvent(new Event('resize')); await flushPromises()
  expect(node('.operator-share-mask').classes()).toContain('is-short-viewport')
  expect(node('.operator-share-mask').element.style.height).toBe('240px')
  expect(node('.operator-share-mask').element.style.top).toBe('30px')
  expect(panel().get('input[readonly]').element).toBe(input.element)
  expect(document.activeElement).toBe(input.element)
  expect(api.getAccountShare).toHaveBeenCalledTimes(1)
  viewport.height = 800; viewport.offsetTop = 0
  viewport.dispatchEvent(new Event('resize')); await flushPromises()
  expect(node('.operator-share-mask').classes()).not.toContain('is-short-viewport')
})

it('已显示 A 的链接在切换到等待中的 B 时清空，关闭期间权限更新仍发出真实状态', async () => {
  await render(); await open()
  expect(panel().get('input[readonly]').element.value).toContain('a-code')
  const pending = deferred()
  api.getAccountShare.mockReturnValue(pending.promise)
  wrapper.vm.accountId = 'b'; await flushPromises()
  expect(panel().find('input[readonly]').exists()).toBe(false)
  expect(panel().text()).toContain('正在读取分享状态')
  pending.resolve(active('b')); await flushPromises()
  const update = deferred()
  api.setAccountShareScope.mockReturnValue(update.promise)
  await panel().get('[aria-label="密探 BOX分享"]').setValue(false)
  expect(panel().text()).toContain('更新中')
  await panel().get('footer button').trigger('click')
  update.resolve(active('b', [])); await flushPromises()
  expect(panel().isVisible()).toBe(false)
  expect(wrapper.findComponent(OperatorShareManager).emitted('share-change').at(-1)[0]).toMatchObject({ accountId: 'b', status: '未开启', link: '' })
})
