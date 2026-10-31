<template>
  <section ref="sheet" class="box-image-sheet" data-theme="light" :style="{ width: BOX_IMAGE_LAYOUT_WIDTH + 'px' }">
    <img class="box-image-bamboo" :src="decorationUrl('bamboo')" alt="" aria-hidden="true" />
    <img class="box-image-mountains" :src="decorationUrl('mountains')" alt="" aria-hidden="true" />
    <header class="box-image-heading">
      <div><strong>{{ game }} BOX</strong><span class="box-image-subtitle">角色与练度</span></div>
      <span>共 {{ total }} 位 · 第 {{ page }} / {{ pages }} 张 · 第 {{ start }}—{{ start + entries.length - 1 }} 位</span>
    </header>
    <div class="box-image-grid">
      <article v-for="entry in entries" :key="entry.id" class="box-image-card" :data-prof="entry.prof" :data-operator="entry.id">
        <img class="box-image-frame" :src="decorationUrl('card-frame')" alt="" aria-hidden="true" />
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
        <div class="box-image-details">
          <section class="box-image-training" aria-label="核心养成">
            <div class="box-image-huaji-value" :aria-label="entry.huaji">
              <template v-if="entry.huajiProgress?.stars">
                <span>化极</span>
                <span class="box-image-stars" role="img" :aria-label="entry.huajiProgress.stars + '星'"><img v-for="star in entry.huajiProgress.stars" :key="star" :src="decorationUrl('star')" width="15" height="15" alt="" aria-hidden="true" /></span>
                <small v-if="entry.huajiProgress.awakened">· 已觉醒</small><small v-else-if="entry.huajiProgress.nodes != null">· {{ entry.huajiProgress.nodes }}节点</small>
              </template>
              <template v-else>{{ entry.huaji }}</template>
            </div>
            <div class="box-image-growth">
              <div class="box-image-growth-row"><span>等级</span><strong>{{ entry.level }}</strong></div>
              <div class="box-image-growth-row"><span>修为</span><strong>{{ entry.elite }}</strong></div>
            </div>
          </section>
          <section class="box-image-combat" aria-label="战斗面板">
            <div v-for="kind in ['hp', 'attack']" :key="kind" class="box-image-combat-stat">
              <div class="box-image-combat-head"><span>{{ kind === 'attack' ? '攻击' : '生命' }}</span><strong class="box-image-combat-value">{{ entry[kind] }}</strong></div>
            </div>
          </section>
        <div class="box-image-loadouts"><div class="box-image-destiny">
          <div v-for="(loadout, index) in entry.loadouts" :key="index" class="box-image-destiny-row">
            <span>命盘{{ index === 0 ? '一' : '二' }}</span>
            <div class="box-image-destiny-values"><div class="box-image-destiny-line">
              <em v-for="(disc, i) in loadout" :key="i" class="box-image-term" :class="discClass[disc.color]"><span>{{ disc.name }}</span></em>
              <em v-if="!loadout.length" class="box-image-term empty" aria-label="未配置">—</em>
              <span v-for="slot in Math.max(0, 3 - Math.max(1, loadout.length))" :key="'empty-' + slot" class="box-image-term-placeholder" aria-hidden="true"></span>
            </div></div>
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
import { avatarUrl } from '../../api/request.js'
import { BOX_IMAGE_LAYOUT_WIDTH } from '../../utils/operatorBoxImage.js'
import portraits from '../../data/operatorPortraits.json'

defineProps({ entries: { type: Array, required: true }, game: String, total: Number, start: Number, page: Number, pages: Number, generatedAt: String })
const sheet = ref(null)
const discClass = { 金: 'rarity-gold', gold: 'rarity-gold', 紫: 'rarity-purple', purple: 'rarity-purple', 蓝: 'rarity-blue', blue: 'rarity-blue' }
const decorationUrl = name => import.meta.env.BASE_URL + 'assets/operator-box/' + name + '.svg'
const profFiles = { 阳: 'yang', 阴: 'yin', 火: 'fire', 风: 'wind', 水: 'water', 地: 'earth', 混沌: 'chaos' }
const profIcon = prof => profFiles[prof] ? import.meta.env.BASE_URL + 'assets/prof-icons/' + profFiles[prof] + '.png' : ''
defineExpose({ sheet })
</script>

