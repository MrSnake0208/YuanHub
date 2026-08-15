<template>
  <Teleport to="body">
    <div class="modal-mask" @click.self="$emit('close')">
      <div class="modal plan-modal">
        <div class="modal-head">
          <h3>我的方案</h3>
          <button type="button" @click="$emit('close')"><X :size="20" /></button>
        </div>

        <div class="plan-body">
          <p v-if="!loggedIn" class="guest-banner">
            <LogIn :size="14" />
            <span>游客模式：仅显示本机暂存方案</span>
            <button type="button" class="banner-login" @click="$emit('login')">去登录</button>
          </p>

          <div v-if="loggedIn" class="plan-sec">
            <div class="sec-head">
              <Cloud :size="14" /><span>云端方案</span><span class="cnt">{{ plans.length }}</span>
            </div>
            <div v-if="loading" class="plan-empty"><Loader2 :size="16" class="spin" />加载中…</div>
            <div v-else-if="plans.length === 0" class="plan-empty">还没有云端方案，点「保存方案」创建一份吧</div>
            <div v-else class="plan-list">
              <div v-for="p in plans" :key="p.id" class="plan-item">
                <template v-if="renamingId === p.id">
                  <input
                    v-model="renameDraft"
                    class="rename-input"
                    maxlength="50"
                    placeholder="新方案名"
                    @keyup.enter="commitRename(p)"
                    @keyup.esc="cancelRename"
                  />
                  <button type="button" class="pbtn ok" title="确认重命名" @click="commitRename(p)"><Check :size="14" /></button>
                  <button type="button" class="pbtn" title="取消" @click="cancelRename"><X :size="14" /></button>
                </template>
                <template v-else>
                  <button type="button" class="plan-main" @click="$emit('load', p)">
                    <b>{{ p.name }}</b>
                    <span class="meta">
                      {{ p.version === 'daihao' ? '代号鸢' : '如鸢' }}
                      <template v-if="p.summary"> · ¥{{ Number(p.summary.total_cny || 0).toFixed(2) }} · {{ p.summary.total_draws || 0 }} 抽</template>
                    </span>
                  </button>
                  <button type="button" class="pbtn" title="重命名" @click="startRename(p)"><Pencil :size="14" /></button>
                  <button type="button" class="pbtn danger" title="删除" @click="$emit('remove', p)"><Trash2 :size="14" /></button>
                </template>
              </div>
            </div>
          </div>

          <div class="plan-sec">
            <div class="sec-head">
              <HardDrive :size="14" /><span>本机暂存</span><span class="cnt">{{ guestPlans.length }}</span>
            </div>
            <div v-if="guestPlans.length === 0" class="plan-empty">暂无本地暂存方案</div>
            <div v-else class="plan-list">
              <div v-for="p in guestPlans" :key="p._localId" class="plan-item">
                <button type="button" class="plan-main" @click="$emit('load-guest', p)">
                  <b>{{ p.name }}</b>
                  <span class="meta">{{ p.version === 'daihao' ? '代号鸢' : '如鸢' }} · 本机暂存</span>
                </button>
                <button type="button" class="pbtn danger" title="删除" @click="$emit('remove-guest', p)"><Trash2 :size="14" /></button>
              </div>
            </div>
          </div>

          <p v-if="loggedIn && guestPlans.length > 0" class="upload-hint">
            想把本机暂存同步到云端？在列表中加载它 → 点「保存方案」即可上传为云端方案。
          </p>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn ghost" style="flex:none" @click="$emit('close')">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { X, Cloud, HardDrive, LogIn, Loader2, Pencil, Trash2, Check } from '@lucide/vue'

defineProps({
  plans: { type: Array, default: () => [] },
  guestPlans: { type: Array, default: () => [] },
  loggedIn: { type: Boolean, default: false },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'load', 'load-guest', 'rename', 'remove', 'remove-guest', 'login'])

// ---- 行内重命名 ----
const renamingId = ref(null)
const renameDraft = ref('')

function startRename(p) {
  renamingId.value = p.id
  renameDraft.value = p.name
}
function cancelRename() {
  renamingId.value = null
  renameDraft.value = ''
}
function commitRename(p) {
  const name = (renameDraft.value || '').trim()
  cancelRename()
  if (!name || name === p.name) return
  emit('rename', p, name)
}
</script>

<style scoped>
.plan-modal{max-width:560px}
.plan-body{padding:16px 20px;display:flex;flex-direction:column;gap:16px}

/* 游客引导条：蜜黄底棕字（分类标签同款配色） */
.guest-banner{
  display:flex;align-items:center;gap:8px;background:var(--yellow);
  border:1px solid var(--yellow-deep);border-radius:12px;
  padding:10px 12px;font-size:12px;font-weight:700;color:var(--ink);
}
.guest-banner svg{flex-shrink:0;color:var(--accent-strong)}
.guest-banner .banner-login{
  margin-left:auto;border:none;background:var(--tea);color:var(--cream);
  border-radius:999px;padding:6px 14px;font-size:12px;font-weight:800;
  font-family:var(--font-b);cursor:pointer;transition:background .3s var(--ease);
}
.guest-banner .banner-login:hover{background:var(--accent)}

.plan-sec{display:flex;flex-direction:column;gap:10px}
.sec-head{
  display:flex;align-items:center;gap:8px;
  font-size:12.5px;font-weight:800;color:var(--ink);letter-spacing:.04em;
}
.sec-head svg{color:var(--accent)}
.sec-head .cnt{
  margin-left:auto;background:var(--paper);border:1px solid var(--line);
  border-radius:999px;padding:1px 10px;font-size:11px;color:var(--ink-60);
  font-family:var(--font-d);font-weight:700;
}

.plan-empty{
  display:flex;align-items:center;justify-content:center;gap:8px;
  background:var(--paper);border:1px dashed var(--line);border-radius:14px;
  padding:18px 12px;font-size:12px;color:var(--ink-60);
}
.spin{animation:pspin 1s linear infinite}
@keyframes pspin{to{transform:rotate(360deg)}}

.plan-list{display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto}
.plan-item{
  display:flex;align-items:center;gap:6px;
  background:var(--surface);border:1px solid var(--line);border-radius:14px;
  padding:8px 10px;transition:border-color .3s var(--ease);
}
.plan-item:hover{border-color:var(--yellow-deep)}
.plan-main{
  flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;
  background:none;border:none;text-align:left;cursor:pointer;padding:2px;
}
.plan-main b{
  font-size:13px;font-weight:800;color:var(--ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;
}
.plan-main:hover b{color:var(--accent-strong)}
.plan-main .meta{font-size:11px;color:var(--ink-60);font-family:var(--font-d)}
.pbtn{
  flex-shrink:0;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;
  background:var(--paper);border:1px solid var(--line);color:var(--ink-60);
  cursor:pointer;transition:all .25s var(--ease);
}
.pbtn:hover{color:var(--ink);border-color:var(--ink)}
.pbtn.ok{background:var(--yellow);border-color:var(--yellow-deep);color:var(--ink)}
.pbtn.danger:hover{color:var(--rouge);border-color:var(--rouge);background:rgba(166,81,74,.08)}
.rename-input{
  flex:1;min-width:0;border:1.5px solid var(--line);border-radius:9px;
  padding:6px 10px;font-size:12.5px;font-family:var(--font-b);color:var(--ink);
  background:var(--paper);outline:none;
}
.rename-input:focus{border-color:var(--accent)}

.upload-hint{
  background:var(--cream);border:1px dashed var(--line);border-radius:12px;
  padding:10px 12px;font-size:11.5px;line-height:1.6;color:var(--ink-60);
}
</style>
