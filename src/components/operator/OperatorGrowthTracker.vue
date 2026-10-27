<template>
  <section class="growth-tracker" :class="{ 'planner-expanded': plannerOpen }" aria-labelledby="growth-tracker-title">
    <header class="planner-heading">
      <div>
        <h2 id="growth-tracker-title">培养计划 · 体力规划</h2>
        <p>选好要培养的密探，按材料缺口安排每日体力。</p>
      </div>
      <div class="planner-heading-actions">
        <button v-if="canUseReserve && accountId && !reserveOpen" ref="reserveEntryRef" type="button" class="status-action secondary planner-reserve-entry" aria-controls="planner-reserve-workspace" @click="openReserveWorkspace">未来储备</button>
        <button class="planner-refresh" type="button" :disabled="loading || !accountId" title="刷新当前库存快照" @click="refreshSnapshot()">
          <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
          <span>{{ loading ? '同步中' : '刷新库存' }}</span>
        </button>
      </div>
    </header>

    <section v-if="canUseReserve && accountId" v-show="reserveOpen" id="planner-reserve-workspace" ref="reserveWorkspaceRef" class="planner-reserve-workspace" tabindex="-1" aria-label="未来储备工作区">
      <header class="reserve-workspace-heading">
        <div><h3>未来储备</h3><p>为尚未实装的密探，提前估算培养材料。</p></div>
        <button type="button" class="workspace-return" @click="closeReserveWorkspace"><ChevronLeft :size="16" aria-hidden="true" />返回培养清单</button>
      </header>
      <OperatorReserveWorkspace :account-id="accountId" :game="game" :stock="inventoryReady && !loading && !error ? currentItems : null" />
    </section>

    <div v-show="!reserveOpen">
    <div v-if="!isLoggedIn || !accountId" class="planner-state">
      <Info :size="18" aria-hidden="true" />
      <span>登录并选择子账号后，才能读取当前库存和培养目标。</span>
    </div>
    <div v-else-if="error && !fixedSchedule" class="planner-state is-error" role="alert">
      <CircleAlert :size="18" aria-hidden="true" />
      <span>{{ error }}</span>
      <button type="button" @click="refreshSnapshot()">重试</button>
    </div>
    <template v-else>
      <p v-if="error" class="planner-error" role="alert">库存同步失败：{{ error }}。已保存日程仍可查看。</p>
      <div v-if="planNotice" class="planner-notice" role="status">
        <Check :size="15" aria-hidden="true" />
        <span>{{ planNotice }}</span>
        <button v-if="undoWorkspace" type="button" @click="undoPlanChange">撤销</button>
      </div>
      <p v-if="planError" class="planner-error" role="alert">{{ planError }}</p>
      <p v-if="targetError" class="planner-error" role="alert">{{ targetError }}</p>
      <p v-else-if="targetNotice" class="planner-notice planner-inline-notice" role="status">{{ targetNotice }}</p>

      <section v-if="migration" class="cloud-migration" aria-label="本机计划导入">
        <h3>发现本机培养计划</h3>
        <p>{{ migration.existingCloud ? '云端已有计划，本机清单将作为独立计划新增，原有云端清单保持当前设置。' : '可将本机清单和日程导入当前子账号，之后在其他设备继续使用。' }}本机原始数据会保留。</p>
        <p v-if="migration.localError" role="alert">本机数据无法导入：{{ migration.localError }}</p>
        <ul v-if="migration.local"><li v-for="plan in migration.local.workspace.plans" :key="plan.id">{{ plan.name }} · {{ plan.operatorIds.length }} 位手动成员<span v-if="migration.local.schedules[plan.id]?.schedule"> · 固定日程始于 {{ migration.local.schedules[plan.id].schedule.startDate }}</span></li></ul>
        <template v-if="migration.request">
          <p>{{ migration.resume ? '上次导入尚未确认完成，重试会核对同一份导入回执。' : '确认后将一次性保存以下清单及关联日程：' }}</p>
          <ul><li v-for="plan in migration.request.workspace.plans" :key="plan.id">{{ plan.name }} · {{ plan.operator_ids.length }} 位手动成员<span v-if="migration.request.schedules[plan.id]"> · 含体力日程</span></li></ul>
        </template>
        <div class="cloud-actions"><button v-if="!migration.request && !migration.localError" type="button" :disabled="targetLoading || migrationBusy" @click="prepareMigration">预览导入结果</button><button v-else-if="migration.request" type="button" :disabled="migrationBusy" @click="importLocal">{{ migrationBusy ? '正在导入…' : migration.resume ? '重试本次导入' : '确认导入' }}</button><button v-if="migration.conflict" type="button" :disabled="migrationBusy" @click="compareMigrationAgain">重新比较本机与云端</button><button type="button" :disabled="migrationBusy" @click="keepCloud">使用云端，保留本机备份</button></div>
      </section>
      <fieldset class="planner-cloud-fields" :disabled="cloudBlocked" :aria-busy="cloudLoading || workspaceState.saving || scheduleLoading">
      <section class="planner-status" aria-label="培养计划状态">
        <div class="status-main">
          <div class="status-title">
            <span class="section-kicker">当前培养清单</span>
            <OperatorTrainingPlanPicker
              ref="trainingPlanPickerRef"
              :plans="workspace.plans"
              :active-plan="activePlan"
              :member-ids="activeMemberIds"
              :favorite-ids="favoriteIds"
              :catalog-entries="catalogEntries"
              :current-entries="currentEntries"
              :growth-states="growthStates"
              :account-id="accountId"
              :error="planError"
              :disabled="planPickerDisabled"
              @select="selectPlan"
              @save="savePlan"
              @remove="removePlan"
            >
              <template #actions>
                <div v-if="activePlan" class="status-actions">
                  <button type="button" class="status-action secondary" @click="toggleSettings"><SlidersHorizontal :size="15" aria-hidden="true" />规划设置</button>
                  <button type="button" class="status-action secondary" @click="openPlanner('display')"><CalendarDays :size="15" aria-hidden="true" />查看体力日程</button>
                </div>
              </template>
            </OperatorTrainingPlanPicker>
            <p class="planner-independent-note">各清单独立试算，未预留库存；材料备齐不等于已完成养成。</p>
          </div>
        </div>
        <div v-if="activePlan" class="status-metrics" role="group" aria-label="培养进度概览">
          <div class="status-metric status-metric-primary"><span>预计还需</span><strong :class="{ 'metric-state': loading || Boolean(error) || hasUnknownRequirements || scheduleDifferences.goalsChanged || scheduleTiming.remainingDays == null || scheduleTiming.remainingDays === 0 }">{{ plannerEtaLabel }}</strong><p class="metric-explanation">{{ plannerEtaExplanation }}</p></div>
          <div class="status-metric"><span>刷取材料备齐度</span><strong v-if="!materialProgressStatus">{{ plannerProgress }}<small>%</small></strong><strong v-else class="metric-state">{{ materialProgressStatus }}</strong></div>
          <div class="status-metric"><span>清单心纸库存</span><strong v-if="inventoryReady && !loading && !error">{{ formatNumber(totalHeartStock) }}<small> 张</small></strong><strong v-else class="metric-state">{{ loading ? '同步中' : '库存未同步' }}</strong></div>
          <div class="status-metric"><span>所选日体力结余</span><strong :class="{ negative: todayTotals.balance < 0 }">{{ signedNumber(todayTotals.balance) }}</strong></div>
        </div>
        <p v-if="loading" class="status-sync-note" role="status"><RefreshCw :size="13" class="spin" aria-hidden="true" />正在同步当前库存；已保存的日程会保留，存在差异时可选择更新。</p>
        <div v-if="activePlan" class="status-rule" aria-hidden="true"><span></span><i>养成清单</i><span></span></div>
        <p v-if="activePlan && quickUpgrade" class="roster-help">可直接修改培养目标；每项右侧图标用于快捷养成，先检查材料再确认提升。</p>
        <div v-if="activePlan" class="status-roster">
          <div class="growth-card-grid">
              <article v-for="row in orderedPlanRows" :key="row.id" class="growth-card" :class="['rarity-r' + (row.rarity || 3), { complete: row.completed }]">
                <div class="growth-card-head"><div class="growth-identity"><OperatorAvatar :avatar="row.avatar || ''" :name="row.name || row.id" :rarity="Number(row.rarity) || 3" /><div><h3>{{ row.name || row.id }}</h3><p class="growth-identity-meta"><span v-if="profList(row.prof).length" class="growth-prof-list"><span v-for="prof in profList(row.prof)" :key="prof" class="growth-prof"><img :src="profIcon(prof)" alt="" aria-hidden="true" /><span>{{ prof }}</span></span></span><span v-else class="growth-prof-fallback">未知属性</span><span class="growth-identity-separator" aria-hidden="true">·</span><span>{{ firstSubProf(row) || '未标注职业' }}</span></p></div></div><span class="growth-percent"><span class="growth-progress-status">{{ row.completed ? '已达目标' : '目标进度' }}</span>{{ rowProgress(row) }}<small>%</small></span></div>
                <p v-if="growthActionNotice(row)" class="growth-action-notice" role="status">{{ growthActionNotice(row) }}</p>
                <p v-if="row.calculation.sharedUnsupported" class="growth-action-notice">本体目录缺失，暂不估算共享养成需求</p>
                <p v-else-if="row.calculation.sharedGrowth" class="growth-action-notice">共享目标 {{ row.calculation.sharedTarget.level }} 级 / 修为 {{ row.calculation.sharedTarget.elite }}，按本体路径计入「{{ row.calculation.sharedCostOwner }}」一次</p>
                <div class="growth-progress-list">
                  <div class="growth-progress-row">
                    <div class="growth-progress-label"><span>等级</span><div class="progress-values"><span class="growth-progress-side-label">当前</span><b>Lv{{ row.level }}</b><span class="growth-value-divider" aria-hidden="true">/</span><span class="growth-progress-side-label">目标</span><input class="tracker-editable tracker-number-input" type="number" :min="row.level" max="100" step="1" :value="targetFor(row).level" :aria-label="row.name + '的目标等级'" title="点击修改目标等级" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'level', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'level', $event)" /><button v-if="quickUpgradeState(row, 'level', 5, '提升 5 级').visible" type="button" class="growth-quick-action" :class="quickUpgradeState(row, 'level', 5, '提升 5 级').className" :disabled="quickUpgradeState(row, 'level', 5, '提升 5 级').disabled" :aria-label="row.name + '快捷提升等级：' + quickUpgradeState(row, 'level', 5, '提升 5 级').label" :title="quickUpgradeState(row, 'level', 5, '提升 5 级').title" @click="requestQuickUpgrade(row, 'level', 5)"><ChevronUp v-if="quickUpgradeState(row, 'level', 5, '提升 5 级').icon === 'up'" :size="13" aria-hidden="true" /><CircleAlert v-else-if="quickUpgradeState(row, 'level', 5, '提升 5 级').icon === 'alert'" :size="13" aria-hidden="true" /><Check v-else :size="13" aria-hidden="true" /></button></div></div>
                    <div class="growth-track"><i :style="{ width: progress(row.level, targetFor(row).level) + '%' }"></i></div>
                    <OperatorGrowthActionPopover v-if="growthActionPopoverKey === row.id + ':level'" v-bind="growthActionPopoverProps(row, 'level', 5)" @retry="requestQuickUpgrade(row, 'level', 5)" @execute="executeGrowthAction(row, 'level')" @breakthrough-change="changeGrowthBreakthrough(row, $event)" />
                    <small>{{ experienceSummary(row.calculation.experienceGap) }}</small>
                    <details v-if="row.calculation.breakthroughMaterials.length" class="growth-materials growth-breakthrough-materials">
                      <summary>突破材料 <span>{{ row.calculation.breakthroughMaterials.length }} 项<ChevronDown :size="13" aria-hidden="true" /></span></summary>
                      <div class="growth-material-chips">
                        <div v-for="material in row.calculation.breakthroughMaterials" :key="material.id" class="growth-material-chip growth-breakthrough-chip">
                          <img class="growth-material-icon" :src="resourceIcon(material.id)" alt="" loading="lazy" />
                          <b>{{ itemName(material.id) }}</b>
                          <dl class="growth-breakthrough-counts">
                            <div><dt>需要</dt><dd>{{ formatNumber(material.required) }}</dd></div>
                            <div><dt>已有</dt><dd>{{ formatNumber(material.owned) }}</dd></div>
                            <div><dt>缺少</dt><dd>{{ formatNumber(material.gap) }}</dd></div>
                          </dl>
                        </div>
                      </div>
                      <p class="growth-material-note">已有为共用库存分配给该密探的数量。突破材料不计入体力排期。</p>
                    </details>
                  </div>
                  <div class="growth-progress-row">
                    <div class="growth-progress-label"><span>修为</span><div class="progress-values"><span class="growth-progress-side-label">当前</span><b>{{ row.elite }}</b><span class="growth-value-divider" aria-hidden="true">/</span><span class="growth-progress-side-label">目标</span><input class="tracker-editable tracker-number-input" type="number" :min="row.elite" :max="targetEliteMax(row)" step="1" :value="targetFor(row).elite" :aria-label="row.name + '的目标修为'" title="点击修改目标修为，上限随目标等级调整" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'elite', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'elite', $event)" /><button v-if="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).visible" type="button" class="growth-quick-action" :class="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).className" :disabled="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).disabled" :aria-label="row.name + '快捷提升修为：' + quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).label" :title="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).title" @click="requestQuickUpgrade(row, 'elite', 1)"><ChevronUp v-if="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).icon === 'up'" :size="13" aria-hidden="true" /><CircleAlert v-else-if="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).icon === 'alert'" :size="13" aria-hidden="true" /><Check v-else :size="13" aria-hidden="true" /></button></div></div>
                    <div class="growth-track mint"><i :style="{ width: progress(row.elite, targetFor(row).elite) + '%' }"></i></div>
                    <OperatorGrowthActionPopover v-if="growthActionPopoverKey === row.id + ':elite'" v-bind="growthActionPopoverProps(row, 'elite', 1)" @retry="requestQuickUpgrade(row, 'elite', 1)" @execute="executeGrowthAction(row, 'elite')" />
                    <small v-if="row.elite >= getMaxEliteForLevel(row.level) && row.elite < targetFor(row).elite" class="growth-limit-note">已达当前等级修为上限，先提升等级</small><small v-else>{{ materialSummary(row.calculation.xiuwei) || '无需补充修为材料' }}</small>
                  </div>
                  <div class="growth-progress-row">
                    <div class="growth-progress-label tracker-star-anchor" @keydown.esc.prevent.stop="closeStarTarget(true)"><span>化极</span><div class="progress-values"><span class="growth-progress-side-label">当前</span><b class="growth-current-star"><template v-for="(part, index) in currentStarLabel(row).split(' · ')" :key="index"><span v-if="index" aria-hidden="true"> · </span><span :class="{ 'growth-stage-unit': part.endsWith(' 星') || part.endsWith(' 节点') }">{{ part }}</span></template></b><span class="growth-value-divider" aria-hidden="true">/</span><span class="growth-progress-side-label">目标</span><input v-if="isMovieOperator(row)" class="tracker-editable tracker-number-input" type="number" :min="row.starLevel" max="5" step="1" :value="targetFor(row).starLevel" :aria-label="row.name + '的目标星级'" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @change="setTarget(row, 'starLevel', $event)" /><button v-else class="tracker-editable tracker-star-trigger" type="button" :aria-label="row.name + '的目标化极：' + targetStarLabel(row)" aria-haspopup="dialog" :aria-expanded="starTargetId === row.id" :aria-controls="starTargetId === row.id ? 'tracker-star-target-' + row.id : undefined" title="点击修改目标星级与节点" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @click="openStarTarget(row, $event)"><template v-for="(part, index) in targetStarLabel(row).split(' · ')" :key="index"><span v-if="index" aria-hidden="true"> · </span><span :class="{ 'growth-stage-unit': part.endsWith(' 星') || part.endsWith(' 节点') }">{{ part }}</span></template></button><button v-if="quickUpgradeState(row, 'star', 1, '提升至下一节点').visible" type="button" class="growth-quick-action" :class="quickUpgradeState(row, 'star', 1, '提升至下一节点').className" :disabled="quickUpgradeState(row, 'star', 1, '提升至下一节点').disabled" :aria-label="row.name + '快捷提升化极：' + quickUpgradeState(row, 'star', 1, '提升至下一节点').label" :title="quickUpgradeState(row, 'star', 1, '提升至下一节点').title" @click="requestQuickUpgrade(row, 'star', 1)"><ChevronUp v-if="quickUpgradeState(row, 'star', 1, '提升至下一节点').icon === 'up'" :size="13" aria-hidden="true" /><CircleAlert v-else-if="quickUpgradeState(row, 'star', 1, '提升至下一节点').icon === 'alert'" :size="13" aria-hidden="true" /><Check v-else :size="13" aria-hidden="true" /></button></div>
                      <div v-if="starTargetId === row.id" :id="'tracker-star-target-' + row.id" class="tracker-star-popover" role="dialog" :aria-label="row.name + '的目标化极'"><div class="tracker-popover-title"><Info :size="13" aria-hidden="true" />设置成长目标：星级、节点 → 觉醒</div><div class="tracker-star-controls"><select :value="starTargetGroup" aria-label="目标星级" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @change="setStarTargetGroup(row, $event)"><option v-if="starTargetDraft == null" value="-1" disabled>历史目标阶段待确认</option><option v-for="group in starGroupsFor(row)" :key="group" :value="group">{{ group === 0 ? '未拥有' : group === 'awakening' ? '五星后 · 觉醒' : group + ' 星' }}</option></select><select v-if="starTargetGroup > 0 && starTargetGroup < 5" v-model.number="starTargetDraft" aria-label="目标节点" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)"><option v-for="stage in starNodesFor(row, starTargetGroup)" :key="stage.value" :value="stage.value">节点 {{ (stage.value - 1) % 6 }}</option></select></div><p v-if="starTargetDraft === 'awakening'" class="setting-help">觉醒材料规则未知，暂不估算成本或完成日期；等级、修为及已知化极需求仍参与排期。</p><div class="tracker-popover-actions"><button type="button" class="cancel" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @click="closeStarTarget(true)">取消</button><button type="button" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @click="saveStarTarget(row)">{{ targetBusyIds.has(row.id) ? '保存中…' : '保存目标' }}</button></div></div>
                    </div>
                    <div class="growth-track rose"><i :style="{ width: growthHuajiProgress(row, targetFor(row)) + '%' }"></i></div>
                    <OperatorGrowthActionPopover v-if="growthActionPopoverKey === row.id + ':star'" v-bind="growthActionPopoverProps(row, 'star', 1)" @retry="requestQuickUpgrade(row, 'star', 1)" @execute="executeGrowthAction(row, 'star')" />
                    <small v-if="row.calculation.star.awakeningUnsupported" class="heart-progress-note">{{ operatorHuaji(row).stage === 25 ? '已到五星，觉醒待完成' : '目标包含觉醒' }} · 觉醒材料规则未知，暂不估算</small><small v-if="isMovieOperator(row)" class="heart-progress-note">电影星级材料暂不支持估算，不计入耗时</small><small v-else-if="row.calculation.star.unsupported && !row.calculation.heartRequired" class="heart-progress-note is-unknown">化极需求待确认，暂无法完整估算</small><small v-else class="heart-progress-note">{{ row.calculation.star.unsupported ? '已知化极心纸' : '心纸' }} {{ formatNumber(row.calculation.heartOwned) }} / {{ formatNumber(row.calculation.heartRequired) }} · <span class="heart-gap">缺 <span class="heart-gap-number">{{ formatNumber(row.calculation.heartGap) }}</span></span></small>
                  </div>
                </div>
                <slot name="remark" :row="row" />
                <div v-if="row.completed" v-show="!isRemarkEditing(row)" class="growth-materials growth-complete">
                  <button class="tracker-remove" type="button" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.size > 0" @click="removePlanMember(row)"><X :size="14" aria-hidden="true" />从清单中移除</button>
                </div>
                <details v-else class="growth-materials"><summary>查看材料缺口与预计耗时 <span>{{ rowGapCount(row) }} 项<ChevronDown :size="13" aria-hidden="true" /></span></summary><div v-if="row.calculation.star.unsupported || row.calculation.sharedUnsupported" class="materials-clear">部分材料规则未确认，以下仅列已知需求</div><div v-else-if="!row.calculation.gaps.length && !row.calculation.experienceGap && !row.calculation.heartGap" class="materials-clear">当前目标材料已备齐</div><div v-if="row.calculation.gaps.length || row.calculation.experienceGap || row.calculation.heartGap" class="growth-material-chips"><span v-for="gap in row.calculation.gaps" :key="gap.id" class="growth-material-chip"><img class="growth-material-icon" :src="resourceIcon(gap.id)" alt="" loading="lazy" /><b>{{ itemName(gap.id) }}</b><em>缺 {{ formatNumber(gap.gap) }}<small v-if="materialEtaLabel(row, gap)" class="growth-material-eta">{{ materialEtaLabel(row, gap) }}</small></em></span><span v-if="row.calculation.experienceGap" class="growth-material-chip experience-chip"><img class="growth-material-icon" :src="resourceIcon('bingshuquanjuan')" alt="" loading="lazy" /><b>经验</b><em>缺 {{ formatNumber(row.calculation.experienceGap) }}<small class="growth-material-eta">{{ experienceEtaLabel(row.calculation.experienceGap) }}</small></em></span><div v-if="row.calculation.heartGap" class="growth-material-chip heart-chip"><img class="growth-material-icon" :src="operatorIcon(row)" alt="" loading="lazy" /><b>心纸</b><em>缺 {{ formatNumber(row.calculation.heartGap) }}</em><span class="heart-history" role="img" :aria-label="heartHistorySummary(row)"><span class="heart-history-label" aria-hidden="true"><span>近 30 日获取</span><small v-if="heartHistoryError">暂不可用</small><small v-else-if="!heartHistoryReady">同步中…</small></span><span v-if="heartHistoryReady && !heartHistoryError && heartHasRecentAcquisition(row)" class="heart-history-bars" aria-hidden="true"><i v-for="point in heartSeries(row)" :key="point.date" class="heart-history-bar" :style="{ height: heartBarHeight(row, point) }"></i></span><span v-else-if="heartHistoryReady && !heartHistoryError" class="heart-history-empty" aria-hidden="true">暂无心纸获取记录</span></span></div></div><p class="growth-material-note">已扣除清单共用库存。单项耗时按只刷该项材料估算。</p></details>
              </article>
            </div>
        </div>
      </section>

      <div v-if="!activePlan" class="planner-state empty"><Plus :size="18" aria-hidden="true" /><span>还没有培养清单。点击上方「新建清单」，可根据特别关注建立，或自行挑选成员。</span></div>
      <div v-else-if="!planRows.length" class="planner-state empty"><Users :size="18" aria-hidden="true" /><span>当前清单还没有密探。点击上方「添加密探」，也可加入未特别关注的密探。</span></div>

      </fieldset>
      <section ref="plannerWorkspaceRef" tabindex="-1" class="planner-workspace" aria-label="体力规划工作区">
        <div v-if="planRows.length || fixedSchedule" class="planner-workspace-head">
          <div class="workspace-heading-content"><span class="section-kicker">每日刷取建议</span>
            <div class="workspace-title-row"><h2>体力日程</h2><div class="plan-heading-actions" role="group" aria-label="体力日程操作">
              <button v-if="viewMode === 'display' && !reviewingHistory" type="button" class="status-action secondary" :disabled="cloudBlocked" @click="openExactOptimizer">方案对比</button>
            </div></div>
            <p>此日程暂不支持交给 Maa 自动执行。</p>
          </div>
          <button v-if="viewMode === 'edit'" type="button" class="workspace-return" @click="openPlanner('display', true)"><ChevronLeft :size="16" aria-hidden="true" />返回日程</button>
        </div>

        <div class="workspace-feedback">
          <div class="cloud-status" role="status" aria-live="polite">
            {{ cloudStatusLabel }}
            <span v-if="fixedSchedule"> · 日界线北京时间 05:00</span>
          </div>
          <div v-if="cloudError" class="cloud-recovery" role="alert"><p>{{ cloudError }}</p><button v-if="!migration" type="button" @click="loadCloud">重新读取</button></div>
          <template v-for="kind in ['workspace', 'schedule']" :key="kind">
            <div v-if="(kind === 'workspace' ? workspaceState : scheduleState).error" :id="'planner-cloud-recovery-' + kind" class="cloud-recovery" role="alert" tabindex="-1">
              <p>{{ kind === 'workspace' ? '清单' : '日程' }}尚未确认保存：{{ (kind === 'workspace' ? workspaceState : scheduleState).error.message }}</p>
              <p v-if="(kind === 'workspace' ? workspaceState : scheduleState).latest">云端版本 {{ (kind === 'workspace' ? workspaceState : scheduleState).latest.revision }} · {{ (kind === 'workspace' ? workspaceState : scheduleState).latest.updatedAt }}</p>
              <div class="cloud-actions"><button type="button" :disabled="(kind === 'workspace' ? workspaceState : scheduleState).saving" @click="recover(kind)">重试保存</button><button type="button" @click="downloadPending(kind)">导出未保存内容</button><button type="button" :disabled="(kind === 'workspace' ? workspaceState : scheduleState).saving" @click="discardCloudChanges(kind); planError = ''">放弃本次修改并读取云端</button></div>
            </div>
          </template>
          <div v-if="planRows.length || fixedSchedule" class="schedule-guidance" :class="{ 'schedule-update': scheduleNeedsUpdate }" role="status">
            <template v-if="scheduleNeedsUpdate">
              <div>
                <strong>{{ scheduleDifferences.goalsChanged ? '清单或培养目标已变更，日程需要更新' : '库存有变化，可更新日程' }}</strong>
                <p>按当前库存和培养目标重新安排今天及之后的日程，保留过去的记录和未来的自定义安排。</p>
                <details v-if="scheduleDifferenceLabel" class="schedule-difference-details"><summary>查看库存差异</summary><p>{{ scheduleDifferenceLabel }}</p></details>
              </div>
              <button type="button" class="action-button" :disabled="cloudBlocked || schedulePending || loading || targetLoading || Boolean(error)" @click="updateSavedSchedule"><RefreshCw :size="14" aria-hidden="true" />更新日程</button>
            </template>
            <p v-else class="schedule-plan-note">
              <span>{{ plannerCycleNotice }}</span>
            </p>
          </div>
        </div>
        <fieldset v-if="planRows.length || fixedSchedule" class="planner-cloud-fields" :disabled="cloudBlocked" :aria-busy="cloudLoading || workspaceState.saving || scheduleLoading">
        <p v-if="currentDay.legacy" class="planner-footnote">此日来自旧版手工日程，未记录历史库存，仅保留原安排。</p>
        <p v-if="reviewingHistory" class="planner-footnote">正在回顾已过日期的已保存安排与预测产出；「已过」不代表实际执行完成。</p>
        <p v-if="outsideManualDates.length" class="planner-footnote">周期外固定日仍保留，可查看或恢复推荐：<span v-for="date in outsideManualDates" :key="date" class="outside-manual-date"><time :datetime="date">{{ formatLongDate(date) }}</time><button type="button" class="workspace-link" :aria-label="'查看 ' + formatLongDate(date) + ' 日程'" :title="'查看 ' + formatLongDate(date) + ' 日程'" @click="selectDate(date); viewMode = 'edit'; setPlannerStep('daily', false)"><CalendarDays :size="18" aria-hidden="true" /></button></span></p>
        <p v-if="currentDay.errors?.length" class="balance-warning" role="alert">{{ currentDay.errors.join('；') }}。当日与后续推进暂停，修正后重算。</p>
        <p v-else-if="currentDay.paused" class="balance-warning" role="status">前面的日期有无效日程，修正后继续推进。</p>
        <p v-if="currentDay.warnings?.length" class="planner-footnote">{{ currentDay.warnings.join('；') }}</p>
        <section v-if="viewMode === 'display' || reviewingHistory" class="planner-view planner-display" aria-label="体力规划展示">
          <PlannerDateTabs :dates="plannerDates" :selected="selectedDate" :manual-plans="manualPlans" :preview-dates="derivedPreviewDates" :today="plannerToday" :fixed="Boolean(fixedSchedule)" :past-count="pastScheduleCount" :hide-past="hidePastSchedule" :reset-disabled="scheduleActionBlocked" @reset="openScheduleAction('reset')" @toggle-history="openScheduleAction('history')" @select="selectDate" />
          <PlannerRecalculateNotice v-if="pendingRecalculation" :date-label="currentDateLabel" :busy="schedulePending" :disabled="cloudBlocked || loading || targetLoading || Boolean(error) || scheduleDifferences.goalsChanged || currentDay.paused" @recalculate="recalculateFromCurrentDay" />

          <div class="display-grid">
            <section ref="dayPlanRef" class="planner-card day-plan" tabindex="-1" aria-label="当日安排">
              <div class="card-heading">
                <div><span class="card-kicker">{{ currentDateLabel }} · 模拟计划</span><h3>当日方案</h3></div>
                <div class="day-plan-actions"><span class="plan-badge" :class="{ manual: currentDay.manual, exact: deadlineAlternativePlanAdopted }">{{ planBadgeLabel }}</span><button v-if="!reviewingHistory" ref="dayEditRef" type="button" class="status-action secondary" :disabled="scheduleActionBlocked" @click="editSchedule('daily')"><Pencil :size="15" aria-hidden="true" />编辑当日</button></div>
              </div>
              <dl class="day-totals" aria-label="当日体力与白金币概览">
                <div class="gain"><dt>体力获取</dt><dd>{{ formatStamina(todayTotals.gains) }}</dd></div>
                <div class="spend"><dt>体力支出</dt><dd>{{ formatStamina(todayTotals.spends) }}</dd></div>
                <div class="day-balance" :class="{ negative: todayTotals.balance < 0 }"><dt>当日结余</dt><dd>{{ signedNumber(todayTotals.balance) }}</dd></div>
                <div class="coin-spend"><dt>白金币支出</dt><dd>{{ formatNumber(todayTotals.coinsSpent) }}</dd></div>
              </dl>
              <p v-if="todayTotals.balance < 0" class="balance-warning" role="alert"><CircleAlert :size="15" aria-hidden="true" />当日计划超出可用体力 {{ formatStamina(Math.abs(todayTotals.balance)) }}，请增加来源或减少支出。</p>
              <div class="flow-section spend-flow">
                <div class="flow-heading"><span>刷取与派遣</span></div>
                <div class="channel-chips spend-chips">
                  <span v-for="spend in currentDay.planned.spends" :key="spend.id" class="channel-chip" :class="spend.colorKey" :style="channelStyle(spend.colorKey)">
                    <span class="channel-dot" aria-hidden="true"></span>
                    <span class="spend-main"><span class="spend-name"><b>{{ spendChannelName(spend) }}</b><span v-if="spendStageName(spend)" class="spend-stage">{{ spendStageName(spend) }}</span></span><small class="spend-count">×{{ formatStamina(spend.value) }}</small></span>
                    <strong>−{{ formatStamina(spend.value * spend.costPer) }}</strong>
                  </span>
                  <span v-if="!currentDay.planned.spends.length" class="flow-empty">暂无体力支出</span>
                </div>
              </div>
              <div class="flow-section gain-flow">
                <div class="flow-heading"><span>体力来源</span></div>
                <div v-if="actionDayGains.length" class="channel-chips action-gains">
                  <span v-for="gain in actionDayGains" :key="gain.id" class="channel-chip" :class="gain.colorKey" :style="channelStyle(gain.colorKey)">
                    <span class="channel-dot" aria-hidden="true"></span><span>{{ gain.label }}</span>
                    <small v-if="gain.kind === 'count'">×{{ formatStamina(gain.value) }}</small><strong>+{{ formatStamina(energyFromGain(gain)) }}</strong>
                  </span>
                </div>
                <button v-if="routineDayGains.length" class="routine-gains-toggle" type="button" :aria-expanded="routineGainsOpen" aria-controls="planner-routine-gains" @click="routineGainsOpen = !routineGainsOpen">
                  <span>固定来源 · {{ routineDayGains.length }} 项</span><strong>+{{ formatStamina(routineDayGains.reduce((total, gain) => total + energyFromGain(gain), 0)) }}</strong>
                  <ChevronDown :size="16" :class="{ expanded: routineGainsOpen }" aria-hidden="true" />
                </button>
                <div v-if="routineDayGains.length" id="planner-routine-gains" class="channel-chips routine-gains" :class="{ expanded: routineGainsOpen }">
                  <span v-for="gain in routineDayGains" :key="gain.id" class="channel-chip" :class="gain.colorKey" :style="channelStyle(gain.colorKey)">
                    <span class="channel-dot" aria-hidden="true"></span><span>{{ gain.label }}</span><strong>+{{ formatStamina(energyFromGain(gain)) }}</strong>
                  </span>
                </div>
                <span v-if="!currentDay.planned.gains.length" class="flow-empty">暂无体力来源</span>
              </div>
            </section>
            <CultivationProgress :rows="progressItems" :date-label="currentDateLabel" />
          </div>
          <p class="planner-footnote">{{ deadlineAlternativePlanAdopted ? '已采用期限补足方案，请按每日安排准备体力，并核对购买与派遣。' : currentDay.manual ? '当前为手工计划；调整体力收支后，可重新计算当日及后续日程。' : '按当前偏好推荐；编辑任意一天后，整份日程会固定保存。' }} {{ aggregateMoneyLabel }}。</p>
          <p class="planner-footnote">培养进度从计划保存的起点模拟，不代表实际流水。按完整一天自然恢复与进膳预算计算，不计满体损失；日末结余不自动结转，可手工添加储备来源。</p>
        </section>

        <section v-else class="planner-view planner-edit" aria-label="体力规划编辑">
          <nav ref="plannerStepsRef" class="planner-steps" aria-label="日程编辑步骤">
            <ol>
              <li v-for="(step, index) in plannerSteps" :key="step.id">
                <button type="button" :aria-current="plannerStep === step.id ? 'step' : undefined" :aria-controls="'planner-step-' + step.id" @click="setPlannerStep(step.id)">
                  <span class="step-number" aria-hidden="true">{{ index + 1 }}</span><span>{{ step.label }}</span>
                </button>
              </li>
            </ol>
          </nav>
          <div class="edit-grid" :class="{ 'has-roster': plannerStep === 'conditions' }">
            <aside v-show="plannerStep === 'conditions'" class="planner-sidebar panel" :class="{ 'roster-expanded': mobileRosterOpen }">
              <button class="roster-toggle" type="button" :aria-expanded="mobileRosterOpen" aria-controls="planner-roster-content" @click="mobileRosterOpen = !mobileRosterOpen">
                <span class="roster-toggle-label">培养清单 <small>{{ orderedPlanRows.length }} 位</small></span>
                <span class="roster-toggle-action">{{ mobileRosterOpen ? '收起' : '管理' }}<ChevronDown :size="16" aria-hidden="true" /></span>
              </button>
              <div class="roster-preview" role="list" aria-label="清单成员">
                <span v-for="row in orderedPlanRows" :key="row.id" role="listitem" :aria-label="row.name || row.id" :title="row.name || row.id"><OperatorAvatar :avatar="row.avatar || ''" :name="row.name || row.id" :rarity="Number(row.rarity) || 3" aria-hidden="true" /></span>
              </div>
              <section id="planner-roster-content" class="side-section">
                <div class="side-title"><span>培养清单</span><span class="side-hint">当前 → 目标</span></div>
                <div ref="rosterList" class="edit-roster">
                  <div v-for="(row, rowIndex) in orderedPlanRows" :key="row.id" :data-roster-id="row.id" class="edit-roster-item">
                    <div class="drag-handle" aria-hidden="true">⋮⋮</div>
                    <OperatorAvatar :avatar="row.avatar || ''" :name="row.name || row.id" :rarity="Number(row.rarity) || 3" />
                    <div class="edit-roster-name"><b>{{ row.name || row.id }}</b></div>
                    <div class="roster-move-actions" role="group" :aria-label="row.name + '排序'">
                      <button type="button" :disabled="cloudBlocked || schedulePending || rowIndex === 0" :aria-label="'上移' + row.name" title="上移" @click="moveRosterMember(row.id, -1)"><ChevronUp :size="16" aria-hidden="true" /></button>
                      <button type="button" :disabled="cloudBlocked || schedulePending || rowIndex === orderedPlanRows.length - 1" :aria-label="'下移' + row.name" title="下移" @click="moveRosterMember(row.id, 1)"><ChevronDown :size="16" aria-hidden="true" /></button>
                    </div>
                    <button type="button" class="roster-remove" :aria-label="'将 ' + (row.name || row.id) + ' 移出培养清单'" @click="removePlanMember(row)"><X :size="15" aria-hidden="true" /></button>
                    <div class="target-fields">
                      <label><span class="target-field-label">等级 <small>{{ row.level }} →</small></span><span class="progress-values"><input class="tracker-editable tracker-number-input" type="number" :min="row.level" max="100" step="1" :value="targetFor(row).level" :aria-label="row.name + '目标等级'" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @change="setTarget(row, 'level', $event)" /></span></label>
                      <label><span class="target-field-label">修为 <small>{{ row.elite }} →</small></span><span class="progress-values"><input class="tracker-editable tracker-number-input" type="number" :min="row.elite" :max="targetEliteMax(row)" step="1" :value="targetFor(row).elite" :aria-label="row.name + '目标修为'" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @change="setTarget(row, 'elite', $event)" /></span></label>
                      <label class="target-star"><span class="target-field-label">化极 <small>{{ starLabel(row.starLevel, row) }} →</small></span><span class="progress-values"><PlannerSelect class="target-star-select" compact :model-value="targetFor(row).starLevel" :options="starStagesFor(row)" :label="row.name + '目标化极'" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @update:model-value="setTarget(row, 'starLevel', $event)" /></span></label>
                    </div>
                  </div>
                </div>
                <button type="button" class="roster-add" aria-haspopup="dialog" :disabled="!activePlan || planPickerDisabled" @click="trainingPlanPickerRef?.openMemberPicker()"><Plus :size="18" aria-hidden="true" />新增密探</button>
              </section>
            </aside>
            <div class="editor-main">
              <section v-show="plannerStep === 'conditions'" id="planner-step-conditions" ref="plannerConditionsRef" class="planning-panel conditions-workspace" tabindex="-1" aria-label="规划条件">
                <header class="planning-panel-heading"><div><h3>规划条件</h3><p>选好培养方式，沿用日常设置，即可开始规划。</p></div><span class="conditions-account">当前子账号</span></header>
  <div class="planning-mode" role="group" aria-label="规划模式"><button type="button" :class="{ active: !goalMode }" :aria-pressed="!goalMode" @click="goalMode = false"><CalendarDays :size="17" aria-hidden="true" />常规日程规划</button><button type="button" class="goal-mode" :class="{ active: goalMode }" :aria-pressed="goalMode" @click="goalMode = true"><Target :size="17" aria-hidden="true" />按目标天数规划</button></div>
