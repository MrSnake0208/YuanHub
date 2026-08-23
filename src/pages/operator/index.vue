<template>
  <div class="page-operator">
    <IslandSidebar />

    <main class="operator-main">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">密探</span>
            <span class="pill">养成</span>
            <span class="pill">图鉴</span>
            <span class="pill">归档</span>
          </div>
          <h1>密探养成<span class="small">图鉴 · 快照 · 归档</span></h1>
          <p class="hero-sub">如鸢 / 代号鸢 密探养成档案：多个子账号分别维护，记录修为、星级、等级、命盘与星石，支持 v2 / v3 交换档案。</p>
          <div class="hero-stats">
            <div><div class="k">密探目录</div><div class="v">{{ catalogCount }}<small>位</small></div></div>
            <div><div class="k">已招募</div><div class="v">{{ manifestOwned }}<small>位</small></div></div>
            <div><div class="k">当前版本</div><div class="v">{{ gameFilter }}</div></div>
            <div v-if="auth.isLoggedIn" class="is-authed"><div class="k">已同步</div><div class="v">云端<small>可导入导出</small></div></div>
            <div v-else class="is-authed"><div class="k">未登录</div><div class="v">只读<small><router-link to="/login">去登录</router-link></small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 统一子账号（库存 × 密探共用） -->
          <AccountWorkspace
            v-model:accountId="accountId"
            v-model:game="gameFilter"
            :accounts="accounts"
            :error="accountError"
            :disabled="!auth.isLoggedIn || accountsLoading || accountBusy"
            :game-disabled="accountsLoading || accountBusy || editing"
            :busy="accountBusy"
            heading-title="选择要查看的账号"
            heading-sub="密探、库存和游戏版本都会跟随这个子账号，在两边自动保持一致。"
            new-placeholder="新子账号名称（1~64 字）"
            @change="onAccountChange"
            @game-change="onGameChange"
            @create="onCreateAccount"
            @rename="onRenameAccount"
            @delete="onDeleteAccount"
          >
            <template #actions>
              <button class="act-btn archive-toggle" :disabled="!auth.isLoggedIn" :aria-expanded="showArchive" @click="toggleArchive">
                <Archive :size="15" aria-hidden="true" />{{ showArchive ? '收起数据交换' : '数据交换' }}
              </button>
            </template>

            <div v-if="showArchive" class="archive-workspace">
              <div class="archive-heading">
                <div>
                  <span class="section-kicker">数据交换</span>
                  <h2>导入或导出档案</h2>
                  <p>用于迁移或备份密探养成数据；导出包含客观档案、状态、备注、关注和养成目标。</p>
                </div>
                <span class="archive-format">JSON · v2 / v3</span>
              </div>
              <div class="archive-actions">
                <button class="act-btn archive-import" :disabled="!auth.isLoggedIn" :aria-expanded="showImport" @click="showImport = !showImport">
                  <Upload :size="16" aria-hidden="true" />{{ showImport ? '收起导入' : '导入档案' }}
                </button>
                <div class="export-group">
                  <div class="export-label">导出范围</div>
                  <div class="export-options" role="radiogroup" aria-label="导出范围">
                    <label class="export-option" :class="{ active: !exportAll }">
                      <input v-model="exportAll" type="radio" :value="false" name="operator-export-scope" />
                      <span><b>当前账号</b><small>{{ currentAccountName }}</small></span>
                    </label>
                    <label class="export-option" :class="{ active: exportAll, disabled: accounts.length < 2 }">
                      <input v-model="exportAll" type="radio" :value="true" name="operator-export-scope" :disabled="accounts.length < 2" />
                      <span><b>全部账号</b><small>{{ accounts.length > 1 ? accounts.length + ' 个账号' : '至少需要 2 个账号' }}</small></span>
                    </label>
                  </div>
                  <button class="act-btn export-submit" :disabled="!auth.isLoggedIn || !accountId" @click="doExport">
                    <Download :size="16" aria-hidden="true" />导出完整备份
                  </button>
                </div>
              </div>
            </div>
          </AccountWorkspace>

          <!-- TABS：图鉴 / 当前养成 / 养成追踪 -->
          <div class="operator-tabs" role="tablist" aria-label="密探工作区" v-reveal>
            <button type="button" class="operator-tab-button" role="tab" :aria-selected="activeTab === 'catalog'" :class="{ on: activeTab === 'catalog' }" @click="setTab('catalog')">密探图鉴</button>
            <button type="button" class="operator-tab-button" role="tab" :aria-selected="activeTab === 'current'" :class="{ on: activeTab === 'current' }" @click="setTab('current')">当前养成</button>
            <button type="button" class="operator-tab-button" role="tab" :aria-selected="activeTab === 'tracking'" :class="{ on: activeTab === 'tracking' }" @click="setTab('tracking')">养成追踪</button>
            <span class="sp"></span>
            <router-link class="act-btn ghost admin-link" :to="quickHref" @click="showImport = false">首次 / 快捷导入</router-link>
          </div>

          <!-- 导入档案 -->
          <div v-if="showImport" class="import-box" v-reveal>
            <p id="operator-import-tip" class="tip">v3 档案会先校验并展示逐项差异，确认后才写入当前账号；v2 档案继续按原流程导入。</p>
            <div class="import-target"><span>导入目标</span><strong>{{ currentAccountName }}</strong><small v-if="importDocumentVersion">已识别 v{{ importDocumentVersion }}</small></div>
            <textarea id="operator-import-json" v-model="importText" aria-label="密探交换档案 JSON" :aria-invalid="!!importError" :aria-describedby="importError ? 'operator-import-tip operator-import-error' : 'operator-import-tip'" autocomplete="off" placeholder='{"format":"myshare-operator-exchange","version":3,"accounts":[{"id":"scan_local","name":"采集账号"}],"records":[]}' @input="onImportTextInput"></textarea>
            <p v-if="importError" id="operator-import-error" class="import-error" role="alert">{{ importError }}</p>
            <div class="import-actions">
              <label class="btn ghost file-label">
                选择 JSON 文件
                <input type="file" accept=".json,application/json" @change="onFilePick" />
              </label>
              <button class="btn ghost" type="button" @click="fillExample">填入 v3 示例</button>
              <button v-if="importDocumentVersion === 3" class="btn primary" type="button" :disabled="importing || !importText.trim() || !accountId" @click="previewV3Import">{{ importing ? '校验中…' : (importPreview ? '重新预览' : '校验并预览') }}</button>
              <button v-else class="btn primary" type="button" :disabled="importing || !importText.trim()" @click="doImport">{{ importing ? '导入中…' : '导入 v2 档案' }}</button>
            </div>
            <section v-if="importPreview" class="import-preview" aria-live="polite" aria-label="v3 导入预览">
              <div class="import-preview-head">
                <div>
                  <strong>导入预览</strong>
                  <span>可写入 {{ importPreview.accepted + importPreview.partial }} · 待复核 {{ importPreview.review }} · 拒绝 {{ importPreview.rejected }} · 无变化 {{ importPreview.unchanged }}</span>
                </div>
                <button class="btn primary" type="button" :disabled="importing || !canCommitV3Import" @click="commitV3Import">{{ importing ? '导入中…' : '确认导入' }}</button>
              </div>
              <label v-if="importPreview.review" class="import-review-confirm">
                <input v-model="importConfirmReview" type="checkbox" @change="onImportReviewChange" />
                <span>确认写入需要人工复核的分区；勾选后请重新预览</span>
              </label>
              <p v-if="importPreview.rejected" class="import-preview-warning">被拒绝的密探不会写入，其余可接受条目仍可继续导入。</p>
              <div class="import-preview-list">
                <details v-for="(item, index) in importPreview.items" :key="item.recordId + ':' + item.operatorId + ':' + index" class="import-preview-item" :open="item.status === 'rejected' || item.status === 'review'">
                  <summary>
                    <span class="import-status" :class="'is-' + item.status">{{ importStatusLabel(item.status) }}</span>
                    <strong>{{ importOperatorName(item.operatorId) }}</strong>
                    <small>{{ Object.keys(item.changes).length }} 项变化<template v-if="item.stale"> · 观测将过期</template></small>
                  </summary>
                  <dl v-if="Object.keys(item.changes).length" class="import-change-list">
                    <div v-for="(change, field) in item.changes" :key="field"><dt>{{ importFieldLabel(field) }}</dt><dd>{{ importValueLabel(change.before) }} → {{ importValueLabel(change.after) }}</dd></div>
                  </dl>
                  <ul v-if="item.blockingErrors.length || item.warnings.length" class="import-issue-list">
                    <li v-for="(issue, issueIndex) in item.blockingErrors" :key="'error:' + issueIndex" class="error">{{ issue.message || issue.code }}<small v-if="issue.field">{{ issue.field }}</small></li>
                    <li v-for="(issue, issueIndex) in item.warnings" :key="'warning:' + issueIndex">{{ issue.message || issue.code }}<small v-if="issue.field">{{ issue.field }}</small></li>
                  </ul>
                </details>
              </div>
            </section>
            <div v-if="importResult && importResult.kind === 'v2'" class="import-result">
              导入完成：接受 {{ importResult.accepted }} 条 · 重复 {{ importResult.duplicates }} 条
              <span v-if="importResult.superseded"> · 已归档 {{ importResult.superseded }} 条</span>
              <span v-if="importResult.warnings && importResult.warnings.length"> · 警告 {{ importResult.warnings.length }} 条</span>
              <button class="ok" @click="afterImport">刷新养成</button>
            </div>
            <div v-else-if="importResult && importResult.kind === 'v3'" class="import-result" role="status">
              导入完成：写入 {{ importResult.accepted + importResult.partial }} 条 · 拒绝 {{ importResult.rejected }} 条 · 无变化 {{ importResult.unchanged }} 条
              <button class="ok" @click="afterImport">查看当前养成</button>
            </div>
          </div>

          <!-- 图鉴（全量目录：默认全部显示，登录后叠加云端养成） -->
          <div v-show="activeTab === 'catalog'" class="panel" :class="{ 'is-active': activeTab === 'catalog' }">
            <div class="manifest-bar" v-reveal>
              <div class="mf-stats">
                <div class="mf-stat"><b class="mf-num">{{ catalogCount }}</b><span class="mf-k">目录</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestOwned }}</b><span class="mf-k">已招募</span></div>
                <div class="mf-stat"><b class="mf-num">{{ manifestPercent }}</b><span class="mf-k">招募率</span></div>
              </div>
              <div class="mf-progress" title="拥有进度"><i :style="{ width: manifestPercent }"></i></div>
              <span class="sp"></span>
              <input v-model.trim="manifestSearch" class="mf-search" type="search" name="operator-search" aria-label="搜索密探名称、别名或 ID" placeholder="搜索名称 / 别名 / id" />
              <div class="mf-filter">
                <button :class="{ on: manifestFilter === 'all' }" @click="manifestFilter = 'all'">全部</button>
                <button :class="{ on: manifestFilter === 'owned' }" @click="manifestFilter = 'owned'">已招募</button>
                <button :class="{ on: manifestFilter === 'missing' }" @click="manifestFilter = 'missing'">未招募</button>
              </div>
            </div>

            <!-- 属性 / 职业 筛选 -->
            <div class="prof-filter catalog-prof-filter" v-reveal>
              <div class="pf-row pf-prof-row">
                <span class="pf-label">属性</span>
                <div class="mf-filter" role="group" aria-label="按属性筛选密探图鉴">
                  <button type="button" :aria-pressed="profFilter === 'all'" :class="{ on: profFilter === 'all' }" @click="profFilter = 'all'">全部</button>
                  <button v-for="p in profOptions" :key="p" type="button" :aria-pressed="profFilter === p" :class="{ on: profFilter === p }" @click="profFilter = p">{{ p }}</button>
                </div>
              </div>
              <div class="pf-row pf-subprof-row">
                <span class="pf-label">职业</span>
                <div class="mf-filter" role="group" aria-label="按职业筛选密探图鉴">
                  <button type="button" :aria-pressed="subProfFilter === 'all'" :class="{ on: subProfFilter === 'all' }" @click="subProfFilter = 'all'">全部</button>
                  <button v-for="s in subProfOptions" :key="s" type="button" :aria-pressed="subProfFilter === s" :class="{ on: subProfFilter === s }" @click="subProfFilter = s">{{ s }}</button>
                </div>
              </div>
            </div>

            <div v-if="catalogLoading" class="state">正在加载密探图鉴…</div>
            <div v-else-if="catalogError && !catalogOperators.length" class="state err">{{ catalogError }}<button class="link" @click="loadCatalog">重试</button></div>
            <div v-else class="backpack" v-reveal>
              <div class="bp-head">
                <span class="bp-tip">
                  共 <b class="bp-num">{{ catalogCount }}</b> 位密探 · 已招募 <b class="bp-num">{{ manifestOwned }}</b> 位 ·
                  未招募 <b class="bp-num">{{ manifestMissing }}</b> 位 · 目录 <b class="bp-num">{{ catalogVersion || '本地兜底' }}</b>
                  · 当前版本「{{ gameFilter }}」
                  <template v-if="profFilter !== 'all'"> · 属性「{{ profFilter }}」</template>
                  <template v-if="subProfFilter !== 'all'"> · 职业「{{ subProfFilter }}」</template>
                  <template v-if="!auth.isLoggedIn"> · 未登录：仅展示图鉴，不显示云端养成</template>
                </span>
                <span class="sp"></span>
                <span v-if="error" class="bp-tip mf-warn">云端养成同步失败：{{ error }}</span>
                <span v-else-if="favoriteError" class="bp-tip mf-warn">{{ favoriteError }}</span>
              </div>
              <div v-if="manifestEntries.length === 0" class="state slim">没有匹配{{ filterSuffix }}的密探</div>
              <ul v-else class="slot-grid">
                <li v-for="e in manifestEntries" :key="e.id" :ref="el => setOperatorSlotElement(e.id, el)" class="slot" :class="[{ 'is-missing': !e.owned, 'is-favorite': favoriteAgentIds.has(e.id), 'is-scan-new': scanEffectById[e.id] === 'new', 'is-scan-updated': scanEffectById[e.id] === 'updated', 'is-fazheng': e.id === 'char_108_fazheng', 'is-chendeng-sp': e.id === 'char_084_chendengsp', 'is-shizimiao-sp': e.id === 'char_085_shizimiaosp' }, 'rarity-r' + (e.rarity || 3)]" :title="slotTitle(e)">
                  <div class="slot-ic is-agent">
                    <img v-if="e.avatar" class="slot-avatar" :src="avatarUrl(e.avatar)" :alt="e.name" loading="lazy" />
                    <div v-else class="slot-ph">
                      <span class="ph-seal">密</span>
                      <span class="ph-mono">{{ monogram(e) }}</span>
                    </div>
                    <template v-if="e.id === 'char_085_shizimiaosp'">
                      <span class="operator-rune-layer rune-ring-outer" aria-hidden="true"></span>
                      <span class="operator-rune-layer rune-ring-inner" aria-hidden="true"></span>
                      <span class="operator-rune-layer rune-glyphs" aria-hidden="true"></span>
                      <span class="operator-rune-layer rune-ripple-one" aria-hidden="true"></span>
                      <span class="operator-rune-layer rune-ripple-two" aria-hidden="true"></span>
                    </template>
                    <template v-if="e.id === 'char_084_chendengsp'">
                      <span class="operator-seed-layer seed-ring seed-ring-one" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-ring seed-ring-two" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-ring seed-ring-three" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-grain seed-grain-one" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-grain seed-grain-two" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-grain seed-grain-three" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-grain seed-grain-four" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-grain seed-grain-five" aria-hidden="true"></span>
                      <span class="operator-seed-layer seed-grain seed-grain-six" aria-hidden="true"></span>
                    </template>
                    <span class="slot-count" :class="{ zero: !e.owned }">{{ e.owned ? 'Lv' + e.level : '未养' }}</span>
                    <span v-if="profIcon(e.prof)" class="prof-badge" :title="'属性：' + (e.prof || '未知')" role="img" :aria-label="'属性：' + (e.prof || '未知')">
                      <img :src="profIcon(e.prof)" alt="" aria-hidden="true" />
                    </span>
                    <button
                      v-if="auth.isLoggedIn && accountId"
                      class="favorite-btn"
                      :class="{ on: favoriteAgentIds.has(e.id), busy: favoriteBusyIds.has(e.id) }"
                      type="button"
                      :aria-label="favoriteAgentIds.has(e.id) ? '取消特别关注' + (e.name || e.id) : '特别关注' + (e.name || e.id)"
                      :aria-pressed="favoriteAgentIds.has(e.id)"
                      :aria-busy="favoriteBusyIds.has(e.id)"
                      :disabled="favoriteBusyIds.has(e.id) || favoriteLoading"
                      :title="favoriteAgentIds.has(e.id) ? '取消特别关注' : '特别关注'"
                      @click.stop="toggleAgentFavorite(e)"
                    ><Star :size="16" :fill="favoriteAgentIds.has(e.id) ? 'currentColor' : 'none'" aria-hidden="true" /></button>
                    <button v-if="auth.isLoggedIn && accountId" class="edit-icon-btn" type="button" :aria-label="'编辑' + (e.name || e.id)" title="编辑养成" @click.stop="openEdit(e.id)"><Pencil :size="15" aria-hidden="true" /></button>
                  </div>
                  <span class="slot-name">{{ e.name || e.id }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- 当前养成 -->
          <div v-if="visitedTabs.has('current')" v-show="activeTab === 'current'" class="panel" :class="{ 'is-active': activeTab === 'current' }">
            <div class="current-workbench-head" v-reveal>
              <div class="current-workbench-copy">
                <span class="section-kicker">当前账号 · 养成台账</span>
                <div class="current-workbench-title">
                  <h2>{{ currentAccountName }}</h2>
                  <span class="current-game-tag">{{ gameFilter }}</span>
                </div>
                <p>点按虚线数值可直接修改数据。快捷提升按钮会真实扣除库存；手动校正与完整编辑不扣库存</p>
                <p>密探面板自动计算机制源自 <a class="current-credit-link" href="https://wiki.biligame.com/yuan/" target="_blank" rel="noopener noreferrer">bwiki编辑部<span aria-hidden="true">↗</span></a> 及技术外援，因为计算精度问题，数据会存在个位数误差，仅供殿下们参考</p>
              </div>
              <div class="current-workbench-index" aria-label="当前养成状态概览">
                <div class="current-index-total"><b>{{ ownedCurrentEntries.length }}</b><span>已招募</span></div>
                <dl class="current-status-index">
                  <div class="status-growing"><dt>养成中</dt><dd>{{ currentStatusCounts.growing }}</dd></div>
                  <div class="status-graduated"><dt>已毕业</dt><dd>{{ currentStatusCounts.graduated }}</dd></div>
                  <div class="status-inactive"><dt>养老中</dt><dd>{{ currentStatusCounts.inactive }}</dd></div>
                </dl>
              </div>
            </div>

            <div v-if="growthReadyCount > 0 || huajiReadyCount > 0 || upgradeReadyFilter" class="current-upgrade-reminders" role="status" aria-live="polite" aria-atomic="true">
              <div v-if="growthReadyCount > 0 || upgradeReadyFilter === 'growth'" class="current-upgrade-reminder" :class="{ 'is-filtering': upgradeReadyFilter === 'growth' }">
                <span class="current-upgrade-reminder-icon" aria-hidden="true"><ChevronUp :size="18" stroke-width="2.4" /></span>
                <span class="current-upgrade-reminder-copy">
                  <strong v-if="growthReadyCount > 0">有 {{ growthReadyCount }} 位养成中密探可提升等级或修为</strong>
                  <strong v-else>当前没有养成中密探可提升等级或修为</strong>
                  <small>{{ growthReadyCount > 0 ? growthReadySummary : '库存或养成状态已经变化，可以返回查看全部卡片。' }}</small>
                </span>
                <button type="button" :class="{ on: upgradeReadyFilter === 'growth' }" :aria-pressed="upgradeReadyFilter === 'growth'" @click="toggleUpgradeReadyFilter('growth')">{{ upgradeReadyFilter === 'growth' ? '显示全部' : '只看可提升等级/修为' }}</button>
              </div>
              <div v-if="huajiReadyCount > 0 || upgradeReadyFilter === 'huaji'" class="current-upgrade-reminder is-huaji" :class="{ 'is-filtering': upgradeReadyFilter === 'huaji' }">
                <span class="current-upgrade-reminder-icon" aria-hidden="true"><Target :size="18" stroke-width="2.2" /></span>
                <span class="current-upgrade-reminder-copy">
                  <strong v-if="huajiReadyCount > 0">有 {{ huajiReadyCount }} 位密探可提升化极</strong>
                  <strong v-else>当前没有密探可提升化极</strong>
                  <small v-if="huajiReadyCount > 0"><template v-if="favoriteHuajiNames.length"><b>包括特别关注对象：{{ favoriteHuajiNames.join('、') }}</b></template>。</small>
                  <small v-else>库存或密探状态已经变化，可以返回查看全部卡片。</small>
                </span>
                <button type="button" :class="{ on: upgradeReadyFilter === 'huaji' }" :aria-pressed="upgradeReadyFilter === 'huaji'" @click="toggleUpgradeReadyFilter('huaji')">{{ upgradeReadyFilter === 'huaji' ? '显示全部' : '只看可化极' }}</button>
              </div>
            </div>

            <!-- 当前养成案卷筛选 -->
            <div class="prof-filter current-prof-filter" v-reveal>
              <div class="current-filter-head">
                <div class="current-filter-title"><strong>筛选案卷</strong><span>筛选后按状态、稀有度、等级、化极、属性与实装顺序排列</span></div>
                <div class="current-filter-tools">
                  <span class="current-filter-result" aria-live="polite"><b>{{ filteredCurrent.length }}</b> / {{ ownedCurrentEntries.length }} 位</span>
                  <button class="current-favorite-sort" :class="{ on: favoriteFirst }" type="button" :aria-pressed="favoriteFirst" @click="setFavoriteFirst(!favoriteFirst)"><Star :size="13" :fill="favoriteFirst ? 'currentColor' : 'none'" aria-hidden="true" />特别关注优先</button>
                  <button v-if="hasCurrentFilters" class="current-filter-reset" type="button" @click="resetCurrentFilters"><RotateCcw :size="13" aria-hidden="true" />重置</button>
                </div>
              </div>
              <div class="current-filter-rows">
                <div class="pf-row pf-prof-row">
                  <span class="pf-label">属性</span>
                  <div class="mf-filter" role="group" aria-label="按属性筛选当前养成">
                    <button type="button" :aria-pressed="profFilter === 'all'" :class="{ on: profFilter === 'all' }" @click="profFilter = 'all'">全部</button>
                    <button v-for="p in profOptions" :key="p" type="button" :aria-pressed="profFilter === p" :class="{ on: profFilter === p }" @click="profFilter = p"><img v-if="profIcon(p)" :src="profIcon(p)" alt="" aria-hidden="true" />{{ p }}</button>
                  </div>
                </div>
                <div class="pf-row pf-subprof-row">
                  <span class="pf-label">职业</span>
                  <div class="mf-filter" role="group" aria-label="按职业筛选当前养成">
                    <button type="button" :aria-pressed="subProfFilter === 'all'" :class="{ on: subProfFilter === 'all' }" @click="subProfFilter = 'all'">全部</button>
                    <button v-for="s in subProfOptions" :key="s" type="button" :aria-pressed="subProfFilter === s" :class="{ on: subProfFilter === s }" @click="subProfFilter = s">{{ s }}</button>
                  </div>
                </div>
                <div class="pf-row pf-status-row">
                  <span class="pf-label">状态</span>
                  <div class="mf-filter current-status-filter" role="group" aria-label="按养成状态筛选当前养成">
                    <button v-for="option in workbenchStatusOptions" :key="option.value" type="button" :aria-pressed="workbenchStatusFilter === option.value" :class="['status-' + option.value, { on: workbenchStatusFilter === option.value }]" @click="setWorkbenchStatusFilter(option.value)">{{ option.label }}<small>{{ option.value === 'all' ? ownedCurrentEntries.length : currentStatusCounts[option.value] }}</small></button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="annotationError" class="state err slim" role="alert">{{ annotationError }}</div>
            <div v-if="loading" class="state">正在加载养成状态…</div>
            <div v-else-if="error" class="state err">
              {{ error }}
              <button v-if="!auth.isLoggedIn" class="link" @click="goLogin">请先登录后重试</button>
            </div>
            <div v-else-if="ownedCurrentEntries.length === 0" class="state">
              <template v-if="!auth.isLoggedIn">尚未登录：仅可浏览图鉴 · <router-link class="link" to="/login">登录后同步实际养成</router-link></template>
              <template v-else-if="currentEntries.length === 0">暂无已招募的密探养成记录 · <router-link class="link" :to="quickHref">前往首次 / 快捷导入</router-link></template>
              <template v-else>当前记录中的密探均为未拥有 · <button class="link" type="button" @click="setTab('catalog')">前往图鉴设置</button></template>
            </div>
            <div v-else class="current-ledger" v-reveal>
              <div class="current-ledger-meta">
                <span>版本「{{ gameFilter }}」<template v-if="profFilter !== 'all'"> · 属性「{{ profFilter }}」</template><template v-if="subProfFilter !== 'all'"> · 职业「{{ subProfFilter }}」</template><template v-if="workbenchStatusFilter !== 'all'"> · 状态「{{ statusLabel(workbenchStatusFilter) }}」</template><template v-if="upgradeReadyFilter === 'growth'"> · 仅看「等级/修为可提升」</template><template v-else-if="upgradeReadyFilter === 'huaji'"> · 仅看「可提升化极」</template></span>
                <span>快捷提升会真实扣除库存；手动校正与完整编辑不扣库存</span>
              </div>
              <div v-if="filteredCurrent.length === 0" class="state slim">没有匹配{{ currentFilterSuffix }}的已招募密探</div>
              <div v-else class="agent-ledger-grid" role="list">
                <article v-for="e in filteredCurrent" :key="e.id" class="agent-ledger-card" :class="[{ 'is-scan-new': scanEffectById[e.id] === 'new', 'is-scan-updated': scanEffectById[e.id] === 'updated', 'is-draft': cardHasDraft(e), 'is-submit-success': cardSubmitStates[e.id] === 'success', 'is-popover-open': cardPopoverKey.indexOf(e.id + ':') === 0 }, 'rarity-r' + (e.rarity || 3), 'status-' + operatorStatus(e)]" :aria-busy="cardSubmitStates[e.id] === 'submitting'" role="listitem">
                  <header class="ledger-card-head">
                    <div class="ledger-avatar">
                      <img v-if="avOf(e.id)" :src="avatarUrl(avOf(e.id))" :alt="e.name" loading="lazy" />
                      <span v-else>{{ monogram(e) }}</span>
                      <button class="ledger-favorite" :class="{ on: favoriteAgentIds.has(e.id) }" type="button" :aria-label="favoriteAgentIds.has(e.id) ? '取消特别关注' + e.name : '特别关注' + e.name" :aria-pressed="favoriteAgentIds.has(e.id)" :disabled="favoriteBusyIds.has(e.id)" @click="toggleAgentFavorite(e)"><Star :size="14" :fill="favoriteAgentIds.has(e.id) ? 'currentColor' : 'none'" aria-hidden="true" /></button>
                    </div>
                    <div class="ledger-identity">
                      <div class="ledger-name-row">
                        <h3>{{ e.name || e.id }}</h3>
                        <span class="ledger-mobile-prof"><img v-if="profIcon(e.prof)" :src="profIcon(e.prof)" alt="" aria-hidden="true" />{{ e.prof || '未知' }} · {{ firstSubProf(e) || '未标注职业' }}</span>
                        <details class="ledger-status-menu" :class="'status-' + operatorStatus(e)">
                          <summary class="ledger-status-button" :aria-label="e.name + '养成状态：' + statusLabel(operatorStatus(e))">
                            <span>{{ statusLabel(operatorStatus(e)) }}</span>
                          </summary>
                          <div class="ledger-status-options" role="listbox" :aria-label="e.name + '养成状态选项'">
                            <button type="button" role="option" :aria-selected="operatorStatus(e) === 'growing'" :disabled="annotationBusyIds.has(e.id)" @click="setOperatorStatusAndClose(e, 'growing', $event)">养成中</button>
                            <button type="button" role="option" :aria-selected="operatorStatus(e) === 'graduated'" :disabled="annotationBusyIds.has(e.id)" @click="setOperatorStatusAndClose(e, 'graduated', $event)">已毕业</button>
                            <button type="button" role="option" :aria-selected="operatorStatus(e) === 'inactive'" :disabled="annotationBusyIds.has(e.id)" @click="setOperatorStatusAndClose(e, 'inactive', $event)">养老中</button>
                          </div>
                        </details>
                      </div>
                      <span class="ledger-prof"><span class="ledger-prof-copy"><img v-if="profIcon(e.prof)" :src="profIcon(e.prof)" alt="" aria-hidden="true" />{{ e.prof || '未知' }} · {{ firstSubProf(e) || '未标注职业' }}</span><small v-if="quickNotices[e.id]" class="ledger-notice" role="status">{{ quickNotices[e.id] }}</small></span>
                    </div>
                  </header>

                  <section class="ledger-combat" aria-label="战斗面板与奇闻属性">
                    <div v-for="kind in ['attack', 'hp']" :key="kind" class="ledger-combat-stat" :class="{ 'is-manual': cardCombatMode(e, kind) === 'manual', 'is-stale': combatObservedStatus(e) === 'stale', 'is-saving': cardCombatSavingIds.has(e.id) }">
                      <div class="ledger-combat-head">
                        <span>{{ kind === 'attack' ? '⚔ 攻击' : '♡ 生命' }}</span>
                        <button
                          class="ledger-combat-mode"
                          type="button"
                          :class="{ 'is-auto': cardCombatMode(e, kind) === 'auto', 'is-manual': cardCombatMode(e, kind) === 'manual', 'is-disabled': !cardCombatModeSwitchAllowed(e, kind) }"
                          :aria-label="combatModeLabel(e, kind)"
                          :title="combatModeLabel(e, kind)"
                          :disabled="!cardCombatModeSwitchAllowed(e, kind) || cardSubmitStates[e.id] === 'submitting'"
                          @click="toggleCardCombatMode(e, kind)"
                        >
                          <Calculator v-if="cardCombatMode(e, kind) === 'auto' && cardCombatAutoAvailable(e, kind)" :size="12" stroke-width="2.2" aria-hidden="true" />
                          <ScanLine v-else :size="12" stroke-width="2.2" aria-hidden="true" />
                        </button>
                      </div>
                      <input class="ledger-combat-value" type="number" min="0" :value="cardCombatInputValue(e, kind)" :placeholder="cardCombatDisplay(e, kind)" :aria-label="e.name + (kind === 'attack' ? '攻击力' : '生命力')" :disabled="cardSubmitStates[e.id] === 'submitting'" @input="setCardCombatValue(e, kind, $event)" />
                      <small class="ledger-combat-source">{{ cardSubmitStates[e.id] === 'submitting' ? '保存中…' : cardCombatSource(e, kind) }}</small>
                      <label class="ledger-oddity"><span class="ledger-oddity-icon" aria-hidden="true">🦋</span><input type="number" min="0" :value="cardOddityValue(e, kind)" :placeholder="cardOddityMax(e, kind)" :aria-label="e.name + (kind === 'attack' ? '奇闻属性攻击力' : '奇闻属性生命值')" :disabled="cardSubmitStates[e.id] === 'submitting'" @input="setCardOddityValue(e, kind, $event)" /><span>/ {{ cardOddityMax(e, kind) || '—' }}</span></label>
                    </div>
                  </section>

                  <section class="ledger-growth" aria-label="核心养成">
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">等级</span>
                      <label class="ledger-inline-field"><span class="sr-only">等级</span><input class="ledger-editable ledger-inline-input" type="number" min="0" max="100" :value="cardGrowthValue(e, 'level')" :disabled="cardSubmitStates[e.id] === 'submitting'" aria-label="等级" @input="setGrowthInput(e, 'level', $event)" /></label>
                      <div class="ledger-step-actions"><button v-if="cardGrowthValue(e, 'level') < 100" type="button" class="ledger-popover-trigger" :class="growthActionClass(e, 'level', 5)" :disabled="cardSubmitStates[e.id] === 'submitting'" @click="openGrowthAction(e, 'level', 5)">{{ growthActionLabel(e, 'level', 5, '可 +5') }}</button><button v-else type="button" class="is-complete" disabled>已满级</button></div>
                      <div v-if="cardPopoverKey === e.id + ':level'" class="ledger-popover ledger-upgrade-popover" aria-live="polite"><p><CircleAlert :size="13" aria-hidden="true" />{{ growthTargetLabel(e, 'level') }}</p><div v-if="isGrowthPreviewBusy(e, 'level')" class="ledger-popover-state">正在核对库存与养成版本…</div><div v-else-if="growthPreviewError(e, 'level')" class="ledger-popover-state is-error">{{ growthPreviewError(e, 'level') }}<button type="button" @click="openGrowthAction(e, 'level', 5)">重试</button></div><template v-else-if="growthPreviewData(e, 'level')"><div class="ledger-material-list"><span v-for="item in growthPreviewDisplayRequirements(e, 'level')" :key="(item.entity_type || item.entityType) + ':' + item.id" :class="{ 'is-lack': growthRequirementValue(item, 'balance_after') < 0 }">{{ growthRequirementName(item, e) }} ×{{ growthRequirementValue(item, 'required') }}<small>{{ growthRequirementBalanceLabel(item) }}</small></span><em v-if="!growthPreviewDisplayRequirements(e, 'level').length">无需扣除库存道具</em></div><em v-for="reason in growthPreviewBlockingReasons(e, 'level')" :key="reason.code + ':' + reason.message" class="ledger-popover-blocked">{{ growthReasonMessage(reason) }}</em><div v-if="growthPreviewAvailable(e, 'level')" class="ledger-popover-actions"><button type="button" :disabled="isGrowthExecuteBusy(e, 'level')" @click="executeGrowthAction(e, 'level')">{{ isGrowthExecuteBusy(e, 'level') ? '正在提升…' : '确认提升并扣除库存' }}</button></div><em v-else-if="!growthPreviewBlockingReasons(e, 'level').length && !growthPreviewHasMaterialGap(e, 'level')" class="ledger-popover-blocked">当前状态无法提升</em></template>
                      </div>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">修为</span>
                      <label class="ledger-inline-field"><span class="sr-only">修为</span><input class="ledger-editable ledger-inline-input" type="number" min="0" :max="getMaxEliteForLevel(cardGrowthValue(e, 'level'))" :value="cardGrowthValue(e, 'elite')" :disabled="cardSubmitStates[e.id] === 'submitting'" aria-label="修为" @input="setGrowthInput(e, 'elite', $event)" /></label>
                      <button class="ledger-smart-action ledger-popover-trigger" :class="growthActionClass(e, 'elite', 3)" type="button" :disabled="cardSubmitStates[e.id] === 'submitting' || cardGrowthValue(e, 'elite') >= getMaxEliteForLevel(cardGrowthValue(e, 'level'))" @click="openGrowthAction(e, 'elite', 3)"><ChevronUp v-if="cardGrowthValue(e, 'elite') < getMaxEliteForLevel(cardGrowthValue(e, 'level')) && growthMaterialsReady(e, 'elite', 3)" :size="13" aria-hidden="true" />{{ cardGrowthValue(e, 'elite') >= getMaxEliteForLevel(cardGrowthValue(e, 'level')) ? '已满级' : growthActionLabel(e, 'elite', 3, '升至 ' + growthTarget(e, 'elite')) }}</button>
                      <div v-if="cardPopoverKey === e.id + ':elite'" class="ledger-popover ledger-upgrade-popover" aria-live="polite"><p><CircleAlert :size="13" aria-hidden="true" />{{ growthTargetLabel(e, 'elite') }}</p><div v-if="isGrowthPreviewBusy(e, 'elite')" class="ledger-popover-state">正在核对库存与养成版本…</div><div v-else-if="growthPreviewError(e, 'elite')" class="ledger-popover-state is-error">{{ growthPreviewError(e, 'elite') }}<button type="button" @click="openGrowthAction(e, 'elite', 3)">重试</button></div><template v-else-if="growthPreviewData(e, 'elite')"><div class="ledger-material-list"><span v-for="item in growthPreviewDisplayRequirements(e, 'elite')" :key="(item.entity_type || item.entityType) + ':' + item.id" :class="{ 'is-lack': growthRequirementValue(item, 'balance_after') < 0 }">{{ growthRequirementName(item, e) }} ×{{ growthRequirementValue(item, 'required') }}<small>{{ growthRequirementBalanceLabel(item) }}</small></span><em v-if="!growthPreviewDisplayRequirements(e, 'elite').length">无需扣除库存道具</em></div><em v-for="reason in growthPreviewBlockingReasons(e, 'elite')" :key="reason.code + ':' + reason.message" class="ledger-popover-blocked">{{ growthReasonMessage(reason) }}</em><div v-if="growthPreviewAvailable(e, 'elite')" class="ledger-popover-actions"><button type="button" :disabled="isGrowthExecuteBusy(e, 'elite')" @click="executeGrowthAction(e, 'elite')">{{ isGrowthExecuteBusy(e, 'elite') ? '正在提升…' : '确认提升并扣除库存' }}</button></div><em v-else-if="!growthPreviewBlockingReasons(e, 'elite').length && !growthPreviewHasMaterialGap(e, 'elite')" class="ledger-popover-blocked">当前状态无法提升</em></template></div>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">化极</span>
                      <button class="ledger-editable ledger-popover-trigger" type="button" :aria-expanded="cardPopoverKey === e.id + ':star-edit'" @click="openCardPopover(e, 'star-edit')">{{ starLabel(cardGrowthValue(e, 'star'), e.spOf) }}</button>
                      <button v-if="!e.spOf" class="ledger-next-action ledger-popover-trigger" :class="growthActionClass(e, 'star', 1)" type="button" :disabled="cardSubmitStates[e.id] === 'submitting' || cardGrowthValue(e, 'star') >= 31" @click="openGrowthAction(e, 'star', 1)"><ChevronUp v-if="cardGrowthValue(e, 'star') < 31 && growthMaterialsReady(e, 'star', 1)" :size="13" aria-hidden="true" />{{ cardGrowthValue(e, 'star') >= 31 ? (cardGrowthValue(e, 'star') === STAR_LEVEL_AWAKEN ? '已觉醒' : '已满级') : growthActionLabel(e, 'star', 1, '下一节点') }}</button>
                      <div v-if="cardPopoverKey === e.id + ':star-edit'" class="ledger-popover ledger-star-popover"><p><CircleAlert :size="13" aria-hidden="true" />校正化极等级与节点</p><div class="ledger-star-controls"><select :value="starDraftGroup(e)" @change="setStarDraftGroup(e, $event)"><option value="0">未拥有</option><option v-for="group in 5" :key="group" :value="group">{{ group }} 星</option><option value="31">觉醒</option></select><select v-if="!e.spOf && starDraftGroup(e) > 0 && starDraftGroup(e) < 31" :value="starDraftNode(e)" @change="setStarDraftNode(e, $event)"><option v-for="node in 6" :key="node - 1" :value="node - 1">节点 {{ node - 1 }}</option></select></div><div class="ledger-popover-actions"><button type="button" @click="cardPopoverKey = ''">完成校正</button></div></div>
                      <div v-if="!e.spOf && cardPopoverKey === e.id + ':star'" class="ledger-popover ledger-upgrade-popover" aria-live="polite"><p><CircleAlert :size="13" aria-hidden="true" />{{ growthTargetLabel(e, 'star') }} </p><div v-if="isGrowthPreviewBusy(e, 'star')" class="ledger-popover-state">正在核对库存与养成版本…</div><div v-else-if="growthPreviewError(e, 'star')" class="ledger-popover-state is-error">{{ growthPreviewError(e, 'star') }}<button type="button" @click="openGrowthAction(e, 'star', 1)">重试</button></div><template v-else-if="growthPreviewData(e, 'star')"><div class="ledger-material-list"><span v-for="item in growthPreviewDisplayRequirements(e, 'star')" :key="(item.entity_type || item.entityType) + ':' + item.id" :class="{ 'is-lack': growthRequirementValue(item, 'balance_after') < 0 }">{{ growthRequirementName(item, e) }} ×{{ growthRequirementValue(item, 'required') }}<small>{{ growthRequirementBalanceLabel(item) }}</small></span><em v-if="!growthPreviewDisplayRequirements(e, 'star').length">无需扣除库存道具</em></div><em v-for="reason in growthPreviewBlockingReasons(e, 'star')" :key="reason.code + ':' + reason.message" class="ledger-popover-blocked">{{ growthReasonMessage(reason) }}</em><div v-if="growthPreviewAvailable(e, 'star')" class="ledger-popover-actions"><button type="button" :disabled="isGrowthExecuteBusy(e, 'star')" @click="executeGrowthAction(e, 'star')">{{ isGrowthExecuteBusy(e, 'star') ? '正在提升…' : '确认提升并扣除库存' }}</button></div><em v-else-if="!growthPreviewBlockingReasons(e, 'star').length && !growthPreviewHasMaterialGap(e, 'star')" class="ledger-popover-blocked">当前状态无法提升</em></template></div>
                    </div>
                  </section>

                  <div class="ledger-destiny">
                    <div v-for="index in 2" :key="index" class="ledger-destiny-row ledger-popover-trigger" role="button" tabindex="0" :aria-expanded="cardPopoverKey === e.id + ':disc-' + (index - 1)" @click="openCardPopover(e, 'disc-' + (index - 1))" @keydown.enter.prevent="openCardPopover(e, 'disc-' + (index - 1))" @keydown.space.prevent="openCardPopover(e, 'disc-' + (index - 1))">
                      <span>命盘{{ index === 1 ? '一' : '二' }}</span>
                      <div class="ledger-destiny-values"><template v-if="cardLoadoutDiscs(e, index - 1).length"><em v-for="disc in cardLoadoutDiscs(e, index - 1)" :key="disc" class="disc-term" :class="{ 'has-description': cardDiscDescription(e, disc) }" tabindex="0" @mouseenter.stop="showDiscTooltip($event, cardDiscDescription(e, disc))" @mouseleave="hideDiscTooltip" @focus="showDiscTooltip($event, cardDiscDescription(e, disc))" @blur="hideDiscTooltip">{{ disc }}</em></template><em v-else class="empty">+ 命盘</em></div>
                      <div v-if="cardPopoverKey === e.id + ':disc-' + (index - 1)" class="ledger-popover ledger-disc-popover" @click.stop>
                        <p><CircleAlert :size="13" aria-hidden="true" />编辑命盘{{ index === 1 ? '一' : '二' }}（最多 3 个）</p>
                        <div class="ledger-disc-options">
                          <label v-for="disc in cardDiscOptions(e)" :key="discKey(disc)" class="ledger-disc-option" :class="discColorClass(disc)" @click.stop>
                            <input type="checkbox" :checked="cardDiscSelected(e, index - 1, disc)" @change.stop="toggleCardDisc(e, index - 1, disc, $event)" />
                            <span class="disc-term-label" tabindex="0" @mouseenter.stop="showDiscTooltip($event, discDescription(disc))" @mouseleave="hideDiscTooltip" @focus="showDiscTooltip($event, discDescription(disc))" @blur="hideDiscTooltip">{{ discKey(disc) }}</span>
                          </label>
                        </div>
                        <button type="button" @click.stop="cardPopoverKey = ''">完成</button>
                      </div>
                    </div>
                  </div>

                  <div class="ledger-stones" aria-label="已装备星石">
                    <button v-for="(stone, index) in cardStoneSlots(e)" :key="index" type="button" class="stone-slot ledger-popover-trigger" :class="{ 'is-empty': !stone }" :aria-label="stone ? stone.name + '，等级 ' + (stone.level || 0) : '空星石槽位'" :aria-expanded="cardPopoverKey === e.id + ':stone-' + index" @click="openCardPopover(e, 'stone-' + index)">
                      <template v-if="stone"><strong>{{ stone.name || '星石' }}</strong><small>{{ stone.level || 0 }}</small></template><span v-else>+</span>
                    </button>
                    <div v-if="cardPopoverKey.indexOf(e.id + ':stone-') === 0" class="ledger-popover ledger-stone-popover" @click.stop>
                      <template v-for="(stone, index) in cardStoneSlots(e)" :key="index">
                        <template v-if="cardPopoverKey === e.id + ':stone-' + index">
                          <p><CircleAlert :size="13" aria-hidden="true" />编辑{{ stoneSlots[index].label }}</p>
                          <select :value="cardStoneValue(e, index).name" :aria-label="stoneSlots[index].label + '名称'" @change="setCardStoneName(e, index, $event)">
                            <option value="">未装备</option>
                            <option v-for="name in cardStoneOptions(e, index)" :key="name" :value="name">{{ name }}</option>
                          </select>
                          <div class="ledger-stone-level-row">
                            <label>等级 <input type="number" min="1" max="60" :value="cardStoneValue(e, index).level || ''" :disabled="!cardStoneValue(e, index).name" @input="setCardStoneLevel(e, index, $event)" /></label>
                            <div class="ledger-stone-levels" aria-label="快捷设置星石等级"><button v-for="level in STONE_QUICK_LEVELS" :key="level" type="button" :class="{ on: cardStoneValue(e, index).level === level }" :disabled="!cardStoneValue(e, index).name" @click="setCardStoneLevel(e, index, level)">{{ level }}</button></div>
                          </div>
                          <div class="ledger-popover-actions"><button type="button" class="cancel" @click.stop="removeCardStone(e, index)">卸下</button><button type="button" @click.stop="cardPopoverKey = ''">完成</button></div>
                        </template>
                      </template>
                    </div>
                  </div>

                  <div class="ledger-card-footer">
                    <textarea :value="operatorRemark(e)" rows="2" maxlength="1000" :aria-label="e.name + '备忘'" placeholder="添加备忘…" :disabled="cardSubmitStates[e.id] === 'submitting' || annotationBusyIds.has(e.id)" @input="setOperatorRemarkDraft(e, $event.target.value)"></textarea>
                    <div class="ledger-card-actions"><template v-if="cardHasDraft(e)"><button class="ledger-card-cancel" type="button" :disabled="cardSubmitStates[e.id] === 'submitting'" @click="cancelCardDraft(e)">取消</button><button class="ledger-card-save" type="button" :disabled="cardSubmitStates[e.id] === 'submitting' || annotationBusyIds.has(e.id)" @click="saveCardDraft(e)"><Save :size="13" aria-hidden="true" />保存</button></template><button v-else class="ledger-full-edit" type="button" @click.stop="openEdit(e.id)"><Pencil :size="14" aria-hidden="true" />完整编辑</button></div>
                  </div>
                  <div v-if="cardSubmitStates[e.id]" class="ledger-submit-overlay" :class="cardSubmitStates[e.id]"><div class="ledger-submit-message"><div class="ledger-submit-icon"><span v-if="cardSubmitStates[e.id] === 'submitting'" class="ledger-submit-spinner"></span><span v-else-if="cardSubmitStates[e.id] === 'success'">✓</span><span v-else>!</span></div><strong>{{ cardSubmitStates[e.id] === 'submitting' ? '正在提交' : cardSubmitStates[e.id] === 'success' ? '已保存' : '保存失败' }}</strong><p>{{ cardSubmitStates[e.id] === 'submitting' ? '正在保存本次修改…' : cardSubmitStates[e.id] === 'success' ? '本次修改已更新' : quickNotices[e.id] || '本次修改尚未更新' }}</p><div v-if="cardSubmitStates[e.id] === 'error'" class="ledger-submit-actions"><button type="button" @click="clearCardSubmitState(e)">继续编辑</button><button type="button" class="ledger-card-save" @click="saveCardDraft(e)">重试</button></div></div></div>
                </article>
              </div>
            </div>
          </div>

          <div v-if="visitedTabs.has('tracking')" v-show="activeTab === 'tracking'" class="panel" :class="{ 'is-active': activeTab === 'tracking' }">
            <OperatorGrowthTracker
              :account-id="accountId"
              :current-entries="currentEntries"
              :catalog-entries="catalogOperators"
              :favorite-ids="favoriteAgentIds"
              :is-logged-in="auth.isLoggedIn"
              :refresh-key="subjectiveRefreshKey"
              :initial-current-items="cardMaterialStock"
              :initial-current-agents="cardHeartStock"
              :current-inventory-ready="cardMaterialLoadedAccount === accountId"
            />
          </div>

        </div>
      </section>

      <nav class="operator-mobile-tabs" role="tablist" aria-label="密探工作区">
        <button type="button" role="tab" :aria-selected="activeTab === 'catalog'" :class="{ on: activeTab === 'catalog' }" @click="setTab('catalog')">
          <BookOpen :size="19" aria-hidden="true" />
          <span>图鉴</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'current'" :class="{ on: activeTab === 'current' }" @click="setTab('current')">
          <ListChecks :size="19" aria-hidden="true" />
          <span>当前养成</span>
        </button>
        <button type="button" role="tab" :aria-selected="activeTab === 'tracking'" :class="{ on: activeTab === 'tracking' }" @click="setTab('tracking')">
          <Target :size="19" aria-hidden="true" />
          <span>养成追踪</span>
        </button>
      </nav>

      <!-- 单个密探编辑弹窗 -->
      <div v-if="editing" class="editor-mask" @click.self="closeEditor" @keydown.esc="closeEditor">
        <div
          ref="editorPanelEl"
          class="editor-panel"
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
                <h3 :id="'operator-editor-title-' + editingId">{{ editingOp.name || editingOp.id }}</h3>
                <div :id="'operator-editor-context-' + editingId" class="editor-identity-tags">
                  <span class="editor-identity-tag rarity">{{ editingOp.rarity }} 星</span>
                  <span v-if="editingOp.prof" class="editor-identity-tag">
                    <img v-if="profIcon(editingOp.prof)" :src="profIcon(editingOp.prof)" alt="" aria-hidden="true" />
                    {{ editingOp.prof }}
                  </span>
                  <span v-if="firstSubProf(editingOp)" class="editor-identity-tag profession">{{ firstSubProf(editingOp) }}</span>
                  <span v-if="editingObservedStatus === 'stale'" class="editor-identity-tag stale">观测已过期</span>
                </div>
              </div>
            </div>
            <div class="editor-head-stats">
              <div v-if="calculatedCombatStats.reason" class="editor-head-stats-toolbar">
                <span class="editor-head-stats-note">{{ calculatedCombatStats.reason }}</span>
              </div>
              <div class="editor-head-values">
                <span class="editor-head-live" role="status" aria-live="polite" aria-atomic="true">当前面板：攻击力 {{ combatAttackDisplayLabel }}，生命力 {{ combatHpDisplayLabel }}</span>
                <label class="editor-head-stat" :class="{ 'is-manual': editForm.combatStats.manualAttack != null && !combatAttackAutoVisible, 'is-empty': calculatedCombatStats.attack == null }">
                  <span class="editor-head-stat-meta"><strong>攻击</strong><small>{{ combatAttackSource }}</small><button v-if="calculatedCombatStats.automaticAttackAvailable && editForm.combatStats.manualAttack != null" type="button" class="manual-restore" :aria-label="combatAttackAutoVisible ? '恢复原手动攻击力校正' : '切换到自动计算攻击力'" :title="combatAttackAutoVisible ? '恢复原手动攻击力校正值' : '切换到自动计算攻击力'" @click.prevent.stop="toggleAutomaticCombatStat('attack')"><RotateCcw v-if="combatAttackAutoVisible" :size="11" aria-hidden="true" /><Calculator v-else :size="11" aria-hidden="true" /></button></span>
                  <input
                    :value="combatAttackInputValue"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    :placeholder="combatAttackDisplayLabel"
                    aria-label="校正攻击力，清空后恢复自动计算"
                    title="直接输入校正值；清空恢复自动计算"
                    @input="setManualCombatStat('manualAttack', $event)"
                  />
                </label>
                <label class="editor-head-stat" :class="{ 'is-manual': editForm.combatStats.manualHp != null && !combatHpAutoVisible, 'is-empty': calculatedCombatStats.hp == null }">
                  <span class="editor-head-stat-meta"><strong>生命</strong><small>{{ combatHpSource }}</small><button v-if="calculatedCombatStats.automaticHpAvailable && editForm.combatStats.manualHp != null" type="button" class="manual-restore" :aria-label="combatHpAutoVisible ? '恢复原手动生命力校正' : '切换到自动计算生命力'" :title="combatHpAutoVisible ? '恢复原手动生命力校正值' : '切换到自动计算生命力'" @click.prevent.stop="toggleAutomaticCombatStat('hp')"><RotateCcw v-if="combatHpAutoVisible" :size="11" aria-hidden="true" /><Calculator v-else :size="11" aria-hidden="true" /></button></span>
                  <input
                    :value="combatHpInputValue"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    :placeholder="combatHpDisplayLabel"
                    aria-label="校正生命力，清空后恢复自动计算"
                    title="直接输入校正值；清空恢复自动计算"
                    @input="setManualCombatStat('manualHp', $event)"
                  />
                </label>
              </div>
            </div>
            <button class="editor-close" type="button" aria-label="关闭编辑" title="关闭编辑" @click="closeEditor"><X :size="19" aria-hidden="true" /></button>
          </div>

          <div class="editor-body">
            <div class="editor-row">
              <span class="editor-label">基础养成</span>
              <div class="num-fields">
                <div class="level-row">
                  <label>等级 <input type="number" v-model.number="editForm.level" inputmode="numeric" min="0" max="100" /></label>
                  <label>修为 <input type="number" v-model.number="editForm.elite" inputmode="numeric" min="0" :max="maxEliteForLevel" /></label>
                  <span class="elite-hint">最高修为：{{ maxEliteForLevel }}</span>
                </div>
                <div class="star-card" :title="editingOp.spOf ? '0=未拥有 · 1~5=SP星级' : '0=未拥有 · 1~30=化极星级·节点（starLevel = 6×(星−1)+节点+1）· 31=觉醒'">
                  <div class="star-row">
                    <span class="star-caption">化极</span>
                    <span class="star-groups">
                      <button type="button" class="star-pill" :class="{ on: starGroupName === 'none' }" @click="pickStarGroup('none')">未拥有</button>
                      <button v-for="s in STAR_RANGE" :key="s" type="button" class="star-pill" :class="{ on: starGroupName === s }" @click="pickStarGroup(s)">{{ s }}星</button>
                      <button v-if="!editingOp.spOf" type="button" class="star-pill awaken" :class="{ on: starGroupName === 'awaken' }" @click="pickStarGroup('awaken')">觉醒</button>
                  </span>
                </div>
                  <div v-if="!editingOp.spOf && starGroupName !== 'none' && starGroupName !== 'awaken'" class="star-row">
                    <span class="star-caption">节点</span>
                    <span class="star-nodes">
                      <button v-for="n in NODE_RANGE" :key="n" type="button" class="node-chip" :class="{ on: starNode === n }" @click="pickStarNode(n)">{{ starGroupName }}-{{ n }}</button>
                    </span>
                  </div>
                </div>
                <div class="oddity-editor">
                  <strong class="oddity-caption">
                    奇闻属性
                    <small v-if="oddityCatalogIncomplete">图鉴待维护</small>
                  </strong>
                  <label v-for="key in ODDITY_KEYS" :key="key" class="oddity-field">
                    <span class="oddity-name" :title="oddityFieldName(key)">{{ oddityFieldName(key) }}</span>
                    <span class="oddity-control">
                      <input v-model.number="editForm.combatStats.oddities[key].current" type="number" inputmode="decimal" min="0" :max="editForm.combatStats.oddities[key].max" :aria-label="oddityInputLabel(key)" />
                      <span class="oddity-limit" :title="oddityLimitTitle(key)" aria-hidden="true">/ {{ oddityLimitLabel(key) }}</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div class="editor-row disc-editor-row">
              <span class="editor-label">命盘</span>
              <div class="disc-loadout-editor">
                <div class="disc-loadout-tabs" role="tablist" aria-label="命盘组合">
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
                    @keydown.left.prevent="selectDiscLoadoutTab(index - 1, true)"
                    @keydown.right.prevent="selectDiscLoadoutTab(index + 1, true)"
                  >
                    <span>组合 {{ index + 1 }}</span>
                    <strong>{{ loadout.name || '未命名组合' }}</strong>
                  </button>
                </div>

                <div
                  v-if="selectedDiscLoadout"
                  :id="'disc-loadout-panel-' + selectedDiscLoadoutIndex"
                  class="disc-loadout-panel"
                  role="tabpanel"
                  :aria-labelledby="'disc-loadout-tab-' + selectedDiscLoadoutIndex"
                >
                  <div class="disc-loadout-toolbar">
                    <label class="disc-loadout-name" :for="'disc-loadout-name-' + selectedDiscLoadoutIndex">
                      <span class="disc-loadout-name-head">
                        <span>组合名称</span>
                        <span v-if="selectedDiscLoadout.nameMode !== 'manual'" class="disc-auto-status" title="随命盘选择自动生成名称">自动命名 ON</span>
                      </span>
                      <input
                        :id="'disc-loadout-name-' + selectedDiscLoadoutIndex"
                        :value="selectedDiscLoadout.name"
                        type="text"
                        maxlength="64"
                        autocomplete="off"
                        @input="setDiscLoadoutName(selectedDiscLoadoutIndex, $event)"
                        @blur="ensureDiscLoadoutName(selectedDiscLoadoutIndex)"
                      />
                    </label>
                    <button
                      v-if="selectedDiscLoadout.nameMode === 'manual'"
                      class="disc-auto-name"
                      type="button"
                      aria-label="根据已选命盘恢复自动命名"
                      @click="resetDiscLoadoutName(selectedDiscLoadoutIndex)"
                    ><RotateCcw :size="14" aria-hidden="true" /><span>恢复自动命名</span></button>
                  </div>

                  <div class="disc-options">
                    <div class="disc-options-head">
                      <span>选择命盘</span>
                      <strong>{{ selectedDiscLoadout.discNames.length }} / 3</strong>
                    </div>
                    <p v-if="!editingDiscs.length" class="hint">该密探暂无命盘目录数据，可直接留空保存。</p>
                    <label v-for="d in editingDiscs" :key="discKey(d)" class="disc-option" :class="[discColorClass(d), { on: isDiscSelected(d) }]">
                      <input type="checkbox" :checked="isDiscSelected(d)" @change="toggleDiscSelection(d, $event)" />
                      <span class="disc-name disc-term-label" tabindex="0" @mouseenter="showDiscTooltip($event, discDescription(d))" @mouseleave="hideDiscTooltip" @focus="showDiscTooltip($event, discDescription(d))" @blur="hideDiscTooltip">{{ discKey(d) }}</span>
                    </label>
                  </div>
                </div>

                <p class="disc-storage-note">两套命盘组合和名称都会同步到云端；这里不区分当前装备。</p>
              </div>
            </div>

            <div class="editor-row">
              <span class="editor-label">星石</span>
              <div class="stone-editor">
                <div class="stone-presets">
                  <div class="stone-preset-heading">
                    <strong>载入已有预设</strong>
                    <span>主星与辅星预设分别载入</span>
                  </div>
                  <div class="stone-preset-grid">
                    <div v-for="kind in stonePresetKinds" :key="kind.id" class="stone-preset-item">
                      <label :for="'stone-preset-' + kind.id">{{ kind.label }}</label>
                      <select
                        :id="'stone-preset-' + kind.id"
                        v-model="selectedStonePresetIds[kind.id]"
                        :disabled="!stonePresetOptions[kind.id].length"
                      >
                        <option value="">{{ stonePresetOptions[kind.id].length ? '请选择预设' : '暂无可用预设' }}</option>
                        <option v-for="preset in stonePresetOptions[kind.id]" :key="preset.id" :value="String(preset.id)">{{ preset.name }}</option>
                      </select>
                      <button
                        type="button"
                        class="stone-preset-load"
                        :disabled="!selectedStonePresetIds[kind.id]"
                        @click="loadStonePreset(kind.id)"
                      >载入</button>
                    </div>
                  </div>
                </div>
                <div class="stone-current-heading">
                  <strong>当前装备中的星石</strong>
                  <span>以下内容将随密探档案保存</span>
                </div>
                <div
                  v-for="(slot, slotIndex) in stoneSlots"
                  :key="slot.type"
                  class="stone-item"
                  :class="slot.type.indexOf('main') === 0 ? 'is-main' : 'is-assist'"
                  :style="{ '--stone-grid-row': String((slotIndex % 3) + 3) }"
                >
                  <div class="stone-item-head">
                    <span class="stone-name">{{ slot.label }}</span>
                    <span v-if="editForm.stones[slot.type].name" class="stone-item-actions">
                      <span class="stone-current">Lv {{ editForm.stones[slot.type].level || 0 }}</span>
                      <button type="button" class="stone-remove" :aria-label="'卸除' + slot.label + '星石'" title="快捷卸除" @click="removeStone(slot.type)"><X :size="14" aria-hidden="true" /></button>
                    </span>
                  </div>
                  <select v-model="editForm.stones[slot.type].name" class="stone-select" :aria-label="slot.label + '名称'">
                    <option value="">未装备</option>
                    <option v-for="opt in starOptionsFor(slot.type)" :key="opt" :value="opt" :disabled="!isStarStoneAllowed(opt, editingOp)">{{ opt }}<template v-if="slot.type.indexOf('assist') === 0 && starDesc(slot.type, opt)"> · {{ starDesc(slot.type, opt) }}</template><template v-if="!isStarStoneAllowed(opt, editingOp)"> · {{ starStoneRestrictionLabel(opt) }}</template></option>
                  </select>
                  <template v-if="editForm.stones[slot.type].name">
                    <div class="stone-level-row">
                      <label class="stone-level-field">
                        <span>等级</span>
                        <input type="number" v-model.number="editForm.stones[slot.type].level" inputmode="numeric" min="1" max="60" />
                      </label>
                      <div class="stone-quick" aria-label="快捷设置等级">
                        <span>快捷设为</span>
                        <button
                          v-for="lv in STONE_QUICK_LEVELS"
                          :key="lv"
                          type="button"
                          class="stone-lv-chip"
                          :class="{ on: editForm.stones[slot.type].level === lv }"
                          :aria-label="'将' + slot.label + '设为' + lv + '级'"
                          @click="editForm.stones[slot.type].level = lv"
                        >{{ lv === 60 ? '满级' : lv + '级' }}</button>
                      </div>
                    </div>
                  </template>
                </div>
                <p class="hint">主星与辅星各 3 个；选择星石后再设置等级。</p>
              </div>
            </div>

          </div>

          <div class="editor-actions">
            <div v-if="editConflictDraft" class="editor-conflict" role="alert">
              <strong>服务器数据已更新</strong>
              <div class="editor-conflict-actions">
                <button type="button" class="editor-conflict-btn" @click="discardConflictDraft">保留服务器数据</button>
                <button type="button" class="editor-conflict-btn primary" @click="restoreConflictDraft">恢复我的修改</button>
              </div>
            </div>
            <div v-if="editNotice" class="editor-action-status" :class="{ err: editNoticeError }" role="status">{{ editNotice }}</div>
            <div class="editor-action-buttons">
              <button class="btn editor-cancel" type="button" :disabled="savingEdit" @click="closeEditor">取消</button>
              <button class="btn primary editor-save" type="button" :disabled="savingEdit" @click="saveEdit">
                <Save :size="16" aria-hidden="true" />
                {{ savingEdit ? '保存中…' : '保存到云端' }}
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
        >{{ discTooltip.text }}</div>
      </Teleport>

      <SiteFooter>
        <template #big>密探养成<br><span>图鉴 · 快照 · 归档</span></template>
        <template #fine>
          <b>YuanHub</b> · 密探养成档案<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          数据仅供参考，请以游戏内实际养成为准
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted, defineAsyncComponent } from 'vue'
import { Archive, BookOpen, Calculator, ChevronUp, CircleAlert, Download, ListChecks, Pencil, RotateCcw, Save, ScanLine, Star, Target, Upload, X } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import AccountWorkspace from '../../components/AccountWorkspace.vue'
const OperatorGrowthTracker = defineAsyncComponent(function () { return import('../../components/operator/OperatorGrowthTracker.vue') })
import {
  getOperatorCatalog,
  listOperatorAccounts,
  createOperatorAccount,
  updateOperatorAccountGame,
  renameOperatorAccount,
  deleteOperatorAccount,
  getOperatorCurrent,
  patchOperatorCurrent,
  getOperatorAnnotations,
  putOperatorAnnotation,
  previewOperatorUpgrade,
  executeOperatorUpgrade,
  importOperator,
  previewOperatorImport,
  exportOperator
} from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { auth } from '../../store/auth.js'
import { activeAccount, isAccountGame } from '../../store/activeAccount.js'
import { dialog } from '../../utils/dialog.js'
import { AGENT_CATALOG, AGENT_PROFS } from '../../data/inventory/catalog.js'
import { isOperatorOwned, matchesProfSubFilter, subProfList, subProfOptions as deriveSubProfOptions, tokens } from '../../utils/operatorFilters.js'
import {
  automaticDiscLoadoutName,
  createDiscLoadoutState
} from '../../utils/operatorDiscLoadouts.js'
import { MAIN_STAR_OPTIONS, ASSIST_STAR_OPTIONS, ASSIST_STAR_DESCRIPTIONS, STAR_STONE_RESTRICTIONS } from '../../data/starStones.js'
import { getCurrent as getInventoryCurrent, listAgentFavorites, addAgentFavorite, removeAgentFavorite } from '../../api/inventory.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import {
  calculateLevelRequirements,
  calculateStarRequirements,
  calculateXiuweiRequirements,
  netRequirement,
  starStageFromLevel,
  starLabelForStage
} from '../../data/operatorRequirements.js'
import {
  OPERATOR_ODDITY_KEYS,
  calculateOperatorCombatStats,
  combatInputSignature,
  combatStatsSourceLabel,
  normalizeOperatorCombatStats,
  normalizeOperatorOddities,
  normalizeOperatorOdditySchema
} from '../../utils/operatorCombatStats.js'
import {
  buildOperatorV3BrowserRequest,
  isOperatorV3Document,
  normalizeOperatorV3ImportResponse,
  operatorV3CommittableCount
} from '../../utils/operatorV3Import.js'

