<template>
  <div class="page-changelog-admin">
    <IslandSidebar />
    <main id="main-content">
      <header class="page-header">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台">← 返回管理工作台</router-link>
          <h1 class="page-header-title">更新日志管理</h1>
          <p class="page-header-description">编写、审核并发布 YuanHub 更新日志。</p>
        </div>
      </header>

      <section class="wrap workspace">
        <aside class="entry-list" aria-label="更新日志条目">
          <div class="list-head">
            <strong>日志条目</strong>
            <button v-if="canWrite" type="button" class="button primary compact" :disabled="operationLocked" @click="startNew">新建</button>
          </div>
          <p v-if="loading" class="list-state">正在加载…</p>
          <p v-else-if="loadError" class="list-state error" role="alert">{{ loadError }}<button type="button" :disabled="operationLocked" @click="reloadSelected">重试</button></p>
          <p v-else-if="!entries.length" class="list-state">暂无条目</p>
          <button
            v-for="entry in entries"
            :key="entry.id"
            type="button"
            class="entry-button"
            :disabled="operationLocked"
            :class="{ active: selected && selected.id === entry.id }"
            @click="selectEntry(entry)"
          >
            <span class="entry-title">{{ entryTitle(entry) }}</span>
            <span><i :class="statusClass(entry)">{{ statusLabel(entry) }}</i>{{ formatTime(entry.updatedAt) }}</span>
          </button>
          <footer v-if="entries.length" class="pager">
            <button type="button" :disabled="operationLocked || page <= 1" @click="changePage(page - 1)">上一页</button>
            <span>第 {{ page }} 页</span>
            <button type="button" :disabled="operationLocked || !hasNext" @click="changePage(page + 1)">下一页</button>
          </footer>
        </aside>

        <div class="editor-panel">
          <p v-if="!selected" class="empty-panel">选择一条日志，或新建日志开始编辑。</p>
          <template v-else>
            <header class="panel-head">
              <div class="editor-identity">
                <h2 class="editor-title">{{ form.title || (selected.id ? '未命名日志' : '新建日志') }}</h2>
                <div class="editor-context">
                  <span class="status" :class="statusClass(selected)">{{ statusLabel(selected) }}</span>
                  <small v-if="selected.id">文档版本 {{ selected.version }}</small>
                  <small v-else>尚未保存</small>
                </div>
              </div>
              <button v-if="conflict" type="button" class="button secondary" :disabled="operationLocked" @click="reloadSelected">重新加载</button>
            </header>

            <div v-if="canEditDraft || reviewable || canWithdraw" class="actions" role="group" aria-label="当前日志操作">
              <template v-if="canEditDraft">
                <button type="button" class="button secondary" :disabled="operationLocked" @click="saveDraft">{{ busy ? '处理中…' : '保存草稿' }}</button>
                <button v-if="working && working.state === 'DRAFT' && !dirty" type="button" class="button primary" :disabled="operationLocked" @click="submit">提交审核</button>
              </template>
              <template v-if="reviewable">
                <button type="button" class="button danger" :disabled="operationLocked || conflict" @click="reject">退回</button>
                <button type="button" class="button primary" :disabled="operationLocked || conflict" @click="approve">审核通过并发布</button>
              </template>
              <button v-if="canWithdraw" type="button" class="button danger ghost" :disabled="operationLocked || conflict" @click="withdraw">撤回公开版本</button>
            </div>

            <p v-if="conflict" class="notice error" role="alert">内容已被其他人修改。本地内容仍保留，请复制需要的内容后重新加载。</p>
            <p v-if="working && working.rejectionReason" class="notice rejected" role="status">退回原因：{{ working.rejectionReason }}</p>

            <div class="fields">
              <label>标题<input v-model="form.title" :disabled="!editable" maxlength="120" required @input="markDirty"></label>
              <label>版本标签<input v-model="form.versionLabel" :disabled="!editable" maxlength="40" required placeholder="例如 v1.6.0" @input="markDirty"></label>
            </div>

            <div class="editor-label"><div><span>正文</span><small>{{ editable ? '所见即所得编辑' : '只读预览' }}</small></div><button type="button" class="preview-toggle" :aria-pressed="preview" @click="preview = !preview">{{ preview ? '收起预览' : '预览' }}</button></div>
            <div v-if="editable && editor" class="toolbar" role="toolbar" aria-label="正文格式工具栏">
              <button type="button" :aria-pressed="editor.isActive('paragraph')" aria-label="正文段落" @click="editor.chain().focus().setParagraph().run()">正文</button>
              <button type="button" :aria-pressed="editor.isActive('heading', { level: 2 })" aria-label="二级标题" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
              <button type="button" :aria-pressed="editor.isActive('heading', { level: 3 })" aria-label="三级标题" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
              <button type="button" :aria-pressed="editor.isActive('bold')" aria-label="粗体" @click="editor.chain().focus().toggleBold().run()"><b>B</b></button>
              <button type="button" :aria-pressed="editor.isActive('italic')" aria-label="斜体" @click="editor.chain().focus().toggleItalic().run()"><i>I</i></button>
              <button type="button" :aria-pressed="editor.isActive('bulletList')" aria-label="无序列表" @click="editor.chain().focus().toggleBulletList().run()">• 列表</button>
              <button type="button" :aria-pressed="editor.isActive('orderedList')" aria-label="有序列表" @click="editor.chain().focus().toggleOrderedList().run()">1. 列表</button>
              <button type="button" :aria-pressed="editor.isActive('blockquote')" aria-label="引用" @click="editor.chain().focus().toggleBlockquote().run()">引用</button>
              <button type="button" :aria-pressed="editor.isActive('link')" aria-label="设置链接" @click="setLink">链接</button>
              <button type="button" aria-label="上传并插入图片" :disabled="uploading" @click="chooseImage">{{ imageUploadStage === 'optimizing' ? '优化中…' : (uploading ? '上传中…' : '图片') }}</button>
              <button v-if="editor.isActive('image')" type="button" aria-label="修改图片说明" @click="editImageAlt">图片说明</button>
              <button type="button" aria-label="撤销" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">撤销</button>
              <button type="button" aria-label="重做" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">重做</button>
              <input ref="imageInput" class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" @change="uploadImage">
            </div>
            <EditorContent v-if="editor" class="editor-surface" :editor="editor" aria-label="更新日志正文编辑器" />
            <p v-if="busy || uploading" class="notice" role="status">{{ busy ? '正在保存操作结果，请稍候…' : '正在处理图片，请稍候…' }}</p>
            <p v-if="actionError" class="notice error" role="alert">{{ actionError }}</p>

            <section v-if="preview" class="preview" aria-label="发布效果预览">
              <header><span>{{ form.versionLabel || '版本标签' }}</span><h2>{{ form.title || '标题' }}</h2></header>
              <ChangelogContent :body="editor ? editor.getJSON() : emptyChangelogBody()" />
            </section>
          </template>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import IslandSidebar from '../../components/IslandSidebar.vue'
