export const MOSAICS = {
  balanced:'Equilibrado', two:'2 colunas', three:'3 colunas', rows:'Empilhados',
  line:'Em uma linha', 'focus-left':'Destaque à esquerda', 'focus-top':'Destaque no topo',
};
export function terminalLayout(preset, count) {
  const total = Math.max(1, Math.min(12, count));
  const placements = Array.from({length:total},()=>({column:'auto',row:'auto'}));
  let columns = Math.min(total, preset==='three'?3:preset==='two'?2:total>4?3:2);
  let rows = `repeat(${Math.ceil(total/columns)}, minmax(210px, 1fr))`;
  let template = `repeat(${columns}, minmax(260px, 1fr))`;
  if(preset==='rows'){template='minmax(0, 1fr)';rows=`repeat(${total}, minmax(210px, 1fr))`;}
  if(preset==='line'){template=`repeat(${total}, minmax(280px, 1fr))`;rows='minmax(210px, 1fr)';}
  if(preset==='focus-left'&&total>1){template='minmax(300px, 2fr) minmax(260px, 1fr)';rows=`repeat(${total-1}, minmax(160px, 1fr))`;placements[0]={column:'1',row:`1 / span ${total-1}`};for(let i=1;i<total;i++)placements[i]={column:'2',row:String(i)};}
  if(preset==='focus-top'&&total>1){template=`repeat(${total-1}, minmax(240px, 1fr))`;rows='minmax(240px, 2fr) minmax(180px, 1fr)';placements[0]={column:'1 / -1',row:'1'};for(let i=1;i<total;i++)placements[i]={column:String(i),row:'2'};}
  return {columns:template,rows,placements};
}
