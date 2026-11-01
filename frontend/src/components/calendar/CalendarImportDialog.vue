<template>
  <Teleport to="body">
    <div class="calendar-page calendar-import-mask" @click.self="close">
      <section ref="panel" class="calendar-import-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-import-title" tabindex="-1" :aria-busy="busy">
        <header class="calendar-import-head">
          <h2 id="calendar-import-title" ref="heading" tabindex="-1">批量导入活动</h2>
          <button type="button" :disabled="busy" aria-label="关闭批量导入" @click="close">关闭</button>
        </header>
        <div class="calendar-import-body">
          <p class="calendar-hint"><strong>新活动默认公开；已有活动跳过、不覆盖。</strong>仅支持手工活动，不导入卡池或招募。</p>
          <a href="/examples/activity-calendar-v1.json" download>下载 JSON v1 示例（2 条活动）</a>
          <details class="calendar-hint"><summary>JSON 格式与分类说明</summary><p>细分类别可选，旧 JSON 仍可导入；新版历练/洞窟使用 ACTIVITY / TRIAL_CAVE，旧家具细目继续兼容。已有活动的分类差异只提示，请到目录编辑补全。</p></details>
          <label class="calendar-import-file">选择 .json 文件<input ref="fileInput" type="file" accept=".json,application/json" :disabled="busy" @change="chooseFile"></label>
          <p class="calendar-hint">UTF-8 JSON · 每批 1–200 条 · 最大 1 MiB · 默认北京时间</p>
          <label class="calendar-import-input" for="calendar-import-json">或直接粘贴 JSON
            <textarea id="calendar-import-json" ref="input" v-model="text" rows="5" spellcheck="false" :disabled="busy" :aria-invalid="!!error" :aria-describedby="error ? 'calendar-import-error' : undefined" placeholder='{"schema_version":1,"items":[…]}'></textarea>
          </label>
          <div v-if="error" id="calendar-import-error" ref="errorSummary" class="calendar-panel calendar-error" role="alert" tabindex="-1"><p>{{ error }}</p><a href="#calendar-import-json" @click.prevent="input?.focus()">返回 JSON 输入</a></div>
          <p v-if="busy" role="status">{{ operation === 'commit' ? '正在导入，请保持此窗口打开…' : operation === 'file' ? '正在读取文件…' : '正在服务器校验…' }}</p>
          <template v-if="report">
            <div ref="summary" class="calendar-panel" :role="report.invalid || report.conflicts || report.failed ? 'alert' : 'status'" tabindex="-1">
              <p v-if="finished"><strong>{{ report.failed ? '部分导入未确认' : '导入处理完成' }}</strong>：已创建 {{ report.created }}，已存在跳过 {{ report.existing }}，文件内重复 {{ report.duplicates }}，失败/未确认 {{ report.failed }}。</p>
              <p v-else>共 {{ report.total }} 条 · 待新建 {{ report.ready }} · 已存在 {{ report.existing }} · 文件内重复 {{ report.duplicates }} · 错误/冲突 {{ report.invalid + report.conflicts }}。</p>
              <p>{{ finished ? '本次新建并公开' : '将新建并公开' }} {{ report.public_count }} 条；已有活动保持原状态。</p>
              <p v-if="report.invalid || report.conflicts">整批暂不能提交，请按条目号和字段修正 JSON 后重新预览。</p>
              <p v-if="report.failed">保留原 JSON，重新校验后安全重试；已创建活动会跳过。未确认的写入可能已成功，请以重新预览为准。</p>
              <p v-else-if="finished">可关闭此窗口查看活动目录，或替换 JSON 导入下一批。</p>
            </div>
            <label class="calendar-import-filter">查看条目<select v-model="filter" :disabled="busy"><option value="all">全部（{{ report.total }}）</option><option value="issues">错误与差异提示（{{ issueCount }}）</option></select></label>
            <ol class="calendar-import-rows" aria-label="逐条导入结果">
              <li v-for="row in pageRows" :key="row.row" class="calendar-panel">
                <div class="calendar-badges"><span>第 {{ row.row }} 条</span><span class="calendar-state">{{ labels[row.status] || row.status }}</span><span>{{ row.game || '游戏未填写' }}</span></div>
                <h3>{{ row.title || '标题未填写' }}</h3>
                <p v-if="row.data" class="calendar-range">{{ calendarRangeLabel(row.data) }} · {{ row.data.time_zone }} · {{ calendarDisplay(row.data).path }} · {{ row.data.enabled ? '公开' : '停用' }}</p>
                <ul v-if="row.issues.length" class="calendar-import-issues"><li v-for="(issue, index) in row.issues" :key="index"><strong>{{ issue.field }}</strong>：{{ issue.message }}</li></ul>
                <details v-if="row.data"><summary>规范化详情</summary><p>说明：{{ row.data.description || '无' }}</p><p>来源：{{ row.data.source_url || '无' }}</p><p>内部备注：{{ row.data.source_note || '无' }}</p></details>
              </li>
            </ol>
            <p v-if="!pageRows.length">没有此类条目。</p>
            <nav class="calendar-actions" aria-label="预览分页"><button type="button" :disabled="page === 1 || busy" @click="changePage(-1)">上一页</button><span aria-live="polite">{{ page }} / {{ pages }} 页（每页 10 条）</span><button type="button" :disabled="page >= pages || busy" @click="changePage(1)">下一页</button></nav>
          </template>
        </div>
        <footer class="calendar-import-footer">
          <label v-if="preview && !finished" class="calendar-checkbox"><input v-model="confirmed" type="checkbox" :disabled="busy || blocked">我已核对预览，同意创建并公开其中 {{ preview.public_count }} 条活动；重复项跳过，不覆盖。</label>
          <div class="calendar-actions">
            <button type="button" :disabled="busy || !text.trim()" @click="validate">校验并预览</button>
            <button type="button" class="calendar-primary" :disabled="busy || !preview || finished || blocked || !confirmed" @click="commit">{{ operation === 'commit' ? '导入中…' : '确认导入' }}</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { calendarDisplay } from '@/data/activityCalendarTypes.js'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { previewActivityCalendarImport, commitActivityCalendarImport } from '@/api/activityCalendar.js'
