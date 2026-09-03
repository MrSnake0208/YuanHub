export const FEATURE_KEYS = Object.freeze({
  OPERATOR_GROWTH_TRACKING: 'operatorGrowthTracking'
})

const isViteDev = import.meta.env?.DEV === true

// This feature is intentionally available only in local Vite development.
// Future flags must use explicit boolean values instead of inheriting this dev-only value.
export const FEATURE_FLAGS = Object.freeze({
  [FEATURE_KEYS.OPERATOR_GROWTH_TRACKING]: isViteDev
})

export function isFeatureEnabled(key) {
  return FEATURE_FLAGS[key] === true
}
