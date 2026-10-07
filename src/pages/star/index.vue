<template>
  <div class="page-star">
    <IslandSidebar />
    <main id="main-content" class="star-main">
      <CompactToolHeader title="星石背包" description="整理星石，核对背包与养成计划">
        <template #account>
          <DataAccountContextBar compact :accounts="accounts" :account-id="accountId" :game="accountGame"
            :is-logged-in="auth.isLoggedIn" :loading="accountsLoading" :error="accountError"
            :switch-disabled="!productReady || starExchangeBusy || captureImportBusy || cloudWriteBusy" switch-disabled-reason="星石工作区正在准备或保存，请等待完成后再切换账号。" />
        </template>
        <template #actions>
          <button type="button" class="star-help-trigger" @click="openStarHelp(activeTab === 'import' ? 'screenshots' : 'review')"><CircleHelp :size="16" aria-hidden="true" />帮助</button>
          <details class="tool-more">
            <summary aria-label="更多页面操作">更多</summary>
            <div class="tool-more-content" @click.capture="$event.currentTarget.parentElement.open = false; $event.currentTarget.parentElement.querySelector('summary').focus()">
              <button type="button" class="act-btn archive-toggle" :disabled="!productReady || accountsLoading || starExchangeBusy || !selectedHostAccount()"
                :aria-expanded="showArchive" @click="showArchive = !showArchive">
                <Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起导入/导出' : '导入/导出 JSON' }}
              </button>
            </div>
          </details>
        </template>
      </CompactToolHeader>
      <section>
        <div class="wrap">
          <div class="tool-summary" aria-label="星石概览">
            <template v-if="productReady"><span>当前背包 <b>{{ summary.currentCount }}</b> 颗</span><span>养成计划 <b>{{ summary.planCount }}</b> 颗</span></template>
            <span v-else role="status">正在准备当前账号的星石数据…</span>
            <span v-if="activeTab === 'import'" class="star-privacy-note" title="截图在本机识别与保存；登录后同步背包数据。">本机识别与保存</span>
            <span v-if="cloudSyncMessage && !cloudSyncError && !cloudNeedsRetry && !cloudRetryBusy" class="star-sync-meta" role="status"
              :title="cloudSyncMessage">{{ cloudSyncMessage === '星石云端状态已保存' ? '✓ 已同步' : cloudSyncMessage }}</span>
          </div>
          <ArchiveExchangePanel
            v-if="showArchive"
            description="可导出当前账号的星石背包、养成计划和经验星曜 JSON；导入会替换这些数据。备份不含密探佩戴关系和 OCR 证据。"
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
          <p
            v-if="cloudSyncError || captureTransportMessage || captureTransportError || captureVersionWarning || cloudNeedsRetry || cloudRetryBusy || captureNeedsRetry || captureRetryBusy || captureImportNeedsRetry"
            class="star-sync-state"
            :class="{ 'is-error': cloudSyncError || captureTransportError, 'is-warning': captureVersionWarning || cloudNeedsRetry || captureNeedsRetry || captureImportNeedsRetry }"
            role="status"
            aria-live="polite"
          >
            <span v-if="cloudSyncError || cloudNeedsRetry || cloudRetryBusy">{{ cloudSyncError || cloudSyncMessage }}</span>
            <span v-if="captureTransportError || captureTransportMessage">{{ (cloudSyncError || cloudNeedsRetry || cloudRetryBusy) ? ' · ' : '' }}{{ captureTransportError || captureTransportMessage }}</span>
            <span v-if="captureVersionWarning"> · {{ captureVersionWarning }}</span>
            <button
              v-if="cloudNeedsRetry || cloudRetryBusy || (cloudSyncError && productReady && accountId)"
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
          <ToolTaskPrompt v-if="productReady && activeTab === 'review' && !summary.currentCount && !starBrowseEmpty && !cloudSyncError" class="star-empty" title="建立你的星石背包" description="上传游戏截图，即可识别并保存星石。图片识别过程仅在本机完成。">
            <button type="button" class="btn primary star-import-action" @click="setTab('import')">导入截图</button>
            <button type="button" class="link" @click="openStarHelp('screenshots')">查看截图帮助</button>
            <button type="button" class="link" @click="starBrowseEmpty = true">手动核对或恢复已有快照</button>
          </ToolTaskPrompt>
          <div v-show="summary.currentCount || starBrowseEmpty || activeTab === 'import' || cloudSyncError" class="star-workbench">
          <div class="star-tabs tool-workspace-tabs" role="tablist" aria-label="星石工作区">
            <button
              role="tab"
              :aria-selected="activeTab === 'review' && starReviewView === 'bag'"
              :class="{ on: activeTab === 'review' && starReviewView === 'bag' }"
              @click="starReviewView = 'bag'; setTab('review')"
            >
              背包与核对
            </button>
            <button role="tab" :aria-selected="activeTab === 'review' && starReviewView === 'plan'" :class="{ on: activeTab === 'review' && starReviewView === 'plan' }" @click="starReviewView = 'plan'; setTab('review')">养成计划</button>
          </div>
          <div v-if="activeTab === 'review'" class="star-workbench-actions">
            <button type="button" class="btn primary star-import-action" @click="setTab('import')">＋ 导入截图</button>
            <button type="button" class="star-filter-toggle" :aria-expanded="starFiltersOpen" aria-controls="product-root" @click="starFiltersOpen = !starFiltersOpen">{{ starFiltersOpen ? '收起筛选与设置' : '更多筛选与设置' }}</button>
          </div>
          <div v-else class="star-import-heading"><strong class="star-import-stage" role="status">截图识别</strong></div>
          </div>
          <div id="product-root" ref="mountRoot" tabindex="-1" v-show="productReady" :class="{ 'is-plan-view': starReviewView === 'plan', 'filters-open': starFiltersOpen, 'is-empty-view': activeTab === 'review' && !summary.currentCount && !starBrowseEmpty && !cloudSyncError }"></div>
          <RecognitionTutorial :open="recognitionTutorialOpen && Boolean(tutorialStep)" :step="tutorialStep" :replay-id="recognitionTutorialReplayId" :root="mountRoot" :paused="starHelpOpen" :focus-on-open="tutorialManualReplay" @help="openStarHelp" @skip="skipTutorialStep" @close="dismissRecognitionTutorial" />
          <StarHelpModal :open="starHelpOpen" :topic="starHelpTopic" :auto-disabled="tutorialAutoDisabled" :empty-bag="!summary.currentCount" @close="starHelpOpen = false" @replay="replayCurrentTutorial" @opt-out="dismissRecognitionTutorial('opt-out')" />
          <p v-if="!productReady && !mountError" class="yuanstar-mount-loading" role="status">
            {{ accountError && !mountBusy ? '当前账号的星石数据尚未就绪。' : '正在加载星石工作区…' }}
            <button v-if="accountError && !mountBusy" type="button" class="star-sync-retry" @click="syncHostAccount().catch(() => {})">重新加载当前账号</button>
          </p>
          <div v-if="mountError" class="yuanstar-mount-error" role="alert">
            星石工作区加载失败：{{ mountError }}
            <button type="button" :disabled="mountBusy" @click="mountProduct">重试加载</button>
          </div>
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
import { accountIdentityVersion, useAccountListUpdates } from '../../store/accountList.js'
import { relabelStarArchive } from './starArchiveExport.js'
import { usePersistedTab } from "../../utils/persistedTab.js";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Archive, CircleHelp } from "@lucide/vue";
import CompactToolHeader from "../../components/CompactToolHeader.vue";
import ToolTaskPrompt from "../../components/ToolTaskPrompt.vue";
import RecognitionTutorial from "./RecognitionTutorial.vue";
import StarHelpModal from "./StarHelpModal.vue";
import { tutorialStorageKey, tutorialSeen, finishTutorial, shouldAutoStartTutorial, currentRecognitionGuidance } from "./recognitionTutorial.js";
import { bagGuidance, createBagTutorialGate } from "./bagTutorial.js";
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
import { captureIdFromRouteQuery, clearStarCaptureRouteQuery, isCurrentStarCapture, isRetryableCaptureImportError, isStarCaptureReadyEvent, loadAndImportStarCapture, starCaptureGameVersionWarning } from "./captureTransport.js";
import { createStarCaptureHost, createStarCaptureInbox, createStarCaptureLifecycle, importAndMarkStarCapture } from "./starCaptureLifecycle.js";
import { isStarCaptureDraftPersisted } from "./captureDraftReceipt.js";

