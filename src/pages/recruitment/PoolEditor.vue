<template>
  <Teleport to="body">
    <div v-if="open && pool" class="modal-mask" @click.self="close">
      <section ref="panel" class="pool-editor" :class="{ 'is-dragging': dragging }" :data-practice="practice || undefined" role="dialog" aria-modal="true" :aria-labelledby="editorId + '-title'" tabindex="-1">
        <header class="editor-header">
          <div class="editor-title">
            <span class="editor-eyebrow">{{ practice ? '练习 · 不会保存到你的账号' : '招募档案' }}</span>
            <h2 :id="editorId + '-title'">{{ poolName }}</h2>
            <p class="pool-confirmation">{{ recruitmentPoolDateLabel(poolDefinition) }} · {{ practice ? '这是临时示例卡池' : '请确认是实际抽取的池' }}</p>
          </div>
          <button v-if="TUTORIALS_ENABLED && !guideVisible" type="button" class="guide-entry" @click="practice ? startGuide() : openGuide()">使用教程</button>
          <button v-if="guideVisible" type="button" class="guide-exit" @click="dismissGuide">退出教程</button>
          <button type="button" class="close-button" aria-label="关闭卡池编辑" :disabled="busy" @click="close">
            <X :size="20" aria-hidden="true" />
          </button>
        </header>

        <RecruitmentGuideChoice v-if="guidePicker" @record="startGuide" @practice="openPractice" @close="guidePicker = false" />
        <form @submit.prevent="submit" @focusin="scheduleEntryVisibility" @pointerdown.capture="holdGuideHint">
          <section class="progress-card" :class="{ 'is-saved': receiptVerified && Number(remaining) === saveReceipt.remaining_pulls }" :aria-labelledby="editorId + '-progress'">
            <h3 :id="editorId + '-progress'">当前保底</h3>
            <div class="progress-overview">
              <RecruitmentGuideHint v-if="guideVisible && guideStep === 'saved-progress'" target="saved-progress" :message="guideMessage" />
              <div data-guide-target="saved-progress" class="progress-number" aria-live="polite">
                <span>{{ progressLabel === '已抽' ? '距保底' : '已垫' }}</span>
                <strong>{{ displayedProgress == null ? '—' : displayedProgress }}</strong><span>抽</span>
                <small>{{ tailProgress == null ? '进度未知' : progressLabel === '已抽' ? `已垫 ${tailProgress} 抽` : `距保底 ${40 - tailProgress} 抽` }}</small>
              </div>
              <div class="progress-rail" aria-hidden="true"><span :style="{ width: tailProgress == null ? '0%' : tailProgress / 40 * 100 + '%' }"></span></div>
            </div>
            <div class="remaining-guide">
              <RecruitmentGuideHint v-if="guideVisible && guideStep === 'progress'" target="progress" :message="guideMessage" />
              <div class="record-view-switch progress-label-switch" role="group" aria-label="保底进度填写方式">
                <button v-for="label in ['已抽', '已垫']" :key="label" type="button" :class="{ 'is-selected': progressLabel === label }" :aria-pressed="progressLabel === label" :disabled="busy || readOnly || recordsLoading" @click="progressLabel = label">{{ label === '已抽' ? '距保底' : '已垫' }}</button>
              </div>
              <label data-guide-target="progress" class="remaining-field">
                <span class="sr-only">{{ progressLabel === '已抽' ? '距保底还差' : '已经垫了' }}</span>
                <span class="remaining-input">
                  <input ref="remainingInput" v-model="progressInput" type="number" inputmode="numeric" :min="progressLabel === '已抽' ? 1 : 0" :max="progressLabel === '已抽' ? 40 : 39" placeholder="未知" :disabled="busy || readOnly || recordsLoading" :aria-invalid="!!progressError || undefined" :aria-describedby="progressError ? editorId + '-progress-error' : undefined" @input="progressReviewed = false; progressError = ''" @blur="reviewProgress">
                  <span>抽</span>
                </span>
              </label>
            </div>
            <p v-if="progressError" :id="editorId + '-progress-error'" class="progress-error" role="alert">{{ progressError }}</p>
          </section>
          <div ref="editorBody" class="editor-body">
            <p v-if="readOnly && !practiceResult" data-guide-target="read-only" class="state-note">当前档案只可查看，暂不能修改。</p>
            <p v-else-if="pool?.catalog_state === 'hidden'" data-guide-target="read-only" class="state-note">此卡池已隐藏。已有记录、统计与保底保留，可维护和导出；不能新增出货。</p>
            <p v-else-if="!canRecord" data-guide-target="read-only" class="state-note">此卡池已停用或目录暂不可用。可以修改已有记录与保底，暂不能新增出货。</p>

            <RecruitmentGuideHint v-if="guideVisible && guideStep === 'read-state'" target="read-state" :message="guideMessage"><button type="button" :disabled="busy" @click="openPractice">先练习一下</button></RecruitmentGuideHint>
            <div data-guide-target="read-state">
            <p v-if="error" ref="errorSummary" class="form-error" role="alert" tabindex="-1">{{ error }}</p>
            <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>
            <div v-if="missingRecordIds.length" class="form-error" role="alert">
              有 {{ missingRecordIds.length }} 笔旧记录已在其他设备移除。其余草稿仍保留，请核对后移除失效草稿，再重新调整顺序。
              <button type="button" :disabled="busy" @click="discardMissingRecords">核对失效草稿</button>
            </div>
            <p v-if="busy" class="state-note" role="status">正在处理保存或刷新请求…</p>
            <p v-if="recordsLoading" class="state-note" role="status">正在读取本池出货记录…</p>
            <div v-if="recordsError" class="form-error" role="alert">
              {{ recordsError }}
              <button type="button" class="inline-action" :disabled="busy || recordsLoading" @click="$emit('retry')">重新读取</button>
            </div>

            </div>
            <RecruitmentGuideHint v-if="guideVisible && guideStep === 'read-only'" target="read-only" :message="guideMessage"><button type="button" @click="openPractice">先练习一下</button></RecruitmentGuideHint>
            <RecruitmentGuideHint v-if="guideVisible && guideStep === 'practice-result'" target="practice-result" :message="guideMessage" />
            <section v-if="practiceResult" data-guide-target="practice-result" class="save-result" role="status"><strong>练习结果 · 仅示例</strong><p>已经熟悉怎么记录；需要时到自己的卡池里记一笔。</p><p>下方记录与保底都是临时示例，没有保存到账号。</p></section>
            <RecruitmentGuideHint v-if="guideVisible && guideStep === 'readback'" target="readback" :message="guideMessage" />
            <section v-if="unverifiedSave" data-guide-target="readback" class="save-result" aria-live="polite" role="status">
                <strong>{{ busy ? '正在保存这笔…' : '保存请求已接收，结果尚未确认' }}</strong>
                <p>请重新核对保存结果，无需再新建一条。若其它设备更新了档案，可关闭并重新打开本池查看最新记录。</p>
                <button type="button" :disabled="busy || recordsLoading" @click="$emit('retry')">重新核对本笔</button>
            </section>


            <RecruitmentGuideHint v-if="guideVisible && guideStep === 'save-progress'" target="save-progress" :message="guideMessage" />
            <div v-if="dailyMode === 'progress' && !activeRow" data-guide-target="save-progress" class="progress-actions">
              <button class="primary" type="button" :disabled="busy || readOnly || !recordsReady || !!unverifiedSave || !pendingCount" @click="submit">{{ busy ? '保存中…' : practice ? '查看练习结果' : '保存保底进度' }}</button>
            </div>
            <section v-if="guideVisible || practice" class="daily-entry" :aria-labelledby="editorId + '-result'">
              <h3 :id="editorId + '-result'">{{ readOnly ? '本池记录' : '这次抽到了哪位密探？' }}</h3>
              <RecruitmentGuideHint v-if="guideVisible && guideStep === 'result'" target="result" :message="guideMessage" />
              <div v-if="!readOnly" data-guide-target="result" class="daily-choices" role="group" aria-label="这次抽卡结果">
                <button type="button" :aria-pressed="dailyMode === 'record'" :disabled="busy || !recordsReady || !canRecord || !!activeRow || recordPendingCount > 0 || !!unverifiedSave" @click="chooseDailyMode('record')">记录密探</button>
                <button type="button" :aria-pressed="dailyMode === 'progress'" :disabled="busy || !recordsReady || !!activeRow || recordPendingCount > 0 || !!unverifiedSave" @click="chooseDailyMode('progress')">还没出绝密</button>
              </div>
              <p v-if="!dailyMode">选完再填写；以前的记录在下方，点击即可修改。</p>
              <p v-else-if="dailyMode === 'record' && !activeRow">选择这次真实出货的密探：本池 UP 可直接点头像，其他密探可搜索。出货间隔不知道可留空。</p>
              <p v-else-if="dailyMode === 'progress'">只更新游戏里当前的保底，不会新增密探记录。下方填「还差几抽保底」，不是「这次又抽了几次」。</p>
            </section>

            <section class="entry-section" :aria-labelledby="editorId + '-entry'">
              <div class="entry-heading">
                <h3 :id="editorId + '-entry'">{{ activeRow && originals.has(activeRow.event_id) ? '编辑这条出货' : '记录本次出货' }}</h3>
                <p>加入待保存草稿，核对后统一保存</p>
              </div>
              <div class="entry-workflow">
                <RecruitmentGuideHint v-if="guideVisible && guideStep === 'agents'" target="agents" :message="guideMessage" />
                <div v-show="dailyMode === 'record' || (!guideVisible && !practice)" data-guide-target="agents" class="entry-shortcuts" role="group" aria-label="快速登记出货">
                  <button
                    v-for="agent in quickUpAgents"
                    :key="agent.id"
                    type="button"
                    class="quick-up-button"
                    :data-agent-id="agent.id"
                    :aria-label="'快速登记 ' + agent.name + ' 的出货'"
                    :title="'快速登记 ' + agent.name"
                    :aria-pressed="activeRow?.agent_id === agent.id"
                    :class="{ 'is-selected': activeRow?.agent_id === agent.id }"
                    :disabled="dragging || busy || readOnly || recordsLoading || !!recordsError || !!unverifiedSave || !initialized || (!canRecord && (!activeRow || !originals.has(activeRow.event_id))) || (!activeRow && newCount >= 120)"
                    @click="add(agent.id, $event)"
                  >
                    <OperatorAvatar class="quick-up-avatar" :avatar="agentAvatar(agent)" :name="agent.name" :rarity="Number(agent.rarity) || 5" aria-hidden="true" />
                    <span class="quick-up-mark" aria-hidden="true">UP</span>
                    <span class="quick-up-name">{{ agent.name }}</span>
                    <Check v-if="activeRow?.agent_id === agent.id" class="quick-up-check" :size="14" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="add-record"
                    :aria-label="selectedOtherAgent ? '更换密探：' + selectedOtherAgent.name : quickUpAgents.length ? '其他密探' : '新增记录'"
                    :aria-expanded="choosingAgent"
                    :aria-controls="editorId + '-agent-picker'"
                    :aria-pressed="!!selectedOtherAgent"
                    :class="{ 'is-selected': choosingAgent || selectedOtherAgent }"
                    :disabled="dragging || busy || readOnly || recordsLoading || !!recordsError || !!unverifiedSave || !initialized || (!canRecord && (!activeRow || !originals.has(activeRow.event_id))) || (!activeRow && newCount >= 120)"
                    @click="add('', $event)"
                  >
                    <OperatorAvatar v-if="selectedOtherAgent" class="quick-up-avatar" :avatar="agentAvatar(selectedOtherAgent)" :name="selectedOtherAgent.name" :rarity="Number(selectedOtherAgent.rarity) || 5" aria-hidden="true" />
                    <span v-else class="other-agent-placeholder"><Plus :size="22" aria-hidden="true" /></span>
                    <span class="quick-up-name">{{ selectedOtherAgent?.name || (quickUpAgents.length ? '其他密探' : '新增记录') }}</span>
                    <Check v-if="selectedOtherAgent" class="quick-up-check" :size="14" aria-hidden="true" />
                  </button>
                </div>

              <div
                v-if="activeRow"
                ref="entryComposer"
                class="entry-composer"
                role="group"
                :aria-label="activeRow && originals.has(activeRow.event_id) ? '编辑抽卡记录' : '添加抽卡记录'"
              >

                <RecruitmentGuideHint v-if="guideVisible && ['agent-search', 'agent-results'].includes(guideStep)" :target="guideStep" :message="guideMessage" />
                <div v-if="choosingAgent" :id="editorId + '-agent-picker'" class="agent-picker" role="group" aria-label="选择其他密探">
                  <label data-guide-target="agent-search" class="agent-search">
                    <span class="sr-only">搜索密探名字</span>
                    <input
                      ref="agentSearchInput"
                      v-model="agentSearch"
                      type="search"
                      autocomplete="off"
                      placeholder="搜索密探名字"
                      :disabled="busy || readOnly || recordsLoading"
                    >
                  </label>
                  <div class="agent-filter-head">
                    <span><b>{{ filteredPickerAgents.length }}</b> / {{ options.length }} 位</span>
                    <div class="agent-filter-actions">
                      <button v-if="hasAgentFilters" type="button" class="agent-filter-reset" @click="resetAgentFilters">重置</button>
                      <button type="button" class="agent-picker-cancel" :disabled="busy" @click="cancelAgentPicker">取消</button>
                    </div>
                  </div>
                  <div class="agent-filter-row">
                    <span class="agent-filter-label">属性</span>
                    <div class="agent-filter-options is-prof" role="group" aria-label="按属性筛选密探">
                      <button type="button" :class="{ on: agentProfFilter === 'all' }" :aria-pressed="agentProfFilter === 'all'" @click="agentProfFilter = 'all'">全部</button>
                      <button
                        v-for="prof in agentProfOptions"
                        :key="prof"
                        type="button"
                        :class="{ on: agentProfFilter === prof }"
                        :aria-pressed="agentProfFilter === prof"
                        @click="agentProfFilter = prof"
                      >
                        <img v-if="profIcon(prof)" :src="profIcon(prof)" alt="" aria-hidden="true" />{{ prof }}
                      </button>
                    </div>
                  </div>
                  <div class="agent-filter-row">
                    <span class="agent-filter-label">职业</span>
                    <div class="agent-filter-options is-subprof" role="group" aria-label="按职业筛选密探">
                      <button type="button" :class="{ on: agentSubProfFilter === 'all' }" :aria-pressed="agentSubProfFilter === 'all'" @click="agentSubProfFilter = 'all'">全部</button>
                      <button
                        v-for="subProf in agentSubProfOptions"
                        :key="subProf"
                        type="button"
                        :class="{ on: agentSubProfFilter === subProf }"
                        :aria-pressed="agentSubProfFilter === subProf"
                        @click="agentSubProfFilter = subProf"
                      >{{ subProf }}</button>
                    </div>
                  </div>
                  <div data-guide-target="agent-results" class="agent-picker-results" role="group" aria-label="选择密探">
                    <button
                      v-for="agent in filteredPickerAgents"
                      :key="agent.id"
                      type="button"
                      class="agent-choice"
                      :data-agent-id="agent.id"
                      :aria-label="'选择 ' + agent.name"
                      :disabled="busy || readOnly || recordsLoading"
                      @click="chooseOtherAgent(agent.id)"
                    >
                      <OperatorAvatar class="agent-choice-avatar" :avatar="agentAvatar(agent)" :name="agent.name" :rarity="Number(agent.rarity) || 5" aria-hidden="true" />
                      <span>{{ agent.name }}</span>
                    </button>
                    <p v-if="!filteredPickerAgents.length" class="agent-picker-empty">没有符合筛选条件的密探</p>
                  </div>
                </div>
                <div class="compact-entry-row">
                  <RecruitmentGuideHint v-if="guideVisible && guideStep === 'pulls'" target="pulls" :message="guideMessage" />
                  <RecruitmentGuideHint v-if="guideVisible && guideStep === 'save-record'" target="save-record" :message="guideMessage" />
                  <div class="composer-actions">
                    <div class="pull-controls">
                      <div data-guide-target="pulls" class="pull-count-field">
                        <label :for="editorId + '-pull-span'">本次出货抽数</label>
                        <span class="pull-stepper">
                          <button type="button" aria-label="减少本次出货抽数" :disabled="busy || readOnly || recordsLoading || choosingAgent || !activeRow.agent_id || isFourStar(activeRow) || (activeRow.pull_span !== '' && Number(activeRow.pull_span) <= 1)" @click="stepPullSpan(-1)"><Minus :size="16" aria-hidden="true" /></button>
                          <input v-if="isFourStar(activeRow)" :id="editorId + '-pull-span'" type="text" value="计次" aria-label="4星只计次，不影响保底" disabled>
                          <input v-else :id="editorId + '-pull-span'" ref="pullSpanInput" v-model="activeRow.pull_span" type="number" inputmode="numeric" min="1" :max="MAX_EVENT_PULLS" step="1" placeholder="未知" :aria-invalid="!!entryError || undefined" :aria-describedby="entryError ? editorId + '-entry-error' : undefined" :disabled="busy || readOnly || recordsLoading || choosingAgent || !activeRow.agent_id" @input="onPullInput" @blur="reviewPulls">
                          <button type="button" aria-label="增加本次出货抽数" :disabled="busy || readOnly || recordsLoading || choosingAgent || !activeRow.agent_id || isFourStar(activeRow) || Number(activeRow.pull_span) >= MAX_EVENT_PULLS" @click="stepPullSpan(1)"><Plus :size="16" aria-hidden="true" /></button>
                        </span>
                      </div>
                      <button type="button" class="unknown-pulls" :aria-pressed="!isFourStar(activeRow) && activeRow.pull_span === ''" :disabled="busy || readOnly || recordsLoading || choosingAgent || !activeRow.agent_id || isFourStar(activeRow)" @click="markPullsUnknown">未知</button>
                    </div>
                    <button data-guide-target="save-record" type="button" class="primary" :aria-label="originals.has(activeRow.event_id) ? '完成编辑当前记录' : practice ? '查看练习结果' : '加入当前记录'" :disabled="busy || readOnly || recordsLoading || choosingAgent || !activeRow.agent_id || ((!!recordsError || !!unverifiedSave) && !originals.has(activeRow.event_id))" @click="practice && !originals.has(activeRow.event_id) ? submit() : confirmRecord()">{{ busy ? '处理中…' : originals.has(activeRow.event_id) ? '完成' : practice ? '查看练习结果' : '加入' }}</button>
                    <button type="button" class="entry-cancel" title="取消当前录入" :disabled="busy" @click="cancelEntry"><X :size="16" aria-hidden="true" /><span class="sr-only">取消</span></button>
                  </div>
                </div>
                <button v-if="isStoredRow(activeRow)" type="button" class="entry-delete" title="删除记录" :disabled="busy || readOnly || recordsLoading" @click="remove(activeRow)"><Trash2 :size="16" aria-hidden="true" /><span class="sr-only">删除记录</span></button>
              </div>

              <div v-if="!activeRow" class="entry-placeholder" aria-label="请先选择出货密探">
                <div class="composer-actions">
                <div class="pull-controls">
                  <div class="pull-count-field">
                    <label :for="editorId + '-pull-span'">本次出货抽数</label>
                    <span class="pull-stepper">
                      <button type="button" aria-label="减少本次出货抽数" disabled><Minus :size="16" aria-hidden="true" /></button>
                      <input :id="editorId + '-pull-span'" type="number" placeholder="未知" disabled>
                      <button type="button" aria-label="增加本次出货抽数" disabled><Plus :size="16" aria-hidden="true" /></button>
                    </span>
                  </div>
                  <button type="button" class="unknown-pulls" disabled>未知</button>
                </div>
                  <button type="button" class="primary" disabled>加入</button>
                  <button type="button" class="entry-cancel" aria-label="取消当前录入" title="取消当前录入" disabled><X :size="16" aria-hidden="true" /></button>
                </div>
              </div>
              </div>
              <p v-if="entryError" :id="editorId + '-entry-error'" class="form-error" role="alert">{{ entryError }}</p>
              <p v-if="activeRow?.batch_id" class="composer-note">批次记录：修改本条不会改变批次总抽数。</p>
              <p v-if="tailProgress == null" class="unknown-progress-note">当前保底未知：可先加入草稿；保存绝密记录前需核对游戏保底。仅 4 星计次或调整顺序可保留未知。</p>
            </section>

            <section class="records-section" :aria-labelledby="editorId + '-records'">
              <RecruitmentGuideHint v-if="guideVisible && guideStep === 'views'" target="views" :message="guideMessage" />
              <div data-guide-target="views" class="records-toolbar">
                <div class="records-heading">
                  <h3 :id="editorId + '-records'">抽卡档案 <span>{{ rows.length }} 条{{ hasMore ? ' · 尚未读完' : '' }}</span></h3>
                </div>
                <label v-if="rows.length" class="record-search"><span class="sr-only">查找已有记录</span><Search :size="16" aria-hidden="true" /><input v-model="recordSearch" :disabled="dragging" type="search" placeholder="查找密探" autocomplete="off"></label>
                <div class="record-view-switch" role="group" aria-label="本池抽卡记录视图">
                  <button type="button" :class="{ 'is-selected': recordView === 'progress' }" :aria-pressed="recordView === 'progress'" @click="switchRecordView('progress')">进度条视图</button>
                  <button type="button" :class="{ 'is-selected': recordView === 'agents' }" :aria-pressed="recordView === 'agents'" @click="switchRecordView('agents')">密探视图</button>
                </div>
              </div>
              <p v-if="rows.length" :id="editorId + '-sort-help'" class="sort-help" role="status">{{ sortBlocked || '拖动排序 · 点击编辑 · 触屏长按拖动 · 聚焦头像后用上下键移动' }}
                <button v-if="hasMore" type="button" :disabled="busy || readOnly || recordsLoading" @click="$emit('load-all')">{{ recordsLoading ? '正在读取…' : recordsError ? '重试读取全部记录' : '读取全部后排序' }}</button>
                <button v-if="orderChanged" type="button" :disabled="busy || !!unverifiedSave || dragging" @click="resetOrder">恢复保存前顺序</button>
              </p>
              <p class="sort-announcement" aria-live="polite" aria-atomic="true">{{ sortAnnouncement }}</p>

              <ol key="progress-records" ref="recordList" v-if="displayRows.length && recordView === 'progress'" class="record-feed">
                <li v-for="row in displayRows" :key="row.event_id" :data-event-id="row.event_id" :data-guide-target="isGuideRow(row) ? 'guide-record' : undefined" class="gacha-record" :class="{ 'is-saved': isSavedRow(row), 'is-sortable': !sortBlocked }" @contextmenu="!sortBlocked && $event.preventDefault()">
                  <RecruitmentGuideHint v-if="guideVisible && guideStep === 'guide-record' && isGuideRow(row)" target="guide-record" :message="guideMessage" />
                  <button type="button" class="record-handle" :disabled="busy || readOnly || recordsLoading || !!activeRow" :data-sort-disabled="!!sortBlocked" :aria-label="handleLabel(row)" :aria-describedby="editorId + '-sort-help'" @keydown="moveByKey($event, row)" @click="edit(row, $event)" @contextmenu.prevent>
                    <GripVertical class="drag-grip" :size="14" aria-hidden="true" />
                    <OperatorAvatar
                      class="record-avatar"
                      :avatar="agentAvatar(selectedAgent(row))"
                      :name="selectedAgent(row)?.name || row.agent_id"
                      :rarity="Number(selectedAgent(row)?.rarity) || 5"
                      aria-hidden="true"
                    />
                  </button>
                  <button
                    type="button"
                    class="record-detail"
                    :disabled="busy || readOnly || recordsLoading || !!activeRow"
                    :aria-label="recordLabel(row)"
                    @click="edit(row, $event)"
                  >
                    <span class="record-track">
                      <span class="record-bar" :class="barClass(row)" :style="{ width: spanWidth(row) }">
                        <span class="pull-result"><b>{{ isFourStar(row) ? '计次' : row.pull_span === '' ? '未知' : row.pull_span }}</b><small>{{ isFourStar(row) ? '4星' : row.pull_span === '' ? '抽数' : '抽' }}</small></span>
                      </span>
                      <span v-if="row.up_status === 'non_up'" class="non-up-stamp" aria-hidden="true">歪</span>
                      <span v-if="row.batch_id" class="status-pill is-neutral">批次</span>
                      <span v-if="isChanged(row)" class="pending-mark">待保存</span>
                      <span v-else-if="isSavedRow(row)" class="saved-mark">本笔已保存</span>
                    </span>
                  </button>
                </li>
              </ol>

              <ol key="agent-records" ref="recordList" v-else-if="displayRows.length" class="agent-record-grid" aria-label="密探视图">
                <li v-for="row in displayRows" :key="row.event_id" :data-event-id="row.event_id" :data-guide-target="isGuideRow(row) ? 'guide-record' : undefined" class="agent-record-card" :class="{ 'is-saved': isSavedRow(row) }">
                  <RecruitmentGuideHint v-if="guideVisible && guideStep === 'guide-record' && isGuideRow(row)" target="guide-record" :message="guideMessage" />
                  <button type="button" class="agent-record-portrait record-handle" :disabled="busy || readOnly || recordsLoading || !!activeRow" :data-sort-disabled="!!sortBlocked" :aria-label="handleLabel(row)" :aria-describedby="editorId + '-sort-help'" @keydown="moveByKey($event, row)" @click="edit(row, $event)" @contextmenu.prevent>
                    <OperatorAvatar
                      class="agent-record-avatar"
                      :avatar="agentAvatar(selectedAgent(row))"
                      :name="selectedAgent(row)?.name || row.agent_id"
                      :rarity="Number(selectedAgent(row)?.rarity) || 5"
                      aria-hidden="true"
                    />
                    <span v-if="!isFourStar(row)" class="agent-order-badge" :title="goldOrder.get(row.event_id) ? '本池已记录第' + goldOrder.get(row.event_id) + '个金' : '读取完整记录后显示序号'" aria-hidden="true">{{ goldOrder.get(row.event_id) ?? '…' }}</span>
                    <span v-if="row.up_status === 'non_up'" class="agent-non-up non-up-stamp" aria-hidden="true">歪</span>
                  </button>
                  <button
                    type="button"
                    class="agent-record-detail"
                    :disabled="busy || readOnly || recordsLoading || !!activeRow"
                    :aria-label="recordLabel(row)"
                    @click="edit(row, $event)"
                  >
                    <span class="agent-pull-badge" :class="barClass(row)" aria-hidden="true">{{ isFourStar(row) ? '4星计次' : row.pull_span === '' ? '未知' : row.pull_span + '抽' }}</span>
                    <span class="agent-record-flags" aria-hidden="true">
                      <span v-if="row.batch_id" class="agent-record-flag">批次</span>
                      <span v-if="isChanged(row)" class="agent-record-flag is-pending">待保存</span>
                      <span v-else-if="isSavedRow(row)" class="agent-record-flag">本笔已保存</span>
                    </span>
                  </button>
                </li>
              </ol>

              <div v-else-if="initialized && !recordsLoading && !recordsError" data-guide-target="empty-records" class="records-empty">
                <RecruitmentGuideHint v-if="guideVisible && guideStep === 'empty-records'" target="empty-records" :message="guideMessage" />
                <strong>{{ recordSearch ? '没有找到这位密探的记录' : '还没有抽卡记录' }}</strong>
                <p>{{ recordSearch ? '换个名字，或继续加载记录；不需要重复登记。' : '点击上方 UP 密探头像或「其他密探」登记出货；仅更新保底可以直接修改上方进度并保存。' }}</p>
              </div>

              <div v-if="hasMore || (rows.length && recordView === 'agents')" class="records-tail">
                <p v-if="rows.length && recordView === 'agents'" class="bar-legend">头像下方显示这条出货记录的抽数；同一密探多次出货会分别排列，未知抽数显示“未知”。</p>
                <button v-if="hasMore" type="button" class="load-more" :disabled="busy || recordsLoading" @click="$emit('load-more')">继续加载记录</button>
              </div>
            </section>

            <p v-if="orderChanged" class="change-note" role="status">历史顺序待保存；两种视图使用同一顺序，抽数与保底不随移动变化。</p>
            <p v-if="deletedIds.length" class="change-note">保存后将移除 {{ deletedIds.length }} 条已有出货；独立记录会减去该条已知抽数，相邻记录与批次总量不变。</p>

          </div>

          <RecruitmentGuideHint v-if="guideVisible && guideStep === 'save-changes'" target="save-changes" :message="guideMessage" />
          <footer data-guide-target="save-changes" v-show="(!guideVisible && !practice) || ((!dailyMode || pendingCount || readOnly) && (dailyMode !== 'progress' || recordPendingCount > 0) && (!guideVisible || !['views', 'guide-record', 'empty-records'].includes(guideStep) || pendingCount || activeRow))" :class="{ 'is-entry-active': !!activeRow }">
            <p class="footer-state" aria-live="polite">
              <strong v-if="pendingCount">{{ pendingCount }} 项未保存</strong>
              <span v-if="activeRow">{{ originals.has(activeRow.event_id) ? '完成单条编辑后统一保存' : '本条加入后可统一保存' }}</span>
              <span v-else-if="pendingCount">仅在当前窗口，保存后写入档案</span>
              <span v-else>{{ unverifiedSave ? '保存结果尚未确认，请重新核对' : receiptVerified ? '已保存并核对' : '修改将在保存后生效' }}</span>
            </p>
            <div class="footer-actions">
              <button type="button" :disabled="busy" @click="close">取消</button>
              <button class="primary" type="submit" :disabled="dragging || busy || readOnly || recordsLoading || !!recordsError || !!unverifiedSave || !initialized || !!activeRow || !pendingCount">
                {{ busy ? '保存中…' : '保存修改' }}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { TUTORIALS_ENABLED } from "../../config/features.js";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { Check, GripVertical, Minus, Plus, Search, Trash2, X } from '@lucide/vue'
