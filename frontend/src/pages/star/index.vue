<template>
  <div class="page-star">
    <IslandSidebar />
    <main id="main-content" class="star-main">
      <CompactToolHeader mobile-context mobile-description title="星石背包" description="作者：Drifty Yan · 独立创作">
        <template #account>
          <span v-if="completionDemo" class="star-sync-meta">隔离演示 · 虚构账号，未连接完成接口</span>
          <DataAccountContextBar v-else compact :accounts="accounts" :account-id="accountId" :game="accountGame"
            :is-logged-in="auth.isLoggedIn" :loading="accountsLoading" :error="accountError"
            :switch-disabled="!productReady || starExchangeBusy || cloudWriteBusy || growthBottlePending" switch-disabled-reason="星石工作区或瓶子库存正在保存或等待确认，请处理完成后再切换账号。" />
        </template>
        <template #actions>
          <details class="tool-more">
            <summary aria-label="更多页面操作">更多</summary>
            <div class="tool-more-content" @click.capture="$event.currentTarget.parentElement.open = false; $event.currentTarget.parentElement.querySelector('summary').focus()">
              <router-link class="act-btn ghost" to="/star/share">查看他人星石背包</router-link>
              <button v-if="!completionDemo" type="button" class="act-btn ghost" :aria-expanded="showShare" aria-controls="star-account-share" @click="showShare = !showShare">{{ showShare ? '收起分享与数据交换' : '分享与数据交换' }}</button>
              <button type="button" class="act-btn archive-toggle" :disabled="!productReady || accountsLoading || starExchangeBusy || !selectedHostAccount()"
                :aria-expanded="showArchive" @click="showArchive = !showArchive">
                <Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起导入/导出' : '导入/导出 JSON' }}
              </button>
            </div>
          </details>
        </template>
        <template #help>
          <p>导入截图并核对识别结果后，管理当前背包、养成计划与经验星曜。未登录时可先在本机使用，登录后同步当前账号数据。</p>
          <details>
            <summary>上传、分类与重叠</summary>
            <p>手机和电脑网页端均可手动上传 JPG、PNG 等图片。首次 OCR 需要下载本机识别资源，请保持页面前台并使用稳定网络。</p>
            <p>使用同一账号、同一次背包查看过程的完整原始截图；期间不要升级、分解、获得或消耗星石。不要裁切、拼接或涂改，保留分类、完整行、等级、品质、名称与上下界面。</p>
            <p>系统推荐分类后，可拖到正确的池；触屏可长按缩略图再拖动。确认本池或一键确认全部后开始识别。重复整行才添加前后图关系；没有重复就直接识别。</p>
            <div class="star-help-examples"><button type="button" @click="helpExampleKind = 'screenshots'">查看截图重点示例</button><button type="button" @click="helpExampleKind = 'overlap'">查看重复整行对照</button></div>
          </details>
          <details>
            <summary>检查识别异常</summary>
            <p>{{ bagReviewInfo.intro }}</p>
            <section v-for="section in bagReviewInfo.sections" :key="section.title"><h3>{{ section.title }}</h3><p>{{ section.body }}</p></section>
          </details>
          <button v-if="TUTORIALS_ENABLED && productReady" type="button" class="star-help-tutorial" @click="replayBagTutorial()"><CircleHelp :size="16" aria-hidden="true" />重新查看使用教程</button>
          <p>独立创作 · 著作权归作者 Drifty Yan 所有。</p>
        </template>
      </CompactToolHeader>
      <section>
        <div class="wrap">
          <div class="tool-summary" aria-label="星石概览">
            <template v-if="productReady"><span>当前背包 <b>{{ summary.currentCount }}</b> 颗</span><span v-if="summary.planInheritancePending">旧养成计划待继承</span><span v-else>养成计划 <b>{{ summary.planCount }}</b> 颗</span></template>
            <span v-else role="status">正在准备当前账号的星石数据…</span>
            <span v-if="productReady && activeTab === 'review'" class="star-sync-meta">经验星曜数量和可用经验若留空或显示「—」，表示未知。</span>
            <span v-if="activeTab === 'import'" class="star-privacy-note" title="图片识别在本机完成。手动截图由浏览器读取。登录后同步背包数据。">本机识别</span>
            <span v-if="cloudSyncMessage && !cloudSyncError && !cloudNeedsRetry && !cloudRecoveryBusy" class="star-sync-meta" role="status"
              :title="cloudSyncMessage"><Check v-if="cloudSyncMessage === '星石云端状态已保存'" :size="16" aria-hidden="true" />{{ cloudSyncMessage === '星石云端状态已保存' ? '已同步' : cloudSyncMessage }}</span>
          </div>
          <ArchiveExchangePanel
            v-if="showArchive"
            description="可导入 YuanHub 备份或 MaaYuan 本地完整识别结果（JSON），确认前可预览。导出可备份星石背包、养成计划和经验星曜。"
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
                <p class="tip">核对目标账号及预览后确认。</p>
                <label class="btn ghost file-label">
                  选择 JSON 文件
                  <input ref="starImportFile" type="file" accept=".json,application/json" :disabled="starExchangeBusy" @change="onStarImportFile" />
                </label>
                <p v-if="starExchangeError" class="star-exchange-error" role="alert">{{ starExchangeError }}</p>
                <div v-if="starImportPreview" class="star-exchange-preview">
                  <dl>
                    <div><dt>文件</dt><dd>{{ starImportPreview.preview.fileName }} · {{ starImportPreview.preview.format.toUpperCase() }}</dd></div>
                    <div v-if="!starImportPreview.preview.maayuan"><dt>星石</dt><dd>{{ starImportPreview.preview.inventoryCount }} 颗，其中 {{ starImportPreview.preview.plannedCount }} 颗有计划等级</dd></div>
                    <template v-if="starImportPreview.preview.maayuan">
                      <div><dt>类型</dt><dd>{{ starImportPreview.preview.sourceLabel }}</dd></div>
                      <div><dt>目标账号</dt><dd>{{ starImportPreview.preview.accountName }} · {{ starImportPreview.preview.game }}</dd></div>
                      <div><dt>星石</dt><dd>主星 {{ starImportPreview.preview.counts.main }} 颗 · 辅星 {{ starImportPreview.preview.counts.support }} 颗</dd></div>
                    </template>
                    <div><dt>背包</dt><dd>{{ starImportPreview.preview.bag.currentCount ?? '—' }} / {{ starImportPreview.preview.bag.capacity ?? '—' }}</dd></div>
                    <div><dt>经验星曜</dt><dd>橙 {{ starImportPreview.preview.experience.orange ?? '未知' }} · 紫 {{ starImportPreview.preview.experience.purple ?? '未知' }} · 白 {{ starImportPreview.preview.experience.white ?? '未知' }}</dd></div>
                  </dl>
                  <p v-if="starImportPreview.preview.maayuan" class="tip">将使用本次识别结果更新当前星石背包和经验星曜。原有佩戴与养成计划按现有保护和继承规则处理。</p>
                  <p v-if="starImportPreview.preview.alreadySynced" class="tip">本批次或相同完整结果已保存，确认不会重复重建背包。</p>
                  <p v-if="!starImportPreview.preview.maayuan" class="tip">确认后将替换当前账号的星石背包、养成计划和经验星曜，无法恢复密探佩戴关系或识别原始资料。</p>
                  <button type="button" class="btn primary" :disabled="starExchangeBusy" @click="confirmStarImport">{{ starExchangeBusy ? '替换中…' : '确认替换当前账号数据' }}</button>
                </div>
              </section>
            </template>
          </ArchiveExchangePanel>
          <AccountShareManager v-if="showShare && !completionDemo && auth.isLoggedIn && accountId" id="star-account-share" :account-id="accountId" class="star-share-manager" />
          <p v-else-if="showShare && !completionDemo" id="star-account-share" class="star-share-placeholder">登录并选择游戏账号后，可管理密探与星石分享。</p>
          <p
            v-if="cloudSyncError || cloudNeedsRetry || cloudRecoveryBusy"
            class="star-sync-state"
            :class="{ 'is-error': cloudSyncError, 'is-warning': cloudNeedsRetry }"
            role="status"
            aria-live="polite"
          >
            <span v-if="cloudSyncError || cloudNeedsRetry || cloudRecoveryBusy">{{ cloudSyncError || cloudSyncMessage }}</span>
            <button
              v-if="(cloudRecoveryAction && productReady && accountId) || cloudRecoveryBusy"
              type="button"
              class="star-sync-retry star-sync-cloud"
              :disabled="cloudRecoveryBusy || starExchangeBusy"
              :aria-busy="cloudRecoveryBusy"
              @click="recoverStarCloud"
            >{{ cloudRecoveryBusy ? (cloudRecoveryMode === 'recover' ? '恢复中…' : '加载中…') : (cloudRecoveryAction === 'recover' ? '恢复云端' : '重新加载') }}</button>
          </p>
          <ToolTaskPrompt v-if="productReady && activeTab === 'review' && !summary.currentCount && !starBrowseEmpty && !cloudSyncError" class="star-empty" title="建立你的星石背包" description="图片识别过程仅在本机完成。">
            <button type="button" class="btn primary star-import-action" @click="setTab('import')">导入截图</button>
            <button type="button" class="link" @click="helpExampleKind = 'screenshots'">查看支持的截图格式与说明</button>
            <button type="button" class="link" @click="starBrowseEmpty = true">手动核对或恢复已有快照</button>
          </ToolTaskPrompt>
          <ToolTaskPrompt v-if="TUTORIALS_ENABLED && emptyBagTutorialOpen" class="star-empty-tutorial" title="背包暂时为空" description="建立背包后可查看使用教程。" role="status">
            <button type="button" class="btn primary" @click="dismissRecognitionTutorial(); setTab('import')">导入截图</button>
            <button type="button" class="link" @click="dismissRecognitionTutorial">关闭说明</button>
          </ToolTaskPrompt>
          <div v-show="summary.currentCount || starBrowseEmpty || activeTab === 'import' || cloudSyncError" class="star-workbench">
          <div class="star-workbench-header">
          <div class="star-tabs tool-workspace-tabs" role="tablist" aria-label="星石工作区" @keydown="onWorkspaceTabKeydown" @focusin="onWorkspaceTabFocus" @focusout="onWorkspaceTabFocus">
            <button
              type="button" role="tab" id="star-tab-bag" aria-controls="product-root" :tabindex="starReviewView === 'bag' || activeTab !== 'review' ? 0 : -1"
              :aria-selected="activeTab === 'review' && starReviewView === 'bag'"
              :class="{ on: activeTab === 'review' && starReviewView === 'bag' }"
              @click="starReviewView = 'bag'; setTab('review')"
            >
              背包整理
            </button>
            <button type="button" role="tab" id="star-tab-plan" aria-controls="product-root" :tabindex="starReviewView === 'plan' && activeTab === 'review' ? 0 : -1" :aria-selected="activeTab === 'review' && starReviewView === 'plan'" :class="{ on: activeTab === 'review' && starReviewView === 'plan' }" @click="starReviewView = 'plan'; setTab('review')">养成计划</button>
          </div>
          <button v-if="TUTORIALS_ENABLED && productReady && (activeTab === 'import' || starReviewView === 'plan')" type="button" class="star-tutorial-replay" @click="activeTab === 'review' ? openTutorial('plan') : replayRecognitionTutorial()">
            <CircleHelp :size="16" aria-hidden="true" />{{ activeTab === 'review' ? '重新查看养成教程' : '重新查看识别教程' }}
          </button>
          </div>
          <div v-if="activeTab === 'review' && starReviewView === 'bag'" class="star-workbench-actions">
            <button type="button" class="btn primary star-import-action" @click="setTab('import')"><Plus :size="16" aria-hidden="true" /> 导入截图</button>
            <button v-if="TUTORIALS_ENABLED && productReady" type="button" class="star-tutorial-replay" @click="replayBagTutorial()"><CircleHelp :size="16" aria-hidden="true" />重新查看使用教程</button>
          </div>
          </div>
          <div id="product-root" ref="mountRoot" :inert="starExchangeBusy || cloudRecoveryBusy" :role="activeTab === 'review' ? 'tabpanel' : 'region'" :aria-labelledby="activeTab === 'review' ? 'star-tab-' + starReviewView : undefined" :aria-label="activeTab === 'import' ? '截图识别' : undefined" tabindex="0" v-show="productReady && (summary.currentCount || starBrowseEmpty || activeTab === 'import' || cloudSyncError)" :class="{ 'is-plan-view': starReviewView === 'plan', 'is-bag-view': starReviewView === 'bag', 'filters-open': starFiltersOpen, 'is-empty-view': activeTab === 'review' && !summary.currentCount && !starBrowseEmpty && !cloudSyncError }"></div>
          <RecognitionExampleModal :items="recognitionTutorialExamples[helpExampleKind] || []" @close="helpExampleKind = null" />
          <RecognitionTutorial v-if="TUTORIALS_ENABLED" :open="recognitionTutorialOpen" :replay-id="recognitionTutorialReplayId" :root="mountRoot" :mode="tutorialMode" :plan-switch-blocked="summary.planInheritancePending || summary.planInheritanceOpen || cloudWriteBusy || growthBottlePending || !productReady || activeTab !== 'review' || starReviewView !== 'plan'" @step-change="revealTutorialStep" @close="dismissRecognitionTutorial" />
          <p v-if="!productReady && !mountError" class="yuanstar-mount-loading" role="status">
            {{ accountError && !mountBusy ? '暂时无法读取当前账号的数据，请重新加载。' : '正在读取当前账号的背包…' }}
            <button v-if="accountError && !mountBusy" type="button" class="star-sync-retry" @click="syncHostAccount().catch(() => {})">重新加载当前账号</button>
          </p>
          <div v-if="mountError" class="yuanstar-mount-error" role="alert">
            星石页面未能加载：{{ mountError }}
            <button type="button" :disabled="mountBusy" @click="mountProduct">重试加载</button>
          </div>
        </div>
      </section>
      <SiteFooter>
        <template #big>星石养成<br /><span>背包 · 整理 · 计划</span></template>
        <template #fine>
          <b>YuanHub</b> · 星石养成工作区<br />
          MaaYuan × 鸢BWiki × 辟雍学府 × YuanAssist 共同搭建<br />
          数据仅供参考，请以游戏内实际背包为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { accountIdentityVersion, useAccountListUpdates } from '../../store/accountList.js'
