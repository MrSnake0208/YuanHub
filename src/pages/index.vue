<template>
  <div class="page-plaza">
    <IslandSidebar />

    <main id="main-content">
      <!-- HERO -->
      <header class="hero">
        <div class="wrap">
          <div class="crumb">
            <span class="pill fill">作业</span>
            <span class="pill">如鸢</span>
            <span class="pill">代号鸢</span>
          </div>
          <h1>作业广场<span class="small">抄作业 · 一键分享</span></h1>
          <p class="hero-sub">MAA 玩家的作业集散地：全自动 / 半自动通关配置、密探阵容与星石练度，点开即可抄。</p>
          <div class="notice" v-reveal>
            <span class="tag">系统更新</span>
            <p>2026年8月3日 · 请更新到 <b>MaaYuan v2.2.0-beta.3</b> 及以上：新增 X号位【退场重开】/【未被复制重开】（庞统鹦鹉）/【不足2龙气重开】（诸葛亮），以及自定义【点击偏移量】—— 赌泰山府重开可用「泰山府（关卡名偏右 / 偏左）」预设。</p>
          </div>
          <div class="hero-stats">
            <div><div class="k">本页收录作业</div><div class="v">10<small>份</small></div></div>
            <div><div class="k">密探池</div><div class="v">121<small>位</small></div></div>
            <div><div class="k">覆盖站点</div><div class="v">2<small>如鸢 / 代号鸢</small></div></div>
            <div><div class="k">适配版本</div><div class="v">v2.2.0<small>-beta.3+</small></div></div>
          </div>
        </div>
      </header>

      <section>
        <div class="wrap">
          <!-- 工具栏 -->
          <div class="toolbar" v-reveal>
            <div class="tabs">
              <button
                v-for="t in ['作业', '作业集', '关卡']"
                :key="t"
                :class="{ on: tab === t }"
                @click="setTab(t)"
              >{{ t }}</button>
            </div>
            <button v-for="s in ['全部', '如鸢', '代号鸢']" :key="s" class="chip" :class="{ on: site === s }" @click="setSite(s)">{{ s === '全部' ? s : '只看' + s }}</button>
            <div class="sp"></div>
            <div class="search"><span class="ic" aria-hidden="true">⌕</span><input v-model="q" type="search" aria-label="搜索作业" placeholder="搜标题 / 作者 / 密探…"></div>
            <span class="sort-lb">排序</span>
            <button class="chip" :class="{ on: sort === 'views' }" @click="setSort('views')">访问量</button>
            <button class="chip" :class="{ on: sort === 'likes' }" @click="setSort('likes')">热度</button>
            <button class="chip" :class="{ on: sort === 'days' }" @click="setSort('days')">最新</button>
          </div>

          <!-- 列表 -->
          <div class="list">
            <WorkCard v-for="w in shown" :key="w.id" :work="w" :rank="String(filtered.indexOf(w) + 1).padStart(2, '0')" />
          </div>
          <div class="empty" :class="{ show: showEmpty }">这个分区暂时没有收录内容<br><span style="font-size:12px;font-weight:600">去「作业」分区看看，或创建第一份分享</span></div>

          <!-- 加载更多 -->
          <div class="more-row" v-reveal>
            <div class="pg">
              <button :disabled="page <= 1" @click="page--">‹</button>
            </div>
            <button class="btn-more" :disabled="noMore" @click="loadMore">{{ noMore ? '没有更多了' : '加载更多' }}</button>
            <div class="pg">
              <button :disabled="noMore" @click="page++">›</button>
            </div>
          </div>

          <!-- 三方共建 -->
          <div class="credits" v-reveal>
            <div class="credits-head"><h2>共同搭建</h2><span class="sub">Built Together</span></div>
            <div class="credit-grid">
              <div class="credit" style="--cc:var(--yellow-deep)">
                <img src="/icons/maa.png" width="60" height="60" alt="MAA">
                <div><div class="nm">MAA · MaaYuan</div><div class="rl">项目主导 · 自动化框架，大肥鸟为本站吉祥物</div></div>
              </div>
              <div class="credit" style="--cc:var(--brand-blue)">
                <img src="/icons/bwiki.png" width="60" height="60" alt="BWiki">
                <div><div class="nm">代号鸢 BWiki</div><div class="rl">资料与密探数据支持 · 编辑部</div></div>
              </div>
              <div class="credit" style="--cc:var(--accent)">
                <img src="/icons/piyong.png" width="60" height="60" alt="辟雍学宫">
                <div><div class="nm">辟雍学宫</div><div class="rl">小程序端 · 攻略社区共建</div></div>
              </div>
              <div class="credit" style="--cc:var(--mist)">
                <img src="/icons/yuanassist.png" width="60" height="60" alt="YuanAssist">
                <div><div class="nm">YuanAssist</div><div class="rl">App 端 · 作业同步与工具支持</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter>
        <template #big>YuanHub<br><span>祝各位凹关顺利</span></template>
        <template #fine>
          <a href="#">MaaYuan 导航站</a> · <a href="#">意见与反馈</a><br>
          <a href="#">MaaYuan GitHub Repo</a> · <a href="#">前端 Repo</a> · <a href="#">后端 Repo</a><br>
          作业制作者交流群：<b>1055262891</b>
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import IslandSidebar from '../components/IslandSidebar.vue'
import WorkCard from '../components/WorkCard.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { WORKS } from '../data/works.js'

const PAGE_SIZE = 6
const tab = ref('作业')
const site = ref('全部')
const sort = ref('views')
const q = ref('')
const page = ref(1)

const filtered = computed(() => {
  if (tab.value !== '作业') return []
  const kw = q.value.trim().toLowerCase()
  return WORKS.filter(w =>
    (site.value === '全部' || w.site === site.value) &&
    (!kw || (w.title + w.author + w.team.join('')).toLowerCase().includes(kw))
  ).sort((a, b) => sort.value === 'days' ? a.days - b.days : b[sort.value] - a[sort.value])
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const shown = computed(() => filtered.value.slice(0, page.value * PAGE_SIZE))
const showEmpty = computed(() => tab.value !== '作业' || filtered.value.length === 0)
const noMore = computed(() => page.value >= totalPages.value)

function setTab(t) { tab.value = t; page.value = 1 }
function setSite(s) { site.value = s; page.value = 1 }
function setSort(s) { sort.value = s; page.value = 1 }
function loadMore() { if (!noMore.value) page.value++ }
</script>
