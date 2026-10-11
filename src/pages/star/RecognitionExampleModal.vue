<template>
  <Teleport to="body">
    <div v-if="items.length || info" class="modal-mask is-raised recognition-example-mask" @click.self="emit('close')">
      <section ref="panel" class="recognition-example-panel" :class="{ 'is-info': info }" role="dialog" aria-modal="true" aria-labelledby="recognition-example-title" tabindex="-1">
        <header>
          <h2 id="recognition-example-title">{{ info?.title || current.title }}</h2>
          <button ref="closeButton" type="button" :aria-label="info ? '关闭核对说明' : '关闭示例图片'" @click="emit('close')">×</button>
        </header>
        <div v-if="info" class="recognition-example-info">
          <p>{{ info.intro }}</p>
          <section v-for="section in info.sections" :key="section.title"><h3>{{ section.title }}</h3><p>{{ section.body }}</p></section>
        </div>
        <div v-else class="recognition-example-image">
          <img v-if="!failed" :key="current.src" :src="current.src" :alt="current.title" @error="failed = true" />
          <p v-else role="status">示例图待补充</p>
        </div>
        <p v-if="current.caption" class="recognition-example-caption">{{ current.caption }}</p>
        <footer v-if="items.length > 1">
          <button type="button" :disabled="index === 0" @click="index--">上一张</button>
          <span aria-live="polite">{{ index + 1 }} / {{ items.length }}</span>
          <button type="button" :disabled="index === items.length - 1" @click="index++">下一张</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
const props = defineProps({ items: { type: Array, default: () => [] }, info: { type: Object, default: null } })
const emit = defineEmits(['close'])
const index = ref(0), failed = ref(false), panel = ref(null), closeButton = ref(null)
const current = computed(() => props.items[index.value] || {})
watch(() => props.items, () => { index.value = 0 })
watch(() => current.value.src, () => { failed.value = false })
useModalFocus(computed(() => props.items.length > 0 || Boolean(props.info)), panel, { initialFocus: () => closeButton.value, onEscape: () => emit('close') })
</script>

<style scoped>
.recognition-example-mask { position: fixed; inset: 0; z-index: var(--z-overlay-raised); display: grid; place-items: center; padding: 12px; background: rgb(73 59 44 / 65%); }
.recognition-example-panel { width: min(100%, 1080px); max-height: calc(100dvh - 24px); display: flex; flex-direction: column; min-width: 0; padding: 16px; gap: 12px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 20px; }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex: none; }
h2 { margin: 0; font-family: var(--font-s); font-weight: 900; font-size: 20px; }
button { min-width: 44px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink); cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
.recognition-example-image { min-height: 0; display: grid; place-items: center; overflow: auto; }
img { display: block; max-width: 100%; max-height: calc(100dvh - 225px); object-fit: contain; }
.recognition-example-caption { margin: 0; flex: none; font-size: 14px; line-height: 1.6; }
.recognition-example-panel.is-info { width: min(100%, 560px); }
.recognition-example-info { min-height: 0; overflow-y: auto; font-size: 14px; line-height: 1.6; }
.recognition-example-info p { white-space: pre-line; margin: 0 0 12px; }
.recognition-example-info h3 { font-family: var(--font-s); margin: 8px 0 4px; font-size: 16px; }
footer span { font-family: var(--font-d); }
@media (max-width: 767px) {
  .recognition-example-mask { padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
  .recognition-example-panel { padding: 12px; max-height: calc(100dvh - 32px); }
}
</style>