import { checkCalendarImportText, readCalendarImportFile } from '@/data/activityCalendarImport.js'
import { calendarRangeLabel } from '@/data/activityCalendar.js'
import { useModalFocus } from '@/composables/useModalFocus.js'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges.js'

const emit = defineEmits(['close', 'imported'])
const text = ref(''), preview = ref(null), report = ref(null), confirmed = ref(false), finished = ref(false)
const operation = ref(''), error = ref(''), filter = ref('all'), page = ref(1)
const panel = ref(null), heading = ref(null), input = ref(null), fileInput = ref(null), summary = ref(null), errorSummary = ref(null), visible = ref(true)
const busy = computed(() => !!operation.value)
const blocked = computed(() => !preview.value || preview.value.invalid > 0 || preview.value.conflicts > 0)
const dirty = computed(() => busy.value || (!!text.value && (!finished.value || !!report.value?.failed)))
const confirmDiscard = useUnsavedChanges(dirty, '活动批量导入')
const labels = { READY: '待新建', EXISTS: '已存在 / 跳过', DUPLICATE: '文件内重复 / 跳过', INVALID: '无效', CONFLICT: '内容冲突', CREATED: '已创建', FAILED: '失败 / 未确认' }
const issueCount = computed(() => report.value?.rows.filter(row => row.issues.length).length || 0)
const rows = computed(() => (report.value?.rows || []).filter(row => filter.value === 'all' || row.issues.length))
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / 10)))
const pageRows = computed(() => rows.value.slice((page.value - 1) * 10, page.value * 10))
let alive = true
useModalFocus(visible, panel, { initialFocus: () => heading.value, onEscape: () => void close() })
const bodyOverflow = document.body.style.overflow, rootOverflow = document.documentElement.style.overflow, bodyPadding = document.body.style.paddingRight
const gap = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
if (gap) document.body.style.paddingRight = `${(parseFloat(getComputedStyle(document.body).paddingRight) || 0) + gap}px`
document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
function restoreScroll() { document.body.style.overflow = bodyOverflow; document.documentElement.style.overflow = rootOverflow; document.body.style.paddingRight = bodyPadding }
watch(text, () => { preview.value = null; report.value = null; confirmed.value = false; finished.value = false; error.value = ''; page.value = 1 }, { flush: 'sync' })
watch(filter, () => { page.value = 1 })
async function close() { if (!busy.value && await confirmDiscard() && alive) { visible.value = false; restoreScroll(); emit('close') } }
async function showError(message) { error.value = message; await nextTick(); if (alive) errorSummary.value?.focus() }
async function chooseFile(event) {
  const file = event.target.files?.[0]
  if (!file || busy.value) return
  // Selecting any replacement invalidates a previously confirmed preview, including unreadable files.
  preview.value = null; report.value = null; confirmed.value = false; finished.value = false
  operation.value = 'file'; error.value = ''
  try { const value = await readCalendarImportFile(file); if (alive) text.value = value }
  catch (err) { if (alive) await showError(err.message) }
  finally { if (alive) { operation.value = ''; fileInput.value.value = '' } }
}
async function validate() {
  if (busy.value) return
  operation.value = 'preview'; error.value = ''; preview.value = null; confirmed.value = false; report.value = null; finished.value = false
  const source = text.value
  try {
    checkCalendarImportText(source)
    const result = await previewActivityCalendarImport(source)
    if (!alive || source !== text.value) return
    preview.value = result; report.value = result; filter.value = result.invalid || result.conflicts ? 'issues' : 'all'; page.value = 1
    await nextTick(); if (alive) summary.value?.focus()
  } catch (err) { if (alive && source === text.value) await showError(err.message || '预览失败，请重试。') }
  finally { if (alive) operation.value = '' }
}
async function commit() {
  if (busy.value || !preview.value || blocked.value || !confirmed.value || finished.value) return
  operation.value = 'commit'; error.value = ''
  const source = text.value, token = preview.value.preview_token
  try {
    const result = await commitActivityCalendarImport(source, token)
    if (!alive) return
    report.value = result; finished.value = true; preview.value = null; confirmed.value = false; filter.value = result.failed ? 'issues' : 'all'; page.value = 1
    emit('imported')
    await nextTick(); if (alive) summary.value?.focus()
  } catch (err) {
    if (!alive) return
    preview.value = null; confirmed.value = false
    // A lost response may follow a successful write; refresh the directory and require a new preview.
    emit('imported')
    await showError(err.status === 409 ? 'JSON 或目录已变化，请重新校验并预览；本次未开始写入。' : (err.message || '导入结果未确认。') + ' 请重新预览原 JSON 后安全重试，已创建活动会跳过。')
  } finally { if (alive) operation.value = '' }
}
async function changePage(offset) { page.value += offset; await nextTick(); summary.value?.focus() }
onBeforeUnmount(() => { alive = false; restoreScroll() })
</script>

<style src="../../pages/calendar/calendar.css"></style>
<style src="../../pages/calendar/calendarDesktop.css"></style>
<style src="../../pages/calendar/calendarMobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.calendar-import-mask { background: var(--theme-overlay, rgba(73, 59, 44, .35)); }
.calendar-import-dialog { background: var(--surface); border: 1px solid var(--line); border-radius: 20px; box-shadow: var(--shadow); }
.calendar-import-head { border-bottom: 1px solid var(--line); }
.calendar-import-body a { color: var(--theme-info-text, var(--brand-blue)); text-underline-offset: 3px; }
.calendar-import-rows summary { cursor: pointer; }
.calendar-import-footer { border-top: 1px solid var(--line); }
.calendar-import-dialog :is(button, a, input, textarea, select, summary):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
</style>
<style scoped src="./calendarImportDialogDesktop.css"></style>
<style scoped src="./calendarImportDialogMobile.css"></style>
