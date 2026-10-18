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
          <h2 id="read-capabilities">第一步：你能获取什么</h2>
          <p>{{ guide.introduction }}</p>
          <ul><li v-for="boundary in guide.boundaries" :key="boundary">{{ boundary }}</li></ul>
        </section>
        <section aria-labelledby="read-connection">
          <h2 id="read-connection">第二步：创建 API 连接码</h2>
          <ol><li v-for="step in guide.connectionSteps" :key="step">{{ step }}</li></ol>
          <router-link class="developer-button" :to="guide.connectionPath"><KeyRound :size="17" aria-hidden="true" />前往创建连接码</router-link>
          <p class="developer-help">连接码创建仍受站点当前体验资格限制；若提示资格不足，按个人中心的指引处理。本页无需登录即可阅读。</p>
          <p class="developer-security">连接码只在自己的本地工具中填写。不要把真实 Token 粘贴到公共聊天、搜索框或 AI 提示词中，也不需要提供账号密码、JWT 或刷新令牌。</p>
        </section>
        <section aria-labelledby="read-ai">
          <h2 id="read-ai">第三步：交给 AI 帮你接入</h2>
          <p>把下面的说明发给 Codex 或你使用的 AI 编程工具。等工具做好后，再按它的指引在自己的本地环境填写连接码。</p>
          <button class="developer-button developer-copy-prompt" type="button" :disabled="copying" @click="copyPrompt">
            <Copy :size="18" aria-hidden="true" />{{ copying ? '正在复制…' : '复制给 AI，让它帮我接入' }}
          </button>
          <p class="developer-copy-feedback" role="status" aria-live="polite">{{ feedback }}</p>
          <details ref="promptDetails" class="developer-prompt-preview">
            <summary>查看完整 AI 接入说明，也可手动复制</summary>
            <label for="developer-ai-prompt">接入说明（不含真实连接码）</label>
            <textarea id="developer-ai-prompt" ref="promptText" :value="prompt" readonly rows="12" spellcheck="false" />
          </details>
        </section>
        <section aria-labelledby="read-examples">
          <h2 id="read-examples">第四步：查看示例和常见问题</h2>
          <p>AI 会帮你处理这些细节；如果你想自己试试，可以参考下面的最小示例。</p>
          <h3>用 curl 读取一次</h3>
          <p>下面是 Bash / zsh 终端示例。API 后端根地址为 <code>{{ apiBase }}</code>，不是文档页面地址；本机开发地址只能在能访问该服务的环境使用。</p>
          <DocumentCode :text="curl" language="bash" />
          <p class="developer-help">默认不传 game；需要筛选时，可使用 <code>--get --data-urlencode 'game=如鸢'</code>，替换成你的实际游戏。</p>
          <h3>成功响应长什么样</h3>
          <p>下面是按当前后端 DTO 整理的结构示例，账号和密探 ID 均为占位符，不是真实用户数据。可空字段可能为 null 或省略。</p>
          <DocumentCode :text="JSON.stringify(guide.example, null, 2)" language="json" />
          <dl class="developer-field-list"><template v-for="field in guide.fields" :key="field.name">
            <dt><code>{{ field.name }}</code></dt><dd>{{ field.description }}</dd>
          </template></dl>
          <router-link to="/developers/api/operator#doc-公共密探目录">查看公共密探目录说明</router-link>
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
import { ArrowRight, Copy, KeyRound } from '@lucide/vue'
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

<style src="./developers.css"></style>
<style src="./developerProduct.css"></style>
<style src="./developerProductMobile.css"></style>
<style src="./developerProductDesktop.css"></style>
