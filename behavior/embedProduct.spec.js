import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'

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

async function mountEmbed() {
  const root = document.createElement('div')
  root.id = 'product-root'
  document.body.appendChild(root)
  const handle = mountYuanStar(root, { assetBaseUrl: '/yuanstar-embed/', embedded: true, hostAccount: ACCOUNT })
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

    // 养成目标列使用「当前等级 → 目标等级」，仅 targetLevel > level 的行才显示箭头。
    expect(planRows(root)).toEqual([
      ['主星', '天府', '30 → 60', '橙', '本组共 1 颗'],
      ['主星', '武曲', '20', '紫', '本组共 1 颗'],
      ['辅星', '文昌', '10', '蓝', '本组共 1 颗'],
    ])

    // 每次状态变化都会重渲染面板，因此每次都重新取当前复选框节点。
    const pendingToggle = () => root.querySelector('.pending-only-toggle input')
    expect(pendingToggle()).toBeTruthy()
    expect(pendingToggle().checked).toBe(false)

    pendingToggle().click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(pendingToggle().checked).toBe(true)
    // targetLevel === level 的武曲与辅星文昌被过滤掉，只剩天府。
    expect(planRows(root)).toEqual([['主星', '天府', '30 → 60', '橙', '待养 1 / 共 1']])

    pendingToggle().click()
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(pendingToggle().checked).toBe(false)
    expect(planRows(root)).toHaveLength(3)
    await handle.dispose()
  }, 60000)
})
