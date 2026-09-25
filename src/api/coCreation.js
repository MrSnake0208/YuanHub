// 共创中心公开反馈接口封装。
// 公开列表/详情/相似无需登录；支持与取消支持需要登录。
import { request } from './request.js'

function normalizeMerged(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: raw.id || '',
    publicTitle: raw.publicTitle ?? raw.public_title ?? ''
  }
}

export function normalizePublicFeedback(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    id: raw.id || '',
    publicTitle: raw.publicTitle ?? raw.public_title ?? '',
    publicSummary: raw.publicSummary ?? raw.public_summary ?? '',
    type: String(raw.type || '').toUpperCase(),
    publicStatus: raw.publicStatus ?? raw.public_status ?? null,
    supportCount: Number(raw.supportCount ?? raw.support_count ?? 0),
    supportedByCurrentUser: Boolean(raw.supportedByCurrentUser ?? raw.supported_by_current_user),
    publishedAt: raw.publishedAt ?? raw.published_at ?? null,
    publicUpdatedAt: raw.publicUpdatedAt ?? raw.public_updated_at ?? null,
    completedAt: raw.completedAt ?? raw.completed_at ?? null,
    mergedInto: normalizeMerged(raw.mergedInto ?? raw.merged_into)
  }
}

export async function listPublicFeedback(params = {}) {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
  if (params.type) qs.set('type', params.type)
  if (params.status) qs.set('status', params.status)
  if (params.keyword) qs.set('keyword', params.keyword)
  if (params.sort) qs.set('sort', params.sort)
  const query = qs.toString()
  const data = await request('/v1/reports/public' + (query ? '?' + query : ''), {})
  const items = Array.isArray(data?.items) ? data.items : []
  return {
    items: items.map(normalizePublicFeedback).filter(Boolean),
    total: Number(data?.total ?? items.length),
    page: Number(data?.page ?? params.page ?? 1),
    pageSize: Number(data?.pageSize ?? data?.page_size ?? params.pageSize ?? items.length)
  }
}

export async function getPublicFeedback(id) {
  return normalizePublicFeedback(await request('/v1/reports/public/' + encodeURIComponent(id), {}))
}

export async function findSimilarFeedback(title, type) {
  const qs = new URLSearchParams()
  qs.set('title', title)
  if (type) qs.set('type', type)
  const data = await request('/v1/reports/public/similar?' + qs.toString(), {})
  const items = Array.isArray(data) ? data : []
  return items.map(normalizePublicFeedback).filter(Boolean)
}

export function supportPublicFeedback(id) {
  return request('/v1/reports/' + encodeURIComponent(id) + '/support', { method: 'POST', auth: true })
    .then(normalizePublicFeedback)
}

export function unsupportPublicFeedback(id) {
  return request('/v1/reports/' + encodeURIComponent(id) + '/support', { method: 'DELETE', auth: true })
    .then(normalizePublicFeedback)
}