import RecruitmentGuideChoice from './RecruitmentGuideChoice.vue'
import RecruitmentGuideHint from './RecruitmentGuideHint.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import { useRecordDrag } from './useRecordDrag.js'
import { createRecruitmentId } from './createRecruitmentId.js'
import operatorPortraits from '../../data/operatorPortraits.json'
import { recruitmentPoolDateLabel } from '../../data/recruitmentPoolTypes.js'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { matchesOperatorSearch, matchesProfSubFilter, subProfOptions as deriveSubProfOptions, tokens } from '../../utils/operatorFilters.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { usePersistedTab } from '../../utils/persistedTab.js'
import { dialog } from '../../utils/dialog.js'
import { entryInput, MAX_EVENT_PULLS, poolAgentOptions, progressFromRemaining, recruitmentPoolCatalog, resolveRecruitmentAgent } from './rules.js'

const props = defineProps({ open: Boolean, pool: Object, poolSummary: Object, records: { type: Array, default: () => [] }, recordsLoading: Boolean, recordsError: String, recordsRevision: Number, hasMore: Boolean, agents: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, busy: Boolean, readOnly: Boolean, canRecord: Boolean, serverError: String, requestVersion: Number, guided: Boolean, practice: Boolean, practiceResult: Boolean, saveReceipt: Object })
const editorId = 'recruitment-editor-' + useId()
const emit = defineEmits(['close', 'save', 'load-more', 'load-all', 'retry', 'guide-dismiss', 'guide-start', 'practice'])
const panel = ref(null), editorBody = ref(null), entryComposer = ref(null), errorSummary = ref(null), error = ref(''), rows = ref([]), remaining = ref(''), initialRemaining = ref(''), activeRow = ref(null), choosingAgent = ref(false), agentSearch = ref(''), agentSearchInput = ref(null), agentProfFilter = ref('all'), agentSubProfFilter = ref('all'), pullSpanInput = ref(null), remainingInput = ref(null), initialized = ref(false), deletedIds = ref([]), recordView = ref('progress')
const originals = reactive(new Map())
const orderIds = ref(null), orderRevision = ref(null)
const entryError = ref(''), progressError = ref('')
const preservedProgress = ref(null)
const naturalRows = computed(() => {
  const byId = new Map(rows.value.map(row => [row.event_id, row]))
  const visibleIds = new Set(props.records.map(event => event.event_id))
  return props.records.map(event => byId.get(event.event_id)).filter(Boolean).concat(rows.value.filter(row => !visibleIds.has(row.event_id)))
})
const orderedRows = computed(() => {
  if (!orderIds.value) return naturalRows.value
  const byId = new Map(rows.value.map(row => [row.event_id, row]))
  const ids = new Set(orderIds.value)
  return orderIds.value.map(id => byId.get(id)).filter(Boolean).concat(naturalRows.value.filter(row => !ids.has(row.event_id)))
})
const missingRecordIds = computed(() => {
  if (!recordsReady.value || props.hasMore || unverifiedSave.value) return []
  const live = new Set(props.records.map(event => event.event_id))
  return [...new Set(rows.value.filter(row => originals.has(row.event_id)).map(row => row.event_id).concat(deletedIds.value))].filter(id => !live.has(id))
})
async function discardMissingRecords() {
  const ids = missingRecordIds.value.slice(), session = editorSession, revision = props.recordsRevision
  if (!ids.length || props.busy) return
  const discard = await dialog.confirm({ title: '移除已失效记录的本地草稿？', message: `这 ${ids.length} 笔旧记录已被其他设备删除。只丢弃这些记录尚未保存的修改，其余草稿保留；随后请重新调整顺序。`, type: 'danger', confirmText: '移除失效草稿', cancelText: '继续核对' })
  if (!discard || !props.open || props.busy || session !== editorSession || revision !== props.recordsRevision) return
  const missing = new Set(ids)
  rows.value = rows.value.filter(row => !missing.has(row.event_id))
  deletedIds.value = deletedIds.value.filter(id => !missing.has(id))
  ids.forEach(id => originals.delete(id))
  if (orderIds.value) orderIds.value = orderIds.value.filter(id => !missing.has(id))
  orderRevision.value = null
  if (missing.has(activeRow.value?.event_id)) { activeRow.value = null }
  error.value = ''
}
const orderChanged = computed(() => !!orderIds.value && JSON.stringify(orderIds.value) !== JSON.stringify(naturalRows.value.map(row => row.event_id)))

