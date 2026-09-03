<template>
  <div class="promo-page">
    <header class="promo-header">
      <div class="promo-wrap promo-header-inner">
        <div class="promo-brand">
          <span class="promo-brand-mark">YH</span>
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
            <h1 id="promo-hero-title">让游戏数据<br /><em>自由流动</em></h1>
            <p class="hero-lede">
              YuanHub
              保存的是用户手动填写的个人游戏记录，比如“我在游戏里有什么、进度如何”。
              这不是读取官方游戏数据，也不是读取游戏账号；记录不会默认公开。只有经用户授权，外部软件才能通过
              API Token，调用 YuanHub 中已经录入、且属于 Token
              绑定子账号与授权范围的数据；整理后的社区记录也可以成为继续建设的起点。
            </p>
            <div class="demo-notice">
              <span class="notice-mark">◎</span>
              <span
                ><strong>页面示意</strong
                >　图中卡片、节点与连线均为视觉演示，不代表当前统计或已确认接入。</span
              >
            </div>
          </div>

          <section class="ecosystem-strip" aria-labelledby="ecosystem-title">
            <div class="ecosystem-heading">
              <div>
                <div class="eyebrow"><span>01·A</span> COMMUNITY ECOSYSTEM</div>
                <h2 id="ecosystem-title">四个社区项目，<em>共同起点</em></h2>
                <p>四个社区项目并列呈现，项目关系与能力流转均为页面示意。</p>
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
                :aria-label="
                  partner.href
                    ? `${partner.name}，访问外部入口`
                    : `${partner.name}，${partner.action}`
                "
              >
                <img
                  class="ecosystem-icon"
                  :src="partner.icon"
                  :alt="`${partner.name} 图标`"
                />
                <span class="ecosystem-card-copy">
                  <strong class="ecosystem-card-name">{{
                    partner.name
                  }}</strong>
                  <span class="ecosystem-card-role">{{ partner.role }}</span>
                  <span class="ecosystem-action">{{ partner.action }}</span>
                  <small
                    v-if="partner.miniProgramUri"
                    class="ecosystem-card-uri"
                    >{{ partner.miniProgramUri }}</small
                  >
                </span>
              </component>
            </div>
          </section>

          <div
            class="hero-flow"
            role="img"
            aria-label="示意：用户手动录入个人游戏记录，经授权范围内的 API Token 由软件调用。"
          >
            <div class="flow-caption">
              <span>CONTRIBUTION FLOW</span>
              <span class="caption-line"></span>
              <span>示意数据</span>
            </div>
            <div class="flow-lane">
              <article class="flow-node source-node">
                <div class="node-topline">
                  <span class="node-icon">+</span
                  ><span class="node-type">PLAYER INPUT</span>
                </div>
                <h2>用户手动录入的记录</h2>
                <p>我在游戏里有什么、进度如何<br />由用户自行填写</p>
                <span class="demo-label">DEMO DATA</span>
              </article>

              <div class="flow-connector" aria-hidden="true">
                <span>整理进入</span>
                <i></i>
              </div>

              <article class="flow-node hub-node">
                <span class="hub-ring ring-one"></span>
                <span class="hub-ring ring-two"></span>
                <div class="hub-core">YH</div>
                <div class="node-type">USER-AUTHORIZED DATA</div>
                <h2>YuanHub</h2>
                <p>保存已经录入的内容<br />按授权范围提供调用</p>
                <span class="demo-label">DEMO DATA</span>
              </article>

              <div class="flow-connector" aria-hidden="true">
                <span>API 调用</span>
                <i></i>
              </div>

              <div class="output-stack">
                <article
                  v-for="destination in destinations"
                  :key="destination.name"
                  class="flow-node output-node"
                >
                  <span class="output-symbol" :class="destination.tone">{{
                    destination.symbol
                  }}</span>
                  <div>
                    <h2>{{ destination.name }}</h2>
                    <p>{{ destination.detail }}</p>
                  </div>
                  <span class="demo-label">示意</span>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        class="promo-section builders-section"
        aria-labelledby="builders-title"
      >
        <div class="promo-wrap builders-layout">
          <div class="section-copy">
            <div class="eyebrow"><span>02</span> OPEN CONTRIBUTION</div>
            <h2 id="builders-title">玩家也是<br /><em>建设者</em></h2>
            <p>
              社区共建不等于公开每个人的个人记录：数据用户手动填写并管理自己的记录，
              软件开发者可以为项目申请接入，但需遵守社区规则并通过审核，社区审核与维护者则帮助校对公开的社区基础。
              接入后，软件只能使用权限受限的 API
              Token，在用户授权范围内调用已录入的数据。
            </p>
            <div class="quote-mark">“</div>
            <p class="copy-note">
              普通用户入口与开发者接入说明地址待定；这里仅呈现参与方式，不提供占位链接。
            </p>
          </div>

          <div class="contribution-board">
            <div class="board-head">
              <div>
                <span class="board-kicker">SHARED RECORD / 示意档案</span>
                <h3>一份持续生长的社区记录</h3>
              </div>
              <span class="stamp">示意数据</span>
            </div>
            <div class="board-rule"></div>
            <div
              v-for="(item, index) in contributions"
              :key="item.title"
              class="contribution-row"
            >
              <span class="contribution-index">0{{ index + 1 }}</span>
              <span class="contribution-seal" :class="item.tone">{{
                item.mark
              }}</span>
              <div class="contribution-body">
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
              </div>
              <span class="row-tag">{{ item.tag }}</span>
            </div>
            <div class="board-foot">
              <span class="foot-dash"></span>
              <span
                >用户手动录入个人记录　→　YuanHub 整理　→　通过审核的软件按
                Token 调用已授权记录</span
              >
            </div>
          </div>
        </div>
      </section>

      <section
        class="promo-section reuse-section"
        aria-labelledby="reuse-title"
      >
        <div class="promo-wrap">
          <div class="reuse-heading">
            <div class="eyebrow">
              <span>03</span> ONE CONTRIBUTION, MANY USES
            </div>
            <h2 id="reuse-title">一次录入，<em>多处使用</em></h2>
            <p>
              用户先手动填写“我在游戏里有什么、进度如何”等个人记录。记录不会默认公开；符合社区规则并通过审核的软件项目，只有在用户授权后，才能按
              Token 绑定的子账号与授权范围，通过 API Token 调用 YuanHub
              中已经录入的数据，再以不同方式回到玩家身边。
            </p>
          </div>

          <div
            class="reuse-stage"
            role="img"
            aria-label="示意：用户手动录入的个人记录经 YuanHub 整理后，由通过审核的软件按 API Token 调用授权范围内的已录入数据。"
          >
            <div class="stage-note note-left">
              <span class="note-index">A</span>
              <strong>用户手动录入的记录</strong>
              <small>用户填写自己在游戏里的内容与进度</small>
              <span class="demo-label">示意</span>
            </div>
            <div class="stage-connector connector-left" aria-hidden="true">
              <i></i><span>录入</span>
            </div>
            <div class="stage-hub">
              <div class="stage-hub-mark">YH</div>
              <div>
                <span class="node-type">ORGANIZE / PRESERVE</span>
                <strong>YuanHub</strong>
                <small>只提供已录入且获授权的内容</small>
              </div>
              <span class="demo-label">DEMO DATA</span>
            </div>
            <div class="stage-connector connector-right" aria-hidden="true">
              <i></i><span>API 调用</span>
            </div>
            <div class="reuse-destinations">
              <article
                v-for="(destination, index) in destinations"
                :key="`reuse-${destination.name}`"
                class="reuse-destination"
              >
                <span class="reuse-number">0{{ index + 1 }}</span>
                <span class="reuse-symbol" :class="destination.tone">{{
                  destination.symbol
                }}</span>
                <div>
                  <strong>{{ destination.name }}</strong>
                  <small>{{ destination.detail }}</small>
                </div>
                <span class="demo-label">示意</span>
              </article>
            </div>
          </div>

          <div class="reuse-footnote">
            <span class="footnote-mark">✦</span>
            <p>
              <strong>YuanHub 是中间层。</strong>
              用户手动填写的个人游戏记录不默认公开，也不是由 YuanHub
              直接读取官方游戏数据或游戏账号。用户授权后，符合社区规则并通过审核的软件才可按
              API Token 的 scope 调用 Token
              绑定子账号中已经录入且在授权范围内的记录。社区项目示意可以共享整理后的社区基础，让不同项目拥有共同的起点。
            </p>
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
const partners = [
  {
    name: "MaaYuan",
    role: "社区项目示意",
    action: "访问官网 ↗",
    icon: "/icons/maa.png",
    href: "https://maayuan.com/",
    tone: "maa",
  },
  {
    name: "代号鸢 BWiki",
    role: "社区项目示意",
    action: "访问资料站 ↗",
    icon: "/icons/bwiki.png",
    href: "https://wiki.biligame.com/yuan/%E9%A6%96%E9%A1%B5",
    tone: "bwiki",
  },
  {
    name: "YuanAssist",
    role: "社区项目示意",
    action: "访问官网 ↗",
    icon: "/icons/yuanassist.png",
    href: "https://www.yuanassist.space/",
    tone: "yuanassist",
  },
  {
    name: "辟雍学府",
    role: "社区项目示意",
    action: "小程序入口",
    miniProgramUri: "#小程序://辟雍学府/OQufna612dh0plf",
    icon: "/icons/piyong.png",
    tone: "piyong",
  },
];

