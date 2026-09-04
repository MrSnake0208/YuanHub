function text(value) {
  return value == null ? '' : String(value).trim()
}

export function parseOperatorShareToken(input) {
  const value = text(input)
  if (!value) return ''

  try {
    const url = new URL(value, 'https://yuanhub.invalid')
    const match = url.pathname.match(/\/operator\/share\/([^/]+)\/?$/)
    if (match) {
      const token = decodeURIComponent(match[1]).trim()
      return token && !/[\s/?#]/.test(token) ? token : ''
    }
  } catch (_) {
    return ''
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.includes('/') || /[\s?#]/.test(value)) return ''
  try {
    const token = decodeURIComponent(value).trim()
    return token && !/[\s/?#]/.test(token) ? token : ''
  } catch (_) {
    return ''
  }
}

function operatorId(operator) {
  return text(operator && (operator.operator_id || operator.operatorId || operator.id))
}

export function mergeOperatorShareEntries(share, catalog) {
  const operators = catalog && Array.isArray(catalog.operators) ? catalog.operators : []
  const byId = new Map(operators.map(function (operator, index) {
    return [operatorId(operator), { operator: operator, order: index }]
  }))
  const entries = share && share.entries && typeof share.entries === 'object' ? share.entries : {}

  return Object.entries(entries).map(function ([id, growth]) {
    const hit = byId.get(id)
    const operator = hit ? hit.operator : {}
    return {
      id: id,
      name: text(operator.name) || '未知密探',
      avatar: text(operator.avatar),
      rarity: Number(operator.rarity) || 0,
      prof: Array.isArray(operator.prof) ? operator.prof : text(operator.prof) ? [operator.prof] : [],
      sub_prof: Array.isArray(operator.sub_prof) ? operator.sub_prof : text(operator.sub_prof) ? [operator.sub_prof] : [],
      sp_of: text(operator.sp_of || operator.spOf),
      oddity_schema: operator.oddity_schema || operator.odditySchema || {},
      growth: growth && typeof growth === 'object' ? growth : {},
      order: hit ? hit.order : Number.MAX_SAFE_INTEGER
    }
  }).sort(function (left, right) {
    return left.order - right.order || left.name.localeCompare(right.name, 'zh-CN')
  })
}

export function operatorShareStarLabel(value, isSp) {
  const level = Math.max(0, Math.trunc(Number(value) || 0))
  if (!level) return '未招募'
  if (isSp) return level + ' 星'
  if (level === 31) return '觉醒'
  if (level <= 30) return Math.floor((level - 1) / 6) + 1 + ' 星 · ' + ((level - 1) % 6) + ' 节点'
  return String(level)
}
