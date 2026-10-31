import {fields,contractBody} from '../electron/contracts-template.mjs';
export function setupContracts({api,notify}){
 const $=id=>document.getElementById(id),form=$('contract-form');
 for(const [key,label,value,type]of fields){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(type==='textarea'||type==='optional'?'textarea':'input');input.name=key;input.required=type!=='optional';input.maxLength=['scope','services','notes'].includes(key)?5000:500;
 if(input.tagName==='INPUT')input.type=['number','date'].includes(type)?type:'text';if(type==='number'){input.min=key==='domainDay'?'1':'0';input.max=key==='domainDay'?'28':'10000000';input.step=key==='domainDay'?'1':'0.01';}
 input.value=value;if(type==='date'){const now=new Date();input.value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');}wrap.append(input);$('contract-fields').append(wrap);}
 let draft=null;form.onsubmit=event=>{event.preventDefault();try{draft=Object.fromEntries(new FormData(form));$('contract-preview').innerHTML=contractBody(draft);$('contract-dialog').showModal();}catch(e){notify(e.message);}};
 $('contract-preview-close').onclick=()=>$('contract-dialog').close();
 $('contract-export').onclick=async()=>{const button=$('contract-export');button.disabled=true;try{const result=await api.contractExport(draft);if(result){notify('Contrato salvo em '+result.path);$('contract-dialog').close();}}catch(e){notify(e.message);}finally{button.disabled=false;}};
}
