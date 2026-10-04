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
.cart-receipt-column{min-width:0;align-self:stretch}
.cart-receipt-desktop{position:sticky;top:110px}
.cart-receipt-mask{position:fixed;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:16px;background:rgba(73,59,44,.5);z-index:var(--z-overlay)}
.cart-receipt-drawer{width:min(100%,560px);max-height:calc(100dvh - 32px);overflow:auto;overscroll-behavior:contain;padding:16px 16px calc(16px + env(safe-area-inset-bottom));background:var(--surface);border-radius:24px 24px 0 0;box-shadow:0 20px 44px -24px rgba(73,59,44,.3)}
.cart-receipt-heading{position:sticky;top:-16px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-16px -16px 14px;padding:12px 16px;background:var(--surface);z-index:1}
.cart-receipt-heading h2{font-family:var(--font-s);font-size:18px;color:var(--ink)}
.cart-receipt-heading button{min-height:44px}
.cart-receipt-drawer :deep(.cart-line){gap:12px;flex-wrap:wrap}
.cart-receipt-drawer :deep(.cart-line .nm){min-width:0;overflow-wrap:anywhere}
.cart-receipt-drawer :deep(.cart-actions){flex-wrap:wrap}
@media(max-width:767px){.cart-receipt-mask{padding:0}.cart-receipt-drawer{max-height:100dvh}.cart-receipt-drawer :deep(.cart-actions){flex-direction:column}}
</style>
