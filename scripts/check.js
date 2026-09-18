const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dirs=['commands','lib','modals','services','tests','scripts'];
const files=['main.source.js','main.js','build-bundle.js',...dirs.flatMap(d=>fs.readdirSync(d).filter(n=>n.endsWith('.js')).map(n=>d+'/'+n))];
for(const file of files){const text=fs.readFileSync(file,'utf8');new vm.Script(text,{filename:file});if(file==='main.js')continue;for(const m of text.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)){const target=path.resolve(path.dirname(file),m[1]);if(![target,target+'.js',path.join(target,'index.js')].some(p=>fs.existsSync(p)&&fs.statSync(p).isFile()))throw Error('Unresolved import '+file+': '+m[1]);}}
console.log('Syntax and relative imports passed: '+files.length+' files');
