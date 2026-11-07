<template>
  <section ref="sheet" class="battle-sheet" :class="'is-' + kind" data-theme="light">
    <img class="sheet-bamboo" :src="decorationUrl('bamboo')" alt="" aria-hidden="true" />
    <img class="sheet-mountains" :src="decorationUrl('mountains')" alt="" aria-hidden="true" />
    <header class="sheet-heading"><div class="sheet-category"><span>{{ model.game }}</span><i aria-hidden="true">·</i><span>{{ kind === 'team' ? '上阵密探' : '战斗操作' }}</span></div><h1>{{ model.title || (kind === 'team' ? '配队方案' : '战斗操作记录') }}</h1><p v-if="model.author">攻略作者 / {{ model.author }}</p></header>
    <div v-if="kind === 'team'" class="team-board" :style="{ '--rows': teamRows.length }">
      <article v-for="(operator, index) in model.operators" :key="'card-' + index" class="team-card" :class="{ 'is-empty': !operator.name }" :style="{ gridColumn: index + 2 }" :data-prof="operator.prof" :data-slot="index">
        <img class="team-card-frame" :src="decorationUrl('card-frame')" alt="" aria-hidden="true" />
      </article>
      <header v-for="(operator, index) in model.operators" :key="'head-' + index" class="team-card-head" :class="{ 'is-empty': !operator.name }" :style="{ gridColumn: index + 2 }" :data-prof="operator.prof" :data-slot="index">
        <div class="box-image-portrait" aria-hidden="true">
          <img v-if="portraits[operator.id]" :src="portraits[operator.id]" alt="" width="391" height="285" />
          <span v-else class="team-card-initial">{{ operator.name ? Array.from(operator.name)[0] : '空' }}</span>
        </div>
        <img v-if="profIcon(operator.prof)" class="team-card-prof" :src="profIcon(operator.prof)" :alt="operator.prof + '属性'" width="26" height="26" />
        <h3 class="team-card-name" :class="nameClass(operator.name)" :aria-label="operator.name || '未指定'"><span v-for="(char, i) in Array.from(operator.name || '未指定')" :key="i" aria-hidden="true">{{ char }}</span></h3>
      </header>
      <template v-for="(row, rowIndex) in teamRows" :key="row.key">
        <div class="team-board-label" :class="[row.key, { 'is-stack': row.stack }]" :style="{ gridRow: rowIndex + 2 }">{{ row.label }}</div>
        <div v-for="(operator, index) in model.operators" :key="row.key + index" class="team-card-cell" :class="[row.key, { 'is-stack': row.stack, 'is-alt': rowIndex % 2, 'is-last': rowIndex === teamRows.length - 1 }]" :style="{ gridColumn: index + 2, gridRow: rowIndex + 2 }" :data-slot="index" :data-stat="row.key">
          <strong v-if="row.type === 'stat'" class="team-card-value">{{ operator[row.key] }}<sup v-if="row.combat && markEach && manualPanel(operator) && operator[row.key]">*</sup></strong>
          <template v-else-if="row.type === 'huaji'">
            <template v-if="operator.huajiProgress">
              <span class="team-card-stars" role="img" :aria-label="operator.huajiProgress.stars + '星'"><img v-for="star in operator.huajiProgress.stars" :key="star" :src="decorationUrl('star')" width="22" height="22" alt="" /></span>
              <small v-if="operator.huajiProgress.awakened" class="team-card-awakened">觉醒</small>
              <small v-else-if="operator.huajiProgress.nodes != null">{{ operator.huajiProgress.nodes }} 节点</small>
            </template>
            <span v-else-if="operator.huaji" class="team-card-note">{{ operator.huaji }}</span>
          </template>
          <template v-else-if="row.type === 'disc'"><em v-for="term in operator.discTerms[row.key]" :key="term.name" class="box-image-term" :class="discClass[term.color]"><span>{{ term.label }}</span></em></template>
          <template v-else>
            <em v-for="(stone, slot) in operator.starStones[row.key].filter(Boolean)" :key="slot" class="team-card-stone"><span>{{ stone.name }}</span><small v-if="stone.label.length > stone.name.length">{{ stone.label.slice(stone.name.length) }}级</small></em>
            <span v-if="row.key === 'support' && operator.starStones.other.length" class="team-card-note">{{ operator.starStones.other.join('\n') }}</span>
          </template>
        </div>
      </template>
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
    <footer><strong>鸢鸢相抱 · YuanHub</strong><span>{{ kind === 'team' ? panelFootnote : '数字为出手顺序 · 色块为攻击目标' }}</span></footer>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import portraits from '../../data/operatorPortraits.json'
