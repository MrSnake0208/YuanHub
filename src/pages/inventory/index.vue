<template>
  <div class="page-inventory">
    <IslandSidebar />

    <main id="main-content" class="inventory-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">库存</span>
            <span class="pill">追踪</span>
            <span class="pill">统计</span>
          </div>
          <h1>广陵库房<span class="small">清点 · 归档 · 溯源</span></h1>
          <p class="hero-sub">代号鸢 / 如鸢 库存与奖励台账：支持多子账号分别清点，同步当前背包数量，按月按周统计各类物品与角色碎片获得量，支持导入导出完整交换档案（v2）。</p>
          <div class="hero-stats">
            <div>
              <div class="k">追踪目录更新日期</div>
              <div class="v catalog-date"><time :datetime="CATALOG_VERSION">{{ CATALOG_VERSION }}</time></div>
            </div>
            <div><div class="k">背包道具</div><div class="v">{{ itemCatalogCount }}<small>种</small></div></div>
            <div><div class="k">密探心纸</div><div class="v">{{ agentCatalogCount }}<small>种</small></div></div>
            <div v-if="auth.isLoggedIn" class="is-authed"><div class="k">已同步</div><div class="v">云端<small>可导入导出</small></div></div>
            <div v-else class="is-authed"><div class="k">未登录</div><div class="v">只读<small><router-link to="/login">去登录</router-link></small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 库存子账号 -->
          <div class="account-bar" v-reveal>
            <div class="ac-sel">
              <label class="ac-label" for="inventory-account">当前库存子账号</label>
              <select id="inventory-account" v-model="accountId" :disabled="!auth.isLoggedIn || accountsLoading || editingStock" @change="onAccountChange">
                <option v-if="!accounts.length" value="">（未创建）</option>
                <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
              <span v-if="accountError" class="ac-warn">{{ accountError }}</span>
            </div>
            <span class="sp"></span>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn || editingStock" @click="showAccounts = !showAccounts">{{ showAccounts ? '收起管理' : '管理账号' }}</button>
          </div>

          <!-- 账号管理 -->
          <div v-if="showAccounts && !editingStock" class="account-mgr" v-reveal>
            <div class="ac-new">
              <input v-model.trim="newAccountName" aria-label="新子账号名称" autocomplete="off" placeholder="新子账号名称（1~64 字）" @keyup.enter="onCreateAccount" />
              <button class="btn ghost" :disabled="accountBusy || !newAccountName" @click="onCreateAccount">新建账号</button>
            </div>
            <ul v-if="accounts.length" class="ac-list">
              <li v-for="a in accounts" :key="a.id" class="ac-item">
                <span class="ac-dot"></span>
                <div class="ac-meta">
                  <span class="ac-name">{{ a.name }}</span>
                  <code class="ac-id">{{ a.id }}</code>
                </div>
                <button class="ac-btn" :disabled="accountBusy" @click="onRenameAccount(a)">改名</button>
                <button class="ac-btn danger" :disabled="accountBusy" @click="onDeleteAccount(a)">删除</button>
              </li>
            </ul>
            <p v-else class="ac-empty">暂无子账号，请在上方输入名称创建第一个子账号</p>
          </div>

          <!-- TABS：追踪目录 / 时段获得量 / 导入记录 -->
          <div class="inventory-tabs" v-reveal>
            <button :class="{ on: activeTab === 'manifest' }" @click="setTab('manifest')">追踪清单</button>
            <button :class="{ on: activeTab === 'acquired' }" @click="setTab('acquired')">时段获得量</button>
            <button :class="{ on: activeTab === 'records' }" @click="setTab('records')">导入记录</button>
            <span class="sp"></span>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn || editingStock" @click="showImport = !showImport">导入档案</button>
            <label v-if="accounts.length > 1" class="export-all"><input type="checkbox" v-model="exportAll" /> 全部账号</label>
            <button class="act-btn ghost" :disabled="!auth.isLoggedIn" @click="doExport">导出档案</button>
          </div>

          <!-- 导入档案 -->
          <div v-if="showImport" class="import-box" v-reveal>
            <p id="inventory-import-tip" class="tip">粘贴符合《库存数据交换协议 v2》的 JSON 文档，或选择文件上传；导入结果会在下方展示。</p>
            <textarea id="inventory-import-json" v-model="importText" aria-label="库存交换档案 JSON" :aria-invalid="!!importError" :aria-describedby="importError ? 'inventory-import-tip inventory-import-error' : 'inventory-import-tip'" autocomplete="off" placeholder='{"format":"myshare-inventory-exchange","version":2,"accounts":[{"id":"acc_xxx","name":"大号"}],"records":[]}' @input="importError = ''"></textarea>
            <p v-if="importError" id="inventory-import-error" class="import-error" role="alert">{{ importError }}</p>
            <div class="import-actions">
              <label class="btn ghost file-label">
                选择 JSON 文件
                <input type="file" accept=".json,application/json" @change="onFilePick" />
              </label>
              <button class="btn ghost" :disabled="loadingExample" @click="fillExample">{{ loadingExample ? '加载中…' : '示例导入' }}</button>
              <button class="btn primary" :disabled="importing || !importText.trim()" @click="doImport">导入</button>
            </div>
            <div v-if="importResult" class="import-result">
              导入完成：接受 {{ importResult.accepted }} 条 · 重复 {{ importResult.duplicates }} 条
              <span v-if="importResult.history_only"> · 仅历史 {{ importResult.history_only }} 条</span>
              <span v-if="importResult.superseded"> · 已归档 {{ importResult.superseded }} 条</span>
              <button class="ok" @click="afterImport">刷新库存</button>
            </div>
          </div>

          <!-- 追踪目录（YuanHub 当前支持的追踪范围，登录后叠加云端库存） -->
          <div v-show="activeTab === 'manifest'" ref="manifestPanel" class="panel">
            <div class="manifest-intro" :class="{ 'is-editing': editingStock }" v-reveal>
              <div class="type-switch">
                <button :disabled="editingStock" :aria-pressed="entityType === 'item'" :class="{ on: entityType === 'item' }" @click="setEntityType('item')">背包道具</button>
                <button :disabled="editingStock" :aria-pressed="entityType === 'agent'" :class="{ on: entityType === 'agent' }" @click="setEntityType('agent')">密探心纸</button>
                <span class="sp"></span>
              </div>

              <aside class="manifest-scope" :class="{ 'is-editing': editingStock }">
                <Pencil v-if="editingStock" :size="16" aria-hidden="true" />
                <Info v-else :size="16" aria-hidden="true" />
                <p v-if="editingStock">正在编辑「{{ currentAccountName }}」的{{ stockEditScopeName ? '「' + stockEditScopeName + '」库存' : (entityType === 'agent' ? '密探心纸库存' : '背包库存') }} · 已修改 <b>{{ stockChangedCount }}</b> 项</p>
                <p v-else-if="entityType === 'item'" class="scope-guidance">库存数量有误？点击标题旁的 <Pencil :size="13" aria-hidden="true" /> 进入编辑模式</p>
                <p v-else>特别关注自动同步到当前子账号；编辑只会更新心纸数量。</p>
                <button v-if="!editingStock && entityType === 'agent'" type="button" class="scope-edit-agent" :disabled="loading || !!error" @click="startStockEdit()">
                  <Pencil :size="14" aria-hidden="true" />编辑心纸
                </button>
                <div v-if="editingStock" class="manifest-edit-actions">
                  <button type="button" :disabled="savingStock" @click="cancelStockEdit"><X :size="14" />取消</button>
                  <button type="button" class="primary" :disabled="savingStock || !!stockDraftError || !stockChangedCount" @click="saveStockEdit">
                    <Save :size="14" />{{ savingStock ? '保存中…' : '保存库存' }}
                  </button>
                </div>
                <span v-if="stockSaveNotice && !editingStock" class="stock-save-notice" role="status" aria-live="polite">{{ stockSaveNotice }}</span>
              </aside>
            </div>

            <div v-if="!editingStock" class="manifest-bar" v-reveal>
              <div class="mf-stats">
                <div class="mf-stat"><b class="mf-num">{{ manifestTotal }}</b><span class="mf-k">可追踪</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestOwned }}</b><span class="mf-k">已持有</span></div>
                <div v-if="entityType === 'agent'" class="mf-stat"><b class="mf-num">{{ favoriteAgentIds.size }}</b><span class="mf-k">特别关注</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestPercent }}</b><span class="mf-k">持有率</span></div>
              </div>
              <div class="mf-progress" title="当前追踪目录持有率"><i :style="{ '--progress': manifestProgressScale }"></i></div>
              <span class="sp"></span>
              <input v-if="entityType === 'item'" id="manifest-search" v-model.trim="manifestSearch" name="manifest-search" class="mf-search" type="search" aria-label="搜索库存名称或 ID" placeholder="搜索名称 / id" />
              <div v-if="entityType === 'item'" class="mf-filter">
                <button :aria-pressed="manifestFilter === 'all'" :class="{ on: manifestFilter === 'all' }" @click="manifestFilter = 'all'">全部</button>
                <button :aria-pressed="manifestFilter === 'owned'" :class="{ on: manifestFilter === 'owned' }" @click="manifestFilter = 'owned'">已持有</button>
                <button :aria-pressed="manifestFilter === 'missing'" :class="{ on: manifestFilter === 'missing' }" @click="manifestFilter = 'missing'">未持有</button>
              </div>
              <span v-if="error" class="mf-sync-error" role="status">云端库存同步失败：{{ error }}（数量按 0 显示）</span>
            </div>

            <div v-if="entityType === 'agent'" class="agent-controls" :class="{ 'is-editing': editingStock, 'is-collapsed': agentControlsCollapsed }" aria-label="密探清单工具">
              <button
                type="button"
                class="agent-controls-toggle"
                :aria-expanded="!agentControlsCollapsed"
                :aria-label="agentControlsToggleLabel"
                :data-tooltip="agentControlsToggleLabel"
                @click="agentControlsCollapsed = !agentControlsCollapsed"
              >
                <ChevronsDown v-if="agentControlsCollapsed" :size="16" aria-hidden="true" />
                <ChevronsUp v-else :size="16" aria-hidden="true" />
                <span>{{ agentControlsCollapsed ? '展开' : '收起' }}</span>
              </button>
              <label class="agent-control-search">
                <Search :size="15" aria-hidden="true" />
                <span class="sr-only">搜索密探</span>
                <input :id="editingStock ? 'agent-editor-search' : 'agent-search'" v-model.trim="manifestSearch" :name="editingStock ? 'agent-editor-search' : 'agent-search'" type="search" placeholder="搜索名称 / 属性 / 职业" />
              </label>
              <details class="agent-filter-panel" @toggle="positionAgentFilterMenu">
                <summary><ListFilter :size="15" aria-hidden="true" />筛选<span v-if="agentFacetCount">{{ agentFacetCount }}</span></summary>
                <div class="agent-filter-menu">
                  <div class="agent-filter-menu-head">
                    <strong>筛选条件</strong>
                    <button v-if="agentFacetCount" type="button" @click="clearAgentFacetFilters">清空</button>
                  </div>
                  <fieldset>
                    <legend>库存</legend>
                    <label v-for="option in AGENT_STATUS_OPTIONS" :key="option.id" :class="{ selected: agentStatusFilters.includes(option.id) }"><input v-model="agentStatusFilters" type="checkbox" :value="option.id" />{{ option.label }}</label>
                  </fieldset>
                  <fieldset>
                    <legend>星级</legend>
                    <label v-for="rarity in AGENT_RARITIES" :key="rarity" :class="{ selected: agentRarityFilters.includes(String(rarity)) }"><input v-model="agentRarityFilters" type="checkbox" :value="String(rarity)" />{{ rarity }} 星</label>
                  </fieldset>
                  <fieldset>
                    <legend>属性</legend>
                    <label v-for="prof in AGENT_PROFS" :key="prof" :class="{ selected: agentProfFilters.includes(prof) }"><input v-model="agentProfFilters" type="checkbox" :value="prof" />{{ prof }}</label>
                  </fieldset>
                  <fieldset>
                    <legend>职业</legend>
                    <label v-for="prof in agentSubProfs" :key="prof" :class="{ selected: agentSubProfFilters.includes(prof) }"><input v-model="agentSubProfFilters" type="checkbox" :value="prof" />{{ prof }}</label>
                  </fieldset>
                </div>
              </details>
              <div class="agent-favorite-mode" role="group" aria-label="关注显示方式">
                <button
                  v-for="mode in AGENT_FAVORITE_MODES"
                  :key="mode.id"
                  type="button"
                  :class="{ on: agentFavoriteMode === mode.id }"
                  :aria-pressed="agentFavoriteMode === mode.id"
                  :disabled="mode.id === 'only' && (!auth.isLoggedIn || !accountId || favoriteLoading)"
                  @click="agentFavoriteMode = mode.id"
                >{{ mode.label }}</button>
              </div>
              <div class="agent-sort-row">
                <details class="agent-menu-control agent-sort-control">
                  <summary :aria-label="'排序方式：' + agentSortLabel">
                    <ArrowDownUp :size="15" aria-hidden="true" />
                    <span>{{ agentSortLabel }}</span>
                    <ChevronDown :size="15" aria-hidden="true" />
                  </summary>
                  <div class="agent-menu-options" role="listbox" aria-label="排序方式">
                    <button v-for="option in AGENT_SORT_OPTIONS" :key="option.id" type="button" role="option" :aria-selected="agentSort === option.id" :class="{ selected: agentSort === option.id }" @click="chooseAgentMenuValue($event, 'sort', option.id)">
                      <span>{{ option.label }}</span>
                      <Check v-if="agentSort === option.id" :size="14" aria-hidden="true" />
                    </button>
                  </div>
                </details>
                <button type="button" class="agent-sort-direction" :class="{ asc: agentSortDirection === 'asc' }" :aria-label="agentSortDirectionButtonLabel" :data-tooltip="agentSortDirectionButtonLabel" @click="toggleAgentSortDirection"><ArrowDown :size="16" aria-hidden="true" /></button>
                <details v-if="!editingStock" class="agent-menu-control agent-group-control">
                  <summary :aria-label="'分组方式：' + agentGroupLabel">
                    <Layers3 :size="15" aria-hidden="true" />
                    <span>{{ agentGroupLabel }}</span>
                    <ChevronDown :size="15" aria-hidden="true" />
                  </summary>
                  <div class="agent-menu-options" role="listbox" aria-label="分组方式">
                    <button v-for="option in AGENT_GROUP_OPTIONS" :key="option.id" type="button" role="option" :aria-selected="agentGroupBy === option.id" :class="{ selected: agentGroupBy === option.id }" @click="chooseAgentMenuValue($event, 'group', option.id)">
                      <span>{{ option.label }}</span>
                      <Check v-if="agentGroupBy === option.id" :size="14" aria-hidden="true" />
                    </button>
                  </div>
                </details>
              </div>
              <button v-if="agentFiltersActive" type="button" class="agent-reset" @click="resetAgentFilters"><X :size="14" aria-hidden="true" />清除</button>
              <span class="agent-result" role="status">显示 {{ editingStock ? visibleStockEditorEntries.length : manifestEntries.length }} / {{ agentCatalogCount }}</span>
              <span v-if="favoriteLoading" class="agent-sync-state" role="status">正在同步关注…</span>
              <span v-else-if="favoriteError" class="agent-sync-state is-error" role="status">{{ favoriteError }}</span>
            </div>

            <div v-if="loading" class="state">正在加载追踪目录…</div>
            <div v-else-if="editingStock" class="backpack stock-editor" :class="{ 'is-agent-editor': entityType === 'agent' }">
              <p v-if="stockDraftError || stockEditError" class="stock-edit-error">{{ stockDraftError || stockEditError }}</p>
              <div v-if="visibleStockEditorEntries.length === 0" class="state slim">当前筛选下没有密探</div>
              <ul class="slot-grid stock-edit-grid">
                <li v-for="e in visibleStockEditorEntries" :key="e.id" class="slot stock-edit-slot" :title="e.name || e.id">
                  <div class="slot-ic" :class="{ 'is-agent': entityType === 'agent' }">
                    <div class="slot-ph">
                      <span class="ph-seal">图</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                  </div>
                  <InventoryItemName :entry="e" />
                  <span v-if="entityType === 'agent'" class="slot-tag star" :class="'s' + e.rarity">{{ e.rarity }}★ · {{ e.prof }} · {{ e.subProf }}</span>
                  <div class="stock-stepper" :class="{ invalid: !isValidStockCount(stockDraft[e.id]) }">
                    <button
                      type="button"
                      :disabled="!isValidStockCount(stockDraft[e.id]) || Number(stockDraft[e.id]) <= 0"
                      :aria-label="'减少' + (e.name || e.id) + '库存'"
                      @click="adjustStockCount(e.id, -1)"
                    ><Minus :size="16" /></button>
                    <input
                      v-model="stockDraft[e.id]"
                      class="stock-count-input"
                      type="number"
                      inputmode="numeric"
                      min="0"
                      max="2147483647"
                      step="1"
                      :aria-label="(e.name || e.id) + '当前库存'"
                      @focus="$event.target.select()"
                    />
                    <button
                      type="button"
                      :disabled="!isValidStockCount(stockDraft[e.id]) || Number(stockDraft[e.id]) >= 2147483647"
                      :aria-label="'增加' + (e.name || e.id) + '库存'"
                      @click="adjustStockCount(e.id, 1)"
                    ><Plus :size="16" /></button>
                  </div>
                </li>
              </ul>
            </div>
            <div v-else class="backpack" :class="{ 'manifest-items': entityType === 'item', 'manifest-agents': entityType === 'agent' }" v-reveal>
              <div v-if="manifestEntries.length === 0" class="state slim">
                {{ entityType === 'agent' ? agentEmptyMessage : '没有匹配「' + manifestSearch + '」的对象' }}
                <button v-if="entityType === 'agent' && agentFavoriteMode === 'only'" type="button" class="link" @click="agentFavoriteMode = 'all'">查看全部</button>
              </div>
              <div v-else-if="entityType === 'item'" class="item-sections">
                <section v-for="section in manifestCategorySections" :key="section.id" class="item-section">
                  <div class="section-head">
                    <h2>{{ section.name }}</h2>
                    <span>{{ section.entries.length }} 种</span>
                  </div>
                  <ul v-if="!section.subsections || section.primaryEntries.length" class="slot-grid">
                    <li v-for="e in section.subsections ? section.primaryEntries : section.entries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                      <div class="slot-ic">
                        <div class="slot-ph"><span class="ph-seal">图</span><span class="ph-mono">{{ monogram(e) }}</span></div>
                        <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                        <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                      </div>
                      <InventoryItemName :entry="e" />
                    </li>
                  </ul>
                  <template v-if="section.subsections && section.subsections.length">
                    <div class="subsection-columns" :class="{ 'subsection-rows': section.subsectionLayout === 'rows', 'subsection-shelves': section.subsectionLayout === 'shelves' }">
                      <div
                        v-for="subcategory in section.subsections"
                        :key="subcategory.id"
                        class="item-subsection"
                        :class="{
                          'is-divination-stone': subcategory.id === 'divination-stone',
                          'is-level-breakthrough': subcategory.id === 'level-breakthrough'
                        }"
                      >
                        <div class="subsection-head">
                          <h3>{{ subcategory.name }}</h3>
                          <span>{{ subcategory.entries.length }} 种</span>
                          <button
                            type="button"
                            class="subsection-edit"
                            :disabled="loading || !!error"
                            :aria-label="'编辑' + subcategory.name + '的库存'"
                            :data-tooltip="'编辑「' + subcategory.name + '」的库存'"
                            @click="startSubsectionStockEdit(subcategory)"
                          ><Pencil :size="14" aria-hidden="true" /></button>
                        </div>
                        <div v-if="subcategory.subgroups" class="cultivation-groups">
                          <div v-for="group in subcategory.subgroups" :key="group.id" class="cultivation-group">
                            <div class="cultivation-group-head"><h4>{{ group.name }}</h4><span>{{ group.entries.length }} 种</span></div>
                            <ul class="slot-grid">
                              <li v-for="e in group.entries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                                <div class="slot-ic">
                                  <div class="slot-ph"><span class="ph-seal">图</span><span class="ph-mono">{{ monogram(e) }}</span></div>
                                  <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                                  <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                                </div>
                                <InventoryItemName :entry="e" />
                              </li>
                            </ul>
                          </div>
                        </div>
                        <ul v-else class="slot-grid">
                          <li v-for="e in subcategory.entries" :key="e.id" class="slot" :class="{ 'is-missing': !e.owned }" :title="slotTitle(e)">
                            <div class="slot-ic">
                              <div class="slot-ph"><span class="ph-seal">图</span><span class="ph-mono">{{ monogram(e) }}</span></div>
                              <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                              <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                            </div>
                            <InventoryItemName :entry="e" />
                          </li>
                        </ul>
                      </div>
                    </div>
                  </template>
                </section>
              </div>
              <div v-else class="agent-directory">
                <section v-for="group in agentGroups" :key="group.id" class="agent-group">
                  <div v-if="group.label" class="agent-group-head"><h2>{{ group.label }}</h2><span>{{ group.entries.length }} 位</span></div>
                  <ul class="slot-grid agent-slot-grid">
                    <li v-for="e in group.entries" :key="e.id" class="slot agent-card" :class="{ 'is-missing': !e.owned, 'is-favorite': favoriteAgentIds.has(e.id) }" :title="slotTitle(e)">
                      <div class="slot-ic is-agent">
                        <div class="slot-ph">
                          <span class="ph-seal">图</span>
                          <span class="ph-mono">{{ monogram(e) }}</span>
                        </div>
                        <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                        <button
                          type="button"
                          class="agent-favorite-btn"
                          :class="{ on: favoriteAgentIds.has(e.id), busy: favoriteBusyIds.has(e.id) }"
                          :aria-label="favoriteAgentIds.has(e.id) ? '取消特别关注' + (e.name || e.id) : '特别关注' + (e.name || e.id)"
                          :aria-pressed="favoriteAgentIds.has(e.id)"
                          :aria-busy="favoriteBusyIds.has(e.id)"
                          :disabled="favoriteBusyIds.has(e.id) || favoriteLoading || !auth.isLoggedIn || !accountId"
                          :data-tooltip="favoriteAgentIds.has(e.id) ? '取消特别关注' : '特别关注'"
                          @click="toggleAgentFavorite(e)"
                        ><Star :size="15" :fill="favoriteAgentIds.has(e.id) ? 'currentColor' : 'none'" aria-hidden="true" /></button>
                        <span class="slot-count" :class="{ zero: !e.owned }">{{ fmtCount(e.count) }}</span>
                      </div>
                      <InventoryItemName :entry="e" />
                    </li>
                  </ul>
                </section>
              </div>
            </div>
          </div>

          <!-- 时段获得量 -->
          <div v-show="activeTab === 'acquired'" class="panel acquired-panel" :aria-busy="acquiredLoading">
            <section class="acquired-query" aria-labelledby="acquired-query-title" v-reveal>
              <div class="acquired-query-head">
                <div>
                  <span class="query-eyebrow">奖励流水统计</span>
                  <h2 id="acquired-query-title">选一段时间，翻看获得簿</h2>
                </div>
              </div>

              <div class="quick-range" aria-label="快捷时段">
                <button v-for="preset in rangePresets" :key="preset.id" :aria-pressed="rangePreset === preset.id" :class="{ on: rangePreset === preset.id }" :disabled="acquiredLoading" @click="applyRangePreset(preset.id)">{{ preset.label }}</button>
              </div>

              <div class="acquired-bar">
                <div class="range">
                  <label>
                    <span class="lb">开始日期</span>
                    <input id="acquired-range-from" v-model="rangeFrom" name="acquired-range-from" type="date" :max="rangeTo || undefined" :disabled="acquiredLoading" @change="markCustomRange" />
                  </label>
                  <span class="range-dash" aria-hidden="true">至</span>
                  <label>
                    <span class="lb">结束日期</span>
                    <input id="acquired-range-to" v-model="rangeTo" name="acquired-range-to" type="date" :min="rangeFrom || undefined" :disabled="acquiredLoading" @change="markCustomRange" />
                  </label>
                  <button class="btn primary acquired-submit" :disabled="acquiredLoading || !accountId" @click="loadAcquired">
                    <RefreshCw :size="15" aria-hidden="true" :class="{ spin: acquiredLoading }" />
                    {{ acquiredLoading ? '正在统计' : '更新统计' }}
                  </button>
                </div>
                <p class="range-caption">
                  <CalendarDays :size="15" aria-hidden="true" />
                  <span class="range-caption-lines">
                    <span>{{ acquiredRangeLabel }}</span>
                    <span>{{ acquiredRangeMetaLabel }}</span>
                  </span>
                  <span v-if="acquiredQueryDirty" class="query-dirty">待更新</span>
                </p>
              </div>
            </section>

            <div v-if="acquiredLoading" class="state acquired-loading" role="status" aria-live="polite">
              <span class="loading-seal" aria-hidden="true">簿</span>
              <span>正在统计获得量…</span>
              <small v-if="acquiredRecordProgress.pages">已整理 {{ acquiredRecordProgress.records }} 条流水</small>
            </div>
            <div v-else-if="acquiredError && !periodHasData" class="state err" role="alert">{{ acquiredError }}</div>
            <div v-else-if="!periodHasData" class="state acquired-empty">
              <strong>这段时间没有奖励获得记录</strong>
              <span>仅统计派遣、寿春等奖励流水，库存快照不计入。可以换一个时段，或先导入对应账号的奖励流水。</span>
            </div>
            <template v-else>
              <AcquiredPeriodReport
                :insights="periodInsights"
                :dispatch-duration="periodDispatchDuration"
                :item-totals-available="!acquiredTotalsErrors.item"
                :agent-totals-available="!acquiredTotalsErrors.agent"
                :records-available="!acquiredRecordsError"
                :favorite-loading="favoriteLoading"
                :favorite-error="favoriteError"
                v-reveal
              />

              <div class="type-switch acquired-type-switch" aria-label="统计对象" v-reveal>
                <button type="button" aria-label="全部（道具和心纸）" :aria-pressed="acquiredEntityType === 'all'" :class="{ on: acquiredEntityType === 'all' }" @click="setAcquiredEntityType('all')">ALL</button>
                <button type="button" :aria-pressed="acquiredEntityType === 'item'" :class="{ on: acquiredEntityType === 'item' }" @click="setAcquiredEntityType('item')">背包道具</button>
                <button type="button" :aria-pressed="acquiredEntityType === 'agent'" :class="{ on: acquiredEntityType === 'agent' }" @click="setAcquiredEntityType('agent')">密探心纸</button>
              </div>

              <div v-if="acquiredRecordsError || acquiredRecordsTruncated || acquiredAgentHistoryError || acquiredAgentHistoryTruncated || acquiredTotalsErrors.item || acquiredTotalsErrors.agent || !acquiredTotalsMatch || periodDispatchDuration.unconvertedRecordCount" class="acquired-notices" role="status">
                <p v-if="acquiredTotalsErrors.item">白金币等价值暂不可用：{{ acquiredTotalsErrors.item }}</p>
                <p v-if="acquiredTotalsErrors.agent">心纸排行与关注统计暂不可用：{{ acquiredTotalsErrors.agent }}</p>
                <p v-if="acquiredRecordsError">汇总已加载，但流水明细加载失败：{{ acquiredRecordsError }}</p>
                <p v-if="acquiredRecordsTruncated">本次明细最多整理 5,000 条；总量仍以后端汇总为准，幸运日、连续收获和同框结论可能不完整。</p>
                <p v-if="acquiredAgentHistoryError">长期失联统计暂不可用：{{ acquiredAgentHistoryError }}</p>
                <p v-else-if="acquiredAgentHistoryTruncated">密探历史流水超过 5,000 条，未查到的密探不会被判定为从未获得。</p>
                <p v-if="!acquiredTotalsMatch">流水明细与汇总口径存在差异；总览排行以后端汇总为准。</p>
                <p v-if="periodDispatchDuration.unconvertedRecordCount">有 {{ periodDispatchDuration.unconvertedRecordCount }} 条派遣流水缺少可换算的消耗体力，未计入派遣总时长。</p>
              </div>

              <div v-if="acquiredEntries.length === 0" class="state acquired-empty acquired-type-empty">
                <strong>{{ acquiredEntityType === 'all' ? '本期没有道具或心纸奖励' : (acquiredEntityType === 'item' ? '本期没有背包道具奖励' : '本期没有密探心纸奖励') }}</strong>
                <span>上方总账始终展示本周期的完整统计；可切换统计对象查看对应流水。</span>
              </div>
              <template v-else>
              <div class="acquired-tools" v-reveal>
                <div class="acquired-views" role="tablist" aria-label="获得统计视图">
                  <button role="tab" :aria-selected="acquiredView === 'overview'" :class="{ on: acquiredView === 'overview' }" @click="setAcquiredView('overview')">获得总览</button>
                  <button role="tab" :aria-selected="acquiredView === 'source'" :class="{ on: acquiredView === 'source' }" @click="setAcquiredView('source')">来源分析</button>
                  <button role="tab" :aria-selected="acquiredView === 'timeline'" :class="{ on: acquiredView === 'timeline' }" @click="setAcquiredView('timeline')">按日汇总</button>
                  <button role="tab" :aria-selected="acquiredView === 'details'" :class="{ on: acquiredView === 'details' }" @click="setAcquiredView('details')">流水明细</button>
                </div>
                <div class="acquired-filters" :class="{ 'has-sort': acquiredView === 'overview' }">
                  <label class="acquired-source-filter">
                    <span>来源</span>
                    <select id="acquired-source" v-model="acquiredSource" name="acquired-source" @change="clearSelectedEntity">
                      <option value="all">全部来源</option>
                      <option v-for="source in acquiredStats.channels" :key="source.name" :value="source.name">{{ source.name }}（{{ source.recordCount }}）</option>
                    </select>
                  </label>
                  <label class="acquired-search">
                    <span class="sr-only">搜索名称或 ID</span>
                    <Search :size="16" aria-hidden="true" />
                    <input id="acquired-search" v-model.trim="acquiredSearch" name="acquired-search" type="search" placeholder="搜索名称 / ID" @input="clearSelectedEntity" />
                  </label>
                  <label v-if="acquiredView === 'overview'" class="acquired-sort-filter">
                    <span>排序</span>
                    <select id="acquired-sort" v-model="acquiredSort" name="acquired-sort">
                      <option value="count">获得量 ↓</option>
                      <option value="name">名称顺序</option>
                      <option value="records">获得次数 ↓</option>
                    </select>
                  </label>
                </div>
              </div>

              <section v-if="acquiredView === 'overview'" class="backpack acquired-overview" aria-label="获得总览" v-reveal>
                <div class="bp-head">
                  <span class="bp-tip">{{ acquiredResultCaption }}</span>
                </div>
                <div v-if="displayedAcquiredEntries.length === 0" class="state slim">没有匹配当前筛选的获得记录</div>
                <ul v-else class="slot-grid acquired-slot-grid">
                  <li v-for="e in displayedAcquiredEntries" :key="e.entity_type + ':' + e.id" class="slot" :title="e.name || e.id">
                    <button type="button" class="slot-action" :aria-label="'查看' + (e.name || e.id) + '的获得明细'" @click="openEntityDetails(e.id)">
                      <div class="slot-ic" :class="{ 'is-agent': e.entity_type === 'agent' }">
                        <div class="slot-ph"><span class="ph-seal">图</span><span class="ph-mono">{{ monogram(e) }}</span></div>
                        <img class="slot-img" :src="iconSrc(e)" :alt="e.name || e.id" width="96" height="96" loading="lazy" @load="onImgLoad" @error="onImgError" />
                        <span class="slot-count gained">+{{ fmtCount(e.count) }}</span>
                      </div>
                      <InventoryItemName :entry="e" />
                      <span class="slot-meta">{{ e.recordCount || 0 }} 次记录</span>
                    </button>
                  </li>
                </ul>
              </section>

              <section v-else-if="acquiredView === 'source'" class="acquired-ledger" aria-labelledby="source-title" v-reveal>
                <div class="ledger-head"><div><span>渠道账目</span><h3 id="source-title">奖励从哪里来</h3></div><small>按奖励流水数排序，不直接相加不同物品的数量</small></div>
                <div v-if="sourceRows.length === 0" class="state slim">当前筛选下没有来源数据</div>
                <ol v-else class="source-list">
                  <li v-for="(source, index) in sourceRows" :key="source.name">
                    <button type="button" @click="focusSource(source.name)">
                      <span class="source-rank">{{ String(index + 1).padStart(2, '0') }}</span>
                      <span class="source-main"><strong>{{ source.name }}</strong><i :style="{ '--source-scale': source.scale }"></i></span>
                      <span class="source-stat"><b>{{ source.recordCount }}</b> 条流水</span>
                      <span class="source-stat"><b>{{ source.entityCount }}</b> 种获得</span>
                      <span class="source-top">{{ source.topText }}</span>
                      <ChevronRight :size="18" aria-hidden="true" />
                    </button>
                  </li>
                </ol>
              </section>

              <section v-else-if="acquiredView === 'timeline'" class="acquired-ledger" aria-labelledby="timeline-title" v-reveal>
                <div class="ledger-head"><div><span>每日归账</span><h3 id="timeline-title">按日汇总获得量</h3></div><small>同一天、同一道具自动合并；点击日期核对原始流水</small></div>
                <div v-if="timelineRows.length === 0" class="state slim">当前筛选下没有每日获得数据</div>
                <ol v-else class="timeline-list">
                  <li v-for="day in timelineRows" :key="day.date">
                    <button type="button" :aria-label="'查看' + day.dayLabel + '的奖励流水明细'" @click="openDayDetails(day.date)">
                      <time :datetime="day.date"><b>{{ day.dayLabel }}</b><span>{{ day.weekday }} · {{ day.recordCount }} 条流水合并</span></time>
                      <span class="daily-rewards">
                        <span v-for="reward in day.rewards" :key="reward.id"><b>{{ reward.name }}</b><em>+{{ fmtCount(reward.count) }}</em></span>
                      </span>
                      <ChevronRight :size="18" aria-hidden="true" />
                    </button>
                  </li>
                </ol>
              </section>

              <section v-else class="acquired-ledger acquired-details" aria-labelledby="details-title" v-reveal>
                <div class="ledger-head details-head">
                  <div><span>原始账目</span><h3 id="details-title">{{ detailsTitle }}</h3></div>
                  <button v-if="selectedEntity || selectedDay" type="button" class="act-btn ghost" @click="clearSelectedEntity"><X :size="14" aria-hidden="true" />查看全部</button>
                </div>
                <p class="details-caption">{{ detailResultCaption }}</p>
                <div v-if="filteredRewardRecords.length === 0" class="state slim">没有匹配当前筛选的流水</div>
                <ol v-else class="detail-list">
                  <li v-for="record in filteredRewardRecords" :key="record.record_id">
                    <time :datetime="record.effective_at"><b>{{ fmtRecordDay(record.effective_at) }}</b><span>{{ fmtRecordClock(record.effective_at) }}</span></time>
                    <div class="detail-meta">
                      <span class="detail-source">{{ recordChannel(record) }}</span>
                      <span v-if="staminaCostOf(record) !== undefined" class="detail-stamina">消耗体力 <b>{{ staminaCostOf(record) }}</b></span>
                    </div>
                    <div class="detail-entries">
                      <span v-for="entry in visibleRecordEntries(record)" :key="entry.id"><b>{{ entry.name || nameOf(entry.id, null, record.entity_type) }}</b><em>+{{ fmtCount(entry.count) }}</em></span>
                    </div>
                  </li>
                </ol>
              </section>
              </template>
            </template>
          </div>

          <!-- 导入记录 -->
          <div v-show="activeTab === 'records'" class="panel">
            <div class="records-head" v-reveal>
              <span class="hint">已加载 {{ recordsList.length }} 条导入记录 · 删除单条后自动重放剩余记录重建库存</span>
              <span class="sp"></span>
              <button class="act-btn ghost" :disabled="recordsLoading" @click="loadRecords(true)">刷新</button>
            </div>

            <div v-if="recordsLoading && recordsList.length === 0" class="state">正在加载记录…</div>
            <div v-else-if="recordsError" class="state err">{{ recordsError }}</div>
            <div v-else-if="recordsList.length === 0" class="state">暂无导入记录</div>
            <template v-else>
              <ul class="record-list" v-reveal>
                <li v-for="r in recordsList" :key="r.record_id" class="record">
                  <div class="record-main">
                    <div class="record-top">
                      <span class="rtag" :class="r.record_type === 'reward_delta' ? 'rtag-reward' : 'rtag-snapshot'">{{ r.record_type === 'reward_delta' ? '奖励' : '快照' }}</span>
                      <span class="rtag rtag-type" :class="r.entity_type === 'agent' ? 'rtag-agent' : 'rtag-item'">{{ r.entity_type === 'agent' ? '角色' : '物品' }}</span>
                      <span v-if="r.acquisition_channel" class="rtag rtag-type">{{ r.acquisition_channel }}</span>
                      <span v-if="staminaCostOf(r) !== undefined" class="rtag rtag-stamina">消耗体力 {{ staminaCostOf(r) }}</span>
                      <span class="rtag effect" :class="'eff-' + r.stock_effect">{{ stockEffectLabel(r.stock_effect) }}</span>
                      <span class="record-time">{{ fmtTime(r.effective_at) }}</span>
                    </div>
                    <div class="record-entries">{{ entrySummary(r.entries, r.record_type) }}</div>
                    <div class="record-id" :title="r.record_id">{{ r.record_id }}</div>
                  </div>
                  <button class="record-del" @click="onDeleteRecord(r)">删除</button>
                </li>
              </ul>
              <button v-if="recordsNextCursor" class="load-more" :disabled="recordsLoading" @click="loadRecords(false)">加载更多</button>
            </template>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>广陵库房<br><span>清点 · 归档 · 溯源</span></template>
        <template #fine>
          <b>YuanHub</b> · 库存与奖励台账<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内实际库存为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { ArrowDown, ArrowDownUp, CalendarDays, Check, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Info, Layers3, ListFilter, Minus, Pencil, Plus, RefreshCw, Save, Search, Star, X } from '@lucide/vue'
