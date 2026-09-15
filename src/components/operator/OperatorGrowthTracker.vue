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

      <div class="cloud-status" role="status" aria-live="polite">
        {{ cloudLoading || scheduleLoading ? '正在读取云端计划…' : workspaceState.saving || scheduleState.saving ? '正在保存到云端…' : cloudError ? '云端同步未完成' : '计划与日程按子账号保存到云端' }}
        <span v-if="fixedSchedule"> · 日界线北京时间 05:00</span>
      </div>
      <div v-if="cloudError" class="cloud-recovery" role="alert"><p>{{ cloudError }}</p><button v-if="!migration" type="button" @click="loadCloud">重新读取</button></div>
      <div v-for="kind in ['workspace', 'schedule']" :key="kind">
        <div v-if="(kind === 'workspace' ? workspaceState : scheduleState).error" class="cloud-recovery" role="alert">
          <p>{{ kind === 'workspace' ? '清单' : '日程' }}尚未确认保存：{{ (kind === 'workspace' ? workspaceState : scheduleState).error.message }}</p>
          <p v-if="(kind === 'workspace' ? workspaceState : scheduleState).latest">云端版本 {{ (kind === 'workspace' ? workspaceState : scheduleState).latest.revision }} · {{ (kind === 'workspace' ? workspaceState : scheduleState).latest.updatedAt }}</p>
          <div class="cloud-actions"><button type="button" :disabled="(kind === 'workspace' ? workspaceState : scheduleState).saving" @click="recover(kind)">重试保存</button><button type="button" @click="downloadPending(kind)">导出未保存内容</button><button type="button" :disabled="(kind === 'workspace' ? workspaceState : scheduleState).saving" @click="recover(kind, true); planError = ''">放弃本次修改并读取云端</button></div>
        </div>
      </div>
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
              :plans="workspace.plans"
              :active-plan="activePlan"
              :member-ids="activeMemberIds"
              :catalog-entries="catalogEntries"
              :account-id="accountId"
              :error="planError"
              :disabled="cloudBlocked || schedulePending || targetBusyIds.size > 0 || targetLoading"
              @select="selectPlan"
              @save="savePlan"
              @remove="removePlan"
            />
          </div>
          <div class="status-actions">
            <button type="button" class="status-action secondary" @click="toggleSettings"><SlidersHorizontal :size="15" aria-hidden="true" />调整设置</button>
            <button type="button" class="status-action primary" @click="openPlanner('display')"><CalendarDays :size="15" aria-hidden="true" />查看体力日程</button>
          </div>
        </div>
        <div class="status-metrics" role="group" aria-label="培养进度概览">
          <div class="status-metric status-metric-primary"><span>预计耗时</span><strong>{{ plannerEtaLabel }}</strong></div>
          <div class="status-metric"><span>等级&修为进度</span><strong>{{ plannerProgress }}<small>%</small></strong></div>
          <div class="status-metric"><span>心纸状态</span><strong>{{ formatNumber(totalHeartStock) }}<small> 张</small></strong></div>
          <div class="status-metric"><span>所选日体力结余</span><strong :class="{ negative: todayTotals.balance < 0 }">{{ signedNumber(todayTotals.balance) }}</strong></div>
        </div>
        <p v-if="loading" class="status-sync-note" role="status"><RefreshCw :size="13" class="spin" aria-hidden="true" />正在同步当前库存；已保存的日程会保留，存在差异时可选择更新。</p>
        <div class="status-rule" aria-hidden="true"><span></span><i>养成清单</i><span></span></div>
        <div class="status-roster">
          <div class="growth-card-grid">
              <article v-for="row in orderedPlanRows" :key="row.id" class="growth-card" :class="{ complete: row.completed }">
                <div class="growth-card-head"><div class="growth-identity"><OperatorAvatar :avatar="row.avatar || ''" :name="row.name || row.id" :rarity="Number(row.rarity) || 3" /><div><h3>{{ row.name || row.id }}</h3><p class="growth-identity-meta"><span v-if="profList(row.prof).length" class="growth-prof-list"><span v-for="prof in profList(row.prof)" :key="prof" class="growth-prof"><img :src="profIcon(prof)" alt="" aria-hidden="true" /><span>{{ prof }}</span></span></span><span v-else class="growth-prof-fallback">未知属性</span><span class="growth-identity-separator" aria-hidden="true">·</span><span>{{ firstSubProf(row) || '未标注职业' }}</span></p></div></div><span class="growth-percent">{{ rowProgress(row) }}<small>%</small></span></div>
                <div class="growth-progress-list">
                  <div class="growth-progress-row">
                    <div class="growth-progress-label"><span>等级</span><div class="progress-values"><b>Lv{{ row.level }}</b><span>/</span><input class="tracker-editable tracker-number-input" type="number" :min="row.level" max="100" step="1" :value="targetFor(row).level" :aria-label="row.name + '的目标等级'" title="点击修改目标等级" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'level', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'level', $event)" /></div></div>
                    <div class="growth-track"><i :style="{ width: progress(row.level, targetFor(row).level) + '%' }"></i></div>
                    <small>{{ experienceSummary(row.calculation.experienceGap) }}</small>
                  </div>
                  <div class="growth-progress-row">
                    <div class="growth-progress-label"><span>修为</span><div class="progress-values"><b>{{ row.elite }}</b><span>/</span><input class="tracker-editable tracker-number-input" type="number" :min="row.elite" :max="targetEliteMax(row)" step="1" :value="targetFor(row).elite" :aria-label="row.name + '的目标修为'" title="点击修改目标修为，上限随目标等级调整" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @focus="$event.target.select()" @change="setTarget(row, 'elite', $event)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="resetTargetInput(row, 'elite', $event)" /></div></div>
                    <div class="growth-track mint"><i :style="{ width: progress(row.elite, targetFor(row).elite) + '%' }"></i></div>
                    <small>{{ materialSummary(row.calculation.xiuwei) || '无需补充修为材料' }}</small>
                  </div>
                  <div class="growth-progress-row">
                    <div class="growth-progress-label tracker-star-anchor" @keydown.esc.prevent.stop="closeStarTarget(true)"><span>化极</span><div class="progress-values"><b>{{ starLabel(row.starLevel) }}</b><span>/</span><button class="tracker-editable tracker-star-trigger" type="button" :aria-label="row.name + '的目标化极：' + starLabel(targetFor(row).starLevel)" aria-haspopup="dialog" :aria-expanded="starTargetId === row.id" :aria-controls="starTargetId === row.id ? 'tracker-star-target-' + row.id : undefined" title="点击修改目标星级与节点" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @click="openStarTarget(row, $event)">{{ starLabel(targetFor(row).starLevel) }}</button></div>
                      <div v-if="starTargetId === row.id" :id="'tracker-star-target-' + row.id" class="tracker-star-popover" role="dialog" :aria-label="row.name + '的目标化极'"><div class="tracker-popover-title"><Info :size="13" aria-hidden="true" />设置目标星级与节点</div><div class="tracker-star-controls"><select :value="starTargetGroup" aria-label="目标星级" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @change="setStarTargetGroup(row, $event)"><option v-for="group in starGroupsFor(row)" :key="group" :value="group">{{ group === 0 ? '未拥有' : group === 31 ? '觉醒' : group + ' 星' }}</option></select><select v-if="starTargetGroup > 0 && starTargetGroup < 5" v-model.number="starTargetDraft" aria-label="目标节点" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)"><option v-for="stage in starNodesFor(row, starTargetGroup)" :key="stage.value" :value="stage.value">节点 {{ (stage.value - 1) % 6 }}</option></select></div><div class="tracker-popover-actions"><button type="button" class="cancel" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @click="closeStarTarget(true)">取消</button><button type="button" :disabled="cloudBlocked || schedulePending || targetBusyIds.has(row.id)" @click="saveStarTarget(row)">{{ targetBusyIds.has(row.id) ? '保存中…' : '保存目标' }}</button></div></div>
                    </div>
                    <div class="growth-track rose"><i :style="{ width: progress(starStage(row.starLevel), starStage(targetFor(row).starLevel)) + '%' }"></i></div>
                    <small class="heart-progress-note">心纸 {{ formatNumber(row.calculation.heartOwned) }} / {{ formatNumber(row.calculation.heartRequired) }} · <span class="heart-gap">缺 <span class="heart-gap-number">{{ formatNumber(row.calculation.heartGap) }}</span></span><span class="heart-average"> · {{ heartDailyAverageLabel(row) }}</span></small>
                  </div>
                </div>
                <slot name="remark" :row="row" />
                <div v-if="row.completed" v-show="!isRemarkEditing(row)" class="growth-materials growth-complete">
                  <button class="tracker-remove" type="button" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.size > 0" @click="removePlanMember(row)"><X :size="14" aria-hidden="true" />从清单中移除</button>
                </div>
                <details v-else class="growth-materials"><summary>查看材料缺口与预计耗时 <span>{{ rowGapCount(row) }} 项</span></summary><div v-if="!row.calculation.gaps.length && !row.calculation.experienceGap && !row.calculation.heartGap" class="materials-clear">当前目标材料已备齐</div><div v-else class="growth-material-chips"><span v-for="gap in row.calculation.gaps" :key="gap.id" class="growth-material-chip"><img class="growth-material-icon" :src="resourceIcon(gap.id)" alt="" loading="lazy" /><b>{{ itemName(gap.id) }}</b><em>缺 {{ formatNumber(gap.gap) }}<small v-if="materialEtaLabel(row, gap)" class="growth-material-eta">{{ materialEtaLabel(row, gap) }}</small></em></span><span v-if="row.calculation.experienceGap" class="growth-material-chip"><img class="growth-material-icon" :src="resourceIcon('bingshuquanjuan')" alt="" loading="lazy" /><b>经验</b><em>缺 {{ formatNumber(row.calculation.experienceGap) }} XP</em></span><span v-if="row.calculation.heartGap" class="growth-material-chip heart-chip"><img class="growth-material-icon" :src="operatorIcon(row)" alt="" loading="lazy" /><b>心纸</b><em>缺 {{ formatNumber(row.calculation.heartGap) }}<small v-if="heartEtaLabel(row)" class="growth-material-eta">{{ heartEtaLabel(row) }}</small></em></span></div><p class="growth-material-note">库存按当前清单共享分配，以下为分配后缺口；单项 ETA 按独占对应历练估算。</p></details>
              </article>
            </div>
        </div>
      </section>

      <div v-if="!planRows.length" class="planner-state empty"><Star :size="18" aria-hidden="true" /><span>当前清单还没有密探，可通过上方「管理密探」添加，或新建培养计划。</span></div>

      <section v-if="plannerOpen && (planRows.length || fixedSchedule)" ref="plannerWorkspaceRef" class="planner-workspace" aria-label="体力规划工作区">
        <div class="planner-workspace-head"><div><span class="section-kicker">每日执行</span><h2>体力日程</h2><p>{{ plannerCycleNotice }}</p></div><div class="workspace-head-actions"><button type="button" class="workspace-link" @click="viewMode === 'display' ? editSchedule() : openPlanner('display')">{{ viewMode === 'display' ? '编辑日程' : '返回日程' }}</button><button type="button" class="workspace-close" aria-label="收起体力日程" @click="plannerOpen = false"><X :size="16" aria-hidden="true" /></button></div></div>

        <div v-if="fixedSchedule" class="schedule-saved-note" role="status"><Check :size="14" aria-hidden="true" /><span>{{ schedulePending ? '日程修改等待云端保存' : '日程已固定保存到云端' }} · 始于 {{ formatLongDate(fixedSchedule.startDate) }}，过去的日期可随时回顾。</span></div>
        <div v-if="scheduleNeedsUpdate" class="schedule-update" role="status">
          <div><strong>{{ scheduleDifferences.goalsChanged ? '培养目标或清单已有变化' : '当前库存与计划预测有差异' }}</strong><p>{{ scheduleDifferenceLabel }}更新后从今天重新安排，保留过去的日程和未来的自定义安排。</p></div>
          <button type="button" class="action-button" :disabled="loading || targetLoading" @click="updateSavedSchedule"><RefreshCw :size="14" aria-hidden="true" />按当前库存更新</button>
        </div>
        <p v-if="currentDay.legacy" class="planner-footnote">此日来自旧版手工日程，未记录历史库存，仅保留原安排。</p>
        <p v-if="reviewingHistory" class="planner-footnote">正在回顾已过日期的已保存安排与预测产出；「已过」不代表实际执行完成。</p>
        <p v-if="outsideManualDates.length" class="planner-footnote">周期外固定日仍保留，可查看或恢复推荐：<button v-for="date in outsideManualDates" :key="date" type="button" class="workspace-link" @click="selectDate(date); viewMode = 'edit'">{{ formatLongDate(date) }}</button></p>
        <p v-if="currentDay.errors?.length" class="balance-warning" role="alert">{{ currentDay.errors.join('；') }}。当日与后续推进暂停，修正后重算。</p>
        <p v-else-if="currentDay.paused" class="balance-warning" role="status">前面的日期有无效日程，修正后继续推进。</p>
        <p v-if="currentDay.warnings?.length" class="planner-footnote">{{ currentDay.warnings.join('；') }}</p>
        <section v-if="viewMode === 'display' || reviewingHistory" class="planner-view planner-display" aria-label="体力规划展示">
          <PlannerDateTabs :dates="plannerDates" :selected="selectedDate" :manual-plans="manualPlans" :today="plannerToday" :fixed="Boolean(fixedSchedule)" @select="selectDate" />
          <div class="display-grid"><section class="planner-card day-plan"><div class="card-heading"><div><span class="card-kicker">{{ currentDateLabel }} · 模拟计划</span><h3>当日方案</h3></div><span class="plan-badge" :class="{ manual: currentDay.manual }">{{ currentDay.manual ? '自定义计划' : '自动推荐方案' }}</span></div><div class="day-summary"><div class="summary-metric gain"><span>获取</span><b>{{ formatStamina(todayTotals.gains) }}</b></div><span class="summary-op">−</span><div class="summary-metric spend"><span>支出</span><b>{{ formatStamina(todayTotals.spends) }}</b></div><span class="summary-op">=</span><div class="summary-balance" :class="{ negative: todayTotals.balance < 0 }"><span>当日结余</span><b>{{ signedNumber(todayTotals.balance) }}</b></div></div><div class="flow-section"><div class="flow-heading"><span>体力获取</span><b class="gain-text">{{ formatStamina(todayTotals.gains) }}</b></div><div class="channel-chips"><span v-for="gain in currentDay.planned.gains" :key="gain.id" class="channel-chip" :class="gain.colorKey" :style="channelStyle(gain.colorKey)"><span class="channel-dot"></span><span>{{ gain.label }}</span><small v-if="gain.kind === 'count'">×{{ formatStamina(gain.value) }}</small><strong>+{{ formatStamina(energyFromGain(gain)) }}</strong></span><span v-if="!currentDay.planned.gains.length" class="flow-empty">暂无体力来源</span></div></div><div class="flow-section"><div class="flow-heading"><span>体力支出</span><b class="spend-text">{{ formatStamina(todayTotals.spends) }}</b></div><div class="channel-chips spend-chips"><span v-for="spend in currentDay.planned.spends" :key="spend.id" class="channel-chip" :class="spend.colorKey" :style="channelStyle(spend.colorKey)"><span class="channel-dot"></span><span class="spend-name"><b>{{ spendChannelName(spend) }}</b><span v-if="spendStageName(spend)" class="spend-stage">{{ spendStageName(spend) }}</span></span><small>×{{ formatStamina(spend.value) }}</small><strong>−{{ formatStamina(spend.value * spend.costPer) }}</strong></span><span v-if="!currentDay.planned.spends.length" class="flow-empty">暂无体力支出</span></div></div><p v-if="todayTotals.balance < 0" class="balance-warning" role="alert"><CircleAlert :size="15" aria-hidden="true" />当日计划超出可用体力 {{ formatStamina(Math.abs(todayTotals.balance)) }}，请增加来源或减少支出。</p></section><CultivationProgress :rows="progressItems" :date-label="currentDateLabel" /></div><p class="planner-footnote">{{ currentDay.manual ? '此日采用手工计划；未来未手工调整的日期已按新的材料缺口重新生成。' : '这是按当前偏好生成的推荐方案；编辑任意一天后，完整日程会固定保存。' }} 培养推进为从计划保存起点计算的模拟进度，不代表真实流水。{{ aggregateMoneyLabel }}。按完整一天自然恢复与进膳预算计算；不模拟满体损失，日末结余暂不自动结转，可手工添加储备来源。</p>
        </section>

        <section v-else class="planner-view planner-edit" aria-label="体力规划编辑"><div class="edit-grid"><aside class="planner-sidebar panel"><section class="side-section"><div class="side-title"><span>培养清单</span><span class="side-hint">拖动排序 · 右上角移除</span></div><div class="edit-roster"><div v-for="row in orderedPlanRows" :key="row.id" class="edit-roster-item" draggable="true" @dragstart="onRosterDragStart(row.id)" @dragover.prevent @drop="onRosterDrop(row.id)"><div class="drag-handle" aria-hidden="true">⋮⋮</div><OperatorAvatar :avatar="row.avatar || ''" :name="row.name || row.id" :rarity="Number(row.rarity) || 3" /><div class="edit-roster-name"><b>{{ row.name || row.id }}</b></div><button type="button" class="roster-remove" :aria-label="'将 ' + (row.name || row.id) + ' 移出培养清单'" @click="removePlanMember(row)"><X :size="15" aria-hidden="true" /></button><div class="target-fields"><label><span>等级</span><span class="progress-values"><b>{{ row.level }}</b><span>/</span><input class="tracker-editable tracker-number-input" type="number" :min="row.level" max="100" step="1" :value="targetFor(row).level" :aria-label="row.name + '目标等级'" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @change="setTarget(row, 'level', $event)" /></span></label><label><span>修为</span><span class="progress-values"><b>{{ row.elite }}</b><span>/</span><input class="tracker-editable tracker-number-input" type="number" :min="row.elite" :max="targetEliteMax(row)" step="1" :value="targetFor(row).elite" :aria-label="row.name + '目标修为'" :disabled="cloudBlocked || schedulePending || targetLoading || targetBusyIds.has(row.id)" @change="setTarget(row, 'elite', $event)" /></span></label><label class="target-star"><span>化极</span><span class="progress-values"><b>{{ starLabel(row.starLevel) }}</b><span>/</span><select class="tracker-editable target-star-select" :value="targetFor(row).starLevel" :aria-label="row.name + '目标化极'" @change="setTarget(row, 'starLevel', $event)"><option v-for="stage in starStagesFor(row)" :key="stage.value" :value="stage.value">{{ stage.label }}</option></select></span></label></div></div></div><p class="drag-note">拖动左侧把手调整顺序；点击右上角 X 将密探移出当前清单。</p></section></aside><div class="editor-main"><section class="planner-card compare-card">
  <div class="compare-heading"><h3>方案对比</h3><span>仅调整推荐，固定日不变</span></div>
  <div class="compare-grid" role="group" aria-label="选择购买体力方案">
    <button v-for="option in compareOptions" :key="option.purchaseCount" type="button" class="compare-option" :class="{ active: option.purchaseCount === plannerPreferences.purchaseCount }" :aria-pressed="option.purchaseCount === plannerPreferences.purchaseCount" @click="applyComparison(option.purchaseCount)">
      <span><b>{{ option.tag }}</b><small>{{ formatNumber(option.dailyCoins) }} 白金币/日 · 合计 {{ option.totalCoins == null ? '待定' : formatNumber(option.totalCoins) }}</small></span>
      <strong>{{ option.label }}</strong>
    </button>
  </div>
