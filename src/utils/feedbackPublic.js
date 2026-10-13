// 反馈中心 / 共创中心共享的类型、校验与文案。
// 状态一律「文字 + 颜色」双重表达,颜色只作辅助。

export const PUBLIC_STATUS_OPTIONS = Object.freeze([
  { key: 'COLLECTING', label: '收集中' },
  { key: 'CONFIRMED', label: '已确认' },
  { key: 'PLANNED', label: '计划中' },
  { key: 'IN_PROGRESS', label: '开发中' },
  { key: 'COMPLETED', label: '已完成' },
  { key: 'NOT_PLANNED', label: '暂不处理' }
])

export const PUBLIC_TYPE_OPTIONS = Object.freeze([
  { key: 'BUG', label: '问题反馈' },
  { key: 'EXPERIENCE', label: '体验优化' },
  { key: 'FEATURE', label: '功能建议' },
  { key: 'CONTENT', label: '内容问题' },
  { key: 'ACCOUNT', label: '账号问题' },
  { key: 'REPORT', label: '举报' },
  { key: 'OTHER', label: '其他' }
])

export function isFeedbackType(type) {
  return PUBLIC_TYPE_OPTIONS.some(option => option.key === type)
}

export function feedbackPrefill(query, categories) {
  const key = value => typeof value === 'string' ? value.trim().toUpperCase() : ''
  const rawType = key(query.type)
  const rawCategory = key(query.category)
  const rawArea = key(query.area)
  const legacy = rawType === 'FEEDBACK'
  const type = legacy && isFeedbackType(rawCategory) ? rawCategory : rawType
  let category = rawCategory || rawArea
  if ((legacy && isFeedbackType(rawCategory)) || (rawCategory === type && rawArea)) category = rawArea
  const board = categories.find(option => option.key === category || (category === 'CALENDAR' && option.builtinKey === 'CALENDAR'))
    || (category === 'CALENDAR' ? categories.find(option => option.label === '活动日历') : null)
  return { type: isFeedbackType(type) ? type : 'BUG', category: board?.key || '' }
}

export const PUBLIC_SORT_OPTIONS = Object.freeze([
  { key: 'hot', label: '热门' },
  { key: 'latest', label: '最新' },
  { key: 'updated', label: '最近更新' }
])

export function publicStatusLabel(status) {
  const key = String(status || '').trim().toUpperCase()
  return PUBLIC_STATUS_OPTIONS.find(option => option.key === key)?.label || ''
}

export function publicTypeLabel(type) {
  const key = String(type || '').trim().toUpperCase()
  return PUBLIC_TYPE_OPTIONS.find(option => option.key === key)?.label || '其他'
}

// 底层行为完全相同,仅按反馈类型切换文案。
export function supportActionLabel(type) {
  const key = String(type || '').trim().toUpperCase()
  if (key === 'FEATURE') return '我也想要'
  if (key === 'EXPERIENCE') return '支持这个建议'
  return '我也遇到了'
}
