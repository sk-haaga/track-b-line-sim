/**
 * server.js
 * Fastify HTTP server — glues together the simulation engine, metrics, and
 * the static frontend. Entry point for the application.
 *
 * Each browser gets its own SimulationEngine, keyed by a `sid` cookie.
 * When a session's last SSE client disconnects, the engine is kept alive
 * for SESSION_TTL_MS to survive page reloads, then paused and discarded.
 *
 * Routes:
 *   GET  /              → serves index.html (the visual frontend)
 *   GET  /api/state     → current simulation state (JSON)
 *   GET  /api/metrics   → calculateMetrics() output (JSON, for frontend polling)
 *   GET  /api/events    → SSE stream, pushes state+metrics every 250 ms
 *   POST /api/control   → play/pause/reset/param updates
 *   GET  /api/presets   → scenario presets (id, label, description)
 *   GET  /api/export    → per-tick history as CSV (?format=csv) or JSON (the simulation log)
 */

import Fastify        from 'fastify';
import fastifyStatic  from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

import { SimulationEngine } from './simulation/engine.js';
import { DEFAULT_CONFIG }   from './simulation/config.js';
import { PRESETS, getPreset }   from './simulation/presets.js';
import { calculateMetrics } from './metrics/collector.js';
import * as controls from './controls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT      = parseInt(process.env.PORT ?? '3000', 10);

// Grace period before a session with no clients is torn down.
const SESSION_TTL_MS = 30_000;

// ── Per-session engine registry ───────────────────────────────────────────

// sid -> { engine, sseClients: Set<res>, cleanupTimer: Timeout|null }
const sessions = new Map();

function getSession(sid) {
  let s = sessions.get(sid);
  if (!s) {
    // Start paused: the frontend shows a "Start simulation" prompt and the user
    // kicks off the run with Play (or the start banner). Avoids the line racing
    // ahead before the page has even rendered.
    const engine = new SimulationEngine(DEFAULT_CONFIG);
    s = { engine, sseClients: new Set(), cleanupTimer: null };
    sessions.set(sid, s);
  }
  if (s.cleanupTimer) {
    clearTimeout(s.cleanupTimer);
    s.cleanupTimer = null;
  }
  return s;
}

function scheduleCleanup(sid) {
  const s = sessions.get(sid);
  if (!s || s.sseClients.size > 0 || s.cleanupTimer) return;
  s.cleanupTimer = setTimeout(() => {
    s.engine.pause();
    sessions.delete(sid);
  }, SESSION_TTL_MS);
}

// ── Session cookie ────────────────────────────────────────────────────────

function readSidCookie(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const m = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? m[1] : null;
}

// ── Create Fastify instance ────────────────────────────────────────────────

const app = Fastify({ logger: false });

