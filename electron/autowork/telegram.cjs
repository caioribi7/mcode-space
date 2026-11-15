'use strict';
// Bot do Telegram por long polling, sem dependências. Só o chat pareado controla o auto-work.
const API = 'https://api.telegram.org/bot';
const TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;
const COMMANDS = new Set(['start', 'ajuda', 'help', 'parear', 'iniciar', 'sozinho', 'auto', 'manual', 'parar', 'abortar', 'status', 'ideia', 'pular']);

function parseCommand(text) {
  const value = String(text || '').trim();
  if (/^[1-5]$/.test(value)) return { cmd: 'pick', arg: Number(value) - 1 };
  const match = /^\/([a-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(value);
  if (!match) return { cmd: 'text', arg: value.slice(0, 500) };
  const cmd = match[1].toLowerCase();
  return COMMANDS.has(cmd) ? { cmd: cmd === 'help' || cmd === 'start' ? 'ajuda' : cmd === 'auto' ? 'sozinho' : cmd, arg: (match[2] || '').trim().slice(0, 500) } : { cmd: 'unknown', arg: '' };
}
function parseCallback(data) {
  const value = String(data || '');
  if (/^pick:[0-4]$/.test(value)) return { cmd: 'pick', arg: Number(value.slice(5)) };
  if (value === 'pick:auto') return { cmd: 'decide', arg: '' };
  if (value === 'stop') return { cmd: 'parar', arg: '' };
  return { cmd: 'unknown', arg: '' };
}
// Normaliza uma atualização em {chatId, private, text|callback}.
function readUpdate(update) {
  if (update.callback_query) {
    const q = update.callback_query;
    return { chatId: q.message?.chat?.id, private: q.message?.chat?.type === 'private', callbackId: q.id, name: q.from?.first_name || '', ...parseCallback(q.data) };
  }
  const m = update.message;
  if (!m || typeof m.text !== 'string') return null;
  return { chatId: m.chat?.id, private: m.chat?.type === 'private', name: m.from?.first_name || m.chat?.first_name || '', ...parseCommand(m.text) };
}

function createTelegram({ getToken, onCommand, fetchImpl = fetch, retryMs = 5000 }) {
  let offset = 0, running = false, controller = null, loop = null, lastError = null;
  const scrub = (message, token) => String(message || '').split(token || '\u0000').join('***');
  async function call(method, body, signal) {
    const token = getToken();
    if (!TOKEN.test(token || '')) throw new Error('Token do bot inválido.');
    try {
      const response = await fetchImpl(API + token + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal || AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!data.ok) throw new Error('Telegram: ' + (data.description || response.status));
      return data.result;
    } catch (error) { throw new Error(scrub(error.message, token)); }
  }
  async function poll() {
    while (running) {
      controller = new AbortController();
      try {
        const updates = await call('getUpdates', { offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]));
        lastError = null;
        for (const update of updates) {
          offset = update.update_id + 1;
          const parsed = readUpdate(update);
          if (parsed) await Promise.resolve(onCommand(parsed)).catch(() => {});
        }
      } catch (error) {
        if (!running) break;
        lastError = error.message;
        await new Promise(resolve => setTimeout(resolve, retryMs));
      }
    }
  }
  return {
    start() { if (running) return; running = true; loop = poll(); },
    async stop() { running = false; controller?.abort(); await loop?.catch(() => {}); loop = null; },
    get running() { return running; },
    get lastError() { return lastError; },
    getMe: () => call('getMe', {}),
    send(chatId, text, buttons) {
      const body = { chat_id: chatId, text: String(text).slice(0, 4000), disable_web_page_preview: true };
      if (buttons) body.reply_markup = { inline_keyboard: buttons };
      return call('sendMessage', body);
    },
    answer(callbackId, text = '') { return call('answerCallbackQuery', { callback_query_id: callbackId, text: text.slice(0, 180) }).catch(() => {}); },
  };
}

module.exports = { createTelegram, parseCommand, parseCallback, readUpdate, TOKEN };
