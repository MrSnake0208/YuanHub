export const FEATURE_KEYS = Object.freeze({
  TUTORIALS: 'tutorials',
  OPERATOR_GROWTH_TRACKING: 'operatorGrowthTracking',
  OPERATOR_DISCARDED: 'operatorDiscarded',
  WORK_SYSTEM: 'workSystem',
  RECRUITMENT_ARCHIVE: 'recruitmentArchive',
  ACTIVITY_CALENDAR: 'activityCalendar'
})

const isViteDev = import.meta.env?.DEV === true

// Growth tracking is intentionally available only in local Vite development.
// Future flags must use explicit boolean values instead of inheriting this dev-only value.
export const FEATURE_FLAGS = Object.freeze({
  [FEATURE_KEYS.TUTORIALS]: import.meta.env?.VITE_TUTORIALS_ENABLED === 'true',
  [FEATURE_KEYS.OPERATOR_GROWTH_TRACKING]: isViteDev,
  [FEATURE_KEYS.OPERATOR_DISCARDED]: false,
  [FEATURE_KEYS.WORK_SYSTEM]: false,
  [FEATURE_KEYS.RECRUITMENT_ARCHIVE]: true,
  [FEATURE_KEYS.ACTIVITY_CALENDAR]: true
})

export function isFeatureEnabled(key) {
  return FEATURE_FLAGS[key] === true
}

export const TUTORIALS_ENABLED = isFeatureEnabled(FEATURE_KEYS.TUTORIALS)
