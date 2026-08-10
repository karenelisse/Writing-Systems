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