<section id="planning-conditions" class="conditions-content">
  <section class="condition-module strategy-conditions" aria-labelledby="core-conditions-title">
    <header class="condition-module-heading"><h3 id="core-conditions-title">{{ goalMode ? '你想多久养成？' : '你想怎么养？' }}</h3><p>{{ goalMode ? '设定期限，比较完成清单所需的白金币。' : '选择培养策略，决定材料备齐的先后。' }}</p></header>
    <div v-if="!goalMode" class="strategy-cards" role="group" aria-label="培养策略">
      <button type="button" :class="{ active: strategy === 'overall' }" :aria-pressed="strategy === 'overall'" :disabled="scheduleActionBlocked" @click="setStrategy('overall')"><Users :size="28" aria-hidden="true" /><span><b>整体完成</b><small>以整个清单尽早备齐材料为目标</small></span><Check v-if="strategy === 'overall'" :size="18" aria-hidden="true" /></button>
      <button type="button" :class="{ active: strategy === 'priority' }" :aria-pressed="strategy === 'priority'" :disabled="scheduleActionBlocked" @click="setStrategy('priority')"><ListOrdered :size="28" aria-hidden="true" /><span><b>优先完成密探</b><small>按清单顺序优先备齐各密探材料</small></span><Check v-if="strategy === 'priority'" :size="18" aria-hidden="true" /></button>
    </div>
<div v-if="goalMode" class="goal-conditions">
  <div class="settings-block-head"><h3>目标天数</h3><span>独立试算</span></div>
  <div class="goal-days-field"><label for="goal-days">从今天起的目标天数</label><div ref="goalDatePickerWrap" class="goal-days-input-wrap" @keydown.esc.prevent.stop="closeGoalDatePicker()"><input id="goal-days" type="number" min="1" max="90" step="1" v-model.number.lazy="goalDays" /><button ref="goalDateTrigger" type="button" class="goal-date-trigger" aria-label="选择养成截止日期" :aria-expanded="goalDatePickerOpen" aria-controls="goal-date-picker" @click="toggleGoalDatePicker"><CalendarDays :size="17" aria-hidden="true" /></button><div v-if="goalDatePickerOpen" id="goal-date-picker" ref="goalDatePickerRef" class="goal-date-popover" role="dialog" aria-labelledby="goal-date-picker-title" aria-describedby="goal-date-picker-description">
    <header class="goal-calendar-context"><h4 id="goal-date-picker-title">选择养成截止日期</h4><p id="goal-date-picker-description">希望最晚在这一天完成当前清单的养成。</p></header>
    <div class="goal-calendar-heading"><button type="button" aria-label="上个月" :disabled="!goalDatePickerCanPrevious" @click="changeGoalDatePickerMonth(-1)"><ChevronLeft :size="18" aria-hidden="true" /></button><strong aria-live="polite">{{ goalDatePickerYear }} 年 {{ goalDatePickerMonth + 1 }} 月</strong><button type="button" aria-label="下个月" :disabled="!goalDatePickerCanNext" @click="changeGoalDatePickerMonth(1)"><ChevronRight :size="18" aria-hidden="true" /></button></div>
    <div class="goal-calendar-week" aria-hidden="true"><span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span></div>
    <div class="goal-calendar-days"><span v-for="blank in goalDatePickerOffset" :key="`goal-blank-${blank}`" /><button v-for="day in goalDatePickerDays" :key="day" :data-goal-day="day" :tabindex="day === goalDatePickerFocusedDay ? 0 : -1" :class="{ selected: goalDatePickerKey(day) === goalCompletionDate, today: goalDatePickerKey(day) === plannerToday }" :disabled="!isGoalDateSelectable(day)" :aria-label="`${goalDatePickerYear} 年 ${goalDatePickerMonth + 1} 月 ${day} 日`" :aria-pressed="goalDatePickerKey(day) === goalCompletionDate" :aria-current="goalDatePickerKey(day) === plannerToday ? 'date' : undefined" @keydown="moveGoalDatePickerDay($event, day)" @click="selectGoalDatePickerDay(day)">{{ day }}</button></div>
    <button type="button" class="goal-today-button" @click="selectGoalDatePickerToday">回到今天</button>
  </div></div></div>
  <p class="goal-completion-date">截止日期：<time :datetime="goalCompletionDate">{{ formatLongDate(goalCompletionDate) }}</time></p>
  <p class="goal-date-help">日期按“含今天”换算，最多支持 90 天。试算计入持续每日安排，不套用逐日手工修改。</p>
  <div class="goal-shortcuts"><button v-for="days in [7, 10, 14, 21]" :key="days" type="button" :class="{ active: Number(goalDays) === days }" @click="goalDays = days">{{ days }} 天</button></div>
</div>
    <details v-if="goalMode" class="reserve-details" @invalid.capture="$event.currentTarget.open = true"><summary>体力储备 <span>额外体力 {{ goalInitialExtra }} · 待领取 {{ goalReserveSources.length }} 笔</span></summary>
<section class="reserve-management" aria-labelledby="reserve-management-title">
  <div class="reserve-management-heading"><div><h3 id="reserve-management-title">体力储备</h3><p>已到账体力用于第一天；未领取储备会安排到需要的日期，每笔一次领完。</p></div><span class="reserve-total">待领取 {{ goalReserveSources.length }} 笔 · {{ goalReserveSources.reduce((sum, source) => sum + Math.max(0, Number(source.amount) || 0), 0) }} 体力</span></div>
  <div class="reserve-management-body">
    <div class="reserve-initial"><label for="goal-initial-extra">起始日额外体力</label><div class="reserve-amount"><input id="goal-initial-extra" type="number" min="0" max="99999" step="1" v-model.number.lazy="goalInitialExtra" /><span>体力</span></div><p>已经到账，仅第一天可用，不跨日结转。</p></div>
    <div class="reserve-packs"><div class="reserve-packs-heading"><h4>待领取储备</h4><button type="button" class="workspace-link" aria-label="添加储备" title="添加储备" @click="addGoalReserve"><Plus :size="18" aria-hidden="true" /></button></div>
      <p v-if="!goalReserveSources.length" class="reserve-empty">可添加礼包、邮件或道具，每条代表一次可独立领取的整笔体力。</p>
      <div class="reserve-pack-list"><div v-for="(source, index) in goalReserveSources" :key="source.id" class="reserve-pack-row">
        <input v-model.lazy="source.name" maxlength="32" class="reserve-pack-name" :aria-label="'第 ' + (index + 1) + ' 条储备名称'" />
        <div class="reserve-amount"><input type="number" min="1" max="99999" step="1" v-model.number.lazy="source.amount" :aria-label="'第 ' + (index + 1) + ' 条储备体力数量'" /><span>体力</span></div>
        <button type="button" class="workspace-link reserve-remove" :aria-label="'删除第 ' + (index + 1) + ' 条储备'" :title="'删除第 ' + (index + 1) + ' 条储备'" @click="goalReserveSources.splice(index, 1)"><X :size="18" aria-hidden="true" /></button>
      </div></div>
    </div>
  </div>
</section>
    </details>
  </section>
  <PlannerRoutineSettings :preferences="plannerPreferences" :levels="workspace.trainingLevels" :account-id="accountId" :plan-id="workspace.activePlanId" :revision="workspace.revision" :disabled="scheduleActionBlocked" @save-preferences="saveRoutinePreferences" @save-levels="saveTrainingLevels" />
  <div v-if="customRuleEntries.length" class="custom-rule-list"><span>持续每日安排</span><button v-for="item in customRuleEntries" :key="item.id" type="button" class="workspace-link" :disabled="scheduleActionBlocked || goalMode" @click="customDailyRef?.open(item)">{{ item.label }} · {{ item.dailyStatus }} · 管理每日安排</button></div>
  <PlannerDailySources ref="dailySourcesRef" :sources="workspace.staminaSources" :account-id="accountId" :plan-id="workspace.activePlanId" :revision="workspace.revision" :game="game" :today="plannerToday" :selected-date="selectedDate" :gains="currentDay?.planned.gains || []" :disabled="scheduleActionBlocked" :allow-application="!goalMode" :preview="visibleDailySourcePreview" @save="saveDailySources" @preview="previewDailySources" @apply="applyDailySources" @clear-preview="dailySourcePreview = null" />
</section>
                <footer class="planner-step-actions">
                  <button type="button" class="workspace-link" aria-label="直接编辑每日" title="直接编辑每日" @click="setPlannerStep('daily')"><Pencil :size="18" aria-hidden="true" />直接编辑每日</button>
                  <button type="button" class="action-button primary" @click="setPlannerStep('comparison')">下一步：方案对比<ChevronRight :size="16" aria-hidden="true" /></button>
                </footer>
              </section>
              <section v-show="plannerStep === 'comparison'" id="planner-step-comparison" ref="plannerComparisonRef" class="planning-panel planner-comparison-step" tabindex="-1" aria-label="方案对比">
                <div class="planning-condition-summary"><p>{{ plannerConditionSummary }}</p><button type="button" class="workspace-link" aria-label="修改条件" title="修改条件" @click="setPlannerStep('conditions')"><SlidersHorizontal :size="18" aria-hidden="true" /></button></div>
          <PlannerExactOptimizer embedded date-selection-hint="可在「编辑每日」步骤切换对比起点。" :input="exactPlannerInput" :agent-names="exactAgentNames" :date-label="goalMode ? formatLongDate(plannerToday) : currentDateLabel" :disabled="cloudBlocked || schedulePending || loading || targetLoading || Boolean(error) || (!goalMode && (currentDay.paused || scheduleDifferences.goalsChanged))" @apply="adoptExactPlan" @apply-alternative="adoptDeadlineAlternative" />
                <footer class="planner-step-actions">
                  <p>采用方案后进入每日编辑，也可继续调整当前日程。</p>
                  <button type="button" class="workspace-link" aria-label="上一步：规划条件" title="上一步：规划条件" @click="setPlannerStep('conditions')"><ChevronLeft :size="18" aria-hidden="true" /></button>
                  <button type="button" class="action-button primary" @click="setPlannerStep('daily')">编辑当前日程<ChevronRight :size="16" aria-hidden="true" /></button>
                </footer>
              </section>
              <section v-show="plannerStep === 'daily'" id="planner-step-daily" ref="plannerDailyRef" class="planner-daily-step" tabindex="-1" aria-label="编辑每日">
<PlannerDateTabs :dates="plannerDates" :selected="selectedDate" :manual-plans="manualPlans" :preview-dates="derivedPreviewDates" :today="plannerToday" :fixed="Boolean(fixedSchedule)" :past-count="pastScheduleCount" :hide-past="hidePastSchedule" :reset-disabled="scheduleActionBlocked" @reset="openScheduleAction('reset')" @toggle-history="openScheduleAction('history')" @select="selectDate" />
          <PlannerRecalculateNotice v-if="pendingRecalculation" :date-label="currentDateLabel" :busy="schedulePending" :disabled="cloudBlocked || loading || targetLoading || Boolean(error) || scheduleDifferences.goalsChanged || currentDay.paused" @recalculate="recalculateFromCurrentDay" />

          <div class="edit-simulation"><div class="ledger-grid"><section class="planner-card ledger-card"><div class="ledger-heading"><h3>体力获取</h3><span title="按当前套用的基础方案">推荐 {{ formatStamina(recommendedTotals.gains) }}</span></div><p class="ledger-scope-note">直接修改数量只影响当天；每天都领的月卡体力请使用「设置每日月卡」。</p><template v-for="(gain, index) in currentDay.planned.gains" :key="gain.id">
  <PlannerCustomEntry v-if="gain.custom" :entry="gain" kind="gain" :index="index" :total="energyFromGain(gain)" :disabled="cloudBlocked || loading || targetLoading || Boolean(error) || reviewingHistory"
    @change-name="updateCustomName('gains', index, $event)" @change-value="updatePlanValue('gains', index, $event)" @remove="removePlanRow('gains', index)" />
  <div v-else class="ledger-row">
    <div class="ledger-label-wrap"><span class="channel-label" :class="gain.colorKey" :style="channelStyle(gain.colorKey)"><i></i>{{ gain.label }}</span><button v-if="['monthly-card-daily', 'monthly-card-shop'].includes(gain.id)" type="button" class="workspace-link" :disabled="scheduleActionBlocked || reviewingHistory" @click="dailySourcesRef?.openMonthly()">设置每日月卡</button></div>
    <div class="ledger-input-wrap"><label :for="'gain-value-' + index">数量</label><input :id="'gain-value-' + index" type="number" min="0" step="1" :value="gain.value" :aria-label="gain.label + '数量'" @change="updatePlanValue('gains', index, $event)" /><span>{{ gain.kind === 'count' ? '次' : '体力' }}</span></div>
    <span class="recommendation" :class="{ 'matches-plan': gain.value === recommendedValue('gains', gain) }">推荐 {{ recommendedValue('gains', gain) }}</span>
    <button type="button" class="row-remove" :aria-label="'移除 ' + gain.label" @click="removePlanRow('gains', index)"><X :size="14" aria-hidden="true" /></button>
  </div>
