// Run with an isolated playwright-cli session against the existing development service.
// Every API response and identity below is synthetic; this test never writes real user data.
async page => {
  page.setDefaultTimeout(5000)
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const add = n => new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
  const official = { id: 'official-synthetic', source_type: 'MANUAL', game: '如鸢', title: '官方活动（合成验收）', category: 'ACTIVITY', subtype: 'LARGE_EVENT', start_date: today, end_date: add(5) }
  let rows = [{ id: 'pci_00000000-0000-0000-0000-000000000001', account_id: 'synthetic-a', game: '如鸢', title: '私人事项：' + '长内容'.repeat(25), start_date: add(-40), end_date: add(40), time: '14:30', note: '私人纯文本说明\n' + '很长的中文及LongUnbrokenText'.repeat(20), version: 0, created_at: today + 'T00:00:00Z', updated_at: today + 'T00:00:00Z' }]
  let serial = 2
  await page.addInitScript(() => {
    localStorage.setItem('yh_auth', JSON.stringify({ accessToken: 'synthetic-private-only', refreshToken: '', userInfo: { id: 'synthetic-private', userName: '合成测试' } }))
    localStorage.setItem('yh_active_account', 'synthetic-a')
    localStorage.setItem('yh_account_games', JSON.stringify({ 'synthetic-a': '如鸢', 'synthetic-b': '代号鸢' }))
  })
  await page.unroute('**/*')
  await page.route('**/*', async route => {
    const request = route.request(), raw = request.url(), path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    const hostname = raw.match(/^https?:\/\/([^:/]+)/)?.[1]
    const params = Object.fromEntries((raw.split('?')[1] || '').split('&').filter(Boolean).map(part => part.split('=').map(decodeURIComponent)))
    const get = key => params[key] || ''
    if (!['localhost', '127.0.0.1'].includes(hostname)) return route.abort()
    if (!/^(\/v1\/|\/user\/|\/api\/)/.test(path)) return route.continue()
    let data = {}
    if (path === '/v1/admin/access/me') data = { roles: ['ACTIVITY_CALENDAR_EDITOR'], permissions: ['activity_calendar:write'] }
    else if (path === '/v1/accounts') data = [{ id: 'synthetic-a', name: '合成验收账号' + '很长的名字'.repeat(5), game: '如鸢' }, { id: 'synthetic-b', name: '合成小号', game: '代号鸢' }]
    else if (path === '/v1/activity-calendar') data = { items: [official].filter(value => (!get('game') || value.game === get('game')) && value.start_date <= get('to') && value.end_date >= get('from')) }
    else if (path === '/v1/activity-calendar/subscriptions') data = { items: get('account_id') === 'synthetic-a' ? [{ event_id: official.id, subscribed: true, version: 0, completed: false, checklist: [], item: official }] : [], unavailable_items: [], subscribed_count: get('account_id') === 'synthetic-a' ? 1 : 0 }
    else if (path.startsWith('/v1/activity-calendar/private-items')) {
      const id = path.split('/')[4]
      if (request.method() === 'POST') {
        const body = request.postDataJSON()
        data = { ...body, id: 'pci_00000000-0000-0000-0000-' + String(serial++).padStart(12, '0'), game: body.account_id === 'synthetic-a' ? '如鸢' : '代号鸢', version: 0, created_at: today + 'T00:00:00Z', updated_at: today + 'T00:00:00Z' }; rows.push(data)
      } else if (request.method() === 'PUT') {
        const body = request.postDataJSON(); const previous = rows.find(value => value.id === id)
        data = { ...previous, ...body, version: previous.version + 1 }; rows = rows.map(value => value.id === id ? data : value)
      } else if (request.method() === 'DELETE') { rows = rows.filter(value => value.id !== id); data = true }
      else if (id) data = rows.find(value => value.id === id)
      else data = { items: rows.filter(value => value.account_id === get('account_id') && (value.start_date || value.date) <= get('to') && (value.end_date || value.date) >= get('from')) }
    } else if (path === '/user/info') data = { id: 'synthetic-private', user_name: '合成测试' }
    else if (path.includes('/notifications') || path.includes('/changelog')) data = { items: [], unread_count: 0 }
    else if (path.includes('/beta')) data = { has_access: true, access: true }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status_code: 200, message: 'success', data }) })
  })
  await page.goto('http://localhost:5173/calendar?scope=mine&view=month&ref=private-verification')
  await page.locator('.calendar-day-detail .calendar-private-actions').waitFor()
  const results = []
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [view, name] of [['agenda', '日程'], ['timeline', '时间轴'], ['month', '月历']]) {
      await page.getByRole('button', { name, exact: true }).click()
      await page.locator('.calendar-view-content[aria-busy="false"]').waitFor()
      if (view === 'timeline') {
        const bar = page.locator('.calendar-timeline-bar[data-type-color="tea"]')
        if (await bar.count() !== 1 || !await bar.evaluate(el => el.style.gridColumn.includes('span 35') && el.classList.contains('is-clipped-start') && el.classList.contains('is-clipped-end'))) throw Error('range bar/clipping')
        await bar.click()
      }
      const geometry = await page.evaluate(() => ({
        width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        privateCards: document.querySelectorAll('.calendar-private-actions').length,
        controls: [...document.querySelectorAll('.calendar-private-actions button, .calendar-private-add')].map(el => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height })),
      }))
      if (geometry.scrollWidth > width || geometry.privateCards !== 1 || geometry.controls.some(el => el.w < 44 || el.h < 44)) throw Error(JSON.stringify(geometry))
      if (view === 'month' && await page.locator('.calendar-month-day[aria-label*="事项"]').count() < 35) throw Error('missing daily coverage')
      results.push({ view, width, pass: true })
    }
    await page.getByRole('button', { name: '添加私人事项', exact: true }).click()
    const modal = page.locator('.calendar-private-dialog')
    await modal.waitFor()
    if (await page.locator('#private-item-start_date').inputValue() !== today || await page.locator('#private-item-end_date').inputValue() !== today) throw Error('defaults')
    const geometry = await modal.evaluate(el => ({
      top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom,
      focused: document.activeElement.id, overflow: el.scrollWidth > el.clientWidth,
      inputs: [...el.querySelectorAll('input[type=date]')].map(input => input.getBoundingClientRect().width),
    }))
    if (geometry.top < 0 || geometry.bottom > 900 || geometry.overflow || geometry.focused !== 'private-item-title-input' || geometry.inputs.some(w => w < 100)) throw Error(JSON.stringify(geometry))
    await page.keyboard.press('Shift+Tab')
    if (!await page.evaluate(() => !!document.activeElement.closest('.calendar-private-dialog'))) throw Error('focus trap')
    await page.keyboard.press('Escape')
    await modal.waitFor({ state: 'detached' })
    if (!await page.getByRole('button', { name: '添加私人事项', exact: true }).evaluate(el => el === document.activeElement)) throw Error('focus restoration')
    results.push({ width, editor: true, pass: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '添加私人事项', exact: true }).click()
  const modal = page.locator('.calendar-private-dialog'), start = page.locator('#private-item-start_date'), end = page.locator('#private-item-end_date')
  await page.locator('#private-item-title-input').fill('跨月计划（合成验收）')
  await start.fill(add(2))
  if (await end.inputValue() !== add(2)) throw Error('new default end sync')
  await end.fill(add(4)); await start.fill(add(5))
  if (await end.inputValue() !== add(4) || !await modal.getByRole('button', { name: '保存', exact: true }).isDisabled()) throw Error('explicit end overwritten')
  await page.getByText('结束日期不能早于开始日期。', { exact: true }).last().waitFor()
  await start.fill(add(-10)); await end.fill(add(10))
  await page.locator('#private-item-time').fill('09:30')
  await modal.locator('summary').click(); await page.locator('#private-item-note').fill('保留原说明')
  await modal.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  if (await end.inputValue() !== add(10)) throw Error('unsaved range lost')
  for (const [width, height] of [[320, 360], [390, 360], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await end.focus()
    await end.evaluate(el => el.scrollIntoView({ block: 'nearest' }))
    const geometry = await modal.evaluate(el => {
      const body = el.querySelector('form'), footer = el.querySelector('footer').getBoundingClientRect(), input = el.querySelector('#private-item-end_date').getBoundingClientRect()
      return { overflow: document.documentElement.scrollWidth > innerWidth, footerBottom: footer.bottom, height: innerHeight, inputTop: input.top, inputBottom: input.bottom, bodyTop: body.getBoundingClientRect().top, footerTop: footer.top }
    })
    if (geometry.overflow || geometry.footerBottom > height || geometry.inputTop < geometry.bodyTop - 1 || geometry.inputBottom > geometry.footerTop + 1) throw Error(JSON.stringify(geometry))
    results.push({ width, height, shortViewport: true, pass: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const url = page.url()
  await modal.getByRole('button', { name: '保存', exact: true }).click(); await modal.waitFor({ state: 'detached' })
  if (page.url() !== url) throw Error('URL changed')
  await page.reload()
  const card = page.locator('.calendar-event').filter({ hasText: '跨月计划（合成验收）' })
  await card.waitFor()
  if (!(await card.textContent()).includes('开始日 09:30')) throw Error('start-time semantics')
  await card.getByRole('button', { name: '编辑事项', exact: true }).click()
  if (await start.inputValue() !== add(-10) || await end.inputValue() !== add(10) || await page.locator('#private-item-note').inputValue() !== '保留原说明') throw Error('edit refill')
  await start.fill(add(11))
  if (await end.inputValue() !== add(10) || !await modal.getByRole('button', { name: '保存', exact: true }).isDisabled()) throw Error('existing range changed silently')
  await start.fill(today); await end.fill(today)
  await modal.getByRole('button', { name: '保存', exact: true }).click(); await modal.waitFor({ state: 'detached' })
  if (!(await card.textContent()).includes(today + ' · 09:30')) throw Error('collapse')
  await card.getByRole('button', { name: '删除事项', exact: true }).click(); await page.getByRole('button', { name: '保留', exact: true }).click()
  await card.getByRole('button', { name: '删除事项', exact: true }).click(); await page.getByRole('button', { name: '删除', exact: true }).click()
  await card.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '全部活动', exact: true }).click()
  if (await page.locator('.calendar-private-actions').count()) throw Error('public leak')
  return { mode: 'real SFC + synthetic API, no real writes', results, journey: 'create range, inline validation, preserve explicit end, unsaved protection, save, refresh, edit refill, collapse, delete, public isolation', pass: true }
}
