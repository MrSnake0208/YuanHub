<template>
  <div class="battle-star-editor">
    <p class="battle-hint">等级未知可留空；同一密探的星石不能重复，部分星石仅限指定从属或属性。仅修改本攻略，不会自动重算生命与攻击。</p>
    <p v-if="conflicts.length" role="alert" class="battle-error">当前配置不符合佩戴规则：{{ conflicts.join('；') }}。请更换或清空对应槽位。</p>
    <!-- 主星、辅星各一组，列标题只出现一次；每个输入仍有独立的可访问名称。 -->
    <div class="battle-star-slots">
      <fieldset v-for="group in groups" :key="group.kind">
        <legend>{{ group.kind }}</legend>
        <div class="battle-star-row battle-star-head" aria-hidden="true"><span></span><span>名称</span><span>等级</span></div>
        <div v-for="{ star, index } in group.items" :key="star.label" class="battle-star-row">
          <span class="battle-star-index" aria-hidden="true">{{ index % 3 + 1 }}</span>
          <select :value="star.name" :aria-label="star.label + '名称'" @change="update(index, 'name', $event)">
            <option value="">未选择</option>
            <option v-if="star.name && !options[index].includes(star.name)" :value="star.name">{{ star.name }}（{{ legacyNote(star.name) }}）</option>
            <option v-for="name in options[index]" :key="name" :value="name">{{ name }}</option>
          </select>
          <input :value="star.level" inputmode="numeric" :aria-label="star.label + '等级'" maxlength="3" placeholder="未知" @input="update(index, 'level', $event)">
        </div>
      </fieldset>
    </div>
    <p v-if="error" role="alert" class="battle-error">{{ error }}</p>
    <!-- 旧草稿中无法按槽位识别的内容只读展示并原样保留（配队表“星石其他说明”行、出图辅星下方仍会显示），可整体清除，不提供自由文本编辑。 -->
    <div v-if="unparsed.length" class="battle-star-unparsed">
      <p class="battle-hint">以下内容无法按槽位识别，已原样保留，配队表与出图中仍会显示：</p>
      <ul><li v-for="(line, index) in unparsed" :key="index">{{ line }}</li></ul>
      <button type="button" class="battle-danger-text" @click="clearUnparsed">清除这些内容</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS } from '../../data/starCatalog.js'
import { battleStarConflicts, battleStarFields, battleStarNameError, battleStarUnparsed, battleStarWithoutUnparsed, updateBattleStar } from '../../utils/battleEditor.js'
import { dialog } from '../../utils/dialog.js'
const props = defineProps({ modelValue: { type: String, default: '' }, slot: { type: Number, required: true }, agent: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue'])
const slots = computed(() => battleStarFields(props.modelValue)), error = ref('')
const groups = computed(() => ['主星', '辅星'].map((kind, group) => ({ kind, items: slots.value.slice(group * 3, group * 3 + 3).map((star, offset) => ({ star, index: group * 3 + offset })) })))
const unparsed = computed(() => battleStarUnparsed(props.modelValue))
const conflicts = computed(() => battleStarConflicts(props.modelValue, props.agent))
// 名称只能从图鉴下拉选择：每个槽位只列出可选的星石，排除其它槽位已选和该密探不能佩戴的。
// 旧草稿里的图鉴外名称或违规星石仍作为当前值显示并标注，改选其它项后不能再选回。
const options = computed(() => slots.value.map((star, index) => (index < 3 ? MAIN_STAR_OPTIONS : ASSIST_STAR_OPTIONS).filter(name => !battleStarNameError(props.modelValue, index, name, props.agent))))
watch(() => props.slot, () => { error.value = '' })
const legacyNote = name => ([...MAIN_STAR_OPTIONS, ...ASSIST_STAR_OPTIONS].includes(name) ? '不符合佩戴规则' : '图鉴外')
async function clearUnparsed() {
  const value = props.modelValue
  if (!await dialog.confirm({ title: '清除无法识别的星石内容？', message: `将删除 ${unparsed.value.length} 行无法按槽位识别的内容，已识别的六个槽位保留。`, type: 'danger', confirmText: '清除内容' })) return
  // 确认期间内容已变化（如切换槽位或继续编辑）时不覆盖。
  if (props.modelValue !== value) return
  error.value = ''
  emit('update:modelValue', battleStarWithoutUnparsed(value))
}
function update(index, field, event) {
  error.value = ''
  try {
    const rule = field === 'name' ? battleStarNameError(props.modelValue, index, event.target.value, props.agent) : ''
    if (rule) throw new Error(rule + '原内容未改。')
    emit('update:modelValue', updateBattleStar(props.modelValue, index, field, event.target.value))
  }
  catch (reason) { error.value = reason.message; event.target.value = slots.value[index][field] }
}
</script>
