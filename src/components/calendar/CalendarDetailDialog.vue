<template>
  <Teleport to="body">
    <div v-if="selection" v-show="!editing" class="calendar-page calendar-public calendar-detail-mask" :aria-hidden="editing ? 'true' : undefined" :inert="editing ? '' : undefined" @click.self="$emit('close')">
      <section ref="panel" class="calendar-detail-dialog" :class="{ 'is-single': !!selection.id }" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title" tabindex="-1" :aria-busy="loading">
        <header>
          <div><h2 id="calendar-detail-title" ref="heading" tabindex="-1">{{ selection.id ? entries[0]?.title || (loading ? '正在读取事项…' : '事项暂不可用') : calendarDateLabel(selection.date) }}</h2><p v-if="!selection.id" class="calendar-hint">当天全部事项 · {{ entries.length }} 项</p></div>
          <button type="button" class="calendar-detail-close" aria-label="关闭日历详情" @click="$emit('close')"><X :size="20" aria-hidden="true" /></button>
        </header>
        <div class="calendar-detail-body" role="region" aria-label="日历事项内容" tabindex="0">
          <p v-if="privateItems?.notice.value" role="status">{{ privateItems.notice.value }}</p>
          <div v-if="error" class="calendar-error" role="alert"><p>{{ error }}</p><button type="button" @click="$emit('retry')">重试读取</button></div>
          <p v-else-if="loading && !entries.length" role="status">正在读取事项…</p>
          <div v-else-if="entries.length" class="calendar-event-list">
            <CalendarEventCard v-for="item in entries" :key="item.id" :item="item" :today="today" :variant="selection.id ? 'detail' : 'day'" />
          </div>
          <p v-else role="status">{{ selection.id ? '该事项已删除、不可用或不在当前筛选范围内。' : '当天暂无事项。' }}</p>
        </div>
        <footer v-if="canCreate || !selection.id">
          <button v-if="canCreate" type="button" class="calendar-private-add" @click="$emit('create-private', selection.date)"><Plus :size="17" aria-hidden="true" /> 记一件事</button>
          <button v-if="!selection.id" type="button" class="calendar-detail-done" @click="$emit('close')">完成</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { Plus, X } from '@lucide/vue'
import CalendarEventCard from './CalendarEventCard.vue'
import { calendarDateLabel, calendarItemsOnDay } from '@/data/activityCalendar.js'
import { CALENDAR_PRIVATE_ITEMS } from '@/data/calendarPrivateItems.js'
import { useModalFocus } from '@/composables/useModalFocus.js'

