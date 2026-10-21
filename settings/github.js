const { Notice } = require('obsidian');
const DEFAULTS = { enabled: false, autoPush: true, repository: '', branch: 'main', secretName: '' };
function githubSettings(plugin) { return { ...DEFAULTS, ...(plugin.settings?.github || {}) }; }
async function saveSettings(plugin) { await plugin.saveData(plugin.settings); }
async function initialize(plugin) {
  plugin.settings = (await plugin.loadData()) || {};
  plugin.settings.github = githubSettings(plugin);
  plugin.settings.snapshotNames = plugin.settings.snapshotNames || {};
  const { PluginSettingTab, Setting, SecretComponent } = require('obsidian');
  class GitHubTab extends PluginSettingTab {
    display() {
      const el = this.containerEl;
      el.empty();
      el.createEl('h2', { text: 'GitHub manuscript snapshots' });
      el.createEl('p', { text: 'Snapshots are saved to Writing/compiled/. Only the relevant snapshot is uploaded; existing compiled files and Working Drafts stay in place.' });
      const change = async (key, value) => {
        plugin.settings.github[key] = value;
        try { await saveSettings(plugin); } catch { new Notice('Writing System could not save GitHub settings.'); }
      };
      const config = githubSettings(plugin);
      new Setting(el).setName('Enable GitHub integration').addToggle(c => c.setValue(config.enabled).onChange(v => change('enabled', v)));
      new Setting(el).setName('Automatically push snapshots').setDesc('Turn off to save snapshots locally without uploading.').addToggle(c => c.setValue(config.autoPush).onChange(v => change('autoPush', v)));
      new Setting(el).setName('Repository').setDesc('Private repository in owner/repository format.').addText(c => c.setPlaceholder('owner/repository').setValue(config.repository).onChange(v => change('repository', v.trim())));
      new Setting(el).setName('Branch').addText(c => c.setValue(config.branch).onChange(v => change('branch', v.trim())));
      const auth = new Setting(el).setName('GitHub authentication');
      if (plugin.app.secretStorage && SecretComponent && typeof auth.addComponent === 'function') {
        auth.setDesc('Select or create a secret containing a GitHub token with Contents read/write access to your manuscript repository.')
          .addComponent(container => new SecretComponent(plugin.app, container).setValue(config.secretName).onChange(v => change('secretName', v)));
      } else {
        auth.setDesc('This Obsidian version has no secret picker. The token is held only until the plugin reloads; it is never saved to plugin settings.')
          .addText(c => { c.inputEl.type = 'password'; c.inputEl.autocomplete = 'off'; c.setPlaceholder('Session-only token').onChange(v => { plugin.githubSessionToken = v.trim(); }); });
      }
    }
  }
  plugin.addSettingTab(new GitHubTab(plugin.app, plugin));
}
async function authentication(plugin, config) {
  let token;
  try {
    token = config.secretName && plugin.app.secretStorage
      ? await plugin.app.secretStorage.getSecret(config.secretName)
      : plugin.githubSessionToken;
  } catch { throw Error('Could not read GitHub authentication. Check your secret in Writing System settings.'); }
  if (!token || typeof token !== 'string' || !token.trim()) throw Error('Configure GitHub authentication in Writing System settings.');
  return token.trim();
}
module.exports = { DEFAULTS, githubSettings, initialize, saveSettings, authentication };
