<template>
  <div class="reward-workspace" :class="{ 'compact-daily': compactDaily, 'home-daily': homeDaily }">
    <form v-if="compactDaily" class="daily-quick" aria-label="今日奖励" @submit.prevent="submitDaily">
      <div class="daily-quick-heading"><strong>今日奖励</strong><time :datetime="dailyDate" title="北京时间 05:00 换日">{{ dailyDate.slice(5).replace('-', '月') }}日</time></div>
      <fieldset :disabled="disabled || locked || dailyLoading || !!dailyStatusError || catalogLoading || !entities.length">
        <legend class="sr-only">选择实际领取的奖励</legend>
        <div v-for="preset in dailyPresets" :key="preset.id" class="daily-quick-option" :class="{ recorded: dailyRecorded.has(preset.id) }">
          <label>
            <input type="checkbox" :checked="manual.presets.some(entry => entry.id === preset.id)" :disabled="preset.count === 0 && !manual.presets.some(entry => entry.id === preset.id) || dailyRecorded.has(preset.id) || preset.id === 'monthly-card' && !monthlyReady && !mailboxMonthlyCoins || preset.id === 'daily-zhuyu' && !dailyZhuyuReady && !unconfirmedZhuyu" @change="toggleQuickPreset(preset)" />
            <img :src="iconSrc({ id: preset.itemId, entity_type: 'item' })" alt="" width="28" height="28" />
            <span><b>{{ preset.channel }}</b><small>{{ dailyRecorded.has(preset.id) ? '已记录' : preset.count ? `+${preset.count} ${preset.itemName}` : '未启用' }}</small></span>
          </label>
          <small v-if="preset.id === 'monthly-card' && mailboxMonthlyCoins" class="shortcut-note">按邮件设置</small>
          <button v-else type="button" class="quick-edit" :disabled="preset.id === 'daily-zhuyu' && !dailyZhuyuReady" :aria-label="`编辑${preset.channel}`" @click="openQuickEdit(preset)"><Pencil :size="14" aria-hidden="true" /></button>
        </div>
      </fieldset>
      <p v-if="mailboxMonthlyCoins" class="shortcut-note">记录月卡领取会扣除当天邮件；调整奖励请前往库存的邮件管理。</p>
      <div class="daily-quick-actions">
        <button class="primary-button" type="submit" :disabled="disabled || locked || dailyLoading || !!dailyStatusError || catalogLoading || !entities.length || !manual.presets.length || !!result || unconfirmedZhuyu">{{ busy ? '记录中…' : homeDaily && manual.presets.length && !result ? `记录所选（${manual.presets.length}）` : '记录所选' }}</button>
        <router-link v-if="homeDaily" class="quick-inventory text-button" to="/inventory">前往库存 ›</router-link>
        <button v-else type="button" class="quick-history text-button" :disabled="disabled || locked" @click="openQuickHistory">补记历史</button>
        <details v-if="!homeDaily" class="quick-rules shortcut-note">
          <summary>领取规则</summary>
          <div class="quick-rules-content">
            <p>每日茱萸可选择记录茱萸或已领取的白金币；点击编辑选择本次结果。仅勾选实际已领取的奖励，未领取的邮件暂勿入账。</p>
            <p>收支报告可按每个50白金币展示等价值；这不是兑换，不会额外增加白金币。确认后请查看回执。</p>
            <p>同一业务日重复确认同一来源不会重复入账；日界线为北京时间05:00。跨日更正请通过操作历史管理原记录，不要重复补记同一笔领取。</p>
          </div>
        </details>
      </div>
      <p v-if="monthlyPreferenceNote" class="quick-feedback" role="status">{{ monthlyPreferenceNote }} <button type="button" class="text-button" :disabled="locked" @click="loadMonthlyPreference">重试设置</button></p>
      <p v-if="dailyZhuyuSelectionNote" class="quick-feedback" role="status">{{ dailyZhuyuSelectionNote }}</p>
      <p v-if="dailyZhuyuPreferenceNote" class="quick-feedback" role="alert">{{ dailyZhuyuPreferenceNote }} <button type="button" class="text-button" :disabled="locked" @click="loadDailyZhuyuPreference">重试</button></p>
      <p v-if="dailyLoading || catalogLoading" class="quick-feedback" role="status">正在核对今日奖励…</p>
      <p v-if="dailyStatusError" class="quick-feedback" role="alert">{{ dailyStatusError }} <button type="button" class="text-button" :disabled="locked" @click="loadDailyStatus">重试</button></p>
      <p v-if="error && !quickPanel" class="quick-feedback" role="alert">{{ error }} <button type="button" class="text-button" :disabled="busy || disabled" @click="pendingDocument ? submit() : !entities.length ? loadCatalog() : submitDaily()">{{ pendingDocument ? '原样重试' : '重试' }}</button></p>
      <p v-if="result && !quickPanel" class="quick-feedback" role="status">{{ result.history_only ? '已补记录，已计入库存的部分未重复增加。' : result.accepted ? '今日领取已记录。' : '已记录，未重复增加。' }}<button type="button" class="text-button" @click="startNext">继续选择</button></p>
    </form>
    <InventoryQuickDialog :open="!!quickPanel" :title="quickPanel === 'history' ? '补记历史奖励' : `编辑${quickEdit?.channel || '奖励'}`" :locked="locked" @close="closeQuickPanel">
      <form v-if="quickPanel === 'edit' && quickEdit" class="quick-reward-editor" @submit.prevent="saveQuickEdit">
        <fieldset class="panel-fields" :disabled="locked || disabled">
          <label v-if="quickEdit.id === 'monthly-card'">月卡档位<select v-model="quickEdit.tier" @change="quickEdit.count = monthlyCardTier(quickEdit.tier, game).coins"><option v-for="tier in monthlyTiers" :key="tier.id" :value="tier.id">{{ tier.label }}</option></select></label>
          <label v-if="quickEdit.id === 'daily-zhuyu'">本次记录<select v-model="quickEdit.itemId" @change="quickEdit.count = quickEdit.itemId === 'zhuyu' ? 1 : 50"><option value="zhuyu">茱萸</option><option value="baijinbi">已领取的白金币</option></select></label>
          <p v-if="quickEdit.id === 'daily-zhuyu'" class="panel-note">记账方式同步到当前游戏账号；数量仅本次生效。每个茱萸可获得 50 白金币，仅在游戏中已领取白金币时选择该项。</p>
          <label>本次数量{{ quickEdit.id === 'daily-zhuyu' ? `（${quickEdit.itemId === 'zhuyu' ? '茱萸' : '白金币'}）` : '' }}<input v-model="quickEdit.count" type="number" :min="quickEdit.id === 'monthly-card' && quickEdit.tier === 'none' ? 0 : 1" max="2147483647" step="1" inputmode="numeric" /></label>
          <p v-if="quickEdit.id === 'monthly-card'" class="panel-note">月卡档位会记住，并同步到养成规划。</p>
        </fieldset>
        <p v-if="quickEditError" role="alert">{{ quickEditError }}</p>
        <div class="panel-actions"><button type="button" class="outline-button" :disabled="locked" @click="closeQuickPanel">取消</button><button type="submit" class="primary-button" :disabled="locked || disabled">{{ quickSaving ? '保存中…' : '保存设置' }}</button></div>
      </form>
      <form v-if="quickPanel === 'history'" class="quick-history-form" @submit.prevent="submitDaily">
        <fieldset class="panel-fields" :disabled="locked || disabled || !!result">
          <RewardDateTimePicker v-model:date="manual.date" v-model:clock="manual.clock" @update:date="clearPreview" @update:clock="clearPreview" />
          <div class="history-rewards"><label v-for="preset in dailyPresets" :key="preset.id"><input type="checkbox" :checked="manual.presets.some(entry => entry.id === preset.id)" :disabled="dailyLoading || dailyRecorded.has(preset.id) || !preset.count && !manual.presets.some(entry => entry.id === preset.id) || preset.id === 'daily-zhuyu' && !dailyZhuyuReady && !unconfirmedZhuyu" @change="toggleQuickPreset(preset)" /><span>{{ preset.channel }} {{ dailyRecorded.has(preset.id) ? '· 已记录' : `+${preset.count}` }}</span></label></div>
          <label v-for="entry in manual.presets" :key="entry.id">{{ entry.channel }}数量<input v-model="entry.count" type="number" min="1" max="2147483647" step="1" inputmode="numeric" @input="clearPreview" /></label>
          <label>库存处理<select v-model="manual.whiteCoinPurpose" @change="clearPreview"><option value="annotation">已计入当前数量，只补记录</option><option value="income">尚未计入，按领取时间补入</option></select></label>
          <p class="panel-note">填写实际领取时间。如果这次领取已经包含在盘点数量中，选择“已计入当前数量，只补记录”；需要对应盘点覆盖实际领取时间。未包含的领取按新增收入记录。</p>
        </fieldset>
        <p v-if="error || dailyStatusError" role="alert">{{ error || dailyStatusError }}</p>
        <p v-if="dailyZhuyuPreferenceNote" role="alert">{{ dailyZhuyuPreferenceNote }} <button type="button" class="text-button" :disabled="locked" @click="loadDailyZhuyuPreference">重试</button></p>
        <button v-if="dailyStatusError" type="button" class="text-button" @click="loadDailyStatus">重试读取</button>
        <p v-if="result" role="status">历史奖励已保存，已计入库存的部分未重复增加。</p>
        <div class="panel-actions"><button type="button" class="outline-button" :disabled="locked" @click="closeQuickPanel">{{ result ? '完成' : '取消' }}</button><button v-if="!result" type="submit" class="primary-button" :disabled="busy || checkingBaseline || disabled || dailyLoading || !!dailyStatusError || !manual.presets.length || !pendingDocument && unconfirmedZhuyu">{{ busy ? '保存中…' : pendingDocument ? '原样重试' : '保存补记' }}</button></div>
      </form>
    </InventoryQuickDialog>
    <slot v-if="!compactDaily && $slots.actions" name="actions" />
    <div v-else-if="!compactDaily" class="workspace-actions" aria-label="新增奖励或导入库存记录">
      <span v-if="disabled" class="muted">登录并选择子账号后可补录记录</span>
      <button ref="manualButton" type="button" class="entry-button" :class="{ active: mode === 'manual' }" :disabled="disabled || locked" :aria-expanded="mode === 'manual'" aria-haspopup="dialog" aria-controls="reward-entry-panel" @click="open('manual')"><Plus :size="15" aria-hidden="true" />添加奖励流水</button>
      <button ref="reportButton" type="button" class="entry-button" :class="{ active: mode === 'report' }" :disabled="disabled || locked" :aria-expanded="mode === 'report'" aria-haspopup="dialog" aria-controls="reward-entry-panel" @click="open('report')"><Upload :size="15" aria-hidden="true" />导入本地报告</button>
    </div>

    <Teleport v-if="!compactDaily" to="body">
      <Transition name="reward-dialog">
        <div v-if="mode" class="reward-dialog-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle" role="presentation" @click.self="requestClose">
          <section
            id="reward-entry-panel"
            ref="dialogEl"
            @focusin="revealFocusedControl"
            class="reward-panel reward-dialog"
            :class="[`mode-${mode}`, { 'daily-mode': dailyMode, 'compact-entry': compact && !dailyMode, 'resource-operation': operation !== 'gain' }]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-entry-title"
            :aria-describedby="locked ? 'reward-dialog-lock-status' : undefined"
            :aria-busy="busy"
            tabindex="-1"
          >
            <header class="panel-heading">
              <span class="heading-emblem" aria-hidden="true"><BookOpen v-if="mode === 'manual'" :size="25" /><ScrollText v-else :size="25" /></span>
              <div class="heading-copy"><span class="eyebrow">广陵库房 · {{ mode === 'manual' ? '奖励入簿' : '报告补传' }}</span><h3 id="reward-entry-title" ref="heading" tabindex="-1">{{ dialogTitle }}</h3></div>
              <div class="dialog-header-meta">
                <span class="account-badge"><span class="account-dot" />{{ accountName }}</span>
                <span v-if="locked" id="reward-dialog-lock-status" ref="lockNotice" class="dialog-lock-note" role="status" tabindex="-1">{{ closeLockMessage }}</span>
              </div>
              <button type="button" class="icon-button close-button" :aria-disabled="locked ? 'true' : 'false'" :aria-label="locked ? closeLockMessage : '关闭奖励工作台'" :title="locked ? closeLockMessage : '关闭奖励工作台'" @click="requestClose"><X :size="18" aria-hidden="true" /></button>
            </header>

            <div ref="scrollBody" class="reward-dialog-scroll">
              <div v-if="error" ref="errorBox" class="error-message" role="alert" tabindex="-1"><CircleAlert :size="17" aria-hidden="true" /><span>{{ error }}<a v-if="dispatchAnnotation && !pendingDocument" href="#dispatch-reward-purpose" @click.prevent="dialogEl?.querySelector('#dispatch-reward-purpose')?.focus()">核对记录用途</a><a v-if="trainingByRuns && ['group', 'level', 'runs'].includes(trainingCalculation.field)" :href="`#${trainingErrorTarget}`" @click.prevent="focusTrainingError">返回历练字段</a></span></div>
              <div v-if="catalogLoading" class="loading-state" role="status">正在准备奖励目录…</div>
              <button v-else-if="!entities.length" type="button" class="outline-button retry-catalog" :disabled="busy" @click="loadCatalog">重新加载奖励目录</button>

      <div v-if="compact && mode === 'manual' && !dailyMode" class="entry-operations" role="group" aria-label="记一笔操作">
        <button v-for="item in [{ id: 'gain', name: '获得' }, { id: 'use', name: '使用' }, { id: 'exchange', name: '兑换' }]" :key="item.id" type="button" :aria-pressed="operation === item.id" :disabled="locked" @click="operation = item.id; resourceOpened ||= item.id !== 'gain'">{{ item.name }}</button>
      </div>
      <div v-if="resourceOpened" v-show="operation !== 'gain'"><slot name="resource-entry" :operation="operation" /></div>
      <form v-if="mode === 'manual' && entities.length" v-show="operation === 'gain' || dailyMode" class="manual-form" novalidate @submit.prevent="dailyMode ? submitDaily() : compact ? submitQuick() : previewManual()">
        <fieldset :disabled="locked || !!result || disabled">
          <legend class="sr-only">填写奖励流水</legend>
          <div v-if="!compact || dailyMode" class="whitecoin-shortcuts">
            <p v-if="dailyMode" class="shortcut-note">游戏日 {{ dailyDate }} · 北京时间 05:00 切换。仅记录已经领取的奖励。</p>
            <p v-if="dailyLoading" role="status" class="shortcut-note">正在核对已记录项目…</p>
            <p v-if="dailyStatusError" role="alert" class="shortcut-note">{{ dailyStatusError }} <button type="button" class="text-button" @click="loadDailyStatus">重试</button></p>
            <div class="section-label">日常快捷录入<span>可同时选择多个来源；每个来源每个游戏日仅记一笔</span></div>
            <div class="shortcut-options" role="group" aria-label="日常来源">
              <button v-for="preset in dailyPresets" :key="preset.id" type="button" class="outline-button" :disabled="preset.count === 0 || ((dailyMode || preset.id === 'monthly-card') && (dailyLoading || !!dailyStatusError || dailyRecorded.has(preset.id)))" :aria-pressed="manual.presets.some(entry => entry.id === preset.id)" @click="selectDailyPreset(preset)">{{ preset.channel }} {{ preset.itemId === 'zhuyu' ? '+' + preset.count : preset.count }}<span v-if="dailyRecorded.has(preset.id)"> · 已记录</span></button>
              <p v-if="mailboxMonthlyCoins" class="shortcut-note">月卡领取将同时扣除当天邮件，每封 {{ mailboxMonthlyCoins }} 白金币；奖励设置请在邮件管理中调整。</p>
              <label v-else class="monthly-tier-field">月卡档位<select v-model="monthlyTier" aria-label="月卡奖励档位" @change="changeMonthlyTier"><option v-for="tier in monthlyTiers" :key="tier.id" :value="tier.id">{{ tier.label }}</option></select></label>
              <button v-if="manual.presets.length && !dailyMode" type="button" class="outline-button" @click="manual.presets = []; manual.whiteCoinPurpose = ''; clearPreview()">普通补录</button>
            </div>
            <details class="shortcut-note">
              <summary>记录领取1个茱萸，增加的是茱萸实物。</summary>
              <p>收支报告可按每个50白金币展示等价值；这不是兑换，不会额外增加白金币。确认前请核对奖励内容，确认后请查看回执。</p>
              <p>同一业务日重复确认同一来源不会重复入账；日界线为北京时间05:00。跨日更正请通过操作历史管理原记录，不要重复补记同一笔领取。</p>
            </details>
            <p class="shortcut-note">仅勾选已经领取的来源；邮箱待领取奖励请暂勿入账。月卡数量为可编辑预设，请按实际领取核对。{{ monthlyPreferenceNote }}</p>
            <label v-if="manual.presets.length" class="whitecoin-purpose">本次记录用途<select v-model="manual.whiteCoinPurpose" aria-label="日常记录用途" @change="clearPreview"><option value="">请选择记录用途</option><option value="income">增加库存（新增收入）</option><option value="annotation">已包含在库存中，仅补记录</option></select></label>
            <p v-if="manual.presets.length" class="shortcut-note">如果这次领取已经包含在盘点数量中，选择“已包含在库存中，仅补记录”并填写实际领取时间；需要对应盘点覆盖实际领取时间。未包含的领取按新增收入记录。</p>
          </div>
          <details class="channel-section" :open="!compact || dailyMode"><summary v-if="compact && !dailyMode">来源与历史时间 · {{ manual.channel === '手动补录' ? (manual.customChannel || '手动记录') : manual.channel }}</summary>
            <div v-if="!dailyMode" class="section-label">获取渠道<span>选择本次奖励的来源</span></div>
              <div v-if="!dailyMode" class="channel-options" role="group" aria-label="获取渠道">
                <button v-for="channel in REWARD_CHANNELS" :key="channel.id" type="button" class="channel-option" :class="{ selected: manual.channel === channel.id }" :aria-pressed="manual.channel === channel.id" @click="changeChannel(channel.id)">
                <component :is="channelIcons[channel.icon]" :size="20" aria-hidden="true" /><span><b>{{ channel.label }}</b><small>{{ channel.hint }}</small></span><span v-if="manual.channel === channel.id" class="channel-check"><Check :size="11" aria-hidden="true" /></span>
              </button>
            </div>
            <div class="reward-metadata">
              <label v-if="!dailyMode && manual.channel === '手动补录' && !manual.presets.length" class="custom-channel-field"><span>自定义渠道名称 <small>例如：活动邮件、月卡奖励</small></span><input v-model.trim="manual.customChannel" type="text" maxlength="64" placeholder="填写这笔奖励的来源" @input="clearPreview" /></label>
              <RewardDateTimePicker v-model:date="manual.date" v-model:clock="manual.clock" :disabled="locked || !!result || disabled" @update:date="clearPreview" @update:clock="clearPreview" />
              <label v-if="requiresStamina" class="stamina-field"><span>消耗体力<small>本次派遣</small></span><span class="stamina-input"><Flame :size="16" aria-hidden="true" /><input v-model="manual.stamina" type="text" inputmode="numeric" aria-label="消耗体力" placeholder="填写实际消耗" @input="clearPreview" /><span>点</span></span></label>
              <p class="baseline-note"><History :size="14" aria-hidden="true" /><span>{{ manualBeforeLatestSnapshot ? '这笔奖励早于最近一次已知盘点，已在盘点中计入的部分只补历史，不会再次增加库存。' : '按实际获得时间记录。已在后续盘点中计入的部分只补历史，不会再次增加库存；奖励记录不能代替完整盘点。' }}</span></p>
            </div>
            <label v-if="manual.channel === '派遣-寿春' && !manual.presets.length" class="whitecoin-purpose">本次记录用途<select id="dispatch-reward-purpose" v-model="manual.dispatchPurpose" aria-label="派遣记录用途" :aria-describedby="error && dispatchAnnotation && !pendingDocument ? 'dispatch-purpose-help dispatch-purpose-error' : 'dispatch-purpose-help'" @change="clearPreview"><option value="income">增加库存（新增收入）</option><option value="annotation">已包含在库存中，仅补记录</option></select></label>
            <p v-if="manual.channel === '派遣-寿春' && !manual.presets.length" id="dispatch-purpose-help" class="shortcut-note">按实际领取时间填写全部碎片与体力。只补记录需要每个碎片都有覆盖领取时间的盘点；缺少覆盖时请先核对并盘点。</p>
            <p v-if="dispatchAnnotation && error && !pendingDocument" id="dispatch-purpose-error" class="shortcut-note">{{ error }}</p>
          </details>
          <div v-if="manual.channel === '历练'" class="training-mode-section">
            <div class="shortcut-options" role="group" aria-label="历练填写方式">
              <button type="button" class="outline-button" :aria-pressed="trainingByRuns" :disabled="!!trainingUnavailable" @click="changeTrainingMode('runs')">按次数填写</button>
              <button type="button" class="outline-button" :aria-pressed="!trainingByRuns" @click="changeTrainingMode('materials')">按材料填写</button>
            </div>
            <p v-if="trainingUnavailable" class="shortcut-note">{{ trainingUnavailable }}</p>
            <div v-if="manual.training.replacePrompt" class="training-replace" role="group" aria-label="确认替换材料草稿">
              <p>切回按次数填写将替换当前材料草稿，手工修改及额外奖励不会保留。</p>
              <button type="button" class="outline-button" @click="changeTrainingMode('runs', true)">替换并按次数填写</button>
              <button type="button" class="outline-button" @click="manual.training.replacePrompt = false">保留按材料填写</button>
            </div>
          </div>
          <div class="manual-columns">
            <section v-if="trainingByRuns" class="reward-picker training-picker" aria-label="按完成次数计算历练奖励">
              <div class="training-toolbar"><h4>历练奖励</h4>
                <details v-if="!experienceTraining" class="training-level-settings">
                  <summary>常用关卡<ChevronDown :size="13" aria-hidden="true" /></summary>
                  <div class="training-settings-panel">
                  <p id="training-level-help" class="shortcut-note">至少选择一关。三种修为历练共用此设置，按游戏账号和游戏保存在当前浏览器；取消常用不影响已填关卡。</p>
                  <div class="training-level-options" role="group" aria-label="常用关卡" aria-describedby="training-level-help">
                    <label v-for="level in TRAINING_REWARD_LEVELS" :key="level" :class="{ selected: commonTrainingLevels.includes(level) }"><input type="checkbox" :value="level" :checked="commonTrainingLevels.includes(level)" :disabled="commonTrainingLevels.length === 1 && commonTrainingLevels.includes(level)" @change="changeCommonTrainingLevel(level, $event.target.checked)" />第 {{ level }} 关</label>
                  </div>
                  <label class="training-show-all"><input v-model="showAllTrainingLevels" type="checkbox" />显示全部 1–12 关</label>
                  </div>
                </details>
              </div>
              <div class="training-selection" aria-label="历练录入区">
                <div id="training-group" class="training-group-options" role="group" aria-label="历练类型" tabindex="-1" :aria-invalid="!!error && trainingInputError.field === 'group'" :aria-describedby="error && trainingInputError.field === 'group' ? 'training-error' : undefined">
                  <button v-for="group in TRAINING_REWARD_GROUPS" :key="group.id" type="button" class="outline-button" :aria-pressed="manual.training.draft.groupId === group.id" @click="changeTrainingGroup(group.id)">{{ group.name }}</button>
                </div>
                <p v-if="error && trainingInputError.field === 'group'" id="training-error" class="row-error" tabindex="-1">{{ trainingInputError.error }}</p>
                <div class="training-fields">
                  <label for="training-level">{{ experienceTraining ? '档位' : '关卡' }}<select id="training-level" v-model="manual.training.draft.level" :aria-invalid="!!error && trainingInputError.field === 'level'" :aria-describedby="error && trainingInputError.field === 'level' ? 'training-error' : undefined" @change="changeTrainingDraft"><option value="">{{ experienceTraining ? '请选择档位' : '请选择关卡' }}</option><option v-for="level in trainingLevelOptions(manual.training.draft.level)" :key="level" :value="level">{{ trainingStageLabel(manual.training.draft.groupId, level) }}{{ !experienceTraining && !showAllTrainingLevels && !commonTrainingLevels.includes(level) ? '（当前选择）' : '' }}</option></select><span v-if="error && trainingInputError.field === 'level'" id="training-error" class="row-error" tabindex="-1">{{ trainingInputError.error }}</span></label>
                  <label for="training-runs">完成次数<span class="training-stepper"><button type="button" class="outline-button" aria-label="减少完成次数" :disabled="!canAdjustTrainingRuns(-1)" @click="adjustTrainingRuns(-1)">−</button><input id="training-runs" v-model="manual.training.draft.runs" type="text" inputmode="numeric" :aria-invalid="!!error && trainingInputError.field === 'runs'" :aria-describedby="error && trainingInputError.field === 'runs' ? 'training-error training-note' : 'training-note'" @input="changeTrainingDraft" /><button type="button" class="outline-button" aria-label="增加完成次数" :disabled="!canAdjustTrainingRuns(1)" @click="adjustTrainingRuns(1)">+</button></span><span v-if="error && trainingInputError.field === 'runs'" id="training-error" class="row-error" tabindex="-1">{{ trainingInputError.error }}</span></label>
                </div>
                <p v-if="trainingInputError.field === 'catalog' || trainingInputError.field === 'game'" class="row-error">{{ trainingInputError.error }}</p>
                <div v-if="trainingDraftResult.entries.length" class="training-draft-rewards" aria-label="本条预计获得"><span v-for="entry in trainingDraftResult.entries" :key="entry.id" class="training-reward-chip"><span class="reward-item-icon" aria-hidden="true"><img v-if="!failedImages.has(rewardKey(entry))" :src="iconSrc(entry)" alt="" width="24" height="24" @error="failedImages.add(rewardKey(entry))" /><span v-else>{{ entry.name.slice(0, 1) }}</span></span><span>{{ entry.name }} <strong>+{{ entry.count }}</strong></span></span></div>
                <div class="training-entry-actions"><button v-if="manual.training.editingKey != null || manual.training.dirty" type="button" class="text-button" @click="cancelTrainingEdit">{{ manual.training.editingKey == null ? '清除本条' : '取消修改' }}</button><button type="button" class="outline-button add-training" :disabled="!trainingPending" @click="addTrainingSelection"><Plus v-if="manual.training.editingKey == null" :size="14" aria-hidden="true" />{{ manual.training.editingKey == null ? '加入本次记录' : '保存修改' }}</button></div>
                <p class="shortcut-note">{{ trainingPending ? '当前输入会参与预览，加入相同关卡将合并次数。' : '已加入清单，修改后可继续添加。' }}</p>
              </div>
              <p v-if="manual.training.notice" class="shortcut-note" role="status">{{ manual.training.notice }}</p>
              <div class="training-records" aria-label="本次历练记录">
                <h4>已加入清单 <small>{{ manual.training.selections.length }} 条</small></h4>
                <p v-if="!manual.training.selections.length" class="shortcut-note">尚未加入记录</p>
                <ul v-else><li v-for="selection in manual.training.selections" :key="selection.key"><span><b>{{ trainingSelectionLabel(selection) }}</b><small>{{ selection.runs }} 次{{ manual.training.editingKey === selection.key ? ' · 正在编辑' : '' }}</small></span><div><button type="button" class="text-button" :aria-label="'编辑' + trainingSelectionLabel(selection)" @click="editTrainingSelection(selection)">编辑</button><button type="button" class="text-button" :aria-label="'删除' + trainingSelectionLabel(selection)" @click="removeTrainingSelection(selection.key)">删除</button></div></li></ul>
              </div>
              <button v-if="trainingCalculation.field === 'catalog'" type="button" class="outline-button" @click="loadCatalog">重新加载奖励目录</button>
              <p v-if="trainingLevelNotice && !experienceTraining" class="shortcut-note" role="status">{{ trainingLevelNotice }}</p>
              <details class="training-help"><summary><span>仅计算必得材料</span><span>掉落说明<ChevronDown :size="12" aria-hidden="true" /></span></summary><p id="training-note" class="shortcut-note">修为历练第 1、2 关各一种材料，其余各两种；经验历练新手档仅兵书残卷，其余档位计算兵书残卷与兵书全卷。额外掉落请按实际结果补录。次数可以超过 6。多条记录共用上方发生时间，不同发生时间请分别录入；确认补录后才入账。</p></details>
            </section>
            <section v-else-if="!dailyMode" class="reward-picker" aria-label="选择奖励">
              <div class="picker-heading"><h4>{{ manual.entityType === 'agent' ? '选择密探心纸' : '选择奖励道具' }}</h4><span v-if="!compact">{{ manual.presets.length ? '日常来源在本次入账中调整；其他奖励请选择普通补录' : '点击图标增加，选中后从左下角减少' }}</span></div>
              <div v-if="manual.channel === '手动补录'" class="type-options" role="group" aria-label="奖励类型"><button v-for="type in [{ id: 'item', label: '背包道具' }, { id: 'agent', label: '密探心纸' }]" :key="type.id" type="button" :disabled="!!manual.presets.length" :class="{ selected: manual.entityType === type.id }" :aria-pressed="manual.entityType === type.id" @click="changeType(type.id)">{{ type.label }}</button></div>
              <p v-if="manual.channel === '手动补录' && !manual.presets.length" class="shortcut-note">可切换类型继续添加，已选内容会保留。</p>
              <div v-if="manual.channel !== '派遣-洛阳'" class="picker-tools">
                <label class="search-field"><Search :size="16" aria-hidden="true" /><input v-model="search" type="text" :aria-label="manual.entityType === 'agent' ? '搜索密探姓名' : '搜索奖励道具'" :placeholder="manual.entityType === 'agent' ? '搜索密探姓名…' : '搜索道具名称…'" /><button v-if="search" type="button" class="clear-search" aria-label="清空搜索" @click="search = ''"><X :size="14" aria-hidden="true" /></button></label>
                <div v-if="manual.entityType === 'agent'" class="rarity-options" role="group" aria-label="密探品质筛选"><button v-for="quality in qualities" :key="quality.id" type="button" :class="{ selected: rarity === quality.id }" :aria-pressed="rarity === quality.id" @click="rarity = quality.id">{{ quality.label }}</button></div>
                <label v-if="manual.entityType === 'agent'" class="prof-filter">属性<select v-model="agentProf" aria-label="密探属性筛选"><option value="">全部</option><option v-for="prof in AGENT_PROFS" :key="prof" :value="prof">{{ prof }}</option></select></label>
              </div>
              <div class="reward-grid" :class="{ 'agent-grid': manual.entityType === 'agent', 'luoyang-grid': manual.channel === '派遣-洛阳' }">
                <div v-for="entity in visibleOptions" :key="rewardKey(entity)" class="reward-tile-wrap" :style="{ '--quality': qualityColor(entity.rarity) }">
                  <button type="button" class="reward-tile" :disabled="!!manual.presets.length" :class="{ chosen: countOf(entity) > 0, 'is-agent': entity.entity_type === 'agent' }" :aria-label="`添加${entity.name}，当前已选 ${countOf(entity)}`" @click="addReward(entity)">
                    <span class="tile-image"><img v-if="!failedImages.has(rewardKey(entity))" :src="iconSrc(entity)" alt="" loading="lazy" @error="failedImages.add(rewardKey(entity))" /><span v-else class="image-fallback">{{ entity.name.slice(0, 1) }}</span><span class="tile-plus" aria-hidden="true"><Plus :size="12" /></span></span>
                    <span class="tile-name">{{ entity.name }}</span><span v-if="countOf(entity)" class="tile-count">{{ countOf(entity) }}</span>
                  </button>
                  <button v-if="countOf(entity)" type="button" class="tile-minus" :aria-label="`减少${entity.name}，当前已选 ${countOf(entity)}`" @click="decreaseRewardFromTile(entity, $event)"><span><Minus :size="12" aria-hidden="true" /></span></button>
                </div>
              </div>
              <p v-if="!visibleOptions.length" class="empty-search">{{ manual.entityType === 'agent' ? '没有匹配的密探，试试其他名称、品质或属性。' : '没有匹配的奖励，试试其他名称。' }}</p>
              <p class="picker-caption">{{ entryOptions.length }} {{ manual.entityType === 'agent' ? '位密探可选' : '种道具可选' }}<span v-if="search || rarity || agentProf"> · 当前显示 {{ visibleOptions.length }} 项</span></p>
            </section>

            <aside class="reward-receipt" aria-label="本次入账清单">
              <div v-if="!compact || dailyMode" class="receipt-heading"><span class="eyebrow">本次入账</span><span class="receipt-mark" aria-hidden="true"><ScrollText :size="20" /></span><h4>奖励清单</h4></div>
              <div class="basket-heading"><span role="status" aria-live="polite" aria-atomic="true">已选 <b>{{ basketEntries.length }}</b> 项</span><button v-if="trainingByRuns || basketEntries.length" type="button" class="text-button" @click="clearBasket">清空</button></div>
              <div v-if="!basketEntries.length" class="basket-empty"><PackageOpen :size="32" aria-hidden="true" /><span>{{ trainingByRuns ? '请选择历练类型、关卡和次数' : dailyMode ? '勾选上方已经领取的日常项目' : '从候选区选取本次奖励' }}</span><small>{{ trainingByRuns ? '必得材料将自动计算' : '选中后可在这里调整数量' }}</small></div>
              <ul v-else class="basket-list"><li v-for="entry in basketEntries" :key="rewardKey(entry)"><span class="basket-name" :class="{ 'training-material': manual.channel === '历练' }"><span v-if="compact && !dailyMode || manual.channel === '历练'" class="reward-item-icon" aria-hidden="true"><img v-if="!failedImages.has(rewardKey(entry))" :src="iconSrc({ id: entry.itemId || entry.id, entity_type: entry.entity_type || 'item' })" alt="" width="32" height="32" loading="lazy" @error="failedImages.add(rewardKey(entry))" /><span v-else>{{ entry.name.slice(0, 1) }}</span></span><span>{{ entry.name }}</span></span><strong v-if="trainingByRuns" class="training-count">+{{ entry.count }}</strong><template v-else><div class="quantity-control"><button type="button" :aria-label="`减少${entry.name}`" @click="adjustReward(entry, -1)"><Minus :size="12" aria-hidden="true" /></button><input :value="entry.count" type="text" inputmode="numeric" :aria-label="entry.channel ? entry.channel + entry.itemName + '数量' : `${entry.name}数量`" @input="setCount(entry, $event.target.value)" /><button type="button" :aria-label="`增加${entry.name}`" @click="adjustReward(entry, 1)"><Plus :size="12" aria-hidden="true" /></button></div><button type="button" class="remove-reward" :aria-label="`移除${entry.name}`" @click="removeReward(entry.id, entry.entity_type)"><X :size="13" aria-hidden="true" /></button></template></li></ul>
              <p v-if="manual.presets.length" class="shortcut-note">合计 {{ dailyRewardTotal }}，分别保存 {{ manual.presets.length }} 条来源流水。</p>
              <button type="submit" class="primary-button preview-button" :disabled="(!trainingByRuns && !basketEntries.length) || (dailyMode && (dailyLoading || !!dailyStatusError))"><span>{{ busy ? '保存中…' : checkingBaseline ? '核对中…' : dailyMode ? '一键记录' : compact ? '保存' : previewed ? '更新预览' : '预览本次流水' }}</span><ArrowRight :size="16" aria-hidden="true" /></button>
            </aside>
          </div>
        </fieldset>
      </form>

      <div v-if="mode === 'report' && entities.length" class="report-workbench">
        <fieldset :disabled="locked || disabled">
          <legend class="sr-only">选择上报报告</legend>
          <div class="report-source">
            <div class="file-section">
              <input ref="fileInput" class="sr-only" type="file" tabindex="-1" aria-label="选择上报报告文件" accept=".txt,.json,text/plain,application/json" @change="pickFile" />
              <button type="button" class="file-drop" :class="{ dragging: dragActive, loaded: fileName }" :disabled="readingFile" @click="fileInput?.click()" @dragover.prevent="dragActive = true" @dragleave.prevent="dragActive = false" @drop.prevent="dropFile">
                <span class="file-emblem"><FileCheck2 v-if="fileName" :size="27" aria-hidden="true" /><Upload v-else :size="27" aria-hidden="true" /></span>
                <span class="file-description"><b>{{ readingFile ? '正在读取报告…' : fileName || '点击选择，或拖入本地报告' }}</b><small>{{ fileName ? '已读取 · 点击更换文件' : 'DailyRewards / StockReport TXT / 库存交换 JSON · 最大 5 MB' }}</small></span><ArrowUpRight :size="20" aria-hidden="true" />
              </button>
            </div>
            <div class="import-notes"><span><Check :size="14" aria-hidden="true" />支持奖励流水与库存快照，默认选中上报失败项</span><span><Check :size="14" aria-hidden="true" />重复记录自动去重</span><span><Check :size="14" aria-hidden="true" />未注明账号时归入「{{ accountName }}」</span></div>
          </div>
          <button type="button" class="paste-toggle" :aria-expanded="showPaste" aria-controls="reward-report-text" @click="showPaste = !showPaste"><ClipboardPaste :size="15" aria-hidden="true" />{{ showPaste ? '收起文本输入' : '也可以粘贴报告内容' }}<ChevronDown :size="14" :class="{ rotated: showPaste }" aria-hidden="true" /></button>
          <div v-if="showPaste" id="reward-report-text" class="paste-area"><label><span class="sr-only">上报报告内容</span><textarea v-model="reportText" rows="5" placeholder="粘贴 MaaYuan 库存记录或库存交换 v2 JSON…" @input="clearReportPreview" /></label><button type="button" class="outline-button" :disabled="!reportText.trim() || readingFile" @click="previewReport">解析并预览<ArrowRight :size="14" aria-hidden="true" /></button></div>
        </fieldset>
      </div>

      <div v-if="previewed && (!compact || mode === 'report' || pendingDocument || dispatchAnnotation) && (!dailyMode || pendingDocument)" class="preview-section">
        <p v-if="dispatchAnnotation" class="shortcut-note" role="status">{{ annotationPreview?.can_confirm ? '本次仅补充历史与获得报告，库存数量不增加。' : '预览已失效，请重新预览。' }}消耗体力：{{ selectedRecords[0]?.stamina_cost }} 点。</p>
        <p v-if="mode === 'manual' && manual.channel === '历练'" class="shortcut-note">子账号：{{ accountName }} · 游戏：{{ game || '未指定' }}。已同步或录入过的同一笔奖励，请勿再次补录；换一种录入方式仍可能重复计数。</p>
        <div class="preview-heading"><h4>{{ mode === 'manual' ? '确认本次流水' : '报告中的库存记录' }}</h4><span class="preview-count" role="status" aria-live="polite">已选 <b>{{ selectedRecords.length }}</b> 条</span><div v-if="mode === 'report' && rows.length" class="preview-tools"><button type="button" class="text-button" :disabled="locked || !!result" @click="selectFailed">仅选失败</button><span>·</span><button type="button" class="text-button" :disabled="locked || !!result" @click="rows.forEach(row => row.selected = false)">清空选择</button></div></div>
        <p v-if="!rows.length" class="empty-search">报告中没有可补传的库存记录。</p>
        <ul v-else class="preview-list"><li v-for="row in rows" :key="row.key" :class="{ invalid: row.error, selected: row.selected }">
          <div v-if="row.record" class="preview-record">
            <label v-if="mode === 'report'" class="record-checkbox"><input v-model="row.selected" type="checkbox" :disabled="!!row.error || locked || !!result" :aria-label="`选择 ${row.record.acquisition_channel || '库存记录'} ${row.record.effective_at}`" /><span class="checkbox-art"><Check :size="13" aria-hidden="true" /></span></label>
            <div class="record-date"><small>{{ new Date(row.record.effective_at).getFullYear() }}</small><b>{{ displayDay(row.record.effective_at) }}</b><time :datetime="row.record.effective_at" :title="row.record.effective_at">{{ displayClock(row.record.effective_at) }}</time></div>
            <div class="record-body"><div class="record-title"><b>{{ row.record.acquisition_channel || '未注明渠道' }}</b><span class="record-status">{{ row.record.record_type === 'stock_snapshot' ? `库存快照 · ${row.record.snapshot_scope === 'full' ? '完整库存' : '列出条目'}` : '奖励增量' }}</span><span class="record-status" :class="{ failed: row.status?.includes('失败') }">{{ statusLabel(row.status) }}</span><span v-if="row.record.stamina_cost !== undefined" class="record-stamina"><Flame :size="12" aria-hidden="true" />{{ row.record.stamina_cost }}</span></div><div class="record-rewards"><span v-for="entry in row.record.entries" :key="entry.id"><span v-if="mode === 'manual' && row.record.acquisition_channel === '历练'" class="reward-item-icon" aria-hidden="true"><img v-if="!failedImages.has(rewardKey(entry))" :src="iconSrc(entry)" alt="" width="32" height="32" loading="lazy" @error="failedImages.add(rewardKey(entry))" /><span v-else>{{ (entry.name || entry.id).slice(0, 1) }}</span></span>{{ entry.name || entry.id }}<b>{{ row.record.record_type === 'stock_snapshot' ? '=' : '+' }} {{ entry.count }}</b></span></div></div>
            <button type="button" class="record-info" :aria-label="`查看${row.record.acquisition_channel || '库存记录'}记录详情`" :aria-expanded="expandedRows.has(row.key)" @click="toggleDetails(row.key)"><ChevronDown :size="16" :class="{ rotated: expandedRows.has(row.key) }" aria-hidden="true" /></button>
          </div>
          <div v-if="row.record && expandedRows.has(row.key)" class="record-details"><span>{{ row.record.effective_at }}</span><span>{{ row.status }}</span><span>{{ row.record.record_id }}</span></div>
          <p v-if="row.error" class="row-error">第 {{ row.block }} 个记录块：{{ row.error }}</p>
        </li></ul>
        <div v-if="!result" class="confirm-bar"><p><ShieldCheck :size="16" aria-hidden="true" /><span>{{ pendingDocument ? '本次内容已锁定，请原样重试确认结果。' : dispatchAnnotation ? '请核对实际领取时间、全部碎片和体力；本次只补记报告。' : selectedRecords.some(record => record.snapshot_scope === 'full') ? '完整快照会按原始时间重设该类库存，未列出的条目归零；请核对账号、时间和数量。' : selectedRecords.some(record => record.record_type === 'stock_snapshot') ? '快照按原始时间更新列出项目的库存总量，零值也会更新；请核对账号、时间和数量。' : '请核对发生时间与奖励内容，再确认入账。' }}</span></p><button type="button" class="primary-button submit-button" :disabled="busy || disabled || !selectedRecords.length || selectedRecords.length > 1000" @click="submit"><Check :size="16" aria-hidden="true" />{{ busy ? '正在提交…' : pendingDocument ? '原样重试补录' : `${mode === 'report' ? '确认补传' : '确认补录'} ${selectedRecords.length} 条` }}</button></div>
      </div>
      <div v-if="result && operation === 'gain'" ref="resultBox" class="result" role="status" tabindex="-1"><CircleCheck :size="23" aria-hidden="true" /><div><h4>{{ annotationResult ? '已补记报告，库存数量未增加' : result.accepted === 0 && result.duplicates > 0 ? '记录已存在，未重复补录' : mode === 'report' ? '报告已补传' : '奖励已入簿' }}</h4><p v-if="dailyMode">本次提交：{{ dailyRewardTotal }}。仅历史部分不会增加库存。</p><p v-if="mode === 'manual' && !dailyMode && !manual.presets.length && selectedRecords.length === 2">已保存 2 条流水，可在操作历史中分别查看或撤销。</p><p v-if="compact">{{ result.history_only || result.superseded ? '已保存到最近记录，已计入当前数量的部分不会重复增加。' : '已保存，可在最近记录中查看或撤销。' }}</p><p v-else>接受 {{ result.accepted }} 条 · 重复 {{ result.duplicates }} 条 · 仅历史 {{ result.history_only }} 条 · 已归档 {{ result.superseded }} 条</p><ul v-if="result.warnings?.length"><li v-for="(warning, index) in result.warnings" :key="index">{{ warningText(warning) }}</li></ul></div><button type="button" class="outline-button" @click="startNext">{{ dailyMode ? '继续打卡' : mode === 'manual' ? '再添加一条' : '继续导入' }}<ArrowRight :size="14" aria-hidden="true" /></button></div>
              <footer v-if="mode === 'report' || operation === 'gain'" class="panel-footnote"><Info :size="13" aria-hidden="true" />{{ mode === 'report' ? '奖励记录统计获得量，盘点记录保存库存总量。导入保留原记录时间，同一条记录不会重复导入。' : '历史奖励会补齐获得量；已被较新库存快照覆盖的部分，不重复增加库存。' }}</footer>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { matchedRouteKey, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import InventoryQuickDialog from './InventoryQuickDialog.vue'
import { emptyStaminaSources } from '../../data/dailyStaminaSources.js'
import { useModalFocus } from '../../composables/useModalFocus.js'
import { dialog } from '../../utils/dialog.js'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { Plus, Minus, Upload, X, Check, BookOpen, ScrollText, Bird, Flower2, Pencil, Search, Flame, PackageOpen, ArrowRight, ArrowUpRight, FileCheck2, ClipboardPaste, ChevronDown, CircleAlert, CircleCheck, ShieldCheck, Info, History } from '@lucide/vue'
import { getCurrent, importInventory, listRecords, previewRewardAnnotations, annotateRewards } from '../../api/inventory.js'
import { auth } from '../../store/auth.js'
import { getRewardCatalog } from '../../api/rewardCatalog.js'
import { getTrainingWorkspace, putTrainingWorkspace } from '../../api/operatorPlanner.js'
import { workspaceFromRemote, workspaceBody } from '../../data/operatorPlannerRemote.js'
import { getDailyZhuyuPreference, saveDailyZhuyuPreference } from '../../api/dailyZhuyuPreference.js'
import { monthlyCardTier, monthlyCardTiers } from '../../data/monthlyCard.js'
import { buildRewardDocument, buildReportDocument, parseRewardReport } from '../../data/inventory/rewardImport.js'
import { REWARD_CHANNELS, DAILY_REWARD_PRESETS, dailyRewardRecordId, validateRewardAnnotation, rewardOptionsForChannel, validateManualRewardChannel, manualAcquisitionChannel, manualRewardTimestamp } from '../../data/inventory/rewardChannels.js'
import { agentMatchesGame } from '../../data/inventory/agentManifest.js'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { TRAINING_REWARD_GROUPS, TRAINING_REWARD_LEVELS, DEFAULT_TRAINING_REWARD_LEVELS, calculateTrainingRewards, calculateTrainingRewardBatch, trainingRewardUnavailableReason } from '../../data/inventory/trainingRewards.js'
import { businessDate, businessDayStartIso, nextBusinessDayStartIso } from '../../utils/businessDay.js'
import { getMailboxDailyStatus } from '../../api/mailboxReserve.js'
import RewardDateTimePicker from './RewardDateTimePicker.vue'

const props = defineProps({ accountId: { type: String, default: '' }, accountName: { type: String, default: '当前账号' }, game: { type: String, default: '' }, latestInventoryAt: { type: String, default: '' }, disabled: Boolean, compact: Boolean, compactDaily: Boolean, homeDaily: Boolean, resourceBusy: Boolean, beforeClose: Function })
const emit = defineEmits(['imported', 'busy'])
const mode = ref(props.compactDaily ? 'manual' : '')
const dailyMode = ref(props.compactDaily)
const dailyRecorded = ref(new Set())
const dailyLoading = ref(false)
const dailyStatusError = ref('')
let dailyStatusSeq = 0
let catalogSeq = 0
let ordinaryDraft = null
let dailyDraftBaseline = ''
const operation = ref('gain'), resourceOpened = ref(false)
watch(operation, () => { if (result.value) { resetManual(); clearPreview() } })
const dialogTitle = computed(() => props.compact && !dailyMode.value && mode.value === 'manual' ? '记一笔' : mode.value === 'report' ? '导入本地报告' : dailyMode.value ? '日常打卡' : '添加奖励流水')
const quickPanel = ref(''), quickEdit = ref(null), quickEditError = ref(''), quickSaving = ref(false), quickCounts = ref({}), dailyZhuyuItem = ref('zhuyu'), dailyZhuyuPreferenceNote = ref(''), dailyZhuyuSelectionNote = ref('')
const dailyZhuyuReady = ref(false), dailyZhuyuCloud = ref(null)
const unconfirmedZhuyu = computed(() => props.compactDaily && !dailyZhuyuReady.value && manual.value.presets.some(entry => entry.id === 'daily-zhuyu'))
let dailyZhuyuSeq = 0
let quickEditBaseline = '', quickOrdinaryBaseline = ''
const monthlyTier = ref('yinghuo'), monthlyPreferenceNote = ref(''), monthlyReady = ref(false)
let monthlyPreferenceSeq = 0, monthlyTierTouched = false
const monthlyTiers = computed(() => monthlyCardTiers(props.game))
const mailboxMonthlyCoins = ref(null)
const dailyPresets = computed(() => DAILY_REWARD_PRESETS.map(preset => ({ ...preset, ...(preset.id === 'daily-zhuyu' && dailyZhuyuItem.value === 'baijinbi' ? { itemId: 'baijinbi', itemName: '白金币' } : {}), count: (preset.id === 'monthly-card' ? mailboxMonthlyCoins.value : null) ?? manual.value.presets.find(entry => entry.id === preset.id)?.count ?? quickCounts.value[preset.id] ?? (preset.id === 'monthly-card' ? (mailboxMonthlyCoins.value ?? monthlyCardTier(monthlyTier.value, props.game).coins) : preset.id === 'daily-zhuyu' && dailyZhuyuItem.value === 'baijinbi' ? 50 : preset.count) })))
function dailyZhuyuPreferenceKey() {
  return `yuanhub:inventory:daily-zhuyu:${encodeURIComponent(auth.userInfo?.id || '')}:${encodeURIComponent(props.game)}:${encodeURIComponent(props.accountId)}`
}
async function loadDailyZhuyuPreference() {
  const seq = ++dailyZhuyuSeq, account = props.accountId, game = props.game, user = auth.userInfo?.id
  dailyZhuyuReady.value = false; dailyZhuyuPreferenceNote.value = ''
  if (!account || !user) return
  const current = () => !disposed && seq === dailyZhuyuSeq && props.accountId === account && props.game === game && auth.userInfo?.id === user
  try {
    let data = await getDailyZhuyuPreference(account, user)
    if (!current()) return
    if (data.account_id !== account || data.game !== game || ![null, 'zhuyu', 'baijinbi'].includes(data.preference)) throw new Error('设置与账号不匹配')
    let saved = null
    try { saved = localStorage.getItem(dailyZhuyuPreferenceKey()) } catch (_) { /* 本机设置不可用时仍读取云端 */ }
    if (data.preference === null && ['zhuyu', 'baijinbi'].includes(saved)) {
      try { data = await saveDailyZhuyuPreference(account, user, game, null, saved) }
      catch (err) { if (err.status !== 409) throw err; data = await getDailyZhuyuPreference(account, user) }
      if (!current()) return
      if (data.account_id !== account || data.game !== game || !['zhuyu', 'baijinbi'].includes(data.preference)) throw new Error('设置与账号不匹配')
    }
    if (busy.value || checkingBaseline.value || pendingDocument.value || result.value) {
      dailyZhuyuPreferenceNote.value = '请先完成当前奖励记录，再重试读取茱萸记账设置。'
      return
    }
    const nextItem = data.preference || 'zhuyu'
    if (nextItem !== dailyZhuyuItem.value) {
      let removed = false
      for (const draft of [manual.value, ordinaryDraft].filter(Boolean)) {
        if (!draft.presets.some(entry => entry.id === 'daily-zhuyu')) continue
        draft.presets = draft.presets.filter(entry => entry.id !== 'daily-zhuyu')
        if (!draft.presets.length) draft.whiteCoinPurpose = ''
        removed = true
      }
      delete quickCounts.value['daily-zhuyu']
      if (removed) { clearPreview(); dailyZhuyuSelectionNote.value = '茱萸记账方式已变更，请重新选择本次奖励。' }
    }
    dailyZhuyuCloud.value = data.preference; dailyZhuyuItem.value = nextItem; dailyZhuyuReady.value = true
  } catch (_) { if (current()) dailyZhuyuPreferenceNote.value = '云端茱萸记账设置读取失败，请重试。' }
}
function changeMonthlyTier() {
  monthlyTierTouched = true; monthlyReady.value = true
  const entry = manual.value.presets.find(preset => preset.id === 'monthly-card')
  if (entry) {
    const count = monthlyCardTier(monthlyTier.value, props.game).coins
    if (count) entry.count = count
    else removeReward('monthly-card')
  }
  clearPreview()
}
async function loadMonthlyPreference() {
  const token = ++monthlyPreferenceSeq, account = props.accountId, game = props.game, draft = manual.value
  monthlyPreferenceNote.value = ''
  monthlyReady.value = monthlyTierTouched
  try {
    const workspace = workspaceFromRemote(await getTrainingWorkspace(account), account)
    if (token !== monthlyPreferenceSeq || disposed || props.accountId !== account || props.game !== game || mode.value !== 'manual' || manual.value !== draft || monthlyTierTouched) return
    if (workspace.staminaSources) monthlyTier.value = workspace.staminaSources.monthlyCard.tier
    monthlyReady.value = true
  } catch (_) {
    if (token === monthlyPreferenceSeq && !disposed && props.accountId === account && props.game === game && mode.value === 'manual') monthlyPreferenceNote.value = '云端月卡设置暂不可用，可手动选择。'
  }
}
let switchDraftBaseline = ''
const entities = ref([])
const catalogLoading = ref(false)
const busy = ref(false)
const checkingBaseline = ref(false)
const error = ref('')
const result = ref(null)
const errorBox = ref(null)
const resultBox = ref(null)
const heading = ref(null)
const dialogEl = ref(null)
const scrollBody = ref(null)
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => !props.compactDaily && !!mode.value, scrollBody, dialogEl)
const lockNotice = ref(null)
const manualButton = ref(null)
const reportButton = ref(null)
const fileInput = ref(null)
const reportText = ref('')
const fileName = ref('')
const readingFile = ref(false)
const showPaste = ref(false)
const dragActive = ref(false)
const rows = ref([])
const previewed = ref(false)
const pendingDocument = ref(null)
const annotationPreview = ref(null)
const annotationDocument = ref(null)
const pendingAnnotationRevision = ref(null)
const annotationResult = ref(false)
let previewSeq = 0
const search = ref('')
const rarity = ref(0)
const agentProf = ref('')
const failedImages = ref(new Set())
const expandedRows = ref(new Set())
const ownLocked = computed(() => busy.value || checkingBaseline.value || quickSaving.value || !!pendingDocument.value)
const locked = computed(() => ownLocked.value || props.resourceBusy)
const closeLockMessage = computed(() => {
  if (props.resourceBusy) return '正在保存使用或兑换，请先确认结果。'
  if (checkingBaseline.value) return '正在核对奖励库存盘点，请等待完成。'
  if (busy.value) return '正在提交本次入账，请等待完成后再关闭工作台。'
  if (pendingDocument.value) return '上次提交结果未确认，请先原样重试；为避免重复入账，当前工作台暂不能关闭。'
  return ''
})
const selectedRecords = computed(() => rows.value.filter(row => row.selected && !row.error).map(row => row.record))
const dispatchAnnotation = computed(() => mode.value === 'manual' && !manual.value.presets.length && manual.value.channel === '派遣-寿春' && manual.value.dispatchPurpose === 'annotation')
const channelIcons = { bird: Bird, flower: Flower2, scroll: ScrollText, book: BookOpen, pencil: Pencil }
const qualities = [{ id: 0, label: '全部' }, { id: 5, label: '金' }, { id: 4, label: '紫' }, { id: 3, label: '蓝' }]
let fileReadSeq = 0
let disposed = false
let trainingSelectionKey = 0
function freshManual() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString()
  return { date: local.slice(0, 10), clock: local.slice(11, 19), channel: props.compact ? '手动补录' : '派遣-洛阳', customChannel: props.compact ? '手动记录' : '', entityType: 'item', stamina: '', entries: [], presets: [], whiteCoinPurpose: '', dispatchPurpose: 'income', training: freshTraining() }
}
function freshTrainingSelection() { return { key: ++trainingSelectionKey, groupId: '', level: '', runs: '1' } }
function freshTraining() { return { mode: trainingRewardUnavailableReason(props.game) ? 'materials' : 'runs', selections: [], draft: freshTrainingSelection(), dirty: false, editingKey: null, notice: '', replacePrompt: false } }
const manual = ref(freshManual())
switchDraftBaseline = JSON.stringify(manual.value)
function resetManual() {
  manual.value = freshManual(); monthlyTierTouched = false
  if (dailyMode.value) {
    manual.value.channel = '手动补录'
    if (props.compactDaily) manual.value.whiteCoinPurpose = 'income'
    dailyDraftBaseline = JSON.stringify(manual.value)
  } else switchDraftBaseline = JSON.stringify(manual.value)
}
const trainingUnavailable = computed(() => trainingRewardUnavailableReason(props.game))
const experienceTraining = computed(() => manual.value.training.draft.groupId === 'experience')
const commonTrainingLevels = ref([...DEFAULT_TRAINING_REWARD_LEVELS])
const showAllTrainingLevels = ref(false)
const trainingLevelNotice = ref('')
function trainingLevelStorageKey() { return `yuanhub:inventory:training-levels:${encodeURIComponent(props.accountId)}:${encodeURIComponent(props.game)}` }
function loadTrainingLevelPreference() {
  commonTrainingLevels.value = [...DEFAULT_TRAINING_REWARD_LEVELS]
  showAllTrainingLevels.value = false
  trainingLevelNotice.value = ''
  if (!props.accountId || trainingUnavailable.value) return
  try {
    const raw = localStorage.getItem(trainingLevelStorageKey())
    if (raw === null) return
    const saved = JSON.parse(raw)
    if (!Array.isArray(saved) || !saved.length || !saved.every(level => TRAINING_REWARD_LEVELS.includes(level))) throw new TypeError('Invalid training levels')
    commonTrainingLevels.value = [...new Set(saved)].sort((a, b) => a - b)
  } catch (_) { trainingLevelNotice.value = '无法读取常用关卡设置，已恢复默认；本次仍可调整。' }
}
function changeCommonTrainingLevel(level, selected) {
  if (locked.value || result.value || props.disabled || !props.accountId) return
  if (!selected && commonTrainingLevels.value.length === 1) return
  commonTrainingLevels.value = TRAINING_REWARD_LEVELS.filter(item => item === level ? selected : commonTrainingLevels.value.includes(item))
  try {
    localStorage.setItem(trainingLevelStorageKey(), JSON.stringify(commonTrainingLevels.value))
    trainingLevelNotice.value = ''
  } catch (_) { trainingLevelNotice.value = '无法保存到当前浏览器，常用关卡仅在本次页面内生效。' }
}
function trainingLevelOptions(selectedLevel) {
  if (experienceTraining.value) return TRAINING_REWARD_GROUPS.find(group => group.id === 'experience').stages.map(stage => stage.level)
  return TRAINING_REWARD_LEVELS.filter(level => showAllTrainingLevels.value || commonTrainingLevels.value.includes(level) || selectedLevel === level)
}
function trainingStageLabel(groupId, level) {
  if (groupId === 'experience') return TRAINING_REWARD_GROUPS.find(group => group.id === groupId).stages.find(stage => stage.level === level)?.name || ''
  return `第 ${level} 关`
}
loadTrainingLevelPreference()
const trainingByRuns = computed(() => manual.value.channel === '历练' && manual.value.training.mode === 'runs')
const trainingPending = computed(() => manual.value.training.dirty || !manual.value.training.selections.length)
const trainingDraftResult = computed(() => {
  try { return calculateTrainingRewards({ game: props.game, ...manual.value.training.draft, entities: entities.value }) }
  catch (err) { return { entries: [], error: err.message, field: err.field } }
})
const trainingCalculation = computed(() => {
  if (!trainingByRuns.value) return { entries: [] }
  try {
    const training = manual.value.training
    const selections = training.selections.filter(selection => selection.key !== training.editingKey).map(selection => ({ ...selection }))
    if (trainingPending.value) {
      if (trainingDraftResult.value.error) return { ...trainingDraftResult.value, entries: [] }
      const draft = { ...training.draft, runs: trainingDraftResult.value.runs }
      const existing = selections.find(selection => selection.groupId === draft.groupId && selection.level === draft.level)
      if (existing) existing.runs = Number(existing.runs) + draft.runs
      else {
        const editingIndex = training.selections.findIndex(selection => selection.key === training.editingKey)
        selections.splice(editingIndex < 0 ? selections.length : editingIndex, 0, draft)
      }
    }
    return { ...calculateTrainingRewardBatch({ game: props.game, selections, entities: entities.value }), selections }
  } catch (err) { return { entries: [], error: err.message, field: err.field } }
})
const trainingInputError = computed(() => trainingPending.value ? trainingCalculation.value : {})
const trainingErrorTarget = computed(() => `training-${trainingCalculation.value.field}`)
const basketEntries = computed(() => trainingByRuns.value ? trainingCalculation.value.entries : manual.value.presets.length ? manual.value.presets : manual.value.entries)
const dailyRewardTotal = computed(() => {
  const totals = new Map()
  for (const entry of manual.value.presets) {
    const count = Number(entry.count)
    if (!Number.isInteger(count) || count < 1) return '—'
    totals.set(entry.itemName, (totals.get(entry.itemName) || 0) + count)
  }
  return [...totals].map(([name, count]) => `${count} ${name}`).join('、')
})
const dailyDate = computed(() => {
  try { return businessDate(manualRewardTimestamp(manual.value.date, manual.value.clock)) }
  catch (_) { return '' }
})
async function loadDailyStatus() {
  const seq = ++dailyStatusSeq, account = props.accountId, day = dailyDate.value, user = String(auth.userInfo?.id || '')
  dailyRecorded.value = new Set(); dailyStatusError.value = ''; mailboxMonthlyCoins.value = null
  if (mode.value !== 'manual' || !account || !day) { dailyLoading.value = false; return }
  dailyLoading.value = true
  const current = () => !disposed && seq === dailyStatusSeq && props.accountId === account && dailyDate.value === day && mode.value === 'manual' && String(auth.userInfo?.id || '') === user
  try {
    const ids = new Set(), cursors = new Set()
    let cursor
    if (dailyMode.value) do {
      const page = await listRecords({ accountId: account, entityType: 'item', from: businessDayStartIso(day), to: nextBusinessDayStartIso(day), cursor, limit: 100 })
      if (!current()) return
      if (!Array.isArray(page?.items)) throw new Error('无法读取日常记录')
      page.items.forEach(record => ids.add(record.record_id))
      cursor = page.next_cursor
      if (cursor && cursors.has(cursor)) throw new Error('日常记录分页异常')
      cursors.add(cursor)
    } while (cursor)
    dailyRecorded.value = new Set(DAILY_REWARD_PRESETS.filter(preset => ids.has(dailyRewardRecordId(preset.id, businessDayStartIso(day)))).map(preset => preset.id))
    const mail = await getMailboxDailyStatus(account, user, day)
    if (!current()) return
    if (!mail || typeof mail.monthly_claimed !== 'boolean') throw new Error('邮件领取状态不完整')
    if (mail.monthly_claimed) dailyRecorded.value.add('monthly-card')
    mailboxMonthlyCoins.value = Number.isInteger(mail.monthly_coins) && mail.monthly_coins > 0 ? mail.monthly_coins : null

    manual.value.presets = manual.value.presets.filter(preset => !dailyRecorded.value.has(preset.id)).map(preset => preset.id === 'monthly-card' && mailboxMonthlyCoins.value ? { ...preset, count: mailboxMonthlyCoins.value } : preset)
  } catch (_) {
    if (current()) dailyStatusError.value = '已记录状态读取失败，请重试后再打卡。'
  } finally { if (current()) dailyLoading.value = false }
}
function refreshMailboxDaily(event) {
  if (event?.detail && (event.detail.accountId !== props.accountId || event.detail.userId !== String(auth.userInfo?.id || ''))) return
  if (event?.detail?.source === 'reward' || result.value) return
  if (!locked.value && !props.disabled && mode.value === 'manual') void loadDailyStatus()
}
window.addEventListener('yuanhub:mailbox-updated', refreshMailboxDaily)
onBeforeUnmount(() => window.removeEventListener('yuanhub:mailbox-updated', refreshMailboxDaily))
watch(() => props.disabled, value => { if (!value) refreshMailboxDaily() })
watch([dailyDate, dailyMode, mode, () => props.accountId, () => props.game], loadDailyStatus)
let quickCountsDay = dailyDate.value
watch(dailyDate, day => {
  if (!day) return
  if (quickCountsDay && day !== quickCountsDay && !pendingDocument.value) quickCounts.value = {}
  quickCountsDay = day
})
function openQuickEdit(preset) {
  if (locked.value || props.disabled) return
  if (result.value) { startNext(); preset = dailyPresets.value.find(entry => entry.id === preset.id) }
  quickEdit.value = { ...preset, count: manual.value.presets.find(entry => entry.id === preset.id)?.count ?? preset.count, tier: monthlyTier.value }
  quickEditBaseline = JSON.stringify(quickEdit.value); quickEditError.value = ''; quickPanel.value = 'edit'
}
async function saveQuickEdit() {
  if (locked.value || props.disabled) return
  const edit = quickEdit.value, account = props.accountId, token = monthlyPreferenceSeq
  const count = Number(edit.count), min = edit.id === 'monthly-card' && edit.tier === 'none' ? 0 : 1
  if (!/^\d+$/.test(String(edit.count)) || !Number.isInteger(count) || count < min || count > 2147483647 || min === 0 && count !== 0) { quickEditError.value = '请输入有效的整数数量'; return }
  quickSaving.value = true; quickEditError.value = ''
  try {
    if (edit.id === 'monthly-card') {
      const workspace = workspaceFromRemote(await getTrainingWorkspace(account), account)
      if (disposed || props.accountId !== account || token !== monthlyPreferenceSeq) return
      const sources = workspace.staminaSources || emptyStaminaSources()
      const body = workspaceBody({ ...workspace, staminaSources: { ...sources, monthlyCard: { ...sources.monthlyCard, tier: edit.tier } } })
      workspaceFromRemote(await putTrainingWorkspace(account, body), account)
      if (disposed || props.accountId !== account || token !== monthlyPreferenceSeq) return
      monthlyTier.value = edit.tier; monthlyTierTouched = true; monthlyReady.value = true; monthlyPreferenceNote.value = ''
    }
    if (edit.id === 'daily-zhuyu') {
      const user = auth.userInfo?.id, game = props.game, seq = dailyZhuyuSeq
      if (!dailyZhuyuReady.value || !user) throw new Error('请先读取云端茱萸记账设置')
      const saved = await saveDailyZhuyuPreference(account, user, game, dailyZhuyuCloud.value, edit.itemId)
      if (disposed || seq !== dailyZhuyuSeq || props.accountId !== account || props.game !== game || auth.userInfo?.id !== user) return
      if (saved.account_id !== account || saved.game !== game || saved.preference !== edit.itemId) throw new Error('设置结果无法确认，请重试')
      dailyZhuyuCloud.value = saved.preference; dailyZhuyuItem.value = saved.preference
    }
    quickCounts.value[edit.id] = count
    const selected = manual.value.presets.find(entry => entry.id === edit.id)
    if (selected) { if (!count) removeReward(edit.id); else { selected.count = count; selected.itemId = edit.itemId; selected.itemName = edit.id === 'daily-zhuyu' ? (edit.itemId === 'baijinbi' ? '白金币' : '茱萸') : edit.itemName; selected.name = `${selected.itemName} · ${selected.channel}` } }
    clearPreview(); quickPanel.value = ''; quickEdit.value = null
  } catch (err) {
    if (!disposed && props.accountId === account && token === monthlyPreferenceSeq) {
      quickEditError.value = err.status === 409 ? '设置已在其他页面变更，已重新读取；请核对后再保存。' : err.message || '设置保存失败，请重试'
      if (err.status === 409 && edit.id === 'daily-zhuyu') {
        await loadDailyZhuyuPreference()
        if (!dailyZhuyuReady.value) quickEditError.value = '设置已在其他页面变更；读取失败，请关闭后重试。'
      }
    }
  } finally { if (token === monthlyPreferenceSeq) quickSaving.value = false }
}
function openQuickHistory() {
  if (locked.value || props.disabled) return
  if (result.value) startNext()
  quickOrdinaryBaseline = dailyDraftBaseline
  ordinaryDraft = manual.value
  resetManual(); manual.value.whiteCoinPurpose = 'annotation'; dailyDraftBaseline = JSON.stringify(manual.value)
  clearPreview(); quickPanel.value = 'history'; void loadDailyStatus()
}
async function closeQuickPanel() {
  if (locked.value) return
  const account = props.accountId, panel = quickPanel.value
  const dirty = panel === 'edit' ? JSON.stringify(quickEdit.value) !== quickEditBaseline : !result.value && JSON.stringify(manual.value) !== dailyDraftBaseline
  if (dirty && !(await dialog.confirm({ title: '放弃未保存的输入？', message: '已保存的数据不受影响。', confirmText: '放弃输入', cancelText: '继续填写' }))) return
  if (locked.value || props.accountId !== account || panel !== quickPanel.value) return
  if (panel === 'history') {
    if (result.value) quickCounts.value = {}
    manual.value = ordinaryDraft; ordinaryDraft = null; clearPreview(); dailyDraftBaseline = quickOrdinaryBaseline; void loadDailyStatus()
  }
  quickPanel.value = ''; quickEdit.value = null
}
function toggleQuickPreset(preset) {
  if (result.value) { startNext(); preset = dailyPresets.value.find(entry => entry.id === preset.id) }
  if (preset.id === 'daily-zhuyu') dailyZhuyuSelectionNote.value = ''
  const purpose = manual.value.whiteCoinPurpose || 'income'
  selectDailyPreset(preset)
  manual.value.whiteCoinPurpose = purpose
}
async function submitQuick() {
  if (locked.value || props.disabled || result.value) return
  const draft = manual.value
  await previewManual()
  if (!disposed && manual.value === draft && previewed.value && selectedRecords.value.length && !error.value && !dispatchAnnotation.value) await submit()
}
async function submitDaily() {
  if (props.compactDaily && pendingDocument.value) return submit()
  if (unconfirmedZhuyu.value) { error.value = '请先重新读取茱萸记账设置，或取消选择每日茱萸。'; return }
  if (dailyLoading.value || dailyStatusError.value || locked.value || props.disabled || result.value) return
  if (props.compactDaily && quickPanel.value !== 'history' && manual.value.whiteCoinPurpose === 'income') {
    const now = freshManual()
    if (businessDate(manualRewardTimestamp(now.date, now.clock)) !== dailyDate.value) {
      startNext(); await loadDailyStatus(); error.value = '游戏日已切换，请重新选择今天领取的奖励。'; return
    }
    manual.value.date = now.date; manual.value.clock = now.clock
  }
  const draft = manual.value
  await previewManual()
  if (!disposed && manual.value === draft && dailyMode.value && previewed.value && selectedRecords.value.length && !error.value) await submit()
}

