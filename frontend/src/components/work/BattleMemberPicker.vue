<template>
  <div class="battle-member-picker">
    <div class="battle-picker-toolbar">
      <label class="battle-search"><Search :size="16" aria-hidden="true" /><span class="sr-only">搜索密探</span><input v-model="search" aria-label="搜索密探" placeholder="搜索名字或别名"></label>
      <div class="battle-subnav" role="group" aria-label="密探来源"><button type="button" :aria-pressed="!ownedOnly" @click="ownedOnly = false">全部密探</button><button type="button" :aria-pressed="ownedOnly" @click="ownedOnly = true">我的密探</button></div>
    </div>
    <p v-if="ownedOnly && !accountEntries.length" class="battle-hint">尚无账号候选：登录并选择账号后会自动读取我的密探，读取失败时可在页面上方重试；也可选择全部密探手动填写。</p>
    <div v-if="filtered.length" class="battle-picker-grid" aria-label="密探候选">
      <button v-for="agent in filtered" :key="agent.id" type="button" :disabled="busy" :aria-label="`选择${agent.name}`" @click="emit('choose', agent.name)">
        <img v-if="portraits[agent.id]" :src="portraits[agent.id]" alt="" loading="lazy"><UserRound v-else :size="32" aria-hidden="true" />
        <strong>{{ agent.name }}</strong><small>{{ ownedIds.has(agent.id) ? '已有配置' : '手动填写练度' }}</small>
      </button>
    </div>
    <p v-else-if="search" role="status" class="battle-hint">没有匹配的密探，可换个关键词，或使用自定义名称。</p>
    <form class="battle-custom-name" @submit.prevent="emit('choose', customName.trim())">
      <label>自定义名称<input v-model="customName" :aria-label="`${slot + 1}号位密探`" maxlength="40" placeholder="图鉴中没有的密探" @input="emit('pending-name', Boolean(customName.trim()))"></label>
      <button type="submit" :disabled="busy || !customName.trim()">使用此名称</button>
    </form>
    <p class="battle-hint">已有配置会带入本攻略；更换已有密探前会确认替换范围。</p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import { Search, UserRound } from '@lucide/vue'
import portraits from '../../data/operatorPortraits.json'
const props = defineProps({ agents: { type: Array, required: true }, accountEntries: { type: Array, default: () => [] }, slot: { type: Number, required: true }, busy: Boolean })
const emit = defineEmits(['choose', 'pending-name'])
const search = ref(''), ownedOnly = ref(false), customName = ref('')
const ownedIds = computed(() => new Set(props.accountEntries.map(entry => entry.id)))
const filtered = computed(() => props.agents.filter(agent => (!ownedOnly.value || ownedIds.value.has(agent.id)) && `${agent.name} ${agent.alias || ''}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
onBeforeUnmount(() => emit('pending-name', false))
</script>