const ODDITY_KEYS = OPERATOR_ODDITY_KEYS

const activeTab = ref('catalog')
const visitedTabs = ref(new Set(['catalog']))
const manifestSearch = ref('')
const manifestFilter = ref('all')
const profFilter = ref('all')
const subProfFilter = ref('all')
const workbenchStatusFilter = ref('all')
const upgradeReadyFilter = ref('')
const favoriteFirst = ref(false)
const profOptions = AGENT_PROFS
const subProfOptions = computed(function () { return deriveSubProfOptions(catalogOperators.value) })
const workbenchStatusOptions = [
  { value: 'all', label: '全部' },
  { value: 'growing', label: '养成中' },
  { value: 'graduated', label: '已毕业' },
  { value: 'inactive', label: '养老中' }
]
const loading = ref(false)
const catalogLoading = ref(false)
const error = ref('')
const catalogError = ref('')
const catalogVersion = ref('')
const backendCatalog = ref([])
const currentEntries = ref([])
const showArchive = ref(false)
const showImport = ref(false)
const importText = ref('')
const importError = ref('')
const importing = ref(false)
const importResult = ref(null)
const importPreview = ref(null)
const importPreviewKey = ref('')
const importConfirmReview = ref(false)
const favoriteAgentIds = ref(new Set())
const favoriteBusyIds = ref(new Set())
const favoriteLoading = ref(false)
const favoriteError = ref('')
const scanEffectById = ref({})
let favoriteLoadSeq = 0
let currentLoadSeq = 0
let currentLoadedKey = ''
let favoriteLoadedAccount = ''
let accountEventRefreshTimer = null
let unsubscribeAccountEvents = null
let scanFocusSeq = 0
let finishPendingScanScroll = null
const scanEffectTimers = new Map()
const operatorSlotElements = new Map()

// 当前养成台账卡的交互状态。状态与备忘以云端 annotation 为真相源；
// localStorage 只保留迁移与断网回退用途。
const quickEditorKey = ref('')
const quickConfirmKey = ref('')
const quickDrafts = ref({})
const quickSavingIds = ref(new Set())
const quickNotices = ref({})
const workbenchStatuses = ref({})
const workbenchRemarks = ref({})
const workbenchRemarkSaving = ref(new Set())
const annotationRevisions = ref({})
const annotationBusyIds = ref(new Set())
const annotationError = ref('')
const subjectiveRefreshKey = ref(0)
let annotationLoadSeq = 0
const cardCombatDrafts = ref({})
const cardCombatModes = ref({})
const cardCombatSavingIds = ref(new Set())
const cardGrowthDrafts = ref({})
const cardPopoverKey = ref('')
const cardMaterialStock = ref({})
const cardMaterialLoading = ref(false)
let cardMaterialLoadSeq = 0
const cardMaterialLoadedAccount = ref('')
const cardSubmitStates = ref({})
const cardSubmitTimers = new Map()
const cardDraftBaselines = ref({})
const cardPopoverStep = ref(0)
const cardHeartStock = ref({})
const cardLevelBreakthroughs = ref({})
const growthPreviews = ref({})
const growthPreviewBusyKeys = ref(new Set())
const growthExecuteBusyKeys = ref(new Set())
const growthExecutionKeys = new Map()
const handledUpgradeTransactionIds = new Set()
const discTooltip = ref({ visible: false, text: '', x: 0, y: 0, placement: 'top' })

// —— 单个密探编辑弹窗 ——
const editing = ref(false)
const editingId = ref('')
const editingOp = ref(null)
const editGame = ref('')
const editForm = ref({ elite: 0, starLevel: 0, level: 0, discLoadouts: [], stones: {}, combatStats: normalizeOperatorCombatStats({}) })
const combatDisplayMode = ref({ attack: null, hp: null })
let combatDisplaySignature = ''
const selectedDiscLoadoutIndex = ref(0)
const editNotice = ref('')
const editNoticeError = ref(false)
const savingEdit = ref(false)
const editOriginalStoneSignature = ref('')
const editConflictDraft = ref(null)
const stonePresetOptions = ref({ main: [], assist: [] })
const selectedStonePresetIds = ref({ main: '', assist: '' })
const editorPanelEl = ref(null)
let bodyOverflowBeforeEditor = ''
let bodyLockedByEditor = false
let editorTriggerEl = null

// 编辑保存目标版本跟随当前子账号。
const saveGame = computed(function () {
  return gameFilter.value
})

// 首次 / 快捷导入：把当前子账号带到向导页默认选中
const quickHref = computed(function () {
  return accountId.value ? '/operator/quick?account=' + encodeURIComponent(accountId.value) : '/operator/quick'
})

// —— 统一子账号（库存 × 密探共用） ——
const accounts = ref([])
// 当前选中账号由 activeAccount store 记忆并持久化（跨页面导航 / 刷新不丢）
const accountId = computed({
  get: function () { return activeAccount.id },
  set: function (v) { activeAccount.set(v) }
})
const gameFilter = computed({
  get: function () { return activeAccount.gameFor(accountId.value) },
  set: function (v) { activeAccount.setGame(v, accountId.value) }
})

watch(function () { return [accountId.value, saveGame.value] }, function () {
  workbenchStatuses.value = readWorkbenchMap('statuses')
  workbenchRemarks.value = readWorkbenchMap('remarks')
  annotationRevisions.value = {}
  annotationError.value = ''
  cardCombatModes.value = readWorkbenchMap('combat-modes')
  favoriteFirst.value = readFavoriteFirstPreference()
  cardLevelBreakthroughs.value = {}
  upgradeReadyFilter.value = ''
  loadOperatorAnnotations()
  if (visitedTabs.value.has('current') && cardMaterialLoadedAccount.value !== accountId.value) loadCardMaterialStock()
}, { immediate: true })
const accountsLoading = ref(false)
const accountBusy = ref(false)
const accountError = ref('')
const exportAll = ref(false)
const currentAccountName = computed(function () {
  const account = accounts.value.find(function (item) { return item.id === accountId.value })
  return account ? account.name : '当前账号'
})

const importDocumentVersion = computed(function () {
  if (!importText.value.trim()) return null
  try {
    const parsed = JSON.parse(importText.value)
    const document = parsed && parsed.document ? parsed.document : parsed
    const version = Number(document && document.version)
    return Number.isInteger(version) ? version : null
  } catch (_) {
    return null
  }
})

const canCommitV3Import = computed(function () {
  if (!importPreview.value || operatorV3CommittableCount(importPreview.value) === 0) return false
  try {
    return importPreviewKey.value === JSON.stringify(v3ImportRequest(parseImportDocument(), importConfirmReview.value))
  } catch (_) {
    return false
  }
})

function toggleArchive() {
  showArchive.value = !showArchive.value
  if (!showArchive.value) showImport.value = false
}

// —— 目录归一化 ——
function normalizeOperator(op) {
  const rawSub = op.subProf || op.sub_prof || ''
  const odditySchema = normalizeOperatorOdditySchema(op.odditySchema || op.oddity_schema)
  return {
    // 优先取业务 id（operatorId），避免后端把 Mongo 内部 _id 作为 id 返回时串台
    id: op.operatorId || op.operator_id || op.id || '',
    name: op.name || '',
    alias: op.alias || '',
    rarity: op.rarity != null ? op.rarity : 3,
    prof: Array.isArray(op.prof) ? op.prof.join('、') : (op.prof || '未知'),
    subProf: subProfList({ subProf: rawSub }),
    games: op.games || op.games_list || [],
    spOf: op.spOf || op.sp_of || '',
    discs: op.discs || op.discs_list || [],
    starStones: op.starStones || op.star_stones || [],
    specialOddityName: op.specialOddityName != null ? op.specialOddityName : op.special_oddity_name,
    odditySchema: odditySchema,
    incompleteFields: op.incompleteFields || op.incomplete_fields || [],
    avatar: op.avatar || ''
  }
}

