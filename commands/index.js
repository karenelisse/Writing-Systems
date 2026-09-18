const { newProject } = require('./project');
const { openDashboard, reorderScenes, applyDashboard } = require('./dashboard');
const {
  newScene,
  deleteScene,
} = require('./scene');
const { compile, compileWorkingDraft } = require('./compile');
const { workingDraftToManuscript } = require('./working-draft');
const { openPaired, validateBook } = require('./navigation');

function registerCommands(plugin) {
  const parts = require('./parts');
  for (const [id, name, fn] of [
    ['open-master-dashboard','Open Master Dashboard',parts.openMaster],
    ['apply-master-dashboard','Apply Master Dashboard',parts.applyMaster],
    ['enable-parts-project','Enable Parts for Project',parts.enableParts],
    ['reorder-parts','Reorder Parts',parts.reorderParts],
    ['move-part-book','Move Part to Book',parts.movePart],
    ['move-scene-part','Move Scene to Part',parts.moveScene],
    ['new-part','New Part',parts.addPart],
    ['recover-writing-project','Recover Writing Project',parts.guarded(async plugin=>{
      const d=plugin.app.workspace.getActiveFile() || await require('./dashboard').chooseDashboard(plugin);if(!d)return;
      const root=require('../services/project').rootFromPath(d.path);if(!root)throw Error('Open a file inside the affected project Plot folder first.');
      const service=require('../services/recovery');const inspection=await service.inspectRecovery(plugin,root);
      const preview={files:inspection.journal.files.map(op=>({source:op.target,target:op.source||'(remove newly created file)'}))};
      new (require('../modals/parts').Preview)(plugin.app,'Recover interrupted operation',preview,parts.guarded(async()=>{await service.recover(plugin,inspection);new (require('obsidian').Notice)('Project recovered.');})).open();
    })],
    ['validate-project','Validate Project',parts.guarded(async plugin => {
      const p = await parts.context(plugin); if (!p) return;
      const lines = await require('../lib/validation').validateProject(plugin,p.root);
      new (require('../modals/validate').ValidateModal)(plugin.app,lines,'Validate Project').open();
    })]
  ]) plugin.addCommand({id,name,callback:()=>fn(plugin)});
  plugin.addCommand({ id:'new-project', name:'New Project', callback:()=>newProject(plugin) });
  plugin.addCommand({ id:'open-dashboard', name:'Open Dashboard', callback:()=>openDashboard(plugin) });
  plugin.addCommand({ id:'new-scene', name:'New Scene', callback:()=>parts.guarded(newScene)(plugin) });
  plugin.addCommand({ id:'delete-scene', name:'Delete Scene', callback:()=>parts.guarded(deleteScene)(plugin) });
  plugin.addCommand({ id:'reorder-scenes', name:'Reorder Scenes', callback:()=>parts.guarded(reorderScenes)(plugin) });
  plugin.addCommand({ id:'apply-dashboard', name:'Apply Dashboard', callback:()=>parts.guarded(applyDashboard)(plugin) });
  plugin.addCommand({ id:'compile-manuscript', name:'Compile Manuscript', callback:()=>compile(plugin, false) });
  plugin.addCommand({ id:'compile-copy', name:'Compile Manuscript and Copy to Clipboard', callback:()=>compile(plugin, true) });
  plugin.addCommand({ id:'clean-working-draft', name:'Remove Working Draft Comments', callback:()=>parts.guarded(require('./working-draft').cleanWorkingDraft)(plugin) });
  plugin.addCommand({ id:'compile-working-draft', name:'Compile Working Draft', callback:()=>compileWorkingDraft(plugin) });
  plugin.addCommand({ id:'working-draft-to-manuscript', name:'Working Draft to Manuscript', callback:()=>parts.guarded(workingDraftToManuscript)(plugin) });
  plugin.addCommand({ id:'open-scene', name:'Open Scene', callback:()=>openPaired(plugin, 'scene') });
  plugin.addCommand({ id:'open-manuscript', name:'Open Manuscript', callback:()=>openPaired(plugin, 'manuscript') });
  plugin.addCommand({ id:'validate-book', name:'Validate Book', callback:()=>validateBook(plugin) });
}

module.exports = { registerCommands };
