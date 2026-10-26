<template>
  <InventoryLayout>
      <CompactToolHeader class="inventory-header" title="库存" description="看总览，也能轻松记录">
        <template #account>
          <DataAccountContextBar compact :accounts="accounts" :account-id="accountId" :game="agentGameFilter"
            :is-logged-in="auth.isLoggedIn" :loading="accountsLoading" :error="accountError" :before-switch="beforeAccountSwitch"
            :switch-disabled="dailyBusy || drawResourceLocked || mailboxBusy || savingStock || !!pendingStockDocument || importing || rewardImportBusy || !!recordsBusyId" switch-disabled-reason="正在保存或确认入账，请处理完成后再切换账号。" />
        </template>
        <template #actions>
          <div class="inventory-actions">
            <button type="button" class="btn primary reward-entry" :disabled="rewardEntryDisabled || rewardImportBusy || dailyBusy || mailboxBusy"
              aria-haspopup="dialog" aria-controls="reward-entry-panel" :aria-expanded="!!rewardEntryWorkspace?.mode"
              @click="openRewardEntry('manual', $event.currentTarget)"><Plus :size="16" aria-hidden="true" />记一笔</button>
            <button type="button" class="btn ghost inventory-entry" :disabled="rewardEntryDisabled || stockActionBlocked" @click="openStockEntry"><Pencil :size="16" aria-hidden="true" />更新数量</button>
          </div>
          <TutorialEntry v-if="TUTORIALS_ENABLED" task="inventory-first-baseline" label="盘点教程" />
          <details class="tool-more">
            <summary aria-label="更多页面操作">更多</summary>
            <div class="tool-more-content" @click.capture="$event.currentTarget.parentElement.open = false; $event.currentTarget.parentElement.querySelector('summary').focus()">
              <button type="button" class="act-btn archive-toggle" :disabled="!auth.isLoggedIn || editingStock" :aria-expanded="showArchive" @click="toggleInventoryArchive">
                <Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起数据交换' : '数据交换' }}
              </button>
              <div class="tool-summary" aria-label="库存目录信息">
                <span>道具 <b>{{ itemCatalogCount }}</b> 种</span><span>心纸 <b>{{ agentGameCatalogCount }}</b> 种</span>
                <span>目录更新 <time :datetime="CATALOG_VERSION">{{ CATALOG_VERSION }}</time></span>
              </div>
            </div>
          </details>
        </template>
        <template #help>
          <p>按当前游戏账号清点道具与密探心纸，查看奖励统计和操作历史。顶部「记一笔」记录获得、符传使用与兑换，「更新数量」直接填写实际库存。可按分类编辑，或盘点全部道具建立完整库存基准；「更多」中可导入导出 v2 交换档案。</p>
        </template>
      </CompactToolHeader>

      <section>
        <div class="wrap">
          <OnboardingGuide v-if="TUTORIALS_ENABLED" :tasks="['inventory-first-baseline', 'today-first-data']" :target="editingStock ? '#inventory-tutorial-editor' : ''" />
          <ToolTaskPrompt v-if="!editingStock && inventoryPromptTitle" class="inventory-setup" :title="inventoryPromptTitle" :description="inventoryPromptDescription" :error="!!(error || accountError)">
            <router-link v-if="!auth.isLoggedIn" class="btn primary" :to="{ path: '/login', query: { redirect: '/inventory' } }">登录</router-link>
            <button v-else-if="accountError || error" class="btn primary" type="button" @click="accountError ? loadAccounts() : reloadCurrent()">重试</button>
            <router-link v-else-if="!inventoryAccountReady && !accountsLoading" class="btn primary" to="/user/profile#game-accounts">创建或选择账号</router-link>
            <template v-else-if="inventorySetupNeeded">
              <button class="btn primary inventory-entry" type="button" @click="openStockEntry">开始首次盘点</button>
            </template>
          </ToolTaskPrompt>

          <div v-if="inventoryAccountReady" class="inventory-quickbar">
            <RewardEntryWorkspace ref="dailyRewards" :key="'daily:' + (auth.userInfo?.id || '')" compact-daily
              :account-id="accountId" :account-name="currentAccountName" :game="agentGameFilter"
              :disabled="rewardEntryDisabled || rewardImportBusy || mailboxBusy || !!rewardEntryWorkspace?.mode"
              @busy="dailyBusy = $event" @imported="onRewardImported" />
            <MailboxReserve ref="mailboxReserve" :account-id="accountId" :user-id="String(auth.userInfo?.id || '')"
              :disabled="rewardEntryDisabled || rewardImportBusy || dailyBusy || !!rewardEntryWorkspace?.mode"
              @busy="mailboxBusy = $event" @recorded="onRewardImported" />
          </div>

          <RewardEntryWorkspace ref="rewardEntryWorkspace" :key="auth.userInfo?.id || ''" compact
            :account-id="accountId" :account-name="currentAccountName" :game="agentGameFilter"
            :disabled="rewardEntryDisabled || dailyBusy || mailboxBusy" :resource-busy="drawResourceLocked" :before-close="confirmDrawDraft"
            @busy="rewardImportBusy = $event" @imported="onRewardImported">
            <template #actions />
            <template #resource-entry="{ operation }">
              <DrawResourceEntry ref="drawResourceEntry" embedded :operation="operation" :account-id="accountId"
                :user-id="String(auth.userInfo?.id || '')" :game="agentGameFilter" :disabled="drawResourceDisabled"
                @busy="drawResourceLocked = $event" @recorded="onRewardImported" />
            </template>
          </RewardEntryWorkspace>

          <ArchiveExchangePanel
            v-if="showArchive && !editingStock"
            :description="'用于在不同平台之间迁移库存；导出前请确认账号范围。'"
            :import-open="showImport"
            :import-disabled="!auth.isLoggedIn || editingStock || drawResourceLocked"
            :export-disabled="!auth.isLoggedIn || !accountId"
            :scope="exportAll ? 'all' : 'current'"
            scope-name="inventory-export-scope"
            :scope-options="inventoryExportScopeOptions"
            @toggle-import="toggleInventoryImport"
            @update:scope="exportAll = $event === 'all'"
            @export="doExport"
          />

          <InventoryWorkspaceTabs
            :active-tab="activeTab" @select="setTab"
          />

          <!-- 导入档案 -->
          <div v-if="showArchive && !editingStock && showImport" class="import-box">
            <p id="inventory-import-tip" class="tip">
              粘贴符合《库存数据交换协议 v2》的 JSON
              文档，或选择文件上传；导入结果会在下方展示。
            </p>
            <textarea
              id="inventory-import-json"
              v-model="importText"
              aria-label="库存交换档案 JSON"
              :aria-invalid="!!importError"
              :aria-describedby="
                importError
                  ? 'inventory-import-tip inventory-import-error'
                  : 'inventory-import-tip'
              "
              autocomplete="off"
              placeholder='{"format":"myshare-inventory-exchange","version":2,"accounts":[{"id":"acc_xxx","name":"大号"}],"records":[]}'
              @input="importError = ''"
            ></textarea>
            <p
              v-if="importError"
              id="inventory-import-error"
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
                  accept=".json,application/json"
                  @change="onFilePick"
                />
              </label>
              <button
                class="btn ghost"
                :disabled="loadingExample"
                @click="fillExample"
              >
                {{ loadingExample ? "加载中…" : "示例导入" }}
              </button>
              <button
                class="btn primary"
                :disabled="importing || !importText.trim()"
                @click="doImport"
              >
                导入
              </button>
            </div>
            <div v-if="importResult" class="import-result">
              导入完成：接受 {{ importResult.accepted }} 条 · 重复
              {{ importResult.duplicates }} 条
              <span v-if="importResult.history_only">
                · 仅历史 {{ importResult.history_only }} 条</span
              >
              <span v-if="importResult.superseded">
                · 已归档 {{ importResult.superseded }} 条</span
              >
              <button class="ok" @click="afterImport">刷新库存</button>
            </div>
          </div>

          <!-- 追踪目录（YuanHub 当前支持的追踪范围，登录后叠加云端库存） -->
          <div
            id="inventory-panel-manifest"
            role="tabpanel"
            aria-labelledby="inventory-tab-manifest"
            tabindex="0"
            v-show="activeTab === 'manifest'"
            ref="manifestPanel"
            class="panel"
          >
            <div v-if="TUTORIALS_ENABLED && editingStock" id="inventory-tutorial-editor" />
            <div class="manifest-toolbar">
              <div
                class="type-switch manifest-type-switch"
                role="group"
                aria-label="库存类型"
              >
                <button
                  :disabled="editingStock"
                  :aria-pressed="entityType === 'item'"
                  :class="{ on: entityType === 'item' }"
                  aria-label="切换到背包道具"
                  @click="setEntityType('item')"
                >
                  <span class="manifest-type-label-full">背包道具</span>
                  <span class="manifest-type-label-compact" aria-hidden="true">道具</span>
                </button>
                <button
                  :disabled="editingStock"
                  :aria-pressed="entityType === 'agent'"
                  :class="{ on: entityType === 'agent' }"
                  aria-label="切换到密探心纸"
                  @click="setEntityType('agent')"
                >
                  <span class="manifest-type-label-full">密探心纸</span>
                  <span class="manifest-type-label-compact" aria-hidden="true">心纸</span>
                </button>
                <span class="sp"></span>
              </div>
              <div class="manifest-bar">
                <span class="manifest-bar-divider" aria-hidden="true"></span>
                <div v-if="entityType === 'agent'" class="manifest-bar-summary">
                  <div class="mf-stats">
                    <div class="mf-stat">
                      <b class="mf-num">{{ agentVersionFavoriteCount }}</b
                      ><span class="mf-k">特别关注</span>
                    </div>
                  </div>
                </div>
                <span class="manifest-bar-spacer" aria-hidden="true"></span>
                <div v-if="entityType === 'item'" class="manifest-item-tools">
                  <input
                    id="manifest-search"
                    v-model.trim="manifestSearch"
                    :disabled="editingStock"
                    name="manifest-search"
                    class="mf-search"
                    type="search"
                    aria-label="搜索库存名称或 ID"
                    placeholder="搜索名称 / id"
                  />
                  <div class="mf-filter">
                    <button
                      :disabled="editingStock"
                      :aria-pressed="manifestFilter === 'all'"
                      :class="{ on: manifestFilter === 'all' }"
                      @click="manifestFilter = 'all'"
                    >
                      全部
                    </button>
                    <button
                      :disabled="editingStock"
                      :aria-pressed="manifestFilter === 'owned'"
                      :class="{ on: manifestFilter === 'owned' }"
                      @click="manifestFilter = 'owned'"
                    >
                      已持有
                    </button>
                    <button
                      :disabled="editingStock"
                      :aria-pressed="manifestFilter === 'missing'"
                      :class="{ on: manifestFilter === 'missing' }"
                      @click="manifestFilter = 'missing'"
                    >
                      未持有
                    </button>
                  </div>
                </div>
                <div v-if="inventoryAccountReady" class="inventory-freshness" aria-label="当前库存类型的完整盘点时间" role="status">
                  <span class="freshness-label">最近完整盘点</span>
                  <span v-if="loading || currentLoadedContext !== stockContext">{{ error ? '读取失败' : '读取中…' }}</span>
                  <span v-else-if="error">读取失败</span>
                  <time v-else-if="currentFullBaselineAt" :datetime="currentFullBaselineAt">{{ fmtTime(currentFullBaselineAt) }}</time>
                  <span v-else>尚无完整盘点</span>
                </div>
                <span v-if="error" class="mf-sync-error" role="status"
                  >库存未能读取：{{ error }}。当前按 0 显示，不代表实际库存；请重试读取。</span
                >
              </div>
            </div>

            <div
              v-if="editingStock || stockSaveNotice"
              class="manifest-intro"
              :class="{ 'is-editing': editingStock }"
            >
              <aside
                class="manifest-scope"
                :class="{ 'is-editing': editingStock }"
              >
                <Pencil v-if="editingStock" :size="16" aria-hidden="true" />
                <Info v-else :size="16" aria-hidden="true" />
                <p v-if="editingStock">
                  正在编辑「{{ currentAccountName }}」的{{
                    stockEditScopeName
                      ? "「" + stockEditScopeName + "」库存"
                      : entityType === "agent"
                        ? "心纸库存"
                        : "道具库存"
                  }}
                  · 已修改
                  <b>{{ stockChangedCount }}</b> 项
                </p>
                <details v-if="editingStock" class="stock-edit-help">
                  <summary aria-label="库存编辑说明"><CircleHelp :size="16" aria-hidden="true" /></summary>
                  <p>{{ entityType === 'agent' ? '心纸背包顺序按绝密、机密、隐密排列，同阶级按编号从新到旧。' : '道具默认按游戏背包内顺序。' }}顶部更新数量维护当前类型；分类编辑只保存所选分类。未修改的既有数量保留。</p>
                </details>
                <div v-if="editingStock" class="manifest-edit-actions">
                  <label v-if="needsFullStockConfirmation" class="stock-baseline-confirmation">
                    <input
                      v-model="stockBaselineConfirmed"
                      type="checkbox"
                      :disabled="stockInputsLocked"
                    />
                    <span>我已核对全部{{ entityType === 'agent' ? '心纸' : '道具' }}库存，未填写项按 0 计；确认建立完整盘点基准</span>
                  </label>
                  <button
                    type="button"
                    :disabled="savingStock"
                    @click="requestCancelStockEdit"
                  >
                    <X :size="14" />取消
                  </button>
                  <button
                    type="button"
                    class="primary"
                    :disabled="!canSaveStock"
                    @click="saveStockEdit"
                  >
                    <Save :size="14" />{{
                      savingStock ? "保存中…" : pendingStockDocument ? "原样重试盘点" : stockChangedCount ? "保存库存" : "确认盘点"
                    }}
                  </button>
                </div>
                <span
                  v-if="stockSaveNotice && !editingStock"
                  class="stock-save-notice"
                  role="status"
                  aria-live="polite"
                  >{{ stockSaveNotice }}</span
                >
              </aside>
            </div>

            <div
              v-if="entityType === 'agent'"
              class="agent-controls"
              :class="{
                'is-editing': editingStock,
                'is-collapsed': agentControlsCollapsed,
              }"
              aria-label="密探清单工具"
            >
              <button
                type="button"
                class="agent-controls-toggle"
                :aria-expanded="!agentControlsCollapsed"
                :aria-label="agentControlsToggleLabel"
                :data-tooltip="agentControlsToggleLabel"
                @click="agentControlsCollapsed = !agentControlsCollapsed"
              >
                <ChevronLeft
                  v-if="editingStock && agentControlsCollapsed"
                  :size="17"
                  aria-hidden="true"
                />
                <ChevronRight
                  v-else-if="editingStock"
                  :size="17"
                  aria-hidden="true"
                />
                <ChevronDown
                  v-else-if="agentControlsCollapsed"
                  :size="17"
                  aria-hidden="true"
                />
                <ChevronUp v-else :size="17" aria-hidden="true" />
                <span>{{ agentControlsToggleLabel }}</span>
              </button>
              <label class="agent-control-search">
                <Search :size="15" aria-hidden="true" />
                <span class="sr-only">搜索密探</span>
                <input
                  :id="editingStock ? 'agent-editor-search' : 'agent-search'"
                  v-model.trim="manifestSearch"
                  :name="editingStock ? 'agent-editor-search' : 'agent-search'"
                  type="search"
                  placeholder="搜索名称 / 属性 / 职业"
                />
              </label>
              <details
                class="agent-filter-panel"
                @toggle="positionAgentFilterMenu"
              >
                <summary>
                  <ListFilter :size="15" aria-hidden="true" />筛选<span
                    v-if="agentFacetCount"
                    >{{ agentFacetCount }}</span
                  >
                </summary>
                <div class="agent-filter-menu">
                  <div class="agent-filter-menu-head">
                    <strong>筛选条件</strong>
                    <label
                      class="agent-gold-filter"
                      :class="{ selected: agentRarityFilters.length === 1 && agentRarityFilters[0] === '5' }"
                    >
                      <input
                        type="checkbox"
                        :checked="agentRarityFilters.length === 1 && agentRarityFilters[0] === '5'"
                        @change="agentRarityFilters = $event.target.checked ? ['5'] : []"
                      />只选金色 / 绝密
                    </label>
                    <button
                      v-if="agentFacetCount"
                      type="button"
                      @click="clearAgentFacetFilters"
                    >
                      清空
                    </button>
                  </div>
                  <div class="agent-filter-group" role="group" aria-label="库存">
                    <span class="agent-filter-group-title" aria-hidden="true">库存</span>
                    <div class="agent-filter-options">
                      <label
                        v-for="option in AGENT_STATUS_OPTIONS"
                        :key="option.id"
                        :class="{ selected: agentStatusFilters.includes(option.id) }"
                        ><input
                          v-model="agentStatusFilters"
                          type="checkbox"
                          :value="option.id"
                        />{{ option.label }}</label
                      >
                    </div>
                  </div>
                  <div class="agent-filter-group" role="group" aria-label="品质">
                    <span class="agent-filter-group-title" aria-hidden="true">品质</span>
                    <div class="agent-filter-options">
                      <label
                        v-for="rarity in AGENT_RARITIES"
                        :key="rarity"
                        :class="{ selected: agentRarityFilters.includes(String(rarity)) }"
                        ><input
                          v-model="agentRarityFilters"
                          type="checkbox"
                          :value="String(rarity)"
                        />{{ OPERATOR_RARITY_LABELS[rarity] }}</label
                      >
                    </div>
                  </div>
                  <div class="agent-filter-group" role="group" aria-label="属性">
                    <span class="agent-filter-group-title" aria-hidden="true">属性</span>
                    <div class="agent-filter-options">
                      <label
                        v-for="prof in AGENT_PROFS"
                        :key="prof"
                        :class="{ selected: agentProfFilters.includes(prof) }"
                        ><input
                          v-model="agentProfFilters"
                          type="checkbox"
                          :value="prof"
                        />{{ prof }}</label
                      >
                    </div>
                  </div>
                  <div class="agent-filter-group" role="group" aria-label="职业">
                    <span class="agent-filter-group-title" aria-hidden="true">职业</span>
                    <div class="agent-filter-options">
                      <label
                        v-for="prof in agentSubProfs"
                        :key="prof"
                        :class="{ selected: agentSubProfFilters.includes(prof) }"
                        ><input
                          v-model="agentSubProfFilters"
                          type="checkbox"
                          :value="prof"
                        />{{ prof }}</label
                      >
                    </div>
                  </div>
                </div>
              </details>
              <div
                class="agent-favorite-mode"
                role="group"
                aria-label="关注显示方式"
              >
                <button
                  v-for="mode in AGENT_FAVORITE_MODES"
                  :key="mode.id"
                  type="button"
                  :class="{ on: agentFavoriteMode === mode.id }"
                  :aria-pressed="agentFavoriteMode === mode.id"
                  :disabled="
                    mode.id === 'only' &&
                    (!auth.isLoggedIn || !accountId || favoriteLoading)
                  "
                  @click="agentFavoriteMode = mode.id"
                >
                  {{ mode.label }}
                </button>
              </div>
              <div class="agent-sort-row">
                <details class="agent-menu-control agent-sort-control">
                  <summary :aria-label="'排序方式：' + agentSortLabel">
                    <ArrowDownUp :size="15" aria-hidden="true" />
                    <span>{{ agentSortLabel }}</span>
                    <ChevronDown :size="15" aria-hidden="true" />
                  </summary>
                  <div
                    class="agent-menu-options"
                    role="listbox"
                    aria-label="排序方式"
                  >
                    <button
                      v-for="option in AGENT_SORT_OPTIONS"
                      :key="option.id"
                      type="button"
                      role="option"
                      :aria-selected="agentSort === option.id"
                      :class="{ selected: agentSort === option.id }"
                      @click="chooseAgentMenuValue($event, 'sort', option.id)"
                    >
                      <span>{{ option.label }}</span>
                      <Check
                        v-if="agentSort === option.id"
                        :size="14"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </details>
                <button
                  type="button"
                  class="agent-sort-direction"
                  :class="{ asc: agentSortDirection === 'asc' }"
                  :aria-label="agentSortDirectionButtonLabel"
                  :data-tooltip="agentSortDirectionButtonLabel"
                  @click="toggleAgentSortDirection"
                >
                  <ArrowDown :size="16" aria-hidden="true" />
                  <span class="agent-sort-direction-label">{{ agentSortDirection === 'asc' ? '升序' : '降序' }}</span>
                </button>
                <details
                  v-if="!editingStock"
                  class="agent-menu-control agent-group-control"
                >
                  <summary :aria-label="'分组方式：' + agentGroupLabel">
                    <Layers3 :size="15" aria-hidden="true" />
                    <span>{{ agentGroupLabel }}</span>
                    <ChevronDown :size="15" aria-hidden="true" />
                  </summary>
                  <div
                    class="agent-menu-options"
                    role="listbox"
                    aria-label="分组方式"
                  >
                    <button
                      v-for="option in AGENT_GROUP_OPTIONS"
                      :key="option.id"
                      type="button"
                      role="option"
                      :aria-selected="agentGroupBy === option.id"
                      :class="{ selected: agentGroupBy === option.id }"
                      @click="chooseAgentMenuValue($event, 'group', option.id)"
                    >
                      <span>{{ option.label }}</span>
                      <Check
                        v-if="agentGroupBy === option.id"
                        :size="14"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </details>
              </div>
              <button
                v-if="agentFiltersActive"
                type="button"
                class="agent-reset"
                @click="resetAgentFilters"
              >
                <X :size="14" aria-hidden="true" />清除
              </button>
              <span class="agent-result" role="status"
                >显示
                {{
                  editingStock
                    ? visibleStockEditorEntries.length
                    : manifestEntries.length
                }}
                / {{ agentGameCatalogCount }} · {{ agentGameFilter }}</span
              >
              <span
                v-if="favoriteLoading"
                class="agent-sync-state"
                role="status"
                >正在同步关注…</span
              >
              <span
                v-else-if="favoriteError"
                class="agent-sync-state is-error"
                role="status"
                >{{ favoriteError }}</span
              >
            </div>

            <div v-if="catalogLoading" class="inventory-inline-state" role="status">正在同步对象目录…</div>
            <div v-else-if="catalogError" class="inventory-inline-state is-error" role="alert">
              {{ catalogError }}，当前仍可查看本地目录。
              <button type="button" class="link" @click="loadCatalog">重试同步</button>
            </div>
            <div v-if="entityType === 'agent' && agentCatalogError" class="inventory-inline-state is-error" role="alert">
              {{ agentCatalogError }}，暂不能查看或编辑心纸。
              <button type="button" class="link" @click="loadAgentCatalog">重试同步</button>
            </div>
            <div v-if="loading || (entityType === 'agent' && agentCatalogLoading)" class="state">正在加载追踪目录…</div>
            <div v-else-if="entityType === 'agent' && agentCatalogError" class="state slim">密探目录不可用</div>
            <div
              v-else-if="editingStock"
              class="backpack stock-editor"
              :class="{ 'is-agent-editor': entityType === 'agent' }"
            >
              <p
                v-if="stockDraftError || stockEditError"
                class="stock-edit-error"
              >
                {{ stockDraftError || stockEditError }}
              </p>
              <div
                v-if="visibleStockEditorEntries.length === 0"
                class="state slim"
              >
                当前筛选下没有密探
              </div>
              <ul class="slot-grid stock-edit-grid">
                <li
                  v-for="e in visibleStockEditorEntries"
                  :key="e.id"
                  class="slot stock-edit-slot"
                  :class="{ 'is-changed': isValidStockCount(stockDraft[e.id]) && Number(stockDraft[e.id]) !== Number(stockOriginal[e.id] || 0) }"
                >
                  <div
                    class="slot-ic"
                    :class="{ 'is-agent': entityType === 'agent' }"
                  >
                    <div class="slot-ph">
                      <span class="ph-seal">图</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <img
                      class="slot-img"
                      v-batch-image="entityType === 'agent' ? iconSrc(e) : null"
                      :src="entityType === 'agent' ? undefined : iconSrc(e)"
                      :alt="e.name || e.id"
                      width="96"
                      height="96"
                      :loading="entityType === 'agent' ? 'eager' : 'lazy'"
                      @load="onImgLoad"
                      @error="onImgError"
                    />
                  </div>
                  <InventoryItemName :entry="e" />
                  <span v-if="isValidStockCount(stockDraft[e.id]) && Number(stockDraft[e.id]) !== Number(stockOriginal[e.id] || 0)" class="stock-changed-mark" aria-label="已修改">已改</span>
                  <span
                    v-if="entityType === 'agent'"
                    class="slot-tag star"
                    :class="'s' + e.rarity"
                    >{{ e.rarity }}星 · {{ e.prof }} · {{ e.subProf }}</span
                  >
                  <div
                    class="stock-stepper"
                    :class="{ invalid: !isValidStockCount(stockDraft[e.id]) }"
                  >
                    <button
                      type="button"
                      :disabled="
                        stockInputsLocked ||
                        !isValidStockCount(stockDraft[e.id]) ||
                        Number(stockDraft[e.id]) <= 0
                      "
                      :aria-label="'减少' + (e.name || e.id) + '库存'"
                      @click="adjustStockCount(e.id, -1)"
                    >
                      <Minus :size="16" />
                    </button>
                    <input
                      v-model="stockDraft[e.id]"
                      class="stock-count-input"
                      :type="e.id === 'baijinbi' ? 'text' : 'number'"
                      inputmode="numeric"
                      min="0"
                      max="2147483647"
                      step="1"
                      :disabled="stockInputsLocked"
                      :aria-label="(e.name || e.id) + '当前库存'"
                      @focus="$event.target.select()"
                    />
                    <button
                      type="button"
                      :disabled="
                        stockInputsLocked ||
                        !isValidStockCount(stockDraft[e.id]) ||
                        Number(stockDraft[e.id]) >= 2147483647
                      "
                      :aria-label="'增加' + (e.name || e.id) + '库存'"
                      @click="adjustStockCount(e.id, 1)"
                    >
                      <Plus :size="16" />
                    </button>
                  </div>
                </li>
              </ul>
            </div>
            <div
              v-else
              class="backpack"
              :class="{
                'manifest-items': entityType === 'item',
                'manifest-agents': entityType === 'agent',
              }"
            >
              <div v-if="manifestEntries.length === 0" class="state slim">
                {{
                  entityType === "agent"
                    ? agentEmptyMessage
                    : "没有匹配「" + manifestSearch + "」的对象"
                }}
                <button
                  v-if="entityType === 'agent' && agentFavoriteMode === 'only'"
                  type="button"
                  class="link"
                  @click="agentFavoriteMode = 'all'"
                >
                  查看全部
                </button>
              </div>
              <div v-else-if="entityType === 'item'" class="item-sections">
                <section
                  v-for="section in manifestCategorySections"
                  :key="section.id"
                  class="item-section"
                  :class="{ 'is-legacy-resources': section.id === 'resources' }"
                >
                  <div class="section-head">
                    <h2>{{ section.name }}</h2>
                    <span>{{ section.entries.length }} 种</span>
                  </div>
                  <ul
                    v-if="!section.subsections || section.primaryEntries.length"
                    class="slot-grid"
                  >
                    <li
                      v-for="e in section.subsections
                        ? section.primaryEntries
                        : section.entries"
                      :key="e.id"
                      class="slot"
                      :class="{ 'is-missing': !e.owned }"
                    >
                      <div class="slot-ic">
                        <div class="slot-ph">
                          <span class="ph-seal">图</span
                          ><span class="ph-mono">{{ monogram(e) }}</span>
                        </div>
                        <img
                          class="slot-img"
                          :src="iconSrc(e)"
                          :alt="e.name || e.id"
                          width="96"
                          height="96"
                          loading="lazy"
                          @load="onImgLoad"
                          @error="onImgError"
                        />
                      </div>
                      <InventoryItemName :entry="e" />
                      <span class="slot-count" :class="{ zero: !e.owned }">{{
                        fmtCount(e.count)
                      }}</span>
                    </li>
                  </ul>
                  <template
                    v-if="section.subsections && section.subsections.length"
                  >
                    <div
                      class="subsection-columns"
                      :class="{
                        'subsection-rows': section.subsectionLayout === 'rows',
                        'subsection-shelves':
                          section.subsectionLayout === 'shelves',
                      }"
                    >
                      <div
                        v-for="subcategory in section.subsections"
                        :key="subcategory.id"
                        class="item-subsection"
                        :class="{
                          'is-divination-stone':
                            subcategory.id === 'divination-stone',
                          'is-level-breakthrough':
                            subcategory.id === 'level-breakthrough',
                        }"
                      >
                        <div class="subsection-head">
                          <h3>{{ subcategory.name }}</h3>
                          <span>{{ subcategory.entries.length }} 种</span>
                          <button
                            type="button"
                            class="subsection-edit"
                            :disabled="!inventoryAccountReady || loading || !!error || currentLoadedContext !== stockContext"
                            :aria-label="'编辑' + subcategory.name + '的库存'"
                            :data-tooltip="
                              '编辑「' + subcategory.name + '」的库存'
                            "
                            @click="startSubsectionStockEdit(subcategory)"
                          >
                            <Pencil :size="14" aria-hidden="true" />
                            <span class="subsection-edit-label">编辑</span>
                          </button>
                          <div v-if="subcategory.id === 'draw-resources'" class="resource-summary">
                            <p class="resource-equivalent is-fuchuan">
                              <span>符传</span>
                              <strong>约<b>{{ fmtCount(resourceSummary.fuchuanPity) }}</b>个保底</strong>
                            </p>
                            <p class="resource-equivalent is-tianji">
                              <span>天机符传</span>
                              <strong>约<b>{{ fmtCount(resourceSummary.tianjiPity) }}</b>个保底</strong>
                            </p>
                          </div>
                          <div v-else-if="subcategory.id === 'bird-food-pack'" class="resource-summary">
                            <p class="resource-equivalent is-zhuyu">
                              <span>茱萸折合</span>
                              <strong><b>{{ fmtCount(resourceSummary.zhuyuWhiteCoin) }}</b>白金币</strong>
                            </p>
                          </div>
                        </div>
                        <div
                          v-if="subcategory.subgroups"
                          class="cultivation-groups"
                        >
                          <div
                            v-for="group in subcategory.subgroups"
                            :key="group.id"
                            class="cultivation-group"
                          >
                            <div class="cultivation-group-head">
                              <h4>{{ group.name }}</h4>
                              <span>{{ group.entries.length }} 种</span>
                            </div>
                            <ul class="slot-grid">
                              <li
                                v-for="e in group.entries"
                                :key="e.id"
                                class="slot"
                                :class="{ 'is-missing': !e.owned }"
                              >
                                <div class="slot-ic">
                                  <div class="slot-ph">
                                    <span class="ph-seal">图</span
                                    ><span class="ph-mono">{{
                                      monogram(e)
                                    }}</span>
                                  </div>
                                  <img
                                    class="slot-img"
                                    :src="iconSrc(e)"
                                    :alt="e.name || e.id"
                                    width="96"
                                    height="96"
                                    loading="lazy"
                                    @load="onImgLoad"
                                    @error="onImgError"
                                  />
                                </div>
                                <InventoryItemName :entry="e" />
                                <span
                                  class="slot-count"
                                  :class="{ zero: !e.owned }"
                                  >{{ fmtCount(e.count) }}</span
                                >
                              </li>
                            </ul>
                          </div>
                        </div>
                        <ul v-else class="slot-grid">
                          <li
                            v-for="e in subcategory.entries"
                            :key="e.id"
                            class="slot"
                            :class="{ 'is-missing': !e.owned }"
                          >
                            <div class="slot-ic">
                              <div class="slot-ph">
                                <span class="ph-seal">图</span
                                ><span class="ph-mono">{{ monogram(e) }}</span>
                              </div>
                              <img
                                class="slot-img"
                                :src="iconSrc(e)"
                                :alt="e.name || e.id"
                                width="96"
                                height="96"
                                loading="lazy"
                                @load="onImgLoad"
                                @error="onImgError"
                              />
                              <span v-if="section.id === 'resources'" class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                            </div>
                            <InventoryItemName :entry="e" />
                            <span v-if="section.id !== 'resources'" class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </template>
                </section>
              </div>
              <div v-else class="agent-directory">
                <p class="agent-favorite-help">点心纸卡片右上角的星标，可特别关注密探。</p>
                <section
                  v-for="group in agentGroups"
                  :key="group.id"
                  class="agent-group"
                >
                  <div v-if="group.label" class="agent-group-head">
                    <h2>{{ group.label }}</h2>
                    <span>{{ group.entries.length }} 位</span>
                  </div>
                  <ul class="slot-grid agent-slot-grid">
                    <template v-for="(e, index) in group.entries" :key="e.id">
                      <li
                        v-if="isAgentFavoriteBoundary(group.entries, index)"
                        class="agent-favorite-divider"
                        role="separator"
                        aria-label="其他密探"
                      ></li>
                      <li
                        class="slot agent-card"
                        :class="{
                          'is-missing': !e.owned,
                          'is-favorite': favoriteAgentIds.has(e.id),
                        }"
                      >
                        <div class="slot-ic is-agent">
                          <div class="slot-ph">
                            <span class="ph-seal">图</span>
                            <span class="ph-mono">{{ monogram(e) }}</span>
                          </div>
                          <img
                            class="slot-img"
                            v-batch-image="iconSrc(e)"
                            :alt="e.name || e.id"
                            width="96"
                            height="96"
                            loading="eager"
                            @load="onImgLoad"
                            @error="onImgError"
                          />
                          <button
                            type="button"
                            class="agent-favorite-btn"
                            :class="{
                              on: favoriteAgentIds.has(e.id),
                              busy: favoriteBusyIds.has(e.id),
                            }"
                            :aria-label="
                              favoriteAgentIds.has(e.id)
                                ? '取消特别关注' + (e.name || e.id)
                                : '特别关注' + (e.name || e.id)
                            "
                            :aria-pressed="favoriteAgentIds.has(e.id)"
                            :aria-busy="favoriteBusyIds.has(e.id)"
                            :disabled="
                              favoriteBusyIds.has(e.id) ||
                              favoriteLoading ||
                              !auth.isLoggedIn ||
                              !accountId
                            "
                            :data-tooltip="
                              favoriteAgentIds.has(e.id)
                                ? '取消特别关注'
                                : '特别关注'
                            "
                            @click="toggleAgentFavorite(e)"
                          >
                            <Star
                              :size="15"
                              :fill="
                                favoriteAgentIds.has(e.id)
                                  ? 'currentColor'
                                  : 'none'
                              "
                              aria-hidden="true"
                            />
                          </button>
                          <span
                            class="slot-count"
                            :class="{ zero: !e.owned }"
                            >{{ fmtCount(e.count) }}</span
                          >
                        </div>
                        <InventoryItemName :entry="e" />
                      </li>
                    </template>
                  </ul>
                </section>
              </div>
            </div>
          </div>

          <!-- 时段获得量 -->
          <div
            id="inventory-panel-acquired"
            role="tabpanel"
            aria-labelledby="inventory-tab-acquired"
            tabindex="0"
            v-show="activeTab === 'acquired'"
            class="panel acquired-panel"
            :aria-busy="acquiredLoading"
          >
            <section
              class="acquired-query"
              aria-labelledby="acquired-query-title"
            >
              <div class="acquired-query-head">
                <h2 id="acquired-query-title">统计时段</h2>
              </div>

              <div class="quick-range" aria-label="快捷时段">
                <button
                  v-for="preset in rangePresets"
                  :key="preset.id"
                  :aria-pressed="rangePreset === preset.id"
                  :class="{ on: rangePreset === preset.id, 'extended-range': !['7d', '30d'].includes(preset.id) }"
                  :disabled="acquiredLoading"
                  @click="applyRangePreset(preset.id)"
                >
                  {{ preset.label }}
                </button>
                <button type="button" class="custom-range-toggle" :aria-pressed="rangePreset === 'custom'"
                  :aria-expanded="rangePreset === 'custom'" aria-controls="inventory-custom-range"
                  :class="{ on: rangePreset === 'custom' }" :disabled="acquiredLoading" @click="markCustomRange">自定义</button>
                <details class="range-more">
                  <summary>{{ rangePresets.slice(2).find(preset => preset.id === rangePreset)?.label || '更多时段' }}<ChevronDown :size="13" aria-hidden="true" /></summary>
                  <div class="range-more-options">
                    <button v-for="preset in rangePresets.slice(2)" :key="preset.id" type="button"
                      :aria-pressed="rangePreset === preset.id" :class="{ on: rangePreset === preset.id }"
                      :disabled="acquiredLoading" @click="applyRangePreset(preset.id)">{{ preset.label }}</button>
                  </div>
                </details>
              </div>

              <div class="acquired-bar" :class="{ 'is-custom': rangePreset === 'custom' }">
                <div id="inventory-custom-range" class="range">
                  <label>
                    <span class="lb">开始日期</span>
                    <input
                      id="acquired-range-from"
                      v-model="rangeFrom"
                      name="acquired-range-from"
                      type="date"
                      :max="rangeTo || undefined"
                      :disabled="acquiredLoading"
                      @change="markCustomRange"
                    />
                  </label>
                  <span class="range-dash" aria-hidden="true">至</span>
                  <label>
                    <span class="lb">结束日期</span>
                    <input
                      id="acquired-range-to"
                      v-model="rangeTo"
                      name="acquired-range-to"
                      type="date"
                      :min="rangeFrom || undefined"
                      :disabled="acquiredLoading"
                      @change="markCustomRange"
                    />
                  </label>
                  <button
                    class="btn primary acquired-submit"
                    :disabled="acquiredLoading || !accountId"
                    @click="loadAcquired"
                  >
                    <RefreshCw
                      :size="15"
                      aria-hidden="true"
                      :class="{ spin: acquiredLoading }"
                    />
                    {{ acquiredLoading ? "正在统计" : "查看统计" }}
                  </button>
                </div>
                <p class="range-caption">
                  <CalendarDays :size="15" aria-hidden="true" />
                  <span class="range-caption-lines">
                    <span>{{ acquiredRangeLabel }}</span>
                    <span>{{ acquiredRangeMetaLabel }}</span>
                  </span>
                  <span v-if="acquiredQueryDirty" class="query-dirty"
                    >待更新</span
                  >
                </p>
              </div>
            </section>

            <header v-if="acquiredLoading || (reportBook === 'base' && !periodHasData)" class="report-book-fallback">
              <div><span>周期获得账簿</span><h2>{{ reportBook === 'resources' ? '抽卡资源收支' : '据点收获统计' }}</h2></div>
              <div class="type-switch acquired-type-switch report-book-switch" role="group" aria-label="周期获得账簿">
              <button type="button" aria-label="抽卡资源账簿" :aria-pressed="reportBook === 'resources'" :class="{ on: reportBook === 'resources' }" @click="reportBook = 'resources'"><span class="report-book-label-full">抽卡资源收支</span><span class="report-book-label-compact" aria-hidden="true">抽卡资源</span></button>
              <button type="button" aria-label="据点收获统计账簿" :aria-pressed="reportBook === 'base'" :class="{ on: reportBook === 'base' }" @click="reportBook = 'base'"><span class="report-book-label-full">据点收获统计</span><span class="report-book-label-compact" aria-hidden="true">据点收获</span></button>
            </div>
            </header>
            <ResourceBalanceReport
              v-if="reportBook === 'resources' && !acquiredLoading"
              :records="acquiredAllRecords"
              :from="resourceReportRange.from"
              :to="resourceReportRange.to"
              :error="acquiredError || acquiredRecordsError"
              :truncated="acquiredRecordsTruncated"
            >
              <template #error-actions>
                <button type="button" class="act-btn" @click="loadAcquired">重试读取</button>
              </template>
              <template #empty-actions>
                <button type="button" class="act-btn" @click="focusResourceRange">调整日期范围</button>
                <button
                  type="button"
                  class="act-btn"
                  :disabled="!inventoryAccountReady || loading || !!error"
                  @click="openResourceStockEditor"
                >盘点道具库存</button>
                <button
                  type="button"
                  class="act-btn"
                  :disabled="!inventoryAccountReady"
                  @click="openResourceReportImport"
                >导入库存报告</button>
              </template>
              <template #actions>
                <div class="type-switch acquired-type-switch report-book-switch" role="group" aria-label="周期获得账簿">
              <button type="button" aria-label="抽卡资源账簿" :aria-pressed="reportBook === 'resources'" :class="{ on: reportBook === 'resources' }" @click="reportBook = 'resources'"><span class="report-book-label-full">抽卡资源收支</span><span class="report-book-label-compact" aria-hidden="true">抽卡资源</span></button>
              <button type="button" aria-label="据点收获统计账簿" :aria-pressed="reportBook === 'base'" :class="{ on: reportBook === 'base' }" @click="reportBook = 'base'"><span class="report-book-label-full">据点收获统计</span><span class="report-book-label-compact" aria-hidden="true">据点收获</span></button>
            </div>
              </template>
            </ResourceBalanceReport>
            <template v-if="reportBook === 'base' || acquiredLoading">
            <div
              v-if="acquiredLoading"
              class="state acquired-loading"
              role="status"
              aria-live="polite"
            >
              <span class="loading-seal" aria-hidden="true">簿</span>
              <span>正在统计获得量…</span>
              <small v-if="acquiredRecordProgress.pages"
                >已整理 {{ acquiredRecordProgress.records }} 条流水</small
              >
            </div>
            <div
              v-else-if="acquiredError && !periodHasData"
              class="state err"
              role="alert"
            >
              {{ acquiredError }}
            </div>
            <div v-else-if="!periodHasData" class="state acquired-empty">
              <strong>这段时间没有奖励获得记录</strong>
              <span
                >仅统计派遣、寿春等奖励流水，库存快照不计入。可以换一个时段，或先导入对应账号的奖励流水。</span
              >
            </div>
            <template v-else>
              <AcquiredPeriodReport
                :insights="periodInsights"
                :dispatch-duration="periodDispatchDuration"
                :gold-agent-ids="goldAgentIdsForStats"
                :item-totals-available="!acquiredTotalsErrors.item"
                :agent-totals-available="!acquiredTotalsErrors.agent"
                :records-available="!acquiredRecordsError"
                :favorite-loading="favoriteLoading"
                :favorite-error="favoriteError"
              >
                <template #actions>
                  <div class="type-switch acquired-type-switch report-book-switch" role="group" aria-label="周期获得账簿">
              <button type="button" aria-label="抽卡资源账簿" :aria-pressed="reportBook === 'resources'" :class="{ on: reportBook === 'resources' }" @click="reportBook = 'resources'"><span class="report-book-label-full">抽卡资源收支</span><span class="report-book-label-compact" aria-hidden="true">抽卡资源</span></button>
              <button type="button" aria-label="据点收获统计账簿" :aria-pressed="reportBook === 'base'" :class="{ on: reportBook === 'base' }" @click="reportBook = 'base'"><span class="report-book-label-full">据点收获统计</span><span class="report-book-label-compact" aria-hidden="true">据点收获</span></button>
            </div>
                </template>
              </AcquiredPeriodReport>

              <div
                class="type-switch acquired-type-switch"
                aria-label="统计对象"
              >
                <button
                  type="button"
                  aria-label="全部（道具和心纸）"
                  :aria-pressed="acquiredEntityType === 'all'"
                  :class="{ on: acquiredEntityType === 'all' }"
                  @click="setAcquiredEntityType('all')"
                >
                  查看全部
                </button>
                <button
                  type="button"
                  :aria-pressed="acquiredEntityType === 'item'"
                  :class="{ on: acquiredEntityType === 'item' }"
                  @click="setAcquiredEntityType('item')"
                >
                  背包道具
                </button>
                <button
                  type="button"
                  :aria-pressed="acquiredEntityType === 'agent'"
                  :class="{ on: acquiredEntityType === 'agent' }"
                  @click="setAcquiredEntityType('agent')"
                >
                  密探心纸
                </button>
              </div>

              <div
                v-if="
                  acquiredRecordsError ||
                  acquiredRecordsTruncated ||
                  acquiredAgentHistoryError ||
                  acquiredAgentHistoryTruncated ||
                  acquiredTotalsErrors.item ||
                  acquiredTotalsErrors.agent ||
                  !acquiredTotalsMatch ||
                  periodDispatchDuration.unconvertedRecordCount
                "
                class="acquired-notices"
                role="status"
              >
                <p v-if="acquiredTotalsErrors.item">
                  白金币等价值暂不可用：{{ acquiredTotalsErrors.item }}
                </p>
                <p v-if="acquiredTotalsErrors.agent">
                  心纸排行与关注统计暂不可用：{{ acquiredTotalsErrors.agent }}
                </p>
                <p v-if="acquiredRecordsError">
                  汇总已加载，但流水明细加载失败：{{ acquiredRecordsError }}
                </p>
                <p v-if="acquiredRecordsTruncated">
                  本次明细最多整理 5,000
                  条，幸运日、连续收获和同框分析可能不完整；总量以汇总统计为准。
                </p>
                <p v-if="acquiredAgentHistoryError">
                  长期失联统计暂不可用：{{ acquiredAgentHistoryError }}
                </p>
                <p v-else-if="acquiredAgentHistoryTruncated">
                  密探历史流水超过 5,000 条，未查到的密探不会被判定为从未获得。
                </p>
                <p v-if="!acquiredTotalsMatch">
                  明细与汇总存在差异，排行以汇总统计为准。
                </p>
                <p v-if="periodDispatchDuration.unconvertedRecordCount">
                  有
                  {{ periodDispatchDuration.unconvertedRecordCount }}
                  条派遣流水缺少可换算的消耗体力，未计入派遣总时长。
                </p>
              </div>

              <div
                v-if="acquiredEntries.length === 0"
                class="state acquired-empty acquired-type-empty"
              >
                <strong>{{
                  acquiredEntityType === "all"
                    ? "本期没有道具或心纸奖励"
                    : acquiredEntityType === "item"
                      ? "本期没有背包道具奖励"
                      : "本期没有密探心纸奖励"
                }}</strong>
                <span
                  >上方总账始终展示本周期的完整统计；可切换统计对象查看对应流水。</span
                >
              </div>
              <template v-else>
                <div class="acquired-tools">
                  <div
                    class="acquired-views"
                    role="tablist"
                    aria-label="获得统计视图"
                  >
                    <button
                      role="tab"
                      :aria-selected="acquiredView === 'overview'"
                      :class="{ on: acquiredView === 'overview' }"
                      @click="setAcquiredView('overview')"
                    >
                      获得总览
                    </button>
                    <button
                      role="tab"
                      :aria-selected="acquiredView === 'source'"
                      :class="{ on: acquiredView === 'source' }"
                      @click="setAcquiredView('source')"
                    >
                      来源分析
                    </button>
                    <button
                      role="tab"
                      :aria-selected="acquiredView === 'timeline'"
                      :class="{ on: acquiredView === 'timeline' }"
                      @click="setAcquiredView('timeline')"
                    >
                      按日汇总
                    </button>
                    <button
                      role="tab"
                      :aria-selected="acquiredView === 'details'"
                      :class="{ on: acquiredView === 'details' }"
                      @click="setAcquiredView('details')"
                    >
                      流水明细
                    </button>
                  </div>
                  <div
                    class="acquired-filters"
                    :class="{ 'has-sort': acquiredView === 'overview' }"
                  >
                    <label class="acquired-source-filter">
                      <span>来源</span>
                      <select
                        id="acquired-source"
                        v-model="acquiredSource"
                        name="acquired-source"
                        @change="clearSelectedEntity"
                      >
                        <option value="all">全部来源</option>
                        <option
                          v-for="source in acquiredStats.channels"
                          :key="source.name"
                          :value="source.name"
                        >
                          {{ source.name }}（{{ source.recordCount }}）
                        </option>
                      </select>
                    </label>
                    <label class="acquired-search">
                      <span class="sr-only">搜索名称或 ID</span>
                      <Search :size="16" aria-hidden="true" />
                      <input
                        id="acquired-search"
                        v-model.trim="acquiredSearch"
                        name="acquired-search"
                        type="search"
                        placeholder="搜索名称 / ID"
                        @input="clearSelectedEntity"
                      />
                    </label>
                    <label
                      v-if="acquiredView === 'overview'"
                      class="acquired-sort-filter"
                    >
                      <span>排序</span>
                      <select
                        id="acquired-sort"
                        v-model="acquiredSort"
                        name="acquired-sort"
                      >
                        <option value="count">获得量 ↓</option>
                        <option value="name">名称顺序</option>
                        <option value="records">获得次数 ↓</option>
                      </select>
                    </label>
                  </div>
                </div>

                <section
                  v-if="acquiredView === 'overview'"
                  class="backpack acquired-overview"
                  aria-label="获得总览"
                >
                  <div class="bp-head acquired-overview-head">
                    <span class="bp-tip">{{ acquiredResultCaption }}</span>
                    <label
                      class="acquired-rarity-filter"
                      :class="{ on: hideLowerRarityAgentRewards }"
                    >
                      <input
                        v-model="hideLowerRarityAgentRewards"
                        type="checkbox"
                      />
                      <span>不看紫卡/蓝卡心纸</span>
                    </label>
                  </div>
                  <div
                    v-if="displayedAcquiredEntries.length === 0"
                    class="state slim"
                  >
                    没有匹配当前筛选的获得记录
                  </div>
                  <ul v-else class="slot-grid acquired-slot-grid">
                    <li
                      v-for="e in displayedAcquiredEntries"
                      :key="e.entity_type + ':' + e.id"
                      class="slot"
                      :class="{ 'is-priority': isPriorityReward(e) }"
                      :title="e.name || e.id"
                    >
                      <button
                        type="button"
                        class="slot-action"
                        :aria-label="'查看' + (e.name || e.id) + '的获得明细'"
                        @click="openEntityDetails(e.id)"
                      >
                        <div
                          class="slot-ic"
                          :class="{ 'is-agent': e.entity_type === 'agent' }"
                        >
                          <div class="slot-ph">
                            <span class="ph-seal">图</span
                            ><span class="ph-mono">{{ monogram(e) }}</span>
                          </div>
                          <img
                            class="slot-img"
                            v-batch-image="e.entity_type === 'agent' ? iconSrc(e) : null"
                            :src="e.entity_type === 'agent' ? undefined : iconSrc(e)"
                            :alt="e.name || e.id"
                            width="96"
                            height="96"
                            :loading="e.entity_type === 'agent' ? 'eager' : 'lazy'"
                            @load="onImgLoad"
                            @error="onImgError"
                          />
                          <span class="slot-count gained"
                            >+{{ fmtCount(e.count) }}</span
                          >
                        </div>
                        <InventoryItemName :entry="e" />
                        <span class="slot-meta"
                          >{{ e.recordCount || 0 }} 次记录</span
                        >
                      </button>
                    </li>
                  </ul>
                </section>

                <section
                  v-else-if="acquiredView === 'source'"
                  class="acquired-ledger"
                  aria-labelledby="source-title"
                >
                  <div class="ledger-head">
                    <div>
                      <span>渠道账目</span>
                      <h3 id="source-title">奖励从哪里来</h3>
                    </div>
                    <small>按奖励流水数排序，不直接相加不同物品的数量</small>
                  </div>
                  <div v-if="sourceRows.length === 0" class="state slim">
                    当前筛选下没有来源数据
                  </div>
                  <ol v-else class="source-list">
                    <li
                      v-for="(source, index) in sourceRows"
                      :key="source.name"
                    >
                      <button type="button" @click="focusSource(source.name)">
                        <span class="source-rank">{{
                          String(index + 1).padStart(2, "0")
                        }}</span>
                        <span class="source-main"
                          ><strong>{{ source.name }}</strong
                          ><i :style="{ '--source-scale': source.scale }"></i
                        ></span>
                        <span class="source-stat"
                          ><b>{{ source.recordCount }}</b> 条流水</span
                        >
                        <span class="source-stat"
                          ><b>{{ source.entityCount }}</b> 种获得</span
                        >
                        <span class="source-top">{{ source.topText }}</span>
                        <ChevronRight :size="18" aria-hidden="true" />
                      </button>
                    </li>
                  </ol>
                </section>

                <section
                  v-else-if="acquiredView === 'timeline'"
                  class="acquired-ledger"
                  aria-labelledby="timeline-title"
                >
                  <div class="ledger-head">
                    <div>
                      <span>每日归账</span>
                      <h3 id="timeline-title">按日汇总获得量</h3>
                    </div>
                    <small
                      >同一天、同一道具自动合并；点击日期核对原始流水</small
                    >
                  </div>
                  <div v-if="timelineRows.length === 0" class="state slim">
                    当前筛选下没有每日获得数据
                  </div>
                  <ol v-else class="timeline-list">
                    <li v-for="day in timelineRows" :key="day.date">
                      <button
                        type="button"
                        :aria-label="'查看' + day.dayLabel + '的奖励流水明细'"
                        @click="openDayDetails(day.date)"
                      >
                        <time :datetime="day.date"
                          ><b>{{ day.dayLabel }}</b
                          ><span
                            >{{ day.weekday }} ·
                            {{ day.recordCount }} 条流水合并</span
                          ></time
                        >
                        <span class="daily-rewards">
                          <span
                            v-for="reward in day.rewards"
                            :key="reward.id"
                            :class="{ 'is-priority': isPriorityReward(reward) }"
                            ><b>{{ reward.name }}</b
                            ><em>+{{ fmtCount(reward.count) }}</em></span
                          >
                        </span>
                        <ChevronRight :size="18" aria-hidden="true" />
                      </button>
                    </li>
                  </ol>
                </section>

                <section
                  v-else
                  class="acquired-ledger acquired-details"
                  aria-labelledby="details-title"
                >
                  <div class="ledger-head details-head">
                    <div>
                      <span>原始账目</span>
                      <h3 id="details-title">{{ detailsTitle }}</h3>
                    </div>
                    <button
                      v-if="selectedEntity || selectedDay"
                      type="button"
                      class="act-btn ghost"
                      @click="clearSelectedEntity"
                    >
                      <X :size="14" aria-hidden="true" />查看全部
                    </button>
                  </div>
                  <p class="details-caption">{{ detailResultCaption }}</p>
                  <div
                    v-if="filteredRewardRecords.length === 0"
                    class="state slim"
                  >
                    没有匹配当前筛选的流水
                  </div>
                  <ol v-else class="detail-list">
                    <li
                      v-for="record in filteredRewardRecords"
                      :key="record.record_id"
                    >
                      <time :datetime="record.effective_at"
                        ><b>{{ fmtRecordDay(record.effective_at) }}</b
                        ><span>{{
                          fmtRecordClock(record.effective_at)
                        }}</span></time
                      >
                      <div class="detail-meta">
                        <span class="detail-source">{{
                          recordChannel(record)
                        }}</span>
                        <span
                          v-if="staminaCostOf(record) !== undefined"
                          class="detail-stamina"
                          >消耗体力 <b>{{ staminaCostOf(record) }}</b></span
                        >
                      </div>
                      <div class="detail-entries">
                        <span
                          v-for="entry in visibleRecordEntries(record)"
                          :key="entry.id"
                          :class="{ 'is-priority': isPriorityReward(entry) }"
                          ><b>{{
                            entry.name ||
                            nameOf(entry.id, null, record.entity_type)
                          }}</b
                          ><em>+{{ fmtCount(entry.count) }}</em></span
                        >
                      </div>
                    </li>
                  </ol>
                </section>
              </template>
            </template>
            </template>
          </div>

          <!-- 导入记录 -->
          <div id="inventory-panel-records"
            role="tabpanel"
            aria-labelledby="inventory-tab-records"
            tabindex="0"
            v-show="activeTab === 'records'" class="panel">
            <InventoryRecordsWorkspace
              :records-list="recordsList" :account-id="accountId"
              :records-entity-type="recordsEntityType" :records-loading="recordsLoading"
              :records-busy-id="recordsBusyId" :deleted-record-notices="deletedRecordNotices"
              :records-error="recordsError" :records-action-error="recordsActionError"
              :records-retry-reset="recordsRetryReset" :records-next-cursor="recordsNextCursor"
              :reward-entry-disabled="rewardEntryDisabled" :reward-import-busy="rewardImportBusy"
              :report-open="rewardEntryWorkspace?.mode === 'report'"
              @filter="setRecordsEntityType" @load="loadRecords" @restore="onRestoreRecord"
              @open-report="openRewardEntry('report', $event)"
            >
              <InventoryRecordsView
                :records-list="recordsList" :account-id="accountId"
                :disabled="Boolean(recordsBusyId) || recordsLoading || drawResourceLocked"
                :fmt-time="fmtTime" :entry-summary="entrySummary" :icon-src="iconSrc"
                :stock-effect-label="stockEffectLabel" :stamina-cost-of="staminaCostOf"
                :delete-record="onDeleteRecord"
              />
            </InventoryRecordsWorkspace>
          </div>
        </div>
      </section>

      <template #footer>
        <SiteFooter>
          <template #big>广陵库房<br /><span>清点 · 归档 · 溯源</span></template>
          <template #fine>
            <b>YuanHub</b> · 库存与奖励台账<br />
            MaaYuan × 鸢BWiki × 辟雍学府 × YuanAssist 共同搭建<br />
            数据仅供参考，请以游戏内实际库存为准
          </template>
        </SiteFooter>
      </template>
  </InventoryLayout>
