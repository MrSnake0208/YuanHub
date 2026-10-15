<template>
  <Teleport to="body">
    <div v-if="selection" v-show="!editing" class="calendar-page calendar-public calendar-detail-mask" :aria-hidden="editing ? 'true' : undefined" :inert="editing ? '' : undefined" @click.self="$emit('close')">
      <section ref="panel" class="calendar-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title" tabindex="-1" :aria-busy="loading">
        <header>
          <div><h2 id="calendar-detail-title" ref="heading" tabindex="-1">{{ selection.id ? '事项详情' : calendarDateLabel(selection.date) }}</h2><p class="calendar-hint">{{ selection.id ? calendarDateLabel(selection.date) : '当天全部事项' }} · {{ entries.length }} 项</p></div>
          <button type="button" aria-label="关闭日历详情" @click="$emit('close')"><X :size="20" aria-hidden="true" /></button>
        </header>
        <div class="calendar-detail-body" role="region" aria-label="日历事项内容" tabindex="0">
          <p v-if="privateItems?.notice.value" role="status">{{ privateItems.notice.value }}</p>
          <div v-if="error" class="calendar-error" role="alert"><p>{{ error }}</p><button type="button" @click="$emit('retry')">重试读取</button></div>
          <p v-else-if="loading && !entries.length" role="status">正在读取事项…</p>
          <div v-else-if="entries.length" class="calendar-event-list">
            <CalendarEventCard v-for="item in entries" :key="item.id" :item="item" :today="today" />
          </div>
          <p v-else role="status">{{ selection.id ? '该事项已删除、不可用或不在当前筛选范围内。' : '当天暂无事项。' }}</p>
        </div>
        <footer>
          <button v-if="canCreate" type="button" class="calendar-private-add" @click="$emit('create-private', selection.date)"><Plus :size="17" aria-hidden="true" /> 记一件事</button>
          <button type="button" class="calendar-detail-done" @click="$emit('close')">完成</button>
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
.calendar-detail-dialog { background: var(--surface); border: 1px solid var(--line); }
.calendar-detail-dialog h2 { margin: 0; color: var(--tea); font: 900 22px/1.4 var(--font-s); }
.calendar-detail-dialog p { margin: 6px 0; overflow-wrap: anywhere; }
.calendar-detail-dialog button { font: inherit; cursor: pointer; }
.calendar-detail-dialog :is(button, a, input):focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.calendar-detail-done { margin-left: auto; background: var(--tea); color: var(--surface); }
</style>
<style scoped src="./calendarDetailDialogDesktop.css"></style>
<style scoped src="./calendarDetailDialogMobile.css"></style>
