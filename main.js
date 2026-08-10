/* Writing System v2.1.0 - generated bundle. Edit source modules, then rebuild. */
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
    rs = parseRows(dashboardContent);
  } catch (e) {
    new Notice(`Compile failed: ${e.message}`);
    return;
  }

  const bodyParts = [];
  const chapterMap = new Map();
  const hasChapter = rs.some(r => String(r.chapter || '').trim());
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
    const rows = parseRows(dashboardContent);
    const bodyParts = [];
    const hasChapter = rows.some(row => String(row.chapter || '').trim());
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

      const prose = stripManuscript(await plugin.app.vault.read(manuscript), title);
      if (!prose) {
        empty++;
        continue;
      }

      const chapter = String(row.chapter || '').trim();
      if (hasChapter && chapter !== currentChapter) {
        bodyParts.push(chapter ? `# Chapter ${chapter}` : '# Unassigned');
        currentChapter = chapter;
      }

      const manuscriptLink = manuscriptPath.slice(info.bookDir.length + 1).replace(/\.md$/i, '');
      bodyParts.push(`### [[${manuscriptLink}|${title}]]\n\n${prose}`);
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
    await ensureFolder(plugin, outDir);
    const outputName = safeFilename(`${workingTitle} - Working Draft`) || `${info.bookName} - Working Draft`;
    const outPath = normalizePath(`${outDir}/${outputName}.md`);
    let output = plugin.app.vault.getAbstractFileByPath(outPath);
    if (output instanceof TFile) await plugin.app.vault.modify(output, full);
    else output = await plugin.app.vault.create(outPath, full);

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

