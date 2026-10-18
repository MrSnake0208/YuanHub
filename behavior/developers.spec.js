import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'
import { developerDocuments } from '../src/data/developerManifest.js'
import { developerUseCases, operatorReadPrompt } from '../src/data/developerUseCases.js'
import { routes } from '../src/router/routes.js'
import { authGuard } from '../src/router/index.js'
import { beta } from '../src/store/beta.js'
import { auth } from '../src/store/auth.js'

vi.mock('../src/components/IslandSidebar.vue', () => ({ default: { template: '<div />' } }))
vi.mock('../src/store/auth.js', () => ({ init: vi.fn(), auth: { accessToken: '', userInfo: null, refreshAdminAccess: vi.fn() } }))
vi.mock('../src/store/beta.js', () => ({ beta: { setIdentity: vi.fn(), refresh: vi.fn(), canUseBetaFeatures: false, campaign: { accessMode: 'BETA' } } }))

let media
let mediaListeners
let copy
const response = body => ({ ok: true, text: async () => body })
function makeRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: routes
    .filter(route => route.path.startsWith('/developers') || ['/user/profile', '/login'].includes(route.path))
    .map(route => route.path.startsWith('/developers') ? route : { ...route, component: { template: '<div />' } }) })
  router.beforeEach(authGuard)
  return router
}
async function render(path = '/developers/guide', attachTo) {
  const router = makeRouter()
  await router.push(path)
  const wrapper = mount({ template: '<RouterView />' }, { attachTo, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}
beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = ''; auth.userInfo = null
  mediaListeners = new Set()
  media = { matches: false, addEventListener: vi.fn((_, listener) => mediaListeners.add(listener)), removeEventListener: vi.fn((_, listener) => mediaListeners.delete(listener)) }
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  copy = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
  fetch.mockResolvedValue(response('# 文档\n\n## 开始\n\n正文内容'))
})

it('all registered documents pass the actual guard anonymously without Beta refresh or admin access', async () => {
  const router = makeRouter()
  for (const doc of developerDocuments) {
    await router.push(doc.path)
    expect(router.currentRoute.value.path).toBe(doc.path)
  }
  await router.push('/developers/use-cases/operator-read')
  expect(router.currentRoute.value.name).toBe('developers-operator-read')
  expect(beta.refresh).not.toHaveBeenCalled()
  expect(auth.refreshAdminAccess).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('loads only the selected public Markdown without credentials and offers schema/example downloads', async () => {
  const { wrapper } = await render('/developers/protocols/operator-v5')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toContain('operator-growth-data-exchange-protocol-v5.md')
  expect(fetch.mock.calls[0][1].credentials).toBe('omit')
  expect(fetch.mock.calls[0][1].headers).toBeUndefined()
  expect(wrapper.get('.document-body').text()).toContain('正文内容')
  expect(wrapper.findAll('.developer-downloads a[download]').map(link => link.attributes('download'))).toEqual([
    'operator-growth-data-exchange-protocol-v5.md', 'operator-growth-exchange-v5.schema.json', 'boundary.valid.json', 'operator-scan-v5.json'
  ])
})

it('renders nested Markdown and escapes raw HTML, code and dangerous links without image requests', async () => {
  fetch.mockResolvedValue(response('# 文档\n\n## 开始\n\n<script>alert(1)</script>\n\n[危险](javascript:alert) ![图](https://evil.test/track.png) <img src=x onerror=alert(1)>\n\n- **粗体**\n  - *嵌套*\n\n| 字段 | 值 |\n|---|---|\n|x|`<tag>`|\n\n```html\n<img src=x onerror=alert(1)>\n```'))
  const { wrapper } = await render()
  expect(wrapper.find('script, img, iframe, [onerror]').exists()).toBe(false)
  expect(wrapper.findAll('a').some(link => /javascript:|evil\.test/.test(link.attributes('href') || ''))).toBe(false)
  expect(wrapper.get('strong').text()).toBe('粗体')
  expect(wrapper.get('ul ul em').text()).toBe('嵌套')
  expect(wrapper.get('table td code').text()).toBe('<tag>')
  expect(wrapper.get('pre code').text()).toBe('<img src=x onerror=alert(1)>')
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('copies exact code and gives a usable failure message if clipboard access fails', async () => {
  fetch.mockResolvedValue(response('# 文档\n\n```bash\ncurl "$BASE_URL"\n```'))
  const { wrapper } = await render()
  await wrapper.get('.document-code button').trigger('click'); await flushPromises()
  expect(copy).toHaveBeenLastCalledWith('curl "$BASE_URL"')
  expect(wrapper.get('.document-copy-status').text()).toContain('已复制')
  copy.mockRejectedValueOnce(new Error('permission denied'))
  await wrapper.get('.document-code button').trigger('click'); await flushPromises()
  expect(wrapper.get('.document-copy-status').text()).toContain('手动复制')
})

it('rejects missing assets and SPA HTML fallback, and retries successfully', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce(response('<!doctype html><html>SPA</html>')).mockResolvedValueOnce(response('# 恢复\n\n## 已恢复\n\n文档重新可读'))
  const { wrapper } = await render()
  expect(wrapper.get('[role="alert"]').text()).toContain('无法加载')
  await wrapper.get('.developer-state button').trigger('click'); await flushPromises()
  expect(wrapper.find('.document-body').exists()).toBe(false)
  await wrapper.get('.developer-state button').trigger('click'); await flushPromises()
  expect(wrapper.get('.document-body').text()).toContain('重新可读')
})

it.each(['/developers/protocols/not-public', '/developers/protocols/guide'])('unknown document %s never causes arbitrary path fetches', async path => {
  const { wrapper } = await render(path)
  expect(wrapper.get('h1').text()).toBe('文档不存在')
  expect(wrapper.get('[role="alert"]').text()).toContain('尚未公开')
  expect(fetch).not.toHaveBeenCalled()
})

it('switching documents aborts the previous load and ignores its late response', async () => {
  let finishOld
  fetch.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve }))
  const { wrapper, router } = await render()
  const oldSignal = fetch.mock.calls[0][1].signal
  await router.push('/developers/api'); await flushPromises()
  expect(oldSignal.aborted).toBe(true)
  expect(wrapper.get('h1').text()).toBe('API 参考')
  finishOld(response('# 旧文档\n\n## 迟到\n\n不能覆盖')); await flushPromises()
  expect(wrapper.get('.document-body').text()).toContain('正文内容')
  expect(wrapper.text()).not.toContain('不能覆盖')
})

