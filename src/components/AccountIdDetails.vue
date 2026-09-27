<template>
  <details class="id-details" @click.stop>
    <summary>{{ label }}</summary>
    <div class="id-content">
      <code>{{ value }}</code>
      <button type="button" @click="copy">{{ message || '复制编号' }}</button>
    </div>
  </details>
</template>

<script setup>
import { ref } from 'vue'
const props = defineProps({ value: { type: String, required: true }, label: { type: String, default: '查看技术编号' } })
const message = ref('')
async function copy() {
  try { await navigator.clipboard.writeText(props.value); message.value = '已复制' }
  catch { message.value = '复制失败，请手动选择编号' }
}
</script>

<style scoped>
.id-details { max-width: 100%; color: var(--ink-60); font-size: 11px; }
summary { min-height: 44px; display: inline-flex; align-items: center; cursor: pointer; }
.id-content { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
code { min-width: 0; overflow-wrap: anywhere; user-select: text; }
button { min-height: 44px; padding: 0 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); cursor: pointer; }
</style>
