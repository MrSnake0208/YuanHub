<template>
  <ul v-if="detail" class="import-guide-sources">
    <li v-for="source in sources" :key="source.title"><strong>{{ source.title }}</strong>：{{ source.from }}</li>
  </ul>
  <p v-else class="import-guide">支持：{{ sources.map(source => source.title).join('、') }}</p>
</template>

<script setup>
defineProps({
  sources: { type: Array, required: true },
  detail: Boolean,
  step: Number,
  target: String,
  steps: Array,
})
</script>

<style scoped>
.import-guide { margin-block: 4px 8px; color: var(--ink-60); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.import-guide-sources { padding-inline-start: 20px; color: var(--ink); overflow-wrap: anywhere; }
</style>