</template><div class="add-wrap"><button type="button" class="add-button" :aria-expanded="addMenu === 'gain'" @click="toggleAddMenu('gain')"><Plus :size="14" aria-hidden="true" />添加获取</button><div v-if="addMenu === 'gain'" class="add-menu" role="menu"><button v-for="channel in GAIN_CHANNELS" :key="channel.id" type="button" role="menuitem" @click="addGain(channel.id)"><span class="channel-label" :class="channel.colorKey" :style="channelStyle(channel.colorKey)"><i></i>{{ channel.label }}</span></button></div></div><div class="ledger-total gain-total"><span>当日获取</span><b>{{ formatStamina(todayTotals.gains) }}</b></div></section><section class="planner-card ledger-card"><div class="ledger-heading"><h3>体力支出</h3><span title="按当前套用的基础方案">推荐 {{ formatStamina(recommendedTotals.spends) }}</span></div><template v-for="(spend, index) in currentDay.planned.spends" :key="spend.id">
  <PlannerCustomEntry v-if="spend.custom" :class="{ 'spend-added': highlightedSpendId === spend.id }" :entry="spend" kind="spend" :index="index" :total="spend.value * spend.costPer" :resources="yieldResourceOptions" :resource-name="resourceName" :disabled="cloudBlocked || schedulePending || loading || targetLoading || Boolean(error) || reviewingHistory"
    @change-name="updateCustomName('spends', index, $event)" @change-value="updatePlanValue('spends', index, $event)" @change-cost="updateSpendCost(index, $event)"
    @change-yield="(id, event) => updateSpendYield(index, id, event)" @add-yield="addSpendYield(index, $event)" @remove-yield="removeSpendYield(index, $event)" @remove="removePlanRow('spends', index)">
    <button type="button" class="workspace-link" :disabled="templatesBlocked || reviewingHistory" @click="pinCustomSpend(spend)">固定到支出列表</button>
    <button type="button" class="workspace-link" :disabled="scheduleActionBlocked || reviewingHistory || goalMode" @click="customDailyRef?.open(spend)">设为持续每日安排</button>
    <PlannerRepeatedSpend :entry="spend" :date="selectedDate" :today="plannerToday" :last-date="repeatLastDate" :account-id="accountId" :plan-id="workspace.activePlanId" :schedule="fixedSchedule" :resource-name="resourceName" :disabled="scheduleActionBlocked || reviewingHistory || goalMode || scheduleDifferences.goalsChanged" :blocked-reason="reviewingHistory ? '已过日期不能修改' : goalMode ? '请先切换至常规日程规划' : scheduleDifferences.goalsChanged ? '请先更新当前日程' : ''" @apply="(request, context, done) => applyRepeatedSpend(request, context, done, spend)" />
  </PlannerCustomEntry>
  <div v-else class="ledger-row spend-ledger-row" :class="{ 'spend-added': highlightedSpendId === spend.id }">
    <div class="ledger-label-wrap"><span class="channel-label" :class="spend.colorKey" :style="channelStyle(spend.colorKey)"><i></i><span class="spend-name"><b>{{ spendChannelName(spend) }}</b><span v-if="spendStageName(spend)" class="spend-stage">{{ spendStageName(spend) }}</span></span></span><PlannerRepeatedSpend v-if="spend.kind === 'stage624'" :entry="spend" :date="selectedDate" :today="plannerToday" :last-date="repeatLastDate" :account-id="accountId" :plan-id="workspace.activePlanId" :schedule="fixedSchedule" :disabled="scheduleActionBlocked || reviewingHistory || goalMode || scheduleDifferences.goalsChanged" @apply="applyRepeatedSpend" @release="releaseFixedSpend(index)" /></div>
    <div class="ledger-input-wrap"><label :for="'spend-value-' + index">次数</label><input :id="'spend-value-' + index" type="number" min="0" step="1" :value="spend.value" :aria-label="spend.label + '次数'" :disabled="schedulePending" @change="updatePlanValue('spends', index, $event)" /><span>次</span></div>
    <span class="recommendation" :class="{ 'matches-plan': spend.value === recommendedValue('spends', spend) }">推荐 {{ recommendedValue('spends', spend) }}</span>
    <button type="button" class="row-remove" :aria-label="'移除 ' + spend.label" :disabled="schedulePending" @click="removePlanRow('spends', index)"><X :size="14" aria-hidden="true" /></button>
  </div>
</template>
<div class="spend-add-area" @keydown.esc.prevent.stop="closeSpendMenu">
  <p v-for="item in dayRuleOverrides" :key="item.id" class="ledger-scope-note">{{ currentDay.planned.spends.some(spend => spend.id === item.id) ? '当天已单独修改：' : '当天已跳过：' }}{{ item.label }} <button type="button" class="workspace-link" :disabled="scheduleActionBlocked || reviewingHistory" @click="restoreDailyRule(item.id)">恢复每日安排</button></p>
  <button ref="spendAddRef" type="button" class="add-button" aria-controls="planner-spend-menu" :aria-expanded="addMenu === 'spend'" @click="toggleAddMenu('spend')"><Plus :size="14" aria-hidden="true" />{{ addMenu === 'spend' ? '收起添加支出' : '添加支出' }}</button>
  <section v-if="addMenu === 'spend'" id="planner-spend-menu" ref="spendPanelRef" class="spend-add-panel" aria-labelledby="spend-panel-title" :aria-busy="schedulePending">
    <div class="spend-panel-heading">
      <button v-if="pendingSpendChannel" type="button" class="spend-back" :disabled="schedulePending" @click="backToSpendChannels"><ChevronLeft :size="16" aria-hidden="true" />返回渠道</button>
      <h4 id="spend-panel-title">{{ pendingTrainingGroup ? pendingTrainingGroup.name + '历练 · 选择层数' : spendDraft ? '自定义支出' : '选择支出项目' }}</h4>
      <button type="button" class="workspace-link" :disabled="templatesLoading || !templateOwner" @click="templateManagerRef?.open()">管理常用支出</button>
      <button type="button" class="row-remove" aria-label="收起添加支出" @click="closeSpendMenu"><ChevronUp :size="16" aria-hidden="true" /></button>
    </div>
    <template v-if="pendingTrainingGroup">
      <div v-if="addTrainingStages.length" class="spend-stage-grid" role="group" :aria-label="pendingTrainingGroup.name + '历练层数'">
        <button v-for="stage in addTrainingStages" :key="stage.level" type="button" :aria-pressed="selectedSpendStage === stage.level" :disabled="schedulePending" @click="selectedSpendStage = stage.level">{{ stage.name.replace(/第\s*(\d+)\s*层/, '$1 层') }}</button>
      </div>
      <p v-else class="spend-inline-error" role="alert">当前没有可选择的层数，请先在「规划条件」核实目前能刷的关卡。</p>
      <div class="spend-panel-actions"><span v-if="selectedTrainingSpend">预计消耗 <b>{{ formatStamina(selectedTrainingSpend.costPer) }}</b> 体力 / 次</span><span v-else>请选择层数后添加</span><button type="button" class="action-button primary" :disabled="schedulePending || !selectedTrainingSpend" @click="addTrainingSpend(selectedSpendStage)">添加到支出</button></div>
    </template>
    <form v-else-if="spendDraft" class="spend-draft-form" aria-label="添加自定义支出" :aria-describedby="spendAddError ? 'planner-spend-add-error' : undefined" @submit.prevent="addCustomSpend">
      <PlannerCustomEntry :entry="spendDraft" kind="spend" :index="currentDay.planned.spends.length" :total="spendDraft.value * spendDraft.costPer" :resources="yieldResourceOptions" :resource-name="resourceName" :disabled="schedulePending" draft
        @change-name="spendDraft.name = spendDraft.label = $event.target.value"
        @change-value="spendDraft.value = draftNumber($event)" @change-cost="spendDraft.costPer = draftNumber($event)"
        @change-yield="(id, event) => spendDraft.yield[id] = draftNumber(event)" @add-yield="spendDraft.yield[$event] = 1" @remove-yield="delete spendDraft.yield[$event]" />
      <div class="spend-panel-actions"><button type="button" class="action-button" :disabled="schedulePending" @click="backToSpendChannels">取消</button><button type="submit" class="action-button primary" :disabled="schedulePending">添加到支出</button></div>
    </form>
    <div v-else class="spend-channel-grid">
      <button v-for="channel in SPEND_CHANNELS" :key="channel.id" type="button" :style="channelStyle(channel.colorKey)" :disabled="schedulePending" @click="addSpend(channel.id)"><span class="channel-label" :class="channel.colorKey" :style="channelStyle(channel.colorKey)"><i></i>{{ channel.label }}</span><ChevronRight v-if="channel.kind === 'training'" :size="14" aria-hidden="true" /><span v-if="channel.kind === 'training'" class="spend-next-label">选层数</span></button>
      <button v-for="item in commonSpendTemplates" :key="item.id" type="button" :disabled="schedulePending || templatesBlocked" :style="channelStyle('custom')" @click="addCommonSpend(item)"><span class="channel-label custom common-spend-label"><i></i>{{ item.label }}</span></button>
    </div>
    <p v-if="templatesLoading" role="status">正在读取常用支出…</p>
    <p v-if="templateError" class="spend-inline-error" role="alert">{{ templateError }} <button type="button" class="workspace-link" @click="templateManagerRef?.open()">恢复常用支出</button></p>
  </section>
  <p v-if="scheduleState.saving || (schedulePending && !scheduleState.error)" class="spend-save-status" role="status">正在核对并保存日程到云端，尚未确认…</p>
  <p v-else-if="scheduleState.error" class="spend-inline-error" role="alert">日程尚未确认保存：{{ scheduleState.error.message }}。待保存内容仍在当前页面，请勿重复添加。<a href="#planner-cloud-recovery-schedule" @click="focusScheduleRecovery">前往重试保存或读取云端</a></p>
  <p v-else-if="spendAddError || (addMenu === 'spend' && spendBlockedReason)" id="planner-spend-add-error" class="spend-inline-error" role="alert">{{ spendAddError || spendBlockedReason }}</p>
  <p v-else-if="spendFeedback" class="spend-save-status" role="status">{{ spendFeedback }}</p>
</div>
<div class="spend-summary">
  <div class="ledger-total spend-total"><span>当日支出</span><b>{{ formatStamina(todayTotals.spends) }}</b></div>
  <div class="spend-balance" :class="{ negative: todayTotals.balance < 0 }" role="status" aria-live="polite" aria-atomic="true"><span>{{ todayTotals.balance < 0 ? '超出可用体力' : '未分配体力' }}</span><strong>{{ formatStamina(Math.abs(todayTotals.balance)) }}</strong></div>
</div></section></div><CultivationProgress :rows="progressItems" :date-label="currentDateLabel" /></div><section class="editor-actions panel"><p>{{ currentDay.manual ? '该日为手工计划；调整获取或支出后会更新账本；点击提示才会重新安排当日及后续日程。' : '修改后会保存完整日程；调整体力获取或支出后，可点击提示重新计算当日及后续日程。' }}</p><div><button v-if="futureManualCount" type="button" class="action-button" @click="clearFutureManualPlans"><RotateCcw :size="14" aria-hidden="true" />清除后续 {{ futureManualCount }} 个固定日</button><button type="button" class="action-button" title="恢复当前套用方案中的当日安排" @click="restoreCurrentDay"><RotateCcw :size="14" aria-hidden="true" />恢复当天方案</button></div></section>
                <footer class="planner-step-actions">
                  <button type="button" class="workspace-link" aria-label="上一步：方案对比" title="上一步：方案对比" @click="setPlannerStep('comparison')"><ChevronLeft :size="18" aria-hidden="true" /></button>
                  <button type="button" class="action-button primary" @click="openPlanner('display', true)"><Check :size="16" aria-hidden="true" />完成编辑</button>
                </footer>
              </section>
            </div>
          </div>
        </section>
        </fieldset>
      </section>
    </template>

    </div>
    <PlannerCustomSpendManager ref="templateManagerRef" :templates="commonSpendTemplates" :owner="templateOwner" :busy="templateState.saving || templatesLoading" :error="templateError" :resources="yieldResourceOptions" :resource-name="resourceName" @save="saveCommonSpends" @retry="recoverCommonSpends('retry', $event)" @discard="recoverCommonSpends('discard', $event)" />
    <PlannerCustomDailySpend ref="customDailyRef" :rules="customRules" :templates="commonSpendTemplates" :today="plannerToday" :date="selectedDate" :last-date="customDailyLastDate" :context-key="customDailyContext" :disabled="scheduleActionBlocked || goalMode" :resource-name="resourceName" @preview="previewCustomDaily" @apply="applyCustomDaily" />
    <Teleport to="body">
      <div v-if="props.active && props.isLoggedIn && props.accountId && workspace.activePlanId && scheduleSaveStatus" class="planner-save-toast" :class="'is-' + scheduleSaveStatus">
        <RefreshCw v-if="scheduleSaveStatus === 'saving'" class="planner-save-icon spin" :size="22" aria-hidden="true" />
        <Check v-else-if="scheduleSaveStatus === 'saved'" class="planner-save-icon is-success" :size="22" aria-hidden="true" />
        <CircleAlert v-else class="planner-save-icon is-error" :size="22" aria-hidden="true" />
        <div class="planner-save-copy" :role="scheduleSaveStatus === 'error' ? 'alert' : 'status'" aria-live="polite">
          <strong>{{ scheduleSaveStatus === 'saving' ? '正在保存到云端…' : scheduleSaveStatus === 'saved' ? '已保存到云端' : '日程尚未确认保存' }}</strong>
          <span v-if="scheduleSaveStatus === 'saving'">请稍候</span>
          <span v-else-if="scheduleSaveStatus === 'error'">请重试或查看云端同步提示</span>
        </div>
        <button v-if="scheduleSaveStatus === 'error'" type="button" class="planner-save-retry" @click="recover('schedule')">重试</button>
      </div>
      <dialog ref="scheduleActionDialog" class="tracker-remove-dialog schedule-action-dialog" aria-labelledby="schedule-action-title" aria-describedby="schedule-action-description" @cancel.prevent="closeScheduleAction" @click="event => { if (event.target === scheduleActionDialog) { const box = scheduleActionDialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeScheduleAction() } }">
        <div class="tracker-remove-dialog-head"><div><span class="section-kicker">日程操作</span><h3 id="schedule-action-title">{{ scheduleActionTitle }}</h3></div><button type="button" class="tracker-dialog-close" aria-label="关闭" @click="closeScheduleAction"><X :size="17" aria-hidden="true" /></button></div>
        <div class="tracker-remove-dialog-body"><Info :size="18" aria-hidden="true" /><p id="schedule-action-description">{{ scheduleActionDescription }}</p></div>
        <p v-if="scheduleAction === 'reset' && planError" class="tracker-remove-dialog-error" role="alert">{{ planError }}</p>
        <div class="tracker-remove-dialog-actions"><button type="button" class="tracker-dialog-button ghost" autofocus @click="closeScheduleAction">取消</button><button type="button" class="tracker-dialog-button primary" :disabled="scheduleAction === 'reset' && scheduleActionBlocked" @click="confirmScheduleAction">{{ scheduleAction === 'reset' ? '确认从今天重新规划' : scheduleActionTitle }}</button></div>
      </dialog>
      <Transition name="tracker-dialog">
        <div v-if="removePromptRow" class="tracker-remove-dialog-mask" @click.self="closeRemovePrompt">
          <div class="tracker-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="tracker-remove-dialog-title" @keydown.esc.prevent="closeRemovePrompt">
            <div class="tracker-remove-dialog-head">
              <div>
                <span class="section-kicker">清单操作</span>
                <h3 id="tracker-remove-dialog-title">移出养成清单</h3>
              </div>
              <button type="button" class="tracker-dialog-close" aria-label="关闭" :disabled="removePromptBusy" @click="closeRemovePrompt"><X :size="17" aria-hidden="true" /></button>
            </div>
            <div class="tracker-remove-dialog-body">
              <CircleAlert :size="18" aria-hidden="true" />
              <div>
                <p>要同时将「{{ removePromptRow.name || removePromptRow.id }}」的养成状态改为已毕业吗？</p>
              </div>
            </div>
            <p v-if="removePromptError" class="tracker-remove-dialog-error" role="alert">{{ removePromptError }}</p>
            <div class="tracker-remove-dialog-actions">
              <button type="button" class="tracker-dialog-button ghost" :disabled="removePromptBusy" @click="closeRemovePrompt">取消</button>
              <button type="button" class="tracker-dialog-button discard" :disabled="removePromptBusy" @click="confirmRemove(false)">仅从清单中移除</button>
              <button ref="removePromptConfirm" type="button" class="tracker-dialog-button primary" :disabled="removePromptBusy" @click="confirmRemove(true)">{{ removePromptBusy ? '保存中…' : '标记已毕业并移除' }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup>
import { operatorHuaji, operatorHuajiMax, operatorHuajiLabel, operatorHuajiAction, operatorAwakeningSupported } from '../../utils/operatorHuaji.js'
import { isMovieOperator } from '../../utils/operatorForms.js'
import { normalizeGrowthTarget, sharedPlanCalculations, growthHuajiProgress } from '../../data/operatorPlanGrowth.js'

import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import Sortable from 'sortablejs'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Info, ListOrdered, Pencil, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Users, Target, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
import OperatorGrowthActionPopover from './OperatorGrowthActionPopover.vue'
import { useOperatorPlannerCloud } from '../../composables/useOperatorPlannerCloud.js'
import { plannerDateInZone } from '../../data/operatorPlannerRemote.js'
import { addCalendarDays, businessDayStartIso, BUSINESS_DAY_START_HOUR, BUSINESS_TIMEZONE } from '../../utils/businessDay.js'
import OperatorTrainingPlanPicker from './OperatorTrainingPlanPicker.vue'
import OperatorReserveWorkspace from './OperatorReserveWorkspace.vue'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../../config/features.js'
import { isOperatorOwned } from '../../utils/operatorFilters.js'
import { TRAINING_GROUPS, bookExperience, experienceTrainingDays, normalizeTrainingLevels, trainingMaterialEtas, trainingRate, growthTargetReached } from '../../data/operatorTraining.js'
import { FAVORITES_PLAN_ID, sanitizeTrainingWorkspaceOperators, trainingPlanMemberIds } from '../../data/operatorTrainingPlans.js'
import { getCurrent, listRecords } from '../../api/inventory.js'
import { avatarUrl } from '../../api/request.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { getOperatorGrowthTargets, putOperatorGrowthTarget } from '../../api/operator.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import { mergeRequirements, netRequirement, starLabelForStage, starStageFromLevel } from '../../data/operatorRequirements.js'
import { getMaxEliteForLevel } from '../../utils/operatorGrowthRules.js'
import { buildRecentAcquisitionHistory, recentBusinessDayKeys } from '../../data/inventory/acquiredStats.js'
import PlannerDateTabs from './PlannerDateTabs.vue'
import PlannerSelect from './PlannerSelect.vue'
import PlannerCustomEntry from './PlannerCustomEntry.vue'
import PlannerCustomSpendManager from './PlannerCustomSpendManager.vue'
import PlannerCustomDailySpend from './PlannerCustomDailySpend.vue'
import { useCustomSpendTemplates } from '../../composables/useCustomSpendTemplates.js'
import { customSpendTemplate, customSpendFromTemplate, customSpendRuleAt, replaceCustomSpendRule, mergeCustomSpendRules, markCustomSpendOverride } from '../../data/customPlannerSpends.js'
import { applyCustomSpendRulesToSchedule } from '../../data/fixedPlannerSchedule.js'
import PlannerDailySources from './PlannerDailySources.vue'
import PlannerRepeatedSpend from './PlannerRepeatedSpend.vue'
import PlannerRoutineSettings from './PlannerRoutineSettings.vue'
import { withSourcePeriod } from '../../data/dailyStaminaSources.js'
import { applyDailySourcesToSchedule, applyFixedCustomSpendToSchedule, applyFixedStage624ToSchedule, plannerDateAfter } from '../../data/fixedPlannerSchedule.js'
import PlannerRecalculateNotice from './PlannerRecalculateNotice.vue'
import PlannerExactOptimizer from './PlannerExactOptimizer.vue'
import CultivationProgress from './CultivationProgress.vue'
import { applyDeadlineAlternative, applyExactComparisonResult, createFixedSchedule, fixedScheduleDifferences, pendingScheduleEdits, plannerBasePlan, plannerBaseValue, plannerTiming, resetFixedSchedule, restoreFixedScheduleDay, visibleFixedScheduleTimeline, recalculateFixedScheduleFrom, reviseFixedSchedule, updateFixedSchedulePlan } from '../../data/fixedPlannerSchedule.js'
import { GAIN_CHANNELS, PLANNER_RESOURCE_LABELS, PLANNER_RULES, SPEND_CHANNELS, aggregatePlannerState, allocateSharedPlannerStock, buildRecommendedPlan, simulatePlanner, settlePlannerDay, plannerProgressRows, plannerResourcesFromCalculation, clonePlannerValue, createGain, createInitialPlannerState, createSpend, energyFromGain, normalizePlannerPlan, normalizePlannerPreferences, planTotals } from '../../data/cultivationPlanner.js'

const props = defineProps({ game: { type: String, default: '代号鸢' }, accountId: { type: String, default: '' }, currentEntries: { type: Array, default: () => [] }, catalogEntries: { type: Array, default: () => [] }, favoriteIds: { type: Object, default: () => new Set() }, growthStates: { type: Object, default: () => ({}) }, isLoggedIn: { type: Boolean, default: false }, refreshKey: { type: Number, default: 0 }, active: { type: Boolean, default: true }, annotationRevisions: { type: Object, default: () => ({}) }, isRemarkEditing: { type: Function, default: () => false }, quickUpgrade: { type: Function, default: null }, quickUpgradeState: { type: Function, default: null }, growthActionPopoverKey: { type: String, default: '' }, growthActionEntry: { type: Function, default: null }, growthActionTargetLabel: { type: Function, default: null }, growthActionShowBreakthrough: { type: Function, default: null }, growthActionBreakthrough: { type: Function, default: null }, growthActionPreviewBusy: { type: Function, default: null }, growthActionPreviewError: { type: Function, default: null }, growthActionPreview: { type: Function, default: null }, growthActionDisplayRequirements: { type: Function, default: null }, growthActionBlockingReasons: { type: Function, default: null }, growthActionAvailable: { type: Function, default: null }, growthActionHasMaterialGap: { type: Function, default: null }, growthActionExecuteBusy: { type: Function, default: null }, growthActionRequirementName: { type: Function, default: null }, growthActionRequirementValue: { type: Function, default: null }, growthActionRequirementBalanceLabel: { type: Function, default: null }, growthActionReasonMessage: { type: Function, default: null }, growthActionExecute: { type: Function, default: null }, growthActionBreakthroughChange: { type: Function, default: null }, growthActionNotice: { type: Function, default: null } })

const emit = defineEmits(['refresh-operators', 'refresh-annotations', 'annotation-updated'])
const canUseReserve = computed(() => props.isLoggedIn && auth.isLoggedIn &&
  (isFeatureEnabled(FEATURE_KEYS.OPERATOR_RESERVE) || hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.OPERATOR_RESERVE_USE)))
const workspaceSession = ref(0)
watch(() => [props.accountId, props.isLoggedIn], () => { workspaceSession.value++ }, { flush: 'sync' })
const dailySourcePreview = ref(null)
const dailySourcePreviewKey = () => JSON.stringify([props.accountId, workspace.value.activePlanId, workspace.value.revision, fixedSchedule.value, manualPlans.value, plannerPreferences.value, plannerToday.value])
const visibleDailySourcePreview = computed(() => dailySourcePreview.value && dailySourcePreview.value.key === dailySourcePreviewKey() ? dailySourcePreview.value : null)
const plannerRules = PLANNER_RULES
const loading = ref(false)
const error = ref('')
const currentItems = ref({})
const inventoryReady = ref(false)
const currentAgents = ref({})
const heartHistory = ref({})
const heartHistoryReady = ref(false)
const heartHistoryError = ref(false)
const targets = ref({})
const targetLoading = ref(false)
const targetError = ref('')
const targetNotice = ref('')
const targetBusyIds = ref(new Set())
const trainingPlanPickerRef = ref(null)
const { workspace, snapshot: cloudSnapshot, workspaceState, scheduleState, cloudLoading, scheduleLoading, cloudError,
  migration, migrationBusy, cloudBlocked, workspacePending, schedulePending, loadCloud, saveWorkspace, saveSchedule,
  removeMember, prepareMigration, importLocal, keepCloud, compareMigrationAgain, recover, refreshCloud } = useOperatorPlannerCloud(props, targets, emit)
const scheduleSaved = ref(false)
let scheduleSavedTimer = null
let discardingSchedule = false
let scheduleHadDraft = false
const scheduleSaveStatus = computed(() => {
  if (scheduleState.value.saving || (schedulePending.value && !scheduleState.value.error)) return 'saving'
  if (scheduleState.value.error) return 'error'
  return scheduleSaved.value ? 'saved' : ''
})
watch(() => [schedulePending.value, scheduleState.value.error, props.accountId, props.isLoggedIn, workspace.value.activePlanId],
  ([pending, failure, account, loggedIn, plan], [wasPending, , oldAccount, oldLoggedIn, oldPlan]) => {
    if (account !== oldAccount || loggedIn !== oldLoggedIn || plan !== oldPlan) {
      scheduleHadDraft = false
      clearTimeout(scheduleSavedTimer)
      scheduleSaved.value = false
      return
    }
    if (pending || failure) {
      if (scheduleState.value.pending) scheduleHadDraft = true
      clearTimeout(scheduleSavedTimer)
      scheduleSaved.value = false
      return
    }
    if (wasPending && scheduleHadDraft && !discardingSchedule) {
      scheduleSaved.value = true
      clearTimeout(scheduleSavedTimer)
      scheduleSavedTimer = setTimeout(() => { scheduleSaved.value = false }, 2400)
    }
    scheduleHadDraft = false
  }, { flush: 'sync' })
async function discardCloudChanges(kind) {
  if (kind === 'schedule') discardingSchedule = true
  try { await recover(kind, true) } finally { discardingSchedule = false }
}
onBeforeUnmount(() => clearTimeout(scheduleSavedTimer))
const planPickerDisabled = computed(() => cloudBlocked.value || schedulePending.value || targetBusyIds.value.size > 0 || targetLoading.value)
const scheduleTimezone = ref(BUSINESS_TIMEZONE)
const commonSpends = useCustomSpendTemplates()
const { templates: commonSpendTemplates, owner: templateOwner, error: templateError, loading: templatesLoading, state: templateState, blocked: templatesBlocked } = commonSpends
const templateManagerRef = ref(null), customDailyRef = ref(null)
const customRules = computed(() => plannerPreferences.value.customSpendRules || [])
const customDailyContext = computed(() => JSON.stringify([templateOwner.value, props.accountId, workspace.value.activePlanId, workspaceSession.value]))
const customDailyLastDate = computed(() => plannerDateAfter(plannerToday.value, 89))
const customRuleEntries = computed(() => customRules.value.map(rule => {
  const snapshot = [...rule.versions].reverse().find(version => version.item)
  const current = customSpendRuleAt(rule, plannerToday.value)
  return { id: rule.id, ...(snapshot?.item || commonSpendTemplates.value.find(item => item.id === rule.id) || { label: '已停用项目', costPer: 0, yield: {} }),
    value: snapshot?.count ?? 1, dailyStatus: current ? current.enabled ? `每天${current.count}次` : '已停用' : '尚未生效' }
}))
const dayRuleOverrides = computed(() => customRuleEntries.value.filter(item => currentDay.value.planned.customSpendOverrides?.includes(item.id)))
const planError = ref('')
const planNotice = ref('')
const scheduleAction = ref('')
const scheduleActionDialog = ref(null)
const scheduleActionBlocked = computed(() => cloudBlocked.value || schedulePending.value || loading.value || targetLoading.value || Boolean(error.value))
const scheduleActionTitle = computed(() => scheduleAction.value === 'reset' ? '重设日程起始日期' : hidePastSchedule.value ? '展开已过日程' : '收起已过日程')
const scheduleActionDescription = computed(() => scheduleAction.value === 'reset'
  ? `从 ${formatLongDate(plannerToday.value)} 开始，按当前库存和清单重新规划。今天及未来的手工安排将清除，持续每日安排保留，按当前体力偏好重新推荐；此前阶段不再出现在日期栏中。`
  : hidePastSchedule.value ? `重新显示当前阶段的 ${pastScheduleCount.value} 条已过日程，供回顾原有安排。`
      : `收起当前阶段的 ${pastScheduleCount.value} 条已过日程，仅改变显示。今天及未来安排保持不变，可随时展开；本机会记住选择。`)
