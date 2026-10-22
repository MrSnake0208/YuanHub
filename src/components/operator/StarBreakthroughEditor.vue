<template>
  <section v-if="equipped.length" class="star-breakthrough" aria-label="星石突破记录">
    <strong>星石突破</strong>
    <p>整十级可能已突破或尚未突破。选择后立即保存，并更新面板计算。</p>
    <div class="breakthrough-fields">
      <label v-for="star in equipped" :key="star.instance_id">
        <span>{{ star.name }} · {{ star.level }} 级</span>
        <select v-if="starBreakthroughOptions(star).length === 2" :value="value(star)" :disabled="saving" @change="change(star, $event)">
          <option value="">待确认</option>
          <option v-for="(stage, index) in starBreakthroughOptions(star)" :key="stage" :value="stage">{{ index ? '本级已突破' : '本级未突破' }}</option>
        </select>
        <span v-else>{{ starBreakthroughOptions(star).length ? '突破次数可由等级确定' : '等级与品质待复核' }}</span>
      </label>
    </div>
    <button v-if="Object.keys(changes).length" class="btn small" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存星石突破' }}</button>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { patchCurrentStarState } from '../../api/starState.js'
import { starBreakthroughOptions, starBreakthroughPatch } from '../../domain/starBreakthrough.js'

const props = defineProps({ accountId: { type: String, required: true }, state: Object, loadout: Object })
const emit = defineEmits(['saved'])
const changes = ref({}), saving = ref(false), message = ref('')
const scope = computed(() => JSON.stringify([props.accountId, props.state?.generation, props.state?.revision]))
const equipped = computed(() => {
  const ids = new Set(Object.values(props.loadout || {}).filter(Boolean))
  return (props.state?.inventory || []).filter(star => ids.has(star.instance_id))
})
watch(scope, () => { changes.value = {}; message.value = ''; saving.value = false })
function value(star) {
  return (Object.hasOwn(changes.value, star.instance_id) ? changes.value[star.instance_id] : star.breakthrough_stage) ?? ''
}
function change(star, event) {
  changes.value[star.instance_id] = event.target.value === '' ? null : Number(event.target.value)
  message.value = ''
  void save()
}
async function save() {
  if (saving.value || !props.state) return
  const key = scope.value
  const selected = Object.fromEntries(equipped.value.filter(star => Object.hasOwn(changes.value, star.instance_id)).map(star => [star.instance_id, changes.value[star.instance_id]]))
  if (!Object.keys(selected).length) return
  saving.value = true
  try {
    const response = await patchCurrentStarState(props.accountId, starBreakthroughPatch(props.state, selected))
    if (scope.value !== key) return
    changes.value = {}
    emit('saved', response.state)
    message.value = '星石突破已保存'
  } catch (error) {
    if (scope.value === key) message.value = error.status === 409 ? '星石档案已变化，请重新打开编辑器后核对' : '保存失败，请重试'
  } finally {
    if (scope.value === key) saving.value = false
  }
}
</script>

<style scoped>
.star-breakthrough { margin-top: 12px; }
.star-breakthrough p { font-size: 12px; margin: 6px 0; }
.breakthrough-fields { display: grid; gap: 8px; margin: 8px 0; }
.breakthrough-fields label { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; font-size: 13px; }
.breakthrough-fields select { max-width: 100%; min-height: 32px; color: inherit; background: var(--surface); border: 1px solid currentColor; border-radius: 6px; }
@media (min-width: 641px) { .breakthrough-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; } }
</style>
