import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const root = new URL('../', import.meta.url)
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8')
const mainCss = read('src/styles/main.css')
const feedbackCss = read('src/styles/feedback-workspace.css')
const demoVue = read('src/pages/demo/index.vue')

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  assert.ok(match, `缺少 ${selector} 样式契约`)
  return match[1]
}

test('全局吉祥物纹理独立为不可交互的固定背景层', () => {
  const body = cssBlock(mainCss, 'body')
  const texture = cssBlock(mainCss, 'body::before')

  assert.doesNotMatch(body, /maayuan-pattern\.webp/)
  assert.match(body, /isolation\s*:\s*isolate/)
  assert.match(texture, /position\s*:\s*fixed/)
  assert.match(texture, /pointer-events\s*:\s*none/)
  assert.match(texture, /z-index\s*:\s*-1/)
  assert.match(texture, /opacity\s*:\s*\.12/)
  assert.match(texture, /maayuan-pattern\.webp/)
})

test('共享 Hero 将遮罩、水印和内容固定在明确层级', () => {
  const hero = cssBlock(mainCss, '\.hero')
  const mask = cssBlock(mainCss, '\.hero::before')
  const watermark = cssBlock(mainCss, '\.hero::after')
  const content = cssBlock(mainCss, '\.hero \.wrap')

  assert.match(hero, /isolation\s*:\s*isolate/)
  assert.match(mask, /z-index\s*:\s*1/)
  assert.match(mask, /pointer-events\s*:\s*none/)
  assert.match(watermark, /z-index\s*:\s*0/)
  assert.match(watermark, /pointer-events\s*:\s*none/)
  assert.match(content, /z-index\s*:\s*2/)
})

test('反馈 Hero 和演示 Hero 遵循相同的内容层级合同', () => {
  for (const [source, name] of [[feedbackCss, '反馈 Hero'], [demoVue, '演示 Hero']]) {
    const heroSelector = name === '反馈 Hero' ? '\.feedback-page \.feedback-hero' : '\.demo-hero'
    const hero = cssBlock(source, heroSelector)
    const mask = cssBlock(source, `${heroSelector}::before`)
    const watermark = cssBlock(source, `${heroSelector}::after`)

    assert.match(hero, /isolation\s*:\s*isolate/, name)
    assert.match(mask, /z-index\s*:\s*1/, name)
    assert.match(mask, /pointer-events\s*:\s*none/, name)
    assert.match(watermark, /z-index\s*:\s*0/, name)
    assert.match(watermark, /pointer-events\s*:\s*none/, name)
  }

  assert.match(feedbackCss, /\.feedback-page \.feedback-hero\s*> \.wrap\s*\{[^}]*z-index\s*:\s*2/s)
  assert.match(feedbackCss, /\.feedback-hero-layout\s*\{[^}]*z-index\s*:\s*2/s)
  assert.match(demoVue, /\.demo-hero \.demo-wrap\s*\{[^}]*z-index:\s*2/s)
})

test('三个 Hero 在中等、移动和超窄视口都有装饰安全区', () => {
  for (const [source, selectors] of [
    [mainCss, ['\.hero::after', '\.page-detail \.hero::after']],
    [feedbackCss, ['\.feedback-page \.feedback-hero::after']],
    [demoVue, ['\.demo-hero::after']]
  ]) {
    assert.match(source, /@media\s*\(min-width:\s*768px\)/)
    assert.match(source, /@media\s*\(max-width:\s*767px\)/)
    assert.match(source, /@media\s*\(max-width:\s*360px\)[\s\S]*?::after\s*\{/)
    for (const selector of selectors) assert.match(source, new RegExp(`${selector}[^}]*?(?:top|right|font-size)`))
  }
})

test('长 Hero 文本允许换行且窄屏统计值不被强制裁切', () => {
  assert.match(mainCss, /\.hero-sub\s*\{[^}]*overflow-wrap\s*:\s*anywhere/s)
  assert.match(mainCss, /\.notice p\s*\{[^}]*overflow-wrap\s*:\s*anywhere/s)
  assert.match(mainCss, /\.hero-stats \.v\s*\{[^}]*overflow-wrap\s*:\s*anywhere/s)
  assert.match(mainCss, /\.hero-stats \.v\s*\{[^}]*white-space\s*:\s*normal/s)
  assert.match(feedbackCss, /\.feedback-page \.feedback-hero h1\s*\{[^}]*overflow-wrap\s*:\s*anywhere/s)
  assert.match(demoVue, /\.demo-hero-sub\s*\{[^}]*overflow-wrap:\s*anywhere/s)
})
