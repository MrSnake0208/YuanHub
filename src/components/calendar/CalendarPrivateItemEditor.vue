<template>
  <Teleport to="body">
    <div v-if="draft" class="calendar-private-mask" @click.self="state.close">
      <section ref="panel" class="calendar-private-dialog" role="dialog" aria-modal="true" aria-labelledby="private-item-title" tabindex="-1" :aria-busy="draft.busy">
        <header>
          <h2 id="private-item-title">{{ draft.record ? '编辑私人事项' : '添加私人事项' }}</h2>
          <button type="button" :disabled="draft.busy" aria-label="关闭私人事项编辑" @click="state.close"><X :size="20" aria-hidden="true" /></button>
        </header>
        <form id="private-item-form" class="calendar-private-body" novalidate @submit.prevent="save">
          <p class="calendar-private-context">{{ account.game }} · {{ account.name }} · 仅自己可见</p>
          <div v-if="Object.keys(draft.errors).length" ref="errorSummary" class="calendar-private-error" role="alert" tabindex="-1">
            <p>请检查以下内容：</p>
            <a v-for="(message, field) in draft.errors" :key="field" :href="field === 'title' ? '#private-item-title-input' : '#private-item-' + field" @click.prevent="focusField(field)">{{ message }}</a>
          </div>
          <label for="private-item-title-input">内容 <span>必填 · 最多100字</span></label>
          <input id="private-item-title-input" ref="titleInput" v-model="draft.form.title" type="text" required maxlength="100" autocomplete="off" :disabled="draft.busy" :aria-invalid="!!draft.errors.title" :aria-describedby="draft.errors.title ? 'private-item-title-error' : undefined" />
          <p v-if="draft.errors.title" id="private-item-title-error" class="calendar-private-error">{{ draft.errors.title }}</p>
          <label for="private-item-date">日期 <span>必填</span></label>
          <input id="private-item-date" v-model="draft.form.date" type="date" min="0001-01-01" max="9999-12-31" required :disabled="draft.busy" :aria-invalid="!!draft.errors.date" :aria-describedby="draft.errors.date ? 'private-item-date-error' : undefined" />
          <p v-if="draft.errors.date" id="private-item-date-error" class="calendar-private-error">{{ draft.errors.date }}</p>
          <label for="private-item-time">具体时间 <span>可选 · 留空为全天</span></label>
          <div class="calendar-private-time"><input id="private-item-time" v-model="draft.form.time" type="time" :disabled="draft.busy" :aria-invalid="!!draft.errors.time" aria-describedby="private-item-time-hint" /><button v-if="draft.form.time" type="button" :disabled="draft.busy" @click="draft.form.time = ''">改为全天</button></div>
          <p id="private-item-time-hint">{{ draft.errors.time || 'Asia/Shanghai（上海时间）；只记录这一个时刻。' }}</p>
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
          <p role="status">{{ draft.busy ? '保存中…' : state.dirty.value ? '有未保存修改' : draft.record ? '已保存' : '填写后保存' }}</p>
          <div><button type="button" :disabled="draft.busy" @click="state.close">取消</button><button type="submit" form="private-item-form" class="calendar-private-save" :disabled="draft.busy">{{ draft.busy ? '保存中…' : '保存' }}</button></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { CALENDAR_PRIVATE_ITEMS } from '@/data/calendarPrivateItems.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
defineProps({ account: { type: Object, required: true } })
const state = inject(CALENDAR_PRIVATE_ITEMS)
const draft = computed(() => state.editor.value)
const panel = ref(null), titleInput = ref(null), errorSummary = ref(null)
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
.calendar-private-mask { position: fixed; inset: 0; z-index: var(--z-overlay-panel); display: flex; align-items: flex-end; background: color-mix(in srgb, var(--ink) 45%, transparent); color: var(--ink); }
.calendar-private-dialog { width: 100%; min-width: 0; max-height: 94dvh; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 22px 22px 0 0; }
header, footer { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left)); }
header h2 { margin: 0; font: 900 22px/1.4 var(--font-s); color: var(--tea); }
button, input, summary { min-height: 44px; }
button { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--tea); padding: 8px 14px; cursor: pointer; }
header button { display: grid; place-items: center; min-width: 44px; padding: 8px; }
button:disabled { opacity: .6; cursor: default; }
:is(button, input, textarea, summary, a):focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.calendar-private-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left)); }
label { display: block; margin: 12px 0 6px; font-weight: 700; }
label span, p, label[for=private-item-note] { font-size: 13px; font-weight: 400; }
input, textarea { width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font: inherit; font-size: 16px; }
textarea { resize: vertical; }
p { margin: 6px 0; line-height: 1.6; overflow-wrap: anywhere; }
.calendar-private-context { margin: 0 0 12px; }
.calendar-private-time { display: flex; align-items: center; gap: 8px; }
.calendar-private-time input { flex: 1; width: 0; }
.calendar-private-time button { flex: none; }
details { margin-top: 12px; }
summary { display: flex; align-items: center; cursor: pointer; }
.calendar-private-error { color: var(--rouge); }
.calendar-private-error a { display: block; min-height: 44px; color: inherit; }
footer { border-top: 1px solid var(--line); padding-bottom: calc(14px + env(safe-area-inset-bottom)); flex-wrap: wrap; }
footer div { display: flex; gap: 8px; margin-left: auto; }
.calendar-private-save { background: var(--tea); color: var(--surface); }
@media (min-width: 768px) {
  .calendar-private-mask { align-items: center; justify-content: center; padding: 24px; }
  .calendar-private-dialog { max-width: 480px; max-height: min(90dvh, 760px); border-radius: 20px; }
}
</style>
