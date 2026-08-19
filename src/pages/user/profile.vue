<template>
  <div class="page-profile">
    <IslandSidebar />

    <main id="main-content" class="profile-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">个人中心</span>
            <span class="pill">账户</span>
            <span class="pill">开放接口</span>
          </div>
          <h1>我的账户<span class="small">凭据 · 权限 · 开放接口</span></h1>
          <p class="hero-sub">管理你的登录身份与「专属认证 Token」：按权限签发绑定到某个子账号的访问凭证，随时复制与吊销，安全连接你的自动化脚本与工具。</p>
          <div class="hero-stats">
            <div><div class="k">当前身份</div><div class="v"><span class="uname">{{ userName }}</span></div></div>
            <div><div class="k">权限范围</div><div class="v">{{ permissionCount }}<small>项</small></div></div>
            <div><div class="k">有效 Token</div><div class="v">{{ tokenCount }}<small>个</small></div></div>
            <div class="is-authed"><div class="k">登录状态</div><div class="v">已登录<small>凭据已就绪</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- Token 管理卡片 -->
          <div class="token-card" v-reveal>
            <div class="card-head">
              <div>
                <h2>专属认证 Token</h2>
                <p class="card-sub">每个 Token 绑定一个子账号（库存、密探、特别关注共用同一批账号），并按其 scopes 授予库存 / 密探的只读、只写、导出权限。库存与密探的 scope 可同时勾选，生成一个「双域 Token」。出于安全，Token 明文仅在生成时展示一次，列表不会再次展示此明文。</p>
              </div>
              <div class="gen-actions">
                <button class="act-btn ghost" :disabled="busy" @click="openGen">生成 Token</button>
              </div>
            </div>

            <!-- 生成面板 -->
            <div v-if="showGen" class="gen-panel">
              <div class="gen-row">
                <span class="gen-label">绑定子账号</span>
                <select v-model="genAccountId" class="gen-select">
                  <option v-if="!accounts.length" value="">（暂无子账号，请先在库存或密探页创建）</option>
                  <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </div>
              <p class="gen-tip">Token 权限由 scopes 决定，不区分账号域：库存与密探可同时勾选，生成一个 token 通吃两域。</p>
              <div class="gen-row">
                <span class="gen-label">权限范围</span>
                <label v-for="p in scopeOptions" :key="p.scope" class="gen-check">
                  <input type="checkbox" :value="p.scope" v-model="genScopes" />
                  <span>{{ p.scope }}<small> · {{ p.description }}</small></span>
                </label>
              </div>
              <div class="gen-row">
                <span class="gen-label">备注</span>
                <input v-model.trim="genRemark" class="gen-input" autocomplete="off" placeholder="可选，如「派遣脚本」" />
              </div>
              <div class="gen-actions">
                <button class="act-btn ghost" :disabled="generating" @click="showGen = false">取消</button>
                <button class="act-btn primary" :disabled="generating || !genAccountId || !genScopes.length" @click="doGenerate">生成 Token</button>
              </div>
            </div>

            <!-- 一次性展示刚生成的 Token -->
            <div v-if="newToken" class="new-token">
              <p class="nt-tip">Token 已生成，请立即复制保存 —— 下方列表不会再次展示此明文：</p>
              <div class="nt-row">
                <code class="nt-code">{{ newToken.token }}</code>
                <button class="t-btn copy" type="button" @click="copyToken(newToken.token)">复制</button>
                <button class="t-btn del" type="button" @click="newToken = null">我已保存</button>
              </div>
              <p class="nt-meta">绑定子账号：{{ newToken.account_name || newToken.account_id }}</p>
            </div>

            <!-- 提示状态 -->
            <div v-if="notice" class="notice-line" :class="{ err: noticeError }" role="status" aria-live="polite">{{ notice }}</div>

            <!-- 列表 -->
            <div v-if="loading" class="state">正在加载 Token…</div>
            <div v-else-if="error" class="state err">{{ error }}<button class="link" @click="loadTokens">重试</button></div>
            <div v-else-if="tokens.length === 0" class="state">暂无 Token，点击上方按钮生成一个</div>
            <ul v-else class="token-list">
              <li v-for="t in tokens" :key="t.token_id" class="token-item">
                <span class="t-dot" :class="dotClass(t.scopes)"></span>
                <div class="t-meta">
                  <span class="tag domain" :class="'dom-' + domainOf(t.scopes)">{{ domainLabel(t.scopes) }}</span>
                  <span class="tag" :class="dotClass(t.scopes)">{{ scopeDesc(t.scopes) }}</span>
                  <span class="t-account">子账号：{{ t.account_name || t.account_id }}</span>
                  <span v-if="t.remark" class="t-remark">{{ t.remark }}</span>
                  <span v-if="t.created_at" class="t-created">签发于 {{ formatCreateTime(t.created_at) }}</span>
                </div>
                <code class="t-token" :title="t.token_id">{{ t.token_id }}</code>
                <button class="t-btn del" type="button" :disabled="busy" @click="removeToken(t)">删除</button>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>个人中心<br><span>凭据 · 权限 · 开放接口</span></template>
        <template #fine>
          <b>YuanHub</b> · 专属认证 Token 管理<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          Token 仅用途：库存 / 密探数据只读、写入、导出，请勿泄露给他人
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { auth } from '../../store/auth.js'
import { listAccounts } from '../../api/accounts.js'
import {
  getOpenApiPermissions,
  getOpenApiTokens,
  generateOpenApiToken,
  deleteOpenApiToken
} from '../../api/openApi.js'
import {
  scopeDesc as _scopeDesc,
  isReadonly as _isReadonly,
  isWriteonly as _isWriteonly,
  scopeDomain as _scopeDomain,
  FALLBACK_DESCRIPTIONS as FALLBACK_SCOPES,
  formatCreateTime as _formatCreateTime
} from '../../utils/openApiToken.js'

