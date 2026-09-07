<template>
  <div class="promo-page">
    <header class="site-header">
      <div class="wrap header-inner">
        <a class="brand" href="#top" aria-label="YuanHub 宣传页顶部">
          <span class="brand-mark">YH</span>
          <span class="brand-copy"><b>YuanHub</b><small>鸢鸢相抱</small></span>
        </a>
        <nav class="header-nav" aria-label="宣传页导航">
          <a href="#product">能做什么</a>
          <a href="#share">神秘代码</a>
          <a href="#privacy">隐私授权</a>
          <a href="#ecosystem">社区生态</a>
          <a href="#community-build">社区共建</a>
        </nav>
        <!-- PLACEHOLDER: 把正式 YuanHub 主站 URL 填到这里 -->
        <a class="header-cta placeholder-link" href="#final-cta" data-placeholder="MAIN_APP_URL">
          进入 YuanHub <span>↗</span>
        </a>
      </div>
    </header>

    <main id="top">
      <section class="hero-section">
        <div class="wrap hero-grid">
          <div class="hero-copy">
            <div class="eyebrow"><span>01</span> YOUR GAME ARCHIVE</div>
            <h1>把你的游戏资料，<br /><em>整理成真正属于你的档案</em></h1>
            <p class="hero-lede">
              密探、库存、星石与多个游戏档案分别维护。需要时生成神秘代码把 BOX 分享给朋友，
              也可以把 YuanHub 中你指定的数据开放给 MaaYuan 等社区工具使用。
            </p>
            <div class="hero-actions">
              <a class="primary-btn" href="#product">看看 YuanHub 能做什么 <span>↓</span></a>
              <a class="secondary-btn" href="#share">神秘代码怎么玩 <span>→</span></a>
            </div>
            <div class="hero-trust">
              <span><i>✓</i> 用户自行录入</span>
              <span><i>✓</i> 不默认公开</span>
              <span><i>✓</i> 按档案与权限开放</span>
            </div>
          </div>

          <div class="hero-demo-wrap" aria-label="YuanHub 产品流程演示">
            <div class="demo-browser hero-browser">
              <div class="browser-bar">
                <span class="browser-dots"><i></i><i></i><i></i></span>
                <span class="browser-title">YuanHub · 我的密探</span>
                <span class="demo-badge">自动演示</span>
              </div>
              <div class="browser-body hero-demo-body">
                <div class="demo-sidebar">
                  <div class="mini-brand">YH</div>
                  <span class="side-line active"></span>
                  <span class="side-line"></span>
                  <span class="side-line"></span>
                  <span class="side-line short"></span>
                </div>
                <div class="demo-workspace">
                  <div class="demo-account">
                    <div><small>当前游戏档案</small><strong>主档案 · 如鸢</strong></div>
                    <span class="account-switch">切换⌄</span>
                  </div>
                  <div class="operator-toolbar">
                    <div><small>密探养成</small><b>当前养成</b></div>
                    <button class="share-trigger" type="button" tabindex="-1">分享当前 BOX</button>
                  </div>
                  <div class="operator-grid">
                    <article
                      v-for="(agent, index) in heroAgents"
                      :key="agent.id"
                      class="operator-card"
                      :class="`card-${String.fromCharCode(97 + index)}`"
                    >
                      <img class="portrait" :src="agent.avatar" :alt="`${agent.name} 头像`" />
                      <div class="operator-copy">
                        <strong>{{ agent.name }}</strong>
                        <span>化极 {{ huajiLabel(growthFor(agent).starLevel) }} · 修为 {{ growthFor(agent).elite }} · {{ agent.prof }} · {{ agent.subProf }}</span>
                      </div>
                      <div class="level-line">
                        <b>Lv.<span class="level-number">{{ growthFor(agent).level }}</span></b>
                        <em>{{ levelComplete(growthFor(agent).level) ? '已满级' : growthStateLabel(growthFor(agent).growthState) }}</em>
                      </div>
                      <div v-if="awakened(growthFor(agent).starLevel)" class="awakening-chip">✦ 已觉醒</div>
                    </article>
                  </div>

                  <div class="share-popover">
                    <span class="popover-kicker">神秘代码</span>
                    <strong>YH-A7K9Q2</strong>
                    <small>只分享客观养成数据</small>
                    <div><span>复制代码</span><span>复制链接</span></div>
                  </div>

                  <div class="share-view-overlay">
                    <span class="overlay-kicker">公开查看 · 无需登录</span>
                    <b>密探 BOX</b>
                    <small>神秘代码 YH-A7K9Q2</small>
                    <div class="overlay-cards">
                      <i v-for="agent in sharedAgents.slice(0, 4)" :key="`overlay-${agent.id}`">
                        <img :src="agent.avatar" :alt="`${agent.name} 头像`" />
                      </i>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- PLACEHOLDER: 未来可用真实录屏/截图替换上方 CSS 演示 -->
            <div class="media-placeholder compact-placeholder">
              <span>REAL PRODUCT MEDIA PLACEHOLDER</span>
              <small>建议替换：10 秒真实录屏 · 账号切换 → 养成 → 分享 BOX</small>
            </div>
          </div>
        </div>
      </section>

      <section id="product" class="section product-section">
        <div class="wrap">
          <div class="section-heading split-heading">
            <div>
              <div class="eyebrow"><span>02</span> WHAT YUANHUB DOES</div>
              <h2>一个账号，<em>把这些都整理起来</em></h2>
            </div>
            <p>先看真实能力，再理解“社区数据层”。这里展示的功能均对应 YuanHub 当前项目页面；演示数据为占位内容。</p>
          </div>

          <div class="feature-shell">
            <div class="feature-tabs" role="tablist" aria-label="YuanHub 核心功能">
              <button v-for="feature in features" :key="feature.id" type="button" role="tab"
                :aria-selected="activeFeature === feature.id" :class="{ active: activeFeature === feature.id }"
                @click="selectFeature(feature.id)">
                <span>{{ feature.index }}</span><b>{{ feature.name }}</b><small>{{ feature.short }}</small>
              </button>
            </div>

            <div class="feature-stage">
              <div class="feature-copy-panel">
                <span class="feature-kicker">{{ currentFeature.kicker }}</span>
                <h3>{{ currentFeature.title }}</h3>
                <p>{{ currentFeature.description }}</p>
                <div v-if="activeFeature === 'star'" class="feature-author-badge"><span>©</span> 独立创作 · 著作权归作者 <b>Drifty Yan</b> 所有</div>
                <ul>
                  <li v-for="point in currentFeature.points" :key="point">{{ point }}</li>
                </ul>
              </div>

              <div class="feature-demo-panel">
                <div v-if="activeFeature === 'operator'" class="feature-visual operator-visual">
                  <div class="visual-top"><b>密探养成</b><span>主档案 · 如鸢</span></div>
                  <div class="mini-card-grid">
                    <div
                      v-for="(agent, index) in sharedAgents.slice(0, 4)"
                      :key="`mini-${agent.id}`"
                      class="mini-op-card"
                      :class="{ owned: index === 0 }"
                    >
                      <i><img :src="agent.avatar" :alt="`${agent.name} 头像`" /></i>
                      <b>{{ agent.name }}</b>
                      <span>{{ huajiLabel(growthFor(agent).starLevel) }}</span>
                      <em>
                        Lv.{{ growthFor(agent).level }} · 修为 {{ growthFor(agent).elite }}
                        <template v-if="levelComplete(growthFor(agent).level)"> · 已满级</template>
                        <template v-if="eliteComplete(growthFor(agent).level, growthFor(agent).elite)"> · 修为已满</template>
                        <template v-if="awakened(growthFor(agent).starLevel)"> · 已觉醒</template>
                      </em>
                    </div>
                  </div>
                  <div class="visual-status"><span></span> 养成状态与卡片信息会跟随你的记录更新</div>
                </div>

                <div v-else-if="activeFeature === 'inventory'" class="feature-visual inventory-visual">
                  <div class="visual-top"><b>广陵库房</b><span>清点 · 归档 · 溯源</span></div>
                  <div class="inventory-total"><small>白金币</small><strong><span>1,240</span><i>+300</i></strong><em>1,540</em></div>
                  <div class="bar-chart"><i style="height:30%"></i><i style="height:46%"></i><i style="height:38%"></i><i style="height:66%"></i><i style="height:84%"></i><i style="height:72%"></i><i style="height:92%"></i></div>
                  <div class="inventory-row"><span>本周获得</span><b>+520</b><small>较上周 +18%</small></div>
                </div>

                <div v-else-if="activeFeature === 'star'" class="feature-visual star-visual">
                  <div class="visual-top"><b>星石识别</b><span>截图 → OCR → 人工核对</span></div>
                  <div class="star-author-line"><span>©</span> 独立创作 · 著作权归作者 <b>Drifty Yan</b> 所有</div>
                  <div class="ocr-layout">
                    <div class="fake-shot"><span class="scan-line"></span><i></i><i></i><i></i><small>截图占位符</small></div>
                    <div class="ocr-arrow">→</div>
                    <div class="star-result"><article><i>✦</i><div><b>天府</b><span>攻击 · 暴击</span></div></article><article><i>✦</i><div><b>七杀</b><span>生命 · 增伤</span></div></article><article><i>✦</i><div><b>破军</b><span>攻击 · 穿透</span></div></article></div>
                  </div>
                  <!-- PLACEHOLDER: 替换为真实游戏截图 + YuanHub OCR 结果截图 -->
                </div>

                <div v-else class="feature-visual connection-visual">
                  <div class="visual-top"><b>应用连接</b><span>个人中心</span></div>
                  <div class="connection-card">
                    <img src="/icons/maa.png" alt="MaaYuan 图标" />
                    <div><b>MaaYuan</b><span>连接至：主账号 · 如鸢</span></div>
                    <em>已连接</em>
                  </div>
                  <div class="scope-pills"><span>✓ 读取密探</span><span>✓ 写入密探</span><span>✓ 读取库存</span><span>✓ 写入库存</span></div>
                  <div class="token-line"><small>YuanHub 连接码</small><code>yh_live_••••••••••</code><button type="button" tabindex="-1">复制</button></div>
                </div>

                <div class="stage-placeholder-tag">DEMO UI · 真实素材待替换</div>
              </div>
            </div>
          </div>

          <aside class="release-disclaimer" aria-label="版本与展示说明">
            <span class="release-disclaimer-mark">*</span>
            <div>
              <b>版本与展示说明</b>
              <p>版本效果会分批次开发，以最终上线效果为准。页面中的展示效果图、Demo UI 与交互示意仅用于说明产品方向与功能体验，具体功能、界面与数据展示请以实际上线版本为准。</p>
            </div>
          </aside>
        </div>
      </section>

      <section id="share" class="section share-section">
        <div class="wrap share-layout">
          <div class="share-copy section-copy">
            <div class="eyebrow"><span>03</span> SHARE WITH FRIENDS</div>
            <h2>无需登录，<br /><em>也能把 BOX 分享给朋友</em></h2>
            <p>为当前游戏档案生成一个神秘代码。朋友、攻略作者或社区伙伴拿到代码后，无需登录即可查看你主动公开的客观养成信息。</p>
            <p class="share-value-line"><strong>不光 BOX 完整</strong>，等级、修为、命盘、生命、攻击数值也能无损查询。</p>
            <div class="privacy-note"><span>🔒</span><div><b>不会一起分享</b><small>备注、特别关注、养成目标、登录信息与其他私有内容。</small></div></div>
          </div>

          <div class="share-animation-stage">
            <div class="share-phone owner-panel">
              <span class="panel-label">我的 YuanHub</span>
              <b>分享当前密探 BOX</b>
              <small>主档案 · 如鸢</small>
              <div class="mystery-code"><span>神秘代码</span><strong>7K4P-M9X2</strong></div>
              <button type="button" tabindex="-1">复制代码</button>
            </div>
            <div class="code-flight" aria-hidden="true"><span>7K4P-M9X2</span><i></i></div>
            <div class="share-phone visitor-panel">
              <span class="panel-label">对方打开 YuanHub</span>
              <b>输入神秘代码</b>
              <div class="fake-input"><span>7K4P-M9X2</span><em>查看</em></div>
              <div class="visitor-box">
                <article v-for="agent in sharedAgents" :key="`visitor-${agent.id}`" class="visitor-card">
                  <i><img :src="agent.avatar" :alt="`${agent.name} 头像`" /></i>
                  <div class="visitor-card-copy">
                    <b>{{ agent.name }}</b>
                    <span>{{ huajiLabel(growthFor(agent).starLevel) }}</span>
                    <small>Lv.{{ growthFor(agent).level }} · 修为 {{ growthFor(agent).elite }}</small>
                  </div>
                </article>
              </div>
              <div class="visitor-detail-line"><span>命盘</span><span>攻击</span><span>生命</span><em>完整只读查询</em></div>
              <small>无需登录 · 只读查看</small>
            </div>
          </div>
        </div>
      </section>

      <section id="privacy" class="section privacy-section">
        <div class="wrap">
          <div class="section-heading centered-heading">
            <div class="eyebrow"><span>04</span> YOU DECIDE THE FLOW</div>
            <h2>你的数据什么时候流动，<em>由你决定</em></h2>
            <p>YuanHub 展示和流转的是你在 YuanHub 中维护的档案数据。社区工具只能使用你主动创建的连接，并且只能使用指定档案与明确开放范围内的数据。</p>
          </div>

          <div class="permission-demo">
            <div class="permission-card">
              <div class="permission-head"><img src="/icons/maa.png" alt="MaaYuan 图标" /><div><small>连接应用</small><b>MaaYuan</b></div><span>主档案 · 如鸢</span></div>
              <div class="permission-list">
                <label v-for="scope in scopes" :key="scope.id" :class="{ disabled: !scope.enabled }">
                  <span><b>{{ scope.name }}</b><small>{{ scope.detail }}</small></span>
                  <button type="button" :aria-pressed="scope.enabled" @click="scope.enabled = !scope.enabled"><i></i></button>
                </label>
              </div>
            </div>
            <div class="permission-lines" aria-hidden="true">
              <span v-for="scope in scopes" :key="`line-${scope.id}`" :class="{ off: !scope.enabled }"><i></i><em>{{ scope.enabled ? '允许' : '已断开' }}</em></span>
            </div>
            <div class="permission-result">
              <span class="panel-label">第三方实际可用</span>
              <article v-for="scope in scopes" :key="`result-${scope.id}`" :class="{ off: !scope.enabled }"><i>{{ scope.enabled ? '✓' : '×' }}</i><div><b>{{ scope.name }}</b><small>{{ scope.enabled ? '可访问' : '无权限' }}</small></div></article>
            </div>
          </div>

          <div class="privacy-principles">
            <article><span>01</span><b>不默认公开</b><p>个人记录由用户自己维护。除主动分享或授权外，不因为录入 YuanHub 就自动公开。</p></article>
            <article><span>02</span><b>按子账号隔离</b><p>密探、库存和第三方连接都绑定具体游戏子账号，不需要把所有账号一起交出去。</p></article>
            <article><span>03</span><b>按权限授权</b><p>连接码对应明确 scope。需要什么能力，就只授予什么能力，并可随时停止连接。</p></article>
          </div>
        </div>
      </section>

      <section id="ecosystem" class="section ecosystem-section">
        <div class="wrap">
          <div class="section-heading split-heading">
            <div>
              <div class="eyebrow"><span>05</span> ONE ARCHIVE, MANY USES</div>
              <h2>一次整理，<em>多处使用</em></h2>
            </div>
            <p>当玩家已经有一份结构化档案，不同社区项目就可以在用户授权和各自规则允许的范围内，从同一个起点继续建设。</p>
          </div>

          <div class="ecosystem-flow">
            <div class="flow-source">
              <span class="flow-label">USER ARCHIVE</span>
              <b>我的游戏档案</b>
              <div><i>密</i><i>库</i><i>星</i></div>
            </div>
            <div class="flow-line line-in"><span class="data-packet">Lv.80 · ★★★★★</span></div>
            <div class="flow-hub"><span>YH</span><b>YuanHub</b><small>整理 · 保存 · 授权</small></div>
            <div class="flow-line line-out"><span class="data-packet packet-two">密探 / 库存</span></div>
            <div class="partner-stack">
              <a v-for="partner in partners" :key="partner.name" class="partner-card" :href="partner.href || undefined" :target="partner.href ? '_blank' : undefined" :rel="partner.href ? 'noreferrer' : undefined">
                <img :src="partner.icon" :alt="`${partner.name} 图标`" />
                <div><b>{{ partner.name }}</b><small>{{ partner.scenario }}</small></div>
                <span>{{ partner.status }}</span>
              </a>
            </div>
          </div>

          <p class="ecosystem-disclaimer">生态项目与具体接入能力需以实际合作、项目文档和授权范围为准。这里的流转动画用于解释 YuanHub 的产品方向，不代表所有项目均已完成正式接入。</p>
        </div>
      </section>

      <section id="community-build" class="section community-build-section">
        <div class="wrap">
          <div class="section-heading split-heading community-build-heading">
            <div>
              <div class="eyebrow"><span>06</span> BUILD WITH YUANHUB</div>
              <h2>你做的好东西，<br /><em>也可以在 YuanHub 继续生长</em></h2>
            </div>
            <p>如果你为《如鸢》《代号鸢》玩家开发了实用工具、数据整理功能、计算器或新的档案玩法，我们欢迎原创作者与 YuanHub 一起把它做得更完整。加入 YuanHub，不等于把作品著作权交给 YuanHub。</p>
          </div>

          <div class="community-showcase">
            <div class="community-showcase-head">
              <div>
                <span class="community-kicker">COMMUNITY ORIGINALS</span>
                <h3>已经在 YuanHub 生长起来的独立创作</h3>
              </div>
              <p>平台提供账号、档案、数据与展示基础设施；作者的名字和独立创作归属继续被明确保留。</p>
            </div>
            <div class="community-author-grid">
              <article class="community-author-card">
                <span class="community-author-mark">✦</span>
                <div>
                  <small>独立创作 · 已加入 YuanHub</small>
                  <h4>星石识别 / 星石养成</h4>
                  <p>从截图识别、人工核对，到星石档案与养成管理。</p>
                </div>
                <strong>Drifty Yan</strong>
              </article>
              <article class="community-author-card">
                <span class="community-author-mark">账</span>
                <div>
                  <small>独立创作 · 已加入 YuanHub</small>
                  <h4>广陵账房</h4>
                  <p>面向礼包、资源价值与购买决策的社区计算工具。</p>
                </div>
                <strong>binary</strong>
              </article>
            </div>
          </div>

          <div class="community-paths">
            <article class="community-path-card">
              <span class="community-path-index">A</span>
              <div class="community-path-copy">
                <small>CONTRIBUTE A FEATURE</small>
                <h3>把原创功能加入 YuanHub</h3>
                <p>适合已经做出计算器、规划器、数据工具或新玩法的个人作者与小团队。你负责创意与核心实现，YuanHub 可以承接账号、档案、数据交换、统一入口与部署基础设施。</p>
                <ul>
                  <li>作者署名不会因为加入 YuanHub 而消失</li>
                  <li>原创核心逻辑与作品归属按实际约定保留</li>
                  <li>一个人开发的小工具也欢迎来聊</li>
                </ul>
              </div>
              <a class="community-path-link" href="#community-principles">了解共建原则 <span>→</span></a>
            </article>

            <article class="community-path-card">
              <span class="community-path-index">B</span>
              <div class="community-path-copy">
                <small>CONNECT YOUR APP</small>
                <h3>让你的项目连接 YuanHub</h3>
                <p>不必把项目并入 YuanHub。已有网站、App、Bot 或自动化工具，可以在用户授权后，通过 YuanHub OpenAPI 使用指定游戏档案中的数据。</p>
                <ul>
                  <li>连接绑定具体游戏档案</li>
                  <li>按 scope 授予最小权限</li>
                  <li>用户可以随时停止连接</li>
                </ul>
              </div>
              <a class="community-path-link" href="https://github.com/MrSnake0208/YuanHub/blob/main/docs/api-contract.md" target="_blank" rel="noreferrer">查看开发者接口文档 <span>↗</span></a>
            </article>
          </div>

          <div class="community-dev-note">
            <div><span>直接参与 YuanHub 开发</span><p>前端、后端、设计、文档与数据整理贡献都欢迎。想直接参与项目建设，可以从公开仓库开始了解当前实现。</p></div>
            <a href="https://github.com/MrSnake0208/YuanHub" target="_blank" rel="noreferrer">前往 GitHub <span>↗</span></a>
          </div>

          <div id="community-principles" class="community-principles">
            <article class="community-welcome-card">
              <span class="community-kicker">WELCOME</span>
              <h3>我们欢迎这些作品</h3>
              <ul>
                <li>玩家真正会用的原创工具与数据功能</li>
                <li>对已有需求的独立实现、新算法或新交互</li>
                <li>在许可证允许范围内进行的合法二次开发</li>
                <li>有明确来源与授权的数据整理成果</li>
                <li>个人作者、小团队、开源或闭源项目</li>
              </ul>
            </article>

            <article class="community-integrity-card">
              <span class="community-kicker">CREATE WITH RESPECT</span>
              <h3>尊重创作，是共建的前提</h3>
              <p>功能目标相似，本身不等于抄袭。独立实现、不同算法或重新设计的作品仍然欢迎；我们关注的是实现来源和权利来源是否透明。</p>
              <div class="integrity-reject-list">
                <span>拒绝搬运</span>
                <span>拒绝洗稿</span>
                <span>拒绝换皮冒充原创</span>
                <span>拒绝去除原作者署名</span>
                <span>拒绝来源与授权不清</span>
              </div>
              <small>提交或接入时，应如实说明第三方代码、素材、数据与原项目来源。YuanHub 可对来源不清或存在可信权利争议的内容暂停展示或接入。</small>
            </article>
          </div>

          <div class="community-process" aria-label="社区共建流程">
            <span>01 提交想法</span><i>→</i>
            <span>02 来源检查</span><i>→</i>
            <span>03 产品 / 技术评估</span><i>→</i>
            <span>04 联调</span><i>→</i>
            <span>05 上线并保留署名</span>
          </div>
        </div>
      </section>

      <section class="section roadmap-section">
        <div class="wrap roadmap-layout">
          <div class="section-copy">
            <div class="eyebrow"><span>07</span> GROWING WITH THE COMMUNITY</div>
            <h2>YuanHub，<br /><em>还会继续生长</em></h2>
            <p>已经上线的能力与未来构想分开呈现，让宣传页不再把“当前功能”和“概念设想”混在一起。</p>
          </div>
          <div class="roadmap-board">
            <article class="roadmap-row current"><span>NOW</span><div><b>当前功能</b><p>密探档案 · BOX 分享 · 库存 · 星石 · 广陵账房（礼包计算） · 应用连接</p><small class="roadmap-credit">© 独立创作 · 星石识别与星石养成著作权归作者 <b>Drifty Yan</b> 所有</small><small class="roadmap-credit">© 独立创作 · 广陵账房著作权归作者 <b>binary</b> 所有</small></div><em>已上线 / 项目已有</em></article>
            <article class="roadmap-row next"><span>NEXT</span><div><b>继续完善</b><p>养成规划与更多跨页面联动体验</p></div><em>持续迭代</em></article>
            <article class="roadmap-row future"><span>FUTURE</span><div><b>史君小铺</b><p>发布关卡与可用队伍需求，结合分享代码与 BOX 做需求匹配。</p></div><em>规划占位</em></article>
            <!-- PLACEHOLDER: 在此继续追加未来 Roadmap 项 -->
          </div>
        </div>
      </section>

      <section id="legal" class="section legal-section">
        <div class="wrap legal-layout">
          <div class="section-copy legal-heading">
            <div class="eyebrow"><span>08</span> COPYRIGHT &amp; NON-COMMERCIAL</div>
            <h2>版权声明与<em>非商业说明</em></h2>
            <p>尊重游戏权利人、社区合作方与内容创作者的权利，也把 YuanHub 自行创作内容和社区共建作品的许可边界说明清楚。</p>
          </div>

          <div class="legal-card">
            <article>
              <span class="legal-index">01</span>
              <div>
                <h3>第三方名称、商标与游戏素材</h3>
                <p>本网站所展示的《如鸢》《代号鸢》相关游戏名称、角色、图片、角色立绘、图标、文本原文及游戏资料，仅用于更好地展示、整理与说明游戏信息。其相关版权及知识产权归《如鸢》/上海灵犀互动娱乐有限公司及《代号鸢》/Qookka Games Inc. 等相关权利方所有；YuanHub 不主张对上述第三方游戏素材享有著作权或其他知识产权。</p>
                <p>部分资料或素材可能由 BWiki 等社区合作项目依据合作约定提供或协助整理，其使用范围以对应授权与合作约定为准。</p>
              </div>
            </article>

            <article>
              <span class="legal-index">02</span>
              <div>
                <h3>YuanHub 自创内容许可</h3>
                <p>除另有声明以及第三方素材、程序源码之外，本站由 YuanHub 自行创作并有权许可的宣传文案、说明文字与原创视觉内容，采用 <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.zh" target="_blank" rel="noreferrer">知识共享 署名-非商业性使用 4.0 国际许可协议（CC BY-NC 4.0）</a>进行许可。</p>
                <p>转载或再传播上述可许可内容时，请注明来源为 YuanHub，并保留相应版权与许可说明以及指向原页面的链接；未经另行许可，不得将该部分内容或其衍生作品用于商业目的。</p>
                <p>站内另行标注作者或权利归属的独立创作内容，不属于上述 YuanHub 自创内容许可范围。其中，星石识别与星石养成相关独立创作内容的著作权归作者 <b>Drifty Yan</b> 所有；广陵账房（礼包计算）相关独立创作内容的著作权归作者 <b>binary</b> 所有。</p>
              </div>
            </article>

            <article>
              <span class="legal-index">03</span>
              <div>
                <h3>社区共建、署名与来源</h3>
                <p>原创作者将作品加入 YuanHub 或与 YuanHub 进行功能共建，不当然意味着作者将著作权、署名权或其他权利转让给 YuanHub；具体许可、维护与使用边界以作者声明、开源许可证或双方另行约定为准。</p>
                <p>YuanHub 欢迎相似需求的独立实现、不同算法、新交互，以及许可证允许范围内的合法二次开发；但不接受搬运、洗稿、简单换皮后冒充原创、去除原作者署名，或无法合理说明代码、素材、数据与整理成果来源的内容。功能目标相似本身不作为认定抄袭的依据。</p>
                <p>如社区共建内容出现可信的权利争议，YuanHub 可根据现有材料暂时隐藏、暂停接入或要求补充来源说明；审核或展示不构成 YuanHub 对最终权利归属的法律担保。</p>
              </div>
            </article>

            <article>
              <span class="legal-index">04</span>
              <div>
                <h3>非商业社区项目</h3>
                <p>YuanHub 当前为非商业社区项目，以方便玩家整理个人游戏档案、进行社区交流与数据复用为目的，不以游戏素材获取商业收益。本站仅提供档案整理、展示、分享与数据连接能力，不提供任何游戏账号实际操作服务。</p>
                <p>如未来项目的运营、赞助或许可方式发生变化，将另行更新相关说明；任何第三方项目的商业行为不当然代表 YuanHub 的立场或授权。</p>
              </div>
            </article>

            <article>
              <span class="legal-index">05</span>
              <div>
                <h3>源码与权利反馈</h3>
                <p>程序源码的使用与再分发以项目仓库中单独公布的开源许可为准；在正式添加源码许可证前，本页的 CC BY-NC 4.0 声明不自动适用于程序源码。</p>
                <p>如您是相关权利人，并认为本站的素材使用、署名或说明存在不妥，请联系我们核实并处理。</p>
                <!-- PLACEHOLDER: 替换为正式版权/权利反馈邮箱或工单入口 -->
                <p class="legal-contact"><b>版权与权利反馈</b><span data-placeholder="RIGHTS_CONTACT">联系方式待补充</span></p>
              </div>
            </article>

            <p class="legal-footnote">本站为社区项目，与游戏官方及各第三方权利人之间的关系以实际授权、合作说明或官方公告为准；除明确说明外，不应理解为官方产品或官方背书。</p>
          </div>
        </div>
      </section>

      <section id="final-cta" class="final-cta-section">
        <div class="wrap final-cta-card">
          <span class="cta-watermark">YH</span>
          <div>
            <div class="eyebrow"><span>09</span> YOUR DATA, YOUR STARTING POINT</div>
            <h2>先把自己的游戏档案，<em>整理好</em></h2>
            <p>从一份属于自己的记录开始。之后要分享给朋友，还是连接社区工具，都由你决定。</p>
          </div>
          <!-- PLACEHOLDER: 正式上线时替换为 YuanHub 主站 /operator URL -->
          <a class="final-button placeholder-link" href="#top" data-placeholder="MAIN_APP_OPERATOR_URL">进入 YuanHub <span>→</span><small>正式 URL 待填</small></a>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="wrap footer-inner">
        <div><span class="brand-mark small">YH</span><b>YuanHub · 鸢鸢相抱</b></div>
        <div class="footer-copy">
          <p>用户录入 · 自主管理 · 按需分享 · 社区共建 · <a href="#legal">版权与非商业声明</a></p>
          <small>* 展示效果仅供说明，具体功能与界面以实际上线版本为准。</small>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AGENT_CATALOG } from '../../src/data/inventory/catalog.js'
