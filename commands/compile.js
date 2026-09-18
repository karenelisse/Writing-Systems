const { Notice, TFile, normalizePath } = require('obsidian');
const { chooseDashboard } = require('./dashboard');
const { bookInfo, parseRows, parseWiki, basename, linkedFilePath, workingTitleFromDashboard, safeFilename } = require('../lib/dashboard');
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
    rs = await require('../lib/compilation').compilationRows(plugin,d,dashboardContent);
  } catch (e) {
    new Notice(`Compile failed: ${e.message}`);
    return;
  }

  const bodyParts = [];
  const chapterMap = new Map();
  const hasChapter = rs.some(r => String(r.chapter || '').trim());
  let currentPart = null;
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

    const manuscriptPath = normalizePath(linkedFilePath(I.bookDir, r.manuscriptLink, 'Manuscript', title));
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

    if (r.partHeading && r.partHeading !== currentPart) { bodyParts.push(r.partHeading); currentPart = r.partHeading; currentChapter = null; }
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

async function compileWorkingDraft(plugin) {
  try {
    const d = await chooseDashboard(plugin);
    if (!d) return;

    const info = bookInfo(d.path);
    const dashboardContent = await plugin.app.vault.read(d);
    const rows = await require('../lib/compilation').compilationRows(plugin,d,dashboardContent);
    const bodyParts = [];
    const sections = [];
    const checks = [{path:d.path,content:dashboardContent}];
    const hasChapter = rows.some(row => String(row.chapter || '').trim());
    let currentPart = null;
    let currentChapter = null;
    let compiled = 0;
    let empty = 0;
    let missing = 0;
    const missingTitles = [];

    for (const row of rows) {
      const sceneWiki = parseWiki(row.sceneLink);
      const title = sceneWiki.label || basename(sceneWiki.path);
      if (!title) continue;

      const manuscriptPath = normalizePath(linkedFilePath(info.bookDir, row.manuscriptLink, 'Manuscript', title));
      const manuscript = plugin.app.vault.getAbstractFileByPath(manuscriptPath);
      if (!(manuscript instanceof TFile)) {
        missing++;
        missingTitles.push(title);
        continue;
      }

      const manuscriptContent = await plugin.app.vault.read(manuscript);
      checks.push({path:manuscriptPath,content:manuscriptContent});
      const prose = stripManuscript(manuscriptContent, title);
      if (!prose) {
        empty++;
        continue;
      }

      const before = [];
      if (row.partHeading && row.partHeading !== currentPart) { before.push(row.partHeading); bodyParts.push(row.partHeading); currentPart = row.partHeading; currentChapter = null; }
      const chapter = String(row.chapter || '').trim();
      if (hasChapter && chapter !== currentChapter) {
        const heading = chapter ? `# Chapter ${chapter}` : '# Unassigned';
        before.push(heading); bodyParts.push(heading);
        currentChapter = chapter;
      }

      const manuscriptLink = manuscriptPath.slice(info.bookDir.length + 1).replace(/\.md$/i, '');
      bodyParts.push(`### [[${manuscriptLink}|${title}]]\n\n${prose}`);
      sections.push({id:row.id || null,path:manuscriptPath,title,before});
      compiled++;
    }

    const workingTitle = workingTitleFromDashboard(dashboardContent, info);
    const seriesTitle = info.projectName || '';
    const titleBlock = seriesTitle && seriesTitle !== workingTitle
      ? `# ${workingTitle} — Working Draft\n\n*${seriesTitle}*`
      : `# ${workingTitle} — Working Draft`;
    const full = bodyParts.length
      ? `${titleBlock}\n\n${bodyParts.join('\n\n')}\n`
      : `${titleBlock}\n`;

    const outDir = normalizePath(`${info.bookDir}/Compiled`);
    const outputName = safeFilename(`${workingTitle} - Working Draft`) || `${info.bookName} - Working Draft`;
    const outPath = normalizePath(`${outDir}/${outputName}.md`);
    let output = await require('../services/working-draft').saveDraft(plugin,outPath,full,{
      kind:require('../lib/working-draft').KIND,version:1,draftPath:outPath,sections
    },checks);

    const detail = missingTitles.length
      ? ` Missing: ${missingTitles.slice(0, 5).join(', ')}${missingTitles.length > 5 ? '…' : ''}`
      : '';
    new Notice(`Compiled working draft with ${compiled} linked scenes to ${outPath}. ${empty} empty; ${missing} missing.${detail}`);

    output = plugin.app.vault.getAbstractFileByPath(outPath);
    if (output instanceof TFile) await plugin.app.workspace.getLeaf(false).openFile(output);
  } catch (error) {
    console.error('Writing System working-draft compile failed', error);
    new Notice(`Working draft compile failed: ${error?.message || String(error)}`);
  }
}

module.exports = { compile, compileWorkingDraft };
