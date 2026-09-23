<template>
  <section class="growth-tracker" :class="{ 'planner-expanded': plannerOpen }" aria-labelledby="growth-tracker-title">
    <header class="planner-heading">
      <div>
        <span class="section-kicker">培养计划 · 体力规划</span>
        <h2 id="growth-tracker-title">把目标总账变成每天能照着执行的安排</h2>
        <p>按材料缺口安排每日体力；自定义日程后保存完整计划，随时回顾过去的安排。</p>
      </div>
      <button class="planner-refresh" type="button" :disabled="loading || !accountId" title="刷新当前库存快照" @click="refreshSnapshot()">
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
        <span>{{ loading ? '同步中' : '刷新库存' }}</span>
      </button>
    </header>

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
              :growth-states="growthStates"
              :account-id="accountId"
              :error="planError"
              :disabled="planPickerDisabled"
              @select="selectPlan"
              @save="savePlan"
              @remove="removePlan"
            />
          </div>
          <div v-if="activePlan" class="status-actions">
            <button type="button" class="status-action secondary" @click="toggleSettings"><SlidersHorizontal :size="15" aria-hidden="true" />调整设置</button>
            <button type="button" class="status-action primary" @click="openPlanner('display')"><CalendarDays :size="15" aria-hidden="true" />查看体力日程</button>
          </div>
        </div>
        <div v-if="activePlan" class="status-metrics" role="group" aria-label="培养进度概览">
          <div class="status-metric status-metric-primary"><span>预计还需</span><strong>{{ plannerEtaLabel }}</strong><p class="metric-explanation">{{ plannerEtaExplanation }}</p></div>
          <div class="status-metric"><span>等级&修为进度</span><strong>{{ plannerProgress }}<small>%</small></strong></div>
          <div class="status-metric"><span>心纸状态</span><strong>{{ formatNumber(totalHeartStock) }}<small> 张</small></strong></div>
          <div class="status-metric"><span>所选日体力结余</span><strong :class="{ negative: todayTotals.balance < 0 }">{{ signedNumber(todayTotals.balance) }}</strong></div>
        </div>
        <p v-if="loading" class="status-sync-note" role="status"><RefreshCw :size="13" class="spin" aria-hidden="true" />正在同步当前库存；已保存的日程会保留，存在差异时可选择更新。</p>
        <div v-if="activePlan" class="status-rule" aria-hidden="true"><span></span><i>养成清单</i><span></span></div>
        <div v-if="activePlan" class="status-roster">
          <div class="growth-card-grid">
              <article v-for="row in orderedPlanRows" :key="row.id" class="growth-card" :class="['rarity-r' + (row.rarity || 3), { complete: row.completed }]">
                <div class="growth-card-head"><div class="growth-identity"><OperatorAvatar :avatar="row.avatar || ''" :name="row.name || row.id" :rarity="Number(row.rarity) || 3" /><div><h3>{{ row.name || row.id }}</h3><p class="growth-identity-meta"><span v-if="profList(row.prof).length" class="growth-prof-list"><span v-for="prof in profList(row.prof)" :key="prof" class="growth-prof"><img :src="profIcon(prof)" alt="" aria-hidden="true" /><span>{{ prof }}</span></span></span><span v-else class="growth-prof-fallback">未知属性</span><span class="growth-identity-separator" aria-hidden="true">·</span><span>{{ firstSubProf(row) || '未标注职业' }}</span></p></div></div><span class="growth-percent"><span class="growth-mobile-status">{{ row.completed ? '已达目标' : '目标进度' }}</span>{{ rowProgress(row) }}<small>%</small></span></div>
                <p v-if="growthActionNotice(row)" class="growth-action-notice" role="status">{{ growthActionNotice(row) }}</p>
                <div class="growth-progress-list">
                  <div class="growth-progress-row">
                    <div class="growth-progress-label"><span>等级</span><div class="progress-values"><span class="growth-progress-side-label">当前</span><b>Lv{{ row.level }}</b><span class="growth-value-divider" aria-hidden="true">/</span><span class="growth-progress-side-label">目标</span><input class="tracker-editable tracker-number-input" type="number" :min="row.level" max="100" step="1" :value="targetFor(row).level" :aria-label="row.name + '的目标等级'" title="点击修改目标等级" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'level', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'level', $event)" /><button v-if="quickUpgradeState(row, 'level', 5, '提升 5 级').visible" type="button" class="growth-quick-action" :class="quickUpgradeState(row, 'level', 5, '提升 5 级').className" :disabled="quickUpgradeState(row, 'level', 5, '提升 5 级').disabled" :aria-label="row.name + '快捷提升等级：' + quickUpgradeState(row, 'level', 5, '提升 5 级').label" :title="quickUpgradeState(row, 'level', 5, '提升 5 级').title" @click="requestQuickUpgrade(row, 'level', 5)"><ChevronUp v-if="quickUpgradeState(row, 'level', 5, '提升 5 级').icon === 'up'" :size="13" aria-hidden="true" /><CircleAlert v-else-if="quickUpgradeState(row, 'level', 5, '提升 5 级').icon === 'alert'" :size="13" aria-hidden="true" /><Check v-else :size="13" aria-hidden="true" /></button></div></div>
                    <div class="growth-track"><i :style="{ width: progress(row.level, targetFor(row).level) + '%' }"></i></div>
                    <OperatorGrowthActionPopover v-bind="growthActionPopoverProps(row, 'level', 5)" @retry="requestQuickUpgrade(row, 'level', 5)" @execute="executeGrowthAction(row, 'level')" @breakthrough-change="changeGrowthBreakthrough(row, $event)" />
                    <small>{{ experienceSummary(row.calculation.experienceGap) }}</small>
                  </div>
                  <div class="growth-progress-row">
                    <div class="growth-progress-label"><span>修为</span><div class="progress-values"><span class="growth-progress-side-label">当前</span><b>{{ row.elite }}</b><span class="growth-value-divider" aria-hidden="true">/</span><span class="growth-progress-side-label">目标</span><input class="tracker-editable tracker-number-input" type="number" :min="row.elite" :max="targetEliteMax(row)" step="1" :value="targetFor(row).elite" :aria-label="row.name + '的目标修为'" title="点击修改目标修为，上限随目标等级调整" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'elite', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'elite', $event)" /><button v-if="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).visible" type="button" class="growth-quick-action" :class="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).className" :disabled="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).disabled" :aria-label="row.name + '快捷提升修为：' + quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).label" :title="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).title" @click="requestQuickUpgrade(row, 'elite', 1)"><ChevronUp v-if="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).icon === 'up'" :size="13" aria-hidden="true" /><CircleAlert v-else-if="quickUpgradeState(row, 'elite', 1, '升至 ' + (row.elite + 1)).icon === 'alert'" :size="13" aria-hidden="true" /><Check v-else :size="13" aria-hidden="true" /></button></div></div>
                    <div class="growth-track mint"><i :style="{ width: progress(row.elite, targetFor(row).elite) + '%' }"></i></div>
                    <OperatorGrowthActionPopover v-bind="growthActionPopoverProps(row, 'elite', 1)" @retry="requestQuickUpgrade(row, 'elite', 1)" @execute="executeGrowthAction(row, 'elite')" />
                    <small>{{ materialSummary(row.calculation.xiuwei) || '无需补充修为材料' }}</small>
                  </div>
                  <div class="growth-progress-row">
                    <div class="growth-progress-label tracker-star-anchor" @keydown.esc.prevent.stop="closeStarTarget(true)"><span>化极</span><div class="progress-values"><span class="growth-progress-side-label">当前</span><b>{{ starLabel(row.starLevel) }}</b><span class="growth-value-divider" aria-hidden="true">/</span><span class="growth-progress-side-label">目标</span><button class="tracker-editable tracker-star-trigger" type="button" :aria-label="row.name + '的目标化极：' + starLabel(targetFor(row).starLevel)" aria-haspopup="dialog" :aria-expanded="starTargetId === row.id" :aria-controls="starTargetId === row.id ? 'tracker-star-target-' + row.id : undefined" title="点击修改目标星级与节点" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @click="openStarTarget(row, $event)">{{ starLabel(targetFor(row).starLevel) }}</button><button v-if="quickUpgradeState(row, 'star', 1, '提升至下一节点').visible" type="button" class="growth-quick-action" :class="quickUpgradeState(row, 'star', 1, '提升至下一节点').className" :disabled="quickUpgradeState(row, 'star', 1, '提升至下一节点').disabled" :aria-label="row.name + '快捷提升化极：' + quickUpgradeState(row, 'star', 1, '提升至下一节点').label" :title="quickUpgradeState(row, 'star', 1, '提升至下一节点').title" @click="requestQuickUpgrade(row, 'star', 1)"><ChevronUp v-if="quickUpgradeState(row, 'star', 1, '提升至下一节点').icon === 'up'" :size="13" aria-hidden="true" /><CircleAlert v-else-if="quickUpgradeState(row, 'star', 1, '提升至下一节点').icon === 'alert'" :size="13" aria-hidden="true" /><Check v-else :size="13" aria-hidden="true" /></button></div>
                      <div v-if="starTargetId === row.id" :id="'tracker-star-target-' + row.id" class="tracker-star-popover" role="dialog" :aria-label="row.name + '的目标化极'"><div class="tracker-popover-title"><Info :size="13" aria-hidden="true" />设置目标星级与节点</div><div class="tracker-star-controls"><select :value="starTargetGroup" aria-label="目标星级" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @change="setStarTargetGroup(row, $event)"><option v-for="group in starGroupsFor(row)" :key="group" :value="group">{{ group === 0 ? '未拥有' : group === 31 ? '觉醒' : group + ' 星' }}</option></select><select v-if="starTargetGroup > 0 && starTargetGroup < 5" v-model.number="starTargetDraft" aria-label="目标节点" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)"><option v-for="stage in starNodesFor(row, starTargetGroup)" :key="stage.value" :value="stage.value">节点 {{ (stage.value - 1) % 6 }}</option></select></div><div class="tracker-popover-actions"><button type="button" class="cancel" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @click="closeStarTarget(true)">取消</button><button type="button" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @click="saveStarTarget(row)">{{ targetBusyIds.has(row.id) ? '保存中…' : '保存目标' }}</button></div></div>
                    </div>
                    <div class="growth-track rose"><i :style="{ width: progress(starStage(row.starLevel), starStage(targetFor(row).starLevel)) + '%' }"></i></div>
                    <OperatorGrowthActionPopover v-bind="growthActionPopoverProps(row, 'star', 1)" @retry="requestQuickUpgrade(row, 'star', 1)" @execute="executeGrowthAction(row, 'star')" />
                    <small class="heart-progress-note">心纸 {{ formatNumber(row.calculation.heartOwned) }} / {{ formatNumber(row.calculation.heartRequired) }} · <span class="heart-gap">缺 <span class="heart-gap-number">{{ formatNumber(row.calculation.heartGap) }}</span></span></small>
                  </div>
                </div>
                <slot name="remark" :row="row" />
                <div v-if="row.completed" v-show="!isRemarkEditing(row)" class="growth-materials growth-complete">
                  <button class="tracker-remove" type="button" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.size > 0" @click="removePlanMember(row)"><X :size="14" aria-hidden="true" />从清单中移除</button>
                </div>
                <details v-else class="growth-materials"><summary>查看材料缺口与预计耗时 <span>{{ rowGapCount(row) }} 项</span></summary><div v-if="!row.calculation.gaps.length && !row.calculation.experienceGap && !row.calculation.heartGap" class="materials-clear">当前目标材料已备齐</div><div v-else class="growth-material-chips"><span v-for="gap in row.calculation.gaps" :key="gap.id" class="growth-material-chip"><img class="growth-material-icon" :src="resourceIcon(gap.id)" alt="" loading="lazy" /><b>{{ itemName(gap.id) }}</b><em>缺 {{ formatNumber(gap.gap) }}<small v-if="materialEtaLabel(row, gap)" class="growth-material-eta">{{ materialEtaLabel(row, gap) }}</small></em></span><span v-if="row.calculation.experienceGap" class="growth-material-chip experience-chip"><img class="growth-material-icon" :src="resourceIcon('bingshuquanjuan')" alt="" loading="lazy" /><b>经验</b><em>{{ experienceEtaLabel(row.calculation.experienceGap) }}</em></span><div v-if="row.calculation.heartGap" class="growth-material-chip heart-chip"><img class="growth-material-icon" :src="operatorIcon(row)" alt="" loading="lazy" /><b>心纸</b><em>缺 {{ formatNumber(row.calculation.heartGap) }}</em><span class="heart-history" role="img" :aria-label="heartHistorySummary(row)"><span class="heart-history-label" aria-hidden="true"><span>近 30 日获取</span><small v-if="heartHistoryError">暂不可用</small><small v-else-if="!heartHistoryReady">同步中…</small></span><span v-if="heartHistoryReady && !heartHistoryError && heartHasRecentAcquisition(row)" class="heart-history-bars" aria-hidden="true"><i v-for="point in heartSeries(row)" :key="point.date" class="heart-history-bar" :style="{ height: heartBarHeight(row, point) }"></i></span><span v-else-if="heartHistoryReady && !heartHistoryError" class="heart-history-empty" aria-hidden="true">暂无心纸获取记录</span></span></div></div><p class="growth-material-note">库存按当前清单共享分配，以下为分配后缺口；单项 ETA 按独占对应历练估算。</p></details>
              </article>
            </div>
        </div>
      </section>

      <div v-if="!activePlan" class="planner-state empty"><Plus :size="18" aria-hidden="true" /><span>还没有培养清单。点击上方「添加」，可优先根据特别关注建立第一张清单。</span></div>
      <div v-else-if="!planRows.length" class="planner-state empty"><Star :size="18" aria-hidden="true" /><span>当前清单还没有密探，可通过上方「编辑清单」添加，或新建培养计划。</span></div>

      </fieldset>
      <section ref="plannerWorkspaceRef" tabindex="-1" class="planner-workspace" aria-label="体力规划工作区">
        <div v-if="planRows.length || fixedSchedule" class="planner-workspace-head">
          <div class="workspace-heading-content"><span class="section-kicker">每日执行</span>
            <div class="workspace-title-row"><h2>体力日程</h2><div class="plan-heading-actions" role="group" aria-label="体力日程操作">
              <button v-if="viewMode === 'display'" type="button" class="plan-icon" aria-label="编辑日程" title="编辑日程" :disabled="cloudBlocked" @click="editSchedule()"><Pencil :size="17" aria-hidden="true" /></button>
            </div></div>
          </div>
          <button v-if="viewMode === 'edit'" type="button" class="workspace-return" @click="openPlanner('display')"><ChevronLeft :size="16" aria-hidden="true" />返回日程</button>
        </div>

        <div class="workspace-feedback">
          <div class="cloud-status" role="status" aria-live="polite">
            {{ cloudStatusLabel }}
            <span v-if="fixedSchedule"> · 日界线北京时间 05:00</span>
          </div>
          <div v-if="cloudError" class="cloud-recovery" role="alert"><p>{{ cloudError }}</p><button v-if="!migration" type="button" @click="loadCloud">重新读取</button></div>
          <template v-for="kind in ['workspace', 'schedule']" :key="kind">
            <div v-if="(kind === 'workspace' ? workspaceState : scheduleState).error" class="cloud-recovery" role="alert">
              <p>{{ kind === 'workspace' ? '清单' : '日程' }}尚未确认保存：{{ (kind === 'workspace' ? workspaceState : scheduleState).error.message }}</p>
              <p v-if="(kind === 'workspace' ? workspaceState : scheduleState).latest">云端版本 {{ (kind === 'workspace' ? workspaceState : scheduleState).latest.revision }} · {{ (kind === 'workspace' ? workspaceState : scheduleState).latest.updatedAt }}</p>
              <div class="cloud-actions"><button type="button" :disabled="(kind === 'workspace' ? workspaceState : scheduleState).saving" @click="recover(kind)">重试保存</button><button type="button" @click="downloadPending(kind)">导出未保存内容</button><button type="button" :disabled="(kind === 'workspace' ? workspaceState : scheduleState).saving" @click="recover(kind, true); planError = ''">放弃本次修改并读取云端</button></div>
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
              <button v-if="!scheduleDifferences.goalsChanged && !reviewingHistory && !globalShortestPlanAdopted && !deadlineAlternativePlanAdopted" type="button" class="schedule-optimize" :disabled="cloudBlocked" @click="openExactOptimizer">优化日程</button>
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
          <PlannerDateTabs :dates="plannerDates" :selected="selectedDate" :manual-plans="manualPlans" :today="plannerToday" :fixed="Boolean(fixedSchedule)" :past-count="pastScheduleCount" :hide-past="hidePastSchedule" :reset-disabled="scheduleActionBlocked" @reset="openScheduleAction('reset')" @toggle-history="openScheduleAction('history')" @select="selectDate" />
          <PlannerRecalculateNotice v-if="pendingRecalculation" :date-label="currentDateLabel" :busy="schedulePending" :disabled="cloudBlocked || loading || targetLoading || Boolean(error) || scheduleDifferences.goalsChanged || currentDay.paused" @recalculate="recalculateFromCurrentDay" />

          <div class="display-grid">
            <section class="planner-card day-plan">
              <div class="card-heading">
                <div><span class="card-kicker">{{ currentDateLabel }} · 模拟计划</span><h3>当日方案</h3></div>
                <span class="plan-badge" :class="{ manual: currentDay.manual, exact: deadlineAlternativePlanAdopted }">{{ planBadgeLabel }}</span>
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
          <p class="planner-footnote">{{ deadlineAlternativePlanAdopted ? '此日属于已采用的期限补足方案；请按每日安排准备体力，并以方案中的购买与派遣为准。' : currentDay.manual ? '此日采用手工计划；调整体力获取或支出后，可点击提示重新计算当日及后续日程。' : '这是按当前偏好生成的推荐方案；编辑任意一天后，完整日程会固定保存。' }} 培养推进为从计划保存起点计算的模拟进度，不代表真实流水。{{ aggregateMoneyLabel }}。按完整一天自然恢复与进膳预算计算；不模拟满体损失，日末结余暂不自动结转，可手工添加储备来源。</p>
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
                <div class="edit-roster">
                  <div v-for="(row, rowIndex) in orderedPlanRows" :key="row.id" class="edit-roster-item" draggable="true" @dragstart="onRosterDragStart(row.id)" @dragover.prevent @drop="onRosterDrop(row.id)">
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
                      <label class="target-star"><span class="target-field-label">化极 <small>{{ starLabel(row.starLevel).replace('⭐', '星') }} →</small></span><span class="progress-values"><PlannerSelect class="target-star-select" compact :model-value="targetFor(row).starLevel" :options="starStagesFor(row)" :label="row.name + '目标化极'" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @update:model-value="setTarget(row, 'starLevel', $event)" /></span></label>
                    </div>
                  </div>
                </div>
                <button type="button" class="roster-add" aria-haspopup="dialog" :disabled="!activePlan || planPickerDisabled" @click="trainingPlanPickerRef?.openMemberPicker()"><Plus :size="18" aria-hidden="true" />新增密探</button>
              </section>
            </aside>
            <div class="editor-main">
              <section v-show="plannerStep === 'conditions'" id="planner-step-conditions" ref="plannerConditionsRef" class="planning-panel" tabindex="-1" aria-label="规划条件">
                <header class="planning-panel-heading"><div><h3>规划条件</h3><p>设定培养目标、体力偏好与可刷层数。</p></div></header>
  <div class="planning-mode" role="group" aria-label="规划模式"><button type="button" :class="{ active: !goalMode }" :aria-pressed="!goalMode" @click="goalMode = false"><CalendarDays :size="17" aria-hidden="true" />常规日程规划</button><button type="button" class="goal-mode" :class="{ active: goalMode }" :aria-pressed="goalMode" @click="goalMode = true"><Target :size="17" aria-hidden="true" />按目标天数规划</button></div>
