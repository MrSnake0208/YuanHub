<template>
  <div class="page-level-admin">
    <IslandSidebar />

    <main id="main-content">
      <header class="hero">
        <div class="wrap">
          <AdminBackLink />
          <div class="crumb">
            <span class="pill fill">内容维护</span>
            <span class="pill">公共关卡库</span>
            <span class="pill">管理</span>
          </div>
          <h1>公共关卡库<span class="small">管理端</span></h1>
          <p class="hero-sub">维护全站共享的关卡、分类和开放状态。归档只隐藏目录条目，不会让已有作业引用失效。</p>
          <div class="hero-stats">
            <div><div class="k">当前条目</div><div class="v">{{ rows.length }}<small>条</small></div></div>
            <div><div class="k">筛选结果</div><div class="v">{{ filteredRows.length }}<small>条</small></div></div>
            <div><div class="k">目录版本</div><div class="v compact">{{ catalogVersion || '—' }}</div></div>
            <div><div class="k">分类节点</div><div class="v">{{ categoryNodeCount }}<small>个</small></div></div>
          </div>
        </div>
      </header>

      <section class="level-content">
        <div class="wrap">
          <div v-if="error" class="state error" role="alert">
            {{ error }}
            <button class="state-retry" type="button" @click="load">重试</button>
          </div>

          <template v-else>
            <div class="level-toolbar">
              <label>
                <span>游戏</span>
                <select v-model="filters.game" aria-label="按游戏筛选">
                  <option value="">全部游戏</option>
                  <option v-for="game in GAME_OPTIONS" :key="game" :value="game">{{ game }}</option>
                </select>
              </label>
              <label>
                <span>一级分类</span>
                <select v-model="filters.catOne" aria-label="按一级分类筛选">
                  <option value="">全部分类</option>
                  <option v-for="category in categoryOptions" :key="category" :value="category">{{ category }}</option>
                </select>
              </label>
              <label>
                <span>目录状态</span>
                <select v-model="filters.status" aria-label="按目录状态筛选">
                  <option value="">全部状态</option>
                  <option value="ACTIVE">有效</option>
                  <option value="ARCHIVED">已归档</option>
                </select>
              </label>
              <label class="level-search">
                <span class="sr-only">搜索关卡</span>
                <Search :size="17" aria-hidden="true" />
                <input v-model.trim="filters.q" type="search" placeholder="搜索名称、Stage ID、Level ID" aria-label="搜索关卡名称或 ID" />
              </label>
              <span class="toolbar-spacer"></span>
              <button class="command secondary" type="button" :disabled="loading" title="刷新关卡目录" @click="load">
                <RefreshCw :size="16" aria-hidden="true" />刷新
              </button>
              <button class="command secondary" type="button" :disabled="exporting" @click="downloadExport">
                <Download :size="16" aria-hidden="true" />{{ exporting ? '导出中…' : '导出 JSON' }}
              </button>
              <button class="command primary" type="button" @click="openNew">
                <Plus :size="17" aria-hidden="true" />新建关卡
              </button>
            </div>

            <div v-if="loading" class="state" role="status" aria-live="polite">
              <LoaderCircle :size="20" aria-hidden="true" />正在加载公共关卡库…
            </div>

            <template v-else>
              <div class="list-summary" aria-live="polite">
                <span>显示 {{ filteredRows.length }} / {{ rows.length }} 条</span>
                <span v-if="notice" class="notice-text" role="status">{{ notice }}</span>
              </div>

              <div class="level-table-wrap">
                <table class="level-table">
                  <caption class="sr-only">公共关卡库管理列表</caption>
                  <thead>
                    <tr>
                      <th>游戏</th><th>一级分类</th><th>二级分类</th><th>三级分类</th>
                      <th>名称</th><th>Stage ID</th><th>Level ID</th><th>状态</th>
                      <th>开放</th><th>排序</th><th>修订</th><th>结束时间</th><th class="ops-col"><span class="sr-only">操作</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in filteredRows" :key="row.id">
                      <td><span class="game-tag">{{ row.game || '—' }}</span></td>
                      <td>{{ row.catOne || '—' }}</td>
                      <td>{{ row.catTwo || '—' }}</td>
                      <td>{{ row.catThree || '—' }}</td>
                      <td><strong>{{ row.name || '未命名' }}</strong></td>
                      <td><code>{{ row.stageId || '—' }}</code></td>
                      <td><code>{{ row.levelId || '—' }}</code></td>
                      <td><span class="status-tag" :class="row.status.toLowerCase()">{{ statusLabel(row.status) }}</span></td>
                      <td><span class="open-tag" :class="{ closed: !row.isOpen }">{{ row.isOpen ? '开放' : '未开放' }}</span></td>
                      <td>{{ row.sortOrder }}</td>
                      <td>{{ row.revision }}</td>
                      <td class="time-cell">{{ formatTime(row.endTime) || '—' }}</td>
                      <td class="ops-col">
                        <button class="table-action" type="button" :aria-label="'编辑 ' + row.name" @click="openEdit(row)"><Pencil :size="15" aria-hidden="true" />编辑</button>
                        <button v-if="row.status !== 'ARCHIVED'" class="table-action danger" type="button" :aria-label="'归档 ' + row.name" @click="changeArchiveState(row)">归档</button>
                        <button v-else class="table-action" type="button" :aria-label="'恢复 ' + row.name" @click="changeArchiveState(row)">恢复</button>
                      </td>
                    </tr>
                    <tr v-if="filteredRows.length === 0"><td colspan="13" class="empty-row">没有符合条件的关卡</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="level-mobile-list">
                <article v-for="row in filteredRows" :key="row.id" class="level-mobile-card">
                  <header>
                    <div><span class="game-tag">{{ row.game || '—' }}</span><strong>{{ row.name || '未命名' }}</strong></div>
                    <span class="status-tag" :class="row.status.toLowerCase()">{{ statusLabel(row.status) }}</span>
                  </header>
                  <dl>
                    <div><dt>分类</dt><dd>{{ [row.catOne, row.catTwo, row.catThree].filter(Boolean).join(' / ') || '—' }}</dd></div>
                    <div><dt>Stage ID</dt><dd><code>{{ row.stageId || '—' }}</code></dd></div>
                    <div><dt>Level ID</dt><dd><code>{{ row.levelId || '—' }}</code></dd></div>
                    <div><dt>状态</dt><dd>{{ row.isOpen ? '开放' : '未开放' }} · 修订 {{ row.revision }}</dd></div>
                  </dl>
                  <footer>
                    <button class="table-action" type="button" @click="openEdit(row)"><Pencil :size="15" aria-hidden="true" />编辑</button>
                    <button v-if="row.status !== 'ARCHIVED'" class="table-action danger" type="button" @click="changeArchiveState(row)">归档</button>
                    <button v-else class="table-action" type="button" @click="changeArchiveState(row)">恢复</button>
                  </footer>
                </article>
                <p v-if="filteredRows.length === 0" class="empty-row">没有符合条件的关卡</p>
              </div>

              <div class="level-lower-grid">
                <section class="tree-panel" aria-labelledby="level-tree-title">
                  <header class="panel-head">
                    <div><span class="eyebrow">READ ONLY</span><h2 id="level-tree-title">分类树预览</h2></div>
                    <span>{{ categoryNodeCount }} 个节点</span>
                  </header>
                  <p class="panel-hint">分类树由当前目录列表派生，仅用于检查层级，不支持拖拽编辑。</p>
                  <div v-if="catalogTree.length" class="catalog-tree">
                    <ul>
                      <li v-for="game in catalogTree" :key="game.label">
                        <strong>{{ game.label }}</strong>
                        <ul>
                          <li v-for="one in game.children" :key="one.label">
                            <span>{{ one.label }}</span>
                            <ul>
                              <li v-for="two in one.children" :key="two.label">
                                <span>{{ two.label }}</span>
                                <ul>
                                  <li v-for="three in two.children" :key="three.label"><span>{{ three.label }}</span><small>{{ three.count }} 条</small></li>
                                </ul>
                              </li>
                            </ul>
                          </li>
                        </ul>
                      </li>
                    </ul>
                  </div>
                  <p v-else class="panel-empty">暂无可预览的分类。</p>
                </section>

                <section class="import-panel" aria-labelledby="level-import-title">
                  <header class="panel-head">
                    <div><span class="eyebrow">SAFE IMPORT</span><h2 id="level-import-title">批量导入</h2></div>
                    <span>先预览，再确认</span>
                  </header>
                  <p class="panel-hint">粘贴导出 JSON 或 <code>{ levels: [...] }</code> 文档。预览不会写入数据库。</p>
                  <textarea v-model="importText" aria-label="关卡导入 JSON" placeholder="{\n  &quot;levels&quot;: []\n}" @input="previewResult = null"></textarea>
                  <div class="import-actions">
                    <button class="command secondary" type="button" :disabled="importLoading || !importText.trim()" @click="previewImport"><Search :size="16" aria-hidden="true" />{{ importLoading ? '处理中…' : '预览导入' }}</button>
                    <button class="command primary" type="button" :disabled="importLoading || !previewResult || previewResult.invalid > 0 || previewResult.conflicts > 0" @click="commitImport"><Upload :size="16" aria-hidden="true" />确认导入</button>
                  </div>
                  <p v-if="importError" class="inline-error" role="alert">{{ importError }}</p>
                  <div v-if="previewResult" class="import-preview" aria-live="polite">
                    <div v-for="item in importStats" :key="item.key" class="import-stat"><strong>{{ item.value }}</strong><span>{{ item.label }}</span></div>
                    <ul v-if="previewResult.errorDetails.length || previewResult.conflictDetails.length" class="import-details">
                      <li v-for="(detail, index) in previewResult.errorDetails.concat(previewResult.conflictDetails)" :key="index">{{ detailText(detail) }}</li>
                    </ul>
                  </div>
                </section>
              </div>
            </template>
          </template>
        </div>
      </section>

      <Teleport to="body">
        <div v-if="editing" class="editor-mask" role="presentation" @click.self="closeEditor">
          <section class="editor-panel" role="dialog" aria-modal="true" aria-labelledby="level-editor-title">
            <header class="editor-head">
              <div><span class="eyebrow">LEVEL CATALOG</span><h2 id="level-editor-title">{{ isNew ? '新建关卡' : '编辑关卡' }}</h2><p>{{ isNew ? '新增条目会生成稳定的关卡 ID。' : '保存时会校验当前 revision，避免覆盖其他管理员的修改。' }}</p></div>
              <button class="icon-command" type="button" title="关闭编辑器" :disabled="saving" @click="closeEditor"><X :size="19" aria-hidden="true" /></button>
            </header>
            <div v-if="editorError" class="editor-error" role="alert">{{ editorError }}<button v-if="revisionConflict" type="button" @click="reloadAfterConflict">重新加载</button></div>
            <div class="editor-fields">
              <label><span>游戏</span><select v-model="form.game"><option v-for="game in GAME_OPTIONS" :key="game" :value="game">{{ game }}</option></select></label>
              <label><span>一级分类</span><input v-model.trim="form.catOne" autocomplete="off" /></label>
              <label><span>二级分类</span><input v-model.trim="form.catTwo" autocomplete="off" /></label>
              <label><span>三级分类</span><input v-model.trim="form.catThree" autocomplete="off" /></label>
              <label class="wide"><span>名称</span><input v-model.trim="form.name" autocomplete="off" /></label>
              <label><span>Stage ID</span><input v-model.trim="form.stageId" autocomplete="off" /></label>
              <label><span>Level ID</span><input v-model.trim="form.levelId" autocomplete="off" /></label>
              <label><span>开放状态</span><select v-model="form.isOpen"><option :value="true">开放</option><option :value="false">未开放</option></select></label>
              <label><span>目录状态</span><select v-model="form.status" :disabled="!isNew" :title="isNew ? '' : '编辑已有关卡时请使用列表中的归档/恢复操作'"><option value="ACTIVE">有效</option><option value="ARCHIVED">已归档</option></select></label>
              <label><span>排序值</span><input v-model.number="form.sortOrder" type="number" min="0" step="1" /></label>
              <label class="wide"><span>结束时间（可选，需带时区）</span><input v-model.trim="form.endTime" autocomplete="off" placeholder="2026-09-07T23:59:59+08:00" /></label>
            </div>
            <p v-if="!isNew" class="revision-note">当前 revision：{{ form.revision }}</p>
            <footer class="editor-actions">
              <button class="command secondary" type="button" :disabled="saving" @click="closeEditor">取消</button>
              <button class="command primary" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存关卡' }}</button>
            </footer>
          </section>
        </div>
      </Teleport>

      <SiteFooter>
        <template #big>公共关卡库<br><span>管理端</span></template>
        <template #fine><b>YuanHub</b> · 公共关卡库管理<br>仅具有关卡目录写入权限的管理员可编辑<br>目录变更会即时影响公共 API</template>
      </SiteFooter>
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { Download, LoaderCircle, Pencil, Plus, RefreshCw, Search, Upload, X } from '@lucide/vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import AdminBackLink from '../../components/admin/AdminBackLink.vue'
import {
  archiveAdminLevel,
  commitAdminLevelImport,
  createAdminLevel,
  exportAdminLevelCatalog,
  isLevelRevisionConflict,
  listAdminLevelCatalog,
  normalizeLevel,
  normalizeLevelImportPreview,
  previewAdminLevelImport,
  restoreAdminLevel,
  toLevelImportDocument,
  updateAdminLevel
} from '../../api/level.js'

