<template>
  <section class="period-report" aria-labelledby="period-report-title">
    <header class="report-head">
      <span>周期获得账簿</span>
      <h2 id="period-report-title">本期总账</h2>
    </header>

    <div class="report-metrics">
      <article class="report-metric coin-metric">
        <CircleDollarSign :size="18" aria-hidden="true" />
        <span>白金币总价值</span>
        <strong>{{ itemTotalsAvailable ? formatNumber(insights.whiteCoin.equivalent) : '—' }}</strong>
        <small v-if="itemTotalsAvailable" class="coin-formula">
          洛阳派遣 {{ formatNumber(insights.whiteCoin.luoyang) }}<template v-if="insights.whiteCoin.yuanbao"> + 鸢报 {{ formatNumber(insights.whiteCoin.yuanbao) }}</template> + 茱萸 {{ formatNumber(insights.whiteCoin.zhuyu) }} x 50
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

          <aside v-if="luckyCoframe" class="lucky-coframe" :class="{ 'has-overflow': coframeRemainingCount }">
            <span class="coframe-sparkles" aria-hidden="true">✦ · ✧</span>
            <div class="coframe-portraits" aria-hidden="true">
              <span v-for="agent in luckyCoframe.agents.slice(0, 3)" :key="agent.id">
                <span class="portrait-fallback">{{ monogram(agent.name) }}</span>
                <img :src="agentIcon(agent.id)" alt="" width="42" height="42" loading="lazy" @load="onImageLoad" @error="onImageError" />
              </span>
              <span v-if="coframeRemainingCount" class="portrait-overflow">+{{ coframeRemainingCount }}</span>
            </div>
            <div class="coframe-copy">
              <span class="coframe-title">✦ LUCKY BURST</span>
              <strong>{{ luckyCoframe.agents.map(function (agent) { return agent.name }).join(' · ') }}</strong>
              <small class="coframe-meta">
                <span>{{ formatDay(luckyCoframe.date) }} · {{ luckyCoframe.channel }}</span>
                <span :title="coframeCountDetail">{{ coframeCountDetail }}</span>
              </small>
            </div>
            <span class="coframe-seal" role="img" :aria-label="'同时获得 ' + coframeTypeCount + ' 种不同道具'">
              <span class="coframe-constellation" :class="'stars-' + coframeVisibleStarCount" aria-hidden="true">
                <i v-for="index in coframeVisibleStarCount" :key="index">✦</i>
                <small v-if="coframeTypeCount > 6">{{ coframeTypeCount }}</small>
              </span>
              <span class="coframe-ribbon" aria-hidden="true">LUCKY</span>
            </span>
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
  itemTotalsAvailable: { type: Boolean, default: true },
  agentTotalsAvailable: { type: Boolean, default: true },
  recordsAvailable: { type: Boolean, default: true },
  favoriteLoading: { type: Boolean, default: false },
  favoriteError: { type: String, default: '' }
})

