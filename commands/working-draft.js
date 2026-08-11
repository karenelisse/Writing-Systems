const { Notice, TFile, normalizePath } = require('obsidian');
const { linkedFilePath } = require('../lib/dashboard');
const { stripManuscript, replaceManuscriptProse, parseWorkingDraft } = require('../lib/templates');
const { WorkingDraftSyncModal } = require('../modals/working-draft');

const normalized = value => String(value || '').replace(/\r\n/g, '\n').trim();

async function workingDraftToManuscript(plugin) {
  const draft = plugin.app.workspace.getActiveFile();
  if (!(draft instanceof TFile) || !/\/Compiled\/[^/]+ - Working Draft\.md$/i.test(draft.path)) {
    new Notice('Open a compiled “- Working Draft.md” file first.');
    return;
  }

  const bookDir = draft.path.replace(/\/Compiled\/[^/]+$/i, '');
  const sections = parseWorkingDraft(await plugin.app.vault.read(draft));
  if (!sections.length) {
    new Notice('This Working Draft has no linked scene headings.');
    return;
  }

  const changes = [];
  const missing = [];
  for (const section of sections) {
    const path = normalizePath(linkedFilePath(bookDir, `[[${section.path}]]`, 'Manuscript', section.title));
    if (!path.startsWith(`${bookDir}/Manuscript/`)) {
      missing.push(section.title);
      continue;
    }
    const file = plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      missing.push(section.title);
      continue;
    }
    const current = await plugin.app.vault.read(file);
    if (normalized(stripManuscript(current, section.title)) !== normalized(section.prose)) {
      changes.push({ title: section.title, path, file, current, prose: section.prose });
    }
  }

  if (!changes.length) {
    new Notice(missing.length
      ? `No manuscripts need updating. ${missing.length} linked file${missing.length === 1 ? ' is' : 's are'} missing.`
      : 'No manuscript changes found in this Working Draft.');
    return;
  }

  new WorkingDraftSyncModal(plugin.app, changes, async selected => {
    if (!selected.length) {
      new Notice('No manuscripts selected; nothing was updated.');
      return;
    }
    let updated = 0;
    for (const change of selected) {
      await plugin.app.vault.modify(
        change.file,
        replaceManuscriptProse(change.current, change.title, change.prose)
      );
      updated++;
    }
    const missingText = missing.length ? ` ${missing.length} linked file${missing.length === 1 ? ' was' : 's were'} missing.` : '';
    new Notice(`Updated ${updated} Manuscript file${updated === 1 ? '' : 's'} from Working Draft.${missingText}`);
  }).open();
}

module.exports = { workingDraftToManuscript };
