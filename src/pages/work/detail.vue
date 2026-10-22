<template>
  <div class="page-detail work-detail-page">
    <IslandSidebar />

    <main id="main-content">
      <div v-if="loading" class="detail-state-wrap" aria-live="polite" aria-busy="true">
        <div class="detail-state skeleton-state">
          <span class="loading-mark" aria-hidden="true"></span>
          <strong>正在加载作业详情</strong>
          <span>正在读取通关步骤与旧版作业转换结果。</span>
        </div>
      </div>

      <div v-else-if="invalidId" class="detail-state-wrap" aria-live="polite">
        <div class="detail-state error-state">
          <strong>无效的作业链接</strong>
          <span>作业链接格式有误，请返回广场重新选择。</span>
          <router-link to="/works"><ArrowLeft :size="16" aria-hidden="true" /> 返回作业广场</router-link>
        </div>
      </div>

      <div v-else-if="notFound" class="detail-state-wrap" aria-live="polite">
        <div class="detail-state error-state">
          <strong>作业不存在、非公开或已删除</strong>
          <span>请返回作业广场选择其他公开作业。</span>
          <router-link :to="backTarget"><ArrowLeft :size="16" aria-hidden="true" /> 返回作业广场</router-link>
        </div>
      </div>

      <div v-else-if="error" class="detail-state-wrap" aria-live="polite">
        <div class="detail-state error-state" role="alert">
          <strong>作业详情加载失败</strong>
          <span>{{ error }}</span>
          <div class="state-actions">
            <button type="button" @click="loadDetail">重新加载</button>
            <router-link :to="backTarget">返回作业广场</router-link>
          </div>
        </div>
      </div>

      <template v-else-if="detail">
        <header class="page-header work-detail-header">
          <div class="wrap">
            <router-link class="page-header-back" :to="backTarget"><ArrowLeft :size="16" aria-hidden="true" /> 返回作业广场</router-link>
            <div class="page-header-row">
              <div class="page-header-identity">
                <h1 class="page-header-title">{{ metadata.title || '未命名作业' }}</h1>
                <div class="page-header-context">
                  <span>{{ gameName }} · {{ stageName }}</span>
                  <span v-if="metadata.status === 'PUBLIC'">已发布</span>
                  <span v-else-if="metadata.status === 'DRAFT'">草稿</span>
                  <span v-if="isNative">原生作业</span>
                  <span v-else>旧版转换：{{ legacyStatus.label }}</span>
                </div>
              </div>
              <div v-if="canEdit" class="page-header-actions">
                <router-link class="page-header-action" :to="'/work/' + metadata.id + '/edit'">编辑此作业</router-link>
              </div>
            </div>
            <div class="page-header-context work-object-meta">
              <span>#{{ metadata.id }}</span>
              <span>上传于 {{ formatDate(metadata.upload_time) }}</span>
            </div>
            <p v-if="!work" class="page-header-description conversion-notice" role="status">原作业暂时无法转换，以下仍保留元数据、问题报告与原始来源。</p>
          </div>
        </header>

        <div class="wrap detail-content">
          <section aria-labelledby="metadata-title">
            <div class="sec-head">
              <span class="idx">01</span><h2 id="metadata-title">作业信息</h2><span class="en">Metadata</span>
            </div>
            <div class="meta-grid detail-meta-grid">
              <div><div class="k">上传者 ID</div><div class="v">{{ metadata.uploader_id || '未提供' }}</div></div>
              <div><div class="k">来源类型</div><div class="v">{{ detail.source && detail.source.type || '未提供' }}</div></div>
              <div><div class="k">游戏</div><div class="v">{{ gameName }}</div></div>
              <div><div class="k">关卡</div><div class="v">{{ stageName }}</div></div>
            </div>
            <dl class="work-metrics" aria-label="作业统计">
              <div><dt>浏览量</dt><dd>{{ metadata.views }} 次</dd></div>
              <div><dt>点赞</dt><dd>{{ metadata.like_count }} 次</dd></div>
              <div><dt>热度</dt><dd>{{ formatMetric(metadata.hot_score) }} 分</dd></div>
            </dl>
            <div class="level-card" :class="{ unmatched: !detail.level }">
              <strong>关卡关联</strong>
              <template v-if="detail.level">
                <span>{{ detail.level.name || '名称未提供' }} · {{ detail.level.game || '游戏未提供' }}</span>
                <code>{{ detail.level.id || '关卡编号未提供' }}</code>
              </template>
              <span v-else>未可靠关联</span>
            </div>
          </section>

          <section aria-labelledby="team-title">
            <div class="sec-head">
              <span class="idx">02</span><h2 id="team-title">五槽位阵容</h2><span class="en">Operators</span>
            </div>
            <div v-if="work" class="operator-grid" aria-label="五槽位阵容表" tabindex="0">
              <article v-for="(operator, index) in operators" :key="index" class="operator-card">
                <span class="slot-number"><b>{{ index + 1 }}</b>{{ index + 1 }}号位</span>
                <img v-if="operator && AV[operator]" :src="AV[operator]" :alt="operator" width="88" height="88">
                <span v-else class="operator-fallback" aria-hidden="true">{{ operator ? operator.slice(0, 1) : '—' }}</span>
                <strong>{{ operator || '未指定' }}</strong>
              </article>
            </div>
            <p v-if="work" class="operator-hint">五位横排，窄屏可横向滑动查看完整阵容。</p>
            <p v-else class="section-note">这份旧版作业暂时无法展示密探槽位。</p>
          </section>

          <section aria-labelledby="details-title">
            <div class="sec-head">
              <span class="idx">03</span><h2 id="details-title">打法说明</h2><span class="en">Details</span>
            </div>
            <p class="work-details">{{ work && work.doc ? work.doc.details || '未提供打法说明' : '原作业暂时无法转换。' }}</p>
          </section>

          <section aria-labelledby="rounds-title">
            <div class="sec-head">
              <span class="idx">04</span><h2 id="rounds-title">回合动作</h2><span class="en">Round Actions</span>
            </div>
            <p v-if="roundRows.length" class="round-scroll-hint"><ArrowLeft :size="16" aria-hidden="true" /> 左右滑动查看全部密探槽位与流程 <ArrowRight :size="16" aria-hidden="true" /></p>
            <div v-if="roundRows.length" class="round-table-wrap" role="region" aria-label="回合动作表，可左右滚动" tabindex="0">
              <table class="round-table">
                <thead><tr><th>回合</th><th v-for="slot in 5" :key="slot"><span>{{ slot }}号位</span><strong>{{ operators[slot - 1] || '未指定' }}</strong></th><th><span>其他</span><strong>流程 / 检查</strong></th></tr></thead>
                <tbody>
                  <tr v-for="row in roundRows" :key="row.round">
                    <th scope="row">{{ row.round }}</th>
                    <td v-for="(entries, slotIndex) in row.slots" :key="slotIndex">
                      <ol v-if="entries.length" class="action-list">
                        <li v-for="entry in entries" :key="entry.index"><span>{{ entry.index }}</span>{{ entry.text }}</li>
                      </ol>
                      <span v-else class="cell-empty">—</span>
                    </td>
                    <td>
                      <ol v-if="row.process.length" class="action-list process-list">
                        <li v-for="entry in row.process" :key="entry.index"><span>{{ entry.index }}</span>{{ entry.text }}</li>
                      </ol>
                      <span v-if="!row.process.length && !row.remark" class="cell-empty">—</span>
                      <p v-if="row.remark" class="round-remark">备注：{{ row.remark }}</p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="section-note">没有可展示的回合动作。</p>
          </section>

          <section v-if="!isNative" aria-labelledby="legacy-title">
            <div class="sec-head">
              <span class="idx">05</span><h2 id="legacy-title">旧版作业转换</h2><span class="en">旧版来源</span>
            </div>
            <div class="compat-summary" :class="'status-' + legacyStatusKey">
              <div><span>旧版作业转换结果</span><strong>{{ legacyStatus.label }}</strong></div>
              <p>{{ legacyStatus.description }}</p>
            </div>
            <IssueList :issues="detail.conversion && detail.conversion.issues" empty-text="旧版作业转换没有发现问题。" />
          </section>

          <section aria-labelledby="compatibility-title">
            <div class="sec-head">
              <span class="idx">06</span><h2 id="compatibility-title">目标平台兼容性</h2><span class="en">Adapters</span>
            </div>
            <p class="section-note compat-note">这里显示作业在目标平台的适用情况，与上方旧版转换结果分别计算。</p>
            <div class="target-grid">
              <article v-for="target in TARGETS" :key="target.key" class="target-card">
                <header>
                  <div><span>{{ target.provider }}</span><h3>{{ target.label }}</h3></div>
                  <button type="button" :aria-expanded="expanded[target.key]" @click="toggleTarget(target.key)">
                    {{ expanded[target.key] ? '收起' : '检查兼容性' }}
                  </button>
                </header>
                <div v-if="expanded[target.key]" class="target-body" aria-live="polite">
                  <WorkCompatibilityResult :label="target.label" :state="compatibility[target.key]" @retry="loadCompatibility(target.key)" />
                </div>
              </article>
            </div>
          </section>

          <section v-if="!isNative" aria-labelledby="source-title">
            <div class="sec-head">
              <span class="idx">07</span><h2 id="source-title">原始来源</h2><span class="en">Raw Source</span>
            </div>
            <details class="raw-source">
              <summary>查看原始作业数据（默认折叠）</summary>
              <button type="button" @click="copyText(rawSource, 'raw')">复制原始数据</button>
              <pre>{{ rawSource }}</pre>
            </details>
          </section>

          <p class="copy-feedback" aria-live="polite">{{ copyFeedback }}</p>
        </div>

        <SiteFooter>
          <template #big>通关作业<br><span>查看完整打法</span></template>
          <template #fine>阵容、关卡和平台适用情况以作业实际提供的信息为准。</template>
        </SiteFooter>
      </template>
    </main>
  </div>
