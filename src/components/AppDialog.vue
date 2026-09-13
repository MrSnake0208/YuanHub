<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="state.visible" class="dialog-mask" @click.self="onBackdrop">
        <div ref="dialogEl" class="dialog" role="dialog" aria-modal="true" @keydown.esc.prevent="onCancel">
          <div class="dialog-head">
            <span class="dialog-title">
              <span class="dialog-ic" :class="'ic-' + state.type">
                <component :is="icon" :size="20" :stroke-width="2.2" />
              </span>
              {{ state.title || defaultTitle }}
            </span>
            <button class="dialog-close" type="button" :aria-label="'关闭'" @click="onCancel">
              <X :size="18" />
            </button>
          </div>

          <div class="dialog-body">
            <p class="dialog-msg">{{ state.message }}</p>
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
                maxlength="64"
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
import { ref, computed, watch, nextTick } from 'vue'
import { X, Info, AlertTriangle, CheckCircle2, ChevronRight } from '@lucide/vue'
import { dialog } from '@/utils/dialog.js'

const state = dialog._state
const inputEl = ref(null)
const confirmEl = ref(null)
const firstChoiceEl = ref(null)

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

// 打开时聚焦：prompt 聚焦输入框并全选；其余聚焦确认按钮，便于回车/空格操作
watch(
  function () { return state.visible },
  function (visible) {
    if (!visible) return
    nextTick(function () {
      if (state.mode === 'choice' && firstChoiceEl.value) {
        firstChoiceEl.value.focus()
      } else if (state.mode === 'prompt' && inputEl.value) {
        inputEl.value.focus()
        inputEl.value.select()
      } else if (confirmEl.value) {
        confirmEl.value.focus()
      }
    })
  }
)
</script>

<style scoped>
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
.dialog-enter-from .dialog,
.dialog-leave-to .dialog {
  transform: translateY(18px) scale(.97);
}

.dialog-mask {
  position: fixed;
  inset: 0;
  background: rgba(73, 59, 44, .5);
  backdrop-filter: blur(3px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.dialog {
  width: 100%;
  max-width: 400px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 40px 80px -30px rgba(73, 59, 44, .45);
  overflow: hidden;
  outline: none;
}
.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 20px 0;
}
.dialog-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-s);
  font-weight: 900;
  font-size: 17px;
  letter-spacing: .04em;
  color: var(--ink);
}
.dialog-ic {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}
.dialog-ic.ic-info { background: rgba(73, 59, 44, .08); color: var(--ink-60) }
.dialog-ic.ic-danger { background: rgba(166, 81, 74, .14); color: var(--rouge) }
.dialog-ic.ic-success { background: rgba(215, 137, 53, .16); color: var(--accent-strong) }
.dialog-close {
  flex: none;
  border: none;
  background: none;
  color: var(--ink-60);
  cursor: pointer;
  padding: 4px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  transition: color .2s ease, background-color .2s ease;
}
.dialog-close:hover { color: var(--ink); background: var(--paper) }

.dialog-body {
  padding: 18px 20px 4px;
}
.dialog-msg {
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--ink-60);
  font-weight: 600;
  white-space: pre-line;
  word-break: break-word;
}
.dialog-choices {
  display: grid;
  gap: 8px;
  margin-top: 16px;
}
.dialog-choice {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 13px 10px 15px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--cream);
  color: var(--ink);
  text-align: left;
  font: 800 13px/1.35 var(--font-b);
  cursor: pointer;
  transition: transform .16s var(--ease), border-color .2s ease, background-color .2s ease, color .2s ease;
  touch-action: manipulation;
}
.dialog-choice:active { transform: scale(.98); transition-duration: 0s; }
.dialog-choice:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.dialog-choice.is-primary { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.dialog-choice.is-quiet { background: var(--paper); color: var(--ink-60); }
.dialog-choice-copy { display: grid; min-width: 0; gap: 2px; }
.dialog-choice-copy strong { font-weight: 900; }
.dialog-choice-copy small { color: inherit; font-size: 11px; font-weight: 700; opacity: .72; }
.dialog-check {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  margin-top: 10px;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.dialog-check input { width: 17px; height: 17px; margin: 0; accent-color: var(--accent); }
.dialog-check input:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
@media (hover: hover) and (pointer: fine) {
  .dialog-choice:hover { border-color: var(--accent); background: var(--surface); }
  .dialog-choice.is-primary:hover { border-color: var(--accent); background: var(--accent); color: #fff; }
}
.dialog-field {
  display: block;
  margin-top: 14px;
}
.dialog-field-label {
  display: block;
  margin-bottom: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}
.dialog-field input {
  width: 100%;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
  font-family: var(--font-b);
  color: var(--ink);
  background: var(--paper);
  outline: none;
  transition: border-color .2s ease, background-color .2s ease;
}
.dialog-field input:focus { border-color: var(--accent); background: var(--surface) }

.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px 18px;
}
.dlg-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  padding: 10px 24px;
  font-size: 13px;
  font-weight: 800;
  font-family: var(--font-b);
  cursor: pointer;
  transition: transform .16s var(--ease), background-color .2s var(--ease), border-color .2s var(--ease), color .2s var(--ease), opacity .2s ease;
  border: 1.5px solid transparent;
}
.dlg-btn:disabled { opacity: .45; cursor: not-allowed }
.dlg-btn:active:not(:disabled) { transform: scale(.98); transition-duration: 0s; }
.dlg-btn.ghost { background: var(--paper); border-color: var(--line); color: var(--ink) }
.dlg-btn.ghost:hover:not(:disabled) { background: var(--cream); border-color: var(--ink) }
.dlg-btn.primary { background: var(--tea); color: var(--cream) }
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