import { OPERATOR_STAR_LEVEL_AWAKEN, starCardNumber, starCardNode, starCardFallback } from '../../src/utils/operatorStarDisplay.js'

// 密探静态信息取自主站真实目录；头像复制自后端 BackEndV3-Share/data/avatar，
// 放入 promo-site/public，保证宣传页作为独立静态站部署时仍可直接访问。
const promoAgentIds = [
  'char_104_zhugeliang',
  'char_101_lvbu',
  'char_099_pangxi',
  'char_096_xiahouyuan',
  'char_125_zhaoyun',
  'char_113_luzhi'
]
const promoAgents = promoAgentIds.map((id) => {
  const source = AGENT_CATALOG.find((entry) => entry.id === id)
  return source ? { ...source, avatar: `/operator-avatars/${id}.webp` } : null
}).filter(Boolean)
const heroAgents = promoAgents.slice(0, 3)
const sharedAgents = promoAgents.slice(0, 6)

// 演示养成数据遵守前后端共同约束：
// level 0..100；elite 0..17 且 elite <= min(17, floor(level / 5) - 3)；
// 普通密探 starLevel 0..31，31 才是觉醒，25..30 为五星各节点。
const demoGrowthById = {
  char_104_zhugeliang: { level: 100, elite: 17, starLevel: 31, growthState: 'graduated' },
  char_101_lvbu: { level: 90, elite: 15, starLevel: 29, growthState: 'active' },
  char_099_pangxi: { level: 80, elite: 13, starLevel: 30, growthState: 'skip' },
  char_096_xiahouyuan: { level: 70, elite: 11, starLevel: 24, growthState: 'active' },
  char_125_zhaoyun: { level: 60, elite: 9, starLevel: 18, growthState: 'active' },
  char_113_luzhi: { level: 50, elite: 7, starLevel: 12, growthState: 'active' }
}

