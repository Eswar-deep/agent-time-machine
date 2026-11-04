import { FlaskConical, Play } from 'lucide-react';
import type { DemoComparison, Health } from '../types';

export default function Playground({ health, comparison, busy, onRun, onInspect }: {
  health: Health | null;
  comparison: DemoComparison | null;
  busy: boolean;
  onRun: () => void;
  onInspect: (id: string) => void;
}) {
  const available = !!health?.meta.available;
  const runs = comparison && [
    { title: 'Deterministic demo', run: comparison.demo, detail: 'Scripted run with a deliberately injected regression.' },
    { title: 'Live Meta agent', run: comparison.meta, detail: 'Fresh agent decisions from the configured Meta model.' },
  ];

  return <section className="panel playground-panel">
    <div className="panel-header">
      <div><h1>Agent playground</h1><p>Run the same coding task in two modes.</p></div>
      <FlaskConical size={18} />
    </div>
    <div className="playground-body">
      <p>Both runs start from the same parser files and use the same protected tests.
        The demo runs locally. The live agent uses your existing Meta API key.</p>
      <button type="button" className="button primary" disabled={busy || !available} onClick={onRun}>
        <Play size={14} /> Compare demo and Meta
      </button>
      {!available && <p className="muted">Live Meta configuration is required for the comparison.
        {health?.meta.blockers.length ? ' ' + health.meta.blockers.join(' ') : ''}</p>}
      {available && <p className="muted">Live run: {health.meta.model} · up to {health.meta.max_calls} provider calls.</p>}
      {runs && <div className="playground-results" aria-label="Comparison results">
        {runs.map(({ title, run, detail }) => <article key={title}>
          <h2>{title}</h2>
          <p className="muted">{detail}</p>
          {run ? <>
            <dl>
              <dt>Scenario checks</dt><dd>{run.outcome.passed}/{run.outcome.total} · {run.outcome.status === 'passed_checks' ? 'Passed' : 'Failed'}</dd>
              <dt>Tool calls</dt><dd>{run.events.filter(event => event.kind === 'tool').length}</dd>
              <dt>Elapsed time</dt><dd>{(run.elapsed_ms / 1000).toFixed(2)} s</dd>
              <dt>Provider calls</dt><dd>{run.usage.calls}</dd>
              <dt>Tokens</dt><dd>{run.usage.total_tokens ?? 'Unknown'}</dd>
              <dt>Cost at configured rates</dt><dd>{run.usage.calls === 0 ? 'No API calls' : run.usage.cost_usd == null ? 'Unknown' : '$' + run.usage.cost_usd.toFixed(5)}</dd>
            </dl>
            {run.error && <p role="status">{run.error}</p>}
            <button className="button secondary" onClick={() => onInspect(run.id)} disabled={busy}>Inspect run and checkpoints</button>
          </> : <p>{busy ? 'Waiting for the live run…' : 'Live run unavailable.'}</p>}
        </article>)}
      </div>}
    </div>
  </section>;
}
