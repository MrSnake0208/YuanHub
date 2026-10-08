<template>
  <Teleport to="body">
    <div v-if="open && pool" class="modal-mask" @click.self="close">
      <section ref="panel" class="pool-editor" role="dialog" aria-modal="true" aria-labelledby="pool-editor-title" tabindex="-1">
        <header class="editor-header">
          <div class="editor-title">
            <span class="editor-eyebrow">招募档案</span>
            <h2 id="pool-editor-title">{{ poolName }}</h2>
            <p class="pool-confirmation">{{ poolDefinition?.start_date || '开始日期未知' }} — {{ poolDefinition?.end_date || '结束日期未知' }} · 请确认是实际抽取的池</p>
          </div>
          <button v-if="!guideVisible" type="button" class="guide-entry" @click="openGuideTopics">本池帮助</button>
          <button v-if="guideVisible" type="button" class="guide-exit" @click="dismissGuide">关闭教程</button>
          <button type="button" class="close-button" aria-label="关闭卡池编辑" :disabled="busy" @click="close">
            <X :size="20" aria-hidden="true" />
          </button>
        </header>

        <form @submit.prevent="submit" @focusin="scheduleEntryVisibility">
          <div ref="editorBody" class="editor-body">
            <p v-if="readOnly" class="state-note">当前档案只可查看，暂不能修改。</p>
            <p v-else-if="!canRecord" class="state-note">此卡池已停用或目录暂不可用。可以修改已有记录与保底，暂不能新增出货。</p>

            <p v-if="error" ref="errorSummary" class="form-error" role="alert" tabindex="-1">{{ error }}</p>
            <p v-if="recordsLoading" class="state-note" role="status">正在读取本池出货记录…</p>
            <div v-if="recordsError" class="form-error" role="alert">
              {{ recordsError }}
              <button type="button" class="inline-action" :disabled="busy || recordsLoading" @click="$emit('retry')">重新读取</button>
            </div>

            <section v-if="saveReceipt" class="save-result" :class="{ 'is-confirmed': receiptVerified }" aria-live="polite" role="status">
              <template v-if="receiptVerified">
                <strong>{{ savedMessage }}</strong>
                <p>服务端已读回核对。距保底 {{ 40 - pool.progress }} 抽<span v-if="poolSummary"> · 本池已知 {{ poolSummary.known_total_pulls?.toLocaleString() ?? '未知' }} 抽 · 绝密 {{ poolSummary.event_count ?? '未知' }} 条</span>。</p>
                <p>未知间隔不计入确定抽数；下方可核对记录，继续本池可再记一笔。</p>
              </template>
              <template v-else>
                <strong>{{ busy ? '正在保存这笔…' : '保存请求已接收，结果尚未确认' }}</strong>
                <p>请重新核对保存结果，无需再新建一条。若其它设备更新了档案，可关闭并重新打开本池查看最新记录。</p>
                <button type="button" :disabled="busy || recordsLoading" @click="$emit('retry')">重新核对本笔</button>
              </template>
            </section>

            <section class="daily-entry" aria-labelledby="daily-entry-title">
              <h3 id="daily-entry-title">{{ readOnly ? '本池记录' : '这次有没有出绝密？' }}</h3>
              <div v-if="!readOnly" class="daily-choices" role="group" aria-label="这次抽卡结果">
                <button type="button" :aria-pressed="dailyMode === 'record'" :disabled="busy || !recordsReady || !canRecord || !!activeRow || recordPendingCount > 0 || !!unverifiedSave" @click="dailyMode = 'record'">抽到了绝密</button>
                <button type="button" :aria-pressed="dailyMode === 'progress'" :disabled="busy || !recordsReady || !!activeRow || recordPendingCount > 0 || !!unverifiedSave" @click="dailyMode = 'progress'">还没出绝密</button>
              </div>
              <p v-if="!dailyMode">选完再填写；以前的记录在下方，点击即可修改。</p>
              <p v-else-if="dailyMode === 'record' && !activeRow">选择这次真实出货的密探：本池 UP 可直接点头像，其他绝密可搜索。出货间隔不知道可留空。</p>
              <p v-else-if="dailyMode === 'progress'">只更新游戏里当前的保底，不会新增绝密记录。下方填「还差几抽保底」，不是「这次又抽了几次」。</p>
            </section>

            <section v-show="showProgress" class="progress-card" :class="{ 'is-saved': receiptVerified && Number(remaining) === saveReceipt.remaining_pulls }" aria-labelledby="current-progress-title">
              <div class="progress-copy">
                <span class="section-kicker">当前进度</span>
                <h3 id="current-progress-title">保底进度</h3>
                <p>按游戏当下显示核对；本页用 40 抽换算，不自动猜测出货后的进度。</p>
              </div>

              <div class="progress-overview">
                <div class="progress-number" aria-live="polite">
                  <span>已垫</span>
                  <div><strong>{{ tailProgress == null ? '—' : tailProgress }}</strong><small>/ 40 抽</small></div>
                </div>
                <div class="progress-rail" aria-hidden="true">
                  <span :style="{ width: tailProgress == null ? '0%' : Math.min(tailProgress / 40, 1) * 100 + '%' }"></span>
                </div>
              </div>

              <label class="remaining-field">
                <span>距离下次保底</span>
                <span class="remaining-input">
                  <input
                    ref="remainingInput"
                    v-model="remaining"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    max="40"
                    aria-describedby="remaining-help"
                    placeholder="1–40"
                    :disabled="busy || readOnly || recordsLoading"
                  >
                  <span>抽</span>
                </span>
              </label>
            </section>

            <p v-show="showProgress" id="remaining-help" class="composer-note">已垫 = 40 − 距保底。例如真实已垫 7 抽，距保底填 33；这是当前进度，不是本次出货间隔。{{ dailyMode === 'record' ? '出货后请核对这一数字，再保存这笔。' : '' }}</p>
            <p v-if="showProgress && tailProgress == null && !readOnly" class="state-note" role="status">当前保底进度未知。保存需填写真实的距保底抽数（1–40），暂不支持保底留空提交；出货间隔仍可以未知。不要猜 40 或 0。确认游戏进度后再保存；草稿只保留在当前窗口，关闭窗口或切换账号会丢弃。</p>
            <div v-if="dailyMode === 'progress' && !activeRow" class="progress-actions">
              <button class="primary" type="button" :disabled="busy || readOnly || !recordsReady || !!unverifiedSave || !pendingCount" @click="submit">{{ busy ? '保存中…' : '保存保底进度' }}</button>
            </div>
            <section v-if="guideVisible && (guideTopic === 'progress' || ['topics', 'invitation'].includes(guideMode))" class="first-record-guide" aria-label="招募档案使用教程">
              <p role="status">{{ guideMessage }}</p>
              <RecruitmentGuideTopics v-if="guideMode === 'topics'" @select="startGuide" />
              <div v-if="guideMode === 'invitation'" class="guide-actions">
                <button type="button" @click="openGuideTopics">选择教程主题</button>
                <button type="button" @click="dismissGuide">直接使用 / 暂时关闭</button>
                <button type="button" @click="dismissGuide(true)">以后不自动提示</button>
              </div>
              <button v-if="guideMode === 'active' && saveReceipt?.guide?.session === guideSession" type="button" class="guide-entry" :disabled="recordsLoading || busy" @click="$emit('retry')">重新核对保存结果</button>
              <button v-if="guideTopic" type="button" class="guide-entry" @click="openGuideTopics">选择其他主题</button>
            </section>

            <details class="entry-guide">
              <summary><CircleHelp :size="16" aria-hidden="true" />抽数怎么填写？</summary>
              <p>{{ pullSpanHelp }}</p>
              <p>出货后请按游戏中当下的真实状态核对距保底；本页不会自动重置进度，也不会从其他卡池继承。没有出绝密时只改当前保底，不新增出货。</p>
              <p>已知累计 = 历史基准 + 普通记录的已知间隔 + 批次总量 + 当前进度。未知资料不贡献确定抽数，也不代表实际抽了 0 次。批次内记录不重复累加；基准若已含这段历史，继续新增可能重复计数，请先核对备份。本页未提供历史基准、总量批次或 120 抽窗口的旧补录入口。</p>
              <p>进度条与密探视图展示同一组记录，头像左下角数字是这次出货的间隔，不是获得次数。新增用「保存这笔」直接提交；已有记录修改后点完成，再统一保存。未读回核对前不算确认保存。</p>
              <p>取消单条编辑保留原记录；关闭整个窗口丢弃未提交草稿。删除仅在保存后生效：独立记录减去本条已知抽数，相邻间隔和批次总量不变。教程不会替你删除或导入数据。</p>
            </details>

            <section class="records-section" aria-labelledby="records-title">
              <section v-if="guideVisible && guideTopic && guideTopic !== 'progress' && (!activeRow || guideTopic === 'explore') && !['topics', 'invitation'].includes(guideMode)" class="first-record-guide" aria-label="招募档案使用教程">
                <p role="status">{{ guideMessage }}</p>
                <button type="button" class="guide-entry" @click="openGuideTopics">选择其他主题</button>
                <button v-if="guideMode === 'active' && saveReceipt?.guide?.session === guideSession" type="button" class="guide-entry" :disabled="recordsLoading || busy" @click="$emit('retry')">重新核对保存结果</button>
              </section>
                <div v-show="dailyMode === 'record'" class="entry-shortcuts" role="group" aria-label="快速登记出货">
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
                    :disabled="busy || readOnly || recordsLoading || !!recordsError || !!unverifiedSave || !initialized || (!canRecord && (!activeRow || originals.has(activeRow.event_id))) || (!activeRow && newCount >= 120)"
                    @click="add(agent.id)"
                  >
                    <OperatorAvatar class="quick-up-avatar" :avatar="agentAvatar(agent)" :name="agent.name" :rarity="5" aria-hidden="true" />
                    <span class="quick-up-mark" aria-hidden="true">UP</span>
                  </button>
                  <button
                    type="button"
                    class="add-record"
                    :aria-pressed="choosingAgent"
                    :class="{ 'is-selected': choosingAgent }"
                    :disabled="busy || readOnly || recordsLoading || !!recordsError || !!unverifiedSave || !initialized || (!canRecord && (!activeRow || originals.has(activeRow.event_id))) || (!activeRow && newCount >= 120)"
                    @click="add()"
                  >
                    <Plus :size="17" aria-hidden="true" />
                    {{ quickUpAgents.length ? '其他密探' : '新增记录' }}
                  </button>
                </div>

              <div
                v-if="activeRow"
                ref="entryComposer"
                class="entry-composer"
                role="group"
                :aria-label="originals.has(activeRow.event_id) ? '编辑抽卡记录' : '添加抽卡记录'"
              >
                <p v-if="guideMode === 'active' && ['record', 'maintain'].includes(guideTopic)" class="guide-field-hint" role="status">{{ guideMessage }}</p>
                <div v-if="choosingAgent" class="agent-picker">
                  <label class="agent-search">
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
                      <button type="button" class="agent-picker-cancel" :disabled="busy" @click="cancelEntry">取消</button>
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
                  <div class="agent-picker-results" role="group" aria-label="选择密探">
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
                      <OperatorAvatar class="agent-choice-avatar" :avatar="agentAvatar(agent)" :name="agent.name" :rarity="5" aria-hidden="true" />
                      <span>{{ agent.name }}</span>
                    </button>
                    <p v-if="!filteredPickerAgents.length" class="agent-picker-empty">没有符合筛选条件的密探</p>
                  </div>
                </div>
                <div v-if="activeRow.agent_id" class="compact-entry-row">
                  <div class="selected-agent-summary" aria-live="polite">
                    <OperatorAvatar class="selected-agent-avatar" :avatar="agentAvatar(selectedAgent(activeRow))" :name="selectedAgent(activeRow)?.name || activeRow.agent_id" :rarity="5" aria-hidden="true" />
                    <span class="selected-agent-copy"><small>已选择密探</small><strong>{{ selectedAgent(activeRow)?.name || activeRow.agent_id }}</strong></span>
                  </div>
                  <label class="pull-count-field">
                    <span>本次出货抽数</span>
                    <input ref="pullSpanInput" v-model="activeRow.pull_span" type="number" inputmode="numeric" min="1" :max="MAX_EVENT_PULLS" step="1" placeholder="不知道可留空" aria-describedby="pull-span-help" :disabled="busy || readOnly || recordsLoading" @input="limitPullSpan">
                  </label>
                  <div class="composer-actions">
                    <button v-if="isStoredRow(activeRow)" type="button" class="entry-delete" :disabled="busy || readOnly || recordsLoading" @click="remove(activeRow)">删除记录</button>
                    <button type="button" :disabled="busy" @click="cancelEntry">取消</button>
                    <button type="button" class="primary" :aria-label="originals.has(activeRow.event_id) ? '完成编辑当前记录' : '保存这笔'" :disabled="busy || readOnly || recordsLoading || ((!!recordsError || !!unverifiedSave) && !originals.has(activeRow.event_id))" @click="originals.has(activeRow.event_id) ? confirmRecord() : submit()">{{ busy ? '保存中…' : originals.has(activeRow.event_id) ? '完成' : '保存这笔' }}</button>
                  </div>
                </div>
                <p v-if="activeRow.agent_id" id="pull-span-help" class="composer-note">{{ pullSpanHelp }}</p>
                <p v-if="activeRow.batch_id" class="composer-note">批次记录：修改本条不会改变批次总抽数。</p>
                <p v-if="originals.has(activeRow.event_id)" class="composer-note">完成编辑只更新草稿，核对后点击底部保存修改。</p>
              </div>

              <div class="records-toolbar">
                <div class="record-view-switch" role="group" aria-label="本池抽卡记录视图">
                  <button type="button" :class="{ 'is-selected': recordView === 'progress' }" :aria-pressed="recordView === 'progress'" @click="switchRecordView('progress')">进度条视图</button>
                  <button type="button" :class="{ 'is-selected': recordView === 'agents' }" :aria-pressed="recordView === 'agents'" @click="switchRecordView('agents')">密探视图</button>
                </div>

              </div>

              <div class="records-heading">
                <span class="section-kicker">抽卡档案</span>
                <h3 id="records-title">本池抽卡进度</h3>
                <p>{{ rows.length }} 条{{ hasMore ? ' · 还有更早记录' : '' }}</p>
              </div>
              <label v-if="rows.length" class="record-search"><span>查找已有记录</span><input v-model="recordSearch" type="search" placeholder="按密探名字查找" autocomplete="off"></label>

              <ol v-if="displayRows.length && recordView === 'progress'" class="record-feed">
                <li v-for="row in displayRows" :key="row.event_id" class="gacha-record" :class="{ 'is-saved': isSavedRow(row) }">
                  <OperatorAvatar
                    class="record-avatar"
                    :avatar="agentAvatar(selectedAgent(row))"
                    :name="selectedAgent(row)?.name || row.agent_id"
                    :rarity="5"
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="record-detail"
                    :disabled="busy || readOnly || recordsLoading || !!activeRow"
                    :aria-label="recordLabel(row)"
                    @click="edit(row)"
                  >
                    <span class="record-track">
                      <span class="record-bar" :class="barClass(row)" :style="{ width: spanWidth(row) }">
                        <span class="pull-result">
                          <b>{{ row.pull_span === '' ? '未知' : row.pull_span }}</b>
                          <small>{{ row.pull_span === '' ? '抽数' : '抽' }}</small>
                        </span>
                      </span>
                      <span v-if="row.up_status === 'non_up'" class="non-up-stamp" aria-hidden="true">歪</span>
                      <span v-if="row.batch_id" class="status-pill is-neutral" aria-hidden="true">批次</span>
                      <span v-if="isChanged(row)" class="pending-mark" aria-hidden="true">待保存</span>
                      <span v-else-if="isSavedRow(row)" class="saved-mark">本笔已保存</span>
                    </span>
                  </button>
                </li>
              </ol>

              <ol v-else-if="displayRows.length" class="agent-record-grid" aria-label="密探视图">
                <li v-for="row in displayRows" :key="row.event_id" class="agent-record-card" :class="{ 'is-saved': isSavedRow(row) }">
                  <button
                    type="button"
                    class="agent-record-detail"
                    :disabled="busy || readOnly || recordsLoading || !!activeRow"
                    :aria-label="recordLabel(row)"
                    @click="edit(row)"
                  >
                    <span class="agent-record-portrait">
                      <OperatorAvatar
                        class="agent-record-avatar"
                        :avatar="agentAvatar(selectedAgent(row))"
                        :name="selectedAgent(row)?.name || row.agent_id"
                        :rarity="5"
                        aria-hidden="true"
                      />
                      <span class="agent-pull-badge" :class="barClass(row)" aria-hidden="true">{{ row.pull_span === '' ? '未知' : row.pull_span + '抽' }}</span>
                      <span v-if="row.up_status === 'non_up'" class="agent-non-up" aria-hidden="true">歪</span>
                    </span>
                    <span class="agent-record-name">{{ selectedAgent(row)?.name || row.agent_id }}</span>
                    <span class="agent-record-flags" aria-hidden="true">
                      <span v-if="row.batch_id" class="agent-record-flag">批次</span>
                      <span v-if="isChanged(row)" class="agent-record-flag is-pending">待保存</span>
                      <span v-else-if="isSavedRow(row)" class="agent-record-flag">本笔已保存</span>
                    </span>
                  </button>
                </li>
              </ol>

              <div v-else-if="initialized && !recordsLoading && !recordsError" class="records-empty">
                <strong>{{ recordSearch ? '没有找到这位密探的记录' : '还没有抽卡记录' }}</strong>
                <p>{{ recordSearch ? '换个名字，或加载更早记录；不需要重复登记。' : '从上方选择「抽到了绝密」开始记；没出绝密只更新保底。' }}</p>
              </div>

              <div class="records-tail">
                <p v-if="rows.length && recordView === 'progress'" class="bar-legend">色条按 40 抽刻度辅助比较间隔；绿色 ≤20、金色 21–30、红色 ≥31，实际抽数始终以色条内数字为准。</p>
                <p v-else-if="rows.length" class="bar-legend">头像左下角显示这条出货记录的抽数；同一密探多次出货会分别排列，未知抽数显示“未知”。</p>
                <button v-if="hasMore" type="button" class="load-more" :disabled="busy || recordsLoading" @click="$emit('load-more')">加载更早记录</button>
              </div>
            </section>

            <p v-if="deletedIds.length" class="change-note">保存后将移除 {{ deletedIds.length }} 条已有出货；独立记录会减去该条已知抽数，相邻记录与批次总量不变。</p>
            <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>
          </div>

          <footer v-show="(!dailyMode || pendingCount || readOnly) && (dailyMode !== 'progress' || recordPendingCount > 0)" :class="{ 'is-entry-active': !!activeRow }">
            <p class="footer-state" aria-live="polite">
              <template v-if="activeRow">{{ originals.has(activeRow.event_id) ? '正在编辑一条记录' : '正在登记一条记录' }}</template>
              <template v-else-if="pendingCount">{{ pendingCount }} 项修改尚未保存</template>
              <template v-else>修改将在保存后生效</template>
            </p>
            <div class="footer-actions">
              <button type="button" :disabled="busy" @click="close">取消</button>
              <button class="primary" type="submit" :disabled="busy || readOnly || recordsLoading || !!recordsError || !!unverifiedSave || !initialized || !!activeRow || !pendingCount">
                {{ busy ? '保存中…' : pendingCount ? `保存 ${pendingCount} 项修改` : '保存修改' }}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CircleHelp, Plus, X } from '@lucide/vue'
