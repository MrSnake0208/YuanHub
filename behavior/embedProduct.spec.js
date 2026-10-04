import 'fake-indexeddb/auto'
import { Blob as CloneableBlob, File as CloneableFile } from 'node:buffer'
import { beforeAll, describe, expect, it, vi } from 'vitest'

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

// 逐行取单元格文本（跳过首列复选框），比整行 textContent 更精确。
function planRows(root) {
  const planPanel = root.querySelectorAll('.inventory-panel')[1]
  return [...planPanel.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].slice(1).map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()),
  )
}

describe('vendored YuanStar embed behavior', () => {
  it('new sorted instance follows in both panes, editing follows same ID, unchanged order keeps scroll and deleting clears selection', async () => {
    const { root, handle } = await mountEmbed()
    const inventory = Array.from({ length: 25 }, (_, index) => ({ starInstanceId: 'follow-' + index, kind: '主星', name: '天府', level: 60 - index * 2, quality: '橙' }))
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function () {
      return this.matches('tr[data-star-id]') ? 30 + [...this.parentElement.children].indexOf(this) * 32 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000)
    vi.spyOn(HTMLTableSectionElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 30 })
    const settle = () => new Promise(resolve => setTimeout(resolve, 200))
    const selected = pane => root.querySelector(`#${pane}-rows .is-selected, #${pane}-rows .is-counterpart`)
    const level = () => root.querySelector('[data-current-field="level"]')
    try {
      await handle.applyCloudBusinessSnapshot({ ...businessSnapshot, inventory, planTargets: {} })
      handle.setActiveTab('review'); await settle()
      root.querySelector('[data-star-id="follow-0"][data-pane="plan"]').click(); await settle()
      expect(selected('current').dataset.starId).toBe('follow-0')
      level().value = '48'; level().dispatchEvent(new Event('input', { bubbles: true }))
      root.querySelector('#add-current-row').click(); await settle()
      const id = selected('current').dataset.starId
      expect(id).not.toBe('follow-0')
      expect(selected('plan').dataset.starId).toBe(id)
      expect((await handle.getCloudBusinessSnapshot()).inventory).toHaveLength(26)
      const index = [...root.querySelectorAll('#current-rows tr')].indexOf(selected('current'))
      expect(root.querySelector('#current-scroll').scrollTop).toBe((index - 4) * 32)
      expect(root.querySelector('#plan-scroll').scrollTop).toBe((index - 4) * 32)
      level().value = '57'; level().dispatchEvent(new Event('input', { bubbles: true }))
      level().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle()
      expect(selected('current').dataset.starId).toBe(id)
      expect(root.querySelector('#current-scroll').scrollTop).toBe(0)
      for (const pane of ['current', 'plan']) root.querySelector(`#${pane}-scroll`).scrollTop = 99
      const quality = root.querySelector('[data-current-field="quality"]')
      quality.value = '紫'; quality.dispatchEvent(new Event('change', { bubbles: true }))
      quality.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle()
      expect(root.querySelector('#current-scroll').scrollTop).toBe(99)
      root.querySelector('#delete-current-row').click(); await settle()
      expect(selected('current')).toBeNull(); expect(selected('plan')).toBeNull()
      expect(root.querySelector('.current-editor')).toBeNull()
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

  async function clockedEmbed({ stalled = false, account: restoredAccount } = {}) {
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
          if (stalled && request.operation === 'initialize') return
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

  function importManual(root, entrance) {
    const files = [pngFile('first-screenshot.png')]
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
})
