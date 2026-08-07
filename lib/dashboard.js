const START = '<!-- WRITING-SYSTEM:SCENES:START -->';
const END = '<!-- WRITING-SYSTEM:SCENES:END -->';

const dirname = p => p.split('/').slice(0, -1).join('/');
const basename = p => p.replace(/\.md$/i, '').split('/').pop();

function cleanTitle(raw) {
  return String(raw || '').trim().replace(/[\\/:*?"<>|]/g, ' - ').replace(/\s+/g, ' ');
}

function escapeTableCell(raw) {
  return String(raw || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function unescapeTableCell(raw) {
  return String(raw || '').replace(/\\\\/g, '\\').replace(/\\\|/g, '|').trim();
}

function parseWiki(raw) {
  raw = unescapeTableCell(raw);
  const m = String(raw || '').trim().match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/);
  if (!m) return { path: '', label: String(raw || '').trim() };
  return { path: m[1].trim(), label: (m[2] || basename(m[1])).trim() };
}

function parseLinkedStatusCell(cell) {
  const text = unescapeTableCell(cell);
  const m = text.match(/^(\[\[[^\]]+\]\])(?:\s+\*\(([^)]+)\)\*)?$/);
  if (!m) return { link: text, status: '' };
  return { link: m[1].trim(), status: (m[2] || '').trim() };
}

function renderLinkedStatusCell(link, status) {
  return status ? `${link} *(${status})*` : link;
}

function splitTableRow(line) {
  let s = line.trim();
  if (!s.startsWith('|')) return [];
  s = s.slice(1, s.endsWith('|') ? -1 : undefined);

  const out = [];
  let cur = '';
  let wikiDepth = 0;

  for (let i = 0; i < s.length; i++) {
    const pair = s.slice(i, i + 2);
    if (pair === '[[') {
      wikiDepth++;
      cur += pair;
      i++;
      continue;
    }
    if (pair === ']]' && wikiDepth > 0) {
      wikiDepth--;
      cur += pair;
      i++;
      continue;
    }
    if (s[i] === '|' && wikiDepth === 0) {
      out.push(unescapeTableCell(cur));
      cur = '';
      continue;
    }
    cur += s[i];
  }
  out.push(unescapeTableCell(cur));
  return out;
}

function parseRows(content) {
  const a = content.indexOf(START);
  const b = content.indexOf(END);
  if (a < 0 || b < a) throw new Error('Dashboard scene-table markers are missing.');

  const lines = content.slice(a + START.length, b)
    .split(/\r?\n/)
    .filter(x => x.trim().startsWith('|'));

  if (lines.length < 2) return [];

  return lines.slice(2)
    .map(splitTableRow)
    .filter(c => c.length >= 6)
    .map(c => {
      const scene = parseLinkedStatusCell(c[1]);
      const manuscript = parseLinkedStatusCell(c[2]);
      return {
        sceneLink: scene.link,
        sceneStatus: scene.status || 'Planned',
        manuscriptLink: manuscript.link,
        manuscriptStatus: manuscript.status || 'Not Started',
        pov: c[3] || '',
        locations: c[4] || '',
        chapter: c[5] || ''
      };
    });
}

function renderRows(rows) {
  return [
    '| # | Scene | Manuscript | POV | Location(s) | Chapter |',
    '| ---: | --- | --- | --- | --- | ---: |',
    ...rows.map((r, i) =>
      `| ${i + 1} | ${escapeTableCell(renderLinkedStatusCell(r.sceneLink, r.sceneStatus))} | ${escapeTableCell(renderLinkedStatusCell(r.manuscriptLink, r.manuscriptStatus))} | ${escapeTableCell(r.pov || '')} | ${escapeTableCell(r.locations || '')} | ${escapeTableCell(r.chapter || '')} |`
    )
  ].join('\n');
}

function replaceRows(content, rows) {
  const a = content.indexOf(START);
  const b = content.indexOf(END);
  if (a < 0 || b < a) throw new Error('Dashboard scene-table markers are missing.');
  return content.slice(0, a + START.length) + '\n\n' + renderRows(rows) + '\n\n' + content.slice(b);
}

function bookInfo(path) {
  const bookDir = dirname(path);
  const bookName = basename(bookDir);
  const m = bookName.match(/^Book\s+(\d+)$/i);
  const projectDir = dirname(dirname(bookDir));
  return {
    bookDir,
    bookName,
    bookNumber: m ? Number(m[1]) : '',
    projectDir,
    projectName: basename(projectDir)
  };
}

function workingTitleFromDashboard(content, info) {
  const text = String(content || '');

  const yamlMatch = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (yamlMatch) {
    const fmTitle = yamlMatch[1].match(/^\s*working_title\s*:\s*(.*?)\s*$/mi);
    if (fmTitle && fmTitle[1].trim()) {
      return fmTitle[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  const visible = text.match(/^\*\*Working Title:\*\*\s*(.*?)\s*$/mi);
  if (visible && visible[1].trim()) return visible[1].trim();

  return info.projectName || info.bookName;
}

function safeFilename(name) {
  return String(name || '').replace(/[\\/:*?"<>|]/g, ' - ').trim();
}

function extractLinks(cell) {
  const found = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m;
  while ((m = re.exec(String(cell || '')))) found.push(`[[${m[1].trim()}]]`);
  if (found.length) return found;
  return String(cell || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => x.startsWith('[[') ? x : `[[${x}]]`);
}

function firstLinkName(cell) {
  const links = extractLinks(cell);
  if (!links.length) return String(cell || '').trim();
  return links[0].replace(/^\[\[/, '').replace(/\]\]$/, '').split('|')[0].trim();
}

module.exports = {
  START, END, dirname, basename, cleanTitle, parseWiki, parseRows, renderRows,
  replaceRows, bookInfo, workingTitleFromDashboard, safeFilename,
  extractLinks, firstLinkName
};
