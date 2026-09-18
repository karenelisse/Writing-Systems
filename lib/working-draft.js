const { linkedFilePath } = require('./dashboard');
const { assertPath } = require('./project');
const KIND = 'writing-system-working-draft';
const metadataPath = path => path.replace(/\.md$/i, '.sync.json');
const linkedHeading = line => line.match(/^###\s+\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/);
const startMarker = line => line.match(/^<!-- WRITING-SYSTEM:DRAFT-SCENE:([a-f0-9]{32}) -->$/);
const endMarker = line => line === '<!-- WRITING-SYSTEM:DRAFT-END -->';
const structural = line => /^#\s+(?:Part\s+\d+\b|Chapter\b|Unassigned\s*$)/i.test(line);

function validateMetadata(value) {
  if (!value || value.kind !== KIND || value.version !== 1 || !Array.isArray(value.sections)) throw Error('Working Draft sync metadata is invalid.');
  assertPath(value.draftPath);
  const paths = new Set(), ids = new Set();
  for (const section of value.sections) {
    assertPath(section.path);
    if (paths.has(section.path) || !Array.isArray(section.before) || section.before.some(line => typeof line !== 'string' || /[\r\n]/.test(line))) throw Error('Working Draft sync metadata has duplicate Scenes or invalid headings.');
    paths.add(section.path);
    if (section.id) {
      if (!/^[a-f0-9]{32}$/.test(section.id) || ids.has(section.id)) throw Error('Working Draft sync metadata has invalid Scene IDs.');
      ids.add(section.id);
    }
  }
  if (value.trailing !== undefined && (!Array.isArray(value.trailing) || value.trailing.some(line => typeof line !== 'string'))) throw Error('Working Draft trailing metadata is invalid.');
  return value;
}

function stripSuffix(lines, expected) {
  let end = lines.length;
  for (let index = expected.length - 1; index >= 0; index--) {
    while (end && !lines[end - 1].trim()) end--;
    if (!end || lines[end - 1].trim() !== expected[index].trim()) throw Error('Working Draft structural headings changed. Keep the generated Part and Chapter headings with their Scene sections before syncing.');
    end--;
  }
  return lines.slice(0, end);
}

function fenceState(line, fence) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return fence;
  if (!fence) return match[1];
  if (match[1][0] === fence[0] && match[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) return null;
  return fence;
}

function parseMappedDraft(content, metadata, bookDir) {
  validateMetadata(metadata);
  const known = new Map(metadata.sections.map(section => [section.path, section]));
  const seen = new Set(), sections = [];
  let current = null, fence = null;
  function finish(before = []) {
    if (!current) return;
    current.prose = stripSuffix(current.lines, before).join('\n').trim();
    delete current.lines;
    sections.push(current);
    current = null;
  }
  for (const line of String(content).replace(/\r\n/g, '\n').split('\n')) {
    const nextFence = fenceState(line, fence);
    if (fence || nextFence) { if (current) current.lines.push(line); fence = nextFence; continue; }
    const heading = linkedHeading(line);
    if (heading) {
      const absolute = heading[1].trim().replace(/\.md$/i, '') + '.md';
      const path = known.has(absolute) ? absolute : linkedFilePath(bookDir, `[[${heading[1]}]]`, 'Manuscript', heading[2] || '');
      const record = known.get(path);
      if (!record) throw Error('Working Draft contains an unrecognized Scene heading. Preserve its edits and compile a fresh draft before syncing.');
      if (seen.has(path)) throw Error('Working Draft contains duplicate Scene sections.');
      finish(record.before);
      seen.add(path);
      current = { id: record.id || null, path: heading[1].trim(), title: (heading[2] || record.title || heading[1].split('/').pop()).trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  finish((metadata.trailing || []).filter(line => line.trim()));
  if (seen.size !== known.size) throw Error('A Working Draft Scene heading is missing. Restore the heading before syncing so prose cannot be assigned to the wrong Scene.');
  return sections;
}

function cleanLegacyDraft(content, draftPath, bookDir) {
  const output = [], sections = [];
  let pendingId = null, current = false, between = [], removed = 0, fence = null;
  for (const line of String(content).replace(/\r\n/g, '\n').split('\n')) {
    const nextFence = fenceState(line, fence);
    if (fence || nextFence) { output.push(line); fence = nextFence; continue; }
    const marker = startMarker(line);
    if (marker) {
      if (current || pendingId) throw Error('Working Draft comment boundaries are incomplete; no changes were made.');
      pendingId = marker[1]; removed++; continue;
    }
    if (endMarker(line)) {
      if (!current) throw Error('Working Draft contains an unmatched end comment; no changes were made.');
      current = false; between = []; removed++; continue;
    }
    const heading = linkedHeading(line);
    if (heading && !current) {
      sections.push({ id: pendingId, path: linkedFilePath(bookDir, `[[${heading[1]}]]`, 'Manuscript', heading[2] || ''), title: (heading[2] || heading[1].split('/').pop()).trim(), before: between.filter(structural) });
      current = true; pendingId = null; between = [];
    } else if (!current) between.push(line);
    output.push(line);
  }
  if (!removed) return null;
  if (current || pendingId) throw Error('Working Draft comment boundaries are incomplete; no changes were made.');
  const metadata = validateMetadata({ kind: KIND, version: 1, draftPath, sections, trailing: between });
  const cleaned = output.join('\n');
  parseMappedDraft(cleaned, metadata, bookDir);
  return { content: cleaned, metadata };
}

function remapMetadata(metadata, mapping) {
  validateMetadata(metadata);
  return { ...metadata, draftPath: mapping.get(metadata.draftPath) || metadata.draftPath, sections: metadata.sections.map(section => ({ ...section, path: mapping.get(section.path) || section.path })) };
}

module.exports = { KIND, metadataPath, validateMetadata, parseMappedDraft, cleanLegacyDraft, remapMetadata };