import { TARGET_COLORS } from '../../utils/battleImages.js'
const props = defineProps({ model: { type: Object, required: true }, kind: { type: String, required: true }, rows: { type: Array, default: () => [] } })
// 配队图：五张独立角色卡，数据按字段成行横向对齐；字段名只在左列写一次，未填写直接留白。
// 必须/禁用命盘只要有一人填写才出现；星石同理。多行内容（化极、命盘、星石）顶部对齐，五列首行齐平。
const teamRows = computed(() => {
  const operators = props.model.operators
  const rows = [['hp', '生命', 'stat'], ['attack', '攻击', 'stat'], ['level', '等级', 'stat'], ['elite', '修为', 'stat'], ['huaji', '化极', 'huaji'], ['discs', '命盘', 'disc']]
  if (operators.some(operator => operator.requiredDiscs)) rows.push(['requiredDiscs', '必须\n命盘', 'disc'])
  if (operators.some(operator => operator.forbiddenDiscs)) rows.push(['forbiddenDiscs', '禁用\n命盘', 'disc'])
  if (operators.some(operator => operator.stars)) rows.push(['main', '主星', 'stone'], ['support', '辅星', 'stone'])
  return rows.map(([key, label, type]) => ({ key, label, type, stack: type !== 'stat', combat: key === 'hp' || key === 'attack' }))
})
// 全员都有手动修正时逐个加星号没有区分度，改为底注统一说明。
const manualCount = computed(() => props.model.operators.filter(operator => operator.name && manualPanel(operator)).length)
const markEach = computed(() => manualCount.value > 0 && manualCount.value < props.model.operators.filter(operator => operator.name).length)
const panelFootnote = computed(() => !manualCount.value ? '' : markEach.value ? '* 面板含手动修正' : '攻击与生命为手动修正值')
const decorationUrl = name => import.meta.env.BASE_URL + 'assets/operator-box/' + name + '.svg'
const profFiles = { 阳: 'yang', 阴: 'yin', 火: 'fire', 风: 'wind', 水: 'water', 地: 'earth', 混沌: 'chaos' }
const profIcon = prof => profFiles[prof] ? import.meta.env.BASE_URL + 'assets/prof-icons/' + profFiles[prof] + '.png' : ''
const discClass = { 金: 'rarity-gold', 紫: 'rarity-purple', 蓝: 'rarity-blue' }
const nameClass = name => { const length = Array.from(name || '未指定').length; return { 'is-three-char-name': length === 3, 'is-long-name': length > 4 } }
const manualPanel = operator => operator.panelNote.includes('手动')
const sheet = ref(null)
// 数据区用思源宋体 500（不加粗）。全站字体链接只有 600/700/900，这一档只在出图组件挂载时按需加载，不改全站链接。
const BODY_FONT_URL = 'https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@500&display=swap'
onMounted(() => {
  const document = sheet.value?.ownerDocument
  if (!document || document.querySelector(`link[href="${BODY_FONT_URL}"]`)) return
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: BODY_FONT_URL }))
})
defineExpose({ sheet })
</script>

<style scoped>
/* 固定出图画布，不受页面主题和设备宽度影响；导出只用纯 RGB 颜色，不用滤镜。
   宽 1080、最小高 1440，导出放大 4/3 后为小红书竖屏 3:4 的 1440×1920；内容过多时只向下延长。 */
