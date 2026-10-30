const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('space', {
  initial: () => invoke('workspace:initial'),
  openFolder: () => invoke('workspace:open'),
  saveWorkspace: settings => invoke('workspace:save', settings),
  setDirty: value => invoke('workspace:dirty', value),
  list: candidate => invoke('files:list', candidate),
  read: candidate => invoke('files:read', candidate),
  save: value => invoke('files:save', value),
  confirmDiscard: name => invoke('files:confirm-discard', name),
  createTerminal: options => invoke('terminal:create', options),
  write: (id, data) => invoke('terminal:write', id, data),
  resize: (id, cols, rows) => invoke('terminal:resize', id, cols, rows),
  closeTerminal: id => invoke('terminal:close', id),
  gitStatus: () => invoke('git:status'),
  onData: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('terminal:data', listener); return () => ipcRenderer.removeListener('terminal:data', listener); },
  onExit: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('terminal:exit', listener); return () => ipcRenderer.removeListener('terminal:exit', listener); },
});
