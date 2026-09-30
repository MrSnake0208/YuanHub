import { beforeEach, afterEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

enableAutoUnmount(afterEach)
// jsdom does not implement the native dialog presentation methods. Keep the
// open/close event semantics, without pretending to test geometry or CSS layout.
Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: { configurable: true, value() { this.setAttribute('open', '') } },
  close: { configurable: true, value() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) } }
})
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  // jsdom has no ResizeObserver; geometry remains a browser-level check.
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Unexpected network request: mock the API boundary in behavior tests'))))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = '' })
