<template>
  <!-- 先填决定面板的等级、修为、化极，再核对由它们得出的生命与攻击；核对提示紧随其后。 -->
  <div class="battle-stat-fields">
    <!-- 等级与修为：下拉可直接选（手机为滚轮），两侧按钮逐级调整；修为选项按项目等级规则限制上限。 -->
    <div v-for="field in steppers" :key="field.key" class="battle-stepper-field">
      <label :for="`battle-stat-${field.key}`">{{ field.label }}</label>
      <div class="battle-stepper">
        <button type="button" :aria-label="`${field.label}减 1`" :disabled="!canStep(field, -1)" @click="step(field, -1)"><Minus :size="14" aria-hidden="true" /></button>
        <select :id="`battle-stat-${field.key}`" :value="operator[field.key]" @change="emit('change', field.key, $event.target.value)">
          <!-- 等级、修为最低为 1，不提供“未知”；尚未填写时仅显示占位，选定后不能再回到空值。 -->
          <option v-if="!String(operator[field.key] ?? '').trim()" value="" disabled hidden>请选择</option>
          <option v-if="field.extra" :value="operator[field.key]">{{ operator[field.key] }}（{{ field.extra }}）</option>
          <option v-for="value in field.options" :key="value" :value="String(value)">{{ value }}</option>
        </select>
        <button type="button" :aria-label="`${field.label}加 1`" :disabled="!canStep(field, 1)" @click="step(field, 1)"><Plus :size="14" aria-hidden="true" /></button>
      </div>
      <small :class="{ 'battle-field-warning': field.warning }">{{ field.hint }}</small>
      <button v-if="field.fix" type="button" class="battle-link-button" @click="emit('change', field.key, String(field.fix))">改为修为 {{ field.fix }}</button>
    </div>
    <fieldset class="battle-huaji-field">
      <legend>化极</legend>
      <!-- 觉醒是 5 星之后的化极阶段，与星级同一组单选；节点只在未满星时细分。 -->
      <div class="battle-choice-row" role="group" aria-label="化极" :aria-describedby="pendingAwakening ? 'battle-awakening-pending' : undefined">
        <button v-for="star in maxStars" :key="star" type="button" :aria-pressed="huaji?.stars === star && !(star === maxStars && awakened)" @click="setHuaji(star, huaji?.nodes)">{{ star }} 星</button>
        <button v-if="canAwaken" type="button" :aria-pressed="awakened" @click="setHuaji(maxStars, null, '已觉醒')">觉醒</button>
        <button v-if="operator.huaji" type="button" class="battle-link-button battle-choice-clear" aria-label="清除化极" @click="emit('change', 'huaji', '')">清除</button>
      </div>
      <p v-if="pendingAwakening" id="battle-awakening-pending" class="battle-pending-tag">账号记录未确认是否觉醒：已觉醒选“觉醒”，否则选“{{ maxStars }} 星”。</p>
      <div v-if="huaji && huaji.stars < maxStars && !sp" class="battle-choice-row" role="group" aria-label="化极节点">
        <span aria-hidden="true">节点</span>
        <button v-for="node in 6" :key="node" type="button" :aria-pressed="(huaji.nodes ?? 0) === node - 1" @click="setHuaji(huaji.stars, node - 1)">{{ node - 1 }}</button>
      </div>
      <p v-if="!huaji && operator.huaji" class="battle-hint">原记录“{{ operator.huaji }}”无法识别为星级，重新选择后会替换。</p>
    </fieldset>
    <label v-for="[key, label] in FREE_FIELDS" :key="key">{{ label }}<input :value="operator[key]" inputmode="numeric" maxlength="30" placeholder="未知可留空" @input="emit('change', key, $event.target.value)"></label>
    <p v-if="operator.panelNote" class="battle-stat-note"><Info :size="14" aria-hidden="true" />{{ operator.panelNote }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Info, Minus, Plus } from '@lucide/vue'
