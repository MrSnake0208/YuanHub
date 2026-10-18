import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseDeveloperMarkdown, resolveDeveloperLink } from '../src/utils/developerMarkdown.js'
import { developerDocuments } from '../src/data/developerManifest.js'
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
