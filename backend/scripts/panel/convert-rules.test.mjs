import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parseAssignment, writePrivateBundle } from './convert-rules.mjs'

test('reads JSON assignments without accepting executable suffixes or wrong globals', () => {
  assert.deepEqual(parseAssignment('/* source */ window.PANEL_DATA = {"value":1};\n', 'PANEL_DATA'), { value: 1 })
  assert.deepEqual(parseAssignment('window.PANEL_DATA={}', 'PANEL_DATA'), {})
  for (const text of ['window.WRONG={};', 'window.PANEL_DATA={}; throw new Error()', 'window.PANEL_DATA={value:1}']) {
    assert.throws(() => parseAssignment(text, 'PANEL_DATA'))
  }
})

test('private output is owner-only, cannot overwrite, and cannot enter a Git worktree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'panel-convert-test-'))
  try {
    const file = join(dir, 'rules.json')
    writePrivateBundle(file, { value: 1 })
    assert.equal(statSync(file).mode & 0o777, 0o600)
    assert.equal(readFileSync(file, 'utf8'), '{"value":1}')
    assert.throws(() => writePrivateBundle(file, { value: 2 }))
    mkdirSync(join(dir, '.git'))
    assert.throws(() => writePrivateBundle(join(dir, 'blocked.json'), {}), /outside Git/)
  } finally {
    rmSync(dir, { recursive: true })
  }
})
