export const FEATURE_KEYS = Object.freeze({
  STAR_COMPLETION: 'starCompletion',
  STAR_COMPLETION_DEMO: 'starCompletionDemo',
  TUTORIALS: 'tutorials',
  OPERATOR_GROWTH_TRACKING: 'operatorGrowthTracking',
  OPERATOR_DISCARDED: 'operatorDiscarded',
  WORK_SYSTEM: 'workSystem',
  RECRUITMENT_ARCHIVE: 'recruitmentArchive',
  ACTIVITY_CALENDAR: 'activityCalendar',
  ACHIEVEMENT_ARCHIVE: 'achievementArchive'
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
  // 两款游戏均无可发布目录；开发仅显示真实空目录，生产保持关闭。
  [FEATURE_KEYS.ACHIEVEMENT_ARCHIVE]: isViteDev
})

export function isFeatureEnabled(key) {
  return FEATURE_FLAGS[key] === true
}

export const TUTORIALS_ENABLED = isFeatureEnabled(FEATURE_KEYS.TUTORIALS)
