import 'fake-indexeddb/auto'
import {readFileSync} from 'node:fs'
import {afterEach,expect,it,vi} from 'vitest'
import {mountYuanStar} from '../public/yuanstar-embed/yuanstar-embed.js'
import {createStarCloudCoordinator} from '../src/pages/star/starCloudCoordinator.js'
const workbook=readFileSync('public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx')
let root,handle,serial=0,db
const settle=()=>new Promise(resolve=>setTimeout(resolve,80))
async function inheritanceDialog() {
 let node
 await vi.waitFor(()=>{node=document.querySelector('.plan-inheritance-dialog');expect(node).not.toBeNull()},{timeout:3000,interval:20})
 return node
}
async function clickInheritance(selector) { (await inheritanceDialog()).querySelector(selector).click() }
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
const transact=async(fn)=>{const tx=db.transaction(['meta','restorePoints','workspaces'],'readwrite');const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});fn(tx);await done}
afterEach(async()=>{await handle?.dispose();db?.close();root?.remove();handle=null;vi.unstubAllGlobals()})
async function fixture(initialPlan=false,cloudOptions){
 URL.createObjectURL ||= ()=> 'blob:inheritance';URL.revokeObjectURL ||= ()=>{};window.scrollTo=()=>{}
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(workbook).buffer})))
 const account={accountId:'inheritance-ui-'+(++serial),displayName:'虚构旧计划账号 '+serial,gameVersion:'如鸢'}
 let revision=5;const patch=vi.fn(async snapshot=>{revision++;return snapshot})
 const options={embedded:true,hostAccount:account,reviewView:initialPlan?'plan':'bag',getOcrRebuildScope:()=>({accountId:account.accountId,generation:1,revision}),onApplyRecoveredPlan:patch}
 let coordinator
 if(cloudOptions){
  coordinator=createStarCloudCoordinator({selectedHostAccount:()=>account,storage:localStorage,...cloudOptions})
  options.getOcrRebuildScope=()=>coordinator.ocrRebuildScope()
  options.onApplyRecoveredPlan=(snapshot,scope)=>coordinator.applyRecoveredPlan(snapshot,scope)
 }
 root=document.createElement('div');root.id='product-root';document.body.append(root)
 handle=mountYuanStar(root,options);await handle.setHostAccount(account);await settle()
 await handle.applyCloudBusinessSnapshot({inventory:[{starInstanceId:'new',kind:'主星',name:'天府',quality:'橙',level:50}],planTargets:{},bag:{currentCount:1,capacity:100},experience:{orange:1,purple:2,white:3}})
 if(coordinator) await coordinator.enter(handle)
 db=await request(indexedDB.open('yuanstar-static'))
 const record=await request(db.transaction('workspaces').objectStore('workspaces').get(account.accountId))
 const old={...record.snapshot,inventory:record.snapshot.inventory.map(s=>({...s,starInstanceId:'old',level:40})),planTargets:{old:60},growthRouteOrder:['old']}
 await transact(tx=>{tx.objectStore('restorePoints').put({accountId:account.accountId,restorePointId:'source',reason:'pre_ocr_rebuild',createdAt:new Date().toISOString(),workspaceRevision:1,snapshot:old,imageIds:[]});tx.objectStore('meta').put({accountId:account.accountId,sourceRestorePointId:'source',taskId:'ocr-fixture',phase:'pending',cloudGeneration:1,inventoryIds:['new'],rebuildRevision:1},'product.pendingPlanInheritance:'+account.accountId)})
 return {account,patch,record,options,coordinator}
}

const cloudState=()=>({generation:1,revision:5,inventory:[{instance_id:'new',kind:'main',name:'天府',quality:'orange',level:50}],
 plan_targets:{},bag:{current_count:1,capacity:100},experience:{orange:1,purple:2,white:3}})
