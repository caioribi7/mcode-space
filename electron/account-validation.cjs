const USERNAME=/^[a-z0-9_]{3,24}$/;
function profileInput(value){
 if(!value||typeof value.username!=='string'||!USERNAME.test(value.username))throw Error('Use de 3 a 24 letras minúsculas, números ou _ no usuário.');
 if(typeof value.displayName!=='string'||!value.displayName.trim()||value.displayName.length>80)throw Error('Informe um nome com até 80 caracteres.');
 if(!Array.isArray(value.stack)||value.stack.length>20||value.stack.some(v=>typeof v!=='string'||!v.trim()||v.length>30))throw Error('Adicione até 20 tecnologias, com até 30 caracteres cada.');
 return {username:value.username,display_name:value.displayName.trim(),stack:[...new Set(value.stack.map(v=>v.trim()))]};
}
function publicConfig(value){
 const u=new URL(value?.url||'');if(u.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error('Informe a URL HTTPS do seu projeto Supabase (*.supabase.co).');
 const key=value.key;if(typeof key!=='string'||key.length>4096)throw Error('Informe a chave publishable ou anon.');
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)){try{const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));if(payload.role!=='anon')throw Error();}catch{throw Error('Use somente a chave pública publishable/anon. Nunca use service_role ou secret.');}}
 return {url:u.origin,key};
}
function credentials(value){if(!value||typeof value.email!=='string'||!/^\S+@\S+\.\S+$/.test(value.email)||value.email.length>254||typeof value.password!=='string'||value.password.length<8||value.password.length>128)throw Error('Informe email válido e senha de 8 a 128 caracteres.');return {email:value.email.trim(),password:value.password};}
module.exports={profileInput,publicConfig,credentials};
