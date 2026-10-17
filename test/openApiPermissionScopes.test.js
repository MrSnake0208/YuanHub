// 第三方 API 凭证权限选择器的覆盖回归测试（node:test，零依赖）
// 运行：node --test test/openApiPermissionScopes.test.js
//
// 背景：profile.vue 的 permissionGroups 是**前缀白名单**，未被列出的前缀会被
// 静默过滤掉——后端新增 scope 后，界面上根本不会出现对应复选框，用户勾不到，
// 也不会报错。这里锁住不变量：前端已知的每个 scope 前缀都必须在 permissionGroups
// 里有对应分组，避免以后再加 scope 时重演同一个问题。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FALLBACK_DESCRIPTIONS } from '../src/utils/openApiToken.js'

const profile = readFileSync(new URL('../src/pages/user/profile.vue', import.meta.url), 'utf8')

function groupPrefixes() {
  const start = profile.indexOf('const permissionGroups = computed')
  assert.notEqual(start, -1, 'profile.vue 里找不到 permissionGroups')
  const end = profile.indexOf('const FRIENDLY_PERMISSION_TITLES', start)
  assert.notEqual(end, -1, 'profile.vue 里找不到 FRIENDLY_PERMISSION_TITLES')
  const block = profile.slice(start, end)
  return new Set(Array.from(block.matchAll(/startsWith\("([a-z]+):"\)/g)).map((m) => m[1]))
}

const knownPrefixes = Array.from(
  new Set(Object.keys(FALLBACK_DESCRIPTIONS).map((key) => key.split(':')[0]))
)

test('permissionGroups 覆盖前端已知的全部 scope 前缀', () => {
  const prefixes = groupPrefixes()
  for (const prefix of knownPrefixes) {
    assert.equal(
      prefixes.has(prefix),
      true,
      `缺少 "${prefix}:" 分组：该前缀下的权限不会出现在权限选择器里，用户勾不到`
    )
  }
})

test('活动日历 scope 有分组、有中文标题、有兜底描述', () => {
  assert.equal(groupPrefixes().has('calendar'), true)
  assert.match(profile, /"calendar:read": "查看活动日历与订阅"/)
  assert.equal(FALLBACK_DESCRIPTIONS['calendar:read'], '活动日历读取')
})

test('后端返回的 calendar:read 能被选择器渲染出来', () => {
  // 模拟后端权限列表（实测 /user/open-api/permissions 返回 9 项，含 calendar:read）
  const permissions = [
    { scope: 'inventory:read' },
    { scope: 'operator:read' },
    { scope: 'star:capture:write' },
    { scope: 'calendar:read' }
  ]
  const prefixes = groupPrefixes()
  const rendered = permissions.filter((p) => prefixes.has(p.scope.split(':')[0]))
  assert.deepEqual(rendered.map((p) => p.scope), [
    'inventory:read',
    'operator:read',
    'star:capture:write',
    'calendar:read'
  ])
})