async function chooseDashboard(plugin) {
  const active = plugin.app.workspace.getActiveFile();
  if (active && /\/Plot\/Book \d+\/Dashboard\.md$/i.test(active.path)) return active;
  if (active) {
    const bookMatch = active.path.match(/^(.*\/Plot\/Book \d+)(?:\/.*)?$/i);
    if (bookMatch) {
      const nearby = plugin.app.vault.getAbstractFileByPath(`${bookMatch[1]}/Dashboard.md`);
      if (nearby instanceof TFile) return nearby;
    }
  }
  const ds = dashboards(plugin);
  if (!ds.length) { new Notice('No writing Dashboard.md found.'); return null; }
  if (ds.length === 1) return ds[0];
  return await new Promise(resolve => {
    const app = plugin.app;
    class Pick extends Modal {
      constructor() {
        super(app);
        this.resolved = false;
      }
      onOpen() {
        this.contentEl.createEl('h2', { text:'Choose dashboard' });
        ds.forEach(f => new Setting(this.contentEl).setName(f.path)
          .addButton(b=>b.setButtonText('Use').onClick(()=>{
            this.resolved = true;
            this.close();
            resolve(f);
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
      sceneSource: normalizePath(linkedFilePath(I.bookDir, r.sceneLink, 'Scenes', title)),
      manuscriptSource: normalizePath(linkedFilePath(I.bookDir, r.manuscriptLink, 'Manuscript', title)),
      scenePath: normalizePath(`${I.bookDir}/Scenes/${numbered}.md`),
      manuscriptPath: normalizePath(`${I.bookDir}/Manuscript/${numbered}.md`)
    };
  });

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
    await plugin.app.fileManager.renameFile(move.file, move.temp);
  }
  for (const move of moves) await plugin.app.fileManager.renameFile(move.file, move.destination);
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

module.exports = { dashboards, chooseDashboard, openDashboard, reorderScenes, applyDashboard, applyDashboardFile, regenerateIndexes };

},
"commands/index.js": function (require, module, exports) {
const { newProject } = require('./project');
const { openDashboard, reorderScenes, applyDashboard } = require('./dashboard');
const { newScene } = require('./scene');
const { compile, compileWorkingDraft } = require('./compile');
const { openPaired, validateBook } = require('./navigation');

function registerCommands(plugin) {
  plugin.addCommand({ id:'new-project', name:'New Project', callback:()=>newProject(plugin) });
  plugin.addCommand({ id:'open-dashboard', name:'Open Dashboard', callback:()=>openDashboard(plugin) });
  plugin.addCommand({ id:'new-scene', name:'New Scene', callback:()=>newScene(plugin) });
  plugin.addCommand({ id:'reorder-scenes', name:'Reorder Scenes', callback:()=>reorderScenes(plugin) });
  plugin.addCommand({ id:'apply-dashboard', name:'Apply Dashboard', callback:()=>applyDashboard(plugin) });
  plugin.addCommand({ id:'compile-manuscript', name:'Compile Manuscript', callback:()=>compile(plugin, false) });
  plugin.addCommand({ id:'compile-copy', name:'Compile Manuscript and Copy to Clipboard', callback:()=>compile(plugin, true) });
  plugin.addCommand({ id:'compile-working-draft', name:'Compile Working Draft', callback:()=>compileWorkingDraft(plugin) });
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
"commands/project.js": function (require, module, exports) {
const { Notice, TFile, normalizePath } = require('obsidian');
const { ProjectModal } = require('../modals/project');
const { sparkTemplate, dashboardTemplate } = require('../lib/templates');
const { ensureFolder, createMissing } = require('../services/files');

function newProject(plugin) {
  new ProjectModal(plugin.app, async v => {
    const root = normalizePath(`Writing/${v.name}`);
    await ensureFolder(plugin, root);
    const folders = [
      'Characters','Locations','Plot','Assets','Templates',
      ...v.optional,
      ...String(v.custom).split(',').map(x=>x.trim()).filter(Boolean)
    ];
    for (const f of folders) await ensureFolder(plugin, `${root}/${f}`);
    await createMissing(plugin, `${root}/Spark.md`, sparkTemplate(v.name));
    for (let i=1; i<=v.books; i++) {
      const b = `${root}/Plot/Book ${i}`;
      for (const f of ['Scenes','Manuscript','Compiled']) await ensureFolder(plugin, `${b}/${f}`);
      await createMissing(plugin, `${b}/Dashboard.md`, dashboardTemplate(`Book ${i}`, v.name));
    }
    new Notice(`Writing project ready: ${v.name}`);
    const spark = plugin.app.vault.getAbstractFileByPath(`${root}/Spark.md`);
    if (spark instanceof TFile) await plugin.app.workspace.getLeaf(false).openFile(spark);
  }).open();
}

module.exports = { newProject };

},
"commands/scene.js": function (require, module, exports) {
const { Notice, TFile } = require('obsidian');
const { SceneModal } = require('../modals/scene');
const { cleanTitle, bookInfo, parseRows, replaceRows, extractLinks } = require('../lib/dashboard');
const { sceneTemplate, manuscriptTemplate } = require('../lib/templates');
const { createMissing } = require('../services/files');
const { chooseDashboard, applyDashboardFile } = require('./dashboard');

async function newScene(plugin) {
  const d = await chooseDashboard(plugin);
  if (!d) return;
  const I = bookInfo(d.path);
  new SceneModal(plugin.app, async v => {
    const title = cleanTitle(v.title);
    const sp = `${I.bookDir}/Scenes/${title}.md`;
    const mp = `${I.bookDir}/Manuscript/${title}.md`;
    if (plugin.app.vault.getAbstractFileByPath(sp) || plugin.app.vault.getAbstractFileByPath(mp)) {
      new Notice('That scene already exists. Use a distinct title such as Pt 2.');
      return;
    }
    const content = await plugin.app.vault.read(d);
    const rs = parseRows(content);
    const order = (rs.length + 1) * 100;
    const locations = extractLinks(v.locations);
    await createMissing(plugin, sp, sceneTemplate({...I, ...v, title, locations, order}));
    await createMissing(plugin, mp, manuscriptTemplate({...I, ...v, title, locations, order}));
    rs.push({
      sceneLink:`[[Scenes/${title}|${title}]]`,
      sceneStatus:v.sceneStatus,
      manuscriptLink:`[[Manuscript/${title}|${title}]]`,
      manuscriptStatus:v.manuscriptStatus,
      pov:v.pov ? `[[${v.pov}]]` : '',
      locations:locations.join(', '),
      chapter:v.chapter || ''
    });
    await plugin.app.vault.modify(d, replaceRows(content, rs));
    await applyDashboardFile(plugin, d, false);
    const f = plugin.app.vault.getAbstractFileByPath(sp);
    if (f instanceof TFile) await plugin.app.workspace.getLeaf(false).openFile(f);
    new Notice(`Created ${title}`);
  }).open();
}

module.exports = { newScene };

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
  let s = line.trim();
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
    if (s[i] === '|' && wikiDepth === 0) {
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

  if (lines.length < 2) return [];

  return lines.slice(2)
    .map(splitTableRow)
    .filter(c => c.length >= 6)
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
  return content.slice(0, a + START.length) + '\n\n' + renderRows(rows) + '\n\n' + content.slice(b);
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

module.exports = { sceneTemplate, manuscriptTemplate, dashboardTemplate, sparkTemplate, stripManuscript };

},
"modals/project.js": function (require, module, exports) {
const { Modal, Setting, Notice } = require('obsidian');

class ProjectModal extends Modal {
  constructor(app, cb) {
    super(app);
    this.cb = cb;
    this.v = { name: '', books: 1, optional: [], custom: '' };
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
  constructor(app, rows, onSave) {
    super(app);
    this.rows = rows.map(r => ({...r}));
    this.onSave = onSave;
  }
  name(row) {
    const x = parseWiki(row.sceneLink);
    return x.label || basename(x.path) || row.sceneLink;
  }
  draw() {
    const e = this.contentEl;
    e.empty();
    e.createEl('h2', { text:'Reorder scenes' });
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
  constructor(app, cb) {
    super(app);
    this.cb = cb;
    this.v = {
      title: "",
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
  constructor(app, lines) { super(app); this.lines = lines; }
  onOpen() {
    this.contentEl.createEl('h2', { text:'Validate Book' });
    this.lines.forEach(x => {
      const p = this.contentEl.createEl('p', { text:x.text });
      p.addClass(x.ok ? 'writing-system-validation-ok' : 'writing-system-validation-warn');
    });
  }
  onClose(){ this.contentEl.empty(); }
}

module.exports = { ValidateModal };

},
"services/files.js": function (require, module, exports) {
const { normalizePath } = require('obsidian');
const { dirname } = require('../lib/dashboard');

async function ensureFolder(plugin, path) {
  path = normalizePath(path);
  if (!path) return;
  let cur = '';
  for (const part of path.split('/')) {
    cur = cur ? `${cur}/${part}` : part;
    if (!plugin.app.vault.getAbstractFileByPath(cur)) await plugin.app.vault.createFolder(cur);
  }
}

async function createMissing(plugin, path, content) {
  path = normalizePath(path);
  if (plugin.app.vault.getAbstractFileByPath(path)) return false;
  await ensureFolder(plugin, dirname(path));
  await plugin.app.vault.create(path, content);
  return true;
}

module.exports = { ensureFolder, createMissing };

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
  const localRequire = request => request === 'obsidian'
    ? __externalRequire('obsidian')
    : __load(__resolve(id, request));
  factory(localRequire, module, module.exports);
  return module.exports;
}

module.exports = __load('main.source.js');