function maxEliteForLevel(level) {
  const normalized = Math.min(100, Math.max(0, Math.trunc(Number(level) || 0)))
  return Math.min(17, Math.max(0, Math.floor(normalized / 5) - 3))
}

function growthFor(agent) {
  return demoGrowthById[agent && agent.id] || { level: 0, elite: 0, starLevel: 0, growthState: 'active' }
}

function growthStateLabel(state) {
  return state === 'graduated' ? '已毕业' : state === 'skip' ? '养老中' : '养成中'
}

function huajiLabel(starLevel) {
  const value = Math.max(0, Math.trunc(Number(starLevel) || 0))
  if (value === OPERATOR_STAR_LEVEL_AWAKEN) return starCardFallback(value)
  if (value <= 0) return starCardFallback(value)
  return `${starCardNumber(value)} ⭐ · ${starCardNode(value)} 节点`
}

function levelComplete(level) {
  return Number(level) >= 100
}

function eliteComplete(level, elite) {
  const max = maxEliteForLevel(level)
  return max > 0 && Number(elite) >= max
}

function awakened(starLevel) {
  return Number(starLevel) === OPERATOR_STAR_LEVEL_AWAKEN
}

Object.entries(demoGrowthById).forEach(([id, growth]) => {
  const valid = growth.level >= 0 && growth.level <= 100 &&
    growth.elite >= 0 && growth.elite <= maxEliteForLevel(growth.level) &&
    growth.starLevel >= 0 && growth.starLevel <= OPERATOR_STAR_LEVEL_AWAKEN
  if (!valid) throw new Error(`Invalid promo operator growth demo: ${id}`)
})

