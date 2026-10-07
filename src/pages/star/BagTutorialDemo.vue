<template>
  <section class="bag-tutorial-demo" aria-label="只读示例星石背包">
    <header class="demo-heading"><h2>示例背包 · 3 颗星石</h2><p>教程演示数据，不会保存到你的背包。导入截图后即可在真实背包中操作。</p></header>

    <section v-if="view === 'bag'" class="ocr-review demo-panel" aria-label="示例识别结果">
      <h3>识别结果核对</h3>
      <p>示例候选：天府 · 主星 · 橙 · 30 级</p>
      <p class="demo-note">实际识别后，可以查看原图，并保留、忽略或修正候选。</p>
    </section>

    <div class="inventory-grid">
      <section v-for="pane in view === 'bag' ? ['current'] : ['plan']" :key="pane" class="demo-panel" :aria-label="pane === 'current' ? '示例当前背包' : '示例计划背包'">
        <h3>{{ pane === 'current' ? '当前背包' : '计划背包' }} · 示例</h3>
        <table>
          <thead><tr><th scope="col">星石</th><th scope="col">品质</th><th scope="col">{{ pane === 'current' ? '当前等级' : '养成目标' }}</th></tr></thead>
          <tbody>
            <tr v-for="(stone, index) in stones" :key="stone.name" :class="{ 'is-selected': index === 0 }" :data-tutorial-selected-row="index === 0 ? '' : undefined">
              <th scope="row">{{ stone.name }}<small>{{ stone.kind }}</small></th><td>{{ stone.quality }}</td><td>{{ pane === 'current' ? stone.level : stone.target }} 级</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <section v-if="view === 'bag'" class="review-toolbar demo-panel" aria-label="示例筛选工具栏">
      <h3>筛选与视图</h3>
      <fieldset disabled>
        <label>大类<select aria-label="示例大类"><option>全部</option></select></label>
        <label>品质<select aria-label="示例品质"><option>全部</option></select></label>
        <label>名称<input aria-label="示例名称筛选" value="天府" readonly /></label>
      </fieldset>
      <p class="demo-note">逐颗明细 / 名称汇总 · 等级排序</p>
    </section>

      <section v-if="view === 'bag'" class="current-editor demo-panel" aria-label="示例星石编辑区">
        <h3>当前星石编辑 · 天府</h3>
        <fieldset disabled>
          <label>名称<input aria-label="示例星石名称" :value="stones[0].name" readonly /></label>
          <label>等级<input aria-label="示例当前等级" :value="stones[0].level" readonly /></label>
          <label>品质<input aria-label="示例星石品质" :value="stones[0].quality" readonly /></label>
        </fieldset>
        <div class="demo-actions"><button type="button" disabled>新增当前行</button><button type="button" disabled>删除当前行</button></div>
      </section>
      <section v-else class="plan-editor demo-panel" aria-label="示例养成目标区">
        <h3>养成目标 · 天府</h3>
        <fieldset disabled>
          <label>当前等级<input aria-label="示例计划当前等级" :value="stones[0].level" readonly /></label>
          <label>计划等级<input aria-label="示例计划等级" :value="stones[0].target" readonly /></label>
        </fieldset>
        <p class="pending-only-toggle demo-note">仅看待养成：保留目标等级高于当前等级的星石。</p>
      </section>

    <section v-if="view === 'plan'" class="experience-section demo-panel" aria-label="示例经验星曜区域">
      <h3>经验星曜 · 演示数值</h3>
      <div class="experience-grid">
        <div><h4>现有库存</h4><p>紫星曜 3 颗 · 白星曜 8 颗</p></div>
        <div><h4>计划需求</h4><p>需要紫星曜 8 颗 · 白星曜 12 颗</p><p>扣除库存后，还缺紫星曜 5 颗 · 白星曜 4 颗</p></div>
      </div>
      <p class="demo-note">以上数值仅用于说明展示方式；真实需求由你的星石与养成目标计算。</p>
    </section>

    <section class="review-workspace-tools demo-panel" aria-label="示例历史操作区域">
      <h3>撤回与存档</h3>
      <div class="demo-actions"><button type="button" disabled>← 撤回</button><button type="button" disabled>→ 重做</button><button type="button" disabled>近期 3 个存档</button></div>
      <p class="demo-note">这里只展示入口。你的真实存档不会被读取或修改。</p>
    </section>
  </section>
</template>

<script setup>
// Display-only fixtures: no embed handle, account, persistence, or API callbacks.
defineProps({ view: { type: String, default: 'bag' } })
const stones = [
  { name: '天府', kind: '主星', quality: '橙', level: 30, target: 60 },
  { name: '武曲', kind: '主星', quality: '紫', level: 20, target: 20 },
  { name: '文昌', kind: '辅星', quality: '蓝', level: 10, target: 30 },
]
</script>

<style scoped>
.bag-tutorial-demo { display: grid; gap: 16px; min-width: 0; padding: 16px 0; color: var(--ink); }
.demo-heading h2 { font: 900 20px/1.5 var(--font-s); color: var(--tea); }
.demo-heading p, .demo-note { font-size: 13px; line-height: 1.7; }
.demo-panel { min-width: 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
h3 { margin-bottom: 10px; color: var(--tea); font: 900 16px/1.5 var(--font-s); }
h4 { font-size: 14px; line-height: 1.6; }
p { line-height: 1.7; overflow-wrap: anywhere; }
.inventory-grid, .experience-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 10px 6px; border-bottom: 1px solid var(--line); text-align: left; }
td { font-family: var(--font-d); }
th small { display: block; font-weight: 400; }
.is-selected { background: var(--cream); }
fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; border: 0; padding: 0; min-width: 0; }
label { display: grid; gap: 4px; min-width: 0; font-size: 13px; }
input, select { width: 100%; min-width: 0; min-height: 44px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); font: inherit; opacity: 1; -webkit-text-fill-color: var(--ink); }
.demo-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--cream); color: var(--ink); font: inherit; cursor: default; }
.demo-note { margin-top: 8px; }
@media (min-width: 768px) {
  .experience-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  fieldset { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
