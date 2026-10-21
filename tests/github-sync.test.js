const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./fixture');
const { pushSnapshot } = require('../services/github-sync');
const path = 'Writing/compiled/story-book-1-manuscript.md';
const content = '# Book\n\nÉowyn — 你好 🌙.\n';
function setup(responses) {
  const fx = fixture({ [path]: content, 'Writing/compiled/README.md': 'Never read' });
  fx.plugin.settings = { github: { enabled: true, repository: 'owner/manuscripts', branch: 'main' } };
  fx.plugin.githubSessionToken = 'test-only-token';
  const calls = [], reads = [];
  const read = fx.vault.read;
  fx.vault.read = async f => { reads.push(f.path); return read(f); };
  const request = async options => {
    calls.push(options);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response, 'Unexpected request');
    return response;
  };
  return { ...fx, calls, reads, request };
}
const repo = () => ({ status: 200, json: { private: true } });
const remote = text => ({ status: 200, json: { type: 'file', sha: 'existing-sha', encoding: 'base64', content: Buffer.from(text).toString('base64') } });
test('uploads exactly one root file with UTF-8 and current SHA', async () => {
  const fx = setup([repo(), remote('Old prose'), { status: 200 }]);
  assert.equal((await pushSnapshot(fx.plugin, path, fx.request)).changed, true);
  assert.equal(fx.calls.length, 3);
  const put = fx.calls[2], body = JSON.parse(put.body);
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, 'https://api.github.com/repos/owner/manuscripts/contents/story-book-1-manuscript.md');
  assert.equal(body.sha, 'existing-sha');
  assert.equal(body.branch, 'main');
  assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), content);
  assert.deepEqual([...new Set(fx.reads)], [path]);
});
test('creates missing file only after confirming the configured branch exists', async () => {
  const fx = setup([repo(), { status: 404 }, { status: 200 }, { status: 201 }]);
  await pushSnapshot(fx.plugin, path, fx.request);
  assert.ok(fx.calls[2].url.endsWith('/branches/main'));
  assert.equal(JSON.parse(fx.calls[3].body).sha, undefined);
});
test('identical remote content avoids an unnecessary commit', async () => {
  const fx = setup([repo(), remote(content)]);
  assert.equal((await pushSnapshot(fx.plugin, path, fx.request)).changed, false);
  assert.equal(fx.calls.length, 2);
});
test('public repository rejection happens before any local snapshot is read', async () => {
  const fx = setup([{ status: 200, json: { private: false } }]);
  await assert.rejects(pushSnapshot(fx.plugin, path, fx.request), /private/);
  assert.deepEqual(fx.reads, []);
  assert.equal(fx.calls.length, 1);
});
for (const status of [401, 403, 404, 500]) test('repository HTTP ' + status + ' cannot upload', async () => {
  const fx = setup([{ status }]);
  await assert.rejects(pushSnapshot(fx.plugin, path, fx.request));
  assert.equal(fx.calls.length, 1);
  assert.deepEqual(fx.reads, []);
});
for (const status of [409, 422]) test('conflict ' + status + ' is reported without a destructive retry', async () => {
  const fx = setup([repo(), remote('Old'), { status }]);
  await assert.rejects(pushSnapshot(fx.plugin, path, fx.request), /conflict/);
  assert.equal(fx.calls.length, 3);
});
test('network errors never expose request errors or token values', async () => {
  const fx = setup([new Error('Secret: test-only-token')]);
  await assert.rejects(pushSnapshot(fx.plugin, path, fx.request), error => !error.message.includes('test-only-token') && /Network/.test(error.message));
});
test('disabled integration, missing auth, bad paths and malformed repository produce no requests', async () => {
  for (const mode of ['disabled', 'auth', 'path', 'repository']) {
    const fx = setup([]);
    if (mode === 'disabled') fx.plugin.settings.github.enabled = false;
    if (mode === 'auth') fx.plugin.githubSessionToken = '';
    if (mode === 'repository') fx.plugin.settings.github.repository = 'https://evil.invalid';
    await assert.rejects(pushSnapshot(fx.plugin, mode === 'path' ? 'Writing/compiled/README.md' : path, fx.request));
    assert.equal(fx.calls.length, 0);
  }
});
test('nonexistent branch is not created', async () => {
  const fx = setup([repo(), { status: 404 }, { status: 404 }]);
  await assert.rejects(pushSnapshot(fx.plugin, path, fx.request), /branch/);
  assert.ok(fx.calls.every(c => c.method === 'GET'));
});
test('large remote file is compared through authenticated raw API, never a download URL', async () => {
  const metadata = { status: 200, json: { type: 'file', sha: 'sha', encoding: 'none' } };
  const fx = setup([repo(), metadata, { status: 200, text: content }, metadata]);
  assert.equal((await pushSnapshot(fx.plugin, path, fx.request)).changed, false);
  assert.equal(fx.calls[2].headers.Accept, 'application/vnd.github.raw+json');
});
test('local edits during upload prevent sending stale content', async () => {
  const fx = setup([repo(), remote('Old')]);
  let reads = 0;
  fx.vault.read = async () => ++reads === 1 ? content : content + 'New edit';
  await assert.rejects(pushSnapshot(fx.plugin, path, fx.request), /Local snapshot changed/);
  assert.equal(fx.calls.length, 2);
});
test('a failed upload leaves local snapshot saved and writing success intact', async () => {
  const fx = setup([]);
  fx.plugin.settings.github.autoPush = true;
  fx.plugin.settings.snapshotNames = {};
  fx.plugin.saveData = async () => {};
  const service = require('../services/github-sync');
  const old = service.pushSnapshot;
  service.pushSnapshot = async () => { throw Error('GitHub access denied.'); };
  try {
    await assert.doesNotReject(require('../services/snapshot-export').afterWriting(fx.plugin, { dashboardPath: 'Writing/Story/Plot/Book 1/Dashboard.md', type: 'manuscript', content, sceneCount: 1 }));
    assert.ok([...fx.texts.values()].includes(content));
  } finally { service.pushSnapshot = old; }
});

