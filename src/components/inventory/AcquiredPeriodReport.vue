<template>
  <section class="period-report" aria-labelledby="period-report-title">
    <header class="report-head">
      <span>周期获得账簿</span>
      <h2 id="period-report-title">本期总账</h2>
    </header>

    <div class="report-metrics">
      <article class="report-metric coin-metric">
        <CircleDollarSign :size="18" aria-hidden="true" />
        <span>白金币等价值</span>
        <strong>{{ itemTotalsAvailable ? formatNumber(insights.whiteCoin.equivalent) : '—' }}</strong>
        <small v-if="itemTotalsAvailable" class="coin-formula">
          派遣-洛阳 {{ formatNumber(insights.whiteCoin.luoyang) }}<template v-if="insights.whiteCoin.yuanbao"> + 鸢报 {{ formatNumber(insights.whiteCoin.yuanbao) }}</template> + 茱萸 {{ formatNumber(insights.whiteCoin.zhuyu) }} x 50
        </small>
        <small v-else>背包奖励汇总未能加载</small>
      </article>
      <article class="report-metric">
        <HeartHandshake :size="18" aria-hidden="true" />
        <span>关注心纸</span>
        <strong>{{ favoriteTotalValue }}<i v-if="hasFavoriteTotal">张</i></strong>
        <small>{{ favoriteTotalHint }}</small>
      </article>
      <article class="report-metric">
        <Clock3 :size="18" aria-hidden="true" />
        <span>派遣总时长</span>
        <strong>{{ recordsAvailable ? formatNumber(dispatchDuration.totalHours) : '—' }}<i v-if="recordsAvailable">小时</i></strong>
        <small v-if="recordsAvailable && dispatchDuration.source">按{{ dispatchDuration.source === 'item' ? '背包道具' : '密探心纸' }}派遣流水</small>
        <small v-else-if="!recordsAvailable">奖励流水明细未能加载</small>
        <small v-else>本期没有可换算的派遣流水</small>
      </article>
      <article class="report-metric">
        <Flame :size="18" aria-hidden="true" />
        <span>白金币连收</span>
        <strong>{{ recordsAvailable ? formatNumber(insights.whiteCoin.longestStreak) : '—' }}<i v-if="recordsAvailable">天</i></strong>
        <small>{{ recordsAvailable ? '最长连续获得白金币等价值' : '需要奖励流水明细' }}</small>
      </article>
    </div>

    <div class="report-body">
      <section class="lucky-days" aria-labelledby="lucky-days-title">
        <header class="subsection-heading">
          <div><Sparkles :size="16" aria-hidden="true" /><h3 id="lucky-days-title">幸运日</h3></div>
          <span v-if="sameLuckyDay" class="same-day-mark">双喜同日</span>
        </header>
        <div class="lucky-day-grid">
          <div>
            <span>白金币</span>
            <template v-if="recordsAvailable && insights.whiteCoin.bestDay">
              <time :datetime="insights.whiteCoin.bestDay.date">{{ formatDay(insights.whiteCoin.bestDay.date) }}</time>
              <small>等价 {{ formatNumber(insights.whiteCoin.bestDay.count) }}<template v-if="insights.whiteCoin.bestDay.tieCount > 1"> · {{ insights.whiteCoin.bestDay.tieCount }} 天并列</template></small>
            </template>
            <p v-else>{{ recordsAvailable ? '本期暂无收获' : '明细暂不可用' }}</p>
          </div>
          <div>
            <span>关注心纸</span>
            <template v-if="recordsAvailable && insights.agents.luckyDay">
              <time :datetime="insights.agents.luckyDay.date">{{ formatDay(insights.agents.luckyDay.date) }}</time>
              <small>{{ formatNumber(insights.agents.luckyDay.count) }}张 · {{ formatAgentCounts(insights.agents.luckyDay.agents) }}</small>
            </template>
            <p v-else>{{ favoriteLuckyEmptyText }}</p>
          </div>
        </div>
      </section>

      <section class="heart-ranking" aria-labelledby="heart-ranking-title">
        <header class="subsection-heading ranking-heading">
          <div><Heart :size="16" aria-hidden="true" /><h3 id="heart-ranking-title">心纸排行</h3></div>
          <div class="ranking-switch" aria-label="心纸排行范围">
            <button type="button" :aria-pressed="effectiveRankingMode === 'favorites'" :class="{ on: effectiveRankingMode === 'favorites' }" :disabled="!hasFavorites" @click="rankingMode = 'favorites'">特别关注</button>
            <button type="button" :aria-pressed="effectiveRankingMode === 'all'" :class="{ on: effectiveRankingMode === 'all' }" @click="rankingMode = 'all'">全部密探</button>
          </div>
        </header>

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
              <span class="podium-base" aria-hidden="true"></span>
            </li>
          </ol>
          <aside v-if="absence" class="absence-contrast">
            <span class="absence-portrait">
              <span class="portrait-fallback" aria-hidden="true">{{ monogram(absence.name) }}</span>
              <img :src="agentIcon(absence.id)" :alt="absence.name" width="48" height="48" loading="lazy" @load="onImageLoad" @error="onImageError" />
              <b aria-hidden="true">0</b>
            </span>
            <div class="absence-copy">
              <span><MessageCircleOff :size="13" aria-hidden="true" />久未回响</span>
              <div><strong>{{ absence.name }}</strong><p>{{ absence.detail }}</p></div>
            </div>
            <small class="absence-meta">{{ absence.meta }}</small>
          </aside>
        </template>
        <p v-if="favoriteError && !favoriteLoading" class="ranking-hint is-error">特别关注名单同步失败：{{ favoriteError }}</p>
        <p v-else-if="!hasFavorites && !favoriteLoading" class="ranking-hint">星标密探后，这里会默认展示特别关注排行。</p>
      </section>

      <section class="favorite-echo" aria-labelledby="favorite-echo-title">
        <header class="subsection-heading">
          <div><Users :size="16" aria-hidden="true" /><h3 id="favorite-echo-title">关注回响</h3></div>
          <span>当前关注名单</span>
        </header>
        <p v-if="favoriteLoading" class="ranking-state" role="status">正在同步特别关注名单…</p>
        <p v-else-if="favoriteError" class="ranking-state is-error">特别关注名单同步失败，暂时无法生成关注统计。</p>
        <p v-else-if="!hasFavorites" class="ranking-state">还没有特别关注密探，先在密探清单中点亮星标。</p>
        <template v-else>
          <div class="coverage-line">
            <span>关注覆盖率</span>
            <strong>{{ insights.agents.favoriteAcquiredCount }} / {{ insights.agents.favoriteCount }}</strong>
          </div>
          <div class="measure-track" aria-hidden="true"><i :style="{ '--measure-scale': insights.agents.coverageRatio || 0 }"></i></div>
          <small class="coverage-copy">本期获得过 {{ insights.agents.favoriteAcquiredCount }} 位关注密探的心纸</small>

          <div class="echo-divider"></div>

          <div class="bias-line">
            <span>偏爱指数</span>
            <strong>{{ insights.agents.favoriteTotal ? insights.agents.bias.percent + '%' : '—' }}</strong>
          </div>
          <p class="bias-copy">
            <template v-if="!insights.agents.favoriteTotal">本期尚无关注心纸收获</template>
            <template v-else-if="!insights.agents.bias.sampleSufficient">样本较少，累计 10 张后再判断倾向</template>
            <template v-else>{{ insights.agents.bias.label }} · {{ insights.agents.bias.leader.name }}占本期关注心纸的 {{ insights.agents.bias.percent }}%</template>
          </p>

          <aside v-if="luckyCoframe" class="lucky-coframe">
            <div class="coframe-portraits" aria-hidden="true">
              <span v-for="agent in luckyCoframe.agents.slice(0, 3)" :key="agent.id">
                <span class="portrait-fallback">{{ monogram(agent.name) }}</span>
                <img :src="agentIcon(agent.id)" alt="" width="42" height="42" loading="lazy" @load="onImageLoad" @error="onImageError" />
              </span>
            </div>
            <div class="coframe-copy">
              <span class="coframe-title"><Sparkles :size="13" aria-hidden="true" />幸运同框</span>
              <strong>{{ luckyCoframe.agents.map(function (agent) { return agent.name }).join(' · ') }}</strong>
              <small>{{ formatDay(luckyCoframe.date) }} · {{ luckyCoframe.channel }} · 共 {{ formatNumber(luckyCoframe.count) }} 张</small>
            </div>
            <span class="coframe-seal" aria-hidden="true"><Sparkles :size="13" />同框</span>
          </aside>
        </template>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { CircleDollarSign, Clock3, Flame, Heart, HeartHandshake, MessageCircleOff, Sparkles, Users } from '@lucide/vue'

