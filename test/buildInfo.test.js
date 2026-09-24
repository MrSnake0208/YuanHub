import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectBuildInfo, readFrontendCommit, readProductVersion } from '../vite.config.js'
import {
  UNKNOWN_BUILD_VALUE,
  feedbackDiagnostics,
  formatBuildInfo,
  normalizeBuildInfo,
  versionLabel
} from '../src/config/buildInfo.js'

test('VERSION 是唯一产品版本来源且格式为可发布的版本号', function () {
  const raw = readFileSync(new URL('../VERSION', import.meta.url), 'utf8')
  const value = raw.trim()
  assert.notEqual(value, '')
  assert.equal(value, raw.trim(), 'VERSION 不应包含多余空白')
  // 允许 0.9.0-beta.1 / 1.0.0 / 1.1.2 这类形式
  assert.match(value, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
})

test('构建期读取 VERSION 与 commit，缺 Git 时降级而不抛错', function () {
  const version = readProductVersion()
  assert.equal(version, readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim())

  const commit = readFrontendCommit()
  assert.match(commit, /^(?:[0-9a-f]{7,40}|unknown)$/)

  const info = collectBuildInfo('/path/that/does/not/exist', new Date('2026-01-02T03:04:05Z'))
  assert.equal(info.productVersion, UNKNOWN_BUILD_VALUE)
  assert.equal(info.frontendCommit, UNKNOWN_BUILD_VALUE)
  assert.equal(info.buildTime, '2026-01-02T03:04:05.000Z')
})

test('normalizeBuildInfo 对缺失字段降级而不是抛错', function () {
  const empty = normalizeBuildInfo(undefined)
  assert.deepEqual(
    { ...empty },
    { productVersion: '0.0.0-dev', frontendCommit: 'unknown', buildTime: 'unknown' }
  )
  const partial = normalizeBuildInfo({ productVersion: ' 1.2.3 ', frontendCommit: '', buildTime: 'unknown' })
  assert.equal(partial.productVersion, '1.2.3')
  assert.equal(partial.frontendCommit, 'unknown')
  assert.equal(partial.buildTime, 'unknown')
  assert.equal(normalizeBuildInfo({ productVersion: 'x', frontendCommit: 'abc1234', buildTime: 't' }).frontendCommit, 'abc1234')
})

test('versionLabel 统一带 v 前缀且不重复叠加', function () {
  assert.equal(versionLabel('0.9.0-beta.1'), 'v0.9.0-beta.1')
  assert.equal(versionLabel('v0.9.0-beta.1'), 'v0.9.0-beta.1')
})

test('formatBuildInfo 输出低权重单行诊断文案', function () {
  assert.equal(
    formatBuildInfo({ productVersion: '0.9.0-beta.1', frontendCommit: 'abc1234', buildTime: 't' }),
    'YuanHub v0.9.0-beta.1 · Build abc1234'
  )
  // 无 Git 环境时不显示无意义的 Build unknown
  assert.equal(
    formatBuildInfo({ productVersion: '0.9.0-beta.1', frontendCommit: 'unknown', buildTime: 'unknown' }),
    'YuanHub v0.9.0-beta.1'
  )
})

test('feedbackDiagnostics 使用后端 snake_case 契约且三种字段齐全', function () {
  const payload = feedbackDiagnostics({ productVersion: '0.9.0-beta.1', frontendCommit: 'abc1234', buildTime: '2026-01-02T03:04:05Z' })
  assert.deepEqual(Object.keys(payload).sort(), ['build_time', 'frontend_commit', 'product_version'])
  assert.deepEqual(payload, {
    product_version: '0.9.0-beta.1',
    frontend_commit: 'abc1234',
    build_time: '2026-01-02T03:04:05Z'
  })
  // 缺字段时也必须给出可存储的降级值，不能出现 undefined（否则后端收不到该键）
  const degraded = feedbackDiagnostics(undefined)
  assert.equal(typeof degraded.product_version, 'string')
  assert.notEqual(degraded.product_version, '')
  for (const value of Object.values(degraded)) assert.equal(typeof value, 'string')
})