test('settings default to disabled and store only authentication references', async () => {
  const { obsidian } = require('./fixture');
  const settings = require('../settings/github');
  const plugin = new obsidian.Plugin();
  plugin.app = {};
  await settings.initialize(plugin);
  assert.deepEqual(plugin.settings.github, settings.DEFAULTS);
  plugin.settings.github.secretName = 'manuscript-secret';
  plugin.app.secretStorage = { getSecret: name => name === 'manuscript-secret' ? 'sensitive-test-token' : null };
  assert.equal(await settings.authentication(plugin, plugin.settings.github), 'sensitive-test-token');
  await settings.saveSettings(plugin);
  assert.doesNotMatch(JSON.stringify(plugin.data), /sensitive-test-token/);
  assert.match(JSON.stringify(plugin.data), /manuscript-secret/);
});
test('secret storage errors do not expose secrets in notices', async () => {
  const fx = setup([]);
  fx.plugin.settings.github.secretName = 'secret';
  fx.plugin.app.secretStorage = { getSecret: () => { throw Error('sensitive-test-token'); } };
  await assert.rejects(pushSnapshot(fx.plugin, path, fx.request), e => !e.message.includes('sensitive-test-token') && /authentication/.test(e.message));
  assert.equal(fx.calls.length, 0);
});
test('manual upload selects only the active snapshot and does not recompile', async () => {
  const fx = setup([]);
  fx.plugin.app.workspace.getActiveFile = () => fx.vault.getAbstractFileByPath(path);
  const service = require('../services/github-sync'), old = service.pushSnapshot;
  const calls = [];
  service.pushSnapshot = async (plugin, selected) => { calls.push(selected); return { changed: true }; };
  try {
    const before = new Map(fx.texts);
    await require('../commands/snapshot').pushSnapshot(fx.plugin);
    assert.deepEqual(calls, [path]);
    assert.deepEqual(fx.texts, before);
  } finally { service.pushSnapshot = old; }
});
test('remote directories and symlinks are never overwritten', async () => {
  for (const object of [{ type: 'dir', sha: 'sha' }, { type: 'symlink', sha: 'sha' }, { type: 'file', sha: 'sha', target: 'elsewhere' }]) {
    const fx = setup([repo(), { status: 200, json: object }]);
    await assert.rejects(pushSnapshot(fx.plugin, path, fx.request), /regular file/);
    assert.equal(fx.calls.length, 2);
  }
});
test('uploads from concurrent commands run sequentially, including privacy checks', async () => {
  const fx = setup([repo(), remote(content), repo(), remote(content)]);
  await Promise.all([pushSnapshot(fx.plugin, path, fx.request), pushSnapshot(fx.plugin, path, fx.request)]);
  assert.deepEqual(fx.calls.map(c => c.url.includes('/contents/')), [false, true, false, true]);
});