import AcquiredPeriodReport from '../../components/inventory/AcquiredPeriodReport.vue'
import InventoryItemName from '../../components/inventory/InventoryItemName.vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { getCatalog, getCurrent, getAcquired, exportInventory, importInventory, listRecords, deleteRecord, listAccounts, createAccount, renameAccount, deleteAccount, listAgentFavorites, addAgentFavorite, removeAgentFavorite } from '../../api/inventory.js'
import { auth } from '../../store/auth.js'
import { CATALOG_VERSION, ITEM_CATALOG, AGENT_CATALOG, AGENT_PROFS } from '../../data/inventory/catalog.js'
import { acquisitionChannel, buildAcquiredStats, buildRewardInsights, localDayKey, mapsHaveSameCounts, summarizeDispatchDuration } from '../../data/inventory/acquiredStats.js'
import { buildAgentGroups, filterAgentEntries, sortAgentEntries } from '../../data/inventory/agentManifest.js'
import { FRONTEND_HIDDEN_ITEM_IDS, buildItemCategorySections, sortItemsByGameOrder, sortStockEditItems, visibleInventoryItems } from '../../data/inventory/itemSections.js'
import { buildManualStockSnapshot, nextManualSnapshotTime, preserveHiddenStockEntries } from '../../data/inventory/manualStock.js'
import { staminaCostOf, validateInventoryExchangeDocument } from '../../data/inventory/exchange.js'