import RecruitmentGuideTopics from './RecruitmentGuideTopics.vue'
import OperatorAvatar from '../../components/operator/OperatorAvatar.vue'
import operatorPortraits from '../../data/operatorPortraits.json'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { matchesOperatorSearch, matchesProfSubFilter, subProfOptions as deriveSubProfOptions, tokens } from '../../utils/operatorFilters.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { entryInput, MAX_EVENT_PULLS, poolAgentOptions, progressFromRemaining, recruitmentPoolCatalog, resolveRecruitmentAgent } from './rules.js'

const props = defineProps({ open: Boolean, pool: Object, poolSummary: Object, records: { type: Array, default: () => [] }, recordsLoading: Boolean, recordsError: String, recordsRevision: Number, hasMore: Boolean, agents: { type: Array, default: () => [] }, catalog: { type: Array, default: () => [] }, busy: Boolean, readOnly: Boolean, canRecord: Boolean, serverError: String, requestVersion: Number, guideOwner: String, guideAccount: String, archiveEventCount: Number, saveReceipt: Object })
const emit = defineEmits(['close', 'save', 'load-more', 'retry', 'guide-dismiss'])
const panel = ref(null), editorBody = ref(null), entryComposer = ref(null), errorSummary = ref(null), error = ref(''), rows = ref([]), remaining = ref(''), initialRemaining = ref(''), activeRow = ref(null), choosingAgent = ref(false), agentSearch = ref(''), agentSearchInput = ref(null), agentProfFilter = ref('all'), agentSubProfFilter = ref('all'), pullSpanInput = ref(null), remainingInput = ref(null), initialized = ref(false), deletedIds = ref([]), recordView = ref('progress')
const originals = reactive(new Map())
const dailyMode = ref(''), recordSearch = ref('')
const showProgress = computed(() => !!dailyMode.value || !!activeRow.value || pendingCount.value > 0)
const pullSpanHelp = '不是卡池累计抽数。例如上次绝密后，第 20 抽又出绝密，就填 20。首条也只填你确知的出货间隔，不知道就留空，系统保留未知。同一密探再次出货可继续新增记录。'
const guideMode = ref('hidden'), guideTopic = ref(''), guideSession = ref(''), viewedRecordViews = ref([])
const emptyGuidePreference = () => ({ tutorialCompleted: false, tutorialStarted: false, dismissedForNow: null, disableAutoGuide: false, completedTopics: {}, viewedTopics: {} })
const guidePreference = ref(emptyGuidePreference())
const guideVisible = computed(() => guideMode.value !== 'hidden')
const guideStorageKey = computed(() => props.guideOwner && props.guideAccount ? `yuanhub:recruitment-first-record:${encodeURIComponent(props.guideOwner)}:${encodeURIComponent(props.guideAccount)}` : '')
const recordsReady = computed(() => initialized.value && !props.recordsLoading && !props.recordsError)
const guideMessage = computed(() => {
  if (guideMode.value === 'invitation') return '第一次使用？可按你现在的情况选择教程，或直接使用。不需要为学习创建记录。'
  if (guideMode.value === 'topics') return '选择你现在想了解的主题；没有真实抽卡动作时，可以只查看帮助或随时关闭。'
  if (guideMode.value === 'completed') {
    if (guideTopic.value === 'explore') return '查看引导完成：两种视图展示的是同一组真实记录，没有新增或保存数据。以后从时间线找池，点记录维护。'
    if (guideTopic.value === 'progress') return '当前保底进度已保存并读回确认。以后抽了没出绝密，只需在实际卡池更新当前进度。'
    if (guideTopic.value === 'maintain') return '这条已有记录的修改已保存并读回确认。可以继续切换视图核对，或关闭窗口返回时间线。'
    return '这条出货记录已保存并读回确认。下方两种视图均可查看；同一密探再次真实出货可另加一条。'
  }
  if (!recordsReady.value) return '正在确认本池真实记录；读取失败时可重新读取，也可随时关闭教程。'
  if (props.busy) return '正在保存真实修改；可随时关闭教程，请勿重复提交。'
  if (props.serverError || error.value) return '保存未成功或回读尚未确认，真实草稿已保留。请核对错误后重试，也可关闭教程。'
  if (props.saveReceipt?.guide?.session === guideSession.value) return '保存请求已成功，结果尚未确认时不必重复登记。请重新核对保存结果；只有服务端回读一致才算完成。'
  if (guideTopic.value === 'explore') return '已打开你选择的卡池。已知抽数是可确认资料的合计，距保底是当前进度；请亲自切换「进度条视图」和「密探视图」。头像左下角数字是出货间隔，卡片 UP ×N 才是获得次数。'
  if (props.readOnly) return '当前档案只读，可以切换视图和查看帮助，暂不能保存实操；请核对页头账号和游戏。'
  if (guideTopic.value === 'progress' && activeRow.value) return '当前还有正在编辑的记录。请先保存这笔、完成编辑或取消本条，再核对真实当前进度。'
  if (guideTopic.value === 'progress') return remaining.value === initialRemaining.value
    ? '依据游戏里的真实进度修改上方「距离下次保底」，再点击「保存保底进度」。例如已垫 7 抽就填 33；没有出绝密无需新增记录，不能凭教程猜抽数。'
    : '当前进度已修改，尚未保存。核对「已垫」与游戏一致后，点击「保存保底进度」；服务器读回一致才完成。'
  if (guideTopic.value === 'maintain') {
    if (activeRow.value && !originals.has(activeRow.value.event_id)) return '当前正在整理新增草稿，请先保存这笔或取消本条，再点需要修改的已有记录；切换教程不会清空草稿。'
    if (activeRow.value && originals.has(activeRow.value.event_id)) return '按真实资料修改这条记录的出货间隔；不知道可留空。点「完成」只更新草稿，之后还须底部保存；批次记录修改不改变批次总量。'
    if (rows.value.some(row => originals.has(row.event_id) && isChanged(row))) return '已有记录的修改仍待保存，请核对当前保底，然后点击底部保存。'
    if (!originals.size) return props.hasMore ? '请加载更多真实历史记录，再点需要修改的一条；仅浏览帮助不会标记保存成功。' : '本池没有可修改记录。可以关闭窗口，回时间线按年份找到历史池；本页没有批次总量或 120 抽窗口的补录入口。无需新建记录来完成学习。'
    return '点下方需要修改的真实记录。仅浏览帮助不算写入成功；不知道间隔可保留未知，修改后「完成 → 底部保存」。本页不提供历史基准、总量批次或 120 抽窗口补录入口。'
  }
  if (!props.canRecord) return '此池已停用、属于历史快照或目录尚不可用，暂不能新增出货。可切换维护主题查看已有记录，或关闭窗口重新选实际卡池。'
  if (activeRow.value && originals.has(activeRow.value.event_id)) return '当前正在修改已有记录，请完成或取消这次编辑；若要学习维护，可选择「补录或修改以前的记录」。新增出货须是下一次真实抽卡结果。'
  if (choosingAgent.value) return '在下方真实搜索框中找到并选择这次出货的密探。'
  if (activeRow.value?.agent_id) return '填写真实出货间隔，不知道可留空。核对上方当前保底，点击「保存这笔」；读回一致才完成。'
  if (newCount.value) return '这笔仍在真实草稿中，尚未保存。核对当前保底后点击底部保存；出现「待保存」不代表服务器已有记录。'
  return '点击这次出货的 UP 密探快捷按钮，或「其他密探」选择实际密探。同一密探再次出货可新增，已有记录不妨碍学习。'
})
function persistGuidePreference() {
  if (!guideStorageKey.value) return
  try { localStorage.setItem(guideStorageKey.value, JSON.stringify(guidePreference.value)) } catch { /* Storage is optional for this session. */ }
}
function dismissGuide(disableAutoGuide = false) {
  const focusedField = panel.value?.contains(document.activeElement) && document.activeElement.matches('input, select, textarea') ? document.activeElement : null
  const fieldRef = focusedField === pullSpanInput.value ? pullSpanInput : focusedField === agentSearchInput.value ? agentSearchInput : focusedField === remainingInput.value ? remainingInput : null
  guideMode.value = 'hidden'
  guidePreference.value.dismissedForNow = Date.now()
  if (disableAutoGuide === true) guidePreference.value.disableAutoGuide = true
  persistGuidePreference()
  emit('guide-dismiss')
  nextTick(() => {
    if (fieldRef?.value || focusedField?.isConnected) (fieldRef?.value || focusedField).focus({ preventScroll: true })
    else if (!panel.value?.contains(document.activeElement)) panel.value?.querySelector('.editor-header .guide-entry')?.focus({ preventScroll: true })
  })
}
function openGuideTopics() {
  guideMode.value = 'topics'; guideTopic.value = ''
  nextTick(() => panel.value?.querySelector('[data-guide-topic]')?.focus({ preventScroll: true }))
}
function startGuide(topic = 'record', retry = true) {
  if (!['explore', 'progress', 'record', 'maintain'].includes(topic)) return
  guideTopic.value = topic; guideMode.value = 'active'; guideSession.value = crypto.randomUUID(); viewedRecordViews.value = []
  guidePreference.value.tutorialStarted = true
  if (!activeRow.value && ['record', 'progress'].includes(topic)) dailyMode.value = topic
  persistGuidePreference()
  if (retry) emit('retry')
  nextTick(() => {
    if (!panel.value?.contains(document.activeElement)) panel.value?.querySelector('.record-view-switch button')?.focus({ preventScroll: true })
  })
}
function switchRecordView(view) {
  recordView.value = view
  if (guideMode.value === 'active' && guideTopic.value === 'explore' && recordsReady.value) {
    viewedRecordViews.value = [...new Set([...viewedRecordViews.value, view])]
    if (viewedRecordViews.value.length === 2) {
      guideMode.value = 'completed'
      guidePreference.value.viewedTopics.explore = true
      persistGuidePreference()
    }
  }
}
function entryMatches(event, entry) {
  return event && !event.deleted_at && event.pool_id === props.pool?.pool_id && event.event_id === entry.event_id && event.agent_snapshot.agent_id === entry.agent_id && event.pull_span === entry.pull_span && event.up_status === entry.up_status && (event.acquired_date || null) === entry.acquired_date && (event.note || null) === entry.note
}
const receiptVerified = computed(() => {
  const receipt = props.saveReceipt
  return !!receipt && recordsReady.value && !props.busy && !props.serverError && Number.isInteger(receipt.revision) && props.recordsRevision >= receipt.revision && receipt.pool_id === props.pool?.pool_id && props.pool.progress === 40 - receipt.remaining_pulls && receipt.entries.every(entry => props.records.some(event => entryMatches(event, entry))) && (!receipt.deleted_event_ids.length || !props.hasMore) && receipt.deleted_event_ids.every(id => !props.records.some(event => event.event_id === id && !event.deleted_at))
})
const unverifiedSave = computed(() => props.saveReceipt && !receiptVerified.value)
const savedMessage = computed(() => {
  const receipt = props.saveReceipt
  if (!receipt?.entries.length && !receipt?.deleted_event_ids.length) return '当前保底已保存'
  const names = receipt.entries.map(entry => `${selectedAgent(entry)?.name || entry.agent_id}（${entry.pull_span == null ? '出货间隔未知' : entry.pull_span + '抽出货'}）`).join('、')
  return [names && `已保存：${names}`, receipt.deleted_event_ids.length && `已移除 ${receipt.deleted_event_ids.length} 条记录`].filter(Boolean).join('；')
})
const isSavedRow = row => receiptVerified.value && !isChanged(row) && props.saveReceipt.entries.some(entry => entry.event_id === row.event_id)
watch(guideStorageKey, () => {
  guideMode.value = 'hidden'; guideTopic.value = ''
  guidePreference.value = emptyGuidePreference()
  try {
    const saved = JSON.parse(localStorage.getItem(guideStorageKey.value) || 'null')
    if (saved) guidePreference.value = { tutorialCompleted: saved.tutorialCompleted === true, tutorialStarted: saved.tutorialStarted === true, dismissedForNow: typeof saved.dismissedForNow === 'number' ? saved.dismissedForNow : null, disableAutoGuide: saved.disableAutoGuide === true, completedTopics: saved.completedTopics?.constructor === Object ? saved.completedTopics : {}, viewedTopics: saved.viewedTopics?.constructor === Object ? saved.viewedTopics : {} }
  } catch { /* Unavailable or malformed storage keeps the editor usable. */ }
}, { immediate: true, flush: 'sync' })
watch([recordsReady, receiptVerified, () => props.archiveEventCount], () => {
  if (!props.open || !recordsReady.value) return
  const receipt = props.saveReceipt
  if (guideMode.value === 'active' && receiptVerified.value && receipt.guide?.session === guideSession.value && receipt.guide?.target) {
    guideMode.value = 'completed'
    guidePreference.value.completedTopics[guideTopic.value] = true
    if (guideTopic.value === 'record') guidePreference.value.tutorialCompleted = true
    persistGuidePreference()
  } else if (guideMode.value === 'hidden' && guideStorageKey.value && props.canRecord && !props.readOnly && props.archiveEventCount === 0 && !props.records.length && !props.hasMore && !guidePreference.value.tutorialCompleted && !guidePreference.value.tutorialStarted && !guidePreference.value.dismissedForNow && !guidePreference.value.disableAutoGuide) {
    guideMode.value = 'invitation'
  }
})
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
  initialRemaining.value = typeof remaining.value === 'number' ? props.saveReceipt.remaining_pulls : String(props.saveReceipt.remaining_pulls)
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
const quickUpAgents = computed(() => options.value.filter(agent => agent.poolSlot))
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
function close() { if (!props.busy) emit('close') }
defineExpose({ startGuide, openGuideTopics, hasDraft: () => props.open && (remaining.value !== initialRemaining.value || !!activeRow.value || deletedIds.value.length > 0 || rows.value.some(row => !originals.has(row.event_id) || isChanged(row))) })
const displayRows = computed(() => rows.value.filter(row => originals.has(row.event_id)).concat(rows.value.filter(row => !originals.has(row.event_id))).reverse().filter(row => matchesOperatorSearch(selectedAgent(row) || { name: row.agent_id }, recordSearch.value)))
const tailProgress = computed(() => Number.isInteger(Number(remaining.value)) && Number(remaining.value) >= 1 && Number(remaining.value) <= 40 ? 40 - Number(remaining.value) : null)
const barClass = row => row.pull_span === '' ? 'bar-unknown' : Number(row.pull_span) <= 20 ? 'bar-low' : Number(row.pull_span) <= 30 ? 'bar-mid' : 'bar-high'
const spanWidth = row => row.pull_span === '' ? '100%' : Math.min(Number(row.pull_span) / 40, 1) * 100 + '%'
const isChanged = row => JSON.stringify(entryInput(row)) !== originals.get(row.event_id)
function recordLabel(row) {
  const agent = selectedAgent(row)
  const pulls = row.pull_span === '' ? '抽数未知' : row.pull_span + '抽出货'
  const status = row.up_status === 'non_up' ? '，非UP' : (agent?.poolSlot || row.up_status === 'up') ? '，UP' : ''
  return '编辑' + (agent?.name || row.agent_id) + '，' + pulls + status + (row.batch_id ? '，批次记录' : '')
}
const recordPendingCount = computed(() => rows.value.filter(row => isChanged(row)).length + deletedIds.value.length)
const pendingCount = computed(() => recordPendingCount.value + (remaining.value !== initialRemaining.value ? 1 : 0))
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
  if (!props.open || !editorBody.value || (!activeRow.value && document.activeElement !== remainingInput.value)) return
  const viewport = window.visualViewport
  const visibleTop = Math.max(viewport?.offsetTop || 0, panel.value?.querySelector('.editor-header')?.getBoundingClientRect().bottom || 0) + ENTRY_VISIBLE_TOP_GAP
  const visibleBottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - ENTRY_VISIBLE_BOTTOM_GAP
  const focusedField = panel.value?.contains(document.activeElement) && document.activeElement.matches('input') ? document.activeElement : null
  const bounds = (focusedField || entryComposer.value).getBoundingClientRect()
  const rect = { top: bounds.top, bottom: bounds.bottom, height: bounds.height }
  const availableHeight = Math.max(0, visibleBottom - visibleTop)
  const actions = activeRow.value ? entryComposer.value?.querySelector('.composer-actions') : panel.value?.querySelector('.progress-actions')
  const actionsRect = actions?.getBoundingClientRect()
  if (actionsRect && actionsRect.bottom >= rect.bottom && actionsRect.bottom - rect.top <= availableHeight) {
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
  nextTick(() => {
    const target = preferPulls ? pullSpanInput.value : agentSearchInput.value || entryComposer.value?.querySelector('.agent-choice')
    target?.focus()
    scheduleEntryVisibility()
  })
}
function add(agentId = '') {
  if (props.busy || props.readOnly || !recordsReady.value || unverifiedSave.value || !props.canRecord) return
  dailyMode.value = 'record'
  recordSearch.value = ''
  error.value = ''
  if (!activeRow.value) activeRow.value = { event_id: crypto.randomUUID(), agent_id: '', pull_span: '', up_status: 'unknown', acquired_date: null, note: null }
  if (agentId) {
    activeRow.value.agent_id = agentId
    choosingAgent.value = false
    focusEntry(true)
    return
  }
  activeRow.value.agent_id = ''
  resetAgentFilters()
  choosingAgent.value = true
  focusEntry(false)
}
function chooseOtherAgent(agentId) {
  if (!activeRow.value) return
  activeRow.value.agent_id = agentId
  choosingAgent.value = false
  resetAgentFilters()
  focusEntry(true)
}
function edit(row) { error.value = ''; activeRow.value = { ...row }; choosingAgent.value = false; focusEntry(true) }
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
function cancelEntry() { activeRow.value = null; choosingAgent.value = false; resetAgentFilters(); nextTick(() => panel.value?.querySelector('.add-record')?.focus()) }
function confirmRecord() {
  if (!activeRow.value || props.busy || props.readOnly || props.recordsLoading) return false
  error.value = ''
  try {
    const entry = entryInput(activeRow.value)
    if (!options.value.some(agent => agent.id === entry.agent_id)) throw new Error('请选择本池 UP 或本游戏绝密密探')
    const index = rows.value.findIndex(row => row.event_id === entry.event_id)
    if (index < 0) rows.value.push({ ...activeRow.value })
    else rows.value.splice(index, 1, { ...activeRow.value })
    activeRow.value = null
    choosingAgent.value = false
    nextTick(() => (panel.value?.querySelector('.record-detail, .agent-record-detail') || panel.value?.querySelector('.add-record'))?.focus())
    return true
  } catch (err) { error.value = err.message; nextTick(() => errorSummary.value?.focus()); return false }
}
function remove(row) {
  if (activeRow.value?.event_id === row.event_id) {
    activeRow.value = null
    choosingAgent.value = false
    resetAgentFilters()
  }
  if (originals.has(row.event_id) && !deletedIds.value.includes(row.event_id)) deletedIds.value.push(row.event_id)
  rows.value = rows.value.filter(item => item.event_id !== row.event_id)
  nextTick(() => (panel.value?.querySelector('.record-detail, .agent-record-detail') || panel.value?.querySelector('.add-record'))?.focus())
}
watch(() => props.open, open => {
  if (!open) {
    if (guideVisible.value) dismissGuide()
    resetKeyboardAvoidance()
    return
  }
  rows.value = []; activeRow.value = null; choosingAgent.value = false; resetAgentFilters(); deletedIds.value = []; originals.clear(); initialized.value = false; error.value = ''; requestId = ''; dailyMode.value = ''; recordSearch.value = ''
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
watch([rows, activeRow, deletedIds, remaining, () => props.requestVersion], () => { requestId = '' }, { deep: true, flush: 'sync' })
onMounted(() => {
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', onViewportChange)
  viewport?.addEventListener('scroll', onViewportChange)
  window.addEventListener('resize', onViewportChange)
  if (props.open) scheduleEntryVisibility()
})
onBeforeUnmount(() => {
  const viewport = window.visualViewport
  viewport?.removeEventListener('resize', onViewportChange)
  viewport?.removeEventListener('scroll', onViewportChange)
  window.removeEventListener('resize', onViewportChange)
  resetKeyboardAvoidance()
})
useModalFocus(computed(() => props.open), panel, { initialFocus: () => panel.value?.querySelector('.daily-choices button:not(:disabled), .record-view-switch button'), onEscape: () => guideVisible.value ? dismissGuide() : close() })
async function submit() {
  if (props.busy || props.readOnly || props.recordsLoading || props.recordsError || !initialized.value || !props.pool || unverifiedSave.value) return
  if (activeRow.value && !confirmRecord()) return
  if (!pendingCount.value) return
  error.value = ''
  try {
    if (remaining.value === '') throw new Error('保底进度未知，暂不能保存。请核对游戏里的真实距保底抽数；可以关闭教程保留当前窗口草稿，不要猜值。')
    progressFromRemaining(remaining.value)
    const entries = rows.value.map(row => {
      const input = entryInput(row)
      if (!options.value.some(agent => agent.id === input.agent_id)) throw new Error('请选择本池 UP 或本游戏绝密密探')
      if (!originals.has(row.event_id)) {
        if (!props.canRecord) throw new Error('此卡池暂不能新增出货')
        const definition = recruitmentPoolCatalog(props.pool, props.catalog) || props.pool.snapshot
        input.up_status = selectedAgent(row)?.poolSlot ? 'up' : definition.up_status === 'verified' && definition.up_agent_ids?.length && !definition.unmapped_up_agent_names?.length ? 'non_up' : 'unknown'
      }
      return input
    }).filter(entry => JSON.stringify(entry) !== originals.get(entry.event_id))
    if (entries.length > 120 || deletedIds.value.length > 120) throw new Error('每次最多维护120条出货，请分次保存')
    if (!requestId) requestId = crypto.randomUUID()
    let target = null
    if (guideTopic.value === 'progress' && remaining.value !== initialRemaining.value) target = 'progress'
    if (guideTopic.value === 'record') {
      const prior = props.saveReceipt?.guide
      target = entries.find(entry => !originals.has(entry.event_id) || (prior?.session === guideSession.value && entry.event_id === prior.target))?.event_id
    }
    if (guideTopic.value === 'maintain') target = entries.find(entry => originals.has(entry.event_id))?.event_id
    const guide = guideMode.value === 'active' ? { topic: guideTopic.value, session: guideSession.value, target } : null
    emit('save', { requestId, revision: props.recordsRevision, operation: 'pool_records_save', guide, data: { pool_id: props.pool.pool_id, entries, deleted_event_ids: deletedIds.value.slice(), remaining_pulls: Number(remaining.value) } })
  } catch (err) { error.value = err.message; await nextTick(); errorSummary.value?.focus() }
}
</script>

<style scoped>
.modal-mask {
  --keyboard-inset: 0px;
  bottom: var(--keyboard-inset);
  z-index: var(--z-overlay-panel);
  padding: 12px;
}

.pool-editor {
  --editor-body-bottom-space: 24px;
  --keyboard-inset: 0px;

  display: flex;
  flex-direction: column;
  width: min(780px, 100%);
  max-height: calc(100dvh - 24px - var(--keyboard-inset));
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface);
  color: var(--ink);
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--line);
  background: var(--cream);
}

