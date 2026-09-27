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
