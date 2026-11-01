import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const compiler = fileURLToPath(new URL('../scripts/check-source.mjs', import.meta.url))
function compileFixture(t, filename, content) {
  const root = mkdtempSync(join(tmpdir(), 'yuanhub_test_source_'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const folder of ['src', 'test', 'test-support', 'behavior', 'scripts']) mkdirSync(join(root, folder))
  writeFileSync(join(root, 'src', filename), content)
  return spawnSync(process.execPath, [compiler], { cwd: root, encoding: 'utf8', timeout: 10000 })
}

test('source gate accepts a real valid Vue SFC with script template and scoped style', t => {
  const result = compileFixture(t, 'Valid.vue', '<script setup>import { ref } from "vue"; const count = ref(0)</script><template><button @click="count++">{{ count }}</button></template><style scoped>button { padding: 1rem; }</style>')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /1 checked, 0 failed/)
})
test('source gate rejects invalid JavaScript rather than reporting a successful no-op', t => {
  const result = compileFixture(t, 'Invalid.js', 'export function broken( {')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid\.js/)
})
test('source gate rejects an unclosed Vue template without touching the working tree', t => {
  const result = compileFixture(t, 'Invalid.vue', '<template><div></template>')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid\.vue/)
})
