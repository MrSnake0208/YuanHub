export const diagnosticFeatureLabels = {
  operator_info_collection: '密探信息采集',
  inventory_bag_scan: '背包识别'
}

export const diagnosticOutcomeLabels = {
  failed: '采集失败',
  upload_failed: '上报失败',
  data_review: '数据待核对'
}

export const diagnosticResourceLabels = {
  base: '简中',
  zh_tw: '繁中'
}

export const diagnosticUiScriptLabels = {
  simplified: '简体',
  traditional: '繁体',
  mixed: '简繁混合',
  unknown: '无法判定'
}

export const diagnosticStatusLabels = { NEW: '待处理', FIXED: '已修复', IGNORED: '已忽略', ALL: '全部' }
export const diagnosticImageLabels = { name_area: '姓名区', disc_cells: '命盘格', main_panel: '主界面', last_frame: '最后画面', bag_page: '背包页面' }

export function diagnosticReasonLabel(issue) {
  const labels = { page_timeout: '页面等待超时', section_needs_review: '部分字段待核对', upload_rejected_by_server: '服务端拒收', unexpected_exception: '未分类异常' }
  const reasons = issue.reasons?.length ? issue.reasons : [issue.reason]
  return reasons.map(reason => {
    if (Object.hasOwn(labels, reason)) return labels[reason]
    if (Object.hasOwn(diagnosticReasons, reason)) return diagnosticReasons[reason].label
    return diagnosticLabel(diagnosticCodeLabels, reason) || diagnosticCodeLabels[issue.code] || '待分析的采集问题'
  }).join('；')
}

export function diagnosticIssueTitle(issue) {
  if (['bag_item_missing', 'bag_count_suspect'].includes(issue.code)) {
    return `${diagnosticFeatureLabels.inventory_bag_scan} · ${diagnosticCodeLabels[issue.code]} · ${diagnosticReasonLabel(issue)}`
  }
  if (issue.code === 'identity_unresolved' && (issue.subjectKind === 'operator' || issue.subjectKind === 'ocr_name')) {
    return `${issue.subjectName || issue.subject} · ${diagnosticCodeLabels.identity_unresolved}`
  }
  const label = issue.reason === 'page_timeout' ? '页面等待超时' : diagnosticReasonLabel(issue)
  if (issue.subjectKind === 'operator') return `${issue.subjectName || '密探'} · ${label}`
  if (issue.subjectKind === 'ocr_name') return `OCR「${issue.subject}」· ${label}`
  if (issue.subjectKind === 'node') return `节点 ${issue.subject} · ${label}`
  return `${label} · ${Object.hasOwn(diagnosticStageLabels, issue.subject) ? diagnosticStageLabels[issue.subject] : '采集阶段'}`
}

export const diagnosticCodeLabels = {
  bag_item_missing: '背包漏扫',
  bag_count_suspect: '背包数量可疑',
  collector_exception: '采集异常',
  account_lookup_failed: '账号查询失败',
  annotations_failed: '养成状态读取失败',
  catalog_unavailable: '密探目录不可用',
  navigation_failed: '界面导航失败',
  screenshot_or_ocr_failed: '截图或识别失败',
  identity_unresolved: '密探身份无法确认',
  data_review: '数据待核对',
  upload_network_failed: '上报网络失败',
  upload_http_failed: '上报 HTTP 失败',
  upload_rejected: '上报被拒收',
  upload_response_unverified: '上报响应无法验证'
}

export const diagnosticStageLabels = {
  bag_tab1: '背包物品页',
  bag_tab3_1: '背包养成页·道具',
  bag_tab3_2: '背包养成页·心纸',
  initialize: '初始化',
  account: '账号',
  annotations: '养成状态',
  catalog: '密探目录',
  enter: '进入密探界面',
  main: '密探主界面',
  detail: '属性详情',
  huaji: '化极',
  disc: '命盘',
  screenshot: '截图',
  ocr: '识别',
  identity: '身份确认',
  navigation: '翻页',
  checkpoint: '报告检查',
  preview: '上报预检',
  commit: '上报提交',
  finalize: '收尾'
}