it.each([409,422])('real embed + host: rejected plan %i retains the old plan and allows re-preview and saving after reload',async status=>{
 let rejected=true,current=cloudState()
 const patchState=vi.fn(async(_account,body)=>{if(rejected) throw Object.assign(new Error('plan rejected'),{status});current={...current,revision:6,plan_targets:body.plan_targets};return {state:current}})
 const {account,coordinator}=await fixture(false,{getState:async()=>current,patchState})
 const key='product.pendingPlanInheritance:'+account.accountId
 const source=await request(db.transaction('restorePoints').objectStore('restorePoints').get([account.accountId,'source']))
 handle.setActiveTab('review');handle.setReviewView('plan');await settle()
 await clickInheritance('[data-inheritance-confirm]');await settle()
 const pending=await request(db.transaction('meta').objectStore('meta').get(key))
 expect(pending.phase).toBe('pending');expect(pending.confirmation).toBeUndefined()
 expect(localStorage.getItem('yuanhub.star-plan-pending:'+account.accountId)).toBeNull()
 await coordinator.enter(handle);await settle()
 rejected=false;root.querySelector('[data-open-pending-plan]').click();await settle()
 await clickInheritance('[data-inheritance-confirm]');await settle()
 expect(patchState).toHaveBeenCalledTimes(2)
 expect(await request(db.transaction('meta').objectStore('meta').get(key))).toBeUndefined()
 expect((await handle.getCloudBusinessSnapshot()).planTargets).toEqual({new:60})
 expect(await request(db.transaction('restorePoints').objectStore('restorePoints').get([account.accountId,'source']))).toEqual(source)
})

it.each([new TypeError('network lost'),Object.assign(new Error('identity changed'),{status:401,code:'request_identity_changed'})])('real embed + host: uncertain plan keeps its durable confirmation (%s)',async failure=>{
 const {account}=await fixture(false,{getState:async()=>cloudState(),patchState:async()=>{throw failure}})
 handle.setActiveTab('review');handle.setReviewView('plan');await settle()
 await clickInheritance('[data-inheritance-confirm]');await settle()
 expect((await request(db.transaction('meta').objectStore('meta').get('product.pendingPlanInheritance:'+account.accountId))).confirmation).toBeTruthy()
 expect(localStorage.getItem('yuanhub.star-plan-pending:'+account.accountId)).not.toBeNull()
 expect(root.querySelector('[data-discard-pending-plan]')).toBeNull()
})

it.each([false,true])('real embed + host: failed preflight GET sends no PATCH and allows discarding after reload (empty plan: %s)',async emptyPlan=>{
 let failRead=false
 const patchState=vi.fn()
 const {account,coordinator}=await fixture(false,{getState:async()=>{if(failRead) throw new TypeError('read offline');return cloudState()},patchState})
 handle.setActiveTab('review');handle.setReviewView('plan');await settle()
 if(emptyPlan){
  (await inheritanceDialog()).querySelector('.soft-dropdown-trigger').click()
  document.querySelector('.plan-inheritance-dialog .yuanstar-dropdown-portal [role="option"]').click()
 }
 failRead=true;await clickInheritance('[data-inheritance-confirm]');await settle()
 const key='product.pendingPlanInheritance:'+account.accountId
 expect(patchState).not.toHaveBeenCalled()
 expect((await request(db.transaction('meta').objectStore('meta').get(key))).confirmation).toBeUndefined()
 failRead=false;await coordinator.enter(handle);await settle()
 vi.spyOn(window,'confirm').mockReturnValue(true)
 root.querySelector('[data-discard-pending-plan]').click();await settle()
 expect(await request(db.transaction('meta').objectStore('meta').get(key))).toBeUndefined()
 expect((await handle.getCloudBusinessSnapshot()).inventory[0].level).toBe(50)
})

it('real embed + host: explicitly rejected OCR releases only its prepared marker and preserves the current workspace and restore point',async()=>{
 const {account,coordinator}=await fixture(false,{getState:async()=>cloudState(),rebuildState:async()=>{throw Object.assign(new Error('OCR rejected'),{status:422})}})
 const key='product.pendingPlanInheritance:'+account.accountId
 const pending=await request(db.transaction('meta').objectStore('meta').get(key))
 await transact(tx=>tx.objectStore('meta').put({...pending,phase:'prepared',cloudGeneration:2},key))
 const snapshot=await handle.getCloudBusinessSnapshot()
 const source=await request(db.transaction('restorePoints').objectStore('restorePoints').get([account.accountId,'source']))
 await expect(coordinator.rebuildOcr(snapshot,'source',coordinator.ocrRebuildScope())).rejects.toThrow('OCR rejected')
 expect(await request(db.transaction('meta').objectStore('meta').get(key))).toBeUndefined()
 expect(await handle.getCloudBusinessSnapshot()).toEqual(snapshot)
 expect(await request(db.transaction('restorePoints').objectStore('restorePoints').get([account.accountId,'source']))).toEqual(source)
 expect(coordinator.needsRetry()).toBe(false)
 handle.setActiveTab('review');handle.setReviewView('plan');await settle()
 expect(document.querySelector('.plan-inheritance-dialog')).toBeNull()
 expect(root.textContent).not.toContain('保存结果待确认')
})

