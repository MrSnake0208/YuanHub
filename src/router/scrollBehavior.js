export function scrollBehavior(to, from, savedPosition) {
  // Developer headings arrive after the selected Markdown has loaded.
  if (to.path?.startsWith('/developers') && to.hash) return false
  if (to.hash) return { el: to.hash, behavior: 'smooth', top: 0 }
  if (savedPosition) return savedPosition
  const event = Array.isArray(to.query.event) ? to.query.event[0] : to.query.event
  // 日历选日与事项链接自行定位，避免路由回顶覆盖详情滚动。
  if (to.name === 'calendar' && (from.name === 'calendar' || event)) return false
  return { top: 0 }
}