const PROF_ICON_FILES = { 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' }
function profIcon(prof) {
  const file = PROF_ICON_FILES[String(prof || '').split('、')[0]]
  return file ? import.meta.env.BASE_URL + 'assets/prof-icons/' + file : ''
}

function firstSubProf(entry) {
  return subProfList(entry)[0] || ''
}

function clearAgentFavorites() {
  favoriteLoadSeq += 1
  favoriteLoadedAccount = ''
  favoriteAgentIds.value = new Set()
  favoriteBusyIds.value = new Set()
  favoriteLoading.value = false
  favoriteError.value = ''
}

async function loadAgentFavorites() {
  if (!auth.isLoggedIn || !accountId.value) { clearAgentFavorites(); return }
  const targetAccount = accountId.value
  const seq = ++favoriteLoadSeq
  favoriteLoading.value = true
  favoriteError.value = ''
  try {
    const data = await listAgentFavorites(targetAccount)
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return
    favoriteAgentIds.value = new Set(Array.isArray(data && data.agent_ids) ? data.agent_ids : [])
    favoriteLoadedAccount = targetAccount
  } catch (err) {
    if (seq !== favoriteLoadSeq || accountId.value !== targetAccount) return
    favoriteAgentIds.value = new Set()
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
  const next = new Set(favoriteAgentIds.value)
  if (wasFavorite) next.delete(id)
  else next.add(id)
  favoriteAgentIds.value = next
  favoriteBusyIds.value = new Set(favoriteBusyIds.value).add(id)
  favoriteError.value = ''
  try {
    const data = wasFavorite
      ? await removeAgentFavorite(targetAccount, id)
      : await addAgentFavorite(targetAccount, id)
    if (accountId.value !== targetAccount) return
    const confirmed = new Set(favoriteAgentIds.value)
    const confirmedFavorite = data && typeof data.favorite === 'boolean' ? data.favorite : !wasFavorite
    if (confirmedFavorite) confirmed.add(id)
    else confirmed.delete(id)
    favoriteAgentIds.value = confirmed
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

// 编辑弹窗辅助
function discKey(d) {
  if (!d) return ''
  return d.ot_name || d.otName || ''
}

function discDescription(disc) {
  if (!disc) return ''
  return String(disc.desp || disc.description || disc.desc || '').trim()
}

function showDiscTooltip(event, description) {
  const text = String(description || '').trim()
  const target = event && event.currentTarget
  if (!text || !(target && target.getBoundingClientRect)) {
    hideDiscTooltip()
    return
  }
  const rect = target.getBoundingClientRect()
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const tooltipHalfWidth = Math.min(140, Math.max(0, (viewportWidth - 24) / 2))
  const center = rect.left + rect.width / 2
  const x = Math.max(12 + tooltipHalfWidth, Math.min(viewportWidth - 12 - tooltipHalfWidth, center))
  const placement = rect.top >= 96 ? 'top' : 'bottom'
  discTooltip.value = {
    visible: true,
    text,
    x,
    y: placement === 'top' ? rect.top - 8 : rect.bottom + 8,
    placement
  }
}

function hideDiscTooltip() {
  if (!discTooltip.value.visible) return
  discTooltip.value = Object.assign({}, discTooltip.value, { visible: false })
}

function discObject(key) {
  const d = (editingOp.value && editingOp.value.discs || []).find(function (x) { return discKey(x) === key })
  if (!d) return { ot_name: key }
  return {
    ot_name: key,
    abbreviation: d.abbreviation || null,
    color: d.color || null,
    desp: d.desp || null
  }
}

// 命盘品级色 → 按钮配色类（与后端目录 color 字段：无色 / 金 / 紫 / 蓝 对齐）
const DISC_COLOR_CLASS = { '金': 'c-gold', '紫': 'c-purple', '蓝': 'c-blue' }
const DISC_COLOR_ORDER = { '金': 0, '紫': 1, '蓝': 2 }
function discColorClass(d) {
  return (d && DISC_COLOR_CLASS[d.color]) || ''
}

function sortDiscsForPicker(discs) {
  return (Array.isArray(discs) ? discs : [])
    .map(function (disc, index) { return { disc: disc, index: index } })
    .sort(function (a, b) {
      const aOrder = DISC_COLOR_ORDER[a.disc && a.disc.color] ?? 3
      const bOrder = DISC_COLOR_ORDER[b.disc && b.disc.color] ?? 3
      const aMajorGold = isMajorGoldDisc(a.disc) ? 1 : 0
      const bMajorGold = isMajorGoldDisc(b.disc) ? 1 : 0
      return (aOrder - bOrder) || (aMajorGold - bMajorGold) || (a.index - b.index)
    })
    .map(function (entry) { return entry.disc })
}

const editingDiscs = computed(function () {
  return sortDiscsForPicker((editingOp.value && editingOp.value.discs) || [])
})

function isMajorGoldDisc(disc) {
  if (!disc || disc.color !== '金') return false
  return /(攻击力|生命).*大幅提升/.test(discKey(disc))
}

const selectedDiscLoadout = computed(function () {
  return editForm.value.discLoadouts[selectedDiscLoadoutIndex.value] || null
})

function syncDiscLoadoutAutoName(loadout) {
  if (!loadout || loadout.nameMode === 'manual') return
  loadout.name = automaticDiscLoadoutName(loadout.discNames)
}

function selectDiscLoadoutTab(index, focusTab) {
  const count = editForm.value.discLoadouts.length
  if (!count) return
  selectedDiscLoadoutIndex.value = ((Number(index) % count) + count) % count
  if (focusTab) {
    nextTick(function () {
      const tab = document.getElementById('disc-loadout-tab-' + selectedDiscLoadoutIndex.value)
      if (tab) tab.focus()
    })
  }
}

function setDiscLoadoutName(index, event) {
  const loadout = editForm.value.discLoadouts[index]
  if (!loadout) return
  loadout.name = String(event && event.target ? event.target.value : '')
  loadout.nameMode = 'manual'
}

function ensureDiscLoadoutName(index) {
  const loadout = editForm.value.discLoadouts[index]
  if (!loadout || String(loadout.name || '').trim()) return
  loadout.nameMode = 'auto'
  syncDiscLoadoutAutoName(loadout)
}

function resetDiscLoadoutName(index) {
  const loadout = editForm.value.discLoadouts[index]
  if (!loadout) return
  loadout.nameMode = 'auto'
  syncDiscLoadoutAutoName(loadout)
}

function isDiscSelected(disc) {
  const loadout = selectedDiscLoadout.value
  return !!loadout && loadout.discNames.indexOf(discKey(disc)) !== -1
}

function toggleDiscSelection(disc, event) {
  const loadout = selectedDiscLoadout.value
  const key = discKey(disc)
  if (!loadout || !key) return
  const index = loadout.discNames.indexOf(key)
  if (index !== -1) {
    loadout.discNames.splice(index, 1)
  } else if (loadout.discNames.length >= 3) {
    if (event && event.target) event.target.checked = false
    editNotice.value = '每套命盘组合最多选择 3 个'
    editNoticeError.value = true
    return
  } else {
    loadout.discNames.push(key)
  }
  syncDiscLoadoutAutoName(loadout)
  if (editNotice.value === '每套命盘组合最多选择 3 个') {
    editNotice.value = ''
    editNoticeError.value = false
  }
}

function initialDiscLoadoutState(existing) {
  const serverLoadouts = Array.isArray(existing.discLoadouts) ? existing.discLoadouts : []
  // 新接口没有 active/current 语义；数组顺序就是命盘一、命盘二。
  // 旧数据只提供 discs 时，统一把它映射为第一套命盘。
  return createDiscLoadoutState(serverLoadouts, existing.discs, 0)
}

const COMBAT_STATS_STORAGE_PREFIX = 'yuanhub:operator-combat-stats:v1'
const COMBAT_DISPLAY_MODE_STORAGE_PREFIX = 'yuanhub:operator-combat-display-mode:v1'
function combatStatsStorageKey(id) {
  return [COMBAT_STATS_STORAGE_PREFIX, accountId.value, saveGame.value, id || editingId.value].join(':')
}

function combatDisplayModeStorageKey(id) {
  return [COMBAT_DISPLAY_MODE_STORAGE_PREFIX, accountId.value, saveGame.value, id || editingId.value].join(':')
}

function loadCombatDisplayMode(id) {
  if (typeof localStorage === 'undefined') return { attack: null, hp: null }
  try {
    const raw = localStorage.getItem(combatDisplayModeStorageKey(id))
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      attack: parsed.attack === 'auto' || parsed.attack === 'manual' ? parsed.attack : null,
      hp: parsed.hp === 'auto' || parsed.hp === 'manual' ? parsed.hp : null
    }
  } catch (_) {
    return { attack: null, hp: null }
  }
}

function persistCombatDisplayMode(id) {
  if (typeof localStorage === 'undefined') return false
  try {
    localStorage.setItem(combatDisplayModeStorageKey(id), JSON.stringify({
      attack: editForm.value.combatStats && editForm.value.combatStats.manualAttack != null && calculatedCombatStats.value.automaticAttackAvailable
        ? (combatAttackAutoVisible.value ? 'auto' : 'manual')
        : null,
      hp: editForm.value.combatStats && editForm.value.combatStats.manualHp != null && calculatedCombatStats.value.automaticHpAvailable
        ? (combatHpAutoVisible.value ? 'auto' : 'manual')
        : null
    }))
    return true
  } catch (_) {
    return false
  }
}

function loadCachedCombatStats(id) {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(combatStatsStorageKey(id))
    return raw ? normalizeOperatorCombatStats(JSON.parse(raw)) : null
  } catch (_) {
    return null
  }
}

function persistCombatStats(id) {
  if (typeof localStorage === 'undefined' || !editForm.value.combatStats) return false
  try {
    localStorage.setItem(combatStatsStorageKey(id), JSON.stringify({
      attack: editForm.value.combatStats.attack,
      hp: editForm.value.combatStats.hp,
      manualAttack: editForm.value.combatStats.manualAttack,
      manualHp: editForm.value.combatStats.manualHp,
      curios: editForm.value.combatStats.curios,
      oddities: editForm.value.combatStats.oddities,
      source: editForm.value.combatStats.source,
      observedInputs: { signature: calculatedCombatStats.value.inputSignature },
      observedAt: editForm.value.combatStats.observedAt,
      rulesVersion: 'wiki-panel-2026-03'
    }))
    return true
  } catch (_) {
    return false
  }
}

const stoneSlots = computed(function () {
  return [
    { type: 'main1', label: '主星 1' },
    { type: 'main2', label: '主星 2' },
    { type: 'main3', label: '主星 3' },
    { type: 'assist1', label: '辅星 1' },
    { type: 'assist2', label: '辅星 2' },
    { type: 'assist3', label: '辅星 3' }
  ]
})

const stonePresetKinds = [
  { id: 'main', label: '主星预设' },
  { id: 'assist', label: '辅星预设' }
]

function starOptionsFor(type) {
  const options = type.indexOf('assist') === 0 ? ASSIST_STAR_OPTIONS : MAIN_STAR_OPTIONS
  const available = options.filter(function (name) { return isStarStoneAllowed(name, editingOp.value) })
  const current = editForm.value.stones[type] && editForm.value.stones[type].name
  // 历史数据即使不符合新限制也要保留在选择框中，避免打开编辑器时静默清空。
  if (current && options.indexOf(current) !== -1 && available.indexOf(current) === -1) return [current].concat(available)
  return available
}

function isStarStoneAllowed(name, operator) {
  const restriction = STAR_STONE_RESTRICTIONS[name]
  if (!restriction || !operator) return true
  if (restriction.subProf) {
    const subProfs = subProfList(operator)
    if (subProfs.length && !restriction.subProf.some(function (value) { return subProfs.indexOf(value) !== -1 })) return false
  }
  if (restriction.prof) {
    const profs = tokens(operator.prof)
    if (profs.length && !restriction.prof.some(function (value) { return profs.indexOf(value) !== -1 })) return false
  }
  return true
}

function starStoneRestrictionLabel(name) {
  const restriction = STAR_STONE_RESTRICTIONS[name]
  if (!restriction) return ''
  if (restriction.subProf) return '仅' + restriction.subProf.join(' / ')
  if (restriction.prof) return '仅' + restriction.prof.join(' / ') + '属性'
  return ''
}

function starDesc(type, name) {
  if (type.indexOf('assist') !== 0) return ''
  return ASSIST_STAR_DESCRIPTIONS[name] || ''
}

function removeStone(type) {
  if (!editForm.value.stones[type]) return
  editForm.value.stones[type].name = ''
  editForm.value.stones[type].level = 0
  editForm.value.stones[type].rarity = null
}

function loadStonePreset(kind) {
  const presetId = selectedStonePresetIds.value[kind]
  const preset = (stonePresetOptions.value[kind] || []).find(function (item) {
    return String(item.id) === String(presetId)
  })
  if (!preset || !Array.isArray(preset.stones)) return
  for (let index = 0; index < 3; index += 1) {
    const type = kind + (index + 1)
    const stone = preset.stones[index] || {}
    editForm.value.stones[type] = {
      name: stone.name || '',
      type: type,
      level: Number(stone.level) || 0
    }
  }
  editNotice.value = '已载入「' + preset.name + '」' + (kind === 'main' ? '主星' : '辅星') + '预设'
  editNoticeError.value = false
}

// 修为不能超过当前等级上限，等级变化时自动修正
watch(
  function () { return editForm.value.level },
  function (level) {
    const max = getMaxEliteForLevel(level)
    if (editForm.value.elite > max) {
      editForm.value.elite = max
      editNotice.value = '修为已随等级自动调整为 ' + max + '（当前等级上限）'
      editNoticeError.value = false
    }
  }
)

watch(editing, async function (isOpen) {
  if (isOpen) {
    bodyOverflowBeforeEditor = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    bodyLockedByEditor = true
    await nextTick()
    if (editorPanelEl.value) editorPanelEl.value.focus()
    return
  }
  if (bodyLockedByEditor) {
    document.body.style.overflow = bodyOverflowBeforeEditor
    bodyLockedByEditor = false
  }
})

const catalogOperators = computed(function () {
  if (backendCatalog.value.length) return backendCatalog.value.map(normalizeOperator)
  // 后端不可达时的本地兜底：库存角色目录已含 id/name/稀有度/属性，足够展示基础图鉴
  return AGENT_CATALOG.map(function (e) {
    return {
      id: e.id,
      name: e.name,
      alias: '',
      rarity: e.rarity || 3,
      prof: e.prof || '未知',
      subProf: e.subProf || '',
      games: ['如鸢', '代号鸢'],
      discs: [],
      starStones: [],
      specialOddityName: null,
      odditySchema: normalizeOperatorOdditySchema(),
      incompleteFields: ['special_oddity_name'],
      avatar: ''
    }
  })
})

const catalogMap = computed(function () {
  const m = {}
  catalogOperators.value.forEach(function (op) { m[op.id] = op })
  return m
})

const catalogCount = computed(function () {
  return catalogOperators.value.filter(function (op) { return matchesGame(op, gameFilter.value) }).length
})

function normalizeEntry(e, odditySchema) {
  e = e || {}
  const hasCombatStats = Object.prototype.hasOwnProperty.call(e, 'combat_stats') || Object.prototype.hasOwnProperty.call(e, 'combatStats') || Object.prototype.hasOwnProperty.call(e, 'stats')
  return {
    elite: e.elite != null ? e.elite : 0,
    starLevel: e.starLevel != null ? e.starLevel : (e.star_level != null ? e.star_level : 0),
    level: e.level != null ? e.level : 0,
    discs: e.discs || [],
    discLoadouts: e.discLoadouts || e.disc_loadouts || [],
    starStones: (e.starStones || e.star_stones || []).map(function (s) {
      return Object.assign({}, s, { type: normalizeStoneType(s.type) })
    }),
    revision: e.revision != null ? Number(e.revision) || 0 : 0,
    updatedAt: e.updatedAt || e.updated_at || null,
    combatStatsPresent: hasCombatStats,
    combatStats: normalizeOperatorCombatStats(e.combatStats || e.combat_stats || e.stats || e, odditySchema),
    listedBaselineAt: e.listedBaselineAt || e.listed_baseline_at || null
  }
}

// 修为与等级关系（参考 MaaYuan-Share-frontend operatorRequirementModel）：
// 每 5 级增加 1 点修为上限，100 级时上限为 17。
const OPERATOR_LEVEL_MAX = 100
const OPERATOR_ELITE_MAX = 17

function getMaxEliteForLevel(level) {
  const normalizedLevel = Math.min(
    OPERATOR_LEVEL_MAX,
    Math.max(0, Math.trunc(Number(level) || 0))
  )
  return Math.min(
    OPERATOR_ELITE_MAX,
    Math.max(0, Math.floor(normalizedLevel / 5) - 3)
  )
}

// 修为材料按密探属性归入三类职业；与养成追踪组件保持同一映射。
function xiuweiJob(prof) {
  const first = String(prof || '').split('、')[0]
  return ['风', '火'].includes(first) ? 'fh' : ['水', '地'].includes(first) ? 'ds' : 'yy'
}

const maxEliteForLevel = computed(function () {
  return getMaxEliteForLevel(editForm.value.level)
})

const combatStatsInput = computed(function () {
  return {
    operatorName: editingOp.value && editingOp.value.name,
    level: editForm.value.level,
    elite: editForm.value.elite,
    starLevel: editForm.value.starLevel,
    stones: editForm.value.stones,
    oddities: editForm.value.combatStats && editForm.value.combatStats.oddities
  }
})

const calculatedCombatStats = computed(function () {
  return calculateOperatorCombatStats({
    stored: editForm.value.combatStats,
    input: combatStatsInput.value
  })
})

const combatAttackAutoVisible = computed(function () {
  if (!calculatedCombatStats.value.automaticAttackAvailable) return false
  return combatDisplayMode.value.attack === 'auto' || (
    combatDisplayMode.value.attack !== 'manual' && calculatedCombatStats.value.manualFallbackAvailable
  )
})

const combatHpAutoVisible = computed(function () {
  if (!calculatedCombatStats.value.automaticHpAvailable) return false
  return combatDisplayMode.value.hp === 'auto' || (
    combatDisplayMode.value.hp !== 'manual' && calculatedCombatStats.value.manualFallbackAvailable
  )
})

const combatAttackDisplayLabel = computed(function () {
  return combatAttackAutoVisible.value ? calculatedCombatStats.value.automaticAttackLabel : calculatedCombatStats.value.attackLabel
})

const combatHpDisplayLabel = computed(function () {
  return combatHpAutoVisible.value ? calculatedCombatStats.value.automaticHpLabel : calculatedCombatStats.value.hpLabel
})

const combatStatsSource = computed(function () {
  return combatStatsSourceLabel(calculatedCombatStats.value.source, calculatedCombatStats.value.status)
})

const combatAttackSource = computed(function () {
  if (combatAttackAutoVisible.value) return '自动计算'
  if (editForm.value.combatStats && editForm.value.combatStats.manualAttack != null) return '手动校正'
  if (calculatedCombatStats.value.breakdown) return '自动计算'
  return calculatedCombatStats.value.attack == null ? '可手动校正' : combatStatsSource.value
})

const combatHpSource = computed(function () {
  if (combatHpAutoVisible.value) return '自动计算'
  if (editForm.value.combatStats && editForm.value.combatStats.manualHp != null) return '手动校正'
  if (calculatedCombatStats.value.breakdown) return '自动计算'
  return calculatedCombatStats.value.hp == null ? '可手动校正' : combatStatsSource.value
})

const oddityCatalogIncomplete = computed(function () {
  const op = editingOp.value
  if (!op) return false
  return !op.specialOddityName || (Array.isArray(op.incompleteFields) && op.incompleteFields.indexOf('special_oddity_name') !== -1)
})

function setManualCombatStat(key, event) {
  if (!editForm.value.combatStats) editForm.value.combatStats = normalizeOperatorCombatStats({})
  const raw = event && event.target ? event.target.value : ''
  combatDisplayMode.value[key === 'manualAttack' ? 'attack' : 'hp'] = 'manual'
  editForm.value.combatStats[key] = raw === '' ? null : Number(raw)
  editForm.value.combatStats.source = 'manual'
  if (raw !== '') markCombatCorrectionCurrent()
}

const combatAttackInputValue = computed(function () {
  if (combatAttackAutoVisible.value) return ''
  return editForm.value.combatStats && editForm.value.combatStats.manualAttack != null ? editForm.value.combatStats.manualAttack : ''
})

const combatHpInputValue = computed(function () {
  if (combatHpAutoVisible.value) return ''
  return editForm.value.combatStats && editForm.value.combatStats.manualHp != null ? editForm.value.combatStats.manualHp : ''
})

function markCombatCorrectionCurrent() {
  const signature = combatInputSignature(combatStatsInput.value)
  editForm.value.combatStats.observedInputs = { signature: signature }
  editForm.value.combatStats.combatInputSignature = signature
  editForm.value.combatStats.frontendObservedSignature = signature
  editForm.value.combatStats.observedStatus = 'valid'
}

function toggleAutomaticCombatStat(key) {
  const currentlyAutomatic = key === 'attack' ? combatAttackAutoVisible.value : combatHpAutoVisible.value
  combatDisplayMode.value[key] = currentlyAutomatic ? 'manual' : 'auto'
}

watch(function () { return combatInputSignature(combatStatsInput.value) }, function (signature) {
  if (combatDisplaySignature && combatDisplaySignature !== signature) {
    combatDisplayMode.value = { attack: null, hp: null }
  }
  combatDisplaySignature = signature
})

function ensureOperatorOddities(stats, op) {
  if (!stats || !stats.oddities || typeof stats.oddities !== 'object') return
  stats.oddities = normalizeOperatorOddities(stats.oddities, stats.curios, op && op.odditySchema)
}

function oddityFieldName(key) {
  const schema = editingOp.value && editingOp.value.odditySchema
  return (schema && schema[key] && schema[key].name) || key
}

function oddityLimitLabel(key) {
  const oddity = editForm.value.combatStats && editForm.value.combatStats.oddities[key]
  return oddity && oddity.max != null ? oddity.max : '—'
}

function oddityInputLabel(key) {
  const max = oddityLimitLabel(key)
  return oddityFieldName(key) + '当前值' + (max === '—' ? '，公共图鉴暂无上限' : '，上限' + max)
}

function oddityLimitTitle(key) {
  const max = oddityLimitLabel(key)
  return max === '—' ? '等待公共图鉴返回上限' : '公共图鉴上限 ' + max
}

// 星级（starLevel）映射，与后端 OperatorService.MAX_STAR_LEVEL 对齐：
// 0 = 未拥有；1..30 = 6×(星−1)+节点+1（1星·0 .. 5星·5，5星·5 = 30）；31 = 觉醒（仅一档）。
const MAX_STAR_LEVEL = 31
const STAR_LEVEL_AWAKEN = 31
const STAR_RANGE = [1, 2, 3, 4, 5]
const NODE_RANGE = [0, 1, 2, 3, 4, 5]
// 星石快捷等级（星石最高 60 级）
const STONE_QUICK_LEVELS = [40, 50, 60]

function starLabel(v, spOf) {
  const n = Number(v) || 0
  if (n === 0) return '未拥有'
  if (spOf) return n + ' 星'
  if (n === STAR_LEVEL_AWAKEN) return '觉醒'
  if (n >= 1 && n <= 30) {
    const star = Math.floor((n - 1) / 6) + 1
    const node = (n - 1) % 6
    return star + ' ⭐ · ' + node + ' 节点'
  }
  return n
}

// 星级分段胶囊 + 节点胶囊：把一维 starLevel 拆成「星级分组 + 节点」二维状态
const starGroupName = computed(function () {
  const v = Number(editForm.value.starLevel) || 0
  if (v === 0) return 'none'
  if (editingOp.value && editingOp.value.spOf) return v
  if (v === STAR_LEVEL_AWAKEN) return 'awaken'
  if (v >= 1 && v <= 30) return Math.floor((v - 1) / 6) + 1
  return 'none'
})
const starNode = computed(function () {
  const v = Number(editForm.value.starLevel) || 0
  if (v >= 1 && v <= 30) return (v - 1) % 6
  return 0
})

function pickStarGroup(g) {
  if (g === 'none') { editForm.value.starLevel = 0; return }
  if (g === 'awaken') { editForm.value.starLevel = STAR_LEVEL_AWAKEN; return }
  const s = Number(g)
  if (!(s >= 1 && s <= 5)) return
  if (editingOp.value && editingOp.value.spOf) { editForm.value.starLevel = s; return }
  editForm.value.starLevel = 6 * (s - 1) + starNode.value + 1
}

function pickStarNode(n) {
  const s = starGroupName.value
  if (typeof s !== 'number') return
  editForm.value.starLevel = 6 * (s - 1) + Number(n) + 1
}

// 旧协议仅用 main/assist；新前端按 3 主星 + 3 辅星槽位保存为 main1..3 / assist1..3
function normalizeStoneType(type) {
  if (type === 'main') return 'main1'
  if (type === 'assist') return 'assist1'
  return type || ''
}

// 版本匹配：item 可以是目录项或当前养成项；未声明 games 视为通用/通配。
function matchesGame(item, game) {
  if (game === 'all') return true
  const games = item && (item.games || [])
  if (!games || games.length === 0) return true
  return games.indexOf(game) !== -1
}

const currentMap = computed(function () {
  const m = {}
  currentEntries.value.forEach(function (e) { m[e.id] = e })
  return m
})

// 图鉴顶部统计口径（不跟随属性/职业/搜索/已拥有筛选）：仅按游戏过滤的全量
const statsEntries = computed(function () {
  const state = currentMap.value
  return catalogOperators.value
    .map(function (op) {
      const build = state[op.id]
      const owned = isOperatorOwned(build)
      return Object.assign({}, op, { owned: owned })
    })
    .filter(function (e) { return matchesGame(e, gameFilter.value) })
})
const manifestOwned = computed(function () {
  return statsEntries.value.filter(function (e) { return e.owned }).length
})
const manifestMissing = computed(function () { return statsEntries.value.length - manifestOwned.value })
const manifestPercent = computed(function () {
  if (!statsEntries.value.length) return '0%'
  return Math.round(manifestOwned.value * 100 / statsEntries.value.length) + '%'
})

// 图鉴展示列表：在全量基础上叠加 属性/职业/搜索/已拥有 筛选
const manifestEntries = computed(function () {
  const state = currentMap.value
  const q = manifestSearch.value.toLowerCase()
  const f = manifestFilter.value
  return catalogOperators.value
    .map(function (op) {
      const build = state[op.id]
      const owned = isOperatorOwned(build)
      return Object.assign({}, op, {
        owned: owned,
        elite: build ? build.elite : 0,
        starLevel: build ? build.starLevel : 0,
        level: build ? build.level : 0
      })
    })
    .filter(function (e) {
      if (!matchesGame(e, gameFilter.value)) return false
      if (!matchesProfSubFilter(e, profFilter.value, subProfFilter.value)) return false
      if (f === 'owned' && !e.owned) return false
      if (f === 'missing' && e.owned) return false
      if (q) {
        const hay = [e.name, e.alias, e.id, e.prof, e.subProf].filter(Boolean).join(' ').toLowerCase()
        if (hay.indexOf(q) === -1) return false
      }
      return true
    })
    .sort(function (a, b) {
      return operatorReleaseOrder(b.id) - operatorReleaseOrder(a.id) || String(a.name).localeCompare(String(b.name), 'zh-CN')
    })
})

function operatorReleaseOrder(id) {
  const match = String(id || '').match(/char_(\d+)/)
  return match ? Number(match[1]) : -1
}

// 筛选条件摘要（用于空态提示）
const filterSuffix = computed(function () {
  const parts = []
  if (manifestSearch.value) parts.push('「' + manifestSearch.value + '」')
  parts.push('版本「' + gameFilter.value + '」')
  if (profFilter.value !== 'all') parts.push('属性「' + profFilter.value + '」')
  if (subProfFilter.value !== 'all') parts.push('职业「' + subProfFilter.value + '」')
  if (manifestFilter.value === 'owned') parts.push('「已拥有」')
  if (manifestFilter.value === 'missing') parts.push('「未拥有」')
  return parts.length ? parts.join(' · ') : ''
})

// 当前养成首要口径：只展示已拥有，再叠加属性 / 职业筛选。
const ownedCurrentEntries = computed(function () {
  return currentEntries.value.filter(isOperatorOwned)
})

const currentStatusCounts = computed(function () {
  return ownedCurrentEntries.value.reduce(function (counts, entry) {
    const status = operatorStatus(entry)
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1
    return counts
  }, { growing: 0, graduated: 0, inactive: 0 })
})

const CURRENT_STATUS_ORDER = { growing: 0, graduated: 1, inactive: 2 }
const CURRENT_PROF_ORDER = { '地': 0, '水': 1, '火': 2, '风': 3, '阳': 4, '阴': 5, '混沌': 6 }

function compareCurrentEntries(a, b) {
  let difference = (CURRENT_STATUS_ORDER[operatorStatus(a)] ?? 99) - (CURRENT_STATUS_ORDER[operatorStatus(b)] ?? 99)
  if (difference) return difference

  // 特别关注只在同一养成状态内提前，不打破“养成中 → 已毕业 → 不养成”的主分组。
  if (favoriteFirst.value) {
    difference = Number(favoriteAgentIds.value.has(b.id)) - Number(favoriteAgentIds.value.has(a.id))
    if (difference) return difference
  }

  difference = (Number(b.rarity) || 0) - (Number(a.rarity) || 0)
  if (difference) return difference
  difference = (Number(b.level) || 0) - (Number(a.level) || 0)
  if (difference) return difference
  // starLevel 本身包含大星与小节点进度，可直接作为完整化极标量比较。
  difference = (Number(b.starLevel) || 0) - (Number(a.starLevel) || 0)
  if (difference) return difference
  difference = (CURRENT_PROF_ORDER[a.prof] ?? 99) - (CURRENT_PROF_ORDER[b.prof] ?? 99)
  if (difference) return difference
  difference = operatorReleaseOrder(b.id) - operatorReleaseOrder(a.id)
  if (difference) return difference
  return String(a.name || a.id).localeCompare(String(b.name || b.id), 'zh-CN')
}

const upgradeReadyGroups = computed(function () {
  const groups = { growth: [], level: [], elite: [], huaji: [], favoriteHuaji: [] }
  if (cardMaterialLoadedAccount.value !== accountId.value) return groups
  ownedCurrentEntries.value.forEach(function (entry) {
    const status = operatorStatus(entry)
    if (status === 'growing') {
      const levelReady = quickGrowthActionAvailable(entry, 'level', 5)
      const eliteReady = quickGrowthActionAvailable(entry, 'elite', 3)
      if (levelReady) groups.level.push(entry)
      if (eliteReady) groups.elite.push(entry)
      if (levelReady || eliteReady) groups.growth.push(entry)
    }
    if (quickGrowthActionAvailable(entry, 'star', 1)) {
      groups.huaji.push(entry)
      if (favoriteAgentIds.value.has(entry.id)) groups.favoriteHuaji.push(entry)
    }
  })
  return groups
})

const growthReadyCount = computed(function () { return upgradeReadyGroups.value.growth.length })
const huajiReadyCount = computed(function () { return upgradeReadyGroups.value.huaji.length })
const growthReadySummary = computed(function () {
  return '等级可提升 ' + upgradeReadyGroups.value.level.length + ' 位 · 修为可提升 ' + upgradeReadyGroups.value.elite.length + ' 位。'
})
const favoriteHuajiNames = computed(function () {
  return upgradeReadyGroups.value.favoriteHuaji.map(function (entry) { return entry.name || entry.id })
})
const activeUpgradeReadyIds = computed(function () {
  const entries = upgradeReadyFilter.value === 'growth'
    ? upgradeReadyGroups.value.growth
    : upgradeReadyFilter.value === 'huaji'
      ? upgradeReadyGroups.value.huaji
      : []
  return new Set(entries.map(function (entry) { return entry.id }))
})

const filteredCurrent = computed(function () {
  return ownedCurrentEntries.value.filter(function (e) {
    return matchesProfSubFilter(e, profFilter.value, subProfFilter.value) &&
      (workbenchStatusFilter.value === 'all' || operatorStatus(e) === workbenchStatusFilter.value) &&
      (!upgradeReadyFilter.value || activeUpgradeReadyIds.value.has(e.id))
  }).sort(compareCurrentEntries)
})

const currentFilterSuffix = computed(function () {
  const parts = []
  parts.push('版本「' + gameFilter.value + '」')
  if (profFilter.value !== 'all') parts.push('属性「' + profFilter.value + '」')
  if (subProfFilter.value !== 'all') parts.push('职业「' + subProfFilter.value + '」')
  if (workbenchStatusFilter.value !== 'all') parts.push('状态「' + statusLabel(workbenchStatusFilter.value) + '」')
  if (upgradeReadyFilter.value === 'growth') parts.push('「等级/修为可提升」')
  if (upgradeReadyFilter.value === 'huaji') parts.push('「可提升化极」')
  return parts.length ? parts.join(' · ') : '当前条件'
})

const hasCurrentFilters = computed(function () {
  return profFilter.value !== 'all' || subProfFilter.value !== 'all' || workbenchStatusFilter.value !== 'all' || Boolean(upgradeReadyFilter.value)
})

function resetCurrentFilters() {
  profFilter.value = 'all'
  subProfFilter.value = 'all'
  workbenchStatusFilter.value = 'all'
  upgradeReadyFilter.value = ''
}

function toggleUpgradeReadyFilter(filter) {
  if (upgradeReadyFilter.value === filter) {
    upgradeReadyFilter.value = ''
    return
  }
  resetCurrentFilters()
  upgradeReadyFilter.value = filter
}

function setWorkbenchStatusFilter(value) {
  workbenchStatusFilter.value = value
  upgradeReadyFilter.value = ''
}

function monogram(e) {
  const s = String(e.name || e.id || '?')
  return Array.from(s)[0] || '?'
}

// 养成卡（currentEntries 系列快照）没有目录字段，按 id 回查目录拿到头像
function avOf(id) {
  const op = catalogMap.value[id]
  return (op && op.avatar) || ''
}

function slotTitle(e) {
  const parts = [e.name || e.id]
  if (e.owned) parts.push('修为 ' + e.elite + ' · ' + starLabel(e.starLevel, e.spOf) + ' · Lv' + e.level)
  else parts.push('未拥有')
  if (e.prof) parts.push(e.prof)
  return parts.join(' ｜ ')
}

function loadoutSummary(loadout, legacyDiscs) {
  const source = loadout || (legacyDiscs && legacyDiscs.length ? { discs: legacyDiscs } : null)
  if (!source) return '未配置'
  const discs = Array.isArray(source.discNames) ? source.discNames : (Array.isArray(source.discs) ? source.discs.map(discKey).filter(Boolean) : [])
  return (source.name || (discs.length ? discs.join('、') : '未配置')) + (discs.length && source.name ? ' · ' + discs.join('、') : '')
}

function hasCombatValue(entry) {
  const stats = entry && entry.combatStats
  return !!stats && (stats.attack != null || stats.hp != null)
}

function combatObservedStatus(entry) {
  const stats = entry && entry.combatStats
  return stats && (stats.observedStatus || stats.observed_status)
}

const editingObservedStatus = computed(function () {
  return combatObservedStatus(currentMap.value[editingId.value])
})

function stoneSignature(stones) {
  return Object.keys(stones || {}).sort().map(function (type) {
    const stone = stones[type] || {}
    return [type, String(stone.name || ''), Number(stone.level) || 0, Number(stone.rarity) || 0].join(':')
  }).join('|')
}

function stoneSummary(stones) {
  if (!Array.isArray(stones) || !stones.length) return '未配置'
  return stones.map(function (stone) {
    return (stone.name || stone.type || '未命名') + (stone.level != null ? ' Lv' + stone.level : '')
  }).join('、')
}

function workbenchStorageKey(kind) {
  return 'yuanhub:operator-workbench:' + kind + ':' + (accountId.value || 'guest') + ':' + saveGame.value
}

function readWorkbenchMap(kind) {
  if (typeof localStorage === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(workbenchStorageKey(kind)) || '{}') || {} } catch (_) { return {} }
}

function persistWorkbenchMap(kind, value) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(workbenchStorageKey(kind), JSON.stringify(value))
}

const ANNOTATION_STATE_TO_API = { growing: 'active', graduated: 'graduated', inactive: 'skip' }
const ANNOTATION_STATE_FROM_API = { active: 'growing', graduated: 'graduated', skip: 'inactive' }

function annotationMigrationKey(account) {
  return 'yuanhub:operator-annotations-migrated:v1:' + account
}

function annotationRevision(item) {
  return Number(item && item.revision) || 0
}

function applyAnnotationItem(item) {
  const id = item && (item.operator_id || item.operatorId)
  if (!id) return
  const apiState = item.growth_state || item.growthState || 'active'
  const note = item.note == null ? '' : String(item.note)
  workbenchStatuses.value = Object.assign({}, workbenchStatuses.value, { [id]: ANNOTATION_STATE_FROM_API[apiState] || 'growing' })
  workbenchRemarks.value = Object.assign({}, workbenchRemarks.value, { [id]: note })
  annotationRevisions.value = Object.assign({}, annotationRevisions.value, { [id]: annotationRevision(item) })
}

async function migrateLocalAnnotations(targetAccount, remoteIds) {
  if (typeof localStorage === 'undefined' || localStorage.getItem(annotationMigrationKey(targetAccount)) === 'done') return
  const localStatuses = readWorkbenchMap('statuses')
  const localRemarks = readWorkbenchMap('remarks')
  const ids = new Set(Object.keys(localStatuses).concat(Object.keys(localRemarks)))
  const candidates = Array.from(ids).filter(function (id) {
    if (remoteIds.has(id)) return false
    const state = localStatuses[id] || 'growing'
    const note = localRemarks[id] == null ? '' : String(localRemarks[id]).trim()
    return state !== 'growing' || !!note
  })
  for (const id of candidates) {
    const state = localStatuses[id] || 'growing'
    const note = localRemarks[id] == null || String(localRemarks[id]).trim() === '' ? null : String(localRemarks[id])
    const item = await putOperatorAnnotation({
      accountId: targetAccount,
      operatorId: id,
      annotation: {
        growth_state: ANNOTATION_STATE_TO_API[state] || 'active',
        note: note,
        expected_revision: 0
      }
    })
    if (accountId.value !== targetAccount) return
    applyAnnotationItem(item)
  }
  localStorage.setItem(annotationMigrationKey(targetAccount), 'done')
}

async function loadOperatorAnnotations() {
  if (!auth.isLoggedIn || !accountId.value) {
    annotationLoadSeq += 1
    annotationRevisions.value = {}
    return
  }
  const targetAccount = accountId.value
  const seq = ++annotationLoadSeq
  annotationError.value = ''
  try {
    const data = await getOperatorAnnotations(targetAccount)
    if (seq !== annotationLoadSeq || accountId.value !== targetAccount) return
    const items = Array.isArray(data && data.items) ? data.items : []
    const statuses = {}
    const remarks = {}
    const revisions = {}
    const remoteIds = new Set()
    items.forEach(function (item) {
      const id = item && (item.operator_id || item.operatorId)
      if (!id) return
      remoteIds.add(id)
      statuses[id] = ANNOTATION_STATE_FROM_API[item.growth_state || item.growthState] || 'growing'
      remarks[id] = item.note == null ? '' : String(item.note)
      revisions[id] = annotationRevision(item)
    })
    workbenchStatuses.value = statuses
    workbenchRemarks.value = remarks
    annotationRevisions.value = revisions
    await migrateLocalAnnotations(targetAccount, remoteIds)
    if (seq !== annotationLoadSeq || accountId.value !== targetAccount) return
    persistWorkbenchMap('statuses', workbenchStatuses.value)
    persistWorkbenchMap('remarks', workbenchRemarks.value)
  } catch (err) {
    if (seq !== annotationLoadSeq || accountId.value !== targetAccount) return
    annotationError.value = humanErr(err, '养成状态与备注同步失败')
  }
}

async function saveOperatorAnnotation(entry, fields) {
  if (!entry || !entry.id || !auth.isLoggedIn || !accountId.value) return null
  const targetAccount = accountId.value
  const id = entry.id
  annotationBusyIds.value = new Set(annotationBusyIds.value).add(id)
  annotationError.value = ''
  try {
    const body = Object.assign({}, fields, { expected_revision: Number(annotationRevisions.value[id]) || 0 })
    const item = await putOperatorAnnotation({ accountId: targetAccount, operatorId: id, annotation: body })
    if (accountId.value !== targetAccount) return null
    applyAnnotationItem(item)
    persistWorkbenchMap('statuses', workbenchStatuses.value)
    persistWorkbenchMap('remarks', workbenchRemarks.value)
    return item
  } catch (err) {
    if (accountId.value === targetAccount) {
      annotationError.value = humanErr(err, '养成标注保存失败')
      if (err && err.code === 'annotation_revision_conflict') await loadOperatorAnnotations()
    }
    throw err
  } finally {
    if (accountId.value === targetAccount) {
      const next = new Set(annotationBusyIds.value)
      next.delete(id)
      annotationBusyIds.value = next
    }
  }
}

function readFavoriteFirstPreference() {
  if (typeof localStorage === 'undefined') return false
  try { return localStorage.getItem(workbenchStorageKey('favorite-first')) === 'true' } catch (_) { return false }
}

function setFavoriteFirst(value) {
  favoriteFirst.value = Boolean(value)
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(workbenchStorageKey('favorite-first'), String(favoriteFirst.value)) } catch (_) {}
}

function operatorStatus(entry) {
  if (workbenchStatuses.value[entry.id]) return workbenchStatuses.value[entry.id]
  return 'growing'
}

function statusLabel(status) {
  return status === 'graduated' ? '已毕业' : status === 'inactive' ? '养老中' : '养成中'
}

function flattenInventoryCurrent(data) {
  const rows = Array.isArray(data) ? data : (data ? [data] : [])
  const result = {}
  rows.forEach(function (row) {
    const entries = row && row.entries && typeof row.entries === 'object' ? row.entries : {}
    Object.keys(entries).forEach(function (id) {
      const value = entries[id]
      result[id] = Number(value && value.count != null ? value.count : value) || 0
    })
  })
  return result
}

async function loadCardMaterialStock() {
  if (!auth.isLoggedIn || !accountId.value) {
    cardMaterialLoadSeq += 1
    cardMaterialLoadedAccount.value = ''
    cardMaterialStock.value = {}
    cardHeartStock.value = {}
    cardMaterialLoading.value = false
    return
  }
  const targetAccount = accountId.value
  const seq = ++cardMaterialLoadSeq
  cardMaterialLoading.value = true
  try {
    const results = await Promise.all([
      getInventoryCurrent({ accountId: targetAccount, entityType: 'item' }),
      getInventoryCurrent({ accountId: targetAccount, entityType: 'agent' })
    ])
    if (seq !== cardMaterialLoadSeq || accountId.value !== targetAccount) return
    const items = flattenInventoryCurrent(results[0])
    cardMaterialStock.value = Object.assign({}, items, {
      __experience__: (Number(items.bingshucanjuan) || 0) * 100 + (Number(items.bingshuquanjuan) || 0) * 1000 + (Number(items.liutaobingshu) || 0) * 10000
    })
    cardHeartStock.value = flattenInventoryCurrent(results[1])
    cardMaterialLoadedAccount.value = targetAccount
  } catch (_) {
    if (seq === cardMaterialLoadSeq) {
      cardMaterialStock.value = {}
      cardHeartStock.value = {}
    }
  } finally {
    if (seq === cardMaterialLoadSeq) cardMaterialLoading.value = false
  }
}

function normalizeCardDiscLoadouts(entry) {
  const source = Array.isArray(entry && entry.discLoadouts) && entry.discLoadouts.length
    ? entry.discLoadouts
    : (Array.isArray(entry && entry.discs) && entry.discs.length ? [{ discs: entry.discs }] : [])
  return Array.from({ length: 2 }, function (_, index) {
    const loadout = source[index] || {}
    const names = Array.isArray(loadout.discNames)
      ? loadout.discNames
      : (Array.isArray(loadout.discs) ? loadout.discs.map(discKey).filter(Boolean) : [])
    return {
      id: String(loadout.id || 'disc_' + (index + 1)),
      name: String(loadout.name || ''),
      discNames: names.filter(Boolean).slice(0, 3)
    }
  })
}

