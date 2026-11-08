<template>
  <section ref="sheet" class="battle-sheet" :class="'is-' + kind" data-theme="light">
    <img class="sheet-bamboo" :src="decorationUrl('bamboo')" alt="" aria-hidden="true" />
    <img class="sheet-mountains" :src="decorationUrl('mountains')" alt="" aria-hidden="true" />
    <header class="sheet-heading"><img class="sheet-logo" :src="brandLogoUrl" alt="YuanHub" width="64" height="64" /><div class="sheet-category"><span>{{ model.game }}</span><i aria-hidden="true">·</i><span>{{ kind === 'team' ? '上阵密探' : '战斗操作' }}</span></div><h1>{{ model.title || (kind === 'team' ? '配队方案' : '战斗操作记录') }}</h1><p v-if="model.author">攻略作者 / {{ model.author }}</p><div v-if="kind === 'actions' && (usedActions.length || multiTarget)" class="sheet-action-key"><span v-for="item in usedActions" :key="item.type"><i class="action-symbol" :class="ARROW_CLASS[item.symbol]" aria-hidden="true"><template v-if="ARROW_CLASS[item.symbol]"><span class="arrow-shaft"></span><span class="arrow-head"></span></template><template v-else>{{ item.symbol }}</template></i>{{ item.label }}</span><template v-if="multiTarget"><i class="sheet-action-sep" v-if="usedActions.length" aria-hidden="true"></i><span v-for="index in usedTargets" :key="'t' + index"><em :class="{ 'is-plain': index === mainTarget }" :style="index === mainTarget ? null : { background: TARGET_COLORS[index], borderLeftColor: TARGET_ACCENTS[index] }"></em>{{ model.targets[index] }}</span></template></div></header>
    <div class="team-board" :class="{ 'action-board': kind === 'actions', 'is-simple': simple }" :style="boardStyle">
      <div v-if="kind === 'actions'" class="team-board-label action-corner">回合</div>
      <article v-for="(operator, index) in model.operators" :key="'card-' + index" class="team-card" :class="{ 'is-empty': !operator.name, 'is-idle': idleSlots[index] }" :style="{ gridColumn: index + 2 }" :data-prof="operator.prof" :data-slot="index">
        <img class="team-card-frame" :src="decorationUrl('card-frame')" alt="" aria-hidden="true" />
      </article>
      <header v-for="(operator, index) in model.operators" :key="'head-' + index" class="team-card-head" :class="{ 'is-empty': !operator.name, 'is-idle': idleSlots[index] }" :style="{ gridColumn: index + 2 }" :data-prof="operator.prof" :data-slot="index">
        <div v-if="!simple" class="box-image-portrait" aria-hidden="true">
          <img v-if="portraits[operator.id]" :src="portraits[operator.id]" alt="" width="391" height="285" />
          <span v-else class="team-card-initial">{{ operator.name ? Array.from(operator.name)[0] : '空' }}</span>
        </div>
        <img v-if="kind === 'team' && profIcon(operator.prof)" class="team-card-prof" :src="profIcon(operator.prof)" :alt="operator.prof + '属性'" width="26" height="26" />
        <h3 v-if="simple" class="action-card-name">{{ operator.name || '未指定' }}</h3>
        <h3 v-else class="team-card-name" :class="nameClass(operator.name)" :aria-label="operator.name || '未指定'"><span v-for="(char, i) in Array.from(operator.name || '未指定')" :key="i" aria-hidden="true">{{ char }}</span></h3>
      </header>
      <template v-if="kind === 'team'"><template v-for="(row, rowIndex) in teamRows" :key="row.key">
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
            <span v-if="operator.starStones[row.key].some(Boolean)" class="team-card-stones"><template v-for="(stone, slot) in operator.starStones[row.key].filter(Boolean)" :key="slot"><em class="team-card-stone">{{ stone.name }}</em><small>{{ stone.label.length > stone.name.length ? stone.label.slice(stone.name.length) + '级' : '' }}</small></template></span>
            <span v-if="row.key === 'support' && operator.starStones.other.length" class="team-card-note">{{ operator.starStones.other.join('\n') }}</span>
          </template>
        </div>
      </template></template>
      <template v-else><template v-for="(item, rowIndex) in actionRows" :key="item.key">
        <div v-if="item.type === 'round'" class="action-band" :class="{ 'is-alt': item.alt }" :style="{ gridRow: `${rowIndex + 2} / span ${item.remark ? 2 : 1}` }" aria-hidden="true"></div>
        <div v-if="item.type === 'round'" class="team-board-label action-round-label" :class="{ 'is-alt': item.alt }" :style="{ gridRow: rowIndex + 2 }"><strong>{{ item.row.round }}</strong></div>
        <template v-if="item.type === 'round'">
          <div v-for="(entries, slot) in item.row.slots" :key="slot" class="team-card-cell action-cell" :class="{ 'is-alt': item.alt, 'is-last': item.last }" :style="{ gridColumn: slot + 2, gridRow: rowIndex + 2 }">
            <span v-for="entry in entries" :key="entry.order" class="action-chip" :class="{ 'is-plain': plainEntry(entry) }" :style="plainEntry(entry) ? null : { background: TARGET_COLORS[entry.target], borderLeftColor: TARGET_ACCENTS[entry.target] }"><b>{{ entry.order }}</b><i class="action-symbol" :class="ARROW_CLASS[entry.symbol]"><template v-if="ARROW_CLASS[entry.symbol]"><span class="arrow-shaft"></span><span class="arrow-head"></span></template><template v-else>{{ entry.symbol }}</template></i></span>
          </div>
        </template>
        <p v-else class="action-remark" :class="{ 'is-alt': item.alt, 'is-last': item.last }" :style="{ gridRow: rowIndex + 2 }"><span>备注</span>{{ item.row.remark }}</p>
      </template></template>
    </div>
    <p v-if="kind === 'actions' && partial && rows.length" class="range">第 {{ rows[0].round }}—{{ rows.at(-1).round }} 回合</p>
    <div v-if="model.note" class="sheet-note"><strong>打法说明</strong><p>{{ model.note }}</p></div>
    <div class="sheet-spacer" aria-hidden="true"></div>
    <footer><strong>鸢鸢相抱 · YuanHub</strong><span v-if="kind === 'team' && panelFootnote">{{ panelFootnote }}</span></footer>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import portraits from '../../data/operatorPortraits.json'
