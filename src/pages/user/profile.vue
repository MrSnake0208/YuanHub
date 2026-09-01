<template>
  <div class="page-profile">
    <IslandSidebar />

    <main id="main-content" class="profile-main">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">个人中心</span>
            <span class="pill">应用连接</span>
            <span class="pill">安全</span>
          </div>
          <h1>我的账户<span class="small">账号 · 应用 · 数据连接</span></h1>
          <p class="hero-sub">在这里连接 MaaYuan 或管理其他第三方工具。每条连接只访问你选中的游戏账号，也可以随时停止。</p>
          <div class="hero-stats">
            <div><div class="k">当前身份</div><div class="v"><span class="uname">{{ userName }}</span></div></div>
            <div><div class="k">可供 MaaYuan 使用</div><div class="v">{{ maaYuanReadyCount }}<small>条</small></div></div>
            <div><div class="k">有效连接</div><div class="v">{{ tokenCount }}<small>条</small></div></div>
            <div class="is-authed"><div class="k">登录状态</div><div class="v">已登录<small>连接可管理</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <div v-if="auth.adminAccessLoaded && adminToolGroups.length" class="admin-tools" v-reveal>
            <div class="admin-tools-head">
              <span class="admin-kicker">管理入口</span>
              <h2>当前可用的管理内容</h2>
              <p>按当前授权显示。日常处理请进入管理工作台。</p>
            </div>
            <div class="admin-tools-body">
              <router-link class="admin-workbench-link" to="/manage">
                <LayoutDashboard :size="17" aria-hidden="true" />
                <span><b>打开管理工作台</b><small>从一个入口进入所有已授权的管理工具</small></span>
              </router-link>
              <div class="admin-entry-groups">
                <section v-for="group in adminToolGroups" :key="group.key" class="admin-entry-group">
                  <h3>{{ group.label }}</h3>
                  <nav :aria-label="group.label">
                    <router-link v-for="tool in group.tools" :key="tool.to" class="admin-entry" :to="tool.to">
                      <component :is="tool.icon" :size="17" aria-hidden="true" />
                      <span><b>{{ tool.label }}</b><small>{{ tool.description }}</small></span>
                    </router-link>
                  </nav>
                </section>
              </div>
            </div>
          </div>

          <div class="connection-card" v-reveal>
            <div class="card-head">
              <div>
                <span class="section-kicker">APPLICATION CONNECTIONS</span>
                <h2>应用与数据连接</h2>
                <p class="card-sub">连接码类似一把只供某个工具使用的钥匙，不是你的登录密码。你可以查看它能做什么，并随时停止访问。</p>
              </div>
            </div>

            <article class="app-pass" aria-labelledby="maayuan-app-title">
              <div class="app-seal" aria-hidden="true"><img src="/icons/maa.png" alt="" /></div>
              <div class="app-copy">
                <div class="app-title-row">
                  <h3 id="maayuan-app-title">MaaYuan</h3>
                  <span class="brand-outline">联合共建</span>
                </div>
                <p>把游戏内采集到的库存与密探信息安全上传到 YuanHub，不读取你已经保存在站内的数据。</p>
                <div class="app-capabilities" aria-label="MaaYuan 使用的数据能力">
                  <span><PackageOpen :size="15" aria-hidden="true" />上传库存</span>
                  <span><ScanLine :size="15" aria-hidden="true" />上传密探采集结果</span>
                  <span class="no-read"><ShieldCheck :size="15" aria-hidden="true" />不授予读取权限</span>
                </div>
              </div>
              <button class="act-btn primary app-connect" type="button" :disabled="busy" :aria-expanded="showMaaYuanConnect" aria-controls="maayuan-connect-panel" @click="openMaaYuanConnect">
                <Link2 :size="17" aria-hidden="true" />{{ showMaaYuanConnect ? '收起' : '连接 MaaYuan' }}
              </button>
            </article>

            <form v-if="showMaaYuanConnect" id="maayuan-connect-panel" class="connect-panel" aria-labelledby="connect-panel-title" @submit.prevent="createMaaYuanConnection">
              <div class="panel-title">
                <span class="step-mark">1</span>
                <div>
                  <h3 id="connect-panel-title">选择数据保存到哪个账号</h3>
                  <p>连接码只会绑定一个子账号，不能访问你的其他账号。</p>
                </div>
              </div>

              <div v-if="accountsLoading" class="account-inline-state" role="status">正在加载游戏账号…</div>
              <div v-else-if="accountLoadError" class="account-inline-state error" role="alert">
                <span>{{ accountLoadError }}</span>
                <button class="text-btn" type="button" @click="loadAccounts">重新加载</button>
              </div>
              <template v-else-if="accounts.length">
                <label class="field-label" for="maayuan-account">游戏账号</label>
                <select id="maayuan-account" ref="maaAccountSelect" v-model="maaAccountId" class="form-control" :disabled="creatingMode === 'maayuan'" aria-describedby="maayuan-account-help">
                  <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
                </select>
                <p id="maayuan-account-help" class="field-help">同时管理你的库存与密探信息。</p>
              </template>
              <section v-else class="quick-account" aria-labelledby="quick-account-title">
                <div class="quick-account-heading">
                  <h4 id="quick-account-title">还没有子账号，先在这里创建</h4>
                </div>
                <fieldset class="game-choice">
                  <legend>游戏版本</legend>
                  <div class="game-options">
                    <label v-for="game in ACCOUNT_GAMES" :key="game" :class="{ selected: newAccountGame === game }">
                      <input v-model="newAccountGame" type="radio" name="profile-account-game" :value="game" :disabled="creatingAccount" />
                      <span>{{ game }}</span>
                    </label>
                  </div>
                </fieldset>
                <label class="field-label" for="quick-account-name">账号名称</label>
                <div class="quick-account-row">
                  <input id="quick-account-name" v-model="newAccountName" class="form-control" maxlength="64" autocomplete="off" placeholder="例如：大鸟大号" :disabled="creatingAccount" @keydown.enter.prevent="createInlineAccount" />
                  <button class="act-btn primary" type="button" :disabled="creatingAccount || !newAccountName.trim()" @click="createInlineAccount">{{ creatingAccount ? '正在创建…' : '创建并继续' }}</button>
                </div>
                <p v-if="accountCreateError" class="field-error" role="alert">{{ accountCreateError }}</p>
                <p class="field-help">名称只是方便你区分不同存档，之后可以在库存页或密探页修改。</p>
              </section>

              <div class="panel-title grant-title">
                <span class="step-mark">2</span>
                <div>
                  <h3>确认 MaaYuan 可以做什么</h3>
                  <p>系统已经按当前实际用途配置为最小权限。</p>
                </div>
              </div>

              <div class="grant-review">
                <div class="grant-column allow">
                  <h4>将会允许</h4>
                  <p><Check :size="17" aria-hidden="true" />上传并更新游戏库存</p>
                  <p><Check :size="17" aria-hidden="true" />上传自动采集到的密探数据</p>
                </div>
                <div class="grant-column deny">
                  <h4>不会允许</h4>
                  <p><X :size="17" aria-hidden="true" />读取 YuanHub 中已有的库存</p>
                  <p><X :size="17" aria-hidden="true" />读取或导出已有密探数据</p>
                  <p><X :size="17" aria-hidden="true" />访问其他子账号</p>
                </div>
              </div>

              <p class="stable-token-note"><KeyRound :size="17" aria-hidden="true" />以后 MaaYuan 新增权限时，你只需在这里确认更新，已填写的连接码不会变化。</p>
              <div class="panel-actions">
                <button class="act-btn ghost" type="button" :disabled="creatingMode === 'maayuan'" @click="showMaaYuanConnect = false">取消</button>
                <button class="act-btn primary" type="submit" :disabled="creatingMode === 'maayuan' || !maaAccountId">{{ creatingMode === 'maayuan' ? '正在创建…' : '创建 MaaYuan 连接码' }}</button>
              </div>
            </form>

            <section v-if="newToken" ref="newTokenPanel" class="new-token" aria-labelledby="new-token-title" tabindex="-1">
              <div class="success-heading">
                <span class="success-icon"><Check :size="20" aria-hidden="true" /></span>
                <div>
                  <h3 id="new-token-title">{{ newTokenKind === 'maayuan' ? 'MaaYuan 连接码已创建' : 'API 访问凭证已创建' }}</h3>
                  <p>连接码只显示这一次。关闭前，请把它填写到使用它的工具中。建议在你的电脑/手机上单独保存一份！</p>
                </div>
              </div>
              <ol v-if="newTokenKind === 'maayuan'" class="paste-steps">
                <li><span>1</span>打开 MaaYuan 的“同步至YuanHub”选项</li>
                <li><span>2</span>找到“YuanHub连接码”</li>
                <li><span>3</span>粘贴下方连接码</li>
              </ol>
              <div class="nt-row">
                <code class="nt-code">{{ newToken.token }}</code>
                <button class="t-btn copy" type="button" @click="copyToken(newToken.token)"><Copy :size="16" aria-hidden="true" />{{ tokenCopied ? '已复制' : '复制连接码' }}</button>
              </div>
              <div class="nt-footer">
                <p>保存到：<b>{{ newToken.account_name || newToken.account_id }}</b></p>
                <button class="text-btn" type="button" @click="finishNewToken">{{ newTokenKind === 'maayuan' ? '我已填写完成' : '我已保存' }}</button>
              </div>
            </section>

            <div v-if="notice" class="notice-line" :class="{ err: noticeError }" role="status" aria-live="polite">{{ notice }}</div>

            <section class="connections-section" aria-labelledby="connections-title">
              <div class="subsection-head">
                <div><span class="section-kicker">CONNECTED</span><h3 id="connections-title">现有连接</h3></div>
                <span class="connection-count">{{ tokenCount }} 条</span>
              </div>

              <div v-if="loading" class="state">正在加载连接…</div>
              <div v-else-if="error" class="state err">{{ error }}<button class="link" type="button" @click="loadTokens">重试</button></div>
              <div v-else-if="tokens.length === 0" class="state empty-state">
                <Link2 :size="25" aria-hidden="true" />
                <strong>还没有连接任何工具</strong>
                <span>从上方连接 MaaYuan，连接码只会访问你选择的游戏账号。</span>
                <button class="act-btn primary" type="button" @click="openMaaYuanConnect">连接 MaaYuan</button>
              </div>
              <ul v-else class="token-list">
                <li v-for="tokenItem in tokens" :key="tokenItem.token_id" class="token-item">
                  <div class="connection-icon" :class="{ maayuan: supportsMaaYuan(tokenItem) }" aria-hidden="true">
                    <img v-if="supportsMaaYuan(tokenItem)" src="/icons/maa.png" alt="" />
                    <KeyRound v-else :size="21" />
                  </div>
                  <div class="connection-main">
                    <div class="connection-title-row">
                      <h4>{{ tokenLabel(tokenItem) }}</h4>
                      <span v-if="supportsMaaYuan(tokenItem)" class="status-tag ready">可供 MaaYuan 使用</span>
                      <span v-else class="status-tag">自定义权限</span>
                    </div>
                    <p class="connection-account">游戏账号：<b>{{ tokenItem.account_name || tokenItem.account_id }}</b></p>
                    <p class="connection-scope">可以：{{ scopeDesc(tokenItem.scopes) }}</p>
                    <p v-if="tokenItem.created_at" class="connection-created">创建于 {{ formatCreateTime(tokenItem.created_at) }}</p>
                    <details class="technical-details">
                      <summary>查看技术详情</summary>
                      <code>{{ tokenItem.token_id }}</code>
                      <p>这是凭证编号，不是需要填写到 MaaYuan 的连接码。</p>
                    </details>
                  </div>
                  <div class="connection-actions">
                    <button v-if="!supportsMaaYuan(tokenItem)" class="t-btn update" type="button" :disabled="busy" @click="upgradeForMaaYuan(tokenItem)">{{ updatingTokenId === tokenItem.token_id ? '正在更新…' : '让它支持 MaaYuan' }}</button>
                    <button class="t-btn del" type="button" :disabled="busy" @click="removeToken(tokenItem)">停止连接</button>
                  </div>
                </li>
              </ul>
            </section>

            <details class="advanced-zone">
              <summary>
                <span class="advanced-icon"><KeyRound :size="19" aria-hidden="true" /></span>
                <span><b>开发者与第三方 API</b><small>为自建脚本或尚未适配的平台手动配置访问权限</small></span>
                <ChevronDown class="advanced-chevron" :size="18" aria-hidden="true" />
              </summary>
              <form class="advanced-form" @submit.prevent="createAdvancedToken">
                <div class="advanced-warning">这里会展示 API 权限名称，适合清楚第三方工具实际需要哪些权限的用户。</div>
                <label class="field-label" for="advanced-account">绑定游戏账号</label>
                <select id="advanced-account" v-model="customAccountId" class="form-control" :disabled="!accounts.length || creatingMode === 'advanced'">
                  <option v-if="!accounts.length" value="">暂无可用账号</option>
                  <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }}</option>
                </select>

                <fieldset class="scope-fieldset">
                  <legend>这个工具可以做什么</legend>
                  <p v-if="permissionsLoading" class="permission-state">正在加载可用权限…</p>
                  <div v-else-if="permissionError" class="permission-state error">{{ permissionError }} <button class="text-btn" type="button" @click="loadPermissions">重新加载</button></div>
                  <template v-else>
                    <div v-for="group in permissionGroups" :key="group.key" class="scope-group">
                      <h4>{{ group.title }}</h4>
                      <label v-for="permission in group.items" :key="permission.scope" class="scope-option">
                        <input v-model="customScopes" type="checkbox" :value="permission.scope" />
                        <span><b>{{ friendlyPermissionTitle(permission.scope) }}</b><small>{{ permissionMeta(permission) }}</small></span>
                      </label>
                    </div>
                  </template>
                </fieldset>

                <label class="field-label" for="advanced-remark">连接名称 <span>可选</span></label>
                <input id="advanced-remark" v-model.trim="customRemark" class="form-control" autocomplete="off" placeholder="例如：自建库存脚本" />
                <div class="panel-actions">
                  <button class="act-btn primary" type="submit" :disabled="creatingMode === 'advanced' || !customAccountId || !customScopes.length || permissionsLoading || !!permissionError">{{ creatingMode === 'advanced' ? '正在创建…' : '创建 API 访问凭证' }}</button>
                </div>
              </form>
            </details>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>个人中心<br><span>应用 · 账号 · 安全连接</span></template>
        <template #fine><b>YuanHub</b> · 应用与数据连接<br>MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>连接码不是登录密码，请只填写到你信任的工具中</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown, Copy, KeyRound, LayoutDashboard, Link2, PackageOpen, ScanLine, ShieldCheck, X } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { auth } from '../../store/auth.js'
