<template>
  <section class="deadline-journey" aria-labelledby="deadline-journey-title">
    <header class="deadline-heading">
      <div><h4 id="deadline-journey-title">给计划多一点余地</h4><p>逐天探索完成期限，点开方案看看每天怎么安排。</p></div>
      <span class="deadline-count"><Check :size="14" aria-hidden="true" />{{ readyCount }} 个期限有方案</span>
    </header>
    <p class="deadline-limit">先利用可用储备，再计算缺口 · 每日额外补充最多 {{ extraLimit.toLocaleString() }} 体力（估算）</p>
    <TransitionGroup ref="trackRef" name="deadline-step" tag="ol" class="deadline-track" aria-label="按完成期限排列的补足方案">
      <li v-for="group in groups" :key="group.days" :ref="element => setDeadlineNode(group.days, element)" class="deadline-node" :class="group.state">
        <div class="deadline-square">
          <span class="deadline-caption">{{ group.days === targetDays ? '原定期限' : `宽限 ${group.days - targetDays} 天` }}</span>
          <div class="deadline-date"><strong>{{ group.days }}</strong><span>天内</span></div>
          <div class="deadline-state">
            <component :is="stateIcon(group.state)" :size="17" :stroke-width="1.7" aria-hidden="true" />
            <span>{{ stateLabel(group.state) }}</span>
          </div>
        </div>
        <TransitionGroup name="deadline-option" tag="div" class="deadline-options">
          <button v-for="option in group.solutions" :key="option.id" type="button" class="deadline-chip"
            :aria-pressed="selected === option.id" :aria-label="`${group.days} 天内，${option.title.split(' · ')[1]}，${summary(option)}`"
            @click="$emit('select', option.id)">
            <span class="deadline-option-title">{{ option.title.split(' · ')[1] }}<Check v-if="selected === option.id" :size="15" aria-hidden="true" /><ChevronRight v-else :size="15" aria-hidden="true" /></span>
            <span class="deadline-extra"><b>{{ results[option.id].solution.requiredExtra ? '+' + results[option.id].solution.requiredExtra.toLocaleString() : '无需' }}</b>额外体力</span>
            <span class="deadline-option-note">{{ results[option.id].solution.totalCoins.toLocaleString() }} 白金币 · 领取储备 {{ results[option.id].solution.totalReserveUsed.toLocaleString() }}</span>
          </button>
        </TransitionGroup>
      </li>
    </TransitionGroup>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronRight, Ellipsis, Smile, Frown, CircleHelp } from '@lucide/vue'

const props = defineProps({ groups: { type: Array, required: true }, results: { type: Object, required: true }, selected: String, targetDays: Number, extraLimit: Number })
defineEmits(['select'])
const readyCount = computed(() => props.groups.filter(group => group.solutions.length).length)
const stateIcon = state => ({ computing: Ellipsis, ready: Smile, infeasible: Frown, unknown: CircleHelp }[state])
const stateLabel = state => ({ computing: '认真计算中', ready: '找到方案啦', infeasible: '暂不可行', unknown: '还未确定' }[state])
const summary = option => `补充 ${props.results[option.id].solution.requiredExtra || 0} 体力，${props.results[option.id].solution.totalCoins} 白金币`

const trackRef = ref(null)
const deadlineNodes = new Map()
let followFrame = 0
function setDeadlineNode(days, element) {
  if (element) deadlineNodes.set(days, element)
  else deadlineNodes.delete(days)
}
function followDeadline(days) {
  const track = trackRef.value?.$el || trackRef.value
  const node = deadlineNodes.get(days)
  if (!track || !node) return
  const trackRect = track.getBoundingClientRect()
  const nodeRect = node.getBoundingClientRect()
  const target = track.scrollLeft + nodeRect.left - trackRect.left - (track.clientWidth - nodeRect.width) / 2
  const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth)
  const left = Math.max(0, Math.min(target, maxScrollLeft))
  const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: reducedMotion ? 'auto' : 'smooth' })
  else track.scrollLeft = left
}
watch(
  () => props.groups.map(group => `${group.days}:${group.state}`).join('|'),
  (signature, previousSignature) => {
    if (!signature || signature === previousSignature) return
    const activeGroup = props.groups.find(group => group.state === 'computing')
    if (!activeGroup) return
    nextTick(() => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.cancelAnimationFrame(followFrame)
        followFrame = window.requestAnimationFrame(() => followDeadline(activeGroup.days))
      } else followDeadline(activeGroup.days)
    })
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(followFrame)
})
</script>

