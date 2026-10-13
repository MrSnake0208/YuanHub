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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.act-btn { border: 1.5px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink-60); cursor: pointer; transition: color 0.3s var(--ease), background-color 0.3s var(--ease), border-color 0.3s var(--ease); }
.act-btn:disabled { cursor: not-allowed; opacity: 0.45; }
.archive-workspace { border: 1px solid var(--line); border-radius: 16px; background: var(--cream); }
.archive-heading p { color: var(--ink-60); }
.section-kicker { color: var(--accent-strong); }
.archive-format { border: 1px solid var(--line); border-radius: 999px; color: var(--ink-60); }
.archive-actions { border-top: 1px dashed var(--line); }
.archive-import { border-radius: 12px; background: var(--surface); }
.export-label { color: var(--ink-60); }
.export-option { border: 1px solid var(--line); border-radius: 11px; background: var(--surface); cursor: pointer; transition: border-color 0.25s, background-color 0.25s, box-shadow 0.25s; }
.export-option.active { border-color: var(--accent); background: var(--cream); box-shadow: inset 3px 0 0 var(--accent); }
.export-option.disabled { opacity: 0.55; cursor: not-allowed; }
.export-option input { accent-color: var(--accent); }
.export-option b { color: var(--ink); }
.export-option small { color: var(--ink-60); }
.export-submit { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.export-submit:hover:not(:disabled) { border-color: var(--tea-deep); background: var(--tea-deep); color: var(--cream); }
</style>
<style scoped src="./archiveExchangePanelDesktop.css"></style>
<style scoped src="./archiveExchangePanelMobile.css"></style>
