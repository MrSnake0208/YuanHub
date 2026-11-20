<template>
  <div class="backup-import-flow">
    <slot name="intro" />
    <div v-if="done" class="backup-import-card backup-import-success" role="status">
      <span class="backup-import-icon"><CircleCheck :size="22" aria-hidden="true" /></span>
      <div><h3>{{ doneTitle || `已导入到「${target}」` }}</h3><p>{{ done }}</p></div>
      <button class="btn ghost" type="button" :disabled="disabled" @click="$emit('again')">再导入一个文件</button>
    </div>
    <div v-else class="backup-import-card">
      <span class="backup-import-icon">
        <FileCheck v-if="filename" :size="22" aria-hidden="true" />
        <FileUp v-else :size="22" aria-hidden="true" />
      </span>
      <div v-if="filename">
        <h3>{{ filename }}</h3>
        <p>{{ targetLabel || `将导入到当前账号「${target}」` }}</p>
        <p v-if="sourceName && sourceName !== target">这份备份来自「{{ sourceName }}」。</p>
      </div>
      <div v-else>
        <h3>选择{{ feature }}备份文件</h3>
        <ImportGuide :sources="allSources" />
      </div>
      <button ref="chooseButton" :class="filename ? 'backup-import-text' : 'btn primary file-label'" type="button" :disabled="disabled" @click="$emit('choose')">{{ filename ? '换一个文件' : '选择文件' }}</button>
    </div>
    <slot />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { CircleCheck, FileCheck, FileUp } from '@lucide/vue'
import ImportGuide from './ImportGuide.vue'

const props = defineProps({
  feature: String, accountName: String, filename: String, sourceName: String, targetLabel: String, done: String, doneTitle: String,
  sources: { type: Array, required: true }, disabled: Boolean, fullBackup: { type: Boolean, default: true },
})
defineEmits(['choose', 'again'])
const allSources = computed(() => props.fullBackup ? [...props.sources, { title: '全部数据备份' }] : props.sources)
const target = computed(() => props.accountName || '尚未选择账号')
const chooseButton = ref(null)
defineExpose({ focus: () => chooseButton.value?.focus() })
</script>

<style>
.backup-import-flow { display: grid; gap: 12px; margin-top: 16px; min-width: 0; font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.backup-import-flow > .backup-import-flow { margin-top: 0; }
.backup-import-card { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: start; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); }
.backup-import-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--surface); color: var(--theme-strong-text, var(--tea)); }
.backup-import-card h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--ink); }
.backup-import-card p { margin: 4px 0 0; color: var(--ink-60); font-size: 14px; }
.backup-import-flow .backup-import-text { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; padding: 0 4px; border: 0; background: transparent; color: var(--theme-strong-text, var(--tea)); font: inherit; font-weight: 600; text-decoration: none; text-underline-offset: 3px; cursor: pointer; }
.backup-import-flow .backup-import-text:is(:hover, :focus-visible) { text-decoration: underline; }
.backup-import-flow .backup-import-text:disabled { opacity: .55; cursor: not-allowed; }
.backup-import-flow :is(button, a, summary, select, textarea):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 3px; }
.backup-import-flow :is(button, select, summary) { min-height: 44px; max-width: 100%; white-space: normal; }
.backup-import-flow button[aria-disabled='true'], .backup-import-flow a[aria-disabled='true'] { opacity: .55; }
.backup-import-flow :is(select, textarea) { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; padding: 8px 10px; }
.backup-import-flow textarea { min-height: 100px; resize: vertical; }
.backup-import-flow textarea[aria-invalid='true'] { border-color: var(--theme-danger-text, var(--rouge)); }
.backup-import-flow label:has(> input[type='checkbox']) { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.backup-import-flow p { margin-block: 0; }
.backup-import-flow .backup-import-card p { margin-top: 4px; }
.backup-import-flow label:has(> select) { display: grid; gap: 4px; }
.backup-import-flow .import-more-content { display: grid; gap: 8px; justify-items: start; }
.backup-import-flow .import-more-content > label, .backup-import-flow .import-more-content > form { width: 100%; min-width: 0; }
.backup-import-flow .import-more-content p, .backup-import-flow .import-more-content ul { margin: 0; }
.backup-import-hint { margin: 0; color: var(--ink-60); font-size: 13px; }
.backup-import-flow p[role='alert'] { color: var(--theme-danger-text, var(--rouge)); }
.backup-import-warning { padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); }
.backup-import-flow p.backup-import-warning[role='alert'] { color: var(--ink); }
.backup-import-warning p { margin: 0; }
.backup-import-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
@media (max-width: 767px) {
  .backup-import-card { grid-template-columns: 40px minmax(0, 1fr); }
  .backup-import-card > button { grid-column: 2; justify-self: start; }
}
</style>
