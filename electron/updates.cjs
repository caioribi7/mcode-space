function createUpdates({app,updater,portable=false,send,confirmInstall,install}){
 let state={status:app.isPackaged&&!portable?'idle':'manual',current:app.getVersion(),version:null,percent:0},busy=false;
 const update=value=>{state={...state,...value};send({...state});};
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;
 updater.on('update-available',info=>update({status:'available',version:info.version}));
 updater.on('update-not-available',()=>update({status:'current'}));
 updater.on('download-progress',info=>update({status:'downloading',percent:Math.max(0,Math.min(100,Number(info.percent)||0))}));
 updater.on('update-downloaded',info=>update({status:'ready',version:info.version,percent:100}));
 updater.on('error',()=>update({status:'error'}));
 return {
 state:()=>({...state}),
 async check(){if(state.status==='manual'||busy||['downloading','ready'].includes(state.status))return {...state};busy=true;update({status:'checking'});try{await updater.checkForUpdates();}catch{update({status:'error'});}finally{busy=false;}return {...state};},
 async download(){if(state.status!=='available'||busy)throw new Error('Verifique a atualização disponível primeiro.');busy=true;update({status:'downloading',percent:0});try{await updater.downloadUpdate();}catch{update({status:'error'});}finally{busy=false;}return {...state};},
 async apply(){if(state.status!=='ready')throw new Error('Baixe a atualização antes de instalar.');if(!await confirmInstall())return false;install();updater.quitAndInstall(false,true);return true;}
 };
}
module.exports={createUpdates};
