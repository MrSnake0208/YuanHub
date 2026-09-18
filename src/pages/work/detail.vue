<template>
  <div class="page-detail work-detail-page">
    <IslandSidebar />

    <main id="main-content">
      <div v-if="loading" class="detail-state-wrap" aria-live="polite" aria-busy="true">
        <div class="detail-state skeleton-state">
          <span class="loading-mark" aria-hidden="true"></span>
          <strong>正在加载作业详情</strong>
          <span>正在读取协议内容与 Legacy 转换结果。</span>
        </div>
      </div>

      <div v-else-if="invalidId" class="detail-state-wrap" aria-live="polite">
        <div class="detail-state error-state">
          <strong>无效的作业链接</strong>
          <span>作业 ID 必须是正整数，本次没有发送网络请求。</span>
          <router-link to="/works">← 返回作业广场</router-link>
        </div>
      </div>

      <div v-else-if="notFound" class="detail-state-wrap" aria-live="polite">
        <div class="detail-state error-state">
          <strong>作业不存在、非公开或已删除</strong>
          <span>请返回作业广场选择其他公开作业。</span>
          <router-link :to="backTarget">← 返回作业广场</router-link>
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
        <header class="hero" :style="{ '--wm': JSON.stringify(String(metadata.id || '作业')) }">
          <div class="wrap">
            <router-link class="back-link" :to="backTarget">← 返回作业广场</router-link>
            <div class="crumb">
              <span class="pill fill">{{ gameName }}</span>
              <span class="pill">{{ stageName }}</span>
              <span class="plain">#{{ metadata.id }}</span>
            </div>
            <h1>{{ metadata.title || '未命名作业' }}<span class="small">真实 Work 数据</span></h1>
            <p class="hero-sub">{{ work ? (work.doc && work.doc.details) || '未提供打法说明' : '原作业暂时无法转换，以下仍保留元数据、问题报告与原始来源。' }}</p>
            <div class="hero-stats" aria-label="作业元数据">
              <div><div class="k">浏览量</div><div class="v">{{ metadata.views }}<small>次</small></div></div>
              <div><div class="k">点赞</div><div class="v">{{ metadata.like_count }}<small>次</small></div></div>
              <div><div class="k">热度</div><div class="v">{{ formatMetric(metadata.hot_score) }}<small>分</small></div></div>
              <div><div class="k">上传时间</div><div class="v date-value">{{ formatDate(metadata.upload_time) }}</div></div>
            </div>
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
            <div class="level-card" :class="{ unmatched: !detail.level }">
              <strong>Level Catalog 关联</strong>
              <template v-if="detail.level">
                <span>{{ detail.level.name || '名称未提供' }} · {{ detail.level.game || '游戏未提供' }}</span>
                <code>{{ detail.level.id || '稳定 key 未提供' }}</code>
              </template>
              <span v-else>未可靠关联</span>
            </div>
          </section>

          <section aria-labelledby="team-title">
            <div class="sec-head">
              <span class="idx">02</span><h2 id="team-title">五槽位阵容</h2><span class="en">Operators</span>
            </div>
            <div v-if="work" class="operator-grid">
              <article v-for="(operator, index) in operators" :key="index" class="operator-card">
                <span class="slot-number">{{ index + 1 }}号位</span>
                <img v-if="operator && AV[operator]" :src="AV[operator]" :alt="operator" width="88" height="88">
                <span v-else class="operator-fallback" aria-hidden="true">{{ operator ? operator.slice(0, 1) : '—' }}</span>
                <strong>{{ operator || '未指定' }}</strong>
              </article>
            </div>
            <p v-else class="section-note">协议转换未生成 Work 文档，无法展示槽位。</p>
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
            <div v-if="roundRows.length" class="round-table-wrap">
              <table class="round-table">
                <thead><tr><th>回合</th><th v-for="slot in 5" :key="slot">{{ slot }}号位</th><th>流程 / 检查</th></tr></thead>
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

          <section aria-labelledby="legacy-title">
            <div class="sec-head">
              <span class="idx">05</span><h2 id="legacy-title">Legacy 转换</h2><span class="en">Source to Work v1</span>
            </div>
            <div class="compat-summary" :class="'status-' + legacyStatusKey">
              <div><span>Legacy Source → Work v1</span><strong>{{ legacyStatus.label }}</strong></div>
              <p>{{ legacyStatus.description }}</p>
            </div>
            <IssueList :issues="detail.conversion && detail.conversion.issues" empty-text="Legacy 转换没有报告问题。" />
          </section>

          <section aria-labelledby="compatibility-title">
            <div class="sec-head">
              <span class="idx">06</span><h2 id="compatibility-title">目标平台兼容性</h2><span class="en">Adapters</span>
            </div>
            <p class="section-note compat-note">这是 Work v1 → 目标平台的分析，与上方 Legacy 转换状态相互独立。</p>
            <div class="target-grid">
              <article v-for="target in TARGETS" :key="target.key" class="target-card">
                <header>
                  <div><span>{{ target.provider }}</span><h3>{{ target.label }}</h3></div>
                  <button type="button" :aria-expanded="expanded[target.key]" @click="toggleTarget(target.key)">
                    {{ expanded[target.key] ? '收起' : '检查兼容性' }}
                  </button>
                </header>
                <div v-if="expanded[target.key]" class="target-body" aria-live="polite">
                  <p v-if="compatibility[target.key].status === 'loading'">正在分析兼容性…</p>
                  <div v-else-if="compatibility[target.key].status === 'error'" class="target-error" role="alert">
                    <span>{{ compatibility[target.key].error }}</span>
                    <button type="button" @click="loadCompatibility(target.key)">重试</button>
                  </div>
                  <template v-else-if="compatibility[target.key].data">
                    <div class="compat-summary" :class="'status-' + compatibility[target.key].data.status">
                      <div><span>{{ target.label }}</span><strong>{{ statusInfo(compatibility[target.key].data.status).label }}</strong></div>
                      <p>{{ statusInfo(compatibility[target.key].data.status).description }}</p>
                    </div>
                    <IssueList :issues="compatibility[target.key].data.issues" empty-text="目标平台没有报告兼容性问题。" />
                    <details v-if="compatibility[target.key].data.target_document" class="document-viewer">
                      <summary>查看标准化文档</summary>
                      <button type="button" @click="copyText(safeJson(compatibility[target.key].data.target_document), target.key)">复制标准化文档</button>
                      <pre>{{ safeJson(compatibility[target.key].data.target_document) }}</pre>
                    </details>
                    <p v-else class="document-note">此分析没有返回目标文档，不提供下载或执行入口。</p>
                  </template>
                </div>
              </article>
            </div>
          </section>

          <section aria-labelledby="source-title">
            <div class="sec-head">
              <span class="idx">07</span><h2 id="source-title">原始来源</h2><span class="en">Raw Source</span>
            </div>
            <details class="raw-source">
              <summary>查看 raw source（默认折叠）</summary>
              <button type="button" @click="copyText(rawSource, 'raw')">复制原始 JSON</button>
              <pre>{{ rawSource }}</pre>
            </details>
          </section>

          <p class="copy-feedback" aria-live="polite">{{ copyFeedback }}</p>
        </div>

        <SiteFooter>
          <template #big>Work v1<br><span>忠实展示兼容性</span></template>
          <template #fine>页面不推断接口未提供的阵容练度、关卡关系或执行能力。</template>
        </SiteFooter>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getWork, getWorkCompatibility } from '@/api/work.js'
