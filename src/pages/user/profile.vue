<template>
  <div class="page-profile">
    <IslandSidebar />

    <main id="main-content" class="profile-main">
      <header class="page-header">
        <div class="wrap">
          <h1 class="page-header-title">账号与连接码</h1>
          <p class="page-header-description">管理游戏账号与应用连接，核对数据归属和访问范围。</p>
        </div>
      </header>

      <section>
        <div class="wrap">
          <BetaNotice />
          <OnboardingGuide v-if="TUTORIALS_ENABLED" :tasks="['today-first-data', 'operator-first-entry', 'inventory-first-baseline', 'account-create', 'maayuan-first-sync']" :target="maaTutorialTarget" />

          <section class="game-account-summary" aria-labelledby="game-account-summary-title" :aria-busy="accountsLoading">
            <!-- 路由 hash 滚动固定 top: 0，锚点上移以避开移动导航。 -->
            <span id="game-accounts" class="account-summary-anchor" aria-hidden="true" />
            <div class="account-summary-copy">
              <div class="account-summary-heading"><h2 id="game-account-summary-title">游戏账号</h2><TutorialEntry v-if="TUTORIALS_ENABLED" task="account-create" label="账号教程" /></div>
              <p v-if="accountsLoading" role="status">正在读取游戏账号…</p>
              <div v-else-if="accountLoadError" class="account-summary-error" role="alert">
                <p>{{ accountLoadError }}</p>
                <button class="text-btn" type="button" @click="loadAccounts">重试</button>
              </div>
              <template v-else-if="accounts.length">
                <p class="account-summary-current" :title="connectionAccountLabel(currentAccount)">
                  {{ currentAccount ? '当前账号：' + connectionAccountLabel(currentAccount) : '尚未选择当前账号' }}
                </p>
                <p class="account-summary-count">共 {{ accounts.length }} 个游戏账号</p>
              </template>
              <p v-else>尚未创建游戏账号</p>
            </div>
            <button class="act-btn ghost account-summary-manage" type="button" data-tour="account-create"
              aria-haspopup="dialog" :aria-expanded="!!accountManagerView" :disabled="accountsLoading || !!accountLoadError"
              @click="openAccountManager(accounts.length ? 'list' : 'create', $event)">
              {{ accountsLoading || accountLoadError || accounts.length ? '管理游戏账号' : '创建游戏账号' }}
            </button>
          </section>

          <GameAccountManager
            v-if="accountManagerView"
            presentation="dialog"
            :initial-view="accountManagerView"
            :accounts="accounts"
            :loading="accountsLoading"
            :load-error="accountLoadError"
            @reload="loadAccounts"
            @close="accountManagerView = ''"
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
                  <button v-if="TUTORIALS_ENABLED" class="act-btn ghost maayuan-tutorial-entry" type="button" @click="beginMaaYuanTutorial()">连接教程</button>
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
                    />上传星石截图</span
                  >
                  <span class="no-read"
                    ><ShieldCheck
                      :size="15"
                      aria-hidden="true"
                    />读取密探养成状态</span
                  >
                </div>
                <p class="capability-note">星石自动采集仍在接入中，请先在星石背包导入截图。</p>
                <div v-if="TUTORIALS_ENABLED" id="maayuan-tutorial-start" />
              </div>
              <button
                class="act-btn primary app-connect"
                type="button"
                data-tour="maayuan-sync"
                :class="{ 'tutorial-target': maaGuideActive && onboarding.waitingFor === 'maa_connect' }"
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

            <details class="maayuan-other-tasks">
              <summary>以后还可以同步什么</summary>
              <p>密探练度：百宝箱 · 采集密探信息。派遣 / 情报掉落：据点日常，开启「记录奖励内容及数量」与「同步至 YuanHub」。</p>
              <p>星石：网页端截图识别可用；MaaYuan 自动采集仍在接入中。</p>
            </details>

            <form
              v-if="showMaaYuanConnect"
              ref="maaYuanConnectPanel"
              tabindex="-1"
              id="maayuan-connect-panel"
              class="connect-panel"
              aria-labelledby="connect-panel-title"
              @submit.prevent="createMaaYuanConnection"
            >
              <div v-if="TUTORIALS_ENABLED" id="maayuan-tutorial-form" />
              <div class="panel-title">
                <span class="step-mark">1</span>
                <div>
                  <h3 id="connect-panel-title">选择数据保存到哪个账号</h3>
                  <p>连接码只会绑定一个游戏账号，不能访问你的其他账号。</p>
                </div>
              </div>
              <p v-if="cameFromToday" class="today-connect-note" role="note">
                以后可从「账号与连接码」管理连接。
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
                  @change="chooseMaaAccount"
                  class="form-control"
                  :class="{ 'tutorial-target': maaGuideActive && onboarding.waitingFor === 'maa_account' }"
                  :disabled="creatingMode === 'maayuan'"
                  aria-describedby="maayuan-account-help"
                >
                  <option v-if="maaGuideActive && !onboarding.maaYuan.accountId" value="" disabled>请选择游戏账号</option>
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
                  <p>先创建游戏账号；创建完成后这里会自动出现可绑定账号。</p>
                </div>
                <button class="act-btn primary quick-account-manage-link" type="button" aria-haspopup="dialog"
                  @click="openAccountManager('create', $event)">创建游戏账号</button>
              </section>

              <div class="panel-title grant-title">
                <span class="step-mark">2</span>
                <div>
                  <h3>确认 MaaYuan 可以做什么</h3>
                  <p>读取密探状态，用于按养成状态筛选。</p>
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
                    <Check :size="17" aria-hidden="true" />上传星石截图（MaaYuan 自动采集接入中）
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
                <KeyRound :size="17" aria-hidden="true" />以后更新权限仍需你确认，连接码无需重新填写。
              </p>
              <div class="panel-actions">
                <button
                  class="act-btn ghost"
                  type="button"
                  :disabled="creatingMode === 'maayuan'"
                  @click="closeMaaYuanForm"
                >
                  取消
                </button>
                <button
                  class="act-btn primary"
                  type="submit"
                  :class="{ 'tutorial-target': maaGuideActive && onboarding.waitingFor === 'maa_create' }"
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
              <div v-if="TUTORIALS_ENABLED && newTokenKind === 'maayuan'" id="maayuan-tutorial-copy" />
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
              <p v-if="newTokenKind === 'maayuan'" class="paste-steps">复制连接码后，前往 MaaYuan 开启同步。仅创建连接码不表示同步成功。</p>
              <details v-if="newTokenKind === 'maayuan' && tokenCopied" class="paste-steps">
                <summary>现在去 MaaYuan 完成设置</summary>
                <p>打开「百宝箱 · 自动识别背包」，开启「同步至 YuanHub」，在「YuanHub 连接码」粘贴刚复制的内容，运行一次任务，然后回到 YuanHub 检查库存。</p>
                <p>星石 → YuanHub 网页端先导入截图；MaaYuan 自动采集接入中。</p>
              </details>
              <div class="nt-row">
                <code class="nt-code">{{ newToken.token }}</code>
                <button
                  class="t-btn copy"
                  type="button"
                  @click="copyToken(newToken.token)"
                  :class="{ 'tutorial-target': maaGuideActive && onboarding.waitingFor === 'maa_copy' && onboarding.maaYuan.connectionId === newToken.token_id }"
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
              <button type="button" aria-label="关闭提示" @click="dismissNotice"><X :size="16" aria-hidden="true" /></button>
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

              <div v-if="TUTORIALS_ENABLED" id="maayuan-tutorial-connection" />
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
                      <p v-if="!supportsMaaYuan(tokenItem)">需要“仅扫描养成中”时，点击此连接的“让它支持 MaaYuan”补齐权限，原连接码不变。</p>
                    </details>
                  </div>
                  <div class="connection-actions">
                    <button
                      class="t-btn copy"
                      type="button"
                      :disabled="busy"
                      @click="copyExistingToken(tokenItem)"
                      :class="{ 'tutorial-target': maaGuideActive && onboarding.waitingFor === 'maa_copy' && onboarding.maaYuan.connectionId === tokenItem.token_id }"
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
          ><b>YuanHub</b> · 应用与数据连接<br />MaaYuan × 鸢BWiki × 辟雍学府 ×
          YuanAssist 共同搭建<br />连接码不是登录密码，请只填写到你信任的工具中</template
        >
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { TUTORIALS_ENABLED } from "../../config/features.js";
import { useOnboardingStore } from '../../stores/onboarding.js'
import { recordMaaYuanAction, refreshTutorialBusiness, tutorialBusiness } from '../../utils/onboardingTour.js'
import { useAccountListUpdates } from '../../store/accountList.js'
import '@/styles/page-header.css'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Link2,
  PackageOpen,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from "@lucide/vue";
