const { TFile, requestUrl } = require('obsidian');
const { Buffer } = require('buffer');
const { githubSettings, authentication } = require('../settings/github');
const { validatePath, validateContent } = require('./snapshot-export');
const queues = new WeakMap();
function pushSnapshot(plugin, path, request = requestUrl) {
  const previous = queues.get(plugin) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => upload(plugin, path, request));
  queues.set(plugin, next);
  return next;
}
async function upload(plugin, path, request) {
  const config = githubSettings(plugin);
  if (!config.enabled) throw Error('Enable GitHub integration first.');
  const filename = validatePath(path);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/.test(config.repository) || /\/(?:\.|\.\.)$/.test(config.repository)) throw Error('Configure a repository as owner/repository.');
  if (!config.branch || /[\x00-\x20~^:?*\[\\]|\.\.|@\{|\/\/|\/$|\.$|\.lock(?:\/|$)/.test(config.branch) || config.branch.startsWith('/') || config.branch.startsWith('-')) throw Error('Configure a valid GitHub branch.');
  const token = await authentication(plugin, config);
  const base = 'https://api.github.com/repos/' + config.repository;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function api(url, method = 'GET', body, accept) {
    try {
      return await request({ url, method, headers: { ...headers, ...(accept ? { Accept: accept } : {}) },
        ...(body ? { body: JSON.stringify(body), contentType: 'application/json' } : {}), throw: false });
    } catch { throw Error('Network request failed. Check your connection and try again.'); }
  }
  function requireSuccess(response, action) {
    if (response.status >= 200 && response.status < 300) return;
    if (response.status === 409 || response.status === 422) throw Error('GitHub conflict or rejected update. Review the remote file and branch before retrying.');
    if (response.status === 401 || response.status === 403) throw Error('GitHub access denied. Check token permissions and repository access.');
    if (response.status === 404) throw Error('GitHub repository or branch is unavailable. Check configuration and token access.');
    throw Error(action + ' failed (HTTP ' + response.status + ').');
  }
  const repository = await api(base);
  requireSuccess(repository, 'Repository check');
  if (repository.json?.private !== true) throw Error('Uploads require a private GitHub repository.');
  // Validate visibility before reading even the selected local snapshot.
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw Error('Selected snapshot does not exist.');
  const content = validateContent(await plugin.app.vault.read(file));
  const endpoint = base + '/contents/' + encodeURIComponent(filename);
  const remote = await api(endpoint + '?ref=' + encodeURIComponent(config.branch));
  let sha;
  if (remote.status === 200) {
    const object = remote.json;
    if (object?.type !== 'file' || typeof object.sha !== 'string' || object.submodule_git_url || object.target) throw Error('Remote snapshot path is not a regular file.');
    sha = object.sha;
    let remoteContent;
    if (object.encoding === 'base64' && typeof object.content === 'string') remoteContent = Buffer.from(object.content.replace(/\s/g, ''), 'base64').toString('utf8');
    else {
      const raw = await api(endpoint + '?ref=' + encodeURIComponent(config.branch), 'GET', undefined, 'application/vnd.github.raw+json');
      requireSuccess(raw, 'Remote content read');
      remoteContent = raw.text;
      // Avoid uploading against a SHA obtained before the raw content request changed.
      const verify = await api(endpoint + '?ref=' + encodeURIComponent(config.branch));
      requireSuccess(verify, 'Remote version check');
      if (verify.json?.sha !== sha) throw Error('GitHub file changed during comparison. Review it before retrying.');
    }
    if (remoteContent === content) return { changed: false, path };
  } else if (remote.status === 404) {
    // Distinguish a missing file from a nonexistent branch; never create branches.
    const branch = await api(base + '/branches/' + encodeURIComponent(config.branch));
    requireSuccess(branch, 'Branch check');
  } else requireSuccess(remote, 'Remote content read');
  if (file.path !== path || await plugin.app.vault.read(file) !== content) throw Error('Local snapshot changed during upload. Try again.');
  const result = await api(endpoint, 'PUT', {
    message: 'Update ' + filename, content: Buffer.from(content, 'utf8').toString('base64'),
    branch: config.branch, ...(sha ? { sha } : {})
  });
  requireSuccess(result, 'Snapshot upload');
  return { changed: true, path };
}
module.exports = { pushSnapshot };
