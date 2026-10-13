import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountYuanStar } from '../public/yuanstar-embed/yuanstar-embed.js'

const workbook = readFileSync('public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx')
let root, handle, serial = 0, pageY, listExtent
const settle = () => new Promise(resolve => setTimeout(resolve, 100))
const fire = (selector, value, type = 'change') => {
  const field = root.querySelector(selector); field.value = value; field.dispatchEvent(new Event(type, { bubbles: true }))
}
const list = () => root.querySelector('#plan-scroll, #current-scroll')
const row = key => [...root.querySelectorAll('[data-summary-group-key]')].find(item => item.dataset.summaryGroupKey === key)
const drill = key => row(key).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
const back = () => root.querySelector('#view-mode-toggle').click()
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

beforeEach(() => {
  pageY = 0; listExtent = 1200
  // JSDOM has no layout: provide only scroll ranges, leaving the real embed's
  // navigation, event handlers, persistence and rendering in control.
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return this === document.body || this === document.documentElement ? 2400 : listExtent } })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 200 } })
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => pageY)
  window.scrollTo = vi.fn(options => { pageY = options.top })
  URL.createObjectURL ||= () => 'blob:navigation'; URL.revokeObjectURL ||= () => {}
})
afterEach(async () => {
  await handle?.dispose(); root?.remove(); handle = null; vi.unstubAllGlobals()
  if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalHeight)
  else delete HTMLElement.prototype.scrollHeight
  if (originalClient) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClient)
  else delete HTMLElement.prototype.clientHeight
})

async function setup(view) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => Uint8Array.from(workbook).buffer })))
  root = document.createElement('div'); root.id = 'product-root'; document.body.append(root)
  const account = { accountId: 'navigation-' + ++serial, displayName: '虚构浏览位置账号 ' + serial, gameVersion: '如鸢' }
  handle = mountYuanStar(root, { embedded: true, hostAccount: account, reviewView: view })
  await handle.setHostAccount(account)
  await handle.applyCloudBusinessSnapshot({ generation: 1, inventory: [
    { starInstanceId: 'a', kind: '主星', name: '天府', quality: '橙', level: 40 },
    { starInstanceId: 'b', kind: '主星', name: '天机', quality: '橙', level: 40 },
    { starInstanceId: 'c', kind: '主星', name: '武曲', quality: '橙', level: 40 }
  ], planTargets: { a: 60, b: 60, c: 60 }, bag: { currentCount: 3, capacity: 100 }, experience: { orange: 1, purple: 2, white: 3 } })
  handle.setActiveTab('review'); await settle()
  root.querySelector('#view-mode-toggle').click(); await settle()
  return account
}

