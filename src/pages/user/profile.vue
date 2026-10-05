<template>
  <div class="page-profile">
    <IslandSidebar />

    <main id="main-content" class="profile-main">
      <header class="hero">
        <div class="wrap">
          <h1>账号与连接码</h1>
        </div>
      </header>

      <section>
        <div class="wrap">
          <div
            v-if="auth.adminAccessLoaded && adminToolGroups.length"
            class="admin-tools"
            v-reveal
          >
            <div class="admin-tools-head">
              <span class="admin-kicker">管理入口</span>
              <h2>当前可用的管理内容</h2>
              <p>按当前授权显示。日常处理请进入管理工作台。</p>
            </div>
            <div class="admin-tools-body">
              <router-link class="admin-workbench-link" to="/manage">
                <LayoutDashboard :size="17" aria-hidden="true" />
                <span
                  ><b>打开管理工作台</b
                  ><small>从一个入口进入所有已授权的管理工具</small></span
                >
              </router-link>
              <div class="admin-entry-groups">
                <section
                  v-for="group in adminToolGroups"
                  :key="group.key"
                  class="admin-entry-group"
                >
                  <h3>{{ group.label }}</h3>
                  <nav :aria-label="group.label">
                    <router-link
                      v-for="tool in group.tools"
                      :key="tool.to"
                      class="admin-entry"
                      :to="tool.to"
                    >
                      <component
                        :is="tool.icon"
                        :size="17"
                        aria-hidden="true"
                      />
                      <span
                        ><b>{{ tool.label }}</b
                        ><small>{{ tool.description }}</small></span
                      >
                    </router-link>
                  </nav>
                </section>
              </div>
            </div>
          </div>

          <BetaNotice />

          <GameAccountManager
            id="game-accounts"
            v-model:accounts="accounts"
            v-model:accountId="managedAccountId"
            :loading="accountsLoading"
            :load-error="accountLoadError"
            @reload="loadAccounts"
          />

          <div class="connection-card" v-reveal>
            <div class="card-head">
              <div>
                <span class="section-kicker">APPLICATION CONNECTIONS</span>
                <h2>应用与数据连接</h2>
                <p class="card-sub">
                  连接码类似一把只供某个工具使用的钥匙，不是你的登录密码。你可以查看它能做什么，并随时停止访问。
                </p>
              </div>
            </div>

            <article
              class="app-pass"
              aria-labelledby="maayuan-app-title"
            >
              <div class="app-seal" aria-hidden="true">
                <img src="/icons/maa.png" alt="" />
              </div>
              <div class="app-copy">
                <div class="app-title-row">
                  <h3 id="maayuan-app-title" tabindex="-1">
                    MaaYuan
                  </h3>
                  <span class="brand-outline">联合共建</span>
                </div>
                <p>
                  把游戏内采集到的库存与密探信息安全上传到
                  YuanHub，并读取密探养成状态，支持仅扫描和更新“养成中”的密探。
                </p>
                <div
                  class="app-capabilities"
                  aria-label="MaaYuan 使用的数据能力"
                >
                  <span
                    ><PackageOpen :size="15" aria-hidden="true" />上传库存</span
                  >
                  <span
                    ><ScanLine
                      :size="15"
                      aria-hidden="true"
                    />上传密探采集结果</span
                  >
                  <span
                    ><Sparkles
                      :size="15"
                      aria-hidden="true"
                    />上传星石背包临时采集结果</span
                  >
                  <span class="no-read"
                    ><ShieldCheck
                      :size="15"
                      aria-hidden="true"
                    />读取密探养成状态</span
                  >
                </div>
                <p class="capability-note">星石自动采集仍在接入中，请先在星石背包导入截图。</p>
              </div>
              <button
                class="act-btn primary app-connect"
                type="button"
                data-tour="maayuan-sync"
                :disabled="busy"
                :aria-expanded="showMaaYuanConnect"
                aria-controls="maayuan-connect-panel"
                @click="openMaaYuanConnect"
              >
                <Link2 :size="17" aria-hidden="true" />{{
                  showMaaYuanConnect ? "收起" : "连接 MaaYuan"
                }}
              </button>
            </article>

            <form
              v-if="showMaaYuanConnect"
              ref="maaYuanConnectPanel"
              tabindex="-1"
              id="maayuan-connect-panel"
              class="connect-panel"
              aria-labelledby="connect-panel-title"
              @submit.prevent="createMaaYuanConnection"
            >
              <div class="panel-title">
                <span class="step-mark">1</span>
                <div>
                  <h3 id="connect-panel-title">选择数据保存到哪个账号</h3>
                  <p>连接码只会绑定一个游戏账号，不能访问你的其他账号。</p>
                </div>
              </div>
              <p v-if="cameFromToday" class="today-connect-note" role="note">
                你已经从「今日一览」来到这里。以后需要新建或管理连接码时，
                直接从左侧「账号与连接码」进入即可。
              </p>

              <div
                v-if="accountsLoading"
                class="account-inline-state"
                role="status"
              >
                正在加载游戏账号…
              </div>
              <div
                v-else-if="accountLoadError"
                class="account-inline-state error"
                role="alert"
              >
                <span>{{ accountLoadError }}</span>
                <button class="text-btn" type="button" @click="loadAccounts">
                  重新加载
                </button>
              </div>
              <template v-else-if="accounts.length">
                <label class="field-label" for="maayuan-account"
                  >游戏账号</label
                >
                <select
                  id="maayuan-account"
                  ref="maaAccountSelect"
                  v-model="maaAccountId"
                  @change="maaAccountChosen = true"
                  class="form-control"
                  :disabled="creatingMode === 'maayuan'"
                  aria-describedby="maayuan-account-help"
                >
                  <option
                    v-for="account in accounts"
                    :key="account.id"
                    :value="account.id"
                  >
                    {{ connectionAccountLabel(account) }}
                  </option>
                </select>
                <p id="maayuan-account-help" class="field-help">
                  本次连接将绑定：{{ connectionAccountLabel(maaSelectedAccount) }}。采集数据仅保存到此账号。
                </p>
              </template>
              <section
                v-else
                class="quick-account"
                aria-labelledby="quick-account-title"
              >
                <div class="quick-account-heading">
                  <h4 id="quick-account-title">还没有游戏账号</h4>
                  <p>请先在本页上方「游戏账号」区域统一创建；创建完成后这里会自动出现可绑定账号。</p>
                </div>
                <a class="act-btn primary quick-account-manage-link" href="#game-accounts">
                  去创建游戏账号
                </a>
              </section>

              <div class="panel-title grant-title">
                <span class="step-mark">2</span>
                <div>
                  <h3>确认 MaaYuan 可以做什么</h3>
                  <p>默认包含上传权限与密探读取权限，用于按养成状态筛选。</p>
                </div>
              </div>

              <div class="grant-review">
                <div class="grant-column allow">
                  <h4>将会允许</h4>
                  <p>
                    <Check :size="17" aria-hidden="true" />上传并更新游戏库存
                  </p>
                  <p>
                    <Check
                      :size="17"
                      aria-hidden="true"
                    />上传自动采集到的密探数据
                  </p>
                  <p>
                    <Check :size="17" aria-hidden="true" />读取当前密探数据与养成状态
                  </p>
                  <p>
                    <Check :size="17" aria-hidden="true" />上传星石背包临时采集结果（MaaYuan 采集任务接入中）
                  </p>
                </div>
                <div class="grant-column deny">
                  <h4>不会允许</h4>
                  <p>
                    <X :size="17" aria-hidden="true" />读取 YuanHub 中已有的库存
                  </p>
                  <p>
                    <X :size="17" aria-hidden="true" />导出完整密探备份
                  </p>
                  <p><X :size="17" aria-hidden="true" />访问其他游戏账号</p>
                </div>
              </div>

              <p class="stable-token-note">
                <KeyRound :size="17" aria-hidden="true" />以后 MaaYuan
                新增权限时，你只需在这里确认更新，已填写的连接码不会变化。旧连接码如需使用“仅扫描养成中”，请在下方点击“让它支持 MaaYuan”补齐权限。
              </p>
              <div class="panel-actions">
                <button
                  class="act-btn ghost"
                  type="button"
                  :disabled="creatingMode === 'maayuan'"
                  @click="showMaaYuanConnect = false"
                >
                  取消
                </button>
                <button
                  class="act-btn primary"
                  type="submit"
                  :disabled="creatingMode === 'maayuan' || !maaAccountId"
                >
                  {{
                    creatingMode === "maayuan"
                      ? "正在创建…"
                      : "创建 MaaYuan 连接码"
                  }}
                </button>
              </div>
            </form>

            <section
              v-if="newToken"
              ref="newTokenPanel"
              class="new-token"
              aria-labelledby="new-token-title"
              tabindex="-1"
            >
              <div class="success-heading">
                <span class="success-icon"
                  ><Check :size="20" aria-hidden="true"
                /></span>
                <div>
                  <h3 id="new-token-title">
                    {{
                      newTokenKind === "maayuan"
                        ? "MaaYuan 连接码已创建"
                        : "API 访问凭证已创建"
                    }}
                  </h3>
                  <p>
                    连接码只会在页面完整显示这一次。以后可在“现有连接”中再次复制。
                  </p>
                </div>
              </div>
              <ol v-if="newTokenKind === 'maayuan'" class="paste-steps">
                <li>
                  <span>1</span>
                  <div class="paste-step-copy">
                    <strong>先复制下方连接码</strong>
                    <small>之后仍可在“现有连接”中复制。</small>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div class="paste-step-copy">
                    <strong>找到你要实时统计的任务</strong>
                    <small>派遣 / 情报掉落 → 据点日常</small>
                    <small>密探练度 → 百宝箱 · 采集密探信息</small>
                    <small>道具 / 心纸数量 → 百宝箱 · 自动识别背包</small>
                    <small>星石 → YuanHub 网页端先导入截图；MaaYuan 自动采集接入中</small>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div class="paste-step-copy">
                    <strong>打开同步选项</strong>
                    <small>在对应任务中开启“同步至YuanHub”。据点日常还需开启“记录奖励内容及数量”。</small>
                  </div>
                </li>
                <li>
                  <span>4</span>
                  <div class="paste-step-copy">
                    <strong>粘贴连接码并照常使用</strong>
                    <small>在“YuanHub连接码”粘贴刚复制的内容；完成对应任务后，采集结果会同步到上方绑定的 YuanHub 游戏账号。</small>
                  </div>
                </li>
                <li>
                  <span>5</span>
                  <div class="paste-step-copy"><strong>运行采集任务，再确认数据</strong><small>任务完成后，在 YuanHub 切换到上方绑定的游戏账号，前往 <router-link to="/inventory">库存追踪</router-link> 或 <router-link to="/operator">密探名册</router-link> 检查对应数据。仅创建连接码不表示同步成功。</small></div>
                </li>
              </ol>
              <div class="nt-row">
                <code class="nt-code">{{ newToken.token }}</code>
                <button
                  class="t-btn copy"
                  type="button"
                  @click="copyToken(newToken.token)"
                >
                  <Copy :size="16" aria-hidden="true" />{{
                    tokenCopied ? "已复制" : "复制连接码"
                  }}
                </button>
              </div>
              <div class="nt-footer">
                <p>
                  保存到：<b>{{
                    newToken.account_name || newToken.account_id
                  }}</b>
                </p>
                <button class="text-btn" type="button" @click="finishNewToken">
                  {{ newTokenKind === "maayuan" ? "收起填写说明" : "我已保存" }}
                </button>
              </div>
            </section>

            <div
              v-if="notice"
              class="notice-line"
              :class="{ err: noticeError }"
              :role="noticeError ? 'alert' : 'status'"
            >
              <span>{{ notice }}</span>
              <button type="button" aria-label="关闭提示" @click="dismissNotice">×</button>
            </div>
            <details v-if="recentFailures.length" class="failure-history">
              <summary>最近失败记录（{{ recentFailures.length }}）</summary>
              <ul><li v-for="(failure, index) in recentFailures" :key="index">{{ failure }}</li></ul>
            </details>

            <section
              class="connections-section"
              aria-labelledby="connections-title"
            >
              <div class="subsection-head">
                <div>
                  <span class="section-kicker">CONNECTED</span>
                  <h3 id="connections-title">现有连接</h3>
                </div>
                <span class="connection-count">{{ tokenCount }} 条</span>
              </div>
              <div class="stable-token-note connection-reminder" role="note">
                <KeyRound :size="19" aria-hidden="true" />
                <div>
                  <strong>已创建的连接码可直接复制</strong>
                  <p>连接码不会在这里显示完整内容。需要重新填写时，点击对应连接的“复制连接码”。</p>
                </div>
              </div>

              <div v-if="loading" class="state">正在加载连接…</div>
              <div v-else-if="error" class="state err">
                {{ error
                }}<button class="link" type="button" @click="loadTokens">
                  重试
                </button>
              </div>
              <div v-else-if="tokens.length === 0" class="state empty-state">
                <Link2 :size="25" aria-hidden="true" />
                <strong>还没有连接任何工具</strong>
                <span
                  >从上方连接 MaaYuan，连接码只会访问你选择的游戏账号。</span
                >
                <button
                  class="act-btn primary"
                  type="button"
                  @click="openMaaYuanConnect"
                >
                  连接 MaaYuan
                </button>
              </div>
              <ul v-else class="token-list">
                <li
                  v-for="tokenItem in tokens"
                  :key="tokenItem.token_id"
                  class="token-item"
                >
                  <div
                    class="connection-icon"
                    :class="{ maayuan: supportsMaaYuan(tokenItem) }"
                    aria-hidden="true"
                  >
                    <img
                      v-if="supportsMaaYuan(tokenItem)"
                      src="/icons/maa.png"
                      alt=""
                    />
                    <KeyRound v-else :size="21" />
                  </div>
                  <div class="connection-main">
                    <div class="connection-title-row">
                      <h4>{{ tokenLabel(tokenItem) }}</h4>
                      <span
                        v-if="supportsMaaYuan(tokenItem)"
                        class="status-tag ready"
                        >已授权 MaaYuan</span
                      >
                      <span v-else class="status-tag">自定义权限</span>
                    </div>
                    <p class="connection-account">
                      游戏账号：<b>{{
                        tokenItem.account_name || tokenItem.account_id
                      }}</b>
                    </p>
                    <p class="connection-scope">
                      可以：{{ scopeDesc(tokenItem.scopes) }}
                    </p>
                    <p v-if="tokenItem.created_at" class="connection-created">
                      创建于 {{ formatCreateTime(tokenItem.created_at) }}
                    </p>
                    <details class="technical-details">
                      <summary>查看技术详情</summary>
                      <code>{{ tokenItem.token_id }}</code>
                      <p>这是凭证编号，不是需要填写到 MaaYuan 的连接码。</p>
                    </details>
                  </div>
                  <div class="connection-actions">
                    <button
                      class="t-btn copy"
                      type="button"
                      :disabled="busy"
                      @click="copyExistingToken(tokenItem)"
                    >
                      <Copy :size="15" aria-hidden="true" />{{ copyingTokenId === tokenItem.token_id ? "正在复制…" : "复制连接码" }}
                    </button>
                    <button
                      v-if="!supportsMaaYuan(tokenItem)"
                      class="t-btn update"
                      type="button"
                      :disabled="busy"
                      @click="upgradeForMaaYuan(tokenItem)"
                    >
                      {{
                        updatingTokenId === tokenItem.token_id
                          ? "正在更新…"
                          : "让它支持 MaaYuan"
                      }}
                    </button>
                    <button
                      class="t-btn del"
                      type="button"
                      :disabled="busy"
                      @click="removeToken(tokenItem)"
                    >
                      停止连接
                    </button>
                  </div>
                </li>
              </ul>
            </section>

            <details class="advanced-zone">
              <summary>
                <span class="advanced-icon"
                  ><KeyRound :size="19" aria-hidden="true"
                /></span>
                <span
                  ><b>开发者与第三方 API</b
                  ><small
                    >为自建脚本或尚未适配的平台手动配置访问权限</small
                  ></span
                >
                <ChevronDown
                  class="advanced-chevron"
                  :size="18"
                  aria-hidden="true"
                />
              </summary>
              <form class="advanced-form" @submit.prevent="createAdvancedToken">
                <div class="advanced-warning">
                  这里会展示 API
                  权限名称，适合清楚第三方工具实际需要哪些权限的用户。
                </div>
                <label class="field-label" for="advanced-account"
                  >绑定游戏账号</label
                >
                <select
                  id="advanced-account"
                  v-model="customAccountId"
                  @change="customAccountChosen = true"
                  class="form-control"
                  :disabled="!accounts.length || creatingMode === 'advanced'"
                >
                  <option v-if="!accounts.length" value="">暂无可用账号</option>
                  <option
                    v-for="account in accounts"
                    :key="account.id"
                    :value="account.id"
                  >
                    {{ connectionAccountLabel(account) }}
                  </option>
                </select>

                <fieldset class="scope-fieldset">
                  <legend>这个工具可以做什么</legend>
                  <p v-if="permissionsLoading" class="permission-state">
                    正在加载可用权限…
                  </p>
                  <div
                    v-else-if="permissionError"
                    class="permission-state error"
                  >
                    {{ permissionError }}
                    <button
                      class="text-btn"
                      type="button"
                      @click="loadPermissions"
                    >
                      重新加载
                    </button>
                  </div>
                  <template v-else>
                    <div
                      v-for="group in permissionGroups"
                      :key="group.key"
                      class="scope-group"
                    >
                      <h4>{{ group.title }}</h4>
                      <label
                        v-for="permission in group.items"
                        :key="permission.scope"
                        class="scope-option"
                      >
                        <input
                          v-model="customScopes"
                          type="checkbox"
                          :value="permission.scope"
                        />
                        <span
                          ><b>{{ friendlyPermissionTitle(permission.scope) }}</b
                          ><small>{{ permissionMeta(permission) }}</small></span
                        >
                      </label>
                    </div>
                  </template>
                </fieldset>

                <label class="field-label" for="advanced-remark"
                  >连接名称 <span>可选</span></label
                >
                <input
                  id="advanced-remark"
                  v-model.trim="customRemark"
                  class="form-control"
                  autocomplete="off"
                  placeholder="例如：自建库存脚本"
                />
                <div class="panel-actions">
                  <button
                    class="act-btn primary"
                    type="submit"
                    :disabled="
                      creatingMode === 'advanced' ||
                      !customAccountId ||
                      !customScopes.length ||
                      permissionsLoading ||
                      !!permissionError
                    "
                  >
                    {{
                      creatingMode === "advanced"
                        ? "正在创建…"
                        : "创建 API 访问凭证"
                    }}
                  </button>
                </div>
              </form>
            </details>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big
          >账号与连接码<br /><span>应用 · 账号 · 安全连接</span></template
        >
        <template #fine
          ><b>YuanHub</b> · 应用与数据连接<br />MAA × 鸢BWiki × 辟雍学府 ×
          YuanAssist 共同搭建<br />连接码不是登录密码，请只填写到你信任的工具中</template
        >
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  LayoutDashboard,
  Link2,
  PackageOpen,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from "@lucide/vue";
