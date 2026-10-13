<template>
  <section class="period-report" aria-labelledby="period-report-title">
    <header class="report-head">
      <div class="report-head-copy">
        <span>周期获得账簿</span>
        <h2 id="period-report-title">据点收获统计</h2>
      </div>
      <slot name="actions" />
    </header>

    <div class="report-metrics">
      <article class="report-metric coin-metric">
        <CircleDollarSign :size="18" aria-hidden="true" />
        <span>白金币总价值</span>
        <strong>{{ itemTotalsAvailable ? formatNumber(insights.whiteCoin.equivalent) : '—' }}</strong>
        <small v-if="itemTotalsAvailable" class="coin-formula">
          洛阳派遣 {{ formatNumber(insights.whiteCoin.luoyang) }}<template v-if="insights.whiteCoin.yuanbao"> + 鸢报 {{ formatNumber(insights.whiteCoin.yuanbao) }}</template><template v-if="insights.whiteCoin.other"> + 其他／未分类 {{ formatNumber(insights.whiteCoin.other) }}</template> + 茱萸 {{ formatNumber(insights.whiteCoin.zhuyu) }} x 50
        </small>
        <small v-if="itemTotalsAvailable" class="coin-average">平均每小时收获 <b>{{ averageWhiteCoinPerHour === null ? '—' : formatAverage(averageWhiteCoinPerHour) }}</b></small>
        <small v-else>背包奖励汇总未能加载</small>
      </article>
      <article class="report-metric">
        <HeartHandshake :size="18" aria-hidden="true" />
        <span>特别关注心纸</span>
        <strong>{{ favoriteTotalValue }}<i v-if="hasFavoriteTotal">张</i></strong>
        <small>{{ favoriteTotalHint }}</small>
      </article>
      <article class="report-metric">
        <Clock3 :size="18" aria-hidden="true" />
        <span>派遣总时长</span>
        <strong>{{ recordsAvailable ? formatNumber(dispatchDuration.totalHours) : '—' }}<i v-if="recordsAvailable">小时</i></strong>
        <small v-if="recordsAvailable && dispatchDuration.source" class="dispatch-duration-split">
          <span class="coin-average">洛阳 {{ formatNumber(dispatchDuration.luoyangHours) }}小时 · 寿春 {{ formatNumber(dispatchDuration.shouchunHours) }}小时</span>
        </small>
        <small v-else-if="!recordsAvailable">奖励流水明细未能加载</small>
        <small v-else>本期没有可换算的派遣流水</small>
      </article>
      <article class="report-metric">
        <Flame :size="18" aria-hidden="true" />
        <span>白金币狂潮</span>
        <strong>{{ recordsAvailable ? formatNumber(insights.whiteCoin.longestStreak) : '—' }}<i v-if="recordsAvailable">天</i></strong>
        <small>{{ recordsAvailable ? '洛阳派遣连续获得白金币或茱萸' : '需要奖励流水明细' }}</small>
      </article>
    </div>

    <div class="report-body">
      <section class="lucky-days" aria-labelledby="lucky-days-title">
        <header class="subsection-heading">
          <div><Sparkles :size="16" aria-hidden="true" /><h3 id="lucky-days-title">幸运日</h3></div>
        </header>
        <div v-if="sameLuckyDay" class="same-day-convergence" role="group" :aria-label="'双喜同日，' + formatDay(luckyDays[0].date)">
          <div class="same-day-date">
            <div class="same-day-date-line">
              <time :datetime="luckyDays[0].date">{{ formatDay(luckyDays[0].date) }}</time>
              <span class="same-day-mark"><PartyPopper :size="11" aria-hidden="true" />双喜同日</span>
            </div>
            <small>两项峰值同日达成</small>
          </div>
          <ul class="same-day-rewards" aria-label="同日收获">
            <li v-for="luckyDay in luckyDays" :key="luckyDay.kind">
              <span class="same-day-reward-icon" aria-hidden="true">
                <CircleDollarSign v-if="luckyDay.kind === 'coin'" :size="15" />
                <HeartHandshake v-else :size="15" />
              </span>
              <div>
                <span>{{ luckyDay.label }}</span>
                <small>{{ luckyDay.detail }}</small>
              </div>
            </li>
          </ul>
        </div>
        <ol v-else class="lucky-day-timeline" aria-label="幸运日时间线，按日期由早到晚排列">
          <li v-for="luckyDay in luckyDays" :key="luckyDay.kind" :class="{ 'is-empty': !luckyDay.date }">
            <span>{{ luckyDay.label }}</span>
            <time v-if="luckyDay.date" :datetime="luckyDay.date">{{ formatDay(luckyDay.date) }}</time>
            <small v-if="luckyDay.date">{{ luckyDay.detail }}</small>
            <p v-else>{{ luckyDay.emptyText }}</p>
          </li>
        </ol>
      </section>

      <section class="heart-ranking" aria-labelledby="heart-ranking-title">
        <header class="subsection-heading ranking-heading">
          <div><Heart :size="16" aria-hidden="true" /><h3 id="heart-ranking-title">心纸排行</h3></div>
          <div class="ranking-switch" aria-label="心纸排行范围">
            <button type="button" :aria-pressed="effectiveRankingMode === 'favorites'" :class="{ on: effectiveRankingMode === 'favorites' }" :disabled="!hasFavorites" @click="rankingMode = 'favorites'">特别关注</button>
            <button type="button" :aria-pressed="effectiveRankingMode === 'all'" :class="{ on: effectiveRankingMode === 'all' }" @click="rankingMode = 'all'">全部密探</button>
          </div>
        </header>
        <label v-if="effectiveRankingMode === 'all'" class="ranking-rarity-checkbox">
          <input v-model="goldOnly" type="checkbox" />
          <span>只看金卡</span>
        </label>

        <p v-if="favoriteLoading" class="ranking-state" role="status">正在同步特别关注名单…</p>
        <p v-else-if="!agentTotalsAvailable" class="ranking-state">密探心纸汇总未能加载</p>
        <p v-else-if="ranking.length === 0" class="ranking-state">{{ rankingEmptyText }}</p>
        <template v-else>
          <ol class="podium" aria-label="心纸获得量前三名">
            <li v-for="agent in podium" :key="agent.id" :class="'place-' + agent.place">
              <span class="portrait">
                <span class="portrait-fallback" aria-hidden="true">{{ monogram(agent.name) }}</span>
                <img :src="agentIcon(agent.id)" :alt="agent.name" width="64" height="64" loading="lazy" @load="onImageLoad" @error="onImageError" />
                <b class="portrait-count">+{{ formatNumber(agent.count) }}</b>
              </span>
              <strong>{{ agent.name }}</strong>
              <span class="podium-base" aria-hidden="true">
                <span class="podium-medal">{{ ['🥇', '🥈', '🥉'][agent.place - 1] }}</span>
              </span>
            </li>
          </ol>
        </template>
        <aside v-if="absence" class="absence-contrast" :class="{ 'is-undetermined': !absence.id }">
          <span v-if="absence.id" class="absence-portrait">
            <span class="portrait-fallback" aria-hidden="true">{{ monogram(absence.name) }}</span>
            <img :src="agentIcon(absence.id)" :alt="absence.name" width="48" height="48" loading="lazy" @load="onImageLoad" @error="onImageError" />
          </span>
          <div class="absence-copy">
            <span>久未回响</span>
            <div v-if="absence.id"><strong>{{ absence.name }}</strong><p>{{ absence.detail }}</p></div>
            <strong v-else>{{ absence.detail }}</strong>
          </div>
          <small v-if="absence.meta" class="absence-meta">{{ absence.meta }}</small>
          <img class="absence-seal" :src="absenceSeal" alt="" width="250" height="193" aria-hidden="true" />
        </aside>
        <p v-if="favoriteError && !favoriteLoading" class="ranking-hint is-error">特别关注名单同步失败：{{ favoriteError }}</p>
        <p v-else-if="!hasFavorites && !favoriteLoading" class="ranking-hint">星标密探后，这里会默认展示特别关注排行。</p>
      </section>

      <section class="favorite-echo" aria-labelledby="favorite-echo-title">
        <header class="subsection-heading">
          <div><Users :size="16" aria-hidden="true" /><h3 id="favorite-echo-title">关注回响</h3></div>
        </header>
        <p v-if="favoriteLoading" class="ranking-state" role="status">正在同步特别关注名单…</p>
        <p v-else-if="favoriteError" class="ranking-state is-error">特别关注名单同步失败，暂时无法生成关注统计。</p>
        <p v-else-if="!hasFavorites" class="ranking-state">还没有特别关注密探，先在密探清单中点亮星标。</p>
        <template v-else>
          <div class="coverage-line">
            <span>关注回应率</span>
            <strong>{{ insights.agents.favoriteAcquiredCount }} / {{ insights.agents.favoriteCount }}</strong>
          </div>
          <div class="measure-track" aria-hidden="true"><i :style="{ '--measure-scale': insights.agents.coverageRatio || 0 }"></i></div>
          <small class="coverage-copy">本期获得过 {{ insights.agents.favoriteAcquiredCount }} 位特别关注密探的心纸</small>

          <div class="echo-divider"></div>

          <div class="bias-line">
            <span>偏爱指数</span>
            <strong>{{ insights.agents.favoriteTotal ? insights.agents.bias.percent + '%' : '—' }}</strong>
          </div>
          <p class="bias-copy">
            <template v-if="!insights.agents.favoriteTotal">本期尚无关注心纸收获</template>
            <template v-else-if="!insights.agents.bias.sampleSufficient">样本较少，算不准说不得，过几天再来看看吧</template>
            <template v-else>{{ insights.agents.bias.label }} · {{ insights.agents.bias.leader.name }}占本期关注心纸的 {{ insights.agents.bias.percent }}%</template>
          </p>

          <aside v-if="luckyCoframe" class="lucky-coframe" :aria-label="formatDay(luckyCoframe.date) + '幸运同框，' + coframeTypeCount + '人'">
            <div class="coframe-head">
              <div class="coframe-heading">
                <span class="coframe-title">✦ LUCKY BURST</span>
                <small>{{ formatDay(luckyCoframe.date) }} · {{ luckyCoframe.channel }}</small>
              </div>
              <span class="coframe-count">{{ coframeTypeCount }} 人同框</span>
            </div>
            <ul class="coframe-agents" aria-label="同框密探">
              <li v-for="agent in luckyCoframe.agents" :key="agent.id" :aria-label="agent.name + '，心纸' + formatNumber(agent.count) + '张'">
                <span class="coframe-portrait" aria-hidden="true">
                  <span class="portrait-fallback">{{ monogram(agent.name) }}</span>
                  <img :src="agentIcon(agent.id)" alt="" width="34" height="34" loading="lazy" @load="onImageLoad" @error="onImageError" />
                </span>
                <strong>{{ agent.name }}</strong>
                <b>×{{ formatNumber(agent.count) }}</b>
              </li>
            </ul>
          </aside>
        </template>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { CircleDollarSign, Clock3, Flame, Heart, HeartHandshake, PartyPopper, Sparkles, Users } from '@lucide/vue'