import { getVisibleAdminToolGroups } from '../../utils/adminTools.js'
import { createAccount, listAccounts } from '../../api/accounts.js'
import { deleteOpenApiToken, generateOpenApiToken, getOpenApiPermissions, getOpenApiTokens, updateOpenApiTokenScopes } from '../../api/openApi.js'
import { ACCOUNT_GAMES, DEFAULT_ACCOUNT_GAME } from '../../store/activeAccount.js'
import { FALLBACK_DESCRIPTIONS as FALLBACK_SCOPES, MAAYUAN_REQUIRED_SCOPES, formatCreateTime as _formatCreateTime, hasEveryScope, mergeScopes, scopeDesc as _scopeDesc, scopeKeys } from '../../utils/openApiToken.js'

const tokens = ref([])
const permissions = ref([])
const accounts = ref([])
const accountsLoading = ref(true)
const accountLoadError = ref('')
const loading = ref(false)
const permissionsLoading = ref(false)
const error = ref('')
const permissionError = ref('')
const creatingMode = ref('')
const updatingTokenId = ref('')
const notice = ref('')
const noticeError = ref(false)
let noticeTimer = null
let layoutFrame = null

const showMaaYuanConnect = ref(false)
const maaAccountId = ref('')
const customAccountId = ref('')
const customScopes = ref([])
const customRemark = ref('')
const newToken = ref(null)
const newTokenPanel = ref(null)
const newTokenKind = ref('maayuan')
const tokenCopied = ref(false)
const creatingAccount = ref(false)
const newAccountName = ref('')
const newAccountGame = ref(DEFAULT_ACCOUNT_GAME)
const accountCreateError = ref('')
const maaAccountSelect = ref(null)