const features = [
  { id: 'operator', index: '01', name: '密探 BOX', short: '养成档案', kicker: 'OPERATOR ARCHIVE', title: '把密探养成变成一份随时可看的档案', description: '多个游戏账号分别维护密探状态，记录等级、修为、化极、命盘、星石与养成状态。', points: ['当前养成与图鉴分开管理', '支持快捷导入与档案交换', '可生成神秘代码对外只读分享'] },
  { id: 'inventory', index: '02', name: '库存', short: '清点与溯源', kicker: 'INVENTORY LEDGER', title: '不只记“现在有多少”，也看资源怎么变化', description: '库存页面用于清点当前背包、归档获得记录，并按周期查看资源变化。', points: ['多个子账号分别清点', '按周 / 月查看获得量', '支持完整交换档案'] },
  { id: 'star', index: '03', name: '星石', short: '识别与计划', kicker: 'STAR INVENTORY', title: '从截图识别开始，把星石真正整理起来', description: '星石识别与养成相关内容为 Drifty Yan 独立创作。可导入游戏截图进行 OCR 与人工核对，并管理当前背包、养成计划与经验星曜。', points: ['本地截图导入与 OCR', '人工核对识别结果', '登录后同步当前账号数据'] },
  { id: 'connection', index: '04', name: '工具连接', short: '授权与复用', kicker: 'APP CONNECTION', title: '已经录入的数据，不必在每个工具里重新填一遍', description: '在个人中心为 MaaYuan 或其他第三方项目创建连接，绑定具体子账号并授予明确权限。', points: ['连接绑定具体游戏账号', '权限 scope 可控', '连接可随时停止'] }
]

const activeFeature = ref('operator')
const currentFeature = computed(() => features.find(item => item.id === activeFeature.value) || features[0])
let featureTimer = null
let userSelected = false

function selectFeature(id) {
  activeFeature.value = id
  userSelected = true
}

const scopes = ref([
  { id: 'operator-read', name: '读取密探', detail: '读取当前账号已录入的密探数据', enabled: true },
  { id: 'operator-write', name: '写入密探', detail: '允许工具同步密探养成信息', enabled: true },
  { id: 'inventory-read', name: '读取库存', detail: '读取当前账号库存数据', enabled: true },
  { id: 'inventory-write', name: '写入库存', detail: '允许工具同步库存变化', enabled: false }
])

const partners = [
  { name: 'MaaYuan', icon: '/icons/maa.png', scenario: '自动化录入与同步场景', status: '社区项目', href: 'https://maayuan.com/' },
  { name: '代号鸢 BWiki', icon: '/icons/bwiki-transparent.png', scenario: '资料查询与数据计算场景', status: '潜在场景', href: 'https://wiki.biligame.com/yuan/%E9%A6%96%E9%A1%B5' },
  { name: 'YuanAssist', icon: '/icons/yuanassist-transparent.png', scenario: '作业与日常辅助场景', status: '潜在场景', href: 'https://www.yuanassist.space/' },
  { name: '辟雍学府', icon: '/icons/piyong-transparent.png', scenario: 'BOX 图制作与展示场景', status: '潜在场景', href: '' }
]

onMounted(() => {
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return
  featureTimer = window.setInterval(() => {
    if (userSelected) return
    const index = features.findIndex(item => item.id === activeFeature.value)
    activeFeature.value = features[(index + 1) % features.length].id
  }, 4800)
})

onBeforeUnmount(() => {
  if (featureTimer) window.clearInterval(featureTimer)
})
</script>