const activeTab = ref('manifest')
const manifestPanel = ref(null)
const entityType = ref('item')
const manifestSearch = ref('')
const manifestFilter = ref('all')
const agentFavoriteMode = ref('priority')
const agentControlsCollapsed = ref(false)
const agentStatusFilters = ref([])
const agentRarityFilters = ref([])
const agentProfFilters = ref([])
const agentSubProfFilters = ref([])
const agentGroupBy = ref('none')
const agentSort = ref('latest')
const agentSortDirection = ref('desc')
const agentSortBeforeEdit = ref(null)
const agentSortDirectionBeforeEdit = ref(null)
const AGENT_SORT_OPTIONS = [
  { id: 'latest', label: '实装顺序' },
  { id: 'backpack', label: '背包顺序' },
  { id: 'count', label: '心纸数量' },
  { id: 'name', label: '名称' }
]
const AGENT_GROUP_OPTIONS = [
  { id: 'none', label: '不分组' },
  { id: 'prof', label: '按属性' },
  { id: 'subProf', label: '按职业' }
]
const agentSortLabel = computed(function () {
  return AGENT_SORT_OPTIONS.find(function (option) { return option.id === agentSort.value })?.label || '实装顺序'
})
const agentGroupLabel = computed(function () {
  return AGENT_GROUP_OPTIONS.find(function (option) { return option.id === agentGroupBy.value })?.label || '不分组'
})
const AGENT_FAVORITE_MODES = [
  { id: 'all', label: '默认' },
  { id: 'priority', label: '关注优先' },
  { id: 'only', label: '只看关注' }
]
const agentControlsToggleLabel = computed(function () {
  return agentControlsCollapsed.value ? '展开密探工具' : '收起密探工具'
})
const AGENT_STATUS_OPTIONS = [
  { id: 'owned', label: '有库存' },
  { id: 'missing', label: '无库存' }
]
const AGENT_RARITIES = [5, 4, 3]
const favoriteAgentIds = ref(new Set())
const favoriteBusyIds = ref(new Set())
const favoriteLoading = ref(false)
const favoriteError = ref('')
const favoriteLoadedAccount = ref('')
let favoriteLoadSeq = 0
const loading = ref(false)
const error = ref('')
const catalog = ref({ entities: [] })
const currentEntries = ref([])
const acquiredEntries = ref([])
const acquiredEntityType = ref('all')
const rangeFrom = ref(localDate(new Date(Date.now() - 29 * 86400000)))
const rangeTo = ref(localDate(new Date()))
const rangePreset = ref('30d')
const acquiredView = ref('overview')
const acquiredSearch = ref('')
const acquiredSource = ref('all')
const acquiredSort = ref('count')
const acquiredLoading = ref(false)
const acquiredError = ref('')
const acquiredRecords = ref([])
const acquiredAllRecords = ref([])
const acquiredAgentHistoryRecords = ref([])
const acquiredRecordsError = ref('')
const acquiredRecordsTruncated = ref(false)
const acquiredAgentHistoryError = ref('')
const acquiredAgentHistoryTruncated = ref(false)
const acquiredRecordProgress = ref({ pages: 0, records: 0 })
const acquiredTotalsObject = ref({})
const acquiredTotalsByType = ref({ item: {}, agent: {} })
const acquiredTotalsErrors = ref({ item: '', agent: '' })
const appliedAcquiredKey = ref('')
const selectedEntityId = ref('')
const selectedDay = ref('')
const rangePresets = [
  { id: '7d', label: '近 7 日' },
  { id: '30d', label: '近 30 日' },
  { id: 'this-week', label: '本周' },
  { id: 'last-week', label: '上周' },
  { id: 'this-month', label: '本月' },
  { id: 'last-month', label: '上月' }
]
const showImport = ref(false)
const importText = ref('')
const importError = ref('')
const importing = ref(false)
const importResult = ref(null)
const loadingExample = ref(false)
const editingStock = ref(false)
const savingStock = ref(false)
const stockDraft = ref({})
const stockOriginal = ref({})
const stockEditError = ref('')
const stockSaveNotice = ref('')
const stockEditScopeIds = ref(null)
const stockEditScopeName = ref('')
const currentFullBaselineAt = ref(null)

// —— 库存子账号 ——
const accounts = ref([])
const accountId = ref('')
const accountsLoading = ref(false)
const accountBusy = ref(false)
const accountError = ref('')
const showAccounts = ref(false)
const newAccountName = ref('')
const exportAll = ref(false)
const currentAccountName = computed(function () {
  const account = accounts.value.find(function (item) { return item.id === accountId.value })
  return account ? account.name : '当前账号'
})

// —— 导入记录（游标分页） ——
const recordsList = ref([])
const recordsNextCursor = ref(null)
const recordsLoading = ref(false)
const recordsError = ref('')

function setTab(t) {
  if (editingStock.value && t !== 'manifest') {
    if (stockChangedCount.value && !confirm('当前库存修改尚未保存，放弃修改并离开？')) return
    cancelStockEdit()
  }
  activeTab.value = t
  if (t === 'manifest' && currentEntries.value.length === 0) reloadCurrent()
  if (t === 'manifest' && entityType.value === 'agent') loadAgentFavorites()
  if (t === 'acquired' && appliedAcquiredKey.value !== currentAcquiredKey.value) loadAcquired()
  if (t === 'records') loadRecords(true)
}
function setEntityType(t) {
  if (editingStock.value) return
  if (t === entityType.value) return
  entityType.value = t
  currentEntries.value = []
  currentFullBaselineAt.value = null
  error.value = ''
  reloadCurrent()
  if (t === 'agent') loadAgentFavorites()
}

function setAcquiredEntityType(t) {
  if (!['all', 'item', 'agent'].includes(t) || t === acquiredEntityType.value) return
  acquiredEntityType.value = t
  acquiredSource.value = 'all'
  acquiredSearch.value = ''
  clearSelectedEntity()
  applyAcquiredEntityType()
}

function clearAgentFavorites() {
  favoriteLoadSeq += 1
  favoriteAgentIds.value = new Set()
  favoriteBusyIds.value = new Set()
  favoriteLoading.value = false
  favoriteError.value = ''
  favoriteLoadedAccount.value = ''
}

async function loadAgentFavorites(force) {
  if (!auth.isLoggedIn || !accountId.value) {
    clearAgentFavorites()
    return
  }
  const targetAccount = accountId.value
  if (!force && favoriteLoadedAccount.value === targetAccount) return
  const seq = ++favoriteLoadSeq
  favoriteLoading.value = true
  favoriteError.value = ''
  try {
    const data = await listAgentFavorites(targetAccount)
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return
    favoriteAgentIds.value = new Set(Array.isArray(data && data.agent_ids) ? data.agent_ids : [])
    favoriteLoadedAccount.value = targetAccount
  } catch (err) {
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return
    favoriteAgentIds.value = new Set()
    favoriteLoadedAccount.value = ''
    favoriteError.value = humanErr(err, '特别关注同步失败')
  } finally {
    if (seq === favoriteLoadSeq && accountId.value === targetAccount) favoriteLoading.value = false
  }
}

async function toggleAgentFavorite(entry) {
  const id = entry && entry.id
  const targetAccount = accountId.value
  if (!id || !auth.isLoggedIn || !targetAccount || favoriteBusyIds.value.has(id)) return
  const wasFavorite = favoriteAgentIds.value.has(id)
  const nextFavorites = new Set(favoriteAgentIds.value)
  if (wasFavorite) nextFavorites.delete(id)
  else nextFavorites.add(id)
  favoriteAgentIds.value = nextFavorites
  favoriteBusyIds.value = new Set(favoriteBusyIds.value).add(id)
  favoriteError.value = ''
  try {
    const data = wasFavorite
      ? await removeAgentFavorite(targetAccount, id)
      : await addAgentFavorite(targetAccount, id)
    if (accountId.value !== targetAccount) return
    const confirmed = new Set(favoriteAgentIds.value)
    if (data && data.favorite === false) confirmed.delete(id)
    else confirmed.add(id)
    favoriteAgentIds.value = confirmed
    favoriteLoadedAccount.value = targetAccount
  } catch (err) {
    if (accountId.value !== targetAccount) return
    const rollback = new Set(favoriteAgentIds.value)
    if (wasFavorite) rollback.add(id)
    else rollback.delete(id)
    favoriteAgentIds.value = rollback
    favoriteError.value = humanErr(err, '关注状态保存失败，请重试')
  } finally {
    if (accountId.value === targetAccount) {
      const busy = new Set(favoriteBusyIds.value)
      busy.delete(id)
      favoriteBusyIds.value = busy
    }
  }
}

function resetAcquiredData() {
  acquiredSeq += 1
  acquiredEntries.value = []
  acquiredRecords.value = []
  acquiredAllRecords.value = []
  acquiredAgentHistoryRecords.value = []
  acquiredTotalsObject.value = {}
  acquiredTotalsByType.value = { item: {}, agent: {} }
  acquiredTotalsErrors.value = { item: '', agent: '' }
  acquiredError.value = ''
  acquiredRecordsError.value = ''
  acquiredRecordsTruncated.value = false
  acquiredAgentHistoryError.value = ''
  acquiredAgentHistoryTruncated.value = false
  acquiredRecordProgress.value = { pages: 0, records: 0 }
  appliedAcquiredKey.value = ''
  acquiredSource.value = 'all'
  acquiredSearch.value = ''
  selectedEntityId.value = ''
  selectedDay.value = ''
}

// —— 库存子账号 ——
async function loadAccounts() {
  if (!auth.isLoggedIn) { accounts.value = []; accountId.value = ''; clearAgentFavorites(); return }
  accountsLoading.value = true
  accountError.value = ''
  try {
    const list = await listAccounts()
    accounts.value = Array.isArray(list) ? list : []
    const still = accounts.value.some(function (a) { return a.id === accountId.value })
    if (!still) accountId.value = accounts.value.length ? accounts.value[0].id : ''
  } catch (err) {
    accountError.value = humanErr(err, '子账号加载失败')
  } finally {
    accountsLoading.value = false
  }
}

function onAccountChange() {
  // 切换账号：清空旧账号数据并按需重载
  cancelStockEdit()
  clearAgentFavorites()
  stockSaveNotice.value = ''
  currentEntries.value = []
  currentFullBaselineAt.value = null
  resetAcquiredData()
  recordsList.value = []
  recordsNextCursor.value = null
  recordsError.value = ''
  error.value = ''
  reloadCurrent()
  if (entityType.value === 'agent') loadAgentFavorites()
  if (activeTab.value === 'acquired') loadAcquired()
  if (activeTab.value === 'records') loadRecords(true)
}

async function onCreateAccount() {
  const name = newAccountName.value.trim()
  if (!name) return
  accountBusy.value = true
  accountError.value = ''
  try {
    const created = await createAccount(name)
    newAccountName.value = ''
    await loadAccounts()
    if (created && created.id) accountId.value = created.id
    onAccountChange()
  } catch (err) {
    accountError.value = humanErr(err, '创建账号失败')
  } finally {
    accountBusy.value = false
  }
}

async function onRenameAccount(acc) {
  const name = prompt('修改子账号名称（1~64 字）：', acc.name || '')
  if (name == null) return
  const trimmed = name.trim()
  if (!trimmed) { accountError.value = '名称不能为空'; return }
  accountBusy.value = true
  accountError.value = ''
  try {
    await renameAccount(acc.id, trimmed)
    await loadAccounts()
  } catch (err) {
    accountError.value = humanErr(err, '改名失败')
  } finally {
    accountBusy.value = false
  }
}

async function onDeleteAccount(acc) {
  if (!confirm('删除子账号「' + acc.name + '」？将级联清除该账号的库存、流水与相关 Token，且不可恢复。')) return
  accountBusy.value = true
  accountError.value = ''
  try {
    await deleteAccount(acc.id)
    await loadAccounts()
    const still = accounts.value.some(function (a) { return a.id === accountId.value })
    if (!still) accountId.value = accounts.value.length ? accounts.value[0].id : ''
    onAccountChange()
  } catch (err) {
    accountError.value = humanErr(err, '删除账号失败')
  } finally {
    accountBusy.value = false
  }
}

// ISO 日期（本地时区 YYYY-MM-DD），供 <input type=date> 与后端 [from,to) 区间
function localDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function inputDate(value) {
  const parts = String(value || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const date = new Date(parts[0], parts[1] - 1, parts[2], 12)
  if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null
  return date
}

function addLocalDays(date, count) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

function weekStart(date) {
  const start = new Date(date)
  const offset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - offset)
  return start
}

function markCustomRange() {
  rangePreset.value = 'custom'
}

function applyRangePreset(id) {
  const today = inputDate(localDate(new Date()))
  let from = today
  let to = today
  if (id === '7d') from = addLocalDays(today, -6)
  if (id === '30d') from = addLocalDays(today, -29)
  if (id === 'this-week') from = weekStart(today)
  if (id === 'last-week') {
    to = addLocalDays(weekStart(today), -1)
    from = addLocalDays(to, -6)
  }
  if (id === 'this-month') from = new Date(today.getFullYear(), today.getMonth(), 1, 12)
  if (id === 'last-month') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1, 12)
    to = new Date(today.getFullYear(), today.getMonth(), 0, 12)
  }
  rangePreset.value = id
  rangeFrom.value = localDate(from)
  rangeTo.value = localDate(to)
  loadAcquired()
}

function fmtCount(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN')
}

// —— 背包格图标约定 ——
const ICON_EXT = 'png'

function iconSrc(e) {
  const type = e && e.entity_type ? e.entity_type : entityType.value
  const kind = type === 'agent' ? 'agents' : 'items'
  return import.meta.env.BASE_URL + 'inventory-icons/' + kind + '/' + encodeURIComponent(e.id) + '.' + ICON_EXT
}

function onImgLoad(ev) {
  const img = ev && ev.currentTarget
  if (!img) return
  img.hidden = false
  if (img.parentElement) img.parentElement.classList.remove('has-icon-error')
}

function onImgError(ev) {
  const img = ev && ev.currentTarget
  if (!img) return
  img.hidden = true
  if (img.parentElement) img.parentElement.classList.add('has-icon-error')
}

function monogram(e) {
  const s = String(e.name || e.id || '?')
  return Array.from(s)[0] || '?'
}

function nameOf(id, name, requestedType) {
  const type = requestedType || entityType.value
  const local = LOCAL_NAME[type] ? LOCAL_NAME[type].get(id) : null
  if (local) return local
  if (name) return name
  if (!catalog.value.entities.length) return id
  const hit = catalog.value.entities.find(function (e) { return e.id === id && e.entity_type === type })
  return (hit && hit.name) ? hit.name : id
}

function acquiredNameOf(id, name) {
  if (name) return name
  const active = acquiredEntries.value.find(function (entry) { return entry.id === id })
  if (active && active.name) return active.name
  const itemName = nameOf(id, null, 'item')
  return itemName !== id ? itemName : nameOf(id, null, 'agent')
}

function applyAcquiredEntityType() {
  const types = acquiredEntityType.value === 'all' ? ['item', 'agent'] : [acquiredEntityType.value]
  const totals = {}
  acquiredEntries.value = types.flatMap(function (type) {
    const acquired = acquiredTotalsByType.value[type] || {}
    return Object.keys(acquired).map(function (id) {
      const count = Number(acquired[id]) || 0
      totals[id] = (totals[id] || 0) + count
      return { id: id, name: nameOf(id, null, type), count: count, entity_type: type }
    })
  }).filter(function (entry) {
    return entry.count > 0
  }).sort(function (left, right) {
    return right.count - left.count || left.name.localeCompare(right.name, 'zh-CN')
  })
  acquiredTotalsObject.value = totals
  acquiredRecords.value = acquiredEntityType.value === 'all'
    ? acquiredAllRecords.value.slice()
    : acquiredAllRecords.value.filter(function (record) { return record && record.entity_type === acquiredEntityType.value })
}

const visibleItemCatalog = visibleInventoryItems(ITEM_CATALOG)
const stockCatalogSections = buildItemCategorySections(sortItemsByGameOrder(visibleItemCatalog))
const stockCatalogSubsections = new Map(
  stockCatalogSections.flatMap(function (section) { return section.subsections || [] })
    .map(function (subsection) { return [subsection.id, subsection] })
)
const itemCatalogCount = visibleItemCatalog.length
const agentCatalogCount = AGENT_CATALOG.length
const agentSubProfs = Array.from(new Set(AGENT_CATALOG.map(function (entry) { return entry.subProf }).filter(Boolean)))
const agentFacetCount = computed(function () {
  return agentStatusFilters.value.length + agentRarityFilters.value.length + agentProfFilters.value.length + agentSubProfFilters.value.length
})
const agentSortDirectionButtonLabel = computed(function () {
  return agentSortDirection.value === 'desc' ? '切换为升序' : '切换为降序'
})

const LOCAL_NAME = {
  item: new Map(ITEM_CATALOG.map(function (e) { return [e.id, e.name] })),
  agent: new Map(AGENT_CATALOG.map(function (e) { return [e.id, e.name] }))
}
const LOCAL_ITEM = new Map(ITEM_CATALOG.map(function (e) { return [e.id, e] }))
const localCatalog = computed(function () { return entityType.value === 'agent' ? AGENT_CATALOG : visibleItemCatalog })
const visibleCurrentEntries = computed(function () {
  return entityType.value === 'item' ? visibleInventoryItems(currentEntries.value) : currentEntries.value
})
const currentMap = computed(function () {
  const m = {}
  currentEntries.value.forEach(function (e) { m[e.id] = Number(e.count) || 0 })
  return m
})
const manifestBaseEntries = computed(function () {
  const stock = currentMap.value
  return localCatalog.value.map(function (entry) {
    const count = stock[entry.id] != null ? stock[entry.id] : 0
    return Object.assign({}, entry, { count: count, owned: count > 0 })
  })
})
const manifestEntries = computed(function () {
  const q = manifestSearch.value.toLowerCase()
  const f = manifestFilter.value
  if (entityType.value === 'agent') {
    const filtered = filterAgentEntries(manifestBaseEntries.value, {
      query: q,
      statuses: agentStatusFilters.value,
      favoriteMode: agentFavoriteMode.value,
      rarities: agentRarityFilters.value,
      profs: agentProfFilters.value,
      subProfs: agentSubProfFilters.value
    }, favoriteAgentIds.value)
    return sortAgentEntries(filtered, agentSort.value, favoriteAgentIds.value, {
      favoriteFirst: agentFavoriteMode.value === 'priority',
      direction: agentSortDirection.value
    })
  }
  return manifestBaseEntries.value.filter(function (e) {
      if (f === 'owned' && !e.owned) return false
      if (f === 'missing' && e.owned) return false
      if (q) {
        const hay = [e.name, e.id, e.category, e.prof, e.subProf].filter(Boolean).join(' ').toLowerCase()
        if (hay.indexOf(q) === -1) return false
      }
      return true
    })
})
const manifestGameEntries = computed(function () { return sortItemsByGameOrder(manifestEntries.value) })
const manifestCategorySections = computed(function () { return buildItemCategorySections(manifestGameEntries.value) })
const agentGroups = computed(function () { return buildAgentGroups(manifestEntries.value, agentGroupBy.value) })
const agentFiltersActive = computed(function () {
  return !!manifestSearch.value || agentFavoriteMode.value === 'only' || agentFacetCount.value > 0
})
const agentEmptyMessage = computed(function () {
  if (agentFavoriteMode.value === 'only' && favoriteAgentIds.value.size === 0) return '还没有特别关注的密探'
  if (manifestSearch.value) return '没有找到“' + manifestSearch.value + '”'
  return '当前筛选下没有密探'
})

