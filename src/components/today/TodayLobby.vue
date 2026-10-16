<template>
  <header class="today-lobby">
    <div class="wrap lobby-wrap">
      <div class="lobby-header">
        <div class="lobby-heading">
          <h1>今日一览</h1>
          <time :datetime="dateTime" title="日历日期以北京时间为准">{{ dateLabel }}</time>
        </div>
        <div v-if="$slots.default" class="lobby-context"><slot /></div>
        <div v-if="$slots.actions" class="lobby-actions"><slot name="actions" /></div>
      </div>
      <div class="lobby-scene">
        <div class="lobby-copy">
          <p class="lobby-greeting">{{ greeting }}，殿下</p>
          <p v-if="status" class="lobby-status" role="status">{{ status }}</p>
          <div class="lobby-duty">
            <span><strong>{{ companion.name }}</strong> · 值守中</span>
            <button type="button" aria-haspopup="dialog" @click="openPicker">更换值守</button>
          </div>
          <p v-if="saveNotice" class="lobby-save-notice" role="status">{{ saveNotice }}</p>
        </div>
        <div class="lobby-portrait">
          <img v-if="!imageFailed" :key="companion.id" :src="portraits[companion.id]" :alt="companion.name + '的值守立绘'" width="480" height="350" decoding="async" fetchpriority="high" @error="imageFailed = true" />
          <p v-else class="lobby-art-error">立绘暂未加载<br />可以更换值守</p>
        </div>
      </div>
    </div>
  </header>

  <Teleport to="body">
    <div v-if="pickerOpen" class="modal-mask" @click.self="pickerOpen = false">
      <section ref="panel" class="duty-picker" role="dialog" aria-modal="true" aria-labelledby="duty-picker-title" aria-describedby="duty-picker-note" tabindex="-1">
        <header class="duty-picker-heading">
          <h2 id="duty-picker-title">更换值守密探</h2>
          <button type="button" aria-label="关闭值守选择" @click="pickerOpen = false"><X :size="20" aria-hidden="true" /></button>
        </header>
        <p id="duty-picker-note">选定一位陪你看今日事项，选择会保留在此浏览器。</p>
        <label class="duty-search">
          <Search :size="17" aria-hidden="true" />
          <span class="sr-only">搜索值守密探</span>
          <input ref="searchInput" v-model="query" type="search" placeholder="名字、拼音或首字母" autocomplete="off" />
        </label>
        <p class="duty-result-count" role="status">{{ candidates.length }} 位可选</p>
        <div class="duty-candidates">
          <button v-for="entry in candidates" :key="entry.id" type="button" :aria-label="'选择' + entry.name + '值守'" :aria-pressed="entry.id === companion.id" @click="selectCompanion(entry.id)">
            <span>{{ entry.name }}</span>
            <Check v-if="entry.id === companion.id" :size="16" aria-hidden="true" />
          </button>
          <p v-if="!candidates.length">没有找到密探，试试名字或拼音。</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, Search, X } from '@lucide/vue'
import { AGENT_CATALOG } from '../../data/inventory/catalog.js'
import portraits from '../../data/operatorPortraits.json'
import { matchesOperatorSearch } from '../../utils/operatorFilters.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { calendarDateLabel, serverToday } from '../../data/activityCalendar.js'

const props = defineProps({ ownerId: { type: String, default: '' }, status: { type: String, required: true } })
const roster = AGENT_CATALOG.filter(entry => portraits[entry.id])
const defaultId = 'char_014_achan'
const storageKey = computed(() => 'yh_today_companion:' + (props.ownerId ? 'user:' + props.ownerId : 'guest'))
const companionId = ref(defaultId), pickerOpen = ref(false), query = ref(''), saveNotice = ref(''), imageFailed = ref(false)
const panel = ref(null), searchInput = ref(null), now = ref(new Date())
const companion = computed(() => roster.find(entry => entry.id === companionId.value) || roster.find(entry => entry.id === defaultId))
const candidates = computed(() => roster.filter(entry => matchesOperatorSearch(entry, query.value)))
const greeting = computed(() => {
  const hour = now.value.getHours()
  return hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
})
const dateTime = computed(() => serverToday(now.value))
const dateLabel = computed(() => calendarDateLabel(dateTime.value))

