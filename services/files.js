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
