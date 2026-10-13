import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { compileStyle } from '@vue/compiler-sfc'

const directory = new URL('../src/components/inventory/', import.meta.url)

test('inventory history controls own media-bounded, scoped device styles', () => {
  for (const end of ['Desktop', 'Mobile']) {
    const filename = new URL(`inventoryRecordsWorkspace${end}.css`, directory)
    const source = readFileSync(filename, 'utf8')
    assert.deepEqual(compileStyle({ source, filename: filename.pathname, id: 'data-v-records-test', scoped: true }).errors, [])
    postcss.parse(source).walkRules(rule => {
      let node = rule.parent, bounded = false
      while (node) {
        if (node.type === 'atrule' && node.name === 'media') bounded ||= end === 'Desktop'
          ? ['not all and (max-width: 640px)', '(min-width: 1081px)'].includes(node.params)
          : node.params === '(max-width: 640px)'
        node = node.parent
      }
      assert.ok(bounded, `${end}: ${rule.selector}`)
    })
  }
  const parent = readFileSync(new URL('../src/pages/inventory/index.vue', import.meta.url), 'utf8')
  assert.match(parent, /<InventoryRecordsWorkspace/)
  assert.doesNotMatch(parent.slice(parent.indexOf('<style scoped>')), /\.records-(?:head|filter|overview|count|kicker|report-entry)/)
  const workspace = readFileSync(new URL('InventoryRecordsWorkspace.vue', directory), 'utf8')
  assert.doesNotMatch(workspace, /from ['"].*(?:api|store)\//)
  assert.match(workspace, /<slot \/>/)
})