</template>

<script setup>
import { TUTORIALS_ENABLED } from "../../config/features.js";
import { useAccountListUpdates } from '../../store/accountList.js'
import { usePersistedTab } from "../../utils/persistedTab.js";
import { batchImageDirective as vBatchImage } from "../../utils/batchImage.js";
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from "vue";
import { useUnsavedChanges } from "../../utils/useUnsavedChanges.js";
import {
  Archive,
  ArrowDown,
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Info,
  Layers3,
  ListFilter,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Star,
  Upload,
  X,
  CircleHelp,
} from "@lucide/vue";
import CompactToolHeader from "../../components/CompactToolHeader.vue";
import TutorialEntry from "../../components/TutorialEntry.vue";
import OnboardingGuide from "../../components/OnboardingGuide.vue";
import ToolTaskPrompt from "../../components/ToolTaskPrompt.vue";
import { inventoryCurrentRead } from '../../utils/inventoryEvents.js';
import DataAccountContextBar from "../../components/DataAccountContextBar.vue";
import ArchiveExchangePanel from "../../components/ArchiveExchangePanel.vue";
import ResourceBalanceReport from "../../components/inventory/ResourceBalanceReport.vue";
import AcquiredPeriodReport from "../../components/inventory/AcquiredPeriodReport.vue";
import InventoryItemName from "../../components/inventory/InventoryItemName.vue";
import InventoryRecordsWorkspace from '../../components/inventory/InventoryRecordsWorkspace.vue';
import InventoryRecordsView from "../../components/inventory/InventoryRecordsView.vue";
import MailboxReserve from "../../components/inventory/MailboxReserve.vue";
import RewardEntryWorkspace from "../../components/inventory/RewardEntryWorkspace.vue";
import DrawResourceEntry from "../../components/inventory/DrawResourceEntry.vue";
import { resourceEntrySummary } from "../../data/inventory/drawResources.js";
import InventoryLayout from "../../components/inventory/InventoryLayout.vue";
import InventoryWorkspaceTabs from "../../components/inventory/InventoryWorkspaceTabs.vue";
import SiteFooter from "../../components/SiteFooter.vue";
import {
  getCatalog,
  getCurrent,
  getAcquired,
  exportInventory,
  importInventory,
  listRecords,
  deleteRecord,
  restoreRecord,
  listAccounts,
  listAgentFavorites,
  addAgentFavorite,
  removeAgentFavorite,
} from "../../api/inventory.js";
import { getOperatorCatalog } from "../../api/operator.js";
import { OPERATOR_RARITY_LABELS } from "../../utils/operatorFilters.js";
import { auth } from "../../store/auth.js";
import { dialog } from "../../utils/dialog.js";
import {
  setInventoryToastFavoriteAgentIds,
  subscribeAccountEvents,
} from "../../store/accountEvents.js";
import { activeAccount } from "../../store/activeAccount.js";
import {
  CATALOG_VERSION,
  ITEM_CATALOG,
  AGENT_CATALOG,
  AGENT_PROFS,
} from "../../data/inventory/catalog.js";
import {
  acquisitionChannel,
  buildAcquiredStats,
  buildRewardInsights,
  localDayKey,
  mapsHaveSameCounts,
  summarizeDispatchDuration,
} from "../../data/inventory/acquiredStats.js";
import {
  agentMatchesGame,
  buildAgentGroups,
  filterAgentEntries,
  isHiddenAgent,
  normalizeOperatorCatalog,
  sortAgentEntries,
  visibleAgentEntries,
} from "../../data/inventory/agentManifest.js";
import {
  FRONTEND_HIDDEN_ITEM_IDS,
  buildItemCategorySections,
  resourceEquivalents,
  sortItemsByGameOrder,
  sortStockEditItems,
  visibleInventoryItems,
} from "../../data/inventory/itemSections.js";
import {
  buildManualStockSnapshot,
  nextManualSnapshotTime,
  preserveHiddenStockEntries,
} from "../../data/inventory/manualStock.js";
import {
  staminaCostOf,
  validateInventoryExchangeDocument,
} from "../../data/inventory/exchange.js";
import {
  addCalendarDays,
  businessDate,
  businessDayStartIso,
  BUSINESS_TIMEZONE,
  nextBusinessDayStartIso,
} from "../../utils/businessDay.js";