import IslandSidebar from "../../components/IslandSidebar.vue";
import SiteFooter from "../../components/SiteFooter.vue";
import { auth } from "../../store/auth.js";
import { beta } from "../../store/beta.js";
import BetaNotice from "../../components/beta/BetaNotice.vue";
import GameAccountManager from "../../components/GameAccountManager.vue";
import { getVisibleAdminToolGroups } from "../../utils/adminTools.js";
import { listAccounts } from "../../api/accounts.js";
import {
  deleteOpenApiToken,
  generateOpenApiToken,
  getOpenApiTokenSecret,
  getOpenApiPermissions,
  getOpenApiTokens,
  updateOpenApiTokenScopes,
} from "../../api/openApi.js";
import { activeAccount, normalizeAccountGame } from "../../store/activeAccount.js";
import { dialog } from "../../utils/dialog.js";
import {
  FALLBACK_DESCRIPTIONS as FALLBACK_SCOPES,
  MAAYUAN_REQUIRED_SCOPES,
  formatCreateTime as _formatCreateTime,
  hasEveryScope,
  mergeScopes,
  scopeDesc as _scopeDesc,
  scopeKeys,
} from "../../utils/openApiToken.js";

const tokens = ref([]);
const permissions = ref([]);
const accounts = ref([]);
const accountsLoading = ref(true);
const accountLoadError = ref("");
const loading = ref(false);
const permissionsLoading = ref(false);
const error = ref("");
const permissionError = ref("");
const creatingMode = ref("");
const updatingTokenId = ref("");
const copyingTokenId = ref("");
const notice = ref("");
const noticeError = ref(false);
const recentFailures = ref([]);
let noticeTimer = null;
let layoutFrame = null;

