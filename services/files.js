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
