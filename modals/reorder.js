const { Modal, Setting } = require('obsidian');
const { parseWiki, basename } = require('../lib/dashboard');

class ReorderModal extends Modal {
  constructor(app, rows, onSave) {
    super(app);
    this.rows = rows.map(r => ({...r}));
    this.onSave = onSave;
  }
  name(row) {
    const x = parseWiki(row.sceneLink);
    return x.label || basename(x.path) || row.sceneLink;
  }
  draw() {
    const e = this.contentEl;
    e.empty();
    e.createEl('h2', { text:'Reorder scenes' });
    e.createEl('p', { text:'Use ↑ / ↓. Save order + apply updates the Dashboard and paired files.' });
    this.rows.forEach((row, i) => {
      const wrap = e.createDiv({ cls:'writing-system-reorder-row' });
      const up = wrap.createEl('button', { text:'↑' });
      const down = wrap.createEl('button', { text:'↓' });
      wrap.createDiv({ cls:'writing-system-reorder-title', text:this.name(row) });
      up.disabled = i === 0;
      down.disabled = i === this.rows.length - 1;
      up.onclick = () => { [this.rows[i-1], this.rows[i]] = [this.rows[i], this.rows[i-1]]; this.draw(); };
      down.onclick = () => { [this.rows[i+1], this.rows[i]] = [this.rows[i], this.rows[i+1]]; this.draw(); };
    });
    const actions = e.createDiv({ cls:'writing-system-modal-actions' });
    new Setting(actions)
      .addButton(b=>b.setButtonText('Cancel').onClick(()=>this.close()))
      .addButton(b=>b.setButtonText('Save order + apply').setCta().onClick(async()=>{
        const rows = this.rows;
        this.close();
        await this.onSave(rows);
      }));
  }
  onOpen(){ this.draw(); }
  onClose(){ this.contentEl.empty(); }
}

module.exports = { ReorderModal };
