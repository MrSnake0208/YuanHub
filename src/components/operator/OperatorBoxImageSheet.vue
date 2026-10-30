<template>
  <section ref="sheet" class="box-image-sheet" data-theme="light">
    <header class="box-image-heading">
      <strong>{{ game }} BOX · 共 {{ total }} 位</strong>
      <span>第 {{ page }} / {{ pages }} 张 · 第 {{ start }}—{{ start + entries.length - 1 }} 位</span>
    </header>
    <div class="box-image-grid">
      <article v-for="entry in entries" :key="entry.id" class="box-image-card">
        <picture v-if="portraits[entry.id]" class="ledger-portrait" aria-hidden="true">
          <img :src="portraits[entry.id]" alt="" width="480" height="350" />
        </picture>
        <div v-else class="box-image-avatar" aria-hidden="true">
          <img v-if="entry.avatar" :src="avatarUrl(entry.avatar)" alt="" />
          <span v-else>{{ Array.from(entry.name)[0] }}</span>
        </div>
        <header class="ledger-card-head">
          <div class="ledger-prof-tab">
            <img v-if="profIcon(entry.prof)" :src="profIcon(entry.prof)" :alt="entry.prof" />
            <span v-else-if="entry.prof">{{ entry.prof }}</span>
            <span v-for="(char, i) in (entry.job || '')" :key="i">{{ char }}</span>
          </div>
          <h3 :class="{ 'is-long-name': Array.from(entry.name).length > 4 }"><span v-for="(char, i) in entry.name" :key="i">{{ char }}</span></h3>
        </header>
        <div class="box-image-summary">
          <dl class="ledger-growth">
            <div class="ledger-growth-row"><dt>等级</dt><dd>{{ entry.level }}</dd></div>
            <div class="ledger-growth-row"><dt>修为</dt><dd>{{ entry.elite }}</dd></div>
          </dl>
          <div class="ledger-combat" aria-label="战斗面板">
            <div v-for="kind in ['attack', 'hp']" :key="kind" class="ledger-combat-stat">
              <div class="ledger-combat-value" :aria-label="kind === 'attack' ? '攻击' : '生命'">
                <Swords v-if="kind === 'attack'" :size="16" aria-hidden="true" /><Heart v-else :size="16" aria-hidden="true" />
                <b>{{ entry[kind] }}</b>
              </div>
            </div>
          </div>
          <div class="ledger-huaji"><span>化极</span><b>{{ entry.huaji }}</b></div>
        </div>
        <div class="ledger-loadouts">
          <div class="ledger-destiny">
            <div v-for="(loadout, index) in entry.loadouts" :key="index" class="ledger-destiny-row">
              <span class="ledger-destiny-label">命盘{{ index === 0 ? '一' : '二' }}</span>
              <div class="ledger-destiny-values">
                <em v-for="(disc, i) in loadout" :key="i" class="disc-term" :class="discClass[disc.color]">{{ disc.name }}</em>
                <span v-if="!loadout.length" class="box-image-unset">未配置命盘</span>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
    <footer class="box-image-footer">YuanHub · 密探养成快照 <span>生成于 {{ generatedAt }}</span></footer>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { Heart, Swords } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
import { avatarUrl } from '../../api/request.js'

defineProps({ entries: { type: Array, required: true }, game: String, total: Number, start: Number, page: Number, pages: Number, generatedAt: String })
const sheet = ref(null)
const discClass = { 金: 'rarity-gold', gold: 'rarity-gold', 紫: 'rarity-purple', purple: 'rarity-purple', 蓝: 'rarity-blue', blue: 'rarity-blue' }
const profFiles = { 阳: 'yang', 阴: 'yin', 火: 'fire', 风: 'wind', 水: 'water', 地: 'earth', 混沌: 'chaos' }
const profIcon = prof => profFiles[prof] ? import.meta.env.BASE_URL + 'assets/prof-icons/' + profFiles[prof] + '.png' : ''
defineExpose({ sheet })
</script>

<style scoped>
/* V3 ledger portrait/head, growth/combat and destiny structure, without editor state.
 * Keep export geometry local: viewport rules, color-mix and writing-mode cannot be
 * reused by html2canvas 1.4.1. Colors below are the ledger's light-theme values. */
