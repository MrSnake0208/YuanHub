<template>
  <details v-if="items.length || loading || errors.length" ref="root" class="todo-reminders" :aria-busy="loading" :open="open" @toggle="open = $event.target.open">
    <summary><BellRing :size="18" aria-hidden="true" /> 今日重点<span aria-live="polite">{{ items.length }} 项提醒</span><ChevronDown class="highlight-chevron" :size="14" aria-hidden="true" /></summary>
    <p class="reminder-scope">临期活动与待办 · 已开启的私人提醒 · 北京时间</p>
    <p v-if="loading" class="reminder-scope" role="status">正在更新重点，当前数量可能不完整…</p>
    <div v-for="source in errors" :key="source.id" class="highlight-error" role="alert">
      <span>{{ source.label }}读取失败，{{ items.length ? '已读取的重点仍可查看；原有内容可能尚未更新。' : '暂时无法确认是否有重点。' }}</span>
      <button type="button" :disabled="source.loading || source.denied" @click="$emit('retry', source.id)">{{ source.denied ? '请重新登录或选择账号' : '重试读取' }}</button>
    </div>
    <ul v-if="items.length" id="today-highlight-list" class="reminder-list">
      <li v-for="entry in visibleItems" :key="entry.id">
        <router-link :to="entry.to" class="highlight-link" :data-highlight-id="entry.id" :aria-label="`${entry.title}，${entry.label}${entry.pending ? `，还有 ${entry.pending} 条活动待办未完成` : ''}，查看日历详情`">
          <span class="highlight-body">
            <span class="highlight-meta" :class="{ 'is-urgent': entry.today }">{{ entry.kind === 'activity' ? '订阅活动' : '私人事项' }} · {{ entry.label }}</span>
            <strong class="highlight-title">{{ entry.title }}</strong>
            <span v-if="entry.pending" class="highlight-pending">还有 {{ entry.pending }} 条活动待办未完成</span>
          </span>
          <time :datetime="entry.at" :title="entry.kind === 'activity' ? entry.at === entry.date ? '仅提供日期，当天结束后截止（北京时间）' : '已换算为北京时间' : '事项的开始日或截止日（北京时间）'">{{ highlightDateLabel(entry) }}{{ entry.kind === 'activity' ? '截止' : '' }}</time>
          <ChevronRight :size="16" aria-hidden="true" />
        </router-link>
      </li>
    </ul>
    <button v-if="items.length > 3" ref="more" class="highlight-more" type="button" :aria-expanded="expanded" aria-controls="today-highlight-list" @click="toggleExpanded">{{ expanded ? '收起重点' : `展开全部 ${items.length} 项重点` }}</button>
  </details>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { BellRing, ChevronDown, ChevronRight } from '@lucide/vue'
import { highlightDateLabel } from '../../data/todayHighlights.js'

const props = defineProps({ items: { type: Array, default: () => [] }, sources: { type: Array, default: () => [] } })
const emit = defineEmits(['retry', 'empty-focus'])
const root = ref(null), more = ref(null), open = ref(true), expanded = ref(false)
const loading = computed(() => props.sources.some(source => source.loading))
const errors = computed(() => props.sources.filter(source => source.error))
const visibleItems = computed(() => expanded.value ? props.items : props.items.slice(0, 3))
function toggleExpanded() {
  // A programmatic collapse must not leave focus inside removed rows.
  if (expanded.value && root.value?.contains(document.activeElement)) more.value?.focus({ preventScroll: true })
  expanded.value = !expanded.value
}
watch(() => [props.items.map(entry => entry.id), loading.value, errors.value.length], async () => {
  const focused = document.activeElement, inside = root.value?.contains(focused)
  if (props.items.length <= 3) expanded.value = false
  if (!inside) return
  await nextTick()
  if (document.activeElement !== document.body || focused?.isConnected) return
  const target = root.value?.querySelector('.highlight-link') || root.value?.querySelector('summary')
  if (target) target.focus({ preventScroll: true })
  else emit('empty-focus')
}, { flush: 'pre' })
</script>

<style scoped>
.todo-reminders { border: 1px solid color-mix(in srgb, var(--rouge) 45%, var(--line)); background: color-mix(in srgb, var(--rouge) 5%, var(--surface)); color: var(--tea); }
summary { color: var(--rouge); font: 800 16px/1.5 var(--font-s); cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
.todo-reminders[open] .highlight-chevron { transform: rotate(180deg); }
summary span { font-weight: 400; }
.reminder-scope, .highlight-pending, time { color: var(--tea); font-size: 12px; line-height: 1.6; }
.reminder-list { list-style: none; }
.reminder-list li + li { border-top: 1px solid var(--line); }
.highlight-link { color: var(--tea); text-decoration: none; }
.highlight-title { font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.highlight-meta { color: var(--tea); font-size: 12px; line-height: 1.6; }
.is-urgent, .highlight-error { color: var(--rouge); }
button { font: inherit; color: var(--tea); background: var(--cream); border: 1px solid var(--line); border-radius: 6px; cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
@media (hover: hover) { .highlight-link:hover .highlight-title { text-decoration: underline; } }
</style>
<style scoped src="./todayHighlightsDesktop.css"></style>
<style scoped src="./todayHighlightsMobile.css"></style>
