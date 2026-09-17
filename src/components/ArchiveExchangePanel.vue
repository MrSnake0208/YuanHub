<template>
  <div class="archive-workspace">
    <div class="archive-heading">
      <div>
        <span class="section-kicker">数据交换</span>
        <h2>导入或导出档案</h2>
        <p>{{ description }}</p>
      </div>
      <span class="archive-format">{{ format }}</span>
    </div>
    <div class="archive-actions">
      <button
        type="button"
        class="act-btn archive-import"
        :disabled="importDisabled"
        @click="$emit('toggle-import')"
      >
        <Upload :size="16" aria-hidden="true" />{{ importOpen ? '收起导入' : '导入档案' }}
      </button>
      <div class="export-group">
        <div class="export-label">导出范围</div>
        <div class="export-options" role="radiogroup" :aria-label="scopeLabel">
          <label
            v-for="option in scopeOptions"
            :key="option.value"
            class="export-option"
            :class="{ active: scope === option.value, disabled: option.disabled }"
          >
            <input
              :checked="scope === option.value"
              type="radio"
              :name="scopeName"
              :value="option.value"
              :disabled="option.disabled"
              @change="$emit('update:scope', option.value)"
            />
            <span><b>{{ option.label }}</b><small>{{ option.detail }}</small></span>
          </label>
        </div>
        <button
          type="button"
          class="act-btn export-submit"
          :disabled="exportDisabled"
          @click="$emit('export')"
        >
          <Download :size="16" aria-hidden="true" />导出档案
        </button>
      </div>
    </div>
    <slot name="import" />
  </div>
</template>

<script setup>
import { Download, Upload } from '@lucide/vue'

defineProps({
  description: { type: String, required: true },
  format: { type: String, default: 'JSON · v2' },
  importOpen: Boolean,
  importDisabled: Boolean,
  exportDisabled: Boolean,
  scope: { type: String, required: true },
  scopeName: { type: String, required: true },
  scopeLabel: { type: String, default: '导出范围' },
  scopeOptions: { type: Array, default: function () { return [] } },
})

defineEmits(['toggle-import', 'update:scope', 'export'])
</script>

<style scoped>
.act-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1.5px solid var(--line); border-radius: 999px; background: var(--surface); padding: 8px 16px; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); font-size: 12.5px; font-weight: 700; white-space: nowrap; transition: color 0.3s var(--ease), background-color 0.3s var(--ease), border-color 0.3s var(--ease); }
.act-btn:disabled { cursor: not-allowed; opacity: 0.45; }
.archive-workspace { border-top: 1px dashed var(--line); background: var(--cream); padding: 16px 24px 18px; }
.archive-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.archive-heading h2 { font-family: var(--font-s); font-size: 21px; line-height: 1.3; font-weight: 900; letter-spacing: 0.04em; }
.archive-heading p { margin-top: 5px; color: var(--ink-60); font-size: 12.5px; line-height: 1.7; }
.section-kicker { display: block; margin-bottom: 6px; color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: 0.14em; }
.archive-format { flex: none; border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; color: var(--ink-60); font-size: 11px; font-weight: 800; white-space: nowrap; }
.archive-actions { display: grid; grid-template-columns: minmax(150px, 0.36fr) minmax(0, 1fr); gap: 18px; align-items: stretch; margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line); }
.archive-actions svg { flex: none; }
.archive-import { min-height: 52px; border-radius: 12px; background: var(--surface); }
.export-group { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; }
.export-label { color: var(--ink-60); font-size: 12px; font-weight: 800; white-space: nowrap; }
.export-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.export-option { display: flex; align-items: center; gap: 9px; min-height: 52px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); cursor: pointer; transition: border-color 0.25s, background-color 0.25s, box-shadow 0.25s; }
.export-option.active { border-color: var(--accent); background: var(--cream); box-shadow: inset 3px 0 0 var(--accent); }
.export-option.disabled { opacity: 0.55; cursor: not-allowed; }
.export-option input { width: 15px; height: 15px; flex: none; accent-color: var(--accent); }
.export-option span { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.export-option b { color: var(--ink); font-size: 12.5px; white-space: nowrap; }
.export-option small { overflow: hidden; color: var(--ink-60); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.export-submit { min-height: 52px; padding-inline: 18px; border-color: var(--tea); background: var(--tea); color: var(--cream); }
.export-submit:hover:not(:disabled) { border-color: var(--tea-deep); background: var(--tea-deep); color: var(--cream); }
@media (max-width: 640px) {
  .archive-workspace { margin-top: 0; padding: 14px 16px 16px; }
  .archive-heading { flex-direction: column; gap: 8px; }
  .archive-actions { grid-template-columns: 1fr; gap: 12px; }
  .archive-import, .export-submit { width: 100%; min-height: 46px; }
  .export-group { grid-template-columns: 1fr; gap: 8px; }
  .export-label { font-size: 11.5px; }
  .export-option { min-height: 58px; padding: 8px 9px; }
  .export-option b { font-size: 12px; }
}
</style>
