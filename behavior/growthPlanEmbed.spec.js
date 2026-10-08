import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { createGrowthPlanInventoryWriter } from '../src/pages/star/growthPlanInventory.js'
import { mountYuanStar } from '../public/yuanstar-embed/yuanstar-embed.js'
const workbook=readFileSync('public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx')
let root, handle, serial=0
const settle=()=>new Promise(resolve=>setTimeout(resolve,100))
const routeIds=()=>[...root.querySelectorAll('[data-growth-route-id]')].map(e=>e.dataset.growthRouteId)
const change=(selector,value,type='change')=>{const field=root.querySelector(selector);field.value=value;field.dispatchEvent(new Event(type,{bubbles:true}))}
function expectEditorFollows(id,current,target) {
  expect(root.querySelector('#plan-rows .is-selected')?.dataset.starId).toBe(id)
  expect(root.querySelector('#growth-current-level').value).toBe(String(current))
  expect(root.querySelector('#growth-target-level').value).toBe(String(target))
}
beforeAll(()=>{URL.createObjectURL ||= ()=> 'blob:plan-test'; URL.revokeObjectURL ||= ()=>{}; window.scrollTo=()=>{}})
afterEach(async()=>{vi.useRealTimers(); await handle?.dispose(); root?.remove(); handle=null; vi.unstubAllGlobals()})
async function setup(options={}) {
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>{ const bytes=new Uint8Array(workbook.length);bytes.set(workbook);return bytes.buffer }})))
  root=document.createElement('div');root.id='product-root';document.body.appendChild(root)
  const account={accountId:'growth-probe-'+ ++serial,displayName:'P1 测试账号 '+serial,gameVersion:'如鸢'}
  handle=mountYuanStar(root,{embedded:true,assetBaseUrl:'/yuanstar-embed/',hostAccount:account,...options})
  await handle.setHostAccount(account)
  await settle()
  await handle.applyCloudBusinessSnapshot({generation:1,revision:1,inventory:[
    {starInstanceId:'a',kind:'主星',name:'天府',quality:'橙',level:40},
    {starInstanceId:'b',kind:'主星',name:'天府',quality:'紫',level:43},
    {starInstanceId:'c',kind:'辅星',name:'文昌',quality:'橙',level:60}],planTargets:{a:50,b:52},bag:{currentCount:3,capacity:250},experience:{orange:1,purple:77,white:14}})
  handle.setActiveTab('review');handle.setReviewView('plan');await settle()
  expect(root.textContent).not.toContain('规则加载失败')
}
it('isolates plan rows, short resources and interactive route cards from bag review',async()=>{
  const read=vi.fn(async()=>({jiezhuping:5,jiezheping:10,jieyangping:20}))
  await setup({onReadBreakthroughInventory:read})
  expect(root.querySelectorAll('#plan-rows input[type=checkbox]')).toHaveLength(0)
  expect(root.querySelectorAll('.growth-route-card')).toHaveLength(2)
  expect(root.querySelectorAll('.growth-route-card input[type=checkbox]:disabled')).toHaveLength(0)
  expect(root.querySelector('.growth-selection button').disabled).toBe(true)
  expect(root.querySelector('[data-growth-bottle="jiezhuping"]').value).toBe('5')
  expect(root.querySelector('.growth-resources').textContent).not.toMatch(/橙星曜|紫星曜|白星曜/)
  expect(root.querySelector('.ocr-review')).toBeNull();expect(root.querySelector('.experience-section')).toBeNull()
  expect(read).toHaveBeenCalled()
  handle.setReviewView('bag')
  expect(root.querySelectorAll('#plan-rows input[type=checkbox]')).toHaveLength(3)
  expect(root.querySelectorAll('#current-rows input[type=checkbox]')).toHaveLength(3)
  expect(root.querySelector('.ocr-review')).not.toBeNull();expect(root.querySelector('.experience-section').textContent).toContain('橙星曜')
})
it('selects rows by click and keyboard; summary double-click cancels pending single-click',async()=>{
  await setup()
  root.querySelector('[data-star-id="b"]').click()
  expect(root.querySelector('.growth-editor h2').textContent).toContain('天府')
  expect(root.querySelector('#growth-current-level').value).toBe('43')
  root.querySelector('[data-star-id="a"]').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))
  expect(root.querySelector('#growth-current-level').value).toBe('40')
  root.querySelector('[data-star-id="b"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))
  expect(root.querySelector('#growth-current-level').value).toBe('43')
  root.querySelector('#view-mode-toggle').click();vi.useFakeTimers()
  let row=root.querySelector('[data-summary-group-key="主星|天府"]')
  row.click();vi.advanceTimersByTime(220)
  expect(root.querySelector('.summary-row.is-selected')).not.toBeNull()
  row=root.querySelector('[data-summary-group-key="主星|天府"]');row.click();vi.advanceTimersByTime(100);row.click();row.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));vi.advanceTimersByTime(250)
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('逐颗明细')
  expect(root.querySelectorAll('#plan-rows [data-star-id]')).toHaveLength(2)
  root.querySelector('#view-mode-toggle').click()
  expect(root.querySelector('#view-mode-toggle').textContent).toBe('名称汇总')
  expect(root.querySelector('.summary-row.is-selected')).not.toBeNull()
})
it('previews levels and bottles without writing; explicit save preserves inventory quantities',async()=>{
  await setup()
  root.querySelector('[data-star-id="a"]').click()
  const before=await handle.getCloudBusinessSnapshot()
  const level=root.querySelector('#growth-current-level'),target=root.querySelector('#growth-target-level')
  level.value='43';level.dispatchEvent(new Event('input',{bubbles:true}));target.value='52';target.dispatchEvent(new Event('input',{bubbles:true}))
  expect([...root.querySelectorAll('.growth-edit-materials .growth-material-item')].map(e=>e.textContent.trim())).toEqual(['解注瓶 ×0','解谪瓶 ×60','解殃瓶 ×60'])
  expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
  root.querySelector('#growth-save').click();await settle()
  const after=await handle.getCloudBusinessSnapshot()
  expect(after.inventory.find(star=>star.starInstanceId==='a').level).toBe(43);expect(after.planTargets.a).toBe(52)
  expect(after.experience).toEqual(before.experience);expect(after.bag).toEqual(before.bag)
})
it('drops stale bottle reads after account changes',async()=>{
  let resolve
  const pending=new Promise(done=>resolve=done)
  await setup({onReadBreakthroughInventory:owner=>owner.startsWith('growth-new-') ? Promise.resolve({jiezhuping:1,jiezheping:2,jieyangping:3}) : pending})
  await handle.setHostAccount({accountId:'growth-new-'+ ++serial,displayName:'另一个账号',gameVersion:'如鸢'})
  resolve({jiezhuping:999,jiezheping:999,jieyangping:999});await settle()
  expect(root.querySelector('[data-growth-bottle="jiezhuping"]').value).toBe('1')
  expect([...root.querySelectorAll('[data-growth-bottle]')].map(e=>e.value)).not.toContain('999')
})
it('edits real experience quantities and saves only the requested bottle through the host',async()=>{
  const save=vi.fn(async(owner,id,count)=>({jiezhuping:5,jiezheping:count,jieyangping:20}))
  await setup({onReadBreakthroughInventory:async()=>({jiezhuping:5,jiezheping:10,jieyangping:20}),onSaveBreakthroughInventory:save})
  const purple=root.querySelector('[data-growth-experience="purple"]')
  purple.value='80';purple.dispatchEvent(new Event('input',{bubbles:true}))
  expect(root.querySelector('.growth-owned-total b').textContent).toBe('42.4k')
  purple.dispatchEvent(new Event('change',{bubbles:true}));await settle()
  expect((await handle.getCloudBusinessSnapshot()).experience.purple).toBe(80)
  const bottle=root.querySelector('[data-growth-bottle="jiezheping"]')
  bottle.value='24';bottle.dispatchEvent(new Event('change',{bubbles:true}));await settle()
  expect(save).toHaveBeenCalledWith(expect.stringMatching(/^growth-probe-/),'jiezheping',24)
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').value).toBe('24')
  expect(root.querySelector('#clear-filter')).toBeNull()
  expect(root.querySelector('#apply-filter').textContent).toBe('应用筛选')
})
it('direct route indices save once on Enter plus blur and reject invalid input; Escape cancels',async()=>{
  const commit=vi.fn(); await setup({onBusinessCommit:commit}); commit.mockClear()
  const ids=routeIds(), last=ids.at(-1), owner='growth-probe-'+serial, previousRevision=(await storedWorkspace(owner)).revision
  const field=root.querySelector(`[data-growth-route-id="${last}"]`);field.focus();field.value='1'
  field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));field.dispatchEvent(new Event('blur'))
  await settle();expect(routeIds()).toEqual([last,ids[0]])
  expect([...root.querySelectorAll('[data-growth-route-id]')].map(e=>e.value)).toEqual(['1','2'])
  // Local order emits no cloud business/inventory write.
  expect(commit).not.toHaveBeenCalled()
  expect((await storedWorkspace(owner)).revision).toBe(previousRevision+1)
  for(const invalid of ['0','3','1.5','x','']) {
    const f=root.querySelector(`[data-growth-route-id="${last}"]`);f.focus();f.value=invalid;f.blur();expect(f.value).toBe('1')
  }
  const f=root.querySelector(`[data-growth-route-id="${last}"]`);f.focus();f.value='2';f.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle()
  expect(routeIds()).toEqual([last,ids[0]])
})

