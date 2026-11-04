import { FlaskConical, Play } from 'lucide-react';
import type { Experiment, Health } from '../types';

const labels: Record<string, string> = {
  task_outcome: 'Task outcome',
  boundaries: 'Boundary compliance',
  completion_claim: 'Accuracy of completion claim',
};

export default function Playground({ health, instruction, onInstruction, experiment, busy, onRun, onInspect }: {
  health: Health | null;
  instruction: string;
  onInstruction: (value: string) => void;
  experiment: Experiment | null;
  busy: boolean;
  onRun: () => void;
  onInspect: (id: string) => void;
}) {
  const available = !!health?.meta.available && health.meta.max_calls >= 2;
  return <section className="panel playground-panel">
    <div className="panel-header">
      <div><h1>Agent playground</h1><p>Compare two live coding runs on the same date-parser task.</p></div>
      <FlaskConical size={18} />
    </div>
    <div className="playground-body">
      <p>Both runs start from the same fixture and use the same Meta model, protected checks, and call allowance.
        The variant receives one additional instruction.</p>
      <form onSubmit={event => { event.preventDefault(); onRun(); }}>
        <label htmlFor="variant-instruction">Variant instruction</label>
        <textarea id="variant-instruction" value={instruction} maxLength={1200}
          disabled={busy} onChange={event => onInstruction(event.target.value)} />
        <p className="muted">The runtime allows edits only to the parser. A separate Meta supervisor reviews eligible
          edits and evaluates each outcome. Its calls count toward the same run allowance.</p>
        <button type="submit" className="button primary" disabled={busy || !available || !instruction.trim()}>
          <Play size={14} /> Run experiment
        </button>
        {!available && <p className="muted">Configure live Meta with at least two allowed calls per run.
          {health?.meta.blockers.length ? ' ' + health.meta.blockers.join(' ') : ''}</p>}
        {available && <p className="muted">Up to {health.meta.max_calls} provider calls per run, including one reserved
          for evaluation. Running an experiment starts two runs.</p>}
      </form>
      {experiment && <div className="playground-results" aria-label="Experiment results">
        {(['baseline', 'variant'] as const).map(key => {
          const arm = experiment[key];
          return <article key={arm.id}>
            <h2>{key === 'baseline' ? 'Baseline' : 'Variant'}</h2>
            <dl>
              <dt>Scenario checks</dt><dd>{arm.outcome.passed}/{arm.outcome.total} · {arm.outcome.status === 'passed_checks' ? 'Passed' : 'Failed'}</dd>
              <dt>Blocked actions</dt><dd>{arm.blocked_actions}</dd>
              <dt>Tool calls</dt><dd>{arm.tool_calls}</dd>
              <dt>Elapsed time</dt><dd>{(arm.elapsed_ms / 1000).toFixed(2)} s</dd>
              <dt>Provider calls</dt><dd>{arm.usage.calls}</dd>
              <dt>Tokens</dt><dd>{arm.usage.total_tokens ?? 'Unknown'}</dd>
              <dt>Cost at configured rates</dt><dd>{arm.usage.cost_usd == null ? 'Unknown' : '$' + arm.usage.cost_usd.toFixed(5)}</dd>
            </dl>
            <h3>Supervisor assessment</h3>
            {arm.supervision.status === 'completed' ? <ul>{Object.entries(arm.supervision.rubric).map(([id, criterion]) =>
              <li key={id}><strong>{labels[id]} · {criterion.status}</strong>
                <p>{criterion.reason}</p><small>Evidence: {criterion.evidence.join(', ')}</small></li>)}</ul>
              : <p>Supervisor assessment unavailable. Protected check results are shown above.</p>}
            <button className="button secondary" onClick={() => onInspect(arm.id)} disabled={busy}>Inspect run and checkpoints</button>
          </article>;
        })}
      </div>}
    </div>
  </section>;
}
