<template>
  <header class="today-lobby">
    <div class="wrap lobby-wrap">
      <div class="lobby-scene">
        <div class="lobby-copy">
          <div class="lobby-heading">
            <h1>今日一览</h1>
            <time :datetime="dateTime">{{ dateLabel }}</time>
          </div>
          <p class="lobby-greeting">{{ greeting }}，殿下</p>
          <p class="lobby-status" role="status">{{ status }}</p>
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
      <div v-if="$slots.default" class="lobby-context"><slot /></div>
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
const dateTime = computed(() => {
  const date = now.value
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
})
const dateLabel = computed(() => now.value.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }))

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
.today-lobby { isolation: isolate; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 65%, transparent); color: var(--ink); }
.lobby-wrap { max-width: 1180px; }
.lobby-scene { position: relative; min-height: 200px; display: flex; align-items: center; }
.lobby-copy { position: relative; z-index: 2; width: 58%; min-width: 0; padding: 16px 8px 16px 0; }
.lobby-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.lobby-heading h1 { color: var(--tea); font: 900 14px/1.5 var(--font-s); letter-spacing: .08em; }
.lobby-heading time { color: var(--ink-60); font-size: 11px; line-height: 1.5; }
.lobby-greeting { margin-top: 10px; color: var(--tea); font: 900 clamp(21px, 5.5vw, 26px)/1.5 var(--font-s); }
.lobby-status { margin-top: 6px; font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.lobby-duty { display: flex; flex-wrap: wrap; align-items: center; gap: 0 10px; margin-top: 10px; font-size: 12px; line-height: 1.6; }
.lobby-duty strong { font-weight: 750; }
.lobby-duty button { min-height: 44px; padding: 6px 4px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--tea); font: 700 12px/1.5 var(--font-b); cursor: pointer; }
.lobby-duty button:hover { color: var(--accent-strong); border-color: currentColor; }
.lobby-save-notice { margin-top: 4px; color: var(--rouge); font-size: 12px; line-height: 1.6; }
.lobby-portrait { position: absolute; z-index: 0; right: 0; bottom: 0; width: 42%; height: 190px; pointer-events: none; }
.lobby-portrait img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 0; }
.lobby-art-error { padding: 50px 8px; color: var(--ink-60); font-size: 12px; line-height: 1.8; text-align: center; }
.lobby-context { position: relative; z-index: 2; min-width: 0; padding-bottom: 12px; }
.duty-picker { display: flex; flex-direction: column; width: min(100%, 560px); max-height: min(640px, 85dvh); padding: 20px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); color: var(--ink); }
.duty-picker-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.duty-picker-heading h2 { font: 900 22px/1.5 var(--font-s); }
.duty-picker-heading button { display: grid; flex: none; width: 44px; height: 44px; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--tea); cursor: pointer; }
#duty-picker-note, .duty-result-count { color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.duty-search { display: flex; flex: none; align-items: center; gap: 8px; margin-top: 16px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); }
.duty-search svg { flex: none; }
.duty-search input { width: 100%; min-width: 0; min-height: 44px; border: 0; background: transparent; color: var(--ink); font: 14px var(--font-b); }
.duty-result-count { margin: 10px 0; }
.duty-candidates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 8px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px; }
.duty-candidates button { display: flex; min-width: 0; min-height: 48px; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--tea); font: 700 14px/1.5 var(--font-b); text-align: left; cursor: pointer; }
.duty-candidates button span { overflow-wrap: anywhere; }
.duty-candidates button svg { flex: none; }
.duty-candidates button:hover, .duty-candidates button[aria-pressed="true"] { background: var(--cream); border-color: var(--tea); }
.duty-candidates > p { grid-column: 1 / -1; padding: 20px 0; font-size: 13px; line-height: 1.7; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 3px; }
@media (min-width: 768px) {
  .lobby-scene { min-height: 300px; }
  .lobby-copy { width: 55%; padding: 32px 16px 24px 0; }
  .lobby-heading h1 { font-size: 16px; }
  .lobby-heading time { font-size: 12px; }
  .lobby-greeting { margin-top: 18px; font-size: clamp(28px, 3vw, 38px); }
  .lobby-status { max-width: 380px; font-size: 14px; }
  .lobby-duty { gap: 16px; margin-top: 18px; font-size: 13px; }
  .lobby-portrait { width: 45%; height: 300px; }
  .lobby-portrait img { object-fit: contain; object-position: center bottom; }
  .duty-candidates { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .duty-picker { max-height: 85dvh; border-radius: 20px 20px 0 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
}
</style>
