<template>
  <section ref="sheet" class="box-image-sheet" data-theme="light" :style="{ width: BOX_IMAGE_LAYOUT_WIDTH + 'px' }">
    <header class="box-image-heading">
      <div><strong>{{ game }} BOX</strong><span class="box-image-subtitle">角色与练度</span></div>
      <span>共 {{ total }} 位 · 第 {{ page }} / {{ pages }} 张 · 第 {{ start }}—{{ start + entries.length - 1 }} 位</span>
    </header>
    <div class="box-image-grid">
      <article v-for="entry in entries" :key="entry.id" class="box-image-card">
        <picture v-if="portraits[entry.id]" class="ledger-portrait" aria-hidden="true">
          <img :src="portraits[entry.id]" alt="" width="480" height="350" />
        </picture>
        <header class="ledger-card-head">
          <div class="ledger-name-tab">
            <div v-if="!portraits[entry.id]" class="ledger-avatar operator-avatar"><img v-if="entry.avatar" :src="avatarUrl(entry.avatar)" :alt="entry.name" /><span v-else>{{ Array.from(entry.name)[0] }}</span></div>
            <h3 :class="{ 'is-three-char-name': Array.from(entry.name).length === 3, 'is-long-name': Array.from(entry.name).length > 3, 'is-single-column-name': entry.name === '史子眇·赴烛' }"><template v-if="entry.name === '陈登·黍王'">陈登·<span class="ledger-name-continuation ledger-name-continuation--natural">黍王</span></template><template v-else-if="entry.name === '史子眇·赴烛'">史子眇·<span class="ledger-name-continuation">赴烛</span></template><template v-else>{{ entry.name }}</template></h3>
          </div>
          <div class="ledger-identity"><div class="ledger-name-row">
            <span class="ledger-prof-tab" :class="{ 'ledger-prof-tab--fuzhu': entry.id === 'char_085_shizimiaosp' }">
              <img v-if="profIcon(entry.prof)" :src="profIcon(entry.prof)" :alt="entry.prof + '属性'" />
              <span>{{ entry.job }}</span>
            </span>
          </div></div>
        </header>
        <div class="ledger-huaji-value" :aria-label="entry.huaji">
          <template v-if="entry.huajiProgress?.stars">化极{{ entry.huajiProgress.stars }}星<template v-if="entry.huajiProgress.awakened"> · 已觉醒</template><template v-else-if="entry.huajiProgress.nodes != null"> · {{ entry.huajiProgress.nodes }}节点</template></template>
          <template v-else>{{ entry.huaji }}</template>
        </div>
        <div class="box-image-details">
          <section class="ledger-growth" aria-label="核心养成">
            <div class="ledger-growth-row">等级<strong>{{ entry.level }}</strong></div>
            <div class="ledger-growth-row">修为<strong>{{ entry.elite }}</strong></div>
          </section>
          <section class="ledger-combat" aria-label="战斗面板">
            <div v-for="kind in ['attack', 'hp']" :key="kind" class="ledger-combat-stat">
              <div class="ledger-combat-head"><Swords v-if="kind === 'attack'" :size="18" aria-hidden="true" /><Heart v-else :size="18" aria-hidden="true" /><span>{{ kind === 'attack' ? '攻击' : '生命' }}</span><strong class="ledger-combat-value">{{ entry[kind] }}</strong></div>
              <div class="box-image-oddity-row"><span>奇闻</span><div class="ledger-oddity" :class="{ 'is-full': entry.oddities?.[kind]?.max > 0 && entry.oddities[kind].current >= entry.oddities[kind].max }" :aria-label="(kind === 'attack' ? '攻击' : '生命') + '奇闻'"><output>{{ entry.oddities?.[kind]?.current ?? '—' }}</output><span>/ {{ entry.oddities?.[kind]?.max ?? '—' }}</span></div></div>
            </div>
          </section>
        <div class="ledger-loadouts"><div class="ledger-destiny">
          <div v-for="(loadout, index) in entry.loadouts" :key="index" class="ledger-destiny-row">
            <span>命盘{{ index === 0 ? '一' : '二' }}</span>
            <div class="ledger-destiny-values">
              <em v-for="(disc, i) in loadout" :key="i" class="disc-term" :class="discClass[disc.color]">{{ disc.name }}</em>
              <em v-if="!loadout.length" class="empty">未配置</em>
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
.box-image-sheet { box-sizing: border-box; padding: 30px; background: #f6f0e2; color: #352b20; font: 16px/1.5 var(--font-b, sans-serif); }
.box-image-sheet * { box-sizing: border-box; }
.box-image-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 0 4px 20px; margin-bottom: 20px; border-bottom: 1px solid #b79a61; }
.box-image-heading strong { font: 800 46px/1.2 var(--font-s, serif); }
.box-image-subtitle { margin-left: 18px; font: 600 23px var(--font-s, serif); }
.box-image-heading > span { font-size: 15px; }
.box-image-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.box-image-card { min-width: 0; position: relative; padding: 5px; border: 1px solid #b79a61; border-radius: 10px; background: #fffcf3; }
.ledger-card-head { position: relative; height: 190px; }
.ledger-portrait { position: absolute; top: 6px; right: 6px; left: 6px; height: 208px; overflow: hidden; border-radius: 6px 6px 0 0; }
.ledger-portrait img { position: relative; left: -6%; display: block; width: 112%; max-width: none; height: auto; }
/* Same-color transparent stops avoid dark interpolation in the PNG renderer. */
.ledger-portrait::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(255, 252, 243, 0) 76%, #fffcf3 100%), linear-gradient(180deg, rgba(255, 252, 243, 0) 90%, #fffcf3 100%); }
.ledger-name-tab { position: absolute; top: 8px; right: 12px; }
.ledger-name-tab h3 { margin: 0; writing-mode: vertical-rl; text-orientation: upright; font: 800 40px/1.1 var(--font-s, serif); letter-spacing: 2px; color: #2e2419; }
.ledger-name-tab h3.is-three-char-name { font-size: 36px; }
.ledger-name-tab h3.is-long-name { font-size: 26px; max-height: 176px; }
.ledger-name-continuation { display: inline; }
.ledger-card-head:has(.is-long-name) .ledger-identity { right: 90px; }
.ledger-identity { position: absolute; top: 13px; right: 66px; }
.ledger-prof-tab { display: flex; flex-direction: column; align-items: center; gap: 5px; font: 18px var(--font-s, serif); }
.ledger-prof-tab img { width: 25px; height: 25px; }
.ledger-prof-tab > span { writing-mode: vertical-rl; letter-spacing: 2px; }
.ledger-avatar { position: absolute; top: 40px; right: 100px; width: 90px; height: 90px; }
.ledger-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
.ledger-avatar > span { font-size: 60px; }
.ledger-huaji-value { position: relative; margin: 0 10px; padding: 4px 8px; border: 1px solid #d4bb7d; border-radius: 18px; background: #f7edce; text-align: center; font: 700 22px/1.35 var(--font-s, serif); overflow-wrap: anywhere; }
.box-image-details { position: relative; padding: 0 10px 9px; background: #fffcf3; }
.ledger-growth { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 9px 0; border-bottom: 1px solid #e0d1ac; }
.ledger-growth-row { display: flex; justify-content: center; align-items: baseline; gap: 18px; }
.ledger-growth-row + .ledger-growth-row { border-left: 1px solid #e0d1ac; }
.ledger-growth-row strong { font-size: 20px; }
.ledger-combat { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 8px 0; border-bottom: 1px solid #e0d1ac; }
.ledger-combat-stat { min-width: 0; padding: 0 6px; }
.ledger-combat-stat + .ledger-combat-stat { border-left: 1px solid #e0d1ac; }
.ledger-combat-head { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.ledger-combat-head svg { flex: none; color: #75664f; }
.ledger-combat-head > span { font-size: 13px; }
.ledger-combat-value { margin-left: auto; font-size: 20px; line-height: 1.4; overflow-wrap: anywhere; }
.ledger-combat-value, .ledger-growth-row strong, .ledger-oddity { font-family: var(--font-d, sans-serif); font-variant-numeric: tabular-nums; }
.box-image-oddity-row { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 2px; margin-top: 5px; font-size: 12px; color: #74654e; }
.ledger-oddity { display: flex; gap: 3px; color: #443a2d; }
.ledger-oddity.is-full { color: #38634c; }
.ledger-destiny { display: grid; gap: 7px; padding-top: 8px; }
.ledger-destiny-row { display: flex; align-items: center; gap: 6px; }
.ledger-destiny-row > span { flex: none; font: 15px var(--font-s, serif); color: #765624; }
.ledger-destiny-values { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; flex: 1; min-width: 0; }
.disc-term { display: flex; align-items: center; justify-content: center; min-height: 28px; padding: 4px 2px; border-radius: 4px; background: #eee9df; color: #3d3326; font: 600 13px/1.5 var(--font-s, serif); text-align: center; overflow-wrap: anywhere; }
.disc-term.rarity-gold { background: #fbefc2; }
.disc-term.rarity-purple { background: #e9e1f1; }
.disc-term.rarity-blue { background: #e0ebf0; }
.disc-term.empty { grid-column: 1 / -1; background: transparent; color: #74654e; font-weight: 400; justify-content: start; }
.box-image-footer { display: flex; justify-content: space-between; gap: 20px; padding-top: 20px; font: 14px var(--font-s, serif); color: #74654e; }
</style>