const GAME_OPTIONS = Object.freeze(['代号鸢', '如鸢', '通用'])
const router = useRouter()
const rows = ref([])
const catalogVersion = ref('')
const loading = ref(true)
const error = ref('')
const notice = ref('')
const exporting = ref(false)
const filters = reactive({ game: '', catOne: '', status: '', q: '' })

const editing = ref(false)
const editingMode = ref('new')
const form = ref(blankForm())
const saving = ref(false)
const editorError = ref('')
const revisionConflict = ref(false)

const importText = ref('')
const importLoading = ref(false)
const importError = ref('')
const importDocument = ref(null)
const previewResult = ref(null)

function blankForm() {
  return {
    id: '', game: '通用', catOne: '', catTwo: '', catThree: '', name: '',
    levelId: '', stageId: '', status: 'ACTIVE', isOpen: true, sortOrder: 0,
    endTime: '', revision: 0
  }
}

const isNew = computed(function () { return editingMode.value === 'new' })

const filteredRows = computed(function () {
  const query = filters.q.trim().toLowerCase()
  return rows.value.filter(function (row) {
    if (filters.game && row.game !== filters.game) return false
    if (filters.catOne && row.catOne !== filters.catOne) return false
    if (filters.status && row.status !== filters.status) return false
    if (!query) return true
    return [row.game, row.catOne, row.catTwo, row.catThree, row.name, row.stageId, row.levelId]
      .filter(Boolean).join(' ').toLowerCase().includes(query)
  })
})

