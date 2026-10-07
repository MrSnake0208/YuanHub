import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('../src/pages/star/index.vue', import.meta.url), 'utf8')

test('star page exposes retry only as an inline recovery action', function () {
  assert.match(page, /v-if="cloudNeedsRetry \|\| cloudRetryBusy \|\| \(cloudSyncError && productReady && accountId\)"/)
  assert.match(page, /class="star-sync-retry"/)
  assert.match(page, /:disabled="cloudRetryBusy"/)
  assert.match(page, /@click="retryStarCloud"/)
  assert.match(page, /cloudRetryBusy \? '重试中…' : '重试'/)
  assert.match(page, /await starCloud\.retry\(\)/)
  assert.match(page, /else if \(handle && selectedHostAccount\(\)\) await syncHostAccount\(\)/)
  assert.match(page, /cloudNeedsRetry\.value = Boolean\(state\.recoveryRequired\)/)
  assert.match(page, /cloudSyncError\.value = "星石云端同步失败，请重试。"/)
  assert.match(page, /\.star-sync-retry \{[\s\S]*?background: transparent/)
  assert.match(page, /\.star-sync-retry:focus-visible/)
  // Privacy/help copy may mention automatic synchronization; forbid a manual action.
  assert.doesNotMatch(page, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*同步背包/)
})
