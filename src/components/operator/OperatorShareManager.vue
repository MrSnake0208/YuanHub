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
          <div class="operator-share-modes" role="group" aria-label="分享方式">
            <button type="button" :aria-pressed="mode === 'image'" @click="mode = 'image'">图片分享</button>
            <button type="button" :aria-pressed="mode === 'link'" @click="mode = 'link'">链接分享</button>
          </div>
          <OperatorBoxImageShare v-if="accountId" v-show="mode === 'image'" :open="open && mode === 'image'" :account-id="accountId" :game="game"
            :entries="imageEntries" :filtered-ids="imageFilteredIds" :ready="imageReady" :source-error="imageError" />
          <AccountShareManager v-show="mode === 'link'" ref="manager" :account-id="accountId" compact class="operator-share-content" @status-change="$emit('status-change', $event)" @share-change="$emit('share-change', $event)">
            <template #heading="{ titleId }"><h3 :id="titleId">公开内容</h3></template>
            <template #management="{ busy, regenerate, revoke }">
              <Teleport to="#operator-share-footer-management" defer>
                <div class="operator-share-footer-actions">
                  <button type="button" class="operator-share-footer-button" :disabled="busy" @click="regenerate">重新生成全部分享链接</button>
                  <button type="button" class="operator-share-footer-button is-danger" :disabled="busy" @click="revoke">全部撤销分享</button>
                </div>
              </Teleport>
            </template>
            <template #help>
              <div class="operator-share-help">
                <details class="operator-share-privacy"><summary><ShieldCheck :size="20" aria-hidden="true" /><span><strong>公开范围与隐私说明</strong><small>不公开备注、目标、计划或识别记录。</small></span><ChevronDown class="operator-share-chevron" :size="16" aria-hidden="true" /></summary>
                  <p>两个视图共用分享码。拿到任一链接的人都能查看已开启的内容，无需登录；全部关闭后旧码失效。</p>
                  <p>自定义标签默认私有；主动开启“公开自定义标签”后，持有链接的人可查看已公开密探的标签并筛选。置顶与分组顺序不公开，关闭密探 BOX 会同时撤销标签公开。</p>
                  <p>密探 BOX 公开每套命盘的完美／待洗标记，供查看与筛选；目标词条仍仅自己可见。</p>
                  <p>星石背包公开云端已保存的全部星石，本机未同步修改不会出现在分享中。</p>
                </details>
              </div>
            </template>
          </AccountShareManager>
          <p v-if="!accountId" class="operator-share-empty">{{ !isLoggedIn ? '登录并选择账号后，可分享 BOX。' : '创建并选择账号后，可分享 BOX。' }}</p>
        </div>
        <footer class="operator-share-footer" aria-label="分享管理操作">
          <div v-show="mode === 'link'" id="operator-share-footer-management" class="operator-share-footer-management"></div>
          <button type="button" class="operator-share-footer-button is-primary" @click="close">关闭</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { ref, watch } from 'vue'
