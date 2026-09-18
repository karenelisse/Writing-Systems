const { TFile } = require('obsidian');
const { assertPath, id } = require('../lib/project');
const { ensureFolder, folderIsEmpty } = require('./files');
const locks = new Set();
const key = p => p.normalize('NFC').toLowerCase();
function validatePlan(plugin, plan) {
  const sources = new Set(), targets = new Set();
  for (const op of plan.files) {
    assertPath(op.target);
    if (op.source) { assertPath(op.source); if (sources.has(key(op.source))) throw Error(`Duplicate source: ${op.source}`); sources.add(key(op.source)); }
    if (targets.has(key(op.target))) throw Error(`Duplicate destination: ${op.target}`);
    targets.add(key(op.target));
  }
  const all = plugin.app.vault.getAllLoadedFiles();
  for (const op of plan.files) {
    const occupant = all.find(f => key(f.path) === key(op.target));
    if (occupant && (!(occupant instanceof TFile) || !sources.has(key(occupant.path)))) throw Error(`Occupied destination: ${op.target}`);
    const pieces = op.target.split('/'); pieces.pop();
    while (pieces.length) {
      if(targets.has(key(pieces.join('/'))))throw Error('Planned file blocks folder: '+pieces.join('/'));
      const parent = all.find(f => key(f.path) === key(pieces.join('/')));
      if (parent instanceof TFile) throw Error(`File blocks folder: ${parent.path}`);
      pieces.pop();
    }
  }
  for (const dir of plan.folders || []) {
    assertPath(dir);
    if(targets.has(key(dir)))throw Error('Planned file blocks folder: '+dir);
    const occupant = all.find(f => key(f.path) === key(dir));
    if (occupant instanceof TFile) throw Error(`File blocks folder: ${dir}`);
  }
}
async function execute(plugin, plan) {
  const vault = plugin.app.vault;
  const journalPath = `${plan.root}/Writing System Operation.json`;
  if (locks.has(plan.root)) throw Error('Another project operation is running.');
  if (vault.getAbstractFileByPath(journalPath)) throw Error('An interrupted operation needs recovery. Run Recover Writing Project.');
  locks.add(plan.root);
  const createdFolders = [];
  let journal;
  let committed = false;
  try {
    validatePlan(plugin, plan);
    if (plan.inventory && JSON.stringify(vault.getFiles().filter(f=>f.path.startsWith(plan.root+'/')).map(f=>f.path).sort()) !== JSON.stringify(plan.inventory)) throw Error('Project files changed since planning; reopen the operation.');
    for (const check of plan.checks || []) {
      const f = vault.getAbstractFileByPath(check.path);
      if (!(f instanceof TFile) || await vault.read(f) !== check.content) throw Error(`Changed since planning: ${check.path}`);
    }
    for (const op of plan.files) {
      if (op.source) {
        const f = vault.getAbstractFileByPath(op.source);
        if (!(f instanceof TFile)) throw Error(`Missing source: ${op.source}`);
        if (op.before !== undefined && await vault.read(f) !== op.before) throw Error(`Changed since planning: ${op.source}`);
      }
    }
    const stamp = id();
    plan.files.forEach((op, i) => { if (op.source && op.source !== op.target) op.temp = `${plan.root}/Writing System Staging ${stamp}/${i}`; });
    await ensureFolder(plugin, plan.root);
    journal = await vault.create(journalPath, JSON.stringify({ ...plan, status: 'running', phase: 'staging' }));
    const folder = async path => {
      if(!path)return;
      let current = '';
      for (const segment of path.split('/')) {
        current = current ? current + '/' + segment : segment;
        if (!vault.getAbstractFileByPath(current)) { await vault.createFolder(current); createdFolders.push(current); }
      }
    };
    for (const op of plan.files.filter(x => x.temp)) {
      await folder(op.temp.split('/').slice(0, -1).join('/'));
      const f = vault.getAbstractFileByPath(op.source);
      await vault.rename(f, op.temp);
    }
    await vault.modify(journal, JSON.stringify({ ...plan, status: 'running', phase: 'writing' }));
    for (const dir of plan.folders || []) await folder(dir);
    for (const op of plan.files) {
      await folder(op.target.split('/').slice(0, -1).join('/'));
      if (op.source) {
        const f = vault.getAbstractFileByPath(op.temp || op.source);
        if (op.temp) await vault.rename(f, op.target);
        if (op.trash) { await vault.trash(f,false); continue; }
        if (op.after !== undefined && op.after !== op.before) await vault.modify(f, op.after);
      } else {
        await vault.create(op.target, op.after || '');
      }
    }
    await vault.modify(journal, JSON.stringify({ ...plan, status: 'complete' }));
    committed = true;
    await vault.delete(journal);
    // Only remove empty folders under the project. Never recursively delete user content.
    const dirs = vault.getAllLoadedFiles().filter(f => f.children && f.path.startsWith(plan.root + '/')).sort((a,b) => b.path.length - a.path.length);
    for (const dir of dirs) if (!(plan.folders || []).includes(dir.path)) {
      if ((plan.obsoleteFolders || []).includes(dir.path) || /\/Writing System (?:Staging |Deleted )|\/(?:Scenes|Manuscript)\/Part \d+$/.test(dir.path)) { if (await folderIsEmpty(plugin,dir)) await vault.delete(dir); }
    }
  } catch (error) {
    if (committed) throw Error('Changes completed; cleanup requires attention: ' + error.message);
    if (journal) {
      try {
        const recovery=require('./recovery');
        await recovery.recover(plugin,await recovery.inspectRecovery(plugin,plan.root));
        for (const path of createdFolders.reverse()) { const f=vault.getAbstractFileByPath(path); if(f?.children&&!f.children.length)await vault.delete(f); }
      } catch (rollback) { throw Error(`${error.message}; recovery required: ${rollback.message}. Originals and move plan are saved in ${journalPath}`); }
    }
    throw error;
  } finally { locks.delete(plan.root); }
}
module.exports = { validatePlan, execute };
