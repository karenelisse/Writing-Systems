const { Modal, Setting } = require('obsidian');

const {
  parseWiki,
  basename,
  stripOrderPrefix
} = require('../lib/dashboard');

class DeleteSceneModal extends Modal {
  constructor(app, rows, onConfirm) {
    super(app);

    this.rows = rows;
    this.onConfirm = onConfirm;
    this.selectedIndex = null;
  }

  onOpen() {
    this.render();
  }

  render() {
    this.contentEl.empty();

    this.contentEl.createEl('h2', {
      text: 'Delete Scene'
    });

    this.contentEl.createEl('p', {
      text: 'Select one scene to delete.'
    });

    const listEl = this.contentEl.createDiv({
      cls: 'writing-system-delete-scene-list'
    });

    this.rows.forEach((row, index) => {
      const wiki = parseWiki(row.sceneLink);

      const title = stripOrderPrefix(
        wiki.label || basename(wiki.path)
      );

      const setting = new Setting(listEl)
        .setName(title)
        .setDesc(`Scene ${index + 1}`);

      setting.addToggle(toggle => {
        toggle.setValue(index === this.selectedIndex);

        toggle.onChange(value => {
          if (value) {
            this.selectedIndex = index;
          } else if (this.selectedIndex === index) {
            this.selectedIndex = null;
          }

          this.render();
        });
      });
    });

    const actions = new Setting(this.contentEl);

    actions.addButton(button => {
      button
        .setButtonText('Cancel')
        .onClick(() => {
          this.close();
        });
    });

    actions.addButton(button => {
      button
        .setButtonText('Delete Scene')
        .setWarning()
        .setDisabled(this.selectedIndex === null)
        .onClick(() => {
          if (this.selectedIndex === null) {
            return;
          }

          const row = this.rows[this.selectedIndex];
          const wiki = parseWiki(row.sceneLink);

          const title = stripOrderPrefix(
            wiki.label || basename(wiki.path)
          );

          const index = this.selectedIndex;

          this.close();

          new ConfirmDeleteSceneModal(
            this.app,
            title,
            () => this.onConfirm(index, title)
          ).open();
        });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmDeleteSceneModal extends Modal {
  constructor(app, title, onConfirm) {
    super(app);

    this.title = title;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    this.contentEl.createEl('h2', {
      text: 'Delete Scene?'
    });

    this.contentEl.createEl('p', {
      text: this.title
    });

    this.contentEl.createEl('p', {
      text:
        'This will remove the scene from the Dashboard and move both its Scene and Manuscript files to Obsidian .trash.'
    });

    const actions = new Setting(this.contentEl);

    actions.addButton(button => {
      button
        .setButtonText('Cancel')
        .onClick(() => {
          this.close();
        });
    });

    actions.addButton(button => {
      button
        .setButtonText('Delete Scene')
        .setWarning()
        .onClick(async () => {
          this.close();
          await this.onConfirm();
        });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

module.exports = {
  DeleteSceneModal,
  ConfirmDeleteSceneModal
};