const props = defineProps({
  insights: { type: Object, required: true },
  dispatchDuration: { type: Object, required: true },
  goldAgentIds: { type: Array, default: () => [] },
  itemTotalsAvailable: { type: Boolean, default: true },
  agentTotalsAvailable: { type: Boolean, default: true },
  recordsAvailable: { type: Boolean, default: true },
  favoriteLoading: { type: Boolean, default: false },
  favoriteError: { type: String, default: '' }
})

const rankingMode = ref('favorites')
const goldOnly = ref(false)
const absenceSeal = import.meta.env.BASE_URL + 'longtimenosee.png'
const hasFavorites = computed(function () { return props.insights.agents.favoriteCount > 0 })
const goldAgentIdSet = computed(function () { return new Set(props.goldAgentIds) })
const hasFavoriteTotal = computed(function () {
  return !props.favoriteLoading && !props.favoriteError && props.agentTotalsAvailable && hasFavorites.value
})
const favoriteTotalValue = computed(function () {
  return hasFavoriteTotal.value ? formatNumber(props.insights.agents.favoriteTotal) : '—'
})
const favoriteTotalHint = computed(function () {
  if (props.favoriteLoading) return '正在同步特别关注名单'
  if (props.favoriteError || !props.agentTotalsAvailable) return '关注统计暂不可用'
  if (!hasFavorites.value) return '建立特别关注后统计'
  const names = (props.insights.agents.favorites || []).map(function (agent) { return agent.name }).join('')
  return '啊啊...' + names + '碎片来 𓀎 𓀏 𓀐 𓀑 𓀒𓀓 𓀔 𓀕'
})
const averageWhiteCoinPerHour = computed(function () {
  if (!props.recordsAvailable || !props.itemTotalsAvailable) return null
  const hours = Number(props.dispatchDuration.luoyangHours) || 0
  if (!hours) return null
  const whiteCoinEquivalent = (Number(props.insights.whiteCoin.luoyang) || 0) + (Number(props.insights.whiteCoin.luoyangZhuyu) || 0) * 50
  return whiteCoinEquivalent / hours
})
const effectiveRankingMode = computed(function () {
  return rankingMode.value === 'favorites' && hasFavorites.value ? 'favorites' : 'all'
})
const ranking = computed(function () {
  const source = effectiveRankingMode.value === 'favorites' ? props.insights.agents.favoriteRanking : props.insights.agents.ranking
  return effectiveRankingMode.value === 'all' && goldOnly.value
    ? source.filter(function (agent) { return goldAgentIdSet.value.has(agent.id) })
    : source
})
const podium = computed(function () {
  return ranking.value.slice(0, 3).map(function (agent, index) {
    return Object.assign({}, agent, { place: index + 1 })
  })
})
const sameLuckyDay = computed(function () {
  const coin = props.insights.whiteCoin.bestDay
  const favorite = props.insights.agents.luckyDay
  return props.recordsAvailable && !!(coin && favorite && coin.date === favorite.date)
})
const luckyDays = computed(function () {
  const coin = props.recordsAvailable ? props.insights.whiteCoin.bestDay : null
  const favorite = props.recordsAvailable ? props.insights.agents.luckyDay : null
  const rows = [
    {
      kind: 'coin',
      label: '白金币',
      date: coin ? coin.date : '',
      detail: coin ? '等价 ' + formatNumber(coin.count) + (coin.tieCount > 1 ? ' · ' + coin.tieCount + ' 天并列' : '') : '',
      emptyText: props.recordsAvailable ? '本期暂无收获' : '明细暂不可用',
      order: 0
    },
    {
      kind: 'favorite',
      label: '关注心纸',
      date: favorite ? favorite.date : '',
      detail: favorite ? formatNumber(favorite.count) + '张 · ' + formatAgentCounts(favorite.agents) : '',
      emptyText: favoriteLuckyEmptyText.value,
      order: 1
    }
  ]
  return rows.sort(function (left, right) {
    if (left.date && right.date) return left.date.localeCompare(right.date) || left.order - right.order
    if (left.date) return -1
    if (right.date) return 1
    return left.order - right.order
  })
})
const absence = computed(function () {
  const agents = props.insights.agents
  if (!hasFavorites.value || props.favoriteError || !props.agentTotalsAvailable) return null
  const target = agents.absenceTarget
  if (target) {
    if (target.kind === 'never') {
      return {
        id: target.id,
        name: target.name,
        detail: '还没有捡到过……',
        meta: '暂无流水记录'
      }
    }
    return {
      id: target.id,
      name: target.name,
      detail: '已经 ' + target.daysSinceLast + ' 天没有捡到了……',
      meta: '上次获得 ' + formatDay(target.lastDay)
    }
  }
  return { detail: '尚未发现长期失联人员。' }
})
const luckyCoframe = computed(function () { return props.insights.agents.luckyCoframes[0] || null })
const coframeTypeCount = computed(function () { return luckyCoframe.value ? luckyCoframe.value.agents.length : 0 })
const rankingEmptyText = computed(function () {
  if (effectiveRankingMode.value === 'favorites') return '本期还没有获得特别关注密探的心纸'
  return goldOnly.value ? '本期还没有获得金卡密探的心纸' : '本期还没有心纸收获'
})
const favoriteLuckyEmptyText = computed(function () {
  if (!props.recordsAvailable) return '明细暂不可用'
  if (!hasFavorites.value) return '特别关注后统计'
  return '本期暂无收获'
})

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('zh-CN')
}

