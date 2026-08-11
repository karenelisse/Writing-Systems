const { newProject } = require('./project');
const { openDashboard, reorderScenes, applyDashboard } = require('./dashboard');
const { newScene } = require('./scene');
const { compile, compileWorkingDraft } = require('./compile');
const { workingDraftToManuscript } = require('./working-draft');
const { openPaired, validateBook } = require('./navigation');

function registerCommands(plugin) {
  plugin.addCommand({ id:'new-project', name:'New Project', callback:()=>newProject(plugin) });
  plugin.addCommand({ id:'open-dashboard', name:'Open Dashboard', callback:()=>openDashboard(plugin) });
  plugin.addCommand({ id:'new-scene', name:'New Scene', callback:()=>newScene(plugin) });
  plugin.addCommand({ id:'reorder-scenes', name:'Reorder Scenes', callback:()=>reorderScenes(plugin) });
  plugin.addCommand({ id:'apply-dashboard', name:'Apply Dashboard', callback:()=>applyDashboard(plugin) });
  plugin.addCommand({ id:'compile-manuscript', name:'Compile Manuscript', callback:()=>compile(plugin, false) });
  plugin.addCommand({ id:'compile-copy', name:'Compile Manuscript and Copy to Clipboard', callback:()=>compile(plugin, true) });
  plugin.addCommand({ id:'compile-working-draft', name:'Compile Working Draft', callback:()=>compileWorkingDraft(plugin) });
  plugin.addCommand({ id:'working-draft-to-manuscript', name:'Working Draft to Manuscript', callback:()=>workingDraftToManuscript(plugin) });
  plugin.addCommand({ id:'open-scene', name:'Open Scene', callback:()=>openPaired(plugin, 'scene') });
  plugin.addCommand({ id:'open-manuscript', name:'Open Manuscript', callback:()=>openPaired(plugin, 'manuscript') });
  plugin.addCommand({ id:'validate-book', name:'Validate Book', callback:()=>validateBook(plugin) });
}

module.exports = { registerCommands };
