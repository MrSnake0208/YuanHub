<template>
  <div class="page-star">
    <IslandSidebar />
    <main id="main-content" class="star-main">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">星石</span><span class="pill">识别</span
            ><span class="pill">养成</span><span class="pill">经验</span>
          </div>
          <h1>星石养成<span class="small">背包 · 整理 · 计划</span></h1>
          <p class="hero-sub">
            如鸢 / 代号鸢 星石背包整理：本地导入截图并完成 OCR
            与人工核对，管理当前背包、养成计划与经验星曜，并在登录后同步当前账号数据。
          </p>
          <div class="author-badge" v-reveal>
            <span class="ab-mark">©</span
            ><span class="ab-txt"
              >独立创作 · 著作权归作者 <b>Drifty Yan</b> 所有</span
            >
          </div>
          <div class="hero-stats">
            <div>
              <div class="k">当前背包</div>
              <div class="v">
                {{ summary.currentCount }}<small class="stat-unit">颗</small>
              </div>
            </div>
            <div>
              <div class="k">养成计划</div>
              <div class="v">
                {{ summary.planCount }}<small class="stat-unit">颗</small>
              </div>
            </div>
            <div>
              <div class="k">所属游戏</div>
              <div class="v game-stat">{{ summary.gameVersion }}</div>
            </div>
            <div class="is-authed">
              <div class="k">登录状态</div>
              <div class="v">{{ auth.isLoggedIn ? "已登录" : "未登录" }}</div>
            </div>
          </div>
        </div>
      </header>
      <section>
        <div class="wrap">
          <DataAccountContextBar
            :accounts="accounts"
            :account-id="accountId"
            :game="accountGame"
            :is-logged-in="auth.isLoggedIn"
            :loading="accountsLoading"
            description="当前星石背包、养成计划与同步数据均归属此账号。"
          />

          <AccountWorkspace
            v-model:accountId="accountId"
            v-model:game="accountGame"
            :accounts="accounts"
            :error="accountError"
            :disabled="!auth.isLoggedIn || accountsLoading || starExchangeBusy"
            :game-editable="false"
            :manage-enabled="false"
            stacked
            soft-dropdown
            heading-title="当前数据账号"
            heading-sub="这里只切换本次查看和录入的账号；账号名称与所属游戏统一在个人中心管理。"
            @change="onAccountChange"
          >
            <template #actions>
              <button
                type="button"
                class="act-btn archive-toggle"
                :disabled="
                  !productReady ||
                  accountsLoading ||
                  starExchangeBusy ||
                  !selectedHostAccount()
                "
                :aria-expanded="showArchive"
                @click="showArchive = !showArchive"
              >
                <Archive :size="15" aria-hidden="true" />{{ showArchive ? "收起数据交换" : "数据交换" }}
              </button>
            </template>
            <ArchiveExchangePanel
              v-if="showArchive"
              :description="'用于替换当前账号的星石背包、养成计划和经验星曜。'"
              :import-open="showStarImport"
              :import-disabled="!productReady || starExchangeBusy"
              :export-disabled="!productReady || !selectedHostAccount() || starExchangeBusy"
              scope="current"
              scope-name="star-export-scope"
              :scope-options="starExportScopeOptions"
              @toggle-import="toggleStarImport"
              @export="exportStarArchive"
            >
              <template #import>
                <section v-if="showStarImport" class="star-exchange-import">
                  <p class="tip">选择 YuanStar 导出的 JSON 档案。确认后将替换当前账号的星石数据，不会恢复旧实例 ID、密探佩戴关系或 OCR 证据。</p>
                  <label class="btn ghost file-label">
                    选择 JSON 文件
                    <input ref="starImportFile" type="file" accept=".json,application/json" @change="onStarImportFile" />
                  </label>
                  <p v-if="starExchangeError" class="star-exchange-error" role="alert">{{ starExchangeError }}</p>
                  <div v-if="starImportPreview" class="star-exchange-preview">
                    <dl>
                      <div><dt>文件</dt><dd>{{ starImportPreview.preview.fileName }} · {{ starImportPreview.preview.format.toUpperCase() }}</dd></div>
                      <div><dt>星石</dt><dd>{{ starImportPreview.preview.inventoryCount }} 颗，其中 {{ starImportPreview.preview.plannedCount }} 颗有计划等级</dd></div>
                      <div><dt>背包</dt><dd>{{ starImportPreview.preview.bag.currentCount ?? '—' }} / {{ starImportPreview.preview.bag.capacity ?? '—' }}</dd></div>
                      <div><dt>经验星曜</dt><dd>橙 {{ starImportPreview.preview.experience.orange ?? '—' }} · 紫 {{ starImportPreview.preview.experience.purple ?? '—' }} · 白 {{ starImportPreview.preview.experience.white ?? '—' }}</dd></div>
                    </dl>
                    <button type="button" class="btn primary" :disabled="starExchangeBusy" @click="confirmStarImport">{{ starExchangeBusy ? '替换中…' : '确认替换当前账号数据' }}</button>
                  </div>
                </section>
              </template>
            </ArchiveExchangePanel>
          </AccountWorkspace>
          <p
            v-if="cloudSyncMessage || cloudSyncError || captureTransportMessage || captureTransportError || cloudNeedsRetry || cloudRetryBusy || captureNeedsRetry || captureRetryBusy || captureImportNeedsRetry"
            class="star-sync-state"
            :class="{ 'is-error': cloudSyncError || captureTransportError }"
            role="status"
            aria-live="polite"
          >
            <span v-if="cloudSyncError || cloudSyncMessage">{{ cloudSyncError || cloudSyncMessage }}</span>
            <span v-if="captureTransportError || captureTransportMessage">{{ (cloudSyncError || cloudSyncMessage) ? ' · ' : '' }}{{ captureTransportError || captureTransportMessage }}</span>
            <button
              v-if="cloudNeedsRetry || cloudRetryBusy"
              type="button"
              class="star-sync-retry"
              :disabled="cloudRetryBusy"
              @click="retryStarCloud"
            >{{ cloudRetryBusy ? '重试中…' : '重试' }}</button>
            <button
              v-if="captureNeedsRetry || captureRetryBusy"
              type="button"
              class="star-sync-retry"
              :disabled="captureRetryBusy"
              @click="retryCaptureConsume"
            >{{ captureRetryBusy ? '重试中…' : '重试清理' }}</button>
            <button
              v-if="captureImportNeedsRetry"
              type="button"
              class="star-sync-retry"
              :disabled="captureImportBusy"
              @click="retryCaptureImport"
            >{{ captureImportBusy ? '重试中…' : '重试导入' }}</button>
          </p>
          <div class="star-tabs" role="tablist" aria-label="星石工作区">
            <button
              role="tab"
              :aria-selected="activeTab === 'import'"
              :class="{ on: activeTab === 'import' }"
              @click="setTab('import')"
            >
              导入识别</button
            ><button
              role="tab"
              :aria-selected="activeTab === 'review'"
              :class="{ on: activeTab === 'review' }"
              @click="setTab('review')"
            >
              人工核对
            </button>
          </div>
          <div id="product-root" ref="mountRoot"></div>
          <p v-if="mountError" class="yuanstar-mount-error" role="alert">
            YuanStar 产品页加载失败：{{ mountError }}
          </p>
        </div>
      </section>
      <SiteFooter>
        <template #big>星石养成<br /><span>背包 · 整理 · 计划</span></template>
        <template #fine>
          <b>YuanHub</b> · 星石养成工作区<br />
          MAA × 鸢BWiki × 辟雍学府 × YuanAssist 共同搭建<br />
          数据仅供参考，请以游戏内实际背包为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { usePersistedTab } from "../../utils/persistedTab.js";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Archive } from "@lucide/vue";
