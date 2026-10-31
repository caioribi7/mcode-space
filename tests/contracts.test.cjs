const test=require('node:test');const assert=require('node:assert/strict');
test('contracts validate values, preserve assistance and escape all user content',async()=>{
 const {fields,validateContract,contractHtml}=await import('../electron/contracts-template.mjs');const draft=Object.fromEntries(fields.map(([key,,value,type])=>[key,value|| (type==='date'?'2026-10-31':'Dados <script>injetar()</script>')]));
 const html=contractHtml(draft);assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);assert.equal((html.match(/class="signature"/g)||[]).length,4);assert.ok(html.includes('três meses corridos'));assert.throws(()=>validateContract({...draft,price:'NaN'}));assert.throws(()=>validateContract({...draft,date:'2026-02-30'}));assert.throws(()=>validateContract({...draft,client:''}));assert.throws(()=>validateContract({...draft,domainDay:'31'}));
});
