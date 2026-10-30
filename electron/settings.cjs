const LAYOUTS = ['tabs', 'columns', 'grid'];
const MOSAICS = ['balanced', 'two', 'three', 'rows', 'line', 'focus-left', 'focus-top'];
function cleanWorkspace(value, shellIds) {
  return {
    root: value.root,
    tabs: (Array.isArray(value.tabs) ? value.tabs : []).slice(0, 12).map(tab => ({
      name: String(tab.name || 'Terminal').slice(0, 60),
      shell: shellIds.includes(tab.shell) ? tab.shell : shellIds[0],
      cwd: typeof tab.cwd === 'string' ? tab.cwd : '.',
      color: ['green', 'blue', 'amber', 'pink'].includes(tab.color) ? tab.color : 'green',
    })),
    layout: LAYOUTS.includes(value.layout) ? value.layout : 'tabs',
    mosaic: MOSAICS.includes(value.mosaic) ? value.mosaic : 'balanced',
    sidebar: Math.max(190, Math.min(480, Number(value.sidebar) || 260)),
  };
}
function savedWorkspaces(saved) {
  return Array.isArray(saved.workspaces) ? saved.workspaces.slice(0, 8) : typeof saved.root === 'string' ? [saved] : [];
}
module.exports = { cleanWorkspace, savedWorkspaces };