async function openScheduleAction(action) {
  if (action === 'reset' && scheduleActionBlocked.value) return
  scheduleAction.value = action
  if (action === 'reset') planError.value = ''
  await nextTick()
  scheduleActionDialog.value?.showModal()
}
function closeScheduleAction() { scheduleActionDialog.value?.close(); scheduleAction.value = '' }
function confirmScheduleAction() {
  if (scheduleAction.value === 'reset') { resetSavedSchedule(); return }
  if (scheduleAction.value === 'history') togglePastSchedule()
  closeScheduleAction()
}
const undoWorkspace = ref(null)
const viewMode = ref('display')
const plannerOpen = ref(true)
const reserveOpen = ref(false)
const reserveEntryRef = ref(null)
const reserveWorkspaceRef = ref(null)
function openReserveWorkspace() {
  reserveOpen.value = true
  nextTick(() => { reserveWorkspaceRef.value?.focus({ preventScroll: true }); reserveWorkspaceRef.value?.scrollIntoView({ block: 'start' }) })
}
function closeReserveWorkspace() {
  reserveOpen.value = false
  nextTick(() => reserveEntryRef.value?.focus())
}
watch(canUseReserve, allowed => { if (!allowed) reserveOpen.value = false })
const plannerSteps = [{ id: 'conditions', label: '规划条件' }, { id: 'comparison', label: '方案对比' }, { id: 'daily', label: '编辑每日' }]
const plannerStep = ref('conditions')
const plannerStepsRef = ref(null)
const plannerConditionsRef = ref(null)
const plannerComparisonRef = ref(null)
const plannerDailyRef = ref(null)
const mobileRosterOpen = ref(false)
const routineGainsOpen = ref(false)
const goalMode = ref(false)
const goalDays = ref(10)
const goalDatePickerOpen = ref(false)
const goalDatePickerWrap = ref(null)
const goalDateTrigger = ref(null)
const goalDatePickerRef = ref(null)
const goalDatePickerYear = ref(new Date().getFullYear())
const goalDatePickerMonth = ref(new Date().getMonth())
const goalDatePickerFocusedDay = ref(1)
const goalInitialExtra = ref(0)
const goalReserveSources = ref([])
let goalReserveSequence = 0
function addGoalReserve() { goalReserveSources.value.push({ id: 'goal-reserve-' + (++goalReserveSequence), name: '体力储备 ' + goalReserveSequence, amount: 120 }) }
const addMenu = ref('')
const pendingSpendChannel = ref('')
const spendAddRef = ref(null)
const spendPanelRef = ref(null)
const selectedSpendStage = ref(null)
const spendDraft = ref(null)
const spendAddError = ref('')
const spendFeedback = ref('')
const pendingSpendAddition = ref(null)
const highlightedSpendId = ref('')
let spendHighlightTimer
const spendBlockedReason = computed(() => {
  if (reviewingHistory.value) return '历史日程仅供查看，不能添加支出。'
  if (scheduleState.value.error || workspaceState.value.error) return '请先处理上方云端同步提示，再添加支出。'
  if (cloudError.value) return cloudError.value
  if (error.value) return error.value
  if (loading.value || targetLoading.value || cloudLoading.value || scheduleLoading.value) return '数据正在读取，请稍后再试。'
  if (schedulePending.value) return '正在保存日程，请等待本次保存完成。'
  if (cloudBlocked.value) return '当前无法保存，请先完成登录、选择清单或处理上方云端提示。'
  return ''
})
const pendingTrainingGroup = computed(() => trainingGroupForSpend({ id: pendingSpendChannel.value }))
const addTrainingStages = computed(() => pendingTrainingGroup.value?.stages.filter(stage => stage.level <= plannerLevels.value[pendingTrainingGroup.value.id]) || [])
const selectedTrainingSpend = computed(() => addTrainingStages.value.some(stage => stage.level === selectedSpendStage.value) ? createSpend(pendingSpendChannel.value, { stageLevel: selectedSpendStage.value }) : null)
const plannerPreferences = ref(normalizePlannerPreferences())
const strategy = ref('overall')
const plannerConditionSummary = computed(() => [
  goalMode.value ? `${goalDays.value} 天内完成 · 最低白金币` : strategy.value === 'priority' ? '按清单顺序优先完成' : '整体最早完成',
  `每日购买 ${plannerPreferences.value.purchaseCount} 次`,
  `洛阳 ${plannerPreferences.value.luoyang} 次 · 寿春 ${plannerPreferences.value.shouchun} 次`
].join(' · '))
const plannerOrder = ref([])
const manualPlans = shallowRef({})
const fixedSchedule = shallowRef(null)
const plannerToday = ref(plannerDateInZone(BUSINESS_TIMEZONE, new Date(), BUSINESS_DAY_START_HOUR))
const plannerWorkspaceRef = ref(null)
const dayPlanRef = ref(null)
const dayEditRef = ref(null)
const plannerStartDate = ref(plannerToday.value)
const selectedDate = ref(plannerStartDate.value)
const hidePastSchedule = ref(readHidePastSchedule())
function readHidePastSchedule() { try { return localStorage.getItem('yuanhub:planner:hide-past') === 'true' } catch (_) { return false } }
function togglePastSchedule() {
  hidePastSchedule.value = !hidePastSchedule.value
  try { localStorage.setItem('yuanhub:planner:hide-past', String(hidePastSchedule.value)) } catch (_) {}
  if (hidePastSchedule.value && selectedDate.value < plannerToday.value) selectedDate.value = plannerDates.value[0]
}
const rosterList = ref(null)
const starTargetId = ref('')
const starTargetDraft = ref(0)
const starTargetGroup = computed(() => starTargetDraft.value === 'awakening' ? 'awakening' : starTargetDraft.value == null ? -1 : starGroup(starTargetDraft.value))
const removePromptRow = ref(null)
const removePromptError = ref('')
const removePromptBusy = ref(false)
const removePromptConfirm = ref(null)
let starTargetTrigger = null
let targetLoadSeq = 0
let targetNoticeTimer = null
let inventoryLoadSeq = 0
let inventoryEventRefreshTimer = null
let targetEventRefreshTimer = null
let unsubscribeAccountEvents = null
let plannerClockTimer = null

const EXPERIENCE_BOOK_IDS = new Set(['bingshucanjuan', 'bingshuquanjuan', 'liutaobingshu'])
const channelColors = Object.freeze({ natural: '#6F9A74', meal: '#678E91', buy: '#6E8FB6', mail: '#6B9D99', event: '#9978AD', gift: '#B47F67', custom: '#887E8F', luoyang: '#7089A2', shouchun: '#eb9685', yinyang: '#8E72A4', exp: '#C58B43', stage624: '#789569', feng: '#B76D58', dishui: '#668FA7' })

const activePlan = computed(() => workspace.value.plans.find(plan => plan.id === workspace.value.activePlanId) || workspace.value.plans[0])
const activeMemberIds = computed(() => {
  const members = trainingPlanMemberIds(activePlan.value, props.favoriteIds)
  if (activePlan.value?.source !== 'favorites') return members
  const known = new Set(props.catalogEntries.map(entry => entry.id).filter(Boolean))
  return new Set([...members].filter(id => known.has(id)))
})
const currentMap = computed(() => Object.fromEntries(props.currentEntries.map(entry => [entry.id, entry])))
const itemMap = computed(() => { const map = Object.fromEntries(ITEM_CATALOG.map(item => [item.id, item.name])); props.catalogEntries.forEach(item => { if (item.id) map[item.id] = item.name || map[item.id] || item.id }); return map })
const starStages = [{ value: 0, label: '未拥有' }].concat(Array.from({ length: 24 }, (_, index) => { const value = index + 1; return { value, label: starLabelForStage(starStageFromLevel(value)).replace(/^.+星升/, '升') } }), [{ value: 25, label: '五星' }])

