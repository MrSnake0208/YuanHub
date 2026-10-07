export const bagGuidance = {
  id: 'review', title: '先检查识别异常', body: '结果已进入背包。先检查标为异常或待审查的内容；正常结果不用逐条确认。发现问题可查看原图并修改。', target: '#toggle-ocr-review', help: 'review',
}

export const bagReviewInfo = {
  title: '怎么看识别结果',
  intro: '一般只需要处理异常内容，不用把所有结果重新确认一遍。',
  sections: [
    { title: '查看原图与候选', body: '「查看整页」看原始截图与上下文；「查看全部候选」检查漏识或误识。' },
    { title: '保留与忽略', body: '正常识别并已保留的结果不用再确认。「保留」可恢复误忽略的内容；「忽略」排除不应进入背包的内容。' },
    { title: '修改', body: '名称、等级或品质识别有误时可以修改。确认修改后会立即写回当前背包。' },
  ],
}
export const bagHelpSections = [
  { title: '查找与编辑', body: '在「更多筛选与设置」里按大类、品质、名称筛选，也可切换逐颗明细 / 名称汇总。名称汇总里双击名称可展开明细。选中星石后，下方编辑区修改当前星石；「新增当前行」保留原星石并新增，内容不变时相当于复制；「删除当前行」删除选中星石。' },
  { title: '养成计划与经验', body: '进入「养成计划」后为选中的星石设置计划等级。「仅看待养成」只显示未达到计划等级的星石。经验区对照现有经验星曜，显示选中星石与当前视图内待养成星石的需求和缺口。' },
  { title: '撤回与近期存档', body: '左右箭头撤回 / 重做最近操作；电脑可用 Ctrl+Z / Ctrl+Y。时钟查看近期 3 个存档。' },
]

// Eligibility is sampled before OCR; history created by that OCR must not
// retroactively make a first-time user experienced. Pending handoff is account-owned.
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
