<template>
  <section ref="sheet" class="battle-sheet" :class="'is-' + kind" data-theme="light">
    <img class="sheet-bamboo" :src="decorationUrl('bamboo')" alt="" aria-hidden="true" />
    <img class="sheet-mountains" :src="decorationUrl('mountains')" alt="" aria-hidden="true" />
    <header class="sheet-heading"><div class="sheet-category"><span>{{ model.game }}</span><i aria-hidden="true">·</i><span>{{ kind === 'team' ? '上阵密探' : '战斗操作' }}</span></div><h1>{{ model.title }}</h1><p v-if="model.author">攻略作者 / {{ model.author }}</p></header>
    <div v-if="kind === 'team'" class="team-cards">
      <article v-for="(operator, index) in model.operators" :key="index" class="team-card" :class="{ 'is-empty': !operator.name }" :data-prof="operator.prof">
        <img class="team-card-frame" :src="decorationUrl('card-frame')" alt="" aria-hidden="true" />
        <header class="team-card-head">
          <div class="box-image-portrait" aria-hidden="true">
            <img v-if="portraits[operator.id]" :src="portraits[operator.id]" alt="" width="480" height="350" />
            <span v-else class="team-card-initial">{{ operator.name ? Array.from(operator.name)[0] : '空' }}</span>
          </div>
          <div class="team-card-identity">
            <span class="team-card-slot" :aria-label="`${index + 1} 号位`">{{ index + 1 }}</span>
            <span v-if="operator.job || profIcon(operator.prof)" class="box-image-prof-tab">
              <img v-if="profIcon(operator.prof)" :src="profIcon(operator.prof)" :alt="operator.prof + '属性'" />
              <span v-if="operator.job">{{ operator.job }}</span>
            </span>
          </div>
          <div class="box-image-name-tab">
            <h3 :class="nameClass(operator.name)">{{ operator.name || '未指定' }}</h3>
          </div>
        </header>
        <div class="team-card-details">
          <div class="team-card-basics">
          <div class="team-card-huaji" :aria-label="operator.huaji || '化极未填写'">
            <template v-if="operator.huajiProgress">
              <span class="team-card-stars" role="img" :aria-label="operator.huajiProgress.stars + '星'"><img v-for="star in operator.huajiProgress.stars" :key="star" :src="decorationUrl('star')" width="18" height="18" alt="" /></span>
              <small v-if="operator.huajiProgress.awakened">已觉醒</small><small v-else-if="operator.huajiProgress.nodes != null">{{ operator.huajiProgress.nodes }} 节点</small><small v-else-if="operator.huajiProgress.status" class="is-muted">{{ operator.huajiProgress.status }}</small>
            </template>
            <span v-else class="team-card-huaji-text">{{ operator.huaji || '化极 —' }}</span>
          </div>
          <div class="team-card-growth">
            <div data-stat="level"><span>等级</span><strong>{{ operator.level || '—' }}</strong></div>
            <div data-stat="elite"><span>修为</span><strong>{{ operator.elite || '—' }}</strong></div>
          </div>
          <div class="team-card-combat">
            <div v-for="[key, label] in COMBAT" :key="key" class="team-card-stat" :data-stat="key"><span>{{ label }}</span><strong>{{ operator[key] || '—' }}<sup v-if="markEach && manualPanel(operator) && operator[key]">*</sup></strong></div>
          </div>
          </div>
          <section v-for="group in discGroups" :key="group.key" class="team-card-discs" :class="group.key">
            <h4>{{ group.label }}</h4>
            <div class="team-card-terms">
              <em v-for="term in operator.discTerms[group.key]" :key="term.name" class="box-image-term" :class="discClass[term.color]"><span>{{ term.label }}</span></em>
              <em v-if="!operator.discTerms[group.key].length" class="box-image-term is-none">{{ group.key === 'discs' ? '未填写' : '无' }}</em>
              <template v-else-if="group.key === 'discs'"><span v-for="slot in Math.max(0, 3 - operator.discTerms.discs.length)" :key="'empty-' + slot" class="team-card-term-placeholder" aria-hidden="true">—</span></template>
            </div>
          </section>
          <section v-if="showStars" class="team-card-starstones" aria-label="星石">
            <div v-for="[kind, label] in STAR_KINDS" :key="kind" class="team-card-star-row">
              <h4>{{ label }}</h4>
              <div class="team-card-terms">
                <template v-if="operator.starStones[kind].some(Boolean)"><template v-for="(stone, slot) in stoneSlots(operator.starStones[kind])" :key="slot"><em v-if="stone" class="team-card-stone"><span>{{ stone.name }}</span><small v-if="stone.label.length > stone.name.length">{{ stone.label.slice(stone.name.length) }}</small></em><span v-else class="team-card-term-placeholder" aria-hidden="true">—</span></template></template>
                <em v-else class="team-card-stone is-none">未填写</em>
              </div>
            </div>
            <p v-if="operator.starStones.other.length">{{ operator.starStones.other.join('\n') }}</p>
          </section>
        </div>
      </article>
    </div>
    <template v-else>
      <div class="sheet-action-key"><strong>回合行动表</strong><p class="legend">A 普攻 · ↑ 大招 · ↓ 防御 · 圈 特殊技能</p></div>
      <div class="target-legend"><span v-for="(target, index) in model.targets" :key="index"><i :style="{ background: TARGET_COLORS[index] }"></i>{{ target }}</span></div>
      <table class="action-sheet">
        <colgroup><col style="width: 6%"><col v-for="slot in 5" :key="slot" style="width: 15%"><col style="width: 19%"></colgroup>
        <thead><tr><th>回合</th><th v-for="(operator, index) in model.operators" :key="index"><span class="slot">{{ index + 1 }} 号位</span><div class="sheet-action-portrait"><img v-if="portraits[operator.id]" :src="portraits[operator.id]" alt="" /></div><strong>{{ operator.name || '未指定' }}</strong></th><th>备注</th></tr></thead>
        <tbody><tr v-for="row in rows" :key="row.round">
          <th scope="row">{{ row.round }}</th>
          <td v-for="(entries, slot) in row.slots" :key="slot"><span v-if="!entries.length">—</span>
            <span v-for="entry in entries" :key="entry.order" class="action-mark" :style="{ background: TARGET_COLORS[entry.target] }">
              <b><sup>{{ entry.order }}</sup>{{ entry.symbol }}</b><small>{{ model.targets[entry.target] }}</small>
            </span>
          </td><td class="remark">{{ row.remark || '—' }}</td>
        </tr></tbody>
      </table>
      <p v-if="rows.length" class="range">第 {{ rows[0].round }}—{{ rows.at(-1).round }} 回合</p>
    </template>
    <div v-if="model.note" class="sheet-note"><strong>打法说明</strong><p>{{ model.note }}</p></div>
    <div class="sheet-spacer" aria-hidden="true"></div>
    <footer><strong>鸢鸢相抱 · YuanHub</strong><span>{{ kind === 'team' ? panelFootnote + '未填写的练度以 — 表示' : '数字为出手顺序 · 色块为攻击目标' }}</span></footer>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import portraits from '../../data/operatorPortraits.json'