import '../../styles/page-header.css'
import ChangelogContent from '../../components/changelog/ChangelogContent.vue'
import {
  approveChangelog,
  createChangelogDraft,
  listAdminChangelog,
  rejectChangelog,
  saveChangelogDraft,
  submitChangelog,
  withdrawChangelog
} from '../../api/changelog.js'
import { uploadMedia } from '../../api/media.js'
import { productVersionLabel } from '../../config/buildInfo.js'
import { IMAGE_UPLOAD_PROFILES, prepareImageUpload } from '../../utils/imageUpload.js'
import { auth } from '../../store/auth.js'
import { ADMIN_PERMISSIONS, hasPermission } from '../../utils/authPermissions.js'
import { changelogExtensions, emptyChangelogBody, isChangelogBodyEmpty } from '../../utils/changelogContent.js'
import { useUnsavedChanges } from '../../utils/useUnsavedChanges.js'

const entries = ref([])
const selected = ref(null)
const loading = ref(true)
const busy = ref(false)
const uploading = ref(false)
const switching = ref(false)
const imageUploadStage = ref('')
const dirty = ref(false)
const conflict = ref(false)
const preview = ref(false)
const loadError = ref('')
const actionError = ref('')
const page = ref(1)
const hasNext = ref(false)
const imageInput = ref(null)
const form = reactive({ title: '', versionLabel: '' })
let applyingContent = false
let mounted = false
let loadRequestId = 0
let operationId = 0
let contentRevision = 0