it('kind and search filters drop hidden selection and drafts without pending-only',async()=>{
  await setup()
  root.querySelector('[data-star-id="b"]').click()
  change('#growth-current-level','44','input');change('#growth-target-level','59','input')
  change('#kind-filter','辅星')
  expectEditorFollows('c',60,60)
  change('#growth-target-level','58','input')
  change('#kind-filter','全部');change('#name-filter','天府','input');root.querySelector('#apply-filter').click()
  expectEditorFollows('b',43,52)
  change('#name-filter','贪狼','input');root.querySelector('#apply-filter').click()
  expect(root.querySelector('#growth-current-level')).toBeNull()
  expect(root.querySelector('#plan-rows .is-selected')).toBeNull()
  expect(root.querySelector('.growth-editor').textContent).toContain('选择一颗星石')
})

it('external removal resets the replacement editor and empty refresh clears it',async()=>{
  await setup();root.querySelector('[data-star-id="b"]').click()
  change('#growth-current-level','44','input');change('#growth-target-level','59','input')
  const before=await handle.getCloudBusinessSnapshot()
  await handle.applyCloudBusinessSnapshot({...before,generation:1,revision:2,inventory:before.inventory.filter(s=>s.starInstanceId!=='b'),planTargets:{a:50}})
  expectEditorFollows('a',40,50)
  await handle.applyCloudBusinessSnapshot({...before,generation:1,revision:3,inventory:[],planTargets:{},bag:{currentCount:0,capacity:250}})
  expect(root.querySelector('#growth-current-level')).toBeNull()
  expect(routeIds()).toEqual([])
  expect(root.querySelector('.growth-route-empty').textContent).toContain('当前账号')
})