watch(storageKey, () => {
  pickerOpen.value = false
  saveNotice.value = ''
  imageFailed.value = false
  let saved
  try { saved = localStorage.getItem(storageKey.value) } catch { /* The default remains usable without storage. */ }
  companionId.value = roster.some(entry => entry.id === saved) ? saved : defaultId
}, { immediate: true, flush: 'sync' })
watch(companionId, () => { imageFailed.value = false })
useModalFocus(pickerOpen, panel, { initialFocus: () => searchInput.value, onEscape: () => { pickerOpen.value = false } })

function openPicker() { query.value = ''; pickerOpen.value = true }
function selectCompanion(id) {
  if (!roster.some(entry => entry.id === id)) return
  companionId.value = id
  imageFailed.value = false
  try {
    localStorage.setItem(storageKey.value, id)
    saveNotice.value = ''
  } catch {
    saveNotice.value = '已更换，本次选择暂时无法保存。'
  }
  pickerOpen.value = false
}
let clock = null
function updateTime() { now.value = new Date() }
function onVisible() { if (document.visibilityState === 'visible') updateTime() }
onMounted(() => {
  clock = setInterval(updateTime, 60000)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', updateTime)
})
onBeforeUnmount(() => {
  clearInterval(clock)
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('pageshow', updateTime)
})
</script>

<style scoped>
/* 刻意共享的字段外观，不持有双端布局。 */

.today-lobby { border-bottom: 1px solid var(--line); background: linear-gradient(110deg, var(--surface), color-mix(in srgb, var(--cream) 90%, transparent)); color: var(--ink); }
.lobby-heading h1 { color: var(--tea); font: 900 14px/1.5 var(--font-s); letter-spacing: .08em; }
.lobby-heading time { color: var(--ink-60); line-height: 1.5; }
.lobby-greeting { color: var(--tea); font: 900 clamp(21px, 5.5vw, 26px)/1.5 var(--font-s); }
.lobby-status { line-height: 1.7; }
.lobby-duty { line-height: 1.6; }
.lobby-duty strong { font-weight: 750; }
.lobby-duty button { border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--tea); font: 700 12px/1.5 var(--font-b); cursor: pointer; }
.lobby-duty button:hover { color: var(--accent-strong); border-color: currentColor; }
.lobby-save-notice { color: var(--rouge); line-height: 1.6; }
.lobby-portrait { pointer-events: none; }
.lobby-art-error { color: var(--ink-60); line-height: 1.8; }
.duty-picker { border: 1px solid var(--line); background: var(--surface); color: var(--ink); }
.duty-picker-heading h2 { font: 900 22px/1.5 var(--font-s); }
.duty-picker-heading button { border: 0; background: transparent; color: var(--tea); cursor: pointer; }
#duty-picker-note, .duty-result-count { color: var(--ink-60); line-height: 1.7; }
.duty-search { border: 1px solid var(--line); background: var(--cream); }
.duty-search input { border: 0; background: transparent; color: var(--ink); font: 14px var(--font-b); }
.duty-candidates button { border: 1px solid var(--line); background: var(--surface); color: var(--tea); font: 700 14px/1.5 var(--font-b); cursor: pointer; }
.duty-candidates button:hover, .duty-candidates button[aria-pressed="true"] { background: var(--cream); border-color: var(--tea); }
.duty-candidates > p { line-height: 1.7; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 3px; }
</style>
<style scoped src="./todayLobbyDesktop.css"></style>
<style scoped src="./todayLobbyMobile.css"></style>