.editor-title {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.pool-confirmation, .daily-entry p, .save-result p { color: var(--ink-60); font-size: 12px; line-height: 1.7; margin-top: 6px; }
.daily-entry { margin-bottom: 16px; }
.daily-entry h3 { font: 800 18px/1.5 var(--font-s); }
.daily-choices { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.daily-choices button[aria-pressed="true"] { background: var(--tea); border-color: var(--tea); color: var(--cream); }
.save-result { margin-bottom: 16px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); }
.save-result.is-confirmed, .is-saved { background: color-mix(in srgb, var(--yellow) 16%, var(--surface)); }
.saved-mark { flex: none; color: var(--tea); font-size: 10px; }
.record-search { margin-bottom: 12px; }
.progress-actions { margin: 12px 0; }

.guide-exit { flex: none; min-height: 44px; }
.first-record-guide { margin-bottom: 14px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); }
.first-record-guide p, .guide-field-hint { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.guide-field-hint { margin-bottom: 10px; }
.guide-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.guide-actions button, .guide-entry { min-height: 44px; }
.guide-entry { margin-top: 6px; }

.editor-eyebrow,
.section-kicker {
  display: block;
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .14em;
}

h2,
h3,
p {
  margin: 0;
}

h2 {
  margin-top: 5px;
  font: 900 25px/1.45 var(--font-s);
}

.pool-editor form {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 20px 22px var(--editor-body-bottom-space);
  scroll-padding: 16px 0 var(--editor-body-bottom-space);
}

.state-note,
.change-note {
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--cream);
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.7;
}