function clearAgentFacetFilters() {
  agentStatusFilters.value = []
  agentRarityFilters.value = []
  agentProfFilters.value = []
  agentSubProfFilters.value = []
}

function toggleAgentSortDirection() {
  agentSortDirection.value = agentSortDirection.value === 'desc' ? 'asc' : 'desc'
}

function chooseAgentMenuValue(event, type, value) {
  if (type === 'sort') {
    agentSort.value = value
    if (value === 'backpack') agentSortDirection.value = 'asc'
  }
  if (type === 'group') agentGroupBy.value = value
  const menu = event.currentTarget.closest('details')
  if (menu) menu.open = false
}

function positionAgentFilterMenu(event) {
  const panel = event.currentTarget
  if (!panel.open) return
  nextTick(function () {
    const menu = panel.querySelector('.agent-filter-menu')
    if (!menu) return
    if (window.innerWidth > 640) {
      menu.style.left = ''
      menu.style.right = ''
      menu.style.transform = ''
      return
    }
    const panelRect = panel.getBoundingClientRect()
    const menuWidth = Math.min(320, window.innerWidth - 32)
    const left = Math.max(16, Math.min(window.innerWidth - menuWidth - 16, panelRect.right - menuWidth))
    menu.style.left = (left - panelRect.left) + 'px'
    menu.style.right = 'auto'
    menu.style.transform = 'none'
  })
}

function resetAgentFilters() {
  manifestSearch.value = ''
  manifestFilter.value = 'all'
  agentFavoriteMode.value = 'priority'
  clearAgentFacetFilters()
}

const stockEditEntries = computed(function () {
  const baseCatalog = entityType.value === 'agent' ? AGENT_CATALOG : visibleItemCatalog
  const ids = new Set(baseCatalog.map(function (item) { return item.id }))
  const entries = baseCatalog.slice()
  visibleCurrentEntries.value.forEach(function (item) {
    if (!ids.has(item.id)) entries.push(item)
  })
  return entityType.value === 'agent' ? sortAgentEntries(entries, 'backpack', null, { direction: 'asc' }) : sortStockEditItems(entries)
})
const stockEditorEntries = computed(function () {
  if (!stockEditScopeIds.value) return stockEditEntries.value
  const scopeIds = new Set(stockEditScopeIds.value)
  return stockEditEntries.value.filter(function (item) { return scopeIds.has(item.id) })
})
const visibleStockEditorEntries = computed(function () {
  if (entityType.value !== 'agent') return stockEditorEntries.value
  const rows = stockEditorEntries.value.map(function (entry) {
    const count = Number(currentMap.value[entry.id]) || 0
    return Object.assign({}, entry, { count: count, owned: count > 0 })
  })
  const filtered = filterAgentEntries(rows, {
    query: manifestSearch.value,
    statuses: agentStatusFilters.value,
    favoriteMode: agentFavoriteMode.value,
    rarities: agentRarityFilters.value,
    profs: agentProfFilters.value,
    subProfs: agentSubProfFilters.value
  }, favoriteAgentIds.value)
  return sortAgentEntries(filtered, agentSort.value, favoriteAgentIds.value, {
    favoriteFirst: agentFavoriteMode.value === 'priority',
    direction: agentSortDirection.value
  })
})
const stockDraftError = computed(function () {
  const invalid = stockEditorEntries.value.find(function (item) { return !isValidStockCount(stockDraft.value[item.id]) })
  return invalid ? (invalid.name || invalid.id) + '的库存必须是 0 至 2,147,483,647 之间的整数' : ''
})
const stockChangedCount = computed(function () {
  return stockEditorEntries.value.filter(function (item) {
    const value = stockDraft.value[item.id]
    return isValidStockCount(value) && Number(value) !== Number(stockOriginal.value[item.id] || 0)
  }).length
})
const manifestTotal = computed(function () { return localCatalog.value.length })
const manifestOwned = computed(function () {
  const stock = currentMap.value
  return localCatalog.value.filter(function (e) { return (stock[e.id] || 0) > 0 }).length
})
const manifestPercent = computed(function () {
  if (!manifestTotal.value) return '0%'
  return Math.round(manifestOwned.value * 100 / manifestTotal.value) + '%'
})
const manifestProgressScale = computed(function () {
  if (!manifestTotal.value) return 0
  return manifestOwned.value / manifestTotal.value
})

const currentAcquiredKey = computed(function () {
  return [accountId.value, rangeFrom.value, rangeTo.value].join('|')
})
const acquiredQueryDirty = computed(function () {
  return !!appliedAcquiredKey.value && appliedAcquiredKey.value !== currentAcquiredKey.value
})
const acquiredRangeDays = computed(function () {
  const from = inputDate(rangeFrom.value)
  const to = inputDate(rangeTo.value)
  if (!from || !to || from > to) return 0
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1
})
const acquiredRangeLabel = computed(function () {
  const from = inputDate(rangeFrom.value)
  const to = inputDate(rangeTo.value)
  if (!from || !to || from > to) return '请选择有效的起止日期'
  const format = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' })
  return format.format(from) + ' 至 ' + format.format(to) + ' · 包含起止当天'
})
const acquiredStats = computed(function () { return buildAcquiredStats(acquiredRecords.value) })
const acquiredItemRecords = computed(function () {
  return acquiredAllRecords.value.filter(function (record) { return record && record.entity_type === 'item' })
})
const acquiredAgentRecords = computed(function () {
  return acquiredAllRecords.value.filter(function (record) { return record && record.entity_type === 'agent' })
})
const favoriteAgentsForStats = computed(function () {
  return AGENT_CATALOG.filter(function (agent) { return favoriteAgentIds.value.has(agent.id) })
})
const periodInsights = computed(function () {
  return buildRewardInsights({
    itemTotals: acquiredTotalsByType.value.item,
    agentTotals: acquiredTotalsByType.value.agent,
    itemRecords: acquiredItemRecords.value,
    agentRecords: acquiredAgentRecords.value,
    agentHistoryRecords: acquiredAgentHistoryRecords.value,
    agentHistoryComplete: !acquiredAgentHistoryError.value && !acquiredAgentHistoryTruncated.value,
    favoriteAgents: favoriteAgentsForStats.value,
    rangeEnd: rangeTo.value
  })
})
const periodHasData = computed(function () {
  const totals = Object.values(acquiredTotalsByType.value.item || {}).concat(Object.values(acquiredTotalsByType.value.agent || {}))
  return totals.some(function (count) { return (Number(count) || 0) > 0 }) || periodInsights.value.rewardRecordCount > 0
})
const acquiredActivityLabel = computed(function () {
  if (acquiredLoading.value || acquiredQueryDirty.value || acquiredRecordsError.value || !periodHasData.value) return ''
  return periodInsights.value.activeDayCount + '天 · ' + periodInsights.value.rewardRecordCount + '条'
})
const acquiredRangeMetaLabel = computed(function () {
  const period = '共 ' + acquiredRangeDays.value + ' 天'
  return acquiredActivityLabel.value ? period + ' · 有收获 ' + acquiredActivityLabel.value : period
})
const periodDispatchDuration = computed(function () {
  const summary = summarizeDispatchDuration(acquiredAllRecords.value)
  return Object.assign({}, summary, { source: summary.dispatchRecordCount ? 'all' : '' })
})
const acquiredEntityMap = computed(function () {
  return new Map(acquiredStats.value.entities.map(function (entry) { return [entry.id, entry] }))
})
const acquiredTotalsMatch = computed(function () {
  if (acquiredRecordsError.value || acquiredRecordsTruncated.value) return true
  const recordTotals = {}
  acquiredStats.value.entities.forEach(function (entry) { recordTotals[entry.id] = entry.count })
  return mapsHaveSameCounts(acquiredTotalsObject.value, recordTotals)
})
const selectedEntity = computed(function () {
  if (!selectedEntityId.value) return null
  const statsEntry = acquiredEntityMap.value.get(selectedEntityId.value)
  const totalEntry = acquiredEntries.value.find(function (entry) { return entry.id === selectedEntityId.value })
  return statsEntry || totalEntry || null
})
const selectedDayLabel = computed(function () {
  const date = inputDate(selectedDay.value)
  return date ? (date.getMonth() + 1) + '月' + date.getDate() + '日' : selectedDay.value
})
const detailsTitle = computed(function () {
  if (selectedEntity.value) return selectedEntity.value.name + '的获得明细'
  if (selectedDay.value) return selectedDayLabel.value + '的奖励流水'
  return '奖励流水明细'
})

function entryMatchesQuery(entry, query) {
  if (!query) return true
  const name = entry.name || acquiredNameOf(entry.id, null)
  return [entry.id, name].filter(Boolean).join(' ').toLowerCase().includes(query)
}

const displayedAcquiredEntries = computed(function () {
  const query = acquiredSearch.value.toLowerCase()
  const source = acquiredSource.value
  const recordCounts = new Map()
  acquiredStats.value.rewardRecords.forEach(function (record) {
    if (source !== 'all' && acquisitionChannel(record.acquisition_channel) !== source) return
    const ids = new Set((Array.isArray(record.entries) ? record.entries : []).map(function (entry) { return entry.id }))
    ids.forEach(function (id) { recordCounts.set(id, (recordCounts.get(id) || 0) + 1) })
  })
  const rows = acquiredEntries.value.map(function (entry) {
    const detail = acquiredEntityMap.value.get(entry.id)
    const count = source === 'all' ? entry.count : Number(detail && detail.channels[source]) || 0
    return Object.assign({}, entry, { count: count, recordCount: recordCounts.get(entry.id) || 0 })
  }).filter(function (entry) {
    return entry.count > 0 && entryMatchesQuery(entry, query)
  })
  return rows.sort(function (left, right) {
    if (acquiredSort.value === 'name') return left.name.localeCompare(right.name, 'zh-CN')
    if (acquiredSort.value === 'records') return right.recordCount - left.recordCount || right.count - left.count
    return right.count - left.count || left.name.localeCompare(right.name, 'zh-CN')
  })
})
const acquiredResultCaption = computed(function () {
  const source = acquiredSource.value === 'all' ? '全部来源' : acquiredSource.value
  const search = acquiredSearch.value ? '· 匹配「' + acquiredSearch.value + '」' : ''
  return source + ' ' + search + ' · 显示 ' + displayedAcquiredEntries.value.length + ' 种 · 点击图标查看原始流水'
})

const filteredRewardRecords = computed(function () {
  const query = acquiredSearch.value.toLowerCase()
  const source = acquiredSource.value
  return acquiredStats.value.rewardRecords.filter(function (record) {
    if (source !== 'all' && acquisitionChannel(record.acquisition_channel) !== source) return false
    const entries = Array.isArray(record.entries) ? record.entries : []
    if (selectedDay.value && localDayKey(record.effective_at) !== selectedDay.value) return false
    if (selectedEntityId.value && !entries.some(function (entry) { return entry.id === selectedEntityId.value })) return false
    if (query && !entries.some(function (entry) { return entryMatchesQuery(entry, query) })) return false
    return true
  }).slice().sort(function (left, right) {
    return new Date(right.effective_at).getTime() - new Date(left.effective_at).getTime()
  })
})

const sourceRows = computed(function () {
  const query = acquiredSearch.value.toLowerCase()
  const selectedSource = acquiredSource.value
  const sourceMap = new Map()
  acquiredStats.value.rewardRecords.forEach(function (record) {
    const source = acquisitionChannel(record.acquisition_channel)
    if (selectedSource !== 'all' && source !== selectedSource) return
    const entries = (Array.isArray(record.entries) ? record.entries : []).filter(function (entry) {
      return entryMatchesQuery(entry, query)
    })
    if (query && entries.length === 0) return
    if (!sourceMap.has(source)) sourceMap.set(source, { name: source, recordCount: 0, ids: new Set(), counts: new Map() })
    const row = sourceMap.get(source)
    row.recordCount += 1
    entries.forEach(function (entry) {
      row.ids.add(entry.id)
      row.counts.set(entry.id, (row.counts.get(entry.id) || 0) + (Number(entry.count) || 0))
    })
  })
  const rows = Array.from(sourceMap.values()).sort(function (a, b) { return b.recordCount - a.recordCount })
  const max = rows.length ? rows[0].recordCount : 1
  return rows.map(function (row) {
    const top = Array.from(row.counts.entries()).sort(function (a, b) { return b[1] - a[1] }).slice(0, 3)
    return {
      name: row.name,
      recordCount: row.recordCount,
      entityCount: row.ids.size,
      scale: row.recordCount / max,
      topText: top.map(function (pair) { return acquiredNameOf(pair[0], null) + ' +' + fmtCount(pair[1]) }).join(' · ')
    }
  })
})

const timelineRows = computed(function () {
  const stats = buildAcquiredStats(filteredRewardRecords.value)
  return stats.days.slice().reverse().map(function (day) {
    const date = inputDate(day.date)
    return Object.assign({}, day, {
      dayLabel: date ? (date.getMonth() + 1) + '月' + date.getDate() + '日' : day.date,
      weekday: date ? new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date) : '',
      rewards: Object.entries(day.counts || {}).map(function (pair) {
        return { id: pair[0], name: acquiredNameOf(pair[0], null), count: Number(pair[1]) || 0 }
      }).filter(function (entry) {
        return entry.count > 0
      }).sort(function (left, right) {
        return right.count - left.count || left.name.localeCompare(right.name, 'zh-CN')
      })
    })
  })
})
const detailResultCaption = computed(function () {
  const parts = []
  if (acquiredSource.value !== 'all') parts.push(acquiredSource.value)
  if (selectedDay.value) parts.push(selectedDayLabel.value)
  if (acquiredSearch.value) parts.push('匹配「' + acquiredSearch.value + '」')
  parts.push(filteredRewardRecords.value.length + ' 条奖励流水')
  return parts.join(' · ')
})

function slotTitle(e) {
  const parts = [e.name || e.id]
  if (entityType.value === 'item' && e.category) parts.push(e.category)
  if (entityType.value === 'agent') {
    let line = (e.rarity != null ? e.rarity + '★' : '')
    if (e.prof) line = line ? line + ' · ' + e.prof : e.prof
    if (e.subProf) line = line ? line + ' · ' + e.subProf : e.subProf
    parts.push(line)
  }
  parts.push('× ' + fmtCount(e.count))
  return parts.join(' ｜ ')
}

function isValidStockCount(value) {
  if (value === '' || value == null) return false
  const count = Number(value)
  return Number.isInteger(count) && count >= 0 && count <= 2147483647
}

function adjustStockCount(id, delta) {
  const current = Number(stockDraft.value[id])
  if (!Number.isInteger(current)) return
  stockDraft.value[id] = Math.min(2147483647, Math.max(0, current + delta))
}

function startSubsectionStockEdit(subcategory) {
  const subsection = stockCatalogSubsections.get(subcategory.id)
  startStockEdit(subsection ? subsection.entries : subcategory.entries, subcategory.name)
}

function scrollToStockEditor() {
  nextTick(function () {
    if (!manifestPanel.value) return
    const offset = window.matchMedia('(max-width: 640px)').matches ? 64 : 16
    const top = window.scrollY + manifestPanel.value.getBoundingClientRect().top - offset
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    window.scrollTo({ top: Math.max(0, top), behavior: behavior })
  })
}

function startStockEdit(scopeEntries, scopeName) {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!accountId.value) { alert('请先创建并选择一个子账号'); return }
  const draft = {}
  stockEditEntries.value.forEach(function (item) { draft[item.id] = Number(currentMap.value[item.id]) || 0 })
  stockDraft.value = Object.assign({}, draft)
  stockOriginal.value = Object.assign({}, draft)
  stockEditScopeIds.value = Array.isArray(scopeEntries) ? scopeEntries.map(function (item) { return item.id }) : null
  stockEditScopeName.value = stockEditScopeIds.value ? String(scopeName || '') : ''
  stockEditError.value = ''
  stockSaveNotice.value = ''
  showImport.value = false
  if (entityType.value === 'agent') {
    agentSortBeforeEdit.value = agentSort.value
    agentSortDirectionBeforeEdit.value = agentSortDirection.value
    agentSort.value = 'backpack'
    agentSortDirection.value = 'asc'
  }
  editingStock.value = true
  scrollToStockEditor()
}

function restoreAgentSortAfterEdit() {
  if (agentSortBeforeEdit.value == null) return
  agentSort.value = agentSortBeforeEdit.value
  agentSortDirection.value = agentSortDirectionBeforeEdit.value || 'desc'
  agentSortBeforeEdit.value = null
  agentSortDirectionBeforeEdit.value = null
}

function cancelStockEdit() {
  editingStock.value = false
  savingStock.value = false
  stockDraft.value = {}
  stockOriginal.value = {}
  stockEditScopeIds.value = null
  stockEditScopeName.value = ''
  stockEditError.value = ''
  restoreAgentSortAfterEdit()
}

function manualSnapshotTime() {
  return nextManualSnapshotTime(
    currentFullBaselineAt.value,
    currentEntries.value.map(function (item) { return item.listedBaselineAt })
  )
}

function manualRecordId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return 'yuanhub:manual:' + globalThis.crypto.randomUUID()
  }
  return 'yuanhub:manual:' + Date.now() + ':' + Math.random().toString(16).slice(2)
}

async function saveStockEdit() {
  stockEditError.value = stockDraftError.value
  if (stockEditError.value || !stockChangedCount.value || savingStock.value) return
  savingStock.value = true
  const effectiveAt = manualSnapshotTime()
  const visibleDraftEntries = stockEditEntries.value.map(function (item) {
    return { id: item.id, name: item.name || item.id, count: Number(stockDraft.value[item.id]) }
  })
  const draftEntries = entityType.value === 'item'
    ? preserveHiddenStockEntries(visibleDraftEntries, currentEntries.value, FRONTEND_HIDDEN_ITEM_IDS)
    : visibleDraftEntries
  const doc = buildManualStockSnapshot({
    accountId: accountId.value,
    entityType: entityType.value,
    catalogVersion: CATALOG_VERSION,
    effectiveAt: effectiveAt,
    recordId: manualRecordId(),
    entries: draftEntries
  })
  try {
    const result = await importInventory(doc)
    if (result && result.superseded) throw new Error('快照时间早于现有库存，未能生效')
    editingStock.value = false
    restoreAgentSortAfterEdit()
    stockSaveNotice.value = entityType.value === 'agent' ? '密探心纸库存已更新' : '库存已更新'
    stockDraft.value = {}
    stockOriginal.value = {}
    stockEditScopeIds.value = null
    stockEditScopeName.value = ''
    await reloadCurrent()
  } catch (err) {
    stockEditError.value = humanErr(err, '库存保存失败')
  } finally {
    savingStock.value = false
  }
}

