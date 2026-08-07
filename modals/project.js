const { Modal, Setting, Notice } = require('obsidian');

class ProjectModal extends Modal {
  constructor(app, cb) {
    super(app);
    this.cb = cb;
    this.v = { name: '', books: 1, optional: [], custom: '' };
  }
  onOpen() {
    const e = this.contentEl;
    e.createEl('h2', { text: 'New writing project' });
    new Setting(e).setName('Project name').setDesc('Existing work is preserved.')
      .addText(t => t.onChange(v => this.v.name = v.trim()));
    new Setting(e).setName('Starting books').setDesc('How many Book folders should exist right now?')
      .addText(t => {
        t.setValue('1');
        t.inputEl.type = 'number';
        t.inputEl.min = '1';
        t.onChange(v => this.v.books = Math.max(1, parseInt(v) || 1));
      });

    e.createEl('h3', { text: 'Optional folders' });
    ['Animals','Species','Lore','Magic','Timeline','Research','Creatures','History','Cultures','Religions','Politics','Organizations','Artifacts','Languages','Plants','Food','Maps']
      .forEach(name => {
        new Setting(e).setName(name).addToggle(toggle => toggle.onChange(on => {
          if (on && !this.v.optional.includes(name)) this.v.optional.push(name);
          if (!on) this.v.optional = this.v.optional.filter(x => x !== name);
        }));
      });

    new Setting(e).setName('Additional folders').setDesc('Comma-separated, optional.')
      .addText(t => t.onChange(v => this.v.custom = v));

    const actions = e.createDiv({ cls: 'writing-system-modal-actions' });
    new Setting(actions)
      .addButton(b => b.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(b => b.setButtonText('Create / complete project').setCta().onClick(async () => {
        if (!this.v.name) return new Notice('Project name is required.');
        this.close();
        await this.cb(this.v);
      }));
  }
  onClose() { this.contentEl.empty(); }
}

module.exports = { ProjectModal };
