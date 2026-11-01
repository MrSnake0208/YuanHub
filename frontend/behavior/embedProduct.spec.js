import 'fake-indexeddb/auto'
import { IDBObjectStore } from 'fake-indexeddb'
import { setImmediate as waitForTask } from 'node:timers/promises'
import { Blob as CloneableBlob, File as CloneableFile } from 'node:buffer'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { loadAndImportStarCapture, STAR_CAPTURE_IMPORT_SUPERSEDED_CODE } from '../src/pages/star/captureTransport.js'
import { createStarCaptureLifecycle, importAndMarkStarCapture } from '../src/pages/star/starCaptureLifecycle.js'
import { recognitionTutorialSteps, resolveTutorialTargets } from '../src/pages/star/recognitionTutorial.js'
import { bagTutorialSteps } from '../src/pages/star/bagTutorial.js'

// 本文件直接执行 vendored embed 产物（public/yuanstar-embed/yuanstar-embed.js），
// 而不是断言它的字符串。之前的 provenance 测试只做子串匹配：即使 capture_game_mismatch
// 守卫仍在、或待养成视图完全失效，它也能通过。
const EMBED = '../public/yuanstar-embed/yuanstar-embed.js'
const ACCOUNT = { accountId: 'acc-embed-probe', displayName: '嵌入探针账号', gameVersion: '如鸢' }

let mountYuanStar

beforeAll(async () => {
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:embed-probe'
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}
  window.scrollTo = () => {}
  ;({ mountYuanStar } = await import(EMBED))
}, 60000)

function pngFile(name) {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
}

// 宿主 captureTransport.js 组装出的批次结构：三段完整采集 + 全局 sourceOrder。
function captureBatch(gameVersion) {
  let order = 0
  const section = (count, stopReason) => ({
    images: Array.from({ length: count }, () => {
      order += 1
      return { sourceImageId: 'img-' + order, sourceOrder: order, file: pngFile('img-' + order + '.png') }
    }),
    adjacentRelations: [],
    complete: true,
    stopReason,
  })
  return {
    schemaVersion: 1,
    captureId: 'capture-embed-probe',
    source: 'maayuan',
    gameVersion,
    sections: {
      main: section(1, 'bottom_no_move'),
      support: section(1, 'bottom_no_move'),
      experience: section(1, 'single_capture'),
    },
  }
}

const businessSnapshot = {
  generation: 1,
  revision: 1,
  inventory: [
    { starInstanceId: 'star-a', kind: '主星', name: '天府', quality: '橙', level: 30 },
    { starInstanceId: 'star-b', kind: '主星', name: '武曲', quality: '紫', level: 20 },
    { starInstanceId: 'star-c', kind: '辅星', name: '文昌', quality: '蓝', level: 10 },
  ],
  // 只有天府需要继续养成：targetLevel > level。
  planTargets: { 'star-a': 60, 'star-b': 20, 'star-c': 10 },
  experience: { orange: 10, purple: 20, white: 30 },
  bag: { currentCount: 100, capacity: 200 },
}

async function mountEmbed(options = {}) {
  const root = document.createElement('div')
  root.id = 'product-root'
  document.body.appendChild(root)
  const handle = mountYuanStar(root, { assetBaseUrl: '/yuanstar-embed/', embedded: true, hostAccount: ACCOUNT, ...options })
  await new Promise((resolve) => setTimeout(resolve, 250))
  return { root, handle }
}

// 逐行读取养成计划五列；背包整理不再有重复计划表或首列复选框。
function planRows(root) {
  const planPanel = root.querySelector('.growth-inventory')
  return [...planPanel.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()),
  )
}

