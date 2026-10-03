import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PWA_DISMISS_MS,
  detectAndroid,
  detectIos,
  detectMobileLike,
  detectSafari
} from '../src/utils/pwaInstall.js'

test('detects Android mobile browsers', function () {
  const nav = { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5 }
  assert.equal(detectAndroid(nav), true)
  assert.equal(detectIos(nav), false)
  assert.equal(detectMobileLike(nav), true)
})

test('detects iPhone Safari separately from Chromium iOS', function () {
  const safari = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }
  const chrome = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 }
  assert.equal(detectIos(safari), true)
  assert.equal(detectSafari(safari), true)
  assert.equal(detectIos(chrome), true)
  assert.equal(detectSafari(chrome), false)
})

test('recognizes iPad desktop-style user agent through touch capability', function () {
  const nav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 }
  assert.equal(detectIos(nav), true)
  assert.equal(detectMobileLike(nav), true)
})

test('keeps dismissal cooldown at seven days', function () {
  assert.equal(PWA_DISMISS_MS, 7 * 24 * 60 * 60 * 1000)
})

function createStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) }
  }
}

let moduleId = 0
async function installBrowser(t, { ua = 'Android Mobile', mobile = true, standalone = false, storage = createStorage(), session = createStorage() } = {}) {
  const listeners = new Map()
  const media = new Map()
  const nav = { userAgent: ua, standalone: false }
  const browser = {
    navigator: nav,
    matchMedia(query) {
      if (!media.has(query)) media.set(query, {
        matches: query === '(display-mode: standalone)' ? standalone : mobile,
        listeners: new Set(),
        addEventListener(type, handler) { if (type === 'change') this.listeners.add(handler) },
        setMatches(matches) {
          this.matches = matches
          for (const handler of this.listeners) handler({ matches })
        }
      })
      return media.get(query)
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(handler)
    }
  }
  const originals = new Map()
  for (const [name, value] of Object.entries({ window: browser, navigator: nav, localStorage: storage, sessionStorage: session })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })
  function fire(type, event = {}) {
    for (const handler of listeners.get(type) || []) handler(event)
  }
  function offer(outcome = 'accepted', prompt = async () => {}) {
    const event = { preventDefault() {}, prompt, userChoice: Promise.resolve({ outcome }) }
    fire('beforeinstallprompt', event)
    return event
  }
  async function reload() {
    // A new page/module instance with the same browser storage, not a partial state reset.
    listeners.clear()
    for (const item of media.values()) item.listeners.clear()
    const install = await import(`../src/utils/pwaInstall.js?regression=${++moduleId}`)
    install.initPwaInstall()
    return install
  }
  return { install: await reload(), reload, fire, offer, storage, session, browser, listeners }
}

test('accepted installation suppresses automatic invitation after a browser reload', async t => {
  const context = await installBrowser(t)
  context.offer()
  assert.equal(context.install.shouldShowPwaInstallPrompt(), true)
  assert.deepEqual(await context.install.requestPwaInstall(), { outcome: 'accepted' })
  assert.equal(context.install.shouldShowPwaInstallPrompt(), false)
  assert.equal(context.install.pwaInstallState.standalone, false)
  const reloaded = await context.reload()
  context.offer()
  assert.equal(reloaded.shouldShowPwaInstallPrompt(), false)
  assert.equal(reloaded.pwaInstallState.installed, false, 'preference is not a current installation fact')
  assert.equal(reloaded.pwaInstallState.standalone, false)
  assert.equal(context.storage.getItem(reloaded.PWA_AUTO_SUPPRESSED_KEY), '1')
})

for (const ua of ['Android Mobile', 'iPhone Safari']) {
  test(`${ua} without an install event does not automatically invite`, async t => {
    const { install, fire } = await installBrowser(t, { ua })
    assert.equal(install.shouldShowPwaInstallPrompt(), false)
    fire('beforeinstallprompt', { preventDefault() {} })
    assert.equal(install.pwaInstallState.installable, false, 'event must have a callable prompt')
    assert.equal(install.shouldShowPwaInstallPrompt(), false)
  })
}

test('appinstalled persists promotion preference without forging the current display mode', async t => {
  const context = await installBrowser(t)
  context.offer()
  context.fire('appinstalled')
  assert.equal(context.install.pwaInstallState.installed, true)
  assert.equal(context.install.pwaInstallState.standalone, false)
  assert.equal(context.install.pwaInstallState.installable, false)
  assert.equal(context.storage.getItem(context.install.PWA_AUTO_SUPPRESSED_KEY), '1')
  const reloaded = await context.reload()
  context.offer()
  assert.equal(reloaded.shouldShowPwaInstallPrompt(), false)
  assert.equal(reloaded.pwaInstallState.installed, false)
})

