<template>
  <section ref="sheet" class="box-image-sheet" data-theme="light">
    <header class="box-image-heading">
      <strong>{{ game }} BOX · 共 {{ total }} 位</strong>
      <span>第 {{ page }} / {{ pages }} 张 · 第 {{ start }}—{{ start + entries.length - 1 }} 位</span>
    </header>
    <div class="box-image-grid agent-ledger-grid">
      <!-- Keep the overview's editable skin, but mount presentation elements only. -->
      <article v-for="entry in entries" :key="entry.id" class="box-image-card agent-ledger-card agent-ledger-card--editable agent-ledger-card--v2 agent-ledger-card--v3" :class="['rarity-r' + entry.rarity, 'status-' + entry.status]">
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
            <div class="ledger-status-menu" :class="'status-' + entry.status"><span class="ledger-status-button"><span>{{ entry.statusLabel }}</span></span></div>
          </div></div>
        </header>
        <ShareCardStats :name="entry.name">
          <template #combat>
            <section class="ledger-combat" aria-label="战斗面板">
              <div v-for="kind in ['attack', 'hp']" :key="kind" class="ledger-combat-stat">
                <div class="ledger-combat-head"><span :aria-label="kind === 'attack' ? '攻击' : '生命'"><Swords v-if="kind === 'attack'" :size="12" aria-hidden="true" /><Heart v-else :size="12" aria-hidden="true" /></span></div>
                <span class="ledger-combat-value">{{ entry[kind] }}</span>

              </div>
            </section>
          </template>
          <template #growth>
            <section class="ledger-growth" aria-label="核心养成">
              <div class="ledger-growth-row"><span class="ledger-grow-label">等级</span><span class="ledger-inline-field"><span class="ledger-inline-input">{{ entry.level }}</span></span></div>
              <div class="ledger-growth-row"><span class="ledger-grow-label">修为</span><span class="ledger-inline-field"><span class="ledger-inline-input">{{ entry.elite }}</span></span></div>
              <div class="ledger-growth-row">
                <span class="ledger-grow-label">化极</span>
                <span class="ledger-huaji-value" :aria-label="entry.huaji">
                  <template v-if="entry.huajiProgress?.stars"><span>{{ entry.huajiProgress.stars }}</span><Star :size="12" fill="currentColor" aria-hidden="true" /><span v-if="entry.huajiProgress.nodes != null">{{ entry.huajiProgress.nodes }}<span class="box-image-node-label">节点</span></span><span v-if="entry.huajiProgress.awakened">已觉醒</span></template>
                  <template v-else>{{ entry.huaji }}</template>
                </span>
              </div>
            </section>
          </template>
        </ShareCardStats>
        <div class="ledger-loadouts"><div class="ledger-destiny fate-trait-style-a">
          <div v-for="(loadout, index) in entry.loadouts" :key="index" class="ledger-destiny-row">
            <span>命盘{{ index === 0 ? '一' : '二' }}</span>
            <div class="ledger-destiny-values">
              <em v-for="(disc, i) in loadout" :key="i" class="disc-term" :class="discClass[disc.color]">{{ disc.name }}</em>
              <span v-if="!loadout.length" class="box-image-unset">未配置命盘</span>
            </div>
          </div>
        </div></div>
      </article>
    </div>
    <footer class="box-image-footer">YuanHub · 密探养成快照 <span>生成于 {{ generatedAt }}</span></footer>
  </section>
</template>

<script setup>
import { ref } from 'vue'
import { Heart, Star, Swords } from '@lucide/vue'
import { avatarUrl } from '../../api/request.js'
import ShareCardStats from './ShareCardStats.vue'
import portraits from '../../data/operatorPortraits.json'

defineProps({ entries: { type: Array, required: true }, game: String, total: Number, start: Number, page: Number, pages: Number, generatedAt: String })
const sheet = ref(null)
const discClass = { 金: 'rarity-gold', gold: 'rarity-gold', 紫: 'rarity-purple', purple: 'rarity-purple', 蓝: 'rarity-blue', blue: 'rarity-blue' }
const profFiles = { 阳: 'yang', 阴: 'yin', 火: 'fire', 风: 'wind', 水: 'water', 地: 'earth', 混沌: 'chaos' }
const profIcon = prof => profFiles[prof] ? import.meta.env.BASE_URL + 'assets/prof-icons/' + profFiles[prof] + '.png' : ''
defineExpose({ sheet })
</script>

<style scoped src="../../styles/operator-ledger-card.reading.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3Desktop.css"></style>
<style scoped>
.box-image-sheet { box-sizing: border-box; width: 1440px; padding: 24px; background: #5a4633; color: var(--ink); font: 14px/1.4 var(--font-b, sans-serif); }
.box-image-heading,.box-image-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; color: #f0e0ae; }
.box-image-heading { padding: 0 2px 18px; font: 500 22px/1.4 var(--font-s, serif); }
.box-image-heading strong { font-weight: 700; }
.box-image-heading > span { font-size: 17px; }
.box-image-footer { padding-top: 18px; font: 14px/1.4 var(--font-s, serif); }
/* Override the overview skin's auto-fill so exported rows never exceed five cards. */
.box-image-sheet .box-image-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)) !important; gap: 10px; align-items: stretch; }
/* Only remove control decoration/columns; card geometry comes from the overview. */
/* html2canvas needs an explicit stacking context for the negative-z portrait. */
.box-image-sheet .box-image-card { z-index: 0; }
.box-image-sheet .box-image-card .ledger-growth-row:nth-child(n) { grid-template-columns: 20px minmax(0, 1fr); }
.box-image-sheet .box-image-card :is(.ledger-inline-input, .ledger-huaji-value, .ledger-combat-value) { border: 0 !important; background: transparent !important; }
.box-image-sheet .box-image-card .ledger-inline-input { display: flex; align-items: center; justify-content: center; font-family: var(--font-d); font-weight: 700; }
.box-image-sheet .box-image-card .ledger-huaji-value { flex-wrap: wrap; overflow: visible; white-space: normal; }
.box-image-node-label { margin-left: 2px; font-size: 8px; }
.box-image-sheet .box-image-card .ledger-status-menu { top: var(--ledger-header-inset-top); }
.box-image-sheet .box-image-card .ledger-status-button { cursor: default; }
.box-image-sheet .box-image-card .ledger-status-button::after { content: none; }
.box-image-sheet .box-image-card .ledger-destiny-row { cursor: default; }
.box-image-unset { grid-column: 1 / -1; color: var(--ink-35); font-size: 10px; }
</style>
