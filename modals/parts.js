const { Modal, Setting } = require('obsidian');
class Choices extends Modal {
  constructor(app,title,items,callback) { super(app); Object.assign(this,{title,items,callback}); }
  onOpen() { this.contentEl.createEl('h2',{text:this.title}); if(!this.items.length)this.contentEl.createEl('p',{text:'No available choices. Close this dialog to continue.'}); for(const item of this.items) new Setting(this.contentEl).setName(item.label).addButton(b=>b.setButtonText('Choose').onClick(()=>{this.close();this.callback(item.value);})); }
  onClose() { this.contentEl.empty(); }
}
class TextPrompt extends Modal {
  constructor(app,title,initial,callback) {super(app);Object.assign(this,{title,value:initial,callback});}
  onOpen(){this.contentEl.createEl('h2',{text:this.title});new Setting(this.contentEl).addText(t=>t.setValue(this.value).onChange(v=>this.value=v));new Setting(this.contentEl).addButton(b=>b.setButtonText('Continue').onClick(()=>{if(!this.value.trim())return;this.close();this.callback(this.value.trim());}));}
  onClose(){this.contentEl.empty();}
}
class Preview extends Modal {
  constructor(app,title,plan,callback){super(app);Object.assign(this,{title,plan,callback});}
  onOpen(){const e=this.contentEl;e.createEl('h2',{text:this.title});e.createEl('p',{text:'Review the complete file plan. Existing prose and custom Dashboard content are preserved.'});const list=e.createDiv({cls:'writing-system-change-list'});for(const op of this.plan.files)list.createEl('p',{text:op.source?(op.source===op.target?'Update '+op.target:op.source+' → '+op.target):'Create '+op.target});for(const path of this.plan.obsoleteFolders || []) if(!(this.plan.folders || []).includes(path)) list.createEl('p',{text:'Remove if empty: '+path});new Setting(e).addButton(b=>b.setButtonText('Cancel').onClick(()=>this.close())).addButton(b=>b.setButtonText('Apply').setCta().onClick(async()=>{this.close();await this.callback();}));}
  onClose(){this.contentEl.empty();}
}
module.exports={Choices,TextPrompt,Preview};