import IslandSidebar from "../../components/IslandSidebar.vue";
import OnboardingGuide from "../../components/OnboardingGuide.vue";
import TutorialEntry from "../../components/TutorialEntry.vue";
import SiteFooter from "../../components/SiteFooter.vue";
import { auth } from "../../store/auth.js";
import { beta } from "../../store/beta.js";
import BetaNotice from "../../components/beta/BetaNotice.vue";
import GameAccountManager from "../../components/GameAccountManager.vue";
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

const onboarding = useOnboardingStore();
onboarding.initialize(String(auth.userInfo?.id || 'guest'));
const maaGuideActive = computed(() => onboarding.active && onboarding.tutorialTask === 'maayuan-first-sync' && onboarding.ownerId === String(auth.userInfo?.id || 'guest'));
const maaTutorialTarget = computed(() => {
  if (onboarding.tutorialTask !== 'maayuan-first-sync') return '';
  if (showMaaYuanConnect.value && ['maa_account', 'maa_create'].includes(onboarding.waitingFor)) return '#maayuan-tutorial-form';
  if (['maa_copy', 'maa_sync', 'verified'].includes(onboarding.waitingFor)) {
    if (newToken.value?.token_id === onboarding.maaYuan.connectionId) return '#maayuan-tutorial-copy';
    if (tokens.value.some(token => token.token_id === onboarding.maaYuan.connectionId)) return '#maayuan-tutorial-connection';
  }
  return '#maayuan-tutorial-start';
});
const tokens = ref([]);
const permissions = ref([]);
const accounts = ref([]);
useAccountListUpdates(next => {
  invalidateAccountLoad();
  accounts.value = next;
});
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
let accountLoadVersion = 0;
let profileAlive = true;

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

