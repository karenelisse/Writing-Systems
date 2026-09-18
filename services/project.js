const { TFile, parseYaml, stringifyYaml } = require('obsidian');
const { parseMaster, layout, id, renderMaster } = require('../lib/project');
function frontmatter(text) { const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/); return m ? parseYaml(m[1]) || {} : {}; }
function updateFrontmatter(text, values) {
  const re = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const fm = frontmatter(text);
  Object.assign(fm, values);
  if('story_order' in values)delete fm.scene_order;
  return '---\n' + stringifyYaml(fm).trimEnd() + '\n---\n' + text.replace(re, '');
}
function rootFromPath(path) { const m = path.match(/^(.*)\/Plot(?:\/|$)/); return m ? m[1] : null; }
async function readProject(plugin, root) {
  const path = `${root}/Plot/Master Dashboard.md`;
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  const text = await plugin.app.vault.read(file);
  return { root, path, text, expectedMasterText: text, model: parseMaster(text) };
}
async function discover(plugin, root) {
  const books = plugin.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(root + '/Plot/') && /^Book \d+\/Dashboard\.md$/.test(f.path.slice((root + '/Plot/').length))).sort((a,b) => Number(a.path.match(/Book (\d+)/)[1]) - Number(b.path.match(/Book (\d+)/)[1]));
  if (!books.length) throw Error('No Book Dashboards found in this project.');
  const model = { version: 1, id: id(), partsEnabled: false, partHeadings: true, books: [] };
  for (const book of books) model.books.push({ id: id(), title: book.path.match(/Book \d+/)[0], parts: [] });
  return { root, path: `${root}/Plot/Master Dashboard.md`, text: null, expectedMasterText: null, model };
}
module.exports = { frontmatter, updateFrontmatter, rootFromPath, readProject, discover };
