<template>
  <div class="promo-page">
    <header class="promo-header">
      <div class="promo-wrap promo-header-inner">
        <div class="promo-brand">
          <img class="promo-brand-mark" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true" />
          <span class="promo-brand-name">YuanHub</span>
        </div>
        <div class="promo-header-note">
          <span class="header-dot"></span>
          社区数据基础设施
          <span class="header-code">DEMO EDITION</span>
        </div>
      </div>
    </header>

    <main id="main-content" class="promo-main">
      <section class="promo-hero" aria-labelledby="promo-hero-title">
        <div class="promo-wrap">
          <div class="hero-intro">
            <div class="eyebrow"><span>01</span> COMMUNITY DATA LAYER</div>
            <h1 id="promo-hero-title">让游戏数据<br><em>自由流动</em></h1>
            <p class="hero-lede">
              YuanHub 帮你管理个人游戏存档，也为社区共建资料提供整理入口。
              私人存档、主动分享与公共资料有各自的数据边界；保存个人数据不等于向社区公开。
            </p>
            <div class="demo-notice">
              <span class="notice-mark"><Info :size="16" aria-hidden="true" /></span>
              <span><strong>页面示意</strong>　图中卡片、节点与连线均为视觉演示，不代表当前统计或已确认接入。</span>
            </div>
          </div>

          <section class="ecosystem-strip" aria-labelledby="ecosystem-title">
            <div class="ecosystem-heading">
              <div>
                <div class="eyebrow"><span>01·A</span> COMMUNITY ECOSYSTEM</div>
                <h2 id="ecosystem-title">四方联合生态，<em>共同起点</em></h2>
                <p>四个社区入口并列呈现，关系与能力流转为页面示意。</p>
              </div>
              <span class="ecosystem-badge">页面示意</span>
            </div>
            <div class="ecosystem-grid">
              <component
                :is="partner.href ? 'a' : 'div'"
                v-for="partner in partners"
                :key="partner.name"
                class="ecosystem-card"
                :class="partner.tone"
                :href="partner.href"
                :target="partner.href ? '_blank' : undefined"
                :rel="partner.href ? 'noreferrer' : undefined"
                :data-mini-program-uri="partner.miniProgramUri"
                :aria-label="partner.href ? `${partner.name}，访问外部入口` : `${partner.name}，${partner.action}`"
              >
                <img class="ecosystem-icon" :src="partner.icon" :alt="`${partner.name} 图标`">
                <span class="ecosystem-card-copy">
                  <strong class="ecosystem-card-name">{{ partner.name }}</strong>
                  <span class="ecosystem-card-role">{{ partner.role }}</span>
                  <span class="ecosystem-action">{{ partner.action }} <ArrowUpRight v-if="partner.href" :size="12" aria-hidden="true" /></span>
                  <small v-if="partner.miniProgramUri" class="ecosystem-card-uri">{{ partner.miniProgramUri }}</small>
                </span>
              </component>
            </div>
          </section>

          <div class="hero-flow" aria-label="私人存档、主动 BOX 分享和公共资料使用不同访问方式的示意图">
            <div class="flow-caption">
              <span>CONTRIBUTION FLOW</span>
              <span class="caption-line"></span>
              <span>示意数据</span>
            </div>
            <div class="flow-lane">
              <article class="flow-node source-node">
                <div class="node-topline"><span class="node-icon"><Plus :size="16" aria-hidden="true" /></span><span class="node-type">PLAYER INPUT</span></div>
                <h2>保存与共建</h2>
                <p>私人存档 · 主动分享<br>公共资料 · 社区修订</p>
                <span class="demo-label">DEMO DATA</span>
              </article>

              <div class="flow-connector" aria-hidden="true">
                <span>按用途整理</span>
                <i></i>
              </div>

              <article class="flow-node hub-node">
                <span class="hub-ring ring-one"></span>
                <span class="hub-ring ring-two"></span>
                <img class="hub-core" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true" />
                <div class="node-type">SHARED DATA LAYER</div>
                <h2>YuanHub</h2>
                <p>区分访问权限<br>保留贡献脉络</p>
                <span class="demo-label">DEMO DATA</span>
              </article>

              <div class="flow-connector" aria-hidden="true">
                <span>按权限访问</span>
                <i></i>
              </div>

              <div class="output-stack">
                <article v-for="destination in destinations" :key="destination.name" class="flow-node output-node">
                  <span class="output-symbol" :class="destination.tone"><component :is="destination.icon" :size="18" aria-hidden="true" /></span>
                  <div>
                    <h2>{{ destination.name }}</h2>
                    <p>{{ destination.detail }}</p>
                  </div>
                  <span class="demo-label">示意</span>
                </article>
              </div>
            </div>
          </div>
          <aside class="data-boundaries" aria-label="数据访问说明">
            <p><strong>私人存档：</strong>个人背包与养成记录不会因为保存就成为公共资料；个人 API 访问需要相应授权。</p>
            <p><strong>主动分享：</strong>开启 BOX 分享后，持有分享码或链接的人可免登录查看该 BOX 的公开养成字段；撤销或重新生成后，原分享码失效。</p>
            <p><strong>公共资料：</strong>公共图鉴与经确认公开的社区资料按各自接口范围提供。示意图不表示所有资料都已开放 API，也不表示外部项目已接入。</p>
          </aside>
        </div>
      </section>

      <section class="promo-section builders-section" aria-labelledby="builders-title">
        <div class="promo-wrap builders-layout">
          <div class="section-copy">
            <div class="eyebrow"><span>02</span> OPEN CONTRIBUTION</div>
            <h2 id="builders-title">玩家也是<br><em>建设者</em></h2>
            <p>
              公共数据不是凭空出现的。有人补上一条材料，有人校对一次版本，
              也有人留下值得追溯的反馈。每种细小贡献，都会让后来的人少走一点弯路。
            </p>
            <div class="quote-mark">“</div>
            <p class="copy-note">从使用者到共同维护者，社区的知识由社区一起留下。</p>
          </div>

          <div class="contribution-board">
            <div class="board-head">
              <div>
                <span class="board-kicker">SHARED RECORD / 示意档案</span>
                <h3>一份持续生长的公共资料</h3>
              </div>
              <span class="stamp">示意数据</span>
            </div>
            <div class="board-rule"></div>
            <div v-for="(item, index) in contributions" :key="item.title" class="contribution-row">
              <span class="contribution-index">0{{ index + 1 }}</span>
              <span class="contribution-seal" :class="item.tone"><component :is="item.icon" :size="18" aria-hidden="true" /></span>
              <div class="contribution-body">
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
              </div>
              <span class="row-tag">{{ item.tag }}</span>
            </div>
            <div class="board-foot">
              <span class="foot-dash"></span>
              <span>社区投稿　→　确认公开范围　→　YuanHub 整理与复用</span>
            </div>
          </div>
        </div>
      </section>

      <section class="promo-section reuse-section" aria-labelledby="reuse-title">
        <div class="promo-wrap">
          <div class="reuse-heading">
            <div class="eyebrow"><span>03</span> ONE CONTRIBUTION, MANY USES</div>
            <h2 id="reuse-title">一次投稿，<em>多处使用</em></h2>
            <p>社区知识在确认公开范围后，可通过已开放的接口被复用。资料站、社区 App 和自动化工具的使用方式以实际接口与接入情况为准。</p>
          </div>

          <div class="reuse-stage" aria-label="一次投稿经过 YuanHub 统一整理后，由不同社区项目按需通过 API 调用的示意图">
            <div class="stage-note note-left">
              <span class="note-index">A</span>
              <strong>社区投稿</strong>
              <small>明确提交用于共建的公共资料</small>
              <span class="demo-label">示意</span>
            </div>
            <div class="stage-connector connector-left" aria-hidden="true"><i></i><span>提交</span></div>
            <div class="stage-hub">
              <img class="stage-hub-mark" src="/brand/yuanhub-logo.png" alt="" aria-hidden="true" />
              <div>
                <span class="node-type">ORGANIZE / PRESERVE</span>
                <strong>YuanHub</strong>
                <small>按公开范围整理共建资料</small>
              </div>
              <span class="demo-label">DEMO DATA</span>
            </div>
            <div class="stage-connector connector-right" aria-hidden="true"><i></i><span>API 调用</span></div>
            <div class="reuse-destinations">
              <article v-for="(destination, index) in destinations" :key="`reuse-${destination.name}`" class="reuse-destination">
                <span class="reuse-number">0{{ index + 1 }}</span>
                <span class="reuse-symbol" :class="destination.tone"><component :is="destination.icon" :size="18" aria-hidden="true" /></span>
                <div>
                  <strong>{{ destination.name }}</strong>
                  <small>{{ destination.detail }}</small>
                </div>
                <span class="demo-label">示意</span>
              </article>
            </div>
          </div>

          <div class="reuse-footnote">
            <span class="footnote-mark"><Sparkles :size="16" aria-hidden="true" /></span>
            <p><strong>YuanHub 是中间层。</strong> 私人存档与公共贡献分别管理；外部项目读取个人数据需要相应授权，公共资料以实际开放的接口范围为准。开启 BOX 分享是独立的主动操作。</p>
          </div>
        </div>
      </section>
    </main>

    <footer class="promo-footer">
      <div class="promo-wrap footer-inner">
        <div>
          <span class="footer-kicker">A SHARED STARTING POINT</span>
          <strong>YuanHub <span>·</span> 鸢鸢相抱</strong>
        </div>
        <span class="footer-note">用户录入　社区共建　数据流动</span>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ArrowUpRight, BookOpen, Clock, FilePen, Info, MessageCircle, Network, Package, Plus, Smartphone, Sparkles, Workflow } from '@lucide/vue'
