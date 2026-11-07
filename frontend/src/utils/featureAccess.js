import { FEATURE_KEYS, isFeatureEnabled } from '../config/features.js'

export function isFeatureAccessible(key, session) {
  if (isFeatureEnabled(key)) return true
  return !!(key === FEATURE_KEYS.BATTLE_IMAGES &&
    session.accessToken && session.userInfo?.id &&
    session.adminAccessLoaded && !session.adminAccessLoading && !session.adminAccessError &&
    session.adminAccess?.roles?.some(role => role === 'PLATFORM_ADMIN' || role === 'SUPER_ADMIN'))
}
