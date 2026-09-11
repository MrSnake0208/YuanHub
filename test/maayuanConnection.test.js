import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAAYUAN_REQUIRED_SCOPES, mergeScopes } from '../src/utils/openApiToken.js'

const profile = readFileSync(new URL('../src/pages/user/profile.vue', import.meta.url), 'utf8')

test('MaaYuan 创建连接仅授予三项必要写权限', () => {
  assert.deepEqual(MAAYUAN_REQUIRED_SCOPES, ['inventory:write', 'operator:scan:write', 'star:capture:write'])
  assert.equal(MAAYUAN_REQUIRED_SCOPES.some(function (scope) { return /:(read|export)$/.test(scope) }), false)
  assert.match(profile, /scopes:\s*MAAYUAN_REQUIRED_SCOPES\.slice\(\)/)
  const grantReview = profile.slice(profile.indexOf('<div class="grant-review">'), profile.indexOf('</div>', profile.indexOf('<div class="grant-review">') + 1))
  assert.match(grantReview, /<h4>将会允许<\/h4>/)
  assert.match(grantReview, /上传星石背包临时采集结果/)
})

test('MaaYuan 现有连接以 PATCH scope 原地升级而不创建新连接', () => {
  const start = profile.indexOf('async function upgradeForMaaYuan')
  const end = profile.indexOf('async function removeToken', start)
  const upgrade = profile.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.deepEqual(mergeScopes(['inventory:write', 'operator:scan:write'], MAAYUAN_REQUIRED_SCOPES), MAAYUAN_REQUIRED_SCOPES)
  assert.match(upgrade, /updateOpenApiTokenScopes\(id, nextScopes\)/)
  assert.doesNotMatch(upgrade, /generateOpenApiToken/)
  assert.match(upgrade, /原连接码无需重新填写/)
})