.battle-sheet { position: relative; isolation: isolate; box-sizing: border-box; display: flex; flex-direction: column; width: 1080px; min-height: 1440px; padding: 40px; background: #fffdf6; color: #493b2c; font: 22px/1.5 var(--font-b, sans-serif); color-scheme: only light; }
.battle-sheet * { box-sizing: border-box; }
/* 配队图用网格排版：最小高度下配队区吃掉剩余高度，3:4 画布不在底部留白。 */
.battle-sheet.is-team { display: grid; grid-template-rows: auto 1fr; padding: 34px 28px 30px; background: #f8f3e8; }
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

/* 配队图：上半是角色卡（立绘、竖排名、属性底色、描金框），下半数据行跨卡对齐；
   卡片底板跨满整列，数据格叠在其上，不画表格网格线，只用细金线和极淡的隔行底色分区。
   数据行用 auto 而非 fr：fr 在高度未定时会把每行撑到最高行，auto 只均分剩余高度。 */
.team-board { display: grid; grid-template-columns: 76px repeat(5, minmax(0, 1fr)); grid-template-rows: 344px repeat(var(--rows), auto); align-content: stretch; column-gap: 10px; }
.team-card { --portrait-tone: #eee8de; position: relative; grid-row: 1 / -1; min-width: 0; border: 1px solid #b58a45; border-radius: 8px; background: #fffaf0; }
.team-card-head { --portrait-tone: #eee8de; position: relative; grid-row: 1; min-width: 0; overflow: hidden; border-radius: 8px 8px 0 0; }
.team-card[data-prof="风"], .team-card-head[data-prof="风"] { --portrait-tone: #e5ede2; } .team-card[data-prof="水"], .team-card-head[data-prof="水"] { --portrait-tone: #e2eaf0; }
.team-card[data-prof="火"], .team-card-head[data-prof="火"] { --portrait-tone: #f1e4d9; } .team-card[data-prof="阴"], .team-card-head[data-prof="阴"] { --portrait-tone: #ebe4ef; }
.team-card[data-prof="阳"], .team-card-head[data-prof="阳"] { --portrait-tone: #f0e9d6; } .team-card[data-prof="地"], .team-card-head[data-prof="地"] { --portrait-tone: #eae4d8; }
.team-card[data-prof="混沌"], .team-card-head[data-prof="混沌"] { --portrait-tone: #e7e5ed; }
.team-card.is-empty { border-style: dashed; border-color: #cdb894; }
.team-card-frame { position: absolute; z-index: 3; inset: 2px; width: calc(100% - 4px); height: calc(100% - 4px); pointer-events: none; }
/* 数据格与字段名都要定位：html2canvas 按定位层绘制，未定位的格子会被卡片底板盖住。 */
.team-board > .team-card-head, .team-board > .team-card-cell, .team-board > .team-board-label { position: relative; z-index: 1; }
.box-image-portrait { position: absolute; inset: 3px 3px 0; overflow: hidden; border-radius: 5px 5px 0 0; background: var(--portrait-tone); }
/* 立绘中心右移到 61%：按 125 张立绘估算，这个裁切下右上角名字区明显偏暗的只有 9 张；回正到 52% 时文丑等人的深色饰物会落到名字后面。 */
.box-image-portrait img { position: absolute; top: 0; left: 61%; display: block; width: auto; max-width: none; height: 100%; transform: translateX(-50%); }
.box-image-portrait::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255, 250, 240, 0) 76%, #fffaf0 98%); }
.team-card-initial { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 900 72px var(--font-s, serif); color: #cdb894; }
/* 卡头只留属性图标和竖排名：号位由列序表达，职业不上图，免得左右两侧都压着立绘。图标自带圆底，不另加框。 */
.team-card-prof { position: absolute; top: 12px; left: 11px; display: block; width: 26px; height: 26px; }
/* 名字直接写在立绘上，不加底色和框；纸色柔光兜住少数右上角偏暗的立绘（html2canvas 导出时柔光半径不随 4/3 放大，比预览略紧）。
   逐字竖排而不用 writing-mode：html2canvas 画不出竖排流。 */
.team-card-name { position: absolute; top: 18px; right: 15px; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 1em; margin: 0; font: 600 26px/1 var(--font-s, serif); color: #3e3023; text-shadow: 0 0 2px #fffaf0, 0 0 5px #fffaf0, 0 0 10px rgba(255, 250, 240, .85); }
.team-card-name > span { display: block; width: 1em; height: 1em; text-align: center; white-space: nowrap; }
.team-card-name.is-three-char-name { font-size: 24px; }
.team-card-name.is-long-name { font-size: 20px; }
.team-card-head.is-empty .team-card-name { color: #a8957a; font-size: 22px; }
/* 数据区全部用字段名的思源宋体 500，不加粗，层级靠字号与颜色。
   多行的行（化极、命盘、星石）顶部对齐：首行行高统一 30px，字段名与五列首行齐平。 */
.team-board-label { grid-column: 1; display: flex; align-items: center; justify-content: center; min-height: 72px; padding: 0 4px; border-top: 1px solid #e0cba2; font: 500 24px/30px var(--font-s, serif); letter-spacing: 2px; color: #5a4633; text-align: center; white-space: pre-line; }
.team-board-label.is-stack { align-items: flex-start; padding-top: 12px; }
.team-board-label.requiredDiscs, .team-board-label.forbiddenDiscs { padding-top: 14px; font-size: 20px; line-height: 26px; letter-spacing: 1px; }
.team-board-label.requiredDiscs { color: #315b32; } .team-board-label.forbiddenDiscs { color: #963f35; }
.team-card-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 0; min-height: 72px; margin: 0 4px; padding: 8px 4px; border-top: 1px solid #ead9b6; font-family: var(--font-s, serif); text-align: center; }
.team-card-cell.is-stack { justify-content: flex-start; padding: 12px 4px 14px; }
.team-card-cell.is-alt { background: #f8efdc; }
.team-card-cell.is-last { margin-bottom: 18px; }
.team-card-value { font: 500 32px/1.1 var(--font-s, serif); color: #3e3023; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.team-card-value sup { font-size: 16px; color: #a0522d; margin-left: 2px; }
/* 化极固定两行：第一行星星，第二行觉醒或节点；两种文字同字号同行高，五列逐行齐平。 */
.team-card-stars { display: inline-flex; align-items: center; gap: 2px; height: 30px; } .team-card-stars img { display: block; width: 22px; height: 22px; }
.team-card-cell.huaji small { font: 500 19px/26px var(--font-s, serif); letter-spacing: 1px; color: #8a5a2b; }
.team-card-cell.huaji .team-card-awakened { letter-spacing: 3px; color: #8f5f12; }
/* 星石等级与名称同字号、同基线，隔约 1/4 字宽并带“级”（七杀 8级），只用字色区分；缩小后紧贴名称会被读成角标。
   手填长名放不下时等级整体折到下一行，不被裁掉。 */
.team-card-stone { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 0 6px; width: 100%; min-width: 0; font: 500 22px/30px var(--font-s, serif); font-style: normal; color: #3e3023; white-space: nowrap; overflow: hidden; }
.team-card-stone > small { font: inherit; color: #8a5a2b; font-variant-numeric: tabular-nums; }
.box-image-term > span { flex: none; display: inline-block; transform-origin: center; }
/* 命盘词条不加底色和描边，只用字色区分金/紫/蓝品质（在两种行底色上都不低于 4.5:1）；图鉴外词条用正文色。 */
.team-card-cell .box-image-term { display: flex; justify-content: center; max-width: 100%; min-width: 0; font: 500 22px/30px var(--font-s, serif); font-style: normal; color: #3e3023; white-space: nowrap; overflow: hidden; }
.team-card-cell .box-image-term.rarity-gold { color: #8f5f12; }
.team-card-cell .box-image-term.rarity-purple { color: #71479b; }
.team-card-cell .box-image-term.rarity-blue { color: #2b6191; }
/* 禁用删除线用伪元素绘制：html2canvas 导出不会画出 text-decoration。 */
.forbiddenDiscs .box-image-term > span { position: relative; }
.forbiddenDiscs .box-image-term > span::after { content: ''; position: absolute; left: -3px; right: -3px; top: 54%; border-top: 2px solid #b0483b; }
.team-card-note { font: 500 17px/1.5 var(--font-s, serif); color: #5d4c3a; white-space: pre-wrap; overflow-wrap: anywhere; }

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
.is-team footer { margin-top: 20px; padding-top: 12px; border-top-color: #d8c5a3; font-size: 14px; color: #5d4a36; }
footer strong { font-weight: normal; }
.sheet-spacer { flex: 1 0 0; } .is-team .sheet-spacer { display: none; }
</style>
