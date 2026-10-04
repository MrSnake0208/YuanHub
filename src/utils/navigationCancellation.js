// 路由meta按导航复制；取消只影响携带此signal的教程导航。
export const NAVIGATION_SIGNAL = Symbol('onboarding-navigation')

export function isNavigationCancelled(to) {
  return to.meta?.[NAVIGATION_SIGNAL]?.aborted === true
}
