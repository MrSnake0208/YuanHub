<template>
  <Teleport to="body">
    <div v-if="draft" class="calendar-private-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle" @click.self="state.close">
      <section ref="panel" @focusin="revealFocusedControl" class="calendar-private-dialog" role="dialog" aria-modal="true" aria-labelledby="private-item-title" tabindex="-1" :aria-busy="draft.busy">
        <header>
          <h2 id="private-item-title">{{ draft.record ? '编辑私人事项' : '添加私人事项' }}</h2>
          <button type="button" :disabled="draft.busy" aria-label="关闭私人事项编辑" @click="state.close"><X :size="20" aria-hidden="true" /></button>
        </header>
        <form id="private-item-form" ref="scrollBody" class="calendar-private-body" novalidate @submit.prevent="save">
          <p class="calendar-private-context">{{ account.game }} · {{ account.name }} · 仅自己可见</p>
          <div v-if="Object.keys(draft.errors).length" ref="errorSummary" class="calendar-private-error" role="alert" tabindex="-1">
            <p>请检查以下内容：</p>
            <a v-for="(message, field) in draft.errors" :key="field" :href="field === 'title' ? '#private-item-title-input' : '#private-item-' + field" @click.prevent="focusField(field)">{{ message }}</a>
          </div>
          <label for="private-item-title-input">内容 <span>必填 · 最多100字</span></label>
          <input id="private-item-title-input" ref="titleInput" v-model="draft.form.title" type="text" required maxlength="100" autocomplete="off" :disabled="draft.busy" :aria-invalid="!!draft.errors.title" :aria-describedby="draft.errors.title ? 'private-item-title-error' : undefined" />
          <p v-if="draft.errors.title" id="private-item-title-error" class="calendar-private-error">{{ draft.errors.title }}</p>
          <div class="calendar-private-dates">
            <div v-for="(label, field) in { start_date: '开始日期', end_date: '结束日期' }" :key="field">
              <label :for="'private-item-' + field">{{ label }} <span>必填</span></label>
              <input :id="'private-item-' + field" :value="draft.form[field]" type="date" min="0001-01-01" max="9999-12-31" required :disabled="draft.busy" :aria-invalid="!!draft.errors[field]" :aria-describedby="draft.errors[field] ? 'private-item-' + field + '-error' : 'private-item-dates-hint'" @input="state.setDate(field, $event.target.value)" />
              <p v-if="draft.errors[field]" :id="'private-item-' + field + '-error'" class="calendar-private-error">{{ draft.errors[field] }}</p>
            </div>
          </div>
          <p id="private-item-dates-hint">同日为单日事项；多日包含起止当天。</p>
          <label for="private-item-time">具体时间 <span>可选 · 留空为全天</span></label>
          <div class="calendar-private-time"><input id="private-item-time" v-model="draft.form.time" type="time" :disabled="draft.busy" :aria-invalid="!!draft.errors.time" aria-describedby="private-item-time-hint" /><button v-if="draft.form.time" type="button" :disabled="draft.busy" @click="draft.form.time = ''">改为全天</button></div>
          <p id="private-item-time-hint">{{ draft.errors.time || '北京时间，仅表示开始日的时刻。' }}</p>
          <label for="private-item-reminder_on">站内提醒</label>
          <select id="private-item-reminder_on" v-model="draft.form.reminder_on" :disabled="draft.busy" :aria-invalid="!!draft.errors.reminder_on" aria-describedby="private-item-reminder-hint">
            <option value="">关闭提醒</option><option value="START">开始日提醒</option><option value="END">截止日提醒</option>
          </select>
          <template v-if="draft.form.reminder_on">
            <label for="private-item-reminder_days_before">提前提醒</label>
            <select id="private-item-reminder_days_before" v-model.number="draft.form.reminder_days_before" :disabled="draft.busy" :aria-invalid="!!draft.errors.reminder_days_before" aria-describedby="private-item-reminder-hint">
              <option :value="0">仅当天</option><option :value="1">提前一天＋当天</option>
            </select>
          </template>
          <p id="private-item-reminder-hint">{{ draft.errors.reminder_on || draft.errors.reminder_days_before || '按北京时间的日期提醒，不按具体时刻提醒。' }}</p>
          <details :open="!!draft.form.note || !!draft.errors.note">
            <summary>附加说明（可选）</summary>
            <label for="private-item-note">纯文本说明 · 最多1000字</label>
            <textarea id="private-item-note" v-model="draft.form.note" rows="4" maxlength="1000" :disabled="draft.busy" :aria-invalid="!!draft.errors.note" :aria-describedby="draft.errors.note ? 'private-item-note-error' : undefined"></textarea>
            <p v-if="draft.errors.note" id="private-item-note-error" class="calendar-private-error">{{ draft.errors.note }}</p>
          </details>
          <p v-if="draft.error" class="calendar-private-error" role="alert">{{ draft.error }}</p>
          <button v-if="draft.conflict" type="button" :disabled="draft.busy" @click="state.reloadEditor">读取最新内容</button>
        </form>
        <footer>
          <p role="status">{{ draft.busy ? '保存中…' : state.dirty.value ? '有未保存修改' : draft.record ? '尚未修改' : '填写后保存' }}</p>
          <div><button type="button" :disabled="draft.busy" @click="state.close">取消</button><button type="submit" form="private-item-form" class="calendar-private-save" :disabled="draft.busy || invalidDates">{{ draft.busy ? '保存中…' : '保存' }}</button></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { CALENDAR_PRIVATE_ITEMS, validatePrivateItem } from '@/data/calendarPrivateItems.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useModalViewport } from '@/composables/useModalViewport.js'