const activeTab = usePersistedTab(
  "inventory-tabs",
  "manifest",
  ["manifest", "acquired", "records"],
);
const manifestPanel = ref(null);
const entityType = ref("item");
const manifestSearch = ref("");
const manifestFilter = ref("all");
const agentFavoriteMode = ref("priority");
const agentControlsCollapsed = ref(
  typeof window !== "undefined" &&
    window.matchMedia("(max-width: 640px)").matches,
);
const agentStatusFilters = ref([]);
const agentRarityFilters = ref([]);
const agentProfFilters = ref([]);
const agentSubProfFilters = ref([]);
const operatorCatalog = ref([]);
const agentCatalogLoading = ref(false);
const agentCatalogError = ref("");
const agentGroupBy = ref("none");
const agentSort = ref("latest");
const agentSortDirection = ref("desc");
const agentControlsCollapsedBeforeEdit = ref(null);
const AGENT_SORT_OPTIONS = [
  { id: "latest", label: "实装顺序" },
  { id: "backpack", label: "背包顺序" },
  { id: "count", label: "心纸数量" },
  { id: "name", label: "名称" },
];
const AGENT_GROUP_OPTIONS = [
  { id: "none", label: "不分组" },
  { id: "prof", label: "按属性" },
  { id: "subProf", label: "按职业" },
];
const agentSortLabel = computed(function () {
  return (
    AGENT_SORT_OPTIONS.find(function (option) {
      return option.id === agentSort.value;
    })?.label || "实装顺序"
  );
});
const agentGroupLabel = computed(function () {
  return (
    AGENT_GROUP_OPTIONS.find(function (option) {
      return option.id === agentGroupBy.value;
    })?.label || "不分组"
  );
});
const AGENT_FAVORITE_MODES = [
  { id: "all", label: "默认" },
  { id: "priority", label: "关注优先" },
  { id: "only", label: "只看关注" },
];
const agentControlsToggleLabel = computed(function () {
  if (editingStock.value && agentControlsCollapsed.value) return "筛选";
  return agentControlsCollapsed.value ? "展开" : "收起";
});
const AGENT_STATUS_OPTIONS = [
  { id: "owned", label: "有库存" },
  { id: "missing", label: "无库存" },
];
const AGENT_RARITIES = [5, 4, 3];
const agentRarityById = computed(function () {
  return new Map(
    operatorCatalog.value.map(function (agent) {
      return [agent.id, Number(agent.rarity)];
    }),
  );
});
const favoriteAgentIds = ref(new Set());
const favoriteBusyIds = ref(new Set());
const favoriteLoading = ref(false);
const favoriteError = ref("");
const favoriteLoadedAccount = ref("");
let favoriteLoadSeq = 0;
const loading = ref(false);
const error = ref("");
let accountEventRefreshTimer = null;
let inventoryEventRefreshPending = false;
let unsubscribeAccountEvents = null;
const catalog = ref({ entities: [] });
const catalogLoading = ref(false);
const catalogError = ref("");
const currentEntries = ref([]);
const acquiredEntries = ref([]);
const acquiredEntityType = ref("all");
const rangeFrom = ref(addCalendarDays(businessDate(new Date()), -29));
const rangeTo = ref(businessDate(new Date()));
const rangePreset = ref("30d");
const acquiredView = ref("overview");
const reportBook = ref("resources");
const resourceReportRange = ref({ from: rangeFrom.value, to: rangeTo.value });
const acquiredSearch = ref("");
const acquiredSource = ref("all");
const acquiredSort = ref("count");
const hideLowerRarityAgentRewards = ref(false);
const acquiredLoading = ref(false);
const acquiredError = ref("");
const acquiredRecords = ref([]);
const acquiredAllRecords = ref([]);
const acquiredAgentHistoryRecords = ref([]);
const acquiredRecordsError = ref("");
const acquiredRecordsTruncated = ref(false);
const acquiredAgentHistoryError = ref("");
const acquiredAgentHistoryTruncated = ref(false);
const acquiredRecordProgress = ref({ pages: 0, records: 0 });
const acquiredTotalsObject = ref({});
const acquiredTotalsByType = ref({ item: {}, agent: {} });
const acquiredTotalsErrors = ref({ item: "", agent: "" });
const appliedAcquiredKey = ref("");
const selectedEntityId = ref("");
const selectedDay = ref("");
const rangePresets = [
  { id: "7d", label: "近 7 日" },
  { id: "30d", label: "近 30 日" },
  { id: "this-week", label: "本周" },
  { id: "last-week", label: "上周" },
  { id: "this-month", label: "本月" },
  { id: "last-month", label: "上月" },
];
const showImport = ref(false);
const showArchive = ref(false);
const importText = ref("");
const importError = ref("");
const importing = ref(false);
const importResult = ref(null);
const loadingExample = ref(false);
const editingStock = ref(false);
const savingStock = ref(false);
const stockDraft = ref({});
const stockOriginal = ref({});
const stockEditError = ref("");
const stockSaveNotice = ref("");
const rewardEntryWorkspace = ref(null);
const dailyRewards = ref(null);
const dailyBusy = ref(false);
const mailboxReserve = ref(null);
const mailboxBusy = ref(false);
const drawResourceEntry = ref(null);
const drawResourceLocked = ref(false);
const stockBaselineConfirmed = ref(false);
const pendingStockDocument = ref(null);
const stockInputsLocked = computed(() => savingStock.value || !!pendingStockDocument.value);
const stockEditContext = ref("");
const currentLoadedContext = ref("");
let stockEditSeq = 0;
let currentLoadSeq = 0;
let accountsLoadSeq = 0;
let inventoryContextSeq = 0;
let inventoryPageReady = false;
let inventoryDisposed = false;

