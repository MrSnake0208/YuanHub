<template>
  <div class="page-developers">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header"><div class="wrap">
        <router-link v-if="documentId !== 'home'" class="page-header-back" to="/developers">开发者中心</router-link>
        <h1 class="page-header-title">{{ current?.title || '文档不存在' }}</h1>
        <p class="page-header-description">{{ current?.summary || '请从目录选择已公开的文档。' }}</p>
        <p v-if="current" class="page-header-context">{{ current.version }} · {{ current.status }} · 核对 {{ current.updated }}</p>
      </div></header>
      <div class="wrap developer-layout">
        <details ref="directory" class="developer-directory" :open="wideLayout">
          <summary>文档目录 · {{ current?.title || '选择文档' }}</summary>
          <nav aria-label="开发者文档目录">
            <router-link class="developer-tutorial-link" to="/developers/use-cases/operator-read">第三方应用接入：用户密探养成</router-link>
            <label class="developer-search">查找文档
              <input v-model="query" type="search" placeholder="标题、协议版本或能力" />
            </label>
            <template v-for="group in groups" :key="group.title">
              <section v-if="group.documents.length" class="developer-nav-group">
                <h2>{{ group.title }}</h2>
                <router-link v-for="doc in group.documents" :key="doc.id" :to="doc.path"
                  :aria-current="current?.id === doc.id ? 'page' : undefined" @click="closeDirectory">
                  {{ doc.title }}
                </router-link>
              </section>
            </template>
            <p v-if="!groups.some(group => group.documents.length)" role="status">没有匹配文档，试试“V5”或“历练”。</p>
            <section v-if="headings.length && !query" class="developer-nav-group developer-chapters">
              <h2>本页章节</h2>
              <router-link v-for="heading in headings" :key="heading.id" :to="{ hash: '#' + encodeURIComponent(heading.id) }"
                :class="{ 'is-subheading': heading.depth === 3 }" @click="closeDirectory">{{ heading.title }}</router-link>
            </section>
          </nav>
        </details>
        <article class="developer-reading" :aria-busy="loading" aria-label="文档正文">
          <p v-if="!current" class="developer-state" role="alert">此文档不存在或尚未公开。<router-link to="/developers/protocols">查看支持矩阵</router-link></p>
          <p v-else-if="loading" class="developer-state" role="status">正在加载文档…</p>
          <div v-else-if="error" class="developer-state" role="alert">
            <p>{{ error }}</p><button type="button" @click="loadDocument">重新加载</button>
            <router-link to="/developers">返回开发者中心</router-link>
          </div>
          <template v-else>
            <div class="developer-downloads" aria-label="文档资源下载">
              <a :href="developerAssetUrl(current.source)" :download="fileName(current.source)"><Download :size="14" aria-hidden="true" />Markdown 原文</a>
              <a v-for="file in current.downloads" :key="file" :href="developerAssetUrl(file)" :download="fileName(file)">
                <Download :size="14" aria-hidden="true" />{{ downloadLabel(file) }}
              </a>
            </div>
            <p v-if="anchorMissing" class="developer-anchor-status" role="status">该章节不存在，以下为当前文档内容。</p>
            <DocumentBody :key="current.id" :tokens="tokens" :source="current.source" :asset-url="developerAssetUrl" />
            <footer class="developer-reading-footer">
              <router-link to="/developers/protocols">协议支持矩阵</router-link>
              <router-link to="/developers/changelog">协议更新记录</router-link>
              <router-link to="/developers/gaps">尚未实现的能力</router-link>
            </footer>
          </template>
        </article>
      </div>
    </main>
  </div>
</template>

<script setup>
import '@/styles/page-header.css'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Download } from '@lucide/vue'
import IslandSidebar from '../../components/IslandSidebar.vue'
import DocumentBody from '../../components/developers/DocumentBody.js'
import { developerDocuments } from '../../data/developerManifest.js'
import { developerAssetUrl } from '../../data/developerAssets.js'
import { parseDeveloperMarkdown } from '../../utils/developerMarkdown.js'