const dailyMode = ref('record'), recordSearch = ref('')
const progressLabel = props.practice ? ref('已抽') : usePersistedTab('yh_recruitment_progress_input_mode', '已抽', ['已抽', '已垫'])
const progressInput = computed({
  get: () => remaining.value === '' ? '' : progressLabel.value === '已垫' ? 40 - Number(remaining.value) : remaining.value,
  set: value => { remaining.value = value === '' ? '' : String(progressLabel.value === '已垫' ? 40 - Number(value) : value) },
})
const guideVisible = ref(false), guidePicker = ref(false), pullsReviewed = ref(false), progressReviewed = ref(false), viewedRecords = ref(false)
const recordsReady = computed(() => initialized.value && !props.recordsLoading && !props.recordsError)
const pointerGuide = ref('')
let pointerReleaseTimer = 0
const guideStep = computed(() => pointerGuide.value || observedGuideStep.value)
// 输入失焦与点击属于同一手势，提示不能在鼠标松开前挪动保存按钮。
function holdGuideHint() { if (guideVisible.value) { window.clearTimeout(pointerReleaseTimer); pointerGuide.value = observedGuideStep.value } }
function releaseGuideHint() { if (pointerGuide.value) pointerReleaseTimer = window.setTimeout(() => { pointerGuide.value = '' }, 0) }
const observedGuideStep = computed(() => {
  if (props.practiceResult) return 'practice-result'
  if (!recordsReady.value || props.busy || props.serverError || error.value) return 'read-state'
  if (unverifiedSave.value) return 'readback'
  if (!activeRow.value && !pendingCount.value && receiptVerified.value) return props.saveReceipt.entries.length ? (displayRows.value.some(row => row.event_id === props.saveReceipt.entries[0].event_id) ? 'guide-record' : 'empty-records') : 'saved-progress'
  if (activeRow.value?.agent_id) return !pullsReviewed.value ? 'pulls' : !progressReviewed.value ? 'progress' : 'save-record'
  if (choosingAgent.value) return agentSearch.value.trim() && filteredPickerAgents.value.length ? 'agent-results' : 'agent-search'
  if (recordPendingCount.value) return !progressReviewed.value ? 'progress' : 'save-changes'
  if (viewedRecords.value || props.readOnly) return viewedRecords.value ? (displayRows.value.length ? 'guide-record' : 'empty-records') : 'views'
  if (!props.canRecord && dailyMode.value !== 'progress') return 'read-only'
  if (dailyMode.value === 'record') return 'agents'
  if (dailyMode.value === 'progress') return progressReviewed.value && pendingCount.value ? 'save-progress' : 'progress'
  return 'result'
})
const guideMessage = computed(() => {
  switch (guideStep.value) {
    case 'result': return '这次出了绝密吗？按你的实际结果点这里；没有新抽卡也可以直接查看下方已有记录。'
    case 'agents': return '点你实际抽到的 UP 头像；其他绝密点「其他密探」搜索。'
    case 'agent-search': return filteredPickerAgents.value.length ? '在这里输入这次出货的密探名字。' : '没有符合条件的密探，换个关键词或点「重置」筛选；不要选别人代替。'
    case 'agent-results': return '点搜索结果中实际抽到的那位密探。'
    case 'pulls': return props.practice ? '练习：示例这次是上次绝密之后第20抽出货，请自己填20；也可以选择记不清。' : '填两次绝密之间的抽数，例如上次出货后20抽又出就填20。首条只填能确认的间隔，记不清就保留未知。'
    case 'progress': return tailProgress.value == null && !props.practice ? '当前进度未知，暂不支持保底留空提交；先核对游戏的真实保底进度，不要猜值。退出教程会保留窗口草稿。' : props.practice ? `练习：示例游戏已垫7抽，还差33抽保底；当前选择「${progressLabel.value === '已抽' ? '距保底' : '已垫'}」，请填${progressLabel.value === '已垫' ? 7 : 33}。` : `按游戏当前进度核对：${progressLabel.value === '已垫' ? '填已经抽了几次，例如7' : '填还差几抽保底，例如33'}；不是本次出货间隔。`
    case 'save-record': return activeRow.value && originals.has(activeRow.value.event_id) ? '点「完成」只更新这条草稿，之后仍要保存修改。' : props.practice ? '点「查看练习结果」，只展示临时示例。' : '点「加入」把这次出货加入待保存记录，再点底部「保存修改」才会写入档案。'
    case 'save-progress': return props.practice ? '点「查看练习结果」，不会写入账号。' : '点「保存保底进度」，不会新增密探记录。'
    case 'save-changes': return '核对后点底部保存修改；完成单条编辑还没有保存到服务器。'
    case 'saved-progress': return '新的保底进度在这里。以后抽了没出绝密，就回来这个池更新。'
    case 'guide-record': return receiptVerified.value ? '刚才这笔记在这里。头像旁是本次出货抽数，未知仍是未知；下次抽完再来这个池继续记。' : '这是你已有的记录：头像旁数字是这次出货的间隔，未知不等于0。切换视图不会改动或保存资料。'
    case 'views': return '可以亲自切换这两种视图看已有记录，不需要为了学习再记一笔。'
    case 'empty-records': return recordSearch.value ? '当前名字筛选隐藏了记录，清空「查找已有记录」即可查看；不需要重复登记。' : '本池没有可展示的记录；换池查看，或从使用教程进入隔离练习。'
    case 'read-only': return '此池暂不能新增出货。已有记录可切换视图查看，保底是否可改以真实状态为准；也可以先练习。'
    case 'readback': return '结果尚未读回确认，请点重新核对本笔；不用再新建一条。'
    case 'practice-result': return '已经熟悉怎么记录；需要时到自己的卡池里记一笔。这里仅是练习结果。'
    default: return props.busy ? '正在处理真实请求；退出教程不会取消保存。' : props.recordsError ? '本池记录读取失败，请重新读取；失败不代表没有记录。' : props.serverError || error.value ? '尚未保存成功，草稿保留。请处理这里的错误，不要重复登记。' : unverifiedSave.value ? '结果尚未读回确认，请重新核对本笔；不需要再新建一条。' : '正在读取本池记录，读完后继续。'
  }
})
function dismissGuide() {
  const focused = document.activeElement
  const taskFocus = panel.value?.contains(focused) && !focused.matches('.guide-exit, .guide-choice button') ? focused : agentSearchInput.value || pullSpanInput.value || remainingInput.value || panel.value?.querySelector('.daily-choices button:not(:disabled), .record-view-switch button')
  pointerGuide.value = ''; window.clearTimeout(pointerReleaseTimer)
  guideVisible.value = false; guidePicker.value = false; emit('guide-dismiss')
  nextTick(() => { if (props.open && taskFocus?.isConnected) taskFocus.focus({ preventScroll: true }) })
}
function openGuide() { if (!TUTORIALS_ENABLED) return; guidePicker.value = !guidePicker.value }
function startGuide() {
  if (!TUTORIALS_ENABLED) return
  guidePicker.value = false
  guideVisible.value = true
  // The ordinary editor opens directly in record mode; an explicitly started
  // walkthrough still begins by asking about this real draw unless a draft exists.
  if (!props.practice && !activeRow.value && !pendingCount.value) dailyMode.value = ''
  emit('guide-start')
}
function openPractice() { if (TUTORIALS_ENABLED && !props.busy) { dismissGuide(); emit('practice') } }
function chooseDailyMode(mode) { dailyMode.value = mode; viewedRecords.value = false; progressReviewed.value = false }
function switchRecordView(view) { recordView.value = view; if (guideVisible.value && !activeRow.value && !pendingCount.value) viewedRecords.value = true }
function reviewPulls() {
  if (!activeRow.value || activeRow.value.pull_span === '') return
  try { entryInput(activeRow.value); pullsReviewed.value = true } catch { pullsReviewed.value = false }
}
function onPullInput(event) { entryError.value = ''; pullsReviewed.value = false; limitPullSpan(event) }
function stepPullSpan(delta) {
  if (!activeRow.value || props.busy || props.readOnly || props.recordsLoading) return
  activeRow.value.pull_span = String(Math.min(MAX_EVENT_PULLS, Math.max(1, (Number(activeRow.value.pull_span) || 0) + delta)))
  entryError.value = ''; pullsReviewed.value = false
}
function markPullsUnknown() { if (activeRow.value && !props.busy && !props.readOnly) { activeRow.value.pull_span = ''; entryError.value = ''; pullsReviewed.value = true } }
function reviewProgress() {
  // When an already-focused progress field loses focus before the player has
  // finished selecting an agent, that incidental blur is not tutorial review.
  if (guideVisible.value && dailyMode.value === 'record' && !pullsReviewed.value) return
  try { progressFromRemaining(remaining.value); progressReviewed.value = true } catch { progressReviewed.value = false }
}
function isGuideRow(row) { return receiptVerified.value ? row.event_id === props.saveReceipt.entries[0]?.event_id : row.event_id === displayRows.value[0]?.event_id }
if (TUTORIALS_ENABLED) watch(() => props.guided, active => { guideVisible.value = active }, { immediate: true })
function entryMatches(event, entry) {
  return event && !event.deleted_at && event.pool_id === props.pool?.pool_id && event.event_id === entry.event_id && event.agent_snapshot.agent_id === entry.agent_id && event.pull_span === entry.pull_span && event.up_status === entry.up_status && (event.acquired_date || null) === entry.acquired_date && (event.note || null) === entry.note
}
const receiptVerified = computed(() => {
  const receipt = props.saveReceipt
  return !!receipt && recordsReady.value && !props.busy && !props.serverError && Number.isInteger(receipt.revision) && props.recordsRevision >= receipt.revision && receipt.pool_id === props.pool?.pool_id && props.pool.progress === (receipt.remaining_pulls == null ? preservedProgress.value : 40 - receipt.remaining_pulls) && receipt.entries.every(entry => props.records.some(event => entryMatches(event, entry))) && (!receipt.deleted_event_ids.length || !props.hasMore) && receipt.deleted_event_ids.every(id => !props.records.some(event => event.event_id === id && !event.deleted_at)) && (!receipt.ordered_event_ids || !props.hasMore && JSON.stringify(props.records.filter(event => !event.deleted_at).map(event => event.event_id)) === JSON.stringify(receipt.ordered_event_ids))
})
const unverifiedSave = computed(() => props.saveReceipt && !receiptVerified.value)
const isSavedRow = row => receiptVerified.value && !isChanged(row) && props.saveReceipt.entries.some(entry => entry.event_id === row.event_id)
let rebasedReceipt = null
watch(receiptVerified, verified => {
  if (!verified || props.saveReceipt === rebasedReceipt) return
  rebasedReceipt = props.saveReceipt
  for (const entry of props.saveReceipt.entries) {
    const event = props.records.find(event => entryMatches(event, entry))
    const row = { ...entry, pull_span: entry.pull_span ?? '', batch_id: event.batch_id }
    originals.set(entry.event_id, JSON.stringify(entryInput(row)))
    const index = rows.value.findIndex(item => item.event_id === entry.event_id)
    // 新记录的 UP 状态由提交推导；后续用户修改的其它字段仍须保留。
    if (index >= 0 && JSON.stringify({ ...entryInput(rows.value[index]), up_status: entry.up_status }) === JSON.stringify(entry)) rows.value.splice(index, 1, row)
  }
  for (const id of props.saveReceipt.deleted_event_ids) originals.delete(id)
  deletedIds.value = deletedIds.value.filter(id => !props.saveReceipt.deleted_event_ids.includes(id))
  if (props.saveReceipt.ordered_event_ids) {
    const byId = new Map(rows.value.map(row => [row.event_id, row]))
    rows.value = props.saveReceipt.ordered_event_ids.map(id => byId.get(id)).filter(Boolean)
    orderIds.value = null; orderRevision.value = null
  }
  initialRemaining.value = props.saveReceipt.remaining_pulls == null ? '' : typeof remaining.value === 'number' ? props.saveReceipt.remaining_pulls : String(props.saveReceipt.remaining_pulls)
})
let requestId = ''
let viewportFrame = 0
let viewportSettleTimer = 0
const KEYBOARD_INSET_THRESHOLD = 80
const ENTRY_VISIBLE_TOP_GAP = 16
const ENTRY_VISIBLE_BOTTOM_GAP = 24
const poolName = computed(() => recruitmentPoolCatalog(props.pool, props.catalog)?.name || props.pool?.mapped_snapshot?.name || props.pool?.snapshot.name)
const poolDefinition = computed(() => recruitmentPoolCatalog(props.pool, props.catalog) || props.pool?.mapped_snapshot || props.pool?.snapshot)
const options = computed(() => {
  const values = poolAgentOptions(props.pool, props.catalog, props.agents)
  for (const event of props.records) if (!values.some(agent => agent.id === event.agent_snapshot.agent_id)) values.push(resolveRecruitmentAgent(event, props.pool, props.catalog, props.agents))
  return values
})
const selectedAgent = row => options.value.find(agent => agent.id === row.agent_id)
const isFourStar = row => {
  const original = props.records.find(event => event.event_id === row.event_id && event.agent_snapshot.agent_id === row.agent_id)
  return Number(original?.agent_snapshot.rarity ?? selectedAgent(row)?.rarity) === 4
}
const rowInput = row => entryInput({ ...row, pull_span: isFourStar(row) ? null : row.pull_span })
const quickUpAgents = computed(() => options.value.filter(agent => agent.poolSlot))
const selectedOtherAgent = computed(() => activeRow.value?.agent_id && !quickUpAgents.value.some(agent => agent.id === activeRow.value.agent_id) ? selectedAgent(activeRow.value) : null)
const goldOrder = computed(() => {
  const ranks = new Map()
  if (!recordsReady.value) return ranks
  const loadedIds = new Set(props.records.map(event => event.event_id))
  let rank = 0
  for (const row of orderedRows.value) {
    // 分页从最早记录开始读取；尚未读完时，最新草稿的完整序号仍未知。
    if ((props.hasMore && !loadedIds.has(row.event_id)) || isFourStar(row)) continue
    ranks.set(row.event_id, ++rank)
  }
  return ranks
})
function localPortraitUrl(operatorId) {
  const path = operatorPortraits[operatorId]
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (typeof window !== 'undefined' && window.location?.origin) return new URL(path, window.location.origin).href
  return path
}
function agentAvatar(agent) {
  if (!agent) return ''
  const operatorId = agent.operator_id || agent.id
  return agent.avatar || agent.avatar_url || localPortraitUrl(operatorId)
}
const agentProfOptions = computed(() => {
  const present = new Set(options.value.flatMap(agent => tokens(agent.prof)))
  return AGENT_PROFS.filter(prof => present.has(prof)).concat([...present].filter(prof => !AGENT_PROFS.includes(prof)))
})
const agentSubProfOptions = computed(() => deriveSubProfOptions(options.value))
const filteredPickerAgents = computed(() => {
  return options.value
    .filter(agent => matchesProfSubFilter(agent, agentProfFilter.value, agentSubProfFilter.value))
    .filter(agent => matchesOperatorSearch(agent, agentSearch.value))
    .slice()
    .reverse()
})
const hasAgentFilters = computed(() => !!agentSearch.value.trim() || agentProfFilter.value !== 'all' || agentSubProfFilter.value !== 'all')
const PROF_ICON_FILES = Object.freeze({ 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' })
function profIcon(prof) {
  const file = PROF_ICON_FILES[String(prof || '').split('、')[0]]
  return file ? (import.meta.env.BASE_URL || '/') + 'assets/prof-icons/' + file : ''
}
function resetAgentFilters() { agentSearch.value = ''; agentProfFilter.value = 'all'; agentSubProfFilter.value = 'all' }
const newCount = computed(() => rows.value.filter(row => !originals.has(row.event_id)).length)
let closePending = false, editorSession = 0
async function close() {
  if (!props.open || props.busy || closePending) return
  if (!hasDraft()) { emit('close'); return }
  const session = editorSession, pool = props.pool
  closePending = true
  try {
    const discard = await dialog.confirm({ title: '放弃未保存修改？', message: '还有修改未保存，关闭后将丢弃。', type: 'danger', confirmText: '放弃并关闭', cancelText: '继续编辑' })
    if (discard && props.open && !props.busy && editorSession === session && props.pool === pool) emit('close')
  } finally { closePending = false }
}
defineExpose({ startGuide, openGuide, hasDraft })
const displayRows = computed(() => orderedRows.value.slice().reverse().filter(row => matchesOperatorSearch(selectedAgent(row) || { name: row.agent_id }, recordSearch.value)))
const recordList = ref(null), sortAnnouncement = ref('')
const sortBlocked = computed(() => {
  if (props.readOnly) return '当前仅可查看记录，不能调整顺序。'
  if (props.busy) return '正在处理请求，请稍后调整顺序。'
  if (activeRow.value) return '先加入或完成当前记录，再拖动记录调整位置。'
  if (unverifiedSave.value) return '保存结果尚未确认，请先重新核对。'
  if (props.recordsLoading) return '正在读取本池记录，请稍后调整顺序。'
  if (!recordsReady.value) return '本池记录读取失败或尚未就绪，请重新读取后排序。'
  if (props.hasMore) return '需要读取本池全部记录后才能拖动排序。'
  if (rows.value.length > 20000) return '历史排序最多支持本池20000条记录，请先导出备份核对。'
  if (recordSearch.value.trim()) return '请清除搜索后拖动排序，避免只调整部分历史。'
  if (missingRecordIds.value.length) return '请先核对失效草稿，再调整顺序。'
  if (orderChanged.value && orderRevision.value !== props.recordsRevision) return '档案版本已变化，顺序草稿保留；请恢复保存前顺序后重新拖动或用上下键调整。'
  if (rows.value.length < 2) return '至少两条记录才能调整顺序。'
  return ''
})
function announceOrder(message) { sortAnnouncement.value = message }
function applyDisplayOrder(ids) {
  if (sortBlocked.value) return
  const current = displayRows.value.map(row => row.event_id)
  const set = new Set(ids)
  if (ids.length !== current.length || set.size !== ids.length || current.some(id => !set.has(id))) return
  if (ids.every((id, index) => id === current[index])) return
  orderIds.value = ids.slice().reverse()
  orderRevision.value = props.recordsRevision
  announceOrder('记录位置已调整，历史顺序待保存')
}
const { dragging, cancelDrag, isDragClick } = useRecordDrag(recordList, sortBlocked,
  () => `${editorSession}:${props.pool?.pool_id}:${props.recordsRevision}:${props.requestVersion}`,
  applyDisplayOrder, announceOrder)
function handleLabel(row) { return `${recordLabel(row)}；拖动调整位置，上下键移动` }
function moveByKey(event, row) {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key) || sortBlocked.value || dragging.value) return
  event.preventDefault()
  const handle = event.currentTarget
  const ids = displayRows.value.map(item => item.event_id), index = ids.indexOf(row.event_id)
  const target = index + (event.key === 'ArrowUp' ? -1 : 1)
  if (target < 0 || target >= ids.length) return
  ids.splice(index, 1); ids.splice(target, 0, row.event_id)
  applyDisplayOrder(ids)
  announceOrder(`${selectedAgent(row)?.name || row.agent_id}已移到第${target + 1}条，共${ids.length}条，待保存`)
  nextTick(() => focusInBody(handle))
}
function resetOrder() {
  orderIds.value = null; orderRevision.value = null
  announceOrder('已恢复保存前顺序，新增、编辑和删除草稿仍保留')
}

