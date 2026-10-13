<template>
  <div ref="host" class="inventory-records-view" role="group" aria-label="库存操作历史列表" tabindex="-1" :aria-busy="disabled">
    <component :is="isMobile ? InventoryRecordsMobileView : InventoryRecordsDesktopView"
      v-bind="viewProps" :expanded-ids="expandedIds" @toggle-details="toggleDetails" @delete-record="requestDelete" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import InventoryRecordsDesktopView from './InventoryRecordsDesktopView.vue'
import InventoryRecordsMobileView from './InventoryRecordsMobileView.vue'
import { recordsViewProps } from './inventoryRecordsView.js'

const props = defineProps({
  ...recordsViewProps,
  accountId: { type: String, required: true },
  deleteRecord: { type: Function, required: true },
})
const host = ref(null)
const expandedIds = ref([])
const viewProps = computed(() => Object.fromEntries(Object.keys(recordsViewProps).map(key => [key, props[key]])))
const media = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 640px)') : null
const isMobile = ref(media?.matches ?? false)
let layoutSeq = 0
let disposed = false

function toggleDetails(id, open) {
  expandedIds.value = open ? [...new Set([...expandedIds.value, id])] : expandedIds.value.filter(value => value !== id)
}

function recordNode(id) {
  return [...(host.value?.querySelectorAll('[data-record-id]') || [])].find(node => node.dataset.recordId === id)
}

function focusRecord(id, action) {
  const node = recordNode(id)
  if (isMobile.value && action === 'delete') {
    toggleDetails(id, true)
    if (node?.querySelector('details')) node.querySelector('details').open = true
  }
  const control = node?.querySelector(`[data-record-action="${action}"]`) || node?.querySelector('[data-record-action]')
  const target = control && !control.disabled ? control : node || host.value
  target?.focus({ preventScroll: true })
  return target
}

function revealFocus(target) {
  const rect = target?.getBoundingClientRect()
  if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) target.scrollIntoView({ block: 'center', behavior: 'instant' })
}

async function syncLayout() {
  if (!media || isMobile.value === media.matches) return
  const seq = ++layoutSeq
  const active = document.activeElement
  const focused = host.value?.contains(active) ? active.closest('[data-record-id]') : null
  const action = active?.dataset.recordAction
  const anchor = [...(host.value?.querySelectorAll('[data-record-id]') || [])].find(node => {
    const rect = node.getBoundingClientRect()
    return rect.bottom > 0 && rect.top < window.innerHeight
  })
  const top = anchor?.getBoundingClientRect().top
  isMobile.value = media.matches
  await nextTick()
  if (disposed || seq !== layoutSeq) return
  // 只恢复被替换列表中的焦点；不抢正在打开的共享确认框或编辑器焦点。
  const focusTarget = focused && (document.activeElement === active || document.activeElement === document.body)
    ? focusRecord(focused.dataset.recordId, action) : null
  const nextAnchor = anchor && recordNode(anchor.dataset.recordId)
  const delta = nextAnchor ? nextAnchor.getBoundingClientRect().top - top : 0
  if (delta) window.scrollBy({ top: delta, behavior: 'instant' })
  revealFocus(focusTarget)
}

async function requestDelete(record) {
  const account = props.accountId
  await props.deleteRecord(record)
  await nextTick()
  if (disposed || account !== props.accountId) return
  // 共享确认框的旧 opener 可能因旋转被卸载；关闭后恢复到同记录的新入口。
  const active = document.activeElement
  if (active === document.body || active?.matches('main') || host.value?.contains(active)) revealFocus(focusRecord(record.record_id, 'delete'))
}

onMounted(() => {
  media?.addEventListener('change', syncLayout)
  syncLayout()
})
onBeforeUnmount(() => {
  disposed = true
  media?.removeEventListener('change', syncLayout)
})
</script>

<style scoped>
.inventory-records-view { min-width: 0; }
</style>
