<template>
  <div class="page-operator">
    <IslandSidebar />

    <main id="main-content" class="operator-main">
      <CompactToolHeader class="roster-header" title="密探名册">
        <template #account>
          <DataAccountContextBar compact :accounts="accounts" :account-id="accountId" :game="gameFilter"
            :is-logged-in="auth.isLoggedIn" :loading="accountsLoading" :error="accountError" :before-switch="beforeAccountSwitch" :switch-disabled="accountSwitchBusy"
            switch-disabled-reason="正在保存或导入，请等待完成后再切换账号。" />
        </template>
        <template #primary-actions>
          <div class="roster-box-actions">
            <button type="button" class="btn primary roster-share" :aria-expanded="shareModalOpen" aria-controls="operator-share-dialog" aria-haspopup="dialog"
              :title="currentAccountName + ' · ' + ledgerShareStatus" @click="shareModalOpen = true">
              <Share2 :size="16" aria-hidden="true" />分享 BOX <small :class="{ 'is-sharing': isOperatorSharing }">{{ ledgerShareStatus }}</small>
            </button>
            <button type="button" class="btn ghost roster-view-box" :aria-expanded="boxViewerOpen" aria-controls="operator-box-viewer" aria-haspopup="dialog" @click="boxViewerOpen = true"><Users :size="16" aria-hidden="true" />查看他人 BOX</button>
          </div>
        </template>
        <template #actions>
          <details class="tool-more">
            <summary aria-label="更多页面操作">更多</summary>
            <div class="tool-more-content" @click.capture="$event.currentTarget.parentElement.open = false; $event.currentTarget.parentElement.querySelector('summary').focus()">
              <button type="button" class="act-btn archive-toggle" :disabled="!auth.isLoggedIn" :aria-expanded="showArchive" @click="toggleArchive">
                <Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起导入/导出' : '导入/导出 JSON' }}
              </button>
              <button v-if="activeTab === 'relationships'" type="button" class="act-btn" aria-haspopup="dialog"
                :disabled="!relationshipWorkspace?.ready" @click="relationshipWorkspace?.openBackup()">
                <Archive :size="15" aria-hidden="true" />信赖与传闻备份
              </button>
              <button v-if="canUseAutomaticPanel" type="button" class="act-btn" role="switch" :aria-checked="panelAutoFillEnabled"
                aria-label="当前账号自动补全面板" :disabled="!currentPanelAccount || panelPreferenceSaving || accountsLoading"
                @click="togglePanelAutoFill">
                <Calculator :size="15" aria-hidden="true" />自动补全面板：{{ panelPreferenceSaving ? '保存中' : panelAutoFillEnabled ? '开' : '关' }}
              </button>
              <TutorialEntry v-if="TUTORIALS_ENABLED" task="operator-first-entry" />
            </div>
          </details>
        </template>
        <template #summary>
          <div class="tool-summary roster-summary" aria-label="密探概览">
            <span class="roster-total">图鉴 <b>{{ catalogCount }}</b> 位</span>
            <span class="roster-owned">已招募 <b>{{ manifestOwned }}</b><span class="roster-mobile-total"> / <b>{{ catalogCount }}</b></span> 位</span>
            <span>{{ manifestPercent }}</span>
            <span class="tool-updated" :title="catalogVersion || '本地兜底'">更新于 {{ catalogVersion ? catalogVersion.split('T')[0] : '本地兜底' }}</span>
          </div>
        </template>
        <template #help>
          <p>图鉴更新于 {{ catalogVersion || '本地兜底' }}；完整目录版本也可在「更多筛选」中选中复制。</p>
          <p>手动补录从「录入密探」进入；扫描有不确定项时，点页面上方「待复核采集结果」中的「查看并修改」；JSON 备份导入/导出在「更多」中。</p>
          <p v-if="canUseAutomaticPanel">自动补全只填未录入的血攻，已有手填或采集值优先；在「更多」中按账号开关，也可在密探编辑中单独选择来源。切换来源保留原值。</p>
          <p>养成总览中，点按虚线数值可手动校正；快捷提升会核对并扣除库存，手动校正与完整编辑不扣库存。<span v-if="canUseAutomaticPanel">面板计算源自 <a href="https://wiki.biligame.com/yuan/" target="_blank" rel="noopener noreferrer">bwiki 编辑部</a>及技术外援，数值可能有个位数误差，请以游戏内为准。</span></p>
        </template>
      </CompactToolHeader>
      <p v-if="panelPreferenceNotice" class="panel-preference-notice" :role="panelPreferenceError ? 'alert' : 'status'">{{ panelPreferenceNotice }}</p>

      <section>
        <div class="wrap">
          <OnboardingGuide v-if="TUTORIALS_ENABLED" :tasks="['operator-first-entry', 'today-first-data']" />
          <section v-if="scanReviews.length || scanReviewError" class="scan-review-panel" aria-label="待复核采集结果">
            <h2>待复核采集结果 <span>{{ scanReviews.length }}</span></h2>
            <p class="tip">同一密探只显示最新待核结果，新采集会替换旧的待核内容。核对并保存后，点「已完成复核」消除该结果及更早的提醒；后续新结果仍会提示。</p>
            <p>{{ currentAccountName }} · 部分内容仍待确认，请点「查看并修改」对照游戏核对；已保存内容可在档案查看。</p>
            <p v-if="scanReviewError" role="alert">{{ scanReviewError }}</p>
            <ul>
              <li v-for="review in scanReviews" :key="review.record_id + ':' + review.operator_id">
                <span>{{ importOperatorName(review.operator_id) }} · {{ review.status === 'rejected' ? '采集未录入' : '需要复核' }}</span>
                <button type="button" :disabled="importing" @click="openScanReview(review)">查看并修改</button>
                <button type="button" :disabled="importing" @click="completeScanReview(review)">已完成复核</button>
              </li>
            </ul>
          </section>

          <!-- TABS：图鉴 / 当前养成 / 养成追踪 -->
          <ToolTaskPrompt v-if="operatorEntryState" class="operator-entry-guide" :title="operatorEntryTitle"
            :description="operatorEntryMessage" :error="operatorEntryState.endsWith('error')">
            <router-link v-if="operatorEntryState === 'logged-out'" class="btn primary" :to="{ path: '/login', query: { redirect: '/operator' } }">登录</router-link>
            <router-link v-else-if="operatorEntryState === 'no-account'" class="btn primary" to="/user/profile#game-accounts">创建或选择账号</router-link>
            <template v-else-if="operatorEntryState === 'empty' || operatorEntryState === 'unowned'">
              <router-link class="btn primary" :to="quickHref">开始录入密探</router-link>
              <router-link class="link" :to="quickSupplementHref">快速补录</router-link>
              <button class="link" type="button" @click="focusCatalogEntry">从图鉴补录一位密探</button>
            </template>
            <button v-else-if="operatorEntryState.endsWith('error')" class="btn primary" type="button" :disabled="accountsLoading || loading" @click="retryEntryData">重试</button>
            <button v-if="['logged-out', 'no-account'].includes(operatorEntryState)" class="link" type="button" @click="focusCatalogEntry">先浏览密探图鉴</button>
          </ToolTaskPrompt>
          <div
            v-show="!operatorEntryState || catalogEntryExpanded"
            class="operator-tabs tool-workspace-tabs"
            role="group"
            aria-label="密探工作区"
            data-tour="operator-workspace"
            v-reveal
          >
            <div class="workspace-tab-list" role="tablist" aria-label="密探视图" @keydown="onWorkspaceTabKeydown" @focusin="onWorkspaceTabFocus" @focusout="onWorkspaceTabFocus">
              <button
                type="button"
                class="operator-tab-button"
                role="tab"
                id="operator-tab-catalog"
                aria-controls="operator-panel-catalog"
                :tabindex="activeTab === 'catalog' ? 0 : -1"
                :aria-selected="activeTab === 'catalog'"
                :class="{ on: activeTab === 'catalog' }"
                @click="setTab('catalog')"
              >
                密探图鉴
              </button>
              <button
                type="button"
                class="operator-tab-button"
                role="tab"
                id="operator-tab-current"
                aria-controls="operator-panel-current"
                :tabindex="activeTab === 'current' ? 0 : -1"
                :aria-selected="activeTab === 'current'"
                :class="{ on: activeTab === 'current' }"
                @click="setTab('current')"
              >
                养成总览
              </button>
              <button class="operator-tab-button" type="button" role="tab" id="operator-tab-relationships" aria-controls="operator-panel-relationships"
                :tabindex="activeTab === 'relationships' ? 0 : -1" :aria-selected="activeTab === 'relationships'"
                :class="{ on: activeTab === 'relationships' }" @click="setTab('relationships')">信赖与传闻</button>
              <button
                v-if="growthTrackingEnabled"
                type="button"
                class="operator-tab-button"
                role="tab"
                id="operator-tab-tracking"
                aria-controls="operator-panel-tracking"
                :tabindex="activeTab === 'tracking' ? 0 : -1"
                :aria-selected="activeTab === 'tracking'"
                :class="{ on: activeTab === 'tracking' }"
                @click="openGrowthPlanningPreview"
              >
                养成规划
              </button>
            </div>
            <button v-if="!growthTrackingEnabled" type="button" class="operator-tab-button" aria-haspopup="dialog"
              @focus="$event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })"
              @click="openGrowthPlanningPreview">养成规划 · 即将上线</button>
          </div>

          <OperatorBoxViewer v-model:open="boxViewerOpen" />

          <OperatorShareManager
            v-model:open="shareModalOpen"
            :account-id="auth.isLoggedIn ? accountId : ''"
            :account-name="currentAccountName"
            :is-logged-in="auth.isLoggedIn"
            @share-change="operatorShare = $event"
          />

          <!-- JSON 数据交换保留原有入口，与分享弹窗独立。 -->
          <AccountWorkspace
            v-show="showArchive && !accountWorkspaceCompact"
            id="operator-account-workspace"
            tour-target="operator-workspace"
            class="operator-account-workspace"
            :class="{ 'is-compact': accountWorkspaceCompact, 'has-archive': showArchive }"
            v-model:compact="accountWorkspaceCompact"
            summary-label="JSON 数据交换"
            split
            :show-account-bar="false"
            :error="accountError"
          >
            <template #summary-actions>
              <router-link class="act-btn ghost workspace-mobile-link" :to="operatorEntryState ? quickHref : quickSupplementHref" @click="hideBackupImport">{{ operatorEntryState ? '首次/快捷录入' : '快速补录' }}</router-link>
            </template>
            <div v-if="showArchive" class="archive-workspace">
              <div class="archive-heading">
                <div>
                  <span class="section-kicker">数据交换</span>
                  <h2>JSON 备份导入/导出</h2>
                  <p>
                    导入或导出密探档案、分类设置备份。
                  </p>
                  <details>
                    <summary>备份范围与录入方式</summary>
                    <p>档案备份包含练度、状态、备注、关注和养成目标；分类设置可单独导出与恢复。手动补录请点「录入密探」，采集复核请从待复核列表进入。</p>
                  </details>
                </div>
                <span class="archive-format">JSON · 档案 / 分类</span>
              </div>
              <div class="archive-actions">
                <button
                  class="act-btn archive-import"
                  :disabled="!auth.isLoggedIn"
                  :aria-expanded="showImport"
                  @click="toggleImportPanel"
                >
                  <Upload :size="16" aria-hidden="true" />{{
                    selectedScanReview ? "JSON 备份导入" : showImport ? "收起导入" : "JSON 备份导入"
                  }}
                </button>
                <div class="export-group">
                  <div class="export-label">档案导出范围</div>
                  <div
                    class="export-options"
                    role="radiogroup"
                    aria-label="导出范围"
                  >
                    <label
                      class="export-option"
                      :class="{ active: !exportAll }"
                    >
                      <input
                        v-model="exportAll"
                        type="radio"
                        :value="false"
                        name="operator-export-scope"
                      />
                      <span
                        ><b>当前账号</b
                        ><small>{{ currentAccountName }}</small></span
                      >
                    </label>
                    <label
                      class="export-option"
                      :class="{
                        active: exportAll,
                        disabled: accounts.length < 2,
                      }"
                    >
                      <input
                        v-model="exportAll"
                        type="radio"
                        :value="true"
                        name="operator-export-scope"
                        :disabled="accounts.length < 2"
                      />
                      <span
                        ><b>全部账号</b
                        ><small>{{
                          accounts.length > 1
                            ? accounts.length + " 个账号"
                            : "至少需要 2 个账号"
                        }}</small></span
                      >
                    </label>
                  </div>
                  <button
                    class="act-btn export-submit"
                    :disabled="!auth.isLoggedIn || !accountId"
                    @click="doExport"
                  >
                    <Download :size="16" aria-hidden="true" />导出密探档案
                  </button>
                  <button class="act-btn organization-export" :disabled="!auth.isLoggedIn || !accountId || !organizationReady" @click="exportOrganizationBackup">
                    <Download :size="16" aria-hidden="true" />导出当前账号分类
                  </button>
                  <small class="tip organization-export-tip">分类仅包含当前账号已保存的置顶、分组顺序和标签，不含编辑草稿。</small>
                </div>
              </div>
            </div>
          </AccountWorkspace>

          <!-- 导入档案 -->
          <div v-if="showImport" class="import-box" v-reveal>
            <OperatorScanReviewForm v-if="selectedScanReview" :key="selectedScanReview.account_id + ':' + selectedScanReview.record_id + ':' + selectedScanReview.operator_id"
              ref="scanReviewForm" class="scan-review-context" :review="selectedScanReview" :catalog="catalogMap[selectedScanReview.operator_id] || {}"
              :account-name="currentAccountName" :current="scanReviewCurrent" :current-loading="scanReviewCurrentLoading" :current-error="scanReviewCurrentError" :busy="importing"
              @change="onScanReviewChange" @preview="previewV3Import" @close="closeScanReview" @dismiss="closeSelectedScanReview" @readback="readScanReviewCurrent" />
            <div v-if="!selectedScanReview" class="backup-import">
            <h2>JSON 备份导入</h2>
            <p id="operator-import-tip" class="tip">
              支持密探档案和分类设置 JSON，自动识别文件类型。导入均先校验并预览，确认后才写入当前账号；分类恢复只替换置顶、分组顺序和标签。
            </p>
            <div class="import-target">
              <span>导入目标</span><strong>{{ currentAccountName }}</strong
              ><small v-if="isOrganizationImport">已识别分类设置备份</small
              ><small v-else-if="importDocumentVersion"
                >已识别 v{{ importDocumentVersion }}</small
              >
            </div>
            <textarea
              id="operator-import-json"
              v-model="importText"
              :disabled="importing"
              aria-label="密探档案或分类设置 JSON"
              :aria-invalid="!!importError"
              :aria-describedby="
                importError
                  ? 'operator-import-tip operator-import-error'
                  : 'operator-import-tip'
              "
              autocomplete="off"
              placeholder='{"format":"myshare-operator-exchange","version":3,"accounts":[{"id":"scan_local","name":"采集账号"}],"records":[]}'
              @input="onImportTextInput"
            ></textarea>
            <p
              v-if="importError"
              id="operator-import-error"
              class="import-error"
              role="alert"
            >
              {{ importError }}
            </p>
            <div class="import-actions">
              <label class="btn ghost file-label">
                选择 JSON 文件
                <input
                  type="file"
                  :disabled="importing"
                  accept=".json,application/json"
                  @change="onFilePick"
                />
              </label>
              <button class="btn ghost" type="button" :disabled="importing" @click="fillExample">
                填入 v3 示例
              </button>
              <button
                v-if="isOrganizationImport"
                class="btn primary" type="button" :disabled="importing || !organizationReady || !accountId" @click="previewOrganizationImport"
              >校验并预览分类</button>
              <button
                v-else-if="[3, 4, 5].includes(importDocumentVersion)"
                class="btn primary"
                type="button"
                :disabled="importing || !importText.trim() || !accountId"
                @click="previewV3Import"
              >
                {{
                  importing
                    ? "校验中…"
                    : importPreview
                      ? "重新预览"
                      : "校验并预览"
                }}
              </button>
              <button
                v-else
                class="btn primary"
                type="button"
                :disabled="importing || !importText.trim()"
                @click="previewV2Import"
              >
                {{ importing ? "校验中…" : "校验并预览 v2" }}
              </button>
            </div>
            </div>
            <p v-if="scanReviewSavedMessage" class="tip" role="status">{{ scanReviewSavedMessage }}</p>
            <p v-if="selectedScanReview && importError" ref="scanReviewErrorEl" class="import-error" role="alert" tabindex="-1">{{ importError }}</p>
            <details v-if="importRequestIssue" class="import-technical"><summary>本次请求的技术详情</summary><pre>{{ JSON.stringify(importRequestIssue, null, 2) }}</pre></details>
            <section v-if="organizationImportPreview" class="import-preview organization-import-preview" aria-live="polite" aria-label="分类恢复预览">
              <div class="import-preview-head">
                <div><strong>分类恢复预览 · {{ currentAccountName }}</strong>
                  <span>{{ organizationImportPreview.content.pinned_ids.length }} 位置顶 · {{ organizationImportPreview.content.tags.length }} 个标签</span>
                </div>
                <button class="btn primary" type="button" :disabled="importing || !organizationReady || organizationData.revision !== organizationImportPreview.revision" @click="commitOrganizationImport">{{ importing ? '恢复中…' : '确认恢复分类' }}</button>
              </div>
              <p class="import-preview-warning">将替换当前账号已保存的置顶、分组顺序和全部标签。密探练度、养成状态和特别关注保持不变。</p>
              <p v-if="organizationData.revision !== organizationImportPreview.revision" class="import-preview-warning" role="alert">当前分类已有更新，请重新校验并预览后再恢复。</p>
              <p class="tip">分组顺序：{{ organizationImportPreview.content.status_order.filter(state => discardedEnabled || state !== 'discarded').map(operatorAnnotationStatusLabel).join(' → ') }}</p>
              <p v-if="organizationImportPreview.content.tags.length" class="tip">标签：{{ organizationImportPreview.content.tags.map(tag => tag.name).join('、') }}</p>
            </section>
            <p v-if="organizationImportMessage" class="tip" role="status">{{ organizationImportMessage }}</p>
            <p v-if="isOrganizationImport && organizationError" class="import-error" role="alert">{{ organizationError }} <button type="button" class="btn ghost" :disabled="organizationLoading || organizationSaving" @click="reloadOrganization">重新读取分类</button></p>
            <section v-if="importV2Preview" class="import-preview" aria-live="polite" aria-label="v2 导入预览">
              <div class="import-preview-head">
                <div>
                  <strong>v2 导入预览 · {{ currentAccountName }}</strong>
                  <span>{{ importV2Preview.recordCount }} 条记录 · 涉及 {{ importV2Preview.entries.length }} 位密探 · 当前已有 {{ importV2Preview.overlapCount }} 位</span>
                </div>
                <button class="btn primary" type="button" :disabled="importing" @click="commitV2Import">{{ importing ? '导入中…' : '确认导入 v2' }}</button>
              </div>
              <p v-if="importV2Preview.fullCount" class="import-preview-warning" role="alert">
                包含 {{ importV2Preview.fullCount }} 条全量快照；当前账号中有 {{ importV2Preview.possibleRemovedCount }} 位密探未列在档案中，可能被覆盖移除。请先导出备份。
              </p>
              <p class="tip">此处为本地影响范围预览；最终校验与实际写入结果以服务器为准。</p>
              <details><summary>查看涉及密探</summary><ul><li v-for="entry in importV2Preview.entries" :key="entry.id">{{ entry.name }} · {{ entry.id }}</li></ul></details>
            </section>
            <section
              v-if="v3Receipt"
              class="import-preview"
              aria-live="polite"
              :aria-label="importPreview ? 'v3 导入预览' : '逐项保存回执'"
            >
              <div class="import-preview-head">
                <div>
                  <strong>{{ importPreview ? '预览影响 · 尚未保存' : '服务器保存回执' }}</strong>
                  <span
                    >{{ importPreview ? '可完整写入' : '完整写入' }} {{ v3Receipt.accepted }} ·
                    {{ importPreview ? '可部分写入' : '部分写入' }} {{ v3Receipt.partial }} ·
                    待复核 {{ v3Receipt.review }} · 拒绝
                    {{ v3Receipt.rejected }} · 无变化
                    {{ v3Receipt.unchanged }}</span
                  >
                </div>
                <button
                  class="btn primary"
                  v-if="importPreview"
                  type="button"
                  :disabled="importing || !canCommitV3Import"
                  @click="commitV3Import"
                >
                  {{ importing ? "保存中…" : "确认保存" }}
                </button>
              </div>
              <p v-if="selectedScanReview && importPreview?.unchanged && canCommitV3Import" class="tip">与现值一致也可确认复核，无需修改成其他数值。</p>
              <label v-if="importPreview && importPreview.review && !selectedScanReview" class="import-review-confirm">
                <input
                  v-model="importConfirmReview"
                  type="checkbox"
                  :disabled="importing"
                  @change="onImportReviewChange"
                />
                <span>确认写入需要人工复核的分区；勾选后请重新预览</span>
              </label>
              <p v-if="v3Receipt.rejected" class="import-preview-warning">
                被拒绝的密探不会写入，其余可接受条目仍可继续导入。
              </p>
              <div class="import-preview-list">
                <details
                  v-for="(item, index) in v3Receipt.items"
                  :key="item.recordId + ':' + item.operatorId + ':' + index"
                  class="import-preview-item"
                  :open="['rejected', 'review', 'partial'].includes(item.status) || !importPreview"
                >
                  <summary>
                    <span class="import-status" :class="'is-' + item.status">{{
                      importStatusLabel(item.status)
                    }}</span>
                    <strong>{{ importOperatorName(item.operatorId) }}</strong>
                    <small
                      >{{ Object.keys(item.changes).length }} 项变化<template
                        v-if="item.stale"
                      >
                        · 观测将过期</template
                      ></small
                    >
                  </summary>
                  <dl
                    v-if="Object.keys(item.changes).length"
                    class="import-change-list"
                  >
                    <div v-for="(change, field) in item.changes" :key="field">
                      <dt>{{ importFieldLabel(field) }}</dt>
                      <dd>
                        {{ importValueLabel(change.before, field, item.operatorId) }} →
                        {{ importValueLabel(change.after, field, item.operatorId) }}
                      </dd>
                    </div>
                  </dl>
                  <ul
                    v-if="item.blockingErrors.length || item.warnings.length"
                    class="import-issue-list"
                  >
                    <li
                      v-for="(issue, issueIndex) in item.blockingErrors"
                      :key="'error:' + issueIndex"
                      class="error"
                    >
                      {{ operatorReviewIssueText(issue) }}
                      <a v-if="selectedScanReview && scanReviewForm?.hasField(operatorReviewField(issue))" :href="'#scan-review-field-' + operatorReviewField(issue)" @click.prevent="scanReviewForm?.focusField(operatorReviewField(issue))">定位{{ operatorReviewFieldLabel(issue.field || issue.field_path || issue.fieldPath) }}</a>
                    </li>
                    <li
                      v-for="(issue, issueIndex) in item.warnings"
                      :key="'warning:' + issueIndex"
                    >
                      {{ operatorReviewIssueText(issue) }}
                    </li>
                  </ul>
                  <details class="import-technical"><summary>技术详情</summary><pre>{{ JSON.stringify(item, null, 2) }}</pre></details>
                </details>
              </div>
              <p v-if="!v3Receipt.items.length" class="import-preview-warning">暂时无法确认每项是否保存。请重新读取当前档案核对，复核提醒会继续保留。</p>
            </section>
            <div
              v-if="importResult && importResult.kind === 'v2'"
              class="import-result"
            >
              导入完成：接受 {{ importResult.accepted }} 条 · 重复
              {{ importResult.duplicates }} 条
              <span v-if="importResult.superseded">
                · 已归档 {{ importResult.superseded }} 条</span
              >
              <span
                v-if="importResult.warnings && importResult.warnings.length"
              >
                · 警告 {{ importResult.warnings.length }} 条</span
              >
              <button class="ok" @click="afterImport">刷新养成</button>
            </div>
            <div
              v-else-if="importResult && importResult.kind === 'v3'"
              class="import-result"
              role="status"
            >
              {{ importResult.accepted || importResult.partial ? '已收到保存回执，请核对上方逐项结果。' : importResult.unchanged ? '已收到无变化回执，档案未改写；请核对上方逐项结果。' : '本次没有新的完整写入，请核对上方原因。' }}
              <button class="ok" @click="afterImport">{{ importing ? '处理中…' : '查看养成总览' }}</button>
            </div>
          </div>

          <!-- 图鉴（全量目录：默认全部显示，登录后叠加云端养成） -->
          <div
            id="operator-panel-catalog"
            role="tabpanel"
            aria-labelledby="operator-tab-catalog"
            tabindex="0"
            v-show="activeTab === 'catalog' && (!operatorEntryState || catalogEntryExpanded)"
            class="panel"
            :class="{ 'is-active': activeTab === 'catalog' }"
          >
            <div class="catalog-tools">
              <OperatorFilterDossier
                ref="catalogFilters"
                compact
                searchable
                context-label="密探图鉴"
                status-label="招募状态"
                :search-query="manifestSearch"
                @update:search-query="manifestSearch = $event.trim()"
                :result-count="manifestEntries.length"
                :total-count="statsEntries.length"
                :rarity-options="rarityOptions"
                :prof-options="profOptions"
                :sub-prof-options="subProfOptions"
                :status-options="manifestStatusOptions"
                :status-counts="{ owned: manifestOwned, missing: manifestMissing }"
                v-model:rarity-filter="rarityFilter"
                v-model:prof-filter="profFilter"
                v-model:sub-prof-filter="subProfFilter"
                v-model:status-filter="manifestFilter"
                :prof-icon="profIcon"
                :has-filters="hasManifestFilters"
                :advanced-filter-count="manifestAdvancedFilterCount"
                v-model:growth-filters="manifestGrowthFilters"
                show-growth-filters
                @reset="focusCatalogEntry"
              >
                <template #primary-tool>
                  <router-link v-if="!operatorEntryState" class="btn primary catalog-entry" :to="quickSupplementHref" @click="hideBackupImport"><Plus :size="16" aria-hidden="true" /> 录入密探</router-link>
                </template>
                <template #extra-filters>
                  <label class="catalog-version-copy">目录版本 <input class="catalog-version-value" type="text" readonly
                    :value="catalogVersion || '本地兜底'" :title="catalogVersion || '本地兜底'"
                    aria-label="目录版本，可选中复制" @focus="$event.target.select()" /></label>
                </template>
              </OperatorFilterDossier>
            </div>

            <div v-if="catalogLoading" class="state">正在加载密探图鉴…</div>
            <div
              v-else-if="catalogError && !catalogOperators.length"
              class="state err"
            >
              {{ catalogError
              }}<button class="link" @click="loadCatalog">重试</button>
            </div>
            <div v-else class="backpack catalog-portrait-grid" v-reveal>
              <div v-if="hasManifestFilters || !auth.isLoggedIn || error || favoriteError" class="bp-head">
                <span class="bp-tip">
                  <template v-if="rarityFilter !== 'all'">
                    · 品质「{{ rarityLabelMap[rarityFilter] || rarityFilter }}」</template
                  >
                  <template v-if="profFilter !== 'all'">
                    · 属性「{{ profFilter }}」</template
                  >
                  <template v-if="subProfFilter !== 'all'">
                    · 职业「{{ subProfFilter }}」</template
                  >
                  <template v-if="hasManifestFilters">
                    · 筛选出
                    <b class="bp-num">{{ manifestEntries.length }}</b> 位密探</template
                  >
                  <template v-if="!auth.isLoggedIn">
                    · 未登录：仅展示图鉴，不显示云端养成</template
                  >
                </span>
                <span class="sp"></span>
                <span v-if="error" class="bp-tip mf-warn"
                  >云端养成同步失败：{{ error }} <button type="button" class="link" :disabled="loading" @click="reloadCurrent()">重试同步</button></span
                >
                <span v-else-if="favoriteError" class="bp-tip mf-warn">{{
                  favoriteError
                }}</span>
              </div>
              <ToolTaskPrompt v-if="manifestEntries.length === 0" title="没有符合条件的密探" :description="'没有匹配' + filterSuffix + '的密探，试试其他名称或清除筛选。'">
                <button type="button" class="btn ghost" @click="focusCatalogEntry">清除筛选</button>
              </ToolTaskPrompt>
              <ul v-else class="slot-grid">
                <li
                  v-for="e in manifestEntries"
                  :key="e.id"
                  :ref="(el) => setOperatorSlotElement(e.id, el)"
                  class="slot"
                  :class="[
                    {
                      'is-missing': !e.owned,
                      'is-favorite': favoriteAgentIds.has(e.id),
                      'is-scan-new': scanEffectById[e.id] === 'new',
                      'is-scan-updated': scanEffectById[e.id] === 'updated',
                      'is-fazheng': e.id === 'char_108_fazheng',
                      'is-chendeng-sp': e.id === 'char_084_chendengsp',
                      'is-shizimiao-sp': e.id === 'char_085_shizimiaosp',
                    },
                    'rarity-r' + (e.rarity || 3),
                  ]"
                  :title="slotTitle(e)"
                >
                  <div class="slot-ic is-agent">
                    <img
                      v-if="e.avatar"
                      class="slot-avatar"
                      :src="avatarUrl(e.avatar)"
                      :alt="e.name"
                      loading="lazy"
                    />
                    <div v-else class="slot-ph">
                      <span class="ph-seal">密</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <template v-if="e.id === 'char_085_shizimiaosp'">
                      <span
                        class="operator-rune-layer rune-ring-outer"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-rune-layer rune-ring-inner"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-rune-layer rune-glyphs"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-rune-layer rune-ripple-one"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-rune-layer rune-ripple-two"
                        aria-hidden="true"
                      ></span>
                    </template>
                    <template v-if="e.id === 'char_084_chendengsp'">
                      <span
                        class="operator-seed-layer seed-ring seed-ring-one"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-ring seed-ring-two"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-ring seed-ring-three"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-grain seed-grain-one"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-grain seed-grain-two"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-grain seed-grain-three"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-grain seed-grain-four"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-grain seed-grain-five"
                        aria-hidden="true"
                      ></span>
                      <span
                        class="operator-seed-layer seed-grain seed-grain-six"
                        aria-hidden="true"
                      ></span>
                    </template>
                    <span class="slot-count" :class="{ zero: !e.owned }">{{
                      e.owned ? "Lv" + e.level : "未养"
                    }}</span>
                    <span
                      v-if="profIcon(e.prof)"
                      class="prof-badge"
                      :title="'属性：' + (e.prof || '未知')"
                      role="img"
                      :aria-label="'属性：' + (e.prof || '未知')"
                    >
                      <img :src="profIcon(e.prof)" alt="" aria-hidden="true" />
                    </span>
                    <button
                      v-if="auth.isLoggedIn && accountId"
                      class="favorite-btn"
                      :class="{
                        on: favoriteAgentIds.has(e.id),
                        busy: favoriteBusyIds.has(e.id),
                      }"
                      type="button"
                      :aria-label="
                        favoriteAgentIds.has(e.id)
                          ? '取消特别关注' + (e.name || e.id)
                          : '特别关注' + (e.name || e.id)
                      "
                      :aria-pressed="favoriteAgentIds.has(e.id)"
                      :aria-busy="favoriteBusyIds.has(e.id)"
                      :disabled="favoriteBusyIds.has(e.id) || favoriteLoading"
                      :title="
                        favoriteAgentIds.has(e.id) ? '取消特别关注' : '特别关注'
                      "
                      @click.stop="toggleAgentFavorite(e)"
                    >
                      <Star
                        :size="16"
                        :fill="
                          favoriteAgentIds.has(e.id) ? 'currentColor' : 'none'
                        "
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      v-if="auth.isLoggedIn && accountId"
                      class="edit-icon-btn"
                      type="button"
                      :aria-label="'编辑' + (e.name || e.id)"
                      title="编辑养成"
                      @click.stop="openEdit(e.id)"
                    >
                      <Pencil :size="15" aria-hidden="true" />
                    </button>
                  </div>
                  <span class="slot-name">{{ e.name || e.id }}</span>
                  <!-- 暂时隐藏漆园蝶完成状态
                  <div v-if="oddityCompletions[e.id]" class="slot-oddity-completion">
                    <span class="oddity-completion-badge" :class="'is-' + oddityCompletions[e.id].status">
                      <Sparkles aria-hidden="true" />{{ oddityCompletions[e.id].compactLabel }}
                    </span>
                    <small v-if="oddityCompletions[e.id].reason" class="oddity-completion-reason">{{ oddityCompletions[e.id].reason }}</small>
                  </div>
                  -->
                </li>
              </ul>
            </div>
          </div>

          <!-- Keep inactive panel targets available without mounting their business content. -->
          <div v-if="!visitedTabs.has('current')" id="operator-panel-current" role="tabpanel" aria-labelledby="operator-tab-current" hidden></div>
          <div v-if="growthTrackingEnabled && !visitedTabs.has('tracking')" id="operator-panel-tracking" role="tabpanel" aria-labelledby="operator-tab-tracking" hidden></div>

          <!-- 当前养成 -->
          <div
            v-if="visitedTabs.has('current')"
            id="operator-panel-current"
            role="tabpanel"
            aria-labelledby="operator-tab-current"
            tabindex="0"
            v-show="activeTab === 'current' && (!operatorEntryState || catalogEntryExpanded)"
            class="panel"
            :class="{ 'is-active': activeTab === 'current' }"
          >
            <div v-if="ownedCurrentEntries.length" class="current-workbench-summary">
              <div class="tool-summary current-status-summary" aria-label="当前养成状态概览">
                <span>养成中 <b>{{ currentStatusCounts.growing }}</b></span>
                <span>已毕业 <b>{{ currentStatusCounts.graduated }}</b></span>
                <span>养老中 <b>{{ currentStatusCounts.inactive }}</b></span>
                <span v-if="discardedEnabled" class="status-discarded">已弃置 <b>{{ currentStatusCounts.discarded }}</b></span>
              </div>
            </div>

            <div
              v-if="
                growthReadyCount > 0 ||
                huajiReadyCount > 0 ||
                upgradeReadyFilter
              "
              class="current-upgrade-reminders"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div
                v-if="growthReadyCount > 0 || upgradeReadyFilter === 'growth'"
                class="current-upgrade-reminder"
                :class="{ 'is-filtering': upgradeReadyFilter === 'growth' }"
              >
                <span class="current-upgrade-reminder-icon" aria-hidden="true"
                  ><ChevronUp :size="18" stroke-width="2.4"
                /></span>
                <span class="current-upgrade-reminder-copy">
                  <strong v-if="growthReadyCount > 0"
                    >有
                    {{ growthReadyCount }} 位养成中密探可提升等级或修为</strong
                  >
                  <strong v-else>当前没有养成中密探可提升等级或修为</strong>
                  <small>{{
                    growthReadyCount > 0
                      ? growthReadySummary
                      : "库存或养成状态已经变化，可以返回查看全部卡片。"
                  }}</small>
                </span>
                <button
                  type="button"
                  :class="{ on: upgradeReadyFilter === 'growth' }"
                  :aria-pressed="upgradeReadyFilter === 'growth'"
                  :aria-label="upgradeReadyFilter === 'growth' ? '显示全部' : '只看可提升等级/修为'"
                  :title="upgradeReadyFilter === 'growth' ? '显示全部' : '只看可提升等级/修为'"
                  @click="toggleUpgradeReadyFilter('growth')"
                >
                  <Eye class="upgrade-filter-icon" :size="18" aria-hidden="true" />
                  <span class="upgrade-filter-label">{{
                    upgradeReadyFilter === "growth"
                      ? "显示全部"
                      : "只看可提升等级/修为"
                  }}</span>
                </button>
              </div>
              <div
                v-if="huajiReadyCount > 0 || upgradeReadyFilter === 'huaji'"
                class="current-upgrade-reminder is-huaji"
                :class="{ 'is-filtering': upgradeReadyFilter === 'huaji' }"
              >
                <span class="current-upgrade-reminder-icon" aria-hidden="true"
                  ><Target :size="18" stroke-width="2.2"
                /></span>
                <span class="current-upgrade-reminder-copy">
                  <strong v-if="huajiReadyCount > 0"
                    >有 {{ huajiReadyCount }} 位密探可提升化极</strong
                  >
                  <strong v-else>当前没有密探可提升化极</strong>
                  <small v-if="huajiReadyCount > 0"
                    >点击卡片「化极」右侧的「提升」，确认后扣除库存；手动编辑不扣库存。<template
                      v-if="favoriteHuajiNames.length"
                      ><br /><b
                        >包括特别关注对象：{{
                          favoriteHuajiNames.join("、")
                        }}</b
                      ></template
                    ></small
                  >
                  <small v-else
                    >库存或密探状态已经变化，可以返回查看全部卡片。</small
                  >
                </span>
                <button
                  type="button"
                  :class="{ on: upgradeReadyFilter === 'huaji' }"
                  :aria-pressed="upgradeReadyFilter === 'huaji'"
                  :aria-label="upgradeReadyFilter === 'huaji' ? '显示全部' : '只看可化极'"
                  :title="upgradeReadyFilter === 'huaji' ? '显示全部' : '只看可化极'"
                  @click="toggleUpgradeReadyFilter('huaji')"
                >
                  <Eye class="upgrade-filter-icon" :size="18" aria-hidden="true" />
                  <span class="upgrade-filter-label">{{
                    upgradeReadyFilter === "huaji" ? "显示全部" : "只看可化极"
                  }}</span>
                </button>
              </div>
            </div>

            <section v-if="orphanCurrentEntries.length" class="orphan-current" aria-label="已从公共图鉴删除的密探">
              <p>这些密探已不在图鉴中，原有养成记录仍保留。移除前请核对密探信息。</p>
              <ul>
                <li v-for="entry in orphanCurrentEntries" :key="entry.id">
                  <span><b>{{ entry.name || entry.id }}</b><small>Lv.{{ entry.level }} · 修为 {{ entry.elite }}<template v-if="entry.name"> · {{ entry.id }}</template></small></span>
                  <button type="button" class="btn ghost" :disabled="!!removingOrphanId || loading" @click="removeOrphanCurrent(entry)">{{ removingOrphanId === entry.id ? '移除中…' : '移除旧养成' }}</button>
                </li>
              </ul>
            </section>
            <p v-if="orphanNotice" class="state slim" role="status">{{ orphanNotice }}</p>

            <!-- 当前养成案卷筛选 -->
            <OperatorFilterDossier
              compact
              searchable
              v-model:search-query="currentSearch"
              :force-expanded="batchSelectMode"
              v-if="currentLoadedKey === accountId + ':' + gameFilter && (ownedCurrentEntries.length > 0 || (auth.isLoggedIn && accountId))"
              v-reveal
              :result-count="filteredCurrent.length"
              :total-count="ownedCurrentEntries.length"
              :rarity-options="rarityOptions"
              :prof-options="profOptions"
              :sub-prof-options="subProfOptions"
              :status-options="workbenchStatusOptions"
              :status-counts="currentStatusCounts"
              :tag-options="organizationTagOptions"
              v-model:tag-filter="organizationTagFilter"
              v-model:rarity-filter="rarityFilter"
              v-model:prof-filter="profFilter"
              v-model:sub-prof-filter="subProfFilter"
              :status-filter="workbenchStatusFilter"
              :prof-icon="profIcon"
              :has-filters="hasCurrentFilters"
              v-model:growth-filters="growthFilters"
              v-model:disc-status-filter="discStatusFilter"
              show-disc-filter
              show-growth-filters
              description="置顶优先，其余按分组与养成排序"
              @update:status-filter="setWorkbenchStatusFilter"
              @reset="resetCurrentFilters"
            >
              <template #primary-tool>
                <router-link class="btn primary" :to="quickSupplementHref" @click="hideBackupImport"><Plus :size="16" aria-hidden="true" /> 录入密探</router-link>
              </template>
              <template #secondary-tool>
                <button
                  class="current-favorite-sort"
                  :class="{ on: favoriteFirst }"
                  type="button"
                  :aria-pressed="favoriteFirst"
                  @click="setFavoriteFirst(!favoriteFirst)"
                >
                  <Star
                    :size="13"
                    :fill="favoriteFirst ? 'currentColor' : 'none'"
                    aria-hidden="true"
                  />特别关注优先
                </button>
                <button v-if="auth.isLoggedIn" type="button" class="current-batch-toggle current-organization-toggle"
                  :class="{ on: organizationManager?.open }" :aria-expanded="Boolean(organizationManager?.open)" :aria-controls="organizationManager?.panelId"
                  @click="organizationManager?.toggle()"><SlidersHorizontal :size="13" aria-hidden="true" />分类设置<span v-if="organizationSaving" role="status"> · 保存中</span><span v-else-if="organizationDirty" role="status"> · 未保存</span></button>
                <button
                  v-if="auth.isLoggedIn"
                  class="current-batch-toggle"
                  :class="{ on: batchSelectMode }"
                  type="button"
                  :aria-pressed="batchSelectMode"
                  title="批量标注养成状态"
                  @click="toggleBatchSelectMode"
                >
                  <ListChecks :size="13" aria-hidden="true" /><span
                    class="current-batch-label"
                    >{{ batchSelectMode ? "退出批量" : "批量标注" }}</span
                  >
                </button>
              </template>
              <template #footer>
                <OperatorOrganizationManager
                  ref="organizationManager"
                  v-if="auth.isLoggedIn && accountId" :key="accountId + ':' + gameFilter"
                  :value="organizationData" :account-id="accountId" :game="gameFilter" :catalog="catalogMap"
                  :ready="organizationReady" :loading="organizationLoading" :saving="organizationSaving" :error="organizationError"
                  :discarded-enabled="discardedEnabled" :selected-ids="Array.from(batchSelectedIds)"
                  :save="saveOrganization" :reload="reloadOrganization"
                />
                <div
                  v-if="batchSelectMode"
                  class="batch-status-bar"
                  aria-label="批量设置养成状态"
                >
                <label
                  class="batch-select-all"
                  :class="{
                    disabled:
                      !filteredCurrent.length || annotationBusyIds.size > 0,
                  }"
                >
                  <input
                    type="checkbox"
                    :checked="batchAllSelected"
                    :indeterminate="batchIndeterminate"
                    :disabled="
                      !filteredCurrent.length || annotationBusyIds.size > 0
                    "
                    @change="batchToggleAll"
                  />
                  <span>全选当前结果</span>
                </label>
                <span class="batch-selected-count"
                  >已选 <b>{{ batchSelectedCount }}</b> 位</span
                >
                <div class="batch-status-actions">
                  <button
                    v-for="option in editableStatusOptions"
                    :key="option.value"
                    type="button"
                    :class="['batch-status-action', option.value]"
                    :disabled="!batchSelectedCount || annotationBusyIds.size > 0 || batchStatusBusy"
                    @click="batchSetStatus(option.value)"
                  >
                    {{ workbenchStatusFilter === 'discarded' && option.value !== 'discarded' ? '恢复为' : '设为' }}{{ option.label }}
                  </button>
                  <button
                    v-if="batchSelectedCount"
                    type="button"
                    class="batch-clear"
                    :disabled="annotationBusyIds.size > 0"
                    @click="clearBatchSelected"
                  >
                    清空
                  </button>
                </div>
                </div>
              </template>
            </OperatorFilterDossier>

            <div v-if="annotationUnsupportedStates.length" class="state err slim" role="alert">
              存在不支持的养成状态（{{ annotationUnsupportedStates.join('、') }}），请刷新到最新版本；可在“{{ discardedEnabled ? '全部（含已弃置）' : '全部' }}”查看。
            </div>
            <div v-if="annotationNotice" class="state slim" role="status" aria-live="polite">
              {{ annotationNotice }}
              <button v-if="annotationNoticeTarget" type="button" class="link" @click="viewAnnotationNoticeGroup">查看{{ statusLabel(annotationNoticeTarget) }}</button>
            </div>
            <div v-if="annotationError" class="state err slim" role="alert">
              {{ annotationError }}
            </div>
            <div v-if="panelBatchState.status === 'failed'" class="state err slim" role="status">
              自动面板暂未加载。
              <button type="button" class="link" @click="panelBatchRequest.retry()">重试计算</button>
            </div>
            <div v-if="loading" class="state">正在加载养成状态…</div>
            <div v-else-if="error" class="state err">
              {{ error }}
              <button v-if="!auth.isLoggedIn" class="link" @click="goLogin">
                请先登录后重试
              </button>
              <button v-else class="link" type="button" :disabled="loading" @click="reloadCurrent()">重试加载</button>
            </div>
            <div v-else-if="ownedCurrentEntries.length === 0" class="state">
              <template v-if="!auth.isLoggedIn"
                >尚未登录：仅可浏览图鉴 ·
                <router-link class="link" to="/login"
                  >登录后同步实际养成</router-link
                ></template
              >
              <template v-else-if="currentEntries.length === 0"
                >暂无已招募的密探养成记录 ·
                <router-link class="link" :to="quickHref"
                  >前往首次 / 快捷录入</router-link
                ></template
              >
              <template v-else
                >当前记录中的密探均为未拥有 ·
                <button class="link" type="button" @click="setTab('catalog')">
                  前往图鉴设置
                </button></template
              >
            </div>
            <div v-else class="current-ledger" v-reveal>
              <div class="current-ledger-meta">
                <span>{{ currentFilterSuffix }}</span>
                <span>{{
                  ledgerCardIsV2
                    ? "快捷提升扣库存；卡片编辑、完整编辑不扣库存"
                    : "快捷提升扣库存；手动校正、完整编辑不扣库存"
                }}</span>
              </div>
              <div v-if="filteredCurrent.length === 0" class="state slim">
                没有匹配{{ currentFilterSuffix }}的已招募密探
                <button type="button" class="link" @click="resetCurrentFilters">{{ discardedEnabled ? '清除筛选，返回在册' : '清除筛选' }}</button>
              </div>
              <div v-else class="agent-ledger-grid" role="list">
                <article
                  v-for="e in filteredCurrent"
                  :key="e.id"
                  :ref="(element) => setCurrentLedgerCardElement(e.id, element)"
                  class="agent-ledger-card agent-ledger-card--editable"
                  :class="[
                    {
                      'is-batch-selected': batchSelectedIds.has(e.id),
                      'is-scan-new': scanEffectById[e.id] === 'new',
                      'is-scan-updated': scanEffectById[e.id] === 'updated',
                      'is-draft': cardHasDraft(e),
                      'is-submit-success': cardSubmitStates[e.id] === 'success',
                      'is-popover-open':
                        cardPopoverKey.indexOf(e.id + ':') === 0,
                    },
                    'rarity-r' + (e.rarity || 3),
                    'status-' + operatorStatus(e),
                    ledgerCardVersionClass,
                  ]"
                  :aria-busy="cardSubmitStates[e.id] === 'submitting' || annotationBusyIds.has(e.id)"
                  role="listitem"
                >
                  <picture
                    v-if="ledgerCardIsV3 && operatorPortraits[e.id] && !failedPortraitIds.has(e.id)"
                    class="ledger-portrait"
                    aria-hidden="true"
                  >
                    <img
                      v-batch-image.eager="operatorPortraits[e.id]"
                      alt=""
                      width="480"
                      height="350"
                      decoding="async"
                      @error="failedPortraitIds.add(e.id)"
                    />
                  </picture>
                  <header class="ledger-card-head">
                    <label
                      v-if="batchSelectMode"
                      class="ledger-batch-select"
                      :aria-label="
                        (batchSelectedIds.has(e.id) ? '取消选择' : '选择') +
                        (e.name || e.id)
                      "
                    >
                      <input
                        type="checkbox"
                        :checked="batchSelectedIds.has(e.id)"
                        :disabled="annotationBusyIds.has(e.id)"
                        @change="toggleBatchSelected(e.id, $event)"
                      />
                    </label>
                    <div class="ledger-name-tab">
                      <OperatorAvatar :avatar="avOf(e.id)" :name="e.name || e.id" :rarity="Number(e.rarity) || 3">
                        <button
                          class="ledger-favorite"
                          :class="{ on: favoriteAgentIds.has(e.id) }"
                          type="button"
                          :aria-label="
                            favoriteAgentIds.has(e.id)
                              ? '取消特别关注' + e.name
                              : '特别关注' + e.name
                          "
                          :aria-pressed="favoriteAgentIds.has(e.id)"
                          :disabled="favoriteBusyIds.has(e.id)"
                          @click="toggleAgentFavorite(e)"
                        >
                          <Star
                            :size="14"
                            :fill="
                              favoriteAgentIds.has(e.id) ? 'currentColor' : 'none'
                            "
                            aria-hidden="true"
                          />
                        </button>
                      </OperatorAvatar>
                      <h3
                        :class="{
                          'is-three-char-name': Array.from(e.name || e.id).length === 3,
                          'is-long-name': Array.from(e.name || e.id).length > 3,
                          'is-single-column-name': e.name === '史子眇·赴烛',
                        }"
                        :title="e.name || e.id"
                      ><template v-if="ledgerCardIsV3 && e.name === '陈登·黍王'">陈登·<span class="ledger-name-continuation ledger-name-continuation--natural">黍王</span></template><template v-else-if="ledgerCardIsV3 && e.name === '史子眇·赴烛'">史子眇·<span class="ledger-name-continuation">赴烛</span></template><template v-else>{{ e.name || e.id }}</template></h3>
                    </div>
                    <div class="ledger-identity">
                      <div class="ledger-name-row">
                        <h3 :title="e.name || e.id">{{ e.name || e.id }}</h3>
                        <span
                          v-if="ledgerCardIsV2"
                          class="ledger-prof-tab"
                          :class="{
                            'ledger-prof-tab--fuzhu': e.id === 'char_085_shizimiaosp',
                            'ledger-prof-tab--sp': Boolean(e.spOf),
                          }"
                        >
                          <img
                            v-if="profIcon(e.prof)"
                            :src="profIcon(e.prof)"
                            :alt="(e.prof || '未知') + '属性'"
                            :title="(e.prof || '未知') + '属性'"
                          />
                          <span v-if="firstSubProf(e)">{{ firstSubProf(e) }}</span>
                        </span>
                        <div v-if="ledgerCardIsV2" class="ledger-name-combat">
                          <span v-for="kind in ['attack', 'hp']" :key="kind">
                            <Swords v-if="kind === 'attack'" :size="12" aria-hidden="true" />
                            <Heart v-else :size="12" aria-hidden="true" />
                            <span class="sr-only">{{ kind === 'attack' ? '攻击' : '生命' }}</span>
                            <b>{{ cardCombatSimpleValue(e, kind) === '' ? '—' : cardCombatSimpleValue(e, kind) }}</b>
                          </span>
                        </div>
                        <span class="ledger-mobile-prof"
                          ><img
                            v-if="profIcon(e.prof)"
                            :src="profIcon(e.prof)"
                            alt=""
                            aria-hidden="true"
                          />{{ e.prof || "未知" }} ·
                          {{ firstSubProf(e) || "未标注职业" }}</span
                        >
                        <details
                          class="ledger-status-menu"
                          :class="'status-' + operatorStatus(e)"
                        >
                          <summary
                            class="ledger-status-button"
                            :aria-label="
                              e.name +
                              '养成状态：' +
                              statusLabel(operatorStatus(e))
                            "
                          >
                            <span>{{ annotationBusyIds.has(e.id) ? "保存中…" : statusLabel(operatorStatus(e)) }}</span>
                            <ChevronDown v-if="ledgerCardIsV2" class="ledger-status-chevron" :size="14" aria-hidden="true" />
                          </summary>
                          <div
                            class="ledger-status-options"
                            role="listbox"
                            :aria-label="e.name + '养成状态选项'"
                          >
                            <button
                              v-for="option in editableStatusOptions"
                              :key="option.value"
                              type="button"
                              role="option"
                              :aria-selected="operatorStatus(e) === option.value"
                              :disabled="annotationBusyIds.has(e.id)"
                              @click="setOperatorStatusAndClose(e, option.value, $event)"
                            >{{ option.label }}</button>
                            <small v-if="discardedEnabled" class="ledger-status-help">已弃置：移出日常养成，练度保留，可随时恢复</small>
                          </div>
                        </details>
                      </div>
                      <span class="ledger-prof"
                        ><span class="ledger-prof-copy"
                          ><img
                            v-if="profIcon(e.prof)"
                            :src="profIcon(e.prof)"
                            alt=""
                            aria-hidden="true"
                          />{{ e.prof || "未知" }} ·
                          {{ firstSubProf(e) || "未标注职业" }}</span
                        ><small
                          v-if="quickNotices[e.id]"
                          class="ledger-notice"
                          role="status"
                          >{{ quickNotices[e.id] }}</small
                        ></span
                      >
                    </div>
                  </header>

                  <OperatorOrganizationCard v-if="auth.isLoggedIn" :operator-id="e.id" :name="e.name || e.id"
                    :pinned="organizationRanks.pins.has(e.id)" :tags="organizationData.tags" :disabled="!organizationReady"
                    @pin="toggleOperatorPin(e.id)" @tag="(tagId, add) => setOperatorTag([e.id], tagId, add)" />

                  <!-- 暂时隐藏漆园蝶完成状态
                  <div v-if="oddityCompletions[e.id]" class="ledger-oddity-completion">
                    <span class="oddity-completion-badge" :class="'is-' + oddityCompletions[e.id].status">
                      <Sparkles aria-hidden="true" />{{ oddityCompletions[e.id].label }}
                    </span>
                    <small v-if="oddityCompletions[e.id].reason" class="oddity-completion-reason">{{ oddityCompletions[e.id].reason }}</small>
                  </div>
                  -->

                  <ShareCardStats
                    :enabled="ledgerCardIsV3 && compactStats"
                    :name="e.name || e.id"
                    editable
                    initial-growth
                    @change="cardPopoverKey = ''"
                  >
                    <template #combat>
                  <section
                    class="ledger-combat"
                    aria-label="战斗面板与奇闻属性"
                  >
                    <div
                      v-for="kind in ['attack', 'hp']"
                      :key="kind"
                      class="ledger-combat-stat"
                      :class="{
                        'is-manual':
                          !ledgerCardIsV2 &&
                          cardCombatMode(e, kind) === 'manual',
                        'is-stale':
                          !ledgerCardIsV2 &&
                          combatObservedStatus(e) === 'stale',
                        'is-saving': cardCombatSavingIds.has(e.id),
                      }"
                    >
                      <div class="ledger-combat-head">
                        <span
                          :aria-label="
                            ledgerCardIsV2
                              ? kind === 'attack'
                                ? '攻击'
                                : '生命'
                              : undefined
                          "
                          ><Swords
                            v-if="kind === 'attack'"
                            :size="12"
                            aria-hidden="true"
                          /><Heart v-else :size="12" aria-hidden="true" /><template
                            v-if="!ledgerCardIsV2"
                            >{{ kind === "attack" ? "攻击" : "生命" }}</template
                          ></span
                        >
                        <button
                          v-if="!ledgerCardIsV2"
                          class="ledger-combat-mode"
                          type="button"
                          :class="{
                            'is-auto': cardCombatMode(e, kind) === 'auto',
                            'is-manual': cardCombatMode(e, kind) === 'manual',
                            'is-disabled': !cardCombatModeSwitchAllowed(
                              e,
                              kind,
                            ),
                          }"
                          :aria-label="combatModeLabel(e, kind)"
                          :title="combatModeLabel(e, kind)"
                          :disabled="
                            !cardCombatModeSwitchAllowed(e, kind) ||
                            cardSubmitStates[e.id] === 'submitting'
                          "
                          @click="toggleCardCombatMode(e, kind)"
                        >
                          <Calculator
                            v-if="
                              cardCombatMode(e, kind) === 'auto' &&
                              cardCombatAutoAvailable(e, kind)
                            "
                            :size="12"
                            stroke-width="2.2"
                            aria-hidden="true"
                          />
                          <ScanLine
                            v-else
                            :size="12"
                            stroke-width="2.2"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      <input
                        class="ledger-combat-value"
                        type="number"
                        min="0"
                        :value="
                          ledgerCardIsV2
                            ? cardCombatSimpleValue(e, kind)
                            : cardCombatInputValue(e, kind)
                        "
                        :placeholder="
                          ledgerCardIsV2 ? '—' : cardCombatDisplay(e, kind)
                        "
                        :aria-label="
                          e.name + (kind === 'attack' ? '攻击力' : '生命力')
                        "
                        :disabled="cardSubmitStates[e.id] === 'submitting'"
                        @input="setCardCombatValue(e, kind, $event)"
                      />
                      <small
                        v-if="!ledgerCardIsV2"
                        class="ledger-combat-source"
                        >{{
                        cardSubmitStates[e.id] === "submitting"
                          ? "保存中…"
                          : cardCombatSource(e, kind)
                      }}</small
                      >
                      <label class="ledger-oddity"
                        :class="{ 'is-full': cardOddityMax(e, kind) > 0 && cardOddityValue(e, kind) >= cardOddityMax(e, kind) }"
                        ><Sparkles class="ledger-oddity-icon" aria-hidden="true" /><input
                          type="number"
                          inputmode="numeric"
                          step="1"
                          min="0"
                          :max="
                            cardOddityMax(e, kind) === ''
                              ? undefined
                              : cardOddityMax(e, kind)
                          "
                          :value="cardOddityValue(e, kind)"
                          :placeholder="cardOddityMax(e, kind)"
                          :aria-label="
                            e.name +
                            (kind === 'attack'
                              ? '奇闻属性攻击力'
                              : '奇闻属性生命值')
                          "
                          :disabled="cardSubmitStates[e.id] === 'submitting'"
                          @input="setCardOddityValue(e, kind, $event)"
                        /><span
                          >{{ ledgerCardIsV3 && compactStats ? "最大 " : "/ " }}{{ cardOddityMax(e, kind) || "—" }}</span
                        ></label
                      >
                    </div>
                  </section>

                    </template>
                    <template #growth>
                  <section class="ledger-growth" aria-label="核心养成">
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">等级</span>
                      <label class="ledger-inline-field" title="等级"
                        ><span class="sr-only">等级</span
                        ><input
                          class="ledger-editable ledger-inline-input"
                          type="number"
                          min="0"
                          max="100"
                          :value="cardGrowthValue(e, 'level')"
                          :disabled="cardSubmitStates[e.id] === 'submitting'"
                          aria-label="等级"
                          @input="setGrowthInput(e, 'level', $event)"
                      /></label>
                      <div class="ledger-step-actions">
                        <button
                          v-if="cardGrowthValue(e, 'level') < 100"
                          type="button"
                          class="ledger-popover-trigger"
                          :class="growthActionClass(e, 'level', 5)"
                          :disabled="cardSubmitStates[e.id] === 'submitting'"
                          :aria-label="
                            ledgerCardIsV2
                              ? '等级：' +
                                growthActionLabel(e, 'level', 5, '提升 5 级')
                              : undefined
                          "
                          :title="
                            ledgerCardIsV2
                              ? '等级：' +
                                growthActionLabel(e, 'level', 5, '提升 5 级')
                              : undefined
                          "
                          @click="openGrowthAction(e, 'level', 5)"
                        >
                          <template v-if="ledgerCardIsV2"
                            ><CircleAlert
                              v-if="!growthMaterialsReady(e, 'level', 5)"
                              :size="14"
                              aria-hidden="true"
                            /><ChevronUp
                              v-else
                              :size="15"
                              aria-hidden="true"
                            /><span class="sr-only">{{
                              growthActionLabel(e, "level", 5, "提升 5 级")
                            }}</span></template
                          ><template v-else>{{
                            growthActionLabel(e, "level", 5, "可 +5")
                          }}</template></button
                        ><button
                          v-else
                          type="button"
                          class="is-complete"
                          disabled
                          :aria-label="ledgerCardIsV2 ? '等级已满级' : undefined"
                          :title="ledgerCardIsV2 ? '等级已满级' : undefined"
                        >
                          <template v-if="ledgerCardIsV2"
                            ><Check :size="14" aria-hidden="true" /><span
                              class="sr-only"
                              >已满级</span
                            ></template
                          ><template v-else>已满级</template>
                        </button>
                      </div>
                      <div
                        v-if="cardPopoverKey === e.id + ':level'"
                        class="ledger-popover ledger-upgrade-popover"
                        aria-live="polite"
                      >
                        <p>
                          <CircleAlert :size="13" aria-hidden="true" />{{
                            growthTargetLabel(e, "level")
                          }}
                        </p>
                        <OperatorLevelBreakthroughSelect v-model="ensureCardDraft(e).levelBreakthroughStage" :level="Number(cardGrowthValue(e, 'level')) || 0" :disabled="isGrowthPreviewBusy(e, 'level') || isGrowthExecuteBusy(e, 'level')" />
                        <label
                          v-if="showLevelBreakthroughOption(e, 5)"
                          class="ledger-breakthrough-toggle"
                          ><input
                            type="checkbox"
                            :checked="cardLevelBreakthrough(e)"
                            :disabled="
                              operatorLevelBreakthroughStage(ensureCardDraft(e)) != null ||
                              isGrowthPreviewBusy(e, 'level') ||
                              isGrowthExecuteBusy(e, 'level')
                            "
                            @change="setCardLevelBreakthrough(e, $event)"
                          /><span
                            >已突破？<small>不计突破材料</small></span
                          ></label
                        >
                        <div
                          v-if="isGrowthPreviewBusy(e, 'level')"
                          class="ledger-popover-state"
                        >
                          正在核对库存与养成版本…
                        </div>
                        <div
                          v-else-if="growthPreviewError(e, 'level')"
                          class="ledger-popover-state is-error"
                        >
                          {{ growthPreviewError(e, "level")
                          }}<button
                            type="button"
                            @click="openGrowthAction(e, 'level', 5)"
                          >
                            重试
                          </button>
                        </div>
                        <template v-else-if="growthPreviewData(e, 'level')"
                          ><div class="ledger-material-list">
                            <span
                              v-for="item in growthPreviewDisplayRequirements(
                                e,
                                'level',
                              )"
                              :key="
                                (item.entity_type || item.entityType) +
                                ':' +
                                item.id
                              "
                              :class="{
                                'is-lack':
                                  growthRequirementValue(
                                    item,
                                    'balance_after',
                                  ) < 0,
                              }"
                              >{{ growthRequirementName(item, e) }} ×{{
                                growthRequirementValue(item, "required")
                              }}<small>{{
                                growthRequirementBalanceLabel(item)
                              }}</small></span
                            ><em
                              v-if="
                                !growthPreviewDisplayRequirements(e, 'level')
                                  .length
                              "
                              >无需扣除库存道具</em
                            >
                          </div>
                          <em
                            v-for="reason in growthPreviewBlockingReasons(
                              e,
                              'level',
                            )"
                            :key="reason.code + ':' + reason.message"
                            class="ledger-popover-blocked"
                            >{{ growthReasonMessage(reason) }}</em
                          >
                          <div
                            v-if="growthPreviewAvailable(e, 'level')"
                            class="ledger-popover-actions"
                          >
                            <button
                              type="button"
                              :disabled="isGrowthExecuteBusy(e, 'level')"
                              @click="executeGrowthAction(e, 'level')"
                            >
                              {{
                                isGrowthExecuteBusy(e, "level")
                                  ? "正在提升…"
                                  : "确认提升并扣除库存"
                              }}
                            </button>
                          </div>
                          <em
                            v-else-if="
                              !growthPreviewBlockingReasons(e, 'level')
                                .length &&
                              !growthPreviewHasMaterialGap(e, 'level')
                            "
                            class="ledger-popover-blocked"
                            >当前状态无法提升</em
                          ></template
                        >
                      </div>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">修为</span>
                      <label class="ledger-inline-field" title="修为"
                        ><span class="sr-only">修为</span
                        ><input
                          class="ledger-editable ledger-inline-input"
                          type="number"
                          min="0"
                          :max="
                            getMaxEliteForLevel(cardGrowthValue(e, 'level'))
                          "
                          :value="cardGrowthValue(e, 'elite')"
                          :disabled="cardSubmitStates[e.id] === 'submitting'"
                          aria-label="修为"
                          @input="setGrowthInput(e, 'elite', $event)"
                      /></label>
                      <button
                        class="ledger-smart-action ledger-popover-trigger"
                        :class="growthActionClass(e, 'elite', 1)"
                        type="button"
                        :disabled="
                          cardSubmitStates[e.id] === 'submitting' ||
                          cardGrowthValue(e, 'elite') >=
                            getMaxEliteForLevel(cardGrowthValue(e, 'level'))
                        "
                        :aria-label="
                          ledgerCardIsV2
                            ? cardGrowthValue(e, 'elite') >=
                              getMaxEliteForLevel(cardGrowthValue(e, 'level'))
                              ? '修为已满级'
                              : '修为：' +
                                growthActionLabel(
                                  e,
                                  'elite',
                                  1,
                                  '升至 ' + growthTarget(e, 'elite'),
                                )
                            : undefined
                        "
                        :title="
                          ledgerCardIsV2
                            ? cardGrowthValue(e, 'elite') >=
                              getMaxEliteForLevel(cardGrowthValue(e, 'level'))
                              ? '修为已满级'
                              : '修为：' +
                                growthActionLabel(
                                  e,
                                  'elite',
                                  1,
                                  '升至 ' + growthTarget(e, 'elite'),
                                )
                            : undefined
                        "
                        @click="openGrowthAction(e, 'elite', 1)"
                      >
                        <template v-if="ledgerCardIsV2"
                          ><Check
                            v-if="
                              cardGrowthValue(e, 'elite') >=
                              getMaxEliteForLevel(cardGrowthValue(e, 'level'))
                            "
                            :size="14"
                            aria-hidden="true"
                          /><CircleAlert
                            v-else-if="!growthMaterialsReady(e, 'elite', 1)"
                            :size="14"
                            aria-hidden="true"
                          /><ChevronUp
                            v-else
                            :size="15"
                            aria-hidden="true"
                          /><span class="sr-only">{{
                            cardGrowthValue(e, "elite") >=
                            getMaxEliteForLevel(cardGrowthValue(e, "level"))
                              ? "已满级"
                              : growthActionLabel(
                                  e,
                                  "elite",
                                  1,
                                  "升至 " + growthTarget(e, "elite"),
                                )
                          }}</span></template
                        ><template v-else
                          ><ChevronUp
                            v-if="
                              cardGrowthValue(e, 'elite') <
                                getMaxEliteForLevel(
                                  cardGrowthValue(e, 'level'),
                                ) && growthMaterialsReady(e, 'elite', 1)
                            "
                            :size="13"
                            aria-hidden="true"
                          />{{
                            cardGrowthValue(e, "elite") >=
                            getMaxEliteForLevel(cardGrowthValue(e, "level"))
                              ? "已满级"
                              : growthActionLabel(
                                  e,
                                  "elite",
                                  1,
                                  "升至 " + growthTarget(e, "elite"),
                                )
                          }}</template
                        >
                      </button>
                      <div
                        v-if="cardPopoverKey === e.id + ':elite'"
                        class="ledger-popover ledger-upgrade-popover"
                        aria-live="polite"
                      >
                        <p>
                          <CircleAlert :size="13" aria-hidden="true" />{{
                            growthTargetLabel(e, "elite")
                          }}
                        </p>
                        <div
                          v-if="isGrowthPreviewBusy(e, 'elite')"
                          class="ledger-popover-state"
                        >
                          正在核对库存与养成版本…
                        </div>
                        <div
                          v-else-if="growthPreviewError(e, 'elite')"
                          class="ledger-popover-state is-error"
                        >
                          {{ growthPreviewError(e, "elite")
                          }}<button
                            type="button"
                            @click="openGrowthAction(e, 'elite', 1)"
                          >
                            重试
                          </button>
                        </div>
                        <template v-else-if="growthPreviewData(e, 'elite')"
                          ><div class="ledger-material-list">
                            <span
                              v-for="item in growthPreviewDisplayRequirements(
                                e,
                                'elite',
                              )"
                              :key="
                                (item.entity_type || item.entityType) +
                                ':' +
                                item.id
                              "
                              :class="{
                                'is-lack':
                                  growthRequirementValue(
                                    item,
                                    'balance_after',
                                  ) < 0,
                              }"
                              >{{ growthRequirementName(item, e) }} ×{{
                                growthRequirementValue(item, "required")
                              }}<small>{{
                                growthRequirementBalanceLabel(item)
                              }}</small></span
                            ><em
                              v-if="
                                !growthPreviewDisplayRequirements(e, 'elite')
                                  .length
                              "
                              >无需扣除库存道具</em
                            >
                          </div>
                          <em
                            v-for="reason in growthPreviewBlockingReasons(
                              e,
                              'elite',
                            )"
                            :key="reason.code + ':' + reason.message"
                            class="ledger-popover-blocked"
                            >{{ growthReasonMessage(reason) }}</em
                          >
                          <div
                            v-if="growthPreviewAvailable(e, 'elite')"
                            class="ledger-popover-actions"
                          >
                            <button
                              type="button"
                              :disabled="isGrowthExecuteBusy(e, 'elite')"
                              @click="executeGrowthAction(e, 'elite')"
                            >
                              {{
                                isGrowthExecuteBusy(e, "elite")
                                  ? "正在提升…"
                                  : "确认提升并扣除库存"
                              }}
                            </button>
                          </div>
                          <em
                            v-else-if="
                              !growthPreviewBlockingReasons(e, 'elite')
                                .length &&
                              !growthPreviewHasMaterialGap(e, 'elite')
                            "
                            class="ledger-popover-blocked"
                            >当前状态无法提升</em
                          ></template
                        >
                      </div>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label ledger-milestone-label">化极 <button type="button" class="ledger-history-link" :aria-label="(e.name || e.id) + '的化极历程'" @click="milestoneEntry = e">历程</button></span>
                      <button
                        class="ledger-editable ledger-huaji-value ledger-popover-trigger"
                        :class="{ 'is-terminal': operatorHuajiAction(e).kind !== 'upgrade' || cardGrowthValue(e, 'star') >= operatorHuajiMax(e) }"
                        type="button"
                        :aria-label="'化极：' + (cardHuaji(e).awakened === true ? '已觉醒' : cardHuaji(e).stage === 25 ? '5 星' : operatorHuajiLabel({ ...e, huaji: cardHuaji(e) }))"
                        title="化极"
                        :aria-expanded="cardPopoverKey === e.id + ':star-edit'"
                        @click="openCardPopover(e, 'star-edit')"
                      >
                        <span v-if="cardHuaji(e).awakened === true">已觉醒</span>
                        <template
                          v-else-if="starCardHasIcon(cardGrowthValue(e, 'star'))"
                          ><span>{{
                            starCardNumber(cardGrowthValue(e, "star"), e.spOf)
                          }}</span
                          ><Star
                            :size="12"
                            fill="currentColor"
                            aria-hidden="true"
                          /><span v-if="!e.spOf && cardGrowthValue(e, 'star') < 25"
                            >
                            {{ starCardNode(cardGrowthValue(e, "star")) }}
                            <span class="ledger-node-label">&nbsp;节点</span></span
                          ></template
                        ><template v-else>{{
                          starCardFallback(cardGrowthValue(e, "star"))
                        }}</template>
                      </button>
                      <button
                        v-if="!e.spOf && operatorHuajiAction(e).kind === 'upgrade' && cardGrowthValue(e, 'star') < operatorHuajiMax(e)"
                        class="ledger-next-action ledger-popover-trigger"
                        :class="growthActionClass(e, 'star', 1)"
                        type="button"
                        :disabled="
                          cardSubmitStates[e.id] === 'submitting'
                        "
                        :aria-label="'化极：' + operatorHuajiAction(e).label"
                        :title="operatorHuajiAction(e).label"
                        @click="openGrowthAction(e, 'star', 1)"
                      >
                        <template v-if="ledgerCardIsV2"
                          ><span
                            v-if="!growthMaterialsReady(e, 'star', 1)"
                            class="ledger-action-ratio"
                            aria-hidden="true"
                            >{{ growthActionLabel(e, "star", 1, "下一节点") }}</span
                          /><span v-else class="ledger-upgrade-label" aria-hidden="true"
                            >提升</span
                          /><span class="sr-only">{{
                            growthActionLabel(e, "star", 1, "下一节点")
                          }}</span></template
                        ><template v-else
                          ><ChevronUp
                            v-if="
                              growthMaterialsReady(e, 'star', 1)
                            "
                            :size="13"
                            aria-hidden="true"
                          />{{
                            growthActionLabel(e, "star", 1, "下一节点")
                          }}</template
                        >
                      </button>
                      <button
                        v-else-if="operatorHuajiAction({ ...e, huaji: cardHuaji(e) }).kind === 'awakening'"
                        class="ledger-next-action ledger-heart-stock ledger-popover-trigger"
                        type="button"
                        :class="operatorAwakeningUpgradeSupported(e) ? growthActionClass(e, 'star', 1) : ''"
                        :aria-label="(operatorAwakeningUpgradeSupported(e) ? '快捷觉醒：' : '心纸库存/觉醒参考需求：') + cardAwakeningHeartLabel(e) + '，查看材料'"
                        :title="operatorAwakeningUpgradeSupported(e) ? '查看觉醒材料并确认扣除库存' : '查看心纸库存与觉醒参考需求'"
                        :aria-expanded="cardPopoverKey === e.id + (operatorAwakeningUpgradeSupported(e) ? ':star' : ':star-edit')"
                        @click="operatorAwakeningUpgradeSupported(e) ? openGrowthAction(e, 'star', 1) : openCardPopover(e, 'star-edit')"
                      >
                        <span class="ledger-action-ratio">{{ cardAwakeningHeartLabel(e) }}</span>
                      </button>
                      <div
                        v-if="cardPopoverKey === e.id + ':star-edit'"
                        class="ledger-popover ledger-star-popover"
                      >
                        <p>
                          <CircleAlert
                            :size="13"
                            aria-hidden="true"
                          />校正星级、节点与觉醒
                        </p>
                        <small v-if="operatorAwakeningSupported(e) && cardHuaji(e).stage === 25" class="star-awakening-hint">
                          觉醒需 100 心纸、1 个装金玻璃。此处仅校正游戏内状态，不扣库存；快捷觉醒在材料确认后扣料。
                        </small>
                        <div class="ledger-star-controls">
                          <select
                            :value="starDraftGroup(e)"
                            aria-label="快捷设置星级与觉醒"
                            @change="setStarDraftGroup(e, $event)"
                          >
                            <option v-if="operatorHuaji(e).owned && operatorHuaji(e).stage == null" value="-1" disabled>化极待确认（历史 {{ e.starLevel }}）</option>
                            <option value="0">未拥有</option>
                            <option
                              v-for="group in [1, 2, 3, 4, 5].filter(value => e.spOf || value < 5 || Number(e.rarity) !== 3)"
                              :key="group"
                              :value="group"
                            >
                              {{ group }} 星
                            </option>
                            <option v-if="operatorAwakeningSupported(e)" value="awakening">觉醒</option>
</select
                          ><select
                            v-if="
                              !e.spOf &&
                              starDraftGroup(e) > 0 &&
                              starDraftGroup(e) < 5
                            "
                            :value="starDraftNode(e)"
                            @change="setStarDraftNode(e, $event)"
                          >
                            <option
                              v-for="node in 6"
                              :key="node - 1"
                              :value="node - 1"
                            >
                              节点 {{ node - 1 }}
                            </option>
                          </select>
                        </div>
                        <div class="ledger-popover-actions">
                          <button type="button" @click="cardPopoverKey = ''">
                            完成校正
                          </button>
                        </div>
                      </div>
                      <div
                        v-if="!e.spOf && cardPopoverKey === e.id + ':star'"
                        class="ledger-popover ledger-upgrade-popover"
                        aria-live="polite"
                      >
                        <p>
                          <CircleAlert :size="13" aria-hidden="true" />{{
                            growthTargetLabel(e, "star")
                          }}
                        </p>
                        <div
                          v-if="isGrowthPreviewBusy(e, 'star')"
                          class="ledger-popover-state"
                        >
                          正在核对库存与养成版本…
                        </div>
                        <div
                          v-else-if="growthPreviewError(e, 'star')"
                          class="ledger-popover-state is-error"
                        >
                          {{ growthPreviewError(e, "star")
                          }}<button
                            type="button"
                            @click="openGrowthAction(e, 'star', 1)"
                          >
                            重试
                          </button>
                        </div>
                        <template v-else-if="growthPreviewData(e, 'star')"
                          ><div class="ledger-material-list">
                            <span
                              v-for="item in growthPreviewDisplayRequirements(
                                e,
                                'star',
                              )"
                              :key="
                                (item.entity_type || item.entityType) +
                                ':' +
                                item.id
                              "
                              :class="{
                                'is-lack':
                                  growthRequirementValue(
                                    item,
                                    'balance_after',
                                  ) < 0,
                              }"
                              >{{ growthRequirementName(item, e) }} ×{{
                                growthRequirementValue(item, "required")
                              }}<small>{{
                                growthRequirementBalanceLabel(item)
                              }}</small></span
                            ><em
                              v-if="
                                !growthPreviewDisplayRequirements(e, 'star')
                                  .length
                              "
                              >无需扣除库存道具</em
                            >
                          </div>
                          <em
                            v-for="reason in growthPreviewBlockingReasons(
                              e,
                              'star',
                            )"
                            :key="reason.code + ':' + reason.message"
                            class="ledger-popover-blocked"
                            >{{ growthReasonMessage(reason) }}</em
                          >
                          <div
                            v-if="growthPreviewAvailable(e, 'star')"
                            class="ledger-popover-actions"
                          >
                            <button
                              type="button"
                              :disabled="isGrowthExecuteBusy(e, 'star')"
                              @click="executeGrowthAction(e, 'star')"
                            >
                              {{
                                isGrowthExecuteBusy(e, "star")
                                  ? "正在提升…"
                                  : isQuickAwakening(e) ? "确认觉醒并扣除库存" : "确认提升并扣除库存"
                              }}
                            </button>
                          </div>
                          <em
                            v-else-if="
                              !growthPreviewBlockingReasons(e, 'star').length &&
                              !growthPreviewHasMaterialGap(e, 'star')
                            "
                            class="ledger-popover-blocked"
                            >当前状态无法提升</em
                          ></template
                        >
                      </div>
                    </div>
                  </section>

                    </template>
                  </ShareCardStats>

                  <div class="ledger-loadouts">
                  <div
                    class="ledger-destiny fate-trait-style-a"
                  >
                    <div
                      v-for="index in 2"
                      :key="index"
                      class="ledger-destiny-row ledger-popover-trigger"
                      role="button"
                      tabindex="0"
                      :aria-label="'编辑命盘' + (index === 1 ? '一' : '二')"
                      :title="'命盘' + (index === 1 ? '一' : '二')"
                      :aria-expanded="
                        cardPopoverKey === e.id + ':disc-' + (index - 1)
                      "
                      @click="openCardPopover(e, 'disc-' + (index - 1))"
                      @keydown.enter.self.prevent="
                        openCardPopover(e, 'disc-' + (index - 1))
                      "
                      @keydown.space.self.prevent="
                        openCardPopover(e, 'disc-' + (index - 1))
                      "
                    >
                      <span>命盘{{ index === 1 ? "一" : "二" }}</span>
                      <svg v-if="ledgerCardIsV2" class="ledger-destiny-marker" width="6" height="16" viewBox="0 0 6 16" aria-hidden="true">
                        <circle v-for="dot in index" :key="dot" cx="3" :cy="index === 1 ? 8 : dot === 1 ? 5 : 11" r="2" fill="currentColor" />
                      </svg>
                      <div class="ledger-destiny-values">
                        <template v-if="cardLoadoutDiscs(e, index - 1).length">
                          <em
                            v-for="disc in cardLoadoutDiscs(e, index - 1)"
                            :key="disc"
                            class="disc-term"
                            :class="[
                              cardDiscRarityClass(e, disc),
                              {
                                'has-description': cardDiscDescription(
                                  e,
                                  disc,
                                ),
                              },
                            ]"
                            :aria-label="ledgerCardIsV2 ? disc : undefined"
                            tabindex="0"
                            @mouseenter.stop="
                              showDiscTooltip(
                                $event,
                                cardDiscDescription(e, disc),
                              )
                            "
                            @mouseleave="hideDiscTooltip"
                            @focus="
                              showDiscTooltip(
                                $event,
                                cardDiscDescription(e, disc),
                              )
                            "
                            @blur="hideDiscTooltip"
                            >{{
                              ledgerCardIsV2
                                ? cardDiscAbbreviation(e, disc)
                                : disc
                            }}</em>
                        </template>
                        <em
                          v-if="cardLoadoutNeedsPlaceholder(e, index - 1)"
                          class="empty"
                          >+ 命盘</em
                        >
                      </div>
                      <div
                        v-if="cardPopoverKey === e.id + ':disc-' + (index - 1)"
                        class="ledger-popover ledger-disc-popover"
                        @click.stop
                        @keydown.esc.stop="cardPopoverKey = ''"
                      >
                        <div class="ledger-loadout-editor-head">
                          <p>
                            <CircleAlert :size="13" aria-hidden="true" />编辑命盘{{ index === 1 ? "一" : "二" }}
                            <span class="ledger-loadout-legacy-detail">（最多 3 个）</span>
                          </p>
                          <span class="ledger-loadout-editor-count" aria-live="polite">
                            已选 {{ cardLoadoutDiscs(e, index - 1).length }} / 3
                          </span>
                          <button
                            class="ledger-loadout-editor-close"
                            type="button"
                            aria-label="关闭命盘编辑"
                            @click.stop="cardPopoverKey = ''"
                          ><X :size="18" aria-hidden="true" /></button>
                        </div>
                        <div class="ledger-disc-options">
                          <label
                            v-for="disc in cardDiscOptions(e)"
                            :key="discKey(disc)"
                            class="ledger-disc-option"
                            :class="discColorClass(disc)"
                            @click.stop
                          >
                            <input
                              type="checkbox"
                              :aria-label="discKey(disc)"
                              :checked="cardDiscSelected(e, index - 1, disc)"
                              @change.stop="
                                toggleCardDisc(e, index - 1, disc, $event)
                              "
                            />
                            <span
                              class="disc-term-label"
                              tabindex="0"
                              @mouseenter.stop="
                                showDiscTooltip($event, discDescription(disc))
                              "
                              @mouseleave="hideDiscTooltip"
                              @focus="
                                showDiscTooltip($event, discDescription(disc))
                              "
                              @blur="hideDiscTooltip"
                              >{{ cardDiscAbbreviation(e, discKey(disc)) }}</span
                            >
                          </label>
                        </div>
                        <div class="ledger-popover-actions ledger-loadout-editor-actions">
                          <span class="ledger-loadout-editor-hint">修改后在卡片保存</span>
                          <button
                            class="ledger-loadout-editor-done"
                            type="button"
                            @click.stop="cardPopoverKey = ''"
                          >完成</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button v-if="cardDiscTargetSummary(e)" class="ledger-disc-target-summary" type="button" aria-haspopup="dialog"
                    :aria-label="e.name + '：' + cardDiscTargetSummary(e) + '，查看命盘目标'" @click.stop="discTargetEntryId = e.id">
                    <span v-for="(item, index) in cardDiscTargetSummaryItems(e)" :key="index"
                      class="ledger-disc-target-state" :class="'is-' + item.status">
                      <Check v-if="item.status === 'perfect'" :size="11" aria-hidden="true" />
                      <RotateCcw v-else :size="11" aria-hidden="true" />
                      <span>{{ item.label }}</span>
                    </span>
                    <ChevronRight class="ledger-disc-target-arrow" :size="11" aria-hidden="true" />
                  </button>

                  <div class="ledger-stones" aria-label="已装备星石">
                    <span class="ledger-stone-row-label" aria-hidden="true">主星</span>
                    <span class="ledger-stone-row-label" aria-hidden="true">辅星</span>
                    <button
                      v-for="(stone, index) in cardStoneSlots(e)"
                      :key="index"
                      type="button"
                      class="stone-slot ledger-popover-trigger"
                      :class="{ 'is-empty': !stone }"
                      :aria-label="
                        stoneSlots[index].label + '，' + (stone
                          ? stone.name + '，等级 ' + (stone.level || 0)
                          : '未装备')
                      "
                      @click="openStarLoadout(e, stoneSlots[index].type.replace('assist', 'support'))"
                    >
                      <template v-if="stone"
                        ><strong>{{ stone.name || "星石" }}</strong
                        ><small>{{ stone.level || 0 }}</small></template
                      ><span v-else>+</span>
                    </button>
                  </div>

                  </div>
                  <div class="ledger-card-footer">
                    <textarea
                      :value="operatorRemark(e)"
                      rows="2"
                      maxlength="1000"
                      :aria-label="e.name + '备忘'"
                      placeholder="添加备忘…"
                      :disabled="
                        cardSubmitStates[e.id] === 'submitting' ||
                        annotationBusyIds.has(e.id)
                      "
                      @input="setOperatorRemarkDraft(e, $event.target.value)"
                    ></textarea>
                    <div class="ledger-card-actions">
                      <template v-if="cardHasDraft(e)"
                        ><button
                          class="ledger-card-cancel"
                          type="button"
                          :disabled="cardSubmitStates[e.id] === 'submitting'"
                          @click="cancelCardDraft(e)"
                        >
                          取消</button
                        ><button
                          class="ledger-card-save"
                          type="button"
                          aria-label="保存"
                          title="保存"
                          :disabled="
                            cardSubmitStates[e.id] === 'submitting' ||
                            annotationBusyIds.has(e.id)
                          "
                          @click="saveCardDraft(e)"
                        >
                          <Save :size="13" aria-hidden="true" /><span class="ledger-save-label">保存</span>
                        </button></template
                      ><button
                        v-else
                        class="ledger-full-edit"
                        type="button"
                        @click.stop="openEdit(e.id)"
                      >
                        <Pencil :size="14" aria-hidden="true" />完整编辑
                      </button>
                    </div>
                  </div>
                  <div
                    v-if="cardSubmitStates[e.id]"
                    class="ledger-submit-overlay"
                    :class="cardSubmitStates[e.id]"
                  >
                    <div class="ledger-submit-message">
                      <div class="ledger-submit-icon">
                        <span
                          v-if="cardSubmitStates[e.id] === 'submitting'"
                          class="ledger-submit-spinner"
                        ></span
                        ><span v-else-if="cardSubmitStates[e.id] === 'success'"
                          ><Check :size="16" aria-hidden="true" /></span
                        ><span v-else><CircleAlert :size="16" aria-hidden="true" /></span>
                      </div>
                      <strong>{{
                        cardSubmitStates[e.id] === "submitting"
                          ? "正在提交"
                          : cardSubmitStates[e.id] === "success"
                            ? "已保存"
                            : "保存失败"
                      }}</strong>
                      <p>
                        {{
                          cardSubmitStates[e.id] === "submitting"
                            ? "正在保存本次修改…"
                            : cardSubmitStates[e.id] === "success"
                              ? "本次修改已更新"
                              : quickNotices[e.id] || "本次修改尚未更新"
                        }}
                      </p>
                      <div
                        v-if="cardSubmitStates[e.id] === 'error'"
                        class="ledger-submit-actions"
                      >
                        <button type="button" @click="clearCardSubmitState(e)">
                          继续编辑</button
                        ><button
                          type="button"
                          class="ledger-card-save"
                          @click="saveCardDraft(e)"
                        >
                          重试
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div v-if="!visitedTabs.has('relationships')" id="operator-panel-relationships" role="tabpanel" aria-labelledby="operator-tab-relationships" hidden></div>
          <div v-if="visitedTabs.has('relationships')" id="operator-panel-relationships" role="tabpanel" aria-labelledby="operator-tab-relationships" tabindex="0"
            v-show="activeTab === 'relationships' && (!operatorEntryState || catalogEntryExpanded)" class="panel" :class="{ 'is-active': activeTab === 'relationships' }">
            <OperatorFilterDossier compact searchable context-label="信赖与传闻"
              v-model:search-query="currentSearch" :result-count="filteredCurrent.length" :total-count="ownedCurrentEntries.length"
              :rarity-options="rarityOptions" :prof-options="profOptions" :sub-prof-options="subProfOptions"
              :status-options="workbenchStatusOptions" :status-counts="currentStatusCounts" :tag-options="organizationTagOptions"
              v-model:tag-filter="organizationTagFilter" v-model:rarity-filter="rarityFilter" v-model:prof-filter="profFilter"
              v-model:sub-prof-filter="subProfFilter" :status-filter="workbenchStatusFilter" :prof-icon="profIcon"
              :has-filters="hasCurrentFilters" v-model:growth-filters="growthFilters" v-model:disc-status-filter="discStatusFilter"
              show-disc-filter show-growth-filters @update:status-filter="setWorkbenchStatusFilter" @reset="resetCurrentFilters">
              <template #primary-tool>
                <router-link class="btn primary" :to="quickSupplementHref" @click="hideBackupImport"><Plus :size="16" aria-hidden="true" /> 录入密探</router-link>
              </template>
              <template v-if="upgradeReadyFilter" #extra-filters>
                <button type="button" class="btn ghost" @click="upgradeReadyFilter = ''">{{ upgradeReadyFilter === 'huaji' ? '可提升化极' : '等级/修为可提升' }} · 取消筛选</button>
              </template>
            </OperatorFilterDossier>
            <OperatorRelationships ref="relationshipWorkspace" :account-id="accountId" :account-name="currentAccountName" :game="gameFilter"
              :user-id="auth.userInfo?.id || ''" :logged-in="auth.isLoggedIn" :all-operators="catalogOperators.filter(op => op.games?.includes(gameFilter))"
              :operators="filteredCurrent.map(entry => ({ ...catalogMap[entry.id], id: entry.id }))" :owned-count="ownedCurrentEntries.length"
              :prof-icon="profIcon" :favorite-ids="favoriteAgentIds" :favorite-busy-ids="favoriteBusyIds" :favorite-loading="favoriteLoading" :favorite-error="favoriteError" @favorite="toggleAgentFavorite" />
          </div>
          <div
            v-if="growthTrackingEnabled && visitedTabs.has('tracking')"
            id="operator-panel-tracking"
            role="tabpanel"
            aria-labelledby="operator-tab-tracking"
            tabindex="0"
            v-show="activeTab === 'tracking' && (!operatorEntryState || catalogEntryExpanded)"
            class="panel"
            :class="{ 'is-active': activeTab === 'tracking' }"
          >
            <OperatorGrowthTracker
              :game="gameFilter"
              :account-id="accountId"
              :current-entries="currentEntries"
              :catalog-entries="catalogOperators"
              :favorite-ids="favoriteAgentIds"
              :growth-states="workbenchStatuses"
              :is-logged-in="auth.isLoggedIn"
              :refresh-key="subjectiveRefreshKey"
              :active="activeTab === 'tracking'"
              :annotation-revisions="annotationRevisions"
              :quick-upgrade="openPlannerGrowthAction"
              :quick-upgrade-state="plannerQuickUpgradeState"
              :growth-action-popover-key="cardPopoverKey"
              :growth-action-entry="trackerRemarkEntry"
              :growth-action-target-label="growthTargetLabel"
              :growth-action-show-breakthrough="showLevelBreakthroughOption"
              :growth-action-breakthrough="cardLevelBreakthrough"
              :growth-action-preview-busy="isGrowthPreviewBusy"
              :growth-action-preview-error="growthPreviewError"
              :growth-action-preview="growthPreviewData"
              :growth-action-display-requirements="growthPreviewDisplayRequirements"
              :growth-action-blocking-reasons="growthPreviewBlockingReasons"
              :growth-action-available="growthPreviewAvailable"
              :growth-action-has-material-gap="growthPreviewHasMaterialGap"
              :growth-action-execute-busy="isGrowthExecuteBusy"
              :growth-action-requirement-name="growthRequirementName"
              :growth-action-requirement-value="growthRequirementValue"
              :growth-action-requirement-balance-label="growthRequirementBalanceLabel"
              :growth-action-reason-message="growthReasonMessage"
              :growth-action-execute="executeGrowthAction"
              :growth-action-breakthrough-change="setCardLevelBreakthrough"
              :growth-action-notice="plannerGrowthActionNotice"
              @annotation-updated="applyAnnotationItem"
              @refresh-annotations="loadOperatorAnnotations"
              :is-remark-editing="row => cardHasDraft(trackerRemarkEntry(row))"
              @refresh-operators="reloadCurrent(true)"
            >
              <template #remark="{ row }">
                <div class="ledger-card-footer growth-card-remark">
                  <textarea
                    :value="operatorRemark(trackerRemarkEntry(row))"
                    rows="1"
                    maxlength="1000"
                    :aria-label="(row.name || row.id) + '备忘'"
                    placeholder="添加备忘…"
                    :disabled="!currentMap[row.id] || cardSubmitStates[row.id] === 'submitting' || annotationBusyIds.has(row.id)"
                    @input="setOperatorRemarkDraft(trackerRemarkEntry(row), $event.target.value)"
                  ></textarea>
                  <div v-if="cardHasDraft(trackerRemarkEntry(row))" class="ledger-card-actions">
                    <button class="ledger-card-cancel" type="button" :disabled="cardSubmitStates[row.id] === 'submitting' || annotationBusyIds.has(row.id)" @click="cancelCardDraft(trackerRemarkEntry(row))">取消</button>
                    <button class="ledger-card-save" type="button" :disabled="cardSubmitStates[row.id] === 'submitting' || annotationBusyIds.has(row.id)" @click="saveCardDraft(trackerRemarkEntry(row))"><Save :size="13" aria-hidden="true" />{{ cardSubmitStates[row.id] === 'submitting' ? '保存中…' : '保存' }}</button>
                  </div>
                  <p v-if="cardSubmitStates[row.id] === 'error'" class="growth-remark-error" role="alert">{{ quickNotices[row.id] || '保存失败，请重试' }}</p>
                  <p v-else-if="cardSubmitStates[row.id] === 'success'" class="growth-remark-notice" role="status">已保存</p>
                </div>
              </template>
            </OperatorGrowthTracker>
          </div>
        </div>
      </section>

      <nav class="operator-mobile-tabs" role="tablist" aria-label="密探工作区">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'catalog'"
          :class="{ on: activeTab === 'catalog' }"
          @click="setTab('catalog')"
        >
          <BookOpen :size="19" aria-hidden="true" />
          <span>图鉴</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'current'"
          :class="{ on: activeTab === 'current' }"
          @click="setTab('current')"
        >
          <ListChecks :size="19" aria-hidden="true" />
          <span>养成总览</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'tracking'"
          :class="{ on: activeTab === 'tracking' }"
          @click="openGrowthPlanningPreview"
        >
          <Target :size="19" aria-hidden="true" />
          <span>{{ growthTrackingEnabled ? '养成规划' : '规划 · 即将上线' }}</span>
        </button>
      </nav>

      <!-- 单个密探编辑弹窗 -->
      <div
        v-if="editing"
        class="editor-mask"
        :class="{ 'is-short-viewport': editorShortViewport }"
        :style="editorViewportStyle"
        @click.self="closeEditor"
        @keydown.esc="closeEditor"
      >
        <div
          ref="editorPanelEl"
          @focusin="revealEditorControl"
          class="editor-panel editor-workspace"
          :class="{ 'is-disc-editor': editorSection === 'discs' }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="'operator-editor-title-' + editingId"
          :aria-describedby="'operator-editor-context-' + editingId"
          tabindex="-1"
          v-reveal
        >
          <div class="editor-head">
            <div class="editor-identity">
              <span class="editor-kicker">
                <span>正在编辑 {{ currentAccountName }} 的密探</span>
              </span>
              <div class="editor-title-line">
                <h3 :id="'operator-editor-title-' + editingId">
                  {{ editingOp.name || editingOp.id }}
                </h3>
                <div
                  :id="'operator-editor-context-' + editingId"
                  class="editor-identity-tags"
                >
                  <span class="editor-identity-tag rarity"
                    >稀有度 {{ editingOp.rarity }} 星</span
                  >
                  <span v-if="editingOp.prof" class="editor-identity-tag">
                    <img
                      v-if="profIcon(editingOp.prof)"
                      :src="profIcon(editingOp.prof)"
                      alt=""
                      aria-hidden="true"
                    />
                    {{ editingOp.prof }}
                  </span>
                  <span
                    v-if="firstSubProf(editingOp)"
                    class="editor-identity-tag profession"
                    >{{ firstSubProf(editingOp) }}</span
                  >
                </div>
              </div>
            </div>
            <div class="editor-head-stats">
              <div class="editor-panel-controls">
                <label v-if="canUseAutomaticPanel" class="editor-panel-source">
                  <span>面板来源</span>
                  <select :value="editorPanelSource" aria-label="密探面板来源" @change="setEditorPanelSource($event.target.value)">
                    <option value="follow">跟随账号（自动补全{{ panelAutoFillEnabled ? '开' : '关' }}）</option>
                    <option value="manual">使用手填／采集</option>
                    <option value="auto" :disabled="!calculatedCombatStats.automaticResultAvailable && editorPanelSource !== 'auto'">使用自动计算</option>
                    <option v-if="editorPanelSource === 'mixed'" value="mixed" disabled>攻击／生命分别设置</option>
                  </select>
                </label>
                <details v-if="editorPanelDifference" class="editor-panel-comparison">
                  <summary>录入值与自动结果有差异，查看对比</summary>
                  <p>{{ editorPanelDifference }}</p>
                  <p>切换来源不会删除原值；星石尚未录全时可继续使用录入值。</p>
                </details>
                <div
                  v-if="editorPanelHint"
                  class="editor-head-stats-toolbar"
                >
                  <span class="editor-head-stats-note">{{
                    editorPanelHint
                  }}</span>
                  <button v-if="panelPreviewState.status === 'failed'" type="button" class="btn small" @click="panelPreviewRequest.retry()">重试计算</button>
                </div>
              </div>
              <div class="editor-head-values">
                <span
                  class="editor-head-live"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  >当前面板：攻击力 {{ combatAttackDisplayLabel }}，生命力
                  {{ combatHpDisplayLabel }}</span
                >
                <label
                  class="editor-head-stat"
                  :class="{
                    'is-manual':
                      editForm.combatStats.manualAttack != null &&
                      !combatAttackAutoVisible,
                    'is-empty': calculatedCombatStats.attack == null,
                  }"
                >
                  <span class="editor-head-stat-meta"
                    ><strong>攻击</strong><small>{{ combatAttackSource }}</small
                    ><button
                      v-if="
                        calculatedCombatStats.automaticAttackAvailable &&
                        editForm.combatStats.manualAttack != null
                      "
                      type="button"
                      class="manual-restore"
                      :aria-label="
                        combatAttackAutoVisible
                          ? '恢复原手动攻击力校正'
                          : '切换到自动计算攻击力'
                      "
                      :title="
                        combatAttackAutoVisible
                          ? '恢复原手动攻击力校正值'
                          : '切换到自动计算攻击力'
                      "
                      @click.prevent.stop="toggleAutomaticCombatStat('attack')"
                    >
                      <RotateCcw
                        v-if="combatAttackAutoVisible"
                        :size="11"
                        aria-hidden="true"
                      /><Calculator
                        v-else
                        :size="11"
                        aria-hidden="true"
                      /></button
                  ></span>
                  <input
                    :value="combatAttackInputValue"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    :placeholder="combatAttackDisplayLabel"
                    aria-label="校正攻击力，清空后按面板来源显示"
                    title="直接输入校正值；清空后按面板来源显示"
                    @input="setManualCombatStat('manualAttack', $event)"
                  />
                </label>
                <label
                  class="editor-head-stat"
                  :class="{
                    'is-manual':
                      editForm.combatStats.manualHp != null &&
                      !combatHpAutoVisible,
                    'is-empty': calculatedCombatStats.hp == null,
                  }"
                >
                  <span class="editor-head-stat-meta"
                    ><strong>生命</strong><small>{{ combatHpSource }}</small
                    ><button
                      v-if="
                        calculatedCombatStats.automaticHpAvailable &&
                        editForm.combatStats.manualHp != null
                      "
                      type="button"
                      class="manual-restore"
                      :aria-label="
                        combatHpAutoVisible
                          ? '恢复原手动生命力校正'
                          : '切换到自动计算生命力'
                      "
                      :title="
                        combatHpAutoVisible
                          ? '恢复原手动生命力校正值'
                          : '切换到自动计算生命力'
                      "
                      @click.prevent.stop="toggleAutomaticCombatStat('hp')"
                    >
                      <RotateCcw
                        v-if="combatHpAutoVisible"
                        :size="11"
                        aria-hidden="true"
                      /><Calculator
                        v-else
                        :size="11"
                        aria-hidden="true"
                      /></button
                  ></span>
                  <input
                    :value="combatHpInputValue"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    :placeholder="combatHpDisplayLabel"
                    aria-label="校正生命力，清空后按面板来源显示"
                    title="直接输入校正值；清空后按面板来源显示"
                    @input="setManualCombatStat('manualHp', $event)"
                  />
                </label>
              </div>
            </div>
            <button
              class="editor-close"
              type="button"
              aria-label="关闭编辑"
              title="关闭编辑"
              @click="closeEditor"
            >
              <X :size="19" aria-hidden="true" />
            </button>
            <div v-if="calculatedCombatStats.changedSinceObservation || editingObservedStatus === 'stale'" class="editor-panel-notice" role="status">
              <CircleAlert :size="20" aria-hidden="true" />
              <strong>面板待核对</strong>
              <span>养成信息已变化，原录入值仍保留；请按游戏内面板核对。</span>
            </div>
          </div>

          <OperatorEditorNav v-model="editorSection" />

          <div ref="editorBodyEl" class="editor-body">
            <section v-show="editorSection === 'growth'" id="operator-editor-growth" class="editor-row editor-growth-section" role="tabpanel" aria-labelledby="operator-editor-tab-growth" tabindex="0" data-editor-section="growth">
              <div class="num-fields">
                <div class="editor-level-block">
                  <div class="editor-growth-heading">
                    <h4>等级与修为</h4>
                    <p class="editor-growth-note">记录游戏现状；保存不扣除库存。本体与 SP 共享。</p>
                  </div>
                  <div class="level-row">
                    <div class="level-input-group">
                      <label
                        >等级
                        <input
                          type="number"
                          v-model.number="editForm.level"
                          inputmode="numeric"
                          min="0"
                          max="100"
                      /></label>
                      <OperatorLevelBreakthroughSelect inline v-model="editForm.levelBreakthroughStage" :level="Number(editForm.level) || 0" :disabled="savingEdit" />
                    </div>
                    <label
                      >修为
                      <input
                        type="number"
                        v-model.number="editForm.elite"
                        inputmode="numeric"
                        min="0"
                        :max="maxEliteForLevel"
                    /></label>
                    <span class="elite-hint"
                      >最高修为：{{ maxEliteForLevel }}</span
                    >
                  </div>
                  <div class="editor-growth-actions">
                    <button
                      type="button"
                      class="btn ghost editor-growth-preset"
                      :disabled="savingEdit"
                      title="仅填入等级和修为；点击保存后生效"
                      @click="applyEditGrowthPreset(100, 17)"
                    >100级 / 修为17</button>
                    <button
                      type="button"
                      class="btn ghost editor-growth-preset"
                      :disabled="savingEdit"
                      title="仅填入等级和修为；点击保存后生效"
                      @click="applyEditGrowthPreset(90, 15)"
                    >90级 / 修为15</button>
                    <button
                      type="button"
                      class="btn ghost editor-fill-max"
                      :disabled="savingEdit"
                      title="将等级设为 100、修为设为 17、奇闻属性设为图鉴上限；点击保存后生效"
                      @click="fillEditToMax()"
                    >一键拉满等级/修为/漆园蝶</button>
                  </div>
                </div>
                <div
                  class="star-card"
                  :title="
                    editingOp.spOf
                      ? '0=未拥有 · 1~5=SP星级'
                      : '1~4星及节点 → 五星 → 觉醒；人工记录不扣库存'
                  "
                >
                  <div class="editor-growth-heading">
                    <h4>化极</h4>
                    <button type="button" class="ledger-history-link" :disabled="savingEdit || !accountId" :aria-label="(editingOp.name || editingOp.id) + '的化极历程'" title="查看或补录化极日期" @click="milestoneEntry = editingOp">查看历程 <ChevronRight :size="14" aria-hidden="true" /></button>
                  </div>
                  <div class="star-row">
                    <span class="star-caption">星级</span>
                    <span class="star-groups" role="group" aria-label="化极星级">
                      <button
                        type="button"
                        class="star-pill"
                        :class="{ on: starGroupName === 'none' }"
                        :aria-pressed="starGroupName === 'none'"
                        @click="pickStarGroup('none')"
                      >
                        未拥有
                        <Check v-if="starGroupName === 'none'" :size="14" aria-hidden="true" />
                      </button>
                      <button
                        v-for="s in STAR_RANGE.filter(value => editingOp.spOf || value < 5 || Number(editingOp.rarity) !== 3)"
                        :key="s"
                        type="button"
                        class="star-pill"
                        :class="{ on: starGroupName === s }"
                        :aria-pressed="starGroupName === s"
                        @click="pickStarGroup(s)"
                      >
                        {{ s }}星
                        <Check v-if="starGroupName === s" :size="14" aria-hidden="true" />
                      </button>
                    </span>
                    <div v-if="operatorAwakeningSupported(editingOp) && editorCanConfirmAwakening" class="editor-awakening">
                      <span>觉醒</span>
                      <button
                        type="button"
                        class="editor-awakening-switch"
                        :class="{ on: editForm.owned && editForm.awakened === true }"
                        role="switch"
                        :aria-checked="editForm.owned && editForm.awakened === true"
                        aria-label="五星后觉醒（可选）"
                        :disabled="savingEdit || !operatorAwakeningSupported(editingOp) || editForm.owned === false || !editorCanConfirmAwakening"
                        :title="!editorCanConfirmAwakening ? '达到五星后可记录觉醒' : '仅记录游戏内觉醒状态，不扣库存；点击切换，保存后生效'"
                        @click="toggleEditAwakening"
                      ><span>{{ editForm.owned && editForm.awakened === true ? '已觉醒' : '未觉醒' }}</span><span class="editor-awakening-thumb" aria-hidden="true"></span></button>
                    </div>
                  </div>
                  <div
                    v-if="
                      !editingOp.spOf &&
                      starGroupName !== 'none' &&
                      starGroupName !== 'awaken' &&
                      starGroupName < 5
                    "
                    class="star-row"
                  >
                    <span class="star-caption">化极节点</span>
                    <span class="star-nodes">
                      <button
                        v-for="n in NODE_RANGE"
                        :key="n"
                        type="button"
                        class="node-chip"
                        :class="{ on: starNode === n }"
                        :aria-pressed="starNode === n"
                        @click="pickStarNode(n)"
                      >
                        {{ starGroupName }}-{{ n }}
                        <Check v-if="starNode === n" :size="14" aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                  <small v-if="operatorAwakeningSupported(editingOp) && editorCanConfirmAwakening" class="star-awakening-hint">觉醒为五星后的可选阶段，未开启时按未觉醒计算。</small>
                  <p v-if="operatorHuaji({ ...editingOp, ...currentMap[editingOp.id] }).stage == null" class="huaji-review-note" role="status"><CircleAlert :size="16" aria-hidden="true" />历史化极待复核；可先保存其它养成，不会推断星级。</p>
                </div>
                <div class="oddity-editor">
                  <div class="editor-growth-heading">
                    <h4 class="oddity-caption">
                      奇闻属性
                      <small v-if="oddityCatalogIncomplete">图鉴待维护</small>
                    </h4>
                    <button
                      type="button"
                      class="btn ghost editor-fill-max oddity-fill-max"
                      :disabled="savingEdit"
                      title="仅将三项奇闻属性设为图鉴上限，保留等级、修为和化极；点击保存后生效"
                      @click="fillEditToMax(true)"
                    >奇闻全部拉满</button>
                  </div>
                  <label
                    v-for="key in ODDITY_KEYS"
                    :key="key"
                    class="oddity-field"
                  >
                    <span class="oddity-name" :title="oddityFieldName(key)">{{
                      oddityFieldName(key)
                    }}</span>
                    <span class="oddity-control">
                      <input
                        v-model.number="
                          editForm.combatStats.oddities[key].current
                        "
                        type="number"
                        :inputmode="key === 'special' ? 'decimal' : 'numeric'"
                        :step="key === 'special' ? '0.1' : '1'"
                        min="0"
                        :max="editForm.combatStats.oddities[key].max"
                        :aria-label="oddityInputLabel(key)"
                        :data-oddity-key="key"
                        :aria-invalid="editOddityErrorKey === key ? 'true' : undefined"
                        :aria-describedby="editOddityErrorKey === key ? 'operator-oddity-error' : key === 'special' ? 'operator-oddity-precision' : undefined"
                        @input="editOddityErrorKey = ''"
                      />
                      <span
                        class="oddity-limit"
                        :title="oddityLimitTitle(key)"
                        aria-hidden="true"
                        >上限 {{ oddityLimitLabel(key) }}</span
                      >
                    </span>
                  </label>
                  <small id="operator-oddity-precision" class="oddity-hint">{{ oddityFieldName('special') }}最多一位小数</small>
                  <small v-if="editOddityErrorKey" id="operator-oddity-error" class="oddity-hint oddity-error" role="alert">{{ editNotice }}</small>
                </div>
              </div>
            </section>

            <section v-show="editorSection === 'discs'" id="operator-editor-discs" class="editor-row disc-editor-row" role="tabpanel" aria-labelledby="operator-editor-tab-discs" tabindex="0" data-editor-section="discs">
              <div class="editor-section-head"><h4 class="editor-label"><Target :size="23" aria-hidden="true" />命盘</h4><p>配置命盘组合，提升密探的战斗能力。</p></div>
              <div class="disc-loadout-editor">
                <div
                  class="disc-loadout-tabs"
                  role="tablist"
                  aria-label="命盘组合"
                >
                  <button
                    v-for="(loadout, index) in editForm.discLoadouts"
                    :id="'disc-loadout-tab-' + index"
                    :key="loadout.id"
                    type="button"
                    role="tab"
                    :aria-selected="selectedDiscLoadoutIndex === index"
                    :aria-controls="'disc-loadout-panel-' + index"
                    :tabindex="selectedDiscLoadoutIndex === index ? 0 : -1"
                    :class="{ on: selectedDiscLoadoutIndex === index }"
                    @click="selectedDiscLoadoutIndex = index"
                    @keydown.left.prevent="
                      selectDiscLoadoutTab(index - 1, true)
                    "
                    @keydown.right.prevent="
                      selectDiscLoadoutTab(index + 1, true)
                    "
                  >
                    <CircleCheck v-if="selectedDiscLoadoutIndex === index" class="disc-combination-mark" :size="22" aria-hidden="true" /><Circle v-else class="disc-combination-mark" :size="22" aria-hidden="true" />
                    <span class="disc-combination-label">组合 {{ index + 1 }} · {{ DISC_STATUSES[loadout.status] }}</span>
                    <strong :title="loadout.name">{{ loadout.name || "未命名组合" }}</strong>
                  </button>
                </div>

                <div
                  v-if="selectedDiscLoadout"
                  :id="'disc-loadout-panel-' + selectedDiscLoadoutIndex"
                  class="disc-loadout-panel"
                  role="tabpanel"
                  :aria-labelledby="
                    'disc-loadout-tab-' + selectedDiscLoadoutIndex
                  "
                >
                  <div class="disc-loadout-toolbar">
                    <label
                      class="disc-loadout-name"
                      :for="'disc-loadout-name-' + selectedDiscLoadoutIndex"
                    >
                      <span class="disc-loadout-name-head">
                        <span>组合名称</span>
                      </span>
                      <input
                        :id="'disc-loadout-name-' + selectedDiscLoadoutIndex"
                        :value="selectedDiscLoadout.nameMode !== 'manual' && !selectedDiscLoadout.discNames.length ? '' : selectedDiscLoadout.name"
                        placeholder="选择命盘后自动命名"
                        type="text"
                        maxlength="64"
                        autocomplete="off"
                        @input="
                          setDiscLoadoutName(selectedDiscLoadoutIndex, $event)
                        "
                        @blur="ensureDiscLoadoutName(selectedDiscLoadoutIndex)"
                      />
                    </label>
                    <label class="disc-auto-toggle">
                      <input type="checkbox" role="switch"
                        :checked="selectedDiscLoadout.nameMode !== 'manual'"
                        @change="$event.target.checked ? resetDiscLoadoutName(selectedDiscLoadoutIndex) : selectedDiscLoadout.nameMode = 'manual'" />
                      <span class="disc-toggle-track" aria-hidden="true"></span>
                      <span>自动命名</span>
                    </label>
                    <div class="disc-status-field">
                      <span>组合标记</span>
                      <div class="disc-status-controls" role="group" aria-label="组合标记">
                        <button v-for="(label, status) in DISC_STATUSES" :key="status" type="button" :aria-pressed="selectedDiscLoadout.status === status"
                          :class="{ on: selectedDiscLoadout.status === status }" @click="selectedDiscLoadout.status = status">{{ label }}</button>
                      </div>
                    </div>
                  </div>

                  <OperatorDiscComparison class="disc-editor-comparison" :current="selectedDiscLoadout.discNames" :target="selectedDiscLoadout.targetDiscNames" :catalog="editingDiscs" editable
                    @copy="copyCurrentDiscTarget" @remove="removeDiscTarget">
                    <template #current-action>
                      <button type="button" class="disc-edit-action" :aria-pressed="!editingDiscTarget" @click="editingDiscTarget = false">编辑当前</button>
                    </template>
                    <template #target-action>
                      <button type="button" class="disc-edit-action" :aria-pressed="editingDiscTarget" @click="editingDiscTarget = true">编辑目标</button>
                    </template>
                  </OperatorDiscComparison>
                  <div class="disc-editing-workspace">
                    <div class="disc-options">
                      <div class="disc-options-head">
                        <h5>组合 {{ selectedDiscLoadoutIndex + 1 }} · {{ editingDiscTarget ? '编辑目标命盘' : '编辑当前命盘' }}</h5>
                        <strong
                          >已选 {{ selectedDiscNames.length }} / 3</strong
                        >
                      </div>
                      <p class="disc-options-help">最多选择 3 项，再次点击可取消</p>
                      <div class="disc-options-grid">
                        <p v-if="!editingDiscs.length" class="hint">
                          该密探暂无命盘目录数据，可直接留空保存。
                        </p>
                        <label
                          v-for="d in editingDiscs"
                          :key="discKey(d)"
                          class="disc-option"
                          :class="[discColorClass(d), { on: isDiscSelected(d) }]"
                        >
                          <input
                            type="checkbox"
                            :checked="isDiscSelected(d)"
                            @change="toggleDiscSelection(d, $event)"
                          />
                          <Check v-if="isDiscSelected(d)" class="disc-selected-check" :size="16" aria-hidden="true" />
                          <span
                            class="disc-name disc-term-label"
                            tabindex="0"
                            @mouseenter="
                              showDiscTooltip($event, discDescription(d))
                            "
                            @mouseleave="hideDiscTooltip"
                            @focus="showDiscTooltip($event, discDescription(d))"
                            @blur="hideDiscTooltip"
                            >{{ discKey(d) }}</span
                          >
                        </label>
                      </div>
                    </div>
                    <OperatorDiscPresets
                      :key="editingId + ':' + selectedDiscLoadoutIndex + ':' + editingDiscTarget"
                      :operator-id="editingId" :catalog="editingDiscs" :model-value="selectedDiscNames"
                      :destination="'组合 ' + (selectedDiscLoadoutIndex + 1) + ' 的' + (editingDiscTarget ? '目标命盘' : '当前命盘')"
                      :disabled="savingEdit" @update:model-value="applyDiscPresetNames"
                    />
                  </div>
                </div>

                <p class="disc-storage-note">
                  两套组合、标记和目标均保存到当前账号；目标不会替换实际命盘。
                </p>
              </div>
            </section>

            <section v-show="editorSection === 'stars'" id="operator-editor-stars" class="editor-row editor-stars-section" role="tabpanel" aria-labelledby="operator-editor-tab-stars" tabindex="0" data-editor-section="stars">
              <div class="stone-editor">
                <StarLoadoutEditor
                  v-if="editingOp"
                  inline
                  :target-operator="editingOp"
                  :inventory-entries="starInventoryEntries"
                  :draft-loadouts="starLoadoutDrafts"
                  :initial-slot="starLoadoutInlineSlot"
                  :operator-display-name-map="starOperatorDisplayNames"
                  @update:draft-loadouts="starLoadoutDrafts = $event"
                />
                <StarBreakthroughEditor :account-id="accountId" :state="starStateSnapshot" :loadout="starLoadoutDrafts[editingOp?.id]" @saved="acceptStarBreakthroughState" />
              </div>
            </section>
          </div>

          <div class="editor-actions">
            <div v-if="editConflictDraft" class="editor-conflict" role="alert">
              <strong>服务器数据已更新</strong>
              <div class="editor-conflict-actions">
                <button
                  type="button"
                  class="editor-conflict-btn"
                  @click="discardConflictDraft"
                >
                  保留服务器数据
                </button>
                <button
                  type="button"
                  class="editor-conflict-btn primary"
                  @click="restoreConflictDraft"
                >
                  恢复我的修改
                </button>
              </div>
            </div>
            <div
              v-if="!editConflictDraft"
              class="editor-action-status"
              :class="{ err: editNoticeError, 'is-idle': !savingEdit && !editNotice && !editorDirty }"
              role="status"
            >
              {{ editorActionStatus }}
            </div>
            <div class="editor-action-buttons">
              <button
                class="btn editor-cancel"
                type="button"
                :disabled="savingEdit"
                @click="closeEditor"
              >
                取消
              </button>
              <button
                class="btn primary editor-save"
                type="button"
                :disabled="savingEdit || !editorDirty"
                :title="editorDirty ? '保存当前修改到云端' : '暂无需要保存的修改'"
                @click="saveEdit"
              >
                <Save :size="16" aria-hidden="true" />
                {{ savingEdit ? "保存中…" : "保存到云端" }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Teleport to="body">
        <div
          v-if="discTooltip.visible"
          id="disc-floating-tooltip"
          class="disc-floating-tooltip"
          :class="'is-' + discTooltip.placement"
          :style="{ left: discTooltip.x + 'px', top: discTooltip.y + 'px' }"
          role="tooltip"
        >
          {{ discTooltip.text }}
        </div>
      </Teleport>

      <SiteFooter>
        <template #big>密探养成<br /><span>图鉴 · 快照 · 归档</span></template>
        <template #fine>
          <b>YuanHub</b> · 密探养成档案<br />
          MaaYuan × 鸢BWiki × 辟雍学府 × YuanAssist 共同搭建<br />
          数据仅供参考，请以游戏内实际养成为准
        </template>
      </SiteFooter>
      <OperatorDiscTargetModal :entry="discTargetEntry" :catalog="catalogMap[discTargetEntryId]?.discs || []"
        @close="discTargetEntryId = ''" @edit="editDiscTarget" />
      <StarLoadoutModal
        :open="starLoadoutOpen"
        :target-operator="starLoadoutTarget"
        :inventory-entries="starInventoryEntries"
        :draft-loadouts="starLoadoutDrafts"
        :initial-slot="starLoadoutActiveSlot"
        :saving="starLoadoutSaving"
        :error="starLoadoutError"
        :operator-display-name-map="starOperatorDisplayNames"
        @request-close="requestCloseStarLoadout"
        @update:draft-loadouts="starLoadoutDrafts = $event"
      />
      <OperatorMilestoneDialog v-if="milestoneEntry && auth.isLoggedIn && accountId" :entry="milestoneEntry" :account-id="accountId" :game="saveGame" :user-id="auth.userInfo?.id || ''" @close="milestoneEntry = null" />
      <OperatorAwakeningDialog v-if="awakeningEntry" :key="accountId + ':' + awakeningEntry.id"
        :entry="awakeningEntry" :account-id="accountId" :game="saveGame" :refresh="refreshAwakeningEntry"
        @close="awakeningId = ''" @saved="onAwakeningSaved" />
    </main>
  </div>
</template>

<script setup>
import { operatorHuaji, operatorHuajiMax, operatorHuajiLabel, operatorHuajiAction, operatorAwakeningSupported, operatorAwakeningUpgradeSupported, operatorHuajiDraft } from '../../utils/operatorHuaji.js';
import OperatorMilestoneDialog from '../../components/operator/OperatorMilestoneDialog.vue';
import OperatorAwakeningDialog from '../../components/operator/OperatorAwakeningDialog.vue';
import { useAccountListUpdates, publishAccountList } from '../../store/accountList.js'
import { updateAccount } from '../../api/accounts.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { matchesOperatorQuality } from "../../utils/operatorForms.js";
import { onWorkspaceTabKeydown, onWorkspaceTabFocus } from "../../utils/workspaceTabs.js";
import { usePersistedTab } from "../../utils/persistedTab.js";
import {
  ref,
  computed,
  watch,
  nextTick,
  onBeforeUnmount,
  onMounted,
  defineAsyncComponent,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import OperatorRelationships from "./OperatorRelationships.vue";
import { useUnsavedChanges } from "../../utils/useUnsavedChanges.js";
import { buildOperatorV2BrowserPreview } from "../../utils/operatorV2ImportPreview.js";
import {
  Archive,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleCheck,
  Download,
  Heart,
  Eye,
  ListChecks,
  Pencil,
  RotateCcw,
  Save,
  Share2,
  ScanLine,
  SlidersHorizontal,
  Star,
  Swords,
  Target,
  Upload,
  Users,
  X,
  Plus,
  Sparkles,
} from "@lucide/vue";
import IslandSidebar from "../../components/IslandSidebar.vue";
import SiteFooter from "../../components/SiteFooter.vue";
import AccountWorkspace from "../../components/AccountWorkspace.vue";
import OperatorScanReviewForm from "../../components/operator/OperatorScanReviewForm.vue";
import CompactToolHeader from "../../components/CompactToolHeader.vue";
import TutorialEntry from "../../components/TutorialEntry.vue";
import OnboardingGuide from "../../components/OnboardingGuide.vue";
import ToolTaskPrompt from "../../components/ToolTaskPrompt.vue";
import DataAccountContextBar from "../../components/DataAccountContextBar.vue";
import OperatorFilterDossier from "../../components/operator/OperatorFilterDossier.vue";
import OperatorOrganizationManager from "../../components/operator/OperatorOrganizationManager.vue";
import OperatorOrganizationCard from "../../components/operator/OperatorOrganizationCard.vue";
import { useOperatorOrganization } from "../../composables/useOperatorOrganization.js";
import { OPERATOR_ORGANIZATION_FORMAT, compareOperatorOrganization, operatorOrganizationBackup, operatorOrganizationContent, operatorOrganizationRanks, readOperatorOrganizationBackup, updateOperatorTag } from "../../utils/operatorOrganization.js";
import OperatorBoxViewer from "../../components/operator/OperatorBoxViewer.vue";
import OperatorShareManager from "../../components/operator/OperatorShareManager.vue";
import OperatorAvatar from "../../components/operator/OperatorAvatar.vue";
import StarLoadoutEditor from "../../components/operator/StarLoadoutEditor.vue";
import OperatorEditorNav from "./OperatorEditorNav.vue";
import OperatorDiscComparison from "../../components/operator/OperatorDiscComparison.vue";
import OperatorDiscPresets from "../../components/operator/OperatorDiscPresets.vue";
import OperatorDiscTargetModal from "../../components/operator/OperatorDiscTargetModal.vue";
import StarLoadoutModal from "../../components/operator/StarLoadoutModal.vue";
import ShareCardStats from "../../components/operator/ShareCardStats.vue";
import operatorPortraits from "../../data/operatorPortraits.json";
import { batchImageDirective as vBatchImage } from "../../utils/batchImage.js";
import { BOOK_VALUES, bookExperience, levelBookGapBundle } from "../../data/operatorTraining.js";
import { FEATURE_KEYS, isFeatureEnabled, TUTORIALS_ENABLED } from "../../config/features.js";
import {
  ACTIVE_OPERATOR_LEDGER_CARD_VERSION,
  OPERATOR_LEDGER_CARD_VERSIONS,
  operatorLedgerCardVersionClass,
} from "../../config/operatorLedgerCard.js";
const OperatorGrowthTracker = defineAsyncComponent(function () {
  return import("../../components/operator/OperatorGrowthTracker.vue");
});
import {
  getOperatorCatalog,
  listOperatorAccounts,
  getOperatorCurrent,
  removeOrphanOperatorCurrent,
  patchOperatorCurrent,
  getOperatorAnnotations,
  putOperatorAnnotation,
  previewOperatorUpgrade,
  executeOperatorUpgrade,
  importOperator,
  previewOperatorImport,
  listOperatorScanReviews,
  closeOperatorScanReview,
  exportOperator,
  previewOperatorPanel,
  getCurrentOperatorPanels,
} from "../../api/operator.js";
import { createOperatorPanelRequest, operatorPanelHint, operatorPanelPreviewBody } from "../../utils/operatorPanelRequest.js";
import { avatarUrl } from "../../api/request.js";
import { subscribeAccountEvents } from "../../store/accountEvents.js";
import {
  OPERATOR_STATUS_OPTIONS,
  operatorEditableStatusOptions,
  operatorAnnotationStatus,
  operatorAnnotationApiState,
  operatorAnnotationStatusLabel,
  matchesOperatorStatus,
  reconcileOperatorAnnotations,
} from "../../utils/operatorAnnotations.js";
import OperatorLevelBreakthroughSelect from "../../components/operator/OperatorLevelBreakthroughSelect.vue";
import StarBreakthroughEditor from "../../components/operator/StarBreakthroughEditor.vue";
import { auth } from "../../store/auth.js";
import { ADMIN_PERMISSIONS, hasPermission } from "@/utils/authPermissions.js";
import { activeAccount } from "../../store/activeAccount.js";
import { dialog } from "../../utils/dialog.js";
import { operatorUpdateFromEvent, publishOperatorCurrentRead } from "../../utils/operatorEvents.js";
import {
  OPERATOR_LEVEL_MAX,
  OPERATOR_ELITE_MAX,
  getMaxEliteForLevel,
  inferredLevelBreakthroughStage,
  operatorLevelBreakthroughStage,
} from "../../utils/operatorGrowthRules.js";
import {
  OPERATOR_TAB_STORAGE_KEY,
  setActiveOperatorTab,
} from "../../utils/operatorTabs.js";
import { AGENT_CATALOG, AGENT_PROFS } from "../../data/inventory/catalog.js";
import {
  OPERATOR_RARITY_LABELS,
  OPERATOR_RARITY_OPTIONS,
  hasActiveManifestFilters,
  isOperatorOwned,
  matchesManifestFilters,
  matchesOperatorGrowthFilters,
  matchesOperatorSearch,
  matchesProfSubFilter,
  subProfList,
  subProfOptions as deriveSubProfOptions,
} from "../../utils/operatorFilters.js";
import {
  automaticDiscLoadoutName,
  createDiscLoadoutState,
  createDiscLoadout,
  DISC_STATUSES,
  discLoadoutPayload,
  discTargetSummary,
  discTargetSummaryItems,
  matchesDiscStatus,
  DISC_FILTER_OPTIONS,
} from "../../utils/operatorDiscLoadouts.js";
import {
  starCardFallback,
  starCardHasIcon,
  starCardNode,
  starCardNumber,
} from "../../utils/operatorStarDisplay.js";
import {
  getCurrent as getInventoryCurrent,
  listAgentFavorites,
  addAgentFavorite,
  removeAgentFavorite,
} from "../../api/inventory.js";
import { getCurrentStarState } from "../../api/starState.js";
import { getCurrentStarLoadout, putCurrentStarLoadout } from "../../api/starLoadout.js";
import { emptyLoadout, normalizeLoadout } from "../../domain/starLoadout.js";
import { starLoadoutPresetStore } from "../../domain/starLoadoutPresets.js";
import { ITEM_CATALOG } from "../../data/inventory/catalog.js";
import {
  calculateLevelRequirements,
  calculateStarRequirements,
  calculateAwakeningRequirements,
  calculateXiuweiRequirements,
  netRequirement,
  starStageFromLevel,
  starLabelForStage,
} from "../../data/operatorRequirements.js";
import {
  OPERATOR_ODDITY_KEYS,
  calculateOperatorCombatStats,
  combatInputSignature,
  combatStatsSourceLabel,
  fillOperatorDraftToMax,
  fillOperatorOdditiesToMax,
  normalizeOperatorCombatStats,
  normalizeOperatorOddities,
  normalizeOperatorOdditySchema,
  operatorOddityCompletion,
  operatorOddityCurrentError,
} from "../../utils/operatorCombatStats.js";
import {
  buildOperatorV3BrowserRequest,
  isOperatorV3Document,
  normalizeOperatorV3ImportResponse,
  operatorV3CommittableCount,
  isOperatorScanReviewDraft,
} from "../../utils/operatorV3Import.js";
import { operatorReviewCanClose, operatorReviewField, operatorReviewFieldLabel, operatorReviewIssueText, operatorReviewReceiptItem, operatorReviewSource, operatorReviewValueLabel } from "../../utils/operatorScanReview.js";

const ODDITY_KEYS = OPERATOR_ODDITY_KEYS;
const growthTrackingEnabled = isFeatureEnabled(
  FEATURE_KEYS.OPERATOR_GROWTH_TRACKING,
);
const ledgerCardVersionClass = operatorLedgerCardVersionClass();
const ledgerCardIsV3 =
  ACTIVE_OPERATOR_LEDGER_CARD_VERSION === OPERATOR_LEDGER_CARD_VERSIONS.V3;
// V3 uses the V2 controls and data presentation beneath its portrait skin.
const ledgerCardIsV2 =
  ACTIVE_OPERATOR_LEDGER_CARD_VERSION === OPERATOR_LEDGER_CARD_VERSIONS.V2 || ledgerCardIsV3;
const failedPortraitIds = ref(new Set());
const compactStats = ref(false);
let compactStatsQuery = null;

function syncCompactStats() {
  compactStats.value = compactStatsQuery.matches;
}

const route = useRoute();
const router = useRouter();
const activeTab = usePersistedTab(
  OPERATOR_TAB_STORAGE_KEY,
  "catalog",
  growthTrackingEnabled ? ["catalog", "current", "relationships", "tracking"] : ["catalog", "current", "relationships"],
);
const relationshipWorkspace = ref(null);
const visitedTabs = ref(new Set(["catalog", activeTab.value]));
watch(activeTab, setActiveOperatorTab, { immediate: true, flush: "sync" });
let operatorNavigationReady = false;
let operatorNavigationSeq = 0;
let operatorAccountDataReady = false;
let operatorPageDisposed = false;
const manifestSearch = ref("");
const currentSearch = ref("");
const catalogFilters = ref(null);
const manifestFilter = ref("all");
const manifestStatusOptions = [
  { value: 'all', label: '全部' },
  { value: 'owned', label: '已招募' },
  { value: 'missing', label: '未招募' },
];
const rarityFilter = ref("all");
const profFilter = ref("all");
const subProfFilter = ref("all");
const discardedEnabled = isFeatureEnabled(FEATURE_KEYS.OPERATOR_DISCARDED);
const editableStatusOptions = operatorEditableStatusOptions();
const defaultStatusFilter = discardedEnabled ? "registered" : "all";
const workbenchStatusFilter = ref(defaultStatusFilter);
const emptyGrowthFilters = () => ({
  levelMin: "", levelMax: "", levelEnabled: false,
  eliteMin: "", eliteMax: "", eliteEnabled: false,
  starMin: "", starMax: "", starEnabled: false,
});
const growthFilters = ref(emptyGrowthFilters());
const manifestGrowthFilters = ref(emptyGrowthFilters());
const upgradeReadyFilter = ref("");
const favoriteFirst = ref(false);
const rarityOptions = OPERATOR_RARITY_OPTIONS;
const rarityLabelMap = OPERATOR_RARITY_LABELS;
const profOptions = AGENT_PROFS;
const subProfOptions = computed(function () {
  return deriveSubProfOptions(catalogOperators.value);
});
const workbenchStatusOptions = computed(() => discardedEnabled ? [
  { value: "registered", label: "在册" },
  ...OPERATOR_STATUS_OPTIONS.map(option => ({ ...option, separateGroup: option.value === "discarded" }))
    .sort((a, b) => organizationRanks.value.states.get(a.value) - organizationRanks.value.states.get(b.value)),
  { value: "all", label: "全部（含已弃置）" },
] : [{ value: "all", label: "全部" }, ...editableStatusOptions.slice()
  .sort((a, b) => organizationRanks.value.states.get(a.value) - organizationRanks.value.states.get(b.value))]);
const loading = ref(false);
const catalogLoading = ref(false);
const error = ref("");
const catalogError = ref("");
const catalogVersion = ref("");
const backendCatalog = ref(null);
const currentEntries = ref([]);
const removingOrphanId = ref("");
const orphanNotice = ref("");
const showArchive = ref(false);
const showImport = ref(false);
const importText = ref("");
const importError = ref("");
const importRequestIssue = ref(null);
const importing = ref(false);
const importResult = ref(null);
const importPreview = ref(null);
const importPreviewKey = ref("");
const organizationImportPreview = ref(null);
const organizationImportMessage = ref("");
const importV2Preview = ref(null);
const importV2PreviewKey = ref("");
const importConfirmReview = ref(false);
const scanReviews = ref([]);
const scanReviewError = ref("");
const selectedScanReview = ref(null);
const scanReviewForm = ref(null);
const scanReviewErrorEl = ref(null);
const scanReviewCurrent = ref(null);
const scanReviewCurrentLoading = ref(false);
const scanReviewCurrentError = ref("");
const scanReviewSavedMessage = ref("");
const scanReviewDirty = ref(false);
const scanReviewComplete = ref(false);
const confirmScanReviewDiscard = useUnsavedChanges(scanReviewDirty, "扫描复核内容");
const v3Receipt = computed(() => importPreview.value || (importResult.value?.kind === 'v3' ? importResult.value : null));
let importOperationSeq = 0;
let scanReviewCurrentSeq = 0;
let scanReviewTrigger = null;
let scanReviewLoadSeq = 0;
const favoriteAgentIds = ref(new Set());
const favoriteBusyIds = ref(new Set());
const favoriteLoading = ref(false);
const favoriteError = ref("");
const scanEffectById = ref({});
let favoriteLoadSeq = 0;
let catalogLoadSeq = 0;
let currentLoadSeq = 0;
const currentLoadedKey = ref("");
let currentContextSeq = 0;
let favoriteLoadedAccount = "";
let accountEventRefreshTimer = null;
let subjectiveEventRefreshTimer = null;
const subjectiveEventKinds = new Set();
let unsubscribeAccountEvents = null;
let scanFocusSeq = 0;
let finishPendingScanScroll = null;
const scanEffectTimers = new Map();
const operatorSlotElements = new Map();
const currentLedgerCardElements = new Map();

// 当前养成台账卡的交互状态。状态与备忘以云端 annotation 为真相源；
// localStorage 只保留迁移与断网回退用途。
const quickEditorKey = ref("");
const quickConfirmKey = ref("");
const quickDrafts = ref({});
const quickSavingIds = ref(new Set());
const quickNotices = ref({});
const awakeningId = ref('');
const milestoneEntry = ref(null);
const awakeningEntry = computed(() => currentMap.value[awakeningId.value] || null);
const workbenchStatuses = ref({});
const workbenchRemarks = ref({});
const workbenchRemarkSaving = ref(new Set());
const annotationRevisions = ref({});
const annotationBusyIds = ref(new Set());
const annotationError = ref("");
const annotationUnsupportedStates = computed(() => [...new Set(Object.values(workbenchStatuses.value)
  .filter(state => !OPERATOR_STATUS_OPTIONS.some(option => option.value === operatorAnnotationStatus(state))))]);
const annotationNotice = ref("");
const annotationNoticeTarget = ref("");
const batchStatusBusy = ref(false);
const subjectiveRefreshKey = ref(0);
const batchSelectMode = ref(false);
const batchSelectionBase = ref(new Set());
let annotationLoadSeq = 0;
let annotationScopeSeq = 0;
const cardCombatDrafts = ref({});
const cardCombatModes = ref({});
const cardCombatEditedKeys = ref(new Set());
const cardCombatSavingIds = ref(new Set());
const cardGrowthDrafts = ref({});
const cardPopoverKey = ref("");
const cardMaterialStock = ref({});
const cardMaterialLoading = ref(false);
let cardMaterialLoadSeq = 0;
const cardMaterialLoadedAccount = ref("");
const cardSubmitStates = ref({});
const cardSubmitTimers = new Map();
const cardDraftBaselines = ref({});
const cardPopoverStep = ref(0);
const cardHeartStock = ref({});
const cardLevelBreakthroughs = ref({});
const growthPreviews = ref({});
const growthPreviewBusyKeys = ref(new Set());
const growthExecuteBusyKeys = ref(new Set());
const growthExecutionKeys = new Map();
const growthPreviewRequestSequences = new Map();
const handledUpgradeTransactionIds = new Set();
const discTooltip = ref({
  visible: false,
  text: "",
  x: 0,
  y: 0,
  placement: "top",
});

// —— 单个密探编辑弹窗 ——
const editing = ref(false);
const editingId = ref("");
const editingOp = ref(null);
const editorSection = ref('growth');
const editGame = ref("");
const editForm = ref({
  elite: 1,
  starLevel: 0,
  level: 1,
  levelBreakthroughStage: 0,
  discLoadouts: [],
  stones: {},
  combatStats: normalizeOperatorCombatStats({}),
});
const combatDisplayMode = ref({ attack: null, hp: null });
const selectedDiscLoadoutIndex = ref(0);
const editingDiscTarget = ref(false);
const discStatusFilter = ref("all");
const discTargetEntryId = ref("");
const discTargetEntry = computed(() => {
  const entry = currentEntries.value.find(item => item.id === discTargetEntryId.value);
  return entry ? { ...entry, discLoadouts: cardGrowthDrafts.value[entry.id]?.discLoadouts || entry.discLoadouts } : null;
});
const editNotice = ref("");
const editNoticeError = ref(false);
const editOddityErrorKey = ref("");
const savingEdit = ref(false);
const editOriginalStoneSignature = ref("");
const editConflictDraft = ref(null);
const editBaseline = ref("");
const editorDirty = computed(function () {
  return editing.value &&
    (JSON.stringify([editForm.value, combatDisplayMode.value]) !== editBaseline.value || starLoadoutIsDirty());
});
const editorActionStatus = computed(function () {
  if (savingEdit.value) return '正在保存到云端…';
  if (editNoticeError.value) return editNotice.value;
  if (editorDirty.value && editNotice.value === '养成资料已保存') return '有未保存的修改，请确认后保存';
  return editNotice.value || (editorDirty.value ? '有未保存的修改，请确认后保存' : '尚未修改');
});
const confirmEditorDiscard = useUnsavedChanges(editorDirty, "密探编辑内容");
// C2 source of truth: Current Inventory + Current Star Loadout only.
const starLoadoutOpen = ref(false);
const starLoadoutTarget = ref(null);
const starLoadoutActiveSlot = ref("main1");
const starLoadoutInlineSlot = ref("main1");
const starInventoryEntries = ref([]);
const starStateSnapshot = ref(null);
const starLoadoutCurrent = ref({});
const starLoadoutDrafts = ref({});
const starLoadoutRevision = ref(0);
const starLoadoutAccountId = ref("");
const starStateGeneration = ref(0);
const starLoadoutLoading = ref(false);
const starLoadoutSaving = ref(false);
const starLoadoutError = ref("");
let starLoadoutLoadSeq = 0;
let starLoadoutSaveSeq = 0;
const editorPanelEl = ref(null);
const editorBodyEl = ref(null);
const { viewportStyle: editorViewportStyle, shortViewport: editorShortViewport, revealFocusedControl: revealEditorControl } = useModalViewport(editing, editorBodyEl, editorPanelEl);
let bodyOverflowBeforeEditor = "";
let bodyLockedByEditor = false;
let editorTriggerEl = null;

// 编辑保存目标版本跟随当前子账号。
const saveGame = computed(function () {
  return gameFilter.value;
});

// 首次 / 快捷导入：把当前子账号带到向导页默认选中
const quickHref = computed(function () {
  return accountId.value
    ? "/operator/quick?account=" + encodeURIComponent(accountId.value)
    : "/operator/quick";
});
const quickSupplementHref = computed(() => quickHref.value + (accountId.value ? '&' : '?') + 'mode=supplement');

// —— 统一子账号（库存 × 密探共用） ——
const accounts = ref([]);
useAccountListUpdates(next => { accounts.value = next })
// 当前选中账号由 activeAccount store 记忆并持久化（跨页面导航 / 刷新不丢）
const accountId = computed({
  get: function () {
    return activeAccount.id;
  },
  set: function (v) {
    activeAccount.set(v);
  },
});
const gameFilter = computed({
  get: function () {
    return activeAccount.gameFor(accountId.value);
  },
  set: function (v) {
    activeAccount.setGame(v, accountId.value);
  },
});

const organizationTagFilter = ref("");
const organizationManager = ref(null);
const organizationDirty = computed(() => Boolean(organizationManager.value?.changed));
const confirmOrganizationDiscard = useUnsavedChanges(organizationDirty, "分类设置", { title: "放弃未保存的分类设置？" });
const { data: organizationData, loading: organizationLoading, saving: organizationSaving, error: organizationError,
  ready: organizationReady, reload: reloadOrganization, save: saveOrganization } = useOperatorOrganization(accountId, computed(() => auth.isLoggedIn));
const organizationRanks = computed(() => operatorOrganizationRanks(organizationData.value));
const organizationTagMembers = computed(() => new Set(organizationData.value.tags.find(tag => tag.id === organizationTagFilter.value)?.operator_ids || []));
const organizationTagOptions = computed(() => {
  const owned = new Set(ownedCurrentEntries.value.map(entry => entry.id));
  return organizationData.value.tags.map(tag => ({ value: tag.id, label: tag.name, count: tag.operator_ids.filter(id => owned.has(id)).length }));
});
watch(() => [accountId.value, gameFilter.value, auth.userInfo?.id, auth.isLoggedIn], () => { milestoneEntry.value = null; }, { flush: "sync" });
watch([accountId, gameFilter], () => { organizationTagFilter.value = ""; }, { flush: "sync" });
watch(() => organizationData.value.tags, tags => {
  if (organizationTagFilter.value && !tags.some(tag => tag.id === organizationTagFilter.value)) organizationTagFilter.value = "";
});

async function toggleOperatorPin(id) {
  const next = operatorOrganizationContent(organizationData.value);
  next.pinned_ids = next.pinned_ids.includes(id) ? next.pinned_ids.filter(value => value !== id) : [id, ...next.pinned_ids];
  await saveOrganization(next);
}

async function setOperatorTag(ids, tagId, add) {
  await saveOrganization(updateOperatorTag(organizationData.value, tagId, ids, add));
}

watch(
  () => [accountId.value, gameFilter.value, auth.isLoggedIn],
  () => {
    currentContextSeq += 1;
    currentLoadSeq += 1;
    currentLoadedKey.value = "";
    currentEntries.value = [];
    discTargetEntryId.value = "";
    discStatusFilter.value = "all";
    awakeningId.value = '';
    quickEditorKey.value = "";
    quickConfirmKey.value = "";
    quickDrafts.value = {};
    quickNotices.value = {};
    cardPopoverKey.value = "";
    cardGrowthDrafts.value = {};
    cardCombatDrafts.value = {};
    cardDraftBaselines.value = {};
    growthPreviews.value = {};
    growthPreviewRequestSequences.clear();
    growthPreviewBusyKeys.value = new Set();
    growthExecuteBusyKeys.value = new Set();
    growthExecutionKeys.clear();
    editing.value = false;
    editingId.value = "";
    editingOp.value = null;
    editConflictDraft.value = null;
    resetImportPreview();
    importText.value = "";
    importResult.value = null;
    importError.value = "";
    importing.value = false;
    showImport.value = false;
    showArchive.value = false;
    savingEdit.value = false;
    cardSubmitStates.value = {};
    cardSubmitTimers.forEach(clearTimeout);
    cardSubmitTimers.clear();
  },
  { flush: "sync" },
);

watch(
  function () {
    return [accountId.value, saveGame.value];
  },
  function () {
    starLoadoutLoadSeq += 1;
    starLoadoutSaveSeq += 1;
    starLoadoutAccountId.value = "";
    starLoadoutLoading.value = false;
    starLoadoutSaving.value = false;
    closeStarLoadout();
    starLoadoutTarget.value = null;
    starLoadoutError.value = "";
    starInventoryEntries.value = [];
    starStateSnapshot.value = null;
    starLoadoutCurrent.value = {};
    starLoadoutDrafts.value = {};
    starLoadoutRevision.value = 0;
    starStateGeneration.value = 0;
    annotationScopeSeq += 1;
    annotationNotice.value = "";
    annotationNoticeTarget.value = "";
    batchStatusBusy.value = false;
    workbenchStatusFilter.value = defaultStatusFilter;
    workbenchStatuses.value = readWorkbenchMap("statuses");
    workbenchRemarks.value = readWorkbenchMap("remarks");
    annotationRevisions.value = {};
    annotationError.value = "";
    cardCombatModes.value = readWorkbenchMap("combat-modes");
    cardCombatEditedKeys.value = new Set();
    favoriteFirst.value = readFavoriteFirstPreference();
    cardLevelBreakthroughs.value = {};
    upgradeReadyFilter.value = "";
    batchSelectMode.value = false;
    batchSelectionBase.value = new Set();
    annotationBusyIds.value = new Set();
    loadOperatorAnnotations();
    if (
      (visitedTabs.value.has("current") || visitedTabs.value.has("tracking")) &&
      cardMaterialLoadedAccount.value !== accountId.value
    )
      loadCardMaterialStock();
  },
  { immediate: true },
);
const accountWorkspaceCompact = ref(true);
const boxViewerOpen = ref(false);
const shareModalOpen = ref(false);
const operatorShare = ref(null);
const isOperatorSharing = computed(() => auth.isLoggedIn && operatorShare.value?.accountId === accountId.value && !!operatorShare.value?.link);
const ledgerShareStatus = computed(() => {
  if (!auth.isLoggedIn || !accountId.value) return "未开启";
  if (operatorShare.value?.accountId !== accountId.value) return "读取中…";
  return operatorShare.value.status;
});
watch(() => [accountId.value, gameFilter.value, auth.isLoggedIn], () => {
  importOperationSeq += 1;
  scanReviewCurrentSeq += 1;
  scanReviewLoadSeq += 1;
  selectedScanReview.value = null;
  scanReviewDirty.value = false;
  scanReviewComplete.value = false;
  scanReviewCurrent.value = null;
  scanReviewCurrentError.value = '';
  scanReviewCurrentLoading.value = false;
  scanReviewSavedMessage.value = '';
  scanReviews.value = [];
  importText.value = '';
  importResult.value = null;
  importError.value = '';
  importing.value = false;
  showImport.value = false;
  resetImportPreview();
  void loadScanReviews();
}, { flush: 'sync' });
watch(importError, async message => {
  if (message && selectedScanReview.value) { await nextTick(); scanReviewErrorEl.value?.focus(); }
});
const accountsLoading = ref(false);
const accountError = ref("");
const exportAll = ref(false);
const currentAccountName = computed(function () {
  const account = accounts.value.find(function (item) {
    return item.id === accountId.value;
  });
  return account ? account.name : "当前账号";
});
const canUseAutomaticPanel = computed(() => auth.isLoggedIn && hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.OPERATOR_PANEL_USE));
const currentPanelAccount = computed(() => auth.isLoggedIn ? accounts.value.find(account => account.id === accountId.value) : null);
const panelAutoFillEnabled = computed(() => canUseAutomaticPanel.value && currentPanelAccount.value?.operator_panel_auto_fill !== false);
const panelPreferenceSaving = ref(false);
const panelPreferenceNotice = ref("");
const panelPreferenceError = ref(false);
let panelPreferenceSequence = 0;
watch(() => [accountId.value, auth.userInfo?.id, auth.isLoggedIn], () => {
  panelPreferenceSequence++;
  panelPreferenceSaving.value = false;
  panelPreferenceNotice.value = "";
  panelPreferenceError.value = false;
}, { flush: 'sync' });
async function togglePanelAutoFill() {
  if (!canUseAutomaticPanel.value || !currentPanelAccount.value || panelPreferenceSaving.value) return;
  const sequence = ++panelPreferenceSequence;
  const target = accountId.value;
  const enabled = !panelAutoFillEnabled.value;
  panelPreferenceSaving.value = true;
  panelPreferenceNotice.value = "正在保存自动补全设置…";
  panelPreferenceError.value = false;
  try {
    const saved = await updateAccount(target, { operator_panel_auto_fill: enabled });
    if (sequence !== panelPreferenceSequence || operatorPageDisposed) return;
    accounts.value = accounts.value.map(account => account.id === target ? saved : account);
    publishAccountList(accounts.value);
    panelPreferenceNotice.value = enabled ? "已开启自动补全，已有录入值优先。" : "已关闭自动补全，单独选择自动计算的密探不受影响。";
  } catch (error) {
    if (sequence !== panelPreferenceSequence || operatorPageDisposed) return;
    panelPreferenceError.value = true;
    panelPreferenceNotice.value = error?.message || "设置保存失败，请重试；当前设置保持不变。";
  } finally {
    if (sequence === panelPreferenceSequence && !operatorPageDisposed) panelPreferenceSaving.value = false;
  }
}

const isOrganizationImport = computed(() => {
  try { return JSON.parse(importText.value).format === OPERATOR_ORGANIZATION_FORMAT; }
  catch (_) { return false; }
});

const importDocumentVersion = computed(function () {
  if (!importText.value.trim()) return null;
  try {
    const parsed = JSON.parse(importText.value);
    const document = parsed && parsed.document ? parsed.document : parsed;
    const version = Number(document && document.version);
    return Number.isInteger(version) ? version : null;
  } catch (_) {
    return null;
  }
});

const canCommitV3Import = computed(function () {
  if (!importPreview.value) return false;
  try {
    const document = parseImportDocument();
    if (selectedScanReview.value && !isOperatorScanReviewDraft(selectedScanReview.value, document)) return false;
    const item = selectedScanReview.value && operatorReviewReceiptItem(importPreview.value, selectedScanReview.value, document);
    const confirmedUnchanged = item?.status === 'unchanged' && !item.blockingErrors.length &&
      !item.warnings.some(issue => /requires_review/.test(issue.code));
    if (operatorV3CommittableCount(importPreview.value) === 0 && !confirmedUnchanged) return false;
    return (
      importPreviewKey.value ===
      JSON.stringify(
        v3ImportRequest(document, importConfirmReview.value),
      )
    );
  } catch (_) {
    return false;
  }
});

async function toggleArchive() {
  if (selectedScanReview.value && !(await closeScanReview())) return;
  showArchive.value = !showArchive.value;
  if (showArchive.value) accountWorkspaceCompact.value = false;
  if (!showArchive.value) showImport.value = false;
}

async function toggleImportPanel() {
  if (selectedScanReview.value) {
    if (await closeScanReview()) showImport.value = true;
  } else showImport.value = !showImport.value;
}

function hideBackupImport() {
  if (!selectedScanReview.value) showImport.value = false;
}

async function loadScanReviews() {
  const targetAccount = accountId.value;
  const seq = ++scanReviewLoadSeq;
  scanReviewError.value = "";
  if (!auth.isLoggedIn || !targetAccount) { scanReviews.value = []; return; }
  try {
    const reviews = await listOperatorScanReviews(targetAccount);
    if (seq === scanReviewLoadSeq && targetAccount === accountId.value)
      scanReviews.value = Array.isArray(reviews) ? reviews : [];
  } catch (err) {
    if (seq === scanReviewLoadSeq && targetAccount === accountId.value) {
      scanReviews.value = [];
      scanReviewError.value = humanErr(err, "待复核结果加载失败");
    }
  }
}

async function openScanReview(review) {
  if (!review || review.account_id !== accountId.value || importing.value) return;
  const contextSeq = currentContextSeq;
  const operation = importOperationSeq;
  const navigationSeq = operatorNavigationSeq;
  if (!selectedScanReview.value && importText.value.trim() && !importResult.value && !(await dialog.confirm({
    title: '放弃未保存的 JSON 导入稿？', message: '打开扫描复核会替换当前导入稿。', type: 'danger', confirmText: '放弃并复核', cancelText: '继续编辑',
  }))) return;
  if (operation !== importOperationSeq) return;
  if (!(await confirmScanReviewDiscard()) || operation !== importOperationSeq || navigationSeq !== operatorNavigationSeq || contextSeq !== currentContextSeq || review.account_id !== accountId.value || operatorPageDisposed) return;
  try {
    operatorReviewSource(review);
    scanReviewTrigger = document.activeElement;
    selectedScanReview.value = { ...review, draftRecordId: newScanReviewRecordId(), correctedAt: new Date().toISOString() };
    scanReviewDirty.value = false;
    scanReviewComplete.value = false;
    scanReviewSavedMessage.value = '';
    scanReviewCurrent.value = null;
    showArchive.value = true;
    accountWorkspaceCompact.value = false;
    showImport.value = true;
    importText.value = '';
    onImportTextInput();
    void readScanReviewCurrent();
    void nextTick(() => { scanReviewForm.value?.focus(); document.querySelector(".scan-review-context")?.scrollIntoView?.({ block: "start" }); });
  } catch (err) {
    scanReviewError.value = humanErr(err, "无法打开采集结果");
  }
}

function newScanReviewRecordId() {
  return "review:" + (globalThis.crypto?.randomUUID?.() || Date.now() + ":" + Math.random().toString(36).slice(2));
}

function onScanReviewChange(change) {
  scanReviewDirty.value = change.dirty;
  scanReviewComplete.value = change.complete;
  if (change.saved) return;
  if (change.document && selectedScanReview.value) {
    change.document.records[0].record_id = selectedScanReview.value.draftRecordId;
    if (JSON.stringify(change.document) === importText.value) return;
    selectedScanReview.value.draftRecordId = newScanReviewRecordId();
    change.document.records[0].record_id = selectedScanReview.value.draftRecordId;
    importText.value = JSON.stringify(change.document);
  } else importText.value = '';
  scanReviewSavedMessage.value = '';
  onImportTextInput();
}

async function readScanReviewCurrent() {
  const review = selectedScanReview.value;
  if (!review || review.account_id !== accountId.value) return;
  const seq = ++scanReviewCurrentSeq;
  const operation = importOperationSeq;
  scanReviewCurrentLoading.value = true;
  scanReviewCurrentError.value = '';
  try {
    const response = await getOperatorCurrent({ accountId: review.account_id, game: gameFilter.value });
    if (seq !== scanReviewCurrentSeq || selectedScanReview.value !== review || review.account_id !== accountId.value) return;
    scanReviewCurrent.value = currentEntryRawFromResponse(response, review.operator_id);
    if (operation === importOperationSeq) resetImportPreview();
  } catch (err) {
    if (seq === scanReviewCurrentSeq && selectedScanReview.value === review) scanReviewCurrentError.value = humanErr(err, '现值读取失败，请重试；输入仍保留');
  } finally {
    if (seq === scanReviewCurrentSeq) scanReviewCurrentLoading.value = false;
  }
}

async function closeScanReview() {
  const review = selectedScanReview.value;
  const contextSeq = currentContextSeq;
  if (importing.value || !(await confirmScanReviewDiscard()) || contextSeq !== currentContextSeq || selectedScanReview.value !== review) return false;
  selectedScanReview.value = null;
  scanReviewDirty.value = false;
  scanReviewComplete.value = false;
  scanReviewSavedMessage.value = '';
  scanReviewCurrentSeq += 1;
  importText.value = '';
  onImportTextInput();
  showImport.value = false;
  await nextTick();
  if (scanReviewTrigger?.isConnected) scanReviewTrigger.focus({ preventScroll: true });
  return true;
}

async function closeSelectedScanReview() {
  await completeScanReview(selectedScanReview.value);
}

async function completeScanReview(review) {
  if (!review || review.account_id !== accountId.value || importing.value) return;
  const contextSeq = currentContextSeq;
  const selected = selectedScanReview.value;
  const completingSelected = selected?.record_id === review.record_id && selected?.operator_id === review.operator_id;
  const confirmed = await dialog.confirm({
    title: "标记为已完成复核？",
    message: "请确认已核对并保存所需修改。此操作会消除该密探本次及更早的提醒，不会保存未提交的字段；后续采集的新待核结果仍会保留。",
    confirmText: "已完成复核",
  });
  if (!confirmed || importing.value || operatorPageDisposed || contextSeq !== currentContextSeq || review.account_id !== accountId.value || selectedScanReview.value !== selected) return;
  importing.value = true;
  scanReviewError.value = '';
  if (completingSelected) importError.value = '';
  try {
    await closeOperatorScanReview({ accountId: review.account_id, recordId: review.record_id, operatorId: review.operator_id });
    if (contextSeq !== currentContextSeq || operatorPageDisposed) return;
    if (completingSelected && selectedScanReview.value === selected) {
      selectedScanReview.value = null;
      scanReviewDirty.value = false;
      importText.value = "";
      importResult.value = null;
      resetImportPreview();
      showImport.value = false;
    }
    await loadScanReviews();
  } catch (err) {
    if (contextSeq === currentContextSeq && !operatorPageDisposed) {
      scanReviewError.value = "完成复核失败：" + humanErr(err, "请稍后重试");
      if (completingSelected) importError.value = scanReviewError.value;
    }
  } finally {
    if (contextSeq === currentContextSeq) importing.value = false;
  }
}

// —— 目录归一化 ——
function normalizeOperator(op) {
  const rawSub = op.subProf || op.sub_prof || "";
  const odditySchema = normalizeOperatorOdditySchema(
    op.odditySchema || op.oddity_schema,
  );
  return {
    // 优先取业务 id（operatorId），避免后端把 Mongo 内部 _id 作为 id 返回时串台
    id: op.operatorId || op.operator_id || op.id || "",
    name: op.name || "",
    alias: op.alias || "",
    rarity: op.rarity != null ? op.rarity : 3,
    prof: Array.isArray(op.prof) ? op.prof.join("、") : op.prof || "未知",
    subProf: subProfList({ subProf: rawSub }),
    games: op.games || op.games_list || [],
    spOf: op.spOf || op.sp_of || "",
    huajiCapabilities: op.huajiCapabilities || op.huaji_capabilities,
    discs: op.discs || op.discs_list || [],
    starStones: op.starStones || op.star_stones || [],
    specialOddityName:
      op.specialOddityName != null
        ? op.specialOddityName
        : op.special_oddity_name,
    odditySchema: odditySchema,
    oddityCompletionSchema: op.odditySchema || op.oddity_schema,
    incompleteFields: op.incompleteFields || op.incomplete_fields || [],
    avatar: op.avatar || "",
  };
}

const PROF_ICON_FILES = {
  阳: "yang.png",
  阴: "yin.png",
  火: "fire.png",
  风: "wind.png",
  水: "water.png",
  地: "earth.png",
  混沌: "chaos.png",
};
function profIcon(prof) {
  const file = PROF_ICON_FILES[String(prof || "").split("、")[0]];
  return file ? import.meta.env.BASE_URL + "assets/prof-icons/" + file : "";
}

function firstSubProf(entry) {
  return subProfList(entry)[0] || "";
}

function clearAgentFavorites() {
  favoriteLoadSeq += 1;
  favoriteLoadedAccount = "";
  favoriteAgentIds.value = new Set();
  favoriteBusyIds.value = new Set();
  favoriteLoading.value = false;
  favoriteError.value = "";
}

async function loadAgentFavorites() {
  if (!auth.isLoggedIn || !accountId.value) {
    clearAgentFavorites();
    return;
  }
  const targetAccount = accountId.value;
  const seq = ++favoriteLoadSeq;
  favoriteLoading.value = true;
  favoriteError.value = "";
  try {
    const data = await listAgentFavorites(targetAccount);
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return;
    favoriteAgentIds.value = new Set(
      Array.isArray(data && data.agent_ids) ? data.agent_ids : [],
    );
    favoriteLoadedAccount = targetAccount;
  } catch (err) {
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return;
    favoriteAgentIds.value = new Set();
    favoriteError.value = humanErr(err, "特别关注同步失败");
  } finally {
    if (seq === favoriteLoadSeq && accountId.value === targetAccount)
      favoriteLoading.value = false;
  }
}

async function toggleAgentFavorite(entry) {
  const id = entry && entry.id;
  const targetAccount = accountId.value;
  if (
    !id ||
    !auth.isLoggedIn ||
    !targetAccount ||
    favoriteBusyIds.value.has(id)
  )
    return;
  const wasFavorite = favoriteAgentIds.value.has(id);
  const next = new Set(favoriteAgentIds.value);
  if (wasFavorite) next.delete(id);
  else next.add(id);
  favoriteAgentIds.value = next;
  favoriteBusyIds.value = new Set(favoriteBusyIds.value).add(id);
  favoriteError.value = "";
  try {
    const data = wasFavorite
      ? await removeAgentFavorite(targetAccount, id)
      : await addAgentFavorite(targetAccount, id);
    if (accountId.value !== targetAccount) return;
    const confirmed = new Set(favoriteAgentIds.value);
    const confirmedFavorite =
      data && typeof data.favorite === "boolean" ? data.favorite : !wasFavorite;
    if (confirmedFavorite) confirmed.add(id);
    else confirmed.delete(id);
    favoriteAgentIds.value = confirmed;
  } catch (err) {
    if (accountId.value !== targetAccount) return;
    const rollback = new Set(favoriteAgentIds.value);
    if (wasFavorite) rollback.add(id);
    else rollback.delete(id);
    favoriteAgentIds.value = rollback;
    favoriteError.value = humanErr(err, "关注状态保存失败，请重试");
  } finally {
    if (accountId.value === targetAccount) {
      const busy = new Set(favoriteBusyIds.value);
      busy.delete(id);
      favoriteBusyIds.value = busy;
    }
  }
}

// 编辑弹窗辅助
function discKey(d) {
  if (!d) return "";
  return d.ot_name || d.otName || "";
}

function discDescription(disc) {
  if (!disc) return "";
  return String(disc.desp || disc.description || disc.desc || "").trim();
}

function showDiscTooltip(event, description) {
  const text = String(description || "").trim();
  const target = event && event.currentTarget;
  if (!text || !(target && target.getBoundingClientRect)) {
    hideDiscTooltip();
    return;
  }
  const rect = target.getBoundingClientRect();
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const tooltipHalfWidth = Math.min(140, Math.max(0, (viewportWidth - 24) / 2));
  const center = rect.left + rect.width / 2;
  const x = Math.max(
    12 + tooltipHalfWidth,
    Math.min(viewportWidth - 12 - tooltipHalfWidth, center),
  );
  const placement = rect.top >= 96 ? "top" : "bottom";
  discTooltip.value = {
    visible: true,
    text,
    x,
    y: placement === "top" ? rect.top - 8 : rect.bottom + 8,
    placement,
  };
}

function hideDiscTooltip() {
  if (!discTooltip.value.visible) return;
  discTooltip.value = Object.assign({}, discTooltip.value, { visible: false });
}

function discObject(key) {
  const d = ((editingOp.value && editingOp.value.discs) || []).find(
    function (x) {
      return discKey(x) === key;
    },
  );
  if (!d) return { ot_name: key };
  return {
    ot_name: key,
    abbreviation: d.abbreviation || null,
    color: d.color || null,
    desp: d.desp || null,
  };
}

// 命盘品级色 → 按钮配色类（与后端目录 color 字段：无色 / 金 / 紫 / 蓝 对齐）
const DISC_COLOR_CLASS = { 金: "c-gold", 紫: "c-purple", 蓝: "c-blue" };
const DISC_COLOR_ORDER = { 金: 0, 紫: 1, 蓝: 2 };
function discColorClass(d) {
  return (d && DISC_COLOR_CLASS[d.color]) || "";
}

function sortDiscsForPicker(discs) {
  return (Array.isArray(discs) ? discs : [])
    .map(function (disc, index) {
      return { disc: disc, index: index };
    })
    .sort(function (a, b) {
      const aOrder = DISC_COLOR_ORDER[a.disc && a.disc.color] ?? 3;
      const bOrder = DISC_COLOR_ORDER[b.disc && b.disc.color] ?? 3;
      const aMajorGold = isMajorGoldDisc(a.disc) ? 1 : 0;
      const bMajorGold = isMajorGoldDisc(b.disc) ? 1 : 0;
      return aOrder - bOrder || aMajorGold - bMajorGold || a.index - b.index;
    })
    .map(function (entry) {
      return entry.disc;
    });
}

const editingDiscs = computed(function () {
  return sortDiscsForPicker((editingOp.value && editingOp.value.discs) || []);
});

function isMajorGoldDisc(disc) {
  if (!disc || disc.color !== "金") return false;
  return /(攻击力|生命).*大幅提升/.test(discKey(disc));
}

const selectedDiscLoadout = computed(function () {
  return editForm.value.discLoadouts[selectedDiscLoadoutIndex.value] || null;
});
const selectedDiscNames = computed(() => selectedDiscLoadout.value
  ? selectedDiscLoadout.value[editingDiscTarget.value ? 'targetDiscNames' : 'discNames'] : []);

function copyCurrentDiscTarget() {
  selectedDiscLoadout.value.targetDiscNames = selectedDiscLoadout.value.discNames.slice();
  editingDiscTarget.value = true;
}
function removeDiscTarget(name) {
  selectedDiscLoadout.value.targetDiscNames = selectedDiscLoadout.value.targetDiscNames.filter(item => item !== name);
}
function cardDiscTargetSummary(entry) {
  return discTargetSummary(cardGrowthDrafts.value[entry.id]?.discLoadouts || entry.discLoadouts);
}
function cardDiscTargetSummaryItems(entry) {
  return discTargetSummaryItems(cardGrowthDrafts.value[entry.id]?.discLoadouts || entry.discLoadouts);
}
async function editDiscTarget(index) {
  const id = discTargetEntryId.value;
  discTargetEntryId.value = "";
  await nextTick();
  await openEdit(id);
  if (editing.value && editingId.value === id) {
    editorSection.value = 'discs';
    selectedDiscLoadoutIndex.value = index;
    editingDiscTarget.value = true;
  }
}

function syncDiscLoadoutAutoName(loadout) {
  if (!loadout || loadout.nameMode === "manual") return;
  loadout.name = automaticDiscLoadoutName(loadout.discNames);
}

function selectDiscLoadoutTab(index, focusTab) {
  const count = editForm.value.discLoadouts.length;
  if (!count) return;
  selectedDiscLoadoutIndex.value = ((Number(index) % count) + count) % count;
  if (focusTab) {
    nextTick(function () {
      const tab = document.getElementById(
        "disc-loadout-tab-" + selectedDiscLoadoutIndex.value,
      );
      if (tab) tab.focus();
    });
  }
}

function setDiscLoadoutName(index, event) {
  const loadout = editForm.value.discLoadouts[index];
  if (!loadout) return;
  loadout.name = String(event && event.target ? event.target.value : "");
  loadout.nameMode = "manual";
}

function ensureDiscLoadoutName(index) {
  const loadout = editForm.value.discLoadouts[index];
  if (!loadout || String(loadout.name || "").trim()) return;
  loadout.nameMode = "auto";
  syncDiscLoadoutAutoName(loadout);
}

function resetDiscLoadoutName(index) {
  const loadout = editForm.value.discLoadouts[index];
  if (!loadout) return;
  loadout.nameMode = "auto";
  syncDiscLoadoutAutoName(loadout);
}

function isDiscSelected(disc) {
  const loadout = selectedDiscLoadout.value;
  return !!loadout && selectedDiscNames.value.indexOf(discKey(disc)) !== -1;
}

function applyDiscPresetNames(names) {
  const loadout = selectedDiscLoadout.value;
  if (!loadout || savingEdit.value) return;
  loadout[editingDiscTarget.value ? 'targetDiscNames' : 'discNames'] = names.slice();
  if (!editingDiscTarget.value) syncDiscLoadoutAutoName(loadout);
  if (editNotice.value === "每套命盘组合最多选择 3 个") {
    editNotice.value = "";
    editNoticeError.value = false;
  }
}

function toggleDiscSelection(disc, event) {
  const loadout = selectedDiscLoadout.value;
  const key = discKey(disc);
  if (!loadout || !key) return;
  const names = selectedDiscNames.value;
  const index = names.indexOf(key);
  if (index !== -1) {
    names.splice(index, 1);
  } else if (names.length >= 3) {
    if (event && event.target) event.target.checked = false;
    editNotice.value = "每套命盘组合最多选择 3 个";
    editNoticeError.value = true;
    return;
  } else {
    names.push(key);
  }
  if (!editingDiscTarget.value) syncDiscLoadoutAutoName(loadout);
  if (editNotice.value === "每套命盘组合最多选择 3 个") {
    editNotice.value = "";
    editNoticeError.value = false;
  }
}

function initialDiscLoadoutState(existing) {
  const serverLoadouts = Array.isArray(existing.discLoadouts)
    ? existing.discLoadouts
    : [];
  // 新接口没有 active/current 语义；数组顺序就是命盘一、命盘二。
  // 旧数据只提供 discs 时，统一把它映射为第一套命盘。
  return createDiscLoadoutState(serverLoadouts, existing.discs, 0);
}

const COMBAT_STATS_STORAGE_PREFIX = "yuanhub:operator-combat-stats:v1";
const COMBAT_DISPLAY_MODE_STORAGE_PREFIX =
  "yuanhub:operator-combat-display-mode:v1";
function combatStatsStorageKey(id) {
  return [
    COMBAT_STATS_STORAGE_PREFIX,
    accountId.value,
    saveGame.value,
    id || editingId.value,
  ].join(":");
}

function combatDisplayModeStorageKey(id) {
  return [
    COMBAT_DISPLAY_MODE_STORAGE_PREFIX,
    accountId.value,
    saveGame.value,
    id || editingId.value,
  ].join(":");
}

function loadCombatDisplayMode(id) {
  if (typeof localStorage === "undefined") return { attack: null, hp: null };
  try {
    const raw = localStorage.getItem(combatDisplayModeStorageKey(id));
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      attack:
        parsed.attack === "auto" || parsed.attack === "manual"
          ? parsed.attack
          : null,
      hp: parsed.hp === "auto" || parsed.hp === "manual" ? parsed.hp : null,
    };
  } catch (_) {
    return { attack: null, hp: null };
  }
}

function persistCombatDisplayMode(id) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(
      combatDisplayModeStorageKey(id),
      JSON.stringify(combatDisplayMode.value),
    );
    return true;
  } catch (_) {
    return false;
  }
}

function loadCachedCombatStats(id) {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(combatStatsStorageKey(id));
    return raw ? normalizeOperatorCombatStats(JSON.parse(raw)) : null;
  } catch (_) {
    return null;
  }
}

function persistCombatStats(id) {
  if (typeof localStorage === "undefined" || !editForm.value.combatStats)
    return false;
  try {
    localStorage.setItem(
      combatStatsStorageKey(id),
      JSON.stringify({
        attack: editForm.value.combatStats.attack,
        hp: editForm.value.combatStats.hp,
        manualAttack: editForm.value.combatStats.manualAttack,
        manualHp: editForm.value.combatStats.manualHp,
        curios: editForm.value.combatStats.curios,
        oddities: editForm.value.combatStats.oddities,
        source: editForm.value.combatStats.source,
        observedInputs: editForm.value.combatStats.observedInputs,
        observedAt: editForm.value.combatStats.observedAt,
        rulesVersion: "wiki-panel-2026-03",
      }),
    );
    return true;
  } catch (_) {
    return false;
  }
}

const stoneSlots = computed(function () {
  return [
    { type: "main1", label: "主星 1" },
    { type: "main2", label: "主星 2" },
    { type: "main3", label: "主星 3" },
    { type: "assist1", label: "辅星 1" },
    { type: "assist2", label: "辅星 2" },
    { type: "assist3", label: "辅星 3" },
  ];
});

// 修为不能超过当前等级上限，等级变化时自动修正
watch(
  function () {
    return editForm.value.level;
  },
  function (level) {
    const max = getMaxEliteForLevel(level);
    if (editForm.value.elite > max) {
      editForm.value.elite = max;
      editNotice.value = "修为已随等级自动调整为 " + max + "（当前等级上限）";
      editNoticeError.value = false;
    }
  },
);

watch(editorSection, async function () {
  hideDiscTooltip();
  await nextTick();
  if (editorBodyEl.value) editorBodyEl.value.scrollTop = 0;
});

watch(editing, async function (isOpen) {
  if (isOpen) {
    bodyOverflowBeforeEditor = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    bodyLockedByEditor = true;
    await nextTick();
    if (editorPanelEl.value) editorPanelEl.value.focus();
    return;
  }
  if (bodyLockedByEditor) {
    document.body.style.overflow = bodyOverflowBeforeEditor;
    bodyLockedByEditor = false;
  }
});

const catalogOperators = computed(function () {
  if (Array.isArray(backendCatalog.value))
    return backendCatalog.value.map(normalizeOperator);
  // 后端不可达时的本地兜底：库存角色目录已含 id/name/品质/属性，足够展示基础图鉴
  return AGENT_CATALOG.map(function (e) {
    return {
      id: e.id,
      name: e.name,
      alias: "",
      rarity: e.rarity || 3,
      spOf: e.spOf || e.sp_of || "",
      prof: e.prof || "未知",
      subProf: e.subProf || "",
      games: ["如鸢", "代号鸢"],
      discs: [],
      starStones: [],
      specialOddityName: null,
      odditySchema: normalizeOperatorOdditySchema(),
      incompleteFields: ["special_oddity_name"],
      avatar: "",
    };
  });
});

const catalogMap = computed(function () {
  const m = {};
  catalogOperators.value.forEach(function (op) {
    m[op.id] = op;
  });
  return m;
});

const starOperatorDisplayNames = computed(function () {
  const names = {};
  currentEntries.value.forEach(function (entry) {
    if (entry && entry.id && entry.name) names[entry.id] = entry.name;
  });
  Object.values(catalogMap.value).forEach(function (operator) {
    if (operator && operator.id && operator.name && !names[operator.id]) names[operator.id] = operator.name;
  });
  return names;
});

const catalogCount = computed(function () {
  return catalogOperators.value.filter(function (op) {
    return matchesGame(op, gameFilter.value);
  }).length;
});

function normalizeEntry(e, odditySchema) {
  e = e || {};
  const rawStats = e.combatStats || e.combat_stats || e.stats || e;
  const rawOddities = rawStats.oddities || rawStats.oddity || e.oddities || {};
  const oddityRecordedValues = {};
  ODDITY_KEYS.forEach(function (key) {
    const value = rawOddities[key];
    if (
      Object.prototype.hasOwnProperty.call(rawOddities, key) && value &&
      Object.prototype.hasOwnProperty.call(value, "current")
    ) {
      oddityRecordedValues[key] = { current: value.current };
    }
  });
  const hasCombatStats =
    Object.prototype.hasOwnProperty.call(e, "combat_stats") ||
    Object.prototype.hasOwnProperty.call(e, "combatStats") ||
    Object.prototype.hasOwnProperty.call(e, "stats");
  return {
    awakened: e.huaji?.awakened ?? (Number(e.starLevel ?? e.star_level) === 31 ? true : null),
    huaji: e.huaji || null,
    huajiLegacy: e.huaji_legacy || e.huajiLegacy || null,
    elite: e.elite != null ? e.elite : 0,
    starLevel:
      e.starLevel != null
        ? e.starLevel
        : e.star_level != null
          ? e.star_level
          : 0,
    level: e.level != null ? e.level : 0,
    levelBreakthroughStage: operatorLevelBreakthroughStage(e),
    discs: e.discs || [],
    discLoadouts: e.discLoadouts || e.disc_loadouts || [],
    starStones: (e.starStones || e.star_stones || []).map(function (s) {
      return Object.assign({}, s, { type: normalizeStoneType(s.type) });
    }),
    revision: e.revision != null ? Number(e.revision) || 0 : 0,
    updatedAt: e.updatedAt || e.updated_at || null,
    combatStatsPresent: hasCombatStats,
    oddityRecordedValues: oddityRecordedValues,
    combatStats: normalizeOperatorCombatStats(
      e.combatStats || e.combat_stats || e.stats || e,
      odditySchema,
    ),
    listedBaselineAt: e.listedBaselineAt || e.listed_baseline_at || null,
  };
}

// 修为材料按密探属性归入三类职业；与养成追踪组件保持同一映射。
function xiuweiJob(prof) {
  const first = String(prof || "").split("、")[0];
  return ["风", "火"].includes(first)
    ? "fh"
    : ["水", "地"].includes(first)
      ? "ds"
      : "yy";
}

const maxEliteForLevel = computed(function () {
  return getMaxEliteForLevel(editForm.value.level);
});

const combatStatsInput = computed(function () {
  const existing = currentEntries.value.find((entry) => entry.id === editingOp.value?.id);
  const huaji = operatorHuajiDraft({ ...editingOp.value, ...existing, huaji: editForm.value.huaji }, editForm.value.starLevel);
  return {
    operatorName: editingOp.value && editingOp.value.name,
    level: editForm.value.level,
    levelBreakthroughStage: operatorLevelBreakthroughStage(editForm.value),
    elite: editForm.value.elite,
    starLevel: editForm.value.starLevel,
    huaji: { ...huaji, awakened: huaji.owned ? editForm.value.awakened : null },
    stones: inventoryPanelStones(editingOp.value?.id, starLoadoutDrafts.value) ?? editForm.value.stones,
    oddities: editForm.value.combatStats && editForm.value.combatStats.oddities,
  };
});

const panelPreviewState = ref({ key: "", status: "idle", result: null });
const panelBatchState = ref({ key: "", status: "idle", result: null });
const panelPreviewRequest = createOperatorPanelRequest({
  request: previewOperatorPanel, publish: value => { panelPreviewState.value = value; },
});
const panelBatchRequest = createOperatorPanelRequest({
  request: value => getCurrentOperatorPanels(value.accountId, value.operatorIds),
  publish: value => { panelBatchState.value = value; },
});
const panelBatchInput = computed(() => {
  if (!canUseAutomaticPanel.value || !accountId.value || currentLoadedKey.value !== accountId.value + ':' + gameFilter.value) return null;
  const operatorIds = currentEntries.value.filter(isOperatorOwned).map(entry => entry.id);
  if (!operatorIds.length) return null;
  return {
    key: JSON.stringify([starPresetUserScope(), accountId.value, gameFilter.value,
      currentEntries.value.map(entry => [entry.id, entry.revision, entry.level, entry.elite, entry.huaji, entry.starLevel, entry.combatStats?.oddities]),
      starStateGeneration.value, starInventoryEntries.value, starLoadoutCurrent.value]),
    input: { accountId: accountId.value, operatorIds },
  };
});
const panelPreviewInput = computed(() => {
  if (!canUseAutomaticPanel.value || !editing.value || !editingOp.value?.id || !accountId.value || starLoadoutLoading.value) return null;
  const draft = starLoadoutAccountId.value === accountId.value ? starLoadoutDrafts.value[editingOp.value.id] : undefined;
  const loadout = Object.hasOwn(starLoadoutCurrent.value, editingOp.value.id) || Object.values(draft || {}).some(Boolean) ? draft : undefined;
  const input = operatorPanelPreviewBody(accountId.value, editingOp.value.id, combatStatsInput.value, loadout);
  return { key: JSON.stringify([starPresetUserScope(), gameFilter.value, input, starInventoryEntries.value]), input };
});
watch(() => panelBatchInput.value?.key, () => panelBatchRequest.update(panelBatchInput.value), { immediate: true });
watch(() => panelPreviewInput.value?.key, () => panelPreviewRequest.update(panelPreviewInput.value), { immediate: true });
const editorPanelResult = computed(() => canUseAutomaticPanel.value && panelPreviewState.value.key === panelPreviewInput.value?.key ? panelPreviewState.value.result : null);
const editorPanelHint = computed(() => canUseAutomaticPanel.value ? operatorPanelHint(editorPanelResult.value, panelPreviewState.value.status) : "");

function cardPanelDraftChanged(entry) {
  const draft = operatorPanelPreviewBody(accountId.value, entry.id, cardCombatInput(entry));
  const saved = operatorPanelPreviewBody(accountId.value, entry.id, {
    level: entry.level, levelBreakthroughStage: operatorLevelBreakthroughStage(entry), elite: entry.elite,
    huaji: operatorHuaji(entry), oddities: entry.combatStats?.oddities,
  });
  return JSON.stringify(draft) !== JSON.stringify(saved);
}
function cardPanelResult(entry) {
  if (!canUseAutomaticPanel.value || cardPanelDraftChanged(entry) || panelBatchState.value.key !== panelBatchInput.value?.key) return null;
  return panelBatchState.value.result?.[entry.id];
}
function cardPanelHint(entry) {
  if (!canUseAutomaticPanel.value) return "";
  if (cardPanelDraftChanged(entry)) return "保存养成后更新自动面板";
  return operatorPanelHint(cardPanelResult(entry), panelBatchState.value.status);
}

const calculatedCombatStats = computed(function () {
  return calculateOperatorCombatStats({
    stored: editForm.value.combatStats,
    input: combatStatsInput.value,
    serverResult: editorPanelResult.value,
    allowAutomatic: panelAutoFillEnabled.value,
    displayMode: combatDisplayMode.value,
  });
});

const combatAttackAutoVisible = computed(function () {
  return calculatedCombatStats.value.attackSource === "calculated";
});

const combatHpAutoVisible = computed(function () {
  return calculatedCombatStats.value.hpSource === "calculated";
});
const editorPanelSource = computed(() => {
  const { attack, hp } = combatDisplayMode.value;
  return attack === hp ? attack || "follow" : "mixed";
});
function setEditorPanelSource(source) {
  if (!["follow", "manual", "auto"].includes(source)) return;
  if (source === "auto" && !calculatedCombatStats.value.automaticResultAvailable) return;
  const mode = source === "follow" ? null : source;
  combatDisplayMode.value = { attack: mode, hp: mode };
}
const editorPanelDifference = computed(() => {
  const result = calculatedCombatStats.value;
  if (!result.automaticResultAvailable) return "";
  const stats = editForm.value.combatStats;
  return [["攻击", stats.manualAttack ?? stats.attack, result.automaticAttack], ["生命", stats.manualHp ?? stats.hp, result.automaticHp]]
    .filter(([, saved, automatic]) => saved != null && saved !== automatic)
    .map(([label, saved, automatic]) => `${label}：录入 ${saved.toLocaleString('zh-CN')}，自动 ${automatic.toLocaleString('zh-CN')}`).join("；");
});

const combatAttackDisplayLabel = computed(function () {
  return combatAttackAutoVisible.value
    ? calculatedCombatStats.value.automaticAttackLabel
    : calculatedCombatStats.value.attackLabel;
});

const combatHpDisplayLabel = computed(function () {
  return combatHpAutoVisible.value
    ? calculatedCombatStats.value.automaticHpLabel
    : calculatedCombatStats.value.hpLabel;
});

function selectedCombatSourceLabel(source) {
  return { manual: "手填面板", observed: "采集记录", calculated: "自动计算", missing: "尚未填写" }[source];
}
const combatAttackSource = computed(() => selectedCombatSourceLabel(calculatedCombatStats.value.attackSource));
const combatHpSource = computed(() => selectedCombatSourceLabel(calculatedCombatStats.value.hpSource));

const oddityCatalogIncomplete = computed(function () {
  const op = editingOp.value;
  if (!op) return false;
  return (
    !op.specialOddityName ||
    (Array.isArray(op.incompleteFields) &&
      op.incompleteFields.indexOf("special_oddity_name") !== -1)
  );
});

function setManualCombatStat(key, event) {
  if (!editForm.value.combatStats)
    editForm.value.combatStats = normalizeOperatorCombatStats({});
  const raw = event && event.target ? event.target.value : "";
  combatDisplayMode.value[key === "manualAttack" ? "attack" : "hp"] = raw === "" ? null : "manual";
  editForm.value.combatStats[key] = raw === "" ? null : Number(raw);
  editForm.value.combatStats.source = "manual";
  if (raw !== "") markCombatCorrectionCurrent();
}

const combatAttackInputValue = computed(function () {
  if (combatAttackAutoVisible.value) return "";
  return editForm.value.combatStats &&
    editForm.value.combatStats.manualAttack != null
    ? editForm.value.combatStats.manualAttack
    : "";
});

const combatHpInputValue = computed(function () {
  if (combatHpAutoVisible.value) return "";
  return editForm.value.combatStats &&
    editForm.value.combatStats.manualHp != null
    ? editForm.value.combatStats.manualHp
    : "";
});

function markCombatCorrectionCurrent() {
  const signature = combatInputSignature(combatStatsInput.value);
  editForm.value.combatStats.observedInputs = { level: editForm.value.level, levelBreakthroughStage: operatorLevelBreakthroughStage(editForm.value), signature: signature };
  editForm.value.combatStats.combatInputSignature = signature;
  editForm.value.combatStats.frontendObservedSignature = signature;
  editForm.value.combatStats.observedStatus = operatorLevelBreakthroughStage(editForm.value) == null ? "unverified" : "valid";
}

function toggleAutomaticCombatStat(key) {
  const currentlyAutomatic =
    key === "attack"
      ? combatAttackAutoVisible.value
      : combatHpAutoVisible.value;
  combatDisplayMode.value[key] = currentlyAutomatic ? "manual" : "auto";
}

function ensureOperatorOddities(stats, op) {
  if (!stats || !stats.oddities || typeof stats.oddities !== "object") return;
  stats.oddities = normalizeOperatorOddities(
    stats.oddities,
    stats.curios,
    op && op.odditySchema,
  );
}

function oddityFieldName(key) {
  const schema = editingOp.value && editingOp.value.odditySchema;
  return (schema && schema[key] && schema[key].name) || key;
}

function oddityLimitLabel(key) {
  const oddity =
    editForm.value.combatStats && editForm.value.combatStats.oddities[key];
  return oddity && oddity.max != null ? oddity.max : "—";
}

function oddityInputLabel(key) {
  const max = oddityLimitLabel(key);
  return (
    oddityFieldName(key) +
    "当前值" +
    (max === "—" ? "，公共图鉴暂无上限" : "，上限" + max)
  );
}

function oddityLimitTitle(key) {
  const max = oddityLimitLabel(key);
  return max === "—" ? "等待公共图鉴返回上限" : "公共图鉴上限 " + max;
}

function applyEditGrowthPreset(level, elite) {
  Object.assign(editForm.value, { level, elite, levelBreakthroughStage: level === editForm.value.level ? editForm.value.levelBreakthroughStage : inferredLevelBreakthroughStage(level) });
  editNotice.value = "已填入 " + level + "级 / 修为" + elite + "，请确认后保存";
  editNoticeError.value = false;
}

function fillEditToMax(odditiesOnly = false) {
  if (!editingOp.value) return;
  const fill = odditiesOnly ? fillOperatorOdditiesToMax : fillOperatorDraftToMax;
  const missing = fill(editForm.value, editingOp.value.odditySchema);
  const scope = odditiesOnly ? "" : "等级、修为和";
  editNotice.value = missing.length
    ? "已填入" + scope + "有上限的奇闻；" + missing.map(oddityFieldName).join("、") + "暂无图鉴上限，已保留原值，请确认后保存"
    : "已填入" + scope + "全部奇闻上限，请确认后保存";
  editNoticeError.value = false;
}

function boundedOddityValue(rawValue, maxValue) {
  if (rawValue === "" || rawValue == null) {
    return { value: rawValue, adjusted: false, reason: "", max: null };
  }
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return { value: rawValue, adjusted: false, reason: "", max: null };
  }
  const numericMax =
    maxValue !== "" && maxValue != null && Number.isFinite(Number(maxValue))
      ? Math.max(0, Number(maxValue))
      : null;
  let value = Math.max(0, numericValue);
  let reason = value !== numericValue ? "min" : "";
  if (numericMax != null && value > numericMax) {
    value = numericMax;
    reason = "max";
  }
  return {
    value: value,
    adjusted: value !== numericValue,
    reason: reason,
    max: numericMax,
  };
}

function showEditOddityError(key, message) {
  editorSection.value = 'growth';
  editOddityErrorKey.value = key;
  editNotice.value = oddityFieldName(key) + message;
  editNoticeError.value = true;
  nextTick(function () {
    editorPanelEl.value?.querySelector('[data-oddity-key="' + key + '"]')?.focus();
  });
}

// 星级（starLevel）映射，与后端 OperatorService.MAX_STAR_LEVEL 对齐：
// 新化极阶段最高25；旧25..30懒兼容五星，旧31只作为觉醒事实读取。
const MAX_STAR_LEVEL = 25;
const STAR_LEVEL_AWAKEN = 31;
const STAR_RANGE = [1, 2, 3, 4, 5];
const NODE_RANGE = [0, 1, 2, 3, 4, 5];
function starLabel(v, spOf) {
  const n = Number(v) || 0;
  if (n === 0) return "未拥有";
  if (spOf) return n + " 星";
  if (n === STAR_LEVEL_AWAKEN) return "觉醒";
  if (n >= 25 && n <= 30) return "5 星";
  if (n >= 1 && n <= 24) {
    const star = Math.floor((n - 1) / 6) + 1;
    const node = (n - 1) % 6;
    return star + " 星 " + node + " 节点";
  }
  return n;
}

// 星级分段胶囊 + 节点胶囊：把一维 starLevel 拆成「星级分组 + 节点」二维状态
const starGroupName = computed(function () {
  const v = Number(editForm.value.starLevel) || 0;
  if (v === 0) return editForm.value.owned ? "unknown" : "none";
  if (editingOp.value && editingOp.value.spOf) return v;
  if (v === STAR_LEVEL_AWAKEN) return "unknown";
  if (v >= 1 && v <= 30) return Math.floor((v - 1) / 6) + 1;
  return "none";
});
const editorCanConfirmAwakening = computed(() => editForm.value.owned && Number(editForm.value.starLevel) === (editingOp.value?.spOf ? 5 : 25));
function toggleEditAwakening() {
  if (savingEdit.value || !operatorAwakeningSupported(editingOp.value) || editForm.value.owned === false || !editorCanConfirmAwakening.value) return;
  editForm.value.awakened = editForm.value.awakened !== true;
}
const starNode = computed(function () {
  const v = Number(editForm.value.starLevel) || 0;
  if (v >= 1 && v < 25) return (v - 1) % 6;
  return 0;
});

function pickStarGroup(g) {
  if (Number(g) !== 5 && editForm.value.awakened === true) {
    editForm.value.awakened = false;
  }
  editForm.value.owned = g !== "none";
  if (g === "none") {
    editForm.value.starLevel = 0;
    return;
  }
  const s = Number(g);
  if (!(s >= 1 && s <= 5)) return;
  if (!(Number(editForm.value.starLevel) > 0)) {
    if (editForm.value.level === 0) editForm.value.level = 1;
    if (editForm.value.elite === 0) editForm.value.elite = 1;
  }
  if (editingOp.value && editingOp.value.spOf) {
    editForm.value.starLevel = s;
    return;
  }
  editForm.value.starLevel = s === 5 ? 25 : 6 * (s - 1) + starNode.value + 1;
}

function pickStarNode(n) {
  const s = starGroupName.value;
  if (typeof s !== "number" || s >= 5) return;
  editForm.value.starLevel = 6 * (s - 1) + Number(n) + 1;
}

// 旧协议仅用 main/assist；新前端按 3 主星 + 3 辅星槽位保存为 main1..3 / assist1..3
function normalizeStoneType(type) {
  if (type === "main") return "main1";
  if (type === "assist") return "assist1";
  return type || "";
}

// 版本匹配：item 可以是目录项或当前养成项；未声明 games 视为通用/通配。
function matchesGame(item, game) {
  if (game === "all") return true;
  const games = item && (item.games || []);
  if (!games || games.length === 0) return true;
  return games.indexOf(game) !== -1;
}

const currentMap = computed(function () {
  const m = {};
  currentEntries.value.forEach(function (e) {
    m[e.id] = e;
  });
  return m;
});

const oddityCompletions = computed(function () {
  const result = {};
  if (!auth.isLoggedIn || !accountId.value || accountsLoading.value || accountError.value ||
      loading.value || error.value || catalogLoading.value ||
      currentLoadedKey.value !== accountId.value + ":" + gameFilter.value) return result;
  const labels = { full: "已满", incomplete: "未满", unknown: "待确认" };
  Object.values(currentMap.value).forEach(function (entry) {
    const op = catalogMap.value[entry.id];
    if (!op || !isOperatorOwned(entry)) return;
    const completion = operatorOddityCompletion(entry.oddityRecordedValues, op.oddityCompletionSchema);
    result[entry.id] = Object.assign({}, completion, {
      label: "漆园蝶" + labels[completion.status],
      compactLabel: "蝶" + labels[completion.status],
    });
  });
  return result;
});

const orphanCurrentEntries = computed(function () {
  if (!Array.isArray(backendCatalog.value) || catalogLoading.value || loading.value || error.value) return [];
  return currentEntries.value.filter(entry => !catalogMap.value[entry.id]);
});

async function removeOrphanCurrent(entry) {
  if (removingOrphanId.value || !auth.isLoggedIn || !accountId.value) return;
  const targetAccount = accountId.value;
  const confirmed = await dialog.confirm({
    title: "移除旧养成",
    message: "确定移除「" + currentAccountName.value + "」中「" + entry.id + "」的旧养成？此子账号各版本中的该 ID 都会移除，历史导入记录保留。若需要保留练度，请先导出备份。",
    confirmText: "移除旧养成",
    type: "danger",
  });
  if (!confirmed || accountId.value !== targetAccount || removingOrphanId.value) return;
  removingOrphanId.value = entry.id;
  orphanNotice.value = "";
  try {
    await removeOrphanOperatorCurrent({ accountId: targetAccount, operatorId: entry.id });
    if (accountId.value !== targetAccount) return;
    currentEntries.value = currentEntries.value.filter(item => item.id !== entry.id);
    orphanNotice.value = "已移除旧养成：" + entry.id;
    await reloadCurrent();
  } catch (err) {
    if (accountId.value !== targetAccount) return;
    orphanNotice.value = err.code === "operator_still_in_catalog"
      ? "该密探仍在公共图鉴中，无法移除，请刷新图鉴后核对。"
      : humanErr(err, "旧养成移除失败，请重试");
  } finally {
    removingOrphanId.value = "";
  }
}

watch(accountId, () => { orphanNotice.value = ""; });

// 图鉴顶部统计口径（不跟随属性/职业/搜索/已拥有筛选）：仅按游戏过滤的全量
const statsEntries = computed(function () {
  const state = currentMap.value;
  return catalogOperators.value
    .map(function (op) {
      const build = state[op.id];
      const owned = isOperatorOwned(build);
      return Object.assign({}, op, { owned: owned });
    })
    .filter(function (e) {
      return matchesGame(e, gameFilter.value);
    });
});
const manifestOwned = computed(function () {
  return statsEntries.value.filter(function (e) {
    return e.owned;
  }).length;
});
const manifestMissing = computed(function () {
  return statsEntries.value.length - manifestOwned.value;
});
const manifestPercent = computed(function () {
  if (!statsEntries.value.length) return "0%";
  return (
    Math.round((manifestOwned.value * 100) / statsEntries.value.length) + "%"
  );
});

// 图鉴展示列表：在全量基础上叠加品质 / 属性 / 职业 / 搜索 / 拥有状态 / 养成条件
const manifestEntries = computed(function () {
  const state = currentMap.value;
  return catalogOperators.value
    .map(function (op) {
      const build = state[op.id];
      const owned = isOperatorOwned(build);
      return Object.assign({}, op, {
        owned: owned,
        elite: build ? build.elite : 0,
        starLevel: build ? build.starLevel : 0,
        level: build ? build.level : 0,
      });
    })
    .filter(function (e) {
      if (!matchesGame(e, gameFilter.value)) return false;
      return matchesManifestFilters(e, {
        rarityFilter: rarityFilter.value,
        profFilter: profFilter.value,
        subProfFilter: subProfFilter.value,
        manifestFilter: manifestFilter.value,
        search: manifestSearch.value,
        growthFilters: manifestGrowthFilters.value,
      });
    })
    .sort(function (a, b) {
      return (
        operatorReleaseOrder(b.id) - operatorReleaseOrder(a.id) ||
        String(a.name).localeCompare(String(b.name), "zh-CN")
      );
    });
});

function operatorReleaseOrder(id) {
  const match = String(id || "").match(/char_(\d+)/);
  return match ? Number(match[1]) : -1;
}

// 筛选条件摘要（用于空态提示）
const filterSuffix = computed(function () {
  const parts = [];
  if (manifestSearch.value) parts.push("「" + manifestSearch.value + "」");
  parts.push("版本「" + gameFilter.value + "」");
  if (rarityFilter.value !== "all")
    parts.push("品质「" + (rarityLabelMap[rarityFilter.value] || rarityFilter.value) + "」");
  if (profFilter.value !== "all")
    parts.push("属性「" + profFilter.value + "」");
  if (subProfFilter.value !== "all")
    parts.push("职业「" + subProfFilter.value + "」");
  if (manifestFilter.value === "owned") parts.push("「已拥有」");
  if (manifestFilter.value === "missing") parts.push("「未拥有」");
  parts.push(...growthFilterParts(manifestGrowthFilters.value));
  return parts.length ? parts.join(" · ") : "";
});

const manifestAdvancedFilterCount = computed(() => [
  profFilter.value !== 'all', subProfFilter.value !== 'all', rarityFilter.value !== 'all',
  manifestGrowthFilters.value.levelEnabled, manifestGrowthFilters.value.eliteEnabled, manifestGrowthFilters.value.starEnabled,
].filter(Boolean).length);

const hasManifestFilters = computed(function () {
  return hasActiveManifestFilters({
    rarityFilter: rarityFilter.value,
    profFilter: profFilter.value,
    subProfFilter: subProfFilter.value,
    manifestFilter: manifestFilter.value,
    search: manifestSearch.value,
    growthFilters: manifestGrowthFilters.value,
  });
});

// 当前养成首要口径：只展示已拥有，再叠加品质 / 属性 / 职业等筛选。
const ownedCurrentEntries = computed(function () {
  return currentEntries.value.filter(entry => catalogMap.value[entry.id] && isOperatorOwned(entry));
});

const operatorEntryState = computed(() => {
  if (!auth.isLoggedIn) return 'logged-out';
  if (accountsLoading.value) return 'accounts-loading';
  if (accountError.value) return 'accounts-error';
  if (!accounts.value.some(account => account.id === accountId.value)) return 'no-account';
  if (loading.value) return 'loading';
  if (error.value) return 'data-error';
  if (currentLoadedKey.value !== accountId.value + ':' + gameFilter.value) return 'loading';
  if (!currentEntries.value.length) return 'empty';
  if (!ownedCurrentEntries.value.length) return 'unowned';
  return '';
});
const catalogEntryExpanded = ref(false);
const operatorEntryTitle = computed(() => ({
  'logged-out': '登录后管理密探',
  'accounts-loading': '正在读取游戏账号',
  'accounts-error': '账号读取失败',
  'no-account': '请选择游戏账号',
  loading: '正在读取密探档案',
  'data-error': '密探数据读取失败',
  empty: '还没有密探档案',
  unowned: '还没有已招募的密探',
})[operatorEntryState.value] || '密探档案');
const operatorEntryMessage = computed(() => ({
  'logged-out': '登录后可维护自己的密探档案；现在仍可浏览图鉴。',
  'accounts-loading': '正在读取游戏账号…',
  'accounts-error': accountError.value,
  'no-account': '请先创建并选择游戏账号，再录入密探。',
  loading: '正在读取当前账号的养成档案…',
  'data-error': '养成档案读取失败：' + error.value,
  empty: '录入自己已经拥有的密探，即可管理养成、命盘、星石与资源规划。',
  unowned: '当前档案暂无可展示的已招募密探，可从图鉴选择密探并设置星阶。',
})[operatorEntryState.value] || '');

async function focusCatalogEntry() {
  catalogEntryExpanded.value = true;
  await setTab('catalog');
  manifestSearch.value = "";
  manifestFilter.value = "all";
  rarityFilter.value = profFilter.value = subProfFilter.value = "all";
  manifestGrowthFilters.value = emptyGrowthFilters();
  await nextTick();
  catalogFilters.value?.focusSearch();
}

async function retryEntryData() {
  if (accountError.value) await loadAccounts();
  if (!accountError.value) await reloadCurrent();
}

const currentStatusCounts = computed(function () {
  const counts = ownedCurrentEntries.value.reduce(
    function (counts, entry) {
      const status = operatorStatus(entry);
      if (Object.prototype.hasOwnProperty.call(counts, status))
        counts[status] += 1;
      return counts;
    },
    { growing: 0, graduated: 0, inactive: 0, discarded: 0 },
  );
  counts.registered = counts.growing + counts.graduated + counts.inactive;
  return counts;
});

const CURRENT_PROF_ORDER = {
  地: 0,
  水: 1,
  火: 2,
  风: 3,
  阳: 4,
  阴: 5,
  混沌: 6,
};

function compareCurrentEntries(a, b) {
  let difference = compareOperatorOrganization(a.id, operatorStatus(a), b.id, operatorStatus(b), organizationRanks.value);
  if (difference) return difference;

  // 未置顶的特别关注只在同一状态内提前。
  if (favoriteFirst.value) {
    difference =
      Number(favoriteAgentIds.value.has(b.id)) -
      Number(favoriteAgentIds.value.has(a.id));
    if (difference) return difference;
  }

  difference = (Number(b.rarity) || 0) - (Number(a.rarity) || 0);
  if (difference) return difference;
  difference = (Number(b.level) || 0) - (Number(a.level) || 0);
  if (difference) return difference;
  // starLevel 本身包含大星与小节点进度，可直接作为完整化极标量比较。
  difference = (operatorHuaji(b).stage ?? -1) - (operatorHuaji(a).stage ?? -1);
  if (difference) return difference;
  difference =
    (CURRENT_PROF_ORDER[a.prof] ?? 99) - (CURRENT_PROF_ORDER[b.prof] ?? 99);
  if (difference) return difference;
  difference = operatorReleaseOrder(b.id) - operatorReleaseOrder(a.id);
  if (difference) return difference;
  return String(a.name || a.id).localeCompare(String(b.name || b.id), "zh-CN");
}

const upgradeReadyGroups = computed(function () {
  const groups = {
    growth: [],
    level: [],
    elite: [],
    huaji: [],
    favoriteHuaji: [],
  };
  if (cardMaterialLoadedAccount.value !== accountId.value) return groups;
  ownedCurrentEntries.value.forEach(function (entry) {
    const status = operatorStatus(entry);
    if (status === "discarded") return;
    if (status === "growing") {
      const levelReady = quickGrowthActionAvailable(entry, "level", 5);
      const eliteReady = quickGrowthActionAvailable(entry, "elite", 1);
      if (levelReady) groups.level.push(entry);
      if (eliteReady) groups.elite.push(entry);
      if (levelReady || eliteReady) groups.growth.push(entry);
    }
    if (quickGrowthActionAvailable(entry, "star", 1)) {
      groups.huaji.push(entry);
      if (favoriteAgentIds.value.has(entry.id))
        groups.favoriteHuaji.push(entry);
    }
  });
  return groups;
});

const growthReadyCount = computed(function () {
  return upgradeReadyGroups.value.growth.length;
});
const huajiReadyCount = computed(function () {
  return upgradeReadyGroups.value.huaji.length;
});
const growthReadySummary = computed(function () {
  return (
    "等级可提升 " +
    upgradeReadyGroups.value.level.length +
    " 位 · 修为可提升 " +
    upgradeReadyGroups.value.elite.length +
    " 位"
  );
});
const favoriteHuajiNames = computed(function () {
  return upgradeReadyGroups.value.favoriteHuaji.map(function (entry) {
    return entry.name || entry.id;
  });
});
const activeUpgradeReadyIds = computed(function () {
  const entries =
    upgradeReadyFilter.value === "growth"
      ? upgradeReadyGroups.value.growth
      : upgradeReadyFilter.value === "huaji"
        ? upgradeReadyGroups.value.huaji
        : [];
  return new Set(
    entries.map(function (entry) {
      return entry.id;
    }),
  );
});

function matchesCurrentFilters(entry) {
  return (
    matchesOperatorSearch(entry, currentSearch.value) &&
    matchesOperatorQuality(entry, rarityFilter.value) &&
    matchesProfSubFilter(entry, profFilter.value, subProfFilter.value) &&
    matchesOperatorStatus(operatorStatus(entry), workbenchStatusFilter.value) &&
    (!organizationTagFilter.value || organizationTagMembers.value.has(entry.id)) &&
    matchesOperatorGrowthFilters(entry, growthFilters.value) &&
    (!upgradeReadyFilter.value || activeUpgradeReadyIds.value.has(entry.id))
  );
}

const filteredCurrent = computed(function () {
  return ownedCurrentEntries.value
    .filter(matchesCurrentFilters)
    .filter(entry => matchesDiscStatus(entry.discLoadouts, discStatusFilter.value))
    .sort(compareCurrentEntries);
});

const batchSelectedIds = computed(function () {
  return new Set(
    filteredCurrent.value
      .filter(function (entry) {
        return batchSelectionBase.value.has(entry.id);
      })
      .map(function (entry) {
        return entry.id;
      }),
  );
});
const batchSelectedCount = computed(function () {
  return batchSelectedIds.value.size;
});
const batchAllSelected = computed(function () {
  return (
    filteredCurrent.value.length > 0 &&
    filteredCurrent.value.every(function (entry) {
      return batchSelectedIds.value.has(entry.id);
    })
  );
});
const batchIndeterminate = computed(function () {
  return batchSelectedCount.value > 0 && !batchAllSelected.value;
});

function growthFilterParts(filters) {
  const parts = [];
  for (const [key, label] of [["level", "等级"], ["elite", "修为"], ["star", "星数"]]) {
    const min = filters[key + "Min"];
    const max = filters[key + "Max"];
    if (!filters[key + "Enabled"] || (min === "" && max === "")) continue;
    const display = value => value === "" ? "不限" : (key === "star" && value === "6" ? "觉醒" : value);
    parts.push(label + "「" + (min === max ? display(min) : display(min) + "–" + display(max)) + "」");
  }
  return parts;
}

const currentFilterSuffix = computed(function () {
  const parts = [];
  parts.push("版本「" + gameFilter.value + "」");
  if (rarityFilter.value !== "all")
    parts.push("品质「" + (rarityLabelMap[rarityFilter.value] || rarityFilter.value) + "」");
  if (profFilter.value !== "all")
    parts.push("属性「" + profFilter.value + "」");
  if (subProfFilter.value !== "all")
    parts.push("职业「" + subProfFilter.value + "」");
  const group = workbenchStatusOptions.value.find(option => option.value === workbenchStatusFilter.value);
  const organizationTag = organizationData.value.tags.find(tag => tag.id === organizationTagFilter.value);
  if (organizationTag) parts.push("标签「" + organizationTag.name + "」");
  parts.push("分组「" + (group ? group.label : workbenchStatusFilter.value) + "」");
  parts.push(...growthFilterParts(growthFilters.value));
  if (discStatusFilter.value !== "all") parts.push("命盘「" + DISC_FILTER_OPTIONS.find(option => option.value === discStatusFilter.value).label + "」");
  if (upgradeReadyFilter.value === "growth") parts.push("「等级/修为可提升」");
  if (upgradeReadyFilter.value === "huaji") parts.push("「可提升化极」");
  return parts.length ? parts.join(" · ") : "当前条件";
});

const hasGrowthDrafts = computed(function () {
  return Object.values(growthFilters.value).some(Boolean);
});

const hasCurrentFilters = computed(function () {
  return (
    discStatusFilter.value !== "all" ||
    Boolean(currentSearch.value.trim()) ||
    Boolean(organizationTagFilter.value) ||
    rarityFilter.value !== "all" ||
    profFilter.value !== "all" ||
    subProfFilter.value !== "all" ||
    workbenchStatusFilter.value !== defaultStatusFilter ||
    hasGrowthDrafts.value ||
    Boolean(upgradeReadyFilter.value)
  );
});

function resetCurrentFilters() {
  discStatusFilter.value = "all";
  currentSearch.value = "";
  organizationTagFilter.value = "";
  rarityFilter.value = "all";
  profFilter.value = "all";
  subProfFilter.value = "all";
  workbenchStatusFilter.value = defaultStatusFilter;
  growthFilters.value = emptyGrowthFilters();
  upgradeReadyFilter.value = "";
  batchSelectionBase.value = new Set();
}

function toggleUpgradeReadyFilter(filter) {
  if (upgradeReadyFilter.value === filter) {
    upgradeReadyFilter.value = "";
    return;
  }
  resetCurrentFilters();
  upgradeReadyFilter.value = filter;
}

function setWorkbenchStatusFilter(value) {
  if (!workbenchStatusOptions.value.some(option => option.value === value)) return;
  workbenchStatusFilter.value = value;
  upgradeReadyFilter.value = "";
}

function monogram(e) {
  const s = String(e.name || e.id || "?");
  return Array.from(s)[0] || "?";
}

// 养成卡（currentEntries 系列快照）没有目录字段，按 id 回查目录拿到头像
function avOf(id) {
  const op = catalogMap.value[id];
  return (op && op.avatar) || "";
}

function slotTitle(e) {
  const parts = [e.name || e.id];
  if (e.owned)
    parts.push(
      "修为 " +
        e.elite +
        " · " +
        starLabel(e.starLevel, e.spOf) +
        " · Lv" +
        e.level,
    );
  else parts.push("未拥有");
  if (e.prof) parts.push(e.prof);
  return parts.join(" ｜ ");
}

function loadoutSummary(loadout, legacyDiscs) {
  const source =
    loadout ||
    (legacyDiscs && legacyDiscs.length ? { discs: legacyDiscs } : null);
  if (!source) return "未配置";
  const discs = Array.isArray(source.discNames)
    ? source.discNames
    : Array.isArray(source.discs)
      ? source.discs.map(discKey).filter(Boolean)
      : [];
  return (
    (source.name || (discs.length ? discs.join("、") : "未配置")) +
    (discs.length && source.name ? " · " + discs.join("、") : "")
  );
}

function hasCombatValue(entry) {
  const stats = entry && entry.combatStats;
  return !!stats && (stats.attack != null || stats.hp != null);
}

function combatObservedStatus(entry) {
  const stats = entry && entry.combatStats;
  return stats && (stats.observedStatus || stats.observed_status);
}

const editingObservedStatus = computed(function () {
  return combatObservedStatus(currentMap.value[editingId.value]);
});

function stoneSignature(stones) {
  return Object.keys(stones || {})
    .sort()
    .map(function (type) {
      const stone = stones[type] || {};
      return [
        type,
        String(stone.name || ""),
        Number(stone.level) || 0,
        Number(stone.rarity) || 0,
      ].join(":");
    })
    .join("|");
}

function stoneSummary(stones) {
  if (!Array.isArray(stones) || !stones.length) return "未配置";
  return stones
    .map(function (stone) {
      return (
        (stone.name || stone.type || "未命名") +
        (stone.level != null ? " Lv" + stone.level : "")
      );
    })
    .join("、");
}

function workbenchStorageKey(kind) {
  return (
    "yuanhub:operator-workbench:" +
    kind +
    ":" +
    (accountId.value || "guest") +
    ":" +
    saveGame.value
  );
}

function readWorkbenchMap(kind) {
  if (typeof localStorage === "undefined") return {};
  try {
    return (
      JSON.parse(localStorage.getItem(workbenchStorageKey(kind)) || "{}") || {}
    );
  } catch (_) {
    return {};
  }
}

function persistWorkbenchMap(kind, value) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(workbenchStorageKey(kind), JSON.stringify(value));
}

function annotationMigrationKey(account) {
  return "yuanhub:operator-annotations-migrated:v1:" + account;
}

function annotationRevision(item) {
  return Number(item && item.revision) || 0;
}

function applyAnnotationItem(item) {
  const id = item && (item.operator_id || item.operatorId);
  if (!id) return;
  const apiState = item.growth_state || item.growthState || "active";
  const note = item.note == null ? "" : String(item.note);
  workbenchStatuses.value = Object.assign({}, workbenchStatuses.value, {
    [id]: operatorAnnotationStatus(apiState),
  });
  workbenchRemarks.value = Object.assign({}, workbenchRemarks.value, {
    [id]: note,
  });
  annotationRevisions.value = Object.assign({}, annotationRevisions.value, {
    [id]: annotationRevision(item),
  });
}

async function migrateLocalAnnotations(targetAccount, remoteIds) {
  if (
    typeof localStorage === "undefined" ||
    localStorage.getItem(annotationMigrationKey(targetAccount)) === "done"
  )
    return;
  const scopeSeq = annotationScopeSeq;
  const localStatuses = readWorkbenchMap("statuses");
  const localRemarks = readWorkbenchMap("remarks");
  const ids = new Set(
    Object.keys(localStatuses).concat(Object.keys(localRemarks)),
  );
  const candidates = Array.from(ids).filter(function (id) {
    if (remoteIds.has(id)) return false;
    const state = localStatuses[id] || "growing";
    const note =
      localRemarks[id] == null ? "" : String(localRemarks[id]).trim();
    return state !== "growing" || !!note;
  });
  let deferred = false;
  for (const id of candidates) {
    if (accountId.value !== targetAccount || annotationScopeSeq !== scopeSeq) return;
    const state = localStatuses[id] || "growing";
    const note =
      localRemarks[id] == null || String(localRemarks[id]).trim() === ""
        ? null
        : String(localRemarks[id]);
    if (!discardedEnabled && operatorAnnotationStatus(state) === "discarded") {
      // Keep the cache for migration after the paired software supports this state.
      deferred = true;
      workbenchStatuses.value = { ...workbenchStatuses.value, [id]: state };
      workbenchRemarks.value = { ...workbenchRemarks.value, [id]: note || "" };
      continue;
    }
    const item = await putOperatorAnnotation({
      accountId: targetAccount,
      operatorId: id,
      annotation: {
        growth_state: operatorAnnotationApiState(state),
        note: note,
        expected_revision: 0,
      },
    });
    if (accountId.value !== targetAccount || annotationScopeSeq !== scopeSeq) return;
    applyAnnotationItem(item);
  }
  if (!deferred) localStorage.setItem(annotationMigrationKey(targetAccount), "done");
}

async function loadOperatorAnnotations() {
  if (!auth.isLoggedIn || !accountId.value) {
    annotationLoadSeq += 1;
    annotationRevisions.value = {};
    return;
  }
  const targetAccount = accountId.value;
  const seq = ++annotationLoadSeq;
  annotationError.value = "";
  try {
    const data = await getOperatorAnnotations(targetAccount);
    if (seq !== annotationLoadSeq || accountId.value !== targetAccount) return;
    const items = Array.isArray(data && data.items) ? data.items : [];
    const statuses = {};
    const remarks = {};
    const revisions = {};
    const remoteIds = new Set();
    items.forEach(function (item) {
      const id = item && (item.operator_id || item.operatorId);
      if (!id) return;
      remoteIds.add(id);
      statuses[id] =
        operatorAnnotationStatus(item.growth_state ?? item.growthState);
      remarks[id] = item.note == null ? "" : String(item.note);
      revisions[id] = annotationRevision(item);
    });
    const merged = reconcileOperatorAnnotations(
      { statuses, remarks, revisions },
      {
        statuses: workbenchStatuses.value,
        remarks: workbenchRemarks.value,
        revisions: annotationRevisions.value,
      },
      annotationBusyIds.value,
    );
    workbenchStatuses.value = merged.statuses;
    workbenchRemarks.value = merged.remarks;
    annotationRevisions.value = merged.revisions;
    await migrateLocalAnnotations(targetAccount, remoteIds);
    if (seq !== annotationLoadSeq || accountId.value !== targetAccount) return;
    persistWorkbenchMap("statuses", workbenchStatuses.value);
    persistWorkbenchMap("remarks", workbenchRemarks.value);
  } catch (err) {
    if (seq !== annotationLoadSeq || accountId.value !== targetAccount) return;
    annotationError.value = humanErr(err, "养成状态与备注同步失败");
  }
}

async function saveOperatorAnnotation(entry, fields) {
  if (!entry || !entry.id || !auth.isLoggedIn || !accountId.value) return null;
  const targetAccount = accountId.value;
  const scopeSeq = annotationScopeSeq;
  const id = entry.id;
  annotationBusyIds.value = new Set(annotationBusyIds.value).add(id);
  annotationError.value = "";
  let revisionConflict = false;
  try {
    const body = Object.assign({}, fields, {
      expected_revision: Number(annotationRevisions.value[id]) || 0,
    });
    const item = await putOperatorAnnotation({
      accountId: targetAccount,
      operatorId: id,
      annotation: body,
    });
    if (accountId.value !== targetAccount || annotationScopeSeq !== scopeSeq) return null;
    applyAnnotationItem(item);
    persistWorkbenchMap("statuses", workbenchStatuses.value);
    persistWorkbenchMap("remarks", workbenchRemarks.value);
    return item;
  } catch (err) {
    if (accountId.value === targetAccount && annotationScopeSeq === scopeSeq) {
      annotationError.value = humanErr(err, "养成标注保存失败");
      revisionConflict = err && err.code === "annotation_revision_conflict";
    }
    throw err;
  } finally {
    if (accountId.value === targetAccount && annotationScopeSeq === scopeSeq) {
      const next = new Set(annotationBusyIds.value);
      next.delete(id);
      annotationBusyIds.value = next;
      if (revisionConflict) {
        await loadOperatorAnnotations();
        if (accountId.value === targetAccount && annotationScopeSeq === scopeSeq && !annotationError.value)
          annotationError.value = "养成状态或备注已在其他页面更新，已重新同步，请确认最新状态后重试";
      }
    }
  }
}

function readFavoriteFirstPreference() {
  if (typeof localStorage === "undefined") return false;
  try {
    return (
      localStorage.getItem(workbenchStorageKey("favorite-first")) === "true"
    );
  } catch (_) {
    return false;
  }
}

function setFavoriteFirst(value) {
  favoriteFirst.value = Boolean(value);
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      workbenchStorageKey("favorite-first"),
      String(favoriteFirst.value),
    );
  } catch (_) {}
}

function operatorStatus(entry) {
  return operatorAnnotationStatus(workbenchStatuses.value[entry.id]);
}

function statusLabel(status) {
  return operatorAnnotationStatusLabel(status);
}

function flattenInventoryCurrent(data) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const result = {};
  rows.forEach(function (row) {
    const entries =
      row && row.entries && typeof row.entries === "object" ? row.entries : {};
    Object.keys(entries).forEach(function (id) {
      const value = entries[id];
      result[id] =
        Number(value && value.count != null ? value.count : value) || 0;
    });
  });
  return result;
}

async function loadCardMaterialStock() {
  if (!auth.isLoggedIn || !accountId.value) {
    cardMaterialLoadSeq += 1;
    cardMaterialLoadedAccount.value = "";
    cardMaterialStock.value = {};
    cardHeartStock.value = {};
    cardMaterialLoading.value = false;
    return;
  }
  const targetAccount = accountId.value;
  const seq = ++cardMaterialLoadSeq;
  cardMaterialLoading.value = true;
  try {
    const results = await Promise.all([
      getInventoryCurrent({ accountId: targetAccount, entityType: "item" }),
      getInventoryCurrent({ accountId: targetAccount, entityType: "agent" }),
    ]);
    if (seq !== cardMaterialLoadSeq || accountId.value !== targetAccount)
      return;
    const items = flattenInventoryCurrent(results[0]);
    cardMaterialStock.value = Object.assign({}, items, {
      // 与体力规划器共用经验道具换算，避免两个页面口径漂移。
      __experience__: bookExperience(items),
    });
    cardHeartStock.value = flattenInventoryCurrent(results[1]);
    cardMaterialLoadedAccount.value = targetAccount;
  } catch (_) {
    if (seq === cardMaterialLoadSeq) {
      cardMaterialLoadedAccount.value = "";
      cardMaterialStock.value = {};
      cardHeartStock.value = {};
    }
  } finally {
    if (seq === cardMaterialLoadSeq) cardMaterialLoading.value = false;
  }
}

function normalizeCardDiscLoadouts(entry) {
  const source =
    Array.isArray(entry && entry.discLoadouts) && entry.discLoadouts.length
      ? entry.discLoadouts
      : Array.isArray(entry && entry.discs) && entry.discs.length
        ? [{ discs: entry.discs }]
        : [];
  return Array.from({ length: 2 }, function (_, index) {
    const loadout = source[index] || {};
    const names = Array.isArray(loadout.discNames)
      ? loadout.discNames
      : Array.isArray(loadout.discs)
        ? loadout.discs.map(discKey).filter(Boolean)
        : [];
    return createDiscLoadout(index, { ...loadout, discNames: names });
  });
}

function normalizeCardStarStones(entry) {
  const source = Array.isArray(entry && entry.starStones)
    ? entry.starStones
    : [];
  const hasTypedSlots = source.some(function (stone) {
    return !!(stone && stone.type);
  });
  return Array.from({ length: 6 }, function (_, index) {
    const slot = stoneSlots.value[index];
    const type = slot ? slot.type : "stone" + (index + 1);
    // Typed payloads are sparse by design: a missing slot must remain empty,
    // rather than falling back to the item at the same array index.
    const hit =
      source.find(function (stone) {
        return normalizeStoneType(stone && stone.type) === type;
      }) || (!hasTypedSlots ? source[index] : null);
    const rarity =
      hit && hit.rarity != null
        ? hit.rarity
        : hit && hit.levelType != null
          ? hit.levelType
          : null;
    return {
      type: type,
      name: hit && hit.name ? hit.name : "",
      level:
        hit && hit.level != null
          ? Math.max(0, Math.min(60, Number(hit.level) || 0))
          : 0,
      rarity: rarity,
    };
  });
}

function cardStarLevel(entry) {
  const stage = operatorHuaji(entry).stage;
  return stage == null ? Number(entry.starLevel) || 0
    : entry.spOf && stage > 0 ? Math.floor((stage - 1) / 6) + 1 : stage;
}

function ensureCardDraft(entry) {
  if (!entry || !entry.id) return null;
  if (!cardGrowthDrafts.value[entry.id]) {
    const stats = entry.combatStats || normalizeOperatorCombatStats({});
    const modes = Object.assign(
      {},
      cardCombatModes.value[entry.id] || stats.displayMode || {},
    );
    cardGrowthDrafts.value = Object.assign({}, cardGrowthDrafts.value, {
      [entry.id]: {
        revision: Number(entry.revision) || 0,
        level: Number(entry.level) || 0,
        levelBreakthroughStage: operatorLevelBreakthroughStage(entry),
        elite: Number(entry.elite) || 0,
        star: cardStarLevel(entry),
        awakened: operatorHuaji(entry).awakened,
        discLoadouts: normalizeCardDiscLoadouts(entry),
        starStones: normalizeCardStarStones(entry),
        remark: operatorRemark(entry),
        modes: modes,
      },
    });
  }
  cardCombatDraft(entry);
  if (!cardDraftBaselines.value[entry.id])
    cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, {
      [entry.id]: cardDraftSnapshot(entry),
    });
  return cardGrowthDrafts.value[entry.id];
}

function cardDraftSnapshot(entry) {
  const growth = cardGrowthDrafts.value[entry.id] || {};
  const combat = cardCombatDrafts.value[entry.id] || {};
  return JSON.stringify({
    level: Number(growth.level) || 0,
    levelBreakthroughStage: operatorLevelBreakthroughStage(growth),
    elite: Number(growth.elite) || 0,
    star: Number(growth.star) || 0,
    awakened: growth.awakened,
    discLoadouts: growth.discLoadouts || [],
    starStones: growth.starStones || [],
    remark: growth.remark == null ? operatorRemark(entry) : growth.remark,
    modes: cardCombatModes.value[entry.id] || growth.modes || {},
    attack: combat.attack == null ? null : Number(combat.attack),
    hp: combat.hp == null ? null : Number(combat.hp),
    oddityAttack: Number(combat.oddityAttack) || 0,
    oddityHp: Number(combat.oddityHp) || 0,
  });
}

function parsedCardDraftSnapshot(entry) {
  try {
    return JSON.parse(cardDraftSnapshot(entry));
  } catch (_) {
    return {};
  }
}

function parsedCardDraftBaseline(entry) {
  try {
    return JSON.parse(cardDraftBaselines.value[entry.id] || "{}");
  } catch (_) {
    return {};
  }
}

function cardDraftChanges(entry) {
  const baseline = parsedCardDraftBaseline(entry);
  const current = parsedCardDraftSnapshot(entry);
  const baselineObjective = Object.assign({}, baseline);
  const currentObjective = Object.assign({}, current);
  delete baselineObjective.remark;
  delete currentObjective.remark;
  return {
    objective:
      JSON.stringify(baselineObjective) !== JSON.stringify(currentObjective),
    note: String(baseline.remark || "") !== String(current.remark || ""),
    baseline: baseline,
    current: current,
  };
}

function cardGrowthValue(entry, field) {
  const draft = ensureCardDraft(entry);
  if (!draft) return field === "star" ? entry.starLevel : entry[field];
  return draft[field];
}

function cardHuaji(entry) {
  const draft = ensureCardDraft(entry);
  const huaji = operatorHuajiDraft(entry, draft.star);
  return { ...huaji, awakened: huaji.owned ? draft.awakened : null };
}

function cardHasDraft(entry) {
  const draft = cardGrowthDrafts.value[entry.id];
  if (!draft) return false;
  const baseline = cardDraftBaselines.value[entry.id];
  return baseline !== cardDraftSnapshot(entry);
}

function setGrowthInput(entry, field, event) {
  const draft = ensureCardDraft(entry);
  if (!draft) return;
  const max = field === "level" ? 100 : getMaxEliteForLevel(draft.level);
  let value = Math.trunc(
    Number(event && event.target ? event.target.value : 0),
  );
  if (!Number.isFinite(value)) value = 0;
  const before = draft[field];
  draft[field] = Math.max(0, Math.min(max, value));
  if (field === "level" && before !== draft.level) draft.levelBreakthroughStage = inferredLevelBreakthroughStage(draft.level);
  if (field === "level" && draft.elite > getMaxEliteForLevel(draft.level))
    draft.elite = getMaxEliteForLevel(draft.level);
}

function openCardPopover(entry, field) {
  ensureCardDraft(entry);
  cardPopoverKey.value =
    cardPopoverKey.value === entry.id + ":" + field
      ? ""
      : entry.id + ":" + field;
}

// The compact loadout editors follow their own trigger, not the card footer.
watch(cardPopoverKey, (key, _previous, onCleanup) => {
  if (!ledgerCardIsV2 || !/:(disc|stone)-\d+$/.test(key)) return;
  const card = currentLedgerCardElements.get(key.slice(0, key.lastIndexOf(":")));
  const loadouts = card?.querySelector(".ledger-loadouts");
  const trigger = loadouts?.querySelector('[aria-expanded="true"]');
  const panel = loadouts?.querySelector(".ledger-popover");
  if (!trigger || !panel) return;

  let frame = 0;
  function position() {
    frame = 0;
    if (!window.matchMedia("(max-width: 640px)").matches) return;
    const viewport = window.visualViewport;
    const bounds = loadouts.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const header = document.querySelector(".mobile-shell")?.getBoundingClientRect();
    const tabs = document.querySelector(".operator-mobile-tabs")?.getBoundingClientRect();
    const topEdge = Math.max(viewport?.offsetTop || 0, header?.bottom || 0) + 8;
    const bottomEdge = Math.min(
      (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight),
      tabs?.height ? tabs.top : window.innerHeight,
    ) - 8;
    if (anchor.bottom < topEdge || anchor.top > bottomEdge) {
      cardPopoverKey.value = "";
      return;
    }
    const below = Math.max(0, bottomEdge - anchor.bottom - 7);
    const above = Math.max(0, anchor.top - topEdge - 7);
    const desiredHeight = Math.min(320, panel.scrollHeight + 2);
    const upwards = below < desiredHeight && above > below;
    const maxHeight = Math.min(320, upwards ? above : below);
    const top = upwards
      ? anchor.top - 7 - Math.min(desiredHeight, maxHeight)
      : anchor.bottom + 7;
    panel.style.setProperty("--ledger-loadout-popover-top", `${top - bounds.top - loadouts.clientTop}px`);
    panel.style.setProperty("--ledger-loadout-popover-height", `${maxHeight}px`);
  }
  function schedulePosition() {
    if (!frame) frame = window.requestAnimationFrame(position);
  }

  position();
  const observer = new ResizeObserver(schedulePosition);
  observer.observe(loadouts);
  observer.observe(trigger);
  observer.observe(panel);
  window.addEventListener("scroll", schedulePosition, true);
  window.addEventListener("resize", schedulePosition);
  window.visualViewport?.addEventListener("resize", schedulePosition);
  window.visualViewport?.addEventListener("scroll", schedulePosition);
  onCleanup(() => {
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("scroll", schedulePosition, true);
    window.removeEventListener("resize", schedulePosition);
    window.visualViewport?.removeEventListener("resize", schedulePosition);
    window.visualViewport?.removeEventListener("scroll", schedulePosition);
  });
}, { flush: "post" });

function cardLevelBreakthrough(entry) {
  if (!showLevelBreakthroughOption(entry, 5)) return false;
  const draft = ensureCardDraft(entry);
  const stage = operatorLevelBreakthroughStage(draft);
  if (stage != null) return stage === Number(draft.level) / 10;
  return (
    Number(cardLevelBreakthroughs.value[entry.id]) ===
    Number(cardGrowthValue(entry, "level"))
  );
}

function showLevelBreakthroughOption(entry, step) {
  const level = Number(cardGrowthValue(entry, "level")) || 0;
  return (
    Number(step) === 5 &&
    level >= 10 &&
    level <= 90 &&
    level % 10 === 0 &&
    growthTarget(entry, "level", step) > level
  );
}

function setCardLevelBreakthrough(entry, event) {
  if (!entry || !entry.id) return;
  if (operatorLevelBreakthroughStage(ensureCardDraft(entry)) != null) {
    if (event?.target) event.target.checked = cardLevelBreakthrough(entry);
    return;
  }
  const checked = Boolean(event && event.target && event.target.checked);
  cardLevelBreakthroughs.value = Object.assign(
    {},
    cardLevelBreakthroughs.value,
    {
      [entry.id]: checked ? Number(cardGrowthValue(entry, "level")) : null,
    },
  );
  openGrowthAction(entry, "level", 5);
}

function growthTarget(entry, field, step) {
  const draft = ensureCardDraft(entry);
  if (!draft) return 0;
  const amount =
    Number(step == null ? cardPopoverStep.value : step) ||
    (field === "level" ? 5 : 1);
  if (field === "level") return Math.min(100, draft.level + amount);
  if (field === "elite")
    return Math.min(getMaxEliteForLevel(draft.level), draft.elite + amount);
  if (isQuickAwakening(entry)) return 1;
  const value = operatorHuaji(entry);
  return Math.min(operatorHuajiMax(entry), (value.stage ?? operatorHuajiMax(entry)) + 1);
}

function growthActionKey(entry, field) {
  return entry.id + ":" + field;
}

function growthPreviewFor(entry, field) {
  return growthPreviews.value[growthActionKey(entry, field)] || null;
}

function growthPreviewData(entry, field) {
  const state = growthPreviewFor(entry, field);
  return state && state.data ? state.data : null;
}

function growthPreviewError(entry, field) {
  const state = growthPreviewFor(entry, field);
  return state && state.error ? state.error : "";
}

function growthPreviewAvailable(entry, field) {
  const preview = growthPreviewData(entry, field);
  return !!(preview && preview.available);
}

function growthPreviewRequirements(entry, field) {
  const preview = growthPreviewData(entry, field);
  return preview && Array.isArray(preview.requirements)
    ? preview.requirements
    : [];
}

function sharedGrowthCatalog(entry) {
  return catalogMap.value[entry.spOf || entry.id] || entry;
}

function growthPreviewDisplayRequirements(entry, field) {
  const requirements = growthPreviewRequirements(entry, field).slice();
  if (field !== "level" || cardMaterialLoadedAccount.value !== accountId.value)
    return requirements;
  const bookIds = new Set([
    "liutaobingshu",
    "bingshuquanjuan",
    "bingshucanjuan",
  ]);
  if (
    requirements.some(function (item) {
      return bookIds.has(item && item.id);
    })
  )
    return requirements;
  const requiredExperience = growthPreviewExperience(entry, field);
  const stock = cardMaterialStock.value || {};
  const experienceGap = Math.max(
    requiredExperience - (Number(stock.__experience__) || 0),
    0,
  );
  if (!experienceGap) return requirements;
  const projectedStock = Object.assign({}, stock);
  levelBookGapBundle(experienceGap).forEach(function (book) {
    projectedStock[book.id] =
      (Number(projectedStock[book.id]) || 0) + book.required;
  });
  levelBookDeductions(requiredExperience, projectedStock).forEach(
    function (book) {
      const owned = Number(stock[book.id]) || 0;
      requirements.push({
        entity_type: "item",
        id: book.id,
        required: book.required,
        owned: owned,
        balance_after: owned - book.required,
      });
    },
  );
  return requirements;
}

function growthRequirementName(requirement, entry) {
  const type =
    requirement && (requirement.entity_type || requirement.entityType);
  const id = requirement && requirement.id;
  if (type === "agent") {
    const operator = catalogMap.value[id];
    return (
      ((operator && operator.name) ||
        (entry && entry.id === id && entry.name) ||
        id) + "心纸"
    );
  }
  return itemNameById(id);
}

function growthRequirementValue(requirement, key) {
  if (!requirement) return 0;
  const camel = key.replace(/_([a-z])/g, function (_, letter) {
    return letter.toUpperCase();
  });
  return (
    Number(requirement[key] != null ? requirement[key] : requirement[camel]) ||
    0
  );
}

function growthRequirementBalanceLabel(requirement) {
  const balance = growthRequirementValue(requirement, "balance_after");
  if (balance < 0) return "缺 " + Math.abs(balance).toLocaleString("zh-CN");
  return (
    growthRequirementValue(requirement, "owned").toLocaleString("zh-CN") +
    " → " +
    balance.toLocaleString("zh-CN")
  );
}

function growthPreviewExperience(entry, field) {
  const preview = growthPreviewData(entry, field);
  return (
    Number(
      preview &&
        (preview.experience_required != null
          ? preview.experience_required
          : preview.experienceRequired),
    ) || 0
  );
}

function growthPreviewBlockingReasons(entry, field) {
  const preview = growthPreviewData(entry, field);
  const reasons =
    preview &&
    Array.isArray(preview.blocking_reasons || preview.blockingReasons)
      ? preview.blocking_reasons || preview.blockingReasons
      : [];
  const visibleReasons = reasons.filter(function (reason) {
    return String((reason && reason.code) || "") !== "insufficient_inventory";
  });
  return visibleReasons;
}

function growthPreviewHasMaterialGap(entry, field) {
  return growthPreviewDisplayRequirements(entry, field).some(function (item) {
    return growthRequirementValue(item, "balance_after") < 0;
  });
}

function growthReasonMessage(reason) {
  return String(
    (reason && (reason.message || reason.code)) || "当前状态无法提升",
  );
}

function isGrowthPreviewBusy(entry, field) {
  return growthPreviewBusyKeys.value.has(growthActionKey(entry, field));
}

function isGrowthExecuteBusy(entry, field) {
  return growthExecuteBusyKeys.value.has(growthActionKey(entry, field));
}

function isQuickAwakening(entry) {
  return operatorAwakeningUpgradeSupported(entry) && operatorHuajiAction(entry).kind === "awakening";
}

function upgradeDimension(field, entry) {
  return field === "star" ? isQuickAwakening(entry) ? "awakening" : "huaji" : field;
}

function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
    return globalThis.crypto.randomUUID();
  return "upgrade-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function resetCardDraftState(id) {
  [cardGrowthDrafts, cardDraftBaselines, cardCombatDrafts, cardCombatModes].forEach(
    function (state) {
      const next = Object.assign({}, state.value);
      delete next[id];
      state.value = next;
    },
  );
  const editedKeys = new Set(cardCombatEditedKeys.value);
  editedKeys.delete(id + ":attack");
  editedKeys.delete(id + ":hp");
  cardCombatEditedKeys.value = editedKeys;
}

async function openGrowthAction(entry, field, step, retriedAfterRefresh) {
  const contextSeq = currentContextSeq;
  ensureCardDraft(entry);
  if (cardHasDraft(entry)) {
    quickNotices.value = Object.assign({}, quickNotices.value, {
      [entry.id]: "请先保存或取消卡片中的手动修改",
    });
    return;
  }
  if (field === 'star') {
    const action = operatorHuajiAction(entry);
    if (action.disabled) return;
    if (action.kind === 'awakening' && !operatorAwakeningUpgradeSupported(entry)) {
      if (!auth.isLoggedIn || !accountId.value || cardSubmitStates.value[entry.id] === 'submitting') return;
      cardPopoverKey.value = '';
      awakeningId.value = entry.id;
      return;
    }
  }
  cardPopoverStep.value = step || 1;
  const key = growthActionKey(entry, field);
  const requestSequence = (growthPreviewRequestSequences.get(key) || 0) + 1;
  const skipBreakthroughMaterials =
    field === "level" && cardLevelBreakthrough(entry);
  growthPreviewRequestSequences.set(key, requestSequence);
  cardPopoverKey.value = key;
  growthPreviewBusyKeys.value = new Set(growthPreviewBusyKeys.value).add(key);
  growthExecutionKeys.delete(key);
  growthPreviews.value = Object.assign({}, growthPreviews.value, {
    [key]: { data: null, error: "" },
  });
  try {
    const data = await previewOperatorUpgrade({
      accountId: accountId.value,
      game: saveGame.value,
      operatorId: entry.id,
      dimension: upgradeDimension(field, entry),
      target: growthTarget(entry, field, step),
      expectedOperatorRevision: Number(entry.revision) || 0,
      skipBreakthroughMaterials: skipBreakthroughMaterials,
    });
    if (
      contextSeq !== currentContextSeq ||
      cardPopoverKey.value !== key ||
      growthPreviewRequestSequences.get(key) !== requestSequence ||
      skipBreakthroughMaterials !==
        (field === "level" && cardLevelBreakthrough(entry))
    )
      return;
    growthPreviews.value = Object.assign({}, growthPreviews.value, {
      [key]: { data: data, error: "" },
    });
  } catch (err) {
    if (
      contextSeq !== currentContextSeq ||
      cardPopoverKey.value !== key ||
      growthPreviewRequestSequences.get(key) !== requestSequence
    )
      return;
    if (err && err.code === "operator_state_stale" && !retriedAfterRefresh) {
      await reloadCurrent(true);
      if (contextSeq !== currentContextSeq) return false;
      resetCardDraftState(entry.id);
      await openGrowthAction(
        currentMap.value[entry.id] || entry,
        field,
        step,
        true,
      );
      return;
    }
    growthPreviews.value = Object.assign({}, growthPreviews.value, {
      [key]: { data: null, error: humanErr(err, "提升预览失败") },
    });
  } finally {
    if (contextSeq === currentContextSeq && growthPreviewRequestSequences.get(key) === requestSequence) {
      const next = new Set(growthPreviewBusyKeys.value);
      next.delete(key);
      growthPreviewBusyKeys.value = next;
    }
  }
}

function applyUpgradeConsumption(consumed) {
  (Array.isArray(consumed) ? consumed : []).forEach(function (item) {
    const type = item.entity_type || item.entityType;
    const id = item.id;
    const balance =
      Number(
        item.balance_after != null ? item.balance_after : item.balanceAfter,
      ) || 0;
    if (type === "agent")
      cardHeartStock.value = Object.assign({}, cardHeartStock.value, {
        [id]: balance,
      });
    else
      cardMaterialStock.value = Object.assign({}, cardMaterialStock.value, {
        [id]: balance,
      });
  });
  const stock = cardMaterialStock.value;
  cardMaterialStock.value = Object.assign({}, stock, {
    __experience__: bookExperience(stock),
  });
}

async function refreshAwakeningEntry(id) {
  if (!(await reloadCurrentEntry(id, true))) throw new Error('最新养成同步失败，请重试');
  return currentMap.value[id];
}

function onAwakeningSaved({ operatorId, payload }) {
  applyPatchedCurrentEntry(operatorId, payload);
  awakeningId.value = '';
  showQuickNotice(operatorId, '觉醒状态已记录，未扣除库存', 2400);
}

function applyUpgradeOperator(entry, raw) {
  if (!entry || !raw) return;
  const preserveDraft =
    !!cardGrowthDrafts.value[entry.id] && cardHasDraft(entry);
  entry.level = Number(raw.level) || 0;
  entry.levelBreakthroughStage = operatorLevelBreakthroughStage(raw);
  entry.elite = Number(raw.elite) || 0;
  entry.starLevel =
    Number(raw.star_level != null ? raw.star_level : raw.starLevel) || 0;
  entry.huaji = raw.huaji || entry.huaji;
  entry.revision = Number(raw.revision) || entry.revision || 0;
  if (preserveDraft) {
    showQuickNotice(
      entry.id,
      "服务器养成已更新；当前未保存修改仍保留，请确认后再提交",
    );
    return;
  }
  const draft = ensureCardDraft(entry);
  if (draft) {
    draft.revision = Number(entry.revision) || 0;
    draft.level = entry.level;
    draft.levelBreakthroughStage = entry.levelBreakthroughStage;
    draft.elite = entry.elite;
    draft.star = cardStarLevel(entry);
    draft.awakened = operatorHuaji(entry).awakened;
    cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, {
      [entry.id]: cardDraftSnapshot(entry),
    });
  }
}

async function executeGrowthAction(entry, field) {
  const contextSeq = currentContextSeq;
  const key = growthActionKey(entry, field);
  const preview = growthPreviewData(entry, field);
  if (cardHasDraft(entry)) { showQuickNotice(entry.id, "请先保存或取消卡片中的手动修改"); return false; }
  if (!preview || !preview.available || growthExecuteBusyKeys.value.has(key))
    return false;
  const target = Number(preview.to);
  const operatorRevision =
    Number(
      preview.operator_revision != null
        ? preview.operator_revision
        : preview.operatorRevision,
    ) || 0;
  const inventoryRevision =
    Number(
      preview.inventory_revision != null
        ? preview.inventory_revision
        : preview.inventoryRevision,
    ) || 0;
  const previewToken = preview.preview_token || preview.previewToken;
  const idempotencyKey = growthExecutionKeys.get(key) || uuid();
  growthExecutionKeys.set(key, idempotencyKey);
  growthExecuteBusyKeys.value = new Set(growthExecuteBusyKeys.value).add(key);
  try {
    const result = await executeOperatorUpgrade({
      accountId: accountId.value,
      game: saveGame.value,
      operatorId: entry.id,
      dimension: preview.dimension || upgradeDimension(field, entry),
      target: target,
      expectedOperatorRevision: operatorRevision,
      expectedInventoryRevision: inventoryRevision,
      previewToken: previewToken,
      idempotencyKey: idempotencyKey,
      skipBreakthroughMaterials:
        field === "level" && cardLevelBreakthrough(entry),
    });
    if (contextSeq !== currentContextSeq) return false;
    const transactionId =
      result && (result.transaction_id || result.transactionId);
    if (transactionId) handledUpgradeTransactionIds.add(transactionId);
    applyUpgradeOperator(entry, result && result.operator);
    applyUpgradeConsumption(result && result.consumed);
    cardPopoverKey.value = "";
    growthExecutionKeys.delete(key);
    showQuickNotice(entry.id, "已提升并扣除库存", 2200);
    return true;
  } catch (err) {
    if (contextSeq !== currentContextSeq) return false;
    const refreshable =
      err &&
      [
        "operator_state_stale",
        "inventory_state_stale",
        "insufficient_inventory",
        "preview_expired",
      ].includes(err.code);
    showQuickNotice(
      entry.id,
      refreshable ? "状态已变化，已刷新提升预览" : humanErr(err, "提升失败"),
    );
    if (refreshable) {
      await Promise.all([reloadCurrent(true), loadCardMaterialStock()]);
      if (contextSeq !== currentContextSeq) return false;
      resetCardDraftState(entry.id);
      await openGrowthAction(
        currentMap.value[entry.id] || entry,
        field,
        cardPopoverStep.value,
      );
    }
    return false;
  } finally {
    if (contextSeq === currentContextSeq) {
      const next = new Set(growthExecuteBusyKeys.value);
      next.delete(key);
      growthExecuteBusyKeys.value = next;
    }
  }
}

function setGrowthDraft(entry, field, value, closePopover) {
  const draft = ensureCardDraft(entry);
  if (!draft) return;
  if (field === "star")
    value = Math.max(0, Math.min(entry.spOf ? 5 : operatorHuajiMax(entry), Number(value) || 0));
  draft[field] = Math.trunc(Number(value) || 0);
  if (field === "level" && draft.elite > getMaxEliteForLevel(draft.level))
    draft.elite = getMaxEliteForLevel(draft.level);
  if (closePopover !== false) cardPopoverKey.value = "";
}

function starDraftGroup(entry) {
  const value = cardGrowthValue(entry, "star");
  if (operatorAwakeningSupported(entry) && cardHuaji(entry).awakened === true) return 'awakening';
  if (entry.spOf) return value;
  if (operatorHuaji(entry).owned && operatorHuaji(entry).stage == null && value === Number(entry.starLevel)) return -1;
  return value > 0 ? Math.floor((value - 1) / 6) + 1 : 0;
}

function starDraftNode(entry) {
  const value = cardGrowthValue(entry, "star");
  return value > 0 && value < 25 ? (value - 1) % 6 : 0;
}

function setStarDraftGroup(entry, event) {
  const value = event && event.target ? event.target.value : 0;
  const draft = ensureCardDraft(entry);
  if (value === 'awakening') {
    if (!operatorAwakeningSupported(entry)) return;
    setGrowthDraft(entry, "star", entry.spOf ? 5 : 25, false);
    draft.awakened = true;
    return;
  }
  const group = Number(value);
  if (!Number.isInteger(group) || group < 0 || group > 5 || (!entry.spOf && group === 5 && operatorHuajiMax(entry) < 25)) return;
  if (group === 0) draft.awakened = null;
  else if (operatorAwakeningSupported(entry)) draft.awakened = false;
  if (entry.spOf) return setGrowthDraft(entry, "star", group, false);
  if (group === 0)
    return setGrowthDraft(entry, "star", group, false);
  setGrowthDraft(
    entry,
    "star",
    group === 5 ? 25 : 6 * (group - 1) + starDraftNode(entry) + 1,
    false,
  );
}

function setStarDraftNode(entry, event) {
  const node = Number(event && event.target ? event.target.value : 0);
  const group = starDraftGroup(entry);
  if (group > 0 && group < 5)
    setGrowthDraft(entry, "star", 6 * (group - 1) + node + 1, false);
}

function quickGrowthRequirementReady(entry, field, step) {
  const draft = cardGrowthDrafts.value[entry.id];
  const level = Number(draft ? draft.level : entry.level) || 0;
  const elite = Number(draft ? draft.elite : entry.elite) || 0;
  const star = Number(draft ? draft.star : entry.starLevel) || 0;
  const stock = cardMaterialStock.value || {};
  let requirement;
  if (field === "level") {
    if (level >= 100) return false;
    requirement = calculateLevelRequirements(
      level,
      Math.min(100, level + step),
      firstSubProf(sharedGrowthCatalog(entry)),
      cardLevelBreakthrough(entry),
      operatorLevelBreakthroughStage(draft || entry),
    );
  } else if (field === "elite") {
    const maxElite = getMaxEliteForLevel(level);
    if (elite >= maxElite) return false;
    requirement = calculateXiuweiRequirements(
      elite,
      Math.min(maxElite, elite + step),
      xiuweiJob(sharedGrowthCatalog(entry).prof),
    );
  } else {
    const huaji = operatorHuaji(entry);
    if (isQuickAwakening(entry)) requirement = calculateAwakeningRequirements();
    else {
      if (entry.spOf || huaji.stage == null || star >= operatorHuajiMax(entry)) return false;
      requirement = calculateStarRequirements(star, Math.min(operatorHuajiMax(entry), star + step));
    }
  }
  const itemsReady = Object.keys(requirement.items || {}).every(function (id) {
    return (Number(stock[id]) || 0) >= (Number(requirement.items[id]) || 0);
  });
  if (!itemsReady) return false;
  if (
    (Number(requirement.experience) || 0) > (Number(stock.__experience__) || 0)
  )
    return false;
  if (
    (Number(requirement.heart) || 0) >
    (Number(cardHeartStock.value[entry.id]) || 0)
  )
    return false;
  return true;
}

function quickGrowthActionAvailable(entry, field, step) {
  if (!entry || !entry.id || cardSubmitStates.value[entry.id] === "submitting")
    return false;
  const draft = cardGrowthDrafts.value[entry.id];
  const baseline = cardDraftBaselines.value[entry.id];
  if (draft && baseline && baseline !== cardDraftSnapshot(entry)) return false;
  return quickGrowthRequirementReady(entry, field, step);
}

function growthActionClass(entry, field, step) {
  if (field === "star" && entry.spOf) return "is-ready";
  const materials = growthMaterials(entry, field, step);
  return materials.some(function (item) {
    return item.lack > 0;
  })
    ? "is-lack"
    : "is-ready";
}

function growthMaterialsReady(entry, field, step) {
  return !growthMaterials(entry, field, step).some(function (item) {
    return item.lack > 0;
  });
}

function growthActionLabel(entry, field, step, readyLabel) {
  if (field === "star" && entry.spOf) return readyLabel;
  const materials = growthMaterials(entry, field, step);
  if (
    !materials.some(function (item) {
      return item.lack > 0;
    })
  )
    return readyLabel;
  if (field === "level") return "查看经验缺口";
  if (field === "star") {
    const shortage = materials.find(function (item) {
      return item.lack > 0;
    });
    if (shortage) return shortage.owned + "/" + shortage.required;
  }
  return "查看材料缺口";
}

function cardAwakeningHeartLabel(entry) {
  const ready = accountId.value && !cardMaterialLoading.value &&
    cardMaterialLoadedAccount.value === accountId.value;
  return (ready ? Number(cardHeartStock.value[entry.id]) || 0 : "—") + "/100";
}

function plannerQuickUpgradeState(row, field, step, readyLabel) {
  const entry = row && currentMap.value[row.id];
  if (!entry || !auth.isLoggedIn || !accountId.value || (field === "star" && entry.spOf)) {
    return { visible: false, disabled: true };
  }
  if (field === 'star' && operatorHuajiAction(entry).kind !== 'upgrade' && !isQuickAwakening(entry)) {
    const action = operatorHuajiAction(entry);
    return { visible: true, disabled: action.disabled || cardSubmitStates.value[entry.id] === 'submitting',
      className: action.disabled ? 'is-complete' : 'is-ready', icon: action.disabled ? 'check' : 'up', label: action.label, title: action.label };
  }
  const currentValue = Number(cardGrowthValue(entry, field)) || 0;
  const max =
    field === "level"
      ? OPERATOR_LEVEL_MAX
      : field === "elite"
        ? getMaxEliteForLevel(cardGrowthValue(entry, "level"))
        : operatorHuajiMax(entry);
  const complete = currentValue >= max && !(field === "star" && isQuickAwakening(entry));
  const fieldLabel = field === "level" ? "等级" : field === "elite" ? "修为" : "化极";
  const label = complete
    ? "已满级"
    : growthActionLabel(entry, field, step, field === "star" && isQuickAwakening(entry) ? "觉醒" : readyLabel);
  return {
    visible: true,
    disabled: cardSubmitStates.value[entry.id] === "submitting" || complete,
    className: complete ? "is-complete" : growthActionClass(entry, field, step),
    icon: complete ? "check" : growthMaterialsReady(entry, field, step) ? "up" : "alert",
    label: label,
    title: complete
      ? fieldLabel + "已满级"
      : "在养成规划中查看" + fieldLabel + "快捷提升",
  };
}

function plannerGrowthActionNotice(entry) {
  return entry && entry.id ? quickNotices.value[entry.id] || "" : "";
}

function growthTargetLabel(entry, field) {
  if (field === "star" && isQuickAwakening(entry)) return "觉醒";
  const target = growthTarget(entry, field);
  if (field === "level") return "等级 " + target;
  if (field === "elite") return "修为 " + target;
  return "化极 " + starLabel(target, entry.spOf);
}

function growthPopoverTitle(entry, field) {
  const target = growthTargetLabel(entry, field);
  return growthMaterialsReady(entry, field)
    ? target + " 将扣除以下道具"
    : target + " 还缺以下道具";
}

function levelBookDeductions(required, stock) {
  let remaining = Math.max(0, Number(required) || 0);
  const books = [
    { id: "liutaobingshu", value: BOOK_VALUES.liutaobingshu },
    { id: "bingshuquanjuan", value: BOOK_VALUES.bingshuquanjuan },
    { id: "bingshucanjuan", value: BOOK_VALUES.bingshucanjuan },
  ].map(function (book) {
    return Object.assign({}, book, {
      available: Number(stock[book.id]) || 0,
      count: 0,
    });
  });
  books.forEach(function (book) {
    const count = Math.min(book.available, Math.floor(remaining / book.value));
    book.count += count;
    remaining -= count * book.value;
  });
  if (remaining > 0) {
    books
      .slice()
      .reverse()
      .forEach(function (book) {
        if (remaining <= 0) return;
        const available = book.available - book.count;
        const count = Math.min(available, Math.ceil(remaining / book.value));
        book.count += count;
        remaining -= count * book.value;
      });
  }
  return books
    .filter(function (book) {
      return book.count > 0;
    })
    .map(function (book) {
      return {
        id: book.id,
        name: itemNameById(book.id),
        required: book.count,
        owned: book.available,
        lack: 0,
      };
    });
}


function growthMaterials(entry, field, step) {
  if (field === "star" && entry.spOf) return [];
  const draft = ensureCardDraft(entry);
  if (!draft) return [];
  const stock = cardMaterialStock.value || {};
  let requirement;
  if (field === "level")
    requirement = calculateLevelRequirements(
      draft.level,
      growthTarget(entry, "level", step),
      firstSubProf(sharedGrowthCatalog(entry)),
      cardLevelBreakthrough(entry),
      operatorLevelBreakthroughStage(draft || entry),
    );
  else if (field === "elite")
    requirement = calculateXiuweiRequirements(
      draft.elite,
      growthTarget(entry, "elite", step),
      xiuweiJob(sharedGrowthCatalog(entry).prof),
    );
  else if (isQuickAwakening(entry))
    requirement = calculateAwakeningRequirements();
  else
    requirement = calculateStarRequirements(
      draft.star,
      growthTarget(entry, "star", step),
    );
  const items = Object.keys(requirement.items || {})
    .map(function (id) {
      const required = Number(requirement.items[id]) || 0;
      const owned = Number(stock[id]) || 0;
      return {
        id: id,
        name: itemNameById(id),
        required: required,
        owned: owned,
        lack: Math.max(required - owned, 0),
      };
    })
    .filter(function (item) {
      return item.required > 0;
    });
  if (requirement.experience) {
    const experienceOwned = Number(stock.__experience__) || 0;
    if (experienceOwned >= requirement.experience)
      items.push.apply(
        items,
        levelBookDeductions(requirement.experience, stock),
      );
    else
      items.push.apply(
        items,
        levelBookGapBundle(requirement.experience - experienceOwned),
      );
  }
  if (requirement.heart) {
    const owned = Number(cardHeartStock.value[entry.id]) || 0;
    items.push({
      id: "__heart__",
      name: "心纸",
      required: requirement.heart,
      owned: owned,
      lack: Math.max(requirement.heart - owned, 0),
    });
  }
  return items;
}

function itemNameById(id) {
  const item = ITEM_CATALOG.find(function (entry) {
    return entry.id === id;
  });
  return item ? item.name : id;
}

function cancelCardDraft(entry) {
  const draft = ensureCardDraft(entry);
  let baseline = null;
  try {
    baseline = JSON.parse(cardDraftBaselines.value[entry.id] || "null");
  } catch (_) {
    baseline = null;
  }
  baseline = baseline || {};
  draft.level =
    baseline.level == null
      ? Number(entry.level) || 0
      : Number(baseline.level) || 0;
  draft.levelBreakthroughStage = operatorLevelBreakthroughStage({ ...baseline, level: draft.level });
  draft.elite =
    baseline.elite == null
      ? Number(entry.elite) || 0
      : Number(baseline.elite) || 0;
  draft.star =
    baseline.star == null
      ? Number(entry.starLevel) || 0
      : Number(baseline.star) || 0;
  draft.awakened = baseline.awakened === undefined ? operatorHuaji(entry).awakened : baseline.awakened;
  draft.discLoadouts = Array.isArray(baseline.discLoadouts)
    ? JSON.parse(JSON.stringify(baseline.discLoadouts))
    : normalizeCardDiscLoadouts(entry);
  draft.starStones = Array.isArray(baseline.starStones)
    ? JSON.parse(JSON.stringify(baseline.starStones))
    : normalizeCardStarStones(entry);
  draft.remark =
    baseline.remark == null
      ? entry.remark || entry.note || ""
      : baseline.remark;
  draft.modes = Object.assign(
    {},
    baseline.modes ||
      (entry.combatStats && entry.combatStats.displayMode) ||
      {},
  );
  workbenchRemarks.value = Object.assign({}, workbenchRemarks.value, {
    [entry.id]: draft.remark,
  });
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, {
    [entry.id]: Object.assign({}, draft.modes),
  });
  const stats = entry.combatStats || normalizeOperatorCombatStats({});
  cardCombatDrafts.value = Object.assign({}, cardCombatDrafts.value, {
    [entry.id]: {
      attack: Object.prototype.hasOwnProperty.call(baseline, "attack")
        ? baseline.attack
        : stats.manualAttack,
      hp: Object.prototype.hasOwnProperty.call(baseline, "hp")
        ? baseline.hp
        : stats.manualHp,
      oddityAttack:
        baseline.oddityAttack == null
          ? stats.oddities.attack.current
          : baseline.oddityAttack,
      oddityHp:
        baseline.oddityHp == null
          ? stats.oddities.hp.current
          : baseline.oddityHp,
    },
  });
  const editedKeys = new Set(cardCombatEditedKeys.value);
  editedKeys.delete(entry.id + ":attack");
  editedKeys.delete(entry.id + ":hp");
  cardCombatEditedKeys.value = editedKeys;
  cardPopoverKey.value = "";
  if (draft.revision !== (Number(entry.revision) || 0))
    mergePatchedCurrentEntry(entry, entry);
  clearCardSubmitState(entry);
}

function clearCardSubmitState(entry) {
  delete cardSubmitStates.value[entry.id];
  cardSubmitStates.value = Object.assign({}, cardSubmitStates.value);
}

function handleCardPopoverOutside(event) {
  const target = event && event.target;
  if (!(target && target.closest && target.closest(".ledger-status-menu"))) {
    document
      .querySelectorAll(".ledger-status-menu[open]")
      .forEach(function (menu) {
        menu.open = false;
      });
  }
  if (!cardPopoverKey.value) return;
  if (
    target &&
    target.closest &&
    (target.closest(".ledger-popover") ||
      target.closest(".ledger-popover-trigger") ||
      target.closest(".ledger-status-menu"))
  )
    return;
  cardPopoverKey.value = "";
}

function showQuickNotice(id, message, duration) {
  quickNotices.value = Object.assign({}, quickNotices.value, { [id]: message });
  if (!duration) return;
  window.setTimeout(function () {
    if (quickNotices.value[id] !== message) return;
    const next = Object.assign({}, quickNotices.value);
    delete next[id];
    quickNotices.value = next;
  }, duration);
}

async function setOperatorStatus(entry, value, { batch = false } = {}) {
  if (!editableStatusOptions.some(option => option.value === value)) return false;
  if (!entry || !entry.id || !isOperatorOwned(entry) || annotationBusyIds.value.has(entry.id))
    return false;
  const targetAccount = accountId.value;
  const scopeSeq = annotationScopeSeq;
  const previous = operatorStatus(entry);
  try {
    const saved = await saveOperatorAnnotation(entry, {
      growth_state: operatorAnnotationApiState(value),
    });
    if (accountId.value !== targetAccount || annotationScopeSeq !== scopeSeq || saved == null)
      return false;
    const message = value === "discarded"
      ? "已移至已弃置，练度保留，可随时恢复"
      : previous === "discarded" ? "已恢复为" + statusLabel(value) : "已设为" + statusLabel(value);
    if (!batch) {
      annotationNotice.value = (entry.name || entry.id) + "：" + message;
      annotationNoticeTarget.value = value === "discarded" ? "discarded" : value;
    }
    showQuickNotice(entry.id, message, 1800);
    return true;
  } catch (err) {
    if (accountId.value !== targetAccount || annotationScopeSeq !== scopeSeq) return false;
    showQuickNotice(entry.id, humanErr(err, "养成状态保存失败"));
    return false;
  }
}

function setOperatorStatusAndClose(entry, value, event) {
  setOperatorStatus(entry, value);
  const details =
    event && event.currentTarget && event.currentTarget.closest
      ? event.currentTarget.closest("details")
      : null;
  if (details) details.open = false;
}

function toggleBatchSelectMode() {
  batchSelectMode.value = !batchSelectMode.value;
  if (!batchSelectMode.value) {
    batchSelectionBase.value = new Set();
  }
}

function toggleBatchSelected(id, event) {
  const next = new Set(batchSelectionBase.value);
  const checked = event && event.target ? event.target.checked : false;
  if (checked) next.add(id);
  else next.delete(id);
  batchSelectionBase.value = next;
}

function batchToggleAll(event) {
  const checked = event && event.target ? event.target.checked : false;
  batchSelectionBase.value = new Set(
    checked
      ? filteredCurrent.value.map(function (entry) {
          return entry.id;
        })
      : [],
  );
}

function clearBatchSelected() {
  batchSelectionBase.value = new Set();
}

async function batchSetStatus(value) {
  if (batchStatusBusy.value || annotationBusyIds.value.size > 0) return;
  // Freeze the selected entries before successful saves move cards out of this group.
  const entries = filteredCurrent.value.filter(entry => batchSelectedIds.value.has(entry.id));
  const targetAccount = accountId.value;
  const scopeSeq = annotationScopeSeq;
  if (!entries.length || !auth.isLoggedIn || !targetAccount) return;
  batchStatusBusy.value = true;
  annotationNotice.value = "";
  const results = await Promise.all(entries.map(entry => setOperatorStatus(entry, value, { batch: true })));
  if (accountId.value !== targetAccount || annotationScopeSeq !== scopeSeq) return;
  batchStatusBusy.value = false;
  const failedIds = entries.filter((entry, index) => !results[index]).map(entry => entry.id);
  const succeededCount = entries.length - failedIds.length;
  batchSelectionBase.value = new Set(failedIds);
  annotationNotice.value = "成功 " + succeededCount + " 位，失败 " + failedIds.length + " 位；" +
    (value === "discarded" ? "成功项已移至已弃置，练度保留" : "成功项已设为" + statusLabel(value));
  annotationNoticeTarget.value = succeededCount ? value : "";
  if (failedIds.length) annotationError.value = failedIds.length + " 位养成状态保存失败，请重试（冲突项已同步最新状态）";
}

function viewAnnotationNoticeGroup() {
  resetCurrentFilters();
  setWorkbenchStatusFilter(annotationNoticeTarget.value);
}

function ensureQuickDraft(entry) {
  if (!quickDrafts.value[entry.id]) {
    quickDrafts.value[entry.id] = {
      level: entry.level,
      elite: entry.elite,
      star: entry.starLevel,
    };
  }
  return quickDrafts.value[entry.id];
}

function openQuickEditor(entry, field) {
  quickConfirmKey.value = "";
  const key = entry.id + ":" + field;
  ensureQuickDraft(entry);
  quickEditorKey.value = quickEditorKey.value === key ? "" : key;
}

function openQuickConfirm(entry, field) {
  quickEditorKey.value = "";
  quickConfirmKey.value = entry.id + ":" + field;
}

async function quickCorrect(entry, field, rawValue) {
  const max =
    field === "level"
      ? OPERATOR_LEVEL_MAX
      : field === "elite"
        ? getMaxEliteForLevel(entry.level)
        : entry.spOf
          ? 5
          : operatorHuajiMax(entry);
  const value = Math.max(0, Math.min(max, Math.trunc(Number(rawValue))));
  if (!Number.isFinite(value)) return;
  const patch = {
    expected_revision: Number(entry.revision) || 0,
    reason: "manual_correction",
  };
  patch[field === "star" ? "star_level" : field] = value;
  quickSavingIds.value = new Set([...quickSavingIds.value, entry.id]);
  try {
    const response = await patchOperatorCurrent({
      accountId: accountId.value,
      operatorId: entry.id,
      game: saveGame.value,
      patch,
    });
    if (!applyPatchedCurrentEntry(entry.id, response)) {
      await reloadCurrent(true);
    }
    quickNotices.value = Object.assign({}, quickNotices.value, {
      [entry.id]: "已保存",
    });
    quickEditorKey.value = "";
    quickConfirmKey.value = "";
    await nextTick();
    restoreCurrentLedgerCardPosition(entry.id);
    window.setTimeout(function () {
      const next = Object.assign({}, quickNotices.value);
      delete next[entry.id];
      quickNotices.value = next;
    }, 1800);
  } catch (err) {
    quickNotices.value = Object.assign({}, quickNotices.value, {
      [entry.id]: humanErr(err, "保存失败"),
    });
  } finally {
    const next = new Set(quickSavingIds.value);
    next.delete(entry.id);
    quickSavingIds.value = next;
  }
}

function cardLoadoutDiscs(entry, index) {
  const draft = ensureCardDraft(entry);
  const loadout = draft && draft.discLoadouts && draft.discLoadouts[index];
  return loadout && Array.isArray(loadout.discNames)
    ? loadout.discNames.slice(0, 3)
    : [];
}

function cardLoadoutNeedsPlaceholder(entry, index) {
  const count = cardLoadoutDiscs(entry, index).length;
  return ledgerCardIsV2 ? count < 3 : count === 0;
}

function cardStoneSlots(entry) {
  return stoneSlots.value.map(function (slot) {
    return starLoadoutSlotEntry(entry && entry.id, slot.type.replace("assist", "support"));
  });
}

function starSnapshotEntries(snapshot) {
  const rows = Array.isArray(snapshot) ? snapshot : snapshot ? [snapshot] : [];
  return rows.flatMap(function (row) {
    if (Array.isArray(row && row.entries)) return row.entries;
    if (row && row.entries && typeof row.entries === "object") return Object.values(row.entries);
    if (Array.isArray(row && row.inventory)) return row.inventory;
    return [];
  });
}

function acceptStarBreakthroughState(state) {
  if (state.account_id !== accountId.value) return;
  starStateSnapshot.value = state;
  starInventoryEntries.value = starSnapshotEntries(state);
}

function normalizeCloudLoadouts(snapshot) {
  const row = Array.isArray(snapshot) ? snapshot[0] : snapshot || {};
  const source = (row && (row.loadouts || row.entries)) || {};
  return Object.fromEntries(Object.entries(source).map(function ([id, loadout]) {
    return [id, normalizeLoadout(loadout)];
  }));
}

function validStarLoadoutDrafts(loadouts, inventory) {
  const byId = new Map(inventory.map(function (entry) { return [entry.instance_id || entry.instanceId || entry.id, entry]; }));
  const occupied = new Set();
  return Object.fromEntries(Object.entries(loadouts).map(function ([operatorId, slots]) {
    return [operatorId, Object.fromEntries(Object.entries(normalizeLoadout(slots)).map(function ([slot, id]) {
      const entry = byId.get(id);
      const kind = slot.startsWith('main') ? 'main' : 'support';
      if (!id || !entry || occupied.has(id) || ![kind, kind === 'main' ? '主星' : '辅星'].includes(entry.kind)) return [slot, null];
      occupied.add(id);
      return [slot, id];
    }))];
  }));
}

async function readStarLoadoutPair(targetAccount) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [state, loadout] = await Promise.all([
      getCurrentStarState(targetAccount), getCurrentStarLoadout(targetAccount),
    ]);
    if (Number(state?.generation || 0) === Number(loadout?.generation || 0)) return [state, loadout];
  }
  throw new Error("星石状态已更新，请重新打开装配。");
}

function starPresetUserScope() {
  const user = auth.userInfo || {};
  return String(user.id || user.user_id || user.email || (auth.isLoggedIn ? "authenticated-user" : ""));
}

async function loadStarLoadoutPresets() {
  if (!auth.isLoggedIn) {
    starLoadoutPresetStore.clear();
    return;
  }
  try {
    await starLoadoutPresetStore.load(starPresetUserScope());
  } catch (_) {
    // Preset errors remain visible in the manager without blocking the operator page.
  }
}

function starLoadoutSlotEntry(operatorId, slot) {
  const instanceId = starLoadoutCurrent.value[operatorId] && starLoadoutCurrent.value[operatorId][slot];
  if (!instanceId) return null;
  return starInventoryEntries.value.find(function (entry) {
    const kind = slot.startsWith('main') ? 'main' : 'support';
    return (entry.instance_id || entry.instanceId || entry.id) === instanceId &&
      [kind, kind === 'main' ? '主星' : '辅星'].includes(entry.kind);
  }) || null;
}

async function openStarLoadout(operator, slot) {
  if (!operator || !auth.isLoggedIn || !accountId.value) return;
  const targetAccount = accountId.value;
  if (await prepareStarLoadout(operator, slot) && accountId.value === targetAccount) starLoadoutOpen.value = true;
}

async function prepareStarLoadout(operator, slot) {
  if (!operator || !auth.isLoggedIn || !accountId.value) return false;
  const targetAccount = accountId.value;
  const seq = ++starLoadoutLoadSeq;
  starLoadoutLoading.value = true;
  starLoadoutError.value = "";
  try {
    const [inventory, loadout] = await readStarLoadoutPair(targetAccount);
    if (operatorPageDisposed || seq !== starLoadoutLoadSeq || accountId.value !== targetAccount)
      return false;
    starInventoryEntries.value = starSnapshotEntries(inventory);
    starStateSnapshot.value = inventory;
    starLoadoutCurrent.value = normalizeCloudLoadouts(loadout);
    starLoadoutDrafts.value = validStarLoadoutDrafts(starLoadoutCurrent.value, starInventoryEntries.value);
    starStateGeneration.value = Number(inventory?.generation || 0);
    if (starLoadoutSnapshotSignature(starLoadoutDrafts.value) !== starLoadoutSnapshotSignature(starLoadoutCurrent.value)) {
      starLoadoutError.value = "旧佩戴中有已失效的星石，保存时会清除这些槽位。";
    }
    if (!starLoadoutDrafts.value[operator.id]) starLoadoutDrafts.value[operator.id] = emptyLoadout();
    starLoadoutRevision.value = Number((Array.isArray(loadout) ? loadout[0] : loadout)?.revision || 0);
    starLoadoutTarget.value = operator;
    starLoadoutActiveSlot.value = slot;
    starLoadoutInlineSlot.value = slot;
    starLoadoutAccountId.value = targetAccount;
    return true;
  } catch (err) {
    if (operatorPageDisposed || seq !== starLoadoutLoadSeq || accountId.value !== targetAccount)
      return false;
    starLoadoutError.value = humanErr(err, "无法加载当前星石数据");
    return false;
  } finally {
    if (seq === starLoadoutLoadSeq) starLoadoutLoading.value = false;
  }
}

async function loadStarLoadoutSnapshot(targetAccount) {
  if (!targetAccount) return;
  const seq = ++starLoadoutLoadSeq;
  try {
    const [inventory, loadout] = await readStarLoadoutPair(targetAccount);
    if (operatorPageDisposed || seq !== starLoadoutLoadSeq || accountId.value !== targetAccount) return;
    const generation = Number(inventory?.generation || 0);
    if (starLoadoutOpen.value && starStateGeneration.value !== generation) {
      starLoadoutSaveSeq += 1;
      starLoadoutSaving.value = false;
      starLoadoutOpen.value = false;
      starLoadoutAccountId.value = "";
      starLoadoutTarget.value = null;
      starLoadoutError.value = "星石背包已重建，请重新打开装配。";
    }
    const keepCurrentDraft = starLoadoutOpen.value && starStateGeneration.value === generation;
    const nextRevision = Number((Array.isArray(loadout) ? loadout[0] : loadout)?.revision || 0);
    starInventoryEntries.value = starSnapshotEntries(inventory);
    starStateSnapshot.value = inventory;
    starLoadoutCurrent.value = normalizeCloudLoadouts(loadout);
    starLoadoutDrafts.value = validStarLoadoutDrafts(keepCurrentDraft ? starLoadoutDrafts.value : starLoadoutCurrent.value, starInventoryEntries.value);
    starStateGeneration.value = generation;
    if (!keepCurrentDraft || nextRevision === starLoadoutRevision.value) starLoadoutRevision.value = nextRevision;
  } catch (_) {
    // The operator ledger remains usable if the independent star snapshot is unavailable.
  } finally {
    if (seq === starLoadoutLoadSeq) starLoadoutLoading.value = false;
  }
}

function closeStarLoadout() {
  starLoadoutOpen.value = false;
  starLoadoutError.value = "";
}

function starLoadoutSnapshotSignature(loadouts) {
  return JSON.stringify(
    Object.keys(loadouts || {})
      .sort()
      .map(function (operatorId) {
        return [operatorId, normalizeLoadout(loadouts[operatorId])];
      })
      .filter(function (entry) {
        return Object.values(entry[1]).some(Boolean);
      }),
  );
}

function starLoadoutIsDirty() {
  return starLoadoutSnapshotSignature(starLoadoutDrafts.value) !== starLoadoutSnapshotSignature(starLoadoutCurrent.value);
}

async function persistStarLoadout() {
  const targetAccount = starLoadoutAccountId.value;
  if (!targetAccount || accountId.value !== targetAccount) {
    starLoadoutError.value = "账号已切换，请关闭编辑器后重新打开。";
    return false;
  }
  if (!starLoadoutIsDirty()) return true;
  const targetGeneration = starStateGeneration.value;
  const targetRevision = starLoadoutRevision.value;
  const saveSeq = ++starLoadoutSaveSeq;
  starLoadoutSaving.value = true;
  starLoadoutError.value = "";
  try {
    const response = await putCurrentStarLoadout(targetAccount, {
      expected_revision: targetRevision,
      expected_generation: targetGeneration,
      loadouts: validStarLoadoutDrafts(starLoadoutDrafts.value, starInventoryEntries.value),
    });
    if (saveSeq !== starLoadoutSaveSeq || accountId.value !== targetAccount ||
      starLoadoutAccountId.value !== targetAccount || starStateGeneration.value !== targetGeneration ||
      starLoadoutRevision.value !== targetRevision) return false;
    starLoadoutLoadSeq += 1;
    starLoadoutLoading.value = false;
    starLoadoutCurrent.value = normalizeCloudLoadouts(response);
    starLoadoutRevision.value = Number(response && response.revision || starLoadoutRevision.value + 1);
    return true;
  } catch (err) {
    if (saveSeq === starLoadoutSaveSeq && accountId.value === targetAccount &&
      starLoadoutAccountId.value === targetAccount && starStateGeneration.value === targetGeneration &&
      starLoadoutRevision.value === targetRevision) {
      if (err?.code === "star_generation_changed") {
        starLoadoutLoadSeq += 1;
        starLoadoutAccountId.value = "";
        starLoadoutOpen.value = false;
        starLoadoutTarget.value = null;
        starInventoryEntries.value = [];
        starLoadoutCurrent.value = {};
        starLoadoutDrafts.value = {};
        starLoadoutRevision.value = 0;
        starStateGeneration.value = 0;
        starLoadoutError.value = "星石背包已重建，旧装配草稿已失效；请重新打开装配。";
        void loadStarLoadoutSnapshot(targetAccount);
      } else {
        starLoadoutError.value = humanErr(err, "保存星石装配失败");
      }
    }
    return false;
  } finally {
    if (saveSeq === starLoadoutSaveSeq) starLoadoutSaving.value = false;
  }
}

async function requestCloseStarLoadout() {
  if (starLoadoutSaving.value) return;
  if (await persistStarLoadout()) closeStarLoadout();
}

function cardDiscOptions(entry) {
  const catalog = catalogMap.value[entry && entry.id];
  return sortDiscsForPicker(catalog && catalog.discs);
}

function cardDiscCatalogItem(entry, name) {
  return cardDiscOptions(entry).find(function (item) {
    return discKey(item) === name;
  });
}

function cardDiscAbbreviation(entry, name) {
  const disc = cardDiscCatalogItem(entry, name);
  const abbreviation =
    disc && typeof disc.abbreviation === "string"
      ? disc.abbreviation.trim()
      : "";
  return abbreviation || name;
}

const DISC_RARITY_CLASS = Object.freeze({
  金: "rarity-gold",
  紫: "rarity-purple",
  蓝: "rarity-blue",
  gold: "rarity-gold",
  purple: "rarity-purple",
  blue: "rarity-blue",
});

function cardDiscRarityClass(entry, name) {
  const disc = cardDiscCatalogItem(entry, name);
  return (disc && DISC_RARITY_CLASS[disc.color]) || "";
}

function cardDiscDescription(entry, name) {
  const disc = cardDiscCatalogItem(entry, name);
  return discDescription(disc);
}

function cardDiscSelected(entry, loadoutIndex, disc) {
  const draft = ensureCardDraft(entry);
  const loadout =
    draft && draft.discLoadouts && draft.discLoadouts[loadoutIndex];
  return !!loadout && loadout.discNames.indexOf(discKey(disc)) !== -1;
}

function toggleCardDisc(entry, loadoutIndex, disc, event) {
  const draft = ensureCardDraft(entry);
  const loadout =
    draft && draft.discLoadouts && draft.discLoadouts[loadoutIndex];
  const key = discKey(disc);
  if (!loadout || !key) return;
  const selectedIndex = loadout.discNames.indexOf(key);
  if (selectedIndex !== -1) {
    loadout.discNames.splice(selectedIndex, 1);
  } else if (loadout.discNames.length < 3) {
    loadout.discNames.push(key);
  } else {
    if (event && event.target) event.target.checked = false;
    quickNotices.value = Object.assign({}, quickNotices.value, {
      [entry.id]: "每套命盘最多选择 3 个",
    });
  }
}

function operatorRemark(entry) {
  if (Object.prototype.hasOwnProperty.call(workbenchRemarks.value, entry.id))
    return workbenchRemarks.value[entry.id];
  return entry.remark || entry.note || "";
}

function trackerRemarkEntry(row) {
  return currentEntries.value.find(entry => entry.id === row.id) || row;
}

function setOperatorRemarkDraft(entry, value) {
  entry = currentMap.value[entry?.id];
  if (!entry) return;
  const draft = ensureCardDraft(entry);
  workbenchRemarks.value = Object.assign({}, workbenchRemarks.value, {
    [entry.id]: value,
  });
  if (draft) draft.remark = value;
}

function saveOperatorRemark(entry) {
  const draft = ensureCardDraft(entry);
  if (draft) draft.remark = operatorRemark(entry);
}

function inventoryPanelStones(operatorId, loadouts) {
  if (!Object.hasOwn(loadouts, operatorId)) return null;
  const byId = new Map(starInventoryEntries.value.map(star => [star.instance_id || star.instanceId, star]));
  return Object.fromEntries(Object.entries(loadouts[operatorId] || {}).filter(([, id]) => id && byId.has(id)).map(([slot, id]) => {
    const star = byId.get(id);
    return [slot, { name: star.name, level: star.level, quality: star.quality, breakthroughStage: star.breakthrough_stage ?? null }];
  }));
}

function cardCombatStones(entry) {
  const equipped = inventoryPanelStones(entry.id, starLoadoutCurrent.value);
  if (equipped) return equipped;
  const draft = ensureCardDraft(entry);
  const stones =
    draft && Array.isArray(draft.starStones)
      ? draft.starStones
      : Array.isArray(entry.starStones)
        ? entry.starStones
        : [];
  return stones.reduce(function (result, stone, index) {
    const type = stone && stone.type ? stone.type : "stone" + (index + 1);
    result[type] = {
      name: stone.name || "",
      level: Number(stone.level) || 0,
      rarity: stone.rarity,
    };
    return result;
  }, {});
}

function cardCombatDraft(entry) {
  if (!cardCombatDrafts.value[entry.id]) {
    const stats = entry.combatStats || normalizeOperatorCombatStats({});
    cardCombatDrafts.value = Object.assign({}, cardCombatDrafts.value, {
      [entry.id]: {
        attack: stats.manualAttack,
        hp: stats.manualHp,
        oddityAttack:
          stats.oddities && stats.oddities.attack
            ? stats.oddities.attack.current
            : 0,
        oddityHp:
          stats.oddities && stats.oddities.hp ? stats.oddities.hp.current : 0,
      },
    });
  }
  return cardCombatDrafts.value[entry.id];
}

function cardCombatInput(entry) {
  const draft = cardCombatDraft(entry);
  const growth = ensureCardDraft(entry);
  return {
    operatorName: entry.name,
    spOf: entry.spOf || "",
    level: Number(growth.level) || 0,
    levelBreakthroughStage: operatorLevelBreakthroughStage(growth),
    elite: Number(growth.elite) || 0,
    starLevel: Number(growth.star) || 0,
    huaji: cardHuaji(entry),
    stones: cardCombatStones(entry),
    oddities: {
      attack: { current: draft.oddityAttack },
      hp: { current: draft.oddityHp },
      special: {
        current:
          entry.combatStats &&
          entry.combatStats.oddities &&
          entry.combatStats.oddities.special
            ? entry.combatStats.oddities.special.current
            : 0,
      },
    },
  };
}

function cardCombatResult(entry) {
  const stats = entry.combatStats || normalizeOperatorCombatStats({});
  const draft = cardCombatDraft(entry);
  return calculateOperatorCombatStats({
    stored: Object.assign({}, stats, {
      manualAttack: draft.attack,
      manualHp: draft.hp,
      oddities: Object.assign({}, stats.oddities, {
        attack: { current: draft.oddityAttack },
        hp: { current: draft.oddityHp },
      }),
    }),
    input: cardCombatInput(entry),
    serverResult: cardPanelResult(entry),
    allowAutomatic: panelAutoFillEnabled.value,
    displayMode: cardCombatModes.value[entry.id] || stats.displayMode,
  });
}

function cardCombatAutoAvailable(entry, kind) {
  const result = cardCombatResult(entry);
  return kind === "attack"
    ? result.automaticAttackAvailable
    : result.automaticHpAvailable;
}

function cardCombatModeSwitchAllowed(entry, kind) {
  return cardCombatAutoAvailable(entry, kind);
}

function cardCombatMode(entry, kind) {
  return cardCombatResult(entry)[kind + "Source"] === "calculated" ? "auto" : "manual";
}

function cardCombatAutoVisible(entry, kind) {
  return (
    cardCombatMode(entry, kind) === "auto" &&
    cardCombatAutoAvailable(entry, kind)
  );
}

function cardCombatDisplay(entry, kind) {
  const result = cardCombatResult(entry);
  return kind === "attack" ? result.attackLabel : result.hpLabel;
}

function cardCombatInputValue(entry, kind) {
  if (cardCombatMode(entry, kind) !== "manual") return "";
  const value = cardCombatDraft(entry)[kind];
  return value == null ? "" : value;
}

function cardCombatSimpleValue(entry, kind) {
  if (cardCombatEditedKeys.value.has(entry.id + ":" + kind)) {
    const draftValue = cardCombatDraft(entry)[kind];
    return draftValue == null ? "" : draftValue;
  }
  return cardCombatResult(entry)[kind] ?? "";
}

function cardCombatSource(entry, kind) {
  if (!canUseAutomaticPanel.value) return "手填／采集面板";
  const mode = cardCombatMode(entry, kind);
  const result = cardCombatResult(entry);
  const stale =
    combatObservedStatus(entry) === "stale" ? " · 录入值待核对" : "";
  if (mode === "auto") return "当前使用自动计算，可切回录入值" + stale;
  if (mode === "manual") {
    return cardCombatAutoAvailable(entry, kind)
      ? "可切换为自动计算值" + stale
      : (cardPanelHint(entry) || "自动面板暂无结果") + stale;
  }
  return combatStatsSourceLabel(result.source, result.status);
}

function combatModeLabel(entry, kind) {
  const name = kind === "attack" ? "攻击力" : "生命力";
  if (!canUseAutomaticPanel.value) return name + "使用手填／采集值";
  const mode = cardCombatMode(entry, kind);
  if (!cardCombatAutoAvailable(entry, kind))
    return name + "使用手动校正（暂无自动计算）";
  return mode === "auto" ? "切换为手动校正" + name : "切换为自动计算" + name;
}

function toggleCardCombatMode(entry, kind) {
  const current = cardCombatMode(entry, kind);
  const next = current === "auto" ? "manual" : "auto";
  if (next === "auto" && !cardCombatAutoAvailable(entry, kind)) return;
  setCardCombatMode(entry, kind, next);
}

function setCardCombatMode(entry, kind, mode) {
  const draft = ensureCardDraft(entry);
  mode = mode === "auto" ? "auto" : "manual";
  const next = Object.assign({}, draft?.modes, cardCombatModes.value[entry.id], {
    [kind]: mode,
  });
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, {
    [entry.id]: next,
  });
  if (draft) draft.modes = Object.assign({}, next);
}

function setCardCombatValue(entry, kind, event) {
  const card = ensureCardDraft(entry);
  const draft = cardCombatDraft(entry);
  const raw = event && event.target ? event.target.value : "";
  draft[kind] = raw === "" ? null : Number(raw);
  cardCombatEditedKeys.value = new Set([
    ...cardCombatEditedKeys.value,
    entry.id + ":" + kind,
  ]);
  const next = Object.assign({}, card?.modes, cardCombatModes.value[entry.id], {
    [kind]: raw === "" ? null : "manual",
  });
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, {
    [entry.id]: next,
  });
  if (card) card.modes = Object.assign({}, next);
}

function cardOddityValue(entry, kind) {
  const draft = cardCombatDraft(entry);
  return kind === "attack" ? draft.oddityAttack : draft.oddityHp;
}

function cardOddityMax(entry, kind) {
  const oddity =
    entry.combatStats &&
    entry.combatStats.oddities &&
    entry.combatStats.oddities[kind];
  return oddity && oddity.max != null ? oddity.max : "";
}

function boundedCardOddityCurrent(entry, kind, rawValue) {
  const normalized = boundedOddityValue(rawValue, cardOddityMax(entry, kind));
  return Number.isFinite(Number(normalized.value)) ? Number(normalized.value) : 0;
}

function setCardOddityValue(entry, kind, event) {
  ensureCardDraft(entry);
  const draft = cardCombatDraft(entry);
  const raw = event && event.target ? event.target.value : "";
  const normalized = boundedOddityValue(raw, cardOddityMax(entry, kind));
  const value =
    raw === "" || !Number.isFinite(Number(normalized.value))
      ? 0
      : normalized.value;
  draft[kind === "attack" ? "oddityAttack" : "oddityHp"] = value;
  if (!normalized.adjusted) return;
  if (event && event.target) event.target.value = String(value);
  const label = kind === "attack" ? "攻击力奇闻" : "生命值奇闻";
  showQuickNotice(
    entry.id,
    normalized.reason === "max"
      ? label + "不能超过上限 " + normalized.max + "，已自动调整"
      : label + "不能小于 0，已自动调整",
    2200,
  );
}

function cardPatch(entry) {
  const growth = ensureCardDraft(entry);
  const combat = cardCombatDraft(entry);
  for (const key of ["attack", "hp"]) {
    const value = combat[key === "attack" ? "oddityAttack" : "oddityHp"];
    const error = operatorOddityCurrentError(key, value, cardOddityMax(entry, key));
    if (error) throw new Error((key === "attack" ? "攻击力奇闻" : "生命值奇闻") + error);
  }
  const input = Object.assign({}, cardCombatInput(entry), {
    level: growth.level,
    elite: growth.elite,
    starLevel: growth.star,
  });
  const result = cardCombatResult(
    Object.assign({}, entry, {
      level: growth.level,
      elite: growth.elite,
      starLevel: growth.star,
    }),
  );
  const modes = growth.modes || cardCombatModes.value[entry.id] || {};
  const patch = {
    expected_revision: growth.revision,
    reason: "manual_correction",
    level: Number(growth.level) || 0,
    level_breakthrough_stage: operatorLevelBreakthroughStage(growth),
    elite: Number(growth.elite) || 0,
    star_level: Number(growth.star) || 0,
    disc_loadouts: (growth.discLoadouts || []).map(discLoadoutPayload),
    star_stones: (growth.starStones || [])
      .filter(function (stone) {
        return stone && stone.name;
      })
      .map(function (stone) {
        return {
          name: stone.name,
          type: stone.type,
          level: Number(stone.level) || 0,
        };
      }),
    combat_stats: {
      manual_attack:
        combat.attack == null || combat.attack === ""
          ? null
          : Number(combat.attack),
      manual_hp:
        combat.hp == null || combat.hp === "" ? null : Number(combat.hp),
      display_mode: { attack: modes.attack || null, hp: modes.hp || null },
      oddities: {
        attack: {
          current: boundedCardOddityCurrent(
            entry,
            "attack",
            combat.oddityAttack,
          ),
        },
        hp: {
          current: boundedCardOddityCurrent(entry, "hp", combat.oddityHp),
        },
        special: {
          current: boundedCardOddityCurrent(
            entry,
            "special",
            entry.combatStats &&
              entry.combatStats.oddities &&
              entry.combatStats.oddities.special
              ? entry.combatStats.oddities.special.current
              : 0,
          ),
        },
      },
    },
  };
  const baseline = parsedCardDraftBaseline(entry);
  if ((combat.attack != null || combat.hp != null) && (Number(combat.attack) !== Number(baseline.attack) || Number(combat.hp) !== Number(baseline.hp))) {
    patch.combat_stats.source = "manual";
    patch.combat_stats.combat_input_signature = combatInputSignature(input);
    patch.combat_stats.observed_inputs = {
      level: growth.level,
      level_breakthrough_stage: operatorLevelBreakthroughStage(growth),
      elite: growth.elite,
      star_level: growth.star,
      huaji: input.huaji,
      oddities_signature: patch.combat_stats.combat_input_signature,
      equipped_star_stones_signature: patch.combat_stats.combat_input_signature,
    };
  }
  const beforeHuaji = operatorHuaji(entry);
  const afterHuaji = input.huaji;
  delete patch.star_level;
  if (JSON.stringify(beforeHuaji) !== JSON.stringify(afterHuaji)) {
    patch.huaji = afterHuaji;
    if (!operatorAwakeningSupported(entry) && beforeHuaji.awakened === true && afterHuaji.awakened === true) delete patch.huaji.awakened;
  }
  return patch;
}

async function saveCardDraft(entry) {
  if (
    !accountId.value ||
    cardSubmitStates.value[entry.id] === "submitting" ||
    annotationBusyIds.value.has(entry.id)
  )
    return;
  const targetAccount = accountId.value;
  const targetGame = saveGame.value;
  const contextSeq = currentContextSeq;
  cardPopoverKey.value = "";
  cardSubmitStates.value = Object.assign({}, cardSubmitStates.value, {
    [entry.id]: "submitting",
  });
  try {
    const changes = cardDraftChanges(entry);
    if (changes.objective) {
      const response = await patchOperatorCurrent({
        accountId: targetAccount,
        operatorId: entry.id,
        game: targetGame,
        patch: cardPatch(entry),
      });
      if (contextSeq !== currentContextSeq) return;
      mergePatchedCurrentEntry(entry, response);
      // 客观字段已经成功时先推进其 baseline；若随后备注保存失败，重试只提交备注。
      const objectiveBaseline = parsedCardDraftSnapshot(entry);
      objectiveBaseline.remark =
        changes.baseline.remark == null ? "" : changes.baseline.remark;
      cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, {
        [entry.id]: JSON.stringify(objectiveBaseline),
      });
    }
    const draft = ensureCardDraft(entry);
    if (changes.note && draft) {
      const note =
        String(draft.remark || "").trim() === "" ? null : String(draft.remark);
      await saveOperatorAnnotation(entry, { note: note });
    }
    if (contextSeq !== currentContextSeq) return;
    persistWorkbenchMap("combat-modes", cardCombatModes.value);
    cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, {
      [entry.id]: cardDraftSnapshot(entry),
    });
    cardSubmitStates.value = Object.assign({}, cardSubmitStates.value, {
      [entry.id]: "success",
    });
    const timer = cardSubmitTimers.get(entry.id);
    if (timer) clearTimeout(timer);
    cardSubmitTimers.set(
      entry.id,
      setTimeout(function () {
        clearCardSubmitState(entry);
      }, 1100),
    );
  } catch (err) {
    if (contextSeq !== currentContextSeq) return;
    quickNotices.value = Object.assign({}, quickNotices.value, {
      [entry.id]: humanErr(err, "保存失败"),
    });
    cardSubmitStates.value = Object.assign({}, cardSubmitStates.value, {
      [entry.id]: "error",
    });
  }
}

function mergePatchedCurrentEntry(entry, payload) {
  const raw =
    payload && payload.entry && typeof payload.entry === "object"
      ? payload.entry
      : payload && payload.operator && typeof payload.operator === "object"
        ? payload.operator
        : payload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const catalog = catalogMap.value[entry.id] || {};
  const normalized = Object.assign(
    {
      id: entry.id,
      name: catalog.name || entry.name || "",
      rarity: catalog.rarity || entry.rarity,
      prof: catalog.prof || entry.prof || "",
      subProf: catalog.subProf || entry.subProf || "",
      games: catalog.games || entry.games || [],
      spOf: catalog.spOf || entry.spOf || "",
      huajiCapabilities: catalog.huajiCapabilities || entry.huajiCapabilities,
    },
    normalizeEntry(raw, catalog.odditySchema),
  );
  Object.assign(entry, normalized);
  const stats = normalized.combatStats || normalizeOperatorCombatStats({});
  const growth = ensureCardDraft(entry);
  if (growth) {
    growth.revision = Number(normalized.revision) || 0;
    growth.level = Number(normalized.level) || 0;
    growth.elite = Number(normalized.elite) || 0;
    growth.star = cardStarLevel(normalized);
    growth.awakened = operatorHuaji(normalized).awakened;
    growth.discLoadouts = normalizeCardDiscLoadouts(normalized);
    growth.starStones = normalizeCardStarStones(normalized);
    growth.modes = Object.assign({}, stats.displayMode || {});
  }
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, {
    [entry.id]: Object.assign({}, stats.displayMode || {}),
  });
  cardCombatDrafts.value = Object.assign({}, cardCombatDrafts.value, {
    [entry.id]: {
      attack: stats.manualAttack,
      hp: stats.manualHp,
      oddityAttack:
        stats.oddities && stats.oddities.attack
          ? stats.oddities.attack.current
          : 0,
      oddityHp:
        stats.oddities && stats.oddities.hp ? stats.oddities.hp.current : 0,
    },
  });
  const editedKeys = new Set(cardCombatEditedKeys.value);
  editedKeys.delete(entry.id + ":attack");
  editedKeys.delete(entry.id + ":hp");
  cardCombatEditedKeys.value = editedKeys;
  if (growth)
    cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, {
      [entry.id]: cardDraftSnapshot(entry),
    });
}

function applyPatchedCurrentEntry(operatorId, payload) {
  const entry = currentEntries.value.find(function (item) {
    return item.id === operatorId;
  });
  const raw =
    payload && payload.entry && typeof payload.entry === "object"
      ? payload.entry
      : payload && payload.operator && typeof payload.operator === "object"
        ? payload.operator
        : payload;
  if (
    !entry ||
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.keys(raw).length === 0
  )
    return false;
  mergePatchedCurrentEntry(entry, payload);
  return true;
}

async function saveCardCombat(entry) {
  if (!accountId.value || cardCombatSavingIds.value.has(entry.id)) return;
  const draft = cardCombatDraft(entry);
  const input = cardCombatInput(entry);
  const signature = combatInputSignature(input);
  const modes =
    cardCombatModes.value[entry.id] ||
    (entry.combatStats && entry.combatStats.displayMode) ||
    {};
  const patch = {
    expected_revision: Number(entry.revision) || 0,
    reason: "manual_correction",
    combat_stats: {
      manual_attack:
        draft.attack == null || draft.attack === ""
          ? null
          : Number(draft.attack),
      manual_hp: draft.hp == null || draft.hp === "" ? null : Number(draft.hp),
      display_mode: {
        attack: modes.attack || null,
        hp: modes.hp || null,
      },
      oddities: {
        attack: {
          current: boundedCardOddityCurrent(
            entry,
            "attack",
            draft.oddityAttack,
          ),
        },
        hp: {
          current: boundedCardOddityCurrent(entry, "hp", draft.oddityHp),
        },
        special: {
          current: boundedCardOddityCurrent(
            entry,
            "special",
            entry.combatStats &&
              entry.combatStats.oddities &&
              entry.combatStats.oddities.special
              ? entry.combatStats.oddities.special.current
              : 0,
          ),
        },
      },
    },
  };
  if (draft.attack != null || draft.hp != null) {
    patch.combat_stats.source = "manual";
    patch.combat_stats.combat_input_signature = signature;
    patch.combat_stats.observed_inputs = {
      level: entry.level,
      level_breakthrough_stage: operatorLevelBreakthroughStage(entry),
      elite: entry.elite,
      star_level: entry.starLevel,
      huaji: input.huaji,
      oddities_signature: signature,
      equipped_star_stones_signature: signature,
    };
  }
  cardCombatSavingIds.value = new Set([...cardCombatSavingIds.value, entry.id]);
  try {
    const response = await patchOperatorCurrent({
      accountId: accountId.value,
      operatorId: entry.id,
      game: saveGame.value,
      patch: patch,
    });
    mergePatchedCurrentEntry(entry, response);
    quickNotices.value = Object.assign({}, quickNotices.value, {
      [entry.id]: "已保存",
    });
    window.setTimeout(function () {
      const next = Object.assign({}, quickNotices.value);
      if (next[entry.id] === "已保存") delete next[entry.id];
      quickNotices.value = next;
    }, 1400);
  } catch (err) {
    quickNotices.value = Object.assign({}, quickNotices.value, {
      [entry.id]: humanErr(err, "战斗属性保存失败"),
    });
  } finally {
    const next = new Set(cardCombatSavingIds.value);
    next.delete(entry.id);
    cardCombatSavingIds.value = next;
  }
}

async function openEdit(id) {
  if (!auth.isLoggedIn || !accountId.value) {
    await dialog.alert({ message: "请先登录并选择子账号" });
    return;
  }
  const op = catalogMap.value[id];
  if (!op) return;
  editorTriggerEl =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const existing = currentMap.value[id] || {};
  editingId.value = id;
  editingOp.value = op;
  editorSection.value = 'growth';
  editingDiscTarget.value = false;
  applyEditorEntry(existing, op, id, Object.keys(existing).length > 0);
  editConflictDraft.value = null;
  editNotice.value = "";
  editNoticeError.value = false;
  editOddityErrorKey.value = "";
  if (!(await prepareStarLoadout(op, "main1"))) {
    editingId.value = "";
    editingOp.value = null;
    return;
  }
  editBaseline.value = JSON.stringify([editForm.value, combatDisplayMode.value]);
  editing.value = true;
}

function applyEditorEntry(existing, op, id, allowCache) {
  existing = existing || {};
  const discState = initialDiscLoadoutState(existing);
  const stones = {};
  stoneSlots.value.forEach(function (slot) {
    const hit = (existing.starStones || []).find(function (s) {
      return s.type === slot.type;
    });
    stones[slot.type] = {
      name: (hit && hit.name) || "",
      type: slot.type,
      level: hit && hit.level != null ? hit.level : 0,
      rarity: hit && (hit.rarity != null ? hit.rarity : hit.levelType),
    };
  });
  // 服务端 current 是权威来源；仅在旧后端完全没有 combat_stats 时读取旧缓存。
  const combatStats = existing.combatStatsPresent
    ? normalizeOperatorCombatStats(existing.combatStats, op.odditySchema)
    : allowCache
      ? loadCachedCombatStats(id) ||
        normalizeOperatorCombatStats({}, op.odditySchema)
      : normalizeOperatorCombatStats({}, op.odditySchema);
  ensureOperatorOddities(combatStats, op);
  const huaji = operatorHuaji({ ...op, ...existing });
  editForm.value = {
    owned: operatorHuaji({ ...op, ...existing }).owned,
    awakened: operatorHuaji({ ...op, ...existing }).awakened,
    huaji: operatorHuaji({ ...op, ...existing }),
    elite: existing.elite != null ? existing.elite : 1,
    starLevel: huaji.stage == null ? Number(existing.starLevel) || 0 : op.spOf && huaji.stage > 0 ? (huaji.stage - 1) / 6 + 1 : huaji.stage,
    level: existing.level != null ? existing.level : 1,
    levelBreakthroughStage: operatorLevelBreakthroughStage(existing),
    discLoadouts: discState.loadouts,
    stones: stones,
    combatStats: combatStats,
  };
  const currentSignature = combatInputSignature(combatStatsInput.value);
  const observedInputs = combatStats.observedInputs || {};
  if (
    (combatStats.observedStatus !== "stale" && combatStats.observedStatus !== "unverified" &&
      operatorLevelBreakthroughStage(observedInputs) != null &&
      operatorLevelBreakthroughStage(observedInputs) === operatorLevelBreakthroughStage(editForm.value)) ||
    (combatStats.source === "manual" &&
      operatorLevelBreakthroughStage(observedInputs) != null &&
      operatorLevelBreakthroughStage(observedInputs) === operatorLevelBreakthroughStage(editForm.value) &&
      observedInputs.level != null &&
      Number(observedInputs.level) === Number(editForm.value.level) &&
      observedInputs.elite != null &&
      Number(observedInputs.elite) === Number(editForm.value.elite) &&
      observedInputs.starLevel != null &&
      Number(observedInputs.starLevel) === Number(editForm.value.starLevel))
  ) {
    combatStats.frontendObservedSignature = currentSignature;
  }
  selectedDiscLoadoutIndex.value = discState.activeIndex;
  // 新后端返回的服务器偏好是跨设备权威值；旧后端没有该字段时才读取浏览器备用值。
  combatDisplayMode.value = combatStats.displayModePresent
    ? combatStats.displayMode || { attack: null, hp: null }
    : loadCombatDisplayMode(id);
  editOriginalStoneSignature.value = stoneSignature(stones);
}

function restoreConflictDraft() {
  if (!editConflictDraft.value) return;
  editForm.value = JSON.parse(JSON.stringify(editConflictDraft.value.form));
  combatDisplayMode.value = editConflictDraft.value.displayMode || {
    attack: null,
    hp: null,
  };
  selectedDiscLoadoutIndex.value =
    editConflictDraft.value.selectedDiscLoadoutIndex;
  editOriginalStoneSignature.value =
    editConflictDraft.value.originalStoneSignature;
  editConflictDraft.value = null;
  editNotice.value = "已恢复本次修改，请确认服务器版本后再次保存";
  editNoticeError.value = false;
}

function discardConflictDraft() {
  editConflictDraft.value = null;
  editNotice.value = "已采用服务器最新数据";
  editNoticeError.value = false;
}

async function closeEditor() {
  if (savingEdit.value || !(await confirmEditorDiscard())) return false;
  const trigger = editorTriggerEl;
  editorTriggerEl = null;
  editing.value = false;
  editingId.value = "";
  editingOp.value = null;
  editGame.value = "";
  editNotice.value = "";
  editNoticeError.value = false;
  editConflictDraft.value = null;
  nextTick(function () {
    if (trigger && document.contains(trigger))
      trigger.focus({ preventScroll: true });
  });
  return true;
}

async function saveEdit() {
  if (!editingOp.value || !accountId.value) return;
  editOddityErrorKey.value = "";
  const targetAccount = accountId.value;
  const targetGame = saveGame.value;
  const contextSeq = currentContextSeq;
  editForm.value.discLoadouts.forEach(function (_, index) {
    ensureDiscLoadoutName(index);
  });
  const rawLevel = editForm.value.level;
  const rawElite = editForm.value.elite;
  const rawStarLevel = editForm.value.starLevel;
  const level = Number(rawLevel);
  const elite = Number(rawElite);
  const starLevel = Number(rawStarLevel);
  const validInteger = function (raw, value) {
    return (
      raw !== "" &&
      raw != null &&
      Number.isFinite(value) &&
      Number.isInteger(value)
    );
  };
  if (
    !validInteger(rawLevel, level) ||
    !validInteger(rawElite, elite) ||
    !validInteger(rawStarLevel, starLevel)
  ) {
    editNotice.value = "等级、修为和星级必须填写整数";
    editorSection.value = 'growth';
    editNoticeError.value = true;
    return;
  }
  if (level < 0 || level > OPERATOR_LEVEL_MAX) {
    editNotice.value = "等级需在 0.." + OPERATOR_LEVEL_MAX + " 之间";
    editorSection.value = 'growth';
    editNoticeError.value = true;
    return;
  }
  if (elite < 0 || elite > OPERATOR_ELITE_MAX) {
    editNotice.value = "修为需在 0.." + OPERATOR_ELITE_MAX + " 之间";
    editorSection.value = 'growth';
    editNoticeError.value = true;
    return;
  }
  const oldGrowth = currentMap.value[editingOp.value.id] || {};
  const oldHuaji = operatorHuaji({ ...editingOp.value, ...oldGrowth });
  const stageHuaji = operatorHuajiDraft({ ...editingOp.value, ...oldGrowth }, starLevel);
  const starChanged = stageHuaji.stage !== oldHuaji.stage || stageHuaji.owned !== oldHuaji.owned;
  if (editForm.value.awakened === true && oldHuaji.awakened !== true &&
      (!operatorAwakeningSupported(editingOp.value) || !editorCanConfirmAwakening.value)) {
    editNotice.value = '请先核实五星化极，再确认游戏中已完成觉醒';
    editorSection.value = 'growth';
    editNoticeError.value = true;
    return;
  }
  const starMax = editingOp.value.spOf ? 5 : operatorHuajiMax(editingOp.value);
  if (starChanged && (starLevel < 0 || starLevel > starMax)) {
    editNotice.value = editingOp.value.spOf
      ? "SP 密探星级需在 0..5 之间"
      : "星级需在 0.." + MAX_STAR_LEVEL + " 之间（0=未拥有，觉醒独立确认）";
    editorSection.value = 'growth';
    editNoticeError.value = true;
    return;
  }
  const maxElite = getMaxEliteForLevel(level);
  if (elite > maxElite) {
    editNotice.value = "修为不能超过当前等级上限 " + maxElite;
    editorSection.value = 'growth';
    editNoticeError.value = true;
    return;
  }
  const op = editingOp.value;
  const combatStats = editForm.value.combatStats || {};
  const optionalNonNegativeNumber = function (value) {
    return (
      value === "" ||
      value == null ||
      (Number.isFinite(Number(value)) && Number(value) >= 0)
    );
  };
  for (const key of ODDITY_KEYS) {
    const oddity = (combatStats.oddities && combatStats.oddities[key]) || {};
    const error = operatorOddityCurrentError(key, oddity.current, oddity.max);
    if (error) {
      showEditOddityError(key, error);
      return;
    }
  }
  if (
    !optionalNonNegativeNumber(combatStats.manualAttack) ||
    !optionalNonNegativeNumber(combatStats.manualHp)
  ) {
    editNotice.value =
      "攻击力、生命力和奇闻属性需为非负数，且不能超过公共图鉴给出的上限";
    editNoticeError.value = true;
    return;
  }
  const existing = currentMap.value[op.id] || {};
  const discLoadouts = editForm.value.discLoadouts.map(discLoadoutPayload);
  const normalizedManual = function (value) {
    return value === "" || value == null ? null : Number(value);
  };
  const oddities = combatStats.oddities || {};
  const currentCombatSignature = combatInputSignature(combatStatsInput.value);
  const manualCorrectionAtCurrentInput =
    (combatStats.manualAttack != null || combatStats.manualHp != null) &&
    (combatStats.combatInputSignature === currentCombatSignature ||
      (combatStats.observedInputs &&
        combatStats.observedInputs.signature === currentCombatSignature));
  const patch = {
    level: level,
    level_breakthrough_stage: operatorLevelBreakthroughStage(editForm.value),
    elite: elite,
    star_level: starLevel,
    disc_loadouts: discLoadouts,
    combat_stats: {
      manual_attack: normalizedManual(combatStats.manualAttack),
      manual_hp: normalizedManual(combatStats.manualHp),
      display_mode: {
        attack: combatDisplayMode.value.attack,
        hp: combatDisplayMode.value.hp,
      },
      oddities: ODDITY_KEYS.reduce(function (result, key) {
        const value = oddities[key] || {};
        result[key] = { current: Number(value.current) || 0 };
        return result;
      }, {}),
    },
    expected_revision: Number(existing.revision) || 0,
    reason: "manual_correction",
  };
  if (manualCorrectionAtCurrentInput) {
    patch.combat_stats.source = "manual";
    patch.combat_stats.combat_input_signature = currentCombatSignature;
    patch.combat_stats.observed_inputs = {
      level: level,
      level_breakthrough_stage: operatorLevelBreakthroughStage(editForm.value),
      elite: elite,
      star_level: starLevel,
      huaji: combatStatsInput.value.huaji,
      oddities_signature: currentCombatSignature,
      equipped_star_stones_signature: currentCombatSignature,
    };
  }
  delete patch.star_level;
  const priorHuaji = operatorHuaji({ ...op, ...existing });
  const editedHuaji = { ...stageHuaji };
  if (editForm.value.awakened !== undefined) editedHuaji.awakened = editForm.value.awakened;
  if (editForm.value.owned === false) { editedHuaji.owned = false; editedHuaji.stage = 0; editedHuaji.awakened = null; }
  else if (!editedHuaji.owned && editForm.value.owned === true) { editedHuaji.owned = true; editedHuaji.stage = null; }
  if (!editedHuaji.owned) editedHuaji.awakened = null;
  if (JSON.stringify(editedHuaji) !== JSON.stringify(priorHuaji)) {
    patch.huaji = editedHuaji;
    if (!operatorAwakeningSupported(op) && priorHuaji.awakened === true && editedHuaji.awakened === true) delete patch.huaji.awakened;
  }
  const submittedSignature = JSON.stringify([editForm.value, combatDisplayMode.value]);
  savingEdit.value = true;
  editNotice.value = "";
  editNoticeError.value = false;
  try {
    let response;
    try {
      response = await patchOperatorCurrent({
        accountId: targetAccount,
        operatorId: op.id,
        game: targetGame,
        patch: patch,
      });
    } catch (firstErr) {
      // 旧后端不认识 display_mode 时，重试不带该可选字段；其余错误（尤其 409）继续原样处理。
      const unsupportedDisplayMode =
        firstErr &&
        (firstErr.code === "unsupported_field" ||
          /unsupported field.*display[_ ]?mode/i.test(firstErr.message || ""));
      if (contextSeq !== currentContextSeq) return;
      if (!unsupportedDisplayMode) throw firstErr;
      const legacyPatch = JSON.parse(JSON.stringify(patch));
      if (legacyPatch.combat_stats)
        delete legacyPatch.combat_stats.display_mode;
      response = await patchOperatorCurrent({
        accountId: targetAccount,
        operatorId: op.id,
        game: targetGame,
        patch: legacyPatch,
      });
      editNotice.value = "已保存；当前后端暂不支持跨设备记忆显示偏好";
    }
    if (contextSeq !== currentContextSeq) return;
    persistCombatDisplayMode(op.id);
    if (!applyPatchedCurrentEntry(op.id, response)) {
      // 完整编辑从当前卡片打开；只有卡片在保存期间被外部刷新移除时，
      // 才需要重新拉取整张台账。
      resetCardDraftState(op.id);
      await reloadCurrent(true);
    }
    if (contextSeq !== currentContextSeq) return;
    const starLoadoutSaved = await persistStarLoadout();
    if (contextSeq !== currentContextSeq) return;
    if (!starLoadoutSaved) {
      editNotice.value = starLoadoutError.value || "星石装配保存失败，已保留本次修改";
      editNoticeError.value = true;
      return;
    }
    await nextTick();
    if (contextSeq !== currentContextSeq) return;
    editBaseline.value = submittedSignature;
    editNotice.value = "养成资料已保存";
    setTimeout(async function () {
      if (contextSeq === currentContextSeq && await closeEditor()) restoreCurrentLedgerCardPosition(op.id);
    }, 800);
  } catch (err) {
    if (contextSeq !== currentContextSeq) return;
    if (
      err &&
      (err.status === 409 || err.code === "operator_revision_conflict")
    ) {
      const localDraft = {
        form: JSON.parse(JSON.stringify(editForm.value)),
        selectedDiscLoadoutIndex: selectedDiscLoadoutIndex.value,
        originalStoneSignature: editOriginalStoneSignature.value,
        displayMode: JSON.parse(JSON.stringify(combatDisplayMode.value)),
      };
      await reloadCurrent(true);
      if (contextSeq !== currentContextSeq) return;
      applyEditorEntry(currentMap.value[op.id] || {}, op, op.id, false);
      editConflictDraft.value = localDraft;
      editNotice.value = "";
    } else {
      editNotice.value = humanErr(err, "保存失败");
      const detail = err && err.payload && (err.payload.error || err.payload.data?.error || err.payload.data || err.payload);
      const field = detail && (detail.field_path || detail.fieldPath);
      const key = ODDITY_KEYS.find(function (key) { return field === "combat_stats.oddities." + key + ".current"; });
      if (key) showEditOddityError(key, "：" + editNotice.value);
    }
    editNoticeError.value = true;
  } finally {
    if (contextSeq === currentContextSeq) savingEdit.value = false;
  }
}

async function openGrowthPlanningPreview() {
  if (!growthTrackingEnabled) {
    await dialog.alert({
      title: "养成规划",
      message: "功能准备中，开放时间以站内公告为准。",
    });
    return;
  }
  setTab("tracking");
}

function setTab(t) {
  if (t !== activeTab.value && relationshipWorkspace.value) return leaveRelationshipsThenSetTab(t);
  return activateTab(t);
}

async function leaveRelationshipsThenSetTab(t) {
  const navigationKey = accountId.value + ":" + gameFilter.value;
  if (!(await relationshipWorkspace.value.beforeLeave())) return;
  if (navigationKey !== accountId.value + ":" + gameFilter.value) return;
  return activateTab(t);
}

function activateTab(t) {
  if (t === "tracking" && !growthTrackingEnabled) return;
  if (!visitedTabs.value.has(t))
    visitedTabs.value = new Set(visitedTabs.value).add(t);
  activeTab.value = t;
  const currentKey = accountId.value + ":" + gameFilter.value;
  let currentLoad = Promise.resolve();
  if ((t === "current" || t === "tracking" || t === "relationships") && currentLoadedKey.value !== currentKey)
    currentLoad = reloadCurrent();
  if ((t === "current" || t === "tracking") && cardMaterialLoadedAccount.value !== accountId.value)
    loadCardMaterialStock();
  if (t === "tracking" && favoriteLoadedAccount !== accountId.value)
    loadAgentFavorites();
  return currentLoad;
}

async function openPlannerGrowthAction(row, field, step) {
  const entry = row && currentMap.value[row.id];
  if (!entry) return;
  await openGrowthAction(entry, field, step);
}

// —— 公开目录 ——
async function loadCatalog() {
  const seq = ++catalogLoadSeq;
  catalogLoading.value = true;
  catalogError.value = "";
  try {
    const data = await getOperatorCatalog();
    if (seq !== catalogLoadSeq) return;
    if (!Array.isArray(data?.operators)) throw new Error("公共图鉴响应无效");
    backendCatalog.value =
      data && Array.isArray(data.operators) ? data.operators : [];
    catalogVersion.value = (data && data.catalog_version) || "";
  } catch (err) {
    if (seq !== catalogLoadSeq) return;
    backendCatalog.value = null;
    catalogError.value = humanErr(err, "图鉴加载失败，当前显示本地兜底目录");
  } finally {
    if (seq === catalogLoadSeq) catalogLoading.value = false;
  }
}

// —— 统一子账号（库存 × 密探共用） ——
async function loadAccounts() {
  if (!auth.isLoggedIn) {
    accounts.value = [];
    return;
  }
  accountsLoading.value = true;
  accountError.value = "";
  try {
    const list = await listOperatorAccounts();
    accounts.value = Array.isArray(list) ? list : [];
    activeAccount.syncAccounts(accounts.value);
    if (accounts.value.length < 2) exportAll.value = false;
    // 优先保留 activeAccount 记住的账号；已不存在（被删 / 换人）才回退到第一个
    const still = accounts.value.some(function (a) {
      return a.id === accountId.value;
    });
    if (!still)
      accountId.value = accounts.value.length ? accounts.value[0].id : "";
  } catch (err) {
    accountError.value = humanErr(err, "子账号加载失败");
  } finally {
    accountsLoading.value = false;
  }
}

const accountSwitchBusy = computed(() => relationshipWorkspace.value?.saving || savingEdit.value || importing.value || starLoadoutSaving.value || organizationSaving.value ||
  batchStatusBusy.value || quickSavingIds.value.size > 0 || cardCombatSavingIds.value.size > 0 ||
  growthExecuteBusyKeys.value.size > 0 || annotationBusyIds.value.size > 0 || favoriteBusyIds.value.size > 0);
async function beforeAccountSwitch() {
  if (accountSwitchBusy.value) return false;
  const contextSeq = currentContextSeq;
  if (relationshipWorkspace.value && !(await relationshipWorkspace.value.beforeLeave())) return false;
  if (editorDirty.value && !(await confirmEditorDiscard())) return false;
  if (scanReviewDirty.value && !(await confirmScanReviewDiscard())) return false;
  if (organizationDirty.value && !(await confirmOrganizationDiscard())) return false;
  if (contextSeq !== currentContextSeq || accountSwitchBusy.value) return false;
  const dirtyCards = currentEntries.value.some(entry => cardDraftBaselines.value[entry.id] && cardDraftBaselines.value[entry.id] !== cardDraftSnapshot(entry));
  if (dirtyCards || starLoadoutIsDirty() || (!selectedScanReview.value && importText.value.trim() && !importResult.value)) {
    return dialog.confirm({ title: '放弃当前账号的未保存内容？', message: '切换账号会关闭当前草稿与导入预览。已保存的数据不受影响。', type: 'danger', confirmText: '放弃并切换', cancelText: '继续处理' });
  }
  return true;
}
watch([accountId, gameFilter], () => {
  if (!operatorAccountDataReady || operatorPageDisposed) return;
  void reloadCurrent();
  void loadAgentFavorites();
});

// —— 当前养成 ——
async function reloadCurrent(quiet) {
  if (!auth.isLoggedIn) {
    currentLoadSeq += 1;
    currentLoadedKey.value = "";
    currentEntries.value = [];
    error.value = "";
    loading.value = false;
    return;
  }
  if (!accountId.value) {
    currentLoadSeq += 1;
    currentLoadedKey.value = "";
    currentEntries.value = [];
    error.value = "";
    loading.value = false;
    return;
  }
  const targetAccount = accountId.value;
  const targetGame = gameFilter.value;
  const targetKey = targetAccount + ":" + targetGame;
  const ownerId = auth.userInfo?.id;
  const seq = ++currentLoadSeq;
  if (!quiet || currentLoadedKey.value !== targetKey) loading.value = true;
  if (!quiet) error.value = "";
  try {
    const data = await getOperatorCurrent({
      accountId: targetAccount,
      game: targetGame,
    });
    if (
      seq !== currentLoadSeq ||
      accountId.value !== targetAccount ||
      gameFilter.value !== targetGame
    )
      return;
    const list = Array.isArray(data) ? data : data ? [data] : [];
    const combined = {};
    list.forEach(function (doc) {
      const entriesObj = doc && doc.entries ? doc.entries : {};
      Object.keys(entriesObj).forEach(function (id) {
        combined[id] = entriesObj[id];
      });
    });
    currentEntries.value = Object.keys(combined)
      .map(function (id) {
        const existing = currentMap.value[id];
        if (existing) {
          applyCurrentEntrySnapshot(id, combined[id]);
          return existing;
        }
        return normalizeCurrentEntry(id, combined[id]);
      })
      .filter(function (e) {
        return matchesGame(e, targetGame);
      })
      .sort(function (a, b) {
        return (
          b.level - a.level ||
          (operatorHuaji(b).stage ?? -1) - (operatorHuaji(a).stage ?? -1) ||
          b.elite - a.elite ||
          operatorReleaseOrder(b.id) - operatorReleaseOrder(a.id)
        );
      });
    Object.keys(cardGrowthDrafts.value).forEach(function (id) {
      if (!currentMap.value[id]) resetCardDraftState(id);
    });
    currentLoadedKey.value = targetKey;
    publishOperatorCurrentRead({ ownerId, accountId: targetAccount, game: targetGame, data });
    await loadStarLoadoutSnapshot(targetAccount);
  } catch (err) {
    if (
      seq !== currentLoadSeq ||
      accountId.value !== targetAccount ||
      gameFilter.value !== targetGame
    )
      return;
    currentLoadedKey.value = "";
    if (!quiet) error.value = humanErr(err, "加载失败，请稍后重试");
  } finally {
    if (
      seq === currentLoadSeq &&
      accountId.value === targetAccount &&
      gameFilter.value === targetGame
    )
      loading.value = false;
  }
}

function normalizeCurrentEntry(operatorId, raw) {
  const op = catalogMap.value[operatorId] || {};
  return Object.assign(
    {
      id: operatorId,
      name: op.name || "",
      rarity: op.rarity,
      prof: op.prof || "",
      subProf: op.subProf || "",
      games: op.games || [],
      spOf: op.spOf || "",
      huajiCapabilities: op.huajiCapabilities,
    },
    normalizeEntry(raw, op.odditySchema),
  );
}

function currentEntryRawFromResponse(data, operatorId) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  let raw = null;
  list.forEach(function (doc) {
    const entries = doc && doc.entries;
    if (
      entries &&
      typeof entries === "object" &&
      Object.prototype.hasOwnProperty.call(entries, operatorId)
    ) {
      raw = entries[operatorId];
    }
  });
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}

function applyCurrentEntrySnapshot(operatorId, raw) {
  if (!operatorId || !raw) return false;
  const entry = currentEntries.value.find(function (item) {
    return item.id === operatorId;
  });
  if (!entry) {
    currentEntries.value = currentEntries.value.concat([
      normalizeCurrentEntry(operatorId, raw),
    ]);
    return true;
  }

  // 有未保存的卡片编辑时只更新条目本身，保留用户正在编辑的草稿；
  // 没有草稿则同步卡片派生状态、基线和战斗数值。
  const hasDraft = cardHasDraft(entry);
  if (hasDraft) {
    Object.assign(entry, normalizeCurrentEntry(operatorId, raw));
  } else {
    mergePatchedCurrentEntry(entry, { entry: raw });
  }
  return true;
}

async function reloadCurrentEntry(operatorId, quiet) {
  if (!operatorId || !auth.isLoggedIn || !accountId.value) return false;
  const targetAccount = accountId.value;
  const targetGame = gameFilter.value;
  const seq = ++currentLoadSeq;
  try {
    const data = await getOperatorCurrent({
      accountId: targetAccount,
      game: targetGame,
    });
    if (
      seq !== currentLoadSeq ||
      accountId.value !== targetAccount ||
      gameFilter.value !== targetGame
    )
      return false;
    const raw = currentEntryRawFromResponse(data, operatorId);
    if (!raw) return false;
    return applyCurrentEntrySnapshot(operatorId, raw);
  } catch (err) {
    if (
      !quiet &&
      seq === currentLoadSeq &&
      accountId.value === targetAccount &&
      gameFilter.value === targetGame
    )
      error.value = humanErr(err, "加载失败，请稍后重试");
    return false;
  }
}

function setCurrentLedgerCardElement(operatorId, element) {
  if (!operatorId) return;
  if (element) currentLedgerCardElements.set(operatorId, element);
  else currentLedgerCardElements.delete(operatorId);
}

function restoreCurrentLedgerCardPosition(operatorId) {
  if (!operatorId) return;
  nextTick(function () {
    const element = currentLedgerCardElements.get(operatorId);
    if (!element || !document.contains(element)) return;
    const rect = element.getBoundingClientRect();
    const isVisible = rect.top >= 96 && rect.bottom <= window.innerHeight - 96;
    if (isVisible) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  });
}

function scheduleEventRefresh() {
  if (accountEventRefreshTimer != null) return;
  accountEventRefreshTimer = setTimeout(function () {
    accountEventRefreshTimer = null;
    reloadCurrent(true);
  }, 180);
}

function setOperatorSlotElement(operatorId, element) {
  if (element) operatorSlotElements.set(operatorId, element);
  else operatorSlotElements.delete(operatorId);
}

function scanTargetIsVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.top >= 96 && rect.bottom <= window.innerHeight - 96;
}

function waitForScanScroll(reducedMotion) {
  return new Promise(function (resolve) {
    let timer = null;
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (timer != null) clearTimeout(timer);
      window.removeEventListener("scrollend", finish);
      document.removeEventListener("scrollend", finish);
      if (finishPendingScanScroll === finish) finishPendingScanScroll = null;
      resolve();
    }
    finishPendingScanScroll = finish;
    if (reducedMotion) {
      requestAnimationFrame(finish);
      return;
    }
    window.addEventListener("scrollend", finish, { once: true });
    document.addEventListener("scrollend", finish, { once: true });
    timer = setTimeout(finish, 720);
  });
}

async function focusAndFlashScanOperator(operatorId, effect, targetTab = "catalog") {
  if (!operatorId) return;
  const focusSeq = ++scanFocusSeq;
  if (finishPendingScanScroll) finishPendingScanScroll();
  const nextTab = targetTab === "current" ? "current" : "catalog";
  await setTab(nextTab);
  if (nextTab === "catalog") {
    if (
      !manifestEntries.value.some(function (entry) {
        return entry.id === operatorId;
      })
    ) {
      manifestSearch.value = "";
      manifestFilter.value = "all";
      rarityFilter.value = "all";
      profFilter.value = "all";
      subProfFilter.value = "all";
    }
  } else if (
    !filteredCurrent.value.some(function (entry) {
      return entry.id === operatorId;
    })
  ) {
    resetCurrentFilters();
  }
  await nextTick();
  if (focusSeq !== scanFocusSeq) return;
  const targetMap = nextTab === "current" ? currentLedgerCardElements : operatorSlotElements;
  const target = targetMap.get(operatorId);
  if (!target) {
    flashScanOperator(operatorId, effect);
    return;
  }
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!scanTargetIsVisible(target)) {
    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
    await waitForScanScroll(reducedMotion);
    if (focusSeq !== scanFocusSeq) return;
  }
  flashScanOperator(operatorId, effect);
}

function flashScanOperator(operatorId, effect) {
  if (!operatorId) return;
  const existingTimer = scanEffectTimers.get(operatorId);
  if (existingTimer != null) clearTimeout(existingTimer);
  scanEffectById.value = Object.assign({}, scanEffectById.value, {
    [operatorId]: "",
  });
  nextTick(function () {
    scanEffectById.value = Object.assign({}, scanEffectById.value, {
      [operatorId]: effect,
    });
    const hasExtendedEffect =
      operatorId === "char_084_chendengsp" ||
      operatorId === "char_085_shizimiaosp";
    const effectDuration = hasExtendedEffect
      ? 1350
      : effect === "new"
        ? 1200
        : 700;
    scanEffectTimers.set(
      operatorId,
      setTimeout(function () {
        const next = Object.assign({}, scanEffectById.value);
        delete next[operatorId];
        scanEffectById.value = next;
        scanEffectTimers.delete(operatorId);
      }, effectDuration),
    );
  });
}

function scheduleSubjectiveRefresh(kind) {
  subjectiveEventKinds.add(kind);
  if (subjectiveEventRefreshTimer != null) return;
  subjectiveEventRefreshTimer = setTimeout(function () {
    subjectiveEventRefreshTimer = null;
    if (subjectiveEventKinds.has("operator_annotation")) loadOperatorAnnotations();
    if (subjectiveEventKinds.has("operator_favorites")) loadAgentFavorites();
    subjectiveEventKinds.clear();
  }, 180);
}

function routeQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

async function consumeOperatorNavigation() {
  const navigationSeq = ++operatorNavigationSeq;
  const requestedTab = routeQueryValue(route.query.tab);
  const operatorId = routeQueryValue(route.query.focus);
  const reviewRecordId = routeQueryValue(route.query.review_record);
  const reviewOperatorId = routeQueryValue(route.query.review_operator);
  const reviewAccountId = routeQueryValue(route.query.account_id);
  const effect = routeQueryValue(route.query.effect) === "new" ? "new" : "updated";
  const targetTab = requestedTab === "current" || requestedTab === "catalog" || requestedTab === "tracking" && growthTrackingEnabled ? requestedTab : "";
  if (!targetTab && !operatorId && !reviewRecordId) return;
  if (reviewRecordId && reviewAccountId && accounts.value.some(account => account.id === reviewAccountId)) accountId.value = reviewAccountId;
  const contextSeq = currentContextSeq;
  const navigationIsCurrent = () => navigationSeq === operatorNavigationSeq && contextSeq === currentContextSeq && !operatorPageDisposed;
  if (reviewRecordId) {
    const accountOwned = !reviewAccountId || accounts.value.some(account => account.id === reviewAccountId);
    if (accountOwned) {
      await loadScanReviews();
      if (!navigationIsCurrent()) return;
      const review = scanReviews.value.find(item => item.record_id === reviewRecordId && item.operator_id === reviewOperatorId);
      if (review) await openScanReview(review);
      else scanReviewError.value = "这条待复核结果已处理或不属于当前账号";
    } else scanReviewError.value = "无法访问此账号的待复核结果";
  }
  if (!navigationIsCurrent()) return;
  if (operatorId) await focusAndFlashScanOperator(operatorId, effect, targetTab || "catalog");
  else if (targetTab) await setTab(targetTab);
  if (!navigationIsCurrent()) return;

  const cleanedQuery = Object.assign({}, route.query);
  delete cleanedQuery.tab;
  delete cleanedQuery.focus;
  delete cleanedQuery.effect;
  delete cleanedQuery.account_id;
  delete cleanedQuery.review_record;
  delete cleanedQuery.review_operator;
  await router.replace({ query: cleanedQuery }).catch(function () { /* 页面离开时无需处理 */ });
}

watch(
  function () { return [route.query.tab, route.query.focus, route.query.effect, route.query.review_record, route.query.review_operator, route.query.account_id]; },
  function () {
    if (operatorNavigationReady) void consumeOperatorNavigation();
  },
  { flush: 'sync' },
);

function handleAccountEvent(message) {
  if (!message) return;
  const eventAccount = message.data?.account_id || message.data?.accountId;
  if (eventAccount && eventAccount !== accountId.value) return;
  if (message.event === "account_updated") { void loadAccounts(); return; }
  if (message.event === "operator_catalog_update" || message.event === "operator_catalog_updated") {
    void loadCatalog();
  }
  if (message.event === "operator_annotation") { scheduleSubjectiveRefresh(message.event); return; }
  if (message.event === "operator_organization") { void reloadOrganization(); return; }
  if (message.event === "operator_favorites") { scheduleSubjectiveRefresh(message.event); return; }

  if (message.event === "account_stream_open") {
    if (!message.data?.reconnected) return;
    void loadAccounts();
    void reloadOrganization();
    loadOperatorAnnotations();
    loadAgentFavorites();
    scheduleEventRefresh();
    return;
  }
  if (message.event === "operator-upgrade") {
    const data = message.data || {};
    if (data.account_id && data.account_id !== accountId.value) return;
    const transactionId = data.transaction_id || data.transactionId;
    if (transactionId && handledUpgradeTransactionIds.has(transactionId))
      return;
    if (transactionId) handledUpgradeTransactionIds.add(transactionId);
    const id = data.operator_id || data.operatorId;
    const entry = currentMap.value[id];
    if (!entry) {
      reloadCurrent(true);
      if (visitedTabs.value.has("current")) loadCardMaterialStock();
      return;
    }
    const dimension = data.dimension;
    const next = Number(data.to) || 0;
    applyUpgradeOperator(entry, {
      level: dimension === "level" ? next : entry.level,
      level_breakthrough_stage: dimension === "level" ? Math.floor((next - 1) / 10) : operatorLevelBreakthroughStage(entry),
      elite: dimension === "elite" ? next : entry.elite,
      star_level: dimension === "awakening" ? 25 : dimension === "huaji" ? next : entry.starLevel,
      huaji: dimension === "awakening" ? { owned: true, stage: 25, awakened: true }
        : dimension === "huaji" ? operatorHuajiDraft(entry, next) : undefined,
      revision:
        data.operator_revision != null
          ? data.operator_revision
          : data.operatorRevision,
    });
    applyUpgradeConsumption(data.consumed);
    showQuickNotice(id, "养成与库存已同步", 2200);
    return;
  }
  const data = message.data || {};
  if (message.event === "operator_scan_import" && (data.status === "review" || data.status === "rejected")) {
    if (!data.preview) void loadScanReviews();
    return;
  }
  // operator_scan_import（以及兼容的目录更新事件）统一在工具函数中归一化。
  const update = operatorUpdateFromEvent(message);
  if (!update) return;
  const operatorId = data.operator_id || data.operatorId || update.operatorId;
  if (activeTab.value === "current") {
    const refresh = update.preview
      ? Promise.resolve(true)
      : reloadCurrentEntry(operatorId, true);
    void refresh.then(function (updated) {
      if (activeTab.value === "current" && (update.preview || updated))
        void focusAndFlashScanOperator(data.operator_id || operatorId, update.effect, "current");
    });
    return;
  }
  if (!update.preview) scheduleEventRefresh();
  if (activeTab.value === "catalog")
    void focusAndFlashScanOperator(data.operator_id || operatorId, update.effect, "catalog");
}

function stopAccountEventSubscription() {
  if (accountEventRefreshTimer != null) clearTimeout(accountEventRefreshTimer);
  accountEventRefreshTimer = null;
  if (subjectiveEventRefreshTimer != null) clearTimeout(subjectiveEventRefreshTimer);
  subjectiveEventRefreshTimer = null;
  subjectiveEventKinds.clear();
  if (unsubscribeAccountEvents) unsubscribeAccountEvents();
  unsubscribeAccountEvents = null;
  scanFocusSeq += 1;
  if (finishPendingScanScroll) finishPendingScanScroll();
  finishPendingScanScroll = null;
  operatorSlotElements.clear();
  currentLedgerCardElements.clear();
  scanEffectTimers.forEach(clearTimeout);
  scanEffectTimers.clear();
}

// —— 导入 / 导出 ——
function parseImportDocument() {
  if (!importText.value.trim())
    throw new Error("请粘贴交换协议 JSON 或选择文件");
  const parsed = JSON.parse(importText.value);
  return parsed && parsed.document ? parsed.document : parsed;
}

function v3ImportRequest(document, confirmReview) {
  return buildOperatorV3BrowserRequest(
    document,
    accountId.value,
    confirmReview,
  );
}

function resetImportPreview() {
  organizationImportPreview.value = null;
  organizationImportMessage.value = "";
  importPreview.value = null;
  importPreviewKey.value = "";
  importV2Preview.value = null;
  importV2PreviewKey.value = "";
}

function onImportTextInput() {
  importOperationSeq += 1;
  importError.value = "";
  importRequestIssue.value = null;
  importResult.value = null;
  importConfirmReview.value = false;
  resetImportPreview();
}

function previewOrganizationImport() {
  if (importing.value || !organizationReady.value || !accountId.value) return;
  resetImportPreview();
  importError.value = "";
  importResult.value = null;
  try {
    organizationImportPreview.value = {
      content: readOperatorOrganizationBackup(importText.value, gameFilter.value, catalogMap.value),
      text: importText.value, accountId: accountId.value, revision: organizationData.value.revision,
    };
  } catch (err) { importError.value = humanErr(err, "分类备份校验失败"); }
}

async function commitOrganizationImport() {
  const preview = organizationImportPreview.value;
  if (importing.value || !organizationReady.value || !preview || preview.text !== importText.value || preview.accountId !== accountId.value || preview.revision !== organizationData.value.revision) return;
  const contextSeq = currentContextSeq;
  const operation = ++importOperationSeq;
  importing.value = true;
  importError.value = "";
  try {
    if (!(await confirmOrganizationDiscard()) || !importRequestIsCurrent(operation, contextSeq, preview.accountId)) return;
    if (await saveOrganization(preview.content, preview.revision)) {
      await nextTick();
      if (!importRequestIsCurrent(operation, contextSeq, preview.accountId)) return;
      organizationManager.value?.resetDraft();
      resetImportPreview();
      organizationImportMessage.value = "分类已恢复并保存到当前账号";
      importText.value = "";
    }
  } catch (err) {
    if (importRequestIsCurrent(operation, contextSeq, preview.accountId)) importError.value = humanErr(err, "分类恢复失败，输入和草稿已保留");
  } finally {
    if (importRequestIsCurrent(operation, contextSeq, preview.accountId)) importing.value = false;
  }
}

function exportOrganizationBackup() {
  if (!auth.isLoggedIn || !accountId.value || !organizationReady.value) return;
  const blob = new Blob([JSON.stringify(operatorOrganizationBackup(organizationData.value, gameFilter.value), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "密探分类-" + accountId.value + ".json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function previewV3Import() {
  if (importing.value) return;
  if (!auth.isLoggedIn) {
    goLogin();
    return;
  }
  importError.value = "";
  importResult.value = null;
  let requestBody;
  try {
    const document = parseImportDocument();
    if (!isOperatorV3Document(document))
      throw new Error("请选择密探养成数据交换协议 v3 文档");
    requestBody = v3ImportRequest(document, importConfirmReview.value);
  } catch (err) {
    importError.value =
      err instanceof SyntaxError
        ? "JSON 解析失败，请检查格式"
        : humanErr(err, "v3 档案校验失败");
    resetImportPreview();
    return;
  }
  const contextSeq = currentContextSeq;
  const operation = ++importOperationSeq;
  const targetAccount = accountId.value;
  importing.value = true;
  resetImportPreview();
  try {
    const response = await previewOperatorImport(requestBody);
    if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
    importPreview.value = normalizeOperatorV3ImportResponse(response);
    importPreviewKey.value = JSON.stringify(requestBody);
  } catch (err) {
    if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
    importError.value = importFailureText(err, "档案预览失败，输入已保留，可重试");
  } finally {
    if (importRequestIsCurrent(operation, contextSeq, targetAccount)) importing.value = false;
  }
}

function importRequestIsCurrent(operation, contextSeq, targetAccount) {
  return operation === importOperationSeq && contextSeq === currentContextSeq && targetAccount === accountId.value && !operatorPageDisposed;
}

function importFailureText(err, fallback) {
  importRequestIssue.value = { code: err?.code || '', message: err?.message || '', field_path: err?.payload?.error?.field_path || err?.payload?.data?.error?.field_path || '' };
  if (err?.code) return operatorReviewIssueText(err);
  if (/Failed to fetch|NetworkError|fetch|timeout|超时/i.test(err?.message || '')) return '网络未能确认结果，输入已保留。可重新读回现值，或重试同一份修正。';
  return humanErr(err, fallback);
}

async function commitV3Import() {
  if (!canCommitV3Import.value || importing.value) return;
  importError.value = "";
  let requestBody;
  try {
    requestBody = v3ImportRequest(
      parseImportDocument(),
      importConfirmReview.value,
    );
    if (JSON.stringify(requestBody) !== importPreviewKey.value)
      throw new Error("档案或目标账号已经变化，请重新预览");
  } catch (err) {
    importError.value =
      err instanceof SyntaxError
        ? "JSON 解析失败，请检查格式"
        : humanErr(err, "无法提交导入");
    resetImportPreview();
    return;
  }
  const contextSeq = currentContextSeq;
  const operation = ++importOperationSeq;
  importing.value = true;
  const targetAccount = accountId.value;
  const review = selectedScanReview.value;
  const reviewingThisDocument = review && review.account_id === targetAccount &&
    isOperatorScanReviewDraft(review, requestBody.document);
  const complete = scanReviewComplete.value;
  try {
    let duplicateReceipt = null;
    if (reviewingThisDocument) {
      const latest = normalizeOperatorV3ImportResponse(await previewOperatorImport(requestBody));
      if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
      const item = operatorReviewReceiptItem(latest, review, requestBody.document);
      const duplicate = item?.status === 'unchanged' && item.warnings.some(issue => issue.code === 'duplicate_record');
      if (duplicate) duplicateReceipt = latest;
      else if (JSON.stringify(latest) !== JSON.stringify(importPreview.value)) {
        importPreview.value = latest;
        importPreviewKey.value = JSON.stringify(requestBody);
        importError.value = '服务器档案或校验结果已变化，已更新预览。输入仍保留，请核对新的影响后再次确认保存。';
        return;
      }
    }
    const response = duplicateReceipt || normalizeOperatorV3ImportResponse(
      await importOperator(requestBody),
    );
    if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
    let resolvedReview = false;
    if (reviewingThisDocument && operatorReviewCanClose(response, review, requestBody.document, complete)) {
      try {
        await closeOperatorScanReview({ accountId: targetAccount, recordId: review.record_id, operatorId: review.operator_id });
        resolvedReview = true;
      } catch (closeError) {
        if (importRequestIsCurrent(operation, contextSeq, targetAccount)) importError.value = "修正已保存，但关闭提醒失败：" + humanErr(closeError, "请稍后重试");
      }
    }
    if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
    importResult.value = Object.assign({ kind: "v3" }, response);
    resetImportPreview();
    await reloadCurrent(true);
    if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
    if (reviewingThisDocument) {
      const item = operatorReviewReceiptItem(response, review, requestBody.document);
      if (item && ['accepted', 'partial', 'unchanged'].includes(item.status) &&
          !item.blockingErrors.length) scanReviewForm.value?.markSaved();
      if (resolvedReview) { selectedScanReview.value = null; scanReviewDirty.value = false; }
      else {
        scanReviewSavedMessage.value = response.items.length
          ? '请核对逐项保存回执；未处理或仍被拒绝的字段继续保留提醒。'
          : '服务器未提供逐项回执，不能确认每个字段已保存；请重新读回核对，提醒继续保留。';
        await readScanReviewCurrent();
      }
      await loadScanReviews();
    }
  } catch (err) {
    if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
    importError.value = importFailureText(err, "档案保存失败，输入已保留，可重试");
  } finally {
    if (importRequestIsCurrent(operation, contextSeq, targetAccount)) importing.value = false;
  }
}

function onImportReviewChange() {
  importPreviewKey.value = "";
  importResult.value = null;
}

function importStatusLabel(status) {
  return (
    {
      accepted: importPreview.value ? "可保存" : "已保存",
      partial: importPreview.value ? "可部分保存" : "部分保存",
      review: "待复核",
      rejected: "已拒绝",
      unchanged: "无变化",
    }[status] || status
  );
}

function importOperatorName(id) {
  const op = catalogMap.value[id];
  return op && op.name ? op.name : '图鉴未收录的密探';
}

function importFieldLabel(field) {
  return (
    {
      level: "等级",
      elite: "修为",
      star_level: "化极",
      huaji: "化极与觉醒",
      huaji_legacy: "历史化极来源",
      disc_loadouts: "命盘",
      star_stones: "已装备星石",
      equipped_star_stones: "已装备星石",
      combat_stats: "奇闻与攻生",
      growth_state: "养成状态",
      favorite: "特别关注",
      note: "备注",
      targets: "养成目标",
    }[field] || field
  );
}

function importValueLabel(value, field, operatorId) {
  if (field === "growth_state") return statusLabel(value);
  if (value == null) return "未知";
  if (field === 'huaji' || field === 'disc_loadouts') return operatorReviewValueLabel(value, field, catalogMap.value[operatorId]);
  if (field === 'combat_stats') {
    const oddities = value.oddities || {};
    const facts = Object.keys(oddities).map(key => operatorReviewFieldLabel('combat_stats.oddities.' + key) + ' ' + (oddities[key]?.current ?? '未知'));
    if (value.observed_attack != null || value.observedAttack != null) facts.push('观测攻击 ' + (value.observed_attack ?? value.observedAttack));
    if (value.observed_hp != null || value.observedHp != null) facts.push('观测生命 ' + (value.observed_hp ?? value.observedHp));
    return facts.join('、') || '战斗观测记录（技术详情可查）';
  }
  if (Array.isArray(value)) return value.length ? value.map(item => item.name || '已记录项目').join('、') : "未配置";
  if (typeof value === "object") return '已记录（技术详情可查）';
  return String(value);
}

function v2PreviewKey(document) {
  return JSON.stringify([document, accountId.value, currentMap.value]);
}

function previewV2Import() {
  if (!auth.isLoggedIn) {
    goLogin();
    return;
  }
  importError.value = "";
  importResult.value = null;
  resetImportPreview();
  try {
    if (loading.value || error.value || currentLoadedKey.value !== accountId.value + ':' + gameFilter.value)
      throw new Error('请先成功加载当前账号的养成数据，再预览导入影响');
    const doc = parseImportDocument();
    importV2Preview.value = buildOperatorV2BrowserPreview(doc, accountId.value, currentMap.value, gameFilter.value);
    importV2PreviewKey.value = v2PreviewKey(doc);
  } catch (err) {
    importError.value =
      err instanceof SyntaxError
        ? "JSON 解析失败，请检查格式"
        : humanErr(err, "导入档案校验失败");
  }
}

async function commitV2Import() {
  if (!importV2Preview.value || importing.value) return;
  let doc;
  try {
    doc = parseImportDocument();
    if (v2PreviewKey(doc) !== importV2PreviewKey.value)
      throw new Error('档案、目标账号或当前养成已变化，请重新预览');
  } catch (err) {
    importError.value = humanErr(err, '无法提交导入');
    resetImportPreview();
    return;
  }
  const summary = importV2Preview.value;
  const confirmed = await dialog.confirm({
    title: '确认导入 v2 档案？',
    message: '将向「' + currentAccountName.value + '」写入 ' + summary.recordCount + ' 条记录，涉及 ' + summary.entries.length + ' 位密探。' + (summary.fullCount ? '其中 ' + summary.fullCount + ' 条为全量快照，可能移除未列出的旧养成。' : ''),
    type: 'danger', confirmText: '确认写入', cancelText: '返回预览',
  });
  if (!confirmed) return;
  if (v2PreviewKey(doc) !== importV2PreviewKey.value) {
    importError.value = '档案或当前养成已变化，请重新预览';
    resetImportPreview();
    return;
  }
  const contextSeq = currentContextSeq;
  importing.value = true;
  importResult.value = null;
  try {
    const res = await importOperator(summary.document);
    if (contextSeq !== currentContextSeq) return;
    importResult.value = Object.assign({ kind: "v2" }, res || {});
    resetImportPreview();
    await reloadCurrent(true);
  } catch (err) {
    if (contextSeq !== currentContextSeq) return;
    importError.value = humanErr(err, "导入失败");
  } finally {
    if (contextSeq === currentContextSeq) importing.value = false;
  }
}

function onFilePick(ev) {
  if (importing.value) return;
  const file = ev && ev.target && ev.target.files && ev.target.files[0];
  if (!file) return;
  selectedScanReview.value = null;
  const contextSeq = currentContextSeq;
  const operation = ++importOperationSeq;
  const targetAccount = accountId.value;
  const reader = new FileReader();
  reader.onload = function () {
    if (!importRequestIsCurrent(operation, contextSeq, targetAccount)) return;
    importText.value = String(reader.result || "");
    onImportTextInput();
  };
  reader.readAsText(file, "utf-8");
}

function fillExample() {
  selectedScanReview.value = null;
  const op =
    catalogOperators.value.find(function (entry) {
      return matchesGame(entry, saveGame.value) && !entry.spOf;
    }) ||
    catalogOperators.value[0] ||
    {};
  const account = accounts.value.find(function (a) {
    return a.id === accountId.value;
  }) || { id: accountId.value || "acc_demo", name: "示例账号" };
  const now = new Date().toISOString();
  const doc = {
    format: "myshare-operator-exchange",
    version: 3,
    exported_at: now,
    catalog_version: catalogVersion.value || "local",
    producer: { platform: "yuanhub", version: "1" },
    accounts: [{ id: "local_example", name: account.name }],
    records: [
      {
        account_id: "local_example",
        record_id: "yuanhub:example:" + Date.now(),
        record_type: "operator_snapshot",
        game: saveGame.value,
        effective_at: now,
        snapshot_scope: "listed",
        source_kind: "manual",
        coverage: {
          complete: false,
          record_count: 1,
          unmatched_count: 0,
          interrupted: false,
        },
        entries: [
          {
            operator_id: op.id || "char_001_yangxiu",
            name: op.name || "杨修",
            elite: 0,
            star_level: 30,
            level: 40,
            disc_loadouts: [],
            equipped_star_stones: [],
            section_status: {
              basic: "ready",
              huaji: "ready",
              disc_loadouts: "ready",
              equipment: "ready",
            },
          },
        ],
      },
    ],
  };
  importText.value = JSON.stringify(doc, null, 2);
  onImportTextInput();
}

async function afterImport() {
  const operation = importOperationSeq;
  const contextSeq = currentContextSeq;
  if (importing.value || !(await confirmScanReviewDiscard()) || operation !== importOperationSeq || contextSeq !== currentContextSeq || operatorPageDisposed) return;
  selectedScanReview.value = null;
  scanReviewDirty.value = false;
  importResult.value = null;
  importConfirmReview.value = false;
  resetImportPreview();
  importText.value = "";
  importError.value = "";
  showImport.value = false;
  subjectiveRefreshKey.value += 1;
  Promise.all([
    reloadCurrent(),
    loadOperatorAnnotations(),
    loadAgentFavorites(),
  ]);
}

async function doExport() {
  if (!auth.isLoggedIn) {
    goLogin();
    return;
  }
  if (!accountId.value) {
    await dialog.alert({ message: "请先创建并选择一个子账号" });
    return;
  }
  const contextSeq = currentContextSeq;
  try {
    const opts = { version: 5 };
    if (exportAll.value && accounts.value.length > 1) {
      opts.scope = "all";
    } else {
      opts.accountId = accountId.value;
    }
    const data = await exportOperator(opts);
    if (contextSeq !== currentContextSeq) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "operator-full-backup-v4.json";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    if (contextSeq !== currentContextSeq) return;
    await dialog.alert({
      title: "导出失败",
      message: humanErr(err, "导出失败"),
    });
  }
}

function humanErr(err, fallback) {
  if (!err) return fallback;
  const byCode = {
    annotation_revision_conflict: "养成状态或备注已在其他页面更新，已重新同步",
    operator_state_stale: "密探养成状态已变化，请重新确认提升",
    inventory_state_stale: "库存已变化，请重新确认提升",
    insufficient_inventory: "库存材料不足，无法完成提升",
    idempotency_conflict: "本次提升请求已变化，请重新打开预览",
    invalid_growth_state: "养成状态无效",
    invalid_upgrade_target: "当前目标不能通过快捷提升完成",
    invalid_star_level: "化极目标超过该密探允许的范围",
    invalid_level_breakthrough: "突破与当前等级不匹配，请重新核对",
    level_breakthrough_conflict: "本次已突破选择与档案矛盾，请刷新并核对等级上限",
    preview_expired: "提升预览已过期，请重新确认",
  };
  if (err.code && byCode[err.code]) return byCode[err.code];
  const msg = err.message;
  if (!msg) return fallback;
  if (/Failed to fetch|NetworkError|fetch/i.test(msg))
    return "暂时无法连接 YuanHub，请检查网络后重试；仍失败时请反馈。";
  return msg;
}

function goLogin() {
  location.href = "/login";
}

onMounted(async function () {
  compactStatsQuery = window.matchMedia("(max-width: 640px)");
  syncCompactStats();
  compactStatsQuery.addEventListener("change", syncCompactStats);
  document.addEventListener("pointerdown", handleCardPopoverOutside);
  window.addEventListener("scroll", hideDiscTooltip, true);
  window.addEventListener("resize", hideDiscTooltip);
  await Promise.all([loadCatalog(), loadAccounts(), loadStarLoadoutPresets()]);
  if (operatorPageDisposed) return;
  operatorAccountDataReady = true;
  await Promise.all([reloadCurrent(), loadAgentFavorites()]);
  if (operatorPageDisposed) return;
  await loadScanReviews();
  if (operatorPageDisposed) return;
  setTab(activeTab.value);
  unsubscribeAccountEvents = subscribeAccountEvents(handleAccountEvent);
  operatorNavigationReady = true;
  void consumeOperatorNavigation();
});

onBeforeUnmount(function () {
  panelPreviewRequest.dispose();
  panelBatchRequest.dispose();
  importOperationSeq += 1;
  scanReviewCurrentSeq += 1;
  scanReviewLoadSeq += 1;
  annotationScopeSeq += 1;
  annotationLoadSeq += 1;
  operatorPageDisposed = true;
  currentContextSeq += 1;
  catalogLoadSeq += 1;
  currentLoadSeq += 1;
  starLoadoutLoadSeq += 1;
  starLoadoutSaveSeq += 1;
  cardSubmitTimers.forEach(clearTimeout);
  cardSubmitTimers.clear();
  compactStatsQuery?.removeEventListener("change", syncCompactStats);
  document.removeEventListener("pointerdown", handleCardPopoverOutside);
  window.removeEventListener("scroll", hideDiscTooltip, true);
  window.removeEventListener("resize", hideDiscTooltip);
  stopAccountEventSubscription();
  if (bodyLockedByEditor)
    document.body.style.overflow = bodyOverflowBeforeEditor;
});
</script>

<style scoped>
.panel-preference-notice {
  margin: 0 1rem 1rem;
  color: var(--ink);
}
.editor-panel-source {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  color: var(--ink);
}
.editor-panel-source select {
  max-width: 100%;
  min-width: 0;
  padding: 0.3rem;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.editor-panel-source select:focus-visible,
.editor-panel-comparison summary:focus-visible {
  outline: 2px solid var(--theme-focus, var(--tea));
  outline-offset: 2px;
}
.editor-panel-comparison {
  color: var(--ink);
  overflow-wrap: anywhere;
}
.editor-panel-comparison summary { cursor: pointer; }
.editor-panel-comparison p { margin: 0.35rem 0; }
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* Page-owned workspaces only; other segmented controls keep their own hierarchy. */
.page-operator .operator-tabs.tool-workspace-tabs {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: none;
  backdrop-filter: none;
}
.page-operator .operator-tabs.tool-workspace-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
  transition: none;
}
.page-operator .operator-tabs.tool-workspace-tabs button[aria-selected="true"] {
  border-bottom-color: var(--tea);
  background: color-mix(in srgb, var(--yellow) 45%, var(--surface));
  color: var(--theme-strong-text, var(--tea));
}
@media (hover: hover) {
  .page-operator .operator-tabs.tool-workspace-tabs button:hover:not([aria-selected="true"]):not(:disabled) {
    background: var(--cream);
    color: var(--ink);
  }
}
.page-operator .operator-tabs.tool-workspace-tabs button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--tea));
  outline-offset: -3px;
}
.page-operator .operator-tabs.tool-workspace-tabs button:disabled {
  color: var(--ink-35);
  cursor: not-allowed;
}
.page-operator .operator-tabs.tool-workspace-tabs button[aria-haspopup="dialog"] {
  border: 1px dashed var(--line);
}


.catalog-version-value { border: 0; background: transparent; color: inherit; }
.catalog-version-value:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.oddity-completion-badge {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
}
.oddity-completion-badge.is-full {
  background: var(--yellow);
  color: var(--theme-strong-text, var(--tea));
}
.oddity-completion-badge.is-unknown {
  border-style: dashed;
}
.oddity-completion-reason {
  color: var(--ink);
}

.scan-review-panel, .scan-review-context { border: 1px solid var(--rouge); border-radius: 12px; background: var(--surface); color: var(--ink); }
.scan-review-panel h2 span { color: var(--theme-danger-text, var(--rouge)); }
.scan-review-panel button { border: 1px solid var(--rouge); border-radius: 8px; background: var(--surface); color: var(--ink); cursor: pointer; }
.scan-review-panel button:focus-visible, .scan-review-context button:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.import-technical summary { cursor: pointer; }
.orphan-current { border: 1px solid var(--line); border-radius: 12px; background: var(--cream); }
.operator-share-placeholder p { color: var(--ink-60); }

/* —— 复用全局 CSS 变量（不新增色值），对齐库存（inventory）页版式 —— */
.page-operator .hero::after {
  content: "密探";
}

/* ---- 密探工作区与分享面板 ---- */
.build-row.is-scan-updated {
  animation: operator-scan-update 0.7s ease-out;
}
.build-row.is-scan-new {
  animation: operator-scan-new 1.2s var(--ease);
}
.slot.is-scan-new .slot-ic,
.slot.is-scan-updated .slot-ic {
  animation: operator-scanner-shell 0.88s ease-out both;
}
.slot.is-scan-updated .slot-ic {
  animation-duration: 0.68s;
}
.slot.is-scan-new .slot-ic::before,
.slot.is-scan-updated .slot-ic::before {
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--operator-scanner-accent),
    var(--theme-surface, #fff),
    var(--operator-scanner-accent),
    transparent
  );
  box-shadow:
    0 0 10px var(--operator-scanner-accent),
    0 0 22px color-mix(in srgb, var(--operator-scanner-accent) 65%, transparent);
  content: "";
  opacity: 0;
  pointer-events: none;
  animation: operator-scanner-line 0.62s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.slot.is-scan-new .slot-ic::after,
.slot.is-scan-updated .slot-ic::after {
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--operator-scanner-accent) 24%, transparent),
    transparent
  );
  content: "";
  opacity: 0;
  filter: blur(8px);
  pointer-events: none;
  animation: operator-scanner-glow 0.62s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.slot.is-scan-new .slot-avatar,
.slot.is-scan-new .slot-ph,
.slot.is-scan-updated .slot-avatar,
.slot.is-scan-updated .slot-ph {
  animation: operator-scanner-reveal 0.72s cubic-bezier(0.18, 0.82, 0.22, 1)
    0.12s both;
}
.operator-seed-layer {
  pointer-events: none;
  opacity: 0;
}
.seed-ring {
  border: 1px solid color-mix(in srgb, var(--yellow-deep) 58%, transparent);
  border-radius: 50%;
  box-shadow: 0 0 9px color-mix(in srgb, var(--yellow-deep) 20%, transparent);
}
.seed-grain {
  border-radius: 70% 30% 70% 30%;
  background: var(--yellow-deep);
  box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 42%, transparent);
}
.slot.is-chendeng-sp.is-scan-new .slot-ic,
.slot.is-chendeng-sp.is-scan-updated .slot-ic {
  border-style: solid;
  animation: operator-seed-shell 1.15s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.slot.is-chendeng-sp.is-scan-new .slot-ic::before,
.slot.is-chendeng-sp.is-scan-new .slot-ic::after,
.slot.is-chendeng-sp.is-scan-updated .slot-ic::before,
.slot.is-chendeng-sp.is-scan-updated .slot-ic::after {
  content: none;
  animation: none;
}
.slot.is-chendeng-sp.is-scan-new .seed-ring,
.slot.is-chendeng-sp.is-scan-updated .seed-ring {
  animation: operator-seed-ripple 0.95s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.slot.is-chendeng-sp.is-scan-new .seed-ring-two,
.slot.is-chendeng-sp.is-scan-updated .seed-ring-two {
  animation-delay: 0.16s;
}
.slot.is-chendeng-sp.is-scan-new .seed-ring-three,
.slot.is-chendeng-sp.is-scan-updated .seed-ring-three {
  animation-delay: 0.3s;
}
.slot.is-chendeng-sp.is-scan-new .seed-grain,
.slot.is-chendeng-sp.is-scan-updated .seed-grain {
  animation: operator-seed-burst 0.72s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.slot.is-chendeng-sp.is-scan-new .seed-grain-two,
.slot.is-chendeng-sp.is-scan-updated .seed-grain-two {
  animation-delay: 0.05s;
}
.slot.is-chendeng-sp.is-scan-new .seed-grain-three,
.slot.is-chendeng-sp.is-scan-updated .seed-grain-three {
  animation-delay: 0.1s;
}
.slot.is-chendeng-sp.is-scan-new .seed-grain-four,
.slot.is-chendeng-sp.is-scan-updated .seed-grain-four {
  animation-delay: 0.15s;
}
.slot.is-chendeng-sp.is-scan-new .seed-grain-five,
.slot.is-chendeng-sp.is-scan-updated .seed-grain-five {
  animation-delay: 0.2s;
}
.slot.is-chendeng-sp.is-scan-new .seed-grain-six,
.slot.is-chendeng-sp.is-scan-updated .seed-grain-six {
  animation-delay: 0.25s;
}
.slot.is-chendeng-sp.is-scan-new .slot-avatar,
.slot.is-chendeng-sp.is-scan-new .slot-ph,
.slot.is-chendeng-sp.is-scan-updated .slot-avatar,
.slot.is-chendeng-sp.is-scan-updated .slot-ph {
  animation: operator-seed-reveal 0.72s cubic-bezier(0.22, 1, 0.36, 1) 0.25s
    both;
}
.operator-rune-layer {
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
}
.rune-ring-outer {
  border: 1px solid color-mix(in srgb, var(--theme-purple-line, #9483bf) 74%, var(--surface));
  box-shadow:
    0 0 14px rgba(111, 86, 136, 0.28),
    inset 0 0 10px rgba(148, 131, 191, 0.2);
}
.rune-ring-inner {
  border: 1px dashed color-mix(in srgb, var(--theme-purple-line, #9483bf) 52%, var(--surface));
  box-shadow: inset 0 0 12px rgba(111, 86, 136, 0.14);
}
.rune-glyphs {
  border: 1px dotted color-mix(in srgb, var(--theme-purple-line, #9483bf) 58%, transparent);
}
.rune-glyphs::before {
  color: color-mix(in srgb, var(--theme-purple-text, #9483bf) 72%, var(--on-surface));
  content: "玄 烛";
}
.rune-ripple-one,
.rune-ripple-two {
  border: 1px solid color-mix(in srgb, var(--theme-purple-line, #9483bf) 48%, transparent);
  box-shadow: 0 0 10px rgba(111, 86, 136, 0.16);
}
.slot.is-shizimiao-sp.is-scan-new .slot-ic,
.slot.is-shizimiao-sp.is-scan-updated .slot-ic {
  border-style: solid;
  animation: operator-rune-shell 1.15s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.slot.is-shizimiao-sp.is-scan-new .slot-ic::before,
.slot.is-shizimiao-sp.is-scan-new .slot-ic::after,
.slot.is-shizimiao-sp.is-scan-updated .slot-ic::before,
.slot.is-shizimiao-sp.is-scan-updated .slot-ic::after {
  content: none;
  animation: none;
}
.slot.is-shizimiao-sp.is-scan-new .rune-ring-outer,
.slot.is-shizimiao-sp.is-scan-updated .rune-ring-outer {
  animation: operator-rune-ring-outer 0.95s cubic-bezier(0.18, 0.82, 0.2, 1)
    0.02s both;
}
.slot.is-shizimiao-sp.is-scan-new .rune-ring-inner,
.slot.is-shizimiao-sp.is-scan-updated .rune-ring-inner {
  animation: operator-rune-ring-inner 0.88s cubic-bezier(0.18, 0.82, 0.2, 1)
    0.08s both;
}
.slot.is-shizimiao-sp.is-scan-new .rune-glyphs,
.slot.is-shizimiao-sp.is-scan-updated .rune-glyphs {
  animation: operator-rune-glyphs 0.98s cubic-bezier(0.22, 1, 0.36, 1) 0.05s
    both;
}
.slot.is-shizimiao-sp.is-scan-new .rune-ripple-one,
.slot.is-shizimiao-sp.is-scan-updated .rune-ripple-one {
  animation: operator-rune-ripple-one 0.92s cubic-bezier(0.22, 1, 0.36, 1) 0.1s
    both;
}
.slot.is-shizimiao-sp.is-scan-new .rune-ripple-two,
.slot.is-shizimiao-sp.is-scan-updated .rune-ripple-two {
  animation: operator-rune-ripple-two 1s cubic-bezier(0.22, 1, 0.36, 1) 0.26s
    both;
}
.slot.is-shizimiao-sp.is-scan-new .slot-avatar,
.slot.is-shizimiao-sp.is-scan-new .slot-ph,
.slot.is-shizimiao-sp.is-scan-updated .slot-avatar,
.slot.is-shizimiao-sp.is-scan-updated .slot-ph {
  animation: operator-rune-reveal 0.76s cubic-bezier(0.22, 1, 0.36, 1) 0.28s
    both;
}
.slot.is-fazheng .slot-ic {
  transition:
    border-color 1.2s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 1.2s cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 1.05s steps(6, end);
}
.slot.is-fazheng.is-scan-new .slot-ic,
.slot.is-fazheng.is-scan-updated .slot-ic {
  border-style: solid;
  border-radius: 2px;
  animation: operator-pixel-shell 0.68s steps(6, end) both;
}
.slot.is-fazheng.is-scan-new .slot-ic::before,
.slot.is-fazheng.is-scan-updated .slot-ic::before {
  border-radius: 0;
  background: repeating-linear-gradient(
    90deg,
    color-mix(in srgb, var(--operator-pixel-purple) 38%, var(--tea)) 0 5px,
    var(--operator-pixel-purple) 5px 9px,
    color-mix(in srgb, var(--operator-pixel-purple) 72%, var(--cream)) 9px 11px,
    color-mix(in srgb, var(--operator-pixel-purple) 52%, var(--tea)) 11px 15px
  );
  box-shadow:
    inset 0 1px 0
      color-mix(in srgb, var(--operator-pixel-purple) 48%, var(--tea)),
    0 3px 0 rgba(111, 86, 136, 0.14);
  animation: operator-pixel-scan 0.56s steps(8, end) both;
}
.slot.is-fazheng.is-scan-new .slot-ic::after,
.slot.is-fazheng.is-scan-updated .slot-ic::after {
  background:
    linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple))
      left top / 22px 2px no-repeat,
    linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple))
      right top / 9px 2px no-repeat,
    linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple))
      left bottom / 10px 2px no-repeat,
    linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple))
      right bottom / 20px 2px no-repeat,
    linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple))
      left top / 2px 16px no-repeat,
    linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple))
      right bottom / 2px 18px no-repeat,
    repeating-linear-gradient(
      0deg,
      var(--theme-wash, rgba(255, 253, 246, 0.04)) 0 1px,
      transparent 1px 4px
    ),
    repeating-linear-gradient(
      90deg,
      var(--theme-purple-wash, rgba(111, 86, 136, 0.16)) 0 2px,
      transparent 2px 9px
    );
  filter: none;
  animation: operator-pixel-noise 0.58s steps(5, end) 0.06s both;
}
.slot.is-fazheng.is-scan-new .slot-avatar,
.slot.is-fazheng.is-scan-new .slot-ph,
.slot.is-fazheng.is-scan-updated .slot-avatar,
.slot.is-fazheng.is-scan-updated .slot-ph {
  animation: operator-pixel-reveal 0.58s steps(6, end) 0.08s both;
}
@keyframes operator-scan-update {
  0% {
    background-color: transparent;
    box-shadow: inset 0 0 0 0 rgba(215, 137, 53, 0);
  }
  40% {
    background-color: var(--theme-wash-strong, rgba(239, 210, 142, 0.3));
    box-shadow: inset 4px 0 0 var(--accent);
  }
  100% {
    background-color: transparent;
    box-shadow: inset 0 0 0 0 rgba(215, 137, 53, 0);
  }
}
@keyframes operator-scan-new {
  0% {
    opacity: 0.55;
    transform: translateY(6px) scale(0.985);
    box-shadow: 0 0 0 0 rgba(215, 137, 53, 0);
  }
  45% {
    opacity: 1;
    transform: translateY(-2px) scale(1.01);
    box-shadow: 0 0 0 6px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.18);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    box-shadow: 0 0 0 0 rgba(215, 137, 53, 0);
  }
}
@keyframes operator-ledger-card-ring {
  0% {
    opacity: 0;
    transform: scale(0.985);
  }
  32% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: scale(1.018);
  }
}
@keyframes operator-ledger-card-sweep {
  0% {
    opacity: 0;
    transform: scaleX(0);
  }
  12% {
    opacity: 1;
  }
  78% {
    opacity: 1;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1);
  }
}
@keyframes operator-scanner-line {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  8% {
    opacity: 1;
  }
  92% {
    opacity: 1;
  }
  100% {
    transform: translateY(130px);
    opacity: 0;
  }
}
@keyframes operator-scanner-glow {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  8% {
    opacity: 0.65;
  }
  92% {
    opacity: 0.7;
  }
  100% {
    transform: translateY(130px);
    opacity: 0;
  }
}
@keyframes operator-scanner-reveal {
  0% {
    opacity: 0.16;
    filter: grayscale(1) brightness(0.45);
  }
  42% {
    opacity: 0.78;
    filter: grayscale(0.55) brightness(1.55);
  }
  72% {
    opacity: 1;
    filter: grayscale(0) brightness(1.9);
  }
  100% {
    opacity: 1;
    filter: none;
  }
}
@keyframes operator-scanner-shell {
  0% {
    transform: scale(1);
  }
  58% {
    transform: scale(1.018);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes operator-seed-shell {
  0% {
    border-color: color-mix(in srgb, var(--tea) 72%, var(--yellow-deep));
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--yellow-deep) 12%, transparent);
  }
  52% {
    border-color: var(--yellow-deep);
    box-shadow:
      inset 0 0 24px color-mix(in srgb, var(--yellow) 30%, transparent),
      0 0 28px color-mix(in srgb, var(--accent) 24%, transparent);
  }
  100% {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 2px rgba(var(--theme-shadow-rgb, 239, 210, 142), 0.5);
  }
}
@keyframes operator-seed-ripple {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
  22% {
    opacity: 0.72;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(2.7);
  }
}
@keyframes operator-seed-burst {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(0) scale(0.5);
  }
  28% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--seed-x), var(--seed-y))
      rotate(var(--seed-rotate)) scale(1);
  }
}
@keyframes operator-seed-reveal {
  0% {
    opacity: 0.15;
    filter: grayscale(1) brightness(0.45);
  }
  54% {
    opacity: 1;
    filter: grayscale(0.15) brightness(1.65);
  }
  100% {
    opacity: 1;
    filter: none;
  }
}
@keyframes operator-rune-shell {
  0% {
    border-color: color-mix(in srgb, var(--operator-rune-deep) 42%, var(--tea));
    box-shadow: inset 0 0 0 2px rgba(111, 86, 136, 0.08);
  }
  54% {
    border-color: color-mix(
      in srgb,
      var(--operator-rune-accent) 72%,
      var(--surface)
    );
    box-shadow:
      inset 0 0 28px rgba(111, 86, 136, 0.22),
      0 0 30px rgba(148, 131, 191, 0.24);
  }
  100% {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 2px rgba(var(--theme-shadow-rgb, 239, 210, 142), 0.5);
  }
}
@keyframes operator-rune-ring-outer {
  0% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(0.55) rotate(-25deg);
  }
  30% {
    opacity: 1;
  }
  80% {
    opacity: 0.75;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(1.12) rotate(65deg);
  }
}
@keyframes operator-rune-ring-inner {
  0% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(0.72) rotate(18deg);
  }
  28% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(1.18) rotate(-54deg);
  }
}
@keyframes operator-rune-glyphs {
  0% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(0.78) rotate(24deg);
  }
  34% {
    opacity: 0.92;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(1.15) rotate(-86deg);
  }
}
@keyframes operator-rune-ripple-one {
  0% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(0.2);
  }
  18% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(2.1);
  }
}
@keyframes operator-rune-ripple-two {
  0% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(0.25);
  }
  24% {
    opacity: 0.6;
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -54%) scale(2.55);
  }
}
@keyframes operator-rune-reveal {
  0% {
    opacity: 0.15;
    filter: grayscale(1) brightness(0.45);
  }
  52% {
    opacity: 1;
    filter: grayscale(0.12) brightness(1.7) saturate(1.2);
  }
  100% {
    opacity: 1;
    filter: none;
  }
}
@keyframes operator-pixel-scan {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  7% {
    opacity: 1;
  }
  90% {
    opacity: 1;
  }
  100% {
    transform: translateY(136px);
    opacity: 0;
  }
}
@keyframes operator-pixel-noise {
  0%,
  100% {
    opacity: 0;
  }
  20%,
  60% {
    opacity: 0.9;
  }
  40%,
  80% {
    opacity: 0.28;
  }
}
@keyframes operator-pixel-reveal {
  0% {
    opacity: 0.14;
    filter: grayscale(1) brightness(0.3) contrast(1.35);
  }
  34% {
    opacity: 0.42;
    filter: grayscale(0.95) brightness(0.65) contrast(1.7);
  }
  67% {
    opacity: 1;
    filter: grayscale(0.25) brightness(1.25) contrast(1.5);
  }
  100% {
    opacity: 1;
    filter: none;
  }
}
@keyframes operator-pixel-shell {
  0% {
    transform: translate(0, 0);
    border-color: color-mix(
      in srgb,
      var(--operator-pixel-purple) 34%,
      var(--tea)
    );
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--operator-pixel-purple) 24%, var(--tea)),
      3px 3px 0 color-mix(in srgb, var(--operator-pixel-purple) 16%, var(--tea));
  }
  20% {
    transform: translate(-2px, 0);
    border-color: color-mix(
      in srgb,
      var(--operator-pixel-purple) 52%,
      var(--tea)
    );
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--operator-pixel-purple) 38%, var(--tea)),
      -3px 2px 0
        color-mix(in srgb, var(--operator-pixel-purple) 22%, var(--tea));
  }
  40% {
    transform: translate(2px, -1px);
    border-color: var(--operator-pixel-purple);
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--operator-pixel-purple) 52%, var(--tea)),
      4px 0 0 color-mix(in srgb, var(--operator-pixel-purple) 34%, var(--tea));
  }
  60% {
    transform: translate(-1px, 1px);
    border-color: color-mix(
      in srgb,
      var(--operator-pixel-purple) 76%,
      var(--cream)
    );
    box-shadow:
      inset 0 0 0 2px var(--operator-pixel-purple),
      -2px 3px 0
        color-mix(in srgb, var(--operator-pixel-purple) 42%, var(--tea));
  }
  80% {
    transform: translate(1px, 0);
    border-color: var(--operator-pixel-purple);
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--operator-pixel-purple) 58%, var(--tea)),
      2px 2px 0 color-mix(in srgb, var(--operator-pixel-purple) 28%, var(--tea));
  }
  100% {
    transform: translate(0, 0);
    border-color: color-mix(
      in srgb,
      var(--operator-pixel-purple) 48%,
      var(--tea)
    );
    box-shadow:
      inset 0 0 0 2px
        color-mix(in srgb, var(--operator-pixel-purple) 36%, var(--tea)),
      3px 3px 0 color-mix(in srgb, var(--operator-pixel-purple) 18%, var(--tea));
  }
}
@media (prefers-reduced-motion: reduce) {
  .slot.is-fazheng .slot-ic {
    transition: none;
  }
  .operator-seed-layer {
    animation: none !important;
    opacity: 0;
  }
  .operator-rune-layer {
    animation: none !important;
    opacity: 0;
  }
  .build-row.is-scan-updated,
  .build-row.is-scan-new,
  .agent-ledger-card.is-scan-new::before,
  .agent-ledger-card.is-scan-new::after,
  .agent-ledger-card.is-scan-updated::before,
  .agent-ledger-card.is-scan-updated::after,
  .slot.is-scan-new .slot-ic,
  .slot.is-scan-updated .slot-ic,
  .slot.is-scan-new .slot-ic::before,
  .slot.is-scan-new .slot-ic::after,
  .slot.is-scan-updated .slot-ic::before,
  .slot.is-scan-updated .slot-ic::after,
  .slot.is-scan-new .slot-avatar,
  .slot.is-scan-new .slot-ph,
  .slot.is-scan-updated .slot-avatar,
  .slot.is-scan-updated .slot-ph {
    animation: none;
  }
}
.act-btn {
  border: 1.5px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  color: var(--ink-60);
  cursor: pointer;
  transition: all 0.3s var(--ease);
}
.admin-link {
  text-decoration: none;
}
.act-btn.ghost:hover:not(:disabled) {
  border-color: var(--ink);
  color: var(--ink);
}
.act-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ---- 档案操作：与库存页保持同一结构和交互 ---- */
.archive-toggle {
  background: transparent;
}
.archive-workspace {
  border-top: 1px dashed var(--line);
  background: var(--cream);
}
.archive-heading p {
  color: var(--ink-60);
}
.section-kicker {
  color: var(--theme-accent-text, var(--accent-strong));
}
.archive-format {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
}
.archive-actions {
  border-top: 1px dashed var(--line);
}
.archive-import {
  border-radius: 12px;
  background: var(--surface);
}
.export-label {
  color: var(--ink-60);
}
.export-option {
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface);
  cursor: pointer;
  transition:
    border-color 0.25s,
    background-color 0.25s,
    box-shadow 0.25s;
}
.export-option.active {
  border-color: var(--accent);
  background: var(--cream);
  box-shadow: inset 3px 0 0 var(--accent);
}
.export-option.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.export-option input {
  accent-color: var(--accent);
}
.export-option b {
  color: var(--ink);
}
.export-option small {
  color: var(--ink-60);
}
.export-submit {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--on-strong);
}
.organization-export, .organization-export-tip {
  grid-column: 1 / -1;
  justify-self: start;
}
.export-submit:hover:not(:disabled) {
  border-color: var(--tea-deep);
  background: var(--tea-deep);
  color: var(--on-strong);
}

.import-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
}
.import-box .tip {
  color: var(--ink-60);
}
.import-target {
  color: var(--ink-60);
}
.import-target strong {
  color: var(--ink);
}
.import-target small {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--theme-accent-text, var(--accent-strong));
}
.import-box textarea {
  border: 1.5px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
  background: var(--paper);
  outline: none;
  transition: border-color 0.3s;
}
.import-box textarea:focus {
  border-color: var(--theme-focus, var(--accent));
}
.import-box textarea[aria-invalid="true"] {
  border-color: var(--rouge);
}
.import-error {
  color: var(--theme-danger-text, var(--rouge));
}
.file-label {
  cursor: pointer;
}
.import-preview {
  border-top: 1px dashed var(--line);
}
.import-preview-head strong {
  color: var(--ink);
}
.import-preview-head span {
  color: var(--ink-60);
}
.import-review-confirm {
  border-left: 3px solid var(--accent);
  background: var(--cream);
  color: var(--ink);
  cursor: pointer;
}
.import-review-confirm input {
  accent-color: var(--accent);
}
.import-preview-warning {
  color: var(--theme-danger-text, var(--rouge));
}
.import-preview-list {
  border-top: 1px solid var(--line);
}
.import-preview-item {
  border-bottom: 1px solid var(--line);
}
.import-preview-item summary {
  color: var(--ink);
  cursor: pointer;
}
.import-preview-item summary::marker {
  color: var(--ink-35);
}
.import-preview-item summary small {
  color: var(--ink-60);
}
.import-status {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
}
.import-status.is-accepted {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.import-status.is-partial,
.import-status.is-review {
  border-color: var(--yellow-deep);
  background: var(--yellow);
  color: var(--ink);
}
.import-status.is-rejected {
  border-color: var(--rouge);
  color: var(--theme-danger-text, var(--rouge));
}
.import-change-list {
  background: var(--paper);
}
.import-change-list dt {
  color: var(--ink-60);
}
.import-change-list dd {
  color: var(--ink);
}
.import-issue-list {
  color: var(--theme-accent-text, var(--accent-strong));
}
.import-issue-list li.error {
  color: var(--theme-danger-text, var(--rouge));
}
.import-issue-list small {
  color: var(--ink-60);
}
.import-result {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
}
.import-result .ok {
  border: none;
  background: var(--tea);
  color: var(--on-strong);
  border-radius: 999px;
  cursor: pointer;
}
.panel.is-active .rv {
  opacity: 1;
}
.type-switch {
  background: transparent;
}
.type-switch .hint {
  color: var(--ink-35);
}

/* ---- 清单工具条 ---- */
.manifest-bar {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}
.mf-num {
  color: var(--theme-accent-text, var(--accent-strong));
}
.mf-k {
  color: var(--ink-60);
}
.mf-progress {
  border-radius: 999px;
  background: var(--paper);
  border: 1px solid var(--line);
}
.mf-progress i {
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.8s var(--ease);
}
.mf-search {
  border: 1.5px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
  background: var(--paper);
  outline: none;
  transition: border-color 0.3s;
}
.mf-search:focus {
  border-color: var(--theme-focus, var(--accent));
}
.mf-filter {
  background: var(--theme-wash, rgba(73, 59, 44, 0.06));
  border-radius: 10px;
}
.mf-filter button {
  border: none;
  background: transparent;
  border-radius: 7px;
  cursor: pointer;
  color: var(--ink-60);
  transition: all 0.3s var(--ease);
}
.mf-filter button.on {
  background: var(--surface);
  color: var(--theme-accent-text, var(--accent-strong));
  box-shadow: 0 1px 4px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.16);
}
.rarity-filter button.rarity-r3.on {
  background: color-mix(in srgb, var(--theme-info-bg, #99b5cf) 34%, var(--surface));
  color: var(--theme-info-text, #47647d);
}
.rarity-filter button.rarity-r4.on {
  background: color-mix(in srgb, var(--theme-purple-bg, #8672b2) 25%, var(--surface));
  color: var(--theme-purple-text, #62508b);
}
.rarity-filter button.rarity-r5.on {
  background: color-mix(in srgb, var(--yellow) 62%, var(--surface));
  color: var(--theme-accent-text, var(--accent-strong));
}
.mf-filter button:hover:not(.on) {
  color: var(--ink);
}

/* ---- 属性 / 职业 筛选行 ---- */
.prof-filter {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.pf-label {
  color: var(--ink);
}

.mf-warn {
  color: var(--theme-danger-text, var(--rouge));
}
.state.slim {
  border-radius: 14px;
}

.btn {
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.35s var(--ease);
  border: none;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.ghost {
  background: var(--paper);
  border: 1.5px solid var(--line);
  color: var(--ink);
}
.btn.ghost:hover:not(:disabled) {
  background: var(--cream);
  color: var(--ink);
}
.btn.primary {
  background: var(--tea);
  color: var(--on-strong);
}
.btn.primary:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
}

.state {
  background: var(--surface);
  border: 1.5px dashed var(--line);
  border-radius: 20px;
  color: var(--ink-35);
}
.state.err {
  color: var(--ink-60);
}
.state .link {
  background: none;
  border: none;
  color: var(--theme-accent-text, var(--accent));
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* ---- 密探卡片 ---- */
.backpack {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
}
.current-workbench-head {
  border: 1px solid var(--line);
  border-radius: 18px 18px 10px 10px;
  background:
    linear-gradient(
      105deg,
      color-mix(in srgb, var(--yellow) 24%, transparent),
      transparent 46%
    ),
    var(--surface);
  box-shadow: 0 12px 30px -24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.45);
}
.current-workbench-head::before {
  border-radius: 0 4px 4px 0;
  background: var(--accent);
  content: "";
}
.current-game-tag {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--cream);
  color: var(--ink-60);
}
.current-workbench-head p {
  color: var(--ink-60);
}
.current-credit-link {
  border-radius: 4px;
  color: var(--theme-accent-text, var(--accent-strong));
  text-decoration: underline;
  text-decoration-color: rgba(215, 137, 53, 0.5);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition:
    background-color 0.18s var(--ease),
    color 0.18s var(--ease),
    text-decoration-color 0.18s var(--ease);
}
.current-credit-link:hover {
  background: var(--theme-wash-strong, rgba(239, 210, 142, 0.34));
  color: var(--theme-strong-text, var(--tea));
  text-decoration-color: var(--tea);
}
.current-credit-link:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
  background: var(--cream);
  color: var(--theme-strong-text, var(--tea));
}
.current-workbench-index {
  border: 1px solid var(--theme-line, rgba(73, 59, 44, 0.1));
  border-radius: 12px;
  background: var(--theme-surface, rgba(255, 253, 246, 0.72));
}
.current-index-total {
  border-right: 1px dashed var(--line);
}
.current-index-total b {
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-index-total span {
  color: var(--ink-60);
}
.current-status-index > div::before {
  border-radius: 999px;
  background: var(--line);
  content: "";
}
.current-status-index > .status-growing::before {
  background: var(--theme-success-bg, #6f9f76);
}
.current-status-index > .status-graduated::before {
  background: var(--yellow-deep);
}
.current-status-index > .status-inactive::before {
  background: var(--theme-wash-strong, rgba(73, 59, 44, 0.35));
}
.current-status-index dt {
  color: var(--ink-60);
}
.current-status-index dd {
  color: var(--ink);
}
.current-upgrade-reminder {
  border: 1px solid var(--theme-success-line, rgba(111, 159, 118, 0.38));
  border-radius: 12px;
  background: linear-gradient(
    100deg,
    var(--theme-success-wash, rgba(191, 220, 192, 0.5)),
    var(--theme-surface, rgba(255, 253, 246, 0.94)) 58%
  );
  box-shadow: 0 9px 22px -20px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.5);
}
.current-upgrade-reminder.is-huaji {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.38));
  background: linear-gradient(
    100deg,
    var(--theme-wash-strong, rgba(239, 210, 142, 0.48)),
    var(--theme-surface, rgba(255, 253, 246, 0.94)) 58%
  );
}
.current-upgrade-reminder.is-filtering {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.5));
  background: linear-gradient(
    100deg,
    var(--theme-wash-strong, rgba(239, 210, 142, 0.46)),
    var(--theme-surface, rgba(255, 253, 246, 0.94)) 58%
  );
}
.current-upgrade-reminder-icon {
  border: 1px solid var(--theme-success-line, rgba(111, 159, 118, 0.34));
  border-radius: 10px;
  background: var(--theme-success-bg, #bfdcc0);
  color: var(--theme-success-text, #315f38);
}
.current-upgrade-reminder.is-huaji .current-upgrade-reminder-icon {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.38));
  background: var(--yellow);
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-upgrade-reminder-copy strong {
  color: var(--theme-strong-text, var(--tea));
}
.current-upgrade-reminder-copy small {
  color: var(--ink-60);
}
.current-upgrade-reminder-copy small b {
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-upgrade-reminder button {
  border: 1px solid var(--theme-success-line, rgba(111, 159, 118, 0.55));
  border-radius: 8px;
  background: var(--surface);
  color: var(--theme-success-text, #315f38);
  cursor: pointer;
  transition:
    border-color 0.2s var(--ease),
    background-color 0.2s var(--ease),
    color 0.2s var(--ease),
    transform 0.16s var(--ease);
}
.current-upgrade-reminder.is-huaji button {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.5));
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-upgrade-reminder button:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-upgrade-reminder button.on {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--on-strong);
}
.current-upgrade-reminder button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.current-prof-filter {
  border-radius: 16px;
}
.current-filter-head {
  border-bottom: 1px dashed var(--line);
  background: var(--cream);
}
.current-filter-title strong {
  color: var(--theme-strong-text, var(--tea));
}
.current-filter-title span {
  color: var(--ink-35);
}
.current-filter-result {
  color: var(--ink-60);
}
.current-filter-result b {
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-favorite-sort {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
  transition:
    border-color 0.2s var(--ease),
    background 0.2s var(--ease),
    color 0.2s var(--ease);
}
.current-favorite-sort:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-favorite-sort.on {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.55));
  background: var(--yellow);
  color: var(--theme-strong-text, var(--tea));
}
.current-favorite-sort:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.current-filter-reset {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
}
.current-filter-reset:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-filter-reset:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.current-batch-toggle {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
  transition:
    border-color 0.2s var(--ease),
    background 0.2s var(--ease),
    color 0.2s var(--ease);
}
.current-batch-toggle:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.current-batch-toggle.on {
  border-color: var(--theme-success-line, rgba(74, 138, 65, 0.55));
  background: var(--theme-success-bg, rgba(191, 220, 192, 0.72));
  color: var(--theme-success-text, #315f38);
}
.current-batch-toggle:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.batch-status-bar {
  border-top: 1px dashed var(--line);
  background: color-mix(in srgb, var(--cream) 65%, var(--surface));
}
.batch-select-all {
  color: var(--ink-60);
  cursor: pointer;
  user-select: none;
}
.batch-select-all input {
  accent-color: var(--accent);
  cursor: pointer;
}
.batch-select-all.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.batch-select-all.disabled input {
  cursor: not-allowed;
}
.batch-selected-count {
  color: var(--ink-60);
}
.batch-selected-count b {
  color: var(--theme-accent-text, var(--accent-strong));
}
.batch-status-action,
.batch-clear {
  border: 1px solid var(--line);
  border-radius: 7px;
  cursor: pointer;
}
.batch-status-action.graduated {
  border-color: var(--theme-line, rgba(239, 210, 142, 0.85));
  background: var(--yellow);
  color: var(--ink);
}
.batch-status-action.inactive {
  border-color: var(--theme-line, rgba(73, 59, 44, 0.28));
  background: var(--theme-wash, rgba(73, 59, 44, 0.13));
  color: var(--ink);
}
.batch-clear {
  background: var(--surface);
  color: var(--ink-35);
}
.batch-status-action:disabled,
.batch-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.batch-status-bar button:focus-visible,
.batch-select-all:focus-within {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.current-prof-filter .pf-label {
  border: 0;
  background: transparent;
  color: var(--theme-strong-text, var(--tea));
}
.current-status-filter button small {
  color: var(--ink-35);
}
.current-status-filter button.on small {
  color: currentColor;
  opacity: 0.72;
}
.current-status-filter button.status-growing.on {
  background: var(--theme-success-bg, #bfdcc0);
  color: var(--theme-success-text, #315f38);
}
.current-status-filter button.status-graduated.on {
  background: var(--yellow);
  color: var(--ink);
}
.current-status-filter button.status-inactive.on {
  background: var(--theme-wash, rgba(73, 59, 44, 0.13));
  color: var(--ink-60);
}
.current-ledger {
  border: 1px solid var(--theme-line, rgba(255, 248, 236, 0.22));
  border-radius: 20px;
  background: linear-gradient(145deg, var(--tea), var(--tea-deep));
  box-shadow: 0 20px 40px -24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.55);
}
.current-ledger-meta {
  color: rgba(255, 248, 236, 0.76);
}
.current-ledger-meta span:last-child {
  color: var(--theme-accent-text, var(--yellow));
}
.agent-ledger-card {
  color: var(--ink);
  border: 1px solid var(--line);
  border-top: 2px solid var(--ledger-rarity-accent);
  border-radius: 12px;
  background: linear-gradient(180deg, var(--surface), var(--cream));
  box-shadow:
    0 8px 24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.18),
    inset 0 1px 0 rgba(var(--theme-shadow-rgb, 255, 255, 255), 0.8);
  transition:
    transform 0.35s var(--ease),
    box-shadow 0.35s var(--ease);
}
.agent-ledger-card:hover {
  box-shadow:
    0 18px 30px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.25),
    inset 0 1px 0 rgba(var(--theme-shadow-rgb, 255, 255, 255), 0.8);
}
.agent-ledger-card.is-scan-new::before,
.agent-ledger-card.is-scan-updated::before {
  border: 1.5px solid color-mix(in srgb, var(--ledger-scan-accent) 72%, var(--surface));
  border-radius: inherit;
  content: "";
  opacity: 0;
  pointer-events: none;
  animation: operator-ledger-card-ring 0.84s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.agent-ledger-card.is-scan-new::after,
.agent-ledger-card.is-scan-updated::after {
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--ledger-scan-accent) 68%, var(--surface)),
    transparent
  );
  box-shadow: 0 0 12px color-mix(in srgb, var(--ledger-scan-accent) 58%, transparent);
  content: "";
  opacity: 0;
  pointer-events: none;
  animation: operator-ledger-card-sweep 0.72s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.agent-ledger-card.is-scan-updated::before {
  animation-duration: 0.68s;
}
.agent-ledger-card.is-scan-updated::after {
  animation-duration: 0.62s;
}
@media (prefers-reduced-motion: reduce) {
  .agent-ledger-card.is-scan-new::before,
  .agent-ledger-card.is-scan-new::after,
  .agent-ledger-card.is-scan-updated::before,
  .agent-ledger-card.is-scan-updated::after {
    animation: none !important;
    opacity: 0;
  }
}
.agent-ledger-card.status-growing {
  border-left: 3px solid var(--theme-success-line, #6f9f76);
}
.agent-ledger-card.status-graduated {
  border-left: 3px solid var(--yellow-deep);
}
.agent-ledger-card.status-inactive {
  border-left: 3px solid var(--theme-line, rgba(73, 59, 44, 0.35));
}
.agent-ledger-card.is-batch-selected {
  border-color: var(--accent);
  box-shadow:
    0 0 0 2px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.22),
    0 10px 26px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.22),
    inset 0 1px 0 rgba(var(--theme-shadow-rgb, 255, 255, 255), 0.8);
}
.ledger-batch-select {
  cursor: pointer;
}
.ledger-batch-select input {
  accent-color: var(--accent);
  cursor: pointer;
}
.ledger-batch-select input:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.ledger-avatar {
  border: 2px solid var(--ledger-rarity-accent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--ledger-rarity-accent) 16%, var(--paper));
}
.ledger-avatar img {
  border-radius: 8px;
}
.ledger-avatar > span {
  color: var(--ink-35);
}
.ledger-favorite {
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink-35);
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.18);
}
.ledger-favorite.on {
  color: var(--theme-accent-text, var(--accent));
  border-color: var(--accent);
}
.ledger-favorite:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.ledger-status-menu {
  color: var(--ink);
}
.ledger-status-button {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--yellow);
  color: var(--ink);
  cursor: pointer;
  user-select: none;
}
.ledger-status-button::after {
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  content: "";
}
.ledger-status-menu.status-growing .ledger-status-button {
  border-color: var(--theme-success-line, rgba(111, 159, 118, 0.45));
  background: var(--theme-success-bg, #bfdcc0);
  color: var(--theme-success-text, #315f38);
}
.ledger-status-menu.status-graduated .ledger-status-button {
  border-color: var(--theme-line, rgba(239, 210, 142, 0.85));
  background: var(--yellow);
  color: var(--ink);
}
.ledger-status-menu.status-inactive .ledger-status-button {
  border-color: var(--theme-line, rgba(73, 59, 44, 0.22));
  background: var(--theme-wash, rgba(73, 59, 44, 0.12));
  color: var(--ink-60);
}
.ledger-status-button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.ledger-status-options {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 10px 24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.22);
}
.ledger-status-options button {
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
}
.ledger-status-options button:hover,
.ledger-status-options button[aria-selected="true"] {
  border-color: var(--line);
  background: var(--cream);
  color: var(--ink);
}
.ledger-status-options button:first-child[aria-selected="true"] {
  border-color: var(--theme-success-line, rgba(111, 159, 118, 0.45));
  background: var(--theme-success-bg, #bfdcc0);
  color: var(--theme-success-text, #315f38);
}
.ledger-status-options button:nth-child(2)[aria-selected="true"] {
  border-color: var(--theme-line, rgba(239, 210, 142, 0.85));
  background: var(--yellow);
  color: var(--ink);
}
.ledger-status-options button:nth-child(3)[aria-selected="true"] {
  border-color: var(--theme-line, rgba(73, 59, 44, 0.22));
  background: var(--theme-wash, rgba(73, 59, 44, 0.12));
  color: var(--ink-60);
}
.ledger-prof {
  color: var(--ink-60);
}
.ledger-combat-stat {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.ledger-combat-stat.is-saving {
  opacity: 0.72;
}
.ledger-combat-stat.is-saving::after {
  border: 1px solid var(--line);
  border-top-color: var(--accent);
  border-radius: 50%;
  content: "";
  animation: ledger-combat-spin 0.7s linear infinite;
}
@keyframes ledger-combat-spin {
  to {
    transform: rotate(360deg);
  }
}
.ledger-combat-stat:focus-within {
  border-color: var(--theme-focus, var(--accent));
  box-shadow: 0 0 0 2px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.1);
}
.ledger-combat-stat.is-manual {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.58));
  background: var(--cream);
}
.ledger-combat-stat.is-stale {
  border-color: var(--theme-danger-line, rgba(166, 81, 74, 0.42));
}
.ledger-combat-head {
  color: var(--ink-60);
}
.ledger-combat-mode {
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--ink-35);
  cursor: pointer;
  outline: none;
  transition:
    color 0.18s ease,
    background 0.18s ease;
}
.ledger-combat-mode:hover:not(:disabled) {
  background: var(--theme-wash, rgba(215, 137, 53, 0.12));
  color: var(--theme-accent-text, var(--accent-strong));
}
.ledger-combat-mode.is-auto {
  color: var(--theme-info-text, var(--brand-blue));
}
.ledger-combat-mode.is-manual {
  color: var(--theme-accent-text, var(--accent-strong));
}
.ledger-combat-mode.is-disabled {
  color: var(--ink-35);
  cursor: not-allowed;
  opacity: 0.68;
}
.ledger-combat-mode:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.ledger-combat-value {
  border: 0;
  border-bottom: 1px dashed var(--accent);
  outline: none;
  background: transparent;
  color: var(--ink);
  -moz-appearance: textfield;
}
.ledger-combat-value::-webkit-outer-spin-button,
.ledger-combat-value::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.ledger-combat-value::placeholder {
  color: var(--ink);
  opacity: 1;
}
.ledger-combat-value:focus::placeholder {
  color: transparent;
}
.ledger-combat-source {
  color: var(--ink-35);
}
.ledger-oddity {
  color: var(--theme-accent-text, var(--accent-strong));
}
.ledger-oddity-icon {
  color: var(--ink-60);
}
.ledger-oddity input {
  border: 0;
  border-bottom: 1px dashed var(--line);
  outline: none;
  background: transparent;
  color: var(--ink-60);
  -moz-appearance: textfield;
}
.ledger-oddity input::-webkit-outer-spin-button,
.ledger-oddity input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.ledger-oddity span {
  color: var(--ink-35);
}
.ledger-oddity.is-full {
  --ink-60: var(--theme-success-text, #276749);
  --ink-35: var(--theme-success-text, #276749);
  color: var(--theme-success-text, #276749);
}
.ledger-growth {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--theme-wash-strong, rgba(255, 255, 255, 0.62));
}
.ledger-grow-label {
  color: var(--ink-60);
}
.ledger-history-link { border: 0; background: transparent; color: var(--theme-accent-text, var(--accent-strong)); font: inherit; text-decoration: underline; cursor: pointer; padding: 0; }
.ledger-history-link:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.ledger-editable {
  border: 0;
  border-bottom: 1px dashed var(--accent);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.ledger-editable:hover {
  color: var(--theme-accent-text, var(--accent-strong));
}
.ledger-step-actions button,
.ledger-next-action {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.ledger-step-actions button:hover,
.ledger-next-action:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--yellow);
}
.ledger-smart-action {
  border: 1px solid var(--theme-success-line, rgba(74, 138, 65, 0.35));
  border-radius: 4px;
  background: var(--theme-success-bg, #e8f4e9);
  color: var(--theme-success-text, #378b3a);
  cursor: pointer;
}
.ledger-step-actions button:disabled,
.ledger-smart-action:disabled,
.ledger-next-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.ledger-popover {
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 10px 25px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.22);
}
.ledger-popover::before {
  border-left: 1px solid var(--accent);
  border-top: 1px solid var(--accent);
  background: var(--surface);
  content: "";
}
.ledger-popover p {
  color: var(--theme-info-text, var(--brand-blue));
}
.ledger-breakthrough-toggle {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--cream);
  color: var(--ink-60);
  cursor: pointer;
}
.ledger-breakthrough-toggle small {
  color: var(--ink-35);
}
.ledger-popover .ledger-breakthrough-toggle input {
  accent-color: var(--accent);
}
.ledger-breakthrough-toggle:has(input:checked) {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.45));
  background: var(--theme-wash-strong, rgba(239, 210, 142, 0.3));
  color: var(--theme-strong-text, var(--tea));
}
.ledger-breakthrough-toggle:has(input:disabled) {
  cursor: wait;
  opacity: 0.68;
}
.ledger-popover input {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--cream);
  color: var(--ink);
  outline: none;
}
.ledger-popover input:focus {
  border-color: var(--theme-focus, var(--accent));
}
.ledger-popover button {
  border: 0;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
.ledger-popover.is-confirm::before {
  border-top: 0;
  border-left: 0;
  border-right: 1px solid var(--accent);
  border-bottom: 1px solid var(--accent);
}
.ledger-popover.is-confirm p {
  color: var(--ink-60);
}
.ledger-popover.is-confirm .cancel {
  background: var(--paper);
  color: var(--ink-60);
}
.ledger-stats > div {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
}
.ledger-stats span {
  color: var(--ink-60);
}
.ledger-stats strong {
  color: var(--ink);
}
.ledger-stats small {
  color: var(--ink-35);
}
.ledger-destiny-row {
  cursor: pointer;
}
.ledger-destiny-row:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
  border-radius: 4px;
}
.ledger-destiny-row > span {
  color: var(--theme-accent-text, var(--accent-strong));
}
.ledger-destiny-row em {
  border: 1px solid var(--theme-line, rgba(215, 137, 53, 0.28));
  border-radius: 4px;
  background: var(--theme-wash, rgba(215, 137, 53, 0.12));
  color: var(--ink);
}
.ledger-disc-option {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--cream);
  color: var(--ink-60);
  cursor: pointer;
}
.ledger-disc-option:has(input:checked) {
  border-color: var(--accent);
  background: var(--theme-wash, rgba(215, 137, 53, 0.12));
  color: var(--ink);
}
.ledger-disc-option.c-gold {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.55));
  background: var(--theme-wash, rgba(215, 137, 53, 0.1));
  color: var(--theme-accent-text, #8a5a1f);
}
.ledger-disc-option.c-gold:has(input:checked) {
  border-color: var(--theme-line, #b06f24);
  background: var(--accent);
  color: var(--on-strong);
}
.ledger-disc-option.c-gold input {
  accent-color: #b06f24;
}
.ledger-disc-option.c-purple {
  border-color: var(--theme-purple-line, rgba(151, 130, 199, 0.62));
  background: var(--theme-purple-wash, rgba(151, 130, 199, 0.16));
  color: var(--theme-purple-text, #6d56a0);
}
.ledger-disc-option.c-purple:has(input:checked) {
  border-color: var(--theme-purple-line, #7a62ab);
  background: var(--theme-purple-bg, #8a72bd);
  color: var(--on-strong);
}
.ledger-disc-option.c-purple input {
  accent-color: #8a72bd;
}
.ledger-disc-option.c-blue {
  border-color: var(--theme-info-line, rgba(110, 135, 184, 0.6));
  background: var(--theme-info-wash, rgba(110, 135, 184, 0.16));
  color: var(--theme-info-text, #4f6387);
}
.ledger-disc-option.c-blue:has(input:checked) {
  border-color: var(--theme-info-line, #5f76a4);
  background: var(--theme-info-bg, #6e87b8);
  color: var(--on-strong);
}
.ledger-disc-option.c-blue input {
  accent-color: #6e87b8;
}
.ledger-disc-option input {
  accent-color: var(--accent);
}
.disc-term,
.disc-term-label {
  cursor: help;
}
.disc-term:focus-visible,
.disc-term-label:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.disc-floating-tooltip {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--tea);
  color: var(--on-strong);
  box-shadow: 0 10px 24px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.28);
  pointer-events: none;
  animation: disc-tooltip-in 0.14s ease both;
}
.disc-floating-tooltip::after {
  background: var(--tea);
  content: "";
}
.disc-floating-tooltip.is-top::after {
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.disc-floating-tooltip.is-bottom::after {
  border-left: 1px solid var(--line);
  border-top: 1px solid var(--line);
}
@keyframes disc-tooltip-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.ledger-destiny-row em.empty {
  border-style: dashed;
  background: transparent;
  color: var(--ink-35);
}
.ledger-destiny-row:nth-child(1) > span {
  color: var(--theme-accent-text, #a66c2b);
}
.ledger-destiny-row:nth-child(1) em {
  border-color: var(--theme-line, #e7c89c);
  background: var(--theme-surface, #faf1e4);
}
.ledger-destiny-row:nth-child(1) em.empty {
  border-color: var(--theme-line, #e7c89c);
  background: transparent;
  color: var(--theme-accent-text, #a66c2b);
}
.ledger-destiny-row:nth-child(2) > span {
  color: var(--theme-muted, #7e7a72);
}
.ledger-destiny-row:nth-child(2) em {
  border-color: var(--theme-line, #d8d3cb);
  background: var(--theme-surface, #f5f2ed);
  color: var(--theme-muted, #7e7a72);
}
.ledger-destiny-row:nth-child(2) em.empty {
  border-color: var(--theme-line, #d8d3cb);
  background: transparent;
  color: var(--theme-muted, #7e7a72);
}
.ledger-stones > .stone-slot {
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.ledger-stones > .stone-slot:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--cream);
}
.ledger-stones > .stone-slot.is-empty {
  background: transparent;
  color: var(--line);
}
.ledger-stones strong {
  color: var(--ink);
}
.ledger-stones small {
  color: var(--ink-60);
}
.ledger-card-footer textarea {
  border: 0;
  border-bottom: 1px dashed var(--line);
  outline: none;
  background: transparent;
  color: var(--ink);
}
.ledger-card-footer textarea:focus {
  border-bottom-color: var(--theme-focus, var(--accent));
}
.ledger-card-footer textarea::placeholder {
  color: var(--ink-35);
}
.growth-remark-error, .growth-remark-notice { color: var(--ink-60); }
.growth-remark-error { color: var(--theme-danger-text, var(--rouge)); }
.ledger-inline-input {
  cursor: text;
  -moz-appearance: textfield;
}
.ledger-inline-input::-webkit-outer-spin-button,
.ledger-inline-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.sr-only {
  border: 0;
}
.ledger-card-actions button {
  border-radius: 6px;
  cursor: pointer;
  transition:
    transform 0.16s cubic-bezier(0.22, 1, 0.36, 1),
    background-color 0.18s ease,
    border-color 0.18s ease,
    opacity 0.18s ease;
}
.ledger-card-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ledger-card-cancel {
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink-60);
}
.ledger-card-cancel:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--ink);
}
.ledger-card-save {
  border: 1px solid var(--tea);
  background: var(--tea);
  color: var(--on-strong);
}
.ledger-card-save:hover:not(:disabled) {
  border-color: var(--accent);
  background: var(--accent);
}
.ledger-material-list span {
  border: 1px solid var(--theme-line, rgba(73, 59, 44, 0.12));
  border-radius: 4px;
  background: var(--cream);
  color: var(--ink);
}
.ledger-material-list span.is-lack {
  border-color: var(--theme-danger-line, rgba(166, 81, 74, 0.35));
  background: var(--theme-danger-wash, rgba(240, 207, 200, 0.35));
  color: var(--theme-danger-text, var(--rouge));
}
.ledger-material-list small {
  color: var(--ink-60);
}
.ledger-material-list .is-lack small {
  color: var(--theme-danger-text, var(--rouge));
}
.ledger-material-list em {
  color: var(--ink-35);
}
.ledger-popover-state {
  border: 1px dashed var(--line);
  border-radius: 7px;
  color: var(--ink-60);
}
.ledger-popover-state.is-error {
  border-color: var(--theme-danger-line, rgba(166, 81, 74, 0.35));
  background: var(--theme-danger-wash, rgba(240, 207, 200, 0.24));
  color: var(--theme-danger-text, var(--rouge));
}
.ledger-upgrade-summary {
  color: var(--ink-60);
}
.ledger-popover-blocked {
  color: var(--theme-danger-text, var(--rouge));
}
.ledger-popover-actions .cancel {
  background: var(--paper);
  color: var(--ink-60);
}
.ledger-step-actions button.is-ready,
.ledger-smart-action.is-ready,
.ledger-next-action.is-ready {
  border-color: var(--theme-success-line, #c9d8c5);
  background: var(--theme-success-bg, #eef5ec);
  color: var(--theme-muted, #6f846b);
}
.ledger-step-actions button.is-lack,
.ledger-smart-action.is-lack,
.ledger-next-action.is-lack {
  border-color: var(--theme-line, #e4c49c);
  background: var(--theme-surface, #fbf1e3);
  color: var(--theme-accent-text, #a66f2e);
}
.ledger-step-actions button.is-complete,
.ledger-smart-action:disabled {
  border-color: var(--line);
  background: var(--theme-wash, rgba(73, 59, 44, 0.08));
  color: var(--ink-60);
  opacity: 0.72;
  cursor: default;
}
.ledger-star-controls select {
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--cream);
  color: var(--ink);
  outline: none;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--ink-60) 50%),
    linear-gradient(135deg, var(--ink-60) 50%, transparent 50%);
  background-position:
    calc(100% - 13px) 18px,
    calc(100% - 8px) 18px;
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
}
.ledger-star-controls select:focus {
  border-color: var(--theme-focus, var(--accent));
  box-shadow: 0 0 0 2px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.12);
}
.ledger-submit-overlay {
  border-radius: inherit;
  background: var(--theme-surface, rgba(255, 253, 246, 0.74));
  backdrop-filter: blur(3px);
  opacity: 1;
  pointer-events: auto;
  transition: opacity 0.18s ease;
}
.ledger-submit-message {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--theme-surface, rgba(255, 255, 255, 0.9));
  box-shadow: 0 12px 30px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.16);
  animation: ledger-submit-enter 0.2s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes ledger-submit-enter {
  to {
    transform: none;
  }
}
.ledger-submit-icon {
  border-radius: 50%;
  background: var(--blue-soft);
  color: var(--theme-info-text, var(--brand-blue));
}
.ledger-submit-overlay.success .ledger-submit-icon {
  background: var(--theme-success-bg, #e8f4e9);
  color: var(--theme-success-text, #4f8758);
  border: 1px solid var(--theme-success-line, rgba(111, 159, 118, 0.35));
}
.ledger-submit-overlay.error .ledger-submit-icon {
  background: var(--theme-danger-wash, rgba(240, 207, 200, 0.42));
  color: var(--theme-danger-text, var(--rouge));
  border: 1px solid var(--theme-danger-line, rgba(166, 81, 74, 0.35));
}
.ledger-submit-message strong {
  color: var(--ink);
}
.ledger-submit-message p {
  color: var(--ink-60);
}
.ledger-submit-spinner {
  border: 2px solid var(--theme-info-line, rgba(91, 106, 140, 0.22));
  border-top-color: var(--brand-blue);
  border-radius: 50%;
  animation: ledger-submit-spin 0.8s linear infinite;
}
@keyframes ledger-submit-spin {
  to {
    transform: rotate(360deg);
  }
}
.ledger-submit-actions button {
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--paper);
  color: var(--ink-60);
  cursor: pointer;
}
.ledger-submit-actions .ledger-card-save {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--on-strong);
}
.agent-ledger-card.is-draft {
  box-shadow:
    0 10px 28px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.2),
    inset 0 0 0 1px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.18);
}
.agent-ledger-card.is-submit-success {
  box-shadow:
    0 12px 30px rgba(111, 159, 118, 0.2),
    inset 0 0 0 1px rgba(111, 159, 118, 0.2);
}
.ledger-full-edit {
  border: 0;
  border-radius: 6px;
  background: var(--theme-control-bg, var(--ink));
  color: var(--on-strong);
  cursor: pointer;
}
.ledger-full-edit:hover {
  background: var(--accent);
}
.ledger-notice {
  color: var(--theme-accent-text, var(--accent-strong));
}
.bp-head {
  border-bottom: 1.5px dashed var(--line);
}
.bp-tip {
  color: var(--ink-60);
}
.bp-tip code {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 6px;
  color: var(--ink-60);
}
.bp-num {
  color: var(--theme-accent-text, var(--accent-strong));
}
.slot-tag {
  color: var(--ink-60);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
}
.slot-tag.star.s5 {
  background: var(--yellow);
  border-color: transparent;
  color: var(--ink);
}
.slot-tag.star.s4 {
  background: transparent;
  border: 1.5px solid var(--theme-info-line, rgba(91, 106, 140, 0.45));
  color: var(--theme-info-text, var(--slate-deep));
}
.slot-tag.star.s3 {
  background: transparent;
  border: 1.5px solid var(--line);
  color: var(--ink-60);
}
.slot.is-missing .slot-ic {
  border-style: dashed;
}
.slot.is-missing .slot-avatar,
.slot.is-missing .slot-ph {
  opacity: 0.65;
}
.slot.is-missing:hover .slot-avatar,
.slot.is-missing:hover .slot-ph {
  opacity: 0.8;
}
.slot.is-missing .slot-name {
  color: var(--ink-60);
}
.slot.is-missing:hover .slot-name {
  color: var(--ink-60);
}

.build-slot .build-line {
  color: var(--ink-60);
}
.build-slot .build-line.small {
  color: var(--ink-35);
}
.build-row {
  border-bottom: 1px solid var(--line);
  transition: background-color 0.2s var(--ease);
}
.build-row:last-child {
  border-bottom: 0;
}
.build-row:hover {
  background: var(--cream);
}
.build-avatar {
  border: 2px solid var(--line);
  border-radius: 8px;
  background: var(--cream);
  color: var(--ink-35);
}
.build-avatar.rarity-r5 {
  border-color: var(--accent);
}
.build-avatar.rarity-r4 {
  border-color: var(--brand-blue);
}
.build-identity strong {
  color: var(--ink);
}
.build-identity span {
  color: var(--ink-60);
}
.build-stat dt {
  color: var(--ink-35);
}
.build-stat dd {
  color: var(--ink);
}
.build-loadouts {
  color: var(--ink-60);
}
.build-loadouts .combat-stale {
  color: var(--theme-danger-text, var(--rouge));
}
.build-edit {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-strong-text, var(--tea));
  cursor: pointer;
}
.build-edit:hover {
  background: var(--yellow);
  color: var(--ink);
}
.build-edit:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}

/* ---- 单个密探编辑弹窗 ---- */
.editor-mask {
  background: var(--theme-overlay, rgba(73, 59, 44, 0.42));
  backdrop-filter: blur(4px);
  pointer-events: auto;
}
.editor-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
  box-shadow: 0 40px 100px -30px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.5);
  pointer-events: auto;
}
.editor-head {
  border-bottom: 1.5px dashed var(--line);
  background: var(--surface);
}
.editor-kicker {
  color: var(--theme-accent-text, var(--accent-strong));
}
.editor-kicker-account {
  border-left: 1px solid var(--line);
  color: var(--ink-60);
}
.editor-head h3 {
  color: var(--ink);
}
.editor-identity-tag {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper);
  color: var(--ink-60);
}
.editor-identity-tag.rarity {
  border-color: var(--yellow-deep);
  background: var(--yellow);
  color: var(--ink);
}
.editor-identity-tag.profession {
  background: transparent;
  color: var(--theme-strong-text, var(--tea));
}
.editor-identity-tag.stale {
  border-color: var(--theme-danger-line, rgba(166, 81, 74, 0.45));
  background: var(--theme-danger-wash, rgba(166, 81, 74, 0.12));
  color: var(--theme-danger-text, var(--rouge));
}
.editor-head-stats-note {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--cream);
  color: var(--ink-35);
}
.editor-head-stats-note::before {
  border-radius: 50%;
  background: var(--accent);
  content: "";
}
.editor-head-stat {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: linear-gradient(145deg, var(--cream), var(--paper));
  cursor: text;
  transition:
    border-color 0.2s,
    background-color 0.2s,
    box-shadow 0.2s;
}
.editor-head-stat::after {
  background: var(--theme-wash-strong, rgba(215, 137, 53, 0.3));
  content: "";
  transition: transform 0.2s;
}
.editor-head-stat:hover {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.58));
}
.editor-head-stat:focus-within {
  border-color: var(--theme-focus, var(--accent));
  background: var(--cream);
  box-shadow: 0 0 0 2px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.12);
}
.editor-head-stat-meta strong {
  color: var(--ink-60);
}
.editor-head-stat small {
  border-radius: 999px;
  background: var(--theme-wash, rgba(73, 59, 44, 0.07));
  color: var(--ink-35);
}
.editor-head-stat.is-manual small {
  background: var(--theme-wash, rgba(215, 137, 53, 0.13));
  color: var(--theme-accent-text, var(--accent-strong));
}
.manual-restore {
  border: 1px solid var(--theme-line, rgba(215, 137, 53, 0.38));
  border-radius: 50%;
  background: transparent;
  color: var(--theme-accent-text, var(--accent-strong));
  cursor: pointer;
}
.manual-restore:hover {
  border-color: var(--accent);
  background: var(--yellow);
}
.manual-restore:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.editor-head-stat input {
  border: 0;
  outline: none;
  background: transparent;
  color: var(--theme-accent-text, var(--accent-strong));
  -moz-appearance: textfield;
}
.editor-head-stat input::placeholder {
  color: var(--theme-accent-text, var(--accent-strong));
  opacity: 1;
}
.editor-head-stat.is-empty input::placeholder {
  color: var(--ink-35);
}
.editor-head-stat input:focus::placeholder {
  color: transparent;
  opacity: 0;
}
.editor-head-stat input:focus-visible {
  outline: none;
}
.editor-head-stat input::-webkit-outer-spin-button,
.editor-head-stat input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.editor-close {
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
  transition:
    color 0.25s,
    background-color 0.25s;
}
.editor-close:hover {
  color: var(--theme-danger-text, var(--rouge));
  background: var(--theme-danger-wash, rgba(166, 81, 74, 0.08));
}
.editor-close:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.editor-row {
  border-bottom: 1px solid var(--line);
}
.editor-row:last-child {
  border-bottom: 0;
}
.editor-label {
  color: var(--theme-strong-text, var(--tea));
}
.game-pill {
  cursor: pointer;
  color: var(--ink-60);
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  transition: all 0.25s;
}
.game-pill:has(input:checked) {
  background: var(--yellow);
  border-color: var(--yellow-deep);
  color: var(--ink);
}
.editor-game .hint {
  color: var(--ink-35);
}
.num-fields .level-row > label {
  color: var(--ink-60);
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 12px;
}
.num-fields .level-row > label input {
  border: none;
  background: transparent;
  color: var(--ink);
  outline: none;
  -moz-appearance: textfield;
}
.num-fields .level-row > label input::-webkit-outer-spin-button,
.num-fields .level-row > label input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.num-fields .star-card {
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 12px;
}
.star-awakening-hint {
  color: var(--ink-60);
}
.star-caption {
  color: var(--ink);
}
.star-pill {
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.25s;
}
.star-pill:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.star-pill.on {
  background: var(--yellow);
  border-color: var(--yellow-deep);
  color: var(--ink);
}
.editor-awakening {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--line);
  color: var(--ink);
  font: 800 14px var(--font-b);
}
.editor-awakening-switch {
  display: inline-flex;
  flex-direction: row-reverse;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-width: 80px;
  min-height: 32px;
  padding: 3px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--cream);
  color: var(--ink-60);
  font: 700 12px var(--font-b);
  cursor: pointer;
}
.editor-awakening-thumb {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--line);
}
.editor-awakening-switch:focus-visible {
  outline: 2px solid var(--theme-focus, var(--tea));
  outline-offset: 2px;
}
.editor-awakening-switch:disabled {
  border-color: var(--line);
  color: var(--ink-60);
  cursor: not-allowed;
  opacity: 0.55;
}
.editor-awakening-switch.on {
  flex-direction: row;
  background: var(--accent-strong);
  border-color: var(--accent-strong);
  color: var(--on-strong);
}
.node-chip {
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s;
}
.node-chip:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.node-chip.on {
  background: var(--yellow);
  border-color: var(--yellow-deep);
  color: var(--ink);
}
.num-fields .elite-hint {
  color: var(--ink-35);
}
.oddity-editor {
  border-top: 1px dashed var(--line);
}
.oddity-hint {
  color: var(--ink-60);
}
.oddity-error {
  color: var(--theme-danger-text, var(--rouge));
}
.oddity-control input[aria-invalid="true"] {
  border-color: var(--rouge);
}
.oddity-caption {
  color: var(--ink-60);
}
.oddity-caption small {
  color: var(--theme-danger-text, var(--rouge));
}
.oddity-field {
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--cream);
}
.oddity-name {
  color: var(--ink);
}
.oddity-control input {
  border: 1px solid var(--line);
  border-radius: 7px;
  outline: none;
  background: var(--surface);
  color: var(--ink);
  -moz-appearance: textfield;
}
.oddity-control input::-webkit-outer-spin-button,
.oddity-control input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}
.oddity-control input:focus {
  border-color: var(--theme-focus, var(--accent));
}
.oddity-control input:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.oddity-limit {
  color: var(--ink-35);
}
.disc-loadout-tabs {
  border-radius: 8px;
  background: var(--theme-wash, rgba(73, 59, 44, 0.07));
}
.disc-loadout-tabs button {
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
}
.disc-loadout-tabs button > span {
  color: var(--ink-35);
}
.disc-loadout-tabs button > strong {
  color: inherit;
}
.disc-loadout-tabs button > small {
  color: var(--theme-accent-text, var(--accent-strong));
}
.disc-loadout-tabs button:hover {
  color: var(--ink);
}
.disc-loadout-tabs button.on {
  border-color: var(--line);
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 2px 8px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.08);
}
.disc-loadout-tabs button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.disc-loadout-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--cream);
}
.disc-loadout-toolbar {
  border-bottom: 1px dashed var(--line);
}
.disc-loadout-name {
  color: var(--ink-60);
}
.disc-loadout-name input {
  border: 1.5px solid var(--line);
  border-radius: 7px;
  outline: none;
  background: var(--surface);
  color: var(--ink);
}
.disc-loadout-name input:focus {
  border-color: var(--theme-focus, var(--accent));
}
.disc-auto-name {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-60);
}
.disc-auto-name {
  cursor: pointer;
}
.disc-auto-name:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
}
.disc-auto-name:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.disc-auto-status {
  border-radius: 999px;
  background: var(--theme-wash, rgba(215, 137, 53, 0.12));
  color: var(--theme-accent-text, var(--accent-strong));
}
.disc-options-head {
  color: var(--ink-60);
}
.disc-options-head strong {
  color: var(--theme-accent-text, var(--accent-strong));
}
.disc-options .hint {
  color: var(--ink-35);
}
.disc-storage-note {
  color: var(--ink-35);
}
.disc-option {
  color: var(--ink-60);
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.25s;
  user-select: none;
}
.disc-option:has(input:focus-visible) {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.disc-option.on {
  background: var(--yellow);
  border-color: var(--yellow-deep);
  color: var(--ink);
}
.editor-workspace .disc-option {
  position: relative;
  transition: color .2s, background-color .2s, border-color .2s;
}
.editor-workspace .disc-options .disc-option { padding-inline-start: 30px; }
.disc-selected-check {
  position: absolute;
  left: 8px;
  color: inherit;
  pointer-events: none;
}
.editor-workspace .disc-option .disc-name {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
/* 命盘品级色：金 / 紫 / 蓝（未选中=淡色底，选中=实色） */
.disc-option.c-gold {
  background: var(--theme-wash, rgba(215, 137, 53, 0.14));
  border-color: var(--theme-line, rgba(215, 137, 53, 0.55));
  color: var(--theme-accent-text, #8a5a1f);
}
.disc-option.c-gold.on {
  background: var(--accent);
  border-color: var(--theme-line, #b06f24);
  color: var(--on-strong);
}
.disc-option.c-purple {
  background: var(--theme-purple-wash, rgba(151, 130, 199, 0.16));
  border-color: var(--theme-purple-line, rgba(151, 130, 199, 0.62));
  color: var(--theme-purple-text, #6d56a0);
}
.disc-option.c-purple.on {
  background: var(--theme-purple-bg, #8a72bd);
  border-color: var(--theme-purple-line, #7a62ab);
  color: var(--on-strong);
}
.disc-option.c-blue {
  background: var(--theme-info-wash, rgba(110, 135, 184, 0.16));
  border-color: var(--theme-info-line, rgba(110, 135, 184, 0.6));
  color: var(--theme-info-text, #4f6387);
}
.disc-option.c-blue.on {
  background: var(--theme-info-bg, #6e87b8);
  border-color: var(--theme-info-line, #5f76a4);
  color: var(--on-strong);
}
.stone-presets {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--cream);
}
.stone-preset-heading strong {
  color: var(--ink);
}
.stone-preset-heading span {
  color: var(--ink-35);
}
.stone-preset-item label {
  color: var(--ink-60);
}
.stone-preset-item select {
  border: 1.5px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink);
  outline: none;
}
.stone-preset-item select:focus {
  border-color: var(--theme-focus, var(--accent));
}
.stone-preset-item select:disabled {
  color: var(--ink-35);
  cursor: not-allowed;
  opacity: 0.8;
}
.stone-preset-load {
  border: 1px solid var(--tea);
  border-radius: 7px;
  background: var(--tea);
  color: var(--on-strong);
  cursor: pointer;
}
.stone-preset-load:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
}
.stone-preset-load:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stone-item {
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 10px;
}
.stone-name {
  color: var(--ink);
}
.stone-current {
  color: var(--theme-accent-text, var(--accent-strong));
}
.stone-remove {
  border: 1px solid var(--theme-danger-line, rgba(166, 81, 74, 0.35));
  border-radius: 7px;
  background: transparent;
  color: var(--theme-danger-text, var(--rouge));
  cursor: pointer;
}
.stone-remove:hover {
  background: var(--theme-danger-wash, rgba(166, 81, 74, 0.12));
}
.stone-remove:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.stone-select {
  border: 1.5px solid var(--line);
  border-radius: 8px;
  color: var(--ink);
  background: var(--surface);
  outline: none;
  cursor: pointer;
}
.stone-select:focus {
  border-color: var(--theme-focus, var(--accent));
}
.stone-level-field {
  color: var(--ink-60);
}
.stone-item input {
  border: 1.5px solid var(--line);
  border-radius: 7px;
  color: var(--ink);
  background: var(--surface);
  outline: none;
  -moz-appearance: textfield;
}
.stone-item input:focus {
  border-color: var(--theme-focus, var(--accent));
}
.stone-quick {
  border-radius: 8px;
  background: var(--theme-wash, rgba(73, 59, 44, 0.06));
}
.stone-quick > span {
  color: var(--ink-35);
}
.stone-lv-chip {
  border: 0;
  background: transparent;
  color: var(--ink-60);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.25s;
}
.stone-lv-chip:hover {
  background: var(--surface);
  color: var(--theme-accent-text, var(--accent-strong));
}
.stone-lv-chip.on {
  background: var(--yellow);
  color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--yellow-deep);
}
.stone-editor .hint {
  color: var(--ink-35);
}
.editor-actions {
  border-top: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 -8px 18px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.06);
}
.editor-conflict {
  border: 1px solid var(--theme-danger-line, rgba(166, 81, 74, 0.36));
  border-radius: 9px;
  background: var(--theme-danger-wash, rgba(166, 81, 74, 0.09));
  color: var(--theme-danger-text, var(--rouge));
}
.editor-conflict-btn {
  border: 1px solid var(--theme-danger-line, rgba(166, 81, 74, 0.35));
  border-radius: 6px;
  background: var(--surface);
  color: var(--theme-danger-text, var(--rouge));
  cursor: pointer;
}
.editor-conflict-btn.primary {
  background: var(--rouge);
  color: var(--on-strong);
}
.editor-conflict-btn:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.editor-action-status {
  border-radius: 9px;
  background: var(--yellow);
  color: var(--ink);
}
.editor-action-status.err {
  background: var(--theme-danger-wash, rgba(166, 81, 74, 0.14));
  color: var(--theme-danger-text, var(--rouge));
}
.editor-action-status.is-idle {
  background: transparent;
  color: var(--ink-60);
  font-weight: 500;
}
.editor-cancel {
  border: 0;
  background: transparent;
  color: var(--ink-60);
}
.editor-cancel:hover:not(:disabled) {
  background: var(--paper);
  color: var(--ink);
}
.editor-save {
  border-radius: 10px;
}
.editor-save:disabled {
  border-color: var(--line);
  background: var(--line);
  color: var(--ink-60);
  box-shadow: none;
  cursor: not-allowed;
}

.edit-btn {
  border: 1.5px solid var(--line);
  background: var(--paper);
  color: var(--ink-60);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.25s;
}
.edit-btn:hover {
  border-color: var(--accent);
  color: var(--theme-accent-text, var(--accent-strong));
  background: var(--cream);
}

/* 深色块上的文字（未登录提示） */
.hero-stats div.is-authed .v small a {
  color: var(--on-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 1080px) {
  .operator-mobile-tabs {
    border-top: 1px solid var(--line);
    background: var(--theme-surface, rgba(255, 248, 236, 0.96));
    box-shadow: 0 -10px 26px -18px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.48);
    backdrop-filter: blur(12px);
  }
  .operator-mobile-tabs button {
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--ink-60);
    cursor: pointer;
  }
  .operator-mobile-tabs button.on {
    background: var(--yellow);
    color: var(--ink);
  }
  .operator-mobile-tabs button:focus-visible {
    outline: 3px solid var(--theme-line, rgba(215, 137, 53, 0.55));
    outline-offset: 1px;
  }
}

@media (max-width: 640px) {
  .current-workbench-head {
    border-radius: 16px 16px 9px 9px;
  }
  .catalog-prof-filter .mf-filter button {
    border-radius: 6px;
  }
  .current-prof-filter .mf-filter button {
    border-radius: 6px;
  }
  .current-ledger {
    border-radius: 16px;
  }
  .ledger-mobile-prof {
    color: var(--ink-60);
  }
  .editor-panel {
    border: 0;
    border-radius: 0;
  }
  .disc-auto-name {
    border-width: 0 0 0 1px;
    border-radius: 0 7px 7px 0;
    background: transparent;
  }
  .stone-quick {
    background: transparent;
  }
  .stone-lv-chip {
    border: 1px solid var(--line);
    background: var(--cream);
  }
  .import-box {
    border-radius: 14px;
  }
  .backpack {
    border-radius: 20px;
  }
}

/* 手机端养成卡片与编辑器的最后一层收口：窄屏不挤压文字，也不让弹层溢出视口。 */

@media (max-width: 420px) {
  .stone-quick {
    background: transparent;
  }
}
@media (max-width: 1080px) {
  .page-operator :deep(.workspace-summary) { background: var(--cream); }
  .page-operator :deep(.workspace-toggle) { background: var(--surface); border: 1px solid var(--line); border-radius: 11px; color: var(--theme-strong-text, var(--tea)); }
  .page-operator .workspace-mobile-link { border: 1px solid var(--line); border-radius: 11px; background: var(--surface); color: var(--ink-60); text-decoration: none; }
  .page-operator .workspace-mobile-link:hover { color: var(--ink); border-color: var(--accent); background: var(--paper); text-decoration: none; }
  .page-operator .workspace-mobile-link:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
}

@media (min-width: 1081px) {
  .operator-account-workspace :deep(.workspace-panels) { border-top: 0; }
  .operator-tabs .workspace-tabs-toggle:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
}
.ledger-status-help { color: var(--ink-60); }
.agent-ledger-card.status-discarded { border-left: 3px dashed var(--tea); }
.ledger-status-menu.status-discarded .ledger-status-button { background: var(--cream); color: var(--theme-strong-text, var(--tea)); border: 1px dashed var(--tea); }
.batch-status-action.discarded { border: 1px dashed var(--tea); background: var(--cream); color: var(--theme-strong-text, var(--tea)); }
.current-status-index > .status-discarded::before { background: var(--tea); }

.ledger-disc-target-summary { display: flex; align-items: center; gap: 3px; grid-column: 1 / -1; justify-self: start; width: fit-content; max-width: 100%; min-width: 0; box-sizing: border-box; margin: 0; padding: 2px 3px; border: 1px solid color-mix(in srgb, var(--line) 60%, transparent); border-radius: 5px; background: var(--cream); color: var(--theme-strong-text, var(--tea)); font: 600 11px/1.4 var(--font-b); text-align: left; white-space: nowrap; cursor: pointer; }
.ledger-disc-target-summary:hover { border-color: var(--line); background: var(--surface); }
.ledger-disc-target-summary:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.ledger-disc-target-state { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }
.ledger-disc-target-state + .ledger-disc-target-state { padding-left: 3px; border-left: 1px solid var(--line); }
.ledger-disc-target-state.is-perfect { color: var(--theme-text, #52694e); }
.ledger-disc-target-state.is-reroll { color: var(--theme-accent-text, var(--accent-strong)); }
.ledger-disc-target-state > svg, .ledger-disc-target-arrow { flex: none; }
.ledger-disc-target-state > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ledger-disc-target-arrow { color: var(--ink-35); }
.ledger-disc-target-state + .ledger-disc-target-state + .ledger-disc-target-arrow { display: none; }
.ledger-disc-target-summary ~ .ledger-stones > .stone-slot.is-empty:not(:hover):not(:focus-visible) { border-color: color-mix(in srgb, var(--line) 65%, transparent); }
.editor-workspace .disc-editor-row { font-family: var(--font-b); }
.editor-workspace .disc-loadout-toolbar { border: 0; }
.disc-auto-toggle { display: inline-flex; position: relative; align-items: center; gap: 8px; color: var(--theme-strong-text, var(--tea)); font-size: 13px; cursor: pointer; white-space: nowrap; }
.disc-auto-toggle input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.disc-toggle-track { width: 34px; height: 20px; padding: 3px; box-sizing: border-box; border-radius: 12px; background: var(--ink-60); }
.disc-toggle-track::after { content: ''; display: block; width: 14px; height: 14px; border-radius: 50%; background: var(--surface); }
.disc-auto-toggle input:checked + .disc-toggle-track { background: var(--accent-strong); }
.disc-auto-toggle input:checked + .disc-toggle-track::after { transform: translateX(14px); }
.disc-auto-toggle input:focus-visible + .disc-toggle-track { outline: 2px solid var(--accent-strong); outline-offset: 3px; }
.disc-status-field, .disc-status-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.disc-status-field { color: var(--ink); font-size: 13px; font-weight: 600; }
.disc-status-controls button, .disc-edit-action { padding: 7px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--theme-strong-text, var(--tea)); font: 600 12px var(--font-b); cursor: pointer; }
.disc-status-controls button.on, .disc-edit-action[aria-pressed="true"] { border-color: var(--accent); background: var(--cream); color: var(--theme-accent-text, var(--accent-strong)); }
.disc-status-controls button:focus-visible, .disc-edit-action:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.disc-editor-comparison :deep(.disc-comparison-arrow) { display: none; }
.disc-editor-comparison :deep(.disc-comparison-side:has([aria-pressed="true"])) { border-color: var(--accent); background: var(--cream); }
.disc-editor-comparison :deep(.disc-comparison-term) { border-radius: 7px; }
.disc-editing-workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin-top: 14px; }
.editor-workspace .disc-editing-workspace .disc-options, .disc-editing-workspace :deep(.disc-presets) { display: block; margin: 0; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; box-sizing: border-box; }
.editor-workspace .disc-options-head { gap: 8px; flex-wrap: wrap; color: var(--ink); }
.disc-options-head h5 { margin: 0; font: inherit; }
.disc-options-help { margin: 6px 0 12px; font-size: 12px; color: var(--ink-60); line-height: 1.5; }
.disc-options-grid > .hint { grid-column: 1 / -1; }
.disc-options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr)); gap: 8px; }
.editor-workspace .disc-options-grid .disc-option { min-height: 40px; padding: 8px 10px 8px 30px; border-radius: 8px; }
.editor-workspace .disc-options-grid .disc-option.on { border-color: currentColor; box-shadow: inset 0 0 0 1px currentColor; }
.editor-workspace .disc-options-grid .disc-option.c-gold.on { color: var(--theme-accent-text, #8a5a1f); background: var(--cream); }
.editor-workspace .disc-options-grid .disc-option.c-purple.on { color: var(--theme-purple-text, #6d56a0); background: var(--theme-purple-wash, rgba(151, 130, 199, .16)); }
.editor-workspace .disc-options-grid .disc-option.c-blue.on { color: var(--theme-info-text, #4f6387); background: var(--theme-info-wash, rgba(110, 135, 184, .16)); }
.disc-editing-workspace :deep(.disc-preset-action) { padding: 5px 8px; border: 1px solid var(--line); border-radius: 5px; }
.disc-editing-workspace :deep(.disc-preset) { padding: 9px; gap: 8px; }
.disc-editing-workspace :deep(.disc-preset-terms) { gap: 3px 8px; }
@media (max-width: 640px) {
  :is(.agent-ledger-card--v2, .agent-ledger-card--v3) .ledger-loadouts > .ledger-disc-target-summary { grid-row: 3; }
}
/* Page owns metadata and filters; cards retain their existing presentation. */
.roster-header .btn { border-radius: 10px; text-decoration: none; }
.roster-header .roster-share small { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 600; }
.roster-share small::before { content: ''; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--ink-60); }
.roster-share small.is-sharing::before { background: var(--theme-success-bg, #6f9f76); box-shadow: 0 0 0 3px rgba(111, 159, 118, .14); }
.current-workbench-summary { border-bottom: 1px solid var(--line); }
.panel > .catalog-tools ~ .backpack > .tool-task-prompt { border: 0; background: transparent; }
.catalog-version-copy { color: var(--ink-60); }
</style>
<style scoped src="./operatorPortraitGrid.css"></style>
<style scoped src="./operatorWorkspaceDesktop.css"></style>
<style scoped src="./operatorWorkspaceMobile.css"></style>
<style scoped src="./operatorEditorDesktop.css"></style>
<style scoped src="./operatorEditorMobile.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1Mobile.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2Mobile.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3Mobile.css"></style>
