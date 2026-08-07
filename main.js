const { Plugin } = require('obsidian');
const { registerCommands } = require('./commands');
const { openDashboard } = require('./commands/dashboard');

module.exports = class WritingSystem extends Plugin {
  async onload() {
    registerCommands(this);
    this.addRibbonIcon('book-open', 'Open writing dashboard', () => openDashboard(this));
  }
};
