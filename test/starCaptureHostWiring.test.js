import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/star/index.vue', import.meta.url), 'utf8')
// 先去掉注释，再做“旧实现已删除”的断言，避免注释里的同名标识误伤。
const code = page.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '')

test('star page wires the Stage D commit callback and keeps consume retry separate from cloud retry', () => {
  assert.match(code, /onCaptureCommitted:\s*function\s*\(event\)\s*\{\s*return captureHost\.onCaptureCommitted\(event\)/)
  assert.match(code, /consume:\s*consumeStarCapture/)
  assert.match(code, /@click="retryCaptureConsume"/)
  assert.match(code, /captureNeedsRetry \|\| captureRetryBusy/)
  assert.doesNotMatch(code, /\bcapture_import_not_empty\b|\bstartCaptureRetry\b|\bclearConsumedCaptureRoute\b/)
})

test('star page exposes a retry entry for transient import failures', () => {
  assert.match(code, /@click="retryCaptureImport"/)
  assert.match(code, /captureImportNeedsRetry/)
  assert.match(code, /:disabled="captureImportBusy"/)
  assert.match(code, /isRetryableCaptureImportError\(error\)/)
})