const showMaaYuanConnect = ref(false);
const maaAccountId = ref("");
const customAccountId = ref("");
const maaAccountChosen = ref(false);
const customAccountChosen = ref(false);
const maaSelectedAccount = computed(() => accounts.value.find(account => account.id === maaAccountId.value));
const customScopes = ref([]);
const customRemark = ref("");
const newToken = ref(null);
const newTokenPanel = ref(null);
const newTokenKind = ref("maayuan");
const tokenCopied = ref(false);
const maaAccountSelect = ref(null);
const maaYuanConnectPanel = ref(null);
const route = useRoute();

const managedAccountId = computed({
  get: function () {
    return activeAccount.id;
  },
  set: function (value) {
    activeAccount.set(value);
  },
});

const tokenCount = computed(function () {
  return tokens.value.length;
});
const busy = computed(function () {
  return (
    loading.value ||
    !!creatingMode.value ||
    !!updatingTokenId.value ||
    !!copyingTokenId.value
  );
});
const adminToolGroups = computed(function () {
  return getVisibleAdminToolGroups(auth.adminAccess);
});
const cameFromToday = computed(function () {
  return route.query.connect === "maayuan" && route.query.from === "today";
});
const permissionGroups = computed(function () {
  return [
    {
      key: "inventory",
      title: "库存数据",
      items: permissions.value.filter(function (permission) {
        return permission.scope.startsWith("inventory:");
      }),
    },
    {
      key: "operator",
      title: "密探数据",
      items: permissions.value.filter(function (permission) {
        return permission.scope.startsWith("operator:");
      }),
    },
    {
      key: "star",
      title: "星石采集",
      items: permissions.value.filter(function (permission) {
        return permission.scope.startsWith("star:");
      }),
    },
  ].filter(function (group) {
    return group.items.length;
  });
});

