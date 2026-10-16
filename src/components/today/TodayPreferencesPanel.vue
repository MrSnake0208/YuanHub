<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask today-preferences-mask" @click.self="close">
      <section ref="panel" class="today-preferences" role="dialog" aria-modal="true" aria-labelledby="today-preferences-title" aria-describedby="today-preferences-note" tabindex="-1" :aria-busy="state.loading || state.saving">
        <header class="preferences-heading">
          <h2 id="today-preferences-title">自定义今日一览</h2>
          <button type="button" aria-label="关闭首页设置" :disabled="preferences.anySaving.value || confirming" @click="close"><X :size="20" aria-hidden="true" /></button>
        </header>
        <p id="today-preferences-note">选择要在{{ selected === 'desktop' ? '电脑端' : '手机端' }}首页显示的模块</p>
        <div class="preferences-modes" role="group" aria-label="编辑哪一端的首页设置">
          <button v-for="mode in modes" :key="mode.id" type="button" :aria-pressed="selected === mode.id" @click="selected = mode.id">{{ mode.label }}<span v-if="preferences.dirty(mode.id)" class="preferences-draft"> · 未保存</span></button>
        </div>
        <p v-if="state.loading" role="status">正在读取{{ selected === 'desktop' ? '电脑端' : '手机端' }}设置…</p>
        <div v-if="state.error" class="preferences-error" role="alert">
          <p>{{ state.error }}</p>
          <button type="button" :disabled="state.loading || state.saving" @click="preferences.load(selected)">重试读取</button>
        </div>
        <fieldset class="preferences-modules" :disabled="!state.snapshot || state.loading || state.saving || confirming || !!state.error || state.conflict">
          <legend class="sr-only">首页模块显示开关</legend>
          <label v-for="item in modules" :key="item.id" class="preferences-module">
            <component :is="icons[item.id]" :size="21" aria-hidden="true" />
            <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
            <input type="checkbox" role="switch" :aria-label="'显示' + item.label" :checked="!state.draft.includes(item.id)" @change="preferences.setShown(selected, item.id, $event.target.checked)" />
          </label>
        </fieldset>
        <div v-if="state.saveError" class="preferences-error" role="alert">
          <p>{{ state.saveError }}</p>
          <button type="button" :disabled="state.loading || state.saving || confirming" @click="reloadLatest">读取最新设置</button>
        </div>
        <p v-if="state.notice" class="preferences-notice" role="status" aria-live="polite">{{ state.notice }}</p>
        <p v-else-if="state.saving" role="status">正在保存并同步设置…</p>
        <footer class="preferences-footer">
          <button type="button" :disabled="!state.snapshot || state.loading || state.saving || !!state.error || state.conflict || confirming" @click="preferences.reset(selected)">恢复默认</button>
          <button type="button" class="preferences-save" :disabled="!state.snapshot || state.loading || state.saving || !!state.error || state.conflict || confirming || !preferences.dirty(selected)" @click="preferences.save(selected)">{{ state.saving ? '保存中…' : state.saveError && !state.conflict ? '重试保存' : '保存设置' }}</button>
        </footer>
        <p class="preferences-help">两端独立保存，切换标签会保留草稿。隐藏不删除数据或关闭站内提醒；空模块和未开放功能仍按原规则隐藏。恢复默认后需保存。</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, inject, ref, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
import { BellRing, CalendarDays, ListChecks, NotebookPen, UsersRound, X } from '@lucide/vue'
import { TODAY_MODULES } from '../../composables/useTodayPreferences.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { dialog } from '../../utils/dialog.js'

const props = defineProps({ open: Boolean, preferences: { type: Object, required: true } })
const emit = defineEmits(['update:open'])
const modules = TODAY_MODULES
const modes = [{ id: 'desktop', label: '电脑端' }, { id: 'mobile', label: '手机端' }]
const icons = { highlights: BellRing, checklist: ListChecks, activities: CalendarDays, training: UsersRound, private_items: NotebookPen }
const panel = ref(null), selected = ref('desktop'), confirming = ref(false)
let panelGeneration = 0
const state = computed(() => props.preferences.states[selected.value])
watch(() => props.open, open => {
  panelGeneration++
  if (open) {
    selected.value = props.preferences.layoutMode.value
    void props.preferences.load(selected.value, { ifStale: true })
  }
}, { flush: 'sync' })
watch(() => props.preferences.owner.value, () => { panelGeneration++; emit('update:open', false); confirming.value = false }, { flush: 'sync' })
useModalFocus(() => props.open, panel, { initialFocus: () => panel.value?.querySelector('.preferences-modes button[aria-pressed="true"]'), onEscape: close })
if (inject(matchedRouteKey, null)) onBeforeRouteLeave(() => !props.open || close())

async function close() {
  if (props.preferences.anySaving.value || confirming.value) return false
  const owner = props.preferences.owner.value, generation = panelGeneration
  if (props.preferences.anyDirty.value) {
    confirming.value = true
    const discard = await dialog.confirm({ title: '尚有未保存设置', message: '关闭会放弃两端尚未保存的修改，已保存的设置不受影响。', confirmText: '放弃修改并关闭', cancelText: '继续编辑' })
    if (owner !== props.preferences.owner.value || generation !== panelGeneration || !props.open) return false
    confirming.value = false
    if (!discard) return false
  }
  props.preferences.discardDrafts()
  emit('update:open', false)
  return true
}
async function reloadLatest() {
  const mode = selected.value, owner = props.preferences.owner.value, generation = panelGeneration
  confirming.value = true
  const discard = await dialog.confirm({ title: '读取最新设置', message: '将用服务器最新设置替换这一端的草稿。请核对后重新修改并保存，另一端草稿会保留。', confirmText: '读取并替换草稿', cancelText: '保留草稿' })
  if (owner !== props.preferences.owner.value || generation !== panelGeneration || !props.open) return false
  confirming.value = false
  if (discard) await props.preferences.load(mode, { replaceDraft: true })
}
</script>

<style scoped>
.today-preferences { color: var(--ink); background: var(--surface); border: 1px solid var(--line); box-shadow: 0 16px 48px rgba(73, 59, 44, .18); }
.preferences-heading h2 { margin: 0; font: 800 22px/1.5 var(--font-s); color: var(--tea); }
.preferences-heading button { border: 0; background: transparent; }
p { margin: 0; font-size: 13px; line-height: 1.7; }
button { color: var(--tea); background: var(--cream); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; font: inherit; }
button:hover:not(:disabled) { border-color: var(--tea); }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.preferences-modes { border: 1px solid var(--line); background: var(--cream); border-radius: 8px; }
.preferences-modes button { border: 0; background: transparent; }
.preferences-modes button[aria-pressed="true"], .preferences-save { color: var(--cream); background: var(--tea); }
.preferences-draft { font-size: 11px; }
.preferences-modules { border: 1px solid var(--line); border-radius: 10px; margin: 0; padding: 0; }
.preferences-module { cursor: pointer; }
.preferences-module + .preferences-module { border-top: 1px solid var(--line); }
.preferences-module strong { font-size: 14px; }
.preferences-module small { font-size: 12px; line-height: 1.6; color: var(--muted); }
.preferences-module input { accent-color: var(--tea); cursor: pointer; }
.preferences-modules:disabled { opacity: .6; }
.preferences-error { color: var(--rouge); }
.preferences-error button { padding: 6px 10px; }
.preferences-notice { color: var(--tea); }
.preferences-help { font-size: 12px; color: var(--muted); }
</style>
<style scoped src="./todayPreferencesDesktop.css"></style>
<style scoped src="./todayPreferencesMobile.css"></style>
