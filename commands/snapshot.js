const { Notice, TFile } = require('obsidian');
async function pushSnapshot(plugin) {
  try {
    const file = plugin.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) throw Error('Open a snapshot in Writing/compiled/ first.');
    const result = await require('../services/github-sync').pushSnapshot(plugin, file.path);
    new Notice(result.changed ? 'Snapshot pushed to GitHub.' : 'GitHub snapshot is already up to date.');
  } catch (error) { new Notice(error.message); }
}
module.exports = { pushSnapshot };