const userName = computed(function () { return auth.userInfo && auth.userInfo.user_name ? auth.userInfo.user_name : '用户' })
const tokenCount = computed(function () { return tokens.value.length })
const maaYuanReadyCount = computed(function () { return tokens.value.filter(supportsMaaYuan).length })
const busy = computed(function () { return loading.value || creatingAccount.value || !!creatingMode.value || !!updatingTokenId.value })
const adminToolGroups = computed(function () { return getVisibleAdminToolGroups(auth.adminAccess) })
const permissionGroups = computed(function () {
  return [
    { key: 'inventory', title: '库存数据', items: permissions.value.filter(function (permission) { return permission.scope.startsWith('inventory:') }) },
    { key: 'operator', title: '密探数据', items: permissions.value.filter(function (permission) { return permission.scope.startsWith('operator:') }) }
  ].filter(function (group) { return group.items.length })
})

const FRIENDLY_PERMISSION_TITLES = {
  'inventory:read': '查看当前库存',
  'inventory:write': '导入并更新库存',
  'inventory:export': '下载完整库存备份',
  'operator:read': '查看当前密探养成',
  'operator:write': '导入并更新密探数据',
  'operator:export': '下载完整密探备份',
  'operator:scan:write': '上传密探自动采集结果'
}

function friendlyPermissionTitle(scope) { return FRIENDLY_PERMISSION_TITLES[scope] || scope }
function permissionMeta(permission) {
  const description = permission && permission.description ? permission.description.trim() : ''
  return description && description !== permission.scope ? description + ' · ' + permission.scope : permission.scope
}
function scopeDesc(scope) {
  return scopeKeys(scope).map(function (key) {
    return FRIENDLY_PERMISSION_TITLES[key] || _scopeDesc([key], permissions.value, FALLBACK_SCOPES)
  }).join('、') || '未知权限'
}
function supportsMaaYuan(tokenItem) { return hasEveryScope(tokenItem && tokenItem.scopes, MAAYUAN_REQUIRED_SCOPES) }
function tokenLabel(tokenItem) { return tokenItem.remark || '自定义 API 连接' }
function formatCreateTime(value) { return _formatCreateTime(value) }