it('recovers from an unknown path with the same document identifier and cancels pending content', async () => {
  const { wrapper, router } = await render('/developers/protocols/guide')
  await router.push('/developers/guide'); await flushPromises()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.document-body').text()).toContain('正文内容')
  await router.push('/developers'); await flushPromises()
  let finish
  fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await router.push('/developers/guide'); await flushPromises()
  const signal = fetch.mock.calls.at(-1)[1].signal
  await router.push('/developers/protocols/guide'); await flushPromises()
  expect(signal.aborted).toBe(true)
  finish(response('# 迟到的快速接入')); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('尚未公开')
})

it('deep links scroll after asynchronous content rendering and report missing chapters', async () => {
  const scroll = vi.fn()
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scroll })
  const { wrapper, router } = await render('/developers/guide#doc-%E5%BC%80%E5%A7%8B', document.body)
  expect(scroll).toHaveBeenCalled()
  expect(document.activeElement.id).toBe('doc-开始')
  await router.push('/developers/guide#doc-不存在'); await flushPromises()
  expect(wrapper.get('.developer-anchor-status').text()).toContain('章节不存在')
})

it('directory responds to breakpoints without refresh, retains search, and releases its listener', async () => {
  const { wrapper } = await render()
  const directory = wrapper.get('.developer-directory')
  expect(directory.element.open).toBe(false)
  directory.element.open = true
  await wrapper.get('input[type="search"]').setValue('V5')
  expect(wrapper.findAll('.developer-nav-group a').some(link => link.text().includes('V5'))).toBe(true)
  mediaListeners.forEach(listener => listener({ matches: true })); await nextTick()
  expect(directory.element.open).toBe(true)
  expect(wrapper.get('input[type="search"]').element.value).toBe('V5')
  mediaListeners.forEach(listener => listener({ matches: false })); await nextTick()
  expect(directory.element.open).toBe(false)
  wrapper.unmount()
  expect(mediaListeners.size).toBe(0)
})