const categoryOptions = computed(function () {
  return Array.from(new Set(rows.value.map(function (row) { return row.catOne }).filter(Boolean))).sort()
})

function treeNode(label) {
  return { label: label || '未分类', count: 0, children: [] }
}

function findOrCreate(nodes, label) {
  let node = nodes.find(function (item) { return item.label === (label || '未分类') })
  if (!node) {
    node = treeNode(label)
    nodes.push(node)
  }
  return node
}

const catalogTree = computed(function () {
  const tree = []
  rows.value.forEach(function (row) {
    const game = findOrCreate(tree, row.game)
    const one = findOrCreate(game.children, row.catOne)
    const two = findOrCreate(one.children, row.catTwo)
    const three = findOrCreate(two.children, row.catThree)
    game.count += 1
    one.count += 1
    two.count += 1
    three.count += 1
  })
  return tree
})

const categoryNodeCount = computed(function () {
  return catalogTree.value.reduce(function (total, game) {
    return total + 1 + game.children.reduce(function (oneTotal, one) {
      return oneTotal + 1 + one.children.reduce(function (twoTotal, two) {
        return twoTotal + 1 + two.children.length
      }, 0)
    }, 0)
  }, 0)
})

const importStats = computed(function () {
  if (!previewResult.value) return []
  return [
    { key: 'added', label: '新增', value: previewResult.value.added },
    { key: 'updated', label: '更新', value: previewResult.value.updated },
    { key: 'identical', label: '完全相同', value: previewResult.value.identical },
    { key: 'duplicate', label: '重复', value: previewResult.value.duplicate },
    { key: 'invalid', label: '错误', value: previewResult.value.invalid },
    { key: 'conflicts', label: '冲突', value: previewResult.value.conflicts }
  ]
})

