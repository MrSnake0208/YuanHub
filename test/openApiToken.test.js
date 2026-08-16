// 前端第三方 API Token 纯函数单元测试（node:test，零依赖）
// 运行：node --test test/openApiToken.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scopeCodes,
  descByCode,
  scopeDesc,
  isReadonly,
  formatCreateTime
} from '../src/utils/openApiToken.js'

const PERMISSIONS = [
  { key: 'inventory:read', code: 10001, desc: '库存数据读取' },
  { key: 'inventory:write', code: 10002, desc: '库存数据写入' }
]
const FALLBACK = { 10001: '库存数据读取（只读）', 10002: '库存数据写入（只写）' }

test('scopeCodes 数组原样返回', () => {
  assert.deepEqual(scopeCodes([10001, 10002]), [10001, 10002])
})

test('scopeCodes 单个数字包装为数组', () => {
  assert.deepEqual(scopeCodes(10001), [10001])
})

test('scopeCodes null/undefined 返回空数组', () => {
  assert.deepEqual(scopeCodes(null), [])
  assert.deepEqual(scopeCodes(undefined), [])
})

test('descByCode 从后端权限列表命中 desc', () => {
  assert.equal(descByCode(10001, PERMISSIONS, FALLBACK), '库存数据读取')
})

test('descByCode 后端缺失时回退兜底映射', () => {
  assert.equal(descByCode(10001, [], FALLBACK), '库存数据读取（只读）')
})

test('descByCode 完全未知时返回占位', () => {
  assert.equal(descByCode(99999, PERMISSIONS, FALLBACK), '权限 99999')
})

test('scopeDesc 单权限返回单描述', () => {
  assert.equal(scopeDesc([10001], PERMISSIONS, FALLBACK), '库存数据读取')
})

test('scopeDesc 多权限用顿号拼接', () => {
  assert.equal(scopeDesc([10001, 10002], PERMISSIONS, FALLBACK), '库存数据读取、库存数据写入')
})

test('scopeDesc 空数组返回未知权限', () => {
  assert.equal(scopeDesc([], PERMISSIONS, FALLBACK), '未知权限')
})

test('isReadonly 单个 10001 为真', () => {
  assert.equal(isReadonly([10001]), true)
  assert.equal(isReadonly(10001), true)
})

test('isReadonly 只写或双权限为假', () => {
  assert.equal(isReadonly([10002]), false)
  assert.equal(isReadonly([10001, 10002]), false)
})

test('formatCreateTime 格式化 epoch 毫秒为本地时间', () => {
  // 2023-11-14 22:13:20 UTC（本地时区与机器有关，这里校验「格式」而非具体时区值）
  const out = formatCreateTime(1700000000000)
  assert.match(out, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
})

test('formatCreateTime 非法输入返回空串', () => {
  assert.equal(formatCreateTime(0), '')
  assert.equal(formatCreateTime('abc'), '')
  assert.equal(formatCreateTime(null), '')
})
