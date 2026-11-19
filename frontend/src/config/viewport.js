const tabletMin = 768
const desktopMin = 1200

export const VIEWPORT_WIDTH = Object.freeze({
  phoneMax: tabletMin - 1,
  tabletMin,
  tabletMax: desktopMin - 1,
  desktopMin,
  compactNavMax: desktopMin - 1,
})

export const VIEWPORT_MEDIA = Object.freeze({
  phone: `(max-width: ${VIEWPORT_WIDTH.phoneMax}px)`,
  tablet: `(min-width: ${VIEWPORT_WIDTH.tabletMin}px) and (max-width: ${VIEWPORT_WIDTH.tabletMax}px)`,
  desktop: `(min-width: ${VIEWPORT_WIDTH.desktopMin}px)`,
  compactNav: `(max-width: ${VIEWPORT_WIDTH.compactNavMax}px)`,
})