const EMBED_MODULE_URL = "/yuanstar-embed/yuanstar-embed.js";
const EMBED_STYLESHEET_URL = "/yuanstar-embed/yuanstar-embed.css";
const EMBED_STYLESHEET_ID = "yuanstar-embed-styles";
const route = useRoute();
const router = useRouter();
const mountRoot = ref(null);
const mountError = ref("");
const mountBusy = ref(false);
const accounts = ref([]);
useAccountListUpdates(next => { accounts.value = next })
const accountsLoading = ref(false);
const accountError = ref("");
const activeTab = usePersistedTab(
  "star-tabs",
  "review",
  ["import", "review"],
);
const summary = ref({ currentCount: 0, planCount: 0, gameVersion: "如鸢" });
const starReviewView = ref('bag');
const starBrowseEmpty = ref(false);
const starFiltersOpen = ref(false);
const starHelpOpen = ref(false);
const starHelpTopic = ref('screenshots');
const cloudSyncMessage = ref("");
const cloudSyncError = ref("");
const cloudNeedsRetry = ref(false);
const cloudRetryBusy = ref(false);
const productReady = ref(false);
const cloudWriteBusy = ref(false);
const recognitionTutorialOpen = ref(false);
const recognitionTutorialReplayId = ref(0);
const tutorialStep = ref(null);
const tutorialManualReplay = ref(false);
const tutorialAutoDisabled = ref(false);
const tutorialCloudReady = ref(false);
const tutorialCloudHistory = ref(false);
const tutorialAccountReady = ref(false);
const recognitionTutorialKey = computed(() => tutorialStorageKey(auth.isLoggedIn ? auth.userInfo?.id : null));
const bagTutorialGate = createBagTutorialGate();
const bagTutorialOwner = () => recognitionTutorialKey.value + ":" + (accountId.value || "guest");
const pausedTutorialOwners = new Set();
let skippedTutorialSteps = new Set();
let tutorialCheckSequence = 0;
let recognitionTutorialOwnerKey = "";
let tutorialStatusObserver = null;
let tutorialStatusFrame = 0;

