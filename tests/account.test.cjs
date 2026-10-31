const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {profileInput,publicConfig,credentials}=require('../electron/account-validation.cjs');const {createAccount}=require('../electron/account.cjs');
const config={url:'https://example.supabase.co',key:'sb_publishable_test'};
test('only public project keys and HTTPS Supabase URLs are accepted',()=>{
 assert.deepEqual(publicConfig(config),config);
 for(const url of ['http://example.supabase.co','https://example.supabase.co.evil.test','file:///tmp','https://example.supabase.co/other'])assert.throws(()=>publicConfig({...config,url}));
 for(const key of ['sb_secret_test','abc.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.xyz'])assert.throws(()=>publicConfig({...config,key}));
});
test('validates username, display name, stack and credentials',()=>{
 assert.deepEqual(profileInput({username:'caio_dev',displayName:' Caio ',stack:['React','React','Node.js']}),{username:'caio_dev',display_name:'Caio',stack:['React','Node.js']});
 for(const username of ['ab','Admin','with space','<script>'])assert.throws(()=>profileInput({username,displayName:'Caio',stack:[]}));
 assert.throws(()=>profileInput({username:'caio',displayName:'Caio',stack:Array(21).fill('React')}));assert.throws(()=>credentials({email:'bad',password:'x'}));
});
test('account uses PKCE, keeps tokens out of renderer state and writes encrypted storage',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mcode-account-'));let session=null,options;
 const factory=(_url,_key,opts)=>{options=opts;return {auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user},error:null}),signInWithPassword:async()=>{session={access_token:'PRIVATE_TOKEN',user:{id:'uid',email:'dev@example.test'}};await opts.auth.storage.setItem('session',JSON.stringify(session));return {error:null};},stopAutoRefresh(){}},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{username:'caio',display_name:'Caio',stack:['React']},error:null})})};};
 const service=createAccount({app:{getPath:()=>folder},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(Buffer.from(s).toString('base64')),decryptString:b=>Buffer.from(b.toString(),'base64').toString()},clientFactory:factory});
 try{assert.equal((await service.configure(config)).configured,true);const result=await service.login({email:'dev@example.test',password:'password123'});assert.equal(options.auth.flowType,'pkce');assert.equal(result.profile.username,'caio');assert.equal(JSON.stringify(result).includes('PRIVATE_TOKEN'),false);assert.equal((await fs.readFile(path.join(folder,'supabase-session.bin'),'utf8')).includes('PRIVATE_TOKEN'),false);}finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('OAuth returns through a nonce path and exchanges only the PKCE authorization code',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'mcode-oauth-'));let session=null,captured;
 const factory=(_url,_key,opts)=>({auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user},error:null}),signInWithOAuth:async value=>{captured=value;return {data:{url:config.url+'/auth/v1/authorize?redirect_to='+encodeURIComponent(value.options.redirectTo)},error:null};},exchangeCodeForSession:async code=>{assert.equal(code,'TEST_AUTH_CODE');session={user:{id:'uid',email:'test@example.invalid'}};return {error:null};},stopAutoRefresh(){}},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:null,error:null})})});
 const service=createAccount({app:{getPath:()=>folder},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},clientFactory:factory,shell:{openExternal:async url=>{const target=new URL(new URL(url).searchParams.get('redirect_to'));assert.match(target.pathname,/^\/auth\/callback\/[a-f0-9]{48}$/);const wrong=await fetch(target.origin+'/auth/callback/wrong');assert.equal(wrong.status,404);target.searchParams.set('code','TEST_AUTH_CODE');const right=await fetch(target);assert.equal(right.status,200);}}});
 try{await service.configure(config);const result=await service.oauth('github');assert.equal(result.user.id,'uid');assert.equal(captured.provider,'github');assert.equal(captured.options.skipBrowserRedirect,true);await assert.rejects(service.oauth('arbitrary'),/inválido/);}finally{await fs.rm(folder,{recursive:true,force:true});}
});

test('signed-out panels give a clear account prompt',()=>{assert.throws(()=>createAccount({}).check({message:'Auth session missing!'}),/Entre na sua conta/);});
