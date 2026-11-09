import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/star/index.vue', import.meta.url), 'utf8')

test('star page preserves direct cloud recovery and removes retired capture retries', function () {
  assert.equal((page.match(/@click="recoverStarCloud"/g) || []).length, 1)
  assert.match(page, /:aria-busy="cloudRecoveryBusy"/)
  assert.match(page, /await starCloud\.discardAndReload\(\{ isCurrent \}\)/)
  assert.match(page, /await syncHostAccount\(\{ readOnly: true \}\)/)
  assert.doesNotMatch(page, /dialog\.confirm|window\.confirm|starCloud\.retry\(|retryStarCloud|discardStarCloud|star-sync-discard/)
  assert.doesNotMatch(page, /retryCaptureConsume|retryCaptureImport/)
  assert.match(page, /\.star-sync-retry:focus-visible/)
})