function statusLabel(status) {
  return status === 'ARCHIVED' ? '已归档' : '有效'
}

function formatTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
}

function detailText(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return String(value)
  return value.message || value.reason || value.detail || JSON.stringify(value)
}

function humanError(err, fallback) {
  if (!err) return fallback
  if (/Failed to fetch|NetworkError|fetch/i.test(err.message || '')) return '网络异常，请检查后端服务是否已启动'
  return err.message || fallback
}

async function leaveIfForbidden(err) {
  if (!err || err.status !== 403) return false
  await router.replace({ path: '/forbidden', query: { from: '/level/admin' } })
  return true
}

function latestUpdatedAt(levels) {
  return levels.map(function (row) { return row.updatedAt }).filter(Boolean).sort().pop() || ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await listAdminLevelCatalog()
    rows.value = (data.levels || []).map(normalizeLevel).sort(function (a, b) {
      return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
    })
    catalogVersion.value = data.catalogVersion || latestUpdatedAt(rows.value)
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    rows.value = []
    error.value = humanError(err, '公共关卡库加载失败')
  } finally {
    loading.value = false
  }
}

function openNew() {
  editingMode.value = 'new'
  form.value = blankForm()
  editorError.value = ''
  revisionConflict.value = false
  editing.value = true
}

function openEdit(row) {
  editingMode.value = 'edit'
  form.value = { ...blankForm(), ...normalizeLevel(row), endTime: row.endTime || '' }
  editorError.value = ''
  revisionConflict.value = false
  editing.value = true
}

