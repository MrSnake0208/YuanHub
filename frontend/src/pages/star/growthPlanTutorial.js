const inventoryStep = {
  id: 'plan-bag', title: '认识计划背包',
  paragraphs: ['这里可以查看当前账号的星石，以及为它们设置的养成目标。', '可以切换「逐颗明细」和「名称汇总」，也可以开启「仅看待养成」，只显示还没有达到目标等级的星石。'],
  target: '.growth-inventory', relatedTargets: '.growth-filters #view-mode-toggle, .growth-filters .pending-only-toggle',
}
const resourcesStep = {
  id: 'resources', title: '核对现有资源',
  paragraphs: ['右上方显示当前账号持有的橙、紫、白经验星曜，以及三种突破瓶子的数量。', '可以先核对这些库存是否准确，后面的养成路线会根据计划展示预计需要的资源。'],
  target: '.growth-resources',
}
const groupFirst = {
  id: 'group', title: '按组安排养成目标', editorView: 'summary', target: '.growth-editor',
  paragraphs: ['选中一组同名星石后，这里会显示它们的当前等级分布。', '可以按照「目标等级 × 数量」统一安排总体的计划分布，例如让其中几颗升到 60 级，其余保持现状。', '调整好后，点击「预览应用」，检查具体分配，再确认修改。'],
}
const detailFirst = {
  id: 'individual', title: '逐颗修改养成计划', editorView: 'detail', target: '.growth-editor',
  paragraphs: ['选中左侧的一颗星石，下方就会显示它的计划信息。', '可以单独修改当前等级和目标等级，再点击「保存修改」。'],
}
const detailSecond = {
  ...detailFirst,
  paragraphs: ['除了按组安排，也可以为每颗星石单独设置目标。', '选中一颗星石后，在下方修改当前等级和目标等级，再保存修改即可。'],
}
const groupSecond = {
  ...groupFirst,
  paragraphs: ['同名星石较多时，可以在这里按数量统一设置总体的养成目标。', '分别填写目标等级与数量，再通过「预览应用」检查分配结果，确认后就能应用到对应星石。'],
}
const routeStep = {
  id: 'route', title: '查看与调整养成路线', target: '.growth-route-list',
  paragraphs: ['右侧会列出所有尚未达到目标等级的星石。', '每张卡片都会显示当前等级、目标等级，以及预计需要的经验星曜和突破瓶子。', '可以根据自己的培养优先级，上下拖动或修改排序数字来调整路线顺序。这里显示的是预计需求，实际消耗可能有所不同。'],
}
const completionStep = {
  id: 'completion', title: '选择并完成本次养成', target: '.growth-selection', relatedTargets: '.growth-route-list [data-growth-select-id]',
  paragraphs: ['实际培养完成后，可以勾选路线中的一颗或多颗星石，也可以使用「全选」。', '下方会汇总本次选中的星石数量及预计消耗。点击「完成所选养成」，可以进一步核对完成的星石、突破情况和实际使用的经验星曜。', '确认完成后，对应星石的当前等级会更新，已完成的计划也会清理；未选中的其他计划会保留。'],
}

export function growthPlanStepsForView(view) {
  return [inventoryStep, resourcesStep, ...(view === 'summary' ? [groupFirst, detailSecond] : [detailFirst, groupSecond]), routeStep, completionStep]
}
export const growthPlanTutorialSteps = growthPlanStepsForView('detail')

export function readGrowthPlanView(root) {
  const button = root?.querySelector('.growth-filters #view-mode-toggle')
  const pressed = button?.getAttribute('aria-pressed')
  return pressed === 'true' ? 'summary' : pressed === 'false' ? 'detail' : null
}

// Observe editing intent even before the tour opens. This is a conservative
// safety latch, not a copy of the embed's view or business draft state.
export function createGrowthTutorialViewGuard(root) {
  const identity = () => `${readGrowthPlanView(root)}:${root?.querySelector('#plan-rows .is-selected')?.getAttribute('data-star-id') || root?.querySelector('#plan-rows .is-selected')?.getAttribute('data-summary-group-key') || ''}`
  let owner = identity(), edited = Boolean(root?.querySelector('.growth-group-editor'))
  function synchronize() {
    const next = identity()
    if (next !== owner) { owner = next; edited = false }
  }
  function onEdit(event) {
    synchronize()
    if (event.target?.closest?.('.growth-editor, .growth-resources, .growth-route-order')) edited = true
  }
  function onAction(event) {
    synchronize()
    if (event.target?.closest?.('#growth-quick-sixty, #growth-restore-current, #growth-group-add, [data-group-remove], #growth-group-preview, #growth-group-back')) edited = true
  }
  root?.addEventListener('input', onEdit, true)
  root?.addEventListener('change', onEdit, true)
  root?.addEventListener('click', onAction, true)
  return {
    switchTo(view, blocked = false) {
      synchronize()
      const current = readGrowthPlanView(root)
      if (current === view) return 'unchanged'
      const button = root?.querySelector('.growth-filters #view-mode-toggle')
      if (!current || !button) return 'missing'
      const changedInput = [...root.querySelectorAll('.growth-editor input, .growth-resources input, .growth-route-order, .growth-filters #name-filter')].some(input => input.value !== input.defaultValue)
      // Only the authoritative embed can prove a drill-down origin or confirm
      // that drafts have been committed. Older embeds retain the safety latch.
      const drilldownReturn = current === 'detail' && view === 'summary' && button.dataset.growthDrilldownReturn === 'true'
      const authoritativeBlocked = button.getAttribute('data-growth-tutorial-blocked')
      const draftBlocked = authoritativeBlocked === 'true' || (authoritativeBlocked !== 'false' && edited)
      const saveState = button.getAttribute('data-growth-save-state')
      // A verified ordinary detail has no origin to restore: its existing toggle
      // preserves filters, including on the return trip to the fixed step 4.
      const verifiedNavigation = authoritativeBlocked === 'false' && (drilldownReturn || button.dataset.growthDrilldownReturn === 'false')
      const filteredDetail = !verifiedNavigation && current === 'detail' && (root.querySelector('#name-filter')?.value?.trim() || (root.querySelector('#kind-filter')?.value && root.querySelector('#kind-filter').value !== '全部') || root.querySelector('#pending-only')?.checked)
      if (blocked || draftBlocked || changedInput || filteredDetail || ['loading', 'saving', 'failed'].includes(saveState) || button.disabled || button.getAttribute('aria-disabled') === 'true' || root.querySelector('.growth-group-preview, .growth-editor input:disabled, .growth-route-order:disabled, #growth-retry-inventory, #growth-accept-inventory, [data-growth-complete][data-completion-state="pending"], [role="dialog"], dialog[open]')) return 'blocked'
      button.click()
      synchronize()
      return readGrowthPlanView(root) === view ? 'changed' : 'missing'
    },
    dispose() {
      root?.removeEventListener('input', onEdit, true)
      root?.removeEventListener('change', onEdit, true)
      root?.removeEventListener('click', onAction, true)
    },
  }
}