import { normalizeMaaYuanInventory, starImportKind } from './maayuanInventoryImport.js'
import { assertNoStarImportDraft } from './starImportDraftGuard.js'
import { previewStarInventoryImport, confirmStarInventoryImport } from '../../api/starInventoryImport.js'
import { relabelStarArchive } from './starArchiveExport.js'
import { onWorkspaceTabKeydown, onWorkspaceTabFocus } from "../../utils/workspaceTabs.js";
import { usePersistedTab } from "../../utils/persistedTab.js";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Archive, CircleHelp, Check, Plus } from "@lucide/vue";
import CompactToolHeader from "../../components/CompactToolHeader.vue";
import ToolTaskPrompt from "../../components/ToolTaskPrompt.vue";
import RecognitionTutorial from "./RecognitionTutorial.vue";
import RecognitionExampleModal from "./RecognitionExampleModal.vue";
import { recognitionTutorialExamples, tutorialStorageKey, tutorialSeen, markTutorialSeen, shouldAutoStartTutorial, tutorialOcrRunning } from "./recognitionTutorial.js";
import { bagReviewInfo, createBagTutorialGate } from "./bagTutorial.js";
import DataAccountContextBar from "../../components/DataAccountContextBar.vue";
import ArchiveExchangePanel from "../../components/ArchiveExchangePanel.vue";
import AccountShareManager from "../../components/AccountShareManager.vue";
import IslandSidebar from "../../components/IslandSidebar.vue";
import SiteFooter from "../../components/SiteFooter.vue";
import { listAccounts } from "../../api/accounts.js";
import { getCurrent as getCurrentInventory, importInventory } from "../../api/inventory.js";
import { createGrowthPlanInventoryWriter, growthPlanInventorySession } from "./growthPlanInventory.js";
import { createStarCompletionApi } from '../../api/starCompletions.js';
import { createStarCompletionPort } from './starCompletionPort.js';
import { FEATURE_KEYS, isFeatureEnabled, TUTORIALS_ENABLED } from '../../config/features.js';
import { auth } from "../../store/auth.js";
import { activeAccount, isAccountGame } from "../../store/activeAccount.js";
import {
  disposeYuanStarHandle,
  waitForYuanStarDisposal,
} from "./embedLifecycle.js";
import { createStarCloudCoordinator } from "./starCloudCoordinator.js";
import { createCloudPlanInheritancePort } from "./starCloudPlanInheritance.js";
import { starCloudFeedback } from "./starCloudStatus.js";
import { createLatestAccountSync } from "./latestAccountSync.js";
import { migrateLegacyYuanStarHostAccount } from "./legacyHostAccountMigration.js";
import { bindStarExchangePreview, isStarExchangePreviewCurrent } from "./starExchangePreviewScope.js";

