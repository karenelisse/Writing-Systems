const { TFile } = require('obsidian');
const { readProject, rootFromPath, frontmatter } = require('../services/project');
const { readState, buildPlan } = require('../services/reconciliation');
const { layout, parseBook } = require('./project');
const { linkedFilePath, parseWiki, stripOrderPrefix } = require('./dashboard');
async function validateProject(plugin,root) {
 const issues=[];const report=(text)=>issues.push({ok:false,text});const p=await readProject(plugin,root);
 if(plugin.app.vault.getAbstractFileByPath(root+'/Writing System Operation.json'))report('An interrupted transaction requires recovery.');
 if(!p){
  const dashboards=plugin.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(root+'/Plot/')&&/\/Book \d+\/Dashboard\.md$/.test(f.path));
  const referenced=new Set();
  for(const dashboard of dashboards){
   const dir=dashboard.path.slice(0,-'/Dashboard.md'.length);
   let rows;try{rows=require('./dashboard').parseRows(await plugin.app.vault.read(dashboard));}catch(e){report(dashboard.path+': '+e.message);continue;}
   for(const row of rows){
    const title=stripOrderPrefix(parseWiki(row.sceneLink).label);
    for(const [folder,link] of [['Scenes',row.sceneLink],['Manuscript',row.manuscriptLink]]){
     const path=linkedFilePath(dir,link,folder,title);
     if(!path.startsWith(dir+'/'+folder+'/')||path.split('/').includes('..')){report('Unsafe pair path: '+path);continue;}
     if(referenced.has(path.toLowerCase()))report('Duplicate file reference: '+path);
     referenced.add(path.toLowerCase());
     if(!(plugin.app.vault.getAbstractFileByPath(path) instanceof TFile))report('Missing paired file: '+path);
    }
   }
  }
  for(const file of plugin.app.vault.getMarkdownFiles())if(file.path.startsWith(root+'/Plot/')&&/\/(?:Scenes|Manuscript)\//.test(file.path)&&!referenced.has(file.path.toLowerCase()))report('File absent from Dashboard: '+file.path);
  if(!dashboards.length)report('No Book Dashboards found.');
  if(!issues.length)issues.push({ok:true,text:'Legacy flat project validated. Parts remain disabled; no files were changed.'});
  return issues;
 }
 const state=await readState(plugin,root);
 if(!state || state.pendingInitialization)report('Master Dashboard has not been applied.');
 else if(JSON.stringify(state.model)!==JSON.stringify(p.model))report('Master Dashboard has unapplied changes.');
 const model=state?.model||p.model;
 for(const book of layout(model,root)) {
  const f=plugin.app.vault.getAbstractFileByPath(book.dir+'/Dashboard.md');
  if(!(f instanceof TFile)){report('Missing Dashboard: '+book.dir);continue;}
  let parsed;try{parsed=parseBook(await plugin.app.vault.read(f),model.partsEnabled);}catch(e){report(book.dir+': '+e.message);continue;}
  if(model.partsEnabled&&JSON.stringify(parsed.parts)!==JSON.stringify(book.parts.map(p=>p.id)))report('Part section ownership/order mismatch: '+book.dir);
  for(const part of book.parts)for(const folder of ['Scenes','Manuscript']) {
   const path=`${book.dir}/${folder}/Part ${part.number}`;
   const dir=plugin.app.vault.getAbstractFileByPath(path);
   if(!dir?.children)report('Missing Part folder: '+path);
   const marker=plugin.app.vault.getAbstractFileByPath(path+'/Part Identity.json');
   if(!(marker instanceof TFile))report('Missing Part identity: '+path);
   else {try{const value=JSON.parse(await plugin.app.vault.read(marker));if(value.partId!==part.id||value.bookId!==book.id||value.projectId!==model.id)report('Conflicting Part ownership: '+path);}catch(e){report('Invalid Part identity: '+path);}}
  }
  for(const row of parsed.rows) {
   const title=stripOrderPrefix(parseWiki(row.sceneLink).label);
   const sp=linkedFilePath(book.dir,row.sceneLink,'Scenes',title),mp=linkedFilePath(book.dir,row.manuscriptLink,'Manuscript',title);
   for(const [path,pair,type] of [[sp,mp,'scene'],[mp,sp,'manuscript']]) {
    const f=plugin.app.vault.getAbstractFileByPath(path);if(!(f instanceof TFile)){report('Missing paired file: '+path);continue;}
    const fm=frontmatter(await plugin.app.vault.read(f));
    if(fm.writing_project_id!==model.id||fm.writing_book_id!==book.id||(model.partsEnabled&&(fm.writing_part_id!==row.partId||fm.writing_scene_id!==row.id)))report('Frontmatter identity mismatch: '+path);
    const link=fm[type==='scene'?'manuscript':'scene'];if(parseWiki(link).path!==pair.replace(/\.md$/,''))report('Paired link mismatch: '+path);
   }
  }
 }
 try{const plan=await buildPlan(plugin,p);for(const op of plan.files)if(!op.target.endsWith('/Writing System State.json'))report((op.source?'Reconciliation needed: ':'Missing expected file: ')+op.target);}catch(e){report(e.message);}
 if(!issues.length)issues.push({ok:true,text:'Project, Dashboards, Part folders, paired files, links, and frontmatter agree.'});
 return issues;
}
module.exports={validateProject};
