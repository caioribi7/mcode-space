'use strict';
// Processos e provedores do auto-work: Claude CLI (plano do usuário), API NVIDIA e OpenCode CLI.
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
// Ordem de preferência para o modelo NVIDIA quando o usuário não escolhe um: modelos de código/agentes.
const NVIDIA_PREFERENCE = ['minimax-m3', 'qwen3-coder', 'nemotron-3-ultra', 'kimi-k3', 'deepseek-v4', 'glm-5', 'minimax-m2', 'kimi-k2', 'qwen3', 'deepseek'];
const SAFE_ARG = /^[A-Za-z0-9_.,:/@=+*()\- ]+$/;
const MODEL = /^[A-Za-z0-9._:/\[\]-]{1,120}$/;

function stripEnv(env, names) { const next = { ...env }; for (const key of Object.keys(next)) if (names.includes(key.toUpperCase())) delete next[key]; return next; }

// node-pty não é usado aqui; um shim .cmd precisa da linha de comando bruta do cmd.exe.
function commandFor(resolved, argv) {
  if (!resolved) throw new Error('Agente indisponível.');
  for (const arg of argv) if (typeof arg !== 'string' || !SAFE_ARG.test(arg)) throw new Error('Argumento recusado para o agente.');
  if (typeof resolved.args === 'string') {
    const line = argv.map(arg => /[\s()*]/.test(arg) ? `"${arg}"` : arg).join(' ');
    return { command: resolved.command, args: [`/d /s /c ""${resolved.target}" ${line}"`], verbatim: true };
  }
  return { command: resolved.command, args: argv, verbatim: false };
}

function createProcesses({ platform = process.platform } = {}) {
  const live = new Set();
  function kill(child) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (platform === 'win32') execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
    else child.kill('SIGTERM');
  }
  function run({ command, args = [], verbatim = false, cwd, env = process.env, input = '', timeoutMs = 30 * 60e3, maxBytes = 8e6 }) {
    return new Promise((resolve, reject) => {
      let child;
      try { child = spawn(command, args, { cwd, env, windowsHide: true, windowsVerbatimArguments: verbatim, stdio: ['pipe', 'pipe', 'pipe'] }); }
      catch (error) { reject(error); return; }
      live.add(child);
      let stdout = '', stderr = '', timedOut = false;
      const timer = setTimeout(() => { timedOut = true; kill(child); }, timeoutMs);
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', d => { if (stdout.length < maxBytes) stdout += d; });
      child.stderr.on('data', d => { if (stderr.length < maxBytes) stderr += d; });
      child.on('error', error => { clearTimeout(timer); live.delete(child); reject(error); });
      child.on('close', code => { clearTimeout(timer); live.delete(child); resolve({ code, stdout, stderr, timedOut, aborted: child.aborted === true }); });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
  }
  function abortAll() { for (const child of live) { child.aborted = true; kill(child); } }
  return { run, abortAll, get active() { return live.size; } };
}

const LIMITED = /usage limit|rate.?limit|429|overloaded|quota|credit balance|limit reached|too many requests|resets? at/i;
function claudeUsage(u = {}) { return { input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), cached: u.cache_read_input_tokens || 0, output: u.output_tokens || 0 }; }

// Claude Code em modo não interativo. "dontAsk" nega tudo que não está na lista explícita de ferramentas.
async function runClaude({ procs, resolved, cwd, prompt, tools, model, timeoutMs = 20 * 60e3, env = process.env }) {
  const argv = ['-p', '--output-format', 'json', '--permission-mode', 'dontAsk', '--strict-mcp-config', '--no-session-persistence', '--setting-sources', 'user',
    '--allowedTools', tools.join(','), '--disallowedTools', 'Read(**/.env*),Read(**/*.pem),Read(**/*.key),Edit(**/.git/**),Write(**/.git/**),Edit(**/.env*),Write(**/.env*),WebFetch,WebSearch,PowerShell,Agent,Task,NotebookEdit'];
  // No Windows o CLI também oferece a ferramenta PowerShell, que liberava comandos de leitura mesmo em dontAsk: negada explicitamente.
  if (model) { if (!MODEL.test(model)) throw new Error('Modelo Claude inválido.'); argv.push('--model', model); }
  const cmd = commandFor(resolved, argv);
  // ANTHROPIC_API_KEY faria o CLI cobrar pela API; o auto-work usa o plano da conta logada.
  const result = await procs.run({ ...cmd, cwd, input: prompt, timeoutMs, env: stripEnv(env, ['ANTHROPIC_API_KEY', 'NVIDIA_API_KEY']) });
  let data = null;
  try { data = JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).pop() || ''); } catch {}
  const text = typeof data?.result === 'string' ? data.result : '';
  const failed = result.aborted || result.timedOut || result.code !== 0 || !data || data.is_error;
  const raw = `${text} ${result.stderr}`.slice(-2000);
  return { ok: !failed, text, usage: claudeUsage(data?.usage), limited: failed && LIMITED.test(raw), aborted: result.aborted, error: failed ? (result.timedOut ? 'Tempo esgotado.' : raw.trim().slice(-300) || `Saída ${result.code}`) : null };
}