it('real embed + host: ordinary conflict recovery hydrates IDB without clearing plan inheritance or OCR recovery points',async()=>{
 let current=cloudState(),rejected=true
 const patchState=vi.fn(async(_account,body)=>{
  if(rejected) throw Object.assign(Error('conflict'),{status:409})
  expect(body.expected_generation).toBe(current.generation);expect(body.expected_revision).toBe(current.revision)
  current={...current,revision:current.revision+1,inventory:body.inventory,plan_targets:body.plan_targets,experience:body.experience,bag:body.bag}
  return {state:current}
 })
 const {account,coordinator}=await fixture(false,{getState:async()=>current,patchState})
 const planKey='product.pendingPlanInheritance:'+account.accountId
 const pendingPlan=await request(db.transaction('meta').objectStore('meta').get(planKey))
 const source=await request(db.transaction('restorePoints').objectStore('restorePoints').get([account.accountId,'source']))
 const local={...await handle.getCloudBusinessSnapshot(),bag:{currentCount:2,capacity:100}}
 await handle.applyCloudBusinessSnapshot(local)
 expect(coordinator.committed({accountId:account.accountId,snapshot:local})).toBe(true);await settle()
 current={...current,revision:6,inventory:current.inventory.map(star=>({...star,level:55}))}
 expect(patchState).toHaveBeenCalledTimes(1)
 const writerKey='yuanhub.star-state:'+account.accountId,pendingRaw=localStorage.getItem(writerKey)
 expect(await coordinator.discardAndReload()).toBe(true)
 expect(patchState).toHaveBeenCalledTimes(1)
 expect(localStorage.getItem(writerKey)).toBeNull()
 const hydrated=await handle.getCloudBusinessSnapshot()
 expect(hydrated.inventory[0].level).toBe(55);expect(hydrated.bag.currentCount).toBe(1)
 expect((await request(db.transaction('workspaces').objectStore('workspaces').get(account.accountId))).snapshot.inventory[0].level).toBe(55)
 expect(await request(db.transaction('meta').objectStore('meta').get(planKey))).toEqual(pendingPlan)
 expect(await request(db.transaction('restorePoints').objectStore('restorePoints').get([account.accountId,'source']))).toEqual(source)
 const backupKey=Object.keys(localStorage).find(key=>key.startsWith('yuanhub.star-state-backup:'+account.accountId+':'))
 expect(JSON.parse(localStorage.getItem(backupKey)).pendingRaw).toBe(pendingRaw)
 rejected=false
 const edited={...hydrated,inventory:hydrated.inventory.map(star=>({...star,level:56}))}
 await handle.applyCloudBusinessSnapshot(edited)
 coordinator.committed({accountId:account.accountId,snapshot:edited});await settle()
 expect(patchState.mock.calls.at(-1)[1].expected_revision).toBe(6)
 expect(current.inventory[0].level).toBe(56)
 expect(coordinator.needsRetry()).toBe(false)
})
it('bag remains editable, entering plan opens current-inventory preview; cancel keeps pending and confirm PATCHes only plans',async()=>{
 const {account,patch}=await fixture();handle.setActiveTab('review');await settle()
 expect(document.querySelector('.plan-inheritance-dialog')).toBeNull()
 handle.setReviewView('plan');await settle()
 expect((await inheritanceDialog()).textContent).toContain('当前 50级')
 await clickInheritance('[data-inheritance-cancel]');await settle()
 expect(root.textContent).toContain('旧养成计划待处理');expect(patch).not.toHaveBeenCalled()
 root.querySelector('[data-open-pending-plan]').click();await settle();await clickInheritance('[data-inheritance-confirm]');await settle()
 expect(patch).toHaveBeenCalledTimes(1);const sent=patch.mock.calls[0][0]
 expect(sent.inventory[0].level).toBe(50);expect(sent.planTargets).toEqual({new:60});expect(sent.experience).toEqual({orange:1,purple:2,white:3})
 expect(await request(db.transaction('meta').objectStore('meta').get('product.pendingPlanInheritance:'+account.accountId))).toBeUndefined()
 expect((await handle.getCloudBusinessSnapshot()).planTargets).toEqual({new:60})
 expect(root.querySelector('.product-toast').classList.contains('product-toast-info')).toBe(true)
 expect(root.querySelector('.product-toast').textContent).toContain('旧养成计划已继承')
})