const currentUserId = computed(function () {
  const user = auth.userInfo || {}
  return String(user.id || user.userId || user.user_id || '')
})
const identity = computed(() => auth.accessToken ? currentUserId.value : '')
const operationLocked = computed(() => loading.value || busy.value || uploading.value || switching.value)
const confirmDiscard = useUnsavedChanges(computed(() => dirty.value || busy.value || uploading.value), '更新日志草稿')
const canWrite = computed(function () { return hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.CHANGELOG_WRITE) })
const canReview = computed(function () { return hasPermission(auth.adminAccess, ADMIN_PERMISSIONS.CHANGELOG_REVIEW) })
const working = computed(function () { return selected.value && selected.value.workingRevision })
const canEditDraft = computed(function () {
  return canWrite.value && !conflict.value && (!working.value || working.value.state === 'DRAFT')
})
const editable = computed(() => canEditDraft.value && !operationLocked.value)
const reviewable = computed(function () {
  return canReview.value && working.value && working.value.state === 'IN_REVIEW' && working.value.authoredBy !== currentUserId.value
})
const canWithdraw = computed(function () {
  return canReview.value && selected.value && selected.value.publishedRevision && !selected.value.withdrawnAt
})

const editor = useEditor({
  content: emptyChangelogBody(),
  extensions: changelogExtensions(),
  editable: false,
  onUpdate: function () { if (!applyingContent) dirty.value = true }
})

watch([editable, editor], function ([value, instance], oldValues) {
  if (!instance) return
  instance.setEditable(value, false)
  if (!oldValues || !oldValues[1]) {
    applyingContent = true
    instance.commands.setContent(displayedRevision(selected.value)?.body || emptyChangelogBody())
    nextTick(function () { applyingContent = false })
  }
}, { immediate: true })

function displayedRevision(entry) { return entry && (entry.workingRevision || entry.publishedRevision) }
function entryTitle(entry) { return displayedRevision(entry)?.title || '未命名日志' }
function statusLabel(entry) {
  if (entry.workingRevision?.state === 'IN_REVIEW') return '待审核'
  if (entry.workingRevision) return entry.publishedRevision ? '修订草稿' : '草稿'
  if (entry.withdrawnAt) return '已撤回'
  return entry.publishedRevision ? '已发布' : '草稿'
}
function statusClass(entry) { return 'status-' + statusLabel(entry) }
function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false })
}
function markDirty() { dirty.value = true }

async function load(nextPage, preferredId) {
  const requestId = ++loadRequestId
  const userId = identity.value
  loading.value = true
  loadError.value = ''
  try {
    const result = await listAdminChangelog({ page: nextPage })
    if (!mounted || requestId !== loadRequestId || userId !== identity.value) return
    entries.value = result.data
    page.value = result.page
    hasNext.value = result.hasNext
    const next = result.data.find(function (item) { return item.id === preferredId }) || result.data[0] || null
    if (next) applyEntry(next)
    else applyEntry(null)
  } catch (error) {
    if (!mounted || requestId !== loadRequestId || userId !== identity.value) return
    loadError.value = error?.message || '更新日志加载失败'
  } finally {
    if (mounted && requestId === loadRequestId && userId === identity.value) loading.value = false
  }
}