.change-note {
  margin-top: 18px;
}

.progress-card {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(160px, .8fr) minmax(170px, .8fr);
  align-items: center;
  gap: 18px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line));
  border-radius: 16px;
  background: linear-gradient(145deg, var(--cream), var(--surface));
}

.progress-copy h3,
.records-heading h3 {
  margin-top: 4px;
  font: 800 18px/1.45 var(--font-s);
}

.progress-copy p {
  margin-top: 7px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.7;
}

.progress-overview {
  min-width: 0;
}

.progress-number > span {
  color: var(--ink-60);
  font-size: 11px;
}

.progress-number > div {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 2px;
}

.progress-number strong {
  font: 700 30px/1 var(--font-d);
}

.progress-number small {
  color: var(--ink-60);
  font-size: 12px;
}

.progress-rail,
.record-track {
  overflow: hidden;
  width: 100%;
  background: color-mix(in srgb, var(--line) 62%, transparent);
}

.progress-rail {
  height: 7px;
  margin-top: 10px;
  border-radius: 999px;
}

.progress-rail > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 180ms ease;
}

.remaining-field {
  display: block;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}

.remaining-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.remaining-input input {
  margin: 0;
  font-family: var(--font-d);
  font-size: 20px;
  text-align: center;
}

.remaining-input > span {
  flex: none;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 600;
}