function openStarHelp(topic = 'screenshots') {
  starHelpTopic.value = topic;
  starHelpOpen.value = true;
  tutorialAutoDisabled.value = tutorialSeen(recognitionTutorialKey.value);
}
async function replayCurrentTutorial() {
  starHelpOpen.value = false;
  await nextTick(); // Let the modal return focus before capturing the replay opener.
  if (activeTab.value === 'review' && !summary.value.currentCount && !mountRoot.value?.querySelector('.ocr-review [data-review-image]')) setTab('import');
  pausedTutorialOwners.delete(bagTutorialOwner());
  skippedTutorialSteps = new Set();
  tutorialManualReplay.value = true;
  recognitionTutorialOwnerKey = recognitionTutorialKey.value;
  recognitionTutorialReplayId.value++;
  recognitionTutorialOpen.value = true;
  if (activeTab.value === 'review') {
    starBrowseEmpty.value = true;
    starReviewView.value = 'bag';
    tutorialStep.value = bagGuidance;
  } else tutorialStep.value = currentRecognitionGuidance(mountRoot.value);
}
function dismissRecognitionTutorial(reason = 'later') {
  finishTutorial(recognitionTutorialOwnerKey || recognitionTutorialKey.value, reason);
  tutorialAutoDisabled.value = tutorialSeen(recognitionTutorialKey.value);
  pausedTutorialOwners.add(bagTutorialOwner());
  recognitionTutorialOpen.value = false;
  tutorialManualReplay.value = false;
  tutorialStep.value = null;
}
function skipTutorialStep(id) {
  skippedTutorialSteps.add(id);
  tutorialStep.value = null;
}
function scheduleTutorialCheck() {
  if (tutorialStatusFrame) return;
  tutorialStatusFrame = requestAnimationFrame(() => {
    tutorialStatusFrame = 0;
    void checkRecognitionTutorial();
  });
}
async function checkRecognitionTutorial() {
  const sequence = ++tutorialCheckSequence;
  if (!productReady.value || (!tutorialManualReplay.value && (!tutorialAccountReady.value || accountsLoading.value || accountError.value ||
      (auth.isLoggedIn && (!auth.userInfo?.id || !selectedHostAccount() || !tutorialCloudReady.value))))) return;
  const currentHandle = handle, key = recognitionTutorialKey.value, context = starContextVersion;
  let status;
  try { status = await currentHandle?.getRecognitionTutorialStatus?.(); } catch (_) { return; }
  if (context !== starContextVersion || sequence !== tutorialCheckSequence || currentHandle !== handle || key !== recognitionTutorialKey.value || unmounted) return;
  if (!status?.ready) return;
  const hasHistory = status.hasHistory || tutorialCloudHistory.value;
  bagTutorialGate.loaded(bagTutorialOwner(), hasHistory);
  if (pausedTutorialOwners.has(bagTutorialOwner())) return;
  if (!recognitionTutorialOpen.value && shouldAutoStartTutorial({ ready: status.ready, importing: activeTab.value === 'import', seen: tutorialSeen(key), hasHistory })) {
    recognitionTutorialOwnerKey = key;
    recognitionTutorialOpen.value = true;
  }
  const reviewReady = bagTutorialGate.shouldStart(bagTutorialOwner(), {
    reviewing: activeTab.value === 'review', ready: status.ready, seen: tutorialSeen(key),
    hasEvidence: Boolean(mountRoot.value?.querySelector('.ocr-review [data-review-image]')),
  });
  if (reviewReady) { recognitionTutorialOwnerKey = key; recognitionTutorialOpen.value = true; }
  const step = activeTab.value === 'import' ? currentRecognitionGuidance(mountRoot.value)
    : (reviewReady || tutorialManualReplay.value) ? bagGuidance : null;
  tutorialStep.value = recognitionTutorialOpen.value && !skippedTutorialSteps.has(step?.id) ? step : null;
}
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
const captureGameVersion = ref("");
const captureVersionWarning = computed(() => starCaptureGameVersionWarning(captureGameVersion.value, summary.value.gameVersion));
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
let rejectedSwitchMessage = "";
let pendingCapture = null;
let captureQueueVersion = 0;
let stopCaptureEvents = null;
let starContextVersion = 0;
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
    if (state.accountId && state.accountId !== accountId.value) return;
    cloudWriteBusy.value = !!(state.replacing || state.writer?.saving || state.writer?.pending);
    tutorialCloudReady.value = Boolean(state.ready);
    tutorialCloudHistory.value = Boolean(state.writer?.revision > 0 || state.writer?.generation > 0);
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
  if ((!cloudNeedsRetry.value && !cloudSyncError.value) || cloudRetryBusy.value) return;
  cloudRetryBusy.value = true;
  try {
    if (cloudNeedsRetry.value) await starCloud.retry();
    else if (handle && selectedHostAccount()) await syncHostAccount();
  } catch (error) {
    cloudSyncError.value = "星石云端同步失败，请重试。";
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
  return !unmounted && productReady.value && Boolean(handle) && pendingCapture === current
    && isCurrentStarCapture(current, accountId.value) && mountedAccountId === current.accountId;
}
function discardForeignPendingCapture() {
  if (pendingCapture && !isCurrentStarCapture(pendingCapture, accountId.value)) pendingCapture = null;
  captureRetryBusy.value = false;
  captureImportNeedsRetry.value = false;
  captureNeedsRetry.value = captureLifecycle.get(accountId.value)?.state === 'consume_pending';
  captureTransportError.value = '';
  captureTransportMessage.value = '';
  captureGameVersion.value = '';
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
  const currentHandle = handle;
  const isCurrent = () => currentHandle === handle && currentCaptureStillActive(current);
  captureImportBusy.value = true;
  let markFailed = false;
  let restored = false;
  let handoffStale = false;
  try {
    const completed = await importAndMarkStarCapture({
      lifecycle: captureLifecycle,
      accountId: current.accountId,
      captureId: current.captureId,
      importCapture: async function () {
        if (captureLifecycle.captureAction(current.accountId, current.captureId) === 'imported') {
          const persisted = await isStarCaptureDraftPersisted(current.accountId, { captureId: current.captureId });
          if (!isCurrent()) return false;
          if (persisted) { restored = true; return true; }
        }
        return loadAndImportStarCapture(captureApi(), current, currentHandle, createCaptureFile, isCurrent);
      },
      isCurrent,
      onMarkFailure: function () { markFailed = true; },
    });
    if (!completed || !isCurrent()) { handoffStale = true; return; }
    captureGameVersion.value = current.batch?.gameVersion || "";
    pendingCapture = null;
    captureImportNeedsRetry.value = false;
    captureNeedsRetry.value = false;
    captureRetryBusy.value = false;
    captureTransportError.value = "";
    captureTransportMessage.value = markFailed
      ? "三段截图已导入；本地清理状态保存失败，请检查浏览器存储后继续识别。"
      : restored ? "已恢复本地待识别截图，等待你继续识别。" : "三段截图已导入，等待你点击“开始识别”。";
    clearCaptureRoute(current.accountId, current.captureId);
  } catch (error) {
    if (!isCurrent()) { handoffStale = true; return; }
    captureTransportError.value = message(error, "星石截图导入失败。");
    captureImportNeedsRetry.value = isRetryableCaptureImportError(error);
  } finally {
    captureImportBusy.value = false;
    if (pendingCapture && (handoffStale || pendingCapture !== current || currentHandle !== handle) && currentCaptureStillActive(pendingCapture)) void importPendingCapture();
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
  if (action !== 'import' && action !== 'imported') {
    if (pendingCapture?.accountId === currentAccountId && pendingCapture.captureId === normalizedCaptureId) pendingCapture = null;
    if (action === 'consume_pending') {
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
    captureGameVersion.value = "";
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
    if (unmounted) return;
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
  productReady.value = false;
  tutorialAccountReady.value = false;
  const host = selectedHostAccount();
  return queueAccountSync(async function (isLatest) {
    const currentHandle = handle;
    const isCurrent = () => isLatest() && !unmounted && currentHandle === handle && (host?.accountId || "") === (selectedHostAccount()?.accountId || "");
    const previousAccountId = mountedAccountId;
    try {
      if (!isCurrent()) return false;
      if (host) await migrateLegacyYuanStarHostAccount(host);
      if (!isCurrent()) return false;
      await currentHandle.setHostAccount(host);
      if (!isCurrent()) return false;
      mountedAccountId = host?.accountId || "";
      if (previousAccountId && previousAccountId !== mountedAccountId)
        resetStarImportState();
      clearCloudSyncFeedback();
      const entered = await starCloud.enter(currentHandle);
      if (!isCurrent()) return false;
      if (host && !entered) cloudSyncError.value = "星石云端状态加载失败；本地数据未被覆盖。";
      tutorialAccountReady.value = !host || entered;
      if (host) { accountError.value = rejectedSwitchMessage; rejectedSwitchMessage = ""; }
      productReady.value = true;
      currentHandle.setActiveTab(activeTab.value);
      if (pendingCapture) void importPendingCapture();
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      rejectedSwitchMessage = message(error, "星石账号切换失败");
      if (mountedAccountId && accounts.value.some(account => account.id === mountedAccountId)) accountId.value = mountedAccountId;
      accountError.value = rejectedSwitchMessage;
      throw error;
    }
  });
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
        link.remove();
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
async function exportStarArchive() {
  clearCloudSyncFeedback();
  if (!handle || !productReady.value) {
    cloudSyncError.value = "星石工作区尚未加载完成。";
    return;
  }
  const source = handle, context = starContextVersion, identity = accountIdentityVersion;
  const current = () => !unmounted && source === handle && context === starContextVersion && identity === accountIdentityVersion && productReady.value;
  try {
    const exported = source.exportDataExchange();
    const name = selectedHostAccount()?.displayName;
    const data = name ? await relabelStarArchive(exported, name) : exported;
    if (current()) downloadStarArchive(data);
  } catch (error) {
    if (current()) starExchangeError.value = message(error, "导出档案失败。");
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
  if (mountBusy.value || unmounted) return;
  mountBusy.value = true;
  mountError.value = "";
  productReady.value = false;
  try {
    await waitForYuanStarDisposal();
    mountRoot.value?.replaceChildren();
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
      onOcrRebuild: async function (snapshot, recoveryPointId) {
        const owner = bagTutorialOwner(), context = starContextVersion;
        const result = await starCloud.rebuildOcr(snapshot, recoveryPointId);
        // Observe the existing successful OCR handoff. The tour also waits for the persisted review DOM.
        if (!unmounted && context === starContextVersion && owner === bagTutorialOwner()) bagTutorialGate.ocrCompleted(owner);
        return result;
      },
      onReplacementImport: function (snapshot) { return starCloud.replaceImport(snapshot); },
      onListRecoveryPoints: function () { return starCloud.listRecoveryPoints(); },
      onRestoreRecoveryPoint: function (pointId) { return starCloud.restorePoint(pointId); },
      onRestoreLocalPoint: function (snapshot) { return starCloud.restoreLocal(snapshot); },
      onSummaryChange: function (nextSummary) {
        summary.value = nextSummary;
      },
      onActiveTabChange: function (tab) {
        activeTab.value = tab;
      },
    });
    if (unmounted) {
      await mountedHandle.dispose();
      return;
    }
    handle = mountedHandle;
    await syncHostAccount();
  } catch (error) {
    productReady.value = false;
    if (handle) {
      const failedHandle = handle;
      handle = null;
      try { await disposeYuanStarHandle(failedHandle); } catch (_error) {}
    }
    if (!unmounted) mountError.value = message(error, "请稍后重试。");
  } finally {
    mountBusy.value = false;
  }
}
function setTab(tab) {
  if (activeTab.value !== tab && recognitionTutorialOpen.value) dismissRecognitionTutorial('later');
  activeTab.value = tab;
  if (productReady.value) handle?.setActiveTab(tab);
}
watch([accountId, accountGame], () => {
  starContextVersion++;
  ++tutorialCheckSequence;
  recognitionTutorialOpen.value = false;
  tutorialStep.value = null;
  tutorialManualReplay.value = false;
  recognitionTutorialOwnerKey = "";
  skippedTutorialSteps = new Set();
  starHelpOpen.value = false;
  tutorialAccountReady.value = false;
  bagTutorialGate.reset();
  productReady.value = false;
  resetStarImportState();
  showArchive.value = false;
  discardForeignPendingCapture();
  if (handle && !unmounted) void syncHostAccount().catch(() => {});
}, { flush: "sync" });
watch([productReady, tutorialAccountReady, tutorialCloudReady, tutorialCloudHistory, activeTab, recognitionTutorialKey, summary], () => { void checkRecognitionTutorial(); }, { flush: "post" });
watch(recognitionTutorialKey, () => {
  ++tutorialCheckSequence;
  recognitionTutorialOpen.value = false;
  tutorialStep.value = null;
  tutorialManualReplay.value = false;
  recognitionTutorialOwnerKey = "";
  skippedTutorialSteps = new Set();
  starHelpOpen.value = false;
  bagTutorialGate.reset();
}, { flush: "sync" });
watch(activeTab, () => {
  // OCR's import → review handoff retains eligibility. A manual tab switch
  // hides this visit's hint without pretending the user completed the task.
  tutorialStep.value = null;
});
watch(starReviewView, view => { if (view === 'plan' && recognitionTutorialOpen.value) dismissRecognitionTutorial('later'); });
watch(function () { return [route.query.capture_id, route.query.account_id, productReady.value, accountId.value]; }, queueRouteCapture);
onMounted(async function () {
  // Draft restoration may finish after the first summary. Recheck on the
  // embed's actual render, without polling or changing its business lifecycle.
  tutorialStatusObserver = new MutationObserver(scheduleTutorialCheck);
  if (mountRoot.value) tutorialStatusObserver.observe(mountRoot.value, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });
  mountRoot.value?.addEventListener('focusin', scheduleTutorialCheck);
  mountRoot.value?.addEventListener('click', scheduleTutorialCheck);
  await loadAccounts();
  if (unmounted) return;
  stopCaptureEvents = subscribeAccountEvents(onStarCaptureEvent);
  void mountProduct();
  void recoverPendingCapture();
});
onBeforeUnmount(function () {
  tutorialStatusObserver?.disconnect();
  mountRoot.value?.removeEventListener('focusin', scheduleTutorialCheck);
  mountRoot.value?.removeEventListener('click', scheduleTutorialCheck);
  cancelAnimationFrame(tutorialStatusFrame);
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
.page-star #product-root :deep(.product-toast) {
  z-index: var(--z-toast);
  pointer-events: none;
}
@media (pointer: coarse) {
  .page-star #product-root :deep(.plan-actions > .button),
  .page-star #product-root :deep(.current-editor .editor-actions > .button) {
    min-height: 44px;
    min-width: 44px;
  }
}
.star-help-trigger {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.star-main {
  min-height: 100vh; min-height: 100dvh;
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
  margin: 10px 2px 0;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.6;
}
.star-sync-state.is-error {
  color: var(--rouge);
}
.star-sync-retry {
  display: inline-flex;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  padding: 8px 12px;
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
  z-index: var(--z-sticky-controls);
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
  min-height: 32px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 10px;
  padding: 6px 26px;
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
  --bg-surface: var(--surface);
  --bg-subtle: var(--cream);
  --text-primary: var(--ink);
  --text-secondary: var(--ink-60);
  --text-muted: var(--ink-35);
  --border-soft: var(--line);
  --border-row: var(--line);
  font-family: var(--font-b);
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
.yuanstar-mount-loading { margin: 24px 0; color: var(--ink-60); }
.yuanstar-mount-error button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  margin-left: 8px;
  padding: 8px 12px;
  border: 1px solid currentColor;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.yuanstar-mount-error button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
@media (max-width: 1080px) {
  .page-star #product-root :deep(.product-toast) {
    top: calc(env(safe-area-inset-top) + 12px);
    bottom: auto;
  }
  .page-star {
    --star-tab-button-height: 48px;
    --star-tab-padding: 7px;
    --star-bottom-bar-height: calc(var(--star-tab-button-height) + 2 * var(--star-tab-padding) + 1px + env(safe-area-inset-bottom));
  }
  .page-star #product-root :deep(.review-workspace-tools) {
    bottom: calc(var(--star-bottom-bar-height) + 12px);
  }
  .star-main > section {
    padding-bottom: 40px;
  }
  .page-star :deep(.footer) {
    padding-bottom: calc(32px + var(--star-bottom-bar-height));
  }
  .archive-toggle {
    width: 100%;
    transform: none;
  }
  .star-exchange-preview { align-items: stretch; flex-direction: column; }
  .star-exchange-preview .btn { width: 100%; }
  .star-sync-state {
    margin: 10px 0 0;
  }
  .star-tabs {
    position: fixed;
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: var(--z-popover);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    margin: 0;
    padding: var(--star-tab-padding) max(12px, env(safe-area-inset-right))
      calc(var(--star-tab-padding) + env(safe-area-inset-bottom))
      max(12px, env(safe-area-inset-left));
    border: 0;
    border-top: 1px solid var(--line);
    border-radius: 0;
    background: rgba(255, 248, 236, 0.96);
    box-shadow: 0 -10px 26px -18px rgba(73, 59, 44, 0.48);
  }
  .star-tabs button {
    min-height: var(--star-tab-button-height);
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


.star-main > section { padding-top: 0; }
.star-tabs.tool-workspace-tabs { position: static; }
.star-workbench { margin-top: 8px; }
.star-workbench-actions, .star-import-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.star-import-action { flex: none; width: auto; min-height: 44px; padding: 8px 16px; border-radius: 8px; font-size: 13px; white-space: nowrap; }
.star-filter-toggle { min-height: 44px; padding: 8px 4px; border: 0; background: transparent; color: var(--ink-60); font: 500 13px/1.5 var(--font-b); cursor: pointer; }
.star-filter-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.page-star #product-root :deep(.review-toolbar) { border: 0; border-radius: 0; background: transparent; padding: 0; margin-bottom: 16px; }
.page-star #product-root :deep(.filter-strip) { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; border: 0; padding: 0; }
.page-star #product-root :deep(.filter-strip .filter-search) { grid-column: 1; grid-row: 1; display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; margin: 0; font-size: 12px; }
.page-star #product-root :deep(.filter-strip #name-filter) { min-height: 44px; height: 44px; font-size: 14px; background: var(--surface); }
.page-star #product-root :deep(.filter-strip > button) { min-height: 44px; height: 44px; padding: 8px; font-size: 12px; }
.page-star #product-root :deep(.filter-strip #apply-filter) { grid-column: 2; grid-row: 1; }
.page-star #product-root :deep(.filter-strip #clear-filter) { grid-column: 3; grid-row: 1; border: 0; background: transparent; color: var(--tea); }
.page-star #product-root:not(.filters-open) :deep(.filter-strip > label:not(.filter-search)) { display: none; }
.page-star #product-root:not(.filters-open) :deep(.inventory-facts > div:not(:has(.save-state))) { display: none; }
.page-star #product-root:not(.filters-open) :deep(.inventory-facts) { display: block; padding: 4px 0 0; border: 0; background: transparent; }
.page-star #product-root:not(.filters-open) :deep(.inventory-facts dt) { display: none; }
.page-star #product-root:not(.filters-open) :deep(.inventory-facts dd) { height: auto; min-height: 0; font-size: 12px; }
.page-star #product-root :deep(.inventory-facts > div:has(.save-state)) { display: block; grid-column: 1 / -1; }
.page-star #product-root.is-plan-view :deep(.inventory-grid > .inventory-panel:first-child),
.page-star #product-root.is-plan-view :deep(.edit-section > .current-editor) { display: none; }
.page-star #product-root.is-plan-view :deep(.inventory-grid),
.page-star #product-root.is-plan-view :deep(.edit-section) { grid-template-columns: minmax(0, 1fr); }
.page-star #product-root.filters-open :deep(.filter-strip > label:not(.filter-search)) { grid-row: 2; }
.page-star #product-root.filters-open :deep(.filter-strip > label:first-child) { grid-column: 1; }
.page-star #product-root.filters-open :deep(.filter-strip > label:nth-child(2)) { grid-column: 2 / -1; }
.page-star #product-root.filters-open :deep(.inventory-facts > div) { grid-template-rows: 16px 44px; }
.page-star #product-root.filters-open :deep(.inventory-facts dd) { height: 44px; min-height: 44px; overflow: visible; }
.page-star #product-root :deep(.inventory-facts input),
.page-star #product-root :deep(.filter-strip .soft-dropdown-trigger),
.page-star #product-root :deep(.inventory-facts .soft-dropdown-trigger),
.page-star #product-root :deep(.inventory-facts .review-view-toggle) { min-height: 44px; height: 44px; }
.star-import-stage { display: inline-flex; align-items: center; min-height: 44px; padding-inline: 4px; color: var(--tea); font-size: 13px; font-weight: 600; }
.page-star #product-root :deep(.yuanstar-embedded-shell) { padding-top: 16px; }
.page-star #product-root :deep(.review-workspace-card) { padding: 0; border: 0; border-radius: 0; background: transparent; }
.page-star #product-root :deep(.inventory-panel > header h2) { font-family: var(--font-s); color: var(--tea); }
.page-star #product-root :deep(.review-overview:has(> .review-overview-count:only-child)) { display: none; }
.page-star #product-root.is-empty-view :deep(.inventory-grid),
.page-star #product-root.is-empty-view :deep(.review-workspace-tools),
.page-star #product-root.is-empty-view :deep(.ocr-review:has(.ocr-review-list > .review-detail:only-child)) { display: none; }
.page-star #product-root :deep(.inventory-panel:has(tbody:empty)) { height: 180px; }
.star-sync-meta { font-size: 12px; }
.star-sync-state.is-error, .star-sync-state.is-warning { margin: 8px 0; padding: 8px 12px; border: 1px solid currentColor; border-radius: 8px; background: var(--surface); }
.star-sync-state.is-warning:not(.is-error) { color: var(--accent-strong); }
@media (max-width: 1080px) {
  .page-star { --star-bottom-bar-height: 0px; }
}

</style>
