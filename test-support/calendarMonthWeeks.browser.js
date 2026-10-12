// Run from an isolated Playwright CLI session already opened on localhost:5173.
// API and identity are entirely synthetic; non-GET API calls fail the check.
async page => {
  page.setDefaultTimeout(5000)
  await page.unroute('**/*')
  const items = await page.evaluate(async () => (await import('/test-support/calendarMonthFixtures.js')).denseMonthItems())
  let activeItems = items
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let activityRequests = 0
  const privateRow = { id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'synthetic-a', game: '如鸢', title: '合成私人跨月事项', start_date: '2026-09-01', end_date: '2026-11-20', time: '14:30', note: '仅合成账号可见', version: 0 }
  await page.addInitScript(() => { localStorage.setItem('yh_active_account', 'synthetic-a'); localStorage.setItem('yh_account_games', JSON.stringify({ 'synthetic-a': '如鸢' })) })
  await page.addInitScript(() => localStorage.setItem('yh_auth', JSON.stringify({ accessToken: 'synthetic-month-only', refreshToken: '', userInfo: { id: 'synthetic-month', userName: '合成测试' } })))
  await page.route('**/*', async route => {
    const raw = route.request().url(), path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0], hostname = raw.match(/^https?:\/\/([^:/]+)/)?.[1]
    if (!['localhost', '127.0.0.1'].includes(hostname)) return route.abort()
    if (!/^(\/v1\/|\/user\/|\/api\/)/.test(path)) return route.continue()
    if (route.request().method() !== 'GET') throw Error('Unexpected write: ' + path)
    let data = {}
    if (path === '/v1/activity-calendar') { activityRequests++; data = { items: activeItems.length ? [...activeItems, activeItems[0]] : [] } }
    else if (path === '/v1/accounts') data = [{ id: 'synthetic-a', name: '合成验收长账号名称', game: '如鸢' }]
    else if (path === '/v1/activity-calendar/subscriptions') data = { items: items.map(item => ({ event_id: item.id, subscribed: true, version: 0, completed: false, checklist: [], item })), unavailable_items: [], subscribed_count: items.length }
    else if (path === '/v1/activity-calendar/private-items') data = { items: [privateRow] }
    else if (path === '/user/info') data = { id: 'synthetic-month', user_name: '合成测试' }
    else if (path.includes('/notifications') || path.includes('/changelog')) data = { items: [], unread_count: 0 }
    else if (path.includes('/beta')) { const campaign = { campaign_id: 'synthetic', access_mode: 'OPEN', public_state: 'OPEN_REGISTRATION', server_now: new Date().toISOString(), initial_capacity: 10, capacity: 10, reserved_initial: 0, reserved_remaining: 0, granted_count: 1, public_remaining: 9 }; data = path.endsWith('/me') ? { campaign, enrollment_status: 'ACTIVE', can_use_beta_features: true } : campaign }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status_code: 200, message: 'success', data }) })
  })
  await page.goto('http://127.0.0.1:5173/calendar?view=month&date=2026-10-15')
  await page.locator('.calendar-day-detail .calendar-event').first().waitFor()
  const results = []
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForFunction(w => document.querySelector('.calendar-month-overflow button[aria-label^="10月15日"]').textContent.startsWith(w >= 1024 ? '+8' : '+9'), width)
    const geometry = await page.evaluate(() => {
      const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right } }
      const weeks = [...document.querySelectorAll('.calendar-month-week')].map(week => {
        const dates = [...week.querySelectorAll('.calendar-month-day')].map(rect)
        const bars = [...week.querySelectorAll('.calendar-month-bar')].map(rect)
        const conflicts = bars.some((a, i) => bars.slice(i + 1).some(b => a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1))
        return { h: rect(week).h, minDateWidth: Math.min(...dates.map(r => r.w)), minBarWidth: Math.min(...bars.map(r => r.w)), minHeight: Math.min(...dates.map(r => r.h), ...bars.map(r => r.h)), dateBarOverlap: bars.some(b => b.y < dates[0].bottom), conflicts }
      })
      const detail = document.querySelector('.calendar-day-detail')
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, weeks, cards: detail.querySelectorAll('.calendar-event').length, detailCount: document.querySelectorAll('.calendar-day-detail').length, detailFollowsWeek: detail.previousElementSibling.classList.contains('calendar-month-week'), nestedButtons: document.querySelectorAll('.calendar-month button button').length }
    })
    if (geometry.scrollWidth > width || geometry.cards !== 12 || geometry.detailCount !== 1 || !geometry.detailFollowsWeek || geometry.nestedButtons || geometry.weeks.some(w => w.h > (width >= 1024 ? 300 : 260) || w.minDateWidth < 44 || w.minBarWidth < 44 || w.minHeight < 44 || w.dateBarOverlap || w.conflicts)) throw Error(JSON.stringify(geometry))
    await page.locator('.calendar-month').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.screenshot({ path: '/tmp/month-bars-after-' + width + '.png' })
    if (width === 390) {
      await page.locator('.calendar-month').screenshot({ path: '/tmp/month-bars-after-dense-390.png' })
      await page.locator('.calendar-month-week').nth(2).screenshot({ path: '/tmp/month-bars-dense-week-390.png' })
    }
    results.push(geometry)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const before = activityRequests
  await page.locator('.calendar-month-day[aria-label^="2026年10月14日"]').click()
  await page.waitForFunction(() => document.querySelector('.calendar-month-day[aria-pressed=true]').getAttribute('aria-label').startsWith('2026年10月14日'))
  const more = page.locator('.calendar-month-overflow button[aria-label^="10月15日"]')
  await more.focus(); await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.activeElement.id === 'calendar-day-detail-title')
  if (await page.locator('.calendar-day-detail .calendar-event').count() !== 12 || activityRequests !== before) throw Error('daily completeness or duplicate request')
  const bar = page.locator('.calendar-month-week').nth(2).locator('.calendar-month-bar[data-event-id="month-00"]')
  await bar.focus(); await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.activeElement.classList.contains('calendar-month-event') && document.activeElement.dataset.eventId === 'month-00')
  if (!(await page.locator('.calendar-day-detail').textContent()).includes(items[0].title)) throw Error('long full title missing')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  if (!await bar.evaluate(el => getComputedStyle(el).transitionDuration === '0s' && getComputedStyle(el).animationName === 'none')) throw Error('reduced motion')
  await page.addStyleTag({ content: '.calendar-month { font-size: 20px; } .calendar-month-bar { font-size: 20px !important; } .calendar-day-number { font-size: 22px !important; }' })
  for (const size of [{ width: 320, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (overflow) throw Error('large font/landscape overflow')
  }
  await page.goto('http://127.0.0.1:5173/calendar?scope=mine&view=month&date=2026-10-15')
  await page.locator('.calendar-day-detail .calendar-private-actions').waitFor()
  if (await page.locator('.calendar-day-detail .calendar-event').count() !== 13) throw Error('personal events incomplete')
  await page.getByRole('button', { name: '全部活动', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.calendar-day-detail .calendar-private-actions'))
  if ((await page.locator('.calendar-month').textContent()).includes('合成私人跨月事项')) throw Error('private data in public view')
  await page.goto('http://127.0.0.1:5173/calendar?view=month&date=2026-08-01')
  await page.locator('.calendar-month-week').nth(5).waitFor()
  if (await page.locator('.calendar-month-week').count() !== 6) throw Error('six-week month')
  await page.goBack()
  await page.locator('.calendar-month-week').nth(4).waitFor()
  if (!(await page.locator('.calendar-month-day[aria-pressed=true]').getAttribute('aria-label')).startsWith('2026年10月15日')) throw Error('back restore')
  await page.goForward()
  await page.locator('.calendar-month-week').nth(5).waitFor()
  if (!(await page.locator('.calendar-month-day[aria-pressed=true]').getAttribute('aria-label')).startsWith('2026年8月1日')) throw Error('forward restore')
  await page.setViewportSize({ width: 320, height: 844 })
  for (const count of [0, 1, 3]) {
    activeItems = items.slice(0, count).map(item => ({ ...item, start_date: '2026-10-15', end_date: '2026-10-15' }))
    await page.goto('http://127.0.0.1:5173/calendar?view=month&date=2026-10-15')
    await page.locator('.calendar-view-content[aria-busy="false"]').waitFor()
    if (await page.locator('.calendar-month-bar').count() !== count || await page.locator('.calendar-day-detail .calendar-event').count() !== count) throw Error('sparse completeness ' + count)
    const narrow = await page.locator('.calendar-month-bar').evaluateAll(nodes => nodes.map(node => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })))
    if (narrow.some(r => r.w < 44 || r.h < 44) || await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('single-day target ' + JSON.stringify(narrow))
    if (count === 1) await page.locator('.calendar-month').screenshot({ path: '/tmp/month-bars-single-320.png' })
  }
  if (errors.length) throw Error(errors.join('\n'))
  return { results, keyboard: true, largeFontAndLandscape: true, reducedMotion: true, privateIsolation: true, sixWeeksAndBack: true, emptySingleThree: true, activityRequests }
}
