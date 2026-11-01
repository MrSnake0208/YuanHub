import { request } from './request.js'

export const DEVELOPMENT_STAGES = Object.freeze([
  { key: 'PLANNED', label: '计划中' },
  { key: 'IN_PROGRESS', label: '开发中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'PAUSED', label: '暂停推进' }
])

export function normalizeDevelopmentGoal(value) {
  return {
    ...value,
    criteria: value.criteria || [],
    linkedFeedback: value.linkedFeedback ?? value.linked_feedback ?? [],
    feedbackIds: value.feedbackIds ?? value.feedback_ids ?? [],
    targetVersion: value.targetVersion ?? value.target_version ?? '',
    targetDate: value.targetDate ?? value.target_date ?? '',
    updatedAt: value.updatedAt ?? value.updated_at ?? null,
    version: Number(value.version ?? 0)
  }
}

export async function listDevelopmentGoals({ page = 1, size = 12, stage = '', admin = false } = {}) {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  if (stage) query.set('stage', stage)
  const result = await request((admin ? '/v1/admin/development-goals' : '/v1/development-goals') + '?' + query, { auth: admin })
  return { items: (result.data || []).map(normalizeDevelopmentGoal), total: Number(result.total || 0), hasNext: (result.hasNext ?? result.has_next) === true }
}

export async function saveDevelopmentGoal(id, form) {
  const body = {
    title: form.title.trim(), description: form.description.trim(), stage: form.stage,
    criteria: form.criteria.map(item => ({ title: item.title.trim(), completed: item.completed })),
    feedback_ids: form.feedbackIds, target_version: form.targetVersion.trim() || null,
    target_date: form.targetDate || null
  }
  if (id) body.expected_version = form.version
  return normalizeDevelopmentGoal(await request('/v1/admin/development-goals' + (id ? '/' + encodeURIComponent(id) : ''), {
    auth: true, method: id ? 'PUT' : 'POST', body
  }))
}

export async function getAdminDevelopmentGoal(id) {
  return normalizeDevelopmentGoal(await request('/v1/admin/development-goals/' + encodeURIComponent(id), { auth: true }))
}