const entryOptions = computed(() => rewardOptionsForChannel(manual.value.channel, entities.value, manual.value.entityType))
const visibleOptions = computed(() => entryOptions.value.filter(entity => (!rarity.value || entity.rarity === rarity.value) && (!agentProf.value || (Array.isArray(entity.prof) ? entity.prof.includes(agentProf.value) : entity.prof === agentProf.value)) && (!search.value.trim() || entity.name.includes(search.value.trim()) || entity.id.toLowerCase().includes(search.value.trim().toLowerCase()))))
const requiresStamina = computed(() => manual.value.channel.includes('派遣') || (manual.value.channel === '手动补录' && manual.value.customChannel.trim().includes('派遣')))
const manualBeforeLatestSnapshot = computed(() => {
  if (!props.latestInventoryAt || !manual.value.date || !manual.value.clock) return false
  const selected = Date.parse(`${manual.value.date}T${manual.value.clock}`)
  const latest = Date.parse(props.latestInventoryAt)
  return Number.isFinite(selected) && Number.isFinite(latest) && selected < latest
})
const rewardKey = entry => `${entry.entity_type || 'item'}:${entry.id}`
const counts = computed(() => new Map(manual.value.entries.map(entry => [rewardKey(entry), entry.count])))
const countOf = entity => counts.value.get(rewardKey(entity)) || 0
const qualityColor = rarity => ({ 5: 'var(--accent)', 4: 'var(--brand-blue)', 3: 'var(--line)' })[rarity] || 'var(--line)'
const iconSrc = entity => `${import.meta.env.BASE_URL}inventory-icons/${entity.entity_type === 'agent' ? 'agents' : 'items'}/${encodeURIComponent(entity.id)}.png`
let bodyOverflowBefore = ''
let rootOverflowBefore = ''
let bodyPaddingRightBefore = ''
let bodyScrollLocked = false

