import { afterEach, expect, it, vi } from 'vitest'
import { onWorkspaceTabKeydown, onWorkspaceTabFocus } from '../src/utils/workspaceTabs.js'

function renderTabs() {
  document.body.innerHTML = `<div role="tablist">
    <button role="tab" aria-selected="true" tabindex="0">库存清单</button>
    <button role="tab" aria-selected="false" tabindex="-1">统计报告</button>
    <button role="tab" aria-selected="false" tabindex="-1" disabled>不可用</button>
    <button role="tab" aria-selected="false" tabindex="-1">操作历史</button>
  </div><button aria-haspopup="dialog">即将上线</button>`
  const list = document.querySelector('[role="tablist"]')
  list.addEventListener('keydown', onWorkspaceTabKeydown)
  list.addEventListener('focusin', onWorkspaceTabFocus)
  list.addEventListener('focusout', onWorkspaceTabFocus)
  return [...list.querySelectorAll('[role="tab"]')]
}

afterEach(() => { document.body.innerHTML = '' })

it('方向键循环、Home/End 移动焦点并跳过禁用项，保持手动激活与单一 Tab 入口', () => {
  const tabs = renderTabs()
  const click = vi.fn()
  tabs.forEach(tab => tab.addEventListener('click', click))
  tabs[0].focus()
  for (const [key, next] of [['ArrowLeft', 3], ['ArrowRight', 0], ['ArrowRight', 1], ['ArrowRight', 3], ['Home', 0], ['End', 3]]) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    document.activeElement.dispatchEvent(event)
    expect(document.activeElement).toBe(tabs[next])
    expect(event.defaultPrevented).toBe(true)
    expect(tabs.filter(tab => tab.tabIndex === 0)).toEqual([tabs[next]])
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
  }
  expect(click).not.toHaveBeenCalled()
  document.querySelector('[aria-haspopup]').focus()
  expect(tabs.filter(tab => tab.tabIndex === 0)).toEqual([tabs[0]])
})

it.each(['Tab', 'Enter', ' ', 'ArrowDown'])('%s 保留浏览器原生键盘行为', key => {
  const tabs = renderTabs()
  tabs[0].focus()
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  tabs[0].dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(document.activeElement).toBe(tabs[0])
})

it('导入阶段没有选中视图时，重新进入从首项开始', () => {
  const tabs = renderTabs()
  tabs[0].setAttribute('aria-selected', 'false')
  tabs[3].focus()
  document.querySelector('[aria-haspopup]').focus()
  expect(tabs.filter(tab => tab.tabIndex === 0)).toEqual([tabs[0]])
})

it('方向键浏览后用鼠标返回当前选中项，Tab 入口跟随实际焦点', () => {
  const tabs = renderTabs()
  tabs[0].focus()
  tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  tabs[0].focus()
  expect(tabs.filter(tab => tab.tabIndex === 0)).toEqual([tabs[0]])
})