import { BATTLE_ACTIONS, BATTLE_INTERACTION, TARGET_ACCENTS, TARGET_COLORS, battleTargetUsage } from '../../utils/battleImages.js'
const props = defineProps({ model: { type: Object, required: true }, kind: { type: String, required: true }, rows: { type: Array, default: () => [] }, variant: { type: String, default: 'full' }, partial: { type: Boolean, default: false } })
// 操作图两种样式：完整款卡头与配队图一致（立绘 + 竖排名），简化款只放横排名字。配队图不受影响。
// 属性图标只在配队图显示；操作图两种样式都不画。
const simple = computed(() => props.kind === 'actions' && props.variant === 'simple')
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
// 操作图：每回合一行动作，填写了备注的回合在下方加一条横跨五列的备注；隔行底色按回合交替。
// 每回合（含其备注）垫一条贯穿回合号与五列的横带，按回合横向阅读不错行；角色卡只包住立绘卡头，不再有贯穿全表的竖框。
const actionRows = computed(() => {
  const items = props.rows.flatMap((row, index) => {
    const alt = index % 2 === 1, remark = String(row.remark || '').trim()
    return [{ key: 'r' + row.round, type: 'round', row, alt, remark: Boolean(remark) }, ...(remark ? [{ key: 'n' + row.round, type: 'remark', row: { ...row, remark }, alt }] : [])]
  })
  if (items.length) items.at(-1).last = true
  return items
})
// 操作图里本段全程无动作的密探收窄列宽、立绘淡化，把宽度让给有动作的列；全员无动作时保持等宽。
const idleSlots = computed(() => props.model.operators.map((_, slot) => props.kind === 'actions' && props.rows.length > 0 && props.rows.every(row => !row.slots[slot]?.length)))
const boardStyle = computed(() => {
  const style = { '--rows': props.kind === 'team' ? teamRows.value.length : actionRows.value.length }
  if (props.kind === 'actions' && idleSlots.value.some(Boolean) && !idleSlots.value.every(Boolean)) {
    style.gridTemplateColumns = '76px ' + idleSlots.value.map(idle => `minmax(0, ${idle ? '.62fr' : '1fr'})`).join(' ')
  }
  return style
})
// 图例只列本张图实际出现的动作与目标；全程只打一个目标时目标图例和目标色都不出现，动作块用中性底。
const usedEntries = computed(() => props.kind === 'actions' ? props.rows.flatMap(row => row.slots.flat()) : [])
// 箱（关卡互动）挂在紧邻密探格内，无目标，用中性底；用到时图例补一项。
const usedActions = computed(() => [...BATTLE_ACTIONS.filter(item => usedEntries.value.some(entry => !entry.box && entry.symbol === item.symbol)), ...(usedEntries.value.some(entry => entry.box) ? [BATTLE_INTERACTION] : [])])
// 多目标时只给“例外”上色：打得最多的主目标用中性底（并列取序号小的），其余目标才带目标色，避免满表同一种颜色。
// 图例里主目标的色块同样是中性底，与动作块一致。
const targetUsage = computed(() => battleTargetUsage(props.kind === 'actions' ? props.rows : []))
const usedTargets = computed(() => targetUsage.value.used)
const multiTarget = computed(() => targetUsage.value.multi)
const mainTarget = computed(() => targetUsage.value.main)
const plainEntry = entry => !multiTarget.value || entry.box || entry.target == null || entry.target === mainTarget.value
// 箭头不用字形：系统备用字体画出的箭头粗细和位置不可控，改用两个定位块绘制（不用伪元素，html2canvas 处理更稳）。
const ARROW_CLASS = { '↑': 'is-up', '↓': 'is-down' }
// 全员都有手动修正时逐个加星号没有区分度，改为底注统一说明。
const manualCount = computed(() => props.model.operators.filter(operator => operator.name && manualPanel(operator)).length)
const markEach = computed(() => manualCount.value > 0 && manualCount.value < props.model.operators.filter(operator => operator.name).length)
const panelFootnote = computed(() => !manualCount.value ? '' : markEach.value ? '* 面板含手动修正' : '攻击与生命为手动修正值')
const decorationUrl = name => import.meta.env.BASE_URL + 'assets/operator-box/' + name + '.svg'
const brandLogoUrl = import.meta.env.BASE_URL + 'brand/yuanhub-logo.png'
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
   宽 1080，导出放大 4/3 后宽 1440。配队图最小高 1440（3:4 的 1440×1920），内容过多时向下延长；
   操作图不设最小高度，按回合数自适应，避免回合少时下方大片留白。 */