function toggleInventoryArchive() {
  showArchive.value = !showArchive.value;
  if (!showArchive.value) showImport.value = false;
}
function toggleInventoryImport() {
  if (drawResourceLocked.value) return;
  if (!showArchive.value || editingStock.value) {
    showImport.value = false;
    return;
  }
  showImport.value = !showImport.value;
}
const stockEditScopeIds = ref(null);
const stockEditScopeName = ref("");
const currentFullBaselineAt = ref(null);

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
const agentGameFilter = computed({
  get: function () {
    return activeAccount.gameFor(accountId.value);
  },
  set: function (v) {
    activeAccount.setGame(v, accountId.value);
  },
});
const accountsLoading = ref(false);
const accountError = ref("");
const inventoryAccountReady = computed(() => auth.isLoggedIn && !!accountId.value &&
  !accountsLoading.value && !accountError.value && accounts.value.some(account => account.id === accountId.value));
const inventorySetupNeeded = computed(() => inventoryAccountReady.value && !loading.value && !error.value &&
  currentLoadedContext.value === stockContext.value && !currentFullBaselineAt.value && !currentEntries.value.length);
const inventoryPromptTitle = computed(() => {
  if (!auth.isLoggedIn) return '登录后管理库存';
  if (accountsLoading.value) return '正在读取游戏账号';
  if (accountError.value || error.value) return '库存数据读取失败';
  if (!inventoryAccountReady.value) return '请选择游戏账号';
  if (inventorySetupNeeded.value) return entityType.value === 'agent' ? '尚未建立心纸库存' : '尚未建立库存';
  return '';
});
const inventoryPromptDescription = computed(() => accountError.value || error.value ||
  (inventorySetupNeeded.value ? '完成第一次盘点后，即可查看材料余额、养成消耗和库存变化。' : '当前账号的材料与心纸库存会保存在对应游戏账号下。'));
const stockContext = computed(function () {
  return JSON.stringify([auth.isLoggedIn, auth.userInfo?.id || "", accountId.value, entityType.value, agentGameFilter.value]);
});
const exportAll = ref(false);
const inventoryExportScopeOptions = computed(function () {
  return [
    { value: "current", label: "当前账号", detail: currentAccountName.value },
    {
      value: "all",
      label: "全部账号",
      detail: accounts.value.length > 1 ? accounts.value.length + " 个账号" : "至少需要 2 个账号",
      disabled: accounts.value.length < 2,
    },
  ];
});
const currentAccountName = computed(function () {
  const account = accounts.value.find(function (item) {
    return item.id === accountId.value;
  });
  return account ? account.name : "当前账号";
});

// —— 导入记录（游标分页） ——
const recordsList = ref([]);
const recordsNextCursor = ref(null);
const recordsEntityType = ref("all");
const recordsLoading = ref(false);
const recordsError = ref("");
const recordsRetryReset = ref(true);
const recordsActionError = ref("");
const recordsBusyId = ref("");
const deletedRecordNotices = ref([]);
let recordsLoadSeq = 0;
const rewardImportBusy = ref(false);
const rewardEntryDisabled = computed(() => !inventoryAccountReady.value || loading.value || !!error.value ||
  currentLoadedContext.value !== stockContext.value || editingStock.value || savingStock.value ||
  !!pendingStockDocument.value || importing.value || !!recordsBusyId.value);
const drawResourceDisabled = computed(() => !inventoryAccountReady.value || loading.value || !!error.value ||
  currentLoadedContext.value !== stockContext.value || editingStock.value || savingStock.value ||
  !!pendingStockDocument.value || importing.value || !!recordsBusyId.value || rewardImportBusy.value || dailyBusy.value || mailboxBusy.value);
const stockActionBlocked = computed(() => dailyBusy.value || mailboxBusy.value || rewardImportBusy.value || !!rewardEntryWorkspace.value?.mode ||
  importing.value || !!recordsBusyId.value || drawResourceLocked.value);

function openRewardEntry(mode, trigger) {
  if (rewardEntryDisabled.value || rewardImportBusy.value || dailyBusy.value || mailboxBusy.value) return;
  if (mode === "daily") rewardEntryWorkspace.value?.openDaily(trigger);
  else if (mode === "manual") rewardEntryWorkspace.value?.openManual(trigger);
  else rewardEntryWorkspace.value?.openReport(trigger);
}

function onRewardImported(targetAccountId) {
  if (targetAccountId !== accountId.value) return;
  reloadCurrent();
  resetAcquiredData();
  loadRecords(true);
  if (activeTab.value === "acquired") loadAcquired();
}

async function focusResourceRange() {
  markCustomRange();
  await nextTick();
  document.getElementById("acquired-range-from")?.focus();
}

async function openResourceStockEditor() {
  const seq = inventoryContextSeq;
  const isCurrent = () => !inventoryDisposed && auth.isLoggedIn && seq === inventoryContextSeq && activeTab.value === "manifest";
  await setTab("manifest");
  if (!isCurrent()) return;
  if (entityType.value !== "item") {
    entityType.value = "item";
    await reloadCurrent();
  } else if (currentLoadedContext.value !== stockContext.value) {
    await reloadCurrent();
  }
  if (isCurrent()) startStockEdit();
}

function openResourceReportImport(event) {
  openRewardEntry("report", event.currentTarget);
}

async function setTab(t) {
  if (rewardImportBusy.value) return;
  const seq = inventoryContextSeq;
  const editSeq = stockEditSeq;
  if (editingStock.value && t !== "manifest") {
    if (!(await confirmStockDiscard())) return;
    if (inventoryDisposed || seq !== inventoryContextSeq || editSeq !== stockEditSeq) return;
    cancelStockEdit();
  }
  if (inventoryDisposed || seq !== inventoryContextSeq) return;
  activeTab.value = t;
  if (t === "manifest" && currentEntries.value.length === 0) await reloadCurrent();
  if (inventoryDisposed || seq !== inventoryContextSeq || activeTab.value !== t) return;
  if (t === "manifest" && entityType.value === "agent") {
    loadAgentCatalog();
    loadAgentFavorites();
  }
  if (t === "acquired" && appliedAcquiredKey.value !== currentAcquiredKey.value)
    loadAcquired();
  if (t === "records") loadRecords(true);
}
function setEntityType(t) {
  if (editingStock.value) return;
  if (t === entityType.value) return;
  entityType.value = t;
  currentEntries.value = [];
  currentFullBaselineAt.value = null;
  error.value = "";
  reloadCurrent(false, true);
  if (t === "agent") {
    loadAgentCatalog();
    loadAgentFavorites();
  }
}

function setAcquiredEntityType(t) {
  if (!["all", "item", "agent"].includes(t) || t === acquiredEntityType.value)
    return;
  acquiredEntityType.value = t;
  acquiredSource.value = "all";
  acquiredSearch.value = "";
  clearSelectedEntity();
  applyAcquiredEntityType();
}

function clearAgentFavorites() {
  favoriteLoadSeq += 1;
  favoriteAgentIds.value = new Set();
  favoriteBusyIds.value = new Set();
  favoriteLoading.value = false;
  favoriteError.value = "";
  favoriteLoadedAccount.value = "";
  setInventoryToastFavoriteAgentIds([]);
}

