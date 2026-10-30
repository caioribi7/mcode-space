const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const MAX_FILE = 2 * 1024 * 1024;
const revision = buffer => createHash('sha256').update(buffer).digest('hex');

async function inside(root, candidate) {
  if (typeof candidate !== 'string') throw new Error('Caminho inválido.');
  const base = await fs.realpath(root);
  const resolved = await fs.realpath(path.resolve(base, candidate));
  const relative = path.relative(base, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Este caminho está fora da pasta aberta.');
  }
  // Git metadata is managed by Git, never by the editor.
  if (relative.split(path.sep).some(part => part.toLowerCase() === '.git')) {
    throw new Error('Os arquivos internos do Git são protegidos.');
  }
  return resolved;
}

async function list(root, candidate = '.') {
  const directory = await inside(root, candidate);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.name !== '.git').map(entry => ({
    name: entry.name,
    path: path.relative(root, path.join(directory, entry.name)),
    directory: entry.isDirectory(),
    symlink: entry.isSymbolicLink(),
  })).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
}

async function read(root, candidate) {
  const file = await inside(root, candidate);
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_FILE) throw new Error('Abra um arquivo de texto de até 2 MB.');
  const buffer = await fs.readFile(file);
  if (buffer.includes(0)) throw new Error('Este arquivo é binário e não pode ser editado como texto.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new Error('O editor aceita arquivos de texto UTF-8.'); }
  return { path: candidate, text, revision: revision(buffer), bom: buffer.subarray(0, 3).equals(Buffer.from([239, 187, 191])) };
}

async function save(root, { path: candidate, text, revision: expected, bom }) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_FILE || typeof expected !== 'string') throw new Error('Conteúdo inválido ou maior que 2 MB.');
  const file = await inside(root, candidate);
  const current = await fs.readFile(file);
  if (revision(current) !== expected) throw new Error('O arquivo mudou fora do editor. Reabra-o antes de salvar para não sobrescrever essas mudanças.');
  const buffer = Buffer.from((bom ? '\uFEFF' : '') + text);
  await fs.writeFile(file, buffer);
  return { revision: revision(buffer) };
}

module.exports = { inside, list, read, save };
