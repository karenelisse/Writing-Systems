const { Notice, TFile, normalizePath } = require('obsidian');
const { chooseDashboard } = require('./dashboard');
const { bookInfo, parseRows, parseWiki, basename, workingTitleFromDashboard, safeFilename } = require('../lib/dashboard');
const { stripManuscript } = require('../lib/templates');
const { ensureFolder } = require('../services/files');

async function compile(plugin, copyToClipboard) {
  try {
    await compileBook(plugin, copyToClipboard);
  } catch (error) {
    console.error('Writing System compile failed', error);
    new Notice(`Compile failed: ${error?.message || String(error)}`);
  }
}

async function compileBook(plugin, copyToClipboard) {
  const d = await chooseDashboard(plugin);
  if (!d) return;

  const I = bookInfo(d.path);
  const dashboardContent = await plugin.app.vault.read(d);

  let rs;
  try {
    rs = parseRows(dashboardContent);
  } catch (e) {
    new Notice(`Compile failed: ${e.message}`);
    return;
  }

  const bodyParts = [];
  const chapterMap = new Map();
  const hasChapter = rs.some(r => String(r.chapter || '').trim());
  let currentChapter = null;
  let compiled = 0;
  let empty = 0;
  let missing = 0;
  const missingTitles = [];

  for (const r of rs) {
    // Scene title is the canonical key for the Scene/Manuscript pair.
    const sw = parseWiki(r.sceneLink);
    const title = sw.label || basename(sw.path);
    if (!title) continue;

    const manuscriptPath = normalizePath(`${I.bookDir}/Manuscript/${title}.md`);
    const mf = plugin.app.vault.getAbstractFileByPath(manuscriptPath);

    if (!(mf instanceof TFile)) {
      missing++;
      missingTitles.push(title);
      continue;
    }

    const prose = stripManuscript(await plugin.app.vault.read(mf), title);
    if (!prose) {
      empty++;
      continue;
    }

    const ch = String(r.chapter || '').trim();
    if (hasChapter && ch !== currentChapter) {
      bodyParts.push(ch ? `# Chapter ${ch}` : '# Unassigned');
      currentChapter = ch;
    }

    bodyParts.push(prose);
    compiled++;

    if (ch) {
      if (!chapterMap.has(ch)) chapterMap.set(ch, []);
      chapterMap.get(ch).push(prose);
    }
  }

  const workingTitle = workingTitleFromDashboard(dashboardContent, I);
  const seriesTitle = I.projectName || '';
  const titleBlock = seriesTitle && seriesTitle !== workingTitle
    ? `# ${workingTitle}\n\n*${seriesTitle}*`
    : `# ${workingTitle}`;

  const full = bodyParts.length
    ? `${titleBlock}\n\n${bodyParts.join('\n\n')}\n`
    : `${titleBlock}\n`;

  const outDir = normalizePath(`${I.bookDir}/Compiled`);
  await ensureFolder(plugin, `${outDir}/Chapters`);

  const outputName = safeFilename(workingTitle) || I.bookName;
  const outPath = normalizePath(`${outDir}/${outputName}.md`);
  let f = plugin.app.vault.getAbstractFileByPath(outPath);
  if (f instanceof TFile) await plugin.app.vault.modify(f, full);
  else await plugin.app.vault.create(outPath, full);

  for (const [ch, proseParts] of chapterMap) {
    const chapterName = safeFilename(ch) || 'Unassigned';
    const cp = normalizePath(`${outDir}/Chapters/Chapter ${chapterName}.md`);
    const txt = `# Chapter ${ch}\n\n${proseParts.join('\n\n')}\n`;
    f = plugin.app.vault.getAbstractFileByPath(cp);
    if (f instanceof TFile) await plugin.app.vault.modify(f, txt);
    else await plugin.app.vault.create(cp, txt);
  }

  const detail = missingTitles.length
    ? ` Missing: ${missingTitles.slice(0, 5).join(', ')}${missingTitles.length > 5 ? '…' : ''}`
    : '';

  if (copyToClipboard) {
    try {
      await navigator.clipboard.writeText(full);
      new Notice(`Compiled ${compiled} scenes to ${outPath} and copied to clipboard. ${empty} empty; ${missing} missing.${detail}`);
    } catch {
      new Notice(`Compiled ${compiled} scenes to ${outPath}, but clipboard copy failed. ${empty} empty; ${missing} missing.${detail}`);
    }
  } else {
    new Notice(`Compiled ${compiled} scenes to ${outPath}. ${empty} empty; ${missing} missing.${detail}`);
  }

  f = plugin.app.vault.getAbstractFileByPath(outPath);
  if (f instanceof TFile) await plugin.app.workspace.getLeaf(false).openFile(f);
}

module.exports = { compile };