async function safeLoad(fn, quiet) {
  loading.value = true
  if (!quiet) error.value = ''
  try { await fn() } catch (err) {
    if (!quiet) error.value = humanErr(err, '加载失败，请稍后重试')
  } finally { loading.value = false }
}

async function reloadCurrent(quiet) {
  // 未登录时不请求云端库存（避免 401 触发自动跳转登录页），数量保持初始 0
  if (!auth.isLoggedIn) {
    currentEntries.value = []
    currentFullBaselineAt.value = null
    error.value = ''
    loading.value = false
    return
  }
  // 未选择账号时不请求（后端 /current 需要 account_id）
  if (!accountId.value) {
    currentEntries.value = []
    currentFullBaselineAt.value = null
    error.value = ''
    loading.value = false
    return
  }
  await safeLoad(async function () {
    const data = await getCurrent({ accountId: accountId.value, entityType: entityType.value })
    const list = Array.isArray(data) ? data : (data ? [data] : [])
    const doc = list[0]
    const entriesObj = (doc && doc.entries) ? doc.entries : {}
    currentFullBaselineAt.value = doc ? doc.full_baseline_at : null
    currentEntries.value = Object.keys(entriesObj).map(function (id) {
      const se = entriesObj[id] || {}
      const item = entityType.value === 'item' ? LOCAL_ITEM.get(id) : null
      return { id: id, name: nameOf(id, se.name), count: Number(se.count) || 0, category: item ? item.category : '', listedBaselineAt: se.listed_baseline_at || null }
    }).sort(function (a, b) { return b.count - a.count })
  }, quiet)
}

function dayStartIso(dStr) {
  const p = String(dStr || '').split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return null
  return new Date(p[0], p[1] - 1, p[2]).toISOString()
}

function nextDayStartIso(dStr) {
  const p = String(dStr || '').split('-').map(Number)
  if (p.length !== 3 || p.some(isNaN)) return null
  return new Date(p[0], p[1] - 1, p[2] + 1).toISOString()
}

let acquiredSeq = 0
const MAX_ACQUIRED_RECORD_PAGES = 50

function setAcquiredView(view) {
  acquiredView.value = view
  if (view !== 'details') {
    selectedEntityId.value = ''
    selectedDay.value = ''
  }
}

function openEntityDetails(id) {
  selectedEntityId.value = id
  selectedDay.value = ''
  acquiredView.value = 'details'
}

function openDayDetails(day) {
  selectedDay.value = day
  selectedEntityId.value = ''
  acquiredView.value = 'details'
}

function clearSelectedEntity() {
  selectedEntityId.value = ''
  selectedDay.value = ''
}

function focusSource(source) {
  acquiredSource.value = source
  acquiredView.value = 'overview'
  selectedEntityId.value = ''
  selectedDay.value = ''
}

function recordChannel(record) {
  return acquisitionChannel(record && record.acquisition_channel)
}

function visibleRecordEntries(record) {
  const query = acquiredSearch.value.toLowerCase()
  const entries = Array.isArray(record && record.entries) ? record.entries : []
  return entries.filter(function (entry) {
    if (selectedEntityId.value) return entry.id === selectedEntityId.value
    return entryMatchesQuery(entry, query)
  })
}

function fmtRecordDay(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}

function fmtRecordClock(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

async function fetchAcquiredRecords(params, seq, trackProgress = true) {
  const records = []
  const seenCursors = new Set()
  let cursor = null
  let pages = 0
  let truncated = false
  do {
    const page = await listRecords({
      accountId: params.accountId,
      entityType: params.entityType,
      from: params.from,
      to: params.to,
      cursor: cursor,
      limit: 100
    })
    if (seq !== acquiredSeq) return { records: [], truncated: false, cancelled: true }
    const items = page && Array.isArray(page.items) ? page.items : []
    records.push(...items)
    pages += 1
    if (trackProgress) acquiredRecordProgress.value = { pages: pages, records: records.length }
    const nextCursor = page && page.next_cursor ? page.next_cursor : null
    if (!nextCursor) break
    if (seenCursors.has(nextCursor)) throw new Error('流水分页游标重复，已停止加载')
    seenCursors.add(nextCursor)
    cursor = nextCursor
    if (pages >= MAX_ACQUIRED_RECORD_PAGES) {
      truncated = true
      break
    }
  } while (cursor)
  return { records: records, truncated: truncated, cancelled: false }
}

async function loadAcquired() {
  const seq = ++acquiredSeq
  acquiredError.value = ''
  acquiredRecordsError.value = ''
  acquiredRecordsTruncated.value = false
  acquiredAgentHistoryError.value = ''
  acquiredAgentHistoryTruncated.value = false
  acquiredTotalsErrors.value = { item: '', agent: '' }
  acquiredRecordProgress.value = { pages: 0, records: 0 }
  selectedEntityId.value = ''
  selectedDay.value = ''
  acquiredSource.value = 'all'
  if (!auth.isLoggedIn) {
    acquiredEntries.value = []
    acquiredRecords.value = []
    acquiredAllRecords.value = []
    acquiredAgentHistoryRecords.value = []
    acquiredTotalsObject.value = {}
    acquiredTotalsByType.value = { item: {}, agent: {} }
    acquiredError.value = '登录后才能统计子账号的获得量'
    return
  }
  if (!accountId.value) {
    acquiredEntries.value = []
    acquiredRecords.value = []
    acquiredAllRecords.value = []
    acquiredAgentHistoryRecords.value = []
    acquiredTotalsObject.value = {}
    acquiredTotalsByType.value = { item: {}, agent: {} }
    acquiredError.value = '请先创建并选择一个子账号'
    return
  }
  const fromDate = inputDate(rangeFrom.value)
  const toDate = inputDate(rangeTo.value)
  const from = dayStartIso(rangeFrom.value)
  const to = nextDayStartIso(rangeTo.value)
  if (!fromDate || !toDate || fromDate > toDate || !from || !to) {
    acquiredError.value = '请选择有效的起止日期'
    return
  }

  acquiredLoading.value = true
  acquiredEntries.value = []
  acquiredRecords.value = []
  acquiredAllRecords.value = []
  acquiredAgentHistoryRecords.value = []
  acquiredTotalsObject.value = {}
  acquiredTotalsByType.value = { item: {}, agent: {} }
  const queryKey = currentAcquiredKey.value
  const baseParams = { accountId: accountId.value, from: from, to: to }
  const itemParams = Object.assign({}, baseParams, { entityType: 'item' })
  const agentParams = Object.assign({}, baseParams, { entityType: 'agent' })
  loadAgentFavorites()
  try {
    const results = await Promise.allSettled([
      getAcquired(itemParams),
      getAcquired(agentParams),
      fetchAcquiredRecords(baseParams, seq),
      fetchAcquiredRecords({ accountId: accountId.value, entityType: 'agent', to: to }, seq, false)
    ])
    if (seq !== acquiredSeq) return
    const itemTotalsResult = results[0]
    const agentTotalsResult = results[1]
    const recordsResult = results[2]
    const agentHistoryResult = results[3]
    const nextTotals = { item: {}, agent: {} }
    const nextErrors = { item: '', agent: '' }
    if (itemTotalsResult.status === 'fulfilled') nextTotals.item = itemTotalsResult.value && itemTotalsResult.value.acquired ? itemTotalsResult.value.acquired : {}
    else nextErrors.item = humanErr(itemTotalsResult.reason, '背包奖励汇总加载失败')
    if (agentTotalsResult.status === 'fulfilled') nextTotals.agent = agentTotalsResult.value && agentTotalsResult.value.acquired ? agentTotalsResult.value.acquired : {}
    else nextErrors.agent = humanErr(agentTotalsResult.reason, '密探心纸汇总加载失败')
    acquiredTotalsByType.value = nextTotals
    acquiredTotalsErrors.value = nextErrors

    if (recordsResult.status === 'fulfilled' && !recordsResult.value.cancelled) {
      acquiredAllRecords.value = recordsResult.value.records
      acquiredRecordsTruncated.value = recordsResult.value.truncated
    } else if (recordsResult.status === 'rejected') {
      acquiredRecordsError.value = humanErr(recordsResult.reason, '流水明细加载失败')
    }
    if (agentHistoryResult.status === 'fulfilled' && !agentHistoryResult.value.cancelled) {
      acquiredAgentHistoryRecords.value = agentHistoryResult.value.records
      acquiredAgentHistoryTruncated.value = agentHistoryResult.value.truncated
    } else if (agentHistoryResult.status === 'rejected') {
      acquiredAgentHistoryError.value = humanErr(agentHistoryResult.reason, '密探历史流水加载失败')
    }
    applyAcquiredEntityType()
    appliedAcquiredKey.value = queryKey
    if (itemTotalsResult.status === 'rejected' && agentTotalsResult.status === 'rejected' && recordsResult.status === 'rejected') {
      acquiredError.value = '本期总账和奖励流水均加载失败，请稍后重试'
    }
  } finally {
    if (seq === acquiredSeq) acquiredLoading.value = false
  }
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

function goLogin() { location.href = '/login' }

// ---- 导入记录（游标分页） ----
async function loadRecords(reset) {
  if (!accountId.value) {
    recordsList.value = []
    recordsError.value = '请先创建并选择一个子账号'
    recordsLoading.value = false
    return
  }
  recordsLoading.value = true
  if (reset) recordsError.value = ''
  try {
    const cursor = reset ? null : recordsNextCursor.value
    const page = await listRecords({
      accountId: accountId.value,
      entityType: entityType.value,
      cursor: cursor,
      limit: 50
    })
    const items = (page && Array.isArray(page.items)) ? page.items : []
    recordsList.value = reset ? items : recordsList.value.concat(items)
    recordsNextCursor.value = (page && page.next_cursor) ? page.next_cursor : null
  } catch (err) {
    recordsError.value = humanErr(err, '加载记录失败')
  } finally {
    recordsLoading.value = false
  }
}

async function onDeleteRecord(rec) {
  const rid = rec && rec.record_id
  if (!rid) return
  if (!confirm('删除记录「' + rid + '」？删除后将重放剩余记录重建库存，此操作不可恢复。')) return
  try {
    await deleteRecord(rid, accountId.value)
    await loadRecords(true)
    await reloadCurrent()
    resetAcquiredData()
  } catch (err) {
    alert(humanErr(err, '删除失败'))
  }
}

function stockEffectLabel(eff) {
  if (eff === 'applied') return '已生效'
  if (eff === 'history_only') return '仅历史'
  if (eff === 'superseded') return '已归档'
  return eff || '未知'
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function entrySummary(entries, recordType) {
  const list = entries || []
  const sign = recordType === 'reward_delta' ? '+' : '='
  return list.map(function (e) { return (e.name || e.id) + sign + e.count }).join('、')
}

// ---- 导入档案 ----
async function doImport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  importError.value = ''
  if (!importText.value.trim()) { importError.value = '请粘贴交换协议 JSON 或选择文件'; return }
  let doc = null
  try {
    doc = JSON.parse(importText.value)
    validateInventoryExchangeDocument(doc)
  } catch (err) {
    importError.value = err instanceof SyntaxError ? 'JSON 解析失败，请检查格式' : humanErr(err, '导入档案校验失败')
    return
  }
  importing.value = true
  importResult.value = null
  try {
    const res = await importInventory(doc)
    importResult.value = res || {}
  } catch (err) {
    importError.value = humanErr(err, '导入失败')
  } finally {
    importing.value = false
  }
}

function onFilePick(ev) {
  const file = ev && ev.target && ev.target.files && ev.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = function () {
    importText.value = String(reader.result || '')
    importError.value = ''
  }
  reader.readAsText(file, 'utf-8')
}

async function fillExample() {
  if (loadingExample.value) return
  loadingExample.value = true
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'inventory-import-example.json')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const text = await res.text()
    // 示例文档里的 account_id 为占位符 acc_demo_main：若已选择子账号，则替换为当前账号，
    // 使示例可以直接导入（后端要求 records 引用的 account_id 必须归属当前用户）。
    if (accountId.value) {
      try {
        const doc = JSON.parse(text)
        if (doc && doc.accounts && Array.isArray(doc.accounts)) {
          doc.accounts = doc.accounts.map(function (a) { return Object.assign({}, a, { id: accountId.value }) })
        }
        if (doc && Array.isArray(doc.records)) {
          doc.records = doc.records.map(function (r) { return Object.assign({}, r, { account_id: accountId.value }) })
        }
        importText.value = JSON.stringify(doc, null, 2)
        importError.value = ''
      } catch (_e) {
        importText.value = text
        importError.value = ''
      }
    } else {
      importText.value = text
      importError.value = ''
    }
  } catch (err) {
    alert(humanErr(err, '加载示例失败'))
  } finally {
    loadingExample.value = false
  }
}

function afterImport() {
  importResult.value = null
  importText.value = ''
  importError.value = ''
  showImport.value = false
  reloadCurrent()
  resetAcquiredData()
  if (activeTab.value === 'acquired') loadAcquired()
}

// ---- 导出档案 ----
async function doExport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!accountId.value) { alert('请先创建并选择一个子账号'); return }
  try {
    const opts = {
      include: 'current,rewards',
      from: dayStartIso(rangeFrom.value),
      to: nextDayStartIso(rangeTo.value)
    }
    if (exportAll.value && accounts.value.length > 1) {
      opts.scope = 'all'
    } else {
      opts.accountId = accountId.value
    }
    const data = await exportInventory(opts)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'inventory-export.json'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (err) {
    alert(humanErr(err, '导出失败'))
  }
}

onMounted(async function () {
  try {
    const data = await getCatalog()
    if (data && data.entities) catalog.value = { entities: data.entities }
  } catch (_e) {
    catalog.value = { entities: [] }
  }
  await loadAccounts()
  reloadCurrent()
})
</script>

<style scoped>
/* ---- 库存子账号 ---- */
.account-bar { display: flex; align-items: center; gap: 16px; margin-top: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px; flex-wrap: wrap }
.account-bar .sp { flex: 1 }
.ac-sel { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.ac-label { font-size: 13px; font-weight: 800; color: var(--ink); font-family: var(--font-b) }
.ac-sel select { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; min-width: 160px; cursor: pointer; transition: border-color .3s }
.ac-sel select:focus { border-color: var(--accent) }
.ac-warn { font-size: 12px; color: var(--rouge); font-weight: 700 }
.account-mgr { margin-top: 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 16px 18px }
.ac-new { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.ac-new input { flex: 1; min-width: 200px; border: 1.5px solid var(--line); border-radius: 10px; padding: 9px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s }
.ac-new input:focus { border-color: var(--accent) }
.ac-list { list-style: none; margin-top: 14px; display: flex; flex-direction: column; gap: 8px }
.ac-item { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; background: var(--paper) }
.ac-item .ac-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--yellow-deep); flex: none }
.ac-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px }
.ac-name { font-size: 13.5px; font-weight: 800; color: var(--ink) }
.ac-id { font-family: var(--font-d); font-size: 11px; color: var(--ink-35); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ac-btn { flex: none; border: 1.5px solid var(--line); background: transparent; color: var(--ink-60); border-radius: 9px; padding: 6px 14px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: color .25s, background-color .25s, border-color .25s }
.ac-btn:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.ac-btn.danger { border-color: rgba(166, 81, 74, .35); color: var(--rouge) }
.ac-btn.danger:hover:not(:disabled) { background: rgba(166, 81, 74, .1) }
.ac-btn:disabled { opacity: .45; cursor: not-allowed }
.ac-empty { margin-top: 12px; font-size: 12.5px; color: var(--ink-35); font-weight: 600 }
.export-all { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--ink-60); cursor: pointer; white-space: nowrap }
.export-all input { accent-color: var(--accent); cursor: pointer }
.load-more { display: block; margin: 16px auto 0; border: 1.5px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 10px 26px; font-size: 13px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease) }
.load-more:hover:not(:disabled) { border-color: var(--ink); background: var(--cream) }
.load-more:disabled { opacity: .45; cursor: not-allowed }

/* —— 复用全局 CSS 变量（不新增色值），对齐广陵账房（cart.vue）版式 —— */
.page-inventory .hero::after { content: '库存' }

.inventory-tabs { display: flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 14px; padding: 4px; margin-top: 40px }
.inventory-tabs button {
  border: none; background: transparent; font-family: var(--font-b); font-weight: 700;
  font-size: 14px; padding: 10px 26px; border-radius: 10px; cursor: pointer; color: var(--ink-60);
  transition: color .3s var(--ease), background-color .3s var(--ease);
}
.inventory-tabs button.on { background: var(--tea); color: var(--cream) }
.inventory-tabs button:hover:not(.on) { color: var(--ink) }
.inventory-tabs .sp { flex: 1 }
.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); transition: color .3s var(--ease), background-color .3s var(--ease), border-color .3s var(--ease); white-space: nowrap }
.act-btn.ghost:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.act-btn:disabled { opacity: .45; cursor: not-allowed }

.import-box { margin-top: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 20px }
.import-box .tip { font-size: 12.5px; color: var(--ink-60); line-height: 1.8; margin-bottom: 12px }
.import-box textarea { width: 100%; min-height: 140px; border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; font-family: var(--font-b); font-size: 12.5px; color: var(--ink); background: var(--paper); outline: none; resize: vertical; transition: border-color .3s }
.import-box textarea:focus { border-color: var(--accent) }
.import-box textarea[aria-invalid="true"] { border-color: var(--rouge) }
.import-error { min-height: 20px; margin-top: 7px; color: var(--rouge); font-size: 12.5px; font-weight: 700; line-height: 1.6 }
.import-actions { display: flex; gap: 10px; align-items: center; margin-top: 12px }
.file-label { cursor: pointer }
.file-label input { display: none }
.import-result { margin-top: 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: 12.5px; color: var(--ink); display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.import-result .ok { margin-left: auto; border: none; background: var(--tea); color: var(--cream); border-radius: 999px; padding: 6px 16px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b) }

.panel { margin-top: 20px }

.type-switch { display: inline-flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 12px; padding: 4px; align-items: center }
.type-switch button {
  border: none; background: transparent; font-family: var(--font-b); font-weight: 700;
  font-size: 13px; padding: 8px 18px; border-radius: 9px; cursor: pointer; color: var(--ink-60);
  transition: color .3s var(--ease), background-color .3s var(--ease);
}
.type-switch button.on { background: var(--yellow); color: var(--ink) }
.type-switch button:hover:not(.on) { color: var(--ink) }
.type-switch button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }
.type-switch button:disabled { opacity: .45; cursor: not-allowed }
.type-switch .sp { flex: 1 }
.type-switch .hint { font-size: 12px; color: var(--ink-35); font-weight: 600; margin-right: 6px }
.stock-save-notice { color: var(--accent-strong); font-size: 12px; font-weight: 800 }

