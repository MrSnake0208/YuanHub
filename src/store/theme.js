import { reactive } from 'vue'

export const theme = reactive({ preference: 'light', resolved: 'light' })

function syncTheme() {
  const controller = window.yuanhubTheme
  if (controller) Object.assign(theme, { preference: controller.preference, resolved: controller.resolved })
}

export function setThemePreference(preference) {
  window.yuanhubTheme?.setPreference(preference)
  syncTheme()
}

let stopTheme
export function initTheme() {
  if (stopTheme) return stopTheme
  syncTheme()
  window.addEventListener('yuanhub:theme-change', syncTheme)
  const stopSystem = window.yuanhubTheme?.listen()
  stopTheme = () => {
    window.removeEventListener('yuanhub:theme-change', syncTheme)
    stopSystem?.()
    stopTheme = undefined
  }
  return stopTheme
}