const tokens = ref([])
const permissions = ref([])
const accounts = ref([])
const loading = ref(false)
const error = ref('')
const generating = ref(false)
const notice = ref('')
const noticeError = ref(false)
let noticeTimer = null

const showGen = ref(false)
// 统一子账号（库存 × 密探共用一套账号，直接来自 GET /v1/accounts）
const genAccountId = ref('')
const genScopes = ref(['inventory:read'])
const genRemark = ref('')
const newToken = ref(null)

const userName = computed(() => (auth.userInfo && auth.userInfo.user_name) ? auth.userInfo.user_name : '用户')

// scope 解析/描述/时间格式化逻辑已抽离到 src/utils/openApiToken.js（可单测）。
// 这里用薄封装绑定当前页面的 permissions / 兜底映射，供模板直接调用。
function scopeDesc(scope) {
  return _scopeDesc(scope, permissions.value, FALLBACK_SCOPES)
}
function dotClass(scope) {
  if (_isReadonly(scope)) return 'ro'
  if (_isWriteonly(scope)) return 'rw'
  return 'mix'
}
function domainOf(scope) {
  return _scopeDomain(scope)
}
function domainLabel(scope) {
  const d = domainOf(scope)
  if (d === 'operator') return '密探'
  if (d === 'inventory') return '库存'
  if (d === 'mixed') return '混合'
  return '未知'
}
function formatCreateTime(value) {
  return _formatCreateTime(value)
}

const permissionCount = computed(function () {
  return permissions.value.length || 6
})
const tokenCount = computed(function () { return tokens.value.length })

// 权限候选：库存与密探全部平铺展示，可跨域同时勾选（生成双域 Token）；
// 读不到后端权限列表时用内置六项兜底。
const FALLBACK_PERMISSIONS = [
  { scope: 'inventory:read', description: '库存数据读取' },
  { scope: 'inventory:write', description: '库存数据写入' },
  { scope: 'inventory:export', description: '库存数据导出' },
  { scope: 'operator:read', description: '密探数据读取' },
  { scope: 'operator:write', description: '密探数据写入' },
  { scope: 'operator:export', description: '密探数据导出' }
]
const scopeOptions = computed(function () {
  return permissions.value.length ? permissions.value : FALLBACK_PERMISSIONS
})

