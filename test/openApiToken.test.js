// 前端第三方 API Token 纯函数单元测试（node:test，零依赖）
// 运行：node --test test/openApiToken.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scopeKeys,
  descByKey,
  scopeDesc,
  isReadonly,
  isWriteonly,
  isInventoryScope,
  isOperatorScope,
  scopeDomain,
  FALLBACK_DESCRIPTIONS,
  formatCreateTime
} from '../src/utils/openApiToken.js'

const PERMISSIONS = [
  { scope: 'inventory:read', description: '库存数据读取' },
  { scope: 'inventory:write', description: '库存数据写入' },
  { scope: 'inventory:export', description: '库存数据导出' },
  { scope: 'operator:read', description: '密探数据读取' },
  { scope: 'operator:write', description: '密探数据写入' },
  { scope: 'operator:export', description: '密探数据导出' }
]
const FALLBACK = FALLBACK_DESCRIPTIONS

test('scopeKeys 数组原样返回', () => {
  assert.deepEqual(scopeKeys(['inventory:read', 'inventory:write']), ['inventory:read', 'inventory:write'])
})
test('scopeKeys 单个字符串包装为数组', () => {
  assert.deepEqual(scopeKeys('inventory:read'), ['inventory:read'])
})

test('scopeKeys null/undefined/空串返回空数组', () => {
  assert.deepEqual(scopeKeys(null), [])
  assert.deepEqual(scopeKeys(undefined), [])
  assert.deepEqual(scopeKeys(''), [])
})

test('descByKey 从后端权限列表命中 description', () => {
  assert.equal(descByKey('inventory:read', PERMISSIONS, FALLBACK), '库存数据读取')
})

test('descByKey 后端缺失时回退兜底映射', () => {
  assert.equal(descByKey('inventory:read', [], FALLBACK), '库存数据读取（只读）')
})

test('descByKey 完全未知时返回 key 本身', () => {
  assert.equal(descByKey('unknown:scope', PERMISSIONS, FALLBACK), 'unknown:scope')
})

test('scopeDesc 单权限返回单描述', () => {
  assert.equal(scopeDesc(['inventory:read'], PERMISSIONS, FALLBACK), '库存数据读取')
})

test('scopeDesc 多权限用顿号拼接', () => {
  assert.equal(scopeDesc(['inventory:read', 'inventory:write'], PERMISSIONS, FALLBACK), '库存数据读取、库存数据写入')
})

test('scopeDesc 空数组返回未知权限', () => {
  assert.equal(scopeDesc([], PERMISSIONS, FALLBACK), '未知权限')
})

test('isReadonly 仅单个 inventory:read 为真', () => {
  assert.equal(isReadonly(['inventory:read']), true)
  assert.equal(isReadonly('inventory:read'), true)
})

test('isReadonly 只写或双权限为假', () => {
  assert.equal(isReadonly(['inventory:write']), false)
  assert.equal(isReadonly(['inventory:read', 'inventory:write']), false)
})

test('isWriteonly 仅单个 inventory:write 为真', () => {
  assert.equal(isWriteonly(['inventory:write']), true)
  assert.equal(isWriteonly(['inventory:read']), false)
})

test('isReadonly/isWriteonly 支持 operator 单权限', () => {
  assert.equal(isReadonly(['operator:read']), true)
  assert.equal(isReadonly('operator:read'), true)
  assert.equal(isReadonly(['operator:write']), false)
  assert.equal(isWriteonly(['operator:write']), true)
  assert.equal(isWriteonly(['operator:read']), false)
})

test('isInventoryScope/isOperatorScope 前缀判断', () => {
  assert.equal(isInventoryScope('inventory:read'), true)
  assert.equal(isInventoryScope('operator:read'), false)
  assert.equal(isOperatorScope('operator:export'), true)
  assert.equal(isOperatorScope('inventory:export'), false)
})

test('scopeDomain 识别库存/密探/空/混合', () => {
  assert.equal(scopeDomain(['inventory:read', 'inventory:write']), 'inventory')
  assert.equal(scopeDomain(['operator:read']), 'operator')
  assert.equal(scopeDomain('operator:export'), 'operator')
  assert.equal(scopeDomain([]), '')
  assert.equal(scopeDomain(['inventory:read', 'operator:read']), 'mixed')
  assert.equal(scopeDomain(null), '')
})

test('FALLBACK_DESCRIPTIONS 覆盖六个 scope', () => {
  assert.equal(FALLBACK_DESCRIPTIONS['inventory:read'], '库存数据读取（只读）')
  assert.equal(FALLBACK_DESCRIPTIONS['operator:read'], '密探数据读取（只读）')
  assert.equal(FALLBACK_DESCRIPTIONS['operator:write'], '密探数据写入（只写）')
  assert.equal(FALLBACK_DESCRIPTIONS['operator:export'], '密探数据导出')
})

test('formatCreateTime 格式化 ISO 字符串为本地时间', () => {
  const out = formatCreateTime('2026-08-17T04:45:48Z')
  assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
})

test('formatCreateTime 兼容 epoch 毫秒数字', () => {
  const out = formatCreateTime(1700000000000)
  assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
})

test('formatCreateTime 非法输入返回空串', () => {
  assert.equal(formatCreateTime(''), '')
  assert.equal(formatCreateTime(null), '')
  assert.equal(formatCreateTime(undefined), '')
  assert.equal(formatCreateTime('not-a-date'), '')
})
