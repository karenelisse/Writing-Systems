const { TFile }=require('obsidian');
const {assertPath,id}=require('../lib/project');
const {ensureFolder}=require('./files');
async function inspectRecovery(plugin,root){
 const vault=plugin.app.vault,path=root+'/Writing System Operation.json';
 const file=vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw Error('No interrupted operation found.');
 const text=await vault.read(file),journal=JSON.parse(text);
 if(journal.root!==root||!Array.isArray(journal.files)||!['staging','writing',undefined].includes(journal.phase))throw Error('Invalid operation journal.');
 const entries=[];
 if(journal.status==='complete')return {root,file,text,journal,entries};
 for(const op of journal.files){
  assertPath(op.target);if(op.source)assertPath(op.source);
  if(op.temp&&(!op.temp.startsWith(root+'/Writing System Staging ')||op.temp.includes('..')))throw Error('Unsafe recovery path.');
  if(!op.source&&!op.target.startsWith(root+'/'))throw Error('Unsafe recovery creation.');
  if(op.source!==op.target&&op.source&&!op.source.startsWith(root+'/'))throw Error('Unsafe recovery move.');
  const previousRecovery=journal.recovery?.find(r=>r.source===op.source);
  if(previousRecovery)assertPath(previousRecovery.temp);
  const location=previousRecovery?(vault.getAbstractFileByPath(previousRecovery.temp)?previousRecovery.temp:journal.recoveryPhase==='restoring'?op.source:previousRecovery.location):op.temp?(vault.getAbstractFileByPath(op.temp)?op.temp:journal.phase==='staging'?op.source:op.target):op.source||op.target;
  let f=vault.getAbstractFileByPath(location);
  if (!op.source && journal.phase==='staging' && !journal.recovery) f=null;
  if (op.trash && !f && journal.recoveryPhase==='restoring') f=vault.getAbstractFileByPath(op.source);
  if(op.source&&!op.trash&&!(f instanceof TFile))throw Error('Recovery source is missing: '+location);
  if(f instanceof TFile&&op.before!==undefined){const content=await vault.read(f);if(content!==op.before&&content!==op.after)throw Error('File was edited after interruption; preserve and resolve it manually: '+location);}
  if(!op.source&&f instanceof TFile&&await vault.read(f)!==(op.after||''))throw Error('A newly created file was edited after interruption: '+location);
  entries.push({op,file:f,location});
 }
 const moving=new Set(entries.filter(e=>e.op.temp).map(e=>e.location));
 for(const e of entries)if(e.op.temp){const occupant=vault.getAbstractFileByPath(e.op.source);if(occupant&&!moving.has(e.op.source))throw Error('Recovery destination is occupied: '+e.op.source);}
 return {root,file,text,journal,entries};
}
async function recover(plugin,inspection){
 const latest=await inspectRecovery(plugin,inspection.root);
 if(latest.text!==inspection.text)throw Error('Journal changed; reopen recovery.');
 const vault=plugin.app.vault;
 if(latest.journal.status==='complete'){await vault.delete(latest.file);return;}
 // Keep the original journal until every original path/content has been restored.
 // The recovery staging paths are persisted before moving any file.
 const recoveryId=id();
 const moved=latest.entries.filter(e=>e.op.temp&&e.file);
 const journal={...latest.journal,recoveryPhase:'staging',recovery:moved.map((e,i)=>({source:e.op.source,location:e.location,temp:latest.root+'/Writing System Recovery '+recoveryId+'/'+i}))};
 await vault.modify(latest.file,JSON.stringify(journal));
 for(let i=0;i<moved.length;i++){const e=moved[i],temp=journal.recovery[i].temp;await ensureFolder(plugin,temp.split('/').slice(0,-1).join('/'));await vault.rename(e.file,temp);}
 journal.recoveryPhase='restoring';await vault.modify(latest.file,JSON.stringify(journal));
 for(const e of latest.entries.filter(e=>!e.op.source&&e.file))await vault.delete(e.file);
 for(const e of moved){await ensureFolder(plugin,e.op.source.split('/').slice(0,-1).join('/'));await vault.rename(e.file,e.op.source);}
 for(const e of latest.entries)if(e.op.source&&e.op.before!==undefined){if(e.file)await vault.modify(e.file,e.op.before);else if(e.op.trash){await ensureFolder(plugin,e.op.source.split('/').slice(0,-1).join('/'));await vault.create(e.op.source,e.op.before);}}
 await vault.delete(latest.file);
 const folders=vault.getAllLoadedFiles().filter(f=>f.children&&f.path.startsWith(latest.root+'/')&&/\/Writing System (?:Staging|Recovery|Deleted) /.test(f.path)).sort((a,b)=>b.path.length-a.path.length);
 for(const folder of folders)if(!folder.children.length)await vault.delete(folder);
}
module.exports={inspectRecovery,recover};
