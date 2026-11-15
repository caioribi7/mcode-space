const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { parseCommand, parseCallback, readUpdate } = require('../electron/autowork/telegram.cjs');
const runners = require('../electron/autowork/runners.cjs');
const { createSandbox, forbiddenPaths } = require('../electron/autowork/sandbox.cjs');
const { createOrchestrator, parsePlan, parseReview } = require('../electron/autowork/orchestrator.cjs');
const { createAutowork } = require('../electron/autowork/index.cjs');

test('telegram commands are parsed into a fixed vocabulary', () => {
  assert.deepEqual(parseCommand('/parear 123456'), { cmd: 'parear', arg: '123456' });
  assert.deepEqual(parseCommand('/iniciar@MeuBot sozinho'), { cmd: 'iniciar', arg: 'sozinho' });
  assert.deepEqual(parseCommand('3'), { cmd: 'pick', arg: 2 });
  assert.deepEqual(parseCommand('/auto'), { cmd: 'sozinho', arg: '' });
  assert.equal(parseCommand('/rm -rf').cmd, 'unknown');
  assert.equal(parseCommand('olá').cmd, 'text');
  assert.deepEqual(parseCallback('pick:4'), { cmd: 'pick', arg: 4 });
  assert.equal(parseCallback('pick:9').cmd, 'unknown');
  assert.equal(parseCallback('pick:auto').cmd, 'decide');
  const update = readUpdate({ update_id: 1, message: { chat: { id: 7, type: 'private' }, from: { first_name: 'Ana' }, text: '/status' } });
  assert.equal(update.chatId, 7); assert.equal(update.private, true); assert.equal(update.cmd, 'status');
});

test('runner helpers keep cmd.exe arguments safe and parse model output', () => {
  const shim = runners.commandFor({ command: 'C:\\Windows\\System32\\cmd.exe', args: '/d /s /c ""C:\\npm\\opencode.cmd""', target: 'C:\\npm\\opencode.cmd' }, ['run', '--model', 'nvidia/a-b', 'Read the file now.']);
  assert.equal(shim.verbatim, true);
  assert.equal(shim.args[0], '/d /s /c ""C:\\npm\\opencode.cmd" run --model nvidia/a-b "Read the file now.""');
  assert.throws(() => runners.commandFor({ command: 'x', args: [], target: 'x' }, ['a & calc']), /recusado/);
  assert.throws(() => runners.commandFor({ command: 'x', args: [], target: 'x' }, ['%PATH%']), /recusado/);
  assert.deepEqual(runners.extractJson('texto ```json\n{"a":1}\n``` fim'), { a: 1 });
  assert.equal(runners.extractJson('nada'), null);
  assert.equal(runners.pickNvidiaModel(['nvidia/embed-qa', 'qwen/qwen3-coder-480b', 'minimaxai/minimax-m3.1-flash']), 'minimaxai/minimax-m3.1-flash');
  assert.equal(runners.pickNvidiaModel(['a/b', 'qwen/qwen3-coder'], 'a/b'), 'a/b');
  const parsed = runners.parseOpencodeJson('{"type":"text","part":{"type":"text","text":"feito"}}\n{"type":"step_finish","part":{"type":"step-finish","tokens":{"input":10,"output":5,"reasoning":1,"cache":{"read":3}}}}');
  assert.deepEqual(parsed, { text: 'feito', usage: { input: 10, output: 6, cached: 3 } });
  const config = runners.opencodeConfig({ nvidiaModel: 'x/y' });
  assert.equal(config.permission.bash['*'], 'deny'); assert.equal(config.provider.nvidia.options.apiKey, '{env:NVIDIA_API_KEY}');
  assert.equal(runners.stripEnv({ anthropic_api_key: 'x', PATH: 'p' }, ['ANTHROPIC_API_KEY']).anthropic_api_key, undefined);
});

test('nvidia chat reports usage and strips reasoning', async () => {
  let body;
  const fetchImpl = async (url, init) => { body = JSON.parse(init.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '<think>x</think> {"ok":1}' } }], usage: { prompt_tokens: 9, completion_tokens: 4 } }) }; };
  const result = await runners.nvidiaChat({ key: 'k', model: 'm', prompt: 'p', fetchImpl });
  assert.equal(result.text, '{"ok":1}'); assert.deepEqual(result.usage, { input: 9, output: 4, cached: 0 }); assert.equal(body.model, 'm');
  const limited = await runners.nvidiaChat({ key: 'k', model: 'm', prompt: 'p', fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
  assert.equal(limited.ok, false); assert.equal(limited.limited, true);
});

