const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, obsidian } = require('./fixture');
const { dashboardTemplate, manuscriptTemplate } = require('../lib/templates');
const { START, renderRows } = require('../lib/dashboard');
const snapshots = require('../services/snapshot-export');
const dir = 'Writing/Café Story/Plot/Book 1';
function setup(extra = {}, enabled = true) {
  const fx = fixture(extra);
  fx.plugin.settings = { github: { enabled, autoPush: false }, snapshotNames: {} };
  fx.plugin.saveData = async data => { fx.saved = structuredClone(data); };
  return fx;
}
function input(overrides = {}) {
  return { dashboardPath: dir + '/Dashboard.md', type: 'manuscript', content: '# My Book\n\nActual prose.\n', sceneCount: 1, ...overrides };
}
function bookFixture() {
  const rows = ['A', 'B', 'C'].map((title, i) => ({ sceneLink: '[[Scenes/' + title + '|' + title + ']]', manuscriptLink: '[[Manuscript/' + title + '|' + title + ']]', chapter: String(i + 1), pov: '', locations: '' }));
  const dashboard = dashboardTemplate('Book 1', 'Café Story').replace(START + '\n\n' + renderRows([]), START + '\n\n' + renderRows(rows));
  return setup({ [dir + '/Dashboard.md']: dashboard, ...Object.fromEntries(['A', 'B', 'C'].map(title => [dir + '/Manuscript/' + title + '.md', manuscriptTemplate({ title, bookName: 'Book 1' }) + 'Original ' + title + '.\n'])) });
}
test('filenames normalize accents and punctuation, keeping type and book identity', () => {
  assert.equal(snapshots.snapshotName("Light’s Guárdians!", 'Book 2', 'working-draft'), 'lights-guardians-book-2-working-draft.md');
  assert.notEqual(snapshots.snapshotName('Story', 'Book 1', 'manuscript'), snapshots.snapshotName('Story', 'Book 2', 'manuscript'));
  assert.throws(() => snapshots.snapshotName('Story', 'Book 1', 'other'));
});
test('collisions save numbered flat snapshots, preserve README and reuse persisted names', async () => {
  const base = 'Writing/compiled/cafe-story-book-1-manuscript.md';
  const fx = setup({ [base]: 'Unrelated original', 'Writing/compiled/README.md': 'Keep me' });
  const first = await snapshots.writeSnapshot(fx.plugin, input());
  assert.equal(first.path, base.replace('.md', '-2.md'));
  const second = await snapshots.writeSnapshot(fx.plugin, input({ dashboardPath: 'Writing/Cafe Story/Plot/Book 1/Dashboard.md', content: '# Other\n\nOther prose.' }));
  assert.equal(second.path, base.replace('.md', '-3.md'));
  assert.equal(fx.texts.get(base), 'Unrelated original');
  assert.equal(fx.texts.get('Writing/compiled/README.md'), 'Keep me');
  assert.ok(obsidian.Notice.messages.some(m => m.includes('-2.md')));
  fx.plugin.settings = structuredClone(fx.saved);
  const before = fx.writes;
  assert.deepEqual(await snapshots.writeSnapshot(fx.plugin, input()), { path: first.path, changed: false });
  assert.equal(fx.writes, before);
});
test('repeated changed compiles and a second device reuse the same remote paths', async () => {
  const fx = bookFixture();
  await require('../commands/compile').compile(fx.plugin, false);
  const path = 'Writing/compiled/cafe-story-book-1-manuscript.md';
  const manuscript = fx.vault.getAbstractFileByPath(dir + '/Manuscript/A.md');
  await fx.vault.modify(manuscript, fx.texts.get(manuscript.path).replace('Original A.', 'Revised A.'));
  await require('../commands/compile').compile(fx.plugin, false);
  assert.match(fx.texts.get(path), /Revised A/);
  const second = setup(Object.fromEntries(fx.texts));
  const other = second.vault.getAbstractFileByPath(manuscript.path);
  await second.vault.modify(other, second.texts.get(other.path).replace('Revised A.', 'Device two edit.'));
  await require('../commands/compile').compileBook(second.plugin, false, second.vault.getAbstractFileByPath(dir + '/Dashboard.md'));
  assert.match(second.texts.get(path), /Device two edit/);
  assert.deepEqual([...second.texts.keys()].filter(p => /^Writing\/compiled\/[^/]+\.md$/.test(p)), [path]);
  assert.equal(Object.values(second.plugin.settings.snapshotNames)[0], path);
});