import AccountWorkspace from "../../components/AccountWorkspace.vue";
import DataAccountContextBar from "../../components/DataAccountContextBar.vue";
import ArchiveExchangePanel from "../../components/ArchiveExchangePanel.vue";
import IslandSidebar from "../../components/IslandSidebar.vue";
import SiteFooter from "../../components/SiteFooter.vue";
import { listAccounts } from "../../api/accounts.js";
import { auth } from "../../store/auth.js";
import { activeAccount, isAccountGame } from "../../store/activeAccount.js";
import {
  disposeYuanStarHandle,
  waitForYuanStarDisposal,
} from "./embedLifecycle.js";
import { createStarCloudCoordinator } from "./starCloudCoordinator.js";
import { starCloudFeedback } from "./starCloudStatus.js";
import { createLatestAccountSync } from "./latestAccountSync.js";
import { migrateLegacyYuanStarHostAccount } from "./legacyHostAccountMigration.js";
import { bindStarExchangePreview, isStarExchangePreviewCurrent } from "./starExchangePreviewScope.js";
import { consumeStarCapture, getPendingStarCapture, getStarCaptureImage, getStarCaptureManifest } from "../../api/starCaptures.js";
import { subscribeAccountEvents } from "../../store/accountEvents.js";
import { captureIdFromRouteQuery, clearStarCaptureRouteQuery, isCurrentStarCapture, isRetryableCaptureImportError, isStarCaptureReadyEvent, loadAndImportStarCapture } from "./captureTransport.js";
import { createStarCaptureHost, createStarCaptureInbox, createStarCaptureLifecycle, importAndMarkStarCapture } from "./starCaptureLifecycle.js";

