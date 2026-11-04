/**
 * llm.js
 * Model-agnostic chat client (the model name is a config value, as the General Brief asks).
 *
 *   provider 'organiser'  the hackathon endpoint: POST {LLM_BASE_URL}/api/v1/llm/chat with headers X-Client-ID and
 *                         X-Client-Secret; body { model, messages, temperature, maxTokens }; answer in data.content,
 *                         token usage in data.usage. Credentials come from .env (never committed) or the environment.
 *   provider 'mock'       a rule-based stand-in with the same interface (see mockAdvisor.js): runs offline, costs
 *                         nothing, and is the baseline the AI advisor is compared with.
 *
 * Every call returns { content, usage: { promptTokens, completionTokens, totalTokens }, seconds, model, provider }.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockChat } from './mockAdvisor.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(here, '..', '..', '.env');

// Minimal .env reader (KEY=VALUE per line, # comments). Real environment variables win.
export function loadEnv(file = ENV_PATH) {
  const env = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(CLIENT_ID|CLIENT_SECRET|LLM_BASE_URL|LLM_MODEL)$/.test(k))) };
}

function normaliseUsage(u = {}) {
  const promptTokens = u.promptTokens ?? u.prompt_tokens ?? u.inputTokens ?? 0;
  const completionTokens = u.completionTokens ?? u.completion_tokens ?? u.outputTokens ?? 0;
  return { promptTokens, completionTokens, totalTokens: u.totalTokens ?? u.total_tokens ?? promptTokens + completionTokens };
}

// The organiser endpoint accepts only the roles 'user' and 'assistant' (it answers 400 for 'system'), so system
// instructions are put at the top of the first user message.
export function foldSystemMessages(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ ...m }));
  if (!system) return rest;
  const first = rest.find((m) => m.role === 'user');
  if (first) first.content = `${system}\n\n---\n\n${first.content}`;
  else rest.unshift({ role: 'user', content: system });
  return rest;
}

export async function chat({ provider = 'organiser', model, messages, temperature = 0.2, maxTokens = 1200, timeoutMs = 60000, env = loadEnv(), fetchImpl = fetch }) {
  const t0 = performance.now();
  if (provider === 'mock') {
    const content = mockChat(messages);
    return { content, usage: normaliseUsage({}), seconds: (performance.now() - t0) / 1000, model: 'mock-rules', provider };
  }
  if (provider !== 'organiser') throw new Error(`unknown provider ${provider}`);
  const { CLIENT_ID, CLIENT_SECRET, LLM_BASE_URL } = env;
  if (!CLIENT_ID || !CLIENT_SECRET || !LLM_BASE_URL) {
    throw new Error('missing CLIENT_ID, CLIENT_SECRET or LLM_BASE_URL: copy .env.example to .env and fill it in from the API sheet');
  }
  const useModel = model ?? env.LLM_MODEL;
  const sendMessages = foldSystemMessages(messages);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${LLM_BASE_URL.replace(/\/$/, '')}/api/v1/llm/chat`, {
      method: 'POST',
      headers: { 'X-Client-ID': CLIENT_ID, 'X-Client-Secret': CLIENT_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: useModel, messages: sendMessages, temperature, maxTokens }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`LLM endpoint answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const content = body?.data?.content ?? body?.content ?? body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`unexpected LLM answer: ${JSON.stringify(body).slice(0, 300)}`);
  return { content, usage: normaliseUsage(body?.data?.usage ?? body?.usage), seconds: (performance.now() - t0) / 1000, model: useModel, provider };
}
