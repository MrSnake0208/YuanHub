<template>
  <Teleport to="body">
    <div v-if="open" class="quick-dialog-mask" :style="viewportStyle" @click.self="$emit('close')">
      <section ref="panel" class="quick-dialog" :class="{ 'is-short-viewport': shortViewport }" role="dialog" aria-modal="true" :aria-labelledby="titleId" :aria-busy="locked" tabindex="-1" @focusin="revealFocusedControl">
        <header><h3 :id="titleId" ref="heading" tabindex="-1">{{ title }}</h3><button type="button" :disabled="locked" :aria-label="`关闭${title}`" @click="$emit('close')"><X :size="20" aria-hidden="true" /></button></header>
        <div ref="body" class="quick-dialog-body"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>
<script setup>
import { onBeforeUnmount, ref, useId, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
const props = defineProps({ open: Boolean, title: String, locked: Boolean })
const emit = defineEmits(['close'])
const panel = ref(null), body = ref(null), heading = ref(null), titleId = useId()
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => props.open, body, panel)
useModalFocus(() => props.open, panel, { initialFocus: () => heading.value, onEscape: () => { if (!props.locked) emit('close') } })
let previousOverflow
watch(() => props.open, value => {
  if (value) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden' }
  else if (previousOverflow !== undefined) { document.body.style.overflow = previousOverflow; previousOverflow = undefined }
}, { immediate: true })
onBeforeUnmount(() => { if (previousOverflow !== undefined) document.body.style.overflow = previousOverflow })
</script>
<style scoped src="./inventoryQuickDialogDesktop.css"></style>
<style scoped src="./inventoryQuickDialogMobile.css"></style>