function lockBackgroundScroll() {
  if (typeof document === 'undefined' || bodyScrollLocked) return
  bodyOverflowBefore = document.body.style.overflow
  rootOverflowBefore = document.documentElement.style.overflow
  bodyPaddingRightBefore = document.body.style.paddingRight
  const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
  if (scrollbarGap > 0) {
    const currentPadding = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0
    document.body.style.paddingRight = `${currentPadding + scrollbarGap}px`
  }
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  bodyScrollLocked = true
}

function unlockBackgroundScroll() {
  if (typeof document === 'undefined' || !bodyScrollLocked) return
  document.body.style.overflow = bodyOverflowBefore
  document.documentElement.style.overflow = rootOverflowBefore
  document.body.style.paddingRight = bodyPaddingRightBefore
  bodyScrollLocked = false
}

watch(ownLocked, value => emit('busy', value), { flush: 'sync' })
useModalFocus(() => !props.compactDaily && !!mode.value, dialogEl, { initialFocus: () => heading.value, onEscape: requestClose })
watch(mode, (value, previous) => {
  if (props.compactDaily) return
  if (value && !previous) lockBackgroundScroll()
  if (!value && previous) unlockBackgroundScroll()
})
watch(() => [props.accountId, props.game, auth.userInfo?.id], () => {
  quickPanel.value = ''; quickEdit.value = null; quickCounts.value = {}; dailyZhuyuItem.value = 'zhuyu'; dailyZhuyuSelectionNote.value = ''; quickSaving.value = false
  if (props.compactDaily) void loadDailyZhuyuPreference()
  ++monthlyPreferenceSeq; monthlyTierTouched = false; monthlyTier.value = 'yinghuo'; monthlyPreferenceNote.value = ''; monthlyReady.value = false
  loadTrainingLevelPreference()
  fileReadSeq++
  readingFile.value = false
  mode.value = props.compactDaily ? 'manual' : ''
  operation.value = 'gain'; resourceOpened.value = false
  ordinaryDraft = null
  dailyMode.value = props.compactDaily
  entities.value = []
  ++catalogSeq; catalogLoading.value = false
  busy.value = false; checkingBaseline.value = false
  pendingDocument.value = null
  pendingAnnotationRevision.value = null
  reportText.value = ''
  fileName.value = ''
  showPaste.value = false
  resetManual()
  search.value = ''; rarity.value = 0; agentProf.value = ''
  clearPreview()
  if (props.compactDaily && props.accountId) { void loadCatalog(); void loadDailyStatus(); void loadMonthlyPreference() }
})
async function showError(message) {
  error.value = /Failed to fetch|NetworkError|Load failed/i.test(message) ? '网络连接失败，请检查连接后重试。' : message
  await nextTick()
  const fieldError = trainingByRuns.value && error.value === trainingInputError.value.error ? document.getElementById('training-error') : null
  if (fieldError) {
    fieldError.focus({ preventScroll: true })
    fieldError.scrollIntoView({ block: 'nearest' })
  } else errorBox.value?.focus()
}
async function loadCatalog() {
  const seq = ++catalogSeq
  const targetAccount = props.accountId
  const targetGame = props.game
  const targetMode = mode.value
  catalogLoading.value = true
  clearPreview()
  entities.value = []
  try {
    const catalog = await getRewardCatalog()
    if (disposed || seq !== catalogSeq || props.accountId !== targetAccount || props.game !== targetGame || mode.value !== targetMode) return
    if (!catalog.length) throw new Error('奖励目录为空，请稍后重试')
    entities.value = mode.value === 'report' ? catalog : catalog.filter(entity => entity.entity_type !== 'agent' || agentMatchesGame(entity, props.game))
  } catch (err) {
    if (!disposed && seq === catalogSeq && props.accountId === targetAccount && props.game === targetGame && mode.value === targetMode) await showError(err.message || '奖励目录加载失败')
  }
  finally { if (seq === catalogSeq) catalogLoading.value = false }
}
async function open(nextMode, trigger, daily = false) {
  if (props.disabled || locked.value || (daily && !props.accountId)) return
  if (props.compact && !mode.value && JSON.stringify(manual.value) === switchDraftBaseline) resetManual()
  if (!mode.value) (trigger || (nextMode === 'manual' ? manualButton.value : reportButton.value))?.focus({ preventScroll: true })
  if (mode.value !== nextMode) {
    if (mode.value === 'manual' && result.value) resetManual()
    fileReadSeq++; readingFile.value = false; clearPreview()
  }
  if (daily && !dailyMode.value) {
    ordinaryDraft = manual.value
    manual.value = freshManual(); manual.value.channel = '手动补录'; dailyDraftBaseline = JSON.stringify(manual.value); clearPreview()
  } else if (!daily && dailyMode.value) {
    manual.value = ordinaryDraft || freshManual(); ordinaryDraft = null; clearPreview()
  }
  dailyMode.value = daily
  operation.value = 'gain'
  mode.value = nextMode
  if (nextMode === 'manual') void loadMonthlyPreference()
  // 每次打开重新核对目录，避免管理员删改密探后继续使用页面内缓存。
  await loadCatalog()
}
function hasDraft() {
  return quickPanel.value === 'edit' && JSON.stringify(quickEdit.value) !== quickEditBaseline || !!ordinaryDraft && JSON.stringify(ordinaryDraft) !== (props.compactDaily ? quickOrdinaryBaseline : switchDraftBaseline) || !result.value && (JSON.stringify(manual.value) !== (dailyMode.value ? dailyDraftBaseline : switchDraftBaseline) || !!reportText.value.trim() || readingFile.value)
}
async function confirmLeave() {
  if (locked.value) return false
  if (!hasDraft()) return true
  const account = props.accountId, draft = manual.value
  const confirmed = await dialog.confirm({ title: '放弃未保存的记录？', message: '本次输入尚未保存，已保存的数据不受影响。', confirmText: '放弃并离开', cancelText: '继续填写' })
  return confirmed && !locked.value && props.accountId === account && manual.value === draft
}
if (inject(matchedRouteKey, null)?.value) { onBeforeRouteLeave(confirmLeave); onBeforeRouteUpdate(confirmLeave) }
function beforeUnload(event) { if (locked.value || hasDraft()) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
defineExpose({ mode, dailyMode, openDaily: trigger => open('manual', trigger, true), openManual: trigger => open('manual', trigger), openReport: trigger => open('report', trigger), hasDraft })

function close() {
  if (locked.value) return
  if (mode.value === 'manual' && result.value) resetManual()
  fileReadSeq++; readingFile.value = false
  mode.value = ''
}
async function requestClose() {
  if (!locked.value) {
    const account = props.accountId
    if (props.beforeClose && !(await props.beforeClose())) return
    if (!locked.value && props.accountId === account) close()
    return
  }
  await nextTick()
  lockNotice.value?.focus({ preventScroll: true })
}
function clearPreview() {
  ++previewSeq
  rows.value = []; previewed.value = false; result.value = null; error.value = ''; expandedRows.value.clear()
  annotationPreview.value = null; annotationDocument.value = null; annotationResult.value = false
}
function clearReportPreview() { fileReadSeq++; readingFile.value = false; fileName.value = ''; clearPreview() }
function changeTrainingMode(nextMode, confirmed = false) {
  if (locked.value || result.value || props.disabled || nextMode === manual.value.training.mode) return
  if (nextMode === 'runs') {
    if (trainingUnavailable.value) return
    if (manual.value.entries.length && !confirmed) {
      manual.value.training.replacePrompt = true
      clearPreview()
      return
    }
    manual.value.entries = []
  } else {
    if ((manual.value.training.dirty || manual.value.training.selections.length) && trainingCalculation.value.error) { showError(trainingCalculation.value.error); return }
    manual.value.entries = trainingCalculation.value.entries.map(({ id, name, count }) => ({ id, name, count, entity_type: 'item' }))
  }
  manual.value.training.mode = nextMode
  manual.value.training.replacePrompt = false
  clearPreview()
}
function focusTrainingError() { document.getElementById(trainingErrorTarget.value)?.focus() }
function changeTrainingDraft() { manual.value.training.dirty = true; manual.value.training.notice = ''; clearPreview() }
function changeTrainingGroup(groupId) {
  const draft = manual.value.training.draft
  if ((draft.groupId === 'experience') !== (groupId === 'experience')) draft.level = ''
  draft.groupId = groupId
  changeTrainingDraft()
}
function trainingSelectionLabel(selection) { return `${TRAINING_REWARD_GROUPS.find(group => group.id === selection.groupId)?.name || ''} · ${trainingStageLabel(selection.groupId, selection.level)}` }
function canAdjustTrainingRuns(delta) {
  const runs = manual.value.training.draft.runs
  const next = Number(runs) + delta
  return /^\d+$/.test(String(runs)) && Number.isSafeInteger(next) && next >= 1 && next <= (trainingDraftResult.value.maxRuns || 2147483647)
}
function adjustTrainingRuns(delta) {
  if (locked.value || result.value || props.disabled || !canAdjustTrainingRuns(delta)) return
  manual.value.training.draft.runs = String(Number(manual.value.training.draft.runs) + delta)
  changeTrainingDraft()
}
function addTrainingSelection() {
  if (locked.value || result.value || props.disabled) return
  if (!trainingPending.value) return
  const training = manual.value.training
  training.dirty = true
  clearPreview()
  if (trainingCalculation.value.error) { showError(trainingCalculation.value.error); return }
  const merged = training.selections.some(selection => selection.key !== training.editingKey && selection.groupId === training.draft.groupId && selection.level === training.draft.level)
  training.selections = trainingCalculation.value.selections
  training.notice = merged ? '已合并相同关卡的次数，请核对本次记录。' : training.editingKey == null ? '已加入本次记录，尚未入账。' : '已保存修改，尚未入账。'
  training.editingKey = null
  training.dirty = false
  training.draft = { ...freshTrainingSelection(), groupId: training.draft.groupId, level: training.draft.level }
}
function cancelTrainingEdit() {
  if (locked.value || result.value || props.disabled) return
  const training = manual.value.training
  training.draft = freshTrainingSelection(); training.editingKey = null; training.dirty = false; training.notice = ''
  clearPreview()
}
async function editTrainingSelection(selection) {
  if (locked.value || result.value || props.disabled) return
  if (manual.value.training.dirty) { showError('请先加入当前输入、保存修改或取消修改，再编辑其他记录。'); return }
  const training = manual.value.training
  training.draft = { ...selection, runs: String(selection.runs) }; training.editingKey = selection.key; training.dirty = true; training.notice = ''
  clearPreview()
  await nextTick()
  document.getElementById('training-runs')?.focus()
}
async function removeTrainingSelection(key) {
  if (locked.value || result.value || props.disabled) return
  if (manual.value.training.editingKey === key) cancelTrainingEdit()
  manual.value.training.selections = manual.value.training.selections.filter(selection => selection.key !== key)
  manual.value.training.notice = '已删除本次草稿中的记录。'
  if (!manual.value.training.selections.length && !manual.value.training.dirty) manual.value.training.draft = freshTrainingSelection()
  clearPreview()
  await nextTick()
  document.getElementById('training-runs')?.focus()
}
function changeChannel(channel) {
  if (channel === manual.value.channel || locked.value) return
  if (manual.value.channel === '历练') manual.value.entries = []
  manual.value.training = freshTraining()
  manual.value.presets = []; manual.value.whiteCoinPurpose = ''
  manual.value.dispatchPurpose = 'income'
  manual.value.channel = channel
  manual.value.entityType = REWARD_CHANNELS.find(item => item.id === channel).entityType || manual.value.entityType
  const allowed = new Set(entryOptions.value.map(rewardKey))
  manual.value.entries = manual.value.entries.filter(entry => allowed.has(rewardKey(entry)))
  manual.value.stamina = ''
  search.value = ''; rarity.value = 0; agentProf.value = ''
  clearPreview()
}
function selectDailyPreset(preset) {
  if (preset.id === 'monthly-card') monthlyTierTouched = true
  if (manual.value.presets.some(entry => entry.id === preset.id)) {
    removeReward(preset.id)
  } else {
    changeChannel('手动补录')
    manual.value.presets.push({ ...preset, name: `${preset.itemName} · ${preset.channel}` })
  }
  manual.value.entityType = 'item'
  manual.value.entries = []
  manual.value.customChannel = ''
  search.value = ''; rarity.value = 0; agentProf.value = ''
  clearPreview()
}
function changeType(type) {
  if (locked.value || type === manual.value.entityType) return
  manual.value.entityType = type; search.value = ''; rarity.value = 0; agentProf.value = ''; clearPreview()
}
function addReward(entity) {
  const entry = manual.value.entries.find(entry => rewardKey(entry) === rewardKey(entity))
  if (entry) adjustReward(entry, 1)
  else { manual.value.entries.push({ id: entity.id, name: entity.name, entity_type: entity.entity_type, count: entity.entity_type === 'item' && entity.id === 'baijinbi' ? 10 : 1 }); clearPreview() }
}
function adjustReward(entry, delta) {
  const value = Number(entry.count)
  const step = (entry.entity_type || 'item') === 'item' && (entry.id === 'baijinbi' || entry.itemId === 'baijinbi') ? 10 : 1
  const next = (Number.isInteger(value) ? value : 0) + delta * step
  if (next <= 0) removeReward(entry.id, entry.entity_type)
  else { entry.count = Math.min(2147483647, next); clearPreview() }
}
function decreaseRewardFromTile(entity, event) {
  const entry = manual.value.entries.find(entry => rewardKey(entry) === rewardKey(entity))
  if (!entry) return
  const addButton = event.currentTarget.previousElementSibling
  adjustReward(entry, -1)
  if (!countOf(entity)) nextTick(() => addButton.focus())
}
function setCount(entry, value) { entry.count = value; clearPreview() }
function removeReward(id, entityType = 'item') {
  manual.value.entries = manual.value.entries.filter(entry => entry.id !== id || entry.entity_type !== entityType)
  manual.value.presets = manual.value.presets.filter(entry => entry.id !== id)
  if (!manual.value.presets.length) manual.value.whiteCoinPurpose = ''
  clearPreview()
}
function clearBasket() {
  const trainingMode = manual.value.training.mode
  manual.value.training = { ...freshTraining(), mode: trainingMode }
  manual.value.entries = []; manual.value.presets = []; manual.value.whiteCoinPurpose = ''; clearPreview()
}
async function previewManual() {
  if (locked.value || props.disabled) return
  clearPreview()
  const seq = previewSeq
  const targetAccount = props.accountId
  const targetUser = auth.userInfo?.id
  const draft = manual.value
  try {
    if (trainingByRuns.value && trainingCalculation.value.error) throw new TypeError(trainingCalculation.value.error)
    if (draft.presets.length && !['income', 'annotation'].includes(draft.whiteCoinPurpose)) throw new Error('请选择新增收入或补标已盘点收入')
    const effectiveAt = manualRewardTimestamp(draft.date, draft.clock)
    const base = { record_type: 'reward_delta', entity_type: draft.entityType, effective_at: effectiveAt,
      ...(requiresStamina.value ? { stamina_cost: /^\d+$/.test(draft.stamina) ? Number(draft.stamina) : undefined } : {}) }
    const count = value => /^\d+$/.test(String(value)) ? Number(value) : NaN
    const entries = trainingByRuns.value ? trainingCalculation.value.entries : draft.entries
    const groups = ['item', 'agent'].map(entity_type => ({ entity_type, entries: entries.filter(entry => (entry.entity_type || draft.entityType) === entity_type) })).filter(group => group.entries.length)
    if (requiresStamina.value && groups.length > 1) throw new TypeError('派遣奖励请按背包道具、密探心纸分别录入，并填写各自实际消耗的体力。已选内容已保留。')
    const records = draft.presets.length ? draft.presets.map(preset => ({
      ...base, record_id: dailyRewardRecordId(preset.id, effectiveAt), acquisition_channel: preset.channel,
      entries: [{ id: preset.itemId, name: preset.itemName, count: count(preset.count) }],
    })) : groups.map(group => ({ ...base, entity_type: group.entity_type, record_id: `yuanhub:reward:${crypto.randomUUID()}`,
      acquisition_channel: manualAcquisitionChannel(draft.channel, draft.customChannel),
      entries: group.entries.map(entry => ({ id: entry.id, name: entry.name, count: count(entry.count) })) }))
    records.forEach(record => validateManualRewardChannel(record, entities.value, draft.channel))
    const doc = buildRewardDocument(records, targetAccount, entities.value)
    if ((draft.presets.length && draft.whiteCoinPurpose === 'annotation') || dispatchAnnotation.value) {
      checkingBaseline.value = true
      const current = await getCurrent({ accountId: targetAccount, entityType: draft.entityType }, { fresh: true })
      if (disposed || seq !== previewSeq || props.accountId !== targetAccount || auth.userInfo?.id !== targetUser || manual.value !== draft || mode.value !== 'manual') return
      validateRewardAnnotation(current, effectiveAt, draft.entityType, doc.records.flatMap(record => record.entries.map(entry => entry.id)))
      if (dispatchAnnotation.value) {
        const response = await previewRewardAnnotations(doc, { expectedUserId: String(targetUser || '') })
        if (disposed || seq !== previewSeq || props.accountId !== targetAccount || auth.userInfo?.id !== targetUser || manual.value !== draft || mode.value !== 'manual') return
        if (!response || !Number.isSafeInteger(response.expected_inventory_revision) || response.expected_inventory_revision < 0 || !Array.isArray(response.entries)) throw new Error('未收到有效的补记预览，请重新预览')
        const uncovered = response.entries.find(entry => !entry.history_only)
        if (uncovered) {
          const name = entities.value.find(entity => entity.entity_type === uncovered.entity_type && entity.id === uncovered.id)?.name || uncovered.id
          throw new Error(`「${name}」未被盘点覆盖，请回到盘点核对后再补记`)
        }
        if (!response.can_confirm || response.entries.length !== doc.records.reduce((sum, record) => sum + record.entries.length, 0)) throw new Error('部分碎片未被盘点覆盖，请回到盘点核对后再补记')
        annotationPreview.value = response
        annotationDocument.value = doc
      }
    }
    rows.value = doc.records.map(record => ({ key: record.record_id, block: 1, record, status: dispatchAnnotation.value || draft.whiteCoinPurpose === 'annotation' ? '补标已盘点收入' : '手动添加', selected: true, error: '' }))
    previewed.value = true
    await nextTick()
    heading.value?.closest('.reward-panel')?.querySelector('.preview-section')?.scrollIntoView({ block: 'nearest' })
  } catch (err) { if (!disposed && seq === previewSeq && props.accountId === targetAccount && auth.userInfo?.id === targetUser && manual.value === draft) showError(err.message) }
  finally { if (manual.value === draft) checkingBaseline.value = false }
}
function pickFile(event) { const file = event.target.files?.[0]; event.target.value = ''; readReportFile(file) }
function dropFile(event) { dragActive.value = false; if (event.dataTransfer.files.length !== 1) { showError('请每次选择一份报告'); return }; readReportFile(event.dataTransfer.files[0]) }
async function readReportFile(file) {
  if (!file || locked.value || props.disabled || !entities.value.length) return
  const seq = ++fileReadSeq
  clearPreview(); reportText.value = ''; fileName.value = ''; readingFile.value = false
  if (file.size > 5 * 1024 * 1024) { showError('报告超过 5 MB，请按日期拆分后导入'); return }
  readingFile.value = true
  try {
    const text = await file.text()
    if (seq !== fileReadSeq) return
    fileName.value = file.name; reportText.value = text
    previewReport()
  } catch (err) { if (seq === fileReadSeq) showError(err.message || '文件读取失败') }
  finally { if (seq === fileReadSeq) readingFile.value = false }
}
function previewReport() {
  if (locked.value || props.disabled) return
  clearPreview()
  try {
    if (new Blob([reportText.value]).size > 5 * 1024 * 1024) throw new Error('报告超过 5 MB，请按日期拆分后导入')
    const preview = parseRewardReport(reportText.value, props.accountId, entities.value, props.game)
    rows.value = preview.rows; previewed.value = true
  } catch (err) { showError(err.message) }
}
function selectFailed() { rows.value.forEach(row => { row.selected = !row.error && !!row.status?.includes('上报失败') }) }
function toggleDetails(key) { if (expandedRows.value.has(key)) expandedRows.value.delete(key); else expandedRows.value.add(key) }
async function submit() {
  if (!pendingDocument.value && (dailyMode.value || manual.value.presets.some(entry => entry.id === 'monthly-card')) && (dailyLoading.value || dailyStatusError.value)) return
  if (busy.value || checkingBaseline.value || props.disabled || !props.accountId || result.value) return
  error.value = ''
  const targetAccount = props.accountId
  const targetUser = auth.userInfo?.id
  const targetDraft = manual.value
  try {
    busy.value = true
    if (!pendingDocument.value && mode.value === 'manual' && manual.value.presets.length && manual.value.whiteCoinPurpose === 'annotation') {
      const current = await getCurrent({ accountId: targetAccount, entityType: 'item' }, { fresh: true })
      if (disposed || props.accountId !== targetAccount || manual.value !== targetDraft) return
      validateRewardAnnotation(current, selectedRecords.value[0]?.effective_at, 'item', selectedRecords.value.flatMap(record => record.entries.map(entry => entry.id)))
    }
    if (!pendingDocument.value) {
      if (dispatchAnnotation.value) {
        if (!annotationPreview.value?.can_confirm || !annotationDocument.value) throw new Error('请重新预览补记，再确认提交')
        pendingAnnotationRevision.value = annotationPreview.value.expected_inventory_revision
        pendingDocument.value = annotationDocument.value
      } else {
        pendingAnnotationRevision.value = null
        pendingDocument.value = mode.value === 'report'
          ? buildReportDocument(selectedRecords.value, targetAccount, entities.value, props.game)
          : buildRewardDocument(selectedRecords.value, targetAccount, entities.value)
      }
    }
    const isAnnotation = pendingAnnotationRevision.value !== null
    const response = isAnnotation
      ? await annotateRewards(pendingDocument.value, pendingAnnotationRevision.value, { expectedUserId: String(targetUser || '') })
      : await importInventory(pendingDocument.value)
    if (disposed || props.accountId !== targetAccount || auth.userInfo?.id !== targetUser || manual.value !== targetDraft) return
    if (!response || !['accepted', 'duplicates', 'history_only', 'superseded'].every(key => Number.isInteger(response[key]) && response[key] >= 0)) throw new Error('未收到有效的补录结果，请原样重试确认状态')
    if (isAnnotation && (response.accepted !== response.history_only || response.superseded !== 0)) throw new Error('补记回执未确认库存保护结果，请原样重试')
    annotationResult.value = isAnnotation
    pendingAnnotationRevision.value = null
    result.value = response; pendingDocument.value = null
    if (props.compactDaily) manual.value.presets.forEach(preset => dailyRecorded.value.add(preset.id))
    window.dispatchEvent(new CustomEvent('yuanhub:mailbox-updated', { detail: { accountId: targetAccount, userId: String(targetUser || ''), source: 'reward' } }))
    emit('imported', targetAccount)
    await nextTick()
    resultBox.value?.focus({ preventScroll: true })
  } catch (err) {
    if (!disposed && props.accountId === targetAccount && auth.userInfo?.id === targetUser && manual.value === targetDraft) {
      const rejectedAnnotation = pendingAnnotationRevision.value !== null && [400, 401, 403, 404, 409, 422].includes(err.status)
      if (rejectedAnnotation) {
        pendingAnnotationRevision.value = null
        clearPreview()
      }
      if ([400, 401, 403, 404, 409, 422].includes(err.status)) pendingDocument.value = null
      if (err.status === 409 && dailyMode.value) { previewed.value = false; rows.value = []; await loadDailyStatus() }
      if (disposed || props.accountId !== targetAccount || manual.value !== targetDraft) return
      await showError(err.code === 'mailbox_claim_conflict' ? err.message : rejectedAnnotation ? `${err.message || '库存盘点已变化'}。草稿已保留，请核对盘点后重新预览。` : err.status === 409 && (dailyMode.value || manual.value.presets.length) ? '所选日常来源已有记录，未重复入账。请核对已记录项目后补录其他来源；修正时先在操作历史删除原记录。' : err.message || '补录失败，请重试')
    }
  } finally { if (manual.value === targetDraft) busy.value = false }
}
function startNext() {
  clearPreview(); resetManual(); quickCounts.value = {}; dailyZhuyuSelectionNote.value = ''
  if (dailyMode.value) void loadDailyStatus()
  reportText.value = ''; fileName.value = ''; search.value = ''; rarity.value = 0; agentProf.value = ''
}
function warningText(warning) { return typeof warning === 'string' ? warning : warning?.message || JSON.stringify(warning) }
function displayDay(value) { return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) }
function displayClock(value) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) }
function statusLabel(value) { return value?.includes('失败') ? '上报失败' : value?.includes('成功') ? '已上报' : ['手动添加', '补标已盘点收入'].includes(value) ? value : '待核对' }
onMounted(() => {
  if (props.compactDaily && props.accountId) void loadDailyZhuyuPreference()
  if (props.compactDaily) { resetManual(); void loadCatalog(); void loadDailyStatus(); void loadMonthlyPreference() }
})
onBeforeUnmount(() => { disposed = true; window.removeEventListener('beforeunload', beforeUnload); unlockBackgroundScroll(); emit('busy', false) })
</script>