const destinations = [
  { name: "资料站", detail: "查阅与校对", symbol: "册", tone: "brown" },
  { name: "社区 App", detail: "随身浏览", symbol: "屏", tone: "orange" },
  { name: "自动化工具", detail: "辅助使用", symbol: "齿", tone: "blue" },
  { name: "社区项目", detail: "继续建设", symbol: "↗", tone: "red" },
];

const contributions = [
  {
    title: "密探资料",
    detail: "把BOX变成可随时调用的资料",
    tag: "补充",
    mark: "录",
    tone: "yellow",
  },
  {
    title: "背包数据",
    detail: "让物品获取可视化",
    tag: "归档",
    mark: "集",
    tone: "orange",
  },
  {
    title: "社区共建",
    detail: "每一位创作者都可以贡献自己的一份力",
    tag: "追踪",
    mark: "时",
    tone: "blue",
  },
  {
    title: "社区反馈",
    detail: "用户与管理员都可双向接收并回应信息",
    tag: "双向",
    mark: "问",
    tone: "red",
  },
];
</script>

<style scoped>
.promo-page {
  --promo-line: rgba(90, 70, 51, 0.22);
  --promo-soft-line: rgba(90, 70, 51, 0.13);
  --promo-muted: rgba(73, 59, 44, 0.68);
  min-height: 100vh;
  color: var(--ink);
}