</section><div class="planner-edit-toolbar panel"><div><span>日程调整</span><small>体力设置与目标天数不会改写培养目标。</small></div><div class="edit-toolbar-actions"><button type="button" class="toolbar-button" :class="{ active: settingsOpen }" @click="toggleSettings"><SlidersHorizontal :size="14" aria-hidden="true" />调整设置</button><button type="button" class="toolbar-button goal" :class="{ active: goalMode }" @click="goalMode = !goalMode; settingsOpen = false"><Target :size="14" aria-hidden="true" />按目标天数规划</button></div></div><section v-if="settingsOpen" class="settings-panel panel"><div class="settings-block"><div class="settings-block-head"><h3>培养策略</h3><span>{{ strategy === 'priority' ? '顺序参与规划' : '清单仅用于展示' }}</span></div><div class="strategy-switch"><button type="button" :class="{ active: strategy === 'overall' }" @click="setStrategy('overall')">整体完成</button><button type="button" :class="{ active: strategy === 'priority' }" @click="setStrategy('priority')">优先完成密探</button></div><p class="setting-help">整体完成会合并缺口，按有效产出逐次推荐；优先完成会按清单顺序分配每日产出。</p></div><div class="settings-block"><div class="settings-block-head"><h3>推荐偏好</h3><span>每天重复使用</span></div><div class="settings-fields"><div class="setting-line"><label for="pref-luoyang">洛阳派遣</label><div class="counter"><button type="button" aria-label="减少洛阳派遣次数" :disabled="plannerPreferences.luoyang <= 0" @click="changePreference('luoyang', -1)">−</button><input id="pref-luoyang" type="number" min="0" max="4" v-model.number.lazy="plannerPreferences.luoyang" @change="savePreferences" /><button type="button" aria-label="增加洛阳派遣次数" :disabled="plannerPreferences.luoyang >= 4" @click="changePreference('luoyang', 1)">＋</button></div></div><div class="setting-line"><label for="pref-shouchun">寿春派遣</label><div class="counter"><button type="button" aria-label="减少寿春派遣次数" :disabled="plannerPreferences.shouchun <= 0" @click="changePreference('shouchun', -1)">−</button><input id="pref-shouchun" type="number" min="0" max="4" v-model.number.lazy="plannerPreferences.shouchun" @change="savePreferences" /><button type="button" aria-label="增加寿春派遣次数" :disabled="plannerPreferences.shouchun >= 4" @click="changePreference('shouchun', 1)">＋</button></div></div><div class="setting-line"><label for="pref-purchase">购买体力</label><div class="counter"><button type="button" aria-label="减少购买体力次数" :disabled="plannerPreferences.purchaseCount <= 0" @click="changePreference('purchaseCount', -1)">−</button><input id="pref-purchase" type="number" min="0" max="8" v-model.number.lazy="plannerPreferences.purchaseCount" @change="savePreferences" /><button type="button" aria-label="增加购买体力次数" :disabled="plannerPreferences.purchaseCount >= 8" @click="changePreference('purchaseCount', 1)">＋</button></div></div></div><p class="purchase-note">{{ purchaseCostLabel }} / 日；每日体力来源会计入日程账本。派遣仅消耗体力，无素材产出。</p></div><div class="settings-block training-settings-block"><div class="settings-block-head"><h3>可刷层数</h3><span>用于每日推荐</span></div><div class="training-levels"><label v-for="group in TRAINING_GROUPS" :key="group.id">{{ group.name }}最高层<select :value="workspace.trainingLevels[group.id]" @change="setTrainingLevel(group.id, $event)"><option v-for="stage in group.stages" :key="stage.level" :value="stage.level">{{ stage.name }}</option></select></label></div></div></section><section v-if="goalMode" class="goal-panel panel"><div class="goal-kicker">独立规划模式</div><h3>按目标天数规划</h3><p>输入期限后，系统会比较每日购买 0–8 次的贪心方案，寻找本次模拟中可达期限的最低购买档位；这里的结果不会改写常规偏好。</p><div class="goal-fields"><label for="goal-days">目标完成天数<input id="goal-days" type="number" min="1" max="90" step="1" v-model.number.lazy="goalDays" /></label><label for="goal-extra">体力储备 / 额外体力<input id="goal-extra" type="number" min="0" max="9999" step="10" v-model.number.lazy="goalExtraStamina" /></label></div><div class="goal-field-help"><span>支持 1–90 天</span><span>只计入规划第一天</span></div><div class="goal-shortcuts"><button v-for="days in [7, 10, 14, 21]" :key="days" type="button" :class="{ active: Number(goalDays) === days }" @click="goalDays = days">{{ days }} 天</button></div><div class="goal-result" :class="{ feasible: goalResult.feasible }"><div class="goal-result-title">{{ goalResult.feasible ? '当前设置下可完成' : '当前设置下暂不可完成' }}</div><div v-if="goalResult.feasible" class="goal-metrics"><div><span>模拟购买档位</span><b>{{ goalResult.purchaseCount }} 次 / 日</b></div><div><span>白金币</span><b>{{ goalResult.dailyCoins }} / 日</b></div><div><span>预计完成</span><b>{{ formatEta(goalResult.etaDays) }}</b></div><div><span>累计白金币</span><b>{{ formatNumber(goalResult.totalCoins) }}</b></div></div><p v-else>当前贪心模拟未找到 {{ goalDays || 0 }} 天内备齐材料的方案，并非不可完成的证明。请先检查未配置获取途径或未开放层数的缺口，再调整体力或期限。</p></div></section><PlannerDateTabs :dates="plannerDates" :selected="selectedDate" :manual-plans="manualPlans" :today="plannerToday" :fixed="Boolean(fixedSchedule)" @select="selectDate" /><div class="edit-simulation"><div class="ledger-grid"><section class="planner-card ledger-card"><div class="ledger-heading"><h3>体力获取</h3><span>推荐 {{ formatStamina(recommendedTotals.gains) }}</span></div><div v-for="(gain, index) in currentDay.planned.gains" :key="gain.id" class="ledger-row"><div class="ledger-label-wrap"><span class="channel-label" :class="gain.colorKey" :style="channelStyle(gain.colorKey)"><i></i>{{ gain.label }}</span><label v-if="gain.custom" class="custom-name-field">名称<input type="text" maxlength="32" :value="gain.name || gain.label" :aria-label="'体力来源名称，第 ' + (index + 1) + ' 项'" @change="updateCustomName('gains', index, $event)" /></label></div><div class="ledger-input-wrap"><label :for="'gain-value-' + index">数量</label><input :id="'gain-value-' + index" type="number" min="0" step="1" :value="gain.value" :aria-label="gain.label + '数量'" @input="updatePlanValue('gains', index, $event)" /><span>{{ gain.kind === 'count' ? '次' : '体力' }}</span></div><span class="recommendation">推荐 {{ recommendedValue('gains', gain.id) }}</span><button type="button" class="row-remove" :aria-label="'移除 ' + gain.label" @click="removePlanRow('gains', index)"><X :size="14" aria-hidden="true" /></button></div><div class="add-wrap"><button type="button" class="add-button" :aria-expanded="addMenu === 'gain'" @click="toggleAddMenu('gain')"><Plus :size="14" aria-hidden="true" />添加获取</button><div v-if="addMenu === 'gain'" class="add-menu" role="menu"><button v-for="channel in GAIN_CHANNELS" :key="channel.id" type="button" role="menuitem" @click="addGain(channel.id)"><span class="channel-label" :class="channel.colorKey" :style="channelStyle(channel.colorKey)"><i></i>{{ channel.label }}</span></button></div></div><div class="ledger-total gain-total"><span>当日获取</span><b>{{ formatStamina(todayTotals.gains) }}</b></div></section><section class="planner-card ledger-card"><div class="ledger-heading"><h3>体力支出</h3><span>推荐 {{ formatStamina(recommendedTotals.spends) }}</span></div><div v-for="(spend, index) in currentDay.planned.spends" :key="spend.id" class="ledger-row spend-ledger-row"><div class="ledger-label-wrap"><span class="channel-label" :class="spend.colorKey" :style="channelStyle(spend.colorKey)"><i></i><span class="spend-name"><b>{{ spendChannelName(spend) }}</b><span v-if="spendStageName(spend)" class="spend-stage">{{ spendStageName(spend) }}</span></span></span><label v-if="spend.custom" class="custom-name-field">名称<input type="text" maxlength="32" :value="spend.name || spend.label" :aria-label="'体力支出名称，第 ' + (index + 1) + ' 项'" @change="updateCustomName('spends', index, $event)" /></label><label v-if="spend.custom" class="custom-cost-field">每次<input type="number" min="0" step="1" :value="spend.costPer" :aria-label="spend.label + '每次体力'" @input="updateSpendCost(index, $event)" /> 体力</label><div v-if="editableSpendYield(spend)" class="yield-editor"><label v-for="(amount, id) in spend.yield" :key="id">{{ resourceName(id) }}<input type="number" min="0" :value="amount" :aria-label="spend.label + '每次产出' + resourceName(id)" @input="updateSpendYield(index, id, $event)" /><button type="button" :aria-label="'移除产出' + resourceName(id)" @click="removeSpendYield(index, id)">×</button></label><select aria-label="添加每次产出的材料" value="" @change="addSpendYield(index, $event)"><option value="">添加每次产出…</option><option v-for="resource in yieldResourceOptions.filter(item => !spend.yield?.[item.id])" :key="resource.id" :value="resource.id">{{ resource.name }}</option></select></div></div><div class="ledger-input-wrap"><label :for="'spend-value-' + index">次数</label><input :id="'spend-value-' + index" type="number" min="0" step="1" :value="spend.value" :aria-label="spend.label + '次数'" @input="updatePlanValue('spends', index, $event)" /><span>次</span></div><span class="recommendation">推荐 {{ recommendedValue('spends', spend.id) }}</span><button type="button" class="row-remove" :aria-label="'移除 ' + spend.label" @click="removePlanRow('spends', index)"><X :size="14" aria-hidden="true" /></button></div><div class="add-wrap"><button ref="spendAddRef" type="button" class="add-button" aria-controls="planner-spend-menu" :aria-expanded="addMenu === 'spend'" @click="toggleAddMenu('spend')"><Plus :size="14" aria-hidden="true" />添加支出</button><div v-if="addMenu === 'spend'" id="planner-spend-menu" class="add-menu" :class="{ 'stage-menu': pendingTrainingGroup }" role="menu" :aria-label="pendingTrainingGroup ? pendingTrainingGroup.name + '选择层数' : '选择支出渠道'" @keydown.esc.prevent.stop="cancelSpendMenu">
  <template v-if="pendingTrainingGroup">
    <div class="stage-menu-heading"><button type="button" role="menuitem" @click="pendingSpendChannel = ''; focusSpendMenu()">‹ 返回渠道</button><span>{{ pendingTrainingGroup.name }} · 选择层数</span></div>
    <button v-for="stage in addTrainingStages" :key="stage.level" type="button" role="menuitem" @click="addTrainingSpend(stage.level)">{{ stage.name.replace(/第\s*(\d+)\s*层/, '$1 层') }}</button>
  </template>
  <template v-else><button v-for="channel in SPEND_CHANNELS" :key="channel.id" type="button" role="menuitem" @click="addSpend(channel.id)"><span class="channel-label" :class="channel.colorKey" :style="channelStyle(channel.colorKey)"><i></i>{{ channel.label }}</span></button></template>
