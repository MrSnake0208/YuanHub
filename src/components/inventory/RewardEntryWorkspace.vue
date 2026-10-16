<template>
  <div class="reward-workspace">
    <slot v-if="$slots.actions" name="actions" />
    <div v-else class="workspace-actions" aria-label="新增奖励或导入库存记录">
      <span v-if="disabled" class="muted">登录并选择子账号后可补录记录</span>
      <button ref="manualButton" type="button" class="entry-button" :class="{ active: mode === 'manual' }" :disabled="disabled || locked" :aria-expanded="mode === 'manual'" aria-haspopup="dialog" aria-controls="reward-entry-panel" @click="open('manual')"><Plus :size="15" aria-hidden="true" />添加奖励流水</button>
      <button ref="reportButton" type="button" class="entry-button" :class="{ active: mode === 'report' }" :disabled="disabled || locked" :aria-expanded="mode === 'report'" aria-haspopup="dialog" aria-controls="reward-entry-panel" @click="open('report')"><Upload :size="15" aria-hidden="true" />导入本地报告</button>
    </div>

    <Teleport to="body">
      <Transition name="reward-dialog">
        <div v-if="mode" class="reward-dialog-mask" :class="{ 'is-short-viewport': shortViewport }" :style="viewportStyle" role="presentation" @click.self="requestClose">
          <section
            id="reward-entry-panel"
            ref="dialogEl"
            @focusin="revealFocusedControl"
            class="reward-panel reward-dialog"
            :class="`mode-${mode}`"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reward-entry-title"
            :aria-describedby="locked ? 'reward-dialog-lock-status' : undefined"
            :aria-busy="busy"
            tabindex="-1"
            @keydown="onDialogKeydown"
          >
            <header class="panel-heading">
              <span class="heading-emblem" aria-hidden="true"><BookOpen v-if="mode === 'manual'" :size="25" /><ScrollText v-else :size="25" /></span>
              <div class="heading-copy"><span class="eyebrow">广陵库房 · {{ mode === 'manual' ? '奖励入簿' : '报告补传' }}</span><h3 id="reward-entry-title" ref="heading" tabindex="-1">{{ mode === 'manual' ? '添加奖励流水' : '导入本地报告' }}</h3></div>
              <div class="dialog-header-meta">
                <span class="account-badge"><span class="account-dot" />{{ accountName }}</span>
                <span v-if="locked" id="reward-dialog-lock-status" ref="lockNotice" class="dialog-lock-note" role="status" tabindex="-1">{{ closeLockMessage }}</span>
              </div>
              <button type="button" class="icon-button close-button" :aria-disabled="locked ? 'true' : 'false'" :aria-label="locked ? closeLockMessage : '关闭奖励工作台'" :title="locked ? closeLockMessage : '关闭奖励工作台'" @click="requestClose"><X :size="18" aria-hidden="true" /></button>
            </header>

            <div ref="scrollBody" class="reward-dialog-scroll">
              <div v-if="error" ref="errorBox" class="error-message" role="alert" tabindex="-1"><CircleAlert :size="17" aria-hidden="true" /><span>{{ error }}<a v-if="trainingByRuns && ['group', 'level', 'runs'].includes(trainingCalculation.field)" :href="`#${trainingErrorTarget}`" @click.prevent="focusTrainingError">返回历练字段</a></span></div>
              <div v-if="catalogLoading" class="loading-state" role="status">正在准备奖励目录…</div>
              <button v-else-if="!entities.length" type="button" class="outline-button retry-catalog" :disabled="busy" @click="loadCatalog">重新加载奖励目录</button>

      <form v-if="mode === 'manual' && entities.length" class="manual-form" novalidate @submit.prevent="previewManual">
        <fieldset :disabled="locked || !!result || disabled">
          <legend class="sr-only">填写奖励流水</legend>
          <div class="whitecoin-shortcuts">
            <div class="section-label">白金币日常快捷录入<span>可同时选择多个来源；每个来源每个游戏日仅记一笔</span></div>
            <div class="shortcut-options" role="group" aria-label="白金币日常来源">
              <button v-for="preset in WHITE_COIN_PRESETS" :key="preset.id" type="button" class="outline-button" :aria-pressed="manual.presets.some(entry => entry.id === preset.id)" @click="selectWhiteCoinPreset(preset)">{{ preset.channel }} {{ preset.count }}</button>
              <button v-if="manual.presets.length" type="button" class="outline-button" @click="manual.presets = []; manual.whiteCoinPurpose = ''; clearPreview()">普通补录</button>
            </div>
            <label v-if="manual.presets.length" class="whitecoin-purpose">本次记录用途<select v-model="manual.whiteCoinPurpose" aria-label="白金币记录用途" @change="clearPreview"><option value="">请选择记录用途</option><option value="income">新增收入（计入库存）</option><option value="annotation">补标已盘点收入（仅补历史）</option></select></label>
            <p v-if="manual.presets.length" class="shortcut-note">已被 MaaYuan 扫描或手动盘点包含的收入，请选择补标并填写实际发生时间；未经盘点的新收入才计入库存。游戏日按北京时间 05:00 划分。</p>
          </div>
          <div class="channel-section">
            <div class="section-label">获取渠道<span>选择本次奖励的来源</span></div>
              <div class="channel-options" role="group" aria-label="获取渠道">
                <button v-for="channel in REWARD_CHANNELS" :key="channel.id" type="button" class="channel-option" :class="{ selected: manual.channel === channel.id }" :aria-pressed="manual.channel === channel.id" @click="changeChannel(channel.id)">
                <component :is="channelIcons[channel.icon]" :size="20" aria-hidden="true" /><span><b>{{ channel.label }}</b><small>{{ channel.hint }}</small></span><span v-if="manual.channel === channel.id" class="channel-check"><Check :size="11" aria-hidden="true" /></span>
              </button>
            </div>
            <div class="reward-metadata">
              <label v-if="manual.channel === '手动补录' && !manual.presets.length" class="custom-channel-field"><span>自定义渠道名称 <small>例如：活动邮件、月卡奖励</small></span><input v-model.trim="manual.customChannel" type="text" maxlength="64" placeholder="填写这笔奖励的来源" @input="clearPreview" /></label>
              <RewardDateTimePicker v-model:date="manual.date" v-model:clock="manual.clock" :disabled="locked || !!result || disabled" @update:date="clearPreview" @update:clock="clearPreview" />
              <label v-if="requiresStamina" class="stamina-field"><span>消耗体力<small>本次派遣</small></span><span class="stamina-input"><Flame :size="16" aria-hidden="true" /><input v-model="manual.stamina" type="text" inputmode="numeric" aria-label="消耗体力" placeholder="填写实际消耗" @input="clearPreview" /><span>点</span></span></label>
              <p class="baseline-note"><History :size="14" aria-hidden="true" /><span>{{ manualBeforeLatestSnapshot ? '时间早于已知最新库存快照；服务端会保留这条历史，已被快照覆盖的数量不会再次增加当前库存。' : '奖励按实际发生时间入账；若已被较新完整或局部盘点覆盖，可能仅记录历史、不增加当前库存，以服务端结果为准。奖励流水不能代替完整盘点基准。' }}</span></p>
            </div>
          </div>
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
                <details class="training-level-settings">
                  <summary>常用关卡<ChevronDown :size="13" aria-hidden="true" /></summary>
                  <div class="training-settings-panel">
                  <p id="training-level-help" class="shortcut-note">勾选常刷的关卡，至少保留一关。三种历练共用此设置，按子账号和游戏保存在当前浏览器；取消常用不会改变已填写的关卡。</p>
                  <div class="training-level-options" role="group" aria-label="常用关卡" aria-describedby="training-level-help">
                    <label v-for="level in TRAINING_REWARD_LEVELS" :key="level" :class="{ selected: commonTrainingLevels.includes(level) }"><input type="checkbox" :value="level" :checked="commonTrainingLevels.includes(level)" :disabled="commonTrainingLevels.length === 1 && commonTrainingLevels.includes(level)" @change="changeCommonTrainingLevel(level, $event.target.checked)" />第 {{ level }} 关</label>
                  </div>
                  <label class="training-show-all"><input v-model="showAllTrainingLevels" type="checkbox" />显示全部 1–12 关</label>
                  </div>
                </details>
              </div>
              <div class="training-selection" aria-label="历练录入区">
                <div id="training-group" class="training-group-options" role="group" aria-label="历练类型" tabindex="-1" :aria-invalid="!!error && trainingInputError.field === 'group'" :aria-describedby="error && trainingInputError.field === 'group' ? 'training-error' : undefined">
                  <button v-for="group in TRAINING_REWARD_GROUPS" :key="group.id" type="button" class="outline-button" :aria-pressed="manual.training.draft.groupId === group.id" @click="manual.training.draft.groupId = group.id; changeTrainingDraft()">{{ group.name }}</button>
                </div>
                <p v-if="error && trainingInputError.field === 'group'" id="training-error" class="row-error" tabindex="-1">{{ trainingInputError.error }}</p>
                <div class="training-fields">
                  <label for="training-level">关卡<select id="training-level" v-model="manual.training.draft.level" :aria-invalid="!!error && trainingInputError.field === 'level'" :aria-describedby="error && trainingInputError.field === 'level' ? 'training-error' : undefined" @change="changeTrainingDraft"><option value="">请选择关卡</option><option v-for="level in trainingLevelOptions(manual.training.draft.level)" :key="level" :value="level">第 {{ level }} 关{{ !showAllTrainingLevels && !commonTrainingLevels.includes(level) ? '（当前选择）' : '' }}</option></select><span v-if="error && trainingInputError.field === 'level'" id="training-error" class="row-error" tabindex="-1">{{ trainingInputError.error }}</span></label>
                  <label for="training-runs">完成次数<span class="training-stepper"><button type="button" class="outline-button" aria-label="减少完成次数" :disabled="!canAdjustTrainingRuns(-1)" @click="adjustTrainingRuns(-1)">−</button><input id="training-runs" v-model="manual.training.draft.runs" type="text" inputmode="numeric" :aria-invalid="!!error && trainingInputError.field === 'runs'" :aria-describedby="error && trainingInputError.field === 'runs' ? 'training-error training-note' : 'training-note'" @input="changeTrainingDraft" /><button type="button" class="outline-button" aria-label="增加完成次数" :disabled="!canAdjustTrainingRuns(1)" @click="adjustTrainingRuns(1)">+</button></span><span v-if="error && trainingInputError.field === 'runs'" id="training-error" class="row-error" tabindex="-1">{{ trainingInputError.error }}</span></label>
                </div>
                <p v-if="trainingInputError.field === 'catalog' || trainingInputError.field === 'game'" class="row-error">{{ trainingInputError.error }}</p>
                <div v-if="trainingDraftResult.entries.length" class="training-draft-rewards" aria-label="本条预计获得"><span v-for="entry in trainingDraftResult.entries" :key="entry.id" class="training-reward-chip"><span class="reward-item-icon" aria-hidden="true"><img v-if="!failedImages.has(entry.id)" :src="iconSrc(entry)" alt="" width="24" height="24" @error="failedImages.add(entry.id)" /><span v-else>{{ entry.name.slice(0, 1) }}</span></span><span>{{ entry.name }} <strong>+{{ entry.count }}</strong></span></span></div>
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
              <p v-if="trainingLevelNotice" class="shortcut-note" role="status">{{ trainingLevelNotice }}</p>
              <details class="training-help"><summary><span>仅计算必得修为材料</span><span>掉落说明<ChevronDown :size="12" aria-hidden="true" /></span></summary><p id="training-note" class="shortcut-note">第 1、2 关各一种材料，其余各两种；额外掉落请按实际结果补录。次数可以超过 6。多条记录共用上方发生时间，不同发生时间请分别录入；确认补录后才入账。</p></details>
            </section>
            <section v-else class="reward-picker" aria-label="选择奖励">
              <div class="picker-heading"><h4>{{ manual.entityType === 'agent' ? '选择密探心纸' : '选择奖励道具' }}</h4><span>{{ manual.presets.length ? '日常来源在本次入账中调整；其他奖励请选择普通补录' : '点击图标增加，选中后从左下角减少' }}</span></div>
              <div v-if="manual.channel === '手动补录'" class="type-options" role="group" aria-label="奖励类型"><button v-for="type in [{ id: 'item', label: '背包道具' }, { id: 'agent', label: '密探心纸' }]" :key="type.id" type="button" :disabled="!!manual.presets.length" :class="{ selected: manual.entityType === type.id }" :aria-pressed="manual.entityType === type.id" @click="changeType(type.id)">{{ type.label }}</button></div>
              <div v-if="manual.channel !== '派遣-洛阳'" class="picker-tools">
                <label class="search-field"><Search :size="16" aria-hidden="true" /><input v-model="search" type="text" :aria-label="manual.entityType === 'agent' ? '搜索密探姓名' : '搜索奖励道具'" :placeholder="manual.entityType === 'agent' ? '搜索密探姓名…' : '搜索道具名称…'" /><button v-if="search" type="button" class="clear-search" aria-label="清空搜索" @click="search = ''"><X :size="14" aria-hidden="true" /></button></label>
                <div v-if="manual.entityType === 'agent'" class="rarity-options" role="group" aria-label="密探品质筛选"><button v-for="quality in qualities" :key="quality.id" type="button" :class="{ selected: rarity === quality.id }" :aria-pressed="rarity === quality.id" @click="rarity = quality.id">{{ quality.label }}</button></div>
                <label v-if="manual.entityType === 'agent'" class="prof-filter">属性<select v-model="agentProf" aria-label="密探属性筛选"><option value="">全部</option><option v-for="prof in AGENT_PROFS" :key="prof" :value="prof">{{ prof }}</option></select></label>
              </div>
              <div class="reward-grid" :class="{ 'agent-grid': manual.entityType === 'agent', 'luoyang-grid': manual.channel === '派遣-洛阳' }">
                <div v-for="entity in visibleOptions" :key="entity.id" class="reward-tile-wrap" :style="{ '--quality': qualityColor(entity.rarity) }">
                  <button type="button" class="reward-tile" :disabled="!!manual.presets.length" :class="{ chosen: countOf(entity.id) > 0, 'is-agent': entity.entity_type === 'agent' }" :aria-label="`添加${entity.name}，当前已选 ${countOf(entity.id)}`" @click="addReward(entity)">
                    <span class="tile-image"><img v-if="!failedImages.has(entity.id)" :src="iconSrc(entity)" alt="" loading="lazy" @error="failedImages.add(entity.id)" /><span v-else class="image-fallback">{{ entity.name.slice(0, 1) }}</span><span class="tile-plus" aria-hidden="true"><Plus :size="12" /></span></span>
                    <span class="tile-name">{{ entity.name }}</span><span v-if="countOf(entity.id)" class="tile-count">{{ countOf(entity.id) }}</span>
                  </button>
                  <button v-if="countOf(entity.id)" type="button" class="tile-minus" :aria-label="`减少${entity.name}，当前已选 ${countOf(entity.id)}`" @click="decreaseRewardFromTile(entity.id, $event)"><span><Minus :size="12" aria-hidden="true" /></span></button>
                </div>
              </div>
              <p v-if="!visibleOptions.length" class="empty-search">{{ manual.entityType === 'agent' ? '没有匹配的密探，试试其他名称、品质或属性。' : '没有匹配的奖励，试试其他名称。' }}</p>
              <p class="picker-caption">{{ entryOptions.length }} {{ manual.entityType === 'agent' ? '位密探可选' : '种道具可选' }}<span v-if="search || rarity || agentProf"> · 当前显示 {{ visibleOptions.length }} 项</span></p>
            </section>

            <aside class="reward-receipt" aria-label="本次入账清单">
              <div class="receipt-heading"><span class="eyebrow">本次入账</span><span class="receipt-mark" aria-hidden="true"><ScrollText :size="20" /></span><h4>奖励清单</h4></div>
              <div class="basket-heading"><span>已选 <b>{{ basketEntries.length }}</b> 项</span><button v-if="trainingByRuns || basketEntries.length" type="button" class="text-button" @click="clearBasket">清空</button></div>
              <div v-if="!basketEntries.length" class="basket-empty"><PackageOpen :size="32" aria-hidden="true" /><span>{{ trainingByRuns ? '请选择历练类型、关卡和次数' : '从左侧选取本次奖励' }}</span><small>{{ trainingByRuns ? '必得材料将自动计算' : '选中后可在这里调整数量' }}</small></div>
              <ul v-else class="basket-list"><li v-for="entry in basketEntries" :key="entry.id"><span class="basket-name" :class="{ 'training-material': manual.channel === '历练' }"><span v-if="manual.channel === '历练'" class="reward-item-icon" aria-hidden="true"><img v-if="!failedImages.has(entry.id)" :src="iconSrc(entry)" alt="" width="32" height="32" loading="lazy" @error="failedImages.add(entry.id)" /><span v-else>{{ entry.name.slice(0, 1) }}</span></span>{{ entry.name }}</span><strong v-if="trainingByRuns" class="training-count">+{{ entry.count }}</strong><template v-else><div class="quantity-control"><button type="button" :aria-label="`减少${entry.name}`" @click="adjustReward(entry, -1)"><Minus :size="12" aria-hidden="true" /></button><input :value="entry.count" type="text" inputmode="numeric" :aria-label="entry.channel ? entry.channel + '白金币数量' : `${entry.name}数量`" @input="setCount(entry, $event.target.value)" /><button type="button" :aria-label="`增加${entry.name}`" @click="adjustReward(entry, 1)"><Plus :size="12" aria-hidden="true" /></button></div><button type="button" class="remove-reward" :aria-label="`移除${entry.name}`" @click="removeReward(entry.id)"><X :size="13" aria-hidden="true" /></button></template></li></ul>
              <p v-if="manual.presets.length" class="shortcut-note">合计 {{ dailyCoinTotal }} 白金币，分别保存 {{ manual.presets.length }} 条来源流水。</p>
              <button type="submit" class="primary-button preview-button" :disabled="!trainingByRuns && !basketEntries.length"><span>{{ previewed ? '更新预览' : '预览本次流水' }}</span><ArrowRight :size="16" aria-hidden="true" /></button>
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

      <div v-if="previewed" class="preview-section">
        <p v-if="mode === 'manual' && manual.channel === '历练'" class="shortcut-note">子账号：{{ accountName }} · 游戏：{{ game || '未指定' }}。已自动上报或已在历史记录中的同批奖励请勿再次补录；不同来源的记录 ID 不会自动合并。</p>
        <div class="preview-heading"><h4>{{ mode === 'manual' ? '确认本次流水' : '报告中的库存记录' }}</h4><span class="preview-count" role="status" aria-live="polite">已选 <b>{{ selectedRecords.length }}</b> 条</span><div v-if="mode === 'report' && rows.length" class="preview-tools"><button type="button" class="text-button" :disabled="locked || !!result" @click="selectFailed">仅选失败</button><span>·</span><button type="button" class="text-button" :disabled="locked || !!result" @click="rows.forEach(row => row.selected = false)">清空选择</button></div></div>
        <p v-if="!rows.length" class="empty-search">报告中没有可补传的库存记录。</p>
        <ul v-else class="preview-list"><li v-for="row in rows" :key="row.key" :class="{ invalid: row.error, selected: row.selected }">
          <div v-if="row.record" class="preview-record">
            <label v-if="mode === 'report'" class="record-checkbox"><input v-model="row.selected" type="checkbox" :disabled="!!row.error || locked || !!result" :aria-label="`选择 ${row.record.acquisition_channel || '库存记录'} ${row.record.effective_at}`" /><span class="checkbox-art"><Check :size="13" aria-hidden="true" /></span></label>
            <div class="record-date"><small>{{ new Date(row.record.effective_at).getFullYear() }}</small><b>{{ displayDay(row.record.effective_at) }}</b><time :datetime="row.record.effective_at" :title="row.record.effective_at">{{ displayClock(row.record.effective_at) }}</time></div>
            <div class="record-body"><div class="record-title"><b>{{ row.record.acquisition_channel || '未注明渠道' }}</b><span class="record-status">{{ row.record.record_type === 'stock_snapshot' ? `库存快照 · ${row.record.snapshot_scope === 'full' ? '完整库存' : '列出条目'}` : '奖励增量' }}</span><span class="record-status" :class="{ failed: row.status?.includes('失败') }">{{ statusLabel(row.status) }}</span><span v-if="row.record.stamina_cost !== undefined" class="record-stamina"><Flame :size="12" aria-hidden="true" />{{ row.record.stamina_cost }}</span></div><div class="record-rewards"><span v-for="entry in row.record.entries" :key="entry.id"><span v-if="mode === 'manual' && row.record.acquisition_channel === '历练'" class="reward-item-icon" aria-hidden="true"><img v-if="!failedImages.has(entry.id)" :src="iconSrc(entry)" alt="" width="32" height="32" loading="lazy" @error="failedImages.add(entry.id)" /><span v-else>{{ (entry.name || entry.id).slice(0, 1) }}</span></span>{{ entry.name || entry.id }}<b>{{ row.record.record_type === 'stock_snapshot' ? '=' : '+' }} {{ entry.count }}</b></span></div></div>
            <button type="button" class="record-info" :aria-label="`查看${row.record.acquisition_channel || '库存记录'}记录详情`" :aria-expanded="expandedRows.has(row.key)" @click="toggleDetails(row.key)"><ChevronDown :size="16" :class="{ rotated: expandedRows.has(row.key) }" aria-hidden="true" /></button>
          </div>
          <div v-if="row.record && expandedRows.has(row.key)" class="record-details"><span>{{ row.record.effective_at }}</span><span>{{ row.status }}</span><span>{{ row.record.record_id }}</span></div>
          <p v-if="row.error" class="row-error">第 {{ row.block }} 个记录块：{{ row.error }}</p>
        </li></ul>
        <div v-if="!result" class="confirm-bar"><p><ShieldCheck :size="16" aria-hidden="true" /><span>{{ pendingDocument ? '本次内容已锁定，请原样重试确认结果。' : selectedRecords.some(record => record.snapshot_scope === 'full') ? '完整快照会按原始时间重设该类库存，未列出的条目归零；请核对账号、时间和数量。' : selectedRecords.some(record => record.record_type === 'stock_snapshot') ? '快照按原始时间更新列出项目的库存总量，零值也会更新；请核对账号、时间和数量。' : '请核对发生时间与奖励内容，再确认入账。' }}</span></p><button type="button" class="primary-button submit-button" :disabled="busy || disabled || !selectedRecords.length || selectedRecords.length > 1000" @click="submit"><Check :size="16" aria-hidden="true" />{{ busy ? '正在提交…' : pendingDocument ? '原样重试补录' : `${mode === 'report' ? '确认补传' : '确认补录'} ${selectedRecords.length} 条` }}</button></div>
      </div>
      <div v-if="result" ref="resultBox" class="result" role="status" tabindex="-1"><CircleCheck :size="23" aria-hidden="true" /><div><h4>{{ result.accepted === 0 && result.duplicates > 0 ? '记录已存在，未重复补录' : mode === 'report' ? '报告已补传' : '奖励已入簿' }}</h4><p>接受 {{ result.accepted }} 条 · 重复 {{ result.duplicates }} 条 · 仅历史 {{ result.history_only }} 条 · 已归档 {{ result.superseded }} 条</p><ul v-if="result.warnings?.length"><li v-for="(warning, index) in result.warnings" :key="index">{{ warningText(warning) }}</li></ul></div><button type="button" class="outline-button" @click="startNext">{{ mode === 'manual' ? '再添加一条' : '继续导入' }}<ArrowRight :size="14" aria-hidden="true" /></button></div>
              <footer class="panel-footnote"><Info :size="13" aria-hidden="true" />{{ mode === 'report' ? '奖励补齐获得量，快照保留库存总量；服务端按原时间与记录 ID 处理历史和去重。' : '历史奖励会补齐获得量；已被较新库存快照覆盖的部分，不重复增加库存。' }}</footer>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useModalViewport } from '../../composables/useModalViewport.js'
