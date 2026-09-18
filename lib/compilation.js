const { layout,parseBook }=require('./project');
const { readProject,rootFromPath }=require('../services/project');
async function compilationRows(plugin,d,text){
 const p=await readProject(plugin,rootFromPath(d.path));if(!p)return require('./dashboard').parseRows(text);
 await require('../commands/parts').requireApplied(plugin,p);
 const book=layout(p.model,p.root).find(b=>b.dir+'/Dashboard.md'===d.path);
 const parsed=parseBook(text,p.model.partsEnabled);
 if(p.model.partsEnabled&&JSON.stringify(parsed.parts)!==JSON.stringify(book.parts.map(p=>p.id)))throw Error('Dashboard Part order disagrees with Master. Apply Master Dashboard first.');
 if(p.model.partsEnabled){
  const owners=new Map();let previous=null,lastNumber=0;const seen=new Set();
  for(const row of parsed.rows){
   const value=String(row.chapter||'').trim();if(!value){previous=null;continue;}
   if(!/^[1-9]\d*$/.test(value))throw Error('Chapter must be a positive integer or blank.');
   if(owners.has(value)&&owners.get(value)!==row.partId)throw Error('A Chapter cannot span Parts.');owners.set(value,row.partId);
   if(value!==previous){if(seen.has(value)||Number(value)!==lastNumber+1)throw Error('Apply Dashboard to normalize chapter numbering before compiling.');seen.add(value);lastNumber=Number(value);previous=value;}
  }
 }
 return parsed.rows.map(row=>{const part=book.parts.find(p=>p.id===row.partId);return {...row,partHeading:part&&p.model.partHeadings!==false?`# Part ${part.number} — ${part.name}`:''};});
}
module.exports={compilationRows};
