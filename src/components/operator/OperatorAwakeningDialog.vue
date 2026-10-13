<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-mask is-raised awakening-mask" @click.self="close">
      <section ref="panel" class="awakening-panel" role="dialog" aria-modal="true" aria-labelledby="awakening-title" aria-describedby="awakening-help" :aria-busy="pending" tabindex="-1">
        <h2 id="awakening-title">{{ entry.name }} · {{ unknown ? '确认觉醒状态' : '记录已觉醒' }}</h2>
        <p id="awakening-help">仅记录在游戏中已完成的状态，不由 Hub 扣除材料。觉醒材料与解锁条件尚待核实，暂不估算成本或完成日期。</p>
        <p v-if="unknown">当前觉醒状态待确认；请选择你在游戏内核实的结果，也可以取消保留未知。</p>
        <p v-if="error" ref="errorEl" class="awakening-error" role="alert" tabindex="-1">{{ error }}</p>
        <p v-if="pending" role="status">{{ syncing ? '正在同步最新养成…' : '正在保存觉醒记录…' }}</p>
        <div class="awakening-actions">
          <button ref="cancelEl" type="button" :disabled="pending" @click="close">取消</button>
          <button v-if="syncRequired" type="button" :disabled="pending" @click="syncCurrent">重新同步</button>
          <template v-else>
            <button v-if="unknown" type="button" :disabled="pending || !canRecord" @click="save(false)">确认未觉醒</button>
            <button type="button" class="primary" :disabled="pending || !canRecord" @click="save(true)">确认已在游戏中觉醒</button>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { patchOperatorCurrent } from '../../api/operator.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { operatorHuaji, operatorHuajiAction } from '../../utils/operatorHuaji.js'

const props = defineProps({
  entry: { type: Object, required: true },
  accountId: { type: String, required: true },
  game: { type: String, required: true },
  refresh: { type: Function, required: true },
})
const emit = defineEmits(['close', 'saved'])
const pending = ref(false), syncing = ref(false), syncRequired = ref(false), error = ref('')
const panel = ref(null), cancelEl = ref(null), errorEl = ref(null)
const visible = computed(() => Boolean(props.entry && props.accountId))
const unknown = computed(() => operatorHuaji(props.entry).awakened == null)
const canRecord = computed(() => operatorHuajiAction(props.entry).kind === 'awakening')
const account = props.accountId, game = props.game, id = props.entry.id
let disposed = false, contextChanged = false
const current = () => !disposed && !contextChanged && props.accountId === account && props.game === game && props.entry?.id === id
watch([() => props.accountId, () => props.game, () => props.entry?.id], () => { contextChanged = true; emit('close') }, { flush: 'sync' })
onScopeDispose(() => { disposed = true })
function close() { if (!pending.value) emit('close') }
useModalFocus(visible, panel, { initialFocus: () => cancelEl.value, onEscape: close })
watch(error, async value => { if (value) { await nextTick(); if (current()) errorEl.value?.focus() } })

async function syncCurrent() {
  if (!current() || pending.value) return
  pending.value = true
  syncing.value = true
  try {
    const latest = await props.refresh(id)
    if (!current()) return
    if (!latest) throw new Error('同步失败，请重试后再确认觉醒状态')
    syncRequired.value = false
    error.value = operatorHuaji(latest).awakened === true ? '最新记录已确认觉醒，无需重复保存。' : '养成版本已同步，请核对后重新确认。'
  } catch (err) {
    if (current()) { syncRequired.value = true; error.value = err.message || '同步失败，请重试' }
  } finally {
    if (current()) { pending.value = false; syncing.value = false }
  }
}

async function save(awakened) {
  if (!current() || pending.value || syncRequired.value || !canRecord.value) return
  pending.value = true
  error.value = ''
  try {
    const payload = await patchOperatorCurrent({ accountId: account, operatorId: id, game,
      patch: { expected_revision: Number(props.entry.revision) || 0, reason: 'manual_correction', huaji: { awakened } } })
    if (current()) emit('saved', { operatorId: id, payload })
  } catch (err) {
    if (!current()) return
    if (err.status === 409 || err.code === 'operator_revision_conflict') {
      syncRequired.value = true
      pending.value = false
      await syncCurrent()
    } else error.value = err.message || '觉醒记录保存失败，请重试；原状态未改变。'
  } finally {
    if (current()) pending.value = false
  }
}
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.awakening-panel { border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); }
.awakening-error { color: var(--rouge); }
button { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); cursor: pointer; }
button.primary { background: var(--tea); color: var(--cream); }
button:disabled { cursor: default; opacity: .6; }
button:focus-visible, .awakening-error:focus { outline: 2px solid var(--tea); outline-offset: 3px; }
button:active:not(:disabled) { opacity: .8; }
</style>
<style scoped src="./operatorAwakeningDialogDesktop.css"></style>
<style scoped src="./operatorAwakeningDialogMobile.css"></style>
