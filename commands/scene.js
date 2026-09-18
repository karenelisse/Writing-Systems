const { Notice, TFile } = require('obsidian');

const { SceneModal } = require('../modals/scene');

const {
  DeleteSceneModal
} = require('../modals/delete-scene');

const {
  cleanTitle,
  bookInfo,
  parseRows,
  replaceRows,
  extractLinks,
  parseWiki,
  basename,
  stripOrderPrefix
} = require('../lib/dashboard');

const {
  sceneTemplate,
  manuscriptTemplate
} = require('../lib/templates');

const {
  createMissing
} = require('../services/files');

const {
  chooseDashboard,
  applyDashboardFile,
  resolvePairPath
} = require('./dashboard');


async function newScene(plugin) {
  const activeFile = plugin.app.workspace.getActiveFile();
  const d = await chooseDashboard(plugin, {sceneContext:true,activeFile});

  if (!d) return;

  if (await require('./part-scenes').create(plugin,d,{activeFile})) return;

  const I = bookInfo(d.path);

  new SceneModal(plugin.app, async v => {
    const title = cleanTitle(v.title);

    const sp = `${I.bookDir}/Scenes/${title}.md`;
    const mp = `${I.bookDir}/Manuscript/${title}.md`;

    if (
      plugin.app.vault.getAbstractFileByPath(sp) ||
      plugin.app.vault.getAbstractFileByPath(mp)
    ) {
      new Notice(
        'That scene already exists. Use a distinct title such as Pt 2.'
      );

      return;
    }

    const content =
      await plugin.app.vault.read(d);

    const rs =
      parseRows(content);

    const order =
      (rs.length + 1) * 100;

    const locations =
      extractLinks(v.locations);

    await createMissing(
      plugin,
      sp,
      sceneTemplate({
        ...I,
        ...v,
        title,
        locations,
        order
      })
    );

    await createMissing(
      plugin,
      mp,
      manuscriptTemplate({
        ...I,
        ...v,
        title,
        locations,
        order
      })
    );

    rs.push({
      sceneLink: `[[Scenes/${title}|${title}]]`,
      sceneStatus: v.sceneStatus,
      manuscriptLink: `[[Manuscript/${title}|${title}]]`,
      manuscriptStatus: v.manuscriptStatus,
      pov: v.pov ? `[[${v.pov}]]` : '',
      locations: locations.join(', '),
      chapter: v.chapter || ''
    });

    await plugin.app.vault.modify(
      d,
      replaceRows(content, rs)
    );

    await applyDashboardFile(
      plugin,
      d,
      false
    );

    const f =
      plugin.app.vault.getAbstractFileByPath(sp);

    if (f instanceof TFile) {
      await plugin.app.workspace
        .getLeaf(false)
        .openFile(f);
    }

    new Notice(`Created ${title}`);
  }).open();
}


async function deleteScene(plugin) {
  const d =
    await chooseDashboard(plugin);

  if (!d) return;

  if (await require('./part-scenes').remove(plugin,d)) return;

  let rows;

  try {
    const content =
      await plugin.app.vault.read(d);

    rows =
      parseRows(content);
  } catch (e) {
    console.error(
      'Writing System: could not read Dashboard',
      e
    );

    new Notice(
      `Could not read Dashboard: ${e.message}`
    );

    return;
  }

  if (!rows.length) {
    new Notice(
      'There are no scenes to delete.'
    );

    return;
  }

  new DeleteSceneModal(
    plugin.app,
    rows,
    async (selectedIndex, displayedTitle) => {
      try {
        /*
         * Re-read the Dashboard before deleting,
         * in case it changed while the modal was open.
         */
        const currentContent =
          await plugin.app.vault.read(d);

        const currentRows =
          parseRows(currentContent);

        const row =
          currentRows[selectedIndex];

        if (!row) {
          new Notice(
            'That scene is no longer in the Dashboard.'
          );

          return;
        }

        const I =
          bookInfo(d.path);

        const sceneWiki =
          parseWiki(row.sceneLink);

        const manuscriptWiki =
          parseWiki(row.manuscriptLink);

        const title = stripOrderPrefix(
          sceneWiki.label ||
          basename(sceneWiki.path) ||
          manuscriptWiki.label ||
          basename(manuscriptWiki.path) ||
          displayedTitle
        );

        if (!title) {
          throw new Error(
            `Could not determine the scene title for row ${
              selectedIndex + 1
            }.`
          );
        }

        const scenePath =
          resolvePairPath(
            plugin,
            I.bookDir,
            row.sceneLink,
            'Scenes',
            title
          );

        const manuscriptPath =
          resolvePairPath(
            plugin,
            I.bookDir,
            row.manuscriptLink,
            'Manuscript',
            title
          );

        const sceneFile =
          plugin.app.vault.getAbstractFileByPath(
            scenePath
          );

        const manuscriptFile =
          plugin.app.vault.getAbstractFileByPath(
            manuscriptPath
          );

        /*
         * Remove the selected Dashboard row.
         */
        currentRows.splice(
          selectedIndex,
          1
        );

        await plugin.app.vault.modify(
          d,
          replaceRows(
            currentContent,
            currentRows
          )
        );

        /*
         * Move files to Obsidian's local .trash.
         */
        if (sceneFile instanceof TFile) {
          await plugin.app.vault.trash(
            sceneFile,
            false
          );
        }

        if (
          manuscriptFile instanceof TFile
        ) {
          await plugin.app.vault.trash(
            manuscriptFile,
            false
          );
        }

        /*
         * Let the existing Dashboard logic handle
         * renumbering and index regeneration.
         */
        await applyDashboardFile(
          plugin,
          d,
          false
        );

        new Notice(
          `Deleted ${title}`
        );
      } catch (e) {
        console.error(
          'Writing System: delete scene failed',
          e
        );

        new Notice(
          `Could not delete scene: ${e.message}`
        );
      }
    }
  ).open();
}


module.exports = {
  newScene,
  deleteScene
};
