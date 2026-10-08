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

test('MaaYuan首次闭环只选背包，其他任务折叠且星石边界准确', () => {
  assert.match(profile, /连接码已创建，还没确认同步/)
  assert.match(profile, /仅创建连接码不表示同步成功/)
  assert.match(profile, /newTokenKind === 'maayuan' && tokenCopied/)
  assert.match(profile, /百宝箱 · 自动识别背包/)
  assert.match(profile, /同步至 YuanHub/)
  assert.match(profile, /YuanHub 连接码/)
  assert.match(profile, /运行一次真实任务/)
  assert.match(profile, /以后还可以同步什么/)
  assert.match(profile, /采集密探信息/)
  assert.match(profile, /据点日常/)
  assert.match(profile, /记录奖励内容及数量/)
  assert.match(profile, /网页端截图识别可用；MaaYuan 自动采集仍在接入中/)
})

test('MaaYuan 连接按钮暴露给新手教程并继续复用现有连接逻辑', () => {
  assert.match(profile, /data-tour="maayuan-sync"/)
  assert.match(profile, /@click="openMaaYuanConnect"/)
  assert.match(profile, /aria-controls="maayuan-connect-panel"/)
})

// 路由自动展开、滚动与焦点改由 profileConnectionsUx.spec.js 验证真实行为。
