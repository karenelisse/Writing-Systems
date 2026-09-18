const {fixture}=require('./fixture');
const test=require('node:test'),assert=require('node:assert/strict');
const {id,parseMaster,renderMaster,layout,parseBook,renderBook}=require('../lib/project');
const {parseRows,renderRows,START,END}=require('../lib/dashboard');
const {dashboardTemplate,sceneTemplate,manuscriptTemplate,parseWorkingDraft}=require('../lib/templates');
const {buildPlan,readState}=require('../services/reconciliation');
const {execute,validatePlan}=require('../services/transactions');
const {validateProject}=require('../lib/validation');
const root='Writing/Story',dir=root+'/Plot/Book 1';
function setup(){
 const model={version:1,id:id(),partsEnabled:false,partHeadings:true,books:[{id:id(),title:'First',parts:[]},{id:id(),title:'Second',parts:[]}]};
 const row={sceneLink:'[[Scenes/001 - Opening|Opening]]',manuscriptLink:'[[Manuscript/001 - Opening|Opening]]',chapter:'1',sceneStatus:'Planned',manuscriptStatus:'Draft',pov:'',locations:''};
 const text=dashboardTemplate('Book 1','Story').replace(START+'\n\n'+renderRows([]),START+'\n\n'+renderRows([row]));
 const I={bookName:'Book 1',bookNumber:1,title:'Opening',order:100};
 const fx=fixture({[dir+'/Dashboard.md']:text+'\nMy custom notes\n',[root+'/Plot/Book 2/Dashboard.md']:dashboardTemplate('Book 2','Story'),[dir+'/Scenes/001 - Opening.md']:sceneTemplate(I),[dir+'/Manuscript/001 - Opening.md']:manuscriptTemplate(I)+'Precious prose.\n'});
 const project={root,path:root+'/Plot/Master Dashboard.md',text:null,model};return {...fx,project};
}
async function migrate(){const fx=setup();const baseline=structuredClone(fx.project.model);fx.project.model.partsEnabled=true;fx.project.model.books.forEach(b=>b.parts=[{id:id(),name:'Main Story'}]);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project,{baseline,migration:true}));fx.project.text=fx.texts.get(fx.project.path);return fx;}
test('Master roundtrip and duplicate identity rejection',()=>{const {project}=setup();assert.deepEqual(parseMaster(renderMaster(project.model)),project.model);project.model.books[1].id=project.model.books[0].id;assert.throws(()=>renderMaster(project.model),/identity/);});
test('flat rows preserve statuses, chapters and escaped links',()=>{const rows=[{sceneLink:'[[Scenes/Test|Test]]',manuscriptLink:'[[Manuscript/Test|Test]]',chapter:'4',pov:'[[A]]',locations:'[[B]]',sceneStatus:'Drafted',manuscriptStatus:'Draft'}];assert.deepEqual(parseRows(START+'\n'+renderRows(rows)+'\n'+END),rows);});
test('migration preserves prose and custom Dashboard content; numbering starts inside Part',async()=>{const fx=await migrate();assert.match(fx.texts.get(dir+'/Manuscript/Part 1/001 - Opening.md'),/Precious prose/);assert.match(fx.texts.get(dir+'/Dashboard.md'),/My custom notes/);const parsed=parseBook(fx.texts.get(dir+'/Dashboard.md'),true);assert.equal(parsed.rows.length,1);assert.match(parsed.rows[0].id,/^[a-f0-9]{32}$/);assert.equal((await readState(fx.plugin,root)).model.partsEnabled,true);});
test('incomplete existing pairs block migration without writes',async()=>{const fx=setup();const f=fx.vault.getAbstractFileByPath(dir+'/Manuscript/001 - Opening.md');await fx.vault.delete(f);const before=fx.writes;await assert.rejects(buildPlan(fx.plugin,fx.project),/Incomplete/);assert.equal(fx.writes,before);});
test('Part move preserves identity, moves pair and renumbers globally',async()=>{const fx=await migrate();const part=fx.project.model.books[0].parts.pop();fx.project.model.books[1].parts.push(part);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const target=root+'/Plot/Book 2/Manuscript/Part 2/001 - Opening.md';assert.match(fx.texts.get(target),/Precious prose/);assert.equal((await readState(fx.plugin,root)).scenes[0].partId,part.id);assert.equal(parseBook(fx.texts.get(dir+'/Dashboard.md'),true).rows.length,0);});
test('Scene move appends within same Book and preserves pair identity',async()=>{const fx=await migrate();fx.project.model.books[0].parts.push({id:id(),name:'Later'});await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const state=await readState(fx.plugin,root);const dest=fx.project.model.books[0].parts[1];await execute(fx.plugin,await buildPlan(fx.plugin,fx.project,{sceneMove:{id:state.scenes[0].id,partId:dest.id}}));assert.match(fx.texts.get(dir+'/Manuscript/Part 2/001 - Opening.md'),/Precious prose/);});
test('individual Scene moves across Books with its pair and clears chapter',async()=>{
 const fx=await migrate();const previous=(await readState(fx.plugin,root)).scenes[0];const dest=fx.project.model.books[1];
 await execute(fx.plugin,await buildPlan(fx.plugin,fx.project,{sceneMove:{id:previous.id,partId:dest.parts[0].id}}));
 const moved=(await readState(fx.plugin,root)).scenes[0];assert.equal(moved.id,previous.id);assert.equal(moved.bookId,dest.id);
 assert.match(fx.texts.get(moved.manuscriptPath),/Precious prose/);assert.ok(!fx.texts.has(previous.scenePath));assert.ok(!fx.texts.has(previous.manuscriptPath));
 assert.equal(parseBook(fx.texts.get(dir+'/Dashboard.md'),true).rows.length,0);
 const rows=parseBook(fx.texts.get(root+'/Plot/Book 2/Dashboard.md'),true).rows;assert.equal(rows.length,1);assert.equal(rows[0].chapter,'');
 assert.ok((await validateProject(fx.plugin,root)).every(item=>item.ok));
});
test('case-insensitive destinations and file-blocked folders rejected',()=>{const fx=fixture({'Writing/Story/file':'keep'});assert.throws(()=>validatePlan(fx.plugin,{files:[{target:'Writing/Story/A.md'},{target:'Writing/Story/a.md'}]}),/Duplicate destination/);assert.throws(()=>validatePlan(fx.plugin,{files:[{target:'Writing/Story/file/a.md'}]}),/blocks folder/);});
test('failed moves roll back original contents and paths',async()=>{const fx=await migrate();const before=new Map(fx.texts);const part=fx.project.model.books[0].parts.pop();fx.project.model.books[1].parts.push(part);const plan=await buildPlan(fx.plugin,fx.project);fx.failNext(8);await assert.rejects(execute(fx.plugin,plan),/Injected/);assert.deepEqual(fx.texts,before);});
test('validation is read-only',async()=>{const fx=await migrate();const before=fx.writes;const lines=await validateProject(fx.plugin,root);assert.equal(fx.writes,before);assert.ok(lines.every(x=>x.ok),JSON.stringify(lines));});
test('Working Draft markers protect literal chapter headings in prose',()=>{const scene=id();const sections=parseWorkingDraft(`# Part 1 — Start\n<!-- WRITING-SYSTEM:DRAFT-SCENE:${scene} -->\n### [[Manuscript/Part 1/001 - A|A]]\n\n# Chapter in prose\nWords\n<!-- WRITING-SYSTEM:DRAFT-END -->\n# Part 2 — End`);assert.equal(sections.length,1);assert.equal(sections[0].id,scene);assert.equal(sections[0].prose,'# Chapter in prose\nWords');});
test('flat compatibility retains flat paths and prose',async()=>{const fx=setup();await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));assert.match(fx.texts.get(dir+'/Manuscript/001 - Opening.md'),/Precious prose/);assert.ok(![...fx.texts.keys()].some(p=>p.includes('/Part ')));});
test('new Dashboard rows create both files beside existing identified rows',async()=>{
 const fx=await migrate();const book=layout(fx.project.model,root)[0];const text=fx.texts.get(dir+'/Dashboard.md');const parsed=parseBook(text,true);
 parsed.rows.push({partId:book.parts[0].id,sceneLink:'[[Scenes/Part 1/New Scene|New Scene]]',manuscriptLink:'[[Manuscript/Part 1/New Scene|New Scene]]',pov:'',locations:'',chapter:'',sceneStatus:'Planned',manuscriptStatus:'Not Started'});
 await fx.vault.modify(fx.vault.getAbstractFileByPath(dir+'/Dashboard.md'),renderBook(text,parsed.rows,book,true));
 await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));
 assert.ok(fx.texts.has(dir+'/Scenes/Part 1/002 - New Scene.md'));assert.ok(fx.texts.has(dir+'/Manuscript/Part 1/002 - New Scene.md'));
});
test('Book swaps preserve correct pair links and user files',async()=>{
 const fx=await migrate();await fx.vault.create(root+'/Plot/Book 2/Notes.md','My second Book notes.');fx.project.model.books.reverse();await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));
 const target=root+'/Plot/Book 2/Manuscript/Part 2/001 - Opening.md';const scene=root+'/Plot/Book 2/Scenes/Part 2/001 - Opening.md';
 assert.match(fx.texts.get(target),/Precious prose/);assert.ok(fx.texts.get(target).includes(scene.replace('.md','')));assert.ok(fx.texts.get(scene).includes(target.replace('.md','')));assert.equal(fx.texts.get(root+'/Plot/Book 1/Notes.md'),'My second Book notes.');
 assert.ok((await validateProject(fx.plugin,root)).every(x=>x.ok));
});
test('custom Part notes travel with the complete Part',async()=>{
 const fx=await migrate();const f=fx.vault.getAbstractFileByPath(dir+'/Dashboard.md');await fx.vault.modify(f,fx.texts.get(f.path).replace('## Part 1 — Main Story','## Part 1 — Main Story\n\nNotes attached to this Part.'));
 const part=fx.project.model.books[0].parts.pop();fx.project.model.books[1].parts.push(part);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));
 assert.match(fx.texts.get(root+'/Plot/Book 2/Dashboard.md'),/Notes attached to this Part/);assert.doesNotMatch(fx.texts.get(dir+'/Dashboard.md'),/Notes attached to this Part/);
});
test('migration rejects unlisted pairs without modifying files',async()=>{
 const fx=setup();await fx.vault.create(dir+'/Scenes/Hidden.md','notes');await fx.vault.create(dir+'/Manuscript/Hidden.md','prose');const writes=fx.writes;
 await assert.rejects(buildPlan(fx.plugin,fx.project),/Unlisted/);assert.equal(fx.writes,writes);
});
test('preflight refuses stale previews after project files are added',async()=>{
 const fx=await migrate();const plan=await buildPlan(fx.plugin,fx.project);await fx.vault.create(dir+'/New note.md','keep me');const writes=fx.writes;await assert.rejects(execute(fx.plugin,plan),/changed since planning/);assert.equal(fx.writes,writes);
});
test('Part compilation and Working Draft preserve boundaries and nested paths',async()=>{
 const fx=await migrate();await require('../commands/compile').compile(fx.plugin,false);const compiled=fx.texts.get(dir+'/Compiled/Story.md');assert.match(compiled,/# Part 1 — Main Story/);assert.match(compiled,/# Chapter 1/);assert.match(compiled,/Precious prose/);assert.ok(fx.texts.has(dir+'/Compiled/Chapters/Chapter 1.md'));
 await require('../commands/compile').compileWorkingDraft(fx.plugin);const draft=fx.texts.get(dir+'/Compiled/Story - Working Draft.md');assert.match(draft,/# Part 1 — Main Story/);const sections=parseWorkingDraft(draft);assert.equal(sections.length,1);assert.equal(sections[0].prose,'Precious prose.');assert.match(sections[0].path,/Manuscript\/Part 1/);
});
test('Part heading option applies to both compilation modes',async()=>{
 const fx=await migrate();fx.project.model.partHeadings=false;await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));await require('../commands/compile').compile(fx.plugin,false);await require('../commands/compile').compileWorkingDraft(fx.plugin);assert.doesNotMatch(fx.texts.get(dir+'/Compiled/Story.md'),/# Part /);assert.doesNotMatch(fx.texts.get(dir+'/Compiled/Story - Working Draft.md'),/# Part /);
});
test('a chapter cannot span Parts',async()=>{
 const fx=await migrate();fx.project.model.books[0].parts.push({id:id(),name:'Second'});await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const book=layout(fx.project.model,root)[0];const rows=parseBook(fx.texts.get(dir+'/Dashboard.md'),true).rows;rows.push({partId:book.parts[1].id,sceneLink:'[[Scenes/Part 2/Other|Other]]',manuscriptLink:'[[Manuscript/Part 2/Other|Other]]',chapter:'1'});await assert.rejects(buildPlan(fx.plugin,fx.project,{rows:new Map([[book.id,rows]])}),/cannot span Parts/);
});
test('incoming links and edited Working Draft prose survive Part moves',async()=>{
 const fx=await migrate();await require('../commands/compile').compileWorkingDraft(fx.plugin);const draft=fx.vault.getAbstractFileByPath(dir+'/Compiled/Story - Working Draft.md');await fx.vault.modify(draft,fx.texts.get(draft.path).replace('Precious prose.','Unsynced changes.'));const old=dir+'/Manuscript/Part 1/001 - Opening';await fx.vault.create('Outside.md','[['+old+'|Read]]');const part=fx.project.model.books[0].parts.pop();fx.project.model.books[1].parts.push(part);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));assert.match(fx.texts.get('Outside.md'),/Book 2\/Manuscript\/Part 2/);assert.match(fx.texts.get(draft.path),/Unsynced changes/);assert.match(fx.texts.get(draft.path),/Book 2\/Manuscript\/Part 2/);
});
test('recover an interrupted staging operation without losing prose',async()=>{
 const fx=fixture({[root+'/a.md']:'original'});const temp=root+'/Writing System Staging test/0';await fx.vault.createFolder(root+'/Writing System Staging test');await fx.vault.rename(fx.vault.getAbstractFileByPath(root+'/a.md'),temp);
 await fx.vault.create(root+'/Writing System Operation.json',JSON.stringify({root,status:'running',phase:'staging',files:[{source:root+'/a.md',target:root+'/b.md',temp,before:'original',after:'updated'}]}));
 const recovery=require('../services/recovery');await recovery.recover(fx.plugin,await recovery.inspectRecovery(fx.plugin,root));assert.equal(fx.texts.get(root+'/a.md'),'original');assert.ok(!fx.texts.has(root+'/Writing System Operation.json'));
});
test('malformed table rows cannot silently discard scenes',()=>{assert.throws(()=>parseRows(START+'\n| # | Scene | Manuscript | POV | Location(s) | Chapter |\n| --- | --- | --- | --- | --- | --- |\n| broken |\n'+END),/Malformed/);});
test('managed flat projects can Apply repeatedly without changing identity',async()=>{
 const fx=setup();await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const first=await readState(fx.plugin,root);fx.project.text=fx.texts.get(fx.project.path);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const second=await readState(fx.plugin,root);assert.deepEqual(second,first);assert.match(fx.texts.get(dir+'/Manuscript/001 - Opening.md'),/Precious prose/);
});
test('managed flat projects migrate explicitly while retaining scene identity',async()=>{
 const fx=setup();await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const first=await readState(fx.plugin,root);fx.project.text=fx.texts.get(fx.project.path);const baseline=structuredClone(fx.project.model);fx.project.model.partsEnabled=true;fx.project.model.books.forEach(b=>b.parts=[{id:id(),name:'Start'}]);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project,{baseline,migration:true}));const state=await readState(fx.plugin,root);assert.equal(state.scenes[0].id,first.scenes[0].id);assert.match(fx.texts.get(dir+'/Manuscript/Part 1/001 - Opening.md'),/Precious prose/);
});
async function duplicateSceneFixture(){const fx=await migrate();const book=layout(fx.project.model,root)[0];const rows=parseBook(fx.texts.get(dir+'/Dashboard.md'),true).rows;rows.push({...rows[0],id:'',chapter:'',sceneLink:'[[Scenes/Part 1/002 - Opening|Opening]]',manuscriptLink:'[[Manuscript/Part 1/002 - Opening|Opening]]'});await execute(fx.plugin,await buildPlan(fx.plugin,fx.project,{rows:new Map([[book.id,rows]])}));const second=fx.vault.getAbstractFileByPath(dir+'/Manuscript/Part 1/002 - Opening.md');await fx.vault.modify(second,fx.texts.get(second.path)+'Surviving scene prose.\n');return fx;}
async function deletionPlan(fx){const book=layout(fx.project.model,root)[0];const rows=parseBook(fx.texts.get(dir+'/Dashboard.md'),true).rows;return buildPlan(fx.plugin,fx.project,{rows:new Map([[book.id,rows.slice(1)]]),deleteId:rows[0].id});}
test('deleting a Scene safely allows a surviving Scene to reuse its filename',async()=>{
 const fx=await duplicateSceneFixture();const state=await readState(fx.plugin,root);await execute(fx.plugin,await deletionPlan(fx));assert.match(fx.texts.get(dir+'/Manuscript/Part 1/001 - Opening.md'),/Surviving scene prose/);const next=await readState(fx.plugin,root);assert.equal(next.scenes.length,1);assert.equal(next.scenes[0].id,state.scenes[1].id);
});
test('failure after trashing a pair restores both originals and Dashboard',async()=>{
 const fx=await duplicateSceneFixture();const before=new Map(fx.texts);const plan=await deletionPlan(fx);const originalTrash=fx.vault.trash;let trashed=0;fx.vault.trash=async file=>{await originalTrash(file);trashed++;if(trashed===1)fx.failNext();};await assert.rejects(execute(fx.plugin,plan),/Injected/);assert.deepEqual(fx.texts,before);
});
test('recovery restores a trashed original even when its path is reused',async()=>{
 const source=root+'/a.md',other=root+'/b.md',temp=root+'/Writing System Staging test/0';
 const fx=fixture({[source]:'survivor',[root+'/Writing System Operation.json']:JSON.stringify({root,status:'running',phase:'writing',files:[{source:other,target:source,temp,before:'survivor',after:'survivor'},{source,target:root+'/Writing System Deleted test/a.md',temp:root+'/Writing System Staging test/1',before:'deleted prose',trash:true}]})});
 const service=require('../services/recovery');await service.recover(fx.plugin,await service.inspectRecovery(fx.plugin,root));assert.equal(fx.texts.get(source),'deleted prose');assert.equal(fx.texts.get(other),'survivor');
});
test('recovery can resume after recovery itself is interrupted',async()=>{
 const source=root+'/a.md',temp=root+'/Writing System Staging test/0';const fx=fixture({[temp]:'original',[root+'/Writing System Operation.json']:JSON.stringify({root,status:'running',phase:'writing',files:[{source,target:root+'/b.md',temp,before:'original',after:'changed'}]})});const service=require('../services/recovery');const inspected=await service.inspectRecovery(fx.plugin,root);fx.failNext(4);await assert.rejects(service.recover(fx.plugin,inspected),/Injected/);fx.resetFailure();await service.recover(fx.plugin,await service.inspectRecovery(fx.plugin,root));assert.equal(fx.texts.get(source),'original');
});
test('legacy project validation reports missing files without creating a Master',async()=>{
 const fx=setup();await fx.vault.delete(fx.vault.getAbstractFileByPath(dir+'/Manuscript/001 - Opening.md'));const before=fx.writes;const lines=await validateProject(fx.plugin,root);assert.ok(lines.some(x=>/Missing paired/.test(x.text)));assert.equal(fx.writes,before);assert.ok(!fx.texts.has(fx.project.path));
});
test('a stale Master captured by a command cannot overwrite newer edits',async()=>{
 const fx=await migrate();const captured=fx.texts.get(fx.project.path);await fx.vault.modify(fx.vault.getAbstractFileByPath(fx.project.path),captured+'\nNew personal note\n');const writes=fx.writes;await assert.rejects(buildPlan(fx.plugin,{...fx.project,expectedMasterText:captured}),/Master Dashboard changed/);assert.equal(fx.writes,writes);
});
test('missing applied identity state cannot silently recreate missing Scenes',async()=>{
 const fx=await migrate();await fx.vault.delete(fx.vault.getAbstractFileByPath(root+'/Plot/Writing System State.json'));await assert.rejects(buildPlan(fx.plugin,fx.project),/identity records/);
});
test('moving a complete Part includes attachments and empty nested folders',async()=>{
 const fx=await migrate();await fx.vault.createFolder(dir+'/Scenes/Part 1/Attachments');await fx.vault.create(dir+'/Scenes/Part 1/Attachments/photo.png','binary-data');await fx.vault.createFolder(dir+'/Scenes/Part 1/Empty');const part=fx.project.model.books[0].parts.pop();fx.project.model.books[1].parts.push(part);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const dest=root+'/Plot/Book 2/Scenes/Part 2';assert.equal(fx.texts.get(dest+'/Attachments/photo.png'),'binary-data');assert.ok(fx.entries.has(dest+'/Empty'));assert.ok(!fx.entries.has(dir+'/Scenes/Part 1'));
});
test('Working Draft sync updates selected nested manuscript and rejects concurrent edits',async()=>{
 const fx=await migrate();await require('../commands/compile').compileWorkingDraft(fx.plugin);const draft=fx.vault.getAbstractFileByPath(dir+'/Compiled/Story - Working Draft.md');await fx.vault.modify(draft,fx.texts.get(draft.path).replace('Precious prose.','Draft edits.'));fx.plugin.app.workspace.getActiveFile=()=>draft;
 const {WorkingDraftSyncModal}=require('../modals/working-draft');const original=WorkingDraftSyncModal.prototype.open;let modal;WorkingDraftSyncModal.prototype.open=function(){modal=this;};
 try{
  await require('../commands/working-draft').workingDraftToManuscript(fx.plugin);assert.equal(modal.changes.length,1);await modal.onUpdate(modal.changes);assert.match(fx.texts.get(dir+'/Manuscript/Part 1/001 - Opening.md'),/Draft edits/);
  await fx.vault.modify(draft,fx.texts.get(draft.path).replace('Draft edits.','Second draft edits.'));await require('../commands/working-draft').workingDraftToManuscript(fx.plugin);const manuscript=fx.vault.getAbstractFileByPath(dir+'/Manuscript/Part 1/001 - Opening.md');await fx.vault.modify(manuscript,fx.texts.get(manuscript.path)+'Concurrent edit.');await modal.onUpdate(modal.changes);assert.match(fx.texts.get(manuscript.path),/Concurrent edit/);assert.doesNotMatch(fx.texts.get(manuscript.path),/Second draft edits/);
 }finally{WorkingDraftSyncModal.prototype.open=original;}
});
test('initial Master creation records Book identity before any reordering',async()=>{
 const fx=setup();await require('../commands/parts').openMaster(fx.plugin);const initial=await readState(fx.plugin,root);assert.equal(initial.pendingInitialization,true);const project=await require('../services/project').readProject(fx.plugin,root);project.model.books.reverse();await execute(fx.plugin,await buildPlan(fx.plugin,project));const next=await readState(fx.plugin,root);assert.equal(next.scenes[0].bookId,initial.scenes[0].bookId);assert.match(fx.texts.get(root+'/Plot/Book 2/Manuscript/001 - Opening.md'),/Precious prose/);
});
test('completing an existing managed project adds Books through the Master',async()=>{
 const fx=await migrate();const {ProjectModal}=require('../modals/project');const original=ProjectModal.prototype.open;let modal;ProjectModal.prototype.open=function(){modal=this;};try{require('../commands/project').newProject(fx.plugin);await modal.cb({name:'Story',books:3,optional:[],custom:'',parts:false});const state=await readState(fx.plugin,root);assert.equal(state.model.books.length,3);assert.equal(state.model.partsEnabled,true);assert.ok(fx.entries.has(root+'/Plot/Book 3/Scenes/Part 3'));}finally{ProjectModal.prototype.open=original;}
});
test('custom Part notes and unknown frontmatter links follow a moved Scene',async()=>{
 const fx=await migrate();const old=dir+'/Scenes/Part 1/001 - Opening';const dashboard=fx.vault.getAbstractFileByPath(dir+'/Dashboard.md');await fx.vault.modify(dashboard,fx.texts.get(dashboard.path).replace('## Part 1 — Main Story','## Part 1 — Main Story\n\nReference: [['+old+'|Opening]]'));
 const manuscript=fx.vault.getAbstractFileByPath(dir+'/Manuscript/Part 1/001 - Opening.md');await fx.vault.modify(manuscript,require('../services/project').updateFrontmatter(fx.texts.get(manuscript.path),{custom_reference:'[['+old+']]'}));
 const part=fx.project.model.books[0].parts.pop();fx.project.model.books[1].parts.push(part);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));const target=root+'/Plot/Book 2';assert.match(fx.texts.get(target+'/Dashboard.md'),/Reference: \[\[Writing\/Story\/Plot\/Book 2\/Scenes\/Part 2/);assert.match(require('../services/project').frontmatter(fx.texts.get(target+'/Manuscript/Part 2/001 - Opening.md')).custom_reference,/Book 2\/Scenes\/Part 2/);
});
test('incoming escaped table links and Markdown anchors survive renumbering',async()=>{
 const fx=await migrate();const old=dir+'/Scenes/Part 1/001 - Opening';await fx.vault.create('References.md','| [['+old+'\\|Opening]] |\n[Opening]('+old.replace(/ /g,'%20')+'.md#Purpose)');const part=fx.project.model.books[0].parts.pop();fx.project.model.books[1].parts.push(part);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));assert.match(fx.texts.get('References.md'),/Book 2\/Scenes\/Part 2/);assert.match(fx.texts.get('References.md'),/Book%202\/Scenes\/Part%202\/001%20-%20Opening\.md#Purpose/);
});
test('preflight rejects a planned file occupying a planned folder',()=>{
 const fx=fixture();assert.throws(()=>validatePlan(fx.plugin,{files:[{target:'Writing/Story/Spark.md'}],folders:['Writing/Story/Spark.md']}),/Planned file blocks folder/);assert.throws(()=>validatePlan(fx.plugin,{files:[{target:'Writing/Story/a'},{target:'Writing/Story/a/note.md'}]}),/Planned file blocks folder/);
});
test('missing table headers cannot silently drop the first Scene rows',()=>{
 assert.throws(()=>parseRows(START+'\n| 1 | [[A]] | [[B]] | | | |\n| 2 | [[C]] | [[D]] | | | |\n'+END),/header/);
});

