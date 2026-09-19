import test from 'node:test'
import assert from 'node:assert/strict'

function createStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) }
  }
}

function installFakeBrowser(mobileQuery) {
  const originals = new Map()
  const windowListeners = new Map()

  class FakeMediaQueryList {
    constructor(media, matches = false) {
      this.media = media
      this.matches = matches
      this.listeners = new Set()
    }
    addEventListener(type, handler) { if (type === 'change') this.listeners.add(handler) }
    setMatches(matches) {
      if (this.matches === matches) return
      this.matches = matches
      for (const handler of this.listeners) handler({ matches, media: this.media })
    }
  }

  const media = new Map([
    [mobileQuery, new FakeMediaQueryList(mobileQuery)],
    ['(display-mode: standalone)', new FakeMediaQueryList('(display-mode: standalone)')]
  ])
  const navigatorLike = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    standalone: false
  }
  const windowLike = {
    navigator: navigatorLike,
    matchMedia(query) {
      if (!media.has(query)) media.set(query, new FakeMediaQueryList(query))
      return media.get(query)
    },
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set())
      windowListeners.get(type).add(handler)
    }
  }

  for (const [name, value] of [
    ['window', windowLike],
    ['navigator', navigatorLike],
    ['localStorage', createStorage()],
    ['sessionStorage', createStorage()]
  ]) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }

  return {
    mobileMedia: media.get(mobileQuery),
    fireWindow(type, event) {
      for (const handler of windowListeners.get(type) || []) handler(event)
    },
    restore() {
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete globalThis[name]
      }
    }
  }
}

test('updates the promo install prompt when viewport crosses its mobile breakpoint', async function () {
  const mobileQuery = '(max-width: 780px)'
  const browser = installFakeBrowser(mobileQuery)
  try {
    const install = await import(`../src/pwaInstall.js?responsive=${Date.now()}`)
    install.initPwaInstall()
    install.initPwaInstall()

    assert.equal(install.PWA_MOBILE_VIEWPORT_QUERY, mobileQuery)
    assert.equal(browser.mobileMedia.listeners.size, 1, 'breakpoint listener should only be registered once')
    assert.equal(install.pwaInstallState.mobile, false)

    browser.fireWindow('beforeinstallprompt', { preventDefault() {} })
    assert.equal(install.shouldShowPwaInstallPrompt(), false)

    browser.mobileMedia.setMatches(true)
    assert.equal(install.pwaInstallState.viewportMobile, true)
    assert.equal(install.pwaInstallState.mobile, true)
    assert.equal(install.shouldShowPwaInstallPrompt(), true, 'desktop → mobile should show without a reload')

    browser.mobileMedia.setMatches(false)
    assert.equal(install.pwaInstallState.viewportMobile, false)
    assert.equal(install.pwaInstallState.mobile, false)
    assert.equal(install.shouldShowPwaInstallPrompt(), false)

    install.dismissPwaInstallPrompt(1_000)
    browser.mobileMedia.setMatches(true)
    assert.equal(install.shouldShowPwaInstallPrompt(1_001), false, 'dismissal cooldown must still win after re-entering mobile')
  } finally {
    browser.restore()
  }
})

test('keeps the promo permission fallback visible when the native install prompt fails', async function () {
  const mobileQuery = '(max-width: 780px)'
  const browser = installFakeBrowser(mobileQuery)
  try {
    const install = await import(`../src/pwaInstall.js?permission-failure=${Date.now()}`)
    install.initPwaInstall()
    browser.mobileMedia.setMatches(true)
    browser.fireWindow('beforeinstallprompt', {
      preventDefault() {},
      async prompt() { throw new Error('shortcut permission denied') },
      userChoice: Promise.resolve({ outcome: 'dismissed' })
    })

    const result = await install.requestPwaInstall()
    assert.equal(result.outcome, 'failed')
    assert.match(result.error.message, /permission denied/)
    assert.equal(install.pwaInstallState.installHelpNeeded, true)
    assert.equal(install.pwaInstallState.nativeCancelledThisSession, false)
    assert.equal(install.shouldShowPwaInstallPrompt(), true)
  } finally {
    browser.restore()
  }
})