import { ChevronDown, ShieldCheck, X } from '@lucide/vue'
import AccountShareManager from '../AccountShareManager.vue'
import OperatorBoxImageShare from './OperatorBoxImageShare.vue'
import { modalFocusState, useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'

defineProps({
  accountId: { type: String, required: true }, accountName: { type: String, default: '当前账号' }, isLoggedIn: { type: Boolean, default: true },
  game: { type: String, default: '' }, imageEntries: { type: Array, default: () => [] }, imageFilteredIds: { type: Array, default: () => [] },
  imageReady: Boolean, imageError: { type: String, default: '' },
})
defineEmits(['status-change', 'share-change'])
const open = defineModel('open', { type: Boolean, default: false })
const manager = ref(null)
const mode = ref('image')
const backdropPressed = ref(false)
const panel = ref(null), closeButton = ref(null), scrollBody = ref(null)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(open, scrollBody, scrollBody)
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
.operator-share-mask { position: fixed; inset: 0; z-index: var(--z-overlay-panel); display: grid; place-items: center; box-sizing: border-box; padding: 24px; background: var(--theme-overlay, rgba(73, 59, 44, .5)); }
.operator-share-dialog { display: flex; flex-direction: column; min-width: 0; overflow: hidden; box-sizing: border-box; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--ink); box-shadow: 0 32px 80px -24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.4); }
.operator-share-dialog:focus { outline: none; }
.operator-share-header { display: flex; align-items: flex-start; justify-content: space-between; flex: none; gap: 16px; border-bottom: 1px solid var(--line); }
.operator-share-header > div { min-width: 0; }
.operator-share-header h2 { margin: 0; font: 900 20px/1.4 var(--font-s); }
.operator-share-header p { margin: 4px 0 0; color: var(--ink-60); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.operator-share-close { display: grid; place-items: center; flex: none; width: 36px; height: 36px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); color: var(--ink); cursor: pointer; }
.operator-share-close:hover { background: var(--paper); }
.operator-share-close:focus-visible,.operator-share-help summary:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.operator-share-body { min-height: 0; min-width: 0; overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: 12px; }
.operator-share-modes { display: flex; gap: 8px; padding: 14px 24px 0; }
.operator-share-modes button { padding: 8px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: 700 13px/1.5 var(--font-b); cursor: pointer; }
.operator-share-modes button[aria-pressed="true"] { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.operator-share-modes button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.operator-share-content { border: 0; background: transparent; }
.operator-share-content h3 { margin: 0; font: 800 16px/1.4 var(--font-s); }
.operator-share-help { margin-top: 14px; color: var(--ink-60); font-size: 13px; line-height: 1.7; }
.operator-share-privacy { border: 1px solid var(--line); border-radius: 10px; background: var(--cream); }
.operator-share-privacy summary { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; list-style: none; cursor: pointer; color: var(--theme-strong-text, var(--tea)); border-radius: 10px; }
.operator-share-privacy summary::-webkit-details-marker { display: none; }
.operator-share-privacy summary::marker { content: ''; }
.operator-share-privacy summary > svg { flex: none; margin-top: 2px; }
.operator-share-privacy summary > span { flex: 1; min-width: 0; }
.operator-share-privacy strong { display: block; font-size: 13px; }
.operator-share-privacy small { display: block; margin-top: 2px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.operator-share-privacy summary:hover,.operator-share-privacy[open] summary { background: var(--paper); }
.operator-share-privacy[open] .operator-share-chevron { transform: rotate(180deg); }
.operator-share-privacy p { margin: 0; padding: 0 14px 10px; overflow-wrap: anywhere; }
.operator-share-privacy p:first-of-type { padding-top: 10px; border-top: 1px solid var(--line); }
.operator-share-empty { padding: 0 24px 20px; color: var(--ink-60); }
.operator-share-footer { display: flex; flex: none; align-items: center; gap: 12px; padding: 14px 24px; border-top: 1px solid var(--line); background: var(--surface); }
.operator-share-footer-management { flex: 1; min-width: 0; }
.operator-share-footer-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.operator-share-footer-note { color: var(--ink-60); font-size: 12px; white-space: nowrap; }
.operator-share-footer-button { min-height: 38px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: 700 12px/1.5 var(--font-b); cursor: pointer; }
.operator-share-footer-button.is-danger { border-color: var(--rouge); color: var(--theme-danger-text, var(--rouge)); }
.operator-share-footer-button.is-primary { flex: none; margin-left: auto; min-width: 76px; background: var(--tea); border-color: var(--tea); color: var(--on-strong); }
.operator-share-footer-button:hover:not(:disabled) { background: var(--paper); }
.operator-share-footer-button.is-primary:hover { background: var(--theme-control-bg, var(--ink)); }
.operator-share-footer-button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.operator-share-footer-button:disabled { opacity: .5; cursor: not-allowed; }
.is-short-viewport .operator-share-header { padding-block: 8px; }
.is-short-viewport .operator-share-dialog { max-height: 100%; }
</style>
<style scoped src="./operatorShareManagerDesktop.css"></style>
<style scoped src="./operatorShareManagerMobile.css"></style>
