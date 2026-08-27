import test from 'node:test'
import assert from 'node:assert/strict'
import { isAdminAccessToken } from '../src/utils/authPermissions.js'

function tokenWith(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return 'header.' + encoded + '.signature'
}

test('detects an administrator from numeric JWT authorities', function () {
  assert.equal(isAdminAccessToken(tokenWith({ Authorities: '0,1,2' })), true)
  assert.equal(isAdminAccessToken(tokenWith({ Authorities: ['0', '1', '3'] })), true)
})

test('does not treat a regular user as an administrator', function () {
  assert.equal(isAdminAccessToken(tokenWith({ Authorities: '0,1' })), false)
})

test('handles missing or malformed access tokens', function () {
  assert.equal(isAdminAccessToken(''), false)
  assert.equal(isAdminAccessToken('not-a-jwt'), false)
  assert.equal(isAdminAccessToken(tokenWith({})), false)
})