import { Plus, Minus, Upload, X, Check, BookOpen, ScrollText, Bird, Flower2, Pencil, Search, Flame, PackageOpen, ArrowRight, ArrowUpRight, FileCheck2, ClipboardPaste, ChevronDown, CircleAlert, CircleCheck, ShieldCheck, Info, History } from '@lucide/vue'
import { getCurrent, importInventory } from '../../api/inventory.js'
import { getRewardCatalog } from '../../api/rewardCatalog.js'
import { buildRewardDocument, buildReportDocument, parseRewardReport } from '../../data/inventory/rewardImport.js'
import { REWARD_CHANNELS, WHITE_COIN_PRESETS, dailyWhiteCoinRecordId, validateWhiteCoinAnnotation, rewardOptionsForChannel, validateManualRewardChannel, manualAcquisitionChannel, manualRewardTimestamp } from '../../data/inventory/rewardChannels.js'
import { agentMatchesGame } from '../../data/inventory/agentManifest.js'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { TRAINING_REWARD_GROUPS, TRAINING_REWARD_LEVELS, DEFAULT_TRAINING_REWARD_LEVELS, calculateTrainingRewards, calculateTrainingRewardBatch, trainingRewardUnavailableReason } from '../../data/inventory/trainingRewards.js'
import RewardDateTimePicker from './RewardDateTimePicker.vue'