test('legacy canonical snapshot is adopted only with matching content and an unambiguous Dashboard', async () => {
  const path = 'Writing/compiled/cafe-story-book-1-manuscript.md';
  const fx = bookFixture();
  const data = await snapshots.assembleManuscript(fx.plugin, dir + '/Dashboard.md');
  await require('../services/files').ensureFolder(fx.plugin, 'Writing/compiled');
  await fx.vault.create(path, snapshots.cleanProse(data.content));
  assert.equal((await snapshots.writeSnapshot(fx.plugin, data)).path, path);
  assert.equal((await snapshots.writeSnapshot(fx.plugin, { ...data, content: '# Changed\n\nNew prose.' })).path, path);
  const ambiguous = bookFixture();
  await require('../services/files').ensureFolder(ambiguous.plugin, 'Writing/compiled');
  await ambiguous.vault.create(path, snapshots.cleanProse(data.content));
  const otherDashboard = 'Writing/Cafe Story/Plot/Book 1/Dashboard.md';
  await require('../services/files').ensureFolder(ambiguous.plugin, 'Writing/Cafe Story/Plot/Book 1');
  await ambiguous.vault.create(otherDashboard, 'Other Book');
  assert.notEqual((await snapshots.writeSnapshot(ambiguous.plugin, data)).path, path);
  assert.equal(ambiguous.texts.get(path), snapshots.cleanProse(data.content));
});

test('second device preserves numbered ownership and isolates genuine collisions', async () => {
  const fx = setup();
  const first = await snapshots.writeSnapshot(fx.plugin, input());
  const other = input({ dashboardPath: 'Writing/Cafe Story/Plot/Book 1/Dashboard.md', content: '# Other\n\nOther prose.' });
  const collision = await snapshots.writeSnapshot(fx.plugin, other);
  assert.notEqual(first.path, collision.path);
  const second = setup(Object.fromEntries(fx.texts));
  assert.equal((await snapshots.writeSnapshot(second.plugin, { ...other, content: '# Other\n\nRevised other prose.' })).path, collision.path);
  assert.equal(second.texts.get(first.path), fx.texts.get(first.path));
});