test('standalone initialization and display-mode changes save the preference', async t => {
  const context = await installBrowser(t, { standalone: true })
  const { install, browser, storage } = context
  assert.equal(install.pwaInstallState.standalone, true)
  assert.equal(install.shouldShowPwaInstallPrompt(), false)
  assert.equal(storage.getItem(install.PWA_AUTO_SUPPRESSED_KEY), '1')
  browser.matchMedia('(display-mode: standalone)').setMatches(false)
  assert.equal(install.pwaInstallState.standalone, false)
  storage.removeItem(install.PWA_AUTO_SUPPRESSED_KEY)
  context.fire('storage', { key: install.PWA_AUTO_SUPPRESSED_KEY, storageArea: storage })
  browser.matchMedia('(display-mode: standalone)').setMatches(true)
  assert.equal(storage.getItem(install.PWA_AUTO_SUPPRESSED_KEY), '1')
})

test('iOS navigator.standalone also saves the preference', async t => {
  const context = await installBrowser(t, { ua: 'iPhone Safari' })
  context.browser.navigator.standalone = true
  const install = await context.reload()
  assert.equal(install.pwaInstallState.standalone, true)
  assert.equal(context.storage.getItem(install.PWA_AUTO_SUPPRESSED_KEY), '1')
})

test('stored suppression leaves a new event available for manual reinstallation', async t => {
  const storage = createStorage()
  storage.setItem('yuanhub:pwa-install-auto-suppressed:v1', '1')
  storage.setItem('unrelated:user-data', 'keep')
  const { install, offer } = await installBrowser(t, { storage })
  assert.equal(install.pwaInstallState.autoSuppressed, true)
  assert.equal(install.pwaInstallState.installed, false)
  assert.equal(install.pwaInstallState.standalone, false)
  let calls = 0
  offer('accepted', async () => { calls += 1 })
  assert.equal(install.pwaInstallState.installable, true)
  assert.equal(install.shouldShowPwaInstallPrompt(), false)
  assert.equal((await install.requestPwaInstall()).outcome, 'accepted')
  assert.equal(calls, 1)
  assert.equal(storage.getItem('unrelated:user-data'), 'keep')
})

test('seven-day dismissal survives reload and expires without creating installation preference', async t => {
  const context = await installBrowser(t)
  context.offer()
  context.install.dismissPwaInstallPrompt(1_000)
  const install = await context.reload()
  context.offer()
  assert.equal(install.shouldShowPwaInstallPrompt(1_001), false)
  assert.equal(install.shouldShowPwaInstallPrompt(1_000 + install.PWA_DISMISS_MS), true)
  assert.equal(context.storage.getItem(install.PWA_AUTO_SUPPRESSED_KEY), null)
})

test('native cancellation survives reload in the same session, but not a new session', async t => {
  const context = await installBrowser(t)
  context.offer('dismissed')
  await context.install.requestPwaInstall()
  assert.equal(context.storage.getItem(context.install.PWA_AUTO_SUPPRESSED_KEY), null)
  const reloaded = await context.reload()
  context.offer()
  assert.equal(reloaded.shouldShowPwaInstallPrompt(), false)
  globalThis.sessionStorage = createStorage()
  const nextSession = await context.reload()
  context.offer()
  assert.equal(nextSession.shouldShowPwaInstallPrompt(), true)
})

for (const outcome of ['failed', 'unavailable']) {
  test(`${outcome} keeps recovery available without an automatic invitation or persisted acceptance`, async t => {
    const { install, offer, storage } = await installBrowser(t)
    if (outcome === 'failed') offer('dismissed', async () => { throw new Error('shortcut permission denied') })
    assert.equal((await install.requestPwaInstall()).outcome, outcome)
    assert.equal(install.pwaInstallState.installHelpNeeded, true)
    assert.equal(install.pwaInstallState.nativeCancelledThisSession, false)
    assert.equal(install.shouldShowPwaInstallPrompt(), false)
    assert.equal(install.shouldShowPwaInstallRecovery(), true)
    assert.equal(storage.getItem(install.PWA_AUTO_SUPPRESSED_KEY), null)
    install.dismissPwaInstallPrompt()
    assert.equal(install.shouldShowPwaInstallRecovery(), false)
  })
}

