export const bagTutorialSteps = [
  { id: 'review', title: '检查识别结果', body: '识别完成后，可以在这里回看识别结果。\n发现名称、等级或其他内容不对时，可以查看原图并修正。', target: '.ocr-review', exampleAction: 'review-info', exampleLabel: '查看核对说明' },
  { id: 'bags', title: '认识两个背包', body: '左边是现在拥有的星石，右边是对应的养成计划。\n点击任意一侧，都会选中同一颗星石。', target: '.inventory-grid' },
  { id: 'find', title: '找到想看的星石', body: '可以按大类、品质和名称筛选，也可以切换逐颗明细 / 名称汇总和排序方式。\n在视图「名称汇总」里，双击某组星石的名称，可以展开查看这一组的详情。', target: '.review-toolbar' },
  { id: 'edit', title: '编辑或新增星石', paragraphs: ['选中一行后，下方会载入它。\n直接修改名称、等级或品质，会编辑当前这颗星石。', '要新增时，先在编辑区填好内容，再点「新增当前行」，原来的星石会保留。\n如果不改内容直接新增，相当于复制当前行。\n删除则使用「删除当前行」。'], target: '.current-editor', relatedTargets: '#current-rows .is-selected, #current-rows .is-counterpart' },
  { id: 'plan', title: '设置养成目标', body: '选中一颗星石后，可以在这里设置计划等级。\n开启「仅看待养成」，可以只看还没有达到计划等级的星石。', target: '.plan-editor', relatedTargets: '.pending-only-toggle' },
  { id: 'experience', title: '看看还需要多少经验星曜', body: '左边记录现有经验星曜。\n右边会显示当前选中星石、当前视图内所有待养成星石的需求，以及扣除现有库存后还缺多少。', target: '.experience-section' },
  { id: 'history', title: '撤回、重做和近期存档', body: '左右箭头可以撤回 / 重做最近操作，电脑端也可以使用 Ctrl + Z / Ctrl + Y。\n时钟里可以查看近期 3 个存档。', target: '.review-workspace-tools', scroll: 'preserve', mobileAvoidTarget: true },
]

export const bagReviewInfo = {
  title: '怎么看识别结果',
  intro: '每张截图都会保留对应的识别结果。\n一般只需要处理看起来有问题的内容，不用把所有结果重新确认一遍。',
  sections: [
    { title: '查看整页', body: '查看完整原始截图，确认这条结果在截图里的位置和上下文。' },
    { title: '查看全部候选', body: '展开当前图片识别出的全部候选，方便检查漏识或误识。' },
    { title: '保留', body: '将当前候选保留为有效结果。\n正常识别并已经保留的结果，一般不需要再点这个按钮。\n如果有星石被误归到「忽略」，可以用「保留」恢复。' },
    { title: '忽略', body: '这条内容不需要进入背包时，可以忽略。' },
    { title: '修改', body: '名称、等级、品质等识别有误时，可以手动修改。\n确认修改后会立即写回当前背包。' },
  ],
}

// A loaded historical account never opts into a new release's automatic tour.
// OCR success is observed separately; history becoming nonempty cannot opt it in.
export function createBagTutorialGate() {
  let owner = '', eligible = false, observed = false, completed = false
  return {
    loaded(key, hasHistory) {
      if (key !== owner) { owner = key; eligible = false; observed = false; completed = false }
      if (!observed) { eligible = !hasHistory; observed = true }
      return eligible
    },
    ocrCompleted(key) { if (owner === key && eligible) completed = true },
    shouldStart(key, { reviewing, ready, seen, hasEvidence }) {
      return owner === key && eligible && completed && reviewing && ready && !seen && hasEvidence
    },
    reset() { owner = ''; eligible = false; observed = false; completed = false },
  }
}
