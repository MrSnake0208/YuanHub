<template>
  <div class="bond-common-filters" role="group" aria-label="排序和密探筛选">
    <label>排序<select v-model="sortOrder" :disabled="disabled">
      <option value="roster">游戏名册</option>
      <option value="catalog">收录顺序</option>
    </select></label>
    <label>品质<select v-model="quality" :disabled="disabled">
      <option v-for="option in OPERATOR_RARITY_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select></label>
    <label>属性<select v-model="prof" :disabled="disabled">
      <option value="">全部</option>
      <option v-for="option in AGENT_PROFS" :key="option" :value="option">{{ option }}</option>
    </select></label>
    <label>职业<select v-model="subProf" :disabled="disabled">
      <option value="">全部</option>
      <option v-for="option in careerOptions" :key="option" :value="option">{{ option }}</option>
    </select></label>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { OPERATOR_RARITY_OPTIONS, subProfOptions } from '../../utils/operatorFilters.js'

const props = defineProps({ disabled: Boolean, operators: { type: Array, required: true } })
const sortOrder = defineModel('sortOrder', { type: String, required: true })
const quality = defineModel('quality', { type: String, required: true })
const prof = defineModel('prof', { type: String, required: true })
const subProf = defineModel('subProf', { type: String, required: true })
const careerOptions = computed(() => subProfOptions(props.operators))
</script>
