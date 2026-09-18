const { Notice, TFile } = require('obsidian');
const { chooseDashboard } = require('./dashboard');
const { rootFromPath, readProject, discover } = require('../services/project');
const { buildPlan, readState } = require('../services/reconciliation');
const { execute } = require('../services/transactions');
const { id, layout, parseBook, renderMaster } = require('../lib/project');
const { Choices, TextPrompt, Preview } = require('../modals/parts');
const { ReorderModal } = require('../modals/reorder');
async function context(plugin) {
 let root = rootFromPath(plugin.app.workspace.getActiveFile()?.path || '');
 if (!root) { const d = await chooseDashboard(plugin); if (!d) return null; root = rootFromPath(d.path); }
 return await readProject(plugin,root) || await discover(plugin,root);
}
async function safe(action) { try { await action(); } catch(e) { console.error(e); new Notice(e.message); } }
function guarded(fn) { return (...args)=>safe(()=>fn(...args)); }
async function openMaster(plugin) {
 const p=await context(plugin);if(!p)return;
 let f=plugin.app.vault.getAbstractFileByPath(p.path);
 if(!f){
  const scenes=[],checks=[];
  const dashboard=require('../lib/dashboard');
  for(const book of layout(p.model,p.root)){
   const path=book.dir+'/Dashboard.md',file=plugin.app.vault.getAbstractFileByPath(path),content=await plugin.app.vault.read(file);checks.push({path,content});
   for(const row of dashboard.parseRows(content)){
    const title=dashboard.stripOrderPrefix(dashboard.parseWiki(row.sceneLink).label);
    scenes.push({id:id(),bookId:book.id,partId:null,scenePath:require('./dashboard').resolvePairPath(plugin,book.dir,row.sceneLink,'Scenes',title),manuscriptPath:require('./dashboard').resolvePairPath(plugin,book.dir,row.manuscriptLink,'Manuscript',title)});
   }
  }
  const statePath=require('../services/reconciliation').statePath(p.root);
  await execute(plugin,{root:p.root,folders:[],checks,files:[{source:null,target:p.path,after:renderMaster(p.model)},{source:null,target:statePath,after:JSON.stringify({model:p.model,scenes,pendingInitialization:true},null,2)}]});
  f=plugin.app.vault.getAbstractFileByPath(p.path);
 }
 await plugin.app.workspace.getLeaf(false).openFile(f);
}
async function applyMaster(plugin) {const p=await context(plugin);if(!p)return;const plan=await buildPlan(plugin,p);new Preview(plugin.app,'Apply Master Dashboard',plan,guarded(async()=>{await execute(plugin,plan);new Notice('Master Dashboard applied.');})).open();}
async function requireApplied(plugin,p) {
 const state=await readState(plugin,p.root);
 if(!state || state.pendingInitialization || JSON.stringify(state.model)!==JSON.stringify(p.model))throw Error('Apply Master Dashboard before using this command.');
 return state;
}
async function enableParts(plugin) {
 const p=await context(plugin);if(!p)return;if(p.model.partsEnabled)throw Error('Parts are already enabled.');
 new TextPrompt(plugin.app,'Initial Part name for each Book','Main Story',guarded(async name=>{
  const baseline=JSON.parse(JSON.stringify(p.model));
  p.model.partsEnabled=true;
  for(const book of p.model.books)book.parts=[{id:id(),name}];
  const plan=await buildPlan(plugin,p,{baseline,migration:true});
  new Preview(plugin.app,'Enable Parts for entire Project',plan,guarded(async()=>{await execute(plugin,plan);new Notice('Parts enabled for the project.');})).open();
 })).open();
}
async function chooseBook(plugin,p,callback){new Choices(plugin.app,'Choose Book',layout(p.model,p.root).map(b=>({label:`Book ${b.number} — ${b.title}`,value:b})),guarded(callback)).open();}
async function reorderParts(plugin) {
 const p=await context(plugin);if(!p)return;await requireApplied(plugin,p);if(!p.model.partsEnabled)throw Error('Enable Parts first.');
 await chooseBook(plugin,p,book=>{
 new ReorderModal(plugin.app,book.parts.map(part=>({sceneLink:part.name,part})),guarded(async rows=>{
  p.model.books.find(b=>b.id===book.id).parts=rows.map(r=>({id:r.part.id,name:r.part.name}));
  await execute(plugin,await buildPlan(plugin,p));new Notice('Parts reordered.');
 }),'Reorder Parts').open();
 });
}
async function movePart(plugin) {
 const p=await context(plugin);if(!p)return;await requireApplied(plugin,p);if(!p.model.partsEnabled)throw Error('Enable Parts first.');
 const books=layout(p.model,p.root);
 new Choices(plugin.app,'Move Part',books.flatMap(b=>b.parts.map(part=>({label:`Part ${part.number} — ${part.name} (Book ${b.number})`,value:{book:b,part}}))),guarded(async({book,part})=>{
 new Choices(plugin.app,'Destination Book',books.filter(b=>b.id!==book.id).map(b=>({label:`Book ${b.number} — ${b.title}`,value:b})),guarded(async dest=>{
  const source=p.model.books.find(b=>b.id===book.id);source.parts=source.parts.filter(x=>x.id!==part.id);
  p.model.books.find(b=>b.id===dest.id).parts.push({id:part.id,name:part.name});
  const plan=await buildPlan(plugin,p);new Preview(plugin.app,'Move Part to Book',plan,guarded(async()=>{await execute(plugin,plan);new Notice('Part moved.');})).open();
 })).open();
 })).open();
}
async function moveScene(plugin) {
 const active=plugin.app.workspace.getActiveFile();
 let root=rootFromPath(active?.path || '');
 if(!root){
 const roots=[...new Set(plugin.app.vault.getMarkdownFiles().filter(f=>f.path.endsWith('/Master Dashboard.md')).map(f=>rootFromPath(f.path)).filter(Boolean))];
 if(!roots.length)throw Error('Open a file in a project with Parts enabled first.');
 if(roots.length>1){new Choices(plugin.app,'Choose Story',roots.map(value=>({label:value,value})),guarded(value=>start(value))).open();return;}
 root=roots[0];
 }
 await start(root);
 async function start(root){
 const p=await readProject(plugin,root);if(!p || !p.model.partsEnabled)throw Error('Enable Parts for this project first.');
 const state=await requireApplied(plugin,p),books=layout(p.model,p.root);
 const parts=books.flatMap(book=>book.parts.map(part=>({...part,book,label:'Part '+part.number+' - '+part.name+' (Book '+book.number+')'})));
 const destination=guarded(async scene=>{
  const available=parts.filter(part=>part.id!==scene.partId);
  if(!available.length)throw Error('Create another Part in this story before moving a Scene.');
  new Choices(plugin.app,'Destination Part',available.map(part=>({label:part.label,value:part})),guarded(async part=>{
  const plan=await buildPlan(plugin,p,{sceneMove:{id:scene.id,partId:part.id}});
  await execute(plugin,plan);new Notice('Scene and Manuscript moved to the end of '+part.label+'. Chapter assignment cleared.');
  })).open();
 });
 const current=state.scenes.find(scene=>scene.scenePath===active?.path || scene.manuscriptPath===active?.path);
 if(current){await destination(current);return;}
 const populated=parts.filter(part=>state.scenes.some(scene=>scene.partId===part.id));
 if(!populated.length)throw Error('This story has no Scenes to move.');
 new Choices(plugin.app,'Choose current Part',populated.map(part=>({label:part.label,value:part})),guarded(async part=>{
  const scenes=state.scenes.filter(scene=>scene.partId===part.id);
  new Choices(plugin.app,'Choose Scene to move',scenes.map(scene=>({label:scene.scenePath.split('/').pop().replace(/\.md$/i,''),value:scene})),destination).open();
 })).open();
 }
}
async function addPart(plugin) {
 const p=await context(plugin);if(!p)return;await requireApplied(plugin,p);if(!p.model.partsEnabled)throw Error('Enable Parts first.');
 await chooseBook(plugin,p,book=>new TextPrompt(plugin.app,'New Part name','New Part',guarded(async name=>{p.model.books.find(b=>b.id===book.id).parts.push({id:id(),name});await execute(plugin,await buildPlan(plugin,p));new Notice('Part created.');})).open());
}
module.exports={context,requireApplied,guarded,openMaster:guarded(openMaster),applyMaster:guarded(applyMaster),enableParts:guarded(enableParts),reorderParts:guarded(reorderParts),movePart:guarded(movePart),moveScene:guarded(moveScene),addPart:guarded(addPart)};
