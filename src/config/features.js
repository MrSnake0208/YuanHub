export const FEATURE_KEYS = Object.freeze({
  STAR_COMPLETION: 'starCompletion',
  STAR_COMPLETION_DEMO: 'starCompletionDemo',
  OPERATOR_GROWTH_TRACKING: 'operatorGrowthTracking',
  OPERATOR_DISCARDED: 'operatorDiscarded',
  WORK_SYSTEM: 'workSystem',
  RECRUITMENT_ARCHIVE: 'recruitmentArchive',
  ACTIVITY_CALENDAR: 'activityCalendar'
})

const isViteDev = import.meta.env?.DEV === true

// This feature is intentionally available only in local Vite development.
// Future flags must use explicit boolean values instead of inheriting this dev-only value.
export const FEATURE_FLAGS = Object.freeze({
  [FEATURE_KEYS.STAR_COMPLETION]: false,
  // Explicit development-only opt-in URL; no demo module is imported in a production build.
  [FEATURE_KEYS.STAR_COMPLETION_DEMO]: isViteDev && typeof location !== 'undefined' && new URLSearchParams(location.search).get('star_completion_demo') === '1',
  [FEATURE_KEYS.OPERATOR_GROWTH_TRACKING]: isViteDev,
  [FEATURE_KEYS.OPERATOR_DISCARDED]: false,
  [FEATURE_KEYS.WORK_SYSTEM]: false,
  [FEATURE_KEYS.RECRUITMENT_ARCHIVE]: true,
  [FEATURE_KEYS.ACTIVITY_CALENDAR]: true
})

export function isFeatureEnabled(key) {
  return FEATURE_FLAGS[key] === true
}
