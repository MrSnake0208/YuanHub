<template>
  <Teleport to="body" :disabled="!drawer">
    <div v-show="!drawer || open" :class="drawer ? 'cart-receipt-mask' : 'cart-receipt-column'">
      <div ref="panel" :class="drawer ? 'cart-receipt-drawer' : 'cart-receipt-desktop'"
        :role="drawer ? 'dialog' : undefined" :aria-modal="drawer ? 'true' : undefined"
        :aria-label="drawer ? '购物清单' : undefined" tabindex="-1">
        <div v-if="drawer" class="cart-receipt-heading">
          <h2>购物清单</h2>
          <button ref="closeButton" type="button" class="btn ghost" aria-label="关闭购物清单" @click="close"><X :size="18" />关闭</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'

const props = defineProps({ open: Boolean, drawer: Boolean })
const emit = defineEmits(['close', 'focus-trigger'])
const panel = ref(null)
const closeButton = ref(null)
const modalOpen = toRef(props, 'open')
let releaseScroll
const close = () => emit('close')

useModalFocus(modalOpen, panel, { initialFocus: () => closeButton.value, onEscape: close, preventRestoreScroll: true })
watch(() => props.drawer, drawer => {
  const active = document.activeElement
  const wasInside = panel.value?.contains(active)
  const wasTrigger = active?.matches('.cart-mbar .mbtn')
  if (!wasInside && !wasTrigger) return
  nextTick(() => {
    if (drawer !== props.drawer) return
    const current = document.activeElement
    if (current !== active && current !== document.body && !current?.matches('main')) return
    if (drawer && !props.open && wasInside) emit('focus-trigger')
    if (!drawer) panel.value?.focus({ preventScroll: true })
  })
}, { flush: 'sync' })
watch(modalOpen, open => {
  releaseScroll?.()
  releaseScroll = undefined
  if (open) {
    const body = document.body
    const previous = body.style.overflow
    body.style.overflow = 'hidden'
    releaseScroll = () => { body.style.overflow = previous }
  }
}, { flush: 'sync', immediate: true })
onBeforeUnmount(() => {
  releaseScroll?.()
})
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.cart-receipt-mask{background:var(--theme-overlay, rgba(73,59,44,.5))}
.cart-receipt-drawer{background:var(--surface);border-radius:24px 24px 0 0;box-shadow:0 20px 44px -24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.3)}
.cart-receipt-heading{background:var(--surface)}
.cart-receipt-heading h2{color:var(--ink)}
</style>
<style scoped src="./receiptWorkspaceDesktop.css"></style>
<style scoped src="./receiptWorkspaceMobile.css"></style>
