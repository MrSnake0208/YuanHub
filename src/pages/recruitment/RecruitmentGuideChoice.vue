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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.guide-choice{border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 6px 20px rgba(73,59,44,.1)}button{border:0;border-radius:8px;background:transparent;color:var(--ink);cursor:pointer}button:hover{background:var(--cream)}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}small{color:var(--ink-60)}.choice-close{color:var(--ink-60)}
</style>
<style scoped src="./recruitmentGuideChoiceDesktop.css"></style>
<style scoped src="./recruitmentGuideChoiceMobile.css"></style>
