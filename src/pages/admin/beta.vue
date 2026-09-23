<template>
  <div class="page-beta-admin"><IslandSidebar /><main id="main-content">
    <header class="hero"><div class="wrap"><div class="crumb"><span class="pill fill">管理</span><router-link to="/manage">返回工作台</router-link></div><h1>内测管理<span class="small">名额 · 开放状态</span></h1><p class="hero-sub">名额按规则自动分配；这里不做逐人审核，也没有超额开通入口。</p></div></header>
    <section class="wrap beta-admin-content">
      <p v-if="error" class="admin-message error" role="alert">{{ error }}</p>
      <p v-if="message" class="admin-message" role="status">{{ message }}</p>
      <div v-if="data?.campaign?.localTestMode" class="admin-message local-mode" role="note"><b>LOCAL · 本地内测模式</b><span>当前操作的是隔离活动 {{ data.campaign.campaignId }}，不会修改正式内测的快照、报名或资格。</span></div>
      <button class="admin-btn secondary" :disabled="busy" @click="load">{{ busy ? '正在读取/提交…' : '刷新管理状态' }}</button>
      <template v-if="data">
        <div v-if="!data.configured || data.snapshotStatus !== 'READY'" class="admin-card"><h2>活动尚未初始化</h2><p>普通用户的受限功能默认关闭，管理员仍可直接进入。请先使用后端准备工具核实来源、导入并锁定快照；本页不能上传普通用户申请或绕过配额发资格。</p></div>
        <div class="admin-card"><h2>活动与名额</h2>
          <div class="admin-metrics"><div v-for="metric in metrics" :key="metric.label"><span>{{ metric.label }}</span><b>{{ metric.value }}</b></div></div>
          <p>模式：<b>{{ data.campaign.accessMode }}</b> · {{ data.campaign.admissionsPaused ? '暂停新增' : '正常新增' }} · 配置版本 {{ data.configVersion }}</p>
          <p v-if="data.campaign.pauseReason">暂停说明：{{ data.campaign.pauseReason }}</p>
          <p>已开通 {{ data.campaign.grantedCount }} + 有效预留 {{ data.campaign.reservedRemaining }} / 当前容量 {{ data.campaign.capacity }}。预留不是已使用账号，新增容量全部公开。</p>
          <p>开始：{{ time(data.campaign.startsAt) }}<br>预留结束：{{ time(data.campaign.reservedUntil) }}</p>
        </div>
        <div class="admin-card"><h2>{{ data.campaign.localTestMode ? '本地模拟快照' : 'Share 固定快照' }}</h2>
          <dl><dt>状态</dt><dd>{{ data.snapshotStatus }}</dd><dt>版本</dt><dd>{{ data.snapshotId || '尚未配置' }}</dd><dt>名单条目</dt><dd>{{ data.campaign.localTestMode ? '全部已激活账号（模拟）' : data.snapshotCount }}</dd><dt>对应时点</dt><dd>{{ time(data.campaign.snapshotAt) }}</dd><dt>锁定时间</dt><dd>{{ time(data.snapshotLockedAt) }}</dd><dt>来源依据</dt><dd>{{ data.snapshotSourceNote || '尚未提供' }}</dd></dl>
          <p v-if="data.campaign.localTestMode">本地测试把所有已激活账号视为预留资格用户，只用于覆盖预留与公开名额逻辑；不会读取正式 Share 快照。</p>
          <p v-else>名单锁定后不可追加。条目数量不代表人人都有名额，首批共同预留仅 {{ data.campaign.reservedInitial }} 个。</p>
        </div>
        <div class="admin-card"><h2>运营操作</h2>
          <label class="reason-label" for="beta-admin-reason">本次变更原因（必填，写入审计）</label>
          <textarea ref="reasonInput" id="beta-admin-reason" v-model.trim="reason" maxlength="300" rows="3" placeholder="例如：同步流程稳定，开放下一批候补" />
          <p class="reason-hint">运营操作会写入审计记录；未填写原因时点击按钮会提示补充，不会静默禁用。</p>
          <div class="admin-actions">
            <button class="admin-btn" :disabled="disabled" @click="mutate('admissions', { paused: !data.campaign.admissionsPaused }, data.campaign.admissionsPaused ? '恢复新增，并优先递补已有候补？' : '暂停所有新增资格？已开通用户仍可使用。')">{{ data.campaign.admissionsPaused ? '恢复新增' : '暂停新增' }}</button>
            <button v-for="size in [150, 200]" :key="size" class="admin-btn secondary" :disabled="disabled || data.campaign.capacity >= size || size > data.campaign.maxCapacity" @click="mutate('capacity', { capacity: size }, '将当前容量提高到 ' + size + '？新增名额全部公开，已有候补优先。')">扩至 {{ size }} 人</button>
          </div>
          <div class="admin-actions">
            <button class="admin-btn secondary" :disabled="disabled || data.campaign.accessMode === 'CLOSED'" @click="mutate('mode', { access_mode: 'CLOSED' }, '进入维护关闭？普通用户将暂停受限云功能；管理员仍可直接进入，账号和管理入口保留。')">维护关闭</button>
            <button class="admin-btn secondary" :disabled="disabled || !!data.publicOpenedAt || data.snapshotStatus !== 'READY' || data.campaign.accessMode === 'BETA'" @click="mutate('mode', { access_mode: 'BETA' }, '进入内测模式？仍严格遵守开始时间、快照和当前容量。')">进入内测模式</button>
            <button class="admin-btn" :disabled="disabled || data.campaign.accessMode === 'OPEN'" @click="mutate('mode', { access_mode: 'OPEN' }, '确认正式开放？将取消所有来源的内测资格限制；之后不能退回旧内测配额，仅可维护关闭。')">正式开放</button>
            <button v-if="data.campaign.localTestMode" class="admin-btn local-reset" :disabled="disabled" @click="resetLocal">重置本地内测</button>
          </div>
          <p>暂停新增不会延长 72 小时预留期；到期仍释放，恢复新增后继续递补。所有具备管理能力的管理员账号都不参与内测资格与名额分配，可在任意开放状态下直接进入普通云功能；普通用户仍按当前内测规则进入。</p>
        </div>
        <div class="admin-card"><h2>期限维护</h2><p>已释放预留：{{ data.releasedCount }} · 释放记录：{{ time(data.releasedAt) }}</p><p>本实例最近维护：{{ time(data.lastMaintenanceAt) }}</p><p v-if="data.lastMaintenanceError" class="error">{{ data.lastMaintenanceError }}</p><p>正式开放记录：{{ time(data.publicOpenedAt) }}</p></div>
      </template>
    </section><SiteFooter>
      <template #big>内测运营<br><span>名额 · 候补 · 测试进展</span></template>
      <template #fine>所有管理变更写入审计记录<br>公开名额始终按报名顺序分配</template>
    </SiteFooter>
  </main></div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { getBetaAdmin, resetLocalBeta, updateBetaAdmin } from '../../api/beta.js'
