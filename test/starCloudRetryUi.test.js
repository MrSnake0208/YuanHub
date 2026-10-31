import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/star/index.vue', import.meta.url), 'utf8')

test('star page uses one direct recovery action and preserves capture-specific retries', function () {
  assert.equal((page.match(/@click="recoverStarCloud"/g) || []).length, 1)
  assert.match(page, /class="star-sync-retry star-sync-cloud"/)
  assert.match(page, /:aria-busy="cloudRecoveryBusy"/)
  assert.match(page, /恢复中…/)
  assert.match(page, /恢复云端/)
  assert.match(page, /重新加载/)
  assert.match(page, /await starCloud\.discardAndReload\(\{ isCurrent \}\)/)
  assert.match(page, /await syncHostAccount\(\{ readOnly: true \}\)/)
  assert.doesNotMatch(page, /dialog\.confirm|window\.confirm|starCloud\.retry\(|retryStarCloud|discardStarCloud|star-sync-discard/)
  assert.match(page, /@click="retryCaptureConsume"/)
  assert.match(page, /@click="retryCaptureImport"/)
  assert.match(page, /\.star-sync-retry:focus-visible/)
})
