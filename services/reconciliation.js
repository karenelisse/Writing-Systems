const { TFile } = require('obsidian');
const { id, layout, parseBook, renderBook, renderMaster, assertPath, validateModel } = require('../lib/project');
const { parseWiki, basename, stripOrderPrefix, numberedName, linkedFilePath, bookInfo, firstLinkName, extractLinks } = require('../lib/dashboard');
const { dashboardTemplate, sceneTemplate, manuscriptTemplate } = require('../lib/templates');
const { frontmatter, updateFrontmatter } = require('./project');
const { validatePlan } = require('./transactions');
const statePath = root => `${root}/Plot/Writing System State.json`;
async function readState(plugin, root) {
  const f = plugin.app.vault.getAbstractFileByPath(statePath(root));
  if (!(f instanceof TFile)) return null;
  const value=JSON.parse(await plugin.app.vault.read(f));
  validateModel(value.model);
  if(!Array.isArray(value.scenes))throw Error('Invalid applied project state.');
  return value;
}
function rewriteLinks(plugin, text, source, target, mapping) {
  function resolve(raw) {
    const hash = raw.indexOf('#');
    const anchor = hash >= 0 ? raw.slice(hash) : '';
    const name = hash >= 0 ? raw.slice(0, hash) : raw;
    if (!name || /^[a-z]+:\/\//i.test(name)) return raw;
    const extension = /\.[a-z0-9]+$/i.test(name) ? '' : '.md';
    const book = source.match(/^(.*\/Plot\/Book \d+)\//);
    const candidates = [name + extension, source.split('/').slice(0,-1).join('/') + '/' + name + extension];
    if (book) candidates.unshift(book[1] + '/' + name + extension);
    const exact = candidates.find(p => mapping.has(p));
    const resolved = exact || plugin.app.metadataCache.getFirstLinkpathDest(name, source)?.path;
    if (!resolved) return raw;
    const newPath = mapping.get(resolved) || resolved;
    if (newPath !== resolved || source !== target) return newPath.replace(/\.md$/i, '') + anchor;
    return raw;
  }
  return text.replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, (_, path, label) => { const escaped=label&&path.endsWith('\\');return `[[${resolve(escaped?path.slice(0,-1):path)}${escaped?'\\':''}${label || ''}]]`; })
    .replace(/(!?\[[^\]\n]*\]\()([^\s)]+)(\))/g, (all, prefix, link, suffix) => {
      let decoded; try { decoded = decodeURIComponent(link); } catch { return all; }
      let next = resolve(decoded); if(next===decoded)return all;
      if(/\.md(?:#|$)/i.test(decoded)&&!/\.md(?:#|$)/i.test(next)){const hash=next.indexOf('#');next=hash<0?next+'.md':next.slice(0,hash)+'.md'+next.slice(hash);}
      return prefix + next.replace(/ /g, '%20') + suffix;
    });
}
async function buildPlan(plugin, project, options = {}) {
  const vault = plugin.app.vault, root = project.root, desired = project.model;
  validateModel(desired);
  const state = await readState(plugin, root);
  if(desired.partsEnabled&&!state&&!options.migration)throw Error('Parts require applied identity records. Use Enable Parts for Project, or restore Writing System State.json if it was lost.');
  const oldModel = state ? state.model : options.baseline || desired;
  if(oldModel.id!==desired.id)throw Error('Project identity cannot be changed.');
  if (state && oldModel.partsEnabled !== desired.partsEnabled && !options.migration) throw Error('Use Enable Parts for Project to change Parts mode.');
  if (oldModel.partsEnabled && !desired.partsEnabled) throw Error('Disabling Parts requires a separate migration and is not supported.');
  for (const book of desired.books) {
    const moved = book.parts.filter(p=>oldModel.books.some(b=>b.id!==book.id&&b.parts.some(old=>old.id===p.id)));
    book.parts=book.parts.filter(p=>!moved.some(m=>m.id===p.id)).concat(moved);
  }
  const oldBooks = layout(oldModel, root), books = layout(desired, root);
  for (const old of oldBooks) {
    if (!books.some(b => b.id === old.id)) throw Error('Removing an existing Book is not supported; its files are preserved.');
    for (const part of old.parts) if (!books.some(b => b.parts.some(p => p.id === part.id))) throw Error('Removing an existing Part is not supported; move its scenes explicitly first.');
  }
  const expectedPartDirs = new Set(oldBooks.flatMap(b=>b.parts.flatMap(p=>['Scenes','Manuscript'].map(folder=>b.dir+'/'+folder+'/Part '+p.number))));
  const leftoverFolders = [];
  for(const f of vault.getAllLoadedFiles()) {
    if(f.path.startsWith(root+'/Plot/') && /\/(?:Scenes|Manuscript)\/Part \d+$/.test(f.path) && !expectedPartDirs.has(f.path)) {
      if (!await require('./files').folderIsEmpty(plugin,f)) throw Error('Unrecognized Part folder must be resolved before Apply: '+f.path);
      leftoverFolders.push(f.path);
    }
  }
  const snapshot = new Map();
  for (const f of vault.getFiles().filter(f => f.path.startsWith(root + '/'))) {
    snapshot.set(f.path, { file: f, text: /\.(?:md|json)$/i.test(f.path) ? await vault.read(f) : undefined });
  }
  if ('expectedMasterText' in project && (snapshot.get(project.path)?.text ?? null) !== project.expectedMasterText) throw Error('Master Dashboard changed; reopen the command.');
  const inheritedChunks = new Map();
  const rows = [], dashboards = new Map(), known = new Map((state?.scenes || []).map(s => [s.id, s]));
  if (options.sceneMove && (!desired.partsEnabled || !known.has(options.sceneMove.id) || !books.some(book=>book.parts.some(part=>part.id===options.sceneMove.partId)))) throw Error('Unknown Scene or destination Part in this project.');
  const usedSceneIds = new Set(), usedSources = new Set();
  for (const oldBook of oldBooks) {
    const path = oldBook.dir + '/Dashboard.md';
    const original = snapshot.get(path)?.text;
    if (original === undefined) throw Error(`Missing Dashboard: ${path}`);
    dashboards.set(oldBook.id, original);
    if (oldModel.partsEnabled) { const body = require('../lib/project').region(original,require('../lib/dashboard').START,require('../lib/dashboard').END).body; const chunks=body.split(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/); for(let i=1;i<chunks.length;i+=2)inheritedChunks.set(chunks[i],chunks[i+1]); }
    const parsed = parseBook(original, oldModel.partsEnabled);
    if (oldModel.partsEnabled && JSON.stringify(parsed.parts) !== JSON.stringify(oldBook.parts.map(p => p.id))) throw Error(`Part sections disagree with applied Master: ${path}`);
    const input = options.rows?.get(oldBook.id) || parsed.rows;
    const chapterParts = new Map();
    if (oldModel.partsEnabled) {
      for (const part of oldBook.parts) for (const folder of ['Scenes','Manuscript']) {
        const path = oldBook.dir + '/' + folder + '/Part ' + part.number + '/Part Identity.json';
        if (snapshot.has(path)) {
          const marker = JSON.parse(snapshot.get(path).text);
          if (marker.partId !== part.id || marker.bookId !== oldBook.id || marker.projectId !== oldModel.id) throw Error('Conflicting Part ownership: ' + path);
        }
      }
      for (const row of input) if (String(row.chapter || '').trim()) {
        const key = String(row.chapter).trim();
        if (chapterParts.has(key) && chapterParts.get(key) !== row.partId) throw Error('A Chapter cannot span Parts.');
        chapterParts.set(key,row.partId);
      }
    }
    for (const raw of input) {
      const row = { ...raw, oldBookId: oldBook.id };
      const sw = parseWiki(row.sceneLink);
      row.title = stripOrderPrefix(sw.label || basename(sw.path));
      if (!row.title) throw Error('A Scene has no title.');
      assertPath(row.title + '.md');
      if (row.title.includes('/')) throw Error('Scene title cannot contain a path.');
      row.sceneSource = linkedFilePath(oldBook.dir, row.sceneLink, 'Scenes', row.title);
      row.manuscriptSource = linkedFilePath(oldBook.dir, row.manuscriptLink, 'Manuscript', row.title);
      for (const [field, folder] of [['sceneSource','Scenes'],['manuscriptSource','Manuscript']]) {
        assertPath(row[field]);
        if (!row[field].startsWith(oldBook.dir + '/' + folder + '/')) throw Error('Individual Scenes cannot move between Books.');
        if (!oldModel.partsEnabled && !snapshot.has(row[field])) {
          const matches = [...snapshot.keys()].filter(p => p.startsWith(oldBook.dir + '/' + folder + '/') && p.split('/').length === row[field].split('/').length && stripOrderPrefix(basename(p)) === row.title);
          if (matches.length > 1) throw Error(`Ambiguous pair: ${row.title}`);
          if (matches.length === 1) row[field] = matches[0];
        }
      }
      const sf = snapshot.get(row.sceneSource), mf = snapshot.get(row.manuscriptSource);
      const previous = [...known.values()].find(s => s.scenePath === row.sceneSource || s.manuscriptPath === row.manuscriptSource);
      row.id = row.id || previous?.id || (sf ? frontmatter(sf.text).writing_scene_id : '') || id();
      if (usedSceneIds.has(row.id)) throw Error('Duplicate Scene identity.'); usedSceneIds.add(row.id);
      const established = known.get(row.id);
      if (established && established.bookId !== oldBook.id) throw Error('Individual Scenes cannot move between Books.');
      if ((!!sf !== !!mf) || ((!sf || !mf) && established)) throw Error(`Incomplete existing pair: ${row.title}`);
      for (const source of [row.sceneSource,row.manuscriptSource]) {
        if (usedSources.has(source.toLowerCase())) throw Error(`Duplicate pair source: ${source}`); usedSources.add(source.toLowerCase());
      }
      if (sf && mf) {
        if(stripOrderPrefix(basename(row.sceneSource))!==stripOrderPrefix(basename(row.manuscriptSource)))throw Error('Scene and Manuscript filenames do not form a pair: '+row.title);
        const a = frontmatter(sf.text), b = frontmatter(mf.text);
        if ((a.writing_scene_id && a.writing_scene_id !== row.id) || (b.writing_scene_id && b.writing_scene_id !== row.id)) throw Error(`Pair identity disagreement: ${row.title}`);
      }
      if (options.migration) row.partId = books.find(b => b.id === oldBook.id).parts[0]?.id;
      if (options.sceneMove?.id === row.id) { row.partId = options.sceneMove.partId; row.chapter = ''; }
      if (desired.partsEnabled && !row.partId) throw Error('Every Scene requires a Part.');
      if (oldModel.partsEnabled && established && established.partId !== row.partId && options.sceneMove?.id !== row.id && !options.migration) throw Error('Use Move Scene to Part to change Scene ownership.');
      const owner = desired.partsEnabled ? books.find(b => b.parts.some(p => p.id === row.partId)) : books.find(b => b.id === oldBook.id);
      if (!owner) throw Error(`Unknown Part for ${row.title}`);

      row.bookId = owner.id;
      rows.push(row);
    }
  }
  for (const scene of known.values()) if (!usedSceneIds.has(scene.id) && scene.id !== options.deleteId) throw Error('An existing Scene row was removed. Use Delete Scene rather than removing rows.');
  for (const [path] of snapshot) if (/\/(?:Scenes|Manuscript)\/(?:Part \d+\/)?[^/]+\.md$/i.test(path) && !usedSources.has(path.toLowerCase()) && !(options.deleteId && [known.get(options.deleteId)?.scenePath,known.get(options.deleteId)?.manuscriptPath].includes(path))) throw Error(`Unlisted Scene/Manuscript file must be resolved before Apply: ${path}`);
  const mapping = new Map();
  const sourceFolders=vault.getAllLoadedFiles().filter(f=>f.children&&f.path.startsWith(root+'/')&&!leftoverFolders.includes(f.path)).map(f=>f.path);
  for (const path of [...snapshot.keys(),...sourceFolders]) {
    const oldBook = oldBooks.find(b => path.startsWith(b.dir + '/'));
    if (!oldBook) { mapping.set(path, path); continue; }
    const nextBook = books.find(b => b.id === oldBook.id);
    let target = nextBook.dir + path.slice(oldBook.dir.length);
    for (const part of oldBook.parts) for (const folder of ['Scenes','Manuscript']) {
      const prefix = `${oldBook.dir}/${folder}/Part ${part.number}`;
      if (path === prefix || path.startsWith(prefix + '/')) {
        const owner = books.find(b => b.parts.some(p => p.id === part.id));
        const next = owner.parts.find(p => p.id === part.id);
        target = `${owner.dir}/${folder}/Part ${next.number}` + path.slice(prefix.length);
      }
    }
    mapping.set(path, target);
  }
  if (options.deleteId) {
    const deleted = known.get(options.deleteId);
    if (!deleted || !snapshot.has(deleted.scenePath) || !snapshot.has(deleted.manuscriptPath)) throw Error('Cannot delete an incomplete pair.');
    mapping.set(deleted.scenePath, deleted.scenePath);
    mapping.set(deleted.manuscriptPath, deleted.manuscriptPath);
  }
  const output = new Map(), folders = sourceFolders.map(path=>mapping.get(path)), sceneState = [];
  const obsoleteFolders=sourceFolders.filter(path=>mapping.get(path)!==path).concat(leftoverFolders);
  for (const book of books) {
    let ordered = desired.partsEnabled ? book.parts.flatMap(p => rows.filter(r => r.bookId === book.id && r.partId === p.id)) : rows.filter(r => r.bookId === book.id);
    if (options.sceneMove) ordered = ordered.filter(r => r.id !== options.sceneMove.id).concat(ordered.filter(r => r.id === options.sceneMove.id));
    if (desired.partsEnabled) ordered = book.parts.flatMap(p => ordered.filter(r => r.partId === p.id));
    let chapter = 0, current = null;
    const seenChapter = new Set();
    const counters = new Map();
    for (let index = 0; index < ordered.length; index++) {
      const row = ordered[index], part = book.parts.find(p => p.id === row.partId);
      const countKey = part?.id || book.id;
      const position = (counters.get(countKey) || 0) + 1; counters.set(countKey, position);
      const total = ordered.filter(r => (r.partId || book.id) === countKey).length;
      const name = numberedName(row.title, position, total);
      const suffix = part ? `/Part ${part.number}` : '';
      const sp = `${book.dir}/Scenes${suffix}/${name}.md`, mp = `${book.dir}/Manuscript${suffix}/${name}.md`;
      mapping.set(row.sceneSource, sp); mapping.set(row.manuscriptSource, mp);
      const ch = String(row.chapter || '').trim();
      if (desired.partsEnabled && ch) {
        if (!/^[1-9]\d*$/.test(ch)) throw Error('Chapter must be a positive integer or blank.');
        const token = `${row.oldBookId}:${row.partId}:${ch}`;
        if (token !== current) { if (seenChapter.has(token)) throw Error('Chapter Scenes must be contiguous.'); seenChapter.add(token); chapter++; current = token; }
        row.chapter = String(chapter);
      } else if (!ch) current = null;
      const info = bookInfo(book.dir + '/Dashboard.md');
      const values = { writing_project_id: desired.id, writing_book_id: book.id, writing_scene_id: row.id, book: info.bookName, book_number: book.number, story_order: (index + 1) * 100, chapter: row.chapter ? Number(row.chapter) || row.chapter : '', pov: firstLinkName(row.pov) ? [`[[${firstLinkName(row.pov)}]]`] : [], locations: extractLinks(row.locations) };
      if (part) Object.assign(values, { writing_part_id: part.id, part_number: part.number, part_name: part.name, part_order: position * 100 });
      for (const [source,target,type,pair] of [[row.sceneSource,sp,'scene',mp],[row.manuscriptSource,mp,'manuscript',sp]]) {
        const old = snapshot.get(source);
        const template = type === 'scene' ? sceneTemplate : manuscriptTemplate;
        let text = old?.text ?? template({ ...info, title: row.title, order: values.story_order, locations: values.locations });
        const fm = frontmatter(text);
        const tags = [...new Set([...(Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : []), type])];
        const owned = { ...values, tags, status: type === 'scene' ? row.sceneStatus || 'Planned' : row.manuscriptStatus || 'Not Started', [type === 'scene' ? 'manuscript' : 'scene']: `[[${pair.replace(/\.md$/, '')}]]` };
        text = updateFrontmatter(text, owned);
        output.set(target, { source: old ? source : null, target, before: old?.text, after: text, pairValues: owned });
      }
      row.sceneLink = `[[${sp.replace(/\.md$/, '')}|${row.title}]]`;
      row.manuscriptLink = `[[${mp.replace(/\.md$/, '')}|${row.title}]]`;
      sceneState.push({ id: row.id, bookId: book.id, partId: row.partId || null, scenePath: sp, manuscriptPath: mp });
    }
    const old = oldBooks.find(b => b.id === book.id), source = old ? old.dir + '/Dashboard.md' : null;
    let text = dashboards.get(book.id) || dashboardTemplate(`Book ${book.number}`, book.title);
    text = renderBook(text, ordered, book, desired.partsEnabled, inheritedChunks);
    text = text.replace(/^# Book \d+ Dashboard$/m, '# Book '+book.number+' Dashboard');
    text = updateFrontmatter(text, { writing_project_id: desired.id, writing_book_id: book.id, book: `Book ${book.number}` });
    output.set(book.dir + '/Dashboard.md', { source, target: book.dir + '/Dashboard.md', before: source ? snapshot.get(source)?.text : undefined, after: text });
    for (const folder of ['Scenes','Manuscript','Compiled']) folders.push(book.dir + '/' + folder);
    for (const part of book.parts) for (const folder of ['Scenes','Manuscript']) {
      const dir = `${book.dir}/${folder}/Part ${part.number}`; folders.push(dir);
      const target = dir + '/Part Identity.json';
      const source = [...mapping.entries()].find(([s,t]) => t === target)?.[0] || null;
      output.set(target, { source, target, before: source ? snapshot.get(source)?.text : undefined, after: JSON.stringify({ projectId: desired.id, bookId: book.id, partId: part.id }) });
    }
    for (const [filename, field] of [['Scene Index.md','sceneLink'],['Manuscript Index.md','manuscriptLink']]) {
      const target = book.dir + '/' + filename;
      const source = old && snapshot.has(old.dir + '/' + filename) ? old.dir + '/' + filename : null;
      const after = `---\ngenerated_from: Dashboard\n---\n\n# ${filename.replace('.md','')}\n\n` + (desired.partsEnabled ? book.parts.map(p => `## Part ${p.number} — ${p.name}\n\n` + ordered.filter(r => r.partId === p.id).map(r => '- ' + r[field]).join('\n')).join('\n\n') : ordered.map(r => '- ' + r[field]).join('\n')) + '\n';
      if (source && !/generated_from: Dashboard/.test(snapshot.get(source).text)) throw Error(`Refusing to replace an unrecognized index: ${source}`);
      output.set(target,{source,target,before:source?snapshot.get(source).text:undefined,after});
    }
  }
  const deleted=options.deleteId?known.get(options.deleteId):null;
  const deletedPaths=deleted?[deleted.scenePath,deleted.manuscriptPath]:[];
  for (const [source, item] of snapshot) {
    if(deletedPaths.includes(source))continue;
    const target = mapping.get(source);
    if (!output.has(target)) output.set(target,{source,target,before:item.text,after:item.text});
  }
  const master = project.path;
  output.set(master,{source:snapshot.has(master)?master:null,target:master,before:snapshot.get(master)?.text,after:renderMaster(desired,project.text || undefined)});
  const stateFile = statePath(root);
  output.set(stateFile,{source:snapshot.has(stateFile)?stateFile:null,target:stateFile,before:snapshot.get(stateFile)?.text,after:JSON.stringify({model:desired,scenes:sceneState},null,2)});
  for (const op of output.values()) {
    if (op.target.endsWith('.sync.json') && typeof op.after === 'string') {
      let metadata;
      try { metadata = JSON.parse(op.after); } catch { metadata = null; }
      const draftTools = require('../lib/working-draft');
      if (metadata?.kind === draftTools.KIND) op.after = JSON.stringify(draftTools.remapMetadata(metadata,mapping),null,2);
    }
    if (!/\.md$/i.test(op.target) || op.after === undefined) continue;
    if (op.pairValues) {
      const original = op.before === undefined ? op.after : op.before;
      op.after = updateFrontmatter(rewriteLinks(plugin,original,op.source || op.target,op.target,mapping),op.pairValues);
      delete op.pairValues;
    } else if (op.target.endsWith('/Dashboard.md')) {
      const { START, END } = require('../lib/dashboard');
      const a = op.after.indexOf(START), b = op.after.indexOf(END) + END.length;
      let noteSource=op.source || op.target;
      const managed=op.after.slice(a,b).split('\n').map(line=>{
        const part=line.match(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/);
        if(part){const owner=oldBooks.find(book=>book.parts.some(p=>p.id===part[1]));noteSource=owner?owner.dir+'/Dashboard.md':op.source || op.target;}
        return line.trim().startsWith('|')?line:rewriteLinks(plugin,line,noteSource,op.target,mapping);
      }).join('\n');
      op.after = rewriteLinks(plugin,op.after.slice(0,a),op.source || op.target,op.target,mapping) + managed + rewriteLinks(plugin,op.after.slice(b),op.source || op.target,op.target,mapping);
    } else if (!/\/(?:Master Dashboard|Scene Index|Manuscript Index)\.md$/.test(op.target)) {
      op.after = rewriteLinks(plugin,op.after,op.source || op.target,op.target,mapping);
    }
  }
  // Incoming links from notes outside this project are included in the same transaction.
  for (const f of vault.getMarkdownFiles().filter(f => !f.path.startsWith(root + '/'))) {
    const before = await vault.read(f), after = rewriteLinks(plugin,before,f.path,f.path,mapping);
    if (after !== before) output.set(f.path,{source:f.path,target:f.path,before,after});
  }
  const files = [...output.values()].filter(op => op.trash || !op.source || op.source !== op.target || op.before !== op.after);
  for(const path of deletedPaths)files.push({source:path,target:root+'/Writing System Deleted '+id()+'/'+path.split('/').pop(),before:snapshot.get(path).text,trash:true});
  const checks = [...snapshot].filter(([path,item]) => item.text !== undefined).map(([path,item]) => ({path,content:item.text}));
  const inventory = [...snapshot.keys()].sort();
  const plan = {root,files,folders:[...new Set(folders)],checks,inventory,obsoleteFolders}; validatePlan(plugin,plan); return plan;
}
module.exports = { buildPlan, readState, statePath, rewriteLinks };
