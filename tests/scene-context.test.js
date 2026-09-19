const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, obsidian } = require('./fixture');
const { newProject } = require('../commands/project');
const { newScene } = require('../commands/scene');
const { readProject } = require('../services/project');
const { buildPlan } = require('../services/reconciliation');
const { execute } = require('../services/transactions');
const { id, layout } = require('../lib/project');
const { dashboardTemplate } = require('../lib/templates');
const { SceneModal } = require('../modals/scene');

async function setup(t) {
  const fx = fixture();
  const opened = [];
  const original = obsidian.Modal.prototype.open;
  obsidian.Modal.prototype.open = function () { opened.push(this); };
  t.after(() => { obsidian.Modal.prototype.open = original; });
  newProject(fx.plugin);
  await opened.pop().cb({ name: 'Context Test', books: 2, parts: true, optional: [], custom: '' });
  const root = 'Writing/Context Test';
  const project = await readProject(fx.plugin, root);
  project.model.books[1].parts.push({ id: id(), name: 'Later' });
  await execute(fx.plugin, await buildPlan(fx.plugin, project));
  const books = layout(project.model, root);
  let active = fx.vault.getAbstractFileByPath(books[0].dir + '/Dashboard.md');
  fx.plugin.app.workspace.getActiveFile = () => active;
  return { ...fx, root, books, opened, activate(path) { active = path ? fx.vault.getAbstractFileByPath(path) : null; } };
}

async function chooseBook(fx, expectedCount, book) {
  const pending = newScene(fx.plugin);
  await new Promise(resolve => setImmediate(resolve));
  const picker = fx.opened.pop();
  assert.ok(picker && Array.isArray(picker.dashboards), 'Book picker opens');
  assert.equal(picker.dashboards.length, expectedCount);
  picker.choose(fx.vault.getAbstractFileByPath(book.dir + '/Dashboard.md'));
  await pending;
  return fx.opened.pop();
}

test('New Scene stays in the active Book and offers only its Parts', async t => {
  const fx = await setup(t);
  const book = fx.books[1];
  fx.activate(book.dir + '/Dashboard.md');
  await newScene(fx.plugin);
  assert.equal(fx.opened.length, 1);
  const modal = fx.opened.pop();
  assert.ok(modal instanceof SceneModal);
  assert.deepEqual(modal.parts.map(p => p.id), book.parts.map(p => p.id));
  fx.activate(fx.books[0].dir + '/Dashboard.md');
  await modal.cb({ ...modal.v, title: 'Local Scene', partId: book.parts[1].id });
  assert.ok(fx.texts.has(book.dir + '/Scenes/Part 3/001 - Local Scene.md'));
  assert.ok(![...fx.texts.keys()].some(p => p.startsWith(fx.books[0].dir + '/Scenes/') && p.endsWith('.md')));
});

test('an active Manuscript preselects its Part while allowing another Part in the same Book', async t => {
  const fx = await setup(t);
  const book = fx.books[1];
  fx.activate(book.dir + '/Dashboard.md');
  await newScene(fx.plugin);
  const first = fx.opened.pop();
  await first.cb({ ...first.v, title: 'Anchor', partId: book.parts[1].id });
  fx.activate(book.dir + '/Manuscript/Part 3/001 - Anchor.md');
  await newScene(fx.plugin);
  const modal = fx.opened.pop();
  assert.ok(modal instanceof SceneModal);
  assert.equal(modal.v.partId, book.parts[1].id);
  await modal.cb({ ...modal.v, title: 'Different Part', partId: book.parts[0].id });
  assert.ok(fx.texts.has(book.dir + '/Scenes/Part 2/001 - Different Part.md'));
});

test('a project-level file asks for a Book only within that project', async t => {
  const fx = await setup(t);
  await fx.vault.createFolder('Writing/Other/Plot/Book 1');
  await fx.vault.create('Writing/Other/Plot/Book 1/Dashboard.md', dashboardTemplate('Book 1', 'Other'));
  fx.activate(fx.root + '/Spark.md');
  const modal = await chooseBook(fx, 2, fx.books[1]);
  assert.ok(modal instanceof SceneModal);
  assert.deepEqual(modal.parts.map(p => p.id), fx.books[1].parts.map(p => p.id));
});

test('with no active file New Scene asks which Book to use', async t => {
  const fx = await setup(t);
  fx.activate(null);
  const modal = await chooseBook(fx, 2, fx.books[0]);
  assert.ok(modal instanceof SceneModal);
  assert.equal(modal.parts[0].id, fx.books[0].parts[0].id);
});

test('a missing active Book Dashboard never redirects Scene creation elsewhere', async t => {
  const fx = await setup(t);
  const book = fx.books[1];
  fx.activate(book.dir + '/Scene Index.md');
  await fx.vault.delete(fx.vault.getAbstractFileByPath(book.dir + '/Dashboard.md'));
  const before = fx.writes;
  await newScene(fx.plugin);
  assert.equal(fx.opened.length, 0);
  assert.equal(fx.writes, before);
  assert.match(obsidian.Notice.messages.at(-1), /active Book has no Dashboard/);
});

test('the active Dashboard cursor preselects its Part section', async t => {
  const fx = await setup(t);
  const book = fx.books[1];
  const path = book.dir + '/Dashboard.md';
  const text = fx.texts.get(path);
  const line = text.split('\n').findIndex(value => value.includes('WRITING-SYSTEM:PART:' + book.parts[1].id));
  fx.activate(path);
  fx.plugin.app.workspace.activeEditor = { editor: { getValue: () => text, getCursor: () => ({ line: line + 2 }) } };
  await newScene(fx.plugin);
  const modal = fx.opened.pop();
  assert.ok(modal instanceof SceneModal);
  assert.equal(modal.v.partId, book.parts[1].id);
});

test('New Scene identifies a Master Dashboard with broken managed markers', async t => {
  const fx = await setup(t);
  const masterPath = fx.root + '/Plot/Master Dashboard.md';
  const master = fx.vault.getAbstractFileByPath(masterPath);
  await fx.vault.modify(master, fx.texts.get(masterPath).replace('<!-- WRITING-SYSTEM:PROJECT:START -->', ''));
  fx.activate(fx.books[0].dir + '/Dashboard.md');
  await assert.rejects(
    newScene(fx.plugin),
    /Invalid Master Dashboard .*Missing or duplicate managed markers/
  );
});

test('New Scene identifies a Book Dashboard with broken managed markers', async t => {
  const fx = await setup(t);
  const path = fx.books[0].dir + '/Dashboard.md';
  const dashboard = fx.vault.getAbstractFileByPath(path);
  await fx.vault.modify(dashboard, fx.texts.get(path).replace('<!-- WRITING-SYSTEM:SCENES:START -->', ''));
  fx.activate(path);
  await assert.rejects(
    newScene(fx.plugin),
    /Invalid Book Dashboard .*Missing or duplicate managed markers/
  );
});
