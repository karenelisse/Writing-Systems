const { Modal, Setting, Notice, TFile } = require('obsidian');
const { parseRows, replaceRows, bookInfo, parseWiki, basename, extractLinks, firstLinkName } = require('../lib/dashboard');
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
  for (let i=0; i<rs.length; i++) {
    const r = rs[i];
    const order = (i + 1) * 100;
    const sw = parseWiki(r.sceneLink);
    const mw = parseWiki(r.manuscriptLink);
    const title = sw.label || basename(sw.path) || mw.label || basename(mw.path);
    if (!title) continue;

    const pov = firstLinkName(r.pov);
    const locations = extractLinks(r.locations);
    const chText = String(r.chapter || '').trim();
    const chapter = /^\d+$/.test(chText) ? Number(chText) : chText;
    const sp = `${I.bookDir}/Scenes/${title}.md`;
    const mp = `${I.bookDir}/Manuscript/${title}.md`;

    if (await createMissing(plugin, sp, sceneTemplate({...I,title,pov,locations,order,sceneStatus:r.sceneStatus}))) created++;
    if (await createMissing(plugin, mp, manuscriptTemplate({...I,title,pov,locations,order,manuscriptStatus:r.manuscriptStatus}))) created++;

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
        fm.manuscript = `[[Manuscript/${title}]]`;
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
        fm.scene = `[[Scenes/${title}]]`;
      });
    }

    r.sceneLink = `[[Scenes/${title}|${title}]]`;
    r.manuscriptLink = `[[Manuscript/${title}|${title}]]`;
    r.pov = pov ? `[[${pov}]]` : '';
    r.locations = locations.join(', ');
  }

  await plugin.app.vault.modify(d, replaceRows(original, rs));
  await regenerateIndexes(plugin, d, rs);
  if (showNotice) new Notice(`Applied Dashboard to ${rs.length} scenes; created ${created} missing paired files.`);
}

async function regenerateIndexes(plugin, dashboard, rs) {
  const I = bookInfo(dashboard.path);
  const sceneLines = [];
  const manLines = [];
  for (const r of rs) {
    const sw = parseWiki(r.sceneLink);
    const title = sw.label || basename(sw.path);
    if (!title) continue;
    sceneLines.push(`- [[Scenes/${title}|${title}]] — ${r.sceneStatus || 'Planned'}`);
    manLines.push(`- [[Manuscript/${title}|${title}]] — ${r.manuscriptStatus || 'Not Started'}`);
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