.box-image-sheet { box-sizing: border-box; width: 1440px; padding: 24px; background: #5a4633; color: #493b2c; font: 14px/1.4 var(--font-b, sans-serif); color-scheme: only light; }
.box-image-heading,.box-image-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; color: #f0e0ae; }
.box-image-heading { padding: 0 2px 18px; font: 500 22px/1.4 var(--font-s, serif); }
.box-image-heading strong { font-weight: 700; }
.box-image-heading > span { font-size: 17px; }
.box-image-footer { padding-top: 18px; font: 14px/1.4 var(--font-s, serif); }
.box-image-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.box-image-card { position: relative; min-width: 0; padding: 10px; border: 1px solid #d6b67c; border-top: 2px solid #d78935; border-radius: 14px; background: #fffdf6; }
.ledger-portrait { position: absolute; inset: 0 0 auto; height: 258px; overflow: hidden; border-radius: 12px 12px 0 0; background: #fff8ec; }
/* V3's intrinsic portrait ratio, height and center; no object-fit stretching. */
.ledger-portrait img { position: absolute; top: 0; left: calc(43% + 17px); width: auto; max-width: none; height: 234px; opacity: .94; transform: translateX(-50%); }
.ledger-portrait::after { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255,253,246,.24), transparent 30%, transparent 66%, rgba(255,253,246,.8)), linear-gradient(180deg, transparent 48%, rgba(255,253,246,.38) 74%, #fffdf6 100%); content: ''; }
.box-image-avatar { position: absolute; top: 50px; left: 24px; display: grid; place-items: center; width: 120px; height: 120px; border-radius: 50%; overflow: hidden; background: #fff8ec; color: #a99a83; font: 64px var(--font-s, serif); }
.box-image-avatar img { width: 100%; height: auto; }
.ledger-card-head { position: relative; display: flex; justify-content: flex-end; align-items: flex-start; gap: 5px; min-height: 200px; padding: 2px 2px 0; }
/* html2canvas cannot paint writing-mode: stack glyphs before capture. */
.ledger-card-head h3 { display: flex; flex-direction: column; margin: 0; color: #493b2c; font: 900 30px/1.3 var(--font-s, serif); text-shadow: 0 0 4px #fffdf6, 0 0 12px #fffdf6; }
.ledger-card-head h3.is-long-name { display: grid; grid-auto-flow: column; grid-template-rows: repeat(4, auto); column-gap: 2px; }
.ledger-prof-tab { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 5px 3px; border: 1px solid #e7dfcd; border-radius: 999px; background: rgba(255,253,246,.82); color: #5a4633; font-size: 12px; line-height: 1.4; }
.ledger-prof-tab img { width: 16px; height: 16px; margin-bottom: 3px; }
.box-image-summary { position: relative; display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 5px 8px; padding: 4px 3px 8px; }
.ledger-growth { display: grid; grid-template-rows: repeat(2, 1fr); margin: 0; }
.ledger-growth-row { display: flex; align-items: baseline; gap: 8px; min-width: 0; padding-top: 3px; }
.ledger-growth-row dt,.ledger-huaji > span { flex: none; font-family: var(--font-s, serif); font-weight: 700; }
.ledger-growth-row dd { margin: 0; font: 600 18px/1.4 var(--font-d, sans-serif); white-space: nowrap; }
.ledger-combat { display: grid; gap: 6px; min-width: 0; }
.ledger-combat-stat { min-width: 0; }
.ledger-combat-value { display: flex; align-items: center; gap: 5px; }
.ledger-combat-value svg { flex: none; color: #bf5250; }
.ledger-combat-value b { font: 700 18px/1.4 var(--font-d, sans-serif); font-variant-numeric: tabular-nums; white-space: nowrap; }
.ledger-huaji { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 8px; }
.ledger-huaji b { color: #b8772c; font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
.ledger-loadouts { position: relative; padding-top: 5px; border-top: 1px solid #eee4d2; }
.ledger-destiny { display: grid; gap: 5px; }
.ledger-destiny-row { display: flex; align-items: flex-start; gap: 5px; min-height: 28px; }
.ledger-destiny-label { flex: none; width: 39px; padding: 5px 0; color: #b8772c; font: 700 13px/1.4 var(--font-s, serif); }
.ledger-destiny-row:nth-child(2) .ledger-destiny-label { color: #7e7886; }
.ledger-destiny-values { display: flex; flex: 1; flex-wrap: wrap; gap: 4px; min-width: 0; }
.disc-term { box-sizing: border-box; max-width: 100%; padding: 4px; border: 1px solid rgba(73,59,44,.2); border-radius: 4px; background: #fffdf6; color: #55483c; font: 700 13px/1.4 var(--font-b, sans-serif); overflow-wrap: anywhere; }
.disc-term.rarity-gold { border-color: #dfc287; background: #fbf2df; }
.disc-term.rarity-purple { border-color: #c4b0d1; background: #f4eef8; }
.disc-term.rarity-blue { border-color: #a9bfd0; background: #eef4f8; }
.box-image-unset { padding: 5px 0; color: #827967; font-size: 13px; }
</style>
