import { test } from 'node:test'
import assert from 'node:assert/strict'
import { growthPlanStepsForView } from '../src/pages/star/growthPlanTutorial.js'
import { bagTutorialSteps } from '../src/pages/star/bagTutorial.js'
import { recognitionTutorialSteps, tutorialElementRect } from '../src/pages/star/recognitionTutorial.js'

test('all three tutorials have six valid steps, and plan no longer repeats history teaching', () => {
  for (const steps of [bagTutorialSteps, recognitionTutorialSteps, growthPlanStepsForView('detail'), growthPlanStepsForView('summary')]) {
    assert.equal(steps.length,6)
    for(const step of steps) assert.ok(step?.title&&step.target&&(step.paragraphs||step.body))
  }
  assert.doesNotMatch(growthPlanStepsForView('detail').map(step=>[step.title,...step.paragraphs].join(' ')).join(' '),/撤销|撤回|重做|近期存档|Backend|接口|同步扣减/)
})

test('route checkbox spotlight is clipped to its actual internal scrolling viewport',()=>{
  const container={getBoundingClientRect:()=>({left:10,right:300,top:100,bottom:300})}
  const checkbox={closest:selector=>selector.includes('.growth-route-scroll')?container:null,getBoundingClientRect:()=>({left:20,right:36,top:310,bottom:326,width:16,height:16})}
  const view={left:0,top:0,width:390,height:844}
  assert.equal(tutorialElementRect(checkbox,view),null)
  checkbox.getBoundingClientRect=()=>({left:20,right:36,top:290,bottom:306,width:16,height:16})
  assert.equal(tutorialElementRect(checkbox,view).bottom,300)
})

test('plan fixed steps and both editing variants preserve the confirmed paragraphs', () => {
  const detail=growthPlanStepsForView('detail'), summary=growthPlanStepsForView('summary')
  assert.deepEqual(detail.map(step=>step.title),['认识计划背包','核对现有资源','逐颗修改养成计划','按组安排养成目标','查看与调整养成路线','选择并完成本次养成'])
  assert.deepEqual(summary.map(step=>step.title),['认识计划背包','核对现有资源','按组安排养成目标','逐颗修改养成计划','查看与调整养成路线','选择并完成本次养成'])
  const fixed = [
    ['这里可以查看当前账号的星石，以及为它们设置的养成目标。','可以切换「逐颗明细」和「名称汇总」，也可以开启「仅看待养成」，只显示还没有达到目标等级的星石。'],
    ['右上方显示当前账号持有的橙、紫、白经验星曜，以及三种突破瓶子的数量。','可以先核对这些库存是否准确，后面的养成路线会根据计划展示预计需要的资源。'],
    ['右侧会列出所有尚未达到目标等级的星石。','每张卡片都会显示当前等级、目标等级，以及预计需要的经验星曜和突破瓶子。','可以根据自己的培养优先级，上下拖动或修改排序数字来调整路线顺序。这里显示的是预计需求，实际消耗可能有所不同。'],
    ['实际培养完成后，可以勾选路线中的一颗或多颗星石，也可以使用「全选」。','下方会汇总本次选中的星石数量及预计消耗。点击「完成所选养成」，可以进一步核对完成的星石、突破情况和实际使用的经验星曜。','确认完成后，对应星石的当前等级会更新，已完成的计划也会清理；未选中的其他计划会保留。'],
  ]
  for(const [index,stepIndex] of [0,1,4,5].entries()) for(const steps of [detail,summary]) assert.deepEqual(steps[stepIndex].paragraphs,fixed[index])
  assert.deepEqual(detail[2].paragraphs,['选中左侧的一颗星石，下方就会显示它的计划信息。','可以单独修改当前等级和目标等级，再点击「保存修改」。'])
  assert.deepEqual(summary[2].paragraphs,['选中一组同名星石后，这里会显示它们的当前等级分布。','可以按照「目标等级 × 数量」统一安排总体的计划分布，例如让其中几颗升到 60 级，其余保持现状。','调整好后，点击「预览应用」，检查具体分配，再确认修改。'])
  assert.deepEqual(summary[3].paragraphs,['除了按组安排，也可以为每颗星石单独设置目标。','选中一颗星石后，在下方修改当前等级和目标等级，再保存修改即可。'])
  assert.deepEqual(detail[3].paragraphs,['同名星石较多时，可以在这里按数量统一设置总体的养成目标。','分别填写目标等级与数量，再通过「预览应用」检查分配结果，确认后就能应用到对应星石。'])
})