</div></div><div class="ledger-total spend-total"><span>当日支出</span><b>{{ formatStamina(todayTotals.spends) }}</b></div></section></div><CultivationProgress :rows="progressItems" :date-label="currentDateLabel" :stamina-balance="todayTotals.balance" /></div><section class="editor-actions panel"><p>{{ currentDay.manual ? '该日为手工计划；后续未固定日期会继续按新的缺口自动重算。' : '修改获取或支出后，该日会固定为手工计划，并向后传播材料状态。' }}</p><div><button v-if="futureManualCount" type="button" class="action-button" @click="clearFutureManualPlans"><RotateCcw :size="14" aria-hidden="true" />清除后续 {{ futureManualCount }} 个固定日</button><button type="button" class="action-button" @click="restoreCurrentDay"><RotateCcw :size="14" aria-hidden="true" />恢复当天推荐</button><button type="button" class="action-button primary" @click="openPlanner('display')"><Save :size="14" aria-hidden="true" />完成编辑</button></div></section></div></div></section>
      </section>
      </fieldset>
    </template>

    <Teleport to="body">
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
import { CalendarDays, Check, CircleAlert, Info, Plus, RefreshCw, RotateCcw, Save, SlidersHorizontal, Star, Target, X } from '@lucide/vue'
import OperatorAvatar from './OperatorAvatar.vue'
import { useOperatorPlannerCloud } from '../../composables/useOperatorPlannerCloud.js'
import { plannerDateInZone } from '../../data/operatorPlannerRemote.js'
import { addCalendarDays, businessDayStartIso, BUSINESS_DAY_START_HOUR, BUSINESS_TIMEZONE } from '../../utils/businessDay.js'
import OperatorTrainingPlanPicker from './OperatorTrainingPlanPicker.vue'
import { TRAINING_GROUPS, bookExperience, levelBookGapBundle, normalizeTrainingLevels, trainingMaterialEtas, trainingRate } from '../../data/operatorTraining.js'
import { FAVORITES_PLAN_ID, trainingPlanMemberIds } from '../../data/operatorTrainingPlans.js'
import { getCurrent, listRecords } from '../../api/inventory.js'
import { avatarUrl } from '../../api/request.js'
import { subscribeAccountEvents } from '../../store/accountEvents.js'
import { getOperatorGrowthTargets, putOperatorGrowthTarget } from '../../api/operator.js'
import { ITEM_CATALOG } from '../../data/inventory/catalog.js'
import { calculateLevelRequirements, calculateStarRequirements, calculateXiuweiRequirements, mergeRequirements, netRequirement, starLabelForStage, starStageFromLevel } from '../../data/operatorRequirements.js'
import { localDayKey } from '../../data/inventory/acquiredStats.js'
import PlannerDateTabs from './PlannerDateTabs.vue'
import CultivationProgress from './CultivationProgress.vue'
import { createFixedSchedule, fixedScheduleDifferences, fixedScheduleTimeline, reviseFixedSchedule } from '../../data/fixedPlannerSchedule.js'
import { GAIN_CHANNELS, PLANNER_RESOURCE_LABELS, PLANNER_RULES, PURCHASE_CUMULATIVE, SPEND_CHANNELS, aggregatePlannerState, allocateSharedPlannerStock, buildRecommendedPlan, simulatePlanner, settlePlannerDay, plannerProgressRows, plannerResourcesFromCalculation, clonePlannerValue, createGain, createInitialPlannerState, createSpend, energyFromGain, estimatePlannerDays, normalizePlannerPlan, normalizePlannerPreferences, planTotals } from '../../data/cultivationPlanner.js'

