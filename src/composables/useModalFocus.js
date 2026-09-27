import { nextTick, onScopeDispose, watch } from 'vue'

const stack = []
const focusSelector = 'a[href], button, input, select, textarea, [tabindex]'

function isVisible(element) {
  if (!element?.isConnected || element.matches(':disabled, [hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')) return false
  for (let node = element; node instanceof Element; node = node.parentElement) {
    if (node.matches('[hidden], [inert], [aria-hidden="true"]')) return false
    if (node.matches('details:not([open])') && !node.querySelector('summary')?.contains(element)) return false
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
  }
  return true
}

function focusable(panel) {
  return Array.from(panel?.querySelectorAll(focusSelector) || [])
    .filter(element => element.tabIndex >= 0 && isVisible(element))
}

function top() {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].blocking) return stack[index]
  }
  return stack[stack.length - 1]
}

function focusInside(entry, preferred) {
  const panel = entry.panel.value
  if (!panel) return
  const target = preferred && panel.contains(preferred) && isVisible(preferred)
    ? preferred
    : focusable(panel)[0] || panel
  target.focus()
  entry.afterFocus?.(target)
}

function onKeydown(event) {
  const entry = top()
  if (!entry) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    entry.onEscape()
    return
  }
  if (event.key !== 'Tab') return
  const elements = focusable(entry.panel.value)
  const first = elements[0]
  const last = elements[elements.length - 1]
  const active = document.activeElement
  if (!first) {
    event.preventDefault()
    entry.panel.value?.focus()
  } else if (!elements.includes(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
    event.preventDefault()
    const target = event.shiftKey ? last : first
    target.focus()
  }
}

function onFocusin(event) {
  const entry = top()
  if (entry && !entry.panel.value?.contains(event.target)) focusInside(entry, entry.initialFocus())
}

function listen() {
  if (stack.length !== 1) return
  document.addEventListener('keydown', onKeydown, true)
  document.addEventListener('focusin', onFocusin, true)
}

function unlisten() {
  if (stack.length) return
  document.removeEventListener('keydown', onKeydown, true)
  document.removeEventListener('focusin', onFocusin, true)
}

function restore(entry) {
  const parent = top()
  if (parent) {
    focusInside(parent, parent.panel.value?.contains(entry.opener) ? entry.opener : parent.initialFocus())
    return
  }
  const target = isVisible(entry.opener) ? entry.opener : document.querySelector('main') || document.body
  if (target.tabIndex < 0) target.setAttribute('tabindex', '-1')
  target.focus()
}

export function useModalFocus(visible, panel, { initialFocus, onEscape, afterFocus, blocking = false }) {
  let entry
  function close() {
    if (!entry) return
    const closed = entry
    entry = null
    stack.splice(stack.indexOf(closed), 1)
    unlisten()
    nextTick(() => restore(closed))
  }
  watch(visible, open => {
    if (!open) return close()
    entry = { panel, initialFocus, onEscape, afterFocus, blocking, opener: document.activeElement }
    stack.push(entry)
    listen()
    nextTick(() => { if (top() === entry) focusInside(entry, initialFocus()) })
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(close)
}
