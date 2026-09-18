const Module = require('node:module');
const YAML = require('yaml');
class TFile { constructor(path){this.path=path;this.extension=path.split('.').pop();this.basename=path.split('/').pop().replace(/\.[^.]+$/,'');} }
class Folder {constructor(path){this.path=path;this.children=[];}}
class Notice {constructor(message){Notice.messages.push(message);}} Notice.messages=[];
class Modal {constructor(app){this.app=app;}open(){}close(){}}
const obsidian={TFile,Notice,Modal,Setting:class{},Plugin:class{},normalizePath:p=>p.replace(/\\/g,'/'),parseYaml:YAML.parse,stringifyYaml:YAML.stringify};
const original=Module._load;Module._load=function(name,...args){return name==='obsidian'?obsidian:original.call(this,name,...args);};
function fixture(initial={}){
 const entries=new Map(),texts=new Map();let writes=0,failAt=0;
 const mutate=()=>{writes++;if(writes===failAt)throw Error('Injected write failure');};
 function parents(path){const pieces=path.split('/');pieces.pop();let cur='';for(const piece of pieces){cur=cur?cur+'/'+piece:piece;if(!entries.has(cur))entries.set(cur,new Folder(cur));}}
 function children(){for(const f of entries.values())if(f.children)f.children=[...entries.values()].filter(x=>x.path.split('/').slice(0,-1).join('/')===f.path);}
 for(const [p,text] of Object.entries(initial)){parents(p);entries.set(p,new TFile(p));texts.set(p,text);}children();
 const vault={
  getAbstractFileByPath:p=>entries.get(p)||null,getFiles:()=>[...entries.values()].filter(f=>f instanceof TFile),getMarkdownFiles:()=>vault.getFiles().filter(f=>f.path.endsWith('.md')),getAllLoadedFiles:()=>[...entries.values()],
  read:async f=>{if(!texts.has(f.path))throw Error('Cannot read '+f.path);return texts.get(f.path);},
  createFolder:async p=>{mutate();if(entries.has(p))throw Error('Occupied '+p);parents(p);entries.set(p,new Folder(p));children();},
  create:async(p,text)=>{mutate();if(entries.has(p))throw Error('Occupied '+p);const parent=p.split('/').slice(0,-1).join('/');if(parent&&!entries.has(parent))throw Error('Missing parent '+parent);const f=new TFile(p);entries.set(p,f);texts.set(p,text);children();return f;},
  modify:async(f,text)=>{mutate();if(!entries.has(f.path))throw Error('Missing '+f.path);texts.set(f.path,text);},
  rename:async(f,p)=>{mutate();if(entries.has(p))throw Error('Occupied '+p);const parent=p.split('/').slice(0,-1).join('/');if(parent&&!entries.has(parent))throw Error('Missing parent '+parent);const text=texts.get(f.path);entries.delete(f.path);texts.delete(f.path);f.path=p;entries.set(p,f);texts.set(p,text);children();},
  delete:async f=>{mutate();if(f.children?.length)throw Error('Nonempty folder deletion');entries.delete(f.path);texts.delete(f.path);children();},
  trash:async f=>vault.delete(f)
 };
 const plugin={app:{vault,metadataCache:{getFirstLinkpathDest:(name,source)=>entries.get(name)||entries.get(name+'.md')||null},workspace:{getActiveFile:()=>vault.getMarkdownFiles().find(f=>f.path.endsWith('/Dashboard.md')),getLeaf:()=>({openFile:async()=>{}})}}};
 return {plugin,vault,texts,entries,get writes(){return writes;},failNext(n=1){failAt=writes+n;},resetFailure(){failAt=0;}};
}
module.exports={fixture,obsidian};