function toast(text, isError) {
  notice.value = text
  noticeError.value = !!isError
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(function () {
    notice.value = ''
    noticeError.value = false
  }, 3200)
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

const busy = computed(function () { return loading.value || generating.value })

async function loadTokens() {
  loading.value = true
  error.value = ''
  try {
    const data = await getOpenApiTokens()
    tokens.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = humanErr(err, 'Token 列表加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

async function loadAccounts() {
  try {
    const data = await listAccounts()
    accounts.value = Array.isArray(data) ? data : []
    if (!genAccountId.value && accounts.value.length) genAccountId.value = accounts.value[0].id
    // 若当前选中的账号已被删除，切到第一个账号
    if (genAccountId.value && !accounts.value.some(function (a) { return a.id === genAccountId.value })) {
      genAccountId.value = accounts.value.length ? accounts.value[0].id : ''
    }
  } catch (_e) {
    // 账号列表加载失败不阻断 Token 列表；保留已有数据
  }
}

function openGen() {
  showGen.value = true
  if (!genScopes.value.length) {
    genScopes.value = ['inventory:read']
  }
  if (!genAccountId.value && accounts.value.length) genAccountId.value = accounts.value[0].id
}

async function doGenerate() {
  if (busy.value) return
  if (!genAccountId.value) { toast('请先选择要绑定的子账号', true); return }
  if (!genScopes.value.length) { toast('请至少选择一个权限', true); return }
  generating.value = true
  try {
    const created = await generateOpenApiToken({
      accountId: genAccountId.value,
      scopes: genScopes.value.slice(),
      remark: genRemark.value || null
    })
    newToken.value = created || null
    showGen.value = false
    genRemark.value = ''
    toast('Token 已生成')
    await loadTokens()
  } catch (err) {
    toast(humanErr(err, '生成 Token 失败'), true)
  } finally {
    generating.value = false
  }
}

async function removeToken(t) {
  const id = t && t.token_id
  if (!id) return
  if (!confirm('确定删除这个 Token 吗？删除后使用它的服务将立即失效。')) return
  try {
    await deleteOpenApiToken(id)
    toast('Token 已删除')
    await loadTokens()
  } catch (err) {
    toast(humanErr(err, '删除 Token 失败'), true)
  }
}

async function copyToken(token) {
  try {
    await navigator.clipboard.writeText(token)
    toast('已复制到剪贴板')
  } catch (_e) {
    try {
      const ta = document.createElement('textarea')
      ta.value = token
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      toast('已复制到剪贴板')
    } catch (_e2) {
      toast('复制失败，请手动选择复制', true)
    }
  }
}

onMounted(async function () {
  try {
    const data = await getOpenApiPermissions()
    permissions.value = Array.isArray(data) ? data : []
  } catch (_e) {
    permissions.value = []
  }
  await loadAccounts()
  loadTokens()
})
</script>

<style scoped>
.act-btn.primary { border-color: transparent; background: var(--tea); color: var(--cream) }
.act-btn.primary:hover:not(:disabled) { background: var(--accent); color: #fff }
.gen-panel { margin-top: 18px; background: var(--paper); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px }
.gen-row { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap }
.gen-label { flex: none; width: 84px; font-size: 13px; font-weight: 800; color: var(--ink); padding-top: 8px }
.gen-select { flex: 1; min-width: 200px; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--surface); outline: none; cursor: pointer }
.gen-input { flex: 1; min-width: 200px; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--surface); outline: none }
.gen-tip { width: 100%; font-size: 12px; color: var(--ink-60); line-height: 1.7; padding-top: 2px }
.gen-check { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-60); font-weight: 600; cursor: pointer; background: var(--surface); border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 14px }
.gen-check input { accent-color: var(--accent); cursor: pointer }
.gen-check small { color: var(--ink-35); font-size: 11px }
.gen-actions { display: flex; justify-content: flex-end; gap: 10px }
.new-token { margin-top: 18px; background: var(--yellow); border: 1px solid transparent; border-radius: 16px; padding: 16px 18px }
.nt-tip { font-size: 12.5px; color: var(--ink); font-weight: 700; line-height: 1.7 }
.nt-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap }
.nt-code { flex: 1; min-width: 200px; font-family: var(--font-d); font-size: 13px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; word-break: break-all }
.nt-meta { margin-top: 8px; font-size: 12px; color: var(--ink-60); font-weight: 600 }
.t-dot.mix { background: var(--brand-blue) }
.tag.mix { background: rgba(91, 106, 140, .12); color: var(--slate-deep) }
.t-account { font-size: 12px; color: var(--ink); font-weight: 700 }

/* —— 复用全局 CSS 变量（不新增色值），对齐库存（inventory）页版式 —— */
.profile-main { padding-bottom: 40px }
.page-profile .hero::after { content: '档案' }

.hero-stats .uname {
  font-family: var(--font-s);
  font-weight: 900;
  font-size: 26px;
  letter-spacing: .02em;
}
.hero-stats .v small { vertical-align: baseline }
.hero-stats div.is-authed .v { font-size: 26px }

.token-card {
  margin-top: 40px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  padding: 28px 30px;
}
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap }
.card-head h2 { font-family: var(--font-s); font-weight: 900; font-size: 24px; letter-spacing: .04em; color: var(--ink) }
.card-sub { margin-top: 8px; font-size: 13px; line-height: 1.8; color: var(--ink-60); max-width: 560px }
.gen-actions { display: flex; gap: 10px; flex-wrap: wrap }

