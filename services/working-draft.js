const { TFile } = require('obsidian');
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