const FRIENDLY_PERMISSION_TITLES = {
  "inventory:read": "查看当前库存",
  "inventory:write": "导入并更新库存",
  "inventory:export": "下载完整库存备份",
  "operator:read": "查看当前密探数据与养成状态",
  "operator:write": "导入并更新密探数据",
  "operator:export": "下载完整密探备份",
  "operator:scan:write": "上传密探自动采集结果",
  "star:capture:write": "上传星石背包临时采集结果",
};

function friendlyPermissionTitle(scope) {
  return FRIENDLY_PERMISSION_TITLES[scope] || scope;
}
function permissionMeta(permission) {
  const description =
    permission && permission.description ? permission.description.trim() : "";
  return description && description !== permission.scope
    ? description + " · " + permission.scope
    : permission.scope;
}
function scopeDesc(scope) {
  return (
    scopeKeys(scope)
      .map(function (key) {
        return (
          FRIENDLY_PERMISSION_TITLES[key] ||
          _scopeDesc([key], permissions.value, FALLBACK_SCOPES)
        );
      })
      .join("、") || "未知权限"
  );
}
function supportsMaaYuan(tokenItem) {
  return hasEveryScope(tokenItem && tokenItem.scopes, MAAYUAN_REQUIRED_SCOPES);
}
function tokenLabel(tokenItem) {
  return tokenItem.remark || "自定义 API 连接";
}
function formatCreateTime(value) {
  return _formatCreateTime(value);
}

function toast(text, isError) {
  notice.value = text;
  noticeError.value = !!isError;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = null;
  if (isError) recentFailures.value = [text, ...recentFailures.value].slice(0, 5);
  else noticeTimer = setTimeout(dismissNotice, 4200);
}
function dismissNotice() { if (noticeTimer) clearTimeout(noticeTimer); noticeTimer = null; notice.value = ""; noticeError.value = false; }

function humanErr(err, fallback) {
  if (!err) return fallback;
  if (err.status === 429)
    return "这个账号的连接数量已达上限，请先停止一条不用的连接";
  const msg = err.message;
  if (!msg) return fallback;
  if (/Failed to fetch|NetworkError|fetch/i.test(msg))
    return "网络异常，请稍后重试";
  return msg;
}

function applyDefaultAccounts() {
  const defaultId = accounts.value.find(account => account.id === activeAccount.id)?.id || accounts.value[0]?.id || "";
  if (creatingMode.value !== "maayuan") {
    if (!accounts.value.some(account => account.id === maaAccountId.value)) maaAccountChosen.value = false;
    if (!maaAccountChosen.value) maaAccountId.value = defaultId;
  }
  if (creatingMode.value !== "advanced") {
    if (!accounts.value.some(account => account.id === customAccountId.value)) customAccountChosen.value = false;
    if (!customAccountChosen.value) customAccountId.value = defaultId;
  }
}

function connectionAccountLabel(account) {
  return account ? normalizeAccountGame(account.game) + " · " + account.name : "未选择游戏账号";
}

async function loadTokens() {
  const userId = auth.userInfo?.id;
  loading.value = true;
  error.value = "";
  try {
    const data = await getOpenApiTokens();
    if (userId !== auth.userInfo?.id) return;
    tokens.value = Array.isArray(data) ? data : [];
  } catch (err) {
    if (userId === auth.userInfo?.id) error.value = humanErr(err, "连接列表加载失败，请稍后重试");
  } finally {
    loading.value = false;
  }
}

async function loadAccounts() {
  if (!beta.canUseBetaFeatures) {
    accounts.value = []; accountsLoading.value = false;
    accountLoadError.value = "云端游戏账号需先取得内测资格；现有连接仍可查看和撤销。";
    return;
  }
  accountsLoading.value = true;
  accountLoadError.value = "";
  try {
    const data = await listAccounts();
    accounts.value = Array.isArray(data) ? data : [];
    activeAccount.syncAccounts(accounts.value);
    if (!accounts.value.some(function (account) { return account.id === activeAccount.id; })) {
      activeAccount.set(accounts.value[0] && accounts.value[0].id);
    }
  } catch (err) {
    accounts.value = [];
    accountLoadError.value = humanErr(err, "游戏账号加载失败，请重新加载");
  } finally {
    accountsLoading.value = false;
    applyDefaultAccounts();
  }
}

async function loadPermissions() {
  permissionsLoading.value = true;
  permissionError.value = "";
  try {
    const data = await getOpenApiPermissions();
    permissions.value = Array.isArray(data) ? data : [];
    if (!permissions.value.length)
      permissionError.value = "暂时无法取得可用权限，请重新加载";
  } catch (err) {
    permissions.value = [];
    permissionError.value = humanErr(err, "权限列表加载失败，请重新加载");
  } finally {
    permissionsLoading.value = false;
  }
}

function openMaaYuanConnect() {
  if (!beta.canUseBetaFeatures) { toast("请先前往内测页面确认体验资格。", true); return; }
  showMaaYuanConnect.value = !showMaaYuanConnect.value;
  if (showMaaYuanConnect.value) applyDefaultAccounts();
}

