<template>
  <div ref="agenda" class="calendar-agenda" aria-label="活动日程">
    <section v-for="section in sections" :key="section.key" class="calendar-section" :class="{ 'calendar-personal-today': personal && section.key === 'today', 'calendar-public-agenda-today': summaryMode && section.key === 'today' }" :aria-labelledby="'section-' + section.key">
      <h2 :id="'section-' + section.key">{{ section.title }}<time v-if="personal && section.key === 'today'" :datetime="today">{{ calendarDateLabel(today) }}</time><span>{{ section.count }} 项</span></h2>
      <p v-if="personal && section.key === 'today' && !section.count" class="calendar-hint">今天暂无个人事项</p>
      <div v-for="group in section.groups" :key="group.date" class="calendar-date-group" :data-date="group.date" :class="{ 'is-anchor': group.date === anchorDate }">
        <h3 v-if="!(personal || summaryMode) || group.date !== today"><time :datetime="group.date">{{ calendarDateLabel(group.date) }}</time><span v-if="group.date === today">TODAY</span></h3>
        <div class="calendar-event-list">
          <template v-for="item in group.items" :key="item.id">
            <CalendarPublicEventSummary v-if="summaryMode" :item="item" :today="today" @open="openDetail" />
            <CalendarEventCard v-else :item="item" :today="today" :personal="personal" :heading-tag="personal && group.date === today ? 'h3' : 'h4'" />
          </template>
        </div>
      </div>
    </section>
    <CalendarDetailDialog :selection="selection" :items="items" :today="today" :loading="loading" :error="detailError" @close="closeDetail" @retry="$emit('retry')" />
  </div>
</template>

<script setup>
import { computed, inject, onMounted, ref, watch } from 'vue'
import CalendarEventCard from './CalendarEventCard.vue'
import CalendarPublicEventSummary from './CalendarPublicEventSummary.vue'
import CalendarDetailDialog from './CalendarDetailDialog.vue'
import { CALENDAR_SUBSCRIPTIONS } from '@/data/activityCalendarSubscriptions.js'
import { calendarDateLabel, groupCalendarItems } from '@/data/activityCalendar.js'
const props = defineProps({ items: { type: Array, required: true }, today: { type: String, required: true }, anchorDate: { type: String, required: true }, locateRequest: Number, loading: Boolean, error: Boolean, personal: Boolean, compactPublic: Boolean, detailError: { type: String, default: '' } })
const emit = defineEmits(['retry', 'close-detail'])
const subscriptions = inject(CALENDAR_SUBSCRIPTIONS, null)
const agenda = ref(null), selection = ref(null)
// 跨断点时保留正在编辑的原卡片或详情，直到草稿安全结束。
const summaryMode = computed(() => !!selection.value || props.compactPublic && !subscriptions?.dirty.value)
let selectionRevision = 0
async function openDetail(id, event) {
  const revision = selectionRevision
  const trigger = event.currentTarget
  if (subscriptions && !await subscriptions.confirmDiscard()) return
  if (revision !== selectionRevision) return
  trigger.focus({ preventScroll: true })
  selection.value = { id, date: props.anchorDate }
}
async function closeDetail() {
  const previous = selection.value, revision = selectionRevision
  if (!previous || subscriptions && !await subscriptions.confirmDiscard()) return
  if (revision !== selectionRevision || previous !== selection.value) return
  if (subscriptions?.dirty.value) subscriptions.discardDrafts()
  selection.value = null
  emit('close-detail')
}
function resetDetail() { selectionRevision++; selection.value = null }
watch(() => subscriptions?.key.value, resetDetail, { flush: 'sync' })
watch(() => props.anchorDate, resetDetail, { flush: 'sync' })
defineExpose({ resetDetail })
const sections = computed(() => groupCalendarItems(props.items, props.today).filter(section => section.groups.length || props.personal && props.items.length && section.key === 'today' && !props.loading && !props.error).map(section => ({ ...section, count: section.groups.reduce((count, group) => count + group.items.length, 0) })))
function locate() {
  const groups = [...(agenda.value?.querySelectorAll('[data-date]') || [])]
  const target = groups.find(group => group.dataset.date >= props.anchorDate) || groups.at(-1)
  target?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' })
}
onMounted(() => { if (props.anchorDate !== props.today || props.locateRequest) locate() })
watch(() => [props.anchorDate, props.locateRequest], locate, { flush: 'post' })
watch(() => props.loading, loading => { if (!loading && (props.anchorDate !== props.today || props.locateRequest)) locate() }, { flush: 'post' })
</script>
