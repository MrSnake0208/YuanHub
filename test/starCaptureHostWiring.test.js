import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/star/index.vue', import.meta.url), 'utf8')

test('star page passes Stage D commit callback and keeps consume retry separate from cloud retry', () => {
  assert.match(page, /onCaptureCommitted: function \(event\) \{ return captureHost\.onCaptureCommitted\(event\); \}/)
  assert.match(page, /@click="retryCaptureConsume"/)
  assert.match(page, /captureNeedsRetry \|\| captureRetryBusy/)
  assert.match(page, /consume: consumeStarCapture/)
  assert.doesNotMatch(page, /capture_import_not_empty|startCaptureRetry|clearConsumedCaptureRoute/)
})