const partners = [
  { name: 'MaaYuan', role: '联合生态入口', action: '访问官网', icon: '/icons/maa.png', href: 'https://maayuan.com/', tone: 'maa' },
  { name: '代号鸢 BWiki', role: '联合生态入口', action: '访问资料站', icon: '/icons/bwiki.png', href: 'https://wiki.biligame.com/yuan/%E9%A6%96%E9%A1%B5', tone: 'bwiki' },
  { name: 'YuanAssist', role: '联合生态入口', action: '访问官网', icon: '/icons/yuanassist.png', href: 'https://www.yuanassist.space/', tone: 'yuanassist' },
  { name: '辟雍学府', role: '联合生态入口', action: '小程序入口', miniProgramUri: '#小程序://辟雍学府/OQufna612dh0plf', icon: '/icons/piyong.png', tone: 'piyong' }
]

const destinations = [
  { name: '资料站', detail: '查阅与校对', icon: BookOpen, tone: 'brown' },
  { name: '社区 App', detail: '随身浏览', icon: Smartphone, tone: 'orange' },
  { name: '自动化工具', detail: '辅助使用', icon: Workflow, tone: 'blue' },
  { name: '社区项目', detail: '继续建设', icon: Network, tone: 'red' }
]

const contributions = [
  { title: '密探资料', detail: '把已确认的内容整理成可查阅记录', tag: '补充', icon: FilePen, tone: 'yellow' },
  { title: '材料资料', detail: '共建材料名称与公开获取说明', tag: '归档', icon: Package, tone: 'orange' },
  { title: '社区共建', detail: '标记变化，让资料可以继续校对', tag: '追踪', icon: Clock, tone: 'blue' },
  { title: '社区反馈', detail: '用户与管理员双向接收并回应信息', tag: '双向', icon: MessageCircle, tone: 'red' }
]
</script>

