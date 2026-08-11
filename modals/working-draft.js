const { Modal, Setting } = require('obsidian');

class WorkingDraftSyncModal extends Modal {
  constructor(app, changes, onUpdate) {
    super(app);
    this.changes = changes;
    this.onUpdate = onUpdate;
    this.checkboxes = [];
  }

  onOpen() {
    const root = this.contentEl;
    root.addClass('writing-system-working-draft-modal');
    root.createEl('h2', { text: 'Working Draft to Manuscript' });
    root.createEl('p', {
      text: 'Only the checked Manuscript files will be replaced with prose from this Working Draft.'
    });

    const controls = root.createDiv({ cls: 'writing-system-selection-controls' });
    const selectAll = controls.createEl('button', { text: 'Select all' });
    const selectNone = controls.createEl('button', { text: 'Select none' });
    selectAll.onclick = () => this.setAll(true);
    selectNone.onclick = () => this.setAll(false);

    const list = root.createDiv({ cls: 'writing-system-change-list' });
    this.changes.forEach((change, index) => {
      const row = list.createDiv({ cls: 'writing-system-change-row' });
      const checkbox = row.createEl('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.id = `writing-system-change-${index}`;
      const label = row.createEl('label', { text: change.title });
      label.htmlFor = checkbox.id;
      row.createDiv({ cls: 'writing-system-change-path', text: change.path });
      this.checkboxes.push({ checkbox, change });
    });

    const actions = root.createDiv({ cls: 'writing-system-modal-actions' });
    new Setting(actions)
      .addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(button => button.setButtonText('Update selected').setCta().onClick(async () => {
        const selected = this.checkboxes.filter(item => item.checkbox.checked).map(item => item.change);
        this.close();
        await this.onUpdate(selected);
      }));
  }

  setAll(checked) {
    this.checkboxes.forEach(item => { item.checkbox.checked = checked; });
  }

  onClose() {
    this.checkboxes = [];
    this.contentEl.empty();
  }
}

module.exports = { WorkingDraftSyncModal };