function closeEditor(force = false) {
  if (saving.value && !force) return
  editing.value = false
  editorError.value = ''
  revisionConflict.value = false
}

async function reloadAfterConflict() {
  closeEditor()
  await load()
  notice.value = '已重新加载最新目录，请重新打开关卡后再保存。'
}

async function save() {
  saving.value = true
  editorError.value = ''
  revisionConflict.value = false
  try {
    if (isNew.value) await createAdminLevel(form.value)
    else await updateAdminLevel(form.value.id, form.value)
    closeEditor(true)
    await load()
    notice.value = '关卡已保存，目录版本已刷新。'
  } catch (err) {
    if (isLevelRevisionConflict(err)) {
      revisionConflict.value = true
      editorError.value = '此关卡已被其他管理员修改，请重新加载最新数据后再保存。'
    } else if (await leaveIfForbidden(err)) {
      closeEditor(true)
    } else {
      editorError.value = humanError(err, '保存失败')
    }
  } finally {
    saving.value = false
  }
}

async function changeArchiveState(row) {
  const restoring = row.status === 'ARCHIVED'
  if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(restoring ? '确认恢复该关卡？' : '确认归档该关卡？归档不会删除历史引用。')) return
  try {
    if (restoring) await restoreAdminLevel(row.id, row.revision)
    else await archiveAdminLevel(row.id, row.revision)
    await load()
    notice.value = restoring ? '关卡已恢复。' : '关卡已归档。'
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    error.value = humanError(err, restoring ? '恢复失败' : '归档失败')
  }
}

function parseImport() {
  let parsed
  try {
    parsed = JSON.parse(importText.value)
  } catch (_err) {
    throw new Error('导入内容不是有效 JSON')
  }
  return toLevelImportDocument(parsed)
}

async function previewImport() {
  importLoading.value = true
  importError.value = ''
  previewResult.value = null
  try {
    importDocument.value = parseImport()
    previewResult.value = normalizeLevelImportPreview(await previewAdminLevelImport(importDocument.value))
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    importError.value = humanError(err, '导入预览失败')
  } finally {
    importLoading.value = false
  }
}

async function commitImport() {
  if (!importDocument.value || !previewResult.value) return
  importLoading.value = true
  importError.value = ''
  try {
    await commitAdminLevelImport(importDocument.value)
    previewResult.value = null
    importDocument.value = null
    await load()
    notice.value = '导入已确认，目录列表已刷新。'
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    importError.value = humanError(err, '导入确认失败')
  } finally {
    importLoading.value = false
  }
}

