import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('根页面不掩盖横向溢出，关键页面与弹窗为动态视口提供回退', () => {
  const main = read('src/styles/main.css')
  assert.doesNotMatch(main.match(/body\s*\{[^}]+\}/)?.[0] || '', /overflow-x\s*:\s*hidden/)

  for (const file of [
    'src/styles/main.css',
    'src/styles/feedback-workspace.css',
    'src/pages/today/index.vue',
    'src/pages/star/index.vue',
    'src/pages/inventory/index.vue',
    'src/components/beta/BetaCommunityDialog.vue',
    'src/components/feedback/AdminFeedbackMergeDialog.vue'
  ]) {
    const source = read(file)
    assert.match(source, /100vh/, `${file} 应保留旧浏览器回退`)
    assert.match(source, /100dvh/, `${file} 应使用动态视口高度`)
  }
})

test('库存分区编辑提示在窄屏内居中，避免透明提示撑宽整页', () => {
  const inventory = read('src/pages/inventory/index.vue')
  const mobileRule = inventory.match(/@media \(max-width: 640px\) \{\s*\.subsection-edit::after,[\s\S]*?\n\}/)?.[0] || ''
  assert.match(mobileRule, /left:\s*50%/)
  assert.match(mobileRule, /transform:\s*translateX\(-50%\)/)
  assert.match(mobileRule, /max-width:\s*min\(220px, calc\(100vw - 32px\)\)/)
})

test('账房底栏可见的整个平板区间都有底部留白', () => {
  const main = read('src/styles/main.css')
  assert.match(main, /@media \(min-width:1081px\)\{\.cart-mbar\{display:none\}\}/)
  assert.match(main, /@media \(max-width:1080px\)\{\.cart-main\{padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)\}\}/)
  assert.doesNotMatch(main, /@media \(max-width:767px\)[\s\S]*?\.cart-main\{padding-bottom:/)
})

test('窄屏账房筛选项保持可滚动且不会缩成小于 44px 的按钮', () => {
  const main = read('src/styles/main.css')
  assert.match(main, /\.cart-filters \.row\{[^}]*overflow-x:auto/)
  assert.match(main, /\.cart-filters \.chip\{[^}]*flex:none;min-width:44px/)
  assert.match(main, /\.initial-row input\{[^}]*min-height:44px/)
  assert.match(main, /\.mbtn\.icon\{[^}]*min-width:44px/)
})

test('主要小控件的交互命中区达到 44px', () => {
  const targets = [
    ['src/pages/beta/index.vue', '.beta-interest'],
    ['src/components/AccountEventToasts.vue', '.account-event-toast button'],
    ['src/components/AccountWorkspace.vue', '.account-soft-option'],
    ['src/components/DataAccountContextBar.vue', '.context-action'],
    ['src/pages/notifications/index.vue', '.ntf-read-btn'],
    ['src/styles/feedback-workspace.css', '.feedback-status-tabs button'],
    ['src/pages/inventory/index.vue', '.agent-menu-options button'],
    ['src/pages/star/index.vue', '.star-tabs button'],
    ['src/pages/install/index.vue', '.platform-tabs button']
  ]
  for (const [file, selector] of targets) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const rule = read(file).match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1]
    assert.ok(rule, `${file}: ${selector} 缺少样式`)
    assert.match(rule, /(?:min-height|height):\s*44px/, `${file}: ${selector} 命中区高度不足`)
  }
})