it('summary switches clear drafts and double-click loads a visible instance with real levels',async()=>{
  await setup();root.querySelector('[data-star-id="a"]').click()
  change('#growth-current-level','41','input');change('#growth-target-level','59','input')
  root.querySelector('#view-mode-toggle').click()
  expect(root.querySelector('#growth-current-level')).toBeNull()
  root.querySelector('[data-summary-group-key="主星|天府"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))
  expectEditorFollows('b',43,52)
  change('#growth-target-level','58','input');root.querySelector('#view-mode-toggle').click()
  expect(root.querySelector('#growth-current-level')).toBeNull()
  root.querySelector('#view-mode-toggle').click()
  expect(root.querySelector('#growth-current-level')).toBeNull()
  root.querySelector('[data-star-id="a"]').click();expectEditorFollows('a',40,50)
})

it('pending-only falls back and clears the hidden completed instance draft',async()=>{
  await setup();root.querySelector('[data-star-id="c"]').click()
  change('#growth-current-level','59','input')
  const pending=root.querySelector('#pending-only');pending.checked=true;pending.dispatchEvent(new Event('change',{bubbles:true}))
  expectEditorFollows('b',43,52)
})

it('all-account route IDs and default order ignore left search, kind, view, sort and pending-only',async()=>{
  await setup()
  const before=await handle.getCloudBusinessSnapshot()
  await handle.applyCloudBusinessSnapshot({...before,generation:1,revision:2,inventory:[...before.inventory,
    {starInstanceId:'d',kind:'主星',name:'贪狼',quality:'蓝',level:10},
    {starInstanceId:'e',kind:'辅星',name:'解神',quality:'绿',level:20}],planTargets:{a:50,b:52,d:60,e:50}})
  const initial=routeIds();expect(initial).toHaveLength(4)
  change('#name-filter','贪狼','input');root.querySelector('#apply-filter').click()
  expect(root.querySelectorAll('#plan-rows [data-star-id]')).toHaveLength(1);expect(routeIds()).toEqual(initial)
  change('#kind-filter','辅星');expect(root.querySelectorAll('#plan-rows [data-star-id]')).toHaveLength(0);expect(routeIds()).toEqual(initial)
  change('#name-filter','','input');root.querySelector('#apply-filter').click();change('#kind-filter','全部')
  for (const sort of ['name','level','target','catalog']) {change('#sort-filter',sort);expect(routeIds()).toEqual(initial)}
  const pending=root.querySelector('#pending-only');pending.checked=true;pending.dispatchEvent(new Event('change',{bubbles:true}));expect(routeIds()).toEqual(initial)
  root.querySelector('#view-mode-toggle').click();expect(routeIds()).toEqual(initial)
  root.querySelector('[data-summary-group-key="主星|贪狼"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));expect(routeIds()).toEqual(initial)
})

it('unconfirmed bottle save displays unknown stock and retains the original retry target',async()=>{
  const save=vi.fn().mockRejectedValueOnce(new Error('解谪瓶库存可能已发生变化，保存结果与目标不一致。')).mockResolvedValue({jiezhuping:5,jiezheping:24,jieyangping:20})
  await setup({onReadBreakthroughInventory:async()=>({jiezhuping:5,jiezheping:10,jieyangping:20}),onSaveBreakthroughInventory:save})
  change('[data-growth-bottle="jiezheping"]','24');await settle()
  expect(root.querySelector('.growth-error').textContent).toContain('不一致')
  expect([...root.querySelectorAll('[data-growth-bottle]')].every(field => field.value === '')).toBe(true)
  root.querySelector('#growth-retry-inventory').click();await settle()
  expect(save).toHaveBeenCalledTimes(2);expect(save.mock.calls[1].slice(1)).toEqual(['jiezheping',24])
  expect(root.querySelector('#growth-retry-inventory')).toBeNull()
})

const selectRoute=id=>{const f=root.querySelector(`[data-growth-select-id="${id}"]`);f.checked=!f.checked;f.dispatchEvent(new Event('change',{bubbles:true}))}
const selectedRouteIds=()=>[...root.querySelectorAll('[data-growth-select-id]:checked')].map(e=>e.dataset.growthSelectId)

it('select-all uses the full pending account route and clears all without a business write',async()=>{
  await setup();const before=await handle.getCloudBusinessSnapshot()
  change('#name-filter','文昌');root.querySelector('#apply-filter').click()
  expect(root.querySelector('#growth-select-all').checked).toBe(false)
  root.querySelector('#growth-select-all').click();expect(selectedRouteIds().sort()).toEqual(['a','b'])
  expect(root.querySelector('#growth-select-all').checked).toBe(true)
  selectRoute('a');expect(root.querySelector('#growth-select-all').indeterminate).toBe(true)
  root.querySelector('#growth-select-all').click();expect(selectedRouteIds().sort()).toEqual(['a','b'])
  root.querySelector('#growth-select-all').click();expect(selectedRouteIds()).toEqual([])
  const empty=root.querySelector('.growth-selection-lines')
  expect(empty.textContent).toContain('经验需求 0');expect(empty.textContent).toContain('紫折合 0')
  expect(['解注瓶 ×0','解谪瓶 ×0','解殃瓶 ×0'].every(label=>empty.textContent.includes(label))).toBe(true)
  expect(empty.querySelectorAll('b')).toHaveLength(4);expect(empty.textContent).not.toContain('—')
  expect(await handle.getCloudBusinessSnapshot()).toEqual(before)
  expect(root.querySelector('.growth-selection button').disabled).toBe(true)
})

it('achieved goals prune only completed selections, renumber remaining route and preserve resources',async()=>{
  const write=vi.fn();await setup({onSaveBreakthroughInventory:write});selectRoute('a');selectRoute('b');await editOrder('b',1)
  const before=await handle.getCloudBusinessSnapshot()
  root.querySelector('[data-star-id="a"]').click();change('#growth-current-level','60','input')
  root.querySelector('#growth-save').click();await settle()
  const after=await handle.getCloudBusinessSnapshot()
  expect(after.planTargets).toEqual({b:52});expect(after.inventory.find(s=>s.starInstanceId==='a').level).toBe(60)
  expect(routeIds()).toEqual(['b']);expect(root.querySelector('[data-growth-route-id="b"]').value).toBe('1')
  expect(selectedRouteIds()).toEqual(['b']);expect(root.querySelector('.growth-selection').textContent).toContain('本次选中 1颗')
  expect(after.experience).toEqual(before.experience);expect(after.bag).toEqual(before.bag);expect(write).not.toHaveBeenCalled()
})

it('uses purple resource labels in deficits and summary with bold quantities and plain editor experience',async()=>{
  await setup({onReadBreakthroughInventory:async()=>({jiezhuping:1000,jiezheping:1000,jieyangping:1000})})
  const before=await handle.getCloudBusinessSnapshot();await handle.applyCloudBusinessSnapshot({...before,experience:{orange:0,purple:0,white:0}});await settle()
  const gap=root.querySelector('.growth-route-gap');expect(gap.querySelector('.experience-紫')).not.toBeNull();expect(gap.querySelector('.growth-route-purple b').textContent).toMatch(/颗$/)
  expect(root.querySelector('.growth-route-card .growth-route-purple b')).not.toBeNull()
  selectRoute('a');expect(root.querySelector('.growth-selection .experience-紫')).not.toBeNull()
  expect(root.querySelectorAll('.growth-selection-lines b')).toHaveLength(4)
  root.querySelector('[data-star-id="a"]').click();expect(root.querySelector('.growth-edit-experience > b:not(.growth-purple-equivalent)')).toBeNull()
  expect(root.querySelector('.growth-edit-experience .growth-purple-equivalent').tagName).toBe('B')
})
async function editOrder(id,position){const f=root.querySelector(`[data-growth-route-id="${id}"]`);f.focus();f.value=String(position);f.dispatchEvent(new Event('blur'));await settle()}
async function storedWorkspace(owner){return new Promise((resolve,reject)=>{const request=indexedDB.open('yuanstar-static');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('workspaces','readonly');const r=tx.objectStore('workspaces').get(owner);r.onsuccess=()=>resolve(r.result);tx.oncomplete=()=>db.close()}})}
it('multi-select is independent of left rows, retains identity across reorder and clears across accounts',async()=>{
  await setup({onReadBreakthroughInventory:async()=>({jiezhuping:100,jiezheping:100,jieyangping:100})})
  const boundary=root.querySelector('.growth-route-boundary')?.textContent
  root.querySelector('[data-growth-select-id="a"]').focus();selectRoute('a');expect(selectedRouteIds()).toEqual(['a']);expect(document.activeElement.id).toBe('growth-select-a');selectRoute('b');expect(selectedRouteIds().sort()).toEqual(['a','b'])
  expect(root.querySelector('.growth-selection').textContent).toContain('本次选中 2颗')
  expect(root.querySelector('.growth-selection button').disabled).toBe(true)
  expect(root.querySelector('.growth-route-boundary')?.textContent).toBe(boundary)
  root.querySelector('[data-star-id="b"]').click();expect(selectedRouteIds().sort()).toEqual(['a','b'])
  await editOrder('b',1);expect(selectedRouteIds().sort()).toEqual(['a','b'])
  selectRoute('a');expect(selectedRouteIds()).toEqual(['b'])
  await handle.setHostAccount({accountId:'p2-other-'+ ++serial,displayName:'隔离账号',gameVersion:'代号鸢'});await settle()
  expect(selectedRouteIds()).toEqual([]);expect(root.querySelector('.growth-selection').textContent).toContain('本次选中 0颗')
})
it('route order persists in account IDB, survives remount and legacy cloud hydration, selection stays ephemeral',async()=>{
  await setup();const before=await handle.getCloudBusinessSnapshot();selectRoute('b');await editOrder('b',1)
  const owner='growth-probe-'+serial
  expect((await storedWorkspace(owner)).snapshot.growthRouteOrder).toEqual(['b','a'])
  await handle.dispose();handle=mountYuanStar(root,{embedded:true,assetBaseUrl:'/yuanstar-embed/',hostAccount:{accountId:owner,displayName:'重挂载',gameVersion:'如鸢'}})
  await handle.setHostAccount({accountId:owner,displayName:'重挂载',gameVersion:'如鸢'});handle.setActiveTab('review');handle.setReviewView('plan');await settle()
  expect(routeIds()).toEqual(['b','a']);expect(selectedRouteIds()).toEqual([])
  await handle.applyCloudBusinessSnapshot(before);await settle();expect(routeIds()).toEqual(['b','a'])
  await handle.setHostAccount({accountId:'p2-route-other-'+serial,displayName:'不同排序账号',gameVersion:'代号鸢'});await handle.applyCloudBusinessSnapshot(before);await settle();expect(routeIds()).toEqual(['a','b'])
  await handle.setHostAccount({accountId:owner,displayName:'原排序账号',gameVersion:'如鸢'});await settle();expect(routeIds()).toEqual(['b','a'])
  const next={...before,inventory:[...before.inventory,{starInstanceId:'d',kind:'主星',name:'贪狼',quality:'橙',level:10}],planTargets:{...before.planTargets,d:60}}
  await handle.applyCloudBusinessSnapshot(next);await settle();expect(routeIds()).toEqual(['b','a','d'])
  await handle.applyCloudBusinessSnapshot({...next,inventory:next.inventory.map(s=>s.starInstanceId==='b'?{...s,level:52}:s)});await settle();expect(routeIds()).toEqual(['a','d'])
  const record=await storedWorkspace(owner);expect(record.snapshot.inventory).toHaveLength(4)
})
it('native card drag uses the same persisted order and preserves multi-select',async()=>{
  await setup();selectRoute('b')
  const cards=[...root.querySelectorAll('[data-growth-card-id]')]
  cards.forEach((c,i)=>c.getBoundingClientRect=()=>({top:i*100,bottom:i*100+90,height:90}))
  const moving=cards.at(-1);moving.dispatchEvent(new MouseEvent('dragstart',{bubbles:true,clientY:120}))
  root.querySelector('.growth-route-list').dispatchEvent(new MouseEvent('drop',{bubbles:true,cancelable:true,clientY:0}));await settle()
  expect(routeIds()[0]).toBe(moving.dataset.growthCardId);expect(selectedRouteIds()).toEqual(['b'])
})
function touchEvent(type,x,y){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:type==='touchend'?[]:[{clientX:x,clientY:y}]});return e}
it('touch scrolling cancels long press; held drag reorders and cancelled drag never saves',async()=>{
  await setup();const initial=routeIds();vi.useFakeTimers()
  let card=root.querySelector('[data-growth-card-id]'),list=root.querySelector('.growth-route-list')
  card.dispatchEvent(touchEvent('touchstart',30,120));const scroll=touchEvent('touchmove',30,160);list.dispatchEvent(scroll)
  await vi.advanceTimersByTimeAsync(400);expect(scroll.defaultPrevented).toBe(false);expect(root.querySelector('.is-route-dragging')).toBeNull();expect(routeIds()).toEqual(initial)
  card=root.querySelector('[data-growth-card-id="'+initial.at(-1)+'"]')
  card.dispatchEvent(touchEvent('touchstart',30,120));await vi.advanceTimersByTimeAsync(360)
  expect(root.querySelector('.is-route-dragging')).toBe(card)
  list.dispatchEvent(touchEvent('touchcancel',30,120));expect(routeIds()).toEqual(initial)
  const cards=[...root.querySelectorAll('[data-growth-card-id]')];cards.forEach((c,i)=>c.getBoundingClientRect=()=>({top:i*100,bottom:i*100+90,height:90}))
  card.dispatchEvent(touchEvent('touchstart',30,120));await vi.advanceTimersByTimeAsync(360)
  const drag=touchEvent('touchmove',30,0);list.dispatchEvent(drag);expect(drag.defaultPrevented).toBe(true)
  list.dispatchEvent(touchEvent('touchend',30,0));vi.useRealTimers();await settle();expect(routeIds()[0]).toBe(initial.at(-1))
})
it('resource divider follows full order, exact gaps are cumulative and selected summary stays independent',async()=>{
  await setup({onReadBreakthroughInventory:async()=>({jiezhuping:100,jiezheping:55,jieyangping:100})})
  const before=await handle.getCloudBusinessSnapshot()
  await handle.applyCloudBusinessSnapshot({...before,experience:{orange:1000,purple:0,white:0}});await settle()
  expect(root.querySelector('.growth-route-boundary').textContent).toContain('预计可养至此')
  expect(root.querySelector('.growth-route-gap').textContent).toContain('缺解谪瓶 ×55')
  const boundary=root.querySelector('.growth-route-boundary').textContent
  selectRoute('b');expect(root.querySelector('.growth-route-boundary').textContent).toBe(boundary)
  expect(root.querySelector('.growth-selection').textContent).toContain('解谪瓶 ×60')
  await editOrder('b',1);expect(root.querySelector('.growth-route-boundary').textContent).toContain('首项资源不足')
  expect(root.querySelector('.growth-route-gap').textContent).toContain('缺解谪瓶 ×5')
})
it('unknown inventory is never treated as zero or sufficient',async()=>{
  await setup();expect(root.querySelector('.growth-route-estimate').textContent).toContain('无法估算')
  expect(root.querySelector('.growth-route-boundary')).toBeNull()
})