test('protected paths and model responses are validated', () => {
  assert.deepEqual(forbiddenPaths(['src/a.js', '.env', 'config/.env.local', '.git/config', 'keys/server.pem', 'docs/env.md']), ['.env', 'config/.env.local', '.git/config', 'keys/server.pem']);
  const plan = parsePlan('{"options":[{"title":"A","why":"x","size":"P"},{"title":" ","why":""},{"title":"B"}],"recommended":5}');
  assert.equal(plan.options.length, 2); assert.equal(plan.recommended, 0); assert.equal(plan.options[1].size, 'M');
  assert.deepEqual(parseReview('{"approve":true,"feedback":"","commit":"feat: a\\nb"}'), { approve: true, feedback: '', commit: 'feat: a b' });
  assert.equal(parseReview('{"approve":"yes"}'), null);
});

function fakeSandbox(log) {
  let n = 0;
  return () => ({
    workdir: 'W',
    prepare: async () => ({ branch: 'autowork' }), reset: async () => {}, head: async () => 'h', ensureHead: async () => {},
    changes: async () => ['src/x.js'], writeTask: async text => log.push(['task', text]), clearTask: async () => {},
    test: async () => ({ ran: true, ok: true, output: '' }), diff: async () => ({ stat: '1 file', files: 1, added: 3, removed: 1, text: 'diff' }),
    commit: async message => { log.push(['commit', message]); return 'c' + (++n); }, context: async () => ({ files: 'a', log: '', agents: '', product: '' }),
  });
}
const plan = JSON.stringify({ options: [1, 2, 3, 4, 5].map(i => ({ title: 'Tarefa ' + i, why: 'w', size: 'P' })), recommended: 2 });

test('manual mode waits for a choice, commits approved work and stops on request', async () => {
  const log = [], sent = [];
  const think = async kind => ({ ok: true, by: kind === 'plan' ? 'claude' : 'nvidia', text: kind === 'plan' ? plan : kind === 'review' ? '{"approve":true,"feedback":"","commit":"feat: tarefa 2"}' : 'passos', usage: { input: 100, output: 10 } });
  const o = createOrchestrator({ think, implement: async () => ({ ok: true, by: 'opencode', usage: { input: 50, output: 5 } }), createSandbox: fakeSandbox(log), send: (text, buttons) => sent.push({ text, buttons }) });
  o.start({ root: 'R', mode: 'manual', limits: { maxCycles: 1 } });
  while (o.snapshot().status !== 'choosing') await new Promise(r => setTimeout(r, 5));
  assert.equal(o.choose(9), false);
  assert.ok(sent.some(m => m.buttons && m.text.includes('Recomendo: 3')));
  assert.equal(o.choose(1), true);
  await o.whenIdle();
  const snap = o.snapshot();
  assert.equal(snap.commits.length, 1); assert.equal(snap.commits[0].title, 'Tarefa 2');
  assert.deepEqual(log.find(e => e[0] === 'commit'), ['commit', 'feat: tarefa 2']);
  assert.equal(snap.usage.claude.input, 100); assert.equal(snap.usage.opencode.output, 5);
  assert.match(sent.at(-1).text, /encerrado \(limite de 1 ciclos\)/);
});

test('auto mode retries with feedback, records failures and stops after three in a row', async () => {
  const log = [], sent = []; let implemented = 0;
  const think = async kind => ({ ok: true, by: 'claude', text: kind === 'plan' ? plan : kind === 'review' ? '{"approve":false,"feedback":"falta teste","commit":"x"}' : 'passos', usage: {} });
  const o = createOrchestrator({ think, implement: async () => { implemented++; return { ok: true, by: 'opencode', usage: {} }; }, createSandbox: fakeSandbox(log), send: text => sent.push(text) });
  o.start({ root: 'R', mode: 'auto' });
  await o.whenIdle();
  const snap = o.snapshot();
  assert.equal(snap.failures.length, 3); assert.equal(implemented, 6); assert.equal(snap.commits.length, 0);
  assert.ok(log.some(e => e[0] === 'task' && e[1].includes('falta teste')));
  assert.equal(snap.failures[0].title, 'Tarefa 3');
  assert.match(sent.at(-1), /3 falhas seguidas/);
});

test('stop while waiting for a choice ends the session without running a cycle', async () => {
  const sent = [];
  const o = createOrchestrator({ think: async () => ({ ok: true, by: 'claude', text: plan, usage: {} }), implement: async () => assert.fail('não deveria implementar'), createSandbox: fakeSandbox([]), send: text => sent.push(text) });
  o.start({ root: 'R' });
  while (o.snapshot().status !== 'choosing') await new Promise(r => setTimeout(r, 5));
  assert.equal(o.idea(''), false);
  o.stop(); await o.whenIdle();
  assert.equal(o.snapshot().cycle, 0); assert.match(sent.at(-1), /pedido do usuário/);
});