it('four-field group layout reuses soft controls; reselect is inert, occupied candidates swap, Escape closes only the menu',async()=>{
 const {account}=await fixture()
 const current={inventory:[60,50,1,1,60].map((level,i)=>({starInstanceId:'new-'+i,kind:'主星',name:'天府',quality:'橙',level})),planTargets:{},bag:{currentCount:5,capacity:100},experience:{orange:1,purple:2,white:3}}
 await handle.applyCloudBusinessSnapshot(current)
 const record=await request(db.transaction('workspaces').objectStore('workspaces').get(account.accountId))
 const old={...record.snapshot,inventory:record.snapshot.inventory.slice(0,4).map((star,i)=>({...star,starInstanceId:'old-'+i,level:[60,50,1,1][i]})),planTargets:{'old-1':60,'old-2':60,'old-3':50},growthRouteOrder:['old-1','old-2','old-3']}
 await transact(tx=>{tx.objectStore('restorePoints').put({accountId:account.accountId,restorePointId:'source',reason:'pre_ocr_rebuild',createdAt:new Date().toISOString(),workspaceRevision:1,snapshot:old,imageIds:[]});tx.objectStore('meta').put({accountId:account.accountId,sourceRestorePointId:'source',taskId:'ocr-fixture',phase:'pending',cloudGeneration:1,inventoryIds:current.inventory.map(star=>star.starInstanceId),rebuildRevision:1},'product.pendingPlanInheritance:'+account.accountId)})
 handle.setActiveTab('review');handle.setReviewView('plan');await settle()
 const dialog=await inheritanceDialog(),fields=[...dialog.querySelectorAll('select')],triggers=[...dialog.querySelectorAll('.soft-dropdown-trigger')]
 expect(dialog.querySelector('summary').textContent).toBe('天府 · 橙');expect(dialog.querySelector('.inheritance-inventories').textContent).toContain('60级 × 1，50级 × 1，1级 × 2')
 expect(dialog.querySelectorAll('.inheritance-slot')).toHaveLength(3);expect(triggers).toHaveLength(3);expect(dialog.querySelector('[data-inheritance-result]')).toBeNull()
 const changed=vi.fn();fields[0].addEventListener('change',changed)
 const first=fields[0].value,second=fields[1].value
 triggers[0].click();dialog.querySelector('.yuanstar-dropdown-portal [aria-selected="true"]').click();expect(changed).not.toHaveBeenCalled();expect(document.activeElement).toBe(triggers[0])
 triggers[0].click();[...dialog.querySelectorAll('.yuanstar-dropdown-portal [role="option"]')].find(button=>button.textContent==='当前 50级 → 60').click()
 expect(changed).toHaveBeenCalledTimes(1);expect(fields[0].value).toBe(second);expect(fields[1].value).toBe(first)
 expect(new Set(fields.map(field=>field.value)).size).toBe(3)
 triggers[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))
 expect(dialog.querySelector('.yuanstar-dropdown-portal').contains(document.activeElement)).toBe(true)
 document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))
 expect(dialog.open).toBe(true);expect(dialog.querySelector('.yuanstar-dropdown-portal')).toBeNull();expect(document.activeElement).toBe(triggers[0])
 triggers[0].click();dialog.querySelector('.yuanstar-dropdown-portal [role="option"]').click()
 expect(dialog.querySelector('.inheritance-summary').textContent).toContain('无法匹配 1')
 dialog.querySelector('footer [data-inheritance-cancel]').click();await settle()
 expect(await request(db.transaction('meta').objectStore('meta').get('product.pendingPlanInheritance:'+account.accountId))).toBeTruthy()
})
it('remount already in plan view reopens durable pending workflow and rejects stale confirmation',async()=>{
 const {options}=await fixture(true);await handle.dispose();handle=mountYuanStar(root,options);await handle.setHostAccount(options.hostAccount);handle.setActiveTab('review');handle.setReviewView('plan');await settle()
 expect(await inheritanceDialog()).not.toBeNull()
 await handle.applyCloudBusinessSnapshot({inventory:[{starInstanceId:'new',kind:'主星',name:'天府',quality:'橙',level:55}],planTargets:{},bag:{currentCount:1,capacity:100},experience:{orange:1,purple:2,white:3}})
 await clickInheritance('[data-inheritance-confirm]');await settle()
 expect(document.querySelector('.inheritance-error').textContent).toContain('已更新')
 expect(options.onApplyRecoveredPlan).not.toHaveBeenCalled()
})
