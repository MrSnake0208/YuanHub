<template>
  <div class="page-operator-share">
    <IslandSidebar />
    <main id="main-content" class="share-main">
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">密探</span>
            <span class="pill">只读分享</span>
          </div>
          <h1>密探 BOX<span class="small">神秘代码查看</span></h1>
          <p class="hero-sub">无需登录，仅展示分享者公开的客观养成信息。</p>
          <div v-if="share" class="hero-stats">
            <div><div class="k">游戏版本</div><div class="v compact">{{ share.game || '—' }}</div></div>
            <div><div class="k">密探数量</div><div class="v">{{ entries.length }}<small>位</small></div></div>
            <div><div class="k">图鉴版本</div><div class="v compact">{{ share.catalog_version || '—' }}</div></div>
            <div><div class="k">数据更新</div><div class="v compact"><time :datetime="share.updated_at || undefined">{{ formatDate(share.updated_at) }}</time></div></div>
          </div>
        </div>
      </header>

      <section class="share-content">
        <div class="wrap">
          <form v-if="status === 'input'" class="share-entry" @submit.prevent="submitToken">
            <span class="section-kicker">公开查看</span>
            <h2>输入神秘代码</h2>
            <p>可粘贴代码，也可粘贴完整分享链接。</p>
            <label for="operator-share-token">神秘代码或分享链接</label>
            <div class="share-entry-row">
              <input
                id="operator-share-token"
                v-model="inputValue"
                autocomplete="off"
                inputmode="text"
                :aria-invalid="!!inputError"
                :aria-describedby="inputError ? 'operator-share-input-error' : undefined"
                placeholder="例如：550e8400-e29b-41d4-a716-446655440000"
              />
              <button type="submit">查看密探 BOX</button>
            </div>
            <p v-if="inputError" id="operator-share-input-error" class="entry-error" role="alert">{{ inputError }}</p>
          </form>

          <div v-else-if="status === 'loading'" class="share-state" role="status" aria-live="polite">
            <span class="state-mark" aria-hidden="true">…</span>
            <h2>正在打开密探 BOX</h2>
            <p>正在同步公开养成数据与密探图鉴。</p>
          </div>

          <div v-else-if="status === 'not-found'" class="share-state is-error" role="alert">
            <span class="state-mark" aria-hidden="true">×</span>
            <h2>神秘代码已失效</h2>
            <p>代码可能已被撤销、重新生成或输入有误。</p>
            <button type="button" @click="resetInput">重新输入</button>
          </div>

          <div v-else-if="status === 'error'" class="share-state is-error" role="alert">
            <span class="state-mark" aria-hidden="true">!</span>
            <h2>暂时无法加载</h2>
            <p>{{ loadError }}</p>
            <div class="state-actions">
              <button type="button" @click="loadShare">重试</button>
              <button type="button" class="ghost" @click="resetInput">重新输入</button>
            </div>
          </div>

          <template v-else>
            <div class="share-toolbar" aria-label="分享页操作">
              <p>此页面只读，刷新可获取分享者的最新数据。</p>
              <button type="button" @click="loadShare">刷新数据</button>
              <button type="button" class="ghost" @click="resetInput">重新输入</button>
            </div>

            <div v-if="status === 'ready'" class="share-filters" role="search" aria-label="筛选分享密探">
              <label class="share-filter-search" for="operator-share-search">
                <span>搜索密探</span>
                <input id="operator-share-search" v-model="searchQuery" type="search" autocomplete="off" placeholder="名称、别名或 ID" />
              </label>
              <label for="operator-share-prof">
                <span>属性</span>
                <select id="operator-share-prof" v-model="profFilter">
                  <option value="all">全部属性</option>
                  <option v-for="prof in profOptions" :key="prof" :value="prof">{{ prof }}</option>
                </select>
              </label>
              <label for="operator-share-sub-prof">
                <span>职业</span>
                <select id="operator-share-sub-prof" v-model="subProfFilter">
                  <option value="all">全部职业</option>
                  <option v-for="subProf in availableSubProfOptions" :key="subProf" :value="subProf">{{ subProf }}</option>
                </select>
              </label>
              <span class="share-result-count" aria-live="polite">显示 {{ filteredEntries.length }} / {{ entries.length }} 位</span>
              <button v-if="hasFilters" type="button" class="ghost" @click="clearFilters">清空条件</button>
            </div>

            <div v-if="status === 'empty'" class="share-state">
              <span class="state-mark" aria-hidden="true">0</span>
              <h2>这个密探 BOX 还是空的</h2>
              <p>分享已生效，但当前没有可展示的密探养成数据。</p>
            </div>

            <div v-else-if="!filteredEntries.length" class="share-state">
              <span class="state-mark" aria-hidden="true">?</span>
              <h2>没有匹配的密探</h2>
              <p>当前搜索或筛选条件没有找到分享中的密探。</p>
              <button type="button" @click="clearFilters">清空条件</button>
            </div>

            <div v-else class="current-ledger share-ledger">
              <div class="current-ledger-meta">
                <span>版本「{{ share.game || '—' }}」 · {{ filteredEntries.length }} 位密探</span>
                <span>点击卡片查看详细养成</span>
              </div>
              <div class="operator-grid agent-ledger-grid" role="list">
                <article
                  v-for="entry in filteredEntries"
                  :key="entry.id"
                  class="operator-card agent-ledger-card"
                  :class="'rarity-r' + (entry.rarity || 3)"
                  tabindex="0"
                  role="button"
                  :aria-label="'查看 ' + entry.name + ' 的详情'"
                  @click="openDetail(entry, $event)"
                  @keydown.enter.prevent="openDetail(entry, $event)"
                  @keydown.space.prevent="openDetail(entry, $event)"
                >
                  <header class="ledger-card-head">
                    <div class="ledger-avatar">
                      <img v-if="entry.avatar" :src="avatarUrl(entry.avatar)" :alt="entry.name + '头像'" loading="lazy" @error="hideBrokenImage" />
                      <span v-else aria-hidden="true">{{ monogram(entry) }}</span>
                    </div>
                    <div class="ledger-identity">
                      <div class="ledger-name-row">
                        <h3>{{ entry.name }}</h3>
                        <span class="ledger-mobile-prof">
                          <img v-if="profIcon(entry.prof[0])" :src="profIcon(entry.prof[0])" alt="" aria-hidden="true" />
                          {{ entry.prof.length ? entry.prof.join('、') : '未知属性' }} · {{ subProfText(entry) }}
                        </span>
                        <strong v-if="entry.rarity" class="rarity" :aria-label="entry.rarity + '星稀有度'">{{ '★'.repeat(entry.rarity) }}</strong>
                      </div>
                      <span class="ledger-prof">
                        <span class="ledger-prof-copy">
                          <img v-if="profIcon(entry.prof[0])" :src="profIcon(entry.prof[0])" alt="" aria-hidden="true" />
                          {{ entry.prof.length ? entry.prof.join('、') : '未知属性' }} · {{ subProfText(entry) }}
                        </span>
                      </span>
                    </div>
                  </header>

                  <section class="ledger-combat" aria-label="战斗面板与奇闻属性">
                    <div v-for="kind in ['attack', 'hp']" :key="kind" class="ledger-combat-stat">
                      <div class="ledger-combat-head">
                        <span>
                          <Swords v-if="kind === 'attack'" :size="12" aria-hidden="true" />
                          <Heart v-else :size="12" aria-hidden="true" />
                          {{ kind === 'attack' ? '攻击' : '生命' }}
                        </span>
                      </div>
                      <strong class="ledger-combat-value">{{ combatValue(entry, kind) }}</strong>
                      <small class="ledger-combat-source">分享记录</small>
                      <div class="ledger-oddity" :aria-label="(kind === 'attack' ? '攻击' : '生命') + '奇闻数值'">
                        <ButterflyIcon class="ledger-oddity-icon" aria-hidden="true" />
                        <span>{{ oddityValue(entry, kind).current }} / {{ oddityValue(entry, kind).max }}</span>
                      </div>
                    </div>
                  </section>

                  <section class="ledger-growth share-ledger-growth" aria-label="核心养成">
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">等级</span>
                      <span class="share-ledger-growth-value">Lv {{ number(entry.growth.level) }}</span>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">修为</span>
                      <span class="share-ledger-growth-value">{{ number(entry.growth.elite) }}</span>
                    </div>
                    <div class="ledger-growth-row">
                      <span class="ledger-grow-label">化极</span>
                      <span class="share-ledger-growth-value" :title="operatorShareStarLabel(entry.growth.star_level, entry.sp_of)">{{ operatorShareStarLabel(entry.growth.star_level, entry.sp_of) }}</span>
                    </div>
                  </section>

                  <div class="ledger-destiny" aria-label="双命盘">
                    <div v-for="(loadout, index) in loadouts(entry)" :key="index" class="ledger-destiny-row">
                      <span>命盘{{ index === 0 ? '一' : '二' }}</span>
                      <div class="ledger-destiny-values">
                        <template v-if="loadoutDiscs(loadout).length">
                          <em v-for="disc in loadoutDiscs(loadout)" :key="disc" class="disc-term">{{ disc }}</em>
                        </template>
                        <em v-else class="empty">+ 命盘</em>
                      </div>
                    </div>
                  </div>

                  <div class="ledger-stones" aria-label="已装备星石">
                    <div v-for="(stone, index) in starStoneSlots(entry)" :key="index" class="stone-slot" :class="{ 'is-empty': !stone }">
                      <template v-if="stone">
                        <strong>{{ stone.name || '星石' }}</strong>
                        <small>{{ stone.level || 0 }}</small>
                      </template>
                      <span v-else aria-hidden="true">+</span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </template>

          <Teleport to="body">
            <div v-if="detailEntry" class="share-detail-mask" role="presentation" @click.self="closeDetail">
              <section
                class="share-detail-dialog"
                role="dialog"
                aria-modal="true"
                :aria-labelledby="'operator-share-detail-title-' + detailEntry.id"
                @keydown.esc.prevent="closeDetail"
              >
                <header class="share-detail-head">
                  <div class="share-detail-identity">
                    <div class="ledger-avatar">
                      <img v-if="detailEntry.avatar" :src="avatarUrl(detailEntry.avatar)" :alt="detailEntry.name + '头像'" @error="hideBrokenImage" />
                      <span v-else aria-hidden="true">{{ monogram(detailEntry) }}</span>
                    </div>
                    <div>
                      <p class="operator-tags">
                        <span v-for="prof in detailEntry.prof" :key="prof">{{ prof }}</span>
                        <span v-for="prof in subProfList(detailEntry)" :key="'detail-sub:' + prof" class="outline">{{ prof }}</span>
                      </p>
                      <h2 :id="'operator-share-detail-title-' + detailEntry.id">{{ detailEntry.name }}</h2>
                    </div>
                    <strong v-if="detailEntry.rarity" class="rarity" :aria-label="detailEntry.rarity + '星稀有度'">{{ '★'.repeat(detailEntry.rarity) }}</strong>
                  </div>
                  <button ref="detailCloseButton" type="button" class="share-detail-close" aria-label="关闭密探详情" title="关闭" @click="closeDetail">关闭</button>
                </header>

                <div class="share-detail-scroll">
                  <dl class="growth-summary share-detail-growth">
                    <div><dt>等级</dt><dd>Lv {{ number(detailEntry.growth.level) }}</dd></div>
                    <div><dt>修为</dt><dd>{{ number(detailEntry.growth.elite) }}</dd></div>
                    <div><dt>化极</dt><dd>{{ operatorShareStarLabel(detailEntry.growth.star_level, detailEntry.sp_of) }}</dd></div>
                    <div><dt>攻击</dt><dd>{{ combatValue(detailEntry, 'attack') }}</dd></div>
                    <div><dt>生命</dt><dd>{{ combatValue(detailEntry, 'hp') }}</dd></div>
                  </dl>

                  <section class="share-detail-section">
                    <h3>奇闻</h3>
                    <dl class="oddity-list">
                      <div v-for="oddity in oddities(detailEntry)" :key="oddity.key">
                        <dt>{{ oddity.name }}</dt><dd>{{ oddity.current }}<small> / {{ oddity.max }}</small></dd>
                      </div>
                    </dl>
                  </section>

                  <section class="share-detail-section">
                    <h3>双命盘</h3>
                    <div class="loadout-grid">
                      <div v-for="(loadout, index) in loadouts(detailEntry)" :key="index" class="loadout">
                        <b>{{ loadout && loadout.name ? loadout.name : '命盘 ' + (index + 1) }}</b>
                        <p>{{ loadoutSummary(loadout) }}</p>
                      </div>
                    </div>
                  </section>

                  <section class="share-detail-section">
                    <h3>已装备星石</h3>
                    <ul v-if="starStones(detailEntry).length" class="stone-list">
                      <li v-for="(stone, index) in starStones(detailEntry)" :key="stone.type || index">
                        <b>{{ stone.name || '星石' }}</b><span>{{ stone.level != null ? 'Lv ' + stone.level : '' }}</span>
                      </li>
                    </ul>
                    <p v-else class="muted">未装备星石</p>
                  </section>
                </div>
              </section>
            </div>
          </Teleport>
        </div>
      </section>

      <SiteFooter>
        <template #big>密探 BOX<br /><span>只读分享</span></template>
        <template #fine><b>YuanHub</b> · 神秘代码查看<br />数据仅供参考，请以游戏内实际养成为准</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Heart, Swords } from '@lucide/vue'
