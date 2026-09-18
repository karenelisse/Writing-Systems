// Explicit, destructive-test entry point; never loaded by npm test.
// Uses only Writing/Test Parts, with a verified backup and byte-for-byte restoration.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,obsidian}=require('./fixture');
const {layout,id,parseBook,renderBook,renderMaster}=require('../lib/project');
const {readProject}=require('../services/project');
const {buildPlan,readState}=require('../services/reconciliation');
const {execute,validatePlan}=require('../services/transactions');
const {validateProject}=require('../lib/validation');
const {stripManuscript,replaceManuscriptProse}=require('../lib/templates');
const root='Writing/Test Parts';
if(process.argv[2]!=='--run')throw Error('Use --run explicitly to exercise the real Test Parts project.');
const vaultDir=path.resolve(__dirname,'../../../..');
const projectDir=path.join(vaultDir,...root.split('/'));
const backup=fs.mkdtempSync(path.join(os.tmpdir(),'writing-system-project-qa-'));
const report={project:projectDir,backup,started:new Date().toISOString(),checks:[],limitations:['Obsidian UI is simulated; the installed bundle and real filesystem are exercised.','Other vault projects and incoming links outside Test Parts are excluded.']};
function snapshot(base){
 const files=new Map(),dirs=new Set();
 function walk(abs,rel){if(!fs.existsSync(abs))return;const st=fs.lstatSync(abs);if(st.isSymbolicLink())throw Error('Refusing symlink: '+abs);if(st.isDirectory()){dirs.add(rel);for(const n of fs.readdirSync(abs))walk(path.join(abs,n),rel+'/'+n);}else files.set(rel,fs.readFileSync(abs));}
 walk(path.join(base,...root.split('/')),root);return {files,dirs};
}
function same(a,b){assert.deepEqual([...a.dirs].sort(),[...b.dirs].sort(),'Folder inventory changed unexpectedly');assert.deepEqual([...a.files.keys()].sort(),[...b.files.keys()].sort(),'File inventory changed unexpectedly');for(const [p,v]of a.files)assert.ok(v.equals(b.files.get(p)),'File changed unexpectedly: '+p);}
const baseline=snapshot(vaultDir);assert.ok(baseline.files.has(root+'/Plot/Master Dashboard.md'),'Existing Test Parts project required');
for(const [p,bytes]of baseline.files){const dest=path.join(backup,'original',...p.split('/'));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({project:projectDir,dirs:[...baseline.dirs],files:[...baseline.files].map(([p,b])=>({path:p,sha256:crypto.createHash('sha256').update(b).digest('hex')}))},null,2));
console.log('Verified backup: '+backup);
for(const [p,bytes]of baseline.files)assert.ok(bytes.equals(fs.readFileSync(path.join(backup,'original',...p.split('/')))));
function diskFixture(base){
 let expected=snapshot(base);const fx=fixture(Object.fromEntries([...expected.files].map(([p,b])=>[p,b.toString('utf8')])));
 let writes=0,failAt=0;
 function abs(p){const out=path.resolve(base,...p.split('/'));const allowed=path.resolve(base,...root.split('/'));assert.ok(out===allowed||out.startsWith(allowed+path.sep),'Write outside Test Parts: '+p);return out;}
 function fresh(){same(expected,snapshot(base));}
 function before(){fresh();writes++;if(writes===failAt)throw Error('Injected disk write failure');}
 function refresh(){
  const current=snapshot(base);const keep=new Set([...current.files.keys(),...current.dirs]);
  for(const p of [...fx.entries.keys()])if(p.startsWith(root)&&!keep.has(p))fx.entries.delete(p);
  for(const p of current.dirs)if(!fx.entries.has(p))fx.entries.set(p,{path:p,children:[]});
  for(const p of current.files.keys())if(!fx.entries.has(p))fx.entries.set(p,new obsidian.TFile(p));
  fx.texts.clear();for(const [p,b]of current.files)fx.texts.set(p,b.toString('utf8'));
  for(const f of fx.entries.values())if(f.children)f.children=[...fx.entries.values()].filter(x=>path.posix.dirname(x.path)===f.path);
 }
 if(fs.existsSync(path.join(base,'Writing'))&&!fx.entries.has('Writing'))fx.entries.set('Writing',{path:'Writing',children:[]});
 refresh();const v=fx.vault;
 v.read=async f=>fs.readFileSync(abs(f.path),'utf8');
 v.createFolder=async p=>{before();fs.mkdirSync(abs(p));expected.dirs.add(p);refresh();};
 v.create=async(p,text)=>{before();fs.writeFileSync(abs(p),text,{flag:'wx'});expected.files.set(p,Buffer.from(text));refresh();return v.getAbstractFileByPath(p);};
 v.modify=async(f,text)=>{before();assert.ok(expected.files.has(f.path));fs.writeFileSync(abs(f.path),text);expected.files.set(f.path,Buffer.from(text));refresh();};
 v.rename=async(f,p)=>{before();assert.ok(!fs.existsSync(abs(p)),'Destination occupied');const old=f.path;assert.ok(expected.files.has(old),'Only file renames supported');fs.renameSync(abs(old),abs(p));expected.files.set(p,expected.files.get(old));expected.files.delete(old);fx.entries.delete(old);f.path=p;fx.entries.set(p,f);refresh();};
 v.delete=async f=>{before();if(f.children){fs.rmdirSync(abs(f.path));expected.dirs.delete(f.path);}else{fs.unlinkSync(abs(f.path));expected.files.delete(f.path);}refresh();};
 v.trash=async f=>{const dest=path.join(backup,'test-trash',crypto.randomUUID());fs.copyFileSync(abs(f.path),dest);await v.delete(f);};
 fs.mkdirSync(path.join(backup,'test-trash'),{recursive:true});
 v.adapter={list:async p=>{const files=[],folders=[];for(const e of fs.readdirSync(abs(p),{withFileTypes:true}))(e.isDirectory()?folders:files).push(p+'/'+e.name);return {files,folders};}};
 let active=root+'/Plot/Book 1/Dashboard.md';fx.plugin.app.workspace.getActiveFile=()=>v.getAbstractFileByPath(active);
 fx.plugin.app.workspace.getLeaf=()=>({openFile:async f=>{assert.ok(f);active=f.path;}});
 function restore(target){
  fresh();
  for(const p of expected.files.keys())if(!target.files.has(p))fs.unlinkSync(abs(p));
  for(const p of [...expected.dirs].sort((a,b)=>b.length-a.length))if(!target.dirs.has(p))fs.rmdirSync(abs(p));
  for(const p of [...target.dirs].sort((a,b)=>a.length-b.length))fs.mkdirSync(abs(p),{recursive:true});
  for(const [p,b]of target.files)fs.writeFileSync(abs(p),b);
  expected={files:new Map(target.files),dirs:new Set(target.dirs)};refresh();same(target,snapshot(base));
 }
 return {...fx,base,activate:p=>{active=p;},get writes(){return writes;},failNext:n=>{failAt=writes+n;},fresh,restore,capture:()=>snapshot(base)};
}
const opened=[];
class TestModal extends obsidian.Modal{open(){opened.push(this);}}
function bundle(fx){
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),{module,require:n=>n==='obsidian'?{...obsidian,Modal:TestModal}:require(n),console},{filename:'installed-main.js'});
 const plugin=new module.exports();plugin.app=fx.plugin.app;plugin.app.workspace.onLayoutReady=fn=>fn();const commands=new Map();plugin.addCommand=c=>commands.set(c.id,c.callback);plugin.addRibbonIcon=()=>{};plugin.onload();fx.plugin=plugin;return commands;
}
const pop=(title)=>{const m=opened.pop();assert.ok(m,'Expected dialog: '+title);if(title)assert.equal(m.title,title);return m;};
async function run(name,fn){const start=Date.now();try{await fn();report.checks.push({name,status:'pass',ms:Date.now()-start});console.log('PASS '+name);}catch(e){report.checks.push({name,status:'fail',error:e.stack});throw e;}}
const fx=diskFixture(vaultDir);let commands=bundle(fx);
const project=()=>readProject(fx.plugin,root),state=()=>readState(fx.plugin,root);
const apply=async()=>{const p=await project();await execute(fx.plugin,await buildPlan(fx.plugin,p));};
async function healthy(){const results=await validateProject(fx.plugin,root);assert.ok(results.every(x=>x.ok),JSON.stringify(results));}
const write=async(p,t)=>fx.vault.modify(fx.vault.getAbstractFileByPath(p),t);
async function newScene(title,book,part){fx.activate(book.dir+'/Dashboard.md');await commands.get('new-scene')();const m=pop();assert.equal(m.parts.length,book.parts.length);await m.cb({...m.v,title,partId:part.id});const s=await state();const scene=s.scenes.find(x=>x.scenePath.endsWith(' - '+title+'.md'));assert.ok(scene,'Scene creation completed');return scene;}
(async()=>{
 try{
  await run('Read-only baseline validation and Master navigation',async()=>{
   const before=fx.capture(),writes=fx.writes;await commands.get('open-master-dashboard')();await commands.get('validate-project')();const result=pop('Validate Project');report.baselineValidation=result.lines;fx.activate(root+'/Plot/Book 1/Dashboard.md');await commands.get('validate-book')();pop();assert.equal(fx.writes,writes);same(before,fx.capture());
  });
  await run('Apply Master and repair empty obsolete Part folders',async()=>{
   fx.activate(root+'/Plot/Master Dashboard.md');await commands.get('apply-master-dashboard')();await pop('Apply Master Dashboard').callback();await healthy();
   const expected=new Set(layout((await project()).model,root).flatMap(b=>b.parts.flatMap(p=>['Scenes','Manuscript'].map(f=>b.dir+'/'+f+'/Part '+p.number))));
   for(const p of fx.capture().dirs)if(/\/(Scenes|Manuscript)\/Part \d+$/.test(p))assert.ok(expected.has(p),p);
  });
  let created,second,partA,partB,bookA,bookB;
  await run('New Scene from project file asks Book; Book context offers its Parts',async()=>{
   [bookA,bookB]=layout((await project()).model,root);partA=bookA.parts[0];partB=bookB.parts[0];assert.ok(partA&&partB);
   fx.activate(root+'/Spark.md');const pending=commands.get('new-scene')();await new Promise(r=>setImmediate(r));const picker=pop();assert.ok(picker.dashboards);picker.choose(fx.vault.getAbstractFileByPath(bookB.dir+'/Dashboard.md'));await pending;const m=pop();assert.equal(m.parts.length,bookB.parts.length);await m.cb({...m.v,title:'QA temporary A',partId:partB.id});
   created=(await state()).scenes.find(s=>s.scenePath.endsWith(' - QA temporary A.md'));assert.ok(created&&created.bookId===bookB.id);
   second=await newScene('QA temporary B',bookB,partB);
   await write(created.manuscriptPath,replaceManuscriptProse(await fx.vault.read(fx.vault.getAbstractFileByPath(created.manuscriptPath)),'QA temporary A','QA prose A.\n\n# Chapter inside prose\nRetain this heading.'));
   await write(second.manuscriptPath,replaceManuscriptProse(await fx.vault.read(fx.vault.getAbstractFileByPath(second.manuscriptPath)),'QA temporary B','QA prose B.'));
   fx.activate(created.scenePath);await commands.get('new-scene')();assert.equal(pop().v.partId,partB.id);await healthy();
  });
  await run('Reorder Scenes within Part and keep pair identities',async()=>{
   fx.activate(bookB.dir+'/Dashboard.md');await commands.get('reorder-scenes')();const partPicker=pop();await partPicker.callback(partPicker.items.find(i=>i.value.id===partB.id).value);const reorder=pop();await reorder.onSave([...reorder.rows].reverse());
   const current=(await state()).scenes.find(s=>s.id===second.id);assert.match(current.scenePath,/001 - QA temporary B/);created=(await state()).scenes.find(s=>s.id===created.id);second=current;await healthy();
  });
  await run('Apply Dashboard metadata and Book-wide chapters',async()=>{
   const f=bookB.dir+'/Dashboard.md',p=await project(),b=layout(p.model,root).find(b=>b.id===bookB.id),text=await fx.vault.read(fx.vault.getAbstractFileByPath(f)),rows=parseBook(text,true).rows;
   rows.forEach((r,i)=>{r.chapter=String(i+1);if(r.id===created.id){r.pov='[[QA Character]]';r.locations='[[QA Location]]';r.sceneStatus='Drafted';r.manuscriptStatus='Draft';}});
   await write(f,renderBook(text,rows,b,true));fx.activate(f);await commands.get('apply-dashboard')();await healthy();
  });
  let draft;
  await run('Compile Manuscript, Chapters, clean Working Draft; sync selected edits',async()=>{
   fx.activate(bookB.dir+'/Dashboard.md');await commands.get('compile-manuscript')();const compiled=fx.plugin.app.workspace.getActiveFile();assert.ok(compiled.path.includes('/Compiled/'));assert.match(await fx.vault.read(compiled),/# Part /);assert.ok([...fx.capture().files.keys()].some(p=>p.startsWith(bookB.dir+'/Compiled/Chapters/')));
   fx.activate(bookB.dir+'/Dashboard.md');await commands.get('compile-working-draft')();draft=fx.plugin.app.workspace.getActiveFile();let text=await fx.vault.read(draft);assert.doesNotMatch(text,/<!-- WRITING-SYSTEM:DRAFT/);assert.ok(fx.vault.getAbstractFileByPath(draft.path.replace(/\.md$/,'.sync.json')));
   await write(draft.path,text.replace('QA prose A.','QA synced A.').replace('QA prose B.','QA unsynced B.'));fx.activate(draft.path);await commands.get('working-draft-to-manuscript')();const sync=pop();assert.equal(sync.changes.length,2);await sync.onUpdate(sync.changes.filter(c=>c.title==='QA temporary A'));
   assert.match(await fx.vault.read(fx.vault.getAbstractFileByPath(created.manuscriptPath)),/QA synced A/);assert.match(await fx.vault.read(fx.vault.getAbstractFileByPath(created.manuscriptPath)),/# Chapter inside prose/);assert.doesNotMatch(await fx.vault.read(fx.vault.getAbstractFileByPath(second.manuscriptPath)),/QA unsynced B/);
  });
  await run('Move Scene across Books through the story-wide Part dialog',async()=>{
   fx.activate(created.scenePath);await commands.get('move-scene-part')();const picker=pop('Destination Part');assert.ok(picker.items.some(i=>i.value.id===partA.id));await picker.callback(picker.items.find(i=>i.value.id===partA.id).value);
   created=(await state()).scenes.find(s=>s.id===created.id);assert.equal(created.bookId,bookA.id);assert.match(await fx.vault.read(fx.vault.getAbstractFileByPath(created.manuscriptPath)),/QA synced A/);
   const row=parseBook(await fx.vault.read(fx.vault.getAbstractFileByPath(bookA.dir+'/Dashboard.md')),true).rows.find(r=>r.id===created.id);assert.equal(row.chapter,'');await healthy();
   fx.activate(draft.path);const count=opened.length;await commands.get('working-draft-to-manuscript')();assert.equal(opened.length,count);assert.match(obsidian.Notice.messages.at(-1),/another Book/);
  });
  await run('Adding a Part to Book 1 renumbers later Books and removes old folders',async()=>{
   const before=layout((await project()).model,root),oldNumber=before[1].parts[0].number;fx.activate(bookA.dir+'/Dashboard.md');await commands.get('new-part')();let picker=pop('Choose Book');await picker.callback(picker.items.find(i=>i.value.id===bookA.id).value);await pop('New Part name').callback('QA added Part');
   const after=layout((await project()).model,root);assert.equal(after[1].parts[0].number,oldNumber+1);
   for(const folder of ['Scenes','Manuscript'])assert.ok(!fx.vault.getAbstractFileByPath(after[1].dir+'/'+folder+'/Part '+oldNumber));await healthy();
  });
  await run('Reorder Parts with stable identity and renumber Scene pairs',async()=>{
   fx.activate(root+'/Plot/Master Dashboard.md');await commands.get('reorder-parts')();let picker=pop('Choose Book');await picker.callback(picker.items.find(i=>i.value.id===bookA.id).value);let reorder=pop('Reorder Parts');const ids=Array.from(reorder.rows,r=>r.part.id).reverse();await reorder.onSave([...reorder.rows].reverse());assert.deepEqual((await project()).model.books[0].parts.map(p=>p.id),ids);await healthy();
  });
  await run('Move complete Part between Books, preserving attachments and notes',async()=>{
   const p=await project(),b=layout(p.model,root).find(b=>b.id===bookA.id),part=b.parts.find(p=>p.id===partA.id),attachment=b.dir+'/Scenes/Part '+part.number+'/QA attachment.txt';await fx.vault.create(attachment,'QA attachment');
   fx.activate(b.dir+'/Dashboard.md');await commands.get('move-part-book')();let picker=pop('Move Part');await picker.callback(picker.items.find(i=>i.value.part.id===partA.id).value);picker=pop('Destination Book');await picker.callback(picker.items.find(i=>i.value.id===bookB.id).value);await pop('Move Part to Book').callback();
   const dest=layout((await project()).model,root).find(b=>b.id===bookB.id);assert.equal(dest.parts.at(-1).id,partA.id);assert.equal(await fx.vault.read(fx.vault.getAbstractFileByPath(dest.dir+'/Scenes/Part '+dest.parts.at(-1).number+'/QA attachment.txt')),'QA attachment');await healthy();
  });
  await run('Book reorder renumbers Books and Parts while retaining Scene identity',async()=>{
   const p=await project();p.model.books.reverse();await write(p.path,renderMaster(p.model,p.text));fx.activate(p.path);await commands.get('apply-master-dashboard')();await pop('Apply Master Dashboard').callback();assert.equal((await state()).scenes.find(s=>s.id===created.id).bookId,bookB.id);await healthy();
  });
  await run('Dashboard new rows create both files; title changes rename pairs and update links',async()=>{
   const p=await project(),b=layout(p.model,root)[0],part=b.parts[0],file=b.dir+'/Dashboard.md';let text=await fx.vault.read(fx.vault.getAbstractFileByPath(file)),rows=parseBook(text,true).rows;
   rows.push({partId:part.id,sceneLink:'[[Scenes/Part '+part.number+'/QA table row|QA table row]]',manuscriptLink:'[[Manuscript/Part '+part.number+'/QA table row|QA table row]]',chapter:'',pov:'',locations:'',sceneStatus:'Planned',manuscriptStatus:'Not Started'});
   await write(file,renderBook(text,rows,b,true));fx.activate(file);await commands.get('apply-dashboard')();let scene=(await state()).scenes.find(s=>s.scenePath.endsWith(' - QA table row.md'));assert.ok(scene&&fx.vault.getAbstractFileByPath(scene.manuscriptPath));
   text=await fx.vault.read(fx.vault.getAbstractFileByPath(file));rows=parseBook(text,true).rows;const row=rows.find(r=>r.id===scene.id);row.sceneLink=row.sceneLink.replace('|QA table row]]','|QA renamed row]]');row.manuscriptLink=row.manuscriptLink.replace('|QA table row]]','|QA renamed row]]');await write(file,renderBook(text,rows,b,true));await commands.get('apply-dashboard')();
   const renamed=(await state()).scenes.find(s=>s.id===scene.id);assert.match(renamed.scenePath,/QA renamed row/);assert.ok(!fx.vault.getAbstractFileByPath(scene.scenePath));fx.activate(renamed.scenePath);await commands.get('open-manuscript')();assert.equal(fx.plugin.app.workspace.getActiveFile().path,renamed.manuscriptPath);await commands.get('open-scene')();assert.equal(fx.plugin.app.workspace.getActiveFile().path,renamed.scenePath);await healthy();
  });
  await run('Chapter spanning Parts is rejected before any write',async()=>{
   const p=await project(),b=layout(p.model,root).find(b=>b.parts.length>1),text=await fx.vault.read(fx.vault.getAbstractFileByPath(b.dir+'/Dashboard.md')),rows=parseBook(text,true).rows;
   const first=rows[0];assert.ok(first);first.chapter='1';const other=b.parts.find(part=>part.id!==first.partId);rows.push({partId:other.id,sceneLink:'[[Scenes/Part '+other.number+'/QA invalid chapter|QA invalid chapter]]',manuscriptLink:'[[Manuscript/Part '+other.number+'/QA invalid chapter|QA invalid chapter]]',chapter:'1'});const writes=fx.writes;await assert.rejects(buildPlan(fx.plugin,p,{rows:new Map([[b.id,rows]])}),/cannot span Parts/);assert.equal(fx.writes,writes);
  });
  await run('Read-only validation rejects incomplete pairs; Apply does not recreate them',async()=>{
   const current=(await state()).scenes.find(s=>s.id===second.id),f=fx.vault.getAbstractFileByPath(current.manuscriptPath),text=await fx.vault.read(f);await fx.vault.delete(f);const before=fx.capture(),writes=fx.writes;const issues=await validateProject(fx.plugin,root);assert.ok(issues.some(i=>!i.ok));assert.equal(fx.writes,writes);await assert.rejects(buildPlan(fx.plugin,await project()),/Incomplete/);same(before,fx.capture());await fx.vault.create(current.manuscriptPath,text);await healthy();
  });
  await run('Collision, unsafe path, conflicting Part identity and stale plan reject without writes',async()=>{
   const before=fx.capture(),writes=fx.writes;assert.throws(()=>validatePlan(fx.plugin,{files:[{target:root+'/QA.md'},{target:root+'/qa.md'}]}),/Duplicate/);assert.throws(()=>validatePlan(fx.plugin,{files:[{target:root+'/../Escape.md'}]}),/Unsafe/);const p=await project();p.model.books[1].parts.push({...p.model.books[0].parts[0]});await assert.rejects(buildPlan(fx.plugin,p),/identity/);assert.equal(fx.writes,writes);same(before,fx.capture());
   const plan=await buildPlan(fx.plugin,await project());const extra=root+'/QA stale check.txt';await fx.vault.create(extra,'preserve');await assert.rejects(execute(fx.plugin,plan),/changed since planning/);await fx.vault.delete(fx.vault.getAbstractFileByPath(extra));
  });
  await run('Disk write failure rolls back original Scene files, prose and Dashboards',async()=>{
   const p=await project(),s=(await state()).scenes.find(s=>s.id===created.id),dest=layout(p.model,root).flatMap(b=>b.parts).find(x=>x.id!==s.partId);const plan=await buildPlan(fx.plugin,p,{sceneMove:{id:s.id,partId:dest.id}}),before=fx.capture();fx.failNext(8);await assert.rejects(execute(fx.plugin,plan),/Injected/);same(before,fx.capture());await healthy();
  });
  await run('Recovery command restores a staged interrupted operation',async()=>{
   const source=root+'/QA recovery.txt',stage=root+'/Writing System Staging qa';await fx.vault.create(source,'original');await fx.vault.createFolder(stage);await fx.vault.rename(fx.vault.getAbstractFileByPath(source),stage+'/0');await fx.vault.create(root+'/Writing System Operation.json',JSON.stringify({root,status:'running',phase:'staging',files:[{source,target:root+'/QA recovered.txt',temp:stage+'/0',before:'original',after:'updated'}]}));fx.activate(root+'/Plot/Master Dashboard.md');await commands.get('recover-writing-project')();await pop('Recover interrupted operation').callback();assert.equal(await fx.vault.read(fx.vault.getAbstractFileByPath(source)),'original');await fx.vault.delete(fx.vault.getAbstractFileByPath(source));await healthy();
  });
  await run('Delete Scene removes both files and safely renumbers remaining Scenes',async()=>{
   const current=(await state()).scenes.find(s=>s.id===second.id);fx.activate(current.scenePath);await commands.get('delete-scene')();const modal=pop();await modal.onConfirm(modal.rows.findIndex(r=>r.id===second.id));assert.ok(!(await state()).scenes.some(s=>s.id===second.id));await healthy();
  });
  await run('Flat project creation, compilation and explicit migration on isolated Test Parts path',async()=>{
   const base=path.join(backup,'isolated-flat-vault');fs.mkdirSync(path.join(base,'Writing'),{recursive:true});const isolated=diskFixture(base),cmd=bundle(isolated);
   await cmd.get('new-project')();await pop().cb({name:'Test Parts',books:1,parts:false,optional:[],custom:''});
   const book=root+'/Plot/Book 1';isolated.activate(book+'/Dashboard.md');await cmd.get('new-scene')();const form=pop();assert.equal(form.parts.length,0);await form.cb({...form.v,title:'QA flat Scene'});
   let st=await readState(isolated.plugin,root);assert.equal(st.scenes.length,1);const scene=st.scenes[0];assert.ok(!scene.scenePath.includes('/Part '));
   let file=isolated.vault.getAbstractFileByPath(scene.manuscriptPath);await isolated.vault.modify(file,replaceManuscriptProse(await isolated.vault.read(file),'QA flat Scene','Flat prose preserved.'));
   const dashboard=isolated.vault.getAbstractFileByPath(book+'/Dashboard.md');await isolated.vault.modify(dashboard,(await isolated.vault.read(dashboard))+'\nQA custom Dashboard notes.\n');
   isolated.activate(book+'/Dashboard.md');await cmd.get('compile-manuscript')();assert.match(await isolated.vault.read(isolated.plugin.app.workspace.getActiveFile()),/Flat prose preserved/);assert.equal((await readProject(isolated.plugin,root)).model.partsEnabled,false);
   isolated.activate(book+'/Dashboard.md');await cmd.get('enable-parts-project')();await pop('Initial Part name for each Book').callback('QA initial Part');let preview=pop('Enable Parts for entire Project');assert.ok(preview.plan.files.some(op=>op.target.includes('/Part 1/')));await preview.callback();
   st=await readState(isolated.plugin,root);assert.equal(st.scenes[0].id,scene.id);assert.match(st.scenes[0].scenePath,/Part 1/);assert.match(await isolated.vault.read(isolated.vault.getAbstractFileByPath(st.scenes[0].manuscriptPath)),/Flat prose preserved/);assert.match(await isolated.vault.read(dashboard),/QA custom Dashboard notes/);assert.ok((await validateProject(isolated.plugin,root)).every(x=>x.ok));
   isolated.activate(book+'/Dashboard.md');await cmd.get('compile-working-draft')();const draft=isolated.plugin.app.workspace.getActiveFile(),text=await isolated.vault.read(draft);const old=text.replace(/^### /m,'<!-- WRITING-SYSTEM:DRAFT-SCENE:'+scene.id+' -->\n### ')+'\n<!-- WRITING-SYSTEM:DRAFT-END -->\n';await isolated.vault.modify(draft,old.replace('Flat prose preserved.','Unsynced legacy edits.'));await cmd.get('clean-working-draft')();const cleaned=await isolated.vault.read(draft);assert.doesNotMatch(cleaned,/<!-- WRITING-SYSTEM:DRAFT/);assert.match(cleaned,/Unsynced legacy edits/);await cmd.get('working-draft-to-manuscript')();const sync=pop();await sync.onUpdate(sync.changes);assert.match(await isolated.vault.read(isolated.vault.getAbstractFileByPath(st.scenes[0].manuscriptPath)),/Unsynced legacy edits/);
   await cmd.get('new-project')();await pop().cb({name:'Test Parts',books:2,parts:true,optional:[],custom:''});assert.equal((await readState(isolated.plugin,root)).model.books.length,2);assert.ok((await validateProject(isolated.plugin,root)).every(x=>x.ok));
   report.isolatedMigrationVault=base;
  });
  await run('Fresh Parts project creation starts each Book with one identified Part',async()=>{
   const base=path.join(backup,'isolated-parts-vault');fs.mkdirSync(path.join(base,'Writing'),{recursive:true});const isolated=diskFixture(base),cmd=bundle(isolated);await cmd.get('new-project')();await pop().cb({name:'Test Parts',books:2,parts:true,optional:[],custom:''});const st=await readState(isolated.plugin,root);assert.equal(st.model.books.length,2);assert.ok(st.model.books.every(b=>b.parts.length===1));const project=await readProject(isolated.plugin,root);await execute(isolated.plugin,await buildPlan(isolated.plugin,project));assert.ok((await validateProject(isolated.plugin,root)).every(x=>x.ok));
  });
 }catch(e){report.error=e.stack;console.error(e.stack);process.exitCode=1;}
 finally{
  try{fx.restore(baseline);same(baseline,snapshot(vaultDir));report.restored=true;console.log('RESTORED original project bytes and folders.');}catch(e){report.restored=false;report.restoreError=e.stack;process.exitCode=1;console.error('RESTORE STOPPED to preserve unexpected edits. Backup: '+backup,e);}
  fs.writeFileSync(path.join(backup,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(backup,'report.json'));
 }
})();
