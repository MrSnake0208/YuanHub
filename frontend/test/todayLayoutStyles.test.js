import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { compileStyle } from '@vue/compiler-sfc'

const directory = new URL('../src/components/today/', import.meta.url)
const owners = ['todayLayout', 'todayAccount', 'todayOnboarding', 'todayLobby', 'todayActivity', 'todaySubscription', 'todayHighlights', 'todayPrivateItems', 'todayTraining', 'todayTrainingDaily', 'todayPreferences']

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