async function switchEditor(action) {
  if (operationLocked.value) return
  const userId = identity.value
  const revision = contentRevision
  switching.value = true
  try {
    if (await confirmDiscard() && mounted && userId === identity.value && revision === contentRevision) await action()
  } finally { if (mounted && userId === identity.value) switching.value = false }
}
function selectEntry(entry) { if (entry !== selected.value) return switchEditor(() => applyEntry(entry)) }
function changePage(nextPage) { return switchEditor(() => load(nextPage)) }
function applyEntry(entry) {
  const contentVersion = ++contentRevision
  selected.value = entry
  const revision = displayedRevision(entry)
  form.title = revision?.title || ''
  form.versionLabel = revision?.versionLabel || ''
  actionError.value = ''
  conflict.value = false
  preview.value = false
  applyingContent = true
  if (editor.value) editor.value.commands.setContent(revision?.body || emptyChangelogBody())
  dirty.value = false
  nextTick(function () { if (contentVersion === contentRevision) applyingContent = false })
}
function startNew() {
  return switchEditor(function () {
    applyEntry({ id: '', version: 0, workingRevision: null, publishedRevision: null, updatedAt: null })
    // 新建日志默认填入当前产品版本，仍允许手动改成历史版本标签。
    form.versionLabel = productVersionLabel
    dirty.value = true
  })
}

function validateForm() {
  if (!form.title.trim()) return '请填写标题'
  if (!form.versionLabel.trim()) return '请填写版本标签'
  if (!editor.value || isChangelogBodyEmpty(editor.value.getJSON())) return '请填写正文'
  return ''
}
function localPayload() { return { title: form.title, versionLabel: form.versionLabel, body: editor.value.getJSON(), expectedVersion: selected.value.version } }
function replaceEntry(entry) {
  const index = entries.value.findIndex(function (item) { return item.id === entry.id })
  if (index >= 0) entries.value.splice(index, 1, entry)
  else entries.value.unshift(entry)
  applyEntry(entry)
}
async function mutate(action) {
  if (operationLocked.value || !selected.value) return
  const requestId = ++operationId
  const entry = selected.value
  const userId = identity.value
  const ownsResult = () => mounted && requestId === operationId && userId === identity.value && entry === selected.value
  busy.value = true
  actionError.value = ''
  try {
    const result = await action()
    if (ownsResult()) replaceEntry(result)
  }
  catch (error) {
    if (!ownsResult()) return
    actionError.value = error?.message || '操作失败'
    if (error?.status === 409 || error?.code === 'version_conflict') conflict.value = true
  } finally { if (mounted && requestId === operationId && userId === identity.value) busy.value = false }
}
async function saveDraft() {
  if (!editable.value || !selected.value) return
  const error = validateForm()
  if (error) { actionError.value = error; return }
  await mutate(function () {
    return selected.value.id ? saveChangelogDraft(selected.value.id, localPayload()) : createChangelogDraft(localPayload())
  })
}
function submit() { if (canEditDraft.value && working.value?.state === 'DRAFT' && !dirty.value) mutate(function () { return submitChangelog(selected.value.id, selected.value.version) }) }
function approve() {
  if (operationLocked.value || conflict.value || !reviewable.value) return
  if (window.confirm('审核通过后将立即公开此版本，确定发布吗？')) mutate(function () { return approveChangelog(selected.value.id, selected.value.version) })
}
function reject() {
  if (operationLocked.value || conflict.value || !reviewable.value) return
  const reason = window.prompt('请填写退回原因')
  if (reason?.trim()) mutate(function () { return rejectChangelog(selected.value.id, selected.value.version, reason.trim()) })
}
async function withdraw() {
  if (operationLocked.value || !canWithdraw.value) return
  const entry = selected.value
  const userId = identity.value
  switching.value = true
  try {
    if (!await confirmDiscard() || !mounted || entry !== selected.value || userId !== identity.value) return
    if (!window.confirm('撤回后公开页面将不再显示此条目，确定继续吗？')) return
    switching.value = false
    await mutate(function () { return withdrawChangelog(entry.id, entry.version) })
  } finally { if (mounted && userId === identity.value) switching.value = false }
}
function reloadSelected() { return switchEditor(() => load(page.value, selected.value?.id)) }