</template>

<script setup>
import { ArrowLeft, ArrowRight } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import '../../styles/page-header.css'
import { useRoute } from 'vue-router'
import { getWork, getWorkCompatibility } from '@/api/work.js'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import IssueList from '@/components/work/IssueList.vue'
import WorkCompatibilityResult from '@/components/work/WorkCompatibilityResult.vue'
import { AV } from '@/data/avatars.js'
import { auth } from '@/store/auth.js'
import { buildRoundRows, formatDate, formatMetric, normalizeOperators, statusInfo } from '@/utils/workDisplay.js'

const TARGETS = Object.freeze([
  { key: 'MAAYUAN', label: 'MaaYuan', provider: 'MaaYuan 平台' },
  { key: 'YUANASSIST', label: 'YuanAssist', provider: 'YuanAssist 平台' }
])

const props = defineProps({ id: { type: String, default: '' } })
const route = useRoute()
const detail = ref(null)
const loading = ref(true)
const invalidId = ref(false)
const notFound = ref(false)
const error = ref('')
const expanded = reactive({ MAAYUAN: false, YUANASSIST: false })
const compatibility = reactive({ MAAYUAN: emptyCompatibility(), YUANASSIST: emptyCompatibility() })
const copyFeedback = ref('')
let requestVersion = 0

