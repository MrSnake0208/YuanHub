<template>
  <div class="disc-comparison" :class="{ 'is-compact': compact, 'is-current-only': currentOnly }">
    <section class="disc-comparison-side">
      <div v-if="!currentOnly" class="disc-comparison-heading">
        <h5>当前命盘 <small v-if="editable">{{ actual.length }} / 3</small></h5>
        <slot name="current-action"></slot>
      </div>
      <div class="disc-comparison-terms">
        <span v-for="name in actual" :key="name" :class="termClass(name)">{{ label(name) }}</span>
        <small v-if="!actual.length">未配置命盘</small>
      </div>
    </section>
    <span v-if="!currentOnly && !compact" class="disc-comparison-arrow" aria-hidden="true">→</span>
    <section v-if="!currentOnly" class="disc-comparison-side">
      <div class="disc-comparison-heading">
        <h5>目标命盘 <small v-if="!compact">{{ desired.length }} / 3</small></h5>
        <slot name="target-action"></slot>
      </div>
      <div class="disc-comparison-terms">
        <span v-for="name in desired" :key="name" :class="[termClass(name), { 'is-changed': difference.added.includes(name) }]">
          {{ label(name) }}<small v-if="!compact && difference.added.includes(name)">目标</small>
          <button v-if="editable" type="button" :aria-label="'移除目标词条' + name" @click="$emit('remove', name)">×</button>
        </span>
        <small v-if="!desired.length">目标未设置</small>
      </div>
      <button v-if="editable" type="button" class="disc-copy-current" :disabled="!actual.length" @click="$emit('copy')">复制当前为目标</button>
      <p v-if="differenceText" class="disc-comparison-difference" aria-live="polite">{{ differenceText }}</p>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { discNameOf, discTargetDifference, normalizeDiscNames } from '../../utils/operatorDiscLoadouts.js'

const props = defineProps({
  current: { type: Array, default: () => [] },
  target: { type: Array, default: () => [] },
  catalog: { type: Array, default: () => [] },
  editable: Boolean,
  compact: Boolean,
  currentOnly: Boolean,
})
defineEmits(['copy', 'remove'])
const actual = computed(() => normalizeDiscNames(props.current))
const desired = computed(() => normalizeDiscNames(props.target))
const difference = computed(() => discTargetDifference(actual.value, desired.value))
function catalogDisc(name) { return props.catalog.find(item => discNameOf(item) === name) }
function label(name) { return catalogDisc(name)?.abbreviation || name }
function termClass(name) {
  return { 'disc-comparison-term': true, 'is-gold': catalogDisc(name)?.color === '金', 'is-purple': catalogDisc(name)?.color === '紫', 'is-blue': catalogDisc(name)?.color === '蓝' }
}
const differenceText = computed(() => {
  const diff = difference.value
  if (props.compact) {
    if (!diff.targetCount) return ''
    const remaining = diff.added.length ? diff.added.length + ' 条目标未匹配' : '已填写目标均已匹配'
    if (!diff.complete) return '已设置 ' + diff.targetCount + '/3，' + remaining
    return diff.added.length ? remaining : '当前已符合目标，标记由你确认'
  }
  if (!diff.targetCount) return '可稍后设置目标'
  if (!diff.complete) return '已设置 ' + diff.targetCount + '/3，待补全目标'
  if (!diff.added.length) return '当前已符合目标，标记由你确认'
  const names = values => values.map(label).join('、')
  if (!diff.removed.length) return '需补充：' + names(diff.added)
  if (diff.removed.length !== diff.added.length) return '需移除：' + names(diff.removed) + '；需补充：' + names(diff.added)
  return '需替换：' + names(diff.removed) + ' → ' + names(diff.added)
})
</script>

<style scoped>
.disc-comparison { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
.disc-comparison-side { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.disc-comparison h5 { margin: 0; color: var(--ink); font-size: 15px; }
.disc-comparison h5 small { font: 12px var(--font-s); color: var(--ink-60); }
.disc-comparison-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.disc-copy-current { margin-top: 10px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); color: var(--theme-strong-text, var(--tea)); font: inherit; font-size: 12px; cursor: pointer; }
.disc-copy-current:disabled { opacity: .5; cursor: not-allowed; }
.disc-comparison-terms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.disc-comparison-terms > small { color: var(--ink-60); font-size: 12px; }
.disc-comparison-term { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 5px 9px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink); font-size: 13px; overflow-wrap: anywhere; }
.disc-comparison-term.is-gold { color: var(--theme-accent-text, #8a5a1f); background: var(--theme-wash, rgba(215, 137, 53, .14)); }
.disc-comparison-term.is-purple { color: var(--theme-purple-text, #6d56a0); background: var(--theme-purple-wash, rgba(151, 130, 199, .16)); }
.disc-comparison-term.is-blue { color: var(--theme-info-text, #4f6387); background: var(--theme-info-wash, rgba(110, 135, 184, .16)); }
.disc-comparison-term.is-changed { border-color: var(--accent); }
.disc-comparison-term > small { flex: none; font-size: 10px; color: var(--theme-strong-text, var(--tea)); }
.disc-comparison-term > button { flex: none; border: 0; padding: 0 3px; background: transparent; color: inherit; font-size: 18px; cursor: pointer; }
.disc-comparison-difference { margin: 10px 0 0; color: var(--theme-strong-text, var(--tea)); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.disc-comparison-arrow { display: none; }
.disc-comparison button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
@media (min-width: 769px) {
  .disc-comparison { grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; }
  .disc-comparison-arrow { display: block; align-self: center; color: var(--ink-60); font-size: 24px; }
}
.disc-comparison.is-compact { grid-template-columns: minmax(0, 1fr); gap: 10px; }
.is-compact .disc-comparison-side { padding: 0; border: 0; border-radius: 0; background: transparent; }
.is-compact h5 { font: 12px var(--font-s); color: var(--ink-60); }
.is-compact .disc-comparison-terms { margin-top: 6px; }
.is-compact.is-current-only .disc-comparison-terms { margin-top: 0; }
.is-compact .disc-comparison-term { border-radius: 6px; }
.is-compact .disc-comparison-term.is-changed { border-color: currentColor; font-weight: 600; }
.is-compact .disc-comparison-difference { margin-top: 8px; }
</style>
