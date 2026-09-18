const { parseRows, renderRows, START, END } = require('./dashboard');
const MASTER_START = '<!-- WRITING-SYSTEM:PROJECT:START -->';
const MASTER_END = '<!-- WRITING-SYSTEM:PROJECT:END -->';
function id() { return require('crypto').randomBytes(16).toString('hex'); }
function assertPath(path) {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..' || /[<>:"|?*\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error(`Unsafe path: ${path}`);
  return path;
}
function region(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < a || text.indexOf(start, a + start.length) !== -1 || text.indexOf(end, b + end.length) !== -1) throw Error('Missing or duplicate managed markers.');
  return { before: text.slice(0, a + start.length), body: text.slice(a + start.length, b), after: text.slice(b) };
}
function validateModel(model) {
  if (model.version !== 1 || typeof model.partsEnabled !== 'boolean' || !Array.isArray(model.books) || !model.books.length || (model.partHeadings !== undefined && typeof model.partHeadings !== 'boolean')) throw Error('Unsupported project format.');
  const ids = new Set();
  const unique = value => { if (!/^[a-f0-9]{32}$/.test(value || '') || ids.has(value)) throw Error('Missing or duplicate stable identity.'); ids.add(value); };
  unique(model.id);
  model.books.forEach(book => {
    unique(book.id);
    if (typeof book.title !== 'string' || /[\r\n]/.test(book.title) || !Array.isArray(book.parts)) throw Error('Invalid Book.');
    book.parts.forEach(part => { unique(part.id); if (typeof part.name !== 'string' || !part.name.trim() || /[\r\n]/.test(part.name)) throw Error('Part needs a one-line descriptive name.'); });
    if (!model.partsEnabled && book.parts.length) throw Error('Flat projects cannot contain Parts.');
  });
  return model;
}
function parseMaster(text) {
  const body = region(text, MASTER_START, MASTER_END).body.trim();
  const match = body.match(/```json\s*\n([\s\S]*?)\n```$/);
  if (!match || (body.match(/```json/g) || []).length !== 1) throw Error('Master Dashboard requires exactly one managed JSON definition.');
  return validateModel(JSON.parse(match[1]));
}
function renderMaster(model, text = '# Master Dashboard\n\nBooks and Parts are ordered by their position in the definition. Keep IDs unchanged. Edit titles and Part names here, then Apply Master Dashboard.\n\n' + MASTER_START + '\n' + MASTER_END + '\n') {
  validateModel(model);
  const r = region(text, MASTER_START, MASTER_END);
  const outline = layout(model,'').map(book => `## Book ${book.number} — ${book.title}\n\n` + book.parts.map(p => `- Part ${p.number} — ${p.name}`).join('\n')).join('\n\n');
  return r.before + '\n\n' + outline + '\n\nEdit the definition below; the outline above updates when applied.\n\n```json\n' + JSON.stringify(model, null, 2) + '\n```\n\n' + r.after;
}
function layout(model, root) {
  let number = 0;
  return model.books.map((b, i) => ({ ...b, number: i + 1, dir: `${root}/Plot/Book ${i + 1}`, parts: b.parts.map(p => ({ ...p, number: ++number })) }));
}
function parseBook(text, enabled) {
  if (!enabled) return { rows: parseRows(text), parts: [] };
  const r = region(text, START, END);
  const chunks = r.body.split(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/);
  if (chunks[0].trim()) throw Error('Scenes must belong to a Part section.');
  const parts = [], rows = [];
  for (let i = 1; i < chunks.length; i += 2) {
    const partId = chunks[i];
    if (parts.includes(partId)) throw Error('Duplicate Part section.');
    parts.push(partId);
    const chunk = chunks[i + 1];
    const parsed = parseRows(START + '\n' + chunk + '\n' + END);
    const identities = chunk.split(/\r?\n/).filter(line => line.trim().startsWith('|')).slice(2).map(line => line.match(/<!-- scene:([a-f0-9]{32}) -->/)?.[1] || '');
    parsed.forEach((row, index) => rows.push({ ...row, partId, id: identities[index] || '' }));
    if (identities.length !== parsed.length) throw Error('Malformed Part table.');
  }
  return { rows, parts };
}
function tableSurround(text) {
  const matches = [...text.matchAll(/^\|.*$/gm)];
  if (!matches.length) return {before:text,after:''};
  const first=matches[0], last=matches[matches.length-1];
  const middle=text.slice(first.index,last.index+last[0].length);
  if(middle.split(/\r?\n/).some(line=>line.trim()&&!line.trim().startsWith('|')))throw Error('Custom text between table rows must be moved outside the table before Apply.');
  return {before:text.slice(0,first.index),after:text.slice(last.index+last[0].length)};
}
function renderBook(text, rows, book, enabled, inheritedChunks = new Map()) {
  if (!enabled) return require('./dashboard').replaceRows(text, rows);
  const r = region(text, START, END);
  const oldChunks = new Map(inheritedChunks);
  const split = r.body.split(/<!-- WRITING-SYSTEM:PART:([a-f0-9]{32}) -->/);
  for (let i=1;i<split.length;i+=2) oldChunks.set(split[i],split[i+1]);
  const legacy = split.length === 1 ? tableSurround(r.body) : null;
  const body = book.parts.map((part,partIndex) => {
    const subset = rows.filter(row => row.partId === part.id);
    const lines = renderRows(subset).split('\n');
    for (let i = 2; i < lines.length; i++) lines[i] += subset[i - 2].id ? ` <!-- scene:${subset[i - 2].id} -->` : '';
    const old=oldChunks.get(part.id);
    const extra=old?tableSurround(old.replace(/^## Part \d+[^\n]*\n?/m,'')):partIndex===0&&legacy?legacy:{before:'',after:''};
    return `<!-- WRITING-SYSTEM:PART:${part.id} -->\n## Part ${part.number} — ${part.name}\n${extra.before.trim()?'\n'+extra.before.trim()+'\n':''}\n${lines.join('\n')}${extra.after.trim()?'\n\n'+extra.after.trim():''}`;
  }).join('\n\n');
  return r.before + '\n\n' + body + '\n\n' + r.after;
}
module.exports = { id, assertPath, region, validateModel, parseMaster, renderMaster, layout, parseBook, renderBook, tableSurround };
