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
    path: path.relative(root, path.join(directory, entry.name)).split(path.sep).join('/'),
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

async function containsRepository(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.toLowerCase() === '.git') return true;
    if (entry.isDirectory() && !entry.isSymbolicLink() && await containsRepository(path.join(directory, entry.name))) return true;
  }
  return false;
}

async function move(root, candidate, targetDirectory) {
  const source = await inside(root, candidate);
  const directory = await inside(root, targetDirectory);
  const base = await fs.realpath(root);
  if (source === base) throw new Error('A pasta de trabalho não pode ser movida.');
  // Never dereference a dragged link and move its target instead.
  if ((await fs.lstat(path.resolve(base, candidate))).isSymbolicLink()) throw new Error('Links não podem ser movidos pelo explorador.');
  if (!(await fs.stat(directory)).isDirectory()) throw new Error('Solte sobre uma pasta.');
  const info = await fs.lstat(source);
  if (!info.isFile() && !info.isDirectory()) throw new Error('Este tipo de arquivo não pode ser movido.');
  const destination = path.join(directory, path.basename(source));
  if (destination === source) throw new Error('O item já está nesta pasta.');
  const descendant = path.relative(source, directory);
  if (info.isDirectory() && (descendant === '' || (!descendant.startsWith(`..${path.sep}`) && descendant !== '..' && !path.isAbsolute(descendant)))) {
    throw new Error('Uma pasta não pode ser movida para dentro dela mesma.');
  }
  if (info.isDirectory() && await containsRepository(source)) throw new Error('Pastas que contêm um repositório Git não podem ser movidas pelo explorador.');
  try { await fs.lstat(destination); throw new Error('Já existe um item com esse nome no destino. Nada foi substituído.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (info.isFile()) {
    // A hard link reserves the destination atomically without overwriting a file.
    try { await fs.link(source, destination); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('Já existe um item com esse nome no destino. Nada foi substituído.');
      throw error;
    }
    try { await fs.unlink(source); }
    catch { throw new Error('O arquivo foi copiado ao destino, mas a origem não pôde ser removida. Confira as duas pastas.'); }
  } else {
    await fs.rename(source, destination);
  }
  return {
    from: path.relative(base, source).split(path.sep).join('/'),
    to: path.relative(base, destination).split(path.sep).join('/'),
    directory: info.isDirectory(),
  };
}

async function readImage(root,candidate) {
  const file=await inside(root,candidate);
  const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif'};
  const type=types[path.extname(file).toLowerCase()];
  const info=await fs.stat(file);
  if(!type||!info.isFile()||info.size>8*1024*1024)throw new Error('A prévia aceita imagens locais PNG, JPEG, GIF, WebP e AVIF de até 8 MB.');
  return `data:${type};base64,${(await fs.readFile(file)).toString('base64')}`;
}

module.exports = { inside, list, read, save, move, readImage };
