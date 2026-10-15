import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { compileStyle } from '@vue/compiler-sfc'

const directory = new URL('../src/components/today/', import.meta.url)
const owners = ['todayLayout', 'todayAccount', 'todayOnboarding', 'todayLobby', 'todayActivity', 'todaySubscription', 'todayPrivateItems', 'todayTraining']

// Check source ownership and real external CSS compilation, not pixel geometry.
test('today layouts compile with scoped styles and every device rule is media bounded', () => {
  for (const owner of owners) for (const end of ['Desktop', 'Mobile']) {
    const filename = new URL(`${owner}${end}.css`, directory)
    const source = readFileSync(filename, 'utf8')
    const result = compileStyle({ source, filename: filename.pathname, id: 'data-v-today-test', scoped: true })
    assert.deepEqual(result.errors, [], filename.pathname)
    postcss.parse(source).walkRules(rule => {
      let node = rule.parent, guards = []
      while (node) { if (node.type === 'atrule' && node.name === 'media') guards.push(node.params); node = node.parent }
      assert.ok(guards.some(query => end === 'Desktop' ? ['(min-width: 768px)', '(min-width: 981px)', '(min-width: 1081px)'].includes(query) : query === 'not all and (min-width: 768px)' || query === '(max-width: 600px)'), `${filename.pathname}: ${rule.selector}`)
    })
  }
})

function declarations(owner, end, selector) {
  const values = []
  postcss.parse(readFileSync(new URL(`${owner}${end}.css`, directory), 'utf8')).walkRules(selector, rule => {
    for (const declaration of rule.nodes) values.push([declaration.prop, declaration.value])
  })
  return Object.fromEntries(values)
}

test('today desktop owns expanded regions while mobile owns compact regions independently', () => {
  assert.equal(declarations('todayLobby', 'Desktop', '.lobby-scene')['min-height'], '260px')
  assert.equal(declarations('todayLobby', 'Mobile', '.lobby-scene')['min-height'], '164px')
  assert.equal(declarations('todayOnboarding', 'Desktop', '.data-readiness-grid')['grid-template-columns'], 'repeat(3, minmax(0, 1fr))')
  assert.equal(declarations('todayOnboarding', 'Mobile', '.data-readiness-grid')['grid-template-columns'], '1fr')
  assert.equal(declarations('todayOnboarding', 'Desktop', '.account-management-card')['grid-template-columns'], 'minmax(0, 1fr) auto')
  assert.equal(declarations('todayOnboarding', 'Mobile', '.sync-recommendation')['flex-direction'], 'column')
  assert.equal(declarations('todayOnboarding', 'Desktop', '.sync-recommendation')['flex-direction'], 'row')
  assert.equal(declarations('todayLayout', 'Desktop', '.today-main')['margin-left'], '292px')
  assert.equal(declarations('todayLayout', 'Mobile', '.today-main')['margin-left'], undefined)
})
