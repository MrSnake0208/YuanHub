import test from 'node:test'
import assert from 'node:assert/strict'
import { getWork, getWorkCompatibility, listWorks } from '../src/api/work.js'

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
