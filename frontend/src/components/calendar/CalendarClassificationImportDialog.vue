<template>
  <Teleport to="body">
    <div class="calendar-page calendar-import-mask" @click.self="close">
      <section ref="panel" class="calendar-import-dialog" role="dialog" aria-modal="true" aria-labelledby="classification-import-title" tabindex="-1" :aria-busy="busy">
        <header class="calendar-import-head"><h2 id="classification-import-title" ref="heading" tabindex="-1">导入更新分类</h2><button type="button" :disabled="busy" @click="close">关闭</button></header>
        <div class="calendar-import-body">
          <p>先通过“导出全部”下载资料，只修改 classification 中的中文一级、二级分类。其他资料仅供参考，不会覆盖；文件中缺少的活动不会删除。</p>
          <p class="calendar-hint">分类按文件中的 classification_options 选择；待归类记录保留原编码，不按标题推断。保留 classification: null 表示不更新。只读卡池请到招募目录维护。UTF-8 JSON · 最多 10000 条 / 20 MiB。</p>
          <label class="calendar-import-file">选择分类文件<input ref="fileInput" type="file" accept=".json,application/json" :disabled="busy" @change="chooseFile"></label>
          <label class="calendar-import-input">或粘贴导出文件<textarea v-model="text" rows="5" spellcheck="false" :disabled="busy" /></label>
          <p v-if="busy" role="status">{{ operation === 'commit' ? '正在更新分类，请保持窗口打开…' : '正在读取和校验…' }}</p>
          <div v-if="error" ref="errorSummary" role="alert" class="calendar-panel calendar-error" tabindex="-1">{{ error }}</div>
          <template v-if="report">
            <div ref="summary" class="calendar-panel" role="status" tabindex="-1">
              <p v-if="finished">已更新 {{ report.updated }} 条分类。</p>
              <p v-else>共 {{ report.total }} 条 · 待更新 {{ report.ready }} · 未变更 {{ report.unchanged }} · 不更新 {{ report.skipped }} · 无效 {{ report.invalid }} · 冲突 {{ report.conflicts }}。</p>
              <p>另有 {{ report.reference_count }} 条只读卡池参考，不参与更新。</p>
              <p v-if="report.invalid || report.conflicts">请修正文件或重新导出；当前整批不能提交。</p>
              <p v-else-if="!report.ready && !finished">无需更新。</p>
            </div>
            <ol class="calendar-import-rows" aria-label="分类更新预览">
              <li v-for="row in pageRows" :key="row.row" class="calendar-panel">
                <h3>第 {{ row.row }} 条 · {{ row.title }}</h3>
                <p>{{ labels[row.status] || row.status }} · {{ row.id }}</p>
                <p>{{ classificationLabel(row.before) }} → {{ row.after ? classificationLabel(row.after) : '不更新' }}</p>
                <p v-if="row.issue" class="calendar-error">{{ row.issue }}</p>
              </li>
            </ol>
            <nav class="calendar-actions" aria-label="预览分页"><button type="button" :disabled="page === 1 || busy" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button type="button" :disabled="page >= pages || busy" @click="page++">下一页</button></nav>
          </template>
        </div>
        <footer class="calendar-import-footer">
          <label v-if="canCommit" class="calendar-checkbox"><input v-model="confirmed" type="checkbox" :disabled="busy">已核对分类差异，确认仅更新这些活动的分类</label>
          <div class="calendar-actions"><button type="button" :disabled="busy || !text" @click="validate">校验并预览</button><button type="button" class="calendar-primary" :disabled="busy || !canCommit || !confirmed" @click="commit">确认更新分类</button></div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { previewCalendarClassification, commitCalendarClassification } from '@/api/activityCalendar.js'
