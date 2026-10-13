import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { parse, compileStyle } from '@vue/compiler-sfc'

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = resolve(directory, entry.name)
    return entry.isDirectory() ? files(filename) : [filename]
  })
}

const sources = files(fileURLToPath(new URL('../src/', import.meta.url)))
const references = new Map()
// Existing global assets serve namespaced children and teleported dialogs.
const globalNamespacedStyles = new Map([
  ...['Desktop', 'Mobile'].map(end =>
    [fileURLToPath(new URL(`../src/components/compactToolHeaderOverrides1${end}.css`, import.meta.url)), /\.tool-(?:more|summary)/]),
  ...[
    ['sidebar-layout', /\.(?:island|brand|nav)/],
    ['footer-layout', /\.footer/],
    ['mobile-header', /\.(?:mobile-|detail-mobile)/],
    ['page-header', /\.page-header/],
    ['tools-workspace', /\.tool-workspace-tabs/],
  ].flatMap(([owner, namespace]) => ['Desktop', 'Mobile'].map(end =>
    [fileURLToPath(new URL(`../src/styles/${owner}${end}.css`, import.meta.url)), namespace])),
  ...['Desktop', 'Mobile'].map(end =>
    [fileURLToPath(new URL(`../src/styles/auth-fields${end}.css`, import.meta.url)), /\.page-auth/]),
  ...['Desktop', 'Mobile'].map(end =>
    [fileURLToPath(new URL(`../src/styles/cart-workspace${end}.css`, import.meta.url)), /\.(?:cart-|pkg-|rate-bar|receipt|initial-row|divider-dashed|tot-row|grand-total|milestone|campaign-ended-note|mbtn)/]),
  ...['calendar', 'public-calendar'].flatMap(owner => ['Desktop', 'Mobile'].map(end =>
    [fileURLToPath(new URL(`../src/pages/calendar/${owner}${end}.css`, import.meta.url)), /calendar-/])),
  ...['Desktop', 'Mobile'].map(end =>
    [fileURLToPath(new URL(`../src/styles/feedback-workspace${end}.css`, import.meta.url)), /feedback-|\.access-modal/]),
])
// Global layout assets retain their existing CSS import chain and specificity.
for (const owner of ['sidebar-layout', 'footer-layout', 'mobile-header', 'page-header', 'tools-workspace']) {
  const parent = fileURLToPath(new URL(`../src/styles/${owner}.css`, import.meta.url))
  const source = readFileSync(parent, 'utf8')
  if (owner === 'page-header') {
    assert.ok(sources.filter(file => file.endsWith('.vue')).some(file => readFileSync(file, 'utf8').includes('styles/page-header.css')), 'page headers must import their layout contract')
  } else {
    assert.ok(readFileSync(new URL('../src/styles/main.css', import.meta.url), 'utf8').includes(`@import './${owner}.css'`), `${owner}: root stylesheet connection`)
    assert.ok(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').includes("import './styles/main.css'"), 'root stylesheet must be loaded by the app')
  }
  for (const end of ['Desktop', 'Mobile']) {
    const target = resolve(dirname(parent), `${owner}${end}.css`)
    assert.ok(source.includes(`@import './${owner}${end}.css'`), `${owner}: actual device stylesheet import`)
    references.set(target, 1)
  }
}
for (const filename of sources.filter(file => file.endsWith('.vue'))) {
  const { descriptor } = parse(readFileSync(filename, 'utf8'))
  const seen = new Set()
  for (const style of descriptor.styles.filter(style => /(?:Desktop|Mobile)\.css$/.test(style.src || ''))) {
    const target = resolve(dirname(filename), style.src)
    assert.ok(style.scoped || globalNamespacedStyles.has(target), `${filename}: unexpected global device styles`)
    assert.ok(!seen.has(target), `${filename}: duplicate style reference ${style.src}`)
    seen.add(target)
    references.set(target, (references.get(target) || 0) + 1)
  }
}

for (const filename of sources.filter(file => /Desktop\.css$/.test(file))) {
  for (const end of ['Desktop', 'Mobile']) test(`${filename.replace(/Desktop\.css$/, end + '.css')} is referenced, scoped and device limited`, () => {
    const target = filename.replace(/Desktop\.css$/, end + '.css')
    const source = readFileSync(target, 'utf8')
    assert.ok(references.has(target), 'each stylesheet must be connected to a real SFC or its existing CSS import chain')
    assert.deepEqual(compileStyle({ source, filename: target, id: 'data-v-device-ownership', scoped: !globalNamespacedStyles.has(target) }).errors, [])
    let declarations = 0
    postcss.parse(source).walkRules(rule => {
      const media = []
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return
        if (parent.type === 'atrule' && parent.name === 'media') media.push(parent.params)
      }
      if (globalNamespacedStyles.has(target)) assert.ok(rule.selectors.every(selector => globalNamespacedStyles.get(target).test(selector)), 'global rules must keep their existing namespace')
      const guard = end === 'Desktop' ? /(?:^not all and \(max-width:|^\(min-width:)/ : /(?:^not all and \(min-width:|^\(max-width:)/
      assert.ok(media.some(query => guard.test(query)), `${rule.selector}: missing ${end} boundary`)
      declarations += rule.nodes.filter(node => node.type === 'decl').length
    })
    assert.ok(declarations > 0, 'device ownership must contain real declarations')
  })
}