function normalizeCardStarStones(entry) {
  const source = Array.isArray(entry && entry.starStones) ? entry.starStones : []
  const hasTypedSlots = source.some(function (stone) { return !!(stone && stone.type) })
  return Array.from({ length: 6 }, function (_, index) {
    const slot = stoneSlots.value[index]
    const type = slot ? slot.type : 'stone' + (index + 1)
    // Typed payloads are sparse by design: a missing slot must remain empty,
    // rather than falling back to the item at the same array index.
    const hit = source.find(function (stone) { return normalizeStoneType(stone && stone.type) === type }) || (!hasTypedSlots ? source[index] : null)
    const rarity = hit && hit.rarity != null ? hit.rarity : (hit && hit.levelType != null ? hit.levelType : null)
    return {
      type: type,
      name: hit && hit.name ? hit.name : '',
      level: hit && hit.level != null ? Math.max(0, Math.min(60, Number(hit.level) || 0)) : 0,
      rarity: rarity
    }
  })
}

function ensureCardDraft(entry) {
  if (!entry || !entry.id) return null
  if (!cardGrowthDrafts.value[entry.id]) {
    const stats = entry.combatStats || normalizeOperatorCombatStats({})
    const modes = Object.assign({}, cardCombatModes.value[entry.id] || (stats.displayMode || {}))
    cardGrowthDrafts.value = Object.assign({}, cardGrowthDrafts.value, {
      [entry.id]: {
        level: Number(entry.level) || 0,
        elite: Number(entry.elite) || 0,
        star: Number(entry.starLevel) || 0,
        discLoadouts: normalizeCardDiscLoadouts(entry),
        starStones: normalizeCardStarStones(entry),
        remark: operatorRemark(entry),
        modes: modes
      }
    })
  }
  cardCombatDraft(entry)
  if (!cardDraftBaselines.value[entry.id]) cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, { [entry.id]: cardDraftSnapshot(entry) })
  return cardGrowthDrafts.value[entry.id]
}

function cardDraftSnapshot(entry) {
  const growth = cardGrowthDrafts.value[entry.id] || {}
  const combat = cardCombatDrafts.value[entry.id] || {}
  return JSON.stringify({ level: Number(growth.level) || 0, elite: Number(growth.elite) || 0, star: Number(growth.star) || 0, discLoadouts: growth.discLoadouts || [], starStones: growth.starStones || [], remark: growth.remark == null ? operatorRemark(entry) : growth.remark, modes: cardCombatModes.value[entry.id] || growth.modes || {}, attack: combat.attack == null ? null : Number(combat.attack), hp: combat.hp == null ? null : Number(combat.hp), oddityAttack: Number(combat.oddityAttack) || 0, oddityHp: Number(combat.oddityHp) || 0 })
}

function parsedCardDraftSnapshot(entry) {
  try { return JSON.parse(cardDraftSnapshot(entry)) } catch (_) { return {} }
}

function parsedCardDraftBaseline(entry) {
  try { return JSON.parse(cardDraftBaselines.value[entry.id] || '{}') } catch (_) { return {} }
}

function cardDraftChanges(entry) {
  const baseline = parsedCardDraftBaseline(entry)
  const current = parsedCardDraftSnapshot(entry)
  const baselineObjective = Object.assign({}, baseline)
  const currentObjective = Object.assign({}, current)
  delete baselineObjective.remark
  delete currentObjective.remark
  return {
    objective: JSON.stringify(baselineObjective) !== JSON.stringify(currentObjective),
    note: String(baseline.remark || '') !== String(current.remark || ''),
    baseline: baseline,
    current: current
  }
}

function cardGrowthValue(entry, field) {
  const draft = ensureCardDraft(entry)
  if (!draft) return field === 'star' ? entry.starLevel : entry[field]
  return draft[field]
}

function cardHasDraft(entry) {
  const draft = ensureCardDraft(entry)
  if (!draft) return false
  const baseline = cardDraftBaselines.value[entry.id]
  return baseline !== cardDraftSnapshot(entry)
}

function setGrowthInput(entry, field, event) {
  const draft = ensureCardDraft(entry)
  if (!draft) return
  const max = field === 'level' ? 100 : getMaxEliteForLevel(draft.level)
  let value = Math.trunc(Number(event && event.target ? event.target.value : 0))
  if (!Number.isFinite(value)) value = 0
  draft[field] = Math.max(0, Math.min(max, value))
  if (field === 'level' && draft.elite > getMaxEliteForLevel(draft.level)) draft.elite = getMaxEliteForLevel(draft.level)
}

function openCardPopover(entry, field) {
  ensureCardDraft(entry)
  cardPopoverKey.value = cardPopoverKey.value === entry.id + ':' + field ? '' : entry.id + ':' + field
}

function cardLevelBreakthrough(entry) {
  return Boolean(entry && cardLevelBreakthroughs.value[entry.id])
}

function setCardLevelBreakthrough(entry, event) {
  if (!entry || !entry.id) return
  cardLevelBreakthroughs.value = Object.assign({}, cardLevelBreakthroughs.value, {
    [entry.id]: Boolean(event && event.target && event.target.checked)
  })
}

function growthTarget(entry, field, step) {
  const draft = ensureCardDraft(entry)
  if (!draft) return 0
  const amount = Number(step == null ? cardPopoverStep.value : step) || (field === 'level' ? 5 : field === 'elite' ? 3 : 1)
  if (field === 'level') return Math.min(100, draft.level + amount)
  if (field === 'elite') return Math.min(getMaxEliteForLevel(draft.level), draft.elite + amount)
  return Math.min(entry.spOf ? 5 : 31, draft.star + 1)
}

function growthActionKey(entry, field) {
  return entry.id + ':' + field
}

function growthPreviewFor(entry, field) {
  return growthPreviews.value[growthActionKey(entry, field)] || null
}

function growthPreviewData(entry, field) {
  const state = growthPreviewFor(entry, field)
  return state && state.data ? state.data : null
}

function growthPreviewError(entry, field) {
  const state = growthPreviewFor(entry, field)
  return state && state.error ? state.error : ''
}

function growthPreviewAvailable(entry, field) {
  const preview = growthPreviewData(entry, field)
  return !!(preview && preview.available)
}

function growthPreviewRequirements(entry, field) {
  const preview = growthPreviewData(entry, field)
  return preview && Array.isArray(preview.requirements) ? preview.requirements : []
}

function growthPreviewDisplayRequirements(entry, field) {
  const requirements = growthPreviewRequirements(entry, field).slice()
  if (field !== 'level' || cardMaterialLoadedAccount.value !== accountId.value) return requirements
  const bookIds = new Set(['liutaobingshu', 'bingshuquanjuan', 'bingshucanjuan'])
  if (requirements.some(function (item) { return bookIds.has(item && item.id) })) return requirements
  const requiredExperience = growthPreviewExperience(entry, field)
  const stock = cardMaterialStock.value || {}
  const experienceGap = Math.max(requiredExperience - (Number(stock.__experience__) || 0), 0)
  if (!experienceGap) return requirements
  const projectedStock = Object.assign({}, stock)
  levelBookGapBundle(experienceGap).forEach(function (book) {
    projectedStock[book.id] = (Number(projectedStock[book.id]) || 0) + book.required
  })
  levelBookDeductions(requiredExperience, projectedStock).forEach(function (book) {
    const owned = Number(stock[book.id]) || 0
    requirements.push({
      entity_type: 'item',
      id: book.id,
      required: book.required,
      owned: owned,
      balance_after: owned - book.required
    })
  })
  return requirements
}

function growthRequirementName(requirement, entry) {
  const type = requirement && (requirement.entity_type || requirement.entityType)
  const id = requirement && requirement.id
  if (type === 'agent') {
    const operator = catalogMap.value[id]
    return ((operator && operator.name) || (entry && entry.id === id && entry.name) || id) + '心纸'
  }
  return itemNameById(id)
}

function growthRequirementValue(requirement, key) {
  if (!requirement) return 0
  const camel = key.replace(/_([a-z])/g, function (_, letter) { return letter.toUpperCase() })
  return Number(requirement[key] != null ? requirement[key] : requirement[camel]) || 0
}

function growthRequirementBalanceLabel(requirement) {
  const balance = growthRequirementValue(requirement, 'balance_after')
  if (balance < 0) return '缺 ' + Math.abs(balance).toLocaleString('zh-CN')
  return growthRequirementValue(requirement, 'owned').toLocaleString('zh-CN') + ' → ' + balance.toLocaleString('zh-CN')
}

function growthPreviewExperience(entry, field) {
  const preview = growthPreviewData(entry, field)
  return Number(preview && (preview.experience_required != null ? preview.experience_required : preview.experienceRequired)) || 0
}

function growthPreviewBlockingReasons(entry, field) {
  const preview = growthPreviewData(entry, field)
  const reasons = preview && Array.isArray(preview.blocking_reasons || preview.blockingReasons)
    ? (preview.blocking_reasons || preview.blockingReasons)
    : []
  return reasons.filter(function (reason) {
    return String(reason && reason.code || '') !== 'insufficient_inventory'
  })
}

function growthPreviewHasMaterialGap(entry, field) {
  return growthPreviewDisplayRequirements(entry, field).some(function (item) {
    return growthRequirementValue(item, 'balance_after') < 0
  })
}

function growthReasonMessage(reason) {
  return String(reason && (reason.message || reason.code) || '当前状态无法提升')
}

function isGrowthPreviewBusy(entry, field) {
  return growthPreviewBusyKeys.value.has(growthActionKey(entry, field))
}

function isGrowthExecuteBusy(entry, field) {
  return growthExecuteBusyKeys.value.has(growthActionKey(entry, field))
}

function upgradeDimension(field) {
  return field === 'star' ? 'huaji' : field
}

function uuid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return 'upgrade-' + Date.now() + '-' + Math.random().toString(36).slice(2)
}

function resetCardDraftState(id) {
  ;[cardGrowthDrafts, cardDraftBaselines, cardCombatDrafts].forEach(function (state) {
    const next = Object.assign({}, state.value)
    delete next[id]
    state.value = next
  })
}

async function openGrowthAction(entry, field, step, retriedAfterRefresh) {
  ensureCardDraft(entry)
  if (cardHasDraft(entry)) {
    quickNotices.value = Object.assign({}, quickNotices.value, { [entry.id]: '请先保存或取消卡片中的手动修改' })
    return
  }
  cardPopoverStep.value = step || 1
  const key = growthActionKey(entry, field)
  cardPopoverKey.value = key
  growthPreviewBusyKeys.value = new Set(growthPreviewBusyKeys.value).add(key)
  growthExecutionKeys.delete(key)
  growthPreviews.value = Object.assign({}, growthPreviews.value, { [key]: { data: null, error: '' } })
  try {
    const data = await previewOperatorUpgrade({
      accountId: accountId.value,
      game: saveGame.value,
      operatorId: entry.id,
      dimension: upgradeDimension(field),
      target: growthTarget(entry, field, step),
      expectedOperatorRevision: Number(entry.revision) || 0
    })
    if (cardPopoverKey.value !== key) return
    growthPreviews.value = Object.assign({}, growthPreviews.value, { [key]: { data: data, error: '' } })
  } catch (err) {
    if (cardPopoverKey.value !== key) return
    if (err && err.code === 'operator_state_stale' && !retriedAfterRefresh) {
      await reloadCurrent(true)
      resetCardDraftState(entry.id)
      await openGrowthAction(currentMap.value[entry.id] || entry, field, step, true)
      return
    }
    growthPreviews.value = Object.assign({}, growthPreviews.value, { [key]: { data: null, error: humanErr(err, '提升预览失败') } })
  } finally {
    const next = new Set(growthPreviewBusyKeys.value)
    next.delete(key)
    growthPreviewBusyKeys.value = next
  }
}

function applyUpgradeConsumption(consumed) {
  ;(Array.isArray(consumed) ? consumed : []).forEach(function (item) {
    const type = item.entity_type || item.entityType
    const id = item.id
    const balance = Number(item.balance_after != null ? item.balance_after : item.balanceAfter) || 0
    if (type === 'agent') cardHeartStock.value = Object.assign({}, cardHeartStock.value, { [id]: balance })
    else cardMaterialStock.value = Object.assign({}, cardMaterialStock.value, { [id]: balance })
  })
  const stock = cardMaterialStock.value
  cardMaterialStock.value = Object.assign({}, stock, {
    __experience__: (Number(stock.bingshucanjuan) || 0) * 100 + (Number(stock.bingshuquanjuan) || 0) * 1000 + (Number(stock.liutaobingshu) || 0) * 10000
  })
}

function applyUpgradeOperator(entry, raw) {
  if (!entry || !raw) return
  const preserveDraft = !!cardGrowthDrafts.value[entry.id] && cardHasDraft(entry)
  entry.level = Number(raw.level) || 0
  entry.elite = Number(raw.elite) || 0
  entry.starLevel = Number(raw.star_level != null ? raw.star_level : raw.starLevel) || 0
  entry.revision = Number(raw.revision) || entry.revision || 0
  if (preserveDraft) {
    showQuickNotice(entry.id, '服务器养成已更新；当前未保存修改仍保留，请确认后再提交')
    return
  }
  const draft = ensureCardDraft(entry)
  if (draft) {
    draft.level = entry.level
    draft.elite = entry.elite
    draft.star = entry.starLevel
    cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, { [entry.id]: cardDraftSnapshot(entry) })
  }
}

async function executeGrowthAction(entry, field) {
  const key = growthActionKey(entry, field)
  const preview = growthPreviewData(entry, field)
  if (!preview || !preview.available || growthExecuteBusyKeys.value.has(key)) return
  const target = Number(preview.to)
  const operatorRevision = Number(preview.operator_revision != null ? preview.operator_revision : preview.operatorRevision) || 0
  const inventoryRevision = Number(preview.inventory_revision != null ? preview.inventory_revision : preview.inventoryRevision) || 0
  const previewToken = preview.preview_token || preview.previewToken
  const idempotencyKey = growthExecutionKeys.get(key) || uuid()
  growthExecutionKeys.set(key, idempotencyKey)
  growthExecuteBusyKeys.value = new Set(growthExecuteBusyKeys.value).add(key)
  try {
    const result = await executeOperatorUpgrade({
      accountId: accountId.value,
      game: saveGame.value,
      operatorId: entry.id,
      dimension: upgradeDimension(field),
      target: target,
      expectedOperatorRevision: operatorRevision,
      expectedInventoryRevision: inventoryRevision,
      previewToken: previewToken,
      idempotencyKey: idempotencyKey
    })
    const transactionId = result && (result.transaction_id || result.transactionId)
    if (transactionId) handledUpgradeTransactionIds.add(transactionId)
    applyUpgradeOperator(entry, result && result.operator)
    applyUpgradeConsumption(result && result.consumed)
    cardPopoverKey.value = ''
    growthExecutionKeys.delete(key)
    showQuickNotice(entry.id, '已提升并扣除库存', 2200)
  } catch (err) {
    const refreshable = err && ['operator_state_stale', 'inventory_state_stale', 'insufficient_inventory', 'preview_expired'].includes(err.code)
    showQuickNotice(entry.id, refreshable ? '状态已变化，已刷新提升预览' : humanErr(err, '提升失败'))
    if (refreshable) {
      await Promise.all([reloadCurrent(true), loadCardMaterialStock()])
      resetCardDraftState(entry.id)
      await openGrowthAction(currentMap.value[entry.id] || entry, field, cardPopoverStep.value)
    }
  } finally {
    const next = new Set(growthExecuteBusyKeys.value)
    next.delete(key)
    growthExecuteBusyKeys.value = next
  }
}

function setGrowthDraft(entry, field, value, closePopover) {
  const draft = ensureCardDraft(entry)
  if (!draft) return
  if (field === 'star') value = Math.max(0, Math.min(entry.spOf ? 5 : 31, Number(value) || 0))
  draft[field] = Math.trunc(Number(value) || 0)
  if (field === 'level' && draft.elite > getMaxEliteForLevel(draft.level)) draft.elite = getMaxEliteForLevel(draft.level)
  if (closePopover !== false) cardPopoverKey.value = ''
}

function starDraftGroup(entry) {
  const value = cardGrowthValue(entry, 'star')
  if (entry.spOf) return value
  if (value === 31) return 31
  return value > 0 ? Math.floor((value - 1) / 6) + 1 : 0
}

function starDraftNode(entry) {
  const value = cardGrowthValue(entry, 'star')
  return value > 0 && value < 31 ? (value - 1) % 6 : 0
}

function setStarDraftGroup(entry, event) {
  const group = Number(event && event.target ? event.target.value : 0)
  if (entry.spOf) return setGrowthDraft(entry, 'star', group, false)
  if (group === 0 || group === 31) return setGrowthDraft(entry, 'star', group, false)
  setGrowthDraft(entry, 'star', 6 * (group - 1) + starDraftNode(entry) + 1, false)
}

function setStarDraftNode(entry, event) {
  const node = Number(event && event.target ? event.target.value : 0)
  const group = starDraftGroup(entry)
  if (group > 0 && group < 31) setGrowthDraft(entry, 'star', 6 * (group - 1) + node + 1, false)
}

function quickGrowthRequirementReady(entry, field, step) {
  const draft = cardGrowthDrafts.value[entry.id]
  const level = Number(draft ? draft.level : entry.level) || 0
  const elite = Number(draft ? draft.elite : entry.elite) || 0
  const star = Number(draft ? draft.star : entry.starLevel) || 0
  const stock = cardMaterialStock.value || {}
  let requirement
  if (field === 'level') {
    if (level >= 100) return false
    requirement = calculateLevelRequirements(level, Math.min(100, level + step), firstSubProf(entry), cardLevelBreakthrough(entry))
  } else if (field === 'elite') {
    const maxElite = getMaxEliteForLevel(level)
    if (elite >= maxElite) return false
    requirement = calculateXiuweiRequirements(elite, Math.min(maxElite, elite + step), xiuweiJob(entry.prof))
  } else {
    if (entry.spOf || star >= 31) return false
    requirement = calculateStarRequirements(star, Math.min(31, star + step))
  }
  const itemsReady = Object.keys(requirement.items || {}).every(function (id) {
    return (Number(stock[id]) || 0) >= (Number(requirement.items[id]) || 0)
  })
  if (!itemsReady) return false
  if ((Number(requirement.experience) || 0) > (Number(stock.__experience__) || 0)) return false
  if ((Number(requirement.heart) || 0) > (Number(cardHeartStock.value[entry.id]) || 0)) return false
  return true
}

function quickGrowthActionAvailable(entry, field, step) {
  if (!entry || !entry.id || cardSubmitStates.value[entry.id] === 'submitting') return false
  const draft = cardGrowthDrafts.value[entry.id]
  const baseline = cardDraftBaselines.value[entry.id]
  if (draft && baseline && baseline !== cardDraftSnapshot(entry)) return false
  return quickGrowthRequirementReady(entry, field, step)
}

function growthActionClass(entry, field, step) {
  if (field === 'star' && entry.spOf) return 'is-ready'
  const materials = growthMaterials(entry, field, step)
  return materials.some(function (item) { return item.lack > 0 }) ? 'is-lack' : 'is-ready'
}

function growthMaterialsReady(entry, field, step) {
  return !growthMaterials(entry, field, step).some(function (item) { return item.lack > 0 })
}

function growthActionLabel(entry, field, step, readyLabel) {
  if (field === 'star' && entry.spOf) return readyLabel
  const materials = growthMaterials(entry, field, step)
  if (!materials.some(function (item) { return item.lack > 0 })) return readyLabel
  if (field === 'level') return '查看经验缺口'
  if (field === 'star') {
    const heart = materials.find(function (item) { return item.id === '__heart__' })
    if (heart && heart.lack > 0) return heart.owned + '/' + heart.required
  }
  return '查看材料缺口'
}

function growthTargetLabel(entry, field) {
  const target = growthTarget(entry, field)
  if (field === 'level') return '等级 ' + target
  if (field === 'elite') return '修为 ' + target
  return '化极 ' + starLabel(target, entry.spOf)
}

function growthPopoverTitle(entry, field) {
  const target = growthTargetLabel(entry, field)
  return growthMaterialsReady(entry, field)
    ? target + ' 将扣除以下道具'
    : target + ' 还缺以下道具'
}

function levelBookDeductions(required, stock) {
  let remaining = Math.max(0, Number(required) || 0)
  const books = [
    { id: 'liutaobingshu', value: 10000 },
    { id: 'bingshuquanjuan', value: 1000 },
    { id: 'bingshucanjuan', value: 100 }
  ].map(function (book) {
    return Object.assign({}, book, { available: Number(stock[book.id]) || 0, count: 0 })
  })
  books.forEach(function (book) {
    const count = Math.min(book.available, Math.floor(remaining / book.value))
    book.count += count
    remaining -= count * book.value
  })
  if (remaining > 0) {
    books.slice().reverse().forEach(function (book) {
      if (remaining <= 0) return
      const available = book.available - book.count
      const count = Math.min(available, Math.ceil(remaining / book.value))
      book.count += count
      remaining -= count * book.value
    })
  }
  return books.filter(function (book) { return book.count > 0 }).map(function (book) {
    return { id: book.id, name: itemNameById(book.id), required: book.count, owned: book.available, lack: 0 }
  })
}

function levelBookGapBundle(experienceGap) {
  const gap = Math.max(0, Number(experienceGap) || 0)
  if (!gap) return []
  // 绝境历练每轮固定掉落：兵书全卷 9 + 兵书残卷 100，
  // 对应 19,000 点兵书经验；按整轮向上取整，避免推荐经验不足。
  const runs = Math.ceil(gap / 19000)
  return [
    { id: 'bingshuquanjuan', name: itemNameById('bingshuquanjuan'), required: runs * 9, owned: 0, lack: runs * 9 },
    { id: 'bingshucanjuan', name: itemNameById('bingshucanjuan'), required: runs * 100, owned: 0, lack: runs * 100 }
  ]
}

function growthMaterials(entry, field, step) {
  const draft = ensureCardDraft(entry)
  if (!draft) return []
  const stock = cardMaterialStock.value || {}
  let requirement
  if (field === 'level') requirement = calculateLevelRequirements(draft.level, growthTarget(entry, 'level', step), firstSubProf(entry), cardLevelBreakthrough(entry))
  else if (field === 'elite') requirement = calculateXiuweiRequirements(draft.elite, growthTarget(entry, 'elite', step), xiuweiJob(entry.prof))
  else requirement = calculateStarRequirements(draft.star, growthTarget(entry, 'star', step))
  const items = Object.keys(requirement.items || {}).map(function (id) {
    const required = Number(requirement.items[id]) || 0
    const owned = Number(stock[id]) || 0
    return { id: id, name: itemNameById(id), required: required, owned: owned, lack: Math.max(required - owned, 0) }
  }).filter(function (item) { return item.required > 0 })
  if (requirement.experience) {
    const experienceOwned = Number(stock.__experience__) || 0
    if (experienceOwned >= requirement.experience) items.push.apply(items, levelBookDeductions(requirement.experience, stock))
    else items.push.apply(items, levelBookGapBundle(requirement.experience - experienceOwned))
  }
  if (requirement.heart) {
    const owned = Number(cardHeartStock.value[entry.id]) || 0
    items.push({ id: '__heart__', name: '心纸', required: requirement.heart, owned: owned, lack: Math.max(requirement.heart - owned, 0) })
  }
  return items
}

function itemNameById(id) {
  const item = ITEM_CATALOG.find(function (entry) { return entry.id === id })
  return item ? item.name : id
}

function cancelCardDraft(entry) {
  const draft = ensureCardDraft(entry)
  let baseline = null
  try { baseline = JSON.parse(cardDraftBaselines.value[entry.id] || 'null') } catch (_) { baseline = null }
  baseline = baseline || {}
  draft.level = baseline.level == null ? Number(entry.level) || 0 : Number(baseline.level) || 0
  draft.elite = baseline.elite == null ? Number(entry.elite) || 0 : Number(baseline.elite) || 0
  draft.star = baseline.star == null ? Number(entry.starLevel) || 0 : Number(baseline.star) || 0
  draft.discLoadouts = Array.isArray(baseline.discLoadouts) ? JSON.parse(JSON.stringify(baseline.discLoadouts)) : normalizeCardDiscLoadouts(entry)
  draft.starStones = Array.isArray(baseline.starStones) ? JSON.parse(JSON.stringify(baseline.starStones)) : normalizeCardStarStones(entry)
  draft.remark = baseline.remark == null ? (entry.remark || entry.note || '') : baseline.remark
  draft.modes = Object.assign({}, baseline.modes || (entry.combatStats && entry.combatStats.displayMode) || {})
  workbenchRemarks.value = Object.assign({}, workbenchRemarks.value, { [entry.id]: draft.remark })
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, { [entry.id]: Object.assign({}, draft.modes) })
  const stats = entry.combatStats || normalizeOperatorCombatStats({})
  cardCombatDrafts.value = Object.assign({}, cardCombatDrafts.value, { [entry.id]: {
    attack: Object.prototype.hasOwnProperty.call(baseline, 'attack') ? baseline.attack : stats.manualAttack,
    hp: Object.prototype.hasOwnProperty.call(baseline, 'hp') ? baseline.hp : stats.manualHp,
    oddityAttack: baseline.oddityAttack == null ? stats.oddities.attack.current : baseline.oddityAttack,
    oddityHp: baseline.oddityHp == null ? stats.oddities.hp.current : baseline.oddityHp
  } })
  cardPopoverKey.value = ''
}

function clearCardSubmitState(entry) {
  delete cardSubmitStates.value[entry.id]
  cardSubmitStates.value = Object.assign({}, cardSubmitStates.value)
}

function handleCardPopoverOutside(event) {
  const target = event && event.target
  if (!(target && target.closest && target.closest('.ledger-status-menu'))) {
    document.querySelectorAll('.ledger-status-menu[open]').forEach(function (menu) { menu.open = false })
  }
  if (!cardPopoverKey.value) return
  if (target && target.closest && (target.closest('.ledger-popover') || target.closest('.ledger-popover-trigger') || target.closest('.ledger-status-menu'))) return
  cardPopoverKey.value = ''
}

function showQuickNotice(id, message, duration) {
  quickNotices.value = Object.assign({}, quickNotices.value, { [id]: message })
  if (!duration) return
  window.setTimeout(function () {
    if (quickNotices.value[id] !== message) return
    const next = Object.assign({}, quickNotices.value)
    delete next[id]
    quickNotices.value = next
  }, duration)
}

async function setOperatorStatus(entry, value) {
  if (!entry || !entry.id || annotationBusyIds.value.has(entry.id)) return
  const previous = operatorStatus(entry)
  workbenchStatuses.value = Object.assign({}, workbenchStatuses.value, { [entry.id]: value })
  persistWorkbenchMap('statuses', workbenchStatuses.value)
  try {
    await saveOperatorAnnotation(entry, { growth_state: ANNOTATION_STATE_TO_API[value] || 'active' })
    showQuickNotice(entry.id, '养成状态已同步', 1800)
  } catch (err) {
    if (!(err && err.code === 'annotation_revision_conflict')) {
      workbenchStatuses.value = Object.assign({}, workbenchStatuses.value, { [entry.id]: previous })
    }
    showQuickNotice(entry.id, humanErr(err, '养成状态保存失败'))
  }
}

function setOperatorStatusAndClose(entry, value, event) {
  setOperatorStatus(entry, value)
  const details = event && event.currentTarget && event.currentTarget.closest ? event.currentTarget.closest('details') : null
  if (details) details.open = false
}

function ensureQuickDraft(entry) {
  if (!quickDrafts.value[entry.id]) {
    quickDrafts.value[entry.id] = { level: entry.level, elite: entry.elite, star: entry.starLevel }
  }
  return quickDrafts.value[entry.id]
}

function openQuickEditor(entry, field) {
  quickConfirmKey.value = ''
  const key = entry.id + ':' + field
  ensureQuickDraft(entry)
  quickEditorKey.value = quickEditorKey.value === key ? '' : key
}

function openQuickConfirm(entry, field) {
  quickEditorKey.value = ''
  quickConfirmKey.value = entry.id + ':' + field
}

async function quickCorrect(entry, field, rawValue) {
  const max = field === 'level' ? OPERATOR_LEVEL_MAX : field === 'elite' ? getMaxEliteForLevel(entry.level) : (entry.spOf ? 5 : MAX_STAR_LEVEL)
  const value = Math.max(0, Math.min(max, Math.trunc(Number(rawValue))))
  if (!Number.isFinite(value)) return
  const patch = { expected_revision: Number(entry.revision) || 0, reason: 'manual_correction' }
  patch[field === 'star' ? 'star_level' : field] = value
  quickSavingIds.value = new Set([...quickSavingIds.value, entry.id])
  try {
    await patchOperatorCurrent({ accountId: accountId.value, operatorId: entry.id, game: saveGame.value, patch })
    quickNotices.value = Object.assign({}, quickNotices.value, { [entry.id]: '已保存' })
    quickEditorKey.value = ''
    quickConfirmKey.value = ''
    await reloadCurrent(true)
    window.setTimeout(function () {
      const next = Object.assign({}, quickNotices.value)
      delete next[entry.id]
      quickNotices.value = next
    }, 1800)
  } catch (err) {
    quickNotices.value = Object.assign({}, quickNotices.value, { [entry.id]: humanErr(err, '保存失败') })
  } finally {
    const next = new Set(quickSavingIds.value)
    next.delete(entry.id)
    quickSavingIds.value = next
  }
}

function cardLoadoutDiscs(entry, index) {
  const draft = ensureCardDraft(entry)
  const loadout = draft && draft.discLoadouts && draft.discLoadouts[index]
  return loadout && Array.isArray(loadout.discNames) ? loadout.discNames.slice(0, 3) : []
}

function cardStoneSlots(entry) {
  const draft = ensureCardDraft(entry)
  const stones = draft && Array.isArray(draft.starStones) ? draft.starStones : []
  return stones.map(function (stone) { return stone && stone.name ? stone : null })
}

function cardDiscOptions(entry) {
  const catalog = catalogMap.value[entry && entry.id]
  return sortDiscsForPicker(catalog && catalog.discs)
}

function cardDiscDescription(entry, name) {
  const disc = cardDiscOptions(entry).find(function (item) { return discKey(item) === name })
  return discDescription(disc)
}

function cardDiscSelected(entry, loadoutIndex, disc) {
  const draft = ensureCardDraft(entry)
  const loadout = draft && draft.discLoadouts && draft.discLoadouts[loadoutIndex]
  return !!loadout && loadout.discNames.indexOf(discKey(disc)) !== -1
}

function toggleCardDisc(entry, loadoutIndex, disc, event) {
  const draft = ensureCardDraft(entry)
  const loadout = draft && draft.discLoadouts && draft.discLoadouts[loadoutIndex]
  const key = discKey(disc)
  if (!loadout || !key) return
  const selectedIndex = loadout.discNames.indexOf(key)
  if (selectedIndex !== -1) {
    loadout.discNames.splice(selectedIndex, 1)
  } else if (loadout.discNames.length < 3) {
    loadout.discNames.push(key)
  } else {
    if (event && event.target) event.target.checked = false
    quickNotices.value = Object.assign({}, quickNotices.value, { [entry.id]: '每套命盘最多选择 3 个' })
  }
}

function cardStoneValue(entry, index) {
  const draft = ensureCardDraft(entry)
  return draft && draft.starStones && draft.starStones[index]
    ? draft.starStones[index]
    : { type: stoneSlots.value[index] ? stoneSlots.value[index].type : 'stone' + (index + 1), name: '', level: 0 }
}

function cardStoneOptions(entry, index) {
  const slot = stoneSlots.value[index]
  const type = slot ? slot.type : 'main1'
  const catalog = catalogMap.value[entry && entry.id]
  const options = type.indexOf('assist') === 0 ? ASSIST_STAR_OPTIONS : MAIN_STAR_OPTIONS
  const available = options.filter(function (name) { return isStarStoneAllowed(name, catalog) })
  const current = cardStoneValue(entry, index).name
  if (current && options.indexOf(current) !== -1 && available.indexOf(current) === -1) return [current].concat(available)
  return available
}

function setCardStoneName(entry, index, event) {
  const stone = cardStoneValue(entry, index)
  const name = String(event && event.target ? event.target.value : '')
  stone.name = name
  if (!name) stone.level = 0
  else if (Number(stone.level) < 1) stone.level = 1
}

function setCardStoneLevel(entry, index, eventOrValue) {
  const stone = cardStoneValue(entry, index)
  if (!stone.name) return
  const raw = eventOrValue && eventOrValue.target ? eventOrValue.target.value : eventOrValue
  const value = Math.trunc(Number(raw) || 0)
  stone.level = Math.max(1, Math.min(60, value))
}

function removeCardStone(entry, index) {
  const stone = cardStoneValue(entry, index)
  stone.name = ''
  stone.level = 0
  stone.rarity = null
  cardPopoverKey.value = ''
}

function operatorRemark(entry) {
  if (Object.prototype.hasOwnProperty.call(workbenchRemarks.value, entry.id)) return workbenchRemarks.value[entry.id]
  return entry.remark || entry.note || ''
}

function setOperatorRemarkDraft(entry, value) {
  const draft = ensureCardDraft(entry)
  workbenchRemarks.value = Object.assign({}, workbenchRemarks.value, { [entry.id]: value })
  if (draft) draft.remark = value
}

function saveOperatorRemark(entry) {
  const draft = ensureCardDraft(entry)
  if (draft) draft.remark = operatorRemark(entry)
}

function cardCombatStones(entry) {
  const draft = ensureCardDraft(entry)
  const stones = draft && Array.isArray(draft.starStones) ? draft.starStones : (Array.isArray(entry.starStones) ? entry.starStones : [])
  return stones.reduce(function (result, stone, index) {
    const type = stone && stone.type ? stone.type : 'stone' + (index + 1)
    result[type] = { name: stone.name || '', level: Number(stone.level) || 0, rarity: stone.rarity }
    return result
  }, {})
}

function cardCombatDraft(entry) {
  if (!cardCombatDrafts.value[entry.id]) {
    const stats = entry.combatStats || normalizeOperatorCombatStats({})
    cardCombatDrafts.value = Object.assign({}, cardCombatDrafts.value, {
      [entry.id]: {
        attack: stats.manualAttack,
        hp: stats.manualHp,
        oddityAttack: stats.oddities && stats.oddities.attack ? stats.oddities.attack.current : 0,
        oddityHp: stats.oddities && stats.oddities.hp ? stats.oddities.hp.current : 0
      }
    })
  }
  return cardCombatDrafts.value[entry.id]
}

function cardCombatInput(entry) {
  const draft = cardCombatDraft(entry)
  const growth = cardGrowthDrafts.value[entry.id] || {
    level: Number(entry.level) || 0,
    elite: Number(entry.elite) || 0,
    star: Number(entry.starLevel) || 0
  }
  return {
    operatorName: entry.name,
    level: Number(growth.level) || 0,
    elite: Number(growth.elite) || 0,
    starLevel: Number(growth.star) || 0,
    stones: cardCombatStones(entry),
    oddities: {
      attack: { current: draft.oddityAttack },
      hp: { current: draft.oddityHp },
      special: { current: entry.combatStats && entry.combatStats.oddities && entry.combatStats.oddities.special ? entry.combatStats.oddities.special.current : 0 }
    }
  }
}

function cardCombatResult(entry) {
  const stats = entry.combatStats || normalizeOperatorCombatStats({})
  const draft = cardCombatDraft(entry)
  return calculateOperatorCombatStats({
    stored: Object.assign({}, stats, {
      manualAttack: draft.attack,
      manualHp: draft.hp,
      oddities: Object.assign({}, stats.oddities, {
        attack: { current: draft.oddityAttack },
        hp: { current: draft.oddityHp }
      })
    }),
    input: cardCombatInput(entry)
  })
}

function cardCombatAutoAvailable(entry, kind) {
  const result = cardCombatResult(entry)
  return kind === 'attack' ? result.automaticAttackAvailable : result.automaticHpAvailable
}

function cardCombatModeSwitchAllowed(entry, kind) {
  if (!cardCombatAutoAvailable(entry, kind)) return false
  const mode = cardCombatMode(entry, kind)
  // 观测过期时，自动计算仍可用，但不能直接切换到过期观测值。
  return !(mode === 'auto' && combatObservedStatus(entry) === 'stale')
}

function cardCombatMode(entry, kind) {
  const local = cardCombatModes.value[entry.id] || {}
  if (local[kind] === 'auto' || local[kind] === 'manual') return local[kind]
  const persisted = entry.combatStats && entry.combatStats.displayMode && entry.combatStats.displayMode[kind]
  if (persisted === 'auto' || persisted === 'manual') return persisted
  const stats = entry.combatStats || {}
  const hasEffectiveValue = cardCombatDraft(entry)[kind] != null || stats[kind] != null
  if (hasEffectiveValue) return 'manual'
  if (cardCombatAutoAvailable(entry, kind)) return 'auto'
  return 'manual'
}

function cardCombatAutoVisible(entry, kind) {
  return cardCombatMode(entry, kind) === 'auto' && cardCombatAutoAvailable(entry, kind)
}

function cardCombatDisplay(entry, kind) {
  const result = cardCombatResult(entry)
  const mode = cardCombatMode(entry, kind)
  if (mode === 'auto' && cardCombatAutoAvailable(entry, kind)) return kind === 'attack' ? result.automaticAttackLabel : result.automaticHpLabel
  const effective = cardCombatDraft(entry)[kind] != null
    ? cardCombatDraft(entry)[kind]
    : (entry.combatStats && entry.combatStats[kind])
  if (effective != null) return Number(effective).toLocaleString('zh-CN')
  return kind === 'attack' ? result.attackLabel : result.hpLabel
}

function cardCombatInputValue(entry, kind) {
  if (cardCombatMode(entry, kind) !== 'manual') return ''
  const value = cardCombatDraft(entry)[kind]
  return value == null ? '' : value
}

function cardCombatSource(entry, kind) {
  const mode = cardCombatMode(entry, kind)
  const result = cardCombatResult(entry)
  const stale = combatObservedStatus(entry) === 'stale' ? ' · 数据已过期，请重新填写' : ''
  if (mode === 'auto') return combatObservedStatus(entry) === 'stale'
    ? '数值已过期，请重新填写'
    : '可切换为观测值'
  if (mode === 'manual') {
    return cardCombatAutoAvailable(entry, kind)
      ? '可切换为自动计算值' + stale
      : '暂不支持自动计算' + stale
  }
  return combatStatsSourceLabel(result.source, result.status)
}

function combatModeLabel(entry, kind) {
  const name = kind === 'attack' ? '攻击力' : '生命力'
  const mode = cardCombatMode(entry, kind)
  if (!cardCombatAutoAvailable(entry, kind)) return name + '使用手动校正（暂无自动计算）'
  if (mode === 'auto' && combatObservedStatus(entry) === 'stale') return name + '观测值已过期，请重新填写手动校正'
  return mode === 'auto' ? '切换为手动校正' + name : '切换为自动计算' + name
}

function toggleCardCombatMode(entry, kind) {
  const current = cardCombatMode(entry, kind)
  const next = current === 'auto' ? 'manual' : 'auto'
  if (next === 'auto' && !cardCombatAutoAvailable(entry, kind)) return
  if (next === 'manual' && combatObservedStatus(entry) === 'stale') return
  setCardCombatMode(entry, kind, next)
}

function setCardCombatMode(entry, kind, mode) {
  const draft = ensureCardDraft(entry)
  mode = mode === 'auto' ? 'auto' : 'manual'
  const next = Object.assign({}, cardCombatModes.value[entry.id] || {}, { [kind]: mode })
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, { [entry.id]: next })
  if (draft) draft.modes = Object.assign({}, next)
}

