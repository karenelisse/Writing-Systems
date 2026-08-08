const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const output = path.join(root, 'dist', 'main.js');
const entries = [
  'main.source.js',
  ...['commands', 'lib', 'modals', 'services'].flatMap(dir =>
    fs.readdirSync(path.join(root, dir))
      .filter(name => name.endsWith('.js'))
      .map(name => `${dir}/${name}`)
  )
];

const factories = entries.map(id => {
  const source = fs.readFileSync(path.join(root, id), 'utf8');
  return `${JSON.stringify(id)}: function (require, module, exports) {\n${source}\n}`;
});

const bundle = `/* Writing System v2.0.8 - generated bundle. Edit source modules, then rebuild. */
'use strict';

const __externalRequire = require;
const __modules = {
${factories.join(',\n')}
};
const __cache = Object.create(null);

function __resolve(from, request) {
  const base = from.split('/').slice(0, -1);
  for (const part of request.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  const candidate = base.join('/');
  if (__modules[candidate]) return candidate;
  if (__modules[candidate + '.js']) return candidate + '.js';
  if (__modules[candidate + '/index.js']) return candidate + '/index.js';
  throw new Error('Writing System bundle cannot resolve "' + request + '" from "' + from + '".');
}

function __load(id) {
  if (__cache[id]) return __cache[id].exports;
  const factory = __modules[id];
  if (!factory) throw new Error('Writing System bundle module is missing: ' + id);
  const module = { exports: {} };
  __cache[id] = module;
  const localRequire = request => request === 'obsidian'
    ? __externalRequire('obsidian')
    : __load(__resolve(id, request));
  factory(localRequire, module, module.exports);
  return module.exports;
}

module.exports = __load('main.source.js');
`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, bundle, 'utf8');
console.log(`Bundled ${entries.length} modules to ${output}`);
