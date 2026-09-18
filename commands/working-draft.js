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
  const draftContent = await plugin.app.vault.read(draft);
  const companion = await require('../services/working-draft').readDraftMetadata(plugin,draft.path);
  const sections = companion ? require('../lib/working-draft').parseMappedDraft(draftContent,companion.metadata,bookDir) : parseWorkingDraft(draftContent);
  const root = require('../services/project').rootFromPath(draft.path);
  const state = root ? await require('../services/reconciliation').readState(plugin,root) : null;
  const seen = new Set();
  if (!sections.length) {
    new Notice('This Working Draft has no linked scene headings.');
    return;
  }

  const changes = [];
  const missing = [];
  for (const section of sections) {
    const established = section.id && state?.scenes.find(s => s.id === section.id);
    const path = established ? established.manuscriptPath : normalizePath(linkedFilePath(bookDir, `[[${section.path}]]`, 'Manuscript', section.title));
    require('../lib/project').assertPath(path);
    if (seen.has(path.toLowerCase())) throw Error('Working Draft contains duplicate scene sections.');
    seen.add(path.toLowerCase());
    if (section.id && !established) throw Error('Working Draft references a deleted or unknown Scene.');
    if (!path.startsWith(bookDir + '/Manuscript/')) throw Error('This Working Draft contains a Scene moved to another Book. Preserve its edits and compile a new draft before syncing.');

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

  new WorkingDraftSyncModal(plugin.app, changes, require('./parts').guarded(async selected => {
    if (!selected.length) {
      new Notice('No manuscripts selected; nothing was updated.');
      return;
    }
    if (await plugin.app.vault.read(draft) !== draftContent) throw Error('Working Draft changed; reopen sync.');
    for (const change of selected) if (await plugin.app.vault.read(change.file) !== change.current) throw Error('Manuscript changed; reopen sync.');
    await require('../services/transactions').execute(plugin,{
      root,
      files:selected.map(change=>({source:change.path,target:change.path,before:change.current,after:replaceManuscriptProse(change.current,change.title,change.prose)})),
      folders:[],checks:[{path:draft.path,content:draftContent},...(companion ? [{path:companion.path,content:companion.content}] : [])]
    });
    const updated = selected.length;
    const missingText = missing.length ? ` ${missing.length} linked file${missing.length === 1 ? ' was' : 's were'} missing.` : '';
    new Notice(`Updated ${updated} Manuscript file${updated === 1 ? '' : 's'} from Working Draft.${missingText}`);
  })).open();
}

async function cleanWorkingDraft(plugin) {
  const draft = plugin.app.workspace.getActiveFile();
  if (!(draft instanceof TFile) || !/\/Compiled\/[^/]+ - Working Draft\.md$/i.test(draft.path)) throw Error('Open a compiled Working Draft first.');
  const content = await plugin.app.vault.read(draft);
  const result = require('../lib/working-draft').cleanLegacyDraft(content,draft.path,draft.path.replace(/\/Compiled\/[^/]+$/i,''));
  if (!result) { new Notice('No Writing System comments to remove.'); return; }
  await require('../services/working-draft').saveDraft(plugin,draft.path,result.content,result.metadata,[{path:draft.path,content}]);
  new Notice('Removed Working Draft sync comments. Draft edits were preserved.');
}

module.exports = { workingDraftToManuscript, cleanWorkingDraft };