test('clean Working Draft metadata follows Book renumbering and blocks cross-Book Scene sync',async()=>{
 const fx=await migrate();await require('../commands/compile').compileWorkingDraft(fx.plugin);
 const tools=require('../lib/working-draft');let draft=dir+'/Compiled/Story - Working Draft.md';
 assert.doesNotMatch(fx.texts.get(draft),/<!-- WRITING-SYSTEM:/);
 fx.project.model.books.reverse();await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));
 draft=root+'/Plot/Book 2/Compiled/Story - Working Draft.md';
 const m=JSON.parse(fx.texts.get(tools.metadataPath(draft)));assert.equal(m.draftPath,draft);
 assert.match(m.sections[0].path,/Book 2/);assert.equal(tools.parseMappedDraft(fx.texts.get(draft),m,root+'/Plot/Book 2')[0].prose,'Precious prose.');
 const part=fx.project.model.books[1].parts.pop();fx.project.model.books[0].parts.push(part);await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));
 fx.plugin.app.workspace.getActiveFile=()=>fx.vault.getAbstractFileByPath(draft);
 await assert.rejects(require('../commands/working-draft').workingDraftToManuscript(fx.plugin),/another Book/);
});

test('Move Scene from an open Scene offers all destination Parts without Book picker',async t=>{
 const fx=await migrate(),state=await readState(fx.plugin,root);const original= require('./fixture').obsidian.Modal.prototype.open;const opened=[];
 require('./fixture').obsidian.Modal.prototype.open=function(){opened.push(this);};t.after(()=>{require('./fixture').obsidian.Modal.prototype.open=original;});
 fx.plugin.app.workspace.getActiveFile=()=>fx.vault.getAbstractFileByPath(state.scenes[0].scenePath);
 await require('../commands/parts').moveScene(fx.plugin);assert.equal(opened.length,1);const picker=opened.pop();assert.equal(picker.title,'Destination Part');assert.equal(picker.items.length,1);
 await picker.callback(picker.items[0].value);assert.equal((await readState(fx.plugin,root)).scenes[0].bookId,fx.project.model.books[1].id);
});
test('Move Scene from Dashboard skips empty source Parts and moves after Part selection',async t=>{
 const fx=await migrate();const original=require('./fixture').obsidian.Modal.prototype.open,opened=[];require('./fixture').obsidian.Modal.prototype.open=function(){opened.push(this);};t.after(()=>{require('./fixture').obsidian.Modal.prototype.open=original;});
 await require('../commands/parts').moveScene(fx.plugin);let picker=opened.pop();assert.equal(picker.title,'Choose current Part');assert.equal(picker.items.length,1);
 await picker.callback(picker.items[0].value);picker=opened.pop();assert.equal(picker.title,'Choose Scene to move');assert.equal(picker.items.length,1);
 await picker.callback(picker.items[0].value);picker=opened.pop();assert.equal(picker.title,'Destination Part');await picker.callback(picker.items[0].value);
 assert.equal((await readState(fx.plugin,root)).scenes[0].bookId,fx.project.model.books[1].id);
});
test('cross-Book Scene move failure restores both pairs and Dashboards',async()=>{
 const fx=await migrate();const state=await readState(fx.plugin,root),before=new Map(fx.texts);
 const plan=await buildPlan(fx.plugin,fx.project,{sceneMove:{id:state.scenes[0].id,partId:fx.project.model.books[1].parts[0].id}});
 fx.failNext(8);await assert.rejects(execute(fx.plugin,plan),/Injected/);assert.deepEqual(fx.texts,before);
});
test('Scene move rejects destination outside this project before writes',async()=>{
 const fx=await migrate(),state=await readState(fx.plugin,root),before=fx.writes;
 await assert.rejects(buildPlan(fx.plugin,fx.project,{sceneMove:{id:state.scenes[0].id,partId:id()}}),/Unknown Scene or destination/);assert.equal(fx.writes,before);
});

