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
// These existing global assets style calendar children and teleported dialogs.
const globalCalendarStyles = new Set(['calendar', 'public-calendar'].flatMap(owner =>
  ['Desktop', 'Mobile'].map(end => fileURLToPath(new URL(`../src/pages/calendar/${owner}${end}.css`, import.meta.url)))))
for (const filename of sources.filter(file => file.endsWith('.vue'))) {
  const { descriptor } = parse(readFileSync(filename, 'utf8'))
  const seen = new Set()
  for (const style of descriptor.styles.filter(style => /(?:Desktop|Mobile)\.css$/.test(style.src || ''))) {
    const target = resolve(dirname(filename), style.src)
    assert.ok(style.scoped || globalCalendarStyles.has(target), `${filename}: unexpected global device styles`)
    assert.ok(!seen.has(target), `${filename}: duplicate style reference ${style.src}`)
    seen.add(target)
    references.set(target, (references.get(target) || 0) + 1)
  }
}

for (const filename of sources.filter(file => /Desktop\.css$/.test(file))) {
  for (const end of ['Desktop', 'Mobile']) test(`${filename.replace(/Desktop\.css$/, end + '.css')} is referenced, scoped and device limited`, () => {
    const target = filename.replace(/Desktop\.css$/, end + '.css')
    const source = readFileSync(target, 'utf8')
    assert.ok(references.has(target), 'each stylesheet must be connected to a real SFC')
    assert.deepEqual(compileStyle({ source, filename: target, id: 'data-v-device-ownership', scoped: !globalCalendarStyles.has(target) }).errors, [])
    let declarations = 0
    postcss.parse(source).walkRules(rule => {
      const media = []
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return
        if (parent.type === 'atrule' && parent.name === 'media') media.push(parent.params)
      }
      if (globalCalendarStyles.has(target)) assert.ok(rule.selectors.every(selector => selector.includes('calendar-')), 'global rules must keep the calendar namespace')
      const guard = end === 'Desktop' ? /(?:^not all and \(max-width:|^\(min-width:)/ : /(?:^not all and \(min-width:|^\(max-width:)/
      assert.ok(media.some(query => guard.test(query)), `${rule.selector}: missing ${end} boundary`)
      declarations += rule.nodes.filter(node => node.type === 'decl').length
    })
    assert.ok(declarations > 0, 'device ownership must contain real declarations')
  })
}
