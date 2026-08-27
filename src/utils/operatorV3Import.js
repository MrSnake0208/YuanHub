export function isOperatorV3Document(value) {
  return !!value && value.format === 'myshare-operator-exchange' && Number(value.version) === 3
}

export function buildOperatorV3BrowserRequest(document, targetAccountId, confirmReview) {
  if (!isOperatorV3Document(document)) throw new Error('这不是密探养成数据交换协议 v3 文档')
  if (!targetAccountId) throw new Error('请先选择导入目标账号')
  const accounts = Array.isArray(document.accounts) ? document.accounts : []
  const sourceIds = Array.from(new Set(accounts.map(function (account) {
    return account && account.id != null ? String(account.id).trim() : ''
  }).filter(Boolean)))
  if (sourceIds.length === 0) throw new Error('v3 文档没有可识别的来源账号')
  if (sourceIds.length > 1) throw new Error('当前导入面板一次只支持一个来源账号，请拆分文档后分别导入')
  return {
    document: document,
    account_mapping: { [sourceIds[0]]: targetAccountId },
    confirm_review: !!confirmReview
  }
}

function count(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0
}

export function normalizeOperatorV3ImportResponse(value) {
  value = value || {}
  return {
    accepted: count(value.accepted),
    partial: count(value.partial),
    review: count(value.review),
    rejected: count(value.rejected),
    unchanged: count(value.unchanged),
    items: Array.isArray(value.items) ? value.items.map(function (item) {
      item = item || {}
      return {
        accountId: item.account_id || item.accountId || '',
        operatorId: item.operator_id || item.operatorId || '',
        recordId: item.record_id || item.recordId || '',
        status: item.status || 'unchanged',
        changes: item.changes && typeof item.changes === 'object' ? item.changes : {},
        warnings: Array.isArray(item.warnings) ? item.warnings : [],
        blockingErrors: Array.isArray(item.blocking_errors) ? item.blocking_errors : (Array.isArray(item.blockingErrors) ? item.blockingErrors : []),
        stale: item.stale === true,
        targetRevision: item.target_revision != null ? item.target_revision : item.targetRevision,
        revision: item.revision,
        observedStatus: item.observed_status || item.observedStatus || ''
      }
    }) : []
  }
}

export function operatorV3CommittableCount(preview) {
  return count(preview && preview.accepted) + count(preview && preview.partial)
}