.entry-guide {
  margin: 12px 2px 20px;
  color: var(--ink-60);
  font-size: 12px;
}

.entry-guide summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  color: var(--ink-60);
  font-weight: 700;
  cursor: pointer;
}

.entry-guide p {
  max-width: 62ch;
  padding: 2px 0 0 22px;
  line-height: 1.8;
}

.records-section {
  min-width: 0;
}

.records-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
}

.records-heading {
  margin-bottom: 12px;
}

.records-heading p {
  margin-top: 3px;
  color: var(--ink-60);
  font-size: 11px;
}

.record-view-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  width: fit-content;
  margin: 0;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: color-mix(in srgb, var(--cream) 72%, var(--surface));
}

.record-view-switch button {
  min-width: 104px;
  min-height: 44px;
  padding: 8px 12px;
  border-color: transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--ink-60);
  font-size: 12px;
  font-weight: 800;
}

.record-view-switch button.is-selected {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--cream);
}

.record-view-switch button.is-selected:not(:disabled):hover {
  border-color: var(--tea);
  background: color-mix(in srgb, var(--tea) 92%, var(--surface));
}

button {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 9px 14px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease, opacity 180ms ease;
}

button:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
  background: var(--cream);
}

.close-button {
  display: grid;
  flex: none;
  place-items: center;
  padding: 9px;
  border-radius: 50%;
}