it('home offers four real scenarios without the Markdown directory, downloads or network requests', async () => {
  const { wrapper, router } = await render('/developers')
  expect(wrapper.get('h1').text()).toBe('让你的工具连接 YuanHub')
  expect(wrapper.findAll('.developer-scenario').map(link => link.attributes('href'))).toEqual(developerUseCases.map(item => item.path))
  expect(wrapper.find('.developer-directory, .document-body, a[download]').exists()).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
  await wrapper.get('.developer-scenario').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/developers/use-cases/operator-read')
  expect(wrapper.get('h1').text()).toBe('读取我的密探')
  expect(wrapper.get('a[href="/user/profile"]').text()).toContain('前往创建连接码')
  expect(wrapper.find('a[href="/developers/api/operator"]').exists()).toBe(true)
  expect(wrapper.findAll('.developer-tutorial section h2')).toHaveLength(4)
  expect(fetch).not.toHaveBeenCalled()
})

it('copies the full AI task and public API address without touching user secrets', async () => {
  localStorage.setItem('access_token', 'PRIVATE_JWT_SENTINEL')
  sessionStorage.setItem('openapi_token', 'PRIVATE_TOKEN_SENTINEL')
  const { wrapper } = await render('/developers/use-cases/operator-read')
  const expected = `${operatorReadPrompt}\n本次站点的 API 后端根地址（BASE_URL）：http://127.0.0.1\n`
  expect(wrapper.get('textarea').element.value).toBe(expected)
  await wrapper.get('.developer-copy-prompt').trigger('click'); await flushPromises()
  expect(copy).toHaveBeenCalledExactlyOnceWith(expected)
  expect(copy.mock.calls[0][0]).not.toMatch(/PRIVATE_(JWT|TOKEN)_SENTINEL/)
  expect(wrapper.get('.developer-copy-feedback').text()).toContain('已复制')
  expect(fetch).not.toHaveBeenCalled()
})

it('connection creation follows the existing login guard with a return path', async () => {
  const { wrapper, router } = await render('/developers/use-cases/operator-read')
  await wrapper.get('a[href="/user/profile"]').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.path).toBe('/login')
  expect(router.currentRoute.value.query.redirect).toBe('/user/profile')
  expect(copy).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it.each(['denied', 'unavailable'])('failed clipboard %s opens a selected manual-copy fallback', async failure => {
  const { wrapper } = await render('/developers/use-cases/operator-read', document.body)
  if (failure === 'denied') copy.mockRejectedValueOnce(new Error('denied'))
  else Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  await wrapper.get('.developer-copy-prompt').trigger('click'); await flushPromises()
  const textarea = wrapper.get('textarea').element
  expect(wrapper.get('.developer-copy-feedback').text()).toContain('复制失败')
  expect(wrapper.get('.developer-prompt-preview').element.open).toBe(true)
  expect(document.activeElement).toBe(textarea)
  expect(textarea.selectionEnd - textarea.selectionStart).toBe(textarea.value.length)
  expect(wrapper.get('.developer-copy-prompt').element.disabled).toBe(false)
  expect(fetch).not.toHaveBeenCalled()
})

it('shows pending copy state and allows retry after failure', async () => {
  let reject
  copy.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
  const { wrapper } = await render('/developers/use-cases/operator-read')
  await wrapper.get('.developer-copy-prompt').trigger('click')
  expect(wrapper.get('.developer-copy-prompt').element.disabled).toBe(true)
  expect(wrapper.get('.developer-copy-feedback').text()).toContain('正在复制')
  reject(new Error('denied')); await flushPromises()
  await wrapper.get('.developer-copy-prompt').trigger('click'); await flushPromises()
  expect(wrapper.get('.developer-copy-feedback').text()).toContain('已复制')
})

it('old homepage anchors still load the original Markdown and return to the new homepage', async () => {
  const { wrapper, router } = await render('/developers#doc-开始', document.body)
  await flushPromises()
  expect(wrapper.get('.document-body').text()).toContain('正文内容')
  expect(fetch.mock.calls[0][0]).toContain('developers/index.md')
  await router.push('/developers'); await flushPromises()
  expect(wrapper.find('.document-body').exists()).toBe(false)
  expect(wrapper.get('h1').text()).toBe('让你的工具连接 YuanHub')
})
