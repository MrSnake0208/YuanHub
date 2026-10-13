import 'fake-indexeddb/auto'
import {readFileSync} from 'node:fs'
import {afterEach,expect,it,vi} from 'vitest'
import {mountYuanStar} from '../public/yuanstar-embed/yuanstar-embed.js'
const workbook=readFileSync('public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx')
let root,handle,serial=0,db
const settle=()=>new Promise(resolve=>setTimeout(resolve,80))
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
const transact=async(fn)=>{const tx=db.transaction(['meta','restorePoints','workspaces'],'readwrite');const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});fn(tx);await done}
afterEach(async()=>{await handle?.dispose();db?.close();root?.remove();handle=null;vi.unstubAllGlobals()})
async function fixture(initialPlan=false){
 URL.createObjectURL ||= ()=> 'blob:inheritance';URL.revokeObjectURL ||= ()=>{};window.scrollTo=()=>{}
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(workbook).buffer})))
 const account={accountId:'inheritance-ui-'+(++serial),displayName:'虚构旧计划账号 '+serial,gameVersion:'如鸢'}
 let revision=5;const patch=vi.fn(async snapshot=>{revision++;return snapshot})
 const options={embedded:true,hostAccount:account,reviewView:initialPlan?'plan':'bag',getOcrRebuildScope:()=>({accountId:account.accountId,generation:1,revision}),onApplyRecoveredPlan:patch}
 root=document.createElement('div');root.id='product-root';document.body.append(root)
 handle=mountYuanStar(root,options);await handle.setHostAccount(account);await settle()
 await handle.applyCloudBusinessSnapshot({inventory:[{starInstanceId:'new',kind:'主星',name:'天府',quality:'橙',level:50}],planTargets:{},bag:{currentCount:1,capacity:100},experience:{orange:1,purple:2,white:3}})
 db=await request(indexedDB.open('yuanstar-static'))
 const record=await request(db.transaction('workspaces').objectStore('workspaces').get(account.accountId))
 const old={...record.snapshot,inventory:record.snapshot.inventory.map(s=>({...s,starInstanceId:'old',level:40})),planTargets:{old:60},growthRouteOrder:['old']}
 await transact(tx=>{tx.objectStore('restorePoints').put({accountId:account.accountId,restorePointId:'source',reason:'pre_ocr_rebuild',createdAt:new Date().toISOString(),workspaceRevision:1,snapshot:old,imageIds:[]});tx.objectStore('meta').put({accountId:account.accountId,sourceRestorePointId:'source',taskId:'ocr-fixture',phase:'pending',cloudGeneration:1,inventoryIds:['new'],rebuildRevision:1},'product.pendingPlanInheritance:'+account.accountId)})
 return {account,patch,record,options}
}
it('bag remains editable, entering plan opens current-inventory preview; cancel keeps pending and confirm PATCHes only plans',async()=>{
 const {account,patch}=await fixture();handle.setActiveTab('review');await settle()
 expect(document.querySelector('.plan-inheritance-dialog')).toBeNull()
 handle.setReviewView('plan');await settle()
 expect(document.querySelector('.plan-inheritance-dialog').textContent).toContain('当前 50级')
 document.querySelector('[data-inheritance-cancel]').click();await settle()
 expect(root.textContent).toContain('旧养成计划待处理');expect(patch).not.toHaveBeenCalled()
 root.querySelector('[data-open-pending-plan]').click();await settle();document.querySelector('[data-inheritance-confirm]').click();await settle()
 expect(patch).toHaveBeenCalledTimes(1);const sent=patch.mock.calls[0][0]
 expect(sent.inventory[0].level).toBe(50);expect(sent.planTargets).toEqual({new:60});expect(sent.experience).toEqual({orange:1,purple:2,white:3})
 expect(await request(db.transaction('meta').objectStore('meta').get('product.pendingPlanInheritance:'+account.accountId))).toBeUndefined()
 expect((await handle.getCloudBusinessSnapshot()).planTargets).toEqual({new:60})
 expect(root.querySelector('.product-toast').classList.contains('product-toast-info')).toBe(true)
 expect(root.querySelector('.product-toast').textContent).toContain('旧计划已继承')
})

it('four-field group layout reuses soft controls; reselect is inert, occupied candidates swap, Escape closes only the menu',async()=>{
 const {account}=await fixture()
 const current={inventory:[60,50,1,1,60].map((level,i)=>({starInstanceId:'new-'+i,kind:'主星',name:'天府',quality:'橙',level})),planTargets:{},bag:{currentCount:5,capacity:100},experience:{orange:1,purple:2,white:3}}
 await handle.applyCloudBusinessSnapshot(current)
 const record=await request(db.transaction('workspaces').objectStore('workspaces').get(account.accountId))
 const old={...record.snapshot,inventory:record.snapshot.inventory.slice(0,4).map((star,i)=>({...star,starInstanceId:'old-'+i,level:[60,50,1,1][i]})),planTargets:{'old-1':60,'old-2':60,'old-3':50},growthRouteOrder:['old-1','old-2','old-3']}
 await transact(tx=>{tx.objectStore('restorePoints').put({accountId:account.accountId,restorePointId:'source',reason:'pre_ocr_rebuild',createdAt:new Date().toISOString(),workspaceRevision:1,snapshot:old,imageIds:[]});tx.objectStore('meta').put({accountId:account.accountId,sourceRestorePointId:'source',taskId:'ocr-fixture',phase:'pending',cloudGeneration:1,inventoryIds:current.inventory.map(star=>star.starInstanceId),rebuildRevision:1},'product.pendingPlanInheritance:'+account.accountId)})
 handle.setActiveTab('review');handle.setReviewView('plan');await settle()
 const dialog=document.querySelector('.plan-inheritance-dialog'),fields=[...dialog.querySelectorAll('select')],triggers=[...dialog.querySelectorAll('.soft-dropdown-trigger')]
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
 expect(document.querySelector('.plan-inheritance-dialog')).not.toBeNull()
 await handle.applyCloudBusinessSnapshot({inventory:[{starInstanceId:'new',kind:'主星',name:'天府',quality:'橙',level:55}],planTargets:{},bag:{currentCount:1,capacity:100},experience:{orange:1,purple:2,white:3}})
 document.querySelector('[data-inheritance-confirm]').click();await settle()
 expect(document.querySelector('.inheritance-error').textContent).toContain('已变化')
 expect(options.onApplyRecoveredPlan).not.toHaveBeenCalled()
})
