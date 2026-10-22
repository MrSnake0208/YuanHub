<template>
  <div class="star-share-inventory">
    <StarShareControls class="star-share-desktop-controls" v-model:quality="quality" v-model:search="search" v-model:sort="sort" />
    <div class="star-share-regions">
      <section v-for="region in regions" :key="region.kind" class="star-share-region" :aria-labelledby="id + '-' + region.kind">
        <h2 :id="id + '-' + region.kind">{{ region.label }} <span>{{ region.rows.length }} 颗</span></h2>
        <StarShareControls class="star-share-region-controls" :label="region.label + '筛选与排序'" v-model:quality="quality" v-model:search="search" v-model:sort="sort" />
        <div class="star-share-list" tabindex="0" role="region" :aria-label="region.label + '星石列表，可独立滚动'">
        <ul v-if="region.rows.length" class="star-share-grid" :aria-label="region.label + '星石列表'">
          <li v-for="stone in region.rows" :key="stone.key" class="star-share-stone" :aria-label="stone.name + '，' + qualityLabel(stone.quality) + '色' + region.label + '，' + stone.level + '级'">
            <div class="star-share-disc" :style="{ '--disc-bottom-inset': discBottomInset(stone) }">
              <img v-if="starDiscPath(stone.kind, stone.quality) && !failed.has(stone.key)" :src="starDiscPath(stone.kind, stone.quality)" alt="" loading="lazy" decoding="async" width="512" height="512" @error="failed.add(stone.key)" />
              <span v-else class="star-share-disc-fallback">{{ qualityLabel(stone.quality) }}色{{ region.label }}</span>
              <span class="star-share-level" aria-hidden="true">Lv.{{ stone.level }}</span>
            </div>
            <span class="star-share-name">{{ stone.name }}</span>
          </li>
        </ul>
        <p v-else class="star-share-empty">{{ hasFilters ? '没有符合条件的' : '当前没有' }}{{ region.label }}。</p>
        </div>
      </section>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, useId, watch } from 'vue'
import StarShareControls from './StarShareControls.vue'
import { sharedStarRows, filterSharedStars } from '../../domain/starShare.js'
import { starDiscPath, STAR_QUALITY_LABELS } from '../../data/starDiscs.js'
const props = defineProps({ inventory: { type: Array, default: () => [] } })
const id = 'star-share-' + useId()
const quality = defineModel('quality', { default: 'all' })
const search = defineModel('search', { default: '' })
const sort = defineModel('sort', { default: 'catalog' })
const failed = ref(new Set())
// Visible disc bottoms measured from the unchanged 1254px PNGs (alpha > 96).
// Remove the transparent footer from layout only; the entire image still renders.
const discBottom = { main: { orange: 1131, purple: 1136, blue: 1116, green: 1127, white: 1104 }, support: { orange: 1142, purple: 1111, blue: 1118, green: 1082, white: 1104 } }
const discBottomInset = stone => starDiscPath(stone.kind, stone.quality) ? (1254 - discBottom[stone.kind][stone.quality]) / 1254 : 0
const rows = computed(() => sharedStarRows(props.inventory))
const filtered = computed(() => filterSharedStars(rows.value, { quality: quality.value, search: search.value, sort: sort.value }))
const regions = computed(() => [{ kind: 'main', label: '主星' }, { kind: 'support', label: '辅星' }].map(region => ({ ...region, rows: filtered.value.filter(stone => stone.kind === region.kind) })))
const hasFilters = computed(() => quality.value !== 'all' || Boolean(search.value.trim()))
const qualityLabel = quality => STAR_QUALITY_LABELS[quality] || '未知品质'
watch(() => props.inventory, () => { failed.value = new Set() })
</script>
<style scoped>
.star-share-inventory { container: star-inventory / inline-size; min-width: 0 }
.star-share-desktop-controls { display: none; position: relative; margin-bottom: 12px }
.star-share-regions { display: grid; grid-template-columns: 1fr; align-items: start; gap: 12px }
.star-share-region { min-width: 0; padding: 10px 8px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface) }
.star-share-region:has(.is-open),.star-share-desktop-controls:has(.is-open) { position: relative; z-index: var(--z-popover) }
.star-share-region h2 { display: flex; align-items: baseline; gap: 8px; margin: 0 0 8px; font: 900 17px/1.4 var(--font-s); color: var(--ink) }
.star-share-region h2 span { font: 600 13px var(--font-d); color: var(--ink-60) }
.star-share-region-controls { display: grid; margin-bottom: 10px }
/* Extend the existing viewport-based range by about 1.5 mobile rows;
   desktop adds about two rows. Short lists still shrink to their content. */
.star-share-list { --list-extra-height: 132px; max-height: calc(clamp(280px,52dvh,560px) + var(--list-extra-height)); overflow: auto; scrollbar-width: thin; scrollbar-color: var(--line) transparent; padding: 3px 1px; border-radius: 8px }
.star-share-list:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px }
.star-share-list::-webkit-scrollbar { width: 6px }
.star-share-list::-webkit-scrollbar-thumb { background: var(--line); border-radius: 8px }
.star-share-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px 6px; margin: 0; padding: 0; list-style: none }
.star-share-stone { container-type: inline-size; min-width: 0; text-align: center }
.star-share-disc { position: relative; aspect-ratio: 1; width: min(80px,100cqi); margin: 0 auto calc(1px - min(80px,100cqi) * var(--disc-bottom-inset,0)) }
.star-share-disc img { display: block; width: 100%; height: 100%; object-fit: contain }
.star-share-level { position: absolute; top: 0; right: -1px; padding: 1px 3px; border: 1px solid var(--line); border-radius: 5px; background: var(--cream); color: var(--ink); font: 700 11px/1.3 var(--font-d) }
.star-share-name { position: relative; display: block; min-height: 1.35em; color: var(--ink); font: 700 12px/1.35 var(--font-b); overflow-wrap: anywhere }
.star-share-disc-fallback { display: grid; height: 100%; place-items: center; box-sizing: border-box; padding: 16px 8px; border: 1px dashed var(--line); border-radius: 50%; color: var(--ink-60); font-size: 12px }
.star-share-empty { padding: 14px 0; color: var(--ink-60); font-size: 13px }
@container star-inventory (min-width: 350px) { .star-share-grid { grid-template-columns: repeat(5,minmax(0,1fr)) } }
@container star-inventory (min-width: 500px) {
  .star-share-region { padding: 12px }
  .star-share-grid { grid-template-columns: repeat(auto-fill,minmax(max(76px,calc((100% - 64px) / 9)),1fr)); gap: 8px }
}
/* The host sidebar appears above 1080px. Within that shell, split only if ten
   readable cells fit. Tablet's wider single region keeps its own local controls. */
@media (min-width: 1081px) {
  .star-share-list { --list-extra-height: 200px }
  @container star-inventory (min-width: 860px) {
    .star-share-desktop-controls { display: grid }
    .star-share-region-controls { display: none }
    .star-share-regions { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px }
    .star-share-grid { grid-template-columns: repeat(5,minmax(0,1fr)); gap: 8px }
  }
}
</style>