<style scoped>
.deadline-journey { --deadline-ease: cubic-bezier(.22, 1, .36, 1); margin-top: 20px; padding: 20px 18px 8px; border: 1px solid var(--planner-line); border-radius: 20px; background: var(--cream); color: var(--ink); min-width: 0; }
.deadline-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h4 { margin: 0; font: 900 16px 'Noto Serif SC', serif; letter-spacing: .04em; color: var(--tea); }
p { margin: 6px 0 0; font-size: 12px; line-height: 1.7; }
.deadline-count { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--planner-line); border-radius: 20px; font-size: 12px; background: var(--surface); }
.deadline-limit { margin-top: 12px; }
.deadline-track { display: flex; align-items: flex-start; gap: 16px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; scrollbar-width: thin; scrollbar-color: var(--accent) transparent; list-style: none; margin: 0; padding: 22px 4px 18px; }
.deadline-node { position: relative; flex: 0 0 208px; min-width: 0; scroll-snap-align: start; }
.deadline-node:not(:last-child)::after { content: ''; position: absolute; top: 67px; left: 100%; width: 16px; border-top: 1px dashed var(--accent); opacity: .5; }
.deadline-square { position: relative; display: grid; justify-items: center; gap: 8px; padding: 18px 12px 12px; border: 1px solid var(--planner-line); border-radius: 17px; background: var(--surface); box-shadow: 0 3px 0 var(--paper); }
.deadline-square::before, .deadline-square::after { content: ''; position: absolute; top: -6px; width: 5px; height: 13px; border: 1px solid var(--planner-line); border-radius: 4px; background: var(--paper); }
.deadline-square::before { left: 28px; }.deadline-square::after { right: 28px; }
.deadline-caption { font-size: 12px; letter-spacing: .08em; }
.deadline-date { display: flex; align-items: baseline; gap: 5px; }
.deadline-date strong { font: 600 32px/1.1 Archivo, sans-serif; font-variant-numeric: tabular-nums; letter-spacing: -.04em; }
.deadline-date > span { font-size: 12px; }
.deadline-state { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 25px; font-size: 12px; }
.ready .deadline-state { background: var(--yellow); border-radius: 20px; padding: 0 9px; }
.ready .deadline-square { border-color: var(--accent); }
.ready .deadline-state svg { animation: deadline-found 360ms var(--deadline-ease); }
.computing .deadline-square { border-color: var(--accent); }
.computing .deadline-state svg { animation: deadline-thinking 900ms ease-in-out 3; }
.infeasible .deadline-square { background: transparent; box-shadow: none; border-style: dashed; }
.deadline-options { display: grid; gap: 8px; margin-top: 12px; }
.deadline-chip { display: grid; gap: 8px; width: 100%; min-height: 44px; padding: 12px; text-align: left; border: 1px solid var(--planner-line); border-radius: 13px; background: var(--surface); color: var(--tea); font: inherit; cursor: pointer; touch-action: manipulation; transition: transform 160ms var(--deadline-ease), background-color 160ms ease-out; }
.deadline-option-title { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; line-height: 1.5; }
.deadline-option-title svg { flex-shrink: 0; }
.deadline-extra { display: flex; align-items: baseline; gap: 5px; font-size: 12px; }
.deadline-extra b { font: 600 18px Archivo, 'PingFang SC', 'Microsoft YaHei', sans-serif; font-variant-numeric: tabular-nums; }
.deadline-option-note { font-size: 12px; line-height: 1.5; }
.deadline-chip[aria-pressed='true'] { border-color: var(--accent); background: var(--cream); box-shadow: inset 3px 0 0 var(--accent); }
.deadline-chip:active { transform: scale(.98); transition-duration: 0ms; }
.deadline-chip:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 3px; transition: none; }
.deadline-empty { padding: 0 4px; }
@media (hover: hover) and (pointer: fine) { .deadline-chip:hover { transform: translateY(-2px); background: var(--cream); } .deadline-chip:active { transform: scale(.98); } .deadline-chip:focus-visible { transform: none; } }
.deadline-step-enter-active, .deadline-option-enter-active { transition: opacity 240ms var(--deadline-ease), transform 240ms var(--deadline-ease); }
.deadline-step-leave-active, .deadline-option-leave-active { transition: opacity 120ms ease-out; }
.deadline-step-enter-from { opacity: 0; transform: translateX(10px); }
.deadline-option-enter-from { opacity: 0; transform: translateY(6px); }
.deadline-step-leave-to, .deadline-option-leave-to { opacity: 0; }
@keyframes deadline-found { 0% { transform: rotate(-12deg) scale(.85); } 60% { transform: rotate(6deg) scale(1.08); } 100% { transform: none; } }
@keyframes deadline-thinking { 50% { opacity: .45; transform: translateY(-2px); } }
@media (prefers-reduced-motion: reduce) { .deadline-journey *, .deadline-journey *::before, .deadline-journey *::after { animation: none !important; transition: none !important; } .deadline-chip:hover, .deadline-chip:active, .deadline-step-enter-from, .deadline-option-enter-from { transform: none; } }
@media (max-width: 640px) {
  .deadline-journey { margin: 8px 0; padding: 12px 10px 0; border-radius: 10px; }
  .deadline-heading { gap: 6px; }
  h4 { font-size: 15px; }
  .deadline-heading p { margin-top: 4px; line-height: 1.5; }
  .deadline-count { padding: 3px 7px; border-radius: 5px; }
  .deadline-limit { margin-top: 8px; line-height: 1.5; color: var(--ink-60); }
  .deadline-track { gap: 10px; padding: 16px 2px 12px; }
  .deadline-node { flex-basis: 168px; }
  .deadline-node:not(:last-child)::after { top: 48px; width: 10px; }
  .deadline-square { gap: 5px; padding: 12px 8px 8px; border-radius: 10px; }
  .deadline-caption { letter-spacing: .02em; }
  .deadline-date strong { font-size: 26px; }
  .deadline-state { min-height: 22px; gap: 4px; }
  .deadline-options { gap: 6px; margin-top: 8px; }
  .deadline-chip { gap: 5px; padding: 8px; border-radius: 8px; }
  .deadline-extra b { font-size: 17px; }
}
</style>