test('sandbox works in an autowork worktree and never touches the opened branch', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcode-autowork-'));
  try {
    const repo = path.join(dir, 'repo'); await fs.mkdir(repo);
    const git = args => execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString();
    git(['init', '-q', '-b', 'main']); git(['config', 'user.email', 't@example.com']); git(['config', 'user.name', 'T']);
    await fs.writeFile(path.join(repo, 'a.txt'), 'a\n'); git(['add', '.']); git(['commit', '-qm', 'init']);
    const sandbox = createSandbox({ procs: runners.createProcesses(), root: repo, baseDir: path.join(dir, 'wt'), env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' } });
    const box = await sandbox.prepare();
    assert.equal(box.branch, 'autowork');
    const base = await sandbox.head();
    await sandbox.writeTask('tarefa');
    await fs.writeFile(path.join(box.workdir, 'b.txt'), 'b\n');
    assert.deepEqual(await sandbox.changes(), ['b.txt']);
    const diff = await sandbox.diff(); assert.equal(diff.files, 1); assert.equal(diff.added, 1);
    const hash = await sandbox.commit('feat: b');
    assert.match(hash, /^[0-9a-f]{7,}$/);
    assert.equal(git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'main');
    assert.equal(git(['log', '--oneline', 'main']).trim().split('\n').length, 1);
    assert.equal(git(['show', 'autowork:b.txt']), 'b\n');
    assert.equal(git(['ls-tree', '-r', '--name-only', 'autowork']).includes('.autowork-task.md'), false);
    // Commit feito por um agente volta ao índice para passar pela revisão.
    const head = await sandbox.head();
    await fs.writeFile(path.join(box.workdir, 'c.txt'), 'c\n');
    execFileSync('git', ['add', '.'], { cwd: box.workdir }); execFileSync('git', ['commit', '-qm', 'rogue'], { cwd: box.workdir });
    await sandbox.ensureHead(head);
    assert.equal(await sandbox.head(), head); assert.deepEqual(await sandbox.changes(), ['c.txt']);
    await sandbox.reset(); assert.deepEqual(await sandbox.changes(), []);
    assert.notEqual(base, head);
    const again = await createSandbox({ procs: runners.createProcesses(), root: repo, baseDir: path.join(dir, 'wt') }).prepare();
    assert.equal(again.dir, box.dir);
  } finally { await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }); }
});

test('only the paired private chat controls the service', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcode-autowork-svc-'));
  const sent = [];
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from('enc:' + s), decryptString: b => { const s = b.toString(); if (!s.startsWith('enc:')) throw Error('x'); return s.slice(4); } };
  const fetchImpl = async (url, init) => {
    const method = url.split('/').pop(), body = JSON.parse(init.body || '{}');
    if (method === 'getMe') return { json: async () => ({ ok: true, result: { username: 'meubot' } }) };
    if (method === 'getUpdates') { await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))); }
    sent.push({ method, body });
    return { json: async () => ({ ok: true, result: {} }) };
  };
  const service = createAutowork({ userData: dir, safeStorage, resolveAgent: () => null, allowedRoots: () => [], send: () => {}, fetchImpl });
  try {
    await service.init();
    await assert.rejects(service.configure({ telegramToken: 'abc' }), /inválido/);
    await assert.rejects(service.configure({ nvidiaKey: 'sk-123' }), /nvapi/);
    let state = await service.configure({ telegramToken: '123456:' + 'A'.repeat(35) });
    assert.equal(state.telegram.bot, '@meubot'); assert.equal(state.telegram.paired, false);
    const raw = await fs.readFile(path.join(dir, 'autowork', 'settings.bin'), 'utf8');
    assert.ok(raw.startsWith('enc:'));
    assert.equal(JSON.stringify(state).includes('AAAA'), false, 'o token não vai ao renderer');
    state = await service.pair();
    const code = state.telegram.pairing.code;
    await service._handle({ chatId: 99, private: false, cmd: 'parear', arg: code });
    await service._handle({ chatId: 42, private: true, cmd: 'parear', arg: '000000' });
    assert.equal((await service.state()).telegram.paired, false);
    await service._handle({ chatId: 42, private: true, cmd: 'parear', arg: code, name: 'Ana' });
    state = await service.state();
    assert.equal(state.telegram.paired, true); assert.equal(state.telegram.chatName, 'Ana');
    sent.length = 0;
    await service._handle({ chatId: 99, private: true, cmd: 'status', arg: '' });
    assert.equal(sent.length, 0, 'outros chats são ignorados');
    await service._handle({ chatId: 42, private: true, cmd: 'status', arg: '' });
    assert.equal(sent[0].body.chat_id, '42'); assert.match(sent[0].body.text, /parado/);
    await service._handle({ chatId: 42, private: true, cmd: 'iniciar', arg: '' });
    assert.match(sent.at(-1).body.text, /Inicie uma vez pelo app/);
  } finally { await service.shutdown(); await fs.rm(dir, { recursive: true, force: true }); }
});
