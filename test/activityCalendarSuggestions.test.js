import test from 'node:test'
import assert from 'node:assert/strict'
import { suggestionForm, suggestionPayload, suggestionEventLink, validateSuggestionForm } from '../src/data/activityCalendarSuggestions.js'
import { routes } from '../src/router/routes.js'
import { FEATURE_KEYS } from '../src/config/features.js'
const valid = () => ({ ...suggestionForm('如鸢'), title: ' 活动 ', start_date: '2026-10-03', end_date: '2026-10-10', source_url: 'https://example.com/notice', description: ' 公开介绍 ', submission_note: ' 私人线索 ' })
test('只预填合法游戏，不使用历史浏览日期或默认子账号游戏', () => {
  assert.equal(suggestionForm('如鸢').game, '如鸢')
  assert.equal(suggestionForm('invalid').game, '')
  assert.equal(suggestionForm().game, '')
  assert.equal(suggestionForm('如鸢').start_date, '')
  assert.equal(suggestionForm('如鸢').end_date, '')
})
test('建议校验要求来源，复用日期/手工类别/成对时间校验并限制私人说明', () => {
  assert.deepEqual(validateSuggestionForm(valid()), {})
  for (const source_url of ['', 'javascript:alert(1)', 'ftp://example.com/a']) assert.ok(validateSuggestionForm({ ...valid(), source_url }).source_url)
  assert.ok(validateSuggestionForm({ ...valid(), category: 'RECRUITMENT' }).category)
  assert.ok(validateSuggestionForm({ ...valid(), start_date: '2026-02-30' }).start_date)
  assert.ok(validateSuggestionForm({ ...valid(), end_date: '2026-10-01' }).end_date)
  assert.ok(validateSuggestionForm({ ...valid(), precise: true, start_time: '12:00' }).end_time)
  assert.ok(validateSuggestionForm({ ...valid(), submission_note: 'x'.repeat(1001) }).submission_note)
})
test('提交只发送原始公开字段＋私人说明与请求标识，不泄漏管理字段', () => {
  const body = suggestionPayload({ ...valid(), id: 'ignored', version: 9, enabled: false, source_note: '管理资料', reviewed_by: 'fake' }, 'synthetic-request-id')
  assert.deepEqual(body, { game: '如鸢', title: '活动', category: 'ACTIVITY', start_date: '2026-10-03', end_date: '2026-10-10', start_time: null, end_time: null, description: '公开介绍', source_url: 'https://example.com/notice', submission_note: '私人线索', client_request_id: 'synthetic-request-id' })
  assert.deepEqual(suggestionEventLink(body), { path: '/calendar', query: { game: '如鸢', date: '2026-10-03', view: 'month' } })
})
test('两条建议路由同用日历开关，仅要求登录，不继承beta或游戏子账号门槛', () => {
  for (const path of ['/calendar/suggestions/new', '/calendar/suggestions']) {
    const route = routes.find(route => route.path === path)
    assert.equal(route.meta.requiresAuth, true)
    assert.equal(route.meta.feature, FEATURE_KEYS.ACTIVITY_CALENDAR)
    assert.equal(route.meta.requiresBeta, undefined)
    assert.equal(route.meta.requiresRecruitmentAccess, undefined)
    assert.equal(route.meta.requiredPermission, undefined)
    assert.equal(typeof route.component, 'function')
  }
})