test('adding a Part to Book 1 removes old Part numbers in both Book 2 folders',async()=>{
 const fx=await migrate();const book2=root+'/Plot/Book 2';
 await fx.vault.create(book2+'/Scenes/Part 2/Notes.txt','keep attachment');
 fx.project.model.books[0].parts.push({id:id(),name:'Inserted'});
 await execute(fx.plugin,await buildPlan(fx.plugin,fx.project));
 for(const folder of ['Scenes','Manuscript']){assert.ok(!fx.entries.has(book2+'/'+folder+'/Part 2'));assert.ok(fx.entries.has(book2+'/'+folder+'/Part 3/Part Identity.json'));}
 assert.equal(fx.texts.get(book2+'/Scenes/Part 3/Notes.txt'),'keep attachment');
 assert.match(fx.texts.get(book2+'/Dashboard.md'),/## Part 3/);assert.doesNotMatch(fx.texts.get(book2+'/Dashboard.md'),/## Part 2/);
});
test('Apply repairs empty obsolete Part folders but refuses nonempty unknown folders',async()=>{
 const fx=await migrate(),stale=root+'/Plot/Book 2/Scenes/Part 99';await fx.vault.createFolder(stale);
 const plan=await buildPlan(fx.plugin,fx.project);assert.ok(plan.obsoleteFolders.includes(stale));assert.ok(!plan.folders.includes(stale));
 await execute(fx.plugin,plan);assert.ok(!fx.entries.has(stale));
 await fx.vault.createFolder(stale);await fx.vault.create(stale+'/Keep.txt','valuable');const before=fx.writes;
 await assert.rejects(buildPlan(fx.plugin,fx.project),/Unrecognized Part folder/);assert.equal(fx.writes,before);assert.equal(fx.texts.get(stale+'/Keep.txt'),'valuable');
});
test('cleanup verifies physical folder contents when cached children are stale',async()=>{
 const fx=await migrate();const stale=root+'/Plot/Book 2/Scenes/Part 2';
 fx.project.model.books[0].parts.push({id:id(),name:'Inserted'});const plan=await buildPlan(fx.plugin,fx.project);
 fx.vault.adapter={list:async path=>({files:[...fx.texts.keys()].filter(p=>p.startsWith(path+'/')),folders:[]})};
 const loaded=fx.vault.getAllLoadedFiles;fx.vault.getAllLoadedFiles=()=>loaded().map(f=>f.path===stale?{...f,children:[{path:'stale cached child'}]}:f);
 const remove=fx.vault.delete;fx.vault.delete=async f=>remove(fx.entries.get(f.path)); // Disk deletion uses actual contents, not the stale listing object.
 await execute(fx.plugin,plan);assert.ok(!fx.entries.has(stale));
});
test('cleanup leaves an obsolete folder containing a newly arrived file intact',async()=>{
 const fx=await migrate(),stale=root+'/Plot/Book 2/Scenes/Part 99';await fx.vault.createFolder(stale);const plan=await buildPlan(fx.plugin,fx.project);
 const modify=fx.vault.modify;fx.vault.modify=async(f,text)=>{await modify(f,text);if(f.path===root+'/Writing System Operation.json'&&JSON.parse(text).status==='complete')await fx.vault.create(stale+'/New.txt','keep');};
 await execute(fx.plugin,plan);assert.equal(fx.texts.get(stale+'/New.txt'),'keep');
});
