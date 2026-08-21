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
                  <p>用于在不同平台之间迁移密探养成数据；导出前请确认账号范围。</p>
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
                    <Download :size="16" aria-hidden="true" />导出档案
                  </button>
                </div>
              </div>
            </div>
          </AccountWorkspace>

          <!-- TABS：图鉴 / 当前养成 / 养成追踪 -->
          <div class="operator-tabs" role="tablist" aria-label="密探工作区" v-reveal>
            <button type="button" class="operator-tab-button" role="tab" :aria-selected="activeTab === 'catalog'" :class="{ on: activeTab === 'catalog' }" @click="setTab('catalog')">图鉴</button>
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
          <div v-show="activeTab === 'catalog'" class="panel">
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

            <!-- 属性 / 从属 筛选 -->
            <div class="prof-filter" v-reveal>
              <div class="pf-row">
                <span class="pf-label">属性</span>
                <div class="mf-filter">
                  <button :class="{ on: profFilter === 'all' }" @click="profFilter = 'all'">全部</button>
                  <button v-for="p in profOptions" :key="p" :class="{ on: profFilter === p }" @click="profFilter = p">{{ p }}</button>
                </div>
              </div>
              <div class="pf-row">
                <span class="pf-label">从属</span>
                <div class="mf-filter">
                  <button :class="{ on: subProfFilter === 'all' }" @click="subProfFilter = 'all'">全部</button>
                  <button v-for="s in subProfOptions" :key="s" :class="{ on: subProfFilter === s }" @click="subProfFilter = s">{{ s }}</button>
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
                  <template v-if="subProfFilter !== 'all'"> · 从属「{{ subProfFilter }}」</template>
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
          <div v-show="activeTab === 'current'" class="panel">
            <div class="current-workbench-head" v-reveal>
              <div>
                <span class="section-kicker">当前账号 · 养成台账</span>
                <h2>{{ currentAccountName }}</h2>
                <p>点按虚线数值可直接校正；完整命盘、星石与面板数据仍可进入完整编辑。</p>
              </div>
              <span class="current-count"><b>{{ filteredCurrent.length }}</b> / {{ ownedCurrentEntries.length }} 位</span>
            </div>

            <!-- 属性 / 从属 筛选 -->
            <div class="prof-filter" v-reveal>
              <div class="pf-row">
                <span class="pf-label">属性</span>
                <div class="mf-filter">
                  <button :class="{ on: profFilter === 'all' }" @click="profFilter = 'all'">全部</button>
                  <button v-for="p in profOptions" :key="p" :class="{ on: profFilter === p }" @click="profFilter = p">{{ p }}</button>
                </div>
              </div>
              <div class="pf-row">
                <span class="pf-label">从属</span>
                <div class="mf-filter">
                  <button :class="{ on: subProfFilter === 'all' }" @click="subProfFilter = 'all'">全部</button>
                  <button v-for="s in subProfOptions" :key="s" :class="{ on: subProfFilter === s }" @click="subProfFilter = s">{{ s }}</button>
                </div>
              </div>
            </div>

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
                <span>版本「{{ gameFilter }}」<template v-if="profFilter !== 'all'"> · 属性「{{ profFilter }}」</template><template v-if="subProfFilter !== 'all'"> · 从属「{{ subProfFilter }}」</template></span>
                <span>校正操作仅更新养成记录，不扣减库存</span>
              </div>
              <div v-if="filteredCurrent.length === 0" class="state slim">没有匹配{{ currentFilterSuffix }}的已招募密探</div>
              <div v-else class="agent-ledger-grid" role="list">
                <article v-for="e in filteredCurrent" :key="e.id" class="agent-ledger-card" :class="[{ 'is-scan-new': scanEffectById[e.id] === 'new', 'is-scan-updated': scanEffectById[e.id] === 'updated' }, 'rarity-r' + (e.rarity || 3), 'status-' + operatorStatus(e)]" :title="buildTitle(e)" role="listitem">
                  <header class="ledger-card-head">
                    <div class="ledger-avatar">
                      <img v-if="avOf(e.id)" :src="avatarUrl(avOf(e.id))" :alt="e.name" loading="lazy" />
                      <span v-else>{{ monogram(e) }}</span>
                      <button class="ledger-favorite" :class="{ on: favoriteAgentIds.has(e.id) }" type="button" :aria-label="favoriteAgentIds.has(e.id) ? '取消特别关注' + e.name : '特别关注' + e.name" :aria-pressed="favoriteAgentIds.has(e.id)" :disabled="favoriteBusyIds.has(e.id)" @click="toggleAgentFavorite(e)"><Star :size="14" :fill="favoriteAgentIds.has(e.id) ? 'currentColor' : 'none'" aria-hidden="true" /></button>
                    </div>
                    <div class="ledger-identity">
                      <div class="ledger-name-row">
                        <h3>{{ e.name || e.id }}</h3>
                        <select :value="operatorStatus(e)" :class="'status-' + operatorStatus(e)" :aria-label="e.name + '养成状态'" @change="setOperatorStatus(e, $event.target.value)">
                          <option value="growing">养成中</option>
                          <option value="graduated">已毕业</option>
                          <option value="inactive">不养成</option>
                        </select>
                      </div>
                      <span class="ledger-prof"><img v-if="profIcon(e.prof)" :src="profIcon(e.prof)" alt="" aria-hidden="true" />{{ e.prof || '未知' }} · {{ firstSubProf(e) || '未标注从属' }}</span>
                    </div>
                  </header>

                  <section class="ledger-combat" aria-label="战斗面板与奇闻属性">
                    <div v-for="kind in ['attack', 'hp']" :key="kind" class="ledger-combat-stat" :class="{ 'is-manual': cardCombatMode(e, kind) === 'manual', 'is-stale': combatObservedStatus(e) === 'stale' }">
                      <div class="ledger-combat-head">
                        <span>{{ kind === 'attack' ? '⚔ 攻击' : '♡ 生命' }}</span>
                        <select class="ledger-combat-mode" :value="cardCombatMode(e, kind)" :aria-label="e.name + (kind === 'attack' ? '攻击来源' : '生命来源')" @change="setCardCombatMode(e, kind, $event.target.value)">
                          <option value="auto" :disabled="!cardCombatAutoAvailable(e, kind)">自动计算</option>
                          <option value="manual">手动校正</option>
                        </select>
                      </div>
                      <input class="ledger-combat-value" type="number" min="0" :value="cardCombatInputValue(e, kind)" :placeholder="cardCombatDisplay(e, kind)" :aria-label="e.name + (kind === 'attack' ? '攻击力' : '生命力')" @input="setCardCombatValue(e, kind, $event)" @blur="saveCardCombat(e)" />
                      <small class="ledger-combat-source">{{ cardCombatSource(e, kind) }}</small>
                      <label class="ledger-oddity">🦋 <input type="number" min="0" :value="cardOddityValue(e, kind)" :placeholder="cardOddityMax(e, kind)" :aria-label="e.name + (kind === 'attack' ? '奇闻属性攻击力' : '奇闻属性生命值')" @input="setCardOddityValue(e, kind, $event)" @blur="saveCardCombat(e)" /><span>/ {{ cardOddityMax(e, kind) || '—' }}</span></label>
                    </div>
                  </section>

                  <section class="ledger-growth" aria-label="核心养成">
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">等级</span>
                      <button class="ledger-editable" type="button" :aria-expanded="quickEditorKey === e.id + ':level'" @click="openQuickEditor(e, 'level')">Lv {{ e.level }}</button>
                      <div class="ledger-step-actions"><button type="button" :disabled="quickSavingIds.has(e.id) || e.level >= 100" @click="quickCorrect(e, 'level', Math.min(100, e.level + 5))">+5</button><button type="button" :disabled="quickSavingIds.has(e.id) || e.level >= 100" @click="quickCorrect(e, 'level', Math.min(100, e.level + 10))">+10</button></div>
                      <div v-if="quickEditorKey === e.id + ':level'" class="ledger-popover">
                        <p><CircleAlert :size="13" aria-hidden="true" />仅校正记录，不扣减库存</p>
                        <div><input v-model.number="quickDrafts[e.id].level" type="number" min="0" max="100" aria-label="校正等级" /><button type="button" @click="quickCorrect(e, 'level', quickDrafts[e.id].level)">保存</button></div>
                      </div>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">修为</span>
                      <button class="ledger-editable" type="button" :aria-expanded="quickEditorKey === e.id + ':elite'" @click="openQuickEditor(e, 'elite')">{{ e.elite }}</button>
                      <button class="ledger-smart-action" type="button" :disabled="quickSavingIds.has(e.id) || e.elite >= getMaxEliteForLevel(e.level)" @click="openQuickConfirm(e, 'elite')"><ChevronUp :size="13" aria-hidden="true" />升至 {{ Math.min(getMaxEliteForLevel(e.level), e.elite + 3) }}</button>
                      <div v-if="quickEditorKey === e.id + ':elite'" class="ledger-popover">
                        <p><CircleAlert :size="13" aria-hidden="true" />仅校正记录，不扣减库存</p>
                        <div><input v-model.number="quickDrafts[e.id].elite" type="number" min="0" :max="getMaxEliteForLevel(e.level)" aria-label="校正修为" /><button type="button" @click="quickCorrect(e, 'elite', quickDrafts[e.id].elite)">保存</button></div>
                      </div>
                      <div v-if="quickConfirmKey === e.id + ':elite'" class="ledger-popover is-confirm">
                        <strong>确认提升修为</strong><p>修为 {{ e.elite }} → {{ Math.min(getMaxEliteForLevel(e.level), e.elite + 3) }}，库存不会自动扣减。</p>
                        <div><button class="cancel" type="button" @click="quickConfirmKey = ''">取消</button><button type="button" @click="quickCorrect(e, 'elite', Math.min(getMaxEliteForLevel(e.level), e.elite + 3))">确认</button></div>
                      </div>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">化极</span>
                      <button class="ledger-editable" type="button" :aria-expanded="quickEditorKey === e.id + ':star'" @click="openQuickEditor(e, 'star')">{{ starLabel(e.starLevel, e.spOf) }}</button>
                      <button class="ledger-next-action" type="button" :disabled="quickSavingIds.has(e.id) || e.starLevel >= (e.spOf ? 5 : 31)" @click="quickCorrect(e, 'star', e.starLevel + 1)">下一节点</button>
                      <div v-if="quickEditorKey === e.id + ':star'" class="ledger-popover">
                        <p><CircleAlert :size="13" aria-hidden="true" />仅校正记录，不扣减库存</p>
                        <div><input v-model.number="quickDrafts[e.id].star" type="number" min="0" :max="e.spOf ? 5 : 31" aria-label="校正化极节点" /><button type="button" @click="quickCorrect(e, 'star', quickDrafts[e.id].star)">保存</button></div>
                      </div>
                    </div>
                  </section>

                  <div class="ledger-destiny">
                    <div v-for="index in 2" :key="index" class="ledger-destiny-row"><span>命盘{{ index === 1 ? '一' : '二' }}</span><div><template v-if="cardLoadoutDiscs(e, index - 1).length"><em v-for="disc in cardLoadoutDiscs(e, index - 1)" :key="disc">{{ disc }}</em></template><em v-else class="empty">+ 词条</em></div></div>
                  </div>

                  <div class="ledger-stones" aria-label="已装备星石">
                    <div v-for="(stone, index) in cardStoneSlots(e)" :key="index" class="stone-slot" :class="{ 'is-empty': !stone }"><template v-if="stone"><strong>{{ stone.name || '星石' }}</strong><small>{{ stone.level || 0 }}</small></template><span v-else>+</span></div>
                  </div>

                  <div class="ledger-card-footer">
                    <textarea :value="operatorRemark(e)" rows="2" :aria-label="e.name + '备忘'" placeholder="添加备忘…" @input="setOperatorRemarkDraft(e, $event.target.value)" @blur="saveOperatorRemark(e)"></textarea>
                    <p v-if="quickNotices[e.id]" class="ledger-notice" role="status">{{ quickNotices[e.id] }}</p>
                    <button class="ledger-full-edit" type="button" @click.stop="openEdit(e.id)"><Pencil :size="14" aria-hidden="true" />完整编辑</button>
                  </div>
                </article>
              </div>
            </div>
          </div>

          <div v-show="activeTab === 'tracking'" class="panel">
            <OperatorGrowthTracker
              :account-id="accountId"
              :current-entries="currentEntries"
              :catalog-entries="catalogOperators"
              :favorite-ids="favoriteAgentIds"
              :is-logged-in="auth.isLoggedIn"
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
                      title="根据已选命盘恢复自动命名"
                      @click="resetDiscLoadoutName(selectedDiscLoadoutIndex)"
                    ><RotateCcw :size="14" aria-hidden="true" />恢复自动命名</button>
                  </div>

                  <div class="disc-options">
                    <div class="disc-options-head">
                      <span>选择命盘</span>
                      <strong>{{ selectedDiscLoadout.discNames.length }} / 3</strong>
                    </div>
                    <p v-if="!editingDiscs.length" class="hint">该密探暂无命盘目录数据，可直接留空保存。</p>
                    <label v-for="d in editingDiscs" :key="discKey(d)" class="disc-option" :class="[discColorClass(d), { on: isDiscSelected(d) }]">
                      <input type="checkbox" :checked="isDiscSelected(d)" @change="toggleDiscSelection(d, $event)" />
                      <span class="disc-name">{{ discKey(d) }}</span>
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
                <div v-for="slot in stoneSlots" :key="slot.type" class="stone-item">
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
import { ref, computed, watch, nextTick, onBeforeUnmount, onMounted } from 'vue'
import { Archive, BookOpen, Calculator, ChevronUp, CircleAlert, Download, ListChecks, Pencil, RotateCcw, Save, Star, Target, Upload, X } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import AccountWorkspace from '../../components/AccountWorkspace.vue'
import OperatorGrowthTracker from '../../components/operator/OperatorGrowthTracker.vue'
import {
  getOperatorCatalog,
  listOperatorAccounts,
  createOperatorAccount,
  updateOperatorAccountGame,
  renameOperatorAccount,
  deleteOperatorAccount,
  getOperatorCurrent,
  patchOperatorCurrent,
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
import { listAgentFavorites, addAgentFavorite, removeAgentFavorite } from '../../api/inventory.js'
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
const manifestSearch = ref('')
const manifestFilter = ref('all')
const profFilter = ref('all')
const subProfFilter = ref('all')
const profOptions = AGENT_PROFS
const subProfOptions = computed(function () { return deriveSubProfOptions(catalogOperators.value) })
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
let accountEventRefreshTimer = null
let unsubscribeAccountEvents = null
let scanFocusSeq = 0
let finishPendingScanScroll = null
const scanEffectTimers = new Map()
const operatorSlotElements = new Map()

// 当前养成台账卡的轻量交互状态（状态与备忘是浏览器侧偏好，不改变后端协议）
const quickEditorKey = ref('')
const quickConfirmKey = ref('')
const quickDrafts = ref({})
const quickSavingIds = ref(new Set())
const quickNotices = ref({})
const workbenchStatuses = ref({})
const workbenchRemarks = ref({})
const workbenchRemarkSaving = ref(new Set())
const cardCombatDrafts = ref({})
const cardCombatModes = ref({})
const cardCombatSavingIds = ref(new Set())

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
  cardCombatModes.value = readWorkbenchMap('combat-modes')
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

const editingDiscs = computed(function () {
  return ((editingOp.value && editingOp.value.discs) || [])
    .map(function (disc, index) { return { disc: disc, index: index } })
    .sort(function (a, b) {
      const aOrder = DISC_COLOR_ORDER[a.disc && a.disc.color] ?? 3
      const bOrder = DISC_COLOR_ORDER[b.disc && b.disc.color] ?? 3
      const aMajorGold = isMajorGoldDisc(a.disc) ? 1 : 0
      const bMajorGold = isMajorGoldDisc(b.disc) ? 1 : 0
      return (aOrder - bOrder) || (aMajorGold - bMajorGold) || (a.index - b.index)
    })
    .map(function (entry) { return entry.disc })
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
    { type: 'assist1', label: '辅星 1' },
    { type: 'main2', label: '主星 2' },
    { type: 'assist2', label: '辅星 2' },
    { type: 'main3', label: '主星 3' },
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
    return star + ' 星 · ' + node
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

// 图鉴顶部统计口径（不跟随属性/从属/搜索/已拥有筛选）：仅按游戏过滤的全量
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

// 图鉴展示列表：在全量基础上叠加 属性/从属/搜索/已拥有 筛选
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
  if (subProfFilter.value !== 'all') parts.push('从属「' + subProfFilter.value + '」')
  if (manifestFilter.value === 'owned') parts.push('「已拥有」')
  if (manifestFilter.value === 'missing') parts.push('「未拥有」')
  return parts.length ? parts.join(' · ') : ''
})

// 当前养成首要口径：只展示已拥有，再叠加属性 / 从属筛选。
const ownedCurrentEntries = computed(function () {
  return currentEntries.value.filter(isOperatorOwned)
})

const filteredCurrent = computed(function () {
  return ownedCurrentEntries.value.filter(function (e) {
    return matchesProfSubFilter(e, profFilter.value, subProfFilter.value)
  }).sort(function (a, b) {
    const order = { growing: 0, graduated: 1, inactive: 2 }
    return (order[operatorStatus(a)] ?? 0) - (order[operatorStatus(b)] ?? 0)
  })
})

const currentFilterSuffix = computed(function () {
  const parts = []
  parts.push('版本「' + gameFilter.value + '」')
  if (profFilter.value !== 'all') parts.push('属性「' + profFilter.value + '」')
  if (subProfFilter.value !== 'all') parts.push('从属「' + subProfFilter.value + '」')
  return parts.length ? parts.join(' · ') : '当前条件'
})

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

function buildTitle(e) {
  const parts = [e.name || e.id, '修为 ' + e.elite, starLabel(e.starLevel, e.spOf), 'Lv' + e.level]
  if (e.discLoadouts && e.discLoadouts.length) parts.push('命盘：' + e.discLoadouts.map(function (loadout) { return loadoutSummary(loadout) }).join(' / '))
  else if (e.discs && e.discs.length) parts.push('命盘：' + e.discs.map(function (d) { return d.ot_name || d.abbreviation || d.otName }).join('、'))
  if (e.starStones && e.starStones.length) parts.push('星石：' + e.starStones.map(function (s) { return (s.name || s.type) + ' Lv' + s.level }).join('、'))
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

function operatorStatus(entry) {
  if (workbenchStatuses.value[entry.id]) return workbenchStatuses.value[entry.id]
  return 'growing'
}

function setOperatorStatus(entry, value) {
  workbenchStatuses.value = Object.assign({}, workbenchStatuses.value, { [entry.id]: value })
  persistWorkbenchMap('statuses', workbenchStatuses.value)
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
  const loadout = entry.discLoadouts && entry.discLoadouts[index]
  if (loadout) {
    const names = Array.isArray(loadout.discNames) ? loadout.discNames : (Array.isArray(loadout.discs) ? loadout.discs.map(discKey).filter(Boolean) : [])
    return names.slice(0, 3)
  }
  return index === 0 && Array.isArray(entry.discs) ? entry.discs.map(discKey).filter(Boolean).slice(0, 3) : []
}

function cardStoneSlots(entry) {
  const stones = Array.isArray(entry.starStones) ? entry.starStones : []
  return Array.from({ length: 6 }, function (_, index) {
    const stone = stones[index]
    return stone && (stone.name || stone.type) ? stone : null
  })
}

function operatorRemark(entry) {
  if (Object.prototype.hasOwnProperty.call(workbenchRemarks.value, entry.id)) return workbenchRemarks.value[entry.id]
  return entry.remark || entry.note || ''
}

function setOperatorRemarkDraft(entry, value) {
  workbenchRemarks.value = Object.assign({}, workbenchRemarks.value, { [entry.id]: value })
}

function saveOperatorRemark(entry) {
  persistWorkbenchMap('remarks', workbenchRemarks.value)
}

function cardCombatStones(entry) {
  return (Array.isArray(entry.starStones) ? entry.starStones : []).reduce(function (result, stone, index) {
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
  return {
    operatorName: entry.name,
    level: entry.level,
    elite: entry.elite,
    starLevel: entry.starLevel,
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
  if (mode === 'auto') return '自动计算' + (combatObservedStatus(entry) === 'stale' ? ' · 观测已过期' : '')
  if (mode === 'manual') return '手动 / 观测值' + (combatObservedStatus(entry) === 'stale' ? ' · 观测已过期' : '')
  return combatStatsSourceLabel(result.source, result.status)
}

function setCardCombatMode(entry, kind, mode) {
  mode = mode === 'auto' ? 'auto' : 'manual'
  const next = Object.assign({}, cardCombatModes.value[entry.id] || {}, { [kind]: mode })
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, { [entry.id]: next })
  persistWorkbenchMap('combat-modes', cardCombatModes.value)
  saveCardCombat(entry)
}

function setCardCombatValue(entry, kind, event) {
  const draft = cardCombatDraft(entry)
  const raw = event && event.target ? event.target.value : ''
  draft[kind] = raw === '' ? null : Number(raw)
  const next = Object.assign({}, cardCombatModes.value[entry.id] || {}, { [kind]: 'manual' })
  cardCombatModes.value = Object.assign({}, cardCombatModes.value, { [entry.id]: next })
  persistWorkbenchMap('combat-modes', cardCombatModes.value)
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
  const draft = cardCombatDraft(entry)
  const raw = event && event.target ? event.target.value : ''
  draft[kind === 'attack' ? 'oddityAttack' : 'oddityHp'] = raw === '' ? 0 : Number(raw)
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
    patch.combat_stats.observed_inputs = { signature: signature, level: entry.level, elite: entry.elite, star_level: entry.starLevel }
  }
  cardCombatSavingIds.value = new Set([...cardCombatSavingIds.value, entry.id])
  try {
    await patchOperatorCurrent({ accountId: accountId.value, operatorId: entry.id, game: saveGame.value, patch: patch })
    await reloadCurrent(true)
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
  activeTab.value = t
  if ((t === 'current' || t === 'tracking') && currentEntries.value.length === 0) reloadCurrent()
  if (t === 'tracking') loadAgentFavorites()
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
    currentEntries.value = []
    error.value = ''
    loading.value = false
    return
  }
  if (!accountId.value) {
    currentLoadSeq += 1
    currentEntries.value = []
    error.value = ''
    loading.value = false
    return
  }
  const targetAccount = accountId.value
  const targetGame = gameFilter.value
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
  reloadCurrent()
}

async function doExport() {
  if (!auth.isLoggedIn) { goLogin(); return }
  if (!accountId.value) { await dialog.alert({ message: '请先创建并选择一个子账号' }); return }
  try {
    const opts = {}
    if (exportAll.value && accounts.value.length > 1) {
      opts.scope = 'all'
    } else {
      opts.accountId = accountId.value
    }
    const data = await exportOperator(opts)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'operator-export.json'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch (err) {
    await dialog.alert({ title: '导出失败', message: humanErr(err, '导出失败') })
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

onMounted(async function () {
  await loadCatalog()
  await loadAccounts()
  await Promise.all([reloadCurrent(), loadAgentFavorites()])
  unsubscribeAccountEvents = subscribeAccountEvents(handleAccountEvent)
})

onBeforeUnmount(function () {
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

/* ---- 属性 / 从属 筛选行 ---- */
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
.current-workbench-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-top:18px; padding:18px 2px 6px }
.current-workbench-head h2 { margin-top:4px; font-family:var(--font-s); font-size:24px; font-weight:900; letter-spacing:.04em }
.current-workbench-head p { margin-top:6px; color:var(--ink-60); font-size:12px; line-height:1.7 }
.current-count { flex:none; color:var(--ink-60); font-size:12px; font-weight:800 }
.current-count b { color:var(--accent-strong); font:900 28px var(--font-d) }
.current-ledger { margin-top:16px; padding:16px; border:1px solid rgba(255,248,236,.22); border-radius:20px; background:linear-gradient(145deg,var(--tea),var(--tea-deep)); box-shadow:0 20px 40px -24px rgba(73,59,44,.55) }
.current-ledger-meta { display:flex; justify-content:space-between; gap:12px; padding:0 2px 14px; color:rgba(255,248,236,.76); font-size:11px; font-weight:700; line-height:1.6 }
.current-ledger-meta span:last-child { color:var(--yellow) }
.agent-ledger-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px }
.agent-ledger-card { position:relative; min-width:0; display:flex; flex-direction:column; gap:11px; padding:14px 12px 12px; color:var(--ink); border:1px solid var(--line); border-radius:12px; background:linear-gradient(180deg,var(--surface),var(--cream)); box-shadow:0 8px 24px rgba(73,59,44,.18), inset 0 1px 0 rgba(255,255,255,.8); transition:transform .35s var(--ease),box-shadow .35s var(--ease) }
.agent-ledger-card:hover { transform:translateY(-5px); box-shadow:0 18px 30px rgba(73,59,44,.25), inset 0 1px 0 rgba(255,255,255,.8) }
.agent-ledger-card.rarity-r5 { border-top:2px solid var(--accent) }
.agent-ledger-card.rarity-r4 { border-top:2px solid var(--brand-blue) }
.agent-ledger-card.status-growing { border-left:3px solid #6f9f76 }
.agent-ledger-card.status-graduated { border-left:3px solid var(--yellow-deep) }
.agent-ledger-card.status-inactive { border-left:3px solid rgba(73,59,44,.35) }
.ledger-card-head { display:flex; gap:10px; align-items:center; min-width:0 }
.ledger-avatar { position:relative; flex:none; width:46px; height:46px; overflow:visible; border:2px solid var(--yellow-deep); border-radius:10px; background:var(--paper) }
.ledger-avatar img { width:100%; height:100%; display:block; object-fit:cover; border-radius:8px }
.ledger-avatar > span { display:grid; width:100%; height:100%; place-items:center; font:900 21px var(--font-s); color:var(--ink-35) }
.ledger-favorite { position:absolute; right:-9px; top:-9px; z-index:2; width:22px; height:22px; display:grid; place-items:center; padding:0; border:1px solid var(--line); border-radius:50%; background:var(--surface); color:var(--ink-35); cursor:pointer; box-shadow:0 2px 5px rgba(73,59,44,.18) }
.ledger-favorite.on { color:var(--accent); border-color:var(--accent) }
.ledger-favorite:focus-visible { outline:2px solid var(--brand-blue); outline-offset:2px }
.ledger-identity { min-width:0; flex:1 }
.ledger-name-row { display:flex; align-items:center; justify-content:space-between; gap:5px }
.ledger-name-row h3 { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:16px; font-weight:900; font-family:var(--font-s) }
.ledger-name-row select { max-width:64px; padding:3px 4px; border:0; border-radius:4px; background:var(--yellow); color:var(--ink); font-size:10px; font-weight:800; cursor:pointer; outline:none }
.ledger-name-row select.status-growing { background:#BFDCC0; color:#315f38 }
.ledger-name-row select.status-graduated { background:var(--yellow); color:var(--ink) }
.ledger-name-row select.status-inactive { background:rgba(73,59,44,.16); color:var(--ink-60) }
.ledger-prof { display:flex; align-items:center; gap:4px; margin-top:4px; color:var(--ink-60); font-size:10.5px; font-weight:700 }
.ledger-prof img { width:15px; height:15px; object-fit:contain }
.ledger-combat { display:grid; grid-template-columns:1fr 1fr; gap:7px }
.ledger-combat-stat { min-width:0; padding:7px 8px 6px; border:1px solid var(--line); border-radius:6px; background:var(--surface); transition:border-color .2s, box-shadow .2s }
.ledger-combat-stat:focus-within { border-color:var(--accent); box-shadow:0 0 0 2px rgba(215,137,53,.1) }
.ledger-combat-stat.is-manual { border-color:rgba(215,137,53,.58); background:var(--cream) }
.ledger-combat-stat.is-stale { border-color:rgba(166,81,74,.42) }
.ledger-combat-head { display:flex; align-items:center; justify-content:space-between; gap:4px; color:var(--ink-60); font-size:10px; font-weight:800 }
.ledger-combat-mode { max-width:74px; padding:2px 3px; border:1px solid var(--line); border-radius:999px; background:var(--paper); color:var(--ink-60); font-size:9px; font-weight:800; cursor:pointer; outline:none }
.ledger-combat-mode:focus { border-color:var(--accent); box-shadow:0 0 0 2px rgba(215,137,53,.12) }
.ledger-combat-mode option { color:var(--ink); background:var(--surface) }
.ledger-combat-value { display:block; width:100%; min-width:0; margin-top:3px; padding:1px 0 3px; border:0; border-bottom:1px dashed var(--accent); outline:none; background:transparent; color:var(--ink); font:900 21px/1 var(--font-d); -moz-appearance:textfield }
.ledger-combat-value::-webkit-outer-spin-button,.ledger-combat-value::-webkit-inner-spin-button { -webkit-appearance:none }
.ledger-combat-value::placeholder { color:var(--ink); opacity:1 }
.ledger-combat-value:focus::placeholder { color:transparent }
.ledger-combat-source { display:block; margin-top:4px; min-height:12px; color:var(--ink-35); font-size:8px; font-weight:800 }
.ledger-oddity { display:flex; align-items:center; gap:2px; margin-top:4px; color:var(--accent-strong); font:800 10px var(--font-d) }
.ledger-oddity input { width:35px; min-width:0; padding:0 1px; border:0; border-bottom:1px dashed var(--line); outline:none; background:transparent; color:var(--ink-60); font:800 10px var(--font-d); text-align:right; -moz-appearance:textfield }
.ledger-oddity input::-webkit-outer-spin-button,.ledger-oddity input::-webkit-inner-spin-button { -webkit-appearance:none }
.ledger-oddity span { color:var(--ink-35); font-size:9px }
.ledger-growth { display:flex; flex-direction:column; gap:7px; padding:9px 9px 8px; border:1px solid var(--line); border-radius:8px; background:rgba(255,255,255,.62) }
.ledger-growth-row { position:relative; display:flex; align-items:center; min-height:24px; gap:5px; font-size:11px }
.ledger-grow-label { width:32px; flex:none; color:var(--ink-60); font-weight:700 }
.ledger-editable { padding:0 2px; border:0; border-bottom:1px dashed var(--accent); background:transparent; color:var(--ink); font:700 13px var(--font-d); cursor:pointer }
.ledger-editable:hover { color:var(--accent-strong) }
.ledger-step-actions { display:flex; gap:3px; margin-left:auto }
.ledger-step-actions button,.ledger-next-action { border:1px solid var(--line); border-radius:4px; padding:3px 5px; background:var(--surface); color:var(--ink); font-size:10px; font-weight:800; cursor:pointer }
.ledger-step-actions button:hover,.ledger-next-action:hover:not(:disabled) { border-color:var(--accent); background:var(--yellow) }
.ledger-smart-action { display:inline-flex; align-items:center; gap:2px; margin-left:auto; border:1px solid rgba(74,138,65,.35); border-radius:4px; padding:3px 5px; background:#E8F4E9; color:#378B3A; font-size:10px; font-weight:800; cursor:pointer }
.ledger-next-action { margin-left:auto }
.ledger-step-actions button:disabled,.ledger-smart-action:disabled,.ledger-next-action:disabled { opacity:.4; cursor:not-allowed }
.ledger-popover { position:absolute; z-index:20; left:24px; right:0; top:calc(100% + 7px); display:flex; flex-direction:column; gap:7px; padding:9px; border:1px solid var(--accent); border-radius:8px; background:var(--surface); box-shadow:0 10px 25px rgba(73,59,44,.22) }
.ledger-popover::before { position:absolute; top:-6px; left:20px; width:10px; height:10px; border-left:1px solid var(--accent); border-top:1px solid var(--accent); background:var(--surface); content:''; transform:rotate(45deg) }
.ledger-popover p { display:flex; align-items:flex-start; gap:4px; color:var(--brand-blue); font-size:9.5px; line-height:1.35; font-weight:700 }
.ledger-popover > div { display:flex; gap:5px }
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
.ledger-destiny-row { display:flex; align-items:flex-start; gap:5px; min-width:0 }
.ledger-destiny-row > span { flex:none; padding-top:3px; color:var(--accent-strong); font-size:10px; font-weight:800 }
.ledger-destiny-row > div { display:flex; flex-wrap:wrap; gap:3px; min-width:0 }
.ledger-destiny-row em { padding:2px 5px; border:1px solid rgba(215,137,53,.28); border-radius:4px; background:rgba(215,137,53,.12); color:var(--ink); font-size:9px; font-style:normal; font-weight:500 }
.ledger-destiny-row em.empty { border-style:dashed; background:transparent; color:var(--ink-35) }
.ledger-stones { display:grid; flex:0 0 42px; align-content:start; grid-template-columns:repeat(6,minmax(0,1fr)); grid-auto-rows:42px; height:42px; min-height:42px; max-height:42px; gap:3px; padding-top:2px; overflow:visible }
.ledger-stones > .stone-slot { width:100%; height:42px; min-height:42px; max-height:42px; overflow:hidden; display:flex; flex:none; flex-direction:column; align-items:center; justify-content:center; min-width:0; border:1px solid var(--line); border-radius:4px; background:var(--surface); text-align:center; box-sizing:border-box }
.ledger-stones > .stone-slot.is-empty { height:42px; min-height:42px; max-height:42px; flex:0 0 42px; background:transparent; color:var(--line); font-size:15px }
.ledger-stones strong { max-width:100%; overflow:hidden; color:var(--ink); font-size:8px; text-overflow:ellipsis; white-space:nowrap }
.ledger-stones small { color:var(--ink-60); font:8px var(--font-d) }
.ledger-card-footer { display:flex; flex-direction:column; gap:7px; margin-top:auto; padding-top:4px }
.ledger-card-footer textarea { width:100%; resize:vertical; min-height:36px; padding:4px 0; border:0; border-bottom:1px dashed var(--line); outline:none; background:transparent; color:var(--ink); font:10.5px/1.45 var(--font-b) }
.ledger-card-footer textarea:focus { border-bottom-color:var(--accent) }
.ledger-card-footer textarea::placeholder { color:var(--ink-35) }
.ledger-full-edit { display:flex; align-items:center; justify-content:center; gap:5px; width:100%; padding:7px; border:0; border-radius:6px; background:var(--ink); color:var(--cream); font-size:11px; font-weight:800; cursor:pointer }
.ledger-full-edit:hover { background:var(--accent) }
.ledger-notice { color:var(--accent-strong); font-size:10px; font-weight:800 }
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
.editor-panel { position: relative; z-index: 1; display: flex; width: min(760px, 100%); height: min(92vh, 900px); height: min(92dvh, 900px); max-height: calc(100vh - 48px); max-height: calc(100dvh - 48px); min-height: 0; flex-direction: column; overflow: hidden; background: var(--surface); border: 1px solid var(--line); border-radius: 24px; box-shadow: 0 40px 100px -30px rgba(73, 59, 44, .5); pointer-events: auto }
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
.editor-head-stat input { width: 100%; min-width: 0; min-height: 32px; padding: 1px 0 2px; border: 0; outline: none; background: transparent; color: var(--accent-strong); font: 900 23px/1 var(--font-d); letter-spacing: -.02em; text-align: right; -moz-appearance: textfield }
.editor-head-stat input::placeholder { color: var(--accent-strong); opacity: 1 }
.editor-head-stat.is-empty input::placeholder { color: var(--ink-35) }
.editor-head-stat input:focus::placeholder { color: transparent; opacity: 0 }
.editor-head-stat input:focus-visible { outline: none }
.editor-head-stat input::-webkit-outer-spin-button, .editor-head-stat input::-webkit-inner-spin-button { -webkit-appearance: none }
.editor-close { display: grid; width: 44px; height: 44px; grid-column: 3; grid-row: 1; place-items: center; border: 0; border-radius: 9px; background: transparent; color: var(--ink-60); cursor: pointer; transition: color .25s, background-color .25s }
.editor-close:hover { color: var(--rouge); background: rgba(166, 81, 74, .08) }
.editor-close:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.editor-body { display: flex; min-height: 0; flex: 1 1 auto; flex-direction: column; gap: 18px; overflow-y: auto; overscroll-behavior: contain; padding: 22px 28px 28px; scrollbar-gutter: stable }
.editor-row { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 16px; align-items: start; padding: 4px 0 20px; border-bottom: 1px solid var(--line) }
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
.star-groups { display: flex; flex-wrap: wrap; gap: 6px }
.star-pill {
  border: 1.5px solid var(--line);
  background: var(--surface);
  color: var(--ink-60);
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 12.5px;
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
.oddity-field { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 9px; background: var(--cream) }
.oddity-name { min-width: 0; overflow: hidden; color: var(--ink); font-size: 11px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap }
.oddity-control { display: inline-flex; min-width: 0; align-items: center; gap: 4px }
.oddity-control input { width: 52px; min-width: 0; min-height: 36px; border: 1px solid var(--line); border-radius: 7px; padding: 6px; outline: none; background: var(--surface); color: var(--ink); font: 800 12px var(--font-d); text-align: right; -moz-appearance: textfield }
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
.disc-loadout-panel { margin-top: 8px; padding: 11px 12px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream) }
.disc-loadout-toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; padding-bottom: 10px; border-bottom: 1px dashed var(--line) }
.disc-loadout-name { display: flex; min-width: 0; flex-direction: column; gap: 4px; color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.disc-loadout-name-head { display: flex; min-width: 0; min-height: 20px; align-items: center; justify-content: space-between; gap: 8px }
.disc-loadout-name input { width: 100%; min-width: 0; min-height: 38px; padding: 7px 9px; border: 1.5px solid var(--line); border-radius: 7px; outline: none; background: var(--surface); color: var(--ink); font: 800 12.5px var(--font-b) }
.disc-loadout-name input:focus { border-color: var(--accent) }
.disc-auto-name { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 5px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink-60); font: 800 10.5px var(--font-b); white-space: nowrap }
.disc-auto-name { cursor: pointer }
.disc-auto-name:hover { border-color: var(--accent); color: var(--accent-strong) }
.disc-auto-status { display: inline-flex; min-width: 0; min-height: 20px; align-items: center; overflow: hidden; padding: 2px 7px; border-radius: 999px; background: rgba(215, 137, 53, .12); color: var(--accent-strong); font-size: 9px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap }
.disc-options { display: flex; flex-wrap: wrap; gap: 7px; padding-top: 10px }
.disc-options-head { display: flex; flex-basis: 100%; align-items: center; justify-content: space-between; color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.disc-options-head strong { color: var(--accent-strong); font-family: var(--font-d); font-size: 11px }
.disc-options .hint { flex-basis: 100%; font-size: 11.5px; color: var(--ink-35) }
.disc-storage-note { margin-top: 7px; color: var(--ink-35); font-size: 10.5px; font-weight: 700; line-height: 1.5 }
.disc-option { position: relative; display: inline-flex; min-height: 34px; align-items: center; font-size: 12px; font-weight: 800; color: var(--ink-60); background: var(--paper); border: 1.5px solid var(--line); border-radius: 999px; padding: 6px 12px; cursor: pointer; transition: all .25s; user-select: none }
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
.stone-editor { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; flex: 1; min-width: 200px }
.stone-presets { grid-column: 1 / -1; padding: 11px 12px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream) }
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
.stone-current-heading { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 8px; padding: 3px 2px 0; border-top: 1px dashed var(--line); }
.stone-current-heading strong { color: var(--tea); font-family: var(--font-s); font-size: 13px; font-weight: 900 }
.stone-current-heading span { color: var(--ink-35); font-size: 10.5px; font-weight: 700 }
.stone-item { display: flex; min-width: 0; flex-direction: column; align-items: stretch; gap: 8px; background: var(--paper); border: 1.5px solid var(--line); border-radius: 10px; padding: 10px 12px }
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
.stone-editor .hint { grid-column: 1 / -1; font-size: 11px; color: var(--ink-35); line-height: 1.5 }
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
  .current-workbench-head { align-items: flex-start; flex-direction: column; gap: 8px; }
  .current-workbench-head h2 { font-size: 21px; }
  .current-ledger { margin-inline: -4px; padding: 10px; border-radius: 16px; }
  .agent-ledger-grid { grid-template-columns: 1fr; gap: 10px; }
  .agent-ledger-card { padding: 11px 9px 10px; gap: 9px; }
  .ledger-card-head { gap: 7px; align-items: flex-start; }
  .ledger-avatar { width: 40px; height: 40px; }
  .ledger-name-row { align-items: flex-start; flex-direction: column; gap: 3px; }
  .ledger-name-row h3 { font-size: 14px; }
  .ledger-name-row select { max-width: none; font-size: 9px; }
  .ledger-prof { font-size: 9px; }
  .ledger-combat-value { font-size: 19px; }
  .ledger-growth { padding: 7px 6px; }
  .ledger-growth-row { flex-wrap: wrap; gap: 4px; }
  .ledger-grow-label { width: 28px; font-size: 10px; }
  .ledger-smart-action, .ledger-next-action { margin-left: 32px; }
  .ledger-step-actions { margin-left: auto; }
  .ledger-popover { left: 0; right: -2px; }
  .ledger-stats strong { font-size: 15px; }
  .ledger-destiny-row > span { font-size: 9px; }
  .ledger-destiny-row em { font-size: 8px; }
  .ledger-stones { grid-auto-rows: 42px; }
  .ledger-stones > .stone-slot { height: 42px; min-height: 42px; max-height: 42px; }
  .ledger-stones strong { font-size: 7px; }
  .ledger-full-edit { font-size: 10px; padding: 6px 3px; }
  .operator-tabs { margin-top: 24px }
  .operator-tabs .admin-link { padding-inline: 12px }
  .editor-mask { align-items: stretch; padding: 0 }
  .editor-panel { width: 100%; height: 100vh; height: 100dvh; max-height: none; border: 0; border-radius: 0 }
  .editor-head { grid-template-columns: minmax(0, 1fr) auto; gap: 10px; padding: calc(14px + env(safe-area-inset-top)) 16px 12px }
  .editor-head-stats { grid-column: 1 / -1; grid-row: 2; gap: 6px }
  .editor-head-stats-note { max-width: 100%; white-space: normal }
  .editor-head-stat { min-height: 72px; padding: 8px 10px }
  .editor-head-stat input { min-height: 44px; font-size: 22px }
  .editor-close { grid-column: 2; grid-row: 1 }
  .editor-body { gap: 16px; padding: 18px 16px 24px }
  .editor-row { grid-template-columns: 1fr; gap: 8px; padding-bottom: 18px }
  .editor-label { padding-top: 0 }
  .num-fields .level-row { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .num-fields .elite-hint { grid-column: 1 / -1 }
  .oddity-editor { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px }
  .oddity-caption { grid-column: 1 / -1 }
  .oddity-field { grid-template-columns: minmax(0, 1fr); gap: 4px; padding: 7px 6px }
  .oddity-name { text-align: center }
  .oddity-control { justify-content: center }
  .oddity-control input { width: 44px; min-height: 44px; padding-inline: 4px; font-size: 16px }
  .oddity-limit { font-size: 10px }
  .disc-loadout-tabs button { min-height: 64px; padding-inline: 9px }
  .disc-loadout-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch }
  .disc-loadout-name { grid-column: 1 / -1 }
  .disc-auto-name { min-height: 44px; padding-inline: 8px }
  .disc-auto-status { padding-inline: 7px }
  .stone-editor { grid-template-columns: minmax(0, 1fr) }
  .stone-preset-grid { grid-template-columns: minmax(0, 1fr) }
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
  .ledger-name-row select { max-width: 64px; }
  .ledger-smart-action, .ledger-next-action { margin-left: auto; }
}

@media (min-width: 641px) and (max-width: 900px) {
  .archive-toggle { width: 100%; transform: none }
}
</style>
