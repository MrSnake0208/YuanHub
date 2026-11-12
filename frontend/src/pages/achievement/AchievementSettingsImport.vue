<template>
  <details ref="detailsElement" class="panel settings-import">
    <summary>奖励字典与积分配置</summary>
    <p>应用到草稿后，仍需保存并预览发布。没有上传配置时，不会自动补充资料。</p>
    <p>当前草稿：{{ draft.reward_items?.length || 0 }} 种奖励 · {{ draft.point_tracks?.length || 0 }} 个积分分类</p>
    <div class="settings-actions">
      <input ref="fileInput" class="file-input" type="file" accept=".json,application/json" :disabled="busy" @change="readFile">
      <button ref="chooseButton" type="button" :disabled="busy" @click="fileInput.click()">选择奖励配置文件</button>
      <button type="button" :disabled="busy" @click="download">导出当前奖励配置</button>
    </div>
    <p v-if="error" ref="errorElement" role="alert" tabindex="-1">{{ error }}</p>
    <div v-if="candidate">
      <p>待应用：{{ candidate.reward_items.length }} 种奖励、{{ candidate.point_tracks.length }} 个积分分类、{{ candidate.reward_filter_keys.length }} 个筛选项。将替换草稿中的这三项配置，不修改成就或玩家记录。</p>
      <div class="settings-actions">
        <button class="primary" type="button" :disabled="busy" @click="apply">应用到草稿</button>
        <button type="button" :disabled="busy" @click="candidate = null">取消</button>
      </div>
    </div>
  </details>
</template>

<script setup>
import { downloadJson } from '../../utils/downloadFile.js'
import { nextTick, ref, watch } from 'vue'
import { achievementSettings, settingsExport } from './settingsImport.js'
const props = defineProps({ game: { type: String, required: true }, draft: { type: Object, required: true }, busy: Boolean, revision: Number })
const emit = defineEmits(['apply'])
const candidate = ref(null), error = ref(''), errorElement = ref(null), fileInput = ref(null)
const detailsElement = ref(null), chooseButton = ref(null)
async function open() {
  detailsElement.value.open = true
  await nextTick()
  detailsElement.value.scrollIntoView({ block: 'start' })
  chooseButton.value?.focus({ preventScroll: true })
}
defineExpose({ open })
let generation = 0
watch(() => [props.game, props.revision], () => { generation++; candidate.value = null; error.value = '' })
async function readFile(event) {
  const file = event.target.files?.[0], turn = ++generation
  event.target.value = ''; candidate.value = null; error.value = ''
  if (!file) return
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('配置文件最多2MiB。')
    const document = JSON.parse(await file.text())
    if (turn !== generation) return
    candidate.value = achievementSettings(document, props.game, props.draft.categories)
  } catch (e) {
    if (turn !== generation) return
    error.value = e instanceof SyntaxError ? '文件不是有效 JSON。' : e.message
    await nextTick(); errorElement.value?.focus()
  }
}
function apply() { emit('apply', candidate.value); candidate.value = null }
function download() {
  downloadJson(settingsExport(props.game, props.draft), `奖励配置-${props.game}.json`)
}
</script>

<style scoped>
.settings-import p { margin: 12px 0; color: var(--ink-60); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.settings-import p[role="alert"] { color: var(--theme-danger-text, var(--rouge)); }
.settings-import { scroll-margin-top: var(--catalog-bar-offset, 16px); }
.settings-import summary { display: list-item; list-style: disclosure-closed inside; cursor: pointer; padding-block: 8px; font-weight: 600; }
.settings-import[open] > summary { list-style-type: disclosure-open; }
.settings-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.file-input { display: none; }
button { padding: 8px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--surface); color: var(--ink); font: inherit; cursor: pointer; }
button:hover:not(:disabled) { border-color: var(--tea); background: var(--paper); }
button.primary { background: var(--tea); color: var(--on-strong); }
button:disabled { opacity: .55; cursor: default; }
button:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
</style>