async function loadAgentFavorites(force) {
  if (!auth.isLoggedIn || !accountId.value) {
    clearAgentFavorites();
    return;
  }
  const targetAccount = accountId.value;
  if (!force && favoriteLoadedAccount.value === targetAccount) return;
  const seq = ++favoriteLoadSeq;
  favoriteLoading.value = true;
  favoriteError.value = "";
  try {
    const data = await listAgentFavorites(targetAccount);
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return;
    favoriteAgentIds.value = new Set(
      Array.isArray(data && data.agent_ids) ? data.agent_ids : [],
    );
    setInventoryToastFavoriteAgentIds(Array.from(favoriteAgentIds.value));
    favoriteLoadedAccount.value = targetAccount;
  } catch (err) {
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return;
    favoriteAgentIds.value = new Set();
    setInventoryToastFavoriteAgentIds([]);
    favoriteLoadedAccount.value = "";
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
  const nextFavorites = new Set(favoriteAgentIds.value);
  if (wasFavorite) nextFavorites.delete(id);
  else nextFavorites.add(id);
  favoriteAgentIds.value = nextFavorites;
  favoriteBusyIds.value = new Set(favoriteBusyIds.value).add(id);
  favoriteError.value = "";
  try {
    const data = wasFavorite
      ? await removeAgentFavorite(targetAccount, id)
      : await addAgentFavorite(targetAccount, id);
    if (accountId.value !== targetAccount) return;
    const confirmed = new Set(favoriteAgentIds.value);
    if (data && data.favorite === false) confirmed.delete(id);
    else confirmed.add(id);
    favoriteAgentIds.value = confirmed;
    setInventoryToastFavoriteAgentIds(Array.from(confirmed));
    favoriteLoadedAccount.value = targetAccount;
  } catch (err) {
    if (accountId.value !== targetAccount) return;
    const rollback = new Set(favoriteAgentIds.value);
    if (wasFavorite) rollback.add(id);
    else rollback.delete(id);
    favoriteAgentIds.value = rollback;
    setInventoryToastFavoriteAgentIds(Array.from(rollback));
    favoriteError.value = humanErr(err, "关注状态保存失败，请重试");
  } finally {
    if (accountId.value === targetAccount) {
      const busy = new Set(favoriteBusyIds.value);
      busy.delete(id);
      favoriteBusyIds.value = busy;
    }
  }
}

function resetAcquiredData() {
  acquiredSeq += 1;
  acquiredEntries.value = [];
  acquiredRecords.value = [];
  acquiredAllRecords.value = [];
  acquiredAgentHistoryRecords.value = [];
  acquiredTotalsObject.value = {};
  acquiredTotalsByType.value = { item: {}, agent: {} };
  acquiredTotalsErrors.value = { item: "", agent: "" };
  acquiredError.value = "";
  acquiredRecordsError.value = "";
  acquiredRecordsTruncated.value = false;
  acquiredAgentHistoryError.value = "";
  acquiredAgentHistoryTruncated.value = false;
  acquiredRecordProgress.value = { pages: 0, records: 0 };
  appliedAcquiredKey.value = "";
  acquiredSource.value = "all";
  acquiredSearch.value = "";
  selectedEntityId.value = "";
  selectedDay.value = "";
}

// —— 统一子账号（库存 × 密探共用） ——
async function loadAccounts() {
  const seq = ++accountsLoadSeq;
  const identity = auth.userInfo?.id;
  if (!auth.isLoggedIn) {
    accounts.value = [];
    accountsLoading.value = false;
    clearAgentFavorites();
    return;
  }
  accountsLoading.value = true;
  accountError.value = "";
  try {
    const list = await listAccounts();
    if (seq !== accountsLoadSeq || !auth.isLoggedIn || identity !== auth.userInfo?.id || inventoryDisposed) return;
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
    if (seq === accountsLoadSeq && identity === auth.userInfo?.id && !inventoryDisposed)
      accountError.value = humanErr(err, "子账号加载失败");
  } finally {
    if (seq === accountsLoadSeq && !inventoryDisposed) accountsLoading.value = false;
  }
}

// 展示用日期（输入框仍使用 YYYY-MM-DD）；统计区间的实际边界由北京时间 05:00 生成。
function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function inputDate(value) {
  const parts = String(value || "")
    .split("-")
    .map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
  if (
    date.getFullYear() !== parts[0] ||
    date.getMonth() !== parts[1] - 1 ||
    date.getDate() !== parts[2]
  )
    return null;
  return date;
}

function addLocalDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function weekStart(date) {
  const start = new Date(date);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

function markCustomRange() {
  rangePreset.value = "custom";
}

function applyRangePreset(id) {
  const today = inputDate(businessDate(new Date()));
  let from = today;
  let to = today;
  if (id === "7d") from = addLocalDays(today, -6);
  if (id === "30d") from = addLocalDays(today, -29);
  if (id === "this-week") from = weekStart(today);
  if (id === "last-week") {
    to = addLocalDays(weekStart(today), -1);
    from = addLocalDays(to, -6);
  }
  if (id === "this-month")
    from = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  if (id === "last-month") {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12);
    to = new Date(today.getFullYear(), today.getMonth(), 0, 12);
  }
  rangePreset.value = id;
  rangeFrom.value = localDate(from);
  rangeTo.value = localDate(to);
  loadAcquired();
}

function fmtCount(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("zh-CN");
}

// —— 背包格图标约定 ——
const ICON_EXT = "png";

function iconSrc(e) {
  const type = e && e.entity_type ? e.entity_type : entityType.value;
  const kind = type === "agent" ? "agents" : "items";
  return (
    import.meta.env.BASE_URL +
    "inventory-icons/" +
    kind +
    "/" +
    encodeURIComponent(e.id) +
    "." +
    ICON_EXT
  );
}

function onImgLoad(ev) {
  const img = ev && ev.currentTarget;
  if (!img) return;
  img.hidden = false;
  if (img.parentElement) img.parentElement.classList.remove("has-icon-error");
}

function onImgError(ev) {
  const img = ev && ev.currentTarget;
  if (!img) return;
  img.hidden = true;
  if (img.parentElement) img.parentElement.classList.add("has-icon-error");
}

function monogram(e) {
  const s = String(e.name || e.id || "?");
  return Array.from(s)[0] || "?";
}

function nameOf(id, name, requestedType) {
  const type = requestedType || entityType.value;
  const local =
    type === "agent" ? agentNameById.value.get(id) : LOCAL_NAME.item.get(id);
  if (local) return local;
  if (name) return name;
  if (!catalog.value.entities.length) return id;
  const hit = catalog.value.entities.find(function (e) {
    return e.id === id && e.entity_type === type;
  });
  return hit && hit.name ? hit.name : id;
}

function acquiredNameOf(id, name) {
  if (name) return name;
  const active = acquiredEntries.value.find(function (entry) {
    return entry.id === id;
  });
  if (active && active.name) return active.name;
  const itemName = nameOf(id, null, "item");
  return itemName !== id ? itemName : nameOf(id, null, "agent");
}

function applyAcquiredEntityType() {
  const types =
    acquiredEntityType.value === "all"
      ? ["item", "agent"]
      : [acquiredEntityType.value];
  const totals = {};
  acquiredEntries.value = types
    .flatMap(function (type) {
      const acquired = acquiredTotalsByType.value[type] || {};
      return Object.keys(acquired).map(function (id) {
        const count = Number(acquired[id]) || 0;
        totals[id] = (totals[id] || 0) + count;
        return {
          id: id,
          name: nameOf(id, null, type),
          count: count,
          entity_type: type,
        };
      });
    })
    .filter(function (entry) {
      return entry.count > 0;
    })
    .sort(function (left, right) {
      return (
        right.count - left.count || left.name.localeCompare(right.name, "zh-CN")
      );
    });
  acquiredTotalsObject.value = totals;
  acquiredRecords.value =
    acquiredEntityType.value === "all"
      ? acquiredAllRecords.value.slice()
      : acquiredAllRecords.value.filter(function (record) {
          return record && record.entity_type === acquiredEntityType.value;
        });
}

const visibleItemCatalog = visibleInventoryItems(ITEM_CATALOG);
const visibleAgentCatalog = computed(function () {
  return visibleAgentEntries(operatorCatalog.value);
});
const agentCatalogEntries = computed(function () {
  return visibleAgentCatalog.value;
});
const agentGameCatalogCount = computed(function () {
  return agentCatalogEntries.value.filter(function (entry) {
    return agentMatchesGame(entry, agentGameFilter.value);
  }).length;
});
const agentVersionFavoriteCount = computed(function () {
  return agentCatalogEntries.value.filter(function (entry) {
    return (
      agentMatchesGame(entry, agentGameFilter.value) &&
      favoriteAgentIds.value.has(entry.id)
    );
  }).length;
});
const stockCatalogSections = buildItemCategorySections(
  sortItemsByGameOrder(visibleItemCatalog),
);
const stockCatalogSubsections = new Map(
  stockCatalogSections
    .flatMap(function (section) {
      return section.subsections || [];
    })
    .map(function (subsection) {
      return [subsection.id, subsection];
    }),
);
const itemCatalogCount = visibleItemCatalog.length;
const agentSubProfs = computed(function () {
  return Array.from(
    new Set(
      visibleAgentCatalog.value
        .map(function (entry) {
          return entry.subProf;
        })
        .filter(Boolean),
    ),
  );
});
const agentFacetCount = computed(function () {
  return (
    agentStatusFilters.value.length +
    agentRarityFilters.value.length +
    agentProfFilters.value.length +
    agentSubProfFilters.value.length
  );
});
const agentSortDirectionButtonLabel = computed(function () {
  return agentSortDirection.value === "desc" ? "切换为升序" : "切换为降序";
});

const LOCAL_NAME = {
  item: new Map(
    ITEM_CATALOG.map(function (e) {
      return [e.id, e.name];
    }),
  ),
};
const agentNameById = computed(function () {
  return new Map(
    visibleAgentCatalog.value.map(function (e) {
      return [e.id, e.name];
    }),
  );
});
const LOCAL_ITEM = new Map(
  ITEM_CATALOG.map(function (e) {
    return [e.id, e];
  }),
);
const localCatalog = computed(function () {
  return entityType.value === "agent"
    ? agentCatalogEntries.value
    : visibleItemCatalog;
});
const visibleCurrentEntries = computed(function () {
  return entityType.value === "item"
    ? visibleInventoryItems(currentEntries.value)
    : currentEntries.value;
});
const currentMap = computed(function () {
  const m = {};
  currentEntries.value.forEach(function (e) {
    m[e.id] = Number(e.count) || 0;
  });
  return m;
});
const resourceSummary = computed(function () {
  return resourceEquivalents(currentMap.value);
});
const manifestBaseEntries = computed(function () {
  const stock = currentMap.value;
  return localCatalog.value.map(function (entry) {
    const count = stock[entry.id] != null ? stock[entry.id] : 0;
    return Object.assign({}, entry, { count: count, owned: count > 0 });
  });
});
const manifestEntries = computed(function () {
  const q = manifestSearch.value.toLowerCase();
  const f = manifestFilter.value;
  if (entityType.value === "agent") {
    const filtered = filterAgentEntries(
      manifestBaseEntries.value,
      {
        query: q,
        game: agentGameFilter.value,
        statuses: agentStatusFilters.value,
        favoriteMode: agentFavoriteMode.value,
        rarities: agentRarityFilters.value,
        profs: agentProfFilters.value,
        subProfs: agentSubProfFilters.value,
      },
      favoriteAgentIds.value,
    );
    return sortAgentEntries(filtered, agentSort.value, favoriteAgentIds.value, {
      favoriteFirst: agentFavoriteMode.value === "priority",
      direction: agentSortDirection.value,
    });
  }
  return manifestBaseEntries.value.filter(function (e) {
    if (f === "owned" && !e.owned) return false;
    if (f === "missing" && e.owned) return false;
    if (q) {
      const hay = [e.name, e.id, e.category, e.prof, e.subProf]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
});
const manifestGameEntries = computed(function () {
  return sortItemsByGameOrder(manifestEntries.value);
});
const manifestCategorySections = computed(function () {
  return buildItemCategorySections(manifestGameEntries.value);
});
const agentGroups = computed(function () {
  return buildAgentGroups(manifestEntries.value, agentGroupBy.value);
});
const agentFiltersActive = computed(function () {
  return (
    !!manifestSearch.value ||
    agentFavoriteMode.value === "only" ||
    agentFacetCount.value > 0
  );
});
const agentEmptyMessage = computed(function () {
  if (agentFavoriteMode.value === "only" && favoriteAgentIds.value.size === 0)
    return "还没有特别关注的密探";
  if (manifestSearch.value) return "没有找到“" + manifestSearch.value + "”";
  return "当前筛选下没有密探";
});

function isAgentFavoriteBoundary(entries, index) {
  if (agentFavoriteMode.value !== "priority" || index <= 0) return false;
  const previous = entries[index - 1];
  const current = entries[index];
  return (
    !favoriteAgentIds.value.has(current.id) &&
    favoriteAgentIds.value.has(previous.id)
  );
}

function isPriorityReward(reward) {
  return (
    reward &&
    (reward.id === "baijinbi" ||
      reward.id === "zhuyu" ||
      favoriteAgentIds.value.has(reward.id))
  );
}

function clearAgentFacetFilters() {
  agentStatusFilters.value = [];
  agentRarityFilters.value = [];
  agentProfFilters.value = [];
  agentSubProfFilters.value = [];
}

function toggleAgentSortDirection() {
  agentSortDirection.value =
    agentSortDirection.value === "desc" ? "asc" : "desc";
}

function chooseAgentMenuValue(event, type, value) {
  if (type === "sort") {
    agentSort.value = value;
    if (value === "backpack") agentSortDirection.value = "desc";
  }
  if (type === "group") agentGroupBy.value = value;
  const menu = event.currentTarget.closest("details");
  if (menu) menu.open = false;
}

function positionAgentFilterMenu(event) {
  const panel = event.currentTarget;
  if (!panel.open) return;
  nextTick(function () {
    const menu = panel.querySelector(".agent-filter-menu");
    if (!menu) return;
    if (window.innerWidth > 640) {
      menu.style.left = "";
      menu.style.right = "";
      menu.style.transform = "";
      return;
    }
    const panelRect = panel.getBoundingClientRect();
    const menuWidth = Math.min(320, window.innerWidth - 32);
    const left = Math.max(
      16,
      Math.min(window.innerWidth - menuWidth - 16, panelRect.right - menuWidth),
    );
    menu.style.left = left - panelRect.left + "px";
    menu.style.right = "auto";
    menu.style.transform = "none";
  });
}

function resetAgentFilters() {
  manifestSearch.value = "";
  manifestFilter.value = "all";
  agentFavoriteMode.value = "priority";
  clearAgentFacetFilters();
}

const stockEditEntries = computed(function () {
  const baseCatalog =
    entityType.value === "agent"
      ? agentCatalogEntries.value
      : visibleItemCatalog;
  const ids = new Set(
    baseCatalog.map(function (item) {
      return item.id;
    }),
  );
  const entries = baseCatalog.slice();
  visibleCurrentEntries.value.forEach(function (item) {
    if (
      !ids.has(item.id) &&
      !(entityType.value === "agent" && isHiddenAgent(operatorCatalog.value.find(entry => entry.id === item.id) || item))
    )
      entries.push(item);
  });
  return entityType.value === "agent"
    ? sortAgentEntries(entries, "backpack", null, { direction: "desc" })
    : sortStockEditItems(entries);
});
const stockEditorEntries = computed(function () {
  if (!stockEditScopeIds.value) return stockEditEntries.value;
  const scopeIds = new Set(stockEditScopeIds.value);
  return stockEditEntries.value.filter(function (item) {
    return scopeIds.has(item.id);
  });
});
const visibleStockEditorEntries = computed(function () {
  if (entityType.value !== "agent") return stockEditorEntries.value;
  const rows = stockEditorEntries.value.map(function (entry) {
    const count = Number(currentMap.value[entry.id]) || 0;
    return Object.assign({}, entry, { count: count, owned: count > 0 });
  });
  const filtered = filterAgentEntries(
    rows,
    {
      query: manifestSearch.value,
      game: agentGameFilter.value,
      statuses: agentStatusFilters.value,
      favoriteMode: agentFavoriteMode.value,
      rarities: agentRarityFilters.value,
      profs: agentProfFilters.value,
      subProfs: agentSubProfFilters.value,
    },
    favoriteAgentIds.value,
  );
  const sorted = sortAgentEntries(filtered, agentSort.value, favoriteAgentIds.value, {
    favoriteFirst: agentFavoriteMode.value === "priority",
    direction: agentSortDirection.value,
  });
  return buildAgentGroups(sorted, agentGroupBy.value).flatMap(function (group) {
    return group.entries;
  });
});
const stockDraftError = computed(function () {
  const invalid = stockEditorEntries.value.find(function (item) {
    return !isValidStockCount(stockDraft.value[item.id]);
  });
  return invalid
    ? (invalid.name || invalid.id) +
        "的库存必须是 0 至 2,147,483,647 之间的整数"
    : "";
});
const stockChangedCount = computed(function () {
  return stockEditorEntries.value.filter(function (item) {
    const value = stockDraft.value[item.id];
    return (
      isValidStockCount(value) &&
      Number(value) !== Number(stockOriginal.value[item.id] || 0)
    );
  }).length;
});
const needsFullStockConfirmation = computed(function () {
  return editingStock.value && !stockEditScopeIds.value &&
    !Number.isFinite(Date.parse(currentFullBaselineAt.value || ""));
});
const canSaveStock = computed(function () {
  return editingStock.value && inventoryAccountReady.value &&
    stockEditContext.value === stockContext.value &&
    currentLoadedContext.value === stockContext.value &&
    !loading.value && !error.value && !savingStock.value && !stockDraftError.value &&
    (!needsFullStockConfirmation.value || stockBaselineConfirmed.value) &&
    (stockChangedCount.value > 0 || (needsFullStockConfirmation.value && stockBaselineConfirmed.value));
});
const stockEditDirty = computed(function () {
  return editingStock.value &&
    (Boolean(stockDraftError.value) || stockChangedCount.value > 0 || stockBaselineConfirmed.value);
});
const confirmStockDiscard = useUnsavedChanges(stockEditDirty, "库存草稿");
const currentAcquiredKey = computed(function () {
  return [accountId.value, rangeFrom.value, rangeTo.value].join("|");
});
const acquiredQueryDirty = computed(function () {
  return (
    !!appliedAcquiredKey.value &&
    appliedAcquiredKey.value !== currentAcquiredKey.value
  );
});
const acquiredRangeDays = computed(function () {
  const from = inputDate(rangeFrom.value);
  const to = inputDate(rangeTo.value);
  if (!from || !to || from > to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
});
const acquiredRangeLabel = computed(function () {
  const from = inputDate(rangeFrom.value);
  const to = inputDate(rangeTo.value);
  if (!from || !to || from > to) return "请选择有效的起止日期";
  const format = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  });
  return format.format(from) + " 至 " + format.format(to) + " · 包含起止当天";
});
const acquiredStats = computed(function () {
  return buildAcquiredStats(acquiredRecords.value);
});
const acquiredItemRecords = computed(function () {
  return acquiredAllRecords.value.filter(function (record) {
    return record && record.entity_type === "item";
  });
});
const acquiredAgentRecords = computed(function () {
  return acquiredAllRecords.value.filter(function (record) {
    return record && record.entity_type === "agent";
  });
});
const favoriteAgentsForStats = computed(function () {
  return operatorCatalog.value.filter(function (agent) {
    return favoriteAgentIds.value.has(agent.id);
  });
});
const goldAgentIdsForStats = computed(function () {
  return AGENT_CATALOG.filter(function (agent) {
    return Number(agent.rarity) === 5;
  }).map(function (agent) {
    return agent.id;
  });
});
const periodInsights = computed(function () {
  return buildRewardInsights({
    itemTotals: acquiredTotalsByType.value.item,
    agentTotals: acquiredTotalsByType.value.agent,
    itemRecords: acquiredItemRecords.value,
    agentRecords: acquiredAgentRecords.value,
    agentHistoryRecords: acquiredAgentHistoryRecords.value,
    agentHistoryComplete:
      !acquiredAgentHistoryError.value && !acquiredAgentHistoryTruncated.value,
    favoriteAgents: favoriteAgentsForStats.value,
    rangeEnd: rangeTo.value,
  });
});
const periodHasData = computed(function () {
  const totals = Object.values(acquiredTotalsByType.value.item || {}).concat(
    Object.values(acquiredTotalsByType.value.agent || {}),
  );
  return (
    totals.some(function (count) {
      return (Number(count) || 0) > 0;
    }) || periodInsights.value.rewardRecordCount > 0
  );
});
const acquiredActivityLabel = computed(function () {
  if (
    acquiredLoading.value ||
    acquiredQueryDirty.value ||
    acquiredRecordsError.value ||
    !periodHasData.value
  )
    return "";
  return (
    periodInsights.value.activeDayCount +
    "天 · " +
    periodInsights.value.rewardRecordCount +
    "条奖励记录"
  );
});
const acquiredRangeMetaLabel = computed(function () {
  const period = "共 " + acquiredRangeDays.value + " 天";
  return acquiredActivityLabel.value
    ? period + " · 有收获 " + acquiredActivityLabel.value
    : period;
});
const periodDispatchDuration = computed(function () {
  const summary = summarizeDispatchDuration(acquiredAllRecords.value);
  return Object.assign({}, summary, {
    source: summary.dispatchRecordCount ? "all" : "",
  });
});
const acquiredEntityMap = computed(function () {
  return new Map(
    acquiredStats.value.entities.map(function (entry) {
      return [entry.id, entry];
    }),
  );
});
const acquiredTotalsMatch = computed(function () {
  if (acquiredRecordsError.value || acquiredRecordsTruncated.value) return true;
  const recordTotals = {};
  acquiredStats.value.entities.forEach(function (entry) {
    recordTotals[entry.id] = entry.count;
  });
  return mapsHaveSameCounts(acquiredTotalsObject.value, recordTotals);
});
const selectedEntity = computed(function () {
  if (!selectedEntityId.value) return null;
  const statsEntry = acquiredEntityMap.value.get(selectedEntityId.value);
  const totalEntry = acquiredEntries.value.find(function (entry) {
    return entry.id === selectedEntityId.value;
  });
  return statsEntry || totalEntry || null;
});
const selectedDayLabel = computed(function () {
  const date = inputDate(selectedDay.value);
  return date
    ? date.getMonth() + 1 + "月" + date.getDate() + "日"
    : selectedDay.value;
});
const detailsTitle = computed(function () {
  if (selectedEntity.value) return selectedEntity.value.name + "的获得明细";
  if (selectedDay.value) return selectedDayLabel.value + "的奖励流水";
  return "奖励流水明细";
});

function entryMatchesQuery(entry, query) {
  if (!query) return true;
  const name = entry.name || acquiredNameOf(entry.id, null);
  return [entry.id, name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function isLowerRarityAgentReward(entry) {
  if (
    !entry ||
    entry.entity_type !== "agent" ||
    !agentRarityById.value.has(entry.id)
  )
    return false;
  return agentRarityById.value.get(entry.id) < 5;
}

const displayedAcquiredEntries = computed(function () {
  const query = acquiredSearch.value.toLowerCase();
  const source = acquiredSource.value;
  const recordCounts = new Map();
  acquiredStats.value.rewardRecords.forEach(function (record) {
    if (
      source !== "all" &&
      acquisitionChannel(record.acquisition_channel) !== source
    )
      return;
    const ids = new Set(
      (Array.isArray(record.entries) ? record.entries : []).map(
        function (entry) {
          return entry.id;
        },
      ),
    );
    ids.forEach(function (id) {
      recordCounts.set(id, (recordCounts.get(id) || 0) + 1);
    });
  });
  const rows = acquiredEntries.value
    .map(function (entry) {
      const detail = acquiredEntityMap.value.get(entry.id);
      const count =
        source === "all"
          ? entry.count
          : Number(detail && detail.channels[source]) || 0;
      return Object.assign({}, entry, {
        count: count,
        recordCount: recordCounts.get(entry.id) || 0,
      });
    })
    .filter(function (entry) {
      if (hideLowerRarityAgentRewards.value && isLowerRarityAgentReward(entry))
        return false;
      return entry.count > 0 && entryMatchesQuery(entry, query);
    });
  return rows.sort(function (left, right) {
    if (acquiredSort.value === "name")
      return left.name.localeCompare(right.name, "zh-CN");
    if (acquiredSort.value === "records")
      return right.recordCount - left.recordCount || right.count - left.count;
    return (
      right.count - left.count || left.name.localeCompare(right.name, "zh-CN")
    );
  });
});
const acquiredResultCaption = computed(function () {
  const source =
    acquiredSource.value === "all" ? "全部来源" : acquiredSource.value;
  const search = acquiredSearch.value
    ? "· 匹配「" + acquiredSearch.value + "」"
    : "";
  return (
    source +
    " " +
    search +
    " · 显示 " +
    displayedAcquiredEntries.value.length +
    " 种 · 点击图标查看原始流水"
  );
});

const filteredRewardRecords = computed(function () {
  const query = acquiredSearch.value.toLowerCase();
  const source = acquiredSource.value;
  return acquiredStats.value.rewardRecords
    .filter(function (record) {
      if (
        source !== "all" &&
        acquisitionChannel(record.acquisition_channel) !== source
      )
        return false;
      const entries = Array.isArray(record.entries) ? record.entries : [];
      if (
        selectedDay.value &&
        localDayKey(record.effective_at) !== selectedDay.value
      )
        return false;
      if (
        selectedEntityId.value &&
        !entries.some(function (entry) {
          return entry.id === selectedEntityId.value;
        })
      )
        return false;
      if (
        query &&
        !entries.some(function (entry) {
          return entryMatchesQuery(entry, query);
        })
      )
        return false;
      return true;
    })
    .slice()
    .sort(function (left, right) {
      return (
        new Date(right.effective_at).getTime() -
        new Date(left.effective_at).getTime()
      );
    });
});

const sourceRows = computed(function () {
  const query = acquiredSearch.value.toLowerCase();
  const selectedSource = acquiredSource.value;
  const sourceMap = new Map();
  acquiredStats.value.rewardRecords.forEach(function (record) {
    const source = acquisitionChannel(record.acquisition_channel);
    if (selectedSource !== "all" && source !== selectedSource) return;
    const entries = (
      Array.isArray(record.entries) ? record.entries : []
    ).filter(function (entry) {
      return entryMatchesQuery(entry, query);
    });
    if (query && entries.length === 0) return;
    if (!sourceMap.has(source))
      sourceMap.set(source, {
        name: source,
        recordCount: 0,
        ids: new Set(),
        counts: new Map(),
      });
    const row = sourceMap.get(source);
    row.recordCount += 1;
    entries.forEach(function (entry) {
      row.ids.add(entry.id);
      row.counts.set(
        entry.id,
        (row.counts.get(entry.id) || 0) + (Number(entry.count) || 0),
      );
    });
  });
  const rows = Array.from(sourceMap.values()).sort(function (a, b) {
    return b.recordCount - a.recordCount;
  });
  const max = rows.length ? rows[0].recordCount : 1;
  return rows.map(function (row) {
    const top = Array.from(row.counts.entries())
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .slice(0, 3);
    const favoriteTop = Array.from(row.counts.entries())
      .filter(function (pair) {
        return favoriteAgentIds.value.has(pair[0]);
      })
      .sort(function (a, b) {
        return b[1] - a[1];
      });
    const priorityEntries = Array.from(row.counts.entries())
      .filter(function (pair) {
        return pair[0] === "baijinbi" || pair[0] === "zhuyu";
      })
      .sort(function (a, b) {
        return b[1] - a[1];
      });
    const favoritePreview = favoriteTop.slice(0, 4);
    const priorityPreview = priorityEntries.concat(favoritePreview);
    const totalCount = Array.from(row.counts.values()).reduce(function (
      sum,
      count,
    ) {
      return sum + count;
    }, 0);
    const topEntry = top[0];
    const priorityText = priorityPreview.length
      ? "重点 · " +
        priorityPreview
          .map(function (pair) {
            return acquiredNameOf(pair[0], null) + " +" + fmtCount(pair[1]);
          })
          .join(" · ") +
        (favoriteTop.length > favoritePreview.length
          ? " · 另 " + (favoriteTop.length - favoritePreview.length) + " 位关注"
          : "")
      : "";
    return {
      name: row.name,
      recordCount: row.recordCount,
      entityCount: row.ids.size,
      scale: row.recordCount / max,
      topText:
        priorityText ||
        (topEntry
          ? "累计 +" +
            fmtCount(totalCount) +
            " · 主要为 " +
            acquiredNameOf(topEntry[0], null) +
            " +" +
            fmtCount(topEntry[1])
          : "累计 +0"),
    };
  });
});

const timelineRows = computed(function () {
  const stats = buildAcquiredStats(filteredRewardRecords.value);
  return stats.days
    .slice()
    .reverse()
    .map(function (day) {
      const date = inputDate(day.date);
      return Object.assign({}, day, {
        dayLabel: date
          ? date.getMonth() + 1 + "月" + date.getDate() + "日"
          : day.date,
        weekday: date
          ? new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date)
          : "",
        rewards: Object.entries(day.counts || {})
          .map(function (pair) {
            return {
              id: pair[0],
              name: acquiredNameOf(pair[0], null),
              count: Number(pair[1]) || 0,
            };
          })
          .filter(function (entry) {
            return entry.count > 0;
          })
          .sort(function (left, right) {
            return (
              right.count - left.count ||
              left.name.localeCompare(right.name, "zh-CN")
            );
          }),
      });
    });
});
const detailResultCaption = computed(function () {
  const parts = [];
  if (acquiredSource.value !== "all") parts.push(acquiredSource.value);
  if (selectedDay.value) parts.push(selectedDayLabel.value);
  if (acquiredSearch.value) parts.push("匹配「" + acquiredSearch.value + "」");
  parts.push(filteredRewardRecords.value.length + " 条奖励流水");
  return parts.join(" · ");
});

function isValidStockCount(value) {
  if (value === "" || value == null) return false;
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count <= 2147483647;
}

function adjustStockCount(id, delta) {
  const current = Number(stockDraft.value[id]);
  if (!Number.isInteger(current)) return;
  const step = id === "baijinbi" ? 10 : 1;
  stockDraft.value[id] = Math.min(2147483647, Math.max(0, current + delta * step));
}

function startSubsectionStockEdit(subcategory) {
  const subsection = stockCatalogSubsections.get(subcategory.id);
  startStockEdit(
    subsection ? subsection.entries : subcategory.entries,
    subcategory.name,
  );
}

function scrollToStockEditor() {
  nextTick(function () {
    if (!manifestPanel.value) return;
    const offset = window.matchMedia("(max-width: 640px)").matches ? 64 : 16;
    const top =
      window.scrollY + manifestPanel.value.getBoundingClientRect().top - offset;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    window.scrollTo({ top: Math.max(0, top), behavior: behavior });
  });
}

async function openStockEntry() {
  if (stockActionBlocked.value) return;
  if (activeTab.value === "manifest") return startStockEdit();
  const seq = inventoryContextSeq;
  await setTab("manifest");
  if (!inventoryDisposed && seq === inventoryContextSeq && activeTab.value === "manifest") startStockEdit();
}

function startStockEdit(scopeEntries, scopeName) {
  if (!inventoryAccountReady.value || loading.value || error.value || savingStock.value || stockActionBlocked.value || currentLoadedContext.value !== stockContext.value) return;
  if (entityType.value === "agent" && (agentCatalogLoading.value || agentCatalogError.value)) return;
  if (!auth.isLoggedIn) {
    goLogin();
    return;
  }
  if (!accountId.value) {
    alert("请先创建并选择一个子账号");
    return;
  }
  stockEditSeq += 1;
  stockEditContext.value = stockContext.value;
  stockBaselineConfirmed.value = false;
  pendingStockDocument.value = null;
  const draft = {};
  stockEditEntries.value.forEach(function (item) {
    draft[item.id] = Number(currentMap.value[item.id]) || 0;
  });
  stockDraft.value = Object.assign({}, draft);
  stockOriginal.value = Object.assign({}, draft);
  stockEditScopeIds.value = Array.isArray(scopeEntries)
    ? scopeEntries.map(function (item) {
        return item.id;
      })
    : null;
  stockEditScopeName.value = stockEditScopeIds.value
    ? String(scopeName || "")
    : "";
  stockEditError.value = "";
  stockSaveNotice.value = "";
  showImport.value = false;
  if (entityType.value === "agent") {
    agentControlsCollapsedBeforeEdit.value = agentControlsCollapsed.value;
    agentControlsCollapsed.value = true;
  }
  editingStock.value = true;
  scrollToStockEditor();
}

function restoreAgentControlsAfterEdit() {
  if (agentControlsCollapsedBeforeEdit.value == null) return;
  agentControlsCollapsed.value = agentControlsCollapsedBeforeEdit.value;
  agentControlsCollapsedBeforeEdit.value = null;
}

async function requestCancelStockEdit() {
  const seq = stockEditSeq;
  if (savingStock.value || !(await confirmStockDiscard())) return;
  if (seq !== stockEditSeq) return;
  cancelStockEdit();
}

function cancelStockEdit() {
  const refreshUnconfirmedStock = !!pendingStockDocument.value && stockEditContext.value === stockContext.value;
  stockEditSeq += 1;
  stockEditContext.value = "";
  stockBaselineConfirmed.value = false;
  pendingStockDocument.value = null;
  editingStock.value = false;
  savingStock.value = false;
  stockDraft.value = {};
  stockOriginal.value = {};
  stockEditScopeIds.value = null;
  stockEditScopeName.value = "";
  stockEditError.value = "";
  restoreAgentControlsAfterEdit();
  if (refreshUnconfirmedStock) reloadCurrent();
  if (inventoryEventRefreshPending) scheduleInventoryEventRefresh();
}

function manualSnapshotTime() {
  return nextManualSnapshotTime(
    currentFullBaselineAt.value,
    currentEntries.value.map(function (item) {
      return item.listedBaselineAt;
    }),
  );
}

function manualRecordId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return "yuanhub:manual:" + globalThis.crypto.randomUUID();
  }
  return (
    "yuanhub:manual:" + Date.now() + ":" + Math.random().toString(16).slice(2)
  );
}

async function saveStockEdit() {
  if (entityType.value === "agent" && (agentCatalogLoading.value || agentCatalogError.value)) return;
  stockEditError.value = stockDraftError.value;
  if (!canSaveStock.value) return;
  const seq = stockEditSeq;
  const context = stockContext.value;
  const targetAccount = accountId.value;
  const targetType = entityType.value;
  const isCurrent = () => seq === stockEditSeq && context === stockContext.value;
  savingStock.value = true;
  try {
    if (!pendingStockDocument.value) {
      const snapshotScope = stockEditScopeIds.value ? "listed" : "full";
      const visibleDraftEntries = stockEditorEntries.value.map(function (item) {
        return { id: item.id, name: item.name || item.id, count: Number(stockDraft.value[item.id]) };
      });
      const draftEntries = targetType === "item" && snapshotScope === "full"
        ? preserveHiddenStockEntries(visibleDraftEntries, currentEntries.value, FRONTEND_HIDDEN_ITEM_IDS)
        : visibleDraftEntries;
      pendingStockDocument.value = buildManualStockSnapshot({
        accountId: targetAccount,
        entityType: targetType,
        catalogVersion: CATALOG_VERSION,
        effectiveAt: manualSnapshotTime(),
        recordId: manualRecordId(),
        snapshotScope,
        entries: draftEntries,
      });
    }
    const result = await importInventory(pendingStockDocument.value);
    if (!isCurrent()) return;
    if (result && result.superseded) {
      pendingStockDocument.value = null;
      throw new Error("快照时间早于现有库存，未能生效");
    }
    if (!result || !(result.accepted > 0 || result.duplicates > 0))
      throw new Error("保存结果无法确认，请原样重试盘点");
    pendingStockDocument.value = null;
    editingStock.value = false;
    restoreAgentControlsAfterEdit();
    stockSaveNotice.value =
      targetType === "agent" ? "密探心纸库存已更新" : "库存已更新";
    stockBaselineConfirmed.value = false;
    stockDraft.value = {};
    stockOriginal.value = {};
    stockEditScopeIds.value = null;
    stockEditScopeName.value = "";
    inventoryEventRefreshPending = false;
    await reloadCurrent();
  } catch (err) {
    if (isCurrent()) {
      if ([400, 401, 403, 404, 409, 422].includes(err?.status)) pendingStockDocument.value = null;
      stockEditError.value = humanErr(err, "库存保存失败") +
        (pendingStockDocument.value ? "；结果未确认，草稿已锁定，请原样重试。取消编辑不会撤销服务器可能已接受的盘点。" : "");
    }
  } finally {
    if (isCurrent()) savingStock.value = false;
  }
}

async function reloadCurrent(quiet, preserveContent) {
  const seq = ++currentLoadSeq;
  const context = stockContext.value;
  currentLoadedContext.value = "";
  // 未登录时不请求云端库存（避免 401 触发自动跳转登录页），数量保持初始 0
  if (!auth.isLoggedIn) {
    currentEntries.value = [];
    currentFullBaselineAt.value = null;
    error.value = "";
    if (!preserveContent) loading.value = false;
    return;
  }
  // 未选择账号时不请求（后端 /current 需要 account_id）
  if (!accountId.value || accountsLoading.value || accountError.value || !accounts.value.some(account => account.id === accountId.value)) {
    currentEntries.value = [];
    currentFullBaselineAt.value = null;
    error.value = "";
    if (!preserveContent) loading.value = false;
    return;
  }
  if (!preserveContent) loading.value = true;
  if (!quiet) error.value = "";
  try {
    const data = await getCurrent({
      accountId: accountId.value,
      entityType: entityType.value,
    });
    if (seq !== currentLoadSeq || context !== stockContext.value) return;
    if (!Array.isArray(data) && (!data || typeof data !== "object"))
      throw new Error("库存响应无效，请重试读取");
    const list = Array.isArray(data) ? data : data ? [data] : [];
    const doc = list[0];
    if (list.length > 1 || (list.length && (!doc || typeof doc !== "object")))
      throw new Error("库存响应无效，请重试读取");
    if (doc && (!doc.entries || typeof doc.entries !== "object" || Array.isArray(doc.entries) ||
      (doc.account_id && doc.account_id !== accountId.value) ||
      (doc.entity_type && doc.entity_type !== entityType.value)))
      throw new Error("库存响应与当前账号或类型不符，请重试读取");
    const entriesObj = doc && doc.entries ? doc.entries : {};
    if (Object.values(entriesObj).some(entry => typeof entry?.count !== "number" || !Number.isSafeInteger(entry.count) || entry.count < 0))
      throw new Error("库存数量无效，请重试读取");
    currentFullBaselineAt.value = doc ? doc.full_baseline_at : null;
    currentEntries.value = Object.keys(entriesObj)
      .map(function (id) {
        const se = entriesObj[id] || {};
        const item = entityType.value === "item" ? LOCAL_ITEM.get(id) : null;
        return {
          id: id,
          name: nameOf(id, se.name),
          count: Number(se.count) || 0,
          category: item ? item.category : "",
          listedBaselineAt: se.listed_baseline_at || null,
        };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      });
    currentLoadedContext.value = context;
    if (entityType.value === 'item') inventoryCurrentRead.value = { ownerId: String(auth.userInfo?.id || ''), accountId: accountId.value, data };
  } catch (err) {
    if (seq === currentLoadSeq && context === stockContext.value && !quiet)
      error.value = humanErr(err, "加载失败，请稍后重试");
  } finally {
    if (seq === currentLoadSeq && context === stockContext.value)
      loading.value = false;
  }
}

function scheduleInventoryEventRefresh() {
  if (editingStock.value) {
    inventoryEventRefreshPending = true;
    return;
  }
  if (accountEventRefreshTimer != null) return;
  inventoryEventRefreshPending = false;
  accountEventRefreshTimer = setTimeout(function () {
    accountEventRefreshTimer = null;
    reloadCurrent(true);
    if (activeTab.value === "acquired") loadAcquired();
  }, 180);
}

function handleInventoryAccountEvent(message) {
  if (!message) return;
  if (message.event === "account_stream_open") {
    if (!message.data?.reconnected) return;
    scheduleInventoryEventRefresh();
    return;
  }
  if (message.event !== "inventory_import") return;
  const data = message.data || {};
  if (data.account_id && data.account_id !== accountId.value) return;
  scheduleInventoryEventRefresh();
}

function dayStartIso(dStr) {
  return businessDayStartIso(dStr);
}

function nextDayStartIso(dStr) {
  return nextBusinessDayStartIso(dStr);
}

let acquiredSeq = 0;
const MAX_ACQUIRED_RECORD_PAGES = 50;

function setAcquiredView(view) {
  acquiredView.value = view;
  if (view !== "details") {
    selectedEntityId.value = "";
    selectedDay.value = "";
  }
}

function openEntityDetails(id) {
  selectedEntityId.value = id;
  selectedDay.value = "";
  acquiredView.value = "details";
}

function openDayDetails(day) {
  selectedDay.value = day;
  selectedEntityId.value = "";
  acquiredView.value = "details";
}

function clearSelectedEntity() {
  selectedEntityId.value = "";
  selectedDay.value = "";
}

function focusSource(source) {
  acquiredSource.value = source;
  acquiredView.value = "overview";
  selectedEntityId.value = "";
  selectedDay.value = "";
}

function recordChannel(record) {
  return acquisitionChannel(record && record.acquisition_channel);
}

function visibleRecordEntries(record) {
  const query = acquiredSearch.value.toLowerCase();
  const entries = Array.isArray(record && record.entries) ? record.entries : [];
  return entries.filter(function (entry) {
    if (selectedEntityId.value) return entry.id === selectedEntityId.value;
    return entryMatchesQuery(entry, query);
  });
}

function fmtRecordDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: BUSINESS_TIMEZONE,
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function fmtRecordClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function fetchAcquiredRecords(params, seq, trackProgress = true) {
  const records = [];
  const seenCursors = new Set();
  let cursor = null;
  let pages = 0;
  let truncated = false;
  do {
    const page = await listRecords({
      accountId: params.accountId,
      entityType: params.entityType,
      from: params.from,
      to: params.to,
      cursor: cursor,
      limit: 100,
    });
    if (seq !== acquiredSeq)
      return { records: [], truncated: false, cancelled: true };
    const items = page && Array.isArray(page.items) ? page.items : [];
    records.push(...items);
    pages += 1;
    if (trackProgress)
      acquiredRecordProgress.value = { pages: pages, records: records.length };
    const nextCursor = page && page.next_cursor ? page.next_cursor : null;
    if (!nextCursor) break;
    if (seenCursors.has(nextCursor))
      throw new Error("流水分页游标重复，已停止加载");
    seenCursors.add(nextCursor);
    cursor = nextCursor;
    if (pages >= MAX_ACQUIRED_RECORD_PAGES) {
      truncated = true;
      break;
    }
  } while (cursor);
  return { records: records, truncated: truncated, cancelled: false };
}

async function loadAcquired() {
  const seq = ++acquiredSeq;
  acquiredError.value = "";
  acquiredRecordsError.value = "";
  acquiredRecordsTruncated.value = false;
  acquiredAgentHistoryError.value = "";
  acquiredAgentHistoryTruncated.value = false;
  acquiredTotalsErrors.value = { item: "", agent: "" };
  acquiredRecordProgress.value = { pages: 0, records: 0 };
  selectedEntityId.value = "";
  selectedDay.value = "";
  acquiredSource.value = "all";
  if (!auth.isLoggedIn) {
    acquiredEntries.value = [];
    acquiredRecords.value = [];
    acquiredAllRecords.value = [];
    acquiredAgentHistoryRecords.value = [];
    acquiredTotalsObject.value = {};
    acquiredTotalsByType.value = { item: {}, agent: {} };
    acquiredError.value = "登录后才能统计子账号的获得量";
    return;
  }
  if (!accountId.value) {
    acquiredEntries.value = [];
    acquiredRecords.value = [];
    acquiredAllRecords.value = [];
    acquiredAgentHistoryRecords.value = [];
    acquiredTotalsObject.value = {};
    acquiredTotalsByType.value = { item: {}, agent: {} };
    acquiredError.value = "请先创建并选择一个子账号";
    return;
  }
  const fromDate = inputDate(rangeFrom.value);
  const toDate = inputDate(rangeTo.value);
  const from = dayStartIso(rangeFrom.value);
  const to = nextDayStartIso(rangeTo.value);
  if (!fromDate || !toDate || fromDate > toDate || !from || !to) {
    acquiredError.value = "请选择有效的起止日期";
    return;
  }

  acquiredLoading.value = true;
  acquiredEntries.value = [];
  acquiredRecords.value = [];
  acquiredAllRecords.value = [];
  acquiredAgentHistoryRecords.value = [];
  acquiredTotalsObject.value = {};
  acquiredTotalsByType.value = { item: {}, agent: {} };
  const queryKey = currentAcquiredKey.value;
  const baseParams = { accountId: accountId.value, from: from, to: to };
  const itemParams = Object.assign({}, baseParams, { entityType: "item" });
  const agentParams = Object.assign({}, baseParams, { entityType: "agent" });
  loadAgentFavorites();
  try {
    const results = await Promise.allSettled([
      getAcquired(itemParams),
      getAcquired(agentParams),
      fetchAcquiredRecords(baseParams, seq),
      fetchAcquiredRecords(
        { accountId: accountId.value, entityType: "agent", to: to },
        seq,
        false,
      ),
    ]);
    if (seq !== acquiredSeq) return;
    const itemTotalsResult = results[0];
    const agentTotalsResult = results[1];
    const recordsResult = results[2];
    const agentHistoryResult = results[3];
    const nextTotals = { item: {}, agent: {} };
    const nextErrors = { item: "", agent: "" };
    if (itemTotalsResult.status === "fulfilled")
      nextTotals.item =
        itemTotalsResult.value && itemTotalsResult.value.acquired
          ? itemTotalsResult.value.acquired
          : {};
    else
      nextErrors.item = humanErr(
        itemTotalsResult.reason,
        "背包奖励汇总加载失败",
      );
    if (agentTotalsResult.status === "fulfilled")
      nextTotals.agent =
        agentTotalsResult.value && agentTotalsResult.value.acquired
          ? agentTotalsResult.value.acquired
          : {};
    else
      nextErrors.agent = humanErr(
        agentTotalsResult.reason,
        "密探心纸汇总加载失败",
      );
    acquiredTotalsByType.value = nextTotals;
    acquiredTotalsErrors.value = nextErrors;

    if (
      recordsResult.status === "fulfilled" &&
      !recordsResult.value.cancelled
    ) {
      acquiredAllRecords.value = recordsResult.value.records;
      acquiredRecordsTruncated.value = recordsResult.value.truncated;
    } else if (recordsResult.status === "rejected") {
      acquiredRecordsError.value = humanErr(
        recordsResult.reason,
        "流水明细加载失败",
      );
    }
    if (
      agentHistoryResult.status === "fulfilled" &&
      !agentHistoryResult.value.cancelled
    ) {
      acquiredAgentHistoryRecords.value = agentHistoryResult.value.records;
      acquiredAgentHistoryTruncated.value = agentHistoryResult.value.truncated;
    } else if (agentHistoryResult.status === "rejected") {
      acquiredAgentHistoryError.value = humanErr(
        agentHistoryResult.reason,
        "密探历史流水加载失败",
      );
    }
    applyAcquiredEntityType();
    resourceReportRange.value = { from: localDate(fromDate), to: localDate(toDate) };
    appliedAcquiredKey.value = queryKey;
    if (
      itemTotalsResult.status === "rejected" &&
      agentTotalsResult.status === "rejected" &&
      recordsResult.status === "rejected"
    ) {
      acquiredError.value = "据点收获统计和奖励流水均加载失败，请稍后重试";
    }
  } finally {
    if (seq === acquiredSeq) acquiredLoading.value = false;
  }
}

function humanErr(err, fallback) {
  if (!err) return fallback;
  const msg = err.message;
  if (!msg) return fallback;
  if (/Failed to fetch|NetworkError|fetch/i.test(msg))
    return "暂时无法连接 YuanHub，请检查网络后重试；仍失败时请反馈。";
  return msg;
}

function goLogin() {
  location.href = "/login";
}

// ---- 导入记录（游标分页） ----
function setRecordsEntityType(type) {
  if (
    !["all", "item", "agent"].includes(type) ||
    type === recordsEntityType.value
  )
    return;
  recordsEntityType.value = type;
  recordsList.value = [];
  recordsNextCursor.value = null;
  loadRecords(true);
}

async function loadRecords(reset) {
  if (recordsLoading.value) return;
  if (!accountId.value) {
    recordsList.value = [];
    recordsError.value = "请先创建并选择一个子账号";
    recordsLoading.value = false;
    return;
  }
  const requestSeq = ++recordsLoadSeq;
  const targetAccount = accountId.value;
  const targetType = recordsEntityType.value;
  recordsLoading.value = true;
  recordsError.value = "";
  try {
    const cursor = reset ? null : recordsNextCursor.value;
    const page = await listRecords({
      accountId: targetAccount,
      entityType:
        targetType === "all" ? undefined : targetType,
      cursor: cursor,
      limit: 50,
    });
    if (requestSeq !== recordsLoadSeq || targetAccount !== accountId.value || targetType !== recordsEntityType.value) return;
    const items = page && Array.isArray(page.items) ? page.items : [];
    recordsList.value = reset ? items : recordsList.value.concat(items);
    recordsNextCursor.value =
      page && page.next_cursor ? page.next_cursor : null;
  } catch (err) {
    if (requestSeq !== recordsLoadSeq || targetAccount !== accountId.value || targetType !== recordsEntityType.value) return;
    recordsError.value = humanErr(err, "加载记录失败");
    recordsRetryReset.value = reset;
  } finally {
    if (requestSeq === recordsLoadSeq) recordsLoading.value = false;
  }
}

async function onDeleteRecord(rec) {
  const rid = rec && rec.record_id;
  if (!rid || !accountId.value || !auth.isLoggedIn || inventoryDisposed || recordsBusyId.value || recordsLoading.value || drawResourceLocked.value) return;
  const targetAccount = accountId.value;
  const contextSeq = inventoryContextSeq;
  const isCurrent = () => !inventoryDisposed && auth.isLoggedIn && contextSeq === inventoryContextSeq && accountId.value === targetAccount;
  const summary = (rec.entity_type === "agent" ? "心纸" : "道具") +
    " · " + (rec.record_type === "reward_delta" ? "奖励" : rec.record_type === "resource_delta" ? "符传使用 / 兑换" : "库存更新") +
    " · " + fmtTime(rec.effective_at) + " · " + entrySummary(rec.entries, rec.record_type);
  const confirmed = await dialog.confirm({
    title: "删除库存记录？",
    message: "账号「" + currentAccountName.value + "」的记录：" + summary + "。删除后会重建库存；可在本页撤销。",
    type: "danger",
    confirmText: "删除记录",
  });
  if (!confirmed || !isCurrent() || recordsBusyId.value || recordsLoading.value || drawResourceLocked.value) return;
  recordsBusyId.value = rid;
  recordsActionError.value = "";
  try {
    await deleteRecord(rid, targetAccount);
    if (!isCurrent()) return;
    deletedRecordNotices.value = deletedRecordNotices.value.filter(function (notice) { return notice.recordId !== rid; });
    deletedRecordNotices.value.push({ recordId: rid, accountId: targetAccount, summary });
    recordsList.value = recordsList.value.filter(function (item) { return item.record_id !== rid; });
    await loadRecords(true);
    if (!isCurrent()) return;
    await reloadCurrent();
    if (!isCurrent()) return;
    resetAcquiredData();
  } catch (err) {
    if (isCurrent()) recordsActionError.value = humanErr(err, "删除失败");
  } finally {
    if (isCurrent()) recordsBusyId.value = "";
  }
}

async function onRestoreRecord(notice) {
  if (!notice || !accountId.value || !auth.isLoggedIn || inventoryDisposed || recordsBusyId.value || drawResourceLocked.value || accountId.value !== notice.accountId) return;
  const contextSeq = inventoryContextSeq;
  const isCurrent = () => !inventoryDisposed && auth.isLoggedIn && contextSeq === inventoryContextSeq && accountId.value === notice.accountId;
  recordsBusyId.value = notice.recordId;
  recordsActionError.value = "";
  try {
    await restoreRecord(notice.recordId, notice.accountId);
    if (!isCurrent()) return;
    deletedRecordNotices.value = deletedRecordNotices.value.filter(function (item) { return item.recordId !== notice.recordId; });
    await loadRecords(true);
    if (!isCurrent()) return;
    await reloadCurrent();
    if (!isCurrent()) return;
    resetAcquiredData();
  } catch (err) {
    if (isCurrent()) {
      recordsActionError.value = err?.code === "record_already_exists"
        ? "同编号记录已重新导入，无法撤销；现有库存未更改"
        : err?.code === "deleted_record_not_found"
          ? "这条删除备份不存在或已恢复，无法撤销"
          : humanErr(err, "恢复记录失败，请重试");
    }
  } finally {
    if (isCurrent()) recordsBusyId.value = "";
  }
}

function stockEffectLabel(eff) {
  if (eff === "applied") return "已生效";
  if (eff === "history_only") return "仅历史";
  if (eff === "superseded") return "已归档";
  return eff || "未知";
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false, timeZone: BUSINESS_TIMEZONE });
}

