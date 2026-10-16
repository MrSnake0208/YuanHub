<template>
  <Teleport to="body">
    <!-- 保持管理器常驻，关闭弹窗不重置状态、引用或重复请求。 -->
    <div v-show="open" class="operator-share-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle" @pointerdown="backdropPressed = $event.target === $event.currentTarget" @click.self="onBackdrop">
      <section id="operator-share-dialog" ref="panel" class="operator-share-dialog" role="dialog" aria-modal="true" aria-labelledby="operator-share-title" aria-describedby="operator-share-account" tabindex="-1" @focusin="revealFocusedControl">
        <header class="operator-share-header">
          <div><h2 id="operator-share-title">分享当前账号</h2><p id="operator-share-account">{{ accountName }}</p></div>
          <button ref="closeButton" type="button" class="operator-share-close" aria-label="关闭分享弹窗" @click="close"><X :size="20" aria-hidden="true" /></button>
        </header>
        <div ref="scrollBody" class="operator-share-body">
          <AccountShareManager ref="manager" :account-id="accountId" class="operator-share-content" @status-change="$emit('status-change', $event)" @share-change="$emit('share-change', $event)">
            <template #heading="{ titleId }"><h3 :id="titleId">分享权限</h3></template>
            <template #help>
              <div class="operator-share-help">
                <p>仅公开已开启的内容，不含备注、目标、计划或 OCR 记录。</p>
                <details><summary>公开范围与隐私说明</summary>
                  <p>密探 BOX 包含档案中原有的佩戴星石；关闭星石背包分享，不会移除这些信息。</p>
                  <p>星石背包公开云端已保存的全部星石，本机未同步修改不会出现在分享中。</p>
                </details>
              </div>
            </template>
          </AccountShareManager>
          <p v-if="!accountId" class="operator-share-empty">{{ !isLoggedIn ? '登录并选择账号后，可生成分享链接。' : '创建并选择账号后，可生成分享链接。' }}</p>
        </div>
        <footer class="operator-share-footer"><button type="button" class="btn primary" @click="close">关闭</button></footer>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, watch } from 'vue'
import { X } from '@lucide/vue'
import AccountShareManager from '../AccountShareManager.vue'
import { modalFocusState, useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'

defineProps({ accountId: { type: String, required: true }, accountName: { type: String, default: '当前账号' }, isLoggedIn: { type: Boolean, default: true } })
defineEmits(['status-change', 'share-change'])
const open = defineModel('open', { type: Boolean, default: false })
const manager = ref(null)
const backdropPressed = ref(false)
const panel = ref(null), closeButton = ref(null), scrollBody = ref(null)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(open, scrollBody, panel)
function close() {
  if (modalFocusState.panel && modalFocusState.panel !== panel.value) return
  open.value = false
}
function onBackdrop() {
  if (backdropPressed.value) close()
  backdropPressed.value = false
}
useModalFocus(open, panel, { initialFocus: () => closeButton.value, onEscape: close, preventRestoreScroll: true })
watch(open, (visible, _, onCleanup) => {
  if (!visible) return
  const body = document.body, root = document.documentElement
  const x = window.scrollX, y = window.scrollY
  const previous = Object.fromEntries(['position', 'top', 'left', 'width', 'overflow', 'paddingRight'].map(key => [key, body.style[key]]))
  const rootOverflow = root.style.overflow
  const gap = root.clientWidth ? Math.max(0, window.innerWidth - root.clientWidth) : 0
  if (gap) body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight || '0') + gap}px`
  Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden' })
  root.style.overflow = 'hidden'
  onCleanup(() => {
    Object.assign(body.style, previous)
    root.style.overflow = rootOverflow
    window.scrollTo(x, y)
  })
}, { immediate: true, flush: 'post' })
defineExpose({ copyCurrentShare: () => manager.value?.copyCurrentShare() ?? false })
</script>
<style scoped>
.operator-share-mask { position: fixed; inset: 0; z-index: var(--z-overlay-panel); display: grid; place-items: center; box-sizing: border-box; padding: 24px; background: rgba(73, 59, 44, .5); }
.operator-share-dialog { display: flex; flex-direction: column; min-width: 0; overflow: hidden; box-sizing: border-box; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); color: var(--ink); box-shadow: 0 32px 80px -24px rgba(73, 59, 44, .4); }
.operator-share-dialog:focus { outline: none; }
.operator-share-header { display: flex; align-items: flex-start; justify-content: space-between; flex: none; gap: 16px; border-bottom: 1px solid var(--line); }
.operator-share-header > div { min-width: 0; }
.operator-share-header h2 { margin: 0; font: 900 22px/1.4 var(--font-s); }
.operator-share-header p { margin: 6px 0 0; color: var(--ink-60); font-size: 14px; overflow-wrap: anywhere; }
.operator-share-close { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--ink); cursor: pointer; }
.operator-share-close:hover { background: var(--paper); }
.operator-share-close:focus-visible,.operator-share-help summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.operator-share-body { min-height: 0; min-width: 0; overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: 12px; }
.operator-share-content { border: 0; background: transparent; }
.operator-share-content h3 { margin: 0; font: 800 16px/1.4 var(--font-s); }
.operator-share-help { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--line); color: var(--ink-60); font-size: 12.5px; line-height: 1.7; }
.operator-share-help p { margin: 0 0 6px; }
.operator-share-help summary { cursor: pointer; color: var(--ink); }
.operator-share-help details p { margin-top: 8px; }
.operator-share-empty { padding: 0 24px 20px; color: var(--ink-60); }
.operator-share-footer { display: flex; justify-content: flex-end; flex: none; border-top: 1px solid var(--line); background: var(--cream); }
.operator-share-footer button { min-height: 40px; }
</style>
<style scoped src="./operatorShareManagerDesktop.css"></style>
<style scoped src="./operatorShareManagerMobile.css"></style>
