import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecognitionTutorial from '../src/pages/star/RecognitionTutorial.vue'
import { mountYuanStar } from '../public/yuanstar-embed/yuanstar-embed.js'
import { readGrowthPlanView, createGrowthTutorialViewGuard } from '../src/pages/star/growthPlanTutorial.js'

const workbook=readFileSync('public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx')
let root,handle,wrapper,serial=0
const settle=async()=>{await flushPromises();await new Promise(resolve=>setTimeout(resolve,260));await flushPromises()}
afterEach(async()=>{wrapper?.unmount();wrapper=null;await handle?.dispose();handle=null;root?.remove();vi.restoreAllMocks()})
async function setup(options={},locale='zh-Hans'){
  localStorage.setItem('yuanstar.display.locale',locale)
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(workbook).buffer})))
  vi.stubGlobal('scrollTo',vi.fn());URL.createObjectURL||=()=> 'blob:plan-tutorial';URL.revokeObjectURL||=()=>{}
  root=document.createElement('div');root.id='product-root';document.body.append(root)
  wrapper=mount(RecognitionTutorial,{props:{root,mode:'plan',open:false},attachTo:document.body})
  const account={accountId:'plan-tutorial-embed-'+ ++serial,displayName:'隔离教程 '+serial,gameVersion:'如鸢'},committed=vi.fn()
  handle=mountYuanStar(root,{embedded:true,hostAccount:account,assetBaseUrl:'/yuanstar-embed/',onReadBreakthroughInventory:async()=>({jiezhuping:30,jiezheping:40,jieyangping:50}),onBusinessStateCommitted:committed,...options})
  await handle.setHostAccount(account)
  await handle.applyCloudBusinessSnapshot({generation:1,revision:1,inventory:[
    {starInstanceId:'a',kind:'主星',name:'天府',quality:'橙',level:40},
    {starInstanceId:'b',kind:'主星',name:'天府',quality:'橙',level:30},
  ],planTargets:{a:50,b:60},bag:{currentCount:2,capacity:250},experience:{orange:500,purple:400,white:200}})
  handle.setActiveTab('review');handle.setReviewView('plan');await settle();committed.mockClear()
  return committed
}
const card=()=>document.querySelector('.recognition-tour-card')
async function click(label){[...card().querySelectorAll('button')].find(b=>b.textContent===label).click();await settle()}

it.each(['detail','summary'])('actual embed %s view toggles only display; no automatic row/group selection or business commits',async first=>{
  const committed=await setup()
  if(first==='summary'){root.querySelector('#view-mode-toggle').click();root.querySelector('[data-summary-group-key]').click();await settle()}
  const before=await handle.getCloudBusinessSnapshot()
  await wrapper.setProps({open:true});await settle();await click('下一步');await click('下一步')
  expect(card().querySelector('h2').textContent).toBe(first==='summary'?'按组安排养成目标':'逐颗修改养成计划')
  await click('下一步')
  expect(readGrowthPlanView(root)).toBe(first==='summary'?'detail':'summary')
  expect(root.querySelector('#plan-rows .is-selected')).toBeNull()
  expect(root.querySelector('.growth-editor-empty')).not.toBeNull()
  await click('上一步');expect(readGrowthPlanView(root)).toBe(first)
  await click('下一步');await click('下一步');await click('下一步')
  expect(root.querySelector('[data-growth-complete]').disabled).toBe(true)
  expect(root.querySelectorAll('[data-growth-select-id]:checked,#growth-select-all:checked')).toHaveLength(0)
  expect(root.querySelector('[role="dialog"]')).toBeNull()
  expect(committed).not.toHaveBeenCalled();expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
})

it.each(['detail','summary'])('actual embed preserves unsaved %s draft through blocked tutorial navigation and re-render',async view=>{
  const committed=await setup()
  if(view==='summary'){root.querySelector('#view-mode-toggle').click();root.querySelector('[data-summary-group-key]').click();await settle()}
  else {root.querySelector('[data-star-id="a"]').click();await settle()}
  const before=await handle.getCloudBusinessSnapshot()
  await wrapper.setProps({open:true});await settle();await click('下一步');await click('下一步')
  const selector=view==='summary'?'[data-group-count]':'#growth-target-level',field=root.querySelector(selector)
  field.value=view==='summary'?'2':'59';field.dispatchEvent(new Event('input',{bubbles:true}))
  if(view==='summary')root.querySelector('#growth-group-add').click()
  await settle();const draft=[...root.querySelectorAll('.growth-editor input')].map(e=>[e.id,e.value])
  await click('下一步')
  expect(readGrowthPlanView(root)).toBe(view)
  expect([...root.querySelectorAll('.growth-editor input')].map(e=>[e.id,e.value])).toEqual(draft)
  expect(card().textContent).toContain('4 / 6');expect(card().textContent).toContain('可以自行切换视图')
  await click('上一步')
  expect(committed).not.toHaveBeenCalled();expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
})