function entrySummary(entries, recordType) {
  return resourceEntrySummary(entries, recordType);
}

// ---- 导入档案 ----
async function confirmDrawDraft() {
  return !drawResourceEntry.value || await drawResourceEntry.value.confirmDiscard();
}

async function beforeAccountSwitch() {
  if (dailyBusy.value || drawResourceLocked.value || mailboxBusy.value || savingStock.value || pendingStockDocument.value || importing.value || rewardImportBusy.value || recordsBusyId.value) return false;
  const contextSeq = inventoryContextSeq;
  if (drawResourceEntry.value && !(await drawResourceEntry.value.confirmDiscard())) return false;
  if (mailboxReserve.value && !(await mailboxReserve.value.confirmDiscard())) return false;
  if (contextSeq !== inventoryContextSeq || !(await confirmStockDiscard()) || contextSeq !== inventoryContextSeq) return false;
  if (rewardEntryWorkspace.value?.hasDraft?.() || dailyRewards.value?.hasDraft?.() || (importText.value.trim() && !importResult.value)) {
    return dialog.confirm({ title: '放弃当前账号的录入草稿？', message: '切换账号会关闭录入工作台与导入预览。已保存的数据不受影响。', type: 'danger', confirmText: '放弃并切换', cancelText: '继续处理' });
  }
  return true;
}

