import { computed, onBeforeUnmount, ref } from 'vue'
import { VIEWPORT_MEDIA, VIEWPORT_WIDTH } from '../config/viewport.js'

export function useViewportTier() {
  const viewport = typeof window === 'undefined' ? null : window
  const phone = viewport?.matchMedia?.(VIEWPORT_MEDIA.phone)
  const desktop = viewport?.matchMedia?.(VIEWPORT_MEDIA.desktop)
  function readTier() {
    const width = viewport?.innerWidth ?? VIEWPORT_WIDTH.desktopMin
    if (phone?.matches ?? (width < VIEWPORT_WIDTH.tabletMin)) return 'phone'
    return (desktop?.matches ?? (width >= VIEWPORT_WIDTH.desktopMin)) ? 'desktop' : 'tablet'
  }

  const tier = ref(readTier())
  const sync = () => { tier.value = readTier() }
  phone?.addEventListener('change', sync)
  desktop?.addEventListener('change', sync)
  if (!phone) viewport?.addEventListener('resize', sync)
  onBeforeUnmount(() => {
    phone?.removeEventListener('change', sync)
    desktop?.removeEventListener('change', sync)
    if (!phone) viewport?.removeEventListener('resize', sync)
  })

  return {
    isPhone: computed(() => tier.value === 'phone'),
    isTablet: computed(() => tier.value === 'tablet'),
    isDesktop: computed(() => tier.value === 'desktop'),
    isCompactNav: computed(() => tier.value !== 'desktop'),
  }
}
