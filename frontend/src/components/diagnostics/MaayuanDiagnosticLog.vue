<template>
  <section class="diagnostic-section diagnostic-log" aria-label="运行日志">
    <h3>运行日志</h3>
    <p v-if="log.expired" class="diagnostic-muted">日志已过期（保留 14 天）</p>
    <p v-else-if="log.status === 'pending'" class="diagnostic-muted">日志未上传完成</p>
    <p v-else-if="log.status === 'missing'" class="diagnostic-muted">日志未上传或已丢失</p>
    <p v-else-if="log.status === 'invalid'" class="diagnostic-error">日志校验失败</p>
    <template v-else-if="log.status === 'ready'">
      <div class="diagnostic-log-actions">
        <button type="button" :disabled="busy" :aria-expanded="visible" @click="run('view')">查看日志</button>
        <button type="button" :disabled="busy" @click="run('download')">下载</button>
        <button type="button" :disabled="busy" @click="run('copy')">复制</button>
      </div>
      <p v-if="busy" role="status">正在加载日志…</p>
      <p v-if="error" class="diagnostic-error" role="alert">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <pre v-if="visible" tabindex="0" aria-label="运行日志内容">{{ text }}</pre>
    </template>
  </section>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getDiagnosticLog } from '@/api/maayuanDiagnostics.js'

const props = defineProps({ eventId: { type: String, required: true }, log: { type: Object, required: true } })
const text = ref(null), visible = ref(false), busy = ref(false), error = ref(''), message = ref('')
let generation = 0

async function run(action) {
  if (busy.value) return
  const token = generation, id = props.eventId
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (text.value === null) {
      const { blob } = await getDiagnosticLog(id)
      const value = await blob.text()
      if (token !== generation) return
      text.value = value
    }
    if (action === 'view') visible.value = true
    if (action === 'download') {
      const url = URL.createObjectURL(new Blob([text.value], { type: 'text/plain;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = `${id}.log`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(text.value)
        if (token === generation) message.value = '已复制日志'
      } catch (_) {
        if (token === generation) { visible.value = true; error.value = '复制失败，请选中下方文本复制' }
      }
    }
  } catch (failure) {
    if (token === generation) error.value = failure.status === 404 ? '日志不存在或已过期（保留 14 天）' : '日志加载失败，请重试'
  } finally { if (token === generation) busy.value = false }
}

watch(() => [props.eventId, props.log], () => {
  generation++; text.value = null; visible.value = false; busy.value = false; error.value = ''; message.value = ''
})
onBeforeUnmount(() => { generation++ })
</script>

<style scoped>
.diagnostic-log { min-width: 0; }
.diagnostic-log-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.diagnostic-log pre {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
</style>
