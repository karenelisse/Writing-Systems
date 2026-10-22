const { TFile, Notice } = require('obsidian');
const { bookInfo, parseWiki, basename, linkedFilePath, workingTitleFromDashboard } = require('../lib/dashboard');
const { stripManuscript } = require('../lib/templates');
const { githubSettings, saveSettings } = require('../settings/github');
const DIRECTORY = 'Writing/compiled';
const queues = new WeakMap();
const ownershipPath = path => DIRECTORY + '/snapshot-owners/' + path.slice(DIRECTORY.length + 1);
async function snapshotOwner(vault, path) {
  const file = vault.getAbstractFileByPath(ownershipPath(path));
  if (!file) return null;
  if (!(file instanceof TFile)) throw Error('Snapshot ownership path is occupied.');
  const { key } = JSON.parse(await vault.read(file));
  if (typeof key !== 'string') throw Error('Snapshot ownership is invalid.');
  return key;
}
function serial(plugin, work) {
  const previous = queues.get(plugin) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  queues.set(plugin, next);
  return next;
}
function slug(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim().replace(/[\s-]+/g, '-').slice(0, 65).replace(/-+$/, '') || 'untitled';
}
function snapshotName(project, book, type) {
  if (!['manuscript', 'working-draft'].includes(type)) throw Error('Invalid snapshot type.');
  return slug(project) + '-' + slug(book) + '-' + type + '.md';
}
function validatePath(path) {
  if (typeof path !== 'string' || !/^Writing\/compiled\/[^/\\]+\.md$/.test(path)) throw Error('Open a snapshot directly inside Writing/compiled/ first.');
  const name = path.slice(DIRECTORY.length + 1);
  if (!/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*-(?:manuscript|working-draft)(?:-[2-9]\d*|-[1-9]\d+)?\.md$/u.test(name)) throw Error('Select a manuscript or Working Draft snapshot, not README or another file.');
  require('../lib/project').assertPath(path);
  return name;
}
function cleanProse(content) {
  return String(content || '').replace(/\r\n/g, '\n')
    .replace(/^---\s*\n[\s\S]*?\n---(?:\n|$)/, '')
    .replace(/<!--\s*WRITING-SYSTEM:[\s\S]*?-->/g, '')
    .replace(/!?\[\[([^\]\n]+)\]\]/g, (_, target) => {
      const pieces = target.split('|');
      return pieces.length > 1 ? pieces.slice(1).join('|') : pieces[0].split('#')[0].split('/').pop().replace(/\.md$/i, '');
    }).trim() + '\n';
}
function validateContent(content, sceneCount) {
  if (typeof content !== 'string' || !content.trim() || content.includes('\u0000') || /<!--\s*WRITING-SYSTEM:|\[\[/.test(content)) throw Error('Snapshot content is empty or invalid.');
  const prose = content.replace(/^# [^\n]*\n+(?:\*[^\n]*\*\n+)?/, '').replace(/<!--[\s\S]*?-->/g, '').split('\n').filter(line => !/^\s*(?:#{1,6}\s|[-*_]{3,}\s*$)/.test(line)).join('\n').replace(/^[\s*_]+|[\s*_]+$/g, '');
  if (sceneCount === 0 || !prose.trim()) throw Error('Snapshot has no manuscript prose; the previous snapshot was kept.');
  return content;
}
async function identity(plugin, dashboardPath, type) {
  const info = bookInfo(dashboardPath);
  const root = require('./project').rootFromPath(dashboardPath);
  const project = await require('./project').readProject(plugin, root);
  const book = project && require('../lib/project').layout(project.model, root).find(b => b.dir === info.bookDir);
  return { info, key: JSON.stringify([project?.model.id || info.projectDir, book?.id || info.bookDir, type]) };
}
async function writeSnapshot(plugin, { dashboardPath, type, content, sceneCount, missing = 0 }) {
  if (!githubSettings(plugin).enabled) return null;
  if (missing) throw Error('Snapshot skipped because manuscript scenes are missing; the previous snapshot was kept.');
  if (typeof content !== 'string') throw Error('Snapshot content must be Markdown text.');
  const clean = validateContent(cleanProse(content), sceneCount);
  const { info, key } = await identity(plugin, dashboardPath, type);
  const settings = plugin.settings;
  const names = settings.snapshotNames || (settings.snapshotNames = {});
  let path = names[key];
  if (path) validatePath(path);
  const vault = plugin.app.vault;
  const loaded = vault.getAllLoadedFiles();
  // Synced sidecars recover stable identity, including numbered or renamed Books.
  if (!path) {
    for (const file of loaded.filter(f => f instanceof TFile && f.path.startsWith(DIRECTORY + '/snapshot-owners/'))) {
      if (await snapshotOwner(vault, DIRECTORY + '/' + file.path.split('/').pop()) !== key) continue;
      path = DIRECTORY + '/' + file.path.split('/').pop();
      validatePath(path);
      break;
    }
  }
  const occupant = path && vault.getAbstractFileByPath(path);
  if (path && ((occupant && !(occupant instanceof TFile)) || Object.entries(names).some(([owner, other]) => owner !== key && other.toLowerCase() === path.toLowerCase()) ||
    (await snapshotOwner(vault, path) ?? key) !== key)) path = null;
  if (!path) {
    const base = snapshotName(info.projectName, info.bookName, type);
    const canonical = DIRECTORY + '/' + base;
    const existing = vault.getAbstractFileByPath(canonical);
    // Legacy snapshots have no identity metadata. Require matching prose and a
    // single matching Book Dashboard rather than trusting a lossy slug alone.
    const candidates = loaded.filter(f => f instanceof TFile && /\/Plot\/Book \d+\/Dashboard\.md$/.test(f.path))
      .filter(f => { const i = bookInfo(f.path); return snapshotName(i.projectName, i.bookName, type) === base; });
    const reusable = existing instanceof TFile && !await snapshotOwner(vault, canonical) &&
      !Object.values(names).some(p => p.toLowerCase() === canonical.toLowerCase()) &&
      candidates.length === 1 && candidates[0].path === dashboardPath && await vault.read(existing) === clean;
    let name = base, suffix = 1;
    const occupied = candidate => Object.values(names).some(p => p.toLowerCase() === candidate.toLowerCase()) ||
      vault.getAbstractFileByPath(ownershipPath(candidate)) ||
      vault.getAllLoadedFiles().some(f => f.path.normalize('NFC').toLowerCase() === candidate.normalize('NFC').toLowerCase());
    while (!reusable && occupied(DIRECTORY + '/' + name)) name = base.replace(/\.md$/, '-' + (++suffix) + '.md');
    path = DIRECTORY + '/' + name;
    if (suffix > 1) new Notice('Snapshot name already exists. Saving as ' + name + '.');
  }
  if (names[key] !== path) {
    const previous = names[key];
    names[key] = path;
    try { await saveSettings(plugin); } catch (error) { if (previous) names[key] = previous; else delete names[key]; throw error; }
  }
  if (Object.entries(names).some(([owner, other]) => owner !== key && other.toLowerCase() === path.toLowerCase())) throw Error('Snapshot filename ownership is invalid.');
  const file = vault.getAbstractFileByPath(path);
  if (file && !(file instanceof TFile)) throw Error('A folder occupies the snapshot path.');
  await require('./files').ensureFolder(plugin, DIRECTORY + '/snapshot-owners');
  if (!vault.getAbstractFileByPath(ownershipPath(path))) await vault.create(ownershipPath(path), JSON.stringify({ key }) + '\n');
  if (file && await vault.read(file) === clean) return { path, changed: false };
  await require('./files').ensureFolder(plugin, DIRECTORY);
  if (file) await vault.modify(file, clean);
  else await vault.create(path, clean);
  return { path, changed: true };
}
// Read-only assembly: never invoke the compile command or create chapter output.
async function assembleManuscript(plugin, dashboardPath) {
  const vault = plugin.app.vault;
  const dashboard = vault.getAbstractFileByPath(dashboardPath);
  if (!(dashboard instanceof TFile)) throw Error('Book Dashboard is missing.');
  const text = await vault.read(dashboard);
  const info = bookInfo(dashboardPath);
  const rows = await require('../lib/compilation').compilationRows(plugin, dashboard, text);
  const hasChapter = rows.some(r => String(r.chapter || '').trim());
  let part = null, chapter = null, sceneCount = 0, missing = 0;
  const body = [];
  for (const row of rows) {
    const wiki = parseWiki(row.sceneLink);
    const title = wiki.label || basename(wiki.path);
    if (!title) throw Error('Dashboard contains a Scene without a title.');
    const path = linkedFilePath(info.bookDir, row.manuscriptLink, 'Manuscript', title);
    require('../lib/project').assertPath(path);
    if (!path.startsWith(info.bookDir + '/Manuscript/')) throw Error('Manuscript path is outside this Book.');
    const file = vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) { missing++; continue; }
    const prose = stripManuscript(await vault.read(file), title);
    if (!prose) continue;
    if (row.partHeading && row.partHeading !== part) { body.push(row.partHeading); part = row.partHeading; chapter = null; }
    const ch = String(row.chapter || '').trim();
    if (hasChapter && ch !== chapter) { body.push(ch ? '# Chapter ' + ch : '# Unassigned'); chapter = ch; }
    body.push(prose);
    sceneCount++;
  }
  const title = workingTitleFromDashboard(text, info);
  const heading = '# ' + title + (info.projectName && info.projectName !== title ? '\n\n*' + info.projectName + '*' : '');
  return { dashboardPath, type: 'manuscript', content: heading + '\n\n' + body.join('\n\n') + '\n', sceneCount, missing };
}
async function afterWriting(plugin, data) {
  if (!githubSettings(plugin).enabled) return;
  return serial(plugin, async () => {
    let snapshot;
    try {
      if (!githubSettings(plugin).enabled) return;
      const input = typeof data === 'function' ? await data() : data;
      snapshot = await writeSnapshot(plugin, input);
    } catch {
      new Notice('Snapshot could not be saved. Your writing operation succeeded. Check snapshot paths, missing scenes, available prose and disk access.');
      return;
    }
    if (!snapshot || !githubSettings(plugin).autoPush) return;
    try { await require('./github-sync').pushSnapshot(plugin, snapshot.path); }
    catch (error) { new Notice('GitHub snapshot upload failed: ' + error.message + ' Local snapshot is saved.'); }
  });
}
module.exports = { DIRECTORY, slug, snapshotName, validatePath, cleanProse, validateContent, identity, writeSnapshot, assembleManuscript, afterWriting };