import { readClassificationFile, checkClassificationText } from '@/data/activityCalendarClassificationExchange.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'
const emit = defineEmits(['close', 'updated'])
const text = ref(''), report = ref(null), preview = ref(null), operation = ref(''), error = ref(''), confirmed = ref(false), finished = ref(false), page = ref(1)
const panel = ref(null), heading = ref(null), summary = ref(null), errorSummary = ref(null), fileInput = ref(null), visible = ref(true)
const busy = computed(() => !!operation.value)
const canCommit = computed(() => !!preview.value?.ready && !preview.value.invalid && !preview.value.conflicts && !finished.value)
const pages = computed(() => Math.max(1, Math.ceil((report.value?.rows.length || 0) / 10)))
const pageRows = computed(() => report.value?.rows.slice((page.value - 1) * 10, page.value * 10) || [])
const confirmDiscard = useUnsavedChanges(computed(() => !!text.value && !finished.value), '分类更新文件')
const labels = { READY: '待更新', UNCHANGED: '未变更', SKIPPED: '不更新', INVALID: '无效', CONFLICT: '版本冲突', UPDATED: '已更新' }
const classificationLabel = value => value ? `${value.level1} / ${value.level2}` : '待归类（保留原分类）'
let alive = true
useModalFocus(visible, panel, { initialFocus: () => heading.value, onEscape: () => void close() })
const bodyOverflow = document.body.style.overflow, rootOverflow = document.documentElement.style.overflow
document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
function resetPreview() { preview.value = null; report.value = null; confirmed.value = false; finished.value = false; page.value = 1 }
watch(text, () => { resetPreview(); error.value = '' }, { flush: 'sync' })
async function close() { if (!busy.value && await confirmDiscard() && alive) { visible.value = false; emit('close') } }
async function showError(message) { error.value = message; await nextTick(); if (alive) errorSummary.value?.focus() }
async function chooseFile(event) {
  const file = event.target.files?.[0]
  if (!file || busy.value) return
  resetPreview(); operation.value = 'file'; error.value = ''
  try { const value = await readClassificationFile(file); if (alive) text.value = value }
  catch (err) { if (alive) await showError(err.message) }
  finally { if (alive) { operation.value = ''; fileInput.value.value = '' } }
}
async function validate() {
  if (busy.value) return
  resetPreview(); operation.value = 'preview'; error.value = ''
  const source = text.value
  try {
    checkClassificationText(source)
    const result = await previewCalendarClassification(source)
    if (!alive || text.value !== source) return
    preview.value = report.value = result
    await nextTick(); if (alive) summary.value?.focus()
  } catch (err) { if (alive) await showError(err.message || '预览失败，请重试。') }
  finally { if (alive) operation.value = '' }
}
async function commit() {
  if (busy.value || !canCommit.value || !confirmed.value) return
  operation.value = 'commit'; error.value = ''
  try {
    const result = await commitCalendarClassification(text.value, preview.value.preview_token)
    if (!alive) return
    report.value = result; preview.value = null; confirmed.value = false; finished.value = true
    emit('updated')
    await nextTick(); if (alive) summary.value?.focus()
  } catch (err) {
    if (!alive) return
    preview.value = null; confirmed.value = false
    emit('updated')
    await showError((err.message || '更新结果未确认。') + ' 请重新预览文件后核对实际结果，不要重复提交旧预览。')
  } finally { if (alive) operation.value = '' }
}
onBeforeUnmount(() => { alive = false; document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = rootOverflow })
</script>

<style src="../../pages/calendar/calendar.css"></style>
<style src="../../pages/calendar/calendarDesktop.css"></style>
<style src="../../pages/calendar/calendarMobile.css"></style>
<style scoped>
.calendar-import-mask { background: var(--theme-overlay, rgba(73, 59, 44, .35)); }
.calendar-import-dialog { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }
.calendar-import-head, .calendar-import-footer { border-color: var(--line); }
.calendar-import-rows p { overflow-wrap: anywhere; }
</style>
<style scoped src="./calendarImportDialogDesktop.css"></style>
<style scoped src="./calendarImportDialogMobile.css"></style>