/* ---- 追踪目录工具条 ---- */
.manifest-intro { display: flex; align-items: center; gap: 14px }
.manifest-intro .type-switch { flex: none }
.manifest-scope { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 4px 0 4px 14px; border-left: 1px dashed var(--line); color: var(--ink-60) }
.manifest-scope > svg { flex: none; color: var(--accent-strong) }
.manifest-scope p { flex: 0 1 auto; margin: 0; font-size: 12px; font-weight: 600; line-height: 1.65 }
.manifest-scope p b { color: var(--accent-strong); font-family: var(--font-d); font-weight: 900 }
.scope-guidance svg { display: inline; margin-inline: 2px; color: var(--accent-strong); vertical-align: -2px }
.manifest-scope button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: none; min-height: 36px; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent; color: var(--accent-strong); font-family: var(--font-b); font-size: 12px; font-weight: 800; cursor: pointer }
.manifest-scope button:hover:not(:disabled) { background: var(--yellow); color: var(--ink) }
.manifest-scope button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
.manifest-scope button:disabled { opacity: .45; cursor: not-allowed }
.manifest-scope .manifest-edit-actions { display: flex; align-items: center; gap: 6px; flex: none }
.manifest-scope .manifest-edit-actions .primary { background: var(--tea); color: var(--cream); padding-inline: 12px }
.manifest-scope .manifest-edit-actions .primary:hover:not(:disabled) { background: var(--ink); color: var(--cream) }
.manifest-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px }
.mf-stats { display: flex; gap: 24px; align-items: baseline }
.mf-stat { display: flex; align-items: baseline; gap: 6px }
.mf-num { font-family: var(--font-d); font-weight: 900; font-size: 20px; color: var(--accent-strong); letter-spacing: -.01em }
.mf-k { font-size: 12px; color: var(--ink-60); font-weight: 700 }
.mf-progress { flex: none; width: 120px; height: 8px; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); overflow: hidden }
.mf-progress i { display: block; width: 100%; height: 100%; border-radius: 999px; background: var(--accent); transform: scaleX(var(--progress, 0)); transform-origin: left; transition: transform .45s var(--ease) }
.manifest-bar .sp { flex: 1 }
.mf-search { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; width: 180px; transition: border-color .3s }
.mf-search:focus { border-color: var(--accent) }
.mf-filter { display: inline-flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 10px; padding: 4px }
.mf-filter button { border: none; background: transparent; font-family: var(--font-b); font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 7px; cursor: pointer; color: var(--ink-60); transition: color .3s var(--ease), background-color .3s var(--ease), box-shadow .3s var(--ease) }
.mf-filter button.on { background: var(--surface); color: var(--accent-strong); box-shadow: 0 1px 4px rgba(73, 59, 44, .16) }
.mf-filter button:hover:not(.on) { color: var(--ink) }
.mf-sync-error { flex-basis: 100%; color: var(--rouge); font-size: 12px; font-weight: 700; line-height: 1.6 }
.agent-controls { position: sticky; top: 16px; z-index: 24; display: flex; align-items: flex-end; gap: 8px; margin-top: 10px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 12px 28px -22px rgba(73, 59, 44, .4); flex-wrap: wrap }
.agent-controls-toggle { display: none; position: relative; width: 58px; min-height: 44px; align-items: center; justify-content: center; gap: 3px; flex: none; padding: 0 6px; border: 1px solid var(--tea); border-radius: 6px; background: var(--tea); color: var(--cream); font-family: var(--font-b); font-size: 10.5px; font-weight: 900; cursor: pointer; box-shadow: 0 3px 8px -6px var(--tea) }
.agent-controls-toggle:hover { border-color: var(--ink); background: var(--ink); color: var(--cream) }
.agent-controls-toggle:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.agent-sort-row { display: contents }
.agent-menu-control { position: relative; min-width: 112px; align-self: flex-end }
.agent-menu-control summary { display: flex; min-height: 44px; align-items: center; gap: 8px; padding: 8px 10px; border: 1.5px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font-family: var(--font-b); font-size: 12px; font-weight: 800; cursor: pointer; list-style: none; transition: border-color .18s var(--ease), background-color .18s var(--ease), box-shadow .18s var(--ease) }
.agent-menu-control summary::-webkit-details-marker { display: none }
.agent-menu-control summary > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.agent-menu-control summary > svg:last-child { margin-left: auto; flex: none; color: var(--ink-60); transition: transform .18s var(--ease) }
.agent-menu-control summary:hover { border-color: var(--accent); background: var(--paper) }
.agent-menu-control[open] { z-index: 40 }
.agent-menu-control[open] summary { border-color: var(--accent); background: var(--paper); box-shadow: 0 4px 12px -10px var(--tea) }
.agent-menu-control[open] summary > svg:last-child { transform: rotate(180deg) }
.agent-menu-control summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.agent-menu-options { position: absolute; top: calc(100% + 7px); left: 0; z-index: 50; width: max-content; min-width: 100%; max-width: min(220px, calc(100vw - 32px)); padding: 5px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 18px 34px -20px var(--tea) }
.agent-group-control .agent-menu-options { right: 0; left: auto }
.agent-menu-options button { display: flex; width: 100%; min-height: 36px; align-items: center; justify-content: space-between; gap: 18px; padding: 7px 9px; border: 0; border-radius: 5px; background: transparent; color: var(--ink-60); font-family: var(--font-b); font-size: 12px; font-weight: 700; text-align: left; cursor: pointer; transition: background-color .16s var(--ease), color .16s var(--ease) }
.agent-menu-options button:hover { background: var(--paper); color: var(--ink) }
.agent-menu-options button.selected { background: var(--yellow); color: var(--ink); font-weight: 900 }
.agent-menu-options button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: -2px }
.agent-menu-options button svg { flex: none; color: var(--accent-strong) }
.agent-controls > label { display: flex; min-width: 112px; flex-direction: column; gap: 4px }
.agent-controls > label > span:not(.sr-only) { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.agent-controls select, .agent-control-search input { min-height: 44px; border: 1.5px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font-family: var(--font-b); font-size: 12px; outline: none }
.agent-select-control { position: relative }
.agent-select-control > svg { position: absolute; bottom: 15px; left: 10px; z-index: 1; color: var(--ink-60); pointer-events: none }
.agent-select-control select { width: 100%; min-width: 112px; padding: 8px 28px 8px 32px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); cursor: pointer }
.agent-select-control:hover select { border-color: var(--accent); background: var(--paper) }
.agent-control-search input { width: 210px; padding: 8px 10px 8px 33px }
.agent-controls select:focus, .agent-control-search input:focus { border-color: var(--accent) }
.agent-select-control select:focus { border-color: var(--accent); background: var(--paper) }
.agent-control-search { position: relative; min-width: 210px }
.agent-control-search > svg { position: absolute; bottom: 14px; left: 10px; z-index: 1; color: var(--ink-35); pointer-events: none }
.agent-favorite-mode { display: inline-grid; grid-template-columns: repeat(3, auto); align-self: flex-end; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper) }
.agent-favorite-mode button { min-height: 36px; padding: 6px 11px; border: 0; border-radius: 5px; background: transparent; color: var(--ink-60); font-family: var(--font-b); font-size: 11.5px; font-weight: 800; cursor: pointer }
.agent-favorite-mode button.on { background: var(--yellow); color: var(--ink); box-shadow: 0 1px 3px rgba(73, 59, 44, .14) }
.agent-favorite-mode button:hover:not(:disabled):not(.on) { color: var(--ink) }
.agent-favorite-mode button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.agent-favorite-mode button:disabled { cursor: not-allowed; opacity: .42 }
.agent-filter-panel { position: relative; align-self: flex-end }
.agent-filter-panel summary { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 6px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink-60); font-size: 12px; font-weight: 800; cursor: pointer; list-style: none }
.agent-filter-panel summary::-webkit-details-marker { display: none }
.agent-filter-panel summary span { display: inline-grid; min-width: 20px; height: 20px; place-items: center; padding-inline: 5px; border-radius: 4px; background: var(--paper); color: var(--tea); font-family: var(--font-d); font-size: 10px }
.agent-filter-panel[open] { z-index: 30 }
.agent-filter-panel[open] summary { border-color: var(--accent); background: var(--paper); color: var(--ink) }
.agent-filter-panel summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.agent-filter-menu { position: absolute; top: calc(100% + 7px); left: 0; z-index: 30; width: min(380px, calc(100vw - 32px)); max-height: min(560px, calc(100vh - 140px)); overflow-y: auto; overscroll-behavior: contain; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: 0 18px 38px -22px var(--tea) }
.agent-filter-menu-head { display: flex; min-height: 28px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 2px 9px; border-bottom: 1px solid var(--line) }
.agent-filter-menu-head strong { color: var(--ink); font-size: 12px; font-weight: 900 }
.agent-filter-menu-head button { min-height: 28px; padding: 3px 6px; border: 0; border-radius: 4px; background: transparent; color: var(--accent-strong); font-size: 11px; font-weight: 800; cursor: pointer }
.agent-filter-menu-head button:hover { background: var(--paper); color: var(--ink) }
.agent-filter-menu fieldset { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: 2px 6px; min-width: 0; margin: 0; padding: 10px 0; border: 0; border-bottom: 1px dashed var(--line) }
.agent-filter-menu fieldset:first-of-type { padding-top: 9px }
.agent-filter-menu legend { grid-column: 1 / -1; width: 100%; margin-bottom: 3px; color: var(--ink-60); font-family: var(--font-s); font-size: 11.5px; font-weight: 900; letter-spacing: 0 }
.agent-filter-menu label { display: inline-flex; min-height: 36px; align-items: center; gap: 8px; padding: 5px 8px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink-60); font-size: 11.5px; font-weight: 700; cursor: pointer; transition: color .18s var(--ease), background-color .18s var(--ease), border-color .18s var(--ease) }
.agent-filter-menu label:hover { background: var(--paper); color: var(--ink) }
.agent-filter-menu label.selected { border-color: var(--accent); background: var(--yellow); color: var(--ink) }
.agent-filter-menu label:focus-within { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.agent-filter-menu input { width: 15px; height: 15px; margin: 0; accent-color: var(--tea) }
.agent-sort-direction, .agent-reset { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 5px; padding: 7px 12px; border: 1.5px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink-60); font-family: var(--font-b); font-size: 12px; font-weight: 800; cursor: pointer }
.agent-sort-direction { position: relative; width: 44px; padding: 0; background: var(--paper) }
.agent-sort-direction svg { transition: transform .18s var(--ease) }
.agent-sort-direction.asc svg { transform: rotate(180deg) }
.agent-sort-direction:hover, .agent-reset:hover { border-color: var(--ink); color: var(--ink) }
.agent-sort-direction:focus-visible, .agent-reset:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.agent-reset { background: transparent }
.agent-sort-direction::after,
.manifest-agents .agent-favorite-btn::after,
.agent-controls-toggle::after,
.agent-select-control::after {
  position: absolute; z-index: 80; width: max-content; max-width: 180px; padding: 5px 8px; border-radius: 5px;
  background: var(--tea); color: var(--cream); content: attr(data-tooltip); font-family: var(--font-b); font-size: 10.5px; font-weight: 700;
  line-height: 1.35; opacity: 0; pointer-events: none; white-space: nowrap; transition: opacity .16s var(--ease), transform .16s var(--ease)
}
.agent-sort-direction::after { top: calc(100% + 7px); left: 50%; transform: translate(-50%, -3px) }
.manifest-agents .agent-favorite-btn::after { top: calc(100% + 3px); right: 0; transform: translateY(-3px) }
.agent-controls-toggle::after, .agent-select-control::after { top: calc(100% + 7px); left: 0; transform: translateY(-3px) }
.agent-sort-direction:hover::after, .agent-sort-direction:focus-visible::after,
.manifest-agents .agent-favorite-btn:hover::after, .manifest-agents .agent-favorite-btn:focus-visible::after,
.agent-controls-toggle:hover::after, .agent-controls-toggle:focus-visible::after,
.agent-select-control:hover::after, .agent-select-control:focus-within::after { opacity: 1; transform: translate(0, 0) }
.agent-sort-direction:hover::after, .agent-sort-direction:focus-visible::after { transform: translate(-50%, 0) }
.agent-result, .agent-sync-state { align-self: center; color: var(--ink-60); font-family: var(--font-d); font-size: 11px; font-weight: 800 }
.agent-result { margin-left: auto }
.agent-sync-state.is-error { flex-basis: 100%; color: var(--rouge); font-family: var(--font-b) }
.state.slim { padding: 26px 20px; margin-top: 14px; border-radius: 14px }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0 }
.acquired-query { padding: 18px 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface) }
.acquired-query-head { display: flex; align-items: center; justify-content: space-between; gap: 20px }
.query-eyebrow, .ledger-head > div > span { display: block; color: var(--accent-strong); font-family: var(--font-d); font-size: 11px; font-weight: 900; letter-spacing: 0 }
.acquired-query h2 { margin-top: 3px; color: var(--ink); font-family: var(--font-s); font-size: 20px; font-weight: 900; letter-spacing: 0 }
.quick-range { display: flex; gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px dashed var(--line); flex-wrap: wrap }
.quick-range button { min-height: 38px; padding: 6px 15px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink-60); font-family: var(--font-b); font-size: 12px; font-weight: 800; cursor: pointer; transition: background-color .2s var(--ease), border-color .2s var(--ease), color .2s var(--ease) }
.quick-range button.on { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.quick-range button:hover:not(:disabled):not(.on) { border-color: var(--ink); color: var(--ink) }
.quick-range button:disabled { opacity: .45; cursor: not-allowed }
.acquired-bar { display: flex; align-items: center; justify-content: space-between; gap: 14px 20px; margin-top: 14px; flex-wrap: wrap }
.range { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap }
.range label { display: flex; flex-direction: column; align-items: flex-start; gap: 5px }
.range .lb { font-size: 11px; font-weight: 800; color: var(--ink-60) }
.range-dash { align-self: center; margin-top: 17px; color: var(--ink-35); font-size: 12px; font-weight: 700 }
.range input {
  min-height: 44px; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: 13px;
  font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; transition: border-color .3s;
}
.range input:focus { border-color: var(--accent) }
.acquired-submit { min-height: 44px; flex: none }
.range-caption { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; color: var(--ink-60); font-size: 11.5px; font-weight: 700; line-height: 1.6 }
.range-caption svg { flex: none; color: var(--accent-strong) }
.range-caption-lines { display: grid; gap: 1px }
.range-caption-lines > span:last-child { color: var(--accent-strong); font-family: var(--font-d); font-weight: 900 }
.query-dirty { padding: 2px 7px; border: 1px solid var(--accent); border-radius: 999px; color: var(--accent-strong); white-space: nowrap }
.spin { animation: acquired-spin .8s linear infinite }
@keyframes acquired-spin { to { transform: rotate(360deg) } }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: color .35s var(--ease), background-color .35s var(--ease), border-color .35s var(--ease), transform .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }

.state { background: var(--surface); border: 1.5px dashed var(--line); border-radius: 20px; padding: 56px 40px; text-align: center; color: var(--ink-35); font-weight: 700; margin-top: 16px }
.state.err { color: var(--ink-60) }
.state .link { margin-left: 12px; background: none; border: none; color: var(--accent); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.acquired-loading { display: flex; min-height: 190px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--ink-60) }
.acquired-loading small { color: var(--ink-35); font-family: var(--font-d); font-size: 11px }
.loading-seal { display: grid; width: 42px; height: 42px; place-items: center; border: 1.5px solid var(--brand-blue); border-radius: 8px; color: var(--brand-blue); font-family: var(--font-s); font-size: 18px; font-weight: 900 }
.acquired-empty { display: flex; min-height: 190px; flex-direction: column; align-items: center; justify-content: center; gap: 8px }
.acquired-empty strong { color: var(--ink); font-family: var(--font-s); font-size: 17px }
.acquired-empty span { max-width: 560px; color: var(--ink-60); font-size: 12px; font-weight: 600; line-height: 1.8 }

.acquired-notices { margin-top: 10px; padding: 10px 14px; border: 1px dashed var(--accent); border-radius: 10px; background: var(--cream); color: var(--ink-60); font-size: 11.5px; font-weight: 700; line-height: 1.7 }
.acquired-notices p + p { margin-top: 3px }
.acquired-type-switch { margin-top: 16px }

.acquired-tools { display: flex; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap }
.acquired-views { display: inline-flex; gap: 3px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface) }
.acquired-views button { min-height: 40px; padding: 7px 15px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-60); font-family: var(--font-b); font-size: 12px; font-weight: 800; cursor: pointer; transition: background-color .2s var(--ease), color .2s var(--ease) }
.acquired-views button.on { background: var(--tea); color: var(--cream) }
.acquired-views button:hover:not(.on) { background: var(--paper); color: var(--ink) }
.acquired-filters { display: flex; min-width: 0; align-items: flex-end; gap: 8px; margin-left: auto; flex-wrap: wrap }
.acquired-filters > label { display: flex; flex-direction: column; gap: 4px }
.acquired-filters > label > span:not(.sr-only) { color: var(--ink-60); font-size: 10px; font-weight: 800 }
.acquired-filters select, .acquired-filters input { min-height: 40px; border: 1.5px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--ink); font-family: var(--font-b); font-size: 12px; outline: none }
.acquired-filters select { padding: 7px 30px 7px 10px; cursor: pointer }
.acquired-filters input { width: 172px; padding: 7px 10px 7px 34px }
.acquired-filters select:focus, .acquired-filters input:focus { border-color: var(--accent) }
.acquired-search { position: relative; align-self: flex-end }
.acquired-search > svg { position: absolute; left: 10px; bottom: 12px; z-index: 1; color: var(--ink-35); pointer-events: none }

.acquired-overview { margin-top: 12px }
.acquired-slot-grid .slot-action { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; font-family: inherit; text-align: inherit; cursor: pointer }
.acquired-slot-grid .slot-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 5px; border-radius: 8px }
.slot-meta { display: block; margin-top: 2px; color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px; font-weight: 700; text-align: center }

.acquired-ledger { margin-top: 12px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface) }
.ledger-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding-bottom: 14px; border-bottom: 1px dashed var(--line) }
.ledger-head h3 { margin-top: 2px; color: var(--ink); font-family: var(--font-s); font-size: 19px; font-weight: 900; letter-spacing: 0 }
.ledger-head > small { max-width: 440px; color: var(--ink-60); font-size: 11px; font-weight: 600; line-height: 1.7; text-align: right }
.source-list, .timeline-list, .detail-list { list-style: none }
.source-list li + li, .timeline-list li + li, .detail-list li + li { border-top: 1px solid var(--line) }
.source-list button { display: grid; width: 100%; min-height: 72px; grid-template-columns: 34px minmax(150px, 1fr) 90px 90px minmax(170px, 1.2fr) 24px; align-items: center; gap: 12px; padding: 10px 4px; border: 0; background: transparent; color: var(--ink); font-family: var(--font-b); text-align: left; cursor: pointer }
.source-list button:hover { background: var(--cream) }
.source-rank { color: var(--ink-35); font-family: var(--font-d); font-size: 12px; font-weight: 900 }
.source-main { min-width: 0 }
.source-main strong { display: block; overflow: hidden; font-size: 14px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap }
.source-main i { display: block; width: 100%; height: 5px; margin-top: 8px; overflow: hidden; border-radius: 999px; background: var(--paper) }
.source-main i::after { display: block; width: 100%; height: 100%; border-radius: inherit; background: var(--accent); content: ''; transform: scaleX(var(--source-scale, 0)); transform-origin: left }
.source-stat { color: var(--ink-60); font-size: 11px; font-weight: 700; white-space: nowrap }
.source-stat b { color: var(--ink); font-family: var(--font-d); font-size: 15px; font-weight: 900 }
.source-top { overflow: hidden; color: var(--ink-60); font-size: 11px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap }
.source-list svg { color: var(--accent-strong) }

