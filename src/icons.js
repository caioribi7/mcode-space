import {
  createElement, Terminal, Folder, FileText, ChevronRight, X, ListTree,
  PanelsTopLeft, Columns2, Grid2X2, Pencil, GitBranch, ChevronUp, ArrowLeft,
  ArrowRight, ArrowUpRight, PanelLeftClose, PanelLeftOpen, FolderPlus,
  CodeXml, Eye, Plus, ExternalLink, Maximize2, Minimize2, Wallet, RefreshCw, Server, Database, Rocket, UserRound, Camera, ListTodo, Trash2, Activity,
} from 'lucide';

const icons = { terminal:Terminal, folder:Folder, file:FileText, chevron:ChevronRight,
  close:X, collapse:ListTree, tabs:PanelsTopLeft, columns:Columns2, grid:Grid2X2,
  edit:Pencil, branch:GitBranch, up:ChevronUp, left:ArrowLeft, right:ArrowRight,
  arrowRight:ArrowRight, arrowUpRight:ArrowUpRight, sidebarClose:PanelLeftClose,
  sidebarOpen:PanelLeftOpen, folderPlus:FolderPlus, code:CodeXml, eye:Eye, plus:Plus,
  external:ExternalLink, maximize:Maximize2, minimize:Minimize2, finance:Wallet, sync:RefreshCw, server:Server, database:Database, rocket:Rocket, user:UserRound, camera:Camera, todo:ListTodo, trash:Trash2, activity:Activity, github:GitBranch };
const cache = new Map();
export function icon(name) {
  if (!cache.has(name)) cache.set(name, createElement(icons[name] || FileText, { width:18, height:18, 'stroke-width':1.6, 'aria-hidden':'true', 'data-icon-library':'lucide' }).outerHTML);
  return cache.get(name);
}