async function doImport() {
  if (drawResourceLocked.value) return;
  if (!auth.isLoggedIn) {
    goLogin();
    return;
  }
  importError.value = "";
  if (!importText.value.trim()) {
    importError.value = "请粘贴交换协议 JSON 或选择文件";
    return;
  }
  let doc = null;
  try {
    doc = JSON.parse(importText.value);
    validateInventoryExchangeDocument(doc);
  } catch (err) {
    importError.value =
      err instanceof SyntaxError
        ? "JSON 解析失败，请检查格式"
        : humanErr(err, "导入档案校验失败");
    return;
  }
  const contextSeq = inventoryContextSeq;
  importing.value = true;
  importResult.value = null;
  try {
    const res = await importInventory(doc);
    if (contextSeq !== inventoryContextSeq) return;
    importResult.value = res || {};
  } catch (err) {
    if (contextSeq !== inventoryContextSeq) return;
    importError.value = humanErr(err, "导入失败");
  } finally {
    if (contextSeq === inventoryContextSeq) importing.value = false;
  }
}

function onFilePick(ev) {
  const file = ev && ev.target && ev.target.files && ev.target.files[0];
  if (!file) return;
  const contextSeq = inventoryContextSeq;
  const reader = new FileReader();
  reader.onload = function () {
    if (contextSeq !== inventoryContextSeq) return;
    importText.value = String(reader.result || "");
    importError.value = "";
  };
  reader.readAsText(file, "utf-8");
}

async function fillExample() {
  if (loadingExample.value) return;
  loadingExample.value = true;
  try {
    const res = await fetch(
      import.meta.env.BASE_URL + "inventory-import-example.json",
    );
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    // 示例文档里的 account_id 为占位符 acc_demo_main：若已选择子账号，则替换为当前账号，
    // 使示例可以直接导入（后端要求 records 引用的 account_id 必须归属当前用户）。
    if (accountId.value) {
      try {
        const doc = JSON.parse(text);
        if (doc && doc.accounts && Array.isArray(doc.accounts)) {
          doc.accounts = doc.accounts.map(function (a) {
            return Object.assign({}, a, { id: accountId.value });
          });
        }
        if (doc && Array.isArray(doc.records)) {
          doc.records = doc.records.map(function (r) {
            return Object.assign({}, r, { account_id: accountId.value });
          });
        }
        importText.value = JSON.stringify(doc, null, 2);
        importError.value = "";
      } catch (_e) {
        importText.value = text;
        importError.value = "";
      }
    } else {
      importText.value = text;
      importError.value = "";
    }
  } catch (err) {
    alert(humanErr(err, "加载示例失败"));
  } finally {
    loadingExample.value = false;
  }
}

function afterImport() {
  importResult.value = null;
  importText.value = "";
  importError.value = "";
  showImport.value = false;
  reloadCurrent();
  resetAcquiredData();
  if (activeTab.value === "acquired") loadAcquired();
}

// ---- 导出档案 ----
async function doExport() {
  if (!auth.isLoggedIn) {
    goLogin();
    return;
  }
  if (!accountId.value) {
    alert("请先创建并选择一个子账号");
    return;
  }
  const contextSeq = inventoryContextSeq;
  try {
    const opts = {
      include: "current,rewards",
      from: dayStartIso(rangeFrom.value),
      to: nextDayStartIso(rangeTo.value),
    };
    if (exportAll.value && accounts.value.length > 1) {
      opts.scope = "all";
    } else {
      opts.accountId = accountId.value;
    }
    const data = await exportInventory(opts);
    if (contextSeq !== inventoryContextSeq) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "inventory-export.json";
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (err) {
    if (contextSeq !== inventoryContextSeq) return;
    alert(humanErr(err, "导出失败"));
  }
}

async function loadAgentCatalog() {
  agentCatalogLoading.value = true;
  agentCatalogError.value = "";
  try {
    const data = await getOperatorCatalog();
    if (!Array.isArray(data?.operators)) throw new Error("密探目录响应无效");
    operatorCatalog.value = normalizeOperatorCatalog(data.operators);
  } catch (_error) {
    operatorCatalog.value = [];
    agentCatalogError.value = "密探目录同步失败";
  } finally {
    agentCatalogLoading.value = false;
  }
}

async function loadCatalog() {
  catalogLoading.value = true;
  catalogError.value = "";
  try {
    const data = await getCatalog();
    if (!Array.isArray(data?.entities)) throw new Error("对象目录响应无效");
    catalog.value = { entities: data.entities };
  } catch (_error) {
    catalogError.value = "对象目录同步失败";
  } finally {
    catalogLoading.value = false;
  }
}

onMounted(async function () {
  await Promise.all([
    loadCatalog(),
    loadAgentCatalog(),
  ]);
  if (inventoryDisposed) return;
  await loadAccounts();
  if (inventoryDisposed) return;
  inventoryPageReady = true;
  reloadCurrent();
  if (activeTab.value !== "manifest") setTab(activeTab.value);
  unsubscribeAccountEvents = subscribeAccountEvents(
    handleInventoryAccountEvent,
  );
});

watch([accountId, () => auth.isLoggedIn, () => auth.userInfo?.id, agentGameFilter], function (values, previous) {
  inventoryContextSeq += 1;
  // 锁由发起 generation 持有；失效时释放，旧 finally 不得清除新操作的锁。
  recordsBusyId.value = "";
  recordsActionError.value = "";
  deletedRecordNotices.value = [];
  currentLoadSeq += 1;
  recordsLoadSeq += 1;
  currentLoadedContext.value = "";
  currentFullBaselineAt.value = null;
  currentEntries.value = [];
  stockSaveNotice.value = "";
  importText.value = "";
  importResult.value = null;
  importError.value = "";
  importing.value = false;
  showArchive.value = false;
  inventoryEventRefreshPending = false;
  cancelStockEdit();
  clearAgentFavorites();
  resetAcquiredData();
  recordsList.value = [];
  recordsNextCursor.value = null;
  recordsLoading.value = false;
  acquiredLoading.value = false;
  const authChanged = values[1] !== previous[1] || values[2] !== previous[2];
  if (authChanged) {
    accountsLoadSeq += 1;
    accounts.value = [];
    accountsLoading.value = false;
    accountError.value = "";
  }
  if (!inventoryPageReady) return;
  const refresh = () => {
    if (!inventoryPageReady || inventoryDisposed) return;
    reloadCurrent();
    if (activeTab.value === "acquired") loadAcquired();
    if (activeTab.value === "records") loadRecords(true);
  };
  if (authChanged && auth.isLoggedIn) {
    const identity = auth.userInfo?.id;
    loadAccounts().then(function () {
      if (auth.isLoggedIn && identity === auth.userInfo?.id) refresh();
    });
  } else refresh();
}, { flush: "sync" });

onBeforeUnmount(function () {
  inventoryDisposed = true;
  inventoryContextSeq += 1;
  recordsBusyId.value = "";
  inventoryPageReady = false;
  currentLoadSeq += 1;
  accountsLoadSeq += 1;
  stockEditSeq += 1;
  acquiredSeq += 1;
  recordsLoadSeq += 1;
  if (unsubscribeAccountEvents) unsubscribeAccountEvents();
  if (accountEventRefreshTimer != null) clearTimeout(accountEventRefreshTimer);
});
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* ---- 数据交换 ---- */
.archive-toggle {
  background: transparent;
}
.load-more {
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  border-radius: 999px;
  cursor: pointer;
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease);
}
.load-more:hover:not(:disabled) {
  border-color: var(--ink);
  background: var(--cream);
}
.load-more:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.act-btn {
  border: 1.5px solid var(--line);
  background: var(--surface);
  border-radius: 999px;
  color: var(--ink-60);
  cursor: pointer;
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    border-color 0.3s var(--ease);
}
.act-btn.ghost:hover:not(:disabled) {
  border-color: var(--ink);
  color: var(--ink);
}
.act-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.import-box {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
}
.import-box .tip {
  color: var(--ink-60);
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

.type-switch {
  background: var(--theme-wash, rgba(73, 59, 44, 0.06));
  border-radius: 12px;
}
.type-switch button {
  border: none;
  background: transparent;
  border-radius: 9px;
  cursor: pointer;
  color: var(--ink-60);
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease);
}
.type-switch button.on {
  background: var(--yellow);
  color: var(--ink);
}
.type-switch button:hover:not(.on) {
  color: var(--ink);
}
.type-switch button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 1px;
}
.type-switch button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.type-switch .hint {
  color: var(--ink-35);
}
.stock-save-notice {
  color: var(--theme-accent-text, var(--accent-strong));
}