const EMBED_MODULE_URL = "/yuanstar-embed/yuanstar-embed.js";
const EMBED_STYLESHEET_URL = "/yuanstar-embed/yuanstar-embed.css";
const EMBED_STYLESHEET_ID = "yuanstar-embed-styles";
const route = useRoute();
const router = useRouter();
const mountRoot = ref(null);
const mountError = ref("");
const accounts = ref([]);
const accountsLoading = ref(false);
const accountError = ref("");
const activeTab = usePersistedTab(
  "star-tabs",
  "import",
  ["import", "review"],
);
const summary = ref({ currentCount: 0, planCount: 0, gameVersion: "如鸢" });
const cloudSyncMessage = ref("");
const cloudSyncError = ref("");
const cloudNeedsRetry = ref(false);
const cloudRetryBusy = ref(false);
const productReady = ref(false);
const showArchive = ref(false);
const showStarImport = ref(false);
const starImportPreview = ref(null);
const starImportFile = ref(null);
const starExchangeError = ref("");
const starExchangeBusy = ref(false);
const captureTransportMessage = ref("");
const captureTransportError = ref("");
const captureNeedsRetry = ref(false);
const captureRetryBusy = ref(false);
const captureImportNeedsRetry = ref(false);
const captureImportBusy = ref(false);
const captureLifecycle = createStarCaptureLifecycle();
const captureInbox = createStarCaptureInbox(captureLifecycle);
const captureHost = createStarCaptureHost({
  lifecycle: captureLifecycle,
  consume: consumeStarCapture,
  onState: function (state) {
    if (state.type === 'consumed') {
      captureInbox.markConsumed(state.accountId, state.captureId);
      captureQueueVersion += 1;
    }
    if (state.accountId !== accountId.value || unmounted) return;
    if (state.type === 'retrying') {
      captureRetryBusy.value = true;
      captureTransportError.value = '';
      captureTransportMessage.value = '识别已完成，正在清理临时截图…';
    } else if (state.type === 'failed') {
      captureRetryBusy.value = false;
      captureNeedsRetry.value = true;
      captureTransportError.value = '识别已完成，临时截图清理失败，可重试。';
    } else if (state.type === 'consumed') {
      captureRetryBusy.value = false;
      captureNeedsRetry.value = false;
      captureTransportError.value = '';
      captureTransportMessage.value = '识别已完成，临时截图已清理。';
      clearCaptureRoute(state.accountId, state.captureId);
    } else if (state.type === 'superseded') {
      // 本次清理已被更新的 capture 取代：结束重试态，但不能清除新 capture 的待清理状态。
      captureRetryBusy.value = false;
      captureNeedsRetry.value = captureLifecycle.get(state.accountId)?.state === 'consume_pending';
    } else if (state.type === 'storage_failed') {
      captureRetryBusy.value = false;
      captureTransportError.value = '本地截图清理状态保存失败，请检查浏览器存储。';
    }
  },
});
let handle = null;
let unmounted = false;
let mountedAccountId = "";
let pendingCapture = null;
let captureQueueVersion = 0;
let stopCaptureEvents = null;
const queueAccountSync = createLatestAccountSync();

