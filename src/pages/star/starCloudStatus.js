/** Feedback follows the actual operation; uncertain commands are recovered by reading. */
export function starCloudFeedback(state) {
  if (state?.loading) return { message: '正在读取云端星石状态…', error: '' }
  if (state?.recovering) return { message: '正在恢复云端背包…', error: '' }
  if (state?.error) return { message: '', error: !state.ready
    ? '暂时无法读取云端背包，请重试加载；本机数据没有被覆盖。'
    : Number(state.error.status) === 409 ? '云端数据已更新，本次修改尚未保存，请重新加载核对。'
      : [400,401,403,404,422].includes(Number(state.error.status)) ? '本次保存未完成，请核对账号及数据后重新加载。'
        : '保存结果仍待确认，请重新加载核对，不要重复替换或登记完成。' }
  if (state?.replacing || state?.writer?.saving) return { message: '正在保存星石云端状态…', error: '' }
  if (state?.commandPending) return { message: '', error: '识别重建或计划继承的保存结果仍待确认，请重新加载核对，不要重复操作。' }
  if (state?.writer?.pending && state?.writer?.error) return { message: '', error: '本次修改尚未同步。可恢复云端背包，放弃本次未保存的修改。' }
  if (state?.writer?.error) return { message: '', error: '云端状态尚未确认，请重新加载核对；本机记录仍保留。' }
  if (state?.writer?.pending) return { message: '正在等待保存星石云端状态…', error: '' }
  if (state?.ready) return { message: state.readOnlyReload ? '已读取云端星石状态' : '星石云端状态已保存', error: '' }
  return { message: '', error: '' }
}