it.each(['bag', 'plan'])('%s: back restores summary, applied filters, selection and original list/page scroll after editing', async view => {
  await setup(view)
  row('主星|天府').click(); await new Promise(resolve => setTimeout(resolve, 250))
  expect(root.querySelector('.summary-row.is-selected').dataset.summaryGroupKey).toBe('主星|天府')
  fire('#kind-filter', '主星'); if (view === 'bag') fire('#quality-filter', '橙'); fire('#name-filter', '天府 武曲', 'input')
  root.querySelector('#apply-filter').click(); await settle()
  list().scrollTop = 430; pageY = 510
  drill('主星|武曲'); await settle()
  list().scrollTop = 23; pageY = 75
  if (view === 'plan') { fire('#growth-current-level', '45', 'input'); root.querySelector('#growth-save').click() }
  else { fire('[data-current-field="level"]', '45', 'input'); root.querySelector('[data-current-field="level"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }
  await settle(); back(); await settle()
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('名称汇总')
  expect(root.querySelector('#kind-filter').value).toBe('主星'); if (view === 'bag') expect(root.querySelector('#quality-filter').value).toBe('橙')
  expect(root.querySelector('#name-filter').value).toBe('天府 武曲'); expect(root.querySelector('#sort-filter').textContent).toBe('名称排序')
  expect(root.querySelector('.summary-row.is-selected').dataset.summaryGroupKey).toBe('主星|武曲')
  expect(list().scrollTop).toBe(430); expect(pageY).toBe(510)
  expect((await handle.getCloudBusinessSnapshot()).inventory.find(star => star.starInstanceId === 'c').level).toBe(45)
})

it('bag and plan retain independent navigation, drill origins, lists and route scroll across switching and full renders', async () => {
  await setup('bag'); list().scrollTop = 420; pageY = 460; drill('主星|武曲'); await settle()
  handle.setReviewView('plan'); await settle(); root.querySelector('#view-mode-toggle').click(); await settle()
  list().scrollTop = 670; pageY = 710; root.querySelector('.growth-route-list').scrollTop = 350
  drill('主星|天机'); await settle(); root.querySelector('.growth-route-list').scrollTop = 380
  back(); await settle(); expect(root.querySelector('.growth-route-list').scrollTop).toBe(380)
  handle.setReviewView('bag'); await settle(); expect(root.querySelector('#view-mode-toggle').textContent).toBe('返回名称汇总')
  back(); await settle(); expect(list().scrollTop).toBe(420); expect(pageY).toBe(460)
  expect(root.querySelector('.summary-row.is-selected').dataset.summaryGroupKey).toBe('主星|武曲')
  handle.setReviewView('plan'); await settle(); expect(list().scrollTop).toBe(670); expect(pageY).toBe(710)
  expect(root.querySelector('.summary-row.is-selected').dataset.summaryGroupKey).toBe('主星|天机')
  expect(root.querySelector('.growth-route-list').scrollTop).toBe(380)
  await handle.applyCloudBusinessSnapshot(await handle.getCloudBusinessSnapshot()); await settle()
  expect(list().scrollTop).toBe(670); expect(pageY).toBe(710); expect(root.querySelector('.growth-route-list').scrollTop).toBe(380)
  handle.setActiveTab('import'); handle.setActiveTab('review'); await settle()
  expect(list().scrollTop).toBe(670); expect(root.querySelector('.growth-route-list').scrollTop).toBe(380)
})

it.each(['bag', 'plan'])('%s: missing group falls back to a valid neighbour and reduced scroll range clamps safely', async view => {
  await setup(view); list().scrollTop = 900; drill('主星|武曲'); await settle()
  const snapshot = await handle.getCloudBusinessSnapshot()
  await handle.applyCloudBusinessSnapshot({ ...snapshot, inventory: snapshot.inventory.filter(star => star.starInstanceId !== 'c'), planTargets: { a: 60, b: 60 }, bag: { currentCount: 2, capacity: 100 } })
  listExtent = 360; back(); await settle()
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('名称汇总')
  expect(root.querySelector('.summary-row.is-selected')).not.toBeNull()
  expect(root.querySelector('.summary-row.is-selected').dataset.summaryGroupKey).not.toBe('主星|武曲')
  expect(list().scrollTop).toBe(160)
  const neighbour = root.querySelector('.summary-row.is-selected').dataset.summaryGroupKey
  drill(neighbour); await settle()
  await handle.applyCloudBusinessSnapshot({ ...snapshot, inventory: [], planTargets: {}, bag: { currentCount: 0, capacity: 100 } }); await settle()
  back(); await settle()
  expect(root.querySelector('.summary-row.is-selected')).toBeNull()
  expect(list()?.scrollTop ?? 0).toBeLessThanOrEqual(160)
})

it('account switch and replacement generation discard old page positions and drill return origins', async () => {
  await setup('plan'); list().scrollTop = 670; drill('主星|天机'); await settle()
  const snapshot = await handle.getCloudBusinessSnapshot()
  await handle.applyCloudBusinessSnapshot({ ...snapshot, generation: 2 }); await settle()
  expect(list().scrollTop).toBe(0); expect(root.querySelector('#view-mode-toggle').textContent).not.toBe('返回名称汇总')
  handle.setReviewView('bag'); await settle(); root.querySelector('#view-mode-toggle').click(); await settle(); list().scrollTop = 470
  await handle.setHostAccount({ accountId: 'navigation-new-' + ++serial, displayName: '新账号', gameVersion: '如鸢' })
  await handle.applyCloudBusinessSnapshot(snapshot); await settle()
  expect(list().scrollTop).toBe(0)
  handle.setReviewView('plan'); await settle(); expect(list().scrollTop).toBe(0)
  expect(root.querySelector('#view-mode-toggle').textContent).not.toBe('返回名称汇总')
})

it.each([
  ['bag', 'arrow'], ['bag', 'keyboard'], ['plan', 'arrow'], ['plan', 'keyboard']
])('%s: %s undo/redo restores the saved drill navigation and positions', async (view, control) => {
  await setup(view)
  list().scrollTop = 430; pageY = 510
  drill('主星|武曲'); await settle()
  list().scrollTop = 25; pageY = 80
  if (view === 'plan') root.querySelector('.growth-route-list').scrollTop = 370
  const history = async direction => {
    if (control === 'arrow') root.querySelector(direction === 'undo' ? '#undo-workspace' : '#redo-workspace').click()
    else {
      root.querySelector('#view-mode-toggle').focus({ preventScroll: true })
      document.dispatchEvent(new KeyboardEvent('keydown', { key: direction === 'undo' ? 'z' : 'y', ctrlKey: true, bubbles: true, cancelable: true }))
    }
    await settle()
  }
  await history('undo')
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('名称汇总')
  expect(root.querySelector('.summary-row.is-selected')?.dataset.summaryGroupKey).toBe('主星|武曲')
  expect(list().scrollTop).toBe(430); expect(pageY).toBe(510)
  if (view === 'plan') expect(root.querySelector('.growth-route-list').scrollTop).toBe(370)
  await history('redo')
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('返回名称汇总')
  expect(list().scrollTop).toBe(25); expect(pageY).toBe(80)
  await history('undo')
  expect(list().scrollTop).toBe(430); expect(pageY).toBe(510)
})

it.each([
  ['bag', 'arrow'], ['bag', 'keyboard'], ['plan', 'arrow'], ['plan', 'keyboard']
])('%s drill history cannot be applied by %s undo on the other page', async (from, control) => {
  await setup(from); list().scrollTop = 430; pageY = 510; drill('主星|武曲'); await settle()
  const target = from === 'bag' ? 'plan' : 'bag'
  handle.setReviewView(target); await settle(); list().scrollTop = 320; pageY = 360
  if (target === 'plan') root.querySelector('.growth-route-list').scrollTop = 370
  const before = { view: root.querySelector('#view-mode-toggle').textContent, filter: root.querySelector('#name-filter').value }
  if (control === 'arrow') root.querySelector('#undo-workspace').click()
  else { root.querySelector('#view-mode-toggle').focus({ preventScroll: true }); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })) }
  await settle()
  expect(root.querySelector('#view-mode-toggle').textContent).toBe(before.view)
  expect(root.querySelector('#name-filter').value).toBe(before.filter)
  expect(root.querySelector('.summary-row.is-selected')).toBeNull()
  expect(list().scrollTop).toBe(320); expect(pageY).toBe(360)
  if (target === 'plan') expect(root.querySelector('.growth-route-list').scrollTop).toBe(370)
  handle.setReviewView(from); await settle(); root.querySelector('#undo-workspace').click(); await settle()
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('名称汇总')
  expect(root.querySelector('.summary-row.is-selected')?.dataset.summaryGroupKey).toBe('主星|武曲')
  expect(list().scrollTop).toBe(430); expect(pageY).toBe(510)
})