const viewButton=()=>root.querySelector('.growth-filters #view-mode-toggle')
function edit(selector,value,type='input'){
  const field=root.querySelector(selector);field.value=value;field.dispatchEvent(new Event(type,{bubbles:true}));return field
}
async function drill(){
  viewButton().click();root.querySelector('[data-summary-group-key]').click();await settle()
  edit('#kind-filter','主星','change');edit('#name-filter','天府');root.querySelector('#apply-filter').click();await settle()
  root.querySelector('[data-summary-group-key]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await settle()
}

it.each(['zh-Hans','zh-Hant'])('actual embed %s drill return restores origin; step 3/4 can page without commits',async locale=>{
  // jsdom has no layout. Supply geometry only for the overlay's target wiring;
  // browser regression separately measures the real highlight and CSS.
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:20,top:80,right:220,bottom:180,width:200,height:100})
  const committed=await setup({},locale)
  expect(viewButton().textContent).toBe(locale==='zh-Hant'?'逐顆明細':'逐颗明细')
  await drill()
  expect(viewButton().getAttribute('aria-pressed')).toBe('false')
  expect(viewButton().textContent).toBe(locale==='zh-Hant'?'返回名稱彙總':'返回名称汇总')
  expect(viewButton().dataset.growthDrilldownReturn).toBe('true')
  expect(viewButton().dataset.growthTutorialBlocked).toBe('false')
  const before=await handle.getCloudBusinessSnapshot(), toggle=vi.fn()
  root.addEventListener('click',e=>{if(e.target.closest('#view-mode-toggle'))toggle()},true)
  await wrapper.setProps({open:true});await settle();await click('下一步');await click('下一步')
  expect(card().querySelector('h2').textContent).toBe('逐颗修改养成计划')
  expect(toggle).not.toHaveBeenCalled();await click('下一步')
  expect(readGrowthPlanView(root)).toBe('summary');expect(toggle).toHaveBeenCalledTimes(1)
  expect(viewButton().dataset.growthDrilldownReturn).toBe('false')
  expect(root.querySelector('#name-filter').value).toBe('天府');expect(root.querySelector('#kind-filter').value).toBe('主星')
  expect(root.querySelector('#sort-filter').getAttribute('aria-disabled')).toBe('true')
  expect(root.querySelector('.growth-group-editor')).not.toBeNull()
  expect(card().querySelector('h2').textContent).toBe('按组安排养成目标')
  expect(document.querySelectorAll('.recognition-tour-ring').length).toBeGreaterThan(0)
  // Returning to the detail topic preserves the restored filters. Its summary
  // origin is consumed, so this is an ordinary filtered detail, not a new drill.
  await click('上一步');expect(readGrowthPlanView(root)).toBe('detail');expect(toggle).toHaveBeenCalledTimes(2)
  expect(card().querySelector('h2').textContent).toBe('逐颗修改养成计划')
  expect(viewButton().dataset.growthDrilldownReturn).toBe('false')
  await click('下一步');expect(readGrowthPlanView(root)).toBe('summary');expect(toggle).toHaveBeenCalledTimes(3)
  expect(root.querySelector('#name-filter').value).toBe('天府');expect(root.querySelector('#kind-filter').value).toBe('主星')
  expect(committed).not.toHaveBeenCalled();expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
  expect(root.querySelector('[role="dialog"]')).toBeNull();expect(root.querySelectorAll('[data-growth-select-id]:checked')).toHaveLength(0)
})

it('actual embed plain name filter cannot impersonate a drill, while already-matching views never click',async()=>{
  await setup();edit('#name-filter','天府');root.querySelector('#apply-filter').click();await settle()
  expect(viewButton().dataset.growthDrilldownReturn).toBe('false');expect(viewButton().textContent).toBe('逐颗明细')
  const toggle=vi.fn();viewButton().addEventListener('click',toggle)
  const guard=createGrowthTutorialViewGuard(root)
  expect(guard.switchTo('detail')).toBe('unchanged');expect(toggle).not.toHaveBeenCalled()
  expect(guard.switchTo('summary')).toBe('changed');expect(toggle).toHaveBeenCalledTimes(1)
  expect(root.querySelector('#name-filter').value).toBe('天府');expect(viewButton().dataset.growthDrilldownReturn).toBe('false');guard.dispose()
})

