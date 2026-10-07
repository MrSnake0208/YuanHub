<template>
  <Teleport to="body">
    <div v-if="items.length" class="modal-mask is-raised recognition-example-mask" @click.self="emit('close')">
      <section ref="panel" class="recognition-example-panel" role="dialog" aria-modal="true" aria-labelledby="recognition-example-title" tabindex="-1">
        <header>
          <h2 id="recognition-example-title">{{ current.title }}</h2>
          <button ref="closeButton" type="button" aria-label="关闭示例图片" @click="emit('close')">×</button>
        </header>
        <div class="recognition-example-content">
          <p v-if="failed" role="status">示例图暂时无法加载，请参考下方说明。</p>
          <template v-else-if="!full && current.crops?.length">
            <figure v-for="(crop, number) in current.crops" :key="number">
              <figcaption>{{ number + 1 }}. {{ crop.label }}</figcaption>
              <div class="recognition-example-crop" :style="{ aspectRatio: crop.aspect }">
                <img :src="current.src" :alt="crop.label" :style="cropStyle(crop)" @error="failed = true" />
                <span class="recognition-example-frame" aria-hidden="true" />
              </div>
            </figure>
          </template>
          <img v-else class="recognition-example-full" :src="current.src" :alt="current.title" @error="failed = true" />
          <p class="recognition-example-caption">{{ current.caption }}</p>
        </div>
        <button v-if="current.crops?.length && !failed" type="button" class="recognition-example-toggle" @click="full = !full">{{ full ? '返回重点标注' : '查看完整截图' }}</button>
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
const props = defineProps({ items: { type: Array, default: () => [] } })
const emit = defineEmits(['close'])
const index = ref(0), failed = ref(false), full = ref(false), panel = ref(null), closeButton = ref(null)
const current = computed(() => props.items[index.value] || {})
const cropStyle = crop => ({ width: `${10000 / crop.width}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%` })
watch(() => props.items, () => { index.value = 0 })
watch(() => current.value.src, () => { failed.value = false; full.value = false })
useModalFocus(computed(() => props.items.length > 0), panel, { initialFocus: () => closeButton.value, onEscape: () => emit('close') })
</script>

<style scoped>
.recognition-example-mask { position: fixed; inset: 0; z-index: var(--z-overlay-raised); display: grid; place-items: center; padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); background: rgb(73 59 44 / 65%); }
.recognition-example-panel { box-sizing: border-box; width: min(100%, 760px); max-height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)); display: flex; flex-direction: column; min-width: 0; padding: 12px; gap: 8px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 20px; }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: none; }
h2 { margin: 0; font-family: var(--font-s); font-weight: 900; font-size: 18px; }
button { min-width: 44px; min-height: 44px; padding: 8px 12px; flex-shrink: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink); font: inherit; cursor: pointer; }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .45; cursor: default; }
.recognition-example-content { min-height: 0; overflow-y: auto; }
figure { margin: 0 0 12px; }
figcaption { margin-bottom: 6px; font-size: 14px; font-weight: 700; line-height: 1.6; }
.recognition-example-crop { position: relative; overflow: hidden; width: 100%; border-radius: 10px; }
.recognition-example-crop img { position: absolute; max-width: none; height: auto; display: block; }
.recognition-example-frame { position: absolute; inset: 3px; border: 3px solid var(--yellow); border-radius: 8px; pointer-events: none; }
.recognition-example-full { display: block; max-width: 100%; height: auto; margin: auto; }
.recognition-example-caption { margin: 8px 0; font-size: 14px; line-height: 1.6; }
.recognition-example-toggle { align-self: flex-start; }
footer span { font-family: var(--font-d); }
</style>
