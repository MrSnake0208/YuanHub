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
  assert.match(grantReview, /MaaYuan 采集任务接入中/)
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
  assert.match(steps, /之后仍可在“现有连接”中复制/)
  assert.match(steps, /同步至YuanHub/)
  assert.match(steps, /YuanHub连接码/)
  assert.match(steps, /据点日常/)
  assert.match(steps, /采集密探信息/)
  assert.match(steps, /自动识别背包/)
  assert.match(steps, /记录奖励内容及数量/)
  assert.match(steps, /星石 → YuanHub 网页端先导入截图；MaaYuan 自动采集接入中/)
  assert.match(steps, /采集结果会同步/)
})

test('MaaYuan 连接按钮暴露给新手教程并继续复用现有连接逻辑', () => {
  assert.match(profile, /data-tour="maayuan-sync"/)
  assert.match(profile, /@click="openMaaYuanConnect"/)
  assert.match(profile, /aria-controls="maayuan-connect-panel"/)
})

// 路由自动展开、滚动与焦点改由 profileConnectionsUx.spec.js 验证真实行为。