const accountManagerView = ref("");
const currentAccount = computed(() => accounts.value.find(account => account.id === activeAccount.id));

function openAccountManager(view, event) {
  if (accountsLoading.value || accountLoadError.value || !beta.canUseBetaFeatures || accountManagerView.value) return;
  event.currentTarget.focus();
  accountManagerView.value = view;
}

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
    {
      key: "calendar",
      title: "活动日历",
      items: permissions.value.filter(function (permission) {
        return permission.scope.startsWith("calendar:");
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
  "operator:daily-tasks:write": "在手机小组件中记录今日历练完成",
  "star:capture:write": "上传星石截图",
  "calendar:read": "查看活动日历与订阅",
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
    if (!maaAccountChosen.value) maaAccountId.value = maaGuideActive.value && !onboarding.maaYuan.accountId ? "" : defaultId;
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

function invalidateAccountLoad() {
  accountLoadVersion++;
  accountsLoading.value = false;
  accountLoadError.value = "";
}

async function loadAccounts() {
  const version = ++accountLoadVersion;
  const ownerId = auth.userInfo?.id;
  const isCurrent = () => profileAlive && version === accountLoadVersion && ownerId === auth.userInfo?.id;
  if (!beta.canUseBetaFeatures) {
    accounts.value = []; accountsLoading.value = false;
    accountLoadError.value = "云端游戏账号需先取得内测资格；现有连接仍可查看和撤销。";
    return;
  }
  accountsLoading.value = true;
  accountLoadError.value = "";
  try {
    const data = await listAccounts(ownerId);
    if (!isCurrent()) return;
    accounts.value = Array.isArray(data) ? data : [];
    activeAccount.syncAccounts(accounts.value);
    if (!accounts.value.some(function (account) { return account.id === activeAccount.id; })) {
      activeAccount.set(accounts.value[0] && accounts.value[0].id);
    }
  } catch (err) {
    if (!isCurrent()) return;
    accounts.value = [];
    accountLoadError.value = humanErr(err, "游戏账号加载失败，请重新加载");
  } finally {
    if (isCurrent()) {
      accountsLoading.value = false;
      applyDefaultAccounts();
    }
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

function beginMaaYuanTutorial(connection) {
  if (!TUTORIALS_ENABLED) return;
  onboarding.initialize(String(auth.userInfo?.id || 'guest'));
  if (connection && connection.token_id !== onboarding.maaYuan.connectionId) onboarding.setMaaYuanCheckpoint({ connectionId: connection.token_id, accountId: connection.account_id, phase: 'token-created' });
  onboarding.start('maayuan-first-sync');
  tutorialBusiness.maaFormOpen = showMaaYuanConnect.value;
  if (showMaaYuanConnect.value && !onboarding.maaYuan.connectionId && !onboarding.maaYuan.accountId) {
    if (maaAccountChosen.value && maaAccountId.value) recordMaaYuanAction('account', { accountId: maaAccountId.value });
    else maaAccountId.value = '';
  }
  void refreshTutorialBusiness();
}

function chooseMaaAccount() {
  maaAccountChosen.value = true;
  recordMaaYuanAction('account', { accountId: maaAccountId.value });
}

function closeMaaYuanForm() {
  showMaaYuanConnect.value = false;
  recordMaaYuanAction('connect', { open: false });
}

function openMaaYuanConnect() {
  if (!beta.canUseBetaFeatures) { toast("请先前往内测页面确认体验资格。", true); return; }
  showMaaYuanConnect.value = !showMaaYuanConnect.value;
  if (showMaaYuanConnect.value) {
    applyDefaultAccounts();
    if (maaGuideActive.value && !onboarding.maaYuan.accountId) maaAccountId.value = "";
    void nextTick(() => {
      maaAccountSelect.value?.scrollIntoView({ block: 'center', behavior: 'auto' });
      maaAccountSelect.value?.focus({ preventScroll: true });
    });
  }
  recordMaaYuanAction('connect', { open: showMaaYuanConnect.value });
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
    if (!created?.token_id || typeof created.token !== 'string' || !created.token || (created.account_id && created.account_id !== targetAccountId)) throw new Error('连接码响应无效，请重新读取现有连接');
    showCreatedToken(created, "maayuan");
    recordMaaYuanAction('created', { connectionId: created.token_id, accountId: targetAccountId });
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
        if (auth.userInfo?.id !== ownerId) return;
        recordMaaYuanAction('copied', { connectionId: id, accountId: tokenItem.account_id });
        toast("连接码已复制");
        return;
      } catch (_clipboardError) {
        if (auth.userInfo?.id !== ownerId) return;
      }
    }
    const token = await tokenPromise;
    if (auth.userInfo?.id !== ownerId) return;
    if (await copyToken(token, true)) recordMaaYuanAction('copied', { connectionId: id, accountId: tokenItem.account_id });
  } catch (err) {
    if (auth.userInfo?.id === ownerId) toast(humanErr(err, "连接码复制失败"), true);
  } finally {
    copyingTokenId.value = "";
  }
}

async function copyToken(token, existing = false) {
  const ownerId = auth.userInfo?.id;
  const connectionId = newToken.value?.token_id;
  const accountId = newToken.value?.account_id || maaAccountId.value;
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
      return false;
    } finally {
      textarea.remove();
    }
  }
  if (auth.userInfo?.id !== ownerId || !profileAlive) return false;
  if (!existing) {
    tokenCopied.value = true;
    if (newTokenKind.value === 'maayuan') recordMaaYuanAction('copied', { connectionId, accountId });
  }
  toast(existing ? "连接码已复制" : "连接码已复制，可以去 MaaYuan 中粘贴了");
  return true;
}