main.promo-main {
  margin-left: 0;
}
.promo-wrap {
  width: min(100%, 1300px);
  margin: 0 auto;
  padding: 0 54px;
}
.promo-header {
  border-bottom: 1px solid var(--promo-soft-line);
}
.promo-header-inner {
  min-height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.promo-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.promo-brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 11px;
  color: var(--cream);
  background: var(--tea);
  font: 900 14px/1 var(--font-d);
  letter-spacing: 0.04em;
}
.promo-brand-name {
  font: 900 18px/1 var(--font-d);
  letter-spacing: 0.03em;
}
.promo-header-note {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--promo-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
}
.header-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
}
.header-code {
  padding-left: 12px;
  border-left: 1px solid var(--promo-line);
  color: var(--accent-strong);
  font: 800 10px/1 var(--font-d);
  letter-spacing: 0.14em;
}

.promo-hero {
  padding: 94px 0 112px;
}
.hero-intro {
  max-width: 650px;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--accent-strong);
  font: 800 11px/1.3 var(--font-d);
  letter-spacing: 0.15em;
}
.eyebrow span {
  color: var(--tea);
  font-size: 13px;
  letter-spacing: 0.04em;
}
h1,
h2,
h3,
p {
  overflow-wrap: anywhere;
}
.hero-intro h1 {
  margin-top: 25px;
  color: var(--tea);
  font: 900 clamp(50px, 5.5rem, 98px)/1.13 var(--font-s);
  letter-spacing: 0.035em;
}
h1 em,
h2 em {
  color: var(--accent);
  font-style: normal;
}
.hero-lede {
  max-width: 530px;
  margin-top: 28px;
  color: var(--promo-muted);
  font-size: 16px;
  line-height: 2;
}
.demo-notice {
  display: inline-flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 560px;
  margin-top: 26px;
  padding: 11px 14px;
  border-left: 3px solid var(--yellow-deep);
  background: rgba(255, 253, 246, 0.58);
  color: var(--promo-muted);
  font-size: 11px;
  line-height: 1.75;
}
.notice-mark {
  flex: none;
  color: var(--accent);
  font-size: 17px;
  line-height: 1.2;
}
.demo-notice strong {
  color: var(--tea);
}

