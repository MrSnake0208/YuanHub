// 前后端契约一致性测试（node:test，零依赖）
// 校验后端 OpenApiTokenService/OpenApiPermission/InventoryController 与前端
// openApi.js/inventory.js/profile.vue/utils 的字段名、路径、scope key 一致，
// 防止再次出现 create_time vs created_at、{key,code,desc} vs {scope,description}、
// token 明文回传、缺少 account_id 等字段漂移。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 两个仓库的共同父目录：/Users/mrsnake/Desktop/yituliu
// test/ 位于 YuanHub/ 下，故向上两级到共同父目录
const ROOT = new URL('../../', import.meta.url).pathname

function readRel(rel) {
  return readFileSync(ROOT + rel, 'utf8')
}

const backendService = readRel('BackEndV3-Share/src/main/kotlin/com/lhs/share/openapi/OpenApiTokenService.kt')
const backendPermission = readRel('BackEndV3-Share/src/main/kotlin/com/lhs/share/openapi/OpenApiPermission.kt')
const backendTokenCtrl = readRel('BackEndV3-Share/src/main/kotlin/com/lhs/share/openapi/OpenApiTokenController.kt')
const backendGenerateRequest = readRel('BackEndV3-Share/src/main/kotlin/com/lhs/share/controller/request/openapi/OpenApiTokenGenerateRequest.kt')
const backendInventoryCtrl = readRel('BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/inventory/InventoryController.kt')
const backendRecordPage = readRel('BackEndV3-Share/src/main/kotlin/com/lhs/share/hub/controller/inventory/response/InventoryRecordPageResponse.kt')

const frontendApi = readRel('YuanHub/src/api/openApi.js')
const frontendInventory = readRel('YuanHub/src/api/inventory.js')
const frontendProfile = readRel('YuanHub/src/pages/user/profile.vue')
const frontendUtil = readRel('YuanHub/src/utils/openApiToken.js')
const frontendInventoryPage = readRel('YuanHub/src/pages/inventory/index.vue')

test('token 列表字段契约：token_id/account_id/account_name/scopes/created_at，且不再返回 token 明文', () => {
  assert.match(backendService, /data class OpenApiTokenListItemDto\(/)
  assert.match(backendService, /val accountName/)
  assert.match(backendService, /val scopes: List<String>/)
  assert.match(backendService, /val createdAt: Instant/)
  // 前端内部消费 token_id（列表 key / 删除），但不把它渲染给用户
  assert.match(frontendProfile, /t\.token_id/)
  assert.doesNotMatch(frontendProfile, /\{\{\s*t\.token_id\s*\}\}/)
  assert.match(frontendProfile, /t\.account_name/)
  assert.match(frontendProfile, /t\.scopes/)
  assert.match(frontendProfile, /t\.created_at/)
  // 前端列表不再消费 t.token 明文或旧的 create_time
  assert.doesNotMatch(frontendProfile, /t\.token\b/)
  assert.doesNotMatch(frontendProfile, /t\.create_time/)
})

test('权限列表字段契约：scope/description（字符串 key，非数字 code）', () => {
  assert.match(backendPermission, /OpenApiPermissionDto\(scope = it\.key, description = it\.desc\)/)
  // 前端 descByKey 在 utils/openApiToken.js 中按 p.scope 匹配、读 hit.description
  assert.match(frontendUtil, /p\.scope/)
  assert.match(frontendUtil, /hit\.description/)
  // 确保前端不再依赖数字 code / desc 字段
  assert.doesNotMatch(frontendUtil, /p\.code/)
  assert.doesNotMatch(frontendUtil, /hit\.desc\b/)
})

test('scope key 前后端一致：inventory:read/write/export', () => {
  for (const k of ['inventory:read', 'inventory:write', 'inventory:export']) {
    assert.ok(backendPermission.includes(k), '后端缺 ' + k)
    assert.ok(frontendApi.includes(k), '前端缺 ' + k)
  }
})

test('生成接口 body 字段 account_id/scopes/remark 前后端一致', () => {
  assert.match(backendGenerateRequest, /val accountId: String/)
  assert.match(backendGenerateRequest, /val scopes: List<String>/)
  assert.match(backendGenerateRequest, /val remark: String\?/)
  assert.match(frontendApi, /account_id: accountId/)
  assert.match(frontendApi, /scopes, remark/)
})

test('Token 生成按权限预设选择并提交预设 scopes', () => {
  assert.match(frontendProfile, /v-model="genPresetId"/)
  assert.match(frontendProfile, /type="radio"/)
  assert.match(frontendProfile, /selectedPreset\.value\.scopes\.slice/)
  assert.match(frontendProfile, /tokenPresetName\(t\.scopes\)/)
  assert.doesNotMatch(frontendProfile, /type="checkbox"/)
})

test('删除接口按 token_id：DELETE /user/open-api/tokens/{tokenId}', () => {
  assert.match(backendTokenCtrl, /"\/tokens\/\{tokenId\}"/)
  assert.match(frontendApi, /\/user\/open-api\/tokens\/' \+ encodeURIComponent\(tokenId\)/)
})

test('库存账号 CRUD 路径前后端一致', () => {
  assert.match(backendInventoryCtrl, /PostMapping\("\/accounts"/)
  assert.match(backendInventoryCtrl, /GetMapping\("\/accounts"/)
  assert.match(backendInventoryCtrl, /PatchMapping\("\/accounts\/\{accountId\}"/)
  assert.match(backendInventoryCtrl, /DeleteMapping\("\/accounts\/\{accountId\}"/)
  assert.match(frontendInventory, /PATH \+ '\/accounts'/)
  assert.match(frontendInventory, /PATH \+ '\/accounts\/' \+ encodeURIComponent\(accountId\)/)
})

test('库存查询携带 account_id（后端必填 + 前端透传）', () => {
  assert.match(backendInventoryCtrl, /account_id/)
  assert.match(frontendInventory, /account_id/)
})

test('导出接口 raw 返回（无 ApiResult 包装）', () => {
  assert.match(frontendInventory, /raw: true/)
})

test('记录列表游标分页：items/next_cursor', () => {
  assert.match(backendRecordPage, /val items: List<InventoryRecordListItemDto>/)
  assert.match(backendRecordPage, /val nextCursor: String\?/)
  assert.match(frontendInventoryPage, /next_cursor/)
})
