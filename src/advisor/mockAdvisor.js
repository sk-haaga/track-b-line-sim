/**
 * mockAdvisor.js
 * Rule-based stand-in for the language model, with the same chat interface: it reads the fact sheet in the last user
 * message and answers with the advisor's JSON format. Used offline (no API key), in the tests, and as the baseline the
 * AI advisor is evaluated against. Deterministic.
 */

function cite(facts, topic) {
  return facts.filter((f) => f.topic === topic).map((f) => f.id);
}

export function mockChat(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const revising = /None of them was verified/.test(lastUser);
  const factText = messages.find((m) => m.role === 'user')?.content ?? '';
  const facts = [...factText.matchAll(/^(F\d+) \[(\w+)\] (.*)$/gm)].map((m) => ({ id: m[1], topic: m[2], text: m[3] }));
  const has = (topic, re) => facts.some((f) => f.topic === topic && re.test(f.text));

  const shortfall = has('shortfall', /Shortfalls/);
  const outage = facts.some((f) => f.topic === 'outage');
  const early = has('shortfall', /in shifts 1[–,\s:]/);
  const breakdowns = has('machine', /breakdowns \(/);
  const constraint = facts.find((f) => f.topic === 'constraint');
  const cid = (constraint ? /^(M\d+)/.exec(constraint.text)?.[1] : null) ?? 'M3';
  const settings = facts.find((f) => f.topic === 'settings')?.text ?? '';
  const ct = Number(new RegExp(`${cid} (\\d+) min`).exec(settings)?.[1] ?? 13);

  const rootCauses = [];
  if (!shortfall) rootCauses.push({ cause: 'no problem', category: 'none', facts: cite(facts, 'kpis') });
  if (shortfall && early) rootCauses.push({ cause: 'Large orders at the start hit an empty line and empty stock', category: 'demand_peak', facts: [...cite(facts, 'demand'), ...cite(facts, 'shortfall')] });
  if (shortfall && outage) rootCauses.push({ cause: 'Supplier outage stopped the whole line', category: 'outage', facts: cite(facts, 'outage') });
  if (shortfall && breakdowns) rootCauses.push({ cause: 'Machine breakdowns cut capacity', category: 'breakdowns', facts: cite(facts, 'machine') });
  if (shortfall) rootCauses.push({ cause: `${cid} limits the output`, category: 'bottleneck_capacity', facts: cite(facts, 'constraint') });

  let proposals;
  if (!shortfall) proposals = [];
  else if (!revising) {
    proposals = [
      { levers: { initialFinishedGoods: 40 }, rationale: 'A finished-goods buffer covers big orders and lost production.', facts: [...cite(facts, 'shortfall'), ...cite(facts, 'setup')], expectedEffect: 'fewer late orders' },
      { levers: { cycleTime: { [cid]: ct - 1 } }, rationale: `A faster ${cid} raises the line's output.`, facts: cite(facts, 'constraint'), expectedEffect: 'more output, smaller backlog' },
    ];
  } else {
    proposals = [
      { levers: { initialFinishedGoods: 60 }, rationale: 'A larger finished-goods buffer.', facts: cite(facts, 'shortfall'), expectedEffect: 'fewer late orders' },
      { levers: { cycleTime: { [cid]: ct - 1 }, initialFinishedGoods: 30 }, rationale: 'Combine more output with a buffer.', facts: [...cite(facts, 'constraint'), ...cite(facts, 'shortfall')], expectedEffect: 'fewer late orders' },
    ];
  }

  const diagnosis = shortfall
    ? `Orders were late (${cite(facts, 'shortfall').join(', ')}). ${rootCauses.map((c) => c.cause).join('. ')}. Blocked and starved machines around ${cid} are consequences of that constraint.`
    : 'All orders were shipped on time; no change is needed.';
  return JSON.stringify({ diagnosis, rootCauses, proposals });
}
