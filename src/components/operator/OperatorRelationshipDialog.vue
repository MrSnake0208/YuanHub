<template>
  <Teleport to="body">
    <div class="relationship-mask" :style="viewportStyle" @click.self="close">
      <form ref="panel" class="relationship-editor" :class="{ 'is-short': shortViewport }" role="dialog" aria-modal="true" aria-labelledby="relationship-title" :aria-busy="saving" tabindex="-1" @submit.prevent="$emit('save')" @focusin="revealFocusedControl">
        <header><h2 id="relationship-title">{{ name }} · 编辑进度</h2><button ref="closeButton" type="button" :disabled="saving" aria-label="关闭进度编辑" @click="close"><X :size="20" aria-hidden="true" /></button></header>
        <div class="relationship-tabs" role="group" aria-label="编辑项目">
          <button v-for="(label, kind) in labels" :key="kind" type="button" :aria-pressed="tab === kind" @click="tab = kind">{{ label }}</button>
        </div>
        <div ref="body" class="relationship-dialog-body">
          <p v-if="error" ref="errorEl" class="relationship-error" role="alert" tabindex="-1">{{ error }}</p>
          <p v-if="sharedName" class="relationship-hint">与 {{ sharedName }} 共享信赖，汇总只计一次。</p>
          <p v-if="conflict" class="relationship-error">历史记录冲突：{{ conflictSources }}。请核对后统一信赖值。</p>
          <section v-show="tab === 'trust'" aria-label="信赖节点">
            <p>选择当前已达到的最高节点</p>
            <div class="relationship-values"><span>当前记录 <b>{{ conflict ? '待核对' : baseline.trust || '未记录' }}</b></span><span>待保存 <b>{{ draft.trust || '未记录' }}</b></span></div>
            <p v-if="offNode" class="relationship-hint">当前记录 {{ baseline.trust }} 不在奖励节点上；未主动选择时保留原值。</p>
            <template v-if="milestones.length">
              <fieldset class="relationship-nodes" :disabled="saving"><legend class="relationship-sr-only">选择信赖节点</legend>
                <label v-for="(node, index) in milestones" :key="node.at" class="relationship-node" :class="{ selected: draft.trust === String(node.at), reached: draft.trust !== '' && Number(draft.trust) >= node.at, connected: index < milestones.length - 1 && Number(draft.trust) >= milestones[index + 1].at }">
                  <input type="radio" name="trust-node" :value="String(node.at)" :checked="draft.trust === String(node.at)" @change="$emit('trust', String(node.at))" />
                  <strong>{{ node.at }}</strong><span>{{ rewardText(node.rewards) || '无物品奖励' }}</span>
                </label>
              </fieldset>
            </template>
            <label v-else class="relationship-field">信赖值<input :value="draft.trust" inputmode="numeric" :disabled="saving" placeholder="未记录" @input="$emit('trust', $event.target.value)" /><small>奖励节点资料待补，可先记录游戏内数值。</small></label>
            <p class="relationship-hint">选择节点仅记录进度，不代表奖励已领取。差距不含突破材料要求。</p>
            <div class="relationship-special" role="group" aria-label="特殊信赖状态">
              <button type="button" :aria-pressed="draft.trust === ''" :disabled="saving" @click="$emit('trust', '')">未记录</button>
              <button type="button" :aria-pressed="draft.trust === '0'" :disabled="saving" @click="$emit('trust', '0')">0 · 尚未达首档</button>
            </div>
            <label v-if="conflict" class="relationship-trust-confirm"><input type="checkbox" :checked="resolveTrust" :disabled="saving" @change="$emit('resolve', $event.target.checked)" />已核对，按所选值统一共享信赖（未记录将清除本组信赖）</label>
          </section>
          <section v-show="tab === 'rumors'" aria-label="传闻数量">
            <label class="relationship-field">传闻数量<input :value="draft.rumors" inputmode="numeric" :disabled="saving" placeholder="未记录" @input="$emit('rumors', $event.target.value)" /></label>
            <p class="relationship-hint">留空为未记录，0 表示明确为零。传闻录入不会自动增加信赖值。</p>
            <p>{{ rumorRule ? '已收录上限：' + rumorRule.max : '传闻总数与奖励资料待核准，暂不计入奖励汇总。' }}</p>
            <ul v-if="rumorRule" class="relationship-rumor-rewards"><li v-for="node in rumorRule.milestones" :key="node.at">{{ node.at }}：{{ rewardText(node.rewards) || '无物品奖励' }}</li></ul>
          </section>
          <details v-if="activeRule" class="relationship-source"><summary>奖励档位与依据</summary><p>{{ activeRule.complete ? '已核准完整规则' : '资料未补齐，不计入收益' }} · {{ activeRule.verified_on }}</p><p>{{ activeRule.source }}</p></details>
        </div>
        <footer>
          <div class="relationship-next" aria-live="polite">{{ nextText }}</div>
          <div class="relationship-actions"><button type="button" :disabled="saving" @click="close">取消</button><button type="submit" class="primary" :disabled="!ready || !dirty">{{ saving ? '保存中…' : '保存进度' }}</button></div>
          <small v-if="!dirty">尚未修改</small>
          <button v-if="!ready && !saving" type="button" @click="$emit('reload')">重新读取并核对</button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>
<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { relationshipProgress } from '../../utils/operatorRelationships.js'
const props = defineProps({ name: String, draft: Object, baseline: Object, trustRule: Object, rumorRule: Object, saving: Boolean, ready: Boolean, dirty: Boolean, error: String, sharedName: String, conflict: Boolean, conflictSources: String, resolveTrust: Boolean })
const emit = defineEmits(['trust', 'rumors', 'resolve', 'save', 'close', 'reload'])
const labels = { trust: '信赖节点', rumors: '传闻数量' }
const panel = ref(null), body = ref(null), closeButton = ref(null), errorEl = ref(null), tab = ref('trust')
const visible = ref(true)
const milestones = computed(() => props.trustRule?.milestones || [])
const offNode = computed(() => props.baseline.trust !== '' && Number(props.baseline.trust) !== 0 && milestones.value.length && !milestones.value.some(node => node.at === Number(props.baseline.trust)))
const activeRule = computed(() => tab.value === 'trust' ? props.trustRule : props.rumorRule)
const rewardText = rewards => rewards.map(item => item.name + ' × ' + item.quantity).join('、')
const nextText = computed(() => {
  const raw = props.draft[tab.value]
  if (raw === '') return '未记录进度，暂不估算奖励'
  if (!/^\d+$/.test(raw)) return '请填写非负整数'
  const result = relationshipProgress(Number(raw), activeRule.value)
  if (result.status === 'missing') return '奖励资料待补，暂不估算'
  if (result.status === 'invalid') return '记录超过上限，请核对'
  return result.next ? '下一档：' + result.next.at + ' · ' + (rewardText(result.next.rewards) || '无物品奖励') : '已达到全部已收录奖励条件'
})
function close() { if (!props.saving) emit('close') }
useModalFocus(visible, panel, { initialFocus: () => closeButton.value, onEscape: close, preventRestoreScroll: true })
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(visible, body, panel)
const previousOverflow = document.body.style.overflow
document.body.style.overflow = 'hidden'
onScopeDispose(() => { document.body.style.overflow = previousOverflow })
watch(() => props.error, async message => { if (message) { await nextTick(); errorEl.value?.focus() } })
</script>
<style scoped src="./operatorRelationshipDialogMobile.css"></style>
<style scoped src="./operatorRelationshipDialogDesktop.css"></style>
