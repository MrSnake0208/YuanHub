<template>
  <div class="star-share-controls" :aria-label="label">
    <div class="star-share-field"><span>品质</span><SoftSelect :model-value="quality" :options="qualities" :aria-label="label + '：品质'" @update:model-value="$emit('update:quality', $event)" /></div>
    <label class="star-share-search">名称搜索<input :value="search" type="search" placeholder="搜索星石名称" @input="$emit('update:search', $event.target.value)" /></label>
    <div class="star-share-field"><span>排序</span><SoftSelect :model-value="sort" :options="STAR_SHARE_SORTS" :aria-label="label + '：排序'" @update:model-value="$emit('update:sort', $event)" /></div>
  </div>
</template>
<script setup>
import { STAR_QUALITIES, STAR_QUALITY_LABELS } from '../../data/starDiscs.js'
import { STAR_SHARE_SORTS } from '../../domain/starShare.js'
import SoftSelect from '../ui/SoftSelect.vue'
const qualities = [{ value: 'all', label: '全部' }, ...STAR_QUALITIES.map(value => ({ value, label: STAR_QUALITY_LABELS[value] }))]
defineProps({ quality: String, search: String, sort: String, label: { type: String, default: '星石筛选与排序' } })
defineEmits(['update:quality', 'update:search', 'update:sort'])
</script>
<style scoped>
.star-share-controls { container: star-controls / inline-size; display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 6px 8px; min-width: 0 }
label,.star-share-field { display: grid; gap: 3px; min-width: 0; color: var(--ink-60); font: 700 12px var(--font-b) }
input { min-width: 0; width: 100%; min-height: 44px; box-sizing: border-box; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px; background: var(--surface); color: var(--ink); font: 14px var(--font-b) }
.star-share-field :deep(.soft-select) { color: var(--ink); font-size: 14px }
.star-share-search { grid-column: 1 / -1; grid-row: 2 }
input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
@container star-inventory (min-width: 500px) { .star-share-controls { grid-template-columns: minmax(100px,.8fr) minmax(0,1.4fr) minmax(140px,1fr) }.star-share-search { grid-column: auto; grid-row: auto } }
</style>
