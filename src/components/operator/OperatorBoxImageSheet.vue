<template>
  <section ref="sheet" class="box-image-sheet" data-theme="light" :style="{ width: BOX_IMAGE_LAYOUT_WIDTH + 'px' }">
    <header class="box-image-heading">
      <div><strong>{{ game }} BOX</strong><span class="box-image-subtitle">角色与练度</span></div>
      <span>共 {{ total }} 位 · 第 {{ page }} / {{ pages }} 张 · 第 {{ start }}—{{ start + entries.length - 1 }} 位</span>
    </header>
    <div class="box-image-grid">
      <article v-for="entry in entries" :key="entry.id" class="box-image-card" :data-prof="entry.prof" :data-operator="entry.id">
        <picture v-if="portraits[entry.id]" class="box-image-portrait" aria-hidden="true">
          <img :src="portraits[entry.id]" alt="" width="480" height="350" />
        </picture>
        <header class="box-image-card-head">
          <div class="box-image-name-tab">
            <div v-if="!portraits[entry.id]" class="box-image-avatar"><img v-if="entry.avatar" :src="avatarUrl(entry.avatar)" :alt="entry.name" /><span v-else>{{ Array.from(entry.name)[0] }}</span></div>
            <h3 :class="{ 'is-three-char-name': Array.from(entry.name).length === 3, 'is-long-name': Array.from(entry.name).length > 3, 'is-single-column-name': entry.name === '史子眇·赴烛' }"><template v-if="entry.name === '陈登·黍王'">陈登·<span class="box-image-name-continuation box-image-name-continuation--natural">黍王</span></template><template v-else-if="entry.name === '史子眇·赴烛'">史子眇·<span class="box-image-name-continuation">赴烛</span></template><template v-else>{{ entry.name }}</template></h3>
          </div>
          <div class="box-image-identity"><div class="box-image-name-row">
            <span class="box-image-prof-tab" :class="{ 'box-image-prof-tab--fuzhu': entry.id === 'char_085_shizimiaosp' }">
              <img v-if="profIcon(entry.prof)" :src="profIcon(entry.prof)" :alt="entry.prof + '属性'" />
              <span>{{ entry.job }}</span>
            </span>
          </div></div>
        </header>
        <div class="box-image-huaji-value" :aria-label="entry.huaji">
          <template v-if="entry.huajiProgress?.stars"><span>化极<strong>{{ entry.huajiProgress.stars }}</strong>星</span><small v-if="entry.huajiProgress.awakened"> · 已觉醒</small><small v-else-if="entry.huajiProgress.nodes != null"> · {{ entry.huajiProgress.nodes }}节点</small></template>
          <template v-else>{{ entry.huaji }}</template>
        </div>
        <div class="box-image-details">
          <section class="box-image-growth" aria-label="核心养成">
            <div class="box-image-growth-row">等级<strong>{{ entry.level }}</strong></div>
            <div class="box-image-growth-row">修为<strong>{{ entry.elite }}</strong></div>
          </section>
          <section class="box-image-combat" aria-label="战斗面板">
            <div v-for="kind in ['attack', 'hp']" :key="kind" class="box-image-combat-stat">
              <div class="box-image-combat-head"><Swords v-if="kind === 'attack'" :size="18" aria-hidden="true" /><Heart v-else :size="18" aria-hidden="true" /><span>{{ kind === 'attack' ? '攻击' : '生命' }}</span><strong class="box-image-combat-value">{{ entry[kind] }}</strong></div>
              <div class="box-image-oddity-row"><span>奇闻</span><div class="box-image-oddity" :class="{ 'is-full': entry.oddities?.[kind]?.max > 0 && entry.oddities[kind].current >= entry.oddities[kind].max }" :aria-label="(kind === 'attack' ? '攻击' : '生命') + '奇闻'"><output>{{ entry.oddities?.[kind]?.current ?? '—' }}</output><span>/ {{ entry.oddities?.[kind]?.max ?? '—' }}</span></div></div>
            </div>
          </section>
        <div class="box-image-loadouts"><div class="box-image-destiny">
          <div v-for="(loadout, index) in entry.loadouts" :key="index" class="box-image-destiny-row">
            <span>命盘{{ index === 0 ? '一' : '二' }}</span>
            <div class="box-image-destiny-values">
              <em v-for="(disc, i) in loadout" :key="i" class="box-image-term" :class="discClass[disc.color]">{{ disc.name }}</em>
              <em v-if="!loadout.length" class="empty" aria-label="未配置">—</em>
            </div>
          </div>
        </div></div>
        </div>
      </article>
    </div>
    <footer class="box-image-footer">YuanHub · 密探养成快照 <span>生成于 {{ generatedAt }}</span></footer>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { Heart, Swords } from '@lucide/vue'
