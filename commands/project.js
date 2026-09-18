const { Notice } = require('obsidian');
const { ProjectModal } = require('../modals/project');
const { sparkTemplate, dashboardTemplate } = require('../lib/templates');
const { assertPath, id, layout, renderMaster, renderBook } = require('../lib/project');
const { updateFrontmatter } = require('../services/project');
const { execute } = require('../services/transactions');
function newProject(plugin) {
 new ProjectModal(plugin.app,require('./parts').guarded(async v=>{
  if(v.name.includes('/')||v.name.includes('\\'))throw Error('Project name must be a single folder name.');
  const root=assertPath('Writing/'+v.name);
  const existing=!!plugin.app.vault.getAbstractFileByPath(root);
  const managed=existing?await require('../services/project').readProject(plugin,root):null;
  if(existing&&v.parts&&!managed?.model.partsEnabled)throw Error('Use Enable Parts for Project to migrate an existing project.');
  const folders=['Characters','Locations','Plot','Assets','Templates',...v.optional,...String(v.custom).split(',').map(x=>x.trim()).filter(Boolean)].map(f=>assertPath(root+'/'+f));
  if(managed){
   await require('./parts').requireApplied(plugin,managed);
   while(managed.model.books.length<v.books){const number=managed.model.books.length+1;managed.model.books.push({id:id(),title:'Book '+number,parts:managed.model.partsEnabled?[{id:id(),name:'Main Story'}]:[]});}
   const plan=await require('../services/reconciliation').buildPlan(plugin,managed);plan.folders=[...new Set(plan.folders.concat(folders))];await execute(plugin,plan);new Notice('Writing project completed: '+v.name);return;
  }
  const files=[];
  const add=(target,after)=>{if(!plugin.app.vault.getAbstractFileByPath(target))files.push({source:null,target,after});};
  add(root+'/Spark.md',sparkTemplate(v.name));
  const model={version:1,id:id(),partsEnabled:!!v.parts,partHeadings:true,books:Array.from({length:v.books},(_,i)=>({id:id(),title:`Book ${i+1}`,parts:v.parts?[{id:id(),name:'Main Story'}]:[]}))};
  for(const book of layout(model,root)){
   for(const folder of ['Scenes','Manuscript','Compiled'])folders.push(book.dir+'/'+folder);
   let text=dashboardTemplate(`Book ${book.number}`,v.name);
   if(!existing)text=updateFrontmatter(renderBook(text,[],book,model.partsEnabled),{writing_project_id:model.id,writing_book_id:book.id});
   add(book.dir+'/Dashboard.md',text);
   for(const part of book.parts)for(const folder of ['Scenes','Manuscript']){const dir=`${book.dir}/${folder}/Part ${part.number}`;folders.push(dir);add(dir+'/Part Identity.json',JSON.stringify({projectId:model.id,bookId:book.id,partId:part.id}));}
  }
  if(!existing){add(root+'/Plot/Master Dashboard.md',renderMaster(model));add(root+'/Plot/Writing System State.json',JSON.stringify({model,scenes:[]},null,2));}
  await execute(plugin,{root,files,folders,checks:[]});new Notice('Writing project ready: '+v.name);
  await plugin.app.workspace.getLeaf(false).openFile(plugin.app.vault.getAbstractFileByPath(root+'/Spark.md'));
 })).open();
}
module.exports={newProject};