<style scoped>
.promo-page {
  --paper: #f6edd0;
  --cream: #fff8ec;
  --surface: #fffdf6;
  --tea: #5a4633;
  --ink: #493b2c;
  --muted: rgba(73, 59, 44, .66);
  --line: rgba(90, 70, 51, .18);
  --soft-line: rgba(90, 70, 51, .1);
  --yellow: #efd28e;
  --yellow-deep: #dfb863;
  --accent: #d78935;
  --accent-strong: #8f5112;
  --rouge: #a6514a;
  --blue: #6d8797;
  --font-d: 'Archivo', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  --font-s: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;
  min-height: 100vh;
  color: var(--ink);
  background: var(--paper);
  background-image: radial-gradient(circle at 18% 12%, rgba(255,255,255,.5), transparent 24%), linear-gradient(135deg, #f6edd0, #fff8ec 58%, #f2e4c0);
}
.promo-page::before { position: fixed; z-index: 0; inset: 0; content: ''; pointer-events: none; opacity: .08; background: url('/maayuan/maayuan-pattern.webp') repeat; background-size: 2100px; }
.promo-page > * { position: relative; z-index: 1; }
* { box-sizing: border-box; }
.wrap { width: min(100%, 1280px); margin: 0 auto; padding-inline: 44px; }
a { color: inherit; }
.site-header { position: sticky; z-index: 20; top: 0; border-bottom: 1px solid var(--soft-line); background: rgba(246,237,208,.86); backdrop-filter: blur(14px); }
.header-inner { min-height: 72px; display: flex; align-items: center; gap: 28px; }
.brand { display: flex; align-items: center; gap: 11px; text-decoration: none; }
.brand-mark { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 11px; color: var(--cream); background: var(--tea); font: 900 13px/1 var(--font-d); letter-spacing: .05em; }
.brand-mark.small { width: 30px; height: 30px; border-radius: 9px; font-size: 10px; }
.brand-copy { display: grid; gap: 2px; }
.brand-copy b { font: 900 16px/1 var(--font-d); }
.brand-copy small { color: var(--muted); font-size: 10px; letter-spacing: .08em; }
.header-nav { display: flex; gap: 24px; margin-left: auto; }
.header-nav a { color: var(--muted); font-size: 12px; font-weight: 800; text-decoration: none; }
.header-nav a:hover { color: var(--accent-strong); }
.header-cta { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; padding: 0 16px; border: 1px solid var(--tea); border-radius: 999px; color: var(--cream); background: var(--tea); font-size: 12px; font-weight: 800; text-decoration: none; }
.hero-section { padding: 92px 0 104px; }
.hero-grid { display: grid; grid-template-columns: minmax(0,.9fr) minmax(520px,1.1fr); align-items: center; gap: 72px; }
.eyebrow { display: flex; align-items: center; gap: 11px; color: var(--accent-strong); font: 800 11px/1.2 var(--font-d); letter-spacing: .15em; }
.eyebrow span { color: var(--tea); font-size: 14px; letter-spacing: .03em; }
.hero-copy h1, .section-heading h2, .section-copy h2, .final-cta-card h2 { margin: 22px 0 0; color: var(--tea); font-family: var(--font-s); font-weight: 900; letter-spacing: .025em; }
.hero-copy h1 { font-size: clamp(48px,5.2vw,76px); line-height: 1.13; }
em { color: var(--accent); font-style: normal; }
.hero-lede { max-width: 600px; margin-top: 28px; color: var(--muted); font-size: 16px; line-height: 1.95; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.primary-btn, .secondary-btn { display: inline-flex; min-height: 46px; align-items: center; gap: 12px; padding: 0 18px; border-radius: 999px; font-size: 13px; font-weight: 800; text-decoration: none; }
.primary-btn { color: var(--cream); background: var(--tea); }
.secondary-btn { border: 1px solid var(--line); background: rgba(255,253,246,.56); }
.hero-trust { display: flex; flex-wrap: wrap; gap: 15px; margin-top: 22px; color: var(--muted); font-size: 11px; font-weight: 700; }
.hero-trust i { color: var(--accent-strong); font-style: normal; }
.hero-demo-wrap { min-width: 0; }
.demo-browser { overflow: hidden; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 34px 80px -44px rgba(73,59,44,.6); }
.browser-bar { min-height: 48px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; padding: 0 16px; border-bottom: 1px solid var(--soft-line); background: rgba(246,237,208,.52); }
.browser-dots { display: flex; gap: 5px; }
.browser-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--line); }
.browser-dots i:first-child { background: var(--rouge); }.browser-dots i:nth-child(2) { background: var(--yellow-deep); }.browser-dots i:nth-child(3) { background: #8eaa8c; }
.browser-title { color: var(--muted); font: 800 10px/1 var(--font-d); letter-spacing: .07em; }
.demo-badge { justify-self: end; padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--accent-strong); font: 800 9px/1 var(--font-d); letter-spacing: .06em; }
.hero-demo-body { min-height: 455px; display: grid; grid-template-columns: 54px minmax(0,1fr); }
.demo-sidebar { display: flex; align-items: center; flex-direction: column; gap: 17px; padding-top: 17px; border-right: 1px solid var(--soft-line); background: rgba(246,237,208,.36); }
.mini-brand { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 8px; color: var(--cream); background: var(--tea); font: 900 9px var(--font-d); }
.side-line { width: 20px; height: 5px; border-radius: 999px; background: var(--line); }.side-line.active { background: var(--accent); }.side-line.short { width: 13px; }
.demo-workspace { position: relative; overflow: hidden; padding: 22px; }
.demo-account, .operator-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 15px; }
.demo-account { padding-bottom: 15px; border-bottom: 1px dashed var(--line); }
.demo-account small, .operator-toolbar small { display: block; color: var(--muted); font-size: 9px; letter-spacing: .06em; }
.demo-account strong { display: block; margin-top: 3px; font: 900 14px var(--font-s); }
.account-switch { padding: 6px 9px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); font-size: 9px; }
.operator-toolbar { margin-top: 18px; }
.operator-toolbar b { display: block; margin-top: 4px; font: 900 18px var(--font-s); }
.share-trigger { border: 1px solid var(--accent); border-radius: 999px; padding: 8px 12px; color: var(--accent-strong); background: transparent; font: 800 10px var(--font-d); animation: buttonPulse 10s infinite; }
.operator-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; margin-top: 16px; }
.operator-card { position: relative; min-width: 0; padding: 12px; border: 1px solid var(--line); border-radius: 13px; background: var(--cream); opacity: 0; transform: translateY(12px); animation: cardEnter 10s infinite; }
.card-b { animation-delay: .35s; }.card-c { animation-delay: .7s; }
.portrait { display: block; width: 44px; aspect-ratio: 1 / 1.24; height: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); object-fit: cover; object-position: center 42%; }
.operator-copy { display: grid; gap: 4px; margin-top: 10px; }.operator-copy strong { font: 900 13px var(--font-s); }.operator-copy span { color: var(--muted); font-size: 9px; }
.level-line { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 10px; }.level-line b { font: 900 12px var(--font-d); }.level-line em { padding: 3px 5px; border-radius: 999px; color: var(--accent-strong); background: rgba(239,210,142,.45); font-size: 8px; font-style: normal; }
.level-number { animation: levelFlash 10s infinite; }
.awakening-chip { margin-top: 7px; color: var(--accent-strong); font-size: 9px; font-weight: 800; opacity: 0; animation: awaken 10s infinite; }
.share-popover { position: absolute; z-index: 4; right: 22px; top: 102px; width: 205px; padding: 14px; border: 1px solid var(--accent); border-radius: 13px; background: var(--surface); box-shadow: 0 20px 35px -25px rgba(73,59,44,.7); opacity: 0; transform: translateY(-8px) scale(.96); animation: sharePopover 10s infinite; }
.share-popover > span, .share-popover > small { display: block; }.popover-kicker { color: var(--accent-strong); font-size: 9px; font-weight: 900; letter-spacing: .12em; }.share-popover strong { display: block; margin-top: 5px; font: 900 19px var(--font-d); letter-spacing: .08em; }.share-popover small { margin-top: 5px; color: var(--muted); font-size: 9px; }.share-popover div { display: flex; gap: 6px; margin-top: 11px; }.share-popover div span { padding: 6px 8px; border-radius: 999px; color: var(--cream); background: var(--tea); font-size: 8px; }
.share-view-overlay { position: absolute; z-index: 6; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; background: rgba(255,253,246,.98); opacity: 0; transform: translateX(45px); animation: shareView 10s infinite; }.overlay-kicker { color: var(--accent-strong); font: 800 9px var(--font-d); letter-spacing: .12em; }.share-view-overlay b { margin-top: 8px; font: 900 28px var(--font-s); }.share-view-overlay small { margin-top: 5px; color: var(--muted); font-size: 10px; }.overlay-cards { display: flex; gap: 8px; margin-top: 22px; }.overlay-cards i { display: grid; width: 45px; height: 58px; place-items: center; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); font-style: normal; opacity: 0; transform: translateY(12px) rotate(3deg); animation: overlayCard 10s infinite; }.overlay-cards i img { width: 100%; height: 100%; object-fit: cover; object-position: center top; }.overlay-cards i:nth-child(2){animation-delay:.18s}.overlay-cards i:nth-child(3){animation-delay:.36s}.overlay-cards i:nth-child(4){animation-delay:.54s}
.media-placeholder { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px dashed var(--line); color: var(--muted); background: rgba(255,253,246,.35); }.compact-placeholder { margin-top: 10px; padding: 9px 12px; border-radius: 9px; }.media-placeholder span { color: var(--accent-strong); font: 800 8px var(--font-d); letter-spacing: .1em; }.media-placeholder small { font-size: 9px; }
.section { padding: 108px 0; border-top: 1px solid var(--soft-line); }
.section-heading h2, .section-copy h2 { font-size: clamp(38px,4vw,58px); line-height: 1.18; }
.split-heading { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(300px,.8fr); align-items: end; gap: 60px; }.split-heading p, .centered-heading p, .section-copy > p { color: var(--muted); font-size: 14px; line-height: 1.85; }.split-heading p { max-width: 480px; justify-self: end; }.centered-heading { max-width: 760px; margin: 0 auto; text-align: center; }.centered-heading .eyebrow { justify-content: center; }.centered-heading p { margin: 20px auto 0; }
.feature-shell { margin-top: 50px; border: 1px solid var(--line); border-radius: 22px; background: rgba(255,253,246,.5); overflow: hidden; }
.release-disclaimer { display: flex; align-items: flex-start; gap: 12px; margin-top: 18px; padding: 16px 18px; border: 1px dashed var(--line); border-radius: 14px; background: rgba(255,253,246,.5); }
.release-disclaimer-mark { flex: 0 0 auto; color: var(--accent-strong); font: 900 20px/1 var(--font-d); }
.release-disclaimer b { color: var(--tea); font: 900 13px/1.4 var(--font-s); }
.release-disclaimer p { margin-top: 5px; color: var(--muted); font-size: 11.5px; line-height: 1.75; }
.feature-tabs { display: grid; grid-template-columns: repeat(4,1fr); border-bottom: 1px solid var(--line); }.feature-tabs button { display: grid; grid-template-columns: auto 1fr; column-gap: 9px; row-gap: 3px; min-height: 86px; padding: 17px 18px; border: 0; border-right: 1px solid var(--soft-line); color: var(--muted); background: transparent; text-align: left; cursor: pointer; }.feature-tabs button:last-child { border-right: 0; }.feature-tabs button.active { color: var(--ink); background: var(--surface); box-shadow: inset 0 -3px var(--accent); }.feature-tabs button > span { grid-row: 1 / span 2; color: var(--accent-strong); font: 800 10px var(--font-d); }.feature-tabs b { font: 900 15px var(--font-s); }.feature-tabs small { font-size: 10px; }
.feature-stage { display: grid; grid-template-columns: minmax(280px,.75fr) minmax(0,1.25fr); min-height: 430px; }.feature-copy-panel { padding: 46px 38px; border-right: 1px solid var(--line); }.feature-kicker { color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .14em; }.feature-copy-panel h3 { margin-top: 15px; color: var(--tea); font: 900 28px/1.35 var(--font-s); }.feature-copy-panel p { margin-top: 17px; color: var(--muted); font-size: 13px; line-height: 1.85; }.feature-copy-panel ul { display: grid; gap: 10px; margin: 24px 0 0; padding: 0; list-style: none; }.feature-copy-panel li { position: relative; padding-left: 18px; font-size: 12px; }.feature-copy-panel li::before { position: absolute; left: 0; color: var(--accent); content: '✦'; }.feature-author-badge { display: inline-flex; align-items: center; gap: 6px; margin-top: 16px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: rgba(255,253,246,.6); font-size: 9px; line-height: 1.4; }.feature-author-badge > span { display: grid; width: 17px; height: 17px; place-items: center; border-radius: 50%; color: var(--cream); background: var(--tea); font-size: 9px; }.feature-author-badge b { color: var(--ink); }
.feature-demo-panel { position: relative; min-width: 0; padding: 34px; background: linear-gradient(135deg,rgba(239,210,142,.18),rgba(255,253,246,.58)); }.feature-visual { height: 100%; min-height: 360px; padding: 24px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); box-shadow: 0 26px 45px -38px rgba(73,59,44,.7); }.visual-top { display: flex; justify-content: space-between; gap: 14px; padding-bottom: 15px; border-bottom: 1px dashed var(--line); }.visual-top b { font: 900 18px var(--font-s); }.visual-top span { color: var(--muted); font-size: 10px; }.stage-placeholder-tag { position: absolute; right: 45px; bottom: 45px; padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: var(--cream); font: 800 8px var(--font-d); letter-spacing: .08em; }
.mini-card-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 10px; margin-top: 18px; }.mini-op-card { display: grid; grid-template-columns: 44px 1fr auto; gap: 4px 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--cream); }.mini-op-card i { grid-row: 1 / span 3; display: block; width: 44px; aspect-ratio: 1 / 1.24; overflow: hidden; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); font-style: normal; }.mini-op-card i img { width: 100%; height: 100%; object-fit: cover; object-position: center 42%; }.mini-op-card b { font: 900 12px var(--font-s); }.mini-op-card span { color: var(--accent-strong); font-size: 9px; }.mini-op-card em { grid-column: 2 / span 2; color: var(--muted); font-size: 9px; line-height: 1.45; font-style: normal; }.visual-status { margin-top: 17px; color: var(--muted); font-size: 10px; }.visual-status span { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: var(--accent); animation: blink 1.5s infinite; }
.inventory-total { position: relative; margin-top: 24px; padding: 20px; border-radius: 14px; background: var(--cream); }.inventory-total small { display: block; color: var(--muted); }.inventory-total strong { display: flex; align-items: center; gap: 8px; margin-top: 6px; font: 900 34px var(--font-d); }.inventory-total strong span { text-decoration: line-through; opacity: .32; }.inventory-total strong i { color: var(--rouge); font: 800 12px var(--font-d); font-style: normal; animation: stockPlus 4s infinite; }.inventory-total em { display: block; margin-top: 4px; color: var(--accent-strong); font: 900 42px var(--font-d); font-style: normal; animation: stockTotal 4s infinite; }.bar-chart { height: 90px; display: flex; align-items: end; gap: 8px; margin-top: 20px; padding: 8px 12px 0; border-bottom: 1px solid var(--line); }.bar-chart i { flex: 1; border-radius: 5px 5px 0 0; background: var(--yellow-deep); transform-origin: bottom; animation: barGrow 2.8s ease-in-out infinite alternate; }.inventory-row { display: grid; grid-template-columns: 1fr auto; gap: 3px; margin-top: 13px; font-size: 10px; }.inventory-row b { color: var(--accent-strong); }.inventory-row small { grid-column: 1 / -1; color: var(--muted); }
.star-author-line { display: flex; align-items: center; gap: 6px; margin-top: 13px; color: var(--muted); font-size: 9px; }.star-author-line > span { display: grid; width: 18px; height: 18px; place-items: center; border-radius: 50%; color: var(--cream); background: var(--tea); font-size: 9px; }.star-author-line b { color: var(--ink); }.ocr-layout { display: grid; grid-template-columns: 1fr 34px 1fr; align-items: center; gap: 12px; margin-top: 18px; }.fake-shot { position: relative; overflow: hidden; height: 220px; border-radius: 14px; background: linear-gradient(145deg,#504333,#80664a); }.fake-shot i { position: absolute; left: 13%; width: 74%; height: 42px; border: 1px solid rgba(239,210,142,.7); border-radius: 8px; }.fake-shot i:nth-of-type(1){top:18%}.fake-shot i:nth-of-type(2){top:43%}.fake-shot i:nth-of-type(3){top:68%}.fake-shot small { position: absolute; right: 10px; bottom: 8px; color: rgba(255,255,255,.65); font-size: 8px; }.scan-line { position: absolute; z-index: 3; top: 0; left: 0; width: 100%; height: 2px; background: var(--yellow); box-shadow: 0 0 15px var(--yellow); animation: scan 3.2s infinite; }.ocr-arrow { color: var(--accent); font: 900 22px var(--font-d); text-align: center; }.star-result { display: grid; gap: 9px; }.star-result article { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 11px; background: var(--cream); opacity: 0; transform: translateX(10px); animation: resultIn 3.2s infinite; }.star-result article:nth-child(2){animation-delay:.25s}.star-result article:nth-child(3){animation-delay:.5s}.star-result article > i { color: var(--accent); font-style: normal; }.star-result b,.star-result span { display: block; }.star-result b { font: 900 12px var(--font-s); }.star-result span { margin-top: 3px; color: var(--muted); font-size: 8px; }
.connection-card { display: grid; grid-template-columns: 48px 1fr auto; align-items: center; gap: 13px; margin-top: 25px; padding: 16px; border: 1px solid var(--line); border-radius: 13px; background: var(--cream); }.connection-card img { width: 48px; height: 48px; object-fit: contain; border-radius: 10px; }.connection-card b,.connection-card span { display: block; }.connection-card b { font: 900 14px var(--font-s); }.connection-card span { margin-top: 4px; color: var(--muted); font-size: 9px; }.connection-card em { padding: 5px 7px; border-radius: 999px; color: #5c755b; background: rgba(142,170,140,.18); font-size: 8px; font-style: normal; font-weight: 800; }.scope-pills { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }.scope-pills span { padding: 7px 9px; border-radius: 999px; color: var(--accent-strong); background: rgba(239,210,142,.35); font-size: 9px; font-weight: 800; }.token-line { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin-top: 20px; padding: 15px; border: 1px dashed var(--line); border-radius: 12px; }.token-line small { grid-column: 1 / -1; color: var(--muted); font-size: 8px; }.token-line code { font-size: 11px; }.token-line button { border: 0; border-radius: 999px; padding: 5px 9px; color: var(--cream); background: var(--tea); font-size: 8px; }
.share-section { background: rgba(255,253,246,.36); }.share-layout { display: grid; grid-template-columns: minmax(0,.72fr) minmax(540px,1.28fr); align-items: center; gap: 80px; }.section-copy > p { margin-top: 22px; }.privacy-note { display: flex; gap: 13px; margin-top: 28px; padding: 15px 17px; border-left: 3px solid var(--yellow-deep); background: rgba(255,253,246,.55); }.privacy-note span { font-size: 20px; }.privacy-note b,.privacy-note small { display: block; }.privacy-note b { font-size: 12px; }.privacy-note small { margin-top: 5px; color: var(--muted); font-size: 10px; line-height: 1.6; }
.share-animation-stage { position: relative; min-height: 440px; display: grid; grid-template-columns: 1fr 110px 1fr; align-items: center; }.share-phone { position: relative; z-index: 2; min-height: 310px; padding: 24px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); box-shadow: 0 30px 52px -42px rgba(73,59,44,.7); }.panel-label { color: var(--accent-strong); font: 800 9px var(--font-d); letter-spacing: .12em; }.share-phone > b { display: block; margin-top: 13px; font: 900 20px var(--font-s); }.share-phone > small { display: block; margin-top: 5px; color: var(--muted); font-size: 9px; }.mystery-code { margin-top: 38px; padding: 17px; border-radius: 13px; background: var(--cream); text-align: center; }.mystery-code span,.mystery-code strong { display: block; }.mystery-code span { color: var(--muted); font-size: 9px; }.mystery-code strong { margin-top: 7px; font: 900 21px var(--font-d); letter-spacing: .1em; }.owner-panel button { display: block; width: 100%; margin-top: 14px; padding: 10px; border: 0; border-radius: 999px; color: var(--cream); background: var(--tea); font-size: 10px; font-weight: 800; }.fake-input { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 28px; padding: 10px 10px 10px 13px; border: 1px solid var(--line); border-radius: 10px; font: 800 10px var(--font-d); }.fake-input em { padding: 5px 8px; border-radius: 999px; color: var(--cream); background: var(--tea); font-size: 8px; font-style: normal; }.visitor-box { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; margin-top: 18px; }.visitor-box i { display: grid; width: 100%; aspect-ratio: 1 / 1.24; height: auto; place-items: center; overflow: hidden; border: 1px solid var(--line); border-radius: 9px; background: var(--cream); font-style: normal; opacity: 0; transform: translateY(10px); animation: visitorCard 5.2s infinite; }.visitor-box i img { width: 100%; height: 100%; object-fit: cover; object-position: center 42%; }.visitor-box i:nth-child(2){animation-delay:.1s}.visitor-box i:nth-child(3){animation-delay:.2s}.visitor-box i:nth-child(4){animation-delay:.3s}.visitor-box i:nth-child(5){animation-delay:.4s}.visitor-box i:nth-child(6){animation-delay:.5s}.code-flight { position: relative; z-index: 4; display: flex; align-items: center; justify-content: center; }.code-flight span { position: absolute; z-index: 3; padding: 8px 10px; border: 1px solid var(--accent); border-radius: 8px; background: var(--cream); font: 900 8px var(--font-d); letter-spacing: .08em; animation: codeFly 5.2s infinite; }.code-flight i { width: 100%; border-top: 1px dashed var(--accent); }
.share-value-line { padding: 13px 15px; border-left: 3px solid var(--accent); color: var(--tea) !important; background: rgba(239,210,142,.2); font-size: 14px !important; line-height: 1.7 !important; }
.share-value-line strong { color: var(--accent-strong); font-weight: 900; }
.visitor-box { grid-template-columns: repeat(3,minmax(0,1fr)); align-items: start; }
.visitor-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--cream); opacity: 0; transform: translateY(10px); animation: visitorCard 5.2s infinite; }
.visitor-card:nth-child(2){animation-delay:.1s}.visitor-card:nth-child(3){animation-delay:.2s}.visitor-card:nth-child(4){animation-delay:.3s}.visitor-card:nth-child(5){animation-delay:.4s}.visitor-card:nth-child(6){animation-delay:.5s}
.visitor-card > i { display: block; width: 100%; aspect-ratio: 1 / 1.24; overflow: hidden; border: 0; border-radius: 0; opacity: 1; transform: none; animation: none; }
.visitor-card > i img { width: 100%; height: 100%; object-fit: cover; object-position: center 42%; }
.visitor-card-copy { display: grid; gap: 2px; padding: 7px 7px 8px; }
.visitor-card-copy b { overflow: hidden; font: 900 10px/1.25 var(--font-s); text-overflow: ellipsis; white-space: nowrap; }
.visitor-card-copy span { overflow: hidden; color: var(--accent-strong); font-size: 7.5px; font-weight: 800; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.visitor-card-copy small { overflow: hidden; color: var(--muted); font-size: 7.5px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.visitor-detail-line { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
.visitor-detail-line span { padding: 4px 6px; border-radius: 999px; color: var(--accent-strong); background: rgba(239,210,142,.32); font-size: 8px; font-weight: 900; }
.visitor-detail-line em { margin-left: auto; color: var(--muted); font-size: 8px; font-style: normal; font-weight: 800; }
.permission-demo { display: grid; grid-template-columns: minmax(330px,1fr) 120px minmax(260px,.78fr); align-items: center; max-width: 1020px; margin: 50px auto 0; }.permission-card,.permission-result { border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: 0 28px 50px -42px rgba(73,59,44,.7); }.permission-card { padding: 22px; }.permission-head { display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 11px; padding-bottom: 16px; border-bottom: 1px dashed var(--line); }.permission-head img { width: 42px; height: 42px; object-fit: contain; }.permission-head small,.permission-head b { display: block; }.permission-head small { color: var(--muted); font-size: 8px; }.permission-head b { margin-top: 3px; font: 900 14px var(--font-s); }.permission-head > span { color: var(--muted); font-size: 9px; }.permission-list { display: grid; margin-top: 8px; }.permission-list label { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 62px; border-bottom: 1px solid var(--soft-line); }.permission-list label:last-child { border-bottom: 0; }.permission-list label.disabled { opacity: .52; }.permission-list b,.permission-list small { display: block; }.permission-list b { font-size: 11px; }.permission-list small { margin-top: 4px; color: var(--muted); font-size: 8px; }.permission-list button { position: relative; width: 37px; height: 21px; border: 0; border-radius: 999px; background: var(--accent); cursor: pointer; transition: background .2s ease; }.permission-list button i { position: absolute; top: 3px; right: 3px; width: 15px; height: 15px; border-radius: 50%; background: white; transition: transform .2s ease; }.permission-list label.disabled button { background: var(--line); }.permission-list label.disabled button i { transform: translateX(-16px); }.permission-lines { display: grid; gap: 20px; padding: 0 8px; }.permission-lines span { position: relative; display: flex; align-items: center; gap: 5px; color: var(--accent-strong); font-size: 8px; }.permission-lines i { flex: 1; border-top: 1px solid var(--accent); transition: opacity .2s ease; }.permission-lines em { font-style: normal; }.permission-lines span.off { color: var(--muted); }.permission-lines span.off i { border-top-style: dashed; opacity: .25; }.permission-result { display: grid; gap: 9px; padding: 22px; }.permission-result article { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 10px; background: var(--cream); }.permission-result article.off { opacity: .38; }.permission-result article > i { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; color: #5c755b; background: rgba(142,170,140,.18); font-style: normal; font-weight: 900; }.permission-result b,.permission-result small { display: block; }.permission-result b { font-size: 10px; }.permission-result small { margin-top: 2px; color: var(--muted); font-size: 8px; }.privacy-principles { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-top: 54px; }.privacy-principles article { padding: 24px; border-top: 2px solid var(--yellow-deep); background: rgba(255,253,246,.45); }.privacy-principles span { color: var(--accent-strong); font: 800 9px var(--font-d); }.privacy-principles b { display: block; margin-top: 12px; font: 900 16px var(--font-s); }.privacy-principles p { margin-top: 8px; color: var(--muted); font-size: 10px; line-height: 1.7; }
.ecosystem-flow { display: grid; grid-template-columns: 190px 90px 170px 90px 1fr; align-items: center; gap: 10px; margin-top: 52px; }.flow-source,.flow-hub { padding: 22px; border: 1px solid var(--line); background: var(--surface); text-align: center; }.flow-source { border-radius: 16px; }.flow-label { color: var(--accent-strong); font: 800 8px var(--font-d); letter-spacing: .12em; }.flow-source b { display: block; margin-top: 9px; font: 900 16px var(--font-s); }.flow-source div { display: flex; justify-content: center; gap: 6px; margin-top: 15px; }.flow-source i { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 9px; background: var(--cream); font: 900 11px var(--font-s); font-style: normal; }.flow-hub { min-height: 170px; display: flex; align-items: center; justify-content: center; flex-direction: column; border-radius: 50%; }.flow-hub > span { display: grid; width: 46px; height: 46px; place-items: center; border-radius: 13px; color: var(--cream); background: var(--tea); font: 900 13px var(--font-d); }.flow-hub b { margin-top: 10px; font: 900 16px var(--font-s); }.flow-hub small { margin-top: 5px; color: var(--muted); font-size: 8px; }.flow-line { position: relative; height: 1px; border-top: 1px dashed var(--accent); }.data-packet { position: absolute; top: -14px; left: 0; padding: 5px 7px; border: 1px solid var(--accent); border-radius: 7px; background: var(--cream); font: 800 7px var(--font-d); white-space: nowrap; animation: packetMove 4s linear infinite; }.packet-two { animation-delay: 1.2s; }.partner-stack { display: grid; grid-template-columns: repeat(2,1fr); gap: 9px; }.partner-card { display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 10px; min-width: 0; padding: 13px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,253,246,.65); text-decoration: none; }.partner-card img { width: 42px; height: 42px; object-fit: contain; border-radius: 9px; }.partner-card b,.partner-card small { display: block; }.partner-card b { font: 900 11px var(--font-s); }.partner-card small { margin-top: 4px; color: var(--muted); font-size: 8px; }.partner-card > span { color: var(--accent-strong); font-size: 7px; font-weight: 800; }.ecosystem-disclaimer { max-width: 880px; margin: 28px auto 0; color: var(--muted); font-size: 9px; line-height: 1.75; text-align: center; }
.community-build-section { scroll-margin-top: 72px; background: rgba(255,253,246,.24); }
.community-build-heading { align-items: end; }
.community-showcase { margin-top: 50px; padding: 30px; border: 1px solid var(--line); border-radius: 24px; background: rgba(255,253,246,.68); box-shadow: 0 30px 70px -58px rgba(73,59,44,.72); }
.community-showcase-head { display: grid; grid-template-columns: minmax(0,1fr) minmax(280px,.7fr); align-items: end; gap: 42px; padding-bottom: 22px; border-bottom: 1px dashed var(--line); }
.community-kicker { color: var(--accent-strong); font: 800 10px/1.2 var(--font-d); letter-spacing: .14em; }
.community-showcase-head h3, .community-path-copy h3, .community-principles h3 { margin-top: 8px; color: var(--tea); font: 900 22px/1.4 var(--font-s); }
.community-showcase-head p { color: var(--muted); font-size: 13px; line-height: 1.75; }
.community-author-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; margin-top: 22px; }
.community-author-card { display: grid; grid-template-columns: 46px 1fr auto; align-items: center; gap: 14px; min-width: 0; padding: 20px; border: 1px solid var(--soft-line); border-radius: 16px; background: var(--cream); }
.community-author-mark { display: grid; width: 46px; height: 46px; place-items: center; border-radius: 13px; color: var(--cream); background: var(--tea); font: 900 16px var(--font-s); }
.community-author-card small { color: var(--accent-strong); font-size: 10px; font-weight: 800; }
.community-author-card h4 { margin-top: 5px; color: var(--tea); font: 900 17px var(--font-s); }
.community-author-card p { margin-top: 5px; color: var(--muted); font-size: 11px; line-height: 1.6; }
.community-author-card strong { align-self: start; padding: 6px 9px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink); font: 800 11px var(--font-d); white-space: nowrap; }
.community-paths { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; margin-top: 18px; }
.community-path-card { position: relative; display: grid; grid-template-columns: 42px 1fr; grid-template-rows: 1fr auto; gap: 0 18px; min-height: 350px; padding: 30px; border: 1px solid var(--line); border-radius: 22px; background: var(--surface); box-shadow: 0 28px 54px -48px rgba(73,59,44,.72); }
.community-path-index { grid-row: 1 / span 2; display: grid; width: 42px; height: 42px; place-items: center; border-radius: 12px; color: var(--cream); background: var(--tea); font: 900 14px var(--font-d); }
.community-path-copy > small { color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .12em; }
.community-path-copy h3 { font-size: 24px; }
.community-path-copy p { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.8; }
.community-path-copy ul, .community-principles ul { display: grid; gap: 9px; margin: 18px 0 0; padding: 0; list-style: none; }
.community-path-copy li, .community-principles li { position: relative; padding-left: 18px; color: var(--ink); font-size: 12px; line-height: 1.6; }
.community-path-copy li::before, .community-principles li::before { position: absolute; left: 0; color: var(--accent); content: '✦'; }
.community-path-link { grid-column: 2; display: inline-flex; align-items: center; justify-content: space-between; gap: 18px; width: fit-content; margin-top: 24px; padding: 10px 14px; border: 1px solid var(--line); border-radius: 999px; color: var(--tea); background: var(--cream); font-size: 11px; font-weight: 900; text-decoration: none; }
.community-path-link:hover { border-color: var(--accent); color: var(--accent-strong); }
.community-dev-note { display: flex; align-items: center; justify-content: space-between; gap: 26px; margin-top: 18px; padding: 20px 24px; border: 1px dashed var(--line); border-radius: 18px; background: rgba(246,237,208,.3); }
.community-dev-note > div > span { color: var(--tea); font: 900 15px var(--font-s); }
.community-dev-note p { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.community-dev-note > a { display: inline-flex; align-items: center; gap: 10px; flex: 0 0 auto; padding: 9px 13px; border: 1px solid var(--tea); border-radius: 999px; color: var(--cream); background: var(--tea); font-size: 11px; font-weight: 900; text-decoration: none; }
.community-dev-note > a span { color: inherit; font: inherit; }
.community-principles { display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 16px; margin-top: 18px; scroll-margin-top: 100px; }
.community-principles article { padding: 28px 30px; border-radius: 20px; }
.community-welcome-card { border: 1px solid var(--line); background: rgba(239,210,142,.2); }
.community-integrity-card { border: 1px solid rgba(166,81,74,.24); background: rgba(255,253,246,.74); }
.community-principles h3 { font-size: 21px; }
.community-integrity-card > p { margin-top: 12px; color: var(--muted); font-size: 13px; line-height: 1.8; }
.integrity-reject-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.integrity-reject-list span { padding: 7px 10px; border: 1px solid rgba(166,81,74,.22); border-radius: 999px; color: var(--rouge); background: rgba(166,81,74,.06); font-size: 10px; font-weight: 900; }
.community-integrity-card > small { display: block; margin-top: 17px; padding-top: 15px; border-top: 1px dashed var(--line); color: var(--muted); font-size: 10.5px; line-height: 1.7; }
.community-process { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 9px; margin-top: 22px; padding: 16px 20px; border: 1px dashed var(--line); border-radius: 16px; color: var(--muted); background: rgba(246,237,208,.3); font-size: 10.5px; font-weight: 800; }
.community-process span { color: var(--tea); }
.community-process i { color: var(--accent); font-style: normal; }
.roadmap-section { background: rgba(255,253,246,.34); }.roadmap-layout { display: grid; grid-template-columns: .62fr 1.38fr; align-items: start; gap: 70px; }.roadmap-board { border-top: 1px solid var(--line); }.roadmap-row { display: grid; grid-template-columns: 72px 1fr auto; align-items: center; gap: 18px; min-height: 112px; border-bottom: 1px solid var(--line); }.roadmap-row > span { color: var(--accent-strong); font: 900 10px var(--font-d); letter-spacing: .12em; }.roadmap-row b { font: 900 16px var(--font-s); }.roadmap-row p { margin-top: 6px; color: var(--muted); font-size: 10px; line-height: 1.6; }.roadmap-row em { padding: 6px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 8px; font-style: normal; }.roadmap-row.current em { color: #5c755b; border-color: rgba(92,117,91,.25); }.roadmap-credit { display: block; margin-top: 7px; color: var(--muted); font-size: 8px; line-height: 1.5; }.roadmap-credit b { color: var(--ink); font: inherit; font-weight: 900; }.roadmap-row.future { opacity: .72; }
.legal-section { background: rgba(246,237,208,.38); }
.legal-layout { display: grid; grid-template-columns: minmax(260px,.56fr) minmax(0,1.44fr); align-items: start; gap: 68px; }
.legal-heading { position: sticky; top: 94px; }
.legal-card { overflow: hidden; border: 1px solid var(--line); border-radius: 22px; background: rgba(255,253,246,.74); box-shadow: 0 26px 60px -52px rgba(73,59,44,.78); }
.legal-card article { display: grid; grid-template-columns: 46px 1fr; gap: 18px; padding: 26px 28px; border-bottom: 1px solid var(--soft-line); }
.legal-index { color: var(--accent-strong); font: 900 10px var(--font-d); letter-spacing: .12em; }
.legal-card h3 { color: var(--tea); font: 900 17px/1.45 var(--font-s); }
.legal-card article p { margin-top: 10px; color: var(--muted); font-size: 10.5px; line-height: 1.9; }
.legal-card a { color: var(--accent-strong); font-weight: 800; text-underline-offset: 2px; }
.legal-contact { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 14px !important; padding: 10px 12px; border: 1px dashed var(--line); border-radius: 10px; background: var(--cream); }
.legal-contact b { color: var(--ink); font-size: 10px; }.legal-contact span { font-size: 9px; }
.legal-footnote { margin: 0; padding: 18px 28px 20px; color: var(--muted); background: rgba(239,210,142,.16); font-size: 9px; line-height: 1.8; }
.final-cta-section { padding: 80px 0 100px; }.final-cta-card { position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 50px; min-height: 300px; padding: 55px 64px; border-radius: 28px; color: var(--cream); background: var(--tea); }.final-cta-card .eyebrow { color: var(--yellow); }.final-cta-card .eyebrow span { color: var(--cream); }.final-cta-card h2 { color: var(--cream); font-size: clamp(38px,4vw,58px); }.final-cta-card h2 em { color: var(--yellow); }.final-cta-card p { max-width: 650px; margin-top: 18px; color: rgba(255,248,236,.72); font-size: 13px; line-height: 1.8; }.cta-watermark { position: absolute; right: 22%; bottom: -70px; color: rgba(255,255,255,.035); font: 900 230px/1 var(--font-d); }.final-button { position: relative; z-index: 2; display: grid; grid-template-columns: auto auto; align-items: center; gap: 5px 15px; min-width: 180px; padding: 17px 18px; border-radius: 16px; color: var(--tea); background: var(--yellow); font-size: 13px; font-weight: 900; text-decoration: none; }.final-button span { justify-self: end; font-size: 20px; }.final-button small { grid-column: 1 / -1; color: rgba(73,59,44,.56); font-size: 8px; font-weight: 700; }.site-footer { border-top: 1px solid var(--soft-line); }.footer-inner { min-height: 118px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }.footer-inner > div { display: flex; align-items: center; gap: 10px; }.footer-inner b { font: 900 13px var(--font-s); }.footer-inner p { color: var(--muted); font-size: 10px; }
.footer-inner p a { color: inherit; font-weight: 800; text-underline-offset: 2px; }
.footer-inner .footer-copy { display: grid; gap: 4px; text-align: right; }
.footer-copy small { color: var(--muted); font-size: 9.5px; line-height: 1.5; }

/* Typography readability pass: keep the visual hierarchy while avoiding overly tiny desktop copy. */
.header-nav a, .header-cta { font-size: 13px; }
.brand-copy small { font-size: 11px; }
.eyebrow { font-size: 12px; }
.eyebrow span { font-size: 15px; }
.hero-lede { font-size: 17px; }
.primary-btn, .secondary-btn { font-size: 14px; }
.hero-trust { font-size: 12px; }
.browser-title { font-size: 11px; }
.demo-badge, .mini-brand { font-size: 10px; }
.demo-account small, .operator-toolbar small, .account-switch { font-size: 10px; }
.share-trigger { font-size: 11px; }
.operator-copy span { font-size: 10px; line-height: 1.5; }
.level-line em, .awakening-chip { font-size: 9.5px; }
.popover-kicker, .share-popover small { font-size: 10px; }
.share-popover div span { font-size: 9.5px; }
.overlay-kicker, .share-view-overlay small { font-size: 10.5px; }
.media-placeholder span { font-size: 9.5px; }
.media-placeholder small { font-size: 10.5px; }
.split-heading p, .centered-heading p, .section-copy > p { font-size: 15.5px; }
.feature-tabs button > span, .feature-kicker { font-size: 11px; }
.feature-tabs b { font-size: 16px; }
.feature-tabs small { font-size: 11px; }
.feature-copy-panel h3 { font-size: 30px; }
.feature-copy-panel p { font-size: 14.5px; }
.feature-copy-panel li { font-size: 13.5px; line-height: 1.55; }
.feature-author-badge { font-size: 10.5px; }
.feature-author-badge > span { font-size: 10px; }
.visual-top span { font-size: 11px; }
.stage-placeholder-tag { font-size: 9.5px; }
.mini-op-card b { font-size: 13px; }
.mini-op-card span, .mini-op-card em { font-size: 10px; }
.visual-status, .inventory-row { font-size: 11px; }
.star-author-line { font-size: 10.5px; }
.star-author-line > span { font-size: 10px; }
.fake-shot small { font-size: 9.5px; }
.star-result b { font-size: 13px; }
.star-result span { font-size: 10px; }
.connection-card span { font-size: 10px; }
.connection-card em, .token-line button { font-size: 9.5px; }
.scope-pills span { font-size: 10.5px; }
.token-line small { font-size: 9.5px; }
.token-line code { font-size: 12px; }
.privacy-note b { font-size: 13.5px; }
.privacy-note small { font-size: 11.5px; }
.panel-label { font-size: 10.5px; }
.share-phone > small, .mystery-code span { font-size: 10.5px; }
.owner-panel button, .fake-input { font-size: 11px; }
.fake-input em, .code-flight span { font-size: 9.5px; }
.permission-head small { font-size: 9.5px; }
.permission-head b { font-size: 15px; }
.permission-head > span { font-size: 10.5px; }
.permission-list b { font-size: 12.5px; }
.permission-list small { font-size: 10px; line-height: 1.45; }
.permission-lines span { font-size: 9.5px; }
.permission-result b { font-size: 11.5px; }
.permission-result small { font-size: 9.5px; }
.privacy-principles span { font-size: 10.5px; }
.privacy-principles b { font-size: 17px; }
.privacy-principles p { font-size: 12.5px; }
.flow-label { font-size: 9.5px; }
.flow-source b, .flow-hub b { font-size: 17px; }
.flow-source i { font-size: 12px; }
.flow-hub small { font-size: 10px; }
.data-packet { font-size: 9px; }
.partner-card b { font-size: 12.5px; }
.partner-card small { font-size: 10px; line-height: 1.4; }
.partner-card > span { font-size: 9.5px; }
.ecosystem-disclaimer { font-size: 11px; }
.community-kicker { font-size: 11px; }
.community-showcase-head p { font-size: 14px; }
.community-author-card small { font-size: 11px; }
.community-author-card p { font-size: 12.5px; }
.community-author-card strong { font-size: 12px; }
.community-path-copy > small { font-size: 11px; }
.community-path-copy p { font-size: 14px; }
.community-path-copy li, .community-principles li { font-size: 13px; }
.community-path-link { font-size: 12px; }
.community-dev-note p { font-size: 13px; }
.community-dev-note > a { font-size: 12px; }
.community-integrity-card > p { font-size: 14px; }
.integrity-reject-list span { font-size: 11px; }
.community-integrity-card > small { font-size: 12px; }
.community-process { font-size: 11.5px; }
.roadmap-row > span { font-size: 11px; }
.roadmap-row b { font-size: 17px; }
.roadmap-row p { font-size: 12px; }
.roadmap-row em { font-size: 10px; }
.roadmap-credit { font-size: 10.5px; }
.legal-index { font-size: 11px; }
.legal-card h3 { font-size: 18px; }
.legal-card article p { font-size: 12.5px; }
.legal-contact b { font-size: 11.5px; }
.legal-contact span { font-size: 10.5px; }
.legal-footnote { font-size: 10.5px; }
.final-cta-card p { font-size: 15px; }
.final-button { font-size: 14px; }
.final-button small { font-size: 9.5px; }
.footer-inner b { font-size: 14px; }
.footer-inner p { font-size: 11.5px; }

@keyframes cardEnter { 0%,7%{opacity:0;transform:translateY(12px)} 12%,86%{opacity:1;transform:none} 92%,100%{opacity:0;transform:translateY(-5px)} }
@keyframes levelFlash { 0%,20%{opacity:.45} 28%,86%{opacity:1} 100%{opacity:.45} }
@keyframes awaken { 0%,28%{opacity:0;transform:translateY(4px)} 34%,86%{opacity:1;transform:none} 100%{opacity:0} }
@keyframes buttonPulse { 0%,38%,100%{box-shadow:none} 44%,54%{box-shadow:0 0 0 5px rgba(215,137,53,.16)} }
@keyframes sharePopover { 0%,43%{opacity:0;transform:translateY(-8px) scale(.96)} 48%,66%{opacity:1;transform:none} 72%,100%{opacity:0;transform:translateY(-4px)} }
@keyframes shareView { 0%,68%{opacity:0;transform:translateX(45px)} 74%,91%{opacity:1;transform:none} 96%,100%{opacity:0;transform:translateX(-20px)} }
@keyframes overlayCard { 0%,73%{opacity:0;transform:translateY(12px) rotate(3deg)} 78%,91%{opacity:1;transform:none} 96%,100%{opacity:0} }
@keyframes blink { 50%{opacity:.3} }
@keyframes stockPlus { 0%,30%{opacity:0;transform:translateY(5px)} 45%,90%{opacity:1;transform:none} 100%{opacity:0} }
@keyframes stockTotal { 0%,30%{opacity:.25;transform:translateY(3px)} 45%,100%{opacity:1;transform:none} }
@keyframes barGrow { from{transform:scaleY(.45)} to{transform:scaleY(1)} }
@keyframes scan { 0%{transform:translateY(10px);opacity:0} 10%{opacity:1} 80%{opacity:1} 100%{transform:translateY(210px);opacity:0} }
@keyframes resultIn { 0%,25%{opacity:0;transform:translateX(10px)} 40%,86%{opacity:1;transform:none} 100%{opacity:0} }
@keyframes codeFly { 0%,15%{opacity:0;transform:translateX(-40px) rotate(-4deg)} 28%,58%{opacity:1;transform:translateX(0)} 70%,100%{opacity:0;transform:translateX(45px) rotate(3deg)} }
@keyframes visitorCard { 0%,48%{opacity:0;transform:translateY(10px)} 58%,88%{opacity:1;transform:none} 100%{opacity:0} }
@keyframes packetMove { 0%{left:0;opacity:0} 10%{opacity:1} 80%{opacity:1} 100%{left:calc(100% - 42px);opacity:0} }
@media (max-width: 1050px) {
  .header-nav { display: none; }
  .hero-grid { grid-template-columns: 1fr; gap: 52px; }.hero-copy { max-width: 760px; }.hero-demo-wrap { width: min(100%,780px); }
  .share-layout { grid-template-columns: 1fr; gap: 48px; }.share-copy { max-width: 700px; }.share-animation-stage { max-width: 760px; }
  .ecosystem-flow { grid-template-columns: 150px 60px 150px 60px 1fr; }.partner-stack { grid-template-columns: 1fr; }
  .community-showcase-head { grid-template-columns: 1fr; gap: 12px; }.community-showcase-head p { max-width: 720px; }
  .roadmap-layout { grid-template-columns: 1fr; gap: 42px; }
  .legal-layout { grid-template-columns: 1fr; gap: 38px; }.legal-heading { position: static; }
}
@media (max-width: 780px) {
  .wrap { padding-inline: 20px; }.header-inner { min-height: 64px; }.header-cta { margin-left: auto; }.brand-copy small { display: none; }
  .hero-section { padding: 58px 0 72px; }.hero-copy h1 { font-size: clamp(42px,12vw,62px); }.hero-lede { font-size: 16px; }
  .hero-demo-body { grid-template-columns: 42px minmax(0,1fr); min-height: 420px; }.demo-workspace { padding: 16px; }.operator-grid { grid-template-columns: 1fr 1fr; }.card-c { display: none; }
  .media-placeholder { align-items: flex-start; flex-direction: column; }
  .section { padding: 76px 0; }.split-heading { grid-template-columns: 1fr; gap: 18px; }.split-heading p { justify-self: start; }
  .feature-tabs { grid-template-columns: repeat(2,1fr); }.feature-tabs button:nth-child(2) { border-right: 0; }.feature-tabs button:nth-child(-n+2) { border-bottom: 1px solid var(--soft-line); }
  .feature-stage { grid-template-columns: 1fr; }.feature-copy-panel { padding: 30px 22px; border-right: 0; border-bottom: 1px solid var(--line); }.feature-demo-panel { padding: 18px; }.stage-placeholder-tag { right: 28px; bottom: 28px; }
  .share-animation-stage { grid-template-columns: 1fr; gap: 20px; }.code-flight { min-height: 50px; transform: rotate(90deg); }.code-flight span { transform: rotate(-90deg); animation: none; }.share-phone { min-height: 280px; }
  .permission-demo { grid-template-columns: 1fr; gap: 20px; }.permission-lines { display: none; }.permission-result { grid-template-columns: repeat(2,1fr); }.permission-result > .panel-label { grid-column: 1 / -1; }
  .privacy-principles { grid-template-columns: 1fr; }
  .ecosystem-flow { grid-template-columns: 1fr; gap: 18px; }.flow-line { width: 1px; height: 48px; justify-self: center; border-top: 0; border-left: 1px dashed var(--accent); }.data-packet { display: none; }.flow-hub { width: 170px; justify-self: center; }.partner-stack { width: 100%; grid-template-columns: 1fr 1fr; }
  .community-showcase { padding: 24px; }.community-author-grid,.community-paths,.community-principles { grid-template-columns: 1fr; }.community-path-card { min-height: 0; }.community-dev-note { align-items: flex-start; flex-direction: column; }.community-process { justify-content: flex-start; }
  .final-cta-card { grid-template-columns: 1fr; padding: 38px 28px; }.cta-watermark { right: -20px; }
}
@media (max-width: 520px) {
  .header-cta { padding: 0 12px; font-size: 12px; }.hero-actions { align-items: stretch; flex-direction: column; }.primary-btn,.secondary-btn { justify-content: space-between; }
  .browser-bar { grid-template-columns: 1fr auto; }.browser-title { display: none; }.operator-grid { grid-template-columns: 1fr; }.card-b { display: none; }.share-popover { right: 12px; width: calc(100% - 24px); }
  .feature-tabs button { min-height: 76px; padding: 13px 12px; }.mini-card-grid { grid-template-columns: 1fr; }.ocr-layout { grid-template-columns: 1fr; }.ocr-arrow { transform: rotate(90deg); }.fake-shot { height: 180px; }
  .permission-result { grid-template-columns: 1fr; }.permission-result > .panel-label { grid-column: auto; }.partner-stack { grid-template-columns: 1fr; }
  .community-showcase { padding: 20px 18px; }.community-author-card { grid-template-columns: 42px 1fr; gap: 12px; padding: 16px; }.community-author-mark { width: 42px; height: 42px; }.community-author-card strong { grid-column: 2; justify-self: start; }.community-path-card { grid-template-columns: 36px 1fr; gap: 0 12px; padding: 22px 18px; }.community-path-index { width: 36px; height: 36px; }.community-path-copy h3 { font-size: 21px; }.community-path-link { grid-column: 2; }.community-principles article { padding: 22px 18px; }.community-process { align-items: flex-start; flex-direction: column; }.community-process i { display: none; }
  .roadmap-row { grid-template-columns: 58px 1fr; gap: 10px; padding: 16px 0; }.roadmap-row em { grid-column: 2; justify-self: start; }
  .legal-card article { grid-template-columns: 34px 1fr; gap: 10px; padding: 22px 18px; }.legal-footnote { padding: 16px 18px 18px; }
  .footer-inner { min-height: 110px; align-items: flex-start; justify-content: center; flex-direction: column; }.footer-inner p { line-height: 1.6; }.footer-inner .footer-copy { text-align: left; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  .operator-card,.awakening-chip,.share-view-overlay,.overlay-cards i,.visitor-box i,.visitor-card,.star-result article { opacity: 1; transform: none; }
  .share-popover { display: none; }
}
</style>
