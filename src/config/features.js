export const FEATURE_KEYS = Object.freeze({
  STAR_COMPLETION: 'starCompletion',
  STAR_COMPLETION_DEMO: 'starCompletionDemo',
  TUTORIALS: 'tutorials',
  OPERATOR_GROWTH_TRACKING: 'operatorGrowthTracking',
  OPERATOR_DISCARDED: 'operatorDiscarded',
  WORK_SYSTEM: 'workSystem',
  RECRUITMENT_ARCHIVE: 'recruitmentArchive',
  ACTIVITY_CALENDAR: 'activityCalendar',
  ACHIEVEMENT_ARCHIVE: 'achievementArchive',
  BOND_ARCHIVE: 'bondArchive'
})

const isViteDev = import.meta.env?.DEV === true

export const FEATURE_FLAGS = Object.freeze({
  // Public feature available in both development and production.
  [FEATURE_KEYS.STAR_COMPLETION]: true,
  // Explicit development-only opt-in URL; no demo module is imported in a production build.
  [FEATURE_KEYS.STAR_COMPLETION_DEMO]: isViteDev && typeof location !== 'undefined' && new URLSearchParams(location.search).get('star_completion_demo') === '1',
  [FEATURE_KEYS.TUTORIALS]: import.meta.env?.VITE_TUTORIALS_ENABLED === 'true',
  [FEATURE_KEYS.OPERATOR_GROWTH_TRACKING]: true,
  [FEATURE_KEYS.OPERATOR_DISCARDED]: false,
  [FEATURE_KEYS.WORK_SYSTEM]: false,
  [FEATURE_KEYS.RECRUITMENT_ARCHIVE]: true,
  [FEATURE_KEYS.ACTIVITY_CALENDAR]: true,
  // 页面和后端接口另按 archive:access 授权，开启构建不代表公开访问。
  [FEATURE_KEYS.ACHIEVEMENT_ARCHIVE]: true,
  [FEATURE_KEYS.BOND_ARCHIVE]: true
})

export function isFeatureEnabled(key) {
  return FEATURE_FLAGS[key] === true
}

export const TUTORIALS_ENABLED = isFeatureEnabled(FEATURE_KEYS.TUTORIALS)