function formatAverage(value) {
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

function formatDay(value) {
  const parts = String(value || '').split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value || ''
  return parts[1] + '月' + parts[2] + '日'
}

function formatAgentCounts(agents) {
  const rows = Array.isArray(agents) ? agents : []
  return rows.length ? rows.map(function (agent) { return agent.name + '×' + formatNumber(agent.count) }).join('、') : '暂无人物明细'
}

function monogram(name) {
  return Array.from(String(name || '?'))[0] || '?'
}

function agentIcon(id) {
  return import.meta.env.BASE_URL + 'inventory-icons/agents/' + encodeURIComponent(id) + '.png'
}

function onImageLoad(event) {
  const image = event && event.currentTarget
  if (!image) return
  image.hidden = false
  if (image.parentElement) image.parentElement.classList.remove('has-image-error')
}

function onImageError(event) {
  const image = event && event.currentTarget
  if (!image) return
  image.hidden = true
  if (image.parentElement) image.parentElement.classList.add('has-image-error')
}
</script>

<style scoped>
/* 刻意共享的字段外观与装饰动画；布局和密度由双端文件持有。 */

.period-report { border: 1px solid var(--line); background: var(--surface) }
.report-head { border-bottom: 1px solid var(--line) }
.report-head-copy > span, .subsection-heading > div > svg { color: var(--accent-strong) }
.report-head-copy > span { font-weight: 900 }
.report-head h2 { color: var(--ink); font-family: var(--font-s); font-weight: 900; letter-spacing: 0 }
.report-metrics { border-bottom: 1px solid var(--line) }
.report-metric + .report-metric { border-left: 1px solid var(--line) }
.report-metric > svg { color: var(--ink-35) }
.report-metric > span { color: var(--ink-60); font-weight: 800 }
.report-metric > strong { color: var(--ink); font-family: var(--font-d); font-weight: 900; letter-spacing: 0; line-height: 1 }
.report-metric > strong i { color: var(--accent-strong); font-family: var(--font-b); font-style: normal; font-weight: 800 }
.report-metric > small { color: var(--ink-35); font-weight: 700; line-height: 1.55 }
.coin-average { color: var(--ink-60) !important }
.coin-average b { color: var(--accent-strong); font-family: var(--font-d); font-weight: 900 }
.coin-metric { background: var(--cream) }
.coin-metric > strong { color: var(--accent-strong) }
.coin-metric > svg { color: var(--accent-strong) }
.report-body > section + section { border-left: 1px solid var(--line) }
.favorite-echo { background: var(--cream) }
.subsection-heading h3 { color: var(--ink); font-family: var(--font-s); font-weight: 900; letter-spacing: 0 }
.subsection-heading > span { color: var(--ink-35); font-weight: 700 }
.same-day-mark { border: 1px solid var(--accent); background: var(--yellow); color: var(--ink) !important; white-space: nowrap }
.same-day-convergence { border-top: 1px dashed var(--line) }
.same-day-convergence::before { background: var(--accent); content: '' }
.same-day-convergence::after { border: 3px solid var(--surface); background: var(--yellow); box-shadow: 0 0 0 1px var(--accent); content: '' }
.same-day-date-line > .same-day-mark { font-weight: 900 }
.same-day-date time { color: var(--ink); font-family: var(--font-s); font-weight: 900; white-space: nowrap }
.same-day-date > small { color: var(--ink-60); font-weight: 700 }
.same-day-rewards { list-style: none }
.same-day-rewards > li { border-top: 1px solid var(--line) }
.same-day-rewards > li:last-child { border-bottom: 1px solid var(--line) }
.same-day-reward-icon { border: 1px solid var(--accent); background: var(--cream); color: var(--accent-strong) }
.same-day-rewards > li > div > span { color: var(--ink); font-weight: 900 }
.same-day-rewards > li > div > small { color: var(--ink-60); font-weight: 700; line-height: 1.55 }
.lucky-day-timeline { border-top: 1px dashed var(--line); list-style: none }
.lucky-day-timeline::before { background: var(--line); content: '' }
.lucky-day-timeline span { color: var(--ink-60); font-weight: 800 }
.lucky-day-timeline time { color: var(--ink); font-family: var(--font-s); font-weight: 900; line-height: 1.25; white-space: nowrap }
.lucky-day-timeline time::before, .lucky-day-timeline > li.is-empty p::before { border: 3px solid var(--surface); background: var(--accent); box-shadow: 0 0 0 1px var(--accent); content: '' }
.lucky-day-timeline small, .lucky-day-timeline p { color: var(--ink-60); font-weight: 700; line-height: 1.55 }
.lucky-day-timeline p { color: var(--ink-35) }
.lucky-day-timeline > li.is-empty p::before { background: var(--surface); box-shadow: 0 0 0 1px var(--line) }
.ranking-switch { border: 1px solid var(--line); background: var(--paper) }
.ranking-switch button { border: 0; background: transparent; color: var(--ink-60); font-family: var(--font-b); font-weight: 800; cursor: pointer; white-space: nowrap }
.ranking-switch button.on { background: var(--tea); color: var(--cream) }
.ranking-switch button:disabled { opacity: .42; cursor: not-allowed }
.ranking-switch button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }
.ranking-rarity-checkbox { color: var(--ink-60); font-weight: 800; cursor: pointer; user-select: none }
.ranking-rarity-checkbox input { accent-color: var(--accent) }
.ranking-rarity-checkbox input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
.ranking-state { color: var(--ink-35); font-weight: 700 }
.ranking-hint { color: var(--ink-35); font-weight: 700 }
.ranking-hint.is-error, .ranking-state.is-error { color: var(--rouge) }
.podium { list-style: none }
.portrait { border: 1px solid var(--line); background: var(--paper) }
.place-1 .portrait { border: 2px solid var(--accent) }
.portrait-fallback { color: var(--ink-35); font-family: var(--font-s); font-weight: 900 }
.portrait-count { border: 2px solid var(--surface); background: var(--tea); color: var(--cream); font-family: var(--font-d); font-weight: 900; line-height: 1 }
.place-1 .portrait-count { background: var(--accent); color: var(--cream) }
.podium li > strong { color: var(--ink); font-weight: 900; text-overflow: ellipsis; white-space: nowrap }
.podium-base { border: 1px solid var(--line); border-bottom: 0; background: var(--cream); box-shadow: inset 0 4px 0 rgba(215,137,53,.12) }
.place-1 .podium-base { border: 2px solid var(--accent); border-bottom: 0; background: var(--yellow); box-shadow: inset 0 5px 0 rgba(255,253,246,.35) }
.place-2 .podium-base { background: var(--paper) }
.podium-medal { font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; line-height: 1 }
.podium-base small { color: var(--ink-60); font-weight: 800; line-height: 1.4 }
.absence-contrast { border: 1px solid var(--brand-blue); background: var(--surface) }
.absence-contrast::before { border: 1px dashed rgba(91,106,140,.28); content: ''; pointer-events: none }
.absence-portrait { border: 1px solid var(--brand-blue); background: var(--paper) }
.absence-portrait img { filter: grayscale(.72); opacity: .72 }
.absence-copy > span { color: var(--brand-blue); font-weight: 900 }
.absence-copy strong { color: var(--ink); font-family: var(--font-s); font-weight: 900; white-space: nowrap }
.absence-copy p { color: var(--ink-60); font-weight: 700; line-height: 1.45 }
.absence-meta { color: var(--brand-blue); font-family: var(--font-d); font-weight: 900; line-height: 1.35 }
.absence-seal { filter: sepia(.2); mix-blend-mode: multiply; opacity: .2; pointer-events: none; user-select: none }
.coverage-line span, .bias-line span { color: var(--ink-60); font-weight: 800 }
.coverage-line strong, .bias-line strong { color: var(--ink); font-family: var(--font-d); font-weight: 900 }
.measure-track { background: var(--paper) }
.measure-track i { background: var(--accent); content: '' }
.coverage-copy, .bias-copy { color: var(--ink-60); font-weight: 700; line-height: 1.65 }
.echo-divider { border-top: 1px dashed var(--line) }
.lucky-coframe { border: 1px solid var(--accent); background: radial-gradient(circle at 82% 10%, rgba(255,253,246,.72), transparent 36%), linear-gradient(145deg, var(--cream), var(--yellow)); box-shadow: inset 0 0 0 1px rgba(255,253,246,.58), 0 8px 18px rgba(73,59,44,.12) }
.lucky-coframe::before { border: 1px solid rgba(143,81,18,.2); content: ''; pointer-events: none }
.lucky-coframe::after { background: rgba(255,253,246,.42); content: ''; opacity: 0; animation: coframe-glint 900ms cubic-bezier(.22,1,.36,1) 250ms 1 both; pointer-events: none }
.coframe-head { border-bottom: 1px dashed rgba(90,70,51,.24) }
.coframe-title { color: var(--accent-strong); font-family: var(--font-d); font-weight: 800; letter-spacing: .15em; text-overflow: ellipsis; white-space: nowrap }
.coframe-heading small { color: var(--ink-60); font-weight: 700; line-height: 1.4 }
.coframe-count { border: 1px solid var(--yellow); background: var(--tea); box-shadow: 0 2px 5px rgba(73,59,44,.12); color: var(--cream); font-family: var(--font-d); font-weight: 900; letter-spacing: .04em; line-height: 1; white-space: nowrap }
.coframe-agents { list-style: none }
.coframe-agents > li { border: 1px solid rgba(143,81,18,.2); background: rgba(255,253,246,.68); box-shadow: inset 0 1px 0 rgba(255,253,246,.72) }
.coframe-portrait { border: 1px solid var(--accent); background: var(--paper) }
.coframe-portrait .portrait-fallback { color: var(--ink); font-family: var(--font-s); font-weight: 900 }
.coframe-agents strong { color: var(--ink); font-family: var(--font-s); font-weight: 900; letter-spacing: .03em; line-height: 1.25 }
.coframe-agents b { color: var(--accent-strong); font-family: var(--font-d); font-weight: 900; white-space: nowrap }
@keyframes coframe-glint {
  0% { opacity: 0; transform: translateX(-220%) skewX(-18deg) }
  22% { opacity: .72 }
  100% { opacity: 0; transform: translateX(520%) skewX(-18deg) }
}
@media (prefers-reduced-motion: reduce) {
  .ranking-switch button { transition: none }
  .lucky-coframe::after { animation: none }
}
</style>
<style scoped src="./acquiredPeriodReportDesktop.css"></style>
<style scoped src="./acquiredPeriodReportMobile.css"></style>