<section id="planning-conditions" class="settings-panel"><div v-if="goalMode" class="settings-block goal-conditions">
  <div class="settings-block-head"><h3>目标天数</h3><span>独立试算</span></div>
  <div class="goal-days-field"><label for="goal-days">从今天起的目标天数</label><div ref="goalDatePickerWrap" class="goal-days-input-wrap" @keydown.esc.prevent.stop="closeGoalDatePicker()"><input id="goal-days" type="number" min="1" max="90" step="1" v-model.number.lazy="goalDays" /><button ref="goalDateTrigger" type="button" class="goal-date-trigger" aria-label="选择养成截止日期" :aria-expanded="goalDatePickerOpen" aria-controls="goal-date-picker" @click="toggleGoalDatePicker"><CalendarDays :size="17" aria-hidden="true" /></button><div v-if="goalDatePickerOpen" id="goal-date-picker" ref="goalDatePickerRef" class="goal-date-popover" role="dialog" aria-labelledby="goal-date-picker-title" aria-describedby="goal-date-picker-description">
    <header class="goal-calendar-context"><h4 id="goal-date-picker-title">选择养成截止日期</h4><p id="goal-date-picker-description">希望最晚在这一天完成当前清单的养成。</p></header>
    <div class="goal-calendar-heading"><button type="button" aria-label="上个月" :disabled="!goalDatePickerCanPrevious" @click="changeGoalDatePickerMonth(-1)"><ChevronLeft :size="18" aria-hidden="true" /></button><strong aria-live="polite">{{ goalDatePickerYear }} 年 {{ goalDatePickerMonth + 1 }} 月</strong><button type="button" aria-label="下个月" :disabled="!goalDatePickerCanNext" @click="changeGoalDatePickerMonth(1)"><ChevronRight :size="18" aria-hidden="true" /></button></div>
    <div class="goal-calendar-week" aria-hidden="true"><span v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">{{ day }}</span></div>
    <div class="goal-calendar-days"><span v-for="blank in goalDatePickerOffset" :key="`goal-blank-${blank}`" /><button v-for="day in goalDatePickerDays" :key="day" :data-goal-day="day" :tabindex="day === goalDatePickerFocusedDay ? 0 : -1" :class="{ selected: goalDatePickerKey(day) === goalCompletionDate, today: goalDatePickerKey(day) === plannerToday }" :disabled="!isGoalDateSelectable(day)" :aria-label="`${goalDatePickerYear} 年 ${goalDatePickerMonth + 1} 月 ${day} 日`" :aria-pressed="goalDatePickerKey(day) === goalCompletionDate" :aria-current="goalDatePickerKey(day) === plannerToday ? 'date' : undefined" @keydown="moveGoalDatePickerDay($event, day)" @click="selectGoalDatePickerDay(day)">{{ day }}</button></div>
    <button type="button" class="goal-today-button" @click="selectGoalDatePickerToday">回到今天</button>
  </div></div></div>
  <p class="goal-completion-date">截止日期：<time :datetime="goalCompletionDate">{{ formatLongDate(goalCompletionDate) }}</time></p>
  <p class="goal-date-help">日期按“含今天”换算，最多支持 90 天。</p>
  <div class="goal-shortcuts"><button v-for="days in [7, 10, 14, 21]" :key="days" type="button" :class="{ active: Number(goalDays) === days }" @click="goalDays = days">{{ days }} 天</button></div>
</div><div v-if="!goalMode" class="settings-block"><div class="settings-block-head"><h3>培养策略</h3><span>{{ strategy === 'priority' ? '顺序参与规划' : '清单仅用于展示' }}</span></div><div class="strategy-switch"><button type="button" :class="{ active: strategy === 'overall' }" @click="setStrategy('overall')">整体完成</button><button type="button" :class="{ active: strategy === 'priority' }" @click="setStrategy('priority')">优先完成密探</button></div><p class="setting-help">整体完成以整张清单最早备齐为目标；优先完成按清单顺序依次优化各密探的备齐日期。下一步方案对比沿用此策略。</p></div><div class="settings-block"><div class="settings-block-head"><h3>推荐偏好</h3><span>每天重复使用</span></div><div class="settings-fields"><div class="setting-line"><label for="pref-luoyang">洛阳派遣</label><div class="counter"><button type="button" aria-label="减少洛阳派遣次数" :disabled="plannerPreferences.luoyang <= 0" @click="changePreference('luoyang', -1)">−</button><input id="pref-luoyang" type="number" min="0" max="4" v-model.number.lazy="plannerPreferences.luoyang" @change="savePreferences" /><button type="button" aria-label="增加洛阳派遣次数" :disabled="plannerPreferences.luoyang >= 4" @click="changePreference('luoyang', 1)">＋</button></div></div><div class="setting-line"><label for="pref-shouchun">寿春派遣</label><div class="counter"><button type="button" aria-label="减少寿春派遣次数" :disabled="plannerPreferences.shouchun <= 0" @click="changePreference('shouchun', -1)">−</button><input id="pref-shouchun" type="number" min="0" max="4" v-model.number.lazy="plannerPreferences.shouchun" @change="savePreferences" /><button type="button" aria-label="增加寿春派遣次数" :disabled="plannerPreferences.shouchun >= 4" @click="changePreference('shouchun', 1)">＋</button></div></div><div class="setting-line"><label for="pref-purchase">购买体力</label><div class="counter"><button type="button" aria-label="减少购买体力次数" :disabled="plannerPreferences.purchaseCount <= 0" @click="changePreference('purchaseCount', -1)">−</button><input id="pref-purchase" type="number" min="0" max="8" v-model.number.lazy="plannerPreferences.purchaseCount" @change="savePreferences" /><button type="button" aria-label="增加购买体力次数" :disabled="plannerPreferences.purchaseCount >= 8" @click="changePreference('purchaseCount', 1)">＋</button></div></div></div><p class="purchase-note">{{ purchaseCostLabel }} / 日；每日体力来源会计入日程账本。派遣仅消耗体力，无素材产出。</p></div><div class="settings-block training-settings-block"><div class="settings-block-head"><h3>可刷层数</h3><span>用于每日推荐</span></div><div class="training-levels"><label v-for="group in TRAINING_GROUPS" :key="group.id">{{ group.name }}最高层<PlannerSelect class="training-level-select" :model-value="workspace.trainingLevels[group.id]" :options="group.stages.map(stage => ({ value: stage.level, label: stage.name }))" :label="group.name + '最高层'" :disabled="cloudBlocked" @update:model-value="setTrainingLevel(group.id, $event)" /></label></div></div><section v-if="goalMode" class="reserve-management" aria-labelledby="reserve-management-title">
  <div class="reserve-management-heading"><div><h3 id="reserve-management-title">体力储备</h3><p>已到账体力计入第一天；待领取储备由求解器安排整笔领取日期。</p></div><span class="reserve-total">待领取 {{ goalReserveSources.length }} 笔 · {{ goalReserveSources.reduce((sum, source) => sum + Math.max(0, Number(source.amount) || 0), 0) }} 体力</span></div>
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
</section></section>
                <footer class="planner-step-actions">
                  <button type="button" class="workspace-link" aria-label="直接编辑每日" title="直接编辑每日" @click="setPlannerStep('daily')"><Pencil :size="18" aria-hidden="true" /></button>
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
<PlannerDateTabs :dates="plannerDates" :selected="selectedDate" :manual-plans="manualPlans" :today="plannerToday" :fixed="Boolean(fixedSchedule)" :past-count="pastScheduleCount" :hide-past="hidePastSchedule" :reset-disabled="scheduleActionBlocked" @reset="openScheduleAction('reset')" @toggle-history="openScheduleAction('history')" @select="selectDate" />
          <PlannerRecalculateNotice v-if="pendingRecalculation" :date-label="currentDateLabel" :busy="schedulePending" :disabled="cloudBlocked || loading || targetLoading || Boolean(error) || scheduleDifferences.goalsChanged || currentDay.paused" @recalculate="recalculateFromCurrentDay" />

          <div class="edit-simulation"><div class="ledger-grid"><section class="planner-card ledger-card"><div class="ledger-heading"><h3>体力获取</h3><span title="按当前套用的基础方案">推荐 {{ formatStamina(recommendedTotals.gains) }}</span></div><template v-for="(gain, index) in currentDay.planned.gains" :key="gain.id">
  <PlannerCustomEntry v-if="gain.custom" :entry="gain" kind="gain" :index="index" :total="energyFromGain(gain)" :disabled="cloudBlocked || loading || targetLoading || Boolean(error) || reviewingHistory"
    @change-name="updateCustomName('gains', index, $event)" @change-value="updatePlanValue('gains', index, $event)" @remove="removePlanRow('gains', index)" />
  <div v-else class="ledger-row">
    <div class="ledger-label-wrap"><span class="channel-label" :class="gain.colorKey" :style="channelStyle(gain.colorKey)"><i></i>{{ gain.label }}</span></div>
    <div class="ledger-input-wrap"><label :for="'gain-value-' + index">数量</label><input :id="'gain-value-' + index" type="number" min="0" step="1" :value="gain.value" :aria-label="gain.label + '数量'" @change="updatePlanValue('gains', index, $event)" /><span>{{ gain.kind === 'count' ? '次' : '体力' }}</span></div>
    <span class="recommendation" :class="{ 'matches-plan': gain.value === recommendedValue('gains', gain) }">推荐 {{ recommendedValue('gains', gain) }}</span>
    <button type="button" class="row-remove" :aria-label="'移除 ' + gain.label" @click="removePlanRow('gains', index)"><X :size="14" aria-hidden="true" /></button>
  </div>
</template><div class="add-wrap"><button type="button" class="add-button" :aria-expanded="addMenu === 'gain'" @click="toggleAddMenu('gain')"><Plus :size="14" aria-hidden="true" />添加获取</button><div v-if="addMenu === 'gain'" class="add-menu" role="menu"><button v-for="channel in GAIN_CHANNELS" :key="channel.id" type="button" role="menuitem" @click="addGain(channel.id)"><span class="channel-label" :class="channel.colorKey" :style="channelStyle(channel.colorKey)"><i></i>{{ channel.label }}</span></button></div></div><div class="ledger-total gain-total"><span>当日获取</span><b>{{ formatStamina(todayTotals.gains) }}</b></div></section><section class="planner-card ledger-card"><div class="ledger-heading"><h3>体力支出</h3><span title="按当前套用的基础方案">推荐 {{ formatStamina(recommendedTotals.spends) }}</span></div><template v-for="(spend, index) in currentDay.planned.spends" :key="spend.id">
  <PlannerCustomEntry v-if="spend.custom" :entry="spend" kind="spend" :index="index" :total="spend.value * spend.costPer" :resources="yieldResourceOptions" :resource-name="resourceName" :disabled="cloudBlocked || loading || targetLoading || Boolean(error) || reviewingHistory"
    @change-name="updateCustomName('spends', index, $event)" @change-value="updatePlanValue('spends', index, $event)" @change-cost="updateSpendCost(index, $event)"
    @change-yield="(id, event) => updateSpendYield(index, id, event)" @add-yield="addSpendYield(index, $event)" @remove-yield="removeSpendYield(index, $event)" @remove="removePlanRow('spends', index)" />
  <div v-else class="ledger-row spend-ledger-row">
    <div class="ledger-label-wrap"><span class="channel-label" :class="spend.colorKey" :style="channelStyle(spend.colorKey)"><i></i><span class="spend-name"><b>{{ spendChannelName(spend) }}</b><span v-if="spendStageName(spend)" class="spend-stage">{{ spendStageName(spend) }}</span></span></span></div>
    <div class="ledger-input-wrap"><label :for="'spend-value-' + index">次数</label><input :id="'spend-value-' + index" type="number" min="0" step="1" :value="spend.value" :aria-label="spend.label + '次数'" @change="updatePlanValue('spends', index, $event)" /><span>次</span></div>
    <span class="recommendation" :class="{ 'matches-plan': spend.value === recommendedValue('spends', spend) }">推荐 {{ recommendedValue('spends', spend) }}</span>
    <button type="button" class="row-remove" :aria-label="'移除 ' + spend.label" @click="removePlanRow('spends', index)"><X :size="14" aria-hidden="true" /></button>
  </div>
</template><div class="add-wrap"><button ref="spendAddRef" type="button" class="add-button" aria-controls="planner-spend-menu" :aria-expanded="addMenu === 'spend'" @click="toggleAddMenu('spend')"><Plus :size="14" aria-hidden="true" />添加支出</button><div v-if="addMenu === 'spend'" id="planner-spend-menu" class="add-menu" :class="{ 'stage-menu': pendingTrainingGroup }" role="menu" :aria-label="pendingTrainingGroup ? pendingTrainingGroup.name + '选择层数' : '选择支出渠道'" @keydown.esc.prevent.stop="cancelSpendMenu">
  <template v-if="pendingTrainingGroup">
    <div class="stage-menu-heading"><button type="button" role="menuitem" @click="pendingSpendChannel = ''; focusSpendMenu()">‹ 返回渠道</button><span>{{ pendingTrainingGroup.name }} · 选择层数</span></div>
    <button v-for="stage in addTrainingStages" :key="stage.level" type="button" role="menuitem" @click="addTrainingSpend(stage.level)">{{ stage.name.replace(/第\s*(\d+)\s*层/, '$1 层') }}</button>
  </template>
  <template v-else><button v-for="channel in SPEND_CHANNELS" :key="channel.id" type="button" role="menuitem" @click="addSpend(channel.id)"><span class="channel-label" :class="channel.colorKey" :style="channelStyle(channel.colorKey)"><i></i>{{ channel.label }}</span></button></template>
