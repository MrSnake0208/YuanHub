import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AppDialog from '../src/components/AppDialog.vue'
import BetaCommunityDialog from '../src/components/beta/BetaCommunityDialog.vue'
import { dialog } from '../src/utils/dialog.js'
import { betaCommunity } from '../src/store/betaCommunity.js'

const mounted = []

function render(component) {
  const wrapper = mount(component, {
    attachTo: document.body,
    global: { stubs: { RouterLink: { template: '<a href="/feedback"><slot /></a>' } } }
  })
  mounted.push(wrapper)
  return wrapper
}

function trigger(key, shiftKey = false) {
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
    key, shiftKey, bubbles: true, cancelable: true
  }))
}

afterEach(async () => {
  if (dialog._state.visible) dialog._cancel()
  betaCommunity.close()
  await flushPromises()
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.replaceChildren()
})

describe('公共 Dialog 键盘行为', () => {
  it('驳回原因可不限长度，下一次普通 prompt 恢复默认 64 字符', async () => {
    const wrapper = render(AppDialog)
    const reason = dialog.prompt({ title: '驳回反馈', maxLength: null })
    await flushPromises()
    const input = wrapper.get('.dialog-field input')
    expect(input.attributes('maxlength')).toBeUndefined()
    await input.setValue('详细原因'.repeat(30))
    await wrapper.get('.dlg-btn.primary').trigger('click')
    expect(await reason).toBe('详细原因'.repeat(30))
    const next = dialog.prompt({ title: '重命名' })
    await flushPromises()
    expect(wrapper.get('.dialog-field input').attributes('maxlength')).toBe('64')
    dialog._cancel()
    await next
  })

  it('AppDialog 使用可见标题命名，危险确认先聚焦取消，Tab 被限制在弹窗内', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    render(AppDialog)
    const result = dialog.confirm({ title: '删除记录', message: '确定删除吗？', type: 'danger' })
    await flushPromises()

    const panel = document.body.querySelector('.dialog[role="dialog"]')
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(panel.getAttribute('aria-labelledby')).textContent).toContain('删除记录')
    expect(document.activeElement.textContent).toContain('取消')

    const close = panel.querySelector('.dialog-close')
    const confirm = panel.querySelector('.dlg-btn.primary')
    confirm.focus()
    trigger('Tab')
    expect(document.activeElement).toBe(close)
    close.focus()
    trigger('Tab', true)
    expect(document.activeElement).toBe(confirm)
    opener.focus()
    expect(panel.contains(document.activeElement)).toBe(true)

    trigger('Escape')
    await flushPromises()
    expect(await result).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('AppDialog 的 prompt 聚焦输入，关闭按钮与遮罩都归还焦点', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    render(AppDialog)
    const prompt = dialog.prompt({ title: '重命名', value: '旧名称' })
    await flushPromises()
    expect(document.activeElement).toBe(document.body.querySelector('.dialog-field input'))
    expect(document.activeElement.selectionStart).toBe(0)
    document.body.querySelector('.dialog-close').click()
    await flushPromises()
    expect(await prompt).toBeNull()
    expect(document.activeElement).toBe(opener)

    const alert = dialog.alert('提示内容')
    await flushPromises()
    document.body.querySelector('.dialog-mask').click()
    await flushPromises()
    expect(await alert).toBe(true)
    expect(document.activeElement).toBe(opener)
  })

  it('AppDialog 的多选项模式优先聚焦首项', async () => {
    render(AppDialog)
    const result = dialog.choose({ choices: [{ label: '继续', value: 'continue' }, { label: '稍后', value: 'later' }] })
    await flushPromises()
    expect(document.activeElement).toBe(document.body.querySelector('.dialog-choice'))
    trigger('Escape')
    await flushPromises()
    expect(await result).toEqual({ value: null, checked: false })
  })

  it('BetaCommunityDialog 跳过隐藏控件，失效触发器关闭后回退到主内容', async () => {
    const main = document.createElement('main')
    const opener = document.createElement('button')
    main.append(opener)
    document.body.append(main)
    opener.focus()
    render(BetaCommunityDialog)
    betaCommunity.open()
    await flushPromises()

    const panel = document.body.querySelector('.community-dialog')
    expect(document.getElementById(panel.getAttribute('aria-labelledby')).textContent).toContain('YuanHub 内测交流群')
    expect(document.activeElement.textContent).toContain('复制群号')
    const hidden = document.createElement('button')
    hidden.style.display = 'none'
    panel.append(hidden)
    const disabled = document.createElement('button')
    disabled.disabled = true
    panel.append(disabled)
    const last = panel.querySelector('.community-primary')
    last.focus()
    trigger('Tab')
    expect(document.activeElement).toBe(panel.querySelector('.community-close'))

    opener.remove()
    trigger('Escape')
    await flushPromises()
    expect(betaCommunity.visible).toBe(false)
    expect(document.activeElement).toBe(main)
  })

  it('内测群号的复制回退仍可在焦点限制内完成', async () => {
    render(BetaCommunityDialog)
    betaCommunity.open()
    await flushPromises()
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const originalExecCommand = document.execCommand
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    document.execCommand = vi.fn(() => true)
    try {
      const copy = document.body.querySelector('.community-primary')
      copy.click()
      await flushPromises()
      expect(document.execCommand).toHaveBeenCalledWith('copy')
      expect(copy.textContent).toContain('已复制')
      expect(document.activeElement).toBe(copy)
      document.execCommand.mockReturnValue(false)
      copy.click()
      await flushPromises()
      expect(copy.textContent).toContain('请手动复制')
      expect(document.body.querySelector('[role="status"]').textContent).toContain('复制失败')
      expect(document.body.querySelector('textarea')).toBeNull()
      expect(document.activeElement).toBe(copy)
    } finally {
      if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
      else delete navigator.clipboard
      document.execCommand = originalExecCommand
    }
  })

  it('内测弹窗的关闭按钮与遮罩都归还焦点', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    render(BetaCommunityDialog)
    betaCommunity.open()
    await flushPromises()
    document.body.querySelector('.community-close').click()
    await flushPromises()
    expect(document.activeElement).toBe(opener)

    betaCommunity.open()
    await flushPromises()
    document.body.querySelector('.community-mask').click()
    await flushPromises()
    expect(betaCommunity.visible).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('嵌套 AppDialog 只响应顶层 Esc，关闭后回到下层弹窗', async () => {
    render(BetaCommunityDialog)
    render(AppDialog)
    betaCommunity.open()
    await flushPromises()
    const result = dialog.confirm({ title: '确认操作' })
    await flushPromises()

    trigger('Escape')
    await flushPromises()
    expect(await result).toBe(false)
    expect(betaCommunity.visible).toBe(true)
    expect(document.activeElement).toBe(document.body.querySelector('.community-primary'))
  })

  it('阻断式 AppDialog 已打开时，后到的内测弹窗不会抢走键盘焦点', async () => {
    render(BetaCommunityDialog)
    render(AppDialog)
    const result = dialog.confirm({ title: '确认操作' })
    await flushPromises()
    const appPanel = document.body.querySelector('.dialog')
    betaCommunity.open()
    await flushPromises()

    expect(appPanel.contains(document.activeElement)).toBe(true)
    trigger('Escape')
    await flushPromises()
    expect(await result).toBe(false)
    expect(betaCommunity.visible).toBe(true)
    expect(document.activeElement).toBe(document.body.querySelector('.community-primary'))
  })
})
