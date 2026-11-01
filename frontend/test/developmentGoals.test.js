import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDevelopmentGoal, listDevelopmentGoals, saveDevelopmentGoal } from '../src/api/developmentGoals.js'
import { routes } from '../src/router/routes.js'
import { auth } from '../src/store/auth.js'
import { isRouteAccessAllowed } from '../src/utils/routeAccess.js'

test('目标字段归一化保留独立阶段、验收进度与关联', () => {
  const goal = normalizeDevelopmentGoal({ id: 'goal_1', stage: 'PLANNED', version: 2, linked_feedback: [{ id: 'public_1', title: '公开标题' }], feedback_ids: ['public_1'], target_version: '0.2.0', target_date: '2026-10-01', criteria: [{ title: '验收', completed: true }] })
  assert.equal(goal.targetVersion, '0.2.0')
  assert.equal(goal.linkedFeedback[0].title, '公开标题')
  assert.equal(goal.criteria[0].completed, true)
  assert.deepEqual(goal.feedbackIds, ['public_1'])
})

test('广场保持公开、私人路由仍需登录、旧目标管理由工作台鉴权', () => {
  assert.notEqual(routes.find(route => route.path === '/feedback/plaza').meta.requiresAuth, true)
  assert.equal(routes.find(route => route.path === '/feedback').meta.requiresAuth, true)
  const retired = routes.find(route => route.path === '/co-creation/admin')
  assert.equal(retired.redirect, '/manage')
  assert.equal(retired.component, undefined)
  const meta = routes.find(route => route.path === '/manage').meta
  assert.equal(meta.requiresAuth, true)
  assert.equal(isRouteAccessAllowed(meta, { permissions: [] }), false)
  assert.equal(isRouteAccessAllowed(meta, { permissions: [], operatorAreas: ['OTHER'] }), true)
})

test('软下线路由无页面组件，旧广场定位保留，其他访问去更新日志', () => {
  const route = routes.find(route => route.path === '/co-creation')
  assert.equal(route.display, false)
  assert.equal(route.component, undefined)
  const redirect = route.redirect
  assert.deepEqual(redirect({ query: { feedback: 'public_1', tab: 'plaza', type: 'BUG', sort: 'updated' } }), { path: '/feedback/plaza', query: { feedback: 'public_1', sort: 'updated' }, replace: true })
  assert.deepEqual(redirect({ query: { tab: 'wish' } }), { path: '/feedback/plaza', query: {}, replace: true })
  assert.deepEqual(redirect({ query: { feedback: 'public_2', tab: 'roadmap' } }), { path: '/feedback/plaza', query: { feedback: 'public_2' }, replace: true })
  for (const query of [{}, { tab: 'roadmap' }, { tab: 'unknown', type: 'FEATURE' }]) {
    assert.deepEqual(redirect({ query }), { path: '/changelog', query: {}, replace: true })
  }
})

test('公开读取不附带身份，管理员保存携带认证、snake case与期望版本', async () => {
  const previousFetch = globalThis.fetch, previousToken = auth.accessToken
  const calls = []
  auth.accessToken = 'synthetic-goal-test'
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, status: 200, async json() { return { status_code: 200, data: options.method === 'GET' ? { data: [], total: 0, has_next: false } : { id: 'goal_1', version: 3 } } } }
  }
  try {
    await listDevelopmentGoals({ stage: 'IN_PROGRESS', page: 2 })
    await saveDevelopmentGoal('goal/1', { title: ' 目标 ', description: ' 说明 ', stage: 'PLANNED', criteria: [{ title: ' 验收 ', completed: false }], feedbackIds: ['public_1'], targetVersion: '0.2.0', targetDate: '', version: 2 })
    assert.equal(calls[0].options.headers.Authorization, undefined)
    assert.match(calls[0].url, /stage=IN_PROGRESS/)
    assert.match(calls[0].url, /page=2/)
    assert.match(calls[1].url, /goal%2F1$/)
    assert.equal(calls[1].options.headers.Authorization, 'Bearer synthetic-goal-test')
    assert.equal(calls[1].options.method, 'PUT')
    const body = JSON.parse(calls[1].options.body)
    assert.equal(body.expected_version, 2)
    assert.equal(body.title, '目标')
    assert.deepEqual(body.feedback_ids, ['public_1'])
    assert.equal(body.target_date, null)
  } finally { globalThis.fetch = previousFetch; auth.accessToken = previousToken }
})