.ecosystem-strip {
  margin-top: 62px;
  padding-top: 24px;
  border-top: 1px dashed var(--promo-line);
}
.ecosystem-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}
.ecosystem-heading > div,
.board-head > div,
.stage-hub > div,
.output-node > div,
.reuse-destination > div {
  min-width: 0;
}
.ecosystem-heading h2 {
  margin-top: 13px;
  color: var(--tea);
  font: 900 28px/1.25 var(--font-s);
  letter-spacing: 0.04em;
}
.ecosystem-heading p {
  margin-top: 9px;
  color: var(--promo-muted);
  font-size: 11px;
  line-height: 1.6;
}
.ecosystem-badge {
  flex: none;
  padding: 6px 9px;
  border: 1px solid var(--promo-line);
  border-radius: 4px;
  color: var(--accent-strong);
  font: 800 9px/1 var(--font-d);
  letter-spacing: 0.08em;
}
.ecosystem-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 23px;
}
.ecosystem-card {
  display: flex;
  min-width: 0;
  min-height: 94px;
  align-items: center;
  gap: 12px;
  padding: 13px;
  border: 1px solid var(--promo-line);
  border-top-width: 3px;
  border-radius: 9px;
  background: rgba(255, 253, 246, 0.72);
  color: inherit;
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}
.ecosystem-card:hover {
  background: var(--surface);
  transform: translateY(-2px);
}
.ecosystem-card:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
  background: var(--surface);
}
.ecosystem-card.maa {
  border-top-color: var(--yellow-deep);
}
.ecosystem-card.bwiki {
  border-top-color: var(--tea);
}
.ecosystem-card.yuanassist {
  border-top-color: var(--rouge);
}
.ecosystem-card.piyong {
  border-top-color: var(--accent);
}
.ecosystem-icon {
  display: block;
  flex: none;
  width: 45px;
  height: 45px;
  object-fit: contain;
  border-radius: 10px;
  background: var(--paper);
}
.ecosystem-card-copy {
  display: block;
  min-width: 0;
}
.ecosystem-card-name {
  display: block;
  color: var(--tea);
  font: 900 15px/1.3 var(--font-s);
  overflow-wrap: anywhere;
}
.ecosystem-card-role {
  display: block;
  margin-top: 4px;
  color: var(--promo-muted);
  font-size: 10px;
  line-height: 1.35;
}
.ecosystem-action {
  display: block;
  margin-top: 7px;
  color: var(--accent-strong);
  font: 800 9px/1.2 var(--font-d);
  letter-spacing: 0.03em;
  overflow-wrap: anywhere;
}
.ecosystem-card-uri {
  display: block;
  margin-top: 4px;
  color: var(--promo-muted);
  font: 700 8px/1.35 var(--font-b);
  overflow-wrap: anywhere;
}