const props = defineProps({ accountId: { type: String, default: '' }, currentEntries: { type: Array, default: () => [] }, catalogEntries: { type: Array, default: () => [] }, favoriteIds: { type: Object, default: () => new Set() }, isLoggedIn: { type: Boolean, default: false }, refreshKey: { type: Number, default: 0 }, active: { type: Boolean, default: true }, annotationRevisions: { type: Object, default: () => ({}) }, isRemarkEditing: { type: Function, default: () => false } })

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
const { workspace, snapshot: cloudSnapshot, workspaceState, scheduleState, cloudLoading, scheduleLoading, cloudError,
  migration, migrationBusy, cloudBlocked, workspacePending, schedulePending, loadCloud, saveWorkspace, saveSchedule,
  removeMember, prepareMigration, importLocal, keepCloud, compareMigrationAgain, recover, refreshCloud } = useOperatorPlannerCloud(props, targets, emit)
const scheduleTimezone = ref(BUSINESS_TIMEZONE)
const planError = ref('')
const planNotice = ref('')
const undoWorkspace = ref(null)
const viewMode = ref('display')
const plannerOpen = ref(true)
const settingsOpen = ref(false)
const goalMode = ref(false)
const goalDays = ref(10)
const goalExtraStamina = ref(0)
const addMenu = ref('')
const pendingSpendChannel = ref('')
const spendAddRef = ref(null)
const pendingTrainingGroup = computed(() => trainingGroupForSpend({ id: pendingSpendChannel.value }))
const addTrainingStages = computed(() => pendingTrainingGroup.value?.stages.filter(stage => stage.level <= plannerLevels.value[pendingTrainingGroup.value.id]) || [])
const plannerPreferences = ref(normalizePlannerPreferences())
const strategy = ref('overall')
const plannerOrder = ref([])
const manualPlans = ref({})
const fixedSchedule = ref(null)
const plannerToday = ref(plannerDateInZone(BUSINESS_TIMEZONE, new Date(), BUSINESS_DAY_START_HOUR))
const plannerWorkspaceRef = ref(null)
const plannerStartDate = ref(plannerToday.value)
const selectedDate = ref(plannerStartDate.value)
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
const activeMemberIds = computed(() => trainingPlanMemberIds(activePlan.value, props.favoriteIds))
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
function dismissStarTarget(event) { if (addMenu.value && !event.target.closest('.add-wrap')) { addMenu.value = ''; pendingSpendChannel.value = '' } if (starTargetId.value && !event.target.closest('.tracker-star-anchor')) closeStarTarget() }
function growthTargetReachedLocal(current, target) { const currentStar = Number(current.starLevel) >= 25 && Number(current.starLevel) < 31 ? 25 : Number(current.starLevel) || 0; const targetStar = Number(target.starLevel) >= 25 && Number(target.starLevel) < 31 ? 25 : Number(target.starLevel) || 0; return currentStar >= targetStar && Number(current.level) >= target.level && Number(current.elite) >= target.elite }

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
const plannerEtaDays = computed(() => plannerSimulation.value.etaDays)
const plannerTimeline = computed(() => fixedSchedule.value ? fixedScheduleTimeline(fixedSchedule.value) : plannerSimulation.value.timeline)
const plannerCycleDays = computed(() => Math.min(plannerRules.maxEtaDays, Math.max(1, plannerTimeline.value.length, dateOffset(selectedDate.value) + 1)))
const plannerDates = computed(() => [...new Set([
  ...(fixedSchedule.value ? plannerTimeline.value.map(day => day.date) : Array.from({ length: plannerCycleDays.value }, (_, index) => addDays(plannerStartDate.value, index))),
  ...Object.keys(manualPlans.value)
])].sort())
const plannerCycleNotice = computed(() => {
  const result = plannerSimulation.value
  if (result.status === 'invalid') return '日程包含体力不足、次数超限或未开放层数；无效日不计入产出，后续模拟暂停，请先修正。'
  if (result.status === 'blocked') return (result.lastProgressDay ? '可模拟部分推进至第 ' + result.lastProgressDay + ' 天。' : '') + '剩余缺口无法由当前已配置渠道继续补齐，详见培养推进；增加体力不一定能解决。'
  if (result.status === 'horizon') return '当前推荐在 90 天内尚未备齐材料；这是贪心估算，不是推荐天数或不可完成的证明。'
  return '材料备齐即停止推荐；推荐为逐日贪心估算，不保证全局最短。'
})
const futureManualCount = computed(() => Object.keys(manualPlans.value).filter(date => date > selectedDate.value).length)
const outsideManualDates = computed(() => Object.keys(manualPlans.value).filter(date => date >= plannerStartDate.value && !plannerTimeline.value.some(day => day.date === date)).sort())
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
const currentDateLabel = computed(() => formatLongDate(currentDay.value.date))
const todayTotals = computed(() => planTotals(currentDay.value.planned))
const recommendedTotals = computed(() => planTotals(currentDay.value.recommended))
const plannerEtaLabel = computed(() => loading.value ? '同步中' : error.value ? '库存未同步' : simulationLabel(plannerSimulation.value))
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
  if (result.status === 'invalid') return '日程待修正'
  if (result.status === 'blocked') return '获取途径待补充'
  if (result.status === 'horizon') return '90 天内未备齐'
  return result.etaDays === 0 ? '材料已备齐' : formatEta(result.etaDays)
}
const purchaseCostLabel = computed(() => formatNumber(PURCHASE_CUMULATIVE[normalizePlannerPreferences(plannerPreferences.value).purchaseCount]) + ' 白金币')
const aggregateMoneyLabel = computed(() => { const money = planRows.value.reduce((sum, row) => sum + Number(row.calculation.total.money || 0), 0); return `目标五铢钱需求 ${formatNumber(money)}` })
const comparePurchaseCounts = computed(() => { const current = normalizePlannerPreferences(plannerPreferences.value).purchaseCount; return [...new Set([0, 2, current])] })
const compareOptions = computed(() => comparePurchaseCounts.value.map(purchaseCount => {
  const preferences = { ...plannerPreferences.value, purchaseCount }
  const result = fixedSchedule.value
    ? reviseFixedSchedule(fixedSchedule.value, { ...liveScheduleContext.value, preferences }, manualPlans.value).result
    : simulatePlanner({ initialState: plannerInitialState.value, groups: TRAINING_GROUPS, levels: plannerLevels.value,
      strategy: strategy.value, agentOrder: plannerOrderForOptimization.value, preferences, dates: plannerHorizonDates.value })
  return { purchaseCount, ...result, label: simulationLabel(result), dailyCoins: PURCHASE_CUMULATIVE[purchaseCount],
    totalCoins: result.etaDays == null ? null : result.timeline.reduce((sum, day) => sum + PURCHASE_CUMULATIVE[day.planned.gains.filter(gain => gain.id === 'buy').reduce((n, gain) => n + gain.value, 0)], 0),
    tag: purchaseCount === 0 ? '零额外投入' : purchaseCount === 2 ? '每日购买两次' : '当前设置' }
}))

