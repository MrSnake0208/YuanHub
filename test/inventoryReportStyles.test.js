import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { compileStyle } from '@vue/compiler-sfc'

const directory = new URL('../src/components/inventory/', import.meta.url)
test('resource and acquired reports compile external scoped CSS with exclusive device ownership', () => {
  for (const owner of ['resourceBalanceReport', 'acquiredPeriodReport']) for (const end of ['Desktop', 'Mobile']) {
    const filename = new URL(`${owner}${end}.css`, directory)
    const source = readFileSync(filename, 'utf8')
    assert.deepEqual(compileStyle({ source, filename: filename.pathname, id: 'data-v-reports-test', scoped: true }).errors, [])
    const root = postcss.parse(source)
    assert.equal(root.nodes.filter(node => node.type !== 'comment').length, 1)
    const guard = root.nodes.find(node => node.type !== 'comment')
    assert.equal(guard.type, 'atrule')
    assert.equal(guard.name, 'media')
    assert.equal(guard.params, end === 'Desktop' ? 'not all and (max-width: 760px)' : '(max-width: 760px)')
  }
})