import { beta } from '../../store/beta.js'
import { formatBetaTime } from '../../utils/betaAccess.js'
const data = ref(null)
const busy = ref(false)
const error = ref('')
const message = ref('')
const reason = ref('')
const reasonInput = ref(null)
const disabled = computed(() => busy.value || !data.value?.configured || data.value.snapshotStatus !== 'READY')
const metrics = computed(() => data.value ? [
  { label: '当前容量', value: data.value.campaign.capacity }, { label: '已开通', value: data.value.campaign.grantedCount },
  { label: '公开剩余', value: data.value.campaign.publicRemaining }, { label: '有效预留', value: data.value.campaign.reservedRemaining },
  { label: '预留已用', value: data.value.reservedGrantedCount }, { label: '候补人数', value: data.value.waitingCount }
] : [])
function time(value) { return data.value?.configured ? formatBetaTime(value, data.value?.campaign.announcementTimezone) : '尚未配置' }
async function load() {
  busy.value = true; error.value = ''
  try { data.value = await getBetaAdmin() } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
async function mutate(action, payload, confirmation) {
  if (disabled.value) return
  if (reason.value.trim().length < 2) {
    error.value = '请先填写 2～300 字的变更原因，运营操作会写入审计记录。'
    message.value = ''
    reasonInput.value?.focus()
    return
  }
  if (!window.confirm(confirmation)) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    data.value = await updateBetaAdmin(action, { ...payload, reason: reason.value, expected_config_version: data.value.configVersion })
    message.value = '服务器已确认变更，名额将按统一规则处理。'; reason.value = ''
    await beta.refresh()
  } catch (e) {
    if (e.status === 409 || e.status === 503) {
      try { data.value = await getBetaAdmin() } catch (_) { /* Preserve the original operation error. */ }
    }
    error.value = e.message || '变更结果暂未确认，请刷新后检查。'
  } finally { busy.value = false }
}
async function resetLocal() {
  if (disabled.value || !data.value?.campaign?.localTestMode) return
  if (reason.value.trim().length < 2) {
    error.value = '请先填写 2～300 字的变更原因，重置操作会写入审计记录。'
    message.value = ''
    reasonInput.value?.focus()
    return
  }
  if (!window.confirm('重置本地内测？这会清空本地活动的报名、资格和对应资格通知，并立即重新开放测试；正式内测数据不会变化。')) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    data.value = await resetLocalBeta(reason.value)
    reason.value = ''
    message.value = '本地内测已重置，可以重新测试报名和资格分配。'
    await beta.refresh()
  } catch (e) {
    error.value = e.message || '本地内测重置失败，请刷新后检查。'
  } finally { busy.value = false }
}
onMounted(load)
</script>
<style scoped>
.page-beta-admin .hero { --wm: '测'; }
.beta-admin-content { display: grid; gap: 20px; padding-bottom: 42px; }
.admin-card { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); padding: clamp(18px, 3vw, 30px); }
h2 { font: 900 24px/1.5 var(--font-s); color: var(--ink); margin: 0 0 20px; }
p { line-height: 1.9; color: var(--ink); overflow-wrap: anywhere; }
.admin-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.admin-metrics > div { padding: 15px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); }
.admin-metrics span { display: block; font-size: 12px; color: var(--ink-60); }
.admin-metrics b { display: block; font: 800 30px/1.6 var(--font-d); color: var(--tea); }
dl { display: grid; grid-template-columns: auto 1fr; gap: 12px 22px; } dd { margin: 0; overflow-wrap: anywhere; }
.reason-label { display: block; font-weight: 700; margin: 12px 0; }
.reason-hint { margin: 7px 0 0; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: var(--cream); color: var(--ink); font: inherit; resize: vertical; }
.admin-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.admin-btn { justify-self: start; min-height: 44px; border: 1px solid var(--tea); border-radius: 999px; padding: 11px 20px; background: var(--tea); color: var(--cream); font: 700 14px var(--font-b); cursor: pointer; }
.admin-btn.secondary { background: transparent; color: var(--tea); }
.admin-btn:disabled { opacity: .45; cursor: default; }
.admin-btn:focus-visible, textarea:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.admin-message { background: var(--cream); border: 1px solid var(--line); padding: 16px; border-radius: 12px; }
.admin-message.local-mode { display: grid; gap: 5px; border-style: dashed; border-color: var(--accent); }
.admin-message.local-mode b { color: var(--accent); }
.admin-message.local-mode span { font-size: 13px; line-height: 1.7; }
.admin-btn.local-reset { border-color: var(--rouge); background: transparent; color: var(--rouge); }
.error { color: var(--rouge); }
@media (max-width: 560px) { .admin-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } dl { grid-template-columns: 1fr; gap: 4px; } dd { margin-bottom: 12px; } }
</style>
