import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(new URL('../src/pages/operator/admin.vue', import.meta.url)),
  'utf8'
)

test('operator catalog editor stays open when its backdrop is clicked', () => {
  const mask = source.match(/<div v-if="editing" class="editor-mask"[^>]*>/)

  assert.ok(mask, 'missing operator catalog editor backdrop')
  assert.doesNotMatch(mask[0], /@click(?:\.self)?=/)
  assert.match(mask[0], /@keyup\.esc="closeEditor"/)
})
