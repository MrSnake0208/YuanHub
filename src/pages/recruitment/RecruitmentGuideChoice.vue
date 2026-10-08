<template>
  <div class="guide-choice" aria-label="开始使用教程" @keydown.esc.stop.prevent="$emit('close')">
    <button type="button" @click="$emit('record')">跟着记录一次<small>使用自己的真实资料</small></button>
    <button type="button" @click="$emit('practice')">先练习一下<small>示例，不会保存到账号</small></button>
    <button type="button" class="choice-close" @click="$emit('close')">关闭</button>
  </div>
</template>
<script setup>
defineEmits(['record', 'practice', 'close'])
</script>
<style scoped>
.guide-choice{display:grid;gap:4px;padding:8px;max-width:100%;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 6px 20px rgba(73,59,44,.1)}button{min-height:44px;padding:8px 12px;text-align:left;border:0;border-radius:8px;background:transparent;color:var(--ink);font:inherit;cursor:pointer}button:hover{background:var(--cream)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}small{display:block;color:var(--ink-60);font-size:12px;line-height:1.6}.choice-close{color:var(--ink-60)}
</style>
