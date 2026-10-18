<template>
  <Teleport to="body">
    <div v-if="open" class="achievement-mask" :style="viewportStyle" @click.self="close">
      <section ref="panel" class="achievement-dialog" :class="{ 'is-short': shortViewport }" role="dialog" aria-modal="true" aria-labelledby="achievement-exchange-title" tabindex="-1" :aria-busy="working" @focusin="revealFocusedControl">
        <header><h2 id="achievement-exchange-title">导入与导出</h2><button type="button" :disabled="working" aria-label="关闭导入导出" @click="close"><X :size="18" aria-hidden="true" /></button></header>
        <div ref="scrollBody" class="achievement-dialog-body">
          <p>目标账号：<strong>{{ accountName }}</strong> · {{ game }}</p>
          <button type="button" :disabled="!canRecord || working" @click="exportFile">下载当前账号完整备份（JSON）</button>
          <p class="achievement-hint">完整备份包含历史目录记录，不受页面筛选影响。最多1000条、1MiB；仅支持 YuanHub 成就 JSON v1。</p>
          <label class="achievement-file-label">选择成就备份<input ref="fileInput" type="file" accept=".json,application/json" :disabled="!canRecord || working" @change="selectFile"></label>
          <template v-if="documentData">
            <p>{{ filename }}<span v-if="documentData.source_account?.name"> · 文件来源账号：{{ documentData.source_account.name }}（仅提示）</span></p>
            <label class="achievement-file-label">冲突处理<select v-model="strategy" :disabled="working"><option value="keep_current">保留当前冲突记录（默认）</option><option value="use_file">采用文件内容（空备注保留现有内容）</option></select></label>
            <p v-if="documentData.catalog_version !== preview?.catalog_version" class="achievement-hint">目录版本可能不同，按稳定 ID 核对，不按名称匹配。</p>
            <button type="button" :disabled="working" @click="generatePreview">{{ preview ? '重新预览' : '生成导入预览' }}</button>
          </template>
          <section v-if="preview" aria-label="成就导入预览">
            <p>新增 {{ preview.stats.add }} · 相同 {{ preview.stats.same }} · 冲突 {{ preview.stats.conflict }} · 未知 ID {{ preview.stats.unknown }} · 非法 {{ preview.stats.invalid }}</p>
            <p>最终影响 {{ preview.affected }} 条。{{ strategy === 'keep_current' ? '冲突记录保持现状。' : '确认后替换冲突字段，文件缺项不会清空现有记录。' }}</p>
            <label v-if="preview.stats.unknown" class="achievement-check"><input v-model="skipUnknown" type="checkbox" :disabled="working">我确认跳过 {{ preview.stats.unknown }} 条未知 ID</label>
            <p v-if="preview.stats.invalid" class="achievement-error">含非法记录，整份文件不会写入。请修正文件。</p>
            <details><summary>查看逐条核对结果</summary><ol class="achievement-import-items"><li v-for="item in preview.items" :key="item.index">第 {{ item.index + 1 }} 条 · {{ item.achievement_id || '无 ID' }} · {{ OUTCOMES[item.outcome] }}<span v-if="item.message">：{{ item.message }}</span></li></ol></details>
          </section>
          <p v-if="error" ref="errorPanel" class="achievement-error" role="alert" tabindex="-1">{{ error }}</p>
          <p v-if="notice" role="status">{{ notice }}</p>
        </div>
        <footer><button type="button" :disabled="working" @click="close">关闭</button><button type="button" :disabled="!canConfirm" @click="commit">{{ working ? '正在处理…' : '确认导入到此账号' }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import * as api from '../../api/achievement.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { dialog } from '../../utils/dialog.js'
import { downloadAchievementBackup, MAX_IMPORT_BYTES, readAchievementBackup } from './rules.js'

const props = defineProps({ open: Boolean, accountId: String, accountName: String, identity: String, game: String, revision: Number, contextVersion: Number, canRecord: Boolean })
const emit = defineEmits(['close', 'busy', 'committed'])
const panel = ref(null), scrollBody = ref(null), fileInput = ref(null), errorPanel = ref(null), documentData = ref(null), filename = ref(''), strategy = ref('keep_current'), skipUnknown = ref(false), preview = ref(null), working = ref(false), error = ref(''), notice = ref('')
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(computed(() => props.open), scrollBody, panel)
const OUTCOMES = { add: '新增', same: '相同', conflict: '冲突', unknown: '未知 ID', invalid: '非法' }
let generation = 0, alive = true
const capture = () => ({ generation, accountId: props.accountId, identity: props.identity, game: props.game, contextVersion: props.contextVersion })
const matches = token => alive && token.generation === generation && token.accountId === props.accountId && token.identity === props.identity && token.game === props.game && token.contextVersion === props.contextVersion
const canConfirm = computed(() => props.canRecord && !working.value && !!preview.value && !preview.value.stats.invalid && (!preview.value.stats.unknown || skipUnknown.value))
useModalFocus(computed(() => props.open), panel, { initialFocus: () => panel.value, onEscape: close, preventRestoreScroll: true })
watch(() => props.open, (visible, _, cleanup) => {
  if (!visible) return
  const overflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  cleanup(() => { document.body.style.overflow = overflow })
}, { immediate: true })
function busy(value) { working.value = value; emit('busy', value) }
function clearPreview() { preview.value = null; skipUnknown.value = false }
function reset() { generation++; clearPreview(); documentData.value = null; filename.value = ''; strategy.value = 'keep_current'; error.value = ''; notice.value = ''; busy(false); if (fileInput.value) fileInput.value.value = '' }
watch(() => props.contextVersion, reset, { flush: 'sync' })
watch(() => props.open, value => { if (!value) reset() })
watch(() => props.revision, () => { if (preview.value) { clearPreview(); notice.value = '档案已变化，请重新预览。' } })
watch(strategy, async () => { clearPreview(); if (documentData.value && !working.value) await generatePreview() })
async function showError(message) { error.value = message; await nextTick(); errorPanel.value?.focus() }
async function close() {
  if (working.value) return
  const token = capture()
  if (documentData.value && !await dialog.confirm({ title: '关闭导入预览？', message: '文件尚未导入，关闭后需要重新选择。', confirmText: '关闭预览', cancelText: '继续核对' })) return
  if (matches(token)) emit('close')
}
async function selectFile(event) {
  const file = event.target.files?.[0]
  if (!file || !props.canRecord || working.value) return
  const token = capture()
  clearPreview(); error.value = ''; notice.value = ''; documentData.value = null
  busy(true)
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('文件最多1MiB。')
    const data = readAchievementBackup(await file.text())
    if (!matches(token)) return
    if (data.game !== props.game) throw new Error('备份游戏与目标账号不匹配。')
    documentData.value = data; filename.value = file.name
  } catch (failure) { if (matches(token)) await showError(failure.message) }
  finally { if (matches(token)) { busy(false); event.target.value = '' } }
  if (matches(token) && documentData.value) await generatePreview()
}
async function generatePreview() {
  if (!props.canRecord || working.value || !documentData.value) return
  const token = capture()
  clearPreview(); error.value = ''; notice.value = ''; busy(true)
  try {
    const result = await api.previewAchievements(token.accountId, token.identity, documentData.value, strategy.value)
    if (matches(token)) preview.value = result
  } catch (failure) { if (matches(token)) await showError(failure.message || '预览失败，请重试。') }
  finally { if (matches(token)) busy(false) }
}
async function commit() {
  if (!canConfirm.value) return
  const token = capture(), plan = preview.value
  busy(true)
  try {
    if (!await dialog.confirm({ title: '确认导入成就档案？', message: `目标：${props.accountName} · ${props.game}，将影响 ${plan.affected} 条记录。${plan.strategy === 'use_file' ? '冲突字段将采用文件内容。' : '保留当前冲突记录。'}`, confirmText: '确认导入', cancelText: '返回预览' })) return
    if (!matches(token) || plan !== preview.value) return
    const result = await api.importAchievements(token.accountId, token.identity, documentData.value, plan, skipUnknown.value)
    if (!matches(token)) return
    clearPreview(); documentData.value = null
    notice.value = '导入完成，已保存到此账号。'
    emit('committed', result)
  } catch (failure) {
    if (matches(token)) {
      if (failure.status === 409) clearPreview()
      await showError(failure.message || '导入失败，请重新读取档案并预览。')
    }
  } finally { if (matches(token)) busy(false) }
}
async function exportFile() {
  if (!props.canRecord || working.value) return
  const token = capture()
  busy(true); error.value = ''; notice.value = ''
  try {
    const data = await api.exportAchievements(token.accountId, token.identity)
    if (matches(token)) { downloadAchievementBackup(data); notice.value = '已生成当前账号完整备份。' }
  } catch (failure) { if (matches(token)) await showError(failure.message || '导出失败，请重试。') }
  finally { if (matches(token)) busy(false) }
}
onScopeDispose(() => { alive = false; generation++ })
defineExpose({ hasDraft: () => !!documentData.value })
</script>
