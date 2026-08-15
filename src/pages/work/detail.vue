<template>
  <div v-if="!d" class="page-detail">
    <main style="margin-left:0">
      <div class="wrap" style="padding-top:120px">
        <div class="empty show">没有找到这份作业<br><span style="font-size:12px;font-weight:600"><router-link to="/" style="color:var(--ink)">← 返回作业广场</router-link></span></div>
      </div>
    </main>
  </div>
  <div v-else class="page-detail">
    <DetailSidebar :author="d.author" :source="d.source" />

    <main>
      <!-- HERO -->
      <header class="hero" :style="{ '--wm': JSON.stringify(d.watermark) }">
        <div class="wrap">
          <div class="crumb">
            <template v-for="(c, i) in d.crumb" :key="i">
              <span v-if="c.fill" class="pill fill">{{ c.text }}</span>
              <span v-else-if="c.pill" class="pill">{{ c.text }}</span>
              <span v-else class="plain">{{ c.text }}</span>
            </template>
          </div>
          <h1>{{ d.title }}<span class="small">{{ d.small }}</span></h1>
          <p class="hero-sub">{{ d.sub }}</p>
          <div class="hero-stats">
            <div v-for="(s, i) in d.stats" :key="i">
              <div class="k">{{ s.k }}</div>
              <div class="v">{{ s.v }}<small>{{ s.s }}</small></div>
            </div>
          </div>
        </div>
      </header>

      <!-- 01 密探阵容 -->
      <section id="team">
        <div class="wrap">
          <div class="sec-head" v-reveal>
            <span class="idx">01</span><h2>密探阵容</h2>
            <span class="en">Team Lineup</span>
          </div>
          <div class="team">
            <div v-for="(m, i) in d.team" :key="m.name" class="card" v-reveal="{ delay: (i % 5) * 70 }">
              <span class="pos">{{ m.pos }}</span>
              <img :src="m.img" :alt="m.name">
              <h3>{{ m.name }}<span class="stars">{{ '★'.repeat(m.stars.on) }}<span class="off">{{ '★'.repeat(m.stars.off) }}</span></span></h3>
              <div class="attrs">
                <div class="attr"><div class="k">攻击</div><div class="v">{{ m.atk }}</div></div>
                <div class="attr"><div class="k">生命</div><div class="v">{{ m.hp }}</div></div>
              </div>
              <div class="disks">
                <template v-for="(dk, j) in m.disks" :key="j">
                  <span v-if="typeof dk === 'object'" class="disk" :class="{ sub: dk.sub }">{{ dk.text }}</span>
                  <span v-else class="disk">{{ dk }}</span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 02 打法要点 -->
      <section id="tips">
        <div class="wrap">
          <div class="sec-head" v-reveal>
            <span class="idx">02</span><h2>打法要点</h2>
            <span class="en">Strategy Notes</span>
          </div>
          <div class="tips">
            <div class="tip-main" v-reveal>
              <span class="tag">{{ d.tips.main.tag }}</span>
              <p v-html="d.tips.main.html"></p>
            </div>
            <div class="tip-col">
              <div v-for="(t, i) in d.tips.list" :key="t.n" class="tip" v-reveal="{ delay: 140 + i * 70 }">
                <span class="n">{{ t.n }}</span>
                <p v-html="t.html"></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 03 星石练度 -->
      <section id="stones">
        <div class="wrap">
          <div class="sec-head" v-reveal>
            <span class="idx">03</span><h2>星石练度</h2>
            <span class="en">Stone Builds</span>
          </div>
          <div class="stones" v-reveal>
            <div v-for="s in d.stones" :key="s.name" class="stone-row">
              <div class="who"><img :src="s.img" :alt="s.name">{{ s.name }}</div>
              <div class="conf" v-html="s.conf"></div>
            </div>
          </div>
          <p class="stone-note" v-reveal>{{ d.stoneNote }}</p>
        </div>
      </section>

      <!-- 04 作业信息 -->
      <section id="info">
        <div class="wrap">
          <div class="sec-head" v-reveal>
            <span class="idx">04</span><h2>作业信息</h2>
            <span class="en">Metadata</span>
          </div>
          <div class="meta-grid" v-reveal>
            <div v-for="(m, i) in d.meta" :key="i">
              <div class="k">{{ m.k }}</div>
              <div class="v">{{ m.v }}</div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter tone="slate">
        <template #big>祝各位凹关顺利<br><span>也祝草划早日 **</span></template>
        <template #fine>
          <b>MaaYuan Share</b> · 作业分享<br>
          MAA × 代号鸢BWiki × 辟雍学宫 × YuanAssist 共同搭建<br>
          关键词：{{ d.keywords.join(' / ') }}
        </template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import DetailSidebar from '../../components/DetailSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import { DETAILS } from '../../data/detail.js'

const props = defineProps({ id: { type: String, default: '' } })

const d = computed(() => DETAILS[props.id] || null)
</script>
