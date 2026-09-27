// 冷启动 Loading Feedback（P1）回归测试。
//
// 目标：即使网络慢，用户也能看到「正在启动」而不是只剩背景色；同时
// 快速启动不闪 Loading，首屏一旦就绪立即移除，且永不遮挡已渲染页面。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { STARTUP_SPLASH_ID, removeStartupSplash, watchStartupReadiness } from '../src/utils/startupFeedback.js'

function readSource(path) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

function fakeDocument() {
  const nodes = new Map()
  return {
    add(id) {
      const parent = {
        removeChild(child) {
          if (child.parentNode === parent) child.parentNode = null
          nodes.delete(id)
        }
      }
      const node = { id, parentNode: parent }
      nodes.set(id, node)
      return node
    },
    getElementById(id) { return nodes.get(id) || null },
    has(id) { return nodes.has(id) }
  }
}

function fakeRouter() {
  const handlers = []
  let resolveReady = null
  const ready = new Promise(function (resolve) { resolveReady = resolve })
  return {
    handlers,
    resolveReady,
    afterEach(handler) {
      handlers.push(handler)
      return function () {
        const index = handlers.indexOf(handler)
        if (index >= 0) handlers.splice(index, 1)
      }
    },
    isReady() { return ready },
    afterEachCount() { return handlers.length },
    emitAfterEach(failure) { handlers.slice().forEach(function (handler) { handler({ path: '/' }, {}, failure) }) }
  }
}

test('removeStartupSplash 幂等，缺失节点或无 document 时不抛错', function () {
  const doc = fakeDocument()
  assert.equal(removeStartupSplash(doc), false)
  assert.equal(removeStartupSplash(null), false)

  doc.add(STARTUP_SPLASH_ID)
  assert.equal(removeStartupSplash(doc), true)
  assert.equal(doc.has(STARTUP_SPLASH_ID), false)
  assert.equal(removeStartupSplash(doc), false)
})

test('首次导航完成后立即移除启动反馈（不遮挡已渲染页面）', async function () {
  const doc = fakeDocument()
  doc.add(STARTUP_SPLASH_ID)
  const router = fakeRouter()
  const dispose = watchStartupReadiness(router, doc)

  assert.equal(doc.has(STARTUP_SPLASH_ID), true, '导航完成前保留启动反馈')
  router.emitAfterEach()
  assert.equal(doc.has(STARTUP_SPLASH_ID), false, '首次导航确认后必须立即移除')
  dispose()
})

test('首次导航被守卫中止时保留启动反馈，而不是回到空白背景', function () {
  const doc = fakeDocument()
  doc.add(STARTUP_SPLASH_ID)
  const router = fakeRouter()
  const dispose = watchStartupReadiness(router, doc)

  router.emitAfterEach(new Error('navigation aborted'))
  assert.equal(doc.has(STARTUP_SPLASH_ID), true)
  router.emitAfterEach()
  assert.equal(doc.has(STARTUP_SPLASH_ID), false)
  dispose()
})

test('isReady 兜底结束反馈，且重复结束不会重复移除', async function () {
  const doc = fakeDocument()
  doc.add(STARTUP_SPLASH_ID)
  const router = fakeRouter()
  const dispose = watchStartupReadiness(router, doc)

  router.resolveReady()
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(doc.has(STARTUP_SPLASH_ID), false)
  // 已经结束后再来一次 afterEach 不应影响任何状态（节点早已移除）
  router.emitAfterEach()
  assert.equal(doc.has(STARTUP_SPLASH_ID), false)
  dispose()
})

test('dispose 之后不再响应导航事件', function () {
  const doc = fakeDocument()
  doc.add(STARTUP_SPLASH_ID)
  const router = fakeRouter()
  const dispose = watchStartupReadiness(router, doc)
  expectNoHandlers(router, 1)
  dispose()
  expectNoHandlers(router, 0)
  assert.equal(doc.has(STARTUP_SPLASH_ID), true)
})

function expectNoHandlers(router, expected) {
  assert.equal(router.afterEachCount(), expected)
}

test('index.html 内置的启动反馈自带延迟出现，且默认不可见 / 不拦截点击', function () {
  const html = readSource('../index.html')
  assert.match(html, /id="startup-splash"/)
  assert.match(html, /role="status"/)
  assert.match(html, /正在加载…/)
  assert.match(html, /\/brand\/yuanhub-logo\.png/, '使用官方品牌 Logo')
  // 延迟出现（400ms 级）——快速启动不会闪一下 Loading
  assert.match(html, /animation:startup-splash-in \.3s ease-out \.4s both/)
  // 初始不可见 + 不拦截交互 + 不高于应用浮层
  assert.match(html, /#startup-splash\{[^}]*opacity:0/)
  assert.match(html, /#startup-splash\{[^}]*pointer-events:none/)
  assert.match(html, /#startup-splash\{[^}]*z-index:5/)
  // 无背景色：直接落在 body 的纸张背景与吉祥物纹理上，避免看起来像另一屏
  assert.doesNotMatch(html, /#startup-splash\{[^}]*background-color/)
  // 减少动态效果时保留延迟但不做位移/扫光
  assert.match(html, /prefers-reduced-motion:reduce/)
  assert.match(html, /startup-splash-reveal 1ms linear \.4s forwards/)
})

test('main.js 在首次导航时把启动反馈收口', function () {
  const source = readSource('../src/main.js')
  assert.match(source, /watchStartupReadiness\(router\)/)
})

test('字体改为非阻塞加载，不再拖住首次绘制', function () {
  const html = readSource('../index.html')
  assert.match(html, /rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/)
  assert.match(html, /media="print" onload="this\.media='all'"/)
  assert.match(html, /<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*<\/noscript>/)
})
