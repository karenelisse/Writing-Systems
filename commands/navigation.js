const { Notice, TFile, normalizePath } = require('obsidian');
const { chooseDashboard } = require('./dashboard');
const { bookInfo, parseRows, parseWiki, basename } = require('../lib/dashboard');
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

    for (const folder of ['Scenes', 'Manuscript']) {
      const path = normalizePath(`${info.bookDir}/${folder}/${title}.md`);
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