import { useRoute, useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import ButterflyIcon from '../../components/operator/ButterflyIcon.vue'
import { getOperatorCatalog, viewOperatorShare } from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { AGENT_PROFS } from '../../data/inventory/catalog.js'
import { normalizeDiscNames } from '../../utils/operatorDiscLoadouts.js'
import { subProfList, subProfOptions as deriveSubProfOptions } from '../../utils/operatorFilters.js'
import {
  filterOperatorShareEntries,
  mergeOperatorShareEntries,
  operatorShareStarLabel,
  parseOperatorShareToken
} from '../../utils/operatorShare.js'

const route = useRoute()
const router = useRouter()
const inputValue = ref('')
const inputError = ref('')
const loadError = ref('')
const status = ref('input')
const share = ref(null)
const entries = ref([])
const searchQuery = ref('')
const profFilter = ref('all')
const subProfFilter = ref('all')
const detailEntry = ref(null)
const detailCloseButton = ref(null)
const profOptions = AGENT_PROFS
const PROF_ICON_FILES = { 阳: 'yang.png', 阴: 'yin.png', 火: 'fire.png', 风: 'wind.png', 水: 'water.png', 地: 'earth.png', 混沌: 'chaos.png' }
const STONE_SLOT_TYPES = ['main1', 'main2', 'main3', 'assist1', 'assist2', 'assist3']
const availableSubProfOptions = computed(function () {
  return deriveSubProfOptions(entries.value)
})
const filteredEntries = computed(function () {
  return filterOperatorShareEntries(entries.value, searchQuery.value, profFilter.value, subProfFilter.value)
})
const hasFilters = computed(function () {
  return Boolean(searchQuery.value.trim() || profFilter.value !== 'all' || subProfFilter.value !== 'all')
})
let detailTriggerEl = null
let loadSeq = 0

function submitToken() {
  const token = parseOperatorShareToken(inputValue.value)
  if (!token) {
    inputError.value = inputValue.value.trim() ? '未识别到有效的神秘代码或分享链接' : '请输入神秘代码或分享链接'
    return
  }
  inputError.value = ''
  router.push({ name: 'operator-share', params: { token: token } })
}

function resetInput() {
  router.push({ name: 'operator-share' })
}

function clearFilters() {
  searchQuery.value = ''
  profFilter.value = 'all'
  subProfFilter.value = 'all'
}

async function loadShare() {
  const token = parseOperatorShareToken(route.params.token)
  const seq = ++loadSeq
  share.value = null
  entries.value = []
  detailEntry.value = null
  detailTriggerEl = null
  loadError.value = ''
  if (!token) {
    status.value = 'input'
    return
  }
  status.value = 'loading'
  try {
    const [shareData, catalog] = await Promise.all([
      viewOperatorShare(token),
      getOperatorCatalog()
    ])
    if (seq !== loadSeq) return
    share.value = shareData || { entries: {} }
    entries.value = mergeOperatorShareEntries(share.value, catalog)
    status.value = entries.value.length ? 'ready' : 'empty'
  } catch (err) {
    if (seq !== loadSeq) return
    status.value = err && (err.status === 404 || err.code === 'share_not_found') ? 'not-found' : 'error'
    loadError.value = humanErr(err)
  }
}

function openDetail(entry, event) {
  detailTriggerEl = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  detailEntry.value = entry
  nextTick(function () {
    if (detailCloseButton.value) detailCloseButton.value.focus()
  })
}

function closeDetail() {
  if (!detailEntry.value) return
  detailEntry.value = null
  const trigger = detailTriggerEl
  detailTriggerEl = null
  nextTick(function () {
    if (trigger && document.contains(trigger)) trigger.focus()
  })
}

function handleDetailKeydown(event) {
  if (event.key !== 'Escape' || !detailEntry.value) return
  event.preventDefault()
  closeDetail()
}

function humanErr(err) {
  if (err && err.message && !/Failed to fetch|NetworkError|fetch/i.test(err.message)) return err.message
  return '网络异常，请稍后重试。'
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

function formattedNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed).toLocaleString('zh-CN') : '—'
}

