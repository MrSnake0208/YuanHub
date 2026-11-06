<template>
  <section ref="sheet" class="battle-sheet" data-theme="light">
    <header class="sheet-heading"><div class="sheet-category"><span>{{ model.game }}</span><span>{{ kind === 'team' ? '上阵密探' : '战斗操作' }}</span></div><h1>{{ model.title }}</h1><p v-if="model.author">攻略作者 / {{ model.author }}</p></header>
    <table v-if="kind === 'team'" class="team-sheet">
      <thead><tr><th class="sheet-row-heading">配队<br><small>五人阵容</small></th><th v-for="(operator, index) in model.operators" :key="index">
        <span class="slot">{{ index + 1 }} 号位</span>
        <div class="sheet-portrait"><img v-if="portraits[operator.id]" :src="portraits[operator.id]" alt="" /><span v-else>{{ operator.name ? operator.name.slice(0, 1) : '待选' }}</span></div>
        <strong>{{ operator.name || '未指定' }}</strong>
      </th></tr></thead>
      <tbody><tr v-for="[key, label] in [...BATTLE_STATS, ...noteFields]" :key="key" :class="key">
        <th scope="row">{{ label }}</th><td v-for="(operator, index) in model.operators" :key="index">{{ operator[key] || '—' }}</td>
      </tr><tr v-if="model.operators.some(operator => operator.panelNote)"><th scope="row">面板来源</th><td v-for="(operator, index) in model.operators" :key="index">{{ operator.panelNote || '手动填写' }}</td></tr></tbody>
    </table>
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
    <footer><strong>鸢鸢相抱 · YuanHub</strong><span>{{ kind === 'team' ? '未填写的练度以 — 表示' : '数字为出手顺序 · 色块为攻击目标' }}</span></footer>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import portraits from '../../data/operatorPortraits.json'
import { BATTLE_STATS, BATTLE_NOTES, TARGET_COLORS } from '../../utils/battleImages.js'
const props = defineProps({ model: { type: Object, required: true }, kind: { type: String, required: true }, rows: { type: Array, default: () => [] } })
const noteFields = computed(() => BATTLE_NOTES.filter(([key]) => key === 'discs' || props.model.operators.some(operator => operator[key])))
const sheet = ref(null)
defineExpose({ sheet })
</script>

<style scoped>
/* 固定出图画布，不受页面主题和设备宽度影响。 */
.battle-sheet { box-sizing: border-box; width: 1080px; padding: 40px; background: #fffdf6; color: #493b2c; font: 22px/1.5 Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; color-scheme: only light; }
.battle-sheet * { box-sizing: border-box; }
.sheet-heading { border-top: 4px solid #5a4633; border-bottom: 1px solid #b9a58b; padding: 22px 0 26px; margin-bottom: 26px; }
.sheet-category { display: flex; justify-content: space-between; gap: 24px; font-size: 19px; letter-spacing: 2px; color: #725c43; }
h1 { margin: 14px 0 0; font: bold 38px/1.4 'Songti SC', 'SimSun', serif; overflow-wrap: anywhere; }
.sheet-heading p { margin: 12px 0 0; font-size: 19px; color: #725c43; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 1px solid #d5c7b2; padding: 14px 10px; text-align: center; overflow-wrap: anywhere; white-space: pre-wrap; }
thead { background: #f6efdf; color: #493b2c; } tbody th { background: #f6efdf; font-size: 19px; font-weight: normal; }
tbody tr:nth-child(even) td { background: #faf6ec; }
.team-sheet th:first-child { width: 12%; } .team-sheet thead th:not(:first-child) { padding: 12px 8px 18px; }
.sheet-portrait { min-height: 122px; display: flex; align-items: center; justify-content: center; margin: 6px 0 12px; color: #b9a58b; font-size: 36px; }
.sheet-portrait img { display: block; width: 100%; height: auto; }
.sheet-row-heading small { display: block; font-size: 15px; margin-top: 8px; font-weight: normal; }
.slot { display: block; font-size: 15px; font-weight: normal; color: #725c43; letter-spacing: 1px; }
.team-sheet strong, .action-sheet thead strong { font-size: 24px; }
.hp td, .attack td { font-size: 27px; font-weight: bold; }
.discs th, .discs td { border-top: 2px solid #b9a58b; }
.requiredDiscs td { color: #315b32; font-weight: bold; } .forbiddenDiscs td { color: #963f35; font-weight: bold; }
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
.sheet-note strong { font-size: 20px; } .sheet-note p { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 20px; }
footer { border-top: 1px solid #b9a58b; margin-top: 28px; padding-top: 18px; display: flex; justify-content: space-between; gap: 20px; font-size: 16px; color: #725c43; }
footer strong { font-weight: normal; }
</style>