const accountId = computed({
  get: function () {
    return activeAccount.id;
  },
  set: function (value) {
    activeAccount.set(value);
  },
});
const accountGame = computed({
  get: function () {
    return activeAccount.gameFor(accountId.value);
  },
  set: function (value) {
    activeAccount.setGame(value, accountId.value);
  },
});
function message(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}
function selectedHostAccount() {
  if (!auth.isLoggedIn) return null;
  const account = accounts.value.find(function (item) {
    return item.id === accountId.value;
  });
  return account
    ? {
        accountId: account.id,
        displayName: account.name,
        gameVersion: isAccountGame(account.game)
          ? account.game
          : accountGame.value,
      }
    : null;
}
const starExportScopeOptions = computed(function () {
  return [{
    value: "current",
    label: "当前账号",
    detail: selectedHostAccount()?.displayName || "当前账号",
  }];
});
const starCloud = createStarCloudCoordinator({
  selectedHostAccount,
  onState: function (state) {
    const feedback = starCloudFeedback(state);
    cloudSyncMessage.value = feedback.message;
    cloudSyncError.value = feedback.error;
    cloudNeedsRetry.value = Boolean(state.recoveryRequired);
  },
});
function clearCloudSyncFeedback() {
  if (cloudNeedsRetry.value || cloudRetryBusy.value) return;
  cloudSyncMessage.value = "";
  cloudSyncError.value = "";
}
async function retryStarCloud() {
  if (!cloudNeedsRetry.value || cloudRetryBusy.value) return;
  cloudRetryBusy.value = true;
  try {
    await starCloud.retry();
  } catch (error) {
    cloudSyncError.value = "星石云端保存失败，请重试。";
  } finally {
    cloudRetryBusy.value = false;
  }
}
function resetStarImportState() {
  starImportPreview.value = null;
  starExchangeError.value = "";
  showStarImport.value = false;
  if (starImportFile.value) starImportFile.value.value = "";
}
function rejectStaleStarImportPreview() {
  starImportPreview.value = null;
  showStarImport.value = false;
  if (starImportFile.value) starImportFile.value.value = "";
  starExchangeError.value = "账号已切换，请重新选择 JSON 档案后再试。";
}
function captureApi() {
  return { getManifest: getStarCaptureManifest, getImage: getStarCaptureImage };
}
function createCaptureFile(blob, name) {
  return new File([blob], name, { type: "image/png" });
}
function currentCaptureStillActive(current) {
  return pendingCapture === current && isCurrentStarCapture(current, accountId.value) && mountedAccountId === current.accountId;
}
function discardForeignPendingCapture() {
  if (pendingCapture && !isCurrentStarCapture(pendingCapture, accountId.value)) pendingCapture = null;
  captureRetryBusy.value = false;
  captureImportNeedsRetry.value = false;
  captureNeedsRetry.value = captureLifecycle.get(accountId.value)?.state === 'consume_pending';
  captureTransportError.value = '';
  captureTransportMessage.value = '';
}
function clearCaptureRoute(account, capture) {
  if (captureIdFromRouteQuery(route.query) !== capture) return;
  const routeAccount = String(route.query.account_id || '').trim();
  if (routeAccount && routeAccount !== account) return;
  void router.replace({ path: route.path, query: clearStarCaptureRouteQuery(route.query), hash: route.hash });
}
async function retryCaptureConsume() {
  const record = captureLifecycle.get(accountId.value);
  if (record?.state === 'consume_pending') await captureHost.retry(record.accountId, record.captureId);
}
async function importPendingCapture() {
  if (!pendingCapture || !handle || !productReady.value || unmounted || captureImportBusy.value) return;
  const current = pendingCapture;
  if (!currentCaptureStillActive(current)) return;
  captureImportBusy.value = true;
  let markFailed = false;
  try {
    const completed = await importAndMarkStarCapture({
      lifecycle: captureLifecycle,
      accountId: current.accountId,
      captureId: current.captureId,
      importCapture: function () { return loadAndImportStarCapture(captureApi(), current, handle, createCaptureFile, function () { return currentCaptureStillActive(current); }); },
      isCurrent: function () { return currentCaptureStillActive(current); },
      onMarkFailure: function () { markFailed = true; },
    });
    if (!completed || !currentCaptureStillActive(current)) return;
    pendingCapture = null;
    captureImportNeedsRetry.value = false;
    captureNeedsRetry.value = false;
    captureRetryBusy.value = false;
    captureTransportError.value = "";
    captureTransportMessage.value = markFailed
      ? "三段截图已导入；本地清理状态保存失败，请检查浏览器存储后继续识别。"
      : "三段截图已导入，等待你点击“开始识别”。";
    clearCaptureRoute(current.accountId, current.captureId);
  } catch (error) {
    if (pendingCapture !== current) return;
    captureTransportError.value = message(error, "星石截图导入失败。");
    captureImportNeedsRetry.value = isRetryableCaptureImportError(error);
  } finally {
    captureImportBusy.value = false;
    if (pendingCapture && pendingCapture !== current && currentCaptureStillActive(pendingCapture)) void importPendingCapture();
  }
}
function retryCaptureImport() {
  if (!pendingCapture || captureImportBusy.value) return;
  captureImportNeedsRetry.value = false;
  captureTransportError.value = "";
  void importPendingCapture();
}
function queueCapture(captureId) {
  const normalizedCaptureId = String(captureId || "").trim();
  const currentAccountId = String(accountId.value || "").trim();
  if (!normalizedCaptureId || !currentAccountId) return;
  const action = captureInbox.captureAction(currentAccountId, normalizedCaptureId);
  if (action !== 'import') {
    if (pendingCapture?.accountId === currentAccountId && pendingCapture.captureId === normalizedCaptureId) pendingCapture = null;
    if (action === 'imported') {
      captureImportNeedsRetry.value = false;
      captureTransportError.value = '';
      captureTransportMessage.value = '已恢复本地待识别截图，等待你继续识别。';
      clearCaptureRoute(currentAccountId, normalizedCaptureId);
    } else if (action === 'consume_pending') {
      void captureHost.retry(currentAccountId, normalizedCaptureId);
    } else {
      clearCaptureRoute(currentAccountId, normalizedCaptureId);
    }
    return;
  }
  if (!pendingCapture || pendingCapture.captureId !== normalizedCaptureId || pendingCapture.accountId !== currentAccountId) {
    captureQueueVersion += 1;
    pendingCapture = { accountId: currentAccountId, captureId: normalizedCaptureId, batch: null };
    captureImportNeedsRetry.value = false;
    captureTransportMessage.value = "";
    captureTransportError.value = "";
  }
  void importPendingCapture();
}
function queueRouteCapture() {
  const routeAccountId = String(route.query.account_id || "").trim();
  if (routeAccountId && routeAccountId !== String(accountId.value || "").trim()) return;
  queueCapture(route.query.capture_id);
}
async function recoverPendingCapture() {
  if (!accountId.value) return;
  const recoveryAccountId = accountId.value;
  const recoveryQueueVersion = captureQueueVersion;
  const record = captureLifecycle.get(recoveryAccountId);
  if (record?.state === 'consume_pending') void captureHost.retry(recoveryAccountId, record.captureId);
  try {
    const pending = await getPendingStarCapture(recoveryAccountId);
    if (recoveryAccountId !== accountId.value || recoveryQueueVersion !== captureQueueVersion || !pending) return;
    queueCapture(pending.capture_id || pending.captureId);
  } catch (error) {
    if (recoveryAccountId !== accountId.value) return;
    if (error?.status === 404) return;
    captureTransportError.value = message(error, "读取待导入星石截图失败。");
  }
}
function onStarCaptureEvent(event) {
  if (!isStarCaptureReadyEvent(event, accountId.value)) return;
  queueCapture(event.data.capture_id || event.data.captureId);
}
async function loadAccounts() {
  if (!auth.isLoggedIn) {
    accounts.value = [];
    accountId.value = "";
    return;
  }
  accountsLoading.value = true;
  accountError.value = "";
  try {
    const list = await listAccounts();
    accounts.value = Array.isArray(list) ? list : [];
    activeAccount.syncAccounts(accounts.value);
    if (
      !accounts.value.some(function (account) {
        return account.id === accountId.value;
      })
    )
      accountId.value = accounts.value[0]?.id || "";
  } catch (error) {
    accountError.value = message(error, "子账号加载失败");
  } finally {
    accountsLoading.value = false;
  }
}
async function syncHostAccount() {
  if (!handle) return false;
  const host = selectedHostAccount();
  return queueAccountSync(async function (isLatest) {
    const currentHandle = handle;
    const previousAccountId = mountedAccountId;
    try {
      if (host) await migrateLegacyYuanStarHostAccount(host);
      await currentHandle.setHostAccount(host);
      if (!isLatest() || currentHandle !== handle) return false;
      mountedAccountId = host?.accountId || "";
      if (previousAccountId && previousAccountId !== mountedAccountId)
        resetStarImportState();
      clearCloudSyncFeedback();
      const entered = await starCloud.enter(currentHandle);
      if (!isLatest() || currentHandle !== handle) return false;
      if (host && !entered) cloudSyncError.value = "星石云端状态加载失败；本地数据未被覆盖。";
      return true;
    } catch (error) {
      if (!isLatest() || currentHandle !== handle) return false;
      if (mountedAccountId) accountId.value = mountedAccountId;
      accountError.value = message(error, "星石账号切换失败");
      throw error;
    }
  });
}
async function onAccountChange() {
  if (starExchangeBusy.value) {
    if (mountedAccountId) accountId.value = mountedAccountId;
    return;
  }
  resetStarImportState();
  discardForeignPendingCapture();
  try {
    if (await syncHostAccount()) await recoverPendingCapture();
  } catch (_error) {}
}
function ensureEmbedStylesheet() {
  if (document.getElementById(EMBED_STYLESHEET_ID)) return Promise.resolve();
  return new Promise(function (resolve, reject) {
    const link = document.createElement("link");
    link.id = EMBED_STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = EMBED_STYLESHEET_URL;
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener(
      "error",
      function () {
        reject(new Error("YuanStar 样式资源加载失败。"));
      },
      { once: true },
    );
    document.head.appendChild(link);
  });
}
function loadEmbedModule() {
  return Function("url", "return import(url)")(EMBED_MODULE_URL);
}
function toggleStarImport() {
  clearCloudSyncFeedback();
  if (!handle || !productReady.value) {
    cloudSyncError.value = "星石工作区尚未加载完成。";
    return;
  }
  showStarImport.value = !showStarImport.value;
  starExchangeError.value = "";
}
function downloadStarArchive(data) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(data.blob);
  link.download = data.filename;
  link.click();
  window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
}
function exportStarArchive() {
  clearCloudSyncFeedback();
  if (!handle || !productReady.value) {
    cloudSyncError.value = "星石工作区尚未加载完成。";
    return;
  }
  try {
    downloadStarArchive(handle.exportDataExchange());
  } catch (error) {
    starExchangeError.value = message(error, "导出档案失败。");
  }
}
async function onStarImportFile(event) {
  const file = event?.target?.files?.[0];
  if (!file || !handle || !productReady.value) return;
  const previewAccountId = accountId.value;
  starExchangeError.value = "";
  try {
    const preview = await handle.previewDataExchangeImport(file);
    if (previewAccountId !== accountId.value) return;
    starImportPreview.value = bindStarExchangePreview(preview, previewAccountId);
  } catch (error) {
    if (previewAccountId !== accountId.value) return;
    starImportPreview.value = null;
    starExchangeError.value = message(error, "导入档案校验失败。");
  }
}
async function confirmStarImport() {
  if (!handle || !starImportPreview.value || starExchangeBusy.value) return;
  if (!isStarExchangePreviewCurrent(starImportPreview.value, accountId.value)) {
    rejectStaleStarImportPreview();
    return;
  }
  const preview = starImportPreview.value.preview;
  starExchangeBusy.value = true;
  starExchangeError.value = "";
  try {
    await handle.confirmDataExchangeImport(preview);
    starImportPreview.value = null;
    showStarImport.value = false;
  } catch (error) {
    if (message(error, "").startsWith("云端档案已替换")) {
      starImportPreview.value = null;
      starExchangeError.value = message(error, "云端档案已替换，请重新加载工作区。");
      return;
    }
    const status = Number(error?.status || 0);
    starExchangeError.value = status === 409
      ? "云端数据已更新，请重新加载后重试。导入预览仍保留。"
      : status === 422
        ? "导入数据无效：" + message(error, "请检查文件内容。")
        : "导入未完成：" + message(error, "当前数据保持不变。");
  } finally {
    starExchangeBusy.value = false;
  }
}
async function mountProduct() {
  productReady.value = false;
  try {
    await waitForYuanStarDisposal();
    await ensureEmbedStylesheet();
    const product = await loadEmbedModule();
    if (unmounted || !mountRoot.value) return;
    const initialHostAccount = selectedHostAccount();
    if (initialHostAccount)
      await migrateLegacyYuanStarHostAccount(initialHostAccount);
    if (unmounted || !mountRoot.value) return;
    const mountedHandle = product.mountYuanStar(mountRoot.value, {
      assetBaseUrl: "/yuanstar-embed/",
      embedded: true,
      hostAccount: initialHostAccount,
      onBusinessStateCommitted: function (event) { starCloud.committed(event); },
      onCaptureCommitted: function (event) { return captureHost.onCaptureCommitted(event); },
      onOcrRebuild: function (snapshot, recoveryPointId) { return starCloud.rebuildOcr(snapshot, recoveryPointId); },
      onReplacementImport: function (snapshot) { return starCloud.replaceImport(snapshot); },
      onListRecoveryPoints: function () { return starCloud.listRecoveryPoints(); },
      onRestoreRecoveryPoint: function (pointId) { return starCloud.restorePoint(pointId); },
      onRestoreLocalPoint: function (snapshot) { return starCloud.restoreLocal(snapshot); },
      onSummaryChange: function (nextSummary) {
        summary.value = nextSummary;
      },
    });
    if (unmounted) {
      await mountedHandle.dispose();
      return;
    }
    handle = mountedHandle;
    handle.setActiveTab(activeTab.value);
    await syncHostAccount();
    productReady.value = true;
    if (pendingCapture) void importPendingCapture();
  } catch (error) {
    productReady.value = false;
    if (!unmounted) mountError.value = message(error, "请稍后重试。");
  }
}
function setTab(tab) {
  activeTab.value = tab;
  handle?.setActiveTab(tab);
}
watch(accountId, discardForeignPendingCapture);
watch(function () { return [route.query.capture_id, route.query.account_id, productReady.value, accountId.value]; }, queueRouteCapture);
onMounted(async function () {
  await loadAccounts();
  stopCaptureEvents = subscribeAccountEvents(onStarCaptureEvent);
  void mountProduct();
  void recoverPendingCapture();
});
onBeforeUnmount(function () {
  unmounted = true;
  if (stopCaptureEvents) stopCaptureEvents();
  productReady.value = false;
  const current = handle;
  handle = null;
  if (current) void disposeYuanStarHandle(current).catch(function () {});
});
</script>

