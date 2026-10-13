// Existing Vite service only; synthetic components, no account/API writes or real-device claims.
// playwright-cli -s=recruitment-focus run-code --filename=test-support/recruitmentFocus.browser.js
async (page) => {
  const stage = new URL(page.url()).searchParams.get('recruitment-check') || 'development'
  await page.goto('http://127.0.0.1:5173/login')
  await page.locator('#login-email').waitFor()
  await page.evaluate(async () => {
    const { createApp, h, ref } = await import('/node_modules/.vite/deps/vue.js')
    const Timeline = (await import('/src/pages/recruitment/RecruitmentTimeline.vue')).default
    const Editor = (await import('/src/pages/recruitment/PoolEditor.vue')).default
    const Dialog = (await import('/src/components/AppDialog.vue')).default
    const { recruitmentFixture, recruitmentCatalog, recruitmentEvent } = await import('/test-support/recruitment.js')
    document.querySelector('#app').__vue_app__.unmount()
    const pool = recruitmentFixture().pools[0], catalog = recruitmentCatalog().pools
    const agents = [{ id: 'a', name: '合成案例·非常长的密探名字甲乙丙丁', rarity: 5, games: ['代号鸢'] }]
    const records = Array.from({ length: 90 }, (_, index) => ({ ...recruitmentEvent('record-' + index, index % 2 ? 40 : 17), agent_snapshot: { agent_id: 'a', name: agents[0].name }, sort_order: index }))
    const pools = Array.from({ length: 18 }, (_, index) => ({ ...pool, pool_id: 'pool-' + index }))
    const root = document.querySelector('#app')
    createApp({ setup() {
      const open = ref(false), timeline = ref(null), selected = ref(pools[12])
      window.__recruitmentRerender = () => { selected.value = { ...selected.value } }
      return () => h('main', { style: 'max-width:960px;margin:auto;padding:16px' }, [
        h(Timeline, { ref: timeline, pools, catalog, agents, onSelect: id => {
          timeline.value.focusPool(id); selected.value = pools.find(item => item.pool_id === id); open.value = true
        } }),
        h(Editor, { open: open.value, pool: selected.value, records, recordsRevision: 3, catalog, agents, canRecord: true, onClose: () => { open.value = false } }),
        h(Dialog),
      ])
    } }).mount(root)
  })
  const settle = () => page.waitForTimeout(250)
  const measure = () => page.evaluate(() => ({
    windowY: scrollY, bodyY: document.querySelector('.editor-body')?.scrollTop ?? null,
    active: document.activeElement.className, eventId: document.activeElement.closest('[data-event-id]')?.dataset.eventId ?? null,
    width: innerWidth, pageWidth: document.documentElement.scrollWidth,
    bodyWidth: document.querySelector('.editor-body')?.clientWidth, bodyScrollWidth: document.querySelector('.editor-body')?.scrollWidth,
  }))
  const card = page.locator('.pool-card').nth(12)
  await card.scrollIntoViewIfNeeded()
  const beforeOpen = await measure()
  await card.click()
  await settle()
  const opened = await measure()
  await page.locator('.close-button').click()
  await settle()
  const closed = await measure()
  await card.click()
  await settle()
  await page.evaluate(() => window.scrollBy(0, innerHeight * 2))
  const beforeOffscreenClose = await measure()
  await page.keyboard.press('Escape')
  await settle()
  const offscreenClosed = await measure()
  await card.click()
  await settle()
  await page.getByRole('button', { name: '密探视图', exact: true }).click()
  const item = page.locator('[data-event-id="record-45"] .agent-record-detail')
  await item.scrollIntoViewIfNeeded()
  const beforeEdit = await measure()
  await item.click()
  await settle()
  const editing = await measure()
  await page.evaluate(() => window.__recruitmentRerender())
  await settle()
  if (!await page.locator('.pull-count-field input').evaluate(node => node === document.activeElement && node.value === '40')) throw Error('Parent rerender lost the input')
  const actionsVisible = await page.locator('.composer-actions').evaluate(node => {
    const body = node.closest('.editor-body').getBoundingClientRect(), actions = node.getBoundingClientRect()
    return actions.top >= body.top && actions.bottom <= body.bottom && [...node.querySelectorAll('button')].every(button => button.getBoundingClientRect().height >= 44)
  })
  if (!actionsVisible) throw Error('Record actions are obscured or too small')
  await page.locator('.composer-actions button').filter({ hasText: /^取消$/ }).click()
  await settle()
  const cancelled = await measure()
  await item.click()
  await settle()
  await page.locator('.pull-count-field input').fill('23')
  await page.locator('.composer-actions .primary').click()
  await settle()
  const completed = await measure()
  await item.click()
  await settle()
  const deleting = await measure()
  await page.getByRole('button', { name: '删除记录', exact: true }).click()
  await settle()
  const deleted = await measure()
  await page.screenshot({ path: '.ux/audits/recruitment-' + stage + '-' + deleted.width + '.png' })
  const report = { stage, beforeOpen, opened, closed, beforeOffscreenClose, offscreenClosed, beforeEdit, editing, actionsVisible, cancelled, completed, deleting, deleted }
  await page.evaluate(value => { window.__recruitmentReport = value }, report)
  if (closed.active !== 'pool-card') throw Error('Close did not restore the pool entry')
  if (Math.abs(closed.windowY - beforeOpen.windowY) > 2) throw Error('Close moved the page')
  if (Math.abs(offscreenClosed.windowY - beforeOffscreenClose.windowY) > 2 || offscreenClosed.active !== 'pool-card') throw Error('Offscreen close moved the page')
  if (cancelled.eventId !== 'record-45' || completed.eventId !== 'record-45') throw Error('Cancel/complete lost the edited record')
  if (Math.abs(cancelled.bodyY - beforeEdit.bodyY) > 2 || Math.abs(completed.bodyY - beforeEdit.bodyY) > 2) throw Error('Cancel/complete lost the list viewport')
  if (deleted.eventId !== 'record-44') throw Error('Delete did not select the nearest surviving record')
  if (await page.locator('[data-event-id]').count() !== 89) throw Error('Repeated agent records were merged')
  if (deleted.pageWidth > deleted.width || deleted.bodyScrollWidth > deleted.bodyWidth + 1) throw Error('Horizontal overflow')
  return report
}