const props = defineProps({ accountId: { type: String, default: '' }, accountName: { type: String, default: '当前账号' }, game: { type: String, default: '' }, latestInventoryAt: { type: String, default: '' }, disabled: Boolean })
const emit = defineEmits(['imported', 'busy'])
const mode = ref('')
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
const { viewportStyle, shortViewport, revealFocusedControl } = useModalViewport(() => !!mode.value, scrollBody, dialogEl)
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
const search = ref('')
const rarity = ref(0)
const agentProf = ref('')
const failedImages = ref(new Set())
const expandedRows = ref(new Set())
const locked = computed(() => busy.value || checkingBaseline.value || !!pendingDocument.value)
const closeLockMessage = computed(() => {
  if (checkingBaseline.value) return '正在核对白金币库存盘点，请等待完成。'
  if (busy.value) return '正在提交本次入账，请等待完成后再关闭工作台。'
  if (pendingDocument.value) return '上次提交结果未确认，请先原样重试；为避免重复入账，当前工作台暂不能关闭。'
  return ''
})
const selectedRecords = computed(() => rows.value.filter(row => row.selected && !row.error).map(row => row.record))
const channelIcons = { bird: Bird, flower: Flower2, scroll: ScrollText, book: BookOpen, pencil: Pencil }
const qualities = [{ id: 0, label: '全部' }, { id: 5, label: '金' }, { id: 4, label: '紫' }, { id: 3, label: '蓝' }]
let fileReadSeq = 0
let disposed = false
let trainingSelectionKey = 0
function freshManual() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString()
  return { date: local.slice(0, 10), clock: local.slice(11, 19), channel: '派遣-洛阳', customChannel: '', entityType: 'item', stamina: '', entries: [], presets: [], whiteCoinPurpose: '', training: freshTraining() }
}
function freshTrainingSelection() { return { key: ++trainingSelectionKey, groupId: '', level: '', runs: '1' } }
function freshTraining() { return { mode: trainingRewardUnavailableReason(props.game) ? 'materials' : 'runs', selections: [], draft: freshTrainingSelection(), dirty: false, editingKey: null, notice: '', replacePrompt: false } }
const manual = ref(freshManual())
switchDraftBaseline = JSON.stringify(manual.value)
function resetManual() { manual.value = freshManual(); switchDraftBaseline = JSON.stringify(manual.value) }
const trainingUnavailable = computed(() => trainingRewardUnavailableReason(props.game))
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
function trainingLevelOptions(selectedLevel) { return TRAINING_REWARD_LEVELS.filter(level => showAllTrainingLevels.value || commonTrainingLevels.value.includes(level) || selectedLevel === level) }
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
const dailyCoinTotal = computed(() => {
  const counts = manual.value.presets.map(preset => Number(preset.count))
  return counts.every(Number.isFinite) ? counts.reduce((total, count) => total + count, 0) : '—'
})
const entryOptions = computed(() => rewardOptionsForChannel(manual.value.channel, entities.value, manual.value.entityType))
const visibleOptions = computed(() => entryOptions.value.filter(entity => (!rarity.value || entity.rarity === rarity.value) && (!agentProf.value || (Array.isArray(entity.prof) ? entity.prof.includes(agentProf.value) : entity.prof === agentProf.value)) && (!search.value.trim() || entity.name.includes(search.value.trim()) || entity.id.toLowerCase().includes(search.value.trim().toLowerCase()))))
const requiresStamina = computed(() => manual.value.channel.includes('派遣') || (manual.value.channel === '手动补录' && manual.value.customChannel.trim().includes('派遣')))
const manualBeforeLatestSnapshot = computed(() => {
  if (!props.latestInventoryAt || !manual.value.date || !manual.value.clock) return false
  const selected = Date.parse(`${manual.value.date}T${manual.value.clock}`)
  const latest = Date.parse(props.latestInventoryAt)
  return Number.isFinite(selected) && Number.isFinite(latest) && selected < latest
})
const counts = computed(() => new Map(manual.value.entries.map(entry => [entry.id, entry.count])))
const countOf = id => counts.value.get(id) || 0
const qualityColor = rarity => ({ 5: 'var(--accent)', 4: 'var(--brand-blue)', 3: 'var(--line)' })[rarity] || 'var(--line)'
const iconSrc = entity => `${import.meta.env.BASE_URL}inventory-icons/${entity.entity_type === 'agent' ? 'agents' : 'items'}/${encodeURIComponent(entity.id)}.png`
const focusableSelector = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
let restoreFocusEl = null
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

