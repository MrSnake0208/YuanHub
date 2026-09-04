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

            <div v-if="status === 'empty'" class="share-state">
              <span class="state-mark" aria-hidden="true">0</span>
              <h2>这个密探 BOX 还是空的</h2>
              <p>分享已生效，但当前没有可展示的密探养成数据。</p>
            </div>

            <div v-else class="operator-grid">
              <article v-for="entry in entries" :key="entry.id" class="operator-card">
                <header class="operator-heading">
                  <div class="operator-avatar">
                    <span aria-hidden="true">{{ monogram(entry) }}</span>
                    <img v-if="entry.avatar" :src="avatarUrl(entry.avatar)" :alt="entry.name + '头像'" @error="hideBrokenImage" />
                  </div>
                  <div>
                    <p class="operator-tags">
                      <span v-for="prof in entry.prof" :key="prof">{{ prof }}</span>
                      <span v-for="prof in entry.sub_prof" :key="'sub:' + prof" class="outline">{{ prof }}</span>
                    </p>
                    <h2>{{ entry.name }}</h2>
                  </div>
                  <strong v-if="entry.rarity" class="rarity" :aria-label="entry.rarity + '星稀有度'">{{ '★'.repeat(entry.rarity) }}</strong>
                </header>

                <dl class="growth-summary">
                  <div><dt>等级</dt><dd>Lv {{ number(entry.growth.level) }}</dd></div>
                  <div><dt>修为</dt><dd>{{ number(entry.growth.elite) }}</dd></div>
                  <div><dt>化极</dt><dd>{{ operatorShareStarLabel(entry.growth.star_level, entry.sp_of) }}</dd></div>
                  <div><dt>攻击</dt><dd>{{ combatValue(entry, 'attack') }}</dd></div>
                  <div><dt>生命</dt><dd>{{ combatValue(entry, 'hp') }}</dd></div>
                </dl>

                <section class="card-section">
                  <h3>奇闻</h3>
                  <dl class="oddity-list">
                    <div v-for="oddity in oddities(entry)" :key="oddity.key">
                      <dt>{{ oddity.name }}</dt><dd>{{ oddity.current }}<small> / {{ oddity.max }}</small></dd>
                    </div>
                  </dl>
                </section>

                <section class="card-section">
                  <h3>双命盘</h3>
                  <div class="loadout-grid">
                    <div v-for="(loadout, index) in loadouts(entry)" :key="index" class="loadout">
                      <b>{{ loadout && loadout.name ? loadout.name : '命盘 ' + (index + 1) }}</b>
                      <p>{{ loadoutSummary(loadout) }}</p>
                    </div>
                  </div>
                </section>

                <section class="card-section">
                  <h3>已装备星石</h3>
                  <ul v-if="starStones(entry).length" class="stone-list">
                    <li v-for="(stone, index) in starStones(entry)" :key="stone.type || index">
                      <b>{{ stone.name || stone.type }}</b><span>{{ stone.level != null ? 'Lv ' + stone.level : '' }}</span>
                    </li>
                  </ul>
                  <p v-else class="muted">未装备星石</p>
                </section>
              </article>
            </div>
          </template>
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
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { getOperatorCatalog, viewOperatorShare } from '../../api/operator.js'
import { avatarUrl } from '../../api/request.js'
import { normalizeDiscNames } from '../../utils/operatorDiscLoadouts.js'
import {
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

async function loadShare() {
  const token = parseOperatorShareToken(route.params.token)
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
    const schema = entry.oddity_schema[key] || {}
    const value = values[key] || {}
    return {
      key: key,
      name: schema.name || (key === 'attack' ? '攻击力' : key === 'hp' ? '生命值' : '特殊属性'),
      current: formattedNumber(value.current),
      max: formattedNumber(schema.max != null ? schema.max : value.max)
    }
  })
}

function loadouts(entry) {
  const source = Array.isArray(entry.growth.disc_loadouts) ? entry.growth.disc_loadouts : []
  return [source[0] || null, source[1] || null]
}

function loadoutSummary(loadout) {
  if (!loadout) return '未配置'
  const names = normalizeDiscNames(loadout.discs || loadout.disc_names)
  return names.length ? names.join('、') : '未配置'
}

function starStones(entry) {
  return Array.isArray(entry.growth.star_stones)
    ? entry.growth.star_stones.filter(function (stone) { return stone && (stone.name || stone.type) })
    : []
}

function monogram(entry) {
  return Array.from(entry.name || entry.id || '?')[0]
}

function hideBrokenImage(event) {
  event.currentTarget.hidden = true
}

watch(function () { return route.params.token }, loadShare, { immediate: true })
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
.operator-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px }
.operator-card { min-width: 0; border: 1px solid var(--line); border-radius: 22px; padding: 22px; background: var(--surface); box-shadow: 0 22px 44px -38px rgba(73, 59, 44, .48) }
.operator-heading { display: flex; min-width: 0; align-items: center; gap: 14px }
.operator-avatar { position: relative; display: grid; width: 70px; height: 74px; flex: none; place-items: center; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; color: var(--ink-60); background: var(--paper); font: 900 26px var(--font-s) }
.operator-avatar img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top }
.operator-heading > div:nth-child(2) { min-width: 0; flex: 1 }
.operator-heading h2 { margin-top: 4px; overflow: hidden; font: 900 22px var(--font-s); text-overflow: ellipsis; white-space: nowrap }
.operator-tags { display: flex; flex-wrap: wrap; gap: 5px }
.operator-tags span { border-radius: 999px; padding: 2px 8px; color: var(--ink); background: var(--yellow); font-size: 10px; font-weight: 800 }
.operator-tags span.outline { border: 1px solid var(--brand-blue); color: var(--brand-blue); background: transparent }
.rarity { align-self: flex-start; color: var(--yellow-deep); font-size: 11px; letter-spacing: 1px }
.growth-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; margin-top: 18px }
.growth-summary div { min-width: 0; border-radius: 10px; padding: 9px 7px; background: var(--paper); text-align: center }
.growth-summary dt { color: var(--ink-60); font-size: 10px; font-weight: 700 }
.growth-summary dd { margin-top: 4px; overflow-wrap: anywhere; font: 900 14px var(--font-d) }
.card-section { margin-top: 17px; padding-top: 14px; border-top: 1px dashed var(--line) }
.card-section h3 { font: 900 14px var(--font-s) }
.oddity-list,.loadout-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin-top: 10px }
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
  .operator-card { padding: 17px }
  .operator-heading { align-items: flex-start }
  .operator-avatar { width: 58px; height: 62px }
  .rarity { display: none }
  .growth-summary { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .oddity-list { grid-template-columns: 1fr }
  .state-actions { flex-direction: column }
}
</style>
