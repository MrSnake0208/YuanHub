import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 浮层层级回归契约。
// 背景：管理端“反馈工单详情”本身就是 z-index 90 的全屏遮罩，从它内部打开的
// “合并反馈”复用了全局 .modal-mask（z-index 60），于是被详情遮罩整个压住，
// 弹窗不可见也不可交互。这里把层级刻度固化成可执行契约，避免以后再散落成魔数。
const root = new URL('../', import.meta.url)
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8')

const mainCss = read('src/styles/main.css')
const workspace = read('src/components/feedback/FeedbackTicketWorkspace.vue')
const mergeDialog = read('src/components/feedback/AdminFeedbackMergeDialog.vue')
const appDialog = read('src/components/AppDialog.vue')

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `缺少 ${selector} 样式契约`)
  return match[1]
}

// 只接受 var(--z-*) 或 var(--z-*, 数值)：浮层 z-index 必须引用刻度变量。
// 同一选择器可能出现在多处（例如 .modal-mask 另有动画声明），取真正声明 z-index 的那条。
function zIndexRef(source, selector, name) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const blocks = [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((match) => match[1])
  assert.ok(blocks.length, `缺少 ${selector} 样式契约`)
  const declaring = blocks.find((block) => /z-index\s*:/.test(block))
  assert.ok(declaring, `${name} 必须显式声明 z-index`)
  const match = declaring.match(/z-index\s*:\s*var\(\s*(--z-[\w-]+)\s*(?:,\s*(\d+)\s*)?\)/)
  assert.ok(match, `${name} 的 z-index 必须引用浮层刻度变量`)
  return { token: match[1], fallback: match[2] ? Number(match[2]) : null, name }
}

function zIndexScale() {
  const scale = {}
  for (const [, token, value] of cssBlock(mainCss, ':root').matchAll(/(--z-[\w-]+)\s*:\s*(\d+)/g)) {
    scale[token] = Number(value)
  }
  return scale
}

function resolve(ref, scale) {
  assert.ok(ref.token in scale, `:root 未登记层级变量 ${ref.token}（${ref.name}）`)
  if (ref.fallback !== null) {
    assert.equal(ref.fallback, scale[ref.token], `${ref.token} 的降级值必须与刻度一致`)
  }
  return scale[ref.token]
}

test('浮层层级刻度单调递增，二级弹窗高于其宿主弹窗', () => {
  const scale = zIndexScale()
  const ordered = ['--z-overlay', '--z-overlay-panel', '--z-overlay-raised', '--z-overlay-blocking']
  for (const token of ordered) assert.ok(token in scale, `:root 必须登记 ${token}`)
  for (let index = 1; index < ordered.length; index += 1) {
    const lower = ordered[index - 1]
    const upper = ordered[index]
    assert.ok(
      scale[lower] < scale[upper],
      `层级刻度必须单调递增：${lower}(${scale[lower]}) < ${upper}(${scale[upper]})`
    )
  }
})

test('全局遮罩、工单详情与阻断式对话框统一引用层级刻度', () => {
  const scale = zIndexScale()
  const refs = [
    zIndexRef(mainCss, '.modal-mask', '一级弹窗遮罩'),
    zIndexRef(mainCss, '.modal-mask.is-raised', '二级弹窗遮罩'),
    zIndexRef(workspace, '.ticket-detail-mask', '反馈工单详情遮罩'),
    zIndexRef(appDialog, '.dialog-mask', '阻断式对话框遮罩')
  ]

  assert.equal(refs[0].token, '--z-overlay')
  assert.equal(refs[1].token, '--z-overlay-raised')
  assert.equal(refs[2].token, '--z-overlay-panel')
  assert.equal(refs[3].token, '--z-overlay-blocking')
  for (const ref of refs) resolve(ref, scale)
})

test('合并反馈弹窗作为二级弹窗必须压在反馈工单详情之上', () => {
  const scale = zIndexScale()
  assert.match(
    mergeDialog,
    /class="modal-mask is-raised"/,
    '合并反馈遮罩必须带 is-raised，使用二级弹窗层级'
  )
  const mergeZ = resolve(zIndexRef(mainCss, '.modal-mask.is-raised', '合并反馈遮罩'), scale)
  const detailZ = resolve(zIndexRef(workspace, '.ticket-detail-mask', '反馈工单详情遮罩'), scale)
  assert.ok(mergeZ > detailZ, `合并反馈(${mergeZ}) 必须高于工单详情(${detailZ})`)
})

test('普通浮层低于遮罩和阻断对话框，Toast 与跳转链接有登记层级', () => {
  const scale = zIndexScale()
  const ordered = [
    '--z-content-raised', '--z-sticky', '--z-popover', '--z-overlay',
    '--z-banner', '--z-overlay-panel', '--z-overlay-raised',
    '--z-overlay-blocking', '--z-toast', '--z-progress', '--z-skip-link'
  ]
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(scale[ordered[index - 1]] < scale[ordered[index]], `${ordered[index - 1]} 必须低于 ${ordered[index]}`)
  }
  assert.equal(zIndexRef(read('src/components/AccountEventToasts.vue'), '.account-event-toasts', '事件通知').token, '--z-toast')
  assert.equal(zIndexRef(read('src/components/beta/BetaCommunityDialog.vue'), '.community-mask', '内测交流弹窗').token, '--z-overlay-panel')
  assert.equal(zIndexRef(read('src/pages/operator/index.vue'), '.disc-floating-tooltip', '密探浮动提示').token, '--z-popover')
})

test('高层浮层不再使用未登记的数字 z-index', () => {
  const src = fileURLToPath(new URL('../src/', import.meta.url))
  const scale = zIndexScale()
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const name = path.join(dir, item.name)
      if (item.isDirectory()) walk(name)
      else if (/\.(?:vue|css)$/.test(name)) {
        const source = fs.readFileSync(name, 'utf8')
        for (const match of source.matchAll(/z-index\s*:\s*(\d+)\b/g)) {
          assert.ok(Number(match[1]) < 10, `${path.relative(src, name)} 存在未登记 z-index: ${match[1]}`)
        }
        for (const match of source.matchAll(/z-index\s*:\s*var\(\s*(--z-[\w-]+)/g)) {
          assert.ok(match[1] in scale, `${path.relative(src, name)} 引用了未登记层级 ${match[1]}`)
        }
      }
    }
  }
  walk(src)
})
