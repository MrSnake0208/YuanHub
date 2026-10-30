<template>
  <section ref="sheet" class="box-image-sheet" data-theme="light">
    <header>
      <strong>{{ game }} BOX · 共 {{ total }} 位</strong>
      <span>第 {{ page }} / {{ pages }} 张 · 第 {{ start }}—{{ start + entries.length - 1 }} 位</span>
    </header>
    <div class="box-image-grid">
      <article v-for="entry in entries" :key="entry.id" class="box-image-card">
        <div class="box-image-portrait">
          <div class="box-image-art">
            <img v-if="portraits[entry.id] || entry.avatar" :src="portraits[entry.id] || avatarUrl(entry.avatar)" alt="" />
            <span v-else class="box-image-monogram">{{ entry.name.slice(0, 1) }}</span>
          </div>
          <div class="box-image-identity">
            <span class="box-image-job"><img v-if="profIcon(entry.prof)" :src="profIcon(entry.prof)" alt="" /><span v-for="(char, i) in (entry.job || entry.prof || '')" :key="i">{{ char }}</span></span>
            <h3 :class="{ 'is-long': entry.name.length > 4 }"><span v-for="(char, i) in entry.name" :key="i">{{ char }}</span></h3>
          </div>
        </div>
        <div class="box-image-growth">
          <span>Lv. <b>{{ entry.level }}</b></span>
          <span>修为 <b>{{ entry.elite === '—' ? '—' : '+' + entry.elite }}</b></span>
          <span class="box-image-huaji"><span v-if="!entry.huaji.startsWith('化极')">化极 </span><b>{{ entry.huaji }}</b></span>
        </div>
        <div class="box-image-combat"><span><Swords :size="16" aria-hidden="true" /><b>{{ entry.attack }}</b></span><span><Heart :size="16" aria-hidden="true" /><b>{{ entry.hp }}</b></span></div>
        <div class="box-image-loadouts">
          <div v-for="(loadout, index) in entry.loadouts" :key="index" class="box-image-loadout">
            <span class="box-image-loadout-label">命盘{{ index === 0 ? '一' : '二' }}</span>
            <div><span v-for="(disc, i) in loadout" :key="i" class="box-image-disc" :class="discClass[disc.color]">{{ disc.name }}</span><span v-if="!loadout.length" class="box-image-unset">未配置命盘</span></div>
          </div>
        </div>
      </article>
    </div>
    <footer>YuanHub · 密探养成快照 <span>生成于 {{ generatedAt }}</span></footer>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { Heart, Swords } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { avatarUrl } from '../../api/request.js'

defineProps({ entries: { type: Array, required: true }, game: String, total: Number, start: Number, page: Number, pages: Number, generatedAt: String })
const sheet = ref(null)
const discClass = { 金: 'is-gold', gold: 'is-gold', 紫: 'is-purple', purple: 'is-purple', 蓝: 'is-blue', blue: 'is-blue' }
const profFiles = { 阳: 'yang', 阴: 'yin', 火: 'fire', 风: 'wind', 水: 'water', 地: 'earth', 混沌: 'chaos' }
const profIcon = prof => profFiles[prof] ? import.meta.env.BASE_URL + 'assets/prof-icons/' + profFiles[prof] + '.png' : ''
defineExpose({ sheet })
</script>

<style scoped>
/* Fixed export geometry is independent of the user's viewport and dark theme. */
.box-image-sheet { box-sizing: border-box; width: 1440px; padding: 24px; background: #5a4633; color: #493b2c; font: 14px/1.4 var(--font-b, sans-serif); color-scheme: only light; }
.box-image-sheet header,.box-image-sheet footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; color: #f0e0ae; }
.box-image-sheet header { padding: 0 2px 18px; font-size: 17px; }
.box-image-sheet footer { padding-top: 18px; font-size: 12px; }
.box-image-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
.box-image-card { min-width: 0; border: 1px solid #d6b67c; border-radius: 9px; background: #fffdf6; }
.box-image-portrait { display: flex; min-height: 200px; }
.box-image-art { position: relative; flex: 1; min-width: 0; overflow: hidden; border-top-left-radius: 8px; }
/* Keep the intrinsic ratio: html2canvas does not render object-fit. */
.box-image-art > img { position: absolute; top: 0; left: 50%; height: 200px; width: auto; max-width: none; transform: translateX(-50%); }
.box-image-identity { display: flex; flex: none; align-items: flex-start; gap: 4px; padding: 10px 8px 10px 2px; }
/* html2canvas does not implement writing-mode; stack glyphs explicitly. */
.box-image-identity h3 { display: flex; flex-direction: column; margin: 0; white-space: nowrap; font: 900 28px/1.15 var(--font-s, serif); }
.box-image-identity h3.is-long { display: grid; grid-auto-flow: column; grid-template-rows: repeat(4, auto); column-gap: 2px; }
.box-image-job { display: flex; flex-direction: column; align-items: center; gap: 2px; padding-top: 2px; color: #79674e; font-size: 12px; line-height: 1.25; }
.box-image-job img { width: 18px; height: 18px; margin-bottom: 4px; }
.box-image-monogram { display: block; text-align: center; padding-top: 50px; color: #c8b998; font: 64px var(--font-s, serif); }
.box-image-growth { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 3px 8px; margin: 0 10px; padding: 8px 0 4px; border-top: 1px solid #eee4d2; font-size: 12px; }
.box-image-growth > span { min-width: 0; overflow-wrap: anywhere; }
.box-image-growth > span:not(.box-image-huaji) { white-space: nowrap; }
.box-image-growth b { font: 700 14px/1.5 var(--font-d, sans-serif); }
.box-image-huaji { flex: 1; text-align: right; }
.box-image-huaji b { color: #a65d20; }
.box-image-combat { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 6px 10px 8px; }
.box-image-combat > span { display: flex; align-items: center; gap: 6px; min-width: 0; }
.box-image-combat svg { flex: none; color: #a97842; }
.box-image-combat b { min-width: 0; font: 800 20px/1.3 var(--font-d, sans-serif); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.box-image-loadouts { display: grid; gap: 5px; padding: 0 10px 10px; }
.box-image-loadout { display: flex; align-items: flex-start; gap: 6px; min-height: 25px; }
.box-image-loadout-label { flex: none; padding: 4px; border-radius: 3px; background: #f4ecd9; color: #795e35; font: 700 12px/1.4 var(--font-s, serif); }
.box-image-loadout > div { display: flex; flex: 1; flex-wrap: wrap; gap: 4px; min-width: 0; }
.box-image-disc { box-sizing: border-box; max-width: 100%; padding: 4px; border-radius: 3px; background: #f5f1e8; font-size: 12px; line-height: 1.4; font-weight: 700; overflow-wrap: anywhere; }
.box-image-disc.is-gold { background: #faf2df; color: #785a29; }
.box-image-disc.is-purple { background: #f3edf8; color: #645076; }
.box-image-disc.is-blue { background: #edf4f7; color: #466579; }
.box-image-unset { padding: 4px 0; color: #8e8273; font-size: 12px; }
</style>