.timeline-list { padding: 4px 0 }
.timeline-list button { display: grid; width: 100%; min-height: 72px; grid-template-columns: 120px minmax(0, 1fr) 22px; align-items: center; gap: 14px; padding: 12px 4px; border: 0; background: transparent; color: var(--ink); font-family: var(--font-b); text-align: left; cursor: pointer }
.timeline-list button:hover { background: var(--cream) }
.timeline-list button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px }
.timeline-list time { display: flex; min-width: 0; flex-direction: column; gap: 3px }
.timeline-list time b { color: var(--ink); font-family: var(--font-d); font-size: 13px; font-weight: 900 }
.timeline-list time span { color: var(--ink-35); font-size: 10px; font-weight: 700 }
.daily-rewards { display: flex; min-width: 0; gap: 6px; flex-wrap: wrap }
.daily-rewards > span { display: inline-flex; min-height: 30px; max-width: 100%; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper); font-size: 11px }
.daily-rewards b { overflow-wrap: anywhere; font-weight: 800 }
.daily-rewards em { color: var(--accent-strong); font-family: var(--font-d); font-style: normal; font-weight: 900; white-space: nowrap }
.timeline-list svg { color: var(--accent-strong) }

.details-head .act-btn { display: inline-flex; min-height: 40px; align-items: center; gap: 5px }
.details-caption { margin: 12px 0 2px; color: var(--ink-60); font-size: 11.5px; font-weight: 700 }
.detail-list li { display: grid; grid-template-columns: 116px 110px minmax(0, 1fr); align-items: start; gap: 12px; padding: 13px 4px }
.detail-list time { display: flex; flex-direction: column; gap: 2px }
.detail-list time b { color: var(--ink); font-size: 11.5px; font-weight: 800 }
.detail-list time span { color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px; font-weight: 700 }
.detail-meta { display: flex; min-width: 0; align-items: flex-start; gap: 6px; flex-direction: column }
.detail-source { width: fit-content; max-width: 100%; overflow: hidden; padding: 3px 9px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink-60); font-size: 10.5px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap }
.detail-stamina { color: var(--ink-60); font-size: 10.5px; font-weight: 700 }
.detail-stamina b { color: var(--accent-strong); font-family: var(--font-d); font-size: 12px; font-weight: 900 }
.detail-entries { display: flex; gap: 6px; flex-wrap: wrap }
.detail-entries span { display: inline-flex; min-height: 28px; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 7px; background: var(--paper); color: var(--ink); font-size: 11px }
.detail-entries b { font-weight: 800 }
.detail-entries em { color: var(--accent-strong); font-family: var(--font-d); font-style: normal; font-weight: 900 }

/* ---- 背包格（游戏背包样式）---- */
.backpack { margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 18px 18px 20px }
.bp-head { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1.5px dashed var(--line); flex-wrap: wrap }
.bp-head .sp { flex: 1 }
.bp-tip { font-size: 12px; color: var(--ink-60); font-weight: 600; line-height: 1.8 }
.bp-tip code { font-family: var(--font-d); font-size: 11px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 2px 7px; color: var(--ink-60); margin: 0 2px; word-break: break-all }
.bp-num { font-family: var(--font-d); font-weight: 900; color: var(--accent-strong); font-size: 13px }

.slot-grid { list-style: none; margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fill, 104px); justify-content: start; gap: 18px 16px }
.item-sections { display: flex; flex-direction: column }
.item-section { padding: 22px 0 0px }
.item-section + .item-section { border-top: 1.5px dashed var(--line) }
.section-head { display: flex; align-items: baseline; gap: 10px }
.section-head h2 { margin: 0; color: var(--ink); font-family: var(--font-s); font-size: 18px; font-weight: 900; letter-spacing: 0 }
.section-head span { color: var(--ink-35); font-family: var(--font-d); font-size: 11px; font-weight: 800 }
.item-section .slot-grid { margin-top: 20px }
.subsection-columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; margin-top: 16px }
.subsection-columns.subsection-rows { grid-template-columns: minmax(0, 1fr) }
.subsection-columns.subsection-shelves { grid-template-columns: minmax(0, 1fr) }
.item-subsection { min-width: 0; padding: 18px 0; display: flex; flex-direction: column }
.item-subsection + .item-subsection { border-top: 1.5px dashed var(--line) }
.subsection-head { position: relative; display: flex; align-items: center; gap: 8px; min-height: 30px; padding-left: 10px }
.subsection-head::before { content: ''; position: absolute; left: 0; top: 50%; width: 3px; height: 20px; border-radius: 2px; background: var(--accent); transform: translateY(-50%) }
.subsection-head h3 { margin: 0; color: var(--ink); font-family: var(--font-b); font-size: 13px; font-weight: 900; letter-spacing: 0 }
.subsection-head span { color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px; font-weight: 800 }
.subsection-edit { position: relative; flex: none; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--accent-strong); cursor: pointer; transition: color .18s var(--ease) }
.subsection-edit svg { transition: transform .18s var(--ease) }
.subsection-edit:hover:not(:disabled) { color: var(--tea) }
.subsection-edit:hover:not(:disabled) svg { transform: translateY(-1px) rotate(-10deg) }
.subsection-edit:disabled { opacity: .4; cursor: not-allowed }
.subsection-edit::after { content: attr(data-tooltip); position: absolute; left: calc(100% + 8px); top: 50%; z-index: 20; width: max-content; max-width: 220px; padding: 6px 9px; border-radius: 6px; background: var(--tea); color: var(--cream); font-family: var(--font-b); font-size: 11px; font-weight: 700; line-height: 1.4; white-space: nowrap; opacity: 0; pointer-events: none; transform: translate(-3px, -50%); transition: opacity .16s var(--ease), transform .16s var(--ease) }
.subsection-edit:hover::after, .subsection-edit:focus-visible::after { opacity: 1; transform: translate(0, -50%) }
.item-subsection > .slot-grid { flex: 1; grid-template-columns: repeat(3, minmax(0, 104px)); align-content: center; justify-content: center; gap: 18px 16px; margin-top: 20px }
.subsection-rows .item-subsection > .slot-grid { grid-template-columns: repeat(auto-fill, 104px); align-content: start; justify-content: start }
.subsection-shelves .item-subsection { display: grid; grid-template-columns: 112px minmax(0, 1fr); column-gap: 20px }
.subsection-shelves .subsection-head { align-self: start }
.subsection-shelves .item-subsection > .slot-grid { grid-template-columns: repeat(auto-fill, 104px); align-content: start; justify-content: start; margin-top: 8px }
.item-subsection > .slot-grid .slot-name { height: auto; min-height: 1.45em }
.cultivation-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; margin-top: 20px }
.cultivation-group { min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream) }
.cultivation-group-head { display: flex; align-items: baseline; gap: 8px }
.cultivation-group-head h4 { margin: 0; color: var(--ink); font-family: var(--font-b); font-size: 12.5px; font-weight: 900; letter-spacing: 0 }
.cultivation-group-head span { color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px; font-weight: 800 }
.cultivation-group > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); align-content: start; justify-content: center; gap: 12px 9px; margin-top: 16px }
.cultivation-group .slot-name { height: auto; min-height: 1.45em }
.stock-edit-error { margin-top: 14px; border: 1px solid rgba(166, 81, 74, .35); border-radius: 8px; background: rgba(166, 81, 74, .06); color: var(--rouge); padding: 9px 12px; font-size: 12px; font-weight: 700 }
.stock-edit-grid { grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 22px 16px }
.stock-edit-slot { align-items: center }
.stock-edit-slot:hover { transform: none }
.stock-edit-slot .slot-name { height: auto; min-height: calc(2 * 1.45em) }
.stock-editor.is-agent-editor { padding: 14px }
.is-agent-editor .stock-edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; margin-top: 12px }
.is-agent-editor .stock-edit-slot { display: grid; min-height: 82px; grid-template-columns: 64px minmax(80px, 1fr) 132px; grid-template-rows: repeat(2, minmax(0, auto)); align-items: center; gap: 2px 10px; padding: 8px 10px; border-bottom: 1px solid var(--line) }
.is-agent-editor .stock-edit-slot .slot-ic { width: 58px; grid-row: 1 / -1; margin: 0; border-radius: 10px }
.is-agent-editor .stock-edit-slot .slot-name { height: auto; min-height: 0; justify-content: flex-start; margin: 0; text-align: left }
.is-agent-editor .stock-edit-slot .slot-tag { align-self: start; justify-self: start; margin: 0; padding-inline: 6px }
.is-agent-editor .stock-edit-slot .stock-stepper { width: 132px; grid-column: 3; grid-row: 1 / -1; margin: 0 }
.stock-stepper { width: min(100%, 132px); height: 40px; margin-top: 6px; display: grid; grid-template-columns: 40px minmax(0, 1fr) 40px; align-items: stretch; border: 1.5px solid var(--accent); border-radius: 8px; overflow: hidden; background: var(--surface); box-shadow: 0 3px 8px rgba(73, 59, 44, .14) }
.stock-stepper:focus-within { border-color: var(--tea); box-shadow: 0 0 0 2px var(--yellow) }
.stock-stepper.invalid { border-color: var(--rouge) }
.stock-stepper button { display: grid; place-items: center; min-width: 0; padding: 0; border: 0; border-radius: 0; background: var(--paper); color: var(--ink); cursor: pointer }
.stock-stepper button:first-child { border-right: 1px solid var(--line) }
.stock-stepper button:last-child { border-left: 1px solid var(--line) }
.stock-stepper button:hover:not(:disabled) { background: var(--yellow) }
.stock-stepper button:disabled { color: var(--ink-35); cursor: not-allowed; opacity: .55 }
.stock-count-input { min-width: 0; width: 100%; height: 100%; padding: 0 2px; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); font-family: var(--font-d); font-size: 14px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; text-align: center; outline: none; appearance: textfield; -moz-appearance: textfield }
.stock-count-input::-webkit-inner-spin-button, .stock-count-input::-webkit-outer-spin-button { margin: 0; appearance: none; -webkit-appearance: none }
.stock-stepper.invalid .stock-count-input { color: var(--rouge) }
.slot { display: flex; flex-direction: column; min-width: 0; transition: transform .22s var(--ease) }
.slot:hover { transform: translateY(-2px) }
.slot-ic {
  position: relative; width: min(100%, 100px); aspect-ratio: 1 / 1; margin: 0 auto; border-radius: 17px;
  transition: border-color .22s, box-shadow .22s var(--ease), filter .22s;
}
.slot-ic.is-agent { overflow: hidden; border: 1.5px solid rgba(215, 137, 53, .38); background: var(--cream); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), inset 0 -10px 18px -10px rgba(215, 137, 53, .22) }
.slot:hover .slot-ic:not(.is-agent) { filter: brightness(1.035) }
.slot:hover .slot-ic.is-agent { border-color: var(--accent); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), 0 14px 26px -14px rgba(73, 59, 44, .4) }
.slot-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; visibility: hidden; opacity: 0; border-radius: inherit; background: linear-gradient(168deg, var(--surface) 0%, var(--cream) 62%, var(--paper) 100%); pointer-events: none }
.slot-ic.has-icon-error .slot-ph { visibility: visible; opacity: 1 }
.slot-ph .ph-seal {
  position: absolute; top: 8px; right: 8px; width: 21px; height: 21px; border: 1.5px solid var(--brand-blue);
  border-radius: 6px; color: var(--brand-blue); font-size: 11px; font-weight: 800; display: grid; place-items: center;
  opacity: .8; font-family: var(--font-b); line-height: 1;
}
.slot-ph .ph-mono { font-family: var(--font-s); font-weight: 900; font-size: clamp(26px, 4vw, 34px); color: var(--ink-35); user-select: none }
.slot-img { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit; object-fit: cover; transition: filter .22s, opacity .22s }
.slot-count {
  position: absolute; right: 3px; bottom: 6px; display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 26px; padding: 2px 9px 0; border: 1px solid rgba(255, 248, 236, .82); border-radius: 999px;
  background: rgba(90, 70, 51, .94); color: var(--cream); font-family: var(--font-d); font-weight: 900; font-size: 14px;
  line-height: 1; text-align: center; white-space: nowrap; box-shadow: 0 3px 8px rgba(73, 59, 44, .24);
}
.slot-count.gained { background: var(--accent); color: var(--cream) }
.slot-name {
  margin-top: 5px; font-size: 12px; font-weight: 800; color: var(--ink); text-align: center; line-height: 1.45;
  height: calc(2 * 1.45em); display: flex; align-items: center; justify-content: center;
  overflow: hidden; word-break: break-all; transition: color .3s;
}
.slot:hover .slot-name { color: var(--accent-strong) }

/* ---- 清单格状态：未持有（数量 0）仅淡化图片，数量角标保持可读 ---- */
.slot.is-missing .slot-img { filter: grayscale(.28) saturate(.5); opacity: .68 }
.slot.is-missing:hover .slot-ic:not(.is-agent) .slot-img { filter: grayscale(.16) saturate(.68); opacity: .8 }
.slot.is-missing .slot-ic.is-agent { border-style: dashed }
.slot.is-missing .slot-ic.is-agent .slot-img { filter: grayscale(.28) saturate(.5); opacity: .55 }
.slot.is-missing:hover .slot-ic.is-agent .slot-img { filter: grayscale(.16) saturate(.68); opacity: .8 }
.slot.is-missing .slot-name { color: var(--ink-60) }
.slot.is-missing:hover .slot-name { color: var(--accent-strong) }
.slot-count.zero { background: rgba(255, 253, 246, .86); border: 1.5px dashed var(--line); color: var(--ink-60); box-shadow: none }
.slot-tag {
  margin-top: 5px; align-self: center; font-size: 10.5px; font-weight: 700; color: var(--ink-60);
  background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; line-height: 1.5;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.slot-tag.star.s5 { background: var(--yellow); border-color: transparent; color: var(--ink) }
.slot-tag.star.s4 { background: transparent; border: 1.5px solid rgba(91, 106, 140, .45); color: var(--slate-deep) }
.slot-tag.star.s3 { background: transparent; border: 1.5px solid var(--line); color: var(--ink-60) }

/* ---- 密探目录：与背包道具同构的心纸盘点格 ---- */
.backpack.manifest-agents { padding: 14px 16px 18px; border-radius: 16px }
.manifest-agents .agent-directory { min-width: 0 }
.manifest-agents .agent-group { position: relative; padding-top: 15px }
.manifest-agents .agent-group + .agent-group { margin-top: 4px; border-top: 1px dashed var(--line) }
.manifest-agents .agent-group-head { position: relative; display: flex; min-height: 28px; align-items: center; gap: 8px; padding-left: 11px }
.manifest-agents .agent-group-head::before { position: absolute; top: 50%; left: 0; width: 3px; height: 18px; border-radius: 2px; background: var(--accent); content: ''; transform: translateY(-50%) }
.manifest-agents .agent-group-head h2 { margin: 0; color: var(--ink); font-family: var(--font-s); font-size: 15px; font-weight: 900; letter-spacing: 0 }
.manifest-agents .agent-group-head span { color: var(--ink-35); font-family: var(--font-d); font-size: 10.5px; font-weight: 800 }
.manifest-agents .agent-slot-grid { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); justify-content: stretch; gap: 12px 8px; margin-top: 12px }
.manifest-agents .agent-group-head + .agent-slot-grid { margin-top: 12px }
.manifest-agents .agent-card { position: relative; align-items: center }
.manifest-agents .agent-card:hover { transform: none }
.manifest-agents .agent-card .slot-ic { width: 72px; border-radius: 0 }
.manifest-agents .agent-card .slot-ic.is-agent { overflow: visible; border: 0; background: transparent; box-shadow: none }
.manifest-agents .agent-card:hover .slot-ic.is-agent { border-color: transparent; box-shadow: none }
.manifest-agents .agent-card .slot-name { height: 2.7em; margin-top: 4px; color: var(--ink); font-size: 10.5px; line-height: 1.35 }
.manifest-agents .agent-card.is-favorite .slot-name { color: var(--tea) }
.manifest-agents .agent-card .slot-count { right: 2px; bottom: 3px; min-width: 25px; height: 20px; padding: 2px 6px 0; border-radius: 5px; font-size: 10.5px; box-shadow: none }
.manifest-agents .agent-favorite-btn { position: absolute; top: -6px; right: -12px; z-index: 4; display: grid; width: 44px; height: 44px; place-items: center; border: 0; background: transparent; color: var(--ink-35); cursor: pointer }
.manifest-agents .agent-favorite-btn::before { position: absolute; inset: 8px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); box-shadow: 0 2px 6px rgba(73, 59, 44, .16); content: ''; opacity: .94; transition: background-color .18s var(--ease), border-color .18s var(--ease), box-shadow .18s var(--ease), transform .18s var(--ease) }
.manifest-agents .agent-favorite-btn svg { position: relative; z-index: 1 }
.manifest-agents .agent-favorite-btn.on { color: var(--cream) }
.manifest-agents .agent-favorite-btn.on::before { border-color: var(--tea); background: var(--tea); box-shadow: 0 2px 7px rgba(73, 59, 44, .28) }
.manifest-agents .agent-favorite-btn:hover:not(:disabled)::before { border-color: var(--accent); transform: scale(1.06) }
.manifest-agents .agent-favorite-btn:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.manifest-agents .agent-favorite-btn:disabled { cursor: not-allowed; opacity: .5 }
.manifest-agents .agent-favorite-btn.busy svg { opacity: .42 }

/* ---- 背包道具追踪目录：盘点簿式紧凑清单 ---- */
.backpack.manifest-items { padding: 14px 16px 18px; border-radius: 16px }
.manifest-items .item-section { padding-top: 15px }
.manifest-items .item-section + .item-section { margin-top: 4px }
.manifest-items .section-head { gap: 8px }
.manifest-items .section-head h2 { font-size: 16px }
.manifest-items .section-head span { font-size: 10.5px }
.manifest-items .slot-grid,
.manifest-items .item-subsection > .slot-grid,
.manifest-items .subsection-rows .item-subsection > .slot-grid,
.manifest-items .subsection-shelves .item-subsection > .slot-grid,
.manifest-items .cultivation-group > .slot-grid { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); justify-content: stretch; gap: 12px 8px; margin-top: 12px }
.manifest-items .slot:hover { transform: none }
.manifest-items .slot-ic:not(.is-agent) { width: 68px; border-radius: 11px }
.manifest-items .slot-name { height: 2.6em; min-height: 0; margin-top: 3px; font-size: 11.5px; line-height: 1.3 }
.manifest-items .slot-count { right: 0; bottom: 2px; min-width: 27px; height: 20px; padding: 1px 6px 0; border-width: 1px; font-size: 11.5px; box-shadow: 0 2px 5px rgba(73, 59, 44, .2) }
.manifest-items .slot-count.zero { border-width: 1px }
.manifest-items .slot-ph .ph-seal { top: 5px; right: 5px; width: 18px; height: 18px; border-radius: 4px; font-size: 9px }
.manifest-items .slot-ph .ph-mono { font-size: 24px }
.manifest-items .subsection-columns { margin-top: 9px }
.manifest-items .item-subsection { padding: 11px 0 }
.manifest-items .subsection-head { gap: 6px; padding-left: 8px }
.manifest-items .subsection-head::before { width: 2px; height: 18px }
.manifest-items .subsection-head h3 { font-size: 12.5px }
.manifest-items .subsection-head span { font-size: 10px }
.manifest-items .subsection-shelves .item-subsection { grid-template-columns: 132px minmax(0, 1fr); column-gap: 12px }
.manifest-items .subsection-shelves .item-subsection > .slot-grid { margin-top: 0 }
.manifest-items .cultivation-groups { grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 10px; margin-top: 11px }
.manifest-items .cultivation-group { padding: 10px; border-radius: 7px }
.manifest-items .cultivation-group-head h4 { font-size: 12px }
.manifest-items .cultivation-group-head span { font-size: 10px }

