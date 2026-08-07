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