function finishNewToken() {
  newToken.value = null;
  tokenCopied.value = false;
}

watch(() => beta.canUseBetaFeatures, () => {
  if (!beta.canUseBetaFeatures) { showMaaYuanConnect.value = false; newToken.value = null; accountManagerView.value = ""; }
  void loadAccounts();
});
watch(() => auth.userInfo?.id, () => {
  accountLoadVersion++;
  accounts.value = [];
  accountManagerView.value = "";
  dismissNotice(); recentFailures.value = []; newToken.value = null;
  tokens.value = [];
  onboarding.initialize(String(auth.userInfo?.id || 'guest'));
  void loadAccounts();
}, { flush: "sync" });
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
  profileAlive = false;
  tutorialBusiness.maaFormOpen = false;
  accountLoadVersion++;
  window.removeEventListener("resize", keepFocusedTokenVisible);
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  if (noticeTimer) clearTimeout(noticeTimer);
});
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.tutorial-target { outline: 2px solid var(--tea); outline-offset: 3px; }
.maayuan-other-tasks summary, details.paste-steps summary { cursor: pointer; }
.capability-note { color: var(--rouge); }
.game-account-summary { border-bottom: 1px solid var(--line); }
.account-summary-copy h2 { color: var(--tea); }
.account-summary-copy p { color: var(--ink-60); }
.account-summary-copy .account-summary-current { color: var(--ink); }
.account-summary-error p { color: var(--rouge); }
.account-summary-manage:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.section-kicker {
  color: var(--accent-strong);
}
.connection-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
}
.card-head h2 {
  color: var(--ink);
}
.card-sub {
  color: var(--ink-60);
}
.app-pass {
  background: linear-gradient(135deg, var(--cream), var(--surface));
  border: 1.5px solid var(--line);
  border-radius: 22px;
}
.app-pass::after {
  content: "MAAYUAN";
  color: rgba(73, 59, 44, 0.045);
  pointer-events: none;
}
.app-seal {
  background: var(--yellow);
  border: 1px solid var(--line);
  border-radius: 28px 28px 28px 10px;
}
.brand-outline {
  color: var(--brand-blue);
  border: 1.5px solid var(--brand-blue);
  border-radius: 7px;
}
.app-copy > p {
  color: var(--ink-60);
}
.app-capabilities span {
  background: var(--paper);
  border-radius: 999px;
  color: var(--ink);
}
.app-capabilities .no-read {
  background: rgba(191, 220, 192, 0.45);
}
.connect-panel {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 20px;
}
.panel-title h3 {
  color: var(--ink);
}
.panel-title p {
  color: var(--ink-60);
}
.today-connect-note {
  border: 1px solid rgba(215, 137, 53, 0.24);
  border-radius: 10px;
  background: rgba(239, 210, 142, 0.14);
  color: var(--ink-60);
}
.step-mark {
  background: var(--tea);
  border-radius: 9px;
  color: var(--cream);
}
.grant-title {
  border-top: 1px dashed var(--line);
}
.field-label {
  color: var(--ink);
}
.field-label span {
  color: var(--ink-60);
}
.form-control {
  color: var(--ink);
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 11px;
}
.form-control:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.field-help {
  color: var(--ink-60);
}
.field-help a {
  color: var(--accent-strong);
  text-underline-offset: 3px;
}
.account-inline-state {
  color: var(--ink-60);
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 12px;
}
.account-inline-state.error {
  color: var(--rouge);
  border-color: rgba(166, 81, 74, 0.35);
}
.quick-account {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.quick-account-heading h4 {
  color: var(--ink);
}
.quick-account-heading p {
  color: var(--ink-60);
}
.game-choice {
  border: 0;
}
.game-choice legend {
  color: var(--ink);
}
.game-options label {
  color: var(--ink-60);
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
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
  opacity: 0;
}
.game-options input:disabled + span {
  opacity: 0.5;
}
.field-error {
  color: var(--rouge);
}
.grant-column {
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
  color: var(--ink);
}
.grant-column p {
  color: var(--ink-60);
}
.grant-column.allow p svg {
  color: var(--accent-strong);
}
.grant-column.deny p svg {
  color: var(--brand-blue);
}
.stable-token-note {
  color: var(--ink);
  background: rgba(239, 210, 142, 0.45);
  border-radius: 11px;
}
.act-btn {
  color: var(--ink);
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease),
    transform 0.3s var(--ease);
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
  background: var(--yellow);
  border: 1px solid rgba(73, 59, 44, 0.14);
  border-radius: 18px;
}
.new-token:focus {
  outline: 3px solid rgba(215, 137, 53, 0.55);
  outline-offset: 3px;
}
.success-icon {
  color: var(--cream);
  background: var(--tea);
  border-radius: 11px;
}
.success-heading h3 {
  color: var(--ink);
}
.success-heading p {
  color: var(--ink-60);
}
.paste-steps li {
  color: var(--ink);
  background: rgba(255, 253, 246, 0.68);
  border-radius: 10px;
}
.paste-step-copy small {
  color: var(--ink-60);
}
.paste-steps li span {
  color: var(--cream);
  background: var(--tea);
  border-radius: 50%;
}
.nt-code {
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.nt-footer {
  color: var(--ink-60);
}
.text-btn {
  color: var(--accent-strong);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.notice-line {
  color: var(--ink);
  background: var(--yellow);
  border-radius: 12px;
}
.notice-line button { border: 0; background: transparent; color: inherit; cursor: pointer; }
.failure-history { color: var(--ink-60); }
.failure-history summary { cursor: pointer; }
.notice-line.err {
  color: var(--rouge);
  background: rgba(166, 81, 74, 0.14);
}
.connections-section {
  border-top: 1px dashed var(--line);
}
.subsection-head h3 {
  color: var(--ink);
}
.connection-count {
  color: var(--ink-60);
}
.connection-reminder {
  border: 1px solid rgba(215, 137, 53, 0.48);
  border-left: 4px solid var(--accent);
  background: var(--yellow);
}
.state {
  color: var(--ink-60);
  background: var(--surface);
  border: 1.5px dashed var(--line);
  border-radius: 18px;
}
.state.err {
  color: var(--ink-60);
}
.state .link {
  color: var(--accent-strong);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.empty-state strong {
  color: var(--ink);
}
.token-item {
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
}
.connection-icon {
  color: var(--ink-60);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.connection-icon.maayuan {
  background: var(--yellow);
}
.connection-title-row h4 {
  color: var(--ink);
}
.status-tag {
  color: var(--ink-60);
  background: var(--paper);
  border-radius: 6px;
}
.status-tag.ready {
  color: var(--accent-strong);
  background: rgba(239, 210, 142, 0.58);
}
.connection-account {
  color: var(--ink-60);
}
.connection-account b {
  color: var(--ink);
}
.connection-scope {
  color: var(--ink-60);
}
.connection-created {
  color: var(--ink-60);
}
.technical-details {
  color: var(--ink-60);
}
.technical-details summary {
  cursor: pointer;
  color: var(--brand-blue);
}
.technical-details code {
  color: var(--ink);
  background: var(--paper);
  border-radius: 7px;
}
.technical-details p {
  color: var(--ink-60);
}
.t-btn {
  color: var(--ink-60);
  background: transparent;
  border: 1.5px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease);
}
.t-btn.copy {
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
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--cream);
}
.advanced-zone > summary {
  cursor: pointer;
}
.advanced-icon {
  color: var(--brand-blue);
  border: 1.5px solid var(--brand-blue);
  border-radius: 12px;
}
.advanced-zone summary b {
  color: var(--ink);
}
.advanced-zone summary small {
  color: var(--ink-60);
}
.advanced-chevron {
  color: var(--ink-35);
  transition: transform 0.25s var(--ease);
}
.advanced-form {
  border-top: 1px dashed var(--line);
}
.advanced-warning {
  color: var(--ink-60);
  background: var(--paper);
  border-radius: 10px;
}
.scope-fieldset {
  border: 0;
}
.scope-fieldset legend {
  color: var(--ink);
}
.scope-group h4 {
  color: var(--ink-60);
}
.scope-option {
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
  accent-color: var(--accent);
}
.scope-option b {
  color: var(--ink);
}
.scope-option small {
  color: var(--ink-60);
}
.permission-state {
  color: var(--ink-60);
  background: var(--surface);
  border: 1px dashed var(--line);
  border-radius: 11px;
}
.permission-state.error {
  color: var(--rouge);
}

@media (max-width: 820px) {
  .app-seal {
    border-radius: 22px 22px 22px 9px;
  }
}

@media (max-width: 640px) {
  .connection-card {
    border-radius: 20px;
  }
  .app-seal {
    border-radius: 18px 18px 18px 7px;
  }
  .app-capabilities span {
    border-radius: 9px;
  }
  .connection-icon {
    border-radius: 12px;
  }
}
</style>
<style scoped src="./profilePageDesktop.css"></style>
<style scoped src="./profilePageMobile.css"></style>