</div></div><div class="spend-summary">
  <div class="ledger-total spend-total"><span>当日支出</span><b>{{ formatStamina(todayTotals.spends) }}</b></div>
  <div class="spend-balance" :class="{ negative: todayTotals.balance < 0 }" role="status" aria-live="polite" aria-atomic="true"><span>{{ todayTotals.balance < 0 ? '超出可用体力' : '未分配体力' }}</span><strong>{{ formatStamina(Math.abs(todayTotals.balance)) }}</strong></div>
</div></section></div><CultivationProgress :rows="progressItems" :date-label="currentDateLabel" /></div><section class="editor-actions panel"><p>{{ currentDay.manual ? '该日为手工计划；调整获取或支出后会更新账本；点击提示才会重新安排当日及后续日程。' : '修改后会保存完整日程；调整体力获取或支出后，可点击提示重新计算当日及后续日程。' }}</p><div><button v-if="futureManualCount" type="button" class="action-button" @click="clearFutureManualPlans"><RotateCcw :size="14" aria-hidden="true" />清除后续 {{ futureManualCount }} 个固定日</button><button type="button" class="action-button" title="恢复当前套用方案中的当日安排" @click="restoreCurrentDay"><RotateCcw :size="14" aria-hidden="true" />恢复当天方案</button></div></section>
                <footer class="planner-step-actions">
                  <button type="button" class="workspace-link" aria-label="上一步：方案对比" title="上一步：方案对比" @click="setPlannerStep('comparison')"><ChevronLeft :size="18" aria-hidden="true" /></button>
                  <button type="button" class="action-button primary" @click="openPlanner('display')"><Check :size="16" aria-hidden="true" />完成编辑</button>
                </footer>
              </section>
            </div>
          </div>
        </section>
        </fieldset>
      </section>
    </template>

    <Teleport to="body">
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Info, Pencil, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Star, Target, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
import OperatorGrowthActionPopover from './OperatorGrowthActionPopover.vue'
import { useOperatorPlannerCloud } from '../../composables/useOperatorPlannerCloud.js'
import { plannerDateInZone } from '../../data/operatorPlannerRemote.js'
import { addCalendarDays, businessDayStartIso, BUSINESS_DAY_START_HOUR, BUSINESS_TIMEZONE } from '../../utils/businessDay.js'
import OperatorTrainingPlanPicker from './OperatorTrainingPlanPicker.vue'
import { TRAINING_GROUPS, bookExperience, experienceTrainingDays, normalizeTrainingLevels, trainingMaterialEtas, trainingRate } from '../../data/operatorTraining.js'
import { FAVORITES_PLAN_ID, sanitizeTrainingWorkspaceOperators, trainingPlanMemberIds } from '../../data/operatorTrainingPlans.js'
import { getCurrent, listRecords } from '../../api/inventory.js'
import { avatarUrl } from '../../api/request.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { getOperatorGrowthTargets, putOperatorGrowthTarget } from '../../api/operator.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import { calculateLevelRequirements, calculateStarRequirements, calculateXiuweiRequirements, mergeRequirements, netRequirement, starLabelForStage, starStageFromLevel } from '../../data/operatorRequirements.js'
import { buildRecentAcquisitionHistory, recentBusinessDayKeys } from '../../data/inventory/acquiredStats.js'
import PlannerDateTabs from './PlannerDateTabs.vue'
import PlannerSelect from './PlannerSelect.vue'
import PlannerCustomEntry from './PlannerCustomEntry.vue'
import PlannerRecalculateNotice from './PlannerRecalculateNotice.vue'
import PlannerExactOptimizer from './PlannerExactOptimizer.vue'
import CultivationProgress from './CultivationProgress.vue'
import { applyDeadlineAlternative, applyExactComparisonResult, createFixedSchedule, fixedScheduleDifferences, pendingScheduleEdits, plannerBasePlan, plannerBaseValue, plannerTiming, resetFixedSchedule, restoreFixedScheduleDay, visibleFixedScheduleTimeline, recalculateFixedScheduleFrom, reviseFixedSchedule, updateFixedSchedulePlan } from '../../data/fixedPlannerSchedule.js'
import { GAIN_CHANNELS, PLANNER_RESOURCE_LABELS, PLANNER_RULES, PURCHASE_CUMULATIVE, SPEND_CHANNELS, aggregatePlannerState, allocateSharedPlannerStock, buildRecommendedPlan, simulatePlanner, settlePlannerDay, plannerProgressRows, plannerResourcesFromCalculation, clonePlannerValue, createGain, createInitialPlannerState, createSpend, energyFromGain, normalizePlannerPlan, normalizePlannerPreferences, planTotals } from '../../data/cultivationPlanner.js'

const props = defineProps({ accountId: { type: String, default: '' }, currentEntries: { type: Array, default: () => [] }, catalogEntries: { type: Array, default: () => [] }, favoriteIds: { type: Object, default: () => new Set() }, growthStates: { type: Object, default: () => ({}) }, isLoggedIn: { type: Boolean, default: false }, refreshKey: { type: Number, default: 0 }, active: { type: Boolean, default: true }, annotationRevisions: { type: Object, default: () => ({}) }, isRemarkEditing: { type: Function, default: () => false }, quickUpgrade: { type: Function, default: null }, quickUpgradeState: { type: Function, default: null }, growthActionPopoverKey: { type: String, default: '' }, growthActionEntry: { type: Function, default: null }, growthActionTargetLabel: { type: Function, default: null }, growthActionShowBreakthrough: { type: Function, default: null }, growthActionBreakthrough: { type: Function, default: null }, growthActionPreviewBusy: { type: Function, default: null }, growthActionPreviewError: { type: Function, default: null }, growthActionPreview: { type: Function, default: null }, growthActionDisplayRequirements: { type: Function, default: null }, growthActionBlockingReasons: { type: Function, default: null }, growthActionAvailable: { type: Function, default: null }, growthActionHasMaterialGap: { type: Function, default: null }, growthActionExecuteBusy: { type: Function, default: null }, growthActionRequirementName: { type: Function, default: null }, growthActionRequirementValue: { type: Function, default: null }, growthActionRequirementBalanceLabel: { type: Function, default: null }, growthActionReasonMessage: { type: Function, default: null }, growthActionExecute: { type: Function, default: null }, growthActionBreakthroughChange: { type: Function, default: null }, growthActionNotice: { type: Function, default: null } })

const emit = defineEmits(['refresh-operators', 'refresh-annotations', 'annotation-updated'])
const plannerRules = PLANNER_RULES
const loading = ref(false)
const error = ref('')
const currentItems = ref({})
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
const planPickerDisabled = computed(() => cloudBlocked.value || schedulePending.value || targetBusyIds.value.size > 0 || targetLoading.value)
const scheduleTimezone = ref(BUSINESS_TIMEZONE)
const planError = ref('')
const planNotice = ref('')
const scheduleAction = ref('')
const scheduleActionDialog = ref(null)
const scheduleActionBlocked = computed(() => cloudBlocked.value || schedulePending.value || loading.value || targetLoading.value || Boolean(error.value))
const scheduleActionTitle = computed(() => scheduleAction.value === 'reset' ? '重设日程起始日期' : hidePastSchedule.value ? '展开已过日程' : '收起已过日程')
const scheduleActionDescription = computed(() => scheduleAction.value === 'reset'
  ? `从 ${formatLongDate(plannerToday.value)} 开始，按当前库存和清单重新规划。今天及未来的手工安排将清除，按当前体力偏好重新推荐；此前阶段不再出现在日期栏中。`
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
const pendingTrainingGroup = computed(() => trainingGroupForSpend({ id: pendingSpendChannel.value }))
const addTrainingStages = computed(() => pendingTrainingGroup.value?.stages.filter(stage => stage.level <= plannerLevels.value[pendingTrainingGroup.value.id]) || [])
const plannerPreferences = ref(normalizePlannerPreferences())
const strategy = ref('overall')
const plannerConditionSummary = computed(() => [
  goalMode.value ? `${goalDays.value} 天内完成 · 最低白金币` : strategy.value === 'priority' ? '按清单顺序优先完成' : '整体最早完成',
  `每日购买 ${plannerPreferences.value.purchaseCount} 次`,
  `洛阳 ${plannerPreferences.value.luoyang} 次 · 寿春 ${plannerPreferences.value.shouchun} 次`
].join(' · '))
const plannerOrder = ref([])
const manualPlans = ref({})
const fixedSchedule = ref(null)
const plannerToday = ref(plannerDateInZone(BUSINESS_TIMEZONE, new Date(), BUSINESS_DAY_START_HOUR))
const plannerWorkspaceRef = ref(null)
const plannerStartDate = ref(plannerToday.value)
const selectedDate = ref(plannerStartDate.value)
const hidePastSchedule = ref(readHidePastSchedule())
function readHidePastSchedule() { try { return localStorage.getItem('yuanhub:planner:hide-past') === 'true' } catch (_) { return false } }
function togglePastSchedule() {
  hidePastSchedule.value = !hidePastSchedule.value
  try { localStorage.setItem('yuanhub:planner:hide-past', String(hidePastSchedule.value)) } catch (_) {}
  if (hidePastSchedule.value && selectedDate.value < plannerToday.value) selectedDate.value = plannerDates.value[0]
}
const rosterDragId = ref('')
const starTargetId = ref('')
const starTargetDraft = ref(0)
const starTargetGroup = computed(() => starGroup(starTargetDraft.value))
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
const starStages = [{ value: 0, label: '未拥有' }].concat(Array.from({ length: 24 }, (_, index) => { const value = index + 1; return { value, label: starLabelForStage(starStageFromLevel(value)).replace(/^.+星升/, '升') } }), [{ value: 30, label: '五星' }, { value: 31, label: '觉醒' }])

function defaultTarget() { return { level: 100, elite: 17, starLevel: 7, revision: 0 } }
function targetFor(row, plan = activePlan.value) { if (!row?.id) return defaultTarget(); const saved = (plan?.source === 'custom' ? plan.targets[row.id] : targets.value[row.id]) || defaultTarget(); const currentLevel = Number(row.level) || 0; const currentElite = Number(row.elite) || 0; const level = Math.max(currentLevel, Math.min(100, Number(saved.level == null ? 100 : saved.level) || 0)); const eliteLimit = Math.min(17, Math.max(0, Math.floor(level / 5) - 3)); const elite = Math.max(currentElite, Math.min(eliteLimit, Number(saved.elite == null ? 17 : saved.elite) || 0)); const savedStar = Math.min(31, Math.max(0, Number(saved.starLevel == null ? 7 : saved.starLevel) || 0)); const currentStar = Number(row.starLevel) || 0; return { level, elite, starLevel: starStage(savedStar) < starStage(currentStar) ? currentStar : savedStar, revision: Number(saved.revision) || 0 } }
function targetEliteMax(row) { return Math.max(Number(row?.elite) || 0, Math.min(17, Math.max(0, Math.floor(targetFor(row).level / 5) - 3))) }
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
function xiuweiJob(prof) { const first = String(prof || '').split('、')[0]; return ['风', '火'].includes(first) ? 'fh' : ['水', '地'].includes(first) ? 'ds' : 'yy' }
function starStage(value) { return starStageFromLevel(value) }
function starLabel(value) { const number = Number(value) || 0; if (number <= 0) return '未拥有'; if (number >= 31) return '觉醒'; if (number >= 25) return '5星'; return Math.min(5, Math.floor((number - 1) / 6) + 1) + '⭐' + ((number - 1) % 6) }
function starStagesFor(row) { const current = starStage(row?.starLevel); return starStages.filter(stage => stage.value >= (Number(row?.starLevel) || 0) && starStage(stage.value) >= current) }
function starGroup(value) { const number = Number(value) || 0; if (number === 0 || number === 31) return number; return Math.min(5, Math.floor((number - 1) / 6) + 1) }
function starGroupsFor(row) { return [...new Set(starStagesFor(row).map(stage => starGroup(stage.value)))] }
function starNodesFor(row, group) { return starStagesFor(row).filter(stage => starGroup(stage.value) === Number(group)) }
function setStarTargetGroup(row, event) { const stages = starNodesFor(row, Number(event.target.value)); const node = (starTargetDraft.value - 1) % 6; const matching = stages.find(stage => (stage.value - 1) % 6 === node); if (stages.length) starTargetDraft.value = (matching || stages[0]).value }
async function openStarTarget(row, event) { if (starTargetId.value === row.id) return closeStarTarget(); starTargetTrigger = event.currentTarget; starTargetDraft.value = targetFor(row).starLevel; starTargetId.value = row.id; await nextTick(); document.getElementById('tracker-star-target-' + row.id)?.querySelector('select')?.focus() }
function closeStarTarget(restoreFocus = false) { starTargetId.value = ''; if (restoreFocus) starTargetTrigger?.focus(); starTargetTrigger = null }
async function saveStarTarget(row) { const saved = await setTarget(row, 'starLevel', starTargetDraft.value); if (saved && starTargetId.value === row.id) { await nextTick(); closeStarTarget(true) } }
function dismissStarTarget(event) { if (addMenu.value && !event.target.closest('.add-wrap')) { addMenu.value = ''; pendingSpendChannel.value = '' } if (starTargetId.value && !event.target.closest('.tracker-star-anchor')) closeStarTarget(); if (goalDatePickerOpen.value && !goalDatePickerWrap.value?.contains(event.target)) closeGoalDatePicker(false) }
function growthTargetReachedLocal(current, target) { const currentStar = Number(current.starLevel) >= 25 && Number(current.starLevel) < 31 ? 25 : Number(current.starLevel) || 0; const targetStar = Number(target.starLevel) >= 25 && Number(target.starLevel) < 31 ? 25 : Number(target.starLevel) || 0; return currentStar >= targetStar && Number(current.level) >= target.level && Number(current.elite) >= target.elite }
function quickUpgradeState(row, field, step, readyLabel) {
  const fallback = { visible: Boolean(props.quickUpgrade && row?.owned), disabled: false, className: '', icon: 'up', label: readyLabel, title: '在养成规划中查看快捷提升' }
  if (typeof props.quickUpgradeState !== 'function') return fallback
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

const requirementPlanRows = computed(() => activeMemberIds.value.size ? props.catalogEntries.filter(entry => activeMemberIds.value.has(entry.id)).map(entry => { const current = currentMap.value[entry.id] || {}; const target = targetFor({ ...entry, ...current }); const level = calculateLevelRequirements(current.level || 0, target.level, firstSubProf(entry)); const xiuwei = calculateXiuweiRequirements(current.elite || 0, target.elite, xiuweiJob(entry.prof)); const star = calculateStarRequirements(current.starLevel || 0, target.starLevel); const total = mergeRequirements(level, xiuwei, star); const net = netRequirement(total, currentItems.value); const ownedExperience = experienceStock(currentItems.value); const experienceGap = Math.max(level.experience - ownedExperience, 0); const heartOwned = Number(currentAgents.value[entry.id]) || 0; const heartRequired = Number(star.heart) || 0; const heartGap = Math.max(heartRequired - heartOwned, 0); const gaps = net.gaps.filter(gap => !EXPERIENCE_BOOK_IDS.has(gap.id)); return { ...entry, ...current, avatar: entry.avatar || '', level: Number(current.level) || 0, elite: Number(current.elite) || 0, starLevel: Number(current.starLevel) || 0, owned: Boolean(current.level || current.elite || current.starLevel), completed: Boolean((current.level || current.elite || current.starLevel) && growthTargetReachedLocal(current, target)), calculation: { level, xiuwei, star, total, net, experienceGap, heartOwned, heartRequired, heartGap, gaps, materialEtas: trainingMaterialEtas(gaps, workspace.value.trainingLevels) } } }) : [])
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
    return { ...row, calculation: { ...row.calculation, gaps, experienceGap: remaining.__xp__ || 0,
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
  ...Object.keys(manualPlans.value).filter(date => !fixedSchedule.value?.context.displayStartDate || date >= fixedSchedule.value.context.displayStartDate)
])].sort())
const pastScheduleCount = computed(() => allPlannerDates.value.filter(date => date < plannerToday.value).length)
const plannerDates = computed(() => {
  if (!hidePastSchedule.value) return allPlannerDates.value
  const future = allPlannerDates.value.filter(date => date >= plannerToday.value)
  return future.length ? future : [plannerToday.value]
})
const cloudStatusLabel = computed(() => {
  if (cloudLoading.value || scheduleLoading.value) return '正在读取云端计划…'
  if (cloudError.value || workspaceState.value.error || scheduleState.value.error) return '云端同步未完成，请处理下方提示'
  if (workspaceState.value.saving || scheduleState.value.saving) return '正在保存到云端…'
  if (workspacePending.value || schedulePending.value) return '修改等待云端保存'
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
  if (result.status === 'horizon') return '当前推荐从计算基准日起 90 天内尚未备齐材料；这是贪心估算，不是推荐天数或不可完成的证明。'
  return '材料备齐即停止推荐；当前推荐为快速估算。'
})
const futureManualCount = computed(() => Object.keys(manualPlans.value).filter(date => date > selectedDate.value).length)
const outsideManualDates = computed(() => Object.keys(manualPlans.value).filter(date => date >= (fixedSchedule.value?.context.displayStartDate || plannerStartDate.value) && !plannerTimeline.value.some(day => day.date === date)).sort())
const currentDay = computed(() => {
  const day = plannerTimeline.value.find(item => item.date === selectedDate.value)
  if (day) return day
  const start = plannerTimeline.value.at(-1)?.end || plannerInitialState.value
  const options = { groups: TRAINING_GROUPS, levels: plannerLevels.value, strategy: strategy.value, agentOrder: plannerOrderForOptimization.value }
  const recommended = buildRecommendedPlan({ ...options, state: start, preferences: plannerPreferences.value })
  const planned = manualPlans.value[selectedDate.value] || recommended
  const settled = settlePlannerDay(start, planned, options)
  const paused = plannerSimulation.value.status === 'invalid'
  return { date: selectedDate.value, start, recommended, manual: Boolean(manualPlans.value[selectedDate.value]), ...settled,
    ...(paused ? { paused: true, end: start, yield: {}, used: {}, surplus: {} } : {}) }
})
const planBadgeLabel = computed(() => deadlineAlternativePlanAdopted.value ? '期限补足方案' : currentDay.value.manual ? '自定义计划' : '自动推荐方案')
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
const plannerEtaLabel = computed(() => loading.value ? '同步中' : error.value ? '库存未同步'
  : scheduleDifferences.value.goalsChanged ? '旧方案待更新' : scheduleTiming.value.remainingDays == null ? simulationLabel(plannerSimulation.value)
    : scheduleTiming.value.remainingDays === 0 ? (fixedSchedule.value ? '按计划应已备齐' : '材料已备齐') : formatEta(scheduleTiming.value.remainingDays))
