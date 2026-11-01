// Existing Playwright CLI + existing Vite service only. All identities/API data are synthetic.
// Run in a fresh, non-persistent session opened at about:blank; never attach a user's browser.
async page => {
  const base = 'http://127.0.0.1:5173'
  const output = '.ux/audits/inventory-records-dual-view-20261013'
  page.setDefaultTimeout(6000)
  const record = {
    record_id: 'synthetic-reward:' + 'LongRecordId'.repeat(12), record_type: 'reward_delta', entity_type: 'item',
    effective_at: '2026-10-13T08:00:00Z', stock_effect: 'applied', acquisition_channel: '派遣', stamina_cost: 20,
    entries: [{ id: 'baijinbi', name: '白金币', count: 5 }],
  }
  const agent = { ...record, record_id: 'synthetic-agent:1', entity_type: 'agent',
    entries: [{ id: 'char_001_test', name: '合成密探', count: 2 }] }
  const campaign = { campaign_id: 'synthetic-inventory', access_mode: 'OPEN', public_state: 'OPEN_REGISTRATION',
    server_now: new Date().toISOString(), initial_capacity: 10, capacity: 10, reserved_initial: 0,
    reserved_remaining: 0, granted_count: 1, public_remaining: 9 }
  let rows = [record, agent], deleted = null, failNext = false, holdNext = false, release = null
  let emptyAccounts = false
  const requests = [], findings = [], geometry = [], screenshots = [], errors = [], viewAssertions = []
  const assert = (value, message) => { if (!value) throw Error(message) }
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    if (location.origin !== 'http://127.0.0.1:5173') return
    // 有限的 fulfill 响应会每秒触发真实客户端重连，无法隔离 resize 的副作用。
    const originalFetch = window.fetch
    const streams = window.__inventorySyntheticStreams = { opened: 0, closed: 0 }
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href)
      if (!/\/v1\/accounts\/[^/]+\/events$/.test(url.pathname)) return originalFetch(input, init)
      streams.opened++
      const body = new ReadableStream({ start(controller) {
        controller.enqueue(new TextEncoder().encode(': synthetic open\n\n'))
        init.signal.addEventListener('abort', () => {
          streams.closed++
          controller.error(new DOMException('Synthetic stream closed', 'AbortError'))
        }, { once: true })
      } })
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
    }
    localStorage.clear()
    localStorage.setItem('yh_auth', JSON.stringify({ accessToken: 'synthetic-inventory-only', refreshToken: '',
      userInfo: { id: 'synthetic-inventory', userName: '合成基线' } }))
    localStorage.setItem('yh_active_account', 'synthetic-a')
    localStorage.setItem('yh_account_games', JSON.stringify({ 'synthetic-a': '代号鸢', 'synthetic-b': '代号鸢' }))
    localStorage.setItem('inventory-tabs', 'manifest')
  })
  // Fail closed: only source/assets from this exact local service may pass through.
  // Even an unknown API or external API_BASE is fulfilled/aborted, never sent to a backend.
  await page.route('**/*', async route => {
    const request = route.request(), raw = request.url()
    const path = raw.replace(/^https?:\/\/[^/]+/, '').split('?')[0]
    if (!raw.startsWith(base + '/')) return route.abort()
    if (!/^(\/v1\/|\/user\/|\/api\/|\/open-api\/)/.test(path)) {
      if (request.method() === 'GET' && (/^\/(src|@vite|@id|@fs|node_modules|test-support|maayuan|icons|fonts|assets)\//.test(path) || /\.(js|css|svg|png|webp|ico|woff2?)(\?|$)/.test(raw) || ['/inventory', '/', '/index.html'].includes(path))) return route.continue()
      return route.abort()
    }
    const params = Object.fromEntries((raw.split('?')[1] || '').split('&').filter(Boolean).map(part => part.split('=').map(decodeURIComponent)))
    const method = request.method()
    requests.push({ method, path, params })
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json',
      body: JSON.stringify({ status_code: status, message: status === 200 ? 'success' : '合成读取失败', data }) })
    if (path === '/v1/inventory/records' && method === 'GET') {
      if (holdNext) { holdNext = false; await new Promise(resolve => { release = resolve }) }
      if (failNext) { failNext = false; return reply(null, 500) }
      const filtered = params.account_id === 'synthetic-b' ? [] : rows.filter(row => !params.entity_type || row.entity_type === params.entity_type)
      return reply({ items: params.cursor ? filtered.slice(1) : filtered.slice(0, 1), next_cursor: !params.cursor && filtered.length > 1 ? 'synthetic-page-2' : null })
    }
    if (path === '/v1/inventory/records/' + encodeURIComponent(record.record_id) && method === 'DELETE') {
      assert(params.account_id === 'synthetic-a', 'delete crossed synthetic account')
      deleted = record; rows = rows.filter(row => row.record_id !== record.record_id); return reply(true)
    }
    if (path === '/v1/inventory/records/' + encodeURIComponent(record.record_id) + '/restore' && method === 'POST') {
      assert(params.account_id === 'synthetic-a' && deleted, 'restore crossed account/no backup')
      rows = [deleted, ...rows]; deleted = null; return reply(true)
    }
    if (method !== 'GET') { findings.push('Blocked unexpected write: ' + method + ' ' + path); return route.abort() }
    if (path === '/v1/accounts') return reply(emptyAccounts ? [] : [
      { id: 'synthetic-a', name: '合成账号 A · ' + '长账号名'.repeat(6), game: '代号鸢' },
      { id: 'synthetic-b', name: '合成账号 B', game: '代号鸢' },
    ])
    if (path === '/v1/inventory/catalog') return reply({ entities: [{ id: 'baijinbi', entity_type: 'item', name: '白金币' }] })
    if (path === '/v1/inventory/current') return reply([{ account_id: params.account_id, entity_type: 'item', full_baseline_at: record.effective_at, entries: { baijinbi: { count: 5 } } }])
    if (path === '/v1/operator/catalog') return reply({ operators: [{ id: 'char_001_test', name: '合成密探', rarity: 5, games: ['代号鸢'] }] })
    if (path === '/v1/inventory/agent-favorites') return reply({ agent_ids: [] })
    if (path === '/v1/beta/status') return reply(campaign)
    if (path === '/v1/beta/me') return reply({ campaign, enrollment_status: 'ACTIVE', can_use_beta_features: true })
    if (path === '/v1/admin/access/me') return reply({ roles: [], permissions: [] })
    if (path === '/user/info') return reply({ id: 'synthetic-inventory', user_name: '合成基线' })
    if (path.endsWith('/events')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': synthetic no events\n\n' })
    if (path.includes('/notifications') || path.includes('/changelog')) return reply({ items: [], unread_count: 0 })
    findings.push('Unmodelled read blocked: ' + path)
    return reply(null, 501)
  })
  const panel = page.locator('#inventory-panel-records')
  const refresh = () => panel.getByRole('button', { name: '刷新', exact: true })
  const recordsReads = () => requests.filter(row => row.path === '/v1/inventory/records').length
  const writes = () => requests.filter(row => row.method !== 'GET').length
  const settled = async () => {
    await refresh().waitFor()
    await page.waitForFunction(() => {
      const panel = document.querySelector('#inventory-panel-records')
      return !panel.querySelector('.records-head > button').disabled &&
        !panel.querySelector('.record-del:disabled, .inventory-inline-state button:disabled')
    })
  }
  const screenshot = async name => {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({ path: output + '/' + name + '.png', fullPage: true })
    screenshots.push(name + '.png')
  }
  const core = async () => {
    assert(await panel.isVisible(), 'history panel hidden')
    assert(await panel.locator('.record').count() === 1, 'expected one first-page record')
    const text = await panel.locator('.record').textContent()
    for (const value of ['白金币+5', '已生效', '派遣', '消耗体力 20', record.record_id]) assert(text.includes(value), 'missing field ' + value)
    assert(await panel.getByRole('button', { name: '全部', exact: true }).getAttribute('aria-pressed') === 'true', 'filter changed with viewport')
  }
  const openDetails = async () => {
    const details = panel.locator('.record-details').first()
    if (await details.count() && !await details.evaluate(node => node.open)) await details.locator('summary').click()
  }
  const settleView = () => page.waitForFunction(() => {
    const panel = document.querySelector('#inventory-panel-records')
    return panel.querySelector(innerWidth <= 640 ? '.records-mobile' : '.records-desktop') &&
      panel.querySelectorAll('.record-list').length === 1
  })
  const measure = async label => {
    await settleView()
    const mobile = (await page.viewportSize()).width <= 640
    assert(await panel.locator('.records-mobile').count() === Number(mobile), 'incorrect exclusive view: ' + label)
    assert(await panel.locator('.records-desktop').count() === Number(!mobile), 'incorrect desktop view: ' + label)
    await openDetails()
    viewAssertions.push(label)

    const value = await panel.evaluate(element => ({
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      lists: [...document.querySelectorAll('.record-list')].filter(node => node.getClientRects().length).length,
      controls: [...element.querySelectorAll('button, summary')].filter(node => node.getClientRects().length).map(node => {
        const rect = node.getBoundingClientRect()
        return { name: node.textContent.trim(), width: Math.round(rect.width), height: Math.round(rect.height) }
      }),
      sidebarVisible: !!document.querySelector('.island')?.getClientRects().length,
    }))
    geometry.push({ label, ...value })
    if (value.scrollWidth > value.width) findings.push(label + ': page overflow ' + value.scrollWidth + ' > ' + value.width)
    if (value.lists !== 1) findings.push(label + ': interactive lists ' + value.lists)
    for (const control of value.controls) if (control.width <= 0 || control.height <= 0) findings.push(label + ': empty target ' + JSON.stringify(control))
    const button = panel.locator('.record-del').first()
    await button.scrollIntoViewIfNeeded()
    if (!await button.evaluate(node => { const r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) })) findings.push(label + ': delete obscured')
  }
  try {
    await page.goto(base + '/inventory')
    await page.getByRole('tab', { name: '操作历史', exact: true }).waitFor()
    assert(recordsReads() === 0, 'manifest initialized history prematurely')
    holdNext = true
    await page.getByRole('tab', { name: '操作历史', exact: true }).click()
    await panel.getByText('正在加载记录…', { exact: true }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    await screenshot('loading-390')
    release(); await settled(); await core(); await screenshot('collapsed-390')
    const readsBeforeResize = recordsReads()
    const requestsBeforeResize = requests.length
    const streamsBeforeResize = await page.evaluate(() => ({ ...window.__inventorySyntheticStreams }))
    for (const width of [320, 390, 430, 768, 1024, 1440, 639, 640, 641, 1079, 1080, 1081]) {
      await page.setViewportSize({ width, height: 900 })
      await core(); await measure('success-' + width)
      if ([320, 390, 430, 768, 1024, 1440].includes(width)) await screenshot('success-' + width)
    }
    await page.setViewportSize({ width: 844, height: 390 })
    await core(); await measure('landscape-844x390'); await screenshot('landscape-844x390')
    assert(recordsReads() === readsBeforeResize, 'resize added history requests')
    assert(requests.length === requestsBeforeResize, 'resize added API requests or subscriptions')
    assert(JSON.stringify(await page.evaluate(() => window.__inventorySyntheticStreams)) === JSON.stringify(streamsBeforeResize), 'resize reopened/closed SSE')
    viewAssertions.push('resize: zero API requests and zero SSE open/close')
    await page.setViewportSize({ width: 390, height: 844 })
    await panel.getByRole('button', { name: '加载更多', exact: true }).click(); await settled()
    assert(await panel.locator('.record').count() === 2, 'pagination did not append')
    assert(!await panel.getByRole('button', { name: '加载更多', exact: true }).count(), 'terminal cursor still shows more')
    await screenshot('pagination-390')
    const secondRecord = panel.locator('.record').filter({ hasText: 'synthetic-agent:1' })
    await secondRecord.locator('summary').click()
    await secondRecord.locator('.record-del').focus()
    for (const width of [641, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await settleView()
      await page.waitForFunction(() => document.activeElement?.closest('[data-record-id]')?.dataset.recordId === 'synthetic-agent:1')
      assert(await secondRecord.locator('.record-del').evaluate(node => {
        const rect = node.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= innerHeight
      }), 'pagination focus moved outside viewport')
      assert(await panel.locator('.record').count() === 2, 'resize reset paginated rows')
    }
    viewAssertions.push('second paginated record: focus and scroll reachability across breakpoint')
    for (const [name, entityType] of [['道具', 'item'], ['心纸', 'agent'], ['全部', undefined]]) {
      await panel.getByRole('button', { name, exact: true }).click(); await settled()
      const last = requests.filter(row => row.path === '/v1/inventory/records').at(-1)
      assert(last.params.entity_type === entityType && !last.params.cursor && last.params.limit === '50', 'filter query/cursor mismatch')
    }
    failNext = true
    await refresh().click(); await settled()
    await panel.getByRole('alert').waitFor()
    assert(await panel.locator('.record').count() === 1, 'refresh failure erased content')
    await screenshot('refresh-error-390')
    await panel.getByRole('button', { name: '重试加载', exact: true }).click(); await settled(); await core()
    await openDetails()
    const deleteButton = panel.locator('.record-del').first()
    const beforeFocusResize = recordsReads()
    await deleteButton.focus()
    for (const width of [641, 640, 1440, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await settleView()
      await page.waitForFunction(() => document.activeElement?.matches('.record-del'))
      assert(await deleteButton.isVisible(), 'focused delete hidden after view change')
      assert(await deleteButton.evaluate(node => {
        const rect = node.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= innerHeight
      }), 'focused delete outside viewport')
    }
    assert(recordsReads() === beforeFocusResize, 'focus resize added reads')
    viewAssertions.push('semantic focus across desktop/mobile')
    const beforeCancel = writes()
    await deleteButton.click()
    const dialog = page.getByRole('dialog', { name: '删除库存记录？', exact: true })
    await dialog.waitFor()
    assert((await dialog.textContent()).includes('合成账号 A'), 'confirmation lacks account')
    assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'dialog focus outside')
    const beforeConfirmResize = recordsReads()
    for (const width of [768, 1440, 390]) {
      await page.setViewportSize({ width, height: 844 })
      await settleView()
      assert(await dialog.isVisible() && await dialog.evaluate(node => node.contains(document.activeElement)), 'resize lost confirmation/focus')
    }
    assert(recordsReads() === beforeConfirmResize && writes() === beforeCancel, 'confirmation resize requested/wrote data')
    for (let n = 0; n < 5; n++) { await page.keyboard.press('Tab'); assert(await dialog.evaluate(node => node.contains(document.activeElement)), 'Tab escaped dialog') }
    await screenshot('delete-confirm-390')
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
    assert(writes() === beforeCancel, 'Escape wrote data')
    assert(await deleteButton.evaluate(node => node === document.activeElement), 'Escape lost trigger focus')
    await deleteButton.click(); await dialog.getByRole('button', { name: '删除记录', exact: true }).click()
    await panel.getByRole('button', { name: '撤销删除', exact: true }).waitFor(); await settled()
    assert(writes() === beforeCancel + 1, 'delete write count')
    await screenshot('deleted-390')
    await panel.getByRole('button', { name: '撤销删除', exact: true }).click(); await settled()
    await core(); assert(writes() === beforeCancel + 2, 'restore write count')
    await screenshot('restored-390')
    rows = [{ ...record, record_type: 'future', entity_type: 'future', effective_at: null,
      stock_effect: undefined, acquisition_channel: 'VeryLongSource'.repeat(30), stamina_cost: undefined,
      entries: [{ id: 'LongItemId'.repeat(30), count: 1 }] }]
    await refresh().click(); await settled()
    for (const width of [320, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await measure('long-unknown-' + width)
      for (const value of ['未知类型（future）', '未知对象（future）', '时间未提供', 'LongItemId', record.record_id]) {
        assert((await panel.locator('.record').textContent()).includes(value), 'unsafe missing/unknown field: ' + value)
      }
    }
    viewAssertions.push('long summary/source/ID and missing optional fields at all six widths')
    await page.setViewportSize({ width: 390, height: 844 })
    await screenshot('long-unknown-390')
    rows = []; await refresh().click(); await settled()
    await panel.getByText('还没有库存变更记录', { exact: true }).waitFor(); await screenshot('empty-390')
    rows = [record, agent]; failNext = true
    await refresh().click(); await settled()
    await panel.getByRole('alert').waitFor(); await screenshot('initial-error-390')
    await panel.getByRole('button', { name: '重试加载', exact: true }).click(); await settled(); await core()
    const beforeSwitch = writes()
    for (const name of ['合成账号 B', '合成账号 A']) {
      await page.locator('.account-switcher > button').click()
      await page.locator('.switch-option').filter({ hasText: name }).click()
      await settled()
      const last = requests.filter(row => row.path === '/v1/inventory/records').at(-1)
      assert(last.params.account_id === (name.endsWith('B') ? 'synthetic-b' : 'synthetic-a') && !last.params.cursor, 'switch used stale account/cursor')
      if (name.endsWith('B')) await panel.getByText('还没有库存变更记录', { exact: true }).waitFor()
      else await core()
    }
    assert(writes() === beforeSwitch, 'account switch wrote inventory')
    emptyAccounts = true
    await page.reload()
    await page.getByText('请选择游戏账号', { exact: true }).waitFor(); await screenshot('no-account-390')
    assert(!errors.length, 'runtime errors: ' + errors.join('; '))
    assert(!findings.length, 'geometry/request findings: ' + findings.join('; '))
    return { evidence: 'Chromium + synthetic identity/API; not real authenticated mobile E2E', geometry, findings, screenshots,
      requests, runtimeErrors: errors, viewAssertions, writes: writes(), coreAssertions: 'passed' }
  } finally {
    if (release) release()
    await page.goto('about:blank')
  }
}
