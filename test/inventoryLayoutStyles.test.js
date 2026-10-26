import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { compileStyle } from '@vue/compiler-sfc'
import { readSource } from '../test-support/readSource.js'

const directory = new URL('../src/components/inventory/', import.meta.url)
test('inventory shell and navigation compile scoped CSS with device and slot ownership', () => {
  for (const owner of ['inventoryLayout', 'inventoryWorkspaceTabs']) for (const end of ['Desktop', 'Mobile']) {
    const filename = new URL(`${owner}${end}.css`, directory)
    const source = readFileSync(filename, 'utf8')
    const compiled = compileStyle({ source, filename: filename.pathname, id: 'data-v-inventory-layout-test', scoped: true })
    assert.deepEqual(compiled.errors, [])
    postcss.parse(source).walkRules(rule => {
      assert.equal(rule.parent.name, 'media')
      assert.ok((end === 'Desktop' ? ['not all and (max-width: 1080px)'] : ['(max-width: 1080px)', '(max-width: 767px)', '(max-width: 640px)']).includes(rule.parent.params))
    })
    if (owner === 'inventoryLayout') assert.match(compiled.code, /section\[data-v-inventory-layout-test-s\]/)
  }
  const global = readSource(new URL('../src/styles/tools-workspace.css', import.meta.url))
  assert.doesNotMatch(global, /\.page-inventory/)
  assert.doesNotMatch(global, /\.page-operator/)
  assert.match(readSource(new URL('../src/pages/operator/index.vue', import.meta.url)), /\.operator-tabs/)
  assert.match(global, /\.page-star/)
})
