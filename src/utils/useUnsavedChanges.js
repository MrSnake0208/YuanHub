import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { dialog } from './dialog.js'

export function useUnsavedChanges(isDirty, label) {
  let pending = null
  async function confirmDiscard() {
    if (!isDirty.value) return true
    if (pending) return pending
    pending = dialog.confirm({
      title: '放弃未保存修改？',
      message: label + '尚未保存，离开后本次修改将丢失。',
      type: 'danger',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
    })
    try { return await pending } finally { pending = null }
  }

  function beforeUnload(event) {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  onBeforeRouteLeave(confirmDiscard)
  onBeforeRouteUpdate(confirmDiscard)
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
  return confirmDiscard
}