function defaultTarget() { return { level: 100, elite: 17, starLevel: 7, revision: 0 } }
function targetFor(row, plan = activePlan.value) {
  if (!row?.id) return defaultTarget()
  const catalog = props.catalogEntries.find(entry => entry.id === row.id)
  const saved = (plan?.source === 'custom' ? plan.targets[row.id] : targets.value[row.id]) || {}
  return normalizeGrowthTarget({ ...catalog, ...row }, saved)
}
function currentStarLabel(row) { const huaji = operatorHuaji(row); return huaji.stage === 25 ? huaji.awakened === true ? '已觉醒' : '5 星' : operatorHuajiLabel(row) }
function targetStarLabel(row) { const huaji = targetFor(row).huaji; return huaji.stage === 25 && operatorAwakeningSupported(row) ? huaji.awakened === true ? '5 星 → 觉醒' : '5 星' : operatorHuajiLabel({ ...row, huaji }) }
function targetEliteMax(row) { return Math.max(Number(row?.elite) || 0, getMaxEliteForLevel(targetFor(row).level)) }
function firstSubProf(row) { return Array.isArray(row?.subProf) ? row.subProf[0] : String(row?.subProf || '').split('、')[0] }
const PROF_ICON_FILES = Object.freeze({ 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' })
function profList(value) {
  const values = (Array.isArray(value) ? value : [value]).flatMap(item => String(item || '').split(/[、，,\/／+＋]/))
  const result = []
  values.forEach(item => {
    const text = String(item || '').trim()
    if (!text) return
    if (PROF_ICON_FILES[text]) {
      if (!result.includes(text)) result.push(text)
      return
    }
    Array.from(text.replace(/\s/g, '')).forEach(char => {
      if (PROF_ICON_FILES[char] && !result.includes(char)) result.push(char)
    })
  })
  return result
}
function profIcon(prof) { const file = PROF_ICON_FILES[String(prof || '').trim()]; return file ? (import.meta.env.BASE_URL || '/') + 'assets/prof-icons/' + file : '' }
function starLabel(value, row) { const number = Number(value) || 0; if (isMovieOperator(row)) return number > 0 ? number + ' 星' : '未拥有'; if (number <= 0) return '未拥有'; if (number >= 31) return '觉醒'; if (number >= 25) return '5星'; return Math.min(5, Math.floor((number - 1) / 6) + 1) + '星 · 节点 ' + ((number - 1) % 6) }
function starStagesFor(row) { if (isMovieOperator(row)) return Array.from({ length: 6 }, (_, value) => ({ value, label: value ? value + ' 星' : '未拥有' })).filter(stage => stage.value >= (Number(row.starLevel) || 0)); return starStages.filter(stage => stage.value <= operatorHuajiMax(row) && stage.value >= (operatorHuaji(row).stage || 0)) }
function starGroup(value) { const number = Number(value) || 0; if (number === 0 || number === 31) return number; return Math.min(5, Math.floor((number - 1) / 6) + 1) }
function starGroupsFor(row) { return [...new Set(starStagesFor(row).map(stage => starGroup(stage.value))), ...(operatorAwakeningSupported(row) ? ['awakening'] : [])] }
function starNodesFor(row, group) { return starStagesFor(row).filter(stage => starGroup(stage.value) === Number(group)) }
function setStarTargetGroup(row, event) { if (event.target.value === 'awakening' && operatorAwakeningSupported(row)) { starTargetDraft.value = 'awakening'; return }; const stages = starNodesFor(row, Number(event.target.value)); const node = (starTargetDraft.value - 1) % 6; const matching = stages.find(stage => (stage.value - 1) % 6 === node); if (stages.length) starTargetDraft.value = (matching || stages[0]).value }
async function openStarTarget(row, event) { if (starTargetId.value === row.id) return closeStarTarget(); starTargetTrigger = event.currentTarget; const target = targetFor(row); starTargetDraft.value = target.huaji?.awakened === true && operatorAwakeningSupported(row) ? 'awakening' : target.huaji?.stage ?? null; starTargetId.value = row.id; await nextTick(); document.getElementById('tracker-star-target-' + row.id)?.querySelector('select')?.focus() }
function closeStarTarget(restoreFocus = false) { starTargetId.value = ''; if (restoreFocus) starTargetTrigger?.focus(); starTargetTrigger = null }
async function saveStarTarget(row) {
  const draft = starTargetDraft.value
  if (draft == null) return closeStarTarget(true)
  const prior = targetFor(row).huaji
  const huaji = draft === 'awakening' ? { owned: true, stage: 25, awakened: true }
    : { owned: draft > 0, stage: draft, awakened: prior.awakened === true ? null : prior.awakened }
  const saved = await setTarget(row, 'huaji', huaji)
  if (saved && starTargetId.value === row.id) { await nextTick(); closeStarTarget(true) }
}
function dismissStarTarget(event) {
  if (addMenu.value === 'gain' && !event.target.closest('.add-wrap')) addMenu.value = ''
  if (starTargetId.value && !event.target.closest('.tracker-star-anchor')) closeStarTarget()
  if (goalDatePickerOpen.value && !goalDatePickerWrap.value?.contains(event.target)) closeGoalDatePicker(false)
}
function quickUpgradeState(row, field, step, readyLabel) {
  if (field === 'star' && isMovieOperator(row)) return { visible: false }
  if (field === 'star' && operatorHuajiAction(row).disabled) { const action = operatorHuajiAction(row); return { visible: Boolean(row.owned), disabled: true, icon: 'check', label: action.label, title: action.label } }
  const fallback = { visible: Boolean(props.quickUpgrade && row?.owned), disabled: false, className: '', icon: 'up', label: readyLabel, title: '在养成规划中查看快捷提升' }
  if (typeof props.quickUpgradeState !== 'function') return field === 'star' && operatorHuajiAction(row).kind === 'awakening' ? { ...fallback, label: operatorHuajiAction(row).label, title: operatorHuajiAction(row).label } : fallback
  return Object.assign(fallback, props.quickUpgradeState(row, field, step, readyLabel) || {})
}
function requestQuickUpgrade(row, field, step) {
  if (typeof props.quickUpgrade === 'function') props.quickUpgrade(row, field, step)
}
function growthActionEntry(row) {
  if (typeof props.growthActionEntry === 'function') return props.growthActionEntry(row) || row
  return row
}
function growthActionNotice(row) {
  return typeof props.growthActionNotice === 'function' ? props.growthActionNotice(growthActionEntry(row)) : ''
}
function callGrowthAction(name, ...args) {
  const handler = props[name]
  return typeof handler === 'function' ? handler(...args) : null
}
function growthActionPopoverProps(row, field, step) {
  const entry = growthActionEntry(row)
  const previewBusy = Boolean(callGrowthAction('growthActionPreviewBusy', entry, field))
  const executeBusy = Boolean(callGrowthAction('growthActionExecuteBusy', entry, field))
  return {
    open: Boolean(entry?.id && props.growthActionPopoverKey === entry.id + ':' + field),
    targetLabel: callGrowthAction('growthActionTargetLabel', entry, field) || '',
    showBreakthrough: field === 'level' && Boolean(callGrowthAction('growthActionShowBreakthrough', entry, step)),
    breakthrough: Boolean(callGrowthAction('growthActionBreakthrough', entry)),
    breakthroughDisabled: previewBusy || executeBusy,
    previewBusy,
    previewError: callGrowthAction('growthActionPreviewError', entry, field) || '',
    preview: callGrowthAction('growthActionPreview', entry, field),
    displayRequirements: callGrowthAction('growthActionDisplayRequirements', entry, field) || [],
    blockingReasons: callGrowthAction('growthActionBlockingReasons', entry, field) || [],
    available: Boolean(callGrowthAction('growthActionAvailable', entry, field)),
    hasMaterialGap: Boolean(callGrowthAction('growthActionHasMaterialGap', entry, field)),
    executeBusy,
    requirementName: item => callGrowthAction('growthActionRequirementName', item, entry) || item.name || item.id,
    requirementValue: (item, key) => callGrowthAction('growthActionRequirementValue', item, key) ?? item[key] ?? 0,
    requirementBalanceLabel: item => callGrowthAction('growthActionRequirementBalanceLabel', item) || '',
    reasonMessage: reason => callGrowthAction('growthActionReasonMessage', reason) || reason.message || reason.code || '当前状态无法提升',
  }
}
async function executeGrowthAction(row, field) {
  const handler = props.growthActionExecute
  if (typeof handler === 'function' && await handler(growthActionEntry(row), field)) await loadInventory()
}
function changeGrowthBreakthrough(row, event) {
  const handler = props.growthActionBreakthroughChange
  if (typeof handler === 'function') handler(growthActionEntry(row), event)
}

const sharedCalculations = computed(() => sharedPlanCalculations(props.catalogEntries, currentMap.value, activeMemberIds.value, targetFor))
const requirementPlanRows = computed(() => activeMemberIds.value.size ? props.catalogEntries.filter(entry => activeMemberIds.value.has(entry.id)).map(entry => { const current = currentMap.value[entry.id] || {}; const target = targetFor({ ...entry, ...current }); const shared = sharedCalculations.value[entry.id]; const { level, xiuwei, star } = shared; const total = mergeRequirements(level, xiuwei, star); const net = netRequirement(total, currentItems.value); const ownedExperience = experienceStock(currentItems.value); const experienceGap = Math.max(level.experience - ownedExperience, 0); const heartOwned = isMovieOperator(entry) ? 0 : Number(currentAgents.value[entry.id]) || 0; const heartRequired = Number(star.heart) || 0; const heartGap = Math.max(heartRequired - heartOwned, 0); const gaps = net.gaps.filter(gap => !EXPERIENCE_BOOK_IDS.has(gap.id)); return { ...entry, ...current, avatar: entry.avatar || '', level: Number(current.level) || 0, elite: Number(current.elite) || 0, starLevel: Number(current.starLevel) || 0, owned: isOperatorOwned(current), completed: !shared.sharedUnsupported && growthTargetReached(current, { ...target, ...shared.sharedTarget }), calculation: { ...shared, level, xiuwei, star, total, net, experienceGap, heartOwned, heartRequired, heartGap, gaps, materialEtas: trainingMaterialEtas(gaps, workspace.value.trainingLevels) } } }) : [])
const completedCount = computed(() => planRows.value.filter(row => row.completed).length)
const totalHeartStock = computed(() => planRows.value.reduce((sum, row) => sum + Number(row.calculation.heartOwned || 0), 0))
const baseRosterIds = computed(() => requirementPlanRows.value.map(row => row.id))
const orderedRosterIds = computed(() => { const known = new Set(baseRosterIds.value); const saved = plannerOrder.value.filter(id => known.has(id)); return [...saved, ...baseRosterIds.value.filter(id => !saved.includes(id))] })
const orderedPlanRows = computed(() => orderedRosterIds.value.map(id => planRows.value.find(row => row.id === id)).filter(Boolean))
const plannerRequirementRows = computed(() => requirementPlanRows.value.map(row => ({ id: row.id, resources: plannerResourcesFromCalculation(row.calculation) })))
const plannerRequirementState = computed(() => createInitialPlannerState(plannerRequirementRows.value))
const plannerRows = computed(() => {
  const rows = plannerRequirementRows.value
  const order = (strategy.value === 'priority' ? orderedRosterIds.value : baseRosterIds.value)
  const allocated = allocateSharedPlannerStock(createInitialPlannerState(rows), { ...currentItems.value, __xp__: experienceStock(currentItems.value) }, order, strategy.value)
  return rows.map(row => ({ id: row.id, resources: allocated[row.id] || {} }))
})
const plannerInitialState = computed(() => createInitialPlannerState(plannerRows.value))
// Use the same single allocation in operator cards and the simulator.
const planRows = computed(() => {
  const fullState = createInitialPlannerState(requirementPlanRows.value.map(row => ({ id: row.id,
    resources: { ...row.calculation.total.items, __xp__: row.calculation.level.experience } })))
  const allocated = allocateSharedPlannerStock(fullState, { ...currentItems.value, __xp__: experienceStock(currentItems.value) },
    strategy.value === 'priority' ? orderedRosterIds.value : baseRosterIds.value, strategy.value)
  return requirementPlanRows.value.map(row => {
    const remaining = allocated[row.id] || {}
    const gaps = Object.entries(remaining).filter(([id, gap]) => id !== '__xp__' && gap > 0).map(([id, gap]) => ({ id, gap }))
    const breakthroughMaterials = Object.entries(row.calculation.level.items).map(([id, required]) => {
      const gap = remaining[id] || 0
      return { id, required, owned: required - gap, gap }
    })
    return { ...row, calculation: { ...row.calculation, gaps, breakthroughMaterials, experienceGap: remaining.__xp__ || 0,
      materialEtas: trainingMaterialEtas(gaps, workspace.value.trainingLevels) } }
  })
})
const plannerLevels = computed(() => normalizeTrainingLevels(workspace.value.trainingLevels))
const plannerOrderForOptimization = computed(() => strategy.value === 'priority' ? orderedRosterIds.value : baseRosterIds.value)
const plannerHorizonDates = computed(() => Array.from({ length: plannerRules.maxEtaDays }, (_, index) => addDays(plannerStartDate.value, index)))
const livePlannerSimulation = computed(() => simulatePlanner({
  initialState: plannerInitialState.value, groups: TRAINING_GROUPS, levels: plannerLevels.value,
  strategy: strategy.value, agentOrder: plannerOrderForOptimization.value, preferences: plannerPreferences.value,
  manualPlans: manualPlans.value, dates: plannerHorizonDates.value
}))
const plannerSimulation = computed(() => fixedSchedule.value?.result || livePlannerSimulation.value)
const liveScheduleContext = computed(() => ({ date: plannerToday.value, initialState: plannerInitialState.value,
  requiredState: plannerRequirementState.value, stock: { ...currentItems.value, __xp__: experienceStock(currentItems.value) },
  goals: Object.fromEntries(requirementPlanRows.value.map(row => { const target = targetFor(row); return [row.id, [target.level, target.elite, target.starLevel]] })),
  levels: plannerLevels.value, strategy: strategy.value, agentOrder: plannerOrderForOptimization.value, preferences: plannerPreferences.value }))
const scheduleDifferences = computed(() => fixedScheduleDifferences(fixedSchedule.value, liveScheduleContext.value))
const scheduleNeedsUpdate = computed(() => !loading.value && !targetLoading.value && !error.value &&
  (scheduleDifferences.value.goalsChanged || scheduleDifferences.value.resources.length > 0))
const scheduleDifferenceLabel = computed(() => {
  const resources = scheduleDifferences.value.resources
  return resources.slice(0, 3).map(item => `${resourceName(item.id)}：计划 ${formatNumber(item.planned)} / 当前 ${formatNumber(item.actual)}`).join('；') + (resources.length > 3 ? ` 等 ${resources.length} 项。` : resources.length ? '。' : '')
})
const reviewingHistory = computed(() => Boolean(fixedSchedule.value && selectedDate.value < plannerToday.value))
const globalShortestPlanAdopted = computed(() => {
  if (scheduleDifferences.value.goalsChanged) return false
  const optimization = fixedSchedule.value?.result?.optimization
  return optimization?.status === 'optimal' && optimization?.objective === 'overall'
})
const deadlineAlternativePlanAdopted = computed(() => !scheduleDifferences.value.goalsChanged && fixedSchedule.value?.result?.planSource === 'deadline-alternative')
const pendingRecalculation = computed(() => reviewingHistory.value ? false : pendingScheduleEdits(fixedSchedule.value, selectedDate.value))
const scheduleTiming = computed(() => plannerTiming(plannerSimulation.value, fixedSchedule.value?.baselineDate || plannerStartDate.value, plannerToday.value))
const plannerTimeline = computed(() => fixedSchedule.value ? visibleFixedScheduleTimeline(fixedSchedule.value) : plannerSimulation.value.timeline)
const plannerCycleDays = computed(() => Math.min(plannerRules.maxEtaDays, Math.max(1, plannerTimeline.value.length, dateOffset(selectedDate.value) + 1)))
const allPlannerDates = computed(() => [...new Set([
  ...(fixedSchedule.value ? plannerTimeline.value.map(day => day.date) : Array.from({ length: plannerCycleDays.value }, (_, index) => addDays(plannerStartDate.value, index))),
  ...(customRules.value.length ? Array.from({ length: 90 }, (_, index) => addDays(plannerToday.value, index)) : []),
  ...Object.keys(manualPlans.value).filter(date => !fixedSchedule.value?.context.displayStartDate || date >= fixedSchedule.value.context.displayStartDate)
])].sort())
const pastScheduleCount = computed(() => allPlannerDates.value.filter(date => date < plannerToday.value).length)
const plannerDates = computed(() => {
  if (!hidePastSchedule.value) return allPlannerDates.value
  const future = allPlannerDates.value.filter(date => date >= plannerToday.value)
  return future.length ? future : [plannerToday.value]
})
const derivedPreviewDates = computed(() => customRules.value.length ? allPlannerDates.value.filter(date => date >= plannerToday.value && !manualPlans.value[date] && !plannerTimeline.value.some(day => day.date === date)) : [])
const cloudStatusLabel = computed(() => {
  if (cloudLoading.value || scheduleLoading.value) return '正在读取云端计划…'
  if (cloudError.value || workspaceState.value.error || scheduleState.value.error) return '云端同步未完成，请处理下方提示'
  if (workspaceState.value.saving || scheduleState.value.saving) return '正在保存到云端…'
  if (workspacePending.value || schedulePending.value) return '修改等待云端保存'
  if (derivedPreviewDates.value.includes(selectedDate.value)) return '每日规则已保存；当前日期为派生预览，尚未保存该日日程'
  return fixedSchedule.value ? '日程已保存到云端' : '计划与日程按子账号保存到云端'
})
const plannerCycleNotice = computed(() => {
  if (scheduleDifferences.value.goalsChanged) return '清单或培养目标已变更，当前显示的是更新前的日程。'
  if (deadlineAlternativePlanAdopted.value) return '已采用期限补足方案；当前日程按所选期限固定，具体补体力、购买与派遣安排请以每日方案为准。'
  const result = plannerSimulation.value
  if (result.optimization) {
    const proof = result.optimization
    return proof.status === 'optimal'
      ? `已采用从 ${formatLongDate(proof.fromDate)} 起的${proof.objective === 'priority' ? '按清单顺序全局最优' : '全局最短'}方案；结论基于当前规则与固定安排。`
      : '当前方案可完成培养目标，但不保证耗时最短。'
  }
  if (result.awaitingRecalculation) return '体力获取与支出已修改；现有安排尚未备齐材料，点击「重新计算当日及后续日程」可更新推荐。'
  if (result.status === 'invalid') return '日程包含体力不足、次数超限或未开放层数；无效日不计入产出，后续模拟暂停，请先修正。'
  if (result.status === 'blocked') return (result.lastProgressDay ? '从计算基准日起，可模拟部分推进至第 ' + result.lastProgressDay + ' 天。' : '') + '剩余缺口无法由当前已配置渠道继续补齐，详见培养推进；增加体力不一定能解决。'
  if (result.status === 'horizon') return '快速估算未能在起算日起 90 天内备齐材料，可调整条件或计算更优方案；这不表示目标无法完成。'
  return '材料备齐即停止推荐；当前推荐为快速估算。'
})
const futureManualCount = computed(() => Object.keys(manualPlans.value).filter(date => date > selectedDate.value).length)
const outsideManualDates = computed(() => Object.keys(manualPlans.value).filter(date => date >= (fixedSchedule.value?.context.displayStartDate || plannerStartDate.value) && !plannerTimeline.value.some(day => day.date === date)).sort())
const currentDay = computed(() => {
  const day = plannerTimeline.value.find(item => item.date === selectedDate.value)
  if (day) return day
  const start = plannerTimeline.value.at(-1)?.end || plannerInitialState.value
  const options = { groups: TRAINING_GROUPS, levels: plannerLevels.value, strategy: strategy.value, agentOrder: plannerOrderForOptimization.value }
  const recommended = buildRecommendedPlan({ ...options, state: start, preferences: plannerPreferences.value, date: selectedDate.value })
  const planned = manualPlans.value[selectedDate.value] ? mergeCustomSpendRules(manualPlans.value[selectedDate.value], customRules.value, selectedDate.value) : recommended
  const settled = settlePlannerDay(start, planned, options)
  const paused = plannerSimulation.value.status === 'invalid'
  return { date: selectedDate.value, start, recommended, manual: Boolean(manualPlans.value[selectedDate.value]), ...settled,
    ...(paused ? { paused: true, end: start, yield: {}, used: {}, surplus: {} } : {}) }
})
const planBadgeLabel = computed(() => !plannerTimeline.value.some(day => day.date === selectedDate.value) && customRules.value.length && !currentDay.value.manual ? '每日规则预览 · 未保存日程' : deadlineAlternativePlanAdopted.value ? '期限补足方案' : currentDay.value.manual ? '自定义计划' : '自动推荐方案')
const currentDateLabel = computed(() => formatLongDate(currentDay.value.date))
const todayTotals = computed(() => planTotals(currentDay.value.planned))
function isRoutineGain(gain) { return gain.id === 'natural' || gain.id === 'meal' }
const routineDayGains = computed(() => currentDay.value.planned.gains.filter(isRoutineGain))
const actionDayGains = computed(() => currentDay.value.planned.gains.filter(gain => !isRoutineGain(gain)))
const basePlan = computed(() => plannerBasePlan(fixedSchedule.value, currentDay.value))
const recommendedTotals = computed(() => planTotals(basePlan.value))
const exactAgentNames = computed(() => Object.fromEntries(orderedPlanRows.value.map(row => [row.id, row.name || row.id])))
const exactPlannerInput = computed(() => {
  const context = { ...liveScheduleContext.value, accountId: props.accountId, planId: activePlan.value?.id }
  if (!goalMode.value && scheduleDifferences.value.goalsChanged) return null
  if (goalMode.value) return {
    ...context, objective: 'coins', initialState: plannerInitialState.value, manualPlans: {},
    dates: Array.from({ length: Math.min(90, Math.max(1, Math.trunc(Number(goalDays.value)) || 1)) }, (_, index) => addDays(plannerToday.value, index)),
    initialExtra: Math.max(0, Number(goalInitialExtra.value) || 0),
    reserveSources: goalReserveSources.value.map(source => ({ ...source, mode: 'flexible', date: plannerToday.value }))
  }
  const baseline = fixedSchedule.value?.baselineDate || plannerToday.value
  const offset = Math.round((Date.parse(selectedDate.value + 'T00:00:00Z') - Date.parse(baseline + 'T00:00:00Z')) / 86400000)
  return { ...context, objective: strategy.value, initialState: currentDay.value.start,
    firstDay: currentDay.value.planned, manualPlans: manualPlans.value,
    dates: Array.from({ length: Math.max(0, 90 - Math.max(0, offset)) }, (_, index) => addDays(selectedDate.value, index)) }
})
const hasUnknownRequirements = computed(() => planRows.value.some(row => row.calculation.star.unsupported || row.calculation.sharedUnsupported))
const plannerEtaLabel = computed(() => loading.value ? '同步中' : error.value ? '库存未同步' : hasUnknownRequirements.value ? '材料规则未知 · 暂不估算'
  : scheduleDifferences.value.goalsChanged ? '旧方案待更新' : scheduleTiming.value.remainingDays == null ? simulationLabel(plannerSimulation.value)
    : scheduleTiming.value.remainingDays === 0 ? (fixedSchedule.value ? '按计划应已备齐' : '材料已备齐') : formatEta(scheduleTiming.value.remainingDays))
const plannerEtaExplanation = computed(() => {
  if (loading.value || error.value) return '等待库存同步后估算。'
  if (hasUnknownRequirements.value) return '完整目标耗时暂不估算；日程仅安排等级、修为及已知化极材料。'
  if (scheduleDifferences.value.goalsChanged) return '清单或目标已变化，请更新日程后查看新预计耗时。'
  const date = scheduleTiming.value.completionDate
  return (date ? `预计 ${formatLongDate(date)} 备齐` : '') 
})
const plannerProgress = computed(() => {
  const required = aggregatePlannerState(plannerRequirementState.value)
  const remaining = aggregatePlannerState(plannerInitialState.value)
  const entries = Object.entries(required).filter(([, need]) => need > 0)
  if (!entries.length) return 100
  const average = entries.reduce((sum, [id, need]) => sum + (1 - (remaining[id] || 0) / need), 0) / entries.length * 100
  return Object.values(remaining).some(value => value > 0) ? Math.min(99, Math.floor(average)) : 100
})
const materialProgressStatus = computed(() => loading.value || targetLoading.value || cloudLoading.value || scheduleLoading.value ? '同步中' : !inventoryReady.value || error.value ? '库存未同步'
  : scheduleDifferences.value.goalsChanged ? '旧方案待更新' : hasUnknownRequirements.value ? '部分规则未知' : '')
const progressItems = computed(() => (currentDay.value.progressRows || plannerProgressRows(plannerRequirementState.value, plannerInitialState.value, currentDay.value,
  { ...currentItems.value, __xp__: experienceStock(currentItems.value) })).map(row => ({ ...row, name: resourceName(row.id), icon: resourceIcon(row.id) })))
const yieldResourceOptions = computed(() => [...new Set(['__xp__', ...Object.keys(aggregatePlannerState(plannerRequirementState.value)),
  ...TRAINING_GROUPS.flatMap(group => group.items?.map(item => item.id) || group.stages.flatMap(stage => Object.keys(stage.rewards)))])]
  .filter(id => !EXPERIENCE_BOOK_IDS.has(id)).map(id => ({ id, name: resourceName(id) })))
function simulationLabel(result) {
  if (planRows.value.some(row => row.calculation.star.unsupported || row.calculation.sharedUnsupported)) return '仅估算已知材料'
  if (result.awaitingRecalculation) return '待重新计算'
  if (result.status === 'invalid') return '日程待修正'
  if (result.status === 'blocked') return '获取途径待补充'
  if (result.status === 'horizon') return '90 天内未备齐'
  return result.etaDays === 0 ? '材料已备齐' : formatEta(result.etaDays)
}
const aggregateMoneyLabel = computed(() => { const money = planRows.value.reduce((sum, row) => sum + Number(row.calculation.total.money || 0), 0); return `${hasUnknownRequirements.value ? '已知部分' : '目标'}五铢钱需求 ${formatNumber(money)}` })
function plannerStateTotal(state) { return Object.values(aggregatePlannerState(state || {})).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) }
function resourceIcon(id) { const key = id === '__xp__' ? 'bingshuquanjuan' : id; return ITEM_CATALOG.some(item => item.id === key) ? (import.meta.env?.BASE_URL || '/') + 'inventory-icons/items/' + encodeURIComponent(key) + '.png' : '' }
function operatorIcon(row) { return row?.id ? (import.meta.env?.BASE_URL || '/') + 'inventory-icons/agents/' + encodeURIComponent(row.id) + '.png' : '' }
function resourceName(id) { return PLANNER_RESOURCE_LABELS[id] || itemMap.value[id] || id }
function addDays(dateText, amount) { return addCalendarDays(dateText, amount) }
function normalizedGoalDays(value = goalDays.value) { const parsed = Math.trunc(Number(value)); return Math.min(PLANNER_RULES.maxEtaDays, Math.max(1, Number.isFinite(parsed) ? parsed : 1)) }
function calendarDayOffset(fromDate, toDate) {
  const from = Date.parse(fromDate + 'T00:00:00Z')
  const to = Date.parse(toDate + 'T00:00:00Z')
  const offset = Math.round((to - from) / 86400000)
  return Number.isFinite(offset) ? offset : null
}
const goalDateMax = computed(() => addDays(plannerToday.value, PLANNER_RULES.maxEtaDays - 1))
const goalCompletionDate = computed(() => addDays(plannerToday.value, normalizedGoalDays() - 1))
const goalDatePickerDays = computed(() => new Date(goalDatePickerYear.value, goalDatePickerMonth.value + 1, 0).getDate())
const goalDatePickerOffset = computed(() => (new Date(goalDatePickerYear.value, goalDatePickerMonth.value, 1).getDay() + 6) % 7)
const goalDatePickerMonthIndex = computed(() => goalDatePickerYear.value * 12 + goalDatePickerMonth.value)
const goalDatePickerMinMonth = computed(() => dateMonthIndex(plannerToday.value))
const goalDatePickerMaxMonth = computed(() => dateMonthIndex(goalDateMax.value))
const goalDatePickerCanPrevious = computed(() => goalDatePickerMonthIndex.value > goalDatePickerMinMonth.value)
const goalDatePickerCanNext = computed(() => goalDatePickerMonthIndex.value < goalDatePickerMaxMonth.value)
function dateMonthIndex(dateText) {
  const [year, month] = String(dateText || '').split('-').map(Number)
  return Number.isFinite(year) && Number.isFinite(month) ? year * 12 + month - 1 : 0
}
function goalDatePickerKey(day) { return `${goalDatePickerYear.value}-${String(goalDatePickerMonth.value + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
function goalDatePickerSelectableBounds() {
  let min = 1, max = goalDatePickerDays.value
  if (goalDatePickerMonthIndex.value === goalDatePickerMinMonth.value) min = Number(plannerToday.value.slice(8, 10))
  if (goalDatePickerMonthIndex.value === goalDatePickerMaxMonth.value) max = Number(goalDateMax.value.slice(8, 10))
  return { min, max }
}
function clampGoalDatePickerDay(day) { const bounds = goalDatePickerSelectableBounds(); return Math.min(bounds.max, Math.max(bounds.min, Number(day) || bounds.min)) }
function isGoalDateSelectable(day) { const date = goalDatePickerKey(day); return date >= plannerToday.value && date <= goalDateMax.value }
async function focusGoalDatePickerDay() { await nextTick(); goalDatePickerRef.value?.querySelector(`[data-goal-day="${goalDatePickerFocusedDay.value}"]`)?.focus() }
function toggleGoalDatePicker() {
  if (goalDatePickerOpen.value) return closeGoalDatePicker()
  const [year, month, day] = goalCompletionDate.value.split('-').map(Number)
  goalDatePickerYear.value = year
  goalDatePickerMonth.value = month - 1
  goalDatePickerFocusedDay.value = clampGoalDatePickerDay(day)
  goalDatePickerOpen.value = true
  focusGoalDatePickerDay()
}
function closeGoalDatePicker(restoreFocus = true) { goalDatePickerOpen.value = false; if (restoreFocus) goalDateTrigger.value?.focus() }
function changeGoalDatePickerMonth(delta) {
  const next = goalDatePickerMonthIndex.value + delta
  if (next < goalDatePickerMinMonth.value || next > goalDatePickerMaxMonth.value) return
  goalDatePickerYear.value = Math.floor(next / 12)
  goalDatePickerMonth.value = next % 12
  goalDatePickerFocusedDay.value = clampGoalDatePickerDay(goalDatePickerFocusedDay.value)
  focusGoalDatePickerDay()
}
function selectGoalDatePickerDay(day) {
  if (!isGoalDateSelectable(day)) return
  setGoalCompletionDate(goalDatePickerKey(day))
  closeGoalDatePicker()
}
function selectGoalDatePickerToday() { setGoalCompletionDate(plannerToday.value); closeGoalDatePicker() }
function moveGoalDatePickerDay(event, day) {
  const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
  if (delta === undefined) return
  event.preventDefault()
  const target = addDays(goalDatePickerKey(day), delta)
  if (target < plannerToday.value || target > goalDateMax.value || dateMonthIndex(target) < goalDatePickerMinMonth.value || dateMonthIndex(target) > goalDatePickerMaxMonth.value) return
  const [year, month, nextDay] = target.split('-').map(Number)
  goalDatePickerYear.value = year
  goalDatePickerMonth.value = month - 1
  goalDatePickerFocusedDay.value = nextDay
  focusGoalDatePickerDay()
}
function setGoalCompletionDate(dateText) {
  const offset = calendarDayOffset(plannerToday.value, dateText)
  if (offset == null) return
  goalDays.value = Math.min(PLANNER_RULES.maxEtaDays, Math.max(1, offset + 1))
}
function dateOffset(dateText) { const start = new Date(plannerStartDate.value + 'T12:00:00'); const date = new Date(dateText + 'T12:00:00'); const offset = Math.round((date - start) / 86400000); return Number.isFinite(offset) ? offset : 0 }
function formatLongDate(dateText) { if (!dateText) return '未选择日期'; const [year, month, day] = dateText.split('-'); return year === String(new Date().getFullYear()) ? `${Number(month)}月${Number(day)}日` : `${year}年${Number(month)}月${Number(day)}日` }
function formatNumber(value) { return (Number(value) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }
function formatResource(value) { return formatNumber(value) }
function formatStamina(value) { return formatNumber(Math.round(Number(value) || 0)) }
function signedNumber(value) { const number = Math.round(Number(value) || 0); return number > 0 ? '+' + formatStamina(number) : formatStamina(number) }
function formatEta(days) { if (days == null) return '暂不可估算'; if (days <= 0) return '无需等待'; if (days < 1) return '不足 1 天'; return Math.ceil(days) + ' 天' }
function channelStyle(key) { return { '--channel': channelColors[key] || channelColors.custom } }
function recommendedValue(kind, entry) { return plannerBaseValue(basePlan.value, kind, entry) }
function progress(current, target) { if (current == null || target == null) return 0; const a = Number(current) || 0; const b = Number(target) || 0; return b <= 0 ? 100 : Math.min(100, Math.round(a * 100 / b)) }
function itemName(id) { return id === '__heart__' ? '心纸' : itemMap.value[id] || id }
function materialSummary(requirement) { return Object.keys(requirement?.items || {}).filter(id => requirement.items[id] > 0).slice(0, 3).map(id => itemName(id) + '×' + formatNumber(requirement.items[id])).join('、') }
function experienceStock(stock) { return Math.max(bookExperience(stock), Number(stock?.__experience__) || 0) }
function experienceEtaLabel(gap) { const days = experienceTrainingDays(gap); return days ? '仅刷绝境历练约 ' + days + ' 天' : '' }
function experienceSummary(gap) { return experienceEtaLabel(gap) || '经验道具已备齐' }
function rateFor(id) { return trainingRate(id, workspace.value.trainingLevels) || 0 }
function rateLabel(id) { const training = trainingRate(id, workspace.value.trainingLevels); return training != null ? (training > 0 ? '历练约 ' + formatNumber(training) + '/日' : '所需层数未开放') : '未配置获取途径' }
function materialEtaLabel(row, gap) { if (row.calculation.level.items?.[gap.id]) return '等级突破道具'; const etas = row.calculation.materialEtas || {}; if (Object.prototype.hasOwnProperty.call(etas, gap.id)) { const days = etas[gap.id]; return days == null ? '所需层数未开放' : '约 ' + formatEta(days) } return '暂无模拟产出' }
async function loadRecentHeartHistory(account, endDate) {
  const fromDate = addDays(endDate, -29)
  const toDate = addDays(endDate, 1)
  const from = businessDayStartIso(fromDate)
  const to = businessDayStartIso(toDate)
  if (!from || !to) return {}

  const records = []
  const seenCursors = new Set()
  let cursor = null
  while (true) {
    const page = await listRecords({ accountId: account, entityType: 'agent', from, to, cursor, limit: 100 })
    const items = Array.isArray(page?.items) ? page.items : []
    records.push(...items)
    const next = page?.next_cursor || null
    if (!next || seenCursors.has(next)) break
    seenCursors.add(next)
    cursor = next
  }

  return buildRecentAcquisitionHistory(records, endDate)
}
function heartHistoryFor(row) {
  const history = heartHistory.value[row?.id]
  if (Array.isArray(history?.series) && history.series.length) return history
  return { acquired: 0, series: recentBusinessDayKeys(plannerToday.value).map(date => ({ date, count: 0 })) }
}
function heartSeries(row) { return heartHistoryFor(row).series }
function heartHasRecentAcquisition(row) { return Number(heartHistoryFor(row).acquired) > 0 }
function heartBarHeight(row, point) {
  const max = Math.max(0, ...heartSeries(row).map(item => Number(item.count) || 0))
  const count = Math.max(0, Number(point?.count) || 0)
  return max > 0 && count > 0 ? Math.round(count * 100 / max) + '%' : '0%'
}
function heartHistorySummary(row) {
  if (heartHistoryError.value) return '近30个业务日心纸流水暂不可用'
  if (!heartHistoryReady.value) return '近30个业务日心纸流水同步中'
  return '近30个业务日共获得 ' + formatNumber(heartHistoryFor(row).acquired) + ' 片心纸'
}
function rowGapCount(row) { return row.calculation.gaps.length + (row.calculation.experienceGap > 0 ? 1 : 0) + (row.calculation.heartGap > 0 ? 1 : 0) }
function rowProgress(row) { const level = progress(row.level, row.calculation.sharedTarget.level); const elite = progress(row.elite, row.calculation.sharedTarget.elite); const fate = growthHuajiProgress(row, targetFor(row)); return Math.round((level + elite + fate) / 3) }
function trainingGroupForSpend(spend) { const groupId = spend?.groupId || ({ feng: 'fh', dishui: 'ds', yinyang: 'yy', experience: 'experience' }[spend?.id]); return TRAINING_GROUPS.find(group => group.id === groupId) }

function workspaceCopy() { return JSON.parse(JSON.stringify(workspace.value)) }
async function commitWorkspace(next, notice = '', undoable = false) {
  const previous = workspaceCopy()
  const account = props.accountId, session = workspaceSession.value
  const movies = new Set(props.catalogEntries.filter(isMovieOperator).map(entry => entry.id))
  for (const plan of next.plans || []) {
    for (const [id, target] of Object.entries(plan.targets || {})) {
      if (movies.has(id)) target.starLevel = Math.min(5, Math.max(0, Number(target.starLevel) || 0))
    }
  }
  const saved = await saveWorkspace(next)
  if (props.accountId !== account || session !== workspaceSession.value) return false
  if (saved) { undoWorkspace.value = undoable ? previous : null; planError.value = ''; planNotice.value = notice }
  else planError.value = workspaceState.value.error?.message || '请先处理未完成的云端保存，再修改清单'
  return saved
}
async function selectPlan(id) {
  if (targetBusyIds.value.size || cloudBlocked.value || schedulePending.value) return
  const next = workspaceCopy(); next.activePlanId = id
  if (await commitWorkspace(next)) { closeStarTarget(); targetError.value = ''; targetNotice.value = '' }
}
async function savePlan(draft, onSaved) {
  let next = workspaceCopy()
  const id = draft.id || (draft.source === 'favorites' ? FAVORITES_PLAN_ID : crypto.randomUUID())
  let plan = next.plans.find(item => item.id === id)
  if (!plan) { plan = { id, name: draft.name, source: draft.source === 'favorites' ? 'favorites' : 'custom', operatorIds: [], excludedOperatorIds: [], targets: {} }; next.plans.push(plan) }
  plan.name = draft.name
  if (plan.source === 'favorites') {
    plan.operatorIds = draft.operatorIds.filter(item => !props.favoriteIds.has(item))
    plan.excludedOperatorIds = [...props.favoriteIds].filter(item => !draft.operatorIds.includes(item))
  } else {
    plan.operatorIds = draft.operatorIds
    for (const memberId of draft.operatorIds) if (!plan.targets[memberId]) plan.targets[memberId] = targetFor({ id: memberId, ...currentMap.value[memberId] })
  }
  next.activePlanId = id
  const validIds = new Set(props.catalogEntries.map(entry => entry.id).filter(Boolean))
  const invalidIds = new Set()
  if (validIds.size) next.plans.forEach(item => [...(item.operatorIds || []), ...(item.excludedOperatorIds || []), ...Object.keys(item.targets || {})].forEach(operatorId => { if (!validIds.has(operatorId)) invalidIds.add(operatorId) }))
  if (validIds.size) next = sanitizeTrainingWorkspaceOperators(next, validIds)
  const cleanup = invalidIds.size ? `，已移除 ${invalidIds.size} 位已失效密探` : ''
  if (await commitWorkspace(next, (draft.id ? '清单已保存到云端' : '培养计划已创建') + cleanup)) { closeStarTarget(); onSaved?.() }
}
async function removePlanMember(row) {
  if (!row?.id || targetLoading.value || targetBusyIds.value.size > 0 || removePromptBusy.value) return
  removePromptError.value = ''
  removePromptRow.value = row
  await nextTick()
  removePromptConfirm.value?.focus()
}
function closeRemovePrompt() {
  if (removePromptBusy.value) return
  removePromptRow.value = null
  removePromptError.value = ''
}
async function confirmRemove(graduate) {
  const row = removePromptRow.value
  if (!row || removePromptBusy.value || cloudBlocked.value || schedulePending.value) return
  const account = props.accountId, previous = workspaceCopy()
  removePromptBusy.value = true; removePromptError.value = ''
  try {
    if (await removeMember(activePlan.value.id, row.id, graduate, Number(props.annotationRevisions[row.id]) || 0)) {
      undoWorkspace.value = previous
      planNotice.value = (row.name || row.id) + (graduate ? '已毕业并移出清单；撤销仅恢复清单' : '已移出当前清单，特别关注不变')
      closeStarTarget(); targetNotice.value = ''; removePromptRow.value = null
    }
  } catch (err) {
    if (props.accountId === account) removePromptError.value = '移除未确认成功，已尝试重新同步，请核对清单后重试：' + err.message
  } finally { if (props.accountId === account) removePromptBusy.value = false }
}
async function removePlan(onRemoved) {
  if (!activePlan.value || targetBusyIds.value.size) return
  const next = workspaceCopy()
  const removedIndex = next.plans.findIndex(plan => plan.id === activePlan.value.id)
  next.plans = next.plans.filter(plan => plan.id !== activePlan.value.id)
  next.activePlanId = next.plans[Math.min(Math.max(removedIndex, 0), next.plans.length - 1)]?.id || null
  if (await commitWorkspace(next, '培养清单已删除', true)) { closeStarTarget(); targetNotice.value = ''; onRemoved?.() }
}
function undoPlanChange() { if (undoWorkspace.value) commitWorkspace(JSON.parse(JSON.stringify(undoWorkspace.value)), '已恢复清单') }
const dailySourcesRef = ref(null)
const repeatLastDate = computed(() => plannerDateAfter(fixedSchedule.value?.baselineDate || plannerToday.value, PLANNER_RULES.maxEtaDays - 1))
const pendingRoutineSave = ref(null)
async function saveCommonSpends(items, done) {
  const owner = templateOwner.value
  try {
    const ok = await commonSpends.save(items)
    done(ok && owner === templateOwner.value)
    if (owner !== templateOwner.value) return
    if (ok) { planError.value = ''; planNotice.value = '常用支出已保存，同一大账号下的子账号均可选用' }
    else planError.value = templateError.value || '常用支出尚未确认保存，请从管理常用支出入口恢复'
  } catch (err) { if (owner === templateOwner.value) planError.value = err.message; done(false) }
}
async function pinCustomSpend(spend) {
  try {
    const item = customSpendTemplate(spend)
    if (commonSpendTemplates.value.some(template => template.id === item.id)) { templateManagerRef.value?.open(item.id); return }
    const items = commonSpendTemplates.value.concat(item)
    await saveCommonSpends(items, () => {})
  } catch (err) { planError.value = err.message }
}
async function recoverCommonSpends(action, done) {
  const ok = await commonSpends[action]()
  await nextTick()
  done(Boolean(ok))
}
function addCommonSpend(item) {
  const { next, plan } = ensureManualPlan()
  const existing = plan.spends.find(spend => spend.id === item.id)
  const spend = existing || customSpendFromTemplate(item)
  if (existing) existing.value += 1
  else plan.spends.push(spend)
  finishSpendAddition(next, spend, Boolean(existing))
}
function restoreDailyRule(id) {
  const { next, plan } = ensureManualPlan()
  plan.customSpendOverrides = (plan.customSpendOverrides || []).filter(item => item !== id)
  next[selectedDate.value] = mergeCustomSpendRules(plan, customRules.value, selectedDate.value)
  commitManualPlan(next, id)
}
const customDailySnapshotKey = () => JSON.stringify([customDailyContext.value, plannerToday.value, fixedSchedule.value, manualPlans.value, plannerPreferences.value])
function previewCustomDaily(request, done) {
  try {
    if (scheduleActionBlocked.value || goalMode.value || scheduleDifferences.value.goalsChanged) throw new Error('请先处理当前日程，再打开每日安排')
    if (request.version.fromDate < plannerToday.value || request.version.fromDate > customDailyLastDate.value) throw new Error('请选择当前90天内的生效日期')
    const rules = replaceCustomSpendRule(customRules.value, request.id, request.version)
    const schedule = fixedSchedule.value || createFixedSchedule(liveScheduleContext.value, manualPlans.value)
    const next = applyCustomSpendRulesToSchedule(schedule, manualPlans.value, rules, plannerToday.value, request.version.fromDate)
    const fromDate = plannerToday.value > schedule.baselineDate ? plannerToday.value : schedule.baselineDate
    const throughDate = plannerDateAfter(fromDate, 89)
    const affected = Object.entries(manualPlans.value).filter(([date]) => date >= request.version.fromDate && date <= throughDate)
    done({ ...next, key: customDailySnapshotKey(), fromDate, throughDate,
      exceptions: affected.filter(([, plan]) => plan.customSpendOverrides?.includes(request.id)).length,
      takeovers: affected.filter(([, plan]) => !plan.customSpendOverrides?.includes(request.id) && plan.spends.some(spend => spend.id === request.id)).length,
      replacedVersions: customRules.value.find(rule => rule.id === request.id)?.versions.filter(version => version.fromDate > request.version.fromDate).length || 0 })
  } catch (err) { done({ error: err.message }) }
}
function applyCustomDaily(next, done) {
  if (scheduleActionBlocked.value || next.key !== customDailySnapshotKey()) { done({ error: '日程已变化，请重新预览' }); return }
  const previous = { schedule: fixedSchedule.value, plans: manualPlans.value, preferences: plannerPreferences.value }
  fixedSchedule.value = next.schedule; manualPlans.value = next.manualPlans; plannerPreferences.value = next.preferences
  if (!persistPlannerSnapshot(false)) {
    fixedSchedule.value = previous.schedule; manualPlans.value = previous.plans; plannerPreferences.value = previous.preferences
    done({ error: '未能保存每日安排，请查看云端恢复提示' }); return
  }
  const finish = ok => { if (ok) planNotice.value = '持续每日安排已保存；单日例外保留'; done(ok ? {} : { error: '云端未确认保存，请处理日程恢复提示后重试' }) }
  if (!schedulePending.value) { finish(!scheduleState.value.error); return }
  pendingRoutineSave.value = { context: { accountId: props.accountId, planId: workspace.value.activePlanId }, done: finish, session: workspaceSession.value }
}
function sameRoutineContext(context) { return context.accountId === props.accountId && context.planId === workspace.value.activePlanId }
async function saveTrainingLevels(levels, context, done) {
  if (!sameRoutineContext(context) || scheduleActionBlocked.value || context.revision !== workspace.value.revision || context.base !== JSON.stringify(workspace.value.trainingLevels)) { done(false); return }
  const next = workspaceCopy(); next.trainingLevels = normalizeTrainingLevels(levels)
  const saved = await commitWorkspace(next)
  if (!sameRoutineContext(context)) { done(false); return }
  if (saved) persistPlannerSnapshot()
  done(saved)
}
function saveRoutinePreferences(preferences, context, done) {
  if (!sameRoutineContext(context) || scheduleActionBlocked.value || context.base !== JSON.stringify(plannerPreferences.value)) { done(false); return }
  const previous = plannerPreferences.value
  plannerPreferences.value = normalizePlannerPreferences(preferences)
  if (!persistPlannerSnapshot()) { plannerPreferences.value = previous; done(false); return }
  if (!schedulePending.value) { done(!scheduleState.value.error); return }
  pendingRoutineSave.value = { context, done, session: workspaceSession.value }
}
watch(() => [schedulePending.value, scheduleState.value.error, workspaceSession.value, workspace.value.activePlanId], () => {
  const pending = pendingRoutineSave.value
  if (!pending) return
  const current = sameRoutineContext(pending.context) && pending.session === workspaceSession.value
  if (current && schedulePending.value && !scheduleState.value.error) return
  pendingRoutineSave.value = null
  pending.done(current && !scheduleState.value.error)
})
function applyPlannerSnapshot(snapshot) {
  closeScheduleAction()
  plannerPreferences.value = snapshot?.preferences || normalizePlannerPreferences()
  strategy.value = snapshot?.strategy || 'overall'
  plannerOrder.value = snapshot?.agentOrder || []
  manualPlans.value = snapshot?.manualPlans || {}
  fixedSchedule.value = snapshot?.schedule || null
  scheduleTimezone.value = fixedSchedule.value ? snapshot?.timezone || BUSINESS_TIMEZONE : BUSINESS_TIMEZONE
  plannerToday.value = plannerDateInZone(BUSINESS_TIMEZONE, new Date(), BUSINESS_DAY_START_HOUR)
  if (!fixedSchedule.value && workspace.value.staminaSources) plannerPreferences.value = withSourcePeriod(plannerPreferences.value, workspace.value.staminaSources, plannerToday.value)
  plannerStartDate.value = snapshot?.schedule?.startDate || plannerToday.value
  if (!plannerDates.value.includes(selectedDate.value)) selectedDate.value = plannerDates.value.includes(plannerToday.value) ? plannerToday.value : plannerDates.value[0]
}
async function saveDailySources(sources, revision, done, scope) {
  if (revision !== workspace.value.revision || scheduleActionBlocked.value) { done(false); return }
  const context = { accountId: props.accountId, planId: workspace.value.activePlanId }
  const session = workspaceSession.value
  let application
  try {
    if (scope === 'monthly') {
      if (!context.planId) throw new Error('请先选择培养清单')
      if (scheduleDifferences.value.goalsChanged) throw new Error('培养目标已变化，请先更新当前日程，再保存月卡')
      const schedule = fixedSchedule.value || createFixedSchedule(liveScheduleContext.value, manualPlans.value)
      const fromDate = schedule.baselineDate > plannerToday.value ? schedule.baselineDate : plannerToday.value
      application = applyDailySourcesToSchedule(schedule, manualPlans.value, sources, fromDate, plannerToday.value, false, { monthlyOnly: true })
    }
  } catch (err) { done(false, err.message); return }
  const next = workspaceCopy(); next.staminaSources = sources
  const same = JSON.stringify(workspace.value.staminaSources) === JSON.stringify(sources)
  const saved = same || await commitWorkspace(next, scope === 'monthly' ? '' : '子账号固定来源已保存；已保存清单请预览并应用')
  if (!sameRoutineContext(context) || session !== workspaceSession.value) { done(false); return }
  if (!saved) { done(false); return }
  if (!application) {
    if (!fixedSchedule.value) plannerPreferences.value = withSourcePeriod(plannerPreferences.value, sources, plannerToday.value)
    done(true); return
  }
  const finish = success => {
    if (success) planNotice.value = '月卡设置已保存，已同步当前方案今天及未来的体力'
    done(success, success ? '' : '月卡设置已保存，方案同步未成功。请关闭面板处理页面的同步提示，再保存月卡重试；无需修改数值。')
  }
  const previous = { schedule: fixedSchedule.value, manualPlans: manualPlans.value, preferences: plannerPreferences.value }
  fixedSchedule.value = application.schedule; manualPlans.value = application.manualPlans; plannerPreferences.value = application.preferences
  dailySourcePreview.value = null
  if (!persistPlannerSnapshot(false)) {
    fixedSchedule.value = previous.schedule; manualPlans.value = previous.manualPlans; plannerPreferences.value = previous.preferences
    finish(false); return
  }
  if (!schedulePending.value) { finish(!scheduleState.value.error); return }
  pendingRoutineSave.value = { context, done: finish, session }
}
function previewDailySources({ fromDate, overwrite }) {
  dailySourcePreview.value = null
  try {
    if (!workspace.value.staminaSources) throw new Error('请先保存子账号固定来源配置')
    if (scheduleDifferences.value.goalsChanged) throw new Error('培养目标已变化，请先更新当前日程')
    const schedule = fixedSchedule.value || createFixedSchedule(liveScheduleContext.value, manualPlans.value)
    const next = applyDailySourcesToSchedule(schedule, manualPlans.value, workspace.value.staminaSources, fromDate, plannerToday.value, overwrite)
    dailySourcePreview.value = { ...next, fromDate, key: dailySourcePreviewKey() }
    planError.value = ''
  } catch (err) { planError.value = err.message }
}
function applyRepeatedSpend(request, context, done, customSpend = null) {
  if (!sameRoutineContext(context) || context.schedule !== fixedSchedule.value || scheduleActionBlocked.value || reviewingHistory.value || goalMode.value || scheduleDifferences.value.goalsChanged) { done(false, '日程或账号已变化，请重新打开设置。'); return }
  if (customSpend && (context.entryId !== customSpend.id || !currentDay.value.planned.spends.some(spend => spend.custom && spend.id === customSpend.id))) { done(false, '自定义项目已变化，请重新打开设置。'); return }
  const previous = { schedule: fixedSchedule.value, manualPlans: manualPlans.value }
  try {
    const schedule = previous.schedule || createFixedSchedule(liveScheduleContext.value, manualPlans.value)
    const next = customSpend ? applyFixedCustomSpendToSchedule(schedule, manualPlans.value, request, plannerToday.value, customSpend)
      : applyFixedStage624ToSchedule(schedule, manualPlans.value, request, plannerToday.value)
    fixedSchedule.value = next.schedule; manualPlans.value = next.manualPlans
    if (!persistPlannerSnapshot(false)) { fixedSchedule.value = previous.schedule; manualPlans.value = previous.manualPlans; done(false); return }
    planNotice.value = `已安排 ${next.affectedDates} 天，每天${customSpend ? customSpend.label : '固定6-24'} ${request.count}次；保存结果以云端提示为准`
    if (!schedulePending.value) { done(!scheduleState.value.error); return }
    pendingRoutineSave.value = { context, done, session: workspaceSession.value }
  } catch (err) { done(false, err.message) }
}
function releaseFixedSpend(index) {
  if (scheduleActionBlocked.value || reviewingHistory.value) return
  const { next, plan } = ensureManualPlan()
  delete plan.spends[index].fixed
  commitManualPlan(next)
  planNotice.value = '已解除当天6-24固定次数；重新计算时可自动调整，其他日期不变。'
}
function applyDailySources() {
  const next = visibleDailySourcePreview.value
  if (!next || cloudBlocked.value || schedulePending.value) return
  const previous = { schedule: fixedSchedule.value, manualPlans: manualPlans.value, preferences: plannerPreferences.value }
  fixedSchedule.value = next.schedule; manualPlans.value = next.manualPlans; plannerPreferences.value = next.preferences
  if (!persistPlannerSnapshot(false)) {
    fixedSchedule.value = previous.schedule; manualPlans.value = previous.manualPlans; plannerPreferences.value = previous.preferences
    return
  }
  dailySourcePreview.value = null
  planNotice.value = `已应用固定来源至 ${next.affectedDates} 个日期，保存状态以云端提示为准`
}
function persistPlannerSnapshot(revise = true) {
  if (cloudBlocked.value) return false
  const previous = fixedSchedule.value
  try {
    if (revise && fixedSchedule.value) fixedSchedule.value = reviseFixedSchedule(fixedSchedule.value, liveScheduleContext.value, manualPlans.value)
    return saveSchedule({ version: 1, accountId: props.accountId, timezone: scheduleTimezone.value,
      strategy: strategy.value, agentOrder: orderedRosterIds.value, preferences: plannerPreferences.value,
      manualPlans: manualPlans.value, schedule: fixedSchedule.value })
  } catch (err) { fixedSchedule.value = previous; planError.value = '体力规划保存失败：' + err.message; return false }
}
function downloadPending(kind) {
  const value = kind === 'workspace' ? workspaceState.value.pending : scheduleState.value.pending
  if (!value) return
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = 'planner-' + kind + '-' + props.accountId + '.json'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function beforeLeave(event) {
  if (workspacePending.value || schedulePending.value || migrationBusy.value) { event.preventDefault(); event.returnValue = '' }
}
function updateSavedSchedule() {
  if (cloudBlocked.value || schedulePending.value || loading.value || targetLoading.value || error.value) return
  const previous = fixedSchedule.value
  fixedSchedule.value = createFixedSchedule(liveScheduleContext.value, manualPlans.value, previous)
  plannerStartDate.value = fixedSchedule.value.startDate
  if (persistPlannerSnapshot(false)) {
    selectedDate.value = plannerToday.value
    planNotice.value = '已按当前库存更新今天及之后的日程，过去的安排已保留'
  } else { fixedSchedule.value = previous; plannerStartDate.value = previous?.startDate || plannerToday.value }
}
function resetSavedSchedule() {
  if (cloudBlocked.value || schedulePending.value || loading.value || targetLoading.value || error.value) return
  const previous = fixedSchedule.value, previousPlans = manualPlans.value, previousStart = plannerStartDate.value
  try {
    const next = resetFixedSchedule(liveScheduleContext.value, previousPlans, previous)
    fixedSchedule.value = next.schedule; manualPlans.value = next.manualPlans
    plannerStartDate.value = next.schedule.startDate
    if (!persistPlannerSnapshot(false)) { fixedSchedule.value = previous; manualPlans.value = previousPlans; plannerStartDate.value = previousStart; return }
    selectedDate.value = plannerToday.value; closeScheduleAction()
    planError.value = ''; planNotice.value = '已从今天按当前库存和清单重新规划，此前阶段不再展示'
  } catch (err) { fixedSchedule.value = previous; manualPlans.value = previousPlans; plannerStartDate.value = previousStart; planError.value = '重设失败：' + err.message }
}
async function setPlannerStep(step, validate = true) {
  if (!plannerSteps.some(item => item.id === step)) return
  if (validate && plannerStep.value === 'conditions' && step === 'comparison') {
    const invalid = [...(plannerConditionsRef.value?.querySelectorAll('.goal-conditions input, .reserve-details input') || [])].find(input => !input.matches(':disabled') && !input.checkValidity())
    if (invalid) { await nextTick(); invalid.reportValidity(); return }
  }
  closeGoalDatePicker(false)
  closeSpendMenu(false); addMenu.value = ''
  plannerStep.value = step
  await nextTick()
  const panel = { conditions: plannerConditionsRef, comparison: plannerComparisonRef, daily: plannerDailyRef }[step]
  panel.value?.focus({ preventScroll: true })
  plannerStepsRef.value?.scrollIntoView({ behavior: 'auto', block: 'start' })
}
function editSchedule(step = 'daily') {
  if (step === 'daily' && reviewingHistory.value) return
  if (reviewingHistory.value) selectedDate.value = plannerDates.value.find(date => date >= plannerToday.value) || selectedDate.value
  viewMode.value = 'edit'
  setPlannerStep(step, false)
}
function openExactOptimizer() { editSchedule('comparison') }
function adoptDeadlineAlternative(outcome) {
  if (scheduleActionBlocked.value || !goalMode.value) return
  const previous = fixedSchedule.value, previousPlans = manualPlans.value
  try {
    const next = applyDeadlineAlternative(previous, outcome, exactPlannerInput.value)
    fixedSchedule.value = next.schedule; manualPlans.value = next.manualPlans
    if (!persistPlannerSnapshot(false)) { fixedSchedule.value = previous; manualPlans.value = previousPlans; return }
    plannerStartDate.value = next.schedule.startDate; selectedDate.value = plannerToday.value
    goalMode.value = false
    setPlannerStep('daily', false)
    planNotice.value = '已采用补足日程，请按每日安排准备额外体力并调整派遣与购买'
  } catch (err) { fixedSchedule.value = previous; manualPlans.value = previousPlans; planError.value = err.message }
}
function adoptExactPlan(outcome) {
  if (cloudBlocked.value || schedulePending.value || loading.value || targetLoading.value || error.value || reviewingHistory.value || scheduleDifferences.value.goalsChanged) return
  const previous = fixedSchedule.value, previousPlans = manualPlans.value, previousPreferences = plannerPreferences.value
  try {
    const base = previous || createFixedSchedule(liveScheduleContext.value, previousPlans)
    const next = applyExactComparisonResult(base, selectedDate.value, outcome, exactPlannerInput.value, previousPlans)
    fixedSchedule.value = next.schedule; manualPlans.value = next.manualPlans; plannerPreferences.value = next.preferences
    if (!persistPlannerSnapshot(false)) { fixedSchedule.value = previous; manualPlans.value = previousPlans; plannerPreferences.value = previousPreferences; return }
    setPlannerStep('daily', false)
    planError.value = ''; planNotice.value = outcome.status === 'optimal' ? '已采用全局最优方案，并保留此前日期与未来手工安排' : '已采用当前可行方案，尚未证明全局最优'
  } catch (err) { fixedSchedule.value = previous; manualPlans.value = previousPlans; plannerPreferences.value = previousPreferences; planError.value = '方案采用失败：' + err.message }
}
function setStrategy(value) { if (scheduleActionBlocked.value) return; strategy.value = value; persistPlannerSnapshot() }
function moveRosterMember(id, delta) {
  if (cloudBlocked.value || schedulePending.value) return
  const ids = [...orderedRosterIds.value]
  const from = ids.indexOf(id), to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return
  ids.splice(from, 1)
  ids.splice(to, 0, id)
  plannerOrder.value = ids
  persistPlannerSnapshot()
}
let rosterSortable, rosterDrag, rosterDragCancelled = false
const rosterDragBlocked = computed(() => cloudBlocked.value || schedulePending.value)
const rosterDragContext = computed(() => JSON.stringify([props.accountId, activePlan.value?.id, viewMode.value, plannerStep.value, orderedRosterIds.value]))
const rosterMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
function updateRosterMotion() { rosterSortable?.option('animation', rosterMotion?.matches ? 0 : 160) }
function cancelRosterDrag() {
  if (!rosterDrag) return
  rosterDragCancelled = true
  document.dispatchEvent(new Event('mouseup', { bubbles: true }))
}
function onRosterDragKeydown(event) {
  if (event.key !== 'Escape' || !rosterDrag) return
  event.preventDefault()
  cancelRosterDrag()
}
function finishRosterDrag(event) {
  if (!rosterDrag) return
  const before = rosterDrag
  // 先还原 Sortable 移动的节点，再交给 Vue 按新顺序更新，保留卡片与输入的对应关系。
  if (before.item.parentNode === rosterSortable.el) rosterSortable.el.insertBefore(before.item, before.next?.parentNode === rosterSortable.el ? before.next : null)
  rosterDrag = null
  document.removeEventListener('keydown', onRosterDragKeydown)
  if (event.newDraggableIndex !== event.oldDraggableIndex && !rosterDragCancelled && !/cancel$/.test(event.originalEvent?.type || '') && !rosterDragBlocked.value && before.context === rosterDragContext.value) {
    moveRosterMember(before.item.dataset.rosterId, event.newDraggableIndex - event.oldDraggableIndex)
  }
  rosterDragCancelled = false
}
watch(rosterList, element => {
  cancelRosterDrag()
  rosterSortable?.destroy()
  rosterSortable = element ? new Sortable(element, {
    draggable: '[data-roster-id]', handle: '.drag-handle, .operator-avatar, .edit-roster-name',
    filter: 'button, input, select, textarea, a', preventOnFilter: false,
    disabled: rosterDragBlocked.value, forceFallback: true, supportPointer: false,
    delay: 200, delayOnTouchOnly: true, touchStartThreshold: 5, fallbackTolerance: 4,
    animation: rosterMotion?.matches ? 0 : 160,
    ghostClass: 'roster-drag-gap', chosenClass: 'roster-drag-chosen', fallbackClass: 'roster-drag-floating',
    scroll: true, forceAutoScrollFallback: true, scrollSensitivity: 60, scrollSpeed: 12,
    onStart(event) {
      rosterDrag = { item: event.item, next: event.item.nextSibling, context: rosterDragContext.value }
      document.addEventListener('keydown', onRosterDragKeydown)
    },
    onMove: () => !rosterDragBlocked.value,
    onEnd: finishRosterDrag,
  }) : null
}, { flush: 'post' })
watch([rosterDragBlocked, rosterDragContext], () => {
  cancelRosterDrag()
  rosterSortable?.option('disabled', rosterDragBlocked.value)
}, { flush: 'sync' })
rosterMotion?.addEventListener?.('change', updateRosterMotion)
onBeforeUnmount(() => {
  cancelRosterDrag()
  rosterSortable?.destroy()
  document.removeEventListener('keydown', onRosterDragKeydown)
  rosterMotion?.removeEventListener?.('change', updateRosterMotion)
})
function selectDate(date) { if (fixedSchedule.value?.context.displayStartDate && date < fixedSchedule.value.context.displayStartDate) return; selectedDate.value = date; closeSpendMenu(false); addMenu.value = '' }
function ensureManualPlan() { const date = selectedDate.value; const current = currentDay.value; const next = clonePlannerValue(manualPlans.value); if (!next[date]) next[date] = normalizePlannerPlan(clonePlannerValue(current.planned)); return { next, plan: next[date] } }
function commitManualPlan(next, restoredId = null) {
  if (cloudBlocked.value || loading.value || targetLoading.value || error.value || reviewingHistory.value) return false
  spendFeedback.value = ''
  const previousPlans = manualPlans.value
  const previousSchedule = fixedSchedule.value
  const previousDay = currentDay.value
  for (const rule of customRules.value) {
    if (rule.id === restoredId) continue
    const before = previousDay.planned.spends.find(item => item.id === rule.id)
    const after = next[selectedDate.value].spends.find(item => item.id === rule.id)
    if (JSON.stringify(before) !== JSON.stringify(after)) markCustomSpendOverride(next[selectedDate.value], customRules.value, rule.id)
  }
  manualPlans.value = next
  try {
    if (!fixedSchedule.value) fixedSchedule.value = createFixedSchedule(liveScheduleContext.value, previousPlans)
    fixedSchedule.value = updateFixedSchedulePlan(fixedSchedule.value, selectedDate.value, next[selectedDate.value], previousDay)
    if (!persistPlannerSnapshot(false)) { manualPlans.value = previousPlans; fixedSchedule.value = previousSchedule; return false }
    planError.value = ''
    return true
  } catch (err) {
    manualPlans.value = previousPlans; fixedSchedule.value = previousSchedule
    planError.value = '体力规划保存失败：' + err.message
    return false
  }
}
function updatePlanValue(kind, index, event) { const { next, plan } = ensureManualPlan(); const value = Math.max(0, Number(event.target.value) || 0); plan[kind][index].value = value; commitManualPlan(next) }
function updateCustomName(kind, index, event) { const { next, plan } = ensureManualPlan(); const value = String(event.target.value || '').trim().slice(0, 32) || (kind === 'gains' ? '自定义来源' : '自定义支出'); plan[kind][index].name = value; plan[kind][index].label = value; commitManualPlan(next) }
function updateSpendCost(index, event) { const { next, plan } = ensureManualPlan(); plan.spends[index].costPer = Math.max(0, Number(event.target.value) || 0); commitManualPlan(next) }
function removePlanRow(kind, index) { const { next, plan } = ensureManualPlan(); plan[kind].splice(index, 1); commitManualPlan(next) }
function toggleAddMenu(kind) {
  if (addMenu.value === kind) { if (kind === 'spend') closeSpendMenu(); else addMenu.value = ''; return }
  if (kind === 'gain') closeSpendMenu(false)
  addMenu.value = kind
  if (kind === 'spend') { spendAddError.value = ''; spendFeedback.value = ''; focusSpendMenu() }
}
function addGain(channelId) { const { next, plan } = ensureManualPlan(); const existing = plan.gains.find(gain => gain.id === channelId && !gain.custom); if (existing) existing.value += createGain(channelId).value; else plan.gains.push(createGain(channelId)); commitManualPlan(next); addMenu.value = '' }
async function recalculateFromCurrentDay() {
  if (scheduleDifferences.value.goalsChanged || !pendingRecalculation.value || cloudBlocked.value || schedulePending.value || loading.value || targetLoading.value || error.value || reviewingHistory.value) return
  const previousSchedule = fixedSchedule.value, previousPlans = manualPlans.value
  try {
    const next = recalculateFixedScheduleFrom(previousSchedule, selectedDate.value, previousPlans, liveScheduleContext.value)
    fixedSchedule.value = next.schedule; manualPlans.value = next.manualPlans
    if (!persistPlannerSnapshot(false)) { fixedSchedule.value = previousSchedule; manualPlans.value = previousPlans; return }
    planError.value = ''
    planNotice.value = `已重新计算 ${formatLongDate(selectedDate.value)} 及之后的日程，原有体力来源与未来手工安排已保留`
    await nextTick()
    plannerWorkspaceRef.value?.focus({ preventScroll: true })
  } catch (err) {
    fixedSchedule.value = previousSchedule; manualPlans.value = previousPlans
    planError.value = '重新计算失败：' + err.message
  }
}
function spendChannelName(spend) { const group = trainingGroupForSpend(spend); return group ? group.name + '历练' : spend.label }
function spendStageName(spend) { const group = trainingGroupForSpend(spend); return group ? (group.id === 'experience' ? group.stages.find(stage => stage.level === spend.stageLevel)?.name || '' : spend.stageLevel + ' 层') : '' }
function focusSpendMenu() {
  nextTick(() => {
    const panel = spendPanelRef.value
    const selector = spendDraft.value ? 'input:not(:disabled)' : pendingTrainingGroup.value ? '.spend-stage-grid button:not(:disabled)' : '.spend-channel-grid button:not(:disabled)'
    const target = panel?.querySelector(selector) || panel?.querySelector('button:not(:disabled)')
    target?.focus()
  })
}
function closeSpendMenu(restoreFocus = true) {
  if (addMenu.value === 'spend') addMenu.value = ''
  // 已入队但未确认的选择只由云端恢复结果清理，关闭不会再次提交。
  if (!pendingSpendAddition.value) { pendingSpendChannel.value = ''; selectedSpendStage.value = null; spendDraft.value = null; spendAddError.value = '' }
  if (restoreFocus) nextTick(() => spendAddRef.value?.focus())
}
function backToSpendChannels() {
  if (pendingSpendAddition.value) { closeSpendMenu(); return }
  pendingSpendChannel.value = ''; selectedSpendStage.value = null; spendDraft.value = null; spendAddError.value = ''; focusSpendMenu()
}
function focusScheduleRecovery() { nextTick(() => document.getElementById('planner-cloud-recovery-schedule')?.focus()) }
function finishSpendAddition(next, spend, merged = false) {
  if (pendingSpendAddition.value || spendBlockedReason.value) { spendAddError.value = spendBlockedReason.value || '本次添加尚未确认，请先恢复保存。'; return }
  spendAddError.value = ''
  const addition = { date: selectedDate.value, spend: clonePlannerValue(spend), merged }
  if (!commitManualPlan(next)) {
    // 本机草稿写入失败也可能留下待恢复请求，必须等待原请求恢复，不能再加一次。
    if (scheduleState.value.pending?.manualPlans?.[addition.date]?.spends.some(item => item.id === spend.id && item.value === spend.value)) pendingSpendAddition.value = addition
    spendAddError.value = planError.value || spendBlockedReason.value || '未能保存本次添加，请保留当前输入，稍后重试。'; return
  }
  pendingSpendAddition.value = addition
  highlightedSpendId.value = spend.id
  spendFeedback.value = ''
}
function addSpend(channelId) {
  if (pendingSpendAddition.value || spendBlockedReason.value) { spendAddError.value = spendBlockedReason.value || '请先恢复本次保存。'; return }
  spendAddError.value = ''
  if (trainingGroupForSpend({ id: channelId })) { pendingSpendChannel.value = channelId; selectedSpendStage.value = null; focusSpendMenu(); return }
  if (channelId === 'custom') { pendingSpendChannel.value = channelId; spendDraft.value = createSpend('custom'); focusSpendMenu(); return }
  if (!SPEND_CHANNELS.some(channel => channel.id === channelId)) { spendAddError.value = '支出渠道不可用，请重新选择。'; return }
  const { next, plan } = ensureManualPlan()
  const existing = plan.spends.find(spend => spend.id === channelId && !spend.custom)
  const spend = existing || createSpend(channelId)
  if (existing) existing.value += 1
  else plan.spends.push(spend)
  finishSpendAddition(next, spend, Boolean(existing))
}
function addTrainingSpend(stageLevel) {
  const group = pendingTrainingGroup.value
  if (!group || !addTrainingStages.value.some(stage => stage.level === stageLevel)) { spendAddError.value = '请选择目前能刷的历练层数。'; return }
  const { next, plan } = ensureManualPlan()
  const existing = plan.spends.find(spend => trainingGroupForSpend(spend)?.id === group.id && spend.stageLevel === stageLevel)
  const spend = existing || { ...createSpend(pendingSpendChannel.value, { stageLevel }), id: 'training-' + group.id + '-' + stageLevel }
  if (existing) existing.value += 1
  else plan.spends.push(spend)
  finishSpendAddition(next, spend, Boolean(existing))
}
function draftNumber(event) { return event.target.value === '' ? NaN : Number(event.target.value) }
function addCustomSpend() {
  const draft = spendDraft.value
  if (!draft) return
  const name = draft.name.trim()
  if (!name || !Number.isFinite(draft.costPer) || draft.costPer < 0 || !Number.isSafeInteger(draft.value) || draft.value < 0 || Object.values(draft.yield).some(value => !Number.isFinite(value) || value < 0)) {
    spendAddError.value = '请填写名称；体力和材料产出须为非负数，次数须为非负整数。'; return
  }
  const spend = createSpend('custom', { ...draft, name, label: name })
  const { next, plan } = ensureManualPlan()
  plan.spends.push(spend)
  finishSpendAddition(next, spend)
}
watch(() => [schedulePending.value, scheduleState.value.error, cloudSnapshot.value], () => {
  const addition = pendingSpendAddition.value
  if (!addition || schedulePending.value || scheduleState.value.error) return
  const saved = cloudSnapshot.value?.manualPlans?.[addition.date]?.spends.find(spend => spend.id === addition.spend.id)
  const confirmed = saved?.value === addition.spend.value
  pendingSpendAddition.value = null
  if (!confirmed) { highlightedSpendId.value = ''; spendAddError.value = ''; spendFeedback.value = '已读取云端，本次添加未保留；可重新选择并添加。'; return }
  spendFeedback.value = `${addition.merged ? '已更新' : '已添加'}${spendChannelName(saved)}${spendStageName(saved) ? ' · ' + spendStageName(saved) : ''}，共 ${saved.value} 次，已保存到云端。`
  highlightedSpendId.value = saved.id
  clearTimeout(spendHighlightTimer)
  spendHighlightTimer = setTimeout(() => { highlightedSpendId.value = '' }, 2400)
  closeSpendMenu(addMenu.value === 'spend')
}, { flush: 'post' })
watch(() => [props.accountId, props.isLoggedIn, workspace.value.activePlanId, selectedDate.value], () => {
  pendingSpendAddition.value = null
  closeSpendMenu(false)
  addMenu.value = ''; spendFeedback.value = ''; highlightedSpendId.value = ''
  clearTimeout(spendHighlightTimer)
})
onBeforeUnmount(() => clearTimeout(spendHighlightTimer))
function updateSpendYield(index, id, event) { const { next, plan } = ensureManualPlan(); plan.spends[index].yield = { ...plan.spends[index].yield, [id]: Math.max(0, Number(event.target.value) || 0) }; commitManualPlan(next) }
function addSpendYield(index, id) { if (!id) return; const { next, plan } = ensureManualPlan(); plan.spends[index].yield = { ...plan.spends[index].yield, [id]: 1 }; commitManualPlan(next) }
function removeSpendYield(index, id) { const { next, plan } = ensureManualPlan(); delete plan.spends[index].yield[id]; commitManualPlan(next) }
function restoreCurrentDay() {
  if (cloudBlocked.value || loading.value || targetLoading.value || error.value || reviewingHistory.value) return
  const previous = fixedSchedule.value, previousPlans = manualPlans.value
  try {
    if (previous) {
      const restored = restoreFixedScheduleDay(previous, selectedDate.value, previousPlans, currentDay.value)
      if (restored.schedule === previous) return
      fixedSchedule.value = restored.schedule
      manualPlans.value = restored.manualPlans
    } else {
      const nextPlans = { ...previousPlans }
      delete nextPlans[selectedDate.value]
      manualPlans.value = nextPlans
    }
    if (persistPlannerSnapshot(false)) planNotice.value = '已恢复当前套用方案的当日安排'
    else { fixedSchedule.value = previous; manualPlans.value = previousPlans }
  } catch (err) {
    fixedSchedule.value = previous; manualPlans.value = previousPlans
    planError.value = '恢复当日方案失败：' + err.message
  }
}
function clearFutureManualPlans() { const removed = futureManualCount.value; manualPlans.value = Object.fromEntries(Object.entries(manualPlans.value).filter(([date]) => date <= selectedDate.value)); persistPlannerSnapshot(); planNotice.value = removed ? `已清除后续 ${removed} 个固定日，推荐会自动重算` : '未来推荐本来就会随设置自动刷新' }
function openPlanner(mode = 'display', returnToDay = false) {
  plannerOpen.value = true
  if (mode === 'edit') { editSchedule('conditions'); return }
  viewMode.value = 'display'; goalMode.value = false
  nextTick(() => {
    const target = returnToDay ? dayEditRef.value || dayPlanRef.value : plannerWorkspaceRef.value
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ behavior: 'auto', block: returnToDay ? 'nearest' : 'start' })
  })
}
function toggleSettings() { plannerOpen.value = true; editSchedule('conditions') }

function normalizedTargetItem(item) { return { huaji: item.huaji || null, level: item.level == null ? null : Number(item.level), elite: item.elite == null ? null : Number(item.elite), starLevel: (item.star_level != null ? item.star_level : item.starLevel) == null ? null : Number(item.star_level != null ? item.star_level : item.starLevel), revision: Number(item.revision) || 0 } }
function targetStorageKey() { return 'yuanhub:operator-targets:' + props.accountId }
function targetMigrationKey() { return 'yuanhub:operator-targets-migrated:v1:' + props.accountId }
function readLocalTargets() { if (typeof localStorage === 'undefined' || !props.accountId) return {}; try { const parsed = JSON.parse(localStorage.getItem(targetStorageKey()) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {} } catch (_) { return {} } }
function cacheTargets() { if (typeof localStorage !== 'undefined' && props.accountId) try { localStorage.setItem(targetStorageKey(), JSON.stringify(targets.value)) } catch (_) {} }
function targetErrorMessage(err, fallback) { if (err?.code === 'growth_target_revision_conflict') return '养成目标已在其他页面更新，已重新同步'; if (err?.code === 'invalid_growth_target') return '目标数值或组合不符合要求'; return err?.message || fallback }
function applyTargetItem(id, item) { if (id && item) targets.value = { ...targets.value, [id]: normalizedTargetItem(item) } }
async function migrateLocalTargets(targetAccount, remoteIds) { if (typeof localStorage === 'undefined' || localStorage.getItem(targetMigrationKey()) === 'done') return; const local = readLocalTargets(); for (const id of Object.keys(local).filter(item => !remoteIds.has(item))) { const saved = local[id] || {}; const body = { expected_revision: 0 }; if (saved.level != null) body.level = Number(saved.level); if (saved.elite != null) body.elite = Number(saved.elite); if (saved.huaji || saved.starLevel != null || saved.star_level != null) { const row = { ...props.catalogEntries.find(entry => entry.id === id), ...currentMap.value[id] }; body.huaji = normalizeGrowthTarget(row, { ...saved, starLevel: saved.starLevel ?? saved.star_level }).huaji }; if (Object.keys(body).length === 1) continue; const item = await putOperatorGrowthTarget({ accountId: targetAccount, operatorId: id, target: body }); if (props.accountId !== targetAccount) return; applyTargetItem(id, item) } localStorage.setItem(targetMigrationKey(), 'done') }
async function loadTargets() { closeStarTarget(); targets.value = {}; targetBusyIds.value = new Set(); targetError.value = ''; if (!props.isLoggedIn || !props.accountId) { targetLoadSeq += 1; targetLoading.value = false; return } const account = props.accountId; const sequence = ++targetLoadSeq; targetLoading.value = true; try { const data = await getOperatorGrowthTargets(account); if (sequence !== targetLoadSeq || props.accountId !== account) return; const mapped = {}; const remoteIds = new Set(); (Array.isArray(data?.items) ? data.items : []).forEach(item => { const id = item?.operator_id || item?.operatorId; if (id) { remoteIds.add(id); mapped[id] = normalizedTargetItem(item) } }); targets.value = mapped; await migrateLocalTargets(account, remoteIds); if (sequence === targetLoadSeq && props.accountId === account) cacheTargets() } catch (err) { if (sequence !== targetLoadSeq || props.accountId !== account) return; targets.value = readLocalTargets(); targetError.value = targetErrorMessage(err, '养成目标同步失败，当前显示本地缓存') } finally { if (sequence === targetLoadSeq && props.accountId === account) targetLoading.value = false } }
function resetTargetInput(row, field, event) { event.target.value = targetFor(planRows.value.find(item => item.id === row.id) || row)[field] }
async function setTarget(row, field, event) {
  const id = row?.id, account = props.accountId, sequence = targetLoadSeq
  if (!id || cloudBlocked.value || schedulePending.value || targetLoading.value || targetBusyIds.value.has(id)) return false
  const current = currentMap.value[id] || {}, target = { ...targetFor(row) }
  const raw = event?.target ? event.target.value : event
  if (event?.target?.validity?.badInput || raw === '') { if (event?.target) resetTargetInput(row, field, event); return false }
  const max = field === 'level' ? 100 : field === 'elite' ? 17 : isMovieOperator(row) ? 5 : operatorHuajiMax(row)
  target[field] = field === 'huaji' ? normalizeGrowthTarget({ ...row, ...current }, { ...target, huaji: raw }).huaji : Math.min(max, Math.max(Number(current[field]) || 0, Math.trunc(Number(raw)) || 0))
  if (field === 'huaji') { target.starLevel = target.huaji.stage; target.awakened = target.huaji.awakened }
  const eliteLimit = getMaxEliteForLevel(target.level)
  if (field === 'elite' || field === 'level') target.elite = Math.max(Number(current.elite) || 0, Math.min(target.elite, eliteLimit))
  if (field === 'starLevel') target.huaji = { owned: target.starLevel > 0, stage: isMovieOperator(row) && target.starLevel > 0 ? 6 * (target.starLevel - 1) + 1 : target.starLevel, awakened: target.huaji?.awakened ?? null }
  if (JSON.stringify(target[field]) === JSON.stringify(targetFor(row)[field])) { if (event?.target) resetTargetInput(row, field, event); return true }
  if (activePlan.value.source === 'custom') {
    const next = workspaceCopy(); next.plans.find(plan => plan.id === activePlan.value.id).targets[id] = target
    const saved = await commitWorkspace(next, (row.name || id) + '的目标已保存到云端')
    if (event?.target && props.accountId === account) { await nextTick(); resetTargetInput(row, field, event) }
    return saved
  }
  const previous = targets.value[id]
  targets.value = { ...targets.value, [id]: target }
  targetBusyIds.value = new Set(targetBusyIds.value).add(id); targetError.value = ''
  try {
    const body = { expected_revision: Number(previous?.revision) || 0 }
    if (field === 'starLevel' || field === 'huaji') body.huaji = { ...target.huaji }
    else body[field] = target[field]
    if (field === 'level' && target.elite !== previous?.elite) body.elite = target.elite
    const item = await putOperatorGrowthTarget({ accountId: account, operatorId: id, target: body })
    if (props.accountId !== account || sequence !== targetLoadSeq) return false
    applyTargetItem(id, item); cacheTargets(); targetNotice.value = (row.name || id) + '的养成目标已同步'
    if (targetNoticeTimer) clearTimeout(targetNoticeTimer)
    targetNoticeTimer = setTimeout(() => { targetNotice.value = '' }, 1800)
    return true
  } catch (err) {
    if (props.accountId !== account || sequence !== targetLoadSeq) return false
    targets.value = { ...targets.value, [id]: previous || defaultTarget() }
    targetError.value = err.message || '养成目标保存失败'
    if (err.status === 409) {
      try {
        const data = await getOperatorGrowthTargets(account)
        if (props.accountId !== account || sequence !== targetLoadSeq) return false
        const latest = (data.items || []).find(item => (item.operator_id || item.operatorId) === id)
        applyTargetItem(id, latest || defaultTarget()); cacheTargets()
        targetError.value = '养成目标已在其他页面更新，已读取云端目标，请核对后重新修改'
      } catch (_) { targetError.value = '养成目标存在冲突，重新同步失败，请刷新后重试' }
    }
    return false
  } finally {
    if (props.accountId === account && sequence === targetLoadSeq) {
      const next = new Set(targetBusyIds.value); next.delete(id); targetBusyIds.value = next
      if (event?.target) { await nextTick(); resetTargetInput(row, field, event) }
    }
  }
}

function flattenCurrent(data) { const result = {}; const rows = Array.isArray(data) ? data : data ? [data] : []; rows.forEach(row => Object.entries(row?.entries || {}).forEach(([id, value]) => { result[id] = Number(value?.count != null ? value.count : value) || 0 })); return result }
async function loadInventory() {
  inventoryReady.value = false
  if (!props.isLoggedIn || !props.accountId) {
    inventoryLoadSeq += 1
    currentItems.value = {}
    currentAgents.value = {}
    heartHistory.value = {}
    heartHistoryReady.value = false
    heartHistoryError.value = false
    loading.value = false
    error.value = ''
    return
  }
  const account = props.accountId
  const sequence = ++inventoryLoadSeq
  const today = plannerDateInZone(BUSINESS_TIMEZONE, new Date(), BUSINESS_DAY_START_HOUR)
  plannerToday.value = today
  if (!fixedSchedule.value && plannerStartDate.value !== today) { plannerStartDate.value = today; selectedDate.value = today }
  loading.value = true
  error.value = ''
  heartHistoryReady.value = false
  heartHistoryError.value = false
  const results = await Promise.allSettled([
    Promise.all([getCurrent({ accountId: account, entityType: 'item' }), getCurrent({ accountId: account, entityType: 'agent' })]),
    loadRecentHeartHistory(account, today)
  ])
  if (sequence !== inventoryLoadSeq || props.accountId !== account) return
  if (results[0].status === 'rejected') {
    error.value = results[0].reason?.message || '当前库存加载失败'
  } else {
    currentItems.value = flattenCurrent(results[0].value[0])
    inventoryReady.value = true
    currentAgents.value = flattenCurrent(results[0].value[1])
  }
  if (results[1].status === 'fulfilled') {
    heartHistory.value = results[1].value
    heartHistoryReady.value = true
  } else {
    heartHistory.value = {}
    heartHistoryError.value = true
  }
  loading.value = false
}
function scheduleInventoryRefresh(message) { const eventAccount = message?.data?.account_id || message?.data?.accountId; if (eventAccount && eventAccount !== props.accountId) return; if (inventoryEventRefreshTimer != null) return; inventoryEventRefreshTimer = setTimeout(() => { inventoryEventRefreshTimer = null; loadInventory() }, 180) }
function syncPlannerClock() {
  const today = plannerDateInZone(BUSINESS_TIMEZONE, new Date(), BUSINESS_DAY_START_HOUR)
  if (plannerToday.value === today) return
  plannerToday.value = today
  if (!fixedSchedule.value) { plannerStartDate.value = today; selectedDate.value = today }
}
function refreshSnapshot() { syncPlannerClock(); emit('refresh-operators'); refreshCloud(); loadInventory() }
function scheduleTargetRefresh() {
  if (targetEventRefreshTimer != null) return
  targetEventRefreshTimer = setTimeout(() => {
    targetEventRefreshTimer = null
    if (targetBusyIds.value.size) scheduleTargetRefresh()
    else loadTargets()
  }, 180)
}
function handleInventoryEvent(message) {
  if (!message) return
  const account = message.data?.account_id || message.data?.accountId
  if (account && account !== props.accountId) return
  if (message.event === 'account_stream_open' && !message.data?.reconnected) return
  if (['operator_training_workspace', 'operator_stamina_schedule', 'account_stream_open'].includes(message.event)) refreshCloud()
  if (['operator_growth_target', 'account_stream_open'].includes(message.event)) scheduleTargetRefresh()
  if (['inventory_import', 'account_stream_open', 'operator_scan_import', 'operator-upgrade'].includes(message.event)) scheduleInventoryRefresh(message)
}

watch(() => [props.accountId, props.isLoggedIn], () => { reserveOpen.value = false; inventoryReady.value = false; currentItems.value = {}; currentAgents.value = {}; closeStarTarget(); undoWorkspace.value = null; planError.value = ''; planNotice.value = ''; removePromptRow.value = null; removePromptBusy.value = false; dailySourcePreview.value = null; goalMode.value = false; goalDays.value = 10; goalInitialExtra.value = 0; goalReserveSources.value = []; closeGoalDatePicker(false) }, { immediate: true })
watch(() => [props.accountId, props.isLoggedIn, props.refreshKey, props.active], () => { if (props.active) { syncPlannerClock(); emit('refresh-operators'); loadTargets(); loadInventory() } }, { immediate: true })
watch(cloudSnapshot, applyPlannerSnapshot)
watch(() => [plannerStep.value, goalMode.value], ([step, mode]) => { if (step !== 'conditions' || !mode) closeGoalDatePicker(false) })
watch(scheduleTimezone, () => { if (props.active) loadInventory() })
watch(() => [loading.value, targetLoading.value, activePlan.value?.id, scheduleLoading.value], () => {
  if (cloudBlocked.value || schedulePending.value || loading.value || targetLoading.value || error.value || !props.isLoggedIn || !planRows.value.length || fixedSchedule.value || !Object.keys(manualPlans.value).length) return
  fixedSchedule.value = createFixedSchedule(liveScheduleContext.value, manualPlans.value)
  plannerStartDate.value = fixedSchedule.value.startDate
  persistPlannerSnapshot(false)
})
watch(() => plannerDates.value, dates => { if (!dates.includes(selectedDate.value)) selectedDate.value = dates[0] }, { immediate: true })
onMounted(() => { plannerClockTimer = setInterval(syncPlannerClock, 30000); window.addEventListener('focus', syncPlannerClock); window.addEventListener('beforeunload', beforeLeave); document.addEventListener('pointerdown', dismissStarTarget); document.addEventListener('focusin', dismissStarTarget); unsubscribeAccountEvents = subscribeAccountEvents(handleInventoryEvent) })
onBeforeUnmount(() => { clearInterval(plannerClockTimer); window.removeEventListener('focus', syncPlannerClock); window.removeEventListener('beforeunload', beforeLeave); document.removeEventListener('pointerdown', dismissStarTarget); document.removeEventListener('focusin', dismissStarTarget); if (targetNoticeTimer) clearTimeout(targetNoticeTimer); if (inventoryEventRefreshTimer != null) clearTimeout(inventoryEventRefreshTimer); if (targetEventRefreshTimer != null) clearTimeout(targetEventRefreshTimer); if (unsubscribeAccountEvents) unsubscribeAccountEvents() })
</script>

<style scoped>
.planner-save-toast { position: fixed; left: max(12px, env(safe-area-inset-left)); right: max(12px, env(safe-area-inset-right)); bottom: calc(12px + env(safe-area-inset-bottom)); z-index: var(--z-sticky-controls); display: flex; align-items: center; gap: 12px; max-width: 460px; min-height: 58px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--ink); box-shadow: 0 4px 16px rgba(var(--theme-shadow-rgb, 73, 59, 44), .16); }
.planner-save-icon { flex: none; color: var(--theme-accent-text, var(--accent-strong)); }
.planner-save-icon.is-success { color: var(--theme-success-text, #5f8568); }
.planner-save-icon.is-error { color: var(--theme-danger-text, var(--rouge)); }
.planner-save-copy { flex: 1; min-width: 0; display: grid; gap: 2px; font-size: 14px; line-height: 1.35; }
.planner-save-copy strong { font-weight: 700; }
.planner-save-copy span { color: var(--ink-60); font-size: 12px; }
.planner-save-retry { flex: none; padding: 7px 12px; border: 1px solid var(--theme-danger-line, var(--rouge)); border-radius: 8px; background: transparent; color: var(--theme-danger-text, var(--rouge)); font: inherit; font-weight: 700; cursor: pointer; }
.planner-save-retry:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
@media (min-width: 600px) { .planner-save-toast { left: 50%; right: auto; width: min(460px, calc(100% - 32px)); transform: translateX(-50%); } }
.custom-rule-list { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0; font-size: 13px; color: var(--ink); }
.custom-rule-list > span { font-weight: 700; }
.spend-channel-grid .common-spend-label { white-space: normal; overflow-wrap: anywhere; }
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.growth-tracker { border: 1px solid var(--line); border-radius: 22px; background: var(--surface); color: var(--ink); }
.planner-cloud-fields { border: 0; }
.cloud-status { color: var(--ink-60); }
.cloud-recovery, .cloud-migration { border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
.cloud-recovery { color: var(--theme-danger-text, var(--rouge)); }
.cloud-actions button, .cloud-recovery > button { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); }
.planner-heading { border-bottom: 1px dashed var(--line); }
.section-kicker, .card-kicker, .goal-kicker { color: var(--theme-accent-text, var(--accent-strong)); }
.planner-heading h2 { color: var(--ink); }
.planner-heading p { color: var(--ink-60); }
button { cursor: pointer; }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.planner-refresh { border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); }
.planner-refresh:hover:not(:disabled) { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.planner-refresh:disabled { opacity: .55; cursor: wait; }
.spin { animation: planner-spin .9s linear infinite; }
@keyframes planner-spin { to { transform: rotate(360deg); } }
.panel, .planner-card { border: 1px solid var(--theme-line, rgba(174, 137, 83, .24)); border-radius: 18px; background: var(--theme-surface, rgba(255, 250, 243, .97)); box-shadow: 0 8px 24px rgba(var(--theme-shadow-rgb, 80, 55, 30), 0.035); }
.planner-state { color: var(--ink-60); }
.planner-state.is-error { border-radius: 12px; background: var(--theme-danger-wash, rgba(166, 81, 74, .07)); color: var(--theme-danger-text, var(--rouge)); }
.planner-state button, .planner-notice button { border: 0; background: transparent; color: var(--theme-accent-text, var(--accent-strong)); text-decoration: underline; }
.planner-state.empty { border: 1px dashed var(--line); border-radius: 12px; }
.planner-error { color: var(--theme-danger-text, var(--rouge)); }
.planner-notice { color: var(--theme-accent-text, var(--accent-strong)); }
.status-metrics { border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface); }
.status-metric { border-left: 1px solid var(--line); background: var(--surface); }
.status-metric:first-child { border-left: 0; }
.status-metric-primary { background: var(--cream); }
.status-metric span { color: var(--ink-60); }
.status-metric strong { color: var(--ink); }
.metric-explanation { color: var(--ink-60); }
.status-metric-primary strong { color: var(--theme-accent-text, var(--accent-strong)); }
.status-metric strong.negative { color: var(--theme-danger-text, var(--rouge)); }
.status-metric strong small { color: var(--theme-accent-text, var(--accent-strong)); }.plan-badge { border: 1px solid var(--theme-line, rgba(155, 122, 70, .12)); border-radius: 999px; background: var(--theme-surface, #f7eddc); color: var(--theme-text, #8a6a38); }.plan-badge.manual { background: var(--theme-purple-bg, #f0e8f6); color: var(--theme-purple-text, #7e6699); }.plan-badge.exact { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }.card-heading h3 { color: var(--ink); }.card-heading p { color: var(--planner-muted); }.gain b, .gain-text, .gain-total b { color: var(--planner-gain); }.spend b, .spend-text, .spend-total b { color: var(--planner-spend); }.coin-spend b { color: var(--theme-accent-text, var(--accent)); }.flow-section + .flow-section { border-top: 1px solid var(--planner-line); }.day-plan .flow-section + .flow-section { border-top: 1px dashed var(--planner-line); }.flow-heading { color: var(--theme-muted, #877462); }.channel-chip { border: 1px solid color-mix(in srgb, var(--channel) 20%, var(--theme-line, #d9cbb9)); border-radius: 11px; background: color-mix(in srgb, var(--channel) 8%, var(--theme-surface, #fffaf4)); color: color-mix(in srgb, var(--channel) 84%, var(--theme-text, #34291f)); }.channel-chip small { color: color-mix(in srgb, var(--channel) 68%, var(--theme-text, #6f6258)); }.channel-dot, .channel-label i, .swatch i { border-radius: 50%; background: var(--channel); }.channel-chip strong { color: var(--planner-gain); }.channel-chip:not(.natural):not(.meal):not(.buy):not(.mail):not(.event):not(.gift) strong { color: var(--planner-spend); }.flow-empty { color: var(--planner-muted); }.balance-warning { border-radius: 9px; background: var(--theme-danger-wash, rgba(166, 81, 74, .07)); color: var(--theme-danger-text, var(--rouge)); }.progress-tag { border: 1px solid var(--theme-line, rgba(155, 122, 70, .1)); border-radius: 10px; background: var(--theme-surface, #f6eee1); color: var(--theme-muted, #8f7b68); }.progress-tag.key { background: var(--theme-purple-bg, #f0e8f6); }.progress-tag b { color: var(--ink); }.progress-item-head, .progress-item-foot { color: var(--planner-muted); }.progress-item-head > span:first-child { color: var(--ink); }.progress-item-head b, .progress-item-foot b { color: var(--planner-gain); }.progress-track { border-radius: 999px; background: var(--theme-surface, #efe4d4); }.progress-current { background: #c48b4d; }.progress-old { background: #c48b4d; }.progress-today { background: #e8bc6c; }.progress-legend { color: var(--planner-muted); }.progress-legend i { border-radius: 99px; }.legend-current { background: #c48b4d; }.legend-old { background: #c48b4d; }.legend-today { background: #e8bc6c; }.planner-footnote { color: var(--ink-60); }.side-section + .side-section { border-top: 1px solid var(--planner-line); }.side-hint { color: var(--planner-muted); }.side-explain, .drag-note, .purchase-note, .side-details p, .field-help, .goal-panel > p { color: var(--planner-muted); }.strategy-switch { border: 1px solid var(--planner-line); border-radius: 10px; background: var(--theme-surface, #f6ecdc); }.strategy-switch button { border: 0; border-radius: 7px; background: transparent; color: var(--theme-muted, #8d7966); }.strategy-switch button.active { background: var(--theme-control-bg, var(--planner-deep)); color: #fff; }.edit-roster-item { border: 1px solid var(--planner-line); border-radius: 10px; background: var(--planner-card); }.edit-roster-item:hover { border-color: var(--accent); }.drag-handle { color: var(--theme-accent-text, #b19f8c); cursor: grab; }.edit-roster-name small { color: var(--planner-muted); }.move-buttons button { border: 1px solid var(--planner-line); border-radius: 5px; background: var(--theme-surface, #f2e6d3); color: var(--theme-muted, #8f7c6b); }.move-buttons button:disabled { opacity: .35; cursor: not-allowed; }.target-fields { border-top: 1px dashed var(--planner-line); }.target-fields label, .setting-line label, .ledger-input-wrap label, .goal-panel label { color: var(--planner-muted); }.target-fields input, .counter input, .ledger-input-wrap input, .goal-panel input { border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); }.setting-line label { color: var(--ink); }.counter { border: 1px solid var(--planner-line); border-radius: 8px; }.counter button { border: 0; background: var(--theme-surface, #f4e9d8); color: var(--ink); }.counter input { border: 0; border-right: 1px solid var(--planner-line); border-left: 1px solid var(--planner-line); border-radius: 0; background: var(--planner-card); }.side-button, .back-button, .action-button { border: 1px solid var(--planner-line); border-radius: 9px; background: var(--planner-card); color: var(--ink); }.side-button:hover, .back-button:hover, .action-button:hover { border-color: var(--accent); }.side-button.primary, .action-button.primary { border-color: var(--planner-deep); background: var(--theme-control-bg, var(--planner-deep)); color: #fff; }.side-button.goal { border-color: var(--theme-purple-line, #e5d8ef); background: var(--theme-purple-bg, #f0e8f6); color: var(--theme-purple-text, #7e6699); }.side-details summary { color: var(--ink); cursor: pointer; }.training-levels label { color: var(--ink-60); }.goal-panel h3 { color: var(--ink); }.goal-panel label { color: var(--ink); }.goal-shortcuts button { border: 1px solid var(--planner-line); border-radius: 8px; background: var(--planner-card); color: var(--planner-muted); }.goal-shortcuts button.active { border-color: var(--planner-deep); background: var(--theme-control-bg, var(--planner-deep)); color: #fff; }.goal-result { border: 1px solid var(--theme-danger-line, rgba(166, 81, 74, .2)); border-radius: 11px; background: var(--theme-danger-wash, rgba(166, 81, 74, .06)); }.goal-result.feasible { border-color: var(--theme-line, rgba(109, 148, 116, .3)); background: var(--theme-wash, rgba(109, 148, 116, .08)); }.goal-result-title { color: var(--ink); }.goal-result p { color: var(--theme-danger-text, var(--rouge)); }.goal-metrics div { border: 1px solid var(--theme-line, rgba(149, 126, 100, .1)); border-radius: 8px; background: var(--theme-wash-strong, rgba(255, 255, 255, .58)); }.goal-metrics span { color: var(--planner-muted); }.goal-metrics b { color: var(--ink); }.ledger-heading h3, .compare-heading h3 { color: var(--ink); }.ledger-heading span, .compare-heading span { color: var(--planner-muted); }.ledger-row { border-top: 1px solid var(--planner-line); }.channel-label { border: 1px solid color-mix(in srgb, var(--channel) 20%, var(--theme-line, #d9cbb9)); border-radius: 8px; background: color-mix(in srgb, var(--channel) 9%, var(--theme-surface, white)); color: color-mix(in srgb, var(--channel) 82%, var(--theme-text, #34291f)); }.ledger-input-wrap input { border: 0; border-bottom: 1px solid var(--theme-line, #cdb997); border-radius: 0; background: transparent; }.ledger-input-wrap > span { color: var(--planner-muted); }.recommendation { color: var(--planner-muted); }.row-remove { border: 0; border-radius: 6px; background: transparent; color: var(--planner-muted); }.row-remove:hover { background: var(--theme-danger-wash, rgba(166, 81, 74, .08)); color: var(--theme-danger-text, var(--rouge)); }.add-button { border: 1px dashed var(--planner-line); border-radius: 8px; background: var(--planner-card); color: var(--planner-muted); }.add-menu { border: 1px solid var(--planner-line); border-radius: 10px; background: var(--planner-card); box-shadow: 0 12px 26px rgba(var(--theme-shadow-rgb, 70, 50, 32), 0.14); }.add-menu button { border: 0; border-radius: 6px; background: transparent; color: var(--theme-strong-text, var(--tea)); }.add-menu button:hover { background: var(--cream); }.ledger-total { border-top: 1px dashed var(--planner-line); color: var(--planner-muted); }.compare-option { border: 1px solid var(--theme-line, rgba(149, 126, 100, .13)); border-radius: 11px; background: var(--planner-card); }.compare-option.active { border-color: var(--theme-line, #d1b88b); background: var(--theme-surface, #f8f1e5); }.compare-option span, .compare-option small, .compare-option em { color: var(--planner-muted); }.compare-option em { color: var(--theme-accent-text, var(--accent-strong)); }.editor-actions p { color: var(--planner-muted); }
@media (max-width: 640px) { .growth-tracker { border-radius: 17px; }.status-metric:nth-child(3), .status-metric:nth-child(4) { border-top: 1px solid var(--planner-line); }.status-metric:nth-child(3) { border-left: 0; } }
/* The planner is a user-facing tool: the status header carries the visual identity,
   followed by the always-visible roster and schedule. */
.status-title h2 { color: var(--ink); }
.status-action, .workspace-link, .workspace-return, .toolbar-button { border: 1px solid var(--planner-line); border-radius: 10px; background: var(--theme-surface, rgba(255, 253, 246, .84)); color: var(--ink); }
.status-action:hover, .workspace-link:hover, .toolbar-button:hover { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.status-sync-note { color: var(--theme-accent-text, var(--accent-strong)); }
.status-rule { color: var(--theme-muted, #9d7c4e); }
.status-rule span { background: linear-gradient(90deg, transparent, var(--theme-wash-strong, rgba(183, 144, 80, .35))); }
.planner-status .status-metric-primary { background: var(--cream); }
.growth-card { border: 1px solid var(--growth-rarity-border); border-top: 3px solid var(--growth-rarity-accent); border-radius: 15px; background: linear-gradient(180deg, var(--growth-rarity-start), var(--surface)); box-shadow: 0 4px 12px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.04); }
.growth-card.complete { border-color: var(--yellow-deep); border-top-width: 3px; background: linear-gradient(160deg, var(--paper), color-mix(in srgb, var(--yellow) 65%, var(--paper))); }
.tracker-remove { border: 1px solid var(--planner-line); border-radius: 8px; background: var(--surface); color: var(--ink-60); }
.tracker-remove:hover:not(:disabled) { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.tracker-dialog-enter-active, .tracker-dialog-leave-active { transition: opacity .2s var(--ease); }
.tracker-dialog-enter-active .tracker-remove-dialog, .tracker-dialog-leave-active .tracker-remove-dialog { transition: transform .2s var(--ease); }
.tracker-dialog-enter-from, .tracker-dialog-leave-to { opacity: 0; }
.tracker-remove-dialog-mask { background: var(--theme-overlay, rgba(73, 59, 44, .5)); backdrop-filter: blur(3px); }
.tracker-remove-dialog { border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 30px 70px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.3); }
.tracker-remove-dialog-head h3 { color: var(--ink); }
.tracker-dialog-close { border: 0; border-radius: 8px; background: transparent; color: var(--planner-muted); }
.tracker-dialog-close:hover:not(:disabled) { background: var(--paper); color: var(--ink); }
.tracker-dialog-close:disabled, .tracker-dialog-button:disabled { opacity: .55; cursor: wait; }
.tracker-remove-dialog-body > svg { color: var(--theme-danger-text, var(--rouge)); }
.tracker-remove-dialog-body p { color: var(--ink); }
.tracker-remove-dialog-body small { color: var(--planner-muted); }
.tracker-remove-dialog-error { color: var(--theme-danger-text, var(--rouge)); }
.tracker-dialog-button { border: 1px solid var(--planner-line); border-radius: 8px; background: var(--paper); color: var(--ink); }
.tracker-dialog-button:hover:not(:disabled) { border-color: var(--accent); color: var(--theme-accent-text, var(--accent-strong)); }
.tracker-dialog-button.discard { border-color: var(--theme-danger-line, rgba(166, 81, 74, .2)); color: var(--theme-danger-text, var(--rouge)); }
.tracker-dialog-button.primary { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.tracker-dialog-button.primary:hover:not(:disabled) { border-color: var(--accent); color: var(--on-strong); }
.growth-complete-status { color: var(--planner-gain); }
.growth-identity :deep(.operator-avatar) { border-radius: 9px; }
.growth-identity :deep(.operator-avatar img) { border-radius: 7px; }
.growth-identity h3 { color: var(--ink); }
.growth-identity p { color: var(--planner-muted); }
.growth-percent { color: var(--planner-deep); }
.growth-card.complete .growth-percent { color: var(--theme-accent-text, #b88507); }
.growth-progress-label { color: var(--planner-muted); }
.growth-progress-side-label { color: var(--planner-muted); }
.growth-progress-label b { color: var(--ink); }
.growth-stage-unit { display: inline-block; white-space: nowrap; }
.growth-progress-row > small { color: var(--planner-muted); }
.growth-progress-row > .growth-limit-note { line-height: 1.5; white-space: normal; }
.heart-gap { color: var(--planner-muted); }
.heart-gap-number { color: var(--theme-danger-text, var(--rouge)); }
.growth-track { border-radius: 99px; background: var(--theme-surface, #efe4d4); }
.growth-track i { border-radius: inherit; background: var(--theme-accent-bg, #c48b4d); transition: width .2s ease; }
.growth-track.mint i { background: var(--theme-success-bg, #88b296); }
.growth-track.rose i { background: var(--theme-danger-bg, #b88ba2); }
.growth-quick-action { border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink-60); cursor: pointer; }
.growth-quick-action:hover:not(:disabled) { border-color: var(--accent); background: var(--yellow); color: var(--ink); }
.growth-quick-action:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.growth-quick-action.is-ready { border-color: var(--theme-success-line, #c9d8c5); background: var(--theme-success-bg, #eef5ec); color: var(--theme-muted, #6f846b); }
.growth-quick-action.is-lack { border-color: var(--theme-line, #e4c49c); background: var(--theme-surface, #fbf1e3); color: var(--theme-accent-text, #a66f2e); }
.growth-quick-action.is-complete, .growth-quick-action:disabled { border-color: var(--line); background: var(--theme-wash, rgba(73, 59, 44, .08)); color: var(--ink-60); opacity: .72; cursor: not-allowed; }
.growth-action-notice { color: var(--theme-accent-text, var(--accent-strong)); }
.growth-materials { border-top: 0; }
.growth-materials summary { color: var(--ink); cursor: pointer; }
.growth-materials summary span { color: var(--planner-muted); }
.growth-breakthrough-materials summary:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.growth-breakthrough-materials .growth-breakthrough-chip { grid-template-columns: 22px minmax(0, 1fr); }
.growth-breakthrough-materials .growth-breakthrough-chip b { white-space: normal; overflow-wrap: anywhere; }
.growth-breakthrough-counts { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 4px 0 0; font-size: 12px; }
.growth-breakthrough-counts dt { color: var(--planner-muted); }
.growth-breakthrough-counts dd { margin: 2px 0 0; font-weight: 700; overflow-wrap: anywhere; }
.growth-material-chip { border-radius: 8px; background: var(--theme-surface, #f8f0e4); color: var(--ink); }
.growth-material-icon { border-radius: 4px; }
.growth-material-chip em { color: var(--theme-danger-text, var(--rouge)); }
.growth-material-chip small { color: var(--planner-muted); }
.experience-chip em { color: var(--theme-accent-text, var(--accent-strong)); }
.heart-history { color: var(--planner-muted); }
.heart-history-bar { border-radius: 2px 2px 0 0; background: var(--accent); opacity: .68; }
.heart-history-empty { color: var(--planner-muted); }
.growth-material-note { color: var(--planner-muted); }
.tracker-editable { border: 0; border-bottom: 1px dashed var(--accent); border-radius: 0; background: transparent; color: var(--ink); }
.tracker-editable:hover:not(:disabled) { color: var(--theme-accent-text, var(--accent-strong)); }
.tracker-editable:focus { border-bottom-color: var(--accent-strong); background: var(--surface); }
.growth-progress-label .tracker-editable:focus-visible { outline: 2px solid var(--theme-focus, var(--brand-blue)); outline-offset: 2px; }
.tracker-editable:disabled, .tracker-star-popover :disabled { opacity: .58; cursor: wait; }
.tracker-number-input { appearance: textfield; cursor: text; }
.tracker-number-input::-webkit-outer-spin-button, .tracker-number-input::-webkit-inner-spin-button { -webkit-appearance: none; }
.tracker-star-trigger { cursor: pointer; }
.tracker-star-popover { border: 1px solid var(--accent); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 25px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.22); }
.tracker-star-popover::before { border-top: 1px solid var(--accent); border-left: 1px solid var(--accent); background: var(--surface); content: ''; }
.tracker-popover-title { color: var(--theme-info-text, var(--brand-blue)); }
.tracker-star-controls select { border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); }
.tracker-popover-actions button { border: 1px solid transparent; border-radius: 5px; background: var(--theme-control-bg, var(--planner-deep)); color: var(--on-strong); }
.tracker-popover-actions button.cancel { background: var(--paper); color: var(--ink-60); }
.tracker-popover-actions button:hover:not(:disabled) { border-color: var(--accent); }
.planner-workspace { border-top: 1px solid var(--theme-line, rgba(183, 144, 80, .28)); }
.plan-heading-actions .plan-icon { border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--ink-60); cursor: pointer; }
.plan-heading-actions .plan-icon:hover:not(:disabled) { background: var(--paper); color: var(--theme-strong-text, var(--tea)); }
.plan-heading-actions .plan-icon:disabled { opacity: .5; cursor: default; }
.plan-heading-actions .plan-icon:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.schedule-action-dialog::backdrop { background: var(--theme-wash-strong, rgba(73, 59, 44, .5)); backdrop-filter: blur(3px); }
.planner-workspace-head h2 { color: var(--ink); }
.planner-workspace-head p { color: var(--planner-muted); }
.workspace-return { color: var(--ink); }
.workspace-return:hover { border-color: var(--rouge); color: var(--theme-danger-text, var(--rouge)); }
.roster-remove { border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--planner-muted); }
.roster-remove:hover { border-color: var(--theme-danger-line, rgba(166, 81, 74, .2)); background: var(--theme-danger-wash, rgba(166, 81, 74, .08)); color: var(--theme-danger-text, var(--rouge)); }
 .planning-panel { border: 1px solid var(--planner-line); border-radius: 14px; background: var(--surface); }
.planning-panel-heading h3 { color: var(--theme-strong-text, var(--tea)); }
.planning-panel-heading p { color: var(--ink-60); }
.conditions-workspace.planning-panel { overflow: visible; }
.conditions-account { border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--theme-strong-text, var(--tea)); }
.planning-mode button { border: 1px solid var(--planner-line); border-radius: 9px; background: var(--cream); color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.planning-mode button.active { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.planning-mode button.goal-mode { border-color: var(--theme-purple-line, #c8b2d6); background: var(--theme-purple-bg, #faf6fc); color: var(--theme-purple-text, #7e6699); }
.planning-mode button.goal-mode.active { border-color: var(--theme-purple-line, #7e6699); background: var(--theme-purple-bg, #f0e8f6); color: var(--theme-purple-text, #69517f); }
.planning-mode button:hover:not(.active) { border-color: var(--tea); }
.planning-mode button.goal-mode:hover:not(.active) { border-color: var(--theme-purple-line, #7e6699); }
.planning-mode button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 1px; }
.planning-condition-summary { color: var(--ink-60); }
 .goal-conditions label { color: var(--ink); }
.goal-conditions input { border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); }
.goal-days-input-wrap { border: 1px solid var(--planner-line); border-radius: 9px; background: var(--cream); }
.goal-days-input-wrap:focus-within { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.goal-days-input-wrap > input { border: 0; border-radius: 8px; background: transparent; appearance: textfield; }
.goal-days-input-wrap > input::-webkit-outer-spin-button, .goal-days-input-wrap > input::-webkit-inner-spin-button { -webkit-appearance: none; }
.goal-date-trigger { border: 0; border-radius: 8px; background: transparent; color: var(--ink); cursor: pointer; }
.goal-date-trigger:hover:not(:disabled) { background: var(--paper); }
.goal-date-trigger:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 1px; }
.goal-date-popover { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); box-shadow: 0 12px 28px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.14); }
.goal-date-popover button { appearance: none; border: 0; border-radius: 8px; background: transparent; color: var(--ink); cursor: pointer; }
.goal-date-popover button:hover:not(:disabled) { background: var(--paper); }
.goal-date-popover button:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 1px; }
.goal-date-popover button:disabled { opacity: .45; cursor: not-allowed; }
.goal-calendar-context { border-bottom: 1px solid var(--line); }
.goal-calendar-context h4 { color: var(--theme-strong-text, var(--tea)); }
.goal-calendar-context p { color: var(--ink-60); }
.goal-calendar-week { color: var(--ink-60); }
.goal-calendar-days button.today { box-shadow: inset 0 0 0 1px var(--line); }
.goal-calendar-days button.selected { background: var(--tea); color: var(--on-strong); }
.goal-calendar-days button:disabled { background: transparent; color: var(--ink-60); }
.goal-today-button { border-top: 1px solid var(--line) !important; border-radius: 0 !important; }
.goal-completion-date { color: var(--ink-60); }
.goal-completion-date time { color: var(--theme-strong-text, var(--tea)); }
.goal-date-help { color: var(--planner-muted); }
 .reserve-management { border-top: 1px solid var(--planner-line); }
.reserve-management h3, .reserve-management h4 { color: var(--theme-strong-text, var(--tea)); }
.reserve-management p { color: var(--ink-60); }
.reserve-total { color: var(--theme-strong-text, var(--tea)); }
.reserve-initial { border-right: 1px solid var(--planner-line); }
.reserve-initial > label { color: var(--ink); }
.reserve-amount span { color: var(--ink-60); }
.reserve-management input { border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); }
@media (max-width: 640px) {.reserve-initial { border-right: 0; border-bottom: 1px solid var(--planner-line); } }
.planner-edit-toolbar > div:first-child > span { color: var(--ink); }
.planner-edit-toolbar > div:first-child small { color: var(--planner-muted); }
.toolbar-button.active { border-color: var(--planner-deep); background: var(--theme-surface, #f6ecdc); }
.toolbar-button.goal { color: var(--theme-purple-text, #7e6699); }
.toolbar-button.goal.active { border-color: var(--theme-purple-line, #c8b2d6); background: var(--theme-purple-bg, #f0e8f6); }
.settings-block-head h3 { color: var(--ink); }
.settings-block-head span { color: var(--planner-muted); }
.setting-help { color: var(--planner-muted); }
.goal-field-help { color: var(--planner-muted); }

@media (prefers-reduced-motion: reduce) { .spin { animation: none; }.progress-track i, .growth-track i { transition: none; } }
.compare-option { color: var(--ink); cursor: pointer; }.compare-option:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }

/* Give each spending channel a stable reading order: category, stage, runs, cost. */
.spend-name b { color: inherit; }
.spend-stage { border: 1px solid color-mix(in srgb, var(--channel) 22%, transparent); border-radius: 5px; background: var(--surface); }
.target-fields label > span:first-child { color: var(--planner-muted); }
.target-fields .progress-values > b { color: var(--ink); }
.target-fields .progress-values > span { color: var(--planner-muted); }
.target-fields .progress-values input { border: 0; border-bottom: 1px dashed var(--accent); border-radius: 0; background: transparent; color: var(--ink); }
.add-menu button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: -2px; }
.spend-draft-form :deep(.custom-entry) { border: 0; background: transparent; }
.spend-add-panel { border: 1px solid var(--planner-line); border-radius: 10px; background: var(--cream); }
.spend-panel-heading h4 { color: var(--ink); }
.spend-back { border: 0; background: transparent; color: var(--planner-muted); }
.spend-channel-grid > button, .spend-stage-grid > button { border: 1px solid var(--planner-line); border-radius: 7px; background: var(--planner-card); color: var(--ink); cursor: pointer; }
.spend-channel-grid > button { border-color: color-mix(in srgb, var(--channel) 25%, var(--planner-line)); background: color-mix(in srgb, var(--channel) 5%, var(--planner-card)); }
.spend-channel-grid .channel-label { border: 0; background: transparent; }
.spend-next-label, .spend-panel-actions, .spend-save-status { color: var(--planner-muted); }
.spend-stage-grid > button[aria-pressed="true"] { border-color: var(--theme-focus, var(--accent)); background: var(--theme-surface, #f7eddc); color: var(--ink); }
.spend-panel-actions b { color: var(--planner-spend); }
.spend-inline-error { color: var(--theme-danger-text, var(--rouge)); }
.spend-inline-error a { color: inherit; text-decoration: underline; }
.spend-added { outline: 1px solid var(--theme-focus, var(--accent)); outline-offset: -1px; background: var(--theme-surface, #f7eddc); border-radius: 8px; }
.spend-add-area :is(button, input, a):focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.spend-add-area button:disabled, .spend-ledger-row :is(button, input):disabled { opacity: .55; cursor: default; }
@media (hover: hover) { .spend-channel-grid > button:hover:not(:disabled), .spend-stage-grid > button:hover:not(:disabled) { border-color: var(--theme-focus, var(--accent)); } }
.schedule-plan-note { color: var(--ink-60); }
.schedule-optimize { border: 0; border-radius: 2px; background: transparent; color: var(--theme-accent-text, var(--accent-strong)); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.schedule-optimize:disabled { opacity: .5; cursor: default; }
.schedule-optimize:active:not(:disabled) { color: var(--theme-strong-text, var(--tea)); }
@media (hover: hover) { .schedule-optimize:hover:not(:disabled) { color: var(--theme-strong-text, var(--tea)); } }
.schedule-update { border-left: 3px solid var(--accent); background: var(--cream); }
.schedule-update strong { color: var(--theme-strong-text, var(--tea)); }.schedule-update p { color: var(--ink-60); }
.schedule-difference-details { color: var(--ink-60); }
.schedule-difference-details summary { cursor: pointer; }

/* Compact execution summary; labels and figures retain a stable reading order. */
.day-totals { border-bottom: 1px dashed var(--planner-line); }
.day-totals > div { border-radius: 8px; background: color-mix(in srgb, var(--paper) 62%, var(--surface)); }
.day-totals dt { color: var(--ink-60); }
.day-totals dd { color: var(--theme-strong-text, var(--tea)); }
.day-totals .gain dd { color: var(--planner-gain); }
.day-totals .spend dd, .day-totals .negative dd { color: var(--theme-danger-text, var(--rouge)); }
.day-totals .coin-spend dd { color: var(--theme-accent-text, var(--accent-strong)); }
.spend-summary { border-top: 1px dashed var(--planner-line); }
.spend-summary .ledger-total { border: 0; }
.spend-balance { color: var(--ink-60); }
.spend-balance strong { color: var(--planner-gain); }
.spend-balance.negative, .spend-balance.negative strong { color: var(--theme-danger-text, var(--rouge)); }
.roster-add { border: 1px dashed var(--planner-line); border-radius: 8px; background: var(--cream); color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.roster-add:disabled { opacity: .55; cursor: default; }
@media (hover: hover) { .roster-add:hover:not(:disabled) { border-color: var(--accent); background: var(--paper); } }
.roster-move-actions button { border: 0; border-radius: 7px; background: transparent; color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
.roster-move-actions button:disabled { opacity: .3; cursor: default; }
.edit-roster-item.roster-drag-gap { border: 2px dashed var(--accent); background: var(--cream); }
.roster-drag-gap > * { opacity: .25; }
.edit-roster-item.roster-drag-chosen { border-color: var(--accent); }
.edit-roster-item.roster-drag-floating { opacity: .96 !important; box-shadow: 0 12px 28px rgba(var(--theme-shadow-rgb, 70, 50, 32), 0.2); cursor: grabbing; }
.roster-drag-floating > * { opacity: 1; }
.edit-roster-name { cursor: grab; }
.roster-toggle:focus-visible, .routine-gains-toggle:focus-visible, .roster-move-actions button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.target-fields .target-field-label { color: var(--ink-60); }
.target-field-label small { color: var(--ink-60); }
.planner-steps button { border: 1px solid var(--planner-line); border-radius: 10px; background: var(--surface); color: var(--ink-60); cursor: pointer; }
.planner-steps button[aria-current="step"] { border-color: var(--tea); background: var(--cream); color: var(--theme-strong-text, var(--tea)); box-shadow: inset 0 -2px var(--accent); }
.step-number { border: 1px solid var(--planner-line); border-radius: 50%; }
[aria-current="step"] .step-number { border-color: var(--tea); background: var(--tea); color: var(--on-strong); }
.planner-steps button:focus-visible { outline: 2px solid var(--theme-focus, var(--accent)); outline-offset: 2px; }
.planner-step-actions { border-top: 1px solid var(--planner-line); }
.planner-step-actions > p { color: var(--ink-60); }
.planner-comparison-step > .planning-condition-summary { background: var(--cream); }
@media (hover: hover) { .roster-move-actions button:hover:not(:disabled), .planner-steps button:hover { background: var(--paper); } }
@media (max-width: 900px) {
  .roster-toggle { border: 0; background: transparent; color: var(--theme-strong-text, var(--tea)); cursor: pointer; }
  .roster-toggle-label small { color: var(--ink-60); }
  .roster-preview :deep(.operator-avatar) { border-radius: 8px; }
  .edit-roster-item > :deep(.operator-avatar) { border-radius: 8px; }
  .planner-sidebar .target-fields .progress-values input { border: 1px solid var(--planner-line); border-radius: 6px; background: var(--surface); }
}
@media (max-width: 640px) {
  .day-plan .flow-heading { color: var(--theme-strong-text, var(--tea)); }
  .day-plan .spend-chips .channel-chip { border: 1px solid var(--planner-line); border-left: 3px solid var(--channel); border-radius: 7px; background: var(--surface); }
  .day-plan .spend-chips .spend-name b { color: var(--ink); }
  .day-plan .spend-chips .spend-stage { background: color-mix(in srgb, var(--channel) 10%, var(--surface)); }
  .routine-gains-toggle { border: 0; background: transparent; color: var(--ink-60); cursor: pointer; }
  .routine-gains-toggle strong { color: var(--theme-strong-text, var(--tea)); }

}

</style>
<style scoped src="./operatorGrowthTrackerDesktop.css"></style>
<style scoped src="./operatorGrowthTrackerMobile.css"></style>
<style scoped src="./plannerConditionCards.css"></style>
