<template>
  <div class="page-developers developer-product">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap">
        <router-link class="page-header-back" to="/developers">返回开发者中心</router-link>
        <h1 class="page-header-title">{{ guide.title }}</h1>
        <p class="page-header-description">{{ guide.description }}</p>
      </div></header>
      <div class="wrap developer-product-content developer-tutorial">
        <section aria-labelledby="read-capabilities">
          <h2 id="read-capabilities">功能与权限</h2>
          <p>{{ guide.introduction }}</p>
          <ul><li v-for="boundary in guide.boundaries" :key="boundary">{{ boundary }}</li></ul>
          <h3>账号与密探响应结构</h3>
          <p>以下为当前后端 DTO 的结构示例，账号和密探 ID 均为占位符。可空字段可能为 null 或省略。</p>
          <DocumentCode :text="JSON.stringify(guide.example, null, 2)" language="json" />
          <dl class="developer-field-list"><template v-for="field in guide.fields" :key="field.name">
            <dt><code>{{ field.name }}</code></dt><dd>{{ field.description }}</dd>
          </template></dl>
          <router-link to="/developers/api/operator#doc-公共密探目录">查看公共密探目录与 ID 映射</router-link>
        </section>
        <section aria-labelledby="read-debug">
          <h2 id="read-debug">开发者调试：先用自己的测试账号</h2>
          <p>先确认数据与权限，再使用你拥有的测试账号创建仅含 <code>operator:read</code> 的 Token，验证接口与响应。测试 Token 只能访问绑定的测试账号，不能写进将来分发给所有用户的应用。</p>
          <router-link :to="guide.connectionPath">为测试账号创建连接码</router-link>
          <h3>用 curl 验证只读请求</h3>
          <p>以下为 Bash / zsh 终端示例。API 后端根地址为 <code>{{ apiBase }}</code>，不是文档地址；本机开发地址只在能访问该服务的环境可用。正式接入应确认目标站点的部署地址。</p>
          <DocumentCode :text="curl" language="bash" />
          <p class="developer-help">默认不传 game；筛选时可用 <code>--get --data-urlencode 'game=如鸢'</code>，替换为实际游戏。环境变量 OPENAPI_TOKEN 只用于本次单账号调试。</p>
          <h3>服务端按应用用户调用</h3>
          <p>以下 Node.js 示例展示已有后端的接入位置，不是完整应用。将 <code>credentialStore.getForUser</code> 接到现有的按用户隔离、加密保存的凭据存储，用户 ID 必须来自已验证的服务端会话。调用方捕获网络、超时和非 JSON 错误，向当前用户返回受控提示，禁止记录凭据。</p>
          <DocumentCode :text="guide.serverExample" language="javascript" />
          <p class="developer-help">连接及重新连接时，先调用 <code>GET /open-api/operator/account</code> 核对账号，再成功读取 current 验证权限。此示例不包含存储、登录和 UI 实现，需融入你的项目。</p>
        </section>
        <section aria-labelledby="read-connection">
          <h2 id="read-connection">应用用户授权：每位用户独立连接</h2>
          <p>当前采用用户手动创建并提供 OpenAPI Token 的模式，没有 OAuth、一键账号授权或自动换取 Token。每个 Token 只绑定一个游戏子账号，不接受额外 account_id 切换账号；第三方应用需要为每位用户维护独立连接状态。</p>
          <ol><li v-for="step in guide.connectionSteps" :key="step">{{ step }}</li></ol>
          <router-link to="/developers/guide#doc-用户操作说明">可在你的产品中引用：用户创建与撤销连接码说明</router-link>
          <h3>断开本应用与撤销 Token</h3>
          <p>应用应提供“断开连接”：停止该用户的请求和后台任务，删除本应用保存的凭据及私有缓存，阻止断开前的请求回写。这样仅代表本应用已断开，不能显示“YuanHub Token 已撤销”。</p>
          <p>要使凭据失效，用户还需进入 YuanHub 个人中心，在对应连接卡片选择“停止连接”并确认。撤销成功后后续 API 请求将不再通过该 Token；不会收回应用已取得的数据。建议为本应用单独创建 Token，避免撤销共用凭据影响其他工具。</p>
          <p class="developer-help">连接状态由实际校验结果确定：成功核对账号并读取后才显示已连接；401 提示重新连接；403 提示检查 Scope/Beta；网络失败不等于撤销。管理 Token 的接口使用站内 JWT，应用不能拿 OpenAPI Token 自行撤销或扩权。</p>
        </section>
        <section aria-labelledby="read-security">
          <h2 id="read-security">接入与上线安全</h2>
          <ul>
            <li><strong>有后端的应用：</strong>微信小程序、网站、App、桌面软件均可通过自己的后端接入。用户经 HTTPS 提供凭据；后端按已认证应用用户加密存储，密钥单独管理，并由服务端请求 YuanHub。客户端只接收该用户需要的数据。</li>
            <li><strong>纯前端网站或无后端小程序：</strong>长期 Token 会暴露在客户端运行环境中，脚本注入、调试和依赖风险可能导致泄漏。优先采用受控后端；直连还需确认 CORS、小程序请求域名等平台网络约束，不能承诺任意平台可直接调用。</li>
            <li><strong>无后端桌面客户端或 App：</strong>仅使用该用户自行提供的 Token，优先用系统安全凭据库；本地恶意程序、设备失窃或逆向仍可能泄漏。客户端本地存储不具备服务器级安全保护。</li>
            <li><strong>多用户隔离：</strong>连接记录、请求、响应、缓存、后台任务按应用用户隔离；服务端从可信会话取用户身份，不能信任请求体中的用户 ID。切换、断开账号时清理旧数据并处理未完成请求。</li>
          </ul>
          <p class="developer-security">禁止将用户 Token 写入前端公开包、应用内置常量、公开仓库、URL、日志、截图或错误上报。不要向 AI 提供真实 Token、登录密码、JWT 或刷新令牌。API 后端地址使用受控配置，不转发凭据到用户任意指定的地址。</p>
          <h3>当前 Beta 与规模限制</h3>
          <p>每个游戏子账号最多 5 个 Token（不是开发者整个应用只能连接 5 人），长期有效至用户撤销。创建、修改 Scope 和 API 调用均受 Token 所有者的当前 Beta 资格限制；文档公开不代表所有玩家都能创建或使用 Token。</p>
          <p>为 500 名玩家上线小程序前，需要确认每位玩家的访问资格、手动连接体验和部署环境约束。当前没有正式 OAuth 应用授权流程，也没有统一 API 速率与大规模接入服务承诺。<router-link to="/developers/gaps#doc-后续任务建议正式第三方应用授权">查看独立后续任务建议</router-link>。</p>
        </section>
        <section aria-labelledby="read-ai">
          <h2 id="read-ai">将完整集成需求交给 AI</h2>
          <p>在你的第三方项目中使用 Codex 或其他 AI 编程工具，让它先调查现有技术栈和架构，再实现按用户连接。尚未提供项目时，提示词会要求先确认目标平台与代码环境。</p>
          <button class="developer-button developer-copy-prompt" type="button" :disabled="copying" @click="copyPrompt">
            <Copy :size="18" aria-hidden="true" />{{ copying ? '正在复制…' : '复制第三方应用接入需求给 AI' }}
          </button>
          <p class="developer-copy-feedback" role="status" aria-live="polite">{{ feedback }}</p>
          <details ref="promptDetails" class="developer-prompt-preview">
            <summary>查看完整 AI 接入说明，也可手动复制</summary>
            <label for="developer-ai-prompt">接入说明（不含真实连接码）</label>
            <textarea id="developer-ai-prompt" ref="promptText" :value="prompt" readonly rows="12" spellcheck="false" />
          </details>
          <h3>接入中的常见问题</h3>
          <div class="developer-faqs"><details v-for="faq in guide.faqs" :key="faq.title">
            <summary>{{ faq.title }}</summary><p>{{ faq.answer }}</p>
          </details></div>
        </section>
        <footer class="developer-product-footer">
          <router-link :to="guide.referencePath">查看完整密探 API 文档<ArrowRight :size="16" aria-hidden="true" /></router-link>
          <router-link to="/developers">返回选择其他数据</router-link>
        </footer>
      </div>
    </main>
  </div>
