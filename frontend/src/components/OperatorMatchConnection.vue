<template>
  <section class="match-connection" aria-labelledby="match-title" :aria-busy="busy">
    <div class="match-card">
      <div class="match-seal" aria-hidden="true"><img src="/icons/maa.png" alt="" /></div>
      <div class="match-copy">
        <div class="match-heading">
          <h3 id="match-title">MaaYuan <span class="match-subtitle">作业匹配</span></h3>
          <span class="match-brand">联合共建</span>
        </div>
        <p>一个连接码，切换本人的游戏账号，查找适合阵容与练度的作业。</p>
        <div class="match-capabilities" aria-label="作业匹配的数据能力">
          <span class="read-capability"><ShieldCheck :size="15" aria-hidden="true" />读取密探养成</span>
          <span class="read-only"><LockKeyhole :size="15" aria-hidden="true" />只读授权</span>
        </div>
        <p>与 MaaYuan 同步连接相互独立，停止连接不会删除游戏账号或档案。</p>
      </div>
      <div class="match-controls">
        <template v-if="connections.length">
          <div v-for="item in connections" :key="item.connection_id" class="match-control-row">
            <div class="match-actions">
              <button class="primary" type="button" :disabled="busy" @click="copy(item)"><Copy :size="17" aria-hidden="true" />复制连接码</button>
              <a class="visit" :href="shareUrl" target="_blank" rel="noopener noreferrer"><ExternalLink :size="17" aria-hidden="true" />访问作业站</a>
            </div>
            <button class="stop" type="button" :disabled="busy" @click="revoke(item)">停止连接</button>
          </div>
        </template>
        <button v-else-if="loaded" class="primary" type="button" :disabled="busy || !enabled || !userId" @click="create">添加只读匹配连接</button>
        <p v-else-if="busy" role="status">正在读取连接…</p>
        <button v-else type="button" :disabled="!userId" @click="refresh">重新加载连接</button>
      </div>
    </div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="secret" class="match-secret">
      <label for="match-secret-code">作业匹配连接码</label>
      <input id="match-secret-code" :type="revealed ? 'text' : 'password'" :value="secret" readonly autocomplete="off" @focus="$event.target.select()" />
      <div class="match-actions">
        <button type="button" :aria-pressed="revealed" @click="revealed = !revealed">{{ revealed ? '隐藏' : '显示以手动复制' }}</button>
        <button type="button" @click="secret = ''; revealed = false">关闭</button>
      </div>
      <p class="muted">在作业站的“密探匹配设置”中粘贴并选择账号。请勿将连接码发给他人。</p>
    </div>
  </section>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { Copy, ExternalLink, ShieldCheck, LockKeyhole } from '@lucide/vue'
import { createMatchConnection, getMatchSecret, listMatchConnections, revokeMatchConnection } from '../api/operatorMatch.js'
import { dialog } from '../utils/dialog.js'

const shareUrl = import.meta.env.VITE_SHARE_URL || 'https://share.maayuan.com/'
const props = defineProps({ userId: String, enabled: Boolean })
const connections = ref([])
const loaded = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const secret = ref('')
const revealed = ref(false)
let alive = true
onBeforeUnmount(() => { alive = false; secret.value = '' })

async function run(action) {
  if (busy.value || !props.userId) return
  const owner = props.userId
  const current = () => alive && owner === props.userId
  busy.value = true
  error.value = ''
  notice.value = ''
  try { await action(current, owner) }
  catch (e) { if (current()) error.value = e?.message || '操作失败，请重试' }
  finally { if (current()) busy.value = false }
}
const refresh = () => run(async (current, owner) => {
  const items = await listMatchConnections(owner)
  if (current()) { connections.value = items.slice(-1); loaded.value = true }
})
const create = () => run(async (current, owner) => {
  const result = await createMatchConnection(owner)
  if (!current()) return
  secret.value = ''
  revealed.value = false
  connections.value = [{ connection_id: result.connection_id }]
  notice.value = '连接已创建，请复制到作业站。'
  const items = await listMatchConnections(owner)
  if (current()) { connections.value = items.slice(-1); loaded.value = true }
})
const copy = item => run(async (current, owner) => {
  secret.value = ''
  revealed.value = false
  const result = await getMatchSecret(owner, item.connection_id)
  if (!current()) return
  try {
    await navigator.clipboard.writeText(result.token)
    if (current()) notice.value = '连接码已复制，请在作业站的“密探匹配设置”中粘贴并选择账号。'
  } catch {
    if (current()) {
      secret.value = result.token
      error.value = '复制失败，请显示连接码后选中文本手动复制。'
    }
  }
})
const revoke = item => run(async (current, owner) => {
  if (!await dialog.confirm({ title: '停止作业匹配连接', message: '这个连接码将立即失效，游戏账号与档案会保留。作业站已缓存的档案需在作业站清除。', type: 'danger', confirmText: '停止连接' }) || !current()) return
  await revokeMatchConnection(owner, item.connection_id)
  if (current()) {
    secret.value = ''
    connections.value = connections.value.filter(value => value.connection_id !== item.connection_id)
    notice.value = '连接已停止。'
  }
})
watch(() => props.userId, () => {
  connections.value = []
  secret.value = ''
  revealed.value = false
  notice.value = ''
  error.value = ''
  loaded.value = false
  busy.value = false
  refresh()
}, { immediate: true })
</script>