import { avatarUrl } from '../../api/request.js'
import { BOX_IMAGE_LAYOUT_WIDTH } from '../../utils/operatorBoxImage.js'
import portraits from '../../data/operatorPortraits.json'

defineProps({ entries: { type: Array, required: true }, game: String, total: Number, start: Number, page: Number, pages: Number, generatedAt: String })
const sheet = ref(null)
const discClass = { 金: 'rarity-gold', gold: 'rarity-gold', 紫: 'rarity-purple', purple: 'rarity-purple', 蓝: 'rarity-blue', blue: 'rarity-blue' }
const profFiles = { 阳: 'yang', 阴: 'yin', 火: 'fire', 风: 'wind', 水: 'water', 地: 'earth', 混沌: 'chaos' }
const profIcon = prof => profFiles[prof] ? import.meta.env.BASE_URL + 'assets/prof-icons/' + profFiles[prof] + '.png' : ''
defineExpose({ sheet })
</script>

<style scoped>
.box-image-sheet { box-sizing: border-box; padding: 28px; background: #f6f0e5; color: #493b2c; font: 14px/1.5 var(--font-b, sans-serif); }
.box-image-sheet * { box-sizing: border-box; }
.box-image-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; padding-bottom: 18px; margin-bottom: 20px; border-bottom: 1px solid #d8cebe; }
.box-image-heading strong { font: 700 32px/1.2 var(--font-s, serif); }
.box-image-subtitle { margin-left: 14px; font: 500 17px var(--font-s, serif); }
.box-image-heading > span { font-size: 12px; color: #695b4b; }
.box-image-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 22px 12px; align-items: stretch; }
.box-image-card { --portrait-tone: #eee8de; min-width: 0; position: relative; border: 1px solid #d8cebe; border-radius: 5px; background: #fffdf6; }
/* Pale backing colors are decorative; the original attribute icon retains its meaning. */
.box-image-card[data-prof="风"] { --portrait-tone: #e5ede2; }
.box-image-card[data-prof="水"] { --portrait-tone: #e2eaf0; }
.box-image-card[data-prof="火"] { --portrait-tone: #f1e4d9; }
.box-image-card[data-prof="阴"] { --portrait-tone: #ebe4ef; }
.box-image-card[data-prof="阳"] { --portrait-tone: #f0e9d6; }
.box-image-card[data-prof="地"] { --portrait-tone: #eae4d8; }
.box-image-card[data-prof="混沌"] { --portrait-tone: #e7e5ed; }
/* These portraits use their illustration palette rather than their attribute color. */
.box-image-card[data-operator="char_064_ganning"] { --portrait-tone: #eee0df; }
.box-image-card[data-operator="char_125_zhaoyun"] { --portrait-tone: #e1e8ee; }
.box-image-card[data-operator="char_093_shixie"] { --portrait-tone: #e0ece7; }
.box-image-card[data-operator="char_123_sunfu"] { --portrait-tone: #e9e1df; }
.box-image-card-head { position: relative; height: 222px; }
.box-image-portrait { position: absolute; inset: 0 0 auto; height: 232px; overflow: hidden; border-radius: 4px 4px 0 0; background: var(--portrait-tone); }
.box-image-portrait img { position: absolute; top: 0; left: 42%; display: block; width: auto; max-width: none; height: 232px; transform: translateX(-50%); }
/* Plain RGB stops are supported by the PNG renderer; only the edges fade to paper. */
.box-image-portrait::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255, 253, 246, 0) 68%, rgba(255, 253, 246, .9) 100%), linear-gradient(180deg, rgba(255, 253, 246, 0) 86%, #fffdf6 100%); }
.box-image-name-tab { position: absolute; top: 14px; right: 9px; }
.box-image-name-tab h3 { margin: 0; width: max-content; height: max-content; max-height: none; white-space: nowrap; writing-mode: vertical-rl; text-orientation: upright; font: 700 30px/1.1 var(--font-s, serif); letter-spacing: 2px; color: #493b2c; }
.box-image-name-tab h3.is-three-char-name { font-size: 28px; }
.box-image-name-tab h3.is-long-name { font-size: 21px; max-height: 196px; white-space: normal; overflow-wrap: anywhere; }
.box-image-name-continuation { display: inline; }
.box-image-identity { position: absolute; top: 16px; right: 47px; }
.box-image-prof-tab { display: flex; flex-direction: column; align-items: center; gap: 5px; font: 14px var(--font-s, serif); }
.box-image-prof-tab img { width: 20px; height: 20px; }
.box-image-prof-tab > span { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 2px; }
.box-image-avatar { position: absolute; top: 56px; right: 55px; width: 88px; height: 88px; }
.box-image-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
.box-image-avatar > span { display: block; text-align: center; font-size: 56px; }
.box-image-huaji-value { position: relative; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 3px; min-height: 38px; margin: 0 10px; font: 600 18px/1.5 var(--font-s, serif); overflow-wrap: anywhere; }
.box-image-huaji-value > span { white-space: nowrap; }
.box-image-huaji-value strong { color: #a6514a; font-size: 25px; font-weight: 600; }
.box-image-huaji-value small { font-size: 13px; font-weight: 500; }
.box-image-details { position: relative; padding: 0 10px 12px; }
.box-image-growth { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 7px 0 10px; border-bottom: 1px solid #ddd4c7; }
.box-image-growth-row { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; font-size: 12px; }
.box-image-growth-row strong { font-size: 17px; }
.box-image-combat { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 10px 0; border-bottom: 1px solid #ddd4c7; }
.box-image-combat-stat { min-width: 0; }
.box-image-combat-head { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.box-image-combat-head svg { flex: none; width: 15px; height: 15px; color: #695b4b; }
.box-image-combat-head > span { font-size: 12px; }
.box-image-combat-value { flex-basis: 100%; font-size: 19px; line-height: 1.4; overflow-wrap: anywhere; }
.box-image-combat-value, .box-image-growth-row strong, .box-image-oddity { font-family: var(--font-d, sans-serif); font-variant-numeric: tabular-nums; }
.box-image-oddity-row { display: flex; flex-direction: column; align-items: flex-start; margin-top: 3px; font-size: 11px; color: #695b4b; }
.box-image-oddity { display: flex; flex-wrap: wrap; gap: 2px; color: #493b2c; }
.box-image-oddity.is-full { color: #276749; }
.box-image-destiny { display: grid; gap: 8px; padding-top: 10px; }
.box-image-destiny-row { display: flex; align-items: baseline; gap: 6px; }
.box-image-destiny-row > span { flex: none; font: 12px var(--font-s, serif); color: #695b4b; }
.box-image-destiny-values { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px; flex: 1; min-width: 0; }
.box-image-term { max-width: 100%; padding: 2px 5px; border-radius: 3px; background: #eee9df; color: #493b2c; font: 500 12px/1.5 var(--font-b, sans-serif); overflow-wrap: anywhere; }
.box-image-term.rarity-gold { background: #f5e9bf; }
.box-image-term.rarity-purple { background: #e9e1f1; }
.box-image-term.rarity-blue { background: #e0ebf0; }
.box-image-destiny-values > .empty { color: #695b4b; font-style: normal; }
.box-image-footer { display: flex; justify-content: space-between; gap: 20px; padding-top: 20px; font: 12px var(--font-s, serif); color: #695b4b; }
</style>