import { observeLocalOcrProgressCopy } from "./localOcrProgressCopy.js";

const EMBED_MODULE_URL = "/yuanstar-embed/yuanstar-embed.js";
const completionDemo = import.meta.env.DEV && isFeatureEnabled(FEATURE_KEYS.STAR_COMPLETION_DEMO);
const EMBED_STYLESHEET_URL = "/yuanstar-embed/yuanstar-embed.css";
const EMBED_STYLESHEET_ID = "yuanstar-embed-styles";
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
const summary = ref({ currentCount: 0, planCount: 0, gameVersion: "如鸢", planInheritancePending: false, planInheritanceOpen: false });
watch(() => summary.value.planInheritancePending || summary.value.planInheritanceOpen, blocked => { if (blocked) recognitionTutorialOpen.value = false; });
const starReviewView = ref('bag');
const growthBottlePending = ref(false);
function growthBottleWriter(owner) {
  const userId = String(auth.userInfo?.id || '');
  const context = starContextVersion, identity = accountIdentityVersion;
  return createGrowthPlanInventoryWriter({
    state: growthPlanInventorySession(userId, owner),
    getCurrent: args => getCurrentInventory(args, { expectedUserId: userId, fresh: true }),
    importInventory: doc => importInventory(doc, { expectedUserId: userId }),
    isCurrent: account => !unmounted && context === starContextVersion && identity === accountIdentityVersion && auth.isLoggedIn &&
      userId === String(auth.userInfo?.id || '') && account === selectedHostAccount()?.accountId,
  });
}
async function runGrowthBottleOperation(owner, operation) {
  const writer = growthBottleWriter(owner);
  const context = starContextVersion, identity = accountIdentityVersion;
  growthBottlePending.value = true;
  try { return await operation(writer); }
  finally {
    if (!unmounted && context === starContextVersion && identity === accountIdentityVersion && owner === selectedHostAccount()?.accountId)
      growthBottlePending.value = writer.hasPending();
  }
}
watch(starReviewView, view => { handle?.setReviewView?.(view); });
const starBrowseEmpty = ref(false);
const starFiltersOpen = ref(false);
const cloudSyncMessage = ref("");
const cloudSyncError = ref("");
const cloudNeedsRetry = ref(false);
const cloudRecoveryBusy = ref(false);
const cloudRecoveryAction = ref("");
const cloudRecoveryMode = ref("");
const productReady = ref(false);
const cloudWriteBusy = ref(false);
const recognitionTutorialOpen = ref(false);
const helpExampleKind = ref(null);
const emptyBagTutorialOpen = ref(false);
const recognitionTutorialReplayId = ref(0);
const tutorialMode = ref("recognition");
const tutorialCloudReady = ref(false);
const tutorialCloudHistory = ref(false);
const tutorialAccountReady = ref(false);
const recognitionTutorialKey = computed(() => tutorialStorageKey(auth.isLoggedIn ? auth.userInfo?.id : null));
const bagTutorialKey = computed(() => tutorialStorageKey(auth.isLoggedIn ? auth.userInfo?.id : null, "bag"));
const bagTutorialGate = createBagTutorialGate();
const bagTutorialOwner = () => bagTutorialKey.value + ":" + (accountId.value || "guest");
let tutorialCheckSequence = 0;
let recognitionTutorialOwnerKey = "";
let localOcrProgressObserver = null;
let tutorialStatusObserver = null;
let tutorialStatusFrame = 0;

