export const DEFAULT_FEEDBACK_SPACE = 'yuanhub'

export function feedbackSpaceId(query = {}) {
  return typeof query.space === 'string' && query.space ? query.space : DEFAULT_FEEDBACK_SPACE
}

export function feedbackLocation(path, spaceId, query = {}) {
  return { path, query: { ...query, ...(spaceId && spaceId !== DEFAULT_FEEDBACK_SPACE ? { space: spaceId } : {}) } }
}

export function categorySpaceId(category) {
  return category.spaceId ?? category.space_id ?? DEFAULT_FEEDBACK_SPACE
}

export function feedbackCategoryLabel(category, spaces) {
  const id = categorySpaceId(category)
  if (category.key === 'MAAYUAN' && category.label === '麻圆') return 'MaaYuan（麻圆）'
  if (id === DEFAULT_FEEDBACK_SPACE) return category.label
  const product = spaces.find(space => space.id === id)?.label || id
  return category.label === '其他问题' ? product : product + ' / ' + category.label
}