it.each(['resource','route','unchanged'])('actual embed confirmed %s input does not permanently latch tutorial navigation',async kind=>{
  const committed=await setup()
  // JSDOM has no layout; only provide the anchored editor's geometry.
  vi.spyOn(HTMLInputElement.prototype,'getBoundingClientRect').mockReturnValue({left:200,top:300,right:320,bottom:332,width:120,height:32})
  const field=root.querySelector(kind==='route'?'[data-growth-route-id]':'#growth-experience-orange')
  expect(field.readOnly).toBe(true);field.click()
  const picker=document.querySelector('.yuanstar-level-picker')
  picker.querySelector('[data-level-value]').click()
  const direct=picker.querySelector('[data-level-direct]')
  direct.value=kind==='route'?'2':kind==='resource'?'610':'500';direct.dispatchEvent(new Event('input',{bubbles:true}))
  expect(viewButton().dataset.growthSaveState).toBe('saved');expect(committed).not.toHaveBeenCalled()
  picker.querySelector('[data-level-confirm]').click()
  if(kind!=='unchanged'){
    expect(viewButton().dataset.growthSaveState).toBe('saving')
    const guard=createGrowthTutorialViewGuard(root);expect(guard.switchTo('summary')).toBe('blocked');guard.dispose()
  }
  await vi.waitFor(async()=>{
    expect(viewButton().dataset.growthSaveState).toBe('saved')
    expect(viewButton().dataset.growthTutorialBlocked).toBe('false')
    if(kind==='resource')expect((await handle.getCloudBusinessSnapshot()).experience.orange).toBe(610)
    if(kind==='route')expect(root.querySelector('[data-growth-card-id]').dataset.growthCardId).toBe('b')
  })
  const before=await handle.getCloudBusinessSnapshot();committed.mockClear()
  await wrapper.setProps({open:true});await settle();await click('下一步');await click('下一步');await click('下一步')
  expect(readGrowthPlanView(root)).toBe('summary');expect(committed).not.toHaveBeenCalled()
  expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
})

it.each(['draft','preview','saving','failed'])('actual embed keeps %s state safe through tutorial paging',async kind=>{
  let rejectSave
  const committed=await setup(kind==='saving'||kind==='failed'?{onSaveBreakthroughInventory:()=>new Promise((_,reject)=>{rejectSave=reject})}:{})
  if(kind==='preview'){
    viewButton().click();root.querySelector('[data-summary-group-key]').click();await settle();root.querySelector('#growth-group-preview').click();await settle()
    expect(root.querySelector('.growth-group-preview')).not.toBeNull()
  }else{
    await drill()
    if(kind==='draft')edit('#growth-target-level','59')
    else {edit('#growth-bottle-jiezhuping','31','change');await settle();if(kind==='failed'){rejectSave(new Error('fixture save failed'));await settle()}}
  }
  expect(viewButton().dataset.growthTutorialBlocked).toBe('true')
  const before=await handle.getCloudBusinessSnapshot(),view=readGrowthPlanView(root)
  const drafts=[...root.querySelectorAll('.growth-editor input')].map(e=>[e.id,e.value])
  await wrapper.setProps({open:true});await settle();await click('下一步');await click('下一步');await click('下一步')
  expect(card().textContent).toContain('4 / 6');expect(card().textContent).toContain('可以自行切换视图')
  expect(readGrowthPlanView(root)).toBe(view)
  expect([...root.querySelectorAll('.growth-editor input')].map(e=>[e.id,e.value])).toEqual(drafts)
  expect(document.querySelectorAll('.recognition-tour-ring')).toHaveLength(0)
  expect(committed).not.toHaveBeenCalled();expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
  if(kind==='saving'){rejectSave(new Error('fixture cleanup'));await settle()}
})

it('actual embed bag drill return remains unchanged',async()=>{
  const committed=await setup();handle.setReviewView('bag');await settle()
  root.querySelector('#view-mode-toggle').click();await settle()
  const before=await handle.getCloudBusinessSnapshot()
  root.querySelector('[data-summary-group-key]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await settle()
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('返回名称汇总')
  root.querySelector('#view-mode-toggle').click();await settle()
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('名称汇总')
  expect(committed).not.toHaveBeenCalled();expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
})
