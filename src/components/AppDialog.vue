<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="state.visible" class="dialog-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle" @click.self="onBackdrop">
        <div ref="dialogEl" @focusin="revealFocusedControl" class="dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message" tabindex="-1">
          <div class="dialog-head">
            <span id="app-dialog-title" class="dialog-title">
              <span class="dialog-ic" :class="'ic-' + state.type" aria-hidden="true">
                <component :is="icon" :size="20" :stroke-width="2.2" />
              </span>
              {{ state.title || defaultTitle }}
            </span>
            <button class="dialog-close" type="button" :aria-label="'关闭'" @click="onCancel">
              <X :size="18" />
            </button>
          </div>

          <div ref="scrollBody" class="dialog-body">
            <p id="app-dialog-message" class="dialog-msg">{{ state.message }}</p>
            <div v-if="state.mode === 'choice'" class="dialog-choices">
              <button
                v-for="(choice, index) in state.choices"
                :key="choice.value"
                :ref="index === 0 ? setFirstChoice : undefined"
                type="button"
                class="dialog-choice"
                :class="'is-' + (choice.tone || 'secondary')"
                @click="onChoice(choice.value)"
              >
                <span class="dialog-choice-copy">
                  <strong>{{ choice.label }}</strong>
                  <small v-if="choice.description">{{ choice.description }}</small>
                </span>
                <ChevronRight :size="17" aria-hidden="true" />
              </button>
            </div>
            <label v-if="state.mode === 'choice' && state.checkboxLabel" class="dialog-check">
              <input v-model="state.checkboxChecked" type="checkbox" />
              <span>{{ state.checkboxLabel }}</span>
            </label>
            <label v-if="state.mode === 'prompt'" class="dialog-field">
              <span v-if="state.inputLabel" class="dialog-field-label">{{ state.inputLabel }}</span>
              <input
                ref="inputEl"
                v-model="state.input"
                type="text"
                :placeholder="state.placeholder"
                :aria-label="state.inputLabel || state.placeholder || '请输入内容'"
                :maxlength="state.maxLength"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                @keydown.enter.prevent="onConfirm"
              />
            </label>
          </div>

          <div v-if="state.mode !== 'choice'" class="dialog-foot">
            <button v-if="state.mode !== 'alert'" type="button" class="dlg-btn ghost" @click="onCancel">
              {{ state.cancelText }}
            </button>
            <button
              ref="confirmEl"
              type="button"
              class="dlg-btn primary"
              :class="{ danger: state.type === 'danger' }"
              :disabled="confirmDisabled"
              @click="onConfirm"
            >
              {{ state.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { X, Info, AlertTriangle, CheckCircle2, ChevronRight } from '@lucide/vue'
import { dialog } from '@/utils/dialog.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useModalViewport } from '@/composables/useModalViewport.js'

const state = dialog._state
const inputEl = ref(null)
const confirmEl = ref(null)
const firstChoiceEl = ref(null)
const dialogEl = ref(null)
const scrollBody = ref(null)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => state.visible, scrollBody, dialogEl)

const ICONS = { info: Info, danger: AlertTriangle, success: CheckCircle2 }
const icon = computed(function () {
  return ICONS[state.type] || Info
})

const defaultTitle = computed(function () {
  if (state.mode === 'alert') return '提示'
  if (state.mode === 'confirm') return '请确认'
  if (state.mode === 'choice') return '请选择'
  return '请输入'
})
const confirmDisabled = computed(function () {
  if (state.mode !== 'prompt' || !state.requiredValue) return false
  return state.input.trim() !== state.requiredValue
})

function onConfirm() {
  if (confirmDisabled.value) return
  dialog._confirm()
}
function onChoice(value) {
  dialog._choose(value)
}
function onCancel() {
  dialog._cancel()
}
function onBackdrop() {
  // 点遮罩关闭（alert / confirm / choice / prompt 共用，按模式结算结果）
  dialog._cancel()
}

function setFirstChoice(element) {
  firstChoiceEl.value = element
}

useModalFocus(() => state.visible, dialogEl, {
  initialFocus: () => state.mode === 'choice' ? firstChoiceEl.value
    : state.mode === 'prompt' ? inputEl.value
      : state.type === 'danger' ? dialogEl.value?.querySelector('.dlg-btn.ghost')
        : confirmEl.value,
  onEscape: onCancel,
  blocking: true,
  afterFocus: target => { if (state.mode === 'prompt' && target === inputEl.value) target.select() }
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* —— 项目风格弹窗：复用骨架色/点缀色，不新增色值 —— */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity .28s var(--ease);
}
.dialog-enter-active .dialog,
.dialog-leave-active .dialog {
  transition: transform .28s var(--ease);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-mask {
  background: var(--theme-overlay, rgba(73, 59, 44, .5));
  backdrop-filter: blur(3px);
}
.dialog {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 40px 80px -30px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.45);
  outline: none;
}
.dialog-title {
  color: var(--ink);
}
.dialog-ic {
  border-radius: 10px;
}
.dialog-ic.ic-info { background: var(--theme-wash, rgba(73, 59, 44, .08)); color: var(--ink-60) }
.dialog-ic.ic-danger { background: var(--theme-danger-wash, rgba(166, 81, 74, .14)); color: var(--theme-danger-text, var(--rouge)) }
.dialog-ic.ic-success { background: var(--theme-wash-strong, rgba(215, 137, 53, .16)); color: var(--theme-accent-text, var(--accent-strong)) }
.dialog-close {
  border: none;
  background: none;
  color: var(--ink-60);
  cursor: pointer;
  border-radius: 8px;
  transition: color .2s ease, background-color .2s ease;
}
.dialog-close:hover { color: var(--ink); background: var(--paper) }
.dialog-msg {
  color: var(--ink-60);
}
.dialog-choice {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--cream);
  color: var(--ink);
  cursor: pointer;
  transition: transform .16s var(--ease), border-color .2s ease, background-color .2s ease, color .2s ease;
}
.dialog-choice:active { transition-duration: 0s; }
.dialog-choice:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.dialog-choice.is-primary { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.dialog-choice.is-quiet { background: var(--paper); color: var(--ink-60); }
.dialog-choice-copy small { color: inherit; opacity: .72; }
.dialog-check {
  color: var(--ink-60);
  cursor: pointer;
}
.dialog-check input { accent-color: var(--accent); }
.dialog-check input:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .dialog-choice:hover { border-color: var(--accent); background: var(--surface); }
  .dialog-choice.is-primary:hover { border-color: var(--accent); background: var(--accent); color: #fff; }
}
.dialog-field-label {
  color: var(--ink);
}
.dialog-field input {
  border: 1.5px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
  background: var(--paper);
  outline: none;
  transition: border-color .2s ease, background-color .2s ease;
}
.dialog-field input:focus { border-color: var(--theme-focus, var(--accent)); background: var(--surface) }
.dlg-btn {
  border-radius: 12px;
  cursor: pointer;
  transition: transform .16s var(--ease), background-color .2s var(--ease), border-color .2s var(--ease), color .2s var(--ease), opacity .2s ease;
  border: 1.5px solid transparent;
}
.dlg-btn:disabled { opacity: .45; cursor: not-allowed }
.dlg-btn:active:not(:disabled) { transition-duration: 0s; }
.dlg-btn.ghost { background: var(--paper); border-color: var(--line); color: var(--ink) }
.dlg-btn.ghost:hover:not(:disabled) { background: var(--cream); border-color: var(--ink) }
.dlg-btn.primary { background: var(--tea); color: var(--on-strong) }
.dlg-btn.primary:hover:not(:disabled) { background: var(--accent); color: #fff }
.dlg-btn.primary.danger { background: var(--rouge) }
.dlg-btn.primary.danger:hover:not(:disabled) { background: var(--rouge); filter: brightness(.94) }
@media (prefers-reduced-motion: reduce) {
  .dialog-enter-active,
  .dialog-leave-active,
  .dialog-enter-active .dialog,
  .dialog-leave-active .dialog,
  .dialog-choice,
  .dlg-btn { transition: none; }
}
</style>
<style scoped src="./appDialogDesktop.css"></style>
<style scoped src="./appDialogMobile.css"></style>