const goalResult = computed(() => { const days = Math.min(90, Math.max(1, Math.trunc(Number(goalDays.value)) || 1)); const extra = Math.max(0, Number(goalExtraStamina.value) || 0); for (let purchaseCount = 0; purchaseCount <= plannerRules.maxPurchaseCount; purchaseCount += 1) { const etaDays = estimatePlannerDays({ initialState: plannerInitialState.value, groups: TRAINING_GROUPS, levels: plannerLevels.value, strategy: strategy.value, agentOrder: plannerOrderForOptimization.value, preferences: { ...plannerPreferences.value, purchaseCount }, dates: plannerHorizonDates.value, initialExtra: extra, maxDays: days }); if (etaDays != null && etaDays <= days) return { feasible: true, purchaseCount, etaDays, dailyCoins: PURCHASE_CUMULATIVE[purchaseCount], totalCoins: PURCHASE_CUMULATIVE[purchaseCount] * etaDays } } return { feasible: false, purchaseCount: null, etaDays: null, dailyCoins: 0, totalCoins: 0 } })

function plannerStateTotal(state) { return Object.values(aggregatePlannerState(state || {})).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) }
function resourceIcon(id) { const key = id === '__xp__' ? 'bingshuquanjuan' : id; return ITEM_CATALOG.some(item => item.id === key) ? (import.meta.env?.BASE_URL || '/') + 'inventory-icons/items/' + encodeURIComponent(key) + '.png' : '' }
function operatorIcon(row) { return row?.id ? (import.meta.env?.BASE_URL || '/') + 'inventory-icons/agents/' + encodeURIComponent(row.id) + '.png' : '' }
function resourceName(id) { return PLANNER_RESOURCE_LABELS[id] || itemMap.value[id] || id }
function addDays(dateText, amount) { return addCalendarDays(dateText, amount) }
function dateOffset(dateText) { const start = new Date(plannerStartDate.value + 'T12:00:00'); const date = new Date(dateText + 'T12:00:00'); const offset = Math.round((date - start) / 86400000); return Number.isFinite(offset) ? offset : 0 }
function formatLongDate(dateText) { if (!dateText) return '未选择日期'; const [year, month, day] = dateText.split('-'); return year === String(new Date().getFullYear()) ? `${Number(month)}月${Number(day)}日` : `${year}年${Number(month)}月${Number(day)}日` }
function formatNumber(value) { return (Number(value) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }
function formatResource(value) { return formatNumber(value) }
function formatStamina(value) { return formatNumber(Math.round(Number(value) || 0)) }
function signedNumber(value) { const number = Math.round(Number(value) || 0); return number > 0 ? '+' + formatStamina(number) : formatStamina(number) }
function formatEta(days) { if (days == null) return '暂不可估算'; if (days <= 0) return '无需等待'; if (days < 1) return '不足 1 天'; return Math.ceil(days) + ' 天' }
function channelStyle(key) { return { '--channel': channelColors[key] || channelColors.custom } }
function recommendedValue(kind, id) { return currentDay.value.recommended?.[kind]?.find(item => item.id === id)?.value ?? 0 }
function progress(current, target) { const a = Number(current) || 0; const b = Number(target) || 0; return b <= 0 ? 100 : Math.min(100, Math.round(a * 100 / b)) }
function itemName(id) { return id === '__heart__' ? '心纸' : itemMap.value[id] || id }
function materialSummary(requirement) { return Object.keys(requirement?.items || {}).filter(id => requirement.items[id] > 0).slice(0, 3).map(id => itemName(id) + '×' + formatNumber(requirement.items[id])).join('、') }
function experienceStock(stock) { return Math.max(bookExperience(stock), Number(stock?.__experience__) || 0) }
function experienceSummary(gap) { const value = Math.max(0, Number(gap) || 0); if (!value) return '经验道具已备齐'; const books = levelBookGapBundle(value, plannerLevels.value.experience); const bookText = books.map(book => book.name + '×' + formatNumber(book.lack)).join('、'); const stage624Runs = Math.ceil(value / Math.max(1, plannerRules.stage624Experience)); return bookText + ' · 6-24 约 ' + stage624Runs + ' 次' }
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

  const totals = new Map()
  const activeDays = new Map()
  records.forEach(record => {
    if (record?.record_type !== 'reward_delta') return
    const day = localDayKey(record.effective_at)
    if (!day) return
    for (const entry of Array.isArray(record.entries) ? record.entries : []) {
      const count = Number(entry?.count) || 0
      if (!entry?.id || count <= 0) continue
      totals.set(entry.id, (totals.get(entry.id) || 0) + count)
      if (!activeDays.has(entry.id)) activeDays.set(entry.id, new Set())
      activeDays.get(entry.id).add(day)
    }
  })
  return Object.fromEntries(Array.from(totals.entries()).map(([id, acquired]) => {
    const days = activeDays.get(id)?.size || 0
    return [id, { acquired, activeDays: days, average: days ? acquired / days : 0 }]
  }))
}
function heartHistoryFor(row) { return heartHistory.value[row?.id] || { acquired: 0, activeDays: 0, average: 0 } }
function heartDailyAverage(row) { return Number(heartHistoryFor(row).average) || 0 }
function heartDailyAverageLabel(row) {
  if (heartHistoryError.value) return '近30日流水暂不可用'
  if (!heartHistoryReady.value) return '近30日流水同步中'
  return '近 30 天 ' + formatNumber(heartDailyAverage(row)) + ' 片 / 日'
}
function heartEtaLabel(row) {
  if (!heartHistoryReady.value || heartHistoryError.value) return ''
  const gap = Math.max(0, Number(row?.calculation?.heartGap) || 0)
  if (!gap) return ''
  const average = heartDailyAverage(row)
  return average > 0 ? '约 ' + Math.ceil(gap / average) + ' 天' : '暂无近30日获取记录'
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
  const next = workspaceCopy(), id = draft.id || crypto.randomUUID()
  let plan = next.plans.find(item => item.id === id)
  if (!plan) { plan = { id, name: draft.name, source: 'custom', operatorIds: [], excludedOperatorIds: [], targets: {} }; next.plans.push(plan) }
  plan.name = draft.name
  if (plan.source === 'favorites') {
    plan.operatorIds = draft.operatorIds.filter(item => !props.favoriteIds.has(item))
    plan.excludedOperatorIds = [...props.favoriteIds].filter(item => !draft.operatorIds.includes(item))
  } else {
    plan.operatorIds = draft.operatorIds
    for (const memberId of draft.operatorIds) if (!plan.targets[memberId]) plan.targets[memberId] = targetFor({ id: memberId, ...currentMap.value[memberId] })
  }
  next.activePlanId = id
  if (await commitWorkspace(next, draft.id ? '清单已保存到云端' : '培养计划已创建')) { closeStarTarget(); onSaved?.() }
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
async function removePlan() {
  if (activePlan.value.source === 'favorites' || targetBusyIds.value.size) return
  const next = workspaceCopy(); next.plans = next.plans.filter(plan => plan.id !== activePlan.value.id); next.activePlanId = FAVORITES_PLAN_ID
  if (await commitWorkspace(next, '培养计划已删除', true)) { closeStarTarget(); targetNotice.value = '' }
}
function undoPlanChange() { if (undoWorkspace.value) commitWorkspace(JSON.parse(JSON.stringify(undoWorkspace.value)), '已恢复清单') }
async function setTrainingLevel(groupId, event) {
  const next = workspaceCopy(); next.trainingLevels[groupId] = Number(event.target.value)
  if (!await commitWorkspace(next)) event.target.value = workspace.value.trainingLevels[groupId]
  else persistPlannerSnapshot()
}
function applyPlannerSnapshot(snapshot) {
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
  if (loading.value || targetLoading.value || error.value) return
  const previous = fixedSchedule.value
  fixedSchedule.value = createFixedSchedule(liveScheduleContext.value, manualPlans.value, previous)
  plannerStartDate.value = fixedSchedule.value.startDate
  if (persistPlannerSnapshot(false)) {
    selectedDate.value = plannerToday.value
    planNotice.value = '已按当前库存更新今天及之后的日程，过去的安排已保留'
  } else { fixedSchedule.value = previous; plannerStartDate.value = previous?.startDate || plannerToday.value }
}
function editSchedule() {
  if (reviewingHistory.value) selectedDate.value = plannerDates.value.find(date => date >= plannerToday.value) || selectedDate.value
  viewMode.value = 'edit'
}
function setStrategy(value) { strategy.value = value; persistPlannerSnapshot() }
function savePreferences() { plannerPreferences.value = normalizePlannerPreferences(plannerPreferences.value); persistPlannerSnapshot() }
function changePreference(key, delta) { plannerPreferences.value = normalizePlannerPreferences({ ...plannerPreferences.value, [key]: (Number(plannerPreferences.value[key]) || 0) + delta }); persistPlannerSnapshot() }
function onRosterDragStart(id) { rosterDragId.value = id }
function onRosterDrop(targetId) { if (cloudBlocked.value) return; const ids = [...orderedRosterIds.value]; const from = ids.indexOf(rosterDragId.value); const to = ids.indexOf(targetId); if (from < 0 || to < 0 || from === to) return; ids.splice(from, 1); ids.splice(to, 0, rosterDragId.value); plannerOrder.value = ids; rosterDragId.value = ''; persistPlannerSnapshot() }
function selectDate(date) { selectedDate.value = date; addMenu.value = ''; pendingSpendChannel.value = '' }
function ensureManualPlan() { const date = selectedDate.value; const current = currentDay.value; const next = clonePlannerValue(manualPlans.value); if (!next[date]) next[date] = normalizePlannerPlan(clonePlannerValue(current.planned)); return { next, plan: next[date] } }
function commitManualPlan(next) {
  if (loading.value || targetLoading.value || error.value || reviewingHistory.value) return
  const previousPlans = manualPlans.value
  const previousSchedule = fixedSchedule.value
  manualPlans.value = next
  if (!fixedSchedule.value) fixedSchedule.value = createFixedSchedule(liveScheduleContext.value, previousPlans)
  if (!persistPlannerSnapshot()) { manualPlans.value = previousPlans; fixedSchedule.value = previousSchedule }
}
function updatePlanValue(kind, index, event) { const { next, plan } = ensureManualPlan(); const value = Math.max(0, Number(event.target.value) || 0); plan[kind][index].value = value; commitManualPlan(next) }
function updateCustomName(kind, index, event) { const { next, plan } = ensureManualPlan(); const value = String(event.target.value || '').trim().slice(0, 32) || (kind === 'gains' ? '自定义来源' : '自定义支出'); plan[kind][index].name = value; plan[kind][index].label = value; commitManualPlan(next) }
function updateSpendCost(index, event) { const { next, plan } = ensureManualPlan(); plan.spends[index].costPer = Math.max(0, Number(event.target.value) || 0); commitManualPlan(next) }
function removePlanRow(kind, index) { const { next, plan } = ensureManualPlan(); plan[kind].splice(index, 1); commitManualPlan(next) }
function toggleAddMenu(kind) { pendingSpendChannel.value = ''; addMenu.value = addMenu.value === kind ? '' : kind; if (kind === 'spend' && addMenu.value) focusSpendMenu() }
function addGain(channelId) { const { next, plan } = ensureManualPlan(); const existing = plan.gains.find(gain => gain.id === channelId && !gain.custom); if (existing) existing.value += createGain(channelId).value; else plan.gains.push(createGain(channelId)); commitManualPlan(next); addMenu.value = '' }
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
function editableSpendYield(spend) { return spend.custom }
function updateSpendYield(index, id, event) { const { next, plan } = ensureManualPlan(); plan.spends[index].yield = { ...plan.spends[index].yield, [id]: Math.max(0, Number(event.target.value) || 0) }; commitManualPlan(next) }
function addSpendYield(index, event) { const id = event.target.value; if (!id) return; const { next, plan } = ensureManualPlan(); plan.spends[index].yield = { ...plan.spends[index].yield, [id]: 1 }; commitManualPlan(next); event.target.value = '' }
function removeSpendYield(index, id) { const { next, plan } = ensureManualPlan(); delete plan.spends[index].yield[id]; commitManualPlan(next) }
function applyComparison(purchaseCount) { plannerPreferences.value = { ...plannerPreferences.value, purchaseCount }; persistPlannerSnapshot() }
function restoreCurrentDay() { const next = { ...manualPlans.value }; delete next[selectedDate.value]; manualPlans.value = next; persistPlannerSnapshot() }
function clearFutureManualPlans() { const removed = futureManualCount.value; manualPlans.value = Object.fromEntries(Object.entries(manualPlans.value).filter(([date]) => date <= selectedDate.value)); persistPlannerSnapshot(); planNotice.value = removed ? `已清除后续 ${removed} 个固定日，推荐会自动重算` : '未来推荐本来就会随设置自动刷新' }
function openPlanner(mode = 'display') { plannerOpen.value = true; viewMode.value = mode; if (mode === 'display') { goalMode.value = false; settingsOpen.value = false } nextTick(() => { const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; plannerWorkspaceRef.value?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }) }) }
function toggleSettings() { goalMode.value = false; settingsOpen.value = !settingsOpen.value; plannerOpen.value = true; viewMode.value = 'edit' }

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
  if (['operator_training_workspace', 'operator_stamina_schedule', 'account_stream_open'].includes(message.event)) refreshCloud()
  if (['operator_growth_target', 'account_stream_open'].includes(message.event)) scheduleTargetRefresh()
  if (['inventory_import', 'account_stream_open', 'operator_scan_import', 'operator-upgrade'].includes(message.event)) scheduleInventoryRefresh(message)
}

