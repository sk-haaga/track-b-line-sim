// AI shift advisor from the command line.
//
//   npm run advise -- --scenario both                      (model and provider from config/advisor.json)
//   npm run advise -- --scenario quarter-60 --model gpt-4o
//   npm run advise -- --scenario both --provider mock      (offline, rule-based baseline, no API key needed)
//   npm run advise -- --all                                (every scenario)
//   npm run advise -- --scenario both --prompt v2          (prompt version, default from config/advisor.json)
//
// Writes results/advisor/<scenario>-<provider>.md and appends every round to results/advisor/advisor-log.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAdvisor, reportMarkdown } from '../src/advisor/advisor.js';
import { loadRateCard } from '../src/economics/rateCard.js';
import { ALL_SCENARIOS } from '../src/scenarios/own.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config', 'advisor.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const provider = opt('provider') ?? cfg.provider;
const model = opt('model') ?? cfg.model;
const promptVersion = opt('prompt') ?? cfg.promptVersion ?? 'v1';
const ids = args.includes('--all') ? ALL_SCENARIOS.map((s) => s.id) : [opt('scenario') ?? 'both'];
const outDir = path.join(root, 'results', 'advisor');
const logFile = path.join(outDir, 'advisor-log.jsonl');
const rates = loadRateCard();

for (const id of ids) {
  const scenario = ALL_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`unknown scenario ${id}; choose one of ${ALL_SCENARIOS.map((s) => s.id).join(', ')}`);
  const r = await runAdvisor({
    scenario, rates, provider, model, temperature: cfg.temperature, maxTokens: cfg.maxTokens, maxRounds: cfg.maxRounds,
    timeoutMs: cfg.timeoutMs, promptVersion, logFile,
  });
  const md = reportMarkdown(r);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${id}-${provider}.md`);
  fs.writeFileSync(file, md);
  console.log(`${id}: ${r.best ? `recommended ${r.best.description} (+${r.best.slGainPoints.toFixed(1)} points)` : 'nothing verified'}; `
    + `${r.rounds.length} round(s), ${r.tokens} tokens, ${r.seconds.toFixed(1)} s → ${path.relative(root, file)}`);
}
console.log(`Log: ${path.relative(root, logFile)}`);