const tailProgress = computed(() => Number.isInteger(Number(remaining.value)) && Number(remaining.value) >= 1 && Number(remaining.value) <= 40 ? 40 - Number(remaining.value) : null)
const displayedProgress = computed(() => tailProgress.value == null ? null : progressLabel.value === '已抽' ? 40 - tailProgress.value : tailProgress.value)
const barClass = row => isFourStar(row) ? 'bar-count' : row.pull_span === '' ? 'bar-unknown' : Number(row.pull_span) <= 20 ? 'bar-low' : Number(row.pull_span) <= 30 ? 'bar-mid' : 'bar-high'
const spanWidth = row => isFourStar(row) ? '0%' : row.pull_span === '' ? '100%' : Math.min(Number(row.pull_span) / 40, 1) * 100 + '%'
const isChanged = row => JSON.stringify(rowInput(row)) !== originals.get(row.event_id)
function recordLabel(row) {
  const agent = selectedAgent(row)
  const pulls = isFourStar(row) ? '4星计次，不影响保底' : row.pull_span === '' ? '抽数未知' : row.pull_span + '抽出货'
  const status = row.up_status === 'non_up' ? '，非UP' : (agent?.poolSlot || row.up_status === 'up') ? '，UP' : ''
  const rank = goldOrder.value.get(row.event_id)
  return '编辑' + (agent?.name || row.agent_id) + '，' + pulls + status + (row.batch_id ? '，批次记录' : '') + (rank ? `，本池已记录第${rank}个金` : '')
}
const recordPendingCount = computed(() => rows.value.filter(row => isChanged(row)).length + deletedIds.value.length + (orderChanged.value ? 1 : 0))
const pendingCount = computed(() => recordPendingCount.value + (remaining.value !== initialRemaining.value ? 1 : 0))
function hasDraft() {
  if (!props.open || props.practiceResult) return false
  if (pendingCount.value) return true
  const row = activeRow.value
  if (!row) return false
  if (!originals.has(row.event_id)) return !!(row.agent_id || row.pull_span !== '' || row.acquired_date || row.note)
  try { return isChanged(row) } catch { return true }
}
function updateKeyboardInset() {
  if (typeof window === 'undefined') return 0
  const viewport = window.visualViewport
  const layoutHeight = window.innerHeight || document.documentElement?.clientHeight || 0
  let inset = 0
  if (viewport && (viewport.scale == null || Math.abs(viewport.scale - 1) < 0.01)) {
    const rawInset = layoutHeight - (viewport.offsetTop + viewport.height)
    if (rawInset > KEYBOARD_INSET_THRESHOLD) inset = Math.round(rawInset)
  }
  panel.value?.style.setProperty('--keyboard-inset', inset + 'px')
  panel.value?.parentElement?.style.setProperty('--keyboard-inset', inset + 'px')
  return inset
}
function ensureEntryVisible() {
  if (typeof window === 'undefined') return
  updateKeyboardInset()
  if (!props.open || !editorBody.value || !entryComposer.value?.contains(document.activeElement)) return
  const viewport = window.visualViewport
  const visibleTop = Math.max(viewport?.offsetTop || 0, editorBody.value.getBoundingClientRect().top, panel.value?.querySelector('.editor-header')?.getBoundingClientRect().bottom || 0) + ENTRY_VISIBLE_TOP_GAP
  const focusedField = panel.value?.contains(document.activeElement) && document.activeElement.matches('input, select, textarea, button') ? document.activeElement : null
  const actions = activeRow.value ? entryComposer.value?.querySelector('.composer-actions') : panel.value?.querySelector('.progress-actions')
  const actionsRect = actions?.getBoundingClientRect()
  const visibleBottom = Math.min(editorBody.value.getBoundingClientRect().bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - ENTRY_VISIBLE_BOTTOM_GAP
  const bounds = (focusedField || entryComposer.value).getBoundingClientRect()
  const rect = { top: bounds.top, bottom: bounds.bottom, height: bounds.height }
  const availableHeight = Math.max(0, visibleBottom - visibleTop)
  const currentHint = panel.value?.querySelector('.guide-hint')
  const hintTarget = currentHint && panel.value?.querySelector(`[data-guide-target="${currentHint.dataset.guideFor}"]`)
  const hintRect = currentHint?.getBoundingClientRect()
  if (focusedField && hintTarget?.contains(focusedField) && hintRect && rect.bottom - hintRect.top <= availableHeight) { rect.top = Math.min(rect.top, hintRect.top); rect.height = rect.bottom - rect.top }
  if (!activeRow.value && actionsRect && actionsRect.bottom >= rect.bottom && actionsRect.bottom - rect.top <= availableHeight) {
    rect.bottom = actionsRect.bottom
    rect.height = rect.bottom - rect.top
  }
  let delta = 0
  if (rect.height > availableHeight) delta = rect.top - visibleTop
  else if (rect.bottom > visibleBottom) delta = rect.bottom - visibleBottom
  else if (rect.top < visibleTop) delta = rect.top - visibleTop
  if (Math.abs(delta) > 1) editorBody.value.scrollBy?.({ top: delta, behavior: 'auto' })
}
function scheduleEntryVisibility() {
  if (typeof window === 'undefined') return
  if (viewportFrame) window.cancelAnimationFrame(viewportFrame)
  viewportFrame = window.requestAnimationFrame(() => {
    viewportFrame = 0
    ensureEntryVisible()
  })
  if (viewportSettleTimer) window.clearTimeout(viewportSettleTimer)
  viewportSettleTimer = window.setTimeout(() => {
    viewportSettleTimer = 0
    ensureEntryVisible()
  }, 180)
}
function resetKeyboardAvoidance() {
  panel.value?.style.setProperty('--keyboard-inset', '0px')
  panel.value?.parentElement?.style.setProperty('--keyboard-inset', '0px')
  if (typeof window === 'undefined') return
  if (viewportFrame) window.cancelAnimationFrame(viewportFrame)
  if (viewportSettleTimer) window.clearTimeout(viewportSettleTimer)
  viewportFrame = 0
  viewportSettleTimer = 0
}
function onViewportChange() {
  if (props.open) scheduleEntryVisibility()
}
function focusEntry(preferPulls = false) {
  const session = editorSession
  nextTick(() => {
    if (!props.open || session !== editorSession || !activeRow.value) return
    const target = preferPulls ? (pullSpanInput.value?.disabled ? null : pullSpanInput.value) || entryComposer.value?.querySelector('.composer-actions .primary') : agentSearchInput.value || entryComposer.value?.querySelector('.agent-choice')
    target?.focus({ preventScroll: true })
    scheduleEntryVisibility()
  })
}
function focusInBody(target) {
  if (!props.open || !target?.isConnected || target.disabled) return
  target.focus({ preventScroll: true })
  const body = editorBody.value, bounds = body?.getBoundingClientRect(), rect = target.getBoundingClientRect()
  if (!bounds || !body.contains(target)) return
  const viewport = window.visualViewport
  const top = Math.max(bounds.top, viewport?.offsetTop || 0) + 16
  const bottom = Math.min(bounds.bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 16
  const delta = rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0
  if (Math.abs(delta) > 1) body.scrollBy?.({ top: delta, behavior: 'auto' })
}
let entryReturn = null
function rememberEntry(target, id = null) {
  entryReturn = { target, id, top: target?.getBoundingClientRect().top, scrollTop: editorBody.value?.scrollTop || 0, handle: target?.matches('.record-handle') }
}
function restoreEntry(id = entryReturn?.id) {
  const anchor = entryReturn, session = editorSession
  entryReturn = null
  nextTick(() => {
    if (!props.open || session !== editorSession || activeRow.value) return
    const row = Array.from(recordList.value?.children || []).find(node => node.dataset.eventId === id)
    const opener = anchor?.target?.isConnected && !anchor.target.disabled ? anchor.target : null
    const target = row?.querySelector(anchor?.handle ? '.record-handle' : '.record-detail, .agent-record-detail') || opener || panel.value?.querySelector('.add-record:not(:disabled)') || panel.value?.querySelector('.record-view-switch button')
    if (anchor && editorBody.value) {
      editorBody.value.scrollTop = anchor.scrollTop
      if (row && anchor.id && anchor.top != null) editorBody.value.scrollTop += target.getBoundingClientRect().top - anchor.top
    }
    focusInBody(target)
  })
}
function add(agentId = '', event) {
  if (props.busy || props.readOnly || !recordsReady.value || unverifiedSave.value || (!props.canRecord && (!activeRow.value || !originals.has(activeRow.value.event_id)))) return
  if (!activeRow.value) rememberEntry(event?.currentTarget || panel.value?.querySelector('.add-record'))
  dailyMode.value = 'record'
  pullsReviewed.value = false; progressReviewed.value = false; viewedRecords.value = false
  recordSearch.value = ''
  error.value = ''; entryError.value = ''
  if (!activeRow.value) { activeRow.value = { event_id: createRecruitmentId(), agent_id: '', pull_span: '', up_status: 'unknown', acquired_date: null, note: null } }
  if (agentId) {
    activeRow.value.agent_id = agentId
    choosingAgent.value = false
    focusEntry(true)
    return
  }
  resetAgentFilters()
  choosingAgent.value = true
  focusEntry(false)
}
function cancelAgentPicker() {
  if (!activeRow.value?.agent_id) { cancelEntry(); return }
  choosingAgent.value = false
  resetAgentFilters()
  focusEntry(true)
}
function chooseOtherAgent(agentId) {
  if (!activeRow.value) return
  activeRow.value.agent_id = agentId
  choosingAgent.value = false
  resetAgentFilters()
  focusEntry(true)
}
function edit(row, event) { if (isDragClick() || props.busy || props.readOnly || props.recordsLoading || activeRow.value) return; rememberEntry(event?.currentTarget, row.event_id); pullsReviewed.value = false; progressReviewed.value = false; viewedRecords.value = false; error.value = ''; entryError.value = ''; activeRow.value = { ...row }; choosingAgent.value = false; focusEntry(true) }
function isStoredRow(row) { return !!row && rows.value.some(item => item.event_id === row.event_id) }
function limitPullSpan(event) {
  if (!activeRow.value) return
  const raw = event.target.value
  if (raw === '') return
  const number = Number(raw)
  if (!Number.isFinite(number) || (number >= 1 && number <= MAX_EVENT_PULLS)) return
  const limited = number > MAX_EVENT_PULLS ? MAX_EVENT_PULLS : 1
  event.target.value = String(limited)
  activeRow.value.pull_span = String(limited)
}
function cancelEntry() { entryError.value = ''; activeRow.value = null; choosingAgent.value = false; resetAgentFilters(); restoreEntry() }
function confirmRecord() {
  if (!activeRow.value || props.busy || props.readOnly || props.recordsLoading) return false
  error.value = ''; entryError.value = ''
  try {
    const entry = rowInput(activeRow.value)
    if (!options.value.some(agent => agent.id === entry.agent_id)) throw new Error('请选择本池 UP 或本游戏4星/5星密探')
    const index = rows.value.findIndex(row => row.event_id === entry.event_id)
    const row = { ...activeRow.value, pull_span: entry.pull_span ?? '' }
    if (index < 0) {
      rows.value.push(row)
      if (orderIds.value) orderIds.value = [...orderIds.value, row.event_id]
    } else rows.value.splice(index, 1, row)
    activeRow.value = null
    choosingAgent.value = false
    restoreEntry(row.event_id)
    return true
  } catch (err) { entryError.value = err.message; nextTick(() => { focusInBody(pullSpanInput.value || agentSearchInput.value); scheduleEntryVisibility() }); return false }
}
function remove(row) {
  const index = displayRows.value.findIndex(item => item.event_id === row.event_id)
  const neighbor = displayRows.value[index + 1] || displayRows.value[index - 1]
  if (orderIds.value) orderIds.value = orderIds.value.filter(id => id !== row.event_id)
  if (activeRow.value?.event_id === row.event_id) {
    activeRow.value = null
    choosingAgent.value = false
    resetAgentFilters()
  }
  if (originals.has(row.event_id) && !deletedIds.value.includes(row.event_id)) deletedIds.value.push(row.event_id)
  rows.value = rows.value.filter(item => item.event_id !== row.event_id)
  restoreEntry(neighbor?.event_id)
}
watch(() => props.open, open => {
  editorSession++
  entryReturn = null
  sortAnnouncement.value = ''
  if (!open) {
    if (guideVisible.value) dismissGuide()
    guidePicker.value = false
    resetKeyboardAvoidance()
    return
  }
  guideVisible.value = TUTORIALS_ENABLED && props.guided
  pullsReviewed.value = false; progressReviewed.value = false; viewedRecords.value = false
  orderIds.value = null; orderRevision.value = null
  rows.value = []; activeRow.value = null; choosingAgent.value = false; resetAgentFilters(); deletedIds.value = []; originals.clear(); initialized.value = false; error.value = ''; entryError.value = ''; progressError.value = ''; requestId = ''; dailyMode.value = props.practice || guideVisible.value ? '' : 'record'; recordSearch.value = ''
  const progress = props.pool?.progress
  remaining.value = Number.isInteger(progress) && progress >= 0 && progress < 40 ? String(40 - progress) : ''
  initialRemaining.value = remaining.value
  nextTick(scheduleEntryVisibility)
}, { immediate: true })
watch([() => props.records, () => props.recordsRevision, () => props.open, () => props.recordsLoading], () => {
  if (!props.open || props.recordsLoading || props.recordsRevision == null) return
  for (const event of props.records) {
    if (originals.has(event.event_id)) continue
    const row = { event_id: event.event_id, agent_id: event.agent_snapshot.agent_id, pull_span: event.pull_span ?? '', up_status: event.up_status, acquired_date: event.acquired_date, note: event.note, batch_id: event.batch_id }
    originals.set(event.event_id, JSON.stringify(entryInput(row)))
    if (!rows.value.some(item => item.event_id === row.event_id)) rows.value.push(row)
  }
  initialized.value = true
}, { immediate: true })
watch([rows, orderIds, activeRow, deletedIds, remaining, () => props.requestVersion], () => { requestId = '' }, { deep: true, flush: 'sync' })
onMounted(() => {
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', onViewportChange)
  viewport?.addEventListener('scroll', onViewportChange)
  window.addEventListener('resize', onViewportChange)
  if (TUTORIALS_ENABLED) {
    window.addEventListener('pointerup', releaseGuideHint)
    window.addEventListener('pointercancel', releaseGuideHint)
  }
  if (props.open) scheduleEntryVisibility()
})
onBeforeUnmount(() => {
  editorSession++
  const viewport = window.visualViewport
  viewport?.removeEventListener('resize', onViewportChange)
  viewport?.removeEventListener('scroll', onViewportChange)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('pointerup', releaseGuideHint)
  window.removeEventListener('pointercancel', releaseGuideHint)
  window.clearTimeout(pointerReleaseTimer)
  resetKeyboardAvoidance()
})
useModalFocus(computed(() => props.open), panel, { preventRestoreScroll: true, initialFocus: () => panel.value?.querySelector('.remaining-field input:not(:disabled), .record-view-switch button'), onEscape: () => { if (!cancelDrag()) choosingAgent.value ? cancelAgentPicker() : guideVisible.value || guidePicker.value ? dismissGuide() : close() } })
async function submit() {
  if (dragging.value || props.busy || props.readOnly || props.recordsLoading || props.recordsError || !initialized.value || !props.pool || unverifiedSave.value) return
  if (activeRow.value) {
    if (!props.practice || !confirmRecord()) return
  }
  if (!pendingCount.value) return
  error.value = ''; progressError.value = ''
  try {
    if (missingRecordIds.value.length) throw new Error('旧记录已在其他设备删除，请先核对并移除失效草稿；其余修改仍保留')
    if (orderChanged.value) {
      if (props.hasMore || !recordsReady.value) throw new Error('请读完本池全部记录后保存顺序')
      const expected = props.records.filter(event => !event.deleted_at && !deletedIds.value.includes(event.event_id)).map(event => event.event_id).concat(rows.value.filter(row => !originals.has(row.event_id)).map(row => row.event_id))
      const intended = new Set(orderIds.value)
      if (orderRevision.value !== props.recordsRevision || expected.length !== orderIds.value.length || expected.some(id => !intended.has(id))) throw new Error('档案已变化，顺序草稿已保留；请恢复保存前顺序，重新调整并核对完整记录后保存')
    }
    const countOnly = rows.value.filter(isChanged).every(isFourStar) && deletedIds.value.every(id => props.records.find(event => event.event_id === id)?.agent_snapshot.rarity === 4)
    try {
      if (remaining.value === '' && !countOnly) throw new Error('保底进度未知：草稿已保留，请核对游戏里的真实保底再保存，不要猜值。')
      if (remaining.value !== '' && progressLabel.value === '已垫' && tailProgress.value == null) throw new Error('已垫次数须为 0–39 的整数')
      if (remaining.value !== '') progressFromRemaining(remaining.value)
    } catch (err) {
      progressError.value = err.message
      await nextTick(); remainingInput.value?.focus({ preventScroll: true })
      return
    }
    const entries = rows.value.map(row => {
      const input = rowInput(row)
      if (!options.value.some(agent => agent.id === input.agent_id)) throw new Error('请选择本池 UP 或本游戏4星/5星密探')
      if (!originals.has(row.event_id)) {
        if (!props.canRecord) throw new Error('此卡池暂不能新增出货')
        const definition = recruitmentPoolCatalog(props.pool, props.catalog) || props.pool.snapshot
        input.up_status = selectedAgent(row)?.poolSlot ? 'up' : definition.up_status === 'verified' && definition.up_agent_ids?.length && !definition.unmapped_up_agent_names?.length ? 'non_up' : 'unknown'
      }
      return input
    }).filter(entry => JSON.stringify(entry) !== originals.get(entry.event_id))
    if (entries.length > 120 || deletedIds.value.length > 120) throw new Error('每次最多维护120条出货，请分次保存')
    preservedProgress.value = props.pool.progress
    if (!requestId) requestId = createRecruitmentId()
    emit('save', { requestId, revision: props.recordsRevision, operation: 'pool_records_save', data: { pool_id: props.pool.pool_id, entries, deleted_event_ids: deletedIds.value.slice(), remaining_pulls: remaining.value === '' ? null : Number(remaining.value), ...(orderChanged.value ? { ordered_event_ids: orderIds.value.slice() } : {}) } })
  } catch (err) { error.value = err.message; await nextTick(); focusInBody(errorSummary.value) }
}
</script>

<style scoped>
.modal-mask {
  --keyboard-inset: 0px;
  bottom: var(--keyboard-inset);
  z-index: var(--z-overlay-panel);
  padding: 0;
}
.modal-mask:has(.pool-editor[data-practice]) { z-index: var(--z-overlay-raised); }
.pool-editor {
  --keyboard-inset: 0px;
  --editor-body-bottom-space: 24px;
  --editor-green: #426451;
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
  height: calc(100dvh - var(--keyboard-inset));
  max-height: calc(100dvh - var(--keyboard-inset));
  padding-top: env(safe-area-inset-top);
  overflow: hidden;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
}
h2, h3, p { margin: 0; }
h3 { font: 900 20px/1.5 var(--font-s); }
.editor-header {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: linear-gradient(105deg, var(--cream), var(--surface));
}
.editor-title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.editor-eyebrow { color: var(--accent-strong); font-size: 11px; font-weight: 700; letter-spacing: .2em; }
h2 { margin-top: 4px; font: 900 23px/1.4 var(--font-s); letter-spacing: .04em; }
.pool-confirmation { margin-top: 6px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.close-button { display: grid; place-items: center; flex: none; padding: 9px; border-radius: 50%; }
.pool-editor form { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.editor-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 16px var(--editor-body-bottom-space);
  scroll-padding: 16px 0 var(--editor-body-bottom-space);
}
.progress-card {
  display: flex;
  flex: none;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
  padding: 8px 16px;
  border-block: 1px solid var(--line);
  background: color-mix(in srgb, var(--paper) 23%, var(--surface));
}
.progress-card h3 { font: 700 12px/1.5 var(--font-b); color: var(--ink-60); }
.progress-overview { flex: 1; min-width: 164px; }
.progress-number { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; font-size: 12px; }
.progress-number strong { font: 700 17px/1 var(--font-d); }
.progress-number small { margin-left: 8px; color: var(--ink-60); font-size: 12px; }
.progress-rail { height: 3px; max-width: 180px; margin-top: 6px; background: var(--line); border-radius: 2px; overflow: hidden; }
.progress-rail > span { display: block; height: 100%; background: var(--editor-green); }
.remaining-guide { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.remaining-guide > .guide-hint { flex-basis: 100%; }
.remaining-input { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.remaining-input input { width: 66px; margin: 0; padding-inline: 6px; text-align: center; font-family: var(--font-d); }
.progress-label-switch { border: 0; padding: 0; background: transparent; }
.progress-label-switch button { min-width: 44px; padding: 6px 8px; }
.progress-error { flex-basis: 100%; color: var(--rouge); font-size: 12px; line-height: 1.6; }
.entry-section { position: relative; padding: 16px 14px; margin-bottom: 22px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--cream) 35%, var(--surface)); }
.entry-heading { padding-right: 44px; margin-bottom: 14px; }
.entry-heading p { margin-top: 3px; color: var(--ink-60); font-size: 12px; }
.entry-workflow { display: grid; gap: 16px; }
.entry-shortcuts { display: flex; align-items: center; gap: 8px; min-width: 0; overflow-x: auto; padding-block: 3px; }
.quick-up-button, .add-record {
  position: relative;
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 5px;
  flex: none;
  width: 64px;
  height: 88px;
  padding: 5px;
  border-color: transparent;
  background: transparent;
}
.quick-up-avatar, .other-agent-placeholder { width: 48px; height: 48px; }
.other-agent-placeholder { display: grid; place-items: center; border: 1px dashed var(--line); border-radius: 8px; }
.quick-up-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
.quick-up-mark { position: absolute; top: 39px; right: 3px; padding: 2px 5px; border-radius: 3px; background: var(--tea); color: var(--cream); font: 700 9px/1.2 var(--font-d); }
.quick-up-check { position: absolute; top: 0; right: 0; padding: 2px; box-sizing: content-box; border-radius: 50%; background: var(--editor-green); color: var(--surface); }
.quick-up-button.is-selected, .add-record.is-selected { border-color: var(--editor-green); background: color-mix(in srgb, var(--editor-green) 7%, var(--surface)); }
.entry-composer { min-width: 0; scroll-margin-block: 16px 24px; }
.compact-entry-row { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; }
.pull-controls { display: flex; align-items: end; gap: 8px; min-width: 0; }
.pull-count-field { display: grid; gap: 6px; min-width: 0; font-size: 12px; }
.pull-count-field input { --input-font-size: 20px; width: 52px; margin: 0; padding: 8px 4px; text-align: center; font: 700 var(--input-font-size)/1.2 var(--font-d); }
.pull-stepper { display: flex; align-items: center; min-width: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.pull-stepper button { display: grid; place-items: center; padding: 9px; border: 0; background: transparent; }
.pull-stepper input { min-width: 0; border: 0; border-radius: 0; appearance: textfield; }
.pull-stepper input::-webkit-inner-spin-button { -webkit-appearance: none; }
.unknown-pulls { padding-inline: 8px; color: var(--ink-60); font-size: 12px; }
.unknown-pulls[aria-pressed="true"] { border-color: var(--tea); background: var(--cream); color: var(--tea); }
.composer-note, .unknown-progress-note { margin-top: 8px; color: var(--ink-60); font-size: 12px; line-height: 1.6; }
.composer-actions { display: flex; align-items: end; gap: 8px; width: 100%; }
.composer-actions > .primary { flex: none; width: 56px; padding-inline: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pool-editor[data-practice] .composer-actions > .primary { width: auto; }
.entry-cancel, .entry-delete { display: grid; flex: none; place-items: center; width: 44px; height: 44px; padding: 9px; background: transparent; }
.entry-delete { position: absolute; top: 10px; right: 10px; border-color: transparent; color: var(--rouge); }
.entry-placeholder { min-width: 0; }
.records-section { min-width: 0; }
.records-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; }
.records-heading { flex: 1 1 100%; min-width: 0; }
.records-heading h3 span { display: inline-block; margin-left: 8px; color: var(--ink-60); font: 400 12px/1.5 var(--font-b); }
.record-search { position: relative; flex: 1; min-width: 140px; }
.record-search svg { position: absolute; top: 50%; left: 10px; transform: translateY(-50%); color: var(--ink-60); }
.record-search input { margin: 0; padding-left: 32px; font-size: 12px; }
.record-view-switch { display: inline-flex; flex: none; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
.record-view-switch button { min-width: 0; padding: 6px 10px; border-color: transparent; border-radius: 5px; background: transparent; color: var(--ink-60); font-size: 12px; white-space: nowrap; }
.record-view-switch button.is-selected { color: var(--tea); background: var(--surface); border-color: var(--line); }
.progress-label-switch { padding: 0; border: 0; background: transparent; }
.progress-label-switch button.is-selected { background: var(--surface); }
.sort-help { color: var(--ink-60); font-size: 12px; line-height: 1.7; margin-bottom: 8px; }
.sort-help button { margin-left: 6px; padding: 4px 8px; font-size: 12px; background: transparent; }
.record-feed { display: grid; list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.gacha-record { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-items: center; gap: 8px; min-width: 0; padding: 7px 0; border-bottom: 1px solid var(--line); }
.record-handle { display: flex; align-items: center; justify-content: center; gap: 4px; min-width: 44px; min-height: 44px; padding: 0; border: 0; background: transparent; cursor: grab; -webkit-touch-callout: none; user-select: none; }
.record-handle[data-sort-disabled="true"] { cursor: default; }
.record-handle :deep(img) { pointer-events: none; -webkit-user-drag: none; }
.drag-grip { flex: none; color: var(--ink-60); }
.record-avatar { width: 40px; height: 40px; flex: none; }
.record-detail { display: flex; align-items: center; width: 100%; min-width: 0; min-height: 44px; padding: 0; border: 0; border-radius: 7px; background: transparent; text-align: left; }
.record-detail:not(:disabled):hover { background: transparent; }
.record-track { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; width: 100%; min-width: 0; min-height: 36px; }
.record-bar { --bar-color: var(--accent-strong); display: flex; flex: none; align-items: center; min-width: 72px; max-width: calc(100% - 48px); height: 36px; padding: 0 10px; border-radius: 6px; color: var(--surface); background-color: var(--bar-color); background-image: repeating-linear-gradient(115deg, transparent 0 14px, rgba(255, 255, 255, .12) 14px 27px); }
.record-bar.bar-low { --bar-color: #367447; }
.record-bar.bar-mid { --bar-color: var(--accent-strong); }
.record-bar.bar-high { --bar-color: var(--rouge); }
.record-bar.bar-unknown, .record-bar.bar-count { --bar-color: var(--slate-deep); }
.pull-result { display: flex; align-items: baseline; gap: 5px; min-width: 0; white-space: nowrap; }
.pull-result b { font: 700 20px/1 var(--font-d); }
.pull-result small { color: color-mix(in srgb, var(--surface) 88%, transparent); font-size: 12px; font-weight: 700; }
.status-pill, .pending-mark { display: inline-flex; flex: none; align-items: center; justify-content: center; min-height: 24px; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 800; line-height: 1; }
.status-pill { border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line)); color: var(--accent-strong); }
.status-pill.is-neutral { border-color: var(--line); color: var(--ink-60); }
.non-up-stamp { display: grid; flex: none; width: 30px; height: 30px; place-items: center; border: 2px solid var(--rouge); border-radius: 50%; color: var(--rouge); font: 800 17px/1 var(--font-s); transform: rotate(-12deg); }
.pending-mark { background: var(--yellow); color: var(--tea); }
.saved-mark { color: var(--editor-green); font-size: 11px; }
.gacha-record.is-sortable, .gacha-record.is-sortable .record-detail { cursor: grab; -webkit-touch-callout: none; user-select: none; }
.gacha-record:hover { background: var(--cream); }
.agent-record-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(104px, 100%), 1fr)); gap: 16px 12px; list-style: none; margin: 0; padding: 16px 0; border-top: 1px solid var(--line); }
.agent-record-card { display: grid; justify-items: center; align-content: start; min-width: 0; padding-top: 6px; }
.agent-record-portrait { display: block; position: relative; width: min(100%, 78px); aspect-ratio: 1; }
.agent-record-avatar { width: 100%; height: 100%; }
.agent-order-badge { position: absolute; top: -6px; left: -6px; z-index: 2; min-width: 22px; padding: 3px; border: 1px solid var(--accent); border-radius: 4px; background: #F5C84C; color: var(--tea-deep); font: 700 11px/1.2 var(--font-d); text-align: center; white-space: nowrap; }
.agent-pull-badge { --badge-color: #F3AB36; padding: 4px 8px; border: 1px solid color-mix(in srgb, var(--badge-color) 70%, var(--surface)); border-radius: 4px; background: var(--badge-color); color: var(--tea-deep); font: 700 13px/1.2 var(--font-d); white-space: nowrap; }
.agent-pull-badge.bar-low { --badge-color: #087F5B; color: var(--surface); }
.agent-pull-badge.bar-high { --badge-color: #C6473B; color: var(--surface); }
.agent-pull-badge.bar-unknown, .agent-pull-badge.bar-count { --badge-color: var(--slate-deep); color: var(--surface); }
.agent-non-up { position: absolute; top: -6px; right: -6px; z-index: 2; background: var(--surface); }
.agent-record-detail { display: grid; justify-items: center; gap: 4px; width: 100%; min-width: 0; padding: 6px 3px; border-color: transparent; background: transparent; }
.agent-record-flags { display: flex; justify-content: center; flex-wrap: wrap; gap: 3px; }
.agent-record-flag { font-size: 11px; color: var(--ink-60); }
.agent-record-flag.is-pending { padding: 2px 5px; color: var(--tea); background: var(--yellow); border-radius: 3px; }
.records-empty { padding: 28px 16px; border-block: 1px dashed var(--line); text-align: center; }
.records-empty strong { font: 700 16px/1.5 var(--font-s); }
.records-empty p { margin-top: 6px; font-size: 12px; line-height: 1.7; color: var(--ink-60); }
.records-tail { display: flex; align-items: start; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.bar-legend { flex: 1; min-width: 180px; font-size: 11px; line-height: 1.7; color: var(--ink-60); }
.load-more { font-size: 12px; }
footer { display: flex; flex: none; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 12px 16px max(12px, env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--cream); }
.footer-state { display: grid; gap: 2px; color: var(--ink-60); font-size: 12px; line-height: 1.5; }
.footer-state strong { color: var(--tea); font-weight: 700; }
.footer-actions { display: flex; gap: 8px; margin-left: auto; }
.footer-actions .primary { min-width: 112px; }
button { min-width: 44px; min-height: 44px; border: 1px solid var(--line); border-radius: 8px; padding: 9px 14px; color: var(--ink); background: var(--surface); font: inherit; cursor: pointer; }
button:not(:disabled):hover { border-color: var(--ink-35); background: var(--cream); }
.primary { border-color: var(--tea); background: var(--tea); color: var(--cream); }
.primary:not(:disabled):hover { border-color: var(--tea); background: color-mix(in srgb, var(--tea) 90%, var(--surface)); }
label { display: block; min-width: 0; font-size: 13px; }
input { min-width: 0; min-height: 44px; width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: inherit; }
input[aria-invalid="true"] { border-color: var(--rouge); }
button:disabled, input:disabled { cursor: not-allowed; opacity: .55; }
button:focus-visible, input:focus-visible, summary:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--tea); outline-offset: 2px; }
.form-error { margin: 10px 0; color: var(--rouge); font-size: 13px; line-height: 1.7; }
.state-note, .change-note, .save-result { padding: 10px 12px; margin-bottom: 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); font-size: 12px; line-height: 1.7; }
.change-note { margin-top: 16px; }
.save-result p, .daily-entry p { margin-top: 6px; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
.is-saved { background: color-mix(in srgb, var(--yellow) 16%, var(--surface)); }
.inline-action { margin-left: 6px; padding: 4px 8px; }
.daily-entry { margin-bottom: 16px; }
.daily-choices { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.daily-choices button[aria-pressed="true"] { background: var(--tea); color: var(--cream); }
.progress-actions { margin: 12px 0; }
.guide-choice { margin: 10px 16px; }
:deep([data-guide-active]) { outline: 2px solid var(--accent); outline-offset: 3px; }
.gacha-record > .guide-hint, .compact-entry-row > .guide-hint { grid-column: 1 / -1; width: 100%; }
.agent-record-card:has(.guide-hint) { grid-column: 1 / -1; }
.sr-only, .sort-announcement { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
/* 避免 disabled 按钮吞掉松手事件，让容器接收拖动结束。 */
.pool-editor.is-dragging button, .pool-editor.is-dragging input { pointer-events: none; }
.record-drag-chosen { background: var(--cream); }
.record-drag-gap { outline: 2px dashed var(--accent); outline-offset: -2px; background: var(--cream); }
.record-drag-gap > * { opacity: .22; }
.record-drag-floating { z-index: var(--z-overlay-raised) !important; pointer-events: none; border-radius: 8px; background: var(--surface); box-shadow: 0 8px 24px color-mix(in srgb, var(--ink) 22%, transparent); opacity: .95 !important; }

.agent-picker {
  position: absolute;
  z-index: var(--z-overlay-raised);
  top: calc(100% + 8px);
  inset-inline: 0;
  max-height: min(440px, 50dvh);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--ink) 12%, transparent);
}

.agent-search {
  margin-bottom: 7px;
}

.agent-search input {
  min-height: 42px;
  margin-top: 0;
  padding-inline: 12px;
  font-size: 13px;
}

.agent-filter-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  margin-bottom: 5px;
  color: var(--ink-60);
  font-size: 10px;
  font-weight: 800;
}

.agent-filter-head b {
  color: var(--accent-strong);
  font: 900 12px var(--font-d);
}

.agent-filter-reset {
  min-width: 0;
  min-height: 36px;
  padding: 5px 8px;
  border-radius: 7px;
  color: var(--ink-60);
  font-size: 10px;
}

.agent-filter-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.agent-picker-cancel {
  min-width: 52px;
  min-height: 44px;
  padding: 5px 10px;
  border-color: color-mix(in srgb, var(--tea) 24%, var(--line));
  font-size: 11px;
  font-weight: 800;
}

.agent-filter-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  margin-top: 4px;
}

.agent-filter-label {
  color: var(--tea);
  font-size: 10.5px;
  font-weight: 800;
  text-align: center;
}

.agent-filter-options {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 3px;
  padding: 3px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--tea) 7%, transparent);
}

.agent-filter-options button {
  min-width: 0;
  min-height: 44px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--ink-60);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.agent-filter-options button.on {
  background: var(--surface);
  color: var(--accent-strong);
  box-shadow: 0 1px 4px color-mix(in srgb, var(--tea) 18%, transparent);
}

.agent-filter-options button img {
  width: 13px;
  height: 13px;
  margin-right: 3px;
  vertical-align: -2px;
  object-fit: contain;
}

.agent-picker-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(64px, 100%), 1fr));
  gap: 8px;
  max-height: min(42dvh, 340px);
  margin-top: 7px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px 3px 4px 2px;
}

