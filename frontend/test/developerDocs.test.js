import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseDeveloperMarkdown, resolveDeveloperLink } from '../src/utils/developerMarkdown.js'
import { developerDocuments } from '../src/data/developerManifest.js'
import { developerReferences, developerUseCases, operatorReadGuide, operatorReadPrompt } from '../src/data/developerUseCases.js'
import { routes } from '../src/router/routes.js'
import { checkDeveloperDocs } from '../scripts/check-developer-docs.mjs'
import { scrollBehavior } from '../src/router/scrollBehavior.js'

test('only reviewed exact files are public and every document link resolves', async () => {
  const result = await checkDeveloperDocs()
  assert.ok(result.documents >= 20)
  assert.ok(result.files > result.documents)
})

test('headings preserve Chinese and code labels and give duplicates distinct stable anchors', () => {
  const { headings } = parseDeveloperMarkdown('# 标题\n\n## 接入 `V5`\n\n## 接入 `V5`\n\n### 完成任务')
  assert.deepEqual(headings.map(item => item.id), ['doc-接入-v5', 'doc-接入-v5-1', 'doc-完成任务'])
  assert.equal(headings[0].title, '接入 V5')
})

test('unsafe schemes, file traversal, private documents and remote images cannot become approved links', () => {
  for (const value of ['javascript:alert(1)', 'javascript&#58;alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.test/x', '\\evil.test', 'java\nscript:x', '../api-contract.md', '../../.env', '/admin/beta', '/open-api/operator/current']) {
    assert.equal(resolveDeveloperLink(value, 'developers/index.md', String), null, value)
  }
  assert.equal(resolveDeveloperLink('../operator-growth-data-exchange-protocol-v5.md', 'developers/index.md', String).href, '/developers/protocols/operator-v5')
  assert.equal(resolveDeveloperLink('./schemas/recruitment-exchange-v1.schema.json', 'developers/recruitment-v1.md', String).download, 'recruitment-exchange-v1.schema.json')
  assert.equal(resolveDeveloperLink('https://example.org/protocol', 'developers/index.md', String).external, true)
})

test('all developer routes are lazy and have no auth, beta, feature or admin requirements', () => {
  for (const route of routes.filter(item => item.path.startsWith('/developers'))) {
    assert.equal(typeof route.component, 'function')
    for (const key of ['requiresAuth', 'requiresBeta', 'feature', 'requiresAdmin', 'requiredPermission']) assert.equal(route.meta[key], undefined)
  }
  for (const path of ['/developers', '/developers/guide', '/developers/api', '/developers/protocols', '/developers/changelog']) assert.ok(routes.find(route => route.path === path))
  assert.equal(scrollBehavior({ path: '/developers/guide', hash: '#doc-接入' }, {}, null), false)
})

test('every published Schema uses self-contained references', async () => {
  for (const doc of developerDocuments) {
    for (const file of doc.downloads.filter(file => file.includes('.schema.'))) {
      const schema = JSON.parse(await readFile(new URL('../docs/' + file, import.meta.url), 'utf8'))
      function visit(value) {
        if (!value || typeof value !== 'object') return
        if (value.$ref) {
          assert.ok(value.$ref.startsWith('#/'), file + ' must not require an unpublished remote schema')
          const target = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key.replace(/~1/g, '/').replace(/~0/g, '~')], schema)
          assert.notEqual(target, undefined, file + ': ' + value.$ref)
        }
        Object.values(value).forEach(visit)
      }
      visit(schema)
    }
  }
})

test('scenario and reference links target approved documents and existing chapter anchors', async () => {
  for (const entry of [...developerUseCases, ...developerReferences,
    { path: '/developers/guide#doc-用户操作说明' },
    { path: '/developers/gaps#doc-后续任务建议正式第三方应用授权' }
  ]) {
    const [path, hash] = entry.path.split('#')
    assert.ok(resolveDeveloperLink(entry.path, 'developers/index.md', String), entry.path)
    if (!hash) continue
    const doc = developerDocuments.find(doc => doc.path === path)
    const body = await readFile(new URL('../docs/' + doc.source, import.meta.url), 'utf8')
    assert.ok(parseDeveloperMarkdown(body).headings.some(heading => heading.id === decodeURIComponent(hash)), entry.path)
  }
})

test('operator tutorial uses the current read DTO and explicit read-only/environment boundaries', () => {
  const { example, curl, faqs } = operatorReadGuide
  assert.equal(example.status_code, 200)
  assert.ok(Array.isArray(example.data))
  const [profile] = example.data
  assert.equal(profile.account_id, 'example_account')
  assert.ok(!Array.isArray(profile.entries))
  const entry = profile.entries.EXAMPLE_OPERATOR_ID
  assert.equal(entry.level, 60)
  assert.equal(entry.star_level, 3)
  assert.deepEqual(entry.huaji, { owned: true, stage: 1, awakened: false })
  for (const term of ['GET /open-api/operator/current', 'operator:read', 'Authorization: Bearer <OpenAPI Token>', 'account_id', 'game', 'status_code', 'data', 'entries', '/v1/operator/catalog', 'data.operators', 'V5', 'BASE_URL', 'OPENAPI_TOKEN', '401', '403', '运行命令', '第三方应用', '现有代码', '微信小程序', '服务端会话', '断开本应用', '最多 5 个 Token', 'Beta', '不虚构 OAuth', '禁止打包进分发软件']) {
    assert.ok(operatorReadPrompt.includes(term), term)
  }
  assert.ok(curl.includes('$BASE_URL/open-api/operator/current'))
  assert.ok(curl.includes('read -r -s OPENAPI_TOKEN'))
  assert.equal(faqs.length, 4)
})

test('published server example reads credentials for the authenticated application user only', async () => {
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, ...options })
    return { ok: true, status: 200, json: async () => ({ status_code: 200, data: [{ account_id: options.headers.Authorization }] }) }
  }
  const readOperators = new Function('fetch', 'AbortSignal', 'process',
    operatorReadGuide.serverExample.replace('export ', '') + '; return readOperatorsForUser;'
  )(fetch, AbortSignal, { env: { BASE_URL: 'https://api.example.test' } })
  const users = []
  const store = { getForUser: async userId => {
    users.push(userId)
    return userId === 'unconnected' ? null : { token: 'synthetic-' + userId }
  } }
  assert.deepEqual(await readOperators('alice', store), [{ account_id: 'Bearer synthetic-alice' }])
  assert.deepEqual(await readOperators('bob', store), [{ account_id: 'Bearer synthetic-bob' }])
  await assert.rejects(() => readOperators('', store), /请先登录/)
  await assert.rejects(() => readOperators('unconnected', store), /请先连接/)
  assert.deepEqual(users, ['alice', 'bob', 'unconnected'])
  assert.equal(requests.length, 2)
  assert.ok(requests.every(request => request.url === 'https://api.example.test/open-api/operator/current' && request.redirect === 'error'))
})