const metadata = computed(function () { return detail.value && detail.value.metadata ? detail.value.metadata : {} })
const work = computed(function () { return detail.value && detail.value.work ? detail.value.work : null })
const operators = computed(function () { return normalizeOperators(work.value && work.value.operators) })
const roundRows = computed(function () { return buildRoundRows(work.value && work.value.rounds) })
const gameName = computed(function () { return (work.value && work.value.game) || (detail.value && detail.value.level && detail.value.level.game) || '游戏未提供' })
const stageName = computed(function () { return (detail.value && detail.value.level && detail.value.level.name) || (work.value && work.value.stage_name) || '关卡未提供' })
const rawSource = computed(function () { return detail.value && detail.value.source && detail.value.source.raw_content != null ? String(detail.value.source.raw_content) : '未提供原始数据' })
const legacyStatusKey = computed(function () { return detail.value && detail.value.conversion && detail.value.conversion.status || 'unknown' })
const legacyStatus = computed(function () { return statusInfo(legacyStatusKey.value) })
const isNative = computed(function () { return String(detail.value?.source?.type || '').toLowerCase() === 'native' })
const canEdit = computed(function () {
  if (!isNative.value || !auth.isLoggedIn) return false
  const user = auth.userInfo || {}
  const userId = String(user.id || user.userId || user.user_id || '')
  const ownerId = String(metadata.value.owner_id || metadata.value.ownerId || metadata.value.uploader_id || '')
  return Boolean(userId && userId === ownerId)
})
const backTarget = computed(function () {
  const page = Number(route.query.page)
  return { path: '/works', query: { page: Number.isInteger(page) && page > 0 ? page : 1 } }
})

function emptyCompatibility() {
  return { status: 'idle', data: null, error: '' }
}

function resetCompatibility() {
  compatibility.MAAYUAN = emptyCompatibility()
  compatibility.YUANASSIST = emptyCompatibility()
  expanded.MAAYUAN = false
  expanded.YUANASSIST = false
}

async function loadDetail() {
  const version = ++requestVersion
  detail.value = null
  invalidId.value = !/^(?:[1-9]\d*|w_[0-9a-fA-F]{24})$/.test(props.id)
  notFound.value = false
  error.value = ''
  copyFeedback.value = ''
  resetCompatibility()
  if (invalidId.value) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await getWork(props.id)
    if (version === requestVersion) detail.value = data
  } catch (cause) {
    if (version !== requestVersion) return
    if (cause && cause.status === 404) notFound.value = true
    else error.value = cause instanceof Error ? cause.message : '网络错误，请稍后重试'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function loadCompatibility(target) {
  const state = compatibility[target]
  if (!detail.value || state.status === 'loading' || state.status === 'success') return
  const version = requestVersion
  compatibility[target] = { status: 'loading', data: null, error: '' }
  try {
    const data = await getWorkCompatibility(props.id, target)
    if (version === requestVersion) compatibility[target] = { status: 'success', data, error: '' }
  } catch (cause) {
    if (version === requestVersion) compatibility[target] = { status: 'error', data: null, error: cause instanceof Error ? cause.message : '兼容性分析失败' }
  }
}

function toggleTarget(target) {
  expanded[target] = !expanded[target]
  if (expanded[target]) void loadCompatibility(target)
}

async function copyText(value, label) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(String(value))
    copyFeedback.value = (label === 'raw' ? '原始 JSON' : label + ' 标准化文档') + '已复制。'
  } catch (_) {
    copyFeedback.value = '复制失败，请手动选择文本复制。'
  }
}

