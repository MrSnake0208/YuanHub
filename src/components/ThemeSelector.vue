<template>
  <div class="theme-selector" role="group" aria-label="外观主题">
    <button v-for="option in options" :key="option.value" type="button"
      :aria-pressed="theme.preference === option.value" @click="setThemePreference(option.value)">
      {{ option.label }}
    </button>
  </div>
</template>

<script setup>
import { theme, setThemePreference } from '@/store/theme.js'

const options = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' }
]
</script>

<style scoped>
.theme-selector{display:flex;gap:3px;min-width:0;padding:3px;margin:8px 0;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
.theme-selector button{flex:1;white-space:nowrap;padding:7px 5px;border:0;border-radius:6px;background:transparent;color:var(--ink-60);font:600 12px/1.5 var(--font-b);cursor:pointer}
.theme-selector button[aria-pressed=true]{background:var(--tea);color:var(--on-strong)}
.theme-selector button:focus-visible{outline:2px solid var(--theme-focus, var(--accent));outline-offset:1px}
</style>