@media (min-width: 641px) {
  .manifest-items .item-subsection.is-level-breakthrough > .slot-grid > .slot:nth-child(12) { grid-column: 1 }
}

@media (min-width: 641px) and (max-width: 1080px) {
  .manifest-items .item-subsection.is-divination-stone > .slot-grid > .slot:nth-child(5) { grid-column: 1 }
  .manifest-items .cultivation-groups { grid-template-columns: minmax(0, 1fr) }
  .manifest-items .cultivation-group > .slot-grid { grid-template-columns: repeat(6, minmax(0, 1fr)) }
}

/* ---- 导入记录 ---- */
.records-head { display: flex; align-items: center; gap: 12px }
.records-head .hint { font-size: 12.5px; color: var(--ink-60); font-weight: 600 }
.records-head .sp { flex: 1 }
.record-list { list-style: none; margin-top: 16px; display: flex; flex-direction: column; gap: 10px }
.record {
  display: flex; align-items: center; gap: 14px; background: var(--surface); border: 1px solid var(--line);
  border-radius: 16px; padding: 14px 18px; transition: transform .45s var(--ease), box-shadow .45s var(--ease), border-color .3s;
}
.record:hover { transform: translateY(-3px); box-shadow: 0 18px 36px -20px rgba(73, 59, 44, .26); border-color: rgba(73, 59, 44, .22) }
.record-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px }
.record-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
.rtag { font-size: 11px; font-weight: 700; border-radius: 7px; padding: 2px 10px; letter-spacing: .03em; white-space: nowrap }
.rtag.rtag-reward { background: var(--yellow); color: var(--ink) }
.rtag.rtag-snapshot { border: 1.5px solid var(--brand-blue); color: var(--brand-blue); background: transparent }
.rtag.rtag-type { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-60) }
.rtag.rtag-stamina { background: var(--cream); border: 1.5px solid var(--accent); color: var(--accent-strong) }
.rtag.rtag-agent { background: rgba(215, 137, 53, .08); border: 1.5px solid rgba(215, 137, 53, .4); color: var(--accent-strong) }
.rtag.rtag-item { background: rgba(91, 106, 140, .07); border: 1.5px solid rgba(91, 106, 140, .35); color: var(--slate-deep) }
.rtag.effect { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink-60) }
.rtag.effect.eff-history_only { color: var(--slate-deep); border-color: rgba(91, 106, 140, .35) }
.rtag.effect.eff-superseded { color: var(--rouge); border-color: rgba(166, 81, 74, .4) }
.record-time { font-family: var(--font-d); font-size: 11.5px; color: var(--ink-35); margin-left: auto }
.record-entries { font-size: 13px; color: var(--ink); line-height: 1.7 }
.record-id { font-family: var(--font-d); font-size: 11px; color: var(--ink-35); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.record-del { flex: none; border: 1.5px solid rgba(166, 81, 74, .35); background: rgba(166, 81, 74, .06); color: var(--rouge); border-radius: 10px; padding: 7px 16px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: color .25s, background-color .25s, border-color .25s }
.record-del:hover { background: rgba(166, 81, 74, .16) }

/* Hero 目录日期与深色块文字 */
.hero-stats .catalog-date { font-size: 34px; line-height: normal; letter-spacing: 0 }
.hero-stats .catalog-date time { font-family: var(--font-d); font-weight: 900; white-space: nowrap }
.hero-stats div.is-authed .v small a { color: var(--cream); text-decoration: underline; text-underline-offset: 3px }

@media (max-width: 640px) {
  .hero-stats .catalog-date { font-size: 19px; line-height: 1.3 }
  .hero-stats .catalog-date time { white-space: nowrap }
  .account-bar { align-items: stretch; flex-direction: column; gap: 10px }
  .account-bar .sp { display: none }
  .ac-sel { display: grid; grid-template-columns: 1fr; gap: 6px }
  .ac-sel select { width: 100%; min-width: 0; min-height: 44px; font-size: 16px }
  .account-bar > .act-btn { width: 100%; min-height: 44px }
  .account-mgr { padding: 14px; border-radius: 14px }
  .ac-new { align-items: stretch; flex-direction: column }
  .ac-new input { width: 100%; min-width: 0; min-height: 44px; font-size: 16px }
  .ac-new .btn { width: 100% }
  .ac-item { align-items: flex-start; gap: 8px; padding: 12px; flex-wrap: wrap }
  .ac-meta { flex-basis: calc(100% - 24px) }
  .ac-btn { min-height: 40px; flex: 1 }
  .inventory-tabs { margin-top: 24px; flex-wrap: wrap; background: transparent; padding: 0; gap: 8px }
  .inventory-tabs > button:not(.act-btn) { flex: 1 1 calc(50% - 4px); min-height: 44px; background: rgba(73, 59, 44, .06) }
  .inventory-tabs > button:not(.act-btn).on { background: var(--tea) }
  .inventory-tabs .sp { display: none }
  .inventory-tabs .act-btn { flex: 1 1 calc(50% - 4px); min-height: 44px; background: var(--surface) }
  .inventory-tabs .export-all { flex: 1 1 100%; min-height: 44px; justify-content:center; background: var(--surface); border: 1px solid var(--line); border-radius: 10px }
  .import-box { padding: 14px; border-radius: 14px }
  .import-box textarea { font-size: 16px }
  .import-actions { align-items: stretch; flex-direction: column }
  .import-actions .btn { width: 100% }
  .manifest-intro { display: block }
  .manifest-intro.is-editing { display: contents }
  .manifest-scope { align-items: flex-start; flex-wrap: wrap; margin-top: 12px; padding: 10px 2px; border-left: 0; border-top: 1px dashed var(--line); border-bottom: 1px dashed var(--line) }
  .manifest-scope.is-editing {
    position: sticky;
    top: 64px;
    z-index: 45;
    margin-top: 12px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 10px 24px -18px rgba(73, 59, 44, .45);
  }
  .manifest-scope p { flex-basis: calc(100% - 25px) }
  .manifest-scope > button { width: 100%; min-height: 44px; background: var(--surface); border: 1px solid var(--line) }
  .manifest-scope .manifest-edit-actions { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px }
  .manifest-scope .manifest-edit-actions button { width: 100%; min-height: 44px; background: var(--surface); border: 1px solid var(--line) }
  .type-switch { width: 100%; display: flex; flex-wrap: wrap }
  .type-switch > button { flex: 1 1 calc(50% - 4px); min-height: 44px }
  .acquired-type-switch { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) }
  .acquired-type-switch > button { min-width: 0; height: 50px; padding-inline: 6px; font-size: 12px; line-height: 1.35; white-space: normal }
  .type-switch .hint { flex: 1 1 100%; margin: 4px 2px }
  .backpack { padding: 14px 12px 16px; border-radius: 20px }
  .slot-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 9px }
  .item-section { padding-top: 18px }
  .section-head h2 { font-size: 16px }
  .subsection-columns { grid-template-columns: 1fr; gap: 0; margin-top: 14px }
  .item-subsection { padding: 16px 0 }
  .item-subsection > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); gap: 10px 8px }
  .subsection-shelves .item-subsection { grid-template-columns: minmax(0, 1fr); row-gap: 20px }
  .subsection-shelves .subsection-head { align-self: auto }
  .subsection-edit { width: 44px; height: 44px }
  .subsection-shelves .item-subsection > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); justify-content: center; margin-top: 0 }
  .cultivation-groups { grid-template-columns: minmax(0, 1fr); gap: 10px }
  .cultivation-group { padding: 11px }
  .cultivation-group > .slot-grid { grid-template-columns: repeat(3, minmax(0, 92px)); gap: 10px 8px }
  .slot-ic:not(.is-agent) { width: min(100%, 88px) }
  .slot-count { min-width: 30px; height: 24px; font-size: 13px; padding: 2px 8px 0; right: 2px; bottom: 5px }
  .backpack.manifest-items { padding: 10px 8px 12px; border-radius: 14px }
  .manifest-items .item-section { padding-top: 11px }
  .manifest-items .section-head h2 { font-size: 13px }
  .manifest-items .slot-grid,
  .manifest-items .item-subsection > .slot-grid,
  .manifest-items .subsection-rows .item-subsection > .slot-grid,
  .manifest-items .subsection-shelves .item-subsection > .slot-grid,
  .manifest-items .cultivation-group > .slot-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 7px 3px; margin-top: 8px }
  .manifest-items .slot-ic:not(.is-agent) { width: min(100%, 42px) }
  .manifest-items .slot-name { height: 2.5em; margin-top: 2px; font-size: 9.5px; line-height: 1.25 }
  .manifest-items .slot-count { right: -1px; bottom: 1px; min-width: 20px; height: 16px; padding: 1px 4px 0; font-size: 9.5px }
  .manifest-items .slot-ph .ph-seal { display: none }
  .manifest-items .slot-ph .ph-mono { font-size: 18px }
  .manifest-items .subsection-columns { margin-top: 5px }
  .manifest-items .item-subsection { padding: 8px 0 }
  .manifest-items .subsection-shelves .item-subsection { grid-template-columns: minmax(0, 1fr); row-gap: 7px }
  .manifest-items .item-subsection.is-divination-stone > .slot-grid > .slot:nth-child(5) { grid-column: 1 }
  .manifest-items .cultivation-groups { grid-template-columns: minmax(0, 1fr); gap: 7px; margin-top: 7px }
  .manifest-items .cultivation-group { padding: 6px }
  .acquired-query { padding: 14px; border-radius: 12px }
  .acquired-query-head { align-items: stretch; flex-direction: column; gap: 12px }
  .acquired-query h2 { font-size: 18px; line-height: 1.45 }
  .quick-range { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px }
  .quick-range button { min-height: 44px; padding-inline: 6px }
  .acquired-bar { flex-direction: column; align-items: stretch }
  .manifest-bar { flex-direction: column; align-items: stretch; gap: 10px }
  .manifest-bar .sp { display: none }
  .type-switch { flex-wrap: wrap }
  .type-switch > .sp { display: none }
  .stock-save-notice { width: 100%; text-align: center }
  .stock-edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .stock-stepper { width: min(100%, 132px); height: auto; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, 44px) }
  .stock-stepper button:first-child { grid-column: 1; grid-row: 2; border-right: 1px solid var(--line) }
  .stock-stepper button:last-child { grid-column: 2; grid-row: 2; border-left: 0 }
  .stock-stepper .stock-count-input { grid-column: 1 / -1; grid-row: 1; border-bottom: 1px solid var(--line); font-size: 15px }
  .mf-search { width: auto }
  .mf-stats { width: 100%; justify-content: space-between; gap: 8px }
  .mf-stat { flex-direction: column; gap: 1px }
  .mf-num { font-size: 18px }
  .mf-progress { width: 100% }
  .mf-search { width: 100%; min-height: 44px; font-size: 16px }
  .mf-filter { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr) }
  .mf-filter button { min-height: 40px }
  .agent-controls { top: 72px; display: grid; grid-template-columns: minmax(0, 1fr) 44px minmax(0, 1fr) minmax(82px, auto) 58px; align-items: end; gap: 7px; padding: 8px }
  .agent-controls-toggle { display: inline-flex; grid-column: 5; grid-row: 1; width: 58px }
  .agent-controls > label { min-width: 0 }
  .agent-controls select, .agent-control-search input { width: 100%; min-width: 0; min-height: 44px; font-size: 12px }
  .agent-control-search { grid-column: 1 / 4; grid-row: 1 }
  .agent-control-search > svg { bottom: 14px }
  .agent-favorite-mode { grid-column: 1 / -1; grid-row: 2; grid-template-columns: repeat(3, minmax(0, 1fr)) }
  .agent-favorite-mode button { min-height: 40px; padding-inline: 5px }
  .agent-filter-panel { grid-column: 4; grid-row: 1 }
  .agent-filter-panel summary { width: 100% }
  .agent-filter-menu { left: 0; right: auto; width: min(320px, calc(100vw - 32px)) }
  .agent-sort-row { display: grid; grid-column: 1 / -1; grid-row: 3; grid-template-columns: minmax(0, 1.05fr) 44px minmax(132px, 1fr); gap: 7px; min-width: 0 }
  .agent-sort-row .agent-menu-control { min-width: 0; width: 100% }
  .agent-sort-row .agent-sort-direction { width: 100% }
  .agent-controls.is-editing .agent-sort-row { grid-template-columns: minmax(0, 1fr) 44px }
  .agent-reset { min-height: 44px }
  .agent-result { grid-column: 1 / -1; grid-row: 4; margin: 0; justify-self: center; text-align: center }
  .agent-sync-state { grid-column: 1 / -1 }
  .agent-controls.is-collapsed { row-gap: 0 }
  .agent-controls.is-collapsed .agent-favorite-mode,
  .agent-controls.is-collapsed .agent-sort-control,
  .agent-controls.is-collapsed .agent-sort-direction,
  .agent-controls.is-collapsed .agent-group-control,
  .agent-controls.is-collapsed .agent-reset,
  .agent-controls.is-collapsed .agent-result,
  .agent-controls.is-collapsed .agent-sync-state { display: none }
  .agent-controls.is-collapsed .agent-control-search { grid-column: 1 / 4; grid-row: 1 }
  .agent-controls.is-collapsed .agent-filter-panel { grid-column: 4; grid-row: 1 }
  .agent-controls.is-collapsed .agent-controls-toggle { grid-column: 5; grid-row: 1 }
  .backpack.manifest-agents { padding: 8px 7px 10px; border-radius: 14px }
  .manifest-agents .agent-group { padding-top: 11px }
  .manifest-agents .agent-group + .agent-group { margin-top: 4px }
  .manifest-agents .agent-group-head { min-height: 26px }
  .manifest-agents .agent-group-head + .agent-slot-grid { margin-top: 7px }
  .manifest-agents .agent-slot-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px 4px; margin-top: 8px }
  .manifest-agents .agent-card .slot-ic { width: min(100%, 64px) }
  .manifest-agents .agent-card .slot-name { height: 2.6em; margin-top: 2px; font-size: 9.5px; line-height: 1.3 }
  .manifest-agents .agent-card .slot-count { right: 1px; bottom: 2px; min-width: 22px; height: 18px; padding-inline: 4px; font-size: 9.5px }
  .manifest-agents .agent-favorite-btn { top: -7px; right: -12px }
  .is-agent-editor .stock-edit-grid { grid-template-columns: minmax(0, 1fr); gap: 5px }
  .is-agent-editor .stock-edit-slot { min-height: 82px; grid-template-columns: 58px minmax(70px, 1fr) 132px; gap: 2px 7px; padding-inline: 4px }
  .is-agent-editor .stock-edit-slot .slot-ic { width: 54px }
  .is-agent-editor .stock-edit-slot .stock-stepper { width: 132px; height: 44px; grid-template-columns: 40px minmax(0, 1fr) 40px; grid-template-rows: 44px }
  .is-agent-editor .stock-stepper button:first-child { grid-column: 1; grid-row: 1; border-right: 1px solid var(--line) }
  .is-agent-editor .stock-stepper button:last-child { grid-column: 3; grid-row: 1; border-left: 1px solid var(--line) }
  .is-agent-editor .stock-stepper .stock-count-input { grid-column: 2; grid-row: 1; border-bottom: 0 }
  .range { align-items: stretch; flex-direction: column }
  .range label { width: 100% }
  .range-dash { display: none }
  .range input { width: 100%; min-height: 44px; min-width: 0; font-size: 16px }
  .acquired-submit { width: 100% }
  .range-caption { width: 100%; align-items: flex-start; margin-left: 0 }
  .acquired-tools { align-items: stretch; flex-direction: column }
  .acquired-views { display: grid; width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .acquired-views button { min-height: 44px; padding-inline: 7px }
  .acquired-filters { display: grid; width: 100%; grid-template-columns: minmax(0, 1fr); grid-template-areas: 'search' 'source'; gap: 10px; margin-left: 0; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface) }
  .acquired-filters.has-sort { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-areas: 'search search' 'source sort' }
  .acquired-filters > label { min-width: 0; gap: 5px }
  .acquired-filters > label > span:not(.sr-only) { font-size: 11px }
  .acquired-filters select, .acquired-filters input { width: 100%; min-height: 44px; border-radius: 8px; background: var(--paper); font-size: 16px }
  .acquired-search { grid-area: search }
  .acquired-source-filter { grid-area: source }
  .acquired-sort-filter { grid-area: sort }
  .acquired-search > svg { bottom: 14px }
  .acquired-ledger { padding: 14px 12px; border-radius: 12px }
  .ledger-head { align-items: flex-start; flex-direction: column; gap: 6px }
  .ledger-head > small { text-align: left }
  .source-list button { min-height: 88px; grid-template-columns: 28px minmax(0, 1fr) 22px; grid-template-areas: 'rank main icon' '. records icon' '. kinds icon'; gap: 4px 8px; padding: 10px 2px }
  .source-rank { grid-area: rank }
  .source-main { grid-area: main }
  .source-list svg { grid-area: icon }
  .source-stat:nth-child(3) { grid-area: records }
  .source-stat:nth-child(4) { grid-area: kinds }
  .source-top { display: none }
  .timeline-list button { min-height: 0; grid-template-columns: minmax(0, 1fr) 22px; grid-template-areas: 'date icon' 'rewards rewards'; gap: 8px; padding: 12px 2px }
  .timeline-list time { grid-area: date }
  .timeline-list svg { grid-area: icon }
  .daily-rewards { grid-area: rewards }
  .detail-list li { grid-template-columns: 90px minmax(0, 1fr); gap: 8px; padding: 12px 2px }
  .detail-entries { grid-column: 1 / -1 }
  .details-head .act-btn { width: 100%; justify-content: center; min-height: 44px }
  .record { align-items: flex-start; padding: 12px; flex-wrap: wrap }
  .record-time { margin-left: 0 }
  .record-del { min-height: 44px; width: 100% }
  .state { padding: 36px 18px }
}

@media (prefers-reduced-motion: reduce) {
  .subsection-edit,
  .subsection-edit svg,
  .subsection-edit::after { transition: none }
  .subsection-edit:hover:not(:disabled) svg { transform: none }
  .spin { animation: none }
}
</style>
