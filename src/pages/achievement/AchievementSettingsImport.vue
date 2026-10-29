<template>
  <details class="panel">
    <summary>奖励字典与积分配置</summary>
    <p>选择你维护的 JSON 文件，核对后应用到本地草稿，再保存并预览发布。没有上传配置时，不会自动补充资料。</p>
    <p>当前草稿：{{ draft.reward_items?.length || 0 }} 种奖励 · {{ draft.point_tracks?.length || 0 }} 个积分分类</p>
    <label>选择奖励配置<input type="file" accept=".json,application/json" :disabled="busy" @change="readFile"></label>
    <button type="button" :disabled="busy" @click="download">导出当前奖励配置</button>
    <p v-if="error" ref="errorElement" role="alert" tabindex="-1">{{ error }}</p>
    <div v-if="candidate">
      <p>待应用：{{ candidate.reward_items.length }} 种奖励、{{ candidate.point_tracks.length }} 个积分分类、{{ candidate.reward_filter_keys.length }} 个筛选项。将替换草稿中的这三项配置，不修改成就或玩家记录。</p>
      <button type="button" :disabled="busy" @click="apply">应用到草稿</button>
      <button type="button" :disabled="busy" @click="candidate = null">取消</button>
    </div>
  </details>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { achievementSettings, settingsExport } from './settingsImport.js'
const props = defineProps({ game: { type: String, required: true }, draft: { type: Object, required: true }, busy: Boolean, revision: Number })
const emit = defineEmits(['apply'])
const candidate = ref(null), error = ref(''), errorElement = ref(null)
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
  const url = URL.createObjectURL(new Blob([JSON.stringify(settingsExport(props.game, props.draft), null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `奖励配置-${props.game}.json`; link.click(); URL.revokeObjectURL(url)
}
</script>