watch(function () { return props.id }, function () { void loadDetail() }, { immediate: true })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.detail-state { border: 1.5px dashed var(--line); border-radius: 24px; background: var(--surface); color: var(--ink-60); }
.detail-state strong { color: var(--ink); }
.detail-state a, .detail-state button { border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--on-strong); text-decoration: none; cursor: pointer; }
.loading-mark { border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: detail-spin .8s linear infinite; }
.conversion-notice { color: var(--theme-danger-text, var(--rouge)); }
.work-metrics { color: var(--ink-60); }
.work-metrics dd { color: var(--ink); }
.level-card { border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.level-card span { color: var(--ink-60); }
.level-card code { color: var(--theme-info-text, var(--brand-blue)); }
.level-card.unmatched { border-style: dashed; }
.operator-grid { border: 1px solid var(--line); border-radius: 18px; background: var(--line); }
.operator-card { background: var(--surface); }
.operator-card img, .operator-fallback { border-radius: 18px; background: var(--paper); }
.operator-fallback { color: var(--ink-35); }
.slot-number { color: var(--ink-60); }
.slot-number b { border-radius: 50%; background: var(--slate); color: var(--on-strong); }
.operator-hint { color: var(--ink-35); }
.work-details, .section-note { border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); }
.section-note { color: var(--ink-60); }
.round-table-wrap { border: 1px solid var(--line); border-radius: 20px; background: var(--surface); }
.round-table-wrap:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.round-table { border-collapse: collapse; }
.round-table th, .round-table td { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.round-table thead th { background: var(--tea); color: var(--on-strong); }
.round-table thead th span { color: rgba(255, 248, 236, .64); }
.round-table tbody th { background: var(--paper); }
.action-list li > span { border-radius: 6px; background: var(--yellow); }
.cell-empty { color: var(--ink-35); }
.round-remark { color: var(--ink-60); }
.compat-summary { border: 1px solid currentColor; border-radius: 14px; background: var(--surface); }
.compat-summary span { color: var(--ink-60); }
.compat-summary p { color: var(--ink-60); }
.status-exact { color: var(--theme-success-text, #47704b); }
.status-partial { color: var(--theme-accent-text, var(--accent-strong)); }
.status-unsupported, .status-unknown { color: var(--theme-danger-text, var(--rouge)); }
:deep(.issue-empty) { color: var(--ink-60); }
:deep(.issue-list li) { border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
:deep(.severity) { border: 1px solid currentColor; border-radius: 6px; }
:deep(.severity-partial) { color: var(--theme-accent-text, var(--accent-strong)); }
:deep(.severity-unsupported) { color: var(--theme-danger-text, var(--rouge)); }
:deep(.issue-list dt) { color: var(--ink-35); }
:deep(.issue-list dd) { color: var(--ink-60); }
.target-card { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.target-card > header { background: var(--cream); }
.target-card header span { color: var(--ink-60); }
.target-card button, .raw-source button, .document-viewer button { border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--on-strong); cursor: pointer; }
.target-body > p:first-child { color: var(--ink-60); }
.target-error { color: var(--theme-danger-text, var(--rouge)); }
.document-viewer, .raw-source { border: 1px solid var(--line); border-radius: 14px; background: var(--cream); }
.document-viewer summary, .raw-source summary { cursor: pointer; }
.document-viewer pre, .raw-source pre { border-radius: 10px; background: var(--paper); color: var(--ink); }
.document-note { color: var(--ink-60); }
.raw-source { background: var(--surface); }
.copy-feedback { color: var(--theme-accent-text, var(--accent-strong)); }
@keyframes detail-spin { to { transform: rotate(360deg); } }
@media (max-width: 767px) {
  .detail-state { border-radius: 18px; }
  .operator-grid { border-radius: 0; }
  .round-table-wrap { border-radius: 0; }
  .round-scroll-hint { color: var(--ink-60); }
}
@media (prefers-reduced-motion: reduce) { .loading-mark { animation: none; } }
</style>
<style scoped src="./workDetailDesktop.css"></style>
<style scoped src="./workDetailMobile.css"></style>