import { TARGET_COLORS } from '../../utils/battleImages.js'
const props = defineProps({ model: { type: Object, required: true }, kind: { type: String, required: true }, rows: { type: Array, default: () => [] } })
const COMBAT = [['attack', '攻击'], ['hp', '生命']]
const DISC_GROUPS = [['discs', '携带命盘'], ['requiredDiscs', '必须命盘'], ['forbiddenDiscs', '禁用命盘']]
// 携带命盘始终占位；必须/禁用只要有一人填写就全队显示，保持五张卡分区对齐。
const discGroups = computed(() => DISC_GROUPS.filter(([key]) => key === 'discs' || props.model.operators.some(operator => operator[key])).map(([key, label]) => ({ key, label })))
const showStars = computed(() => props.model.operators.some(operator => operator.stars))
const STAR_KINDS = [['main', '主星'], ['support', '辅星']]
// 星石按三个槽位逐行显示，空槽留虚线位，五张卡的行保持对齐。
const stoneSlots = stones => Array.from({ length: Math.max(3, stones.length) }, (_, slot) => stones[slot] || null)
// 全员都有手动修正时逐个加星号没有区分度，改为底注统一说明。
const manualCount = computed(() => props.model.operators.filter(operator => operator.name && manualPanel(operator)).length)
const markEach = computed(() => manualCount.value > 0 && manualCount.value < props.model.operators.filter(operator => operator.name).length)
const panelFootnote = computed(() => !manualCount.value ? '' : markEach.value ? '* 面板含手动修正 · ' : '攻击与生命为手动修正值 · ')
const discClass = { 金: 'rarity-gold', 紫: 'rarity-purple', 蓝: 'rarity-blue' }
const decorationUrl = name => import.meta.env.BASE_URL + 'assets/operator-box/' + name + '.svg'
const profFiles = { 阳: 'yang', 阴: 'yin', 火: 'fire', 风: 'wind', 水: 'water', 地: 'earth', 混沌: 'chaos' }
const profIcon = prof => profFiles[prof] ? import.meta.env.BASE_URL + 'assets/prof-icons/' + profFiles[prof] + '.png' : ''
const nameClass = name => { const length = Array.from(name || '未指定').length; return { 'is-three-char-name': length === 3, 'is-long-name': length > 4 } }
const manualPanel = operator => operator.panelNote.includes('手动')
const sheet = ref(null)
defineExpose({ sheet })
</script>