<style scoped>
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.promo-page {
  color: var(--ink);
}
.promo-header { border-bottom: 1px solid var(--promo-soft-line); }
.promo-header-note { color: var(--promo-muted); }
.header-dot { border-radius: 50%; background: var(--accent); }
.header-code { border-left: 1px solid var(--promo-line); color: var(--accent-strong); }
.eyebrow { color: var(--accent-strong); }
.eyebrow span { color: var(--tea); }
.hero-intro h1 { color: var(--tea); }
h1 em, h2 em { color: var(--accent); }
.hero-lede { color: var(--promo-muted); }
.demo-notice { border-left: 3px solid var(--yellow-deep); background: rgba(255, 253, 246, .58); color: var(--promo-muted); }
.notice-mark { color: var(--accent); }
.demo-notice strong { color: var(--tea); }

.ecosystem-strip { border-top: 1px dashed var(--promo-line); }
.ecosystem-heading h2 { color: var(--tea); }
.ecosystem-heading p { color: var(--promo-muted); }
.ecosystem-badge { border: 1px solid var(--promo-line); border-radius: 4px; color: var(--accent-strong); }
.ecosystem-card { border: 1px solid var(--promo-line); border-top-width: 3px; border-radius: 9px; background: rgba(255, 253, 246, .72); color: inherit; text-decoration: none; transition: background-color .2s ease, transform .2s ease; }
.ecosystem-card:hover { background: var(--surface); }
.ecosystem-card.maa { border-top-color: var(--yellow-deep); }
.ecosystem-card.bwiki { border-top-color: var(--tea); }
.ecosystem-card.yuanassist { border-top-color: var(--rouge); }
.ecosystem-card.piyong { border-top-color: var(--accent); }
.ecosystem-icon { border-radius: 10px; background: var(--paper); }
.ecosystem-card-name { color: var(--tea); }
.ecosystem-card-role { color: var(--promo-muted); }
.ecosystem-action { color: var(--accent-strong); }
.ecosystem-card-uri { color: var(--promo-muted); }

