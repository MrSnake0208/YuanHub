<template>
  <Teleport to="body" :disabled="!compact">
    <div v-show="!compact || open" :class="compact ? 'cart-receipt-mask' : 'cart-receipt-column'" @click.self="close">
      <div ref="panel" :class="compact ? 'cart-receipt-drawer' : 'cart-receipt-desktop'"
        :role="compact ? 'dialog' : undefined" :aria-modal="compact ? 'true' : undefined"
        :aria-label="compact ? '购物清单' : undefined" :tabindex="compact ? -1 : undefined">
        <div v-if="compact" class="cart-receipt-heading">
          <h2>购物清单</h2>
          <button ref="closeButton" type="button" class="btn ghost" aria-label="关闭购物清单" @click="close"><X :size="18" />关闭</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'

const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])
const compact = ref(typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1180px)').matches)
const panel = ref(null)
const closeButton = ref(null)
const modalOpen = computed(() => compact.value && props.open)
let media
let releaseScroll
const close = () => { if (compact.value && props.open) emit('close') }

useModalFocus(modalOpen, panel, { initialFocus: () => closeButton.value, onEscape: close })
function updateMedia() {
  compact.value = media.matches
  if (!compact.value && props.open) emit('close')
}
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
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  media = window.matchMedia('(max-width: 1180px)')
  updateMedia()
  media.addEventListener('change', updateMedia)
})
onBeforeUnmount(() => {
  media?.removeEventListener('change', updateMedia)
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
