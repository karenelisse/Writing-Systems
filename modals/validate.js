const { Modal } = require('obsidian');

class ValidateModal extends Modal {
  constructor(app, lines, title = 'Validate Book') { super(app); this.lines = lines; this.title = title; }
  onOpen() {
    this.contentEl.createEl('h2', { text:this.title });
    this.lines.forEach(x => {
      const p = this.contentEl.createEl('p', { text:x.text });
      p.addClass(x.ok ? 'writing-system-validation-ok' : 'writing-system-validation-warn');
    });
  }
  onClose(){ this.contentEl.empty(); }
}

module.exports = { ValidateModal };
