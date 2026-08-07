const { Modal } = require('obsidian');

class ValidateModal extends Modal {
  constructor(app, lines) { super(app); this.lines = lines; }
  onOpen() {
    this.contentEl.createEl('h2', { text:'Validate Book' });
    this.lines.forEach(x => {
      const p = this.contentEl.createEl('p', { text:x.text });
      p.addClass(x.ok ? 'writing-system-validation-ok' : 'writing-system-validation-warn');
    });
  }
  onClose(){ this.contentEl.empty(); }
}

module.exports = { ValidateModal };
