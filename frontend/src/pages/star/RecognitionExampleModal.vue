<template>
  <Teleport to="body">
    <div v-if="items.length || info" class="modal-mask is-raised recognition-example-mask" @click.self="emit('close')">
      <section ref="panel" class="recognition-example-panel" :class="{ 'is-info': info }" role="dialog" aria-modal="true" aria-labelledby="recognition-example-title" tabindex="-1">
        <header>
          <h2 id="recognition-example-title">{{ info?.title || current.title }}</h2>
          <button ref="closeButton" type="button" :aria-label="info ? '关闭核对说明' : '关闭示例图片'" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
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
import { X } from '@lucide/vue'
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.recognition-example-mask { background: rgb(73 59 44 / 65%); }
.recognition-example-panel { background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 20px; }
button { border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink); cursor: pointer; }
button:disabled { opacity: .45; cursor: default; }
</style>
<style scoped src="./recognitionExampleModalDesktop.css"></style>
<style scoped src="./recognitionExampleModalMobile.css"></style>