const rankingMode = ref('favorites')
const absenceSeal = import.meta.env.BASE_URL + 'longtimenosee.png'
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
  const names = (props.insights.agents.favorites || []).map(function (agent) { return agent.name }).join('')
  return '啊啊...' + names + '碎片来 𓀎 𓀏 𓀐 𓀑 𓀒𓀓 𓀔 𓀕'
})
const averageWhiteCoinPerHour = computed(function () {
  if (!props.recordsAvailable || !props.itemTotalsAvailable) return null
  const hours = Number(props.dispatchDuration.luoyangHours) || 0
  if (!hours) return null
  const whiteCoinEquivalent = (Number(props.insights.whiteCoin.luoyang) || 0) + (Number(props.insights.whiteCoin.zhuyu) || 0) * 50
  return whiteCoinEquivalent / hours
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
const coframeVisibleStarCount = computed(function () { return Math.min(coframeTypeCount.value, 6) })
const coframeRemainingCount = computed(function () { return Math.max(0, coframeTypeCount.value - 3) })
const coframeCountDetail = computed(function () {
  return luckyCoframe.value ? luckyCoframe.value.agents.map(function (agent) { return agent.name + ' × ' + formatNumber(agent.count) }).join(' · ') : ''
})
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
.coin-average { color: var(--ink-60) !important }
.coin-average b { color: var(--accent-strong); font-family: var(--font-d); font-size: 11px; font-weight: 900 }
.dispatch-duration-split { overflow-wrap: anywhere }
.dispatch-duration-split span { display: block }
.dispatch-duration-split span + span { margin-top: 2px }
.coin-metric { background: var(--cream) }
.coin-metric > strong { color: var(--accent-strong); font-size: 34px }
.coin-metric > svg { color: var(--accent-strong) }
.report-body { display: grid; grid-template-columns: 25% minmax(0, 1.35fr) minmax(0, 1fr) }
.report-body > section { min-width: 0; padding: 17px 18px 19px }
.report-body > section + section { border-left: 1px solid var(--line) }
.lucky-days { display: flex; min-height: 0; flex-direction: column }
.favorite-echo { background: var(--cream) }
.subsection-heading { display: flex; min-height: 36px; align-items: center; justify-content: space-between; gap: 10px }
.subsection-heading > div { display: flex; align-items: center; gap: 7px }
.subsection-heading h3 { margin: 0; color: var(--ink); font-family: var(--font-s); font-size: 15px; font-weight: 900; letter-spacing: 0 }
.subsection-heading > span { color: var(--ink-35); font-size: 9.5px; font-weight: 700 }
.same-day-mark { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid var(--accent); border-radius: 999px; background: var(--yellow); color: var(--ink) !important; white-space: nowrap }
.same-day-convergence { position: relative; flex: 1 1 auto; margin-top: 8px; padding: 30px 0 4px 22px; border-top: 1px dashed var(--line) }
.same-day-convergence::before { position: absolute; top: 0; bottom: 0; left: 8px; width: 1px; background: var(--accent); content: '' }
.same-day-convergence::after { position: absolute; top: 32px; left: 0; box-sizing: border-box; width: 17px; height: 17px; border: 3px solid var(--surface); border-radius: 50%; background: var(--yellow); box-shadow: 0 0 0 1px var(--accent); content: '' }
.same-day-date-line { display: flex; min-width: 0; align-items: flex-start; gap: 8px }
.same-day-date-line > .same-day-mark { flex: 0 0 auto; margin-top: 5px; font-size: 9.5px; font-weight: 900 }
.same-day-date time { display: block; min-width: 0; color: var(--ink); font-family: var(--font-s); font-size: 20px; font-weight: 900; white-space: nowrap }
.same-day-date > small { display: block; margin-top: 5px; color: var(--ink-60); font-size: 9.5px; font-weight: 700 }
.same-day-rewards { margin-top: 15px; padding: 0; list-style: none }
.same-day-rewards > li { display: grid; min-width: 0; grid-template-columns: 28px minmax(0, 1fr); align-items: start; gap: 8px; padding: 10px 4px 10px 0; border-top: 1px solid var(--line) }
.same-day-rewards > li:last-child { border-bottom: 1px solid var(--line) }
.same-day-reward-icon { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid var(--accent); border-radius: 50%; background: var(--cream); color: var(--accent-strong) }
.same-day-rewards > li > div { min-width: 0 }
.same-day-rewards > li > div > span { display: block; color: var(--ink); font-size: 10px; font-weight: 900 }
.same-day-rewards > li > div > small { display: block; margin-top: 4px; overflow-wrap: anywhere; color: var(--ink-60); font-size: 9.5px; font-weight: 700; line-height: 1.55 }
.lucky-day-timeline { position: relative; flex: 1 1 auto; margin-top: 8px; padding: 22px 0 2px 22px; border-top: 1px dashed var(--line); list-style: none }
.lucky-day-timeline::before { position: absolute; top: 0; bottom: 0; left: 8px; width: 1px; background: var(--line); content: '' }
.lucky-day-timeline > li { position: relative; min-width: 0; min-height: 104px; padding: 7px 4px 18px 4px }
.lucky-day-timeline > li::before { position: absolute; top: 11px; left: -22px; box-sizing: border-box; width: 17px; height: 17px; border: 3px solid var(--surface); border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 1px var(--accent); content: '' }
.lucky-day-timeline > li:last-child { min-height: 88px; padding-bottom: 6px }
.lucky-day-timeline > li.is-empty::before { background: var(--surface); box-shadow: 0 0 0 1px var(--line) }
.lucky-day-timeline span { display: block; color: var(--ink-60); font-size: 9.5px; font-weight: 800 }
.lucky-day-timeline time { display: block; margin-top: 7px; color: var(--ink); font-family: var(--font-s); font-size: 18px; font-weight: 900; white-space: nowrap }
.lucky-day-timeline small, .lucky-day-timeline p { display: block; margin-top: 5px; color: var(--ink-60); font-size: 9.5px; font-weight: 700; line-height: 1.55 }
.lucky-day-timeline p { margin-top: 11px; color: var(--ink-35) }
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
.podium-medal { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif; font-size: 18px; line-height: 1 }
.place-1 .podium-medal { width: 36px; height: 36px; flex-basis: 36px; font-size: 20px }
.podium-base small { color: var(--ink-60); font-size: 9px; font-weight: 800; line-height: 1.4 }
.absence-contrast { position: relative; display: grid; min-height: 82px; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 11px; margin-top: 10px; padding: 13px 82px 13px 13px; overflow: hidden; border: 1px solid var(--brand-blue); border-radius: 8px; background: var(--surface) }
.absence-contrast::before { position: absolute; top: 7px; right: 7px; bottom: 7px; left: 7px; border: 1px dashed rgba(91,106,140,.28); border-radius: 5px; content: ''; pointer-events: none }
.absence-contrast.is-undetermined { display: flex; min-height: 76px }
.absence-portrait { position: relative; display: grid; width: 48px; height: 48px; z-index: 1; place-items: center; border: 1px solid var(--brand-blue); border-radius: 50%; background: var(--paper) }
.absence-portrait img, .absence-portrait .portrait-fallback { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit }
.absence-portrait img { filter: grayscale(.72); object-fit: cover; opacity: .72 }
.absence-portrait.has-image-error .portrait-fallback { display: grid }
.absence-copy { min-width: 0; z-index: 1 }
.absence-copy > span { display: block; color: var(--brand-blue); font-size: 9px; font-weight: 900 }
.absence-copy > div { display: flex; min-width: 0; align-items: baseline; gap: 8px; margin-top: 3px }
.absence-copy strong { display: block; flex: 0 0 auto; margin-top: 4px; color: var(--ink); font-family: var(--font-s); font-size: 13px; font-weight: 900; white-space: nowrap }
.absence-copy > div strong { margin-top: 0 }
.absence-copy p { min-width: 0; color: var(--ink-60); font-size: 10.5px; font-weight: 700; line-height: 1.45 }
.absence-meta { z-index: 1; max-width: 76px; color: var(--brand-blue); font-family: var(--font-d); font-size: 9px; font-weight: 900; line-height: 1.35; text-align: right }
.absence-seal { position: absolute; top: 50%; right: -13px; width: 96px; height: auto; z-index: 0; filter: sepia(.2); mix-blend-mode: multiply; object-fit: contain; opacity: .2; transform: translateY(-50%) rotate(-7deg); pointer-events: none; user-select: none }
.coverage-line, .bias-line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px }
.coverage-line { margin-top: 20px }
.coverage-line span, .bias-line span { color: var(--ink-60); font-size: 10.5px; font-weight: 800 }
.coverage-line strong, .bias-line strong { color: var(--ink); font-family: var(--font-d); font-size: 19px; font-weight: 900 }
.measure-track { height: 7px; margin-top: 8px; overflow: hidden; border-radius: 999px; background: var(--paper) }
.measure-track i { display: block; width: 100%; height: 100%; border-radius: inherit; background: var(--accent); content: ''; transform: scaleX(var(--measure-scale, 0)); transform-origin: left }
.coverage-copy, .bias-copy { display: block; margin-top: 7px; color: var(--ink-60); font-size: 10px; font-weight: 700; line-height: 1.65 }
.echo-divider { margin: 17px 0; border-top: 1px dashed var(--line) }
.bias-copy { min-height: 3.3em }
.lucky-coframe { position: relative; display: grid; min-height: 126px; grid-template-columns: minmax(68px, .28fr) minmax(0, 1fr) 58px; align-items: center; gap: 10px; margin-top: 17px; padding: 29px 13px 15px; overflow: hidden; border: 1px solid var(--accent); border-radius: 18px; background: radial-gradient(circle at 82% 10%, rgba(255,253,246,.72), transparent 36%), linear-gradient(145deg, var(--cream), var(--yellow)); box-shadow: inset 0 0 0 1px rgba(255,253,246,.58), 0 8px 18px rgba(73,59,44,.12) }
.lucky-coframe::before { position: absolute; inset: 5px; border: 1px solid rgba(143,81,18,.2); border-radius: 13px; content: ''; pointer-events: none }
.lucky-coframe::after { position: absolute; top: -45%; left: -15%; width: 24%; height: 190%; background: rgba(255,253,246,.42); content: ''; opacity: 0; transform: translateX(-220%) skewX(-18deg); animation: coframe-glint 900ms cubic-bezier(.22,1,.36,1) 250ms 1 both; pointer-events: none }
.coframe-sparkles { position: absolute; top: 11px; left: 15px; z-index: 2; color: var(--accent-strong); font-family: var(--font-s); font-size: 10px; font-weight: 900; opacity: .58 }
.coframe-portraits { display: flex; z-index: 1; align-items: center; justify-content: center; padding-left: 2px }
.coframe-portraits > span { position: relative; display: grid; width: 42px; height: 42px; flex: 0 0 42px; place-items: center; overflow: hidden; border: 2px solid var(--yellow); border-radius: 50%; background: var(--paper); box-shadow: 0 0 0 1px var(--accent), 0 3px 8px rgba(73,59,44,.16) }
.coframe-portraits > span + span { margin-left: -12px }
.lucky-coframe.has-overflow { grid-template-columns: minmax(100px, .31fr) minmax(0, 1fr) 58px }
.lucky-coframe.has-overflow .coframe-portraits > span { width: 38px; height: 38px; flex-basis: 38px }
.lucky-coframe.has-overflow .coframe-portraits > span + span { margin-left: -16px }
.coframe-portraits img, .coframe-portraits .portrait-fallback { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: inherit }
.coframe-portraits img { object-fit: cover }
.coframe-portraits .portrait-fallback { display: none; place-items: center; color: var(--ink); font-family: var(--font-s); font-size: 14px; font-weight: 900 }
.coframe-portraits > span.has-image-error .portrait-fallback { display: grid }
.coframe-portraits > .portrait-overflow, .lucky-coframe.has-overflow .coframe-portraits > .portrait-overflow { width: 28px; height: 28px; z-index: 4; flex-basis: 28px; overflow: visible; border-color: var(--cream); background: var(--tea); box-shadow: 0 0 0 1px var(--accent), 0 3px 8px rgba(73,59,44,.16); color: var(--cream); font-family: var(--font-d); font-size: 9px; font-style: normal; font-weight: 900 }
.coframe-copy { min-width: 0; z-index: 1 }
.coframe-copy > .coframe-title { display: block; overflow: hidden; color: var(--accent-strong); font-family: var(--font-d); font-size: 9.5px; font-weight: 800; letter-spacing: .15em; text-overflow: ellipsis; white-space: nowrap }
.coframe-copy strong { display: -webkit-box; margin-top: 6px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--ink); font-family: var(--font-s); font-size: 15px; font-weight: 900; letter-spacing: .04em; line-height: 1.35 }
.coframe-copy small { display: block; margin-top: 6px; color: var(--ink-60); font-size: 9.5px; font-weight: 700; line-height: 1.45 }
.coframe-meta > span { display: block; min-width: 0 }
.coframe-meta > span + span { margin-top: 2px; overflow: hidden; color: var(--ink); text-overflow: ellipsis; white-space: nowrap }
.coframe-seal { position: relative; display: grid; width: 58px; height: 58px; z-index: 1; align-self: start; place-items: center; filter: drop-shadow(0 3px 3px rgba(73,59,44,.18)) }
.coframe-seal::before { position: absolute; inset: 0; z-index: 1; border: 3px solid #9a652b; border-radius: 50%; background: var(--tea); box-shadow: inset 0 0 0 2px var(--yellow), inset 0 0 0 5px var(--tea), inset 0 0 0 6px rgba(239,210,142,.58); content: '' }
.coframe-ribbon { position: absolute; right: 7px; bottom: -8px; left: 7px; height: 17px; z-index: 0; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; background: #9a652b; clip-path: polygon(0 0, 100% 0, 86% 58%, 100% 100%, 0 100%, 14% 58%); color: var(--cream); font-family: var(--font-d); font-size: 6px; font-weight: 900; letter-spacing: .08em; line-height: 1 }
.coframe-constellation { position: relative; width: 42px; height: 42px; z-index: 2; color: var(--cream) }
.coframe-constellation i { position: absolute; font-family: var(--font-s); font-size: 10px; font-style: normal; line-height: 1; transform: translate(-50%, -50%); text-shadow: 0 1px 2px rgba(73,59,44,.3) }
.coframe-constellation i:first-child { font-size: 13px }
.coframe-constellation.stars-2 i:nth-child(1) { top: 36%; left: 38% }
.coframe-constellation.stars-2 i:nth-child(2) { top: 65%; left: 67%; font-size: 9px }
.coframe-constellation.stars-3 i:nth-child(1) { top: 28%; left: 50% }
.coframe-constellation.stars-3 i:nth-child(2) { top: 66%; left: 31% }
.coframe-constellation.stars-3 i:nth-child(3) { top: 66%; left: 69% }
.coframe-constellation.stars-4 i:nth-child(1) { top: 18%; left: 50% }
.coframe-constellation.stars-4 i:nth-child(2) { top: 50%; left: 25% }
.coframe-constellation.stars-4 i:nth-child(3) { top: 50%; left: 75% }
.coframe-constellation.stars-4 i:nth-child(4) { top: 82%; left: 50% }
.coframe-constellation.stars-5 i:nth-child(1) { top: 16%; left: 50% }
.coframe-constellation.stars-5 i:nth-child(2) { top: 50%; left: 22% }
.coframe-constellation.stars-5 i:nth-child(3) { top: 50%; left: 50% }
.coframe-constellation.stars-5 i:nth-child(4) { top: 50%; left: 78% }
.coframe-constellation.stars-5 i:nth-child(5) { top: 84%; left: 50% }
.coframe-constellation.stars-6 i:nth-child(1) { top: 15%; left: 50% }
.coframe-constellation.stars-6 i:nth-child(2) { top: 36%; left: 24% }
.coframe-constellation.stars-6 i:nth-child(3) { top: 36%; left: 76% }
.coframe-constellation.stars-6 i:nth-child(4) { top: 70%; left: 24% }
.coframe-constellation.stars-6 i:nth-child(5) { top: 70%; left: 76% }
.coframe-constellation.stars-6 i:nth-child(6) { top: 88%; left: 50% }
.coframe-constellation small { position: absolute; right: -1px; bottom: -1px; display: grid; min-width: 16px; height: 16px; place-items: center; border: 1px solid var(--yellow); border-radius: 50%; background: var(--tea); color: var(--cream); font-family: var(--font-d); font-size: 7px; font-weight: 900; line-height: 1 }
@keyframes coframe-glint {
  0% { opacity: 0; transform: translateX(-220%) skewX(-18deg) }
  22% { opacity: .72 }
  100% { opacity: 0; transform: translateX(520%) skewX(-18deg) }
}
@media (max-width: 980px) {
  .report-body { grid-template-columns: 25% minmax(0, 1fr) }
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
  .lucky-day-timeline > li { min-height: 96px }
  .lucky-day-timeline time { font-size: 17px }
  .ranking-switch button { min-height: 44px; padding-inline: 8px }
  .podium { min-height: 248px; gap: 7px }
  .portrait { width: 52px }
  .place-1 .portrait { width: 62px }
  .lucky-coframe { grid-template-columns: minmax(72px, .28fr) minmax(0, 1fr) 58px }
}
@media (max-width: 440px) {
  .absence-contrast:not(.is-undetermined) { grid-template-columns: 48px minmax(0, 1fr) }
  .absence-meta { display: none }
  .lucky-coframe { min-height: 124px; grid-template-columns: 66px minmax(0, 1fr) 52px; gap: 8px; padding-inline: 10px }
  .lucky-coframe.has-overflow { grid-template-columns: 94px minmax(0, 1fr) 52px }
  .coframe-portraits > span { width: 38px; height: 38px; flex-basis: 38px }
  .coframe-seal { width: 52px; height: 52px }
  .coframe-constellation { transform: scale(.86) }
  .coframe-copy strong { font-size: 13px }
  .coframe-copy small { font-size: 9px }
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