// Stamp every response with an `sid` cookie if absent — including the initial
// HTML page load. Without this, the browser would hit /api/events before any
// cookie exists, and subsequent /api/control fetches would land on a different
// session than the one tied to the SSE stream.
app.addHook('onRequest', (req, reply, done) => {
  let sid = readSidCookie(req);
  if (!sid) {
    sid = randomUUID();
    reply.header('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  }
  req.sid = sid;
  done();
});

app.register(fastifyStatic, {
  root:   join(__dirname, 'public'),
  prefix: '/',
});

// ── SSE broadcast loop ─────────────────────────────────────────────────────

setInterval(() => {
  for (const s of sessions.values()) {
    if (s.sseClients.size === 0) continue;
    const state   = s.engine.getState();
    const metrics = calculateMetrics(state);
    const line    = `data: ${JSON.stringify({ state, metrics })}\n\n`;
    for (const res of s.sseClients) {
      try { res.raw.write(line); } catch (_) { s.sseClients.delete(res); }
    }
  }
}, 250);

// ── Routes ─────────────────────────────────────────────────────────────────

// SSE stream
app.get('/api/events', (req, reply) => {
  const session = getSession(req.sid);

  // Forward any Set-Cookie the onRequest hook queued, since reply.raw.writeHead
  // bypasses Fastify's normal header flush.
  const setCookie = reply.getHeader('set-cookie');
  const headers = {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  };
  if (setCookie) headers['Set-Cookie'] = setCookie;

  reply.raw.writeHead(200, headers);
  reply.raw.write(':\n\n');
  session.sseClients.add(reply);

  req.raw.on('close', () => {
    session.sseClients.delete(reply);
    scheduleCleanup(req.sid);
  });
});

// Current state (JSON)
app.get('/api/state', async (req) => getSession(req.sid).engine.getState());

// Computed metrics (JSON)
app.get('/api/metrics', async (req) => calculateMetrics(getSession(req.sid).engine.getState()));

// Curated scenario presets — metadata only (id/label/description), never the
// full configs. The frontend renders one load button per entry.
app.get('/api/presets', async () =>
  PRESETS.map(({ id, label, description }) => ({ id, label, description })));

// Control endpoint
app.post('/api/control', async (req, reply) => {
  const { engine } = getSession(req.sid);
  const { action, params = {} } = req.body ?? {};

  switch (action) {
    case 'play':            controls.play(engine);    break;
    case 'pause':           controls.pause(engine);   break;
    case 'reset':           controls.reset(engine);   break;
    case 'resetToDefaults': engine.resetToDefaults(); break;
    case 'spawnMachine':    engine.spawnMachine(params);  break;
    case 'removeMachine':   engine.removeMachine(params); break;
    case 'loadPreset': {
      const cfg = getPreset(params.presetId);
      if (!cfg) return { ok: false, reason: 'unknown preset' };
      engine.loadConfig(cfg);
      return { ok: true, tick: engine.tick };
    }
    default:
      // No recognised action — may still have params to update
  }

  // Validate speed through controls.setSpeed before delegating to updateConfig,
  // so that invalid inputs (e.g. zero/negative multipliers) are rejected.
  if (params.speed !== undefined) {
    try {
      controls.setSpeed(engine, params.speed);
    } catch (err) {
      reply.code(400);
      return { ok: false, error: err.message };
    }
    const { speed: _omit, ...rest } = params;
    if (Object.keys(rest).length > 0) {
      try { engine.updateConfig(rest); } catch (err) { reply.code(400); return { ok: false, error: err.message }; }
    }
  } else if (Object.keys(params).length > 0) {
    // seed (applies at the next reset) and outage { startTick, endTick } | null are accepted here too
    try { engine.updateConfig(params); } catch (err) { reply.code(400); return { ok: false, error: err.message }; }
  }

  return { ok: true, tick: engine.tick };
});

// Per-tick history export — CSV or JSON download of every simulation step
// recorded since the last reset. Format defaults to JSON.
app.get('/api/export', async (req, reply) => {
  const { engine } = getSession(req.sid);
  const history    = engine.getHistory();
  const format     = (req.query?.format ?? 'json').toLowerCase();
  const stamp      = new Date().toISOString().replace(/[:.]/g, '-');

  if (format === 'csv') {
    const csv = historyToCsv(history);
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="machine_sim-${stamp}.csv"`);
    return csv;
  }

  reply
    .header('Content-Type', 'application/json; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="machine_sim-${stamp}.json"`);
  return history;
});

function historyToCsv(rows) {
  if (rows.length === 0) return '';
  // Union of the keys over all rows (first-row order, then new keys in order of
  // appearance), so machines spawned during the run get their own columns.
  const seen = new Set();
  for (const row of rows) for (const k of Object.keys(row)) seen.add(k);
  const columns = [...seen];
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map(c => escape(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

// ── Start server ───────────────────────────────────────────────────────────

try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Line simulation running at http://0.0.0.0:${PORT}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}

async function shutdown(signal) {
  console.log(`received ${signal}, shutting down`);
  try { await app.close(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