<style scoped>
.page-star {
  --wm: "星石";
}
.star-main {
  min-height: 100vh;
}
.game-stat {
  font-size: 21px;
  line-height: 1.4;
}
.author-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
  padding: 8px 15px 8px 9px;
  border: 1px solid rgba(255, 248, 236, 0.38);
  border-radius: 999px;
  color: var(--cream);
  background: var(--tea);
  box-shadow: 0 12px 26px -14px rgba(73, 59, 44, 0.5);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
}
.ab-mark {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  color: var(--tea);
  background: var(--yellow);
  font-family: var(--font-d);
  font-size: 15px;
  font-weight: 900;
}
.author-badge b {
  color: var(--yellow);
  font-weight: 900;
}
.archive-toggle {
  display: inline-flex;
  min-height: 44px;
  align-self: center;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1.5px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
  background: transparent;
  cursor: pointer;
  font-family: var(--font-b);
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  transform: translateY(9px);
  transition: all 0.3s var(--ease);
}
.archive-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.archive-toggle svg {
  flex: none;
}
.star-exchange-import { margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 14px; }
.star-exchange-import .tip { margin: 0 0 12px; color: var(--ink-60); font-size: 12.5px; line-height: 1.8; }
.star-exchange-import .file-label { display: inline-flex; cursor: pointer; }
.star-exchange-import .file-label input { display: none; }
.star-exchange-error { margin: 8px 0 0; color: var(--rouge); font-size: 12.5px; font-weight: 700; line-height: 1.6; }
.star-exchange-preview { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); padding: 12px 14px; }
.star-exchange-preview dl { display: grid; gap: 4px; margin: 0; }
.star-exchange-preview dl div { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 8px; }
.star-exchange-preview dt { color: var(--ink-60); font-size: 11px; font-weight: 800; }
.star-exchange-preview dd { margin: 0; color: var(--ink); font-size: 12px; line-height: 1.45; }
.star-sync-state {
  margin: 10px 2px -18px;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}
