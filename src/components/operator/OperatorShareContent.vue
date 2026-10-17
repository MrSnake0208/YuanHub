<template>
  <div ref="contentPanel" class="operator-share-content" :class="{ 'is-embedded': embedded }" tabindex="-1">
    <h3 v-if="embedded && status !== 'input'" class="box-step-title box-results-title"><span class="box-step-number" aria-hidden="true">2</span>查看公开内容</h3>
    <form v-if="status === 'input'" class="share-entry" @submit.prevent="submitToken">
      <template v-if="!embedded">
        <span class="section-kicker">公开查看</span>
        <h2>输入 BOX 分享码</h2>
        <p>可粘贴代码，也可粘贴完整分享链接。</p>
      </template>
      <label :for="inputId" :class="{ 'box-step-title': embedded }"><span v-if="embedded" class="box-step-number" aria-hidden="true">1</span>{{ embedded ? '输入分享码或分享链接' : 'BOX 分享码或分享链接' }}</label>
      <div class="share-entry-row">
        <input
          :id="inputId" ref="input"
          v-model="inputValue"
          autocomplete="off"
          inputmode="text"
          :aria-invalid="!!inputError"
          :aria-describedby="inputError ? inputId + '-error' : undefined"
          :placeholder="embedded ? '粘贴他人的分享码或完整链接…' : '例如：550e8400-e29b-41d4-a716-446655440000'"
        />
        <button type="submit"><Search v-if="embedded" :size="16" aria-hidden="true" />{{ embedded ? '查看 BOX' : '查看密探 BOX' }}</button>
      </div>
      <p v-if="inputError" :id="inputId + '-error'" class="entry-error" role="alert">{{ inputError }}</p>
      <div v-if="starTarget" class="share-star-notice" role="status">
        <p>这是星石背包分享链接，可在新标签中查看。</p>
        <a class="btn ghost" :href="sharePath(starTarget.token, 'star')" target="_blank" rel="noopener noreferrer">在新标签打开星石背包</a>
      </div>
      <template v-if="embedded">
        <section class="box-preview" :aria-labelledby="inputId + '-preview-title'">
          <h3 :id="inputId + '-preview-title'" class="box-step-title"><span class="box-step-number" aria-hidden="true">2</span>查看公开内容</h3>
          <div class="box-preview-empty">
            <span class="box-preview-art" aria-hidden="true"><BookUser :size="42" :stroke-width="1.4" /><Search :size="24" class="box-preview-search" /></span>
            <strong>输入分享码后，在这里查看公开的密探档案</strong>
            <p>粘贴分享码或完整链接，点击「查看 BOX」即可。</p>
          </div>
        </section>
        <aside class="share-entry-notice" aria-label="公开查看提示">
          <ShieldCheck :size="18" aria-hidden="true" />
          <div><strong>小提示</strong><p>仅展示对方已公开的内容，无需登录。</p><p>查看过程为只读，不会修改你的密探档案。</p></div>
        </aside>
      </template>
    </form>

    <div v-else-if="status === 'loading'" class="share-state" role="status" aria-live="polite">
      <span class="state-mark" aria-hidden="true">…</span>
      <h2>正在打开密探 BOX</h2>
      <p>正在同步公开养成数据与密探图鉴。</p>
      <button type="button" @click="resetInput">重新输入</button>
    </div>

    <div v-else-if="status === 'not-found'" class="share-state is-error" role="alert">
      <span class="state-mark" aria-hidden="true"><X :size="16" aria-hidden="true" /></span>
      <h2>分享码不存在或已失效</h2>
      <p>分享可能已被撤销、重新生成，或分享码输入有误。可返回输入框检查代码。</p>
      <button type="button" @click="resetInput">重新输入</button>
    </div>

    <div v-else-if="status === 'unauthorized'" class="share-state is-error" role="alert">
      <h2>分享者尚未公开密探 BOX</h2>
      <p>此分享码没有密探授权，请向分享者确认。</p>
      <button type="button" @click="loadShare">重试</button>
      <button type="button" @click="resetInput">重新输入</button>
    </div>

    <div v-else-if="status === 'error'" class="share-state is-error" role="alert">
      <span class="state-mark" aria-hidden="true"><CircleAlert :size="16" aria-hidden="true" /></span>
      <h2>暂时无法加载</h2>
      <p>{{ loadError }}</p>
      <div class="state-actions">
        <button type="button" @click="loadShare">重试</button>
        <button type="button" class="ghost" @click="resetInput">重新输入</button>
      </div>
    </div>

    <template v-else>
      <div class="share-toolbar" aria-label="分享页操作">
        <p>此页面只读 · 图鉴 {{ share.catalog_version || '—' }}<br>数据更新于 <time :datetime="share.updated_at || undefined">{{ formatDate(share.updated_at) }}</time></p>
        <button type="button" @click="loadShare">刷新数据</button>
        <button type="button" class="ghost" @click="resetInput">重新输入</button>
      </div>

      <OperatorFilterDossier
        v-if="status === 'ready'"
        v-model:search-query="searchQuery"
        v-model:prof-filter="profFilter"
        v-model:sub-prof-filter="subProfFilter"
        v-model:status-filter="statusFilter"
        class="share-filter-dossier"
        context-label="分享密探"
        description="筛选后按品质、等级、化极、属性与实装顺序排列"
        :result-count="filteredEntries.length"
        :total-count="entries.length"
        :prof-options="profOptions"
        :sub-prof-options="availableSubProfOptions"
        :status-options="shareStatusOptions"
        :status-counts="shareStatusCounts"
        :prof-icon="profIcon"
        :has-filters="hasFilters"
        searchable
        search-placeholder="搜索名称 / 别名 / ID"
        @reset="clearFilters"
      />

      <div v-if="status === 'empty'" class="share-state">
        <span class="state-mark" aria-hidden="true">0</span>
        <h2>这个密探 BOX 还是空的</h2>
        <p>分享已生效，但当前没有可展示的密探养成数据。</p>
      </div>

      <div v-else-if="!filteredEntries.length" class="share-state">
        <span class="state-mark" aria-hidden="true"><SearchX :size="16" aria-hidden="true" /></span>
        <h2>没有匹配的密探</h2>
        <p>当前搜索或筛选条件没有找到分享中的密探。</p>
        <button type="button" @click="clearFilters">清空条件</button>
      </div>

      <div v-else class="current-ledger share-ledger">
        <div class="current-ledger-meta">
          <span>版本「{{ share.game || '—' }}」 · {{ filteredEntries.length }} 位密探</span>
          <span>只读展示分享数据</span>
        </div>
        <div class="operator-grid agent-ledger-grid" role="list">
          <article
            v-for="entry in filteredEntries"
            :key="entry.id"
            class="operator-card agent-ledger-card agent-ledger-card--share"
            :class="['status-' + shareStatusClass(entry), ledgerCardVersionClass, { ['rarity-r' + (entry.rarity || 3)]: ledgerCardIsV3 }]"
            role="listitem"
          >
            <picture
              v-if="ledgerCardIsV3 && operatorPortraits[entry.id] && !failedPortraitIds.has(entry.id)"
              class="ledger-portrait"
              aria-hidden="true"
            >
              <img :src="operatorPortraits[entry.id]" alt="" width="480" height="350" loading="lazy" decoding="async" @error="failedPortraitIds.add(entry.id)" />
            </picture>
            <header
              class="ledger-card-head"
              :class="{
                'share-identity--two-char': Array.from(entry.name).length === 2,
                'share-identity--three-char': Array.from(entry.name).length === 3,
                'share-identity--chendeng-sp': entry.id === 'char_084_chendengsp' && entry.name === '陈登·黍王',
                'share-identity--shizimiao-sp': entry.id === 'char_085_shizimiaosp' && entry.name === '史子眇·赴烛',
              }"
            >
              <div class="ledger-avatar">
                <img v-if="entry.avatar && !failedAvatarIds.has(entry.id)" :src="avatarUrl(entry.avatar)" :alt="entry.name + '头像'" loading="lazy" @error="failedAvatarIds.add(entry.id)" />
                <span v-else aria-hidden="true">{{ monogram(entry) }}</span>
              </div>
              <div class="ledger-identity">
                <div class="ledger-name-row ledger-name-tab">
                  <h3
                    :class="{
                      'is-three-char-name': Array.from(entry.name).length === 3,
                      'is-long-name': Array.from(entry.name).length > 3,
                    }"
                    :title="entry.name"
                  ><template v-if="ledgerCardIsV3 && entry.name === '陈登·黍王'"><span class="ledger-name-prefix">陈登·</span><span class="ledger-name-continuation">黍王</span></template><template v-else-if="ledgerCardIsV3 && entry.name === '史子眇·赴烛'"><span class="ledger-name-prefix">史子眇·</span><span class="ledger-name-continuation">赴烛</span></template><template v-else>{{ entry.name }}</template></h3>
                  <span class="ledger-mobile-prof ledger-prof-tab" :title="subProfText(entry)">
                    <img v-if="profIcon(entry.prof[0])" :src="profIcon(entry.prof[0])" :alt="entry.prof.join('、') + '属性'" />
                    <span class="share-ledger-prof-attribute">{{ entry.prof.length ? entry.prof.join('、') : '未知属性' }} · </span>
                    <span>{{ subProfList(entry).length ? subProfText(entry) : '未标注' }}</span>
                  </span>
                </div>
                <span class="ledger-prof">
                  <span class="ledger-prof-copy">
                    <img v-if="profIcon(entry.prof[0])" :src="profIcon(entry.prof[0])" alt="" aria-hidden="true" />
                    {{ entry.prof.length ? entry.prof.join('、') : '未知属性' }} · {{ subProfText(entry) }}
                  </span>
                </span>
              </div>
              <span class="ledger-status-button share-ledger-status" :class="'status-' + shareStatusClass(entry)">{{ shareStatusLabel(entry) }}</span>
            </header>

            <ShareCardStats :enabled="ledgerCardIsV3 && compactStats" :name="entry.name">
              <template #combat>
                <section class="ledger-combat" aria-label="战斗面板与奇闻属性">
                  <div v-for="kind in ['attack', 'hp']" :key="kind" class="ledger-combat-stat">
                    <div class="ledger-combat-head">
                      <span class="stat-icon" :aria-label="kind === 'attack' ? '攻击' : '生命'">
                        <Swords v-if="kind === 'attack'" :size="12" aria-hidden="true" />
                        <Heart v-else :size="12" aria-hidden="true" />
                      </span>
                    </div>
                    <strong class="ledger-combat-value">{{ combatValue(entry, kind) }}</strong>
                    <div class="ledger-oddity" :aria-label="(kind === 'attack' ? '攻击' : '生命') + '奇闻数值'">
                      <span class="stat-icon">
                        <Sparkles class="ledger-oddity-icon" aria-hidden="true" />
                      </span>
                      <span>{{ oddityValue(entry, kind).current }} / {{ oddityValue(entry, kind).max }}</span>
                    </div>
                  </div>
                </section>
              </template>
              <template #growth>
                <section class="ledger-growth share-ledger-growth" aria-label="核心养成">
                  <div class="ledger-growth-row" role="group" aria-label="等级">
                    <span v-if="!ledgerCardIsV3 || compactStats" class="ledger-grow-label">等级</span>
                    <span class="share-ledger-growth-value"><span v-if="ledgerCardIsV3 && !compactStats" class="share-growth-prefix">Lv</span><span class="share-growth-number">{{ number(entry.growth.level) }}</span></span>
                  </div>
                  <div class="ledger-growth-row" role="group" aria-label="修为">
                    <span v-if="!ledgerCardIsV3 || compactStats" class="ledger-grow-label">修为</span>
                    <span class="share-ledger-growth-value"><template v-if="ledgerCardIsV3 && !compactStats">+</template><span class="share-growth-number">{{ number(entry.growth.elite) }}</span></span>
                  </div>
                  <div class="ledger-growth-row" role="group" aria-label="化极">
                    <span v-if="!ledgerCardIsV3 || compactStats" class="ledger-grow-label">化极</span>
                    <span class="share-ledger-growth-value ledger-huaji-value" :title="operatorHuajiLabel({ ...entry, ...entry.growth })">
                      <template v-if="starCardHasIcon(shareHuajiValue(entry))">
                        <span class="share-growth-number">{{ starCardNumber(shareHuajiValue(entry), entry.sp_of) }}</span>
                        <Star :size="12" fill="currentColor" aria-hidden="true" />
                        <span v-if="!entry.sp_of && shareHuajiValue(entry) < 25" class="share-growth-number">{{ starCardNode(shareHuajiValue(entry)) }}</span>
                      </template>
                      <span v-else class="share-growth-number">{{ operatorHuajiLabel({ ...entry, ...entry.growth }) }}</span>
                      <small v-if="shareHuajiValue(entry) != null && (operatorHuaji({ ...entry, ...entry.growth }).awakened === true || (shareHuajiValue(entry) === 25 && operatorAwakeningSupported(entry)))">{{ operatorHuaji({ ...entry, ...entry.growth }).awakened === true ? '已觉醒' : operatorHuaji({ ...entry, ...entry.growth }).awakened === false ? '未觉醒' : '觉醒待确认' }}</small>
                    </span>
                  </div>
                </section>
              </template>
            </ShareCardStats>

            <div class="ledger-loadouts">
              <div class="ledger-destiny fate-trait-style-a" aria-label="双命盘">
                <div v-for="(loadout, index) in loadouts(entry)" :key="index" class="ledger-destiny-row">
                  <span>命盘{{ index === 0 ? '一' : '二' }}</span>
                  <svg v-if="ledgerCardIsV3" class="ledger-destiny-marker" width="6" height="16" viewBox="0 0 6 16" aria-hidden="true">
                    <circle v-for="dot in index + 1" :key="dot" cx="3" :cy="index === 0 ? 8 : dot === 1 ? 5 : 11" r="2" fill="currentColor" />
                  </svg>
                  <div class="ledger-destiny-values">
                    <em
                      v-for="disc in loadoutDiscEntries(entry, loadout)"
                      :key="disc.name"
                      class="disc-term"
                      :class="[
                        discRarityClass(disc),
                        { 'has-description': disc.description },
                      ]"
                      :title="disc.name"
                      :tabindex="disc.description ? 0 : undefined"
                      @mouseenter.stop="showDiscTooltip($event, disc.description)"
                      @mouseleave="hideDiscTooltip"
                      @focus="showDiscTooltip($event, disc.description)"
                      @blur="hideDiscTooltip"
                    >{{ disc.displayName }}</em>
                  </div>
                </div>
              </div>

              <div class="ledger-stones" aria-label="已装备星石">
                <div v-for="(stone, index) in starStoneSlots(entry)" :key="index" class="stone-slot" :class="{ 'is-empty': !stone }">
                  <template v-if="stone">
                    <strong>{{ stone.name || '星石' }}</strong>
                    <small>{{ stone.level || 0 }}</small>
                  </template>
                  <span v-else aria-hidden="true"><Plus :size="16" aria-hidden="true" /></span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="discTooltip.visible"
        :id="inputId + '-tooltip'"
        class="disc-floating-tooltip"
        :class="'is-' + discTooltip.placement"
        :style="{ zIndex: embedded ? 'var(--z-overlay-raised)' : undefined, left: discTooltip.x + 'px', top: discTooltip.y + 'px' }"
        role="tooltip"
      >
        {{ discTooltip.text }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { operatorHuaji, operatorHuajiLabel, operatorAwakeningSupported } from '../../utils/operatorHuaji.js'
function shareHuajiValue(entry) { const value = operatorHuaji({ ...entry, ...entry.growth }); return value.stage == null ? null : entry.sp_of ? value.stage > 0 ? (value.stage - 1) / 6 + 1 : 0 : value.stage }

import { formatOperatorOddityCurrent } from '../../utils/operatorCombatStats.js'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { BookUser, Heart, Star, Swords, CircleAlert, Search, SearchX, ShieldCheck, Plus, Sparkles, X } from '@lucide/vue'
import ShareCardStats from './ShareCardStats.vue'
import OperatorFilterDossier from './OperatorFilterDossier.vue'
import { ACTIVE_OPERATOR_LEDGER_CARD_VERSION, OPERATOR_LEDGER_CARD_VERSIONS, operatorLedgerCardVersionClass } from '../../config/operatorLedgerCard.js'
import { getOperatorCatalog, viewOperatorShare } from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { parseShareLink, sharePath } from '../../utils/shareLink.js'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import operatorPortraits from '../../data/operatorPortraits.json'
import { operatorEditableStatusOptions, operatorAnnotationStatus, operatorAnnotationStatusLabel } from '../../utils/operatorAnnotations.js'
import { normalizeDiscNames } from '../../utils/operatorDiscLoadouts.js'
import { subProfList, subProfOptions as deriveSubProfOptions } from '../../utils/operatorFilters.js'
import { starCardFallback, starCardHasIcon, starCardNode, starCardNumber } from '../../utils/operatorStarDisplay.js'
import {
  filterOperatorShareEntries,
  mergeOperatorShareEntries,
  operatorShareCombatValue,
  operatorShareGrowthState,
  operatorShareStarLabel,
  parseOperatorShareToken
} from '../../utils/operatorShare.js'

const props = defineProps({ token: { type: String, default: '' }, embedded: { type: Boolean, default: false } })
const emit = defineEmits(['submit', 'reset', 'share-change', 'status-change'])
const inputId = useId()
const input = ref(null)
const contentPanel = ref(null)
const starTarget = ref(null)
const ledgerCardVersionClass = operatorLedgerCardVersionClass()
const ledgerCardIsV3 = ACTIVE_OPERATOR_LEDGER_CARD_VERSION === OPERATOR_LEDGER_CARD_VERSIONS.V3
const compactStats = ref(false)
let compactStatsQuery = null

function syncCompactStats() {
  compactStats.value = compactStatsQuery.matches
}

const failedPortraitIds = ref(new Set())
const failedAvatarIds = ref(new Set())
const inputValue = ref('')
const inputError = ref('')
const loadError = ref('')
const status = ref('input')
const share = ref(null)
const entries = ref([])
const searchQuery = ref('')
const profFilter = ref('all')
const subProfFilter = ref('all')
const statusFilter = ref('all')
const discTooltip = ref({ visible: false, text: '', x: 0, y: 0, placement: 'top' })
const profOptions = AGENT_PROFS
const PROF_ICON_FILES = { 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' }
const STONE_SLOT_TYPES = ['main1', 'main2', 'main3', 'assist1', 'assist2', 'assist3']
const availableSubProfOptions = computed(function () {
  return deriveSubProfOptions(entries.value)
})
const shareStatusOptions = [{ value: 'all', label: '全部' }, ...operatorEditableStatusOptions()]
const shareStatusCounts = computed(function () {
  return entries.value.reduce(function (counts, entry) {
    const status = shareStatusClass(entry)
    if (Object.hasOwn(counts, status)) counts[status] += 1
    return counts
  }, { growing: 0, graduated: 0, inactive: 0, discarded: 0 })
})
const filteredEntries = computed(function () {
  return filterOperatorShareEntries(entries.value, searchQuery.value, profFilter.value, subProfFilter.value, statusFilter.value)
})
const hasFilters = computed(function () {
  return Boolean(searchQuery.value.trim() || profFilter.value !== 'all' || subProfFilter.value !== 'all' || statusFilter.value !== 'all')
})
let loadSeq = 0

function submitToken() {
  const target = parseShareLink(inputValue.value, 'operator')
  if (!target) {
    inputError.value = inputValue.value.trim() ? '未识别到有效的 BOX 分享码或分享链接' : '请输入 BOX 分享码或分享链接'
    return
  }
  inputError.value = ''
  if (props.embedded && target.view === 'star') {
    starTarget.value = target
    return
  }
  starTarget.value = null
  emit('submit', target)
}

function resetInput() {
  emit('reset')
}

function clearFilters() {
  searchQuery.value = ''
  profFilter.value = 'all'
  subProfFilter.value = 'all'
  statusFilter.value = 'all'
}

async function loadShare() {
  const token = parseOperatorShareToken(props.token)
  const seq = ++loadSeq
  share.value = null
  entries.value = []
  loadError.value = ''
  if (!token) {
    status.value = 'input'
    return
  }
  status.value = 'loading'
  try {
    const [shareData, catalog] = await Promise.all([
      viewOperatorShare(token),
      getOperatorCatalog().catch(() => {
        // 图鉴故障不能被误判为分享码失效，保留并行读取与旧响应隔离。
        const error = new Error('密探图鉴暂时无法加载，请稍后重试。')
        error.code = 'catalog_unavailable'
        throw error
      })
    ])
    if (seq !== loadSeq) return
    share.value = shareData || { entries: {} }
    entries.value = mergeOperatorShareEntries(share.value, catalog)
    status.value = entries.value.length ? 'ready' : 'empty'
  } catch (err) {
    if (seq !== loadSeq) return
    status.value = err?.code === 'share_not_authorized' ? 'unauthorized' : err && (err.status === 404 || err.code === 'share_not_found') ? 'not-found' : 'error'
    loadError.value = humanErr(err)
  }
}

function humanErr(err) {
  if (err?.code === 'catalog_unavailable') return '密探图鉴暂时无法加载，请稍后重试。'
  if (err?.code === 'REQUEST_TIMEOUT') return '读取分享数据超时，请检查网络后重试。'
  if (err?.status >= 500) return '分享服务暂时不可用，请稍后重试。'
  return '暂时无法读取分享数据，请检查网络后重试。'
}

function formatDate(value) {
  if (!value) return '暂无数据'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function profIcon(prof) {
  const file = PROF_ICON_FILES[String(prof || '').split('、')[0]]
  return file ? import.meta.env.BASE_URL + 'assets/prof-icons/' + file : ''
}

function subProfText(entry) {
  const values = subProfList(entry)
  return values.length ? values.join('、') : '未标注职业'
}

function shareStatusClass(entry) {
  const state = operatorShareGrowthState(entry)
  return operatorAnnotationStatus(state)
}

function shareStatusLabel(entry) {
  const state = operatorShareGrowthState(entry)
  return operatorAnnotationStatusLabel(state)
}

function formattedNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed).toLocaleString('zh-CN') : '—'
}

function combatValue(entry, key) {
  return operatorShareCombatValue(entry, key)
}

function oddities(entry) {
  const stats = entry.growth.combat_stats || {}
  const values = stats.oddities || {}
  return ['attack', 'hp', 'special'].map(function (key) {
    const schema = (entry.oddity_schema || {})[key] || {}
    const value = values[key] || {}
    return {
      key: key,
      name: schema.name || (key === 'attack' ? '攻击力' : key === 'hp' ? '生命值' : '特殊属性'),
      current: formatOperatorOddityCurrent(key, value.current),
      max: formattedNumber(schema.max != null ? schema.max : value.max)
    }
  })
}

function oddityValue(entry, key) {
  return oddities(entry).find(function (oddity) { return oddity.key === key }) || { current: '—', max: '—' }
}

function loadouts(entry) {
  const growth = entry && entry.growth ? entry.growth : {}
  const source = Array.isArray(growth.disc_loadouts) && growth.disc_loadouts.length
    ? growth.disc_loadouts
    : Array.isArray(growth.discs) && growth.discs.length
      ? [{ discs: growth.discs }]
      : []
  return [source[0] || null, source[1] || null]
}

function loadoutDiscs(loadout) {
  const values = [loadout && loadout.discNames, loadout && loadout.disc_names, loadout && loadout.discs]
    .find(function (value) { return Array.isArray(value) && value.length }) || []
  return normalizeDiscNames(values)
}

function discName(disc) {
  if (!disc) return ''
  if (typeof disc === 'string') return disc.trim()
  return String(disc.ot_name || disc.otName || '').trim()
}

function discDescription(disc) {
  if (!disc || typeof disc === 'string') return ''
  return String(disc.desp || disc.description || disc.desc || '').trim()
}

function discAbbreviation(disc) {
  return disc && typeof disc.abbreviation === 'string' ? disc.abbreviation.trim() : ''
}

function loadoutDiscEntries(entry, loadout) {
  const raw = [loadout && loadout.discs, loadout && loadout.discNames, loadout && loadout.disc_names]
    .find(function (value) { return Array.isArray(value) && value.length }) || []
  const rawByName = new Map(raw.map(function (disc) { return [discName(disc), disc] }).filter(function (pair) { return pair[0] }))
  const catalogByName = new Map((Array.isArray(entry && entry.discs) ? entry.discs : []).map(function (disc) { return [discName(disc), disc] }).filter(function (pair) { return pair[0] }))
  return normalizeDiscNames(raw).map(function (name) {
    const source = rawByName.get(name)
    const catalog = catalogByName.get(name)
    return {
      name: name,
      displayName: discAbbreviation(catalog) || discAbbreviation(source) || name,
      description: discDescription(source) || discDescription(catalog),
      color: (source && source.color) || (catalog && catalog.color) || ''
    }
  })
}

const DISC_RARITY_CLASS = {
  金: 'rarity-gold',
  紫: 'rarity-purple',
  蓝: 'rarity-blue',
  gold: 'rarity-gold',
  purple: 'rarity-purple',
  blue: 'rarity-blue'
}

function discRarityClass(disc) {
  return DISC_RARITY_CLASS[disc && disc.color] || ''
}

function showDiscTooltip(event, description) {
  const content = String(description || '').trim()
  const target = event && event.currentTarget
  if (!content || !(target && target.getBoundingClientRect)) {
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
    text: content,
    x: x,
    y: placement === 'top' ? rect.top - 8 : rect.bottom + 8,
    placement: placement
  }
}

function hideDiscTooltip() {
  if (!discTooltip.value.visible) return
  discTooltip.value = Object.assign({}, discTooltip.value, { visible: false })
}

function starStoneSlots(entry) {
  const source = entry && entry.growth && Array.isArray(entry.growth.star_stones) ? entry.growth.star_stones : []
  const typed = source.some(function (stone) { return stone && stone.type })
  if (!typed) return Array.from({ length: 6 }, function (_, index) {
    const stone = source[index]
    return stone && (stone.name || stone.type) ? stone : null
  })
  const byType = new Map(source.filter(function (stone) { return stone && (stone.name || stone.type) }).map(function (stone) { return [stone.type, stone] }))
  return STONE_SLOT_TYPES.map(function (type) { return byType.get(type) || null })
}

function monogram(entry) {
  return Array.from(entry.name || entry.id || '?')[0]
}

onMounted(function () {
  compactStatsQuery = window.matchMedia('(max-width: 640px)')
  syncCompactStats()
  compactStatsQuery.addEventListener('change', syncCompactStats)
  window.addEventListener('scroll', hideDiscTooltip, true)
  window.addEventListener('resize', hideDiscTooltip)
})

onBeforeUnmount(function () {
  loadSeq += 1
  compactStatsQuery?.removeEventListener('change', syncCompactStats)
  window.removeEventListener('scroll', hideDiscTooltip, true)
  window.removeEventListener('resize', hideDiscTooltip)
})

watch(function () { return props.token }, function (token) {
  if (token && parseOperatorShareToken(inputValue.value) !== parseOperatorShareToken(token)) inputValue.value = String(token)
  inputError.value = ''
  starTarget.value = null
  hideDiscTooltip()
  clearFilters()
  loadShare()
}, { immediate: true })
watch(inputValue, () => { starTarget.value = null; inputError.value = '' })
watch(share, value => emit('share-change', value))
watch(status, async value => {
  emit('status-change', value)
  if (!props.embedded) return
  await nextTick()
  if (value === 'input') input.value?.focus({ preventScroll: true })
  else if (document.activeElement === document.body) contentPanel.value?.focus({ preventScroll: true })
}, { immediate: true })
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.share-entry,.share-state { border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: 0 22px 44px -34px rgba(73, 59, 44, .42) }
.section-kicker { color: var(--accent-strong) }
.share-entry > p,.share-state p { color: var(--ink-60) }
.share-entry label { color: var(--ink-60) }
.share-entry input { border: 1.5px solid var(--line); border-radius: 12px; color: var(--ink); background: var(--paper); outline: none }
.share-entry input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .13) }
.share-entry button,.share-state button,.share-toolbar button { border: 1px solid var(--tea); border-radius: 999px; color: var(--cream); background: var(--tea); cursor: pointer }
.share-entry button:focus-visible,.share-state button:focus-visible,.share-toolbar button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }
.share-entry button:hover,.share-state button:hover,.share-toolbar button:hover,.share-entry button:focus-visible,.share-state button:focus-visible,.share-toolbar button:focus-visible { border-color: var(--accent); background: var(--accent) }
.entry-error { color: var(--rouge) !important }
.state-mark { border-radius: 50%; color: var(--tea); background: var(--yellow) }
.share-state.is-error .state-mark { color: var(--cream); background: var(--rouge) }
button.ghost { border-color: var(--line); color: var(--ink-60); background: transparent }
button.ghost:hover,button.ghost:focus-visible { color: var(--ink); background: var(--cream) }
.share-toolbar { border-bottom: 1px solid var(--line) }
.share-toolbar p { color: var(--ink-60) }
.share-ledger { border: 1px solid rgba(255, 248, 236, .22); border-radius: 20px; background: linear-gradient(145deg, var(--tea), var(--tea-deep)); box-shadow: 0 20px 40px -24px rgba(73, 59, 44, .55) }
.current-ledger-meta { color: rgba(255, 248, 236, .76) }
.current-ledger-meta span:last-child { color: var(--yellow) }
.agent-ledger-card { color: var(--ink); border: 1px solid var(--line); border-top: 2px solid var(--ledger-rarity-accent); border-radius: 12px; background: linear-gradient(180deg, var(--surface), var(--cream)); box-shadow: 0 8px 24px rgba(73, 59, 44, .18), inset 0 1px 0 rgba(255, 255, 255, .8); cursor: pointer; transition: transform .35s var(--ease), box-shadow .35s var(--ease) }
.agent-ledger-card--share { cursor: default }
.agent-ledger-card:hover { box-shadow: 0 18px 30px rgba(73, 59, 44, .25), inset 0 1px 0 rgba(255, 255, 255, .8) }
.agent-ledger-card:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; box-shadow: 0 18px 30px rgba(73, 59, 44, .25), inset 0 1px 0 rgba(255, 255, 255, .8) }
.agent-ledger-card.status-growing { border-left: 3px solid #6f9f76 }
.agent-ledger-card.status-graduated { border-left: 3px solid var(--yellow-deep) }
.agent-ledger-card.status-inactive { border-left: 3px solid rgba(73, 59, 44, .35) }
.ledger-avatar { border: 2px solid var(--ledger-rarity-accent); border-radius: 10px; background: color-mix(in srgb, var(--ledger-rarity-accent) 16%, var(--paper)) }
.ledger-avatar img { border-radius: 8px }
.ledger-avatar > span { color: var(--ink-35) }
.share-ledger-status { border: 1px solid transparent; border-radius: 999px }
.share-ledger-status.status-growing { border-color: rgba(111, 159, 118, .45); background: #bfdcc0; color: #315f38 }
.share-ledger-status.status-graduated { border-color: rgba(239, 210, 142, .85); background: var(--yellow); color: var(--ink) }
.share-ledger-status.status-inactive { border-color: rgba(73, 59, 44, .22); background: rgba(73, 59, 44, .12); color: var(--ink-60) }
.ledger-prof { color: var(--ink-60) }
.ledger-combat-stat { border: 1px solid var(--line); border-radius: 6px; background: var(--surface) }
.ledger-combat-head { color: var(--ink-60) }
.ledger-combat-value { border-bottom: 1px dashed var(--accent); color: var(--ink) }
.ledger-combat-source { color: var(--ink-35) }
.ledger-oddity { color: var(--accent-strong) }
.ledger-oddity-icon { color: var(--ink-60) }
.ledger-oddity > span:last-child { color: var(--ink-35) }
.ledger-growth { border: 1px solid var(--line); border-radius: 8px; background: rgba(255, 255, 255, .62) }
.ledger-grow-label { color: var(--ink-60) }
.share-ledger-growth-value { color: var(--ink) }
.share-growth-complete { border: 1px solid var(--line); border-radius: 6px; background: rgba(73, 59, 44, .08); color: var(--ink-60); opacity: .72 }
.share-growth-complete.is-awakened { border-color: #c9d8c5; background: #eef5ec; color: #6f846b }
.ledger-destiny-row > span { color: var(--accent-strong) }
.ledger-destiny-row em { border: 1px solid rgba(215, 137, 53, .28); border-radius: 4px; background: rgba(215, 137, 53, .12); color: var(--ink) }
.disc-term.has-description { cursor: help }
.disc-term.has-description:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px }
.ledger-destiny-row em.empty { border-style: dashed; background: transparent; color: var(--ink-35) }
.ledger-destiny-row:nth-child(1) > span { color: #a66c2b }
.ledger-destiny-row:nth-child(1) em { border-color: #e7c89c; background: #faf1e4 }
.ledger-destiny-row:nth-child(1) em.empty { border-color: #e7c89c; background: transparent; color: #a66c2b }
.ledger-destiny-row:nth-child(2) > span { color: #7e7a72 }
.ledger-destiny-row:nth-child(2) em { border-color: #d8d3cb; background: #f5f2ed; color: #7e7a72 }
.ledger-destiny-row:nth-child(2) em.empty { border-color: #d8d3cb; background: transparent; color: #7e7a72 }
.ledger-stones > .stone-slot { border: 1px solid var(--line); border-radius: 4px; background: var(--surface); color: var(--ink) }
.ledger-stones > .stone-slot.is-empty { background: transparent; color: var(--line) }
.ledger-stones strong { color: var(--ink) }
.ledger-stones small { color: var(--ink-60) }
.disc-floating-tooltip { border: 1px solid var(--line); border-radius: 7px; background: var(--tea); color: var(--cream); box-shadow: 0 10px 24px rgba(73, 59, 44, .28); pointer-events: none; animation: disc-tooltip-in .14s ease both }
.disc-floating-tooltip::after { background: var(--tea); content: '' }
.disc-floating-tooltip.is-top::after { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line) }
.disc-floating-tooltip.is-bottom::after { border-left: 1px solid var(--line); border-top: 1px solid var(--line) }
@keyframes disc-tooltip-in { from { opacity: 0 } to { opacity: 1 } }
@media (max-width: 640px) {
  .share-ledger { border-radius: 16px }
  .ledger-mobile-prof { color: var(--ink-60) }
}
</style>
<style scoped src="./operatorShareDesktop.css"></style>
<style scoped src="./operatorShareMobile.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v1Mobile.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v2Mobile.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3Desktop.css"></style>
<style scoped src="../../styles/operator-ledger-card.v3Mobile.css"></style>
<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
/* Read-only adaptation of the current-growth V3 portrait card. */

.agent-ledger-card--share.agent-ledger-card--v2 .fate-trait-style-a .ledger-destiny-row em.disc-term {
  box-shadow: none;
}

/* Keep both summary panels on the same numeric type treatment. */

/* Desktop keeps diamond markers; mobile matches the growth card's dot markers. */

.agent-ledger-card--share.agent-ledger-card--v3 .ledger-destiny-row > span {
  border: 0;
}

.agent-ledger-card--share.agent-ledger-card--v3 .ledger-destiny-row > span::before {
  border: 1px solid var(--fate-series-accent);
  content: '';
}


/* Preserve the stacked V1/V2 spacing; V3 defines its own summary rows. */

@media (max-width: 640px) {

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-destiny-marker {
    color: var(--fate-series-accent);
  }

  .share-ledger:has(.agent-ledger-card--v3) {
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .share-ledger:has(.agent-ledger-card--v3) .current-ledger-meta,
  .share-ledger:has(.agent-ledger-card--v3) .current-ledger-meta span:last-child {
    color: var(--ink-60);
  }

  .agent-ledger-card.agent-ledger-card--share.agent-ledger-card--v3 {
    border: 1px solid var(--line);
    background: var(--surface);
    box-shadow: 0 3px 10px rgba(73, 59, 44, .05);
  }

  /* Long SP titles use two columns within the status stamp's height. */

  .agent-ledger-card--share.agent-ledger-card--v3 .share-ledger-status {
    /* Match the top and right card insets so the two rounded corners nest. */
    border: 3px double color-mix(in srgb, var(--ledger-seal-ink) 66%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--ledger-seal-paper) 85%, transparent);
    color: var(--ledger-seal-ink);
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-growth.share-ledger-growth {
    border: 0;
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface) 64%, transparent);
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-grow-label {
    color: var(--tea);
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .share-ledger-growth .share-ledger-growth-value {
    border-radius: 3px;
    background: transparent;
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .share-ledger-growth-value.ledger-huaji-value {
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-combat-stat {
    border: 0;
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface) 76%, transparent);
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .share-card-stats.is-enabled :is(.ledger-combat, .ledger-growth) {
    background: transparent;
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .share-card-stats .ledger-combat-stat {
    background: transparent;
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-oddity > span:last-child {
    color: var(--tea);
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-destiny-row:nth-child(n) {
    background: transparent;
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-stones > .stone-slot:nth-of-type(n+4) {
    border-radius: 8px;
  }

  .agent-ledger-card--share.agent-ledger-card--v3 .ledger-stones > .stone-slot.is-empty {
    border-style: dashed;
  }
}
.agent-ledger-card.status-discarded { border-left: 3px dashed var(--tea); }
.share-ledger-status.status-discarded { border-style: dashed; color: var(--tea); background: var(--cream); }
</style>
<style scoped src="./operatorShareOverrides4Desktop.css"></style>
<style scoped src="./operatorShareOverrides4Mobile.css"></style>

<style scoped>
.operator-share-content { min-width: 0; }
.operator-share-content:focus { outline: none; }
.share-star-notice { margin-top: 16px; overflow-wrap: anywhere; }
.share-star-notice a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* 弹窗可用宽度小于页面，卡片按容器换列。 */
.operator-share-content.is-embedded { container: box-content / inline-size; }
.is-embedded .share-entry { max-width: none; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
.is-embedded .share-entry label { display: flex; margin-top: 0; color: var(--ink); font-size: 14px; }
.is-embedded .share-entry-row { grid-template-columns: minmax(0, 1fr); align-items: stretch; gap: 10px; margin-top: 12px; }
.is-embedded .share-entry input { box-sizing: border-box; width: 100%; min-height: 44px; padding: 10px 12px; font-size: 16px; border-radius: 9px; background: var(--surface); }
.is-embedded .share-entry button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 10px 20px; border-radius: 9px; font-size: 13px; white-space: nowrap; }
.is-embedded .box-step-title { display: flex; align-items: center; gap: 9px; margin: 0; font: 700 14px/1.5 var(--font-b); }
.box-step-number { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 50%; background: var(--tea); color: var(--cream); font: 700 12px var(--font-d); }
.is-embedded .box-results-title { margin-bottom: 16px; }
.box-preview { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
.box-preview-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 12px 24px; text-align: center; }
.box-preview-art { position: relative; display: grid; place-items: center; width: 88px; height: 88px; margin-bottom: 4px; border: 1px solid var(--line); border-radius: 50%; background: radial-gradient(circle, var(--surface), var(--paper)); color: var(--tea); }
.box-preview-search { position: absolute; bottom: 10px; right: 8px; padding: 4px; border: 1px solid var(--line); border-radius: 50%; background: var(--cream); }
.box-preview-empty strong { font-size: 14px; line-height: 1.7; }
.box-preview-empty p { margin: 0; color: var(--ink-60); font-size: 13px; line-height: 1.7; }
.share-entry-notice { display: flex; align-items: flex-start; gap: 10px; margin-top: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); }
.share-entry-notice > svg { flex: none; margin-top: 2px; color: var(--tea); }
.share-entry-notice strong { font-size: 13px; color: var(--tea); }
.share-entry-notice p { margin: 3px 0 0; color: var(--ink-60); font-size: 12px; line-height: 1.7; }
@media (min-width: 641px) {
  .is-embedded .share-entry input { font-size: 14px; }
}
@container box-content (max-width: 900px) {
  .is-embedded .operator-grid.agent-ledger-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container box-content (max-width: 600px) {
  .is-embedded .operator-grid.agent-ledger-grid { grid-template-columns: 1fr; }
  .is-embedded .share-toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .is-embedded .share-toolbar p { grid-column: 1 / -1; }
}
@container box-content (min-width: 480px) {
  .is-embedded .share-entry-row { grid-template-columns: minmax(0, 1fr) auto; }
}
</style>