</template>

<script setup>
import '@/styles/page-header.css'
import { nextTick, ref } from 'vue'
import { ArrowRight, Copy } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import DocumentCode from '../../components/developers/DocumentCode.vue'
import { API_BASE } from '../../api/request.js'
import { operatorReadGuide as guide } from '../../data/developerUseCases.js'

const apiBase = new URL(API_BASE || '/', window.location.origin).href.replace(/\/$/, '')
const prompt = `${guide.prompt}\n本次站点的 API 后端根地址（BASE_URL）：${apiBase}\n`
const curl = guide.curl.replace('https://YOUR_YUANHUB_API_ORIGIN', apiBase)
const copying = ref(false)
const feedback = ref('只复制开发说明，不会读取或复制你的连接码。')
const promptDetails = ref(null)
const promptText = ref(null)

async function copyPrompt() {
  copying.value = true
  feedback.value = '正在复制接入说明…'
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(prompt)
    feedback.value = '已复制。现在可以粘贴给 AI 编程工具；无需附上真实连接码。'
  } catch {
    feedback.value = '复制失败，已展开完整说明。请手动复制下方文字。'
    if (promptDetails.value) promptDetails.value.open = true
    await nextTick()
    promptText.value?.focus()
    promptText.value?.select()
  } finally {
    copying.value = false
  }
}
</script>

<style>
@import './developers.css';
@import './developerProduct.css';
@import './developerProductMobile.css';
@import './developerProductDesktop.css';
</style>