function setCardCombatValue(entry, kind, event) {
  const card = ensureCardDraft(entry)
  const draft = cardCombatDraft(entry)
  const raw = event && event.target ? event.target.value : ''
  draft[kind] = raw === '' ? null : Number(raw)
  const next = Object.assign({}, cardCombatModes.value[entry.id] || {}, { [kind]: 'manual' })
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, { [entry.id]: next })
  if (card) card.modes = Object.assign({}, next)
}

function cardOddityValue(entry, kind) {
  const draft = cardCombatDraft(entry)
  return kind === 'attack' ? draft.oddityAttack : draft.oddityHp
}

function cardOddityMax(entry, kind) {
  const oddity = entry.combatStats && entry.combatStats.oddities && entry.combatStats.oddities[kind]
  return oddity && oddity.max != null ? oddity.max : ''
}

function setCardOddityValue(entry, kind, event) {
  ensureCardDraft(entry)
  const draft = cardCombatDraft(entry)
  const raw = event && event.target ? event.target.value : ''
  draft[kind === 'attack' ? 'oddityAttack' : 'oddityHp'] = raw === '' ? 0 : Number(raw)
}

function cardPatch(entry) {
  const growth = ensureCardDraft(entry)
  const combat = cardCombatDraft(entry)
  const input = Object.assign({}, cardCombatInput(entry), {
    level: growth.level,
    elite: growth.elite,
    starLevel: growth.star
  })
  const result = cardCombatResult(Object.assign({}, entry, { level: growth.level, elite: growth.elite, starLevel: growth.star }))
  const modes = growth.modes || cardCombatModes.value[entry.id] || {}
  const patch = {
    expected_revision: Number(entry.revision) || 0,
    reason: 'manual_correction',
    level: Number(growth.level) || 0,
    elite: Number(growth.elite) || 0,
    star_level: Number(growth.star) || 0,
    disc_loadouts: (growth.discLoadouts || []).map(function (loadout, index) {
      const names = Array.isArray(loadout.discNames) ? loadout.discNames.slice(0, 3) : []
      return {
        id: String(loadout.id || 'disc_' + (index + 1)),
        name: String(loadout.name || '').trim() || automaticDiscLoadoutName(names),
        discs: names.map(function (name) { return { ot_name: name } })
      }
    }),
    star_stones: (growth.starStones || []).filter(function (stone) { return stone && stone.name }).map(function (stone) {
      return { name: stone.name, type: stone.type, level: Number(stone.level) || 0 }
    }),
    combat_stats: {
      manual_attack: combat.attack == null || combat.attack === '' ? null : Number(combat.attack),
      manual_hp: combat.hp == null || combat.hp === '' ? null : Number(combat.hp),
      display_mode: { attack: modes.attack || null, hp: modes.hp || null },
      oddities: {
        attack: { current: Number(combat.oddityAttack) || 0 },
        hp: { current: Number(combat.oddityHp) || 0 },
        special: { current: Number(entry.combatStats && entry.combatStats.oddities && entry.combatStats.oddities.special ? entry.combatStats.oddities.special.current : 0) }
      }
    }
  }
  if (combat.attack != null || combat.hp != null) {
    patch.combat_stats.source = 'manual'
    patch.combat_stats.combat_input_signature = combatInputSignature(input)
    patch.combat_stats.observed_inputs = {
      level: growth.level,
      elite: growth.elite,
      star_level: growth.star,
      oddities_signature: patch.combat_stats.combat_input_signature,
      equipped_star_stones_signature: patch.combat_stats.combat_input_signature
    }
  }
  return patch
}

async function saveCardDraft(entry) {
  if (!accountId.value || cardSubmitStates.value[entry.id] === 'submitting' || annotationBusyIds.value.has(entry.id)) return
  cardPopoverKey.value = ''
  cardSubmitStates.value = Object.assign({}, cardSubmitStates.value, { [entry.id]: 'submitting' })
  try {
    const changes = cardDraftChanges(entry)
    if (changes.objective) {
      const response = await patchOperatorCurrent({ accountId: accountId.value, operatorId: entry.id, game: saveGame.value, patch: cardPatch(entry) })
      mergePatchedCurrentEntry(entry, response)
      // 客观字段已经成功时先推进其 baseline；若随后备注保存失败，重试只提交备注。
      const objectiveBaseline = parsedCardDraftSnapshot(entry)
      objectiveBaseline.remark = changes.baseline.remark == null ? '' : changes.baseline.remark
      cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, { [entry.id]: JSON.stringify(objectiveBaseline) })
    }
    const draft = ensureCardDraft(entry)
    if (changes.note && draft) {
      const note = String(draft.remark || '').trim() === '' ? null : String(draft.remark)
      await saveOperatorAnnotation(entry, { note: note })
    }
    persistWorkbenchMap('combat-modes', cardCombatModes.value)
    cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, { [entry.id]: cardDraftSnapshot(entry) })
    cardSubmitStates.value = Object.assign({}, cardSubmitStates.value, { [entry.id]: 'success' })
    const timer = cardSubmitTimers.get(entry.id)
    if (timer) clearTimeout(timer)
    cardSubmitTimers.set(entry.id, setTimeout(function () { clearCardSubmitState(entry) }, 1100))
  } catch (err) {
    quickNotices.value = Object.assign({}, quickNotices.value, { [entry.id]: humanErr(err, '保存失败') })
    cardSubmitStates.value = Object.assign({}, cardSubmitStates.value, { [entry.id]: 'error' })
  }
}

function mergePatchedCurrentEntry(entry, payload) {
  const raw = payload && payload.entry && typeof payload.entry === 'object'
    ? payload.entry
    : (payload && payload.operator && typeof payload.operator === 'object' ? payload.operator : payload)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return
  const catalog = catalogMap.value[entry.id] || {}
  const normalized = Object.assign({
    id: entry.id,
    name: catalog.name || entry.name || '',
    rarity: catalog.rarity || entry.rarity,
    prof: catalog.prof || entry.prof || '',
    subProf: catalog.subProf || entry.subProf || '',
    games: catalog.games || entry.games || [],
    spOf: catalog.spOf || entry.spOf || ''
  }, normalizeEntry(raw, catalog.odditySchema))
  Object.assign(entry, normalized)
  const stats = normalized.combatStats || normalizeOperatorCombatStats({})
  const growth = ensureCardDraft(entry)
  if (growth) {
    growth.level = Number(normalized.level) || 0
    growth.elite = Number(normalized.elite) || 0
    growth.star = Number(normalized.starLevel) || 0
    growth.discLoadouts = normalizeCardDiscLoadouts(normalized)
    growth.starStones = normalizeCardStarStones(normalized)
    growth.modes = Object.assign({}, stats.displayMode || {})
  }
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, { [entry.id]: Object.assign({}, stats.displayMode || {}) })
  cardCombatDrafts.value = Object.assign({}, cardCombatDrafts.value, {
    [entry.id]: {
      attack: stats.manualAttack,
      hp: stats.manualHp,
      oddityAttack: stats.oddities && stats.oddities.attack ? stats.oddities.attack.current : 0,
      oddityHp: stats.oddities && stats.oddities.hp ? stats.oddities.hp.current : 0
    }
  })
  if (growth) cardDraftBaselines.value = Object.assign({}, cardDraftBaselines.value, { [entry.id]: cardDraftSnapshot(entry) })
}

async function saveCardCombat(entry) {
  if (!accountId.value || cardCombatSavingIds.value.has(entry.id)) return
  const draft = cardCombatDraft(entry)
  const input = cardCombatInput(entry)
  const signature = combatInputSignature(input)
  const modes = cardCombatModes.value[entry.id] || (entry.combatStats && entry.combatStats.displayMode) || {}
  const patch = {
    expected_revision: Number(entry.revision) || 0,
    reason: 'manual_correction',
    combat_stats: {
      manual_attack: draft.attack == null || draft.attack === '' ? null : Number(draft.attack),
      manual_hp: draft.hp == null || draft.hp === '' ? null : Number(draft.hp),
      display_mode: {
        attack: modes.attack || null,
        hp: modes.hp || null
      },
      oddities: {
        attack: { current: Number(draft.oddityAttack) || 0 },
        hp: { current: Number(draft.oddityHp) || 0 },
        special: { current: Number(entry.combatStats && entry.combatStats.oddities && entry.combatStats.oddities.special ? entry.combatStats.oddities.special.current : 0) }
      }
    }
  }
  if (draft.attack != null || draft.hp != null) {
    patch.combat_stats.source = 'manual'
    patch.combat_stats.combat_input_signature = signature
    patch.combat_stats.observed_inputs = {
      level: entry.level,
      elite: entry.elite,
      star_level: entry.starLevel,
      oddities_signature: signature,
      equipped_star_stones_signature: signature
    }
  }
  cardCombatSavingIds.value = new Set([...cardCombatSavingIds.value, entry.id])
  try {
    const response = await patchOperatorCurrent({ accountId: accountId.value, operatorId: entry.id, game: saveGame.value, patch: patch })
    mergePatchedCurrentEntry(entry, response)
    quickNotices.value = Object.assign({}, quickNotices.value, { [entry.id]: '已保存' })
    window.setTimeout(function () {
      const next = Object.assign({}, quickNotices.value)
      if (next[entry.id] === '已保存') delete next[entry.id]
      quickNotices.value = next
    }, 1400)
  } catch (err) {
    quickNotices.value = Object.assign({}, quickNotices.value, { [entry.id]: humanErr(err, '战斗属性保存失败') })
  } finally {
    const next = new Set(cardCombatSavingIds.value)
    next.delete(entry.id)
    cardCombatSavingIds.value = next
  }
}

async function openEdit(id) {
  if (!auth.isLoggedIn || !accountId.value) { await dialog.alert({ message: '请先登录并选择子账号' }); return }
  const op = catalogMap.value[id]
  if (!op) return
  editorTriggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const existing = currentMap.value[id] || {}
  editingId.value = id
  editingOp.value = op
  applyEditorEntry(existing, op, id, Object.keys(existing).length > 0)
  editConflictDraft.value = null
  editNotice.value = ''
  editNoticeError.value = false
  editing.value = true
}

function applyEditorEntry(existing, op, id, allowCache) {
  existing = existing || {}
  const discState = initialDiscLoadoutState(existing)
  const stones = {}
  stoneSlots.value.forEach(function (slot) {
    const hit = (existing.starStones || []).find(function (s) { return s.type === slot.type })
    stones[slot.type] = {
      name: (hit && hit.name) || '',
      type: slot.type,
      level: (hit && hit.level != null) ? hit.level : 0,
      rarity: hit && (hit.rarity != null ? hit.rarity : hit.levelType)
    }
  })
  // 服务端 current 是权威来源；仅在旧后端完全没有 combat_stats 时读取旧缓存。
  const combatStats = existing.combatStatsPresent
    ? normalizeOperatorCombatStats(existing.combatStats, op.odditySchema)
    : (allowCache ? (loadCachedCombatStats(id) || normalizeOperatorCombatStats({}, op.odditySchema)) : normalizeOperatorCombatStats({}, op.odditySchema))
  ensureOperatorOddities(combatStats, op)
  editForm.value = {
    elite: existing.elite != null ? existing.elite : 0,
    starLevel: existing.starLevel != null ? existing.starLevel : 0,
    level: existing.level != null ? existing.level : 0,
    discLoadouts: discState.loadouts,
    stones: stones,
    combatStats: combatStats
  }
  const currentSignature = combatInputSignature(combatStatsInput.value)
  const observedInputs = combatStats.observedInputs || {}
  if (combatStats.observedStatus !== 'stale' || (
    combatStats.source === 'manual' &&
    observedInputs.level != null && Number(observedInputs.level) === Number(editForm.value.level) &&
    observedInputs.elite != null && Number(observedInputs.elite) === Number(editForm.value.elite) &&
    observedInputs.starLevel != null && Number(observedInputs.starLevel) === Number(editForm.value.starLevel)
  )) {
    combatStats.frontendObservedSignature = currentSignature
  }
  selectedDiscLoadoutIndex.value = discState.activeIndex
  // 新后端返回的服务器偏好是跨设备权威值；旧后端没有该字段时才读取浏览器备用值。
  combatDisplayMode.value = combatStats.displayModePresent
    ? (combatStats.displayMode || { attack: null, hp: null })
    : loadCombatDisplayMode(id)
  combatDisplaySignature = currentSignature
  editOriginalStoneSignature.value = stoneSignature(stones)
  selectedStonePresetIds.value = { main: '', assist: '' }
}

function restoreConflictDraft() {
  if (!editConflictDraft.value) return
  editForm.value = JSON.parse(JSON.stringify(editConflictDraft.value.form))
  combatDisplayMode.value = editConflictDraft.value.displayMode || { attack: null, hp: null }
  combatDisplaySignature = combatInputSignature(combatStatsInput.value)
  selectedDiscLoadoutIndex.value = editConflictDraft.value.selectedDiscLoadoutIndex
  editOriginalStoneSignature.value = editConflictDraft.value.originalStoneSignature
  editConflictDraft.value = null
  editNotice.value = '已恢复本次修改，请确认服务器版本后再次保存'
  editNoticeError.value = false
}

function discardConflictDraft() {
  editConflictDraft.value = null
  editNotice.value = '已采用服务器最新数据'
  editNoticeError.value = false
}

function closeEditor() {
  if (savingEdit.value) return
  const trigger = editorTriggerEl
  editorTriggerEl = null
  editing.value = false
  editingId.value = ''
  editingOp.value = null
  editGame.value = ''
  editNotice.value = ''
  editNoticeError.value = false
  editConflictDraft.value = null
  nextTick(function () {
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true })
  })
}

async function saveEdit() {
  if (!editingOp.value || !accountId.value) return
  editForm.value.discLoadouts.forEach(function (_, index) { ensureDiscLoadoutName(index) })
  const rawLevel = editForm.value.level
  const rawElite = editForm.value.elite
  const rawStarLevel = editForm.value.starLevel
  const level = Number(rawLevel)
  const elite = Number(rawElite)
  const starLevel = Number(rawStarLevel)
  const validInteger = function (raw, value) {
    return raw !== '' && raw != null && Number.isFinite(value) && Number.isInteger(value)
  }
  if (!validInteger(rawLevel, level) || !validInteger(rawElite, elite) || !validInteger(rawStarLevel, starLevel)) {
    editNotice.value = '等级、修为和星级必须填写整数'
    editNoticeError.value = true
    return
  }
  if (level < 0 || level > OPERATOR_LEVEL_MAX) {
    editNotice.value = '等级需在 0..' + OPERATOR_LEVEL_MAX + ' 之间'
    editNoticeError.value = true
    return
  }
  if (elite < 0 || elite > OPERATOR_ELITE_MAX) {
    editNotice.value = '修为需在 0..' + OPERATOR_ELITE_MAX + ' 之间'
    editNoticeError.value = true
    return
  }
  const starMax = editingOp.value.spOf ? 5 : MAX_STAR_LEVEL
  if (starLevel < 0 || starLevel > starMax) {
    editNotice.value = editingOp.value.spOf
      ? 'SP 密探星级需在 0..5 之间'
      : '星级需在 0..' + MAX_STAR_LEVEL + ' 之间（0=未拥有，31=觉醒）'
    editNoticeError.value = true
    return
  }
  const maxElite = getMaxEliteForLevel(level)
  if (elite > maxElite) {
    editNotice.value = '修为不能超过当前等级上限 ' + maxElite
    editNoticeError.value = true
    return
  }
  const stoneValues = Object.keys(editForm.value.stones || {}).map(function (type) {
    const stone = editForm.value.stones[type]
    return Object.assign({ type: type }, stone || {})
  })
  const invalidStone = stoneValues.find(function (stone) {
    if (!stone.name) return false
    const stoneLevel = Number(stone.level)
    return !validInteger(stone.level, stoneLevel) || stoneLevel < 1 || stoneLevel > 60
  })
  const op = editingOp.value
  if (invalidStone) {
    editNotice.value = '已装备星石的等级需为 1..60 的整数'
    editNoticeError.value = true
    return
  }
  const combatStats = editForm.value.combatStats || {}
  const optionalNonNegativeNumber = function (value) {
    return value === '' || value == null || (Number.isFinite(Number(value)) && Number(value) >= 0)
  }
  const invalidOddity = ODDITY_KEYS.find(function (key) {
    const oddity = (combatStats.oddities && combatStats.oddities[key]) || {}
    if (!optionalNonNegativeNumber(oddity.current) || !optionalNonNegativeNumber(oddity.max)) return true
    return oddity.max !== '' && oddity.max != null && Number(oddity.current || 0) > Number(oddity.max)
  })
  if (!optionalNonNegativeNumber(combatStats.manualAttack) || !optionalNonNegativeNumber(combatStats.manualHp) || invalidOddity) {
    editNotice.value = '攻击力、生命力和奇闻属性需为非负数，且不能超过公共图鉴给出的上限'
    editNoticeError.value = true
    return
  }
  const existing = currentMap.value[op.id] || {}
  const discLoadouts = editForm.value.discLoadouts.map(function (loadout, index) {
    return {
      id: String(loadout.id || 'disc_' + (index + 1)),
      name: String(loadout.name || '').trim() || automaticDiscLoadoutName(loadout.discNames),
      discs: loadout.discNames.map(function (name) { return { ot_name: name } })
    }
  })
  const normalizedManual = function (value) {
    return value === '' || value == null ? null : Number(value)
  }
  const oddities = combatStats.oddities || {}
  const currentCombatSignature = combatInputSignature(combatStatsInput.value)
  const manualCorrectionAtCurrentInput = (combatStats.manualAttack != null || combatStats.manualHp != null) && (
    combatStats.combatInputSignature === currentCombatSignature ||
    (combatStats.observedInputs && combatStats.observedInputs.signature === currentCombatSignature)
  )
  const patch = {
    level: level,
    elite: elite,
    star_level: starLevel,
    disc_loadouts: discLoadouts,
    star_stones: stoneValues
      .filter(function (s) { return s && s.name })
      .map(function (s) {
        return {
          name: s.name,
          type: s.type,
          level: Number(s.level) || 0
        }
      }),
    combat_stats: {
      manual_attack: normalizedManual(combatStats.manualAttack),
      manual_hp: normalizedManual(combatStats.manualHp),
      display_mode: {
        attack: combatStats.manualAttack != null && calculatedCombatStats.value.automaticAttackAvailable
          ? (combatAttackAutoVisible.value ? 'auto' : 'manual')
          : null,
        hp: combatStats.manualHp != null && calculatedCombatStats.value.automaticHpAvailable
          ? (combatHpAutoVisible.value ? 'auto' : 'manual')
          : null
      },
      oddities: ODDITY_KEYS.reduce(function (result, key) {
        const value = oddities[key] || {}
        result[key] = { current: Number(value.current) || 0 }
        return result
      }, {})
    },
    expected_revision: Number(existing.revision) || 0,
    reason: 'manual_correction'
  }
  if (manualCorrectionAtCurrentInput) {
    patch.combat_stats.source = 'manual'
    patch.combat_stats.combat_input_signature = currentCombatSignature
    patch.combat_stats.observed_inputs = {
      level: level,
      elite: elite,
      star_level: starLevel,
      oddities_signature: currentCombatSignature,
      equipped_star_stones_signature: currentCombatSignature
    }
  }
  savingEdit.value = true
  editNotice.value = ''
  editNoticeError.value = false
  try {
    try {
      await patchOperatorCurrent({ accountId: accountId.value, operatorId: op.id, game: saveGame.value, patch: patch })
    } catch (firstErr) {
      // 旧后端不认识 display_mode 时，重试不带该可选字段；其余错误（尤其 409）继续原样处理。
      const unsupportedDisplayMode = firstErr && (
        firstErr.code === 'unsupported_field' ||
        /unsupported field.*display[_ ]?mode/i.test(firstErr.message || '')
      )
      if (!unsupportedDisplayMode) throw firstErr
      const legacyPatch = JSON.parse(JSON.stringify(patch))
      if (legacyPatch.combat_stats) delete legacyPatch.combat_stats.display_mode
      await patchOperatorCurrent({ accountId: accountId.value, operatorId: op.id, game: saveGame.value, patch: legacyPatch })
      editNotice.value = '已保存；当前后端暂不支持跨设备记忆显示偏好'
    }
    persistCombatDisplayMode(op.id)
    await reloadCurrent(true)
    editNotice.value = '养成资料与已装备星石均已保存'
    setTimeout(function () {
      closeEditor()
    }, 800)
  } catch (err) {
    if (err && (err.status === 409 || err.code === 'operator_revision_conflict')) {
      const localDraft = {
        form: JSON.parse(JSON.stringify(editForm.value)),
        selectedDiscLoadoutIndex: selectedDiscLoadoutIndex.value,
        originalStoneSignature: editOriginalStoneSignature.value,
        displayMode: JSON.parse(JSON.stringify(combatDisplayMode.value))
      }
      await reloadCurrent(true)
      applyEditorEntry(currentMap.value[op.id] || {}, op, op.id, false)
      editConflictDraft.value = localDraft
      editNotice.value = ''
    } else {
      editNotice.value = humanErr(err, '保存失败')
    }
    editNoticeError.value = true
  } finally {
    savingEdit.value = false
  }
}

function setTab(t) {
  if (!visitedTabs.value.has(t)) visitedTabs.value = new Set(visitedTabs.value).add(t)
  activeTab.value = t
  const currentKey = accountId.value + ':' + gameFilter.value
  if ((t === 'current' || t === 'tracking') && currentLoadedKey !== currentKey) reloadCurrent()
  if (t === 'current' && cardMaterialLoadedAccount.value !== accountId.value) loadCardMaterialStock()
  if (t === 'tracking' && favoriteLoadedAccount !== accountId.value) loadAgentFavorites()
}

async function onGameChange(game) {
  importConfirmReview.value = false
  importResult.value = null
  resetImportPreview()
  const targetAccountId = accountId.value
  const account = accounts.value.find(function (item) { return item.id === targetAccountId })
  // 未升级的账号响应没有 game，继续使用本地映射；新版后端则写回账号权威值。
  if (targetAccountId && account && isAccountGame(account.game)) {
    const previousGame = account.game
    accountBusy.value = true
    accountError.value = ''
    try {
      const updated = await updateOperatorAccountGame(targetAccountId, game)
      if (accountId.value !== targetAccountId) return
      Object.assign(account, updated || {}, { game: isAccountGame(updated && updated.game) ? updated.game : game })
      activeAccount.setGame(account.game, targetAccountId)
    } catch (err) {
      if (accountId.value === targetAccountId) {
        activeAccount.setGame(previousGame, targetAccountId)
        accountError.value = humanErr(err, '游戏版本保存失败')
      }
    } finally {
      if (accountId.value === targetAccountId) accountBusy.value = false
    }
  }
  currentEntries.value = []
  reloadCurrent()
}

// —— 公开目录 ——
async function loadCatalog() {
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const data = await getOperatorCatalog()
    backendCatalog.value = (data && Array.isArray(data.operators)) ? data.operators : []
    catalogVersion.value = (data && data.catalog_version) || ''
  } catch (err) {
    backendCatalog.value = []
    catalogError.value = humanErr(err, '图鉴加载失败，当前显示本地兜底目录')
  } finally {
    catalogLoading.value = false
  }
}

// —— 统一子账号（库存 × 密探共用） ——
async function loadAccounts() {
  if (!auth.isLoggedIn) { accounts.value = []; return }
  accountsLoading.value = true
  accountError.value = ''
  try {
    const list = await listOperatorAccounts()
    accounts.value = Array.isArray(list) ? list : []
    activeAccount.syncAccounts(accounts.value)
    if (accounts.value.length < 2) exportAll.value = false
    // 优先保留 activeAccount 记住的账号；已不存在（被删 / 换人）才回退到第一个
    const still = accounts.value.some(function (a) { return a.id === accountId.value })
    if (!still) accountId.value = accounts.value.length ? accounts.value[0].id : ''
  } catch (err) {
    accountError.value = humanErr(err, '子账号加载失败')
  } finally {
    accountsLoading.value = false
  }
}

function onAccountChange() {
  importConfirmReview.value = false
  importResult.value = null
  resetImportPreview()
  currentEntries.value = []
  error.value = ''
  clearAgentFavorites()
  loadAgentFavorites()
  reloadCurrent()
}

async function onCreateAccount(rawName) {
  const name = (rawName || '').trim()
  if (!name) return
  const selectedGame = gameFilter.value
  accountBusy.value = true
  accountError.value = ''
  try {
    const created = await createOperatorAccount(name, selectedGame)
    await loadAccounts()
    if (created && created.id) {
      activeAccount.setGame(isAccountGame(created.game) ? created.game : selectedGame, created.id)
      accountId.value = created.id
    }
    onAccountChange()
  } catch (err) {
    accountError.value = humanErr(err, '创建子账号失败')
  } finally {
    accountBusy.value = false
  }
}

async function onRenameAccount(acc) {
  const name = await dialog.prompt({
    title: '修改子账号名称',
    message: '修改子账号名称（1~64 字）：',
    value: acc.name || ''
  })
  if (name == null) return
  const trimmed = name.trim()
  if (!trimmed) { accountError.value = '名称不能为空'; return }
  accountBusy.value = true
  accountError.value = ''
  try {
    await renameOperatorAccount(acc.id, trimmed)
    await loadAccounts()
  } catch (err) {
    accountError.value = humanErr(err, '改名失败')
  } finally {
    accountBusy.value = false
  }
}