function combatValue(entry, key) {
  const stats = entry.growth.combat_stats || {}
  const manual = stats['manual_' + key]
  const observed = stats['observed_' + key]
  return formattedNumber(manual != null ? manual : observed)
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
      current: formattedNumber(value.current),
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

function loadoutSummary(loadout) {
  if (!loadout) return '未配置'
  const names = loadoutDiscs(loadout)
  return names.length ? names.join('、') : '未配置'
}

function loadoutDiscs(loadout) {
  const values = [loadout && loadout.discNames, loadout && loadout.disc_names, loadout && loadout.discs]
    .find(function (value) { return Array.isArray(value) && value.length }) || []
  return normalizeDiscNames(values)
}

function starStones(entry) {
  return Array.isArray(entry.growth.star_stones)
    ? entry.growth.star_stones.filter(function (stone) { return stone && (stone.name || stone.type) })
    : []
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

function hideBrokenImage(event) {
  event.currentTarget.hidden = true
}

onMounted(function () {
  window.addEventListener('keydown', handleDetailKeydown)
})

onBeforeUnmount(function () {
  window.removeEventListener('keydown', handleDetailKeydown)
})

watch(function () { return route.params.token }, function () {
  clearFilters()
  loadShare()
}, { immediate: true })
</script>

<style scoped>
.share-main { padding-bottom: 0 }
.page-operator-share .hero { --wm: '享' }
.hero-stats { grid-template-columns: repeat(4, minmax(0, 1fr)) }
.hero-stats .v.compact { font-size: clamp(18px, 2vw, 26px) }
.share-content { padding-top: 34px }
.share-entry,.share-state,.share-toolbar { border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: 0 22px 44px -34px rgba(73, 59, 44, .42) }
.share-entry { max-width: 780px; margin: 0 auto; padding: 34px }
.section-kicker { display: block; margin-bottom: 8px; color: var(--accent-strong); font-size: 11px; font-weight: 800; letter-spacing: .14em }
.share-entry h2,.share-state h2 { font-family: var(--font-s); font-size: clamp(24px, 3vw, 34px); font-weight: 900 }
.share-entry > p,.share-state p { margin-top: 8px; color: var(--ink-60); font-size: 13px; line-height: 1.8 }
.share-entry label { display: block; margin-top: 24px; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.share-entry-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; margin-top: 8px }
.share-entry input { min-width: 0; min-height: 46px; border: 1.5px solid var(--line); border-radius: 12px; padding: 10px 13px; color: var(--ink); background: var(--paper); font: 13px var(--font-d); outline: none }
.share-entry input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .13) }
.share-entry button,.share-state button,.share-toolbar button { min-height: 44px; border: 1px solid var(--tea); border-radius: 999px; padding: 9px 18px; color: var(--cream); background: var(--tea); cursor: pointer; font: 800 13px var(--font-b) }
.share-entry button:hover,.share-state button:hover,.share-toolbar button:hover,.share-entry button:focus-visible,.share-state button:focus-visible,.share-toolbar button:focus-visible { border-color: var(--accent); background: var(--accent); outline: 2px solid transparent }
.entry-error { color: var(--rouge) !important }
.share-state { padding: 54px 30px; text-align: center }
.state-mark { display: grid; width: 54px; height: 54px; margin: 0 auto 16px; place-items: center; border-radius: 50%; color: var(--tea); background: var(--yellow); font: 900 24px var(--font-d) }
.share-state.is-error .state-mark { color: var(--cream); background: var(--rouge) }
.state-actions { display: flex; justify-content: center; gap: 10px; margin-top: 20px }
.share-state button { margin-top: 20px }
.state-actions button { margin-top: 0 }
button.ghost { border-color: var(--line); color: var(--ink-60); background: transparent }
button.ghost:hover,button.ghost:focus-visible { color: var(--ink); background: var(--cream) }
.share-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding: 14px 18px }
.share-toolbar p { flex: 1; color: var(--ink-60); font-size: 12.5px }
.share-toolbar button { min-height: 38px; padding: 7px 14px; font-size: 12px }
.share-filters { display: grid; grid-template-columns: minmax(180px, 1fr) repeat(2, minmax(120px, 170px)) auto auto; align-items: end; gap: 10px; margin-bottom: 20px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255, 253, 246, .78) }
.share-filters label { display: grid; gap: 5px; min-width: 0; color: var(--ink-60); font-size: 11px; font-weight: 800 }
.share-filters input,.share-filters select { width: 100%; min-height: 38px; border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; color: var(--ink); background: var(--paper); font: 12px var(--font-b); outline: none }
.share-filters input:focus,.share-filters select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215, 137, 53, .13) }
.share-filters select { cursor: pointer }
.share-result-count { align-self: center; color: var(--ink-60); font: 11px var(--font-d); white-space: nowrap }
.share-filters button { min-height: 38px; padding: 7px 14px; font-size: 12px }
.share-ledger { margin-top: 16px; padding: 16px; border: 1px solid rgba(255, 248, 236, .22); border-radius: 20px; background: linear-gradient(145deg, var(--tea), var(--tea-deep)); box-shadow: 0 20px 40px -24px rgba(73, 59, 44, .55) }
.current-ledger-meta { display: flex; justify-content: space-between; gap: 12px; padding: 0 2px 14px; color: rgba(255, 248, 236, .76); font-size: 11px; font-weight: 700; line-height: 1.6 }
.current-ledger-meta span { min-width: 0; overflow-wrap: anywhere }
.current-ledger-meta span:last-child { color: var(--yellow) }
.operator-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px }
.agent-ledger-card { --ledger-rarity-accent: #99b5cf; position: relative; min-width: 0; display: flex; flex-direction: column; gap: 11px; padding: 14px 12px 12px; color: var(--ink); border: 1px solid var(--line); border-top: 2px solid var(--ledger-rarity-accent); border-radius: 12px; background: linear-gradient(180deg, var(--surface), var(--cream)); box-shadow: 0 8px 24px rgba(73, 59, 44, .18), inset 0 1px 0 rgba(255, 255, 255, .8); cursor: pointer; transition: transform .35s var(--ease), box-shadow .35s var(--ease) }
.agent-ledger-card:hover { z-index: 20; transform: translateY(-5px); box-shadow: 0 18px 30px rgba(73, 59, 44, .25), inset 0 1px 0 rgba(255, 255, 255, .8) }
.agent-ledger-card:focus-visible { z-index: 20; outline: 2px solid var(--brand-blue); outline-offset: 2px; transform: translateY(-5px); box-shadow: 0 18px 30px rgba(73, 59, 44, .25), inset 0 1px 0 rgba(255, 255, 255, .8) }
.agent-ledger-card.rarity-r5 { --ledger-rarity-accent: var(--accent) }
.agent-ledger-card.rarity-r4 { --ledger-rarity-accent: #8672b2 }
.agent-ledger-card.rarity-r3 { --ledger-rarity-accent: #99b5cf }
.ledger-card-head { position: relative; display: flex; gap: 10px; align-items: center; min-width: 0 }
.ledger-avatar { position: relative; flex: none; width: 46px; height: 46px; overflow: hidden; border: 2px solid var(--ledger-rarity-accent); border-radius: 10px; background: color-mix(in srgb, var(--ledger-rarity-accent) 16%, var(--paper)) }
.ledger-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 8px }
.ledger-avatar > span { display: grid; width: 100%; height: 100%; place-items: center; color: var(--ink-35); font: 900 21px var(--font-s) }
.ledger-identity { min-width: 0; flex: 1 }
.ledger-name-row { display: flex; min-width: 0; align-items: center; gap: 5px }
.ledger-name-row h3 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 900 16px var(--font-s) }
.ledger-name-row .rarity { margin-left: auto }
.ledger-mobile-prof { display: none }
.ledger-prof { display: flex; align-items: center; gap: 6px; min-width: 0; margin-top: 2px; color: var(--ink-60); font-size: 10.5px; font-weight: 700 }
.ledger-prof-copy { display: flex; min-width: 0; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.ledger-prof img { width: 15px; height: 15px; flex: none; object-fit: contain }
.operator-tags { display: flex; flex-wrap: wrap; gap: 5px }
.operator-tags span { border-radius: 999px; padding: 2px 8px; color: var(--ink); background: var(--yellow); font-size: 10px; font-weight: 800 }
.operator-tags span.outline { border: 1px solid var(--brand-blue); color: var(--brand-blue); background: transparent }
.rarity { color: var(--yellow-deep); font-size: 9px; letter-spacing: 0; white-space: nowrap }
.ledger-combat { display: grid; grid-template-columns: 1fr 1fr; gap: 7px }
.ledger-combat-stat { min-width: 0; padding: 7px 8px 6px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface) }
.ledger-combat-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; color: var(--ink-60); font-size: 10px; font-weight: 800 }
.ledger-combat-head > span { display: inline-flex; align-items: center; gap: 3px }
.ledger-combat-value { display: block; width: 100%; min-width: 0; margin-top: 3px; padding: 1px 0 3px; border-bottom: 1px dashed var(--accent); color: var(--ink); font: 900 20px/1 var(--font-d); text-align: center }
.ledger-combat-source { display: block; min-height: 12px; margin-top: 4px; color: var(--ink-35); font-size: 8px; font-weight: 800; text-align: center }
.ledger-oddity { display: flex; align-items: center; justify-content: center; gap: 3px; margin-top: 4px; color: var(--accent-strong); font: 800 10px var(--font-d) }
.ledger-oddity-icon { display: block; width: 12px; height: 12px; flex: none; color: var(--ink-60); font-size: 10px; line-height: 12px; text-align: center }
.ledger-oddity > span:last-child { color: var(--ink-35); font-size: 9px }
.ledger-combat + .ledger-growth { margin-top: -10px }
.ledger-growth { display: flex; flex-direction: column; gap: 7px; padding: 9px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255, 255, 255, .62) }
.ledger-growth-row { display: flex; min-width: 0; min-height: 24px; align-items: center; gap: 5px; font-size: 11px }
.ledger-grow-label { width: 32px; flex: none; color: var(--ink-60); font-weight: 700 }
.share-ledger-growth-value { min-width: 0; margin: 0; overflow: hidden; color: var(--ink); font: 700 13px var(--font-d); text-overflow: ellipsis; white-space: nowrap }
.ledger-destiny { display: flex; flex-direction: column; gap: 5px; padding-top: 2px }
.ledger-destiny-row { position: relative; display: flex; align-items: center; gap: 10px; min-width: 0 }
.ledger-destiny-row > span { display: inline-flex; flex: none; align-items: center; color: var(--accent-strong); font-size: 10px; font-weight: 800; line-height: 1.2 }
.ledger-destiny-row > .ledger-destiny-values { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; min-width: 0 }
.ledger-destiny-row em { display: inline-flex; align-items: center; justify-content: center; padding: 2px 5px; border: 1px solid rgba(215, 137, 53, .28); border-radius: 4px; background: rgba(215, 137, 53, .12); color: var(--ink); font-size: 9px; font-style: normal; font-weight: 500; line-height: 1.2 }
.ledger-destiny-row em.empty { border-style: dashed; background: transparent; color: var(--ink-35) }
.ledger-destiny-row:nth-child(1) > span { color: #a66c2b }
.ledger-destiny-row:nth-child(1) em { border-color: #e7c89c; background: #faf1e4 }
.ledger-destiny-row:nth-child(1) em.empty { border-color: #e7c89c; background: transparent; color: #a66c2b }
.ledger-destiny-row:nth-child(2) > span { color: #7e7a72 }
.ledger-destiny-row:nth-child(2) em { border-color: #d8d3cb; background: #f5f2ed; color: #7e7a72 }
.ledger-destiny-row:nth-child(2) em.empty { border-color: #d8d3cb; background: transparent; color: #7e7a72 }
.ledger-stones { position: relative; display: grid; align-content: start; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 3px; margin-top: auto; padding-top: 2px; overflow: visible }
.ledger-stones > .stone-slot { width: 100%; aspect-ratio: 1; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; min-height: 0; padding: 0; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); color: var(--ink); font: inherit; text-align: center; box-sizing: border-box }
.ledger-stones > .stone-slot.is-empty { min-height: 0; background: transparent; color: var(--line); font-size: 15px }
.ledger-stones strong { max-width: 100%; overflow: hidden; color: var(--ink); font-size: 8px; text-overflow: ellipsis; white-space: nowrap }
.ledger-stones small { color: var(--ink-60); font: 8px var(--font-d) }
.growth-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 18px }
.growth-summary div { min-width: 0; border-radius: 10px; padding: 9px 7px; background: var(--paper); text-align: center }
.growth-summary dt { color: var(--ink-60); font-size: 10px; font-weight: 700 }
.growth-summary dd { margin-top: 4px; overflow-wrap: anywhere; font: 900 14px var(--font-d) }
.share-detail-section { margin-top: 17px; padding-top: 14px; border-top: 1px dashed var(--line) }
.share-detail-section h3 { font: 900 14px var(--font-s) }
.oddity-list,.loadout-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 10px }
.oddity-list div,.loadout { min-width: 0; border: 1px solid var(--line); border-radius: 10px; padding: 8px 9px; background: var(--cream) }
.oddity-list dt { overflow: hidden; color: var(--ink-60); font-size: 10px; text-overflow: ellipsis; white-space: nowrap }
.oddity-list dd { margin-top: 3px; font: 900 14px var(--font-d) }
.oddity-list small { color: var(--ink-35); font-size: 10px }
.loadout-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) }
.loadout b { font-size: 11px }
.loadout p,.muted { margin-top: 4px; color: var(--ink-60); font-size: 11px; line-height: 1.6 }
.stone-list { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; list-style: none }
.stone-list li { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 999px; padding: 5px 9px; background: var(--paper); font-size: 10.5px }
.stone-list span { color: var(--accent-strong); font-family: var(--font-d); font-weight: 800 }
.share-detail-mask { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; overflow-y: auto; padding: 24px; background: rgba(73, 59, 44, .52); backdrop-filter: blur(6px) }
.share-detail-dialog { width: min(760px, 100%); max-height: min(820px, calc(100vh - 48px)); max-height: min(820px, calc(100dvh - 48px)); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 30px 90px rgba(73, 59, 44, .32) }
.share-detail-head { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; border-bottom: 1px solid var(--line) }
.share-detail-identity { display: flex; min-width: 0; align-items: flex-start; gap: 12px }
.share-detail-identity > div:nth-child(2) { min-width: 0 }
.share-detail-identity .ledger-avatar { --ledger-rarity-accent: var(--accent); width: 64px; height: 68px; border-radius: 12px }
.share-detail-identity h2 { margin-top: 5px; overflow-wrap: anywhere; font: 900 25px var(--font-s) }
.share-detail-identity .rarity { margin-left: 2px; font-size: 11px; letter-spacing: 1px }
.share-detail-close { min-width: 64px; min-height: 42px; flex: none; border: 1px solid var(--tea); border-radius: 999px; color: var(--cream); background: var(--tea); cursor: pointer; font: 800 12px var(--font-b) }
.share-detail-close:hover,.share-detail-close:focus-visible { border-color: var(--accent); background: var(--accent); outline: 2px solid transparent }
.share-detail-scroll { min-height: 0; overflow-y: auto; padding: 0 24px 24px; overscroll-behavior: contain }
.share-detail-growth { margin-top: 20px }
@media (max-width: 920px) {
  .operator-grid { grid-template-columns: 1fr }
  .hero-stats { grid-template-columns: repeat(2, minmax(0, 1fr)) }
}
@media (max-width: 640px) {
  .share-content { padding-top: 22px }
  .share-entry { padding: 24px 18px }
  .share-entry-row,.growth-summary { grid-template-columns: 1fr }
  .share-toolbar { align-items: stretch; flex-direction: column }
  .share-toolbar button { width: 100% }
  .share-filters { grid-template-columns: 1fr; align-items: stretch }
  .share-filters label { gap: 6px }
  .share-result-count { align-self: auto }
  .share-filters button { width: 100% }
  .share-ledger { margin-inline: -2px; padding: 12px; border-radius: 16px }
  .current-ledger-meta { flex-direction: column; gap: 4px; padding-bottom: 12px; font-size: 12px; line-height: 1.5 }
  .agent-ledger-card { padding: 14px 12px 12px; gap: 12px }
  .ledger-card-head { gap: 9px }
  .ledger-avatar { width: 44px; height: 44px }
  .ledger-name-row { justify-content: flex-start }
  .ledger-name-row h3 { flex: 0 1 auto; max-width: 42%; font-size: 16px }
  .ledger-mobile-prof { display: inline-flex; min-width: 0; flex: 1 1 auto; align-items: center; gap: 3px; overflow: hidden; color: var(--ink-60); font-size: 10.5px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap }
  .ledger-mobile-prof img { width: 14px; height: 14px; flex: none; object-fit: contain }
  .ledger-prof { display: none }
  .rarity { display: none }
  .ledger-combat { gap: 8px }
  .ledger-combat-stat { padding: 9px 10px 8px }
  .ledger-combat-head { font-size: 11.5px }
  .ledger-combat-value { min-height: 30px; font-size: 24px }
  .ledger-combat-source { min-height: 14px; font-size: 10px }
  .ledger-oddity { font-size: 11.5px }
  .ledger-growth { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 7px 8px }
  .ledger-growth-row { display: flex; min-width: 0; min-height: 72px; align-items: stretch; flex-direction: column; gap: 5px }
  .ledger-grow-label { width: auto; min-height: 18px; font-size: 11px; text-align: center }
  .share-ledger-growth-value { display: grid; width: 100%; min-height: 34px; align-items: center; justify-content: center; padding-inline: 2px; font-size: 15px; text-align: center }
  .ledger-destiny-row > span { font-size: 11px }
  .ledger-stones { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px }
  .ledger-stones > .stone-slot { aspect-ratio: 1 }
  .ledger-stones strong,.ledger-stones small { font-size: 9.5px }
  .growth-summary { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .oddity-list { grid-template-columns: 1fr }
  .state-actions { flex-direction: column }
  .share-detail-mask { place-items: stretch; overflow: hidden; padding: 0 }
  .share-detail-dialog { width: 100%; max-height: 100dvh; min-height: 100dvh; border: 0; border-radius: 0 }
  .share-detail-head { align-items: flex-start; padding: calc(14px + env(safe-area-inset-top)) 16px 14px }
  .share-detail-identity .ledger-avatar { width: 54px; height: 58px; border-radius: 10px }
  .share-detail-identity h2 { font-size: 21px }
  .share-detail-scroll { padding: 0 16px calc(20px + env(safe-area-inset-bottom)) }
}
</style>