function replayRecognitionTutorial() {
  openTutorial("recognition");
}
function replayBagTutorial() {
  openTutorial("bag");
}
function openTutorial(mode) {
  if (!TUTORIALS_ENABLED || !productReady.value || summary.value.planInheritancePending || summary.value.planInheritanceOpen) return;
  if (recognitionTutorialOpen.value || emptyBagTutorialOpen.value) dismissRecognitionTutorial();
  tutorialMode.value = mode;
  recognitionTutorialOwnerKey = tutorialStorageKey(auth.isLoggedIn ? auth.userInfo?.id : null, mode);
  if (mode === 'bag' && !summary.value.currentCount) {
    emptyBagTutorialOpen.value = true;
    return;
  }
  const tab = mode === "recognition" ? "import" : "review";
  if (mode !== 'recognition') {
    starReviewView.value = mode === 'plan' ? 'plan' : 'bag';
    starBrowseEmpty.value = true;
  }
  if (activeTab.value !== tab) setTab(tab);
  recognitionTutorialReplayId.value++;
  // A new component opening always starts at step 1.
  recognitionTutorialOpen.value = true;
}
function revealTutorialStep(step) {
  // Paging explains the current workspace; a missing target never switches pages.
  if (tutorialMode.value === 'bag' && activeTab.value === 'review' && starReviewView.value === 'bag' && step.id === 'find') starFiltersOpen.value = true;
}
function dismissRecognitionTutorial() {
  if (!TUTORIALS_ENABLED) return;
  markTutorialSeen(recognitionTutorialOwnerKey || recognitionTutorialKey.value);
  recognitionTutorialOpen.value = false;
  emptyBagTutorialOpen.value = false;
}
async function checkRecognitionTutorial() {
  if (!TUTORIALS_ENABLED || summary.value.planInheritancePending || summary.value.planInheritanceOpen) return;
  const sequence = ++tutorialCheckSequence;
  if (!productReady.value || !tutorialAccountReady.value || accountsLoading.value || accountError.value ||
      (auth.isLoggedIn && (!auth.userInfo?.id || !selectedHostAccount() || !tutorialCloudReady.value))) return;
  const currentHandle = handle, key = recognitionTutorialKey.value, context = starContextVersion;
  let status;
  try { status = await currentHandle?.getRecognitionTutorialStatus?.(); } catch (_) { return; }
  if (context !== starContextVersion || sequence !== tutorialCheckSequence || currentHandle !== handle || key !== recognitionTutorialKey.value || unmounted) return;
  if (!status?.ready || typeof status.hasHistory !== 'boolean' || tutorialOcrRunning(mountRoot.value)) return;
  const hasHistory = status.hasHistory || tutorialCloudHistory.value;
  const bagEligible = bagTutorialGate.loaded(bagTutorialOwner(), hasHistory);
  if (!bagEligible) markTutorialSeen(bagTutorialKey.value);
  if (bagTutorialGate.shouldStart(bagTutorialOwner(), {
    reviewing: activeTab.value === "review", ready: status.ready, seen: tutorialSeen(bagTutorialKey.value),
    hasEvidence: Boolean(mountRoot.value?.querySelector('.ocr-review [data-review-image]')) &&
      mountRoot.value?.querySelector('.ocr-review .ocr-summary em')?.textContent?.trim() === '已保存识别结果，可再次核对',
  }) && !recognitionTutorialOpen.value && !emptyBagTutorialOpen.value && summary.value.currentCount > 0) replayBagTutorial();
  // Remember experienced users even if they later switch to an empty game account.
  if (hasHistory) { if (!bagEligible) markTutorialSeen(key); return; }
  if (shouldAutoStartTutorial({ ready: status.ready, importing: activeTab.value === 'import', seen: tutorialSeen(key), hasHistory }) && !recognitionTutorialOpen.value && !emptyBagTutorialOpen.value) replayRecognitionTutorial();
}
const showArchive = ref(false);
const showShare = ref(false);
const showStarImport = ref(false);
const starImportPreview = ref(null);
const starImportFile = ref(null);
const starExchangeError = ref("");
const starExchangeBusy = ref(false);
let handle = null;
let unmounted = false;
let mountedAccountId = "";
let rejectedSwitchMessage = "";
let starContextVersion = 0;
let starImportSelection = 0;
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
    cloudWriteBusy.value = !!(state.replacing || state.error || state.writer?.saving || state.writer?.pending || state.writer?.error);
    cloudRecoveryAction.value = state.canReloadCloud ? "recover" : (state.error || state.recoveryRequired || state.commandPending) ? "reload" : "";
    tutorialCloudReady.value = Boolean(state.ready);
    tutorialCloudHistory.value = Boolean(state.writer?.revision > 0 || state.writer?.generation > 0);
    const feedback = starCloudFeedback(state);
    cloudSyncMessage.value = feedback.message;
    cloudSyncError.value = feedback.error;
    cloudNeedsRetry.value = Boolean(state.recoveryRequired);
  },
});
function clearCloudSyncFeedback() {
  if (cloudNeedsRetry.value || cloudRecoveryBusy.value) return;
  cloudSyncMessage.value = "";
  cloudSyncError.value = "";
}
async function recoverStarCloud() {
  if (!cloudRecoveryAction.value || cloudRecoveryBusy.value || starExchangeBusy.value || !handle || !selectedHostAccount()) return;
  const mode = cloudRecoveryAction.value, session = starCloud.state(), currentHandle = handle;
  const context = starContextVersion, identity = accountIdentityVersion;
  const isCurrent = () => !unmounted && context === starContextVersion && identity === accountIdentityVersion && currentHandle === handle && session === starCloud.state();
  cloudRecoveryMode.value = mode;
  cloudRecoveryBusy.value = true;
  try {
    if (mode === "recover") {
      const recovered = await starCloud.discardAndReload({ isCurrent });
      if (!isCurrent()) return;
      if (recovered) {
        cloudSyncMessage.value = "已恢复云端背包，可继续编辑。";
        cloudSyncError.value = "";
      } else cloudSyncError.value = "未能恢复云端背包，待同步记录仍保留。请检查网络、浏览器存储或账号状态后再次恢复。";
    } else await syncHostAccount({ readOnly: true });
  } catch (error) {
    if (isCurrent()) cloudSyncError.value = "未能读取或核对云端背包，本机记录仍保留，请重新加载。";
  } finally { cloudRecoveryBusy.value = false; }
}
function resetStarImportState() {
  ++starImportSelection;
  starExchangeBusy.value = false;
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
async function syncHostAccount({ readOnly = false } = {}) {
  if (completionDemo) return false;
  if (!handle) return false;
  productReady.value = false;
  tutorialAccountReady.value = false;
  const host = selectedHostAccount(), identity = accountIdentityVersion;
  return queueAccountSync(async function (isLatest) {
    const currentHandle = handle;
    const isCurrent = () => isLatest() && !unmounted && identity === accountIdentityVersion && currentHandle === handle && (host?.accountId || "") === (selectedHostAccount()?.accountId || "");
    const previousAccountId = mountedAccountId;
    try {
      if (!isCurrent()) return false;
      if (host) await migrateLegacyYuanStarHostAccount(host);
      if (!isCurrent()) return false;
      await currentHandle.setHostAccount(host);
      if (!isCurrent()) return false;
      mountedAccountId = host?.accountId || "";
      growthBottlePending.value = host ? growthBottleWriter(host.accountId).hasPending() : false;
      if (previousAccountId && previousAccountId !== mountedAccountId)
        resetStarImportState();
      clearCloudSyncFeedback();
      const entered = await starCloud.enter(currentHandle, { readOnly, isCurrent });
      if (!isCurrent()) return false;
      if (host && !entered) cloudSyncError.value = "暂时无法读取云端背包，请重试加载；本机数据没有被覆盖。";
      tutorialAccountReady.value = !host || entered;
      if (host) { accountError.value = rejectedSwitchMessage; rejectedSwitchMessage = ""; }
      productReady.value = true;
      currentHandle.setActiveTab(activeTab.value);
      currentHandle.setReviewView?.(starReviewView.value);
      if (entered) void currentHandle.recoverCompletion?.();
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
async function loadEmbedModule() {
  const committed = () => Function("url", "return import(url)")(EMBED_MODULE_URL);
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('star_bag_preview') === '1') {
    const { loadStarCompletionDemoProduct } = await import('./dev/starCompletionDemo.js');
    return loadStarCompletionDemoProduct(committed);
  }
  return committed();
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
  const source = handle, context = starContextVersion, identity = accountIdentityVersion;
  const host = selectedHostAccount(), selection = ++starImportSelection;
  const current = () => !unmounted && source === handle && context === starContextVersion && identity === accountIdentityVersion && selection === starImportSelection && productReady.value;
  starImportPreview.value = null;
  starExchangeError.value = "";
  starExchangeBusy.value = true;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB 限制。');
    const raw = JSON.parse(await file.text());
    if (!current()) return;
    let preview;
    if (starImportKind(raw) === 'backup') {
      preview = await source.previewDataExchangeImport(file);
    } else {
      if (!host) throw new Error('请先登录并选择目标游戏账号，再导入 MaaYuan 识别结果。');
      const normalized = await normalizeMaaYuanInventory(raw);
      if (!current()) return;
      const body = { ...normalized, game: host.gameVersion };
      const remote = await previewStarInventoryImport(host.accountId, body);
      if (!current()) return;
      if (remote.account_id !== host.accountId || remote.game !== host.gameVersion) throw new Error('目标账号已变化，请重新选择文件。');
      const doc = normalized.document;
      preview = { maayuan: true, fileName: file.name, format: 'json', sourceLabel: normalized.source_format === 'local-ocr' ? 'MaaYuan 本地完整识别' : 'MaaYuan 结构化同步批次',
        accountName: host.displayName, game: host.gameVersion, counts: doc.counts, inventoryCount: doc.inventory.length,
        bag: { currentCount: doc.inventory.length, capacity: doc.bag?.capacity ?? null }, experience: doc.experience,
        alreadySynced: remote.already_synced, body: { ...body, expected_generation: remote.generation, expected_revision: remote.revision } };
    }
    if (current()) starImportPreview.value = { ...bindStarExchangePreview(preview, accountId.value), context, identity, selection };
  } catch (error) {
    if (current()) starExchangeError.value = error instanceof SyntaxError ? "JSON 无法解析，请检查文件内容后重新选择。" : message(error, "导入档案校验失败，请核对文件后重新选择。");
  } finally {
    if (selection === starImportSelection) starExchangeBusy.value = false;
    if (event?.target) event.target.value = '';
  }
}
async function confirmStarImport() {
  if (!handle || !starImportPreview.value || starExchangeBusy.value) return;
  const bound = starImportPreview.value, source = handle;
  const current = () => !unmounted && source === handle && bound.context === starContextVersion && bound.identity === accountIdentityVersion && bound.selection === starImportSelection && isStarExchangePreviewCurrent(bound, accountId.value);
  if (!current()) { rejectStaleStarImportPreview(); return; }
  const preview = bound.preview;
  starExchangeBusy.value = true;
  starExchangeError.value = "";
  let lease, submitted = false;
  try {
    if (preview.maayuan) {
      await assertNoStarImportDraft(bound.accountId, mountRoot.value);
      if (!current()) return;
      const scope = starCloud.ocrRebuildScope();
      if (scope.generation !== preview.body.expected_generation || scope.revision !== preview.body.expected_revision) throw new Error('预览后背包已变化，请重新选择文件。');
      lease = starCloud.beginCompletion(scope);
      // No write before this point. The lease prevents local edits during POST/read/adoption.
      await confirmStarInventoryImport(bound.accountId, preview.body);
      submitted = true;
      if (!current() || !lease.isCurrent()) return;
      // Validated cloud read and adoption use the existing coordinator; no workspace remount.
      await lease.refresh();
      if (!current() || !lease.isCurrent()) return;
      // The pending-plan port reads a command scope, which is available only
      // after the import lease has released its write lock.
      lease.release();
      lease = null;
      source.setReviewView?.(starReviewView.value);
      cloudSyncMessage.value = preview.alreadySynced ? '本次识别结果已保存，未重复重建。' : '识别结果已保存；如有旧计划待继承，请前往养成计划处理。';
    } else await source.confirmDataExchangeImport(preview);
    if (!current()) return;
    starImportPreview.value = null;
    showStarImport.value = false;
  } catch (error) {
    if (!current()) return;
    if (lease && (submitted || ![400, 401, 403, 404, 409, 422].includes(Number(error?.status)))) {
      const recovery = '补传结果尚待核对，请重新加载云端后重试同一文件；原文件与本机草稿保留。';
      lease.fail(new Error(recovery));
      starExchangeError.value = message(error, '暂时无法确认同步结果') + '。' + recovery;
      return;
    }
    if (error?.code === "cloud_replacement_local_pending" || error?.code === "star_rebuild_uncertain") {
      starImportPreview.value = null;
      starExchangeError.value = error?.code === "star_rebuild_uncertain"
        ? "尚无法确认档案是否已替换，请先重新加载核对，不要重复导入。"
        : message(error, "云端档案已替换，本机尚未同步完成，请重新加载核对。");
    } else starExchangeError.value = message(error, preview.maayuan
      ? '补传未确认成功，请保留原文件并重试同一批次；不要生成新批次。'
      : '档案尚未导入，请核对文件后重试。');
  } finally {
    lease?.release();
    if (bound.selection === starImportSelection) starExchangeBusy.value = false;
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
    if (import.meta.env.DEV && isFeatureEnabled(FEATURE_KEYS.STAR_COMPLETION_DEMO)) {
      const { mountStarCompletionDemo, loadStarCompletionDemoProduct } = await import('./dev/starCompletionDemo.js');
      const product = await loadStarCompletionDemoProduct(loadEmbedModule);
      if (unmounted || !mountRoot.value) return;
      handle = await mountStarCompletionDemo(product, mountRoot.value, next => { summary.value = next; });
      productReady.value = true; activeTab.value = 'review'; starReviewView.value = 'plan';
      return;
    }
    const product = await loadEmbedModule();
    if (unmounted || !mountRoot.value) return;
    const initialHostAccount = selectedHostAccount();
    if (initialHostAccount)
      await migrateLegacyYuanStarHostAccount(initialHostAccount);
    if (unmounted || !mountRoot.value) return;
    const mountedHandle = product.mountYuanStar(mountRoot.value, {
      completion: createStarCompletionPort({
        api: createStarCompletionApi({ userId: String(auth.userInfo?.id || '') }), coordinator: starCloud,
        identity: () => auth.isLoggedIn ? { userId: String(auth.userInfo?.id || ''), game: selectedHostAccount()?.gameVersion } : null,
        enabled: isFeatureEnabled(FEATURE_KEYS.STAR_COMPLETION),
      }),
      assetBaseUrl: "/yuanstar-embed/",
      embedded: true,
      reviewView: starReviewView.value,
      onReadBreakthroughInventory: owner => runGrowthBottleOperation(owner, writer => writer.read(owner)),
      onSaveBreakthroughInventory: (owner,id,count) => runGrowthBottleOperation(owner, writer => writer.save(owner,id,count)),
      onAcceptBreakthroughInventory: (owner,id,count) => runGrowthBottleOperation(owner, writer => writer.acceptCurrent(owner,id,count)),
      hostAccount: initialHostAccount,
      onBusinessStateCommitted: function (event) { return starCloud.committed(event); },
      onApplyRecoveredPlan: function (snapshot, scope) { return starCloud.applyRecoveredPlan(snapshot, scope); },
      cloudPlanInheritance: createCloudPlanInheritancePort({ coordinator: starCloud }),
      getOcrRebuildScope: function () { return starCloud.ocrRebuildScope(); },
      onOcrRebuild: async function (snapshot, recoveryPointId, scope) {
        const owner = bagTutorialOwner(), context = starContextVersion;
        const result = await starCloud.rebuildOcr(snapshot, recoveryPointId, scope);
        // Observe the existing successful OCR handoff. The tour also waits for the persisted review DOM.
        if (TUTORIALS_ENABLED && !unmounted && context === starContextVersion && owner === bagTutorialOwner()) bagTutorialGate.ocrCompleted(owner);
        return result;
      },
      onReplacementImport: function (snapshot) { if (TUTORIALS_ENABLED) bagTutorialGate.cancelOcr(bagTutorialOwner()); return starCloud.replaceImport(snapshot); },
      onListRecoveryPoints: function () { return starCloud.listRecoveryPoints(); },
      onRestoreRecoveryPoint: function (pointId) { if (TUTORIALS_ENABLED) bagTutorialGate.cancelOcr(bagTutorialOwner()); return starCloud.restorePoint(pointId); },
      onRestoreLocalPoint: function (snapshot) { if (TUTORIALS_ENABLED) bagTutorialGate.cancelOcr(bagTutorialOwner()); return starCloud.restoreLocal(snapshot); },
      onSummaryChange: function (nextSummary) {
        summary.value = nextSummary;
      },
      onActiveTabChange: function (tab) {
        if (tab === 'review' && activeTab.value === 'import') starBrowseEmpty.value = true;
        activeTab.value = tab;
      },
      onReviewViewChange: function (view) {
        starReviewView.value = view;
      },
    });
    if (unmounted) {
      await mountedHandle.dispose();
      return;
    }
    handle = mountedHandle;
    localOcrProgressObserver?.disconnect();
    localOcrProgressObserver = observeLocalOcrProgressCopy(mountRoot.value);
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
  activeTab.value = tab;
  if (productReady.value) handle?.setActiveTab(tab);
}
watch([() => auth.isLoggedIn, () => auth.userInfo?.id], resetStarImportState, { flush: 'sync' });
watch([accountId, accountGame], () => {
  if (completionDemo) return;
  starContextVersion++;
  ++tutorialCheckSequence;
  recognitionTutorialOpen.value = false;
  emptyBagTutorialOpen.value = false;
  recognitionTutorialOwnerKey = '';
  starBrowseEmpty.value = false;
  tutorialAccountReady.value = false;
  bagTutorialGate.reset();
  productReady.value = false;
  starCloud.leave();
  resetStarImportState();
  showArchive.value = false;
  if (handle && !unmounted) void syncHostAccount().catch(() => {});
}, { flush: "sync" });
if (TUTORIALS_ENABLED) {
  watch([productReady, tutorialAccountReady, tutorialCloudReady, tutorialCloudHistory, activeTab, recognitionTutorialKey, summary], () => { void checkRecognitionTutorial(); }, { flush: "post" });
  watch(recognitionTutorialKey, () => {
    ++tutorialCheckSequence;
    recognitionTutorialOpen.value = false;
    emptyBagTutorialOpen.value = false;
    recognitionTutorialOwnerKey = '';
    bagTutorialGate.reset();
  }, { flush: "sync" });
  watch([activeTab, starReviewView], ([tab, view]) => {
    if ((recognitionTutorialOpen.value || emptyBagTutorialOpen.value) && (tab !== (tutorialMode.value === "recognition" ? "import" : "review") || (tutorialMode.value === "plan" && view !== "plan"))) dismissRecognitionTutorial();
  });
}
onMounted(async function () {
  if (completionDemo) { void mountProduct(); return; }
  // Draft restoration may finish after the first summary. Recheck on the
  // embed's actual render, without polling or changing its business lifecycle.
  if (TUTORIALS_ENABLED) {
    tutorialStatusObserver = new MutationObserver(() => {
      if (tutorialStatusFrame) return;
      tutorialStatusFrame = requestAnimationFrame(() => {
        tutorialStatusFrame = 0;
        void checkRecognitionTutorial();
      });
    });
    if (mountRoot.value) tutorialStatusObserver.observe(mountRoot.value, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });
  }
  await loadAccounts();
  if (unmounted) return;
  void mountProduct();
});
onBeforeUnmount(function () {
  localOcrProgressObserver?.disconnect();
  tutorialStatusObserver?.disconnect();
  cancelAnimationFrame(tutorialStatusFrame);
  unmounted = true;
  starCloud.leave();
  productReady.value = false;
  const current = handle;
  handle = null;
  if (current) void disposeYuanStarHandle(current).catch(function () {});
});
</script>

<style scoped>
.page-star .star-share-manager { border: 1px solid var(--line); border-radius: 16px; }
.star-share-placeholder { border: 1px solid var(--line); border-radius: 12px; color: var(--ink-60); background: var(--surface); }
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.star-main :deep(.compact-tool-description) { color: var(--ink); }
.page-star #product-root :deep(.product-toast) {
  pointer-events: none;
}
.star-tutorial-replay, .star-help-tutorial {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.star-help-examples button { border: 1px solid var(--line); border-radius: 12px; background: var(--cream); color: var(--ink); cursor: pointer; }
.star-help-examples button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.archive-toggle {
  border: 1.5px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
  background: transparent;
  cursor: pointer;
  transition: all 0.3s var(--ease);
}
.archive-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.star-exchange-import { border-top: 1px dashed var(--line); }
.star-exchange-import .tip { color: var(--ink-60); }
.star-exchange-import .file-label { cursor: pointer; }
.star-exchange-error { color: var(--theme-danger-text, var(--rouge)); }
.star-exchange-preview { border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
.star-exchange-preview dt { color: var(--ink-60); }
.star-exchange-preview dd { color: var(--ink); }
.star-sync-state {
  color: var(--ink-60);
}
.star-sync-state.is-error {
  color: var(--theme-danger-text, var(--rouge));
}
.star-sync-retry {
  border: 0;
  background: transparent;
  color: var(--theme-strong-text, var(--tea));
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.star-sync-retry:hover:not(:disabled) { color: var(--theme-accent-text, var(--accent)); }
.star-sync-retry:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; border-radius: 2px; }
.star-sync-retry:disabled { opacity: .55; cursor: wait; }
.star-sync-cloud { max-width: calc(100% - 8px); white-space: normal; text-align: start; overflow-wrap: anywhere; }
#product-root {
  background: transparent;
}
.yuanstar-mount-error {
  border: 1px solid var(--theme-danger-line, rgba(166, 81, 74, 0.45));
  border-radius: 14px;
  color: var(--theme-danger-text, var(--rouge));
  background: var(--surface);
}
.yuanstar-mount-loading { color: var(--ink-60); }
.yuanstar-mount-error button {
  border: 1px solid currentColor;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.yuanstar-mount-error button:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.star-import-action { border-radius: 8px; }
.page-star #product-root :deep(.review-toolbar) { border: 0; border-radius: 0; background: transparent; }
.page-star #product-root :deep(.is-bag-view .bag-filters) { border: 1px solid var(--line); border-radius: var(--radius-card, 12px); background: var(--surface); }
.page-star #product-root :deep(.filter-strip) { border: 0; }
.page-star #product-root :deep(.filter-strip #name-filter) { background: var(--surface); }
.page-star #product-root :deep(.filter-strip #clear-filter) { border: 0; background: transparent; color: var(--theme-strong-text, var(--tea)); }
.page-star #product-root:not(.filters-open) :deep(.inventory-facts) { border: 0; background: transparent; }
.page-star #product-root :deep(.review-workspace-card) { border: 0; border-radius: 0; background: transparent; }
.page-star #product-root :deep(.review-overview) { border-radius: 8px; background: var(--surface); }
.page-star #product-root :deep(.inventory-facts .save-state) { border-radius: 4px; background: var(--surface); }
.page-star #product-root :deep(.inventory-panel > header h2) { color: var(--theme-strong-text, var(--tea)); }
/* Star actions keep the same compact height for mouse and touch input.
   Inline name tooltips, image previews and modal backdrops are content surfaces. */
.star-sync-state.is-error, .star-sync-state.is-warning { border: 1px solid currentColor; border-radius: 8px; background: var(--surface); }
.star-sync-state.is-warning:not(.is-error) { color: var(--theme-accent-text, var(--accent-strong)); }
</style>
<style scoped src="./starHostDesktop.css"></style>
<style scoped src="./starHostMobile.css"></style>
