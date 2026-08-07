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
