import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RecognitionTutorial from '../src/pages/star/RecognitionTutorial.vue'
import { readGrowthPlanView, createGrowthTutorialViewGuard } from '../src/pages/star/growthPlanTutorial.js'

let root, toggle
beforeEach(()=>{
  vi.useFakeTimers()
  vi.stubGlobal('scrollTo',vi.fn())
  vi.stubGlobal('matchMedia',()=>({matches:false}))
  root=document.createElement('div')
  root.innerHTML='<section class="growth-workspace"><section class="growth-filters"><button id="view-mode-toggle" aria-pressed="false">逐颗明细</button><input id="name-filter" value=""><select id="kind-filter"><option>全部</option><option>主星</option></select><label class="pending-only-toggle"><input id="pending-only" type="checkbox">仅看待养成</label></section><article class="growth-inventory"><div class="table-scroll"><table><tbody id="plan-rows"></tbody></table></div></article><article class="growth-editor"><p class="growth-editor-empty">选择一颗星石以编辑计划。</p></article><section class="growth-resources"></section><section class="growth-route"><div class="growth-route-scroll"><div class="growth-route-list"><input data-growth-select-id="a" type="checkbox"></div></div></section><section class="growth-selection"><input id="growth-select-all" type="checkbox"><button data-growth-complete disabled>完成所选养成</button></section></section>'
  document.body.append(root)
  toggle=vi.fn(()=>setView(readGrowthPlanView(root)==='summary'?'detail':'summary'))
  root.querySelector('#view-mode-toggle').addEventListener('click',toggle)
  for(const element of root.querySelectorAll('*')) element.getBoundingClientRect=()=>({left:20,top:80,right:220,bottom:180,width:200,height:100})
})
function setView(view) {
  const button=root.querySelector('#view-mode-toggle')
  button.setAttribute('aria-pressed',String(view==='summary'))
  button.textContent=view==='summary'?'名称汇总':'逐颗明细'
  root.querySelector('.growth-editor').innerHTML=`<p class="growth-editor-empty">${view==='summary'?'选择名称汇总行编辑组目标':'选择一颗星石以编辑计划'}</p>`
}
const card=()=>document.querySelector('.recognition-tour-card')
async function settle(){await flushPromises();await vi.advanceTimersByTimeAsync(1800);await flushPromises()}
async function click(label){[...card().querySelectorAll('button')].find(button=>button.textContent===label).click();await settle()}
function render(props={}){return mount(RecognitionTutorial,{props:{open:true,root,mode:'plan',...props},attachTo:document.body})}
const title=()=>card().querySelector('h2').textContent

it.each(['detail','summary'])('locks editing order only when first entering step 3 from %s',async first=>{
  render();await settle()
  if(first==='summary'){root.querySelector('#view-mode-toggle').click();await settle()}
  expect(card().textContent).toContain('1 / 6')
  await click('下一步')
  // Steps 1/2 do not pin the internal view.
  setView(first==='summary'?'detail':'summary');await settle();setView(first);await settle()
  await click('下一步')
  const firstTitle=first==='summary'?'按组安排养成目标':'逐颗修改养成计划'
  expect(title()).toBe(firstTitle)
  root.querySelector('#view-mode-toggle').click();await settle()
  expect(card().textContent).toContain('3 / 6');expect(title()).toBe(firstTitle)
  expect(document.querySelectorAll('.recognition-tour-ring')).toHaveLength(0)
  const clicks=toggle.mock.calls.length
  await click('下一步')
  expect(toggle).toHaveBeenCalledTimes(clicks)
  expect(title()).not.toBe(firstTitle)
  await click('上一步')
  expect(readGrowthPlanView(root)).toBe(first);expect(title()).toBe(firstTitle)
  await click('上一步')
  root.querySelector('#view-mode-toggle').click();await settle()
  await click('下一步')
  expect(title()).toBe(firstTitle);expect(readGrowthPlanView(root)).toBe(first)
})

it.each(['detail','summary'])('switches once on step 3→4, back to fixed topic, and never restores initial %s view on close',async first=>{
  setView(first)
  const wrapper=render();await settle();await click('下一步');await click('下一步')
  const other=first==='summary'?'detail':'summary'
  await click('下一步')
  expect(toggle).toHaveBeenCalledTimes(1);expect(readGrowthPlanView(root)).toBe(other)
  await click('上一步');expect(toggle).toHaveBeenCalledTimes(2);expect(readGrowthPlanView(root)).toBe(first)
  await click('下一步');expect(toggle).toHaveBeenCalledTimes(3)
  await click('下一步');await click('下一步')
  expect(card().textContent).toContain('6 / 6')
  expect(root.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0)
  expect(root.querySelector('[data-growth-complete]').disabled).toBe(true)
  await click('完成');await wrapper.setProps({open:false});await settle()
  expect(readGrowthPlanView(root)).toBe(other)
  await wrapper.setProps({open:true});await settle();await click('下一步');await click('下一步')
  expect(title()).toBe(other==='summary'?'按组安排养成目标':'逐颗修改养成计划')
})