defineProps({ account: { type: Object, required: true } })
const state = inject(CALENDAR_PRIVATE_ITEMS)
const draft = computed(() => state.editor.value)
const invalidDates = computed(() => {
  if (!draft.value) return false
  const errors = validatePrivateItem(draft.value.form)
  return !!(errors.start_date || errors.end_date)
})
const panel = ref(null), titleInput = ref(null), errorSummary = ref(null)
const scrollBody = ref(null)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => !!draft.value, scrollBody, panel)
useModalFocus(computed(() => !!draft.value), panel, { initialFocus: () => titleInput.value, onEscape: () => state.close() })
function focusField(field) { panel.value?.querySelector(field === 'title' ? '#private-item-title-input' : '#private-item-' + field)?.focus() }
async function save() {
  await state.save()
  await nextTick()
  if (draft.value && Object.keys(draft.value.errors).length) errorSummary.value?.focus()
}
let restoreScroll = null
watch(() => !!draft.value, open => {
  restoreScroll?.(); restoreScroll = null
  if (!open) return
  const body = document.body, root = document.documentElement
  const bodyOverflow = body.style.overflow, rootOverflow = root.style.overflow
  body.style.overflow = root.style.overflow = 'hidden'
  restoreScroll = () => { body.style.overflow = bodyOverflow; root.style.overflow = rootOverflow }
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => restoreScroll?.())
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.calendar-private-mask { background: color-mix(in srgb, var(--ink) 45%, transparent); color: var(--ink); }
.calendar-private-dialog { background: var(--surface); border: 1px solid var(--line); border-radius: 22px 22px 0 0; }
header h2 { color: var(--tea); }
button { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--tea); cursor: pointer; }
button:disabled { opacity: .6; cursor: default; }
:is(button, input, textarea, select, summary, a):focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
input, textarea, select { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); }
summary { cursor: pointer; }
.calendar-private-error { color: var(--rouge); }
.calendar-private-error a { color: inherit; }
footer { border-top: 1px solid var(--line); }
.calendar-private-save { background: var(--tea); color: var(--surface); }
@media (min-width: 768px) {
  .calendar-private-dialog { border-radius: 20px; }
}
</style>
<style scoped src="./calendarPrivateItemEditorDesktop.css"></style>
<style scoped src="./calendarPrivateItemEditorMobile.css"></style>
