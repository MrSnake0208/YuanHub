import { diagnosticIssueTitle as existingTitle, diagnosticReason as existingReason } from '@/data/maayuanDiagnostics.js'

export const starCodeLabels = {
  star_scan_incomplete: '星石识别未完成',
  star_capacity_mismatch: '星石背包容量校验失败',
  star_sync_failed: '星石同步失败'
}

const stageLabels = { star_navigation: '界面导航', star_main: '主星', star_sub: '辅星', star_experience: '经验星曜', star_capacity: '背包容量', star_sync: '同步' }
const reasonLabels = {
  navigation_failed: '导航失败', forward_settle_timeout: '翻页稳定等待超时', position_uncertain: '页面位置不确定',
  recovery_insufficient_rows: '恢复后行数不足', name_anchor_unconfirmed: '名称锚点未确认', experience_not_captured: '经验星曜未读取',
  ocr_field_invalid: '识别字段无效', stopped_unsafe: '安全中止', unknown: '未知原因', count_mismatch: '数量与背包容量不符',
  capacity_unread: '背包容量未读取', http_401: '同步鉴权失败（401）', http_403: '同步权限不足（403）',
  http_409: '同步状态冲突（409）', http_422: '同步数据校验失败（422）', network: '同步网络异常'
}

export function diagnosticReason(reason, star = false) {
  return star && Object.hasOwn(reasonLabels, reason) ? { label: reasonLabels[reason], hint: '' } : existingReason(reason)
}

export function diagnosticIssueTitle(issue) {
  if (!Object.hasOwn(starCodeLabels, issue.code)) return existingTitle(issue)
  return `星石背包识别 · ${starCodeLabels[issue.code]} · ${diagnosticReason(issue.reason, true).label} · ${stageLabels[issue.subject] || issue.subject}`
}