test('books and output types remain isolated', async () => {
  const fx = setup();
  for (const dashboardPath of [dir + '/Dashboard.md', 'Writing/Other/Plot/Book 1/Dashboard.md', 'Writing/Café Story/Plot/Book 2/Dashboard.md']) {
    for (const type of ['manuscript', 'working-draft']) await snapshots.writeSnapshot(fx.plugin, input({ dashboardPath, type }));
  }
  const before = new Map(fx.texts);
  const target = await snapshots.writeSnapshot(fx.plugin, input({ content: '# Changed\n\nRevised prose.' }));
  for (const [path, text] of before) if (path !== target.path) assert.equal(fx.texts.get(path), text);
  assert.equal([...fx.texts.keys()].filter(p => /^Writing\/compiled\/[^/]+\.md$/.test(p)).length, 6);
});
test('clean copy has normal headings, Unicode prose, no frontmatter, wiki links or generated comments', () => {
  const source = '---\nsecret: none\n---\n# Book\n\n# Chapter 1\n\n<!-- WRITING-SYSTEM:DRAFT-SCENE:abc -->\n### [[Manuscript/A|Opening]]\n\n“Éowyn — 你好 🌙.” [[Characters/A|Alice]]\n<!-- WRITING-SYSTEM:DRAFT-END -->';
  const clean = snapshots.cleanProse(source);
  assert.match(clean, /### Opening/);
  assert.match(clean, /“Éowyn — 你好 🌙.” Alice/);
  assert.doesNotMatch(clean, /\[\[|WRITING-SYSTEM|secret:/);
  assert.match(source, /\[\[/);
});
test('empty, invalid and missing-scene exports preserve populated snapshots', async () => {
  const fx = setup();
  const saved = await snapshots.writeSnapshot(fx.plugin, input());
  const before = new Map(fx.texts);
  for (const data of [{ content: '' }, { content: '# Title', sceneCount: 0 }, { content: '\u0000invalid' }, { missing: 1 }]) {
    await assert.rejects(snapshots.writeSnapshot(fx.plugin, input(data)));
    assert.deepEqual(fx.texts, before);
  }
  assert.ok(fx.texts.has(saved.path));
});
test('disabled integration performs no writes, settings saves, assembly or requests', async () => {
  const fx = setup({}, false);
  fx.plugin.saveData = async () => { throw Error('Must not save'); };
  await snapshots.afterWriting(fx.plugin, () => { throw Error('Must not assemble'); });
  assert.equal(await snapshots.writeSnapshot(fx.plugin, input()), null);
  assert.equal(fx.writes, 0);
});
test('assembly reads all current manuscripts in Dashboard order without writing', async () => {
  const fx = bookFixture(), before = fx.writes;
  const result = await snapshots.assembleManuscript(fx.plugin, dir + '/Dashboard.md');
  assert.equal(result.sceneCount, 3);
  assert.match(result.content, /# Chapter 1\n\nOriginal A\.[\s\S]*# Chapter 2\n\nOriginal B\.[\s\S]*# Chapter 3\n\nOriginal C\./);
  assert.equal(fx.writes, before);
});
test('partial Working Draft sync exports entire saved manuscript, excluding unselected edits', async () => {
  const fx = bookFixture();
  await require('../commands/compile').compileWorkingDraft(fx.plugin);
  const draft = [...fx.texts.keys()].find(p => p.startsWith(dir + '/Compiled/') && p.endsWith(' - Working Draft.md'));
  const file = fx.vault.getAbstractFileByPath(draft);
  await fx.vault.modify(file, fx.texts.get(draft).replace('Original A.', 'Selected A edit.').replace('Original B.', 'Unselected B edit.'));
  const editedDraftContent = fx.texts.get(draft);
  fx.plugin.app.workspace.getActiveFile = () => file;
  const { WorkingDraftSyncModal } = require('../modals/working-draft');
  const old = WorkingDraftSyncModal.prototype.open;
  let modal;
  WorkingDraftSyncModal.prototype.open = function () { modal = this; };
  try {
    await require('../commands/working-draft').workingDraftToManuscript(fx.plugin);
    assert.ok(modal);
    await modal.onUpdate([modal.changes[0]]);
  } finally { WorkingDraftSyncModal.prototype.open = old; }
  const snapshot = fx.texts.get('Writing/compiled/cafe-story-book-1-manuscript.md');
  assert.match(snapshot, /Selected A edit\./);
  assert.match(snapshot, /Original B\./);
  assert.match(snapshot, /Original C\./);
  assert.doesNotMatch(snapshot, /Unselected B edit/);
  const compiled = fx.texts.get(dir + '/Compiled/Café Story.md');
  assert.equal(compiled, snapshot);
  assert.match(fx.texts.get(dir + '/Manuscript/A.md'), /Selected A edit/);
  assert.match(fx.texts.get(dir + '/Manuscript/B.md'), /Original B/);
  const draftSnapshot = fx.texts.get('Writing/compiled/cafe-story-book-1-working-draft.md');
  assert.match(draftSnapshot, /Selected A edit\./);
  assert.match(draftSnapshot, /Unselected B edit\./);
  assert.match(draftSnapshot, /Original C\./);
  assert.doesNotMatch(draftSnapshot, /\[\[|WRITING-SYSTEM/);
  assert.equal(fx.texts.get(draft), editedDraftContent);
});
test('snapshot failures do not reject successful writing operations', async () => {
  const fx = setup();
  fx.plugin.saveData = async () => { throw Error('Injected settings failure'); };
  await assert.doesNotReject(snapshots.afterWriting(fx.plugin, input()));
  assert.equal(fx.writes, 0);
  assert.ok(obsidian.Notice.messages.some(m => m.startsWith('Snapshot could not be saved')));
});
test('only direct snapshot paths are accepted, never README, nested files or traversal', () => {
  for (const path of ['Writing/compiled/README.md', 'Writing/compiled/sub/a-manuscript.md', 'Writing/compiled/../a-manuscript.md', dir + '/Compiled/a-manuscript.md']) assert.throws(() => snapshots.validatePath(path));
  assert.equal(snapshots.validatePath('Writing/compiled/story-book-1-manuscript-12.md'), 'story-book-1-manuscript-12.md');
});
module.exports = { setup, input, bookFixture, dir };

for (const operation of ['manuscript', 'clipboard', 'working-draft']) test(operation + ' preserves existing compilation outputs when snapshots are enabled', async () => {
  const baseline = bookFixture(), enabled = bookFixture();
  baseline.plugin.settings.github.enabled = false;
  const clipboard = [];
  const previousClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => clipboard.push(value) } });
  try {
    for (const fx of [baseline, enabled]) {
      if (operation === 'working-draft') await require('../commands/compile').compileWorkingDraft(fx.plugin);
      else await require('../commands/compile').compile(fx.plugin, operation === 'clipboard');
    }
  } finally {
    if (previousClipboard) Object.defineProperty(navigator, 'clipboard', previousClipboard);
    else delete navigator.clipboard;
  }
  const existing = map => [...map].filter(([path]) => !path.startsWith('Writing/compiled/'));
  assert.deepEqual(existing(enabled.texts), existing(baseline.texts));
  const snapshot = [...enabled.texts].find(([path]) => path.startsWith('Writing/compiled/'));
  assert.ok(snapshot, 'enabled compilation creates its snapshot');
  assert.equal([...enabled.texts.keys()].filter(p => /^Writing\/compiled\/[^/]+\.md$/.test(p)).length, 1);
  assert.doesNotMatch(snapshot[1], /\[\[|WRITING-SYSTEM/);
  if (operation === 'clipboard') { assert.equal(clipboard.length, 2); assert.equal(clipboard[0], clipboard[1]); }
});
test('cancel, zero selection and failed Working Draft transactions never produce manuscript snapshots', async () => {
  const { WorkingDraftSyncModal } = require('../modals/working-draft');
  const github = require('../services/github-sync'), originalPush = github.pushSnapshot;
  for (const action of ['cancel', 'none', 'failure']) {
    const fx = bookFixture();
    await require('../commands/compile').compileWorkingDraft(fx.plugin);
    const draft = [...fx.texts.keys()].find(p => p.startsWith(dir + '/Compiled/') && p.endsWith(' - Working Draft.md'));
    const file = fx.vault.getAbstractFileByPath(draft);
    await fx.vault.modify(file, fx.texts.get(draft).replace('Original A.', 'Changed A.'));
    const previousDraftSnapshot = fx.texts.get('Writing/compiled/cafe-story-book-1-working-draft.md');
    fx.plugin.app.workspace.getActiveFile = () => file;
    fx.plugin.settings.github.autoPush = true;
    const pushed = [];
    github.pushSnapshot = async (_, path) => { pushed.push(path); };
    let modal;
    const old = WorkingDraftSyncModal.prototype.open;
    WorkingDraftSyncModal.prototype.open = function () { modal = this; };
    try {
      await require('../commands/working-draft').workingDraftToManuscript(fx.plugin);
      assert.ok(modal);
      if (action === 'none') await modal.onUpdate([]);
      if (action === 'failure') { fx.failNext(); await modal.onUpdate([modal.changes[0]]); }
      assert.ok(!fx.texts.has('Writing/compiled/cafe-story-book-1-manuscript.md'));
      assert.ok(!fx.texts.has(dir + '/Compiled/Café Story.md'));
      assert.equal(fx.texts.get('Writing/compiled/cafe-story-book-1-working-draft.md'), previousDraftSnapshot);
      assert.match(fx.texts.get(dir + '/Manuscript/A.md'), /Original A/);
      assert.deepEqual(pushed, []);
    } finally { WorkingDraftSyncModal.prototype.open = old; github.pushSnapshot = originalPush; }
  }
});
test('failed compile does not attempt snapshot export', async () => {
  const fx = bookFixture();
  const before = new Map(fx.texts);
  fx.failNext();
  await require('../commands/compile').compile(fx.plugin, false);
  assert.deepEqual(fx.texts, before);
  assert.equal(Object.keys(fx.plugin.settings.snapshotNames).length, 0);
});
test('local snapshot write failure preserves successful compile outputs', async () => {
  const fx = bookFixture(), create = fx.vault.create;
  fx.vault.create = async (path, text) => { if (path.startsWith('Writing/compiled/')) throw Error('Disk failure'); return create(path, text); };
  await require('../commands/compile').compile(fx.plugin, false);
  assert.ok([...fx.texts.keys()].some(path => path.startsWith(dir + '/Compiled/') && path.endsWith('.md')));
  assert.ok(![...fx.texts.keys()].some(path => path.startsWith('Writing/compiled/')));
});

test('managed Book identity retains its snapshot filename after Book reordering', async () => {
  const fx = setup();
  const { renderMaster } = require('../lib/project');
  const model = { version: 1, id: 'a'.repeat(32), partsEnabled: false, books: [{ id: 'b'.repeat(32), title: 'First', parts: [] }, { id: 'c'.repeat(32), title: 'Second', parts: [] }] };
  const master = 'Writing/Café Story/Plot/Master Dashboard.md';
  await require('../services/files').ensureFolder(fx.plugin, 'Writing/Café Story/Plot');
  const file = await fx.vault.create(master, renderMaster(model));
  const first = await snapshots.writeSnapshot(fx.plugin, input());
  model.books.reverse();
  await fx.vault.modify(file, renderMaster(model));
  const again = await snapshots.writeSnapshot(fx.plugin, input({ dashboardPath: 'Writing/Café Story/Plot/Book 2/Dashboard.md', content: '# Updated\n\nNew saved prose.' }));
  assert.equal(again.path, first.path);
  assert.equal([...fx.texts.keys()].filter(p => /^Writing\/compiled\/[^/]+\.md$/.test(p)).length, 1);
});
test('non-string exports and headings with only a generated subtitle cannot erase prose', async () => {
  const fx = setup();
  await snapshots.writeSnapshot(fx.plugin, input());
  const before = new Map(fx.texts);
  for (const content of [{ bad: true }, '# Book\n\n*Story*\n\n# Chapter 1\n']) await assert.rejects(snapshots.writeSnapshot(fx.plugin, input({ content })));
  assert.deepEqual(fx.texts, before);
});

for (const outcome of ['success', 'manuscript-upload-failure', 'manuscript-local-failure']) test('sync attempts both relevant snapshots: ' + outcome, async () => {
  const fx = bookFixture();
  await require('../commands/compile').compile(fx.plugin, false);
  await require('../commands/compile').compileWorkingDraft(fx.plugin);
  const manuscriptSnapshot = 'Writing/compiled/cafe-story-book-1-manuscript.md';
  const workingSnapshot = 'Writing/compiled/cafe-story-book-1-working-draft.md';
  const draft = [...fx.texts.keys()].find(p => p.startsWith(dir + '/Compiled/') && p.endsWith(' - Working Draft.md'));
  const file = fx.vault.getAbstractFileByPath(draft);
  const edited = fx.texts.get(draft).replace('Original A.', 'Selected A edit.').replace('Original B.', 'Unselected B edit.');
  await fx.vault.modify(file, edited);
  await fx.vault.create('Writing/compiled/other-book-1-working-draft.md', '# Other book\n\nOther prose.\n');
  const before = new Map(fx.texts);
  fx.plugin.app.workspace.getActiveFile = () => file;
  fx.plugin.settings.github.autoPush = true;
  const github = require('../services/github-sync'), originalPush = github.pushSnapshot;
  const uploaded = [];
  github.pushSnapshot = async (plugin, path) => {
    uploaded.push({ path, content: fx.texts.get(path) });
    if (outcome === 'manuscript-upload-failure' && path === manuscriptSnapshot) throw Error('Injected upload failure');
    return { changed: true };
  };
  if (outcome === 'manuscript-local-failure') {
    const modify = fx.vault.modify;
    fx.vault.modify = async (target, content) => {
      if (target.path === manuscriptSnapshot) throw Error('Injected snapshot write failure');
      return modify(target, content);
    };
  }
  const { WorkingDraftSyncModal } = require('../modals/working-draft');
  const originalOpen = WorkingDraftSyncModal.prototype.open;
  let modal;
  WorkingDraftSyncModal.prototype.open = function () { modal = this; };
  try {
    await require('../commands/working-draft').workingDraftToManuscript(fx.plugin);
    assert.ok(modal);
    await modal.onUpdate([modal.changes[0]]);
    assert.deepEqual(uploaded.map(item => item.path), outcome === 'manuscript-local-failure' ? [workingSnapshot] : [manuscriptSnapshot, workingSnapshot]);
    const working = uploaded.find(item => item.path === workingSnapshot);
    assert.equal(working.content, snapshots.cleanProse(edited));
    assert.match(working.content, /Unselected B edit/);
    if (outcome !== 'manuscript-local-failure') {
      const manuscript = uploaded.find(item => item.path === manuscriptSnapshot);
      assert.match(manuscript.content, /Selected A edit/);
      assert.match(manuscript.content, /Original B/);
      assert.doesNotMatch(manuscript.content, /Unselected B edit/);
    }
    const compiledPath = dir + '/Compiled/Café Story.md';
    assert.match(fx.texts.get(compiledPath), /Selected A edit/);
    assert.match(fx.texts.get(compiledPath), /Original B/);
    assert.doesNotMatch(fx.texts.get(compiledPath), /Unselected B edit/);
    if (outcome === 'manuscript-local-failure') assert.equal(fx.texts.get(manuscriptSnapshot), before.get(manuscriptSnapshot));
    const allowed = new Set([dir + '/Manuscript/A.md', compiledPath, dir + '/Compiled/Chapters/Chapter 1.md', manuscriptSnapshot, workingSnapshot]);
    for (const [path, text] of before) if (!allowed.has(path)) assert.equal(fx.texts.get(path), text, 'Unrelated file preserved: ' + path);
    assert.equal(fx.texts.get(draft), edited);
  } finally {
    github.pushSnapshot = originalPush;
    WorkingDraftSyncModal.prototype.open = originalOpen;
  }
});