<style scoped>
/* 固定出图画布，不受页面主题和设备宽度影响；导出只用纯 RGB 颜色，不用滤镜。
   宽 1080、最小高 1440，导出放大 4/3 后为小红书竖屏 3:4 的 1440×1920；内容过多时只向下延长。 */
.battle-sheet { position: relative; isolation: isolate; box-sizing: border-box; display: flex; flex-direction: column; width: 1080px; min-height: 1440px; padding: 40px; background: #fffdf6; color: #493b2c; font: 22px/1.5 var(--font-b, sans-serif); color-scheme: only light; }
.battle-sheet * { box-sizing: border-box; }
.battle-sheet.is-team { padding: 34px 28px 30px; background: #f8f3e8; }
.sheet-bamboo, .sheet-mountains { position: absolute; left: 0; width: 100%; pointer-events: none; z-index: 0; }
.sheet-bamboo { top: 0; height: 160px; } .sheet-mountains { bottom: 0; height: 100px; }
.battle-sheet > :not(.sheet-bamboo, .sheet-mountains) { position: relative; z-index: 1; }
.sheet-heading { border-top: 4px solid #5a4633; border-bottom: 1px solid #b9a58b; padding: 22px 0 26px; margin-bottom: 26px; }
.is-team .sheet-heading { border-top: 0; border-bottom-color: #c9ac79; padding: 0 4px 18px; margin-bottom: 18px; }
.sheet-category { display: flex; gap: 10px; font-size: 19px; letter-spacing: 2px; color: #725c43; }
.sheet-category i { font-style: normal; color: #b9a58b; }
h1 { margin: 14px 0 0; font: 900 38px/1.4 var(--font-s, serif); overflow-wrap: anywhere; }
.is-team h1 { margin-top: 6px; font-size: 40px; }
.sheet-heading p { margin: 12px 0 0; font-size: 19px; color: #725c43; overflow-wrap: anywhere; }

/* 配队卡：与密探养成分享图同一套卡框、属性与命盘配色。 */
.team-cards { flex: 1 0 auto; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
.team-card { --portrait-tone: #eee8de; position: relative; display: flex; flex-direction: column; min-width: 0; overflow: hidden; border: 1px solid #b58a45; border-radius: 8px; background: #fffaf0; }
.team-card[data-prof="风"] { --portrait-tone: #e5ede2; } .team-card[data-prof="水"] { --portrait-tone: #e2eaf0; }
.team-card[data-prof="火"] { --portrait-tone: #f1e4d9; } .team-card[data-prof="阴"] { --portrait-tone: #ebe4ef; }
.team-card[data-prof="阳"] { --portrait-tone: #f0e9d6; } .team-card[data-prof="地"] { --portrait-tone: #eae4d8; }
.team-card[data-prof="混沌"] { --portrait-tone: #e7e5ed; }
.team-card.is-empty { border-style: dashed; border-color: #cdb894; }
.team-card-frame { position: absolute; z-index: 3; inset: 2px; width: calc(100% - 4px); height: calc(100% - 4px); pointer-events: none; }
.team-card-head { position: relative; flex: none; height: 344px; }
.box-image-portrait { position: absolute; inset: 3px 3px auto; height: 360px; overflow: hidden; border-radius: 5px 5px 0 0; background: var(--portrait-tone); }
.box-image-portrait img { position: absolute; top: 0; left: 52%; display: block; width: auto; max-width: none; height: 360px; transform: translateX(-50%); }
.box-image-portrait::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255, 250, 240, 0) 74%, #fffaf0 96%); }
.team-card-initial { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 900 72px var(--font-s, serif); color: #cdb894; }
.team-card-identity { position: absolute; top: 10px; left: 9px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.team-card-slot { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1px solid #b58a45; border-radius: 50%; background: #5a4633; color: #fff3d1; font: 800 17px/1 var(--font-d, sans-serif); }
.box-image-prof-tab { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 5px 3px 9px; border: 1px solid #d5b773; border-radius: 14px; background: #fffaf0; font: 700 14px/1.15 var(--font-s, serif); color: #5a4633; }
.box-image-prof-tab img { width: 22px; height: 22px; }
.box-image-prof-tab > span { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 2px; }
.box-image-name-tab { position: absolute; top: 10px; right: 9px; padding: 10px 5px 12px; border: 1px solid #dac292; border-radius: 10px 0 10px 0; background: rgba(255, 250, 240, .94); }
.box-image-name-tab h3 { margin: 0; width: max-content; white-space: nowrap; writing-mode: vertical-rl; text-orientation: upright; font: 900 30px/1.1 var(--font-s, serif); letter-spacing: 2px; color: #493b2c; }
.box-image-name-tab h3.is-three-char-name { font-size: 27px; }
.box-image-name-tab h3.is-long-name { font-size: 21px; max-height: 200px; white-space: normal; overflow-wrap: anywhere; }
.is-empty .box-image-name-tab h3 { color: #a8957a; font-size: 22px; }
.team-card-details { position: relative; flex: 1; display: flex; flex-direction: column; gap: 18px; padding: 0 10px 24px; background: #fffaf0; }
.team-card-details::before { content: ''; position: absolute; top: -7px; left: 0; width: 100%; height: 9px; border-radius: 50% 50% 0 0; background: #fffaf0; }
.team-card-details > * { position: relative; }
.team-card-huaji { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 28px; padding-bottom: 8px; border-bottom: 1px solid #d8bd8c; white-space: nowrap; }
.team-card-stars { display: inline-flex; gap: 2px; } .team-card-stars img { display: block; width: 18px; height: 18px; }
.team-card-huaji small { font: 600 13px var(--font-b, sans-serif); color: #8a5a2b; }
.team-card-huaji small.is-muted { font-weight: 500; color: #8f7f6b; }
.team-card-huaji-text { font: 600 14px/1.3 var(--font-b, sans-serif); color: #695b4b; white-space: normal; text-align: center; overflow-wrap: anywhere; }
/* 等级/修为与攻击/生命合成一块浅底，四项基础数据一处读完。 */
.team-card-growth { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 10px; padding: 7px 0 6px; border-radius: 6px 6px 0 0; background: #f6efdf; }
.team-card-growth > div { display: flex; align-items: baseline; justify-content: center; gap: 6px; font: 500 14px/1.4 var(--font-b, sans-serif); color: #695b4b; }
.team-card-growth > div + div { border-left: 1px solid #e2d3b5; }
.team-card-growth strong { font: 800 19px/1.2 var(--font-d, sans-serif); color: #493b2c; }
.team-card-combat { display: grid; gap: 1px; padding: 6px 12px 7px; border-top: 1px solid #e8dcc2; border-radius: 0 0 6px 6px; background: #f6efdf; }
.team-card-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; font: 500 13px/1.3 var(--font-b, sans-serif); color: #725c43; }
.team-card-stat strong { min-width: 0; font: 800 19px/1.2 var(--font-d, sans-serif); color: #3e3023; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; text-align: right; }
.team-card-stat sup { font-size: 12px; color: #a0522d; vertical-align: top; margin-left: 1px; }
/* 命盘与星石：轻量列表，每区固定三行对齐五张卡；卡片剩余高度按行均分，不留整块空白。 */
.team-card-discs, .team-card-star-row { flex: 1 1 auto; display: flex; flex-direction: column; margin: 0; }
.team-card-starstones { flex: 2 1 auto; display: flex; flex-direction: column; gap: 18px; margin: 0; }
.team-card-discs h4, .team-card-star-row h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; padding-left: 8px; border-left: 3px solid #b58a45; font: 600 16px/1.3 var(--font-s, serif); color: #5a4633; letter-spacing: 1px; }
.team-card-discs h4::after, .team-card-star-row h4::after { content: ''; flex: 1; border-top: 1px solid #e4d2ad; }
.team-card-discs.requiredDiscs h4 { color: #315b32; border-left-color: #6f9a63; } .team-card-discs.forbiddenDiscs h4 { color: #963f35; border-left-color: #c0705f; }
.team-card-terms { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: minmax(50px, 1fr); min-height: 150px; }
.box-image-term, .team-card-stone, .team-card-term-placeholder { display: flex; align-items: center; justify-content: center; gap: 3px; min-width: 0; padding: 0 4px; border-bottom: 1px solid #efe4cf; font-style: normal; white-space: nowrap; overflow: hidden; }
.team-card-terms > :last-child { border-bottom: 0; }
.box-image-term { font: 700 21px/1.3 var(--font-b, sans-serif); color: #3e3023; }
.box-image-term > span { flex: none; display: inline-block; transform-origin: center; }
/* 命盘品质用词条前的小圆点区分，不再整格铺底色。 */
.box-image-term.rarity-gold::before, .box-image-term.rarity-purple::before, .box-image-term.rarity-blue::before { content: ''; flex: none; width: 8px; height: 8px; margin-right: 5px; border-radius: 50%; }
.box-image-term.rarity-gold::before { background: #d4a43c; } .box-image-term.rarity-purple::before { background: #9b74c4; } .box-image-term.rarity-blue::before { background: #5b8db3; }
.forbiddenDiscs .box-image-term:not(.is-none) > span { text-decoration: line-through; text-decoration-color: #963f35; }
.team-card-term-placeholder { font: 500 18px/1 var(--font-b, sans-serif); color: #d3c4a8; }
.box-image-term.is-none, .team-card-stone.is-none { grid-row: span 3; border-bottom: 0; font: 500 16px/1.3 var(--font-b, sans-serif); color: #b3a28a; letter-spacing: 2px; }
.team-card-stone > span { font: 700 21px/1.3 var(--font-b, sans-serif); color: #3e3023; }
.team-card-stone > small { font: 600 15px/1 var(--font-d, sans-serif); color: #8a5a2b; font-variant-numeric: tabular-nums; }
.team-card-starstones p { margin: -10px 0 0; font: 500 12px/1.55 var(--font-b, sans-serif); color: #5d4c3a; white-space: pre-wrap; overflow-wrap: anywhere; }

/* 操作表 */
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid #d5c7b2; padding: 14px 10px; text-align: center; overflow-wrap: anywhere; white-space: pre-wrap; }
thead { background: #f6efdf; color: #493b2c; } tbody th { background: #f6efdf; font-size: 19px; font-weight: normal; }
tbody td { background: #fffdf6; } tbody tr:nth-child(even) td { background: #faf6ec; }
.slot { display: block; font-size: 15px; font-weight: normal; color: #725c43; letter-spacing: 1px; }
.action-sheet thead strong { font-size: 24px; }
.sheet-action-key { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; margin-bottom: 14px; }
.sheet-action-key strong { font-size: 24px; } .legend, .range { font-size: 17px; color: #725c43; margin: 0; }
.target-legend { display: flex; gap: 20px; margin-bottom: 20px; }
.target-legend span { display: flex; align-items: center; gap: 8px; font-size: 17px; overflow-wrap: anywhere; max-width: 180px; }
.target-legend i { display: inline-block; width: 14px; height: 14px; border: 1px solid #b9a58b; flex-shrink: 0; }
.sheet-action-portrait { margin: 8px 0; } .sheet-action-portrait img { display: block; width: 100%; height: auto; }
.action-sheet td { vertical-align: top; } .action-sheet tbody th { font-size: 26px; font-weight: bold; }
.action-mark { display: inline-block; min-width: 70px; margin: 4px 0; padding: 5px 10px; color: #493b2c; border-radius: 3px; }
.action-mark b { font-size: 27px; } .action-mark sup { font-size: 17px; vertical-align: baseline; padding-right: 3px; }
.action-mark small { display: block; font-size: 14px; }
.remark { text-align: left; font-size: 19px; } .range { text-align: right; margin-top: 12px; }
.sheet-note { border-top: 1px solid #d5c7b2; margin-top: 26px; padding-top: 20px; }
.is-team .sheet-note { margin-top: 18px; padding: 16px 18px; border: 1px solid #d8c5a3; border-radius: 8px; background: #fffaf0; }
.sheet-note strong { font: 600 20px var(--font-s, serif); } .sheet-note p { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 19px; }
footer { border-top: 1px solid #b9a58b; margin-top: 28px; padding-top: 18px; display: flex; justify-content: space-between; gap: 20px; font-size: 16px; color: #725c43; }
.is-team footer { margin-top: 20px; padding-top: 12px; border-top-color: #d8c5a3; font-size: 14px; }
footer strong { font-weight: normal; }
.sheet-spacer { flex: 1 0 0; } .is-team .sheet-spacer { display: none; }
</style>