it('pure navigation undo and redo remain independent across both pages', async () => {
  await setup('bag'); list().scrollTop = 430; pageY = 510; drill('主星|武曲'); await settle()
  root.querySelector('#undo-workspace').click(); await settle()
  handle.setReviewView('plan'); await settle(); root.querySelector('#view-mode-toggle').click(); await settle()
  list().scrollTop = 620; pageY = 680; drill('主星|天机'); await settle()
  handle.setReviewView('bag'); await settle(); root.querySelector('#redo-workspace').click(); await settle()
  expect(root.querySelector('#name-filter').value).toBe('武曲')
  root.querySelector('#undo-workspace').click(); await settle(); expect(list().scrollTop).toBe(430)
  handle.setReviewView('plan'); await settle(); root.querySelector('#undo-workspace').click(); await settle()
  expect(root.querySelector('.summary-row.is-selected')?.dataset.summaryGroupKey).toBe('主星|天机')
  expect(list().scrollTop).toBe(620); expect(pageY).toBe(680)
  root.querySelector('#redo-workspace').click(); await settle(); expect(root.querySelector('#name-filter').value).toBe('天机')
})

it.each(['bag', 'plan'])('%s business edit still supports undo and redo from the other page', async from => {
  await setup(from); drill('主星|武曲'); await settle()
  const value = async () => { const snapshot = await handle.getCloudBusinessSnapshot(); return from === 'plan' ? snapshot.planTargets.c : snapshot.inventory.find(star => star.starInstanceId === 'c').level }
  const changed = from === 'plan' ? 50 : 45, original = from === 'plan' ? 60 : 40
  if (from === 'plan') { fire('#growth-target-level', '50', 'input'); root.querySelector('#growth-save').click() }
  else { fire('[data-current-field="level"]', '45', 'input'); root.querySelector('[data-current-field="level"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) }
  await settle(); expect(await value()).toBe(changed)
  handle.setReviewView(from === 'plan' ? 'bag' : 'plan'); await settle(); list().scrollTop = 320; pageY = 360
  const view = root.querySelector('#view-mode-toggle').textContent
  root.querySelector('#undo-workspace').click(); await settle()
  expect(await value()).toBe(original)
  expect(root.querySelector('#view-mode-toggle').textContent).toBe(view); expect(list().scrollTop).toBe(320); expect(pageY).toBe(360)
  root.querySelector('#redo-workspace').click(); await settle()
  expect(await value()).toBe(changed)
  expect(root.querySelector('#view-mode-toggle').textContent).toBe(view)
})
