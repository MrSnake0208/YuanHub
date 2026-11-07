<template>
  <div class="battle-disc-editor">
    <div class="battle-section-heading"><h3>命盘</h3><span>携带 {{ carried.length }} / {{ DISC_SELECTION_LIMIT }}{{ full ? '（已满）' : '' }} · 必须 {{ required.length }} · 禁用 {{ forbidden.length }}</span></div>
    <!-- 图标含义常驻显示，不只放在悬浮提示里。 -->
    <p class="battle-disc-legend"><span v-for="[state, text, icon] in STATES" :key="state" :class="state"><component :is="icon" :size="14" aria-hidden="true" />{{ text }}</span><span>再次点击可取消</span></p>
    <p v-if="validation" role="alert" class="battle-error">{{ validation }}</p>
    <p v-if="conflicts.length" role="alert" class="battle-error">{{ conflicts.join('；') }}。可在下方重新标记或移除。</p>
    <div v-for="[field, label, values] in groups" :key="field" class="battle-selected-terms" :aria-label="`已选${label}`">
      <span class="battle-term-group">{{ label }}</span>
      <button v-for="(name, index) in values" :key="index" type="button" :class="field" :aria-label="`移除${label}第${index + 1}项：${name}`" @click="remove(field, name)">{{ name }}<small v-if="field === 'discs' && required.includes(name)">必须</small><X :size="14" aria-hidden="true" /></button>
    </div>
    <ul v-if="terms.length" class="battle-catalog-terms" aria-label="图鉴命盘">
      <li v-for="term in terms" :key="term.name" :class="stateOf(term.name)">
        <div class="battle-disc-term-head">
          <strong>{{ term.name }}</strong>
          <div class="battle-disc-states" role="group" :aria-label="`${term.name}的状态`">
            <button v-for="[state, text, icon] in STATES" :key="state" type="button" :class="state" :aria-pressed="stateOf(term.name) === state" :disabled="blocked(term.name, state)" :aria-label="`${text}命盘：${term.name}`" :title="text" @click="toggle(term.name, state)"><component :is="icon" :size="16" aria-hidden="true" /></button>
          </div>
        </div>
        <small v-if="term.description">{{ term.description }}</small>
      </li>
    </ul>
    <p v-else class="battle-hint">当前目录暂无该密探的命盘词条。</p>
    <p class="battle-hint">必须命盘一定在携带的三项之中；禁用命盘提示读者不要携带，不计入三项。</p>
    <p v-if="error" role="alert" class="battle-error">{{ error }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Ban, Check, Star, X } from '@lucide/vue'
import { battleDiscNames, battleDiscError } from '../../utils/battleImages.js'
import { DISC_SELECTION_LIMIT, discNameOf } from '../../utils/operatorDiscLoadouts.js'
const props = defineProps({ operator: { type: Object, required: true }, slot: { type: Number, required: true }, catalog: { type: Array, default: () => [] } })
const emit = defineEmits(['change'])
// 一个命盘只有一种状态：携带、必须（携带且要求读者携带）或禁用；三种状态仍写回原来的三个草稿字段。
const STATES = [['carry', '携带', Check], ['required', '必须', Star], ['forbidden', '禁用', Ban]]
const carried = computed(() => battleDiscNames(props.operator.discs))
const required = computed(() => battleDiscNames(props.operator.requiredDiscs))
const forbidden = computed(() => battleDiscNames(props.operator.forbiddenDiscs))
// 必须项以“必须”角标附在携带项上；只有旧草稿里未携带的必须项才单独列出，便于移除。
const groups = computed(() => [['discs', '携带命盘', carried.value], ['requiredDiscs', '必须命盘', required.value.filter(name => !carried.value.includes(name))], ['forbiddenDiscs', '禁用命盘', forbidden.value]].filter(([, , values]) => values.length))
const full = computed(() => carried.value.length >= DISC_SELECTION_LIMIT)
const validation = computed(() => battleDiscError(props.operator.discs))
// 旧草稿可能存在“必须但未携带”或“禁用却仍携带”，只提示不自动改写，由作者决定保留哪一种。
const conflicts = computed(() => [
  ...required.value.filter(name => !carried.value.includes(name)).map(name => `「${name}」标为必须但未携带`),
  ...forbidden.value.filter(name => carried.value.includes(name)).map(name => `「${name}」标为禁用却仍在携带`),
])
const terms = computed(() => [...new Map(props.catalog.map(term => [discNameOf(term), { name: discNameOf(term), description: typeof term === 'string' ? '' : String(term?.desp || term?.description || term?.desc || '').trim() }])).values()].filter(term => term.name))
const error = ref('')
watch(() => props.operator, () => { error.value = '' })
function stateOf(name) {
  if (forbidden.value.includes(name)) return 'forbidden'
  if (required.value.includes(name)) return 'required'
  return carried.value.includes(name) ? 'carry' : ''
}
const blocked = (name, state) => state !== 'forbidden' && full.value && !carried.value.includes(name)
function save(next) {
  const values = Object.fromEntries(Object.entries(next).map(([field, names]) => [field, names.join('\n')]))
  error.value = Object.values(values).some(value => value.length > 300) ? '该字段最多 300 字，请先移除部分词条。' : ''
  if (error.value) return
  for (const [field, value] of Object.entries(values)) if (value !== String(props.operator[field] ?? '')) emit('change', field, value)
}
const without = (list, name) => list.filter(item => item !== name)
const withName = (list, name) => (list.includes(name) ? list : [...list, name])
// 再次点亮起的状态即取消：必须退回携带，携带与禁用退回未选。
function toggle(name, state) {
  if (blocked(name, state)) return
  const current = stateOf(name), target = current === state ? (state === 'required' ? 'carry' : '') : state
  save({
    discs: ['carry', 'required'].includes(target) ? withName(carried.value, name) : without(carried.value, name),
    requiredDiscs: target === 'required' ? withName(required.value, name) : without(required.value, name),
    forbiddenDiscs: target === 'forbidden' ? withName(forbidden.value, name) : without(forbidden.value, name),
  })
}
// 移除携带项时一并取消其必须要求，保持“必须属于携带”。
function remove(field, name) {
  const list = { discs: carried.value, requiredDiscs: required.value, forbiddenDiscs: forbidden.value }[field]
  const index = list.indexOf(name), next = { [field]: list.filter((_, item) => item !== index) }
  if (field === 'discs' && !next.discs.includes(name)) next.requiredDiscs = without(required.value, name)
  save(next)
}
</script>