.agent-choice {
  display: flex;
  min-width: 0;
  min-height: 70px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 3px;
  overflow: hidden;
  text-align: center;
}

.agent-choice-avatar {
  width: 38px;
  height: 38px;
}

.agent-choice > span {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.agent-picker-empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 14px 4px;
  color: var(--ink-60);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}


@media (min-width: 431px) {
  .modal-mask { padding: 16px; }
  .pool-editor { width: min(780px, 100%); height: auto; max-height: min(860px, calc(100dvh - 32px - var(--keyboard-inset))); border-radius: 18px; }
  .pool-editor form, .editor-body { flex: 1 1 auto; }
}
@media (min-width: 700px) {
  .editor-header { padding: 22px 28px 18px; }
  h2 { font-size: 28px; }
  .editor-body { padding: 22px 28px var(--editor-body-bottom-space); }
  .progress-card { padding-inline: 28px; }
  .remaining-guide { margin-left: auto; }
  .progress-overview { flex: 0 1 260px; }
  .entry-section { padding: 20px; }
  .entry-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 16px; }
  .records-heading { flex: 1; }
  .record-search { flex: 0 1 180px; }
  footer { padding-inline: 28px; }
}
@media (min-width: 768px) {
  .entry-workflow { grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 16px; }
}
@media (min-width: 700px) and (hover: hover) and (pointer: fine) {
  .pool-editor { --editor-body-bottom-space: 16px; }
  .editor-header { padding: 16px 24px 14px; }
  h2 { font-size: 26px; }
  h3 { font-size: 18px; }
  .editor-body { padding: 16px 24px var(--editor-body-bottom-space); }
  .progress-card { padding: 6px 24px; }
  .entry-section { padding: 14px 16px; margin-bottom: 16px; }
  .entry-heading { margin-bottom: 10px; }
  button { min-width: 36px; min-height: 36px; padding: 6px 12px; font-size: 13px; line-height: 1.4; }
  input { min-height: 36px; padding: 7px 10px; font-size: 14px; line-height: 1.4; }
  .quick-up-button, .add-record { width: 60px; height: 76px; padding: 3px 4px; gap: 4px; }
  .quick-up-name { line-height: 1.3; }
  .quick-up-mark { top: 37px; }
  .pull-count-field input { --input-font-size: 18px; padding-block: 5px; }
  .pull-stepper button { min-width: 32px; min-height: 34px; padding: 6px; }
  .pull-stepper input { min-height: 34px; }
  .close-button, .entry-cancel, .entry-delete { width: 36px; height: 36px; padding: 7px; }
  .entry-delete { top: 8px; right: 8px; }
  .record-view-switch button, .progress-label-switch button { min-height: 32px; padding-block: 5px; }
  .remaining-input input { min-height: 32px; padding-block: 5px; }
  .records-toolbar { gap: 8px; }
  .gacha-record { padding-block: 5px; }
  .record-handle, .record-detail { min-height: 40px; padding: 0; }
  .agent-record-grid { gap: 12px; padding-top: 12px; }
  .agent-record-detail { padding: 4px 3px; }
  .records-empty { padding: 20px 16px; }
  footer { padding: 10px 24px; }
}
@media (pointer: coarse) {
  .agent-filter-reset { min-width: 44px; min-height: 44px; }
}
@media (max-width: 520px) {
  .agent-filter-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); }
  .agent-filter-options button { width: 100%; padding-inline: 2px; }
  .agent-picker-results { max-height: 35dvh; }
}
@media (prefers-reduced-motion: reduce) {
  .pool-editor *, .pool-editor *::before, .pool-editor *::after { transition: none; animation: none; }
}
</style>
