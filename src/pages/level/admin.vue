<template>
  <div class="page-level-admin">
    <IslandSidebar />

    <main id="main-content">
      <header class="page-header">
        <div class="wrap">
          <router-link class="page-header-back" to="/manage" aria-label="返回管理工作台"><ArrowLeft :size="16" aria-hidden="true" /> 返回管理工作台</router-link>
          <h1 class="page-header-title">关卡管理</h1>
          <p class="page-header-description">维护公共关卡目录、分类与开放状态。</p>
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
              <div class="level-tools">
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
            </div>

            <div v-if="loading" class="state" role="status" aria-live="polite">
              <LoaderCircle :size="20" aria-hidden="true" />正在加载公共关卡库…
            </div>

            <template v-else>
              <div class="list-summary" aria-live="polite">
                <span>显示 {{ filteredRows.length }} / {{ rows.length }} 条</span>
                <span class="catalog-version">目录版本 {{ catalogVersion || '—' }}</span>
                <span v-if="notice" class="notice-text" role="status">{{ notice }}</span>
              </div>

              <p class="archive-note">归档只隐藏目录条目，不会让已有作业引用失效。</p>
              <div class="level-table-wrap" role="region" aria-label="公共关卡目录列表" tabindex="0">
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
                    <div><h2 id="level-tree-title">分类树预览</h2></div>
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
                    <div><h2 id="level-import-title">批量导入</h2></div>
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
              <div><span class="eyebrow">LEVEL CATALOG</span><h2 id="level-editor-title">{{ isNew ? '新建关卡' : '编辑关卡' }}</h2><p>{{ isNew ? '新关卡将自动分配编号。' : '保存前会检查是否有他人更新；冲突时请先核对最新内容。' }}</p></div>
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
import { Download, LoaderCircle, Pencil, Plus, RefreshCw, Search, Upload, X, ArrowLeft } from '@lucide/vue'
import { useRouter } from 'vue-router'
import IslandSidebar from '../../components/IslandSidebar.vue'
import SiteFooter from '../../components/SiteFooter.vue'
import '../../styles/page-header.css'
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
  if (/Failed to fetch|NetworkError|fetch/i.test(err.message || '')) return '暂时无法连接 YuanHub，请检查网络后重试；仍失败时请反馈。'
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
/* 刻意共享字段外观与动效；布局和密度由独立双端文件持有。 */
.sr-only { border: 0 }
.level-toolbar { border-block: 1px solid var(--line) }
.level-toolbar label { color: var(--ink-60) }
.level-toolbar select, .level-search input { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper) }
.level-toolbar select:focus, .level-search:focus-within { outline: 2px solid var(--accent); outline-offset: 3px }
.level-search { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink-35) !important; background: var(--paper) }
.level-search input { border: 0; background: transparent; outline: none }
.command { border: 0; border-radius: 10px; cursor: pointer; text-decoration: none; transition: background-color .25s, transform .25s, opacity .25s }
.command:disabled { opacity: .45; cursor: not-allowed }
.command.primary { color: var(--cream); background: var(--tea) }
.command.primary:hover:not(:disabled) { background: var(--tea-deep) }
.command.secondary { color: var(--ink); background: var(--paper); border: 1.5px solid var(--line) }
.command.secondary:hover:not(:disabled) { border-color: var(--accent); background: var(--cream) }
.state { color: var(--ink-60); background: var(--surface); border: 1px solid var(--line); border-radius: 16px }
.state.error { color: var(--rouge) }
.state-retry { border: 0; color: var(--accent-strong); background: transparent; text-decoration: underline; cursor: pointer }
.list-summary { color: var(--ink-60) }
.archive-note { color: var(--ink-60) }
.level-table-wrap:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }
.notice-text { color: var(--accent-strong) }
.level-table-wrap { background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.level-table { border-collapse: separate; border-spacing: 0 }
.level-table th { color: var(--ink-60); border-bottom: 1px dashed var(--line) }
.level-table td { border-bottom: 1px solid rgba(156, 122, 77, .13) }
.level-table tbody tr:last-child td { border-bottom: 0 }
.level-table tbody tr:hover { background: rgba(156, 122, 77, .05) }
.level-table code, .level-mobile-card code { color: var(--ink-60) }
.game-tag, .status-tag, .open-tag { border-radius: 7px }
.game-tag { color: var(--ink); background: var(--yellow) }
.status-tag { color: var(--ink); background: rgba(191, 220, 192, .85) }
.status-tag.archived { color: var(--rouge); background: rgba(166, 81, 74, .12) }
.open-tag { color: var(--accent-strong); background: rgba(215, 137, 53, .12) }
.open-tag.closed { color: var(--ink-60); background: rgba(73, 59, 44, .08) }
.time-cell { color: var(--ink-60) }
.ops-col { background: var(--surface); box-shadow: -10px 0 16px -17px rgba(73, 59, 44, .8) }
.level-table tbody tr:hover .ops-col { background: color-mix(in srgb, var(--surface) 95%, var(--tea)) }
.table-action { border: 1.5px solid var(--line); border-radius: 8px; color: var(--ink-60); background: transparent; cursor: pointer }
.table-action:hover { color: var(--ink); border-color: var(--ink) }
.table-action.danger { color: var(--rouge); border-color: rgba(166, 81, 74, .35) }
.empty-row { color: var(--ink-35) }
.tree-panel, .import-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 18px }
.panel-head { border-bottom: 1px dashed var(--line) }
.panel-head h2 { color: var(--ink) }
.panel-head > span { color: var(--ink-35) }
.eyebrow { color: var(--accent-strong) }
.panel-hint { color: var(--ink-60) }
.panel-hint code { color: var(--accent-strong) }
.catalog-tree ul { border-left: 1px solid var(--line) }
.catalog-tree > ul { border-left: 0 }
.catalog-tree li { color: var(--ink) }
.catalog-tree small { color: var(--ink-35) }
.panel-empty { color: var(--ink-35) }
.import-panel textarea { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper); outline: none }
.import-panel textarea:focus { border-color: var(--accent) }
.inline-error, .editor-error { color: var(--rouge) }
.import-stat { border: 1px solid var(--line); border-radius: 8px; background: var(--cream) }
.import-stat strong { color: var(--ink) }
.import-stat span { color: var(--ink-60) }
.import-details { color: var(--rouge) }
.editor-mask { background: rgba(73, 59, 44, .34); backdrop-filter: blur(2px) }
.editor-panel { background: var(--surface); border: 1px solid var(--line); border-radius: 22px; box-shadow: 0 32px 80px -24px rgba(73, 59, 44, .4) }
.editor-head { border-bottom: 1px dashed var(--line) }
.editor-head h2 { color: var(--ink) }
.editor-head p { color: var(--ink-60) }
.icon-command { border: 0; border-radius: 10px; color: var(--ink-60); background: transparent; cursor: pointer }
.icon-command:hover { color: var(--ink); background: var(--paper) }
.editor-error { border-radius: 10px; background: rgba(166, 81, 74, .1) }
.editor-error button { border: 1px solid rgba(166, 81, 74, .35); border-radius: 8px; color: var(--rouge); background: transparent; cursor: pointer }
.editor-fields label { color: var(--ink-60) }
.editor-fields input, .editor-fields select { border: 1.5px solid var(--line); border-radius: 10px; color: var(--ink); background: var(--paper); outline: none }
.editor-fields input:focus, .editor-fields select:focus { border-color: var(--accent) }
.revision-note { color: var(--ink-35) }
.editor-actions { border-top: 1px dashed var(--line) }
.table-action:focus-visible, .command:focus-visible, .icon-command:focus-visible, .editor-error button:focus-visible, .level-toolbar select:focus-visible, .editor-fields input:focus-visible, .editor-fields select:focus-visible, .import-panel textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px }

@media (max-width: 767px) {
  .level-mobile-card { background: var(--surface); border: 1px solid var(--line); border-radius: 14px }
  .level-mobile-card dl { border-top: 1px dashed var(--line) }
  .level-mobile-card dt { color: var(--ink-35) }
  .level-mobile-card dd { color: var(--ink) }
  .level-mobile-card footer { border-top: 1px solid rgba(156, 122, 77, .13) }
}
</style>
<style scoped src="./levelAdminDesktop.css"></style>
<style scoped src="./levelAdminMobile.css"></style>