.battle-sheet { position: relative; isolation: isolate; box-sizing: border-box; display: flex; flex-direction: column; width: 1080px; min-height: 1440px; padding: 40px; background: #fffdf6; color: #493b2c; font: 22px/1.5 var(--font-b, sans-serif); color-scheme: only light; }
.battle-sheet * { box-sizing: border-box; }
/* 配队图用网格排版：最小高度下配队区吃掉剩余高度，3:4 画布不在底部留白。 */
.battle-sheet.is-team, .battle-sheet.is-actions { padding: 34px 28px 30px; background: #f8f3e8; }
.battle-sheet.is-actions { min-height: 0; }
.battle-sheet.is-team { display: grid; grid-template-rows: auto 1fr; }
.sheet-bamboo, .sheet-mountains { position: absolute; left: 0; width: 100%; pointer-events: none; z-index: 0; }
.sheet-bamboo { top: 0; height: 160px; } .sheet-mountains { bottom: 0; height: 100px; }
.battle-sheet > :not(.sheet-bamboo, .sheet-mountains) { position: relative; z-index: 1; }
.sheet-heading { border-top: 4px solid #5a4633; border-bottom: 1px solid #b9a58b; padding: 22px 0 26px; margin-bottom: 26px; }
/* 标题区下沿用文武线（上粗下细双实线），沿用原分隔色，只强化“标题/正文”分界，不加新色相。 */
:is(.is-team, .is-actions) .sheet-heading { border-top: 0; border-bottom: 2px solid #c9ac79; padding: 0 4px 18px; margin-bottom: 22px; }
:is(.is-team, .is-actions) .sheet-heading::after { content: ''; position: absolute; left: 0; right: 0; bottom: -6px; border-top: 1px solid #c9ac79; }
.sheet-category { display: flex; gap: 10px; font-size: 19px; letter-spacing: 2px; color: #725c43; }
.sheet-category i { font-style: normal; color: #b9a58b; }
h1 { margin: 14px 0 0; font: 900 38px/1.4 var(--font-s, serif); overflow-wrap: anywhere; }
:is(.is-team, .is-actions) h1 { margin-top: 6px; font-size: 40px; }
.sheet-heading p { margin: 12px 0 0; font-size: 19px; color: #725c43; overflow-wrap: anywhere; }
/* 右上角站点 logo（配队图、操作图共用）：压在竹叶装饰上方；分类行和标题右侧让出 logo 宽度，长标题换行而不被遮住。 */
.sheet-logo { position: absolute; top: 0; right: 4px; display: block; width: 64px; height: 64px; }
:is(.is-team, .is-actions) :is(.sheet-category, h1) { padding-right: 84px; }

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
   名称与等级分两列：名称左对齐、等级右对齐，整块在格内居中，等级位数不同（8级 / 10级）或缺等级时各行仍对齐。 */
.team-card-stones { display: grid; grid-template-columns: minmax(0, max-content) max-content; justify-content: center; align-items: baseline; column-gap: 6px; width: 100%; min-width: 0; font: 500 22px/30px var(--font-s, serif); color: #3e3023; }
.team-card-stone { min-width: 0; font: inherit; font-style: normal; text-align: left; overflow-wrap: anywhere; }
.team-card-stones > small { font: inherit; color: #8a5a2b; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
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

/* 操作图：沿用配队图的角色卡与跨卡对齐，左列写回合；完整款卡头与配队图同高，简化款只留名字条。
   动作只写序号与符号，目标只用底色表达（图例在标题下方），没有动作的格子留白。 */
/* 操作图的信息在动作上：立绘压到 240px 只露半身，回合行和动作块相应加大。 */
.action-board { grid-template-rows: 240px repeat(var(--rows), auto); align-content: start; }
.team-card-head.is-idle .box-image-portrait img { opacity: .5; }
.team-card-head.is-idle .team-card-name { color: #8a7660; }
.action-board.is-simple { grid-template-rows: 76px repeat(var(--rows), auto); }
.is-simple .team-card-head { display: flex; align-items: center; justify-content: center; padding: 0 12px; background: var(--portrait-tone); border-bottom: 1px solid #e0cba2; }
.action-card-name { margin: 0; min-width: 0; font: 600 28px/1.2 var(--font-s, serif); letter-spacing: 2px; color: #3e3023; text-align: center; overflow-wrap: anywhere; }
.is-simple .team-card-head.is-empty .action-card-name { color: #a8957a; font-size: 22px; }
.sheet-action-key { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 14px; font-size: 17px; color: #5d4a36; }
.sheet-action-key > span { display: inline-flex; align-items: center; gap: 6px; }
/* 图例符号与动作块同一画法（Archivo 700、绘制箭头），对照时读作同一个符号。 */
.sheet-action-key .action-symbol { color: #3e3023; }
.sheet-action-key > .sheet-action-sep { width: 1px; height: 18px; background: #c9ac79; }
.sheet-action-key em { display: inline-block; width: 18px; height: 18px; border: 1px solid #c9ac79; border-left-width: 4px; border-radius: 4px; }
.sheet-action-key em.is-plain { border-left-width: 1px; background: transparent; }
/* “回合”只在左上角写一次（同配队图字段名只写一次），每行只留回合数字。 */
.action-corner { grid-row: 1; align-items: flex-end; padding-bottom: 14px; border-top: 0; font-size: 18px; color: #725c43; }
.action-round-label { flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 0; border-top: 0; letter-spacing: 0; }
/* 回合横带：卡片只占卡头一行，回合区没有竖向边框；行间留缝、横带跨过列缝连成整条，回合之间的分隔强于列之间。
   横带不描边，单行直接露纸色、双行加深底色：原先白条/极淡隔行色/纸色三种米色太接近，跟读某回合时容易抄错行。 */
.action-board { row-gap: 8px; }
.action-board .team-card { grid-row: 1; }
.action-band { position: relative; z-index: 0; grid-column: 1 / -1; border-radius: 8px; background: transparent; }
.action-band.is-alt { background: #f0e3c5; }
.action-board .team-card-cell.action-cell { border-top: 0; background: transparent; }
.action-board .team-card-cell.is-last, .action-remark.is-last { margin-bottom: 0; }
.action-round-label strong { font: 600 32px/1.1 var(--font-s, serif); color: #3e3023; }
/* 动作块在格内水平、垂直居中换行：多数格只有一个动作，靠左会让每列右半空着。 */
.team-card-cell.action-cell { flex-direction: row; flex-wrap: wrap; align-content: center; justify-content: center; gap: 8px; min-height: 72px; padding: 12px 4px; }
/* 动作块按内容收紧（原定宽 70px 两侧留白过多），min-width 让常见的一位序号动作（1A / 3↑ / 6箱）仍等宽；序号与符号同为 28px 高，紧挨着读作一个词。
   描边用标题分隔线同款暖金 #c9ac79（原 #dcc395 与隔行横带 #f0e3c5 太接近、块形消失；半透明墨色在纸色上发灰）。主目标/单目标/箱只描边不加底色（空心）；
   其他目标填目标色并加左侧色条（实心），空心对实心一眼区分，不引入新色相。 */
.action-chip { display: inline-flex; align-items: center; justify-content: center; gap: 2px; min-width: 52px; height: 40px; padding: 0 8px; border: 1px solid #c9ac79; border-left-width: 4px; border-radius: 6px; color: #3e3023; }
/* 序号不加底色，直接写在符号前（如“5A”）；字重用导出预加载的 Archivo 700（满表 800 显得压），避免回退字体错位。 */
.action-chip.is-plain { border-left-width: 1px; background: transparent; }
.action-chip b { display: block; flex-shrink: 0; height: 28px; color: #3e3023; font: 700 24px/28px var(--font-d, sans-serif); }
/* 符号与序号同用 Archivo 700（“圈”回退到无衬线），避免“1A”一半无衬线一半宋体的拼凑感。
   符号框按字宽收紧，不再固定 24px 居中，序号与符号读作一个词而不是“4 A”。 */
.action-symbol { position: relative; display: block; flex-shrink: 0; min-width: 14px; height: 28px; font: 700 22px/28px var(--font-d, sans-serif); font-style: normal; text-align: center; }
.action-symbol.is-up, .action-symbol.is-down { width: 14px; }
/* 箭头线宽 3px 与数字笔画接近，头部 12px 宽，避免比数字更抢眼；在 14px 框内居中。 */
.arrow-shaft { position: absolute; left: 5.5px; width: 3px; height: 16px; border-radius: 1px; background: #3e3023; }
.arrow-head { position: absolute; left: 1px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; }
.is-up .arrow-shaft { top: 9px; } .is-up .arrow-head { top: 3px; border-bottom: 8px solid #3e3023; }
.is-down .arrow-shaft { top: 3px; } .is-down .arrow-head { top: 17px; border-top: 8px solid #3e3023; }
.action-remark { position: relative; z-index: 1; grid-column: 2 / -1; display: flex; gap: 12px; margin: 0 4px; padding: 10px 14px; border-top: 1px dashed #e0cba2; background: transparent; font: 500 19px/1.5 var(--font-s, serif); color: #3e3023; white-space: pre-wrap; overflow-wrap: anywhere; }
.action-remark.is-last { margin-bottom: 18px; }
.action-remark span { flex-shrink: 0; font-size: 16px; letter-spacing: 2px; color: #8a5a2b; }
.legend, .range { font-size: 17px; color: #725c43; margin: 0; }
.range { text-align: right; margin-top: 12px; }
.sheet-note { border-top: 1px solid #d5c7b2; margin-top: 26px; padding-top: 20px; }
:is(.is-team, .is-actions) .sheet-note { margin-top: 18px; padding: 16px 18px; border: 1px solid #d8c5a3; border-radius: 8px; background: #fffaf0; }
.sheet-note strong { font: 600 20px var(--font-s, serif); } .sheet-note p { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 19px; }
footer { border-top: 1px solid #b9a58b; margin-top: 28px; padding-top: 18px; display: flex; justify-content: space-between; gap: 20px; font-size: 16px; color: #725c43; }
:is(.is-team, .is-actions) footer { margin-top: 20px; padding-top: 12px; border-top-color: #d8c5a3; font-size: 14px; color: #5d4a36; }
/* 操作图不再撑满画布：给底部远山装饰留出位置，避免压住打法说明。 */
.is-actions footer { margin-top: 40px; }
footer strong { font-weight: normal; }
.sheet-spacer { flex: 1 0 0; } .is-team .sheet-spacer { display: none; }
</style>