async function onDeleteAccount(acc) {
  const ok = await dialog.confirm({
    title: '删除子账号',
    message: '删除子账号「' + acc.name + '」？该账号的密探数据、库存数据、特别关注和所有 API Token 都会被一并清除，且不可恢复。',
    type: 'danger',
    confirmText: '删除'
  })
  if (!ok) return
  accountBusy.value = true
  accountError.value = ''
  try {
    await deleteOperatorAccount(acc.id)
    activeAccount.forgetGame(acc.id)
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

// —— 当前养成 ——
async function reloadCurrent(quiet) {
  if (!auth.isLoggedIn) {
    currentLoadSeq += 1
    currentLoadedKey = ''
    currentEntries.value = []
    error.value = ''
    loading.value = false
    return
  }
  if (!accountId.value) {
    currentLoadSeq += 1
    currentLoadedKey = ''
    currentEntries.value = []
    error.value = ''
    loading.value = false
    return
  }
  const targetAccount = accountId.value
  const targetGame = gameFilter.value
  const targetKey = targetAccount + ':' + targetGame
  const seq = ++currentLoadSeq
  loading.value = true
  if (!quiet) error.value = ''
  try {
    const data = await getOperatorCurrent({ accountId: targetAccount, game: targetGame })
    if (seq !== currentLoadSeq || accountId.value !== targetAccount || gameFilter.value !== targetGame) return
    const list = Array.isArray(data) ? data : (data ? [data] : [])
    const combined = {}
    list.forEach(function (doc) {
      const entriesObj = (doc && doc.entries) ? doc.entries : {}
      Object.keys(entriesObj).forEach(function (id) {
        const op = catalogMap.value[id] || {}
        combined[id] = normalizeEntry(entriesObj[id], op.odditySchema)
      })
    })
    currentEntries.value = Object.keys(combined).map(function (id) {
      const op = catalogMap.value[id] || {}
      return Object.assign({ id: id, name: op.name || '', rarity: op.rarity, prof: op.prof || '', subProf: op.subProf || '', games: op.games || [], spOf: op.spOf || '' }, combined[id])
    }).filter(function (e) {
      return matchesGame(e, targetGame)
    }).sort(function (a, b) {
      return (b.level - a.level) || (b.starLevel - a.starLevel) || (b.elite - a.elite) || (operatorReleaseOrder(b.id) - operatorReleaseOrder(a.id))
    })
    currentLoadedKey = targetKey
  } catch (err) {
    if (seq !== currentLoadSeq || accountId.value !== targetAccount || gameFilter.value !== targetGame) return
    if (!quiet) error.value = humanErr(err, '加载失败，请稍后重试')
  } finally {
    if (seq === currentLoadSeq && accountId.value === targetAccount && gameFilter.value === targetGame) loading.value = false
  }
}

function scheduleEventRefresh() {
  if (accountEventRefreshTimer != null) return
  accountEventRefreshTimer = setTimeout(function () {
    accountEventRefreshTimer = null
    reloadCurrent(true)
  }, 180)
}

function setOperatorSlotElement(operatorId, element) {
  if (element) operatorSlotElements.set(operatorId, element)
  else operatorSlotElements.delete(operatorId)
}

function scanTargetIsVisible(element) {
  const rect = element.getBoundingClientRect()
  return rect.top >= 96 && rect.bottom <= window.innerHeight - 96
}

function waitForScanScroll(reducedMotion) {
  return new Promise(function (resolve) {
    let timer = null
    let finished = false
    function finish() {
      if (finished) return
      finished = true
      if (timer != null) clearTimeout(timer)
      window.removeEventListener('scrollend', finish)
      document.removeEventListener('scrollend', finish)
      if (finishPendingScanScroll === finish) finishPendingScanScroll = null
      resolve()
    }
    finishPendingScanScroll = finish
    if (reducedMotion) {
      requestAnimationFrame(finish)
      return
    }
    window.addEventListener('scrollend', finish, { once: true })
    document.addEventListener('scrollend', finish, { once: true })
    timer = setTimeout(finish, 720)
  })
}

async function focusAndFlashScanOperator(operatorId, effect) {
  if (!operatorId) return
  const focusSeq = ++scanFocusSeq
  if (finishPendingScanScroll) finishPendingScanScroll()
  activeTab.value = 'catalog'
  if (!manifestEntries.value.some(function (entry) { return entry.id === operatorId })) {
    manifestSearch.value = ''
    manifestFilter.value = 'all'
    profFilter.value = 'all'
    subProfFilter.value = 'all'
  }
  await nextTick()
  if (focusSeq !== scanFocusSeq) return
  const target = operatorSlotElements.get(operatorId)
  if (!target) {
    flashScanOperator(operatorId, effect)
    return
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!scanTargetIsVisible(target)) {
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' })
    await waitForScanScroll(reducedMotion)
    if (focusSeq !== scanFocusSeq) return
  }
  flashScanOperator(operatorId, effect)
}

function flashScanOperator(operatorId, effect) {
  if (!operatorId) return
  const existingTimer = scanEffectTimers.get(operatorId)
  if (existingTimer != null) clearTimeout(existingTimer)
  scanEffectById.value = Object.assign({}, scanEffectById.value, { [operatorId]: '' })
  nextTick(function () {
    scanEffectById.value = Object.assign({}, scanEffectById.value, { [operatorId]: effect })
    const hasExtendedEffect = operatorId === 'char_084_chendengsp' || operatorId === 'char_085_shizimiaosp'
    const effectDuration = hasExtendedEffect ? 1350 : (effect === 'new' ? 1200 : 700)
    scanEffectTimers.set(operatorId, setTimeout(function () {
      const next = Object.assign({}, scanEffectById.value)
      delete next[operatorId]
      scanEffectById.value = next
      scanEffectTimers.delete(operatorId)
    }, effectDuration))
  })
}

function handleAccountEvent(message) {
  if (!message) return
  if (message.event === 'account_stream_open') {
    scheduleEventRefresh()
    return
  }
  if (message.event === 'operator-upgrade') {
    const data = message.data || {}
    if (data.account_id && data.account_id !== accountId.value) return
    const transactionId = data.transaction_id || data.transactionId
    if (transactionId && handledUpgradeTransactionIds.has(transactionId)) return
    if (transactionId) handledUpgradeTransactionIds.add(transactionId)
    const id = data.operator_id || data.operatorId
    const entry = currentMap.value[id]
    if (!entry) {
      reloadCurrent(true)
      if (visitedTabs.value.has('current')) loadCardMaterialStock()
      return
    }
    const dimension = data.dimension
    const next = Number(data.to) || 0
    applyUpgradeOperator(entry, {
      level: dimension === 'level' ? next : entry.level,
      elite: dimension === 'elite' ? next : entry.elite,
      star_level: dimension === 'huaji' ? next : entry.starLevel,
      revision: data.operator_revision != null ? data.operator_revision : data.operatorRevision
    })
    applyUpgradeConsumption(data.consumed)
    showQuickNotice(id, '养成与库存已同步', 2200)
    return
  }
  if (message.event !== 'operator_scan_import') return
  const data = message.data || {}
  if (data.account_id && data.account_id !== accountId.value) return
  if (data.status === 'accepted' || data.status === 'partial') {
    if (!data.preview) scheduleEventRefresh()
    focusAndFlashScanOperator(data.operator_id, Number(data.revision) === 1 ? 'new' : 'updated')
  }
}

function stopAccountEventSubscription() {
  if (accountEventRefreshTimer != null) clearTimeout(accountEventRefreshTimer)
  accountEventRefreshTimer = null
  if (unsubscribeAccountEvents) unsubscribeAccountEvents()
  unsubscribeAccountEvents = null
  scanFocusSeq += 1
  if (finishPendingScanScroll) finishPendingScanScroll()
  finishPendingScanScroll = null
  operatorSlotElements.clear()
  scanEffectTimers.forEach(clearTimeout)
  scanEffectTimers.clear()
}

// —— 导入 / 导出 ——
function parseImportDocument() {
  if (!importText.value.trim()) throw new Error('请粘贴交换协议 JSON 或选择文件')
  const parsed = JSON.parse(importText.value)
  return parsed && parsed.document ? parsed.document : parsed
}

function v3ImportRequest(document, confirmReview) {
  return buildOperatorV3BrowserRequest(document, accountId.value, confirmReview)
}

function resetImportPreview() {
  importPreview.value = null
  importPreviewKey.value = ''
}

function onImportTextInput() {
  importError.value = ''
  importResult.value = null
  importConfirmReview.value = false
  resetImportPreview()
}

async function previewV3Import() {
  if (!auth.isLoggedIn) { goLogin(); return }
  importError.value = ''
  importResult.value = null
  let requestBody
  try {
    const document = parseImportDocument()
    if (!isOperatorV3Document(document)) throw new Error('请选择密探养成数据交换协议 v3 文档')
    requestBody = v3ImportRequest(document, importConfirmReview.value)
  } catch (err) {
    importError.value = err instanceof SyntaxError ? 'JSON 解析失败，请检查格式' : humanErr(err, 'v3 档案校验失败')
    resetImportPreview()
    return
  }
  importing.value = true
  resetImportPreview()
  try {
    const response = await previewOperatorImport(requestBody)
    importPreview.value = normalizeOperatorV3ImportResponse(response)
    importPreviewKey.value = JSON.stringify(requestBody)
  } catch (err) {
    importError.value = humanErr(err, 'v3 档案预览失败')
  } finally {
    importing.value = false
  }
}

async function commitV3Import() {
  if (!canCommitV3Import.value || importing.value) return
  importError.value = ''
  let requestBody
  try {
    requestBody = v3ImportRequest(parseImportDocument(), importConfirmReview.value)
    if (JSON.stringify(requestBody) !== importPreviewKey.value) throw new Error('档案或目标账号已经变化，请重新预览')
  } catch (err) {
    importError.value = err instanceof SyntaxError ? 'JSON 解析失败，请检查格式' : humanErr(err, '无法提交导入')
    resetImportPreview()
    return
  }
  importing.value = true
  try {
    const response = normalizeOperatorV3ImportResponse(await importOperator(requestBody))
    importResult.value = Object.assign({ kind: 'v3' }, response)
    resetImportPreview()
    await reloadCurrent(true)
  } catch (err) {
    importError.value = humanErr(err, 'v3 档案导入失败')
  } finally {
    importing.value = false
  }
}

function onImportReviewChange() {
  importPreviewKey.value = ''
  importResult.value = null
}

function importStatusLabel(status) {
  return {
    accepted: '可导入',
    partial: '部分导入',
    review: '待复核',
    rejected: '已拒绝',
    unchanged: '无变化'
  }[status] || status
}

function importOperatorName(id) {
  const op = catalogMap.value[id]
  return op && op.name ? op.name + ' · ' + id : id
}

function importFieldLabel(field) {
  return {
    level: '等级',
    elite: '修为',
    star_level: '化极',
    disc_loadouts: '命盘',
    star_stones: '已装备星石',
    equipped_star_stones: '已装备星石',
    combat_stats: '奇闻与攻生'
  }[field] || field
}

function importValueLabel(value) {
  if (value == null) return '无'
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '空'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function doImport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  importError.value = ''
  let doc = null
  try {
    doc = parseImportDocument()
  } catch (err) {
    importError.value = err instanceof SyntaxError ? 'JSON 解析失败，请检查格式' : humanErr(err, '导入档案校验失败')
    return
  }
  if (isOperatorV3Document(doc)) { await previewV3Import(); return }
  // 若用户粘贴的文档使用占位 account_id，替换为当前账号，便于直接导入
  if (accountId.value && doc && Array.isArray(doc.accounts)) {
    doc.accounts = doc.accounts.map(function (a) { return Object.assign({}, a, { id: accountId.value }) })
  }
  if (accountId.value && doc && Array.isArray(doc.records)) {
    doc.records = doc.records.map(function (r) { return Object.assign({}, r, { account_id: accountId.value }) })
  }
  importing.value = true
  importResult.value = null
  try {
    const res = await importOperator(doc)
    importResult.value = Object.assign({ kind: 'v2' }, res || {})
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
    onImportTextInput()
  }
  reader.readAsText(file, 'utf-8')
}

function fillExample() {
  const op = catalogOperators.value.find(function (entry) {
    return matchesGame(entry, saveGame.value) && !entry.spOf
  }) || catalogOperators.value[0] || {}
  const account = accounts.value.find(function (a) { return a.id === accountId.value }) || { id: accountId.value || 'acc_demo', name: '示例账号' }
  const now = new Date().toISOString()
  const doc = {
    format: 'myshare-operator-exchange',
    version: 3,
    exported_at: now,
    catalog_version: catalogVersion.value || 'local',
    producer: { platform: 'yuanhub', version: '1' },
    accounts: [{ id: 'local_example', name: account.name }],
    records: [{
      account_id: 'local_example',
      record_id: 'yuanhub:example:' + Date.now(),
      record_type: 'operator_snapshot',
      game: saveGame.value,
      effective_at: now,
      snapshot_scope: 'listed',
      source_kind: 'manual',
      coverage: { complete: false, record_count: 1, unmatched_count: 0, interrupted: false },
      entries: [{
        operator_id: op.id || 'char_001_yangxiu',
        name: op.name || '杨修',
        elite: 0,
        star_level: 30,
        level: 40,
        disc_loadouts: [],
        equipped_star_stones: [],
        section_status: {
          basic: 'ready',
          huaji: 'ready',
          disc_loadouts: 'ready',
          equipment: 'ready'
        }
      }]
    }]
  }
  importText.value = JSON.stringify(doc, null, 2)
  onImportTextInput()
}

function afterImport() {
  importResult.value = null
  importConfirmReview.value = false
  resetImportPreview()
  importText.value = ''
  importError.value = ''
  showImport.value = false
  subjectiveRefreshKey.value += 1
  Promise.all([reloadCurrent(), loadOperatorAnnotations(), loadAgentFavorites()])
}

async function doExport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!accountId.value) { await dialog.alert({ message: '请先创建并选择一个子账号' }); return }
  try {
    const opts = { version: 3 }
    if (exportAll.value && accounts.value.length > 1) {
      opts.scope = 'all'
    } else {
      opts.accountId = accountId.value
    }
    const data = await exportOperator(opts)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'operator-full-backup-v3.json'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (err) {
    await dialog.alert({ title: '导出失败', message: humanErr(err, '导出失败') })
  }
}

function humanErr(err, fallback) {
  if (!err) return fallback
  const byCode = {
    annotation_revision_conflict: '养成状态或备注已在其他页面更新，已重新同步',
    operator_state_stale: '密探养成状态已变化，请重新确认提升',
    inventory_state_stale: '库存已变化，请重新确认提升',
    insufficient_inventory: '库存材料不足，无法完成提升',
    idempotency_conflict: '本次提升请求已变化，请重新打开预览',
    invalid_growth_state: '养成状态无效',
    invalid_upgrade_target: '当前目标不能通过快捷提升完成',
    invalid_star_level: '化极目标超过该密探允许的范围',
    preview_expired: '提升预览已过期，请重新确认'
  }
  if (err.code && byCode[err.code]) return byCode[err.code]
  const msg = err.message
  if (!msg) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return '网络异常，请检查后端服务是否已启动'
  return msg
}

function goLogin() { location.href = '/login' }

onMounted(async function () {
  document.addEventListener('pointerdown', handleCardPopoverOutside)
  window.addEventListener('scroll', hideDiscTooltip, true)
  window.addEventListener('resize', hideDiscTooltip)
  await Promise.all([loadCatalog(), loadAccounts()])
  await Promise.all([reloadCurrent(), loadAgentFavorites()])
  unsubscribeAccountEvents = subscribeAccountEvents(handleAccountEvent)
})

onBeforeUnmount(function () {
  document.removeEventListener('pointerdown', handleCardPopoverOutside)
  window.removeEventListener('scroll', hideDiscTooltip, true)
  window.removeEventListener('resize', hideDiscTooltip)
  stopAccountEventSubscription()
  if (bodyLockedByEditor) document.body.style.overflow = bodyOverflowBeforeEditor
})
</script>

<style scoped>
/* —— 复用全局 CSS 变量（不新增色值），对齐库存（inventory）页版式 —— */
.operator-main { padding-bottom: 0 }
.page-operator .hero::after { content: '密探' }

/* ---- 统一子账号：选择/管理已抽到共用组件 AccountWorkspace.vue ---- */

.operator-tabs { display: flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 14px; padding: 4px; margin-top: 40px; flex-wrap: wrap; align-items: center }
.operator-tabs button { border: none; background: transparent; font-family: var(--font-b); font-weight: 700; font-size: 14px; padding: 10px 26px; border-radius: 10px; cursor: pointer; color: var(--ink-60); transition: all .3s var(--ease) }
.operator-tabs button.on { background: var(--tea); color: var(--cream) }
.operator-tabs button:hover:not(.on) { color: var(--ink) }
.operator-tabs .sp { flex: 1 }
.operator-mobile-tabs { display: none }
.build-row.is-scan-updated { animation: operator-scan-update .7s ease-out }
.build-row.is-scan-new { animation: operator-scan-new 1.2s var(--ease) }
.slot.is-scan-new .slot-ic, .slot.is-scan-updated .slot-ic { transform-origin: center; animation: operator-scanner-shell .88s ease-out both }
.slot.is-scan-updated .slot-ic { animation-duration: .68s }
.slot.is-scan-new .slot-ic::before, .slot.is-scan-updated .slot-ic::before {
  position: absolute; z-index: 8; top: -10px; right: 8px; left: 8px; height: 3px; border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--operator-scanner-accent), #fff, var(--operator-scanner-accent), transparent);
  box-shadow: 0 0 10px var(--operator-scanner-accent), 0 0 22px color-mix(in srgb, var(--operator-scanner-accent) 65%, transparent);
  content: ''; opacity: 0; pointer-events: none; animation: operator-scanner-line .62s cubic-bezier(.2,.8,.2,1) both;
}
.slot.is-scan-new .slot-ic::after, .slot.is-scan-updated .slot-ic::after {
  position: absolute; z-index: 2; top: -22px; right: 10px; left: 10px; height: 26px;
  background: linear-gradient(to bottom, color-mix(in srgb, var(--operator-scanner-accent) 24%, transparent), transparent);
  content: ''; opacity: 0; filter: blur(8px); pointer-events: none; animation: operator-scanner-glow .62s cubic-bezier(.2,.8,.2,1) both;
}
.slot.is-scan-new .slot-avatar, .slot.is-scan-new .slot-ph,
.slot.is-scan-updated .slot-avatar, .slot.is-scan-updated .slot-ph {
  animation: operator-scanner-reveal .72s cubic-bezier(.18,.82,.22,1) .12s both;
}
.slot.rarity-r5 .slot-ic { --operator-scanner-accent: var(--accent) }
.slot.rarity-r4 .slot-ic { --operator-scanner-accent: #9483bf }
.slot.rarity-r3 .slot-ic { --operator-scanner-accent: #9bb5cf }
.operator-seed-layer { position: absolute; z-index: 2; pointer-events: none; opacity: 0 }
.seed-ring {
  top: 52%; left: 50%; width: 34%; aspect-ratio: 1; border: 1px solid color-mix(in srgb, var(--yellow-deep) 58%, transparent); border-radius: 50%;
  box-shadow: 0 0 9px color-mix(in srgb, var(--yellow-deep) 20%, transparent); transform: translate(-50%, -50%) scale(.3);
}
.seed-grain {
  top: calc(52% - 5px); left: calc(50% - 3px); width: 7px; height: 11px; border-radius: 70% 30% 70% 30%;
  background: var(--yellow-deep); box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 42%, transparent);
}
.seed-grain-one { --seed-x: -36px; --seed-y: -22px; --seed-rotate: -25deg }
.seed-grain-two { --seed-x: 34px; --seed-y: -26px; --seed-rotate: 31deg }
.seed-grain-three { --seed-x: -40px; --seed-y: 11px; --seed-rotate: -55deg }
.seed-grain-four { --seed-x: 39px; --seed-y: 14px; --seed-rotate: 58deg }
.seed-grain-five { --seed-x: -20px; --seed-y: 34px; --seed-rotate: -10deg }
.seed-grain-six { --seed-x: 23px; --seed-y: 33px; --seed-rotate: 16deg }
.slot.is-chendeng-sp.is-scan-new .slot-ic, .slot.is-chendeng-sp.is-scan-updated .slot-ic {
  border-style: solid;
  animation: operator-seed-shell 1.15s cubic-bezier(.22, 1, .36, 1) both;
}
.slot.is-chendeng-sp.is-scan-new .slot-ic::before, .slot.is-chendeng-sp.is-scan-new .slot-ic::after,
.slot.is-chendeng-sp.is-scan-updated .slot-ic::before, .slot.is-chendeng-sp.is-scan-updated .slot-ic::after {
  content: none; animation: none;
}
.slot.is-chendeng-sp.is-scan-new .seed-ring, .slot.is-chendeng-sp.is-scan-updated .seed-ring { animation: operator-seed-ripple .95s cubic-bezier(.22, 1, .36, 1) both }
.slot.is-chendeng-sp.is-scan-new .seed-ring-two, .slot.is-chendeng-sp.is-scan-updated .seed-ring-two { animation-delay: .16s }
.slot.is-chendeng-sp.is-scan-new .seed-ring-three, .slot.is-chendeng-sp.is-scan-updated .seed-ring-three { animation-delay: .3s }
.slot.is-chendeng-sp.is-scan-new .seed-grain, .slot.is-chendeng-sp.is-scan-updated .seed-grain { animation: operator-seed-burst .72s cubic-bezier(.22, 1, .36, 1) both }
.slot.is-chendeng-sp.is-scan-new .seed-grain-two, .slot.is-chendeng-sp.is-scan-updated .seed-grain-two { animation-delay: .05s }
.slot.is-chendeng-sp.is-scan-new .seed-grain-three, .slot.is-chendeng-sp.is-scan-updated .seed-grain-three { animation-delay: .1s }
.slot.is-chendeng-sp.is-scan-new .seed-grain-four, .slot.is-chendeng-sp.is-scan-updated .seed-grain-four { animation-delay: .15s }
.slot.is-chendeng-sp.is-scan-new .seed-grain-five, .slot.is-chendeng-sp.is-scan-updated .seed-grain-five { animation-delay: .2s }
.slot.is-chendeng-sp.is-scan-new .seed-grain-six, .slot.is-chendeng-sp.is-scan-updated .seed-grain-six { animation-delay: .25s }
.slot.is-chendeng-sp.is-scan-new .slot-avatar, .slot.is-chendeng-sp.is-scan-new .slot-ph,
.slot.is-chendeng-sp.is-scan-updated .slot-avatar, .slot.is-chendeng-sp.is-scan-updated .slot-ph {
  animation: operator-seed-reveal .72s cubic-bezier(.22, 1, .36, 1) .25s both;
}
.operator-rune-layer {
  position: absolute; z-index: 2; top: 50%; left: 50%; aspect-ratio: 1; border-radius: 50%; opacity: 0;
  pointer-events: none; transform: translate(-50%, -54%);
}
.rune-ring-outer { width: 78%; border: 1px solid color-mix(in srgb, #9483bf 74%, var(--surface)); box-shadow: 0 0 14px rgba(111, 86, 136, .28), inset 0 0 10px rgba(148, 131, 191, .2) }
.rune-ring-inner { width: 61%; border: 1px dashed color-mix(in srgb, #9483bf 52%, var(--surface)); box-shadow: inset 0 0 12px rgba(111, 86, 136, .14) }
.rune-glyphs { display: flex; width: 88%; align-items: flex-start; justify-content: center; border: 1px dotted color-mix(in srgb, #9483bf 58%, transparent) }
.rune-glyphs::before { padding-top: 3px; color: color-mix(in srgb, #9483bf 72%, var(--surface)); content: '✦ 玄 ✧ 烛 ✦'; font: 800 9px var(--font-s); text-shadow: 0 0 7px rgba(111, 86, 136, .7); word-spacing: 4px }
.rune-ripple-one, .rune-ripple-two { width: 42%; border: 1px solid color-mix(in srgb, #9483bf 48%, transparent); box-shadow: 0 0 10px rgba(111, 86, 136, .16) }
.slot.is-shizimiao-sp.is-scan-new .slot-ic, .slot.is-shizimiao-sp.is-scan-updated .slot-ic {
  --operator-rune-accent: #9483bf;
  --operator-rune-deep: #6f5688;
  border-style: solid;
  animation: operator-rune-shell 1.15s cubic-bezier(.22, 1, .36, 1) both;
}
.slot.is-shizimiao-sp.is-scan-new .slot-ic::before, .slot.is-shizimiao-sp.is-scan-new .slot-ic::after,
.slot.is-shizimiao-sp.is-scan-updated .slot-ic::before, .slot.is-shizimiao-sp.is-scan-updated .slot-ic::after {
  content: none; animation: none;
}
.slot.is-shizimiao-sp.is-scan-new .rune-ring-outer, .slot.is-shizimiao-sp.is-scan-updated .rune-ring-outer { animation: operator-rune-ring-outer .95s cubic-bezier(.18, .82, .2, 1) .02s both }
.slot.is-shizimiao-sp.is-scan-new .rune-ring-inner, .slot.is-shizimiao-sp.is-scan-updated .rune-ring-inner { animation: operator-rune-ring-inner .88s cubic-bezier(.18, .82, .2, 1) .08s both }
.slot.is-shizimiao-sp.is-scan-new .rune-glyphs, .slot.is-shizimiao-sp.is-scan-updated .rune-glyphs { animation: operator-rune-glyphs .98s cubic-bezier(.22, 1, .36, 1) .05s both }
.slot.is-shizimiao-sp.is-scan-new .rune-ripple-one, .slot.is-shizimiao-sp.is-scan-updated .rune-ripple-one { animation: operator-rune-ripple-one .92s cubic-bezier(.22, 1, .36, 1) .1s both }
.slot.is-shizimiao-sp.is-scan-new .rune-ripple-two, .slot.is-shizimiao-sp.is-scan-updated .rune-ripple-two { animation: operator-rune-ripple-two 1s cubic-bezier(.22, 1, .36, 1) .26s both }
.slot.is-shizimiao-sp.is-scan-new .slot-avatar, .slot.is-shizimiao-sp.is-scan-new .slot-ph,
.slot.is-shizimiao-sp.is-scan-updated .slot-avatar, .slot.is-shizimiao-sp.is-scan-updated .slot-ph {
  animation: operator-rune-reveal .76s cubic-bezier(.22, 1, .36, 1) .28s both;
}
.slot.is-fazheng .slot-ic {
  transition: border-color 1.2s cubic-bezier(.22, 1, .36, 1), box-shadow 1.2s cubic-bezier(.22, 1, .36, 1), border-radius 1.05s steps(6, end);
}
.slot.is-fazheng.is-scan-new .slot-ic, .slot.is-fazheng.is-scan-updated .slot-ic {
  --operator-pixel-purple: #6f5688;
  border-style: solid;
  border-radius: 2px;
  animation: operator-pixel-shell .68s steps(6, end) both;
}
.slot.is-fazheng.is-scan-new .slot-ic::before, .slot.is-fazheng.is-scan-updated .slot-ic::before {
  top: -8px; right: 5px; left: 5px; height: 4px; border-radius: 0;
  background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--operator-pixel-purple) 38%, var(--tea)) 0 5px, var(--operator-pixel-purple) 5px 9px, color-mix(in srgb, var(--operator-pixel-purple) 72%, var(--cream)) 9px 11px, color-mix(in srgb, var(--operator-pixel-purple) 52%, var(--tea)) 11px 15px);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--operator-pixel-purple) 48%, var(--tea)), 0 3px 0 rgba(111, 86, 136, .14);
  animation: operator-pixel-scan .56s steps(8, end) both;
}
.slot.is-fazheng.is-scan-new .slot-ic::after, .slot.is-fazheng.is-scan-updated .slot-ic::after {
  inset: 3px; height: auto;
  background: linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple)) left top / 22px 2px no-repeat, linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple)) right top / 9px 2px no-repeat, linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple)) left bottom / 10px 2px no-repeat, linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple)) right bottom / 20px 2px no-repeat, linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple)) left top / 2px 16px no-repeat, linear-gradient(var(--operator-pixel-purple), var(--operator-pixel-purple)) right bottom / 2px 18px no-repeat, repeating-linear-gradient(0deg, rgba(255, 253, 246, .04) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(111, 86, 136, .16) 0 2px, transparent 2px 9px);
  filter: none; mix-blend-mode: multiply; animation: operator-pixel-noise .58s steps(5, end) .06s both;
}
.slot.is-fazheng.is-scan-new .slot-avatar, .slot.is-fazheng.is-scan-new .slot-ph,
.slot.is-fazheng.is-scan-updated .slot-avatar, .slot.is-fazheng.is-scan-updated .slot-ph {
  animation: operator-pixel-reveal .58s steps(6, end) .08s both;
}
@keyframes operator-scan-update { 0% { background-color: transparent; box-shadow: inset 0 0 0 0 rgba(215, 137, 53, 0) } 40% { background-color: rgba(239, 210, 142, .3); box-shadow: inset 4px 0 0 var(--accent) } 100% { background-color: transparent; box-shadow: inset 0 0 0 0 rgba(215, 137, 53, 0) } }
@keyframes operator-scan-new { 0% { opacity: .55; transform: translateY(6px) scale(.985); box-shadow: 0 0 0 0 rgba(215, 137, 53, 0) } 45% { opacity: 1; transform: translateY(-2px) scale(1.01); box-shadow: 0 0 0 6px rgba(215, 137, 53, .18) } 100% { opacity: 1; transform: translateY(0) scale(1); box-shadow: 0 0 0 0 rgba(215, 137, 53, 0) } }
@keyframes operator-scanner-line { 0% { transform: translateY(0); opacity: 0 } 8% { opacity: 1 } 92% { opacity: 1 } 100% { transform: translateY(130px); opacity: 0 } }
@keyframes operator-scanner-glow { 0% { transform: translateY(0); opacity: 0 } 8% { opacity: .65 } 92% { opacity: .7 } 100% { transform: translateY(130px); opacity: 0 } }
@keyframes operator-scanner-reveal { 0% { opacity: .16; filter: grayscale(1) brightness(.45) } 42% { opacity: .78; filter: grayscale(.55) brightness(1.55) } 72% { opacity: 1; filter: grayscale(0) brightness(1.9) } 100% { opacity: 1; filter: none } }
@keyframes operator-scanner-shell { 0% { transform: scale(1) } 58% { transform: scale(1.018) } 100% { transform: scale(1) } }
@keyframes operator-seed-shell {
  0% { border-color: color-mix(in srgb, var(--tea) 72%, var(--yellow-deep)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--yellow-deep) 12%, transparent) }
  52% { border-color: var(--yellow-deep); box-shadow: inset 0 0 24px color-mix(in srgb, var(--yellow) 30%, transparent), 0 0 28px color-mix(in srgb, var(--accent) 24%, transparent) }
  100% { border-color: var(--accent); box-shadow: inset 0 0 0 2px rgba(239, 210, 142, .5) }
}
@keyframes operator-seed-ripple { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.3) } 22% { opacity: .72 } 100% { opacity: 0; transform: translate(-50%, -50%) scale(2.7) } }
@keyframes operator-seed-burst { 0% { opacity: 0; transform: translate(0, 0) rotate(0) scale(.5) } 28% { opacity: 1 } 100% { opacity: 0; transform: translate(var(--seed-x), var(--seed-y)) rotate(var(--seed-rotate)) scale(1) } }
@keyframes operator-seed-reveal { 0% { opacity: .15; filter: grayscale(1) brightness(.45) } 54% { opacity: 1; filter: grayscale(.15) brightness(1.65) } 100% { opacity: 1; filter: none } }
@keyframes operator-rune-shell {
  0% { border-color: color-mix(in srgb, var(--operator-rune-deep) 42%, var(--tea)); box-shadow: inset 0 0 0 2px rgba(111, 86, 136, .08) }
  54% { border-color: color-mix(in srgb, var(--operator-rune-accent) 72%, var(--surface)); box-shadow: inset 0 0 28px rgba(111, 86, 136, .22), 0 0 30px rgba(148, 131, 191, .24) }
  100% { border-color: var(--accent); box-shadow: inset 0 0 0 2px rgba(239, 210, 142, .5) }
}
@keyframes operator-rune-ring-outer { 0% { opacity: 0; transform: translate(-50%, -54%) scale(.55) rotate(-25deg) } 30% { opacity: 1 } 80% { opacity: .75 } 100% { opacity: 0; transform: translate(-50%, -54%) scale(1.12) rotate(65deg) } }
@keyframes operator-rune-ring-inner { 0% { opacity: 0; transform: translate(-50%, -54%) scale(.72) rotate(18deg) } 28% { opacity: .8 } 100% { opacity: 0; transform: translate(-50%, -54%) scale(1.18) rotate(-54deg) } }
@keyframes operator-rune-glyphs { 0% { opacity: 0; transform: translate(-50%, -54%) scale(.78) rotate(24deg) } 34% { opacity: .92 } 100% { opacity: 0; transform: translate(-50%, -54%) scale(1.15) rotate(-86deg) } }
@keyframes operator-rune-ripple-one { 0% { opacity: 0; transform: translate(-50%, -54%) scale(.2) } 18% { opacity: .8 } 100% { opacity: 0; transform: translate(-50%, -54%) scale(2.1) } }
@keyframes operator-rune-ripple-two { 0% { opacity: 0; transform: translate(-50%, -54%) scale(.25) } 24% { opacity: .6 } 100% { opacity: 0; transform: translate(-50%, -54%) scale(2.55) } }
@keyframes operator-rune-reveal { 0% { opacity: .15; filter: grayscale(1) brightness(.45) } 52% { opacity: 1; filter: grayscale(.12) brightness(1.7) saturate(1.2) } 100% { opacity: 1; filter: none } }
@keyframes operator-pixel-scan { 0% { transform: translateY(0); opacity: 0 } 7% { opacity: 1 } 90% { opacity: 1 } 100% { transform: translateY(136px); opacity: 0 } }
@keyframes operator-pixel-noise { 0%, 100% { opacity: 0 } 20%, 60% { opacity: .9 } 40%, 80% { opacity: .28 } }
@keyframes operator-pixel-reveal { 0% { opacity: .14; filter: grayscale(1) brightness(.3) contrast(1.35) } 34% { opacity: .42; filter: grayscale(.95) brightness(.65) contrast(1.7) } 67% { opacity: 1; filter: grayscale(.25) brightness(1.25) contrast(1.5) } 100% { opacity: 1; filter: none } }
@keyframes operator-pixel-shell {
  0% { transform: translate(0, 0); border-color: color-mix(in srgb, var(--operator-pixel-purple) 34%, var(--tea)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--operator-pixel-purple) 24%, var(--tea)), 3px 3px 0 color-mix(in srgb, var(--operator-pixel-purple) 16%, var(--tea)) }
  20% { transform: translate(-2px, 0); border-color: color-mix(in srgb, var(--operator-pixel-purple) 52%, var(--tea)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--operator-pixel-purple) 38%, var(--tea)), -3px 2px 0 color-mix(in srgb, var(--operator-pixel-purple) 22%, var(--tea)) }
  40% { transform: translate(2px, -1px); border-color: var(--operator-pixel-purple); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--operator-pixel-purple) 52%, var(--tea)), 4px 0 0 color-mix(in srgb, var(--operator-pixel-purple) 34%, var(--tea)) }
  60% { transform: translate(-1px, 1px); border-color: color-mix(in srgb, var(--operator-pixel-purple) 76%, var(--cream)); box-shadow: inset 0 0 0 2px var(--operator-pixel-purple), -2px 3px 0 color-mix(in srgb, var(--operator-pixel-purple) 42%, var(--tea)) }
  80% { transform: translate(1px, 0); border-color: var(--operator-pixel-purple); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--operator-pixel-purple) 58%, var(--tea)), 2px 2px 0 color-mix(in srgb, var(--operator-pixel-purple) 28%, var(--tea)) }
  100% { transform: translate(0, 0); border-color: color-mix(in srgb, var(--operator-pixel-purple) 48%, var(--tea)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--operator-pixel-purple) 36%, var(--tea)), 3px 3px 0 color-mix(in srgb, var(--operator-pixel-purple) 18%, var(--tea)) }
}
@media (prefers-reduced-motion: reduce) {
  .slot.is-fazheng .slot-ic { transition: none }
  .operator-seed-layer { animation: none !important; opacity: 0 }
  .operator-rune-layer { animation: none !important; opacity: 0 }
  .build-row.is-scan-updated, .build-row.is-scan-new, .slot.is-scan-new .slot-ic, .slot.is-scan-updated .slot-ic, .slot.is-scan-new .slot-ic::before, .slot.is-scan-new .slot-ic::after, .slot.is-scan-updated .slot-ic::before, .slot.is-scan-updated .slot-ic::after, .slot.is-scan-new .slot-avatar, .slot.is-scan-new .slot-ph, .slot.is-scan-updated .slot-avatar, .slot.is-scan-updated .slot-ph { animation: none }
}
.act-btn { border: 1.5px solid var(--line); background: var(--surface); border-radius: 999px; padding: 8px 16px; font-size: 12.5px; font-weight: 700; color: var(--ink-60); cursor: pointer; font-family: var(--font-b); transition: all .3s var(--ease); white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 8px }
.admin-link { text-decoration: none; display: inline-flex; align-items: center }
.act-btn.ghost:hover:not(:disabled) { border-color: var(--ink); color: var(--ink) }
.act-btn:disabled { opacity: .45; cursor: not-allowed }

/* ---- 档案操作：与库存页保持同一结构和交互 ---- */
.archive-toggle { min-height: 44px; align-self: center; transform: translateY(9px); background: transparent }
.archive-actions svg { flex: none }
.archive-workspace { border-top: 1px dashed var(--line); background: var(--cream); padding: 16px 24px 18px }
.archive-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px }
.archive-heading h2 { font-family: var(--font-s); font-size: 21px; line-height: 1.3; font-weight: 900; letter-spacing: .04em }
.archive-heading p { margin-top: 5px; color: var(--ink-60); font-size: 12.5px; line-height: 1.7 }
.section-kicker { display: block; margin-bottom: 6px; color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: .14em }
.archive-format { flex: none; border: 1px solid var(--line); border-radius: 999px; padding: 5px 10px; color: var(--ink-60); font-size: 11px; font-weight: 800; white-space: nowrap }
.archive-actions { display: grid; grid-template-columns: minmax(150px, .36fr) minmax(0, 1fr); gap: 18px; align-items: stretch; margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--line) }
.archive-import { min-height: 52px; border-radius: 12px; background: var(--surface) }
.export-group { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center }
.export-label { color: var(--ink-60); font-size: 12px; font-weight: 800; white-space: nowrap }
.export-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px }
.export-option { display: flex; align-items: center; gap: 9px; min-height: 52px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); cursor: pointer; transition: border-color .25s, background-color .25s, box-shadow .25s }
.export-option.active { border-color: var(--accent); background: var(--cream); box-shadow: inset 3px 0 0 var(--accent) }
.export-option.disabled { opacity: .55; cursor: not-allowed }
.export-option input { width: 15px; height: 15px; accent-color: var(--accent); flex: none }
.export-option span { min-width: 0; display: flex; flex-direction: column; gap: 2px }
.export-option b { color: var(--ink); font-size: 12.5px; white-space: nowrap }
.export-option small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-60); font-size: 11px }
.export-submit { min-height: 52px; padding-inline: 18px; border-color: var(--tea); background: var(--tea); color: var(--cream) }
.export-submit:hover:not(:disabled) { border-color: var(--tea-deep); background: var(--tea-deep); color: var(--cream) }

.import-box { margin-top: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 18px 20px }
.import-box .tip { font-size: 12.5px; color: var(--ink-60); line-height: 1.8; margin-bottom: 12px }
.import-target { display: flex; min-height: 38px; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--ink-60); font-size: 12px }
.import-target strong { color: var(--ink); font-size: 13px }
.import-target small { margin-left: auto; border: 1px solid var(--line); border-radius: 999px; padding: 3px 8px; color: var(--accent-strong); font-weight: 800 }
.import-box textarea { width: 100%; min-height: 140px; border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px; font-family: var(--font-b); font-size: 12.5px; color: var(--ink); background: var(--paper); outline: none; resize: vertical; transition: border-color .3s }
.import-box textarea:focus { border-color: var(--accent) }
.import-box textarea[aria-invalid="true"] { border-color: var(--rouge) }
.import-error { min-height: 20px; margin-top: 7px; color: var(--rouge); font-size: 12.5px; font-weight: 700; line-height: 1.6 }
.import-actions { display: flex; gap: 10px; align-items: center; margin-top: 12px }
.file-label { cursor: pointer }
.file-label input { display: none }
.import-preview { margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--line) }
.import-preview-head { display: flex; align-items: center; justify-content: space-between; gap: 16px }
.import-preview-head > div { display: flex; min-width: 0; flex-direction: column; gap: 4px }
.import-preview-head strong { color: var(--ink); font-family: var(--font-s); font-size: 16px; font-weight: 900; letter-spacing: .04em }
.import-preview-head span { color: var(--ink-60); font-size: 12px; line-height: 1.5 }
.import-preview-head .btn { flex: none; min-height: 44px }
.import-review-confirm { display: flex; align-items: center; gap: 9px; min-height: 44px; margin-top: 10px; padding: 7px 10px; border-left: 3px solid var(--accent); background: var(--cream); color: var(--ink); font-size: 12px; font-weight: 700; cursor: pointer }
.import-review-confirm input { width: 17px; height: 17px; accent-color: var(--accent); flex: none }
.import-preview-warning { margin-top: 10px; color: var(--rouge); font-size: 12px; font-weight: 700; line-height: 1.6 }
.import-preview-list { margin-top: 12px; border-top: 1px solid var(--line) }
.import-preview-item { border-bottom: 1px solid var(--line) }
.import-preview-item summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; min-height: 46px; align-items: center; gap: 9px; padding: 7px 3px; color: var(--ink); cursor: pointer }
.import-preview-item summary::marker { color: var(--ink-35) }
.import-preview-item summary strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px }
.import-preview-item summary small { color: var(--ink-60); font-size: 11px; white-space: nowrap }
.import-status { border: 1px solid var(--line); border-radius: 999px; padding: 3px 7px; color: var(--ink-60); font-size: 10.5px; font-weight: 900; white-space: nowrap }
.import-status.is-accepted { border-color: var(--accent); color: var(--accent-strong) }
.import-status.is-partial, .import-status.is-review { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.import-status.is-rejected { border-color: var(--rouge); color: var(--rouge) }
.import-change-list { margin: 0 3px 9px; padding: 7px 10px; background: var(--paper) }
.import-change-list > div { display: grid; grid-template-columns: minmax(90px, .28fr) minmax(0, 1fr); gap: 10px; padding: 4px 0; font-size: 11.5px; line-height: 1.5 }
.import-change-list dt { color: var(--ink-60); font-weight: 800 }
.import-change-list dd { min-width: 0; overflow-wrap: anywhere; color: var(--ink); font-family: var(--font-d) }
.import-issue-list { margin: 0 3px 10px; padding-left: 18px; color: var(--accent-strong); font-size: 11.5px; line-height: 1.6 }
.import-issue-list li.error { color: var(--rouge) }
.import-issue-list small { margin-left: 6px; color: var(--ink-60); font-family: var(--font-d) }
.import-result { margin-top: 12px; background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 10px 14px; font-size: 12.5px; color: var(--ink); display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.import-result .ok { margin-left: auto; border: none; background: var(--tea); color: var(--cream); border-radius: 999px; padding: 6px 16px; font-size: 12px; font-weight: 800; cursor: pointer; font-family: var(--font-b) }

.panel { margin-top: 20px }
.panel.is-active .rv { opacity: 1; transform: none }
.type-switch { display: flex; gap: 4px; background: transparent; padding: 4px 0; align-items: center }
.type-switch .hint { font-size: 12.5px; color: var(--ink-35); font-weight: 600 }

/* ---- 清单工具条 ---- */
.manifest-bar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px }
.mf-stats { display: flex; gap: 24px; align-items: baseline }
.mf-stat { display: flex; align-items: baseline; gap: 6px }
.mf-num { font-family: var(--font-d); font-weight: 900; font-size: 20px; color: var(--accent-strong); letter-spacing: -.01em }
.mf-k { font-size: 12px; color: var(--ink-60); font-weight: 700 }
.mf-progress { flex: none; width: 120px; height: 8px; border-radius: 999px; background: var(--paper); border: 1px solid var(--line); overflow: hidden }
.mf-progress i { display: block; height: 100%; border-radius: 999px; background: var(--accent); transition: width .8s var(--ease) }
.manifest-bar .sp { flex: 1 }
.mf-search { border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 12px; font-size: 13px; font-family: var(--font-b); color: var(--ink); background: var(--paper); outline: none; width: 180px; transition: border-color .3s }
.mf-search:focus { border-color: var(--accent) }
.mf-filter { display: inline-flex; gap: 4px; background: rgba(73, 59, 44, .06); border-radius: 10px; padding: 4px; flex-wrap: wrap }
.mf-filter button { border: none; background: transparent; font-family: var(--font-b); font-weight: 700; font-size: 12px; padding: 6px 12px; border-radius: 7px; cursor: pointer; color: var(--ink-60); transition: all .3s var(--ease) }
.mf-filter button.on { background: var(--surface); color: var(--accent-strong); box-shadow: 0 1px 4px rgba(73, 59, 44, .16) }
.mf-filter button:hover:not(.on) { color: var(--ink) }

/* ---- 属性 / 职业 筛选行 ---- */
.prof-filter { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px }
.pf-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap }
.pf-label { flex: none; min-width: 34px; font-size: 12.5px; font-weight: 800; color: var(--ink); font-family: var(--font-b) }