const props = defineProps({
  insights: { type: Object, required: true },
  dispatchDuration: { type: Object, required: true },
  itemTotalsAvailable: { type: Boolean, default: true },
  agentTotalsAvailable: { type: Boolean, default: true },
  recordsAvailable: { type: Boolean, default: true },
  favoriteLoading: { type: Boolean, default: false },
  favoriteError: { type: String, default: '' }
})

const rankingMode = ref('favorites')
const hasFavorites = computed(function () { return props.insights.agents.favoriteCount > 0 })
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
  return '按当前特别关注名单'
})
const effectiveRankingMode = computed(function () {
  return rankingMode.value === 'favorites' && hasFavorites.value ? 'favorites' : 'all'
})
const ranking = computed(function () {
  return effectiveRankingMode.value === 'favorites' ? props.insights.agents.favoriteRanking : props.insights.agents.ranking
})
const podium = computed(function () {
  return ranking.value.slice(0, 3).map(function (agent, index) {
    return Object.assign({}, agent, { place: index + 1 })
  })
})
const sameLuckyDay = computed(function () {
  const coin = props.insights.whiteCoin.bestDay
  const favorite = props.insights.agents.luckyDay
  return !!(coin && favorite && coin.date === favorite.date)
})
const absence = computed(function () {
  const agents = props.insights.agents
  if (!hasFavorites.value || props.favoriteError) return null
  if (agents.missingFavorites.length) {
    const first = agents.missingFavorites[0]
    const remaining = agents.missingFavorites.length - 1
    return {
      id: first.id,
      name: first.name,
      detail: '本期尚未获得心纸',
      meta: remaining ? '另有 ' + remaining + ' 位未回响' : '本期 0 张'
    }
  }
  if (agents.stalestFavorite) {
    const days = agents.stalestFavorite.daysSinceLast
    if (!days) return null
    return {
      id: agents.stalestFavorite.id,
      name: agents.stalestFavorite.name,
      detail: formatDay(agents.stalestFavorite.lastDay) + ' 后未再获得',
      meta: days + ' 天未见'
    }
  }
  return null
})
const luckyCoframe = computed(function () { return props.insights.agents.luckyCoframes[0] || null })
const rankingEmptyText = computed(function () {
  return effectiveRankingMode.value === 'favorites' ? '本期还没有获得特别关注密探的心纸' : '本期还没有心纸收获'
})
const favoriteLuckyEmptyText = computed(function () {
  if (!props.recordsAvailable) return '明细暂不可用'
  if (!hasFavorites.value) return '特别关注后统计'
  return '本期暂无收获'
})