function focusableDialogElements() {
  if (!dialogEl.value) return []
  return Array.from(dialogEl.value.querySelectorAll(focusableSelector)).filter(element => {
    return element instanceof HTMLElement &&
      !element.hasAttribute('hidden') &&
      !element.disabled
  })
}

watch(locked, value => emit('busy', value), { flush: 'sync' })
watch(mode, async (value, previous) => {
  if (value && !previous) {
    lockBackgroundScroll()
    await nextTick()
    heading.value?.focus({ preventScroll: true })
    return
  }
  if (!value && previous) {
    unlockBackgroundScroll()
    const trigger = restoreFocusEl || (previous === 'manual' ? manualButton.value : reportButton.value)
    restoreFocusEl = null
    await nextTick()
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true })
  }
})
watch(() => [props.accountId, props.game], () => {
  loadTrainingLevelPreference()
  fileReadSeq++
  readingFile.value = false
  mode.value = ''
  entities.value = []
  pendingDocument.value = null
  reportText.value = ''
  fileName.value = ''
  showPaste.value = false
  resetManual()
  search.value = ''; rarity.value = 0; agentProf.value = ''
  clearPreview()
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
  if (catalogLoading.value) return
  const targetAccount = props.accountId
  const targetGame = props.game
  const targetMode = mode.value
  catalogLoading.value = true
  clearPreview()
  entities.value = []
  try {
    const catalog = await getRewardCatalog()
    if (props.accountId !== targetAccount || props.game !== targetGame || mode.value !== targetMode) return
    if (!catalog.length) throw new Error('奖励目录为空，请稍后重试')
    entities.value = mode.value === 'report' ? catalog : catalog.filter(entity => entity.entity_type !== 'agent' || agentMatchesGame(entity, props.game))
  } catch (err) {
    if (props.accountId === targetAccount && props.game === targetGame && mode.value === targetMode) await showError(err.message || '奖励目录加载失败')
  }
  finally { catalogLoading.value = false }
}
async function open(nextMode, trigger) {
  if (props.disabled || locked.value) return
  if (!mode.value) restoreFocusEl = trigger || (nextMode === 'manual' ? manualButton.value : reportButton.value)
  if (mode.value !== nextMode) {
    if (mode.value === 'manual' && result.value) resetManual()
    fileReadSeq++; readingFile.value = false; clearPreview()
  }
  mode.value = nextMode
  // 每次打开重新核对目录，避免管理员删改密探后继续使用页面内缓存。
  await loadCatalog()
}
defineExpose({ mode, openManual: trigger => open('manual', trigger), openReport: trigger => open('report', trigger), hasDraft: () => !result.value && (JSON.stringify(manual.value) !== switchDraftBaseline || !!reportText.value.trim() || readingFile.value) })
function close() {
  if (locked.value) return
  if (mode.value === 'manual' && result.value) resetManual()
  fileReadSeq++; readingFile.value = false
  mode.value = ''
}
async function requestClose() {
  if (!locked.value) {
    close()
    return
  }
  await nextTick()
  lockNotice.value?.focus({ preventScroll: true })
}
function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    requestClose()
    return
  }
  if (event.key !== 'Tab') return
  const items = focusableDialogElements()
  if (!items.length) {
    event.preventDefault()
    heading.value?.focus({ preventScroll: true })
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  const current = document.activeElement
  if (!items.includes(current)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  } else if (event.shiftKey && current === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && current === last) {
    event.preventDefault()
    first.focus()
  }
}
function clearPreview() { rows.value = []; previewed.value = false; result.value = null; error.value = ''; expandedRows.value.clear() }
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
    manual.value.entries = trainingCalculation.value.entries.map(({ id, name, count }) => ({ id, name, count }))
  }
  manual.value.training.mode = nextMode
  manual.value.training.replacePrompt = false
  clearPreview()
}
function focusTrainingError() { document.getElementById(trainingErrorTarget.value)?.focus() }
function changeTrainingDraft() { manual.value.training.dirty = true; manual.value.training.notice = ''; clearPreview() }
function trainingSelectionLabel(selection) { return `${TRAINING_REWARD_GROUPS.find(group => group.id === selection.groupId)?.name || ''} · 第 ${selection.level} 关` }
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
  manual.value.channel = channel
  manual.value.entityType = REWARD_CHANNELS.find(item => item.id === channel).entityType || manual.value.entityType
  const allowed = new Set(entryOptions.value.map(entry => entry.id))
  manual.value.entries = manual.value.entries.filter(entry => allowed.has(entry.id))
  manual.value.stamina = ''
  search.value = ''; rarity.value = 0; agentProf.value = ''
  clearPreview()
}
function selectWhiteCoinPreset(preset) {
  if (manual.value.presets.some(entry => entry.id === preset.id)) {
    removeReward(preset.id)
  } else {
    changeChannel('手动补录')
    manual.value.presets.push({ ...preset, name: `白金币 · ${preset.channel}` })
  }
  manual.value.entityType = 'item'
  manual.value.entries = []
  manual.value.customChannel = ''
  search.value = ''; rarity.value = 0; agentProf.value = ''
  clearPreview()
}
function changeType(type) { manual.value.entityType = type; manual.value.entries = []; search.value = ''; rarity.value = 0; agentProf.value = ''; clearPreview() }
function addReward(entity) {
  const entry = manual.value.entries.find(entry => entry.id === entity.id)
  if (entry) adjustReward(entry, 1)
  else { manual.value.entries.push({ id: entity.id, name: entity.name, count: entity.id === 'baijinbi' ? 10 : 1 }); clearPreview() }
}
function adjustReward(entry, delta) {
  const value = Number(entry.count)
  const step = entry.id === 'baijinbi' || entry.channel ? 10 : 1
  const next = (Number.isInteger(value) ? value : 0) + (delta * step)
  if (next <= 0) removeReward(entry.id)
  else { entry.count = Math.min(2147483647, next); clearPreview() }
}
function decreaseRewardFromTile(id, event) {
  const entry = manual.value.entries.find(entry => entry.id === id)
  if (!entry) return
  const addButton = event.currentTarget.previousElementSibling
  adjustReward(entry, -1)
  if (!manual.value.entries.some(entry => entry.id === id)) nextTick(() => addButton.focus())
}
function setCount(entry, value) { entry.count = value; clearPreview() }
function removeReward(id) {
  manual.value.entries = manual.value.entries.filter(entry => entry.id !== id)
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
  const targetAccount = props.accountId
  const draft = manual.value
  try {
    if (trainingByRuns.value && trainingCalculation.value.error) throw new TypeError(trainingCalculation.value.error)
    if (draft.presets.length && !['income', 'annotation'].includes(draft.whiteCoinPurpose)) throw new Error('请选择新增收入或补标已盘点收入')
    const effectiveAt = manualRewardTimestamp(draft.date, draft.clock)
    const base = { record_type: 'reward_delta', entity_type: draft.entityType, effective_at: effectiveAt,
      ...(requiresStamina.value ? { stamina_cost: /^\d+$/.test(draft.stamina) ? Number(draft.stamina) : undefined } : {}) }
    const count = value => /^\d+$/.test(String(value)) ? Number(value) : NaN
    const records = draft.presets.length ? draft.presets.map(preset => ({
      ...base, record_id: dailyWhiteCoinRecordId(preset.id, effectiveAt), acquisition_channel: preset.channel,
      entries: [{ id: 'baijinbi', name: '白金币', count: count(preset.count) }],
    })) : [{ ...base, record_id: `yuanhub:reward:${crypto.randomUUID()}`,
      acquisition_channel: manualAcquisitionChannel(draft.channel, draft.customChannel),
      entries: (trainingByRuns.value ? trainingCalculation.value.entries : draft.entries).map(entry => ({ id: entry.id, name: entry.name, count: count(entry.count) })) }]
    records.forEach(record => validateManualRewardChannel(record, entities.value, draft.channel))
    if (draft.presets.length && draft.whiteCoinPurpose === 'annotation') {
      checkingBaseline.value = true
      const current = await getCurrent({ accountId: targetAccount, entityType: 'item' })
      if (disposed || props.accountId !== targetAccount || manual.value !== draft || mode.value !== 'manual') return
      validateWhiteCoinAnnotation(current, effectiveAt)
    }
    const doc = buildRewardDocument(records, targetAccount, entities.value)
    rows.value = doc.records.map(record => ({ key: record.record_id, block: 1, record, status: draft.whiteCoinPurpose === 'annotation' ? '补标已盘点收入' : '手动添加', selected: true, error: '' }))
    previewed.value = true
    await nextTick()
    heading.value?.closest('.reward-panel')?.querySelector('.preview-section')?.scrollIntoView({ block: 'nearest' })
  } catch (err) { if (!disposed && props.accountId === targetAccount && manual.value === draft) showError(err.message) }
  finally { checkingBaseline.value = false }
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
  if (busy.value || props.disabled || result.value) return
  error.value = ''
  const targetAccount = props.accountId
  const targetDraft = manual.value
  try {
    busy.value = true
    if (!pendingDocument.value && mode.value === 'manual' && manual.value.presets.length && manual.value.whiteCoinPurpose === 'annotation') {
      const current = await getCurrent({ accountId: targetAccount, entityType: 'item' })
      if (disposed || props.accountId !== targetAccount || manual.value !== targetDraft) return
      validateWhiteCoinAnnotation(current, selectedRecords.value[0]?.effective_at)
    }
    if (!pendingDocument.value) pendingDocument.value = mode.value === 'report'
      ? buildReportDocument(selectedRecords.value, targetAccount, entities.value, props.game)
      : buildRewardDocument(selectedRecords.value, targetAccount, entities.value)
    const response = await importInventory(pendingDocument.value)
    if (disposed || props.accountId !== targetAccount || manual.value !== targetDraft) return
    if (!response || !['accepted', 'duplicates', 'history_only', 'superseded'].every(key => Number.isInteger(response[key]) && response[key] >= 0)) throw new Error('未收到有效的补录结果，请原样重试确认状态')
    result.value = response; pendingDocument.value = null
    emit('imported', targetAccount)
    await nextTick()
    resultBox.value?.focus({ preventScroll: true })
  } catch (err) {
    if (!disposed && props.accountId === targetAccount && manual.value === targetDraft) {
      if ([400, 401, 403, 404, 409, 422].includes(err.status)) pendingDocument.value = null
      await showError(err.status === 409 && manual.value.presets.length ? '所选日常来源已有记录，未重复入账。请在操作历史核对原记录，取消已记录的来源后补录其他来源；修正时先删除原记录。' : err.message || '补录失败，请重试')
    }
  } finally { busy.value = false }
}
function startNext() { clearPreview(); resetManual(); reportText.value = ''; fileName.value = ''; search.value = ''; rarity.value = 0; agentProf.value = '' }
function warningText(warning) { return typeof warning === 'string' ? warning : warning?.message || JSON.stringify(warning) }
function displayDay(value) { return new Date(value).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) }
function displayClock(value) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) }
function statusLabel(value) { return value?.includes('失败') ? '上报失败' : value?.includes('成功') ? '已上报' : ['手动添加', '补标已盘点收入'].includes(value) ? value : '待核对' }
onBeforeUnmount(() => { disposed = true; unlockBackgroundScroll(); emit('busy', false) })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.reward-workspace, .reward-dialog-mask { color: var(--ink); }
.whitecoin-shortcuts { border-bottom: 1px solid var(--line); }
.shortcut-options [aria-pressed="true"], .training-group-options [aria-pressed="true"] { background: var(--cream); border-color: var(--reward-gold); }
.whitecoin-purpose select { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
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
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, .error-message:focus, .dialog-lock-note:focus, .result:focus { outline: 2px solid var(--tea); outline-offset: 3px; }
h3:focus { outline: none; }
input, textarea { appearance: none; border-radius: 0; }
input:disabled { cursor: not-allowed; }
.entry-button, .outline-button, .primary-button { border: 1px solid var(--line); border-radius: 10px; }
.entry-button { background: var(--surface); box-shadow: 0 3px 8px -6px rgba(73,59,44,.3); }
.entry-button:hover:not(:disabled), .entry-button.active { background: var(--cream); border-color: var(--reward-gold); }
.entry-button.active { box-shadow: inset 0 -2px 0 var(--reward-gold); }
.muted { color: var(--ink-60); }
.reward-dialog-enter-active, .reward-dialog-leave-active { transition: opacity .2s var(--ease); }
.reward-dialog-enter-active .reward-dialog, .reward-dialog-leave-active .reward-dialog { transition: transform .2s var(--ease), opacity .2s var(--ease); }
.reward-dialog-enter-from, .reward-dialog-leave-to { opacity: 0; }
.reward-dialog-enter-from .reward-dialog, .reward-dialog-leave-to .reward-dialog { opacity: 0; }
.reward-dialog-mask { background: rgba(73,59,44,.5); backdrop-filter: blur(6px); }
.reward-panel { border: 1px solid var(--reward-gold-soft); border-radius: 20px; background: var(--surface); box-shadow: 0 32px 90px -34px rgba(73,59,44,.48), 0 2px 6px rgba(73,59,44,.06); }
.reward-panel::before { content: ''; border: 1px solid var(--reward-gold-soft); border-radius: 15px; pointer-events: none; }
.panel-heading { border-bottom: 1px solid var(--line); background: linear-gradient(110deg, var(--cream), var(--surface) 70%); border-radius: 20px 20px 0 0; }
.heading-emblem { border-radius: 50%; color: var(--reward-gold); border: 1px solid var(--reward-gold-soft); box-shadow: 0 0 0 4px var(--surface), 0 0 0 5px var(--reward-gold-soft); }
.eyebrow { color: var(--ink-60); }
.account-badge { border: 1px solid var(--line); border-radius: 99px; }
.account-dot { background: var(--reward-gold); border-radius: 50%; }
.dialog-lock-note { color: var(--rouge); }
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
.channel-option.selected > svg { color: var(--tea); }
.channel-check { border-radius: 50%; background: var(--tea); color: var(--cream); border: 2px solid var(--surface); }
.custom-channel-field small { color: var(--ink-60); }
.custom-channel-field input { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); outline: none; }
.custom-channel-field input:focus { outline: 2px solid var(--tea); outline-offset: 2px; }
.manual-columns { border-top: 1px solid var(--line); }
.picker-heading > span { color: var(--ink-60); }
.search-field { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink-60); }
.search-field input { background: transparent; border: 0; outline: none; }
.search-field:focus-within { outline: 2px solid var(--tea); outline-offset: 2px; }
.rarity-options, .type-options { border-radius: 8px; background: var(--cream); border: 1px solid var(--line); }
.rarity-options button, .type-options button { border-radius: 5px; }
.rarity-options .selected, .type-options .selected { background: var(--surface); color: var(--tea); box-shadow: 0 1px 4px rgba(73,59,44,.1); }
.prof-filter select { border: 1px solid var(--line); border-radius: 8px; background: var(--cream); }
.reward-grid { scrollbar-color: var(--reward-gold-soft) transparent; }
.reward-tile { border: 1px solid transparent; border-radius: 12px; }
.reward-tile:hover:not(:disabled) { background: var(--cream); border-color: var(--line); }
.reward-tile.chosen { background: var(--cream); border-color: var(--reward-gold); }
.tile-image { border-radius: 11px; background: radial-gradient(ellipse at center, var(--paper), transparent 72%); }
.is-agent .tile-image { border-radius: 11px; border: 0; background: radial-gradient(ellipse at center, var(--paper), transparent 72%); }
.is-agent img { border-radius: 0; }
.tile-plus { border: 1px solid var(--line); border-radius: 50%; background: var(--surface); color: var(--ink-60); }
.chosen .tile-plus { color: var(--tea); border-color: var(--reward-gold); }
.tile-minus { color: var(--tea); }
.tile-minus span { border: 1px solid var(--reward-gold); border-radius: 50%; background: var(--surface); }
.tile-minus:hover:not(:disabled) span { background: var(--paper); }
.tile-count { background: var(--tea); color: var(--cream); border: 2px solid var(--surface); border-radius: 99px; }
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
.stamina-input:focus-within { outline: 2px solid var(--tea); outline-offset: 2px; }
.baseline-note { color: var(--ink-60); }
.baseline-note svg { color: var(--reward-gold); }
.text-button { color: var(--ink-60); }
.text-button:hover:not(:disabled) { color: var(--tea); text-decoration: underline; text-underline-offset: 3px; }
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
.primary-button { background: var(--tea); color: var(--cream); border-color: var(--tea); box-shadow: inset 0 0 0 2px rgba(255,248,236,.08), 0 5px 12px -8px var(--tea); }
.primary-button:hover:not(:disabled) { background: var(--ink); }
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
.record-checkbox input:checked + .checkbox-art { background: var(--tea); border-color: var(--tea); color: var(--cream); }
.record-checkbox input:focus-visible + .checkbox-art { outline: 2px solid var(--tea); outline-offset: 3px; }
.record-checkbox input:disabled + .checkbox-art { opacity: .4; }
.record-date { border-right: 1px solid var(--line); }
.record-date small { color: var(--ink-60); }
.record-date time { color: var(--ink-60); }
.record-status { border: 1px solid var(--line); border-radius: 5px; color: var(--ink-60); }
.record-status.failed { color: var(--rouge); border-color: rgba(166,81,74,.2); }
.record-stamina { color: var(--ink-60); }
.record-info { color: var(--ink-60); border-radius: 6px; }
.record-info:hover { background: var(--cream); }
.record-details { background: var(--cream); border-radius: 7px; }
.confirm-bar p { color: var(--ink-60); }
.panel-footnote { border-top: 1px solid var(--line); color: var(--ink-60); }
.error-message { color: var(--rouge); background: var(--cream); border: 1px solid rgba(166,81,74,.25); border-radius: 9px; }
.row-error { color: var(--rouge); }
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
.training-level-settings summary { color: var(--tea); list-style: none; }
.training-level-settings[open] summary > svg, .training-help[open] summary svg { transform: rotate(180deg); }
.training-selection { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.training-group-options { background: var(--cream); border-radius: 9px; }
.training-group-options .outline-button { border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--ink-60); }
.training-group-options .outline-button[aria-pressed="true"] { color: var(--tea); background: var(--surface); border-color: var(--line); box-shadow: 0 1px 3px -2px var(--tea); }
.training-stepper { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.training-stepper .outline-button { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.training-fields .training-stepper input { border: 0; border-radius: 0; background: transparent; }
.training-stepper:focus-within { outline: 2px solid var(--tea); outline-offset: 2px; }
.training-stepper input:focus-visible { outline: none; }
.training-stepper button:focus-visible { outline: 2px solid var(--tea); outline-offset: -4px; }
.training-reward-chip { color: var(--ink-60); }
.training-reward-chip strong { color: var(--tea); }
.training-entry-actions .add-training { border-color: var(--reward-gold-soft); background: var(--cream); color: var(--tea); box-shadow: none; }
.training-help summary { color: var(--ink-60); cursor: pointer; list-style: none; }
.training-help summary > span:last-child { color: var(--tea); }
.training-picker summary:focus-visible, #training-group:focus-visible { outline: 2px solid var(--tea); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  button, .reward-dialog-enter-active, .reward-dialog-leave-active, .reward-dialog-enter-active .reward-dialog, .reward-dialog-leave-active .reward-dialog { transition: none; }
}
</style>
<style scoped src="./rewardEntryWorkspaceDesktop.css"></style>
<style scoped src="./rewardEntryWorkspaceMobile.css"></style>
