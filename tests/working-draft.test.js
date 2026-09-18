const {fixture}=require('./fixture');
const test=require('node:test'),assert=require('node:assert/strict');
const {KIND,metadataPath,parseMappedDraft,cleanLegacyDraft}=require('../lib/working-draft');
const book='Writing/Story/Plot/Book 1',draft=book+'/Compiled/Story - Working Draft.md';
const path=book+'/Manuscript/Part 1/001 - A.md';
const heading='### [[Manuscript/Part 1/001 - A|A]]';
const sid='a'.repeat(32);
const metadata=()=>({kind:KIND,version:1,draftPath:draft,sections:[{id:sid,path,title:'A',before:[]}]});
test('mapped draft preserves literal chapter headings and user comments',()=>{
 const result=parseMappedDraft(heading+'\n\n# Chapter in prose\nWords\n<!-- my note -->',metadata(),book);
 assert.equal(result[0].prose,'# Chapter in prose\nWords\n<!-- my note -->');assert.equal(result[0].id,sid);
});
test('mapped draft excludes generated headings before the next Scene',()=>{
 const m=metadata();m.sections.push({id:'b'.repeat(32),path:book+'/Manuscript/Part 2/001 - A.md',title:'A',before:['# Part 2','# Chapter 2']});
 const result=parseMappedDraft(heading+'\nFirst\n\n# Part 2\n\n# Chapter 2\n\n### [[Manuscript/Part 2/001 - A|A]]\nSecond',m,book);
 assert.deepEqual(result.map(s=>s.prose),['First','Second']);
});
test('missing, duplicate and unknown linked headings fail closed',()=>{
 assert.throws(()=>parseMappedDraft('Words',metadata(),book),/missing/);
 assert.throws(()=>parseMappedDraft(heading+'\nWords\n'+heading,metadata(),book),/duplicate/);
 assert.throws(()=>parseMappedDraft(heading.replace('001','002'),metadata(),book),/unrecognized/);
});
test('cleanup preserves unsynced edits and user comments while saving companion',async()=>{
 const text='# Title\n<!-- WRITING-SYSTEM:DRAFT-SCENE:'+sid+' -->\n'+heading+'\nUnsynced edits\n<!-- user note -->\n<!-- WRITING-SYSTEM:DRAFT-END -->\n';
 const fx=fixture({[draft]:text});fx.plugin.app.workspace.getActiveFile=()=>fx.vault.getAbstractFileByPath(draft);
 await require('../commands/working-draft').cleanWorkingDraft(fx.plugin);
 assert.equal(fx.texts.get(draft),text.split('\n').filter(l=>!l.startsWith('<!-- WRITING-SYSTEM:')).join('\n'));
 const m=JSON.parse(fx.texts.get(metadataPath(draft)));assert.equal(parseMappedDraft(fx.texts.get(draft),m,book)[0].prose,'Unsynced edits\n<!-- user note -->');
});
test('cleanup rejects incomplete boundaries and preserves fenced examples',()=>{
 assert.throws(()=>cleanLegacyDraft('<!-- WRITING-SYSTEM:DRAFT-SCENE:'+sid+' -->\n'+heading+'\nWords',draft,book),/incomplete/);
 const text=heading+'\n~~~\n<!-- WRITING-SYSTEM:DRAFT-END -->\n~~~\n<!-- WRITING-SYSTEM:DRAFT-END -->';
 const cleaned=cleanLegacyDraft(text,draft,book);assert.match(parseMappedDraft(cleaned.content,cleaned.metadata,book)[0].prose,/DRAFT-END/);
});
test('companion write failure rolls back draft cleanup',async()=>{
 const text=heading+'\nKeep edits\n<!-- WRITING-SYSTEM:DRAFT-END -->';const fx=fixture({[draft]:text});const before=new Map(fx.texts);
 const create=fx.vault.create;fx.vault.create=async(p,t)=>{if(p===metadataPath(draft))throw Error('Companion failure');return create(p,t);};
 const cleaned=cleanLegacyDraft(text,draft,book);
 await assert.rejects(require('../services/working-draft').saveDraft(fx.plugin,draft,cleaned.content,cleaned.metadata),/Companion failure/);assert.deepEqual(fx.texts,before);
});