<style scoped>
.box-image-sheet { position: relative; isolation: isolate; box-sizing: border-box; padding: 28px 22px 24px; background: #f8f3e8; color: #3e3023; font: 14px/1.5 var(--font-b, sans-serif); }
.box-image-sheet * { box-sizing: border-box; }
.box-image-bamboo, .box-image-mountains { position: absolute; left: 0; width: 100%; pointer-events: none; z-index: 0; }
.box-image-heading, .box-image-grid, .box-image-footer { position: relative; z-index: 1; }
.box-image-bamboo { top: 0; height: 160px; }
.box-image-mountains { bottom: 0; height: 100px; }
.box-image-heading > div { display: flex; align-items: baseline; }
.box-image-frame { position: absolute; z-index: 3; inset: 2px; width: calc(100% - 4px); height: calc(100% - 4px); pointer-events: none; }
.box-image-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding-bottom: 16px; margin-bottom: 14px; border-bottom: 1px solid #c9ac79; }
.box-image-heading strong { font: 900 38px/1.2 var(--font-s, serif); }
.box-image-subtitle { margin-left: 14px; font: 600 17px var(--font-s, serif); }
.box-image-heading > span { font-size: 10px; text-align: right; color: #695b4b; }
.box-image-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px 9px; align-items: stretch; }
.box-image-card { --portrait-tone: #eee8de; min-width: 0; position: relative; overflow: hidden; border: 1px solid #b58a45; border-radius: 7px; background: #fffaf0; }
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
.box-image-card-head { position: relative; height: 264px; }
.box-image-portrait { position: absolute; inset: 3px 3px auto; height: 280px; overflow: hidden; border-radius: 4px 4px 0 0; background: var(--portrait-tone); }
.box-image-portrait img { position: absolute; top: 0; left: 47%; display: block; width: auto; max-width: none; height: 280px; transform: translateX(-50%); }
/* Plain RGB stops are supported by the PNG renderer; only the edges fade to paper. */
.box-image-portrait::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255, 250, 240, 0) 76%, #fffaf0 96%); }
.box-image-name-tab { position: absolute; top: 12px; right: 10px; padding: 10px 5px 12px; border: 1px solid #dac292; border-radius: 10px 0 10px 0; background: rgba(255, 250, 240, .94); }
.box-image-name-tab h3 { margin: 0; width: max-content; height: max-content; max-height: none; white-space: nowrap; writing-mode: vertical-rl; text-orientation: upright; font: 900 28px/1.1 var(--font-s, serif); letter-spacing: 2px; color: #493b2c; }
.box-image-name-tab h3.is-three-char-name { font-size: 26px; }
.box-image-name-tab h3.is-long-name { font-size: 21px; max-height: 196px; white-space: normal; overflow-wrap: anywhere; }
.box-image-name-continuation { display: inline; }
.box-image-identity { position: absolute; top: 12px; left: 9px; }
.box-image-prof-tab { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 4px 3px 8px; border: 1px solid #d5b773; border-radius: 14px; background: #fffaf0; font: 500 12px var(--font-b, sans-serif); }
.box-image-prof-tab img { width: 20px; height: 20px; }
.box-image-prof-tab > span { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 2px; }
.box-image-avatar { position: absolute; top: 76px; right: 53px; width: 88px; height: 88px; }
.box-image-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
.box-image-avatar > span { display: block; text-align: center; font-size: 56px; }
.box-image-training { padding: 0 0 10px; border-bottom: 1px solid #d8bd8c; }
.box-image-huaji-value { display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 24px; font: 500 13px/1.3 var(--font-b, sans-serif); white-space: nowrap; }
.box-image-stars { display: inline-flex; align-items: center; gap: 2px; flex: none; }
.box-image-stars img { display: block; width: 15px; height: 15px; }
.box-image-huaji-value small { font-size: 10px; font-weight: 500; color: #695b4b; }
.box-image-details { position: relative; padding: 0 7px 18px; background: #fffaf0; }
/* Rounded paper overlaps the portrait without masks or clip-path. */
.box-image-details::before { content: ''; position: absolute; top: -7px; left: 0; width: 100%; height: 9px; border-radius: 50% 50% 0 0; background: #fffaf0; }
.box-image-details > * { position: relative; }
.box-image-growth, .box-image-combat { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; }
.box-image-growth { margin-top: 8px; }
.box-image-growth-row, .box-image-combat-head { display: grid; grid-template-columns: 2em minmax(0, 1fr); align-items: center; column-gap: 5px; min-width: 0; text-align: left; font: 600 14px/1.4 var(--font-b, sans-serif); color: #695b4b; }
.box-image-growth-row + .box-image-growth-row, .box-image-combat-stat + .box-image-combat-stat { border-left: 1px solid #dfd1b6; padding-left: 8px; }
.box-image-growth-row strong, .box-image-combat-value { min-width: 0; font: inherit; font-weight: 700; color: #493b2c; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.box-image-combat { padding: 10px 0 12px; }
.box-image-combat-stat { min-width: 0; }
.box-image-destiny { display: grid; gap: 9px; padding-top: 2px; }
.box-image-destiny-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; }
.box-image-destiny-row > span { display: flex; align-items: center; gap: 7px; font: 500 10px/1.3 var(--font-b, sans-serif); color: #695b4b; }
.box-image-destiny-row > span::after { content: ''; flex: 1; border-top: 1px solid #e4d2ad; }
.box-image-destiny-values { min-width: 0; }
.box-image-destiny-line { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; gap: 4px; min-height: 28px; }
.box-image-term { display: flex; justify-content: center; align-items: center; min-width: 0; height: 28px; padding: 0; border: 1px solid #e2d7c7; border-radius: 3px; background: #faf6ed; color: #493b2c; font: 600 11px/1.4 var(--font-b, sans-serif); white-space: nowrap; }
.box-image-term-placeholder { height: 28px; border: 1px solid #eee5d8; border-radius: 2px; }
.box-image-term > span { flex: none; display: inline-block; transform-origin: center; }
.box-image-term.rarity-gold { border-color: #e8d4a1; background: #fbf3df; }
.box-image-term.rarity-purple { border-color: #d9cbe7; background: #f4eef8; }
.box-image-term.rarity-blue { border-color: #c9dce4; background: #eef5f7; }
.box-image-destiny-line > .empty { color: #695b4b; font-style: normal; }
.box-image-footer { display: flex; justify-content: space-between; gap: 20px; margin-top: 18px; padding-top: 12px; border-top: 1px solid #d8c5a3; font: 12px var(--font-b, sans-serif); color: #695b4b; }
</style>
