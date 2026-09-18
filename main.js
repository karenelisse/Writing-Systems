/* Writing System v2.3.0 - generated bundle. Edit source modules, then rebuild. */
'use strict';

const __externalRequire = require;
const __modules = {
"main.source.js": function (require, module, exports) {
const { Plugin } = require('obsidian');
const { registerCommands } = require('./commands');
const { openDashboard } = require('./commands/dashboard');

module.exports = class WritingSystem extends Plugin {
  async onload() {
    registerCommands(this);
    this.app.workspace.onLayoutReady(()=>{
      const journals=this.app.vault.getFiles().filter(f=>f.path.endsWith('/Writing System Operation.json'));
      if(journals.length)new (require('obsidian').Notice)('Writing System found interrupted operations. Run Recover Writing Project before applying changes.',10000);
    });
    this.addRibbonIcon('book-open', 'Open writing dashboard', () => openDashboard(this));
  }
};

},
"commands/compile.js": function (require, module, exports) {
const { Notice, TFile, normalizePath } = require('obsidian');
const { chooseDashboard } = require('./dashboard');
const { bookInfo, parseRows, parseWiki, basename, linkedFilePath, workingTitleFromDashboard, safeFilename } = require('../lib/dashboard');
const { stripManuscript } = require('../lib/templates');
const { ensureFolder } = require('../services/files');

async function compile(plugin, copyToClipboard) {
  try {
    await compileBook(plugin, copyToClipboard);
  } catch (error) {
    console.error('Writing System compile failed', error);
    new Notice(`Compile failed: ${error?.message || String(error)}`);
  }
}

async function compileBook(plugin, copyToClipboard) {
  const d = await chooseDashboard(plugin);
  if (!d) return;

  const I = bookInfo(d.path);
  const dashboardContent = await plugin.app.vault.read(d);

  let rs;
  try {
    rs = await require('../lib/compilation').compilationRows(plugin,d,dashboardContent);
  } catch (e) {
    new Notice(`Compile failed: ${e.message}`);
    return;
  }

  const bodyParts = [];
  const chapterMap = new Map();
  const hasChapter = rs.some(r => String(r.chapter || '').trim());
  let currentPart = null;
  let currentChapter = null;
  let compiled = 0;
  let empty = 0;
  let missing = 0;
  const missingTitles = [];

  for (const r of rs) {
    // Scene title is the canonical key for the Scene/Manuscript pair.
    const sw = parseWiki(r.sceneLink);
    const title = sw.label || basename(sw.path);
    if (!title) continue;

    const manuscriptPath = normalizePath(linkedFilePath(I.bookDir, r.manuscriptLink, 'Manuscript', title));
    const mf = plugin.app.vault.getAbstractFileByPath(manuscriptPath);

    if (!(mf instanceof TFile)) {
      missing++;
      missingTitles.push(title);
      continue;
    }

    const prose = stripManuscript(await plugin.app.vault.read(mf), title);
    if (!prose) {
      empty++;
      continue;
    }

    if (r.partHeading && r.partHeading !== currentPart) { bodyParts.push(r.partHeading); currentPart = r.partHeading; currentChapter = null; }
    const ch = String(r.chapter || '').trim();
    if (hasChapter && ch !== currentChapter) {
      bodyParts.push(ch ? `# Chapter ${ch}` : '# Unassigned');
      currentChapter = ch;
    }

    bodyParts.push(prose);
    compiled++;

    if (ch) {
      if (!chapterMap.has(ch)) chapterMap.set(ch, []);
      chapterMap.get(ch).push(prose);
    }
  }

  const workingTitle = workingTitleFromDashboard(dashboardContent, I);
  const seriesTitle = I.projectName || '';
  const titleBlock = seriesTitle && seriesTitle !== workingTitle
    ? `# ${workingTitle}\n\n*${seriesTitle}*`
    : `# ${workingTitle}`;

  const full = bodyParts.length
    ? `${titleBlock}\n\n${bodyParts.join('\n\n')}\n`
    : `${titleBlock}\n`;

  const outDir = normalizePath(`${I.bookDir}/Compiled`);
  await ensureFolder(plugin, `${outDir}/Chapters`);

  const outputName = safeFilename(workingTitle) || I.bookName;
  const outPath = normalizePath(`${outDir}/${outputName}.md`);
  let f = plugin.app.vault.getAbstractFileByPath(outPath);
  if (f instanceof TFile) await plugin.app.vault.modify(f, full);
  else await plugin.app.vault.create(outPath, full);

  for (const [ch, proseParts] of chapterMap) {
    const chapterName = safeFilename(ch) || 'Unassigned';
    const cp = normalizePath(`${outDir}/Chapters/Chapter ${chapterName}.md`);
    const txt = `# Chapter ${ch}\n\n${proseParts.join('\n\n')}\n`;
    f = plugin.app.vault.getAbstractFileByPath(cp);
    if (f instanceof TFile) await plugin.app.vault.modify(f, txt);
    else await plugin.app.vault.create(cp, txt);
  }

  const detail = missingTitles.length
    ? ` Missing: ${missingTitles.slice(0, 5).join(', ')}${missingTitles.length > 5 ? '…' : ''}`
    : '';

  if (copyToClipboard) {
    try {
      await navigator.clipboard.writeText(full);
      new Notice(`Compiled ${compiled} scenes to ${outPath} and copied to clipboard. ${empty} empty; ${missing} missing.${detail}`);
    } catch {
      new Notice(`Compiled ${compiled} scenes to ${outPath}, but clipboard copy failed. ${empty} empty; ${missing} missing.${detail}`);
    }
  } else {
    new Notice(`Compiled ${compiled} scenes to ${outPath}. ${empty} empty; ${missing} missing.${detail}`);
  }

  f = plugin.app.vault.getAbstractFileByPath(outPath);
  if (f instanceof TFile) await plugin.app.workspace.getLeaf(false).openFile(f);
}

async function compileWorkingDraft(plugin) {
  try {
    const d = await chooseDashboard(plugin);
    if (!d) return;

    const info = bookInfo(d.path);
    const dashboardContent = await plugin.app.vault.read(d);
    const rows = await require('../lib/compilation').compilationRows(plugin,d,dashboardContent);
    const bodyParts = [];
    const sections = [];
    const checks = [{path:d.path,content:dashboardContent}];
    const hasChapter = rows.some(row => String(row.chapter || '').trim());
    let currentPart = null;
    let currentChapter = null;
    let compiled = 0;
    let empty = 0;
    let missing = 0;
    const missingTitles = [];

    for (const row of rows) {
      const sceneWiki = parseWiki(row.sceneLink);
      const title = sceneWiki.label || basename(sceneWiki.path);
      if (!title) continue;

      const manuscriptPath = normalizePath(linkedFilePath(info.bookDir, row.manuscriptLink, 'Manuscript', title));
      const manuscript = plugin.app.vault.getAbstractFileByPath(manuscriptPath);
      if (!(manuscript instanceof TFile)) {
        missing++;
        missingTitles.push(title);
        continue;
      }

      const manuscriptContent = await plugin.app.vault.read(manuscript);
      checks.push({path:manuscriptPath,content:manuscriptContent});
      const prose = stripManuscript(manuscriptContent, title);
      if (!prose) {
        empty++;
        continue;
      }

      const before = [];
      if (row.partHeading && row.partHeading !== currentPart) { before.push(row.partHeading); bodyParts.push(row.partHeading); currentPart = row.partHeading; currentChapter = null; }
      const chapter = String(row.chapter || '').trim();
      if (hasChapter && chapter !== currentChapter) {
        const heading = chapter ? `# Chapter ${chapter}` : '# Unassigned';
        before.push(heading); bodyParts.push(heading);
        currentChapter = chapter;
      }

      const manuscriptLink = manuscriptPath.slice(info.bookDir.length + 1).replace(/\.md$/i, '');
      bodyParts.push(`### [[${manuscriptLink}|${title}]]\n\n${prose}`);
      sections.push({id:row.id || null,path:manuscriptPath,title,before});
      compiled++;
    }

    const workingTitle = workingTitleFromDashboard(dashboardContent, info);
    const seriesTitle = info.projectName || '';
    const titleBlock = seriesTitle && seriesTitle !== workingTitle
      ? `# ${workingTitle} — Working Draft\n\n*${seriesTitle}*`
      : `# ${workingTitle} — Working Draft`;
    const full = bodyParts.length
      ? `${titleBlock}\n\n${bodyParts.join('\n\n')}\n`
      : `${titleBlock}\n`;

    const outDir = normalizePath(`${info.bookDir}/Compiled`);
    const outputName = safeFilename(`${workingTitle} - Working Draft`) || `${info.bookName} - Working Draft`;
    const outPath = normalizePath(`${outDir}/${outputName}.md`);
    let output = await require('../services/working-draft').saveDraft(plugin,outPath,full,{
      kind:require('../lib/working-draft').KIND,version:1,draftPath:outPath,sections
    },checks);

    const detail = missingTitles.length
      ? ` Missing: ${missingTitles.slice(0, 5).join(', ')}${missingTitles.length > 5 ? '…' : ''}`
      : '';
    new Notice(`Compiled working draft with ${compiled} linked scenes to ${outPath}. ${empty} empty; ${missing} missing.${detail}`);

    output = plugin.app.vault.getAbstractFileByPath(outPath);
    if (output instanceof TFile) await plugin.app.workspace.getLeaf(false).openFile(output);
  } catch (error) {
    console.error('Writing System working-draft compile failed', error);
    new Notice(`Working draft compile failed: ${error?.message || String(error)}`);
  }
}

module.exports = { compile, compileWorkingDraft };

},
"commands/dashboard.js": function (require, module, exports) {
const { Modal, Setting, Notice, TFile, normalizePath } = require('obsidian');
const { parseRows, replaceRows, bookInfo, parseWiki, basename, stripOrderPrefix, numberedName, linkedFilePath, extractLinks, firstLinkName } = require('../lib/dashboard');
const { sceneTemplate, manuscriptTemplate } = require('../lib/templates');
const { createMissing } = require('../services/files');
const { ReorderModal } = require('../modals/reorder');

function dashboards(plugin) {
  return plugin.app.vault.getMarkdownFiles()
    .filter(f => /\/Plot\/Book \d+\/Dashboard\.md$/i.test(f.path))
    .sort((a,b)=>a.path.localeCompare(b.path));
}

async function chooseDashboard(plugin, options = {}) {
  const active = Object.prototype.hasOwnProperty.call(options,'activeFile') ? options.activeFile : plugin.app.workspace.getActiveFile();
  if (active && /\/Plot\/Book \d+\/Dashboard\.md$/i.test(active.path)) return active;
  if (active) {
    const bookMatch = active.path.match(/^(.*\/Plot\/Book \d+)(?:\/.*)?$/i);
    if (bookMatch) {
      const nearby = plugin.app.vault.getAbstractFileByPath(`${bookMatch[1]}/Dashboard.md`);
      if (nearby instanceof TFile) return nearby;
      if(options.sceneContext){new Notice('The active Book has no Dashboard.md. Restore its Dashboard before creating a Scene.');return null;}
    }
  }
  let ds = dashboards(plugin);
  if(active && options.sceneContext){
    const root = require('../services/project').rootFromPath(active.path) || ds.map(d=>bookInfo(d.path).projectDir).filter(dir=>active.path.startsWith(dir+'/')).sort((a,b)=>b.length-a.length)[0];
    if(root)ds=ds.filter(d=>bookInfo(d.path).projectDir===root);
  }
  if (!ds.length) { new Notice('No writing Dashboard.md found.'); return null; }
  if (ds.length === 1 && !options.sceneContext) return ds[0];
  return await new Promise(resolve => {
    const app = plugin.app;
    class Pick extends Modal {
      constructor() {
        super(app);
        this.resolved = false;
        this.dashboards = ds;
      }
      choose(file) {
        if(!this.dashboards.includes(file))return;
        this.resolved=true;this.close();resolve(file);
      }
      onOpen() {
        this.contentEl.createEl('h2', { text:options.sceneContext?'Choose Book':'Choose dashboard' });
        this.dashboards.forEach(f => new Setting(this.contentEl).setName(f.path)
          .addButton(b=>b.setButtonText('Use').onClick(()=>{
            this.choose(f);
          })));
      }
      onClose(){
        this.contentEl.empty();
        if (!this.resolved) resolve(null);
      }
    }
    new Pick(app).open();
  });
}

async function openDashboard(plugin) {
  const d = await chooseDashboard(plugin);
  if (d) await plugin.app.workspace.getLeaf(false).openFile(d);
}

async function reorderScenes(plugin) {
  const d = await chooseDashboard(plugin);
  if (!d) return;
  if (await require('./part-scenes').reorder(plugin,d)) return;
  let rs;
  try { rs = parseRows(await plugin.app.vault.read(d)); }
  catch(e) { return new Notice(e.message); }
  new ReorderModal(plugin.app, rs, async reordered => {
    const current = await plugin.app.vault.read(d);
    await plugin.app.vault.modify(d, replaceRows(current, reordered));
    await applyDashboardFile(plugin, d, false);
    new Notice('Scene order saved and applied.');
  }).open();
}

async function applyDashboard(plugin) {
  const d = await chooseDashboard(plugin);
  if (!d) return;
  await applyDashboardFile(plugin, d, true);
}

async function applyDashboardFile(plugin, d, showNotice) {
  const projectService = require('../services/project');
  const project = await projectService.readProject(plugin, projectService.rootFromPath(d.path));
  if (project) {
    await require('./parts').requireApplied(plugin, project);
    const plan = await require('../services/reconciliation').buildPlan(plugin, project);
    await require('../services/transactions').execute(plugin, plan);
    if (showNotice) new Notice('Dashboard applied.');
    return;
  }
  const I = bookInfo(d.path);
  const original = await plugin.app.vault.read(d);
  let rs;
  try { rs = parseRows(original); }
  catch(e) { if (showNotice) new Notice(e.message); return; }

  let created = 0;
  const plans = rs.map((r, i) => {
    const sw = parseWiki(r.sceneLink);
    const mw = parseWiki(r.manuscriptLink);
    const title = stripOrderPrefix(sw.label || basename(sw.path) || mw.label || basename(mw.path));
    if (!title) throw new Error(`Dashboard row ${i + 1} has no scene title.`);
    const numbered = numberedName(title, i + 1, rs.length);
    return {
      title,
      sceneSource: resolvePairPath(plugin, I.bookDir, r.sceneLink, 'Scenes', title),
      manuscriptSource: resolvePairPath(plugin, I.bookDir, r.manuscriptLink, 'Manuscript', title),
      scenePath: normalizePath(`${I.bookDir}/Scenes/${numbered}.md`),
      manuscriptPath: normalizePath(`${I.bookDir}/Manuscript/${numbered}.md`)
    };
  });

  for(const plan of plans){
    for(const path of [plan.sceneSource,plan.manuscriptSource,plan.scenePath,plan.manuscriptPath])require('../lib/project').assertPath(path);
    if(!plan.sceneSource.startsWith(I.bookDir+'/Scenes/')||!plan.manuscriptSource.startsWith(I.bookDir+'/Manuscript/'))throw Error('Unsafe cross-Book Scene link.');
    const sf=plugin.app.vault.getAbstractFileByPath(plan.sceneSource),mf=plugin.app.vault.getAbstractFileByPath(plan.manuscriptSource);
    if((sf instanceof TFile)!==(mf instanceof TFile))throw Error('Incomplete existing pair: '+plan.title);
  }
  const allSources=new Set(plans.flatMap(p=>[p.sceneSource,p.manuscriptSource]).map(p=>p.toLowerCase()));
  const destinations=new Set();
  for(const path of plans.flatMap(p=>[p.scenePath,p.manuscriptPath])){
    const key=path.toLowerCase();if(destinations.has(key))throw Error('Duplicate destination: '+path);destinations.add(key);
    const occupant=plugin.app.vault.getAllLoadedFiles().find(f=>f.path.toLowerCase()===key);
    if(occupant&&(!(occupant instanceof TFile)||!allSources.has(key)))throw Error('Occupied destination: '+path);
  }
  await renumberPairs(plugin, plans);

  for (let i=0; i<rs.length; i++) {
    const r = rs[i];
    const plan = plans[i];
    const order = (i + 1) * 100;
    const title = plan.title;
    if (!title) continue;

    const pov = firstLinkName(r.pov);
    const locations = extractLinks(r.locations);
    const chText = String(r.chapter || '').trim();
    const chapter = /^\d+$/.test(chText) ? Number(chText) : chText;
    const sp = plan.scenePath;
    const mp = plan.manuscriptPath;
    const sceneTarget = sp.slice(I.bookDir.length + 1).replace(/\.md$/i, '');
    const manuscriptTarget = mp.slice(I.bookDir.length + 1).replace(/\.md$/i, '');

    if (await createMissing(plugin, sp, sceneTemplate({...I,title,pov,locations,order,sceneStatus:r.sceneStatus,manuscriptTarget}))) created++;
    if (await createMissing(plugin, mp, manuscriptTemplate({...I,title,pov,locations,order,manuscriptStatus:r.manuscriptStatus,sceneTarget}))) created++;

    const sf = plugin.app.vault.getAbstractFileByPath(sp);
    const mf = plugin.app.vault.getAbstractFileByPath(mp);

    if (sf instanceof TFile) {
      await plugin.app.fileManager.processFrontMatter(sf, fm => {
        fm.tags = [...new Set([...(Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []), 'scene'])];
        fm.book = I.bookName;
        fm.book_number = I.bookNumber;
        fm.story_order = order;
        delete fm.scene_order;
        fm.chapter = chapter;
        fm.status = r.sceneStatus || 'Planned';
        fm.pov = pov ? [`[[${pov}]]`] : [];
        fm.locations = locations;
        fm.manuscript = `[[${manuscriptTarget}]]`;
      });
    }

    if (mf instanceof TFile) {
      await plugin.app.fileManager.processFrontMatter(mf, fm => {
        fm.tags = [...new Set([...(Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []), 'manuscript'])];
        fm.book = I.bookName;
        fm.book_number = I.bookNumber;
        fm.story_order = order;
        delete fm.scene_order;
        fm.chapter = chapter;
        fm.status = r.manuscriptStatus || 'Not Started';
        fm.pov = pov ? [`[[${pov}]]`] : [];
        fm.locations = locations;
        fm.scene = `[[${sceneTarget}]]`;
      });
    }

    r.sceneLink = `[[${sp.slice(I.bookDir.length + 1).replace(/\.md$/i, '')}|${title}]]`;
    r.manuscriptLink = `[[${mp.slice(I.bookDir.length + 1).replace(/\.md$/i, '')}|${title}]]`;
    r.pov = pov ? `[[${pov}]]` : '';
    r.locations = locations.join(', ');
  }

  await plugin.app.vault.modify(d, replaceRows(original, rs));
  await regenerateIndexes(plugin, d, rs);
  if (showNotice) new Notice(`Applied Dashboard to ${rs.length} scenes; created ${created} missing paired files.`);
}

function resolvePairPath(plugin, bookDir, link, folder, title) {
  const linkedPath = normalizePath(linkedFilePath(bookDir, link, folder, title));
  const folderPath = normalizePath(`${bookDir}/${folder}`);
  const matching = plugin.app.vault.getMarkdownFiles().filter(file => {
    const parent = file.path.split('/').slice(0, -1).join('/');
    return parent === folderPath && stripOrderPrefix(basename(file.path)) === title;
  });
  const numbered = matching.filter(file => /^\d{3,}\s+-\s+/.test(basename(file.path)));

  if (numbered.length > 1) {
    throw new Error(`Multiple numbered ${folder} files match "${title}".`);
  }
  if (numbered.length === 1) return numbered[0].path;

  const linked = plugin.app.vault.getAbstractFileByPath(linkedPath);
  if (linked instanceof TFile) return linked.path;
  if (matching.length === 1) return matching[0].path;
  if (matching.length > 1) {
    throw new Error(`Multiple ${folder} files match "${title}".`);
  }
  return linkedPath;
}

async function renumberPairs(plugin, plans) {
  const moves = [];
  const sources = new Set();
  const destinations = new Set();

  for (const plan of plans) {
    for (const [source, destination] of [
      [plan.sceneSource, plan.scenePath],
      [plan.manuscriptSource, plan.manuscriptPath]
    ]) {
      if (sources.has(source)) throw new Error(`Duplicate Dashboard file link: ${source}`);
      if (destinations.has(destination)) throw new Error(`Duplicate numbered filename: ${destination}`);
      sources.add(source);
      destinations.add(destination);
      const file = plugin.app.vault.getAbstractFileByPath(source);
      if (file instanceof TFile && source !== destination) moves.push({ file, source, destination });
    }
  }

  for (const { destination } of moves) {
    const occupant = plugin.app.vault.getAbstractFileByPath(destination);
    if (occupant instanceof TFile && !sources.has(destination)) {
      throw new Error(`Cannot number scenes because this file already exists: ${destination}`);
    }
  }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const folder = move.source.split('/').slice(0, -1).join('/');
    move.temp = normalizePath(`${folder}/.writing-system-renumber-${stamp}-${i}.md`);
    await plugin.app.vault.rename(move.file, move.temp);
  }
  for (const move of moves) await plugin.app.vault.rename(move.file, move.destination);
}

async function regenerateIndexes(plugin, dashboard, rs) {
  const I = bookInfo(dashboard.path);
  const sceneLines = [];
  const manLines = [];
  for (const r of rs) {
    const sw = parseWiki(r.sceneLink);
    const title = sw.label || basename(sw.path);
    if (!title) continue;
    sceneLines.push(`- ${r.sceneLink} — ${r.sceneStatus || 'Planned'}`);
    manLines.push(`- ${r.manuscriptLink} — ${r.manuscriptStatus || 'Not Started'}`);
  }
  const sceneText = `---\ntags:\n  - scene-index\nbook: ${I.bookName}\nbook_number: ${I.bookNumber}\ngenerated_from: Dashboard\n---\n\n# ${I.bookName} — Scene Index\n\n> Generated from [[Dashboard]]. Do not edit this file to control story order.\n\n${sceneLines.join('\n')}\n`;
  const manText = `---\ntags:\n  - manuscript-index\nbook: ${I.bookName}\nbook_number: ${I.bookNumber}\ngenerated_from: Dashboard\n---\n\n# ${I.bookName} — Manuscript Index\n\n> Generated from [[Dashboard]]. Do not edit this file to control story order.\n\n${manLines.join('\n')}\n`;
  for (const [path, text] of [[`${I.bookDir}/Scene Index.md`, sceneText],[`${I.bookDir}/Manuscript Index.md`, manText]]) {
    const f = plugin.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) await plugin.app.vault.modify(f, text);
    else await plugin.app.vault.create(path, text);
  }
}