.add-record {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-color: color-mix(in srgb, var(--tea) 32%, var(--line));
  font-size: 13px;
  font-weight: 800;
}

.entry-shortcuts {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 7px;
}

.quick-up-button {
  position: relative;
  display: grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  place-items: center;
  padding: 1px;
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line));
  border-radius: 12px;
  background: var(--cream);
}

.quick-up-button.is-selected,
.add-record.is-selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--yellow) 35%, var(--surface));
  box-shadow: inset 0 0 0 1px var(--accent);
}

.quick-up-avatar {
  width: 38px;
  height: 38px;
}

.quick-up-mark {
  position: absolute;
  right: -4px;
  bottom: -4px;
  display: grid;
  min-width: 20px;
  height: 16px;
  place-items: center;
  padding-inline: 4px;
  border: 1px solid var(--surface);
  border-radius: 999px;
  background: var(--tea);
  color: var(--cream);
  font: 800 8px/1 var(--font-d);
  pointer-events: none;
}

.entry-composer {
  min-width: 0;
  margin: 0 0 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
  border-radius: 12px;
  background: color-mix(in srgb, var(--cream) 70%, var(--surface));
  scroll-margin-block: 16px 24px;
}

.agent-picker {
  margin-bottom: 10px;
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
  min-height: 36px;
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
  min-height: 32px;
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 5px;
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
  font-size: 10px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.compact-entry-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 10px 12px;
}

