import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MAAYUAN_REQUIRED_SCOPES, mergeScopes } from '../src/utils/openApiToken.js'

const profile = readFileSync(new URL('../src/pages/user/profile.vue', import.meta.url), 'utf8')

test('MaaYuan 创建连接保留密探读取并包含星石采集权限', () => {
  assert.deepEqual(MAAYUAN_REQUIRED_SCOPES, ['inventory:write', 'operator:scan:write', 'operator:read', 'star:capture:write'])
  assert.equal(MAAYUAN_REQUIRED_SCOPES.some(function (scope) { return scope === 'inventory:read' || /:export$/.test(scope) }), false)
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

test('高级权限选择器展示星石采集权限分组', () => {
  assert.match(profile, /key: "star"/)
  assert.match(profile, /title: "星石采集"/)
  assert.match(profile, /permission\.scope\.startsWith\("star:"\)/)
})

test('MaaYuan 新连接创建后给出从复制连接码到开始同步的完整步骤', () => {
  const stepsStart = profile.indexOf('<ol v-if="newTokenKind === \'maayuan\'" class="paste-steps">')
  const stepsEnd = profile.indexOf('</ol>', stepsStart)
  const steps = profile.slice(stepsStart, stepsEnd)
  assert.ok(stepsStart >= 0 && stepsEnd > stepsStart)
  assert.match(steps, /只会完整显示这一次/)
  assert.match(steps, /同步至YuanHub/)
  assert.match(steps, /YuanHub连接码/)
  assert.match(steps, /采集结果会同步/)
})