.hero-flow {
  margin-top: 80px;
  padding: 24px 26px 30px;
  border: 1px solid var(--promo-line);
  border-radius: 18px;
  background: rgba(255, 253, 246, 0.42);
  box-shadow: 0 24px 46px -36px rgba(73, 59, 44, 0.48);
}
.flow-caption {
  display: flex;
  align-items: center;
  gap: 11px;
  color: var(--promo-muted);
  font: 800 10px/1 var(--font-d);
  letter-spacing: 0.14em;
}
.caption-line {
  width: 42px;
  border-top: 1px solid var(--accent);
}
.flow-caption span:last-child {
  color: var(--accent-strong);
}
.flow-lane {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) 68px minmax(
      190px,
      1.08fr
    ) 68px minmax(290px, 1.55fr);
  align-items: center;
  gap: 12px;
  margin-top: 22px;
}
.flow-node {
  position: relative;
  min-width: 0;
  border: 1px solid var(--promo-line);
  background: var(--surface);
}
.source-node {
  min-height: 184px;
  padding: 22px 20px;
  border-radius: 13px 13px 13px 4px;
}
.node-topline {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--promo-muted);
  font: 800 9px/1 var(--font-d);
  letter-spacing: 0.13em;
}
.node-icon {
  display: grid;
  width: 19px;
  height: 19px;
  place-items: center;
  border-radius: 50%;
  color: var(--tea);
  background: var(--yellow);
  font: 700 16px/1 var(--font-b);
}
.flow-node h2 {
  margin-top: 22px;
  color: var(--tea);
  font: 900 23px/1.2 var(--font-s);
  letter-spacing: 0.05em;
}
.flow-node p {
  margin-top: 10px;
  color: var(--promo-muted);
  font-size: 11px;
  line-height: 1.85;
}
.demo-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  max-width: 100%;
  padding: 4px 7px 3px;
  border: 1px solid var(--promo-line);
  border-radius: 4px;
  color: var(--accent-strong);
  background: rgba(239, 210, 142, 0.25);
  font: 800 8px/1 var(--font-d);
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.source-node .demo-label,
.hub-node .demo-label {
  position: absolute;
  right: 13px;
  bottom: 13px;
}
.flow-connector {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  color: var(--promo-muted);
  font: 700 9px/1 var(--font-b);
  white-space: nowrap;
}
.flow-connector i {
  position: relative;
  display: block;
  width: 100%;
  height: 1px;
  background: var(--accent);
}
.flow-connector i::after {
  position: absolute;
  right: 0;
  top: -3px;
  width: 7px;
  height: 7px;
  border-top: 1px solid var(--accent);
  border-right: 1px solid var(--accent);
  content: "";
  transform: rotate(45deg);
}
.hub-node {
  display: flex;
  min-height: 230px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-color: var(--tea);
  border-radius: 50%;
  background: var(--tea);
  color: var(--cream);
  text-align: center;
  box-shadow: 0 14px 26px -20px rgba(73, 59, 44, 0.85);
}
.hub-node .hub-core {
  position: relative;
  z-index: 2;
  display: grid;
  width: 66px;
  height: 66px;
  place-items: center;
  border: 1px solid var(--yellow);
  border-radius: 50%;
  color: var(--tea);
  background: var(--yellow);
  font: 900 20px/1 var(--font-d);
  letter-spacing: 0.04em;
}
.hub-node .node-type {
  position: relative;
  z-index: 2;
  margin-top: 18px;
  color: rgba(255, 248, 236, 0.7);
  font: 800 8px/1 var(--font-d);
  letter-spacing: 0.14em;
}
.hub-node h2 {
  position: relative;
  z-index: 2;
  margin-top: 7px;
  color: var(--cream);
  font-size: 22px;
}
.hub-node p {
  position: relative;
  z-index: 2;
  margin-top: 7px;
  color: rgba(255, 248, 236, 0.72);
}
.hub-ring {
  position: absolute;
  border: 1px solid rgba(239, 210, 142, 0.4);
  border-radius: 50%;
  pointer-events: none;
}
.ring-one {
  width: 170px;
  height: 170px;
}
.ring-two {
  width: 240px;
  height: 240px;
  border-color: rgba(239, 210, 142, 0.18);
}
.output-stack {
  display: grid;
  min-width: 0;
  gap: 8px;
}
.output-node {
  display: flex;
  min-height: 58px;
  align-items: center;
  gap: 11px;
  padding: 8px 10px;
  border-radius: 8px;
}
.output-node h2 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.03em;
}
.output-node p {
  margin-top: 3px;
  font-size: 10px;
  line-height: 1.4;
}
.output-node .demo-label {
  margin-left: auto;
}
.output-symbol,
.reuse-symbol {
  display: grid;
  flex: none;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  font: 900 13px/1 var(--font-s);
}
.yellow {
  color: var(--tea);
  background: var(--yellow);
}
.orange {
  color: var(--cream);
  background: var(--accent);
}
.blue {
  color: var(--tea);
  background: var(--mist);
}
.red {
  color: var(--cream);
  background: var(--rouge);
}
.brown {
  color: var(--cream);
  background: var(--tea);
}