async function revealMaaYuanConnect() {
  if (!beta.canUseBetaFeatures) return;
  showMaaYuanConnect.value = true;
  applyDefaultAccounts();
  await nextTick();

  const panel = maaYuanConnectPanel.value;
  if (!panel) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  (maaAccountSelect.value || panel).focus({ preventScroll: true });
}

async function openMaaYuanFromRoute() {
  if (route.query.connect === "maayuan") await revealMaaYuanConnect();
}

function showCreatedToken(created, kind) {
  newToken.value = created || null;
  newTokenKind.value = kind;
  tokenCopied.value = false;
}

async function focusCreatedToken() {
  await nextTick();
  const panel = newTokenPanel.value;
  if (!panel) return;
  const reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  panel.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
  panel.focus({ preventScroll: true });
}

function keepFocusedTokenVisible() {
  const panel = newTokenPanel.value;
  if (!panel || document.activeElement !== panel) return;
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(function () {
    panel.scrollIntoView({ behavior: "auto", block: "start" });
  });
}

async function createMaaYuanConnection() {
  if (!beta.canUseBetaFeatures) { toast("请先前往内测页面确认体验资格。", true); return; }
  if (creatingMode.value) return;
  if (!maaAccountId.value) {
    toast("请先选择数据要保存到哪个游戏账号", true);
    return;
  }
  creatingMode.value = "maayuan";
  const userId = auth.userInfo?.id;
  const targetAccountId = maaAccountId.value;
  try {
    const created = await generateOpenApiToken({
      accountId: maaAccountId.value,
      scopes: MAAYUAN_REQUIRED_SCOPES.slice(),
      remark: "MaaYuan",
    });
    if (userId !== auth.userInfo?.id) return;
    showCreatedToken(created, "maayuan");
    showMaaYuanConnect.value = false;
    await focusCreatedToken();
    if (userId !== auth.userInfo?.id) return;
    toast("MaaYuan 连接码已创建");
    await loadTokens();
  } catch (err) {
    if (userId === auth.userInfo?.id) {
      maaAccountId.value = targetAccountId;
      maaAccountChosen.value = true;
      toast(humanErr(err, "MaaYuan 连接码创建失败"), true);
    }
  } finally {
    creatingMode.value = "";
    applyDefaultAccounts();
  }
}

async function createAdvancedToken() {
  if (!beta.canUseBetaFeatures) { toast("请先前往内测页面确认体验资格。", true); return; }
  if (creatingMode.value) return;
  if (!customAccountId.value) {
    toast("请先选择要绑定的游戏账号", true);
    return;
  }
  if (!customScopes.value.length) {
    toast("请至少选择一项权限", true);
    return;
  }
  creatingMode.value = "advanced";
  const userId = auth.userInfo?.id;
  const targetAccountId = customAccountId.value;
  try {
    const created = await generateOpenApiToken({
      accountId: customAccountId.value,
      scopes: customScopes.value.slice(),
      remark: customRemark.value || null,
    });
    if (userId !== auth.userInfo?.id) return;
    showCreatedToken(created, "advanced");
    await focusCreatedToken();
    if (userId !== auth.userInfo?.id) return;
    customScopes.value = [];
    customRemark.value = "";
    toast("API 访问凭证已创建");
    await loadTokens();
  } catch (err) {
    if (userId === auth.userInfo?.id) {
      customAccountId.value = targetAccountId;
      customAccountChosen.value = true;
      toast(humanErr(err, "API 访问凭证创建失败"), true);
    }
  } finally {
    creatingMode.value = "";
    applyDefaultAccounts();
  }
}

async function upgradeForMaaYuan(tokenItem) {
  if (!beta.canUseBetaFeatures) { toast("请先前往内测页面确认体验资格。", true); return; }
  const id = tokenItem && tokenItem.token_id;
  if (!id || updatingTokenId.value) return;
  const ownerId = auth.userInfo?.id;
  const nextScopes = mergeScopes(tokenItem.scopes, MAAYUAN_REQUIRED_SCOPES);
  const label = tokenLabel(tokenItem);
  if (!(await dialog.confirm({
      title: "补齐 MaaYuan 权限",
      message: "将为“" +
        label +
        "”补齐 MaaYuan 的库存上传、密探采集上传、密探读取和星石截图上传权限。连接码不会变化，原有权限也会保留。",
      type: "danger",
      confirmText: "补齐权限",
    })) || auth.userInfo?.id !== ownerId) return;
  updatingTokenId.value = id;
  try {
    await updateOpenApiTokenScopes(id, nextScopes);
    toast("MaaYuan 权限已补全，原连接码无需重新填写");
    await loadTokens();
  } catch (err) {
    toast(humanErr(err, "权限更新失败，请稍后重试"), true);
  } finally {
    updatingTokenId.value = "";
  }
}

async function removeToken(tokenItem) {
  const id = tokenItem && tokenItem.token_id;
  if (!id) return;
  const label = tokenLabel(tokenItem);
  const account = tokenItem.account_name || tokenItem.account_id;
  const ownerId = auth.userInfo?.id;
  if (!(await dialog.confirm({
      title: "停止连接",
      message: "停止“" +
        label +
        "”访问“" +
        account +
        "”后，使用这条连接码的工具将立即无法继续上传或读取数据。",
      type: "danger",
      confirmText: "停止连接",
    })) || auth.userInfo?.id !== ownerId) return;
  try {
    await deleteOpenApiToken(id);
    toast("连接已停止");
    await loadTokens();
  } catch (err) {
    toast(humanErr(err, "停止连接失败，请稍后重试"), true);
  }
}

async function copyExistingToken(tokenItem) {
  const id = tokenItem?.token_id;
  if (!id || copyingTokenId.value) return;
  const ownerId = auth.userInfo?.id;
  copyingTokenId.value = id;
  try {
    const tokenPromise = getOpenApiTokenSecret(id).then(function (result) {
      if (auth.userInfo?.id !== ownerId) throw new Error("登录用户已切换");
      if (typeof result?.token !== "string" || !result.token) throw new Error("连接码响应无效");
      return result.token;
    });
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.write === "function" &&
      typeof ClipboardItem === "function"
    ) {
      try {
        // WebKit 会在 await 后失去剪贴板所需的用户手势；先启动写入，再异步提供连接码。
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": tokenPromise.then(
              token => new Blob([token], { type: "text/plain" }),
            ),
          }),
        ]);
        await tokenPromise;
        toast("连接码已复制");
        return;
      } catch (_clipboardError) {
        if (auth.userInfo?.id !== ownerId) return;
      }
    }
    const token = await tokenPromise;
    if (auth.userInfo?.id !== ownerId) return;
    await copyToken(token, true);
  } catch (err) {
    if (auth.userInfo?.id === ownerId) toast(humanErr(err, "连接码复制失败"), true);
  } finally {
    copyingTokenId.value = "";
  }
}

async function copyToken(token, existing = false) {
  try {
    await navigator.clipboard.writeText(token);
  } catch (_err) {
    const textarea = document.createElement("textarea");
    try {
      textarea.value = token;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      if (!document.execCommand("copy")) throw new Error("复制失败");
    } catch (_fallbackError) {
      toast(existing ? "复制失败，请检查剪贴板权限" : "复制失败，请手动选择连接码复制", true);
      return;
    } finally {
      textarea.remove();
    }
  }
  if (!existing) tokenCopied.value = true;
  toast(existing ? "连接码已复制" : "连接码已复制，可以去 MaaYuan 中粘贴了");
}

