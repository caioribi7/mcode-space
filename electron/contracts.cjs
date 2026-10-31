const path=require('node:path');
const fs=require('node:fs/promises');
async function renderContractPdf(BrowserWindow,data){
 const {contractHtml}=await import('./contracts-template.mjs');const html=contractHtml(data);
 const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.session.setPermissionRequestHandler((_,__,callback)=>callback(false));
 try{await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));return await window.webContents.printToPDF({pageSize:'A4',printBackground:true,margins:{top:0.65,bottom:0.65,left:0.7,right:0.7},displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:8px;width:100%;text-align:center">MCode • <span class="pageNumber"></span> / <span class="totalPages"></span></div>'});}finally{window.destroy();}
}
function createContracts({BrowserWindow,dialog,getWindow}){let busy=false;return async data=>{
 if(busy)throw new Error('Aguarde a geração atual.');busy=true;
 try{const {validateContract}=await import('./contracts-template.mjs');const value=validateContract(data);
 const answer=await dialog.showSaveDialog(getWindow(),{title:'Salvar contrato em PDF',defaultPath:'Contrato-MCode-'+value.project.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,60)+'.pdf',filters:[{name:'PDF',extensions:['pdf']}],properties:['showOverwriteConfirmation']});
 if(answer.canceled)return null;
 const target=answer.filePath.toLowerCase().endsWith('.pdf')?answer.filePath:answer.filePath+'.pdf';
 if(path.extname(target).toLowerCase()!=='.pdf'||target.split(/[\\/]/).some(p=>p.toLowerCase()==='.git'))throw new Error('Destino inválido.');
 const pdf=await renderContractPdf(BrowserWindow,value);await fs.writeFile(target,pdf);return {path:target};
 }finally{busy=false;}
};}
module.exports={createContracts,renderContractPdf};