.star-sync-state.is-error {
  color: var(--rouge);
}
.star-sync-retry {
  margin-left: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--tea);
  font: inherit;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.star-sync-retry:hover:not(:disabled) { color: var(--accent); }
.star-sync-retry:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; border-radius: 2px; }
.star-sync-retry:disabled { opacity: .55; cursor: wait; }
.star-tabs {
  position: sticky;
  top: 24px;
  z-index: 45;
  display: flex;
  gap: 4px;
  margin-top: 32px;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 248, 236, 0.94);
  backdrop-filter: blur(12px);
  box-shadow: 0 12px 28px -22px rgba(73, 59, 44, 0.5);
}
.star-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  padding: 10px 26px;
  color: var(--ink-60);
  background: transparent;
  cursor: pointer;
  font-family: var(--font-b);
  font-size: 14px;
  font-weight: 700;
}
.star-tabs button.on {
  color: var(--cream);
  background: var(--tea);
}
.star-tabs button:hover:not(.on) {
  color: var(--ink);
}
#product-root {
  min-width: 0;
  background: transparent;
}
.yuanstar-mount-error {
  margin: 24px 0;
  padding: 16px 20px;
  border: 1px solid rgba(166, 81, 74, 0.45);
  border-radius: 14px;
  color: var(--rouge);
  background: var(--surface);
  font-weight: 700;
  line-height: 1.7;
}
@media (max-width: 1080px) {
  .star-main > section {
    padding-bottom: 40px;
  }
  .page-star :deep(.footer) {
    padding-bottom: calc(32px + 64px + env(safe-area-inset-bottom));
  }
  .archive-toggle {
    width: 100%;
    transform: none;
  }
  .star-exchange-preview { align-items: stretch; flex-direction: column; }
  .star-exchange-preview .btn { width: 100%; }
  .star-sync-state {
    margin: 10px 0 -18px;
  }
  .star-tabs {
    position: fixed;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 55;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
    padding: 7px max(12px, env(safe-area-inset-right))
      calc(7px + env(safe-area-inset-bottom))
      max(12px, env(safe-area-inset-left));
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
    background: rgba(255, 248, 236, 0.96);
    box-shadow: 0 -10px 26px -18px rgba(73, 59, 44, 0.48);
  }
  .star-tabs button {
    min-height: 48px;
    padding: 6px 8px;
    border-radius: 11px;
    font-size: 11.5px;
    line-height: 1.1;
  }
  .star-tabs button.on {
    color: var(--ink);
    background: var(--yellow);
  }
}
</style>
