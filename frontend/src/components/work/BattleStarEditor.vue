<template>
  <div class="battle-star-editor">
    <p class="battle-hint">仅修改本攻略，不会自动重算生命与攻击。未知信息可留空。</p>
    <div class="battle-star-slots">
      <fieldset v-for="(star, index) in slots" :key="star.label">
        <legend>{{ star.label }}</legend>
        <label class="battle-star-name">名称<input :value="star.name" :list="index < 3 ? 'battle-main-stars' : 'battle-support-stars'" :aria-label="star.label + '名称'" maxlength="30" placeholder="选择或输入" @input="update(index, 'name', $event)"></label>
        <label>等级<input :value="star.level" inputmode="numeric" :aria-label="star.label + '等级'" maxlength="3" placeholder="未知" @input="update(index, 'level', $event)"></label>
        <label>品质<select :value="star.quality" :aria-label="star.label + '品质'" @change="update(index, 'quality', $event)"><option value="">未知</option><option>橙</option><option>紫</option><option>蓝</option><option v-if="star.quality && !['橙', '紫', '蓝'].includes(star.quality)">{{ star.quality }}</option></select></label>
        <label>突破<input :value="star.breakthrough" inputmode="numeric" :aria-label="star.label + '突破'" maxlength="3" placeholder="未知" @input="update(index, 'breakthrough', $event)"></label>
      </fieldset>
    </div>
    <p v-if="error" role="alert" class="battle-error">{{ error }}</p>
    <p v-if="unparsed" class="battle-hint">部分原文本无法按槽位识别，已完整保留；可在下方查看和编辑。</p>
    <details class="battle-text-editor"><summary>原文本 / 其他说明</summary><label>星石原文本<textarea :value="modelValue" :aria-label="`${slot + 1}号位星石 / 辅星`" rows="4" maxlength="300" @input="emit('update:modelValue', $event.target.value)"></textarea></label></details>
    <datalist id="battle-main-stars"><option v-for="name in MAIN_STAR_OPTIONS" :key="name">{{ name }}</option></datalist>
    <datalist id="battle-support-stars"><option v-for="name in ASSIST_STAR_OPTIONS" :key="name">{{ name }}</option></datalist>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS } from '../../data/starCatalog.js'
import { battleStarFields, updateBattleStar } from '../../utils/battleEditor.js'
const props = defineProps({ modelValue: { type: String, default: '' }, slot: { type: Number, required: true } })
const emit = defineEmits(['update:modelValue'])
const slots = computed(() => battleStarFields(props.modelValue)), error = ref('')
const unparsed = computed(() => props.modelValue.split('\n').some((line, index) => line.trim() && !slots.value.some(star => star.line === index)))
watch(() => props.slot, () => { error.value = '' })
function update(index, field, event) {
  error.value = ''
  try { emit('update:modelValue', updateBattleStar(props.modelValue, index, field, event.target.value)) }
  catch (reason) { error.value = reason.message; event.target.value = slots.value[index][field] }
}
</script>
