import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Editor } from '@tiptap/core'
import {
  listChangelog,
  rejectChangelog,
  saveChangelogDraft
} from '../src/api/changelog.js'
import {
  changelogExtensions,
  emptyChangelogBody,
  isChangelogBodyEmpty
} from '../src/utils/changelogContent.js'
import { routes } from '../src/router/routes.js'

function apiResponse(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get() { return null } },
    async json() { return { status_code: 200, data } }
  }
}

async function withFetch(handler, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  try { return await fn() } finally { globalThis.fetch = previous }
}

test('normalizes public changelog pages', async function () {
  await withFetch(async function () {
    return apiResponse({
      has_next: false,
      page: 1,
      total: 1,
      data: [{ id: 'chg_1', revision: 2, title: '新版', version_label: '2.0', body: emptyChangelogBody(), published_at: '2026-09-08T00:00:00Z' }]
    })
  }, async function () {
    const result = await listChangelog()
    assert.equal(result.data[0].versionLabel, '2.0')
    assert.equal(result.data[0].publishedAt, '2026-09-08T00:00:00Z')
    assert.equal(result.total, 1)
  })
})

test('sends optimistic-lock and rejection fields with backend names', async function () {
  const requests = []
  await withFetch(async function (url, options) {
    requests.push({ url: String(url), body: JSON.parse(options.body) })
    return apiResponse({ id: 'chg_1', version: 4 })
  }, async function () {
    await saveChangelogDraft('chg/1', { title: ' 标题 ', versionLabel: ' 2.0 ', body: emptyChangelogBody(), expectedVersion: 3 })
    await rejectChangelog('chg/1', 4, '补充说明')
  })
  assert.match(requests[0].url, /chg%2F1\/draft$/)
  assert.deepEqual(requests[0].body, { title: '标题', version_label: '2.0', body: emptyChangelogBody(), expected_version: 3 })
  assert.deepEqual(requests[1].body, { expected_version: 4, reason: '补充说明' })
})

test('keeps editor output inside the server allowlist', function () {
  const editor = new Editor({ extensions: changelogExtensions(), content: emptyChangelogBody() })
  assert.equal(editor.schema.nodes.codeBlock, undefined)
  assert.equal(editor.schema.nodes.horizontalRule, undefined)
  assert.equal(editor.schema.marks.code, undefined)
  assert.equal(editor.schema.marks.strike, undefined)
  assert.equal(editor.schema.marks.underline, undefined)
  editor.commands.setImage({ src: '/media/shot.webp', alt: '截图', media_id: 'med_1' })
  assert.deepEqual({ ...editor.getJSON().content[0].attrs }, {
    src: '/media/shot.webp', alt: '截图', title: null, media_id: 'med_1'
  })
  editor.commands.setContent({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '站内链接', marks: [{ type: 'link', attrs: { href: '/changelog' } }] }] }]
  })
  assert.deepEqual(Object.keys(editor.getJSON().content[0].content[0].marks[0].attrs), ['href', 'target', 'rel', 'class'])
  editor.destroy()
})

test('detects empty text while accepting text and images', function () {
  assert.equal(isChangelogBodyEmpty(emptyChangelogBody()), true)
  assert.equal(isChangelogBodyEmpty({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '  ' }] }] }), true)
  assert.equal(isChangelogBodyEmpty({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '更新' }] }] }), false)
  assert.equal(isChangelogBodyEmpty({ type: 'doc', content: [{ type: 'image', attrs: { media_id: 'med_1' } }] }), false)
})

test('registers public and any-permission admin routes', function () {
  const publicRoute = routes.find(function (route) { return route.path === '/changelog' })
  const adminRoute = routes.find(function (route) { return route.path === '/admin/changelog' })
  assert.equal(publicRoute.meta.requiresAuth, undefined)
  assert.deepEqual(adminRoute.meta.requiredAnyPermission, ['changelog:write', 'changelog:review'])

  const sidebar = readFileSync(new URL('../src/components/IslandSidebar.vue', import.meta.url), 'utf8')
  assert.equal((sidebar.match(/to="\/changelog"/g) || []).length, 2)
})
