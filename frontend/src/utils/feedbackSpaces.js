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
