// Playwright CLI run-code; all identities and API writes stay inside this fixture.
async page => {
  page.setDefaultTimeout(7000)
  await page.clock.setFixedTime(new Date('2026-10-12T04:00:00Z'))
  await page.unroute('**/*')
  await page.addInitScript(() => {
    localStorage.setItem('yh_active_account', 'synthetic-a')
    localStorage.setItem('yh_account_games', JSON.stringify({ 'synthetic-a': '如鸢', 'synthetic-b': '如鸢' }))
    localStorage.setItem('yh_auth', JSON.stringify({ accessToken: 'synthetic-calendar-only', refreshToken: '', userInfo: { id: 'synthetic-completion', userName: '合成验收' } }))
  })
  const errors = [], writes = [], geometry = []
  page.on('pageerror', error => errors.push(error.message))
  const item = (id, title, patch = {}) => ({ id, title, game: '如鸢', category: 'ACTIVITY', source_type: 'MANUAL', start_date: '2026-10-01', end_date: '2026-10-14', ...patch })
  const events = [item('cave-one', '神秘洞窟'), item('cave-two', '神秘洞窟', { start_date: '2026-10-12', end_date: '2026-11-05' }), item('long', '长期活动', { end_date: null })]
  const make = event => ({ event_id: event.id, item: event, subscribed: true, version: 0, completed: false, manual_completed: null, checklist: [{ id: 'stable', title: '原有子项', completed: true }], memo_note: '保留旧备忘' })
  const stores = { 'synthetic-a': events.map(make), 'synthetic-b': [make(events[0])] }
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
    if (!/^(\/v1\/|\/user\/|\/api\/)/.test(path)) return route.continue()
    let data = {}, status = 200
    if (request.method() !== 'GET') {
      if (!path.endsWith('/completion') || request.method() !== 'PUT') throw Error('Unexpected API write: ' + path)
      const body = request.postDataJSON(), id = decodeURIComponent(path.split('/').at(-2))
      const record = stores[body.account_id]?.find(row => row.event_id === id)
      if (!record || record.version !== body.expected_version) throw Error('Fixture ownership/version mismatch')
      if (Object.keys(body).sort().join(',') !== 'account_id,completed,expected_version') throw Error('Completion carried draft fields')
      record.completed = record.manual_completed = body.completed; record.version++
      writes.push({ id, account: body.account_id, completed: body.completed }); data = record
    } else if (path === '/v1/activity-calendar') data = { items: events }
    else if (path === '/v1/accounts') data = [{ id: 'synthetic-a', name: '合成大号', game: '如鸢' }, { id: 'synthetic-b', name: '合成小号', game: '如鸢' }]
    else if (path === '/v1/activity-calendar/private-items') data = { items: [] }
    else if (path.endsWith('/subscriptions/summary')) {
      const records = stores[url.searchParams.get('account_id')] || [], pending = records.filter(row => row.subscribed && !row.completed)
      data = { items: pending.slice(0, 3), total_pending: pending.length, subscribed_count: records.length }
    } else if (path === '/v1/activity-calendar/subscriptions') {
      const records = stores[url.searchParams.get('account_id')] || []
      data = { items: records.filter(row => row.subscribed), unavailable_items: [], subscribed_count: records.length }
    } else if (path.includes('/activity-calendar/subscriptions/')) data = stores[url.searchParams.get('account_id')]?.find(row => row.event_id === decodeURIComponent(path.split('/').at(-1))) || {}
    else if (path === '/user/info') data = { id: 'synthetic-completion', user_name: '合成验收' }
    else if (path.includes('/beta')) {
      const campaign = { campaign_id: 'synthetic', access_mode: 'OPEN', public_state: 'OPEN_REGISTRATION', server_now: new Date().toISOString(), initial_capacity: 10, capacity: 10, reserved_initial: 0, reserved_remaining: 0, granted_count: 1, public_remaining: 9 }
      data = path.endsWith('/me') ? { campaign, enrollment_status: 'ACTIVE', can_use_beta_features: true } : campaign
    } else data = { items: [], records: [], operators: [], unread_count: 0 }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ status_code: status, message: 'success', data }) })
  })
  const base = 'http://127.0.0.1:5173'
  await page.goto(base + '/calendar?scope=mine&view=month&date=2026-10-12')
  const openDay = async () => { await page.locator('.calendar-view-content[aria-busy="false"]').waitFor(); await page.locator('.calendar-month-day[aria-pressed=true]').click(); await page.locator('.calendar-detail-dialog').waitFor() }
  const closeDay = async () => { if (await page.locator('.calendar-detail-dialog').isVisible()) { await page.getByRole('button', { name: '关闭日历详情', exact: true }).click(); await page.locator('.calendar-detail-dialog').waitFor({ state: 'detached' }) } }
  await openDay()
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const value = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, selectHeight: document.querySelector('[aria-label="个人活动状态"]').getBoundingClientRect().height, minButton: Math.min(...[...document.querySelectorAll('.calendar-subscription-actions button')].map(node => node.getBoundingClientRect().height)), bars: document.querySelectorAll('.calendar-month-bar').length }))
    if (value.scrollWidth > width || value.selectHeight < 44 || value.minButton < 44 || !value.bars) throw Error(JSON.stringify(value))
    geometry.push(value)
    await page.screenshot({ path: '.ux/audits/assets/usability-calendar-completion-initial-' + width + '.png' })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const card = () => page.locator('article.calendar-event[data-event-id="cave-one"]')
  await card().getByRole('button', { name: '编辑待办', exact: true }).click()
  await card().getByRole('textbox').fill('未保存草稿')
  if (!await card().getByRole('button', { name: '标记本期完成', exact: true }).isDisabled()) throw Error('Dirty completion is enabled')
  await card().getByRole('textbox').fill('原有子项')
  const statusSelect = page.getByLabel('个人活动状态')
  await card().getByRole('button', { name: '标记本期完成', exact: true }).focus()
  await page.keyboard.press('Enter')
  await card().waitFor({ state: 'detached' })
  if (!await page.evaluate(() => !!document.activeElement.closest('.calendar-detail-dialog'))) throw Error('Removed card lost keyboard focus')
  if (stores['synthetic-a'][1].completed || stores['synthetic-b'][0].completed || stores['synthetic-a'][0].checklist[0].title !== '原有子项') throw Error('Completion crossed period/account or erased draft baseline')
  await closeDay(); await statusSelect.selectOption('completed'); await openDay(); await card().waitFor()
  await page.screenshot({ path: '.ux/audits/assets/usability-calendar-completion-success.png' })
  await page.reload(); await openDay(); await card().waitFor()
  if (await statusSelect.inputValue() !== 'completed') throw Error('URL completion state lost on reload')
  await closeDay(); await page.getByRole('button', { name: '全部活动', exact: true }).click(); await openDay(); await card().waitFor()
  if (!(await card().textContent()).includes('本期已完成')) throw Error('Completed public event disappeared')
  await card().getByRole('button', { name: '撤销完成', exact: true }).click()
  await closeDay(); await page.getByRole('button', { name: '我的日历', exact: true }).click()
  await statusSelect.selectOption('todo'); await openDay(); await card().waitFor()
  for (const view of ['日程', '时间轴', '月历']) {
    await closeDay(); await page.getByRole('button', { name: view, exact: true }).click()
    if (view === '月历') await openDay()
    if (view === '时间轴') await page.locator('.calendar-timeline-bar').filter({ hasText: '神秘洞窟' }).first().click()
    await card().waitFor()
    if (!(await card().textContent()).includes('本期待办')) throw Error('View task status differs')
  }
  await page.goto(base + '/today')
  await page.locator('.today-subscriptions').waitFor()
  if (!(await page.locator('.today-subscriptions').textContent()).includes('3 项活动未完成')) throw Error('Home count missing')
  await page.locator('.today-subscriptions a').first().click(); await card().waitFor()
  if (!page.url().includes('event=cave-one') || !page.url().includes('task=todo')) throw Error('Home deep link missing identity')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 844, height: 390 })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Landscape overflow')
  if (errors.length) throw Error('Runtime errors: ' + errors.join('; '))
  return { geometry, writes, runtimeErrors: errors.length, homeCount: 3, checklistPreserved: true, isolatedAccountsAndPeriods: true }
}