function finishNewToken() {
  newToken.value = null;
  tokenCopied.value = false;
}

watch(() => beta.canUseBetaFeatures, () => {
  if (!beta.canUseBetaFeatures) { showMaaYuanConnect.value = false; newToken.value = null; }
  void loadAccounts();
});
watch(() => auth.userInfo?.id, () => { dismissNotice(); recentFailures.value = []; newToken.value = null; });
watch([accounts, () => activeAccount.id], function () {
  applyDefaultAccounts();
});
watch(
  () => route.query.connect,
  function (value) {
    if (value === "maayuan") void openMaaYuanFromRoute();
  },
);
onMounted(function () {
  window.addEventListener("resize", keepFocusedTokenVisible);
  Promise.all([loadPermissions(), loadTokens()]);
  void beta.loadMe().then(async function () {
    await loadAccounts();
    await openMaaYuanFromRoute();
  });
});
onBeforeUnmount(function () {
  window.removeEventListener("resize", keepFocusedTokenVisible);
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  if (noticeTimer) clearTimeout(noticeTimer);
});
</script>

<style scoped>
.profile-main {
  padding-bottom: 0;
}
.page-profile .hero { padding: 38px 0 28px; }
.page-profile .hero h1 { font-size: clamp(32px, 4vw, 48px); line-height: 1.2; letter-spacing: .02em; }
.capability-note { color: var(--rouge); font-size: 12px; }
#game-accounts, #maayuan-connect-panel { scroll-margin-top: 84px; }
.page-profile .hero::after {
  content: "连接";
}
.admin-tools {
  margin-top: 40px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 4px solid var(--accent);
  border-radius: 8px;
  padding: 20px 24px;
  display: grid;
  grid-template-columns: minmax(180px, 0.75fr) minmax(0, 1.5fr);
  align-items: start;
  gap: 24px;
}
.admin-kicker,
.section-kicker {
  color: var(--accent-strong);
  font-family: var(--font-d);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}