function setLink() {
  if (!editable.value) return
  const current = editor.value.getAttributes('link').href || ''
  const href = window.prompt('请输入链接地址（http/https 或站内 / 路径）', current)
  if (href === null) return
  if (!href.trim()) editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
  else editor.value.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
}
function chooseImage() { if (editable.value) imageInput.value?.click() }
async function uploadImage(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || !editable.value || !selected.value) return
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { actionError.value = '仅支持 JPG、PNG、WebP 图片'; return }
  const alt = window.prompt('请填写图片说明，便于无法查看图片的用户理解内容', '')
  if (alt === null) return
  const requestId = ++operationId
  const entry = selected.value
  const userId = identity.value
  const ownsResult = () => mounted && requestId === operationId && userId === identity.value && entry === selected.value
  uploading.value = true
  imageUploadStage.value = 'optimizing'
  actionError.value = ''
  try {
    const optimized = await prepareImageUpload(file, IMAGE_UPLOAD_PROFILES.CHANGELOG)
    if (!ownsResult()) return
    imageUploadStage.value = 'uploading'
    const media = await uploadMedia(optimized.file)
    if (!ownsResult()) return
    if (!media?.id || !media?.url) throw new Error('图片上传响应无效')
    editor.value.chain().focus().setImage({ src: media.url, alt: alt.trim(), title: null, media_id: media.id }).run()
  } catch (error) {
    if (!ownsResult()) return
    actionError.value = error?.message || '图片上传失败'
  } finally {
    if (ownsResult()) {
      imageUploadStage.value = ''
      uploading.value = false
    }
  }
}
function editImageAlt() {
  if (!editable.value) return
  const alt = window.prompt('图片说明', editor.value.getAttributes('image').alt || '')
  if (alt !== null) editor.value.chain().focus().updateAttributes('image', { alt: alt.trim() }).run()
}

watch(identity, function () {
  loadRequestId += 1
  operationId += 1
  entries.value = []
  hasNext.value = false
  page.value = 1
  busy.value = false
  uploading.value = false
  switching.value = false
  imageUploadStage.value = ''
  loadError.value = ''
  loading.value = false
  applyEntry(null)
  if (mounted && identity.value) load(1)
}, { flush: 'sync' })
onMounted(function () { mounted = true; load(1) })
onBeforeUnmount(function () { mounted = false; loadRequestId += 1; operationId += 1 })
</script>

