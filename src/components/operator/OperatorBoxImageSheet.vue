<template>
  <section ref="sheet" class="box-image-sheet" data-theme="light">
    <header>
      <strong>{{ game }} BOX · 共 {{ total }} 位</strong>
      <span>第 {{ page }} / {{ pages }} 张 · 第 {{ start }}—{{ start + entries.length - 1 }} 位</span>
    </header>
    <div class="box-image-grid">
      <article v-for="entry in entries" :key="entry.id" class="box-image-card">
        <div class="box-image-portrait">
          <img v-if="portraits[entry.id] || entry.avatar" :src="portraits[entry.id] || avatarUrl(entry.avatar)" alt="" />
          <span v-else class="box-image-monogram">{{ entry.name.slice(0, 1) }}</span>
          <div class="box-image-identity">
            <span class="box-image-job"><img v-if="profIcon(entry.prof)" :src="profIcon(entry.prof)" alt="" /><span v-for="(char, i) in (entry.job || entry.prof || '')" :key="i">{{ char }}</span></span>
            <h3 :class="{ 'is-long': entry.name.length > 4 }"><span v-for="(char, i) in entry.name" :key="i">{{ char }}</span></h3>
          </div>
        </div>
        <div class="box-image-growth"><span>Lv <b>{{ entry.level }}</b></span><span>修为 <b>+{{ entry.elite }}</b></span><strong>{{ entry.huaji }}</strong></div>
        <div class="box-image-combat"><span><Swords :size="15" aria-hidden="true" />{{ entry.attack }}</span><span><Heart :size="15" aria-hidden="true" />{{ entry.hp }}</span></div>
        <div class="box-image-loadouts">
          <div v-for="(loadout, index) in entry.loadouts" :key="index" class="box-image-loadout">
            <span class="box-image-loadout-label">{{ index === 0 ? '一' : '二' }}</span>
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
.box-image-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.box-image-card { min-width: 0; overflow: hidden; border: 1px solid #d6b67c; border-top: 2px solid #d4a65d; border-radius: 14px; background: #fffdf6; }
.box-image-portrait { position: relative; height: 200px; overflow: hidden; background: #fffdf6; }
.box-image-portrait > img { position: absolute; top: 0; left: 50%; height: 210px; width: auto; max-width: none; transform: translateX(-50%); object-fit: contain; }
.box-image-identity { position: absolute; top: 12px; right: 12px; display: flex; align-items: flex-start; gap: 5px; }
/* html2canvas does not implement writing-mode; stack glyphs explicitly. */
.box-image-identity h3 { display: flex; flex-direction: column; margin: 0; white-space: nowrap; font: 900 28px/1.2 var(--font-s, serif); text-shadow: 0 0 5px #fffdf6, 0 0 10px #fffdf6; }
.box-image-identity h3.is-long { font-size: 22px; }
.box-image-job { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 5px 3px; border: 1px solid #e8e1d2; border-radius: 20px; background: #fffdf6; font-size: 12px; }
.box-image-job img { width: 16px; height: 16px; }
.box-image-monogram { display: block; text-align: center; padding-top: 50px; color: #c8b998; font: 64px var(--font-s, serif); }
.box-image-growth { display: flex; justify-content: space-between; align-items: center; gap: 4px; margin: 0 10px; padding: 7px 5px; border: 1px solid #e8e1d2; border-radius: 9px; font-size: 12px; }
.box-image-growth b,.box-image-growth strong { font: 800 14px/1.3 var(--font-d, sans-serif); }
.box-image-growth strong { font-size: 12px; }
.box-image-combat { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 10px 14px 6px; }
.box-image-combat > span { display: flex; justify-content: center; align-items: center; gap: 6px; font: 800 18px/1.4 var(--font-d, sans-serif); }
.box-image-loadouts { display: grid; gap: 5px; padding: 4px 10px 12px; }
.box-image-loadout { display: flex; align-items: flex-start; gap: 5px; min-height: 28px; }
.box-image-loadout-label { padding-top: 5px; color: #9b742f; font-size: 11px; }
.box-image-loadout > div { display: flex; flex: 1; flex-wrap: wrap; gap: 4px; min-width: 0; }
.box-image-disc { padding: 4px 5px; border: 1px solid #ded8c9; border-radius: 5px; background: #f5f1e8; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
.box-image-disc.is-gold { border-color: #dfc78f; background: #faf2da; }
.box-image-disc.is-purple { border-color: #d5c6e0; background: #f3edf8; }
.box-image-disc.is-blue { border-color: #bed0db; background: #edf4f7; }
.box-image-unset { padding: 4px 0; color: #8e8273; font-size: 12px; }
</style>