.mf-warn { color: var(--rouge) }
.state.slim { padding: 26px 20px; margin-top: 14px; border-radius: 14px }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 10px 18px; font-size: 13px; font-weight: 800; font-family: var(--font-b); cursor: pointer; transition: all .35s var(--ease); border: none }
.btn:disabled { opacity: .45; cursor: not-allowed }
.btn.ghost { background: var(--paper); border: 1.5px solid var(--line); color: var(--ink) }
.btn.ghost:hover:not(:disabled) { background: var(--cream); color: var(--ink) }
.btn.primary { background: var(--tea); color: var(--cream) }
.btn.primary:hover:not(:disabled) { background: var(--accent); color: #fff }

.state { background: var(--surface); border: 1.5px dashed var(--line); border-radius: 20px; padding: 56px 40px; text-align: center; color: var(--ink-35); font-weight: 700; margin-top: 16px }
.state.err { color: var(--ink-60) }
.state .link { margin-left: 12px; background: none; border: none; color: var(--accent); font-weight: 800; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }

/* ---- 密探卡片 ---- */
.backpack { margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; padding: 18px 18px 20px }
.current-workbench-head { position:relative; display:grid; min-width:0; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:24px; margin-top:18px; padding:19px 22px 18px; overflow:hidden; border:1px solid var(--line); border-radius:18px 18px 10px 10px; background:linear-gradient(105deg,color-mix(in srgb,var(--yellow) 24%,transparent),transparent 46%),var(--surface); box-shadow:0 12px 30px -24px rgba(73,59,44,.45) }
.current-workbench-head::before { position:absolute; top:15px; bottom:15px; left:0; width:4px; border-radius:0 4px 4px 0; background:var(--accent); content:'' }
.current-workbench-copy { min-width:0 }
.current-workbench-title { display:flex; min-width:0; align-items:center; flex-wrap:wrap; gap:7px 10px; margin-top:4px }
.current-workbench-head h2 { min-width:0; overflow:hidden; font-family:var(--font-s); font-size:25px; font-weight:900; letter-spacing:.04em; text-overflow:ellipsis; white-space:nowrap }
.current-game-tag { display:inline-flex; min-height:24px; align-items:center; padding:2px 8px; border:1px solid var(--line); border-radius:999px; background:var(--cream); color:var(--ink-60); font-size:10px; font-weight:800; white-space:nowrap }
.current-workbench-head p { max-width:650px; margin-top:6px; color:var(--ink-60); font-size:12px; line-height:1.65 }
.current-credit-link { display:inline-flex; align-items:baseline; gap:3px; padding:0 3px; border-radius:4px; color:var(--accent-strong); font-weight:900; text-decoration:underline; text-decoration-color:rgba(215,137,53,.5); text-decoration-thickness:1px; text-underline-offset:3px; transition:background-color .18s var(--ease),color .18s var(--ease),text-decoration-color .18s var(--ease) }
.current-credit-link span { font-size:.88em; font-weight:900 }
.current-credit-link:hover { background:rgba(239,210,142,.34); color:var(--tea); text-decoration-color:var(--tea) }
.current-credit-link:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px; background:var(--cream); color:var(--tea) }
.current-workbench-index { display:flex; min-width:0; align-items:stretch; gap:14px; padding:8px 10px; border:1px solid rgba(73,59,44,.1); border-radius:12px; background:rgba(255,253,246,.72) }
.current-index-total { display:flex; min-width:60px; align-items:center; justify-content:center; flex-direction:column; padding-right:13px; border-right:1px dashed var(--line) }
.current-index-total b { color:var(--accent-strong); font:900 24px/1 var(--font-d) }
.current-index-total span { margin-top:4px; color:var(--ink-60); font-size:9px; font-weight:800; white-space:nowrap }
.current-status-index { display:grid; grid-template-columns:repeat(3,minmax(52px,1fr)); gap:9px; margin:0 }
.current-status-index > div { position:relative; display:flex; min-width:0; justify-content:center; flex-direction:column; padding-left:9px }
.current-status-index > div::before { position:absolute; top:5px; bottom:5px; left:0; width:3px; border-radius:999px; background:var(--line); content:'' }
.current-status-index > .status-growing::before { background:#6f9f76 }
.current-status-index > .status-graduated::before { background:var(--yellow-deep) }
.current-status-index > .status-inactive::before { background:rgba(73,59,44,.35) }
.current-status-index dt { overflow:hidden; color:var(--ink-60); font-size:9px; font-weight:800; text-overflow:ellipsis; white-space:nowrap }
.current-status-index dd { margin:3px 0 0; color:var(--ink); font:900 14px/1 var(--font-d) }
.current-upgrade-reminders { display:flex; min-width:0; flex-direction:column; gap:8px; margin-top:10px }
.current-upgrade-reminder { display:grid; min-width:0; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:10px; padding:9px 11px; border:1px solid rgba(111,159,118,.38); border-radius:12px; background:linear-gradient(100deg,rgba(191,220,192,.5),rgba(255,253,246,.94) 58%); box-shadow:0 9px 22px -20px rgba(73,59,44,.5) }
.current-upgrade-reminder.is-huaji { border-color:rgba(215,137,53,.38); background:linear-gradient(100deg,rgba(239,210,142,.48),rgba(255,253,246,.94) 58%) }
.current-upgrade-reminder.is-filtering { border-color:rgba(215,137,53,.5); background:linear-gradient(100deg,rgba(239,210,142,.46),rgba(255,253,246,.94) 58%) }
.current-upgrade-reminder-icon { display:inline-flex; width:34px; height:34px; align-items:center; justify-content:center; border:1px solid rgba(111,159,118,.34); border-radius:10px; background:#BFDCC0; color:#315f38 }
.current-upgrade-reminder.is-huaji .current-upgrade-reminder-icon { border-color:rgba(215,137,53,.38); background:var(--yellow); color:var(--accent-strong) }
.current-upgrade-reminder-copy { display:flex; min-width:0; flex-direction:column; gap:2px }
.current-upgrade-reminder-copy strong { color:var(--tea); font-family:var(--font-s); font-size:12.5px; font-weight:900; letter-spacing:.02em }
.current-upgrade-reminder-copy small { color:var(--ink-60); font-size:10.5px; font-weight:700; line-height:1.45 }
.current-upgrade-reminder-copy small b { color:var(--accent-strong); font-weight:900 }
.current-upgrade-reminder button { display:inline-flex; min-height:36px; align-items:center; justify-content:center; padding:6px 12px; border:1px solid rgba(111,159,118,.55); border-radius:8px; background:var(--surface); color:#315f38; font:800 10.5px var(--font-b); white-space:nowrap; cursor:pointer; transition:border-color .2s var(--ease),background-color .2s var(--ease),color .2s var(--ease),transform .16s var(--ease) }
.current-upgrade-reminder.is-huaji button { border-color:rgba(215,137,53,.5); color:var(--accent-strong) }
.current-upgrade-reminder button:hover { border-color:var(--accent); color:var(--accent-strong) }
.current-upgrade-reminder button.on { border-color:var(--tea); background:var(--tea); color:var(--cream) }
.current-upgrade-reminder button:active { transform:scale(.97) }
.current-upgrade-reminder button:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.current-prof-filter { margin-top:10px; gap:0; overflow:hidden; padding:0; border-radius:16px }
.current-filter-head { display:flex; min-width:0; align-items:center; justify-content:space-between; gap:14px; padding:10px 14px; border-bottom:1px dashed var(--line); background:var(--cream) }
.current-filter-title { display:flex; min-width:0; align-items:baseline; gap:8px }
.current-filter-title strong { flex:none; color:var(--tea); font-family:var(--font-s); font-size:13px; font-weight:900 }
.current-filter-title span { min-width:0; overflow:hidden; color:var(--ink-35); font-size:10.5px; font-weight:700; text-overflow:ellipsis; white-space:nowrap }
.current-filter-tools { display:flex; flex:none; align-items:center; gap:8px }
.current-filter-result { color:var(--ink-60); font-size:10.5px; font-weight:800; white-space:nowrap }
.current-filter-result b { color:var(--accent-strong); font:900 13px var(--font-d) }
.current-favorite-sort { display:inline-flex; min-height:30px; align-items:center; justify-content:center; gap:4px; padding:4px 9px; border:1px solid var(--line); border-radius:7px; background:var(--surface); color:var(--ink-60); font:800 10px var(--font-b); cursor:pointer; transition:border-color .2s var(--ease),background .2s var(--ease),color .2s var(--ease) }
.current-favorite-sort:hover { border-color:var(--accent); color:var(--accent-strong) }
.current-favorite-sort.on { border-color:rgba(215,137,53,.55); background:var(--yellow); color:var(--tea) }
.current-favorite-sort:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.current-filter-reset { display:inline-flex; min-height:30px; align-items:center; justify-content:center; gap:4px; padding:4px 9px; border:1px solid var(--line); border-radius:7px; background:var(--surface); color:var(--ink-60); font:800 10px var(--font-b); cursor:pointer }
.current-filter-reset:hover { border-color:var(--accent); color:var(--accent-strong) }
.current-filter-reset:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.current-filter-rows { display:flex; flex-direction:column; gap:8px; padding:11px 14px 12px }
.current-prof-filter .pf-label { display:inline-flex; min-height:28px; align-items:center; justify-content:center; padding:2px 7px; border:1px solid var(--line); border-radius:7px; background:var(--paper); color:var(--tea); font-size:11px }
.current-prof-filter .pf-row .mf-filter { min-width:0; flex:1 }
.current-prof-filter .mf-filter button { display:inline-flex; align-items:center; justify-content:center; gap:4px }
.current-prof-filter .mf-filter button img { width:14px; height:14px; flex:none; object-fit:contain }
.current-status-filter button small { margin-left:2px; color:var(--ink-35); font:800 9px var(--font-d) }
.current-status-filter button.on small { color:currentColor; opacity:.72 }
.current-status-filter button.status-growing.on { background:#BFDCC0; color:#315f38 }
.current-status-filter button.status-graduated.on { background:var(--yellow); color:var(--ink) }
.current-status-filter button.status-inactive.on { background:rgba(73,59,44,.13); color:var(--ink-60) }
.current-ledger { margin-top:16px; padding:16px; border:1px solid rgba(255,248,236,.22); border-radius:20px; background:linear-gradient(145deg,var(--tea),var(--tea-deep)); box-shadow:0 20px 40px -24px rgba(73,59,44,.55) }
.current-ledger-meta { display:flex; justify-content:space-between; gap:12px; padding:0 2px 14px; color:rgba(255,248,236,.76); font-size:11px; font-weight:700; line-height:1.6 }
.current-ledger-meta span:last-child { color:var(--yellow) }
.agent-ledger-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px }
.agent-ledger-card { --ledger-rarity-accent:#99b5cf; position:relative; min-width:0; display:flex; flex-direction:column; gap:11px; padding:14px 12px 12px; color:var(--ink); border:1px solid var(--line); border-top:2px solid var(--ledger-rarity-accent); border-radius:12px; background:linear-gradient(180deg,var(--surface),var(--cream)); box-shadow:0 8px 24px rgba(73,59,44,.18), inset 0 1px 0 rgba(255,255,255,.8); transition:transform .35s var(--ease),box-shadow .35s var(--ease) }
.agent-ledger-card:hover, .agent-ledger-card.is-popover-open { z-index:20 }
.agent-ledger-card:hover { transform:translateY(-5px); box-shadow:0 18px 30px rgba(73,59,44,.25), inset 0 1px 0 rgba(255,255,255,.8) }
.agent-ledger-card.rarity-r5 { --ledger-rarity-accent:var(--accent) }
.agent-ledger-card.rarity-r4 { --ledger-rarity-accent:#8672b2 }
.agent-ledger-card.rarity-r3 { --ledger-rarity-accent:#99b5cf }
.agent-ledger-card.status-growing { border-left:3px solid #6f9f76 }
.agent-ledger-card.status-graduated { border-left:3px solid var(--yellow-deep) }
.agent-ledger-card.status-inactive { border-left:3px solid rgba(73,59,44,.35) }
.ledger-card-head { position:relative; display:flex; gap:10px; align-items:center; min-width:0 }
.ledger-card-head:has(.ledger-status-menu[open]) { z-index:50 }
.ledger-avatar { position:relative; flex:none; width:46px; height:46px; overflow:visible; border:2px solid var(--ledger-rarity-accent); border-radius:10px; background:color-mix(in srgb, var(--ledger-rarity-accent) 16%, var(--paper)) }
.ledger-avatar img { width:100%; height:100%; display:block; object-fit:cover; border-radius:8px }
.ledger-avatar > span { display:grid; width:100%; height:100%; place-items:center; font:900 21px var(--font-s); color:var(--ink-35) }
.ledger-favorite { position:absolute; right:-9px; top:-9px; z-index:2; width:22px; height:22px; display:grid; place-items:center; padding:0; border:1px solid var(--line); border-radius:50%; background:var(--surface); color:var(--ink-35); cursor:pointer; box-shadow:0 2px 5px rgba(73,59,44,.18) }
.ledger-favorite.on { color:var(--accent); border-color:var(--accent) }
.ledger-favorite:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.ledger-identity { min-width:0; flex:1 }
.ledger-name-row { display:flex; align-items:center; justify-content:space-between; gap:5px }
.ledger-name-row h3 { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:16px; font-weight:900; font-family:var(--font-s) }
.ledger-mobile-prof { display:none }
.ledger-status-menu { position:relative; display:inline-flex; flex:none; max-width:86px; color:var(--ink) }
.ledger-status-menu summary { list-style:none }
.ledger-status-menu summary::-webkit-details-marker { display:none }
.ledger-status-button { display:inline-flex; min-width:72px; min-height:30px; align-items:center; justify-content:space-between; gap:8px; padding:3px 8px; border:1px solid var(--line); border-radius:7px; background:var(--yellow); color:var(--ink); font-size:10px; font-weight:800; cursor:pointer; user-select:none }
.ledger-status-button::after { width:6px; height:6px; flex:none; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; content:''; transform:translateY(-2px) rotate(45deg) }
.ledger-status-menu.status-growing .ledger-status-button { border-color:rgba(111,159,118,.45); background:#BFDCC0; color:#315f38 }
.ledger-status-menu.status-graduated .ledger-status-button { border-color:rgba(239,210,142,.85); background:var(--yellow); color:var(--ink) }
.ledger-status-menu.status-inactive .ledger-status-button { border-color:rgba(73,59,44,.22); background:rgba(73,59,44,.12); color:var(--ink-60) }
.ledger-status-button:focus-visible { outline:2px solid var(--brand-blue); outline-offset:1px }
.ledger-status-options { position:absolute; z-index:40; top:calc(100% + 5px); right:0; display:flex; min-width:116px; flex-direction:column; gap:3px; padding:5px; border:1px solid var(--line); border-radius:8px; background:var(--surface); box-shadow:0 10px 24px rgba(73,59,44,.22) }
.ledger-status-options button { display:flex; min-height:40px; align-items:center; justify-content:center; padding:7px 9px; border:1px solid transparent; border-radius:6px; background:transparent; color:var(--ink-60); font:800 11px var(--font-b); text-align:center; cursor:pointer; white-space:nowrap }
.ledger-status-options button:hover, .ledger-status-options button[aria-selected="true"] { border-color:var(--line); background:var(--cream); color:var(--ink) }
.ledger-status-options button:first-child[aria-selected="true"] { border-color:rgba(111,159,118,.45); background:#BFDCC0; color:#315f38 }
.ledger-status-options button:nth-child(2)[aria-selected="true"] { border-color:rgba(239,210,142,.85); background:var(--yellow); color:var(--ink) }
.ledger-status-options button:nth-child(3)[aria-selected="true"] { border-color:rgba(73,59,44,.22); background:rgba(73,59,44,.12); color:var(--ink-60) }
.ledger-prof { display:flex; align-items:center; justify-content:space-between; gap:6px; min-width:0; margin-top:1px; color:var(--ink-60); font-size:10.5px; font-weight:700 }
.ledger-prof-copy { display:flex; align-items:center; gap:4px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.ledger-prof img { width:15px; height:15px; flex:none; object-fit:contain }
.ledger-combat { display:grid; grid-template-columns:1fr 1fr; gap:7px }
.ledger-combat-stat { position:relative; min-width:0; padding:7px 8px 6px; border:1px solid var(--line); border-radius:6px; background:var(--surface); transition:border-color .2s, box-shadow .2s }
.ledger-combat-stat.is-saving { opacity:.72 }
.ledger-combat-stat.is-saving::after { position:absolute; right:7px; bottom:7px; width:8px; height:8px; border:1px solid var(--line); border-top-color:var(--accent); border-radius:50%; content:''; animation:ledger-combat-spin .7s linear infinite }
@keyframes ledger-combat-spin { to { transform:rotate(360deg) } }
.ledger-combat-stat:focus-within { border-color:var(--accent); box-shadow:0 0 0 2px rgba(215,137,53,.1) }
.ledger-combat-stat.is-manual { border-color:rgba(215,137,53,.58); background:var(--cream) }
.ledger-combat-stat.is-stale { border-color:rgba(166,81,74,.42) }
.ledger-combat-head { display:flex; align-items:center; justify-content:space-between; gap:4px; color:var(--ink-60); font-size:10px; font-weight:800 }
.ledger-combat-mode { width:20px; height:20px; display:grid; place-items:center; flex:none; padding:0; border:0; border-radius:4px; background:transparent; color:var(--ink-35); cursor:pointer; outline:none; transition:color .18s ease, background .18s ease }
.ledger-combat-mode:hover:not(:disabled) { background:rgba(215,137,53,.12); color:var(--accent-strong) }
.ledger-combat-mode.is-auto { color:var(--brand-blue) }
.ledger-combat-mode.is-manual { color:var(--accent-strong) }
.ledger-combat-mode.is-disabled { color:var(--ink-35); cursor:not-allowed; opacity:.68 }
.ledger-combat-mode:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.ledger-combat-value { display:block; width:100%; min-width:0; margin-top:3px; padding:1px 0 3px; border:0; border-bottom:1px dashed var(--accent); outline:none; background:transparent; color:var(--ink); font:900 21px/1 var(--font-d); text-align:center; -moz-appearance:textfield }
.ledger-combat-value::-webkit-outer-spin-button,.ledger-combat-value::-webkit-inner-spin-button { -webkit-appearance:none }
.ledger-combat-value::placeholder { color:var(--ink); opacity:1 }
.ledger-combat-value:focus::placeholder { color:transparent }
.ledger-combat-source { display:block; margin-top:4px; min-height:12px; color:var(--ink-35); font-size:8px; font-weight:800; text-align:center }
.ledger-oddity { display:flex; align-items:center; justify-content:center; gap:3px; margin-top:4px; color:var(--accent-strong); font:800 10px var(--font-d) }
.ledger-oddity-icon { display:inline-flex; width:14px; justify-content:center; color:var(--accent-strong); font:900 10px var(--font-s) }
.ledger-oddity input { width:42px; min-width:0; padding:0 1px; border:0; border-bottom:1px dashed var(--line); outline:none; background:transparent; color:var(--ink-60); font:800 10px var(--font-d); text-align:center; -moz-appearance:textfield }
.ledger-oddity input::-webkit-outer-spin-button,.ledger-oddity input::-webkit-inner-spin-button { -webkit-appearance:none }
.ledger-oddity span { color:var(--ink-35); font-size:9px }
.ledger-combat + .ledger-growth { margin-top:-10px }
.ledger-growth { display:flex; flex-direction:column; gap:7px; padding:9px 9px 8px; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.62) }
.ledger-growth-row { position:relative; display:flex; align-items:center; min-height:24px; gap:5px; font-size:11px }
.ledger-grow-label { width:32px; flex:none; color:var(--ink-60); font-weight:700 }
.ledger-editable { padding:0 2px; border:0; border-bottom:1px dashed var(--accent); background:transparent; color:var(--ink); font:700 13px var(--font-d); cursor:pointer }
.ledger-editable:hover { color:var(--accent-strong) }
.ledger-step-actions { display:flex; gap:3px; margin-left:auto }
.ledger-step-actions button,.ledger-next-action { border:1px solid var(--line); border-radius:4px; padding:3px 5px; background:var(--surface); color:var(--ink); font-size:10px; font-weight:800; text-align:center; cursor:pointer }
.ledger-step-actions button:hover,.ledger-next-action:hover:not(:disabled) { border-color:var(--accent); background:var(--yellow) }
.ledger-smart-action { display:inline-flex; align-items:center; justify-content:center; gap:2px; margin-left:auto; border:1px solid rgba(74,138,65,.35); border-radius:4px; padding:3px 5px; background:#E8F4E9; color:#378B3A; font-size:10px; font-weight:800; text-align:center; cursor:pointer }
.ledger-next-action { display:inline-flex; align-items:center; justify-content:center; gap:2px; margin-left:auto; line-height:1.2 }
.ledger-next-action svg { flex:none; display:block }
.ledger-step-actions button:disabled,.ledger-smart-action:disabled,.ledger-next-action:disabled { opacity:.4; cursor:not-allowed }
.ledger-popover { position:absolute; z-index:20; left:24px; right:0; top:calc(100% + 7px); display:flex; flex-direction:column; gap:7px; padding:9px; border:1px solid var(--accent); border-radius:8px; background:var(--surface); box-shadow:0 10px 25px rgba(73,59,44,.22) }
.ledger-popover::before { position:absolute; top:-6px; left:20px; width:10px; height:10px; border-left:1px solid var(--accent); border-top:1px solid var(--accent); background:var(--surface); content:''; transform:rotate(45deg) }
.ledger-popover p { display:flex; align-items:flex-start; gap:4px; color:var(--brand-blue); font-size:9.5px; line-height:1.35; font-weight:700 }
.ledger-popover > div { display:flex; gap:5px }
.ledger-breakthrough-toggle { display:inline-flex; align-items:center; align-self:flex-start; gap:5px; color:var(--ink-60); font-size:9px; font-weight:700; cursor:pointer }
.ledger-breakthrough-toggle input { width:13px; height:13px; margin:0; accent-color:var(--accent) }
.ledger-popover input { min-width:0; width:100%; padding:4px 5px; border:1px solid var(--line); border-radius:4px; background:var(--cream); color:var(--ink); font:700 12px var(--font-d); outline:none }
.ledger-popover input:focus { border-color:var(--accent) }
.ledger-popover button { flex:none; border:0; border-radius:4px; padding:0 8px; background:var(--accent); color:#fff; font-size:10px; font-weight:800; cursor:pointer }
.ledger-popover.is-confirm { top:auto; bottom:calc(100% + 7px); left:auto; right:0 }
.ledger-popover.is-confirm::before { top:auto; bottom:-6px; left:auto; right:20px; border-top:0; border-left:0; border-right:1px solid var(--accent); border-bottom:1px solid var(--accent) }
.ledger-popover.is-confirm strong { font-size:11px }
.ledger-popover.is-confirm p { color:var(--ink-60) }
.ledger-popover.is-confirm .cancel { background:var(--paper); color:var(--ink-60) }
.ledger-stats { display:grid; grid-template-columns:1fr 1fr; gap:7px }
.ledger-stats > div { display:flex; flex-direction:column; gap:2px; padding:7px 8px; border:1px solid var(--line); border-radius:6px; background:var(--surface) }
.ledger-stats span { display:flex; align-items:center; gap:4px; color:var(--ink-60); font-size:10px; font-weight:800 }
.ledger-stats strong { font:900 17px var(--font-d); color:var(--ink) }
.ledger-stats small { color:var(--ink-35); font-size:9px; font-weight:700 }
.ledger-destiny { display:flex; flex-direction:column; gap:5px; padding-top:2px }
.ledger-destiny-row { position:relative; display:flex; align-items:center; gap:10px; min-width:0; cursor:pointer }
.ledger-destiny-row:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px; border-radius:4px }
.ledger-destiny-row > span { display:inline-flex; flex:none; align-items:center; color:var(--accent-strong); font-size:10px; font-weight:800; line-height:1.2 }
.ledger-destiny-row > .ledger-destiny-values { display:flex; flex-wrap:wrap; align-items:center; gap:3px; min-width:0 }
.ledger-destiny-row em { display:inline-flex; align-items:center; justify-content:center; padding:2px 5px; border:1px solid rgba(215,137,53,.28); border-radius:4px; background:rgba(215,137,53,.12); color:var(--ink); font-size:9px; font-style:normal; font-weight:500; line-height:1.2 }
.ledger-disc-popover { left:0; right:0; width:auto; min-width:0; max-width:100%; box-sizing:border-box }
.ledger-disc-options { display:grid !important; width:100%; min-width:0; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4px !important; max-height:150px; overflow-x:hidden; overflow-y:auto; scrollbar-gutter:stable }
.ledger-disc-option { display:flex; width:100%; min-width:0; max-width:100%; align-items:center; gap:5px; padding:4px 5px; overflow:hidden; border:1px solid var(--line); border-radius:4px; background:var(--cream); color:var(--ink-60); font-size:9px; font-weight:700; cursor:pointer; box-sizing:border-box }
.ledger-disc-option:has(input:checked) { border-color:var(--accent); background:rgba(215,137,53,.12); color:var(--ink) }
.ledger-disc-option.c-gold { border-color:rgba(215,137,53,.55); background:rgba(215,137,53,.1); color:#8A5A1F }
.ledger-disc-option.c-gold:has(input:checked) { border-color:#B06F24; background:var(--accent); color:var(--cream) }
.ledger-disc-option.c-gold input { accent-color:#B06F24 }
.ledger-disc-option.c-purple { border-color:rgba(151,130,199,.62); background:rgba(151,130,199,.16); color:#6D56A0 }
.ledger-disc-option.c-purple:has(input:checked) { border-color:#7A62AB; background:#8A72BD; color:var(--cream) }
.ledger-disc-option.c-purple input { accent-color:#8A72BD }
.ledger-disc-option.c-blue { border-color:rgba(110,135,184,.6); background:rgba(110,135,184,.16); color:#4F6387 }
.ledger-disc-option.c-blue:has(input:checked) { border-color:#5F76A4; background:#6E87B8; color:var(--cream) }
.ledger-disc-option.c-blue input { accent-color:#6E87B8 }
.ledger-disc-option input { width:13px; height:13px; flex:none; margin:0; accent-color:var(--accent) }
.ledger-disc-option > span { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.disc-term, .disc-term-label { position:relative; cursor:help }
.disc-term:focus-visible, .disc-term-label:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.disc-floating-tooltip { position:fixed; z-index:240; width:max-content; max-width:min(280px, calc(100vw - 24px)); padding:8px 10px; border:1px solid var(--line); border-radius:7px; background:var(--tea); color:var(--cream); box-shadow:0 10px 24px rgba(73,59,44,.28); font:700 11px/1.5 var(--font-b); text-align:left; white-space:normal; overflow-wrap:anywhere; pointer-events:none; animation:disc-tooltip-in .14s ease both }
.disc-floating-tooltip.is-top { transform:translate(-50%, -100%) }
.disc-floating-tooltip.is-bottom { transform:translate(-50%, 0) }
.disc-floating-tooltip::after { position:absolute; left:50%; width:8px; height:8px; background:var(--tea); content:''; transform:translateX(-50%) rotate(45deg) }
.disc-floating-tooltip.is-top::after { bottom:-5px; border-right:1px solid var(--line); border-bottom:1px solid var(--line) }
.disc-floating-tooltip.is-bottom::after { top:-5px; border-left:1px solid var(--line); border-top:1px solid var(--line) }
@keyframes disc-tooltip-in { from { opacity:0 } to { opacity:1 } }
.ledger-destiny-row em.empty { border-style:dashed; background:transparent; color:var(--ink-35) }
.ledger-destiny-row:nth-child(1) > span { color:#A66C2B }
.ledger-destiny-row:nth-child(1) em { border-color:#E7C89C; background:#FAF1E4 }
.ledger-destiny-row:nth-child(1) em.empty { border-color:#E7C89C; background:transparent; color:#A66C2B }
.ledger-destiny-row:nth-child(2) > span { color:#7E7A72 }
.ledger-destiny-row:nth-child(2) em { border-color:#D8D3CB; background:#F5F2ED; color:#7E7A72 }
.ledger-destiny-row:nth-child(2) em.empty { border-color:#D8D3CB; background:transparent; color:#7E7A72 }
.ledger-stones { position:relative; display:grid; align-content:start; grid-template-columns:repeat(6,minmax(0,1fr)); gap:3px; margin-top:auto; padding-top:2px; overflow:visible }
.ledger-stones > .stone-slot { width:100%; aspect-ratio:1; overflow:hidden; display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; min-height:0; padding:0; border:1px solid var(--line); border-radius:4px; background:var(--surface); color:var(--ink); font:inherit; text-align:center; box-sizing:border-box; cursor:pointer }
.ledger-stones > .stone-slot:hover:not(:disabled) { border-color:var(--accent); background:var(--cream) }
.ledger-stones > .stone-slot.is-empty { min-height:0; background:transparent; color:var(--line); font-size:15px }
.ledger-stone-popover { left:0; right:0; top:calc(100% + 7px) }
.ledger-stone-popover select { width:100%; min-width:0; padding:5px 6px; border:1px solid var(--line); border-radius:4px; background:var(--cream); color:var(--ink); font:700 10px var(--font-b); outline:none }
.ledger-stone-level-row { display:flex !important; align-items:center; gap:6px !important }
.ledger-stone-level-row > label { display:inline-flex; align-items:center; gap:4px; flex:none; color:var(--ink-60); font-size:9px; font-weight:800 }
.ledger-stone-level-row input { width:42px; min-width:0; padding:4px; border:1px solid var(--line); border-radius:4px; background:var(--cream); color:var(--ink); font:800 11px var(--font-d); text-align:center; outline:none }
.ledger-stone-levels { display:flex !important; flex:1; gap:3px !important; justify-content:flex-end }
.ledger-stone-levels button { min-width:28px; padding:4px 5px; border:1px solid var(--line); border-radius:4px; background:var(--surface); color:var(--ink-60); font:800 9px var(--font-d); cursor:pointer }
.ledger-stone-levels button.on { border-color:var(--yellow-deep); background:var(--yellow); color:var(--ink) }
.ledger-stone-levels button:disabled { opacity:.45; cursor:not-allowed }
.ledger-stones strong { max-width:100%; overflow:hidden; color:var(--ink); font-size:8px; text-overflow:ellipsis; white-space:nowrap }
.ledger-stones small { color:var(--ink-60); font:8px var(--font-d) }
.ledger-card-footer { display:flex; flex-direction:column; gap:7px; margin-top:0; padding-top:4px }
.ledger-card-footer textarea { width:100%; resize:vertical; min-height:36px; padding:4px 0; border:0; border-bottom:1px dashed var(--line); outline:none; background:transparent; color:var(--ink); font:10.5px/1.45 var(--font-b) }
.ledger-card-footer textarea:focus { border-bottom-color:var(--accent) }
.ledger-card-footer textarea::placeholder { color:var(--ink-35) }
.ledger-inline-field { display:inline-flex; min-width:34px; align-items:center }
.ledger-inline-input { width:42px; cursor:text; text-align:center; -moz-appearance:textfield }
.ledger-inline-input::-webkit-outer-spin-button,.ledger-inline-input::-webkit-inner-spin-button { -webkit-appearance:none }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0 }
.ledger-card-actions { display:flex; gap:6px; align-items:center; justify-content:flex-end; min-height:30px }
.ledger-card-actions button { display:inline-flex; align-items:center; justify-content:center; gap:4px; min-height:30px; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:800; cursor:pointer; transition:transform .16s cubic-bezier(.22,1,.36,1),background-color .18s ease,border-color .18s ease,opacity .18s ease }
.ledger-card-actions button:active { transform:scale(.97) }
.ledger-card-actions button:disabled { opacity:.5; cursor:not-allowed }
.ledger-card-cancel { border:1px solid var(--line); background:var(--paper); color:var(--ink-60) }
.ledger-card-cancel:hover:not(:disabled) { border-color:var(--accent); color:var(--ink) }
.ledger-card-save { border:1px solid var(--tea); background:var(--tea); color:var(--cream) }
.ledger-card-save:hover:not(:disabled) { border-color:var(--accent); background:var(--accent) }
.ledger-material-list { display:flex !important; flex-direction:column; gap:4px !important; max-height:150px; overflow:auto; padding:1px 0 }
.ledger-material-list span { display:flex; align-items:baseline; justify-content:space-between; gap:8px; padding:4px 5px; border:1px solid rgba(73,59,44,.12); border-radius:4px; background:var(--cream); color:var(--ink); font:700 9px/1.3 var(--font-b) }
.ledger-material-list span.is-lack { border-color:rgba(166,81,74,.35); background:rgba(240,207,200,.35); color:var(--rouge) }
.ledger-material-list small { flex:none; color:var(--ink-60); font:700 8px var(--font-b) }
.ledger-material-list .is-lack small { color:var(--rouge) }
.ledger-material-list em { color:var(--ink-35); font-size:9px; font-style:normal }
.ledger-upgrade-popover { min-width:min(250px,calc(100vw - 28px)) }
.ledger-popover-state { display:flex; min-height:54px; align-items:center; justify-content:center; gap:8px; padding:9px; border:1px dashed var(--line); border-radius:7px; color:var(--ink-60); font-size:10px; text-align:center }
.ledger-popover-state.is-error { border-color:rgba(166,81,74,.35); background:rgba(240,207,200,.24); color:var(--rouge) }
.ledger-popover-state button { flex:none; padding:5px 8px }
.ledger-upgrade-summary { display:flex !important; flex-wrap:wrap; justify-content:space-between; gap:4px 8px !important; color:var(--ink-60); font:700 8.5px/1.4 var(--font-b) }
.ledger-popover-blocked { align-self:flex-end; color:var(--rouge); font-size:9px; font-style:normal; font-weight:800 }
.ledger-popover-actions { justify-content:flex-end }
.ledger-popover-actions .cancel { margin-right:auto; background:var(--paper); color:var(--ink-60) }
.ledger-step-actions button.is-ready,.ledger-smart-action.is-ready,.ledger-next-action.is-ready { border-color:#C9D8C5; background:#EEF5EC; color:#6F846B }
.ledger-step-actions button.is-lack,.ledger-smart-action.is-lack,.ledger-next-action.is-lack { border-color:#E4C49C; background:#FBF1E3; color:#A66F2E }
.ledger-step-actions button.is-complete,.ledger-smart-action:disabled { border-color:var(--line); background:rgba(73,59,44,.08); color:var(--ink-60); opacity:.72; cursor:default }
.ledger-star-controls { display:grid !important; grid-template-columns:1fr 1fr; gap:7px !important }
.ledger-star-controls select { width:100%; min-width:0; min-height:44px; appearance:none; padding:8px 26px 8px 9px; border:1px solid var(--line); border-radius:7px; background:var(--cream); color:var(--ink); font:800 12px var(--font-b); outline:none; text-align:center; text-align-last:center; background-image:linear-gradient(45deg, transparent 50%, var(--ink-60) 50%),linear-gradient(135deg, var(--ink-60) 50%, transparent 50%); background-position:calc(100% - 13px) 18px,calc(100% - 8px) 18px; background-size:5px 5px,5px 5px; background-repeat:no-repeat }
.ledger-star-controls select:focus { border-color:var(--accent); box-shadow:0 0 0 2px rgba(215,137,53,.12) }
.ledger-submit-overlay { position:absolute; inset:0; z-index:30; display:grid; place-items:center; padding:12px; border-radius:inherit; background:rgba(255,253,246,.74); backdrop-filter:blur(3px); opacity:1; pointer-events:auto; transition:opacity .18s ease }
.ledger-submit-message { width:min(220px,88%); padding:16px 14px 13px; border:1px solid var(--line); border-radius:14px; background:rgba(255,255,255,.9); box-shadow:0 12px 30px rgba(73,59,44,.16); text-align:center; transform:translateY(6px) scale(.97); animation:ledger-submit-enter .2s cubic-bezier(.22,1,.36,1) both }
@keyframes ledger-submit-enter { to { transform:none } }
.ledger-submit-icon { width:38px; height:38px; display:grid; place-items:center; margin:0 auto 9px; border-radius:50%; background:var(--blue-soft); color:var(--brand-blue); font-size:20px; font-weight:900 }
.ledger-submit-overlay.success .ledger-submit-icon { background:#E8F4E9; color:#4f8758; border:1px solid rgba(111,159,118,.35) }
.ledger-submit-overlay.error .ledger-submit-icon { background:rgba(240,207,200,.42); color:var(--rouge); border:1px solid rgba(166,81,74,.35) }
.ledger-submit-message strong { display:block; color:var(--ink); font-size:14px; font-weight:900 }
.ledger-submit-message p { margin:4px 0 0; color:var(--ink-60); font-size:10px; line-height:1.45 }
.ledger-submit-spinner { width:18px; height:18px; border:2px solid rgba(91,106,140,.22); border-top-color:var(--brand-blue); border-radius:50%; animation:ledger-submit-spin .8s linear infinite }
@keyframes ledger-submit-spin { to { transform:rotate(360deg) } }
.ledger-submit-actions { display:flex !important; justify-content:center; gap:6px !important; margin-top:12px }
.ledger-submit-actions button { min-height:28px; padding:5px 9px; border:1px solid var(--line); border-radius:5px; background:var(--paper); color:var(--ink-60); font-size:9px; font-weight:800; cursor:pointer }
.ledger-submit-actions .ledger-card-save { border-color:var(--tea); background:var(--tea); color:var(--cream) }
.agent-ledger-card.is-draft { box-shadow:0 10px 28px rgba(215,137,53,.2), inset 0 0 0 1px rgba(215,137,53,.18) }
.agent-ledger-card.is-submit-success { box-shadow:0 12px 30px rgba(111,159,118,.2), inset 0 0 0 1px rgba(111,159,118,.2) }
.ledger-notice { margin-left:auto }
.ledger-full-edit { display:flex; align-items:center; justify-content:center; gap:5px; width:100%; padding:7px; border:0; border-radius:6px; background:var(--ink); color:var(--cream); font-size:11px; font-weight:800; cursor:pointer }
.ledger-full-edit:hover { background:var(--accent) }
.ledger-notice { flex:none; max-width:45%; overflow:hidden; color:var(--accent-strong); font-size:9px; font-weight:800; text-overflow:ellipsis; white-space:nowrap }
.bp-head { display: flex; align-items: center; gap: 10px; padding-bottom: 14px; border-bottom: 1.5px dashed var(--line); flex-wrap: wrap }
.bp-head .sp { flex: 1 }
.bp-tip { font-size: 12px; color: var(--ink-60); font-weight: 600; line-height: 1.8 }
.bp-tip code { font-family: var(--font-d); font-size: 11px; background: var(--paper); border: 1px solid var(--line); border-radius: 6px; padding: 2px 7px; color: var(--ink-60); margin: 0 2px; word-break: break-all }
.bp-num { font-family: var(--font-d); font-weight: 900; color: var(--accent-strong); font-size: 13px }

.slot-grid { list-style: none; margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 14px 12px }
.slot { display: flex; flex-direction: column }
.slot-ic {
  position: relative; aspect-ratio: 1 / 1; border-radius: 8px; border: 2px solid rgba(73, 59, 44, .22);
  background: var(--cream); overflow: hidden;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), inset 0 -10px 18px -10px rgba(215, 137, 53, .22);
  transition: border-color .3s, box-shadow .45s var(--ease);
}
.slot.rarity-r5 .slot-ic { border-color: var(--accent); box-shadow: inset 0 0 0 2px rgba(239, 210, 142, .5) }
.slot.rarity-r4 .slot-ic { border-color: #8672b2 }
.slot.rarity-r3 .slot-ic { border-color: #99b5cf }
.slot:hover .slot-ic { border-color: var(--accent); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .7), 0 14px 26px -14px rgba(73, 59, 44, .4) }
.slot-avatar { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block }
.slot-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: linear-gradient(168deg, var(--surface) 0%, var(--cream) 62%, var(--paper) 100%) }
.slot-ph .ph-seal {
  position: absolute; top: 8px; right: 8px; width: 21px; height: 21px; border: 1.5px solid var(--brand-blue);
  border-radius: 6px; color: var(--brand-blue); font-size: 11px; font-weight: 800; display: grid; place-items: center;
  opacity: .8; font-family: var(--font-b); line-height: 1;
}
.slot-ph .ph-mono { font-family: var(--font-s); font-weight: 900; font-size: clamp(26px, 4vw, 34px); color: var(--ink-35); user-select: none }
.slot-count {
  position: absolute; left: 1px; bottom: 1px; min-width: 24px; padding: 3px 8px; border-radius: 999px;
  background: var(--tea); color: var(--cream); font-family: var(--font-d); font-weight: 900; font-size: 12.5px;
  line-height: 1.25; text-align: center; box-shadow: 0 2px 6px rgba(73, 59, 44, .28);
}
.slot-count.zero { background: transparent; border: 1.5px dashed var(--line); color: var(--ink-35); box-shadow: none }
.slot-name {
  margin-top: 8px; font-size: 12.5px; font-weight: 700; color: var(--ink); text-align: center; line-height: 1.45;
  min-height: calc(2 * 1.45em); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-all; transition: color .3s;
}
.slot:hover .slot-name { color: var(--accent-strong) }
.prof-badge { position: absolute; top: -7px; left: -7px; z-index: 3; display: grid; width: 44px; height: 44px; place-items: center }
.prof-badge::before { position: absolute; inset: 8px; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); box-shadow: 0 2px 7px rgba(73, 59, 44, .18); content: '' }
.prof-badge img { position: relative; z-index: 1; width: 21px; height: 21px; object-fit: contain }
.slot.is-favorite .slot-name { color: var(--tea) }
.favorite-btn, .edit-icon-btn { position: absolute; z-index: 4; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; cursor: pointer; color: var(--ink-35) }
.favorite-btn { top: -7px; right: -7px }
.edit-icon-btn { right: -7px; bottom: -7px }
.favorite-btn::before, .edit-icon-btn::before { position: absolute; inset: 8px; content: ''; border: 1px solid var(--line); border-radius: 50%; background: var(--surface); box-shadow: 0 2px 7px rgba(73, 59, 44, .18); transition: transform .2s var(--ease), border-color .2s var(--ease) }
.favorite-btn svg, .edit-icon-btn svg { position: relative; z-index: 1 }
.favorite-btn.on { color: var(--accent) }
.edit-icon-btn { color: var(--tea) }
.favorite-btn:hover:not(:disabled)::before, .edit-icon-btn:hover::before { border-color: var(--accent); transform: scale(1.06) }
.favorite-btn:focus-visible, .edit-icon-btn:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px; border-radius: 50% }
.favorite-btn:disabled { opacity: .5; cursor: wait }
.favorite-btn.busy svg { opacity: .4 }
.slot-tag {
  margin-top: 5px; align-self: center; font-size: 10.5px; font-weight: 700; color: var(--ink-60);
  background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; line-height: 1.5;
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.slot-tag.star.s5 { background: var(--yellow); border-color: transparent; color: var(--ink) }
.slot-tag.star.s4 { background: transparent; border: 1.5px solid rgba(91, 106, 140, .45); color: var(--slate-deep) }
.slot-tag.star.s3 { background: transparent; border: 1.5px solid var(--line); color: var(--ink-60) }
.slot.is-missing .slot-ic { opacity: .55; border-style: dashed }
.slot.is-missing:hover .slot-ic { opacity: .8 }
.slot.is-missing .slot-name { color: var(--ink-35) }
.slot.is-missing:hover .slot-name { color: var(--ink-60) }

.build-slot .build-line { margin-top: 4px; align-self: center; font-size: 11px; color: var(--ink-60); font-weight: 700; line-height: 1.4 }
.build-slot .build-line.small { font-size: 10.5px; color: var(--ink-35) }
.build-list { display: flex; flex-direction: column; margin-top: 12px }
.build-row { min-width: 0; display: grid; grid-template-columns: 52px minmax(150px, 1.2fr) repeat(3, minmax(74px, .55fr)) minmax(150px, 1fr) 44px; align-items: center; gap: 12px; min-height: 72px; padding: 10px 8px; border-bottom: 1px solid var(--line); transition: background-color .2s var(--ease) }
.build-row:last-child { border-bottom: 0 }
.build-row:hover { background: var(--cream) }
.build-avatar { position: relative; width: 48px; height: 48px; overflow: hidden; display: grid; place-items: center; border: 2px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink-35); font: 900 21px var(--font-s) }
.build-avatar.rarity-r5 { border-color: var(--accent) }
.build-avatar.rarity-r4 { border-color: var(--brand-blue) }
.build-identity { min-width: 0; display: flex; flex-direction: column; gap: 4px }
.build-identity strong { overflow: hidden; color: var(--ink); font-size: 13px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap }
.build-identity span { display: flex; align-items: center; gap: 4px; color: var(--ink-60); font-size: 10.5px; font-weight: 700 }
.build-identity img { width: 17px; height: 17px; object-fit: contain }
.build-stat { min-width: 0 }
.build-stat dt { color: var(--ink-35); font-size: 10px; font-weight: 700 }
.build-stat dd { margin-top: 3px; overflow: hidden; color: var(--ink); font: 900 13px var(--font-d); text-overflow: ellipsis; white-space: nowrap }
.build-loadouts { min-width: 0; display: flex; flex-direction: column; gap: 5px; color: var(--ink-60); font-size: 10.5px; font-weight: 700 }
.build-loadouts span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.build-loadouts .combat-stale { color: var(--rouge); font-weight: 900 }
.build-edit { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--tea); cursor: pointer }
.build-edit:hover { background: var(--yellow); color: var(--ink) }
.build-edit:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }

/* ---- 单个密探编辑弹窗 ---- */
.editor-mask { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 24px; background: rgba(73, 59, 44, .42); backdrop-filter: blur(4px); isolation: isolate; pointer-events: auto }
.editor-panel { position: relative; z-index: 1; display: flex; width: min(760px, 100%); max-width: 100%; height: min(92vh, 900px); height: min(92dvh, 900px); max-height: calc(100vh - 48px); max-height: calc(100dvh - 48px); min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; box-shadow: 0 40px 100px -30px rgba(73, 59, 44, .5); pointer-events: auto; box-sizing:border-box }
.editor-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, .9fr) auto; align-items: center; gap: 16px; flex: 0 0 auto; padding: 18px 28px 15px; border-bottom: 1.5px dashed var(--line); background: var(--surface) }
.editor-identity { min-width: 0; grid-column: 1; grid-row: 1 }
.editor-kicker { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 4px 8px; margin-bottom: 5px; color: var(--accent-strong); font-size: 10px; font-weight: 900; letter-spacing: 0; text-transform: uppercase }
.editor-kicker-account { max-width: 190px; overflow: hidden; padding-left: 8px; border-left: 1px solid var(--line); color: var(--ink-60); text-overflow: ellipsis; text-transform: none; white-space: nowrap }
.editor-title-line { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 8px 12px }
.editor-head h3 { color: var(--ink); font-family: var(--font-s); font-size: 26px; font-weight: 900; letter-spacing: 0; line-height: 1.2 }
.editor-identity-tags { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 6px }
.editor-identity-tag { display: inline-flex; min-height: 24px; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; background: var(--paper); color: var(--ink-60); font-size: 10.5px; font-weight: 800; line-height: 1.3; white-space: nowrap }
.editor-identity-tag.rarity { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink) }
.editor-identity-tag.profession { background: transparent; color: var(--tea) }
.editor-identity-tag.stale { border-color: rgba(166, 81, 74, .45); background: rgba(166, 81, 74, .12); color: var(--rouge) }
.editor-identity-tag img { width: 16px; height: 16px; object-fit: contain }
.editor-head-stats { display: flex; min-width: 0; grid-column: 2; grid-row: 1; flex-direction: column; gap: 7px }
.editor-head-stats-toolbar { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 7px }
.editor-head-stats-note { display: inline-flex; min-width: 0; align-items: center; gap: 5px; padding: 3px 7px; border: 1px solid var(--line); border-radius: 999px; background: var(--cream); color: var(--ink-35); font-size: 9px; font-weight: 700; line-height: 1.35; text-align: right }
.editor-head-stats-note::before { width: 5px; height: 5px; flex: 0 0 auto; border-radius: 50%; background: var(--accent); content: '' }
.editor-head-values { position: relative; display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px }
.editor-head-live { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap }
.editor-head-stat { position: relative; display: grid; min-width: 0; min-height: 66px; grid-template-rows: auto minmax(30px, auto); gap: 3px; padding: 8px 10px 7px; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: linear-gradient(145deg, var(--cream), var(--paper)); cursor: text; transition: border-color .2s, background-color .2s, box-shadow .2s }
.editor-head-stat::after { position: absolute; right: 10px; bottom: 6px; left: 10px; height: 1px; background: rgba(215, 137, 53, .3); content: ''; transform: scaleX(0); transform-origin: right; transition: transform .2s }
.editor-head-stat:hover { border-color: rgba(215, 137, 53, .58) }
.editor-head-stat:focus-within { border-color: var(--accent); background: var(--cream); box-shadow: 0 0 0 2px rgba(215, 137, 53, .12) }
.editor-head-stat:focus-within::after { transform: scaleX(1); transform-origin: left }
.editor-head-stat-meta { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 6px; line-height: 1.2; white-space: nowrap }
.editor-head-stat-meta strong { color: var(--ink-60); font-size: 10.5px; font-weight: 900 }
.editor-head-stat small { max-width: 72px; overflow: hidden; padding: 2px 5px; border-radius: 999px; background: rgba(73, 59, 44, .07); color: var(--ink-35); font-size: 8px; font-weight: 800; text-overflow: ellipsis }
.editor-head-stat.is-manual small { background: rgba(215, 137, 53, .13); color: var(--accent-strong) }
.manual-restore { display: inline-grid; width: 19px; height: 19px; flex: 0 0 auto; place-items: center; padding: 0; border: 1px solid rgba(215, 137, 53, .38); border-radius: 50%; background: transparent; color: var(--accent-strong); cursor: pointer }
.manual-restore:hover { border-color: var(--accent); background: var(--yellow) }
.manual-restore:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.editor-head-stat input { width: 100%; min-width: 0; min-height: 32px; padding: 1px 0 2px; border: 0; outline: none; background: transparent; color: var(--accent-strong); font: 900 23px/1 var(--font-d); letter-spacing: 0; text-align: center; -moz-appearance: textfield }
.editor-head-stat input::placeholder { color: var(--accent-strong); opacity: 1 }
.editor-head-stat.is-empty input::placeholder { color: var(--ink-35) }
.editor-head-stat input:focus::placeholder { color: transparent; opacity: 0 }
.editor-head-stat input:focus-visible { outline: none }
.editor-head-stat input::-webkit-outer-spin-button, .editor-head-stat input::-webkit-inner-spin-button { -webkit-appearance: none }
.editor-close { display: grid; width: 44px; height: 44px; grid-column: 3; grid-row: 1; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--ink-60); cursor: pointer; transition: color .25s, background-color .25s }
.editor-close:hover { color: var(--rouge); background: rgba(166, 81, 74, .08) }
.editor-close:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.editor-body { display: flex; width:100%; min-width:0; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 18px; overflow-x:hidden; overflow-y: auto; overscroll-behavior: contain; padding: 22px 28px 28px; scrollbar-gutter: stable; box-sizing:border-box }
.editor-row { display: grid; width:100%; min-width:0; max-width:100%; grid-template-columns: 86px minmax(0, 1fr); gap: 16px; align-items: start; padding: 4px 0 20px; border-bottom: 1px solid var(--line); box-sizing:border-box }
.editor-row:last-child { padding-bottom: 4px; border-bottom: 0 }
.editor-label { padding-top: 8px; color: var(--tea); font-family: var(--font-s); font-size: 14px; font-weight: 900; line-height: 1.35 }
.editor-game { display: flex; flex-wrap: wrap; gap: 8px; align-items: center }
.game-pill { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; font-weight: 700; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 16px; transition: all .25s }
.game-pill input { display: none }
.game-pill:has(input:checked) { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.editor-game .hint { flex-basis: 100%; margin-top: 2px; font-size: 11.5px; color: var(--ink-35); line-height: 1.7 }
.num-fields { display: flex; gap: 12px; flex-wrap: wrap }
.num-fields .level-row > label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 12px; padding: 8px 12px }
.num-fields .level-row > label input { width: 76px; border: none; background: transparent; font-family: var(--font-d); font-weight: 900; font-size: 16px; color: var(--ink); outline: none; -moz-appearance: textfield }
.num-fields .level-row > label input::-webkit-outer-spin-button, .num-fields .level-row > label input::-webkit-inner-spin-button { -webkit-appearance: none }
.num-fields .star-card {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  background: var(--paper);
  border: 1.5px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
}
.star-row { display: flex; align-items: center; gap: 12px; min-width: 0 }
.star-caption { flex: none; width: 34px; font-size: 13px; font-weight: 800; color: var(--ink) }
.star-groups { display: grid; min-width: 0; flex: 1; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px }
.star-pill {
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 999px;
  min-width: 0;
  padding: 5px 5px;
  font-size: 11.5px;
  font-weight: 800;
  font-family: var(--font-b);
  line-height: 1.4;
  cursor: pointer;
  transition: all .25s;
}
.star-pill:hover { border-color: var(--accent); color: var(--accent-strong) }
.star-pill.on { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.star-pill.awaken { letter-spacing: .04em }
.star-pill.awaken.on { background: var(--tea); border-color: var(--tea); color: var(--cream) }
.star-nodes { display: flex; align-items: center; flex-wrap: wrap; gap: 6px }
.node-chip {
  min-width: 30px;
  height: 26px;
  padding: 0 6px;
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  font-family: var(--font-d);
  line-height: 1;
  cursor: pointer;
  transition: all .25s;
}
.node-chip:hover { border-color: var(--accent); color: var(--accent-strong) }
.node-chip.on { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
.num-fields .level-row { flex-basis: 100%; display: grid; grid-template-columns: minmax(130px, 156px) minmax(130px, 156px) auto; align-items: center; gap: 10px }
.num-fields .elite-hint { font-size: 11.5px; color: var(--ink-35); font-weight: 700; white-space: nowrap }
.oddity-editor { display: grid; grid-template-columns: 72px repeat(3, minmax(0, 1fr)); gap: 7px; align-items: center; padding-top: 10px; border-top: 1px dashed var(--line) }
.num-fields .oddity-editor { width: 100%; min-width: 0; flex: 1 0 100% }
.oddity-caption { display: flex; flex-direction: column; gap: 2px; color: var(--ink-60); font-size: 11px; font-weight: 900; white-space: nowrap }
.oddity-caption small { color: var(--rouge); font-size: 9px; font-weight: 800 }
.oddity-field { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) minmax(92px, auto); align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--cream) }
.oddity-name { min-width: 0; overflow: hidden; color: var(--ink); font-size: 11px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap }
.oddity-control { display: inline-flex; min-width: 0; align-items: center; gap: 4px }
.oddity-control input { width: 62px; min-width: 62px; min-height: 36px; border: 1px solid var(--line); border-radius: 7px; padding: 6px 5px; outline: none; background: var(--surface); color: var(--ink); font: 800 12px var(--font-d); text-align: center; -moz-appearance: textfield }
.oddity-control input::-webkit-outer-spin-button, .oddity-control input::-webkit-inner-spin-button { -webkit-appearance: none }
.oddity-control input:focus { border-color: var(--accent) }
.oddity-control input:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.oddity-limit { color: var(--ink-35); font: 800 10.5px var(--font-d); white-space: nowrap }
.disc-loadout-editor { min-width: 0 }
.disc-loadout-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; padding: 5px; border-radius: 8px; background: rgba(73, 59, 44, .07) }
.disc-loadout-tabs button { display: grid; min-width: 0; min-height: 60px; grid-template-columns: minmax(0, 1fr) auto; align-content: center; gap: 3px 8px; padding: 8px 11px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--ink-60); text-align: left; cursor: pointer; font-family: var(--font-b) }
.disc-loadout-tabs button > span { grid-column: 1; color: var(--ink-35); font-size: 9.5px; font-weight: 800 }
.disc-loadout-tabs button > strong { grid-column: 1 / -1; overflow: hidden; color: inherit; font-size: 12px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap }
.disc-loadout-tabs button > small { display: inline-flex; grid-column: 2; grid-row: 1; align-items: center; gap: 2px; color: var(--accent-strong); font-size: 9px; font-weight: 900; white-space: nowrap }
.disc-loadout-tabs button:hover { color: var(--ink) }
.disc-loadout-tabs button.on { border-color: var(--line); background: var(--surface); color: var(--ink); box-shadow: 0 2px 8px rgba(73, 59, 44, .08) }
.disc-loadout-tabs button:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.disc-loadout-panel { width:100%; min-width:0; max-width:100%; margin-top: 8px; padding: 11px 12px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); box-sizing:border-box }
.disc-loadout-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; padding-bottom: 10px; border-bottom: 1px dashed var(--line) }
.disc-loadout-name { display: flex; min-width: 0; flex-direction: column; gap: 4px; color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.disc-loadout-name-head { display: flex; min-width: 0; min-height: 20px; align-items: center; justify-content: space-between; gap: 8px }
.disc-loadout-name input { width: 100%; min-width: 0; min-height: 38px; padding: 7px 9px; border: 1.5px solid var(--line); border-radius: 7px; outline: none; background: var(--surface); color: var(--ink); font: 800 12.5px var(--font-b) }
.disc-loadout-name input:focus { border-color: var(--accent) }
.disc-auto-name { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 5px; margin-left: auto; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink-60); font: 800 10.5px var(--font-b); white-space: nowrap }
.disc-auto-name { cursor: pointer }
.disc-auto-name:hover { border-color: var(--accent); color: var(--accent-strong) }
.disc-auto-name:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.disc-auto-status { display: inline-flex; min-width: 0; min-height: 20px; align-items: center; overflow: hidden; padding: 2px 7px; border-radius: 999px; background: rgba(215, 137, 53, .12); color: var(--accent-strong); font-size: 9px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap }
.disc-options { display: flex; width:100%; min-width:0; max-width:100%; flex-wrap: wrap; gap: 7px; padding-top: 10px }
.disc-options-head { display: flex; flex-basis: 100%; align-items: center; justify-content: space-between; color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.disc-options-head strong { color: var(--accent-strong); font-family: var(--font-d); font-size: 11px }
.disc-options .hint { flex-basis: 100%; font-size: 11.5px; color: var(--ink-35) }
.disc-storage-note { margin-top: 7px; color: var(--ink-35); font-size: 10.5px; font-weight: 700; line-height: 1.5 }
.disc-option { position: relative; display: inline-flex; min-width:0; max-width:100%; min-height: 34px; align-items: center; overflow:hidden; font-size: 12px; font-weight: 800; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: all .25s; user-select: none; box-sizing:border-box }
.disc-option .disc-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.disc-option input { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap }
.disc-option:has(input:focus-visible) { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.disc-option.on { background: var(--yellow); border-color: var(--yellow-deep); color: var(--ink) }
/* 命盘品级色：金 / 紫 / 蓝（未选中=淡色底，选中=实色） */
.disc-option.c-gold { background: rgba(215, 137, 53, .14); border-color: rgba(215, 137, 53, .55); color: #8a5a1f }
.disc-option.c-gold.on { background: var(--accent); border-color: #b06f24; color: var(--cream) }
.disc-option.c-purple { background: rgba(151, 130, 199, .16); border-color: rgba(151, 130, 199, .62); color: #6d56a0 }
.disc-option.c-purple.on { background: #8a72bd; border-color: #7a62ab; color: var(--cream) }
.disc-option.c-blue { background: rgba(110, 135, 184, .16); border-color: rgba(110, 135, 184, .6); color: #4f6387 }
.disc-option.c-blue.on { background: #6E87B8; border-color: #5f76a4; color: var(--cream) }
.stone-editor { display: grid; width:100%; max-width:100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; flex: 1; min-width:0; box-sizing:border-box }
.stone-presets { grid-column: 1 / -1; grid-row:1; padding: 11px 12px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream) }
.stone-preset-heading { display: flex; align-items: baseline; gap: 9px; margin-bottom: 9px }
.stone-preset-heading strong { color: var(--ink); font-size: 12px; font-weight: 900 }
.stone-preset-heading span { color: var(--ink-35); font-size: 10.5px; font-weight: 700 }
.stone-preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px }
.stone-preset-item { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 7px; min-width: 0 }
.stone-preset-item label { color: var(--ink-60); font-size: 11px; font-weight: 800; white-space: nowrap }
.stone-preset-item select { width: 100%; min-width: 0; border: 1.5px solid var(--line); border-radius: 7px; padding: 6px 8px; background: var(--surface); color: var(--ink); font: 700 11.5px var(--font-b); outline: none }
.stone-preset-item select:focus { border-color: var(--accent) }
.stone-preset-item select:disabled { color: var(--ink-35); cursor: not-allowed; opacity: .8 }
.stone-preset-load { min-width: 48px; min-height: 32px; padding: 0 8px; border: 1px solid var(--tea); border-radius: 7px; background: var(--tea); color: var(--cream); font: 800 11px var(--font-b); cursor: pointer }
.stone-preset-load:hover:not(:disabled) { background: var(--accent); border-color: var(--accent) }
.stone-preset-load:disabled { opacity: .4; cursor: not-allowed }
.stone-current-heading { grid-column: 1 / -1; grid-row:2; display: flex; align-items: baseline; gap: 8px; padding: 3px 2px 0; border-top: 1px dashed var(--line); }
.stone-current-heading strong { color: var(--tea); font-family: var(--font-s); font-size: 13px; font-weight: 900 }
.stone-current-heading span { color: var(--ink-35); font-size: 10.5px; font-weight: 700 }
.stone-item { display: flex; min-width: 0; grid-row:var(--stone-grid-row); flex-direction: column; align-items: stretch; gap: 8px; background: var(--paper); border: 1.5px solid var(--line); border-radius: 10px; padding: 10px 12px }
.stone-item.is-main { grid-column: 1 }
.stone-item.is-assist { grid-column: 2 }
.stone-item-head { display: flex; min-height: 20px; align-items: center; justify-content: space-between; gap: 8px }
.stone-name { min-width: 0; color: var(--ink); font-size: 12.5px; font-weight: 900 }
.stone-item-actions { display: inline-flex; align-items: center; gap: 5px }
.stone-current { flex: none; color: var(--accent-strong); font: 900 10.5px var(--font-d) }
.stone-remove { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid rgba(166, 81, 74, .35); border-radius: 7px; background: transparent; color: var(--rouge); cursor: pointer }
.stone-remove:hover { background: rgba(166, 81, 74, .12) }
.stone-remove:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.stone-select { width: 100%; min-width: 0; border: 1.5px solid var(--line); border-radius: 8px; padding: 7px 9px; font-family: var(--font-b); font-size: 12.5px; font-weight: 700; color: var(--ink); background: var(--surface); outline: none; cursor: pointer }
.stone-select:focus { border-color: var(--accent) }
.stone-level-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 8px }
.stone-level-field { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.stone-item input { width: 46px; border: 1.5px solid var(--line); border-radius: 7px; padding: 5px 6px; font-family: var(--font-d); font-weight: 900; font-size: 12.5px; color: var(--ink); text-align: center; background: var(--surface); outline: none; -moz-appearance: textfield }
.stone-item input:focus { border-color: var(--accent) }
.stone-quick { display: flex; min-width: 0; align-items: center; justify-content: flex-end; gap: 2px; padding: 2px; border-radius: 8px; background: rgba(73, 59, 44, .06) }
.stone-quick > span { margin: 0 3px; color: var(--ink-35); font-size: 9.5px; font-weight: 800; white-space: nowrap }
.stone-lv-chip {
  min-width: 36px;
  height: 27px;
  padding: 0 5px;
  border: 0;
  background: transparent;
  color: var(--ink-60);
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  font-family: var(--font-d);
  line-height: 1;
  cursor: pointer;
  transition: all .25s;
}
.stone-lv-chip:hover { background: var(--surface); color: var(--accent-strong) }
.stone-lv-chip.on { background: var(--yellow); color: var(--ink); box-shadow: inset 0 0 0 1px var(--yellow-deep) }
.stone-editor .hint { grid-column: 1 / -1; grid-row:6; font-size: 11px; color: var(--ink-35); line-height: 1.5 }
.editor-actions { position: relative; z-index: 1; display: flex; min-height: 64px; align-items: center; gap: 16px; flex: 0 0 auto; padding: 10px 28px; border-top: 1px solid var(--line); background: var(--surface); box-shadow: 0 -8px 18px rgba(73, 59, 44, .06) }
.editor-conflict { display: flex; min-width: 0; flex: 1; flex-wrap: wrap; align-items: center; gap: 3px 8px; padding: 7px 10px; border: 1px solid rgba(166, 81, 74, .36); border-radius: 9px; background: rgba(166, 81, 74, .09); color: var(--rouge); font-size: 10.5px; line-height: 1.4 }
.editor-conflict strong { flex: none; font-weight: 900 }
.editor-conflict-actions { display: inline-flex; gap: 5px; margin-left: auto }
.editor-conflict-btn { min-height: 30px; padding: 3px 8px; border: 1px solid rgba(166, 81, 74, .35); border-radius: 6px; background: var(--surface); color: var(--rouge); font: 800 10px var(--font-b); cursor: pointer }
.editor-conflict-btn.primary { background: var(--rouge); color: var(--cream) }
.editor-conflict-btn:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 1px }
.editor-action-status { min-width: 0; flex: 1; padding: 8px 12px; border-radius: 9px; background: var(--yellow); color: var(--ink); font-size: 12px; font-weight: 800; line-height: 1.45 }
.editor-action-status.err { background: rgba(166, 81, 74, .14); color: var(--rouge) }
.editor-action-buttons { display: flex; flex: none; gap: 8px; margin-left: auto }
.editor-action-buttons .btn { min-height: 44px; }
.editor-cancel { min-width: 72px; border: 0; background: transparent; color: var(--ink-60) }
.editor-cancel:hover:not(:disabled) { background: var(--paper); color: var(--ink) }
.editor-save { min-width: 132px; border-radius: 10px }

.edit-btn { margin-top: 6px; align-self: center; border: 1.5px solid var(--line); background: var(--paper); color: var(--ink-60); border-radius: 999px; padding: 3px 12px; font-size: 11px; font-weight: 800; cursor: pointer; font-family: var(--font-b); transition: all .25s; line-height: 1.5 }
.edit-btn:hover { border-color: var(--accent); color: var(--accent-strong); background: var(--cream) }

/* 深色块上的文字（未登录提示） */
.hero-stats div.is-authed .v small a { color: var(--cream); text-decoration: underline; text-underline-offset: 3px }

@media (max-width: 1080px) {
  .agent-ledger-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .current-ledger-meta { flex-direction: column; gap: 4px; }
  .operator-main > section { padding-bottom: 40px }
  .page-operator :deep(.footer) { padding-bottom: calc(32px + 50px + env(safe-area-inset-bottom)) }
  .operator-tabs { gap: 8px; padding: 8px; }
  .operator-tabs .operator-tab-button, .operator-tabs .sp { display: none }
  .operator-tabs .admin-link { min-height: 44px }
  .operator-mobile-tabs {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 55;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    padding: 7px max(12px, env(safe-area-inset-right)) calc(7px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    border-top: 1px solid var(--line);
    background: rgba(255, 248, 236, .96);
    box-shadow: 0 -10px 26px -18px rgba(73, 59, 44, .48);
    backdrop-filter: blur(12px);
  }
  .operator-mobile-tabs button {
    display: flex;
    min-width: 0;
    min-height: 48px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 3px;
    padding: 6px 8px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--ink-60);
    font: 800 11.5px/1.1 var(--font-b);
    cursor: pointer;
  }
  .operator-mobile-tabs button.on { background: var(--yellow); color: var(--ink) }
  .operator-mobile-tabs button:focus-visible { outline: 3px solid rgba(215, 137, 53, .55); outline-offset: 1px }
}

@media (max-width: 640px) {
  .current-workbench-head { grid-template-columns:1fr; align-items:stretch; gap:14px; margin-top:12px; padding:16px 14px 14px; border-radius:16px 16px 9px 9px; }
  .current-workbench-head::before { top:12px; bottom:12px; width:3px; }
  .current-workbench-head h2 { font-size:23px; line-height:1.25; }
  .current-workbench-head p { font-size: 13px; line-height: 1.6; }
  .current-game-tag { min-height:26px; font-size:10.5px; }
  .current-workbench-index { width:100%; justify-content:stretch; gap:10px; padding:8px; box-sizing:border-box; }
  .current-index-total { min-width:58px; padding-right:10px; }
  .current-index-total b { font-size:23px; }
  .current-status-index { flex:1; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
  .current-status-index > div { padding-left:8px; }
  .current-status-index dt { font-size:9.5px; }
  .current-status-index dd { font-size:15px; }
  .current-upgrade-reminder { grid-template-columns:auto minmax(0,1fr); gap:8px 10px; padding:10px; }
  .current-upgrade-reminder-icon { width:38px; height:38px; }
  .current-upgrade-reminder-copy strong { font-size:13px; line-height:1.4; }
  .current-upgrade-reminder-copy small { font-size:11px; }
  .current-upgrade-reminder button { min-height:44px; grid-column:1 / -1; padding-inline:14px; font-size:12px; }
  .prof-filter { margin-top: 10px; padding: 11px 12px; gap: 9px; }
  .pf-row { align-items: flex-start; gap: 8px; }
  .pf-label { padding-top: 7px; font-size: 12.5px; }
  .pf-row .mf-filter { flex: 1; min-width: 0; }
  .mf-filter { gap: 4px; }
  .mf-filter button { min-height: 38px; padding: 7px 10px; font-size: 12px; }
  .catalog-prof-filter { gap:5px; padding:7px 8px 8px; }
  .catalog-prof-filter .pf-row { display:grid; grid-template-columns:32px minmax(0,1fr); align-items:center; gap:5px; }
  .catalog-prof-filter .pf-label { width:32px; min-height:34px; box-sizing:border-box; padding:2px; font-size:10.5px; }
  .catalog-prof-filter .pf-row .mf-filter { display:grid; width:100%; box-sizing:border-box; gap:3px; padding:3px; }
  .catalog-prof-filter .pf-prof-row .mf-filter { grid-template-columns:repeat(8,minmax(0,1fr)); }
  .catalog-prof-filter .pf-subprof-row .mf-filter { grid-template-columns:repeat(6,minmax(0,1fr)); }
  .catalog-prof-filter .mf-filter button { width:100%; min-width:0; min-height:34px; padding:4px 2px; border-radius:6px; font-size:10.5px; line-height:1; white-space:nowrap; touch-action:manipulation; }
  .current-prof-filter { padding:0; gap:0; }
  .current-filter-head { display:grid; grid-template-columns:auto minmax(0,1fr); align-items:center; gap:6px; padding:8px 9px; }
  .current-filter-title { display:block; }
  .current-filter-title span { display:none; }
  .current-filter-tools { width:auto; min-width:0; flex-wrap:nowrap; justify-content:flex-end; gap:4px; }
  .current-filter-result { margin:0; font-size:9.5px; }
  .current-filter-result b { font-size:12px; }
  .current-favorite-sort,
  .current-filter-reset { min-height:32px; gap:3px; padding:3px 6px; font-size:9.5px; touch-action:manipulation; }
  .current-filter-rows { gap:5px; padding:7px 8px 8px; }
  .current-prof-filter .pf-row { display:grid; grid-template-columns:32px minmax(0,1fr); align-items:center; gap:5px; }
  .current-prof-filter .pf-label { width:32px; min-height:34px; box-sizing:border-box; padding:2px; font-size:10.5px; }
  .current-prof-filter .pf-row .mf-filter { display:grid; width:100%; box-sizing:border-box; gap:3px; padding:3px; }
  .current-prof-filter .pf-prof-row .mf-filter { grid-template-columns:repeat(8,minmax(0,1fr)); }
  .current-prof-filter .pf-subprof-row .mf-filter { grid-template-columns:repeat(6,minmax(0,1fr)); }
  .current-prof-filter .pf-status-row .mf-filter { grid-template-columns:repeat(4,minmax(0,1fr)); }
  .current-prof-filter .mf-filter button { width:100%; min-width:0; min-height:34px; gap:2px; padding:4px 2px; border-radius:6px; font-size:10.5px; line-height:1; white-space:nowrap; touch-action:manipulation; }
  .current-prof-filter .pf-prof-row .mf-filter button img { display:none; }
  .current-prof-filter .current-status-filter button small { margin-left:1px; font-size:8px; }
  .current-ledger { margin-inline: -2px; padding: 12px; border-radius: 16px; }
  .current-ledger-meta { padding-bottom: 12px; font-size: 12px; line-height: 1.5; }
  .agent-ledger-grid { grid-template-columns: 1fr; gap: 12px; }
  .agent-ledger-card { padding: 14px 12px 12px; gap: 12px; }
  .ledger-card-head { gap: 9px; align-items: center; }
  .ledger-avatar { width: 44px; height: 44px; }
  .ledger-name-row { display: flex; min-width: 0; align-items: center; justify-content: flex-start; gap: 5px; }
  .ledger-name-row h3 { flex: 0 1 auto; max-width: 42%; font-size: 16px; }
  .ledger-mobile-prof { display: inline-flex; min-width: 0; flex: 1 1 auto; align-items: center; gap: 3px; overflow: hidden; color: var(--ink-60); font-size: 10.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  .ledger-mobile-prof img { width: 14px; height: 14px; flex: none; object-fit: contain; }
  .ledger-prof { display: none; }
  .ledger-status-menu { max-width: 82px; }
  .ledger-status-button { min-width: 76px; min-height: 36px; padding-inline: 7px; font-size: 10.5px; }
  .ledger-combat { gap: 8px; }
  .ledger-combat-stat { padding: 9px 10px 8px; }
  .ledger-combat-head { font-size: 11.5px; }
  .ledger-combat-value { min-height: 30px; font-size: 24px; }
  .ledger-combat-source { min-height: 14px; font-size: 10px; }
  .ledger-oddity { font-size: 11.5px; }
  .ledger-oddity input { width: 48px; font-size: 11.5px; }
  .ledger-growth { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 7px 8px; }
  .ledger-growth-row { display: flex; min-width: 0; min-height: 104px; align-items: stretch; flex-direction: column; gap: 5px; }
  .ledger-grow-label { width: auto; min-height: 18px; font-size: 11px; text-align: center; }
  .ledger-inline-field { width: 100%; min-height: 34px; justify-content: center; }
  .ledger-inline-input { width: 100%; min-height: 34px; font-size: 15px; text-align: center; }
  .ledger-growth-row > .ledger-editable { width: 100%; min-height: 34px; padding-inline: 2px; text-align: center; }
  .ledger-step-actions { width: 100%; min-width: 0; margin-left: 0; }
  .ledger-step-actions button, .ledger-smart-action, .ledger-next-action { width: 100%; min-width: 0; min-height: 32px; margin-left: 0; padding: 4px 3px; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .ledger-growth-row > .ledger-next-action { margin-top: 0; }
  .ledger-growth-row > .ledger-popover { width: min(280px, calc(100vw - 24px)); max-width: calc(100vw - 24px); left: 0; right: auto; }
  .ledger-growth-row:nth-child(2) > .ledger-popover { left: 50%; transform: translateX(-50%); }
  .ledger-growth-row:nth-child(3) > .ledger-popover { left: auto; right: 0; }
  .ledger-popover { left: 0; right: -2px; }
  .ledger-stats strong { font-size: 18px; }
  .ledger-destiny-row > span { font-size: 11px; }
  .ledger-destiny-row em { padding: 4px 7px; font-size: 10.5px; }
  .ledger-stones { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
  .ledger-stones > .stone-slot { aspect-ratio: 1; }
  .ledger-stones strong { font-size: 9.5px; }
  .ledger-stones small { font-size: 9.5px; }
  .ledger-card-footer textarea { font-size: 12px; }
  .ledger-full-edit { min-height: 44px; font-size: 12px; padding: 8px 6px; }
  .ledger-submit-message { width:min(230px,92%); }
  .ledger-material-list { max-height:130px; }
  .operator-tabs { margin-top: 24px }
  .operator-tabs .admin-link { padding-inline: 12px }
  .editor-mask { align-items: stretch; padding: 0 }
  .editor-panel { width: 100%; max-width:100vw; height: 100vh; height: 100dvh; max-height: none; border: 0; border-radius: 0 }
  .editor-head { grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: calc(14px + env(safe-area-inset-top)) 16px 12px }
  .editor-head-stats { grid-column: 1 / -1; grid-row: 2; gap: 6px }
  .editor-head-stats-note { max-width: 100%; white-space: normal }
  .editor-head-stat { min-height: 72px; padding: 8px 10px }
  .editor-head-stat input { min-height: 44px; font-size: 22px }
  .editor-close { grid-column: 2; grid-row: 1 }
  .editor-body { gap: 16px; overflow-x:hidden; padding: 18px 16px 24px }
  .editor-row { grid-template-columns: 1fr; gap: 8px; padding-bottom: 18px }
  .editor-label { padding-top: 0 }
  .num-fields .level-row { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .num-fields .elite-hint { grid-column: 1 / -1 }
  .oddity-editor { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px }
  .oddity-caption { grid-column: 1 / -1 }
  .oddity-field { grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 7px 6px }
  .oddity-name { text-align: center }
  .oddity-control { justify-content: center }
  .oddity-control input { width: 62px; min-width: 62px; min-height: 44px; padding-inline: 4px; font-size: 16px }
  .oddity-limit { font-size: 10px }
  .disc-loadout-tabs button { min-height: 64px; padding-inline: 9px }
  .disc-loadout-toolbar { position:relative; grid-template-columns: minmax(0, 1fr); align-items: stretch }
  .disc-loadout-name { grid-column:1; grid-row:1 }
  .disc-loadout-name input { min-height:44px }
  .disc-loadout-toolbar:has(.disc-auto-name) .disc-loadout-name input { padding-right:48px }
  .disc-auto-name { z-index:1; width:44px; min-height:44px; grid-column:1; grid-row:1; align-self:end; justify-self:end; gap:0; margin:0; padding:0; border-width:0 0 0 1px; border-radius:0 7px 7px 0; background:transparent }
  .disc-auto-name span { display:none }
  .disc-auto-status { padding-inline: 7px }
  .stone-editor { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px }
  .stone-item { gap: 6px; padding: 8px }
  .stone-select { min-height: 42px; padding-inline: 7px; font-size: 11px }
  .stone-level-row { grid-template-columns: minmax(54px, auto) minmax(0, 1fr); gap: 6px }
  .stone-level-field { min-width: 54px; gap: 3px }
  .stone-level-field input { width: 46px; min-width: 46px; }
  .stone-quick { display: flex; width: 100%; align-items: center; justify-content: stretch; gap: 3px; padding: 0; background: transparent }
  .stone-quick > span { display: none }
  .stone-lv-chip { flex: 1; width: auto; min-width: 0; height: 36px; padding-inline: 1px; border: 1px solid var(--line); background: var(--cream); font-size: 10px }
  .stone-presets { grid-column: 1 / -1 }
  .stone-preset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px }
  .stone-preset-item { grid-template-columns: minmax(0, 1fr); gap: 4px }
  .stone-preset-item select, .stone-preset-load { min-height: 38px }
  .stone-preset-heading, .stone-current-heading { align-items: flex-start; flex-direction: column; gap: 3px }
  .editor-actions { min-height: 78px; align-items: stretch; flex-direction: column; gap: 8px; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)) }
  .editor-conflict { flex: none; align-items: flex-start; flex-direction: column }
  .editor-conflict-actions { width: 100%; margin-left: 0 }
  .editor-conflict-btn { flex: 1; min-height: 38px }
  .editor-action-status { flex: none }
  .editor-action-buttons { width: 100%; }
  .editor-action-buttons .btn { flex: 1; }
  .archive-toggle { width: 100%; min-height: 44px; transform: none }
  .archive-workspace { margin-top: 0; padding: 14px 16px 16px }
  .archive-heading { flex-direction: column; gap: 8px }
  .archive-actions { grid-template-columns: 1fr; gap: 12px; margin-top: 14px; padding-top: 14px }
  .archive-import { width: 100%; min-height: 46px }
  .export-group { grid-template-columns: 1fr; gap: 8px }
  .export-label { font-size: 11.5px }
  .export-options { grid-template-columns: 1fr 1fr; gap: 8px }
  .export-option { min-height: 58px; padding: 8px 9px }
  .export-option b { font-size: 12px }
  .export-submit { width: 100%; min-height: 46px }
  .import-box { padding: 14px; border-radius: 14px }
  .import-box textarea { font-size: 16px }
  .import-actions { align-items: stretch; flex-direction: column }
  .import-actions .btn { width: 100% }
  .import-preview-head { align-items: stretch; flex-direction: column }
  .import-preview-head .btn { width: 100% }
  .import-preview-item summary { grid-template-columns: auto minmax(0, 1fr) }
  .import-preview-item summary small { grid-column: 2; white-space: normal }
  .import-change-list > div { grid-template-columns: 1fr; gap: 2px }
  .backpack { padding: 14px 12px 16px; border-radius: 20px }
  .slot-grid { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 12px 10px }
  .slot-count { font-size: 11.5px; padding: 2px 7px; left: 1px; bottom: 1px }
  .manifest-bar { flex-direction: column; align-items: stretch; gap: 10px }
  .manifest-bar .sp { display: none }
  .mf-search { width: auto }
  .mf-stats { justify-content: space-between }
  .mf-progress { width: 100% }
  .build-row { grid-template-columns: 48px repeat(3, minmax(48px, auto)) minmax(0, 1fr) 44px; gap: 7px 9px; padding-block: 12px }
  .build-avatar { width: 44px; height: 44px; grid-column: 1; grid-row: 1 / span 3 }
  .build-identity { grid-column: 2 / 6; grid-row: 1 }
  .build-stat { display: inline-flex; gap: 4px; grid-row: 2 }
  .build-stat:nth-of-type(1) { grid-column: 2 }
  .build-stat:nth-of-type(2) { grid-column: 3 }
  .build-stat:nth-of-type(3) { grid-column: 4 }
  .build-stat dt, .build-stat dd { display: inline; margin: 0; font-size: 10.5px }
  .build-loadouts { grid-column: 2 / 6; grid-row: 3; flex-direction: row; flex-wrap: wrap }
  .build-edit { grid-column: 6; grid-row: 1 / span 3 }
}

@media (max-width: 420px) {
  .agent-ledger-grid { grid-template-columns: 1fr; }
  .ledger-name-row { flex-direction: row; align-items: center; }
  .ledger-smart-action, .ledger-next-action { margin-left: 0; }
}

/* 手机端养成卡片与编辑器的最后一层收口：窄屏不挤压文字，也不让弹层溢出视口。 */
@media (max-width: 640px) {
  .current-ledger-meta { min-width: 0; }
  .current-ledger-meta span { min-width: 0; overflow-wrap: anywhere; }
  .ledger-card-head, .ledger-identity, .ledger-name-row, .ledger-prof { min-width: 0; }
  .ledger-prof { align-items: flex-start; flex-wrap: wrap; }
  .ledger-prof-copy { flex: 1 1 100%; }
  .ledger-notice { max-width: 100%; margin-left: 0; }
  .ledger-growth-row { min-height: 104px; align-items: stretch; }
  .ledger-inline-field, .ledger-inline-input { min-height: 34px; }
  .ledger-inline-input { width: 100%; }
  .ledger-step-actions button,
  .ledger-smart-action,
  .ledger-next-action { min-height: 32px; }
  .ledger-smart-action, .ledger-next-action { max-width: 100%; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
  .ledger-popover { left: 0; right: 0; max-width: 100%; max-height: min(52vh, 320px); overflow: auto; overscroll-behavior: contain; }
  .ledger-popover p { overflow-wrap: anywhere; }
  .ledger-popover button { min-height: 36px; }
  .ledger-disc-option { min-height: 36px; }
  .ledger-disc-options { max-height: 180px; }
  .ledger-destiny-row { align-items: flex-start; gap: 8px; }
  .ledger-destiny-row > span { padding-top: 4px; }
  .ledger-destiny-row > .ledger-destiny-values { flex: 1; }
  .ledger-stone-level-row { flex-wrap: wrap; }
  .ledger-stone-levels { flex-basis: 100%; justify-content: space-between; }
  .ledger-stone-levels button { flex: 1; min-height: 36px; }
  .ledger-stone-popover select { min-height: 40px; }
  .ledger-card-footer textarea { min-height: 44px; }
  .ledger-card-actions { justify-content: stretch; }
  .ledger-card-actions button { flex: 1; min-height: 40px; }
  .ledger-full-edit { width: 100%; }
}

@media (max-width: 420px) {
  .current-ledger { padding: 8px; }
  .ledger-growth-row { display: flex; grid-template-columns: none; min-height: 104px; gap: 5px; }
  .ledger-step-actions { min-width: 0; }
  .ledger-step-actions button { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ledger-status-menu { max-width: 76px; }
  .ledger-status-button { min-width: 70px; padding-inline: 6px; }
  .ledger-inline-input { width: 100%; }
  .ledger-smart-action, .ledger-next-action { margin-left: 0; }
  .ledger-destiny-row { flex-wrap: wrap; gap: 4px; }
  .ledger-destiny-row > span { width: 100%; padding-top: 0; }
  .ledger-destiny-row > .ledger-destiny-values { width: 100%; }
  .ledger-disc-popover { min-width: 0; }
  .ledger-disc-options { grid-template-columns: 1fr; }
  .editor-head { grid-template-columns: minmax(0, 1fr) 44px; padding-inline: 12px; }
  .editor-head h3 { font-size: 22px; }
  .editor-body { padding-inline: 12px; }
  .editor-row { gap: 6px; }
  .num-fields .level-row { grid-template-columns: 1fr; }
  .num-fields .elite-hint { grid-column: auto; white-space: normal; }
  .oddity-editor { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .disc-loadout-toolbar { grid-template-columns: minmax(0, 1fr); }
  .disc-loadout-name { grid-column:1; }
  .disc-auto-name { width:44px; justify-self:end; }
  .star-groups { grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 3px; }
  .star-pill { padding-inline: 2px; font-size: 10px; }
  .stone-editor { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; }
  .stone-item.is-main, .stone-item.is-assist { padding-inline: 6px; }
  .stone-preset-item { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .stone-preset-item select, .stone-preset-load { min-height: 40px; }
  .stone-preset-load { width: 100%; }
  .stone-level-row { grid-template-columns: minmax(54px, auto) minmax(0, 1fr); gap: 5px; }
  .stone-quick { flex-wrap: nowrap; justify-content: stretch; padding: 0; background: transparent; }
  .stone-quick > span { display: none; }
  .stone-lv-chip { flex: 1; min-height: 36px; }
  .editor-actions { padding-inline: 12px; }
  .editor-action-buttons { gap: 6px; }
  .editor-save { min-width: 0; }
}

@media (min-width: 641px) {
  .ledger-identity { position:relative; top:-2px; }
}

@media (min-width: 641px) and (max-width: 900px) {
  .archive-toggle { width: 100%; transform: none }
}
</style>
