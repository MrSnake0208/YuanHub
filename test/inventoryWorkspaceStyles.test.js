import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'
import { parse, compileStyle } from '@vue/compiler-sfc'

const owners = [
  ['../src/pages/inventory/index.vue', 'inventoryWorkspace', 1080],
  ['../src/components/inventory/RewardEntryWorkspace.vue', 'rewardEntryWorkspace', 767],
  ['../src/components/inventory/RewardDateTimePicker.vue', 'rewardDateTimePicker', 767],
]

for (const [entry, owner, boundary] of owners) test(`${owner} keeps real layout in independently scoped device styles`, () => {
  const filename = new URL(entry, import.meta.url)
  const { descriptor } = parse(readFileSync(filename, 'utf8'))
  for (const end of ['Desktop', 'Mobile']) {
    const src = `./${owner}${end}.css`
    assert.ok(descriptor.styles.some(style => style.scoped && style.src === src))
    const css = readFileSync(new URL(src, filename), 'utf8')
    assert.deepEqual(compileStyle({ source: css, filename: src, id: 'data-v-inventory-workspace-test', scoped: true }).errors, [])
    const root = postcss.parse(css)
    const guard = root.nodes.find(node => node.type === 'atrule')
    assert.equal(guard.name, 'media')
    assert.equal(guard.params, `${end === 'Desktop' ? 'not all and ' : ''}(max-width: ${boundary}px)`)
    assert.ok(guard.nodes.length > 10)
    root.walkRules(rule => {
      let parent = rule.parent
      while (parent && parent !== guard) parent = parent.parent
      assert.equal(parent, guard)
    })
  }
  for (const style of descriptor.styles.filter(style => !style.src)) postcss.parse(style.content).walkDecls(declaration => {
    let parent = declaration.parent
    while (parent) {
      if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return
      parent = parent.parent
    }
    assert.doesNotMatch(declaration.prop, /^(?:display|position|inset|width|height|min-width|max-width|min-height|max-height|margin(?:-.+)?|padding(?:-.+)?|gap|grid(?:-.+)?|flex(?:-.+)?|font(?:-.+)?|line-height)$/)
  })
})