async function nvidiaModels({ key, fetchImpl = fetch }) {
  const response = await fetchImpl(NVIDIA_BASE + '/models', { headers: { authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('NVIDIA recusou a chave (' + response.status + ').');
  const data = await response.json();
  return (data.data || []).map(m => m.id).filter(id => typeof id === 'string');
}
function pickNvidiaModel(ids, preferred = '') {
  if (preferred && ids.includes(preferred)) return preferred;
  const usable = ids.filter(id => !/embed|rerank|vision|-vl|guard|safety|reward|parse|ocr|clip|tts|asr/i.test(id));
  for (const fragment of NVIDIA_PREFERENCE) {
    const found = usable.filter(id => id.toLowerCase().includes(fragment)).sort().reverse()[0];
    if (found) return found;
  }
  return usable[0] || null;
}
async function nvidiaChat({ key, model, prompt, system, maxTokens = 4096, fetchImpl = fetch, signal, timeoutMs = 240e3 }) {
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
  const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
  const response = await fetchImpl(NVIDIA_BASE + '/chat/completions', {
    method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2, stream: false }), signal: AbortSignal.any(signals),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, limited: response.status === 429, error: 'NVIDIA ' + response.status + (body?.detail || body?.error?.message ? ': ' + String(body.detail || body.error.message).slice(0, 200) : ''), usage: { input: 0, output: 0, cached: 0 } };
  const text = String(body.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { ok: Boolean(text), text, error: text ? null : 'Resposta vazia da NVIDIA.', usage: { input: body.usage?.prompt_tokens || 0, output: body.usage?.completion_tokens || 0, cached: 0 } };
}

// Configuração própria do OpenCode para o auto-work: provedor NVIDIA e permissões restritas ao worktree.
function opencodeConfig({ nvidiaModel }) {
  const config = {
    $schema: 'https://opencode.ai/config.json', autoupdate: false, share: 'disabled',
    permission: { edit: 'allow', webfetch: 'deny', external_directory: 'deny', bash: { '*': 'deny', 'npm test': 'allow', 'npm run test*': 'allow', 'git status*': 'allow', 'git diff*': 'allow', 'git log*': 'allow' } },
  };
  if (nvidiaModel) config.provider = { nvidia: { npm: '@ai-sdk/openai-compatible', name: 'NVIDIA NIM', options: { baseURL: NVIDIA_BASE, apiKey: '{env:NVIDIA_API_KEY}' }, models: { [nvidiaModel]: { name: nvidiaModel } } } };
  return config;
}
function parseOpencodeJson(stdout) {
  let text = '', input = 0, output = 0, cached = 0, events = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event; try { event = JSON.parse(line); } catch { continue; }
    events++;
    const part = event.part || event;
    if (part.type === 'text' && typeof part.text === 'string') text = part.text;
    const tokens = part.tokens || event.tokens;
    if (tokens) { input += tokens.input || 0; output += (tokens.output || 0) + (tokens.reasoning || 0); cached += tokens.cache?.read || 0; }
  }
  return events ? { text, usage: { input, output, cached } } : null;
}
async function runOpencode({ procs, resolved, cwd, model, agent, message, configPath, nvidiaKey, timeoutMs = 30 * 60e3, env = process.env }) {
  if (!MODEL.test(model)) throw new Error('Modelo OpenCode inválido.');
  const argv = ['run', '--model', model, ...(agent ? ['--agent', agent] : []), '--format', 'json', message];
  const childEnv = { ...stripEnv(env, ['ANTHROPIC_API_KEY', 'NVIDIA_API_KEY']), OPENCODE_CONFIG: configPath, ...(nvidiaKey ? { NVIDIA_API_KEY: nvidiaKey } : {}) };
  const result = await procs.run({ ...commandFor(resolved, argv), cwd, env: childEnv, timeoutMs });
  const parsed = parseOpencodeJson(result.stdout);
  const text = parsed ? parsed.text : result.stdout.trim().slice(-20000);
  // Sem telemetria: estimativa por caracteres (aprox. 4 por token), marcada como parcial.
  const usage = parsed?.usage && (parsed.usage.input || parsed.usage.output) ? parsed.usage : { input: Math.round((message.length + 6000) / 4), output: Math.round(result.stdout.length / 4), cached: 0, estimated: true };
  const failed = result.aborted || result.timedOut || result.code !== 0;
  const raw = (result.stderr + ' ' + text).slice(-2000);
  return { ok: !failed, text, usage, limited: failed && LIMITED.test(raw), aborted: result.aborted, error: failed ? (result.timedOut ? 'Tempo esgotado.' : raw.trim().slice(-300) || `Saída ${result.code}`) : null };
}
async function opencodeFreeModels({ procs, resolved, env = process.env }) {
  const result = await procs.run({ ...commandFor(resolved, ['models', 'opencode']), env, timeoutMs: 60e3 });
  return result.stdout.split(/\r?\n/).map(s => s.trim()).filter(s => /^opencode\/[A-Za-z0-9._-]+$/.test(s) && /free|big-pickle/i.test(s));
}
async function writeOpencodeConfig(file, options) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(opencodeConfig(options), null, 2));
  return file;
}

// Extrai o primeiro objeto JSON de uma resposta de modelo (com ou sem cercas de código).
function extractJson(text) {
  const source = String(text || '').replace(/```(?:json)?/gi, '');
  const start = source.indexOf('{');
  for (let end = source.lastIndexOf('}'); start >= 0 && end > start; end = source.lastIndexOf('}', end - 1)) {
    try { return JSON.parse(source.slice(start, end + 1)); } catch {}
  }
  return null;
}

module.exports = { createProcesses, commandFor, runClaude, nvidiaModels, pickNvidiaModel, nvidiaChat, opencodeConfig, writeOpencodeConfig, parseOpencodeJson, runOpencode, opencodeFreeModels, extractJson, stripEnv, SAFE_ARG, MODEL, NVIDIA_BASE };
