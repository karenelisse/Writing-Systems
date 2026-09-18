const { Plugin } = require('obsidian');
const { registerCommands } = require('./commands');
const { openDashboard } = require('./commands/dashboard');

module.exports = class WritingSystem extends Plugin {
  async onload() {
    registerCommands(this);
    this.app.workspace.onLayoutReady(()=>{
      const journals=this.app.vault.getFiles().filter(f=>f.path.endsWith('/Writing System Operation.json'));
      if(journals.length)new (require('obsidian').Notice)('Writing System found interrupted operations. Run Recover Writing Project before applying changes.',10000);
    });
    this.addRibbonIcon('book-open', 'Open writing dashboard', () => openDashboard(this));
  }
};
