<template>
  <div class="page-admin-audit">
    <IslandSidebar />
    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <div class="crumb"><span class="pill fill">管理</span><span class="pill">审计</span></div>
          <h1>管理员审计<span class="small">只读记录</span></h1>
          <p class="hero-sub">按时间倒序查看角色与反馈授权的变更记录。</p>
          <div class="hero-stats">
            <div><div class="k">记录总数</div><div class="v">{{ total }}<small>条</small></div></div>
            <div><div class="k">当前页</div><div class="v">{{ page }}<small>页</small></div></div>
          </div>
        </div>
      </header>

      <section class="wrap audit-content">
        <nav class="admin-links" aria-label="管理页面">
          <router-link to="/user/profile">个人中心</router-link>
          <router-link v-if="canManageRoles" to="/admin/roles">角色管理</router-link>
          <router-link v-if="canConfigureFeedback" to="/feedback/admin">反馈授权</router-link>
        </nav>
        <div class="audit-toolbar">
          <span>第 {{ page }} 页</span>
          <button class="icon-command" type="button" title="刷新审计记录" :disabled="loading" @click="load(page)"><RefreshCw :size="17" aria-hidden="true" /></button>
        </div>

        <div v-if="loading" class="state">正在加载审计记录…</div>
        <div v-else-if="error" class="state error" role="alert">{{ error }} <button type="button" @click="load(page)">重试</button></div>
        <div v-else class="audit-table-wrap">
          <table class="audit-table">
            <thead><tr><th>发生时间</th><th>动作</th><th>操作者</th><th>目标</th><th>变更前</th><th>变更后</th></tr></thead>
            <tbody>
              <tr v-for="log in logs" :key="log.id">
                <td><time>{{ formatTime(log.occurredAt) }}</time><code v-if="log.requestId">{{ log.requestId }}</code></td>
                <td><span class="action-tag">{{ actionLabel(log.action) }}</span></td>
                <td><code>{{ log.actorUserId }}</code></td>
                <td><code>{{ log.targetUserId || log.targetResource || '无' }}</code></td>
                <td><span v-for="part in snapshotParts(log.before)" :key="part" class="snapshot-line">{{ part }}</span></td>
                <td><span v-for="part in snapshotParts(log.after)" :key="part" class="snapshot-line">{{ part }}</span></td>
              </tr>
              <tr v-if="logs.length === 0"><td colspan="6" class="empty-row">暂无审计记录</td></tr>
            </tbody>
          </table>
        </div>

        <footer class="pager">
          <button class="command secondary" type="button" :disabled="loading || page <= 1" @click="load(page - 1)"><ChevronLeft :size="17" aria-hidden="true" />上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="command secondary" type="button" :disabled="loading || !hasNext" @click="load(page + 1)">下一页<ChevronRight :size="17" aria-hidden="true" /></button>
        </footer>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronLeft, ChevronRight, RefreshCw } from '@lucide/vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import { listAdminAuditLogs } from '../../api/admin.js'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'

const PAGE_SIZE = 20
const AREA_LABELS = { INVENTORY: '库存', OPERATOR: '密探', LEDGER: '账房', PLAZA: '作业广场', ACCOUNT: '账号', UI: '界面', OTHER: '其他' }
const ACTION_LABELS = {
  ROLE_GRANTED: '授予角色', ROLE_REVOKED: '回收角色', ROLE_REPLACED: '替换角色',
  FEEDBACK_ACCESS_UPDATED: '更新反馈授权', FEEDBACK_ACCESS_DELETED: '删除反馈授权'
}
const router = useRouter()
const logs = ref([])
const loading = ref(true)
const error = ref('')
const page = ref(1)
const total = ref(0)
const hasNext = ref(false)
const totalPages = computed(function () { return Math.max(1, Math.ceil(total.value / PAGE_SIZE)) })
const canManageRoles = computed(function () { return hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.ROLE_MANAGE) })
const canConfigureFeedback = computed(function () { return hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.FEEDBACK_ACCESS_MANAGE) })

async function load(nextPage) {
  loading.value = true
  error.value = ''
  try {
    const result = await listAdminAuditLogs({ page: nextPage, size: PAGE_SIZE })
    logs.value = result.data
    page.value = result.page
    total.value = result.total
    hasNext.value = result.hasNext
  } catch (err) {
    if (err && err.status === 403) {
      await router.replace({ path: '/forbidden', query: { from: '/admin/audit' } })
      return
    }
    error.value = err && err.message ? err.message : '审计记录加载失败'
  } finally {
    loading.value = false
  }
}

function actionLabel(action) { return ACTION_LABELS[action] || action || '未知动作' }
function roleLabel(role) { return role === 'SUPER_ADMIN' ? '超级管理员' : role === 'PLATFORM_ADMIN' ? '平台管理员' : role }
function areaLabel(area) { return AREA_LABELS[area] || area }
function snapshotParts(snapshot) {
  if (!snapshot) return ['无']
  const parts = []
  if (snapshot.roles.length) parts.push('角色：' + snapshot.roles.map(roleLabel).join('、'))
  if (snapshot.receiveAreas.length) parts.push('接收：' + snapshot.receiveAreas.map(areaLabel).join('、'))
  if (snapshot.manageAreas.length) parts.push('管理：' + snapshot.manageAreas.map(areaLabel).join('、'))
  return parts.length ? parts : ['无']
}
function formatTime(value) {
  if (!value) return '无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

onMounted(function () { load(1) })
</script>

<style scoped>
.page-admin-audit { min-height: 100vh }
.page-admin-audit .hero { --wm: '审' }
.audit-content { padding-top: 24px; padding-bottom: 56px }
.admin-links { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; font-size: 13px; font-weight: 800 }
.admin-links a { color: var(--accent-strong); text-decoration: none }
.audit-toolbar { min-height: 48px; display: flex; align-items: center; justify-content: flex-end; gap: 12px; border-block: 1px solid var(--line); color: var(--ink-60); font-family: var(--font-d); font-size: 12px }
.icon-command { width: 38px; height: 38px; display: inline-grid; place-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; color: var(--ink); cursor: pointer }
.state { padding: 52px 0; color: var(--ink-60); text-align: center }
.state.error { color: var(--rouge) }
.audit-table-wrap { overflow-x: auto }
.audit-table { width: 100%; min-width: 1050px; border-collapse: collapse; background: var(--surface) }
.audit-table th,.audit-table td { padding: 14px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top }
.audit-table th { background: var(--tea); color: var(--cream); font-size: 12px }
.audit-table code,.audit-table time { display: block; max-width: 210px; color: var(--ink-60); font-family: var(--font-d); font-size: 11px; overflow-wrap: anywhere }
.audit-table time { color: var(--ink); font-size: 12px }
.action-tag { display: inline-flex; padding: 3px 8px; background: var(--yellow); border-radius: 6px; font-size: 11px; font-weight: 800 }
.snapshot-line { display: block; max-width: 250px; margin-bottom: 4px; color: var(--ink-60); font-size: 12px; line-height: 1.5 }
.empty-row { color: var(--ink-60); text-align: center !important }
.pager { display: flex; align-items: center; justify-content: center; gap: 16px; padding-top: 20px }
.pager span { color: var(--ink-60); font-family: var(--font-d); font-size: 12px }
.command { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 16px; border: 1px solid var(--line); border-radius: 8px; font-weight: 800; cursor: pointer }
.command.secondary { background: var(--surface); color: var(--ink) }
.command:disabled,.icon-command:disabled { opacity: .5; cursor: default }
</style>