<style scoped>
.page-changelog-admin { min-height: 100vh; min-height: 100dvh }
.workspace { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 22px; padding-block: 12px 60px }
.entry-list,.editor-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.entry-list { min-width: 0; align-self: start; overflow: hidden }
.list-head,.panel-head,.actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 18px; border-bottom: 1px solid var(--line) }
.list-head strong { font-family: var(--font-s); font-size: 18px }
.entry-button { width: 100%; display: grid; gap: 7px; padding: 14px 18px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--ink); text-align: left; cursor: pointer }
.entry-button:hover:not(:disabled),.entry-button.active { background: var(--paper) }
.entry-button:disabled { cursor: default }
.entry-button.active { box-shadow: inset 3px 0 var(--accent) }
.entry-title { font-weight: 800; overflow-wrap: anywhere }
.entry-button span:last-child { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--ink-60); font-size: 11px }
.entry-button i,.status { padding: 3px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--ink); font-style: normal; font-size: 11px; font-weight: 800 }
.status-待审核 { border-color: var(--accent) !important; color: var(--accent) !important }
.status-已发布 { background: var(--yellow); border-color: transparent !important }
.status-已撤回 { color: var(--rouge) !important }
.list-state,.empty-panel { padding: 48px 18px; color: var(--ink-60); text-align: center }
.list-state button { display: block; margin: 10px auto 0 }
.pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; color: var(--ink-60); font-size: 11px }
.pager button { border: 0; background: transparent; color: var(--ink); cursor: pointer }
.pager button:disabled { opacity: .4; cursor: default }
.editor-panel { min-width: 0; align-self: start; overflow: hidden }
.panel-head { border-bottom: 1px solid var(--line) }
.editor-identity { min-width: 0 }
.editor-title { margin: 0 0 6px; font: 900 20px/1.4 var(--font-s); color: var(--tea); overflow-wrap: anywhere }
.editor-context { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px }
.panel-head > .button { flex: none }
.panel-head small { color: var(--ink-60) }
.fields { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; padding: 20px 20px 0 }
.fields label { display: grid; gap: 7px; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.fields input { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--paper); color: var(--ink); font: inherit; outline: none }
.fields input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(215,137,53,.16) }
.editor-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px 8px; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.editor-label > div { display: grid; gap: 3px }
.editor-label small { font-size: 11px; font-weight: 400 }
.preview-toggle { min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: var(--ink); font: 700 12px var(--font-b); white-space: nowrap; cursor: pointer }
.preview-toggle[aria-pressed=true] { background: var(--paper); border-color: var(--accent) }
.toolbar { margin: 0; border-radius: 0; box-shadow: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 20px; border-block: 1px solid var(--line); background: var(--paper) }
.toolbar button { min-height: 44px; padding: 0 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--ink); cursor: pointer }
.toolbar button[aria-pressed=true] { background: var(--tea); color: var(--cream) }
.toolbar button:disabled { opacity: .45; cursor: default }
.editor-surface { margin: 0 20px 20px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface) }
.editor-surface :deep(.tiptap) { overflow-wrap: anywhere; min-height: 360px; padding: 18px; color: var(--ink); line-height: 1.8; outline: none }
.editor-surface :deep(.tiptap:focus) { box-shadow: 0 0 0 3px rgba(215,137,53,.18) }
.editor-surface :deep(h2),.editor-surface :deep(h3) { margin: 1.2em 0 .5em; font-family: var(--font-s) }
.editor-surface :deep(ul),.editor-surface :deep(ol) { padding-left: 1.6em }
.editor-surface :deep(blockquote) { padding-left: 1em; border-left: 3px solid var(--accent) }
.editor-surface :deep(img) { max-width: 100%; height: auto; border-radius: 10px }
.notice { margin: 14px 20px 0; padding: 10px 12px; border-radius: 8px; background: var(--paper); color: var(--ink-60) }
.notice.error { border: 1px solid var(--rouge); color: var(--rouge) }
.notice.rejected { border-left: 3px solid var(--accent) }
.preview { margin: 20px; padding: 24px; border: 1px dashed var(--accent); border-radius: 12px; background: var(--paper) }
.preview header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--line) }
.preview header span { display: inline-block; margin-bottom: 8px; padding: 3px 9px; border-radius: 999px; background: var(--yellow); font-size: 11px; font-weight: 800 }
.preview h2 { font-family: var(--font-s) }
.actions { justify-content: flex-end; flex-wrap: wrap; border-bottom: 1px solid var(--line); background: var(--paper) }
.button { white-space: nowrap; min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 8px; font-weight: 800; cursor: pointer }
.button.compact { min-height: 44px; padding-inline: 12px }
.button.primary { border-color: var(--tea); background: var(--tea); color: var(--cream) }
.button.secondary { background: var(--surface); color: var(--ink) }
.button.danger { border-color: var(--rouge); background: var(--rouge); color: var(--cream) }
.button.danger.ghost { background: transparent; color: var(--rouge) }
.button:disabled { opacity: .5; cursor: default }
.entry-button:focus-visible,.button:focus-visible,.pager button:focus-visible,.preview-toggle:focus-visible,.toolbar button:focus-visible,.list-state button:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px }
.pager button,.list-state button { min-height: 44px }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; clip: rect(0,0,0,0); overflow: hidden; white-space: nowrap; border: 0 }
@media (max-width: 900px) { .workspace { grid-template-columns: 1fr } .entry-list { max-height: 330px; overflow-y: auto } }
@media (max-width: 640px) { .workspace { padding-block: 12px 36px; gap: 14px } .fields { grid-template-columns: 1fr } .actions .button { flex: 1 1 44% } }
</style>