test('storage synchronization reacts only to related localStorage keys and init is idempotent', async t => {
  const { install, offer, storage, session, fire, listeners, browser } = await installBrowser(t)
  install.initPwaInstall()
  offer()
  for (const type of ['beforeinstallprompt', 'appinstalled', 'storage']) assert.equal(listeners.get(type)?.size, 1)
  assert.equal(browser.matchMedia('(display-mode: standalone)').listeners.size, 1)
  assert.equal(browser.matchMedia(install.PWA_MOBILE_VIEWPORT_QUERY).listeners.size, 1)
  storage.setItem(install.PWA_AUTO_SUPPRESSED_KEY, '1')
  fire('storage', { key: 'unrelated', storageArea: storage })
  fire('storage', { key: null, storageArea: storage })
  fire('storage', { key: install.PWA_AUTO_SUPPRESSED_KEY, storageArea: session })
  assert.equal(install.shouldShowPwaInstallPrompt(), true)
  fire('storage', { key: install.PWA_AUTO_SUPPRESSED_KEY, storageArea: storage })
  assert.equal(install.shouldShowPwaInstallPrompt(), false)
  assert.equal(install.pwaInstallState.installed, false)
  assert.equal(install.pwaInstallState.standalone, false)
  storage.removeItem(install.PWA_AUTO_SUPPRESSED_KEY)
  fire('storage', { key: install.PWA_AUTO_SUPPRESSED_KEY, storageArea: storage })
  assert.equal(install.shouldShowPwaInstallPrompt(), true)
  storage.setItem(install.PWA_DISMISSED_KEY, String(Date.now() + install.PWA_DISMISS_MS))
  fire('storage', { key: install.PWA_DISMISSED_KEY, storageArea: storage })
  assert.equal(install.shouldShowPwaInstallPrompt(), false)
  storage.removeItem(install.PWA_DISMISSED_KEY)
  fire('storage', { key: install.PWA_DISMISSED_KEY, storageArea: storage })
  assert.equal(install.shouldShowPwaInstallPrompt(), true)
})

for (const failure of ['object', 'read', 'write']) {
  test(`storage ${failure} failure keeps the page usable and memory suppression effective`, async t => {
    const context = await installBrowser(t)
    if (failure === 'object') {
      for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(globalThis, name, {
        configurable: true, get() { throw new Error('storage unavailable') }
      })
    } else {
      for (const storage of [context.storage, context.session]) {
        const methods = failure === 'read' ? ['getItem'] : ['setItem', 'removeItem']
        for (const method of methods) storage[method] = () => { throw new Error('storage unavailable') }
      }
    }
    const install = await context.reload()
    context.offer()
    assert.equal(install.shouldShowPwaInstallPrompt(), true)
    context.offer('dismissed')
    assert.equal((await install.requestPwaInstall()).outcome, 'dismissed')
    context.offer('accepted')
    assert.equal((await install.requestPwaInstall()).outcome, 'accepted')
    assert.equal(install.pwaInstallState.autoSuppressed, true)
    assert.equal(install.pwaInstallState.standalone, false)
    context.fire('appinstalled')
    assert.equal(install.pwaInstallState.autoSuppressed, true)
    assert.equal(install.pwaInstallState.standalone, false)
    assert.equal(install.shouldShowPwaInstallPrompt(), false)
    assert.doesNotThrow(() => install.dismissPwaInstallPrompt())
    context.fire('storage', { key: 'unrelated' })
    assert.equal(install.pwaInstallState.autoSuppressed, true)
  })
}

test('invalid local records do not suppress a valid event', async t => {
  const storage = createStorage()
  storage.setItem('yuanhub:pwa-install-auto-suppressed:v1', 'false')
  storage.setItem('yuanhub:pwa-install-prompt-dismissed-until:v1', 'NaN')
  const { install, offer } = await installBrowser(t, { storage })
  offer()
  assert.equal(install.shouldShowPwaInstallPrompt(), true)
})

test('clearing dismissal does not restore automatic promotion', async t => {
  const { install, offer, storage, session } = await installBrowser(t)
  offer()
  await install.requestPwaInstall()
  offer('dismissed')
  await install.requestPwaInstall()
  assert.equal(install.pwaInstallState.nativeCancelledThisSession, true)
  install.dismissPwaInstallPrompt()
  install.clearPwaInstallDismissal()
  offer()
  assert.equal(install.pwaInstallState.dismissedUntil, 0)
  assert.equal(install.pwaInstallState.nativeCancelledThisSession, false)
  assert.equal(storage.getItem(install.PWA_AUTO_SUPPRESSED_KEY), '1')
  assert.equal(session.getItem(install.PWA_SESSION_CANCELLED_KEY), null)
  assert.equal(install.shouldShowPwaInstallPrompt(), false)
})
