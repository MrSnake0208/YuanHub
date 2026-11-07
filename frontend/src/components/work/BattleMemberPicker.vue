<template>
  <div class="battle-member-picker">
    <div class="battle-picker-toolbar">
      <label class="battle-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">搜索密探</span><input v-model="search" aria-label="搜索密探" placeholder="搜索名字或别名"></label>
      <div class="battle-subnav" role="group" aria-label="密探来源"><button type="button" :aria-pressed="!ownedOnly" @click="ownedOnly = false">全部密探</button><button type="button" :aria-pressed="ownedOnly" @click="ownedOnly = true">我的密探</button></div>
    </div>
    <!-- 自定义名称是低频补充，放在列表上方的折叠入口，避免沉到长列表底部找不到。 -->
    <details class="battle-custom-toggle">
      <summary>图鉴中没有？使用自定义名称</summary>
      <form class="battle-custom-name" @submit.prevent="emit('choose', customName.trim())">
        <label>自定义名称<input v-model="customName" :aria-label="`${slot + 1}号位密探`" maxlength="40" placeholder="图鉴中没有的密探" @input="emit('pending-name', Boolean(customName.trim()))"></label>
        <button type="submit" :disabled="busy || !customName.trim()">使用此名称</button>
      </form>
    </details>
    <p v-if="ownedOnly && !accountEntries.length" class="battle-hint">尚无账号候选：登录并选择账号后会自动读取我的密探，读取失败时可在页面上方重试；也可选择全部密探手动填写。</p>
    <div v-if="filtered.length" class="battle-picker-grid" aria-label="密探候选">
      <button v-for="agent in filtered" :key="agent.id" type="button" :class="{ current: placement(agent) === slot }" :disabled="busy" :aria-current="placement(agent) === slot ? 'true' : undefined" :aria-label="`选择${agent.name}`" @click="emit('choose', agent.name)">
        <img v-if="portraits[agent.id]" :src="portraits[agent.id]" alt="" loading="lazy"><UserRound v-else :size="32" aria-hidden="true" />
        <strong>{{ agent.name }}</strong><small :class="{ muted: !ownedIds.has(agent.id) }">{{ status(agent) }}</small>
      </button>
    </div>
    <div v-else-if="search.trim()" role="status" class="battle-picker-empty">
      <p class="battle-hint">没有匹配“{{ search.trim() }}”的密探。</p>
      <button type="button" :disabled="busy" @click="emit('choose', search.trim())">使用“{{ search.trim() }}”作为自定义名称</button>
    </div>
    <p class="battle-hint">已有配置会带入本攻略；更换已有密探前会确认替换范围。</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Search, UserRound } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
const props = defineProps({ agents: { type: Array, required: true }, accountEntries: { type: Array, default: () => [] }, team: { type: Array, default: () => [] }, slot: { type: Number, required: true }, busy: Boolean })
const emit = defineEmits(['choose', 'pending-name'])
const search = ref(''), ownedOnly = ref(false), customName = ref('')
const ownedIds = computed(() => new Set(props.accountEntries.map(entry => entry.id)))
const filtered = computed(() => props.agents.filter(agent => (!ownedOnly.value || ownedIds.value.has(agent.id)) && `${agent.name} ${agent.alias || ''}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
// 标出当前槽位与已在其他号位的密探，避免重复上阵时不自知；仍允许选择，替换前由上层确认。
const sameAgent = (member, agent) => Boolean(member?.name) && (member.id ? member.id === agent.id : member.name === agent.name)
const placement = agent => sameAgent(props.team[props.slot], agent) ? props.slot : props.team.findIndex(member => sameAgent(member, agent))
function status(agent) {
  const index = placement(agent)
  if (index === props.slot) return '当前'
  if (index >= 0) return `已在${index + 1}号位`
  return ownedIds.value.has(agent.id) ? '已有配置' : '需手动填写'
}
onBeforeUnmount(() => emit('pending-name', false))
</script>