watch(() => [props.accountId, props.isLoggedIn], () => { currentItems.value = {}; currentAgents.value = {}; closeStarTarget(); undoWorkspace.value = null; planError.value = ''; planNotice.value = ''; removePromptRow.value = null; removePromptBusy.value = false }, { immediate: true })
watch(() => [props.accountId, props.isLoggedIn, props.refreshKey, props.active], () => { if (props.active) { syncPlannerClock(); emit('refresh-operators'); loadTargets(); loadInventory() } }, { immediate: true })
watch(cloudSnapshot, applyPlannerSnapshot)
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
.status-metric-primary strong { color: var(--accent-strong); font-size: 30px; }
.status-metric strong.negative { color: var(--rouge); }
.status-metric strong small { margin-left: 5px; color: var(--accent-strong); font: 800 10px/1 var(--font-b); }
.planner-view { display: grid; gap: 12px; }.plan-badge { display: inline-flex; min-height: 24px; align-items: center; padding: 0 10px; border: 1px solid rgba(155, 122, 70, .12); border-radius: 999px; background: #f7eddc; color: #8a6a38; font-size: 10px; font-weight: 780; }.plan-badge.manual { background: #f0e8f6; color: #7e6699; }
.display-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }.planner-card { min-width: 0; padding: 18px; }.card-heading, .ledger-heading, .compare-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }.card-heading h3 { margin-top: 3px; color: var(--ink); font: 900 18px/1.3 var(--font-s); }.card-heading p { margin-top: 4px; color: var(--planner-muted); font-size: 11px; line-height: 1.5; }.day-summary { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-top: 13px; padding: 8px 0 14px; border-bottom: 1px solid var(--planner-line); font-variant-numeric: tabular-nums; }.summary-metric { display: inline-flex; align-items: baseline; gap: 7px; }.summary-metric span, .summary-balance span { color: var(--planner-muted); font-size: 13px; font-weight: 650; }.summary-metric b, .summary-balance b { font: 830 17px var(--font-d); }.gain b, .gain-text, .gain-total b { color: var(--planner-gain); }.spend b, .spend-text, .spend-total b { color: var(--planner-spend); }.summary-op { color: #c7b8aa; font-weight: 800; }.summary-balance { display: inline-flex; align-items: baseline; gap: 7px; padding: 5px 9px; }.summary-balance.negative b { color: var(--rouge); }.flow-section { padding-top: 14px; }.flow-section + .flow-section { margin-top: 11px; border-top: 1px solid var(--planner-line); }.flow-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 9px; color: #877462; font-size: 13px; font-weight: 780; }.channel-chips { display: flex; flex-wrap: wrap; gap: 8px; }.channel-chip { --channel: #887e8f; display: inline-flex; min-height: 38px; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid color-mix(in srgb, var(--channel) 20%, #d9cbb9); border-radius: 11px; background: color-mix(in srgb, var(--channel) 8%, #fffaf4); color: color-mix(in srgb, var(--channel) 84%, #34291f); font-size: 12px; font-weight: 780; font-variant-numeric: tabular-nums; }.channel-chip small { color: color-mix(in srgb, var(--channel) 68%, #6f6258); font-size: 11px; }.channel-chip strong { margin-left: 6px; font-size: 12px; }.channel-dot, .channel-label i, .swatch i { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--channel); }.channel-chip strong { color: var(--planner-gain); }.channel-chip:not(.natural):not(.meal):not(.buy):not(.mail):not(.event):not(.gift) strong { color: var(--planner-spend); }.flow-empty { color: var(--planner-muted); font-size: 12px; }.balance-warning { display: flex; align-items: flex-start; gap: 6px; margin-top: 14px; padding: 9px 10px; border-radius: 9px; background: rgba(166, 81, 74, .07); color: var(--rouge); font-size: 11px; line-height: 1.6; }
.progress-card { display: flex; flex-direction: column; }.progress-tags { display: flex; justify-content: flex-end; gap: 6px; flex-wrap: wrap; }.progress-tag { padding: 5px 8px; border: 1px solid rgba(155, 122, 70, .1); border-radius: 10px; background: #f6eee1; color: #8f7b68; font-size: 10px; font-weight: 730; white-space: nowrap; }.progress-tag.key { background: #f0e8f6; }.progress-tag b { color: var(--ink); }.progress-list { display: grid; gap: 13px; margin-top: 16px; }.progress-item { display: grid; gap: 6px; }.progress-item-head, .progress-item-foot { display: flex; justify-content: space-between; gap: 8px; color: var(--planner-muted); font-size: 11px; }.progress-item-head > span:first-child { color: var(--ink); font-size: 13px; font-weight: 800; }.progress-item-head b, .progress-item-foot b { color: var(--planner-gain); }.progress-track { position: relative; height: 10px; overflow: hidden; border-radius: 999px; background: #efe4d4; }.progress-track i { position: absolute; top: 0; bottom: 0; display: block; }.progress-current { left: 0; background: #c48b4d; }.progress-old { left: 0; background: #c48b4d; }.progress-today { background: #e8bc6c; }.progress-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; padding-top: 16px; color: var(--planner-muted); font-size: 10px; }.progress-legend span { display: inline-flex; align-items: center; gap: 4px; }.progress-legend i { width: 10px; height: 6px; border-radius: 99px; }.legend-current { background: #c48b4d; }.legend-old { background: #c48b4d; }.legend-today { background: #e8bc6c; }.planner-footnote { color: var(--ink-60); font-size: 11px; line-height: 1.7; }
.edit-grid { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; align-items: start; }.planner-sidebar { position: sticky; top: 10px; padding: 12px; }.side-section { padding: 12px 0; }.side-section + .side-section { border-top: 1px solid var(--planner-line); }.side-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 12px; font-weight: 820; }.side-hint { color: var(--planner-muted); font-size: 9px; font-weight: 600; }.side-explain, .drag-note, .purchase-note, .side-details p, .field-help, .goal-panel > p { color: var(--planner-muted); font-size: 10px; line-height: 1.6; }.side-explain { margin-top: 8px; }.strategy-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; border: 1px solid var(--planner-line); border-radius: 10px; background: #f6ecdc; }.strategy-switch button { min-height: 38px; padding: 6px 5px; border: 0; border-radius: 7px; background: transparent; color: #8d7966; font-size: 10px; font-weight: 780; }.strategy-switch button.active { background: var(--planner-deep); color: #fff; }
.edit-roster { display: grid; grid-auto-rows: 184px; align-content: start; gap: 6px; min-height: 948px; max-height: 948px; overflow: auto; padding: 2px; }.edit-roster-item { display: grid; grid-template-columns: 14px 28px minmax(0, 1fr) auto; align-items: center; gap: 5px; padding: 7px 5px; border: 1px solid var(--planner-line); border-radius: 10px; background: var(--planner-card); }.edit-roster-item:hover { border-color: var(--accent); }.drag-handle { color: #b19f8c; cursor: grab; font-size: 12px; letter-spacing: -3px; }.edit-roster-name { min-width: 0; }.edit-roster-name b, .edit-roster-name small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.edit-roster-name b { font-size: 11px; }.edit-roster-name small { margin-top: 2px; color: var(--planner-muted); font-size: 9px; }.move-buttons { display: flex; flex-direction: column; gap: 2px; }.move-buttons button { display: grid; width: 24px; height: 22px; place-items: center; padding: 0; border: 1px solid var(--planner-line); border-radius: 5px; background: #f2e6d3; color: #8f7c6b; }.move-buttons button:disabled { opacity: .35; cursor: not-allowed; }.target-fields { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding-top: 5px; border-top: 1px dashed var(--planner-line); }.target-fields label, .setting-line label, .ledger-input-wrap label, .custom-name-field, .custom-cost-field, .goal-panel label { display: flex; flex-direction: column; gap: 4px; color: var(--planner-muted); font-size: 9px; font-weight: 750; }.target-fields input, .target-fields select, .counter input, .ledger-input-wrap input, .custom-name-field input, .custom-cost-field input, .goal-panel input { width: 100%; min-width: 0; min-height: 36px; padding: 6px 7px; border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); font: 700 11px var(--font-d); }.target-fields select { font-family: var(--font-b); }.drag-note { margin-top: 7px; }.setting-line { display: flex; align-items: center; justify-content: space-between; gap: 7px; margin-top: 8px; }.setting-line label { color: var(--ink); font-size: 10px; }.counter { display: flex; overflow: hidden; border: 1px solid var(--planner-line); border-radius: 8px; }.counter button { width: 30px; min-height: 36px; border: 0; background: #f4e9d8; color: var(--ink); font-size: 16px; }.counter input { width: 42px; min-height: 36px; border: 0; border-right: 1px solid var(--planner-line); border-left: 1px solid var(--planner-line); border-radius: 0; background: var(--planner-card); text-align: center; }.purchase-note { margin-top: 7px; }
.side-actions { display: grid; gap: 6px; margin-top: 10px; }.side-button, .back-button, .action-button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; border: 1px solid var(--planner-line); border-radius: 9px; background: var(--planner-card); color: var(--ink); font-size: 10px; font-weight: 800; }.side-button:hover, .back-button:hover, .action-button:hover { border-color: var(--accent); }.side-button.primary, .action-button.primary { border-color: var(--planner-deep); background: var(--planner-deep); color: #fff; }.side-button.goal { border-color: #e5d8ef; background: #f0e8f6; color: #7e6699; }.side-details summary { color: var(--ink); font-size: 11px; font-weight: 800; cursor: pointer; }.training-levels { display: grid; gap: 7px; margin-top: 9px; }.training-levels label { display: flex; align-items: center; justify-content: space-between; gap: 7px; color: var(--planner-muted); font-size: 10px; }.training-levels select { min-width: 100px; min-height: 36px; padding: 6px; border: 1px solid var(--planner-line); border-radius: 7px; background: var(--cream); color: var(--ink); font-size: 10px; }
.goal-panel { padding: 8px 2px 2px; }.goal-panel h3 { margin-top: 4px; color: var(--ink); font: 900 20px var(--font-s); }.goal-panel > p { margin-top: 6px; }.goal-panel label { margin-top: 14px; color: var(--ink); font-size: 11px; }.goal-panel input { min-height: 44px; margin-top: 1px; font-size: 15px; }.field-help { margin-top: 4px; }.goal-shortcuts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 12px; }.goal-shortcuts button { min-height: 32px; padding: 0 9px; border: 1px solid var(--planner-line); border-radius: 8px; background: var(--planner-card); color: var(--planner-muted); font-size: 10px; font-weight: 800; }.goal-shortcuts button.active { border-color: var(--planner-deep); background: var(--planner-deep); color: #fff; }.goal-result { margin-top: 14px; padding: 11px; border: 1px solid rgba(166, 81, 74, .2); border-radius: 11px; background: rgba(166, 81, 74, .06); }.goal-result.feasible { border-color: rgba(109, 148, 116, .3); background: rgba(109, 148, 116, .08); }.goal-result-title { color: var(--ink); font-size: 12px; font-weight: 850; }.goal-result p { margin-top: 7px; color: var(--rouge); font-size: 10px; line-height: 1.6; }.goal-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 9px; }.goal-metrics div { padding: 8px; border: 1px solid rgba(149, 126, 100, .1); border-radius: 8px; background: rgba(255, 255, 255, .58); }.goal-metrics span, .goal-metrics b { display: block; }.goal-metrics span { color: var(--planner-muted); font-size: 9px; }.goal-metrics b { margin-top: 3px; color: var(--ink); font: 800 13px var(--font-d); }.back-button { width: 100%; margin-top: 12px; }
.editor-main { display: grid; min-width: 0; gap: 12px; }.ledger-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.ledger-card { padding: 12px; }.ledger-heading h3, .compare-heading h3 { color: var(--ink); font-size: 13px; }.ledger-heading span, .compare-heading span { color: var(--planner-muted); font-size: 9px; }.ledger-row { display: grid; grid-template-columns: minmax(100px, 1fr) 82px 55px 26px; align-items: center; gap: 7px; padding: 10px 0; border-top: 1px solid var(--planner-line); }.ledger-row:first-of-type { margin-top: 5px; }.ledger-label-wrap { display: grid; min-width: 0; gap: 5px; }.channel-label { --channel: #887e8f; display: inline-flex; width: max-content; max-width: 100%; align-items: center; gap: 5px; padding: 4px 7px; border: 1px solid color-mix(in srgb, var(--channel) 20%, #d9cbb9); border-radius: 8px; background: color-mix(in srgb, var(--channel) 9%, white); color: color-mix(in srgb, var(--channel) 82%, #34291f); font-size: 12px; line-height: 1.5; font-weight: 750; overflow-wrap: anywhere; }.channel-label i { width: 6px; height: 6px; }.custom-name-field, .custom-cost-field { font-size: 8px; }.custom-name-field input, .custom-cost-field input { min-height: 32px; background: #fffdf6; font-family: var(--font-b); }.custom-cost-field { display: inline-flex; flex-direction: row; align-items: center; gap: 4px; }.custom-cost-field input { width: 52px; }.ledger-input-wrap { display: flex; align-items: center; gap: 4px; }.ledger-input-wrap label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }.ledger-input-wrap input { width: 50px; min-height: 34px; padding: 4px; border: 0; border-bottom: 1px solid #cdb997; border-radius: 0; background: transparent; text-align: right; }.ledger-input-wrap > span { padding-bottom: 0; color: var(--planner-muted); font-size: 8px; white-space: nowrap; }.recommendation { padding-top: 0; color: var(--planner-muted); font-size: 8px; text-align: right; }.row-remove { display: grid; width: 26px; height: 32px; place-items: center; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--planner-muted); }.row-remove:hover { background: rgba(166, 81, 74, .08); color: var(--rouge); }.add-wrap { position: relative; margin-top: 6px; }.add-button { display: inline-flex; width: 100%; min-height: 36px; align-items: center; justify-content: center; gap: 5px; border: 1px dashed var(--planner-line); border-radius: 8px; background: var(--planner-card); color: var(--planner-muted); font-size: 10px; font-weight: 780; }.add-menu { position: absolute; z-index: 20; right: 0; bottom: calc(100% + 5px); left: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 6px; border: 1px solid var(--planner-line); border-radius: 10px; background: var(--planner-card); box-shadow: 0 12px 26px rgba(70, 50, 32, .14); }.add-menu button { display: flex; min-height: 38px; align-items: center; padding: 4px; border: 0; border-radius: 7px; background: transparent; text-align: left; }.add-menu button:hover { background: #f5ebdc; }.ledger-total { display: flex; align-items: baseline; justify-content: space-between; margin-top: 7px; padding-top: 8px; border-top: 1px dashed var(--planner-line); color: var(--planner-muted); font-size: 10px; }.ledger-total b { font: 850 15px var(--font-d); }.compare-card { padding: 12px; }.compare-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; margin-top: 9px; }.compare-option { min-width: 0; padding: 10px; border: 1px solid rgba(149, 126, 100, .13); border-radius: 11px; background: var(--planner-card); }.compare-option.active { border-color: #d1b88b; background: #f8f1e5; }.compare-option span, .compare-option small, .compare-option em { display: block; color: var(--planner-muted); font-size: 8px; line-height: 1.5; }.compare-option b { display: block; margin-top: 2px; font-size: 10px; }.compare-option strong { display: block; margin-top: 5px; font: 860 18px var(--font-d); }.compare-option em { margin-top: 4px; color: var(--accent-strong); font-style: normal; }.editor-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; }.editor-actions p { max-width: 560px; color: var(--planner-muted); font-size: 10px; line-height: 1.6; }.editor-actions > div { display: flex; gap: 6px; flex-wrap: wrap; }.action-button { min-height: 38px; }
@media (max-width: 1080px) { .edit-grid { grid-template-columns: 270px minmax(0, 1fr); } }
@media (max-width: 900px) { .display-grid, .edit-grid, .ledger-grid, .notes-grid { grid-template-columns: 1fr; }.planner-sidebar { position: static; } }
@media (max-width: 640px) { .growth-tracker { padding: 15px; border-radius: 17px; }.planner-heading { flex-direction: column; }.planner-heading h2 { font-size: 21px; }.planner-refresh { width: 100%; justify-content: center; }.status-metrics { grid-template-columns: 1fr 1fr; }.status-metric:nth-child(3), .status-metric:nth-child(4) { border-top: 1px solid var(--planner-line); }.status-metric:nth-child(3) { border-left: 0; }.planner-card { padding: 14px; }.card-heading { flex-direction: column; }.progress-tags { justify-content: flex-start; }.compare-grid { grid-template-columns: 1fr; }.ledger-row { grid-template-columns: minmax(90px, 1fr) 72px 50px 24px; }.editor-actions { align-items: stretch; flex-direction: column; }.editor-actions > div { width: 100%; }.action-button { flex: 1; }.target-fields input, .target-fields select, .counter input, .counter button, .ledger-input-wrap input, .goal-panel input { min-height: 44px; }.add-menu { grid-template-columns: 1fr; } }
/* The planner is a user-facing tool: the status header carries the visual identity,
   followed by the always-visible roster and schedule. */
.status-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 14px 0 18px; }
.status-title { min-width: 0; flex: 1 1 auto; }
.status-title h2 { margin-top: 5px; color: var(--ink); font: 900 25px/1.22 var(--font-s); letter-spacing: .02em; }
.status-actions, .workspace-head-actions, .edit-toolbar-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.status-action, .workspace-link, .workspace-close, .toolbar-button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; border: 1px solid var(--planner-line); border-radius: 10px; background: rgba(255, 253, 246, .84); color: var(--ink); font-size: 11px; font-weight: 800; }
.status-action:hover, .workspace-link:hover, .toolbar-button:hover { border-color: var(--accent); color: var(--accent-strong); }
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
.growth-card { position: relative; align-self: start; min-width: 0; padding: 14px 12px; border: 1px solid var(--yellow-deep); border-top-width: 3px; border-radius: 15px; background: linear-gradient(180deg, var(--cream), var(--surface)); box-shadow: 0 4px 12px rgba(73, 59, 44, .04); }
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
.growth-percent { color: var(--planner-deep); font: 850 20px var(--font-d); }
.growth-card.complete .growth-percent { color: #b88507; }
.growth-percent small { margin-left: 2px; font: 700 10px var(--font-b); }
.growth-progress-list { display: grid; gap: 10px; margin-top: 14px; }
.growth-progress-row { display: grid; gap: 5px; }
.growth-progress-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; color: var(--planner-muted); font-size: 10px; }
.growth-progress-label > span { font-weight: 800; }
.growth-progress-label b { color: var(--ink); font: 750 10px var(--font-d); white-space: nowrap; }
.progress-values { display: inline-flex; align-items: center; gap: 5px; min-width: 0; font-family: var(--font-d); }
.growth-progress-row > small { overflow: hidden; color: var(--planner-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.heart-gap { color: var(--planner-muted); font-weight: inherit; }
.heart-gap-number { color: var(--rouge); font: inherit; font-weight: inherit; }
.heart-average { color: var(--planner-muted); }
.heart-progress-note { overflow: visible !important; line-height: 1.5; text-overflow: clip !important; white-space: normal !important; }
.growth-track { height: 7px; overflow: hidden; border-radius: 99px; background: #efe4d4; }
.growth-track i { display: block; height: 100%; border-radius: inherit; background: #c48b4d; transition: width .2s ease; }
.growth-track.mint i { background: #88b296; }
.growth-track.rose i { background: #b88ba2; }
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
.growth-material-note { margin-top: 8px; color: var(--planner-muted); font-size: 9px; line-height: 1.6; }
.tracker-editable { min-height: 28px; padding: 2px; border: 0; border-bottom: 1px dashed var(--accent); border-radius: 0; background: transparent; color: var(--ink); font: 700 13px var(--font-d); }
.tracker-editable:hover:not(:disabled) { color: var(--accent-strong); }
.tracker-editable:focus { border-bottom-color: var(--accent-strong); background: var(--surface); }
.tracker-editable:disabled, .tracker-star-popover :disabled { opacity: .58; cursor: wait; }
.tracker-number-input { width: 4ch; min-width: 32px; text-align: center; appearance: textfield; cursor: text; }
.tracker-number-input::-webkit-outer-spin-button, .tracker-number-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.target-star-select { appearance: none; -webkit-appearance: none; }
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
.planner-workspace-head h2 { margin-top: 4px; color: var(--ink); font: 900 20px var(--font-s); }
.planner-workspace-head p { max-width: 720px; margin-top: 5px; color: var(--planner-muted); font-size: 11px; line-height: 1.6; }
.workspace-close { width: 40px; padding: 0; color: var(--planner-muted); }
.workspace-close:hover { border-color: var(--rouge); color: var(--rouge); }
.planner-view, .planner-display, .planner-edit, .editor-main, .edit-grid, .settings-panel, .ledger-grid { min-width: 0; max-width: 100%; }

@media (min-width: 901px) { .edit-grid { grid-template-columns: 292px minmax(0, 1fr); } }
.planner-sidebar { top: 16px; }
.edit-roster-item { grid-template-columns: 16px 46px minmax(0, 1fr) 30px; gap: 7px; padding: 8px 7px; }
.edit-roster-item :deep(.operator-avatar) { width: 46px; height: 46px; }
.roster-remove { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--planner-muted); }
.roster-remove:hover { border-color: rgba(166, 81, 74, .2); background: rgba(166, 81, 74, .08); color: var(--rouge); }
.edit-roster-name b { font-size: 12px; }
.edit-roster-name small { font-size: 10px; }
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
.training-settings-block .training-levels label { font-size: 10px; }
.training-settings-block .training-levels select { min-height: 34px; }
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
  .status-main, .planner-workspace-head { flex-direction: column; }
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
  .workspace-link { flex: 1; }

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
.yield-editor { display: grid; gap: 6px; }
.yield-editor label { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 12px; }
.yield-editor input { width: 80px; min-height: 40px; }
.yield-editor select { min-width: 0; width: 100%; min-height: 40px; }
.yield-editor input, .yield-editor select { color: var(--ink); background: var(--cream); border: 1px solid var(--planner-line); border-radius: 6px; padding: 4px; }
.yield-editor button { min-width: 40px; min-height: 40px; border: 1px solid var(--planner-line); border-radius: 6px; color: var(--rouge); background: var(--cream); }
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
.spend-name { display: inline-flex; min-width: 0; align-items: center; flex-wrap: wrap; gap: 6px; }
.spend-name b { color: inherit; font-size: 12px; line-height: 1.5; font-weight: 750; }
.spend-stage { padding: 2px 6px; border: 1px solid color-mix(in srgb, var(--channel) 22%, transparent); border-radius: 5px; background: var(--surface); font: 650 11px/1.5 var(--font-d); white-space: nowrap; }
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
.target-fields .progress-values select { width: 100%; min-width: 0; min-height: 28px; height: 28px; padding: 2px 3px; border: 0; border-bottom: 1px dashed var(--accent); border-radius: 0; background: transparent; color: var(--ink); font: 700 10px var(--font-b); }
.edit-roster-name b { white-space: normal; overflow-wrap: anywhere; }
.stage-menu { grid-template-columns: repeat(3, minmax(0, 1fr)); max-height: 300px; overflow-y: auto; }
.stage-menu-heading { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 6px; color: var(--ink-60); font-size: 11px; }
.add-menu button { min-height: 44px; }.stage-menu > button { justify-content: center; border: 1px solid var(--planner-line); font-size: 12px; color: var(--ink); background: var(--cream); }
.add-menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
@media (max-width: 640px) { .stage-menu { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .target-fields .progress-values input, .target-fields .progress-values select { min-height: 44px; height: 44px; } }
.schedule-saved-note { display: flex; align-items: center; gap: 6px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.schedule-saved-note > svg { flex: none; color: var(--accent-strong); }
.schedule-update { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-left: 3px solid var(--accent); background: var(--cream); }
.schedule-update strong { color: var(--tea); font-size: 13px; }.schedule-update p { margin-top: 5px; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.schedule-update button { flex: none; min-height: 44px; }
@media (max-width: 640px) { .schedule-update { flex-direction: column; align-items: stretch; } }
</style>