const plannerEtaExplanation = computed(() => {
  if (loading.value || error.value) return '等待库存同步后估算。'
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
const progressItems = computed(() => (currentDay.value.progressRows || plannerProgressRows(plannerRequirementState.value, plannerInitialState.value, currentDay.value,
  { ...currentItems.value, __xp__: experienceStock(currentItems.value) })).map(row => ({ ...row, name: resourceName(row.id), icon: resourceIcon(row.id) })))
const yieldResourceOptions = computed(() => [...new Set(['__xp__', ...Object.keys(aggregatePlannerState(plannerRequirementState.value)),
  ...TRAINING_GROUPS.flatMap(group => group.items?.map(item => item.id) || group.stages.flatMap(stage => Object.keys(stage.rewards)))])]
  .filter(id => !EXPERIENCE_BOOK_IDS.has(id)).map(id => ({ id, name: resourceName(id) })))
function simulationLabel(result) {
  if (result.awaitingRecalculation) return '待重新计算'
  if (result.status === 'invalid') return '日程待修正'
  if (result.status === 'blocked') return '获取途径待补充'
  if (result.status === 'horizon') return '90 天内未备齐'
  return result.etaDays === 0 ? '材料已备齐' : formatEta(result.etaDays)
}
const purchaseCostLabel = computed(() => formatNumber(PURCHASE_CUMULATIVE[normalizePlannerPreferences(plannerPreferences.value).purchaseCount]) + ' 白金币')
const aggregateMoneyLabel = computed(() => { const money = planRows.value.reduce((sum, row) => sum + Number(row.calculation.total.money || 0), 0); return `目标五铢钱需求 ${formatNumber(money)}` })
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
function progress(current, target) { const a = Number(current) || 0; const b = Number(target) || 0; return b <= 0 ? 100 : Math.min(100, Math.round(a * 100 / b)) }
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
function rowProgress(row) { const level = progress(row.level, targetFor(row).level); const elite = progress(row.elite, targetFor(row).elite); const fate = progress(starStage(row.starLevel), starStage(targetFor(row).starLevel)); return Math.round((level + elite + fate) / 3) }
function trainingGroupForSpend(spend) { const groupId = spend?.groupId || ({ feng: 'fh', dishui: 'ds', yinyang: 'yy', experience: 'experience' }[spend?.id]); return TRAINING_GROUPS.find(group => group.id === groupId) }

function workspaceCopy() { return JSON.parse(JSON.stringify(workspace.value)) }
async function commitWorkspace(next, notice = '', undoable = false) {
  const previous = workspaceCopy()
  const account = props.accountId
  const saved = await saveWorkspace(next)
  if (props.accountId !== account) return false
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
async function setTrainingLevel(groupId, value) {
  const next = workspaceCopy(); next.trainingLevels[groupId] = Number(value)
  if (await commitWorkspace(next)) persistPlannerSnapshot()
}
function applyPlannerSnapshot(snapshot) {
  closeScheduleAction()
  plannerPreferences.value = snapshot?.preferences || normalizePlannerPreferences()
  strategy.value = snapshot?.strategy || 'overall'
  plannerOrder.value = snapshot?.agentOrder || []
  manualPlans.value = snapshot?.manualPlans || {}
  fixedSchedule.value = snapshot?.schedule || null
  scheduleTimezone.value = fixedSchedule.value ? snapshot?.timezone || BUSINESS_TIMEZONE : BUSINESS_TIMEZONE
  plannerToday.value = plannerDateInZone(BUSINESS_TIMEZONE, new Date(), BUSINESS_DAY_START_HOUR)
  plannerStartDate.value = snapshot?.schedule?.startDate || plannerToday.value
  if (!plannerDates.value.includes(selectedDate.value)) selectedDate.value = plannerDates.value.includes(plannerToday.value) ? plannerToday.value : plannerDates.value[0]
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
    const invalid = [...(plannerConditionsRef.value?.querySelectorAll('input, select') || [])].find(input => !input.disabled && !input.checkValidity())
    if (invalid) { invalid.reportValidity(); return }
  }
  closeGoalDatePicker(false)
  addMenu.value = ''; pendingSpendChannel.value = ''
  plannerStep.value = step
  await nextTick()
  const panel = { conditions: plannerConditionsRef, comparison: plannerComparisonRef, daily: plannerDailyRef }[step]
  panel.value?.focus({ preventScroll: true })
  plannerStepsRef.value?.scrollIntoView({ behavior: 'auto', block: 'start' })
}
function editSchedule(step = 'conditions') {
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
function setStrategy(value) { strategy.value = value; persistPlannerSnapshot() }
function savePreferences() { plannerPreferences.value = normalizePlannerPreferences(plannerPreferences.value); persistPlannerSnapshot() }
function changePreference(key, delta) { plannerPreferences.value = normalizePlannerPreferences({ ...plannerPreferences.value, [key]: (Number(plannerPreferences.value[key]) || 0) + delta }); persistPlannerSnapshot() }
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
function onRosterDragStart(id) { rosterDragId.value = id }
function onRosterDrop(targetId) { if (cloudBlocked.value) return; const ids = [...orderedRosterIds.value]; const from = ids.indexOf(rosterDragId.value); const to = ids.indexOf(targetId); if (from < 0 || to < 0 || from === to) return; ids.splice(from, 1); ids.splice(to, 0, rosterDragId.value); plannerOrder.value = ids; rosterDragId.value = ''; persistPlannerSnapshot() }
function selectDate(date) { if (fixedSchedule.value?.context.displayStartDate && date < fixedSchedule.value.context.displayStartDate) return; selectedDate.value = date; addMenu.value = ''; pendingSpendChannel.value = '' }
function ensureManualPlan() { const date = selectedDate.value; const current = currentDay.value; const next = clonePlannerValue(manualPlans.value); if (!next[date]) next[date] = normalizePlannerPlan(clonePlannerValue(current.planned)); return { next, plan: next[date] } }
function commitManualPlan(next) {
  if (cloudBlocked.value || loading.value || targetLoading.value || error.value || reviewingHistory.value) return
  const previousPlans = manualPlans.value
  const previousSchedule = fixedSchedule.value
  const previousDay = currentDay.value
  manualPlans.value = next
  try {
    if (!fixedSchedule.value) fixedSchedule.value = createFixedSchedule(liveScheduleContext.value, previousPlans)
    fixedSchedule.value = updateFixedSchedulePlan(fixedSchedule.value, selectedDate.value, next[selectedDate.value], previousDay)
    if (!persistPlannerSnapshot(false)) { manualPlans.value = previousPlans; fixedSchedule.value = previousSchedule }
  } catch (err) {
    manualPlans.value = previousPlans; fixedSchedule.value = previousSchedule
    planError.value = '体力规划保存失败：' + err.message
  }
}
function updatePlanValue(kind, index, event) { const { next, plan } = ensureManualPlan(); const value = Math.max(0, Number(event.target.value) || 0); plan[kind][index].value = value; commitManualPlan(next) }
function updateCustomName(kind, index, event) { const { next, plan } = ensureManualPlan(); const value = String(event.target.value || '').trim().slice(0, 32) || (kind === 'gains' ? '自定义来源' : '自定义支出'); plan[kind][index].name = value; plan[kind][index].label = value; commitManualPlan(next) }
function updateSpendCost(index, event) { const { next, plan } = ensureManualPlan(); plan.spends[index].costPer = Math.max(0, Number(event.target.value) || 0); commitManualPlan(next) }
function removePlanRow(kind, index) { const { next, plan } = ensureManualPlan(); plan[kind].splice(index, 1); commitManualPlan(next) }
function toggleAddMenu(kind) { pendingSpendChannel.value = ''; addMenu.value = addMenu.value === kind ? '' : kind; if (kind === 'spend' && addMenu.value) focusSpendMenu() }
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
function focusSpendMenu() { nextTick(() => document.querySelector('#planner-spend-menu [role="menuitem"]')?.focus()) }
function cancelSpendMenu() { if (pendingSpendChannel.value) { pendingSpendChannel.value = ''; focusSpendMenu() } else { addMenu.value = ''; nextTick(() => spendAddRef.value?.focus()) } }
function finishSpendAddition(next) { commitManualPlan(next); addMenu.value = ''; pendingSpendChannel.value = ''; nextTick(() => spendAddRef.value?.focus()) }
function addSpend(channelId) {
  if (trainingGroupForSpend({ id: channelId })) { pendingSpendChannel.value = channelId; focusSpendMenu(); return }
  const { next, plan } = ensureManualPlan()
  const existing = plan.spends.find(spend => spend.id === channelId && !spend.custom)
  if (existing) existing.value += 1
  else plan.spends.push(createSpend(channelId))
  finishSpendAddition(next)
}
function addTrainingSpend(stageLevel) {
  const group = pendingTrainingGroup.value
  if (!group || !addTrainingStages.value.some(stage => stage.level === stageLevel)) return
  const { next, plan } = ensureManualPlan()
  const existing = plan.spends.find(spend => trainingGroupForSpend(spend)?.id === group.id && spend.stageLevel === stageLevel)
  if (existing) existing.value += 1
  else plan.spends.push({ ...createSpend(pendingSpendChannel.value, { stageLevel }), id: 'training-' + group.id + '-' + stageLevel })
  finishSpendAddition(next)
}
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
      manualPlans.value = { ...previousPlans }
      delete manualPlans.value[selectedDate.value]
    }
    if (persistPlannerSnapshot(false)) planNotice.value = '已恢复当前套用方案的当日安排'
    else { fixedSchedule.value = previous; manualPlans.value = previousPlans }
  } catch (err) {
    fixedSchedule.value = previous; manualPlans.value = previousPlans
    planError.value = '恢复当日方案失败：' + err.message
  }
}
function clearFutureManualPlans() { const removed = futureManualCount.value; manualPlans.value = Object.fromEntries(Object.entries(manualPlans.value).filter(([date]) => date <= selectedDate.value)); persistPlannerSnapshot(); planNotice.value = removed ? `已清除后续 ${removed} 个固定日，推荐会自动重算` : '未来推荐本来就会随设置自动刷新' }
function openPlanner(mode = 'display') {
  plannerOpen.value = true
  if (mode === 'edit') { editSchedule('conditions'); return }
  viewMode.value = 'display'; goalMode.value = false
  nextTick(() => {
    plannerWorkspaceRef.value?.focus({ preventScroll: true })
    plannerWorkspaceRef.value?.scrollIntoView({ behavior: 'auto', block: 'start' })
  })
}
function toggleSettings() { plannerOpen.value = true; editSchedule('conditions') }