const props = defineProps({ selection: { type: Object, default: null }, items: { type: Array, required: true }, today: { type: String, required: true }, loading: Boolean, error: { type: String, default: '' }, canCreate: Boolean })
const emit = defineEmits(['close', 'retry', 'create-private'])
const privateItems = inject(CALENDAR_PRIVATE_ITEMS, null)
const editing = computed(() => !!privateItems?.editor.value)
const open = computed(() => !!props.selection)
const entries = computed(() => {
  if (!props.selection) return []
  if (props.selection.id) {
    const item = props.items.find(item => item.id === props.selection.id)
    return item ? [item] : []
  }
  return calendarItemsOnDay(props.items, props.selection.date)
})
const panel = ref(null), heading = ref(null)
useModalFocus(open, panel, { initialFocus: () => heading.value, onEscape: () => emit('close'), preventRestoreScroll: true })
let restoreScroll = null
watch(open, value => {
  restoreScroll?.(); restoreScroll = null
  if (!value) return
  const body = document.body, root = document.documentElement
  const bodyOverflow = body.style.overflow, rootOverflow = root.style.overflow, paddingRight = body.style.paddingRight
  const gap = Math.max(0, window.innerWidth - root.clientWidth)
  if (gap) body.style.paddingRight = `${(Number.parseFloat(getComputedStyle(body).paddingRight) || 0) + gap}px`
  body.style.overflow = root.style.overflow = 'hidden'
  restoreScroll = () => { body.style.overflow = bodyOverflow; root.style.overflow = rootOverflow; body.style.paddingRight = paddingRight }
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => restoreScroll?.())
</script>

<style scoped>
.calendar-detail-mask { background: color-mix(in srgb, var(--ink) 45%, transparent); color: var(--ink); }
.calendar-detail-dialog { background: var(--surface); border: 1px solid var(--line); box-shadow: 0 16px 48px color-mix(in srgb, var(--tea) 16%, transparent); }
.calendar-detail-dialog h2 { margin: 0; color: var(--tea); font: 800 22px/1.4 var(--font-s); overflow-wrap: anywhere; }
.calendar-detail-dialog p { margin: 6px 0; overflow-wrap: anywhere; }
.calendar-detail-dialog button { font: inherit; cursor: pointer; }
.calendar-detail-dialog :is(button, a, input):focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.calendar-detail-done { margin-left: auto; background: var(--tea); color: var(--surface); }
.calendar-detail-dialog :deep(.calendar-event.is-detail) { border: 0; border-radius: 0; padding: 0; background: transparent; }
.calendar-detail-dialog :deep(.calendar-event.is-day) { padding: 12px; border-radius: 12px; background: var(--cream); }
.calendar-detail-dialog :deep(.calendar-event-heading) { flex-direction: column; align-items: stretch; gap: 8px; }
.calendar-detail-dialog :deep(.calendar-event-identity) { flex: initial; min-width: 0; }
.calendar-detail-dialog :deep(.calendar-event-title) { margin: 8px 0 0; font: 700 18px/1.5 var(--font-s); overflow-wrap: anywhere; }
.calendar-detail-dialog :deep(.calendar-event-status) { justify-content: flex-start; max-width: none; gap: 6px 10px; font-size: 13px; }
.calendar-detail-dialog :deep(.calendar-game) { padding: 0; border: 0; border-radius: 0; font-weight: 600; }
.calendar-detail-dialog :deep(.calendar-badges) { align-items: center; gap: 6px 10px; }
.calendar-detail-dialog :deep(.calendar-category.is-muted) { padding: 0; border: 0; border-radius: 0; background: transparent; color: var(--ink-60); }
.calendar-detail-dialog :deep(.calendar-range) { margin: 10px 0 6px; color: var(--tea); line-height: 1.6; }
.calendar-detail-dialog :deep(.calendar-description) { margin: 8px 0; font-size: 14px; line-height: 1.65; }
.calendar-detail-dialog :deep(.calendar-association) { margin: 6px 0; font-size: 12px; }
.calendar-detail-dialog :deep(.calendar-event-foot) { justify-content: flex-start; gap: 6px 12px; margin-top: 6px; font-size: 12px; }
.calendar-detail-dialog :deep(.calendar-event-foot a) { min-height: 32px; font-size: 12px; }
.calendar-detail-dialog :deep(.calendar-subscription.is-dialog) { margin-top: 12px; padding-top: 12px; }
.calendar-detail-dialog :deep(.calendar-operation-heading) { margin: 0 0 8px; color: var(--tea); font: 700 14px/1.5 var(--font-b); }
.calendar-detail-dialog :deep(.calendar-activity-status) { flex: 1; margin: 0; font-size: 13px; }
.calendar-detail-dialog :deep(.calendar-subscription-actions) { gap: 8px; }
.calendar-detail-dialog :deep(.calendar-personal-todos) { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.calendar-detail-dialog :deep(.calendar-todos-heading) { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; margin-bottom: 6px; }
.calendar-detail-dialog :deep(.calendar-todos-heading .calendar-operation-heading) { margin: 0; }
.calendar-detail-dialog :deep(.calendar-subscription .calendar-hint) { margin: 6px 0 0; font-size: 12px; line-height: 1.6; }
.calendar-detail-dialog :deep(.calendar-subscription button) { font-size: 14px; line-height: 1.4; }
.calendar-detail-dialog :deep(button.calendar-completion-primary:not(:disabled)) { color: var(--cream); background: var(--tea); border-color: var(--tea); }
.calendar-detail-dialog :deep(.calendar-subscription-secondary) { margin-top: 8px; }
.calendar-detail-dialog :deep(.calendar-subscription .calendar-subscription-secondary button) { padding-inline: 0; border-color: transparent; background: transparent; color: var(--ink-60); font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
.calendar-detail-dialog :deep(.calendar-checklist) { margin-top: 8px; }
.calendar-detail-dialog :deep(.calendar-checklist legend) { margin-bottom: 6px; font-size: 12px; font-weight: 400; color: var(--ink-60); }
.calendar-detail-dialog :deep(.calendar-check-target input[type="checkbox"]) { width: 18px; height: 18px; }
.calendar-detail-dialog :deep(.calendar-todo-status) { font-size: 12px; }
.calendar-detail-dialog.is-single .calendar-private-add { font-size: 13px; background: transparent; border-color: transparent; }
</style>
<style scoped src="./calendarDetailDialogDesktop.css"></style>
<style scoped src="./calendarDetailDialogMobile.css"></style>