async function downloadExport() {
  exporting.value = true
  try {
    const exported = await exportAdminLevelCatalog()
    const document = toLevelImportDocument(exported)
    const blob = new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = 'level-catalog.json'
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    notice.value = '已导出当前关卡目录。'
  } catch (err) {
    if (await leaveIfForbidden(err)) return
    error.value = humanError(err, '导出失败')
  } finally {
    exporting.value = false
  }
}

load()
</script>

<style scoped>
.page-level-admin { min-height: 100vh }
.page-level-admin .hero::after { content: '关' }
.level-content { padding-bottom: 20px }
.hero-stats .compact { font-size: clamp(16px, 2vw, 24px); line-height: 1.35; overflow-wrap: anywhere }
.level-toolbar {
  display: flex; align-items: end; gap: 10px; flex-wrap: wrap; margin-top: 24px;
  padding: 14px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 16px;
}
.level-toolbar label { display: flex; flex-direction: column; gap: 5px; min-width: 128px; color: var(--ink-60); font-size: 11px; font-weight: 800 }
.level-toolbar select, .level-search input {
  min-height: 40px; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px;
  color: var(--ink); background: var(--paper); font: 13px var(--font-b); outline: none;
}
.level-toolbar select:focus, .level-search:focus-within, .level-search input:focus { border-color: var(--accent); outline: none }
.level-search { min-width: min(280px, 100%); flex: 1; flex-direction: row !important; align-items: center; min-height: 40px; padding: 0 11px; border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink-35) !important; background: var(--paper) }
.level-search input { width: 100%; min-width: 0; border: 0; padding-left: 0; background: transparent }
.toolbar-spacer { flex: 1 }
.command { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: 10px; padding: 9px 14px; font: 800 13px var(--font-b); cursor: pointer; text-decoration: none; transition: background-color .25s, transform .25s, opacity .25s }
.command:hover:not(:disabled) { transform: translateY(-1px) }
.command:disabled { opacity: .45; cursor: not-allowed }
.command.primary { color: var(--cream); background: var(--tea) }
.command.primary:hover:not(:disabled) { background: var(--tea-deep) }
.command.secondary { color: var(--ink); background: var(--paper); border: 1.5px solid var(--line) }
.command.secondary:hover:not(:disabled) { border-color: var(--accent); background: var(--cream) }
.state { min-height: 160px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 18px; padding: 28px; color: var(--ink-60); background: var(--surface); border: 1px solid var(--line); border-radius: 16px; text-align: center }
.state.error { color: var(--rouge); flex-wrap: wrap }
.state-retry { min-height: 36px; border: 0; color: var(--accent-strong); background: transparent; font: inherit; font-weight: 800; text-decoration: underline; cursor: pointer }
.list-summary { display: flex; align-items: center; gap: 16px; min-height: 40px; margin-top: 14px; color: var(--ink-60); font-size: 12px; font-weight: 700 }
.notice-text { color: var(--accent-strong) }
.level-table-wrap { margin-top: 2px; overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 8px 10px; scrollbar-gutter: stable }
.level-table { width: 100%; min-width: 1320px; border-collapse: separate; border-spacing: 0; font-size: 12.5px }
.level-table th { padding: 10px 8px; color: var(--ink-60); border-bottom: 1px dashed var(--line); font-size: 11px; font-weight: 800; text-align: left; white-space: nowrap }
.level-table td { padding: 11px 8px; border-bottom: 1px solid rgba(156, 122, 77, .13); vertical-align: middle; white-space: nowrap }
.level-table tbody tr:last-child td { border-bottom: 0 }
.level-table tbody tr:hover { background: rgba(156, 122, 77, .05) }
.level-table code, .level-mobile-card code { color: var(--ink-60); font: 11px var(--font-d); overflow-wrap: anywhere }
.game-tag, .status-tag, .open-tag { display: inline-flex; align-items: center; min-height: 23px; border-radius: 7px; padding: 3px 8px; font-size: 11px; font-weight: 800; white-space: nowrap }
.game-tag { color: var(--ink); background: var(--yellow) }
.status-tag { color: var(--ink); background: rgba(191, 220, 192, .85) }
.status-tag.archived { color: var(--rouge); background: rgba(166, 81, 74, .12) }
.open-tag { color: var(--accent-strong); background: rgba(215, 137, 53, .12) }
.open-tag.closed { color: var(--ink-60); background: rgba(73, 59, 44, .08) }
.time-cell { color: var(--ink-60); font-size: 11px }
.ops-col { position: sticky; right: 0; z-index: 2; min-width: 160px; background: var(--surface); box-shadow: -10px 0 16px -17px rgba(73, 59, 44, .8) }
.level-table thead .ops-col { z-index: 3 }
.level-table tbody tr:hover .ops-col { background: color-mix(in srgb, var(--surface) 95%, var(--tea)) }
.table-action { min-height: 34px; display: inline-flex; align-items: center; gap: 5px; margin-left: 4px; padding: 6px 8px; border: 1.5px solid var(--line); border-radius: 8px; color: var(--ink-60); background: transparent; font: 800 11px var(--font-b); cursor: pointer }
.table-action:hover { color: var(--ink); border-color: var(--ink) }
.table-action.danger { color: var(--rouge); border-color: rgba(166, 81, 74, .35) }
.empty-row { padding: 38px 20px !important; color: var(--ink-35); text-align: center !important }
.level-mobile-list { display: none }
.level-lower-grid { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 16px; margin-top: 22px }
.tree-panel, .import-panel { min-width: 0; padding: 20px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; border-bottom: 1px dashed var(--line); padding-bottom: 12px }
.panel-head h2 { margin-top: 4px; color: var(--ink); font: 900 22px var(--font-s) }
.panel-head > span { color: var(--ink-35); font-size: 11px; white-space: nowrap }
.eyebrow { color: var(--accent-strong); font: 800 10px var(--font-d); letter-spacing: .14em }
.panel-hint { margin: 12px 0; color: var(--ink-60); font-size: 12px; line-height: 1.7 }
.panel-hint code { color: var(--accent-strong); font: 11px var(--font-d) }
.catalog-tree, .catalog-tree ul { list-style: none; padding-left: 0 }
.catalog-tree { max-height: 330px; overflow: auto; padding: 2px 4px }
.catalog-tree ul { padding-left: 17px; border-left: 1px solid var(--line) }
.catalog-tree > ul { padding-left: 0; border-left: 0 }
.catalog-tree li { padding: 4px 0; color: var(--ink); font-size: 12.5px }
.catalog-tree li > span, .catalog-tree li > strong { display: inline-block; max-width: calc(100% - 45px); overflow-wrap: anywhere }
.catalog-tree small { margin-left: 7px; color: var(--ink-35); font: 10px var(--font-d) }
.panel-empty { color: var(--ink-35); font-size: 12px }
.import-panel textarea { width: 100%; min-height: 150px; resize: vertical; border: 1.5px solid var(--line); border-radius: 10px; padding: 10px; color: var(--ink); background: var(--paper); font: 12px/1.6 var(--font-d); outline: none }
.import-panel textarea:focus { border-color: var(--accent) }
.import-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px }
.inline-error, .editor-error { color: var(--rouge); font-size: 12px; line-height: 1.6 }
.inline-error { margin-top: 9px }
.import-preview { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-top: 12px }
.import-stat { min-width: 0; padding: 8px 5px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); text-align: center }
.import-stat strong { display: block; color: var(--ink); font: 900 19px var(--font-d) }
.import-stat span { color: var(--ink-60); font-size: 10px; white-space: nowrap }
.import-details { grid-column: 1 / -1; max-height: 100px; overflow: auto; margin: 2px 0 0; padding-left: 20px; color: var(--rouge); font-size: 11px; line-height: 1.6 }
.editor-mask { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 24px; background: rgba(73, 59, 44, .34); backdrop-filter: blur(2px) }
.editor-panel { width: min(720px, 100%); max-height: 90vh; overflow-y: auto; padding: 24px 26px; background: var(--surface); border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 32px 80px -24px rgba(73, 59, 44, .4) }
.editor-head { display: flex; align-items: flex-start; gap: 12px; border-bottom: 1px dashed var(--line); padding-bottom: 14px }
.editor-head h2 { margin-top: 4px; color: var(--ink); font: 900 23px var(--font-s) }
.editor-head p { margin-top: 5px; color: var(--ink-60); font-size: 12px; line-height: 1.6 }
.icon-command { flex: none; width: 44px; height: 44px; display: grid; place-items: center; margin: -8px -8px 0 auto; border: 0; border-radius: 10px; color: var(--ink-60); background: transparent; cursor: pointer }
.icon-command:hover { color: var(--ink); background: var(--paper) }
.editor-error { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: rgba(166, 81, 74, .1) }
.editor-error button { min-height: 32px; padding: 5px 9px; border: 1px solid rgba(166, 81, 74, .35); border-radius: 8px; color: var(--rouge); background: transparent; font: 800 11px var(--font-b); cursor: pointer }
.editor-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 13px 14px; padding-top: 18px }
.editor-fields label { display: flex; flex-direction: column; gap: 5px; color: var(--ink-60); font-size: 12px; font-weight: 800 }
.editor-fields label.wide { grid-column: 1 / -1 }
.editor-fields input, .editor-fields select { min-height: 40px; width: 100%; border: 1.5px solid var(--line); border-radius: 10px; padding: 8px 10px; color: var(--ink); background: var(--paper); font: 13px var(--font-b); outline: none }
.editor-fields input:focus, .editor-fields select:focus { border-color: var(--accent) }
.revision-note { margin-top: 12px; color: var(--ink-35); font: 11px var(--font-d) }
.editor-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 18px; border-top: 1px dashed var(--line); padding-top: 16px }
.table-action:focus-visible, .command:focus-visible, .icon-command:focus-visible, .editor-error button:focus-visible, .level-toolbar select:focus-visible, .editor-fields input:focus-visible, .editor-fields select:focus-visible, .import-panel textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }

@media (max-width: 767px) {
  .page-level-admin .hero-sub { display: none }
  .page-level-admin .hero h1 { font-size: 34px }
  .page-level-admin .hero-stats { grid-template-columns: repeat(2, 1fr); margin-top: 18px }
  .page-level-admin .hero-stats > div { padding: 13px 14px 16px }
  .page-level-admin .hero-stats .v { font-size: 22px }
  .level-toolbar { position: sticky; top: 64px; z-index: 30; display: grid; grid-template-columns: 1fr 1fr; align-items: stretch; gap: 9px; margin-top: 16px; padding: 11px; box-shadow: 0 12px 28px -24px rgba(73, 59, 44, .58) }
  .level-toolbar label { min-width: 0 }
  .level-search { grid-column: 1 / -1; min-width: 0; min-height: 44px }
  .level-search input { min-height: 40px; font-size: 16px }
  .toolbar-spacer { display: none }
  .level-toolbar .command { min-height: 44px; padding: 8px 9px; font-size: 12px }
  .level-toolbar .command.primary { grid-column: 1 / -1 }
  .level-table-wrap { display: none }
  .level-mobile-list { display: flex; flex-direction: column; gap: 10px; margin-top: 3px }
  .level-mobile-card { overflow: hidden; padding: 13px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px }
  .level-mobile-card header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px }
  .level-mobile-card header > div { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 7px }
  .level-mobile-card header strong { overflow-wrap: anywhere; font: 900 18px var(--font-s) }
  .level-mobile-card dl { display: grid; gap: 7px; margin: 13px 0 0; padding-top: 11px; border-top: 1px dashed var(--line) }
  .level-mobile-card dl div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; min-width: 0 }
  .level-mobile-card dt { color: var(--ink-35); font-size: 11px; font-weight: 800 }
  .level-mobile-card dd { min-width: 0; margin: 0; color: var(--ink); font-size: 12px; overflow-wrap: anywhere }
  .level-mobile-card footer { display: flex; justify-content: flex-end; gap: 5px; margin-top: 12px; padding-top: 9px; border-top: 1px solid rgba(156, 122, 77, .13) }
  .level-lower-grid { grid-template-columns: 1fr; margin-top: 16px }
  .tree-panel, .import-panel { padding: 16px }
  .import-preview { grid-template-columns: repeat(3, minmax(0, 1fr)) }
  .editor-mask { align-items: end; padding: 10px }
  .editor-panel { max-height: 92vh; padding: 20px 16px }
  .editor-fields { grid-template-columns: 1fr; gap: 11px }
  .editor-fields label.wide { grid-column: auto }
  .editor-actions .command { min-height: 44px; flex: 1 }
}
</style>