describe('vendored YuanStar embed behavior', () => {
  it('single bag table follows the same instance, preserves scroll and deleting clears the editor', async () => {
    const { root, handle } = await mountEmbed()
    const inventory = Array.from({ length: 25 }, (_, index) => ({ starInstanceId: 'follow-' + index, kind: '主星', name: '天府', level: 60 - index * 2, quality: '橙' }))
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function () {
      return this.matches('tr[data-star-id]') ? 30 + [...this.parentElement.children].indexOf(this) * 32 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLTableSectionElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 30 })
    // JSDOM has no layout; keep the real anchored editor inside its viewport.
    vi.spyOn(HTMLInputElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 200, top: 300, right: 320, bottom: 332, width: 120, height: 32 })
    const settle = () => new Promise(resolve => setTimeout(resolve, 200))
    const selected = pane => root.querySelector(`#${pane}-rows .is-selected, #${pane}-rows .is-counterpart`)
    const level = () => root.querySelector('[data-current-field="level"]')
    try {
      await handle.applyCloudBusinessSnapshot({ ...businessSnapshot, inventory, planTargets: {} })
      handle.setActiveTab('review'); await settle()
      root.querySelector('[data-star-id="follow-0"][data-pane="current"]').click(); await settle()
      expect(selected('current').dataset.starId).toBe('follow-0')
      expect(level().readOnly).toBe(true)
      level().click()
      const picker = () => document.querySelector('.yuanstar-level-picker')
      picker().querySelector('[data-level-value]').click()
      const direct = picker().querySelector('[data-level-direct]')
      direct.value = '48'; direct.dispatchEvent(new Event('input', { bubbles: true }))
      picker().querySelector('[data-level-close]').click(); await settle()
      expect((await handle.getCloudBusinessSnapshot()).inventory.find(star => star.starInstanceId === 'follow-0').level).toBe(60)
      expect(level().value).toBe('60')
      level().click(); picker().querySelector('[data-level-value]').click()
      const firstEdit = picker().querySelector('[data-level-direct]')
      firstEdit.value = '48'; firstEdit.dispatchEvent(new Event('input', { bubbles: true }))
      picker().querySelector('[data-level-confirm]').click(); await settle()
      expect((await handle.getCloudBusinessSnapshot()).inventory.find(star => star.starInstanceId === 'follow-0').level).toBe(48)
      root.querySelector('#add-current-row').click(); await settle()
      const id = selected('current').dataset.starId
      expect(id).not.toBe('follow-0')
      expect(root.querySelector('#plan-rows')).toBeNull()
      expect((await handle.getCloudBusinessSnapshot()).inventory).toHaveLength(26)
      const index = [...root.querySelectorAll('#current-rows tr')].indexOf(selected('current'))
      expect(root.querySelector('#current-scroll').scrollTop).toBe((index - 4) * 32)
      level().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      picker().querySelector('[data-level-value]').click()
      const edit = picker().querySelector('[data-level-direct]')
      edit.value = '57'; edit.dispatchEvent(new Event('input', { bubbles: true }))
      expect((await handle.getCloudBusinessSnapshot()).inventory.find(star => star.starInstanceId === id).level).toBe(48)
      picker().querySelector('[data-level-confirm]').click(); await settle()
      expect(picker()).toBeNull()
      expect((await handle.getCloudBusinessSnapshot()).inventory.find(star => star.starInstanceId === id).level).toBe(57)
      expect(selected('current').dataset.starId).toBe(id)
      expect(root.querySelector('#current-scroll').scrollTop).toBe(0)
      root.querySelector('#current-scroll').scrollTop = 99
      const quality = root.querySelector('[data-current-field="quality"]')
      quality.value = '紫'; quality.dispatchEvent(new Event('change', { bubbles: true }))
      quality.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle()
      expect(root.querySelector('#current-scroll').scrollTop).toBe(99)
      root.querySelector('#delete-current-row').click(); await settle()
      expect(selected('current')).toBeNull(); expect(selected('plan')).toBeNull()
      expect(root.querySelector('.current-editor').textContent).toContain('选择一颗星石以编辑当前背包。')
      expect(root.querySelector('[data-current-field]')).toBeNull()
      expect((await handle.getCloudBusinessSnapshot()).inventory.some(star => star.starInstanceId === id)).toBe(false)
    } finally {
      await handle.applyCloudBusinessSnapshot({ ...businessSnapshot, inventory: [], planTargets: {}, experience: { orange: null, purple: null, white: null }, bag: { currentCount: null, capacity: null } })
      await handle.dispose(); vi.restoreAllMocks()
    }
  }, 60000)
  it('tutorial status reads loaded history without changing data and exposes the renamed UI', async () => {
    const { root, handle } = await mountEmbed()
    try {
      handle.setActiveTab('import')
      expect(handle.getRecognitionTutorialStatus()).toEqual({ ready: true, hasHistory: false })
      expect(root.textContent).toContain('主星池重复行标记')
      expect(root.textContent).toContain('辅星池重复行标记')
      expect(root.textContent).not.toContain('重叠校验')
      await handle.applyCloudBusinessSnapshot({ ...businessSnapshot, inventory: [], planTargets: {} })
      const before = await handle.getCloudBusinessSnapshot()
      expect(handle.getRecognitionTutorialStatus()).toEqual({ ready: true, hasHistory: true })
      expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
      handle.setActiveTab('review')
      expect(root.querySelector('.review-page').getAttribute('aria-label')).toBe('背包整理')
      expect(root.querySelector('#ocr-review-title').textContent).toBe('识别结果核对')
    } finally {
      await handle.applyCloudBusinessSnapshot({ ...businessSnapshot, inventory: [], planTargets: {}, experience: { orange: null, purple: null, white: null }, bag: { currentCount: null, capacity: null } })
      await handle.dispose()
    }
  }, 60000)
  it('does not initialize OCR on embedded mount and reports shared tab changes', async () => {
    const worker = vi.fn(function () { throw new Error('unexpected background OCR initialization') })
    vi.stubGlobal('Worker', worker)
    let handle
    const tabs = []
    try {
      ;({ handle } = await mountEmbed({ onActiveTabChange: (tab) => tabs.push(tab) }))
      expect(worker).not.toHaveBeenCalled()
      handle.setActiveTab('review')
      expect(handle.getActiveTab()).toBe('review')
      expect(tabs.at(-1)).toBe('review')
      handle.setActiveTab('import')
      expect(handle.getActiveTab()).toBe('import')
      expect(tabs.at(-1)).toBe('import')
    } finally {
      await handle?.dispose()
      vi.unstubAllGlobals()
    }
  }, 60000)

  it('accepts a cross-version CaptureBatch but still rejects an illegal gameVersion', async () => {
    const { handle } = await mountEmbed()
    // 批次 gameVersion 与工作区（如鸢）不同：合法值必须放行，不能再抛 capture_game_mismatch。
    await expect(handle.importCaptureBatch(captureBatch('代号鸢'))).resolves.not.toThrow()
    // 非法值仍然被拒绝，错误码保持稳定。
    await expect(handle.importCaptureBatch(captureBatch('无名版本'))).rejects.toMatchObject({ code: 'capture_game_invalid' })
    await handle.dispose()
  }, 60000)

  it('filters the plan inventory to pending stars and shows the pending/total split', async () => {
    const { root, handle } = await mountEmbed()
    await handle.applyCloudBusinessSnapshot(businessSnapshot)
    handle.setActiveTab('review')
    await new Promise((resolve) => setTimeout(resolve, 200))

    handle.setReviewView('plan')

    // 养成目标列使用「当前等级→目标等级」，仅 targetLevel > level 的行才显示箭头。
    expect(planRows(root)).toEqual([
      ['主星', '天府', '30→60', '橙', '共1颗'],
      ['主星', '武曲', '20', '紫', '共1颗'],
      ['辅星', '文昌', '10', '蓝', '共1颗'],
    ])

    // 每次状态变化都会重渲染面板，因此每次都重新取当前复选框节点。
    const pendingToggle = () => root.querySelector('.pending-only-toggle input')
    expect(pendingToggle()).toBeTruthy()
    expect(pendingToggle().checked).toBe(false)

    pendingToggle().click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(pendingToggle().checked).toBe(true)
    // targetLevel === level 的武曲与辅星文昌被过滤掉，只剩天府。
    expect(planRows(root)).toEqual([['主星', '天府', '30→60', '橙', '待养 1 / 共 1']])

    pendingToggle().click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(pendingToggle().checked).toBe(false)
    expect(planRows(root)).toHaveLength(3)
    await handle.dispose()
  }, 60000)
})

