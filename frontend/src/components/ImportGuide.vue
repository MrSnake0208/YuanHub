<template>
  <section class="import-guide" aria-label="导入指引">
    <h3>可以导入的文件</h3>
    <ul class="import-guide-sources">
      <li v-for="source in sources" :key="source.title"><strong>{{ source.title }}</strong>：{{ source.from }}</li>
    </ul>
    <ol class="import-guide-steps" aria-label="导入步骤">
      <li v-for="(label, index) in steps" :key="index" :aria-current="step === index + 1 ? 'step' : undefined">
        <span class="import-guide-number" aria-hidden="true">{{ index + 1 }}</span>
        <span>{{ label }}<template v-if="index === 2 && target">到「{{ target }}」</template><small v-if="index + 1 < step">（已完成）</small></span>
      </li>
    </ol>
  </section>
</template>

<script setup>
defineProps({
  sources: { type: Array, required: true },
  step: { type: Number, required: true, validator: value => [1, 2, 3].includes(value) },
  target: { type: String, default: '' },
  steps: { type: Array, default: () => ['选择文件', '核对预览', '确认导入'] },
})
</script>

<style scoped>
.import-guide { min-width: 0; margin-block: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.import-guide h3 { margin: 0 0 4px; font: inherit; font-weight: 600; }
.import-guide-sources { margin: 0; padding-inline-start: 20px; color: var(--ink-60); }
.import-guide-sources strong { color: var(--ink); }
.import-guide-steps { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 10px 0 0; padding: 0; list-style: none; }
.import-guide-steps li { display: flex; align-items: baseline; gap: 6px; flex: 1 1 10rem; min-width: 0; color: var(--ink-60); }
.import-guide-steps li[aria-current="step"] { color: var(--ink); font-weight: 600; }
.import-guide-number { flex: none; width: 1.5em; text-align: center; border: 1px solid var(--line); border-radius: 50%; }
[aria-current="step"] .import-guide-number { border-color: var(--accent); background: var(--cream); }
.import-guide-steps small { font-size: inherit; }
</style>