.act-btn {
  border: 1.5px solid var(--line); background: var(--paper); border-radius: 999px;
  padding: 10px 20px; font-size: 13px; font-weight: 800; color: var(--ink);
  cursor: pointer; font-family: var(--font-b); transition: all .3s var(--ease); white-space: nowrap;
}
.act-btn.ghost:hover:not(:disabled) { border-color: var(--ink); background: var(--cream); color: var(--ink) }
.act-btn:disabled { opacity: .45; cursor: not-allowed }

.notice-line {
  margin-top: 18px;
  background: var(--yellow);
  color: var(--ink);
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.6;
}
.notice-line.err { background: rgba(166, 81, 74, .14); color: var(--rouge) }

.state { background: var(--surface); border: 1.5px dashed var(--line); border-radius: 20px; padding: 56px 40px; text-align: center; color: var(--ink-35); font-weight: 700; margin-top: 20px }
.state.err { color: var(--ink-60) }
.state .link { margin-left: 12px; background: none; border: none; color: var(--accent); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }

.token-list { list-style: none; margin-top: 20px; display: flex; flex-direction: column; gap: 12px }
.token-item {
  display: flex; align-items: center; gap: 16px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 14px 18px;
  transition: transform .45s var(--ease), box-shadow .45s var(--ease), border-color .3s;
}
.token-item:hover { transform: translateY(-3px); box-shadow: 0 18px 36px -20px rgba(73, 59, 44, .26); border-color: rgba(73, 59, 44, .22) }
.t-dot { width: 10px; height: 10px; border-radius: 50%; flex: none }
.t-dot.ro { background: var(--yellow-deep) }
.t-dot.rw { background: var(--accent) }

.t-meta { display: flex; flex-direction: column; gap: 3px; min-width: 180px; flex: none }
.tag { align-self: flex-start; font-size: 11px; font-weight: 700; border-radius: 7px; padding: 2px 10px; letter-spacing: .05em }
.tag.ro { background: var(--yellow); color: var(--ink) }
.tag.rw { background: rgba(215, 137, 53, .14); color: var(--accent-strong) }
.tag.domain { border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); margin-right: -4px }
.tag.domain.dom-inventory { border-color: rgba(91, 106, 140, .45); color: var(--slate-deep) }
.tag.domain.dom-operator { border-color: rgba(215, 137, 53, .55); color: var(--accent-strong) }
.tag.domain.dom-mixed { border-color: rgba(166, 81, 74, .4); color: var(--rouge) }
.t-scope { font-family: var(--font-d); font-size: 11px; color: var(--ink-35) }
.t-remark { font-size: 11.5px; color: var(--ink-60) }
.t-created { font-size: 11px; color: var(--ink-35) }

.t-token {
  flex: 1; min-width: 0;
  font-family: var(--font-d); font-size: 12.5px; color: var(--ink);
  background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.t-btn {
  flex: none; border: none; border-radius: 10px; padding: 8px 16px;
  font-size: 12.5px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: all .3s var(--ease);
}
.t-btn.copy { background: var(--tea); color: var(--cream) }
.t-btn.copy:hover:not(:disabled) { background: var(--accent); color: #fff }
.t-btn.del { background: transparent; border: 1.5px solid var(--line); color: var(--ink-60) }
.t-btn.del:hover:not(:disabled) { border-color: var(--rouge); color: var(--rouge) }
.t-btn:disabled { opacity: .45; cursor: not-allowed }

@media (max-width: 640px) {
  .token-item { flex-wrap: wrap }
  .t-meta { min-width: 0; flex: 1 }
  .t-token { flex-basis: 100%; order: 3 }
}
</style>