describe('vendored OCR prewarming', () => {
  let sequence = 0
  // IDB transactions use real task turns even while OCR timeout timers are fake.
  async function settleDom(predicate) {
    for (let turn = 0; turn < 100 && !predicate(); turn++) { await waitForTask(); await vi.advanceTimersByTimeAsync(0) }
  }

  async function clockedEmbed({ stalled = false, recoverOnRetry = false, account: restoredAccount } = {}) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // fake-indexeddb uses Node structuredClone, which cannot clone jsdom Blob internals.
    vi.stubGlobal('Blob', CloneableBlob)
    vi.stubGlobal('File', CloneableFile)
    const workers = []
    vi.stubGlobal('Worker', vi.fn(function () {
      const worker = {
        requests: [], terminated: false,
        postMessage(request) {
          this.requests.push(request)
          if (stalled && request.operation === 'initialize' && (!recoverOnRetry || workers.length === 1)) return
          queueMicrotask(() => this.onmessage?.({ data: {
            version: 1, requestId: request.requestId, operation: request.operation, ok: true,
            result: request.operation === 'initialize' ? { schemaVersion: '1.0', models: [] } : null,
            diagnostics: { executionBackend: 'dedicated_worker', state: request.operation === 'dispose' ? 'disposed' : 'ready', lastRequest: null, network: { requestCount: 0, externalRequestCount: 0, containsUserDataCount: 0 } },
          } }))
        },
        terminate() { this.terminated = true },
      }
      workers.push(worker)
      return worker
    }))
    const account = restoredAccount ?? { ...ACCOUNT, accountId: 'acc-prewarm-' + (++sequence), displayName: 'Prewarm ' + sequence }
    const root = document.createElement('div')
    root.id = 'product-root'
    document.body.appendChild(root)
    const handle = mountYuanStar(root, { assetBaseUrl: '/yuanstar-embed/', embedded: true, hostAccount: account })
    try { await handle.setHostAccount(account) }
    catch (error) { await cleanup({ handle, root }); throw error }
    return { root, handle, workers, account }
  }

  async function cleanup(embed) {
    try { await embed?.handle.dispose() }
    finally {
      embed?.root.remove()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  }

  function importManual(root, entrance, files = [pngFile('first-screenshot.png')]) {
    if (entrance === 'select') {
      const input = root.querySelector('#image-file-input')
      Object.defineProperty(input, 'files', { value: files })
      input.dispatchEvent(new Event('change', { bubbles: true }))
    } else {
      const event = new Event(entrance, { bubbles: true, cancelable: true })
      Object.defineProperty(event, entrance === 'drop' ? 'dataTransfer' : 'clipboardData', { value: { files, items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })) } })
      ;(entrance === 'drop' ? root.querySelector('#file-drop-zone') : document).dispatchEvent(event)
    }
  }

  async function storedDraft(accountId) {
    const request = indexedDB.open('yuanstar-static')
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    try {
      const tx = db.transaction(['importDrafts', 'importDraftImages'], 'readonly')
      const result = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      const done = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error) })
      const [draft, images] = await Promise.all([result(tx.objectStore('importDrafts').get(accountId)), result(tx.objectStore('importDraftImages').getAll())])
      await done
      return { draft, images: await Promise.all(images.filter(image => image.accountId === accountId).map(async ({ blob, ...metadata }) => ({ ...metadata, bytes: [...new Uint8Array(await blob.arrayBuffer())] }))) }
    } finally { db.close() }
  }

  it('first three-image Blob failure preserves the original diagnostic and retries the retained Files across remount', async () => {
    let embed, put
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      embed = await clockedEmbed()
      const decode = vi.fn(async () => { throw new Error('synthetic image has no pixels') })
      vi.stubGlobal('createImageBitmap', decode)
      const original = IDBObjectStore.prototype.put
      const error = new DOMException('injected first Blob quota failure', 'QuotaExceededError')
      put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
        if (this.name === 'importDraftImages') throw error
        return original.apply(this, args)
      })
      const files = ['main.png', 'support.png', 'experience.png'].map(pngFile)
      importManual(embed.root, 'select', files)
      await settleDom(() => embed.root.querySelector('[data-retry-import-draft]'))
      expect(embed.root.querySelector('.import-error').textContent).toContain('存储空间不足')
      expect(warning).toHaveBeenCalledWith('[Import Draft]', { phase: 'save', name: error.name, message: error.message, code: error.code })
      expect(warning).toHaveBeenCalledTimes(1)
      expect(decode).not.toHaveBeenCalled()
      expect(await storedDraft(embed.account.accountId)).toEqual({ draft: undefined, images: [] })
      put.mockRestore()
      embed.root.querySelector('[data-retry-import-draft]').click()
      await settleDom(() => !embed.root.querySelector('[data-retry-import-draft]') && !embed.root.querySelector('.is-classifying'))
      const saved = await storedDraft(embed.account.accountId)
      expect(saved.draft.images.map(image => image.filename)).toEqual(files.map(file => file.name))
      expect(saved.images).toHaveLength(3)
      expect(saved.images.every(image => image.bytes.join() === '137,80,78,71')).toBe(true)
      expect(decode).toHaveBeenCalledTimes(3)
      const account = embed.account
      await cleanup(embed)
      embed = await clockedEmbed({ account })
      expect(embed.root.querySelector('#file-summary').textContent).toContain('3 张')
      expect(await storedDraft(account.accountId)).toEqual(saved)
    } finally { put?.mockRestore(); warning.mockRestore(); await cleanup(embed) }
  }, 60000)

  it.each(['blob', 'metadata'])('append %s write failure rolls back the whole transaction and protects another account', async failure => {
    let embed, put
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      embed = await clockedEmbed()
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      const first = embed.account
      const before = await storedDraft(first.accountId)
      const second = { ...first, accountId: first.accountId + '-other', displayName: first.displayName + ' Other' }
      await embed.handle.setHostAccount(second)
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      const otherBefore = await storedDraft(second.accountId)
      await embed.handle.setHostAccount(first)
      const original = IDBObjectStore.prototype.put
      let writes = 0
      put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
        if ((failure === 'metadata' && this.name === 'importDrafts') || (failure === 'blob' && this.name === 'importDraftImages' && ++writes === 2)) throw new DOMException('injected append transaction failure', 'UnknownError')
        return original.apply(this, args)
      })
      importManual(embed.root, 'select', ['append-1.png', 'append-2.png'].map(pngFile))
      await settleDom(() => embed.root.querySelector('[data-retry-import-draft]'))
      expect(embed.root.querySelector('[data-retry-import-draft]')).toBeTruthy()
      expect(await storedDraft(first.accountId)).toEqual(before)
      expect(await storedDraft(second.accountId)).toEqual(otherBefore)
      put.mockRestore()
      embed.root.querySelector('[data-retry-import-draft]').click()
      await settleDom(() => !embed.root.querySelector('[data-retry-import-draft]') && !embed.root.querySelector('.is-classifying'))
      expect((await storedDraft(first.accountId)).images).toHaveLength(5)
      expect(await storedDraft(second.accountId)).toEqual(otherBefore)
    } finally { put?.mockRestore(); warning.mockRestore(); await cleanup(embed) }
  }, 60000)

  it('clearing a failed first save discards retained Files and cannot resurrect them in another account or remount', async () => {
    let embed, put
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      embed = await clockedEmbed()
      const first = embed.account
      const original = IDBObjectStore.prototype.put
      put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
        if (this.name === 'importDraftImages') throw new Error('injected first save failure')
        return original.apply(this, args)
      })
      importManual(embed.root, 'select')
      await settleDom(() => embed.root.querySelector('[data-retry-import-draft]'))
      put.mockRestore()
      embed.root.querySelector('[data-clear-import-images]').click()
      await settleDom(() => !embed.root.querySelector('[data-retry-import-draft]'))
      expect(await storedDraft(first.accountId)).toEqual({ draft: undefined, images: [] })
      await embed.handle.setHostAccount({ ...first, accountId: first.accountId + '-after-clear', displayName: first.displayName + ' Cleared' })
      expect(embed.root.querySelector('#file-summary').textContent).toContain('0 张')
      await cleanup(embed)
      embed = await clockedEmbed({ account: first })
      expect(embed.root.querySelector('#file-summary').textContent).toContain('0 张')
    } finally { put?.mockRestore(); warning.mockRestore(); await cleanup(embed) }
  }, 60000)

  it.each(['clear', 'replace', 'account switch'])('late classification after %s cannot overwrite the current Draft or another account', async action => {
    let embed, rejectDecode
    try {
      embed = await clockedEmbed()
      const first = embed.account
      const pending = new Promise((resolve, reject) => { rejectDecode = reject })
      const decode = vi.fn(() => pending)
      vi.stubGlobal('createImageBitmap', decode)
      importManual(embed.root, 'select')
      await settleDom(() => decode.mock.calls.length > 0)
      expect(decode).toHaveBeenCalledTimes(1)
      let active = first
      if (action === 'clear') {
        embed.root.querySelector('[data-clear-import-images]').click()
        await settleDom(() => embed.root.querySelector('#file-summary').textContent.includes('0 张'))
        expect(embed.root.querySelector('#file-summary').textContent).toContain('0 张')
      } else {
        if (action === 'account switch') {
          active = { ...first, accountId: first.accountId + '-late', displayName: first.displayName + ' Late' }
          await embed.handle.setHostAccount(active)
        }
        await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      }
      const before = await storedDraft(active.accountId)
      const firstBefore = await storedDraft(first.accountId)
      rejectDecode(new Error('late classification failure'))
      await waitForTask(); await vi.advanceTimersByTimeAsync(0)
      expect(await storedDraft(active.accountId)).toEqual(before)
      expect(await storedDraft(first.accountId)).toEqual(firstBefore)
      expect(embed.root.querySelector('[data-retry-import-draft]')).toBeNull()
      expect(embed.root.querySelector('#file-summary').textContent).toContain(action === 'clear' ? '0 张' : '3 张')
    } finally { rejectDecode?.(new Error('test cleanup')); await cleanup(embed) }
  }, 60000)

  it('step tutorial targets resolve against the actual vendored import and bag workspaces', async () => {
    let embed
    try {
      embed = await clockedEmbed()
      embed.handle.setActiveTab('import')
      expect((await embed.handle.getRecognitionTutorialStatus()).ready).toBe(true)
      expect(embed.root.querySelector(recognitionTutorialSteps[0].target)).toBeTruthy()
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      await vi.advanceTimersByTimeAsync(200)
      expect(embed.root.querySelectorAll('.thumbnail-card.is-confirmed')).toHaveLength(3)
      for (const step of recognitionTutorialSteps) expect(embed.root.querySelector(step.target), step.id).toBeTruthy()
      // Actual product confirmation modal takes priority over guidance.
      embed.root.querySelector('[data-start-ocr]').click()
      await settleDom(() => embed.root.querySelector('[data-confirm-start-ocr]'))
      expect(embed.root.querySelector('[role="dialog"]')).toBeTruthy()
      embed.root.querySelector('[data-cancel-ocr-confirm]').click()
      embed.handle.setActiveTab('review')
      expect(embed.root.querySelector(bagTutorialSteps[0].target)?.textContent).toContain('识别结果核对')
      for (const step of bagTutorialSteps) {
        const target = embed.root.querySelector(step.target)
        expect(target, step.id).toBeTruthy()
        target.getBoundingClientRect = () => ({ left: 20, top: 80, right: 220, bottom: 180, width: 200, height: 100 })
        expect(resolveTutorialTargets(embed.root, step, 844).primary, step.id).toBe(target)
      }
      expect(embed.root.querySelector(bagTutorialSteps[1].target).classList.contains('bag-inventory')).toBe(true)
      expect(embed.root.querySelector(bagTutorialSteps[2].target).getAttribute('aria-label')).toBe('筛选与视图')
      expect(embed.root.querySelector(bagTutorialSteps[3].target).textContent).toContain('当前经验星曜')
      expect(embed.root.querySelector(bagTutorialSteps[4].target).textContent).toContain('选择一颗星石')
    } finally { await cleanup(embed) }
  }, 60000)

  it('waits ten seconds after initial render, then gives initialize its full 300 seconds', async () => {
    let embed
    try {
      embed = await clockedEmbed({ stalled: true })
      expect(embed.root.querySelector('#page-content')).toBeTruthy()
      expect(embed.workers).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(9999)
      expect(embed.workers).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(embed.workers).toHaveLength(1)
      expect(embed.workers[0].requests.map((request) => request.operation)).toEqual(['initialize'])
      await vi.advanceTimersByTimeAsync(299999)
      expect(embed.workers[0].terminated).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(embed.workers[0].terminated).toBe(true)
      expect(embed.workers).toHaveLength(1)
      // The second automatic trigger must not retry a prewarm that already timed out.
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      expect(embed.workers).toHaveLength(1)
    } finally { await cleanup(embed) }
  }, 60000)

  it.each(['select', 'drop', 'paste', 'capture'])('prewarms on first %s images before the deadline without duplication', async (entrance) => {
    let embed
    try {
      embed = await clockedEmbed()
      await vi.advanceTimersByTimeAsync(3000)
      if (entrance === 'capture') await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      else importManual(embed.root, entrance)
      await vi.advanceTimersByTimeAsync(0)
      expect(embed.workers).toHaveLength(1)
      expect(embed.workers[0].requests.filter((request) => request.operation === 'initialize')).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(7000)
      expect(embed.workers).toHaveLength(1)
      expect(embed.workers[0].requests.filter((request) => request.operation === 'initialize')).toHaveLength(1)
    } finally { await cleanup(embed) }
  }, 60000)

  it('does not initialize twice when images arrive after delayed prewarm', async () => {
    let embed
    try {
      embed = await clockedEmbed()
      await vi.advanceTimersByTimeAsync(10000)
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      importManual(embed.root, 'select')
      await vi.advanceTimersByTimeAsync(0)
      expect(embed.workers).toHaveLength(1)
      expect(embed.workers[0].requests.filter((request) => request.operation === 'initialize')).toHaveLength(1)
    } finally { await cleanup(embed) }
  }, 60000)

  it('counts the full timeout from first images at three seconds', async () => {
    let embed
    try {
      embed = await clockedEmbed({ stalled: true })
      await vi.advanceTimersByTimeAsync(3000)
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      await vi.advanceTimersByTimeAsync(299999)
      expect(embed.workers).toHaveLength(1)
      expect(embed.workers[0].terminated).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(embed.workers[0].terminated).toBe(true)
    } finally { await cleanup(embed) }
  }, 60000)

  it('prewarms restored pending images and cancels the timer on unmount', async () => {
    let embed
    try {
      embed = await clockedEmbed()
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      const account = embed.account
      await cleanup(embed)
      embed = await clockedEmbed({ account })
      await vi.advanceTimersByTimeAsync(0)
      expect(embed.workers).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(10000)
      expect(embed.workers).toHaveLength(1)
    } finally { await cleanup(embed) }

    try {
      embed = await clockedEmbed()
      await embed.handle.dispose()
      await vi.advanceTimersByTimeAsync(10000)
      expect(embed.workers).toHaveLength(0)
    } finally { await cleanup(embed) }
  }, 60000)

  it('accepts the actual legacy embed only after its complete Draft is persisted', async () => {
    let embed
    try {
      embed = await clockedEmbed()
      const current = { accountId: embed.account.accountId, captureId: 'capture-embed-probe', batch: captureBatch('如鸢') }
      const lifecycle = createStarCaptureLifecycle(localStorage)
      expect(await importAndMarkStarCapture({
        lifecycle, accountId: current.accountId, captureId: current.captureId, isCurrent: () => true,
        importCapture: () => loadAndImportStarCapture({}, current, embed.handle, () => {}, () => true),
      })).toBe(true)
      expect(lifecycle.get(current.accountId)).toMatchObject({ captureId: current.captureId, state: 'imported' })
      expect(embed.root.querySelector('#file-summary').textContent).toContain('3 张')
    } finally { await cleanup(embed) }
  }, 60000)

  it('a same-account concurrent replacement cannot turn an undefined verdict into imported', async () => {
    let embed
    try {
      embed = await clockedEmbed()
      const current = { accountId: embed.account.accountId, captureId: 'capture-embed-probe', batch: captureBatch('如鸢') }
      const lifecycle = createStarCaptureLifecycle(localStorage)
      const first = importAndMarkStarCapture({
        lifecycle, accountId: current.accountId, captureId: current.captureId, isCurrent: () => true,
        importCapture: () => loadAndImportStarCapture({}, current, embed.handle, () => {}, () => true),
      }).catch(error => error)
      await embed.handle.importCaptureBatch({ ...captureBatch('如鸢'), captureId: 'capture-replacement' })
      expect(await first).toMatchObject({ code: STAR_CAPTURE_IMPORT_SUPERSEDED_CODE })
      expect(lifecycle.get(current.accountId)).toBeNull()
      expect(lifecycle.captureAction(current.accountId, current.captureId)).toBe('import')
    } finally { await cleanup(embed) }
  }, 60000)

  it('a manual retry after initialization timeout creates one fresh worker and reaches analysis', async () => {
    // jsdom has no layout scrolling; the browser implementation is exercised separately.
    HTMLElement.prototype.scrollIntoView = vi.fn()
    let embed
    try {
      embed = await clockedEmbed({ stalled: true, recoverOnRetry: true })
      await embed.handle.importCaptureBatch(captureBatch('如鸢'))
      await vi.advanceTimersByTimeAsync(300000)
      expect(embed.workers).toHaveLength(1)
      expect(embed.workers[0].terminated).toBe(true)
      // Use the product's real validation and explicit OCR confirmation flow.
      embed.root.querySelector('[data-start-ocr]').click()
      await vi.advanceTimersByTimeAsync(0)
      await settleDom(() => embed.root.querySelector('[data-confirm-start-ocr]'))
      const confirm = embed.root.querySelector('[data-confirm-start-ocr]')
      expect(confirm).not.toBeNull()
      confirm.click()
      await vi.advanceTimersByTimeAsync(0)
      await settleDom(() => embed.workers[1]?.requests.some(request => request.operation === 'analyzeImage'))
      expect(embed.workers).toHaveLength(2)
      expect(embed.workers[1].requests.filter(request => request.operation === 'initialize')).toHaveLength(1)
      expect(embed.workers[1].requests.some(request => request.operation === 'analyzeImage')).toBe(true)
      // The mock has no OCR detections: this proves retry/initialization, not OCR correctness.
    } finally { await cleanup(embed) }
  }, 60000)

  it('unmount during stalled initialization terminates the worker and ignores late replies', async () => {
    let embed
    try {
      embed = await clockedEmbed({ stalled: true })
      await vi.advanceTimersByTimeAsync(10000)
      const worker = embed.workers[0]
      const initialize = worker.requests.find(request => request.operation === 'initialize')
      await embed.handle.dispose()
      expect(worker.terminated).toBe(true)
      expect(embed.root.childElementCount).toBe(0)
      worker.onmessage?.({ data: { ...initialize, ok: true, result: { schemaVersion: '1.0', models: [] } } })
      await vi.advanceTimersByTimeAsync(300000)
      expect(embed.workers).toHaveLength(1)
      expect(embed.root.childElementCount).toBe(0)
    } finally { await cleanup(embed) }
  }, 60000)
})