.selected-agent-summary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 5px 9px 5px 6px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.selected-agent-avatar {
  width: 36px;
  height: 36px;
  flex: none;
}

.selected-agent-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.selected-agent-copy small {
  color: var(--ink-60);
  font-size: 9px;
  font-weight: 700;
  line-height: 1.2;
}

.selected-agent-copy strong {
  max-width: 150px;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pull-count-field {
  display: grid;
  grid-template-columns: max-content 96px;
  align-items: center;
  gap: 9px;
  flex: none;
}

.pull-count-field input {
  width: 96px;
  margin-top: 0;
  padding-inline: 8px;
  font-family: var(--font-d);
  font-size: 18px;
  text-align: center;
}

.pull-count-field > span {
  white-space: nowrap;
}

.composer-note {
  margin-top: 8px;
  color: var(--ink-60);
  font-size: 11px;
  line-height: 1.6;
}

label {
  display: block;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
}

input,
select {
  width: 100%;
  min-width: 0;
  min-height: 46px;
  margin-top: 7px;
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

.composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
}

.composer-actions button {
  min-width: 64px;
  padding-inline: 14px;
}

.composer-actions .entry-delete {
  margin-right: auto;
  border-color: color-mix(in srgb, var(--rouge) 28%, var(--line));
  color: var(--rouge);
  background: color-mix(in srgb, var(--rouge) 4%, var(--surface));
}

.composer-actions .entry-delete:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--rouge) 46%, var(--line));
  background: color-mix(in srgb, var(--rouge) 8%, var(--surface));
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.record-feed {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
  list-style: none;
}

.gacha-record {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border-bottom: 1px solid var(--line);
  transition: background-color 180ms ease;
}

.gacha-record:hover {
  background: color-mix(in srgb, var(--cream) 58%, transparent);
}

.record-avatar {
  width: 40px;
  height: 40px;
}

.record-detail {
  display: flex;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
}

.record-detail:not(:disabled):hover {
  border-color: transparent;
  background: transparent;
}

.record-track {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  min-height: 36px;
  overflow: hidden;
}

.record-bar {
  --bar-color: var(--accent-strong);
  display: flex;
  flex: none;
  align-items: center;
  min-width: 72px;
  max-width: calc(100% - 48px);
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  color: var(--surface);
  background-color: var(--bar-color);
  background-image: repeating-linear-gradient(115deg, transparent 0 14px, rgba(255, 255, 255, .12) 14px 27px);
}

.record-bar.bar-low {
  --bar-color: #367447;
}

.record-bar.bar-mid {
  --bar-color: var(--accent-strong);
}

.record-bar.bar-high {
  --bar-color: var(--rouge);
}

.record-bar.bar-unknown {
  --bar-color: var(--slate-deep);
}

.pull-result {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  white-space: nowrap;
}

.pull-result b {
  font: 700 20px/1 var(--font-d);
}

.pull-result small {
  color: color-mix(in srgb, var(--surface) 88%, transparent);
  font-size: 12px;
  font-weight: 700;
}

.status-pill,
.pending-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
}

.status-pill {
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--line));
  color: var(--accent-strong);
}

