// Development review only. Never changes public embed or its committed provenance.
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync,readdirSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const source=process.argv[2] && resolve(process.argv[2])
if(!source) throw new Error('Usage: node scripts/stage-star-completion-preview.mjs <authoritative source checkout>')
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim()
const before=git('status','--porcelain')
const built=join(source,'web','dist','embed'),target=join(root,'.ux','audits','p3b-ui-preview')
const files=(directory,prefix='')=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const path=prefix+entry.name
  if(entry.isDirectory())return files(join(directory,entry.name),path+'/')
  if(!entry.isFile())throw new Error('Unexpected preview entry: '+path)
  return [path]
}).sort()
const paths=files(built)
if(JSON.stringify(paths)!==JSON.stringify(files(join(root,'public','yuanstar-embed'))))throw new Error('Preview resource set differs from the 12-file embed set')
const hashes={}
for(const path of paths){
  const destination=join(target,path),bytes=readFileSync(join(built,path))
  mkdirSync(dirname(destination),{recursive:true});copyFileSync(join(built,path),destination)
  if(!readFileSync(destination).equals(bytes))throw new Error('Preview byte mismatch: '+path)
  hashes[path]=createHash('sha256').update(bytes).digest('hex')
}
const changed=execFileSync('git',['-C',source,'diff','--name-only','-z','HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean)
const added=execFileSync('git',['-C',source,'ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean)
const sourceFiles=Object.fromEntries([...new Set([...changed,...added])].sort().map(path=>[path,createHash('sha256').update(readFileSync(join(source,path))).digest('hex')]))
if(git('status','--porcelain')!==before)throw new Error('Source changed during preview staging')
writeFileSync(join(target,'preview-manifest.json'),JSON.stringify({kind:'development-review-only',baseCommit:git('rev-parse','HEAD'),branch:git('branch','--show-current'),workingTree:before?'dirty':'clean',sourceFiles,artifacts:hashes},null,2)+'\n','utf8')
console.log(`Staged ${paths.length} byte/hash-verified review artifacts; public embed/provenance untouched.`)