import IslandSidebar from '@/components/IslandSidebar.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { AV } from '@/data/avatars.js'
import { buildRoundRows, formatDate, formatMetric, normalizeOperators, safeJson, statusInfo } from '@/utils/workDisplay.js'

const TARGETS = Object.freeze([
  { key: 'MAAYUAN', label: 'MAAYUAN', provider: 'MaaYuan Adapter' },
  { key: 'YUANASSIST', label: 'YUANASSIST', provider: 'YuanAssist Adapter' }
])

const IssueList = defineComponent({
  props: { issues: { type: Array, default: function () { return [] } }, emptyText: { type: String, required: true } },
  setup(props) {
    return function () {
      if (!props.issues.length) return h('p', { class: 'issue-empty' }, props.emptyText)
      return h('ul', { class: 'issue-list' }, props.issues.map(function (issue, index) {
        return h('li', { key: (issue && issue.code) || index }, [
          h('div', { class: 'issue-head' }, [
            h('span', { class: ['severity', 'severity-' + (issue && issue.severity)] }, (issue && issue.severity) || 'unknown'),
            h('strong', null, (issue && issue.message) || '未提供问题说明')
          ]),
          h('dl', null, [
            h('div', null, [h('dt', null, 'feature'), h('dd', null, (issue && issue.feature) || '未提供')]),
            h('div', null, [h('dt', null, 'path'), h('dd', null, (issue && issue.path) || '未提供')]),
            h('div', null, [h('dt', null, 'code'), h('dd', null, (issue && issue.code) || '未提供')])
          ])
        ])
      }))
    }
  }
})

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
  invalidId.value = !/^[1-9]\d*$/.test(props.id)
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
.detail-state-wrap { min-height: 100vh; display: grid; place-items: center; padding: 80px 48px; }
.detail-state { width: min(620px, 100%); min-height: 300px; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 40px; border: 1.5px dashed var(--line); border-radius: 24px; background: var(--surface); color: var(--ink-60); text-align: center; }
.detail-state strong { color: var(--ink); font: 900 24px var(--font-s); }
.detail-state span { line-height: 1.7; }
.detail-state a, .detail-state button { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px; border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); font: 800 13px var(--font-b); text-decoration: none; cursor: pointer; }
.state-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.loading-mark { width: 38px; height: 38px; border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: detail-spin .8s linear infinite; }
.back-link { display: inline-flex; min-height: 44px; align-items: center; margin-bottom: 22px; color: var(--ink); font-weight: 800; text-decoration: none; }
.date-value { max-width: 240px; font: 800 17px/1.5 var(--font-b) !important; letter-spacing: 0 !important; }
.detail-content { padding-top: 56px; }
.detail-content section + section { margin-top: 64px; }
.detail-meta-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.level-card { margin-top: 16px; display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; padding: 18px 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.level-card strong { font-family: var(--font-s); }
.level-card span { color: var(--ink-60); }
.level-card code { margin-left: auto; color: var(--brand-blue); overflow-wrap: anywhere; }
.level-card.unmatched { border-style: dashed; }
.operator-grid { margin-top: 28px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; }
.operator-card { min-width: 0; display: grid; justify-items: center; gap: 10px; padding: 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); text-align: center; }
.operator-card img, .operator-fallback { width: 88px; height: 88px; display: grid; place-items: center; border-radius: 18px; background: var(--paper); object-fit: cover; }
.operator-fallback { color: var(--ink-35); font: 900 28px var(--font-s); }
.slot-number { color: var(--ink-60); font: 800 11px var(--font-d); }
.operator-card strong { overflow-wrap: anywhere; }
.work-details, .section-note { margin-top: 28px; padding: 22px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); font-size: 14px; line-height: 1.9; white-space: pre-wrap; overflow-wrap: anywhere; }
.section-note { color: var(--ink-60); }
.round-table-wrap { margin-top: 28px; overflow-x: auto; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); }
.round-table { width: 100%; min-width: 980px; border-collapse: collapse; }
.round-table th, .round-table td { padding: 14px 12px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.round-table thead th { background: var(--tea); color: var(--cream); font-size: 12px; }
.round-table tbody th { background: var(--paper); font: 900 18px var(--font-d); }
.action-list { min-width: 110px; display: grid; gap: 8px; list-style: none; }
.action-list li { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
.action-list li > span { width: 20px; height: 20px; flex: none; display: grid; place-items: center; border-radius: 6px; background: var(--yellow); font: 800 10px var(--font-d); }
.process-list { min-width: 190px; }
.cell-empty { color: var(--ink-35); }
.round-remark { margin-top: 10px; color: var(--ink-60); font-size: 11px; line-height: 1.6; white-space: pre-wrap; }
.compat-summary { margin-top: 28px; padding: 18px 20px; border: 1px solid currentColor; border-radius: 14px; background: var(--surface); }
.compat-summary > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.compat-summary span { color: var(--ink-60); font-size: 12px; }
.compat-summary strong { font-family: var(--font-s); }
.compat-summary p { margin-top: 8px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.status-exact { color: #47704b; }
.status-partial { color: var(--accent-strong); }
.status-unsupported, .status-unknown { color: var(--rouge); }
:deep(.issue-empty) { margin-top: 12px; color: var(--ink-60); font-size: 13px; }
:deep(.issue-list) { margin-top: 14px; display: grid; gap: 10px; list-style: none; }
:deep(.issue-list li) { padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); }
:deep(.issue-head) { display: flex; align-items: flex-start; gap: 10px; }
:deep(.issue-head strong) { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
:deep(.severity) { flex: none; padding: 3px 7px; border: 1px solid currentColor; border-radius: 6px; font: 800 10px var(--font-d); }
:deep(.severity-partial) { color: var(--accent-strong); }
:deep(.severity-unsupported) { color: var(--rouge); }
:deep(.issue-list dl) { margin-top: 10px; display: grid; gap: 6px; }
:deep(.issue-list dl div) { min-width: 0; display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; font: 11px/1.6 var(--font-d); }
:deep(.issue-list dt) { color: var(--ink-35); }
:deep(.issue-list dd) { color: var(--ink-60); overflow-wrap: anywhere; }
.compat-note { margin-top: 20px; }
.target-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
.target-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.target-card > header { min-height: 92px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; background: var(--cream); }
.target-card header span { color: var(--ink-60); font-size: 11px; }
.target-card h3 { margin-top: 4px; font: 900 18px var(--font-d); }
.target-card button, .raw-source button, .document-viewer button { min-height: 44px; padding: 8px 13px; border: 1px solid var(--tea); border-radius: 999px; background: var(--tea); color: var(--cream); font: 800 12px var(--font-b); cursor: pointer; }
.target-body { padding: 0 20px 20px; }
.target-body > p:first-child { padding-top: 20px; color: var(--ink-60); }
.target-error { padding-top: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--rouge); }
.document-viewer, .raw-source { margin-top: 16px; padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--cream); }
.document-viewer summary, .raw-source summary { min-height: 44px; display: flex; align-items: center; font-weight: 800; cursor: pointer; }
.document-viewer button, .raw-source button { margin: 10px 0; }
.document-viewer pre, .raw-source pre { max-width: 100%; max-height: 520px; overflow: auto; padding: 14px; border-radius: 10px; background: var(--paper); color: var(--ink); font: 11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.document-note { margin-top: 14px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.raw-source { margin-top: 28px; background: var(--surface); }
.copy-feedback { min-height: 24px; margin-top: 14px; color: var(--accent-strong); font-size: 12px; }
@keyframes detail-spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .operator-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .target-grid { grid-template-columns: 1fr; }
  .detail-meta-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .detail-state-wrap { padding: 40px 16px; }
  .detail-state { min-height: 260px; padding: 28px 18px; border-radius: 18px; }
  .detail-content { padding-top: 36px; }
  .detail-content section + section { margin-top: 44px; }
  .detail-meta-grid { grid-template-columns: 1fr; }
  .level-card code { width: 100%; margin-left: 0; }
  .operator-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .operator-card:last-child { grid-column: 1 / -1; }
  .target-card > header { align-items: flex-start; flex-direction: column; }
  .target-card > header button { width: 100%; }
  .round-table-wrap { margin-inline: -16px; border-radius: 0; }
}
@media (prefers-reduced-motion: reduce) { .loading-mark { animation: none; } }
</style>