it('held drag scrolls route edges and cancellation never changes saved order',async()=>{
  await setup();const initial=routeIds(),list=root.querySelector('.growth-route-list')
  list.getBoundingClientRect=()=>({top:0,bottom:200,height:200})
  const card=root.querySelector('[data-growth-card-id]')
  vi.useFakeTimers();card.dispatchEvent(new MouseEvent('dragstart',{bubbles:true,clientY:190}))
  list.dispatchEvent(new MouseEvent('dragover',{bubbles:true,cancelable:true,clientY:199}))
  await vi.advanceTimersByTimeAsync(100);expect(list.scrollTop).toBeGreaterThan(0)
  list.dispatchEvent(new Event('dragend',{bubbles:true}));vi.useRealTimers();await settle();expect(routeIds()).toEqual(initial)
})

async function inventoryRecoveryFixture() {
  let count = 10, baseline = null, error = null
  const documents = [], reads = vi.fn(async ({ accountId }) => {
    if (error) throw error
    return [{ account_id: accountId, entity_type: 'item', entries: {
      jiezhuping: { count: 5 }, jiezheping: { count, listed_baseline_at: baseline }, jieyangping: { count: 20 }, baijinbi: { count: 999 },
    } }]
  })
  const post = vi.fn(async doc => { documents.push(JSON.stringify(doc)); baseline = doc.records[0].effective_at; return { accepted: 1 } })
  const writer = createGrowthPlanInventoryWriter({ getCurrent: reads, importInventory: post, isCurrent: () => true, createId: () => 'embed-' + documents.length })
  const accept = vi.fn((...args) => writer.acceptCurrent(...args))
  await setup({ onReadBreakthroughInventory: owner => writer.read(owner), onSaveBreakthroughInventory: (...args) => writer.save(...args), onAcceptBreakthroughInventory: accept })
  return { writer, documents, reads, post, accept, setCount: value => { count = value }, setBaseline: value => { baseline = value }, setError: value => { error = value } }
}
it('real writer conflict exposes GET-only recovery; acceptance unlocks fields and preserves experience/route', async () => {
  const f = await inventoryRecoveryFixture(), before = await handle.getCloudBusinessSnapshot(), route = routeIds()
  change('[data-growth-bottle="jiezheping"]', '24'); await settle()
  expect(root.querySelector('.growth-error').textContent).toContain('尝试保存：24，当前读取：10')
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').value).toBe('10')
  expect(root.querySelector('.growth-route-estimate').textContent).toContain('无法估算')
  expect([...root.querySelectorAll('[data-growth-bottle]')].every(field => field.disabled)).toBe(true)
  expect(root.querySelector('#growth-retry-inventory').textContent).toBe('重新读取')
  expect(root.querySelector('#growth-accept-inventory').disabled).toBe(false)
  root.querySelector('#growth-retry-inventory').focus(); root.querySelector('#growth-retry-inventory').click(); await settle()
  expect(document.activeElement.id).toBe('growth-retry-inventory')
  expect(f.post).toHaveBeenCalledTimes(1); expect(root.querySelector('.growth-error').textContent).toContain('不一致')
  f.setCount(8); root.querySelector('#growth-accept-inventory').focus(); root.querySelector('#growth-accept-inventory').click(); await settle()
  expect(document.activeElement.id).toBe('growth-bottle-jiezheping')
  expect(f.accept).toHaveBeenCalledTimes(1); expect(f.post).toHaveBeenCalledTimes(1)
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').value).toBe('8')
  expect([...root.querySelectorAll('[data-growth-bottle]')].every(field => !field.disabled)).toBe(true)
  expect(root.querySelector('.growth-error')).toBeNull(); expect(root.querySelector('#growth-retry-inventory')).toBeNull()
  expect(await handle.getCloudBusinessSnapshot()).toEqual(before); expect(routeIds()).toEqual(route)
  f.setCount(0); change('[data-growth-bottle="jiezheping"]', '0'); await settle()
  expect(f.post).toHaveBeenCalledTimes(2)
  const first = JSON.parse(f.documents[0]).records[0], next = JSON.parse(f.documents[1]).records[0]
  expect(next.record_id).not.toBe(first.record_id); expect(next.entries).toEqual([{ id: 'jiezheping', name: '解谪瓶', count: 0 }])
  expect(root.querySelector('[data-growth-bottle="jiezhuping"]').value).toBe('5'); expect(root.querySelector('[data-growth-bottle="jieyangping"]').value).toBe('20')
})
it('matching conflict reread ends pending without import or acceptance', async () => {
  const f = await inventoryRecoveryFixture()
  change('[data-growth-bottle="jiezheping"]', '24'); await settle()
  f.setCount(24); root.querySelector('#growth-retry-inventory').click(); await settle()
  expect(f.writer.hasPending()).toBe(false); expect(f.post).toHaveBeenCalledTimes(1)
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').disabled).toBe(false)
  expect(root.querySelector('#growth-accept-inventory')).toBeNull()
})
it('lagging baselines and failed GETs cannot offer acceptance or unlock the inputs', async () => {
  const f = await inventoryRecoveryFixture()
  change('[data-growth-bottle="jiezheping"]', '24'); await settle()
  const baseline = JSON.parse(f.documents[0]).records[0].effective_at
  f.setBaseline(null); root.querySelector('#growth-retry-inventory').click(); await settle()
  expect(root.querySelector('#growth-accept-inventory').disabled).toBe(true)
  expect(root.querySelector('.growth-error').textContent).toContain('尚未证实')
  expect([...root.querySelectorAll('[data-growth-bottle]')].every(field => field.value === '')).toBe(true)
  f.setBaseline(baseline); root.querySelector('#growth-retry-inventory').click(); await settle()
  expect(root.querySelector('#growth-accept-inventory').disabled).toBe(false)
  f.setError(Object.assign(new Error('读取失败，请重新读取'), { status: 403 }))
  root.querySelector('#growth-retry-inventory').click(); await settle()
  expect(root.querySelector('#growth-accept-inventory')).toBeNull()
  expect(root.querySelector('#growth-retry-inventory').textContent).toBe('重新读取')
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').disabled).toBe(true)
  expect(f.writer.hasPending()).toBe(true); expect(f.post).toHaveBeenCalledTimes(1)
  f.setError(null); f.setCount(24); root.querySelector('#growth-retry-inventory').click(); await settle()
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').disabled).toBe(false)
})
it('unknown import retry sends identical bytes and offers no acceptance', async () => {
  const f = await inventoryRecoveryFixture()
  f.post.mockRejectedValueOnce(new TypeError('连接中断，写入结果未确认'))
  change('[data-growth-bottle="jiezheping"]', '24'); await settle()
  expect(root.querySelector('#growth-retry-inventory').textContent).toBe('重试')
  expect(root.querySelector('#growth-accept-inventory')).toBeNull()
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').disabled).toBe(true)
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').value).toBe('')
  f.setCount(24); root.querySelector('#growth-retry-inventory').click(); await settle()
  expect(f.post).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(f.post.mock.calls[0][0])).toBe(JSON.stringify(f.post.mock.calls[1][0]))
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').disabled).toBe(false)
})
it('obsolete acceptance cannot overwrite a newly entered account', async () => {
  let resolve
  const accept = vi.fn(() => new Promise(done => { resolve = done }))
  const read = vi.fn(async () => ({ jiezhuping: 1, jiezheping: 2, jieyangping: 3 }))
  const save = vi.fn(async (owner, id, count) => { throw Object.assign(new Error('库存与保存目标不一致'), { inventoryPending: { accountId: owner, id, count, phase: 'conflict', currentCount: 2, canAccept: true } }) })
  await setup({ onReadBreakthroughInventory: read, onSaveBreakthroughInventory: save, onAcceptBreakthroughInventory: accept })
  change('[data-growth-bottle="jiezheping"]', '24'); await settle()
  root.querySelector('#growth-accept-inventory').click()
  await handle.setHostAccount({ accountId: 'growth-accept-new-' + ++serial, displayName: '新账号', gameVersion: '如鸢' })
  resolve({ jiezhuping: 999, jiezheping: 999, jieyangping: 999 }); await settle()
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').value).toBe('2')
  expect(root.querySelector('[data-growth-bottle="jiezheping"]').disabled).toBe(false)
  expect(root.querySelector('#growth-accept-inventory')).toBeNull()
})