/* ---- 追踪目录工具条 ---- */
.manifest-scope {
  border-right: 1px dashed var(--line);
  color: var(--ink-60);
}
.manifest-scope > svg {
  color: var(--theme-accent-text, var(--accent-strong));
}
.manifest-scope p b {
  color: var(--theme-accent-text, var(--accent-strong));
}
.scope-guidance svg {
  color: var(--theme-accent-text, var(--accent-strong));
}
.manifest-scope button {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-accent-text, var(--accent-strong));
  cursor: pointer;
}
.manifest-scope button:hover:not(:disabled) {
  background: var(--yellow);
  color: var(--ink);
}
.manifest-scope button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 2px;
}
.manifest-scope button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.manifest-scope .manifest-edit-actions .primary {
  background: var(--tea);
  color: var(--on-strong);
}
.manifest-scope .manifest-edit-actions .primary:hover:not(:disabled) {
  background: var(--theme-control-bg, var(--ink));
  color: var(--on-strong);
}
.manifest-toolbar {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 16px;
}
.manifest-bar-divider {
  background: var(--line);
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
  transition: transform 0.45s var(--ease);
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
  transition:
    color 0.3s var(--ease),
    background-color 0.3s var(--ease),
    box-shadow 0.3s var(--ease);
}
.mf-filter button.on {
  background: var(--surface);
  color: var(--theme-accent-text, var(--accent-strong));
  box-shadow: 0 1px 4px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.16);
}
.mf-filter button:hover:not(.on) {
  color: var(--ink);
}
.mf-sync-error {
  color: var(--theme-danger-text, var(--rouge));
}
.agent-controls {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 12px 28px -22px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.4);
}
.agent-controls-toggle {
  border: 1px solid var(--tea);
  border-radius: 6px;
  background: var(--tea);
  color: var(--on-strong);
  cursor: pointer;
  box-shadow: 0 3px 8px -6px var(--tea);
}
.agent-controls-toggle svg {
  transition: transform 0.2s var(--ease);
}
.agent-controls-toggle:hover {
  border-color: var(--ink);
  background: var(--theme-control-bg, var(--ink));
  color: var(--on-strong);
}
.agent-controls-toggle:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.agent-menu-control summary {
  border: 1.5px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  transition:
    border-color 0.18s var(--ease),
    background-color 0.18s var(--ease),
    box-shadow 0.18s var(--ease);
}
.agent-menu-control summary > svg:last-child {
  color: var(--ink-60);
  transition: transform 0.18s var(--ease);
}
.agent-menu-control summary:hover {
  border-color: var(--accent);
  background: var(--paper);
}
.agent-menu-control[open] summary {
  border-color: var(--accent);
  background: var(--paper);
  box-shadow: 0 4px 12px -10px var(--tea);
}
.agent-menu-control summary:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.agent-menu-options {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 18px 34px -20px var(--tea);
}
.agent-menu-options button {
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
  transition:
    background-color 0.16s var(--ease),
    color 0.16s var(--ease);
}
.agent-menu-options button:hover {
  background: var(--paper);
  color: var(--ink);
}
.agent-menu-options button.selected {
  background: var(--yellow);
  color: var(--ink);
}
.agent-menu-options button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: -2px;
}
.agent-menu-options button svg {
  color: var(--theme-accent-text, var(--accent-strong));
}
.agent-controls > label > span:not(.sr-only) {
  color: var(--ink-60);
}
.agent-controls select,
.agent-control-search input {
  border: 1.5px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  outline: none;
}
.agent-select-control > svg {
  color: var(--ink-60);
  pointer-events: none;
}
.agent-select-control select {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
}
.agent-select-control:hover select {
  border-color: var(--accent);
  background: var(--paper);
}
.agent-controls select:focus,
.agent-control-search input:focus {
  border-color: var(--theme-focus, var(--accent));
}
.agent-select-control select:focus {
  border-color: var(--theme-focus, var(--accent));
  background: var(--paper);
}
.agent-control-search > svg {
  color: var(--ink-35);
  pointer-events: none;
}
.agent-favorite-mode {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--paper);
}
.agent-favorite-mode button {
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
}
.agent-favorite-mode button.on {
  background: var(--yellow);
  color: var(--ink);
  box-shadow: 0 1px 3px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.14);
}
.agent-favorite-mode button:hover:not(:disabled):not(.on) {
  color: var(--ink);
}
.agent-favorite-mode button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.agent-favorite-mode button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}
.agent-filter-panel summary {
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
}
.agent-filter-panel summary span {
  border-radius: 4px;
  background: var(--paper);
  color: var(--theme-strong-text, var(--tea));
}
.agent-filter-panel[open] summary {
  border-color: var(--accent);
  background: var(--paper);
  color: var(--ink);
}
.agent-filter-panel summary:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.agent-filter-menu {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 18px 38px -22px var(--tea);
}
.agent-filter-menu-head {
  border-bottom: 1px solid var(--line);
}
.agent-filter-menu-head strong {
  color: var(--ink);
}
.agent-filter-menu-head button {
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--theme-accent-text, var(--accent-strong));
  cursor: pointer;
}
.agent-filter-menu-head button:hover {
  background: var(--paper);
  color: var(--ink);
}
.agent-gold-filter {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
}
.agent-gold-filter.selected {
  border-color: var(--accent);
  background: var(--yellow);
}
.agent-gold-filter:focus-within {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.agent-gold-filter input {
  accent-color: var(--tea);
}
.agent-filter-group {
  border-bottom: 1px solid var(--line);
}
.agent-filter-group:last-child {
  border-bottom: 0;
}
.agent-filter-group-title {
  color: var(--ink-60);
}
.agent-filter-options label {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
  transition:
    color 0.18s var(--ease),
    background-color 0.18s var(--ease),
    border-color 0.18s var(--ease);
}
.agent-filter-options label:hover {
  border-color: var(--accent);
  color: var(--ink);
}
.agent-filter-options label.selected {
  border-color: var(--accent);
  background: var(--yellow);
  color: var(--ink);
}
.agent-filter-options label:focus-within {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 1px;
}
.agent-filter-options input {
  accent-color: var(--tea);
}
.agent-sort-direction,
.agent-reset {
  border: 1.5px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
}
.agent-sort-direction {
  background: var(--paper);
}
.agent-sort-direction svg {
  transition: transform 0.18s var(--ease);
}
.agent-sort-direction:hover,
.agent-reset:hover {
  border-color: var(--ink);
  color: var(--ink);
}
.agent-sort-direction:focus-visible,
.agent-reset:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.agent-reset {
  background: transparent;
}
.agent-sort-direction::after,
.manifest-agents .agent-favorite-btn::after,
.agent-controls-toggle::after,
.agent-select-control::after {
  border-radius: 5px;
  background: var(--tea);
  color: var(--on-strong);
  content: attr(data-tooltip);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.16s var(--ease),
    transform 0.16s var(--ease);
}
.agent-sort-direction:hover::after,
.agent-sort-direction:focus-visible::after,
.manifest-agents .agent-favorite-btn:hover::after,
.manifest-agents .agent-favorite-btn:focus-visible::after,
.agent-controls-toggle:hover::after,
.agent-controls-toggle:focus-visible::after,
.agent-select-control:hover::after,
.agent-select-control:focus-within::after {
  opacity: 1;
}
.agent-result,
.agent-sync-state {
  color: var(--ink-60);
}
.agent-sync-state.is-error {
  color: var(--theme-danger-text, var(--rouge));
}
.state.slim {
  border-radius: 14px;
}

.sr-only {
  border: 0;
}
.acquired-query {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.query-eyebrow,
.ledger-head > div > span {
  color: var(--theme-accent-text, var(--accent-strong));
}
.acquired-query h2 {
  color: var(--ink);
}
.quick-range {
  border-top: 1px dashed var(--line);
}
.quick-range button {
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--paper);
  color: var(--ink-60);
  cursor: pointer;
  transition:
    background-color 0.2s var(--ease),
    border-color 0.2s var(--ease),
    color 0.2s var(--ease);
}
.quick-range button.on {
  border-color: var(--yellow-deep);
  background: var(--yellow);
  color: var(--ink);
}
.quick-range button:hover:not(:disabled):not(.on) {
  border-color: var(--ink);
  color: var(--ink);
}
.quick-range button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.range .lb {
  color: var(--ink-60);
}
.range-dash {
  color: var(--ink-35);
}
.range input {
  border: 1.5px solid var(--line);
  border-radius: 10px;
  color: var(--ink);
  background: var(--paper);
  outline: none;
  transition: border-color 0.3s;
}
.range input:focus {
  border-color: var(--theme-focus, var(--accent));
}
.range-caption {
  color: var(--ink-60);
}
.range-caption svg {
  color: var(--theme-accent-text, var(--accent-strong));
}
.range-caption-lines > span:last-child {
  color: var(--theme-accent-text, var(--accent-strong));
}
.query-dirty {
  border: 1px solid var(--accent);
  border-radius: 999px;
  color: var(--theme-accent-text, var(--accent-strong));
}
.spin {
  animation: acquired-spin 0.8s linear infinite;
}
@keyframes acquired-spin {
  to {
    transform: rotate(360deg);
  }
}
.btn {
  border-radius: 12px;
  cursor: pointer;
  transition:
    color 0.35s var(--ease),
    background-color 0.35s var(--ease),
    border-color 0.35s var(--ease),
    transform 0.35s var(--ease);
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

.state {
  background: var(--surface);
  border: 1.5px dashed var(--line);
  border-radius: 20px;
  color: var(--ink-35);
}
.state.err {
  color: var(--ink-60);
}
.inventory-inline-state {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--ink-60);
}
.inventory-inline-state.is-error {
  border-color: var(--rouge);
  color: var(--theme-danger-text, var(--rouge));
}
.inventory-inline-state .link,
.state .link {
  background: none;
  border: none;
  color: var(--theme-accent-text, var(--accent-strong));
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.acquired-loading {
  color: var(--ink-60);
}
.acquired-loading small {
  color: var(--ink-35);
}
.loading-seal {
  border: 1.5px solid var(--brand-blue);
  border-radius: 8px;
  color: var(--theme-info-text, var(--brand-blue));
}
.acquired-empty strong {
  color: var(--ink);
}
.acquired-empty span {
  color: var(--ink-60);
}

.acquired-notices {
  border: 1px dashed var(--accent);
  border-radius: 10px;
  background: var(--cream);
  color: var(--ink-60);
}
.acquired-views {
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.acquired-views button {
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink-60);
  cursor: pointer;
  transition:
    background-color 0.2s var(--ease),
    color 0.2s var(--ease);
}
.acquired-views button.on {
  background: var(--tea);
  color: var(--on-strong);
}
.acquired-views button:hover:not(.on) {
  background: var(--paper);
  color: var(--ink);
}
.acquired-filters > label > span:not(.sr-only) {
  color: var(--ink-60);
}
.acquired-filters select,
.acquired-filters input {
  border: 1.5px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  color: var(--ink);
  outline: none;
}
.acquired-filters select {
  cursor: pointer;
}
.acquired-filters select:focus,
.acquired-filters input:focus {
  border-color: var(--theme-focus, var(--accent));
}
.acquired-search > svg {
  color: var(--ink-35);
  pointer-events: none;
}
.acquired-rarity-filter {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink-60);
  cursor: pointer;
  transition:
    background-color 0.2s var(--ease),
    border-color 0.2s var(--ease),
    color 0.2s var(--ease);
}
.acquired-rarity-filter:hover {
  border-color: var(--accent);
  color: var(--ink);
}
.acquired-rarity-filter.on {
  border-color: var(--accent);
  background: var(--yellow);
  color: var(--ink);
}
.acquired-rarity-filter:focus-within {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.acquired-rarity-filter input {
  accent-color: var(--tea);
  cursor: pointer;
}
.acquired-overview .slot-ic:not(.is-agent) {
  border-radius: 11px;
}
.acquired-overview .slot-ic.is-agent {
  border: 0;
  background: transparent;
  box-shadow: none;
}
.acquired-overview .slot:hover .slot-ic.is-agent {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
.acquired-overview .slot.is-priority .slot-ic,
.acquired-overview .slot.is-priority:hover .slot-ic {
  box-shadow: none;
}
.acquired-overview .slot.is-priority .slot-name {
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  background: none;
}
.acquired-overview .slot.is-priority .slot-meta {
  color: var(--ink-60);
}
.acquired-overview .slot-count {
  border-width: 1px;
  box-shadow: 0 2px 5px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.2);
}
.acquired-slot-grid .slot-action {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.acquired-slot-grid .slot-action:focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: 5px;
  border-radius: 8px;
}
.slot-meta {
  color: var(--ink-35);
}

.acquired-ledger {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
}
.ledger-head {
  border-bottom: 1px dashed var(--line);
}
.ledger-head h3 {
  color: var(--ink);
}
.ledger-head > small {
  color: var(--ink-60);
}
.source-list li + li,
.timeline-list li + li,
.detail-list li + li {
  border-top: 1px solid var(--line);
}
.source-list button {
  border: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.source-list button:hover {
  background: var(--cream);
}
.source-rank {
  color: var(--ink-35);
}
.source-main i {
  border-radius: 999px;
  background: var(--paper);
}
.source-main i::after {
  border-radius: inherit;
  background: var(--accent);
  content: "";
}
.source-stat {
  color: var(--ink-60);
}
.source-stat b {
  color: var(--ink);
}
.source-top {
  color: var(--ink-60);
}
.source-list svg {
  color: var(--theme-accent-text, var(--accent-strong));
}
.timeline-list button {
  border: 0;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}
.timeline-list button:hover {
  background: var(--cream);
}
.timeline-list button:focus-visible {
  outline: 2px solid var(--theme-focus, var(--accent));
  outline-offset: -2px;
}
.timeline-list time b {
  color: var(--ink);
}
.timeline-list time span {
  color: var(--ink-35);
}
.daily-rewards > span {
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--paper);
}
.daily-rewards > span.is-priority {
  border-color: var(--theme-line, rgba(215, 137, 53, 0.55));
  background: var(--yellow);
  color: var(--ink);
}
.daily-rewards em {
  color: var(--theme-accent-text, var(--accent-strong));
}
.timeline-list svg {
  color: var(--theme-accent-text, var(--accent-strong));
}
.details-caption {
  color: var(--ink-60);
}
.detail-list time b {
  color: var(--ink);
}
.detail-list time span {
  color: var(--ink-35);
}
.detail-source {
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
}
.detail-stamina {
  color: var(--ink-60);
}
.detail-stamina b {
  color: var(--theme-accent-text, var(--accent-strong));
}
.detail-entries span {
  border-radius: 7px;
  background: var(--paper);
  color: var(--ink);
}
.detail-entries span.is-priority {
  border: 1px solid var(--theme-line, rgba(215, 137, 53, 0.55));
  background: var(--yellow);
}
.detail-entries em {
  color: var(--theme-accent-text, var(--accent-strong));
}

/* ---- 背包格（游戏背包样式）---- */
.backpack {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 24px;
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
.item-section + .item-section {
  border-top: 1.5px dashed var(--line);
}
.section-head h2 {
  color: var(--ink);
}
.section-head span {
  color: var(--ink-35);
}
.item-subsection + .item-subsection {
  border-top: 1.5px dashed var(--line);
}
.subsection-head::before {
  content: "";
  border-radius: 2px;
  background: var(--accent);
}
.subsection-head h3 {
  color: var(--ink);
}
.subsection-head span {
  color: var(--ink-35);
}
.resource-equivalent {
  border: 1px solid var(--line);
  border-left: 3px solid var(--resource-color, var(--tea));
  border-radius: 5px;
  background: var(--cream);
}
.resource-equivalent span {
  color: var(--ink-60);
}
.resource-equivalent strong {
  color: var(--ink);
}
.resource-equivalent b {
  color: var(--resource-color, var(--theme-strong-text, var(--tea)));
}
.subsection-edit {
  border: 0;
  background: transparent;
  color: var(--theme-accent-text, var(--accent-strong));
  cursor: pointer;
  transition: color 0.18s var(--ease);
}
.subsection-head .subsection-edit-label {
  color: currentColor;
}
.subsection-edit svg {
  transition: transform 0.18s var(--ease);
}
.subsection-edit:hover:not(:disabled) {
  color: var(--theme-strong-text, var(--tea));
}
.subsection-edit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.subsection-edit::after {
  content: attr(data-tooltip);
  border-radius: 6px;
  background: var(--tea);
  color: var(--on-strong);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.16s var(--ease),
    transform 0.16s var(--ease);
}
.subsection-edit:hover::after,
.subsection-edit:focus-visible::after {
  opacity: 1;
}
.cultivation-group {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--cream);
}
.cultivation-group-head h4 {
  color: var(--ink);
}
.cultivation-group-head span {
  color: var(--ink-35);
}
.stock-edit-error {
  border: 1px solid var(--theme-danger-line, rgba(166, 81, 74, 0.35));
  border-radius: 8px;
  background: var(--theme-danger-wash, rgba(166, 81, 74, 0.06));
  color: var(--theme-danger-text, var(--rouge));
}
.is-agent-editor .stock-edit-slot {
  border-bottom: 1px solid var(--line);
}
.is-agent-editor .stock-edit-slot .slot-ic {
  border-radius: 10px;
}
.is-agent-editor .stock-edit-slot .slot-ic.is-agent {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.is-agent-editor .stock-edit-slot:hover .slot-ic.is-agent {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}
.stock-stepper {
  border: 1.5px solid var(--accent);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 3px 8px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.14);
}
.stock-stepper:focus-within {
  border-color: var(--theme-focus, var(--tea));
  box-shadow: 0 0 0 2px var(--yellow);
}
.stock-stepper.invalid {
  border-color: var(--rouge);
}
.stock-stepper button {
  border: 0;
  border-radius: 0;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
}
.stock-stepper button:first-child {
  border-right: 1px solid var(--line);
}
.stock-stepper button:last-child {
  border-left: 1px solid var(--line);
}
.stock-stepper button:hover:not(:disabled) {
  background: var(--yellow);
}
.stock-stepper button:disabled {
  color: var(--ink-35);
  cursor: not-allowed;
  opacity: 0.55;
}
.stock-count-input {
  border: 0;
  border-radius: 0;
  background: var(--surface);
  color: var(--ink);
  outline: none;
  appearance: textfield;
  -moz-appearance: textfield;
}
.stock-count-input::-webkit-inner-spin-button,
.stock-count-input::-webkit-outer-spin-button {
  appearance: none;
  -webkit-appearance: none;
}
.stock-stepper.invalid .stock-count-input {
  color: var(--theme-danger-text, var(--rouge));
}
.slot {
  transition: transform 0.22s var(--ease);
}
.slot-ic {
  border-radius: 17px;
  transition:
    border-color 0.22s,
    box-shadow 0.22s var(--ease),
    filter 0.22s;
}
.slot-ic.is-agent {
  border: 1.5px solid var(--theme-line, rgba(215, 137, 53, 0.38));
  background: var(--cream);
  box-shadow:
    inset 0 2px 0 rgba(var(--theme-shadow-rgb, 255, 255, 255), 0.7),
    inset 0 -10px 18px -10px rgba(var(--theme-shadow-rgb, 215, 137, 53), 0.22);
}
.slot:hover .slot-ic:not(.is-agent) {
  filter: brightness(1.035);
}
.slot:hover .slot-ic.is-agent {
  border-color: var(--accent);
  box-shadow:
    inset 0 2px 0 rgba(var(--theme-shadow-rgb, 255, 255, 255), 0.7),
    0 14px 26px -14px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.4);
}
.slot-ph {
  opacity: 0;
  border-radius: inherit;
  background: linear-gradient(
    168deg,
    var(--surface) 0%,
    var(--cream) 62%,
    var(--paper) 100%
  );
  pointer-events: none;
}
.slot-ic.has-icon-error .slot-ph {
  opacity: 1;
}
.slot-ph .ph-seal {
  border: 1.5px solid var(--brand-blue);
  border-radius: 6px;
  color: var(--theme-info-text, var(--brand-blue));
  opacity: 0.8;
}
.slot-ph .ph-mono {
  color: var(--ink-35);
  user-select: none;
}
.slot-img {
  border-radius: inherit;
  transition:
    filter 0.22s,
    opacity 0.22s;
}
.slot-count {
  border: 1px solid var(--theme-line, rgba(255, 248, 236, 0.82));
  border-radius: 999px;
  background: rgba(90, 70, 51, 0.94);
  color: var(--on-strong);
  box-shadow: 0 3px 8px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.24);
}
.slot-count.gained {
  background: var(--accent);
  color: var(--on-strong);
}
.slot-name {
  color: var(--ink);
  transition: color 0.3s;
}
.slot:hover .slot-name {
  color: var(--theme-accent-text, var(--accent-strong));
}

/* ---- 清单格状态：未持有（数量 0）仅淡化图片，数量角标保持可读 ---- */
.slot.is-missing .slot-img {
  filter: grayscale(0.28) saturate(0.5);
  opacity: 0.68;
}
.slot.is-missing:hover .slot-ic:not(.is-agent) .slot-img {
  filter: grayscale(0.16) saturate(0.68);
  opacity: 0.8;
}
.slot.is-missing .slot-ic.is-agent {
  border-style: dashed;
}
.slot.is-missing .slot-ic.is-agent .slot-img {
  filter: grayscale(0.28) saturate(0.5);
  opacity: 0.55;
}
.slot.is-missing:hover .slot-ic.is-agent .slot-img {
  filter: grayscale(0.16) saturate(0.68);
  opacity: 0.8;
}
.slot.is-missing .slot-name {
  color: var(--ink-60);
}
.slot.is-missing:hover .slot-name {
  color: var(--theme-accent-text, var(--accent-strong));
}
.slot-count.zero {
  background: var(--theme-surface, rgba(255, 253, 246, 0.86));
  border: 1.5px dashed var(--line);
  color: var(--ink-60);
  box-shadow: none;
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
.is-agent-editor .stock-edit-slot .slot-tag {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--ink-60);
}
.is-agent-editor .stock-edit-slot .slot-tag.star.s5 {
  background: transparent;
  color: var(--theme-accent-text, var(--accent-strong));
}
.is-agent-editor .stock-edit-slot .slot-tag.star.s4,
.is-agent-editor .stock-edit-slot .slot-tag.star.s3 {
  border: 0;
  color: var(--ink-60);
}
.is-agent-editor .stock-edit-slot .stock-stepper {
  border: 1px solid var(--line);
  box-shadow: 0 2px 6px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.08);
}
.is-agent-editor .stock-edit-slot .stock-stepper:focus-within {
  border-color: var(--theme-focus, var(--accent));
  box-shadow: 0 0 0 2px rgba(var(--theme-shadow-rgb, 239, 210, 142), 0.7);
}

/* ---- 密探目录：与背包道具同构的心纸盘点格 ---- */
.backpack.manifest-agents {
  border-radius: 16px;
}
.agent-favorite-help {
  color: var(--ink-60);
}
.manifest-agents .agent-group + .agent-group {
  border-top: 1px dashed var(--line);
}
.manifest-agents .agent-group-head::before {
  border-radius: 2px;
  background: var(--accent);
  content: "";
}
.manifest-agents .agent-group-head h2 {
  color: var(--ink);
}
.manifest-agents .agent-group-head span {
  color: var(--ink-35);
}
.manifest-agents .agent-favorite-divider {
  border-top: 1px dashed var(--line);
}
.manifest-agents .agent-card .slot-ic {
  border-radius: 0;
}
.manifest-agents .agent-card .slot-ic.is-agent {
  border: 0;
  background: transparent;
  box-shadow: none;
}
.manifest-agents .agent-card:hover .slot-ic.is-agent {
  border-color: transparent;
  box-shadow: none;
}
.manifest-agents .agent-card .slot-name {
  color: var(--ink);
}
.manifest-agents .agent-card.is-favorite .slot-name {
  color: var(--theme-strong-text, var(--tea));
}
.manifest-agents .agent-card .slot-count {
  border-radius: 999px;
  border-width: 1px;
  box-shadow: 0 2px 5px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.2);
}
.manifest-agents .agent-favorite-btn {
  border: 0;
  background: transparent;
  color: var(--ink-35);
  cursor: pointer;
}
.manifest-agents .agent-favorite-btn::before {
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 2px 6px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.16);
  content: "";
  opacity: 0.94;
  transition:
    background-color 0.18s var(--ease),
    border-color 0.18s var(--ease),
    box-shadow 0.18s var(--ease),
    transform 0.18s var(--ease);
}
.manifest-agents .agent-favorite-btn.on {
  color: var(--theme-accent-text, #ff9320);
}
.manifest-agents .agent-favorite-btn.on::before {
  border-color: var(--line);
  background: var(--surface);
  box-shadow: 0 2px 6px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.16);
}
.manifest-agents .agent-favorite-btn:hover:not(:disabled)::before {
  border-color: var(--accent);
}
.manifest-agents .agent-favorite-btn.on:hover:not(:disabled)::before {
  border-color: var(--line);
  background: var(--surface);
  box-shadow: 0 2px 6px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.16);
}
.manifest-agents .agent-favorite-btn:focus-visible {
  outline: 2px solid var(--theme-focus, var(--brand-blue));
  outline-offset: 2px;
}
.manifest-agents .agent-favorite-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.manifest-agents .agent-favorite-btn.busy svg {
  opacity: 0.42;
}

/* ---- 背包道具追踪目录：盘点簿式紧凑清单 ---- */
.backpack.manifest-items {
  border-radius: 16px;
}
.manifest-items .slot-ic:not(.is-agent) {
  border-radius: 11px;
}
.manifest-items .slot-count {
  border-width: 1px;
  box-shadow: 0 2px 5px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.2);
}
.manifest-items .slot-count.zero {
  border-width: 1px;
}
.manifest-items .slot-ph .ph-seal {
  border-radius: 4px;
}
.manifest-items .cultivation-group {
  border-radius: 7px;
}

@media (max-width: 900px) {
  .acquired-overview {
    border-radius: 14px;
  }
}

/* ---- 导入记录 ---- */

.stock-baseline-confirmation {
  color: var(--ink);
}
.stock-baseline-confirmation input {
  accent-color: var(--tea);
}

@media (min-width: 1081px) {
  .manifest-toolbar {
    background: var(--theme-surface, rgba(255, 253, 246, 0.96));
    backdrop-filter: blur(12px);
    box-shadow: 0 12px 30px -26px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.62);
  }
}

@media (max-width: 640px) {
  .import-box {
    border-radius: 14px;
  }
  .manifest-scope {
    border-left: 0;
    border-right: 0;
    border-top: 1px dashed var(--line);
    border-bottom: 1px dashed var(--line);
  }
  .manifest-scope.is-editing {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 10px 24px -18px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.45);
  }
  .manifest-scope > button {
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .manifest-scope .manifest-edit-actions button {
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .manifest-type-switch {
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--theme-surface, rgba(255, 253, 246, 0.96));
    backdrop-filter: blur(12px);
    box-shadow: 0 10px 24px -18px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.5);
    transition:
      top 0.18s cubic-bezier(0.25, 1, 0.5, 1),
      box-shadow 0.18s cubic-bezier(0.25, 1, 0.5, 1);
  }
  .manifest-type-switch > button {
    border-radius: 12px;
  }
  .backpack {
    border-radius: 20px;
  }
  .backpack.manifest-items {
    border-radius: 14px;
  }
  .acquired-overview {
    border-radius: 14px;
  }
  .acquired-query {
    border-radius: 12px;
  }
  .manifest-bar {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
  }
  .stock-stepper button:first-child {
    border-right: 1px solid var(--line);
  }
  .stock-stepper button:last-child {
    border-left: 0;
  }
  .stock-stepper .stock-count-input {
    border-bottom: 1px solid var(--line);
  }
  .agent-controls.is-editing.is-collapsed {
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  .backpack.manifest-agents {
    border-radius: 14px;
  }
  .is-agent-editor .stock-stepper button:first-child {
    border-right: 1px solid var(--line);
  }
  .is-agent-editor .stock-stepper button:last-child {
    border-left: 1px solid var(--line);
  }
  .is-agent-editor .stock-stepper .stock-count-input {
    border-bottom: 0;
  }
  .acquired-filters {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }
  .acquired-filters select,
  .acquired-filters input {
    border-radius: 8px;
    background: var(--paper);
  }
  .acquired-ledger {
    border-radius: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .subsection-edit,
  .subsection-edit svg,
  .subsection-edit::after {
    transition: none;
  }
  .spin {
    animation: none;
  }
}
.report-book-fallback { border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
.report-book-fallback > div > span { color: var(--theme-accent-text, var(--accent-strong)) }
.report-book-fallback h2 { color: var(--ink) }
.inventory-freshness { border-bottom: 1px solid var(--line); }
.inventory-freshness-copy { color: var(--theme-strong-text, var(--tea)); }
.freshness-label { color: var(--ink-60); }
.inventory-entry,
.reward-entry { border-radius: 8px; }
.inventory-actions > .reward-entry { background: var(--tea); color: var(--on-strong); }
.manifest-toolbar { border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
.manifest-toolbar .manifest-type-switch { border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; }
.manifest-type-switch > button { border-radius: 8px; }
.manifest-type-switch > button.on { background: color-mix(in srgb, var(--yellow) 40%, var(--cream)); color: var(--theme-strong-text, var(--tea)); }
.manifest-toolbar .manifest-bar { border: 0; border-radius: 0; background: transparent; }
.manifest-bar-summary .mf-num { color: var(--ink-60); }
.manifest-item-tools .mf-search { background: var(--surface); }
.manifest-item-tools .mf-filter { background: transparent; }
.manifest-item-tools .mf-filter button.on { background: color-mix(in srgb, var(--yellow) 40%, var(--cream)); color: var(--theme-strong-text, var(--tea)); box-shadow: none; }
</style>
<style scoped src="./inventoryWorkspaceDesktop.css"></style>
<style scoped src="./inventoryWorkspaceMobile.css"></style>
