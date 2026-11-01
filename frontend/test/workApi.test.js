import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createWork,
  deleteWork,
  getOwnedWork,
  getWork,
  getWorkCompatibility,
  listMyWorks,
  listWorks,
  previewWorkCompatibility,
  publishWork,
  unpublishWork,
  updateWork
} from '../src/api/work.js'

function response(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: function () { return 'application/json' } },
    json: async function () { return { status_code: 200, data } }
  }
}

test('Work API 编码分页、路径 ID 与目标平台参数并返回解包数据', async function () {
  const originalFetch = globalThis.fetch
  const paths = []
  globalThis.fetch = async function (path) {
    paths.push(path)
    return response({ path })
  }

  try {
    assert.deepEqual(await listWorks({ page: '1/2', limit: '20&all' }), { path: '/v1/works?page=1%2F2&limit=20%26all' })
    assert.deepEqual(await getWork('7/8'), { path: '/v1/works/7%2F8' })
    assert.deepEqual(await getWorkCompatibility('7/8', 'MAAYUAN & preview'), {
      path: '/v1/works/7%2F8/compatibility?to=MAAYUAN%20%26%20preview'
    })
    assert.deepEqual(paths, [
      '/v1/works?page=1%2F2&limit=20%26all',
      '/v1/works/7%2F8',
      '/v1/works/7%2F8/compatibility?to=MAAYUAN%20%26%20preview'
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Work 创作 API 使用认证、字符串 ID、revision 与基础协议请求体', async function () {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async function (path, options = {}) {
    calls.push({ path, options })
    return response({ id: 'w_0123456789abcdef01234567', revision: 2 })
  }
  const document = { format: 'yuanhub-work', version: 1, rounds: [] }

  try {
    await getOwnedWork('w_a/b')
    await listMyWorks({ page: 2, limit: 5 })
    await createWork(document)
    await updateWork('w_a/b', 3, document)
    await previewWorkCompatibility(document, 'YUANASSIST')
    await publishWork('w_a/b', 4)
    await unpublishWork('w_a/b', 5)
    await deleteWork('w_a/b', 6)

    assert.deepEqual(calls.map(function (call) { return [call.path, call.options.method || 'GET'] }), [
      ['/v1/works/w_a%2Fb', 'GET'],
      ['/v1/works/mine?page=2&limit=5', 'GET'],
      ['/v1/works', 'POST'],
      ['/v1/works/w_a%2Fb', 'PUT'],
      ['/v1/works/compatibility?to=YUANASSIST', 'POST'],
      ['/v1/works/w_a%2Fb/publish', 'POST'],
      ['/v1/works/w_a%2Fb/unpublish', 'POST'],
      ['/v1/works/w_a%2Fb', 'DELETE']
    ])
    assert.deepEqual(JSON.parse(calls[2].options.body), { document })
    assert.deepEqual(JSON.parse(calls[3].options.body), { expected_revision: 3, document })
    assert.deepEqual(JSON.parse(calls[4].options.body), { document })
    assert.deepEqual(JSON.parse(calls[7].options.body), { expected_revision: 6 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('公开详情与保存后兼容性在登录时可携带 owner 身份读取草稿', function () {
  const source = readFileSync(new URL('../src/api/work.js', import.meta.url), 'utf8')
  assert.match(source, /function getWork\(id\)[\s\S]*?auth: true/)
  assert.match(source, /function getWorkCompatibility\(id, target\)[\s\S]*?auth: true/)
})
