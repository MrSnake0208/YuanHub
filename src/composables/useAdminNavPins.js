import { computed, reactive, watch } from 'vue'
import { auth } from '../store/auth.js'
import { getVisibleAdminTools } from '../utils/adminTools.js'

const preferences = reactive(new Map())
const storageKey = id => `yh_admin_nav_pins:${encodeURIComponent(id)}`

export function useAdminNavPins() {
  const identity = computed(() => auth.accessToken && auth.userInfo?.id ? String(auth.userInfo.id) : '')
  watch(identity, id => {
    if (!id || preferences.has(id)) return
    let keys = []
    let error = ''
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(id)) || '[]')
      if (Array.isArray(saved)) keys = [...new Set(saved.filter(key => typeof key === 'string'))]
    } catch (_) {
      error = '无法读取本浏览器的导航设置，可重新固定常用工具。'
    }
    preferences.set(id, { keys, error })
  }, { immediate: true, flush: 'sync' })

  const availableTools = computed(() => identity.value && auth.adminAccessLoaded &&
    !auth.adminAccessLoading && !auth.adminAccessError ? getVisibleAdminTools(auth.adminAccess) : [])
  const pinnedTools = computed(() => availableTools.value.filter(tool => preferences.get(identity.value)?.keys.includes(tool.key)))
  const storageError = computed(() => preferences.get(identity.value)?.error || '')

  function togglePin(key) {
    if (!availableTools.value.some(tool => tool.key === key)) return
    const id = identity.value
    const preference = preferences.get(id)
    preference.keys = preference.keys.includes(key)
      ? preference.keys.filter(value => value !== key)
      : [...preference.keys, key]
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(preference.keys))
      preference.error = ''
    } catch (_) {
      preference.error = '导航设置仅在本次会话生效，浏览器未能保存；刷新后可能丢失。'
    }
  }

  return { pinnedTools, storageError, togglePin }
}