const props = defineProps({ documentId: { type: String, default: 'home' } })
const route = useRoute()
const current = computed(() => developerDocuments.find(doc => doc.id === props.documentId && doc.path === route.path.replace(/\/$/, '')))
const directory = ref(null)
const directoryMedia = window.matchMedia('(min-width: 1200px)')
const wideLayout = ref(directoryMedia.matches)
const updateDirectoryLayout = event => { wideLayout.value = event.matches }
directoryMedia.addEventListener('change', updateDirectoryLayout)
const query = ref('')
const loading = ref(false)
const error = ref('')
const anchorMissing = ref(false)
const tokens = shallowRef([])
const headings = ref([])
let controller
let requestId = 0

const groups = computed(() => {
  const filter = doc => (doc.title + doc.summary + doc.version + doc.status).toLowerCase().includes(query.value.trim().toLowerCase())
  return [
    { title: '开始接入', documents: developerDocuments.filter(doc => ['home', 'guide', 'api', 'protocols'].includes(doc.id) && filter(doc)) },
    { title: '接口参考', documents: developerDocuments.filter(doc => doc.id.startsWith('api-') && filter(doc)) },
    { title: '正式协议与约定', documents: developerDocuments.filter(doc => doc.path.startsWith('/developers/protocols/') && doc.status !== '兼容旧版' && filter(doc)) },
    { title: '历史兼容', documents: developerDocuments.filter(doc => doc.status === '兼容旧版' && filter(doc)) },
    { title: '维护记录', documents: developerDocuments.filter(doc => ['changelog', 'gaps'].includes(doc.id) && filter(doc)) }
  ]
})
const fileName = file => file.split('/').pop()
const downloadLabel = file => (file.includes('.schema.') ? 'Schema · ' : file.includes('invalid') ? '反例 · ' : '示例 · ') + fileName(file)
function closeDirectory() { if (directory.value && !wideLayout.value) directory.value.open = false }

async function scrollToChapter() {
  await nextTick()
  if (loading.value || error.value || !current.value) return
  anchorMissing.value = false
  if (!route.hash) return
  let id
  try { id = decodeURIComponent(route.hash.slice(1)) } catch { anchorMissing.value = true; return }
  // Restrict deep-link scrolling to this document's nodes, never another page control.
  const element = id.startsWith('doc-') ? document.getElementById(id) : null
  if (!element) { anchorMissing.value = true; return }
  element.scrollIntoView?.({ block: 'start' })
  element.focus?.({ preventScroll: true })
}

async function loadDocument() {
  const id = ++requestId
  controller?.abort()
  error.value = ''
  tokens.value = []
  headings.value = []
  anchorMissing.value = false
  loading.value = !!current.value
  if (!current.value) return
  controller = new AbortController()
  try {
    const response = await fetch(developerAssetUrl(current.value.source), { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) throw new Error('Document unavailable')
    const markdown = await response.text()
    if (!/^#\s+\S/m.test(markdown) || /^\s*(?:<!doctype|<html)/i.test(markdown)) throw new Error('Invalid document response')
    if (id !== requestId) return
    const parsed = parseDeveloperMarkdown(markdown)
    tokens.value = parsed.tokens
    headings.value = parsed.headings
  } catch (cause) {
    if (id !== requestId || cause.name === 'AbortError') return
    error.value = '文档暂时无法加载，请检查网络后重试；站点更新后也可刷新页面。'
  } finally {
    if (id === requestId) {
      loading.value = false
      document.title = `${current.value.title} — YuanHub`
      await scrollToChapter()
    }
  }
}
watch(current, () => { closeDirectory(); query.value = ''; loadDocument() }, { immediate: true })
watch(() => route.hash, scrollToChapter)
onBeforeUnmount(() => { requestId += 1; controller?.abort(); directoryMedia.removeEventListener('change', updateDirectoryLayout) })
</script>

<style src="./developers.css"></style>
<style src="./developersMobile.css"></style>
<style src="./developersDesktop.css"></style>
