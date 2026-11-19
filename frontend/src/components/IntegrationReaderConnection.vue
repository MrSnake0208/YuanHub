<template>
  <details class="reader-connection" @toggle="onToggle">
    <summary>{{ feedback ? '反馈 AI 只读接入' : 'MaaYuan 诊断 AI 接入' }}</summary>
    <p>{{ description }} 使用 yuanhub-feedback MCP 时，把令牌填入 <code>{{ configKey }}</code>。</p>
    <div class="actions">
      <button type="button" :disabled="busy || !loaded || !!created" @click="createToken">创建只读令牌</button>
      <button type="button" @click="copyInstructions">复制接入说明</button>
    </div>
    <textarea v-if="showInstructions" aria-label="AI 接入说明" readonly :value="instructions" rows="6" />
    <div v-if="created">
      <label>仅此次显示的令牌<input ref="secretInput" readonly autocomplete="off" spellcheck="false" :value="created.token" @focus="$event.target.select()" /></label>
      <button type="button" @click="copyToken">复制令牌</button>
      <button type="button" @click="created = null">我已保存</button>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loaded && !busy"><button type="button" @click="loadTokens">重新加载令牌</button></p>
    <p v-else-if="!loaded" role="status">正在加载令牌…</p>
    <ul v-if="tokens.length">
      <li v-for="token in tokens" :key="token.token_id">
        <span>{{ token.name }} · {{ new Date(token.created_at).toLocaleString() }} · 尾号 {{ token.token_id.slice(-6) }}</span>
        <button type="button" :disabled="busy" @click="revokeToken(token)">撤销</button>
      </li>
    </ul>
    <p v-else-if="loaded">暂无有效的{{ label }}只读令牌。</p>
  </details>
</template>

<script setup>
import { ref } from 'vue'
import { API_BASE, request } from '../api/request.js'
import { dialog } from '../utils/dialog.js'

const props = defineProps({
  userId: { type: String, required: true },
  scope: { type: String, required: true, validator: value => ['feedback:read', 'diagnostics:read'].includes(value) },
})
const path = '/user/integration-tokens'
const tokenOptions = { auth: true, expectedUserId: props.userId }
const feedback = props.scope === 'feedback:read'
const label = feedback ? '反馈' : 'MaaYuan 诊断'
const configKey = feedback ? 'integration_token' : 'diagnostics_token'
const description = feedback
  ? '授权 AI 读取你有权查看的玩家反馈、流转记录、附件及已有分析。'
  : '授权 AI 读取所有玩家上报的诊断问题、事件摘要及截图。'
const tokens = ref([])
const created = ref(null)
const secretInput = ref(null)
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const showInstructions = ref(false)
const base = new URL(API_BASE || '/', window.location.origin).href.replace(/\/$/, '')
const instructions = feedback ? `使用 yuanhub-feedback MCP 的 feedback_list（queue=ALL）查询可见工单，用 feedback_get 读取详情，按需读取流转记录或附件。
使用 HTTP 时，基路径为 ${base}/open-api/feedback。从密钥配置 integration_token 读取令牌，向该 API 发送 Authorization: Bearer <令牌>。
GET /queue?queue=ALL&page_size=3 读取队列，GET /{id} 读取工单。已有分析使用 GET /{id}/analysis。
示例：查看最近更新的三条反馈，总结玩家遇到的问题并列出工单 ID。` : `MaaYuan 诊断只读 API：${base}/open-api/maayuan-diagnostics
从客户端密钥配置读取令牌，仅向上述 API 发送 Authorization: Bearer <令牌>。JSON 结果在 data 字段中。
1. GET /issues?status=NEW&sort=count&page_size=3 按出现次数读取待处理问题。问题 ID 在 items[].issue.id。
2. GET /issues/{id} 读取详情与近期事件 events[]。
3. GET /events/{eventId} 读取事件摘要。需要截图时，从 images[] 选择有效图片，GET /events/{eventId}/media/{assetId} 读取二进制图片。
示例：列出出现次数最多的三个待处理问题，给出资源版本、最近事件 ID 和判断依据。`

function onToggle(event) {
  if (event.target.open && !loaded.value && !busy.value) loadTokens()
  if (!event.target.open) created.value = null
}

async function loadTokens() {
  busy.value = true
  error.value = ''
  try {
    const items = await request(path, tokenOptions)
    tokens.value = items.filter(item => item.enabled && (!item.expires_at || Date.parse(item.expires_at) > Date.now()) &&
      item.scopes.length === 1 && item.scopes[0] === props.scope &&
      (feedback || (item.feedback_areas?.length === 1 && item.feedback_areas[0] === 'MAAYUAN')))
    loaded.value = true
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

async function createToken() {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const body = { name: label + ' AI', scopes: [props.scope] }
    if (!feedback) body.feedback_areas = ['MAAYUAN']
    const { token, ...item } = await request(path, { ...tokenOptions, method: 'POST', body })
    created.value = { token_id: item.token_id, token }
    tokens.value.unshift(item)
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

async function revokeToken(item) {
  if (!await dialog.confirm({ title: '撤销' + label + '令牌', message: '尾号 ' + item.token_id.slice(-6) + ' 的令牌将在下次请求时失效。', type: 'danger', confirmText: '撤销令牌' })) return
  busy.value = true
  error.value = ''
  try {
    await request(path + '/' + encodeURIComponent(item.token_id), { ...tokenOptions, method: 'DELETE' })
    tokens.value = tokens.value.filter(token => token.token_id !== item.token_id)
    if (created.value?.token_id === item.token_id) created.value = null
    message.value = '令牌已撤销。'
  } catch (err) {
    error.value = err.message
  } finally {
    busy.value = false
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(created.value.token)
    message.value = '令牌已复制，请保存到客户端的密钥配置中。'
  } catch {
    secretInput.value?.focus()
    secretInput.value?.select()
    message.value = '请手动复制选中的令牌。'
  }
}

async function copyInstructions() {
  try {
    await navigator.clipboard.writeText(instructions)
    message.value = '接入说明已复制，可粘贴给 AI。'
  } catch {
    showInstructions.value = true
    message.value = '请在接入说明文本框中手动复制。'
  }
}
</script>

<style scoped>
.reader-connection { margin-block: 1rem; padding: 1rem; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
summary, button { cursor: pointer; }
summary { font-weight: 700; }
p, ul, label { margin-block: .75rem; }
.actions, li { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
ul { padding: 0; list-style: none; }
li + li { margin-top: .5rem; }
button { font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: .45rem .8rem; }
button:disabled { opacity: .6; cursor: default; }
input, textarea { display: block; width: 100%; margin-block: .5rem; box-sizing: border-box; font: inherit; }
</style>