export const diagnosticReasons = {
  page_conflict: { label: '翻页读数不一致', hint: '对比同一格在各页截图中的数量读数' },
  threshold_disagree: { label: '阈值读数不一致', hint: '对比同一格的主识别与备用识别读数' },
  edge_zone: { label: '底部边缘读数', hint: '检查截图底部数量框是否被裁切' },
  mixed: { label: '多种原因', hint: '逐格查看可疑原因和读数' },
  tianjifuchuan_missing: { label: '天机符传未识别', hint: '查看背包页面原图，离线重放圆形检测与模板匹配' },
  fuchuan_missing: { label: '符传未识别', hint: '查看背包页面原图，离线重放圆形检测与模板匹配' },
  both_missing: { label: '两种符传均未识别', hint: '查看背包页面原图，离线重放圆形检测与模板匹配' },
  resource_language_mismatch: { label: '资源语言与游戏界面不一致', hint: '用户所选资源（简中/繁中）与游戏画面文字不符，请让用户切换资源' },
  page_timeout: { label: '等待目标页面超时（stage 即页面）', hint: '资源语言与游戏界面不一致、弹窗遮挡、卡顿' },
  enter_operator_page_failed: { label: '无法进入密探界面', hint: '起始界面不在主界面/导航失败' },
  disc_plan_unknown: { label: '无法确认当前命盘方案', hint: '命盘页标签 OCR 失败' },
  disc_tip_close_failed: { label: '无法关闭命盘单套提示', hint: '提示弹窗样式变化' },
  disc_switch_unconfirmed: { label: '命盘方案切换未确认', hint: '点击未生效/动画过慢' },
  disc_restore_failed: { label: '命盘原配置恢复失败', hint: '采集后未能切回原命盘' },
  identity_changed_on_reread: { label: '数值补读时密探身份不符', hint: '补读期间页面被切换' },
  page_arrow_failed: { label: '密探翻页箭头识别未执行', hint: '翻页按钮识别失败' },
  list_boundary_unverified: { label: '无法复核密探列表边界', hint: '列表首尾判断失败' },
  page_turn_unconfirmed: { label: '密探翻页未确认', hint: '翻页后身份未变化' },
  return_first_limit: { label: '回到首位密探超过安全上限', hint: '列表过长或回滚失败' },
  current_operator_failed: { label: '无法采集当前密探', hint: '见同次其他 issue' },
  form_identity_unconfirmed: { label: '切换形态后身份未确认', hint: 'SP/普通形态切换' },
  form_switch_failed: { label: '形态切换或恢复失败', hint: '陈登/史子眇等双形态' },
  form_tip_close_failed: { label: '无法关闭未解锁形态提示', hint: '未解锁形态弹窗' },
  name_and_disc_unresolved: { label: '姓名 OCR 与命盘均无法确认密探', hint: '新密探未录入目录、OCR 失败' },
  name_fuzzy_disc_unconfirmed: { label: '姓名仅模糊匹配且命盘未能唯一确认', hint: '新密探/命盘别名缺失（可在 YuanHub 补 aliases）' },
  unmatched_in_report: { label: '报告中存在未匹配密探', hint: '新密探/命盘别名缺失（可在 YuanHub 补 aliases）' },
  section_needs_review: { label: '部分字段待核对（见 section_status）', hint: '数值/命盘识别不完整' },
  server_marked_review: { label: '服务端标记部分接受或待核对', hint: '查看 YuanHub 待核对' },
  screenshot_failed: { label: '截图失败', hint: '模拟器/ADB 异常' },
  ocr_failed: { label: 'OCR 识别异常', hint: 'OCR 模型/资源问题' },
  catalog_load_failed: { label: '本地与远程密探目录均不可用', hint: '网络 + 内置目录损坏' },
  account_lookup_failed: { label: '连接码绑定账号查询失败', hint: '连接码失效/网络' },
  annotations_failed: { label: '养成状态读取失败', hint: '连接码无读取权限' },
  upload_network_error: { label: '上报网络错误', hint: '网络' },
  upload_http_error: { label: '上报 HTTP 错误', hint: '服务端状态码' },
  upload_rejected_by_server: { label: '服务端拒收（见 blocking_errors）', hint: '数据不合规' },
  upload_response_invalid: { label: '上报响应无法验证', hint: '响应格式异常' },
  upload_auth_missing: { label: '在线上传认证缺少连接码或地址', hint: '配置问题' },
  active_only_requires_sync: { label: '“仅更新养成中”未开启同步/连接码', hint: '配置问题' },
  unknown_scan_mode: { label: '未知扫描模式配置', hint: '配置问题' },
  unexpected_exception: { label: '未分类异常（看 error_type/stack）', hint: '开发排查' },
  task_failed_no_detail: { label: '任务失败但未记录具体原因', hint: '开发排查' }
}

export function diagnosticLabel(labels, value) {
  return Object.hasOwn(labels, value) ? labels[value] : value
}

export function diagnosticCodeLabel(code) {
  const label = diagnosticLabel(diagnosticCodeLabels, code)
  return label === code ? code : `${label}（${code}）`
}

export function diagnosticReason(reason) {
  return Object.hasOwn(diagnosticReasons, reason) ? diagnosticReasons[reason] : { label: reason }
}