<style scoped>
.daily-quick { color: var(--ink); }
.daily-quick fieldset { border: 0; }
.daily-quick-heading small, .daily-quick-option small { color: var(--ink-60); }
.daily-quick-option { border: 1px solid var(--line); border-radius: 9px; background: var(--cream); cursor: pointer; }
.daily-quick-option:has(input:checked) { border-color: var(--theme-accent-text, var(--tea)); background: color-mix(in srgb, var(--yellow) 24%, var(--surface)); }
.daily-quick-option.recorded { background: var(--surface); cursor: default; }
.daily-quick input { accent-color: var(--tea); }
.daily-quick :is(button, input, select, summary):focus-visible, .entry-operations button:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.quick-feedback { overflow-wrap: anywhere; }
.entry-operations button { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); cursor: pointer; }
.entry-operations button[aria-pressed="true"] { background: var(--tea); color: var(--on-strong); }
.compact-entry .channel-section > summary { cursor: pointer; color: var(--ink-60); }
.compact-entry .reward-receipt { border: 0; background: transparent; box-shadow: none; }

/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.reward-workspace, .reward-dialog-mask { color: var(--ink); }
.whitecoin-shortcuts { border-bottom: 1px solid var(--line); }
.shortcut-options [aria-pressed="true"], .training-group-options [aria-pressed="true"] { background: var(--cream); border-color: var(--reward-gold); }
.whitecoin-purpose select { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.monthly-tier-field select { border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: var(--surface); }
.shortcut-note { color: var(--ink-60); }
.training-mode-section { border-bottom: 1px solid var(--line); }
.training-replace { border: 1px solid var(--reward-gold); border-radius: 9px; background: var(--cream); }
.training-fields input, .training-fields select { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.training-level-settings { border: 1px solid var(--line); border-radius: 9px; }
.training-level-settings summary { cursor: pointer; }
.training-level-settings summary span { color: var(--ink-60); }
.training-level-options label { border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
.training-level-options label.selected { border-color: var(--reward-gold); background: var(--cream); }
.training-level-options input, .training-show-all input { appearance: auto; accent-color: var(--accent); }
.training-show-all { cursor: pointer; }
.training-selection { border-top: 1px solid var(--line); }
.reward-item-icon { border-radius: 6px; background: var(--cream); color: var(--ink-60); }
.error-message a { text-decoration: underline; }
button, input, select, textarea { color: inherit; }
button { appearance: none; border: 0; cursor: pointer; background: transparent; transition: background .16s, border-color .16s, box-shadow .16s; }
button:disabled { opacity: .45; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, .error-message:focus, .dialog-lock-note:focus, .result:focus { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
h3:focus { outline: none; }
input, textarea { appearance: none; border-radius: 0; }
input:disabled { cursor: not-allowed; }
.entry-button, .outline-button, .primary-button { border: 1px solid var(--line); border-radius: 10px; }
.entry-button { background: var(--surface); box-shadow: 0 3px 8px -6px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.3); }
.entry-button:hover:not(:disabled), .entry-button.active { background: var(--cream); border-color: var(--reward-gold); }
.entry-button.active { box-shadow: inset 0 -2px 0 var(--reward-gold); }
.muted { color: var(--ink-60); }
.reward-dialog-enter-active, .reward-dialog-leave-active { transition: opacity .2s var(--ease); }
.reward-dialog-enter-active .reward-dialog, .reward-dialog-leave-active .reward-dialog { transition: transform .2s var(--ease), opacity .2s var(--ease); }
.reward-dialog-enter-from, .reward-dialog-leave-to { opacity: 0; }
.reward-dialog-enter-from .reward-dialog, .reward-dialog-leave-to .reward-dialog { opacity: 0; }
.reward-dialog-mask { background: var(--theme-overlay, rgba(73,59,44,.5)); backdrop-filter: blur(6px); }
.reward-panel { border: 1px solid var(--reward-gold-soft); border-radius: 20px; background: var(--surface); box-shadow: 0 32px 90px -34px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.48), 0 2px 6px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.06); }
.reward-panel::before { content: ''; border: 1px solid var(--reward-gold-soft); border-radius: 15px; pointer-events: none; }
.panel-heading { border-bottom: 1px solid var(--line); background: linear-gradient(110deg, var(--cream), var(--surface) 70%); border-radius: 20px 20px 0 0; }
.heading-emblem { border-radius: 50%; color: var(--reward-gold); border: 1px solid var(--reward-gold-soft); box-shadow: 0 0 0 4px var(--surface), 0 0 0 5px var(--reward-gold-soft); }
.eyebrow { color: var(--ink-60); }
.account-badge { border: 1px solid var(--line); border-radius: 99px; }
.account-dot { background: var(--reward-gold); border-radius: 50%; }
.dialog-lock-note { color: var(--theme-danger-text, var(--rouge)); }
.icon-button { border-radius: 50%; color: var(--ink-60); }
.icon-button:hover:not(:disabled):not([aria-disabled="true"]) { background: var(--paper); }
.icon-button[aria-disabled="true"] { opacity: .45; cursor: not-allowed; }
fieldset { border: 0; }
.section-label > span { color: var(--ink-60); }
.channel-option { border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.channel-option > svg { color: var(--ink-60); }
.channel-option small { color: var(--ink-60); }
.channel-option:hover:not(:disabled) { border-color: var(--reward-gold); background: var(--cream); }
.channel-option.selected { border-color: var(--reward-gold); background: linear-gradient(130deg,var(--cream),var(--paper)); box-shadow: inset 0 0 0 2px var(--surface); }
.channel-option.selected > svg { color: var(--theme-strong-text, var(--tea)); }
.channel-check { border-radius: 50%; background: var(--tea); color: var(--on-strong); border: 2px solid var(--surface); }
.custom-channel-field small { color: var(--ink-60); }
.custom-channel-field input { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); outline: none; }
.custom-channel-field input:focus { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.manual-columns { border-top: 1px solid var(--line); }
.picker-heading > span { color: var(--ink-60); }
.search-field { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink-60); }
.search-field input { background: transparent; border: 0; outline: none; }
.search-field:focus-within { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.rarity-options, .type-options { border-radius: 8px; background: var(--cream); border: 1px solid var(--line); }
.rarity-options button, .type-options button { border-radius: 5px; }
.rarity-options .selected, .type-options .selected { background: var(--surface); color: var(--theme-strong-text, var(--tea)); box-shadow: 0 1px 4px rgba(var(--theme-shadow-rgb, 73, 59, 44), 0.1); }
.prof-filter select { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
.reward-grid { scrollbar-color: var(--reward-gold-soft) transparent; }
.reward-tile { border: 1px solid transparent; border-radius: 12px; }
.reward-tile:hover:not(:disabled) { background: var(--cream); border-color: var(--line); }
.reward-tile.chosen { background: var(--cream); border-color: var(--reward-gold); }
.tile-image { border-radius: 11px; background: radial-gradient(ellipse at center, var(--paper), transparent 72%); }
.is-agent .tile-image { border-radius: 11px; border: 0; background: radial-gradient(ellipse at center, var(--paper), transparent 72%); }
.is-agent img { border-radius: 0; }
.tile-plus { border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--ink-60); }
.chosen .tile-plus { color: var(--theme-strong-text, var(--tea)); border-color: var(--reward-gold); }
.tile-minus { color: var(--theme-strong-text, var(--tea)); }
.tile-minus span { border: 1px solid var(--reward-gold); border-radius: 50%; background: var(--surface); }
.tile-minus:hover:not(:disabled) span { background: var(--paper); }
.tile-count { background: var(--tea); color: var(--on-strong); border: 2px solid var(--surface); border-radius: 99px; }
.image-fallback { color: var(--reward-gold); }
.picker-caption { color: var(--ink-60); }
.reward-receipt { border-left: 1px solid var(--line); background: linear-gradient(150deg, var(--cream), var(--surface)); }
.receipt-heading { border-bottom: 1px solid var(--reward-gold-soft); }
.receipt-mark { color: var(--reward-gold); border: 1px solid var(--reward-gold); border-radius: 4px; box-shadow: inset 0 0 0 2px var(--cream); opacity: .65; }
.stamina-field small { color: var(--ink-60); }
.stamina-input { border: 1px solid var(--line); border-radius: 9px; background: var(--surface); }
.stamina-input > svg { color: var(--reward-gold); }
.stamina-input input { border: 0; background: transparent; outline: none; }
.stamina-input > span { color: var(--ink-60); }
.stamina-input:focus-within { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.baseline-note { color: var(--ink-60); }
.baseline-note svg { color: var(--reward-gold); }
.text-button { color: var(--ink-60); }
.text-button:hover:not(:disabled) { color: var(--theme-strong-text, var(--tea)); text-decoration: underline; text-underline-offset: 3px; }
.basket-empty { color: var(--ink-60); }
.basket-empty svg { color: var(--reward-gold); opacity: .55; }
.basket-list { scrollbar-color: var(--reward-gold-soft) transparent; }
.basket-list li { border-bottom: 1px solid var(--reward-gold-soft); }
.basket-list li:last-child { border: 0; }
.quantity-control { border: 1px solid var(--line); border-radius: 7px; background: var(--surface); }
.quantity-control button { color: var(--ink-60); border-radius: 6px; }
.quantity-control button:hover:not(:disabled) { background: var(--paper); }
.quantity-control input { border: 0; background: transparent; }
.remove-reward { color: var(--ink-60); }
.primary-button { background: var(--tea); color: var(--on-strong); border-color: var(--tea); box-shadow: inset 0 0 0 2px rgba(var(--theme-shadow-rgb, 255, 248, 236), 0.08), 0 5px 12px -8px var(--tea); }
.primary-button:hover:not(:disabled) { background: var(--theme-control-bg, var(--ink)); }
.outline-button { background: var(--surface); }
.outline-button:hover:not(:disabled) { border-color: var(--reward-gold); background: var(--cream); }
.file-drop { border: 1px dashed var(--reward-gold); border-radius: 14px; background: linear-gradient(120deg,var(--cream),var(--surface)); }
.file-drop:hover:not(:disabled), .file-drop.dragging { background: var(--paper); box-shadow: inset 0 0 0 4px var(--surface); }
.file-drop.loaded { border-style: solid; }
.file-emblem { color: var(--reward-gold); border: 1px solid var(--line); border-radius: 8px 8px 15px 8px; background: var(--surface); box-shadow: 4px 4px 0 var(--reward-gold-soft); }
.file-description small { color: var(--ink-60); }
.file-drop > svg { color: var(--reward-gold); }
.import-notes { color: var(--ink-60); }
.import-notes svg { color: var(--reward-gold); }
.paste-toggle { color: var(--ink-60); }
.paste-area textarea { background: var(--cream); border: 1px solid var(--line); border-radius: 10px; }
.preview-section { border-top: 1px solid var(--line); }
.preview-count { color: var(--ink-60); }
.preview-count b { color: var(--ink); }
.preview-tools { color: var(--ink-60); }
.preview-list { scrollbar-color: var(--reward-gold-soft) transparent; }
.preview-list > li { border-bottom: 1px solid var(--line); }
.preview-list > li:first-child { border-top: 1px solid var(--line); }
.record-checkbox { cursor: pointer; }
.record-checkbox input { opacity: 0; cursor: pointer; }
.checkbox-art { border: 1px solid var(--reward-gold); border-radius: 5px; color: transparent; background: var(--surface); pointer-events: none; }
.record-checkbox input:checked + .checkbox-art { background: var(--tea); border-color: var(--tea); color: var(--on-strong); }
.record-checkbox input:focus-visible + .checkbox-art { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
.record-checkbox input:disabled + .checkbox-art { opacity: .4; }
.record-date { border-right: 1px solid var(--line); }
.record-date small { color: var(--ink-60); }
.record-date time { color: var(--ink-60); }
.record-status { border: 1px solid var(--line); border-radius: 5px; color: var(--ink-60); }
.record-status.failed { color: var(--theme-danger-text, var(--rouge)); border-color: var(--theme-danger-line, rgba(166,81,74,.2)); }
.record-stamina { color: var(--ink-60); }
.record-info { color: var(--ink-60); border-radius: 6px; }
.record-info:hover { background: var(--cream); }
.record-details { background: var(--cream); border-radius: 7px; }
.confirm-bar p { color: var(--ink-60); }
.panel-footnote { border-top: 1px solid var(--line); color: var(--ink-60); }
.error-message { color: var(--theme-danger-text, var(--rouge)); background: var(--cream); border: 1px solid var(--theme-danger-line, rgba(166,81,74,.25)); border-radius: 9px; }
.row-error { color: var(--theme-danger-text, var(--rouge)); }
.empty-search, .loading-state { color: var(--ink-60); }
.result { background: var(--cream); border: 1px solid var(--reward-gold-soft); border-radius: 12px; }
.result > svg { color: var(--reward-gold); }
.sr-only { border: 0; }
@media (max-width: 767px) {
  .reward-panel { border: 0; border-radius: 0; }
  .panel-heading { border-radius: 0; }
  .reward-receipt { border-left: 0; border-top: 1px solid var(--line); }
}

.training-toolbar h4 { color: var(--ink); }
.training-settings-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px -12px var(--tea); }
.training-level-settings { border: 0; border-radius: 0; }
.training-level-settings summary { color: var(--theme-strong-text, var(--tea)); list-style: none; }
.training-level-settings[open] summary > svg, .training-help[open] summary svg { transform: rotate(180deg); }
.training-selection { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.training-group-options { background: var(--cream); border-radius: 9px; }
.training-group-options .outline-button { border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink-60); }
.training-group-options .outline-button[aria-pressed="true"] { color: var(--theme-strong-text, var(--tea)); background: var(--surface); border-color: var(--line); box-shadow: 0 1px 3px -2px var(--tea); }
.training-stepper { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.training-stepper .outline-button { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.training-fields .training-stepper input { border: 0; border-radius: 0; background: transparent; }
.training-stepper:focus-within { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 2px; }
.training-stepper input:focus-visible { outline: none; }
.training-stepper button:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: -4px; }
.training-reward-chip { color: var(--ink-60); }
.training-reward-chip strong { color: var(--theme-strong-text, var(--tea)); }
.training-entry-actions .add-training { border-color: var(--reward-gold-soft); background: var(--cream); color: var(--theme-strong-text, var(--tea)); box-shadow: none; }
.training-help summary { color: var(--ink-60); cursor: pointer; list-style: none; }
.training-help summary > span:last-child { color: var(--theme-strong-text, var(--tea)); }
.training-picker summary:focus-visible, #training-group:focus-visible { outline: 2px solid var(--theme-focus, var(--tea)); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  button, .reward-dialog-enter-active, .reward-dialog-leave-active, .reward-dialog-enter-active .reward-dialog, .reward-dialog-leave-active .reward-dialog { transition: none; }
}
</style>
<style scoped src="./rewardEntryWorkspaceDesktop.css"></style>
<style scoped src="./rewardEntryWorkspaceMobile.css"></style>
