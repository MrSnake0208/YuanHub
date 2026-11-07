<template>
  <div class="battle-disc-editor">
    <div class="battle-section-heading"><h3>{{ label }}</h3><span>{{ names.length === DISC_SELECTION_LIMIT && field === 'discs' ? '已选满，取消一项后可更换 · ' : '' }}{{ names.length }}{{ field === 'discs' ? ` / ${DISC_SELECTION_LIMIT} 项` : ' 项' }}</span></div>
    <p v-if="validation" role="alert" class="battle-error">{{ validation }}</p>
    <div v-if="names.length" class="battle-selected-terms" aria-label="已填写词条">
      <button v-for="(name, index) in names" :key="index" type="button" :aria-label="`移除${label}第${index + 1}项：${name}`" @click="remove(index)">{{ name }}<X :size="14" aria-hidden="true" /></button>
    </div>
    <div v-if="terms.length" class="battle-catalog-terms">
      <label v-for="term in terms" :key="term.name" :class="{ selected: names.includes(term.name), disabled: full && !names.includes(term.name) }">
        <input type="checkbox" :checked="names.includes(term.name)" :disabled="full && !names.includes(term.name)" :aria-label="`${label}：${term.name}`" @change="toggle(term.name, $event)">
        <span><strong>{{ term.name }}</strong><small v-if="term.description">{{ term.description }}</small></span>
      </label>
    </div>
    <p v-else class="battle-hint">当前目录暂无该密探的命盘词条，可在下方手动填写。</p>
    <p v-if="error" role="alert" class="battle-error">{{ error }}</p>
    <details class="battle-text-editor" :open="Boolean(validation)"><summary>自定义词条 / 编辑文本</summary>
      <label>{{ label }}<textarea :value="operator[field]" :aria-label="`${slot + 1}号位${label}`" :aria-invalid="Boolean(validation)" :aria-describedby="`battle-disc-hint-${field}`" maxlength="300" rows="3" placeholder="一行一个命盘词条" @input="emit('change', field, $event.target.value)"></textarea></label>
      <p :id="`battle-disc-hint-${field}`" class="battle-hint">{{ validation || (field === 'discs' ? '最多三项；选满后先移除再添加。' : '攻略要求不受实际携带的三项限制。') }}</p>
    </details>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { battleDiscNames, battleDiscError } from '../../utils/battleImages.js'
import { DISC_SELECTION_LIMIT, discNameOf } from '../../utils/operatorDiscLoadouts.js'
const props = defineProps({ operator: { type: Object, required: true }, slot: { type: Number, required: true }, catalog: { type: Array, default: () => [] }, field: { type: String, default: 'discs' } })
const emit = defineEmits(['change'])
const names = computed(() => battleDiscNames(props.operator[props.field]))
const label = computed(() => ({ discs: '携带命盘', requiredDiscs: '必须命盘', forbiddenDiscs: '禁用命盘' })[props.field])
const full = computed(() => props.field === 'discs' && names.value.length >= DISC_SELECTION_LIMIT)
const validation = computed(() => props.field === 'discs' ? battleDiscError(props.operator.discs) : '')
const terms = computed(() => [...new Map(props.catalog.map(term => [discNameOf(term), { name: discNameOf(term), description: typeof term === 'string' ? '' : String(term?.desp || term?.description || term?.desc || '').trim() }])).values()].filter(term => term.name))
const error = ref('')
watch(() => props.operator, () => { error.value = '' })
function save(values) {
  const value = values.join('\n')
  error.value = value.length > 300 ? '该字段最多 300 字，请先整理原文本。' : ''
  if (error.value) return false
  emit('change', props.field, value)
  return true
}
function remove(index) { save(names.value.filter((_, item) => item !== index)) }
function toggle(name, event) {
  const selected = names.value.includes(name)
  if (!selected && props.field === 'discs' && names.value.length >= DISC_SELECTION_LIMIT) { event.target.checked = false; return }
  if (!save(selected ? names.value.filter(item => item !== name) : [...names.value, name])) event.target.checked = selected
}
</script>