.admin-tools h2 {
  margin-top: 4px;
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.admin-tools-head p {
  margin-top: 7px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.6;
}
.admin-tools-body {
  min-width: 0;
}
.admin-workbench-link {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 48px;
  padding: 8px 12px;
  color: var(--cream);
  background: var(--tea);
  border-radius: 8px;
  text-decoration: none;
}
.admin-workbench-link:hover {
  background: var(--accent);
}
.admin-workbench-link span,
.admin-entry span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.admin-workbench-link small,
.admin-entry small {
  color: inherit;
  opacity: 0.72;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.35;
}
.admin-entry-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.admin-entry-group h3 {
  margin-bottom: 7px;
  color: var(--ink-60);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.admin-entry-group nav {
  display: grid;
  gap: 7px;
}
.admin-entry {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 8px 10px;
  color: var(--ink);
  background: var(--cream);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
  text-decoration: none;
}
.admin-entry:hover {
  color: var(--accent-strong);
  border-color: var(--accent);
}
.connection-card {
  margin-top: 40px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 30px;
}
.card-head h2 {
  margin-top: 5px;
  font-family: var(--font-s);
  font-weight: 900;
  font-size: 26px;
  letter-spacing: 0.04em;
  color: var(--ink);
}
.card-sub {
  margin-top: 9px;
  max-width: 680px;
  color: var(--ink-60);
  font-size: 14px;
  line-height: 1.8;
}
.app-pass {
  position: relative;
  margin-top: 24px;
  scroll-margin-top: 24px;
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr) auto;
  align-items: center;
  gap: 22px;
  padding: 24px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--cream), var(--surface));
  border: 1.5px solid var(--line);
  border-radius: 22px;
}
.app-pass::after {
  content: "MAAYUAN";
  position: absolute;
  right: 18px;
  bottom: -9px;
  color: rgba(73, 59, 44, 0.045);
  font-family: var(--font-d);
  font-size: 54px;
  font-weight: 900;
  letter-spacing: 0.08em;
  pointer-events: none;
}
.app-seal {
  position: relative;
  z-index: 1;
  width: 90px;
  height: 90px;
  display: grid;
  place-items: center;
  background: var(--yellow);
  border: 1px solid var(--line);
  border-radius: 28px 28px 28px 10px;
  transform: rotate(-2deg);
}
.app-seal img {
  width: 74px;
  height: 74px;
  object-fit: contain;
  transform: rotate(2deg);
}
.app-copy {
  position: relative;
  z-index: 1;
}
.app-title-row,
.connection-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.app-title-row h3 {
  font-family: var(--font-s);
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.brand-outline {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 9px;
  color: var(--brand-blue);
  border: 1.5px solid var(--brand-blue);
  border-radius: 7px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
}
.app-copy > p {
  margin-top: 7px;
  max-width: 620px;
  color: var(--ink-60);
  font-size: 13.5px;
  line-height: 1.75;
}
.app-capabilities {
  margin-top: 13px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.app-capabilities span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 10px;
  background: var(--paper);
  border-radius: 999px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 700;
}
.app-capabilities .no-read {
  background: rgba(191, 220, 192, 0.45);
}
.app-connect {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.connect-panel {
  margin-top: 14px;
  padding: 24px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 20px;
}
.panel-title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.panel-title h3 {
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 18px;
  font-weight: 900;
  letter-spacing: 0.025em;
}
.panel-title p {
  margin-top: 3px;
  color: var(--ink-60);
  font-size: 12.5px;
  line-height: 1.6;
}
.today-connect-note {
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid rgba(215, 137, 53, 0.24);
  border-radius: 10px;
  background: rgba(239, 210, 142, 0.14);
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.65;
}
.step-mark {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: var(--tea);
  border-radius: 9px;
  color: var(--cream);
  font-family: var(--font-d);
  font-size: 12px;
  font-weight: 900;
}
.grant-title {
  margin-top: 24px;
  padding-top: 22px;
  border-top: 1px dashed var(--line);
}
.field-label {
  display: block;
  margin-top: 18px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}
.field-label span {
  color: var(--ink-60);
  font-size: 11px;
  font-weight: 600;
}
.form-control {
  width: 100%;
  min-height: 46px;
  margin-top: 7px;
  padding: 10px 13px;
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 11px;
  font-family: var(--font-b);
  font-size: 14px;
}
.form-control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.field-help {
  margin-top: 7px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.6;
}
.field-help a {
  color: var(--accent-strong);
  font-weight: 800;
  text-underline-offset: 3px;
}
.account-inline-state {
  margin-top: 18px;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12px 14px;
  color: var(--ink-60);
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 700;
}
.account-inline-state.error {
  color: var(--rouge);
  border-color: rgba(166, 81, 74, 0.35);
}
.quick-account {
  margin-top: 18px;
  padding: 17px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.quick-account-heading h4 {
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.02em;
}
.quick-account-heading p {
  margin-top: 4px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.6;
}
.game-choice {
  margin: 15px 0 0;
  padding: 0;
  border: 0;
}
.game-choice legend {
  margin-bottom: 7px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}
.game-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.game-options label {
  position: relative;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-60);
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 800;
  transition:
    color 0.2s var(--ease),
    background-color 0.2s var(--ease),
    border-color 0.2s var(--ease);
}
.game-options label.selected {
  color: var(--ink);
  background: var(--yellow);
  border-color: var(--yellow-deep);
}
.game-options label:focus-within {
  outline: 3px solid rgba(91, 106, 140, 0.3);
  outline-offset: 2px;
}
.game-options input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.game-options input:disabled + span {
  opacity: 0.5;
}
.quick-account-row {
  margin-top: 7px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: stretch;
}
.quick-account-row .form-control {
  margin-top: 0;
}
.field-error {
  margin-top: 8px;
  color: var(--rouge);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
}
.grant-review {
  margin-top: 15px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.grant-column {
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.grant-column.allow {
  border-top: 3px solid var(--accent);
}
.grant-column.deny {
  border-top: 3px solid var(--brand-blue);
}
.grant-column h4 {
  margin-bottom: 9px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 900;
}
.grant-column p {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 7px;
  color: var(--ink-60);
  font-size: 12.5px;
  line-height: 1.55;
}
.grant-column p svg {
  flex: none;
  margin-top: 1px;
}
.grant-column.allow p svg {
  color: var(--accent-strong);
}
.grant-column.deny p svg {
  color: var(--brand-blue);
}
.stable-token-note {
  margin-top: 14px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 13px;
  color: var(--ink);
  background: rgba(239, 210, 142, 0.45);
  border-radius: 11px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.6;
}
.stable-token-note svg {
  flex: none;
  margin-top: 1px;
}
.panel-actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.act-btn {
  min-height: 44px;
  padding: 10px 20px;
  color: var(--ink);
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
  font-family: var(--font-b);
  font-size: 13px;
  font-weight: 800;
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease),
    transform 0.3s var(--ease);
  white-space: nowrap;
}
.act-btn.primary {
  color: var(--cream);
  background: var(--tea);
  border-color: transparent;
}
.act-btn.primary:hover:not(:disabled) {
  color: var(--cream);
  background: var(--accent);
}
.act-btn.ghost:hover:not(:disabled) {
  color: var(--ink);
  background: var(--cream);
  border-color: var(--ink);
}
.act-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.new-token {
  margin-top: 18px;
  padding: 20px;
  scroll-margin-top: 82px;
  background: var(--yellow);
  border: 1px solid rgba(73, 59, 44, 0.14);
  border-radius: 18px;
}
.new-token:focus {
  outline: 3px solid rgba(215, 137, 53, 0.55);
  outline-offset: 3px;
}
.success-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.success-icon {
  flex: none;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  color: var(--cream);
  background: var(--tea);
  border-radius: 11px;
}
.success-heading h3 {
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 18px;
  font-weight: 900;
}
.success-heading p {
  margin-top: 3px;
  color: var(--ink-60);
  font-size: 12.5px;
  line-height: 1.6;
}
.paste-steps {
  margin: 15px 0 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  list-style: none;
}
.paste-steps li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  min-height: 44px;
  padding: 10px;
  color: var(--ink);
  background: rgba(255, 253, 246, 0.68);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
}
.paste-step-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}
.paste-step-copy strong {
  font-size: 12px;
  font-weight: 900;
}
.paste-step-copy small {
  color: var(--ink-60);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.5;
}
.paste-steps li span {
  flex: none;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  color: var(--cream);
  background: var(--tea);
  border-radius: 50%;
  font-family: var(--font-d);
  font-size: 10px;
  font-weight: 900;
}
.nt-row {
  margin-top: 12px;
  display: flex;
  align-items: stretch;
  gap: 10px;
}
.nt-code {
  flex: 1;
  min-width: 0;
  padding: 11px 13px;
  overflow-wrap: anywhere;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-family: var(--font-d);
  font-size: 13px;
  line-height: 1.6;
}
.nt-footer {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--ink-60);
  font-size: 12px;
}
.text-btn {
  min-height: 44px;
  padding: 4px 2px;
  color: var(--accent-strong);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-family: var(--font-b);
  font-size: 12.5px;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.notice-line {
  position: fixed;
  z-index: var(--z-toast);
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom));
  display: flex;
  max-width: min(360px, calc(100vw - 32px));
  align-items: center;
  gap: 12px;
  padding: 11px 15px;
  color: var(--ink);
  background: var(--yellow);
  border-radius: 12px;
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.6;
}
.notice-line button { min-width: 44px; min-height: 44px; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 22px; }
@media (max-width: 767px) { .notice-line { bottom: calc(78px + env(safe-area-inset-bottom)); } }
.failure-history { margin-top: 12px; color: var(--ink-60); font-size: 12px; }
.failure-history summary { min-height: 44px; display: inline-flex; align-items: center; cursor: pointer; }
.failure-history li { margin: 4px 0; }
.notice-line.err {
  color: var(--rouge);
  background: rgba(166, 81, 74, 0.14);
}
.connections-section {
  margin-top: 30px;
  padding-top: 25px;
  border-top: 1px dashed var(--line);
}
.subsection-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.subsection-head h3 {
  margin-top: 4px;
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 21px;
  font-weight: 900;
  letter-spacing: 0.03em;
}
.connection-count {
  color: var(--ink-60);
  font-family: var(--font-d);
  font-size: 12px;
  font-weight: 800;
}
.connection-reminder {
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(215, 137, 53, 0.48);
  border-left: 4px solid var(--accent);
  background: var(--yellow);
}
.connection-reminder strong { display: block; font-size: 15px; }
.connection-reminder p { margin-top: 2px; font-size: 13px; font-weight: 500; }
.state {
  margin-top: 16px;
  padding: 44px 30px;
  color: var(--ink-60);
  background: var(--surface);
  border: 1.5px dashed var(--line);
  border-radius: 18px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
}
.state.err {
  color: var(--ink-60);
}
.state .link {
  min-height: 44px;
  margin-left: 10px;
  color: var(--accent-strong);
  background: transparent;
  border: 0;
  cursor: pointer;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.empty-state strong {
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 17px;
}
.empty-state span {
  max-width: 460px;
  line-height: 1.65;
}
.empty-state .act-btn {
  margin-top: 6px;
}
.token-list {
  margin-top: 15px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
}
.token-item {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
  padding: 17px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
  transition:
    border-color 0.3s var(--ease),
    box-shadow 0.35s var(--ease),
    transform 0.35s var(--ease);
}
.token-item:hover {
  border-color: rgba(73, 59, 44, 0.24);
  box-shadow: 0 16px 30px -24px rgba(73, 59, 44, 0.3);
  transform: translateY(-2px);
}
.connection-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  color: var(--ink-60);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.connection-icon.maayuan {
  background: var(--yellow);
}
.connection-icon img {
  width: 40px;
  height: 40px;
  object-fit: contain;
}
.connection-main {
  min-width: 0;
}
.connection-title-row h4 {
  color: var(--ink);
  font-family: var(--font-s);
  font-size: 16px;
  font-weight: 900;
}
.status-tag {
  display: inline-flex;
  align-items: center;
  min-height: 23px;
  padding: 2px 8px;
  color: var(--ink-60);
  background: var(--paper);
  border-radius: 6px;
  font-size: 10.5px;
  font-weight: 800;
}
.status-tag.ready {
  color: var(--accent-strong);
  background: rgba(239, 210, 142, 0.58);
}
.connection-account {
  margin-top: 5px;
  color: var(--ink-60);
  font-size: 12.5px;
}
.connection-account b {
  color: var(--ink);
}
.connection-scope {
  margin-top: 4px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.6;
}
.connection-created {
  margin-top: 4px;
  color: var(--ink-60);
  font-family: var(--font-d);
  font-size: 11px;
}
.technical-details {
  margin-top: 8px;
  color: var(--ink-60);
  font-size: 11px;
}
.technical-details summary {
  width: max-content;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: var(--brand-blue);
  font-weight: 800;
}
.technical-details code {
  display: block;
  margin-top: 7px;
  padding: 7px 9px;
  overflow-wrap: anywhere;
  color: var(--ink);
  background: var(--paper);
  border-radius: 7px;
  font-family: var(--font-d);
}
.technical-details p {
  margin-top: 4px;
  color: var(--ink-60);
  line-height: 1.5;
}
.connection-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.t-btn {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  color: var(--ink-60);
  background: transparent;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  font-family: var(--font-b);
  font-size: 12px;
  font-weight: 800;
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease);
}
.t-btn.copy {
  min-height: 46px;
  color: var(--cream);
  background: var(--tea);
  border-color: var(--tea);
}
.t-btn.copy:hover:not(:disabled) {
  color: var(--cream);
  background: var(--accent);
  border-color: var(--accent);
}
.t-btn.update {
  color: var(--accent-strong);
  background: rgba(239, 210, 142, 0.25);
}
.t-btn.update:hover:not(:disabled) {
  background: var(--yellow);
  border-color: var(--yellow-deep);
}
.t-btn.del:hover:not(:disabled) {
  color: var(--rouge);
  border-color: var(--rouge);
}
.t-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.advanced-zone {
  margin-top: 24px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--cream);
}
.advanced-zone > summary {
  min-height: 68px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  cursor: pointer;
  list-style: none;
}
.advanced-zone > summary::-webkit-details-marker {
  display: none;
}
.advanced-icon {
  flex: none;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  color: var(--brand-blue);
  border: 1.5px solid var(--brand-blue);
  border-radius: 12px;
}
.advanced-zone summary span:nth-child(2) {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.advanced-zone summary b {
  color: var(--ink);
  font-size: 13.5px;
}
.advanced-zone summary small {
  color: var(--ink-60);
  font-size: 11.5px;
  line-height: 1.5;
}
.advanced-chevron {
  flex: none;
  margin-left: auto;
  color: var(--ink-35);
  transition: transform 0.25s var(--ease);
}
.advanced-zone[open] .advanced-chevron {
  transform: rotate(180deg);
}
.advanced-form {
  padding: 2px 18px 20px;
  border-top: 1px dashed var(--line);
}
.advanced-warning {
  margin-top: 16px;
  padding: 10px 12px;
  color: var(--ink-60);
  background: var(--paper);
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.6;
}
.scope-fieldset {
  margin-top: 20px;
  padding: 0;
  border: 0;
}
.scope-fieldset legend {
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}
.scope-group {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
}
.scope-group h4 {
  grid-column: 1/-1;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 800;
}
.scope-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 58px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 11px;
  cursor: pointer;
}
.scope-option:has(input:checked) {
  background: rgba(239, 210, 142, 0.32);
  border-color: var(--yellow-deep);
}
.scope-option input {
  flex: none;
  width: 17px;
  height: 17px;
  margin-top: 2px;
  accent-color: var(--accent);
}
.scope-option span {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.scope-option b {
  color: var(--ink);
  font-size: 12.5px;
}
.scope-option small {
  color: var(--ink-60);
  font-family: var(--font-d);
  font-size: 10.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.permission-state {
  margin-top: 12px;
  padding: 16px;
  color: var(--ink-60);
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 11px;
  font-size: 12px;
}
.permission-state.error {
  color: var(--rouge);
}

@media (max-width: 1080px) {
  .app-pass {
    scroll-margin-top: calc(var(--mobile-shell-follow-top, 72px) + 12px);
  }
}

@media (max-width: 820px) {
  .admin-tools {
    grid-template-columns: 1fr;
  }
  .admin-entry-groups {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .app-pass {
    grid-template-columns: 76px minmax(0, 1fr);
  }
  .app-seal {
    width: 72px;
    height: 72px;
    border-radius: 22px 22px 22px 9px;
  }
  .app-seal img {
    width: 60px;
    height: 60px;
  }
  .app-connect {
    grid-column: 1/-1;
    width: 100%;
  }
  .paste-steps {
    grid-template-columns: 1fr;
  }
  .token-item {
    grid-template-columns: 46px minmax(0, 1fr);
  }
  .connection-actions {
    grid-column: 2;
    justify-content: flex-start;
  }
}

@media (max-width: 640px) {
  .admin-tools {
    padding: 18px 16px;
  }
  .admin-entry-groups {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .connection-card {
    padding: 20px 16px;
    border-radius: 20px;
  }
  .app-pass {
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 14px;
    padding: 17px;
  }
  .app-pass::after {
    display: none;
  }
  .app-seal {
    width: 56px;
    height: 56px;
    border-radius: 18px 18px 18px 7px;
  }
  .app-seal img {
    width: 49px;
    height: 49px;
  }
  .app-title-row h3 {
    font-size: 21px;
  }
  .app-capabilities {
    gap: 6px;
  }
  .app-capabilities span {
    width: 100%;
    border-radius: 9px;
  }
  .connect-panel {
    padding: 18px 14px;
  }
  .grant-review {
    grid-template-columns: 1fr;
  }
  .quick-account-row {
    grid-template-columns: 1fr;
  }
  .quick-account-row .act-btn {
    width: 100%;
  }
  .form-control {
    font-size: 16px;
  }
  .panel-actions .act-btn {
    flex: 1;
  }
  .nt-row {
    flex-direction: column;
  }
  .nt-footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .t-btn.copy {
    width: 100%;
  }
  .token-item {
    grid-template-columns: 42px minmax(0, 1fr);
    padding: 14px 12px;
  }
  .connection-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  .connection-icon img {
    width: 35px;
    height: 35px;
  }
  .connection-actions {
    grid-column: 1/-1;
    justify-content: stretch;
  }
  .connection-actions .t-btn {
    flex: 1;
  }
  .scope-group {
    grid-template-columns: 1fr;
  }
  .advanced-zone > summary {
    padding: 12px;
  }
}
</style>