.hero-flow { border: 1px solid var(--promo-line); border-radius: 18px; background: rgba(255, 253, 246, .42); box-shadow: 0 24px 46px -36px rgba(73, 59, 44, .48); }
.data-boundaries { border: 1px solid var(--promo-line); border-radius: 12px; background: var(--surface); }
.data-boundaries p { color: var(--promo-muted); }
.data-boundaries strong { color: var(--tea); }
.flow-caption { color: var(--promo-muted); }
.caption-line { border-top: 1px solid var(--accent); }
.flow-caption span:last-child { color: var(--accent-strong); }
.flow-node { border: 1px solid var(--promo-line); background: var(--surface); }
.source-node { border-radius: 13px 13px 13px 4px; }
.node-topline { color: var(--promo-muted); }
.node-icon { border-radius: 50%; color: var(--tea); background: var(--yellow); }
.flow-node h2 { color: var(--tea); }
.flow-node p { color: var(--promo-muted); }
.demo-label { border: 1px solid var(--promo-line); border-radius: 4px; color: var(--accent-strong); background: rgba(239, 210, 142, .25); }
.flow-connector { color: var(--promo-muted); }
.flow-connector i { background: var(--accent); }
.flow-connector i::after { border-top: 1px solid var(--accent); border-right: 1px solid var(--accent); content: ''; }
.hub-node { border-color: var(--tea); border-radius: 50%; background: var(--tea); color: var(--cream); box-shadow: 0 14px 26px -20px rgba(73, 59, 44, .85); }
.hub-node .node-type { color: rgba(255, 248, 236, .7); }
.hub-node h2 { color: var(--cream); }
.hub-node p { color: rgba(255, 248, 236, .72); }
.hub-ring { border: 1px solid rgba(239, 210, 142, .4); border-radius: 50%; pointer-events: none; }
.ring-two { border-color: rgba(239, 210, 142, .18); }
.output-node { border-radius: 8px; }
.output-symbol, .reuse-symbol { border-radius: 9px; }
.yellow { color: var(--tea); background: var(--yellow); }
.orange { color: var(--cream); background: var(--accent); }
.blue { color: var(--tea); background: var(--mist); }
.red { color: var(--cream); background: var(--rouge); }
.brown { color: var(--cream); background: var(--tea); }

