import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findSimilarFeedback, listPublicFeedback, normalizePublicFeedback } from '../src/api/coCreation.js'
import {
  PUBLIC_SORT_OPTIONS,
  PUBLIC_STATUS_OPTIONS,
  publicStatusLabel,
  publicTypeLabel,
  supportActionLabel
} from '../src/utils/feedbackPublic.js'

function apiResponse(data) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    async json() { return { status_code: 200, message: 'ok', data } }
  }
}

async function withFetch(handler, fn) {
  const previous = globalThis.fetch
  globalThis.fetch = handler
  try {
    return await fn()
  } finally {
    globalThis.fetch = previous
  }
}

test('normalizePublicFeedback accepts snake_case and camelCase payloads', () => {
  const snake = normalizePublicFeedback({
    id: 'rpt_1',
    public_title: '公开标题',
    public_summary: '公开摘要',
    type: 'feature',
    public_status: 'PLANNED',
    support_count: 7,
    supported_by_current_user: true,
    published_at: '2026-09-01T00:00:00Z',
    public_updated_at: '2026-09-02T00:00:00Z',
    merged_into: { id: 'rpt_main', public_title: '主反馈' }
  })
  assert.equal(snake.publicTitle, '公开标题')
  assert.equal(snake.publicSummary, '公开摘要')
  assert.equal(snake.type, 'FEATURE')
  assert.equal(snake.publicStatus, 'PLANNED')
  assert.equal(snake.supportCount, 7)
  assert.equal(snake.supportedByCurrentUser, true)
  assert.equal(snake.mergedInto.id, 'rpt_main')

  const camel = normalizePublicFeedback({ id: 'rpt_2', publicTitle: 'T', type: 'BUG', supportCount: 2 })
  assert.equal(camel.publicTitle, 'T')
  assert.equal(camel.supportCount, 2)
  assert.equal(camel.supportedByCurrentUser, false)
  assert.equal(camel.mergedInto, null)
})

test('status/type/support label helpers are stable and cover the agreed mapping', () => {
  assert.equal(publicStatusLabel('COLLECTING'), '收集中')
  assert.equal(publicStatusLabel('CONFIRMED'), '已确认')
  assert.equal(publicStatusLabel('PLANNED'), '计划中')
  assert.equal(publicStatusLabel('IN_PROGRESS'), '开发中')
  assert.equal(publicStatusLabel('COMPLETED'), '已完成')
  assert.equal(publicStatusLabel('NOT_PLANNED'), '暂不处理')
  assert.equal(publicTypeLabel('FEATURE'), '功能建议')
  assert.equal(publicTypeLabel('EXPERIENCE'), '体验优化')
  assert.equal(supportActionLabel('BUG'), '我也遇到了')
  assert.equal(supportActionLabel('FEATURE'), '我也想要')
  assert.equal(supportActionLabel('EXPERIENCE'), '支持这个建议')
  assert.deepEqual(PUBLIC_SORT_OPTIONS.map(option => option.key), ['hot', 'latest', 'updated'])
  assert.equal(PUBLIC_STATUS_OPTIONS.length, 6)
})

test('listPublicFeedback sends filters and normalizes the page envelope', async () => {
  let captured = null
  const result = await withFetch(async (url, opts) => {
    captured = { url, opts }
    return apiResponse({
      items: [{ id: 'rpt_1', public_title: '标题', type: 'BUG', support_count: 3 }],
      total: 1,
      page: 2,
      page_size: 12
    })
  }, () => listPublicFeedback({ page: 2, pageSize: 12, type: 'BUG', status: 'PLANNED', keyword: '账号', sort: 'hot' }))

  assert.match(captured.url, /^\/v1\/reports\/public\?/)
  assert.match(captured.url, /page=2/)
  assert.match(captured.url, /sort=hot/)
  assert.match(captured.url, /keyword=%E8%B4%A6%E5%8F%B7/)
  assert.equal(result.total, 1)
  assert.equal(result.items[0].publicTitle, '标题')
  assert.equal(result.items[0].supportCount, 3)
})

test('normalizePublicFeedback keeps version labels for roadmap/detail', () => {
  const item = normalizePublicFeedback({
    id: 'rpt_versioned',
    target_version_label: '0.0.2',
    completed_version_label: '0.0.1-beta.5'
  })
  assert.equal(item.targetVersionLabel, '0.0.2')
  assert.equal(item.completedVersionLabel, '0.0.1-beta.5')
})

test('listPublicFeedback forwards completedVersionId for changelog back-reference', async () => {
  let captured = null
  await withFetch(async url => {
    captured = url
    return apiResponse({ items: [], total: 0, page: 1, page_size: 12 })
  }, () => listPublicFeedback({ completedVersionId: 'chg_1', page: 1, pageSize: 12 }))

  assert.match(captured, /completedVersionId=chg_1/)
})

test('findSimilarFeedback returns a normalized list and encodes the title', async () => {
  let captured = null
  const result = await withFetch(async url => {
    captured = url
    return apiResponse([{ id: 'rpt_9', public_title: '相似', type: 'FEATURE', support_status: null }])
  }, () => findSimilarFeedback('账号显示错误', 'BUG'))

  assert.match(captured, /\/v1\/reports\/public\/similar\?title=/)
  assert.match(captured, /type=BUG/)
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'rpt_9')
})
