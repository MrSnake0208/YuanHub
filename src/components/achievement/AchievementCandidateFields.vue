<template>
  <div class="candidate-fields">
    <AchievementBasicFields :candidate="candidate" :categories="categories" :errors="errors" prefix="candidate" />
    <label>完成条件<textarea v-model="candidate.condition" maxlength="4000" rows="3"></textarea></label>
    <label>奖励资料<select :id="'candidate-rewards'" :value="rewardState" :aria-invalid="!!errors.rewards" :aria-describedby="errors.rewards ? 'candidate-rewards-error' : undefined" @change="setRewards($event.target.value)"><option value="unknown">资料未补齐</option><option value="none">确认无奖励</option><option value="known">已知奖励</option></select></label>
    <p>奖励未知时请保留“资料未补齐”，在补充说明中写明待核，不要填写0。</p>
    <div v-for="(reward, i) in candidate.rewards || []" :key="i" class="candidate-reward">
      <label>奖励物品 {{ i + 1 }}<select :value="reward.item_key" :aria-describedby="errors.rewards ? 'candidate-rewards-error' : undefined" @change="setItem(reward, $event.target.value)"><option value="">请选择物品</option><option v-for="item in items" :key="item.item_key" :value="item.item_key">{{ item.name }}</option></select></label>
      <label>数量<input v-model.number="reward.quantity" type="number" min="1" max="9007199254740991" step="1" inputmode="numeric" :aria-describedby="errors.rewards ? 'candidate-rewards-error' : undefined"></label>
      <button type="button" :aria-label="'删除奖励 ' + (i + 1)" @click="candidate.rewards.splice(i, 1)">删除</button>
    </div>
    <p v-if="errors.rewards" id="candidate-rewards-error">{{ errors.rewards }}</p>
    <button v-if="candidate.rewards !== null" type="button" :disabled="candidate.rewards.length >= items.length" @click="candidate.rewards.push({ item_key: '', name: '', quantity: 1 })">添加奖励</button>
    <label>目标数量（选填）<input id="candidate-target" :value="candidate.target" type="number" min="1" max="1000000000000" step="1" inputmode="numeric" :aria-invalid="!!errors.target" :aria-describedby="errors.target ? 'candidate-target-error' : undefined" @input="candidate.target = $event.target.value === '' ? null : Number($event.target.value)"><span v-if="errors.target" id="candidate-target-error">{{ errors.target }}</span></label>
    <label>联动来源<select v-model="candidate.linked_metric"><option :value="null">无联动</option><option value="yuan_bond_variants">鸢报羁绊种数（尚未接入）</option></select></label>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import AchievementBasicFields from './AchievementBasicFields.vue'
const props = defineProps({ candidate: { type: Object, required: true }, categories: { type: Array, required: true }, rewardItems: { type: Array, default: () => [] }, errors: { type: Object, default: () => ({}) } })
const items = computed(() => props.rewardItems.filter(i => i.games.includes(props.candidate.game)))
const rewardState = computed(() => props.candidate.rewards == null ? 'unknown' : props.candidate.rewards.length ? 'known' : 'none')
function setRewards(value) { props.candidate.rewards = value === 'unknown' ? null : value === 'none' ? [] : [{ item_key: '', name: '', quantity: 1 }] }
function setItem(reward, key) { Object.assign(reward, { item_key: key, name: items.value.find(i => i.item_key === key)?.name || '' }) }
</script>
<style scoped>
.candidate-fields { display: grid; gap: 12px; min-width: 0; }
label { display: grid; gap: 5px; min-width: 0; }
input, select, textarea { width: 100%; min-width: 0; box-sizing: border-box; font: inherit; }
.candidate-reward { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
.candidate-reward label { flex: 1 1 140px; }
p { margin: 0; overflow-wrap: anywhere; }
</style>
