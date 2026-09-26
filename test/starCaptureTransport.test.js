import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STAR_CAPTURE_CONTRACT_CODE,
  STAR_CAPTURE_IMPORT_SUPERSEDED_CODE,
  captureIdFromRouteQuery,
  clearStarCaptureRouteQuery,
  importLoadedStarCapture,
  isRetryableCaptureImportError,
  isStarCaptureReadyEvent,
  loadAndImportStarCapture,
  loadStarCaptureBatch,
  starCaptureRouteForEvent,
} from '../src/pages/star/captureTransport.js'

const event = { event: 'star_capture_ready', data: { account_id: 'account-1', capture_id: 'capture-1', section: 'full', image_count: 4 } }

test('full capture SSE accepts only the active account and uses only capture routing fields', () => {
  assert.equal(isStarCaptureReadyEvent(event, 'account-1'), true)
  assert.equal(isStarCaptureReadyEvent(event, 'account-2'), false)
  assert.deepEqual(starCaptureRouteForEvent(event, 'account-1'), { path: '/star', query: { account_id: 'account-1', capture_id: 'capture-1' } })
})

test('full three-section manifest is reconstructed in global order without import options', async () => {
  const api = {
    async getManifest() {
      return {
        capture_id: 'capture-1', source: 'maayuan', game_version: '如鸢', sections: {
          main: { images: [{ source_image_id: 'main-1', source_order: 1, file_name: 'main-000.png' }, { source_image_id: 'main-2', source_order: 2, file_name: 'main-001.png' }], adjacent_relations: [{ previous_source_image_id: 'main-1', current_source_image_id: 'main-2', relation: 'overlap' }], complete: true, stop_reason: 'bottom_no_move' },
          support: { images: [{ source_image_id: 'support-1', source_order: 3, file_name: 'support-000.png' }], adjacent_relations: [], complete: true, stop_reason: 'bottom_no_move' },
          experience: { images: [{ source_image_id: 'experience-1', source_order: 4, file_name: 'experience-000.png' }], adjacent_relations: [], complete: true, stop_reason: 'single_capture' },
        },
      }
    },
    async getImage(_accountId, _captureId, sourceImageId) { return { blob: sourceImageId } },
  }
  const batch = await loadStarCaptureBatch(api, 'account-1', 'capture-1', function (blob, name) { return { blob, name } })
  assert.deepEqual(Object.keys(batch.sections), ['main', 'support', 'experience'])
  assert.deepEqual(Object.values(batch.sections).flatMap(function (section) { return section.images.map(function (image) { return image.sourceOrder }) }), [1, 2, 3, 4])
  assert.equal(batch.sections.main.adjacentRelations[0].currentSourceImageId, 'main-2')
  let consumed = 0
  let options = 'not-called'
  await importLoadedStarCapture({ importCaptureBatch(_batch, nextOptions) { options = nextOptions } }, batch)
  assert.equal(consumed, 0)
  assert.equal(options, undefined)
})

test('an account switch while downloading prevents both import and consume', async () => {
  let activeAccountId = 'A'
  let imported = 0
  let consumed = 0
  const current = { accountId: 'A', captureId: 'capture-a', batch: null }
  const api = {
    async getManifest() { return { capture_id: 'capture-a', game_version: '如鸢', sections: { main: { images: [{ source_image_id: 'capture-a:main:000', source_order: 1, file_name: 'main-000.png' }], adjacent_relations: [], complete: true, stop_reason: 'bottom_no_move' }, support: { images: [{ source_image_id: 'capture-a:support:001', source_order: 2, file_name: 'support-000.png' }], adjacent_relations: [], complete: true, stop_reason: 'bottom_no_move' }, experience: { images: [{ source_image_id: 'capture-a:experience:002', source_order: 3, file_name: 'experience-000.png' }], adjacent_relations: [], complete: true, stop_reason: 'single_capture' } } } },
    async getImage() { activeAccountId = 'B'; return { blob: 'image' } },
    async consume() { consumed += 1 },
  }
  const completed = await loadAndImportStarCapture(api, current, { importCaptureBatch() { imported += 1 } }, function () { return {} }, function () { return activeAccountId === current.accountId })
  assert.equal(completed, false)
  assert.equal(imported, 0)
  assert.equal(consumed, 0)
})

test('completed import clears only capture query fields', () => {
  const next = clearStarCaptureRouteQuery({ capture_id: 'capture-1', account_id: 'account-1', tab: 'import' })
  assert.deepEqual(next, { tab: 'import' })
  assert.equal(captureIdFromRouteQuery(next), '')
})

test('async import must resolve before the handoff completes and never consumes', async () => {
  let finishImport
  let settled = false
  let consumed = 0
  const imported = new Promise(resolve => { finishImport = resolve })
  const handoff = importLoadedStarCapture({
    importCaptureBatch() { return imported },
  }, { captureId: 'M1' }).then(value => { settled = true; return value })
  await Promise.resolve()
  assert.equal(settled, false)
  finishImport()
  assert.equal(await handoff, true)
  assert.equal(consumed, 0)
})

test('account switch while async import is pending makes the handoff stale', async () => {
  let finishImport
  let active = true
  const imported = new Promise(resolve => { finishImport = resolve })
  const handoff = importLoadedStarCapture({ importCaptureBatch() { return imported } }, {}, () => active)
  active = false
  finishImport()
  assert.equal(await handoff, false)
})

test('embed reporting a superseded batch fails the handoff instead of reporting a false success', async () => {
  let calls = 0
  await assert.rejects(
    importLoadedStarCapture({ importCaptureBatch() { calls += 1; return false } }, { captureId: 'M1' }),
    error => error.code === STAR_CAPTURE_IMPORT_SUPERSEDED_CODE,
  )
  assert.equal(calls, 1)
})

test('embed without a verdict keeps the legacy accepted behaviour', async () => {
  assert.equal(await importLoadedStarCapture({ importCaptureBatch() { return undefined } }, {}), true)
})

test('capture contract violations are tagged as non-retryable', async () => {
  await assert.rejects(
    loadStarCaptureBatch({ async getManifest() { return {} } }, 'A', 'M1', function () { return {} }),
    error => error.code === STAR_CAPTURE_CONTRACT_CODE,
  )
  assert.equal(isRetryableCaptureImportError({ code: STAR_CAPTURE_CONTRACT_CODE }), false)
})

test('import retry policy separates transient failures from contract errors', () => {
  assert.equal(isRetryableCaptureImportError({ code: 'capture_import_locked' }), true)
  assert.equal(isRetryableCaptureImportError({ code: 'capture_workspace_unavailable' }), true)
  assert.equal(isRetryableCaptureImportError({ code: STAR_CAPTURE_IMPORT_SUPERSEDED_CODE }), true)
  assert.equal(isRetryableCaptureImportError({ status: 503 }), true)
  assert.equal(isRetryableCaptureImportError({ status: 429 }), true)
  assert.equal(isRetryableCaptureImportError({ status: 408 }), true)
  assert.equal(isRetryableCaptureImportError(new TypeError('Failed to fetch')), true)
  assert.equal(isRetryableCaptureImportError({ status: 400 }), false)
  assert.equal(isRetryableCaptureImportError({ status: 404 }), false)
  assert.equal(isRetryableCaptureImportError({ code: STAR_CAPTURE_CONTRACT_CODE }), false)
})
