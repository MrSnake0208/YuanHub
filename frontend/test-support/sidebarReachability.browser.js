// Run with the existing Vite service: playwright-cli run-code --filename=test-support/sidebarReachability.browser.js
// Public-page geometry only; this does not verify authenticated pages, browser zoom or native iOS/PWA behavior.
async (page) => {
  await page.goto('http://127.0.0.1:5173/feedback/plaza')
  await page.locator('.island').waitFor({ state: 'attached' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const results = []
  const visible = async (selector, container, scroll = true) => {
    const target = page.locator(selector)
    if (scroll) await target.scrollIntoViewIfNeeded()
    const bounds = await target.evaluate((element, container) => {
      const rect = element.getBoundingClientRect()
      const parent = element.closest(container).getBoundingClientRect()
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      const banner = document.querySelector('[data-sidebar-test-banner]')?.getBoundingClientRect()
      return {
        top: rect.top, bottom: rect.bottom, height: rect.height,
        visible: rect.top >= Math.max(0, parent.top, banner?.bottom || 0) &&
          rect.bottom <= Math.min(innerHeight, parent.bottom) &&
          !!hit && element.contains(hit),
      }
    }, container)
    if (!bounds.visible || bounds.height < 44) throw new Error(`${selector}: ${JSON.stringify(bounds)}`)
    return bounds
  }
  try {
    await page.setViewportSize({ width: 1152, height: 312 })
    // Match the existing desktop update banner without changing version/auth state.
    await page.evaluate(() => {
      const banner = document.createElement('div')
      banner.className = 'version-update'
      banner.dataset.sidebarTestBanner = ''
      banner.style.cssText = 'position:sticky;top:0;height:53px;z-index:var(--z-banner);background:var(--tea)'
      banner.textContent = '合成更新提示条'
      document.body.prepend(banner)
    })
    const navigation = await page.locator('.island > .nav').evaluate(element => ({
      height: element.clientHeight,
      itemHeight: element.firstElementChild.getBoundingClientRect().height,
    }))
    if (navigation.height < navigation.itemHeight) throw new Error(`Navigation collapsed: ${JSON.stringify(navigation)}`)
    await page.locator('.island > .brand').focus()
    await page.keyboard.press('Tab')
    if (!await page.locator('.island > .nav > a:first-child').evaluate(element => element === document.activeElement)) {
      throw new Error('Tab did not enter primary navigation')
    }
    await visible('.island > .nav > a:first-child', '.island', false)
    await visible('.island > .nav > a:last-child', '.island')
    await page.locator('.sidebar-more-trigger').click()
    await visible('.sidebar-more-panel > a:first-child', '.island')
    await visible('.sidebar-more-panel > a:last-child', '.island')
    await page.locator('.sidebar-more-panel > a:last-child').focus()
    await page.keyboard.press('Escape')
    if (await page.locator('.sidebar-more').evaluate(element => element.open)) throw new Error('More menu stayed open')
    if (!await page.locator('.sidebar-more-trigger').evaluate(element => element === document.activeElement)) {
      throw new Error('More menu did not restore focus')
    }
    await visible('.sidebar-more-trigger', '.island')
    await visible('.sidebar-account', '.island')
    await page.locator('.foot-version').scrollIntoViewIfNeeded()
    const versionVisible = await page.locator('.foot-version').evaluate(element => {
      const rect = element.getBoundingClientRect()
      return rect.bottom <= innerHeight && element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    })
    if (!versionVisible) throw new Error('Last sidebar entry is obscured')
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Desktop page overflows horizontally')
    results.push({ width: 1152, height: 312, banner: 53, navigation, reachable: true })
    await page.evaluate(() => document.querySelector('[data-sidebar-test-banner]').remove())

    await page.setViewportSize({ width: 844, height: 390 })
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 100) })
    const scrollBefore = await page.evaluate(() => scrollY)
    await page.locator('.mobile-menu-button').click()
    await page.locator('.mobile-more > summary').click()
    await visible('.mobile-drawer-close', '.mobile-drawer')
    await visible('.mobile-drawer-nav > .mobile-drawer-section > a:first-child', '.mobile-drawer-nav')
    await visible('#mobile-service-nav > a:last-child', '.mobile-drawer-nav')
    await visible('.mobile-account-link', '.mobile-drawer')
    await page.keyboard.press('Escape')
    await page.locator('.mobile-drawer').waitFor({ state: 'detached' })
    const restored = await page.evaluate(() => ({
      scroll: scrollY,
      locked: document.body.classList.contains('mobile-nav-open'),
      focused: document.activeElement.matches('.mobile-menu-button'),
    }))
    if (restored.locked || !restored.focused || restored.scroll !== scrollBefore) {
      throw new Error(`Drawer did not restore page state: ${JSON.stringify({ scrollBefore, ...restored })}`)
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Page overflows horizontally')
    results.push({ width: 844, height: 390, drawer: 'first/last/account reachable', restored })
    return results
  } finally {
    await page.evaluate(() => {
      document.querySelector('[data-sidebar-test-banner]')?.remove()
      document.documentElement.style.removeProperty('scroll-behavior')
    })
    await page.emulateMedia({ reducedMotion: null })
  }
}