module.exports = {
  dashboards,
  chooseDashboard,
  openDashboard,
  reorderScenes,
  applyDashboard,
  applyDashboardFile,
  regenerateIndexes,
  resolvePairPath
};

},
"commands/index.js": function (require, module, exports) {
const { newProject } = require('./project');
const { openDashboard, reorderScenes, applyDashboard } = require('./dashboard');
const {
  newScene,
  deleteScene,
} = require('./scene');
const { compile, compileWorkingDraft } = require('./compile');
const { workingDraftToManuscript } = require('./working-draft');
const { openPaired, validateBook } = require('./navigation');

function registerCommands(plugin) {
  const parts = require('./parts');
  for (const [id, name, fn] of [
    ['open-master-dashboard','Open Master Dashboard',parts.openMaster],
    ['apply-master-dashboard','Apply Master Dashboard',parts.applyMaster],
    ['enable-parts-project','Enable Parts for Project',parts.enableParts],
    ['reorder-parts','Reorder Parts',parts.reorderParts],
    ['move-part-book','Move Part to Book',parts.movePart],
    ['move-scene-part','Move Scene to Part',parts.moveScene],
    ['new-part','New Part',parts.addPart],
    ['recover-writing-project','Recover Writing Project',parts.guarded(async plugin=>{
      const d=plugin.app.workspace.getActiveFile() || await require('./dashboard').chooseDashboard(plugin);if(!d)return;
      const root=require('../services/project').rootFromPath(d.path);if(!root)throw Error('Open a file inside the affected project Plot folder first.');
      const service=require('../services/recovery');const inspection=await service.inspectRecovery(plugin,root);
      const preview={files:inspection.journal.files.map(op=>({source:op.target,target:op.source||'(remove newly created file)'}))};
      new (require('../modals/parts').Preview)(plugin.app,'Recover interrupted operation',preview,parts.guarded(async()=>{await service.recover(plugin,inspection);new (require('obsidian').Notice)('Project recovered.');})).open();
    })],
    ['validate-project','Validate Project',parts.guarded(async plugin => {
      const p = await parts.context(plugin); if (!p) return;
      const lines = await require('../lib/validation').validateProject(plugin,p.root);
      new (require('../modals/validate').ValidateModal)(plugin.app,lines,'Validate Project').open();
    })]
  ]) plugin.addCommand({id,name,callback:()=>fn(plugin)});
  plugin.addCommand({ id:'new-project', name:'New Project', callback:()=>newProject(plugin) });
  plugin.addCommand({ id:'open-dashboard', name:'Open Dashboard', callback:()=>openDashboard(plugin) });
  plugin.addCommand({ id:'new-scene', name:'New Scene', callback:()=>parts.guarded(newScene)(plugin) });
  plugin.addCommand({ id:'delete-scene', name:'Delete Scene', callback:()=>parts.guarded(deleteScene)(plugin) });
  plugin.addCommand({ id:'reorder-scenes', name:'Reorder Scenes', callback:()=>parts.guarded(reorderScenes)(plugin) });
  plugin.addCommand({ id:'apply-dashboard', name:'Apply Dashboard', callback:()=>parts.guarded(applyDashboard)(plugin) });
  plugin.addCommand({ id:'compile-manuscript', name:'Compile Manuscript', callback:()=>compile(plugin, false) });
  plugin.addCommand({ id:'compile-copy', name:'Compile Manuscript and Copy to Clipboard', callback:()=>compile(plugin, true) });
  plugin.addCommand({ id:'clean-working-draft', name:'Remove Working Draft Comments', callback:()=>parts.guarded(require('./working-draft').cleanWorkingDraft)(plugin) });
  plugin.addCommand({ id:'compile-working-draft', name:'Compile Working Draft', callback:()=>compileWorkingDraft(plugin) });
  plugin.addCommand({ id:'working-draft-to-manuscript', name:'Working Draft to Manuscript', callback:()=>parts.guarded(workingDraftToManuscript)(plugin) });
  plugin.addCommand({ id:'open-scene', name:'Open Scene', callback:()=>openPaired(plugin, 'scene') });
  plugin.addCommand({ id:'open-manuscript', name:'Open Manuscript', callback:()=>openPaired(plugin, 'manuscript') });
  plugin.addCommand({ id:'validate-book', name:'Validate Book', callback:()=>validateBook(plugin) });
}

module.exports = { registerCommands };

},
"commands/navigation.js": function (require, module, exports) {
const { Notice, TFile, normalizePath } = require('obsidian');
const { chooseDashboard } = require('./dashboard');
const { bookInfo, parseRows, parseWiki, basename, linkedFilePath } = require('../lib/dashboard');
const { ValidateModal } = require('../modals/validate');

async function openPaired(plugin, type) {
  const active = plugin.app.workspace.getActiveFile();
  if (!(active instanceof TFile)) {
    new Notice('Open a Scene or Manuscript file first.');
    return;
  }

  const nested = active.path.match(/^(.*\/Plot\/Book \d+)\/(Scenes|Manuscript)\/(Part \d+\/[^/]+\.md)$/i);
  if (nested) {
    const folder = type === 'scene' ? 'Scenes' : 'Manuscript';
    const target = plugin.app.vault.getAbstractFileByPath(nested[1] + '/' + folder + '/' + nested[3]);
    if (!(target instanceof TFile)) return new Notice('Paired file is missing.');
    await plugin.app.workspace.getLeaf(false).openFile(target); return;
  }
  const targetFolder = type === 'scene' ? 'Scenes' : 'Manuscript';
  const sourcePattern = type === 'scene' ? /\/Manuscript\/([^/]+)\.md$/i : /\/Scenes\/([^/]+)\.md$/i;
  const match = active.path.match(sourcePattern);

  if (!match) {
    if (new RegExp(`/${targetFolder}/[^/]+\\.md$`, 'i').test(active.path)) {
      new Notice(`This is already the ${type} file.`);
    } else {
      new Notice(`Open the paired ${type === 'scene' ? 'Manuscript' : 'Scene'} file first.`);
    }
    return;
  }

  const bookDir = active.path.replace(/\/(?:Scenes|Manuscript)\/[^/]+\.md$/i, '');
  const targetPath = normalizePath(`${bookDir}/${targetFolder}/${match[1]}.md`);
  const target = plugin.app.vault.getAbstractFileByPath(targetPath);

  if (!(target instanceof TFile)) {
    new Notice(`Paired ${type} file is missing: ${targetPath}`);
    return;
  }

  await plugin.app.workspace.getLeaf(false).openFile(target);
}

async function validateBook(plugin) {
  const dashboard = await chooseDashboard(plugin);
  if (!dashboard) return;

  const info = bookInfo(dashboard.path);
  const project = await require('../services/project').readProject(plugin,info.projectDir);
  if (project) {
    const lines = await require('../lib/validation').validateProject(plugin,info.projectDir);
    new ValidateModal(plugin.app,lines,'Validate Book (including project ownership)').open(); return;
  }
  let rows;
  try {
    rows = parseRows(await plugin.app.vault.read(dashboard));
  } catch (error) {
    new Notice(`Validation failed: ${error.message}`);
    return;
  }

  const lines = [];
  let problems = 0;
  const seen = new Set();

  for (const row of rows) {
    const sceneWiki = parseWiki(row.sceneLink);
    const manuscriptWiki = parseWiki(row.manuscriptLink);
    const title = sceneWiki.label || basename(sceneWiki.path) || manuscriptWiki.label || basename(manuscriptWiki.path);
    if (!title) {
      problems++;
      lines.push({ ok: false, text: 'A Dashboard row has no scene title.' });
      continue;
    }

    const key = title.toLocaleLowerCase();
    if (seen.has(key)) {
      problems++;
      lines.push({ ok: false, text: `Duplicate Dashboard scene: ${title}` });
    }
    seen.add(key);

    for (const [folder, link] of [['Scenes', row.sceneLink], ['Manuscript', row.manuscriptLink]]) {
      const path = normalizePath(linkedFilePath(info.bookDir, link, folder, title));
      if (!(plugin.app.vault.getAbstractFileByPath(path) instanceof TFile)) {
        problems++;
        lines.push({ ok: false, text: `Missing ${folder === 'Scenes' ? 'scene' : 'manuscript'}: ${title}` });
      }
    }
  }

  if (!rows.length) lines.push({ ok: true, text: 'Dashboard has no scene rows yet.' });
  else if (!problems) lines.push({ ok: true, text: `${rows.length} scene pairs validated successfully.` });
  else lines.unshift({ ok: false, text: `${problems} problem${problems === 1 ? '' : 's'} found across ${rows.length} Dashboard rows.` });

  new ValidateModal(plugin.app, lines).open();
}

module.exports = { openPaired, validateBook };

},
"commands/part-scenes.js": function (require, module, exports) {
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

},
"commands/parts.js": function (require, module, exports) {
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

},
"commands/project.js": function (require, module, exports) {
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

},
"commands/scene.js": function (require, module, exports) {
const { Notice, TFile } = require('obsidian');

const { SceneModal } = require('../modals/scene');

const {
  DeleteSceneModal
} = require('../modals/delete-scene');

const {
  cleanTitle,
  bookInfo,
  parseRows,
  replaceRows,
  extractLinks,
  parseWiki,
  basename,
  stripOrderPrefix
} = require('../lib/dashboard');

const {
  sceneTemplate,
  manuscriptTemplate
} = require('../lib/templates');

const {
  createMissing
} = require('../services/files');

const {
  chooseDashboard,
  applyDashboardFile,
  resolvePairPath
} = require('./dashboard');


async function newScene(plugin) {
  const activeFile = plugin.app.workspace.getActiveFile();
  const d = await chooseDashboard(plugin, {sceneContext:true,activeFile});

  if (!d) return;

  if (await require('./part-scenes').create(plugin,d,{activeFile})) return;

  const I = bookInfo(d.path);

  new SceneModal(plugin.app, async v => {
    const title = cleanTitle(v.title);

    const sp = `${I.bookDir}/Scenes/${title}.md`;
    const mp = `${I.bookDir}/Manuscript/${title}.md`;

    if (
      plugin.app.vault.getAbstractFileByPath(sp) ||
      plugin.app.vault.getAbstractFileByPath(mp)
    ) {
      new Notice(
        'That scene already exists. Use a distinct title such as Pt 2.'
      );

      return;
    }

    const content =
      await plugin.app.vault.read(d);

    const rs =
      parseRows(content);

    const order =
      (rs.length + 1) * 100;

    const locations =
      extractLinks(v.locations);

    await createMissing(
      plugin,
      sp,
      sceneTemplate({
        ...I,
        ...v,
        title,
        locations,
        order
      })
    );

    await createMissing(
      plugin,
      mp,
      manuscriptTemplate({
        ...I,
        ...v,
        title,
        locations,
        order
      })
    );

    rs.push({
      sceneLink: `[[Scenes/${title}|${title}]]`,
      sceneStatus: v.sceneStatus,
      manuscriptLink: `[[Manuscript/${title}|${title}]]`,
      manuscriptStatus: v.manuscriptStatus,
      pov: v.pov ? `[[${v.pov}]]` : '',
      locations: locations.join(', '),
      chapter: v.chapter || ''
    });

    await plugin.app.vault.modify(
      d,
      replaceRows(content, rs)
    );

    await applyDashboardFile(
      plugin,
      d,
      false
    );

    const f =
      plugin.app.vault.getAbstractFileByPath(sp);

    if (f instanceof TFile) {
      await plugin.app.workspace
        .getLeaf(false)
        .openFile(f);
    }

    new Notice(`Created ${title}`);
  }).open();
}


async function deleteScene(plugin) {
  const d =
    await chooseDashboard(plugin);

  if (!d) return;

  if (await require('./part-scenes').remove(plugin,d)) return;

  let rows;

  try {
    const content =
      await plugin.app.vault.read(d);

    rows =
      parseRows(content);
  } catch (e) {
    console.error(
      'Writing System: could not read Dashboard',
      e
    );

    new Notice(
      `Could not read Dashboard: ${e.message}`
    );

    return;
  }

  if (!rows.length) {
    new Notice(
      'There are no scenes to delete.'
    );

    return;
  }

  new DeleteSceneModal(
    plugin.app,
    rows,
    async (selectedIndex, displayedTitle) => {
      try {
        /*
         * Re-read the Dashboard before deleting,
         * in case it changed while the modal was open.
         */
        const currentContent =
          await plugin.app.vault.read(d);

        const currentRows =
          parseRows(currentContent);

        const row =
          currentRows[selectedIndex];

        if (!row) {
          new Notice(
            'That scene is no longer in the Dashboard.'
          );

          return;
        }

        const I =
          bookInfo(d.path);

        const sceneWiki =
          parseWiki(row.sceneLink);

        const manuscriptWiki =
          parseWiki(row.manuscriptLink);

        const title = stripOrderPrefix(
          sceneWiki.label ||
          basename(sceneWiki.path) ||
          manuscriptWiki.label ||
          basename(manuscriptWiki.path) ||
          displayedTitle
        );

        if (!title) {
          throw new Error(
            `Could not determine the scene title for row ${
              selectedIndex + 1
            }.`
          );
        }

        const scenePath =
          resolvePairPath(
            plugin,
            I.bookDir,
            row.sceneLink,
            'Scenes',
            title
          );

        const manuscriptPath =
          resolvePairPath(
            plugin,
            I.bookDir,
            row.manuscriptLink,
            'Manuscript',
            title
          );

        const sceneFile =
          plugin.app.vault.getAbstractFileByPath(
            scenePath
          );

        const manuscriptFile =
          plugin.app.vault.getAbstractFileByPath(
            manuscriptPath
          );

        /*
         * Remove the selected Dashboard row.
         */
        currentRows.splice(
          selectedIndex,
          1
        );

        await plugin.app.vault.modify(
          d,
          replaceRows(
            currentContent,
            currentRows
          )
        );

        /*
         * Move files to Obsidian's local .trash.
         */
        if (sceneFile instanceof TFile) {
          await plugin.app.vault.trash(
            sceneFile,
            false
          );
        }

        if (
          manuscriptFile instanceof TFile
        ) {
          await plugin.app.vault.trash(
            manuscriptFile,
            false
          );
        }

        /*
         * Let the existing Dashboard logic handle
         * renumbering and index regeneration.
         */
        await applyDashboardFile(
          plugin,
          d,
          false
        );

        new Notice(
          `Deleted ${title}`
        );
      } catch (e) {
        console.error(
          'Writing System: delete scene failed',
          e
        );

        new Notice(
          `Could not delete scene: ${e.message}`
        );
      }
    }
  ).open();
}


module.exports = {
  newScene,
  deleteScene
};

},
"commands/working-draft.js": function (require, module, exports) {
const { Notice, TFile, normalizePath } = require('obsidian');
const { linkedFilePath } = require('../lib/dashboard');
const { stripManuscript, replaceManuscriptProse, parseWorkingDraft } = require('../lib/templates');
const { WorkingDraftSyncModal } = require('../modals/working-draft');

const normalized = value => String(value || '').replace(/\r\n/g, '\n').trim();

async function workingDraftToManuscript(plugin) {
  const draft = plugin.app.workspace.getActiveFile();
  if (!(draft instanceof TFile) || !/\/Compiled\/[^/]+ - Working Draft\.md$/i.test(draft.path)) {
    new Notice('Open a compiled “- Working Draft.md” file first.');
    return;
  }

  const bookDir = draft.path.replace(/\/Compiled\/[^/]+$/i, '');
  const draftContent = await plugin.app.vault.read(draft);
  const companion = await require('../services/working-draft').readDraftMetadata(plugin,draft.path);
  const sections = companion ? require('../lib/working-draft').parseMappedDraft(draftContent,companion.metadata,bookDir) : parseWorkingDraft(draftContent);
  const root = require('../services/project').rootFromPath(draft.path);
  const state = root ? await require('../services/reconciliation').readState(plugin,root) : null;
  const seen = new Set();
  if (!sections.length) {
    new Notice('This Working Draft has no linked scene headings.');
    return;
  }

  const changes = [];
  const missing = [];
  for (const section of sections) {
    const established = section.id && state?.scenes.find(s => s.id === section.id);
    const path = established ? established.manuscriptPath : normalizePath(linkedFilePath(bookDir, `[[${section.path}]]`, 'Manuscript', section.title));
    require('../lib/project').assertPath(path);
    if (seen.has(path.toLowerCase())) throw Error('Working Draft contains duplicate scene sections.');
    seen.add(path.toLowerCase());
    if (section.id && !established) throw Error('Working Draft references a deleted or unknown Scene.');
    if (!path.startsWith(bookDir + '/Manuscript/')) throw Error('This Working Draft contains a Scene moved to another Book. Preserve its edits and compile a new draft before syncing.');

    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      missing.push(section.title);
      continue;
    }
    const current = await plugin.app.vault.read(file);
    if (normalized(stripManuscript(current, section.title)) !== normalized(section.prose)) {
      changes.push({ title: section.title, path, file, current, prose: section.prose });
    }
  }

  if (!changes.length) {
    new Notice(missing.length
      ? `No manuscripts need updating. ${missing.length} linked file${missing.length === 1 ? ' is' : 's are'} missing.`
      : 'No manuscript changes found in this Working Draft.');
    return;
  }

  new WorkingDraftSyncModal(plugin.app, changes, require('./parts').guarded(async selected => {
    if (!selected.length) {
      new Notice('No manuscripts selected; nothing was updated.');
      return;
    }
    if (await plugin.app.vault.read(draft) !== draftContent) throw Error('Working Draft changed; reopen sync.');
    for (const change of selected) if (await plugin.app.vault.read(change.file) !== change.current) throw Error('Manuscript changed; reopen sync.');
    await require('../services/transactions').execute(plugin,{
      root,
      files:selected.map(change=>({source:change.path,target:change.path,before:change.current,after:replaceManuscriptProse(change.current,change.title,change.prose)})),
      folders:[],checks:[{path:draft.path,content:draftContent},...(companion ? [{path:companion.path,content:companion.content}] : [])]
    });
    const updated = selected.length;
    const missingText = missing.length ? ` ${missing.length} linked file${missing.length === 1 ? ' was' : 's were'} missing.` : '';
    new Notice(`Updated ${updated} Manuscript file${updated === 1 ? '' : 's'} from Working Draft.${missingText}`);
  })).open();
}