.promo-section {
  border-top: 1px solid var(--promo-soft-line);
}
.builders-section {
  padding: 112px 0 125px;
  background: rgba(255, 253, 246, 0.3);
}
.builders-layout {
  display: grid;
  grid-template-columns: minmax(250px, 0.78fr) minmax(0, 1.22fr);
  align-items: center;
  gap: 86px;
}
.section-copy h2,
.reuse-heading h2 {
  margin-top: 22px;
  color: var(--tea);
  font: 900 clamp(38px, 3.8rem, 63px)/1.23 var(--font-s);
  letter-spacing: 0.04em;
}
.section-copy > p:not(.copy-note) {
  max-width: 400px;
  margin-top: 25px;
  color: var(--promo-muted);
  font-size: 15px;
  line-height: 2;
}
.quote-mark {
  margin-top: 25px;
  color: var(--yellow-deep);
  font: 900 54px/0.7 var(--font-s);
}
.copy-note {
  max-width: 360px;
  margin-top: 1px;
  color: var(--tea);
  font: 700 13px/1.8 var(--font-s);
}
.contribution-board {
  min-width: 0;
  padding: 28px 30px 23px;
  border: 1px solid var(--promo-line);
  border-radius: 15px;
  background: rgba(255, 253, 246, 0.72);
  box-shadow: 0 25px 55px -42px rgba(73, 59, 44, 0.65);
}
.board-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.board-kicker {
  color: var(--accent-strong);
  font: 800 9px/1.3 var(--font-d);
  letter-spacing: 0.13em;
}
.board-head h3 {
  margin-top: 9px;
  color: var(--tea);
  font: 900 22px/1.35 var(--font-s);
  letter-spacing: 0.04em;
}
.stamp {
  flex: none;
  padding: 6px 9px;
  border: 1px solid var(--rouge);
  color: var(--rouge);
  font: 800 9px/1 var(--font-d);
  letter-spacing: 0.09em;
  transform: rotate(4deg);
}
.board-rule {
  margin-top: 24px;
  border-top: 1px dashed var(--promo-line);
}
.contribution-row {
  display: grid;
  grid-template-columns: 24px 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 77px;
  border-bottom: 1px solid var(--promo-soft-line);
}
.contribution-index {
  color: var(--accent-strong);
  font: 800 10px/1 var(--font-d);
}
.contribution-seal {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid currentColor;
  border-radius: 50%;
  font: 900 14px/1 var(--font-s);
}
.contribution-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.contribution-body strong {
  color: var(--tea);
  font-size: 14px;
}
.contribution-body span {
  color: var(--promo-muted);
  font-size: 11px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.row-tag {
  padding: 4px 7px;
  border-radius: 4px;
  color: var(--promo-muted);
  background: var(--paper);
  font: 700 10px/1 var(--font-b);
}
.board-foot {
  display: flex;
  align-items: center;
  gap: 9px;
  padding-top: 20px;
  color: var(--promo-muted);
  font-size: 10px;
  line-height: 1.5;
}
.foot-dash {
  width: 28px;
  border-top: 1px solid var(--accent);
}

.reuse-section {
  padding: 112px 0 118px;
}
.reuse-heading {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.reuse-heading h2 {
  margin-top: 19px;
}
.reuse-heading p {
  margin-top: 16px;
  color: var(--promo-muted);
  font-size: 15px;
}
.reuse-stage {
  display: grid;
  grid-template-columns: minmax(130px, 0.75fr) 55px minmax(
      280px,
      1.3fr
    ) 55px minmax(310px, 1.65fr);
  align-items: center;
  gap: 14px;
  margin-top: 56px;
  padding: 26px 28px;
  border: 1px solid var(--promo-line);
  border-radius: 17px;
  background: rgba(255, 253, 246, 0.4);
}
.stage-note {
  display: flex;
  min-height: 144px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 7px;
  padding: 18px;
  border-left: 3px solid var(--yellow-deep);
  background: rgba(239, 210, 142, 0.27);
}
.note-index {
  color: var(--accent-strong);
  font: 900 11px/1 var(--font-d);
}
.stage-note strong {
  color: var(--tea);
  font: 900 20px/1.25 var(--font-s);
}
.stage-note small,
.stage-hub small,
.reuse-destination small {
  color: var(--promo-muted);
  font-size: 10px;
  line-height: 1.5;
}
.stage-note .demo-label {
  margin-top: 6px;
}
.stage-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--promo-muted);
  font-size: 10px;
  white-space: nowrap;
}
.stage-connector i {
  position: relative;
  display: block;
  width: 100%;
  border-top: 1px solid var(--accent);
}
.stage-connector i::after {
  position: absolute;
  right: -1px;
  top: -4px;
  width: 7px;
  height: 7px;
  border-top: 1px solid var(--accent);
  border-right: 1px solid var(--accent);
  content: "";
  transform: rotate(45deg);
}
.stage-hub {
  position: relative;
  display: flex;
  min-height: 144px;
  align-items: center;
  gap: 17px;
  padding: 23px 25px;
  border: 1px solid var(--tea);
  border-radius: 12px;
  color: var(--cream);
  background: var(--tea);
}
.stage-hub-mark {
  display: grid;
  flex: none;
  width: 61px;
  height: 61px;
  place-items: center;
  border: 1px solid var(--yellow);
  border-radius: 50%;
  color: var(--tea);
  background: var(--yellow);
  font: 900 18px/1 var(--font-d);
}
.stage-hub .node-type {
  display: block;
  color: rgba(255, 248, 236, 0.65);
  font: 800 8px/1.3 var(--font-d);
  letter-spacing: 0.13em;
}
.stage-hub strong {
  display: block;
  margin-top: 8px;
  color: var(--cream);
  font: 900 23px/1.2 var(--font-s);
}
.stage-hub small {
  display: block;
  margin-top: 6px;
  color: rgba(255, 248, 236, 0.74);
}
.stage-hub .demo-label {
  position: absolute;
  right: 14px;
  bottom: 13px;
  border-color: rgba(255, 248, 236, 0.4);
  color: var(--yellow);
  background: transparent;
}
.reuse-destinations {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.reuse-destination {
  display: grid;
  grid-template-columns: 20px 31px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 32px;
}
.reuse-number {
  color: var(--accent-strong);
  font: 800 9px/1 var(--font-d);
}
.reuse-symbol {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  font-size: 11px;
}
.reuse-destination strong {
  display: block;
  color: var(--tea);
  font-size: 12px;
}
.reuse-destination small {
  display: block;
  margin-top: 2px;
  font-size: 9px;
}
.reuse-destination .demo-label {
  padding: 3px 5px 2px;
}
.reuse-footnote {
  display: flex;
  max-width: 720px;
  align-items: flex-start;
  gap: 12px;
  margin: 51px auto 0;
  padding-top: 20px;
  border-top: 1px dashed var(--promo-line);
}
.footnote-mark {
  color: var(--accent);
  font-size: 16px;
  line-height: 1.7;
}
.reuse-footnote p {
  color: var(--promo-muted);
  font-size: 12px;
  line-height: 1.9;
}
.reuse-footnote strong {
  color: var(--tea);
}

.promo-footer {
  border-top: 1px solid var(--promo-soft-line);
  background: var(--tea);
  color: var(--cream);
}
.footer-inner {
  display: flex;
  min-height: 166px;
  align-items: center;
  justify-content: space-between;
  gap: 26px;
}
.footer-kicker {
  display: block;
  margin-bottom: 11px;
  color: var(--yellow);
  font: 800 9px/1 var(--font-d);
  letter-spacing: 0.16em;
}
.footer-inner strong {
  font: 900 28px/1.25 var(--font-s);
  letter-spacing: 0.03em;
}
.footer-inner strong span {
  color: var(--yellow);
}
.footer-note {
  color: rgba(255, 248, 236, 0.68);
  font-size: 11px;
  letter-spacing: 0.12em;
}

@media (max-width: 1050px) {
  .promo-wrap {
    padding-right: 34px;
    padding-left: 34px;
  }
  .flow-lane {
    grid-template-columns: minmax(150px, 1fr) 44px minmax(
        170px,
        1fr
      ) 44px minmax(250px, 1.45fr);
    gap: 8px;
  }
  .builders-layout {
    gap: 45px;
  }
  .reuse-stage {
    grid-template-columns: minmax(120px, 0.7fr) 38px minmax(
        240px,
        1.2fr
      ) 38px minmax(260px, 1.45fr);
    gap: 9px;
    padding: 20px;
  }
}

@media (max-width: 850px) {
  .promo-header-inner {
    min-height: 67px;
  }
  .promo-header-note {
    gap: 6px;
    font-size: 9px;
    letter-spacing: 0.05em;
  }
  .header-code {
    display: none;
  }
  .promo-wrap {
    padding-right: 20px;
    padding-left: 20px;
  }
  .promo-hero {
    padding: 60px 0 70px;
  }
  .hero-intro h1 {
    margin-top: 20px;
    font-size: clamp(45px, 4.25rem, 68px);
  }
  .hero-lede {
    margin-top: 21px;
    font-size: 14px;
    line-height: 1.9;
  }
  .demo-notice {
    margin-top: 20px;
    font-size: 10px;
  }
  .ecosystem-strip {
    margin-top: 46px;
    padding-top: 20px;
  }
  .ecosystem-heading {
    align-items: flex-start;
    gap: 14px;
  }
  .ecosystem-heading h2 {
    margin-top: 11px;
    font-size: 23px;
  }
  .ecosystem-heading p {
    max-width: 250px;
    font-size: 10px;
  }
  .ecosystem-badge {
    margin-top: 1px;
  }
  .ecosystem-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 17px;
  }
  .ecosystem-card {
    min-height: 104px;
    align-items: start;
    gap: 9px;
    padding: 11px 9px;
  }
  .ecosystem-icon {
    width: 38px;
    height: 38px;
    border-radius: 8px;
  }
  .ecosystem-card-name {
    font-size: 13px;
    line-height: 1.35;
  }
  .ecosystem-card-role {
    margin-top: 3px;
    font-size: 9px;
  }
  .ecosystem-action {
    margin-top: 6px;
    font-size: 8px;
  }
  .hero-flow {
    margin-top: 48px;
    padding: 19px 15px 21px;
  }
  .flow-lane {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    margin-top: 18px;
  }
  .source-node {
    min-height: 142px;
  }
  .hub-node {
    align-self: center;
    width: min(100%, 218px);
    min-height: 218px;
    margin: 4px 0;
  }
  .flow-connector {
    width: 100%;
    min-height: 35px;
    justify-content: center;
    flex-direction: row;
    gap: 10px;
  }
  .flow-connector i {
    width: 72px;
    transform: rotate(90deg);
  }
  .flow-connector i::after {
    right: -1px;
  }
  .output-stack {
    width: 100%;
  }
  .output-node {
    min-height: 52px;
  }
  .builders-section,
  .reuse-section {
    padding: 72px 0 80px;
  }
  .builders-layout {
    display: block;
  }
  .section-copy h2 {
    font-size: clamp(38px, 3.375rem, 54px);
  }
  .reuse-heading h2 {
    font-size: clamp(30px, 2.625rem, 42px);
  }
  .section-copy > p:not(.copy-note) {
    font-size: 14px;
  }
  .contribution-board {
    margin-top: 42px;
    padding: 22px 17px 19px;
  }
  .board-head h3 {
    font-size: 18px;
  }
  .contribution-row {
    grid-template-columns: 20px 30px minmax(0, 1fr) auto;
    gap: 8px;
    min-height: 73px;
  }
  .contribution-seal {
    width: 30px;
    height: 30px;
    font-size: 12px;
  }
  .contribution-body strong {
    font-size: 12px;
  }
  .contribution-body span {
    font-size: 10px;
  }
  .row-tag {
    font-size: 9px;
  }
  .board-foot {
    align-items: flex-start;
    font-size: 9px;
  }
  .reuse-heading {
    align-items: flex-start;
    text-align: left;
  }
  .reuse-heading p {
    font-size: 13px;
    line-height: 1.8;
  }
  .reuse-stage {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    margin-top: 37px;
    padding: 15px;
  }
  .stage-note {
    min-height: 110px;
  }
  .stage-connector {
    min-height: 39px;
    flex-direction: row;
    justify-content: center;
    gap: 10px;
  }
  .stage-connector i {
    width: 64px;
    transform: rotate(90deg);
  }
  .stage-hub {
    min-height: 130px;
    padding: 18px 17px;
  }
  .stage-hub strong {
    font-size: 20px;
  }
  .reuse-destinations {
    margin-top: 7px;
    padding: 10px 4px 4px;
    border-top: 1px dashed var(--promo-line);
  }
  .reuse-destination {
    min-height: 38px;
  }
  .reuse-footnote {
    margin-top: 37px;
  }
  .footer-inner {
    min-height: 140px;
    align-items: flex-start;
    justify-content: center;
    flex-direction: column;
    gap: 15px;
  }
  .footer-inner strong {
    font-size: 24px;
  }
}

@media print {
  .promo-page {
    color-adjust: exact;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .promo-header {
    position: relative;
  }
}
</style>