import { battleHuajiProgress } from '../../utils/battleImages.js'
import { OPERATOR_ELITE_MAX, OPERATOR_ELITE_UNLOCK_LEVELS, OPERATOR_LEVEL_MAX, getMaxEliteForLevel } from '../../utils/operatorGrowthRules.js'
import { operatorAwakeningSupported, operatorHuajiMax } from '../../utils/operatorHuaji.js'
import { isMovieOperator } from '../../utils/operatorForms.js'
// agent 为图鉴条目（含稀有度 / SP 信息）；自定义密探没有图鉴时按常规五星规则放开选择。
const props = defineProps({ operator: { type: Object, required: true }, agent: { type: Object, default: null } })
const emit = defineEmits(['change'])
const FREE_FIELDS = [['hp', '生命'], ['attack', '攻击']]
const range = (from, to) => Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index)
const integer = value => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : null)

const steppers = computed(() => {
  const level = integer(props.operator.level), elite = integer(props.operator.elite)
  const validLevel = level != null && level >= 1 && level <= OPERATOR_LEVEL_MAX ? level : null
  const eliteMax = validLevel ? getMaxEliteForLevel(validLevel) : OPERATOR_ELITE_MAX
  const next = validLevel && OPERATOR_ELITE_UNLOCK_LEVELS.findIndex(unlock => unlock > validLevel)
  const required = elite != null && elite >= 1 && elite <= OPERATOR_ELITE_MAX ? OPERATOR_ELITE_UNLOCK_LEVELS[elite - 1] : null
  const over = Boolean(validLevel && elite != null && elite > eliteMax)
  const extra = (value, options, overLabel) => (String(value ?? '').trim() && !options.includes(integer(value)) ? overLabel : '')
  const levelOptions = range(1, OPERATOR_LEVEL_MAX), eliteOptions = range(1, eliteMax)
  return [
    { key: 'level', label: '等级', min: 1, max: OPERATOR_LEVEL_MAX, options: levelOptions, extra: extra(props.operator.level, levelOptions, '原记录'),
      hint: !validLevel ? '请选择，最低为 1' : next > 0 ? `升到 Lv.${OPERATOR_ELITE_UNLOCK_LEVELS[next]} 可解锁修为 ${next + 1}` : '已满级' },
    { key: 'elite', label: '修为', min: 1, max: eliteMax, options: eliteOptions, extra: extra(props.operator.elite, eliteOptions, over ? '超出等级上限' : '原记录'),
      warning: over, fix: over ? eliteMax : 0,
      hint: over ? `修为 ${elite} 需要 Lv.${required}，当前 Lv.${validLevel} 上限为 ${eliteMax}` : validLevel ? `Lv.${validLevel} 修为上限 ${eliteMax}` : `未填等级，修为可选 1–${OPERATOR_ELITE_MAX}` },
  ]
})
function canStep(field, offset) {
  const raw = String(props.operator[field.key] ?? '').trim(), value = integer(raw)
  if (!raw) return offset > 0
  if (value == null) return false
  // 超出上限的旧值可向下调整，结果会收回到上限以内。
  return offset > 0 ? value < field.max : value > field.min
}
function step(field, offset) {
  const value = integer(props.operator[field.key])
  emit('change', field.key, String(value == null ? field.min : Math.min(field.max, value + offset)))
}

// 化极文本沿用导入格式（“4 星 · 2 节点”“5 星 · 已觉醒”），出图解析与账号带入保持一致。
const sp = computed(() => isMovieOperator(props.agent))
const maxStage = computed(() => (props.agent ? operatorHuajiMax(props.agent) : 25))
const maxStars = computed(() => (sp.value ? 5 : Math.floor((maxStage.value - 1) / 6) + 1))
const canAwaken = computed(() => maxStage.value === 25 && (!props.agent || operatorAwakeningSupported(props.agent)))
const huaji = computed(() => {
  const parsed = battleHuajiProgress(props.operator.huaji)
  return parsed && parsed.stars <= maxStars.value ? parsed : null
})
const pendingAwakening = computed(() => huaji.value?.status === '觉醒待确认')
const awakened = computed(() => huaji.value?.stars === maxStars.value && huaji.value?.status === '已觉醒')
function setHuaji(stars, nodes, status) {
  if (stars < maxStars.value) return emit('change', 'huaji', sp.value ? `${stars} 星` : `${stars} 星 · ${Math.min(5, nodes ?? 0)} 节点`)
  emit('change', 'huaji', canAwaken.value ? `${stars} 星 · ${status || '未觉醒'}` : `${stars} 星`)
}
</script>
