const { Notice }=require('obsidian');
const { readProject,rootFromPath }=require('../services/project');
const { layout,parseBook,id }=require('../lib/project');
const { buildPlan }=require('../services/reconciliation');
const { execute }=require('../services/transactions');
const { requireApplied,guarded }=require('./parts');
const { SceneModal }=require('../modals/scene');
const { ReorderModal }=require('../modals/reorder');
const { DeleteSceneModal }=require('../modals/delete-scene');
const { Choices }=require('../modals/parts');
const { cleanTitle,extractLinks }=require('../lib/dashboard');
async function get(plugin,d){const p=await readProject(plugin,rootFromPath(d.path));if(!p)return null;await requireApplied(plugin,p);const book=layout(p.model,p.root).find(b=>b.dir+'/Dashboard.md'===d.path);if(!book)throw Error('Book is not in the Master Dashboard.');const text=await plugin.app.vault.read(d);return {p,book,text,rows:parseBook(text,p.model.partsEnabled).rows};}
async function create(plugin,d,options={}){
 const ctx=await get(plugin,d);if(!ctx)return false;
 const {p,book,rows}=ctx;
 const active=Object.prototype.hasOwnProperty.call(options,'activeFile')?options.activeFile:plugin.app.workspace.getActiveFile();
 if(p.model.partsEnabled&&!book.parts.length)throw Error('Create a Part in this Book first.');
 let selectedPart;
 const nested=active?.path.startsWith(book.dir+'/')&&active.path.slice(book.dir.length+1).match(/^(?:Scenes|Manuscript)\/Part (\d+)\//);
 if(nested){selectedPart=book.parts.find(part=>part.number===Number(nested[1]));if(p.model.partsEnabled&&!selectedPart)throw Error('The active Part is not in the applied Master Dashboard.');}
 if(!selectedPart&&active?.path===d.path){
  const editor=plugin.app.workspace.activeEditor?.editor;
  if(editor){
   const preceding=editor.getValue().split(/\r?\n/).slice(0,editor.getCursor().line+1).join('\n');
   const sections=[...preceding.matchAll(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/g)];
   if(sections.length)selectedPart=book.parts.find(part=>part.id===sections[sections.length-1][1]);
  }
 }
 new SceneModal(plugin.app,guarded(async v=>{
  if(await plugin.app.vault.read(d)!==ctx.text)throw Error('Dashboard changed; reopen New Scene.');
  const title=cleanTitle(v.title);if(!title)throw Error('Title is required.');
  const part=p.model.partsEnabled?book.parts.find(candidate=>candidate.id===v.partId):null;
  if(p.model.partsEnabled&&!part)throw Error('Select a Part for this Scene.');
  const suffix=part?'/Part '+part.number:'';
  const row={id:id(),partId:part?.id,sceneLink:'[['+book.dir+'/Scenes'+suffix+'/'+title+'|'+title+']]',manuscriptLink:'[['+book.dir+'/Manuscript'+suffix+'/'+title+'|'+title+']]',sceneStatus:v.sceneStatus,manuscriptStatus:v.manuscriptStatus,pov:v.pov,locations:extractLinks(v.locations).join(', '),chapter:v.chapter};
  if(rows.some(r=>r.partId===row.partId&&require('../lib/dashboard').stripOrderPrefix(require('../lib/dashboard').parseWiki(r.sceneLink).label)===title))throw Error('That title already exists in this Part.');
  const input=rows.concat(row);await execute(plugin,await buildPlan(plugin,p,{rows:new Map([[book.id,input]])}));new Notice('Scene pair created.');
 }),{parts:p.model.partsEnabled?book.parts:[],selectedPartId:selectedPart?.id}).open();
 return true;
}
async function reorder(plugin,d){
 const ctx=await get(plugin,d);if(!ctx)return false;
 const {p,book,rows}=ctx;
 const start=part=>new ReorderModal(plugin.app,part?rows.filter(r=>r.partId===part.id):rows,guarded(async ordered=>{
  if(await plugin.app.vault.read(d)!==ctx.text)throw Error('Dashboard changed; reopen Reorder Scenes.');
  const input=part?rows.filter(r=>r.partId!==part.id).concat(ordered):ordered;
  await execute(plugin,await buildPlan(plugin,p,{rows:new Map([[book.id,input]])}));new Notice('Scene order saved.');
 })).open();
 if(p.model.partsEnabled)new Choices(plugin.app,'Reorder Scenes in Part',book.parts.map(part=>({label:`Part ${part.number} — ${part.name}`,value:part})),start).open();else start(null);
 return true;
}
async function remove(plugin,d){
 const ctx=await get(plugin,d);if(!ctx)return false;
 new DeleteSceneModal(plugin.app,ctx.rows,guarded(async index=>{
  if(await plugin.app.vault.read(d)!==ctx.text)throw Error('Dashboard changed; reopen Delete Scene.');
  const row=ctx.rows[index];
  const input=ctx.rows.filter((r,i)=>i!==index);
  const state=await require('../services/reconciliation').readState(plugin,ctx.p.root);
  const scene=state.scenes.find(s=>s.id===row.id||s.scenePath===require('../lib/dashboard').linkedFilePath(ctx.book.dir,row.sceneLink,'Scenes',''));
  if(!scene)throw Error('Apply Dashboard before deleting this Scene.');
  const plan=await buildPlan(plugin,ctx.p,{rows:new Map([[ctx.book.id,input]]),deleteId:scene.id});await execute(plugin,plan);new Notice('Scene pair moved to vault .trash.');
 })).open();return true;
}
module.exports={create,reorder,remove};
