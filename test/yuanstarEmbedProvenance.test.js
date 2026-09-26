import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)

test('vendored YuanStar embed keeps provenance and is marked as generated output', () => {
  const doc = readFileSync(new URL('docs/yuanstar-embed-sync.md', root), 'utf8')
  assert.match(doc, /public\/yuanstar-embed\/yuanstar-embed\.js/)
  assert.match(doc, /importCaptureBatch/)
  assert.match(doc, /onCaptureCommitted/)

  const attributes = readFileSync(new URL('.gitattributes', root), 'utf8')
  assert.match(attributes, /public\/yuanstar-embed\/yuanstar-embed\.js[^\n]*-diff/)
  assert.match(attributes, /public\/yuanstar-embed\/assets\/\*\*[^\n]*-diff/)
})
