import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { mountYuanStar } from '../public/yuanstar-embed/yuanstar-embed.js'
import { createStarCloudCoordinator } from '../src/pages/star/starCloudCoordinator.js'
import { createCloudPlanInheritancePort } from '../src/pages/star/starCloudPlanInheritance.js'

const workbook = readFileSync('public/yuanstar-embed/reference/YuanStar_Phase0_6A_经验星曜与突破材料规则_更新.xlsx')
const clone = value => JSON.parse(JSON.stringify(value))
const settle = () => new Promise(resolve => setTimeout(resolve, 80))
let root, handle, coordinator, database, serial = 0
const request = value => new Promise((resolve,reject) => { value.onsuccess=()=>resolve(value.result); value.onerror=()=>reject(value.error) })
afterEach(async()=>{
  await handle?.dispose(); coordinator?.leave(); database?.close(); root?.remove()
  handle=null; coordinator=null; database=null; vi.unstubAllGlobals()
})
async function setup() {
  URL.createObjectURL ||= ()=>'blob:cloud-plan'
  URL.revokeObjectURL ||= ()=>{}
  window.scrollTo=()=>{}
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>Uint8Array.from(workbook).buffer})))
  const account={accountId:'cloud-plan-embed-'+(++serial),displayName:'虚构云端继承账号 '+serial,gameVersion:'如鸢'}
  let state={account_id:account.accountId,generation:2,revision:7,
    inventory:[{instance_id:'new.1',kind:'main',name:'天府',quality:'orange',level:40}],
    plan_targets:{},bag:{current_count:1,capacity:100},experience:{orange:1,purple:525,white:91}}
  let pending={account_id:account.accountId,source_recovery_point_id:'source',source_generation:1,target_generation:2,
    source_state:{inventory:[{instance_id:'old.1',kind:'main',name:'天府',quality:'orange',level:20}],
      plan_targets:[{instance_id:'old.1',target_level:60}],bag:{current_count:1,capacity:100},experience:{orange:0,purple:1,white:2}}}
  const save=action=>vi.fn(async(id,body)=>{
    expect(id).toBe(account.accountId)
    expect(body.expected_generation).toBe(2);expect(body.expected_revision).toBe(7)
    if(action==='confirm'){state.plan_targets=clone(body.plan_targets);state.revision++}
    pending=null
    return {operation_id:body.operation_id,source_recovery_point_id:'source',target_generation:2,revision:state.revision,action}
  })
  const confirm=save('confirm'),discard=save('discard')
  coordinator=createStarCloudCoordinator({selectedHostAccount:()=>account,getState:async()=>clone(state),storage:localStorage})
  const port=createCloudPlanInheritancePort({coordinator,readState:async()=>clone(state),readPending:async()=>clone(pending),confirm,discard})
  root=document.createElement('div');root.id='product-root';document.body.append(root)
  handle=mountYuanStar(root,{embedded:true,hostAccount:account,reviewView:'bag',cloudPlanInheritance:port,
    getOcrRebuildScope:()=>coordinator.ocrRebuildScope()})
  await handle.setHostAccount(account);await settle();await coordinator.enter(handle)
  handle.setActiveTab('review');await settle()
  database=await request(indexedDB.open('yuanstar-static'))
  const localPending=()=>request(database.transaction('meta').objectStore('meta').get('product.pendingPlanInheritance:'+account.accountId))
  return {confirm,discard,state:()=>clone(state),pending:()=>clone(pending),localPending}
}
async function openPlan() {
  handle.setReviewView('plan')
  await vi.waitFor(()=>expect(document.querySelector('.plan-inheritance-dialog')).not.toBeNull(),{timeout:3000})
  return document.querySelector('.plan-inheritance-dialog')
}
it('actual official embed consumes the Host cloud port, defers without mutation, then confirms using the same dialog',async()=>{
  const f=await setup()
  expect(document.querySelector('.plan-inheritance-dialog')).toBeNull()
  const dialog=await openPlan()
  expect(dialog.textContent).toContain('20 → 60')
  expect(await f.localPending()).toBeUndefined()
  dialog.querySelector('footer [data-inheritance-cancel]').click();await settle()
  expect(f.pending()).not.toBeNull();expect(f.state().plan_targets).toEqual({})
  expect(f.confirm).not.toHaveBeenCalled();expect(f.discard).not.toHaveBeenCalled()
  root.querySelector('[data-open-pending-plan]').click()
  await vi.waitFor(()=>expect(document.querySelectorAll('.plan-inheritance-dialog').length).toBe(1))
  document.querySelector('[data-inheritance-confirm]').click()
  await vi.waitFor(()=>expect(f.confirm).toHaveBeenCalledTimes(1))
  await vi.waitFor(async()=>expect((await handle.getCloudBusinessSnapshot()).planTargets).toEqual({'new.1':60}))
  expect(f.pending()).toBeNull();expect(f.state().generation).toBe(2)
  expect(await f.localPending()).toBeUndefined()
})
it('actual official embed discards cloud inheritance through its Host port without changing current business state',async()=>{
  const f=await setup(),before=f.state()
  const dialog=await openPlan()
  dialog.querySelector('footer [data-inheritance-cancel]').click();await settle()
  vi.spyOn(window,'confirm').mockReturnValue(true)
  root.querySelector('[data-discard-pending-plan]').click()
  await vi.waitFor(()=>expect(f.discard).toHaveBeenCalledTimes(1))
  await vi.waitFor(()=>expect(root.querySelector('[data-discard-pending-plan]')).toBeNull())
  expect(f.state()).toEqual(before);expect(f.pending()).toBeNull()
  expect(f.confirm).not.toHaveBeenCalled();expect(await f.localPending()).toBeUndefined()
})
