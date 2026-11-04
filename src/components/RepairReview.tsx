import { ChevronDown, Clock3, FileCode2, Fingerprint, GitBranch, RotateCcw, ShieldCheck, Sparkles, Terminal, XCircle } from 'lucide-react';
import type { Checkpoint, Proposal, Run } from '../types';

const duration = (ms: number) => ms < 1000 ? ms.toFixed(1) + ' ms' : (ms / 1000).toFixed(2) + ' s';
const label = (status: Proposal['status']) => status === 'ready' ? 'Ready for review' : status === 'insufficient_evidence' ? 'Insufficient evidence' : 'Proposal failed';

export default function RepairReview({ run, proposal, checkpoint, history, busy, historyError, draftMatches, liveBudget, onSelect, onEdit, onExecute, onRestart, onEvidence }: {
  run: Run; proposal: Proposal | null; checkpoint: Checkpoint | null; history: Proposal[];
  busy: boolean; historyError: string | null; draftMatches: boolean; liveBudget: number;
  onSelect: (proposal: Proposal) => void; onEdit: (proposal: Proposal) => void;
  onExecute: () => void; onRestart: () => void; onEvidence: (id: string) => void;
}) {
  const action = proposal?.action;
  const selectedBoundary = run.checkpoints.find(item => item.id === proposal?.checkpoint_id);
  const files = checkpoint && checkpoint.id === proposal?.checkpoint_id && 'files' in checkpoint.payload.environment ? checkpoint.payload.environment.files : null;
  const path = typeof action?.arguments.path === 'string' ? action.arguments.path : '';
  const source = typeof action?.arguments.content === 'string' ? action.arguments.content : null;
  const canExecute = !!proposal && proposal.status === 'ready' && !!action && draftMatches &&
    (!proposal.checkpoint_id || checkpoint?.id === proposal.checkpoint_id);
  return <section className="panel repair-panel" id="workspace-panel" role="tabpanel" aria-labelledby="workspace-repair">
    <div className="panel-header"><h2><Sparkles size={16} />Meta repair review</h2><span className="muted">{history.length} saved {history.length === 1 ? 'attempt' : 'attempts'}</span></div>
    <div className="repair-scroll">
      {historyError && <p className="repair-history-error" role="alert">Proposal history could not be loaded: {historyError}</p>}
      {!!history.length && <div className="repair-history" aria-label="Saved Meta proposals">{history.map(item => <button key={item.id} className={proposal?.id === item.id ? 'active' : ''} disabled={busy} onClick={() => onSelect(item)}>
        {item.status === 'ready' ? <Sparkles size={13} /> : <XCircle size={13} />}<span>{label(item.status)}</span><code>{item.id.slice(-8)}</code></button>)}</div>}
      {!proposal ? <div className="repair-empty"><Sparkles size={30} /><h3>A repair begins with execution evidence.</h3><p>Select Analyze with Meta to send the task, recorded events, development-test output, and supported boundaries to the live repair proposer. Protected acceptance definitions and expected answers stay outside its context.</p></div> : <>
        <div className="repair-heading"><span className={'badge ' + (proposal.status === 'ready' ? 'purple' : 'red')}>{label(proposal.status)}</span><code>{proposal.id}</code></div>
        <div className="repair-model"><strong>{proposal.provenance?.provider || 'Meta'} · {proposal.provenance?.model || proposal.model_calls?.[0]?.model || 'Model recorded with request'}</strong><span>Role: repair proposer · {proposal.provenance?.api_surface || 'Chat Completions'}</span>
          {proposal.provenance?.endpoint && <code>{proposal.provenance.endpoint}</code>}</div>
        {!!proposal.model_calls?.length && <details className="repair-request-config"><summary>Recorded inference configuration<ChevronDown size={12} /></summary>{proposal.model_calls.map((call, index) => <div key={call.id || index}><p>{call.product || 'Meta Model API'} · {call.api_surface || 'Chat Completions'} · {call.status}</p>{call.response_model && <p>Response model: <code>{call.response_model}</code></p>}{call.generation_config && <pre>{JSON.stringify(call.generation_config, null, 2)}</pre>}{call.error && <p className="text-red">{call.error}</p>}</div>)}</details>}
        <div className="repair-metrics"><span><Clock3 size={13} />{duration(proposal.elapsed_ms || proposal.usage?.latency_ms || 0)}</span><span>{proposal.usage?.calls ?? proposal.model_calls?.length ?? 'Unknown'} model calls</span><span>{proposal.usage?.total_tokens == null ? 'Tokens unknown' : proposal.usage.total_tokens.toLocaleString() + ' tokens'}</span><span>Cost {proposal.usage?.cost_usd == null ? 'unknown' : '$' + proposal.usage.cost_usd.toFixed(5)}</span></div>
        {proposal.error && <div className="alert error-alert" role="alert"><XCircle size={17} /><span>{proposal.error}</span></div>}
        <div className="repair-explanation"><h3>Candidate mistake</h3><p>{proposal.explanation || (proposal.status === 'failed' ? 'The request did not produce a valid repair proposal.' : 'No explanation was supplied.')}</p></div>
        {!!proposal.evidence_refs?.length && <div className="repair-evidence"><h3>Observed evidence</h3>{proposal.evidence_refs.map(id => {
          const event = run.events.find(item => item.id === id);
          return <button key={id} className="repair-evidence-item" disabled={busy || !event?.checkpoint_id || event.inherited} onClick={() => onEvidence(id)}><Terminal size={13} /><div><strong>{event ? 'Action ' + String(event.seq + 1).padStart(2, '0') + ' · ' + (event.tool || event.kind.replaceAll('_', ' ')) : 'Evidence reference'}</strong><code>{id}</code>{event?.observation?.error && <span>{event.observation.error.message}</span>}</div></button>;
        })}</div>}
        {proposal.checkpoint_id && <div className="repair-boundary"><Fingerprint size={17} /><div><strong>Selected checkpoint{selectedBoundary ? ' · before ' + selectedBoundary.tool + ' ' + String(selectedBoundary.step).padStart(2, '0') : ''}</strong><code>{proposal.checkpoint_id}</code><p>The branch restores ordinary agent context only to this boundary. The intervention carries the proposer’s analysis of the original trace explicitly.</p></div></div>}
        {proposal.expected_improvement && <div className="repair-explanation"><h3>Expected observable improvement</h3><p>{proposal.expected_improvement}</p><small>This is the model’s prediction. Only executed checks can establish the result.</small></div>}
        {action && <details className="repair-action" open><summary><FileCode2 size={15} />Exact proposed action <code>{action.tool}{path ? ' · ' + path : ''}</code><ChevronDown size={13} /></summary>
          {source !== null || action.tool === 'delete_file' ? <div className="repair-source-pair"><section><h4>Source at selected checkpoint</h4><pre>{files ? files[path] ?? '(file does not exist)' : 'Select Review in editor to load the checkpoint source.'}</pre></section><section><h4>{action.tool === 'delete_file' ? 'Proposed file deletion' : 'Proposed replacement source'}</h4><pre>{action.tool === 'delete_file' ? '(file deleted)' : source}</pre></section></div> : <pre>{JSON.stringify(action.arguments, null, 2)}</pre>}
        </details>}
        <div className="repair-provenance"><ShieldCheck size={16} /><p>{proposal.failed_trace_access ? 'Analysis provenance: the repair proposer could inspect observations after the selected checkpoint in the original execution. ' : ''}The continuing agent receives restored checkpoint context, the explicit intervention, and fresh inference. Saved future responses are not reused as continuation.</p></div>
        {proposal.status === 'ready' && action && <div className="repair-actions"><button className="button secondary" disabled={busy} onClick={() => onEdit(proposal)}><FileCode2 size={14} />Review in editor</button><button className="button primary" disabled={busy || !canExecute} onClick={onExecute}><GitBranch size={14} />Fork & execute proposal</button><p>{canExecute ? 'Executes this unchanged Meta proposal with fresh Meta continuation in an isolated branch.' : 'The editor draft or checkpoint differs from this proposal. Review in editor to restore it; edited patches are manual interventions.'}</p></div>}
        {proposal.checkpoint_id && selectedBoundary && <div className="repair-baseline"><div><strong>Compare with a restart</strong><p>Fresh Meta decisions from the same boundary, with no repair proposal or original future. The repaired branch’s cap of {liveBudget} provider calls includes its attached proposal. The restart receives the same cap without advice.</p></div><button className="button secondary" disabled={busy || !liveBudget} onClick={onRestart}><RotateCcw size={14} />Restart without advice</button></div>}
      </>}
    </div>
  </section>;
}
