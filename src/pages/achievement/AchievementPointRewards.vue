<template>
  <section class="achievement-points" :class="{ 'is-expanded': expanded }" :aria-label="`${categoryName}积分奖励`">
    <div class="achievement-points-header">
      <div class="achievement-points-current">
        <span v-if="expanded" class="achievement-points-label">分类积分</span>
        <p><span>{{ track.itemName }}</span> <strong>{{ score === null ? '—' : score }}</strong> 分</p>
        <small v-if="expanded">{{ explanation }}</small>
      </div>
      <div class="achievement-points-next">
        <template v-if="score !== null">
          <span>已达标 {{ reached }} / {{ track.tiers.length }} 档</span>
          <p v-if="next">距下一档还差 <strong>{{ next.at - score }}</strong> 分</p>
          <p v-else>全部档位已达标</p>
        </template>
        <span v-else-if="!expanded">{{ explanation }}</span>
      </div>
      <button v-if="!alwaysExpanded" type="button" class="achievement-points-toggle" :aria-expanded="expanded" :aria-controls="detailsId" @click="open = !open">
        {{ expanded ? '收起奖励' : '查看奖励' }}<ChevronDown :size="14" aria-hidden="true" />
      </button>
    </div>
    <div v-if="expanded" :id="detailsId">
      <div class="achievement-points-track">
        <div v-if="track.tiers.length <= 4" class="achievement-points-line" aria-hidden="true"><i :style="{ width: `${fill}%` }"></i></div>
        <ol class="achievement-points-tiers" :style="{ '--tier-count': Math.min(track.tiers.length, 4) }">
          <li v-for="tier in track.tiers" :key="tier.at" :class="{ 'is-reached': score !== null && score >= tier.at, 'is-next': next?.at === tier.at }">
            <span class="achievement-points-node" aria-hidden="true"><Check v-if="score !== null && score >= tier.at" :size="16" /></span>
            <b>{{ tier.at }} 分</b>
            <span class="achievement-points-reward"><component :is="icons[tier.icon]" :size="24" aria-hidden="true" /><span>{{ tier.name }} ×{{ tier.quantity }}</span></span>
            <span class="achievement-points-state">{{ score === null ? '待核对' : score >= tier.at ? '已达标' : '未达标' }}</span>
          </li>
        </ol>
      </div>
      <p class="achievement-points-footnote">积分按本类全部已完成成就汇总，不受筛选影响；达标不代表游戏内已领取。</p>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, useId } from 'vue'
import { pointTrackFill } from './pointRewards.js'
import { Check, ChevronDown, Coins, Frame, ScrollText, Ticket } from '@lucide/vue'

const props = defineProps({
  categoryName: { type: String, required: true },
  track: { type: Object, required: true },
  points: { type: Number, default: null },
  recordState: { type: String, default: 'unavailable' },
  alwaysExpanded: Boolean
})
const icons = { coins: Coins, ticket: Ticket, title: ScrollText, frame: Frame }
const open = ref(false)
const detailsId = useId()
const expanded = computed(() => props.alwaysExpanded || open.value)
const score = computed(() => props.recordState === 'ready' ? props.points : null)
const reached = computed(() => score.value === null ? 0 : props.track.tiers.filter(tier => score.value >= tier.at).length)
const next = computed(() => score.value === null ? null : props.track.tiers.find(tier => tier.at > score.value))
const explanation = computed(() => ({ loading: '正在读取账号记录…', error: '账号记录读取失败，请重试', unavailable: '选择游戏账号后查看积分' }[props.recordState] || (score.value === null ? '已完成成就的奖励资料待补齐，暂无法计算' : '按已完成记录估算')))
const fill = computed(() => pointTrackFill(score.value, props.track.tiers))
</script>

<style src="./achievementPointRewardsShared.css"></style>
<style src="./achievementPointRewardsMobile.css"></style>
<style src="./achievementPointRewardsDesktop.css"></style>