.promo-section { border-top: 1px solid var(--promo-soft-line); }
.builders-section { background: rgba(255, 253, 246, .3); }
.section-copy h2, .reuse-heading h2 { color: var(--tea); }
.section-copy > p:not(.copy-note) { color: var(--promo-muted); }
.quote-mark { color: var(--yellow-deep); }
.copy-note { color: var(--tea); }
.contribution-board { border: 1px solid var(--promo-line); border-radius: 15px; background: rgba(255, 253, 246, .72); box-shadow: 0 25px 55px -42px rgba(73, 59, 44, .65); }
.board-kicker { color: var(--accent-strong); }
.board-head h3 { color: var(--tea); }
.stamp { border: 1px solid var(--rouge); color: var(--rouge); }
.board-rule { border-top: 1px dashed var(--promo-line); }
.contribution-row { border-bottom: 1px solid var(--promo-soft-line); }
.contribution-index { color: var(--accent-strong); }
.contribution-seal { border: 1px solid currentColor; border-radius: 50%; }
.contribution-body strong { color: var(--tea); }
.contribution-body span { color: var(--promo-muted); }
.row-tag { border-radius: 4px; color: var(--promo-muted); background: var(--paper); }
.board-foot { color: var(--promo-muted); }
.foot-dash { border-top: 1px solid var(--accent); }
.reuse-heading p { color: var(--promo-muted); }
.reuse-stage { border: 1px solid var(--promo-line); border-radius: 17px; background: rgba(255, 253, 246, .4); }
.stage-note { border-left: 3px solid var(--yellow-deep); background: rgba(239, 210, 142, .27); }
.note-index { color: var(--accent-strong); }
.stage-note strong { color: var(--tea); }
.stage-note small, .stage-hub small, .reuse-destination small { color: var(--promo-muted); }
.stage-connector { color: var(--promo-muted); }
.stage-connector i { border-top: 1px solid var(--accent); }
.stage-connector i::after { border-top: 1px solid var(--accent); border-right: 1px solid var(--accent); content: ''; }
.stage-hub { border: 1px solid var(--tea); border-radius: 12px; color: var(--cream); background: var(--tea); }
.stage-hub .node-type { color: rgba(255, 248, 236, .65); }
.stage-hub strong { color: var(--cream); }
.stage-hub small { color: rgba(255, 248, 236, .74); }
.stage-hub .demo-label { border-color: rgba(255, 248, 236, .4); color: var(--yellow); background: transparent; }
.reuse-number { color: var(--accent-strong); }
.reuse-symbol { border-radius: 7px; }
.reuse-destination strong { color: var(--tea); }
.reuse-footnote { border-top: 1px dashed var(--promo-line); }
.footnote-mark { color: var(--accent); }
.reuse-footnote p { color: var(--promo-muted); }
.reuse-footnote strong { color: var(--tea); }

.promo-footer { border-top: 1px solid var(--promo-soft-line); background: var(--tea); color: var(--cream); }
.footer-kicker { color: var(--yellow); }
.footer-inner strong span { color: var(--yellow); }
.footer-note { color: rgba(255, 248, 236, .68); }

@media (max-width: 850px) {
  .ecosystem-icon { border-radius: 8px; }
  .reuse-destinations { border-top: 1px dashed var(--promo-line); }
}
</style>
<style scoped src="./promoPageDesktop.css"></style>
<style scoped src="./promoPageMobile.css"></style>
