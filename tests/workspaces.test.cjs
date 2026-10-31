const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanWorkspace, savedWorkspaces } = require('../electron/settings.cjs');

test('migrates the original workspace settings without dropping terminal names',()=>{
  const legacy={root:'C:/project',tabs:[{name:'Backend',shell:'powershell',cwd:'src',color:'blue',glyph:'database'}],layout:'grid'};
  const migrated=savedWorkspaces(legacy).map(w=>cleanWorkspace(w,['powershell','cmd']));
  assert.equal(migrated[0].tabs[0].name,'Backend');assert.equal(migrated[0].tabs[0].glyph,'database');
  assert.equal(migrated[0].tabs[0].cwd,'src');
  assert.equal(migrated[0].mosaic,'balanced');
});
test('keeps each workspace layout and validates stored shell/layout values',()=>{
  const workspaces=savedWorkspaces({workspaces:[{root:'a',layout:'grid',mosaic:'focus-left',tabs:[{name:'A',shell:'arbitrary',color:'bad'}]},{root:'b',layout:'columns',mosaic:'three',tabs:[]}]});
  const [a,b]=workspaces.map(w=>cleanWorkspace(w,['powershell']));
  assert.equal(a.mosaic,'focus-left');assert.equal(b.layout,'columns');
  assert.equal(a.tabs[0].glyph,'terminal');assert.equal(a.tabs[0].shell,'powershell');assert.equal(a.tabs[0].color,'green');
  assert.equal(cleanWorkspace({root:'x',layout:'bad',mosaic:'bad'},['cmd']).layout,'tabs');
});
test('all mosaic presets define exactly one valid placement for every terminal',async()=>{
  const {MOSAICS,terminalLayout}=await import('../src/layouts.mjs');
  for(const preset of Object.keys(MOSAICS))for(const count of [1,2,3,5,12]){
    const result=terminalLayout(preset,count);
    assert.equal(result.placements.length,count);assert.ok(result.columns);assert.ok(result.rows);
    assert.equal(/NaN|undefined|Infinity/.test(JSON.stringify(result)),false);
  }
  assert.deepEqual(terminalLayout('focus-left',3).placements[0],{column:'1',row:'1 / span 2'});
  assert.deepEqual(terminalLayout('focus-top',3).placements[0],{column:'1 / -1',row:'1'});
});
