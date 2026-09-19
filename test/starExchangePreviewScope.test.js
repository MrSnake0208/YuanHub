import test from 'node:test'
import assert from 'node:assert/strict'

import { bindStarExchangePreview, isStarExchangePreviewCurrent } from '../src/pages/star/starExchangePreviewScope.js'

test('replacement preview bound to account A is rejected after switching to account B', function () {
  const preview = bindStarExchangePreview({ fileName: 'exchange.json' }, 'account-a')
  assert.equal(isStarExchangePreviewCurrent(preview, 'account-a'), true)
  assert.equal(isStarExchangePreviewCurrent(preview, 'account-b'), false)
})