async function cleanWorkingDraft(plugin) {
  const draft = plugin.app.workspace.getActiveFile();
  if (!(draft instanceof TFile) || !/\/Compiled\/[^/]+ - Working Draft\.md$/i.test(draft.path)) throw Error('Open a compiled Working Draft first.');
  const content = await plugin.app.vault.read(draft);
  const result = require('../lib/working-draft').cleanLegacyDraft(content,draft.path,draft.path.replace(/\/Compiled\/[^/]+$/i,''));
  if (!result) { new Notice('No Writing System comments to remove.'); return; }
  await require('../services/working-draft').saveDraft(plugin,draft.path,result.content,result.metadata,[{path:draft.path,content}]);
  new Notice('Removed Working Draft sync comments. Draft edits were preserved.');
}

module.exports = { workingDraftToManuscript, cleanWorkingDraft };

},
"lib/compilation.js": function (require, module, exports) {
const { layout,parseBook }=require('./project');
const { readProject,rootFromPath }=require('../services/project');
async function compilationRows(plugin,d,text){
 const p=await readProject(plugin,rootFromPath(d.path));if(!p)return require('./dashboard').parseRows(text);
 await require('../commands/parts').requireApplied(plugin,p);
 const book=layout(p.model,p.root).find(b=>b.dir+'/Dashboard.md'===d.path);
 const parsed=parseBook(text,p.model.partsEnabled);
 if(p.model.partsEnabled&&JSON.stringify(parsed.parts)!==JSON.stringify(book.parts.map(p=>p.id)))throw Error('Dashboard Part order disagrees with Master. Apply Master Dashboard first.');
 if(p.model.partsEnabled){
  const owners=new Map();let previous=null,lastNumber=0;const seen=new Set();
  for(const row of parsed.rows){
   const value=String(row.chapter||'').trim();if(!value){previous=null;continue;}
   if(!/^[1-9]\d*$/.test(value))throw Error('Chapter must be a positive integer or blank.');
   if(owners.has(value)&&owners.get(value)!==row.partId)throw Error('A Chapter cannot span Parts.');owners.set(value,row.partId);
   if(value!==previous){if(seen.has(value)||Number(value)!==lastNumber+1)throw Error('Apply Dashboard to normalize chapter numbering before compiling.');seen.add(value);lastNumber=Number(value);previous=value;}
  }
 }
 return parsed.rows.map(row=>{const part=book.parts.find(p=>p.id===row.partId);return {...row,partHeading:part&&p.model.partHeadings!==false?`# Part ${part.number} — ${part.name}`:''};});
}
module.exports={compilationRows};

},
"lib/dashboard.js": function (require, module, exports) {
const START = '<!-- WRITING-SYSTEM:SCENES:START -->';
const END = '<!-- WRITING-SYSTEM:SCENES:END -->';

const dirname = p => p.split('/').slice(0, -1).join('/');
const basename = p => p.replace(/\.md$/i, '').split('/').pop();

function cleanTitle(raw) {
  return String(raw || '').trim().replace(/[\\/:*?"<>|]/g, ' - ').replace(/\s+/g, ' ');
}

function escapeTableCell(raw) {
  return String(raw || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function unescapeTableCell(raw) {
  return String(raw || '').replace(/\\\\/g, '\\').replace(/\\\|/g, '|').trim();
}

function parseWiki(raw) {
  raw = unescapeTableCell(raw);
  const m = String(raw || '').trim().match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (!m) return { path: '', label: String(raw || '').trim() };
  return { path: m[1].trim(), label: (m[2] || basename(m[1])).trim() };
}

function parseLinkedStatusCell(cell) {
  const text = unescapeTableCell(cell);
  const m = text.match(/^(\[\[[^\]]+\]\])(?:\s+\*\(([^)]+)\)\*)?$/);
  if (!m) return { link: text, status: '' };
  return { link: m[1].trim(), status: (m[2] || '').trim() };
}

function renderLinkedStatusCell(link, status) {
  return status ? `${link} *(${status})*` : link;
}

function splitTableRow(line) {
  let s = line.replace(/\s*<!-- scene:[a-f0-9]{32} -->\s*$/, '').trim();
  if (!s.startsWith('|')) return [];
  s = s.slice(1, s.endsWith('|') ? -1 : undefined);

  const out = [];
  let cur = '';
  let wikiDepth = 0;

  for (let i = 0; i < s.length; i++) {
    const pair = s.slice(i, i + 2);
    if (pair === '[[') {
      wikiDepth++;
      cur += pair;
      i++;
      continue;
    }
    if (pair === ']]' && wikiDepth > 0) {
      wikiDepth--;
      cur += pair;
      i++;
      continue;
    }
    if (s[i] === '|' && wikiDepth === 0 && s[i-1] !== '\\') {
      out.push(unescapeTableCell(cur));
      cur = '';
      continue;
    }
    cur += s[i];
  }
  out.push(unescapeTableCell(cur));
  return out;
}

function parseRows(content) {
  const a = content.indexOf(START);
  const b = content.indexOf(END);
  if (a < 0 || b < a) throw new Error('Dashboard scene-table markers are missing.');

  const lines = content.slice(a + START.length, b)
    .split(/\r?\n/)
    .filter(x => x.trim().startsWith('|'));

  if (!lines.length) return [];
  if(lines.length<2 || splitTableRow(lines[0]).map(x=>x.toLowerCase()).join('|')!=='#|scene|manuscript|pov|location(s)|chapter' || splitTableRow(lines[1]).length!==6 || splitTableRow(lines[1]).some(x=>!/^:?-{3,}:?$/.test(x)))throw Error('Dashboard table header or separator is malformed.');

  return lines.slice(2)
    .map(splitTableRow)
    .map(c => { if (c.length !== 6) throw new Error('Malformed Dashboard row; expected six columns.'); return c; })
    .map(c => {
      const scene = parseLinkedStatusCell(c[1]);
      const manuscript = parseLinkedStatusCell(c[2]);
      return {
        sceneLink: scene.link,
        sceneStatus: scene.status || 'Planned',
        manuscriptLink: manuscript.link,
        manuscriptStatus: manuscript.status || 'Not Started',
        pov: c[3] || '',
        locations: c[4] || '',
        chapter: c[5] || ''
      };
    });
}

function renderRows(rows) {
  return [
    '| # | Scene | Manuscript | POV | Location(s) | Chapter |',
    '| ---: | --- | --- | --- | --- | ---: |',
    ...rows.map((r, i) =>
      `| ${i + 1} | ${escapeTableCell(renderLinkedStatusCell(r.sceneLink, r.sceneStatus))} | ${escapeTableCell(renderLinkedStatusCell(r.manuscriptLink, r.manuscriptStatus))} | ${escapeTableCell(r.pov || '')} | ${escapeTableCell(r.locations || '')} | ${escapeTableCell(r.chapter || '')} |`
    )
  ].join('\n');
}

function replaceRows(content, rows) {
  const a = content.indexOf(START);
  const b = content.indexOf(END);
  if (a < 0 || b < a) throw new Error('Dashboard scene-table markers are missing.');
  const extra = require('./project').tableSurround(content.slice(a + START.length,b));
  return content.slice(0,a+START.length) + extra.before + renderRows(rows) + extra.after + content.slice(b);
}

function bookInfo(path) {
  const bookDir = dirname(path);
  const bookName = basename(bookDir);
  const m = bookName.match(/^Book\s+(\d+)$/i);
  const projectDir = dirname(dirname(bookDir));
  return {
    bookDir,
    bookName,
    bookNumber: m ? Number(m[1]) : '',
    projectDir,
    projectName: basename(projectDir)
  };
}

function workingTitleFromDashboard(content, info) {
  const text = String(content || '');

  const yamlMatch = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (yamlMatch) {
    const fmTitle = yamlMatch[1].match(/^\s*working_title\s*:\s*(.*?)\s*$/mi);
    if (fmTitle && fmTitle[1].trim()) {
      return fmTitle[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  const visible = text.match(/^\*\*Working Title:\*\*\s*(.*?)\s*$/mi);
  if (visible && visible[1].trim()) return visible[1].trim();

  return info.projectName || info.bookName;
}

function safeFilename(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, ' - ').trim();
}

function stripOrderPrefix(name) {
  return String(name || '').replace(/^\d{3,}\s+-\s+/, '').trim();
}

function numberedName(title, position, total) {
  const width = Math.max(3, String(Math.max(1, total)).length);
  return `${String(position).padStart(width, '0')} - ${stripOrderPrefix(title)}`;
}

function linkedFilePath(bookDir, link, folder, title) {
  const wiki = parseWiki(link);
  let linked = String(wiki.path || '').replace(/\.md$/i, '').trim();
  if (!linked) linked = `${folder}/${title}`;
  if (linked.startsWith(`${bookDir}/`)) return `${linked}.md`;
  if (!linked.includes('/')) linked = `${folder}/${linked}`;
  return `${bookDir}/${linked}.md`;
}

function extractLinks(cell) {
  const found = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(String(cell || '')))) found.push(`[[${m[1].trim()}]]`);
  if (found.length) return found;
  return String(cell || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => x.startsWith('[[') ? x : `[[${x}]]`);
}

function firstLinkName(cell) {
  const links = extractLinks(cell);
  if (!links.length) return String(cell || '').trim();
  return links[0].replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
}

module.exports = {
  START, END, dirname, basename, cleanTitle, parseWiki, parseRows, renderRows,
  replaceRows, bookInfo, workingTitleFromDashboard, safeFilename,
  stripOrderPrefix, numberedName, linkedFilePath, extractLinks, firstLinkName
};

},
"lib/project.js": function (require, module, exports) {
const { parseRows, renderRows, START, END } = require('./dashboard');
const MASTER_START = '<!-- WRITING-SYSTEM:PROJECT:START -->';
const MASTER_END = '<!-- WRITING-SYSTEM:PROJECT:END -->';
function id() { return require('crypto').randomBytes(16).toString('hex'); }
function assertPath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error(`Unsafe path: ${path}`);
  return path;
}
function region(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < a || text.indexOf(start, a + start.length) !== -1 || text.indexOf(end, b + end.length) !== -1) throw Error('Missing or duplicate managed markers.');
  return { before: text.slice(0, a + start.length), body: text.slice(a + start.length, b), after: text.slice(b) };
}
function validateModel(model) {
  if (model.version !== 1 || typeof model.partsEnabled !== 'boolean' || !Array.isArray(model.books) || !model.books.length || (model.partHeadings !== undefined && typeof model.partHeadings !== 'boolean')) throw Error('Unsupported project format.');
  const ids = new Set();
  const unique = value => { if (!/^[a-f0-9]{32}$/.test(value || '') || ids.has(value)) throw Error('Missing or duplicate stable identity.'); ids.add(value); };
  unique(model.id);
  model.books.forEach(book => {
    unique(book.id);
    if (typeof book.title !== 'string' || /[\r\n]/.test(book.title) || !Array.isArray(book.parts)) throw Error('Invalid Book.');
    book.parts.forEach(part => { unique(part.id); if (typeof part.name !== 'string' || !part.name.trim() || /[\r\n]/.test(part.name)) throw Error('Part needs a one-line descriptive name.'); });
    if (!model.partsEnabled && book.parts.length) throw Error('Flat projects cannot contain Parts.');
  });
  return model;
}
function parseMaster(text) {
  const body = region(text, MASTER_START, MASTER_END).body.trim();
  const match = body.match(/```json\s*\n([\s\S]*?)\n```$/);
  if (!match || (body.match(/```json/g) || []).length !== 1) throw Error('Master Dashboard requires exactly one managed JSON definition.');
  return validateModel(JSON.parse(match[1]));
}
function renderMaster(model, text = '# Master Dashboard\n\nBooks and Parts are ordered by their position in the definition. Keep IDs unchanged. Edit titles and Part names here, then Apply Master Dashboard.\n\n' + MASTER_START + '\n' + MASTER_END + '\n') {
  validateModel(model);
  const r = region(text, MASTER_START, MASTER_END);
  const outline = layout(model,'').map(book => `## Book ${book.number} — ${book.title}\n\n` + book.parts.map(p => `- Part ${p.number} — ${p.name}`).join('\n')).join('\n\n');
  return r.before + '\n\n' + outline + '\n\nEdit the definition below; the outline above updates when applied.\n\n```json\n' + JSON.stringify(model, null, 2) + '\n```\n\n' + r.after;
}
function layout(model, root) {
  let number = 0;
  return model.books.map((b, i) => ({ ...b, number: i + 1, dir: `${root}/Plot/Book ${i + 1}`, parts: b.parts.map(p => ({ ...p, number: ++number })) }));
}
function parseBook(text, enabled) {
  if (!enabled) return { rows: parseRows(text), parts: [] };
  const r = region(text, START, END);
  const chunks = r.body.split(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/);
  if (chunks[0].trim()) throw Error('Scenes must belong to a Part section.');
  const parts = [], rows = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const partId = chunks[i];
    if (parts.includes(partId)) throw Error('Duplicate Part section.');
    parts.push(partId);
    const chunk = chunks[i + 1];
    const parsed = parseRows(START + '\n' + chunk + '\n' + END);
    const identities = chunk.split(/\r?\n/).filter(line => line.trim().startsWith('|')).slice(2).map(line => line.match(/<!-- scene:([a-f0-9]{32}) -->/)?.[1] || '');
    parsed.forEach((row, index) => rows.push({ ...row, partId, id: identities[index] || '' }));
    if (identities.length !== parsed.length) throw Error('Malformed Part table.');
  }
  return { rows, parts };
}
function tableSurround(text) {
  const matches = [...text.matchAll(/^\|.*$/gm)];
  if (!matches.length) return {before:text,after:''};
  const first=matches[0], last=matches[matches.length-1];
  const middle=text.slice(first.index,last.index+last[0].length);
  if(middle.split(/\r?\n/).some(line=>line.trim()&&!line.trim().startsWith('|')))throw Error('Custom text between table rows must be moved outside the table before Apply.');
  return {before:text.slice(0,first.index),after:text.slice(last.index+last[0].length)};
}
function renderBook(text, rows, book, enabled, inheritedChunks = new Map()) {
  if (!enabled) return require('./dashboard').replaceRows(text, rows);
  const r = region(text, START, END);
  const oldChunks = new Map(inheritedChunks);
  const split = r.body.split(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/);
  for (let i=1;i<split.length;i+=2) oldChunks.set(split[i],split[i+1]);
  const legacy = split.length === 1 ? tableSurround(r.body) : null;
  const body = book.parts.map((part,partIndex) => {
    const subset = rows.filter(row => row.partId === part.id);
    const lines = renderRows(subset).split('\n');
    for (let i = 2; i < lines.length; i++) lines[i] += subset[i - 2].id ? ` <!-- scene:${subset[i - 2].id} -->` : '';
    const old=oldChunks.get(part.id);
    const extra=old?tableSurround(old.replace(/^## Part \d+[^\n]*\n?/m,'')):partIndex===0&&legacy?legacy:{before:'',after:''};
    return `<!-- WRITING-SYSTEM:PART:${part.id} -->\n## Part ${part.number} — ${part.name}\n${extra.before.trim()?'\n'+extra.before.trim()+'\n':''}\n${lines.join('\n')}${extra.after.trim()?'\n\n'+extra.after.trim():''}`;
  }).join('\n\n');
  return r.before + '\n\n' + body + '\n\n' + r.after;
}
module.exports = { id, assertPath, region, validateModel, parseMaster, renderMaster, layout, parseBook, renderBook, tableSurround };

},
"lib/templates.js": function (require, module, exports) {
function sceneTemplate(x) {
  const pov = x.pov ? `\n  - "[[${x.pov}]]"` : '';
  const locations = (x.locations || []).length ? '\n' + x.locations.map(v => `  - "${v}"`).join('\n') : '';
  const manuscriptTarget = x.manuscriptTarget || `Manuscript/${x.title}`;
  return `---
tags:
  - scene
book: ${x.bookName}
book_number: ${x.bookNumber}
story_order: ${x.order}
chapter:
status: ${x.sceneStatus || 'Planned'}
pov:${pov}
locations:${locations}
manuscript: "[[${manuscriptTarget}]]"
characters:
races:
---

# ${x.title}

## Purpose

Why does this scene exist?

What changes because of this scene?

---

## Setup

Where are we?

Who is present?

What is happening before the scene begins?

---

## Scene

Describe what actually happens.

Focus on story beats rather than prose.

---

## Character Moments

How do the important characters change?

What do they learn?

What relationships develop?

---

## Worldbuilding

New lore introduced, if any.

---

## Emotional Beats

How should the reader feel?

---

## Foreshadowing

Future payoffs, reread details, and setup.

---

## Continuity Notes

Information Future Me needs.

---

## Manuscript Notes

Dialogue ideas, descriptions, moments, and lines worth keeping.

These are notes only, not polished prose.

---

## Manuscript

[[${manuscriptTarget}|Open manuscript]]
`;
}

function manuscriptTemplate(x) {
  const pov = x.pov ? `\n  - "[[${x.pov}]]"` : '';
  const locations = (x.locations || []).length ? '\n' + x.locations.map(v => `  - "${v}"`).join('\n') : '';
  const sceneTarget = x.sceneTarget || `Scenes/${x.title}`;
  return `---
tags:
  - manuscript
book: ${x.bookName}
book_number: ${x.bookNumber}
story_order: ${x.order}
chapter:
status: ${x.manuscriptStatus || 'Not Started'}
pov:${pov}
locations:${locations}
scene: "[[${sceneTarget}]]"
---

# ${x.title}

`;
}

function dashboardHelp() {
  return `> [!info]- Dashboard Help
> **This Dashboard is the single source of truth for this book.**
>
> ### New Scene
> Run **Writing System: New Scene**.
>
> This creates the Scene file, creates the matching Manuscript file, and adds a row here.
>
> ### Reorder Scenes
> Run **Writing System: Reorder Scenes**.
>
> Use the ↑ / ↓ buttons, then choose **Save order + apply**. This updates the Dashboard and writes the new \`story_order\` into both paired files.
>
> ### Update Scene Status
> Edit the status after the Scene link directly in this table.
>
> Example: \`[[Scenes/Meeting Darcy\\|Meeting Darcy]] *(Planned)*\` → \`[[Scenes/Meeting Darcy\\|Meeting Darcy]] *(Drafted)*\`
>
> ### Update Manuscript Status
> Edit the status after the Manuscript link the same way.
>
> Example: \`[[Manuscript/Meeting Darcy\\|Meeting Darcy]] *(Not Started)*\` → \`[[Manuscript/Meeting Darcy\\|Meeting Darcy]] *(Draft)*\`
>
> ### Update POV, Location(s), or Chapter
> Edit those cells directly in this table. Multiple locations may be comma-separated Wiki Links.
>
> When finished, run **Writing System: Apply Dashboard**.
>
> Dashboard-owned values are copied into both Scene and Manuscript frontmatter.
>
> ### Working Title
> Edit the **Working Title:** line near the top of this Dashboard. The outer project folder is the series/project name; Working Title is this individual book's title.
>
> ### Compile for Google Docs
> Run **Writing System: Compile Manuscript** to create \`Compiled/${'${bookName}'}.md\`.
>
> Or run **Writing System: Compile Manuscript and Copy to Clipboard** to paste directly into Google Docs.
`;
}

function dashboardTemplate(bookName, projectName = '') {
  return `---
tags:
  - book-dashboard
book: ${bookName}
---

# ${bookName} Dashboard

**Working Title:** ${projectName || ''}

<!-- WRITING-SYSTEM:SCENES:START -->

| # | Scene | Manuscript | POV | Location(s) | Chapter |
| ---: | --- | --- | --- | --- | ---: |

<!-- WRITING-SYSTEM:SCENES:END -->

${dashboardHelp().replace('${bookName}', bookName)}
`;
}

function sparkTemplate(name) {
  return `---
tags:
  - spark
project: "${name.replace(/"/g, '\\"')}"
status: Idea
---

# ${name}

## Premise

## Elevator Pitch

## Why This Idea Excites Me

## Genre

## Tone

## POV

## Themes

## Initial Characters

## Initial Locations

## Brain Dump

## Possible Ending

## Things I Don't Want to Forget
`;
}

function stripManuscript(content, title) {
  let body = String(content || '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, '');
  const e = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  body = body.replace(new RegExp(`^#\\s+${e}\\s*\\r?\\n+`, 'i'), '');
  return body.trim();
}

function replaceManuscriptProse(content, title, prose) {
  const source = String(content || '');
  const frontmatter = source.match(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/);
  const header = frontmatter ? `${frontmatter[0].trimEnd()}\n\n` : '';
  const body = String(prose || '').trim();
  return `${header}# ${title}\n${body ? `\n${body}\n` : '\n'}`;
}

function parseWorkingDraft(content) {
  const sections = [];
  let current = null;
  let pendingId = null;

  const finish = () => {
    if (!current) return;
    current.prose = current.lines.join('\n').trim();
    delete current.lines;
    sections.push(current);
    current = null;
  };

  for (const line of String(content || '').replace(/\r\n/g, '\n').split('\n')) {
    const identity = line.match(/^<!-- WRITING-SYSTEM:DRAFT-SCENE:([a-f0-9]{32}) -->$/);
    if (identity) { finish(); pendingId = identity[1]; continue; }
    if (line === '<!-- WRITING-SYSTEM:DRAFT-END -->') { finish(); pendingId = null; continue; }
    const heading = line.match(/^###\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/);
    if (heading && (!current?.id || pendingId)) {
      finish();
      current = {
        id: pendingId,
        path: heading[1].trim(),
        title: (heading[2] || heading[1].split('/').pop()).trim(),
        lines: []
      };
      pendingId = null;
      continue;
    }
    if (current && !current.id && /^#\s+(?:Part\s+\d+\b|Chapter\b|Unassigned\s*$)/i.test(line)) {
      finish();
      continue;
    }
    if (current) current.lines.push(line);
  }
  finish();
  return sections;
}

module.exports = {
  sceneTemplate, manuscriptTemplate, dashboardTemplate, sparkTemplate,
  stripManuscript, replaceManuscriptProse, parseWorkingDraft
};

},
"lib/validation.js": function (require, module, exports) {
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

},
"lib/working-draft.js": function (require, module, exports) {
﻿const { linkedFilePath } = require('./dashboard');
const { assertPath } = require('./project');
const KIND = 'writing-system-working-draft';
const metadataPath = path => path.replace(/\.md$/i, '.sync.json');
const linkedHeading = line => line.match(/^###\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/);
const startMarker = line => line.match(/^<!-- WRITING-SYSTEM:DRAFT-SCENE:([a-f0-9]{32}) -->$/);
const endMarker = line => line === '<!-- WRITING-SYSTEM:DRAFT-END -->';
const structural = line => /^#\s+(?:Part\s+\d+\b|Chapter\b|Unassigned\s*$)/i.test(line);

function validateMetadata(value) {
  if (!value || value.kind !== KIND || value.version !== 1 || !Array.isArray(value.sections)) throw Error('Working Draft sync metadata is invalid.');
  assertPath(value.draftPath);
  const paths = new Set(), ids = new Set();
  for (const section of value.sections) {
    assertPath(section.path);
    if (paths.has(section.path) || !Array.isArray(section.before) || section.before.some(line => typeof line !== 'string' || /[\r\n]/.test(line))) throw Error('Working Draft sync metadata has duplicate Scenes or invalid headings.');
    paths.add(section.path);
    if (section.id) {
      if (!/^[a-f0-9]{32}$/.test(section.id) || ids.has(section.id)) throw Error('Working Draft sync metadata has invalid Scene IDs.');
      ids.add(section.id);
    }
  }
  if (value.trailing !== undefined && (!Array.isArray(value.trailing) || value.trailing.some(line => typeof line !== 'string'))) throw Error('Working Draft trailing metadata is invalid.');
  return value;
}

function stripSuffix(lines, expected) {
  let end = lines.length;
  for (let index = expected.length - 1; index >= 0; index--) {
    while (end && !lines[end - 1].trim()) end--;
    if (!end || lines[end - 1].trim() !== expected[index].trim()) throw Error('Working Draft structural headings changed. Keep the generated Part and Chapter headings with their Scene sections before syncing.');
    end--;
  }
  return lines.slice(0, end);
}

function fenceState(line, fence) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return fence;
  if (!fence) return match[1];
  if (match[1][0] === fence[0] && match[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) return null;
  return fence;
}

function parseMappedDraft(content, metadata, bookDir) {
  validateMetadata(metadata);
  const known = new Map(metadata.sections.map(section => [section.path, section]));
  const seen = new Set(), sections = [];
  let current = null, fence = null;
  function finish(before = []) {
    if (!current) return;
    current.prose = stripSuffix(current.lines, before).join('\n').trim();
    delete current.lines;
    sections.push(current);
    current = null;
  }
  for (const line of String(content).replace(/\r\n/g, '\n').split('\n')) {
    const nextFence = fenceState(line, fence);
    if (fence || nextFence) { if (current) current.lines.push(line); fence = nextFence; continue; }
    const heading = linkedHeading(line);
    if (heading) {
      const absolute = heading[1].trim().replace(/\.md$/i, '') + '.md';
      const path = known.has(absolute) ? absolute : linkedFilePath(bookDir, `[[${heading[1]}]]`, 'Manuscript', heading[2] || '');
      const record = known.get(path);
      if (!record) throw Error('Working Draft contains an unrecognized Scene heading. Preserve its edits and compile a fresh draft before syncing.');
      if (seen.has(path)) throw Error('Working Draft contains duplicate Scene sections.');
      finish(record.before);
      seen.add(path);
      current = { id: record.id || null, path: heading[1].trim(), title: (heading[2] || record.title || heading[1].split('/').pop()).trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  finish((metadata.trailing || []).filter(line => line.trim()));
  if (seen.size !== known.size) throw Error('A Working Draft Scene heading is missing. Restore the heading before syncing so prose cannot be assigned to the wrong Scene.');
  return sections;
}

function cleanLegacyDraft(content, draftPath, bookDir) {
  const output = [], sections = [];
  let pendingId = null, current = false, between = [], removed = 0, fence = null;
  for (const line of String(content).replace(/\r\n/g, '\n').split('\n')) {
    const nextFence = fenceState(line, fence);
    if (fence || nextFence) { output.push(line); fence = nextFence; continue; }
    const marker = startMarker(line);
    if (marker) {
      if (current || pendingId) throw Error('Working Draft comment boundaries are incomplete; no changes were made.');
      pendingId = marker[1]; removed++; continue;
    }
    if (endMarker(line)) {
      if (!current) throw Error('Working Draft contains an unmatched end comment; no changes were made.');
      current = false; between = []; removed++; continue;
    }
    const heading = linkedHeading(line);
    if (heading && !current) {
      sections.push({ id: pendingId, path: linkedFilePath(bookDir, `[[${heading[1]}]]`, 'Manuscript', heading[2] || ''), title: (heading[2] || heading[1].split('/').pop()).trim(), before: between.filter(structural) });
      current = true; pendingId = null; between = [];
    } else if (!current) between.push(line);
    output.push(line);
  }
  if (!removed) return null;
  if (current || pendingId) throw Error('Working Draft comment boundaries are incomplete; no changes were made.');
  const metadata = validateMetadata({ kind: KIND, version: 1, draftPath, sections, trailing: between });
  const cleaned = output.join('\n');
  parseMappedDraft(cleaned, metadata, bookDir);
  return { content: cleaned, metadata };
}

function remapMetadata(metadata, mapping) {
  validateMetadata(metadata);
  return { ...metadata, draftPath: mapping.get(metadata.draftPath) || metadata.draftPath, sections: metadata.sections.map(section => ({ ...section, path: mapping.get(section.path) || section.path })) };
}

module.exports = { KIND, metadataPath, validateMetadata, parseMappedDraft, cleanLegacyDraft, remapMetadata };

},
"modals/delete-scene.js": function (require, module, exports) {
const { Modal, Setting } = require('obsidian');

const {
  parseWiki,
  basename,
  stripOrderPrefix
} = require('../lib/dashboard');

class DeleteSceneModal extends Modal {
  constructor(app, rows, onConfirm) {
    super(app);

    this.rows = rows;
    this.onConfirm = onConfirm;
    this.selectedIndex = null;
  }

  onOpen() {
    this.render();
  }

  render() {
    this.contentEl.empty();

    this.contentEl.createEl('h2', {
      text: 'Delete Scene'
    });

    this.contentEl.createEl('p', {
      text: 'Select one scene to delete.'
    });

    const listEl = this.contentEl.createDiv({
      cls: 'writing-system-delete-scene-list'
    });

    this.rows.forEach((row, index) => {
      const wiki = parseWiki(row.sceneLink);

      const title = stripOrderPrefix(
        wiki.label || basename(wiki.path)
      );

      const setting = new Setting(listEl)
        .setName(title)
        .setDesc(`Scene ${index + 1}`);

      setting.addToggle(toggle => {
        toggle.setValue(index === this.selectedIndex);

        toggle.onChange(value => {
          if (value) {
            this.selectedIndex = index;
          } else if (this.selectedIndex === index) {
            this.selectedIndex = null;
          }

          this.render();
        });
      });
    });

    const actions = new Setting(this.contentEl);

    actions.addButton(button => {
      button
        .setButtonText('Cancel')
        .onClick(() => {
          this.close();
        });
    });

    actions.addButton(button => {
      button
        .setButtonText('Delete Scene')
        .setWarning()
        .setDisabled(this.selectedIndex === null)
        .onClick(() => {
          if (this.selectedIndex === null) {
            return;
          }

          const row = this.rows[this.selectedIndex];
          const wiki = parseWiki(row.sceneLink);

          const title = stripOrderPrefix(
            wiki.label || basename(wiki.path)
          );

          const index = this.selectedIndex;

          this.close();

          new ConfirmDeleteSceneModal(
            this.app,
            title,
            () => this.onConfirm(index, title)
          ).open();
        });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmDeleteSceneModal extends Modal {
  constructor(app, title, onConfirm) {
    super(app);

    this.title = title;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    this.contentEl.createEl('h2', {
      text: 'Delete Scene?'
    });

    this.contentEl.createEl('p', {
      text: this.title
    });

    this.contentEl.createEl('p', {
      text:
        'This will remove the scene from the Dashboard and move both its Scene and Manuscript files to Obsidian .trash.'
    });

    const actions = new Setting(this.contentEl);

    actions.addButton(button => {
      button
        .setButtonText('Cancel')
        .onClick(() => {
          this.close();
        });
    });

    actions.addButton(button => {
      button
        .setButtonText('Delete Scene')
        .setWarning()
        .onClick(async () => {
          this.close();
          await this.onConfirm();
        });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = {
  DeleteSceneModal,
  ConfirmDeleteSceneModal
};

},
"modals/parts.js": function (require, module, exports) {
const { Modal, Setting } = require('obsidian');
class Choices extends Modal {
  constructor(app,title,items,callback) { super(app); Object.assign(this,{title,items,callback}); }
  onOpen() { this.contentEl.createEl('h2',{text:this.title}); if(!this.items.length)this.contentEl.createEl('p',{text:'No available choices. Close this dialog to continue.'}); for(const item of this.items) new Setting(this.contentEl).setName(item.label).addButton(b=>b.setButtonText('Choose').onClick(()=>{this.close();this.callback(item.value);})); }
  onClose() { this.contentEl.empty(); }
}
class TextPrompt extends Modal {
  constructor(app,title,initial,callback) {super(app);Object.assign(this,{title,value:initial,callback});}
  onOpen(){this.contentEl.createEl('h2',{text:this.title});new Setting(this.contentEl).addText(t=>t.setValue(this.value).onChange(v=>this.value=v));new Setting(this.contentEl).addButton(b=>b.setButtonText('Continue').onClick(()=>{if(!this.value.trim())return;this.close();this.callback(this.value.trim());}));}
  onClose(){this.contentEl.empty();}
}
class Preview extends Modal {
  constructor(app,title,plan,callback){super(app);Object.assign(this,{title,plan,callback});}
  onOpen(){const e=this.contentEl;e.createEl('h2',{text:this.title});e.createEl('p',{text:'Review the complete file plan. Existing prose and custom Dashboard content are preserved.'});const list=e.createDiv({cls:'writing-system-change-list'});for(const op of this.plan.files)list.createEl('p',{text:op.source?(op.source===op.target?'Update '+op.target:op.source+' → '+op.target):'Create '+op.target});for(const path of this.plan.obsoleteFolders || []) if(!(this.plan.folders || []).includes(path)) list.createEl('p',{text:'Remove if empty: '+path});new Setting(e).addButton(b=>b.setButtonText('Cancel').onClick(()=>this.close())).addButton(b=>b.setButtonText('Apply').setCta().onClick(async()=>{this.close();await this.callback();}));}
  onClose(){this.contentEl.empty();}
}
module.exports={Choices,TextPrompt,Preview};

},
"modals/project.js": function (require, module, exports) {
const { Modal, Setting, Notice } = require('obsidian');

class ProjectModal extends Modal {
  constructor(app, cb) {
    super(app);
    this.cb = cb;
    this.v = { name: '', books: 1, optional: [], custom: '', parts: false };
  }
  onOpen() {
    const e = this.contentEl;
    e.createEl('h2', { text: 'New writing project' });
    new Setting(e).setName('Project name').setDesc('Existing work is preserved.')
      .addText(t => t.onChange(v => this.v.name = v.trim()));
    new Setting(e).setName('Starting books').setDesc('How many Book folders should exist right now?')
      .addText(t => {
        t.setValue('1');
        t.inputEl.type = 'number';
        t.inputEl.min = '1';
        t.onChange(v => this.v.books = Math.max(1, parseInt(v) || 1));
      });

    new Setting(e).setName('Use Parts throughout this project').setDesc('Start each Book with one Part. Existing projects use Enable Parts for Project instead.').addToggle(t=>t.onChange(v=>this.v.parts=v));
    e.createEl('h3', { text: 'Optional folders' });
    ['Animals','Species','Lore','Magic','Timeline','Research','Creatures','History','Cultures','Religions','Politics','Organizations','Artifacts','Languages','Plants','Food','Maps']
      .forEach(name => {
        new Setting(e).setName(name).addToggle(toggle => toggle.onChange(on => {
          if (on && !this.v.optional.includes(name)) this.v.optional.push(name);
          if (!on) this.v.optional = this.v.optional.filter(x => x !== name);
        }));
      });

    new Setting(e).setName('Additional folders').setDesc('Comma-separated, optional.')
      .addText(t => t.onChange(v => this.v.custom = v));

    const actions = e.createDiv({ cls: 'writing-system-modal-actions' });
    new Setting(actions)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setButtonText('Create / complete project').setCta().onClick(async () => {
        if (!this.v.name) return new Notice('Project name is required.');
        this.close();
        await this.cb(this.v);
      }));
  }
  onClose() { this.contentEl.empty(); }
}

module.exports = { ProjectModal };

},
"modals/reorder.js": function (require, module, exports) {
const { Modal, Setting } = require('obsidian');
const { parseWiki, basename } = require('../lib/dashboard');

class ReorderModal extends Modal {
  constructor(app, rows, onSave, title = 'Reorder scenes') {
    super(app);
    this.rows = rows.map(r => ({...r}));
    this.onSave = onSave;
    this.title = title;
  }
  name(row) {
    const x = parseWiki(row.sceneLink);
    return x.label || basename(x.path) || row.sceneLink;
  }
  draw() {
    const e = this.contentEl;
    e.empty();
    e.createEl('h2', { text:this.title });
    e.createEl('p', { text:'Use ↑ / ↓. Save order + apply updates the Dashboard and paired files.' });
    this.rows.forEach((row, i) => {
      const wrap = e.createDiv({ cls:'writing-system-reorder-row' });
      const up = wrap.createEl('button', { text:'↑' });
      const down = wrap.createEl('button', { text:'↓' });
      wrap.createDiv({ cls:'writing-system-reorder-title', text:this.name(row) });
      up.disabled = i === 0;
      down.disabled = i === this.rows.length - 1;
      up.onclick = () => { [this.rows[i-1], this.rows[i]] = [this.rows[i], this.rows[i-1]]; this.draw(); };
      down.onclick = () => { [this.rows[i+1], this.rows[i]] = [this.rows[i], this.rows[i+1]]; this.draw(); };
    });
    const actions = e.createDiv({ cls:'writing-system-modal-actions' });
    new Setting(actions)
      .addButton(b=>b.setButtonText('Cancel').onClick(()=>this.close()))
      .addButton(b=>b.setButtonText('Save order + apply').setCta().onClick(async()=>{
        const rows = this.rows;
        this.close();
        await this.onSave(rows);
      }));
  }
  onOpen(){ this.draw(); }
  onClose(){ this.contentEl.empty(); }
}

module.exports = { ReorderModal };

},
"modals/scene.js": function (require, module, exports) {
const { Modal, Setting, Notice } = require('obsidian');

class SceneModal extends Modal {
  constructor(app, cb, options = {}) {
    super(app);
    this.cb = cb;
    this.parts = options.parts || [];
    this.v = {
      title: "",
      partId: options.selectedPartId || this.parts[0]?.id || "",
      pov: "",
      locations: "",
      chapter: "",
      sceneStatus: "Planned",
      manuscriptStatus: "Not Started"
    };
  }

  onOpen() {
    const e = this.contentEl;
    this.modalEl.addClass("writing-system-scene-modal");
    e.createEl("h2", { text: "New scene" });

    if(this.parts.length){
      new Setting(e).setName('Part').addDropdown(dropdown=>{
        for(const part of this.parts)dropdown.addOption(part.id,'Part '+part.number+' \u2014 '+part.name);
        dropdown.setValue(this.v.partId).onChange(value=>this.v.partId=value);
      });
    }
    let titleInput;

    new Setting(e)
      .setName("Title")
      .addText(t => {
        titleInput = t.inputEl;
        t.onChange(v => this.v.title = v.trim());
      });

    new Setting(e)
      .setName("POV")
      .setDesc("Character page name; may be blank.")
      .addText(t => t.onChange(v => this.v.pov = v.trim()));

    new Setting(e)
      .setName("Location(s)")
      .setDesc("Comma-separated Wiki Links or names.")
      .addText(t => t.onChange(v => this.v.locations = v.trim()));

    new Setting(e)
      .setName("Chapter")
      .setDesc("Optional; may stay blank.")
      .addText(t => t.onChange(v => this.v.chapter = v.trim()));

    e.createEl("p", {
      text: "New scenes start as Planned / Not Started. Change either status later in the Dashboard."
    });

    const create = async () => {
      if (!this.v.title) {
        new Notice("Title is required.");
        return;
      }
      this.close();
      await this.cb(this.v);
    };

    titleInput?.addEventListener("keydown", ev => {
      if (ev.key === "Enter") create();
    });

    const actions = e.createDiv({ cls: "writing-system-modal-actions" });

    new Setting(actions)
      .addButton(b =>
        b.setButtonText("Cancel")
          .onClick(() => this.close())
      )
      .addButton(b =>
        b.setButtonText("Create scene pair")
          .setCta()
          .onClick(create)
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = { SceneModal };

},
"modals/validate.js": function (require, module, exports) {
const { Modal } = require('obsidian');

class ValidateModal extends Modal {
  constructor(app, lines, title = 'Validate Book') { super(app); this.lines = lines; this.title = title; }
  onOpen() {
    this.contentEl.createEl('h2', { text:this.title });
    this.lines.forEach(x => {
      const p = this.contentEl.createEl('p', { text:x.text });
      p.addClass(x.ok ? 'writing-system-validation-ok' : 'writing-system-validation-warn');
    });
  }
  onClose(){ this.contentEl.empty(); }
}

module.exports = { ValidateModal };

},
"modals/working-draft.js": function (require, module, exports) {
const { Modal, Setting } = require('obsidian');

class WorkingDraftSyncModal extends Modal {
  constructor(app, changes, onUpdate) {
    super(app);
    this.changes = changes;
    this.onUpdate = onUpdate;
    this.checkboxes = [];
  }

  onOpen() {
    const root = this.contentEl;
    root.addClass('writing-system-working-draft-modal');
    root.createEl('h2', { text: 'Working Draft to Manuscript' });
    root.createEl('p', {
      text: 'Only the checked Manuscript files will be replaced with prose from this Working Draft.'
    });

    const controls = root.createDiv({ cls: 'writing-system-selection-controls' });
    const selectAll = controls.createEl('button', { text: 'Select all' });
    const selectNone = controls.createEl('button', { text: 'Select none' });
    selectAll.onclick = () => this.setAll(true);
    selectNone.onclick = () => this.setAll(false);

    const list = root.createDiv({ cls: 'writing-system-change-list' });
    this.changes.forEach((change, index) => {
      const row = list.createDiv({ cls: 'writing-system-change-row' });
      const checkbox = row.createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.id = `writing-system-change-${index}`;
      const label = row.createEl('label', { text: change.title });
      label.htmlFor = checkbox.id;
      row.createDiv({ cls: 'writing-system-change-path', text: change.path });
      this.checkboxes.push({ checkbox, change });
    });

    const actions = root.createDiv({ cls: 'writing-system-modal-actions' });
    new Setting(actions)
      .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(button => button.setButtonText('Update selected').setCta().onClick(async () => {
        const selected = this.checkboxes.filter(item => item.checkbox.checked).map(item => item.change);
        this.close();
        await this.onUpdate(selected);
      }));
  }

  setAll(checked) {
    this.checkboxes.forEach(item => { item.checkbox.checked = checked; });
  }

  onClose() {
    this.checkboxes = [];
    this.contentEl.empty();
  }
}

module.exports = { WorkingDraftSyncModal };

},
"services/files.js": function (require, module, exports) {
const { normalizePath, TFile } = require('obsidian');
const { dirname } = require('../lib/dashboard');

async function ensureFolder(plugin, path) {
  require('../lib/project').assertPath(path);
  path = normalizePath(path);
  if (!path) return;
  let cur = '';
  for (const part of path.split('/')) {
    cur = cur ? `${cur}/${part}` : part;
    const existing = plugin.app.vault.getAbstractFileByPath(cur);
    if (existing instanceof TFile) throw Error('File blocks folder: ' + cur);
    if (!existing) await plugin.app.vault.createFolder(cur);
  }
}

async function createMissing(plugin, path, content) {
  path = normalizePath(path);
  if (plugin.app.vault.getAbstractFileByPath(path)) return false;
  await ensureFolder(plugin, dirname(path));
  await plugin.app.vault.create(path, content);
  return true;
}

async function folderIsEmpty(plugin, folder) {
  if (!folder?.children) return false;
  // Vault folder children can lag behind a completed rename; verify disk contents.
  if (plugin.app.vault.adapter?.list) {
    const listing = await plugin.app.vault.adapter.list(folder.path);
    return listing.files.length === 0 && listing.folders.length === 0;
  }
  return folder.children.length === 0;
}

module.exports = { ensureFolder, createMissing, folderIsEmpty };

},
"services/project.js": function (require, module, exports) {
const { TFile, parseYaml, stringifyYaml } = require('obsidian');
const { parseMaster, layout, id, renderMaster } = require('../lib/project');
function frontmatter(text) { const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/); return m ? parseYaml(m[1]) || {} : {}; }
function updateFrontmatter(text, values) {
  const re = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const fm = frontmatter(text);
  Object.assign(fm, values);
  if('story_order' in values)delete fm.scene_order;
  return '---\n' + stringifyYaml(fm).trimEnd() + '\n---\n' + text.replace(re, '');
}
function rootFromPath(path) { const m = path.match(/^(.*)\/Plot(?:\/|$)/); return m ? m[1] : null; }
async function readProject(plugin, root) {
  const path = `${root}/Plot/Master Dashboard.md`;
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const text = await plugin.app.vault.read(file);
  return { root, path, text, expectedMasterText: text, model: parseMaster(text) };
}
async function discover(plugin, root) {
  const books = plugin.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(root + '/Plot/') && /^Book \d+\/Dashboard\.md$/.test(f.path.slice((root + '/Plot/').length))).sort((a,b) => Number(a.path.match(/Book (\d+)/)[1]) - Number(b.path.match(/Book (\d+)/)[1]));
  if (!books.length) throw Error('No Book Dashboards found in this project.');
  const model = { version: 1, id: id(), partsEnabled: false, partHeadings: true, books: [] };
  for (const book of books) model.books.push({ id: id(), title: book.path.match(/Book \d+/)[0], parts: [] });
  return { root, path: `${root}/Plot/Master Dashboard.md`, text: null, expectedMasterText: null, model };
}
module.exports = { frontmatter, updateFrontmatter, rootFromPath, readProject, discover };

},
"services/reconciliation.js": function (require, module, exports) {
const { TFile } = require('obsidian');
const { id, layout, parseBook, renderBook, renderMaster, assertPath, validateModel } = require('../lib/project');
const { parseWiki, basename, stripOrderPrefix, numberedName, linkedFilePath, bookInfo, firstLinkName, extractLinks } = require('../lib/dashboard');
const { dashboardTemplate, sceneTemplate, manuscriptTemplate } = require('../lib/templates');
const { frontmatter, updateFrontmatter } = require('./project');
const { validatePlan } = require('./transactions');
const statePath = root => `${root}/Plot/Writing System State.json`;
async function readState(plugin, root) {
  const f = plugin.app.vault.getAbstractFileByPath(statePath(root));
  if (!(f instanceof TFile)) return null;
  const value=JSON.parse(await plugin.app.vault.read(f));
  validateModel(value.model);
  if(!Array.isArray(value.scenes))throw Error('Invalid applied project state.');
  return value;
}
function rewriteLinks(plugin, text, source, target, mapping) {
  function resolve(raw) {
    const hash = raw.indexOf('#');
    const anchor = hash >= 0 ? raw.slice(hash) : '';
    const name = hash >= 0 ? raw.slice(0, hash) : raw;
    if (!name || /^[a-z]+:\/\//i.test(name)) return raw;
    const extension = /\.[a-z0-9]+$/i.test(name) ? '' : '.md';
    const book = source.match(/^(.*\/Plot\/Book \d+)\//);
    const candidates = [name + extension, source.split('/').slice(0,-1).join('/') + '/' + name + extension];
    if (book) candidates.unshift(book[1] + '/' + name + extension);
    const exact = candidates.find(p => mapping.has(p));
    const resolved = exact || plugin.app.metadataCache.getFirstLinkpathDest(name, source)?.path;
    if (!resolved) return raw;
    const newPath = mapping.get(resolved) || resolved;
    if (newPath !== resolved || source !== target) return newPath.replace(/\.md$/i, '') + anchor;
    return raw;
  }
  return text.replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (_, path, label) => { const escaped=label&&path.endsWith('\\');return `[[${resolve(escaped?path.slice(0,-1):path)}${escaped?'\\':''}${label || ''}]]`; })
    .replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (all, prefix, link, suffix) => {
      let decoded; try { decoded = decodeURIComponent(link); } catch { return all; }
      let next = resolve(decoded); if(next===decoded)return all;
      if(/\.md(?:#|$)/i.test(decoded)&&!/\.md(?:#|$)/i.test(next)){const hash=next.indexOf('#');next=hash<0?next+'.md':next.slice(0,hash)+'.md'+next.slice(hash);}
      return prefix + next.replace(/ /g, '%20') + suffix;
    });
}
async function buildPlan(plugin, project, options = {}) {
  const vault = plugin.app.vault, root = project.root, desired = project.model;
  validateModel(desired);
  const state = await readState(plugin, root);
  if(desired.partsEnabled&&!state&&!options.migration)throw Error('Parts require applied identity records. Use Enable Parts for Project, or restore Writing System State.json if it was lost.');
  const oldModel = state ? state.model : options.baseline || desired;
  if(oldModel.id!==desired.id)throw Error('Project identity cannot be changed.');
  if (state && oldModel.partsEnabled !== desired.partsEnabled && !options.migration) throw Error('Use Enable Parts for Project to change Parts mode.');
  if (oldModel.partsEnabled && !desired.partsEnabled) throw Error('Disabling Parts requires a separate migration and is not supported.');
  for (const book of desired.books) {
    const moved = book.parts.filter(p=>oldModel.books.some(b=>b.id!==book.id&&b.parts.some(old=>old.id===p.id)));
    book.parts=book.parts.filter(p=>!moved.some(m=>m.id===p.id)).concat(moved);
  }
  const oldBooks = layout(oldModel, root), books = layout(desired, root);
  for (const old of oldBooks) {
    if (!books.some(b => b.id === old.id)) throw Error('Removing an existing Book is not supported; its files are preserved.');
    for (const part of old.parts) if (!books.some(b => b.parts.some(p => p.id === part.id))) throw Error('Removing an existing Part is not supported; move its scenes explicitly first.');
  }
  const expectedPartDirs = new Set(oldBooks.flatMap(b=>b.parts.flatMap(p=>['Scenes','Manuscript'].map(folder=>b.dir+'/'+folder+'/Part '+p.number))));
  const leftoverFolders = [];
  for(const f of vault.getAllLoadedFiles()) {
    if(f.path.startsWith(root+'/Plot/') && /\/(?:Scenes|Manuscript)\/Part \d+$/.test(f.path) && !expectedPartDirs.has(f.path)) {
      if (!await require('./files').folderIsEmpty(plugin,f)) throw Error('Unrecognized Part folder must be resolved before Apply: '+f.path);
      leftoverFolders.push(f.path);
    }
  }
  const snapshot = new Map();
  for (const f of vault.getFiles().filter(f => f.path.startsWith(root + '/'))) {
    snapshot.set(f.path, { file: f, text: /\.(?:md|json)$/i.test(f.path) ? await vault.read(f) : undefined });
  }
  if ('expectedMasterText' in project && (snapshot.get(project.path)?.text ?? null) !== project.expectedMasterText) throw Error('Master Dashboard changed; reopen the command.');
  const inheritedChunks = new Map();
  const rows = [], dashboards = new Map(), known = new Map((state?.scenes || []).map(s => [s.id, s]));
  if (options.sceneMove && (!desired.partsEnabled || !known.has(options.sceneMove.id) || !books.some(book=>book.parts.some(part=>part.id===options.sceneMove.partId)))) throw Error('Unknown Scene or destination Part in this project.');
  const usedSceneIds = new Set(), usedSources = new Set();
  for (const oldBook of oldBooks) {
    const path = oldBook.dir + '/Dashboard.md';
    const original = snapshot.get(path)?.text;
    if (original === undefined) throw Error(`Missing Dashboard: ${path}`);
    dashboards.set(oldBook.id, original);
    if (oldModel.partsEnabled) { const body = require('../lib/project').region(original,require('../lib/dashboard').START,require('../lib/dashboard').END).body; const chunks=body.split(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/); for(let i=1;i<chunks.length;i+=2)inheritedChunks.set(chunks[i],chunks[i+1]); }
    const parsed = parseBook(original, oldModel.partsEnabled);
    if (oldModel.partsEnabled && JSON.stringify(parsed.parts) !== JSON.stringify(oldBook.parts.map(p => p.id))) throw Error(`Part sections disagree with applied Master: ${path}`);
    const input = options.rows?.get(oldBook.id) || parsed.rows;
    const chapterParts = new Map();
    if (oldModel.partsEnabled) {
      for (const part of oldBook.parts) for (const folder of ['Scenes','Manuscript']) {
        const path = oldBook.dir + '/' + folder + '/Part ' + part.number + '/Part Identity.json';
        if (snapshot.has(path)) {
          const marker = JSON.parse(snapshot.get(path).text);
          if (marker.partId !== part.id || marker.bookId !== oldBook.id || marker.projectId !== oldModel.id) throw Error('Conflicting Part ownership: ' + path);
        }
      }
      for (const row of input) if (String(row.chapter || '').trim()) {
        const key = String(row.chapter).trim();
        if (chapterParts.has(key) && chapterParts.get(key) !== row.partId) throw Error('A Chapter cannot span Parts.');
        chapterParts.set(key,row.partId);
      }
    }
    for (const raw of input) {
      const row = { ...raw, oldBookId: oldBook.id };
      const sw = parseWiki(row.sceneLink);
      row.title = stripOrderPrefix(sw.label || basename(sw.path));
      if (!row.title) throw Error('A Scene has no title.');
      assertPath(row.title + '.md');
      if (row.title.includes('/')) throw Error('Scene title cannot contain a path.');
      row.sceneSource = linkedFilePath(oldBook.dir, row.sceneLink, 'Scenes', row.title);
      row.manuscriptSource = linkedFilePath(oldBook.dir, row.manuscriptLink, 'Manuscript', row.title);
      for (const [field, folder] of [['sceneSource','Scenes'],['manuscriptSource','Manuscript']]) {
        assertPath(row[field]);
        if (!row[field].startsWith(oldBook.dir + '/' + folder + '/')) throw Error('Individual Scenes cannot move between Books.');
        if (!oldModel.partsEnabled && !snapshot.has(row[field])) {
          const matches = [...snapshot.keys()].filter(p => p.startsWith(oldBook.dir + '/' + folder + '/') && p.split('/').length === row[field].split('/').length && stripOrderPrefix(basename(p)) === row.title);
          if (matches.length > 1) throw Error(`Ambiguous pair: ${row.title}`);
          if (matches.length === 1) row[field] = matches[0];
        }
      }
      const sf = snapshot.get(row.sceneSource), mf = snapshot.get(row.manuscriptSource);
      const previous = [...known.values()].find(s => s.scenePath === row.sceneSource || s.manuscriptPath === row.manuscriptSource);
      row.id = row.id || previous?.id || (sf ? frontmatter(sf.text).writing_scene_id : '') || id();
      if (usedSceneIds.has(row.id)) throw Error('Duplicate Scene identity.'); usedSceneIds.add(row.id);
      const established = known.get(row.id);
      if (established && established.bookId !== oldBook.id) throw Error('Individual Scenes cannot move between Books.');
      if ((!!sf !== !!mf) || ((!sf || !mf) && established)) throw Error(`Incomplete existing pair: ${row.title}`);
      for (const source of [row.sceneSource,row.manuscriptSource]) {
        if (usedSources.has(source.toLowerCase())) throw Error(`Duplicate pair source: ${source}`); usedSources.add(source.toLowerCase());
      }
      if (sf && mf) {
        if(stripOrderPrefix(basename(row.sceneSource))!==stripOrderPrefix(basename(row.manuscriptSource)))throw Error('Scene and Manuscript filenames do not form a pair: '+row.title);
        const a = frontmatter(sf.text), b = frontmatter(mf.text);
        if ((a.writing_scene_id && a.writing_scene_id !== row.id) || (b.writing_scene_id && b.writing_scene_id !== row.id)) throw Error(`Pair identity disagreement: ${row.title}`);
      }
      if (options.migration) row.partId = books.find(b => b.id === oldBook.id).parts[0]?.id;
      if (options.sceneMove?.id === row.id) { row.partId = options.sceneMove.partId; row.chapter = ''; }
      if (desired.partsEnabled && !row.partId) throw Error('Every Scene requires a Part.');
      if (oldModel.partsEnabled && established && established.partId !== row.partId && options.sceneMove?.id !== row.id && !options.migration) throw Error('Use Move Scene to Part to change Scene ownership.');
      const owner = desired.partsEnabled ? books.find(b => b.parts.some(p => p.id === row.partId)) : books.find(b => b.id === oldBook.id);
      if (!owner) throw Error(`Unknown Part for ${row.title}`);

      row.bookId = owner.id;
      rows.push(row);
    }
  }
  for (const scene of known.values()) if (!usedSceneIds.has(scene.id) && scene.id !== options.deleteId) throw Error('An existing Scene row was removed. Use Delete Scene rather than removing rows.');
  for (const [path] of snapshot) if (/\/(?:Scenes|Manuscript)\/(?:Part \d+\/)?[^/]+\.md$/i.test(path) && !usedSources.has(path.toLowerCase()) && !(options.deleteId && [known.get(options.deleteId)?.scenePath,known.get(options.deleteId)?.manuscriptPath].includes(path))) throw Error(`Unlisted Scene/Manuscript file must be resolved before Apply: ${path}`);
  const mapping = new Map();
  const sourceFolders=vault.getAllLoadedFiles().filter(f=>f.children&&f.path.startsWith(root+'/')&&!leftoverFolders.includes(f.path)).map(f=>f.path);
  for (const path of [...snapshot.keys(),...sourceFolders]) {
    const oldBook = oldBooks.find(b => path.startsWith(b.dir + '/'));
    if (!oldBook) { mapping.set(path, path); continue; }
    const nextBook = books.find(b => b.id === oldBook.id);
    let target = nextBook.dir + path.slice(oldBook.dir.length);
    for (const part of oldBook.parts) for (const folder of ['Scenes','Manuscript']) {
      const prefix = `${oldBook.dir}/${folder}/Part ${part.number}`;
      if (path === prefix || path.startsWith(prefix + '/')) {
        const owner = books.find(b => b.parts.some(p => p.id === part.id));
        const next = owner.parts.find(p => p.id === part.id);
        target = `${owner.dir}/${folder}/Part ${next.number}` + path.slice(prefix.length);
      }
    }
    mapping.set(path, target);
  }
  if (options.deleteId) {
    const deleted = known.get(options.deleteId);
    if (!deleted || !snapshot.has(deleted.scenePath) || !snapshot.has(deleted.manuscriptPath)) throw Error('Cannot delete an incomplete pair.');
    mapping.set(deleted.scenePath, deleted.scenePath);
    mapping.set(deleted.manuscriptPath, deleted.manuscriptPath);
  }
  const output = new Map(), folders = sourceFolders.map(path=>mapping.get(path)), sceneState = [];
  const obsoleteFolders=sourceFolders.filter(path=>mapping.get(path)!==path).concat(leftoverFolders);
  for (const book of books) {
    let ordered = desired.partsEnabled ? book.parts.flatMap(p => rows.filter(r => r.bookId === book.id && r.partId === p.id)) : rows.filter(r => r.bookId === book.id);
    if (options.sceneMove) ordered = ordered.filter(r => r.id !== options.sceneMove.id).concat(ordered.filter(r => r.id === options.sceneMove.id));
    if (desired.partsEnabled) ordered = book.parts.flatMap(p => ordered.filter(r => r.partId === p.id));
    let chapter = 0, current = null;
    const seenChapter = new Set();
    const counters = new Map();
    for (let index = 0; index < ordered.length; index++) {
      const row = ordered[index], part = book.parts.find(p => p.id === row.partId);
      const countKey = part?.id || book.id;
      const position = (counters.get(countKey) || 0) + 1; counters.set(countKey, position);
      const total = ordered.filter(r => (r.partId || book.id) === countKey).length;
      const name = numberedName(row.title, position, total);
      const suffix = part ? `/Part ${part.number}` : '';
      const sp = `${book.dir}/Scenes${suffix}/${name}.md`, mp = `${book.dir}/Manuscript${suffix}/${name}.md`;
      mapping.set(row.sceneSource, sp); mapping.set(row.manuscriptSource, mp);
      const ch = String(row.chapter || '').trim();
      if (desired.partsEnabled && ch) {
        if (!/^[1-9]\d*$/.test(ch)) throw Error('Chapter must be a positive integer or blank.');
        const token = `${row.oldBookId}:${row.partId}:${ch}`;
        if (token !== current) { if (seenChapter.has(token)) throw Error('Chapter Scenes must be contiguous.'); seenChapter.add(token); chapter++; current = token; }
        row.chapter = String(chapter);
      } else if (!ch) current = null;
      const info = bookInfo(book.dir + '/Dashboard.md');
      const values = { writing_project_id: desired.id, writing_book_id: book.id, writing_scene_id: row.id, book: info.bookName, book_number: book.number, story_order: (index + 1) * 100, chapter: row.chapter ? Number(row.chapter) || row.chapter : '', pov: firstLinkName(row.pov) ? [`[[${firstLinkName(row.pov)}]]`] : [], locations: extractLinks(row.locations) };
      if (part) Object.assign(values, { writing_part_id: part.id, part_number: part.number, part_name: part.name, part_order: position * 100 });
      for (const [source,target,type,pair] of [[row.sceneSource,sp,'scene',mp],[row.manuscriptSource,mp,'manuscript',sp]]) {
        const old = snapshot.get(source);
        const template = type === 'scene' ? sceneTemplate : manuscriptTemplate;
        let text = old?.text ?? template({ ...info, title: row.title, order: values.story_order, locations: values.locations });
        const fm = frontmatter(text);
        const tags = [...new Set([...(Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []), type])];
        const owned = { ...values, tags, status: type === 'scene' ? row.sceneStatus || 'Planned' : row.manuscriptStatus || 'Not Started', [type === 'scene' ? 'manuscript' : 'scene']: `[[${pair.replace(/\.md$/, '')}]]` };
        text = updateFrontmatter(text, owned);
        output.set(target, { source: old ? source : null, target, before: old?.text, after: text, pairValues: owned });
      }
      row.sceneLink = `[[${sp.replace(/\.md$/, '')}|${row.title}]]`;
      row.manuscriptLink = `[[${mp.replace(/\.md$/, '')}|${row.title}]]`;
      sceneState.push({ id: row.id, bookId: book.id, partId: row.partId || null, scenePath: sp, manuscriptPath: mp });
    }
    const old = oldBooks.find(b => b.id === book.id), source = old ? old.dir + '/Dashboard.md' : null;
    let text = dashboards.get(book.id) || dashboardTemplate(`Book ${book.number}`, book.title);
    text = renderBook(text, ordered, book, desired.partsEnabled, inheritedChunks);
    text = text.replace(/^# Book \d+ Dashboard$/m, '# Book '+book.number+' Dashboard');
    text = updateFrontmatter(text, { writing_project_id: desired.id, writing_book_id: book.id, book: `Book ${book.number}` });
    output.set(book.dir + '/Dashboard.md', { source, target: book.dir + '/Dashboard.md', before: source ? snapshot.get(source)?.text : undefined, after: text });
    for (const folder of ['Scenes','Manuscript','Compiled']) folders.push(book.dir + '/' + folder);
    for (const part of book.parts) for (const folder of ['Scenes','Manuscript']) {
      const dir = `${book.dir}/${folder}/Part ${part.number}`; folders.push(dir);
      const target = dir + '/Part Identity.json';
      const source = [...mapping.entries()].find(([s,t]) => t === target)?.[0] || null;
      output.set(target, { source, target, before: source ? snapshot.get(source)?.text : undefined, after: JSON.stringify({ projectId: desired.id, bookId: book.id, partId: part.id }) });
    }
    for (const [filename, field] of [['Scene Index.md','sceneLink'],['Manuscript Index.md','manuscriptLink']]) {
      const target = book.dir + '/' + filename;
      const source = old && snapshot.has(old.dir + '/' + filename) ? old.dir + '/' + filename : null;
      const after = `---\ngenerated_from: Dashboard\n---\n\n# ${filename.replace('.md','')}\n\n` + (desired.partsEnabled ? book.parts.map(p => `## Part ${p.number} — ${p.name}\n\n` + ordered.filter(r => r.partId === p.id).map(r => '- ' + r[field]).join('\n')).join('\n\n') : ordered.map(r => '- ' + r[field]).join('\n')) + '\n';
      if (source && !/generated_from: Dashboard/.test(snapshot.get(source).text)) throw Error(`Refusing to replace an unrecognized index: ${source}`);
      output.set(target,{source,target,before:source?snapshot.get(source).text:undefined,after});
    }
  }
  const deleted=options.deleteId?known.get(options.deleteId):null;
  const deletedPaths=deleted?[deleted.scenePath,deleted.manuscriptPath]:[];
  for (const [source, item] of snapshot) {
    if(deletedPaths.includes(source))continue;
    const target = mapping.get(source);
    if (!output.has(target)) output.set(target,{source,target,before:item.text,after:item.text});
  }
  const master = project.path;
  output.set(master,{source:snapshot.has(master)?master:null,target:master,before:snapshot.get(master)?.text,after:renderMaster(desired,project.text || undefined)});
  const stateFile = statePath(root);
  output.set(stateFile,{source:snapshot.has(stateFile)?stateFile:null,target:stateFile,before:snapshot.get(stateFile)?.text,after:JSON.stringify({model:desired,scenes:sceneState},null,2)});
  for (const op of output.values()) {
    if (op.target.endsWith('.sync.json') && typeof op.after === 'string') {
      let metadata;
      try { metadata = JSON.parse(op.after); } catch { metadata = null; }
      const draftTools = require('../lib/working-draft');
      if (metadata?.kind === draftTools.KIND) op.after = JSON.stringify(draftTools.remapMetadata(metadata,mapping),null,2);
    }
    if (!/\.md$/i.test(op.target) || op.after === undefined) continue;
    if (op.pairValues) {
      const original = op.before === undefined ? op.after : op.before;
      op.after = updateFrontmatter(rewriteLinks(plugin,original,op.source || op.target,op.target,mapping),op.pairValues);
      delete op.pairValues;
    } else if (op.target.endsWith('/Dashboard.md')) {
      const { START, END } = require('../lib/dashboard');
      const a = op.after.indexOf(START), b = op.after.indexOf(END) + END.length;
      let noteSource=op.source || op.target;
      const managed=op.after.slice(a,b).split('\n').map(line=>{
        const part=line.match(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/);
        if(part){const owner=oldBooks.find(book=>book.parts.some(p=>p.id===part[1]));noteSource=owner?owner.dir+'/Dashboard.md':op.source || op.target;}
        return line.trim().startsWith('|')?line:rewriteLinks(plugin,line,noteSource,op.target,mapping);
      }).join('\n');
      op.after = rewriteLinks(plugin,op.after.slice(0,a),op.source || op.target,op.target,mapping) + managed + rewriteLinks(plugin,op.after.slice(b),op.source || op.target,op.target,mapping);
    } else if (!/\/(?:Master Dashboard|Scene Index|Manuscript Index)\.md$/.test(op.target)) {
      op.after = rewriteLinks(plugin,op.after,op.source || op.target,op.target,mapping);
    }
  }
  // Incoming links from notes outside this project are included in the same transaction.
  for (const f of vault.getMarkdownFiles().filter(f => !f.path.startsWith(root + '/'))) {
    const before = await vault.read(f), after = rewriteLinks(plugin,before,f.path,f.path,mapping);
    if (after !== before) output.set(f.path,{source:f.path,target:f.path,before,after});
  }
  const files = [...output.values()].filter(op => op.trash || !op.source || op.source !== op.target || op.before !== op.after);
  for(const path of deletedPaths)files.push({source:path,target:root+'/Writing System Deleted '+id()+'/'+path.split('/').pop(),before:snapshot.get(path).text,trash:true});
  const checks = [...snapshot].filter(([path,item]) => item.text !== undefined).map(([path,item]) => ({path,content:item.text}));
  const inventory = [...snapshot.keys()].sort();
  const plan = {root,files,folders:[...new Set(folders)],checks,inventory,obsoleteFolders}; validatePlan(plugin,plan); return plan;
}
module.exports = { buildPlan, readState, statePath, rewriteLinks };

},
"services/recovery.js": function (require, module, exports) {
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

},
"services/transactions.js": function (require, module, exports) {
const { TFile } = require('obsidian');
const { assertPath, id } = require('../lib/project');
const { ensureFolder, folderIsEmpty } = require('./files');
const locks = new Set();
const key = p => p.normalize('NFC').toLowerCase();
function validatePlan(plugin, plan) {
  const sources = new Set(), targets = new Set();
  for (const op of plan.files) {
    assertPath(op.target);
    if (op.source) { assertPath(op.source); if (sources.has(key(op.source))) throw Error(`Duplicate source: ${op.source}`); sources.add(key(op.source)); }
    if (targets.has(key(op.target))) throw Error(`Duplicate destination: ${op.target}`);
    targets.add(key(op.target));
  }
  const all = plugin.app.vault.getAllLoadedFiles();
  for (const op of plan.files) {
    const occupant = all.find(f => key(f.path) === key(op.target));
    if (occupant && (!(occupant instanceof TFile) || !sources.has(key(occupant.path)))) throw Error(`Occupied destination: ${op.target}`);
    const pieces = op.target.split('/'); pieces.pop();
    while (pieces.length) {
      if(targets.has(key(pieces.join('/'))))throw Error('Planned file blocks folder: '+pieces.join('/'));
      const parent = all.find(f => key(f.path) === key(pieces.join('/')));
      if (parent instanceof TFile) throw Error(`File blocks folder: ${parent.path}`);
      pieces.pop();
    }
  }
  for (const dir of plan.folders || []) {
    assertPath(dir);
    if(targets.has(key(dir)))throw Error('Planned file blocks folder: '+dir);
    const occupant = all.find(f => key(f.path) === key(dir));
    if (occupant instanceof TFile) throw Error(`File blocks folder: ${dir}`);
  }
}
async function execute(plugin, plan) {
  const vault = plugin.app.vault;
  const journalPath = `${plan.root}/Writing System Operation.json`;
  if (locks.has(plan.root)) throw Error('Another project operation is running.');
  if (vault.getAbstractFileByPath(journalPath)) throw Error('An interrupted operation needs recovery. Run Recover Writing Project.');
  locks.add(plan.root);
  const createdFolders = [];
  let journal;
  let committed = false;
  try {
    validatePlan(plugin, plan);
    if (plan.inventory && JSON.stringify(vault.getFiles().filter(f=>f.path.startsWith(plan.root+'/')).map(f=>f.path).sort()) !== JSON.stringify(plan.inventory)) throw Error('Project files changed since planning; reopen the operation.');
    for (const check of plan.checks || []) {
      const f = vault.getAbstractFileByPath(check.path);
      if (!(f instanceof TFile) || await vault.read(f) !== check.content) throw Error(`Changed since planning: ${check.path}`);
    }
    for (const op of plan.files) {
      if (op.source) {
        const f = vault.getAbstractFileByPath(op.source);
        if (!(f instanceof TFile)) throw Error(`Missing source: ${op.source}`);
        if (op.before !== undefined && await vault.read(f) !== op.before) throw Error(`Changed since planning: ${op.source}`);
      }
    }
    const stamp = id();
    plan.files.forEach((op, i) => { if (op.source && op.source !== op.target) op.temp = `${plan.root}/Writing System Staging ${stamp}/${i}`; });
    await ensureFolder(plugin, plan.root);
    journal = await vault.create(journalPath, JSON.stringify({ ...plan, status: 'running', phase: 'staging' }));
    const folder = async path => {
      if(!path)return;
      let current = '';
      for (const segment of path.split('/')) {
        current = current ? current + '/' + segment : segment;
        if (!vault.getAbstractFileByPath(current)) { await vault.createFolder(current); createdFolders.push(current); }
      }
    };
    for (const op of plan.files.filter(x => x.temp)) {
      await folder(op.temp.split('/').slice(0, -1).join('/'));
      const f = vault.getAbstractFileByPath(op.source);
      await vault.rename(f, op.temp);
    }
    await vault.modify(journal, JSON.stringify({ ...plan, status: 'running', phase: 'writing' }));
    for (const dir of plan.folders || []) await folder(dir);
    for (const op of plan.files) {
      await folder(op.target.split('/').slice(0, -1).join('/'));
      if (op.source) {
        const f = vault.getAbstractFileByPath(op.temp || op.source);
        if (op.temp) await vault.rename(f, op.target);
        if (op.trash) { await vault.trash(f,false); continue; }
        if (op.after !== undefined && op.after !== op.before) await vault.modify(f, op.after);
      } else {
        await vault.create(op.target, op.after || '');
      }
    }
    await vault.modify(journal, JSON.stringify({ ...plan, status: 'complete' }));
    committed = true;
    await vault.delete(journal);
    // Only remove empty folders under the project. Never recursively delete user content.
    const dirs = vault.getAllLoadedFiles().filter(f => f.children && f.path.startsWith(plan.root + '/')).sort((a,b) => b.path.length - a.path.length);
    for (const dir of dirs) if (!(plan.folders || []).includes(dir.path)) {
      if ((plan.obsoleteFolders || []).includes(dir.path) || /\/Writing System (?:Staging |Deleted )|\/(?:Scenes|Manuscript)\/Part \d+$/.test(dir.path)) { if (await folderIsEmpty(plugin,dir)) await vault.delete(dir); }
    }
  } catch (error) {
    if (committed) throw Error('Changes completed; cleanup requires attention: ' + error.message);
    if (journal) {
      try {
        const recovery=require('./recovery');
        await recovery.recover(plugin,await recovery.inspectRecovery(plugin,plan.root));
        for (const path of createdFolders.reverse()) { const f=vault.getAbstractFileByPath(path); if(f?.children&&!f.children.length)await vault.delete(f); }
      } catch (rollback) { throw Error(`${error.message}; recovery required: ${rollback.message}. Originals and move plan are saved in ${journalPath}`); }
    }
    throw error;
  } finally { locks.delete(plan.root); }
}
module.exports = { validatePlan, execute };

},
"services/working-draft.js": function (require, module, exports) {
﻿const { TFile } = require('obsidian');
const { metadataPath, validateMetadata } = require('../lib/working-draft');
const { rootFromPath } = require('./project');
const { execute } = require('./transactions');

async function readDraftMetadata(plugin, draftPath) {
  const path = metadataPath(draftPath);
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!file) return null;
  if (!(file instanceof TFile)) throw Error('A folder occupies the Working Draft sync metadata path.');
  const content = await plugin.app.vault.read(file);
  const metadata = validateMetadata(JSON.parse(content));
  if (metadata.draftPath !== draftPath) throw Error('Working Draft sync metadata belongs to a different draft.');
  return { path, content, metadata };
}

async function saveDraft(plugin, draftPath, content, metadata, checks = []) {
  validateMetadata(metadata);
  if (metadata.draftPath !== draftPath) throw Error('Working Draft metadata path mismatch.');
  const vault = plugin.app.vault;
  const previous = await readDraftMetadata(plugin, draftPath);
  const file = vault.getAbstractFileByPath(draftPath);
  if (file && !(file instanceof TFile)) throw Error('A folder occupies the Working Draft path.');
  const before = file ? await vault.read(file) : undefined;
  const path = metadataPath(draftPath);
  await execute(plugin, {
    root: rootFromPath(draftPath),
    folders: [draftPath.split('/').slice(0, -1).join('/')],
    checks,
    files: [
      { source: file ? draftPath : null, target: draftPath, before, after: content },
      { source: previous ? path : null, target: path, before: previous?.content, after: JSON.stringify(metadata, null, 2) }
    ]
  });
  return vault.getAbstractFileByPath(draftPath);
}

module.exports = { readDraftMetadata, saveDraft };

}
};
const __cache = Object.create(null);

function __resolve(from, request) {
  const base = from.split('/').slice(0, -1);
  for (const part of request.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  const candidate = base.join('/');
  if (__modules[candidate]) return candidate;
  if (__modules[candidate + '.js']) return candidate + '.js';
  if (__modules[candidate + '/index.js']) return candidate + '/index.js';
  throw new Error('Writing System bundle cannot resolve "' + request + '" from "' + from + '".');
}

function __load(id) {
  if (__cache[id]) return __cache[id].exports;
  const factory = __modules[id];
  if (!factory) throw new Error('Writing System bundle module is missing: ' + id);
  const module = { exports: {} };
  __cache[id] = module;
  const localRequire = request => !request.startsWith('.')
    ? __externalRequire(request)
    : __load(__resolve(id, request));
  factory(localRequire, module, module.exports);
  return module.exports;
}

module.exports = __load('main.source.js');
