const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { fixture, obsidian } = require('./fixture');

for (const parts of [false, true]) {
  test(`installed bundle creates a ${parts ? 'Parts' : 'flat'} project and Scene pair`, async () => {
    const opened = [];
    const externalImports = [];
    class CapturedModal extends obsidian.Modal {
      open() { opened.push(this); }
    }
    const bundledObsidian = { ...obsidian, Modal: CapturedModal };
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../main.js'), 'utf8'), {
      module,
      require(name) {
        externalImports.push(name);
        return name === 'obsidian' ? bundledObsidian : require(name);
      },
      console
    }, { filename: 'installed-writing-system-main.js' });
    const fx = fixture();
    const plugin = new module.exports();
    plugin.app = fx.plugin.app;
    plugin.app.workspace.onLayoutReady = callback => callback();
    const commands = new Map();
    plugin.addCommand = command => commands.set(command.id, command.callback);
    plugin.addRibbonIcon = () => {};
    await plugin.onload();

    await commands.get('new-project')();
    const projectModal = opened.pop();
    assert.ok(projectModal, 'New Project opens its modal');
    await projectModal.cb({ name: 'Bundle Test', books: 1, parts, optional: [], custom: '' });
    const book = 'Writing/Bundle Test/Plot/Book 1';
    assert.ok(fx.texts.has(book + '/Dashboard.md'), 'Project creation completes');
    assert.ok(externalImports.includes('crypto'), 'crypto reaches the external module loader');

    await commands.get('new-scene')();
    const sceneModal = opened.pop();
    assert.ok(sceneModal, 'New Scene opens its modal');
    await sceneModal.cb({ ...sceneModal.v, title: 'Opening', pov: '', locations: '', chapter: '', sceneStatus: 'Planned', manuscriptStatus: 'Not Started' });
    const suffix = parts ? '/Part 1' : '';
    assert.ok(fx.texts.has(book + '/Scenes' + suffix + '/001 - Opening.md'));
    assert.ok(fx.texts.has(book + '/Manuscript' + suffix + '/001 - Opening.md'));
  });
}