function normalizedTargetItem(item) { return { level: item.level == null ? null : Number(item.level), elite: item.elite == null ? null : Number(item.elite), starLevel: (item.star_level != null ? item.star_level : item.starLevel) == null ? null : Number(item.star_level != null ? item.star_level : item.starLevel), revision: Number(item.revision) || 0 } }
function targetStorageKey() { return 'yuanhub:operator-targets:' + props.accountId }
function targetMigrationKey() { return 'yuanhub:operator-targets-migrated:v1:' + props.accountId }
function readLocalTargets() { if (typeof localStorage === 'undefined' || !props.accountId) return {}; try { const parsed = JSON.parse(localStorage.getItem(targetStorageKey()) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {} } catch (_) { return {} } }
function cacheTargets() { if (typeof localStorage !== 'undefined' && props.accountId) try { localStorage.setItem(targetStorageKey(), JSON.stringify(targets.value)) } catch (_) {} }
function targetErrorMessage(err, fallback) { if (err?.code === 'growth_target_revision_conflict') return '养成目标已在其他页面更新，已重新同步'; if (err?.code === 'invalid_growth_target') return '目标数值或组合不符合要求'; return err?.message || fallback }
function applyTargetItem(id, item) { if (id && item) targets.value = { ...targets.value, [id]: normalizedTargetItem(item) } }
async function migrateLocalTargets(targetAccount, remoteIds) { if (typeof localStorage === 'undefined' || localStorage.getItem(targetMigrationKey()) === 'done') return; const local = readLocalTargets(); for (const id of Object.keys(local).filter(item => !remoteIds.has(item))) { const saved = local[id] || {}; const body = { expected_revision: 0 }; if (saved.level != null) body.level = Number(saved.level); if (saved.elite != null) body.elite = Number(saved.elite); if (saved.starLevel != null || saved.star_level != null) body.star_level = Number(saved.starLevel != null ? saved.starLevel : saved.star_level); if (Object.keys(body).length === 1) continue; const item = await putOperatorGrowthTarget({ accountId: targetAccount, operatorId: id, target: body }); if (props.accountId !== targetAccount) return; applyTargetItem(id, item) } localStorage.setItem(targetMigrationKey(), 'done') }
async function loadTargets() { closeStarTarget(); targets.value = {}; targetBusyIds.value = new Set(); targetError.value = ''; if (!props.isLoggedIn || !props.accountId) { targetLoadSeq += 1; targetLoading.value = false; return } const account = props.accountId; const sequence = ++targetLoadSeq; targetLoading.value = true; try { const data = await getOperatorGrowthTargets(account); if (sequence !== targetLoadSeq || props.accountId !== account) return; const mapped = {}; const remoteIds = new Set(); (Array.isArray(data?.items) ? data.items : []).forEach(item => { const id = item?.operator_id || item?.operatorId; if (id) { remoteIds.add(id); mapped[id] = normalizedTargetItem(item) } }); targets.value = mapped; await migrateLocalTargets(account, remoteIds); if (sequence === targetLoadSeq && props.accountId === account) cacheTargets() } catch (err) { if (sequence !== targetLoadSeq || props.accountId !== account) return; targets.value = readLocalTargets(); targetError.value = targetErrorMessage(err, '养成目标同步失败，当前显示本地缓存') } finally { if (sequence === targetLoadSeq && props.accountId === account) targetLoading.value = false } }
function resetTargetInput(row, field, event) { event.target.value = targetFor(planRows.value.find(item => item.id === row.id) || row)[field] }
async function setTarget(row, field, event) {
  const id = row?.id, account = props.accountId, sequence = targetLoadSeq
  if (!id || cloudBlocked.value || schedulePending.value || targetLoading.value || targetBusyIds.value.has(id)) return false
  const current = currentMap.value[id] || {}, target = { ...targetFor(row) }
  const raw = event?.target ? event.target.value : event
  if (event?.target?.validity?.badInput || raw === '') { if (event?.target) resetTargetInput(row, field, event); return false }
  const max = field === 'level' ? 100 : field === 'elite' ? 17 : 31
  target[field] = Math.min(max, Math.max(Number(current[field]) || 0, Math.trunc(Number(raw)) || 0))
  const eliteLimit = Math.min(17, Math.max(0, Math.floor(target.level / 5) - 3))
  if (field === 'elite' || field === 'level') target.elite = Math.max(Number(current.elite) || 0, Math.min(target.elite, eliteLimit))
  if (target[field] === targetFor(row)[field]) { if (event?.target) resetTargetInput(row, field, event); return true }
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
    body[field === 'starLevel' ? 'star_level' : field] = target[field]
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

watch(() => [props.accountId, props.isLoggedIn], () => { currentItems.value = {}; currentAgents.value = {}; closeStarTarget(); undoWorkspace.value = null; planError.value = ''; planNotice.value = ''; removePromptRow.value = null; removePromptBusy.value = false }, { immediate: true })
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
.growth-tracker { --planner-page: #f5efe7; --planner-card: #fffaf3; --planner-line: #eadfce; --planner-muted: #988575; --planner-deep: #6c533e; --planner-gold: #b79050; --planner-gain: #6d9474; --planner-spend: #b75c53; min-width: 0; max-width: 100%; margin-top: 18px; padding: 22px; overflow-x: clip; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); color: var(--ink); }
.planner-cloud-fields { min-width: 0; margin: 0; padding: 0; border: 0; }
.cloud-status { margin-top: 12px; color: var(--ink-60); font-size: 12px; }
.cloud-recovery, .cloud-migration { margin-top: 12px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); font-size: 13px; line-height: 1.7; }
.cloud-recovery { color: var(--rouge); }
.cloud-migration h3 { font: 800 18px var(--font-s); }
.cloud-migration ul { padding-left: 20px; }
.cloud-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.cloud-actions button, .cloud-recovery > button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); }
.planner-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding-bottom: 18px; border-bottom: 1px dashed var(--line); }
.section-kicker, .card-kicker, .goal-kicker { display: block; color: var(--accent-strong); font-size: 11px; font-weight: 800; }
.planner-heading h2 { margin-top: 6px; color: var(--ink); font: 900 23px/1.28 var(--font-s); }
.planner-heading p { max-width: 760px; margin-top: 6px; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
button, input, select { font: inherit; }
button { cursor: pointer; touch-action: manipulation; }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.planner-refresh { display: inline-flex; min-height: 44px; align-items: center; gap: 7px; padding: 0 13px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); color: var(--ink); font: 700 12px var(--font-b); }
.planner-refresh:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
.planner-refresh:disabled { opacity: .55; cursor: wait; }
.spin { animation: planner-spin .9s linear infinite; }
@keyframes planner-spin { to { transform: rotate(360deg); } }
.panel, .planner-card { border: 1px solid rgba(174, 137, 83, .24); border-radius: 18px; background: rgba(255, 250, 243, .97); box-shadow: 0 8px 24px rgba(80, 55, 30, .035); }
.planner-state { display: flex; min-height: 96px; align-items: center; justify-content: center; gap: 8px; padding: 20px; color: var(--ink-60); font-size: 13px; text-align: center; }
.planner-state.is-error { border-radius: 12px; background: rgba(166, 81, 74, .07); color: var(--rouge); }
.planner-state button, .planner-notice button { border: 0; background: transparent; color: var(--accent-strong); font-weight: 800; text-decoration: underline; }
.planner-state.empty { min-height: 80px; margin-top: 14px; border: 1px dashed var(--line); border-radius: 12px; }
.planner-error { margin: 8px 0; color: var(--rouge); font-size: 12px; line-height: 1.6; }
.planner-notice { display: flex; align-items: center; gap: 7px; margin: 10px 0; color: var(--accent-strong); font-size: 12px; }
.planner-inline-notice { display: block; }
.planner-status { margin-top: 18px; padding-top: 4px; }
.status-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--surface); }
.status-metric { position: relative; min-width: 0; min-height: 112px; padding: 17px; border-left: 1px solid var(--line); background: var(--surface); }
.status-metric:first-child { border-left: 0; }
.status-metric-primary { background: var(--cream); }
.status-metric span { display: block; padding-right: 8px; color: var(--ink-60); font-size: 11px; font-weight: 800; }
.status-metric strong { display: block; margin-top: 10px; color: var(--ink); font: 900 28px/1 var(--font-d); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.metric-explanation { margin: 8px 0 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.status-metric-primary strong { color: var(--accent-strong); font-size: 30px; }
.status-metric strong.negative { color: var(--rouge); }
.status-metric strong small { margin-left: 5px; color: var(--accent-strong); font: 800 10px/1 var(--font-b); }
.planner-view { display: grid; gap: 12px; }.plan-badge { display: inline-flex; min-height: 24px; align-items: center; padding: 0 10px; border: 1px solid rgba(155, 122, 70, .12); border-radius: 999px; background: #f7eddc; color: #8a6a38; font-size: 10px; font-weight: 780; white-space: nowrap; }.plan-badge.manual { background: #f0e8f6; color: #7e6699; }.plan-badge.exact { border-color: var(--yellow-deep); background: var(--yellow); color: var(--ink); }
.display-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }.planner-card { min-width: 0; padding: 18px; }.card-heading, .ledger-heading, .compare-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }.card-heading h3 { margin-top: 3px; color: var(--ink); font: 900 18px/1.3 var(--font-s); }.card-heading p { margin-top: 4px; color: var(--planner-muted); font-size: 11px; line-height: 1.5; }.day-plan { display: grid; align-content: start; gap: 14px; }.gain b, .gain-text, .gain-total b { color: var(--planner-gain); }.spend b, .spend-text, .spend-total b { color: var(--planner-spend); }.coin-spend b { color: var(--accent); }.flow-section { padding-top: 14px; }.flow-section + .flow-section { margin-top: 11px; border-top: 1px solid var(--planner-line); }.day-plan .flow-section { padding-top: 0; }.day-plan .flow-section + .flow-section { margin-top: 0; padding-top: 14px; border-top: 1px dashed var(--planner-line); }.flow-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; color: #877462; font-size: 13px; font-weight: 780; }.channel-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }.channel-chip { --channel: #887e8f; display: inline-flex; min-height: 38px; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid color-mix(in srgb, var(--channel) 20%, #d9cbb9); border-radius: 11px; background: color-mix(in srgb, var(--channel) 8%, #fffaf4); color: color-mix(in srgb, var(--channel) 84%, #34291f); font-size: 12px; font-weight: 780; font-variant-numeric: tabular-nums; }.channel-chip small { color: color-mix(in srgb, var(--channel) 68%, #6f6258); font-size: 11px; }.channel-chip strong { margin-left: 6px; font-size: 12px; }.channel-dot, .channel-label i, .swatch i { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--channel); }.channel-chip strong { color: var(--planner-gain); }.channel-chip:not(.natural):not(.meal):not(.buy):not(.mail):not(.event):not(.gift) strong { color: var(--planner-spend); }.flow-empty { color: var(--planner-muted); font-size: 12px; }.balance-warning { display: flex; align-items: flex-start; gap: 6px; margin-top: 14px; padding: 9px 10px; border-radius: 9px; background: rgba(166, 81, 74, .07); color: var(--rouge); font-size: 11px; line-height: 1.6; }.day-plan .balance-warning { margin-top: 0; }
.progress-card { display: flex; flex-direction: column; }.progress-tags { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }.progress-tag { padding: 5px 8px; border: 1px solid rgba(155, 122, 70, .1); border-radius: 10px; background: #f6eee1; color: #8f7b68; font-size: 10px; font-weight: 730; white-space: nowrap; }.progress-tag.key { background: #f0e8f6; }.progress-tag b { color: var(--ink); }.progress-list { display: grid; gap: 13px; margin-top: 16px; }.progress-item { display: grid; gap: 6px; }.progress-item-head, .progress-item-foot { display: flex; justify-content: space-between; gap: 8px; color: var(--planner-muted); font-size: 11px; }.progress-item-head > span:first-child { color: var(--ink); font-size: 13px; font-weight: 800; }.progress-item-head b, .progress-item-foot b { color: var(--planner-gain); }.progress-track { position: relative; height: 10px; overflow: hidden; border-radius: 999px; background: #efe4d4; }.progress-track i { position: absolute; top: 0; bottom: 0; display: block; }.progress-current { left: 0; background: #c48b4d; }.progress-old { left: 0; background: #c48b4d; }.progress-today { background: #e8bc6c; }.progress-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; padding-top: 16px; color: var(--planner-muted); font-size: 10px; }.progress-legend span { display: inline-flex; align-items: center; gap: 4px; }.progress-legend i { width: 10px; height: 6px; border-radius: 99px; }.legend-current { background: #c48b4d; }.legend-old { background: #c48b4d; }.legend-today { background: #e8bc6c; }.planner-footnote { color: var(--ink-60); font-size: 11px; line-height: 1.7; }
.edit-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; align-items: start; }.planner-sidebar { position: sticky; top: 10px; padding: 12px; }.side-section { padding: 12px 0; }.side-section + .side-section { border-top: 1px solid var(--planner-line); }.side-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 820; }.side-hint { color: var(--planner-muted); font-size: 9px; font-weight: 600; }.side-explain, .drag-note, .purchase-note, .side-details p, .field-help, .goal-panel > p { color: var(--planner-muted); font-size: 10px; line-height: 1.6; }.side-explain { margin-top: 8px; }.strategy-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; border: 1px solid var(--planner-line); border-radius: 10px; background: #f6ecdc; }.strategy-switch button { min-height: 38px; padding: 6px 5px; border: 0; border-radius: 7px; background: transparent; color: #8d7966; font-size: 10px; font-weight: 780; }.strategy-switch button.active { background: var(--planner-deep); color: #fff; }
.edit-roster { display: grid; grid-auto-rows: 184px; align-content: start; gap: 6px; min-height: 948px; max-height: 948px; overflow: auto; padding: 2px; }.edit-roster-item { display: grid; grid-template-columns: 14px 28px minmax(0, 1fr) auto; align-items: center; gap: 5px; padding: 7px 5px; border: 1px solid var(--planner-line); border-radius: 10px; background: var(--planner-card); }.edit-roster-item:hover { border-color: var(--accent); }.drag-handle { color: #b19f8c; cursor: grab; font-size: 12px; letter-spacing: -3px; }.edit-roster-name { min-width: 0; }.edit-roster-name b, .edit-roster-name small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.edit-roster-name b { font-size: 11px; }.edit-roster-name small { margin-top: 2px; color: var(--planner-muted); font-size: 9px; }.move-buttons { display: flex; flex-direction: column; gap: 2px; }.move-buttons button { display: grid; width: 24px; height: 22px; place-items: center; padding: 0; border: 1px solid var(--planner-line); border-radius: 5px; background: #f2e6d3; color: #8f7c6b; }.move-buttons button:disabled { opacity: .35; cursor: not-allowed; }.target-fields { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding-top: 5px; border-top: 1px dashed var(--planner-line); }.target-fields label, .setting-line label, .ledger-input-wrap label, .goal-panel label { display: flex; flex-direction: column; gap: 4px; color: var(--planner-muted); font-size: 9px; font-weight: 750; }.target-fields input, .counter input, .ledger-input-wrap input, .goal-panel input { width: 100%; min-width: 0; min-height: 36px; padding: 6px 7px; border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); font: 700 11px var(--font-d); }.drag-note { margin-top: 7px; }.setting-line { display: flex; align-items: center; justify-content: space-between; gap: 7px; margin-top: 8px; }.setting-line label { color: var(--ink); font-size: 10px; }.counter { display: flex; overflow: hidden; border: 1px solid var(--planner-line); border-radius: 8px; }.counter button { width: 30px; min-height: 36px; border: 0; background: #f4e9d8; color: var(--ink); font-size: 16px; }.counter input { width: 42px; min-height: 36px; border: 0; border-right: 1px solid var(--planner-line); border-left: 1px solid var(--planner-line); border-radius: 0; background: var(--planner-card); text-align: center; }.purchase-note { margin-top: 7px; }
.side-actions { display: grid; gap: 6px; margin-top: 10px; }.side-button, .back-button, .action-button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; border: 1px solid var(--planner-line); border-radius: 9px; background: var(--planner-card); color: var(--ink); font-size: 10px; font-weight: 800; }.side-button:hover, .back-button:hover, .action-button:hover { border-color: var(--accent); }.side-button.primary, .action-button.primary { border-color: var(--planner-deep); background: var(--planner-deep); color: #fff; }.side-button.goal { border-color: #e5d8ef; background: #f0e8f6; color: #7e6699; }.side-details summary { color: var(--ink); font-size: 11px; font-weight: 800; cursor: pointer; }.training-levels { display: grid; gap: 7px; margin-top: 9px; }.training-levels label { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--ink-60); font-size: 12px; }.training-level-select { flex: 0 1 132px; width: 132px; }
.goal-panel { padding: 8px 2px 2px; }.goal-panel h3 { margin-top: 4px; color: var(--ink); font: 900 20px var(--font-s); }.goal-panel > p { margin-top: 6px; }.goal-panel label { margin-top: 14px; color: var(--ink); font-size: 11px; }.goal-panel input { min-height: 44px; margin-top: 1px; font-size: 15px; }.field-help { margin-top: 4px; }.goal-shortcuts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 12px; }.goal-shortcuts button { min-height: 32px; padding: 0 9px; border: 1px solid var(--planner-line); border-radius: 8px; background: var(--planner-card); color: var(--planner-muted); font-size: 10px; font-weight: 800; }.goal-shortcuts button.active { border-color: var(--planner-deep); background: var(--planner-deep); color: #fff; }.goal-result { margin-top: 14px; padding: 11px; border: 1px solid rgba(166, 81, 74, .2); border-radius: 11px; background: rgba(166, 81, 74, .06); }.goal-result.feasible { border-color: rgba(109, 148, 116, .3); background: rgba(109, 148, 116, .08); }.goal-result-title { color: var(--ink); font-size: 12px; font-weight: 850; }.goal-result p { margin-top: 7px; color: var(--rouge); font-size: 10px; line-height: 1.6; }.goal-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 9px; }.goal-metrics div { padding: 8px; border: 1px solid rgba(149, 126, 100, .1); border-radius: 8px; background: rgba(255, 255, 255, .58); }.goal-metrics span, .goal-metrics b { display: block; }.goal-metrics span { color: var(--planner-muted); font-size: 9px; }.goal-metrics b { margin-top: 3px; color: var(--ink); font: 800 13px var(--font-d); }.back-button { width: 100%; margin-top: 12px; }
.editor-main { display: grid; min-width: 0; gap: 12px; }.ledger-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.ledger-card { padding: 12px; }.ledger-heading h3, .compare-heading h3 { color: var(--ink); font-size: 13px; }.ledger-heading span, .compare-heading span { color: var(--planner-muted); font-size: 9px; }.ledger-row { display: grid; grid-template-columns: minmax(100px, 1fr) 82px 55px 26px; align-items: center; gap: 7px; padding: 10px 0; border-top: 1px solid var(--planner-line); }.ledger-row:first-of-type { margin-top: 5px; }.ledger-label-wrap { display: grid; min-width: 0; gap: 5px; }.channel-label { --channel: #887e8f; display: inline-flex; width: max-content; max-width: 100%; align-items: center; gap: 5px; padding: 4px 7px; border: 1px solid color-mix(in srgb, var(--channel) 20%, #d9cbb9); border-radius: 8px; background: color-mix(in srgb, var(--channel) 9%, white); color: color-mix(in srgb, var(--channel) 82%, #34291f); font-size: 12px; line-height: 1.5; font-weight: 750; overflow-wrap: anywhere; }.channel-label i { width: 6px; height: 6px; }.ledger-input-wrap { display: flex; align-items: center; gap: 4px; }.ledger-input-wrap label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }.ledger-input-wrap input { width: 50px; min-height: 34px; padding: 4px; border: 0; border-bottom: 1px solid #cdb997; border-radius: 0; background: transparent; text-align: right; }.ledger-input-wrap > span { padding-bottom: 0; color: var(--planner-muted); font-size: 8px; white-space: nowrap; }.recommendation { padding-top: 0; color: var(--planner-muted); font-size: 8px; text-align: right; }.row-remove { display: grid; width: 26px; height: 32px; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--planner-muted); }.row-remove:hover { background: rgba(166, 81, 74, .08); color: var(--rouge); }.add-wrap { position: relative; margin-top: 6px; }.add-button { display: inline-flex; width: 100%; min-height: 36px; align-items: center; justify-content: center; gap: 5px; border: 1px dashed var(--planner-line); border-radius: 8px; background: var(--planner-card); color: var(--planner-muted); font-size: 10px; font-weight: 780; }.add-menu { position: absolute; z-index: 20; bottom: calc(100% + 5px); left: 0; width: min(100%, 320px); max-height: min(360px, 60vh); overflow-y: auto; overscroll-behavior: contain; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 6px; border: 1px solid var(--planner-line); border-radius: 10px; background: var(--planner-card); box-shadow: 0 12px 26px rgba(70, 50, 32, .14); }.add-menu button { display: flex; min-width: 0; min-height: 44px; align-items: center; gap: 8px; padding: 8px; border: 0; border-radius: 6px; background: transparent; color: var(--tea); font: 13px/1.5 var(--font-b); text-align: left; overflow-wrap: anywhere; }.add-menu button:hover { background: var(--cream); }.ledger-total { display: flex; align-items: baseline; justify-content: space-between; margin-top: 7px; padding-top: 8px; border-top: 1px dashed var(--planner-line); color: var(--planner-muted); font-size: 10px; }.ledger-total b { font: 850 15px var(--font-d); }.compare-card { padding: 12px; }.compare-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 9px; }.compare-option { min-width: 0; padding: 10px; border: 1px solid rgba(149, 126, 100, .13); border-radius: 11px; background: var(--planner-card); }.compare-option.active { border-color: #d1b88b; background: #f8f1e5; }.compare-option span, .compare-option small, .compare-option em { display: block; color: var(--planner-muted); font-size: 8px; line-height: 1.5; }.compare-option b { display: block; margin-top: 2px; font-size: 10px; }.compare-option strong { display: block; margin-top: 5px; font: 860 18px var(--font-d); }.compare-option em { margin-top: 4px; color: var(--accent-strong); font-style: normal; }.editor-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; }.editor-actions p { max-width: 560px; color: var(--planner-muted); font-size: 10px; line-height: 1.6; }.editor-actions > div { display: flex; gap: 6px; flex-wrap: wrap; }.action-button { min-height: 38px; }
@media (max-width: 1080px) { .edit-grid { grid-template-columns: 270px minmax(0, 1fr); } }
@media (max-width: 900px) { .display-grid, .edit-grid, .ledger-grid, .notes-grid { grid-template-columns: 1fr; }.planner-sidebar { position: static; } }
@media (max-width: 640px) { .growth-tracker { padding: 15px; border-radius: 17px; }.planner-heading { flex-direction: column; }.planner-heading h2 { font-size: 21px; }.planner-refresh { width: 100%; justify-content: center; }.status-metrics { grid-template-columns: 1fr 1fr; }.status-metric:nth-child(3), .status-metric:nth-child(4) { border-top: 1px solid var(--planner-line); }.status-metric:nth-child(3) { border-left: 0; }.planner-card { padding: 14px; }.card-heading { flex-direction: column; }.progress-tags { justify-content: flex-start; }.compare-grid { grid-template-columns: 1fr; }.ledger-row { grid-template-columns: minmax(90px, 1fr) 72px 50px 24px; }.editor-actions { align-items: stretch; flex-direction: column; }.editor-actions > div { width: 100%; }.action-button { flex: 1; }.target-fields input, .counter input, .counter button, .ledger-input-wrap input, .goal-panel input { min-height: 44px; }.add-menu { grid-template-columns: 1fr; } }
/* The planner is a user-facing tool: the status header carries the visual identity,
   followed by the always-visible roster and schedule. */
.status-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 14px 0 18px; }
.status-title { min-width: 0; flex: 1 1 auto; }
.status-title h2 { margin-top: 5px; color: var(--ink); font: 900 25px/1.22 var(--font-s); letter-spacing: .02em; }
.status-actions, .workspace-head-actions, .edit-toolbar-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.status-action, .workspace-link, .workspace-return, .toolbar-button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; border: 1px solid var(--planner-line); border-radius: 10px; background: rgba(255, 253, 246, .84); color: var(--ink); font-size: 11px; font-weight: 800; }
.status-action:hover, .workspace-link:hover, .toolbar-button:hover { border-color: var(--accent); color: var(--accent-strong); }
.workspace-link { flex: none; width: 44px; min-width: 44px; height: 44px; min-height: 44px; padding: 0; vertical-align: middle; }
.workspace-link > svg { flex: none; }
.outside-manual-date { display: inline-flex; align-items: center; gap: 6px; margin: 4px 8px 0 0; }
.status-action.primary { border-color: var(--planner-deep); background: var(--planner-deep); color: var(--cream); }
.status-sync-note { display: inline-flex; align-items: center; gap: 6px; margin: 0 22px 10px; color: var(--accent-strong); font-size: 10px; }
.status-rule { display: flex; align-items: center; gap: 10px; padding: 16px 0 12px; color: #9d7c4e; font: 700 10px var(--font-s); letter-spacing: .16em; }
.status-rule span { height: 1px; flex: 1; background: linear-gradient(90deg, transparent, rgba(183, 144, 80, .35)); }
.status-rule span:last-child { transform: scaleX(-1); }
.status-rule i { font-style: normal; white-space: nowrap; }
.planner-status .status-roster { display: block; padding: 0; }
.planner-status .status-metrics { margin-top: 0; }
.planner-status .status-metric { padding: 17px; }
.planner-status .status-metric-primary { background: var(--cream); }
.growth-card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; gap: 14px; margin-top: 0; }
.growth-card { --growth-rarity-accent: var(--yellow-deep); --growth-rarity-border: var(--yellow-deep); --growth-rarity-start: var(--cream); position: relative; align-self: start; min-width: 0; padding: 14px 12px; border: 1px solid var(--growth-rarity-border); border-top: 3px solid var(--growth-rarity-accent); border-radius: 15px; background: linear-gradient(180deg, var(--growth-rarity-start), var(--surface)); box-shadow: 0 4px 12px rgba(73, 59, 44, .04); }
.growth-card.rarity-r5 { --growth-rarity-accent: var(--yellow-deep); }
.growth-card.rarity-r4 { --growth-rarity-accent: #a996c5; --growth-rarity-border: color-mix(in srgb, #a996c5 58%, var(--line)); --growth-rarity-start: color-mix(in srgb, #8672b2 8%, var(--cream)); }
.growth-card.rarity-r3 { --growth-rarity-accent: #bfcee0; --growth-rarity-border: color-mix(in srgb, #bfcee0 58%, var(--line)); --growth-rarity-start: color-mix(in srgb, #99b5cf 8%, var(--cream)); }
.growth-card.complete { border-color: var(--yellow-deep); border-top-width: 3px; background: linear-gradient(160deg, var(--paper), color-mix(in srgb, var(--yellow) 65%, var(--paper))); }
.tracker-remove { display: flex; min-height: 36px; align-items: center; justify-content: center; gap: 5px; width: 100%; margin-top: 12px; padding: 6px 8px; border: 1px solid var(--planner-line); border-radius: 8px; background: var(--surface); color: var(--ink-60); font-size: 11px; font-weight: 700; }
.tracker-remove:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
.tracker-dialog-enter-active, .tracker-dialog-leave-active { transition: opacity .2s var(--ease); }
.tracker-dialog-enter-active .tracker-remove-dialog, .tracker-dialog-leave-active .tracker-remove-dialog { transition: transform .2s var(--ease); }
.tracker-dialog-enter-from, .tracker-dialog-leave-to { opacity: 0; }
.tracker-dialog-enter-from .tracker-remove-dialog, .tracker-dialog-leave-to .tracker-remove-dialog { transform: translateY(12px) scale(.98); }
.tracker-remove-dialog-mask { position: fixed; z-index: 220; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(73, 59, 44, .5); backdrop-filter: blur(3px); }
.tracker-remove-dialog { width: min(520px, 100%); overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); color: var(--ink); box-shadow: 0 30px 70px rgba(73, 59, 44, .3); }
.tracker-remove-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 18px 20px 0; }
.tracker-remove-dialog-head h3 { margin-top: 4px; color: var(--ink); font: 900 18px/1.3 var(--font-s); }
.tracker-dialog-close { display: grid; width: 32px; height: 32px; flex: none; place-items: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--planner-muted); }
.tracker-dialog-close:hover:not(:disabled) { background: var(--paper); color: var(--ink); }
.tracker-dialog-close:disabled, .tracker-dialog-button:disabled { opacity: .55; cursor: wait; }
.tracker-remove-dialog-body { display: flex; align-items: flex-start; gap: 10px; padding: 20px; }
.tracker-remove-dialog-body > svg { flex: none; color: var(--rouge); }
.tracker-remove-dialog-body p { color: var(--ink); font-size: 13px; font-weight: 800; line-height: 1.6; }
.tracker-remove-dialog-body small { display: block; margin-top: 6px; color: var(--planner-muted); font-size: 10px; line-height: 1.6; }
.tracker-remove-dialog-error { margin: 0 20px 14px; color: var(--rouge); font-size: 11px; line-height: 1.6; }
.tracker-remove-dialog-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; padding: 0 20px 18px; }
.tracker-dialog-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; padding: 7px 11px; border: 1px solid var(--planner-line); border-radius: 8px; background: var(--paper); color: var(--ink); font-size: 10px; font-weight: 800; }
.tracker-dialog-button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-strong); }
.tracker-dialog-button.discard { border-color: rgba(166, 81, 74, .2); color: var(--rouge); }
.tracker-dialog-button.primary { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.tracker-dialog-button.primary:hover:not(:disabled) { border-color: var(--accent); color: var(--cream); }
.growth-complete { display: grid; gap: 8px; }
.growth-complete-status { display: flex; min-height: 24px; align-items: center; gap: 6px; color: var(--planner-gain); font-size: 11px; font-weight: 800; }
.growth-complete-status svg { flex: none; }
.growth-complete .tracker-remove { margin-top: 0; }
.growth-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.growth-identity { display: flex; min-width: 0; align-items: center; gap: 9px; }
.growth-identity :deep(.operator-avatar) { width: 42px; height: 42px; border-radius: 9px; }
.growth-identity :deep(.operator-avatar img) { border-radius: 7px; }
.growth-identity > div { min-width: 0; }
.growth-identity h3 { overflow: hidden; color: var(--ink); font: 850 14px/1.3 var(--font-s); text-overflow: ellipsis; white-space: nowrap; }
.growth-identity p { margin-top: 3px; overflow: hidden; color: var(--planner-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.growth-identity-meta { display: flex; align-items: center; gap: 5px; }
.growth-prof-list { display: inline-flex; min-width: 0; align-items: center; gap: 5px; }
.growth-prof { display: inline-flex; align-items: center; gap: 3px; }
.growth-prof img { width: 12px; height: 12px; flex: none; object-fit: contain; }
.growth-prof-fallback, .growth-identity-separator { flex: none; }
.growth-mobile-status { display: none; }
.growth-percent { color: var(--planner-deep); font: 850 20px var(--font-d); }
.growth-card.complete .growth-percent { color: #b88507; }
.growth-percent small { margin-left: 2px; font: 700 10px var(--font-b); }
.growth-progress-list { display: grid; gap: 10px; margin-top: 14px; }
.growth-progress-row { position: relative; display: grid; gap: 5px; }
.growth-progress-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; color: var(--planner-muted); font-size: 10px; }
.growth-progress-label > span { font-weight: 800; }
.growth-progress-side-label { flex: none; color: var(--planner-muted); font: 750 10px/1.3 var(--font-b); white-space: nowrap; }
.growth-progress-label b { color: var(--ink); font: 750 10px/1.3 var(--font-d); white-space: nowrap; }
.progress-values { display: inline-flex; align-items: center; gap: 5px; min-width: 0; font-family: var(--font-d); }
.growth-progress-label .progress-values { font: 750 10px/1.3 var(--font-d); }
.growth-progress-label .tracker-number-input, .growth-progress-label .tracker-star-trigger { font: 750 10px/1.3 var(--font-d); }
.growth-progress-row > small { overflow: hidden; color: var(--planner-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.heart-gap { color: var(--planner-muted); font-weight: inherit; }
.heart-gap-number { color: var(--rouge); font: inherit; font-weight: inherit; }
.heart-progress-note { overflow: visible !important; line-height: 1.5; text-overflow: clip !important; white-space: normal !important; }
.growth-track { height: 7px; overflow: hidden; border-radius: 99px; background: #efe4d4; }
.growth-track i { display: block; height: 100%; border-radius: inherit; background: #c48b4d; transition: width .2s ease; }
.growth-track.mint i { background: #88b296; }
.growth-track.rose i { background: #b88ba2; }
.growth-quick-action { display: inline-grid; width: 32px; min-width: 32px; height: 32px; min-height: 32px; flex: none; place-items: center; padding: 0; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink-60); cursor: pointer; }
.growth-quick-action svg { display: block; }
.growth-quick-action:hover:not(:disabled) { border-color: var(--accent); background: var(--yellow); color: var(--ink); }
.growth-quick-action:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
.growth-quick-action.is-ready { border-color: #c9d8c5; background: #eef5ec; color: #6f846b; }
.growth-quick-action.is-lack { border-color: #e4c49c; background: #fbf1e3; color: #a66f2e; }
.growth-quick-action.is-complete, .growth-quick-action:disabled { border-color: var(--line); background: rgba(73, 59, 44, .08); color: var(--ink-60); opacity: .72; cursor: not-allowed; }
.growth-action-notice { margin: 7px 0 0; color: var(--accent-strong); font-size: 10px; font-weight: 750; line-height: 1.5; }
.growth-materials { margin-top: 10px; padding-top: 0; border-top: 0; }
.growth-materials summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--ink); font-size: 10px; font-weight: 800; cursor: pointer; }
.growth-materials summary span { color: var(--planner-muted); font-size: 9px; font-weight: 600; }
.growth-material-chips { display: grid; gap: 5px; margin-top: 8px; }
.growth-material-chip { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 5px; padding: 6px 7px; border-radius: 8px; background: #f8f0e4; color: var(--ink); font-size: 9px; }
.growth-material-icon { width: 16px; height: 16px; flex: none; object-fit: contain; border-radius: 4px; }
.growth-material-chip b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.growth-material-chip em { display: inline-flex; min-width: 0; align-items: baseline; gap: 3px; overflow: hidden; color: var(--rouge); font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.growth-material-chip .growth-material-eta { margin-left: 8px; }
.growth-material-chip small { min-width: 0; overflow: hidden; color: var(--planner-muted); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.experience-chip em { color: var(--accent-strong); }
.heart-history { grid-column: 2 / -1; display: grid; min-width: 0; max-width: 100%; gap: 3px; padding-top: 1px; color: var(--planner-muted); }
.heart-history-label { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 6px; font-size: 8px; line-height: 1.35; }
.heart-history-label small { flex: none; }
.heart-history-bars { display: grid; width: 100%; min-width: 0; height: 22px; grid-template-columns: repeat(30, minmax(0, 1fr)); align-items: end; gap: 2px; overflow: hidden; }
.heart-history-bar { display: block; min-width: 0; max-width: 100%; border-radius: 2px 2px 0 0; background: var(--accent); opacity: .68; }
.heart-history-empty { min-height: 22px; display: flex; align-items: center; color: var(--planner-muted); font-size: 8px; line-height: 1.35; }
.growth-material-note { margin-top: 8px; color: var(--planner-muted); font-size: 9px; line-height: 1.6; }
.tracker-editable { min-height: 28px; padding: 2px; border: 0; border-bottom: 1px dashed var(--accent); border-radius: 0; background: transparent; color: var(--ink); font: 700 13px var(--font-d); }
.tracker-editable:hover:not(:disabled) { color: var(--accent-strong); }
.tracker-editable:focus { border-bottom-color: var(--accent-strong); background: var(--surface); }
.tracker-editable:disabled, .tracker-star-popover :disabled { opacity: .58; cursor: wait; }
.tracker-number-input { width: 4ch; min-width: 32px; text-align: center; appearance: textfield; cursor: text; }
.tracker-number-input::-webkit-outer-spin-button, .tracker-number-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.target-star-select { width: 100%; }
.tracker-star-anchor { position: relative; }
.tracker-star-trigger { cursor: pointer; white-space: nowrap; }
.tracker-star-popover { position: absolute; z-index: 20; top: calc(100% + 7px); right: 0; left: 0; display: flex; flex-direction: column; gap: 9px; padding: 10px; border: 1px solid var(--accent); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 25px rgba(73, 59, 44, .22); }
.tracker-star-popover::before { position: absolute; top: -6px; right: 20px; width: 10px; height: 10px; border-top: 1px solid var(--accent); border-left: 1px solid var(--accent); background: var(--surface); content: ''; transform: rotate(45deg); }
.tracker-popover-title { display: flex; align-items: center; gap: 4px; color: var(--brand-blue); font-size: 11px; line-height: 1.5; }
.tracker-popover-title svg { flex: none; }
.tracker-star-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.tracker-star-controls select { width: 100%; min-width: 0; min-height: 40px; padding: 6px; border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); font-size: 10px; }
.tracker-popover-actions { display: flex; justify-content: space-between; gap: 8px; }
.tracker-popover-actions button { min-height: 32px; padding: 5px 10px; border: 1px solid transparent; border-radius: 5px; background: var(--planner-deep); color: var(--cream); font-size: 10px; font-weight: 800; }
.tracker-popover-actions button.cancel { background: var(--paper); color: var(--ink-60); }
.tracker-popover-actions button:hover:not(:disabled) { border-color: var(--accent); }
.growth-tracker.planner-expanded { display: flex; flex-direction: column; }
.growth-tracker.planner-expanded > .planner-workspace { order: 2; }
.planner-workspace { display: grid; min-width: 0; max-width: 100%; gap: 12px; margin-top: 18px; padding-top: 18px; overflow-x: clip; border-top: 1px solid rgba(183, 144, 80, .28); scroll-margin-top: 16px; }
.planner-workspace-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.workspace-heading-content { min-width: 0; }
.workspace-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
.plan-heading-actions { display: flex; gap: 4px; }
.plan-heading-actions .plan-icon { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--ink-60); cursor: pointer; }
.plan-heading-actions .plan-icon:hover:not(:disabled) { background: var(--paper); color: var(--tea); }
.plan-heading-actions .plan-icon:disabled { opacity: .5; cursor: default; }
.plan-heading-actions .plan-icon:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.schedule-action-dialog { margin: auto; padding: 0; max-height: calc(100dvh - 40px); overflow-y: auto; }
.schedule-action-dialog::backdrop { background: rgba(73, 59, 44, .5); backdrop-filter: blur(3px); }
.schedule-action-dialog .tracker-dialog-button, .schedule-action-dialog .tracker-dialog-close { min-height: 44px; min-width: 44px; font-size: 12px; }
.planner-workspace-head h2 { display: flex; align-items: center; min-height: 44px; margin: 0; color: var(--ink); font: 900 20px/1.3 var(--font-s); }
.planner-workspace-head p { max-width: 720px; margin-top: 5px; color: var(--planner-muted); font-size: 11px; line-height: 1.6; }
.workspace-return { flex: none; min-height: 44px; color: var(--ink); }
.workspace-return:hover { border-color: var(--rouge); color: var(--rouge); }
.planner-view, .planner-display, .planner-edit, .editor-main, .edit-grid, .settings-panel, .ledger-grid { min-width: 0; max-width: 100%; }

@media (min-width: 901px) { .edit-grid { grid-template-columns: 292px minmax(0, 1fr); } }
.planner-sidebar { top: 16px; }
.edit-roster-item { grid-template-columns: 16px 46px minmax(0, 1fr) 30px; gap: 7px; padding: 8px 7px; }
.edit-roster-item :deep(.operator-avatar) { width: 46px; height: 46px; }
.roster-remove { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--planner-muted); }
.roster-remove:hover { border-color: rgba(166, 81, 74, .2); background: rgba(166, 81, 74, .08); color: var(--rouge); }
.edit-roster-name b { font-size: 12px; }
.edit-roster-name small { font-size: 10px; }
 .planning-panel { min-width: 0; overflow: hidden; border: 1px solid var(--planner-line); border-radius: 14px; background: var(--surface); }
.planning-panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 18px 10px; }
.planning-panel-heading h3 { margin: 0; color: var(--tea); font: 900 18px/1.4 var(--font-s); }
.planning-panel-heading p { margin: 5px 0 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.planning-settings-toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; flex-shrink: 0; }
.planning-mode { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 18px 16px; width: fit-content; max-width: calc(100% - 36px); }
.planning-mode button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 16px; border: 1px solid var(--planner-line); border-radius: 9px; background: var(--cream); color: var(--tea); font: 800 13px var(--font-b); cursor: pointer; }
.planning-mode button svg { flex-shrink: 0; }
.planning-mode button.active { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.planning-mode button.goal-mode { border-color: #c8b2d6; background: #faf6fc; color: #7e6699; }
.planning-mode button.goal-mode.active { border-color: #7e6699; background: #f0e8f6; color: #69517f; }
.planning-mode button:hover:not(.active) { border-color: var(--tea); }
.planning-mode button.goal-mode:hover:not(.active) { border-color: #7e6699; }
.planning-mode button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.planning-condition-summary { margin: 0; padding: 0 18px 14px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.planning-panel > .settings-panel { padding: 6px 18px 18px; }
 .goal-conditions label { display: grid; gap: 5px; color: var(--ink); font-size: 12px; }
.goal-conditions input { width: 100%; min-width: 0; min-height: 44px; padding: 8px; border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); font: 13px var(--font-b); }
.goal-days-field { min-width: 0; }
.goal-days-input-wrap { position: relative; display: flex; min-width: 0; align-items: center; border: 1px solid var(--planner-line); border-radius: 9px; background: var(--cream); }
.goal-days-input-wrap:focus-within { outline: 2px solid var(--tea); outline-offset: 2px; }
.goal-days-input-wrap > input { flex: 1; width: 100%; height: 42px; min-height: 42px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; font: 13px 'Archivo', var(--font-b); appearance: textfield; }
.goal-days-input-wrap > input::-webkit-outer-spin-button, .goal-days-input-wrap > input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.goal-date-trigger { display: inline-flex; width: 40px; min-width: 40px; height: 42px; min-height: 42px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--ink); cursor: pointer; }
.goal-date-trigger:hover:not(:disabled) { background: var(--paper); }
.goal-date-trigger:focus-visible { outline: 2px solid var(--tea); outline-offset: 1px; }
.goal-date-popover { position: absolute; z-index: 65; top: calc(100% + 8px); left: -1px; width: calc(100% + 2px); min-width: 0; box-sizing: border-box; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); box-shadow: 0 12px 28px rgba(73, 59, 44, .14); }
.goal-date-popover button { appearance: none; display: inline-flex; min-width: 36px; min-height: 36px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--ink); font: inherit; cursor: pointer; }
.goal-date-popover button:hover:not(:disabled) { background: var(--paper); }
.goal-date-popover button:focus-visible { outline: 2px solid var(--tea); outline-offset: 1px; }
.goal-date-popover button:disabled { opacity: .45; cursor: not-allowed; }
.goal-calendar-context { margin-bottom: 8px; padding: 2px 2px 10px; border-bottom: 1px solid var(--line); }
.goal-calendar-context h4 { margin: 0; color: var(--tea); font: 900 14px/1.5 var(--font-s); }
.goal-calendar-context p { margin: 4px 0 0; color: var(--ink-60); font: 12px/1.6 var(--font-b); }
.goal-calendar-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.goal-calendar-heading strong { font-family: var(--font-s); font-size: 14px; }
.goal-calendar-week, .goal-calendar-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; text-align: center; }
.goal-calendar-week { padding: 5px 0; color: var(--ink-60); font-size: 11px; }
.goal-calendar-days button { min-width: 0; min-height: 34px; font: 12px 'Archivo', var(--font-b); }
.goal-calendar-days button.today { box-shadow: inset 0 0 0 1px var(--line); }
.goal-calendar-days button.selected { background: var(--tea); color: var(--cream); }
.goal-calendar-days button:disabled { background: transparent; color: var(--ink-60); }
.goal-today-button { width: 100%; margin-top: 8px; border-top: 1px solid var(--line) !important; border-radius: 0 !important; font-size: 12px !important; }
.goal-completion-date { margin-top: 7px; color: var(--ink-60); font-size: 11px; line-height: 1.5; }
.goal-completion-date time { color: var(--tea); font-family: var(--font-d); font-weight: 800; }
.goal-date-help { margin-top: 6px; color: var(--planner-muted); font-size: 10px; line-height: 1.5; }
.goal-conditions .goal-shortcuts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.goal-conditions .goal-shortcuts button { min-height: 44px; padding: 6px 9px; }
 .reserve-management { grid-column: 1 / -1; min-width: 0; padding-top: 16px; border-top: 1px solid var(--planner-line); }
.reserve-management-heading, .reserve-packs-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; }
.reserve-management h3, .reserve-management h4 { margin: 0; color: var(--tea); font-size: 13px; }
.reserve-management p { margin: 5px 0 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.reserve-total { color: var(--tea); font-size: 12px; font-variant-numeric: tabular-nums; }
.reserve-management-body { display: grid; grid-template-columns: minmax(140px, .75fr) minmax(0, 2fr); gap: 18px; margin-top: 12px; }
.reserve-initial { padding-right: 18px; border-right: 1px solid var(--planner-line); }
.reserve-initial > label { display: block; margin: 7px 0 8px; font-size: 12px; color: var(--ink); }
.reserve-amount { display: flex; align-items: center; min-width: 0; gap: 6px; }
.reserve-amount span { flex: none; color: var(--ink-60); font-size: 12px; }
.reserve-management input { min-width: 0; width: 100%; min-height: 44px; padding: 8px; border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); font: 13px var(--font-b); }
.reserve-amount input { font-family: var(--font-d); }
.reserve-packs-heading button, .reserve-remove { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 44px; min-height: 44px; }
.reserve-pack-list { display: grid; gap: 6px; max-height: 280px; overflow-y: auto; }
.reserve-pack-row { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(95px, 130px) 44px; align-items: center; gap: 6px; }
.reserve-empty { padding: 8px 0; }
@media (max-width: 640px) { .reserve-management-body { grid-template-columns: 1fr; gap: 12px; }.reserve-initial { display: grid; grid-template-columns: 1fr minmax(100px, 140px); align-items: center; gap: 4px 12px; padding: 0 0 12px; border-right: 0; border-bottom: 1px solid var(--planner-line); }.reserve-initial p { grid-column: 1 / -1; }.reserve-pack-row { grid-template-columns: minmax(70px, 1fr) minmax(80px, 100px) 44px; } }
@media (max-width: 640px) { .planning-panel-heading { align-items: flex-start; flex-wrap: wrap; }.planning-mode { width: auto; }.planning-mode button { flex: 1; }.planning-panel > .settings-panel { padding: 6px 14px 14px; } }
.planner-edit-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; }
.planner-edit-toolbar > div:first-child { display: grid; gap: 3px; }
.planner-edit-toolbar > div:first-child > span { color: var(--ink); font-size: 12px; font-weight: 850; }
.planner-edit-toolbar > div:first-child small { color: var(--planner-muted); font-size: 10px; }
.toolbar-button { min-height: 38px; }
.toolbar-button.active { border-color: var(--planner-deep); background: #f6ecdc; }
.toolbar-button.goal { color: #7e6699; }
.toolbar-button.goal.active { border-color: #c8b2d6; background: #f0e8f6; }
.settings-panel { display: grid; grid-template-columns: 1fr 1.2fr 1.15fr; gap: 15px; padding: 14px; }
.settings-block + .settings-block { padding-left: 15px; border-left: 1px solid var(--planner-line); }
.settings-block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
.settings-block-head h3 { color: var(--ink); font-size: 12px; }
.settings-block-head span { color: var(--planner-muted); font-size: 9px; }
.setting-help { margin-top: 8px; color: var(--planner-muted); font-size: 10px; line-height: 1.6; }
.settings-fields { display: grid; gap: 6px; }
.training-settings-block .training-levels { margin-top: 0; }


.goal-panel { padding: 15px; }
.goal-panel h3 { margin-top: 4px; }
.goal-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
.goal-field-help { display: flex; gap: 15px; margin-top: 5px; color: var(--planner-muted); font-size: 9px; }
.spend-ledger-row .ledger-label-wrap { gap: 6px; }
.ledger-row .row-remove { min-height: 32px; }
.planner-footnote { margin-top: 2px; }

@media (max-width: 1280px) {
  .growth-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1080px) {
  .growth-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .status-main { flex-direction: column; }
  .status-actions { width: 100%; }
  .status-action { flex: 1; }
  .settings-panel { grid-template-columns: 1fr 1fr; }
  .settings-block:last-child { grid-column: 1 / -1; padding-top: 13px; padding-left: 0; border-top: 1px solid var(--planner-line); border-left: 0; }
}
@media (max-width: 640px) {
  .status-main { padding: 14px 0; }
  .status-title h2 { font-size: 22px; }
  .status-rule { padding-right: 0; padding-left: 0; }
  .planner-status .status-roster { padding-right: 0; padding-left: 0; }
  .status-metric { min-height: 108px; padding: 15px 13px; }
  .status-metric strong, .status-metric-primary strong { font-size: 24px; }
  .planner-status .status-metric { padding-right: 13px; padding-left: 13px; }
  .planner-edit-toolbar { align-items: stretch; flex-direction: column; }
  .growth-card-grid { grid-template-columns: 1fr; }
  .workspace-head-actions { width: 100%; justify-content: space-between; }

  .settings-panel, .goal-fields { grid-template-columns: 1fr; }
  .settings-block + .settings-block, .settings-block:last-child { grid-column: auto; padding-top: 13px; padding-left: 0; border-top: 1px solid var(--planner-line); border-left: 0; }
  .edit-toolbar-actions { width: 100%; }
  .toolbar-button { flex: 1; }
  .goal-field-help { justify-content: space-between; }
  .edit-roster-item { grid-template-columns: 16px 44px minmax(0, 1fr) 30px; }
  .edit-roster-item :deep(.operator-avatar) { width: 44px; height: 44px; }
  .tracker-remove-dialog-mask { padding: 14px; }
  .tracker-remove-dialog-actions { align-items: stretch; flex-direction: column; }
  .tracker-dialog-button { width: 100%; }
}
@media (prefers-reduced-motion: reduce) { .spin { animation: none; }.progress-track i, .growth-track i { transition: none; }.planner-workspace { scroll-behavior: auto; } }

.edit-simulation { display: grid; gap: 12px; align-items: start; min-width: 0; }
.edit-simulation .ledger-grid { min-width: 0; grid-template-columns: minmax(0, 1fr); }
.compare-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.compare-option small, .compare-option span, .compare-option em { font-size: 12px; }
.compare-option .action-button { margin-top: 8px; }
@media (min-width: 1280px) { .edit-simulation { grid-template-columns: minmax(0, 1fr) minmax(320px, 1fr); }.edit-simulation .ledger-grid { grid-template-columns: 1fr; }.edit-simulation > .cultivation-progress { position: sticky; top: 12px; } }
.compare-card { padding: 10px 12px; }
.compare-heading { align-items: center; }.compare-heading span { font-size: 11px; }
.compare-grid { margin-top: 7px; gap: 7px; }
.compare-option { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; text-align: left; color: var(--ink); cursor: pointer; }
.compare-option b { margin: 0; font-size: 12px; }.compare-option strong { margin: 0; font-size: 16px; white-space: nowrap; }
.compare-option small { font-size: 11px; }.compare-option:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* Give each spending channel a stable reading order: category, stage, runs, cost. */
.spend-main { display: inline-flex; min-width: 0; align-items: center; gap: 5px; }
.spend-name { display: inline-flex; min-width: 0; align-items: center; gap: 5px; }
.spend-name b { min-width: 0; margin: 0; color: inherit; font-size: 12px; line-height: 1.5; font-weight: 750; overflow-wrap: anywhere; }
.spend-stage { display: inline-flex; flex: none; align-items: center; justify-content: center; margin: 0; padding: 2px 5px; border: 1px solid color-mix(in srgb, var(--channel) 22%, transparent); border-radius: 5px; background: var(--surface); font: 650 11px/1.5 var(--font-d); white-space: nowrap; }
.spend-count { flex: none; white-space: nowrap; font-family: var(--font-d); }
.ledger-row .channel-label { width: fit-content; min-height: 36px; padding: 5px 8px; }.ledger-row .channel-label .spend-name b { font: inherit; }
.spend-chips .channel-chip { width: fit-content; max-width: 100%; gap: 7px; }
.spend-chips .spend-name { flex: 0 1 auto; }
.edit-roster-item { grid-template-rows: 46px minmax(0, 1fr); align-content: start; }
.edit-roster { grid-auto-rows: 136px; min-height: 708px; max-height: 708px; }
.target-fields { align-self: stretch; align-items: start; gap: 5px; }
.target-fields label { min-width: 0; gap: 2px; }
.target-fields label > span:first-child { color: var(--planner-muted); font-size: 9px; font-weight: 750; }
.target-fields .progress-values { gap: 3px; }
.target-fields .progress-values > b { color: var(--ink); font: 700 10px/1.3 var(--font-d); white-space: nowrap; }
.target-fields .progress-values > span { color: var(--planner-muted); }
.target-fields .progress-values input { width: 4ch; min-width: 28px; min-height: 28px; height: 28px; padding: 2px; border: 0; border-bottom: 1px dashed var(--accent); border-radius: 0; background: transparent; color: var(--ink); font: 700 11px var(--font-d); text-align: center; }
.edit-roster-name b { white-space: normal; overflow-wrap: anywhere; }
.stage-menu { grid-template-columns: repeat(3, minmax(0, 1fr)); max-height: 300px; overflow-y: auto; }
.stage-menu-heading { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 6px; color: var(--ink-60); font-size: 11px; }
.add-menu button { min-height: 44px; }.stage-menu > button { justify-content: center; border: 1px solid var(--planner-line); font-size: 12px; color: var(--ink); background: var(--cream); }
.add-menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 640px) { .stage-menu { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .target-fields .progress-values input { min-height: 44px; height: 44px; } }
.planner-workspace > .planner-cloud-fields { display: grid; gap: 16px; }
.workspace-feedback { display: grid; gap: 8px; }
.workspace-feedback .cloud-status, .workspace-feedback .cloud-recovery { margin-top: 0; }
.schedule-plan-note { margin: 0; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.schedule-optimize { display: inline; margin-left: 6px; padding: 0; border: 0; border-radius: 2px; background: transparent; color: var(--accent-strong); font: inherit; font-weight: 700; vertical-align: baseline; text-decoration: underline; text-underline-offset: 3px; white-space: nowrap; cursor: pointer; }
.schedule-optimize:disabled { opacity: .5; cursor: default; }
.schedule-optimize:active:not(:disabled) { color: var(--tea); }
@media (hover: hover) { .schedule-optimize:hover:not(:disabled) { color: var(--tea); } }
.schedule-update { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-left: 3px solid var(--accent); background: var(--cream); }
.schedule-update strong { color: var(--tea); font-size: 13px; }.schedule-update p { margin-top: 5px; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.schedule-update button { flex: none; min-height: 44px; }
.schedule-difference-details { margin-top: 8px; color: var(--ink-60); font-size: 12px; }
.schedule-difference-details summary { cursor: pointer; }
@media (max-width: 640px) { .schedule-update { flex-direction: column; align-items: stretch; } }
.day-plan { gap: 10px; }
.flow-heading { margin-bottom: 12px; }
@media (max-width: 640px) {
  .growth-quick-action { width: 40px; min-width: 40px; height: 40px; min-height: 40px; }
}

/* Compact execution summary; labels and figures retain a stable reading order. */
.day-totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; margin: 0; padding: 4px 0 14px; border-bottom: 1px dashed var(--planner-line); }
.day-totals > div { display: grid; min-width: 0; gap: 4px; padding: 10px 6px; border-radius: 8px; background: color-mix(in srgb, var(--paper) 62%, var(--surface)); text-align: center; }
.day-totals dt { color: var(--ink-60); font-size: 12px; }
.day-totals dd { margin: 0; color: var(--tea); font: 800 20px/1.25 var(--font-d); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.day-totals .gain dd { color: var(--planner-gain); }
.day-totals .spend dd, .day-totals .negative dd { color: var(--rouge); }
.day-totals .coin-spend dd { color: var(--accent-strong); }
.spend-summary { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; margin-top: 7px; padding-top: 10px; border-top: 1px dashed var(--planner-line); }
.spend-summary .ledger-total { gap: 8px; margin: 0; padding: 0; border: 0; font-size: 12px; }
.spend-balance { display: flex; align-items: baseline; gap: 8px; color: var(--ink-60); font-size: 12px; }
.spend-balance strong { color: var(--planner-gain); font: 850 15px var(--font-d); font-variant-numeric: tabular-nums; }
.spend-balance.negative, .spend-balance.negative strong { color: var(--rouge); }
.routine-gains { margin-top: 8px; }
.routine-gains-toggle, .roster-toggle, .roster-preview { display: none; }
.roster-move-actions { display: none; }
.roster-add { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 44px; margin-top: 8px; padding: 8px 12px; border: 1px dashed var(--planner-line); border-radius: 8px; background: var(--cream); color: var(--tea); font: 700 13px var(--font-b); cursor: pointer; }
.roster-add:disabled { opacity: .55; cursor: default; }
@media (hover: hover) { .roster-add:hover:not(:disabled) { border-color: var(--accent); background: var(--paper); } }
.roster-move-actions button { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: var(--tea); cursor: pointer; }
.roster-move-actions button:disabled { opacity: .3; cursor: default; }
.roster-toggle:focus-visible, .routine-gains-toggle:focus-visible, .roster-move-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.target-fields .target-field-label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px; color: var(--ink-60); }
.target-field-label small { color: var(--ink-60); font: 400 11px/1.4 var(--font-d); white-space: nowrap; }
.edit-grid:not(.has-roster) { grid-template-columns: minmax(0, 1fr); }
.planner-steps { min-width: 0; scroll-margin-top: 16px; }
.planner-steps ol { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.planner-steps li { min-width: 0; }
.planner-steps button { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 52px; padding: 8px; border: 1px solid var(--planner-line); border-radius: 10px; background: var(--surface); color: var(--ink-60); font: 700 14px var(--font-b); cursor: pointer; }
.planner-steps button[aria-current="step"] { border-color: var(--tea); background: var(--cream); color: var(--tea); box-shadow: inset 0 -2px var(--accent); }
.step-number { display: grid; flex: none; place-items: center; width: 24px; height: 24px; border: 1px solid var(--planner-line); border-radius: 50%; font: 700 12px var(--font-d); }
[aria-current="step"] .step-number { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.planner-steps button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.planner-daily-step { display: grid; min-width: 0; gap: 12px; }
.planner-step-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--planner-line); }
.planner-step-actions > p { flex-basis: 100%; margin: 0; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.planner-step-actions button { min-height: 44px; font-size: 13px; }
.planner-daily-step > .planner-step-actions { padding-right: 0; padding-left: 0; }
.planner-comparison-step > .planning-condition-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; background: var(--cream); }
.planning-condition-summary p { min-width: 0; margin: 0; line-height: 1.7; }
.planning-condition-summary button { flex: none; min-height: 44px; }
@media (hover: hover) { .roster-move-actions button:hover:not(:disabled), .planner-steps button:hover { background: var(--paper); } }
@media (max-width: 900px) {
  .planner-sidebar { padding: 0 10px; }
  .roster-toggle { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 44px; padding: 4px 0; border: 0; background: transparent; color: var(--tea); text-align: left; cursor: pointer; }
  .roster-toggle-label { flex: 1; font-size: 14px; font-weight: 750; }
  .roster-toggle-label small { color: var(--ink-60); font-size: 12px; font-weight: 400; white-space: nowrap; }
  .roster-preview { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 0 10px; }
  .roster-preview :deep(.operator-avatar) { width: 44px; height: 44px; border-radius: 8px; }
  .roster-preview :deep(.operator-avatar > span) { font-size: 17px; }
  .roster-toggle-action { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; white-space: nowrap; }
  .roster-expanded .roster-toggle-action svg { transform: rotate(180deg); }
  .planner-sidebar:not(.roster-expanded) > .side-section { display: none; }
  .planner-sidebar .side-title, .planner-sidebar .drag-handle { display: none; }
  .planner-sidebar .side-section { padding-top: 0; padding-bottom: 8px; }
  .planner-sidebar .edit-roster { min-height: 0; max-height: none; grid-auto-rows: auto; gap: 6px; overflow: visible; }
  .planner-sidebar .edit-roster-item { grid-template-columns: 30px minmax(0, 1fr) 88px 44px; grid-template-rows: 44px auto; gap: 3px 4px; padding: 5px 8px 8px; }
  .edit-roster-item > :deep(.operator-avatar) { grid-column: 1; grid-row: 1; width: 30px; height: 30px; border-radius: 8px; }
  .edit-roster-item > :deep(.operator-avatar > span) { font-size: 17px; }
  .planner-sidebar .edit-roster-name { grid-column: 2; grid-row: 1; }
  .planner-sidebar .edit-roster-name b { font-size: 13px; }
  .roster-move-actions { display: flex; grid-column: 3; grid-row: 1; }
  .planner-sidebar .roster-remove { grid-column: 4; grid-row: 1; width: 44px; height: 44px; }
  .planner-sidebar .target-fields { grid-template-columns: 1fr 1fr 1.3fr; gap: 8px; padding-top: 6px; }
  .planner-sidebar .target-fields label { gap: 3px; }
  .planner-sidebar .target-fields .target-field-label { font-size: 12px; font-weight: 500; }
  .planner-sidebar .target-fields .progress-values { width: 100%; }
  .planner-sidebar .target-fields .progress-values input { width: 100%; min-height: 44px; height: 44px; padding: 4px; border: 1px solid var(--planner-line); border-radius: 6px; background: var(--surface); font-size: 16px; }
}
@media (max-width: 640px) {
  .planner-steps ol { gap: 5px; }
  .planner-steps button { flex-direction: column; gap: 5px; min-height: 66px; padding: 7px 3px; font-size: 13px; }
  .planner-step-actions { gap: 8px; padding: 12px; }
  .planner-step-actions button { padding: 6px 8px; font-size: 12px; }
  .planner-comparison-step > .planning-condition-summary { padding: 12px; }
  .planning-panel-heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 8px; padding: 12px 14px 8px; }
  .planning-panel-heading > div { display: contents; }
  .planning-panel-heading h3 { grid-column: 1; grid-row: 1; }
  .planning-panel-heading p { grid-column: 1 / -1; grid-row: 2; margin: 0; }
  .planning-mode { margin: 0 14px 12px; max-width: calc(100% - 28px); gap: 6px; }
  .planning-mode button { gap: 5px; padding: 8px 6px; font-size: 12px; }
  .planning-mode button svg { width: 15px; height: 15px; }
  .day-plan .card-heading { flex-direction: row; align-items: center; flex-wrap: wrap; gap: 8px; }
  .day-plan .plan-badge { padding: 4px 8px; font-size: 12px; white-space: normal; }
  .day-totals { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .day-totals > div { padding: 8px 2px; }
  .day-totals dt, .day-totals dd { white-space: nowrap; }
  .day-totals dd { font-size: 18px; }
  .day-plan .flow-heading { margin-bottom: 6px; color: var(--tea); font-size: 14px; }
  .day-plan .spend-chips { display: grid; gap: 6px; }
  .day-plan .spend-chips .channel-chip { display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 8px; width: 100%; min-height: 40px; padding: 7px 9px; border: 1px solid var(--planner-line); border-left: 3px solid var(--channel); border-radius: 7px; background: var(--surface); }
  .day-plan .spend-chips .channel-dot { display: none; }
  .day-plan .spend-chips .spend-name b { color: var(--ink); font-size: 13px; }
  .day-plan .spend-chips .spend-stage { background: color-mix(in srgb, var(--channel) 10%, var(--surface)); }
  .day-plan .spend-chips .spend-stage, .day-plan .channel-chip small { font-size: 12px; }
  .day-plan .spend-chips .channel-chip strong { min-width: 4ch; margin: 0; text-align: right; font-family: var(--font-d); }
  .routine-gains-toggle { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 4px 0; border: 0; background: transparent; color: var(--ink-60); text-align: left; font: 12px var(--font-b); cursor: pointer; }
  .routine-gains-toggle strong { margin-left: auto; color: var(--tea); font-family: var(--font-d); }
  .routine-gains-toggle svg.expanded { transform: rotate(180deg); }
  .routine-gains:not(.expanded) { display: none; }
  .routine-gains { margin-top: 0; }
  .day-plan .balance-warning { font-size: 12px; }
  .ledger-row { grid-template-columns: minmax(0, 1fr) 72px 44px; gap: 4px 8px; }
  .spend-ledger-row { grid-template-columns: minmax(0, 1fr) 64px 44px; gap: 4px 6px; }
  .spend-ledger-row .channel-label { padding-right: 5px; padding-left: 5px; }
  .spend-ledger-row .channel-label > i { display: none; }
  .ledger-row .ledger-label-wrap { grid-column: 1; grid-row: 1 / span 2; }
  .ledger-row .ledger-input-wrap { grid-column: 2; grid-row: 1; }
  .ledger-row .ledger-input-wrap input { font-size: 16px; }
  .ledger-row .ledger-input-wrap > span { font-size: 12px; }
  .ledger-row .recommendation { grid-column: 2; grid-row: 2; font-size: 12px; }
  .ledger-row .recommendation.matches-plan { display: none; }
  .ledger-row .row-remove { grid-column: 3; grid-row: 1 / span 2; width: 44px; min-height: 44px; }

}
@media (max-width: 380px) {
  .day-totals { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .day-totals .day-balance { display: none; }
}

/* The mobile roster uses the same paper nameplate as current growth. */
@media (max-width: 640px) {
  .growth-card-grid { gap: 28px; padding-top: 20px; }
  .growth-card {
    padding: 0 10px 8px;
    border: 1px solid var(--growth-rarity-border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: 0 3px 10px rgba(73, 59, 44, .05);
  }
  .growth-card.complete { border-top-width: 1px; background: var(--surface); }
  .growth-card-head { align-items: center; gap: 8px; min-height: 44px; margin-top: -23px; }
  .growth-identity :deep(.operator-avatar), .growth-identity-meta { display: none; }
  .growth-identity { min-width: 0; }
  .growth-identity h3 {
    padding: 2px 6px;
    background: var(--surface);
    font-size: 16px;
    letter-spacing: .06em;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .growth-percent { display: inline-flex; flex: none; align-items: baseline; gap: 3px; padding: 2px 6px; background: var(--surface); font-size: 16px; }
  .growth-mobile-status { display: inline; margin-right: 3px; color: var(--tea); font: 600 12px/1.5 var(--font-b); }
  .growth-percent small { margin: 0; font-size: 12px; }
  .growth-progress-list { gap: 4px; margin-top: 0; }
  .growth-progress-row { gap: 0; padding-bottom: 3px; }
  .growth-progress-label { min-height: 44px; gap: 8px; font-size: 12px; }
  .growth-progress-label .progress-values { gap: 8px; font-size: 13px; }
  .growth-progress-side-label { font-size: 11px; }
  .growth-progress-label b, .growth-progress-label .tracker-number-input, .growth-progress-label .tracker-star-trigger { font-size: 13px; }
  .growth-progress-label .tracker-editable { min-height: 44px; min-width: 44px; font-size: 16px; }
  .growth-value-divider { font-size: 0; }
  .growth-value-divider::after { content: "→"; font-size: 13px; }
  .growth-quick-action { width: 44px; min-width: 44px; height: 44px; min-height: 44px; }
  .growth-track { height: 2px; }
  /* Detailed requirements remain available in the material disclosure below. */
  .growth-progress-row > small { display: none; }
  .growth-materials { margin-top: 4px; }
  .growth-materials summary { min-height: 44px; font-size: 12px; }
  .growth-materials summary span { font-size: 12px; }
  .growth-material-chip { min-height: 36px; font-size: 12px; }
  .growth-material-chip small, .growth-material-note { font-size: 11px; }
  .growth-material-chip em { flex-wrap: wrap; justify-content: flex-end; white-space: normal; }
  .growth-material-chip .growth-material-eta { margin-left: 0; }
  .heart-history { width: 100%; min-width: 0; max-width: 100%; }
  .heart-history-label { font-size: 10px; }
  .heart-history-bars { width: 100%; min-width: 0; height: 20px; gap: 1px; overflow: hidden; }
  .heart-history-empty { min-height: 20px; font-size: 10px; }
  .growth-action-notice { font-size: 12px; }
  .tracker-remove { min-height: 44px; font-size: 12px; }
}
@media (max-width: 380px) {
  .growth-progress-side-label { display: none; }
  .growth-progress-label .progress-values { gap: 6px; }
}
</style>
