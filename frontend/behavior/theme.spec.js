import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ThemeSelector from '../src/components/ThemeSelector.vue'
import { initTheme, setThemePreference, theme } from '../src/store/theme.js'

const html = readFileSync('index.html', 'utf8')
const bootstrap = html.match(/<script id="theme-init">([\s\S]*?)<\/script>/)[1]
let media, listeners, stop
function boot(saved) {
  if (saved !== undefined) localStorage.setItem('yh_theme', saved)
  window.eval(bootstrap)
}
beforeEach(() => {
  document.head.innerHTML = '<meta name="color-scheme" content="only light"><meta name="theme-color" content="#F6EDD0">'
  listeners = new Set()
  media = { matches: true, addEventListener: vi.fn((_, listener) => listeners.add(listener)), removeEventListener: vi.fn((_, listener) => listeners.delete(listener)) }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
})
afterEach(() => {
  stop?.(); stop = undefined
  delete window.yuanhubTheme
  delete document.documentElement.dataset.theme
  document.documentElement.removeAttribute('style')
})
function systemChange(dark) { media.matches = dark; for (const listener of listeners) listener() }

it.each([undefined, '', 'invalid', 'null', 'DARK'])('defaults to light even on a dark system with preference %s', saved => {
  boot(saved)
  expect(document.documentElement.dataset.theme).toBe('light')
  expect(document.documentElement.style.colorScheme).toBe('only light')
  expect(document.querySelector('[name="theme-color"]').content).toBe('rgb(246, 237, 208)')
})
it.each(['light', 'dark', 'system'])('restores %s before the application mounts', saved => {
  boot(saved)
  expect(document.documentElement.dataset.theme).toBe(saved === 'light' ? 'light' : 'dark')
  stop = initTheme()
  expect(theme.preference).toBe(saved)
  expect(theme.resolved).toBe(document.documentElement.dataset.theme)
})
it('manual choices override system changes, while system follows without writing auth or business data', () => {
  boot(); stop = initTheme()
  localStorage.setItem('yh_auth', 'untouched')
  setThemePreference('dark')
  systemChange(false)
  expect(theme.resolved).toBe('dark')
  setThemePreference('system')
  expect(theme.resolved).toBe('light')
  systemChange(true)
  expect(theme.resolved).toBe('dark')
  expect(localStorage.getItem('yh_theme')).toBe('system')
  expect(localStorage.getItem('yh_auth')).toBe('untouched')
  setThemePreference('bad')
  expect(theme.preference).toBe('system')
})
it('storage denial does not stop initialization or in-memory selection', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  boot(); stop = initTheme()
  expect(theme.resolved).toBe('light')
  setThemePreference('dark')
  expect(theme.resolved).toBe('dark')
})
it('system preference falls back to light if matchMedia is unavailable', () => {
  vi.stubGlobal('matchMedia', undefined)
  boot('system'); stop = initTheme()
  expect(theme.preference).toBe('system')
  expect(theme.resolved).toBe('light')
})
it('initialization is idempotent and listeners can be cleaned up and restarted', () => {
  boot('system'); stop = initTheme()
  expect(initTheme()).toBe(stop)
  expect(listeners.size).toBe(1)
  stop()
  expect(listeners.size).toBe(0)
  systemChange(false)
  stop = initTheme()
  expect(theme.resolved).toBe('light')
  expect(listeners.size).toBe(1)
})
it('both selectors reflect the same preference and switching leaves an existing draft mounted', async () => {
  boot(); stop = initTheme()
  const wrapper = mount({ components: { ThemeSelector }, template: '<div><input aria-label="草稿"><ThemeSelector/><ThemeSelector/></div>' })
  const input = wrapper.get('input')
  await input.setValue('未保存内容')
  await wrapper.findAll('button')[1].trigger('click')
  await nextTick()
  expect(wrapper.findAll('button[aria-pressed="true"]').map(button => button.text())).toEqual(['深色', '深色'])
  expect(wrapper.get('input').element).toBe(input.element)
  expect(input.element.value).toBe('未保存内容')
  expect(localStorage.getItem('yh_theme')).toBe('dark')
  boot()
  expect(document.documentElement.dataset.theme).toBe('dark')
})