it.each(['detail-input','quick-level','group-input','group-add','preview','filtered','saving','missing'])('preserves %s state while allowing step 4 and step 3 paging',async kind=>{
  const wrapper=render();await settle()
  if(kind.startsWith('group')||kind==='preview'){root.querySelector('#view-mode-toggle').click();await settle()}
  await click('下一步');await click('下一步')
  const editor=root.querySelector('.growth-editor')
  if(kind==='detail-input'||kind==='group-input'){
    editor.innerHTML='<input id="draft" value="50">'
    const input=editor.querySelector('input');input.value='59';input.dispatchEvent(new Event('input',{bubbles:true}))
  }
  if(kind==='quick-level'||kind==='group-add'){
    editor.innerHTML=`<button id="${kind==='quick-level'?'growth-quick-sixty':'growth-group-add'}">编辑</button>`
    editor.querySelector('button').click()
  }
  if(kind==='preview') editor.innerHTML='<section class="growth-group-preview">待确认预览</section>'
  if(kind==='filtered') root.querySelector('#name-filter').value='天府'
  if(kind==='saving') await wrapper.setProps({planSwitchBlocked:true})
  if(kind==='missing')root.querySelector('#view-mode-toggle').remove()
  const before=editor.innerHTML, view=readGrowthPlanView(root), clicks=toggle.mock.calls.length
  await click('下一步')
  expect(card().textContent).toContain('4 / 6')
  expect(editor.innerHTML).toBe(before);expect(readGrowthPlanView(root)).toBe(view)
  expect(toggle).toHaveBeenCalledTimes(clicks)
  expect(document.querySelectorAll('.recognition-tour-ring')).toHaveLength(0)
  await click('上一步');expect(card().textContent).toContain('3 / 6')
})

it('guard keeps edits made while the tutorial was closed, survives re-render, and detaches its listeners',async()=>{
  const wrapper=render({open:false});await settle()
  root.querySelector('#view-mode-toggle').click()
  root.querySelector('.growth-editor').innerHTML='<section class="growth-group-editor"><button id="growth-group-add">添加</button></section>'
  root.querySelector('#growth-group-add').click()
  root.querySelector('.growth-editor').innerHTML='<section class="growth-group-editor"><input value="60"></section>'
  await wrapper.setProps({open:true});await settle();await click('下一步');await click('下一步');toggle.mockClear();await click('下一步')
  expect(readGrowthPlanView(root)).toBe('summary');expect(toggle).not.toHaveBeenCalled()
  wrapper.unmount()
  const remove=vi.spyOn(root,'removeEventListener'), guard=createGrowthTutorialViewGuard(root)
  guard.dispose();expect(remove).toHaveBeenCalledTimes(3)
})

it('step 6 highlights summary and visible route checkboxes without any completion action',async()=>{
  const complete=vi.fn();root.querySelector('[data-growth-complete]').addEventListener('click',complete)
  render();await settle();for(let i=0;i<5;i++)await click('下一步')
  expect(title()).toBe('选择并完成本次养成')
  expect(root.querySelector('[data-growth-select-id]').classList.contains('recognition-tutorial-related')).toBe(true)
  expect(complete).not.toHaveBeenCalled();expect(root.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(0)
  expect(fetch).not.toHaveBeenCalled();expect(root.querySelector('[role="dialog"]')).toBeNull()
})

it('closing during a view handoff cannot advance an obsolete opening; replay samples its own step 3',async()=>{
  const wrapper=render();await settle();await click('下一步');await click('下一步')
  root.querySelector('#view-mode-toggle').addEventListener('click',()=>{void wrapper.setProps({open:false})},{once:true})
  await click('下一步')
  expect(card()).toBeNull()
  await wrapper.setProps({open:true,replayId:1});await settle()
  expect(card().textContent).toContain('1 / 6')
  await click('下一步');await click('下一步')
  expect(title()).toBe('按组安排养成目标')
})

it.each(['saving','failed','completion-pending','inventory-conflict','typed-search'])('verified drill still preserves %s protection and paging',async kind=>{
  const button=root.querySelector('#view-mode-toggle')
  button.dataset.growthDrilldownReturn='true';button.dataset.growthTutorialBlocked='false';button.dataset.growthSaveState='saved'
  root.querySelector('#name-filter').value=root.querySelector('#name-filter').defaultValue='天府'
  if(kind==='saving'||kind==='failed')button.dataset.growthSaveState=kind
  if(kind==='completion-pending')root.querySelector('[data-growth-complete]').dataset.completionState='pending'
  if(kind==='inventory-conflict')root.querySelector('.growth-resources').innerHTML='<button id="growth-accept-inventory">使用当前库存</button>'
  if(kind==='typed-search')root.querySelector('#name-filter').value='未应用搜索'
  render();await settle();await click('下一步');await click('下一步');await click('下一步')
  expect(readGrowthPlanView(root)).toBe('detail');expect(toggle).not.toHaveBeenCalled()
  expect(card().textContent).toContain('4 / 6');expect(document.querySelectorAll('.recognition-tour-ring')).toHaveLength(0)
  await click('上一步');expect(card().textContent).toContain('3 / 6')
})
