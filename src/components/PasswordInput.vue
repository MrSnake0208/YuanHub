<template>
  <div class="input-wrap" :class="{ focus: focused }">
    <input v-bind="$attrs" v-model="model" :type="visible ? 'text' : 'password'" @focus="focused = true" @blur="focused = false" />
    <button type="button" class="visibility-toggle" :aria-label="visible ? '隐藏密码' : '显示密码'" :aria-pressed="visible" @click="visible = !visible">
      {{ visible ? '隐藏' : '显示' }}
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
defineOptions({ inheritAttrs: false })
const model = defineModel({ type: String })
const visible = ref(false)
const focused = ref(false)
</script>

<style scoped>
.input-wrap { display: flex; align-items: center; background: var(--cream); border: 1.5px solid var(--line); border-radius: 12px; transition: border-color .3s var(--ease), box-shadow .3s var(--ease); }
.input-wrap.focus { border-color: var(--yellow-deep); box-shadow: 0 0 0 3px rgba(239,210,142,.35); }
input { min-width: 0; flex: 1; border: none; outline: none; background: transparent; padding: 12px 14px; font-size: 14px; font-family: var(--font-b); color: var(--ink); }
input::placeholder { color: var(--ink-35); }
.visibility-toggle { min-width: 44px; min-height: 44px; padding: 0 12px; border: 0; background: transparent; color: var(--ink); font: 700 13px var(--font-b); cursor: pointer; }
.visibility-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; border-radius: 10px; }
</style>