function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('zh-CN')
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
.period-report { margin-top: 16px; overflow: hidden; border: 1px solid var(--line); border-radius: 8px; background: var(--surface) }
.report-head { padding: 16px 20px 13px; border-bottom: 1px solid var(--line) }
.report-head > span, .subsection-heading > div > svg { color: var(--accent-strong) }
.report-head > span { display: block; font-size: 10px; font-weight: 900 }
.report-head h2 { margin-top: 2px; color: var(--ink); font-family: var(--font-s); font-size: 20px; font-weight: 900; letter-spacing: 0 }
.report-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-bottom: 1px solid var(--line) }
.report-metric { position: relative; min-width: 0; min-height: 128px; padding: 18px 17px 16px }
.report-metric + .report-metric { border-left: 1px solid var(--line) }
.report-metric > svg { position: absolute; top: 17px; right: 17px; color: var(--ink-35) }
.report-metric > span { display: block; padding-right: 24px; color: var(--ink-60); font-size: 11px; font-weight: 800 }
.report-metric > strong { display: block; margin-top: 10px; color: var(--ink); font-family: var(--font-d); font-size: 28px; font-weight: 900; letter-spacing: 0; line-height: 1 }
.report-metric > strong i { margin-left: 5px; color: var(--accent-strong); font-family: var(--font-b); font-size: 10px; font-style: normal; font-weight: 800 }
.report-metric > small { display: block; margin-top: 9px; color: var(--ink-35); font-size: 10px; font-weight: 700; line-height: 1.55 }
.coin-formula { overflow-wrap: anywhere }
.coin-metric { background: var(--cream) }
.coin-metric > strong { color: var(--accent-strong); font-size: 34px }
.coin-metric > svg { color: var(--accent-strong) }
.report-body { display: grid; grid-template-columns: minmax(250px, .9fr) minmax(370px, 1.35fr) minmax(270px, 1fr) }
.report-body > section { min-width: 0; padding: 17px 18px 19px }
.report-body > section + section { border-left: 1px solid var(--line) }
.favorite-echo { background: var(--cream) }
.subsection-heading { display: flex; min-height: 36px; align-items: center; justify-content: space-between; gap: 10px }
.subsection-heading > div { display: flex; align-items: center; gap: 7px }
.subsection-heading h3 { margin: 0; color: var(--ink); font-family: var(--font-s); font-size: 15px; font-weight: 900; letter-spacing: 0 }
.subsection-heading > span { color: var(--ink-35); font-size: 9.5px; font-weight: 700 }
.same-day-mark { padding: 3px 7px; border: 1px solid var(--accent); border-radius: 999px; color: var(--accent-strong) !important; white-space: nowrap }
.lucky-day-grid { display: grid; grid-template-columns: minmax(0, 1fr); margin-top: 8px; border-top: 1px dashed var(--line) }
.lucky-day-grid > div { min-width: 0; min-height: 108px; padding: 14px 4px 10px 0 }
.lucky-day-grid > div + div { padding-top: 13px; border-top: 1px solid var(--line) }
.lucky-day-grid span { display: block; color: var(--ink-60); font-size: 9.5px; font-weight: 800 }
.lucky-day-grid time { display: block; margin-top: 7px; color: var(--ink); font-family: var(--font-s); font-size: 18px; font-weight: 900; white-space: nowrap }
.lucky-day-grid small, .lucky-day-grid p { display: block; margin-top: 5px; color: var(--ink-60); font-size: 9.5px; font-weight: 700; line-height: 1.55 }
.lucky-day-grid p { margin-top: 11px; color: var(--ink-35) }
.ranking-heading { align-items: flex-start }
.ranking-switch { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper) }
.ranking-switch button { min-height: 32px; padding: 5px 9px; border: 0; border-radius: 5px; background: transparent; color: var(--ink-60); font-family: var(--font-b); font-size: 10px; font-weight: 800; cursor: pointer; white-space: nowrap }
.ranking-switch button.on { background: var(--tea); color: var(--cream) }
.ranking-switch button:disabled { opacity: .42; cursor: not-allowed }
.ranking-switch button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }
.ranking-state { display: grid; min-height: 220px; place-items: center; color: var(--ink-35); font-size: 11px; font-weight: 700; text-align: center }
.ranking-hint { margin-top: 12px; color: var(--ink-35); font-size: 10px; font-weight: 700; text-align: center }
.ranking-hint.is-error, .ranking-state.is-error { color: var(--rouge) }
.podium { display: grid; min-height: 252px; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 9px; padding-top: 10px; list-style: none }
.podium li { display: flex; min-width: 0; flex-direction: column; align-items: center }
.podium .place-1 { grid-column: 2; grid-row: 1 }
.podium .place-2 { grid-column: 1; grid-row: 1 }
.podium .place-3 { grid-column: 3; grid-row: 1 }
.portrait { position: relative; display: grid; width: 58px; aspect-ratio: 1; place-items: center; overflow: visible; border: 1px solid var(--line); border-radius: 50%; background: var(--paper) }
.place-1 .portrait { width: 64px; border: 2px solid var(--accent) }
.portrait img, .portrait-fallback { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit }
.portrait img { object-fit: cover }
.portrait-fallback { display: none; place-items: center; color: var(--ink-35); font-family: var(--font-s); font-size: 22px; font-weight: 900 }
.portrait.has-image-error .portrait-fallback { display: grid }
.portrait-count { position: absolute; right: -9px; bottom: -4px; z-index: 2; min-width: 30px; padding: 3px 5px; border: 2px solid var(--surface); border-radius: 999px; background: var(--tea); color: var(--cream); font-family: var(--font-d); font-size: 10px; font-weight: 900; line-height: 1; text-align: center }
.place-1 .portrait-count { background: var(--accent); color: var(--cream) }
.podium li > strong { width: 100%; margin-top: 9px; overflow: hidden; color: var(--ink); font-size: 11px; font-weight: 900; text-align: center; text-overflow: ellipsis; white-space: nowrap }
.podium-base { display: flex; width: 100%; height: 48px; margin-top: 8px; align-items: flex-start; justify-content: center; gap: 2px; padding-top: 10px; border: 1px solid var(--line); border-bottom: 0; border-radius: 6px 6px 0 0; background: var(--cream); box-shadow: inset 0 4px 0 rgba(215,137,53,.12) }
.place-1 .podium-base { height: 94px; border: 2px solid var(--accent); border-bottom: 0; background: var(--yellow); box-shadow: inset 0 5px 0 rgba(255,253,246,.35) }
.place-2 .podium-base { height: 70px; background: var(--paper) }
.podium-base b { color: var(--tea); font-family: var(--font-d); font-size: 17px; font-weight: 900; line-height: 1 }
.podium-base small { color: var(--ink-60); font-size: 9px; font-weight: 800; line-height: 1.4 }
.absence-contrast { position: relative; display: grid; min-height: 76px; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 11px; margin-top: 10px; padding: 11px 12px; border: 1px solid var(--brand-blue); border-radius: 8px; background: var(--surface) }
.absence-contrast::before { position: absolute; top: 7px; right: 7px; bottom: 7px; left: 7px; border: 1px dashed rgba(91,106,140,.28); border-radius: 5px; content: ''; pointer-events: none }
.absence-portrait { position: relative; display: grid; width: 48px; height: 48px; z-index: 1; place-items: center; border: 1px solid var(--brand-blue); border-radius: 50%; background: var(--paper) }
.absence-portrait img, .absence-portrait .portrait-fallback { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit }
.absence-portrait img { filter: grayscale(.72); object-fit: cover; opacity: .72 }
.absence-portrait.has-image-error .portrait-fallback { display: grid }
.absence-portrait b { position: absolute; right: -4px; bottom: -3px; z-index: 2; display: grid; width: 20px; height: 20px; place-items: center; border: 2px solid var(--surface); border-radius: 50%; background: var(--brand-blue); color: var(--cream); font-family: var(--font-d); font-size: 9px }
.absence-copy { min-width: 0; z-index: 1 }
.absence-copy > span { display: flex; align-items: center; gap: 4px; color: var(--brand-blue); font-size: 9px; font-weight: 900 }
.absence-copy > div { display: flex; min-width: 0; align-items: baseline; gap: 8px; margin-top: 3px }
.absence-copy strong { flex: 0 0 auto; color: var(--ink); font-family: var(--font-s); font-size: 13px; font-weight: 900; white-space: nowrap }
.absence-copy p { min-width: 0; color: var(--ink-60); font-size: 10.5px; font-weight: 700; line-height: 1.45 }
.absence-meta { z-index: 1; max-width: 76px; color: var(--brand-blue); font-family: var(--font-d); font-size: 9px; font-weight: 900; line-height: 1.35; text-align: right }
.coverage-line, .bias-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px }
.coverage-line { margin-top: 20px }
.coverage-line span, .bias-line span { color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.coverage-line strong, .bias-line strong { color: var(--ink); font-family: var(--font-d); font-size: 19px; font-weight: 900 }
.measure-track { height: 7px; margin-top: 8px; overflow: hidden; border-radius: 999px; background: var(--paper) }
.measure-track i { display: block; width: 100%; height: 100%; border-radius: inherit; background: var(--accent); content: ''; transform: scaleX(var(--measure-scale, 0)); transform-origin: left }
.coverage-copy, .bias-copy { display: block; margin-top: 7px; color: var(--ink-60); font-size: 10px; font-weight: 700; line-height: 1.65 }
.echo-divider { margin: 17px 0; border-top: 1px dashed var(--line) }
.bias-copy { min-height: 3.3em }
.lucky-coframe { position: relative; display: grid; min-height: 96px; grid-template-columns: auto minmax(0, 1fr) 46px; align-items: center; gap: 12px; margin-top: 17px; padding: 13px 11px; overflow: hidden; border: 1px solid var(--accent); border-left-width: 5px; border-radius: 8px; background: var(--yellow) }
.lucky-coframe::after { position: absolute; top: -45%; left: -15%; width: 28%; height: 190%; background: rgba(255,253,246,.48); content: ''; opacity: 0; transform: translateX(-220%) skewX(-18deg); animation: coframe-glint 900ms cubic-bezier(.22,1,.36,1) 250ms 1 both; pointer-events: none }
.coframe-portraits { display: flex; z-index: 1; align-items: center; padding-left: 5px }
.coframe-portraits > span { position: relative; display: grid; width: 40px; height: 40px; place-items: center; overflow: hidden; border: 2px solid var(--yellow); border-radius: 50%; background: var(--paper); box-shadow: 0 0 0 1px var(--accent), 0 3px 8px rgba(73,59,44,.16) }
.coframe-portraits > span + span { margin-left: -10px }
.coframe-portraits img, .coframe-portraits .portrait-fallback { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit }
.coframe-portraits img { object-fit: cover }
.coframe-portraits .portrait-fallback { display: none; place-items: center; font-family: var(--font-s); font-size: 14px; font-weight: 900 }
.coframe-portraits > span.has-image-error .portrait-fallback { display: grid }
.coframe-copy { min-width: 0; z-index: 1 }
.coframe-copy > .coframe-title { display: flex; align-items: center; gap: 4px; color: var(--accent-strong); font-size: 11px; font-weight: 900 }
.coframe-copy strong { display: block; margin-top: 3px; overflow: hidden; color: var(--ink); font-family: var(--font-s); font-size: 13px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap }
.coframe-copy small { display: block; margin-top: 4px; color: var(--ink-60); font-size: 9.5px; font-weight: 700; line-height: 1.45 }
.coframe-seal { display: grid; width: 46px; height: 46px; z-index: 1; place-items: center; border: 2px solid var(--accent); border-radius: 50%; background: var(--tea); box-shadow: inset 0 0 0 1px var(--yellow); color: var(--cream); font-family: var(--font-s); font-size: 9px; font-weight: 900; line-height: 1 }
.coframe-seal svg { margin-bottom: -7px }
@keyframes coframe-glint {
  0% { opacity: 0; transform: translateX(-220%) skewX(-18deg) }
  22% { opacity: .72 }
  100% { opacity: 0; transform: translateX(520%) skewX(-18deg) }
}
@media (max-width: 980px) {
  .report-body { grid-template-columns: minmax(200px, .65fr) minmax(330px, 1.15fr) }
  .favorite-echo { grid-column: 1 / -1; border-top: 1px solid var(--line); border-left: 0 !important }
}
@media (max-width: 760px) {
  .report-head { padding: 14px 14px 11px }
  .report-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .report-metric { min-height: 116px; padding: 15px 13px }
  .report-metric:nth-child(3) { border-top: 1px solid var(--line); border-left: 0 }
  .report-metric:nth-child(4) { border-top: 1px solid var(--line) }
  .report-metric > svg { top: 14px; right: 13px }
  .report-metric > strong, .coin-metric > strong { font-size: 24px }
  .report-body { grid-template-columns: minmax(0, 1fr) }
  .report-body > section { padding: 14px }
  .report-body > section + section { border-top: 1px solid var(--line); border-left: 0 }
  .lucky-day-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .lucky-day-grid > div { min-height: 96px; padding-right: 6px }
  .lucky-day-grid > div + div { padding-top: 14px; padding-left: 10px; border-top: 0; border-left: 1px solid var(--line) }
  .lucky-day-grid time { font-size: 17px }
  .ranking-switch button { min-height: 44px; padding-inline: 8px }
  .podium { min-height: 248px; gap: 7px }
  .portrait { width: 52px }
  .place-1 .portrait { width: 62px }
}
@media (max-width: 360px) {
  .ranking-heading { align-items: stretch; flex-direction: column }
  .ranking-switch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) }
}
@media (prefers-reduced-motion: reduce) {
  .ranking-switch button { transition: none }
  .lucky-coframe::after { animation: none }
}
</style>
