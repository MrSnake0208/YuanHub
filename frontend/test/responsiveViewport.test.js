import { readSource } from '../test-support/readSource.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import postcss from 'postcss'

const read = (path) => readSource(new URL(`../${path}`, import.meta.url))

test('根页面不掩盖横向溢出，关键页面与弹窗为动态视口提供回退', () => {
  const main = read('src/styles/main.css')
  assert.doesNotMatch(main.match(/body\s*\{[^}]+\}/)?.[0] || '', /overflow-x\s*:\s*hidden/)

  for (const file of [
    'src/styles/main.css',
    'src/styles/feedback-workspace.css',
    'src/pages/star/index.vue',
    'src/pages/inventory/index.vue',
    'src/components/beta/BetaCommunityDialog.vue',
    'src/components/feedback/AdminFeedbackMergeDialog.vue'
  ]) {
    const source = read(file)
    assert.match(source, /100vh/, `${file} 应保留旧浏览器回退`)
    assert.match(source, /100dvh/, `${file} 应使用动态视口高度`)
  }
  // Today inherits the global main fallback; its scoped rule overrides only dvh.
  assert.match(main, /main\s*\{[^}]*min-height:\s*100vh;\s*min-height:\s*100dvh/)
  assert.match(read('src/components/today/TodayLayout.vue'), /<main[^>]*class="today-main"/)
  assert.match(read('src/components/today/TodayLayout.vue'), /\.today-main\s*\{[^}]*min-height:\s*100dvh/)
})

test('账房底栏可见的整个平板区间都有底部留白', () => {
  const main = read('src/styles/cart-workspace.css')
  assert.match(main, /@media \(min-width:1081px\)\{\.cart-mbar\{display:none\}\}/)
  assert.match(main, /@media \(max-width:1080px\)\{\.cart-main\{padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)\}\}/)
  for (const end of ['Desktop', 'Mobile']) {
    const css = read(`src/styles/cart-workspace${end}.css`)
    postcss.parse(css).walkRules('.cart-main', rule => {
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && parent.name === 'media') assert.doesNotMatch(parent.params, /max-width:\s*767px/)
      }
    })
    assert.match(read(`src/pages/tools/cartPage${end}.css`), /@media\s*\(max-width:\s*1180px\)\{[\s\S]*?\.cart-main\{padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom\)\)/)
  }
})

