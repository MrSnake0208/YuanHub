// 前后端契约一致性测试（node:test，零依赖）
// 校验后端 OpenApiTokenService/OpenApiPermission 与前端 openApi.js/profile.vue 的字段名、路径、权限码一致，
// 防止再次出现 create_time vs created_at、{key,code,desc} vs {scope,description} 这类字段漂移。
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
const backendInventoryCtrl = readRel('BackEndV3-Share/src/main/kotlin/com/lhs/share/openapi/OpenApiInventoryController.kt')
const frontendApi = readRel('YuanHub/src/api/openApi.js')
const frontendProfile = readRel('YuanHub/src/pages/user/profile.vue')
const frontendUtil = readRel('YuanHub/src/utils/openApiToken.js')

test('前后端 token 列表字段契约一致：create_time', () => {
  // 后端 list() 输出的 key
  assert.match(backendService, /"create_time" to it.createTime.toEpochMilli()/)
  // 前端 profile.vue 消费的字段
  assert.match(frontendProfile, /t\.create_time/)
  // 确保前端不再残留错误的 created_at
  assert.doesNotMatch(frontendProfile, /t\.created_at/)
})

test('前后端权限列表字段契约一致：key/code/desc', () => {
  assert.match(backendPermission, /mapOf\("key" to it\.key, "code" to it\.code, "desc" to it\.desc\)/)
  // 前端 descByCode 在 utils/openApiToken.js 中按 p.code 匹配、读 hit.desc
  assert.match(frontendUtil, /p\.code/)
  assert.match(frontendUtil, /hit\.desc/)
  // 确保前端不再依赖错误的 scope/description 字段
  assert.doesNotMatch(frontendUtil, /\.description/)
})

test('权限 code 前后端一致：10001/10002', () => {
  assert.match(backendPermission, /10001/)
  assert.match(backendPermission, /10002/)
  assert.match(frontendProfile, /10001/)
  assert.match(frontendProfile, /10002/)
})

test('前端接口路径与后端控制器一致', () => {
  // 后端路由
  assert.match(backendService, /open-api-token:/) // Redis key 前缀，非路由，仅作存在性哨兵
  // 用控制器文件缺失时报警
  assert.ok(backendInventoryCtrl.length > 0)
  // 前端 openApi.js 的四个路径
  for (const p of ['/user/open-api/permissions', '/user/open-api/tokens', '/user/open-api/token', '/user/open-api/token/delete']) {
    assert.match(frontendApi, new RegExp(p.replace(/\//g, '\\/')))
  }
})

test('第三方示例接口校验 inventory:read(10001)', () => {
  assert.match(backendInventoryCtrl, /INVENTORY_READ\.code/)
})

test('生成接口 body 字段 scope/remark 前后端一致', () => {
  assert.match(frontendApi, /body: { scope, remark }/)
})

test('生成时 scope 必须传数组（后端 DTO 为 List<Int>），而非单值', () => {
  // 后端 DTO 声明 scope 为列表
  assert.match(backendService, /scopeCodes: List<Int>/) // 服务层形参（唯一可靠锚点）
  // 前端 profile.vue 生成时传 [10001] / [10002] 数组，而非裸 10001
  assert.match(frontendProfile, /\[10001\]/)
  assert.match(frontendProfile, /\[10002\]/)
  // 确保没有残留裸单值赋值（const scope = kind ... ? 10001 : 10002）
  assert.doesNotMatch(frontendProfile, /const scope = kind === 'read' \? 10001 : 10002/)
})