function toast(text, isError) {
  notice.value = text
  noticeError.value = !!isError
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(function () { notice.value = ''; noticeError.value = false }, 4200)
}

function humanErr(err, fallback) {
  if (!err) return fallback
  if (err.status === 429) return '这个账号的连接数量已达上限，请先停止一条不用的连接'
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请稍后重试'
  return msg
}

function applyDefaultAccounts() {
  const firstId = accounts.value.length ? accounts.value[0].id : ''
  if (!accounts.value.some(function (account) { return account.id === maaAccountId.value })) maaAccountId.value = firstId
  if (!accounts.value.some(function (account) { return account.id === customAccountId.value })) customAccountId.value = firstId
}

async function loadTokens() {
  loading.value = true
  error.value = ''
  try {
    const data = await getOpenApiTokens()
    tokens.value = Array.isArray(data) ? data : []
  } catch (err) {
    error.value = humanErr(err, '连接列表加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

async function loadAccounts() {
  accountsLoading.value = true
  accountLoadError.value = ''
  try {
    const data = await listAccounts()
    accounts.value = Array.isArray(data) ? data : []
  } catch (err) {
    accounts.value = []
    accountLoadError.value = humanErr(err, '游戏账号加载失败，请重新加载')
  } finally {
    accountsLoading.value = false
    applyDefaultAccounts()
  }
}

async function createInlineAccount() {
  if (creatingAccount.value) return
  const name = newAccountName.value.trim()
  if (!name) { toast('请填写游戏账号名称', true); return }
  creatingAccount.value = true
  accountCreateError.value = ''
  try {
    const created = await createAccount(name, newAccountGame.value)
    if (!created || !created.id) throw new Error('账号已创建，但没有返回账号编号，请重新加载')
    accounts.value = accounts.value.concat(created)
    accountLoadError.value = ''
    maaAccountId.value = created.id
    customAccountId.value = created.id
    newAccountName.value = ''
    await nextTick()
    if (maaAccountSelect.value) maaAccountSelect.value.focus()
    toast('游戏账号已创建并选中，可以继续确认连接')
  } catch (err) {
    accountCreateError.value = humanErr(err, '游戏账号创建失败，请稍后重试')
    toast(accountCreateError.value, true)
  } finally {
    creatingAccount.value = false
  }
}

async function loadPermissions() {
  permissionsLoading.value = true
  permissionError.value = ''
  try {
    const data = await getOpenApiPermissions()
    permissions.value = Array.isArray(data) ? data : []
    if (!permissions.value.length) permissionError.value = '暂时无法取得可用权限，请重新加载'
  } catch (err) {
    permissions.value = []
    permissionError.value = humanErr(err, '权限列表加载失败，请重新加载')
  } finally {
    permissionsLoading.value = false
  }
}

function openMaaYuanConnect() {
  showMaaYuanConnect.value = !showMaaYuanConnect.value
  if (showMaaYuanConnect.value) applyDefaultAccounts()
}

function showCreatedToken(created, kind) {
  newToken.value = created || null
  newTokenKind.value = kind
  tokenCopied.value = false
}

async function focusCreatedToken() {
  await nextTick()
  const panel = newTokenPanel.value
  if (!panel) return
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  panel.focus({ preventScroll: true })
}

function keepFocusedTokenVisible() {
  const panel = newTokenPanel.value
  if (!panel || document.activeElement !== panel) return
  if (layoutFrame) cancelAnimationFrame(layoutFrame)
  layoutFrame = requestAnimationFrame(function () {
    panel.scrollIntoView({ behavior: 'auto', block: 'start' })
  })
}

async function createMaaYuanConnection() {
  if (creatingMode.value) return
  if (!maaAccountId.value) { toast('请先选择数据要保存到哪个游戏账号', true); return }
  creatingMode.value = 'maayuan'
  try {
    const created = await generateOpenApiToken({ accountId: maaAccountId.value, scopes: MAAYUAN_REQUIRED_SCOPES.slice(), remark: 'MaaYuan' })
    showCreatedToken(created, 'maayuan')
    showMaaYuanConnect.value = false
    await focusCreatedToken()
    toast('MaaYuan 连接码已创建')
    await loadTokens()
  } catch (err) {
    toast(humanErr(err, 'MaaYuan 连接码创建失败'), true)
  } finally {
    creatingMode.value = ''
  }
}

async function createAdvancedToken() {
  if (creatingMode.value) return
  if (!customAccountId.value) { toast('请先选择要绑定的游戏账号', true); return }
  if (!customScopes.value.length) { toast('请至少选择一项权限', true); return }
  creatingMode.value = 'advanced'
  try {
    const created = await generateOpenApiToken({ accountId: customAccountId.value, scopes: customScopes.value.slice(), remark: customRemark.value || null })
    showCreatedToken(created, 'advanced')
    await focusCreatedToken()
    customScopes.value = []
    customRemark.value = ''
    toast('API 访问凭证已创建')
    await loadTokens()
  } catch (err) {
    toast(humanErr(err, 'API 访问凭证创建失败'), true)
  } finally {
    creatingMode.value = ''
  }
}

async function upgradeForMaaYuan(tokenItem) {
  const id = tokenItem && tokenItem.token_id
  if (!id || updatingTokenId.value) return
  const nextScopes = mergeScopes(tokenItem.scopes, MAAYUAN_REQUIRED_SCOPES)
  const label = tokenLabel(tokenItem)
  if (!confirm('将为“' + label + '”补充 MaaYuan 所需的上传权限。连接码不会变化，原有权限也会保留。是否继续？')) return
  updatingTokenId.value = id
  try {
    await updateOpenApiTokenScopes(id, nextScopes)
    toast('MaaYuan 权限已补全，原连接码无需重新填写')
    await loadTokens()
  } catch (err) {
    toast(humanErr(err, '权限更新失败，请稍后重试'), true)
  } finally {
    updatingTokenId.value = ''
  }
}

async function removeToken(tokenItem) {
  const id = tokenItem && tokenItem.token_id
  if (!id) return
  const label = tokenLabel(tokenItem)
  const account = tokenItem.account_name || tokenItem.account_id
  if (!confirm('停止“' + label + '”访问“' + account + '”吗？使用这条连接码的工具将立即无法继续上传或读取数据。')) return
  try {
    await deleteOpenApiToken(id)
    toast('连接已停止')
    await loadTokens()
  } catch (err) {
    toast(humanErr(err, '停止连接失败，请稍后重试'), true)
  }
}

async function copyToken(token) {
  try {
    await navigator.clipboard.writeText(token)
    tokenCopied.value = true
    toast('连接码已复制，可以去 MaaYuan 中粘贴了')
  } catch (_err) {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = token
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      tokenCopied.value = true
      toast('连接码已复制，可以去 MaaYuan 中粘贴了')
    } catch (_fallbackError) {
      toast('复制失败，请手动选择连接码复制', true)
    }
  }
}

function finishNewToken() {
  if (!tokenCopied.value && !confirm('还没有通过页面复制连接码。关闭后将无法再次查看，仍要关闭吗？')) return
  newToken.value = null
  tokenCopied.value = false
}

onMounted(function () {
  window.addEventListener('resize', keepFocusedTokenVisible)
  Promise.all([loadPermissions(), loadAccounts(), loadTokens()])
})
onBeforeUnmount(function () {
  window.removeEventListener('resize', keepFocusedTokenVisible)
  if (layoutFrame) cancelAnimationFrame(layoutFrame)
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<style scoped>
.profile-main { padding-bottom: 0 }
.page-profile .hero::after { content: '连接' }
.hero-stats .uname { font-family: var(--font-s); font-weight: 900; font-size: 26px; letter-spacing: .02em }
.hero-stats .v small { vertical-align: baseline }
.hero-stats div.is-authed .v { font-size: 26px }
.admin-tools { margin-top: 40px; background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: 8px; padding: 20px 24px; display: grid; grid-template-columns: minmax(180px, .75fr) minmax(0, 1.5fr); align-items: start; gap: 24px }
.admin-kicker,.section-kicker { color: var(--accent-strong); font-family: var(--font-d); font-size: 11px; font-weight: 800; letter-spacing: .12em }
.admin-tools h2 { margin-top: 4px; color: var(--ink); font-family: var(--font-s); font-size: 20px; font-weight: 900; letter-spacing: .04em }
.admin-tools-head p { margin-top: 7px; color: var(--ink-60); font-size: 12px; line-height: 1.6 }
.admin-tools-body { min-width: 0 }
.admin-workbench-link { display: flex; align-items: center; gap: 9px; min-height: 48px; padding: 8px 12px; color: var(--cream); background: var(--tea); border-radius: 8px; text-decoration: none }
.admin-workbench-link:hover { background: var(--accent) }
.admin-workbench-link span,.admin-entry span { display: flex; min-width: 0; flex-direction: column; gap: 3px }
.admin-workbench-link small,.admin-entry small { color: inherit; opacity: .72; font-size: 10.5px; font-weight: 600; line-height: 1.35 }
.admin-entry-groups { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; margin-top: 14px }
.admin-entry-group h3 { margin-bottom: 7px; color: var(--ink-60); font-size: 11px; font-weight: 800; letter-spacing: .06em }
.admin-entry-group nav { display: grid; gap: 7px }
.admin-entry { min-height: 52px; display: flex; align-items: center; justify-content: flex-start; gap: 8px; padding: 8px 10px; color: var(--ink); background: var(--cream); border: 1px solid var(--line); border-radius: 8px; font-size: 12px; font-weight: 800; line-height: 1.2; text-decoration: none }
.admin-entry:hover { color: var(--accent-strong); border-color: var(--accent) }
.connection-card { margin-top: 40px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 30px }
.card-head h2 { margin-top: 5px; font-family: var(--font-s); font-weight: 900; font-size: 26px; letter-spacing: .04em; color: var(--ink) }
.card-sub { margin-top: 9px; max-width: 680px; color: var(--ink-60); font-size: 14px; line-height: 1.8 }
.app-pass { position: relative; margin-top: 24px; display: grid; grid-template-columns: 96px minmax(0,1fr) auto; align-items: center; gap: 22px; padding: 24px; overflow: hidden; background: linear-gradient(135deg,var(--cream),var(--surface)); border: 1.5px solid var(--line); border-radius: 22px }
.app-pass::after { content: 'MAAYUAN'; position: absolute; right: 18px; bottom: -9px; color: rgba(73,59,44,.045); font-family: var(--font-d); font-size: 54px; font-weight: 900; letter-spacing: .08em; pointer-events: none }
.app-seal { position: relative; z-index: 1; width: 90px; height: 90px; display: grid; place-items: center; background: var(--yellow); border: 1px solid var(--line); border-radius: 28px 28px 28px 10px; transform: rotate(-2deg) }
.app-seal img { width: 74px; height: 74px; object-fit: contain; transform: rotate(2deg) }
.app-copy { position: relative; z-index: 1 }
.app-title-row,.connection-title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.app-title-row h3 { font-family: var(--font-s); font-size: 26px; font-weight: 900; letter-spacing: .04em }
.brand-outline { display: inline-flex; align-items: center; min-height: 24px; padding: 2px 9px; color: var(--brand-blue); border: 1.5px solid var(--brand-blue); border-radius: 7px; font-size: 11px; font-weight: 800; letter-spacing: .06em }
.app-copy>p { margin-top: 7px; max-width: 620px; color: var(--ink-60); font-size: 13.5px; line-height: 1.75 }
.app-capabilities { margin-top: 13px; display: flex; flex-wrap: wrap; gap: 8px }
.app-capabilities span { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 4px 10px; background: var(--paper); border-radius: 999px; color: var(--ink); font-size: 12px; font-weight: 700 }
.app-capabilities .no-read { background: rgba(191,220,192,.45) }
.app-connect { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px }
.connect-panel { margin-top: 14px; padding: 24px; background: var(--paper); border: 1px solid var(--line); border-radius: 20px }
.panel-title { display: flex; align-items: flex-start; gap: 12px }
.panel-title h3 { color: var(--ink); font-family: var(--font-s); font-size: 18px; font-weight: 900; letter-spacing: .025em }
.panel-title p { margin-top: 3px; color: var(--ink-60); font-size: 12.5px; line-height: 1.6 }
.step-mark { flex: none; width: 28px; height: 28px; display: grid; place-items: center; background: var(--tea); border-radius: 9px; color: var(--cream); font-family: var(--font-d); font-size: 12px; font-weight: 900 }
.grant-title { margin-top: 24px; padding-top: 22px; border-top: 1px dashed var(--line) }
.field-label { display: block; margin-top: 18px; color: var(--ink); font-size: 13px; font-weight: 800 }
.field-label span { color: var(--ink-60); font-size: 11px; font-weight: 600 }
.form-control { width: 100%; min-height: 46px; margin-top: 7px; padding: 10px 13px; color: var(--ink); background: var(--surface); border: 1.5px solid var(--line); border-radius: 11px; font-family: var(--font-b); font-size: 14px }
.form-control:disabled { opacity: .55; cursor: not-allowed }
.field-help { margin-top: 7px; color: var(--ink-60); font-size: 12px; line-height: 1.6 }
.field-help a { color: var(--accent-strong); font-weight: 800; text-underline-offset: 3px }
.account-inline-state { margin-top: 18px; min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 12px 14px; color: var(--ink-60); background: var(--surface); border: 1px dashed var(--line); border-radius: 12px; font-size: 12.5px; font-weight: 700 }
.account-inline-state.error { color: var(--rouge); border-color: rgba(166,81,74,.35) }
.quick-account { margin-top: 18px; padding: 17px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px }
.quick-account-heading h4 { color: var(--ink); font-family: var(--font-s); font-size: 15px; font-weight: 900; letter-spacing: .02em }
.quick-account-heading p { margin-top: 4px; color: var(--ink-60); font-size: 12px; line-height: 1.6 }
.game-choice { margin: 15px 0 0; padding: 0; border: 0 }
.game-choice legend { margin-bottom: 7px; color: var(--ink); font-size: 12px; font-weight: 800 }
.game-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px }
.game-options label { position: relative; min-height: 44px; display: flex; align-items: center; justify-content: center; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 10px; cursor: pointer; font-size: 12.5px; font-weight: 800; transition: color .2s var(--ease),background-color .2s var(--ease),border-color .2s var(--ease) }
.game-options label.selected { color: var(--ink); background: var(--yellow); border-color: var(--yellow-deep) }
.game-options label:focus-within { outline: 3px solid rgba(91,106,140,.3); outline-offset: 2px }
.game-options input { position: absolute; width: 1px; height: 1px; opacity: 0 }
.game-options input:disabled+span { opacity: .5 }
.quick-account-row { margin-top: 7px; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 10px; align-items: stretch }
.quick-account-row .form-control { margin-top: 0 }
.field-error { margin-top: 8px; color: var(--rouge); font-size: 12px; font-weight: 700; line-height: 1.55 }
.grant-review { margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px }
.grant-column { padding: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px }
.grant-column.allow { border-top: 3px solid var(--accent) }
.grant-column.deny { border-top: 3px solid var(--brand-blue) }
.grant-column h4 { margin-bottom: 9px; color: var(--ink); font-size: 13px; font-weight: 900 }
.grant-column p { display: flex; align-items: flex-start; gap: 8px; margin-top: 7px; color: var(--ink-60); font-size: 12.5px; line-height: 1.55 }
.grant-column p svg { flex: none; margin-top: 1px }
.grant-column.allow p svg { color: var(--accent-strong) }
.grant-column.deny p svg { color: var(--brand-blue) }
.stable-token-note { margin-top: 14px; display: flex; align-items: flex-start; gap: 8px; padding: 11px 13px; color: var(--ink); background: rgba(239,210,142,.45); border-radius: 11px; font-size: 12.5px; font-weight: 700; line-height: 1.6 }
.stable-token-note svg { flex: none; margin-top: 1px }
.panel-actions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap }
.act-btn { min-height: 44px; padding: 10px 20px; color: var(--ink); background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px; cursor: pointer; font-family: var(--font-b); font-size: 13px; font-weight: 800; transition: color .3s var(--ease),background-color .3s var(--ease),border-color .3s var(--ease),transform .3s var(--ease); white-space: nowrap }
.act-btn.primary { color: var(--cream); background: var(--tea); border-color: transparent }
.act-btn.primary:hover:not(:disabled) { color: var(--cream); background: var(--accent) }
.act-btn.ghost:hover:not(:disabled) { color: var(--ink); background: var(--cream); border-color: var(--ink) }
.act-btn:disabled { opacity: .45; cursor: not-allowed }
.new-token { margin-top: 18px; padding: 20px; scroll-margin-top: 82px; background: var(--yellow); border: 1px solid rgba(73,59,44,.14); border-radius: 18px }
.new-token:focus { outline: 3px solid rgba(215,137,53,.55); outline-offset: 3px }
.success-heading { display: flex; align-items: flex-start; gap: 12px }
.success-icon { flex: none; width: 34px; height: 34px; display: grid; place-items: center; color: var(--cream); background: var(--tea); border-radius: 11px }
.success-heading h3 { color: var(--ink); font-family: var(--font-s); font-size: 18px; font-weight: 900 }
.success-heading p { margin-top: 3px; color: var(--ink-60); font-size: 12.5px; line-height: 1.6 }
.paste-steps { margin: 15px 0 0; display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; list-style: none }
.paste-steps li { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 8px 10px; color: var(--ink); background: rgba(255,253,246,.68); border-radius: 10px; font-size: 12px; font-weight: 700; line-height: 1.45 }
.paste-steps li span { flex: none; width: 22px; height: 22px; display: grid; place-items: center; color: var(--cream); background: var(--tea); border-radius: 50%; font-family: var(--font-d); font-size: 10px; font-weight: 900 }
.nt-row { margin-top: 12px; display: flex; align-items: stretch; gap: 10px }
.nt-code { flex: 1; min-width: 0; padding: 11px 13px; overflow-wrap: anywhere; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; font-family: var(--font-d); font-size: 13px; line-height: 1.6 }
.nt-footer { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink-60); font-size: 12px }
.text-btn { min-height: 44px; padding: 4px 2px; color: var(--accent-strong); background: transparent; border: 0; cursor: pointer; font-family: var(--font-b); font-size: 12.5px; font-weight: 800; text-decoration: underline; text-underline-offset: 4px }
.notice-line { margin-top: 18px; padding: 11px 15px; color: var(--ink); background: var(--yellow); border-radius: 12px; font-size: 12.5px; font-weight: 700; line-height: 1.6 }
.notice-line.err { color: var(--rouge); background: rgba(166,81,74,.14) }
.connections-section { margin-top: 30px; padding-top: 25px; border-top: 1px dashed var(--line) }
.subsection-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px }
.subsection-head h3 { margin-top: 4px; color: var(--ink); font-family: var(--font-s); font-size: 21px; font-weight: 900; letter-spacing: .03em }
.connection-count { color: var(--ink-60); font-family: var(--font-d); font-size: 12px; font-weight: 800 }
.state { margin-top: 16px; padding: 44px 30px; color: var(--ink-60); background: var(--surface); border: 1.5px dashed var(--line); border-radius: 18px; text-align: center; font-size: 13px; font-weight: 700 }
.state.err { color: var(--ink-60) }
.state .link { min-height: 44px; margin-left: 10px; color: var(--accent-strong); background: transparent; border: 0; cursor: pointer; font-weight: 800; text-decoration: underline; text-underline-offset: 3px }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px }
.empty-state strong { color: var(--ink); font-family: var(--font-s); font-size: 17px }
.empty-state span { max-width: 460px; line-height: 1.65 }
.empty-state .act-btn { margin-top: 6px }
.token-list { margin-top: 15px; display: flex; flex-direction: column; gap: 10px; list-style: none }
.token-item { display: grid; grid-template-columns: 48px minmax(0,1fr) auto; align-items: start; gap: 14px; padding: 17px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; transition: border-color .3s var(--ease),box-shadow .35s var(--ease),transform .35s var(--ease) }
.token-item:hover { border-color: rgba(73,59,44,.24); box-shadow: 0 16px 30px -24px rgba(73,59,44,.3); transform: translateY(-2px) }
.connection-icon { width: 46px; height: 46px; display: grid; place-items: center; color: var(--ink-60); background: var(--paper); border: 1px solid var(--line); border-radius: 14px }
.connection-icon.maayuan { background: var(--yellow) }
.connection-icon img { width: 40px; height: 40px; object-fit: contain }
.connection-main { min-width: 0 }
.connection-title-row h4 { color: var(--ink); font-family: var(--font-s); font-size: 16px; font-weight: 900 }
.status-tag { display: inline-flex; align-items: center; min-height: 23px; padding: 2px 8px; color: var(--ink-60); background: var(--paper); border-radius: 6px; font-size: 10.5px; font-weight: 800 }
.status-tag.ready { color: var(--accent-strong); background: rgba(239,210,142,.58) }
.connection-account { margin-top: 5px; color: var(--ink-60); font-size: 12.5px }
.connection-account b { color: var(--ink) }
.connection-scope { margin-top: 4px; color: var(--ink-60); font-size: 12px; line-height: 1.6 }
.connection-created { margin-top: 4px; color: var(--ink-60); font-family: var(--font-d); font-size: 11px }
.technical-details { margin-top: 8px; color: var(--ink-60); font-size: 11px }
.technical-details summary { width: max-content; min-height: 44px; display: inline-flex; align-items: center; cursor: pointer; color: var(--brand-blue); font-weight: 800 }
.technical-details code { display: block; margin-top: 7px; padding: 7px 9px; overflow-wrap: anywhere; color: var(--ink); background: var(--paper); border-radius: 7px; font-family: var(--font-d) }
.technical-details p { margin-top: 4px; color: var(--ink-60); line-height: 1.5 }
.connection-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap }
.t-btn { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; color: var(--ink-60); background: transparent; border: 1.5px solid var(--line); border-radius: 10px; cursor: pointer; font-family: var(--font-b); font-size: 12px; font-weight: 800; transition: color .3s var(--ease),background-color .3s var(--ease),border-color .3s var(--ease) }
.t-btn.copy { min-height: 46px; color: var(--cream); background: var(--tea); border-color: var(--tea) }
.t-btn.copy:hover:not(:disabled) { color: var(--cream); background: var(--accent); border-color: var(--accent) }
.t-btn.update { color: var(--accent-strong); background: rgba(239,210,142,.25) }
.t-btn.update:hover:not(:disabled) { background: var(--yellow); border-color: var(--yellow-deep) }
.t-btn.del:hover:not(:disabled) { color: var(--rouge); border-color: var(--rouge) }
.t-btn:disabled { opacity: .45; cursor: not-allowed }
.advanced-zone { margin-top: 24px; border: 1px solid var(--line); border-radius: 16px; background: var(--cream) }
.advanced-zone>summary { min-height: 68px; display: flex; align-items: center; gap: 12px; padding: 13px 16px; cursor: pointer; list-style: none }
.advanced-zone>summary::-webkit-details-marker { display: none }
.advanced-icon { flex: none; width: 38px; height: 38px; display: grid; place-items: center; color: var(--brand-blue); border: 1.5px solid var(--brand-blue); border-radius: 12px }
.advanced-zone summary span:nth-child(2) { display: flex; flex-direction: column; gap: 3px; min-width: 0 }
.advanced-zone summary b { color: var(--ink); font-size: 13.5px }
.advanced-zone summary small { color: var(--ink-60); font-size: 11.5px; line-height: 1.5 }
.advanced-chevron { flex: none; margin-left: auto; color: var(--ink-35); transition: transform .25s var(--ease) }
.advanced-zone[open] .advanced-chevron { transform: rotate(180deg) }
.advanced-form { padding: 2px 18px 20px; border-top: 1px dashed var(--line) }
.advanced-warning { margin-top: 16px; padding: 10px 12px; color: var(--ink-60); background: var(--paper); border-radius: 10px; font-size: 12px; line-height: 1.6 }
.scope-fieldset { margin-top: 20px; padding: 0; border: 0 }
.scope-fieldset legend { color: var(--ink); font-size: 13px; font-weight: 800 }
.scope-group { margin-top: 12px; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px }
.scope-group h4 { grid-column: 1/-1; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.scope-option { display: flex; align-items: flex-start; gap: 10px; min-height: 58px; padding: 10px 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 11px; cursor: pointer }
.scope-option:has(input:checked) { background: rgba(239,210,142,.32); border-color: var(--yellow-deep) }
.scope-option input { flex: none; width: 17px; height: 17px; margin-top: 2px; accent-color: var(--accent) }
.scope-option span { display: flex; flex-direction: column; gap: 3px; min-width: 0 }
.scope-option b { color: var(--ink); font-size: 12.5px }
.scope-option small { color: var(--ink-60); font-family: var(--font-d); font-size: 10.5px; line-height: 1.45; overflow-wrap: anywhere }
.permission-state { margin-top: 12px; padding: 16px; color: var(--ink-60); background: var(--surface); border: 1px dashed var(--line); border-radius: 11px; font-size: 12px }
.permission-state.error { color: var(--rouge) }

@media (max-width: 820px) {
  .admin-tools { grid-template-columns: 1fr }
  .admin-entry-groups { grid-template-columns: repeat(3,minmax(0,1fr)) }
  .app-pass { grid-template-columns: 76px minmax(0,1fr) }
  .app-seal { width: 72px; height: 72px; border-radius: 22px 22px 22px 9px }
  .app-seal img { width: 60px; height: 60px }
  .app-connect { grid-column: 1/-1; width: 100% }
  .paste-steps { grid-template-columns: 1fr }
  .token-item { grid-template-columns: 46px minmax(0,1fr) }
  .connection-actions { grid-column: 2; justify-content: flex-start }
}

@media (max-width: 640px) {
  .admin-tools { padding: 18px 16px }
  .admin-entry-groups { grid-template-columns: 1fr; gap: 14px }
  .connection-card { padding: 20px 16px; border-radius: 20px }
  .app-pass { grid-template-columns: 58px minmax(0,1fr); gap: 14px; padding: 17px }
  .app-pass::after { display: none }
  .app-seal { width: 56px; height: 56px; border-radius: 18px 18px 18px 7px }
  .app-seal img { width: 49px; height: 49px }
  .app-title-row h3 { font-size: 21px }
  .app-capabilities { gap: 6px }
  .app-capabilities span { width: 100%; border-radius: 9px }
  .connect-panel { padding: 18px 14px }
  .grant-review { grid-template-columns: 1fr }
  .quick-account-row { grid-template-columns: 1fr }
  .quick-account-row .act-btn { width: 100% }
  .form-control { font-size: 16px }
  .panel-actions .act-btn { flex: 1 }
  .nt-row { flex-direction: column }
  .nt-footer { align-items: flex-start; flex-direction: column }
  .t-btn.copy { width: 100% }
  .token-item { grid-template-columns: 42px minmax(0,1fr); padding: 14px 12px }
  .connection-icon { width: 40px; height: 40px; border-radius: 12px }
  .connection-icon img { width: 35px; height: 35px }
  .connection-actions { grid-column: 1/-1; justify-content: stretch }
  .connection-actions .t-btn { flex: 1 }
  .scope-group { grid-template-columns: 1fr }
  .advanced-zone>summary { padding: 12px }
}
</style>