.status-pill.is-neutral {
  border-color: var(--line);
  color: var(--ink-60);
}

.non-up-stamp {
  display: grid;
  flex: none;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 2px solid var(--rouge);
  border-radius: 50%;
  color: var(--rouge);
  font: 800 17px/1 var(--font-s);
  transform: rotate(-12deg);
}

.pending-mark {
  background: var(--yellow);
  color: var(--tea);
}

.delete-record {
  display: grid;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  place-items: center;
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--rouge);
}

.delete-record:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--rouge) 30%, transparent);
  background: color-mix(in srgb, var(--rouge) 7%, transparent);
}

.agent-record-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 12px 8px;
  margin: 0;
  padding: 12px 0 0;
  border-top: 1px solid var(--line);
  list-style: none;
}

.agent-record-card {
  position: relative;
  min-width: 0;
}

.agent-record-detail {
  display: grid;
  width: 100%;
  min-width: 0;
  min-height: 0;
  justify-items: center;
  gap: 5px;
  padding: 6px 3px 7px;
  border-color: transparent;
  background: transparent;
  text-align: center;
}

.agent-record-detail:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--accent) 26%, var(--line));
  background: color-mix(in srgb, var(--cream) 60%, transparent);
}

.agent-record-portrait {
  position: relative;
  display: block;
  width: min(100%, 78px);
  aspect-ratio: 1;
}

.agent-record-avatar {
  width: 100%;
  height: 100%;
}

.agent-pull-badge {
  position: absolute;
  bottom: 4px;
  left: 4px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--surface) 80%, transparent);
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(73, 59, 44, .16);
  color: var(--surface);
  background: var(--accent-strong);
  font: 800 11px/1 var(--font-d);
  white-space: nowrap;
}

.agent-pull-badge.bar-low { background: #367447; }
.agent-pull-badge.bar-mid { background: var(--accent-strong); }
.agent-pull-badge.bar-high { background: var(--rouge); }
.agent-pull-badge.bar-unknown { background: var(--slate-deep); }

.agent-non-up {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 2;
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border: 1.5px solid var(--rouge);
  border-radius: 50%;
  color: var(--rouge);
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  font: 800 13px/1 var(--font-s);
  transform: rotate(-10deg);
}

.agent-record-name {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-record-flags {
  display: flex;
  min-height: 17px;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.agent-record-flag {
  display: inline-flex;
  min-height: 17px;
  align-items: center;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-60);
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.agent-record-flag.is-pending {
  border-color: transparent;
  background: var(--yellow);
  color: var(--tea);
}

.records-empty {
  padding: 22px 18px;
  border: 1px dashed var(--line);
  border-radius: 13px;
  background: color-mix(in srgb, var(--cream) 50%, transparent);
  text-align: center;
}

.records-empty strong {
  font: 800 15px/1.5 var(--font-s);
}

.records-empty p {
  margin-top: 5px;
  color: var(--ink-60);
  font-size: 12px;
  line-height: 1.7;
}

.records-tail {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 10px;
}

.bar-legend {
  max-width: 62ch;
  color: var(--ink-60);
  font-size: 10px;
  line-height: 1.7;
}

.load-more {
  flex: none;

  font-size: 12px;
}

.primary {
  border-color: var(--tea);
  background: var(--tea);
  color: var(--cream);
}

.primary:not(:disabled):hover {
  border-color: var(--tea);
  background: color-mix(in srgb, var(--tea) 90%, var(--surface));
}

.inline-action {


  margin-left: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

footer {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--line);
  padding: 14px 20px;
  padding-bottom: max(14px, env(safe-area-inset-bottom));
  background: var(--cream);
}

.footer-state {
  min-width: 0;
  color: var(--ink-60);
  font-size: 11px;
  line-height: 1.5;
}

.footer-actions {
  display: flex;
  flex: none;
  gap: 9px;
}

.form-error {
  margin: 10px 0 14px;
  color: var(--rouge);
  font-size: 13px;
  line-height: 1.8;
}

button:disabled,
input:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: .55;
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
summary:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

@media (max-width: 720px) {
  .progress-card {
    grid-template-columns: minmax(0, 1fr) minmax(145px, .72fr);
  }

  .progress-copy {
    grid-column: 1 / -1;
  }
}

@media (max-width: 520px) {
  .pool-editor {
    --editor-body-bottom-space: 22px;
  }

  .editor-header {
    padding: 18px 16px;
  }

  .editor-body {
    padding: 17px 16px var(--editor-body-bottom-space);
  }

  h2 {
    font-size: 22px;
  }

  .progress-card {
    grid-template-columns: minmax(0, 1fr) minmax(132px, .9fr);
    gap: 14px;
    padding: 15px;
  }

  .compact-entry-row {
    gap: 8px 10px;
  }

  .selected-agent-summary {
    width: 100%;
  }

  .selected-agent-copy strong {
    max-width: none;
  }

  .agent-filter-options {
    display: grid;
  }

  .agent-filter-options.is-prof {
    grid-template-columns: repeat(8, minmax(0, 1fr));
  }

  .agent-filter-options.is-subprof {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .agent-filter-options button {
    width: 100%;
    padding-inline: 2px;
  }

  .agent-filter-options button img {
    display: none;
  }

  .agent-picker-results {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    max-height: 44dvh;
  }

  .records-heading {
    margin-bottom: 10px;
  }

  .records-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .record-view-switch {
    width: 100%;
  }

  .record-view-switch button {
    min-width: 0;
  }

  .entry-shortcuts {
    width: 100%;
    justify-content: flex-start;
  }

  .add-record {
    padding-inline: 12px;
  }

  .gacha-record {
    gap: 8px;
  }

  .record-bar {
    min-width: 68px;
    max-width: calc(100% - 42px);
    padding-inline: 9px;
  }

  .pull-result b {
    font-size: 20px;
  }

  .records-tail {
    align-items: flex-start;
    flex-direction: column;
  }

  footer {
    align-items: stretch;
    flex-direction: column;
    gap: 9px;
    padding-inline: 16px;
  }

  .footer-actions {
    display: grid;
    grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr);
  }

  footer.is-entry-active {
    display: none;
  }

  .entry-composer { scroll-margin-block: 16px 24px; }
}

@media (max-width: 430px) {
  .modal-mask {
    padding: 0;
  }

  .pool-editor {
    width: 100%;
    height: calc(100dvh - var(--keyboard-inset));
    max-height: calc(100dvh - var(--keyboard-inset));
    padding-top: env(safe-area-inset-top);
    padding-right: env(safe-area-inset-right);
    padding-left: env(safe-area-inset-left);
    border-radius: 0;
  }

  .progress-card {
    grid-template-columns: minmax(0, 1fr) minmax(122px, .85fr);
  }

  .progress-number strong {
    font-size: 27px;
  }

  .record-track {
    gap: 6px;
  }
}

@media (max-width: 360px) {
  .agent-picker-results {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .progress-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .remaining-field {
    max-width: 180px;
  }

  .records-heading {
    margin-bottom: 10px;
  }

  .entry-shortcuts .add-record {
    flex: 1 1 120px;
    width: auto;
  }

  .gacha-record {
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 7px;
  }

  .record-avatar {
    width: 40px;
    height: 40px;
  }

  .record-bar {
    min-width: 64px;
    padding-inline: 8px;
  }

  .status-pill.is-neutral {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .progress-rail > span,
  button,
  .gacha-record {
    transition: none;
  }
}
</style>