<style scoped>
.match-connection { container-type: inline-size; margin-top: 24px; padding: 24px; color: var(--ink); background: linear-gradient(135deg, var(--cream), var(--surface)); border: 1.5px solid var(--line); border-radius: 22px; }
.match-card { display: grid; gap: 18px; align-items: center; }
.match-seal { width: 64px; height: 64px; display: grid; place-items: center; background: var(--yellow); border: 1px solid var(--line); border-radius: 22px 22px 22px 10px; transform: rotate(-2deg); }
.match-seal img { width: 54px; height: 54px; object-fit: contain; transform: rotate(2deg); }
.match-copy, .match-controls { min-width: 0; }
.match-heading, .match-capabilities, .match-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
h3 { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin: 0; font: 900 24px var(--font-s); letter-spacing: .04em; }
.match-subtitle { font: 500 17px var(--font-b); letter-spacing: 0; }
.match-brand { display: inline-flex; align-items: center; min-height: 24px; padding: 2px 9px; color: var(--theme-info-text, var(--brand-blue)); border: 1.5px solid var(--brand-blue); border-radius: 7px; font-size: 11px; font-weight: 800; white-space: nowrap; }
p { margin: 7px 0 0; font-size: 13.5px; line-height: 1.75; color: var(--ink-60); }
.match-capabilities { margin-top: 13px; gap: 8px; }
.match-capabilities span { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 10px; border-radius: 999px; background: var(--paper); font-size: 12px; font-weight: 700; }
.match-capabilities .read-capability { background: var(--theme-success-wash, rgba(191, 220, 192, .45)); }
.match-capabilities .read-only { background: transparent; color: var(--ink-60); }
.match-control-row { display: grid; justify-items: end; gap: 2px; }
button, .visit { display: inline-flex; justify-content: center; align-items: center; gap: 8px; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); min-height: 44px; padding: 10px 20px; border-radius: 999px; cursor: pointer; font-family: var(--font-b); font-size: 13px; font-weight: 800; white-space: nowrap; text-decoration: none; }
.primary { background: var(--tea); color: var(--on-strong); border-color: transparent; }
button:hover:not(:disabled), .visit:hover { border-color: var(--tea); }
.primary:hover:not(:disabled) { background: var(--accent); }
button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
.stop { min-height: 30px; margin: 0; padding: 4px 10px; font-size: 12px; font-weight: 600; background: transparent; border-color: transparent; color: var(--ink-60); }
.match-secret { margin-top: 16px; padding: 16px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; }
input { display: block; box-sizing: border-box; width: 100%; min-width: 0; margin: 8px 0 12px; padding: 10px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.error { color: var(--theme-danger-text, var(--rouge)); }
@container (min-width: 580px) {
  .match-card { grid-template-columns: 90px minmax(0, 1fr); gap: 22px; }
  .match-seal { width: 90px; height: 90px; border-radius: 28px 28px 28px 10px; }
  .match-seal img { width: 74px; height: 74px; }
  .match-controls { grid-column: 2; width: fit-content; max-width: 100%; }
  h3 { font-size: 26px; }
  .match-subtitle { font-size: 18px; }
}
@container (min-width: 860px) {
  .match-card { grid-template-columns: 96px minmax(0, 1fr) auto; }
  .match-controls { grid-column: 3; max-width: 320px; padding-top: 32px; }
}
</style>
