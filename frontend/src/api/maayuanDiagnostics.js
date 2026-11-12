import { request } from './request.js'
import { auth } from '../store/auth.js'

const base = '/v1/admin/maayuan-diagnostics'
const camelFields = value => Object.fromEntries(Object.entries(value || {}).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), item]))
const issueFrom = value => {
  const issue = camelFields(value)
  return { ...issue, agentAnalysis: issue.agentAnalysis ? camelFields(issue.agentAnalysis) : null }
}
const summaryFrom = value => ({ ...camelFields(value), issues: (value?.issues || []).map(camelFields) })
const eventFrom = value => ({ ...camelFields(value), summary: summaryFrom(value.summary) })
const detailFrom = value => ({ ...camelFields(value), issue: issueFrom(value.issue), events: (value.events || []).map(eventFrom) })
const options = () => ({ auth: true, expectedUserId: String(auth.userInfo?.id || auth.userInfo?.userId || auth.userInfo?.user_id || '') })

export async function listDiagnosticIssues(params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null))
  const data = camelFields(await request(`${base}/issues?${query}`, options()))
  return { ...data, items: (data.items || []).map(row => ({ ...issueFrom(row.issue), subjectName: row.subjectName ?? row.subject_name })) }
}

export async function getDiagnosticIssue(id) {
  return detailFrom(await request(`${base}/issues/${encodeURIComponent(id)}`, options()))
}

export async function updateDiagnosticIssue(id, body) {
  return detailFrom(await request(`${base}/issues/${encodeURIComponent(id)}`, { ...options(), method: 'PATCH', body }))
}

export async function getDiagnosticEvent(id) {
  const value = await request(`${base}/events/${encodeURIComponent(id)}`, options())
  return {
    ...eventFrom(value),
    log: value.log ? camelFields(value.log) : null,
    trace: (value.trace || []).map(camelFields),
    images: (value.images || []).map(image => ({ ...camelFields(image), status: image.status || 'ready' }))
  }
}

export function getDiagnosticMedia(eventId, assetId) {
  return request(`${base}/events/${encodeURIComponent(eventId)}/media/${encodeURIComponent(assetId)}`, { ...options(), responseType: 'blob' })
}

export function getDiagnosticLog(eventId) {
  return request(`${base}/events/${encodeURIComponent(eventId)}/log`, { ...options(), responseType: 'blob' })
}
