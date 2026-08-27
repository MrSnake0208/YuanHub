// 反馈工单接口封装（对照 BackEndV3-Share 契约）
import { request } from './request.js'

// 创建反馈
export function createFeedback(payload) {
  return request('/v1/reports', {
    method: 'POST',
    auth: true,
    body: {
      type: payload.type,
      category: payload.category,
      content: payload.content,
      media_ids: payload.mediaIds,
      client_info_consent: payload.clientInfoConsent
    }
  })
}

// 获取反馈列表
export function listFeedback(params) {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.pageSize != null) qs.set('pageSize', String(params.pageSize))
  if (params.status) qs.set('status', params.status)
  if (params.type) qs.set('type', params.type)
  if (params.mine != null) qs.set('mine', String(params.mine))
  if (params.reporterUserId) qs.set('reporterUserId', params.reporterUserId)
  if (params.q) qs.set('q', params.q)
  if (params.sortBy) qs.set('sortBy', params.sortBy)
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder)
  const query = qs.toString()
  return request(`/v1/reports${query ? '?' + query : ''}`, { auth: true })
}

// 获取单个反馈详情
export function getFeedback(id) {
  return request(`/v1/reports/${encodeURIComponent(id)}`, { auth: true })
}

// 追加消息
export function appendFeedbackMessage(id, body) {
  return request(`/v1/reports/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    auth: true,
    body: {
      content: body.content,
      media_ids: body.mediaIds
    }
  })
}

// 更新状态
export function updateFeedbackStatus(id, status) {
  return request(`/v1/reports/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    auth: true,
    body: { status }
  })
}