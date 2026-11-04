// advisor-page.js — the AI shift advisor page: run the advisor on a scenario, show the result, chat about it.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => (x == null ? '–' : `${(100 * x).toFixed(1)}%`);
const signed = (x, d = 1) => (x == null ? '–' : `${x >= 0 ? '+' : ''}${x.toFixed(d)}`);
const eur = (x) => (x == null ? '–' : `€${Math.round(x).toLocaleString('en-US')}`);

let options = null, current = null, history = [], knownFacts = new Set();

// Turn "F4" in a text into clickable badges that highlight the fact.
function withFactRefs(text) {
  return esc(text).replace(/\bF(\d+)\b/g, (m) => knownFacts.has(m)
    ? `<button type="button" class="fact-ref" data-fact="${m}">${m}</button>`
    : `<span class="fact-ref unknown" title="This fact does not exist">${m}</span>`);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.fact-ref[data-fact]');
  if (!b) return;
  const li = document.querySelector(`#facts li[data-id="${b.dataset.fact}"]`);
  if (!li) return;
  li.scrollIntoView({ behavior: 'smooth', block: 'center' });
  li.classList.add('flash');
  setTimeout(() => li.classList.remove('flash'), 1600);
});

async function loadOptions() {
  options = await fetch('/api/advisor/options').then((r) => r.json());
  const groups = {};
  for (const s of options.scenarios) (groups[s.group] ??= []).push(s);
  $('sel-scenario').innerHTML = Object.entries(groups).map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map((s) => `<option value="${esc(s.id)}">${esc(s.id)}</option>`).join('')}</optgroup>`).join('');
  $('sel-scenario').value = 'both';
  $('sel-provider').value = options.defaultProvider;
  $('sel-provider').options[0].text = `${options.model} (real AI, needs .env)`;
  $('sel-prompt').innerHTML = options.prompts.map((p) => `<option value="${p}">${p}</option>`).join('');
  $('sel-prompt').value = options.defaultPrompt;
  showDescription();
}
function showDescription() {
  const s = options.scenarios.find((x) => x.id === $('sel-scenario').value);
  $('scenario-desc').textContent = s ? s.description : '';
}
$('sel-scenario').addEventListener('change', showDescription);

function verdict(p) {
  if (p.errors?.length) return `<span class="badge rej" title="${esc(p.errors.join('; '))}">rejected</span>`;
  if (!p.pass) return '<span class="badge no">not verified</span>';
  return p.evidence?.startsWith('weak') ? '<span class="badge weak">weak</span>' : '<span class="badge ok">verified</span>';
}

function render(r) {
  knownFacts = new Set(r.facts.map((f) => f.id));
  $('k-base').textContent = pct(r.baseline.serviceLevel);
  $('k-best').textContent = r.best ? pct(r.best.serviceLevel) : '–';
  $('k-best-sub').textContent = r.best ? r.best.description : 'nothing verified';
  $('k-good').textContent = r.baseline.goodPerShift.toFixed(1);
  $('k-tokens').textContent = r.tokens ? r.tokens.toLocaleString('en-US') : '0';
  $('k-tokens-sub').textContent = `tokens · ${r.seconds.toFixed(1)} s · ${r.model} · prompt ${r.promptVersion}`;

  $('diagnosis').innerHTML = r.diagnosis ? withFactRefs(r.diagnosis) : 'The AI gave no valid answer (see the proposals table).';
  $('causes').innerHTML = (r.rootCauses ?? []).map((c, i) =>
    `<div class="cause"><b>${i + 1}.</b> <span>${esc(c.cause)}</span>${c.category ? `<span class="cause-cat">${esc(c.category)}</span>` : ''} ${(c.facts ?? []).map((f) => withFactRefs(f)).join(' ')}</div>`).join('');

  const rows = r.rounds.flatMap((rd) => rd.proposals.map((p) => ({ ...p, round: rd.round })));
  const bestKey = r.best?.description;
  $('proposals').innerHTML = rows.length ? rows.map((p) => `<tr class="${p.pass && p.description === bestKey ? 'best' : ''}">
      <td>${p.round}</td>
      <td><b>${esc(p.description)}</b>${p.rationale ? `<br><span class="adv-note">${withFactRefs(p.rationale)}</span>` : ''}${p.facts?.length ? `<br>${p.facts.map((f) => withFactRefs(f)).join(' ')}` : ''}</td>
      <td>${p.errors?.length ? '–' : signed(p.slGainPoints)}</td>
      <td>${p.errors?.length ? '–' : signed(100 * p.goodChange) + '%'}</td>
      <td>${p.errors?.length ? '–' : signed(100 * p.scrapChange) + '%'}</td>
      <td>${verdict(p)}</td>
      <td>${p.errors?.length ? '–' : p.strictPass ? '<span class="badge ok">yes</span>' : '<span class="badge no">no</span>'}</td>
      <td>${p.errors?.length ? '–' : eur(p.oneTimeCost)}</td>
      <td>${p.errors?.length ? '–' : eur(p.profitGain)}</td></tr>`).join('')
    : '<tr><td colspan="9" class="adv-empty">No proposals: the advisor found nothing to fix.</td></tr>';

  $('facts').innerHTML = r.facts.map((f) => `<li data-id="${f.id}"><span class="fact-id">${f.id}</span><span class="fact-topic">${esc(f.topic)}</span>${esc(f.text)}</li>`).join('');

  history = [];
  $('chat-log').innerHTML = `<div class="chat-msg system">Ask about “${esc(r.scenario)}”. Answers come only from the facts and simulation results on the left.</div>`;
  const suggestions = ['Why were orders late?', 'Which shift was the worst, and why?', 'Why is this fix recommended?', 'Would a second M3 machine help?', 'What should I tell the next shift?'];
  $('chat-suggest').innerHTML = suggestions.map((q) => `<button type="button">${esc(q)}</button>`).join('');
  $('chat-input').disabled = false; $('chat-send').disabled = false;
}

$('btn-run').addEventListener('click', async () => {
  const body = { scenarioId: $('sel-scenario').value, provider: $('sel-provider').value, promptVersion: $('sel-prompt').value };
  $('btn-run').disabled = true;
  $('run-status').className = 'adv-status';
  $('run-status').textContent = 'Running the simulation (10 seeds), asking the AI and re-simulating its proposals…';
  const t0 = performance.now();
  try {
    const r = await fetch('/api/advisor/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json());
    if (!r.ok) throw new Error(r.error);
    current = r;
    render(r);
    $('run-status').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
  } catch (err) {
    $('run-status').className = 'adv-status error';
    $('run-status').textContent = `Error: ${err.message}${/CLIENT_ID|endpoint/.test(err.message) ? ' (try “Offline rules”, or check .env)' : ''}`;
  } finally {
    $('btn-run').disabled = false;
  }
});

function addMsg(role, html, meta = '') {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = html + (meta ? `<span class="chat-meta">${esc(meta)}</span>` : '');
  $('chat-log').appendChild(div);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
  return div;
}

async function ask(question) {
  if (!current || !question.trim()) return;
  $('chat-error').hidden = true;
  addMsg('user', esc(question));
  $('chat-input').value = '';
  $('chat-send').disabled = true;
  const pending = addMsg('assistant', '…');
  try {
    const r = await fetch('/api/advisor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, history }) }).then((x) => x.json());
    if (!r.ok) throw new Error(r.error);
    pending.innerHTML = withFactRefs(r.answer) + `<span class="chat-meta">${r.model} · ${r.tokens.totalTokens} tokens · ${r.seconds} s${r.unknownFacts?.length ? ` · warning: cites unknown facts ${r.unknownFacts.join(', ')}` : ''}</span>`;
    history.push({ role: 'user', content: question }, { role: 'assistant', content: r.answer });
  } catch (err) {
    pending.remove();
    $('chat-error').textContent = `Error: ${err.message}`;
    $('chat-error').hidden = false;
  } finally {
    $('chat-send').disabled = false;
  }
}
$('chat-form').addEventListener('submit', (e) => { e.preventDefault(); ask($('chat-input').value); });
$('chat-suggest').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });

loadOptions();
